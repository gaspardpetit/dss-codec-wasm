import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const distDir = path.join(repoRoot, "dist");
const browserDir = path.join(distDir, "browser");
const nodeDir = path.join(distDir, "node");
const webDir = path.join(distDir, "web");
const wasmFile = path.join(
  repoRoot,
  "target",
  "wasm32-unknown-unknown",
  "release",
  "dss_codec_wasm.wasm",
);

run("cargo", ["build", "--target", "wasm32-unknown-unknown", "--release"], repoRoot);

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(browserDir, { recursive: true });
fs.mkdirSync(nodeDir, { recursive: true });
fs.mkdirSync(webDir, { recursive: true });

run(
  "wasm-bindgen",
  ["--target", "bundler", "--out-dir", browserDir, "--out-name", "dss_codec_wasm", wasmFile],
  repoRoot,
);

run(
  "wasm-bindgen",
  ["--target", "nodejs", "--out-dir", nodeDir, "--out-name", "dss_codec_wasm", wasmFile],
  repoRoot,
);

run(
  "wasm-bindgen",
  ["--target", "web", "--out-dir", webDir, "--out-name", "dss_codec_wasm", wasmFile],
  repoRoot,
);

fs.renameSync(
  path.join(nodeDir, "dss_codec_wasm.js"),
  path.join(nodeDir, "dss_codec_wasm.cjs"),
);

const nodeWrapper = `import pkg from "./dss_codec_wasm.cjs";

export const DecodeResult = pkg.DecodeResult;
export const InspectResult = pkg.InspectResult;
export const StreamDecoder = pkg.StreamDecoder;
export const decode = pkg.decode;
export const decodeWithPassword = pkg.decodeWithPassword;
export const decrypt = pkg.decrypt;
export const decryptWithPassword = pkg.decryptWithPassword;
export const inspect = pkg.inspect;
export const isEncryptedDs2 = pkg.isEncryptedDs2;
export default pkg;
`;

fs.writeFileSync(path.join(nodeDir, "index.js"), nodeWrapper, "utf8");

renamePublicSymbols(path.join(browserDir, "dss_codec_wasm.js"));
renamePublicSymbols(path.join(webDir, "dss_codec_wasm.js"));
renamePublicSymbols(path.join(browserDir, "dss_codec_wasm.d.ts"));
renamePublicSymbols(path.join(webDir, "dss_codec_wasm.d.ts"));
renamePublicSymbols(path.join(nodeDir, "dss_codec_wasm.cjs"));
renamePublicSymbols(path.join(nodeDir, "dss_codec_wasm.d.ts"));

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function renamePublicSymbols(filePath) {
  const contents = fs.readFileSync(filePath, "utf8");
  const renamed = contents
    .replaceAll("WasmDecodeResult", "DecodeResult")
    .replaceAll("WasmInspectResult", "InspectResult")
    .replaceAll("WasmStreamDecoder", "StreamDecoder");
  fs.writeFileSync(filePath, renamed, "utf8");
}
