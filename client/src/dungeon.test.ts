import { describe, it, expect } from "vitest";
import {
  buildMockThuMonDialog,
  dungeonEndReasonText,
  dungeonFallenDeathText,
  dungeonFallenSubText,
  dungeonFallenToastText,
  dungeonNoRewardText,
  dungeonPhaseInfo,
  formatBossView,
  formatDungeonCountdown,
  formatDungeonRewardItems,
  formatInviteCountdown,
  isMockDungeonEnabled,
  isMockDungeonFallen,
  MOCK_DUNGEON_SAMPLES,
  shouldOpenEndModal,
} from "./dungeon";
import { LINH_HU_MAP_ID } from "@tien-gioi/shared";

describe("dungeon client pure logic", () => {
  it("formatDungeonCountdown định dạng MM:SS chuẩn xác và an toàn với NaN / âm", () => {
    expect(formatDungeonCountdown(12 * 60_000)).toBe("12:00");
    expect(formatDungeonCountdown(65_000)).toBe("01:05");
    expect(formatDungeonCountdown(9_100)).toBe("00:10");
    expect(formatDungeonCountdown(0)).toBe("00:00");
    expect(formatDungeonCountdown(-5000)).toBe("00:00");
    expect(formatDungeonCountdown(Number.NaN)).toBe("00:00");
    expect(formatDungeonCountdown(Number.POSITIVE_INFINITY)).toBe("00:00");
  });

  it("formatInviteCountdown định dạng giây đếm ngược chuẩn xác", () => {
    expect(formatInviteCountdown(60_000)).toBe("60s");
    expect(formatInviteCountdown(14_200)).toBe("15s");
    expect(formatInviteCountdown(0)).toBe("0s");
    expect(formatInviteCountdown(-100)).toBe("0s");
    expect(formatInviteCountdown(Number.NaN)).toBe("0s");
  });

  it("dungeonPhaseInfo chọn nhãn và nút rời theo pha", () => {
    expect(dungeonPhaseInfo("gathering")).toEqual({
      label: "Đang tập hợp đội",
      tone: "info",
      showLeaveBtn: true,
    });
    expect(dungeonPhaseInfo("running")).toEqual({
      label: "Đang khiêu chiến",
      tone: "warn",
      showLeaveBtn: true,
    });
    expect(dungeonPhaseInfo("won")).toEqual({
      label: "Đã hạ Yêu Vương · Thu chiến lợi phẩm",
      tone: "good",
      showLeaveBtn: true,
    });
    expect(dungeonPhaseInfo("lost")).toEqual({
      label: "Khiêu chiến thất bại",
      tone: "bad",
      showLeaveBtn: false,
    });
  });

  it("dungeonEndReasonText trả thông điệp tiếng Việt cho mọi lý do kết thúc", () => {
    expect(dungeonEndReasonText("boss_dead")).toContain("Linh Hư Yêu Vương");
    expect(dungeonEndReasonText("timeout")).toContain("hết thời gian");
    expect(dungeonEndReasonText("all_dead")).toContain("ngã xuống");
    expect(dungeonEndReasonText("all_left")).toContain("rời khỏi");
    expect(dungeonEndReasonText("no_entry")).toContain("bước vào");
    expect(dungeonEndReasonText("declined")).toContain("từ chối");
  });

  it("shouldOpenEndModal không mở màn kết quả cho no_entry và declined (chỉ hiện toast)", () => {
    expect(shouldOpenEndModal("boss_dead")).toBe(true);
    expect(shouldOpenEndModal("timeout")).toBe(true);
    expect(shouldOpenEndModal("all_dead")).toBe(true);
    expect(shouldOpenEndModal("all_left")).toBe(true);
    expect(shouldOpenEndModal("no_entry")).toBe(false);
    expect(shouldOpenEndModal("declined")).toBe(false);
  });

  it("dungeonNoRewardText giải thích rõ lý do thắng nhưng không nhận thưởng hoàn thành", () => {
    expect(dungeonNoRewardText("daily_limit")).toContain("đủ lượt thưởng");
    expect(dungeonNoRewardText("no_damage")).toContain("sát thương");
    expect(dungeonNoRewardText(undefined)).toBe("");
  });

  it("formatBossView tính phần trăm máu trùm và ẩn khi boss = null hoặc hp <= 0", () => {
    expect(formatBossView(null, LINH_HU_MAP_ID).visible).toBe(false);
    expect(formatBossView({ hp: 0, maxHp: 20_000 }, LINH_HU_MAP_ID).visible).toBe(false);

    const view = formatBossView({ hp: 13_600, maxHp: 20_000 }, LINH_HU_MAP_ID);
    expect(view.visible).toBe(true);
    expect(view.name).toBe("Linh Hư Yêu Vương");
    expect(view.pct).toBe(68);
    expect(view.text).toBe("13600 / 20000 (68%)");
  });

  it("formatDungeonRewardItems ánh xạ tên vật phẩm từ ITEM_BY_ID an toàn", () => {
    const list = formatDungeonRewardItems([
      { itemId: "tu_khi_dan", qty: 2 },
      { itemId: "constructor", qty: 1 },
      { itemId: "vay_mang", qty: 0 },
    ]);
    expect(list).toEqual([
      { name: "Tụ Khí Đan", qty: 2 },
      { name: "constructor", qty: 1 },
    ]);
  });

  it("isMockDungeonEnabled chỉ bật khi có ?dungeon=mock VÀ (isDev hoặc ?debug)", () => {
    expect(isMockDungeonEnabled("?dungeon=mock", true)).toBe(true);
    expect(isMockDungeonEnabled("?dungeon=mock&debug=1", false)).toBe(true);
    expect(isMockDungeonEnabled("?dungeon=mock", false)).toBe(false);
    expect(isMockDungeonEnabled("?debug=1", true)).toBe(false);
  });

  it("buildMockThuMonDialog dựng đúng nút mở bí cảnh đủ hoặc thiếu điều kiện", () => {
    const okDlg = buildMockThuMonDialog({ canOpen: true });
    expect(okDlg.options[0].disabled).toBeUndefined();
    expect(okDlg.options[0].label).toBe("Mở Linh Hư Bí Cảnh");
    expect(okDlg.options[0].action).toEqual({ kind: "dungeon", dungeonId: "linh_hu" });

    const failDlg = buildMockThuMonDialog({
      canOpen: false,
      failReason: "member_low",
      failWho: "Lâm Kinh Vũ",
    });
    expect(failDlg.options[0].disabled).toBe(true);
    expect(failDlg.options[0].label).toContain("Lâm Kinh Vũ");

    expect(MOCK_DUNGEON_SAMPLES.endWon().result).toBe("won");
    expect(MOCK_DUNGEON_SAMPLES.endLost().result).toBe("lost");
  });

  it("dungeonFallen thông báo gục trong bí cảnh rõ ràng, không hứa hồi sinh Lạc Hà hay Hoàng Tuyền", () => {
    const text1 = dungeonFallenDeathText(3, 2);
    expect(text1).toContain("Ngươi đã gục!");
    expect(text1).toContain("sau 3s");
    expect(text1).toContain("2/3");
    expect(text1).not.toContain("Lạc Hà Trấn sau");
    expect(text1).not.toContain("Hoàng Tuyền");
    expect(text1).not.toContain("Hồi sinh");

    const text2 = dungeonFallenDeathText(0);
    expect(text2).toContain("sau 0s");
    expect(text2).not.toContain("Lượt hôm nay");

    const sub = dungeonFallenSubText();
    expect(sub).toContain("Không mất kiếp");
    expect(sub).toContain("Không mất đồ");
    expect(sub).not.toContain("Hoàng Tuyền");

    const toast1 = dungeonFallenToastText(2);
    expect(toast1).toContain("mất một lượt hôm nay");
    expect(toast1).toContain("Còn 2/3 lượt");
    expect(toast1).not.toContain("Hoàng Tuyền");

    const toast2 = dungeonFallenToastText();
    expect(toast2).toBe("Ngươi đã bị đưa ra khỏi bí cảnh, mất một lượt hôm nay.");
  });

  it("isMockDungeonFallen chỉ bật khi có ?dungeon=fallen VÀ (isDev hoặc ?debug)", () => {
    expect(isMockDungeonFallen("?dungeon=fallen", true)).toBe(true);
    expect(isMockDungeonFallen("?dungeon=fallen&debug=1", false)).toBe(true);
    expect(isMockDungeonFallen("?dungeon=fallen", false)).toBe(false);
    expect(isMockDungeonFallen("?dungeon=mock", true)).toBe(false);
    expect(isMockDungeonFallen("?debug=1", true)).toBe(false);
  });

  it("MOCK_DUNGEON_SAMPLES.fallen trả đúng cấu trúc DungeonFallenMsg", () => {
    const sample = MOCK_DUNGEON_SAMPLES.fallen(1, 2500);
    expect(sample.rewardsLeft).toBe(1);
    expect(sample.exitInMs).toBe(2500);
  });
});
