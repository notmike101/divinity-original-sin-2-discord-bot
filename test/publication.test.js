import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { audit, scannerPath } from '../scripts/publication-audit.js';

const scanner = scannerPath;
const available = (() => {
    try {
        execFileSync(scanner, ['version'], { stdio: 'pipe' });

        return true;
    } catch {
        return false;
    }
})();

test('publication audit rejects staged values, commit messages and deleted historical content, redacted', { skip: !available && 'Install Gitleaks to run publication integration checks' }, (t) => {
    const cwd = mkdtempSync(join(tmpdir(), 'dos2 publication '));

    t.after(() => rmSync(cwd, { recursive: true, force: true }));
    const git = (args) => execFileSync('git', args, { cwd, stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_NAME: 'Synthetic Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Synthetic Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' } });
    const protectedValue = `9${[...randomBytes(18)].map((x) => x % 10).join('')}`;

    git(['init']); writeFileSync(join(cwd, 'README.md'), 'Clean fixture'); git(['add', 'README.md']); git(['commit', '-m', 'Clean fixture']);
    assert.ok(audit(cwd, [protectedValue], scanner).indexedFiles);
    const denies = () => {
        try {
            audit(cwd, [protectedValue], scanner); assert.fail('Expected publication failure');
        } catch (error) {
            assert.match(error.message, /Publication denied/); assert.ok(!error.message.includes(protectedValue));
        }
    };

    writeFileSync(join(cwd, 'private-value.txt'), protectedValue); git(['add', 'private-value.txt']); denies();
    git(['commit', '-m', 'Historical fixture']); git(['rm', 'private-value.txt']); git(['commit', '-m', 'Delete fixture']); denies();
    // A fresh disposable repo isolates a secret present only in a commit message.
    const other = mkdtempSync(join(tmpdir(), 'dos2 message '));

    t.after(() => rmSync(other, { recursive: true, force: true }));
    const run = (args) => execFileSync('git', args, { cwd: other, stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_NAME: 'Synthetic', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Synthetic', GIT_COMMITTER_EMAIL: 'test@example.invalid' } });

    run(['init']); writeFileSync(join(other, 'README.md'), 'Clean'); run(['add', 'README.md']);
    run(['commit', '-m', protectedValue]);
    assert.throws(() => audit(other, [protectedValue], scanner), (error) => /Publication denied/.test(error.message) && !error.message.includes(protectedValue));
});
