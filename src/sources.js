import { titleCatalog } from './catalog.js';
import { PARSER_VERSION } from './domain.js';
import { Fextralife, fextraUrl } from './fextralife.js';
import { Forum, forumUrl } from './forum.js';
import { expand, normalize, rank, matches, SEARCH_VERSION } from './search.js';
import { verify } from './verification.js';
import { document, links, provider, articleUrl, parseArticle } from './wiki-pages.js';

export { articleUrl, relatedLink, parseArticle } from './wiki-pages.js';
export const providers = [provider];
const indexes = {
    crafting: ['Crafting', 'Ingredients'], skills: ['Skills', 'Status_Effects'], items: ['Items', 'Armour', 'Weapons'],
    quests: ['Quests'], mechanics: ['Physical_and_Magical_Armor', 'Attributes', 'Combat_Abilities'],
};
const aliases = { 'teleportation gloves': 'Gloves of Teleportation', 'physical armour': 'Physical and Magical Armor', 'physical armor': 'Physical and Magical Armor', 'blank summoning skill book': 'Blank Summoning Skillbook' };

/** Article and publisher sitemap retrieval. Search runs locally against cached titles. */
export class Dos2Wiki {
    constructor(store, http, cfg) {
        this.store = store; this.http = http; this.cfg = cfg; this.provider = provider;
    }

    async page(title, refresh = false) {
        try {
            return await this.store.cached(`html:${provider.id}:v${PARSER_VERSION}:${title}`, this.cfg.cacheMs, async () => {
                const html = await this.http.text(articleUrl(provider, title));

                verify(parseArticle(html));

                return { html, retrievedAt: new Date().toISOString() };
            }, refresh);
        } catch (error) {
            if (error.status === 404) {
                return null;
            }

            throw error;
        }
    }

    catalog(refresh = false) {
        return titleCatalog(this.store, this.http, this.cfg.cacheMs, refresh);
    }

    async search(query, category, refresh) {
        const pages = category === 'all' ? [...new Set(Object.values(indexes).flat())] : indexes[category];

        if (!pages) {
            throw new Error('Invalid search category.');
        }

        const catalog = await this.catalog(refresh);
        const entries = [...catalog.value]; let stale = catalog.stale;
        const directTitle = aliases[normalize(query)] || normalize(query).replaceAll(/\b\p{L}/gu, (c) => c.toUpperCase());

        if (!/[\x00-\x1F#/:?\\]/.test(directTitle)) {
            const direct = catalog.value.some((entry) => matches(query, entry.title)) ? null : await this.page(directTitle, refresh);

            if (direct) {
                const doc = document(direct.value.html);

                entries.push({ title: doc.title, url: doc.url, provider: provider.id, source: provider.name, categories: [category] }); stale ||= direct.stale;
            }
        }

        for (const title of (category === 'all' ? [] : pages)) {
            const result = await this.page(title, refresh);

            if (!result) {
                throw new Error('Source index missing; discovery is incomplete.');
            }

            stale ||= result.stale;
            const doc = document(result.value.html);

            entries.push({ title: doc.title, url: doc.url, provider: provider.id, source: provider.name, categories: [category] }, ...links(doc.$, doc.root).map((link) => ({ ...link, categories: [category] })));
        }

        const candidates = entries.filter((entry) => matches(query, entry.title));
        const ranked = rank(query, candidates, category).slice(0, 25);

        return { value: ranked, stale };
    }

    async fetch(title, refresh) {
        const raw = await this.page(title, refresh);

        if (!raw) {
            throw new Error('Source article not found. Repeat the search.');
        }

        const result = await this.store.cached(`page:${provider.id}:v${PARSER_VERSION}:${title}:${raw.value.retrievedAt}`, this.cfg.cacheMs, async () => verify(parseArticle(raw.value.html, raw.value.retrievedAt)));

        return { ...result, stale: result.stale || raw.stale };
    }
}
/** Search every supported source and stored article without merging their claims. */
export class Lookup {
    constructor(store, http, cfg) {
        this.store = store; this.cfg = cfg; this.adapter = new Dos2Wiki(store, http, cfg);
        this.forum = new Forum(store, http, cfg);
        this.fextralife = new Fextralife(store, http);
    }

    search(query, category = 'all', refresh = false) {
        if (typeof query !== 'string' || !normalize(query) || query.length > 180 || !['all', ...Object.keys(indexes)].includes(category)) {
            throw new Error('Use a query between 1 and 180 characters and a valid category.');
        }

        return this.searchAll(query, category, refresh);
    }

    /** Read only current source records, never configuration, controls, raw scripts or retired providers. */
    stored() {
        const records = this.store.db.prepare(`SELECT json_remove(value, '$.rawHtml') AS record FROM cache
            WHERE key LIKE 'page:dos2wiki:v${PARSER_VERSION}:%' OR key LIKE 'offline:fextra:article:v1:%' OR key LIKE 'offline:forum:thread:v1:%'
            ORDER BY at ASC`).all().map((row) => JSON.parse(row.record)).filter((record) => record.sections?.length && (
            (record.provider === 'dos2wiki' && record.url === articleUrl(provider, record.title))
            || (record.provider === 'fextralife' && record.url === fextraUrl(record.url))
            || (record.provider === 'larian' && record.url === forumUrl(record.url))
        ));

        return [...new Map(records.map((record) => [record.url, record])).values()];
    }

    async searchAll(query, category, refresh) {
        const names = ['dos2.wiki', 'Fextralife', 'Larian forums'];
        const results = await Promise.allSettled([this.wikiSearch(query, category, refresh), this.fextralife.search(query), this.forum.search(query)]);
        const candidates = results.flatMap((result) => result.status === 'fulfilled' ? result.value.value : []);
        const words = normalize(expand(query)).split(' ').filter((word) => !['a', 'an', 'the', 'of', 'and', 'for', 'to'].includes(word));

        for (const record of this.stored()) {
            const text = normalize([record.title, ...record.sections.map((s) => `${s.title} ${s.text}`), JSON.stringify(record.fields || {}), JSON.stringify(record.recipes || []), JSON.stringify(record.usedIn || [])].join(' '));
            const tokens = text.split(' ');

            if (matches(query, record.title) || (words.length && words.every((word) => tokens.some((token) => token === word || (word.length >= 3 && token.startsWith(word)))))) {
                candidates.push({ title: record.title, url: record.url, provider: record.provider, source: record.source, sourceCategories: record.sourceCategories, entityType: record.entityType });
            }
        }

        const unavailable = results.flatMap((result, i) => result.status === 'rejected' ? [names[i]] : []);

        if (unavailable.length === names.length && !candidates.length) {
            throw new Error('Sources unavailable and no matching stored content.');
        }

        const value = rank(query, candidates, category).map((candidate) => matches(query, candidate.title) ? candidate : { ...candidate, match: 'Stored content / topic match' });

        return { value, stale: results.some((result) => result.status === 'fulfilled' && result.value.stale), unavailable };
    }

    wikiSearch(query, category = 'all', refresh = false) {
        if (typeof query !== 'string' || !normalize(query) || query.length > 180) {
            throw new Error('Use a query between 1 and 180 characters.');
        }

        return this.store.cached(`search:${provider.id}:v${PARSER_VERSION}:s${SEARCH_VERSION}:${category}:${normalize(expand(query))}`, this.cfg.cacheMs, async () => {
            const result = await this.adapter.search(query, category, refresh);

            if (result.stale) {
                const error = new Error('Source refresh incomplete; using labeled cached titles.');

                error.staleResult = result; throw error;
            }

            return result.value;
        }, refresh).catch((error) => {
            if (error.staleResult?.value.length) {
                return error.staleResult;
            }

            throw error;
        });
    }

    /** Hydrate metadata only for the requested visible result window; failed previews stay unclassified. */
    async preview(results, page = 0, size = 5) {
        const visible = await Promise.all(results.slice(page * size, page * size + size).map(async (entry) => {
            try {
                const { value } = await this.detail(entry);

                return { ...entry, entityType: value.entityType, sourceCategories: value.sourceCategories };
            } catch {
                return { ...entry, entityType: null, sourceCategories: [] };
            }
        }));

        return results.map((entry, index) => index >= page * size && index < page * size + size ? visible[index - page * size] : entry);
    }

    detail(entry, refresh = false) {
        if (entry.provider === 'fextralife') {
            return this.fextralife.detail(entry, refresh);
        }

        if (entry.provider === 'larian') {
            return this.forum.detail(entry, refresh);
        }

        if (entry.provider !== provider.id || articleUrl(provider, entry.title) !== entry.url) {
            throw new Error('Source changed or invalid entry. Repeat /dos2 search.');
        }

        return this.adapter.fetch(entry.title, refresh).catch((error) => {
            const stored = this.stored().find((record) => record.url === entry.url);

            if (stored) {
                return { value: stored, stale: true };
            }

            throw error;
        });
    }
}
