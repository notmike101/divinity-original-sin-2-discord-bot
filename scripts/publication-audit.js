import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { root } from '../src/config.js';

const localScanner = join(root, '.tools', process.platform === 'win32' ? 'gitleaks.exe' : 'gitleaks');

export const scannerPath = process.env.GITLEAKS_PATH || (existsSync(localScanner) ? localScanner : 'gitleaks');
/**
 * Audit the index, all reachable blobs and commit messages; errors never expose matching values.
 *
 * @param {string} cwd - Repository to inspect.
 * @param {string[]} protectedValues - Private exact values loaded locally.
 * @param {string} scanner - Gitleaks executable.
 * @returns {object} Audit counts, without secrets.
 */
export function audit(cwd, protectedValues, scanner = scannerPath) {
    const run = (args) => execFileSync(process.env.GITHUB_AGENT_HELPER ? process.execPath : 'git', process.env.GITHUB_AGENT_HELPER ? [process.env.GITHUB_AGENT_HELPER, 'git', ...args] : args, { cwd, maxBuffer: 128 * 1_024 * 1_024, stdio: ['ignore', 'pipe', 'pipe'] });
    const text = (args) => run(args).toString('utf8');
    const values = protectedValues.filter((v) => v && v.length >= 6);
    const failures = [];
    const redact = (label) => {
        let result = label;

        for (const value of values) {
            result = result.replaceAll(value, '[REDACTED]');
        }

        return result;
    };

    const inspect = (data, label) => {
        if (values.some((value) => data.includes(Buffer.from(value)))) {
            failures.push(redact(label));
        }
    };

    const temp = mkdtempSync(join(tmpdir(), 'dos2-audit-'));
    let versions = 0;

    try {
        const staged = text(['ls-files', '--stage', '-z']).split('\0').filter(Boolean);

        for (const line of staged) {
            const [, , hash, stage, path] = /^(\d+) ([\da-f]+) (\d)\t([\S\s]+)$/.exec(line) || [];

            if (!path || stage !== '0') {
                throw new Error('Resolve index conflicts before publication.');
            }

            if (/(^|\/)(?:\.env(?:\..*)?|data|private|captures)(?:\/|$)|\.(?:sqlite.*|db(?:-wal|-shm)?|log|bak|backup)$/i.test(path) && path !== '.env.example') {
                failures.push(redact(`private/runtime path: ${path}`));
            }

            const blob = run(['cat-file', 'blob', hash]);

            inspect(blob, `index: ${path}`);
            const target = resolve(temp, 'index', path);
            const rel = relative(resolve(temp, 'index'), target);

            if (rel.startsWith('..') || isAbsolute(rel)) {
                throw new Error('Unsafe staged path.');
            }

            mkdirSync(resolve(target, '..'), { recursive: true }); writeFileSync(target, blob); versions++;
        }

        // --all includes existing remote-tracking history, including deleted files and other refs.
        const objects = text(['rev-list', '--objects', '--all']).trim().split('\n').filter(Boolean);

        for (const object of objects) {
            const hash = object.split(' ')[0];
            const type = text(['cat-file', '-t', hash]).trim();

            if (type === 'blob' || type === 'commit' || type === 'tag') {
                const data = run(['cat-file', type, hash]);

                inspect(data, `history: ${hash}`);
                const historyDir = join(temp, 'history');

                mkdirSync(historyDir, { recursive: true });
                writeFileSync(join(historyDir, hash), data); versions++;
            }
        }

        // Prepared commit messages are not reachable yet; inspect them before commit too.
        for (const arg of process.argv.slice(2)) {
            if (arg.startsWith('--message-file=')) {
                const message = readFileSync(resolve(cwd, arg.slice(15)));

                inspect(message, 'proposed commit message');
                writeFileSync(join(temp, 'proposed-message.txt'), message);
            }
        }

        for (const args of [['dir', temp], ['git', cwd, '--log-opts=--all']]) {
            mkdirSync(join(temp, 'index'), { recursive: true });
            const report = join(temp, 'report.json');
            const result = spawnSync(scanner, [...args, '--redact=100', '--no-banner', '--report-format=json', `--report-path=${report}`], { encoding: 'utf8', stdio: 'pipe' });

            if (result.error) {
                throw new Error('Gitleaks unavailable. Install Gitleaks and set GITLEAKS_PATH if needed.');
            }

            if (result.status !== 0) {
                if (result.status === 1) {
                    failures.push('credential scanner findings (values redacted; inspect locally with gitleaks --redact=100)');
                } else {
                    throw new Error('Gitleaks failed to complete; publication denied.');
                }
            }
        }

        if (failures.length) {
            throw new Error(`Publication denied: ${[...new Set(failures)].join('; ')}`);
        }

        return { indexedFiles: staged.length, inspectedVersions: versions, exactValues: values.length };
    } finally {
        rmSync(temp, { recursive: true, force: true });
    }
}
