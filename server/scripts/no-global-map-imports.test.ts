import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, "..");
const rootDir = path.resolve(serverDir, "..");
const clientDir = path.resolve(rootDir, "client");

/** Danh sách các hằng / hàm bản đồ toàn cục cũ không được phép import trực tiếp trong mã nguồn server/client. */
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

/** Phân tích các specifier bị cấm được import hoặc re-export từ shared (kể cả namespace import và đường dẫn tương đối). */
export function findForbiddenMapImports(fileContent: string): string[] {
  const forbidden = new Set<string>();

  // 1. Khớp import { ... } và export { ... } từ "@tien-gioi/shared" hoặc đường dẫn tương đối tới shared / map
  const namedRegex =
    /(?:import|export)\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["'](?:@tien-gioi\/shared(?:\/[^"']*)?|(?:\.\.?\/)+[^"']*shared[^"']*)["']/g;
  let match: RegExpExecArray | null;

  while ((match = namedRegex.exec(fileContent)) !== null) {
    const specifiers = match[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const spec of specifiers) {
      const raw = spec.replace(/^\s*type\s+/, "").trim();
      const parts = raw.split(/\s+as\s+/);
      for (const p of parts) {
        const clean = p.trim();
        if (FORBIDDEN_MAP_SYMBOLS.has(clean)) {
          forbidden.add(clean);
        }
      }
    }
  }

  // 2. Khớp import * as Alias from ... rồi sử dụng Alias.SYMBOL
  const namespaceRegex =
    /import\s+\*\s+as\s+([A-Za-z0-9_$]+)\s+from\s+["'](?:@tien-gioi\/shared(?:\/[^"']*)?|(?:\.\.?\/)+[^"']*shared[^"']*)["']/g;

  while ((match = namespaceRegex.exec(fileContent)) !== null) {
    const alias = match[1];
    for (const sym of FORBIDDEN_MAP_SYMBOLS) {
      const usageRegex = new RegExp(`\\b${alias}\\.${sym}\\b`);
      if (usageRegex.test(fileContent)) {
        forbidden.add(sym);
      }
    }
  }

  // 3. Khớp export * from ...shared... (re-export toàn bộ module shared sẽ làm lộ hằng bản đồ)
  const exportAllRegex =
    /export\s+\*\s+from\s+["'](?:@tien-gioi\/shared(?:\/[^"']*)?|(?:\.\.?\/)+[^"']*shared[^"']*)["']/g;

  if (exportAllRegex.test(fileContent)) {
    forbidden.add("* (export * from shared)");
  }

  return Array.from(forbidden);
}

describe("chặn quay lại dùng hằng bản đồ toàn cục (#123 Bước 0d)", () => {
  it("không có module nào trong server/src, server/scripts và client/src import trực tiếp hằng bản đồ", () => {
    const serverSrcFiles = scanTsFiles(path.join(serverDir, "src"));
    const serverScriptFiles = scanTsFiles(path.join(serverDir, "scripts"));
    const clientSrcFiles = scanTsFiles(path.join(clientDir, "src"));
    const allFiles = [...serverSrcFiles, ...serverScriptFiles, ...clientSrcFiles];

    expect(allFiles.length).toBeGreaterThan(25);

    const violations: { file: string; symbols: string[] }[] = [];
    for (const file of allFiles) {
      const content = readFileSync(file, "utf8");
      const found = findForbiddenMapImports(content);
      if (found.length > 0) {
        violations.push({
          file: path.relative(rootDir, file),
          symbols: found,
        });
      }
    }

    expect(
      violations,
      violations.map((v) => `${v.file} import [${v.symbols.join(", ")}]`).join("; "),
    ).toEqual([]);
  });

  describe("test đột biến: phát hiện các cách import / export hằng bản đồ toàn cục", () => {
    it("đột biến 1: bắt named import trực tiếp từ @tien-gioi/shared", () => {
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

    it("đột biến 2: bắt namespace import 'import * as S' rồi truy cập S.TOWN_PX", () => {
      const badCode = `
        import * as S from "@tien-gioi/shared";
        const spawnX = S.TOWN_PX;
        const radius = S.PLAYER_RADIUS;
      `;
      const found = findForbiddenMapImports(badCode);
      expect(found).toContain("TOWN_PX");
      expect(found).not.toContain("PLAYER_RADIUS");
    });

    it("đột biến 3: bắt re-export 'export { WORLD_W } from ...'", () => {
      const badCode = `
        export { WORLD_W, statsFor } from "@tien-gioi/shared";
      `;
      const found = findForbiddenMapImports(badCode);
      expect(found).toContain("WORLD_W");
      expect(found).not.toContain("statsFor");
    });

    it("đột biến 4: bắt import qua đường dẫn tương đối tới shared/src/map", () => {
      const badCode = `
        import { inTown, circleBlocked } from "../../../shared/src/map";
        import { DEFAULT_MAP } from "../../shared/src";
      `;
      const found = findForbiddenMapImports(badCode);
      expect(found).toContain("inTown");
      expect(found).toContain("circleBlocked");
      expect(found).not.toContain("DEFAULT_MAP");
    });

    it("đột biến 5: bắt export * from module shared", () => {
      const badCode = `
        export * from "@tien-gioi/shared";
      `;
      const found = findForbiddenMapImports(badCode);
      expect(found).toContain("* (export * from shared)");
    });
  });
});
