import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scene = fs.readFileSync(path.join(root, "client/src/scenes/WorldScene.ts"), "utf8");

/** Canh nối mã của vật thể bền (`zone` / `trap` / `totem` / `aura` + `fxEnd`, CT11b bước 3b): `persist-fx.ts` thuần đã có test; chỗ nối vào `WorldScene` chỉ kiểm được bằng cách đọc nguồn (và `check-persist-fx.mjs`). */
describe("canh nối mã: vật thể bền ở WorldScene.ts", () => {
  const body = (from: string, to: string) => {
    const i = scene.indexOf(from);
    const j = scene.indexOf(to, i + 1);
    return i >= 0 && j > i ? scene.slice(i, j) : "";
  };
  const persist = body('case "zone":', 'case "fxEnd"');
  const end = body('case "fxEnd"', 'case "warn"');

  it("bốn hình dùng chung một case: kiểm tin, tra chiêu, bỏ tin hỏng / chiêu lạ / ngoài tầm nhìn", () => {
    expect(persist, "thiếu case zone").not.toBe("");
    for (const k of ['case "trap":', 'case "totem":', 'case "aura":']) expect(persist).toContain(k);
    expect(persist).toContain("skillOf(m.skill)");
    expect(persist).toContain("parsePersist(m)");
    expect(persist).toContain("if (!def || !p) return;");
    expect(persist).toContain("this.inView(");
    expect(persist).toContain("persistPlan(p, def, p.by === this.sid)");
    expect(persist).toContain("this.persists.add(");
  });

  it("hào quang bám người dùng: kiểm tầm nhìn theo CHỖ NGƯỜI DÙNG đứng (không phải chỗ lúc dựng)", () => {
    expect(persist).toContain('p.kind === "aura" ? (this.persistAnchor(p.by, false) ?? p) : p');
  });

  it("fxEnd: kiểm tin, gỡ đúng id; CHỈ bẫy nổ (pop) mới phát bụi, `gone` thì không", () => {
    expect(end, "thiếu case fxEnd").not.toBe("");
    expect(end).toContain("parsePersistEnd(m)");
    expect(end).toContain("this.persists.endOne(e.id, e.why, this.time.now)");
    expect(end).toMatch(/ended && e\.why === "pop"/);
    expect(end).toContain("planPersistPop(ended.plan, ended.x, ended.y)");
  });

  it("vị trí người dùng hào quang: của mình lấy vị trí đoán trước; chết / mất khỏi state báo lại", () => {
    const i = scene.indexOf("private persistAnchor(");
    expect(i).toBeGreaterThan(0);
    const fn = scene.slice(i, i + 600);
    expect(fn).toContain("if (!e || !p) return null;");
    expect(fn).toContain("this.predX");
    expect(fn).toContain("dead: p.dead");
  });

  it("lớp được cập nhật mỗi khung, dọn khi đổi bản đồ / nối lại, giải phóng khi đóng cảnh, và dùng hồ sơ chất lượng", () => {
    expect(scene).toMatch(/this\.windups\.update\(now\);\s*this\.persists\.update\(now\);/);
    expect(scene).toMatch(/this\.windups\.clear\(\);\s*this\.persists\.clear\(\);/);
    expect(scene).toMatch(/this\.windups\.destroy\(\);\s*this\.persists\.destroy\(\);/);
    const i = scene.indexOf("this.persists = new PersistLayer(");
    const ctor = scene.slice(i, i + 400);
    expect(ctor).toContain("getQuality().emitterBudget");
    expect(ctor).toContain("getQuality().reducedMotion");
    expect(ctor).toContain("anchor:");
  });
});
