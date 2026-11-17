import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scene = fs.readFileSync(path.join(root, "client/src/scenes/WorldScene.ts"), "utf8");

/** Canh nối mã của đạn người chơi (`fx` `pbolt`, CT11b bước 2): `pbolt-fx.ts` thuần đã có test; những chỗ nối vào `WorldScene` chỉ kiểm được bằng cách đọc nguồn (và `check-pbolt-fx.mjs`). */
describe("canh nối mã: đạn của người chơi ở WorldScene.ts", () => {
  /** Thân `case "pbolt"` của `onFx` (tới `case "warn"` kế tiếp). */
  const body = (() => {
    const i = scene.indexOf('case "pbolt"');
    const j = scene.indexOf('case "warn"', i);
    return i >= 0 && j > i ? scene.slice(i, j) : "";
  })();

  it("`onFx` có nhánh `pbolt`: kiểm tin (parsePBolt), chiêu lạ bỏ, lọc tầm nhìn theo CẢ HAI đầu, rồi vẽ + bụi cuối đoạn", () => {
    expect(body, "thiếu case pbolt").not.toBe("");
    expect(body).toContain("parsePBolt(m)");
    expect(body).toContain("skillOf(m.skill)");
    expect(body).toMatch(/if \(!def \|\| !p\) return;/);
    // đạn bay ngang màn hình (đầu ngoài, cuối trong) vẫn phải vẽ: lọc bằng "đầu NGOÀI VÀ cuối NGOÀI"
    expect(body).toMatch(
      /!this\.inView\(p\.x, p\.y, \d+\) && !this\.inView\(end\.x, end\.y, \d+\)/,
    );
    expect(body).toContain("this.pbolts.add(plan, this.time.now)");
    expect(body).toContain("planPBoltEnd(plan)");
    expect(body).toContain("p.by === this.sid");
  });

  it("lớp đạn được cập nhật mỗi khung, dọn khi đổi bản đồ / nối lại, và giải phóng khi đóng cảnh", () => {
    expect(scene).toMatch(/this\.telegraphs\.update\(now\);\s*this\.pbolts\.update\(now\);/);
    expect(scene).toMatch(/this\.telegraphs\.clear\(\);\s*this\.pbolts\.clear\(\);/);
    expect(scene).toMatch(/this\.telegraphs\.destroy\(\);\s*this\.pbolts\.destroy\(\);/);
  });

  it("lớp đạn dùng ngân sách emitter và giảm chuyển động của hồ sơ chất lượng", () => {
    const i = scene.indexOf("this.pbolts = new PBoltLayer(");
    expect(i).toBeGreaterThan(0);
    const ctor = scene.slice(i, i + 400);
    expect(ctor).toContain("getQuality().emitterBudget");
    expect(ctor).toContain("getQuality().reducedMotion");
  });
});
