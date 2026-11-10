import {
  DUNGEONS,
  DUNGEON_INVITE_MS,
  DUNGEON_LOOT_MS,
  ITEM_BY_ID,
  LINH_HU_ID,
  LINH_HU_MAP_ID,
  MONSTER_BY_ID,
  dungeonOf,
  dungeonOfMap,
  dungeonOpenFailMessage,
  type DialogMsg,
  type DungeonDef,
  type DungeonEndMsg,
  type DungeonEndReason,
  type DungeonInviteMsg,
  type DungeonPhase,
  type DungeonStateMsg,
} from "@tien-gioi/shared";

/** Định dạng đồng hồ bí cảnh dạng MM:SS (kẹp không âm, an toàn với NaN / Infinity). */
export function formatDungeonCountdown(ms: number): string {
  const safeMs = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  const totalSec = Math.ceil(safeMs / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/** Định dạng đếm ngược lời mời dạng Ns (kẹp không âm, an toàn với NaN / Infinity). */
export function formatInviteCountdown(ms: number): string {
  const safeMs = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  return `${Math.ceil(safeMs / 1000)}s`;
}

export interface DungeonPhaseView {
  label: string;
  tone: "info" | "warn" | "good" | "bad";
  showLeaveBtn: boolean;
}

/** Quyết định nhãn hiển thị và trạng thái nút rời theo pha của bí cảnh. */
export function dungeonPhaseInfo(phase: DungeonPhase): DungeonPhaseView {
  switch (phase) {
    case "gathering":
      return { label: "Đang tập hợp đội", tone: "info", showLeaveBtn: true };
    case "running":
      return { label: "Đang khiêu chiến", tone: "warn", showLeaveBtn: true };
    case "won":
      return { label: "Đã hạ Yêu Vương · Thu chiến lợi phẩm", tone: "good", showLeaveBtn: true };
    case "lost":
      return { label: "Khiêu chiến thất bại", tone: "bad", showLeaveBtn: false };
  }
}

/** Chuyển mã lý do kết thúc bí cảnh sang tiếng Việt rõ ràng cho người chơi. */
export function dungeonEndReasonText(reason: DungeonEndReason): string {
  switch (reason) {
    case "boss_dead":
      return "Toàn đội đã hợp lực tru diệt Linh Hư Yêu Vương!";
    case "timeout":
      return "Đã hết thời gian khiêu chiến trong bí cảnh.";
    case "all_dead":
      return "Toàn bộ thành viên trong đội đã ngã xuống.";
    case "all_left":
      return "Toàn bộ thành viên đã rời khỏi bí cảnh.";
    case "no_entry":
      return "Không có thành viên nào bước vào bí cảnh kịp thời hạn.";
  }
}

export interface BossBarView {
  visible: boolean;
  name: string;
  hp: number;
  maxHp: number;
  pct: number;
  text: string;
}

/** Tính dữ liệu hiển thị thanh máu trùm trên HUD bí cảnh (ẩn khi boss = null hoặc máu <= 0). */
export function formatBossView(
  boss: { hp: number; maxHp: number } | null,
  mapId?: string,
): BossBarView {
  const d = mapId ? dungeonOfMap(mapId) : DUNGEONS[0];
  const bossKind = d ? MONSTER_BY_ID[d.boss] : undefined;
  const bossName = bossKind?.name ?? "Linh Hư Yêu Vương";

  if (
    !boss ||
    !Number.isFinite(boss.hp) ||
    !Number.isFinite(boss.maxHp) ||
    boss.maxHp <= 0 ||
    boss.hp <= 0
  ) {
    return { visible: false, name: bossName, hp: 0, maxHp: 0, pct: 0, text: "" };
  }

  const maxHp = Math.max(1, Math.round(boss.maxHp));
  const hp = Math.max(0, Math.min(maxHp, Math.round(boss.hp)));
  const pct = Math.max(0, Math.min(100, Math.round((hp / maxHp) * 100)));

  return {
    visible: true,
    name: bossName,
    hp,
    maxHp,
    pct,
    text: `${hp} / ${maxHp} (${pct}%)`,
  };
}

/** Định dạng phần thưởng trong màn kết quả bí cảnh. */
export function formatDungeonRewardItems(
  items: readonly { itemId: string; qty: number }[],
): { name: string; qty: number }[] {
  return items
    .filter((it) => Number.isFinite(it.qty) && it.qty > 0)
    .map((it) => {
      const def = Object.prototype.hasOwnProperty.call(ITEM_BY_ID, it.itemId)
        ? ITEM_BY_ID[it.itemId]
        : undefined;
      return {
        name: def?.name ?? it.itemId,
        qty: Math.floor(it.qty),
      };
    });
}

/**
 * Kiểm tra chế độ máy chủ bí cảnh giả (`?dungeon=mock`).
 * Chỉ bật khi ở môi trường DEV (`import.meta.env.DEV`) hoặc URL có `?debug`.
 */
export function isMockDungeonEnabled(
  search: string = typeof location !== "undefined" ? location.search : "",
  isDev: boolean = typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV),
): boolean {
  const params = new URLSearchParams(search);
  if (params.get("dungeon") !== "mock") return false;
  return isDev || params.has("debug");
}

/** Dựng hộp thoại giả của NPC Thủ Môn (Huyền Cơ) cho chế độ `?dungeon=mock`. */
export function buildMockThuMonDialog(opts: {
  canOpen: boolean;
  failReason?: Parameters<typeof dungeonOpenFailMessage>[0];
  failWho?: string;
  dungeon?: DungeonDef;
}): DialogMsg {
  const d = opts.dungeon ?? dungeonOf(LINH_HU_ID)!;
  const reasonText =
    !opts.canOpen && opts.failReason
      ? dungeonOpenFailMessage(opts.failReason, opts.failWho)
      : undefined;

  const lines = [
    "Linh Hư Bí Cảnh mở cho đội tu sĩ đồng tâm (2–4 người, tối thiểu Luyện Khí Tầng 9).",
    "Đội trưởng nói một tiếng, ta mở cổng; ai không kịp bước vào trong 60 giây thì lỡ chuyến.",
  ];
  if (reasonText) {
    lines.push(`Điều kiện còn thiếu: ${reasonText}`);
  }

  return {
    npcId: "thu_mon",
    lines,
    options: [
      {
        label: reasonText ? `Mở ${d.name} — ${reasonText}` : `Mở ${d.name}`,
        action: { kind: "dungeon", dungeonId: d.id },
        ...(opts.canOpen ? {} : { disabled: true }),
      },
      {
        label: "Rời đi",
        action: { kind: "close" },
      },
    ],
  };
}

/** Tạo dữ liệu mẫu cho máy chủ giả `?dungeon=mock` phục vụ thử nghiệm và chụp ảnh. */
export const MOCK_DUNGEON_SAMPLES = {
  invite(from = "Trương Tiểu Phàm", expiresInMs = DUNGEON_INVITE_MS): DungeonInviteMsg {
    return {
      runId: "a1b2c3d4e5f60718293a4b5c6d7e8f90",
      dungeonId: LINH_HU_ID,
      from,
      expiresInMs,
    };
  },
  stateBossFight(): DungeonStateMsg {
    return {
      phase: "running",
      deadlineInMs: 9 * 60_000 + 42_000,
      mobsLeft: 3,
      boss: { hp: 13_600, maxHp: 20_000 },
      members: [
        { name: "Trương Tiểu Phàm", alive: true },
        { name: "Lục Tuyết Kỳ", alive: true },
        { name: "Lâm Kinh Vũ", alive: false },
      ],
    };
  },
  stateLoot(): DungeonStateMsg {
    return {
      phase: "won",
      deadlineInMs: DUNGEON_LOOT_MS,
      mobsLeft: 0,
      boss: null,
      members: [
        { name: "Trương Tiểu Phàm", alive: true },
        { name: "Lục Tuyết Kỳ", alive: true },
        { name: "Lâm Kinh Vũ", alive: false },
      ],
    };
  },
  endWon(): DungeonEndMsg {
    return {
      result: "won",
      reason: "boss_dead",
      reward: {
        coin: 400,
        items: [
          { itemId: "tu_khi_dan", qty: 2 },
          { itemId: "vay_mang", qty: 3 },
          { itemId: "xich_lan_bao", qty: 1 },
        ],
      },
    };
  },
  endLost(reason: DungeonEndReason = "timeout"): DungeonEndMsg {
    return {
      result: "lost",
      reason,
    };
  },
  mapId: LINH_HU_MAP_ID,
};
