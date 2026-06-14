import { describe, expect, it } from "vitest";

import { InMemoryRagConnector, tokenize } from "./index";

describe("rag scaffold", () => {
  it("tokenizes search text", () => {
    expect(tokenize("Weekly revenue_by Segment?")).toEqual(["weekly", "revenue_by", "segment"]);
  });

  it("retrieves matching knowledge documents", async () => {
    const rag = new InMemoryRagConnector([
      {
        id: "metric-weekly-revenue",
        title: "Weekly Revenue",
        sourcePath: "knowledge/metrics/weekly-revenue.md",
        content: "Revenue grouped by week and customer segment.",
        tags: ["metric", "revenue"],
      },
    ]);

    await expect(rag.search("revenue by segment")).resolves.toMatchObject([
      {
        documentId: "metric-weekly-revenue",
        score: 3,
      },
    ]);
  });
});
