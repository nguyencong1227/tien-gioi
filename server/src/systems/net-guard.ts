// Bảo vệ tính mạng khi MẤT KẾT NỐI (QUYET_DINH_M3 mục 33, docs/THIET_KE_MAT_KET_NOI.md; hợp đồng `shared/src/net-guard.ts`). Chết thật là mất kiếp, nên:
//  - client có khai nhịp (`beatMs`) mà IM LẶNG quá `NET_SILENCE_GHOST_MS` thì thành "hồn lìa xác" NGAY dù socket còn mở (đường hầm đứng: máy chủ không biết socket đã chết);
//  - có tin lại (hoặc nối lại sau rớt socket) thì HỘ THỂ `NET_SHIELD_MS` + quái mất mục tiêu;
//  - bị hạ khi đã im lặng >= `NET_SPARE_SILENCE_MS` thì THA CHẾT (không Hoàng Tuyền, không mất kiếp): hồi ở điểm an toàn với `NET_SPARE_HP_PCT` khí huyết, kèm hộ thể.
// Mọi quyết định ở máy chủ; client chỉ gửi nhịp tim đều và vẽ dải báo / hộ thể. Chính sách chống lợi dụng (cố ý ngắt gói để thoát trận) là GHI NHẬN + cảnh báo qua
// nhật ký kiểm toán (`net.silent`, `net.resume`, `net.spared`, `net.drop`), không phạt (mục 6.4).
import {
  NET_SHIELD_MS,
  NET_SILENCE_GHOST_MS,
  NET_SPARE_HP_PCT,
  NET_SPARE_SILENCE_MS,
  type NetShieldReason,
} from "@tien-gioi/shared";
import type { Player } from "../schema";
import type { PlayerCtrl, World } from "../world";
import { forgetTarget } from "./monsters";
import { safeSpot, syncPublicPos } from "./movement";

/** Số quái đang có mục tiêu là người này (để ghi nhật ký: rớt mạng giữa trận hay lúc yên). */
function aggroCount(w: World, sid: string): number {
  let n = 0;
  for (const m of w.mctrl.values()) if (m.target === sid) n++;
  return n;
}

/** Người chơi đang được hộ thể (quái không nhắm, sát thương không vào). */
export function isShielded(w: World, sid: string): boolean {
  return w.shielded.size > 0 && w.shielded.has(sid);
}

/** Bao lâu (ms) máy chủ không nhận tin nào của người này; 0 nếu client cũ (không khai nhịp) hoặc chưa có mốc: không áp luật im lặng. */
export function silenceMs(w: World, c: PlayerCtrl): number {
  if (c.beatMs === undefined || c.lastHeardAt === undefined) return 0;
  return Math.max(0, w.now - c.lastHeardAt);
}

/** Cho hộ thể `NET_SHIELD_MS`, quái đang đánh mất mục tiêu, báo chủ để vẽ vầng sáng. */
export function grantShield(w: World, sid: string, c: PlayerCtrl, reason: NetShieldReason) {
  c.shieldUntil = w.now + NET_SHIELD_MS;
  w.shielded.add(sid);
  forgetTarget(w, sid);
  w.events.netShield(sid, { ms: NET_SHIELD_MS, reason });
}

/**
 * Nhận một tin của client (gọi ở MỌI tin nhắn hợp lệ, trước khi xử lý; kể cả tin bị giới hạn tần suất: vẫn là bằng chứng còn sống). Đang là hồn lìa xác vì im lặng
 * thì ra khỏi trạng thái đó, kèm hộ thể.
 */
export function heard(w: World, sid: string, c: PlayerCtrl, now: number = Date.now()) {
  c.lastHeardAt = now;
  if (!c.silent) return;
  const silentMs = c.silentSince !== undefined ? Math.max(0, w.now - c.silentSince) : 0;
  c.silent = false;
  c.silentSince = undefined;
  w.ghosts.delete(sid);
  grantShield(w, sid, c, "resume");
  const p = w.state.players.get(sid);
  w.audit?.("net.resume", { name: p?.name ?? null, silentMs, map: w.map.def.id, kind: "silence" });
}

/**
 * Nhận nhân vật nối lại sau khi rớt socket (WorldRoom, nhánh `allowReconnection` thành công): hết hồn lìa xác thật, mốc "nghe cuối" làm mới, hộ thể.
 * `silentMs` = đã vắng bao lâu (ghi nhật ký).
 */
export function reconnected(w: World, sid: string, c: PlayerCtrl, silentMs: number) {
  c.silent = false;
  c.silentSince = undefined;
  c.lastHeardAt = Date.now();
  w.ghosts.delete(sid);
  grantShield(w, sid, c, "resume");
  const p = w.state.players.get(sid);
  w.audit?.("net.resume", {
    name: p?.name ?? null,
    silentMs,
    map: w.map.def.id,
    kind: "reconnect",
  });
}

/**
 * Mỗi tick, MỖI người có khai nhịp (gọi từ `tickWorld`): hết hạn hộ thể thì gỡ; im lặng quá `NET_SILENCE_GHOST_MS` thì thành hồn lìa xác. Bỏ qua người đang qua cổng
 * (bản ghi cổng đang ghi) và hồn lìa xác THẬT (đã rớt socket: do `WorldRoom.onLeave` giữ).
 */
export function tickNetGuard(w: World, sid: string, c: PlayerCtrl) {
  if (c.shieldUntil !== undefined && w.now >= c.shieldUntil) {
    c.shieldUntil = undefined;
    w.shielded.delete(sid);
  }
  if (c.beatMs === undefined || c.silent || c.travelling) return;
  if (w.ghosts.has(sid)) return; // hồn lìa xác thật (rớt socket)
  if (silenceMs(w, c) <= NET_SILENCE_GHOST_MS) return;
  const p = w.state.players.get(sid);
  if (!p) return;
  c.silent = true;
  c.silentSince = w.now;
  w.ghosts.add(sid);
  c.inputs.length = 0; // không còn ai điều khiển: bỏ input đang chờ (như rớt socket)
  forgetTarget(w, sid); // quái bỏ mục tiêu ngay
  w.netStats.silent++;
  w.audit?.("net.silent", {
    name: p.name,
    map: w.map.def.id,
    hp: Math.round(p.hp),
    maxHp: p.maxHp,
    aggro: aggroCount(w, sid),
    duel: w.duels.has(sid),
    silentMs: silenceMs(w, c),
  });
}

/**
 * Nhân vật vừa bị hạ (khí huyết về 0). Client đã im lặng từ `NET_SPARE_SILENCE_MS` trở lên (khả năng cao là do mạng) thì THA CHẾT: không Hoàng Tuyền, không mất kiếp;
 * hồi ở điểm an toàn gần nhất với `NET_SPARE_HP_PCT` khí huyết tối đa, kèm hộ thể, ghi nhật ký. Trả `true` nếu đã tha (người gọi dừng, không cho chết).
 */
export function spareFromNetDeath(w: World, sid: string, p: Player, c: PlayerCtrl): boolean {
  const silent = silenceMs(w, c);
  if (c.beatMs === undefined || silent < NET_SPARE_SILENCE_MS) return false;
  const before = { x: Math.round(p.x), y: Math.round(p.y), mapId: w.map.def.id };
  p.hp = Math.max(1, Math.round(p.maxHp * NET_SPARE_HP_PCT));
  const spot = safeSpot(w.map);
  p.x = spot.x;
  p.y = spot.y;
  syncPublicPos(p);
  p.meditating = false;
  c.inputs.length = 0;
  c.lastHitAt = w.now;
  w.netStats.spared++;
  grantShield(w, sid, c, "spared");
  w.events.toast(sid, {
    text: "Mạng chập chờn nên ngươi được tha chết: đã về nơi an toàn, khí huyết còn ít.",
    tone: "info",
  });
  w.audit?.("net.spared", {
    name: p.name,
    silentMs: silent,
    from: before,
    to: { x: Math.round(spot.x), y: Math.round(spot.y) },
  });
  return true;
}
