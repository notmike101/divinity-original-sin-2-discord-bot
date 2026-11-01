import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { PARSER_VERSION } from './domain.js';

export const provider = { id: 'dos2wiki', host: 'dos2.wiki', name: 'dos2.wiki', article: '/wiki/' };
export const articleUrl = (_, title) => `https://dos2.wiki/wiki/${encodeURIComponent(title.replaceAll(' ', '_'))}`;
export const tidy = (text) => text.replaceAll(/[\t \u00A0\u202F]+/g, ' ').replaceAll(/\n\s*\n\s*\n/g, '\n\n').trim();
/** Restrict navigation to ordinary canonical articles; no API, actions, search, namespaces or external hosts. */
export function relatedLink(_, href, text) {
    if (!href || !text?.trim()) {
        return null;
    }

    try {
        const url = new URL(href, 'https://dos2.wiki');
        const title = decodeURIComponent(url.pathname.slice(6)).replaceAll('_', ' ');

        if (url.origin !== 'https://dos2.wiki' || !url.pathname.startsWith('/wiki/') || url.search || /[\x00-\x1F:]/.test(title) || !title || title === 'Main Page') {
            return null;
        }

        return { title, url: articleUrl(provider, title), provider: provider.id, source: provider.name };
    } catch {
        return null;
    }
}

/** Validate identity before accepting source HTML, and isolate article content from site chrome. */
export function document(html) {
    const $ = load(html);
    const title = tidy($('#firstHeading').text());
    const canonical = $('link[rel="canonical"]').attr('href');
    const identity = relatedLink(provider, canonical, title);
    const root = $('#mw-content-text .mw-parser-output').first();
    const revision = html.match(/"wgRevisionId":(\d+)/)?.[1];

    if (!identity || identity.title !== title || !root.length || !revision || $('.noarticletext').length) {
        throw new Error('Unexpected dos2.wiki article identity or markup.');
    }

    root.find('script,style,nav,footer,.navbox,.navigation,.toc,#toc,.mw-editsection,.stat-hidden,[hidden],[aria-hidden="true"],.ambox,.mbox,.reflist,.references,.printfooter,.noprint,.gallery').remove();

    return { $, root, title, url: identity.url, revision };
}

export function links($, root) {
    const found = new Map();

    root.find('a[href]').not('.new').each((_, node) => {
        const link = relatedLink(provider, $(node).attr('href'), $(node).text() || $(node).attr('title'));

        if (link) {
            const table = $(node).closest('table');
            const headings = table.find('tr').first().children('th').text();
            const recipeRole = /Product/.test(headings) && /Ingredients/.test(headings);

            if (recipeRole) {
                link.entityType = 'ingredient';
            }

            found.set(link.url, link);
        }
    });

    return [...found.values()];
}

/** Preserve every table cell and carry row-span ingredient alternatives forward. */
export function tableRows($, table) {
    const spans = []; const rows = [];

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
            carry(); const copy = $(cell).clone();

            copy.find('br').replaceWith(' / ');
            const text = tidy(copy.text());
            const width = Math.min(30, Math.max(1, Number($(cell).attr('colspan')) || 1));
            const height = Math.min(100, Math.max(1, Number($(cell).attr('rowspan')) || 1));

            values[column] = text; spans[column] = { text, left: height - 1 }; column++;

            // A merged header describes one field; don't duplicate it into fictitious ingredient columns.
            for (let i = 1; i < width; i++) {
                values[column] = ''; column++;
            }
        });
        carry(); while (values.at(-1) === '') {
            values.pop();
        }

        rows.push(values.join(' | '));
    });

    return rows;
}

/**
 * Extract complete source sections without asserting unverified prose is DE-correct.
 *
 * @param {string} html - Ordinary article HTML.
 * @param {string} retrievedAt - ISO source retrieval timestamp.
 * @returns {import('./domain.js').Entry} Attributed source record.
 */
export function parseArticle(html, retrievedAt = new Date().toISOString()) {
    const { $, root, title, url, revision } = document(html);
    const related = links($, root).filter((link) => link.title !== title);
    const box = root.find('.dos2-infobox-container').first();
    const sourceCategories = $('#catlinks .mw-normal-catlinks a').map((_, node) => $(node).text().trim()).get().filter(Boolean);
    const entityType = box.hasClass('skill-infobox') ? 'skill' : box.hasClass('skillbook-infobox') ? 'skillbook' : box.hasClass('scroll-infobox') ? 'scroll' : null;
    const fields = {};
    const footer = box.find('.footer-stats').last();

    for (const [key, label] of Object.entries({ weight: 'Weight', value: 'Value' })) {
        const value = tidy(footer.children('span').filter((_, e) => $(e).find(`a[title="${label}"]`).length).text());

        if (value) {
            fields[key] = value;
        }
    }

    const level = tidy(box.find('.js-scalable-level .stat-value').first().text());

    if (/^\d+$/.test(level)) {
        fields.level = level;
    }

    const rarity = box.find('.footer-rarity').map((_, e) => tidy($(e).text())).get().find((text) => /^(?:Common|Uncommon|Rare|Epic|Legendary|Divine|Unique)$/.test(text));

    if (rarity) {
        fields.rarity = rarity;
    }

    for (const [key, label] of Object.entries({ physicalArmour: 'Physical Armour', magicArmour: 'Magic Armour' })) {
        const value = tidy(box.find('.armour-line').text()).match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${label}`));

        if (value) {
            fields[key] = value[1];
        }
    }

    const type = tidy(box.find('.weapon-type-line').first().text());

    fields.type = entityType ? entityType[0].toUpperCase() + entityType.slice(1) : type;
    fields.summary = tidy(box.find('.infobox-skill-description-section,.infobox-description-section').first().text());
    fields.requirements = box.find('.stat-line').map((_, e) => tidy($(e).text())).get().filter((t) => t.startsWith('Requires ')).join('; ');
    const icon = box.find('.infobox-header-icon img').first().attr('src');
    let image;

    if (icon) {
        try {
            const u = new URL(icon);

            if (u.origin === 'https://cdn.dos2.wiki' && u.pathname.startsWith('/w/images/') && !u.search) {
                image = u.href;
            }
        } catch {
            image = undefined;
        }
    }

    const recipes = []; const usedIn = [];

    if (box.hasClass('skill-infobox')) {
        fields.actionPoints = box.find('.infobox-resource-container a[title="Action Point"]').length;
        fields.sourcePoints = box.find('.infobox-resource-container a[title="Source Point"]').length;

        for (const [key, pattern] of Object.entries({ cooldown: /Cooldown (\d+) turn/, range: /(\d+)m Range/, memory: /(\d+) Memory Slot/ })) {
            const match = tidy(box.text()).match(pattern);

            if (match) {
                fields[key] = Number(match[1]);
            }
        }

        fields.skillId = tidy(box.text()).match(/UID:\s*(\w+)/)?.[1];
    }

    if (/\bclassic\b/i.test(title)) {
        throw new Error('Classic-only articles are excluded from the DE source pipeline.');
    }

    const sections = [];
    const headings = [];
    let current = { title: 'Overview', text: '' };
    let optional = /gift bag|herb gardens|crafter.s kit/i.test(title);
    let excludedDepth = null;
    const append = (text) => {
        if (tidy(text)) {
            current.text += `${tidy(text)}\n\n`;
        }
    };

    if (box.length) {
        const rows = box.find('.stat-line,.infobox-skill-description-section,.infobox-description-section,.footer-rarity,.footer-stats,.infobox-grants-skill-section,.infobox-skill-footer').map((_, e) => tidy($(e).text())).get().filter(Boolean);

        if (Object.hasOwn(fields, 'actionPoints')) {
            rows.unshift(`Action points: ${fields.actionPoints}; Source points: ${fields.sourcePoints}`);
        }

        append(rows.join('\n')); box.remove();
    }

    const flush = () => {
        if (excludedDepth === null && tidy(current.text)) {
            sections.push({ ...current, text: (optional ? 'OPTIONAL GIFT BAG / MOD CONTENT — excluded from unmodified DE verification.\n\n' : '') + tidy(current.text), evidence: 'dos2.wiki source excerpt; not independently DE-verified' });
        }
    };

    const walk = (element) => {
        const node = $(element);

        if (/^h[1-6]$/.test(element.tagName || '')) {
            flush(); const heading = tidy(node.text());
            const depth = Number(element.tagName.slice(1));

            while (headings.length && headings.at(-1).depth >= depth) {
                headings.pop();
            }

            headings.push({ depth, title: heading });

            if (excludedDepth !== null && depth <= excludedDepth) {
                excludedDepth = null;
            }

            if (/\bclassic\b/i.test(heading) && !/definitive/i.test(heading)) {
                excludedDepth = depth;
            }

            if (/^h[12]$/.test(element.tagName)) {
                optional = /gift bag|herb gardens|crafter.s kit|mods?\b/i.test(heading);
            }

            optional ||= /gift bag|herb gardens|crafter.s kit/i.test(heading);
            current = { title: heading || 'Details', text: '', headings: headings.map((h) => h.title) };

            return;
        }

        if (element.tagName === 'table') {
            const rows = tableRows($, node);

            if (excludedDepth === null && /^Product \| Ingredients/.test(rows[0] || '')) {
                const target = /used in/i.test(current.title) ? usedIn : recipes;

                for (const row of rows.slice(1)) {
                    const cells = row.split('|').map((t) => t.trim());

                    if (cells.slice(1).some(Boolean)) {
                        target.push({ output: cells[0] || null, ingredients: cells.slice(1).filter(Boolean), conditions: (optional ? 'OPTIONAL GIFT BAG / MOD CONTENT. ' : '') + tidy(current.text), headings: [...headings.map((h) => h.title)] });
                    }
                }
            }

            for (const row of rows) {
                append(row);
            }

            return;
        }

        if (['p', 'li', 'dt', 'dd', 'pre', 'blockquote'].includes(element.tagName)) {
            append(node.text());

            return;
        }

        if (element.tagName === 'br') {
            append('\n');

            return;
        }

        // Custom source widgets can contain direct text, not just standard paragraphs.
        if (!node.children().length) {
            append(node.text());

            return;
        }

        node.contents().each((_, child) => {
            if (child.type === 'text') {
                append($(child).text());
            } else {
                walk(child);
            }
        });
    };

    root.children().each((_, child) => walk(child)); flush();

    if (!sections.length) {
        throw new Error('No useful dos2.wiki article content found.');
    }

    if (!/craft|recipes/i.test(title) && !sections.some((s) => /craft|recipe/i.test(s.title))) {
        sections.push({ title: 'Recipe availability', text: 'No recipe found in this source. This does not prove non-craftability. Acquisition and merchant stock are unknown unless explicitly established.', evidence: 'Unknown' });
    }

    return { title, url, provider: provider.id, source: provider.name, retrievedAt, parserVersion: PARSER_VERSION, revision, contentHash: createHash('sha256').update(html).digest('hex'), license: 'CC BY-SA 4.0', sourceCategories, entityType, image, recipes, usedIn, fields, sections, related, categories: [], edition: 'DOS2 DE target; source excerpts are not independently edition-verified' };
}
