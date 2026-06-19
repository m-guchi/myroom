import { describe, expect, it } from "vitest";
import { insertChangelogEntry } from "./version-changelog.mjs";

const sample = `export const APP_CHANGELOG: ChangelogEntry[] = [
  {
    version: "2.2.0",
    date: "2026-06-07",
    changes: ["existing"],
  },
];
`;

describe("insertChangelogEntry", () => {
  it("inserts a new entry at the top of APP_CHANGELOG", () => {
    const { content, inserted } = insertChangelogEntry(
      sample,
      "2.3.0",
      "2026-06-19"
    );
    expect(inserted).toBe(true);
    expect(content.indexOf('version: "2.3.0"')).toBeLessThan(
      content.indexOf('version: "2.2.0"')
    );
    expect(content).toContain('date: "2026-06-19"');
  });

  it("does not duplicate an existing version", () => {
    const { inserted } = insertChangelogEntry(sample, "2.2.0", "2026-06-19");
    expect(inserted).toBe(false);
  });
});
