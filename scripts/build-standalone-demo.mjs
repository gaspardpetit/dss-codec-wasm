import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

export function buildStandaloneDemo(outputPath) {
  const indexHtml = read("examples/simple-html/index.html");
  const stylesCss = read("examples/simple-html/styles.css");
  const appJs = read("examples/simple-html/app.js");
  const wasmJs = read("dist/web/dss_codec_wasm.js");
  const wasmBase64 = fs.readFileSync(
    path.join(repoRoot, "dist", "web", "dss_codec_wasm_bg.wasm"),
    "base64",
  );

  const standaloneScript = [
    `const WASM_BASE64 = "${wasmBase64}";`,
    "function base64ToUint8Array(base64) {",
    "  const binary = atob(base64);",
    "  const bytes = new Uint8Array(binary.length);",
    "  for (let index = 0; index < binary.length; index += 1) {",
    "    bytes[index] = binary.charCodeAt(index);",
    "  }",
    "  return bytes;",
    "}",
    "async function init() {",
    "  if (wasm !== undefined) {",
    "    return wasm;",
    "  }",
    "  return initSync(base64ToUint8Array(WASM_BASE64));",
    "}",
    transformWasmJs(wasmJs),
    transformAppJs(appJs),
  ].join("\n\n");

  const standaloneHtml = indexHtml
    .replace(
      '<link rel="stylesheet" href="./styles.css" />',
      `<style>\n${stylesCss}\n</style>`,
    )
    .replace(
      '<script src="./boot.js"></script>',
      `<script type="module">\n${escapeInlineScript(standaloneScript)}\n</script>`,
    );

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, standaloneHtml, "utf8");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  buildStandaloneDemo(path.join(repoRoot, "dist", "standalone", "in-browser-demo.html"));
}

function transformWasmJs(source) {
  return source
    .replace(/^\/\* @ts-self-types=.*?\*\/\s*/s, "")
    .replace(/^export class /gm, "class ")
    .replace(/^export function /gm, "function ")
    .replace(
      "    if (module_or_path === undefined) {\r\n        module_or_path = new URL('dss_codec_wasm_bg.wasm', import.meta.url);\r\n    }",
      "    if (module_or_path === undefined) {\r\n        throw new Error('Standalone build requires embedded WASM bytes.');\r\n    }",
    )
    .replace(/^export \{ initSync, __wbg_init as default \};\s*$/m, "")
    .trim();
}

function transformAppJs(source) {
  return source
    .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\r?\n\r?\n/s, "")
    .trim();
}

function escapeInlineScript(source) {
  return source.replaceAll("</script>", "<\\/script>");
}

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}
