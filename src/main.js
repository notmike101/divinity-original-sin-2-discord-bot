import { Client, Events } from 'discord.js';
import { loadEnv, config, validateDiscord } from './config.js';
import { Http } from './http.js';
import { router } from './router.js';
import { Lookup } from './sources.js';
import { Store } from './store.js';

loadEnv();

try {
    const cfg = config();

    validateDiscord(cfg);
    const store = new Store(cfg.dataDir, cfg.sessionMs);
    const client = new Client({ intents: [], allowedMentions: { parse: [] } });

    client.on(Events.InteractionCreate, router(cfg, store, new Lookup(store, new Http(cfg.timeoutMs), cfg)));
    client.once(Events.ClientReady, () => console.info(`Ready. Access mode: ${cfg.mode}; configured users: ${cfg.ids.size}.`));
    client.on(Events.Error, () => console.error('Discord connection error (details redacted).'));
    let closing = false;
    const stop = async () => {
        if (closing) {
            return;
        }

        closing = true;
        await client.destroy();
        await Promise.allSettled([...store.pending.values()]);
        store.close();
    };

    for (const signal of ['SIGINT', 'SIGTERM']) {
        process.once(signal, () => {
            stop().then(() => process.exit(0));
        });
    }

    await client.login(cfg.token).catch(async () => {
        await stop(); throw new Error('Discord login failed. Check private local credentials.');
    });
} catch (error) {
    console.error(error.message); process.exitCode = 1;
}
