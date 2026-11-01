import { setTimeout as delay } from 'node:timers/promises';

/** Fixed-host HTTP queue; redirects are revalidated before any subsequent request. */
export class Http {
    constructor(timeout = 15_000) {
        this.queued = 0; this.timeout = timeout; this.tail = Promise.resolve(); this.last = new Map();
    }

    async json(url) {
        if (this.queued >= 12) {
            throw new Error('Source queue busy; try again later.');
        }

        this.queued++;
        const queuedAt = Date.now();
        const task = this.tail.then(async () => {
            if (Date.now() - queuedAt > 60_000) {
                throw new Error('Source queue timed out; try again later.');
            }

            const host = new URL(url).hostname;
            const gap = host === 'divinitywiki.com' ? 20_000 : 300;

            await delay(Math.max(0, gap - (Date.now() - (this.last.get(host) || 0))));
            this.last.set(host, Date.now());

            return this.request(url);
        });

        this.tail = task.catch(() => {
        });

        return task.finally(() => {
            this.queued--;
        });
    }

    async request(input) {
        let url = new URL(input);

        for (let attempt = 0; attempt < 3; attempt++) {
            if (!['divinity.fandom.com', 'divinitywiki.com'].includes(url.hostname) || url.protocol !== 'https:' || url.port || url.username || url.password || url.pathname !== '/api.php') {
                throw new Error('Source URL rejected.');
            }

            let response;

            try {
                response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(this.timeout), headers: { 'User-Agent': 'DOS2Companion/1.0 (https://github.com/notmike101/divinity-2-discord-bot)' } });
            } catch {
                if (attempt < 1) {
                    await delay(1_000); continue;
                }

                throw new Error('Source request timed out or failed.');
            }

            if ([301, 302, 303, 307, 308].includes(response.status)) {
                url = new URL(response.headers.get('location'), url); continue;
            }

            if ([429, 502, 503, 504].includes(response.status) && attempt < 1) {
                const retry = response.headers.get('retry-after');
                const seconds = /^\d+$/.test(retry || '') ? Number(retry) : 1;

                if (seconds > 30) {
                    throw new Error('Source rate limited; try later.');
                }

                await delay(Math.max(1_000, seconds * 1_000)); continue;
            }

            if (!response.ok) {
                throw new Error(`Source HTTP ${response.status}.`);
            }

            const chunks = []; let bytes = 0;

            for await (const chunk of response.body) {
                bytes += chunk.length;

                if (bytes > 8 * 1_024 * 1_024) {
                    throw new Error('Source response exceeds size limit.');
                }

                chunks.push(chunk);
            }

            let data;

            try {
                data = JSON.parse(Buffer.concat(chunks).toString());
            } catch {
                throw new Error('Source did not return valid JSON.');
            }

            if (data.error) {
                throw new Error('Source API returned an error.');
            }

            return data;
        }

        throw new Error('Source redirect/retry limit reached.');
    }
}
