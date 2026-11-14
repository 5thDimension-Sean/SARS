import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

// On restricted Windows filesystems, parallel recursive mkdir calls in Next's
// segment exporter can return EPERM. Serialize filesystem tasks for the build.
const env = { ...process.env };
if (process.platform === "win32") env.UV_THREADPOOL_SIZE = "1";
const result = spawnSync(process.execPath, [
  resolve("node_modules/next/dist/bin/next"), "build", "--webpack", ...process.argv.slice(2),
], { stdio: "inherit", env });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
