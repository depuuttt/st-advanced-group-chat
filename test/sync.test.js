import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFileSync(join(repoRoot, name), 'utf8').replace(/\r\n/g, '\n');

test('CLAUDE.md points to the shared AGENTS.md guidance', () => {
    const claude = read('CLAUDE.md');
    assert.match(claude, /\[AGENTS\.md\]\(AGENTS\.md\)/);
    assert.ok(claude.length < 300, 'CLAUDE.md should remain a minimal pointer');
});

test('AGENTS.md is the sole home for project guidance', () => {
    const agents = read('AGENTS.md');
    assert.match(agents, /tool-agnostic source of guidance/i);
    assert.doesNotMatch(agents, /OpenAI Codex|Claude Code|claude\.ai\/code/i);
});
