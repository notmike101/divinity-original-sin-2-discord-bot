import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, appendFileSync, chmodSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { root } from '../src/config.js';

const version = '8.30.1';

if (!['win32', 'linux'].includes(process.platform) || !['x64', 'arm64'].includes(process.arch)) {
    throw new Error('Install Gitleaks manually on this platform.');
}

const platform = process.platform === 'win32' ? 'windows' : 'linux';
const archive = `gitleaks_${version}_${platform}_${process.arch}.${platform === 'windows' ? 'zip' : 'tar.gz'}`;
const base = `https://github.com/gitleaks/gitleaks/releases/download/v${version}/`;
const get = async (name) => {
    const r = await fetch(base + name, { signal: AbortSignal.timeout(60_000) });

    if (!r.ok) {
        throw new Error('Scanner download failed.');
    }

    return Buffer.from(await r.arrayBuffer());
};

const bytes = await get(archive);
const checksums = (await get(`gitleaks_${version}_checksums.txt`)).toString();
const expected = checksums.split('\n').find((line) => line.trim().endsWith(archive))?.split(/\s+/)[0];

if (!expected || createHash('sha256').update(bytes).digest('hex') !== expected) {
    throw new Error('Scanner checksum mismatch.');
}

const dir = resolve(root, '.tools');

mkdirSync(dir, { recursive: true });
const file = join(dir, archive);

writeFileSync(file, bytes);
execFileSync('tar', ['-xf', file, '-C', dir], { stdio: 'pipe' });
const executable = join(dir, platform === 'windows' ? 'gitleaks.exe' : 'gitleaks');

chmodSync(executable, 0o755);
console.info(`Verified Gitleaks ${version} in ignored .tools directory.`);

if (process.env.GITHUB_ENV) {
    appendFileSync(process.env.GITHUB_ENV, `GITLEAKS_PATH=${executable}\n`);
}
