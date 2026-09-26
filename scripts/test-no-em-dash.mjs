// Marketing gate (portfolio rule): no em dashes in customer-facing copy.
// The repo has an inline copy editor that writes src/content/*.js, so this
// guards against an edit silently bringing a dash back. Also covers the
// index.html <title> and meta description, since those are hand-edited too.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = path.resolve(new URL("../", import.meta.url).pathname);
const CONTENT_DIR = path.join(REPO_ROOT, "src", "content");
const INDEX_HTML = path.join(REPO_ROOT, "index.html");

const EM_DASH_PATTERN = /—|&mdash;|&#8212;/;

const failures = [];

async function collectJsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectJsFiles(entryPath)));
    } else if (/\.js$/.test(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

function checkLines(relativePath, source) {
  const lines = source.split("\n");
  lines.forEach((line, index) => {
    if (EM_DASH_PATTERN.test(line)) {
      failures.push(`${relativePath}:${index + 1} contains an em dash: ${line.trim()}`);
    }
  });
}

const contentFiles = await collectJsFiles(CONTENT_DIR);
for (const filePath of contentFiles) {
  const source = await readFile(filePath, "utf8");
  checkLines(path.relative(REPO_ROOT, filePath), source);
}

const indexHtml = await readFile(INDEX_HTML, "utf8");
const titleMatch = indexHtml.match(/<title>([\s\S]*?)<\/title>/);
if (titleMatch && EM_DASH_PATTERN.test(titleMatch[1])) {
  failures.push(`index.html <title> contains an em dash: ${titleMatch[1].trim()}`);
}
const metaDescriptionMatch = indexHtml.match(
  /<meta\s+name="description"\s+content="([\s\S]*?)"\s*\/>/,
);
if (metaDescriptionMatch && EM_DASH_PATTERN.test(metaDescriptionMatch[1])) {
  failures.push(`index.html meta description contains an em dash: ${metaDescriptionMatch[1].trim()}`);
}

if (failures.length === 0) {
  console.log(
    `No em dash test passed (${contentFiles.length} file(s) in src/content/, plus index.html title/meta description)`,
  );
} else {
  console.error(`No em dash test failed: ${failures.length} violation(s)`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}
