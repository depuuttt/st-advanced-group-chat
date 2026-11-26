import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkClaudePointer, checkRepositoryInstructions } from '../scripts/check-instructions-sync.js';

test('CLAUDE.md stays a minimal pointer to AGENTS.md', () => {
    assert.equal(checkRepositoryInstructions(), null);
});

test('the pointer checker requires a link to AGENTS.md', () => {
    assert.match(
        checkClaudePointer('# CLAUDE.md\nSee AGENTS.md for guidance.\n'),
        /must point at AGENTS\.md/,
    );
});

test('the pointer checker rejects a mirrored body', () => {
    const mirrored = `# CLAUDE.md\n\nRead [AGENTS.md](AGENTS.md).\n\n${Array.from({ length: 20 }, (_, i) => `Filler line ${i + 1}.`).join('\n')}\n`;
    assert.match(
        checkClaudePointer(mirrored),
        /must stay a minimal pointer/,
    );
});
