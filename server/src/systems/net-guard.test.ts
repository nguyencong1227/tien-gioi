// Bảo vệ tính mạng khi MẤT KẾT NỐI (QUYET_DINH_M3 mục 33, docs/THIET_KE_MAT_KET_NOI.md): im lặng quá 3 giây -> hồn lìa xác dù socket còn mở; có tin lại -> hộ thể 3 giây + quái
// mất mục tiêu; bị hạ khi đã im lặng >= 2 giây -> tha chết (không mất kiếp); client cũ (không khai nhịp) giữ hành vi cũ; thách đấu mà một bên im lặng thì huỷ (hoà).
// World giả, đồng hồ `w.now` điều khiển tay (không ngủ thật).
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAP,
  NET_SHIELD_MS,
  NET_SILENCE_GHOST_MS,
  NET_SPARE_HP_PCT,
  NET_SPARE_SILENCE_MS,
} from "@tien-gioi/shared";
import { Hub } from "../hub";
import { hurtPlayer, hurtPlayerDot } from "./combat";
import { tickDuels, duelAnswer, duelChallenge } from "./duel";
import { heard, isShielded, reconnected, silenceMs, tickNetGuard } from "./net-guard";
import { tickMonsters } from "./monsters";
import { tickWorld } from "./tick";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";
import type { World } from "../world";

const T0 = 1_700_000_000_000;

function setup(opts: { beat?: boolean } = {}) {
  const t = makeWorld(DEFAULT_MAP, new Hub());
  const audits: { ev: string; f: Record<string, unknown> }[] = [];
  t.w.audit = (ev, f) => audits.push({ ev, f: f as Record<string, unknown> });
  t.w.now = T0;
  const { p, c } = addPlayer(t.w, "a", 1, 8);
  if (opts.beat !== false) {
    c.beatMs = 1000;
    c.lastHeardAt = T0;
  }
  return { ...t, p, c, audits };
}
type S = ReturnType<typeof setup>;

/** Tiến đồng hồ `ms` rồi chạy một tick (dt 50 ms). */
function advance(w: World, ms: number) {
  w.now += ms;
  tickWorld(w, 50);
}
/** Tiến đồng hồ `ms` theo bước 100 ms, MỖI bước client vẫn gửi tin (còn sống, không im lặng). */
function advanceAlive(s: S, ms: number) {
  for (let t = 0; t < ms; t += 100) {
    s.w.now += 100;
    s.c.lastHeardAt = s.w.now;
    tickWorld(s.w, 50);
  }
}
const lethal = (s: S) => hurtPlayer(s.w, "a", s.p, 1e6, { kind: "lang" });
const shields = (s: S) => s.netShields.filter((x) => x.sid === "a");

describe("im lặng -> hồn lìa xác (dù socket còn mở)", () => {
  it("im lặng <= 3 giây: chưa sao; vượt 3 giây: hồn lìa xác NGAY (bất tử, quái bỏ mục tiêu, bỏ input, ghi nhật ký, đếm số đo)", () => {
    const s = setup();
    const { mc } = addMonster(s.w, "lang", s.p.x + 30, s.p.y);
    mc.target = "a";
    s.c.inputs.push({ seq: 1, dx: 1, dy: 0 });
    advance(s.w, NET_SILENCE_GHOST_MS); // đúng 3 giây: chưa quá
    expect(s.w.ghosts.has("a")).toBe(false);
    expect(s.c.silent).toBeFalsy();
    advance(s.w, 100); // 3,1 giây
    expect(s.w.ghosts.has("a")).toBe(true);
    expect(s.c.silent).toBe(true);
    expect(mc.target).toBeNull();
    expect(s.c.inputs).toHaveLength(0);
    expect(s.w.netStats.silent).toBe(1);
    expect(s.audits.find((a) => a.ev === "net.silent")?.f).toMatchObject({
      name: "a",
      aggro: 0, // `forgetTarget` chạy TRƯỚC khi ghi nhật ký: không còn quái nào nhắm
    });
  });

  it("hồn lìa xác vì im lặng: không bị đánh, không bị sát thương theo giây, quái không nhắm lại, không bị PK", () => {
    const s = setup();
    const { mc, m } = addMonster(s.w, "lang", s.p.x + 20, s.p.y);
    advance(s.w, NET_SILENCE_GHOST_MS + 100);
    const hp = s.p.hp;
    expect(hurtPlayer(s.w, "a", s.p, 50, m)).toBe(false);
    hurtPlayerDot(s.w, "a", s.p, 30);
    expect(s.p.hp).toBe(hp);
    for (let i = 0; i < 5; i++) tickMonsters(s.w, 0.05);
    expect(mc.target).toBeNull(); // quái không thấy hồn lìa xác
  });

  it("client CŨ (không khai nhịp) KHÔNG bị áp luật im lặng dù 60 giây không có tin", () => {
    const s = setup({ beat: false });
    advance(s.w, 60_000);
    expect(s.w.ghosts.has("a")).toBe(false);
    expect(s.c.silent).toBeFalsy();
    expect(silenceMs(s.w, s.c)).toBe(0);
    expect(s.audits).toEqual([]);
  });

  it("bỏ qua người đang qua cổng và hồn lìa xác THẬT (đã rớt socket): không ghi nhật ký im lặng, không đổi cờ", () => {
    const s = setup();
    s.c.travelling = true;
    advance(s.w, 10_000);
    expect(s.w.ghosts.has("a")).toBe(false);
    s.c.travelling = false;
    s.w.ghosts.add("a"); // rớt socket thật (WorldRoom.onLeave)
    advance(s.w, 10_000);
    expect(s.c.silent).toBeFalsy();
    expect(s.audits.some((a) => a.ev === "net.silent")).toBe(false);
  });

  it("thách đấu: một bên im lặng quá 3 giây thì huỷ trận (HOÀ, lý do disconnect), không ai thắng / thua", () => {
    const t = makeWorld(DEFAULT_MAP, new Hub());
    t.w.now = T0;
    const A = addPlayer(t.w, "Alpha", 1, 8);
    const B = addPlayer(t.w, "Bravo", 1, 8);
    B.p.x = A.p.x + 45;
    B.p.y = A.p.y;
    for (const r of [A, B]) {
      r.c.beatMs = 1000;
      r.c.lastHeardAt = T0;
    }
    duelChallenge(t.w, "Alpha", { name: "Bravo" });
    duelAnswer(t.w, "Bravo", { from: "Alpha" }, true);
    expect(t.w.duels.of("Alpha")).toBeDefined();
    // Alpha vẫn gửi tin, Bravo im lặng
    t.w.now += 1500;
    A.c.lastHeardAt = t.w.now;
    t.w.now += 1700; // Bravo im lặng 3,2 giây
    A.c.lastHeardAt = t.w.now;
    tickWorld(t.w, 50);
    tickDuels(t.w);
    expect(t.w.ghosts.has("Bravo")).toBe(true);
    expect(t.duelEnds.length).toBeGreaterThan(0);
    expect(t.duelEnds.every((e) => e.msg.result === "draw" && e.msg.reason === "disconnect")).toBe(
      true,
    );
    expect(t.w.duels.of("Alpha")).toBeUndefined();
  });
});

describe("có tin lại / nối lại: hộ thể 3 giây + quái mất mục tiêu", () => {
  it("có tin lại sau im lặng: ra khỏi hồn lìa xác, hộ thể NET_SHIELD_MS (bất tử), quái bỏ mục tiêu và không nhắm lại trong lúc hộ thể; hết hạn thì thường lại", () => {
    const s = setup();
    const { mc, m } = addMonster(s.w, "lang", s.p.x + 20, s.p.y);
    advance(s.w, NET_SILENCE_GHOST_MS + 500);
    expect(s.c.silent).toBe(true);
    s.w.now += 100;
    heard(s.w, "a", s.c, s.w.now);
    expect(s.w.ghosts.has("a")).toBe(false);
    expect(s.c.silent).toBe(false);
    expect(isShielded(s.w, "a")).toBe(true);
    expect(shields(s)).toEqual([{ sid: "a", msg: { ms: NET_SHIELD_MS, reason: "resume" } }]);
    expect(s.audits.find((a) => a.ev === "net.resume")?.f).toMatchObject({ kind: "silence" });
    // trong hộ thể: không mất máu, quái không nhắm
    mc.target = "a";
    advanceAlive(s, 1000);
    expect(s.w.now - (s.c.shieldUntil ?? 0) < 0).toBe(true); // còn hộ thể (1,0 giây < 3 giây)
    expect(hurtPlayer(s.w, "a", s.p, 50, m)).toBe(false);
    expect(mc.target).toBeNull();
    // hết hạn
    advanceAlive(s, NET_SHIELD_MS + 100);
    expect(isShielded(s.w, "a")).toBe(false);
    expect(hurtPlayer(s.w, "a", s.p, 50, m)).toBe(true);
  });

  it("nối lại sau rớt socket thật: hết hồn lìa xác, hộ thể + gửi netShield, mốc nghe làm mới, quái mất mục tiêu, máu giữ nguyên", () => {
    const s = setup();
    const { mc } = addMonster(s.w, "lang", s.p.x + 20, s.p.y);
    mc.target = "a";
    s.p.hp = 77;
    s.w.ghosts.add("a"); // WorldRoom.onLeave
    reconnected(s.w, "a", s.c, 25_000);
    expect(s.w.ghosts.has("a")).toBe(false);
    expect(isShielded(s.w, "a")).toBe(true);
    expect(mc.target).toBeNull();
    expect(s.p.hp).toBe(77);
    expect(shields(s)[0].msg.reason).toBe("resume");
    expect(s.audits.find((a) => a.ev === "net.resume")?.f).toMatchObject({
      kind: "reconnect",
      silentMs: 25_000,
    });
  });

  it("tin bình thường (chưa im lặng): chỉ làm mới mốc, KHÔNG hộ thể, không nhật ký", () => {
    const s = setup();
    advance(s.w, 1500);
    heard(s.w, "a", s.c, s.w.now);
    expect(s.c.lastHeardAt).toBe(s.w.now);
    expect(isShielded(s.w, "a")).toBe(false);
    expect(s.netShields).toHaveLength(0);
    expect(s.audits).toEqual([]);
    // im lặng được tính lại từ mốc mới
    advance(s.w, 2500);
    expect(s.w.ghosts.has("a")).toBe(false);
  });
});

describe("tha chết do mạng (bị hạ khi client đã im lặng >= 2 giây)", () => {
  it("im lặng 2,5 giây (chưa tới 3 giây nên chưa ghost) rồi bị đòn kết liễu: KHÔNG chết thật, KHÔNG Hoàng Tuyền; hồi ở điểm an toàn với 10 % khí huyết, hộ thể spared, nhật ký", () => {
    const s = setup();
    s.w.reincarnate = true; // luân hồi BẬT: chết thật sẽ vào Hoàng Tuyền
    const { m } = addMonster(s.w, "lang", s.p.x + 20, s.p.y);
    s.w.now += 2500;
    const kiep = s.c.lifeId;
    expect(lethal(s)).toBe(true);
    expect(s.p.dead).toBe(false);
    expect(s.c.limbo).toBeUndefined();
    expect(s.c.lifeId).toBe(kiep);
    expect(s.p.hp).toBe(Math.max(1, Math.round(s.p.maxHp * NET_SPARE_HP_PCT)));
    expect(s.w.map.inSafe(s.p.x, s.p.y)).toBe(true);
    expect(s.netShields.at(-1)?.msg).toEqual({ ms: NET_SHIELD_MS, reason: "spared" });
    expect(s.toasts.at(-1)?.msg.text).toMatch(/được tha chết/);
    expect(s.w.netStats.spared).toBe(1);
    expect(s.audits.find((a) => a.ev === "net.spared")?.f).toMatchObject({
      name: "a",
      silentMs: 2500,
    });
    // trong hộ thể: đòn tiếp theo cũng không làm gì
    expect(hurtPlayer(s.w, "a", s.p, 1e6, m)).toBe(false);
    expect(s.p.dead).toBe(false);
  });

  it("đối chứng: im lặng < 2 giây thì CHẾT THẬT như thường (vào Hoàng Tuyền); client cũ cũng vậy", () => {
    const s = setup();
    s.w.reincarnate = true;
    addMonster(s.w, "lang", s.p.x + 20, s.p.y);
    s.w.now += NET_SPARE_SILENCE_MS - 1;
    lethal(s);
    expect(s.c.limbo).toBeDefined();
    expect(s.audits.some((a) => a.ev === "net.spared")).toBe(false);
    const old = setup({ beat: false });
    old.w.reincarnate = true;
    old.w.now += 10_000; // lâu tới đâu cũng không có luật im lặng
    lethal(old);
    expect(old.c.limbo).toBeDefined();
  });

  it("đúng 2 giây im lặng đã được tha (biên dưới)", () => {
    const s = setup();
    s.w.reincarnate = true;
    s.w.now += NET_SPARE_SILENCE_MS;
    lethal(s);
    expect(s.c.limbo).toBeUndefined();
    expect(s.p.dead).toBe(false);
  });

  it("nhánh hồi sinh (luân hồi tắt): cũng được tha, không nằm chờ hồi sinh", () => {
    const s = setup();
    s.w.reincarnate = false;
    s.w.now += 2600;
    lethal(s);
    expect(s.p.dead).toBe(false);
    expect(s.p.hp).toBeGreaterThan(0);
  });
});

describe("chống lợi dụng và số đo", () => {
  it("tickNetGuard gỡ hộ thể khi hết hạn (tập `shielded` không phình)", () => {
    const s = setup();
    reconnected(s.w, "a", s.c, 1000);
    expect(s.w.shielded.has("a")).toBe(true);
    s.w.now += NET_SHIELD_MS + 1;
    s.c.lastHeardAt = s.w.now;
    tickNetGuard(s.w, "a", s.c);
    expect(s.w.shielded.size).toBe(0);
    expect(s.c.shieldUntil).toBeUndefined();
  });

  it("flapping (mạng chập chờn): vào / ra im lặng nhiều lần vẫn nhất quán (tập ghosts / shielded không kẹt, mỗi lần một nhật ký)", () => {
    const s = setup();
    for (let i = 0; i < 6; i++) {
      advance(s.w, NET_SILENCE_GHOST_MS + 200);
      expect(s.w.ghosts.has("a")).toBe(true);
      s.w.now += 50;
      heard(s.w, "a", s.c, s.w.now);
      expect(s.w.ghosts.has("a")).toBe(false);
      advanceAlive(s, NET_SHIELD_MS + 100); // hết hộ thể, client vẫn gửi tin
    }
    expect(s.audits.filter((a) => a.ev === "net.silent")).toHaveLength(6);
    expect(s.audits.filter((a) => a.ev === "net.resume")).toHaveLength(6);
    expect(s.w.netStats.silent).toBe(6);
  });
});
