import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * SillyTavern refuses to load an extension whose manifest is missing a display
 * name, a JS entry, or an author. These are the fields the loader requires.
 */
test('manifest.json declares the required SillyTavern extension fields', () => {
    const manifest = JSON.parse(readFileSync(join(repoRoot, 'manifest.json'), 'utf8'));

    assert.equal(typeof manifest.display_name, 'string');
    assert.ok(manifest.display_name.length > 0);
    assert.equal(typeof manifest.author, 'string');
    assert.ok(manifest.author.length > 0);
    assert.equal(typeof manifest.version, 'string');
    assert.match(manifest.version, /^\d+\.\d+\.\d+/);
});

test('manifest.json points at the JS and CSS entry files that exist', () => {
    const manifest = JSON.parse(readFileSync(join(repoRoot, 'manifest.json'), 'utf8'));

    assert.equal(manifest.js, 'index.js');
    assert.equal(manifest.css, 'style.css');
    assert.doesNotThrow(() => readFileSync(join(repoRoot, manifest.js)));
    assert.doesNotThrow(() => readFileSync(join(repoRoot, manifest.css)));
});