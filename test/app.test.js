import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { EmbedBuilder, StringSelectMenuBuilder } from 'discord.js';
import { command } from '../src/commands.js';
import { config, permitted, validateDiscord } from '../src/config.js';
import { Http } from '../src/http.js';
import { listView, detailView, chunks, safe } from '../src/render.js';
import { router, Limits } from '../src/router.js';
import { rank } from '../src/search.js';
import { parseArticle, providers, articleUrl, Lookup } from '../src/sources.js';
import { Store } from '../src/store.js';

const alice = '900000000000000001'; const bob = '900000000000000002'; const outsider = '900000000000000003';
const cfg = config({ ALLOWED_USER_IDS: `${alice},${bob}` });
const entry = (title) => ({ title, url: articleUrl(providers[0], title), provider: 'dos2wiki', source: 'Test source', categories: [] });
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

const display = (payload) => [payload.content, ...(payload.embeds || []).flatMap((embed) => [embed.title, embed.description, ...(embed.fields || []).flatMap((field) => [field.name, field.value])])].filter(Boolean).join('\n');

function selectSection(payload, label) {
    const select = payload.components.flatMap((row) => row.components).find((c) => c.type === 3 && c.placeholder === 'Choose information to view');
    const option = select.options.find((option) => option.label === label);

    assert.ok(option, label);

    return { id: select.custom_id, value: option.value };
}

function limits(payload) {
    for (const embed of payload.embeds || []) {
        EmbedBuilder.from(embed).toJSON();
        assert.ok((embed.description || '').length <= 4_096);
        assert.ok((embed.fields || []).length <= 25);
        let size = (embed.title || '').length + (embed.description || '').length + (embed.footer?.text || '').length;

        for (const field of embed.fields || []) {
            assert.ok(field.value.length <= 1_024); size += field.name.length + field.value.length;
        }

        assert.ok(size <= 6_000, size);
    }

    assert.ok(payload.content.length <= 2_000, payload.content.length);
    assert.ok(payload.components.length <= 5);

    for (const row of payload.components) {
        assert.ok(row.components.length <= 5);

        for (const c of row.components) {
            if (c.custom_id) {
                assert.ok(c.custom_id.length <= 100);
            }

            if (c.options) {
                StringSelectMenuBuilder.from(c).toJSON();
                assert.ok(c.options.length <= 25);
            }
        }
    }

    assert.deepEqual(payload.allowedMentions, { parse: [] });
}

test('global user install definition has no guild requirement', () => {
    assert.deepEqual(command.integration_types, [1]); assert.deepEqual(command.contexts, [2]);
    assert.equal(JSON.stringify(command).includes('guild'), false);
    assert.deepEqual(command.options.map((o) => o.name), ['search', 'craft', 'skill', 'item', 'forum', 'fextralife', 'help']);
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

    assert.equal(rank('Elemental Totem Skillbook', [...entries, entry('Elemental Totem Skillbook')])[0].title, 'Elemental Totem Skillbook');
    assert.equal(rank('Blank Summoning Skillbook', entries)[0].title, 'Blank Summoning Skillbook');
    assert.equal(rank('Elementl Totem', entries)[0].title, 'Elemental Totem');
    assert.equal(rank('physical armor', ['Leather Armour', 'Physical and Magical Armor (Original Sin 2)'].map(entry))[0].title, 'Physical and Magical Armor (Original Sin 2)');
    assert.equal(rank('scrollbook', entries).length, entries.length);
});
test('real dos2.wiki fixtures preserve recipe links and remove hidden stat placeholders', () => {
    const parsed = parseArticle(readFileSync(new URL('fixtures/dos2-Elemental_Totem_Skillbook.html', import.meta.url), 'utf8'));
    const craft = parsed.sections.find((s) => s.title === 'Crafting').text;

    for (const ingredient of ['Blank Summoning Skillbook', 'Elemental Totem Scroll']) {
        assert.ok(craft.includes(ingredient)); assert.ok(parsed.related.some((link) => link.title === ingredient));
    }

    assert.ok(!parsed.sections.some((s) => /Strength|Critical Chance|<script/.test(s.text)));
    assert.ok(parsed.revision); assert.match(parsed.contentHash, /^[\da-f]{64}$/);
    assert.match(parsed.edition, /not independently/);
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
        full += page_; const card = detailView(store, records[0], article, alice, { page, sectionKey: `source:${JSON.stringify([article.sections[0].title])}` });

        limits(card); assert.equal(card.embeds[0].description, page_);
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
test('retired providers and arbitrary detail URLs fail clearly', async (t) => {
    const { store } = setup(t); const lookup = new Lookup(store, {}, cfg);

    assert.throws(() => lookup.detail({ ...entry('Test'), url: 'https://evil.example' }), /invalid entry/);
    assert.throws(() => lookup.detail({ ...entry('Test'), provider: 'fandom' }), /Source changed/);
});
test('HTTP rejects arbitrary hosts and validates every redirect destination', async (t) => {
    const http = new Http();

    await assert.rejects(http.request('https://example.com/api.php'), /rejected/);
    t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 302, headers: { location: 'https://evil.example/api.php' } }));
    await assert.rejects(http.request('https://dos2.wiki/wiki/Test'), /rejected/);
});

test('routine names, recipes, stats and ordinary acquisition are shared for both actors', async (t) => {
    const { store } = setup(t);
    const item = { ...entry('Elemental Totem Skillbook'), entityType: 'skillbook', sourceCategories: ['Skillbooks'] };
    const record = { ...article, ...item, sections: [{ title: 'Crafting', text: 'Blank Summoning Skillbook + Elemental Totem Scroll' }, { title: 'Locations', text: 'Sold by a summoning vendor in Fort Joy.' }], related: [] };
    const shared = listView(store, [item]);

    assert.ok(display(shared).includes(item.title)); assert.equal(shared.components[0].components[0].label, 'View 1');
    let current; const lookup = {
        async detail() {
            assert.ok(['deferReply', 'deferUpdate'].includes(current.calls[0][0]));

            return { value: record };
        },
    };
    const route = router(cfg, store, lookup);

    for (const user of [alice, bob]) {
        current = fake(user, 'button', shared.components[0].components[0].custom_id); await route(current);
        assert.equal(current.ephemeral, false); assert.match(display(current.calls[1][1]), /Blank Summoning Skillbook/);
        const next = selectSection(current.calls[1][1], 'Where to find');

        current = fake(user, 'button', next.id); current.values = [next.value]; await route(current); assert.equal(current.calls[0][0], 'deferUpdate'); assert.match(display(current.calls[1][1]), /Fort Joy/);
    }
});
test('mixed articles share routine sections and reveal narrative sections in a new private flow', async (t) => {
    const { store } = setup(t); const item = { ...entry('Example Potion'), entityType: 'item', sourceCategories: ['Potions'] };
    const record = { ...article, ...item, sections: [{ title: 'Effects', text: 'Restores 30 vitality.' }, { title: 'Quest outcome SECRET_HEADING', text: 'SECRET_PLOT and the ending.' }, { title: 'Recipe', text: 'Bottle + ingredient' }], related: [{ ...entry('SECRET_CHARACTER'), sourceCategories: ['Characters'] }] };
    const publicView = detailView(store, item, record, null);

    limits(publicView); assert.match(display(publicView), /Restores 30/); assert.ok(!JSON.stringify(publicView).includes('SECRET'));
    const reveal = publicView.components.flatMap((row) => row.components).find((c) => c.label === 'Reveal story details');

    assert.ok(reveal);
    const lookup = {
        async detail() {
            return { value: record };
        },
    }; const route = router(cfg, store, lookup);
    const click = fake(bob, 'button', reveal.custom_id);

    await route(click); assert.deepEqual(click.calls[0], ['deferReply', { flags: 64 }]);
    const next = selectSection(click.calls[1][1], 'Quest outcome SECRET_HEADING');
    const nextClick = fake(bob, 'button', next.id);

    nextClick.values = [next.value];

    await route(nextClick); assert.equal(nextClick.ephemeral, true); assert.ok(display(nextClick.calls[1][1]).includes(safe('SECRET_PLOT')));
    const wrongActor = fake(alice, 'button', next.id);

    await route(wrongActor); assert.match(wrongActor.calls[0][1].content, /belongs to another/);
});
test('changed source metadata cannot publish a story through a previously public control', async (t) => {
    const { store } = setup(t); const item = { ...entry('Example Potion'), entityType: 'item' };
    const record = { ...article, ...entry('SECRET_STORY_TITLE'), sourceCategories: ['Quests'], sections: [{ title: 'Ending', text: 'SECRET_PLOT' }], related: [] };
    const state = store.control({ kind: 'detail', entry: item, owner: null, refresh: true }); const click = fake(alice, 'button', state);

    await router(cfg, store, {
        async detail() {
            return { value: record };
        },
    })(click);
    assert.deepEqual(click.calls[0], ['deferReply', undefined]); assert.ok(!JSON.stringify(click.calls).includes('SECRET'));
    assert.match(click.calls[1][1].content, /story content/);
});
test('search preview uses source metadata after deferring and ignores the requested category for disclosure', async (t) => {
    const { store } = setup(t); const result = { ...entry('SECRET_QUEST_TITLE'), categories: ['skills'] }; const interaction = fake(alice);
    const lookup = {
        async search() {
            return { value: [result] };
        }, async preview(results) {
            assert.equal(interaction.calls[0][0], 'deferReply');

            return results.map((entry) => ({ ...entry, entityType: 'item', sourceCategories: ['Quests'] }));
        },
    };

    interaction.options.getSubcommand = () => 'skill'; await router(cfg, store, lookup)(interaction);
    assert.ok(!JSON.stringify(interaction.calls).includes('SECRET_QUEST_TITLE')); assert.match(display(interaction.calls[1][1]), /Reveal privately/);
});

test('nested narrative context stays hidden and public related previews cannot reveal story text', async (t) => {
    const { store } = setup(t); const item = { ...entry('Example Potion'), entityType: 'item' };
    const record = { ...article, ...item, sections: [{ title: 'Effects', text: 'Restores vitality' }, { title: 'Choice one', headings: ['Quest outcomes', 'Choice one'], text: 'SECRET_RESOLUTION' }], related: [entry('SECRET_NPC')] };
    const shared = detailView(store, item, record, null);

    assert.ok(!JSON.stringify(shared).includes('SECRET'));
    const select = shared.components.flatMap((row) => row.components).find((c) => c.type === 3 && c.placeholder.startsWith('Look up'));

    assert.ok(select); assert.match(select.options[0].label, /preview/);
    const click = fake(bob, 'button', select.custom_id);

    click.values = ['0'];
    const story = { ...article, sourceCategories: ['Characters'], title: 'SECRET_NPC' };

    await router(cfg, store, {
        async detail() {
            return { value: story };
        },
    })(click);
    assert.equal(click.calls[0][0], 'deferUpdate'); assert.ok(!JSON.stringify(click.calls).includes('SECRET'));
    assert.match(click.calls[1][1].content, /Reveal it privately/);
});

test('section selection stays on the same topic when source sections reorder; invalid selections fail privately', async (t) => {
    const { store } = setup(t); const record = { ...article, ...entry('Example Potion'), entityType: 'item', sections: [{ title: 'Effects', text: 'Restores vitality' }, { title: 'Crafting', text: 'Ingredient A + Ingredient B' }], related: [] };
    const original = detailView(store, record, record, null); const section = selectSection(original, 'Crafting recipe');
    const changed = { ...record, sections: [...record.sections].reverse() }; let fetched = 0; const route = router(cfg, store, {
        async detail() {
            fetched++;

            return { value: changed };
        },
    });
    const click = fake(bob, 'button', section.id);

    click.values = [section.value]; await route(click); assert.equal(click.calls[0][0], 'deferUpdate'); assert.match(display(click.calls[1][1]), /Ingredient A/); assert.match(click.calls[1][1].embeds[0].footer.text, /Crafting recipe/);
    const invalid = fake(alice, 'button', section.id);

    invalid.values = ['99']; await route(invalid); assert.equal(invalid.calls[0][1].flags, 64); assert.equal(fetched, 1);
});

test('supplementary commands and source buttons defer before retrieval and preserve access/private ownership', async (t) => {
    const { store } = setup(t); let calls = 0;
    const item = { ...article, ...entry('Example Skill'), entityType: 'skill', sections: [{ title: 'Effects', text: 'A routine mechanical effect' }], related: [] };
    const source = {
        async search(query) {
            calls++; assert.equal(query, 'Example Skill');

            return { value: [item], stale: false };
        },
    };
    const route = router(cfg, store, { forum: source, fextralife: source });

    for (const sub of ['forum', 'fextralife']) {
        const command = fake(alice);

        command.options = { getSubcommand: () => sub, getString: (key) => key === 'query' ? 'Example Skill' : null };
        await route(command); assert.equal(command.calls[0][0], 'deferReply'); limits(command.calls[1][1]);
        const shared = detailView(store, item, item, null, { results: [item] });
        const label = sub === 'forum' ? 'Forum discussions' : 'Fextralife lookup';
        const control = shared.components.flatMap((row) => row.components).find((c) => c.label === label);
        const click = fake(bob, 'button', control.custom_id);

        await route(click); assert.equal(click.calls[0][0], 'deferReply'); assert.equal(click.calls[0][1], undefined);
        const denied = fake(outsider, 'button', control.custom_id);

        await route(denied); assert.equal(denied.calls[0][1].flags, 64);
        const privateCard = detailView(store, item, item, alice);
        const privateControl = privateCard.components.flatMap((row) => row.components).find((c) => c.label === label);
        const wrongOwner = fake(bob, 'button', privateControl.custom_id);

        await route(wrongOwner); assert.equal(wrongOwner.calls[0][1].flags, 64);
        const own = fake(alice, 'button', privateControl.custom_id);

        await route(own); assert.equal(own.calls[0][1].flags, 64);
    }

    assert.equal(calls, 6);
});
