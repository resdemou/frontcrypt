import { constants as fsConstants } from "node:fs";
import { access, mkdir, stat } from "node:fs/promises";
import { relative, sep } from "node:path";

// Determine output directory using either user request or default.
export function determineOutputDir(sourceDir: string, requested?: string): string {
    if (requested) {
        return requested;
    }
    return `${sourceDir}-protected`;
}

// Check whether the target path resides inside the parent path.
export function isInsideDirectory(target: string, parent: string): boolean {
    const relativePath = relative(parent, target);
    return relativePath !== "" && !relativePath.startsWith("..") && !relativePath.includes(`..${sep}`);
}

// Ensure the source directory exists and is readable.
export async function ensureDirectoryReadable(directory: string): Promise<void> {
    const directoryStat = await stat(directory).catch(() => null);
    if (!directoryStat || !directoryStat.isDirectory()) {
        throw new Error(`Source path ${directory} is not a readable directory`);
    }
    await access(directory, fsConstants.R_OK);
}

// Prepare the output directory path by creating it if needed.
export async function prepareOutputDirectory(outputDir: string): Promise<void> {
    await mkdir(outputDir, { recursive: true });
}
