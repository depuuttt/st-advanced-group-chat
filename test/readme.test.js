import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');

test('README gives users the installation steps and repository address', () => {
    assert.match(readme, /^## Install$/m);
    assert.match(readme, /Extensions/i);
    assert.match(readme, /https:\/\/github\.com\/depuuttt\/st-advanced-group-chat/);
});

test('README explains how to assign and clear a member model', () => {
    assert.match(readme, /^## Choose a model for a group member$/m);
    assert.match(readme, /Current Members/);
    assert.match(readme, /select \*\*OK\*\*/);
    assert.match(readme, /clear the text/i);
    assert.match(readme, /currently selected in `?\*\*API Connections\*\*`?/i);
});

test('README explains the connection behavior in user-facing terms', () => {
    assert.match(readme, /existing SillyTavern connection/i);
    assert.match(readme, /does not ask for or store API keys/i);
    assert.match(readme, /other generation settings/i);
});

test('README describes model names, saved choices, and supported chat types', () => {
    assert.match(readme, /model identifier used by your provider/i);
    assert.match(readme, /does not show a model list or check/i);
    assert.match(readme, /saved separately for each group and member/i);
    assert.match(readme, /group chats using \*\*Chat Completion\*\*/i);
    assert.match(readme, /does not affect one-on-one chats or \*\*Text Completion\*\*/i);
});

test('README includes practical troubleshooting guidance', () => {
    assert.match(readme, /^## Troubleshooting$/m);
    assert.match(readme, /model choice has no effect/i);
    assert.match(readme, /model icon is missing/i);
    assert.match(readme, /extension does not load/i);
});

test('README describes the member row markup accurately', () => {
    assert.match(readme, /jQuery/i);
    assert.match(readme, /data-chid/);
    assert.doesNotMatch(readme, /carry the member's avatar as `data-id`/i);
});

test('README documents the Material Symbols icon source', () => {
    assert.match(readme, /Material Symbols/i);
    assert.match(readme, /fonts\.google\.com|Google Fonts/i);
    assert.match(readme, /internet connection/i);
});
