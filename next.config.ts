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
    ],
    "/api/dashboard/metadata": ["./public/data/cno_explorer_sc.parquet"],
  },
};

export default nextConfig;
