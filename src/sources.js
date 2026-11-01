import { load } from 'cheerio';
import { PARSER_VERSION } from './domain.js';
import { expand, rank } from './search.js';

export const providers = [
    { id: 'fandom', host: 'divinity.fandom.com', name: 'Divinity Wiki (Fandom)', article: '/wiki/' },
    { id: 'independent', host: 'divinitywiki.com', name: 'Divinity Wiki (divinitywiki.com)', article: '/index.php/' },
];
const tidy = (text) => text.replaceAll(/\[\s*edit\s*]/gi, '').replaceAll(/[\t \u00A0]+/g, ' ').replaceAll(/\n\s*\n\s*\n/g, '\n\n').trim();

export const articleUrl = (provider, title) => `https://${provider.host}${provider.article}${encodeURIComponent(title.replaceAll(' ', '_'))}`;
/** Only canonical, same-provider article links become navigable related entries. */
export function relatedLink(provider, href, title) {
    if (!href || !title) {
        return null;
    }

    try {
        const url = new URL(href, `https://${provider.host}`);

        if (url.protocol !== 'https:' || url.host !== provider.host || !url.pathname.startsWith(provider.article) || url.search) {
            return null;
        }

        const name = decodeURIComponent(url.pathname.slice(provider.article.length)).replaceAll('_', ' ');

        if (!name || name.includes(':') || name === 'Main Page') {
            return null;
        }

        return { title: name, url: articleUrl(provider, name) };
    } catch {
        return null;
    }
}

/**
 * Parse ordered paragraphs, lists and every table cell, retaining evidence rather than inferred recipes.
 *
 * @param {object} provider - Fixed source descriptor.
 * @param {object} parsed - MediaWiki parse response.
 * @returns {import('./domain.js').Entry} Complete private article record.
 */
export function parseArticle(provider, parsed) {
    const page = parsed.parse;

    if (!page?.title || typeof page.text?.['*'] !== 'string') {
        throw new Error('Unexpected source article markup.');
    }

    const $ = load(page.text['*']);
    const cats = (page.categories || []).map((c) => c['*']);
    const metadata = [page.title, ...cats, ...$('[data-source]').map((_, e) => $(e).attr('data-source')).get()].join(' ').replaceAll('_', ' ');
    const hasDos2 = /original sin (?:2|ii)\b|dos2/i.test(metadata);
    const otherGame = /original sin(?! (?:2|ii)\b)|divine divinity|beyond divinity|dragon commander/i.test(cats.join(' ').replaceAll('_', ' '));

    if (/\bmods?\b/i.test(cats.join(' ')) || (otherGame && !hasDos2)) {
        throw new Error('Entry belongs to another game or a mod.');
    }

    let edition = hasDos2 ? (/dos2de|definitive edition/i.test(metadata) ? 'DOS2; Definitive Edition fields present; other sections may mix editions' : 'DOS2; edition applicability unknown') : 'Game and edition applicability unverified; may concern another Divinity game';

    if (/classic/i.test(metadata)) {
        edition = `Classic content present; Definitive Edition applicability unverified. ${edition}`;
    }

    if (otherGame && hasDos2) {
        edition = `Mixed-game article; verify each section. ${edition}`;
    }

    const related = new Map();

    $('a[href]').each((_, e) => {
        const item = relatedLink(provider, $(e).attr('href'), $(e).text());

        if (item && item.title !== page.title) {
            related.set(item.url, item);
        }
    });
    $('script,style,nav,footer,.navbox,.navigation,.toc,#toc,.mw-editsection,.wds-tabs__wrapper,.references,.reflist,.gallery,.printfooter,.catlinks,.noprint').remove();
    // Infoboxes remain private: even apparently mechanical fields may contain acquisition prose.
    const sections = [];
    let current = { title: 'Overview', text: '' };
    const append = (text) => {
        if (tidy(text)) {
            current.text += `${tidy(text)}\n\n`;
        }
    };

    const walk = (element) => {
        const node = $(element);

        if (/^h[1-6]$/.test(element.tagName || '') && !node.closest('aside').length) {
            if (tidy(current.text)) {
                sections.push({ ...current, text: tidy(current.text) });
            }

            current = { title: tidy(node.text()) || 'Details', text: '' };

            return;
        }

        if (element.tagName === 'table') {
            for (const row of tableRows($, node)) {
                append(row);
            }

            return;
        }

        if (element.tagName === 'aside') {
            node.find('.pi-data').each((_, data) => append(`${$(data).find('.pi-data-label').text()}: ${$(data).find('.pi-data-value').text()}`));
            node.find('.pi-smart-data-value').each((_, value) => {
                const key = $(value).attr('data-source');

                append(`${node.find('.pi-smart-data-label').filter((__, label) => $(label).attr('data-source') === key).text()}: ${$(value).text()}`);
            });

            return;
        }

        if (['p', 'li', 'dt', 'dd', 'pre', 'blockquote'].includes(element.tagName)) {
            append(node.text());

            return;
        }

        node.children().each((_, child) => walk(child));
    };

    $('body').children().each((_, e) => walk(e));

    if (tidy(current.text)) {
        sections.push({ ...current, text: tidy(current.text) });
    }

    if (!sections.length) {
        throw new Error('No useful article sections found.');
    }

    for (const section of sections) {
        if (/gift bag|herb gardens|mods? (?:must|enabled|required)/i.test(section.text)) {
            section.text = `GAMEPLAY-CHANGING CONTENT: this section includes an optional Gift Bag/mod requirement; it is not a base-game recipe.\n\n${section.text}`;
        }
    }

    if (!sections.some((s) => /craft|recipe/i.test(s.title))) {
        sections.push({ title: 'Recipe availability', text: 'No recipe found in this source. This does not establish that the item cannot be crafted. Acquisition and current merchant stock remain unknown unless explicitly established in the source.' });
    }

    if (!sections.length) {
        throw new Error('No useful article sections found.');
    }

    return { title: page.title, url: articleUrl(provider, page.title), source: provider.name, provider: provider.id, retrievedAt: new Date().toISOString(), parserVersion: PARSER_VERSION, edition, categories: cats, sections, related: [...related.values()], recipeStatus: 'Recipes are shown only as source rows/passages; no recipe found in this source if no explicit recipe is present. Acquisition and merchant stock are unknown unless explicitly stated.' };
}

/** MediaWiki adapter: discovery and detail use the public API, never browser bypasses. */
export class Wiki {
    constructor(http, provider) {
        this.http = http; this.provider = provider;
    }

    async api(params) {
        return this.http.json(`https://${this.provider.host}/api.php?${new URLSearchParams({ format: 'json', ...params })}`);
    }

    async search(query) {
        const data = await this.api({ action: 'query', generator: 'search', gsrsearch: query, gsrnamespace: '0', gsrlimit: '25', prop: 'categories', cllimit: 'max' });

        if (!data.query && !Object.hasOwn(data, 'batchcomplete')) {
            throw new Error('Unexpected source search response.');
        }

        return Object.values(data.query?.pages || {}).filter((p) => p.ns === 0 && p.title).map((p) => ({ title: p.title, url: articleUrl(this.provider, p.title), provider: this.provider.id, source: this.provider.name, categories: (p.categories || []).map((c) => c.title) }));
    }

    async fetch(title) {
        return parseArticle(this.provider, await this.api({ action: 'parse', page: title, redirects: '1', prop: 'text|categories' }));
    }
}
/** Shared deterministic search/detail pipeline, including source fallback and persistent cache. */
export class Lookup {
    constructor(store, http, cfg) {
        this.store = store; this.cfg = cfg; this.adapters = providers.map((p) => new Wiki(http, p));
    }

    async search(query, category = 'all', refresh = false) {
        if (typeof query !== 'string' || !query.trim() || query.length > 180) {
            throw new Error('Use a query between 1 and 180 characters.');
        }

        return this.store.cached(`search:v${PARSER_VERSION}:${category}:${expand(query)}`, this.cfg.cacheMs, async () => {
            const errors = [];

            for (const adapter of this.adapters) {
                try {
                    const text = expand(query);
                    let entries = await adapter.search(text);

                    if (!entries.length && text.split(' ').length > 1) {
                        entries = await adapter.search(text.split(' ').map((t) => `${t}~`).join(' '));
                    }

                    if (entries.length) {
                        return rank(query, entries, category);
                    }
                } catch (error) {
                    errors.push(error);
                }
            }

            if (errors.length) {
                throw new Error('Sources unavailable or returned unexpected search markup. Try again later.');
            }

            return [];
        }, refresh);
    }

    async detail(entry, refresh = false) {
        const adapter = this.adapters.find((a) => a.provider.id === entry.provider);

        if (!adapter || articleUrl(adapter.provider, entry.title) !== entry.url) {
            throw new Error('Invalid source entry.');
        }

        return this.store.cached(`page:v${PARSER_VERSION}:${entry.url}`, this.cfg.cacheMs, () => adapter.fetch(entry.title), refresh);
    }
}

/** Expand row spans so alternative ingredients keep their recipe output and other ingredients. */
function tableRows($, table) {
    const spans = [];
    const rows = [];

    table.find('tr').each((_, tr) => {
        if ($(tr).closest('table')[0] !== table[0]) {
            return;
        }

        const values = []; let column = 0;
        const carry = () => {
            while (spans[column]?.left > 0) {
                values[column] = spans[column].text; spans[column].left--; column++;
            }
        };

        $(tr).children('th,td').each((__, cell) => {
            carry();
            const copy = $(cell).clone();

            copy.find('br').replaceWith(' / ');
            const text = tidy(copy.text());
            const width = Math.min(30, Math.max(1, Number($(cell).attr('colspan')) || 1));
            const height = Math.min(100, Math.max(1, Number($(cell).attr('rowspan')) || 1));

            for (let i = 0; i < width; i++) {
                values[column] = text; spans[column] = { text, left: height - 1 }; column++;
            }
        });
        carry(); rows.push(values.join(' | '));
    });

    return rows;
}
