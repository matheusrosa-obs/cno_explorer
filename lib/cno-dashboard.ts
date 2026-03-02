import path from "path";
import { cache } from "react";

import { DuckDBConnection } from "@duckdb/node-api";

export type CnoDashboardTopValue = {
  value: string;
  count: number;
};

export type CnoDashboardTopColumn = {
  column: string;
  values: CnoDashboardTopValue[];
};

export type CnoDashboardData = {
  rowCount: number;
  columns: string[];
  previewColumns: string[];
  previewRows: Array<Record<string, unknown>>;
  topColumns: CnoDashboardTopColumn[];
};

const PARQUET_FILE_PATH = path.join(
  process.cwd(),
  "public",
  "data",
  "cno_explorer_sc.parquet",
);

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export const getCnoDashboardData = cache(async (): Promise<CnoDashboardData> => {
  const connection = await DuckDBConnection.create();

  try {
    const rowCountReader = await connection.runAndReadAll(
      "select count(*)::bigint as row_count from read_parquet($file)",
      { file: PARQUET_FILE_PATH },
    );
    const rowCountRow = rowCountReader.getRowObjectsJson()[0] as {
      row_count: string | number;
    };
    const rowCount = Number(rowCountRow.row_count);

    const describeReader = await connection.runAndReadAll(
      "describe select * from read_parquet($file)",
      { file: PARQUET_FILE_PATH },
    );
    const describeRows = describeReader.getRowObjectsJson() as Array<{
      column_name: string;
      column_type: string;
      null: string;
      key: string;
      default: string;
      extra: string;
    }>;

    const columns = describeRows.map((r) => r.column_name);
    const previewColumns = columns;

    const previewRows = columns.length
      ? ((
          await connection.runAndReadAll(
            "select * from read_parquet($file) limit 20",
            { file: PARQUET_FILE_PATH },
          )
        ).getRowObjectsJson() as Array<Record<string, unknown>>)
      : [];

    const stringColumns = describeRows
      .filter((r) => /varchar|string/i.test(r.column_type))
      .map((r) => r.column_name)
      .slice(0, 2);

    const topColumns: CnoDashboardTopColumn[] = [];
    for (const column of stringColumns) {
      const col = quoteIdentifier(column);

      const topReader = await connection.runAndReadAll(
        `select cast(${col} as varchar) as value, count(*)::bigint as count
         from read_parquet($file)
         where ${col} is not null and cast(${col} as varchar) <> ''
         group by 1
         order by count desc
         limit 10`,
        { file: PARQUET_FILE_PATH },
      );

      const values = (topReader.getRowObjectsJson() as Array<{
        value: string | null;
        count: string | number;
      }>).filter((r) => r.value !== null);

      topColumns.push({
        column,
        values: values.map((r) => ({ value: r.value ?? "", count: Number(r.count) })),
      });
    }

    return {
      rowCount,
      columns,
      previewColumns,
      previewRows,
      topColumns,
    };
  } finally {
    connection.closeSync();
  }
});
