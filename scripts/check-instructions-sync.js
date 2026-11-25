import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/** Return the document body, excluding its first-level title header. */
export function withoutTitle(source, expectedTitle) {
    const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    const newline = normalized.indexOf('\n');
    const title = newline === -1 ? normalized : normalized.slice(0, newline);

    if (title !== `# ${expectedTitle}`) {
        throw new Error(`Expected the first line to be "# ${expectedTitle}".`);
    }

    return newline === -1 ? '' : normalized.slice(newline + 1);
}

export function checkInstructionSync(agents, claude) {
    try {
        if (withoutTitle(agents, 'AGENTS.md') !== withoutTitle(claude, 'CLAUDE.md')) {
            return 'AGENTS.md and CLAUDE.md differ after their title headers.';
        }
        return null;
    } catch (error) {
        return error.message;
    }
}

export function checkRepositoryInstructions(root = repoRoot) {
    const agents = readFileSync(join(root, 'AGENTS.md'), 'utf8');
    const claude = readFileSync(join(root, 'CLAUDE.md'), 'utf8');
    return checkInstructionSync(agents, claude);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const error = checkRepositoryInstructions();
    if (error) {
        console.error(error);
        process.exitCode = 1;
    } else {
        console.log('AGENTS.md and CLAUDE.md are synchronized.');
    }
}
