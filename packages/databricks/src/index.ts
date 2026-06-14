import { z } from "zod";

export const databricksConfigSchema = z.object({
  serverHostname: z.string().min(1),
  httpPath: z.string().min(1),
  token: z.string().min(1),
  catalog: z.string().min(1),
  schema: z.string().min(1),
});

export type DatabricksConfig = z.infer<typeof databricksConfigSchema>;

export interface DatabricksColumn {
  tableName: string;
  columnName: string;
  dataType: string;
  comment?: string;
}

export interface DatabricksQueryResult<
  TRecord extends Record<string, unknown> = Record<string, unknown>,
> {
  rows: TRecord[];
  rowCount: number;
  queryId?: string;
  elapsedMs?: number;
}

export interface DatabricksConnector {
  healthCheck(): Promise<boolean>;
  listColumns(tableName: string): Promise<DatabricksColumn[]>;
  runReadOnlyQuery<TRecord extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
  ): Promise<DatabricksQueryResult<TRecord>>;
}

export class MockDatabricksConnector implements DatabricksConnector {
  constructor(
    private readonly columns: DatabricksColumn[] = [],
    private readonly queryRows: Record<string, unknown>[] = [],
  ) {}

  async healthCheck(): Promise<boolean> {
    return true;
  }

  async listColumns(tableName: string): Promise<DatabricksColumn[]> {
    return this.columns.filter((column) => column.tableName === tableName);
  }

  async runReadOnlyQuery<TRecord extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
  ): Promise<DatabricksQueryResult<TRecord>> {
    assertReadOnlySql(sql);

    return {
      rows: this.queryRows as TRecord[],
      rowCount: this.queryRows.length,
      queryId: "mock-query",
      elapsedMs: 0,
    };
  }
}

export function assertReadOnlySql(sql: string): void {
  const normalized = sql.trim().toLowerCase();
  const blocked = /\b(alter|create|delete|drop|insert|merge|truncate|update)\b/u;

  if (!normalized.startsWith("select") && !normalized.startsWith("with")) {
    throw new Error("Only SELECT or WITH queries are allowed.");
  }

  if (blocked.test(normalized)) {
    throw new Error("Query contains a blocked SQL statement.");
  }
}
