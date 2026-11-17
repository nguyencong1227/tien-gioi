import { describe, expect, it } from "vitest";
import { DEFAULT_MAP_ID, getMap } from "@tien-gioi/shared";
import {
  clientCanChallenge,
  duelEndReasonText,
  duelResultTitle,
  formatDuelCountdown,
  formatDuelInviteCountdown,
  isMockDuelEnabled,
  MOCK_DUEL_SAMPLES,
  toDuelParty,
} from "./duel";

describe("client duel pure logic", () => {
  it("formatDuelCountdown định dạng MM:SS an toàn", () => {
    expect(formatDuelCountdown(0)).toBe("00:00");
    expect(formatDuelCountdown(-500)).toBe("00:00");
    expect(formatDuelCountdown(NaN)).toBe("00:00");
    expect(formatDuelCountdown(5_000)).toBe("00:05");
    expect(formatDuelCountdown(65_000)).toBe("01:05");
    expect(formatDuelCountdown(180_000)).toBe("03:00");
  });

  it("formatDuelInviteCountdown định dạng đếm ngược giây", () => {
    expect(formatDuelInviteCountdown(0)).toBe("0s");
    expect(formatDuelInviteCountdown(-10)).toBe("0s");
    expect(formatDuelInviteCountdown(19_500)).toBe("20s");
    expect(formatDuelInviteCountdown(4_100)).toBe("5s");
  });

  it("duelResultTitle trả đúng tiêu đề theo kết quả", () => {
    expect(duelResultTitle("won")).toBe("ĐẠI THẮNG QUYẾT ĐẤU");
    expect(duelResultTitle("lost")).toBe("CHIẾN BẠI");
    expect(duelResultTitle("draw")).toBe("BẤT PHÂN THẮNG BẠI");
  });

  it("duelEndReasonText giải thích đầy đủ các lý do kết thúc", () => {
    expect(duelEndReasonText("ko", "won", "Ngô Tử Khiêm")).toContain("Đã đánh gục Ngô Tử Khiêm!");
    expect(duelEndReasonText("ko", "lost", "Ngô Tử Khiêm")).toContain(
      "Đã bị Ngô Tử Khiêm đánh gục!",
    );
    expect(duelEndReasonText("yield", "won", "Ngô Tử Khiêm")).toContain(
      "Ngô Tử Khiêm đã xin đầu hàng.",
    );
    expect(duelEndReasonText("yield", "lost", "Ngô Tử Khiêm")).toContain(
      "Đạo hữu đã nhận thua đầu hàng.",
    );
    expect(duelEndReasonText("fled", "won", "Ngô Tử Khiêm")).toContain(
      "Ngô Tử Khiêm đã rời khỏi lôi đài quyết đấu.",
    );
    expect(duelEndReasonText("fled", "lost", "Ngô Tử Khiêm")).toContain(
      "Đạo hữu đã rời quá xa lôi đài quyết đấu.",
    );
    expect(duelEndReasonText("timeout", "draw")).toContain(
      "Hết thời gian quyết đấu, hai bên bất phân thắng bại.",
    );
    expect(duelEndReasonText("disconnect", "won", "Ngô Tử Khiêm")).toContain(
      "Ngô Tử Khiêm đã mất kết nối.",
    );
  });

  it("toDuelParty trích xuất đúng thông tin người chơi và vùng an toàn", () => {
    const map = getMap(DEFAULT_MAP_ID)!;
    const safePos = { x: map.townPx.x, y: map.townPx.y };
    const wildPos = { x: 100, y: 100 };

    const p1 = toDuelParty({ name: "Phó Hồng Ngạn", dead: false, duel: true }, safePos, map);
    expect(p1.name).toBe("Phó Hồng Ngạn");
    expect(p1.alive).toBe(true);
    expect(p1.inSafe).toBe(true);
    expect(p1.inDuel).toBe(true);

    const p2 = toDuelParty({ name: "Giang Tĩnh Uyên", dead: true, duel: false }, wildPos, map);
    expect(p2.name).toBe("Giang Tĩnh Uyên");
    expect(p2.alive).toBe(false);
    expect(p2.inSafe).toBe(false);
    expect(p2.inDuel).toBe(false);
  });

  it("clientCanChallenge kiểm tra khoảng cách, an toàn, trạng thái trận đấu", () => {
    const map = getMap(DEFAULT_MAP_ID)!;
    const wild1 = { x: 100, y: 100 };
    const wild2 = { x: 200, y: 100 }; // cách 100px <= 400px
    const wildFar = { x: 900, y: 100 }; // cách 800px > 400px
    const safePos = { x: map.townPx.x, y: map.townPx.y };

    const self = { name: "Vân Hạc", dead: false };
    const target = { name: "Khinh Trần", dead: false };

    // Tự thách chính mình
    expect(clientCanChallenge(self, wild1, self, wild1, map).ok).toBe(false);

    // Ở khu an toàn
    expect(clientCanChallenge(self, safePos, target, wild2, map).ok).toBe(false);
    expect(clientCanChallenge(self, wild1, target, safePos, map).ok).toBe(false);

    // Quá xa
    const farCheck = clientCanChallenge(self, wild1, target, wildFar, map);
    expect(farCheck.ok).toBe(false);
    if (!farCheck.ok) expect(farCheck.reason).toBe("too_far");

    // Đang trong trận
    expect(clientCanChallenge({ ...self, duel: true }, wild1, target, wild2, map).ok).toBe(false);
    expect(clientCanChallenge(self, wild1, { ...target, duel: true }, wild2, map).ok).toBe(false);

    // Trong bí cảnh
    expect(clientCanChallenge(self, wild1, target, wild2, map, true).ok).toBe(false);

    // Hợp lệ ngoài hoang dã gần nhau
    expect(clientCanChallenge(self, wild1, target, wild2, map).ok).toBe(true);
  });

  it("MOCK_DUEL_SAMPLES tạo đúng dữ liệu mẫu cho dev", () => {
    const inv = MOCK_DUEL_SAMPLES.invited("Kha Bích Hạ");
    expect(inv.from).toBe("Kha Bích Hạ");
    expect(inv.ttlMs).toBeGreaterThan(0);

    const stFight = MOCK_DUEL_SAMPLES.stateFighting("Kha Bích Hạ");
    expect(stFight.phase).toBe("fight");
    expect(stFight.opponent).toBe("Kha Bích Hạ");

    const end = MOCK_DUEL_SAMPLES.endWon("Kha Bích Hạ");
    expect(end.result).toBe("won");
  });

  it("isMockDuelEnabled kiểm tra URL query ?duel=mock", () => {
    expect(isMockDuelEnabled("?duel=mock", true)).toBe(true);
    expect(isMockDuelEnabled("?duel=mock&debug=1", false)).toBe(true);
    expect(isMockDuelEnabled("?duel=mock", false)).toBe(false);
    expect(isMockDuelEnabled("?duel=other", true)).toBe(false);
    expect(isMockDuelEnabled("", true)).toBe(false);
  });

  it("thông điệp gục khi thua thách đấu (KO) không hứa về Lạc Hà Trấn", () => {
    const endLost = MOCK_DUEL_SAMPLES.endLost("Ngô Tử Khiêm");
    expect(endLost.result).toBe("lost");
    expect(endLost.reason).toBe("ko");

    const reason = duelEndReasonText(endLost.reason, endLost.result, "Ngô Tử Khiêm");
    expect(reason).toContain("Đã bị Ngô Tử Khiêm đánh gục!");
    expect(reason).not.toContain("Lạc Hà Trấn");
  });
});
