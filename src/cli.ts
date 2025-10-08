import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { exit, stdout } from "node:process";
import { parseArguments } from "./arguments.ts";
import type { CliOptions } from "./arguments.ts";
import { createTarArchive } from "./archive.ts";
import { encryptArchive } from "./crypto.ts";
import { acquirePassword } from "./password.ts";
import { determineOutputDir, ensureDirectoryReadable, isInsideDirectory, prepareOutputDirectory } from "./paths.ts";
import { buildLoaderHtml, buildServiceWorkerScript } from "./templates.ts";

// Execute the CLI workflow for frontcrypt.
export async function run(argv: string[]): Promise<void> {
    try {
        const { options, positional } = parseArguments(argv);
        if (options.help) {
            printHelp();
            return;
        }
        if (positional.length === 0) {
            throw new Error("Missing required source directory argument");
        }
        const sourceDir = resolve(positional[0]);
        const outputDir = resolve(determineOutputDir(sourceDir, options.outputDir));
        if (outputDir === sourceDir) {
            throw new Error("Output directory must differ from the source directory");
        }
        if (isInsideDirectory(outputDir, sourceDir)) {
            throw new Error("Output directory cannot be inside the source directory");
        }
        await ensureDirectoryReadable(sourceDir);
        await prepareOutputDirectory(outputDir);

        const password = await acquirePassword(options.password);
        const tarBytes = await createTarArchive(sourceDir);
        const { salt, iv, ciphertext } = await encryptArchive(tarBytes, password);

        const saltBase64 = Buffer.from(salt).toString("base64");
        const ivBase64 = Buffer.from(iv).toString("base64");
        await writeFile(join(outputDir, "app.enc"), ciphertext);
        await writeFile(join(outputDir, "index.html"), buildLoaderHtml({ saltBase64, ivBase64 }));
        await writeFile(join(outputDir, "sw.js"), buildServiceWorkerScript());
        stdout.write(`Protected bundle created at ${outputDir}\n`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`frontcrypt: ${message}`);
        exit(1);
    }
}

// Display CLI usage information.
function printHelp(): void {
    const usage = [
        "Usage: bun frontcrypt <source-dir> [options]",
        "",
        "Options:",
        "  -o, --output <dir>     Output directory (default: <source-dir>-protected)",
        "      --password <pass>  Password for encryption (insecure on shared terminals)",
        "      --help             Display this help message"
    ];
    stdout.write(`${usage.join("\n")}\n`);
}

export type { CliOptions };
