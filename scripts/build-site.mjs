import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildStandaloneDemo } from "./build-standalone-demo.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const siteDir = path.join(repoRoot, "site");

fs.rmSync(siteDir, { recursive: true, force: true });
fs.mkdirSync(siteDir, { recursive: true });

copy(path.join(repoRoot, "dist"), path.join(siteDir, "dist"));
copy(path.join(repoRoot, "examples", "simple-html"), path.join(siteDir, "examples", "simple-html"));

fs.writeFileSync(path.join(siteDir, ".nojekyll"), "", "utf8");
buildStandaloneDemo(path.join(siteDir, "index.html"));
buildStandaloneDemo(path.join(siteDir, "in-browser-demo.html"));

function copy(source, destination) {
  fs.cpSync(source, destination, { recursive: true });
}
