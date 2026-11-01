import { load } from 'cheerio';
import { relatedLink, provider } from './wiki-pages.js';

const indexUrl = 'https://dos2.wiki/sitemap/sitemap-index-dos2wiki.xml';

export const sitemapPath = (path) => /^(?:\/sitemap){2}-(?:index-dos2wiki|dos2wiki-\d+)\.xml$/.test(path);
/** Cache the publisher's title catalog; no API/search endpoints or article-wide crawl. */
export async function titleCatalog(store, http, ttl, refresh = false) {
    return store.cached('sitemap:dos2wiki:v1', ttl, async () => {
        const root = load(await http.text(indexUrl), { xml: true });
        const urls = root('sitemapindex > sitemap > loc').map((_, e) => root(e).text()).get();

        if (!urls.length || urls.length > 20) {
            throw new Error('Unexpected sitemap index.');
        }

        const entries = new Map();

        for (const input of urls) {
            const url = new URL(input);

            if (url.origin !== 'https://dos2.wiki' || url.search || url.username || url.password || url.hash || !/^(?:\/sitemap){2}-dos2wiki-\d+\.xml$/.test(url.pathname)) {
                throw new Error('Sitemap destination rejected.');
            }

            const page = load(await http.text(url.href), { xml: true });

            if (!page('urlset > url > loc').length) {
                throw new Error('Unexpected article sitemap.');
            }

            page('urlset > url > loc').each((_, element) => {
                const href = page(element).text(); const entry = relatedLink(provider, href, 'article');

                if (entry) {
                    entries.set(entry.url, entry);
                }
            });

            if (entries.size > 20_000) {
                throw new Error('Sitemap catalog exceeds limit.');
            }
        }

        if (!entries.size) {
            throw new Error('No article titles in sitemap.');
        }

        return [...entries.values()];
    }, refresh);
}
