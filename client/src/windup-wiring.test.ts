import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scene = fs.readFileSync(path.join(root, "client/src/scenes/WorldScene.ts"), "utf8");

/** Canh nối mã của chiêu vận (`windupMs`, CT11b bước 3): `windup-fx.ts` thuần đã có test; những chỗ nối vào `WorldScene` chỉ kiểm được bằng cách đọc nguồn (và `check-windup-fx.mjs`). */
describe("canh nối mã: chiêu vận ở WorldScene.ts", () => {
  /** Thân `case "cast"` của `onFx` (tới `case "chain"` kế tiếp). */
  const body = (() => {
    const i = scene.indexOf('case "cast"');
    const j = scene.indexOf('case "chain"', i);
    return i >= 0 && j > i ? scene.slice(i, j) : "";
  })();

  it("`fx cast`: chiêu vận thì BẮT ĐẦU vòng tụ khí và THOÁT (không vẽ hiệu ứng đáp ngay); chiêu tức thời vẽ ngay như cũ", () => {
    expect(body, "thiếu case cast").not.toBe("");
    expect(body).toContain("planWindup(m, def, m.by === this.sid)");
    const begin = body.indexOf("this.windups.begin(wind, this.time.now)");
    const ret = body.indexOf("return;", begin);
    const vis = body.indexOf("this.castVisuals(def, m.by, m.x, m.y, m.angle, m.range)");
    expect(begin).toBeGreaterThan(0);
    expect(ret, "chiêu vận phải return trước castVisuals").toBeGreaterThan(begin);
    expect(vis, "chiêu tức thời phải gọi castVisuals").toBeGreaterThan(ret);
  });

  it("đáp: vẽ ở vị trí HIỆN TẠI của người vận (x, y do lớp truyền) với hướng + tầm lúc bắt đầu, không phải chỗ bắt đầu", () => {
    const i = scene.indexOf("private onWindupRelease(");
    expect(i).toBeGreaterThan(0);
    const fn = scene.slice(i, i + 400);
    expect(fn).toContain("this.castVisuals(def, plan.by, x, y, plan.angle, plan.range)");
    expect(fn).not.toContain("plan.x");
  });

  it("tô số sát thương của mình + hoạt ảnh chém nằm trong castVisuals (lúc ĐÁP với chiêu vận, không lúc bắt đầu)", () => {
    const i = scene.indexOf("private castVisuals(");
    const fn = scene.slice(i, i + 1500);
    expect(fn).toContain("this.lastAttack = { at: this.time.now, range }");
    expect(fn).toContain("slashUntil");
    expect(fn).toContain("sound.cast(");
    expect(fn).toContain("planCastFx(");
  });

  it("theo dõi người vận: chết / mất khỏi state huỷ; choáng CHỈ tính cho chính mình (trạng thái choáng chỉ gửi cho chủ)", () => {
    const i = scene.indexOf("private windupWatch(");
    const fn = scene.slice(i, i + 700);
    expect(fn).toContain("if (!e || !p) return null;");
    expect(fn).toContain("dead: p.dead");
    expect(fn).toContain("stunned: mine && this.status.stunned(performance.now())");
  });

  it("lớp vòng được cập nhật mỗi khung, dọn khi đổi bản đồ / nối lại, giải phóng khi đóng cảnh, và dùng hồ sơ chất lượng", () => {
    expect(scene).toMatch(/this\.pbolts\.update\(now\);\s*this\.windups\.update\(now\);/);
    expect(scene).toMatch(/this\.pbolts\.clear\(\);\s*this\.windups\.clear\(\);/);
    expect(scene).toMatch(/this\.pbolts\.destroy\(\);\s*this\.windups\.destroy\(\);/);
    const i = scene.indexOf("this.windups = new WindupLayer(");
    const ctor = scene.slice(i, i + 500);
    expect(ctor).toContain("getQuality().emitterBudget");
    expect(ctor).toContain("getQuality().reducedMotion");
    expect(ctor).toContain("onRelease:");
  });
});
