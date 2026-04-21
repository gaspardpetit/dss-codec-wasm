# dss-codec

`dss-codec` is a WASM-based decoder for Olympus `.dss` and `.ds2` dictation audio files. It works in browser and Node.js environments and can decode encrypted DS2 input when a password is provided.

For codec internals and deeper technical background, see [`dss-codec/README.md`](https://github.com/gaspardpetit/dss-codec/blob/master/dss-codec/README.md) and [`dss-codec/CODEC_SPECIFICATION.md`](https://github.com/gaspardpetit/dss-codec/blob/master/dss-codec/CODEC_SPECIFICATION.md).

## Capabilities

| Input | Machine-readable `format` | Native rate | Notes |
|-------|----------------------------|-------------|-------|
| `.dss` | `dss_sp` | 11025 Hz | DSS SP |
| `.ds2` standard-play | `ds2_sp` | 12000 Hz | DS2 SP |
| `.ds2` quality-play | `ds2_qp` | 16000 Hz | DS2 QP |
| Encrypted `.ds2` | `ds2_sp` or `ds2_qp` after inspection/decode | 12000 or 16000 Hz | Password required for decode or decrypt |

- `inspect(...)` reports `format`, `nativeRate`, and `encryption`.
- `encryption` is a stable machine-readable identifier such as `none`, `ds2_aes_128`, or `ds2_aes_256`.
- Decoded audio exposed to JavaScript is mono `Float32Array` PCM normalized to `[-1.0, 1.0]`.
- `decrypt(...)` and `decryptWithPassword(...)` return plain container bytes. For encrypted DS2 input, this normalizes back to plain `.ds2` bytes.

## Install

```bash
npm install dss-codec
```

- Node.js `>=18` is required.
- The package ships entrypoints for bundlers, browser apps, direct browser module loading, and Node.js consumers.

## Demo

- Hosted demo: <https://gaspardpetit.github.io/dss-codec-wasm/>

The repository includes a plain HTML reference integration in [`examples/simple-html`](./examples/simple-html). It inspects DSS and DS2 files in the browser, prompts for a password when needed, decodes to PCM, builds a WAV for playback, and draws a waveform locally in the browser.

- Local demo: `npm run demo`
- Standalone demo build: `npm run build:standalone`

## Quick Start

```ts
import { readFile } from "node:fs/promises";
import { decode, decodeWithPassword, inspect } from "dss-codec";

const bytes = new Uint8Array(await readFile("recording.ds2"));
const inspection = inspect(bytes);

try {
  const password =
    inspection.encryption === "none"
      ? undefined
      : new TextEncoder().encode("1234");

  const result = password
    ? decodeWithPassword(bytes, password)
    : decode(bytes);

  try {
    console.log(result.format);      // "dss_sp" | "ds2_sp" | "ds2_qp"
    console.log(result.nativeRate);  // 11025 | 12000 | 16000
    console.log(result.samples);     // Float32Array mono PCM in [-1, 1]
  } finally {
    result.free();
  }
} finally {
  inspection.free();
}
```

Use `inspect(...)` first when the caller may receive a mix of plain and encrypted inputs. If the source is encrypted, pass password bytes to `decodeWithPassword(...)`.

## Entrypoints

- `dss-codec`: default package entry for Node.js and most bundler/browser usage.
- `dss-codec/web`: browser-oriented entry with explicit async `init(...)` control for WASM loading.
- `dss-codec/wasm`: public WASM asset export for toolchains that need the `.wasm` file URL explicitly.

## Bundlers And Workers

`dss-codec/web` already falls back to runtime-relative WASM loading with `new URL("dss_codec_wasm_bg.wasm", import.meta.url)`. Some worker and bundler setups handle dependency assets more reliably when the WASM file is imported explicitly:

```ts
import init, { decode } from "dss-codec/web";
import wasmUrl from "dss-codec/wasm?url";

await init(wasmUrl);

const result = decode(fileBytes);
try {
  console.log(result.nativeRate);
} finally {
  result.free();
}
```

For direct browser module usage without a bundler, import from `dss-codec/web` and await `init(...)` before calling the decode APIs.

## API Overview

### Inspection

- `inspect(data: Uint8Array) -> InspectResult`
- `isEncryptedDs2(data: Uint8Array) -> boolean`

`InspectResult` exposes:

- `format: string`
- `nativeRate: number`
- `encryption: string`

### Full Decode

- `decode(data: Uint8Array) -> DecodeResult`
- `decodeWithPassword(data: Uint8Array, password: Uint8Array) -> DecodeResult`

`DecodeResult` exposes:

- `format: string`
- `nativeRate: number`
- `samples: Float32Array`

### Container Decryption

- `decrypt(data: Uint8Array) -> Uint8Array`
- `decryptWithPassword(data: Uint8Array, password: Uint8Array) -> Uint8Array`

These APIs return plain container bytes. They are useful when the caller needs normalized `.ds2` bytes instead of decoded PCM.

### Streaming Decode

- `new StreamDecoder()`
- `StreamDecoder.withPassword(password: Uint8Array)`
- `streamer.push(chunk: Uint8Array) -> Float32Array`
- `streamer.finish() -> Float32Array`
- `streamer.format -> string | undefined`
- `streamer.nativeRate -> number | undefined`

```ts
import { StreamDecoder, inspect } from "dss-codec";

const header = fileChunks[0];
const inspection = inspect(header);

let streamer;
try {
  streamer =
    inspection.encryption === "none"
      ? new StreamDecoder()
      : StreamDecoder.withPassword(new TextEncoder().encode("1234"));
} finally {
  inspection.free();
}

const pcmChunks = [];

try {
  for (const chunk of fileChunks) {
    const samples = streamer.push(chunk);
    if (samples.length > 0) {
      pcmChunks.push(samples);
    }

    console.log(streamer.format);      // may be undefined until enough input is buffered
    console.log(streamer.nativeRate);  // may be undefined until format detection completes
  }

  const tail = streamer.finish();
  if (tail.length > 0) {
    pcmChunks.push(tail);
  }
} finally {
  streamer.free();
}
```

## Returned Data And Integration Notes

- `DecodeResult` and `InspectResult` are WASM-backed objects. Read their properties, then call `free()` when finished.
- Password-taking APIs expect password bytes, not a JavaScript string. Use `new TextEncoder().encode(passwordString)` when needed.
- `nativeRate` is the source format's native sample rate. The package does not resample during JavaScript decode.
- Decoded samples are always mono PCM. Convert or resample them in application code if a downstream system requires another layout.
- `inspect(...)` is useful when deciding whether to call `decode(...)` or `decodeWithPassword(...)`.


## Development

Prerequisites:

- Rust with `wasm32-unknown-unknown`
- `wasm-bindgen-cli`
- Node.js 18+
- The `ext/dss-codec` git submodule checked out locally

Build package artifacts:

```bash
git submodule update --init --recursive
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli

npm run build
```

This generates:

- `dist/browser` for bundlers and browser apps
- `dist/node` for Node.js consumers
- `dist/web` for direct browser module usage with explicit `init(...)`

Verify the packed npm artifact as installed by consumers:

```bash
npm run test:pack
```

Publishing is tag-driven. The npm publish workflow uses Git tags such as `v1.0.0` as the release version source of truth.
