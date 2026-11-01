import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { listView } from '../src/render.js';
import { Lookup } from '../src/sources.js';
import { Store } from '../src/store.js';

function setup(t) {
    const dir = mkdtempSync(join(tmpdir(), 'dos2 unified ')); const store = new Store(dir);

    t.after(() => {
        store.close(); rmSync(dir, { recursive: true, force: true });
    });

    return {
        store, lookup: new Lookup(store, {
            async text() {
                throw new Error('offline');
            },
        }, { cacheMs: 1_000 }),
    };
}

const wiki = { title: 'Example Potion', url: 'https://dos2.wiki/wiki/Example_Potion', provider: 'dos2wiki', source: 'dos2.wiki', entityType: 'item' };
const fextra = { ...wiki, provider: 'fextralife', source: 'Fextralife DOS2 wiki', url: 'https://divinityoriginalsin2.wiki.fextralife.com/Example_Potion' };
const forum = { title: 'Potion requirements', provider: 'larian', source: 'Larian DOS2 forums', url: 'https://forums.larian.com/ubbthreads.php?ubb=showflat&Number=1&page=1', sourceCategories: ['mechanics'] };
const record = (entry, text) => ({ ...entry, fields: {}, retrievedAt: '2026-11-01T00:00:00Z', sections: [{ title: 'Effects', text }], related: [] });

test('normal search queries all providers for every category and keeps distinct source identities', async (t) => {
    const { lookup } = setup(t); const calls = [];

    lookup.wikiSearch = async (query, category, refresh) => {
        calls.push(['wiki', query, category, refresh]);

        return { value: [wiki], stale: false };
    };

    lookup.fextralife.search = async (query) => {
        calls.push(['fextra', query]);

        return { value: [fextra], stale: false };
    };

    lookup.forum.search = async (query) => {
        calls.push(['forum', query]);

        return { value: [forum], stale: false };
    };

    for (const category of ['all', 'crafting', 'skills', 'items', 'quests', 'mechanics']) {
        const result = await lookup.search('example potion', category);

        assert.deepEqual(result.value.map((e) => e.provider), ['dos2wiki', 'fextralife', 'larian']);
        assert.deepEqual(result.unavailable, []);
    }

    assert.equal(calls.length, 18);
    assert.throws(() => lookup.search('!!!'), /query/);
    assert.throws(() => lookup.search('potion', 'invalid'), /category/);
});

test('stored body/recipe/field text is searchable across sources, immediately after caching and without leaking excerpts', async (t) => {
    const { lookup, store } = setup(t);

    lookup.wikiSearch = async () => ({ value: [], stale: false });
    lookup.fextralife.search = lookup.wikiSearch; lookup.forum.search = lookup.wikiSearch;
    const put = store.db.prepare('INSERT INTO cache VALUES (?, ?, ?)');
    const old = record(wiki, 'OUTDATED_SEARCH_TOKEN'); const current = record(wiki, 'Restores vitality from a wooden figurine');

    put.run('page:dos2wiki:v4:example:old', JSON.stringify(old), 1);
    put.run('page:dos2wiki:v4:example:new', JSON.stringify(current), 2);
    put.run('offline:fextra:article:v1:example', JSON.stringify({ ...record(fextra, 'Restores vitality'), fields: { requirements: 'A wooden figurine' }, rawHtml: 'RAW_SCRIPT_TOKEN' }), 3);
    const story = { ...record(forum, 'Hidden plot involving a wooden figurine'), sourceCategories: ['Quests'], title: 'SECRET_STORY_TITLE' };

    put.run('offline:forum:thread:v1:example', JSON.stringify(story), 4);
    put.run('page:retired:v1:example', JSON.stringify(record(wiki, 'RETIRED_TOKEN')), 5);
    const result = await lookup.search('wooden figurine');

    assert.equal(result.value.length, 3);
    assert.ok(result.value.every((e) => e.match === 'Stored content / topic match'));
    const shared = JSON.stringify(listView(store, result.value));

    assert.ok(!shared.includes('SECRET_STORY_TITLE'));
    assert.ok(!shared.includes('Hidden plot'));
    assert.ok(shared.includes('Fextralife DOS2 wiki'));
    assert.equal((await lookup.search('OUTDATED_SEARCH_TOKEN')).value.length, 0);
    assert.equal((await lookup.search('RAW_SCRIPT_TOKEN')).value.length, 0);
    assert.equal((await lookup.search('RETIRED_TOKEN')).value.length, 0);
    current.recipes = [{ output: 'Example Potion', ingredients: ['NEW_INGREDIENT_TOKEN'] }];
    store.db.prepare('UPDATE cache SET value = ? WHERE key = ?').run(JSON.stringify(current), 'page:dos2wiki:v4:example:new');
    assert.equal((await lookup.search('NEW_INGREDIENT_TOKEN')).value.length, 1);
    assert.deepEqual((await lookup.detail(wiki)).value, current);
});

test('one source outage cannot hide other sources or offline matches; partial coverage is visible and paginates', async (t) => {
    const { lookup, store } = setup(t);

    lookup.wikiSearch = async () => {
        throw new Error('unavailable');
    };

    lookup.fextralife.search = async () => ({ value: [fextra], stale: false });
    lookup.forum.search = lookup.fextralife.search;
    const result = await lookup.search('potion');

    assert.equal(result.value.length, 1);
    assert.deepEqual(result.unavailable, ['dos2.wiki']);
    const page = listView(store, [...result.value, ...Array.from({ length: 5 }, () => wiki)], 0, null, result.stale, result.unavailable);

    assert.match(page.embeds[0].description, /Partial coverage: dos2.wiki unavailable/);
    const next = page.components.flatMap((r) => r.components).find((c) => c.label === 'Results →');

    assert.deepEqual(store.read(next.custom_id).unavailable, ['dos2.wiki']);
    lookup.fextralife.search = lookup.wikiSearch; lookup.forum.search = lookup.wikiSearch;
    await assert.rejects(lookup.search('potion'), /Sources unavailable/);
    store.db.prepare('INSERT INTO cache VALUES (?, ?, ?)').run('offline:fextra:article:v1:saved', JSON.stringify(record(fextra, 'Useful stored fact')), 1);
    assert.equal((await lookup.search('stored fact')).value[0].url, fextra.url);
});
