// CT8 lát 2 (#1053): hành vi THẬT của các chiêu Nguyên Anh dùng cơ chế mục 51 mà `skill-kit.test.ts` (chỉ kiểm "dùng được") chưa soi kỹ: cặp Lôi DẤU -> KÍCH (`mark_loi` + `combo`)
// và chiêu `ally` Bách Thú Khiếu Phong chia tăng tốc / hồi phục cho đồng đội CÙNG ĐỘI. Dùng dữ liệu thật `SKILL_BY_ID` (không dựng chiêu giả); World giả, `Math.random` ghim cho sát thương tất định.
import { afterEach, describe, expect, it, vi } from "vitest";
import { SKILL_BY_ID } from "@tien-gioi/shared";
import type { PlayerCtrl } from "../world";
import { cast } from "./cast";
import { applyMonsterStatus, monsterHasStatus, takeMonsterStatus } from "./status";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";

afterEach(() => vi.restoreAllMocks());

/** Người dùng Nguyên Anh Hậu kỳ (đủ `reqTier` của cả ba chiêu) đứng ở (1000, 1000), quay sang phải. */
function setup() {
  const t = makeWorld();
  const a = addPlayer(t.w, "a", 4, 2);
  a.p.x = 1000;
  a.p.y = 1000;
  a.p.mp = a.p.maxMp;
  vi.spyOn(Math, "random").mockReturnValue(0.5); // không bạo kích; xác suất 80 % của dấu trúng
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

describe("CT8 lát 2: cặp Lôi, Thiên La Lôi Cấm gắn dấu rồi Chưởng Tâm Lôi Bạo kích dấu", () => {
  it("Thiên La Lôi Cấm: MỌI quái trong vùng mang `mark_loi` (và `Monster.mark` khác 0); quái ngoài vùng thì không", () => {
    const t = setup();
    equip(t.c, "thien_la_loi_cam");
    const d = SKILL_BY_ID["thien_la_loi_cam"]!;
    const inA = mon(t, 1000 + d.reach!, 1000);
    const inB = mon(t, 1000 + d.reach! + d.range - 20, 1000); // sát mép vùng
    const out = mon(t, 1000 + d.reach! + d.range + 120, 1000);
    fire(t, 0);
    for (const m of [inA, inB]) {
      expect(monsterHasStatus(t.w, m.id, "mark_loi"), "trong vùng").toBe(true);
      expect(m.m.mark, "dấu lên đầu quái").not.toBe(0);
    }
    expect(monsterHasStatus(t.w, out.id, "mark_loi"), "ngoài vùng").toBe(false);
    expect(out.m.mark).toBe(0);
  });

  it("chuỗi thật: Thiên La Lôi Cấm rồi Chưởng Tâm Lôi Bạo: quái mang dấu ăn gấp `combo.mult` lần quái đã gỡ dấu (cùng chỗ đứng), có cờ `combo`, dấu bị gỡ", () => {
    const t = setup();
    equip(t.c, "thien_la_loi_cam", "chuong_tam_loi_bao");
    const marked = mon(t, 1060, 985);
    const plain = mon(t, 1060, 1015);
    fire(t, 0); // phủ dấu lên cả hai (đứng trong vùng sét)
    expect(monsterHasStatus(t.w, marked.id, "mark_loi")).toBe(true);
    expect(monsterHasStatus(t.w, plain.id, "mark_loi")).toBe(true);
    takeMonsterStatus(t.w, plain.id, "mark_loi"); // đối chứng: quái này KHÔNG còn dấu
    t.dmgs.length = 0;
    fire(t, 1);
    const dm = dmgTo(t, marked.id)[0]!;
    const dp = dmgTo(t, plain.id)[0]!;
    expect(dm.amount / dp.amount).toBeCloseTo(SKILL_BY_ID["chuong_tam_loi_bao"]!.combo!.mult!, 1);
    expect(dm.combo).toBe(true);
    expect(dp).not.toHaveProperty("combo");
    expect(monsterHasStatus(t.w, marked.id, "mark_loi")).toBe(false); // consume
    expect(marked.m.mark).toBe(0);
  });

  it("dấu hệ KHÁC không được ăn combo Lôi (mark_hoa không kích Chưởng Tâm Lôi Bạo)", () => {
    const t = setup();
    equip(t.c, "chuong_tam_loi_bao");
    const a = mon(t, 1060, 985);
    const b = mon(t, 1060, 1015);
    applyMonsterStatus(
      t.w,
      a.id,
      { status: "mark_hoa" as never, ms: 8000, ratio: 0, chance: 1 },
      0,
      "a",
    );
    fire(t, 0);
    const da = dmgTo(t, a.id)[0]!;
    const db = dmgTo(t, b.id)[0]!;
    expect(da.amount).toBe(db.amount);
    expect(da).not.toHaveProperty("combo");
    expect(monsterHasStatus(t.w, a.id, "mark_hoa")).toBe(true); // dấu hoả còn nguyên
  });
});

describe("CT8 lát 2: Bách Thú Khiếu Phong chia tăng tốc + hồi phục cho đồng đội cùng đội", () => {
  const has = (t: ReturnType<typeof setup>, sid: string, id: string) =>
    (t.w.ctrl.get(sid)!.st?.list ?? []).some((e) => e.id === id);

  it("mình + đồng đội cùng đội trong tầm nhận haste và regen; người ngoài đội, đồng đội ngoài tầm, đồng đội đã gục thì không", () => {
    const t = setup();
    equip(t.c, "bach_thu_khieu_phong");
    const near = addPlayer(t.w, "b", 4, 0);
    near.p.x = 1300;
    near.p.y = 1000;
    const far = addPlayer(t.w, "c", 4, 0);
    far.p.x = 1000 + SKILL_BY_ID["bach_thu_khieu_phong"]!.ally!.range + 100;
    far.p.y = 1000;
    const stranger = addPlayer(t.w, "d", 4, 0);
    stranger.p.x = 1050;
    stranger.p.y = 1000;
    const down = addPlayer(t.w, "e", 4, 0);
    down.p.x = 1100;
    down.p.y = 1000;
    down.p.dead = true;
    t.w.parties._create("a", "b");
    const party = t.w.parties._get(t.w.parties.partyIdOf("a")!)!;
    t.w.parties._join(party, "c");
    t.w.parties._join(party, "e");
    fire(t, 0);
    for (const id of ["haste", "regen"]) {
      expect(has(t, "a", id), `mình ${id}`).toBe(true);
      expect(has(t, "b", id), `đồng đội gần ${id}`).toBe(true);
      expect(has(t, "c", id), `đồng đội ngoài tầm ${id}`).toBe(false);
      expect(has(t, "d", id), `người ngoài đội ${id}`).toBe(false);
      expect(has(t, "e", id), `đồng đội đã gục ${id}`).toBe(false);
    }
  });
});
