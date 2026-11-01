import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { matches, normalize, rank } from './search.js';
import { tableRows, tidy } from './wiki-pages.js';

const origin = 'https://divinityoriginalsin2.wiki.fextralife.com';

export const fextraProvider = { id: 'fextralife', name: 'Fextralife DOS2 wiki' };

/** Permission is limited to this DOS2 wiki; reject APIs, actions, namespaces and foreign hosts. */
export function fextraUrl(input) {
    try {
        const url = new URL(input, origin); const title = decodeURIComponent(url.pathname.slice(1)).replaceAll('+', ' ').replaceAll('_', ' ').trim();

        if (url.origin !== origin || url.username || url.password || url.search || !title || /[\x00-\x1F#/:?\\]/.test(title) || /^(?:index\.php|robots\.txt)$/i.test(title)) {
            return null;
        }

        return `${origin}/${encodeURIComponent(title.replaceAll(' ', '_'))}`;
    } catch {
        return null;
    }
}

const entry = (url) => ({ title: decodeURIComponent(new URL(url).pathname.slice(1)).replaceAll('_', ' '), url, provider: fextraProvider.id, source: fextraProvider.name });

export function parseFextra(html, requested, retrievedAt = new Date().toISOString()) {
    const $ = load(html); const url = fextraUrl($('link[rel="canonical"]').attr('href') || '');
    const root = $('#mw-content-text > .mw-parser-output').first().clone();

    if (!url || url !== fextraUrl(requested) || !root.length || !tidy($('h1').text()).includes(entry(url).title)) {
        throw new Error('Unexpected Fextralife article identity or markup.');
    }

    const title = entry(url).title;

    if (/\bclassic\b/i.test(title)) {
        throw new Error('Classic-only articles are excluded.');
    }

    root.find('script,style,nav,footer,.navbox,.navigation,.toc,#toc,.mw-editsection,.wiki-edit-section,.noprint,.gallery,.comments,.comment,.fex-main-menu,.valnet-category-cloud,[hidden],[aria-hidden="true"]').remove();
    const categories = JSON.parse(html.match(/"wgCategories"\s*:\s*(\[[^\]]*])/)?.[1] || '[]');
    const related = new Map();

    root.find('a[href]').each((_, node) => {
        const link = fextraUrl($(node).attr('href'));

        if (link && link !== url && !link.endsWith('/sitemap.xml')) {
            related.set(link, entry(link));
        }
    });
    const summary = tidy(root.find('p').filter((_, p) => tidy($(p).text()).length > 30).first().text());
    const sections = []; let current = { title: 'Overview', text: '', headings: [] }; let excluded = null; const headings = [];
    const flush = () => {
        if (excluded === null && tidy(current.text)) {
            sections.push({ ...current, text: tidy(current.text), evidence: 'Fextralife source excerpt; not independently DE-verified' });
        }
    };

    const walk = (node) => {
        const element = $(node); const tag = node.tagName || '';

        if (/^h[1-6]$/.test(tag)) {
            flush(); const depth = Number(tag.slice(1)); const heading = tidy(element.text());

            while (headings.length && headings.at(-1).depth >= depth) {
                headings.pop();
            }

            headings.push({ depth, title: heading });

            if (excluded !== null && depth <= excluded) {
                excluded = null;
            }

            if (/\bclassic\b/i.test(heading) && !/definitive/i.test(heading)) {
                excluded = depth;
            }

            current = { title: heading || 'Details', text: '', headings: headings.map((h) => h.title) };
        } else if (tag === 'table') {
            current.text += `${tableRows($, element).join('\n')}\n\n`;
        } else if (['p', 'ul', 'ol', 'dl', 'pre', 'blockquote'].includes(tag)) {
            const copy = element.clone();

            copy.find('br').replaceWith('\n'); copy.find('li,dt,dd').append('\n');
            current.text += `${tidy(copy.text())}\n\n`;
        } else {
            element.children().each((_, child) => walk(child));
        }
    };

    root.children().each((_, node) => walk(node)); flush();

    if (!sections.length) {
        throw new Error('No useful Fextralife content.');
    }

    return { ...entry(url), sourceCategories: categories, entityType: categories.some((c) => /skills/i.test(c)) ? 'skill' : null, fields: { summary }, sections, related: [...related.values()], retrievedAt, revision: html.match(/"wgRevisionId"\s*:\s*(\d+)/)?.[1] || '', parserVersion: 'fextra-1', contentHash: createHash('sha256').update(html).digest('hex'), license: 'Fextralife contributors; locally cached under user-confirmed permission. No redistribution grant asserted.', edition: 'DOS2 DE target; Fextralife may contain Classic-era details. Source claims are not independently DE-verified.' };
}

/** Store each retrieved page locally without expiry or automatic revalidation. Refresh is explicit. */
export class Fextralife {
    constructor(store, http) {
        this.store = store; this.http = http;
    }

    async catalog() {
        return this.store.cached('offline:fextra:catalog:v1', Infinity, async () => {
            const $ = load(await this.http.text(`${origin}/sitemap.xml`), { xml: true }); const entries = new Map();

            $('urlset > url > loc').each((_, node) => {
                const url = fextraUrl($(node).text());

                if (url && !url.endsWith('/sitemap.xml')) {
                    entries.set(url, entry(url));
                }
            });

            if (!entries.size || entries.size > 20_000) {
                throw new Error('Unexpected Fextralife sitemap.');
            }

            return [...entries.values()];
        });
    }

    async search(query) {
        if (typeof query !== 'string' || !normalize(query) || query.length > 180) {
            throw new Error('Use a query between 1 and 180 characters.');
        }

        const catalog = await this.catalog();

        return { value: rank(query, catalog.value.filter((e) => matches(query, e.title))).slice(0, 25), stale: catalog.stale };
    }

    detail(input, refresh = false) {
        const url = fextraUrl(input.url);

        if (!url || url.endsWith('/sitemap.xml')) {
            throw new Error('Invalid Fextralife article URL.');
        }

        return this.store.cached(`offline:fextra:article:v1:${url}`, Infinity, async () => {
            const rawHtml = await this.http.text(url);

            return { ...parseFextra(rawHtml, url), rawHtml };
        }, refresh);
    }
}
