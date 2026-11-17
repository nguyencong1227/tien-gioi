// Ghi thống kê PK theo linh hồn (M9.2 #1021): sổ chống đổi thắng + `recordPkResult` nối vào `endDuel` qua `World.onSocial`.
import { describe, expect, it } from "vitest";
import { BOARD_PK_PAIR_DAY_CAP, DEFAULT_MAP, type SoulSocial, dayKey } from "@tien-gioi/shared";
import { Hub } from "../hub";
import { addPlayer, makeWorld } from "./test-helpers";
import { duelAnswer, duelChallenge, endDuel } from "./duel";
import { PK_LEDGER_MAX, PkLedger } from "./pk-ledger";
import { recordPkResult } from "./social";

describe("PkLedger: tối đa BOARD_PK_PAIR_DAY_CAP trận thắng mỗi CẶP CÓ THỨ TỰ mỗi ngày", () => {
  it("trận thứ CAP+1 của cùng cặp cùng ngày không tính; chiều ngược lại và cặp khác thì tính", () => {
    const l = new PkLedger();
    for (let i = 0; i < BOARD_PK_PAIR_DAY_CAP; i++) expect(l.tryCount("a", "b", "d1")).toBe(true);
    expect(l.tryCount("a", "b", "d1")).toBe(false);
    expect(l.tryCount("a", "b", "d1")).toBe(false); // vẫn không (không "hồi" theo thời gian)
    expect(l.tryCount("b", "a", "d1")).toBe(true); // người thua thắng lại: cặp ngược chiều có sổ riêng
    expect(l.tryCount("a", "c", "d1")).toBe(true);
  });

  it("sang ngày mới: sổ bắt đầu lại và CHỈ giữ ngày hiện tại (bộ nhớ không phình theo số ngày)", () => {
    const l = new PkLedger();
    for (let i = 0; i < BOARD_PK_PAIR_DAY_CAP; i++) l.tryCount("a", "b", "d1");
    expect(l.tryCount("a", "b", "d1")).toBe(false);
    expect(l.tryCount("a", "b", "d2")).toBe(true);
    expect(l.size).toBe(1);
  });

  it("trận không hợp lệ (tự đánh mình, khoá rỗng) không tính và không ghi sổ", () => {
    const l = new PkLedger();
    expect(l.tryCount("a", "a", "d")).toBe(false);
    expect(l.tryCount("", "b", "d")).toBe(false);
    expect(l.tryCount("a", "", "d")).toBe(false);
    expect(l.size).toBe(0);
  });

  it("bộ nhớ chặn trên: quá PK_LEDGER_MAX cặp thì dọn sạch (nới tạm còn hơn phình)", () => {
    const l = new PkLedger();
    for (let i = 0; i < PK_LEDGER_MAX; i++) l.tryCount(`w${i}`, "x", "d");
    expect(l.size).toBe(PK_LEDGER_MAX);
    l.tryCount("moi", "x", "d");
    expect(l.size).toBe(1);
  });
});

const A = "Alpha";
const B = "Bravo";

function setup() {
  const t = makeWorld(DEFAULT_MAP, new Hub());
  const pa = addPlayer(t.w, A, 1, 8);
  const pb = addPlayer(t.w, B, 1, 8);
  pb.p.x += 45;
  const calls: Array<{ key: string; fn: (s: SoulSocial | undefined) => SoulSocial }> = [];
  t.w.onSocial = (key, fn) => calls.push({ key, fn });
  const audits: Array<{ ev: string; f: Record<string, unknown> }> = [];
  t.w.audit = (ev, f) => audits.push({ ev, f: f ?? {} });
  return { ...t, pa, pb, calls, audits };
}
type T = ReturnType<typeof setup>;

/** Dựng một trận A (thách) - B (nhận), rồi kết thúc với `winner`. Trả `true` nếu có ghi PK. */
function playout(t: T, winner: string | undefined, reason: "ko" | "yield" = "yield") {
  t.w.now += 120_000; // qua hồi chiêu thách và hồi chiêu theo cặp của lần trước
  duelChallenge(t.w, A, { name: B });
  duelAnswer(t.w, B, { from: A }, true);
  const d = t.w.duels.of(A)!;
  const before = t.calls.length;
  endDuel(t.w, d, winner, reason);
  return t.calls.length > before;
}

/** Áp mọi lời gọi `onSocial` đã bắt lên bản ghi trống của từng linh hồn. */
function applied(t: T): Record<string, SoulSocial> {
  const out: Record<string, SoulSocial> = {};
  for (const c of t.calls) out[c.key] = c.fn(out[c.key]);
  return out;
}

describe("recordPkResult / endDuel: thống kê PK theo LINH HỒN", () => {
  it("thắng: người thắng +1 thắng, người thua +1 thua (kèm bộ đếm), khoá là soulKey; có audit `social.pk`", () => {
    const t = setup();
    expect(playout(t, A, "ko")).toBe(true);
    const r = applied(t);
    const ka = t.pa.c.identity.soulKey;
    const kb = t.pb.c.identity.soulKey;
    expect(r[ka].pk).toEqual({ won: 1, lost: 0 });
    expect(r[ka].counters).toEqual({ pk_won: 1 });
    expect(r[kb].pk).toEqual({ won: 0, lost: 1 });
    expect(r[kb].counters).toEqual({ pk_lost: 1 });
    expect(t.audits.filter((a) => a.ev === "social.pk")).toEqual([
      { ev: "social.pk", f: { winner: A, loser: B, counted: true } },
    ]);
  });

  it("hoà (rớt mạng, hết giờ) không ghi gì; không có hook onSocial thì không ghi và không tiêu hạn mức", () => {
    const t = setup();
    expect(playout(t, undefined)).toBe(false);
    const t2 = setup();
    t2.w.onSocial = null;
    duelChallenge(t2.w, A, { name: B });
    duelAnswer(t2.w, B, { from: A }, true);
    endDuel(t2.w, t2.w.duels.of(A)!, A, "yield");
    // hạn mức chưa bị tiêu: gắn hook lại, vẫn tính được đủ CAP trận
    const calls: unknown[] = [];
    t2.w.onSocial = (k, f) => calls.push([k, f]);
    for (let i = 0; i < BOARD_PK_PAIR_DAY_CAP; i++) {
      t2.w.now += 120_000;
      duelChallenge(t2.w, A, { name: B });
      duelAnswer(t2.w, B, { from: A }, true);
      endDuel(t2.w, t2.w.duels.of(A)!, A, "yield");
    }
    expect(calls.length).toBe(BOARD_PK_PAIR_DAY_CAP * 2); // mỗi trận hai lời gọi (thắng + thua)
  });

  it("đổi thắng: trận thắng thứ CAP+1 của cùng cặp trong ngày KHÔNG tính cho cả hai bên; người thua thắng lại thì tính; sang ngày thì tính lại", () => {
    const t = setup();
    for (let i = 0; i < BOARD_PK_PAIR_DAY_CAP; i++)
      expect(playout(t, A), `trận ${i + 1}`).toBe(true);
    const n = t.calls.length;
    expect(playout(t, A)).toBe(false); // vượt hạn mức
    expect(t.calls.length).toBe(n);
    expect(t.audits.at(-1)).toEqual({
      ev: "social.pk",
      f: { winner: A, loser: B, counted: false },
    });
    expect(playout(t, B)).toBe(true); // chiều ngược lại có hạn mức riêng
    t.w.now += 24 * 3600_000; // ngày kế
    expect(dayKey(t.w.now)).not.toBe(dayKey(t.w.now - 24 * 3600_000));
    expect(playout(t, A)).toBe(true);
  });

  it("recordPkResult trực tiếp: người chơi không còn trong phòng thì không ghi", () => {
    const t = setup();
    expect(recordPkResult(t.w, "khong-co", "khong-co-nua")).toBe(false);
    expect(t.calls.length).toBe(0);
  });
});
