import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
