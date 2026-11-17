// Thành tựu + danh hiệu theo linh hồn (M9.5 #1024): phần thuần `grantDue` / `unlockedTitles` / `wornTitle` / `achievementsMsgOf` và `trackSocial` nối vào hạ trùm / tăng bậc.
import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENT_BY_ID,
  DUYEN_CAP,
  newSoul,
  newSocial,
  socialTrack,
  stepOf,
  type Soul,
  type SoulSocial,
} from "@tien-gioi/shared";
import { achievementsMsgOf, grantDue, unlockedTitles, wornTitle } from "./achievements";
import { dealMonsterDamage } from "./combat";
import { gainExp } from "./progression";
import { trackSocial } from "./social";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";

const AT = "2026-11-17T10:00:00.000Z";
const soulWith = (counters: Record<string, number>, extra: Partial<Soul> = {}): Soul => {
  let social: SoulSocial = newSocial();
  for (const [k, v] of Object.entries(counters)) social = socialTrack(social, k, v).social;
  return { ...newSoul("linh", "t"), ...extra, social };
};

describe("grantDue: cấp thành tựu đến hạn, thưởng Duyên, idempotent", () => {
  it("chưa đủ điều kiện hoặc chưa có phần xã hội: trả ĐÚNG đối tượng cũ, không cấp gì", () => {
    const s = newSoul("linh", "t");
    expect(grantDue(s, AT)).toEqual({ soul: s, granted: [] });
    expect(grantDue(s, AT).soul).toBe(s);
    const low = soulWith({ kiep: 1 });
    expect(grantDue(low, AT).soul).toBe(low);
  });

  it("đủ điều kiện: cấp, ghi thời điểm, cộng Duyên (cả duyenTotal); thành tựu không thưởng Duyên không đổi Duyên", () => {
    const s = soulWith({ kiep: 2, "boss:mang": 1 }, { duyen: 5, duyenTotal: 9 });
    const r = grantDue(s, AT);
    expect(r.granted.sort()).toEqual(["kiep_2", "trum_mang_1"]);
    expect(r.soul.social!.ach).toEqual({ kiep_2: AT, trum_mang_1: AT });
    expect(r.soul.duyen).toBe(5 + ACHIEVEMENT_BY_ID.kiep_2.reward!.duyen!); // trum_mang_1 chỉ thưởng danh hiệu
    expect(r.soul.duyenTotal).toBe(9 + ACHIEVEMENT_BY_ID.kiep_2.reward!.duyen!);
    expect(s.social!.ach).toEqual({}); // không sửa đối số
  });

  it("idempotent: gọi lại không cấp lần nữa, không cộng Duyên lần nữa, giữ thời điểm đầu", () => {
    const first = grantDue(soulWith({ kiep: 2 }), AT);
    const again = grantDue(first.soul, "2099-01-01T00:00:00.000Z");
    expect(again.granted).toEqual([]);
    expect(again.soul).toBe(first.soul);
    expect(again.soul.social!.ach.kiep_2).toBe(AT);
  });

  it("Duyên kẹp DUYEN_CAP", () => {
    const s = soulWith({ kiep: 2 }, { duyen: DUYEN_CAP - 1, duyenTotal: DUYEN_CAP });
    const r = grantDue(s, AT);
    expect(r.soul.duyen).toBe(DUYEN_CAP);
    expect(r.soul.duyenTotal).toBe(DUYEN_CAP);
  });
});

describe("danh hiệu đã mở / đang đeo", () => {
  it("unlockedTitles: chỉ danh hiệu thưởng của thành tựu ĐÃ ĐẠT (id thành tựu lạ bị bỏ)", () => {
    expect(unlockedTitles(undefined).size).toBe(0);
    expect(unlockedTitles(newSocial()).size).toBe(0);
    const s: SoulSocial = {
      ...newSocial(),
      ach: { kiep_2: AT, khong_con_nua: AT, trum_mang_1: AT },
    };
    expect([...unlockedTitles(s)].sort()).toEqual(["lh2", "tr1"]);
    for (const bad of ["constructor", "__proto__"])
      expect(unlockedTitles({ ...newSocial(), ach: { [bad]: AT } }).size).toBe(0);
  });

  it("wornTitle: chỉ khi đã mở VÀ còn hợp lệ; chưa mở / id lạ / null -> ''", () => {
    const opened: SoulSocial = { ...newSocial(), ach: { kiep_2: AT }, title: "lh2" };
    expect(wornTitle(opened)).toBe("lh2");
    expect(wornTitle({ ...opened, title: "tr1" })).toBe(""); // chưa mở tr1
    expect(wornTitle({ ...opened, title: null })).toBe("");
    expect(wornTitle({ ...opened, title: "zzzz" })).toBe("");
    expect(wornTitle(undefined)).toBe("");
  });

  it("achievementsMsgOf: bản SAO (đổi tin không đổi chân linh), không kèm định nghĩa; chưa có phần xã hội thì rỗng", () => {
    const s: SoulSocial = {
      ...newSocial(),
      ach: { kiep_2: AT },
      counters: { kiep: 2 },
      title: "lh2",
    };
    const m = achievementsMsgOf(s);
    expect(m).toEqual({ ach: { kiep_2: AT }, counters: { kiep: 2 }, title: "lh2" });
    m.ach.x = "y";
    m.counters.kiep = 99;
    expect(s.ach).toEqual({ kiep_2: AT });
    expect(s.counters.kiep).toBe(2);
    expect(achievementsMsgOf(undefined)).toEqual({ ach: {}, counters: {}, title: null });
  });
});

describe("trackSocial nối vào hạ trùm và tăng bậc", () => {
  function setup() {
    const t = makeWorld();
    const pa = addPlayer(t.w, "Alpha", 1, 0);
    const calls: Array<{ key: string; fn: (s: SoulSocial | undefined) => SoulSocial }> = [];
    t.w.onSocial = (key, fn) => calls.push({ key, fn });
    return { ...t, pa, calls };
  }
  const applyAll = (calls: ReturnType<typeof setup>["calls"]) => {
    let s: SoulSocial | undefined;
    for (const c of calls) s = c.fn(s);
    return s;
  };

  it("trackSocial: gọi hook với soulKey, nhóm nhiều khoá MỘT lần gọi; khoá lạ bị bỏ; không hook / không người thì im lặng", () => {
    const t = setup();
    trackSocial(t.w, "Alpha", ["boss:mang", 1], ["kiep", 3], ["xyz", 5]);
    expect(t.calls.length).toBe(1);
    expect(t.calls[0].key).toBe(t.pa.c.identity.soulKey);
    expect(applyAll(t.calls)!.counters).toEqual({ "boss:mang": 1, kiep: 3 });
    trackSocial(t.w, "khong-co", ["kiep", 1]);
    expect(t.calls.length).toBe(1);
    t.w.onSocial = null;
    expect(() => trackSocial(t.w, "Alpha", ["kiep", 1])).not.toThrow();
    trackSocial(t.w, "Alpha"); // không có mục nào: bỏ
  });

  it("không có gì đổi: fn trả ĐÚNG phần xã hội đang có (để phòng bỏ qua ghi kho thừa)", () => {
    const t = setup();
    trackSocial(t.w, "Alpha", ["kiep", 3]);
    const cur = t.calls[0].fn(undefined);
    trackSocial(t.w, "Alpha", ["kiep", 2]); // thấp hơn mốc max
    expect(t.calls[1].fn(cur)).toBe(cur);
  });

  it("hạ TRÙM: mỗi người góp sát thương nhận `boss:<loài>` +1; hạ quái thường không ghi", () => {
    const t = setup();
    const boss = addMonster(t.w, "mang", t.pa.p.x + 40, t.pa.p.y);
    dealMonsterDamage(t.w, boss.id, boss.m, "Alpha", boss.m.hp + 1, false);
    expect(t.calls.some((c) => applyAll([c])?.counters["boss:mang"] === 1)).toBe(true);
    const before = t.calls.length;
    const wolf = addMonster(t.w, "lang", t.pa.p.x + 40, t.pa.p.y);
    dealMonsterDamage(t.w, wolf.id, wolf.m, "Alpha", wolf.m.hp + 1, false);
    expect(t.calls.length).toBe(before);
  });

  it("tăng bậc (gainExp): `realm_step` = bậc mới; không tăng bậc thì không ghi", () => {
    const t = setup();
    const p = t.pa.p;
    gainExp(t.w, "Alpha", p, 1); // chưa đủ lên bậc
    expect(t.calls.length).toBe(0);
    const step = stepOf(p.realm, p.tier);
    gainExp(t.w, "Alpha", p, p.expMax - p.exp + 1);
    expect(t.calls.length).toBeGreaterThan(0);
    expect(applyAll(t.calls)!.counters.realm_step).toBe(step + 1);
  });
});
