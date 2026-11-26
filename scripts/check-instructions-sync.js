import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * CLAUDE.md must stay a minimal pointer to AGENTS.md, not a mirrored copy:
 * it has to link AGENTS.md and stay short.
 */
export function checkClaudePointer(claude) {
    const normalized = claude.replace(/^﻿/, '').replace(/\r\n/g, '\n');
    if (!normalized.includes('[AGENTS.md](AGENTS.md)')) {
        return 'CLAUDE.md must point at AGENTS.md; link it as [AGENTS.md](AGENTS.md).';
    }
    const lines = normalized.split('\n').filter((line, index, all) => index < all.length - 1 || line !== '').length;
    if (lines > 15) {
        return `CLAUDE.md must stay a minimal pointer to AGENTS.md; it has ${lines} lines (limit 15). Move content into AGENTS.md instead.`;
    }
    return null;
}

export function checkRepositoryInstructions(root = repoRoot) {
    const claude = readFileSync(join(root, 'CLAUDE.md'), 'utf8');
    return checkClaudePointer(claude);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const error = checkRepositoryInstructions();
    if (error) {
        console.error(error);
        process.exitCode = 1;
    } else {
        console.log('CLAUDE.md points at AGENTS.md.');
    }
}
