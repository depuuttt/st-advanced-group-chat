import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkInstructionSync, checkRepositoryInstructions } from '../scripts/check-instructions-sync.js';

test('AGENTS.md and CLAUDE.md stay identical after their title headers', () => {
    assert.equal(checkRepositoryInstructions(), null);
});

test('the sync checker reports body drift', () => {
    assert.match(
        checkInstructionSync('# AGENTS.md\nShared guidance.\n', '# CLAUDE.md\nChanged guidance.\n'),
        /differ after their title headers/,
    );
});

test('the sync checker requires a title header', () => {
    assert.match(
        checkInstructionSync('No title\nShared guidance.\n', '# CLAUDE.md\nShared guidance.\n'),
        /Expected the first line to be "# AGENTS\.md"/,
    );
});
