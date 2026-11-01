import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { EmbedBuilder, StringSelectMenuBuilder } from 'discord.js';
import { readable } from '../src/cards.js';
import { titleCatalog } from '../src/catalog.js';
import { Http } from '../src/http.js';
import { listView, detailView, chunks } from '../src/render.js';
import { matches, rank } from '../src/search.js';
import { Store } from '../src/store.js';
import { verify } from '../src/verification.js';
import { parseArticle } from '../src/wiki-pages.js';

const names = ['Conjure Incarnate', 'Conjure Incarnate Skillbook', 'Elemental Totem', 'Elemental Totem Skillbook', 'Elemental Totem Scroll', 'Blank Summoning Skillbook', 'Physical and Magical Armor'];
const entries = names.map((title) => ({ title, url: `https://dos2.wiki/wiki/${title.replaceAll(' ', '_')}` }));
const search = (query) => rank(query, entries.filter((entry) => matches(query, entry.title)));

test('equally relevant sources prefer Fextralife even when another source has category hints; exact matches still lead', () => {
    const candidates = [
        { title: 'Time Warp', url: 'https://dos2.wiki/wiki/Time_Warp', provider: 'dos2wiki', categories: ['skills'] },
        { title: 'Time Warp', url: 'https://divinityoriginalsin2.wiki.fextralife.com/Time_Warp', provider: 'fextralife' },
        { title: 'Time Warp', url: 'https://forums.larian.com/ubbthreads.php?ubb=showflat&Number=1', provider: 'larian' },
    ];

    assert.deepEqual(rank('Time Warp', candidates, 'skills').map((e) => e.provider), ['fextralife', 'dos2wiki', 'larian']);
    candidates[1].title = 'Time Warp Scroll';
    assert.equal(rank('Time Warp', candidates, 'skills')[0].provider, 'dos2wiki');
    const sameSource = [{ ...candidates[0], url: 'unclassified', categories: undefined }, { ...candidates[0], url: 'preferred' }];

    assert.equal(rank('Time Warp', sameSource, 'skills')[0].url, 'preferred');
});

function setup(t) {
    const dir = mkdtempSync(join(tmpdir(), 'dos2 fuzzy cards ')); const store = new Store(dir);

    t.after(() => {
        store.close(); rmSync(dir, { recursive: true, force: true });
    });

    return { store, dir };
}

function validate(card) {
    assert.ok(card.components.length <= 5);

    for (const row of card.components) {
        for (const component of row.components) {
            if (component.type === 3) {
                StringSelectMenuBuilder.from(component).toJSON();
            }
        }
    }

    for (const embed of card.embeds) {
        EmbedBuilder.from(embed).toJSON(); const fields = embed.fields || [];

        assert.ok(fields.length <= 25); assert.ok((embed.description || '').length <= 4_096); assert.ok(fields.every((field) => field.value.length <= 1_024)); assert.ok((embed.title + embed.description + fields.map((field) => field.name + field.value).join('') + embed.footer.text).length < 6_000);
    }
}

test('fuzzy matching handles incomplete names, swapped letters, reordered words and multiple typos', () => {
    for (const [query, expected] of [['conjur incarnte', 'Conjure Incarnate'], ['incar', 'Conjure Incarnate'], ['totem elemental', 'Elemental Totem'], ['ttoem', 'Elemental Totem'], ['elementl ttoem skillbok', 'Elemental Totem Skillbook'], ['summoning book', 'Blank Summoning Skillbook'], ['blank summoning skill book', 'Blank Summoning Skillbook'], ['physical armor', 'Physical and Magical Armor']]) {
        assert.equal(search(query)[0]?.title, expected, query);
    }

    assert.deepEqual(search('xyzzyplugh'), []); assert.deepEqual(search('incarnate xyzzyplugh'), []); assert.equal(matches('totem totem', 'Elemental Totem'), false);
});
test('exact identities stay first and scroll/book/blank alternatives are not merged', () => {
    for (const name of names) {
        assert.equal(search(name)[0].title, name);
    }

    assert.ok(search('totem').some((entry) => entry.title.endsWith('Scroll'))); assert.ok(search('totem').some((entry) => entry.title.endsWith('Skillbook')));
    assert.deepEqual(search('elementl totem skillbok').map((entry) => entry.title), ['Elemental Totem Skillbook']);
    assert.ok(search('scrollbook').some((entry) => entry.title.endsWith('Scroll'))); assert.ok(search('scrollbook').some((entry) => entry.title.endsWith('Skillbook')));
});
test('sitemap title catalog is filtered, cached, persistent and retained stale on failure', async (t) => {
    const { store, dir } = setup(t); let count = 0;
    const http = {
        async text(url) {
            count++;

            return url.endsWith('sitemap-index-dos2wiki.xml') ? '<sitemapindex><sitemap><loc>https://dos2.wiki/sitemap/sitemap-dos2wiki-0.xml</loc></sitemap></sitemapindex>' : '<urlset><url><loc>https://dos2.wiki/wiki/Elemental_Totem_Skillbook</loc></url><url><loc>https://dos2.wiki/wiki/File:Image.png</loc></url><url><loc>https://evil.example/wiki/Bad</loc></url></urlset>';
        },
    };
    const first = await titleCatalog(store, http, 100_000);

    assert.equal(first.value.length, 1); assert.equal(first.value[0].title, 'Elemental Totem Skillbook'); assert.equal(count, 2);
    await titleCatalog(store, http, 100_000); assert.equal(count, 2);
    const reopened = new Store(dir);

    await titleCatalog(reopened, http, 100_000); reopened.close(); assert.equal(count, 2);
    http.text = async () => {
        throw new Error('outage');
    };

    const stale = await titleCatalog(store, http, 100_000, true);

    assert.equal(stale.stale, true); assert.deepEqual(stale.value, first.value);
});
test('sitemap discovery fails closed on external destinations or unexpected XML', async (t) => {
    const { store } = setup(t); let calls = 0;

    await assert.rejects(titleCatalog(store, {
        async text() {
            calls++;

            return '<sitemapindex><sitemap><loc>https://evil.example/sitemap/sitemap-dos2wiki-0.xml</loc></sitemap></sitemapindex>';
        },
    }, 100), /rejected/); assert.equal(calls, 1);
    await assert.rejects(titleCatalog(store, {
        async text() {
            return '<html>Unexpected response</html>';
        },
    }, 100), /Unexpected/);
});
test('item overview shows source stats, complete recipe, usage and icon rather than technical metadata', (t) => {
    const { store } = setup(t); const record = verify(parseArticle(readFileSync(new URL('fixtures/dos2-Elemental_Totem_Skillbook.html', import.meta.url), 'utf8')));
    const card = detailView(store, record, record, null);

    validate(card); const embed = card.embeds[0];

    assert.equal(embed.title, 'Elemental Totem Skillbook'); assert.ok(embed.thumbnail.url.startsWith('https://cdn.dos2.wiki/'));
    const fields = Object.fromEntries(embed.fields.map((field) => [field.name, field.value]));

    assert.equal(fields.Weight, '0.5'); assert.equal(fields.Value, '120');
    assert.match(fields['Crafting recipe'], /Blank Summoning Skillbook/); assert.match(fields['Crafting recipe'], /Elemental Totem Scroll/); assert.match(fields['Used to craft'], /Electric Infusion Skillbook/);
    assert.ok(!JSON.stringify(embed).includes('Summon_TotemFromSurface')); assert.ok(card.components[0].components[0].options.some((option) => option.label === 'Crafting recipe'));
});
test('large recipe cards paginate every ingredient and expose direct section selection', (t) => {
    const { store } = setup(t); const ingredients = Array.from({ length: 400 }, (_, i) => `Ingredient ${i}`);
    const text = `Product | Ingredients\nExample item | ${ingredients.join(' | ')}`;
    const record = { title: 'Example item', url: 'https://dos2.wiki/wiki/Example_item', provider: 'dos2wiki', source: 'dos2.wiki', entityType: 'item', edition: 'Unknown', retrievedAt: '2026-11-01', fields: { summary: 'Item description' }, recipes: [{ output: 'Example item', ingredients }], usedIn: [], sections: [{ title: 'Crafting', text }], related: Array.from({ length: 40 }, (_, i) => ({ title: `Item ${i}`, url: `https://dos2.wiki/wiki/Item_${i}`, entityType: 'item' })) };
    const overview = detailView(store, record, record, null);

    validate(overview); assert.match(overview.embeds[0].fields.find((field) => field.name === 'Crafting recipe').value, /complete information/);
    const pages = chunks(readable(text)); let content = '';

    for (let page = 0; page < pages.length; page++) {
        const card = detailView(store, record, record, null, { sectionKey: `source:${JSON.stringify(['Crafting'])}`, page, relatedPage: 1 });

        validate(card); content += card.embeds[0].description;
    }

    for (const ingredient of ingredients) {
        assert.ok(content.includes(ingredient));
    }
});
test('blank output cells stay unknown rather than promoting an ingredient to recipe output', () => {
    const title = 'Example'; const html = `<link rel="canonical" href="https://dos2.wiki/wiki/${title}"><h1 id="firstHeading">${title}</h1><script>var x={"wgRevisionId":1};</script><div id="mw-content-text"><div class="mw-parser-output"><p>Item</p><h2>Used in</h2><table><tr><th>Product</th><th>Ingredients</th></tr><tr><td></td><td>Eternal Artefact</td><td>Gloves</td></tr></table></div></div>`;
    const record = parseArticle(html);

    assert.equal(record.usedIn[0].output, null); assert.deepEqual(record.usedIn[0].ingredients, ['Eternal Artefact', 'Gloves']);
    assert.match(readable(record.sections.find((section) => section.title === 'Used in').text), /Output not specified/);
});

test('empty search cards validate and sitemap access cannot expand to arbitrary endpoints', async (t) => {
    const { store } = setup(t);

    validate(listView(store, []));
    const http = new Http();

    t.mock.method(globalThis, 'fetch', async () => new Response('<urlset/>', { status: 200 }));
    await http.request('https://dos2.wiki/sitemap/sitemap-index-dos2wiki.xml'); await http.request('https://dos2.wiki/sitemap/sitemap-dos2wiki-0.xml');

    for (const url of ['https://dos2.wiki/sitemap/other.xml', 'https://dos2.wiki/sitemap/sitemap-dos2wiki-0.xml?search=a', 'https://evil.example/sitemap/sitemap-dos2wiki-0.xml']) {
        await assert.rejects(http.request(url), /rejected/);
    }
});
