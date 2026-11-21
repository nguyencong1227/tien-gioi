// `map:bake` BỎ QUA bản đồ sửa tay (S6): chạy công cụ THẬT (`tsx scripts/map-bake.ts`) trên thư mục tạm chứa bản sao tệp bản đồ.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PROCEDURAL_MAPS } from "@tien-gioi/shared";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const realDir = path.resolve(serverDir, "../shared/maps");
let tmp = "";

beforeAll(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "tien-gioi-bake-"));
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

/** Chép bốn bản chạy logic thật vào `tmp`, rồi chạy `map:bake` với `args`. */
function run(args: string[], edit?: (id: string, text: string) => string) {
  for (const { id } of PROCEDURAL_MAPS) {
    const text = readFileSync(path.join(realDir, `${id}.logic.json`), "utf8");
    writeFileSync(path.join(tmp, `${id}.logic.json`), edit ? edit(id, text) : text);
  }
  const r = spawnSync(
    path.resolve(serverDir, "../node_modules/.bin/tsx"),
    ["scripts/map-bake.ts", ...args],
    { cwd: serverDir, env: { ...process.env, MAP_BAKE_DIR: tmp }, encoding: "utf8" },
  );
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

/** Thêm cờ `handEdited` vào tệp JSON của một bản đồ (chuỗi), hoặc đổi một ô để tệp lệch bản sinh. */
const flag = (text: string) => {
  const j = JSON.parse(text) as { properties: { name: string; type?: string; value: unknown }[] };
  j.properties.push({ name: "handEdited", type: "bool", value: true });
  return JSON.stringify(j, null, 1) + "\n";
};

describe("map:bake với bản đồ sửa tay", () => {
  it("tệp khớp bản sinh: --check xanh (đối chứng cho các ca dưới)", () => {
    const r = run(["--check"]);
    expect(r.out).not.toMatch(/✗/);
    expect(r.code).toBe(0);
  });

  it("tệp LỆCH bản sinh mà KHÔNG có cờ: --check đỏ (thoát 1, nêu đường dẫn)", () => {
    const r = run(["--check"], (id, t) => (id === "lac_ha" ? t.replace('"seed"', '"seed "') : t));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/✗ .*lac_ha\.logic\.json/);
  });

  it("tệp LỆCH bản sinh nhưng CÓ cờ handEdited: --check xanh và nói 'bỏ qua'; bản đồ không cờ vẫn được kiểm", () => {
    const r = run(["--check"], (id, t) =>
      id === "lac_ha" ? flag(t.replace('"seed"', '"seed "')) : t,
    );
    expect(r.out).toMatch(/lac_ha\.logic\.json: bản đồ SỬA TAY \(handEdited\), bỏ qua/);
    expect(r.out).toMatch(/✓ .*hac_phong\.logic\.json/);
    expect(r.code).toBe(0);
  });

  it("KHÔNG --check: bản đồ có cờ KHÔNG bị ghi đè (nội dung giữ nguyên), bản đồ không cờ được ghi lại", () => {
    const marked = (() => {
      const real = readFileSync(path.join(realDir, "lac_ha.logic.json"), "utf8");
      return flag(real);
    })();
    const r = run([], (id, t) => (id === "lac_ha" ? marked : id === "han_van" ? "{}" : t));
    expect(r.code).toBe(0);
    expect(readFileSync(path.join(tmp, "lac_ha.logic.json"), "utf8")).toBe(marked);
    // han_van có tệp hỏng "{}" nhưng KHÔNG có cờ: được ghi lại đúng bản sinh
    expect(readFileSync(path.join(tmp, "han_van.logic.json"), "utf8")).toBe(
      readFileSync(path.join(realDir, "han_van.logic.json"), "utf8"),
    );
  });
});
