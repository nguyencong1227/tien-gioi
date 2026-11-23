import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CHECKS, EXCLUDED_VIOLATION_FUNCS, runChecks } from "./check-content";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHARED_SRC = path.resolve(HERE, "../../shared/src");
const VIOLATION_RE = /export function (\w+Violations)\s*\(/g;

/** Mọi tên hàm `*Violations` được export ở `shared/src/*.ts` (KHÔNG tính `*.test.ts`). */
function listSharedViolationFuncs(): string[] {
  const names: string[] = [];
  for (const entry of readdirSync(SHARED_SRC)) {
    if (!entry.endsWith(".ts") || entry.endsWith(".test.ts")) continue;
    const text = readFileSync(path.join(SHARED_SRC, entry), "utf-8");
    for (const m of text.matchAll(VIOLATION_RE)) names.push(m[1]);
  }
  return names;
}

describe("check:content — chống mục nát danh sách", () => {
  it("mọi hàm *Violations ở shared/src phải ở CHECKS hoặc EXCLUDED_VIOLATION_FUNCS", () => {
    const funcs = listSharedViolationFuncs();
    // Có dữ liệu để kiểm (nếu rỗng thì quy ước chống mục nát vô nghĩa).
    expect(funcs.length).toBeGreaterThan(0);
    const accounted = new Set([
      ...CHECKS.map((c) => c.func),
      ...EXCLUDED_VIOLATION_FUNCS.map((e) => e.func),
    ]);
    const missing = funcs.filter((f) => !accounted.has(f));
    expect(
      missing,
      `hàm *Violations KHÔNG được check:content ghi nhận: ${missing.join(", ")}`,
    ).toEqual([]);
  });
});

describe("runChecks — mã thoát + dòng báo", () => {
  it("dữ liệu thật sạch → code 0, có dòng ✓", () => {
    const r = runChecks();
    expect(r.code).toBe(0);
    expect(r.lines.some((l) => l.includes("✓"))).toBe(true);
  });

  it("một nhóm có lỗi → code 1, dòng báo đúng nhóm + tệp + id", () => {
    const r = runChecks([
      {
        func: "maViolations",
        name: "quái ma (MONSTERS)",
        file: "shared/src/monsters.ts",
        run: () => ["quái ma zzz_khong_co: sát thương âm"],
      },
    ]);
    expect(r.code).toBe(1);
    const out = r.lines.join("\n");
    expect(out).toContain("quái ma (MONSTERS)");
    expect(out).toContain("shared/src/monsters.ts");
    expect(out).toContain("zzz_khong_co");
  });

  it("hàm kiểm BỊ NÉM → bắt gọn, báo 'BỊ NÉM' + tin nhắn, code 1", () => {
    const r = runChecks([
      {
        func: "nopeViolations",
        name: "nhóm nổ (BOOM)",
        file: "shared/src/boom.ts",
        run: () => {
          throw new Error("dữ liệu sai kiểu nghiêm trọng");
        },
      },
    ]);
    expect(r.code).toBe(1);
    const out = r.lines.join("\n");
    expect(out).toContain("BỊ NÉM");
    expect(out).toContain("dữ liệu sai kiểu nghiêm trọng");
  });
});

// B nit (1): đường CLI (guard process.exit) KHÔNG có test — nếu guard hỏng (vd `if (false)`) thì script im
// lặng thoát 0 KHÔNG chạy main, các test nội tiếp (runChecks) vẫn xanh. Spawn tiến trình thật bắt lỗi này.
describe("check:content — CLI thật (guard process.exit)", () => {
  it("chạy tsx scripts/check-content.ts: status 0 + stdout có '✓ check:content'", () => {
    const tsx = path.resolve(HERE, "../../node_modules/.bin/tsx");
    const script = path.resolve(HERE, "check-content.ts");
    const r = spawnSync(tsx, [script], { cwd: path.resolve(HERE, ".."), encoding: "utf-8" });
    expect(
      r.status,
      `script CLI thoát mã khác 0 (guard có thể hỏng).\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
    ).toBe(0);
    expect(r.stdout).toContain("✓ check:content");
  });
});
