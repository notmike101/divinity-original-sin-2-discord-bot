import { loadEnv } from '../src/config.js';
import { audit } from './publication-audit.js';

loadEnv();
const values = [process.env.DISCORD_TOKEN, ...(process.env.ALLOWED_USER_IDS || '').split(','), ...(process.env.PUBLICATION_PRIVATE_VALUES || '').split(',')].map((value) => value?.trim()).filter(Boolean);

try {
    const report = audit(process.cwd(), values);

    console.info(`Publication audit passed: ${report.indexedFiles} index files; ${report.inspectedVersions} versions/messages inspected; ${report.exactValues} private exact values checked.`);

    if (!values.length) {
        console.warn('Exact-value coverage unavailable: no private token/IDs configured. Credential scanning still ran. Re-run after configuring private values, before publishing.');
    }
} catch (error) {
    console.error(error.message); process.exitCode = 1;
}
