import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDotEnvFile, parseDotEnvLine } from "./check-access-code-contract.mjs";

assert.deepEqual(parseDotEnvLine("KEY=value"), { key: "KEY", value: "value" }, "standard KEY=value parses");
assert.deepEqual(parseDotEnvLine("KEY = value"), { key: "KEY", value: "value" }, "KEY = value parses");
assert.deepEqual(parseDotEnvLine("KEY= value"), { key: "KEY", value: "value" }, "KEY= value parses");
assert.deepEqual(parseDotEnvLine("KEY =value"), { key: "KEY", value: "value" }, "KEY =value parses");

assert.deepEqual(parseDotEnvLine('DOUBLE_QUOTED="hello"'), { key: "DOUBLE_QUOTED", value: "hello" }, "matching double quotes are stripped");
assert.deepEqual(parseDotEnvLine("SINGLE_QUOTED='hello'"), { key: "SINGLE_QUOTED", value: "hello" }, "matching single quotes are stripped");
assert.deepEqual(parseDotEnvLine('TRIMMED_QUOTED = "hello" '), { key: "TRIMMED_QUOTED", value: "hello" }, "values are trimmed before quote stripping");
assert.deepEqual(parseDotEnvLine("EMPTY_VALUE="), { key: "EMPTY_VALUE", value: "" }, "empty values are preserved");
assert.deepEqual(parseDotEnvLine('EMPTY_QUOTED=""'), { key: "EMPTY_QUOTED", value: "" }, "empty quoted values are preserved");

assert.deepEqual(parseDotEnvLine("MISMATCHED_SINGLE='hello\""), { key: "MISMATCHED_SINGLE", value: "'hello\"" }, "mismatched single/double quotes are preserved");
assert.deepEqual(parseDotEnvLine("MISMATCHED_DOUBLE=\"hello'"), { key: "MISMATCHED_DOUBLE", value: "\"hello'" }, "mismatched double/single quotes are preserved");

assert.equal(parseDotEnvLine("not a valid dotenv line"), null, "malformed lines are ignored");
assert.equal(parseDotEnvLine("1INVALID=value"), null, "invalid keys are ignored");
assert.equal(parseDotEnvLine(" = value"), null, "blank keys are ignored");
assert.equal(parseDotEnvLine("# KEY=value"), null, "comments are ignored");

const tempDir = mkdtempSync(join(tmpdir(), "mybishbash-env-parser-"));
try {
  const envPath = join(tempDir, ".env");
  writeFileSync(
    envPath,
    [
      "EXISTING=from-file",
      "NEW_VALUE = 'from file'",
      "MALFORMED LINE",
      "SPACED = value with spaces ",
      "",
    ].join("\n"),
  );

  const env = { EXISTING: "from-env" };
  loadDotEnvFile(envPath, env);

  assert.equal(env.EXISTING, "from-env", "existing process env values are not overwritten");
  assert.equal(env.NEW_VALUE, "from file", "new quoted values are loaded");
  assert.equal(env.SPACED, "value with spaces", "values are trimmed before storage");
  assert.equal(Object.hasOwn(env, "MALFORMED LINE"), false, "malformed lines are not loaded");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

console.log("access-code contract parser checks passed");
