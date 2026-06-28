#!/usr/bin/env node
/**
 * npm version の lifecycle 用: APP_CHANGELOG 先頭に新バージョンの枠を追加する。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const changelogPath = join(__dirname, "../lib/changelog.ts");

export function insertChangelogEntry(content, version, date) {
  if (content.includes(`version: "${version}"`)) {
    return { content, inserted: false };
  }

  const marker = "export const APP_CHANGELOG: ChangelogEntry[] = [";
  const index = content.indexOf(marker);
  if (index === -1) {
    throw new Error("APP_CHANGELOG marker not found in changelog.ts");
  }

  const insertAt = index + marker.length;
  const entry = `
  {
    version: "${version}",
    date: "${date}",
    changes: [
      "（変更内容を追記してください）",
    ],
  },`;

  return {
    content: `${content.slice(0, insertAt)}${entry}${content.slice(insertAt)}`,
    inserted: true,
  };
}

function todayJst() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(
    new Date()
  );
}

function main() {
  const version = process.env.npm_package_version;
  if (!version) {
    throw new Error("npm_package_version is not set (run via npm version)");
  }

  const original = readFileSync(changelogPath, "utf8");
  const { content, inserted } = insertChangelogEntry(
    original,
    version,
    todayJst()
  );

  if (!inserted) {
    console.log(`changelog.ts already has version ${version}; skipping.`);
    return;
  }

  writeFileSync(changelogPath, content, "utf8");
  console.log(`Added changelog stub for v${version}`);
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  main();
}
