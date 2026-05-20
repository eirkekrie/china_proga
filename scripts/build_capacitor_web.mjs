import { spawnSync } from "node:child_process";
import { existsSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();
const apiDir = join(repoRoot, "app", "api");
const apiBackupDir = join(repoRoot, ".capacitor-api-backup");
const outDir = join(repoRoot, "out");
const nextDir = join(repoRoot, ".next");
const nextDevDir = join(repoRoot, ".next-dev");

let apiTemporarilyMoved = false;
let exitCode = 0;

if (existsSync(apiBackupDir)) {
  throw new Error("Refusing to build: .capacitor-api-backup already exists.");
}

try {
  rmSync(outDir, { recursive: true, force: true });
  rmSync(nextDir, { recursive: true, force: true });
  rmSync(nextDevDir, { recursive: true, force: true });

  if (existsSync(apiDir)) {
    renameSync(apiDir, apiBackupDir);
    apiTemporarilyMoved = true;
  }

  const build = spawnSync("npx", ["next", "build"], {
    env: {
      ...process.env,
      CAPACITOR_BUILD: "1",
      NEXT_PUBLIC_CAPACITOR_BUILD: "1",
      NEXT_PUBLIC_DISABLE_SERVER_STATE: "1",
    },
    shell: process.platform === "win32",
    stdio: "inherit",
  });

  if (build.error) {
    throw build.error;
  }

  exitCode = build.status ?? 0;
} finally {
  if (apiTemporarilyMoved) {
    renameSync(apiBackupDir, apiDir);
  }
}

process.exit(exitCode);
