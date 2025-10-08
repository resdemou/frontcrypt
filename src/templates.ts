import { ITERATIONS } from "./config.ts";

type LoaderTemplateValues = {
    saltBase64: string;
    ivBase64: string;
};

// Build the password gate loader HTML with embedded salt and IV.
export function buildLoaderHtml(values: LoaderTemplateValues): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Protected Application</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        :root {
            color-scheme: light dark;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: radial-gradient(circle at top, rgba(79, 70, 229, 0.15), transparent 60%);
        }
        main {
            width: min(380px, 90vw);
            padding: 32px;
            border-radius: 24px;
            background-color: rgba(255, 255, 255, 0.85);
            backdrop-filter: blur(12px);
            box-shadow: 0 20px 45px rgba(15, 23, 42, 0.18);
        }
        h1 {
            margin: 0 0 16px;
            font-size: 1.5rem;
        }
        form {
            display: grid;
            gap: 16px;
        }
        label {
            display: flex;
            flex-direction: column;
            gap: 6px;
            font-size: 0.95rem;
        }
        input {
            padding: 12px;
            border-radius: 12px;
            border: 1px solid rgba(148, 163, 184, 0.6);
            font-size: 1rem;
        }
        button {
            padding: 12px;
            border: none;
            border-radius: 12px;
            font-size: 1rem;
            font-weight: 600;
            color: white;
            background: linear-gradient(135deg, #4f46e5, #7c3aed);
            cursor: pointer;
        }
        button:disabled {
            cursor: progress;
            opacity: 0.7;
        }
        #status {
            min-height: 1.2rem;
            font-size: 0.9rem;
        }
        .error {
            color: #b91c1c;
        }
    </style>
</head>
<body>
    <main>
        <h1>Unlock Application</h1>
        <form id="unlock-form" autocomplete="off">
            <label for="password">
                Password
                <input id="password" name="password" type="password" required autocomplete="off" autofocus>
            </label>
            <button type="submit">Unlock</button>
            <p id="status" role="status" aria-live="polite"></p>
        </form>
    </main>
    <script>
        (() => {
            const SALT_B64 = "${values.saltBase64}";
            const IV_B64 = "${values.ivBase64}";
            const ITERATIONS = ${ITERATIONS};
            const encoder = new TextEncoder();
            const salt = decodeBase64(SALT_B64);
            const iv = decodeBase64(IV_B64);
            const form = document.getElementById("unlock-form");
            const passwordField = document.getElementById("password");
            const statusElement = document.getElementById("status");

            form?.addEventListener("submit", async (event) => {
                event.preventDefault();
                const password = passwordField?.value ?? "";
                if (!password) {
                    setStatus("Password is required", true);
                    return;
                }
                form.querySelector("button")?.setAttribute("disabled", "true");
                setStatus("Unlocking...");
                try {
                    const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
                    const cryptoKey = await crypto.subtle.deriveKey(
                        { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
                        keyMaterial,
                        { name: "AES-GCM", length: 256 },
                        false,
                        ["decrypt"]
                    );
                    const response = await fetch("/app.enc", { cache: "no-store" });
                    if (!response.ok) {
                        throw new Error("Failed to download encrypted payload");
                    }
                    const encryptedBuffer = await response.arrayBuffer();
                    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, encryptedBuffer);
                    const worker = await ensureServiceWorkerReady();
                    await transferArchiveToServiceWorker(decrypted, worker);
                    window.location.replace("/");
                } catch (error) {
                    const message = error instanceof DOMException ? "Invalid password" : (error instanceof Error ? error.message : "Unlock failed");
                    setStatus(message, true);
                    form.querySelector("button")?.removeAttribute("disabled");
                } finally {
                    if (passwordField) {
                        passwordField.value = "";
                        passwordField.focus();
                    }
                }
            });

            function decodeBase64(value) {
                const binary = atob(value);
                const bytes = new Uint8Array(binary.length);
                for (let index = 0; index < binary.length; index += 1) {
                    bytes[index] = binary.charCodeAt(index);
                }
                return bytes;
            }

            async function ensureServiceWorkerReady() {
                if (!("serviceWorker" in navigator)) {
                    throw new Error("Service workers are not supported in this browser");
                }
                const registration = await navigator.serviceWorker.register("/sw.js");
                await navigator.serviceWorker.ready;
                const active = await waitForActiveWorker(registration);
                if (!active) {
                    throw new Error("Service worker did not activate");
                }
                return active;
            }

            async function waitForActiveWorker(registration) {
                if (registration.active) {
                    return registration.active;
                }
                if (registration.installing) {
                    await waitForState(registration.installing, "activated");
                    return registration.active ?? registration.installing ?? registration.waiting ?? null;
                }
                if (registration.waiting) {
                    return registration.waiting;
                }
                await navigator.serviceWorker.ready;
                return navigator.serviceWorker.controller;
            }

            async function waitForState(worker, expected) {
                if (worker.state === expected) {
                    return;
                }
                await new Promise((resolve, reject) => {
                    const handleState = () => {
                        if (worker.state === expected) {
                            worker.removeEventListener("statechange", handleState);
                            resolve();
                        } else if (worker.state === "redundant") {
                            worker.removeEventListener("statechange", handleState);
                            reject(new Error("Service worker became redundant during activation"));
                        }
                    };
                    worker.addEventListener("statechange", handleState);
                });
            }

            async function transferArchiveToServiceWorker(buffer, worker) {
                if (!worker) {
                    throw new Error("Service worker is not available");
                }
                const channel = new MessageChannel();
                const acknowledgement = new Promise((resolve, reject) => {
                    channel.port1.onmessage = (event) => {
                        if (event.data?.type === "frontcrypt-ready") {
                            channel.port1.close();
                            resolve();
                            return;
                        }
                        if (event.data?.type === "frontcrypt-error") {
                            channel.port1.close();
                            reject(new Error(event.data?.message ?? "Service worker reported failure"));
                            return;
                        }
                    };
                });
                worker.postMessage({ type: "frontcrypt-load", payload: buffer }, [buffer, channel.port2]);
                await acknowledgement;
            }

            function setStatus(message, isError = false) {
                if (!statusElement) {
                    return;
                }
                statusElement.textContent = message;
                statusElement.classList.toggle("error", Boolean(isError));
            }
        })();
    </script>
</body>
</html>
`;
}

// Build the service worker script that serves decrypted assets from memory.
export function buildServiceWorkerScript(): string {
    return `const fileCache = new Map();

self.addEventListener("install", (event) => {
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
    if (!event.data || event.data.type !== "frontcrypt-load") {
        return;
    }
    try {
        const payload = event.data.payload;
        if (!(payload instanceof ArrayBuffer)) {
            throw new Error("Expected ArrayBuffer payload");
        }
        populateCache(new Uint8Array(payload));
        event.ports?.[0]?.postMessage({ type: "frontcrypt-ready" });
    } catch (error) {
        event.ports?.[0]?.postMessage({ type: "frontcrypt-error", message: error instanceof Error ? error.message : String(error) });
    }
});

self.addEventListener("fetch", (event) => {
    const requestUrl = new URL(event.request.url);
    if (requestUrl.origin !== self.location.origin) {
        return;
    }
    let pathname = normalizeRequestPath(requestUrl.pathname);
    if (!fileCache.has(pathname)) {
        return;
    }
    const record = fileCache.get(pathname);
    if (!record) {
        return;
    }
    const response = new Response(record.content, {
        headers: {
            "Content-Type": record.type,
            "Cache-Control": "no-store"
        }
    });
    event.respondWith(response);
});

function populateCache(bytes) {
    fileCache.clear();
    const files = extractTarEntries(bytes);
    for (const file of files) {
        fileCache.set(file.path, {
            content: file.content,
            type: detectMimeType(file.path)
        });
    }
}

function extractTarEntries(bytes) {
    const entries = [];
    const blockSize = 512;
    let offset = 0;
    while (offset + blockSize <= bytes.length) {
        const name = readNullTerminatedString(bytes, offset, 100);
        if (!name) {
            if (isZeroBlock(bytes, offset, blockSize)) {
                break;
            }
            offset += blockSize;
            continue;
        }
        const size = parseOctal(bytes, offset + 124, 12);
        const typeFlag = bytes[offset + 156] || 48;
        offset += blockSize;
        if (typeFlag === 53) {
            const padding = (blockSize - (size % blockSize)) % blockSize;
            offset += size + padding;
            continue;
        }
        const fileBytes = bytes.slice(offset, offset + size);
        const path = normalizeTarPath(name);
        entries.push({ path, content: fileBytes });
        const padding = (blockSize - (size % blockSize)) % blockSize;
        offset += size + padding;
    }
    return entries;
}

function normalizeTarPath(name) {
    let normalized = name.startsWith("./") ? name.slice(1) : name;
    normalized = normalized.startsWith("/") ? normalized : "/".concat(normalized);
    return normalized;
}

function readNullTerminatedString(bytes, start, length) {
    const end = start + length;
    let result = "";
    for (let index = start; index < end; index += 1) {
        const value = bytes[index];
        if (value === 0) {
            break;
        }
        result += String.fromCharCode(value);
    }
    return result.trim();
}

function parseOctal(bytes, start, length) {
    const slice = bytes.subarray(start, start + length);
    const text = String.fromCharCode(...slice).replace(/\\0/g, "").trim();
    return parseInt(text || "0", 8);
}

function isZeroBlock(bytes, start, blockSize) {
    for (let index = start; index < start + blockSize; index += 1) {
        if (bytes[index] !== 0) {
            return false;
        }
    }
    return true;
}

function detectMimeType(path) {
    const lower = path.toLowerCase();
    if (lower.endsWith(".html") || lower.endsWith(".htm")) {
        return "text/html; charset=utf-8";
    }
    if (lower.endsWith(".js") || lower.endsWith(".mjs")) {
        return "text/javascript; charset=utf-8";
    }
    if (lower.endsWith(".css")) {
        return "text/css; charset=utf-8";
    }
    if (lower.endsWith(".json")) {
        return "application/json; charset=utf-8";
    }
    if (lower.endsWith(".svg")) {
        return "image/svg+xml";
    }
    if (lower.endsWith(".png")) {
        return "image/png";
    }
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
        return "image/jpeg";
    }
    if (lower.endsWith(".webp")) {
        return "image/webp";
    }
    if (lower.endsWith(".gif")) {
        return "image/gif";
    }
    if (lower.endsWith(".ico")) {
        return "image/x-icon";
    }
    if (lower.endsWith(".txt")) {
        return "text/plain; charset=utf-8";
    }
    if (lower.endsWith(".wasm")) {
        return "application/wasm";
    }
    return "application/octet-stream";
}

function normalizeRequestPath(pathname) {
    if (!pathname || pathname === "/") {
        return "/index.html";
    }
    if (pathname.endsWith("/")) {
        return "".concat(pathname, "index.html");
    }
    return pathname;
}
`;
}

export type { LoaderTemplateValues };
