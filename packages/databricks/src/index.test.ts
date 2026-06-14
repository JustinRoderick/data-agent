import { describe, expect, it } from "vitest";

import {
  MockDatabricksConnector,
  assertReadOnlySql,
  createDatabricksConnectorFromEnv,
  qualifyTableName,
} from "./index";

describe("databricks scaffold", () => {
  it("allows read-only queries", () => {
    expect(() => assertReadOnlySql("select * from fact_revenue")).not.toThrow();
  });

  it("blocks destructive queries", () => {
    expect(() => assertReadOnlySql("delete from fact_revenue")).toThrow(
      "Only SELECT or WITH queries are allowed.",
    );
  });

  it("blocks multiple statements", () => {
    expect(() => assertReadOnlySql("select 1; select 2")).toThrow(
      "Multiple SQL statements are not allowed.",
    );
  });

  it("returns mock query results", async () => {
    const connector = new MockDatabricksConnector([], [{ revenue: 1200 }]);

    await expect(connector.runReadOnlyQuery("select 1")).resolves.toMatchObject({
      rowCount: 1,
      queryId: "mock-query",
    });
  });

  it("qualifies unqualified table names with the configured catalog and schema", () => {
    expect(
      qualifyTableName("gcp_billing_usage", {
        catalog: "main",
        schema: "bi_demo",
      }),
    ).toBe("`main`.`bi_demo`.`gcp_billing_usage`");
  });

  it("requires Databricks connection environment variables", () => {
    expect(() => createDatabricksConnectorFromEnv({})).toThrow(
      "Missing required environment variable: DATABRICKS_SERVER_HOSTNAME",
    );
  });
});
