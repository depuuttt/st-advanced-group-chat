import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');

/**
 * The manual acceptance checklist is the only verification for behaviour that
 * needs a live group chat. These tests guard the checklist against being
 * quietly trimmed, and guard the documented scope against drifting from the
 * implementation.
 */
test('README explains that the active connection is reused and only the model changes', () => {
    assert.match(readme, /reuses?/i);
    assert.match(readme, /only the `model` field/i);
    assert.match(readme, /endpoint, API key/i);
});

test('README states that an empty model falls back to the selected model', () => {
    assert.match(readme, /empty value clears/i);
    assert.match(readme, /currently selected/i);
});

test('README states that Text Completion is out of scope', () => {
    assert.match(readme, /Text Completion/i);
    assert.match(readme, /not\s+(yet\s+)?supported/i);
});

test('README carries an acceptance checklist covering every review-focus condition', () => {
    const checklistStart = readme.search(/^##+ .*[Aa]cceptance checklist/m);
    assert.notEqual(checklistStart, -1, 'missing acceptance checklist section');

    const checklist = readme.slice(checklistStart);

    for (const condition of [
        /No saved override/i,
        /Cleared override/i,
        /Same member in two groups/i,
        /Speaker identity/i,
        /Non-group/i,
        /Text Completion/i,
        /re-?render/i,
    ]) {
        assert.match(checklist, condition);
    }
});