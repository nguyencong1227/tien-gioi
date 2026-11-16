// Nhiệm vụ tông môn hằng ngày nối với phòng (M8.4, docs/THIET_KE_TONG_MON.md mục 12.7): nhận / trả qua bảng Tông môn, tiến độ đi chung `systems/quests.ts`, "đã làm hôm nay" theo MẪU trong
// sổ ngày của LINH HỒN (đầu thai / đổi bậc / sang ngày), cống hiến qua MỘT cổng `award`, thứ tự chỉ MẤT. World giả + kho tệp thật + `SectService` thật (như `sect-earn.test.ts`).
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  INVENTORY_SLOTS,
  MAX_ACTIVE_QUESTS,
  QUESTS,
  SECT_EARN_DAY_CAP,
  SECT_QUESTS,
  SECT_QUEST_BY_ID,
  SECT_QUEST_TEMPLATE_BY_ID,
  addToInventory,
  dayKey,
  sectFailMessage,
  sectQuestSlots,
  type SectFail,
  type SectQuestTemplate,
} from "@tien-gioi/shared";
import { Hub } from "../hub";
import { FileSectStore } from "../sect-store";
import { SectService } from "../sect-service";
import { makeSect } from "../store-contract";
import { sanitizeQuests, onMonsterKilled } from "./quests";
import { sectOnJoin, sectQuestAccept, sectQuestTurnIn } from "./sect";
import { installSectQuestFixture } from "./sect-fixtures";
import { addPlayer, makeWorld } from "./test-helpers";

const root = mkdtempSync(path.join(tmpdir(), "tien-gioi-sect-quest-"));
const restoreFixture = installSectQuestFixture(); // bảng cố định, không phụ thuộc dữ liệu thật của E / D (M8.7)
afterAll(() => {
  restoreFixture();
  rmSync(root, { recursive: true, force: true });
});
let n = 0;
const DAY = 86_400_000;
const A = "Alpha";
const B = "Bravo";
const keyOf = (s: string) => s.toLowerCase();

// Dữ liệu mẫu của M8.1 (E / D thay bằng nội dung thật sau): 3 mẫu, độ khó 1 / 2 / 3, bản bậc Luyện Khí (`.t0`)
const LANG = "st_tru_lang.t0"; // hạ 10 Hôi Lang, +20 cống hiến, thưởng tu vi 40
const NANH = "st_nop_nanh.t0"; // nộp 8 nanh sói, +30, tu vi 60
const HO = "st_tru_ho.t0"; // hạ 3 Hắc Hổ, +40, tu vi 120 + 2 Hồi Huyết Đan

let now = 1_700_000_000_000;
let lh: ReturnType<typeof makeWorld>;
let store: FileSectStore;
let svc: SectService;
let audit: { ev: string; f: Record<string, unknown> }[];

/** Dựng tông môn "t1" (A Tông chủ, B Đệ tử) vào từ `joinedAgo` ms trước. */
async function seed(joinedAgo = 2 * DAY) {
  const joined = now - joinedAgo;
  return store.create(
    makeSect("t1", {
      name: "Thanh Van",
      tag: "TV",
      leader: keyOf(A),
      members: [
        { soulKey: keyOf(A), name: A, rank: "chu", joinedAt: joined },
        { soulKey: keyOf(B), name: B, rank: "de_tu", joinedAt: joined },
      ],
    }),
  );
}
const join = (who: string) => sectOnJoin(lh.w, who);
const meOf = async (who: string) =>
  (await store.get("t1"))!.members.find((m) => m.soulKey === keyOf(who))!;
const lastHall = (who: string) => lh.sectHalls.filter((h) => h.sid === who).at(-1)?.msg.hall;
const lastToast = (who: string) => lh.toasts.filter((t) => t.sid === who).at(-1)?.msg.text;
const active = (who: string) => lh.w.ctrl.get(who)!.quests.active;
const accept = (who: string, questId: unknown) => sectQuestAccept(lh.w, who, { questId });
const turnIn = (who: string, questId: unknown) => sectQuestTurnIn(lh.w, who, { questId });
const failText = (r: SectFail) => sectFailMessage(r);
const stateOf = (who: string, questId: string) =>
  lastHall(who)!.quests.find((q) => q.questId === questId)?.state;

/** Hạ đủ `k` con quái `monster` (đi qua `onMonsterKilled`, đúng đường tiến độ của game). */
const kill = (who: string, monster: string, k: number) => {
  for (let i = 0; i < k; i++) onMonsterKilled(lh.w, who, monster);
};
/** Nhận + hoàn thành nhiệm vụ hạ Hôi Lang (đủ tiến độ để trả). */
async function doLang(who = A) {
  await accept(who, LANG);
  kill(who, "lang", 10);
}

beforeEach(async () => {
  now = 1_700_000_000_000;
  lh = makeWorld(undefined, new Hub());
  store = new FileSectStore(path.join(root, `s${++n}`), () => now);
  svc = new SectService(store, () => now);
  lh.w.now = now;
  lh.w.sectService = svc;
  lh.w.onSaveNow = async () => true;
  audit = [];
  lh.w.audit = (ev, f) => void audit.push({ ev, f: f ?? {} });
  addPlayer(lh.w, A, 1, 8);
  addPlayer(lh.w, B, 1, 8);
});

describe("ảnh chụp Nội vụ: ba nhiệm vụ hôm nay của CHÍNH người xem", () => {
  it("3 ô (độ khó 1 / 2 / 3, +20 / +30 / +40 cống hiến), bản theo bậc của người xem, trạng thái ban đầu 'offer'", async () => {
    await seed();
    await join(A);
    const qs = lastHall(A)!.quests;
    expect(qs.map((q) => q.questId)).toEqual([LANG, NANH, HO]);
    expect(qs.map((q) => q.difficulty)).toEqual([1, 2, 3]);
    expect(qs.map((q) => q.ch)).toEqual([20, 30, 40]);
    expect(qs.every((q) => q.state === "offer" && q.title && q.desc)).toBe(true);
  });

  it("mọi thành viên cùng tông cùng thấy cùng 3 MẪU hôm nay", async () => {
    await seed();
    await join(A);
    await join(B);
    const tpl = (w: string) => lastHall(w)!.quests.map((q) => q.questId.split(".")[0]);
    expect(tpl(A)).toEqual(tpl(B));
  });
});

describe("nhận nhiệm vụ", () => {
  it("nhận đúng nhiệm vụ hôm nay: vào sổ nhiệm vụ (bước 0), toast, ảnh chụp báo 'active'; không cần NPC", async () => {
    await seed();
    await join(A);
    await accept(A, LANG);
    expect(active(A)).toEqual([{ id: LANG, step: 0, count: 0 }]);
    expect(lastToast(A)).toContain(SECT_QUEST_BY_ID[LANG]!.title);
    expect(stateOf(A, LANG)).toBe("active");
    expect(lh.quests.at(-1)!.msg.active.map((x) => x.id)).toContain(LANG); // sổ nhiệm vụ gửi cho chủ
  });

  it("nhận lần hai khi đang làm: quest_active, không nhân đôi", async () => {
    await seed();
    await join(A);
    await accept(A, LANG);
    await accept(A, LANG);
    expect(active(A)).toHaveLength(1);
    expect(lastToast(A)).toBe(failText("quest_active"));
  });

  it("id sai bậc / không có hôm nay / id độc / sai kiểu: quest_unavailable, không vào sổ", async () => {
    await seed();
    await join(A);
    for (const bad of [
      "st_tru_lang.t1", // bản bậc Trúc Cơ: người ở Luyện Khí không nhận
      "st_khong_co.t0",
      "constructor",
      "__proto__",
      "st_tru_lang", // thiếu hậu tố bậc
      "",
      7,
      null,
      { x: 1 },
    ]) {
      await accept(A, bad);
      expect(lastToast(A), String(bad)).toBe(failText("quest_unavailable"));
    }
    expect(active(A)).toEqual([]);
  });

  it("thiếu / sai payload (không có questId): quest_unavailable", async () => {
    await seed();
    await join(A);
    await sectQuestAccept(lh.w, A, undefined);
    await sectQuestAccept(lh.w, A, "st_tru_lang.t0");
    await sectQuestAccept(lh.w, A, {});
    expect(lastToast(A)).toBe(failText("quest_unavailable"));
    expect(active(A)).toEqual([]);
  });

  it("không ở tông môn nào: not_in_sect; đã gục: down (chuỗi chung); đang qua cổng: error", async () => {
    await seed();
    // B có trong tông nhưng người chơi "Cuoi" thì không
    addPlayer(lh.w, "Cuoi", 1, 8);
    await accept("Cuoi", LANG);
    expect(lastToast("Cuoi")).toBe(failText("not_in_sect"));
    await join(A);
    lh.w.state.players.get(A)!.dead = true;
    await accept(A, LANG);
    expect(lastToast(A)).toBe(failText("down"));
    lh.w.state.players.get(A)!.dead = false;
    lh.w.ctrl.get(A)!.travelling = true;
    await accept(A, LANG);
    expect(lastToast(A)).toBe(failText("error"));
    expect(active(A)).toEqual([]);
  });

  it("đã trả hôm nay: quest_done (khoá theo MẪU, nhận lại bản bậc nào cũng không được); sang ngày mới thì nhận lại được", async () => {
    await seed();
    await join(A);
    await doLang();
    await turnIn(A, LANG);
    expect(stateOf(A, LANG)).toBe("done");
    await accept(A, LANG);
    expect(lastToast(A)).toBe(failText("quest_done"));
    expect(active(A)).toEqual([]);
    // sang ngày mới (00:00 giờ VN kế tiếp)
    now += DAY;
    lh.w.now = now;
    await accept(A, LANG);
    expect(active(A)).toEqual([{ id: LANG, step: 0, count: 0 }]);
  });

  it("bước đầu đã đạt sẵn (đủ nanh sói trong túi): nhận xong là sẵn sàng trả ngay", async () => {
    await seed();
    await join(A);
    addToInventory(lh.w.ctrl.get(A)!.inv, "nanh_soi", 8);
    await accept(A, NANH);
    expect(active(A)[0]).toMatchObject({ id: NANH, step: 1 }); // bước nộp đồ đạt ngay: qua bước
  });
});

describe("tiến độ đi chung bộ máy nhiệm vụ", () => {
  it("hạ quái cộng tiến độ nhiệm vụ tông; sổ lưu / nạp lại GIỮ nhiệm vụ tông đang làm (`sanitizeQuests`)", async () => {
    await seed();
    await join(A);
    await accept(A, LANG);
    kill(A, "lang", 4);
    expect(active(A)[0]).toMatchObject({ id: LANG, step: 0, count: 4 });
    const reloaded = sanitizeQuests(JSON.parse(JSON.stringify(lh.w.ctrl.get(A)!.quests)));
    expect(reloaded.active).toEqual([{ id: LANG, step: 0, count: 4 }]);
    // id lạ / độc trong file lưu bị bỏ, không ném
    const junk = sanitizeQuests({
      active: [
        { id: "constructor", step: 0, count: 0 },
        { id: "__proto__", step: 0, count: 0 },
        { id: "st_khong_co.t0", step: 0, count: 0 },
        { id: LANG, step: 99, count: -5 },
      ],
    });
    expect(junk.active).toEqual([{ id: LANG, step: 1, count: 0 }]); // bước kẹp về số bước tối đa, đếm về 0
  });
});

describe("trả nhiệm vụ: thứ tự và phần thưởng", () => {
  it("đủ tiến độ: +20 cống hiến (một lần, qua award), tu vi thưởng, gỡ khỏi sổ, ảnh chụp 'done', audit sect.quest_turnin + sect.earn, lưu hồ sơ", async () => {
    await seed();
    await join(A);
    await doLang();
    const exp0 = lh.w.state.players.get(A)!.exp;
    let saved = 0;
    lh.w.onSaveNow = async () => (saved++, true);
    await turnIn(A, LANG);
    const me = await meOf(A);
    expect(me.contrib).toBe(20);
    expect(me.merit).toBe(20);
    expect(me.today!.quests).toEqual(["st_tru_lang"]); // khoá theo MẪU
    expect((await store.get("t1"))!.points).toBe(20);
    expect(lh.w.state.players.get(A)!.exp).toBeGreaterThan(exp0); // tu vi thưởng qua gainExp
    expect(active(A)).toEqual([]);
    expect(stateOf(A, LANG)).toBe("done");
    expect(lastHall(A)!.me.contrib).toBe(20);
    expect(lastToast(A)).toContain("+20 cống hiến");
    expect(saved).toBeGreaterThan(0);
    expect(audit.map((e) => e.ev)).toEqual(
      expect.arrayContaining(["sect.earn", "sect.quest_turnin"]),
    );
    expect(audit.find((e) => e.ev === "sect.quest_turnin")!.f).toMatchObject({
      name: A,
      questId: LANG,
      amount: 20,
    });
    expect(audit.find((e) => e.ev === "sect.earn")!.f).toMatchObject({
      source: "quest",
      amount: 20,
    });
  });

  it("chưa đủ tiến độ: từ chối, không mất gì, nhiệm vụ còn nguyên; chưa nhận: quest_unavailable", async () => {
    await seed();
    await join(A);
    await accept(A, LANG);
    kill(A, "lang", 9);
    await turnIn(A, LANG);
    expect(lastToast(A)).toContain("chưa hoàn thành");
    expect((await meOf(A)).contrib ?? 0).toBe(0);
    expect(active(A)).toHaveLength(1);
    await turnIn(A, NANH); // chưa nhận
    expect(lastToast(A)).toBe(failText("quest_unavailable"));
  });

  it("trả lần hai (đã trả hôm nay): không có gì để trả, cống hiến KHÔNG nhân đôi", async () => {
    await seed();
    await join(A);
    await doLang();
    await turnIn(A, LANG);
    await turnIn(A, LANG);
    await turnIn(A, LANG);
    expect((await meOf(A)).contrib).toBe(20);
    expect(lastToast(A)).toBe(failText("quest_done"));
  });

  it("trả hai lần ĐỒNG THỜI: chỉ một lần được (khoá busy + sổ ngày), cống hiến đúng 20", async () => {
    await seed();
    await join(A);
    await doLang();
    await Promise.all([turnIn(A, LANG), turnIn(A, LANG), turnIn(A, LANG)]);
    expect((await meOf(A)).contrib).toBe(20);
    expect(active(A)).toEqual([]);
  });

  it("nhiệm vụ nộp đồ: trừ đúng 8 nanh sói, +30 cống hiến; thiếu đồ thì từ chối và giữ nguyên túi", async () => {
    await seed();
    await join(A);
    const c = lh.w.ctrl.get(A)!;
    addToInventory(c.inv, "nanh_soi", 7);
    await accept(A, NANH);
    await turnIn(A, NANH);
    expect(lastToast(A)).toContain("chưa hoàn thành");
    expect(c.inv.reduce((s, x) => s + (x?.itemId === "nanh_soi" ? x.qty : 0), 0)).toBe(7);
    addToInventory(c.inv, "nanh_soi", 3); // đủ 10: trừ 8, còn 2
    onMonsterKilled(lh.w, A, "lang"); // kích hoạt `refresh` tiến độ
    await turnIn(A, NANH);
    expect((await meOf(A)).contrib).toBe(30);
    expect(c.inv.reduce((s, x) => s + (x?.itemId === "nanh_soi" ? x.qty : 0), 0)).toBe(2);
  });

  it("thưởng đồ (2 Hồi Huyết Đan) vào túi; túi ĐẦY thì từ chối TRƯỚC khi đánh dấu: không mất cống hiến, nhiệm vụ còn nguyên, trả được sau khi dọn túi", async () => {
    await seed();
    await join(A);
    const c = lh.w.ctrl.get(A)!;
    await accept(A, HO);
    kill(A, "ho", 3);
    // đầy túi bằng món khác nhau
    const filler = ["long_tho", "nanh_soi", "tu_khi_dan", "da_soi"];
    let k = 0;
    while (c.inv.filter((s) => s).length < INVENTORY_SLOTS) {
      const id = filler[k % filler.length]!;
      const before = c.inv.filter((s) => s).length;
      addToInventory(c.inv, id, 9999);
      if (c.inv.filter((s) => s).length === before) k++;
      if (k > 40) break;
    }
    if (c.inv.filter((s) => s).length < INVENTORY_SLOTS) {
      for (let i = 0; i < INVENTORY_SLOTS; i++)
        if (!c.inv[i]) c.inv[i] = { itemId: "long_tho", qty: 1 };
    }
    await turnIn(A, HO);
    expect(lastToast(A)).toContain("Túi đồ đã đầy");
    expect((await meOf(A)).today?.quests ?? []).toEqual([]); // CHƯA đánh dấu
    expect((await meOf(A)).contrib ?? 0).toBe(0);
    expect(active(A)).toHaveLength(1);
    // dọn túi rồi trả
    c.inv.fill(null as never);
    await turnIn(A, HO);
    expect((await meOf(A)).contrib).toBe(40);
    expect(c.inv.reduce((s, x) => s + (x?.itemId === "hoi_huyet_dan" ? x.qty : 0), 0)).toBe(2);
  });
});

describe("chờ sang ngày, trần ngày, người chết", () => {
  it("vào tông CÙNG ngày (chưa kiếm được): trả bị từ chối not_warm, nhiệm vụ còn nguyên, KHÔNG mất gì; sang ngày trả được", async () => {
    await seed(1000);
    await join(A);
    await doLang();
    await turnIn(A, LANG);
    expect(lastToast(A)).toBe(failText("not_warm"));
    expect((await meOf(A)).contrib ?? 0).toBe(0);
    expect(active(A)).toHaveLength(1);
    expect(active(A)[0]).toMatchObject({ id: LANG, step: 1 });
    now += DAY;
    lh.w.now = now;
    await turnIn(A, LANG);
    expect((await meOf(A)).contrib).toBe(20);
  });

  it("cờ chờ sang ngày TẮT (dev / E2E): trả ngay", async () => {
    await seed(1000);
    lh.w.sectEarnWarmup = false;
    await join(A);
    await doLang();
    await turnIn(A, LANG);
    expect((await meOf(A)).contrib).toBe(20);
  });

  /** Đặt sổ ngày của A: đã kiếm `earned` hôm nay. */
  const setEarned = (earned: number) =>
    store.update("t1", (s) => ({
      ...s,
      members: s.members.map((m) =>
        m.soulKey === keyOf(A)
          ? {
              ...m,
              today: { day: dayKey(now), earned, deposit: 0, quests: [], dungeon: false, buys: {} },
            }
          : m,
      ),
    }));

  it("hết trần ngày (đã kiếm đủ 140): trả bị từ chối earn_cap, nhiệm vụ còn nguyên, KHÔNG mất gì; ngày mai trả được", async () => {
    await seed();
    await setEarned(SECT_EARN_DAY_CAP);
    await join(A);
    await doLang();
    await turnIn(A, LANG);
    expect(lastToast(A)).toBe(failText("earn_cap"));
    expect((await meOf(A)).contrib ?? 0).toBe(0);
    expect(active(A)).toHaveLength(1);
    expect(active(A)[0]).toMatchObject({ id: LANG, step: 1 });
    now += DAY;
    lh.w.now = now;
    await turnIn(A, LANG);
    expect((await meOf(A)).contrib).toBe(20);
  });

  it("còn dưới trần (135 / 140): nhiệm vụ vẫn xong, cống hiến kẹp về phần còn lại (+5), không vượt trần ngày", async () => {
    await seed();
    await setEarned(SECT_EARN_DAY_CAP - 5);
    await join(A);
    await doLang();
    await turnIn(A, LANG);
    const me = await meOf(A);
    expect(me.contrib).toBe(5);
    expect(me.today!.earned).toBe(SECT_EARN_DAY_CAP);
    expect(me.today!.quests).toEqual(["st_tru_lang"]);
    expect(active(A)).toEqual([]);
    expect(lastToast(A)).toContain("+5 cống hiến");
  });

  it("gục giữa lúc chờ máy chủ: cống hiến ĐÃ tính (một lần) nhưng KHÔNG đồ / tu vi cho người chết; không trả được lần hai", async () => {
    await seed();
    await join(A);
    await doLang();
    const real = svc.award.bind(svc);
    svc.award = (async (...args: Parameters<typeof real>) => {
      lh.w.state.players.get(A)!.dead = true; // bị hạ đúng lúc `award` đang chạy
      return real(...args);
    }) as typeof svc.award;
    const exp0 = lh.w.state.players.get(A)!.exp;
    await turnIn(A, LANG);
    svc.award = real;
    expect(lh.w.state.players.get(A)!.exp).toBe(exp0);
    lh.w.state.players.get(A)!.dead = false;
    expect((await meOf(A)).contrib).toBe(20); // sổ ngày đã đánh dấu
    await turnIn(A, LANG);
    expect((await meOf(A)).contrib).toBe(20); // không trả được lần hai
  });

  it("lưu hồ sơ lỗi sau khi đã trả: vẫn KHÔNG trả được lần hai (sổ ngày nằm ở bản ghi tông môn)", async () => {
    await seed();
    await join(A);
    await doLang();
    lh.w.onSaveNow = async () => false;
    await turnIn(A, LANG);
    expect((await meOf(A)).contrib).toBe(20);
    // giả lập sập + nạp lại: hồ sơ cũ còn nhiệm vụ đang làm
    lh.w.ctrl.get(A)!.quests.active.push({ id: LANG, step: 1, count: 0 });
    await turnIn(A, LANG);
    expect((await meOf(A)).contrib).toBe(20);
    expect(lastToast(A)).toBe(failText("quest_done"));
  });
});

describe("đổi bậc / đầu thai / nhảy tông giữa ngày", () => {
  it("nhận ở Luyện Khí rồi đột phá Trúc Cơ: ảnh chụp báo 'active' cho bản MỚI, trả bằng id mới vẫn được (cùng một mẫu), cống hiến đúng 20", async () => {
    await seed();
    await join(A);
    await doLang();
    lh.w.state.players.get(A)!.realm = 2; // đột phá (bản `.t1` của cùng mẫu)
    lh.w.state.players.get(A)!.tier = 0;
    await sectQuestAccept(lh.w, A, { questId: "st_tru_lang.t1" });
    expect(lastToast(A)).toBe(failText("quest_active")); // cùng mẫu đang làm
    await turnIn(A, "st_tru_lang.t1");
    expect((await meOf(A)).contrib).toBe(20);
    expect((await meOf(A)).today!.quests).toEqual(["st_tru_lang"]);
    // làm lại bản mới cùng ngày: không được
    await sectQuestAccept(lh.w, A, { questId: "st_tru_lang.t1" });
    expect(lastToast(A)).toBe(failText("quest_done"));
  });

  it("đầu thai giữa ngày (cùng linh hồn, sổ nhiệm vụ trống): vẫn quest_done, không làm lại để kiếm thêm", async () => {
    await seed();
    await join(A);
    await doLang();
    await turnIn(A, LANG);
    lh.w.ctrl.get(A)!.quests = { active: [], done: [], daily: {} }; // kiếp mới: sổ trắng
    await accept(A, LANG);
    expect(lastToast(A)).toBe(failText("quest_done"));
    expect((await meOf(A)).contrib).toBe(20);
  });
});

describe("tin nhắn bị lạm dụng", () => {
  it("tin xấu cho cả hai tin nhắn (không ném, không đổi gì)", async () => {
    await seed();
    await join(A);
    for (const bad of [
      undefined,
      null,
      0,
      "x",
      [],
      {},
      { questId: 5 },
      { questId: "" },
      { questId: ["a"] },
    ]) {
      await sectQuestAccept(lh.w, A, bad);
      await sectQuestTurnIn(lh.w, A, bad);
    }
    expect(active(A)).toEqual([]);
    expect((await meOf(A)).contrib ?? 0).toBe(0);
  });

  it("`SECTS=off` (không có dịch vụ): từ chối disabled", async () => {
    await seed();
    await join(A);
    lh.w.sectService = null;
    await accept(A, LANG);
    expect(lastToast(A)).toBe(failText("disabled"));
    await turnIn(A, LANG);
    expect(lastToast(A)).toBe(failText("disabled"));
  });
});

describe("nhiệm vụ quá ngày và sổ nhiệm vụ đầy (góp ý của B ở #895)", () => {
  const FAKE = "st_gia";
  /** Thêm tạm một MẪU thứ hai cùng độ khó 1 (bảng mẫu M8.1 chỉ có một mẫu mỗi độ khó nên ô không xoay; M8.7 sẽ có >= 12 mẫu), dọn sau mỗi ca. */
  const withFakeTemplate = async (fn: () => Promise<void>) => {
    const base = SECT_QUESTS.find((t) => t.id === "st_tru_lang")!;
    const fake: SectQuestTemplate = { ...base, id: FAKE, title: "Trừ sói giả" };
    (SECT_QUESTS as SectQuestTemplate[]).push(fake);
    SECT_QUEST_TEMPLATE_BY_ID[FAKE] = fake;
    SECT_QUEST_BY_ID[`${FAKE}.t0`] = {
      ...SECT_QUEST_BY_ID[LANG]!,
      id: `${FAKE}.t0`,
      title: "Trừ sói giả",
    };
    try {
      await fn();
    } finally {
      (SECT_QUESTS as SectQuestTemplate[]).pop();
      delete SECT_QUEST_TEMPLATE_BY_ID[FAKE];
      delete SECT_QUEST_BY_ID[`${FAKE}.t0`];
    }
  };
  /** Ô độ khó 1 của tông "t1" ở ngày thứ `k` kể từ mốc test. */
  const slot0 = (k: number) => sectQuestSlots("t1", dayKey(1_700_000_000_000 + k * DAY))[0]!;
  /** Ngày k đầu tiên mà ô độ khó 1 ĐỔI sang mẫu khác ở ngày k + 1 (hoặc GIỮ NGUYÊN, nếu `same`). */
  const findDay = (same: boolean) => {
    for (let k = 0; k < 90; k++) if ((slot0(k) === slot0(k + 1)) === same) return k;
    throw new Error("không tìm được ngày cho ca xoay ô");
  };

  it("hôm sau ô đổi sang mẫu khác: xin ảnh chụp Nội vụ gỡ nhiệm vụ tông quá ngày khỏi sổ (không chất đống, không kẹt không trả được)", async () => {
    await withFakeTemplate(async () => {
      const k = findDay(false);
      now += k * DAY;
      lh.w.now = now;
      await seed();
      await join(A);
      const old = `${slot0(k)}.t0`;
      await accept(A, old);
      expect(active(A).map((x) => x.id)).toEqual([old]);
      now += DAY; // sang ngày: ô độ khó 1 đã đổi
      lh.w.now = now;
      const { sectHallGet } = await import("./sect");
      await sectHallGet(lh.w, A, {});
      expect(active(A)).toEqual([]);
      expect(lh.quests.at(-1)!.msg.active).toEqual([]); // sổ gửi lại cho chủ
      expect(
        lh.toasts.filter((t) => t.sid === A).some((t) => t.msg.text.includes("đã hết hạn")),
      ).toBe(true); // báo vì sao
      expect(lastHall(A)!.quests[0]!.questId).toBe(`${slot0(k + 1)}.t0`);
      expect(lastHall(A)!.quests[0]!.state).toBe("offer");
    });
  });

  it("trả nhiệm vụ quá ngày: quest_unavailable VÀ gỡ khỏi sổ; không cộng cống hiến", async () => {
    await withFakeTemplate(async () => {
      const k = findDay(false);
      now += k * DAY;
      lh.w.now = now;
      await seed();
      await join(A);
      const old = `${slot0(k)}.t0`;
      await accept(A, old);
      kill(A, "lang", 10);
      now += DAY;
      lh.w.now = now;
      await turnIn(A, old);
      expect(lastToast(A)).toBe(failText("quest_unavailable"));
      expect(active(A)).toEqual([]);
      expect((await meOf(A)).contrib ?? 0).toBe(0);
    });
  });

  it("mẫu vẫn nằm trong ô hôm sau: GIỮ nhiệm vụ và tiến độ qua nửa đêm", async () => {
    await withFakeTemplate(async () => {
      const k = findDay(true);
      now += k * DAY;
      lh.w.now = now;
      await seed();
      await join(A);
      const same = `${slot0(k)}.t0`;
      await accept(A, same);
      kill(A, "lang", 4);
      now += DAY;
      lh.w.now = now;
      const { sectHallGet } = await import("./sect");
      await sectHallGet(lh.w, A, {});
      expect(active(A)).toEqual([{ id: same, step: 0, count: 4 }]);
      expect(lh.toasts.some((t) => t.msg.text.includes("đã hết hạn"))).toBe(false); // không gỡ gì thì không báo
    });
  });

  it("nhận nhiệm vụ mới khi sổ đầy vì nhiệm vụ tông quá ngày: gỡ cái quá ngày TRƯỚC khi kiểm sổ đầy (không kẹt)", async () => {
    await withFakeTemplate(async () => {
      const k = findDay(false);
      now += k * DAY;
      lh.w.now = now;
      await seed();
      await join(A);
      const c = lh.w.ctrl.get(A)!;
      await accept(A, `${slot0(k)}.t0`);
      for (const q of QUESTS.slice(0, MAX_ACTIVE_QUESTS - 1))
        c.quests.active.push({ id: q.id, step: 0, count: 0 });
      expect(active(A)).toHaveLength(MAX_ACTIVE_QUESTS); // đầy, trong đó có 1 nhiệm vụ tông của hôm qua
      now += DAY;
      lh.w.now = now;
      const today = `${slot0(k + 1)}.t0`;
      await accept(A, today);
      expect(active(A).map((x) => x.id)).toContain(today);
      expect(active(A)).toHaveLength(MAX_ACTIVE_QUESTS);
    });
  });

  it("sổ nhiệm vụ đầy (MAX_ACTIVE_QUESTS): từ chối nhận, không thêm, báo rõ lý do; bỏ bớt thì nhận được", async () => {
    await seed();
    await join(A);
    const c = lh.w.ctrl.get(A)!;
    for (const q of QUESTS.slice(0, MAX_ACTIVE_QUESTS))
      c.quests.active.push({ id: q.id, step: 0, count: 0 });
    expect(active(A)).toHaveLength(MAX_ACTIVE_QUESTS);
    await accept(A, LANG);
    expect(lastToast(A)).toContain("Sổ nhiệm vụ đã đầy");
    expect(active(A)).toHaveLength(MAX_ACTIVE_QUESTS);
    c.quests.active.pop();
    await accept(A, LANG);
    expect(active(A).at(-1)).toMatchObject({ id: LANG });
  });
});
