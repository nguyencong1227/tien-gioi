// CT15 đợt 3 (#1185, Dev D; test của B): hành vi THẬT của cặp Lôi DẤU -> KÍCH mới (`loi_am_an` gắn `mark_loi`, `tu_dien_thoa` là bolt kích dấu). `skill-kit.test.ts` chỉ kiểm "dùng được";
// `e2e:chieu-dau` (Chrome thật) giả định dấu 6 s nên không vừa dấu 3 s của `loi_am_an`, nên cặp mới được kiểm ở đây bằng `cast` + `tickPBolts` thật trên dữ liệu thật `SKILL_BY_ID`.
import { afterEach, describe, expect, it, vi } from "vitest";
import { SKILL_BY_ID } from "@tien-gioi/shared";
import type { PlayerCtrl } from "../world";
import { cast } from "./cast";
import { tickPBolts } from "./pbolt";
import { applyMonsterStatus, monsterHasStatus } from "./status";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";

afterEach(() => vi.restoreAllMocks());

/** Người dùng Kim Đan (đủ `reqRealm` 3 của `tu_dien_thoa`) đứng ở (1000, 1000), quay sang phải. */
function setup() {
  const t = makeWorld();
  const a = addPlayer(t.w, "a", 3, 2);
  a.p.x = 1000;
  a.p.y = 1000;
  a.p.mp = a.p.maxMp;
  vi.spyOn(Math, "random").mockReturnValue(0.5); // không bạo kích; xác suất 65 % của dấu trúng
  return { ...t, ...a };
}
function equip(c: PlayerCtrl, ...ids: string[]) {
  ids.forEach((id, i) => {
    c.skills.learned[id] = 1;
    c.skills.slots[i] = id;
  });
}
function mon(t: { w: ReturnType<typeof makeWorld>["w"] }, x: number, y: number) {
  const r = addMonster(t.w, "tho", x, y);
  r.m.hp = r.m.maxHp = 1e12; // không chết giữa phép đo
  r.mc.def = { ...r.mc.def, aggro: 0, attackCd: 1e9 };
  return r;
}
const fire = (t: ReturnType<typeof setup>, slot: number) =>
  cast(t.w, "a", { slot: slot + 2, angle: 0 });
const dmgTo = (t: ReturnType<typeof setup>, id: string) => t.dmgs.filter((d) => d.target === id);
/** Trôi đồng hồ phòng `ms` theo bước tick thật 50 ms, chạy đạn mỗi bước (nhảy một lần quá lớn làm dấu 3 s hết hạn TRƯỚC khi đạn trúng, khác với phòng thật). */
const advance = (t: ReturnType<typeof setup>, ms: number) => {
  for (let left = ms; left > 0; left -= 50) {
    t.w.now += Math.min(50, left);
    tickPBolts(t.w);
  }
};

describe("CT15 đợt 3: cặp Lôi mới, Lôi Âm gắn dấu rồi Tử Điện Xuyên Vân kích dấu", () => {
  it("Lôi Âm: quái trong vùng mang `mark_loi` 3000 ms (và `Monster.mark` khác 0); quái ngoài vùng thì không", () => {
    const t = setup();
    equip(t.c, "loi_am_an");
    const d = SKILL_BY_ID["loi_am_an"]!;
    const inside = mon(t, 1000 + d.reach!, 1000);
    const outside = mon(t, 1000 + d.reach! + d.range + 120, 1000);
    fire(t, 0);
    expect(monsterHasStatus(t.w, inside.id, "mark_loi")).toBe(true);
    expect(inside.m.mark).not.toBe(0);
    expect(monsterHasStatus(t.w, outside.id, "mark_loi")).toBe(false);
    // hết 3000 ms thì dấu tắt (cửa sổ kích của người chơi là 3 giây)
    t.w.now += 3001;
    expect(monsterHasStatus(t.w, inside.id, "mark_loi")).toBe(false);
  });

  it("chuỗi thật: Lôi Âm gắn dấu rồi Tử Điện Xuyên Vân (bấm trong cửa sổ 3 s) trúng quái mang dấu: có cờ `combo`, dấu bị gỡ (consume)", () => {
    const t = setup();
    equip(t.c, "loi_am_an", "tu_dien_thoa");
    const d = SKILL_BY_ID["loi_am_an"]!;
    const marked = mon(t, 1000 + d.reach!, 1000); // đứng giữa vùng sét và trên đường bay của bolt
    fire(t, 0);
    expect(monsterHasStatus(t.w, marked.id, "mark_loi")).toBe(true);
    t.dmgs.length = 0;
    t.w.now += 500; // người chơi bấm kích sau nửa giây, trong cửa sổ 3 s của dấu
    fire(t, 1);
    advance(t, 1000);
    const dm = dmgTo(t, marked.id);
    expect(dm.length, "quái mang dấu bị trúng đúng một lần").toBe(1);
    expect(dm[0]!.combo).toBe(true);
    expect(monsterHasStatus(t.w, marked.id, "mark_loi")).toBe(false); // consume
    expect(marked.m.mark).toBe(0);
  });

  it("dấu hết hạn (quá 3 s) thì Tử Điện Xuyên Vân KHÔNG ăn combo", () => {
    const t = setup();
    equip(t.c, "loi_am_an", "tu_dien_thoa");
    const d = SKILL_BY_ID["loi_am_an"]!;
    const marked = mon(t, 1000 + d.reach!, 1000);
    fire(t, 0);
    expect(monsterHasStatus(t.w, marked.id, "mark_loi")).toBe(true);
    t.dmgs.length = 0;
    t.w.now += 3100;
    fire(t, 1);
    advance(t, 1000);
    expect(dmgTo(t, marked.id)[0]).not.toHaveProperty("combo");
  });

  it("đối chứng: cùng một bolt vào quái KHÔNG dấu thì không có cờ `combo` và sát thương nhỏ hơn đúng ~combo.mult lần", () => {
    const run = (withMark: boolean) => {
      const t = setup();
      equip(t.c, "tu_dien_thoa");
      const m = mon(t, 1100, 1000);
      if (withMark)
        applyMonsterStatus(t.w, m.id, { status: "mark_loi", ms: 3000, ratio: 0, chance: 1 }, 0, "");
      fire(t, 0);
      advance(t, 1000);
      return dmgTo(t, m.id)[0]!;
    };
    const dm = run(true);
    const dp = run(false);
    expect(dm.combo).toBe(true);
    expect(dp).not.toHaveProperty("combo");
    expect(dm.amount / dp.amount).toBeCloseTo(SKILL_BY_ID["tu_dien_thoa"]!.combo!.mult!, 1);
  });

  it("dấu hệ KHÁC không kích Tử Điện Xuyên Vân (mark_hoa không ăn combo Lôi)", () => {
    const t = setup();
    equip(t.c, "tu_dien_thoa");
    const m = mon(t, 1100, 1000);
    applyMonsterStatus(t.w, m.id, { status: "mark_hoa", ms: 3000, ratio: 0, chance: 1 }, 0, "");
    fire(t, 0);
    advance(t, 1000);
    expect(dmgTo(t, m.id)[0]).not.toHaveProperty("combo");
  });
});
