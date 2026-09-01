import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const forbiddenParts = ["SERVICE", "ROLE"];
const forbiddenToken = forbiddenParts.join("_");
const serviceRolePattern = new RegExp(`SUPABASE_${forbiddenToken}_KEY|${forbiddenToken.toLowerCase()}`, "i");
const viteServicePattern = new RegExp(`VITE_.*(${forbiddenParts.join("|")})`, "i");
const scannedRoots = ["src", "index.html", "vite.config.js", "vite.config.ts"];
const ignoredDirectories = new Set(["node_modules", "dist", ".git"]);

function collectFiles(path) {
  const absolutePath = join(root, path);
  try {
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      return readdirSync(absolutePath).flatMap((entry) => {
        if (ignoredDirectories.has(entry)) return [];
        return collectFiles(join(path, entry));
      });
    }
    if (stat.isFile()) return [absolutePath];
  } catch {
    return [];
  }
  return [];
}

const frontendMatches = scannedRoots
  .flatMap(collectFiles)
  .filter((file) => serviceRolePattern.test(readFileSync(file, "utf8")))
  .map((file) => relative(root, file));

const envMatches = readdirSync(root)
  .filter((entry) => entry.startsWith(".env"))
  .filter((entry) => viteServicePattern.test(readFileSync(join(root, entry), "utf8")));

if (frontendMatches.length > 0 || envMatches.length > 0) {
  console.error("Service-role secrets must not appear in frontend source or Vite-exposed env files.");
  for (const match of frontendMatches) console.error(`frontend: ${match}`);
  for (const match of envMatches) console.error(`env: ${match}`);
  process.exit(1);
}

console.log("Account deletion security guardrail passed.");
