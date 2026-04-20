# dss-codec-wasm

WASM packaging project for the DSS / DS2 codec, using `ext/dss-codec` as a git submodule for the core Rust decoder.

This repo publishes the npm package `dss-codec`.

## Development

Prerequisites:

- Rust with `wasm32-unknown-unknown`
- `wasm-bindgen-cli`
- Node.js 18+
- The `ext/dss-codec` git submodule checked out locally

Build the package artifacts:

```bash
git submodule update --init --recursive
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli

npm run build
```

This generates:

- `dist/browser` for bundlers and browser apps
- `dist/node` for Node.js consumers
- `dist/web` for direct browser `<script type="module">` usage without a bundler

Before publishing, verify the packed npm artifact exactly as consumers will install it:

```bash
npm run test:pack
```

## In-Browser Demo

The repo includes a plain HTML demo in [`examples/simple-html`](./examples/simple-html) that:

- opens `.dss` and `.ds2` files in the browser
- inspects the file format and encryption mode
- prompts for a password when the file is encrypted
- decodes the audio to PCM
- generates a playable WAV in the browser
- draws a waveform on a canvas
- keeps all inspection, decryption, decoding, and WAV generation local in the browser with no external upload or processing

Run it locally:

```bash
npm run demo
```

Then open `http://127.0.0.1:4173/examples/simple-html/`.
Do not open `examples/simple-html/index.html` directly with `file://`; browser module and WASM loading will be blocked there.

For a repo-hosted version, the GitHub Pages workflow builds a static site from `dist/web` plus the demo page and publishes it from the repository.

For a single self-contained HTML artifact, build:

```bash
npm run build:standalone
```

This writes [`dist/standalone/in-browser-demo.html`](./dist/standalone/in-browser-demo.html), which inlines the page, styles, app logic, and WASM bytes into one file.

## Package API

- `inspect(data: Uint8Array)`
- `decode(data: Uint8Array)`
- `decodeWithPassword(data: Uint8Array, password: Uint8Array)`
- `decrypt(data: Uint8Array)`
- `decryptWithPassword(data: Uint8Array, password: Uint8Array)`
- `isEncryptedDs2(data: Uint8Array)`
- `new StreamDecoder()`
- `StreamDecoder.withPassword(password: Uint8Array)`
- `streamer.push(chunk: Uint8Array)`
- `streamer.finish()`
- `streamer.format`
- `streamer.nativeRate`

Decoded samples exposed to JavaScript are normalized mono `Float32Array` values in `[-1.0, 1.0]`.

### Streaming Example

```ts
import { StreamDecoder, inspect } from "dss-codec";

const info = inspect(headerBytes);
const streamer =
  info.encryption === "none"
    ? new StreamDecoder()
    : StreamDecoder.withPassword(passwordBytes);

const chunks: Float32Array[] = [];
for (const chunk of fileChunks) {
  const samples = streamer.push(chunk);
  if (samples.length > 0) {
    chunks.push(samples);
  }
}

const tail = streamer.finish();
if (tail.length > 0) {
  chunks.push(tail);
}
```
