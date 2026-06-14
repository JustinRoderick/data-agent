import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("joins class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("merges conflicting tailwind utilities", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
