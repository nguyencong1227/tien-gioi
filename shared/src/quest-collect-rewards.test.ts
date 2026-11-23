// M66.4 (#1333): nhiệm vụ NỘP ĐỒ (có bước `collect`) trước đây chỉ thưởng tu vi — tu vi cộng im lặng, người chơi so với thanh và
// "cảm thấy chẳng được gì". Bất biến ở đây: mọi nhiệm vụ có bước collect PHẢI thưởng ít nhất một vật phẩm (đan dược hợp bậc là mẫu),
// KHÔNG được chỉ có tu vi. Test này là chốt chặn: thêm nhiệm vụ nộp đồ mà quên vật phẩm thì đỏ. Đột biến (bỏ items một collect quest)
// chứng minh test đỏ — xem PR #1333.
import { describe, expect, it } from "vitest";
import { QUESTS, type QuestDef } from "./index";

/** Tổng qty vật phẩm thưởng (đếm qty, KHÔNG đếm số dòng — một dòng qty:2 vẫn là 2 quyển). */
function rewardItemQty(q: QuestDef): number {
  return (q.rewards.items ?? []).reduce((a, i) => a + (i.qty ?? 1), 0);
}

describe("nhiệm vụ nộp đồ phải có vật phẩm (M66.4 #1333)", () => {
  it("mọi nhiệm vụ có bước collect đều thưởng >= 1 vật phẩm (không chỉ tu vi im lặng)", () => {
    const collectQuests = QUESTS.filter((q) => q.steps.some((s) => s.kind === "collect"));
    expect(collectQuests.length, "phải có ít nhất một nhiệm vụ nộp đồ để kiểm").toBeGreaterThan(0);
    for (const q of collectQuests)
      expect(
        rewardItemQty(q),
        `${q.id}: nhiệm vụ nộp đồ phải thưởng vật phẩm, đừng chỉ tu vi`,
      ).toBeGreaterThan(0);
  });

  it("đột biến chứng minh: collect quest bỏ items (chỉ còn exp) -> rewardItemQty = 0, bị bắt", () => {
    // Giả lập đột biến dữ liệu: một collect quest mà quên thưởng vật phẩm (như nop_nanh / doc_nang_nop trước #1333).
    const mutated: QuestDef = {
      id: "biến-đột-nop",
      title: "Nộp đồ biến đột",
      giver: "cao_thi",
      desc: "Nộp đồ, chỉ thưởng tu vi (đột biến).",
      steps: [{ kind: "collect", itemId: "nanh_soi", count: 5 }],
      rewards: { exp: 50 }, // KHÔNG có items — luật phải bắt được
      talk: { offer: [""], progress: [""], complete: [""] },
    };
    expect(
      rewardItemQty(mutated),
      "collect quest bỏ items -> tổng qty 0, phải bị coi là thiếu vật phẩm",
    ).toBe(0);
  });
});
