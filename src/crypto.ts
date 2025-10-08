import { webcrypto } from "node:crypto";
import { TextEncoder } from "node:util";
import { IV_BYTES, ITERATIONS, SALT_BYTES } from "./config.ts";

type EncryptionResult = {
    salt: Uint8Array;
    iv: Uint8Array;
    ciphertext: Uint8Array;
};

// Encrypt archive bytes using password-derived AES-GCM key.
export async function encryptArchive(archiveBytes: Uint8Array, password: string): Promise<EncryptionResult> {
    const salt = new Uint8Array(SALT_BYTES);
    const iv = new Uint8Array(IV_BYTES);
    webcrypto.getRandomValues(salt);
    webcrypto.getRandomValues(iv);

    const encoder = new TextEncoder();
    const passwordKey = await webcrypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
    const derivedKey = await webcrypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
        passwordKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt"]
    );
    const encrypted = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, derivedKey, archiveBytes);
    return {
        salt,
        iv,
        ciphertext: new Uint8Array(encrypted)
    };
}
