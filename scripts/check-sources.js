import { config, loadEnv } from '../src/config.js';
import { Http } from '../src/http.js';
import { Lookup } from '../src/sources.js';
import { Store } from '../src/store.js';

loadEnv();
const cfg = config();
const store = new Store(cfg.dataDir, cfg.sessionMs);
const lookup = new Lookup(store, new Http(cfg.timeoutMs), cfg);
const samples = [['crafting', 'Elemental Totem Skillbook'], ['crafting', 'Blank Summoning Skillbook'], ['skills', 'Conjure Incarnate'], ['skills', 'Burning'], ['items', 'Teleportation Gloves'], ['quests', 'The Teleporter'], ['mechanics', 'physical armour']];
let failures = 0;

try {
    for (const [category, query] of samples) {
        try {
            const results = await lookup.search(query, category, true);

            if (!results.value.length) {
                throw new Error('No discovery results.');
            }

            const detail = await lookup.detail(results.value[0], true);

            if (results.stale || detail.stale || !detail.value.sections.some((s) => s.text.length > 30)) {
                throw new Error('Live detail not verified.');
            }

            console.info(JSON.stringify({ category, query, matches: results.value.length, title: detail.value.title, url: detail.value.url, sections: detail.value.sections.length, characters: detail.value.sections.reduce((sum, s) => sum + s.text.length, 0), related: detail.value.related.length, edition: detail.value.edition, revision: detail.value.revision, verification: detail.value.verification.status, confirmedFields: detail.value.verification.fields, retrievedAt: detail.value.retrievedAt }));
        } catch (error) {
            failures++; console.error(`${category}: ${error.message}`);
        }
    }
} finally {
    store.close();
}

process.exitCode = failures ? 1 : 0;
