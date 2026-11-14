// Copies CesiumJS's prebuilt browser files into public/cesium so the static site serves them itself
// (no CDN, no Cesium ion). Runs before dev and build. public/cesium is generated and git-ignored.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const src = resolve("node_modules/cesium/Build/Cesium");
const dest = resolve("public/cesium");
if (!existsSync(src)) throw new Error("CesiumJS is not installed. Run npm ci first.");
const version = JSON.parse(readFileSync(resolve("node_modules/cesium/package.json"), "utf8")).version;
const stamp = resolve(dest, ".version");
if (existsSync(stamp) && readFileSync(stamp, "utf8") === version && existsSync(resolve(dest, "Cesium.js"))) {
  console.log(`CesiumJS ${version} already in public/cesium`);
} else {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  // The global-script build plus its runtime folders. The ES module bundles (index.js/cjs) are not needed.
  for (const item of ["Cesium.js", "Assets", "ThirdParty", "Widgets", "Workers"]) cpSync(resolve(src, item), resolve(dest, item), { recursive: true });
  writeFileSync(stamp, version);
  console.log(`Copied CesiumJS ${version} to public/cesium`);
}
