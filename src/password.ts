import { stdin, stdout } from "node:process";

// Acquire password from env, CLI option, or interactive prompt.
export async function acquirePassword(optionPassword?: string): Promise<string> {
    const envPassword = process.env.FRONTCRYPT_PASSWORD;
    if (envPassword && envPassword.length > 0) {
        return envPassword;
    }
    if (optionPassword && optionPassword.length > 0) {
        return optionPassword;
    }
    return await promptForPassword("Enter password: ");
}

// Prompt for password using a masked TTY input.
export async function promptForPassword(promptText: string): Promise<string> {
    if (!stdin.isTTY || !stdout.isTTY) {
        throw new Error("Cannot read password interactively without a TTY");
    }
    return await new Promise((resolve, reject) => {
        const characters: string[] = [];
        const handleData = (chunk: Buffer): void => {
            const input = chunk.toString("utf8");
            if (input === "\u0003") {
                cleanup();
                reject(new Error("Password entry cancelled"));
                return;
            }
            if (input === "\r" || input === "\n") {
                cleanup();
                stdout.write("\n");
                resolve(characters.join(""));
                return;
            }
            if (input === "\u0008" || input === "\u007f") {
                if (characters.length > 0) {
                    characters.pop();
                    stdout.write("\b \b");
                }
                return;
            }
            if (input >= " " && input <= "~") {
                characters.push(input);
                stdout.write("*");
            }
        };
        const cleanup = (): void => {
            stdin.off("data", handleData);
            stdin.setRawMode(false);
            stdin.pause();
        };
        stdout.write(promptText);
        stdin.setRawMode(true);
        stdin.resume();
        stdin.on("data", handleData);
    });
}
