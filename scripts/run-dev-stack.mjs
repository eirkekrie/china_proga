import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

const cwd = process.cwd();
const pythonExecutable = process.env.PYTHON_EXECUTABLE || "python";
const nextCli = join(cwd, "node_modules", "next", "dist", "bin", "next");

if (!existsSync(nextCli)) {
  console.error(
    "[launcher] Next.js was not found. Run `npm install` first, then retry `npm run dev`."
  );
  process.exit(1);
}

const children = [];
let shuttingDown = false;
const keepAlive = setInterval(() => {}, 60000);

function pipeWithPrefix(stream, prefix, target) {
  if (!stream) {
    return;
  }

  const rl = createInterface({ input: stream });
  rl.on("line", (line) => {
    target.write(`${prefix}${line}\n`);
  });
}

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  clearInterval(keepAlive);

  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }

  setTimeout(() => {
    process.exit(exitCode);
  }, 150);
}

function startProcess(name, command, args) {
  const child = spawn(command, args, {
    cwd,
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"],
    windowsHide: false,
  });

  children.push(child);

  pipeWithPrefix(child.stdout, `[${name}] `, process.stdout);
  pipeWithPrefix(child.stderr, `[${name}] `, process.stderr);

  child.on("error", (error) => {
    console.error(`[launcher] Failed to start ${name}: ${error.message}`);
    shutdown(1);
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    const reason =
      signal !== null
        ? `signal ${signal}`
        : `code ${code === null ? "unknown" : code}`;

    console.error(`[launcher] Process ${name} exited (${reason}). Stopping the stack.`);
    shutdown(code ?? 1);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log("[launcher] Starting pronunciation server and Next.js dev server...");
console.log(
  `[launcher] Python: ${pythonExecutable}. Set PYTHON_EXECUTABLE if you need a different interpreter.`
);

startProcess("pronunciation", pythonExecutable, ["scripts/pronunciation_server.py"]);
startProcess("web", process.execPath, [nextCli, "dev"]);