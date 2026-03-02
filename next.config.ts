import type { NextConfig } from "next";
import { dirname } from "path";
import { fileURLToPath } from "url";

const configDir = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: configDir,
  },
  serverExternalPackages: ["@duckdb/node-api", "@duckdb/node-bindings"],
  outputFileTracingIncludes: {
    "/api/dashboard/map": [
      "./public/data/cno_explorer_sc.parquet",
      "./public/data/sc_municipios.geojson",
      "./node_modules/@duckdb/node-api/**",
      "./node_modules/@duckdb/node-bindings/**",
    ],
    "/api/dashboard/metadata": [
      "./public/data/cno_explorer_sc.parquet",
      "./node_modules/@duckdb/node-api/**",
      "./node_modules/@duckdb/node-bindings/**",
    ],
  },
};

export default nextConfig;
