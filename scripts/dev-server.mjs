import { execFileSync, spawn } from "node:child_process";

const DEFAULT_PORT = "3000";
const portFlagIndex = process.argv.findIndex((arg) => arg === "--port" || arg === "-p");
const port =
  portFlagIndex >= 0 && process.argv[portFlagIndex + 1]
    ? process.argv[portFlagIndex + 1]
    : DEFAULT_PORT;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isServerHealthy() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, {
      method: "HEAD",
      signal: controller.signal
    });
    return response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function getListeningPids() {
  try {
    const output = execFileSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    return output
      .split(/\s+/)
      .map((pid) => pid.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function getCommand(pid) {
  try {
    return execFileSync("ps", ["-p", pid, "-o", "command="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return "";
  }
}

async function stopStaleDevServers() {
  const pids = getListeningPids();

  for (const pid of pids) {
    const command = getCommand(pid);
    const looksLikeNextDev =
      command.includes("next dev") ||
      command.includes("next/dist/bin/next") ||
      command.includes("NEXT_DIST_DIR=.next-dev");

    if (!looksLikeNextDev) {
      console.warn(`[dev] Port ${port} is in use by another process. Leaving PID ${pid} untouched.`);
      continue;
    }

    console.log(`[dev] Cleaning stale Next dev server on port ${port} (PID ${pid})`);
    try {
      process.kill(Number(pid), "SIGTERM");
      await sleep(800);
    } catch {
      // Process may already be gone.
    }

    try {
      process.kill(Number(pid), 0);
      process.kill(Number(pid), "SIGKILL");
      await sleep(250);
    } catch {
      // Process stopped.
    }
  }
}

if (await isServerHealthy()) {
  console.log(`[dev] A healthy dev server is already running at http://localhost:${port}`);
  process.exit(0);
}

if (getListeningPids().length > 0) {
  await stopStaleDevServers();
}

const nextArgs = ["dev", "--port", port];
const child = spawn("next", nextArgs, {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    NEXT_DIST_DIR: ".next-dev"
  }
});

process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
