import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAP_ID,
  ITEM_BY_ID,
  MAIN_QUEST_START,
  MAP_BY_ID,
  NPC_BY_ID,
  QUESTS,
  QUEST_BY_ID,
  SECT_QUEST_BY_ID,
  SECT_QUEST_GIVER,
  emptyInventory,
  isSectQuest,
  type QuestCtx,
  type QuestProgress,
} from "@tien-gioi/shared";
import {
  MAIN_QUEST_TOTAL,
  QUEST_KIND_BADGE,
  QUEST_KIND_LABEL,
  dialogRewardOf,
  doneRows,
  doneSummary,
  QuestReadyWatcher,
  newlyReadyQuests,
  questCardSubtitle,
  questKind,
  questReadyText,
  questReadyToast,
  readyQuestIds,
  rewardParts,
} from "./quest-log";

/** Chuỗi chính: đi từ nhiệm vụ đầu theo `next` (tính độc lập với `quest-log.ts`). */
const MAIN: string[] = [];
for (
  let id: string | undefined = MAIN_QUEST_START;
  id && !MAIN.includes(id);
  id = QUEST_BY_ID[id]?.next
)
  MAIN.push(id);
const DAILY = QUESTS.filter((q) => q.daily).map((q) => q.id);
/** Việc phụ: không lặp, không thuộc chuỗi chính. */
const SIDE = QUESTS.filter((q) => !q.daily && !MAIN.includes(q.id)).map((q) => q.id);

describe("loại nhiệm vụ: chính tuyến / việc phụ / lặp", () => {
  it("mọi nhiệm vụ thuộc đúng một loại và ba loại cộng lại đủ số nhiệm vụ của game", () => {
    expect(MAIN.length + SIDE.length + DAILY.length).toBe(QUESTS.length);
    for (const id of MAIN) expect(questKind(QUEST_BY_ID[id]), id).toBe("main");
    for (const id of SIDE) expect(questKind(QUEST_BY_ID[id]), id).toBe("side");
    for (const id of DAILY) expect(questKind(QUEST_BY_ID[id]), id).toBe("daily");
  });

  it("việc phụ có thật (Xích Mãng theo đội) và KHÔNG được gọi là chính tuyến; nhãn tiếng Việt đúng", () => {
    expect(SIDE).toContain("mang_hoan");
    expect(questKind(QUEST_BY_ID.mang_hoan)).toBe("side");
    expect(QUEST_KIND_LABEL).toEqual({
      main: "Chính tuyến",
      side: "Việc phụ",
      daily: "Hằng ngày",
      sect: "Tông môn",
    });
    expect(QUEST_KIND_BADGE).toEqual({ main: "Chính", side: "Phụ", daily: "Lặp", sect: "Tông" });
  });

  it("id lạ / thiếu định nghĩa: coi là việc phụ, không ném lỗi", () => {
    expect(questKind(undefined)).toBe("side");
    expect(questKind({ id: "khong_co" })).toBe("side");
    expect(questKind({ id: "constructor" })).toBe("side");
  });
});

describe("doneRows (tab Đã hoàn thành của Sổ nhiệm vụ)", () => {
  it("chuỗi chính theo THỨ TỰ CHUỖI dù server gửi lộn xộn, rồi việc phụ, nhiệm vụ lặp xếp sau cùng", () => {
    expect(MAIN.length).toBeGreaterThanOrEqual(15); // chuỗi dài (Phàm Nhân -> Trúc Cơ -> Kim Đan -> Nguyên Anh): đúng ca cần gọn
    expect(DAILY.length).toBeGreaterThan(0);
    expect(SIDE.length).toBeGreaterThan(0);
    const shuffled = [...SIDE, ...MAIN].reverse();
    const rows = doneRows(shuffled, [DAILY[0]]);
    expect(rows.map((r) => r.id)).toEqual([...MAIN, ...SIDE, DAILY[0]]);
    expect(rows.at(-1)!.daily).toBe(true);
    expect(rows.filter((r) => r.side).map((r) => r.id)).toEqual(SIDE);
    expect(rows.slice(0, MAIN.length).every((r) => !r.daily && !r.side)).toBe(true);
  });

  it("mỗi hàng mang tiêu đề + mô tả của nhiệm vụ", () => {
    const [row] = doneRows([MAIN[0]], []);
    expect(row.title).toBe(QUEST_BY_ID[MAIN[0]].title);
    expect(row.desc).toBe(QUEST_BY_ID[MAIN[0]].desc);
  });

  it("bỏ id lạ, id độc, sai kiểu và id trùng (danh sách từ file lưu không đáng tin)", () => {
    const rows = doneRows(
      [
        MAIN[1],
        "khong_co",
        "constructor",
        "__proto__",
        "toString",
        MAIN[1],
        7 as unknown as string,
      ],
      [DAILY[0], DAILY[0], "hasOwnProperty"],
    );
    expect(rows.map((r) => r.id)).toEqual([MAIN[1], DAILY[0]]);
  });

  it("rỗng thì không có hàng", () => {
    expect(doneRows([], [])).toEqual([]);
  });

  it("một id đã có ở `done` thì không lặp lại ở `dailyDone` (và ngược lại)", () => {
    expect(doneRows([MAIN[0]], [MAIN[0]]).map((r) => r.id)).toEqual([MAIN[0]]);
  });
});

describe("doneSummary", () => {
  it("mẫu số là số nhiệm vụ trong CHUỖI CHÍNH của game, không chép cứng và không tính việc phụ", () => {
    expect(MAIN_QUEST_TOTAL).toBe(MAIN.length);
    expect(MAIN_QUEST_TOTAL).toBeLessThan(QUESTS.filter((q) => !q.daily).length);
    expect(doneSummary([])).toBe(`Chính tuyến 0 / ${MAIN.length}`);
    expect(doneSummary(doneRows(MAIN, []))).toBe(`Chính tuyến ${MAIN.length} / ${MAIN.length}`);
  });

  it("xong đủ chuỗi chính và mọi việc phụ vẫn ghi đúng 'chính tuyến N / N' (việc phụ không đẩy tử số quá mẫu số)", () => {
    expect(doneSummary(doneRows([...MAIN, ...SIDE], []))).toBe(
      `Chính tuyến ${MAIN.length} / ${MAIN.length} · Việc phụ: ${SIDE.length}`,
    );
  });

  it("có phần việc phụ / lặp chỉ khi đã làm", () => {
    const some = doneRows(MAIN.slice(0, 3), []);
    expect(doneSummary(some)).not.toContain("Lặp");
    expect(doneSummary(some)).not.toContain("Việc phụ");
    const withDaily = doneRows(MAIN.slice(0, 3), DAILY.slice(0, 2));
    expect(doneSummary(withDaily)).toBe(`Chính tuyến 3 / ${MAIN.length} · Lặp hôm nay: 2`);
    const all = doneRows([...MAIN.slice(0, 3), SIDE[0]], DAILY.slice(0, 2));
    expect(doneSummary(all)).toBe(`Chính tuyến 3 / ${MAIN.length} · Việc phụ: 1 · Lặp hôm nay: 2`);
  });
});

describe("nhiệm vụ TÔNG MÔN (M8.6): không có NPC giao", () => {
  const sectDef = SECT_QUEST_BY_ID[Object.keys(SECT_QUEST_BY_ID)[0]!]!;

  it("questKind: nhiệm vụ tông môn là loại riêng 'sect' (dù `daily: true`); nhiệm vụ thường không đổi", () => {
    expect(sectDef.daily).toBe(true);
    expect(isSectQuest(sectDef)).toBe(true);
    expect(questKind(sectDef)).toBe("sect");
    for (const id of MAIN) expect(questKind(QUEST_BY_ID[id]), id).toBe("main");
    for (const id of DAILY) expect(questKind(QUEST_BY_ID[id]), id).toBe("daily");
  });

  it("questCardSubtitle: nhiệm vụ tông môn không tra NPC (không hiện id 'tong_mon'); NPC thường kèm loại; NPC lạ / độc ghi chính id", () => {
    const s = questCardSubtitle(sectDef);
    expect(s).toBe("Nhiệm vụ nội vụ tông môn");
    expect(s).not.toContain(SECT_QUEST_GIVER);
    const q = QUEST_BY_ID[MAIN[0]!]!;
    expect(questCardSubtitle(q)).toBe(`${NPC_BY_ID[q.giver]!.name} (Chính tuyến)`);
    expect(questCardSubtitle({ id: "x", giver: "khong_co" })).toBe("khong_co (Việc phụ)");
    expect(questCardSubtitle({ id: "x", giver: "constructor" })).toBe("constructor (Việc phụ)");
  });

  it("questReadyText (mục 66): 'ĐÃ ĐỦ — về gặp <NPC> ở <bản đồ> để trả nhiệm vụ'; tông môn -> bảng Tông môn > Nội vụ; NPC lạ -> 'NPC', không bản đồ", () => {
    expect(questReadyText(sectDef)).toBe("ĐÃ ĐỦ — mở bảng Tông môn > Nội vụ để trả nhiệm vụ");
    const q = QUEST_BY_ID[MAIN[0]!]!;
    const npc = NPC_BY_ID[q.giver]!;
    const mapName = MAP_BY_ID[npc.mapId ?? DEFAULT_MAP_ID]!.name;
    expect(questReadyText(q)).toBe(`ĐÃ ĐỦ — về gặp ${npc.name} ở ${mapName} để trả nhiệm vụ`);
    expect(questReadyText({ giver: "khong_co" })).toBe("ĐÃ ĐỦ — về gặp NPC để trả nhiệm vụ");
    expect(questReadyText({ giver: "constructor" })).toBe("ĐÃ ĐỦ — về gặp NPC để trả nhiệm vụ");
  });

  it("questReadyText nói ĐÚNG bản đồ của NPC giao, kể cả NPC ở bản đồ KHÁC bản đồ mặc định", () => {
    const other = QUESTS.find((q) => {
      const m = NPC_BY_ID[q.giver]?.mapId;
      return m !== undefined && m !== DEFAULT_MAP_ID;
    });
    expect(other, "phải có nhiệm vụ của NPC ở bản đồ ngoài Lạc Hà").toBeTruthy();
    const mapId = NPC_BY_ID[other!.giver]!.mapId!;
    expect(questReadyText(other!)).toContain(` ở ${MAP_BY_ID[mapId]!.name} `);
    expect(questReadyText(other!)).not.toContain(MAP_BY_ID[DEFAULT_MAP_ID]!.name);
  });

  it("questReadyToast: 'ĐÃ ĐỦ: <tên nhiệm vụ> — về gặp <NPC> ở <bản đồ> để trả nhiệm vụ'", () => {
    const q = QUEST_BY_ID[MAIN[0]!]!;
    expect(questReadyToast(q)).toBe(
      `ĐÃ ĐỦ: ${q.title} — ${questReadyText(q).replace("ĐÃ ĐỦ — ", "")}`,
    );
    expect(questReadyToast(sectDef)).toContain(`ĐÃ ĐỦ: ${sectDef.title} — mở bảng Tông môn`);
  });

  it("doneRows nhận id nhiệm vụ tông môn (xếp trong nhóm lặp, cuối nhóm); id độc vẫn bị bỏ", () => {
    const rows = doneRows(
      [MAIN[0]!],
      [DAILY[0]!, sectDef.id, "constructor", "__proto__", sectDef.id],
    );
    expect(rows.map((r) => r.id)).toEqual([MAIN[0], DAILY[0], sectDef.id]);
    const sectRow = rows.find((r) => r.id === sectDef.id)!;
    expect(sectRow).toMatchObject({ daily: true, side: false, title: sectDef.title });
  });
});

describe("giao diện dùng đúng loại nhiệm vụ (không gọi việc phụ là chính tuyến)", () => {
  // `ui.ts` + `ui-quest-tracker.ts` (bảng theo dõi nhiệm vụ HUD đã tách khỏi ui.ts, dọn ui.ts bước 2): canh cả hai nơi dán nhãn loại nhiệm vụ
  const ui =
    fs.readFileSync(path.resolve(__dirname, "ui.ts"), "utf8") +
    "\n" +
    fs.readFileSync(path.resolve(__dirname, "ui-quest-tracker.ts"), "utf8");

  it("ui.ts dán nhãn thẻ đang làm / huy hiệu hộp thoại / hàng đã xong qua `questKind`, không còn nhãn cứng 'Chính tuyến' theo `daily`", () => {
    expect(ui).toContain("questCardSubtitle(def)");
    expect(ui).toContain("QUEST_KIND_BADGE[questKind(def)]");
    expect(ui).toContain('row.side ? "Việc phụ"');
    expect(ui).not.toMatch(/def\.daily \? "Hằng ngày" : "Chính tuyến"/);
    expect(ui).not.toMatch(/def\.daily \? "Lặp" : "Chính"/);
  });
});

describe("rewardParts: các phần của dòng 'Thưởng:' ở thẻ nhiệm vụ", () => {
  it("tu vi trước, rồi từng món '<tên> ×<số lượng>' kèm id + độ hiếm THẬT của món", () => {
    const r = rewardParts({
      exp: 40,
      items: [
        { itemId: "hoi_linh_dan", qty: 2 },
        { itemId: "kinh_hoa_van_kiem", qty: 1 },
      ],
    });
    expect(r.map((p) => p.text)).toEqual([
      "40 tu vi",
      `${ITEM_BY_ID.hoi_linh_dan.name} ×2`,
      `${ITEM_BY_ID.kinh_hoa_van_kiem.name} ×1`,
    ]);
    expect(r[0].itemId).toBeUndefined(); // tu vi không phải đồ
    expect(r[1]).toMatchObject({ itemId: "hoi_linh_dan", rarity: ITEM_BY_ID.hoi_linh_dan.rarity });
    expect(r[2]).toMatchObject({
      itemId: "kinh_hoa_van_kiem",
      rarity: ITEM_BY_ID.kinh_hoa_van_kiem.rarity,
    });
    // quyển Hỏa Vân Kiếm Pháp là Linh phẩm (độ hiếm 1) nên KHÁC đan Phàm phẩm: dòng thưởng phải phân biệt được hai món
    expect(r[2].rarity).not.toBe(r[1].rarity);
  });

  it("mọi nhiệm vụ trong QUESTS: số phần đúng (tu vi + từng món), mỗi món có độ hiếm số, không chữ undefined / NaN", () => {
    for (const q of QUESTS) {
      const parts = rewardParts(q.rewards);
      const want = (q.rewards.exp ? 1 : 0) + (q.rewards.items?.length ?? 0);
      expect(parts.length, q.id).toBe(want);
      for (const p of parts) {
        expect(p.text, q.id).not.toMatch(/undefined|NaN|null/);
        if (p.itemId !== undefined) expect(typeof p.rarity, `${q.id}/${p.itemId}`).toBe("number");
      }
    }
  });

  it("dữ liệu lạ: không có phần thưởng, số lượng / tu vi không hợp lệ bị bỏ, id đồ lạ vẫn hiện bằng id (không ném lỗi, không độ hiếm)", () => {
    expect(rewardParts(undefined)).toEqual([]);
    expect(rewardParts({})).toEqual([]);
    expect(rewardParts({ exp: 0 })).toEqual([]);
    expect(rewardParts({ exp: NaN, items: [{ itemId: "hoi_linh_dan", qty: 0 }] })).toEqual([]);
    expect(rewardParts({ items: [{ itemId: "hoi_linh_dan", qty: Infinity }] })).toEqual([]);
    expect(rewardParts({ items: [{ itemId: "constructor", qty: 3 }] })).toEqual([
      { text: "constructor ×3", itemId: "constructor" },
    ]);
  });
});

describe("báo MỘT lần khi nhiệm vụ vừa đủ (mục 66)", () => {
  const talkQ = QUESTS.find((q) => q.steps.length === 1 && q.steps[0]!.kind === "talk")!;
  const killQ = QUESTS.find((q) => q.steps.every((s) => s.kind === "kill"))!;
  const ctx: QuestCtx = { realm: 0, tier: 0, inv: emptyInventory() };
  const done = (id: string, n: number): QuestProgress => ({ id, step: n, count: 0 });
  const doing = (id: string): QuestProgress => ({ id, step: 0, count: 0 });

  it("readyQuestIds: chỉ nhiệm vụ đã qua hết bước; id lạ / độc bị bỏ", () => {
    const ids = readyQuestIds(
      [done(talkQ.id, talkQ.steps.length), doing(killQ.id), done("constructor", 1), done("x", 1)],
      ctx,
    );
    expect([...ids]).toEqual([talkQ.id]);
  });

  it("prev = null (vừa vào phòng): KHÔNG báo gì dù có nhiệm vụ đã đủ từ trước; trả mốc để lần sau so", () => {
    const r = newlyReadyQuests(null, [done(talkQ.id, talkQ.steps.length)], ctx);
    expect(r.notify).toEqual([]);
    expect([...r.next]).toEqual([talkQ.id]);
  });

  it("chuyển từ chưa đủ -> đủ: báo ĐÚNG MỘT lần, lần xem sau (vẫn đủ) không báo lại", () => {
    const before = newlyReadyQuests(null, [doing(talkQ.id)], ctx);
    const flip = newlyReadyQuests(before.next, [done(talkQ.id, talkQ.steps.length)], ctx);
    expect(flip.notify).toEqual([talkQ.id]);
    const again = newlyReadyQuests(flip.next, [done(talkQ.id, talkQ.steps.length)], ctx);
    expect(again.notify).toEqual([]);
  });

  it("nhận nhiệm vụ đã đủ sẵn (bước đầu đạt ngay): báo; trả xong (biến khỏi sổ) rồi nhận lại cái khác thì báo cái mới", () => {
    const base = newlyReadyQuests(new Set(), [], ctx);
    expect(newlyReadyQuests(base.next, [done(talkQ.id, 1)], ctx).notify).toEqual([talkQ.id]);
    const turned = newlyReadyQuests(new Set([talkQ.id]), [], ctx);
    expect([...turned.next]).toEqual([]);
    expect(newlyReadyQuests(turned.next, [done(talkQ.id, 1)], ctx).notify).toEqual([talkQ.id]);
  });

  it("đủ -> thiếu (lỡ vứt đồ) -> đủ lại: báo lại lần nữa", () => {
    const collectQ = QUESTS.find((q) => q.steps.some((s) => s.kind === "collect"))!;
    const need = collectQ.steps.filter((s) => s.kind === "collect") as {
      kind: "collect";
      itemId: string;
      count: number;
    }[];
    const full = emptyInventory();
    need.forEach((s, i) => (full[i] = { itemId: s.itemId, qty: s.count }));
    const prog = done(collectQ.id, collectQ.steps.length);
    const ready = newlyReadyQuests(new Set(), [prog], { ...ctx, inv: full });
    expect(ready.notify).toEqual([collectQ.id]);
    const lost = newlyReadyQuests(ready.next, [prog], ctx); // túi trống: không còn đủ
    expect(lost.notify).toEqual([]);
    expect([...lost.next]).toEqual([]);
    expect(newlyReadyQuests(lost.next, [prog], { ...ctx, inv: full }).notify).toEqual([
      collectQ.id,
    ]);
  });
});

describe("xem trước thưởng ở hộp thoại NPC (mục 66)", () => {
  const withReward = QUESTS.find((q) => rewardParts(q.rewards).length > 0)!;

  it("lựa chọn nhận / trả mang questId: trả đúng thưởng gốc trong dữ liệu", () => {
    expect(dialogRewardOf({ kind: "accept", questId: withReward.id })).toBe(withReward.rewards);
    expect(dialogRewardOf({ kind: "turnIn", questId: withReward.id })).toBe(withReward.rewards);
  });

  it("lựa chọn khác, id lạ / độc: không có xem trước (không ném lỗi)", () => {
    expect(dialogRewardOf({ kind: "close" })).toBeUndefined();
    expect(dialogRewardOf({ kind: "shop" })).toBeUndefined();
    expect(dialogRewardOf({ kind: "accept", questId: "khong_co" })).toBeUndefined();
    expect(dialogRewardOf({ kind: "accept", questId: "constructor" })).toBeUndefined();
    expect(dialogRewardOf({ kind: "turnIn", questId: "__proto__" })).toBeUndefined();
  });
});

describe("QuestReadyWatcher: không báo nhầm lúc vào phòng (mục 66)", () => {
  const talkQ = QUESTS.find((q) => q.steps.length === 1 && q.steps[0]!.kind === "talk")!;
  const ctx: QuestCtx = { realm: 0, tier: 0, inv: emptyInventory() };
  const ready: QuestProgress[] = [{ id: talkQ.id, step: talkQ.steps.length, count: 0 }];
  const notReady: QuestProgress[] = [{ id: talkQ.id, step: 0, count: 0 }];

  it("chưa nhận đủ cả túi lẫn sổ: không báo, và KHÔNG lập mốc (tin thứ hai tới vẫn chỉ lập mốc, không báo nhiệm vụ đã đủ từ trước)", () => {
    const w = new QuestReadyWatcher();
    w.noteInv();
    expect(w.update(ready, ctx)).toEqual([]); // chưa có sổ
    w.noteQuests();
    expect(w.update(ready, ctx)).toEqual([]); // đủ cả hai: lập mốc, nhiệm vụ đã đủ từ trước không báo
    expect(w.update(ready, ctx)).toEqual([]);
  });

  it("thứ tự ngược (sổ trước, túi sau) cũng vậy", () => {
    const w = new QuestReadyWatcher();
    w.noteQuests();
    expect(w.update(ready, ctx)).toEqual([]);
    w.noteInv();
    expect(w.update(ready, ctx)).toEqual([]);
  });

  it("sau khi lập mốc: nhiệm vụ vừa đủ báo đúng MỘT lần", () => {
    const w = new QuestReadyWatcher();
    w.noteInv();
    w.noteQuests();
    expect(w.update(notReady, ctx)).toEqual([]); // mốc: chưa đủ
    expect(w.update(ready, ctx)).toEqual([talkQ.id]);
    expect(w.update(ready, ctx)).toEqual([]);
  });

  it("mỗi phiên một người theo dõi: phiên mới (đăng nhập lại) không nhớ mốc cũ", () => {
    const a = new QuestReadyWatcher();
    a.noteInv();
    a.noteQuests();
    a.update(notReady, ctx);
    expect(a.update(ready, ctx)).toEqual([talkQ.id]);
    const b = new QuestReadyWatcher();
    b.noteInv();
    b.noteQuests();
    expect(b.update(ready, ctx)).toEqual([]);
  });
});
