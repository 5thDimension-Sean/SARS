/** Temporary public demo; each visitor supplies their own Earthdata token. */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const frontend = resolve(root, "frontend");
const python = process.env.TANGO_PYTHON || "python";
const cloudflared = process.env.TANGO_CLOUDFLARED || "cloudflared";
const port = Number(process.env.TANGO_DEMO_PORT || 8090);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error("Invalid demo port");
if (!existsSync(resolve(frontend, "node_modules/next"))) throw Error("Install frontend dependencies first: cd frontend && npm ci");

// The runner never asks for or saves a NASA token. Visitors submit their own
// token only through the HTTPS form. Do not inherit a developer's shared token.
const env = { ...process.env };
delete env.EARTHDATA_TOKEN;
const children = new Set();
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (process.platform === "win32" && child.pid) {
      // Terminate processing descendants too; killing only uvicorn can leave
      // a spawned download process running after the demo is stopped.
      spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    } else child.kill("SIGTERM");
  }
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on("exit", stop);

function launch(command, args, options = {}) {
  const child = spawn(command, args, { cwd: root, env, windowsHide: true, ...options });
  children.add(child);
  child.once("close", () => children.delete(child));
  return child;
}
async function run(command, args, options) {
  return await new Promise((resolveRun, reject) => {
    const child = launch(command, args, { stdio: "inherit", ...options });
    child.once("error", () => reject(Error("Unable to start a required demo command")));
    child.once("close", code => code === 0 ? resolveRun() : reject(Error("Demo command failed; review the setup instructions")));
  });
}

async function main() {
  await run(python, ["-c", "import fastapi, uvicorn, h5py, rasterio, asf_search"]);
  // Prevent an occupied port from exposing an unrelated local service.
  const { createServer } = await import("node:net");
  await new Promise((resolvePort, reject) => {
    const check = createServer();
    check.once("error", () => reject(Error("Demo port is occupied; stop the earlier demo or choose TANGO_DEMO_PORT")));
    check.listen(port, "127.0.0.1", () => check.close(resolvePort));
  });

  const tunnel = launch(cloudflared, ["tunnel", "--url", `http://127.0.0.1:${port}`, "--no-autoupdate", "--protocol", "http2", "--loglevel", "info"], { stdio: ["ignore", "pipe", "pipe"] });
  const origin = await new Promise((resolveOrigin, reject) => {
    let buffer = "";
    const timer = setTimeout(() => reject(Error("Unable to create the temporary HTTPS link")), 45000);
    const inspect = chunk => {
      buffer = (buffer + chunk.toString()).slice(-16000);
      const match = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/);
      if (match) { clearTimeout(timer); resolveOrigin(match[0]); }
    };
    tunnel.stdout.on("data", inspect);
    tunnel.stderr.on("data", inspect);
    tunnel.once("error", () => { clearTimeout(timer); reject(Error("Install cloudflared from Cloudflare's official distribution")); });
    tunnel.once("close", () => { clearTimeout(timer); reject(Error("The temporary HTTPS tunnel stopped")); });
  });
  console.log("Building the public demo frontend. The processing link is not ready yet.");
  const buildEnv = { ...env, NEXT_PUBLIC_PROCESSING_API_URL: origin, NEXT_PUBLIC_BASE_PATH: "" };
  await run(process.execPath, ["scripts/copy-cesium.mjs"], { cwd: frontend, env: buildEnv });
  await run(process.execPath, ["scripts/build-static.mjs"], { cwd: frontend, env: buildEnv });
  const jobs = resolve(tmpdir(), "tango-public-demo", "jobs");
  mkdirSync(jobs, { recursive: true });
  const worker = launch(python, ["-m", "uvicorn", "pipeline.demo_server:app", "--host", "127.0.0.1", "--port", String(port), "--workers", "1", "--no-access-log", "--limit-concurrency", "20", "--backlog", "16"], {
    env: { ...env, PROCESSING_ALLOWED_ORIGINS: origin, PROCESSING_WORKDIR: jobs, PYTHONDONTWRITEBYTECODE: "1" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  // Suppress request/library traces: they can contain private job identifiers.
  worker.stderr.on("data", () => {});
  worker.once("error", () => { console.error("Demo worker failed to start"); stop(); });
  worker.once("close", () => { if (!stopping) { console.error("Demo worker stopped"); stop(); } });
  tunnel.once("close", () => { if (!stopping) { console.error("Temporary demo link stopped"); stop(); } });
  const deadline = Date.now() + 45000;
  let healthy = false;
  while (Date.now() < deadline && !stopping) {
    try {
      const response = await fetch(`${origin}/v1/health`, { redirect: "error", signal: AbortSignal.timeout(4000) });
      if (response.ok && (await response.json()).processingEnabled === true) { healthy = true; break; }
    } catch { /* Tunnel and worker may still be starting. No request details logged. */ }
    await new Promise(resolveWait => setTimeout(resolveWait, 1000));
  }
  if (!healthy) throw Error("Demo worker did not become healthy");
  console.log(`PUBLIC DEMO READY: ${origin}/coordinates`);
  console.log("Visitors use their own NASA token. One job at a time; six jobs per hour total.");
  console.log("Keep this terminal and laptop running. Press Ctrl+C to stop the demo.");
  console.log("Health is verified; this does not prove an authenticated NASA comparison has completed.");
}

main().catch(error => { console.error(error.message); stop(); process.exitCode = 1; });
