import path from "path";

export const CNO_PARQUET_PATH = path.join(
  process.cwd(),
  "public",
  "data",
  "cno_explorer_sc.parquet",
);

export const SC_MUNICIPIOS_GEOJSON_PATH = path.join(
  process.cwd(),
  "public",
  "data",
  "sc_municipios.geojson",
);

export const SC_MUNICIPIOS_GEOJSON_URL = "/data/sc_municipios.geojson";
