import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CURRENCY_NAME, ITEM_BY_ID, QUEST_BY_ID, questRewardMsg } from "@tien-gioi/shared";
import {
  QUEST_REWARD_MAX_ITEMS,
  QUEST_REWARD_MAX_NUM,
  questRewardView,
  sanitizeQuestRewardMsg,
} from "./quest-reward-view";

const withItems = Object.values(QUEST_BY_ID).find((q) => (q.rewards.items?.length ?? 0) > 0)!;
const someItem = Object.keys(ITEM_BY_ID)[0]!;

describe("sanitizeQuestRewardMsg: không tin tin mạng (mục 66)", () => {
  it("tin hợp lệ (dựng bằng questRewardMsg của shared) đi qua nguyên vẹn", () => {
    const m = questRewardMsg(withItems, 123, 45);
    expect(sanitizeQuestRewardMsg(m)).toEqual(m);
  });

  it("không phải object / thiếu questId: null (bỏ tin, không sập)", () => {
    for (const bad of [null, undefined, 0, "x", [], true, {}, { questId: 5 }, { exp: 3 }]) {
      expect(sanitizeQuestRewardMsg(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("số lạ (âm, lẻ, NaN, vô hạn, chữ, quá lớn) kẹp về số nguyên không âm trong trần", () => {
    const r = sanitizeQuestRewardMsg({
      questId: withItems.id,
      exp: -5,
      coin: Infinity,
      items: [],
    })!;
    expect(r.exp).toBe(0);
    expect(r.coin).toBe(0);
    expect(sanitizeQuestRewardMsg({ questId: "x", exp: 7.9, coin: NaN })).toMatchObject({
      exp: 7,
      coin: 0,
    });
    expect(sanitizeQuestRewardMsg({ questId: "x", exp: "9", coin: 1e30 })).toMatchObject({
      exp: 0,
      coin: QUEST_REWARD_MAX_NUM,
    });
  });

  it("vật phẩm: bỏ id lạ / độc, số lượng sai, phần tử không phải object; giữ món đúng", () => {
    const r = sanitizeQuestRewardMsg({
      questId: "x",
      exp: 1,
      coin: 0,
      items: [
        { itemId: someItem, qty: 2 },
        { itemId: "khong_co_mon_nay", qty: 1 },
        { itemId: "constructor", qty: 1 },
        { itemId: "__proto__", qty: 1 },
        { itemId: someItem, qty: 0 },
        { itemId: someItem, qty: -3 },
        { itemId: someItem, qty: 2.7 },
        { itemId: 5, qty: 1 },
        null,
        "chuỗi",
      ],
    })!;
    expect(r.items).toEqual([
      { itemId: someItem, qty: 2 },
      { itemId: someItem, qty: 2 },
    ]);
  });

  it(`tối đa ${QUEST_REWARD_MAX_ITEMS} vật phẩm; items không phải mảng -> rỗng`, () => {
    const many = Array.from({ length: 50 }, () => ({ itemId: someItem, qty: 1 }));
    expect(sanitizeQuestRewardMsg({ questId: "x", items: many })!.items).toHaveLength(
      QUEST_REWARD_MAX_ITEMS,
    );
    expect(sanitizeQuestRewardMsg({ questId: "x", items: "abc" })!.items).toEqual([]);
  });
});

describe("questRewardView: các dòng của bảng thưởng", () => {
  it("tu vi, vật phẩm (kèm số lượng + độ hiếm), Linh thạch theo đúng thứ tự; tiêu đề có tên nhiệm vụ", () => {
    const v = questRewardView({
      questId: withItems.id,
      exp: 1234,
      coin: 500,
      items: [{ itemId: someItem, qty: 3 }],
    });
    expect(v.title).toBe(`Hoàn thành: ${withItems.title}`);
    expect(v.lines.map((l) => l.kind)).toEqual(["exp", "item", "coin"]);
    expect(v.lines[0]!.text).toBe(`+${(1234).toLocaleString("vi-VN")} tu vi`);
    expect(v.lines[1]!.text).toBe(`${ITEM_BY_ID[someItem]!.name} ×3`);
    expect(v.lines[1]!.itemId).toBe(someItem);
    expect(v.lines[1]!.rarity).toBe(ITEM_BY_ID[someItem]!.rarity);
    expect(v.lines[2]!.text).toBe(`+${(500).toLocaleString("vi-VN")} ${CURRENCY_NAME}`);
  });

  it("dòng tu vi và Linh thạch chỉ có khi > 0 (không '+0 tu vi')", () => {
    const v = questRewardView({
      questId: withItems.id,
      exp: 0,
      coin: 0,
      items: [{ itemId: someItem, qty: 1 }],
    });
    expect(v.lines.map((l) => l.kind)).not.toContain("exp");
    expect(v.lines.map((l) => l.kind)).not.toContain("coin");
    expect(v.lines.some((l) => /\+0\b/.test(l.text))).toBe(false);
  });

  it("tu vi 0 mà nhiệm vụ CÓ thưởng tu vi (đã đầy, chờ Đột phá): nói rõ, không im lặng", () => {
    const q = Object.values(QUEST_BY_ID).find((x) => (x.rewards.exp ?? 0) > 0)!;
    const v = questRewardView({ questId: q.id, exp: 0, coin: 0, items: [] });
    expect(v.lines[0]).toMatchObject({ kind: "note" });
    expect(v.lines[0]!.text).toContain("Đột phá");
  });

  it("không có gì để hiện: một dòng chú thích (bảng vẫn báo Hoàn thành); questId lạ -> tiêu đề chung", () => {
    const v = questRewardView({ questId: "khong_co", exp: 0, coin: 0, items: [] });
    expect(v.title).toBe("Hoàn thành nhiệm vụ");
    expect(v.lines).toHaveLength(1);
    expect(v.lines[0]!.kind).toBe("note");
    expect(questRewardView({ questId: "constructor", exp: 0, coin: 0, items: [] }).title).toBe(
      "Hoàn thành nhiệm vụ",
    );
  });
});

describe("dây nối bảng thưởng (canh mã nguồn)", () => {
  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
  const ui = read("./ui.ts");
  const scene = read("./scenes/WorldScene.ts");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  it("WorldScene đăng ký tin `questReward` (qua reg: tin tới sớm được phát lại) và chuyển cho ui", () => {
    expect(scene).toMatch(/reg\("questReward",\s*\(m: unknown\) => ui\.onQuestReward\(m\)\)/);
  });

  it("ui.onQuestReward làm sạch tin rồi mới vẽ, và phát tiếng hoàn thành ở ĐÂY (không còn ở lúc bấm Trả)", () => {
    const i = ui.indexOf("onQuestReward(raw: unknown) {");
    expect(i).toBeGreaterThan(0);
    const body = ui.slice(i, ui.indexOf("\n  },", i));
    expect(body).toContain("sanitizeQuestRewardMsg(raw)");
    expect(body.indexOf("sanitizeQuestRewardMsg")).toBeLessThan(body.indexOf("showQuestReward("));
    expect(body).toContain("sound.questDone()");
    // lúc bấm 'Trả nhiệm vụ' máy chủ chưa xác nhận (túi đầy thì không trả): không phát tiếng ở click
    expect(ui).not.toMatch(/if \(action\.kind === "turnIn"\) sound\.questDone\(\)/);
  });

  it("khung bảng thưởng có trong index.html, ẩn sẵn, không chặn thao tác (aria-live)", () => {
    expect(html).toMatch(
      /<div id="quest-reward"[^>]*role="status"[^>]*aria-live="polite"[^>]*hidden/,
    );
  });
});
