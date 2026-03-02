import os from "os";
import path from "path";

function appendEnvPath(varName: string, value: string) {
  const current = process.env[varName];
  if (!current) {
    process.env[varName] = value;
    return;
  }

  const parts = current.split(path.delimiter).filter(Boolean);
  if (parts.includes(value)) return;
  process.env[varName] = [value, ...parts].join(path.delimiter);
}

export function configureDuckDbRuntimeEnv() {
  // Vercel/serverless: prefer /tmp for DuckDB temp spill files.
  const tmp = os.tmpdir();
  process.env.DUCKDB_TMPDIR = process.env.DUCKDB_TMPDIR ?? tmp;
  process.env.TMPDIR = process.env.TMPDIR ?? tmp;
  process.env.TMP = process.env.TMP ?? tmp;
  process.env.TEMP = process.env.TEMP ?? tmp;

  // Some DuckDB bindings load libduckdb.so via the dynamic linker.
  // Ensure the package directories are on the library search path.
  try {
    // Avoid require.resolve/import here: bundlers may try to statically resolve
    // optional platform-specific packages that don't exist on the build OS.
    const roots = [
      path.join(process.cwd(), "node_modules", "@duckdb", "node-bindings"),
      path.join(process.cwd(), "node_modules", "@duckdb", "node-api"),
    ];

    const candidates = new Set<string>();

    for (const root of roots) {
      candidates.add(root);
      candidates.add(path.join(root, ".."));
      candidates.add(path.join(root, "build"));
      candidates.add(path.join(root, "build", "Release"));
      candidates.add(path.join(root, "lib"));
      candidates.add(path.join(root, "prebuilds"));
      candidates.add(path.join(root, "bin"));
    }

    for (const candidate of candidates) {
      appendEnvPath("LD_LIBRARY_PATH", candidate);
    }
  } catch {
    // Best-effort; if resolve fails, the import error will surface with details.
  }
}
