import { describe, expect, it } from "vitest";

import { MockDatabricksConnector, assertReadOnlySql } from "./index";

describe("databricks scaffold", () => {
  it("allows read-only queries", () => {
    expect(() => assertReadOnlySql("select * from fact_revenue")).not.toThrow();
  });

  it("blocks destructive queries", () => {
    expect(() => assertReadOnlySql("delete from fact_revenue")).toThrow(
      "Only SELECT or WITH queries are allowed.",
    );
  });

  it("returns mock query results", async () => {
    const connector = new MockDatabricksConnector([], [{ revenue: 1200 }]);

    await expect(connector.runReadOnlyQuery("select 1")).resolves.toMatchObject({
      rowCount: 1,
      queryId: "mock-query",
    });
  });
});
