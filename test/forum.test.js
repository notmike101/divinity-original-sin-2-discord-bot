import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { EmbedBuilder } from 'discord.js';
import { Forum, forumUrl, parseThread, boardTopics } from '../src/forum.js';
import { Http } from '../src/http.js';
import { detailView } from '../src/render.js';
import { mechanical, storySection } from '../src/spoilers.js';
import { Store } from '../src/store.js';

const url = 'https://forums.larian.com/ubbthreads.php?ubb=showflat&Number=656574&page=1';
const post = (id, body, name = 'Example player', staff = false) => `<table><tr><td class="subjecttable"><a id="number${id}">${id}</a><span class="date">07/11/19</span><span class="time">10:55 AM</span></td></tr><tr><td class="author-name">${staff ? name : `<span class="username">${name}</span>`}</td></tr><tr><td><div class="post_inner"><div id="body${id}">${body}</div><div class="signature">Unrelated signature</div></div></td></tr></table>`;
const thread = (body, board = 64, title = 'crafting without recipe') => `<title>${title} - Larian Studios forums</title><div class="breadcrumbs"><a href="/ubbthreads.php?ubb=cfrm&c=${board === 90 ? 20 : 18}">Divinity: Original Sin 2</a><a href="/ubbthreads.php?ubb=postlist&Board=${board}&page=1">General</a></div>${body}`;
const html = thread(post(656_574, 'Does the recipe work in DE?<br>Second line.') + post(656_576, '<blockquote>Earlier claim</blockquote>This may be outdated in Definitive Edition.', 'Example support author', true));

test('forum URLs allow only scoped read-only actions, bounded pages and safe hosts', async () => {
    assert.equal(forumUrl(`${url}#Post656574`), url);

    for (const bad of ['https://evil.test/ubbthreads.php?ubb=showflat&Number=1', 'https://forums.larian.com:444/ubbthreads.php?ubb=showflat&Number=1', 'https://user@forums.larian.com/ubbthreads.php?ubb=showflat&Number=1', '/ubbthreads.php?ubb=showflat&Number=1&Number=2', '/ubbthreads.php?ubb=showflat&Number=1&page=all', '/ubbthreads.php?ubb=showflat&Number=1&page=101', '/ubbthreads.php?ubb=showflat&Number=1&gonew=1', '/ubbthreads.php?ubb=search&q=crafting', '/ubbthreads.php?ubb=postlist&Board=90&page=1', '/ubbthreads.php?ubb=deletepost&Number=1']) {
        assert.equal(forumUrl(bad), null, bad);
    }

    const http = new Http(); const original = globalThis.fetch; const seen = [];

    try {
        globalThis.fetch = async (u) => {
            seen.push(String(u));

            return new Response('', { status: 302, headers: { location: 'https://evil.test/Crafting' } });
        };

        await assert.rejects(http.request(url), /rejected/);
        assert.deepEqual(seen, [url]);
        await assert.rejects(http.request('https://divinityoriginalsin2.wiki.fextralife.com/Crafting'), /rejected/);
    } finally {
        globalThis.fetch = original;
    }
});

test('forum parser preserves all dated posts including staff markup, quotes and page links without profiles or signatures', () => {
    const parsed = parseThread(`${html}<a href="/ubbthreads.php?ubb=showflat&Number=656574&page=2">2</a>`, url);

    assert.equal(parsed.sections.length, 2);
    assert.match(parsed.sections[1].title, /Example support author · 07\/11\/19 10:55 AM · #656576/);
    assert.match(parsed.sections[1].text, /Quoted material[\S\s]*Earlier claim[\S\s]*End quote[\S\s]*outdated/);
    assert.ok(!JSON.stringify(parsed).includes('Unrelated signature'));
    assert.equal(parsed.related[0].url, url.replace('page=1', 'page=2'));
    assert.equal(parsed.fields.type, 'Forum discussion');
    assert.equal(parsed.verification, undefined);
    assert.ok(parsed.contentHash.length === 64);
    assert.equal(mechanical(parsed), true);
    assert.throws(() => parseThread(thread(post(1, 'Wrong game'), 90), url), /outside/);
    assert.throws(() => parseThread('<title>Challenge</title>', url), /outside/);
});

test('forum story topics and embedded spoilers remain private, ordinary mechanical posts remain shared', () => {
    const parsed = parseThread(thread(post(656_574, 'A routine crafting note') + post(2, '<div class="spoiler">Hidden outcome</div>')), url);

    assert.equal(storySection(parsed, parsed.sections[0]), false);
    assert.equal(storySection(parsed, parsed.sections[1]), true);
    const story = parseThread(thread(post(656_574, 'Hidden outcome'), 67, 'Quest endings [Spoilers]'), url);

    assert.equal(mechanical(story), false);
});

test('targeted forum discovery excludes irrelevant titles and cache persists offline with complete raw posts', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'dos2 forum ')); let store = new Store(dir); let calls = 0; let offline = false;

    t.after(() => {
        store.close(); rmSync(dir, { recursive: true, force: true });
    });
    const http = {
        async text(input) {
            calls++;

            if (offline) {
                throw new Error('offline');
            }

            if (input.includes('postlist')) {
                return '<title>Divinity - Original Sin 2 - Help</title><a href="/ubbthreads.php?ubb=showflat&Number=2">Game crashing on save</a><a href="/ubbthreads.php?ubb=showflat&Number=3">Crafting arrows</a>';
            }

            return html;
        },
    };
    let forum = new Forum(store, http, { cacheMs: 3_600_000 });
    const results = await forum.search('crafting');

    assert.deepEqual(results.value.map((e) => e.title), ['Crafting arrows', 'crafting without recipe']);
    const selected = results.value.find((e) => e.title === 'crafting without recipe');
    const first = await forum.detail(selected); const afterFirst = calls;

    assert.equal(first.value.rawHtml, html);
    const card = detailView(store, selected, first.value, null);

    EmbedBuilder.from(card.embeds[0]).toJSON();
    assert.match(card.embeds[0].author.name, /Larian/);
    assert.ok(!JSON.stringify(card).includes('rawHtml'));
    store.close(); store = new Store(dir); forum = new Forum(store, http, { cacheMs: 3_600_000 }); offline = true;
    const cached = await forum.detail(selected);

    assert.equal(calls, afterFirst);
    assert.equal(cached.value.sections.length, 2);
    assert.equal((await forum.detail(selected, true)).stale, true);
    assert.equal((await forum.search('crafting')).value.length, 2);
    const direct = await forum.search(url);

    assert.ok(!JSON.stringify(direct).includes('rawHtml'));
    store.db.prepare('INSERT INTO cache VALUES (?, ?, ?)').run('offline:forum:thread:extra', JSON.stringify({ title: 'Arrow recovery rules', url: url.replace('656574', '123') }), 0);
    assert.equal((await forum.search('arrow recovery')).value[0].title, 'Arrow recovery rules');
    assert.throws(() => boardTopics('<title>Other game</title>', '64'), /Unexpected/);
});
