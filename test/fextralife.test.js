import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Fextralife, fextraUrl, parseFextra } from '../src/fextralife.js';
import { Store } from '../src/store.js';

const origin = 'https://divinityoriginalsin2.wiki.fextralife.com';
const url = `${origin}/Example_Skill`;
const html = `<title>Example Skill</title><link rel="canonical" href="${url}"><h1>Example Skill | Divinity Original Sin 2 Wiki</h1><script>var x={"wgCategories":["Skills"],"wgRevisionId":12};</script><div id="mw-content-text"><div class="mw-parser-output"><p>A source description long enough for the overview.</p><h2>Crafting</h2><table><tr><th>Product</th><th>Ingredients</th></tr><tr><td rowspan="2">Example Skill</td><td>2 Quills</td></tr><tr><td>Leather Cover</td></tr></table><h2>Classic Edition</h2><p>Classic-only values</p><h2>Definitive Edition</h2><p>Explicit DE section.</p><a href="/Other_Skill">Other Skill</a><div class="navbox">Unrelated navigation</div></div><div class="comments">Unverified user comment</div></div>`;

test('Fextralife URLs and canonical identities stay within ordinary DOS2 articles', () => {
    assert.equal(fextraUrl(`${origin}/Example+Skill#Crafting`), url);

    for (const bad of [`${origin}/Special:Search`, `${origin}/index.php`, `${origin}/Page?action=edit`, `${origin}/A%2FB`, 'https://fextralife.com/Example_Skill', 'https://user@divinityoriginalsin2.wiki.fextralife.com/Example_Skill']) {
        assert.equal(fextraUrl(bad), null, bad);
    }

    const record = parseFextra(html, url);

    assert.equal(record.revision, '12');
    assert.equal(record.provider, 'fextralife');
    assert.equal(record.entityType, 'skill');
    assert.match(record.sections.find((s) => s.title === 'Crafting').text, /Example Skill \| 2 Quills[\S\s]*Example Skill \| Leather Cover/);
    assert.ok(!JSON.stringify(record).includes('Classic-only values'));
    assert.ok(!JSON.stringify(record).includes('Unrelated navigation'));
    assert.ok(!JSON.stringify(record).includes('Unverified user comment'));
    assert.equal(record.related.length, 1);
    assert.equal(record.verification, undefined);
    assert.throws(() => parseFextra(html.replace(url, 'https://evil.test/Example_Skill'), url), /identity/);
    assert.throws(() => parseFextra('<title>Access denied</title>', url), /identity/);
});

test('Fextralife retrieves once, survives restarts/expiry/eviction offline, and refresh failures preserve raw and parsed data', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'dos2 fextra ')); let store = new Store(dir); let calls = 0; let response = html;

    t.after(() => {
        store.close(); rmSync(dir, { recursive: true, force: true });
    });
    const http = {
        async text(input) {
            calls++;

            return input.endsWith('/sitemap.xml') ? `<urlset><url><loc>${url}</loc></url><url><loc>https://evil.test/Bad</loc></url><url><loc>${origin}/Special:Search</loc></url></urlset>` : response;
        },
    };
    let source = new Fextralife(store, http);
    const results = await source.search('examp skill');

    assert.equal(results.value.length, 1);
    const first = await source.detail(results.value[0]);

    assert.equal(first.value.rawHtml, html);
    assert.equal(calls, 2);
    store.db.prepare('UPDATE cache SET at = 0').run();
    const insert = store.db.prepare('INSERT INTO cache VALUES (?, ?, ?)');

    for (let i = 0; i < 1_010; i++) {
        insert.run(`ordinary:${i}`, '{}', i);
    }

    store.clean(); store.close(); store = new Store(dir); source = new Fextralife(store, {
        text() {
            throw new Error('Network must not be used for cached data');
        },
    });
    assert.equal((await source.search('examp skill')).value.length, 1);
    assert.deepEqual((await source.detail(results.value[0])).value, first.value);
    assert.equal(calls, 2);
    source = new Fextralife(store, http); response = '<title>Unexpected markup</title>';
    const stale = await source.detail(results.value[0], true);

    assert.equal(stale.stale, true);
    assert.deepEqual(stale.value, first.value);
    response = html.replace('"wgRevisionId":12', '"wgRevisionId":13');
    assert.equal((await source.detail(results.value[0], true)).value.revision, '13');
    assert.equal(calls, 4);
});
