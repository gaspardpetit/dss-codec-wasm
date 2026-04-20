import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
);
const tarballName = `${packageJson.name}-${packageJson.version}.tgz`;
const tarballPath = path.join(repoRoot, tarballName);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dss-codec-pack-"));

try {
  fs.rmSync(tarballPath, { force: true });

  run("npm", ["pack"], repoRoot);
  run("npm", ["init", "-y"], tempDir);
  run("npm", ["install", tarballPath], tempDir);

  run(
    "node",
    [
      "--input-type=module",
      "-e",
      [
        "import pkg, * as m from 'dss-codec';",
        "if (typeof m.decode !== 'function' || typeof m.inspect !== 'function' || !pkg) {",
        "  throw new Error('ESM package smoke test failed');",
        "}",
      ].join(" "),
    ],
    tempDir,
  );

  run(
    "node",
    [
      "-e",
      [
        "const m = require('dss-codec');",
        "if (typeof m.decode !== 'function' || typeof m.inspect !== 'function') {",
        "  throw new Error('CommonJS package smoke test failed');",
        "}",
      ].join(" "),
    ],
    tempDir,
  );
} finally {
  fs.rmSync(tarballPath, { force: true });
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function run(command, args, cwd) {
  const result = isWindowsNpm(command)
    ? spawnSync(
        process.env.ComSpec ?? "cmd.exe",
        ["/d", "/s", "/c", [command, ...args.map(quoteForCmd)].join(" ")],
        {
          cwd,
          stdio: "inherit",
        },
      )
    : spawnSync(command, args, {
        cwd,
        stdio: "inherit",
      });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function isWindowsNpm(command) {
  return process.platform === "win32" && command === "npm";
}

function quoteForCmd(value) {
  if (!/[\s"]/.test(value)) {
    return value;
  }
  return `"${value.replaceAll('"', '""')}"`;
}
