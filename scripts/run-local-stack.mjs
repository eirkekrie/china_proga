import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const nextBin = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next");
const args = new Set(process.argv.slice(2));

if (args.has("--help")) {
  process.stdout.write(
    [
      "Usage:",
      "  node scripts/run-local-stack.mjs",
      "  node scripts/run-local-stack.mjs --with-web",
      "",
      "Modes:",
      "  default     Start qwen_tts_server.py and pronunciation_server.py",
      "  --with-web  Start both Python services and `npm run dev`",
      "",
      "Optional env:",
      "  PYTHON_EXECUTABLE=python",
    ].join("\n") + "\n",
  );
  process.exit(0);
}

const pythonExecutable = process.env.PYTHON_EXECUTABLE?.trim() || "python";
const tasks = [
  {
    name: "qwen",
    command: pythonExecutable,
    args: ["scripts/qwen_tts_server.py"],
  },
  {
    name: "pronunciation",
    command: pythonExecutable,
    args: ["scripts/pronunciation_server.py"],
  },
];

if (args.has("--with-web")) {
  tasks.push({
    name: "web",
    command: process.execPath,
    args: [nextBin, "dev"],
  });
}

/** @type {Map<string, import("node:child_process").ChildProcessWithoutNullStreams>} */
const children = new Map();
let shuttingDown = false;
let finalExitCode = 0;

function pipeOutput(stream, taskName, isError = false) {
  const target = isError ? process.stderr : process.stdout;
  const rl = createInterface({ input: stream });

  rl.on("line", (line) => {
    target.write(`[${taskName}] ${line}\n`);
  });
}

function stopChild(child) {
  if (!child.pid || child.exitCode !== null) {
    return Promise.resolve();
  }

  if (process.platform === "win32") {
    return new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });

      killer.on("error", () => {
        try {
          child.kill("SIGTERM");
        } catch {}
        resolve();
      });

      killer.on("exit", () => resolve());
    });
  }

  try {
    child.kill("SIGTERM");
  } catch {}

  return Promise.resolve();
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  finalExitCode = exitCode;

  await Promise.all([...children.values()].map((child) => stopChild(child)));
  process.exit(finalExitCode);
}

for (const task of tasks) {
  if (task.name === "qwen") {
    process.stdout.write("[launcher] qwen может загружаться долго при первом старте модели.\n");
  }

  const child = spawn(task.command, task.args, {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });

  children.set(task.name, child);
  pipeOutput(child.stdout, task.name);
  pipeOutput(child.stderr, task.name, true);

  child.on("spawn", () => {
    process.stdout.write(`[launcher] started ${task.name}\n`);
  });

  child.on("error", (error) => {
    process.stderr.write(`[launcher] failed to start ${task.name}: ${error.message}\n`);
    void shutdown(1);
  });

  child.on("exit", (code, signal) => {
    children.delete(task.name);

    if (shuttingDown) {
      if (children.size === 0) {
        process.exit(finalExitCode);
      }
      return;
    }

    if (code === 0 || signal === "SIGTERM" || signal === "SIGINT") {
      process.stdout.write(`[launcher] ${task.name} stopped.\n`);
      if (children.size === 0) {
        process.exit(0);
      }
      return;
    }

    process.stderr.write(
      `[launcher] ${task.name} exited unexpectedly with ${code ?? signal ?? "unknown status"}.\n`,
    );
    void shutdown(typeof code === "number" ? code : 1);
  });
}

process.on("SIGINT", () => {
  void shutdown(0);
});

process.on("SIGTERM", () => {
  void shutdown(0);
});
