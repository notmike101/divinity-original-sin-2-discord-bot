const aliases = { armor: 'armour', ap: 'action point', sp: 'source point', 'physical armour': 'physical and magical armour', 'blank summoning skill book': 'blank summoning skillbook' };

export const SEARCH_VERSION = '2';
/** Normalize spelling and compound words, without merging scroll/book/blank identities. */
export function normalize(text) {
    return text.toLowerCase().replaceAll('armor', 'armour').replaceAll(/\bskill\s*books?\b/g, 'skillbook').replaceAll(/[^\p{L}\p{N}\s]/gu, ' ').replaceAll(/\s+/g, ' ').trim();
}

export const expand = (text) => aliases[normalize(text)] || normalize(text);
const forms = (query) => normalize(query) === 'scrollbook' ? ['skillbook', 'scroll'] : [...new Set([normalize(query), expand(query)])];
const tokens = (text) => {
    const words = text.split(' ').filter((word) => !['the', 'of', 'and', 'a', 'an', 'for', 'to', 'dos2', 'de'].includes(word));

    return words.length > 1 ? words.filter((word) => !['spell', 'skill', 'item'].includes(word)) : words;
};

/** Optimal-string-alignment distance also handles adjacent transposed letters. */
function distance(a, b) {
    let previous = Array.from({ length: b.length + 1 }, (_, i) => i); let beforePrevious;

    for (let i = 0; i < a.length; i++) {
        const row = [i + 1];

        for (let j = 0; j < b.length; j++) {
            let value = Math.min(row[j] + 1, previous[j + 1] + 1, previous[j] + (a[i] === b[j] ? 0 : 1));

            if (i > 0 && j > 0 && a[i] === b[j - 1] && a[i - 1] === b[j]) {
                value = Math.min(value, beforePrevious[j - 1] + 1);
            }

            row.push(value);
        }

        beforePrevious = previous; previous = row;
    }

    return previous[b.length];
}

function tokenScore(query, title) {
    if (query === title) {
        return 1;
    }

    if (query.length >= 3 && title.startsWith(query)) {
        return 0.94;
    }

    if (query.length >= 4 && title.includes(query)) {
        return 0.86;
    }

    if (query.length < 4) {
        return 0;
    }

    const edits = distance(query, title); const limit = query.length < 6 ? 1 : query.length < 10 ? 2 : 3;

    return edits <= limit && edits / Math.max(query.length, title.length) <= 0.34 ? 1 - edits / Math.max(query.length, title.length) : 0;
}

/** Every meaningful query token must match a different title token; unknown terms stay unmatched. */
function score(query, title) {
    const normalized = normalize(title); const wanted = tokens(query); const available = tokens(normalized); const used = new Set();

    if (!wanted.length) {
        return 0;
    }

    let total = 0;

    for (const word of wanted) {
        let best = 0; let index = -1;

        for (const [i, element] of available.entries()) {
            const candidate = used.has(i) ? 0 : tokenScore(word, element);

            if (candidate > best) {
                best = candidate; index = i;
            }
        }

        if (!best) {
            return 0;
        }

        used.add(index); total += best;
    }

    const base = normalized === query ? 9_000 : normalized.includes(query) ? 6_000 : 4_000;

    return base + Math.round(total / wanted.length * 1_000) - Math.max(0, available.length - wanted.length) * 15;
}

/** Exact names lead; partial, reordered and typo matches remain distinct candidates. */
export function rank(query, entries, category = 'all') {
    const q = normalize(query); const variants = forms(query);

    return [...new Map(entries.map((entry) => [entry.url, entry])).values()].map((entry) => {
        const value = Math.max(...variants.map((form) => score(form, entry.title)));
        const exact = normalize(entry.title) === q;
        const preferred = category !== 'all' && entry.categories?.includes(category);

        return { entry: { ...entry, match: exact ? 'Exact name' : value >= 6_000 ? 'Partial name' : 'Close match' }, score: (exact ? 11_000 : value) + (preferred ? 50 : 0) };
    }).sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title)).map((result) => result.entry);
}

export const matches = (query, title) => forms(query).some((form) => score(form, title) > 0);
