import { CNO_PARQUET_PATH } from "@/lib/cno-paths";
import { quoteIdentifier } from "@/lib/cno-utils";
import { configureDuckDbRuntimeEnv } from "@/lib/duckdb-runtime";
import { ensureLocalFileFromPublicUrl } from "@/lib/server-public-files";

export const runtime = "nodejs";

type Filters = {
  ano_inicio?: string;
  categoria?: string;
  destinacao?: string;
  tipo_obra?: string;
  obra_ativa?: string;
};

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

      if (!availableColumns.has("ano_inicio")) {
        return Response.json(
          {
            error:
              "Não foi possível localizar a coluna 'ano_inicio' no Parquet para montar a série por ano.",
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

      const anoCol = quoteIdentifier("ano_inicio");
      const areaCol = quoteIdentifier("area_total");

      const reader = await connection.runAndReadAll(
        `select
           cast(${anoCol} as varchar) as ano_inicio,
           count(*)::bigint as count,
           sum(coalesce(try_cast(${areaCol} as double), 0))::double as area_total
         from read_parquet($file)
         ${whereSql}
         group by 1
         order by try_cast(cast(${anoCol} as varchar) as integer) asc nulls last, cast(${anoCol} as varchar) asc`,
        params,
      );

      const rows = reader.getRowObjectsJson() as Array<{
        ano_inicio: string | null;
        count: string | number;
        area_total: string | number;
      }>;

      const data = rows
        .filter((r) => typeof r.ano_inicio === "string" && r.ano_inicio.trim())
        .map((r) => ({
          ano_inicio: String(r.ano_inicio),
          count: Number(r.count),
          area_total: Number(r.area_total),
        }));

      return Response.json({ data });
    } finally {
      connection.closeSync();
    }
  } catch (e) {
    console.error("/api/dashboard/timeseries failed", e);
    return Response.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Erro interno ao processar série temporal do dashboard.",
      },
      { status: 500 },
    );
  }
}
