// Nghề nhỏ lát 2, phần máy chủ (#514, docs/THIET_KE_NGHE_NHO.md mục 5.9 + 6): phù `amp_<hệ>` nhân sát thương chiêu cùng hệ lên QUÁI, phù `cdr_phu`
// giảm hồi chiêu (cộng trang bị rồi kẹp `CDR_CAP`, gửi lại `cdMax` khi vào / ra / đổi), cả hai KHÔNG tác dụng khi thách đấu và mất như trạng thái khác.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CDR_CAP,
  ITEM_BY_ID,
  SKILL_BY_ID,
  elementMult,
  skillCooldownMs,
  skillDamageMult,
  statsFor,
  type ItemDef,
} from "@tien-gioi/shared";
import { cast } from "./cast";
import { cdrNow } from "./skills";
import { applyPlayerStatus, clearPlayerStatus, tickStatuses } from "./status";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";

/** Món trang bị thử có `cdr` (chèn vào bảng chung, dọn sau mỗi ca): chưa có món thật cho ô riêng nên test tự dựng. */
const TEST_BOOTS = "t_hai_cdr_phu";
const withBoots = (cdr: number) => {
  ITEM_BY_ID[TEST_BOOTS] = {
    id: TEST_BOOTS,
    name: "Hài thử",
    type: "equip",
    stack: 1,
    rarity: 2,
    desc: "thử",
    equip: { slot: "boots", stats: { cdr }, reqRealm: 0, reqTier: 0 },
    color: 0,
  } as unknown as ItemDef;
};
afterEach(() => {
  vi.restoreAllMocks();
  delete ITEM_BY_ID[TEST_BOOTS];
});

/** Người chơi Hóa Thần (đủ bốn ô chiêu), đầy linh lực; ô 2 gắn `bon_thach_quyen` (hệ thổ), ô 3 `hoa_van_kiem` (hệ hỏa). */
function setup() {
  const t = makeWorld();
  const a = addPlayer(t.w, "a", 4, 0);
  a.p.mp = a.p.maxMp;
  a.c.skills.learned["bon_thach_quyen"] = 1;
  a.c.skills.slots[0] = "bon_thach_quyen";
  a.c.skills.learned["hoa_van_kiem"] = 1;
  a.c.skills.slots[1] = "hoa_van_kiem";
  return { ...t, ...a };
}
const phu = (id: string, ms = 60_000, ratio = 0.2) =>
  ({ status: id, ms, ratio, chance: 1 }) as never;
const give = (t: ReturnType<typeof setup>, id: string, ms?: number, ratio?: number) =>
  applyPlayerStatus(t.w, "a", phu(id, ms, ratio), 0, "item:test");

/** Đánh một quái đứng sát bằng ô `slot` (2 = thổ, 3 = hỏa) và trả sát thương lên nó (random giữ nguyên, không bạo kích). */
function hitOnce(t: ReturnType<typeof setup>, slot: 2 | 3) {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  const mon = addMonster(t.w, "mang", t.p.x + 40, t.p.y);
  mon.mc.def = { ...mon.mc.def, element: "none" }; // không khắc / bị khắc: chỉ còn phù tác động
  t.dmgs.length = 0;
  t.w.now += 20_000;
  t.p.mp = t.p.maxMp;
  cast(t.w, "a", { slot, angle: 0 });
  const got = t.dmgs.filter((d) => d.target === mon.id).map((d) => d.amount);
  t.w.state.monsters.delete(mon.id);
  t.w.mctrl.delete(mon.id);
  return got[0];
}
/** Sát thương THÔ (chưa làm tròn) của chiêu lên quái không hệ: server làm tròn MỘT lần ở cuối (`rollDamage`), nên phép nhân phù phải làm trước khi tròn. */
const rawDmg = (t: ReturnType<typeof setup>, skillId: string) => {
  const def = SKILL_BY_ID[skillId];
  const atk = statsFor(t.p.realm, t.p.tier, t.p, t.c.mult).atk;
  return atk * def.mult * skillDamageMult(1) * elementMult(def.element, "none");
};
const want = (t: ReturnType<typeof setup>, skillId: string, amp = 1) =>
  Math.round(rawDmg(t, skillId) * amp);

describe("phù amp_<hệ>: nhân sát thương chiêu cùng hệ lên quái", () => {
  it("không có phù: sát thương gốc; có amp_tho +20%: chiêu thổ nhân 1,2, chiêu hỏa KHÔNG đổi", () => {
    const t = setup();
    expect(hitOnce(t, 2)).toBe(want(t, "bon_thach_quyen"));
    expect(hitOnce(t, 3)).toBe(want(t, "hoa_van_kiem"));
    expect(give(t, "amp_tho", 60_000, 0.2)).toBe("added");
    expect(hitOnce(t, 2)).toBe(want(t, "bon_thach_quyen", 1.2));
    expect(hitOnce(t, 3)).toBe(want(t, "hoa_van_kiem")); // hệ khác: không nhân
    expect(want(t, "bon_thach_quyen", 1.2)).toBeGreaterThan(want(t, "bon_thach_quyen")); // phù có tác dụng thật
  });

  it("phù đúng hệ nhân cả hai: hai phù hai hệ cùng lúc, mỗi chiêu nhận phù của mình", () => {
    const t = setup();
    give(t, "amp_tho", 60_000, 0.1);
    give(t, "amp_hoa", 60_000, 0.3);
    expect(hitOnce(t, 2)).toBe(want(t, "bon_thach_quyen", 1.1));
    expect(hitOnce(t, 3)).toBe(want(t, "hoa_van_kiem", 1.3));
  });

  it("hết hạn thì không còn nhân (kể cả khi chưa kịp dọn)", () => {
    const t = setup();
    give(t, "amp_tho", 30_000, 0.2);
    t.w.now += 31_000; // quá hạn, hộp chưa dọn (chưa tick)
    expect(hitOnce(t, 2)).toBe(want(t, "bon_thach_quyen"));
  });

  it("nhân với hệ khắc của quái và pháp bảo: tích các hệ số, phù chỉ thêm một thừa số", () => {
    const t = setup();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    give(t, "amp_tho", 60_000, 0.3);
    const mon = addMonster(t.w, "mang", t.p.x + 40, t.p.y);
    mon.mc.def = { ...mon.mc.def, element: "thuy" }; // thổ khắc thủy
    t.dmgs.length = 0;
    t.w.now += 20_000;
    cast(t.w, "a", { slot: 2, angle: 0 });
    const def = SKILL_BY_ID["bon_thach_quyen"];
    const atk = statsFor(t.p.realm, t.p.tier, t.p, t.c.mult).atk;
    const want = Math.round(atk * def.mult * skillDamageMult(1) * elementMult("tho", "thuy") * 1.3);
    expect(t.dmgs.find((d) => d.target === mon.id)!.amount).toBe(want);
  });

  it("mất khi chết / qua kiếp (clearPlayerStatus): sát thương về gốc", () => {
    const t = setup();
    give(t, "amp_tho", 60_000, 0.2);
    clearPlayerStatus(t.w, "a");
    expect(hitOnce(t, 2)).toBe(want(t, "bon_thach_quyen"));
  });

  it("thách đấu: đòn lên ĐỐI THỦ không nhân phù (PK không nghiêng bằng đồ chế)", () => {
    const run = (withPhu: boolean) => {
      const t = setup();
      const b = addPlayer(t.w, "b", 4, 0);
      b.p.x = t.p.x + 40;
      b.p.y = t.p.y;
      t.w.duels._start({
        a: "a",
        b: "b",
        phase: "fight",
        fightAt: 0,
        endsAt: Infinity,
        ox: 0,
        oy: 0,
      });
      if (withPhu) give(t, "amp_tho", 60_000, 0.3);
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      const hp0 = b.p.hp;
      cast(t.w, "a", { slot: 2, angle: 0 });
      vi.restoreAllMocks();
      return hp0 - b.p.hp;
    };
    const without = run(false);
    expect(without).toBeGreaterThan(0);
    expect(run(true)).toBe(without);
  });
});

describe("phù cdr_phu: giảm hồi chiêu", () => {
  it("cdrNow = trang bị + phù; hồi chiêu đặt lúc dùng chiêu ngắn hơn; kẹp CDR_CAP khi cộng nhiều", () => {
    const t = setup();
    const def = SKILL_BY_ID["bon_thach_quyen"];
    expect(cdrNow(t.w, "a", t.p, t.c)).toBe(0);
    give(t, "cdr_phu", 60_000, 0.15);
    expect(cdrNow(t.w, "a", t.p, t.c)).toBeCloseTo(0.15, 12);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const now0 = t.w.now;
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(t.c.skillCd[0] - now0).toBe(skillCooldownMs(def, 1, 0.15));
    expect(skillCooldownMs(def, 1, 0.15)).toBeLessThan(skillCooldownMs(def, 1, 0));
    // cộng trang bị 0,25 => 0,4 > CDR_CAP: hồi chiêu bằng đúng ở trần
    expect(skillCooldownMs(def, 1, 0.25 + 0.15)).toBe(skillCooldownMs(def, 1, CDR_CAP));
  });

  it("CỘNG với giảm hồi chiêu của trang bị (không lấy max): trang bị 0,10 + phù 0,15 = 0,25; vượt trần thì kẹp CDR_CAP", () => {
    const t = setup();
    withBoots(10);
    t.p.boots = TEST_BOOTS;
    expect(cdrNow(t.w, "a", t.p, t.c)).toBeCloseTo(0.1, 12);
    give(t, "cdr_phu", 60_000, 0.15);
    expect(cdrNow(t.w, "a", t.p, t.c)).toBeCloseTo(0.25, 12); // cộng, không phải max(0,1; 0,15)
    const def = SKILL_BY_ID["bon_thach_quyen"];
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const now0 = t.w.now;
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(t.c.skillCd[0] - now0).toBe(skillCooldownMs(def, 1, 0.25));
    expect(skillCooldownMs(def, 1, 0.25)).toBeLessThan(skillCooldownMs(def, 1, 0.15)); // khác nhiều so với chỉ max
    // trang bị mạnh 0,25 + phù 0,15 = 0,4 > CDR_CAP: kẹp ở skillCooldownMs
    withBoots(25);
    expect(skillCooldownMs(def, 1, cdrNow(t.w, "a", t.p, t.c))).toBe(
      skillCooldownMs(def, 1, CDR_CAP),
    );
  });

  it("phù quá hạn nhưng hộp chưa dọn: KHÔNG còn tính (cdrNow chỉ còn trang bị)", () => {
    const t = setup();
    withBoots(10);
    t.p.boots = TEST_BOOTS;
    give(t, "cdr_phu", 10_000, 0.15);
    expect(cdrNow(t.w, "a", t.p, t.c)).toBeCloseTo(0.25, 12);
    t.w.now += 11_000; // quá hạn, chưa tick nên mục còn trong hộp
    expect(t.c.st!.list.some((x) => x.id === "cdr_phu")).toBe(true);
    expect(cdrNow(t.w, "a", t.p, t.c)).toBeCloseTo(0.1, 12);
  });

  it("gửi lại sổ chiêu (cdMax mới) khi phù vào, và khi hết hạn lúc dọn", () => {
    const t = setup();
    const sent0 = t.skillMsgs.length;
    const cdMax0 = t.skillMsgs.at(-1)?.msg.cdMax;
    give(t, "cdr_phu", 10_000, 0.15);
    expect(t.skillMsgs.length).toBe(sent0 + 1);
    const withPhu = t.skillMsgs.at(-1)!.msg.cdMax;
    expect(withPhu[0]).toBeLessThan(SKILL_BY_ID["bon_thach_quyen"].cooldown);
    expect(withPhu).not.toEqual(cdMax0);
    t.w.now += 11_000;
    tickStatuses(t.w, 0.05); // dọn hết hạn
    expect(t.skillMsgs.length).toBe(sent0 + 2);
    expect(t.skillMsgs.at(-1)!.msg.cdMax[0]).toBe(SKILL_BY_ID["bon_thach_quyen"].cooldown);
  });

  it("gửi lại khi bị xoá (chết / qua kiếp); phù khác KHÔNG làm gửi lại sổ chiêu", () => {
    const t = setup();
    const sent = t.skillMsgs.length;
    give(t, "amp_tho", 60_000, 0.2);
    give(t, "haste", 5000, 0.2);
    expect(t.skillMsgs.length).toBe(sent); // amp / haste không đổi cdMax: không gửi lại sổ chiêu
    give(t, "cdr_phu", 60_000, 0.1);
    expect(t.skillMsgs.length).toBe(sent + 1);
    clearPlayerStatus(t.w, "a");
    expect(t.skillMsgs.length).toBe(sent + 2);
    expect(t.skillMsgs.at(-1)!.msg.cdMax[0]).toBe(SKILL_BY_ID["bon_thach_quyen"].cooldown);
  });

  it("làm mới cường độ cao hơn: gửi lại với cdMax mới; cùng cường độ: không gửi thêm", () => {
    const t = setup();
    give(t, "cdr_phu", 60_000, 0.1);
    const n = t.skillMsgs.length;
    give(t, "cdr_phu", 60_000, 0.1); // y hệt: không đổi
    expect(t.skillMsgs.length).toBe(n);
    give(t, "cdr_phu", 60_000, 0.15);
    expect(t.skillMsgs.length).toBe(n + 1);
  });

  it("thách đấu: cdr_phu KHÔNG tính (hồi chiêu như chỉ có trang bị)", () => {
    const t = setup();
    const b = addPlayer(t.w, "b", 4, 0);
    t.w.duels._start({
      a: "a",
      b: "b",
      phase: "fight",
      fightAt: 0,
      endsAt: Infinity,
      ox: 0,
      oy: 0,
    });
    give(t, "cdr_phu", 60_000, 0.15);
    expect(cdrNow(t.w, "a", t.p, t.c)).toBe(0);
    expect(cdrNow(t.w, "b", b.p, b.c)).toBe(0);
    t.w.duels._end(t.w.duels.of("a")!);
    expect(cdrNow(t.w, "a", t.p, t.c)).toBeCloseTo(0.15, 12);
  });
});
