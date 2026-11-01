/** Source text is plain, escaped Discord text; no accidental mentions or embedded source links. */
export function safe(text) {
    return String(text).replaceAll(/https?:\/\/\S+/gi, '[external reference]').replaceAll(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replaceAll('@', '@\u200B').replaceAll(/([*<>[\\\]_`|~])/g, '\\$1');
}

/** Split without dropping any content, including long unbroken source table cells. */
export function chunks(text, size = 1_400) {
    const pages = []; let rest = safe(text);

    while (rest.length > size) {
        let cut = rest.lastIndexOf('\n', size);

        if (cut < size / 2) {
            cut = size;
        }

        if (/[\uD800-\uDBFF]/.test(rest[cut - 1])) {
            cut--;
        }

        pages.push(rest.slice(0, cut)); rest = rest.slice(cut);
    }

    pages.push(rest || 'No content in this section.');

    return pages;
}

const row = (components) => ({ type: 1, components });
const button = (store, label, state) => ({ type: 2, style: 2, label, custom_id: store.control(state) });

export const payload = (content, components = []) => ({ content, components, allowedMentions: { parse: [] }, embeds: [] });
/** Immutable snapshots mean old buttons cannot select a different result after pagination. */
export function listView(store, results, page = 0, owner = null, stale = false) {
    const total = Math.max(1, Math.ceil(results.length / 5));

    page = Math.max(0, Math.min(page, total - 1));
    const entries = results.slice(page * 5, page * 5 + 5);
    const state = { kind: 'list', results, owner, stale };
    const lines = entries.map((entry, i) => owner ? `${i + 1}. ${safe(entry.title).slice(0, 190)} — ${safe(entry.source)}` : `${i + 1}. Reference match — Reveal privately`);
    const components = [];

    if (entries.length) {
        components.push(row(entries.map((entry, i) => button(store, owner ? `${i + 1}` : `Reveal ${i + 1}`, { kind: 'detail', entry, owner, results, stale }))));
    }

    const nav = [];

    if (page) {
        nav.push(button(store, 'Previous', { ...state, page: page - 1 }));
    }

    if (page + 1 < total) {
        nav.push(button(store, 'Next', { ...state, page: page + 1 }));
    }

    if (!owner && entries.length) {
        nav.push(button(store, 'Reveal result titles', { ...state, revealList: true, page }));
    }

    if (nav.length) {
        components.push(row(nav));
    }

    return payload(`${stale ? 'STALE cached search — live source unavailable.\n' : ''}${owner ? 'Private reference matches' : 'Reference matches (titles hidden for spoilers)'} · ${page + 1}/${total}\n${lines.join('\n') || 'No matching entries found. Try a shorter name or different spelling.'}`, components);
}

/** All article rendering is private; no arbitrary wiki field is approved for shared output. */
export function detailView(store, entry, record, owner, { section = 0, page = 0, relatedPage = 0, results = [], stale = false } = {}) {
    section = Math.max(0, Math.min(section, record.sections.length - 1));
    const part = record.sections[section];
    const pages = chunks(part.text);

    page = Math.max(0, Math.min(page, pages.length - 1));
    const state = { kind: 'detail', entry, owner, section, page, relatedPage, results };
    const components = [];
    const nav = [];

    if (page) {
        nav.push(button(store, 'Previous page', { ...state, page: page - 1 }));
    }

    if (page + 1 < pages.length) {
        nav.push(button(store, 'Next page', { ...state, page: page + 1 }));
    }

    if (section) {
        nav.push(button(store, 'Previous section', { ...state, section: section - 1, page: 0 }));
    }

    if (section + 1 < record.sections.length) {
        nav.push(button(store, 'Next section', { ...state, section: section + 1, page: 0 }));
    }

    if (nav.length) {
        components.push(row(nav));
    }

    const actions = [button(store, 'Refresh source', { ...state, refresh: true }), { type: 2, style: 5, label: 'Open source', url: record.url }];

    if (results.length) {
        actions.push(button(store, 'Result list', { kind: 'list', results, owner, page: 0 }));
    }

    components.push(row(actions));
    const related = record.related.slice(relatedPage * 25, relatedPage * 25 + 25);

    if (related.length) {
        const options = related.map((link, i) => ({ label: safe(link.title).slice(0, 95), value: String(i) }));

        components.push(row([{ type: 3, placeholder: 'Related source pages / ingredients', custom_id: store.control({ kind: 'related', owner, provider: entry.provider, related, results }), options }]));
        const rn = [];

        if (relatedPage) {
            rn.push(button(store, 'Earlier links', { ...state, relatedPage: relatedPage - 1 }));
        }

        if ((relatedPage + 1) * 25 < record.related.length) {
            rn.push(button(store, 'More links', { ...state, relatedPage: relatedPage + 1 }));
        }

        if (rn.length) {
            components.push(row(rn));
        }
    }

    return payload(`${stale ? 'STALE cached article — refresh failed.\n' : ''}**${safe(record.title).slice(0, 160)}**\n${safe(record.edition)}\n${safe(part.title).slice(0, 100)} · section ${section + 1}/${record.sections.length} · page ${page + 1}/${pages.length}\n\n${pages[page]}\n\n${safe(record.source)} · retrieved ${record.retrievedAt.slice(0, 10)} · parser ${record.parserVersion}`, components);
}
