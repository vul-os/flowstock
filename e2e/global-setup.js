/**
 * Builds the single self-contained binary (frontend embedded) once, before the
 * suite runs, so every spec exercises exactly what ships. Rebuilds are skipped
 * when the binary is already newer than every source file, which keeps the
 * edit/run loop fast; set FLOWSTOCK_SKIP_BUILD=1 to force-skip, or point
 * FLOWSTOCK_BIN at a prebuilt binary (CI builds it as its own step).
 */

import { execSync } from "child_process";
import { existsSync, statSync, readdirSync } from "fs";
import { join } from "path";
import { BIN, ROOT } from "./helpers/node.js";

const SOURCE_DIRS = ["src", "backend"];
const SOURCE_FILES = [
  "index.html",
  "package.json",
  "vite.config.js",
  "tailwind.config.js",
  "go.mod",
];
const IGNORED = new Set(["node_modules", "dist", ".git"]);

function newestMtime(path) {
  if (!existsSync(path)) return 0;
  const st = statSync(path);
  if (!st.isDirectory()) return st.mtimeMs;
  let newest = st.mtimeMs;
  for (const entry of readdirSync(path)) {
    if (IGNORED.has(entry)) continue;
    newest = Math.max(newest, newestMtime(join(path, entry)));
  }
  return newest;
}

export default function globalSetup() {
  if (process.env.FLOWSTOCK_SKIP_BUILD === "1") {
    if (!existsSync(BIN)) {
      throw new Error(`FLOWSTOCK_SKIP_BUILD=1 but no binary at ${BIN}`);
    }
    return;
  }

  if (existsSync(BIN)) {
    const binAge = statSync(BIN).mtimeMs;
    const srcAge = Math.max(
      ...SOURCE_DIRS.map((d) => newestMtime(join(ROOT, d))),
      ...SOURCE_FILES.map((f) => newestMtime(join(ROOT, f))),
    );
    if (binAge >= srcAge) {
      console.log("e2e: reusing up-to-date flowstock binary");
      return;
    }
  }

  console.log("e2e: building flowstock (frontend embedded)…");
  execSync("npm run build:all", { cwd: ROOT, stdio: "inherit" });
}
