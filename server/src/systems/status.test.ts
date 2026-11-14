// Trạng thái (M7.2b bước 1): luật thuần (gắn / làm mới / trần 4 / choáng / khiên) và nối với thế giới (sát thương theo giây, vỡ giáp, choáng,
// tê cóng, hộ thể, hồi phục, gửi cho chủ). Chưa có chiêu nào gắn trạng thái: test gọi `applyMonsterStatus` / `applyPlayerStatus` trực tiếp.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_STATUSES,
  MONSTERS,
  MONSTER_BY_ID,
  STATUSES,
  STUN_IMMUNE_MS,
  STUN_MAX_MS,
  TICK_MS,
  moveSpeedMul,
  sanitizeStatusList,
  statsFor,
  type SkillEffect,
  type StatusId,
} from "@tien-gioi/shared";
import { hitMonster, hurtPlayer, hurtPlayerDot } from "./combat";
import { tickMonsters } from "./monsters";
import {
  addStatus,
  absorbShield,
  entriesOf,
  isStunned,
  maskOf,
  newStatusBox,
  pruneStatuses,
  speedMult,
  takeDotDamage,
  takenMult,
  type StatusInst,
} from "./status-rules";
import {
  DOT_TICK_MS,
  applyMonsterStatus,
  applyPlayerStatus,
  clearPlayerStatus,
  tickStatuses,
} from "./status";
import { tickWorld } from "./tick";
import { applyInputs, queueInput } from "./movement";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";

const eff = (status: StatusId, ms: number, ratio = 0.2, chance = 1): SkillEffect => ({
  status,
  ms,
  ratio,
  chance,
});

afterEach(() => vi.restoreAllMocks());

describe("status-rules: gắn và làm mới", () => {
  it("thêm mới: kẹp thời gian và cường độ theo trần của trạng thái; sát thương theo giây = ratio x sát thương gốc", () => {
    const box = newStatusBox();
    const r = addStatus(box, eff("burn", 99999, 5), 1000, { baseDmg: 100 });
    expect(r).toBe("added");
    const s = box.list[0];
    expect(s.until).toBe(1000 + 8000); // trần `maxMs` của burn
    expect(s.ratio).toBe(0.5); // trần `maxRatio` của burn
    expect(s.dps).toBe(50);
    // loại không phải dot thì không có dps
    addStatus(box, eff("chill", 3000, 0.3), 1000, { baseDmg: 100 });
    expect(box.list.find((x) => x.id === "chill")!.dps).toBe(0);
  });

  it("id lạ / độc, thời gian <= 0 hoặc không hữu hạn: bỏ qua, danh sách không đổi", () => {
    const box = newStatusBox();
    const junk = [
      eff("constructor" as StatusId, 1000),
      eff("__proto__" as StatusId, 1000),
      eff("burn", 0),
      eff("burn", -5),
      eff("burn", Number.NaN),
      eff("burn", Number.POSITIVE_INFINITY * 0), // NaN
    ];
    for (const e of junk) expect(addStatus(box, e, 0)).toBe("ignored");
    expect(box.list).toEqual([]);
    // cường độ rác -> 0, không NaN lọt vào dữ liệu
    addStatus(box, eff("chill", 1000, Number.NaN), 0);
    expect(box.list[0].ratio).toBe(0);
  });

  it("cùng loại thì LÀM MỚI chứ không cộng dồn: giữ hạn muộn hơn và cường độ mạnh hơn, không bị đòn yếu hơn kéo xuống", () => {
    const box = newStatusBox();
    addStatus(box, eff("sunder", 4000, 0.3), 0);
    expect(addStatus(box, eff("sunder", 2000, 0.1), 1000)).toBe("refreshed");
    expect(box.list).toHaveLength(1);
    expect(box.list[0].until).toBe(4000); // 1000 + 2000 = 3000 < 4000: giữ 4000
    expect(box.list[0].ratio).toBe(0.3);
    addStatus(box, eff("sunder", 5000, 0.35), 1000);
    expect(box.list[0].until).toBe(6000);
    expect(box.list[0].ratio).toBe(0.35); // không phải 0.3 + 0.35
    expect(takenMult(box, 1000)).toBeCloseTo(1.35, 9);
  });

  it("đủ MAX_STATUSES: cái mới kéo dài hơn thì đẩy cái hết sớm nhất ra; không dài hơn thì bị bỏ", () => {
    const box = newStatusBox();
    const ids: StatusId[] = ["burn", "poison", "bleed", "chill"];
    ids.forEach((id, i) => addStatus(box, eff(id, 2000 + i * 1000), 0)); // hết lúc 2000, 3000, 4000, 5000
    expect(box.list).toHaveLength(MAX_STATUSES);
    expect(addStatus(box, eff("haste", 1500, 0.2), 0)).toBe("full"); // trạng thái thường 1500 < 2000 (yếu nhất)
    expect(box.list.map((s) => s.id)).toEqual(ids);
    expect(addStatus(box, eff("sunder", 6000), 0)).toBe("added");
    expect(box.list).toHaveLength(MAX_STATUSES);
    expect(box.list.map((s) => s.id)).not.toContain("burn"); // burn hết sớm nhất nên bị đẩy
    expect(box.list.map((s) => s.id)).toContain("sunder");
    // cùng loại vẫn làm mới được khi đã đủ (không bị coi là "đầy")
    expect(addStatus(box, eff("poison", 9000), 0)).toBe("refreshed");
    expect(box.list).toHaveLength(MAX_STATUSES);
  });

  it("trạng thái hết hạn được dọn trước khi tính chỗ trống", () => {
    const box = newStatusBox();
    for (const id of ["burn", "poison", "bleed", "chill"] as StatusId[])
      addStatus(box, eff(id, 1000), 0);
    expect(addStatus(box, eff("sunder", 1000), 5000)).toBe("added");
    expect(box.list.map((s) => s.id)).toEqual(["sunder"]);
    expect(pruneStatuses(box, 5000)).toBe(false);
    expect(pruneStatuses(box, 6000)).toBe(true);
    expect(box.list).toEqual([]);
  });
});

describe("status-rules: choáng", () => {
  it("tối đa STUN_MAX_MS; không lặp liền nhau: miễn cả lúc đang choáng và STUN_IMMUNE_MS sau khi hết", () => {
    const box = newStatusBox();
    expect(addStatus(box, eff("stun", 99999, 0), 0)).toBe("added");
    expect(box.list[0].until).toBe(STUN_MAX_MS);
    expect(isStunned(box, STUN_MAX_MS - 1)).toBe(true);
    expect(isStunned(box, STUN_MAX_MS)).toBe(false);
    // đang choáng: không gia hạn
    expect(addStatus(box, eff("stun", 1000, 0), 500)).toBe("resisted");
    expect(box.list[0].until).toBe(STUN_MAX_MS);
    // vừa hết choáng: vẫn miễn
    expect(addStatus(box, eff("stun", 1000, 0), STUN_MAX_MS + 1)).toBe("resisted");
    expect(addStatus(box, eff("stun", 1000, 0), STUN_MAX_MS + STUN_IMMUNE_MS - 1)).toBe("resisted");
    // hết miễn thì choáng lại được
    expect(addStatus(box, eff("stun", 1000, 0), STUN_MAX_MS + STUN_IMMUNE_MS)).toBe("added");
  });

  it("trùm miễn choáng hẳn; choáng bị chặn không để lại dấu vết", () => {
    const box = newStatusBox();
    expect(addStatus(box, eff("stun", 1000, 0), 0, { stunImmune: true })).toBe("resisted");
    expect(box.list).toEqual([]);
    expect(box.stunImmuneUntil).toBe(0);
    // trạng thái khác vẫn gắn được lên trùm
    expect(addStatus(box, eff("burn", 1000), 0, { stunImmune: true, baseDmg: 10 })).toBe("added");
  });

  it("đủ 4 trạng thái dài: choáng và vỡ giáp VẪN vào được (đẩy trạng thái thường hết sớm nhất), không thành miễn choáng thực tế", () => {
    const box = newStatusBox();
    const ids: StatusId[] = ["burn", "poison", "bleed", "chill"];
    ids.forEach((id, i) => addStatus(box, eff(id, 5000 + i * 100), 0, { baseDmg: 10 })); // burn hết sớm nhất
    expect(addStatus(box, eff("stun", 1000, 0), 0)).toBe("added"); // 1 giây << 5 giây còn lại của mọi cái
    expect(isStunned(box, 500)).toBe(true);
    expect(box.stunImmuneUntil).toBe(1000 + STUN_IMMUNE_MS); // khởi động miễn choáng như mọi lần choáng thành công
    expect(box.list.map((s) => s.id)).not.toContain("burn");
    expect(box.list).toHaveLength(MAX_STATUSES);
    // vỡ giáp cũng vào, đẩy cái thường hết sớm nhất kế tiếp (poison), KHÔNG đẩy choáng
    expect(addStatus(box, eff("sunder", 1500, 0.3), 0)).toBe("added");
    const after = box.list.map((s) => s.id).sort();
    expect(after).toEqual(["bleed", "chill", "stun", "sunder"]);
  });

  it("trạng thái thường không đẩy được khống chế ra, kể cả khi sống lâu hơn; chỉ đẩy trạng thái thường yếu hơn", () => {
    const box = newStatusBox();
    addStatus(box, eff("stun", 1000, 0), 0);
    addStatus(box, eff("sunder", 1500, 0.3), 0);
    addStatus(box, eff("burn", 3000), 0, { baseDmg: 10 });
    addStatus(box, eff("poison", 4000), 0, { baseDmg: 10 });
    // bleed 8 s dài hơn cả choáng / vỡ giáp, nhưng nạn nhân phải là cái thường yếu nhất (burn 3 s)
    expect(addStatus(box, eff("bleed", 8000), 0, { baseDmg: 10 })).toBe("added");
    expect(box.list.map((s) => s.id).sort()).toEqual(["bleed", "poison", "stun", "sunder"]);
    // chill 2 s ngắn hơn cái thường yếu nhất còn lại (poison 4 s): bị bỏ, khống chế vẫn nguyên
    expect(addStatus(box, eff("chill", 2000, 0.3), 0)).toBe("full");
    expect(box.list.map((s) => s.id).sort()).toEqual(["bleed", "poison", "stun", "sunder"]);
  });

  it("choáng bị chặn (đang miễn) KHÔNG làm gì dù đủ chỗ hay không", () => {
    const box = newStatusBox();
    addStatus(box, eff("stun", 500, 0), 0);
    for (const id of ["burn", "poison", "bleed"] as StatusId[]) addStatus(box, eff(id, 5000), 0);
    expect(addStatus(box, eff("stun", 500, 0), 600)).toBe("resisted"); // còn trong 3 giây miễn
    expect(box.list.map((s) => s.id)).toContain("burn");
  });
});

describe("status-rules: nhân tốc độ, sát thương nhận, khiên, hiển thị", () => {
  it("speedMult: tăng tốc 1 + ratio, tê cóng 1 - ratio, nhân với nhau; hết hạn thì thôi", () => {
    const box = newStatusBox();
    expect(speedMult(box, 0)).toBe(1);
    addStatus(box, eff("haste", 4000, 0.5), 0);
    addStatus(box, eff("chill", 2000, 0.4), 0);
    expect(speedMult(box, 0)).toBeCloseTo(1.5 * 0.6, 9);
    expect(speedMult(box, 2000)).toBeCloseTo(1.5, 9); // chill hết
    expect(speedMult(box, 4000)).toBe(1);
  });

  it("absorbShield: trừ khiên trước, phần dư mới trừ khí huyết; khiên cạn bị xoá; khiên hết hạn không đỡ", () => {
    const box = newStatusBox();
    addStatus(box, eff("shield", 5000, 0.5), 0, { maxHp: 100 }); // khiên 50
    expect(box.list[0].pool).toBe(50);
    expect(absorbShield(box, 20, 100)).toEqual({ left: 0, changed: true });
    expect(box.list[0].pool).toBe(30);
    expect(absorbShield(box, 45, 100)).toEqual({ left: 15, changed: true });
    expect(box.list).toEqual([]); // vỡ
    expect(absorbShield(box, 10, 100)).toEqual({ left: 10, changed: false });
    addStatus(box, eff("shield", 1000, 0.5), 0, { maxHp: 100 });
    expect(absorbShield(box, 10, 1000)).toEqual({ left: 10, changed: false }); // đã hết hạn
  });

  it("khiên làm mới thì nạp lại đầy", () => {
    const box = newStatusBox();
    addStatus(box, eff("shield", 5000, 0.5), 0, { maxHp: 100 });
    absorbShield(box, 40, 0);
    expect(box.list[0].pool).toBe(10);
    expect(addStatus(box, eff("shield", 5000, 0.5), 1000, { maxHp: 100 })).toBe("refreshed");
    expect(box.list[0].pool).toBe(50);
  });

  it("maskOf chỉ gồm trạng thái CÓ HẠI còn hiệu lực; entriesOf gồm cả buff, thời gian còn lại nguyên >= 1", () => {
    const box = newStatusBox();
    addStatus(box, eff("burn", 3000), 0, { baseDmg: 10 });
    addStatus(box, eff("shield", 2000, 0.3), 0, { maxHp: 100 });
    addStatus(box, eff("stun", 500, 0), 0);
    expect(maskOf(box, 0)).toBe(1 | 32);
    expect(maskOf(box, 600)).toBe(1); // choáng hết
    expect(entriesOf(box, 1999)).toEqual([
      ["burn", 1001],
      ["shield", 1],
    ]);
    expect(entriesOf(box, 3000)).toEqual([]);
  });

  it("mọi trạng thái trong bảng đều gắn được ở trần mà không ném lỗi", () => {
    for (const def of STATUSES) {
      const box = newStatusBox();
      const r = addStatus(box, eff(def.id, def.maxMs, def.maxRatio), 0, {
        baseDmg: 50,
        maxHp: 500,
      });
      expect(r).toBe("added");
      expect(box.list[0].ratio).toBeLessThanOrEqual(def.maxRatio);
    }
  });
});

describe("applyMonsterStatus: xác suất, trùm, quái đã biến mất", () => {
  it("chance tung bằng rng; chance >= 1 không gọi rng; chance <= 0 hoặc rác không bao giờ trúng", () => {
    const { w } = makeWorld();
    const { id } = addMonster(w, "lang", 100, 100);
    const rng = vi.fn(() => 0.5);
    expect(applyMonsterStatus(w, id, eff("burn", 1000, 0.2, 0.4), 10, "a", rng)).toBe("miss");
    expect(applyMonsterStatus(w, id, eff("burn", 1000, 0.2, 0.6), 10, "a", rng)).toBe("added");
    expect(rng).toHaveBeenCalledTimes(2);
    rng.mockClear();
    expect(applyMonsterStatus(w, id, eff("poison", 1000, 0.2, 1), 10, "a", rng)).toBe("added");
    expect(rng).not.toHaveBeenCalled();
    for (const c of [0, -1, Number.NaN])
      expect(applyMonsterStatus(w, id, eff("bleed", 1000, 0.2, c), 10, "a", rng)).toBe("miss");
    expect(rng).not.toHaveBeenCalled();
  });

  it("trùm miễn choáng, quái thường bị choáng; quái không còn trong phòng thì bỏ qua", () => {
    const { w } = makeWorld();
    const boss = MONSTERS.find((m) => m.boss)!;
    const b = addMonster(w, boss.id, 100, 100);
    const n = addMonster(w, "lang", 200, 100);
    expect(applyMonsterStatus(w, b.id, eff("stun", 1000, 0), 0, "a")).toBe("resisted");
    expect(applyMonsterStatus(w, n.id, eff("stun", 1000, 0), 0, "a")).toBe("added");
    expect(applyMonsterStatus(w, "m9999", eff("stun", 1000, 0), 0, "a")).toBe("ignored");
    expect(w.statusM.has(n.id)).toBe(true);
    expect(w.statusM.has(b.id)).toBe(false);
  });
});

describe("sát thương theo giây lên quái", () => {
  /** Chạy `tickStatuses` mỗi 50 ms từ `from` tới `to` (ms, `w.now`). */
  function run(w: ReturnType<typeof makeWorld>["w"], from: number, to: number) {
    for (let t = from; t <= to; t += 50) {
      w.now = t;
      tickStatuses(w, 0.05);
    }
  }

  it("cháy 3 giây x 20 sát thương/giây: ba lần 20, ghi công cho người gây, rồi gỡ khỏi tập đang dính", () => {
    const { w, dmgs } = makeWorld();
    const a = addPlayer(w, "a");
    const { id, m, mc } = addMonster(w, "ho", a.p.x + 400, a.p.y);
    w.now = 10_000;
    expect(applyMonsterStatus(w, id, eff("burn", 3000, 0.2), 100, "a")).toBe("added"); // dps 20
    run(w, 10_000, 14_000);
    const burns = dmgs.filter((d) => d.target === id);
    expect(burns.map((d) => d.amount)).toEqual([20, 20, 20]);
    expect(m.hp).toBe(m.maxHp - 60);
    expect(mc.damageBy.get("a")).toBe(60);
    expect(mc.target).toBeNull(); // sát thương theo giây không kéo quái nhắm vào người gây
    expect(w.statusM.has(id)).toBe(false);
    expect(mc.st!.list).toEqual([]);
  });

  it("lúc hết hạn tính nốt phần lẻ (hạn 2,5 giây: 20 + 20 + 10)", () => {
    const { w, dmgs } = makeWorld();
    const a = addPlayer(w, "a");
    const { id } = addMonster(w, "ho", a.p.x + 400, a.p.y);
    w.now = 0;
    applyMonsterStatus(w, id, eff("poison", 2500, 0.2), 100, "a");
    run(w, 0, 4000);
    expect(dmgs.map((d) => d.amount)).toEqual([20, 20, 10]);
    expect(DOT_TICK_MS).toBe(1000);
  });

  it("tick bị trễ (server lag) vẫn không tính quá hạn: sát thương theo giây không vượt dps x thời lượng", () => {
    const { w, dmgs } = makeWorld();
    const a = addPlayer(w, "a");
    const { id } = addMonster(w, "ho", a.p.x + 400, a.p.y);
    w.now = 0;
    applyMonsterStatus(w, id, eff("poison", 2500, 0.2), 100, "a"); // 20 / giây x 2,5 giây = 50
    for (const t of [0, 1000, 2000, 3500]) {
      w.now = t;
      tickStatuses(w, 1);
    }
    expect(dmgs.map((d) => d.amount)).toEqual([20, 20, 10]); // tick cuối trễ 1 giây sau hạn: vẫn chỉ 10
    expect(w.statusM.size).toBe(0);
  });

  it("làm mới không cộng dồn sát thương: hai lần bỏng liền nhau vẫn một dòng sát thương theo giây", () => {
    const { w, dmgs } = makeWorld();
    const a = addPlayer(w, "a");
    const { id } = addMonster(w, "ho", a.p.x + 400, a.p.y);
    w.now = 0;
    applyMonsterStatus(w, id, eff("burn", 2000, 0.2), 100, "a");
    applyMonsterStatus(w, id, eff("burn", 2000, 0.2), 100, "a");
    run(w, 0, 3000);
    expect(dmgs.map((d) => d.amount)).toEqual([20, 20]);
  });

  it("chết vì sát thương theo giây: quái bị xoá, công tính cho người gây (nhận tu vi), tập đang dính sạch", () => {
    const { w } = makeWorld();
    const a = addPlayer(w, "a");
    const { id, m } = addMonster(w, "lang", a.p.x + 400, a.p.y);
    m.hp = 15;
    w.now = 0;
    applyMonsterStatus(w, id, eff("burn", 3000, 0.5), 100, "a"); // 50 / giây
    const exp0 = a.p.exp;
    run(w, 0, 1500);
    expect(w.state.monsters.has(id)).toBe(false);
    expect(w.mctrl.has(id)).toBe(false);
    expect(w.statusM.has(id)).toBe(false);
    expect(a.p.exp).toBeGreaterThan(exp0);
  });

  it("quái bị xoá giữa chừng (không phải do sát thương): tập đang dính tự gỡ, không ném lỗi", () => {
    const { w } = makeWorld();
    const { id } = addMonster(w, "lang", 100, 100);
    applyMonsterStatus(w, id, eff("burn", 3000, 0.2), 100, "a");
    w.state.monsters.delete(id);
    w.mctrl.delete(id);
    expect(() => tickStatuses(w, 0.05)).not.toThrow();
    expect(w.statusM.size).toBe(0);
  });

  it("tickWorld gọi tickStatuses (sát thương theo giây chạy trong vòng lặp thật)", () => {
    const { w, dmgs } = makeWorld();
    const { id, m } = addMonster(w, "ho", 100, 100);
    w.now = 0;
    applyMonsterStatus(w, id, eff("burn", 5000, 0.2), 100, "");
    const hp0 = m.hp;
    for (let t = 0; t <= 1100; t += 50) {
      w.now = t;
      tickWorld(w, 50);
    }
    expect(dmgs.some((d) => d.target === id && d.amount === 20)).toBe(true);
    expect(m.hp).toBeLessThan(hp0);
  });
});

describe("vỡ giáp, choáng, tê cóng trên quái", () => {
  it("vỡ giáp nhân sát thương nhận (cả đòn thường); không có trạng thái thì y hệt cũ", () => {
    const { w } = makeWorld();
    const { p } = addPlayer(w, "a");
    const plain = addMonster(w, "ho", p.x + 20, p.y);
    const broken = addMonster(w, "ho", p.x + 40, p.y);
    vi.spyOn(Math, "random").mockReturnValue(0.5); // không bạo kích, hệ số 1.0
    w.now = 0;
    applyMonsterStatus(w, broken.id, eff("sunder", 4000, 0.4), 0, "a");
    hitMonster(w, plain.id, plain.m, "a", p, 1);
    hitMonster(w, broken.id, broken.m, "a", p, 1);
    const atk = statsFor(0, 0).atk;
    expect(plain.m.hp).toBe(plain.m.maxHp - atk);
    expect(broken.m.hp).toBe(broken.m.maxHp - Math.round(atk * 1.4));
    // hết hạn thì thôi
    w.now = 5000;
    const before = broken.m.hp;
    hitMonster(w, broken.id, broken.m, "a", p, 1);
    expect(before - broken.m.hp).toBe(atk);
  });

  it("choáng: quái đứng im và KHÔNG ra đòn; hết choáng thì đánh lại", () => {
    const { w } = makeWorld();
    const { p } = addPlayer(w, "a");
    const { id, m } = addMonster(w, "lang", p.x + 20, p.y);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    w.now = 100_000;
    expect(applyMonsterStatus(w, id, eff("stun", 1000, 0), 0, "a")).toBe("added");
    const x0 = m.x;
    const hp0 = p.hp;
    for (let t = 100_000; t < 100_900; t += 50) {
      w.now = t;
      tickMonsters(w, 0.05);
    }
    expect(p.hp).toBe(hp0);
    expect(m.x).toBe(x0);
    w.now = 101_100; // đã hết choáng
    tickMonsters(w, 0.05);
    expect(p.hp).toBeLessThan(hp0);
  });

  it("tê cóng làm quái chậm đúng hệ số khi đuổi người chơi", () => {
    const run = (chill: boolean) => {
      const { w } = makeWorld();
      const { p } = addPlayer(w, "a");
      const { id, m, mc } = addMonster(w, "lang", p.x + 150, p.y); // trong tầm gây hấn 170
      mc.def = { ...mc.def, behavior: "melee" }; // đo tốc độ ĐUỔI: Hôi Lang nay là charger (gồng thay vì đuổi, `charge.test.ts`)
      w.now = 100_000;
      if (chill) applyMonsterStatus(w, id, eff("chill", 5000, 0.5), 0, "a");
      const x0 = m.x;
      tickMonsters(w, 0.05);
      return x0 - m.x; // quái đi về phía người (x giảm)
    };
    const normal = run(false);
    const slowed = run(true);
    expect(normal).toBeGreaterThan(0);
    expect(slowed).toBeCloseTo(normal * 0.5, 6);
  });
});

describe("trạng thái của người chơi", () => {
  it("hộ thể: gửi cho chủ, hấp thụ sát thương trước khí huyết, vỡ thì gửi danh sách rỗng", () => {
    const { w, statusMsgs } = makeWorld();
    const { p } = addPlayer(w, "a");
    const { m } = addMonster(w, "lang", p.x + 20, p.y);
    w.now = 1000;
    expect(applyPlayerStatus(w, "a", eff("shield", 8000, 0.1), 0, "a")).toBe("added");
    expect(statusMsgs).toHaveLength(1);
    expect(statusMsgs[0]).toMatchObject({ sid: "a", msg: { list: [["shield", 8000]] } });
    const shield = Math.round(0.1 * p.maxHp);
    const hp0 = p.hp;
    hurtPlayer(w, "a", p, shield - 1, m);
    expect(p.hp).toBe(hp0); // khiên đỡ hết
    expect(statusMsgs).toHaveLength(2); // khiên vơi: gửi lại
    hurtPlayer(w, "a", p, 5, m); // dư 4 so với khiên còn 1
    expect(p.hp).toBe(hp0 - 4);
    expect(statusMsgs.at(-1)!.msg.list).toEqual([]); // vỡ
    hurtPlayer(w, "a", p, 7, m);
    expect(p.hp).toBe(hp0 - 11); // hết khiên: trừ thẳng
  });

  it("khiên đỡ đòn vẫn ngắt đả tọa và đặt mốc bị đánh (không đứng đả tọa trong khi bị đánh)", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    const { m } = addMonster(w, "lang", p.x + 20, p.y);
    w.now = 5000;
    applyPlayerStatus(w, "a", eff("shield", 8000, 0.5), 0, "a");
    p.meditating = true;
    c.lastHitAt = 0;
    hurtPlayer(w, "a", p, 1, m);
    expect(p.meditating).toBe(false);
    expect(c.lastHitAt).toBe(5000);
  });

  it("hồi phục: hồi ratio x khí huyết tối đa mỗi giây, không vượt khí huyết tối đa; hết hạn gửi danh sách rỗng và gỡ khỏi tập", () => {
    const { w, statusMsgs } = makeWorld();
    const { p } = addPlayer(w, "a");
    p.hp = Math.floor(p.maxHp / 2);
    const hp0 = p.hp;
    w.now = 0;
    applyPlayerStatus(w, "a", eff("regen", 2000, 0.1), 0, "a");
    for (let t = 0; t < 1000; t += 50) {
      w.now = t;
      tickStatuses(w, 0.05);
    }
    expect(p.hp - hp0).toBeGreaterThanOrEqual(Math.floor(p.maxHp * 0.1) - 1);
    expect(p.hp - hp0).toBeLessThanOrEqual(Math.ceil(p.maxHp * 0.1) + 1);
    for (let t = 1000; t <= 2100; t += 50) {
      w.now = t;
      tickStatuses(w, 0.05);
    }
    expect(w.statusP.has("a")).toBe(false);
    expect(statusMsgs.at(-1)!.msg.list).toEqual([]);
    expect(p.hp).toBeLessThanOrEqual(p.maxHp);
    // đầy máu thì không hồi (và không ném lỗi)
    p.hp = p.maxHp;
    w.now = 3000;
    applyPlayerStatus(w, "a", eff("regen", 2000, 0.1), 0, "a");
    w.now = 3100;
    tickStatuses(w, 0.05);
    expect(p.hp).toBe(p.maxHp);
  });

  it("người gục / ở Hoàng Tuyền không nhận trạng thái; đang có mà gục thì bị xoá và chủ nhận danh sách rỗng", () => {
    const { w, statusMsgs } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    w.now = 0;
    applyPlayerStatus(w, "a", eff("haste", 5000, 0.4), 0, "a");
    expect(statusMsgs).toHaveLength(1);
    p.dead = true;
    expect(applyPlayerStatus(w, "a", eff("regen", 5000, 0.1), 0, "a")).toBe("ignored");
    tickStatuses(w, 0.05);
    expect(c.st!.list).toEqual([]);
    expect(w.statusP.size).toBe(0);
    expect(statusMsgs.at(-1)!.msg.list).toEqual([]);
    expect(applyPlayerStatus(w, "nobody", eff("regen", 5000, 0.1), 0, "a")).toBe("ignored");
  });

  it("clearPlayerStatus không gửi gì khi không có trạng thái nào", () => {
    const { w, statusMsgs } = makeWorld();
    addPlayer(w, "a");
    clearPlayerStatus(w, "a");
    expect(statusMsgs).toEqual([]);
  });

  it("người chơi rời phòng giữa chừng: tập đang dính tự gỡ", () => {
    const { w } = makeWorld();
    addPlayer(w, "a");
    applyPlayerStatus(w, "a", eff("haste", 5000, 0.4), 0, "a");
    w.ctrl.delete("a");
    w.state.players.delete("a");
    expect(() => tickStatuses(w, 0.05)).not.toThrow();
    expect(w.statusP.size).toBe(0);
  });
});

describe("không tốn gì khi không ai dính trạng thái", () => {
  it("hai tập rỗng: tickStatuses không đụng tới quái / người chơi; quái chưa từng dính thì không có `st`", () => {
    const { w } = makeWorld();
    const { mc } = addMonster(w, "lang", 100, 100);
    addPlayer(w, "a");
    expect(w.statusM.size + w.statusP.size).toBe(0);
    tickStatuses(w, 0.05);
    expect(mc.st).toBeUndefined();
    expect(MONSTER_BY_ID.lang).toBeDefined();
  });
});

describe("tốc độ và choáng của người chơi (khớp hàm dùng chung `moveSpeedMul`)", () => {
  /** Một bước di chuyển sang phải: gửi `n` input rồi áp; trả quãng đường đi được. */
  function walk(w: ReturnType<typeof makeWorld>["w"], sid: string, n = 1) {
    const { p, c } = w.ready(sid)!;
    const x0 = p.x;
    for (let i = 1; i <= n; i++) queueInput(w, sid, { seq: p.lastSeq + 1 + i, dx: 1, dy: 0 });
    c.moveBudget = 4;
    applyInputs(w.map, p, c);
    return p.x - x0;
  }

  it("entriesOf: CHỈ tăng tốc / tê cóng mang ratio (phần tử thứ ba); loại khác chỉ [id, ms]", () => {
    const box = newStatusBox();
    addStatus(box, eff("haste", 4000, 0.35), 0);
    addStatus(box, eff("chill", 4000, 0.3), 0);
    addStatus(box, eff("shield", 4000, 0.5), 0, { maxHp: 100 });
    addStatus(box, eff("regen", 4000, 0.1), 0);
    const e = entriesOf(box, 0);
    expect(e.find((x) => x[0] === "haste")).toEqual(["haste", 4000, 0.35]);
    expect(e.find((x) => x[0] === "chill")).toEqual(["chill", 4000, 0.3]);
    expect(e.find((x) => x[0] === "shield")).toEqual(["shield", 4000]);
    expect(e.find((x) => x[0] === "regen")).toEqual(["regen", 4000]);
  });

  it("tin gửi cho chủ có ratio; nhận qua sanitizeStatusList (như client) ra ĐÚNG hệ số server dùng", () => {
    const { w, statusMsgs } = makeWorld();
    const { c } = addPlayer(w, "a");
    w.now = 1000;
    applyPlayerStatus(w, "a", eff("haste", 5000, 0.4), 0, "a");
    applyPlayerStatus(w, "a", eff("chill", 3000, 0.3), 0, "a");
    const list = statusMsgs.at(-1)!.msg.list;
    expect(list).toContainEqual(["haste", 5000, 0.4]);
    const clientMul = moveSpeedMul(sanitizeStatusList(JSON.parse(JSON.stringify(list))));
    expect(c.moveMul).toBeCloseTo(clientMul, 12); // cùng danh sách -> cùng số ở hai phía
    expect(clientMul).toBeCloseTo(1.4 * 0.7, 12);
  });

  it("làm mới bằng chiêu MẠNH hơn: gửi lại danh sách với ratio mới và hệ số mới (không chỉ lúc thêm / mất)", () => {
    const { w, statusMsgs } = makeWorld();
    const { c } = addPlayer(w, "a");
    w.now = 0;
    applyPlayerStatus(w, "a", eff("haste", 4000, 0.2), 0, "a");
    const n0 = statusMsgs.length;
    applyPlayerStatus(w, "a", eff("haste", 4000, 0.5), 0, "a");
    expect(statusMsgs.length).toBe(n0 + 1);
    expect(statusMsgs.at(-1)!.msg.list).toContainEqual(["haste", 4000, 0.5]);
    expect(c.moveMul).toBeCloseTo(1.5, 12);
    // chiêu yếu hơn không kéo cường độ xuống
    applyPlayerStatus(w, "a", eff("haste", 4000, 0.1), 0, "a");
    expect(c.moveMul).toBeCloseTo(1.5, 12);
  });

  it("applyInputs nhân tốc độ: tăng tốc đi xa hơn đúng hệ số, tê cóng chậm hơn, hết hạn thì về bình thường", () => {
    const { w } = makeWorld();
    addPlayer(w, "a");
    const base = walk(w, "a");
    expect(base).toBeGreaterThan(0);
    w.now = 0;
    applyPlayerStatus(w, "a", eff("haste", 2000, 0.5), 0, "a");
    expect(walk(w, "a")).toBeCloseTo(base * 1.5, 6);
    applyPlayerStatus(w, "a", eff("chill", 2000, 0.5), 0, "a");
    expect(walk(w, "a")).toBeCloseTo(base * 1.5 * 0.5, 6);
    w.now = 2100;
    tickStatuses(w, 0.05); // hết hạn: dọn, tính lại bản nhớ
    expect(w.ctrl.get("a")!.moveMul).toBeUndefined();
    expect(walk(w, "a")).toBeCloseTo(base, 6);
    expect(TICK_MS).toBeGreaterThan(0);
  });

  it("choáng: input vẫn được TIÊU THỤ và lastSeq tăng (chỉ không di chuyển); hết choáng thì đi lại", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    w.now = 0;
    expect(applyPlayerStatus(w, "a", eff("stun", 1000, 0), 0, "a")).toBe("added");
    expect(c.stunned).toBe(true);
    const x0 = p.x;
    for (let i = 1; i <= 3; i++) queueInput(w, "a", { seq: i, dx: 1, dy: 0 });
    c.moveBudget = 4;
    applyInputs(w.map, p, c);
    expect(p.x).toBe(x0); // đứng yên
    expect(c.inputs.length).toBe(0); // hàng đợi rỗng
    expect(p.lastSeq).toBe(3); // đã xác nhận
    w.now = 1100;
    tickStatuses(w, 0.05);
    expect(c.stunned).toBeUndefined();
    queueInput(w, "a", { seq: 4, dx: 1, dy: 0 });
    c.moveBudget = 4;
    applyInputs(w.map, p, c);
    expect(p.x).toBeGreaterThan(x0);
    expect(p.lastSeq).toBe(4);
  });

  it("chết hoặc bị xoá trạng thái thì bản nhớ tốc độ / choáng về mặc định", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    w.now = 0;
    applyPlayerStatus(w, "a", eff("haste", 5000, 0.5), 0, "a");
    applyPlayerStatus(w, "a", eff("stun", 1000, 0), 0, "a");
    expect(c.moveMul).toBeCloseTo(1.5, 12);
    expect(c.stunned).toBe(true);
    p.dead = true;
    tickStatuses(w, 0.05);
    expect(c.moveMul).toBeUndefined();
    expect(c.stunned).toBeUndefined();
  });

  it("hồn lìa xác (rớt mạng chờ nối lại) không được hồi phục từ trạng thái hồi phục", () => {
    const { w } = makeWorld();
    const { p } = addPlayer(w, "a");
    p.hp = 10;
    w.now = 0;
    applyPlayerStatus(w, "a", eff("regen", 5000, 0.15), 0, "a");
    w.ghosts.add("a");
    for (let t = 0; t < 1000; t += 50) {
      w.now = t;
      tickStatuses(w, 0.05);
    }
    expect(p.hp).toBe(10);
  });
});

describe("Monster.fx: mặt nạ bit trạng thái có hại công khai (M7.3, #504 / M7.7 #508)", () => {
  /** Chạy `tickStatuses` mỗi 50 ms từ `from` tới `to` (ms, `w.now`). */
  function run(w: ReturnType<typeof makeWorld>["w"], from: number, to: number) {
    for (let t = from; t <= to; t += 50) {
      w.now = t;
      tickStatuses(w, 0.05);
    }
  }

  it("quái mới sinh: fx = 0, elite = 0 (không tốn byte)", () => {
    const { w } = makeWorld();
    const { m } = addMonster(w, "lang", 100, 100);
    expect(m.fx).toBe(0);
    expect(m.elite).toBe(0);
  });

  it("gắn trạng thái có hại thì bật đúng bit (bỏng 1, độc 2, tê cóng 8, choáng 32), gắn thêm thì cộng bit", () => {
    const { w } = makeWorld();
    const { id, m } = addMonster(w, "lang", 100, 100);
    w.now = 10_000;
    applyMonsterStatus(w, id, eff("burn", 5000, 0.1), 10, "a");
    expect(m.fx).toBe(1);
    applyMonsterStatus(w, id, eff("poison", 5000, 0.1), 10, "a");
    expect(m.fx).toBe(1 | 2);
    applyMonsterStatus(w, id, eff("chill", 5000, 0.3), 0, "a");
    applyMonsterStatus(w, id, eff("stun", 1000, 0), 0, "a");
    expect(m.fx).toBe(1 | 2 | 8 | 32);
    expect(m.fx).toBe(maskOf(w.mctrl.get(id)!.st!, w.now));
  });

  it("hết hạn từng trạng thái thì tắt đúng bit đó; hết sạch thì về 0 (kể cả lần dọn cuối trước khi rời tập theo dõi)", () => {
    const { w } = makeWorld();
    const { id, m } = addMonster(w, "lang", 100, 100);
    w.now = 10_000;
    applyMonsterStatus(w, id, eff("chill", 2000, 0.3), 0, "a"); // bit 8, hết lúc 12_000
    applyMonsterStatus(w, id, eff("stun", 800, 0), 0, "a"); // bit 32, hết lúc 10_800
    expect(m.fx).toBe(8 | 32);
    run(w, 10_000, 11_000);
    expect(m.fx).toBe(8); // choáng đã hết
    run(w, 11_050, 12_200);
    expect(m.fx).toBe(0); // tê cóng hết: huy hiệu cuối cùng được bỏ
    expect(w.statusM.has(id)).toBe(false);
  });

  it("làm mới trạng thái không đổi mặt nạ; buff (có lợi) và trùm miễn choáng không lên quái", () => {
    const { w } = makeWorld();
    const boss = MONSTERS.find((m) => m.boss)!;
    const a = addMonster(w, "lang", 100, 100);
    const b = addMonster(w, boss.id, 400, 100);
    w.now = 10_000;
    applyMonsterStatus(w, a.id, eff("burn", 3000, 0.1), 10, "x");
    applyMonsterStatus(w, a.id, eff("burn", 6000, 0.2), 10, "x");
    expect(a.m.fx).toBe(1);
    applyMonsterStatus(w, a.id, eff("haste", 3000, 0.3), 0, "x"); // buff
    expect(a.m.fx).toBe(1);
    expect(applyMonsterStatus(w, b.id, eff("stun", 1000, 0), 0, "x")).toBe("resisted");
    expect(b.m.fx).toBe(0);
  });
});

describe("sát thương THEO GIÂY lên người chơi (M7.3, #504: độc / bỏng / chảy máu)", () => {
  /** Chạy `tickStatuses` mỗi 50 ms từ `from` tới `to` (ms, `w.now`). */
  function run(w: ReturnType<typeof makeWorld>["w"], from: number, to: number) {
    for (let t = from; t <= to; t += 50) {
      w.now = t;
      tickStatuses(w, 0.05);
    }
  }
  const dotsOf = (dmgs: ReturnType<typeof makeWorld>["dmgs"], sid: string) =>
    dmgs.filter((d) => d.target === sid && d.toPlayer).map((d) => d.amount);

  it("độc 3 giây x 20 sát thương/giây: ba lần 20 (gửi `dmg` cho người), khí huyết giảm 60, rồi gỡ trạng thái và gửi danh sách rỗng", () => {
    const { w, dmgs, statusMsgs } = makeWorld();
    const { p } = addPlayer(w, "a");
    w.now = 10_000;
    const hp0 = p.hp;
    expect(applyPlayerStatus(w, "a", eff("poison", 3000, 0.2), 100, "")).toBe("added"); // dps 20
    run(w, 10_000, 14_000);
    expect(dotsOf(dmgs, "a")).toEqual([20, 20, 20]);
    expect(p.hp).toBe(hp0 - 60);
    expect(w.statusP.has("a")).toBe(false);
    expect(statusMsgs.at(-1)!.msg.list).toEqual([]);
  });

  it("bỏng và chảy máu cùng lúc cộng sát thương; tê cóng (không phải sát thương theo giây) KHÔNG làm mất khí huyết", () => {
    const { w } = makeWorld();
    const { p } = addPlayer(w, "a");
    w.now = 10_000;
    const hp0 = p.hp;
    applyPlayerStatus(w, "a", eff("burn", 2000, 0.1), 100, ""); // 10 / giây
    applyPlayerStatus(w, "a", eff("bleed", 2000, 0.3), 100, ""); // 30 / giây
    applyPlayerStatus(w, "a", eff("chill", 2000, 0.3), 100, "");
    run(w, 10_000, 13_000);
    expect(p.hp).toBe(hp0 - 80); // (10 + 30) x 2 giây
  });

  it("phần lẻ dồn lại: 0,4 sát thương/giây x 2,5 giây gây ĐÚNG 1 (không mất, không thừa)", () => {
    const { w, dmgs } = makeWorld();
    const { p } = addPlayer(w, "a");
    w.now = 10_000;
    const hp0 = p.hp;
    applyPlayerStatus(w, "a", eff("poison", 2500, 0.004), 100, ""); // dps 0,4
    run(w, 10_000, 13_000);
    // phần lẻ KHÔNG mất / thừa: 0,4 x 2,5 giây = 1 sát thương ĐÚNG MỘT lần (tính nốt lúc hết hạn), không phải mỗi giây một lần
    const hits = dotsOf(dmgs, "a");
    expect(hits).toEqual([1]);
    expect(p.hp).toBe(hp0 - hits.length);
  });

  it("thách đấu bất tử trước sát thương theo giây; gọi `hurtPlayerDot` thẳng lên người đã gục không trừ tiếp (review B ở #567)", () => {
    const duel = makeWorld();
    const a = addPlayer(duel.w, "a");
    duel.w.now = 10_000;
    const hp0 = a.p.hp;
    applyPlayerStatus(duel.w, "a", eff("poison", 3000, 0.2), 100, "");
    vi.spyOn(duel.w.duels, "has").mockImplementation((sid: string) => sid === "a");
    run(duel.w, 10_000, 14_000);
    expect(a.p.hp).toBe(hp0);

    const dead = makeWorld();
    const d = addPlayer(dead.w, "d");
    d.p.dead = true;
    const hpd = d.p.hp;
    hurtPlayerDot(dead.w, "d", d.p, 10, "Độc");
    expect(d.p.hp).toBe(hpd);
  });

  it("tick bị trễ (server lag) vẫn không tính quá hạn: độc 1,5 giây x 20/giây gây đúng 30 dù tick kế tới muộn 10 giây", () => {
    const { w, dmgs } = makeWorld();
    const { p } = addPlayer(w, "a");
    w.now = 10_000;
    const hp0 = p.hp;
    applyPlayerStatus(w, "a", eff("poison", 1500, 0.2), 100, "");
    w.now = 20_000; // một tick duy nhất, muộn xa quá hạn
    tickStatuses(w, 0.05);
    expect(dotsOf(dmgs, "a")).toEqual([30]);
    expect(p.hp).toBe(hp0 - 30);
  });

  it("chiêu né (`dodgeUntil`) KHÔNG tránh được: sát thương theo giây không phải một đòn", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    w.now = 10_000;
    c.dodgeUntil = 99_000;
    const hp0 = p.hp;
    applyPlayerStatus(w, "a", eff("poison", 2000, 0.2), 100, "");
    run(w, 10_000, 12_500);
    expect(p.hp).toBeLessThan(hp0);
  });

  it("hộ thể đỡ sát thương theo giây trước khí huyết; hồn lìa xác bất tử", () => {
    const shielded = makeWorld();
    const a = addPlayer(shielded.w, "a");
    shielded.w.now = 10_000;
    const hp0 = a.p.hp;
    applyPlayerStatus(shielded.w, "a", eff("shield", 8000, 0.5), 0, ""); // khiên 50 % khí huyết tối đa (50, đúng trần) > 40 sát thương
    applyPlayerStatus(shielded.w, "a", eff("poison", 2000, 0.2), 100, ""); // 2 giây x 20 = 40
    run(shielded.w, 10_000, 14_000);
    expect(a.p.hp).toBe(hp0); // khiên đỡ hết 40

    const ghostly = makeWorld();
    const g = addPlayer(ghostly.w, "g");
    ghostly.w.now = 10_000;
    const hpg = g.p.hp;
    applyPlayerStatus(ghostly.w, "g", eff("poison", 3000, 0.2), 100, "");
    ghostly.w.ghosts.add("g");
    run(ghostly.w, 10_000, 14_000);
    expect(g.p.hp).toBe(hpg);
  });

  it("ngắt đả tọa và đặt mốc bị đánh (như một đòn)", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    w.now = 10_000;
    applyPlayerStatus(w, "a", eff("burn", 3000, 0.2), 100, "");
    p.meditating = true;
    c.lastHitAt = 0;
    run(w, 10_000, 11_100);
    expect(p.meditating).toBe(false);
    expect(c.lastHitAt).toBeGreaterThan(10_000);
  });

  it("chết vì sát thương theo giây: ngoài luân hồi thì ngã với thông báo nêu tên trạng thái, dọn trạng thái ở tick sau; trong luân hồi thì vào Hoàng Tuyền", () => {
    const down = makeWorld();
    const a = addPlayer(down.w, "a");
    down.w.now = 10_000;
    a.p.hp = 15;
    applyPlayerStatus(down.w, "a", eff("poison", 5000, 0.2), 100, ""); // 20 / giây
    run(down.w, 10_000, 11_100);
    expect(a.p.hp).toBe(0);
    expect(a.p.dead).toBe(true);
    expect(down.toasts.some((t) => t.sid === "a" && t.msg.text.includes("Độc"))).toBe(true);
    run(down.w, 11_150, 11_300);
    expect(down.w.statusP.has("a")).toBe(false); // người gục: trạng thái được dọn, không tiếp tục trừ
    expect(down.dmgs.filter((d) => d.target === "a" && d.toPlayer)).toHaveLength(1);

    const limbo = makeWorld();
    limbo.w.reincarnate = true;
    const b = addPlayer(limbo.w, "b");
    limbo.w.now = 10_000;
    b.p.hp = 15;
    applyPlayerStatus(limbo.w, "b", eff("burn", 5000, 0.2), 100, "");
    run(limbo.w, 10_000, 11_100);
    expect(b.c.limbo).toBeDefined(); // chết thật = Hoàng Tuyền (cùng đường với đòn quái)
  });
});

describe("takeDotDamage: sát thương theo giây không mất / thừa phần lẻ (review B ở #567)", () => {
  const dot = (dps: number, from: number, ms: number): StatusInst => ({
    id: "poison",
    until: from + ms,
    ratio: 0.1,
    dps,
    pool: 0,
    last: from,
    src: "",
  });

  /** Chạy mỗi 50 ms tới sau hạn, trả danh sách các lần gây. */
  function simulate(s: StatusInst, from: number): number[] {
    const hits: number[] = [];
    for (let t = from; t <= s.until + 1000; t += 50) {
      const d = takeDotDamage(s, t);
      if (d > 0) hits.push(d);
    }
    return hits;
  }

  it("chưa tới nhịp 1 giây hoặc dps <= 0 / rác: 0 và KHÔNG đổi `last`", () => {
    const s = dot(20, 10_000, 5000);
    expect(takeDotDamage(s, 10_999)).toBe(0);
    expect(s.last).toBe(10_000);
    for (const dps of [0, -3, Number.NaN]) {
      const z = dot(dps, 10_000, 5000);
      expect(takeDotDamage(z, 12_000)).toBe(0);
      expect(z.last).toBe(10_000);
    }
  });

  it("tới nhịp thì lấy phần NGUYÊN và đẩy `last` đúng thời gian của phần nguyên đó (dps 1,4: 1 sát thương = 714,3 ms), phần dư ở lại cho lần sau", () => {
    const s = dot(1.4, 10_000, 10_000);
    expect(takeDotDamage(s, 11_000)).toBe(1); // dồn 1,4 -> lấy 1
    expect(s.last).toBeCloseTo(10_000 + 1000 / 1.4, 6); // KHÔNG nhảy tới 11_000: 0,4 phần dư còn trong last..now
    expect(takeDotDamage(s, 11_100)).toBe(0); // chưa tới nhịp kể từ last mới
    // không gây TRƯỚC khi dồn đủ: dps 0,6 sau 1 giây mới dồn 0,6 (< 1) nên chưa gây (round sẽ gây sớm 1 và bù trừ về sau)
    const slow = dot(0.6, 10_000, 10_000);
    expect(takeDotDamage(slow, 11_000)).toBe(0);
    expect(slow.last).toBe(10_000);
    expect(takeDotDamage(slow, 12_000)).toBe(1); // 1,2 dồn -> lấy 1
  });

  it("TỔNG sát thương cả đời = round(dps x thời lượng) với mọi dps nhỏ (trước đây round mỗi giây lệch tới +-30-100 %)", () => {
    for (const dps of [0.3, 0.4, 0.7, 1.4, 1.5, 2.6, 7.3, 20, 33.3]) {
      for (const ms of [800, 1500, 2500, 4000, 7000]) {
        const s = dot(dps, 50_000, ms);
        const total = simulate(s, 50_000).reduce((a, b) => a + b, 0);
        const exact = (dps * ms) / 1000;
        // nửa đúng (x,5) có thể làm tròn lệch 1 do sai số số thực: bỏ qua các ca sát nửa
        if (Math.abs(exact - Math.floor(exact) - 0.5) < 1e-6) continue;
        expect(total, `dps ${dps} x ${ms} ms (chính xác ${exact})`).toBe(Math.round(exact));
      }
    }
  });

  it("tick trễ 10 giây vẫn kẹp ở `until` (không tính quá hạn) và chốt `last = until`", () => {
    const s = dot(20, 10_000, 1500);
    expect(takeDotDamage(s, 20_000)).toBe(30);
    expect(s.last).toBe(11_500);
    expect(takeDotDamage(s, 21_000)).toBe(0); // đã chốt: không gây lại
  });
});
