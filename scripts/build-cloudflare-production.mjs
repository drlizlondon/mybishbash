import { spawnSync } from "node:child_process";

const DEFAULT_SUPABASE_URL = "https://ifcgomivmzwqqxhltfjj.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmY2dvbWl2bXp3cXF4aGx0ZmpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNjYyOTYsImV4cCI6MjA5MzY0MjI5Nn0.b7Bdwp6QuuUOW-i_LjA8dIskEwa5vpN7oJi5xNvFdL0";
const DEFAULT_HQ_ADMIN_EMAILS = "lizzies_95@hotmail.co.uk";

run("npm", ["run", "build"], {
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY,
  VITE_HQ_ADMIN_EMAILS: process.env.VITE_HQ_ADMIN_EMAILS || DEFAULT_HQ_ADMIN_EMAILS,
  ...process.env,
  VITE_BASE_PATH: "/",
});

run("node", ["scripts/validate-cloudflare-production-build.mjs"], process.env);

function run(command, args, env) {
  const result = spawnSync(command, args, {
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
