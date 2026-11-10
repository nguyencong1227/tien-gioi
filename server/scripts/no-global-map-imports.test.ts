import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, "..");

/** Danh sách các hằng / hàm bản đồ toàn cục cũ không được phép import trực tiếp trong mã nguồn server. */
const FORBIDDEN_MAP_SYMBOLS = new Set([
  "TOWN",
  "TOWN_PX",
  "WORLD_W",
  "WORLD_H",
  "MAP_W",
  "MAP_H",
  "MAP_TILES",
  "MAP_SEED",
  "tileAt",
  "isBlockedPx",
  "circleBlocked",
  "moveWithCollision",
  "inTown",
  "dangerAt",
]);

function scanTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const st = statSync(fullPath);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      results.push(...scanTsFiles(fullPath));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts") && !entry.endsWith(".d.ts")) {
      results.push(fullPath);
    }
  }
  return results;
}

/** Phân tích các specifier được import từ '@tien-gioi/shared' trong file. */
export function findForbiddenMapImports(fileContent: string): string[] {
  const forbidden: string[] = [];
  // Regex khớp các câu lệnh import { ... } from "@tien-gioi/shared" (hỗ trợ nhiều dòng)
  const importRegex = /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["']@tien-gioi\/shared["']/g;
  let match: RegExpExecArray | null;

  while ((match = importRegex.exec(fileContent)) !== null) {
    const specifiers = match[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const spec of specifiers) {
      // Xử lý import có alias dạng: `foo as bar` hoặc `type foo`
      const cleanSpec = spec
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)[0]
        .trim();
      if (FORBIDDEN_MAP_SYMBOLS.has(cleanSpec)) {
        forbidden.push(cleanSpec);
      }
    }
  }

  return forbidden;
}

describe("chặn quay lại dùng hằng bản đồ toàn cục (#123 Bước 0d)", () => {
  it("không có module nào trong server/src và server/scripts import trực tiếp hằng bản đồ", () => {
    const srcFiles = scanTsFiles(path.join(serverDir, "src"));
    const scriptFiles = scanTsFiles(path.join(serverDir, "scripts"));
    const allFiles = [...srcFiles, ...scriptFiles];

    expect(allFiles.length).toBeGreaterThan(10);

    const violations: { file: string; symbols: string[] }[] = [];
    for (const file of allFiles) {
      const content = readFileSync(file, "utf8");
      const found = findForbiddenMapImports(content);
      if (found.length > 0) {
        violations.push({
          file: path.relative(serverDir, file),
          symbols: found,
        });
      }
    }

    expect(
      violations,
      violations.map((v) => `${v.file} import [${v.symbols.join(", ")}]`).join("; "),
    ).toEqual([]);
  });

  it("đột biến: hàm phát hiện bắt được câu lệnh import hằng bản đồ toàn cục", () => {
    const badCode = `
      import { PLAYER_RADIUS, TOWN_PX, WORLD_W, statsFor } from "@tien-gioi/shared";
      import { moveWithCollision as move } from "@tien-gioi/shared";
      import type { InputMsg } from "@tien-gioi/shared";
    `;
    const found = findForbiddenMapImports(badCode);
    expect(found).toContain("TOWN_PX");
    expect(found).toContain("WORLD_W");
    expect(found).toContain("moveWithCollision");
    expect(found).not.toContain("PLAYER_RADIUS");
    expect(found).not.toContain("statsFor");
  });
});
