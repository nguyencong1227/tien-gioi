// Logic thuần phía client cho Tông môn (M3 bước 6, #230)
// Không phụ thuộc DOM, an toàn chạy cả trong node / test.

import {
  type SectRank,
  SECT_RANK_LABEL,
  SECT_MAX_MEMBERS,
  sectKey,
  type SectView,
  type SectMember,
  type SectLogEntry,
  type SectPresenceMsg,
  type SectPresenceEntry,
  type SectInvitedMsg,
  compareSectMembers,
} from "@tien-gioi/shared";

/** Định dạng đếm ngược lời mời tông môn (ví dụ: "30s", "5s") */
export function formatSectInviteCountdown(remMs: number): string {
  if (!Number.isFinite(remMs) || remMs <= 0) return "0s";
  const sec = Math.max(1, Math.ceil(remMs / 1000));
  return `${sec}s`;
}

/** Định dạng số dư quỹ tông môn (ví dụ: "1.000", "125.000") */
export function formatSectTreasury(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "0";
  return amount.toLocaleString("vi-VN");
}

/** Chuỗi hiển thị chức vụ */
export function formatSectRole(rank: SectRank): string {
  return SECT_RANK_LABEL[rank] ?? rank;
}

/**
 * Định dạng một dòng biến động kho tông môn
 * Ví dụ: "10:30 · Tiêu Viêm đã góp +50.000 Linh thạch"
 */
export function formatSectLog(log: SectLogEntry): string {
  const d = new Date(log.at);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const timeStr = `${hh}:${mm}`;
  const amountStr = log.amount.toLocaleString("vi-VN");
  if (log.kind === "deposit") {
    return `${timeStr} · ${log.name} đã góp +${amountStr} Linh thạch`;
  }
  return `${timeStr} · ${log.name} đã rút -${amountStr} Linh thạch`;
}

/** Sắp xếp danh sách thành viên bằng compareSectMembers từ shared */
export function sortSectMembers(members: readonly SectMember[]): SectMember[] {
  return [...members].sort(compareSectMembers);
}

/** Định dạng dòng tóm tắt số lượng thành viên tông môn (ví dụ: "Tổng số: 2 / 30") */
export function formatSectMembersSummary(count: number, max: number = SECT_MAX_MEMBERS): string {
  const safeCount = Math.max(0, Number.isFinite(count) ? Math.floor(count) : 0);
  return `Tổng số: ${safeCount} / ${max}`;
}

/** Các hành động tông môn cần hộp xác nhận trong game (#246; "Giải tán" có ô riêng hai bước) */
export type SectConfirmKind = "transfer" | "kick" | "leave";

/** Nội dung hộp xác nhận trong game: câu hỏi + chữ trên nút đồng ý */
export function sectConfirmText(kind: SectConfirmKind, name = ""): { text: string; ok: string } {
  switch (kind) {
    case "transfer":
      return {
        text: `Nhường vị Tông chủ cho ${name}? Ngươi sẽ thành Trưởng lão.`,
        ok: "Nhường vị",
      };
    case "kick":
      return { text: `Trục xuất ${name} khỏi tông môn?`, ok: "Trục xuất" };
    case "leave":
      return { text: "Rời khỏi tông môn? Ngươi sẽ mất biệt hiệu.", ok: "Rời tông môn" };
  }
}

export interface MergedSectMember extends SectMember {
  online: boolean;
  realm?: number;
  tier?: number;
  mapId?: string;
}

/** Kết hợp danh sách thành viên tông môn với trạng thái trực tuyến từ SectPresenceMsg (dùng sectKey NFC) */
export function mergeMemberPresence(
  members: readonly SectMember[],
  presence: SectPresenceMsg | null,
): MergedSectMember[] {
  const onlineMap = new Map<string, SectPresenceEntry>();
  if (presence && Array.isArray(presence.online)) {
    for (const o of presence.online) {
      onlineMap.set(sectKey(o.name), o);
    }
  }

  const sorted = sortSectMembers(members);
  return sorted.map((m) => {
    const onl = onlineMap.get(sectKey(m.name));
    if (onl) {
      return {
        ...m,
        online: true,
        realm: onl.realm,
        tier: onl.tier,
        mapId: onl.mapId,
      };
    }
    return {
      ...m,
      online: false,
    };
  });
}

/** Kiểm tra chế độ giả lập tông môn: chỉ bật khi DEV hoặc có cờ debug / test */
export function isMockSectEnabled(
  search = typeof window !== "undefined" ? (window.location?.search ?? "") : "",
  isDev = import.meta.env.DEV,
): boolean {
  const params = new URLSearchParams(search);
  const requested = params.get("sect") === "mock";
  if (!requested) return false;
  return isDev || params.has("debug") || params.has("test");
}

/** Dữ liệu mẫu phục vụ phát triển giao diện và kiểm thử độc lập khi backend chưa xong */
export const MOCK_SECT_SAMPLES = {
  leaderView(): SectView {
    return {
      name: "Tiêu Dao Phái",
      tag: "TD",
      motd: "Bắc Minh Thần Công truyền thiên hạ, Tiêu Dao ngự phong định càn khôn.",
      coin: 125_000,
      myRank: "chu",
      createdAt: Date.now() - 86_400_000 * 30,
      members: [
        { name: "Tiêu Phong", rank: "chu", joinedAt: Date.now() - 86_400_000 * 10 },
        { name: "Hư Trúc", rank: "truong_lao", joinedAt: Date.now() - 86_400_000 * 7 },
        { name: "Đoàn Dự", rank: "truong_lao", joinedAt: Date.now() - 86_400_000 * 5 },
        { name: "Vương Ngữ Yên", rank: "de_tu", joinedAt: Date.now() - 86_400_000 * 3 },
        { name: "A Châu", rank: "de_tu", joinedAt: Date.now() - 86_400_000 * 2 },
      ],
      log: [
        { at: Date.now() - 3600_000 * 5, name: "Tiêu Phong", kind: "deposit", amount: 50_000 },
        { at: Date.now() - 3600_000 * 3, name: "Hư Trúc", kind: "deposit", amount: 20_000 },
        { at: Date.now() - 3600_000 * 1, name: "Tiêu Phong", kind: "withdraw", amount: 10_000 },
      ],
    };
  },

  elderView(): SectView {
    const base = MOCK_SECT_SAMPLES.leaderView();
    return {
      ...base,
      myRank: "truong_lao",
    };
  },

  memberView(): SectView {
    const base = MOCK_SECT_SAMPLES.leaderView();
    return {
      ...base,
      myRank: "de_tu",
    };
  },

  presence(): SectPresenceMsg {
    return {
      online: [
        { name: "Tiêu Phong", realm: 1, tier: 2, mapId: "lac_ha" },
        { name: "Hư Trúc", realm: 0, tier: 8, mapId: "hac_phong" },
        { name: "Vương Ngữ Yên", realm: 0, tier: 3, mapId: "lac_ha" },
      ],
    };
  },

  invited(from = "Tiêu Phong", sect = "Tiêu Dao Phái", tag = "TD"): SectInvitedMsg {
    return {
      from,
      sect,
      tag,
      ttlMs: 30_000,
    };
  },
};
