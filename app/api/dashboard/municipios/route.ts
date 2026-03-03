import { CNO_PARQUET_PATH, SC_MUNICIPIOS_GEOJSON_PATH } from "@/lib/cno-paths";
import { normalizeKey, quoteIdentifier } from "@/lib/cno-utils";
import { configureDuckDbRuntimeEnv } from "@/lib/duckdb-runtime";
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
  obra_ativa?: string;
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
    ["obra_ativa", "obra_ativa"],
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
  try {
    configureDuckDbRuntimeEnv();
    const url = new URL(request.url);

    const filters: Filters = {
      ano_inicio: url.searchParams.get("ano_inicio") ?? undefined,
      categoria: url.searchParams.get("categoria") ?? undefined,
      destinacao: url.searchParams.get("destinacao") ?? undefined,
      tipo_obra: url.searchParams.get("tipo_obra") ?? undefined,
      obra_ativa: url.searchParams.get("obra_ativa") ?? undefined,
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

    const { DuckDBConnection } = await import("@duckdb/node-api");
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

      const municipioColumn = municipioCandidates.find((c) =>
        availableColumns.has(c),
      );
      if (!municipioColumn) {
        return Response.json(
          {
            error:
              "Não foi possível localizar a coluna de município no Parquet (esperado algo como 'municipio' ou 'nome_municipio').",
          },
          { status: 400 },
        );
      }

      if (!availableColumns.has("ano_inicio")) {
        return Response.json(
          {
            error:
              "Não foi possível localizar a coluna 'ano_inicio' no Parquet para montar a tabela por ano.",
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
      const anoCol = quoteIdentifier("ano_inicio");
      const areaCol = quoteIdentifier("area_total");

      const reader = await connection.runAndReadAll(
        `select
           cast(${munCol} as varchar) as municipio,
           cast(${anoCol} as varchar) as ano_inicio,
           count(*)::bigint as count,
           sum(coalesce(try_cast(${areaCol} as double), 0))::double as area_total
         from read_parquet($file)
         ${whereSql}
         group by 1, 2`,
        params,
      );

      const rows = reader.getRowObjectsJson() as Array<{
        municipio: string | null;
        ano_inicio: string | null;
        count: string | number;
        area_total: string | number;
      }>;

      const aggregated = new Map<
        string,
        { name: string; ano_inicio: string; count: number; area_total: number }
      >();

      for (const r of rows) {
        if (!r.municipio) continue;
        if (typeof r.ano_inicio !== "string" || !r.ano_inicio.trim()) continue;

        const munKey = normalizeKey(r.municipio);
        const canonicalName = nameMap.get(munKey);
        if (!canonicalName) continue;

        const ano = String(r.ano_inicio);
        const key = `${canonicalName}||${ano}`;

        const prev = aggregated.get(key);
        if (!prev) {
          aggregated.set(key, {
            name: canonicalName,
            ano_inicio: ano,
            count: Number(r.count),
            area_total: Number(r.area_total),
          });
          continue;
        }

        prev.count += Number(r.count);
        prev.area_total += Number(r.area_total);
      }

      const data = Array.from(aggregated.values());

      return Response.json({ data });
    } finally {
      connection.closeSync();
    }
  } catch (e) {
    console.error("/api/dashboard/municipios failed", e);
    return Response.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Erro interno ao processar tabela de municípios.",
      },
      { status: 500 },
    );
  }
}
