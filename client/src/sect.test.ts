import { describe, expect, it } from "vitest";
import {
  formatSectInviteCountdown,
  formatSectTreasury,
  formatSectRole,
  formatSectLog,
  sortSectMembers,
  mergeMemberPresence,
  isMockSectEnabled,
  MOCK_SECT_SAMPLES,
} from "./sect";
import type { SectMember, SectPresenceMsg, SectLogEntry } from "@tien-gioi/shared";

describe("client sect pure logic", () => {
  it("formatSectInviteCountdown định dạng đếm ngược giây hợp lý", () => {
    expect(formatSectInviteCountdown(0)).toBe("0s");
    expect(formatSectInviteCountdown(-500)).toBe("0s");
    expect(formatSectInviteCountdown(NaN)).toBe("0s");
    expect(formatSectInviteCountdown(30_000)).toBe("30s");
    expect(formatSectInviteCountdown(29_100)).toBe("30s");
    expect(formatSectInviteCountdown(4_200)).toBe("5s");
    expect(formatSectInviteCountdown(800)).toBe("1s");
  });

  it("formatSectTreasury định dạng số Linh thạch có phân cách hàng nghìn", () => {
    expect(formatSectTreasury(0)).toBe("0");
    expect(formatSectTreasury(-100)).toBe("0");
    expect(formatSectTreasury(1000)).toBe("1.000");
    expect(formatSectTreasury(125000)).toBe("125.000");
    expect(formatSectTreasury(10000000)).toBe("10.000.000");
  });

  it("formatSectRole trả đúng tên nhãn chức vụ tiếng Việt", () => {
    expect(formatSectRole("chu")).toBe("Tông chủ");
    expect(formatSectRole("truong_lao")).toBe("Trưởng lão");
    expect(formatSectRole("de_tu")).toBe("Đệ tử");
  });

  it("formatSectLog định dạng đúng lịch sử góp và rút", () => {
    const time = new Date("2026-11-10T10:30:00Z").getTime();
    const depositLog: SectLogEntry = {
      at: time,
      name: "Tiêu Phong",
      kind: "deposit",
      amount: 50000,
    };
    const logStr = formatSectLog(depositLog);
    expect(logStr).toContain("Tiêu Phong đã góp +50.000 Linh thạch");

    const withdrawLog: SectLogEntry = {
      at: time,
      name: "Tiêu Phong",
      kind: "withdraw",
      amount: 10000,
    };
    const withdrawStr = formatSectLog(withdrawLog);
    expect(withdrawStr).toContain("Tiêu Phong đã rút -10.000 Linh thạch");
  });

  it("sortSectMembers sắp xếp đúng thứ bậc Tông chủ -> Trưởng lão -> Đệ tử", () => {
    const list: SectMember[] = [
      { name: "Đệ Tử B", rank: "de_tu", joinedAt: 200 },
      { name: "Trưởng Lão", rank: "truong_lao", joinedAt: 150 },
      { name: "Đệ Tử A", rank: "de_tu", joinedAt: 100 },
      { name: "Tông Chủ", rank: "chu", joinedAt: 50 },
    ];
    const sorted = sortSectMembers(list);
    expect(sorted[0].name).toBe("Tông Chủ");
    expect(sorted[1].name).toBe("Trưởng Lão");
    expect(sorted[2].name).toBe("Đệ Tử A");
    expect(sorted[3].name).toBe("Đệ Tử B");
  });

  it("mergeMemberPresence gắn cờ online và thông tin cảnh giới bản đồ", () => {
    const members: SectMember[] = [
      { name: "Hàn Lập", rank: "chu", joinedAt: 100 },
      { name: "Nam Cung Uyển", rank: "truong_lao", joinedAt: 200 },
      { name: "Lệ Phi Vũ", rank: "de_tu", joinedAt: 300 },
    ];
    const presence: SectPresenceMsg = {
      online: [
        { name: "Hàn Lập", realm: 2, tier: 1, mapId: "hac_phong" },
        { name: "Lệ Phi Vũ", realm: 0, tier: 9, mapId: "lac_ha" },
      ],
    };

    const merged = mergeMemberPresence(members, presence);
    expect(merged).toHaveLength(3);

    const hanLap = merged.find((m) => m.name === "Hàn Lập");
    expect(hanLap?.online).toBe(true);
    expect(hanLap?.mapId).toBe("hac_phong");
    expect(hanLap?.realm).toBe(2);

    const uyen = merged.find((m) => m.name === "Nam Cung Uyển");
    expect(uyen?.online).toBe(false);

    const lePhiVu = merged.find((m) => m.name === "Lệ Phi Vũ");
    expect(lePhiVu?.online).toBe(true);
    expect(lePhiVu?.mapId).toBe("lac_ha");
  });

  it("isMockSectEnabled kiểm tra URL query ?sect=mock", () => {
    expect(isMockSectEnabled("?sect=mock", true)).toBe(true);
    expect(isMockSectEnabled("?sect=mock&debug=1", false)).toBe(true);
    expect(isMockSectEnabled("?sect=mock", false)).toBe(false);
    expect(isMockSectEnabled("?sect=other", true)).toBe(false);
    expect(isMockSectEnabled("", true)).toBe(false);
  });

  it("MOCK_SECT_SAMPLES tạo dữ liệu mẫu hợp lệ", () => {
    const leader = MOCK_SECT_SAMPLES.leaderView();
    expect(leader.myRank).toBe("chu");
    expect(leader.members.length).toBeGreaterThan(0);
    expect(leader.coin).toBeGreaterThan(0);

    const elder = MOCK_SECT_SAMPLES.elderView();
    expect(elder.myRank).toBe("truong_lao");

    const member = MOCK_SECT_SAMPLES.memberView();
    expect(member.myRank).toBe("de_tu");

    const presence = MOCK_SECT_SAMPLES.presence();
    expect(presence.online.length).toBeGreaterThan(0);

    const inv = MOCK_SECT_SAMPLES.invited();
    expect(inv.from).toBe("Tiêu Phong");
    expect(inv.sect).toBe("Tiêu Dao Phái");
    expect(inv.ttlMs).toBe(30_000);
  });
});
