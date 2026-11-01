import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
/** Load only the repository-local private environment, without logging its contents. */
export function loadEnv() {
    const file = resolve(root, '.env');

    if (existsSync(file)) {
        process.loadEnvFile(file);
    }
}

/**
 * Validate participation independently from Discord credentials.
 *
 * @param {Record<string, string | undefined>} env - Environment configuration.
 * @returns {object} Validated configuration.
 */
export function config(env = process.env) {
    const mode = env.ACCESS_MODE || 'allowlist';

    if (!['allowlist', 'public'].includes(mode)) {
        throw new Error('ACCESS_MODE must be allowlist or public.');
    }

    const ids = new Set((env.ALLOWED_USER_IDS || '').split(',').map((x) => x.trim()).filter(Boolean));

    if ([...ids].some((id) => !/^\d{17,20}$/.test(id))) {
        throw new Error('ALLOWED_USER_IDS must contain decimal Discord IDs, separated by commas.');
    }

    const number = (key, fallback, min, max) => {
        const value = Number(env[key] || fallback);

        if (!Number.isInteger(value) || value < min || value > max) {
            throw new Error(`${key} must be an integer between ${min} and ${max}.`);
        }

        return value;
    };

    return {
        mode, ids, token: env.DISCORD_TOKEN || '', applicationId: env.DISCORD_APPLICATION_ID || '',
        dataDir: resolve(root, env.DATA_DIR || 'data'),
        cacheMs: number('CACHE_SECONDS', 21_600, 1, 604_800) * 1_000,
        sessionMs: number('SESSION_HOURS', 168, 1, 720) * 3_600_000,
        timeoutMs: number('REQUEST_TIMEOUT_MS', 15_000, 1_000, 60_000),
    };
}

/**
 * Fail closed before connecting to Discord.
 *
 * @param {object} cfg - Configuration.
 */
export function validateDiscord(cfg) {
    if (cfg.mode === 'allowlist' && !cfg.ids.size) {
        throw new Error('Allowlist is empty. Set ALLOWED_USER_IDS in private .env, then restart.');
    }

    if (!cfg.token || !/^\d{17,20}$/.test(cfg.applicationId)) {
        throw new Error('Set DISCORD_TOKEN and DISCORD_APPLICATION_ID in private .env.');
    }
}

/** Authorize the actual actor, preserving snowflake string precision. */
export const permitted = (cfg, id) => cfg.mode === 'public' || cfg.ids.has(id);
