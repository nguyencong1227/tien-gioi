// Ghi thống kê PK theo linh hồn (M9.2 #1021): sổ chống đổi thắng + `recordPkResult` nối vào `endDuel` qua `World.onSocial`.
import { describe, expect, it } from "vitest";
import { BOARD_PK_PAIR_DAY_CAP, DEFAULT_MAP, type SoulSocial, dayKey } from "@tien-gioi/shared";
import { Hub } from "../hub";
import { addPlayer, makeWorld } from "./test-helpers";
import { duelAnswer, duelChallenge, endDuel } from "./duel";
import { PK_DAY_WIN_CAP, PK_LEDGER_MAX, PkLedger } from "./pk-ledger";
import { recordPkResult } from "./social";

describe("PkLedger: cặp KHÔNG thứ tự + trần theo linh hồn thắng mỗi ngày", () => {
  it("một cặp tối đa BOARD_PK_PAIR_DAY_CAP trận TỔNG, bất kể ai thắng (thay phiên không nhân đôi); cặp khác thì tính", () => {
    const l = new PkLedger();
    for (let i = 0; i < BOARD_PK_PAIR_DAY_CAP; i++) expect(l.tryCount("a", "b", "d1")).toBe(true);
    expect(l.tryCount("a", "b", "d1")).toBe(false);
    expect(l.tryCount("a", "b", "d1")).toBe(false); // vẫn không (không "hồi" theo thời gian)
    expect(l.tryCount("b", "a", "d1")).toBe(false); // chiều ngược lại dùng CHUNG hạn mức của cặp
    expect(l.tryCount("a", "c", "d1")).toBe(true);
    // thay phiên từ đầu: tổng vẫn chỉ CAP
    const m = new PkLedger();
    let counted = 0;
    for (let i = 0; i < 10; i++)
      if (m.tryCount(i % 2 ? "x" : "y", i % 2 ? "y" : "x", "d")) counted++;
    expect(counted).toBe(BOARD_PK_PAIR_DAY_CAP);
  });

  it("một linh hồn thắng: tối đa PK_DAY_WIN_CAP trận được tính mỗi ngày dù đánh nhiều đối thủ khác nhau (nhiều tài khoản phụ)", () => {
    const l = new PkLedger();
    let counted = 0;
    for (let alt = 0; alt < 10; alt++)
      for (let i = 0; i < 5; i++) if (l.tryCount("chinh", `phu${alt}`, "d")) counted++;
    expect(counted).toBe(PK_DAY_WIN_CAP); // 10 phụ x 3 = 30 nếu chỉ có hạn mức cặp
    expect(l.tryCount("khac", "phu0", "d")).toBe(true); // người thắng khác không bị ảnh hưởng
  });

  it("trận vượt MỘT hạn mức không ghi gì vào hạn mức kia", () => {
    const l = new PkLedger();
    for (let i = 0; i < BOARD_PK_PAIR_DAY_CAP; i++) l.tryCount("a", "b", "d");
    const before = l.size;
    expect(l.tryCount("a", "b", "d")).toBe(false);
    expect(l.size).toBe(before);
    // a vẫn còn trọn hạn mức thắng còn lại cho đối thủ khác
    let more = 0;
    for (let k = 0; k < 20; k++) if (l.tryCount("a", `z${k}`, "d")) more++;
    expect(more).toBe(PK_DAY_WIN_CAP - BOARD_PK_PAIR_DAY_CAP);
  });

  it("sang ngày mới: sổ bắt đầu lại và CHỈ giữ ngày hiện tại (bộ nhớ không phình theo số ngày)", () => {
    const l = new PkLedger();
    for (let i = 0; i < BOARD_PK_PAIR_DAY_CAP; i++) l.tryCount("a", "b", "d1");
    expect(l.tryCount("a", "b", "d1")).toBe(false);
    expect(l.tryCount("a", "b", "d2")).toBe(true);
    expect(l.size).toBe(2); // một cặp + một người thắng
  });

  it("trận không hợp lệ (tự đánh mình, khoá rỗng) không tính và không ghi sổ", () => {
    const l = new PkLedger();
    expect(l.tryCount("a", "a", "d")).toBe(false);
    expect(l.tryCount("", "b", "d")).toBe(false);
    expect(l.tryCount("a", "", "d")).toBe(false);
    expect(l.size).toBe(0);
  });

  it("bộ nhớ chặn trên: quá PK_LEDGER_MAX mục thì dọn sạch (nới tạm còn hơn phình)", () => {
    const l = new PkLedger();
    for (let i = 0; i < PK_LEDGER_MAX / 2; i++) l.tryCount(`w${i}`, "x", "d");
    expect(l.size).toBe(PK_LEDGER_MAX);
    l.tryCount("moi", "x", "d");
    expect(l.size).toBe(2);
  });
});

const A = "Alpha";
const B = "Bravo";

function setup() {
  const t = makeWorld(DEFAULT_MAP, new Hub());
  // Ghim đồng hồ phòng GIỮA ngày (12:00 giờ Việt Nam): mỗi `playout` trôi 2 phút, dùng đồng hồ thật thì gần 24:00 các trận đầu chạy qua nửa đêm và hạn mức cặp-trong-ngày đặt lại giữa chừng
  // (đỏ ổn định 23:40-24:00 giờ VN, cả trên CI lúc 16:40-17:00 UTC; issue #1125)
  t.w.now = Date.UTC(2026, 10, 17, 5, 0, 0);
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

/** Dựng một trận A (thách) - B (nhận), rồi kết thúc với `winner`. Trả `true` nếu có ghi PK. Hạ gục làm người thua gục: hồi sinh ngay để trận sau thách được. */
function playout(t: T, winner: string | undefined, reason: "ko" | "yield" | "fled" = "ko") {
  t.w.now += 120_000; // qua hồi chiêu thách và hồi chiêu theo cặp của lần trước
  for (const x of [t.pa, t.pb]) {
    x.p.dead = false;
    x.c.reviveAt = undefined;
  }
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
    expect(playout(t, A)).toBe(true);
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

  it("hoà (rớt mạng, hết giờ), ĐẦU HÀNG và BỎ CHẠY không ghi gì (chỉ hạ gục `ko` được tính: tài khoản phụ đầu hàng ngay giây đầu không cho thắng miễn phí); không hook thì không tiêu hạn mức", () => {
    const t = setup();
    expect(playout(t, undefined)).toBe(false);
    expect(playout(t, A, "yield")).toBe(false);
    expect(playout(t, A, "fled")).toBe(false);
    expect(playout(t, B, "yield")).toBe(false);
    expect(t.audits.filter((a) => a.ev === "social.pk")).toEqual([]); // không cả audit: không phải trận được xét
    const t2 = setup();
    t2.w.onSocial = null;
    expect(playout(t2, A)).toBe(false); // không hook: không ghi
    // hạn mức chưa bị tiêu: gắn hook lại, vẫn tính được đủ CAP trận
    t2.w.onSocial = (key, fn) => t2.calls.push({ key, fn });
    for (let i = 0; i < BOARD_PK_PAIR_DAY_CAP; i++)
      expect(playout(t2, A), `trận ${i + 1}`).toBe(true);
    expect(t2.calls.length).toBe(BOARD_PK_PAIR_DAY_CAP * 2); // mỗi trận hai lời gọi (thắng + thua)
  });

  it("đổi thắng: trận thứ CAP+1 của cùng cặp trong ngày KHÔNG tính cho cả hai bên; người thua thắng lại cũng KHÔNG (chung hạn mức cặp); sang ngày thì tính lại", () => {
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
    expect(playout(t, B)).toBe(false); // chiều ngược lại dùng CHUNG hạn mức của cặp (không thay phiên đổi thắng)
    expect(t.calls.length).toBe(n);
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
