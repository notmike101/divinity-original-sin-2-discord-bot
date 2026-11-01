const aliases = { armor: 'armour', 'physical armour': 'physical and magical armour', 'blank summoning skill book': 'blank summoning skillbook', scrollbook: 'skillbook scroll' };

/** Normalize spelling without conflating scroll, book, and blank-book identities. */
export function normalize(text) {
    return text.toLowerCase().replaceAll('armor', 'armour').replaceAll(/[^\p{L}\p{N}\s]/gu, ' ').replaceAll(/\s+/g, ' ').trim();
}

export const expand = (text) => aliases[normalize(text)] || normalize(text);

function distance(a, b) {
    let row = Array.from({ length: b.length + 1 }, (_, i) => i);

    for (const [i, element] of [...a].entries()) {
        const next = [i + 1];

        for (const [j, element_] of [...b].entries()) {
            next.push(Math.min(next[j] + 1, row[j + 1] + 1, row[j] + (element === element_ ? 0 : 1)));
        }

        row = next;
    }

    return row[b.length];
}

/** Exact names precede aliases, phrases, token overlap, then edit-distance candidates. */
export function rank(query, entries, category = 'all') {
    const q = normalize(query); const alias = normalize(expand(query));
    const score = (entry) => {
        const t = normalize(entry.title);
        const tokens = alias.split(' ').filter((x) => t.split(' ').includes(x)).length;
        const preferred = category !== 'all' && entry.categories?.some((c) => normalize(c).includes(category === 'crafting' ? 'craft' : category.replace(/s$/, '')));

        return (t === q ? 10_000 : t === alias ? 9_000 : t.includes(alias) ? 6_000 : tokens * 300 - distance(alias, t)) + (preferred ? 50 : 0);
    };

    return [...new Map(entries.map((e) => [e.url, e])).values()].sort((a, b) => score(b) - score(a) || a.title.localeCompare(b.title));
}

/** Bound fuzzy discovery so unknown terms do not return unrelated nearest wiki titles. */
export function matches(query, title) {
    const q = normalize(expand(query)); const t = normalize(title);

    return q.split(' ').some((word) => word.length > 1 && t.includes(word)) || distance(q, t) <= Math.min(3, Math.floor(q.length / 4));
}
