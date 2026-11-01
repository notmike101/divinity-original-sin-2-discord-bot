import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { command } from '../src/commands.js';
import { config, permitted, validateDiscord } from '../src/config.js';
import { Http } from '../src/http.js';
import { listView, detailView, chunks, safe } from '../src/render.js';
import { router, Limits } from '../src/router.js';
import { rank } from '../src/search.js';
import { parseArticle, providers, articleUrl, Lookup, relatedLink } from '../src/sources.js';
import { Store } from '../src/store.js';

const alice = '900000000000000001'; const bob = '900000000000000002'; const outsider = '900000000000000003';
const cfg = config({ ALLOWED_USER_IDS: `${alice},${bob}` });
const entry = (title) => ({ title, url: articleUrl(providers[0], title), provider: 'fandom', source: 'Test source', categories: [] });
const records = Array.from({ length: 12 }, (_, i) => entry(`Secret story title ${i}`));
const article = { ...entry('Hidden outcome'), edition: 'Unknown', retrievedAt: '2026-01-01T00:00:00Z', parserVersion: '1', sections: [{ title: 'Hidden heading', text: `Private narrative @everyone https://example.com/spoiler ${'ingredients '.repeat(700)}` }, { title: 'Other', text: 'Remaining instructions' }], related: records };

function setup(t) {
    const dir = mkdtempSync(join(tmpdir(), 'dos2 test space '));
    const store = new Store(dir);

    t.after(() => {
        store.close(); rmSync(dir, { recursive: true, force: true });
    });

    return { dir, store };
}

function fake(user = alice, type = 'command', customId = undefined) {
    const calls = [];

    return {
        user: { id: user }, context: 2, commandName: 'dos2', customId, calls,
        options: { getSubcommand: () => 'search', getString: (key) => key === 'query' ? 'search' : null },
        isChatInputCommand: () => type === 'command', isMessageComponent: () => type === 'button', isAutocomplete: () => type === 'autocomplete', isModalSubmit: () => type === 'modal',
        async reply(p) {
            calls.push(['reply', p]); this.replied = true; this.ephemeral = p.flags === 64;
        },
        async deferReply(p) {
            calls.push(['deferReply', p]); this.deferred = true; this.ephemeral = p?.flags === 64;
        },
        async deferUpdate() {
            calls.push(['deferUpdate']); this.deferred = true;
        },
        async editReply(p) {
            calls.push(['editReply', p]);
        }, async respond(p) {
            calls.push(['respond', p]);
        },
    };
}

function limits(payload) {
    assert.ok(payload.content.length <= 2_000, payload.content.length);
    assert.ok(payload.components.length <= 5);

    for (const row of payload.components) {
        assert.ok(row.components.length <= 5);

        for (const c of row.components) {
            if (c.custom_id) {
                assert.ok(c.custom_id.length <= 100);
            }

            if (c.options) {
                assert.ok(c.options.length <= 25);
            }
        }
    }

    assert.deepEqual(payload.allowedMentions, { parse: [] });
}

test('global user install definition has no guild requirement', () => {
    assert.deepEqual(command.integration_types, [1]); assert.deepEqual(command.contexts, [2]);
    assert.equal(JSON.stringify(command).includes('guild'), false);
    assert.deepEqual(command.options.map((o) => o.name), ['search', 'craft', 'skill', 'item', 'help']);
});
test('default access fails closed and IDs preserve precision', () => {
    assert.equal(permitted(config({}), alice), false);
    assert.throws(() => validateDiscord(config({})), /Allowlist is empty/);
    assert.throws(() => config({ ACCESS_MODE: 'PUBLIC' }), /ACCESS_MODE/);
    assert.throws(() => config({ ALLOWED_USER_IDS: '123bad' }), /decimal/);
    assert.equal(permitted(cfg, alice), true); assert.equal(permitted(cfg, bob), true); assert.equal(permitted(cfg, outsider), false);
    assert.equal(permitted(config({ ACCESS_MODE: 'public' }), outsider), true);
});
test('exact, aliases, spelling variants and fuzzy names rank without merging books', () => {
    const entries = ['Elemental Totem Scroll', 'Blank Summoning Skillbook', 'Elemental Totem', 'Other'].map(entry);

    assert.equal(rank('Elemental Totem Skillbook', entries)[0].title, 'Elemental Totem');
    assert.equal(rank('Blank Summoning Skillbook', entries)[0].title, 'Blank Summoning Skillbook');
    assert.equal(rank('Elementl Totem', entries)[0].title, 'Elemental Totem');
    assert.equal(rank('physical armor', ['Leather Armour', 'Physical and Magical Armor (Original Sin 2)'].map(entry))[0].title, 'Physical and Magical Armor (Original Sin 2)');
    assert.equal(rank('scrollbook', entries).length, entries.length);
});
test('real API fixture preserves every recipe ingredient and alternative row', () => {
    const parsed = parseArticle(providers[0], JSON.parse(readFileSync(new URL('fixtures/elemental-totem.json', import.meta.url))));
    const craft = parsed.sections.find((s) => s.title === 'Crafting').text;

    for (const name of ['Sheet of Paper', 'Wooden Figurine', 'Tormented Soul', 'High Quality Tormented Soul', 'Alien Tormented Soul']) {
        assert.ok(craft.includes(name));
    }

    assert.ok(craft.split('Elemental Totem Scroll').length >= 4);
    assert.ok(parsed.related.some((link) => link.title === 'Blank Summoning Skillbook'));
    assert.match(parsed.edition, /Definitive/);
    assert.ok(!parsed.sections.some((s) => /<script|mw-parser-output/.test(s.text)));
});
test('unknown recipes, edition mismatch, Gift Bag conditions, unsafe links and malformed markup', () => {
    // eslint-disable-next-line unicorn/consistent-function-scoping
    const response = (html) => ({ parse: { title: 'Test', categories: [{ '*': 'Original_Sin_2_ingredients' }], text: { '*': html } } });
    const parsed = parseArticle(providers[0], response('<p>Useful item description</p><h2>Crafting</h2><p>Gift Bag: Herb Gardens must be activated.</p><table><tr><td>Output</td><td>2 Quills</td><td>Leather Cover</td></tr></table>'));

    assert.match(parsed.sections[1].text, /GAMEPLAY-CHANGING/); assert.match(parsed.sections[1].text, /2 Quills/); assert.match(parsed.edition, /unknown/);
    const unknown = parseArticle(providers[0], response('<p>Item and NPC mentioned, without a sale relationship.</p>'));

    assert.match(unknown.sections.at(-1).text, /No recipe found in this source/);
    assert.throws(() => parseArticle(providers[0], {}), /markup/);
    assert.throws(() => parseArticle(providers[0], response('<script>bad()</script>')), /No useful/);
    assert.throws(() => parseArticle(providers[0], { parse: { title: 'Other', categories: [{ '*': 'Divine_Divinity_items' }], text: { '*': '<p>Other game</p>' } } }), /another game/);
    assert.equal(relatedLink(providers[0], 'https://evil.example/wiki/Thing', 'Thing'), null);
    assert.equal(relatedLink(providers[0], '/wiki/File:Thing', 'Thing'), null);
});
test('cache deduplicates, persists, preserves good data on failure and labels stale', async (t) => {
    const { dir, store } = setup(t); let calls = 0;
    const fetcher = async () => {
        calls++; await new Promise((resolve) => {
            setTimeout(resolve, 5);
        });

        return ['good'];
    };

    await Promise.all([store.cached('x', 10_000, fetcher), store.cached('x', 10_000, fetcher)]);
    assert.equal(calls, 1); await store.cached('x', 10_000, fetcher); assert.equal(calls, 1);
    const stale = await store.cached('x', 10_000, async () => {
        throw new Error('outage');
    }, true);

    assert.equal(stale.stale, true); assert.deepEqual(stale.value, ['good']);
    const other = new Store(dir);

    assert.deepEqual((await other.cached('x', 10_000, fetcher)).value, ['good']); other.close();
    await assert.rejects(store.cached('bad', 10, async () => {
        throw new Error('failure');
    }));
    assert.equal(store.db.prepare('SELECT key FROM cache WHERE key=?').get('bad'), undefined);
    await store.cached('empty', 100_000, async () => []);
    store.db.prepare('UPDATE cache SET at=? WHERE key=?').run(Date.now() - 61_000, 'empty');
    await store.cached('empty', 100_000, async () => {
        calls++;

        return [];
    }); assert.equal(calls, 2);
});
test('opaque immutable controls survive restart; expiry and malformed callbacks recover', (t) => {
    const { dir, store } = setup(t); const id = store.control({ kind: 'detail', entry: records[0] });
    const other = new Store(dir);

    assert.equal(other.read(id).entry.title, records[0].title); other.close();
    assert.equal(store.read('d2:https://evil.example'), null);
    store.db.prepare('UPDATE controls SET expires=0 WHERE id=?').run(id); assert.equal(store.read(id), null);
});
test('shared outgoing payloads contain no titles, prose, source URLs or hidden metadata', (t) => {
    const { store } = setup(t); const shared = listView(store, records);

    limits(shared);
    const serialized = JSON.stringify(shared);

    assert.ok(!serialized.includes('Secret')); assert.ok(!serialized.includes('https:'));
    const before = store.read(shared.components[0].components[0].custom_id);

    listView(store, records, 1);
    assert.equal(before.entry.title, records[0].title);
    assert.equal(store.read(shared.components[0].components[0].custom_id).entry.title, records[0].title);
});
test('all detail chunks and controls fit Discord and preserve complete escaped source text', (t) => {
    const { store } = setup(t); let full = '';
    const pages = chunks(article.sections[0].text);

    for (const [page, page_] of pages.entries()) {
        full += page_; limits(detailView(store, records[0], article, alice, { page }));
    }

    assert.equal(full, safe(article.sections[0].text)); assert.ok(!full.includes('@everyone')); assert.ok(!full.includes('https://example.com'));
});
test('both allowed actors can command and click shared Reveal; defer happens before slow work', async (t) => {
    const { store } = setup(t);
    let current;
    const lookup = {
        async search() {
            assert.equal(current.calls[0][0], 'deferReply');

            return { value: records };
        }, async detail() {
            assert.deepEqual(current.calls[0], ['deferReply', { flags: 64 }]);

            return { value: article };
        },
    };
    const route = router(cfg, store, lookup);
    const shared = listView(store, records); const id = shared.components[0].components[0].custom_id;

    for (const user of [alice, bob]) {
        current = fake(user); await route(current); assert.equal(current.calls.length, 2);
        current = fake(user, 'button', id); await route(current); assert.equal(current.calls[0][1].flags, 64);
        assert.equal(current.calls.length, 2); assert.equal(current.ephemeral, true);
        const privatePayload = current.calls[1][1];

        for (const row of privatePayload.components) {
            for (const control of row.components) {
                if (control.custom_id) {
                    assert.equal(store.read(control.custom_id).owner, user);
                }
            }
        }
    }
});
test('unauthorized users rejected on every route; public mode keeps private ownership', async (t) => {
    const { store } = setup(t); const route = router(cfg, store, {});

    for (const type of ['command', 'button', 'modal', 'autocomplete']) {
        const interaction = fake(outsider, type, 'bad');

        await route(interaction);
        assert.equal(interaction.calls.length, 1); assert.equal(interaction.calls[0][0], type === 'autocomplete' ? 'respond' : 'reply');
    }

    const id = store.control({ kind: 'detail', entry: records[0], owner: alice });

    for (const policy of [cfg, config({ ACCESS_MODE: 'public' })]) {
        const interaction = fake(bob, 'button', id);

        await router(policy, store, {})(interaction);
        assert.match(interaction.calls[0][1].content, /belongs to another/); assert.equal(interaction.calls[0][1].flags, 64);
    }
});
test('private list, section, pagination, related, refresh and errors stay ephemeral', async (t) => {
    const { store } = setup(t); const lookup = {
        async detail() {
            return { value: article };
        },
    };
    const route = router(cfg, store, lookup);
    const states = [{ kind: 'list', owner: alice, results: records, page: 1 }, ...[{ section: 1 }, { page: 1 }, { refresh: true }, { relatedPage: 1 }].map((state) => ({ kind: 'detail', owner: alice, entry: records[0], ...state })), { kind: 'related', owner: alice, provider: 'fandom', related: records }];

    for (const state of states) {
        const interaction = fake(alice, 'button', store.control(state));

        interaction.values = ['0']; await route(interaction);
        assert.deepEqual(interaction.calls[0], ['deferReply', { flags: 64 }]); assert.equal(interaction.calls[1][0], 'editReply'); assert.equal(interaction.ephemeral, true);
    }

    const bad = fake(alice, 'button', store.control({ kind: 'detail', owner: alice, entry: records[0] }));

    await router(cfg, store, {
        async detail() {
            throw new Error('Secret story');
        },
    })(bad);
    assert.equal(bad.ephemeral, true); assert.ok(!JSON.stringify(bad.calls).includes('Secret story'));
});
test('shared pagination updates shared message without leaking titles; malformed buttons are private errors', async (t) => {
    const { store } = setup(t); const route = router(cfg, store, {});
    const shared = listView(store, records); const next = shared.components[1].components[0].custom_id;
    const click = fake(bob, 'button', next);

    await route(click);
    assert.equal(click.calls[0][0], 'deferUpdate'); assert.ok(!JSON.stringify(click.calls).includes('Secret story'));
    const bad = fake(alice, 'button', 'malformed');

    await route(bad); assert.equal(bad.calls[0][1].flags, 64);
});
test('per-user/global limits bound public use', () => {
    const limit = new Limits();

    for (let i = 0; i < 12; i++) {
        assert.ok(limit.allow(alice, 100_000));
    }

    assert.equal(limit.allow(alice, 100_000), false);

    for (let i = 0; i < 48; i++) {
        assert.ok(limit.allow(String(i), 100_000));
    }

    assert.equal(limit.allow(bob, 100_000), false); assert.ok(limit.allow(bob, 200_000));
});
test('source fallback works, invalid entries cannot fetch arbitrary URLs', async (t) => {
    const { store } = setup(t); const lookup = new Lookup(store, {}, cfg);

    lookup.adapters[0].search = async () => {
        throw new Error('outage');
    };

    lookup.adapters[1].search = async () => [{ ...entry('Test'), provider: 'independent', url: articleUrl(providers[1], 'Test') }];
    assert.equal((await lookup.search('Test')).value[0].provider, 'independent');
    await assert.rejects(lookup.detail({ ...entry('Test'), url: 'https://evil.example' }), /Invalid/);
});
test('HTTP rejects arbitrary hosts and validates every redirect destination', async (t) => {
    const http = new Http();

    await assert.rejects(http.request('https://example.com/api.php'), /rejected/);
    t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 302, headers: { location: 'https://evil.example/api.php' } }));
    await assert.rejects(http.request('https://divinity.fandom.com/api.php'), /rejected/);
});
