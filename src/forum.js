import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { matches, rank, normalize } from './search.js';
import { tidy } from './wiki-pages.js';

export const forumProvider = { id: 'larian', name: 'Larian DOS2 forums' };
const origin = 'https://forums.larian.com';
const boards = ['64', '67', '68'];
const topicMatch = (query, title) => normalize(query).split(' ').filter((word) => !['the', 'a', 'an', 'of', 'and', 'for', 'to'].includes(word)).every((word) => normalize(title).split(' ').some((part) => part === word || (word.length >= 3 && part.startsWith(word))));
const seeds = [
    { number: '656574', title: 'crafting without recipe', terms: ['crafting', 'recipe', 'recipes', 'fextralife'] },
    { number: '664912', title: 'Unable to obtain Skills from Skill books', terms: ['skillbook', 'skillbooks', 'skill requirements', 'learn skills', 'restoration'] },
    { number: '652234', title: 'Reactive Shot + teleport causing loss of control?', terms: ['reactive shot', 'teleport', 'teleportation', 'nether swap', 'lone wolf'] },
    { number: '656607', title: 'New Feature and Gift Bag 3 - Order & Magic', terms: ['gift bag', 'pet power', 'summoning', 'infusion'] },
];

/** Only read-only board listings and bounded thread pages are permitted. */
export function forumUrl(input) {
    try {
        const url = new URL(input, origin); const params = url.searchParams;
        const allowed = params.get('ubb') === 'showflat' ? ['ubb', 'Number', 'page'] : ['ubb', 'Board', 'page'];

        if (url.origin !== origin || url.username || url.password || url.pathname !== '/ubbthreads.php'
            || [...params.keys()].some((key) => !allowed.includes(key) || params.getAll(key).length !== 1)
            || (params.has('page') && !/^(?:[1-9]|[1-9]\d|100)$/.test(params.get('page')))) {
            return null;
        }

        if (params.get('ubb') === 'showflat' && /^\d{1,9}$/.test(params.get('Number') || '')) {
            return `${origin}/ubbthreads.php?ubb=showflat&Number=${params.get('Number')}&page=${params.get('page') || '1'}`;
        }

        if (params.get('ubb') === 'postlist' && boards.includes(params.get('Board')) && params.get('page') === '1') {
            return `${origin}/ubbthreads.php?ubb=postlist&Board=${params.get('Board')}&page=1`;
        }
    } catch {
        return null;
    }

    return null;
}

const entry = (title, url) => ({ title, url, provider: forumProvider.id, source: forumProvider.name });
const routine = (title) => !/spoiler|quest|ending|story|walkthrough/i.test(title) && /craft|recipe|skill|summon|armou?r|damage|rune|arrow|potion|reactive shot|gift bag|combat|attribute/i.test(title);

export function boardTopics(html, board) {
    const $ = load(html);

    if (!$('title').text().includes('Original Sin 2') || !boards.includes(board)) {
        throw new Error('Unexpected DOS2 forum board.');
    }

    const found = new Map();

    $('a[href]').each((_, node) => {
        const title = tidy($(node).text()); const raw = new URL($(node).attr('href'), origin);

        if (!title || /^\d|^Re:/.test(title) || raw.searchParams.get('ubb') !== 'showflat') {
            return;
        }

        // Announcement and unread tracking parameters are navigation only, never requested.
        const url = forumUrl(`${origin}/ubbthreads.php?ubb=showflat&Number=${raw.searchParams.get('Number')}`);

        if (raw.origin === origin && url) {
            found.set(url, entry(title, url));
        }
    });

    if (!found.size) {
        throw new Error('Forum topic list missing.');
    }

    return [...found.values()];
}

/** Keep post authors/dates and quotes distinct; signatures, profiles and unrelated navigation are excluded. */
export function parseThread(html, input, retrievedAt = new Date().toISOString()) {
    const url = forumUrl(input); const $ = load(html); const crumbs = $('.breadcrumbs');
    const permittedBoard = crumbs.find('a[href]').toArray().some((a) => {
        const u = new URL($(a).attr('href'), origin);

        return u.origin === origin && u.searchParams.get('ubb') === 'postlist' && [...boards, '66'].includes(u.searchParams.get('Board'));
    });

    if (!url || new URL(url).searchParams.get('ubb') !== 'showflat' || !permittedBoard
        || !crumbs.find('a[href]').toArray().some((a) => new URL($(a).attr('href'), origin).searchParams.get('c') === '18')) {
        throw new Error('Thread is outside the supported DOS2 boards.');
    }

    const title = tidy($('title').text().replace(/ - Larian Studios forums$/, ''));
    const sections = []; const related = new Map();

    $('.post_inner').each((_, node) => {
        const table = $(node).closest('table'); const body = $(node).find('[id^="body"]').first().clone();
        const post = table.find('.subjecttable a[id^="number"]').first().text().trim();
        const author = tidy(table.find('.author-name .username').first().text()) || tidy(table.find('.author-name').first().text()).replace(/\s+OP$/, '') || 'Unknown author';
        const date = tidy(table.find('.subjecttable .date').first().text()) || 'Date unknown';
        const time = tidy(table.find('.subjecttable .time').first().text());
        const spoiler = body.find('[class*="spoiler"]').length > 0;

        body.find('script,style,.signature,.spoiler-toggle').remove();
        body.find('blockquote,.ubbcode-block').each((_, quote) => {
            $(quote).prepend('\n[Quoted material — attribution may differ]\n').append('\n[End quote]\n');
        });
        body.find('br').replaceWith('\n'); body.find('p,li,div').append('\n');
        const text = tidy(body.text());

        if (text && /^\d+$/.test(post) && author && date) {
            sections.push({ title: `${author} · ${date}${time ? ` ${time}` : ''} · #${post}`, text: `Community report; not independently DE-verified.\n\n${text}`, headings: [title, ...(spoiler ? ['Story spoilers'] : [])], evidence: `${origin}/ubbthreads.php?ubb=showflat&Number=${post}` });
        }
    });

    if (!title || !sections.length) {
        throw new Error('Forum posts missing; cached content was preserved.');
    }

    if (new URL(url).searchParams.get('page') === '1' && !sections.some((s) => s.title.endsWith(`#${new URL(url).searchParams.get('Number')}`))) {
        throw new Error('Requested forum post is missing.');
    }

    $('a[href]').each((_, a) => {
        const href = forumUrl($(a).attr('href')); const label = tidy($(a).text());

        if (href && href !== url && /^\d+$/.test(label) && new URL(href).searchParams.get('ubb') === 'showflat'
            && new URL(href).searchParams.get('Number') === new URL(url).searchParams.get('Number')) {
            related.set(href, entry(`${title} — page ${new URL(href).searchParams.get('page')}`, href));
        }
    });

    return { ...entry(title, url), entityType: 'discussion', sourceCategories: routine(title) ? ['mechanics'] : [], fields: { type: 'Forum discussion', summary: 'Community discussion, not a verified recipe or current bug status. Gift Bag topics describe optional content. Select a dated post below to read it. Quotes and conflicting replies remain separate.' }, sections, related: [...related.values()], retrievedAt, revision: '', contentHash: createHash('sha256').update(html).digest('hex'), parserVersion: 'forum-1', license: 'Forum authors retain their content; source attribution provided.', edition: 'DOS2 forum; DE applicability is unverified unless the individual post explicitly establishes it. Older posts may describe Classic or mods.' };
}

export class Forum {
    constructor(store, http) {
        this.store = store; this.http = http;
    }

    async search(query) {
        if (typeof query !== 'string' || !normalize(query) || query.length > 180) {
            throw new Error('Use a query between 1 and 180 characters.');
        }

        if (/^https?:/i.test(query)) {
            const url = forumUrl(query);

            if (!url || new URL(url).searchParams.get('ubb') !== 'showflat') {
                throw new Error('Use a DOS2 forum thread URL.');
            }

            const result = await this.detail({ url });

            return { value: [entry(result.value.title, url)], stale: result.stale };
        }

        const candidates = seeds.filter((s) => matches(query, s.title) || s.terms.some((term) => topicMatch(query, term))).map((s) => entry(s.title, forumUrl(`${origin}/ubbthreads.php?ubb=showflat&Number=${s.number}`)));
        const saved = this.store.db.prepare('SELECT json_extract(value, \'$.title\') AS title, json_extract(value, \'$.url\') AS url FROM cache WHERE key LIKE \'offline:forum:thread:%\'').all();

        candidates.push(...saved.filter((e) => topicMatch(query, e.title)).map((e) => entry(e.title, e.url)));
        let stale = false; let available = candidates.length > 0;

        for (const board of boards) {
            try {
                const result = await this.store.cached(`offline:forum:board:v1:${board}`, Infinity, async () => boardTopics(await this.http.text(`${origin}/ubbthreads.php?ubb=postlist&Board=${board}&page=1`), board));

                available = true; stale ||= result.stale;
                candidates.push(...result.value.filter((e) => topicMatch(query, e.title)));
            } catch {
                stale = true;
            }
        }

        if (!available) {
            throw new Error('Forum discovery unavailable.');
        }

        return { value: rank(query, candidates).slice(0, 25), stale };
    }

    detail(input, refresh = false) {
        const url = forumUrl(input.url);

        if (!url || new URL(url).searchParams.get('ubb') !== 'showflat') {
            throw new Error('Invalid forum thread URL.');
        }

        return this.store.cached(`offline:forum:thread:v1:${url}`, Infinity, async () => {
            const html = await this.http.text(url); const retrievedAt = new Date().toISOString();
            const parsed = parseThread(html, url, retrievedAt);

            // Raw and parsed copies share one persistent cache record and stale fallback.
            return { ...parsed, rawHtml: html };
        }, refresh);
    }
}
