import { topics, topicLabel, detailEmbed } from './cards.js';
import { mechanical, storySection } from './spoilers.js';
import { safe } from './text.js';

export { safe, chunks } from './text.js';
const row = (components) => ({ type: 1, components });
const button = (store, label, state) => ({ type: 2, style: 2, label, custom_id: store.control(state) });

export const payload = (content, components = []) => ({ content, components, allowedMentions: { parse: [] }, embeds: [] });
/** Multi-match cards keep numbers/buttons stable; narrative titles remain private. */
export function listView(store, results, page = 0, owner = null, stale = false) {
    const total = Math.max(1, Math.ceil(results.length / 5));

    page = Math.max(0, Math.min(page, total - 1));
    const entries = results.slice(page * 5, page * 5 + 5); const state = { kind: 'list', results, owner, stale }; const components = [];

    if (entries.length) {
        components.push(row(entries.map((entry, i) => button(store, (owner || mechanical(entry)) ? `View ${i + 1}` : `Reveal ${i + 1}`, { kind: 'detail', entry, owner, results, stale }))));
    }

    const nav = [];

    if (page) {
        nav.push(button(store, 'Previous results', { ...state, page: page - 1 }));
    }

    if (page + 1 < total) {
        nav.push(button(store, 'More results', { ...state, page: page + 1 }));
    }

    if (!owner && entries.some((entry) => !mechanical(entry))) {
        nav.push(button(store, 'Preview story matches privately', { ...state, revealList: true, page }));
    }

    if (nav.length) {
        components.push(row(nav));
    }

    return { ...payload('', components), embeds: [{ title: owner ? 'Private search results' : 'Search results', color: 0xB9_8D_4C, description: entries.length ? 'Choose a result below. Similar entries are separate choices.' : 'No close matches found. Try fewer words or a different name.', fields: entries.map((entry, i) => ({ name: (owner || mechanical(entry)) ? `${i + 1}. ${safe(entry.title).slice(0, 220)}` : `${i + 1}. Story-related result`, value: (owner || mechanical(entry)) ? `${entry.match || 'Matching entry'} · ${entry.entityType || 'Reference'}` : 'Reveal privately to view its name and details.' })), footer: { text: `${results.length} matches · Page ${page + 1}/${total}${stale ? ' · STALE CACHE' : ''}` } }] };
}

/** Item-first embeds and direct section selection; all private navigation stays owner-scoped. */
export function detailView(store, entry, record, owner, { section = 0, sectionKey, page = 0, topicPage, relatedPage = 0, results = [], stale = false } = {}) {
    entry = { ...entry, entityType: record.entityType, sourceCategories: record.sourceCategories };

    if (!owner && (!mechanical(record) || !record.sections.some((part) => !storySection(record, part)))) {
        return payload('This entry contains story content. Reveal it privately.', [row([button(store, 'Reveal story details', { kind: 'detail', entry, owner: null, reveal: true, results })])]);
    }

    const sections = topics(record, owner);

    if (sectionKey) {
        section = Math.max(0, sections.findIndex((part) => part.key === sectionKey));
    }

    section = Math.max(0, Math.min(section, sections.length - 1));
    const part = sections[section]; const card = detailEmbed(record, part, owner, page, stale);

    page = card.page;
    topicPage = Math.max(0, Math.min(topicPage ?? Math.floor(section / 25), Math.floor((sections.length - 1) / 25)));
    const state = { kind: 'detail', entry, owner, navigation: true, section, sectionKey: part.key, page, topicPage, relatedPage, results };
    const choices = sections.slice(topicPage * 25, topicPage * 25 + 25);
    const components = [row([{ type: 3, placeholder: 'Choose information to view', custom_id: store.control({ ...state, kind: 'section', sectionKeys: choices.map((choice) => choice.key) }), options: choices.map((choice, i) => ({ label: (choice.overview ? 'Overview' : topicLabel(choice.title)).slice(0, 95), value: String(i), default: choice.key === part.key })) }])];
    const nav = [];

    if (page) {
        nav.push(button(store, 'Previous page', { ...state, page: page - 1 }));
    }

    if (page + 1 < card.pages.length) {
        nav.push(button(store, 'Next page', { ...state, page: page + 1 }));
    }

    if (topicPage) {
        nav.push(button(store, 'Earlier sections', { ...state, topicPage: topicPage - 1 }));
    }

    if ((topicPage + 1) * 25 < sections.length) {
        nav.push(button(store, 'More sections', { ...state, topicPage: topicPage + 1 }));
    }

    if (nav.length) {
        components.push(row(nav));
    }

    const actions = [button(store, 'Refresh', { ...state, refresh: true }), { type: 2, style: 5, label: 'Wiki source', url: record.url }];

    if (results.length) {
        actions.push(button(store, 'Back to results', { kind: 'list', results, owner, page: 0 }));
    }

    if (!owner && record.sections.some((part) => storySection(record, part))) {
        actions.push(button(store, 'Reveal story details', { kind: 'detail', entry, owner: null, reveal: true, results }));
    }

    components.push(row(actions));
    const related = record.related.slice(relatedPage * 25, relatedPage * 25 + 25);

    if (related.length) {
        components.push(row([{ type: 3, placeholder: 'Look up an ingredient or related entry', custom_id: store.control({ kind: 'related', owner, navigation: true, preview: !owner, provider: entry.provider, related, results }), options: related.map((link, i) => ({ label: (owner || mechanical(link)) ? safe(link.title).slice(0, 95) : `Related entry ${relatedPage * 25 + i + 1} (preview)`, value: String(i) })) }]));
        const links = [];

        if (relatedPage) {
            links.push(button(store, 'Earlier related entries', { ...state, relatedPage: relatedPage - 1 }));
        }

        if ((relatedPage + 1) * 25 < record.related.length) {
            links.push(button(store, 'More related entries', { ...state, relatedPage: relatedPage + 1 }));
        }

        if (links.length) {
            components.push(row(links));
        }
    }

    return { ...payload('', components), embeds: [card.embed] };
}
