import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const read = (name) => readFileSync(join(repoRoot, name), 'utf8').replace(/\r\n/g, '\n');

const claudeHeader = '# CLAUDE.md\n\nThis file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.';
const agentsHeader = '# AGENTS.md\n\nThis file provides guidance to OpenAI Codex when working with code in this repository.';

/**
 * CLAUDE.md and AGENTS.md carry identical guidance for different agents; only
 * their headers differ. This suite keeps them from drifting apart.
 */
test('CLAUDE.md and AGENTS.md have identical bodies apart from their headers', () => {
    const claude = read('CLAUDE.md');
    const agents = read('AGENTS.md');

    assert.ok(claude.startsWith(claudeHeader), 'CLAUDE.md header changed');
    assert.ok(agents.startsWith(agentsHeader), 'AGENTS.md header changed');

    const claudeBody = claude.slice(claudeHeader.length);
    const agentsBody = agents.slice(agentsHeader.length);

    assert.equal(agentsBody, claudeBody, 'AGENTS.md body differs from CLAUDE.md — apply the same change to both files');
});

test('both guidance files document the sync rule', () => {
    for (const name of ['CLAUDE.md', 'AGENTS.md']) {
        assert.match(read(name), /CLAUDE\.md and AGENTS\.md/i);
    }
});