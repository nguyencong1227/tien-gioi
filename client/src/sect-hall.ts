// Tab "Nội vụ" của bảng Tông môn (M8.6, issue #843; docs/THIET_KE_TONG_MON.md mục 12): logic THUẦN phía client (không DOM / Phaser) nên test được.
// Làm sạch ảnh chụp `sectHall` máy chủ gửi (client không tin tin nhắn), rồi biến nó thành các dòng để vẽ: thanh điểm tông, ghi chú kiếm cống hiến, nhiệm vụ hôm nay,
// cửa hàng (kèm LÝ DO khoá bằng chữ), buff, cảnh báo khi rời tông. Mọi chữ lấy từ `SECT_TERMS` / `sectFailMessage` của `shared/` (một nơi, không tự đặt chuỗi).
import {
  ITEM_BY_ID,
  SECT_EARN_DAY_CAP,
  SECT_LEVEL_MAX,
  SECT_QUEST_BY_ID,
  SECT_SHOP_BY_ITEM,
  SECT_TERMS,
  sectFailMessage,
  sectLevelInfo,
  type SectBuff,
  type SectHallQuest,
  type SectHallQuestState,
  type SectHallView,
  type SectShopItemView,
  type SectShopLock,
} from "@tien-gioi/shared";

const has = (table: object, key: string) => Object.prototype.hasOwnProperty.call(table, key);

/** Số nguyên không âm trong [0, max]; số xấu (NaN, âm, không phải số) -> 0. Làm tròn xuống. */
function whole(v: unknown, max: number): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.min(Math.floor(v), max) : 0;
}

/** Chuỗi hiển thị an toàn: kiểu chuỗi, cắt độ dài, bỏ ký tự điều khiển (vẽ bằng `textContent` nhưng vẫn không để rác dài làm vỡ bố cục). */
function text(v: unknown, max: number): string {
  return typeof v === "string"
    ? v
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .trim()
        .slice(0, max)
    : "";
}

const QUEST_STATES: readonly SectHallQuestState[] = ["offer", "active", "done"];
const SHOP_LOCKS: readonly (SectShopLock | null)[] = [
  "level",
  "known",
  "limit",
  "no_contrib",
  null,
];

/** Hệ số buff hợp lệ: số hữu hạn từ 1 tới `max` (dưới 1 / xấu = 1, không buff). */
function mult(v: unknown, max: number): number {
  return typeof v === "number" && Number.isFinite(v) && v > 1 ? Math.min(v, max) : 1;
}

/**
 * Làm sạch ảnh chụp `sectHall` (client không tin tin nhắn): số nguyên không âm, cấp trong 1..`SECT_LEVEL_MAX`, nhiệm vụ / món lạ bị bỏ (tra bằng `hasOwnProperty`), trạng thái
 * và lý do khoá lạ thì bỏ mục đó, chuỗi cắt độ dài. Hỏng hẳn (không phải object, thiếu `me`) thì `null`: giao diện coi như chưa có ảnh chụp.
 */
export function sanitizeHallView(raw: unknown): SectHallView | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const me = r.me;
  if (typeof me !== "object" || me === null || Array.isArray(me)) return null;
  const m = me as Record<string, unknown>;
  const BIG = 1_000_000_000_000;
  const level = Math.min(SECT_LEVEL_MAX, Math.max(1, whole(r.level, SECT_LEVEL_MAX)));
  const points = whole(r.points, BIG);
  const pointsFrom = Math.min(whole(r.pointsFrom, BIG), points);
  const pointsNext =
    typeof r.pointsNext === "number" && Number.isFinite(r.pointsNext) && r.pointsNext > 0
      ? Math.max(Math.floor(r.pointsNext), points + 1)
      : null;
  const b = (typeof r.buff === "object" && r.buff !== null ? r.buff : {}) as Record<
    string,
    unknown
  >;
  const caps = (typeof r.caps === "object" && r.caps !== null ? r.caps : {}) as Record<
    string,
    unknown
  >;
  const quests: SectHallQuest[] = [];
  if (Array.isArray(r.quests))
    for (const q of r.quests.slice(0, 6)) {
      if (typeof q !== "object" || q === null) continue;
      const o = q as Record<string, unknown>;
      if (typeof o.questId !== "string" || !has(SECT_QUEST_BY_ID, o.questId)) continue;
      if (!QUEST_STATES.includes(o.state as SectHallQuestState)) continue;
      const d = o.difficulty === 2 ? 2 : o.difficulty === 3 ? 3 : 1;
      quests.push({
        questId: o.questId,
        title: text(o.title, 60) || SECT_QUEST_BY_ID[o.questId]!.title,
        desc: text(o.desc, 160),
        difficulty: d,
        ch: whole(o.ch, 1000),
        state: o.state as SectHallQuestState,
      });
    }
  const shop: SectShopItemView[] = [];
  if (Array.isArray(r.shop))
    for (const e of r.shop.slice(0, 80)) {
      if (typeof e !== "object" || e === null) continue;
      const o = e as Record<string, unknown>;
      if (typeof o.itemId !== "string" || !has(SECT_SHOP_BY_ITEM, o.itemId)) continue;
      if (!SHOP_LOCKS.includes((o.locked ?? null) as SectShopLock | null)) continue;
      const def = SECT_SHOP_BY_ITEM[o.itemId]!;
      shop.push({
        itemId: o.itemId,
        cost: whole(o.cost, 1_000_000) || def.cost,
        minLevel: Math.min(SECT_LEVEL_MAX, Math.max(1, whole(o.minLevel, SECT_LEVEL_MAX))),
        limitDay: whole(o.limitDay, 1000),
        hall: o.hall === "tangKinh" ? "tangKinh" : "baoKho",
        left: whole(o.left, 1000),
        locked: (o.locked ?? null) as SectShopLock | null,
      });
    }
  return {
    now: whole(r.now, Number.MAX_SAFE_INTEGER),
    resetAt: whole(r.resetAt, Number.MAX_SAFE_INTEGER),
    level,
    points,
    pointsFrom,
    pointsNext,
    buff: { exp: mult(b.exp, 1.1), drop: mult(b.drop, 1.1), regen: mult(b.regen, 1.3) },
    caps: {
      members: whole(caps.members, 1000),
      elders: whole(caps.elders, 1000),
      vaultSlots: whole(caps.vaultSlots, 1000),
    },
    me: {
      contrib: whole(m.contrib, BIG),
      merit: whole(m.merit, BIG),
      earnedToday: whole(m.earnedToday, SECT_EARN_DAY_CAP),
      earnCap: whole(m.earnCap, 100_000) || SECT_EARN_DAY_CAP,
      depositLeft: whole(m.depositLeft, 100_000),
      earnFromAt: whole(m.earnFromAt, Number.MAX_SAFE_INTEGER),
    },
    quests,
    shop,
  };
}

// ---------- Thời gian ----------

/**
 * Còn bao nhiêu ms nữa tới mốc đặt lại (00:00 giờ Việt Nam kế tiếp), theo đồng hồ MÁY CHỦ: `view.now` là giờ máy chủ lúc dựng ảnh chụp, `elapsedMs` là thời gian
 * đã trôi trên máy khách kể từ lúc nhận (`Date.now() - lúc nhận`), nên không phụ thuộc máy khách đặt giờ sai. Không âm.
 */
export function hallResetInMs(view: SectHallView, elapsedMs: number): number {
  const el = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  return Math.max(0, view.resetAt - (view.now + el));
}

/** Thời gian còn lại cho người đọc: "5 giờ 12 phút", "12 phút", "dưới 1 phút". Làm tròn LÊN phút (không báo "0 phút" khi còn vài giây). */
export function formatHallDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "dưới 1 phút";
  const totalMin = Math.max(1, Math.ceil(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const mi = totalMin % 60;
  if (h <= 0) return `${mi} phút`;
  return mi === 0 ? `${h} giờ` : `${h} giờ ${mi} phút`;
}

// ---------- Tông môn: cấp, điểm, buff ----------

export interface HallProgress {
  /** Dòng đầu: "Cấp 2: Tiểu Thành" */
  levelLabel: string;
  /** Tỉ lệ 0..1 của thanh điểm (1 khi đã ở cấp cao nhất) */
  ratio: number;
  /** Chữ trên thanh: "1.250 / 4.000 điểm" hoặc "Cấp cao nhất" */
  text: string;
  /** Giá trị cho `aria-valuenow` / `aria-valuemax` của thanh */
  now: number;
  max: number;
}

/** Thanh điểm tông: tính trên đoạn của cấp hiện tại (`pointsFrom` .. `pointsNext`). */
export function hallProgress(v: SectHallView): HallProgress {
  const name = sectLevelInfo(v.level).name;
  const levelLabel = `${SECT_TERMS.level} ${v.level}: ${name}`;
  if (v.pointsNext === null) {
    return {
      levelLabel,
      ratio: 1,
      text: `${v.points.toLocaleString("vi-VN")} ${SECT_TERMS.points.toLowerCase()} (cấp cao nhất)`,
      now: v.points,
      max: v.points,
    };
  }
  const span = Math.max(1, v.pointsNext - v.pointsFrom);
  const done = Math.min(span, Math.max(0, v.points - v.pointsFrom));
  return {
    levelLabel,
    ratio: done / span,
    text: `${v.points.toLocaleString("vi-VN")} / ${v.pointsNext.toLocaleString("vi-VN")} ${SECT_TERMS.points.toLowerCase()}`,
    now: done,
    max: span,
  };
}

/** Các dòng buff đang có (cho người đang trực tuyến); rỗng khi chưa có. Ví dụ: ["+3% tu vi", "+3% cơ hội rơi đồ"]. */
export function hallBuffLines(b: SectBuff): string[] {
  const out: string[] = [];
  const pct = (x: number) => Math.round((x - 1) * 100);
  if (b.exp > 1) out.push(`+${pct(b.exp)}% tu vi`);
  if (b.drop > 1) out.push(`+${pct(b.drop)}% cơ hội rơi đồ`);
  if (b.regen > 1) out.push(`+${pct(b.regen)}% hồi khí huyết / linh lực`);
  return out;
}

// ---------- Cống hiến của mình ----------

export interface HallEarnNote {
  /** "Hôm nay: 50 / 140 cống hiến" */
  today: string;
  /** Ghi chú trạng thái (chờ sang ngày / đã đủ trần); `null` = kiếm bình thường */
  note: string | null;
  /** `true` khi CHƯA kiếm được (mới vào tông, phải sang ngày) */
  waiting: boolean;
}

/**
 * Ghi chú kiếm cống hiến của chính mình. `serverNowMs` = giờ máy chủ hiện tại (= `view.now` + thời gian đã trôi). Mới vào tông (`earnFromAt` còn ở tương lai): "Ngày mai mới kiếm được
 * cống hiến" kèm thời gian còn lại; đã đủ trần ngày: báo đủ.
 */
export function hallEarnNote(v: SectHallView, serverNowMs: number): HallEarnNote {
  const me = v.me;
  const today = `Hôm nay: ${me.earnedToday} / ${me.earnCap} ${SECT_TERMS.contrib.toLowerCase()}`;
  if (me.earnFromAt > serverNowMs) {
    return {
      today,
      note: `Mới vào tông môn: sau ${formatHallDuration(me.earnFromAt - serverNowMs)} (sang ngày mới) mới kiếm được ${SECT_TERMS.contrib.toLowerCase()}.`,
      waiting: true,
    };
  }
  if (me.earnedToday >= me.earnCap) {
    return { today, note: sectFailMessage("earn_cap"), waiting: false };
  }
  return { today, note: null, waiting: false };
}

/** Câu cảnh báo trong hộp xác nhận RỜI tông: nêu số cống hiến và công tích sẽ MẤT (không hoàn lại). `null` ảnh chụp = chưa có số, dùng câu chung. */
export function hallLeaveWarning(v: SectHallView | null): string {
  const base = "Rời tông môn?";
  if (!v)
    return `${base} ${SECT_TERMS.contrib} và ${SECT_TERMS.merit.toLowerCase()} của ngươi ở tông này sẽ mất, không hoàn lại.`;
  return `${base} Ngươi sẽ MẤT ${v.me.contrib.toLocaleString("vi-VN")} ${SECT_TERMS.contrib.toLowerCase()} và ${v.me.merit.toLocaleString("vi-VN")} ${SECT_TERMS.merit.toLowerCase()}, không hoàn lại.`;
}

// ---------- Nhiệm vụ hôm nay ----------

export interface HallQuestRow {
  questId: string;
  title: string;
  desc: string;
  /** "+20 cống hiến" */
  reward: string;
  /** "Độ khó 2" */
  level: string;
  state: SectHallQuestState;
  /** Chữ trạng thái: "Chưa nhận" / "Đang làm" / "Đã xong hôm nay" */
  stateLabel: string;
  /** Có bấm "Nhận" được không */
  canAccept: boolean;
  /** Có bấm "Trả" được không (đang làm; máy chủ kiểm lại tiến độ) */
  canTurnIn: boolean;
  /** Lý do khoá nút (hiện cạnh nút, đọc được bằng màn hình đọc); rỗng nếu không khoá */
  why: string;
}

/**
 * Các hàng nhiệm vụ hôm nay. `serverNowMs` = giờ máy chủ hiện tại (= `view.now` + thời gian đã trôi): chưa kiếm được cống hiến (còn chờ sang ngày, hoặc đã đủ trần ngày) thì nút Trả MỜ
 * kèm lý do (máy chủ vẫn quyết định: `not_warm` / `earn_cap`). `down` = đã gục / ở Hoàng Tuyền: khoá cả Nhận lẫn Trả, lý do là chuỗi `down` chung.
 */
export function hallQuestRows(
  v: SectHallView,
  opts: { serverNowMs: number; down: boolean },
): HallQuestRow[] {
  const waiting = v.me.earnFromAt > opts.serverNowMs;
  const capped = v.me.earnedToday >= v.me.earnCap;
  const canEarn = !waiting && !capped;
  const earnWhy = waiting ? sectFailMessage("not_warm") : sectFailMessage("earn_cap");
  return v.quests.map((q) => {
    const stateLabel =
      q.state === "done" ? "Đã xong hôm nay" : q.state === "active" ? "Đang làm" : "Chưa nhận";
    let why = "";
    if (q.state !== "done") {
      if (opts.down) why = sectFailMessage("down");
      else if (q.state === "active" && !canEarn) why = earnWhy;
    }
    return {
      questId: q.questId,
      title: q.title,
      desc: q.desc,
      reward: `+${q.ch} ${SECT_TERMS.contrib.toLowerCase()}`,
      level: `Độ khó ${q.difficulty}`,
      state: q.state,
      stateLabel,
      // Nhận không tốn gì nên nhận được kể cả khi chưa kiếm được hôm nay (chỉ khoá lúc đã gục); trả thì cần kiếm được
      canAccept: q.state === "offer" && !opts.down,
      canTurnIn: q.state === "active" && !opts.down && canEarn,
      why,
    };
  });
}

// ---------- Cửa hàng ----------

export interface HallShopRow {
  itemId: string;
  name: string;
  /** "5 cống hiến" */
  price: string;
  hall: "baoKho" | "tangKinh";
  /** "Bảo khố" / "Tàng Kinh Các" */
  hallLabel: string;
  /** "Còn 3 / 10 lượt hôm nay" */
  leftLabel: string;
  locked: SectShopLock | "down" | null;
  /** Lý do khoá bằng chữ (rỗng = mua được) */
  why: string;
  canBuy: boolean;
}

/** Tên món (tra bảng bằng `hasOwnProperty`); lạ thì chính id. */
function itemName(id: string): string {
  return has(ITEM_BY_ID, id) ? ITEM_BY_ID[id]!.name : id;
}

/** Chữ lý do khoá một món (hiện TRƯỚC khi bấm). `down` = đã gục: khoá cả cửa hàng. */
export function shopLockText(
  lock: SectShopLock | "down",
  row: { minLevel: number; cost: number },
  contrib: number,
): string {
  switch (lock) {
    case "level":
      return `Mở ở ${SECT_TERMS.level.toLowerCase()} ${row.minLevel} (${sectLevelInfo(row.minLevel).name}).`;
    case "known":
      return sectFailMessage("shop_known");
    case "limit":
      return sectFailMessage("shop_limit");
    case "no_contrib":
      return `Còn thiếu ${Math.max(1, row.cost - contrib)} ${SECT_TERMS.contrib.toLowerCase()}.`;
    case "down":
      return sectFailMessage("down");
  }
}

/** Các hàng cửa hàng, giữ thứ tự máy chủ gửi. `down` khoá cả cửa hàng với lý do chung. */
export function hallShopRows(v: SectHallView, opts: { down: boolean }): HallShopRow[] {
  return v.shop.map((e) => {
    const locked: SectShopLock | "down" | null = opts.down ? "down" : e.locked;
    return {
      itemId: e.itemId,
      name: itemName(e.itemId),
      price: `${e.cost.toLocaleString("vi-VN")} ${SECT_TERMS.contrib.toLowerCase()}`,
      hall: e.hall,
      hallLabel: e.hall === "tangKinh" ? SECT_TERMS.tangKinh : SECT_TERMS.baoKho,
      leftLabel: `Còn ${e.left} / ${e.limitDay} lượt hôm nay`,
      locked,
      why: locked ? shopLockText(locked, e, v.me.contrib) : "",
      canBuy: locked === null,
    };
  });
}
