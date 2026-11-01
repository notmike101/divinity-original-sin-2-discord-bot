import { EmbedBuilder } from 'discord.js';
import { config, loadEnv } from '../src/config.js';
import { Http } from '../src/http.js';
import { detailView } from '../src/render.js';
import { Lookup } from '../src/sources.js';
import { Store } from '../src/store.js';

loadEnv();
const cfg = config(); const store = new Store(cfg.dataDir, cfg.sessionMs); const http = new Http(cfg.timeoutMs);
const original = http.text.bind(http); let requests = 0;

http.text = (url) => {
    requests++;

    return original(url);
};

const lookup = new Lookup(store, http, cfg);

try {
    for (const [source, query] of [['forum', 'crafting'], ['forum', 'skillbook'], ['forum', 'reactive shot'], ['forum', 'summoning'], ['fextralife', 'conjur incarnte'], ['fextralife', 'elemental totem']]) {
        const result = await lookup[source].search(query);

        if (!result.value.length) {
            throw new Error(`No supplementary results for ${source}.`);
        }

        const selected = result.value[0]; const detail = await lookup.detail(selected);

        for (const embed of detailView(store, selected, detail.value, 'local-check').embeds) {
            EmbedBuilder.from(embed).toJSON();
        }

        const before = requests;

        await lookup[source].search(query); await lookup.detail(selected);

        if (requests !== before || result.stale || detail.stale) {
            throw new Error(`Supplementary cache verification failed for ${source}.`);
        }

        console.info(JSON.stringify({ source, query, title: detail.value.title, sections: detail.value.sections.length, retrievedAt: detail.value.retrievedAt, repeatHttpRequests: requests - before }));
    }
} finally {
    store.close();
}
