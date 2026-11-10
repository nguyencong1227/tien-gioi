// Logic thuần phía client cho PK thách đấu (M3 bước 5, Issue #218).
// Định dạng thời gian, câu thông báo kết quả, kiểm tra điều kiện thách đấu phía client.
import {
  canChallenge,
  DUEL_COUNTDOWN_MS,
  DUEL_INVITE_TTL_MS,
  DUEL_MAX_MS,
  type DuelChallengeCheck,
  type DuelChallengeInput,
  type DuelEndMsg,
  type DuelEndReason,
  type DuelInvitedMsg,
  type DuelParty,
  type DuelStateMsg,
  type GameMap,
} from "@tien-gioi/shared";

/** Định dạng đồng hồ đếm ngược trận đấu (MM:SS). */
export function formatDuelCountdown(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "00:00";
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Định dạng đếm ngược lời mời (ví dụ: "còn 18s"). */
export function formatDuelInviteCountdown(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  return `${Math.ceil(ms / 1000)}s`;
}

/** Tiêu đề màn kết quả quyết đấu. */
export function duelResultTitle(result: "won" | "lost" | "draw"): string {
  switch (result) {
    case "won":
      return "ĐẠI THẮNG QUYẾT ĐẤU";
    case "lost":
      return "CHIẾN BẠI";
    case "draw":
      return "BẤT PHÂN THẮNG BẠI";
  }
}

/** Câu giải thích lý do kết thúc quyết đấu bằng tiếng Việt. */
export function duelEndReasonText(
  reason: DuelEndReason,
  result: "won" | "lost" | "draw",
  opponentName = "Đối thủ",
): string {
  switch (reason) {
    case "ko":
      if (result === "won") return `Đã đánh gục ${opponentName}!`;
      if (result === "lost") return `Đã bị ${opponentName} đánh gục!`;
      return "Hai bên cùng gục xuống, bất phân thắng bại.";
    case "yield":
      if (result === "won") return `${opponentName} đã xin đầu hàng.`;
      if (result === "lost") return "Đạo hữu đã nhận thua đầu hàng.";
      return "Trận quyết đấu dừng lại do đầu hàng.";
    case "fled":
      if (result === "won") return `${opponentName} đã rời khỏi lôi đài quyết đấu.`;
      if (result === "lost") return "Đạo hữu đã rời quá xa lôi đài quyết đấu.";
      return "Rời khỏi phạm vi quyết đấu.";
    case "timeout":
      return "Hết thời gian quyết đấu, hai bên bất phân thắng bại.";
    case "disconnect":
      if (result === "won") return `${opponentName} đã mất kết nối.`;
      return "Trận đấu bị gián đoạn do mất kết nối.";
  }
}

/** Chuyển thông tin thực thể người chơi và bản đồ thành DuelParty cho canChallenge. */
export function toDuelParty(
  player: { name: string; dead?: boolean; duel?: boolean },
  pos: { x: number; y: number },
  map: GameMap,
): DuelParty {
  return {
    name: player.name,
    alive: !player.dead,
    inSafe: map.inSafe(pos.x, pos.y),
    inDuel: Boolean(player.duel),
    busy: false,
  };
}

/** Kiểm tra nhanh điều kiện thách đấu từ góc nhìn Client. */
export function clientCanChallenge(
  selfPlayer: { name: string; dead?: boolean; duel?: boolean },
  selfPos: { x: number; y: number },
  targetPlayer: { name: string; dead?: boolean; duel?: boolean } | null,
  targetPos: { x: number; y: number } | null,
  map: GameMap,
  isDungeon = false,
  cooldownLeftMs = 0,
  pairCooldownLeftMs = 0,
  alreadyInvited = false,
): DuelChallengeCheck {
  const selfParty = toDuelParty(selfPlayer, selfPos, map);
  const targetParty = targetPlayer && targetPos ? toDuelParty(targetPlayer, targetPos, map) : null;
  const distance =
    targetPos != null ? Math.hypot(selfPos.x - targetPos.x, selfPos.y - targetPos.y) : Infinity;

  const input: DuelChallengeInput = {
    self: selfParty,
    target: targetParty,
    distance,
    inDungeon: isDungeon,
    cooldownLeftMs,
    pairCooldownLeftMs,
    alreadyInvited,
    targetPendingInvites: 0,
  };

  return canChallenge(input);
}

/**
 * Kiểm tra chế độ quyết đấu giả lập (`?duel=mock`).
 * Chỉ bật khi ở môi trường DEV (`import.meta.env.DEV`) hoặc URL có `?debug`.
 */
export function isMockDuelEnabled(
  search: string = typeof location !== "undefined" ? location.search : "",
  isDev: boolean = typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV),
): boolean {
  const params = new URLSearchParams(search);
  if (params.get("duel") !== "mock") return false;
  return isDev || params.has("debug");
}

/** Mẫu dữ liệu giả lập cho chế độ DEV / thử nghiệm giao diện PK. */
export const MOCK_DUEL_SAMPLES = {
  invited(from = "Diệp Phàm", ttlMs = DUEL_INVITE_TTL_MS): DuelInvitedMsg {
    return { from, ttlMs };
  },
  stateCountdown(opponent = "Diệp Phàm", startsInMs = DUEL_COUNTDOWN_MS): DuelStateMsg {
    return {
      phase: "countdown",
      opponent,
      startsInMs,
      endsInMs: DUEL_MAX_MS,
    };
  },
  stateFighting(opponent = "Diệp Phàm", endsInMs = 150_000): DuelStateMsg {
    return {
      phase: "fight",
      opponent,
      startsInMs: 0,
      endsInMs,
    };
  },
  endWon(_opponent = "Diệp Phàm", reason: DuelEndReason = "ko"): DuelEndMsg {
    return {
      result: "won",
      reason,
    };
  },
  endLost(_opponent = "Diệp Phàm", reason: DuelEndReason = "ko"): DuelEndMsg {
    return {
      result: "lost",
      reason,
    };
  },
  endDraw(reason: DuelEndReason = "timeout"): DuelEndMsg {
    return {
      result: "draw",
      reason,
    };
  },
};
