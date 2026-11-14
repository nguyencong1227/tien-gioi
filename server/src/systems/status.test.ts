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
  statsFor,
  type SkillEffect,
  type StatusId,
} from "@tien-gioi/shared";
import { hitMonster, hurtPlayer } from "./combat";
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
  takenMult,
} from "./status-rules";
import {
  DOT_TICK_MS,
  applyMonsterStatus,
  applyPlayerStatus,
  clearPlayerStatus,
  tickStatuses,
} from "./status";
import { tickWorld } from "./tick";
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
    expect(addStatus(box, eff("sunder", 1500), 0)).toBe("full"); // 1500 < 2000 (yếu nhất)
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

  it("choáng bị đẩy ra vì đủ trạng thái thì KHÔNG khởi động miễn choáng (chưa gắn được)", () => {
    const box = newStatusBox();
    for (const id of ["burn", "poison", "bleed", "chill"] as StatusId[])
      addStatus(box, eff(id, 5000), 0);
    expect(addStatus(box, eff("stun", 1000, 0), 0)).toBe("full");
    expect(box.stunImmuneUntil).toBe(0);
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
      const { id, m } = addMonster(w, "lang", p.x + 150, p.y); // trong tầm gây hấn 170
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
