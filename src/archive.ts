import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import tar from "tar-stream";
import type { Pack } from "tar-stream";

type TarEntryHeader = {
    name: string;
    type: "directory" | "file";
    mode: number;
    size?: number;
    mtime: Date;
};

// Create an in-memory TAR archive of the provided directory.
export async function createTarArchive(rootDirectory: string): Promise<Uint8Array> {
    const pack = tar.pack();
    const dataPromise = collectPackBytes(pack);
    await appendDirectoryEntries(pack, rootDirectory, rootDirectory);
    pack.finalize();
    return await dataPromise;
}

// Collect all TAR stream chunks into a single Uint8Array.
async function collectPackBytes(pack: Pack): Promise<Uint8Array> {
    const chunks: Buffer[] = [];
    for await (const chunk of pack as unknown as AsyncIterable<Buffer>) {
        chunks.push(chunk);
    }
    const combined = Buffer.concat(chunks);
    return new Uint8Array(combined.buffer, combined.byteOffset, combined.byteLength);
}

// Append directory contents recursively to the TAR archive.
async function appendDirectoryEntries(pack: Pack, currentDir: string, rootDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
        const absolutePath = join(currentDir, entry.name);
        const relativePath = buildTarPath(rootDir, absolutePath);
        const entryStat = await stat(absolutePath);
        if (entry.isSymbolicLink()) {
            throw new Error(`Symbolic links are not supported (${relativePath})`);
        }
        if (entry.isDirectory()) {
            await addTarEntry(pack, {
                name: ensureTrailingSlash(relativePath),
                type: "directory",
                mode: entryStat.mode,
                mtime: entryStat.mtime
            });
            await appendDirectoryEntries(pack, absolutePath, rootDir);
            continue;
        }
        if (entry.isFile()) {
            const content = await readFile(absolutePath);
            await addTarEntry(pack, {
                name: relativePath,
                type: "file",
                mode: entryStat.mode,
                size: content.length,
                mtime: entryStat.mtime
            }, content);
            continue;
        }
    }
}

// Add a TAR entry for either a file or directory.
async function addTarEntry(pack: Pack, header: TarEntryHeader, body?: Buffer): Promise<void> {
    return await new Promise((resolve, reject) => {
        if (header.type === "file" && typeof header.size !== "number") {
            reject(new Error(`File entry ${header.name} is missing size information`));
            return;
        }
        const finalHeader = header.type === "directory"
            ? { name: header.name, mode: header.mode, mtime: header.mtime, type: "directory" }
            : { name: header.name, mode: header.mode, mtime: header.mtime, size: header.size, type: "file" };
        pack.entry(finalHeader, body ?? undefined, (error?: Error | null) => {
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });
}

// Build a normalized TAR path relative to the archive root.
function buildTarPath(rootDir: string, targetPath: string): string {
    const relativePath = relative(rootDir, targetPath);
    return relativePath.split(sep).join("/");
}

// Ensure directory names inside the archive include a trailing slash.
function ensureTrailingSlash(value: string): string {
    return value.endsWith("/") ? value : `${value}/`;
}
