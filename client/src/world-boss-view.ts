/**
 * Trùm thế giới (M9.7, #1026): biến tin `worldBoss` của máy chủ (`shared/src/social.ts`) thành chữ để hiện ở banner, bảng đóng góp,
 * kết quả và tab "Sự kiện". THUẦN (không DOM, không đồng hồ): `ui.ts` đổ kết quả vào DOM và tự đo khoảng trôi từ lúc nhận tin.
 *
 * Nguyên tắc (hợp đồng M9): thời gian trong tin là TƯƠNG ĐỐI (`startsInMs` / `endsInMs`), nên đếm ngược = giá trị nhận được trừ KHOẢNG TRÔI từ
 * lúc nhận (đồng hồ máy người chơi chỉ dùng để đo khoảng trôi, không bao giờ là giờ tuyệt đối); không tin tin nhắn (sai kiểu thì bỏ);
 * id lạ (vật phẩm / bản đồ / trùm mới hơn client) KHÔNG lộ id ra màn hình; mọi chữ vào DOM bằng `textContent`.
 */
import {
  ITEM_BY_ID,
  MAP_BY_ID,
  MONSTER_BY_ID,
  TITLE_BY_ID,
  WORLD_BOSS_MIN_SHARE_PCT,
  WORLD_BOSS_TOP_SHOWN,
  type WorldBossMine,
  type WorldBossMsg,
  type WorldBossMsgPhase,
  type WorldBossOutcome,
  type WorldBossRewardMsg,
  type WorldBossSlot,
  type WorldBossTopRow,
} from "@tien-gioi/shared";

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const PHASES: readonly string[] = ["soon", "live", "ended", "none"];
const OUTCOMES: readonly string[] = ["killed", "fled", "cancelled"];
const DASH = "—";

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const nonNeg = (v: unknown): number | undefined => (isNum(v) && v >= 0 ? v : undefined);

/** Phần trăm một chữ số thập phân kiểu Việt ("4,6%"); không phải số hữu hạn -> "—". */
export function fmtPct(p: unknown): string {
  return isNum(p) ? `${(Math.round(Math.max(0, p) * 10) / 10).toLocaleString("vi-VN")}%` : DASH;
}

/** Số nguyên có dấu chấm ngăn nghìn ("12.345"); không hợp lệ -> "—". */
export function fmtInt(n: unknown): string {
  return isNum(n) ? Math.max(0, Math.floor(n)).toLocaleString("vi-VN") : DASH;
}

/**
 * Đếm ngược: dưới 1 giờ "mm:ss"; từ 1 giờ "H giờ MM phút" (giây không còn ý nghĩa ở thang giờ). Âm / không hợp lệ -> "00:00".
 * Làm tròn LÊN theo giây (còn 0,4 s vẫn hiện "00:01") để chữ chỉ về 00:00 khi thật sự hết.
 */
export function countdownText(ms: unknown): string {
  const s = isNum(ms) && ms > 0 ? Math.ceil(ms / 1000) : 0;
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h} giờ ${String(m).padStart(2, "0")} phút`;
  }
  const mm = Math.floor(s / 60);
  return `${String(mm).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Tên bản đồ từ mã; mã lạ -> "" (không lộ id). */
export function mapNameOf(mapId: unknown): string {
  return typeof mapId === "string" && hasOwn(MAP_BY_ID, mapId) ? MAP_BY_ID[mapId].name : "";
}

function itemNameOf(id: unknown): string {
  return typeof id === "string" && hasOwn(ITEM_BY_ID, id) ? ITEM_BY_ID[id].name : "";
}

function titleOf(id: unknown): string {
  return typeof id === "string" && hasOwn(TITLE_BY_ID, id) ? TITLE_BY_ID[id].text : "";
}

/**
 * Làm sạch tin `worldBoss` đến từ mạng: đúng kiểu thì trả `WorldBossMsg` (số kẹp về miền hợp lệ, `top` cắt về `WORLD_BOSS_TOP_SHOWN`),
 * sai thì `null` (bỏ tin, không sập). `none` không cần id / tên.
 */
export function sanitizeWorldBossMsg(raw: unknown): WorldBossMsg | null {
  if (raw === null || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.phase !== "string" || !PHASES.includes(m.phase)) return null;
  const phase = m.phase as WorldBossMsgPhase;
  if (phase === "none") return { phase, id: "", name: "", mapId: "" };
  if (typeof m.id !== "string" || typeof m.name !== "string" || typeof m.mapId !== "string")
    return null;
  const out: WorldBossMsg = { phase, id: m.id, name: m.name, mapId: m.mapId };
  const startsIn = nonNeg(m.startsInMs);
  const endsIn = nonNeg(m.endsInMs);
  if (startsIn !== undefined) out.startsInMs = startsIn;
  if (endsIn !== undefined) out.endsInMs = endsIn;
  if (isNum(m.hpPct)) out.hpPct = Math.min(100, Math.max(0, m.hpPct));
  if (Array.isArray(m.top)) {
    const top: WorldBossTopRow[] = [];
    // lọc TRƯỚC rồi mới cắt: dòng hỏng không được chiếm chỗ của dòng hợp lệ đứng sau; chỉ nhìn tối đa 64 phần tử đầu (tin quá lớn thì bỏ phần thừa)
    for (const r of m.top.slice(0, 64)) {
      if (top.length >= WORLD_BOSS_TOP_SHOWN) break;
      if (r === null || typeof r !== "object") continue;
      const o = r as Record<string, unknown>;
      const pts = nonNeg(o.pts);
      const pct = nonNeg(o.pct);
      if (typeof o.name !== "string" || pts === undefined || pct === undefined) continue;
      const row: WorldBossTopRow = { name: o.name, pts, pct };
      if (typeof o.titleId === "string") row.titleId = o.titleId;
      top.push(row);
    }
    out.top = top;
  }
  if (m.mine !== null && typeof m.mine === "object") {
    const o = m.mine as Record<string, unknown>;
    const pts = nonNeg(o.pts);
    const pct = nonNeg(o.pct);
    if (pts !== undefined && pct !== undefined && typeof o.eligible === "boolean")
      out.mine = { pts, pct, eligible: o.eligible };
  }
  if (typeof m.outcome === "string" && OUTCOMES.includes(m.outcome))
    out.outcome = m.outcome as WorldBossOutcome;
  if (m.reward !== null && typeof m.reward === "object") {
    const o = m.reward as Record<string, unknown>;
    const exp = nonNeg(o.exp);
    const coin = nonNeg(o.coin);
    if (exp !== undefined && coin !== undefined) {
      const reward: WorldBossRewardMsg = { exp, coin };
      const it = o.item;
      if (it !== null && typeof it === "object") {
        const i = it as Record<string, unknown>;
        if (typeof i.itemId === "string" && isNum(i.count) && i.count >= 1)
          reward.item = { itemId: i.itemId, count: Math.floor(i.count) };
      }
      out.reward = reward;
    }
  }
  return out;
}

export interface WorldBossTopView {
  rank: number;
  name: string;
  title: string;
  pct: string;
}

export type WorldBossTone = "info" | "good" | "bad";

export interface WorldBossView {
  phase: WorldBossMsgPhase;
  /** Có gì để hiện ở banner (soon / live) hay không. */
  active: boolean;
  /** "Hắc Giao · Âm Sương Trạch" (bỏ phần bản đồ nếu mã lạ). */
  title: string;
  /** Nhãn đứng trước đồng hồ ("Xuất hiện sau" / "Còn lại"); rỗng nếu không có đồng hồ. */
  timerLabel: string;
  /** Đồng hồ đếm ngược (đã trừ khoảng trôi). */
  timer: string;
  /** Còn bao nhiêu mili giây (đã trừ khoảng trôi); `null` nếu tin không có đồng hồ. */
  leftMs: number | null;
  /** "Máu 64%" (chỉ khi live và có `hpPct`). */
  hp: string;
  /** Câu về phần đóng góp của MÌNH ("" nếu không có `mine`). */
  mineText: string;
  mineEligible: boolean | null;
  top: WorldBossTopView[];
  /** Câu kết quả (phase ended) hoặc "Chưa có sự kiện" (phase none). */
  resultText: string;
  tone: WorldBossTone;
}

/** Câu "Bạn đóng góp ...": có đủ ngưỡng thì báo đủ, chưa thì nói rõ cần bao nhiêu (không để người chơi đoán vì sao không có thưởng). */
export function mineLine(mine: WorldBossMine | undefined): string {
  if (!mine) return "";
  const min = fmtPct(WORLD_BOSS_MIN_SHARE_PCT);
  return mine.eligible
    ? `Bạn đóng góp ${fmtPct(mine.pct)}: đủ điều kiện nhận thưởng.`
    : `Bạn đóng góp ${fmtPct(mine.pct)}: cần từ ${min} để nhận thưởng.`;
}

/** Câu kết quả của một sự kiện đã kết thúc. */
export function resultLine(msg: WorldBossMsg): string {
  const name = msg.name || "Trùm thế giới";
  const min = fmtPct(WORLD_BOSS_MIN_SHARE_PCT);
  switch (msg.outcome) {
    case "killed": {
      const r = msg.reward;
      if (!r) return `Đã hạ ${name}. Bạn chưa đủ ngưỡng đóng góp (${min}) nên không có thưởng.`;
      const parts = [`+${fmtInt(r.exp)} tu vi`, `+${fmtInt(r.coin)} Linh thạch`];
      if (r.item) {
        const n = itemNameOf(r.item.itemId) || "vật phẩm hiếm";
        parts.push(`${n} x${r.item.count}`);
      }
      return `Đã hạ ${name}! Thưởng: ${parts.join(", ")}.`;
    }
    case "fled":
      return `${name} đã bỏ chạy.`;
    case "cancelled":
      return `Sự kiện ${name} đã bị huỷ.`;
    default:
      return `Sự kiện ${name} đã kết thúc.`;
  }
}

/**
 * Tin `worldBoss` -> dữ liệu hiện. `sinceMs` = khoảng trôi từ lúc nhận tin (đo bằng đồng hồ máy người chơi; chỉ là KHOẢNG, không phải giờ tuyệt đối).
 */
export function worldBossView(msg: WorldBossMsg, sinceMs = 0): WorldBossView {
  const since = isNum(sinceMs) && sinceMs > 0 ? sinceMs : 0;
  const map = mapNameOf(msg.mapId);
  const title = map ? `${msg.name} · ${map}` : msg.name;
  const base = {
    phase: msg.phase,
    title,
    timerLabel: "",
    timer: "",
    leftMs: null as number | null,
    hp: "",
    mineText: "",
    mineEligible: null as boolean | null,
    top: [] as WorldBossTopView[],
    resultText: "",
    tone: "info" as WorldBossTone,
  };
  if (msg.phase === "none")
    return { ...base, active: false, title: "", resultText: "Chưa có sự kiện." };
  if (msg.phase === "ended") {
    const tone: WorldBossTone =
      msg.outcome === "killed"
        ? msg.reward
          ? "good"
          : "info"
        : msg.outcome === "fled"
          ? "bad"
          : "info";
    return { ...base, active: false, resultText: resultLine(msg), tone };
  }
  const left = msg.phase === "soon" ? msg.startsInMs : msg.endsInMs;
  const leftMs = left === undefined ? null : Math.max(0, left - since);
  return {
    ...base,
    active: true,
    timerLabel: leftMs === null ? "" : msg.phase === "soon" ? "Xuất hiện sau" : "Còn lại",
    timer: leftMs === null ? "" : countdownText(leftMs),
    leftMs,
    hp: msg.phase === "live" && msg.hpPct !== undefined ? `Máu ${fmtPct(msg.hpPct)}` : "",
    mineText: msg.phase === "live" ? mineLine(msg.mine) : "",
    mineEligible: msg.phase === "live" && msg.mine ? msg.mine.eligible : null,
    top:
      msg.phase === "live"
        ? (msg.top ?? []).slice(0, WORLD_BOSS_TOP_SHOWN).map((r, i) => ({
            rank: i + 1,
            name: r.name,
            title: titleOf(r.titleId),
            pct: fmtPct(r.pct),
          }))
        : [],
  };
}

export interface ScheduleRowView {
  id: string;
  /** "12:00" (giờ máy chủ, UTC+7). */
  time: string;
  boss: string;
  map: string;
  /** "30 phút". */
  duration: string;
}

/** Ghi chú múi giờ của lịch: giờ trong lịch là giờ MÁY CHỦ, không phải giờ máy người chơi. */
export const SCHEDULE_TZ_NOTE = "Giờ máy chủ (UTC+7), không theo giờ máy của bạn.";

/** Lịch trùm thế giới -> các dòng hiện, theo giờ trong ngày. Trùm / bản đồ lạ hiện "—" (không lộ id). */
export function scheduleRows(slots: readonly WorldBossSlot[]): ScheduleRowView[] {
  return [...slots]
    .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))
    .map((s) => ({
      id: s.id,
      time: `${String(s.hour).padStart(2, "0")}:${String(s.minute).padStart(2, "0")}`,
      boss: hasOwn(MONSTER_BY_ID, s.boss) ? MONSTER_BY_ID[s.boss].name : DASH,
      map: mapNameOf(s.mapId) || DASH,
      duration: `${s.durationMin} phút`,
    }));
}
