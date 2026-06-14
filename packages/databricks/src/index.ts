import { z } from "zod";

import { DBSQLClient } from "@databricks/sql";

export const databricksConfigSchema = z.object({
  serverHostname: z.string().min(1),
  httpPath: z.string().min(1),
  token: z.string().min(1),
  catalog: z.string().min(1),
  schema: z.string().min(1),
  queryTag: z.string().min(1).default("app:openai-demo-bi-copilot"),
  maxRows: z.number().int().positive().default(1000),
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
  getTablePreview<TRecord extends Record<string, unknown> = Record<string, unknown>>(
    tableName: string,
    limit?: number,
  ): Promise<DatabricksQueryResult<TRecord>>;
  runReadOnlyQuery<TRecord extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
  ): Promise<DatabricksQueryResult<TRecord>>;
}

interface QueryOptions {
  maxRows?: number;
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

  async getTablePreview<TRecord extends Record<string, unknown> = Record<string, unknown>>(
    _tableName: string,
    limit = 25,
  ): Promise<DatabricksQueryResult<TRecord>> {
    return {
      rows: this.queryRows.slice(0, limit) as TRecord[],
      rowCount: Math.min(this.queryRows.length, limit),
      queryId: "mock-query",
      elapsedMs: 0,
    };
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

export class LiveDatabricksConnector implements DatabricksConnector {
  constructor(private readonly config: DatabricksConfig) {}

  async healthCheck(): Promise<boolean> {
    const result = await this.runReadOnlyQuery("SELECT 1 AS ok");
    return result.rowCount === 1;
  }

  async listColumns(tableName: string): Promise<DatabricksColumn[]> {
    const qualified = parseTableName(tableName, this.config);
    const sql = `
      SELECT
        table_name,
        column_name,
        full_data_type AS data_type,
        comment
      FROM ${quoteIdentifier(qualified.catalog)}.information_schema.columns
      WHERE table_schema = ${sqlString(qualified.schema)}
        AND table_name = ${sqlString(qualified.table)}
      ORDER BY ordinal_position
    `;

    const result = await this.runReadOnlyQuery<{
      table_name: string;
      column_name: string;
      data_type: string;
      comment: string | null;
    }>(sql);

    return result.rows.map((row) => ({
      tableName: row.table_name,
      columnName: row.column_name,
      dataType: row.data_type,
      comment: row.comment ?? undefined,
    }));
  }

  async getTablePreview<TRecord extends Record<string, unknown> = Record<string, unknown>>(
    tableName: string,
    limit = 25,
  ): Promise<DatabricksQueryResult<TRecord>> {
    const qualifiedTableName = qualifyTableName(tableName, this.config);
    const boundedLimit = Math.min(Math.max(limit, 1), this.config.maxRows);

    return this.runReadOnlyQuery<TRecord>(
      `SELECT * FROM ${qualifiedTableName} LIMIT ${boundedLimit}`,
    );
  }

  async runReadOnlyQuery<TRecord extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
  ): Promise<DatabricksQueryResult<TRecord>> {
    return this.executeQuery<TRecord>(sql, { maxRows: this.config.maxRows });
  }

  private async executeQuery<TRecord extends Record<string, unknown>>(
    sql: string,
    options: QueryOptions = {},
  ): Promise<DatabricksQueryResult<TRecord>> {
    assertReadOnlySql(sql);

    const startedAt = Date.now();
    const client = new DBSQLClient();
    const connectedClient = await client.connect({
      host: this.config.serverHostname,
      path: this.config.httpPath,
      token: this.config.token,
      userAgentEntry: "openai-demo-bi-copilot",
    });

    const session = await connectedClient.openSession({
      configuration: {
        query_tags: this.config.queryTag,
      },
    });

    try {
      const operation = await session.executeStatement(sql, {
        runAsync: true,
        maxRows: options.maxRows ?? this.config.maxRows,
      });

      try {
        const rows = (await operation.fetchAll()) as TRecord[];
        const operationWithId = operation as {
          operationId?: string;
          getOperationId?: () => string;
        };
        const queryId = operationWithId.getOperationId?.() ?? operationWithId.operationId;

        return {
          rows,
          rowCount: rows.length,
          queryId,
          elapsedMs: Date.now() - startedAt,
        };
      } finally {
        await operation.close();
      }
    } finally {
      await session.close();
      await connectedClient.close();
    }
  }
}

export function createDatabricksConnector(config: DatabricksConfig): DatabricksConnector {
  return new LiveDatabricksConnector(databricksConfigSchema.parse(config));
}

export function createDatabricksConnectorFromEnv(env: {
  DATABRICKS_SERVER_HOSTNAME?: string;
  DATABRICKS_HTTP_PATH?: string;
  DATABRICKS_TOKEN?: string;
  DATABRICKS_CATALOG?: string;
  DATABRICKS_SCHEMA?: string;
  DATABRICKS_QUERY_TAG?: string;
  DATABRICKS_MAX_ROWS?: string | number;
}): DatabricksConnector {
  return createDatabricksConnector({
    serverHostname: requiredEnv(env.DATABRICKS_SERVER_HOSTNAME, "DATABRICKS_SERVER_HOSTNAME"),
    httpPath: requiredEnv(env.DATABRICKS_HTTP_PATH, "DATABRICKS_HTTP_PATH"),
    token: requiredEnv(env.DATABRICKS_TOKEN, "DATABRICKS_TOKEN"),
    catalog: env.DATABRICKS_CATALOG ?? "main",
    schema: env.DATABRICKS_SCHEMA ?? "bi_demo",
    queryTag: env.DATABRICKS_QUERY_TAG ?? "app:openai-demo-bi-copilot",
    maxRows: Number(env.DATABRICKS_MAX_ROWS ?? 1000),
  });
}

export function assertReadOnlySql(sql: string): void {
  const normalized = stripSqlComments(sql).trim().toLowerCase();
  const blocked = /\b(alter|create|delete|drop|insert|merge|truncate|update)\b/u;

  if (!normalized.startsWith("select") && !normalized.startsWith("with")) {
    throw new Error("Only SELECT or WITH queries are allowed.");
  }

  if (blocked.test(normalized)) {
    throw new Error("Query contains a blocked SQL statement.");
  }

  if (normalized.includes(";")) {
    throw new Error("Multiple SQL statements are not allowed.");
  }
}

export function qualifyTableName(
  tableName: string,
  config: Pick<DatabricksConfig, "catalog" | "schema">,
): string {
  const parsed = parseTableName(tableName, config);
  return [parsed.catalog, parsed.schema, parsed.table].map(quoteIdentifier).join(".");
}

function parseTableName(tableName: string, config: Pick<DatabricksConfig, "catalog" | "schema">) {
  const parts = tableName
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 1) {
    return {
      catalog: config.catalog,
      schema: config.schema,
      table: parts[0] ?? "",
    };
  }

  if (parts.length === 2) {
    return {
      catalog: config.catalog,
      schema: parts[0] ?? "",
      table: parts[1] ?? "",
    };
  }

  if (parts.length === 3) {
    return {
      catalog: parts[0] ?? "",
      schema: parts[1] ?? "",
      table: parts[2] ?? "",
    };
  }

  throw new Error(`Invalid Databricks table name: ${tableName}`);
}

function quoteIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(identifier)) {
    throw new Error(`Invalid Databricks identifier: ${identifier}`);
  }

  return `\`${identifier}\``;
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function stripSqlComments(sql: string): string {
  return sql.replaceAll(/--.*$/gmu, "").replaceAll(/\/\*[\s\S]*?\*\//gu, "");
}

function requiredEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}
