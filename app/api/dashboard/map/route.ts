import { DuckDBConnection } from "@duckdb/node-api";

import { CNO_PARQUET_PATH, SC_MUNICIPIOS_GEOJSON_PATH } from "@/lib/cno-paths";
import { normalizeKey, quoteIdentifier } from "@/lib/cno-utils";
import {
  ensureLocalFileFromPublicUrl,
  readTextFromPublicFile,
} from "@/lib/server-public-files";

export const runtime = "nodejs";

type Filters = {
  ano_inicio?: string;
  categoria?: string;
  destinacao?: string;
  tipo_obra?: string;
};

type GeoJSONFeature = {
  properties?: Record<string, unknown>;
};

type GeoJSON = {
  features?: GeoJSONFeature[];
};

function isGeoJSONFeature(value: unknown): value is GeoJSONFeature {
  return typeof value === "object" && value !== null;
}

function pickGeojsonNameProperty(geojson: GeoJSON) {
  const features = Array.isArray(geojson.features) ? geojson.features : [];
  if (features.length === 0) return "name";

  const candidates = [
    "name",
    "NM_MUN",
    "NOME",
    "municipio",
    "MUNICIPIO",
    "NM_MUNICIP",
    "NM_MUNIC",
  ];

  let best = "name";
  let bestScore = -1;

  for (const candidate of candidates) {
    let score = 0;
    for (const f of features) {
      const v = f?.properties?.[candidate];
      if (typeof v === "string" && v.trim()) score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

function buildWhere(filters: Filters, availableColumns: Set<string>) {
  const clauses: string[] = [];
  const params: Record<string, string> = {};

  const entries: Array<[keyof Filters, string]> = [
    ["ano_inicio", "ano_inicio"],
    ["categoria", "categoria"],
    ["destinacao", "destinacao"],
    ["tipo_obra", "tipo_obra"],
  ];

  for (const [filterKey, columnName] of entries) {
    const value = filters[filterKey];
    if (!value) continue;
    if (!availableColumns.has(columnName)) continue;

    const col = quoteIdentifier(columnName);
    clauses.push(`cast(${col} as varchar) = $${filterKey}`);
    params[String(filterKey)] = value;
  }

  return {
    whereSql: clauses.length ? `where ${clauses.join(" and ")}` : "",
    params,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  const filters: Filters = {
    ano_inicio: url.searchParams.get("ano_inicio") ?? undefined,
    categoria: url.searchParams.get("categoria") ?? undefined,
    destinacao: url.searchParams.get("destinacao") ?? undefined,
    tipo_obra: url.searchParams.get("tipo_obra") ?? undefined,
  };

  const parquetPath = await ensureLocalFileFromPublicUrl({
    request,
    localPath: CNO_PARQUET_PATH,
    publicUrlPath: "/data/cno_explorer_sc.parquet",
    tmpFileName: "cno_explorer_sc.parquet",
  });

  const geojsonRaw = await readTextFromPublicFile({
    request,
    localPath: SC_MUNICIPIOS_GEOJSON_PATH,
    publicUrlPath: "/data/sc_municipios.geojson",
  });
  const parsed = JSON.parse(geojsonRaw) as unknown;
  const geojson: GeoJSON =
    typeof parsed === "object" && parsed !== null ? (parsed as GeoJSON) : {};
  const nameProperty = pickGeojsonNameProperty(geojson);

  const features = Array.isArray(geojson.features)
    ? geojson.features.filter(isGeoJSONFeature)
    : [];
  const nameMap = new Map<string, string>();

  for (const f of features) {
    const nameValue = f.properties?.[nameProperty];
    if (typeof nameValue !== "string") continue;
    const key = normalizeKey(nameValue);
    if (!key) continue;
    if (!nameMap.has(key)) nameMap.set(key, nameValue);
  }

  const connection = await DuckDBConnection.create();

  try {
    const describeReader = await connection.runAndReadAll(
      "describe select * from read_parquet($file)",
      { file: parquetPath },
    );
    const describeRows = describeReader.getRowObjectsJson() as Array<{
      column_name: string;
    }>;
    const availableColumns = new Set(describeRows.map((r) => r.column_name));

    const municipioCandidates = [
      "municipio",
      "nome_municipio",
      "municipio_nome",
      "nm_municipio",
      "mun_nome",
      "cidade",
    ];

    const municipioColumn = municipioCandidates.find((c) => availableColumns.has(c));
    if (!municipioColumn) {
      return Response.json(
        {
          error:
            "Não foi possível localizar a coluna de município no Parquet (esperado algo como 'municipio' ou 'nome_municipio').",
        },
        { status: 400 },
      );
    }

    if (!availableColumns.has("area_total")) {
      return Response.json(
        {
          error:
            "Não foi possível localizar a coluna 'area_total' no Parquet para calcular a metragem.",
        },
        { status: 400 },
      );
    }

    const { whereSql, params } = buildWhere(filters, availableColumns);
    params.file = parquetPath;

    const munCol = quoteIdentifier(municipioColumn);
    const areaCol = quoteIdentifier("area_total");

    const totalsReader = await connection.runAndReadAll(
      `select
         count(*)::bigint as total_obras,
         sum(coalesce(try_cast(${areaCol} as double), 0))::double as total_area_total
       from read_parquet($file)
       ${whereSql}`,
      params,
    );

    const totalsRow = (totalsReader.getRowObjectsJson() as Array<{
      total_obras: string | number;
      total_area_total: string | number;
    }>)[0] ?? { total_obras: 0, total_area_total: 0 };

    const reader = await connection.runAndReadAll(
      `select
         cast(${munCol} as varchar) as municipio,
         count(*)::bigint as count,
         sum(coalesce(try_cast(${areaCol} as double), 0))::double as area_total
       from read_parquet($file)
       ${whereSql}
       group by 1`,
      params,
    );

    const rows = reader.getRowObjectsJson() as Array<{
      municipio: string | null;
      count: string | number;
      area_total: string | number;
    }>;

    const aggregated = new Map<string, { count: number; area_total: number }>();

    for (const r of rows) {
      if (!r.municipio) continue;
      const key = normalizeKey(r.municipio);
      const canonicalName = nameMap.get(key);
      if (!canonicalName) continue;

      const prev = aggregated.get(canonicalName) ?? { count: 0, area_total: 0 };
      aggregated.set(canonicalName, {
        count: prev.count + Number(r.count),
        area_total: prev.area_total + Number(r.area_total),
      });
    }

    const data = Array.from(aggregated.entries()).map(([name, v]) => ({
      name,
      count: v.count,
      area_total: v.area_total,
    }));

    return Response.json({
      nameProperty,
      data,
      totals: {
        total_obras: Number(totalsRow.total_obras),
        total_area_total: Number(totalsRow.total_area_total),
      },
    });
  } finally {
    connection.closeSync();
  }
}
