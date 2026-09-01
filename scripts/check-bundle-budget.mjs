import { readFile, readdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const budget = JSON.parse(await readFile(new URL("./bundle-budget.json", import.meta.url), "utf8"));
const distAssetsUrl = new URL("../dist/assets/", import.meta.url);

const failures = [];

function fail(message) {
  failures.push(message);
  console.error(`FAIL ${message}`);
}

function pass(message) {
  console.log(`PASS ${message}`);
}

let entries;
try {
  entries = await readdir(distAssetsUrl, { withFileTypes: true });
} catch {
  console.error("dist/assets not found — run `npm run build` before this check");
  process.exit(1);
}

const jsAssets = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".js"));

// The main chunk is the largest index-*.js emitted (manual chunks like
// react/recharts/motion/supabase and lazy chunks like HQPanel/marketing
// pages are named separately and excluded).
const mainChunkCandidates = jsAssets.filter((entry) => /^index-[A-Za-z0-9_-]+\.js$/.test(entry.name));
if (mainChunkCandidates.length === 0) {
  fail("no main chunk (index-*.js) found in dist/assets");
} else {
  let largest = null;
  let largestSize = -1;
  for (const entry of mainChunkCandidates) {
    const raw = await readFile(new URL(entry.name, distAssetsUrl));
    if (raw.length > largestSize) {
      largestSize = raw.length;
      largest = { name: entry.name, raw };
    }
  }
  const gzipSize = gzipSync(largest.raw).length;
  if (gzipSize > budget.mainChunkGzipMaxBytes) {
    fail(`main chunk ${largest.name} is ${gzipSize}B gzip, exceeds budget of ${budget.mainChunkGzipMaxBytes}B`);
  } else {
    pass(`main chunk ${largest.name} is ${gzipSize}B gzip <= ${budget.mainChunkGzipMaxBytes}B budget`);
  }
}

for (const requiredChunk of budget.requiredLazyChunks ?? []) {
  const found = jsAssets.some((entry) => entry.name.startsWith(`${requiredChunk}-`));
  if (found) {
    pass(`required lazy chunk "${requiredChunk}" is present`);
  } else {
    fail(`required lazy chunk "${requiredChunk}" is missing from dist/assets`);
  }
}

if (failures.length > 0) {
  console.error(`\nBundle budget check failed: ${failures.length}`);
  process.exit(1);
}

console.log("\nBundle budget check passed");
