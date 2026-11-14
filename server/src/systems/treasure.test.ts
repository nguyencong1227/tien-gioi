// Pháp bảo (M7.4, #505): sáu nội tại `TREASURES` do server thi hành (`systems/treasure.ts`). Món thử chèn vào `ITEM_BY_ID` bằng id RIÊNG (`t_tr_*`, trỏ tới nội tại thật
// qua `equip.treasure`) rồi dọn: không đụng món thật `ho_than_an`... của bước nội dung.
import { afterEach, describe, expect, it, vi } from "vitest";
import { ITEM_BY_ID, TREASURES, type ItemDef, type TreasureId } from "@tien-gioi/shared";
import { cast } from "./cast";
import { dealMonsterDamage, hurtPlayer } from "./combat";
import { tickStatuses } from "./status";
import { tickWorld } from "./tick";
import { onTreasureKill, tickTreasure, treasureElementMult, treasureOfPlayer } from "./treasure";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";

const injected: string[] = [];
/** Chèn một món pháp bảo thử mang nội tại `tid`; trả id món. */
function treasureItem(tid: TreasureId, slot: "treasure" | "jade" = "treasure"): string {
  const id = `t_tr_${tid}_${slot}`;
  ITEM_BY_ID[id] = {
    id,
    name: id,
    type: "equip",
    stack: 1,
    rarity: 3,
    desc: "thử",
    equip: { slot, stats: {}, reqRealm: 3, reqTier: 0, treasure: tid },
    color: 0,
  } as unknown as ItemDef;
  injected.push(id);
  return id;
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const id of injected.splice(0)) delete ITEM_BY_ID[id];
});

const T = (id: TreasureId) => TREASURES.find((t) => t.id === id)!;

/** Người chơi Kim Đan mặc pháp bảo `tid`. */
function setup(tid: TreasureId | null, realm = 3) {
  const t = makeWorld();
  const a = addPlayer(t.w, "a", realm, 0);
  if (tid) a.p.treasure = treasureItem(tid);
  return { ...t, ...a };
}

describe("treasureOfPlayer: chỉ pháp bảo THẬT ở ô đã mở mới có tác dụng", () => {
  it("món hợp lệ ở ô `treasure` từ Kim Đan: có; trống, ô chưa mở, id lạ / độc, món không phải pháp bảo, món pháp bảo đặt sai ô: không", () => {
    const t = setup("ho_than_an");
    expect(treasureOfPlayer(t.p)?.id).toBe("ho_than_an");
    t.p.realm = 2; // ô chưa mở
    expect(treasureOfPlayer(t.p)).toBeUndefined();
    t.p.realm = 3;
    t.p.treasure = "";
    expect(treasureOfPlayer(t.p)).toBeUndefined();
    for (const bad of ["khong_co", "constructor", "__proto__", "lang_nha_kiem"]) {
      t.p.treasure = bad; // món thường / id độc đặt vào ô pháp bảo
      expect(treasureOfPlayer(t.p), bad).toBeUndefined();
    }
    t.p.treasure = treasureItem("ho_than_an", "jade"); // món mang nội tại nhưng thuộc ô khác
    expect(treasureOfPlayer(t.p)).toBeUndefined();
  });
});

describe("Hộ Thân Ấn: mỗi `intervalS` giây dựng khiên `shieldRatio` khí huyết tối đa", () => {
  const { intervalS, shieldRatio } = T("ho_than_an").params;
  const pool = (c: { st?: { list: { id: string; pool: number }[] } }) =>
    c.st?.list.find((s) => s.id === "shield")?.pool;

  it("tick đầu dựng khiên ngay; chưa tới hạn thì không làm mới; tới hạn thì làm đầy lại", () => {
    const t = setup("ho_than_an");
    t.w.now = 10_000;
    tickTreasure(t.w, "a", t.p, t.c, 0.05);
    expect(pool(t.c)).toBeCloseTo(shieldRatio * t.p.maxHp, 0);
    t.c.st!.list[0].pool = 1; // khiên bị đánh gần hết
    t.w.now = 10_000 + intervalS * 1000 - 1;
    tickTreasure(t.w, "a", t.p, t.c, 0.05);
    expect(pool(t.c)).toBe(1); // chưa tới hạn
    t.w.now = 10_000 + intervalS * 1000;
    tickTreasure(t.w, "a", t.p, t.c, 0.05);
    expect(pool(t.c)).toBeCloseTo(shieldRatio * t.p.maxHp, 0); // làm đầy lại
  });

  it("khiên thật sự đỡ đòn: sát thương nhỏ hơn khiên không trừ khí huyết", () => {
    const t = setup("ho_than_an");
    t.w.now = 10_000;
    tickTreasure(t.w, "a", t.p, t.c, 0.05);
    const hp0 = t.p.hp;
    const m = addMonster(t.w, "lang", 0, 0);
    hurtPlayer(t.w, "a", t.p, Math.floor(shieldRatio * t.p.maxHp) - 5, m.m);
    expect(t.p.hp).toBe(hp0);
  });

  it("không mặc / ô chưa mở: không khiên và không giữ dữ liệu chạy; tháo ra thì bỏ dữ liệu, mặc lại thì khiên dựng ngay", () => {
    const none = setup(null);
    none.w.now = 10_000;
    tickTreasure(none.w, "a", none.p, none.c, 0.05);
    expect(none.c.st).toBeUndefined();
    expect(none.c.treasure).toBeUndefined();

    const low = setup("ho_than_an", 2);
    low.w.now = 10_000;
    tickTreasure(low.w, "a", low.p, low.c, 0.05);
    expect(low.c.st).toBeUndefined();

    const t = setup("ho_than_an");
    t.w.now = 10_000;
    tickTreasure(t.w, "a", t.p, t.c, 0.05);
    expect(t.c.treasure).toBeDefined();
    const id = t.p.treasure;
    t.p.treasure = "";
    tickTreasure(t.w, "a", t.p, t.c, 0.05);
    expect(t.c.treasure).toBeUndefined();
    t.c.st!.list.length = 0;
    t.p.treasure = id;
    t.w.now = 10_500; // chưa tới 10 giây kể từ lần trước, nhưng đã mặc lại: dựng ngay
    tickTreasure(t.w, "a", t.p, t.c, 0.05);
    expect(pool(t.c)).toBeGreaterThan(0);
  });

  it("nối vào tickWorld: người đang sống có khiên; người gục không", () => {
    const t = setup("ho_than_an");
    t.w.now = 10_000;
    tickWorld(t.w, 50);
    expect(pool(t.c)).toBeGreaterThan(0);
    const d = addPlayer(t.w, "d", 3, 0);
    d.p.treasure = treasureItem("ho_than_an");
    d.p.dead = true;
    tickWorld(t.w, 50);
    expect(d.c.st).toBeUndefined();
  });
});

describe("Định Tâm Chung: đứng yên từ `stillS` giây, mỗi giây hồi `hpRatioPerS` khí huyết tối đa", () => {
  const { stillS, hpRatioPerS } = T("dinh_tam_chung").params;
  /** Chạy tick 50 ms từ `from` tới `to` (ms). */
  const run = (t: ReturnType<typeof setup>, from: number, to: number) => {
    for (let now = from; now <= to; now += 50) {
      t.w.now = now;
      tickTreasure(t.w, "a", t.p, t.c, 0.05);
    }
  };

  it("chưa đủ `stillS` giây thì chưa hồi; sau đó hồi đúng tốc độ (không mất phần lẻ)", () => {
    const t = setup("dinh_tam_chung");
    t.p.maxHp = 1000;
    t.p.hp = 500;
    run(t, 10_000, 10_000 + stillS * 1000 - 50);
    expect(t.p.hp).toBe(500);
    run(t, 10_000 + stillS * 1000, 10_000 + 4000);
    const gained = t.p.hp - 500;
    const expected = hpRatioPerS * t.p.maxHp * (4 - stillS); // 3 giây hồi
    expect(gained).toBeGreaterThanOrEqual(Math.floor(expected) - 1);
    expect(gained).toBeLessThanOrEqual(Math.ceil(expected) + 1);
  });

  it("di chuyển thì dừng và tính lại từ đầu; đứng yên trở lại đủ `stillS` giây mới hồi tiếp", () => {
    const t = setup("dinh_tam_chung");
    t.p.maxHp = 1000;
    t.p.hp = 500;
    run(t, 10_000, 12_000); // đã hồi một ít
    const hpBefore = t.p.hp;
    expect(hpBefore).toBeGreaterThan(500);
    t.p.x += 20; // bước đi
    t.w.now = 12_050;
    tickTreasure(t.w, "a", t.p, t.c, 0.05);
    run(t, 12_100, 12_050 + stillS * 1000 - 50);
    expect(t.p.hp).toBe(hpBefore); // đang đếm lại
    run(t, 12_050 + stillS * 1000, 14_000);
    expect(t.p.hp).toBeGreaterThan(hpBefore);
  });

  it("đầy khí huyết thì không vượt quá và không để dành phần lẻ; không mặc thì không hồi", () => {
    const t = setup("dinh_tam_chung");
    t.p.maxHp = 1000;
    t.p.hp = 999;
    run(t, 10_000, 14_000);
    expect(t.p.hp).toBe(1000);
    expect(t.c.treasure!.acc.hp).toBe(0);

    const none = setup(null);
    none.p.maxHp = 1000;
    none.p.hp = 500;
    run(none, 10_000, 14_000);
    expect(none.p.hp).toBe(500);
  });
});

describe("Hấp Linh Châu và Phong Hành Bội: khi hạ quái", () => {
  /** Hạ chết một con quái do `by` đánh. */
  const kill = (t: ReturnType<typeof setup>, by = "a") => {
    const m = addMonster(t.w, "tho", t.p.x + 20, t.p.y);
    dealMonsterDamage(t.w, m.id, t.w.state.monsters.get(m.id)!, by, 1e9, false);
    expect(t.w.state.monsters.has(m.id)).toBe(false);
  };

  it("hồi `mpRatio` linh lực tối đa, không vượt tối đa; người không được ghi công / không mặc / ô chưa mở thì không", () => {
    const t = setup("hap_linh_chau");
    t.p.maxMp = 1000;
    t.p.mp = 0;
    kill(t);
    expect(t.p.mp).toBe(Math.round(T("hap_linh_chau").params.mpRatio * 1000)); // 30
    t.p.mp = 990;
    kill(t);
    expect(t.p.mp).toBe(1000); // kẹp

    const none = setup(null);
    none.p.maxMp = 1000;
    none.p.mp = 0;
    kill(none);
    expect(none.p.mp).toBe(0);

    const low = setup("hap_linh_chau", 2);
    low.p.maxMp = 1000;
    low.p.mp = 0;
    kill(low);
    expect(low.p.mp).toBe(0);

    // Người đứng cạnh mặc pháp bảo nhưng không góp sát thương: không nhận
    const t2 = setup("hap_linh_chau");
    const b = addPlayer(t2.w, "b", 3, 0);
    b.p.treasure = treasureItem("hap_linh_chau");
    b.p.maxMp = 1000;
    b.p.mp = 0;
    t2.p.maxMp = 1000;
    t2.p.mp = 0;
    kill(t2, "a");
    expect(t2.p.mp).toBeGreaterThan(0);
    expect(b.p.mp).toBe(0);
  });

  it("Phong Hành Bội: hạ quái được tăng tốc `speedRatio` trong `ms`, hết hạn thì về bình thường", () => {
    const t = setup("phong_hanh_boi");
    t.w.now = 10_000;
    kill(t);
    const haste = t.c.st!.list.find((s) => s.id === "haste")!;
    expect(haste.ratio).toBeCloseTo(T("phong_hanh_boi").params.speedRatio, 10);
    expect(t.c.moveMul).toBeCloseTo(1 + T("phong_hanh_boi").params.speedRatio, 10);
    t.w.now = 10_000 + T("phong_hanh_boi").params.ms + 50;
    tickStatuses(t.w, 0.05);
    expect(t.c.moveMul).toBeUndefined();
    expect(t.c.st!.list.some((s) => s.id === "haste")).toBe(false);
  });

  it("onTreasureKill với pháp bảo khác (khiên, hồi, hệ) không làm gì", () => {
    const t = setup("ho_than_an");
    t.p.mp = 5;
    onTreasureKill(t.w, "a", t.p);
    expect(t.p.mp).toBe(5);
    expect(t.c.st).toBeUndefined();
  });
});

describe("Xích Diễm Ấn / Hàn Băng Ấn: chiêu đúng hệ gây thêm `dmgRatio` sát thương", () => {
  it("treasureElementMult: đúng hệ thì 1 + dmgRatio; khác hệ, không hệ, không pháp bảo, ô chưa mở thì 1", () => {
    const hoa = setup("xich_diem_an");
    expect(treasureElementMult(hoa.p, "hoa")).toBeCloseTo(
      1 + T("xich_diem_an").params.dmgRatio,
      10,
    );
    expect(treasureElementMult(hoa.p, "bang")).toBe(1);
    expect(treasureElementMult(hoa.p, "none")).toBe(1);
    expect(treasureElementMult(hoa.p, undefined)).toBe(1);
    const bang = setup("han_bang_an");
    expect(treasureElementMult(bang.p, "bang")).toBeCloseTo(
      1 + T("han_bang_an").params.dmgRatio,
      10,
    );
    expect(treasureElementMult(bang.p, "hoa")).toBe(1);
    expect(treasureElementMult(setup(null).p, "hoa")).toBe(1);
    expect(treasureElementMult(setup("xich_diem_an", 2).p, "hoa")).toBe(1);
    // Pháp bảo không có hệ (khiên) không tăng sát thương hệ nào
    expect(treasureElementMult(setup("ho_than_an").p, "hoa")).toBe(1);
  });

  /** Sát thương của MỘT lần dùng chiêu `skill` (hệ cố định theo chiêu) lên quái nhiều máu; số ngẫu nhiên cố định để so sánh. */
  function castDamage(tid: TreasureId | null, skill: string): number {
    const t = setup(tid, 4);
    t.p.mp = t.p.maxMp;
    t.c.skills.learned[skill] = 1;
    t.c.skills.slots[0] = skill;
    const m = addMonster(t.w, "tho", t.p.x + 40, t.p.y);
    const mon = t.w.state.monsters.get(m.id)!;
    mon.hp = mon.maxHp = 1e9;
    t.w.now = 10_000;
    vi.spyOn(Math, "random").mockReturnValue(0.5); // dao động 1,0; không bạo kích (0,5 > 0,1)
    cast(t.w, "a", { slot: 2, angle: 0 });
    vi.restoreAllMocks();
    const hit = t.dmgs.filter((d) => d.target === m.id && !d.toPlayer);
    expect(hit.length, `${skill} phải trúng`).toBeGreaterThan(0);
    return hit[0].amount;
  }

  it("chiêu Hỏa với Xích Diễm Ấn gây ~ (1 + dmgRatio) lần; Hàn Băng Ấn không tăng chiêu Hỏa", () => {
    const base = castDamage(null, "hoa_van_kiem");
    const boosted = castDamage("xich_diem_an", "hoa_van_kiem");
    expect(boosted).toBeGreaterThan(base);
    expect(Math.abs(boosted - base * (1 + T("xich_diem_an").params.dmgRatio))).toBeLessThanOrEqual(
      1,
    );
    expect(castDamage("han_bang_an", "hoa_van_kiem")).toBe(base);
  });

  it("chiêu Băng với Hàn Băng Ấn gây ~ (1 + dmgRatio) lần; Xích Diễm Ấn không tăng chiêu Băng", () => {
    const base = castDamage(null, "huyen_bang_chi");
    const boosted = castDamage("han_bang_an", "huyen_bang_chi");
    expect(boosted).toBeGreaterThan(base);
    expect(Math.abs(boosted - base * (1 + T("han_bang_an").params.dmgRatio))).toBeLessThanOrEqual(
      1,
    );
    expect(castDamage("xich_diem_an", "huyen_bang_chi")).toBe(base);
  });
});
