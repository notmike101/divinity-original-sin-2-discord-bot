import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** SQLite cache and immutable, opaque component mappings. No interaction tokens are stored. */
export class Store {
    constructor(dir, sessionMs = 604_800_000) {
        mkdirSync(dir, { recursive: true });
        this.db = new DatabaseSync(join(dir, 'companion.sqlite'));
        this.sessionMs = sessionMs;
        this.pending = new Map();
        this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS controls (id TEXT PRIMARY KEY, value TEXT NOT NULL, expires INTEGER NOT NULL);`);
        this.clean();
    }

    clean() {
        this.db.prepare('DELETE FROM controls WHERE expires < ?').run(Date.now());
        this.db.exec(`DELETE FROM cache WHERE key IN (SELECT key FROM cache ORDER BY at DESC LIMIT -1 OFFSET 1000);
      DELETE FROM controls WHERE id IN (SELECT id FROM controls ORDER BY expires DESC LIMIT -1 OFFSET 20000);`);
    }

    control(value) {
        this.clean();
        const id = `d2:${randomBytes(12).toString('base64url')}`;

        this.db.prepare('INSERT INTO controls VALUES (?, ?, ?)').run(id, JSON.stringify(value), Date.now() + this.sessionMs);

        return id;
    }

    read(id) {
        if (!/^d2:[\w-]{16}$/.test(id)) {
            return null;
        }

        const row = this.db.prepare('SELECT value FROM controls WHERE id = ? AND expires >= ?').get(id, Date.now());

        return row ? JSON.parse(row.value) : null;
    }

    /** Deduplicate work and preserve usable stale records if refresh fails. */
    async cached(key, ttl, fetcher, refresh = false) {
        const row = this.db.prepare('SELECT * FROM cache WHERE key = ?').get(key);
        const value = row && JSON.parse(row.value);
        const freshness = Array.isArray(value) && !value.length ? Math.min(ttl, 60_000) : ttl;

        if (!refresh && row && Date.now() - row.at < freshness) {
            return { value, stale: false };
        }

        if (this.pending.has(key)) {
            return this.pending.get(key);
        }

        const task = (async () => {
            try {
                const fresh = await fetcher();

                this.db.prepare('INSERT OR REPLACE INTO cache VALUES (?, ?, ?)').run(key, JSON.stringify(fresh), Date.now());
                this.clean();

                return { value: fresh, stale: false };
            } catch (error) {
                if (row && (!Array.isArray(value) || value.length)) {
                    return { value, stale: true };
                }

                throw error;
            } finally {
                this.pending.delete(key);
            }
        })();

        this.pending.set(key, task);

        return task;
    }

    close() {
        this.db.close();
    }
}
