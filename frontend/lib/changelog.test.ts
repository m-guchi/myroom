import { describe, expect, it } from "vitest";
import { formatChangelogDate } from "./changelog";

describe("formatChangelogDate", () => {
  it("formats YYYY-MM-DD as Japanese date", () => {
    expect(formatChangelogDate("2026-06-04")).toBe("2026年6月4日");
  });

  it("formats YYYY-MM without day", () => {
    expect(formatChangelogDate("2026-05")).toBe("2026年5月");
  });

  it("strips leading zeros in month and day", () => {
    expect(formatChangelogDate("2026-01-09")).toBe("2026年1月9日");
  });

  it("returns unknown strings unchanged", () => {
    expect(formatChangelogDate("2026年5月")).toBe("2026年5月");
  });
});
