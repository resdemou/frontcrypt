# frontcrypt

frontcrypt locks down prebuilt static web apps by encrypting the entire artifact bundle with a password. The protected bundle ships as three files (`index.html`, `app.enc`, `sw.js`) that can be hosted on any static host; the original app stays encrypted at rest until a user unlocks it in the browser.

The aim of this tool is to replicate the system you'd get by asking your frontend provider (e.g. Vercel, Netlify) to password-protect your entire site, except then you're giving *them* access, and those features are also usually only available on paid plans. `frontcrypt` gives you the power to do password protection *locally*, with *any frontend*, and then deploy.

At [Resdemou](https://resdemou.com), we use `frontcrypt` for protecting confidential client-side demos.

## Features

- Archives an existing build directory into an uncompressed TAR file in memory.
- Derives a 256-bit AES key via PBKDF2-HMAC-SHA256 (300k iterations) and encrypts the archive with AES-256-GCM.
- Generates a password prompt loader and service worker that decrypt and serve the app entirely from memory.
- Supports password injection via environment variable, CLI flag, or interactive masked prompt.

## Requirements

- [Bun](https://bun.com) v1.2.19 or newer
- A directory containing the static build output you want to protect (for example `dist/` or `build/`)

## Getting Started

```bash
git clone https://github.com/resdemou/frontcrypt.git
cd frontcrypt
bun install
```

## Usage

The CLI expects a path to the directory containing your prebuilt static site.

```bash
bun run index.ts ./dist
```

Options:

- `-o, --output <dir>`: Destination directory for the protected bundle (defaults to `<source>-protected`)
- `--password <password>`: Supply the password via CLI (considered insecure on shared machines)
- `--help`: Show usage information

Password precedence:

1. `FRONTCRYPT_PASSWORD` environment variable
2. `--password` CLI flag
3. Interactive masked prompt (TTY required)

### Example Sessions

Interactive prompt (recommended for local use):

```bash
bun run index.ts ./dist
```

Custom output directory:

```bash
bun run index.ts ./dist -o ./dist-protected
```

CI-friendly environment variable:

```bash
export FRONTCRYPT_PASSWORD="super-secret-string"
bun run index.ts ./dist
```

The output directory will contain:

- `index.html`: Minimal loader that asks for the password and boots the app.
- `app.enc`: AES-256-GCM ciphertext containing the original static files.
- `sw.js`: Service worker that serves decrypted files from memory.

Host these three files at the root of any static site host. The service worker must live at `/sw.js` so ensure the deploy target serves from the site root.

## Building a Self-Contained Executable

Bun can compile the CLI into a standalone binary so you can distribute or drop it into your personal `bin/` directory.

```bash
bun build index.ts --compile --outfile frontcrypt
```

Move it somewhere on your `PATH`, such as `~/bin`:

```bash
mkdir -p ~/bin
mv frontcrypt ~/bin/
```

Now you can run the tool directly:

```bash
frontcrypt ./dist
```

## Password Guidance

- Choose high-entropy passwords; the security of the encrypted bundle depends entirely on the password strength.
- Rotate passwords if a ciphertext may have been exposed.
- Avoid storing plaintext passwords in shell history; prefer the environment variable or interactive prompt.

## Limitations

- Symbolic links inside the source directory are rejected for safety.
- Browsers keep the decrypted payload in memory for the duration of the session; closing the tab clears it.
- Service workers require secure origins (`https://` or `http://localhost`).

## Contributing

Bug reports, feature ideas, and pull requests are welcome! Please open an issue before large contributions so we can coordinate on direction.
