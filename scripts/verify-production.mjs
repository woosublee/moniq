// Non-destructive Next verification. No database connection or source substitution.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];
if (!["build", "typecheck"].includes(mode) || process.argv.length !== 3) {
  throw new Error("Usage: node scripts/verify-production.mjs build|typecheck");
}
const output = join(root, ".superpowers/sdd/quirky-dreaming-quiche");
// Refuse symlinked output parents and a non-ignored verification directory.
for (const part of [".superpowers", ".superpowers/sdd", ".superpowers/sdd/quirky-dreaming-quiche"]) {
  const path = join(root, part);
  mkdirSync(path, { recursive: true });
  if (lstatSync(path).isSymbolicLink()) throw new Error(`Symlinked output directory: ${part}`);
}
const cleanEnv = {
  PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR || "/tmp",
  NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-validation-not-a-real-key",
};
let child;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child?.kill(signal));
async function run(command, args, cwd) {
  return await new Promise((resolveCode, reject) => {
    child = spawn(command, args, { cwd, env: cleanEnv, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", code => { child = undefined; resolveCode(code ?? 1); });
  });
}
if (await run("git", ["check-ignore", "-q", join(output, "verification-probe")], root) !== 0) {
  throw new Error("Verification output must be gitignored before running");
}
const runtime = mkdtempSync(join(output, `task-8-${mode}-`));
const manifest = {};
function copy(name) {
  const source = join(root, name);
  const stat = lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error(`Refusing source symlink: ${name}`);
  if (stat.isDirectory()) {
    mkdirSync(join(runtime, name), { recursive: true });
    for (const entry of readdirSync(source).sort()) {
      if (entry.startsWith(".") || entry === "node_modules") continue;
      if (mode === "build" && (/\.(test|spec)\.[^.]+$/.test(entry) || entry === "replay.fixtures.ts")) continue;
      copy(join(name, entry));
    }
  } else {
    const allowed = [".ts", ".tsx", ".js", ".mjs", ".mts", ".json", ".css", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".ico", ".woff", ".woff2"];
    if (!stat.isFile() || !allowed.includes(extname(name))) throw new Error(`File not allowlisted: ${name}`);
    mkdirSync(dirname(join(runtime, name)), { recursive: true });
    copyFileSync(source, join(runtime, name));
    manifest[name] = createHash("sha256").update(readFileSync(join(runtime, name))).digest("hex");
  }
}
for (const name of ["src", "public", "package.json", "package-lock.json", "tsconfig.json", "next.config.ts", "postcss.config.mjs"]) copy(name);
if (mode === "typecheck") {
  for (const name of ["e2e", "playwright.config.ts", "vitest.config.ts"]) copy(name);
}
// The sole symlink is installed dependencies. Never copy .env*, .supabase,
// original .next, next-env.d.ts, or a preview app with a routable test harness.
symlinkSync(join(root, "node_modules"), join(runtime, "node_modules"), "dir");
// Tailwind ignores the SDD parent; only the copied source needs discovery.
writeFileSync(join(runtime, ".gitignore"), "!src/\n!src/**\nnode_modules/\n.next/\n");
const results = { mode, runtime: relative(root, runtime), startedAt: new Date().toISOString(), sourceSha256: manifest, commands: [] };
writeFileSync(join(runtime, "verification.json"), JSON.stringify(results, null, 2) + "\n");
console.log(`Isolated ${mode}: ${runtime}`);
console.log(mode === "build" ? "Production sources, original Next config, Webpack backend; fake public configuration, not deployable." : "All source + unit/E2E types and freshly generated production routes; no test harness app route.");
const commands = mode === "build"
  ? [["npm", ["run", "build", "--", "--webpack"]]]
  : [[process.execPath, [join(root, "node_modules/next/dist/bin/next"), "typegen"]], [process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "--noEmit"]]];
for (const [command, args] of commands) {
  const start = new Date().toISOString();
  const code = await run(command, args, runtime);
  results.commands.push({ command, args, start, end: new Date().toISOString(), exit: code });
  writeFileSync(join(runtime, "verification.json"), JSON.stringify(results, null, 2) + "\n");
  if (code !== 0) { process.exitCode = code; break; }
}
