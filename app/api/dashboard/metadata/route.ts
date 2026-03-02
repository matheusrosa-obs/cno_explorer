import { DuckDBConnection } from "@duckdb/node-api";

import { CNO_PARQUET_PATH, SC_MUNICIPIOS_GEOJSON_URL } from "@/lib/cno-paths";
import { quoteIdentifier } from "@/lib/cno-utils";
import { ensureLocalFileFromPublicUrl } from "@/lib/server-public-files";

export const runtime = "nodejs";

const FILTER_COLUMNS = [
  "ano_inicio",
  "categoria",
  "destinacao",
  "tipo_obra",
] as const;

type FilterColumn = (typeof FILTER_COLUMNS)[number];

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

export async function GET(request: Request) {
  const parquetPath = await ensureLocalFileFromPublicUrl({
    request,
    localPath: CNO_PARQUET_PATH,
    publicUrlPath: "/data/cno_explorer_sc.parquet",
    tmpFileName: "cno_explorer_sc.parquet",
  });

  const connection = await DuckDBConnection.create();

  try {
    const describeReader = await connection.runAndReadAll(
      "describe select * from read_parquet($file)",
      { file: parquetPath },
    );

    const describeRows = describeReader.getRowObjectsJson() as Array<{
      column_name: string;
      column_type: string;
    }>;

    const columns = describeRows.map((r) => r.column_name);

    const values: Record<FilterColumn, string[]> = {
      ano_inicio: [],
      categoria: [],
      destinacao: [],
      tipo_obra: [],
    };

    for (const column of FILTER_COLUMNS) {
      if (!columns.includes(column)) continue;

      const col = quoteIdentifier(column);

      const reader = await connection.runAndReadAll(
        column === "ano_inicio"
          ? `select distinct cast(${col} as varchar) as v
             from read_parquet($file)
             where ${col} is not null and cast(${col} as varchar) <> ''
             order by try_cast(${col} as integer) asc nulls last
             limit 500`
          : `select distinct cast(${col} as varchar) as v
             from read_parquet($file)
             where ${col} is not null and cast(${col} as varchar) <> ''
             order by 1 asc
             limit 500`,
        { file: parquetPath },
      );

      const rows = reader.getRowObjectsJson() as Array<{ v: string | null }>;
      values[column] = rows
        .map((r) => r.v)
        .filter((v): v is string => Boolean(v));
    }

    return Response.json({
      geojsonUrl: SC_MUNICIPIOS_GEOJSON_URL,
      filters: {
        ano_inicio: asStringArray(values.ano_inicio),
        categoria: asStringArray(values.categoria),
        destinacao: asStringArray(values.destinacao),
        tipo_obra: asStringArray(values.tipo_obra),
      },
    });
  } finally {
    connection.closeSync();
  }
}
