import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

export function parseDotEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const equalsIndex = trimmed.indexOf("=");
  if (equalsIndex === -1) return null;

  const key = trimmed.slice(0, equalsIndex).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;

  let value = trimmed.slice(equalsIndex + 1).trim();
  const startsWithDoubleQuote = value.startsWith('"');
  const endsWithDoubleQuote = value.endsWith('"');
  const startsWithSingleQuote = value.startsWith("'");
  const endsWithSingleQuote = value.endsWith("'");

  if (
    value.length >= 2 &&
    ((startsWithDoubleQuote && endsWithDoubleQuote) || (startsWithSingleQuote && endsWithSingleQuote))
  ) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

export function loadDotEnvFile(path, env = process.env) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const parsed = parseDotEnvLine(line);
    if (!parsed) continue;
    if (env[parsed.key] !== undefined) continue;
    env[parsed.key] = parsed.value;
  }
}

function projectHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "(invalid Supabase URL)";
  }
}

async function validate(client, code) {
  const { data, error } = await client.rpc("validate_mybishbash_access_code", {
    access_code: code,
  });
  if (error) {
    return {
      ok: false,
      rpcError: {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      },
    };
  }
  return { ok: data === true, data };
}

export async function main(argv = process.argv, env = process.env) {
  loadDotEnvFile(resolve(process.cwd(), ".env.local"), env);
  loadDotEnvFile(resolve(process.cwd(), ".env"), env);

  const supabaseUrl = env.VITE_SUPABASE_URL;
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;
  const requestedCode = argv[2] ?? env.MYBISHBASH_ACCESS_CODE ?? "WELCOME";
  const invalidCode = "__MYBISHBASH_INVALID_ACCESS_CODE__";

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Add them to the environment or .env.local.");
    return 2;
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  console.log(`Checking MyBishBash access-code contract on ${projectHost(supabaseUrl)}`);
  console.log(`Code under test: ${requestedCode}`);

  const invalidResult = await validate(client, invalidCode);
  if (invalidResult.rpcError) {
    console.error("validate_mybishbash_access_code RPC failed for an invalid sentinel code:");
    console.error(JSON.stringify(invalidResult.rpcError, null, 2));
    return 1;
  }
  if (invalidResult.ok) {
    console.error("Invalid sentinel code unexpectedly validated. Check the access-code RPC.");
    return 1;
  }

  const result = await validate(client, requestedCode);
  if (result.rpcError) {
    console.error("validate_mybishbash_access_code RPC failed:");
    console.error(JSON.stringify(result.rpcError, null, 2));
    return 1;
  }

  if (!result.ok) {
    console.error(`${requestedCode} did not validate. The RPC exists, but this code is missing, inactive, expired, or out of uses.`);
    console.error("Create or reactivate the code server-side through HQ or staging SQL; do not add a client-side fallback.");
    return 1;
  }

  console.log(`${requestedCode} validated successfully.`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
