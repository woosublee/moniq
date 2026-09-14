import { cpSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, ".superpowers/sdd/quirky-dreaming-quiche");
mkdirSync(output, { recursive: true });
const runtime = mkdtempSync(join(output, "task-6-runtime-"));
// Explicit allowlist: never read/copy .env*, .supabase, git, or any existing .next output.
for (const name of ["src", "public", "package.json", "package-lock.json", "tsconfig.json", "postcss.config.mjs"]) {
  cpSync(join(root, name), join(runtime, name), { recursive: true });
}
if (process.argv.includes("--task7-harness")) {
  cpSync(join(root, "e2e/task7-harness"), join(runtime, "src/app/task7-harness"), { recursive: true });
}
cpSync(join(root, "next.config.ts"), join(runtime, "preview-base.config.ts"));
// Extend the copied config, never the working app: keep dev chrome out of UI captures.
writeFileSync(join(runtime, "next.config.ts"), `import base from "./preview-base.config";\nexport default { ...base, devIndicators: false, outputFileTracingRoot: ${JSON.stringify(runtime)} };\n`);
symlinkSync(join(root, "node_modules"), join(runtime, "node_modules"), "dir");
// Parent SDD ignores all files; unignore only copied source for Tailwind's native scanner.
writeFileSync(join(runtime, ".gitignore"), "!src/\n!src/**\nnode_modules/\n.next/\n");
// The copied app has its own normal .next and next-env.d.ts. No root build outputs are touched.
// Keep earlier preview artifacts/pointers intact; this run records its own path.
writeFileSync(join(runtime, "runtime-path.txt"), runtime + "\n");
console.log(`Synthetic preview only: ${runtime}`);
const child = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "dev", runtime, "--webpack", "--hostname", "127.0.0.1", "--port", "3106"], {
  cwd: runtime,
  stdio: "inherit",
  env: {
    PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR || "/tmp",
    NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-preview-not-a-real-key",
  },
});
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
child.on("exit", code => process.exit(code ?? 0));
