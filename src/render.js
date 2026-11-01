import { topics, topicLabel, detailEmbed } from './cards.js';
import { safe } from './text.js';

export { safe, chunks } from './text.js';
const row = (components) => ({ type: 1, components });
const button = (store, label, state) => ({ type: 2, style: 2, label, custom_id: store.control(state) });
const resultsPerPage = 5;

/** Keep result identity and paging in one menu; selections replace the current card. */
function resultMenu(store, results, owner, selected, resultPage, stale, unavailable) {
    const total = Math.max(1, Math.ceil(results.length / resultsPerPage));
    const selectedIndex = results.findIndex((entry) => entry.url === selected);
    const page = Math.max(0, Math.min(resultPage ?? Math.floor(Math.max(0, selectedIndex) / resultsPerPage), total - 1));
    const choices = results.slice(page * resultsPerPage, (page + 1) * resultsPerPage).map((entry) => ({ entry }));

    if (page) {
        choices.unshift({ page: page - 1 });
    }

    if (page + 1 < total) {
        choices.push({ page: page + 1 });
    }

    return row([{
        type: 3, placeholder: 'Choose a result or source', custom_id: store.control({ kind: 'result', results, owner, stale, unavailable, resultPage: page, choices }), options: choices.map((choice, i) => {
            if (!choice.entry) {
                return { label: choice.page < page ? '← Previous results' : 'More results →', value: String(i) };
            }

            const entry = choice.entry;
            const source = { dos2wiki: 'dos2.wiki', fextralife: 'Fextralife', larian: 'Larian forums' }[entry.provider] || 'Source';

            return { label: `${safe(entry.title).slice(0, 70)} · ${source}`, description: `${safe(entry.source || 'Reference')} · ${entry.match || 'Matching entry'}`.slice(0, 100), value: String(i), default: entry.url === selected };
        }),
    }]);
}

export const payload = (content, components = []) => ({ content, components, allowedMentions: { parse: [] }, embeds: [] });
/** Multi-match cards preserve immutable result identities. */
export function listView(store, results, page = 0, owner = null, stale = false, unavailable = []) {
    const total = Math.max(1, Math.ceil(results.length / resultsPerPage));

    page = Math.max(0, Math.min(page, total - 1));
    const entries = results.slice(page * resultsPerPage, (page + 1) * resultsPerPage); const components = [];

    if (entries.length) {
        components.push(resultMenu(store, results, owner, null, page, stale, unavailable));
    }

    return { ...payload('', components), embeds: [{ title: owner ? 'Private search results' : 'Search results', color: 0xB9_8D_4C, description: (entries.length ? 'Choose a result below. Similar entries and different sources are separate choices.' : 'No close matches found. Try fewer words or a different name.') + (unavailable.length ? `\nPartial coverage: ${unavailable.join(', ')} unavailable. Stored matches are still included.` : ''), fields: entries.map((entry, i) => ({ name: `${i + 1}. ${safe(entry.title).slice(0, 220)}`, value: `${safe(entry.source || 'Reference')} · ${entry.match || 'Matching entry'} · ${entry.entityType || 'Reference'}` })), footer: { text: `${results.length} matches · Page ${page + 1}/${total}${stale ? ' · STALE CACHE' : ''}` } }] };
}

/** Item-first embeds and direct section selection; all private navigation stays owner-scoped. */
export function detailView(store, entry, record, owner, { section = 0, sectionKey, page = 0, topicPage, relatedPage = 0, results = [], stale = false, resultPage, unavailable = [] } = {}) {
    entry = { ...entry, entityType: record.entityType, sourceCategories: record.sourceCategories };
    results = results.map((candidate) => candidate.url === entry.url ? entry : candidate);

    const sections = topics(record);

    if (sectionKey) {
        section = Math.max(0, sections.findIndex((part) => part.key === sectionKey));
    }

    section = Math.max(0, Math.min(section, sections.length - 1));
    const part = sections[section]; const card = detailEmbed(record, part, page, stale);

    page = card.page;
    topicPage = Math.max(0, Math.min(topicPage ?? Math.floor(section / 23), Math.floor((sections.length - 1) / 23)));
    const state = { kind: 'detail', entry, owner, navigation: true, section, sectionKey: part.key, page, topicPage, relatedPage, results, resultPage, unavailable };
    const choices = sections.slice(topicPage * 23, topicPage * 23 + 23);

    if (topicPage) {
        choices.unshift({ key: `topic-page:${topicPage - 1}`, title: '← Earlier sections' });
    }

    if ((topicPage + 1) * 23 < sections.length) {
        choices.push({ key: `topic-page:${topicPage + 1}`, title: 'More sections →' });
    }

    const components = results.length ? [resultMenu(store, results, owner, entry.url, resultPage, stale, unavailable)] : [];

    components.push(row([{ type: 3, placeholder: 'Choose information to view', custom_id: store.control({ ...state, kind: 'section', sectionKeys: choices.map((choice) => choice.key) }), options: choices.map((choice, i) => ({ label: (choice.overview ? 'Overview' : topicLabel(choice.title)).slice(0, 95), value: String(i), default: choice.key === part.key })) }]));
    const nav = [];

    if (page) {
        nav.push(button(store, 'Previous page', { ...state, page: page - 1 }));
    }

    if (page + 1 < card.pages.length) {
        nav.push(button(store, 'Next page', { ...state, page: page + 1 }));
    }

    if (results.length) {
        nav.push(button(store, 'Back to results', { kind: 'list', results, owner, page: resultPage ?? Math.floor(Math.max(0, results.findIndex((e) => e.url === entry.url)) / resultsPerPage), stale, unavailable }));
    }

    const actions = [button(store, 'Refresh', { ...state, refresh: true }), { type: 2, style: 5, label: entry.provider === 'larian' ? 'Forum source' : 'Wiki source', url: record.url }];

    if (entry.provider !== 'larian') {
        actions.push(button(store, 'Forum discussions', { kind: 'forum', entry, owner, navigation: true }));
    }

    if (entry.provider !== 'fextralife') {
        actions.push(button(store, 'Fextralife lookup', { kind: 'fextralife', entry, owner, navigation: true }));
    }

    components.push(row(actions));
    const related = record.related.slice(relatedPage * 25, relatedPage * 25 + 25);

    if (related.length) {
        components.push(row([{ type: 3, placeholder: 'Look up an ingredient or related entry', custom_id: store.control({ kind: 'related', owner, navigation: true, provider: entry.provider, related, results, resultPage, unavailable }), options: related.map((link, i) => ({ label: safe(link.title).slice(0, 95), value: String(i) })) }]));
        const links = [];

        if (relatedPage) {
            links.push(button(store, 'Earlier related entries', { ...state, relatedPage: relatedPage - 1 }));
        }

        if ((relatedPage + 1) * 25 < record.related.length) {
            links.push(button(store, 'More related entries', { ...state, relatedPage: relatedPage + 1 }));
        }

        if (links.length) {
            nav.push(...links);
        }
    }

    if (nav.length) {
        components.push(row(nav));
    }

    return { ...payload('', components), embeds: [card.embed] };
}
