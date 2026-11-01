import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Http } from '../src/http.js';
import { matches } from '../src/search.js';
import { Lookup } from '../src/sources.js';
import { Store } from '../src/store.js';
import { verify } from '../src/verification.js';
import { parseArticle, relatedLink, provider } from '../src/wiki-pages.js';

const fixture = (title) => readFileSync(new URL(`fixtures/dos2-${title}.html`, import.meta.url), 'utf8');
const html = (title, body) => `<link rel="canonical" href="https://dos2.wiki/wiki/${title.replaceAll(' ', '_')}"><h1 id="firstHeading">${title}</h1><script>var metadata={"wgRevisionId":123};</script><div id="mw-content-text"><div class="mw-parser-output">${body}</div></div>`;

function setup(t) {
    const dir = mkdtempSync(join(tmpdir(), 'dos2 source tests ')); const store = new Store(dir);

    t.after(() => {
        store.close(); rmSync(dir, { recursive: true, force: true });
    });

    return { store, dir };
}

test('audited skill and recipe fields match DE definitions; changed or missing fields fail closed', () => {
    const skill = fixture('Elemental_Totem');
    const verified = verify(parseArticle(skill));

    assert.equal(verified.verification.status, 'audited-fields-match');
    assert.equal(verified.fields.actionPoints, 2); assert.equal(verified.fields.memory, 1);
    assert.equal(verified.sections[0].title, 'Verified Definitive Edition facts');
    assert.match(verified.sections[1].evidence, /not independently/);
    assert.throws(() => verify(parseArticle(skill.replace('Cooldown 1 turn', 'Cooldown 99 turn'))), /verification conflict/);
    const recipe = fixture('Elemental_Totem_Skillbook');

    assert.equal(verify(parseArticle(recipe)).verification.status, 'audited-fields-match');
    assert.throws(() => verify(parseArticle(recipe.replaceAll('Blank Summoning Skillbook', 'Mystery Ingredient'))), /verification conflict/);
    assert.equal(verify(parseArticle(fixture('Blank_Summoning_Skillbook'))).verification.status, 'source-only');
});
test('row spans, quantities, optional content, unknown recipes and related source links are preserved', () => {
    const parsed = parseArticle(html('Example', '<p>Source description</p><h2>Crafting</h2><table><tr><th>Product</th><th>Ingredient 1</th><th>Ingredient 2</th></tr><tr><td rowspan="2">Output</td><td rowspan="2">2 Quills</td><td>Leather Cover</td></tr><tr><td>Alternative Cover</td></tr></table><h2>Gift Bag Recipes</h2><p>Optional recipe</p><h3>Herb Gardens</h3><p>Another optional recipe</p>'));

    assert.match(parsed.sections[1].text, /Output \| 2 Quills \| Leather Cover/);
    assert.match(parsed.sections[1].text, /Output \| 2 Quills \| Alternative Cover/);
    assert.match(parsed.sections[2].text, /OPTIONAL GIFT BAG/); assert.match(parsed.sections[3].text, /OPTIONAL GIFT BAG/);
    const noRecipe = parseArticle(html('Example', '<p>NPC and item mentioned without an acquisition relationship.</p>'));

    assert.match(noRecipe.sections.at(-1).text, /No recipe found in this source/);
    assert.equal(relatedLink(provider, '/w/api.php', 'bad'), null); assert.equal(relatedLink(provider, '/wiki/File:Test', 'bad'), null);
    assert.equal(relatedLink(provider, 'https://evil.example/wiki/Test', 'bad'), null);
    assert.equal(relatedLink(provider, '/wiki/Test?search=foo', 'bad'), null);
    assert.equal(relatedLink(provider, '/wiki/Test#Crafting', 'Test').title, 'Test');
});
test('unexpected markup, wrong canonical host and empty content fail instead of becoming records', () => {
    assert.throws(() => parseArticle('<p>Cloudflare challenge</p>'), /markup/);
    assert.throws(() => parseArticle(html('Example', '<script>bad()</script>')), /No useful/);
    assert.throws(() => parseArticle(html('Example', '<p>Text</p>').replace('https://dos2.wiki', 'https://evil.example')), /identity/);
});
test('local search caches results/index HTML, deduplicates requests, and survives reopening SQLite', async (t) => {
    const { store, dir } = setup(t); let calls = 0;
    const http = {
        async text(url) {
            calls++; assert.match(url, /^https:\/\/dos2\.wiki\/wiki\//); assert.ok(!url.includes('?')); const title = decodeURIComponent(new URL(url).pathname.slice(6)).replaceAll('_', ' ');

            if (title === 'Elemental Totem Skillbook') {
                return fixture('Elemental_Totem_Skillbook');
            }

            return html(title, '<p>Index text</p><a href="/wiki/Elemental_Totem_Skillbook">Elemental Totem Skillbook</a><a href="/wiki/Elemental_Totem_Scroll">Elemental Totem Scroll</a>');
        },
    };
    const cfg = { cacheMs: 100_000 }; const lookup = new Lookup(store, http, cfg);
    const [a, b] = await Promise.all([lookup.search('Elemental Totem Skillbook', 'crafting'), lookup.search('Elemental Totem Skillbook', 'crafting')]);

    assert.deepEqual(a, b); assert.equal(a.value[0].title, 'Elemental Totem Skillbook'); assert.equal(calls, 3);
    await lookup.detail(a.value[0]); assert.equal(calls, 3);
    const reopened = new Store(dir);

    await new Lookup(reopened, http, cfg).search('Elemental Totem Skillbook', 'crafting'); assert.equal(calls, 3); reopened.close();
    const page = await lookup.detail(a.value[0], true);

    assert.equal(page.stale, false); assert.equal(calls, 4);
    http.text = async () => {
        throw new Error('outage');
    };

    const stale = await lookup.detail(a.value[0], true);

    assert.equal(stale.stale, true);
    const search = await lookup.search('Elemental Totem Skillbook', 'crafting', true);

    assert.equal(search.stale, true);
});
test('failed verification and source 404 preserve the last good article on refresh', async (t) => {
    const { store } = setup(t); let response = fixture('Elemental_Totem'); let missing = false;
    const http = {
        async text() {
            if (missing) {
                const error = new Error('missing');

                error.status = 404; throw error;
            }

            return response;
        },
    };
    const lookup = new Lookup(store, http, { cacheMs: 10_000 }); const entry = { title: 'Elemental Totem', url: 'https://dos2.wiki/wiki/Elemental_Totem', provider: 'dos2wiki' };
    const initial = await lookup.detail(entry);

    response = response.replace('Cooldown 1 turn', 'Cooldown 99 turn');
    const rejected = await lookup.detail(entry, true);

    assert.equal(rejected.stale, true); assert.equal(rejected.value.fields.cooldown, 1);
    missing = true; const stale = await lookup.detail(entry, true);

    assert.equal(stale.stale, true); assert.equal(stale.value.retrievedAt, initial.value.retrievedAt);
});
test('unknown queries stay empty and invalid queries cannot become network requests', async (t) => {
    assert.equal(matches('xyzzyplugh', 'Elemental Totem'), false); assert.equal(matches('Elementl Totem', 'Elemental Totem'), true);
    const { store } = setup(t); const lookup = new Lookup(store, {
        async text(url) {
            const title = decodeURIComponent(new URL(url).pathname.slice(6)).replaceAll('_', ' ');

            if (!['Crafting', 'Ingredients'].includes(title)) {
                const error = new Error('missing');

                error.status = 404; throw error;
            }

            return html(title, '<p>Index content</p><a href="/wiki/Elemental_Totem">Elemental Totem</a>');
        },
    }, { cacheMs: 100_000 });

    assert.deepEqual((await lookup.search('xyzzyplugh', 'crafting')).value, []);
    assert.throws(() => lookup.search('!!!'), /query/);
});
test('HTTP rejects namespaces, search/API URLs, encoded namespaces, credentials and host-changing redirects', async (t) => {
    const http = new Http();

    for (const url of ['https://dos2.wiki/w/api.php', 'https://dos2.wiki/wiki/Test?search=foo', 'https://dos2.wiki/wiki/File%3ATest', 'https://dos2.wiki/wiki/%2E%2E%2Fw%2Fapi.php', 'https://u:p@dos2.wiki/wiki/Test', 'https://divinity.fandom.com/api.php']) {
        await assert.rejects(http.request(url), /rejected/);
    }

    t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 302, headers: { location: 'https://dos2.wiki/w/api.php' } }));
    await assert.rejects(http.request('https://dos2.wiki/wiki/Test'), /rejected/);
});

test('Classic-only articles and nested Classic sections are excluded without dropping the following DE section', () => {
    assert.throws(() => parseArticle(html('Example Classic', '<p>Classic values</p>')), /Classic-only/);
    const record = parseArticle(html('Example', '<p>Introduction</p><h2>Classic Edition</h2><p>Hidden Classic values</p><h3>Nested</h3><p>Also Classic</p><h2>Definitive Edition</h2><p>DE source values</p>'));

    assert.ok(!record.sections.some((s) => s.text.includes('Hidden Classic') || s.text.includes('Also Classic')));
    assert.ok(record.sections.some((s) => s.text.includes('DE source values')));
});

test('a synchronous cache failure does not retain a rejected in-flight request', async (t) => {
    const { store } = setup(t);

    await assert.rejects(store.cached('retry-sync', 1_000, () => {
        throw new Error('temporary');
    }));
    assert.equal(store.pending.size, 0);
    assert.equal((await store.cached('retry-sync', 1_000, () => ['recovered'])).value[0], 'recovered');
});
