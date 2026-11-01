import { titleCatalog } from './catalog.js';
import { PARSER_VERSION } from './domain.js';
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
/** Primary dos2.wiki pipeline; broad-wiki results are never silently substituted. */
export class Lookup {
    constructor(store, http, cfg) {
        this.store = store; this.cfg = cfg; this.adapter = new Dos2Wiki(store, http, cfg);
    }

    search(query, category = 'all', refresh = false) {
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

    /** Hydrate metadata only for the visible five candidates; failed previews stay unclassified. */
    async preview(results, page = 0) {
        const visible = await Promise.all(results.slice(page * 5, page * 5 + 5).map(async (entry) => {
            try {
                const { value } = await this.detail(entry);

                return { ...entry, entityType: value.entityType, sourceCategories: value.sourceCategories };
            } catch {
                return { ...entry, entityType: null, sourceCategories: [] };
            }
        }));

        return results.map((entry, index) => index >= page * 5 && index < page * 5 + 5 ? visible[index - page * 5] : entry);
    }

    detail(entry, refresh = false) {
        if (entry.provider !== provider.id || articleUrl(provider, entry.title) !== entry.url) {
            throw new Error('Source changed or invalid entry. Repeat /dos2 search.');
        }

        return this.adapter.fetch(entry.title, refresh);
    }
}
