import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  formatSectInviteCountdown,
  formatSectTreasury,
  formatSectRole,
  formatSectLog,
  formatSectMembersSummary,
  sortSectMembers,
  mergeMemberPresence,
  mapLabelOf,
  sectMemberStatusText,
  sectMemberMeritText,
  sectEldersCap,
  sectMembersCap,
  sectFullText,
  UNKNOWN_MAP_LABEL,
  sectConfirmText,
  isMockSectEnabled,
  MOCK_SECT_SAMPLES,
} from "./sect";
import {
  MAPS,
  DUNGEON_MAPS,
  SECT_ELDERS_MAX,
  SECT_LEVELS,
  SECT_MAX_MEMBERS,
  realmLabel,
} from "@tien-gioi/shared";
import type { SectMember, SectPresenceMsg, SectLogEntry } from "@tien-gioi/shared";

describe("sectConfirmText (hộp xác nhận trong game, #246)", () => {
  it("nêu tên người bị tác động và chữ nút đồng ý riêng cho từng hành động", () => {
    const t = sectConfirmText("transfer", "Lâm Phong");
    expect(t.text).toContain("Lâm Phong");
    expect(t.text).toContain("Tông chủ");
    expect(t.ok).toBe("Nhường vị");
    const k = sectConfirmText("kick", "Tiểu Vân");
    expect(k.text).toContain("Tiểu Vân");
    expect(k.ok).toBe("Trục xuất");
    const l = sectConfirmText("leave");
    expect(l.text).toContain("Rời");
    expect(l.ok).toBe("Rời tông môn");
  });

  it("ba hành động có câu hỏi khác nhau (không dùng chung một câu chung chung)", () => {
    const texts = new Set(
      (["transfer", "kick", "leave"] as const).map((k) => sectConfirmText(k, "A").text),
    );
    expect(texts.size).toBe(3);
  });
});

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
      name: "Bùi Chấn Nhạc",
      kind: "deposit",
      amount: 50000,
    };
    const logStr = formatSectLog(depositLog);
    expect(logStr).toContain("Bùi Chấn Nhạc đã góp +50.000 Linh thạch");

    const withdrawLog: SectLogEntry = {
      at: time,
      name: "Bùi Chấn Nhạc",
      kind: "withdraw",
      amount: 10000,
    };
    const withdrawStr = formatSectLog(withdrawLog);
    expect(withdrawStr).toContain("Bùi Chấn Nhạc đã rút -10.000 Linh thạch");
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
      { name: "Giang Tĩnh Uyên", rank: "chu", joinedAt: 100 },
      { name: "Tống Uyển Thu", rank: "truong_lao", joinedAt: 200 },
      { name: "Đỗ Phi Vân", rank: "de_tu", joinedAt: 300 },
    ];
    const presence: SectPresenceMsg = {
      online: [
        { name: "Giang Tĩnh Uyên", realm: 2, tier: 1, mapId: "hac_phong" },
        { name: "Đỗ Phi Vân", realm: 0, tier: 9, mapId: "lac_ha" },
      ],
    };

    const merged = mergeMemberPresence(members, presence);
    expect(merged).toHaveLength(3);

    const giangTinhUyen = merged.find((m) => m.name === "Giang Tĩnh Uyên");
    expect(giangTinhUyen?.online).toBe(true);
    expect(giangTinhUyen?.mapId).toBe("hac_phong");
    expect(giangTinhUyen?.realm).toBe(2);

    const tongUyenThu = merged.find((m) => m.name === "Tống Uyển Thu");
    expect(tongUyenThu?.online).toBe(false);

    const doPhiVan = merged.find((m) => m.name === "Đỗ Phi Vân");
    expect(doPhiVan?.online).toBe(true);
    expect(doPhiVan?.mapId).toBe("lac_ha");

    // Khớp online với tên tiếng Việt có dấu khác dạng phân rã Unicode (NFC vs NFD)
    const nfcMembers: SectMember[] = [
      { name: "Phó Hồng Ngạn", rank: "chu", joinedAt: 100 }, // NFC
    ];
    const nfdPresence: SectPresenceMsg = {
      online: [{ name: "Phó Hồng Ngạn".normalize("NFD"), realm: 1, tier: 1, mapId: "lac_ha" }],
    };
    const nfdMerged = mergeMemberPresence(nfcMembers, nfdPresence);
    expect(nfdMerged[0].online).toBe(true);
  });

  it("formatSectMembersSummary định dạng chuẩn 'Tổng số: N / 30'", () => {
    expect(formatSectMembersSummary(0)).toBe("Tổng số: 0 / 30");
    expect(formatSectMembersSummary(2)).toBe("Tổng số: 2 / 30");
    expect(formatSectMembersSummary(30)).toBe("Tổng số: 30 / 30");
    expect(formatSectMembersSummary(-5)).toBe("Tổng số: 0 / 30");
    expect(formatSectMembersSummary(NaN)).toBe("Tổng số: 0 / 30");
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
    expect(inv.from).toBe("Bùi Chấn Nhạc");
    expect(inv.sect).toBe("Lạc Hà Môn");
    expect(inv.ttlMs).toBe(30_000);
  });

  it("dữ liệu mẫu và ví dụ nhập tên tông môn không mượn tên của truyện / game khác", () => {
    // Tên môn công / môn phái của truyện khác (quy tắc Asset của AGENTS.md): "Bắc Minh Thần Công", "Tiêu Dao Phái".
    // Khoảng trắng giữa các chữ khớp mọi dạng (cách kép, xuống dòng, NBSP), không phân biệt hoa thường.
    const FOREIGN = /Bắc\s+Minh|Thần\s+Công|Tiêu\s+Dao\s+Phái/iu;
    const sample = JSON.stringify([
      MOCK_SECT_SAMPLES.leaderView(),
      MOCK_SECT_SAMPLES.elderView(),
      MOCK_SECT_SAMPLES.memberView(),
      MOCK_SECT_SAMPLES.presence(),
      MOCK_SECT_SAMPLES.invited(),
    ]);
    expect(sample).not.toMatch(FOREIGN);
    // Ô nhập tên ở trang vào game (người chơi nào cũng thấy dòng gợi ý này).
    const html = readFileSync(resolve(__dirname, "..", "index.html"), "utf8");
    const hint = html.match(/id="sect-input-name"[\s\S]*?placeholder="([^"]*)"/);
    expect(hint, "không tìm thấy placeholder của #sect-input-name").not.toBeNull();
    expect(hint![1]).not.toMatch(FOREIGN);
    // Bộ lọc có răng: bắt đủ các dạng viết.
    for (const t of [
      "Bắc Minh Thần Công",
      "bắc  minh",
      "THẦN\nCÔNG",
      "Tiêu Dao Phái",
      "Bắc\u00a0Minh",
    ])
      expect(FOREIGN.test(t), JSON.stringify(t)).toBe(true);
  });

  it("fmt định dạng số HUD an toàn, không bao giờ in NaN khi giá trị không hợp lệ", async () => {
    const { fmt } = await import("./ui");
    expect(fmt(0)).toBe("0");
    expect(fmt(8000)).toBe("8000");
    expect(fmt(10_000)).toBe("10.0k");
    expect(fmt(1_500_000)).toBe("1.5M");
    expect(fmt(NaN)).toBe("0");
    expect(fmt(undefined as any)).toBe("0");
    expect(fmt(null as any)).toBe("0");
    expect(fmt(Infinity)).toBe("0");
    expect(fmt(-100)).toBe("0");
  });
});

describe("nhãn bản đồ trong bảng tổ đội / tông môn (M6 #409): tên người chơi đọc được, không bao giờ là id thô", () => {
  it("mapLabelOf: mọi bản đồ của game (kể cả bí cảnh, và Âm Sương Trạch khi #404 vào) hiện `MapDef.name`", () => {
    for (const def of [...MAPS, ...DUNGEON_MAPS]) {
      const label = mapLabelOf(def.id);
      expect(label, def.id).toBe(def.name);
      expect(label, def.id).not.toBe(def.id);
    }
  });

  it("mapLabelOf: id lạ / id độc không ném lỗi và không lộ id thô", () => {
    for (const id of ["", "khong_co", "constructor", "__proto__", "toString", "am_suong_2"])
      expect(mapLabelOf(id), id).toBe(UNKNOWN_MAP_LABEL);
  });

  it("sectMemberStatusText: Offline / Online đủ phần / Online thiếu cảnh giới hoặc bản đồ (không còn dấu '·' treo)", () => {
    const base = { name: "A", rank: "de_tu", joinedAt: 1 } as const;
    expect(sectMemberStatusText({ ...base, online: false })).toBe("Offline");
    const full = sectMemberStatusText({
      ...base,
      online: true,
      realm: 2,
      tier: 1,
      mapId: "hac_phong",
    });
    expect(full).toBe(`Online · ${realmLabel(2, 1)} · ${mapLabelOf("hac_phong")}`);
    expect(full).not.toContain("hac_phong");
    expect(sectMemberStatusText({ ...base, online: true, mapId: "lac_ha" })).toBe(
      `Online · ${mapLabelOf("lac_ha")}`,
    );
    expect(sectMemberStatusText({ ...base, online: true })).toBe("Online");
    expect(sectMemberStatusText({ ...base, online: true, realm: 0, tier: 3 }).endsWith("·")).toBe(
      false,
    );
  });
});

describe("sectMemberMeritText: công tích trong danh sách thành viên (M8.6, #843)", () => {
  it("có công tích thì hiện 'Công tích N' (số theo vi-VN); thiếu / 0 / âm / hỏng thì không hiện gì", () => {
    expect(sectMemberMeritText({ merit: 1234 })).toBe("Công tích 1.234");
    expect(sectMemberMeritText({ merit: 5 })).toBe("Công tích 5");
    expect(sectMemberMeritText({ merit: 7.9 })).toBe("Công tích 7");
    for (const bad of [undefined, 0, -3, Number.NaN, Number.POSITIVE_INFINITY, "12", null, {}])
      expect(sectMemberMeritText({ merit: bad }), String(bad)).toBe("");
    expect(sectMemberMeritText({})).toBe("");
  });
});

describe("sectEldersCap: giới hạn Trưởng lão theo CẤP TÔNG, không cứng 3 (M8.6)", () => {
  it("lấy đúng `caps.elders` của ảnh chụp Nội vụ ở mọi cấp (cấp cao thăng được nhiều hơn 3)", () => {
    for (const l of SECT_LEVELS)
      expect(sectEldersCap(l.maxElders), `cấp ${l.level}`).toBe(l.maxElders);
    expect(Math.max(...SECT_LEVELS.map((l) => l.maxElders))).toBeGreaterThan(SECT_ELDERS_MAX);
  });
  it("chưa có ảnh chụp / số hỏng: mức cấp 1 (SECT_ELDERS_MAX), không ném", () => {
    for (const bad of [undefined, null, 0, -1, 2.5, Number.NaN, "5", Number.MAX_VALUE, {}])
      expect(sectEldersCap(bad), String(bad)).toBe(SECT_ELDERS_MAX);
  });
});

describe("sectMembersCap / sectFullText: giới hạn thành viên theo CẤP TÔNG, không cứng 30 (M8.6)", () => {
  it("lấy đúng `caps.members` ở mọi cấp (cấp cao nhận nhiều hơn 30)", () => {
    for (const l of SECT_LEVELS)
      expect(sectMembersCap(l.maxMembers), `cấp ${l.level}`).toBe(l.maxMembers);
    expect(Math.max(...SECT_LEVELS.map((l) => l.maxMembers))).toBeGreaterThan(SECT_MAX_MEMBERS);
  });
  it("chưa có ảnh chụp / số hỏng: mức cấp 1 (SECT_MAX_MEMBERS), không ném", () => {
    for (const bad of [undefined, null, 0, -1, 2.5, Number.NaN, "40", Number.MAX_VALUE, {}])
      expect(sectMembersCap(bad), String(bad)).toBe(SECT_MAX_MEMBERS);
  });
  it("sectFullText: đủ người thì nêu 'đủ (cap/cap)', còn chỗ hoặc số hỏng thì null; tông cấp 3 đang 30 người KHÔNG đủ", () => {
    expect(sectFullText(30, 30)).toBe("Tông môn đã đủ (30/30)");
    expect(sectFullText(40, 40)).toBe("Tông môn đã đủ (40/40)");
    expect(sectFullText(29, 30)).toBeNull();
    expect(sectFullText(30, sectMembersCap(SECT_LEVELS[2]!.maxMembers))).toBeNull();
    expect(sectFullText(Number.NaN, 30)).toBeNull();
    expect(sectFullText(5, Number.NaN)).toBeNull();
  });
});
