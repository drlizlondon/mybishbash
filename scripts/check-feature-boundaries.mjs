import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const SRC_ROOT = new URL("../src/", import.meta.url);
const SRC_DIR = path.resolve(new URL("../src", import.meta.url).pathname);

async function collectFiles(dirUrl, out = []) {
  const entries = await readdir(dirUrl, { withFileTypes: true });
  for (const entry of entries) {
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dirUrl);
    if (entry.isDirectory()) {
      await collectFiles(entryUrl, out);
    } else if (/\.(js|jsx)$/.test(entry.name)) {
      out.push(entryUrl);
    }
  }
  return out;
}

function toRelative(fileUrl) {
  return path.relative(SRC_DIR, fileUrl.pathname);
}

const IMPORT_PATTERN = /(?:import|export)\s+(?:[^'"]*?\bfrom\s+)?["']([^"']+)["']/g;

function extractImportSpecifiers(source) {
  const specifiers = [];
  let match;
  while ((match = IMPORT_PATTERN.exec(source)) !== null) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

function resolveSpecifier(relativeFilePath, specifier) {
  if (!specifier.startsWith(".")) return null; // package import, not ours to police
  const fileDir = path.dirname(relativeFilePath);
  return path.normalize(path.join(fileDir, specifier)).split(path.sep).join("/");
}

function getFeatureName(relativePath) {
  const match = relativePath.match(/^features\/([^/]+)(?:\/|$)/);
  return match ? match[1] : null;
}

const failures = [];

function fail(message) {
  failures.push(message);
  console.error(`FAIL ${message}`);
}

function pass(message) {
  console.log(`PASS ${message}`);
}

const files = await collectFiles(SRC_ROOT);

let crossFeatureChecks = 0;
let downwardChecks = 0;

for (const fileUrl of files) {
  const relativePath = toRelative(fileUrl);
  const source = await readFile(fileUrl, "utf8");
  const specifiers = extractImportSpecifiers(source);
  const ownFeature = getFeatureName(relativePath);

  for (const specifier of specifiers) {
    const resolved = resolveSpecifier(relativePath, specifier);
    if (!resolved) continue;

    // R3 rule 1: feature-to-feature imports must go through the target's index.js.
    // Only applies to importers that are themselves inside src/features/<a>/ —
    // app/App.jsx code may import a feature's internals (e.g. lazy() chunk
    // splitting, direct sub-module imports) per the packet's target layout.
    const targetFeature = getFeatureName(resolved);
    if (ownFeature && targetFeature && targetFeature !== ownFeature) {
      crossFeatureChecks += 1;
      const endsAtRoot = resolved === `features/${targetFeature}` || resolved === `features/${targetFeature}/index`;
      if (!endsAtRoot) {
        fail(
          `${relativePath} imports "${specifier}" (resolves to ${resolved}) — cross-feature imports must end at features/${targetFeature}/index.js`,
        );
      }
    }

    // R3 rule 2: stores/lib/services/domain never import features or App.jsx.
    const isDownwardOnlyDir = /^(stores|lib|services|domain)\//.test(relativePath);
    if (isDownwardOnlyDir) {
      downwardChecks += 1;
      if (resolved.startsWith("features/") || resolved === "App") {
        fail(`${relativePath} imports "${specifier}" (resolves to ${resolved}) — src/${relativePath.split("/")[0]}/ must never import features/ or App.jsx`);
      }
    }
  }
}

if (failures.length === 0) {
  pass(`no cross-feature internal imports (${crossFeatureChecks} cross-feature import(s) checked, all through index.js)`);
  pass(`no downward-only-directory violations (${downwardChecks} import(s) checked in stores/lib/services/domain)`);
  console.log("\nFeature boundary checks passed");
} else {
  console.error(`\nFeature boundary checks failed: ${failures.length}`);
  process.exit(1);
}
