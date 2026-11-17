/**
 * Sổ thành tựu + danh hiệu (M9.8, #1027): biến tin `achievements` của máy chủ (`shared/src/social.ts`: CHỈ `Soul.social` rút gọn, KHÔNG kèm định nghĩa)
 * thành chữ để hiện. Định nghĩa (`ACHIEVEMENTS` / `TITLES`) client đã có từ `shared/`, tiến độ tự tính từ `cond.{counter, atLeast}` + bộ đếm nhận được,
 * nên thêm thành tựu mới (D / E / G, M9.9) KHÔNG đổi giao thức. THUẦN (không DOM, không đồng hồ): `ui.ts` đổ kết quả vào DOM bằng `textContent`.
 *
 * Nguyên tắc: không tin tin nhắn (khoá lạ / quá số lượng / sai kiểu bị bỏ; không bao giờ gán `out["__proto__"]`); id thành tựu / danh hiệu lạ (máy chủ
 * mới hơn client) KHÔNG lộ ra màn hình; "danh hiệu đã mở" ở đây chỉ để HIỆN, máy chủ mới là bên quyết định (`titleSet` kiểm lại trong `update`).
 */
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_GROUPS,
  ACHIEVEMENT_GROUP_LABELS,
  SOCIAL_ACH_MAX,
  SOCIAL_COUNTER_CAP,
  SOCIAL_COUNTER_KEYS_MAX,
  TITLES,
  TITLE_ID_RE,
  achievementOf,
  achievementProgress,
  socialCounterMode,
  titleOf,
  type AchievementDef,
  type AchievementGroup,
  type AchievementNewMsg,
  type AchievementsMsg,
  type TitleDef,
} from "@tien-gioi/shared";
import { fmtCount, stepLabel } from "./board-view";

/** id thành tựu hợp lệ về văn phạm (bắt đầu bằng chữ / số: KHÔNG `__proto__`, không `constructor` kiểu khoá đặc biệt vì ta chỉ gán qua khoá đã lọc). */
const ACH_ID_RE = /^[a-z0-9][a-z0-9_]{0,47}$/;
const MAX_AT_LEN = 40;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Làm sạch tin `achievements` đến từ mạng: đúng kiểu thì trả `AchievementsMsg` (khoá hợp lệ, số kẹp, cắt theo trần của hợp đồng), sai thì `null`.
 * `title` không đúng `TITLE_ID_RE` thì coi là không đeo.
 */
export function sanitizeAchievementsMsg(raw: unknown): AchievementsMsg | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const m = raw as Record<string, unknown>;
  const ach: Record<string, string> = {};
  if (m.ach !== null && typeof m.ach === "object" && !Array.isArray(m.ach)) {
    let n = 0;
    for (const [k, v] of Object.entries(m.ach as Record<string, unknown>)) {
      if (n >= SOCIAL_ACH_MAX) break;
      if (!ACH_ID_RE.test(k) || typeof v !== "string") continue;
      ach[k] = v.slice(0, MAX_AT_LEN);
      n++;
    }
  }
  const counters: Record<string, number> = {};
  if (m.counters !== null && typeof m.counters === "object" && !Array.isArray(m.counters)) {
    let n = 0;
    for (const [k, v] of Object.entries(m.counters as Record<string, unknown>)) {
      if (n >= SOCIAL_COUNTER_KEYS_MAX) break;
      if (socialCounterMode(k) === null || !isNum(v)) continue;
      counters[k] = Math.min(SOCIAL_COUNTER_CAP, Math.max(0, Math.floor(v)));
      n++;
    }
  }
  const title = typeof m.title === "string" && TITLE_ID_RE.test(m.title) ? m.title : null;
  return { ach, counters, title };
}

/** Làm sạch tin `achievementNew`: `{ id }` với `id` đúng văn phạm, sai thì `null`. */
export function sanitizeAchievementNewMsg(raw: unknown): AchievementNewMsg | null {
  if (raw === null || typeof raw !== "object") return null;
  const id = (raw as { id?: unknown }).id;
  return typeof id === "string" && ACH_ID_RE.test(id) ? { id } : null;
}

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/**
 * Danh hiệu ĐÃ MỞ (chỉ để HIỆN): `reward.titleId` của mọi thành tựu đã đạt mà danh hiệu còn có thật trong `TITLES`. Thành tựu / danh hiệu lạ bị bỏ.
 * Máy chủ quyết định thật (`titleSet` kiểm lại trong `SoulStore.update`).
 */
export function unlockedTitleIds(
  ach: Readonly<Record<string, string>>,
  defs: readonly AchievementDef[] = ACHIEVEMENTS,
  titles: readonly TitleDef[] = TITLES,
): Set<string> {
  const known = new Set(titles.map((t) => t.id));
  const out = new Set<string>();
  for (const a of defs) {
    const t = a.reward?.titleId;
    if (t !== undefined && hasOwn(ach, a.id) && known.has(t)) out.add(t);
  }
  return out;
}

/** Ngày đạt từ chuỗi ISO máy chủ ghi ("17/11/2026", giờ máy người chơi: chỉ HIỆN, không dùng để tính gì); không hợp lệ -> "". */
export function fmtAchDate(iso: unknown): string {
  if (typeof iso !== "string") return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("vi-VN");
}

/** Chữ tiến độ theo họ bộ đếm: kiếp, cảnh giới (đổi bậc ra tên), bản đồ (đã đến / chưa), còn lại "có / cần". `rawHave` là giá trị THẬT của bộ đếm (chưa kẹp). */
export function progressText(def: AchievementDef, rawHave: number): string {
  const need = def.cond.atLeast;
  const have = Math.max(0, rawHave);
  const fam = def.cond.counter.split(":")[0];
  if (fam === "realm_step") return `${stepLabel(have)} / ${stepLabel(need)}`;
  if (fam === "map") return have >= need ? "Đã đến" : "Chưa đến";
  if (def.cond.counter === "kiep")
    return `Kiếp ${fmtCount(Math.min(have, need))} / ${fmtCount(need)}`;
  return `${fmtCount(Math.min(have, need))} / ${fmtCount(need)}`;
}

export interface AchItemView {
  id: string;
  name: string;
  desc: string;
  done: boolean;
  /** Ngày đạt ("" nếu chưa đạt / không đọc được). */
  at: string;
  /** Tiến độ bằng chữ ("6 / 10", "Hoàn thành"). */
  progress: string;
  /** 0-100 cho thanh tiến độ. */
  pct: number;
  /** "Thưởng: danh hiệu Tái Sinh, +2 Duyên" ("" nếu không có thưởng). */
  reward: string;
  /** Mới đạt mà chưa xem. */
  isNew: boolean;
}

export interface AchGroupView {
  id: AchievementGroup;
  label: string;
  done: number;
  total: number;
  items: AchItemView[];
}

export interface TitleChoiceView {
  id: string;
  text: string;
  unlocked: boolean;
  worn: boolean;
  /** Với danh hiệu CHƯA mở: "Mở bằng thành tựu: X" (không lộ id). */
  hint: string;
}

export interface AchievementsView {
  groups: AchGroupView[];
  done: number;
  total: number;
  /** "Đã đạt 1 / 4 thành tựu." */
  summary: string;
  titles: TitleChoiceView[];
  /** Danh hiệu đang đeo (id) nếu còn hợp lệ, không thì `null`. */
  worn: string | null;
  wornText: string;
}

/** Danh hiệu chia hai phần: ĐÃ mở (hiện thẳng, đeo được) và CHƯA mở (gập lại; M9.9 có 32 danh hiệu, hiện cả 31 cái khoá thì người chơi phải cuộn ~1800 px ở 360 x 640 mới tới thành tựu). */
export interface TitleSplit {
  open: TitleChoiceView[];
  locked: TitleChoiceView[];
  /** "Còn 3 danh hiệu chưa mở" (rỗng khi không còn cái nào khoá). */
  lockedLabel: string;
}

/** Tách danh sách danh hiệu của `achievementsView` thành đã mở / chưa mở, giữ nguyên thứ tự dữ liệu trong từng phần. */
export function splitTitles(titles: readonly TitleChoiceView[]): TitleSplit {
  const open = titles.filter((t) => t.unlocked);
  const locked = titles.filter((t) => !t.unlocked);
  return {
    open,
    locked,
    lockedLabel: locked.length > 0 ? `Còn ${fmtCount(locked.length)} danh hiệu chưa mở` : "",
  };
}

function rewardText(a: AchievementDef): string {
  const parts: string[] = [];
  const t = a.reward?.titleId !== undefined ? titleOf(a.reward.titleId) : undefined;
  if (t) parts.push(`danh hiệu ${t.text}`);
  const d = a.reward?.duyen;
  if (typeof d === "number" && d > 0) parts.push(`+${fmtCount(d)} Duyên`);
  return parts.length > 0 ? `Thưởng: ${parts.join(", ")}` : "";
}

/**
 * Tin `achievements` -> dữ liệu hiện. `newIds` = thành tựu mới đạt chưa xem (đánh dấu "Mới"). Nhóm theo thứ tự `ACHIEVEMENT_GROUPS`, bỏ nhóm rỗng;
 * trong nhóm giữ thứ tự dữ liệu. Thành tựu có bộ đếm lạ vẫn hiện (tiến độ 0), không sập.
 */
export function achievementsView(
  msg: AchievementsMsg,
  newIds: ReadonlySet<string> = new Set(),
  defs: readonly AchievementDef[] = ACHIEVEMENTS,
  titles: readonly TitleDef[] = TITLES,
): AchievementsView {
  const ach = msg.ach ?? {};
  const counters = msg.counters ?? {};
  const byGroup = new Map<AchievementGroup, AchItemView[]>();
  let done = 0;
  for (const a of defs) {
    const p = achievementProgress(a, counters, ach);
    const raw = hasOwn(counters, a.cond.counter) ? counters[a.cond.counter] : 0;
    if (p.done) done++;
    const item: AchItemView = {
      id: a.id,
      name: a.name,
      desc: a.desc,
      done: p.done,
      at: p.done ? fmtAchDate(ach[a.id]) : "",
      progress: p.done ? "Hoàn thành" : progressText(a, raw),
      pct: p.done ? 100 : Math.min(100, Math.max(0, Math.floor((p.have / p.need) * 100))),
      reward: rewardText(a),
      isNew: p.done && newIds.has(a.id),
    };
    const list = byGroup.get(a.group) ?? [];
    list.push(item);
    byGroup.set(a.group, list);
  }
  const groups: AchGroupView[] = [];
  for (const g of ACHIEVEMENT_GROUPS) {
    const items = byGroup.get(g);
    if (!items || items.length === 0) continue;
    groups.push({
      id: g,
      label: ACHIEVEMENT_GROUP_LABELS[g],
      done: items.filter((i) => i.done).length,
      total: items.length,
      items,
    });
  }
  const unlocked = unlockedTitleIds(ach, defs, titles);
  const worn =
    msg.title !== null && unlocked.has(msg.title) && titleOf(msg.title) ? msg.title : null;
  const titleViews: TitleChoiceView[] = titles.map((t) => {
    const src = defs.find((a) => a.reward?.titleId === t.id);
    return {
      id: t.id,
      text: t.text,
      unlocked: unlocked.has(t.id),
      worn: worn === t.id,
      hint: unlocked.has(t.id) ? "" : src ? `Mở bằng thành tựu: ${src.name}` : "Chưa có cách mở",
    };
  });
  const wornDef = worn !== null ? titleOf(worn) : undefined;
  return {
    groups,
    done,
    total: defs.length,
    summary: `Đã đạt ${fmtCount(done)} / ${fmtCount(defs.length)} thành tựu.`,
    titles: titleViews,
    worn,
    wornText: wornDef ? `Danh hiệu đang đeo: ${wornDef.text}` : "Chưa đeo danh hiệu.",
  };
}

/**
 * Chữ toast phụ khi một thành tựu MỚI mở danh hiệu (máy chủ đã gửi toast "Đạt thành tựu: ..." riêng nên client KHÔNG lặp lại câu đó):
 * "Mở danh hiệu Tái Sinh: mở bảng Xã hội để đeo." Thành tựu lạ / không thưởng danh hiệu -> `null` (không toast thêm).
 */
export function titleUnlockToast(id: string): string | null {
  const t = achievementOf(id)?.reward?.titleId;
  const def = t !== undefined ? titleOf(t) : undefined;
  return def ? `Mở danh hiệu ${def.text}: mở bảng Xã hội để đeo.` : null;
}

/**
 * Bộ điều tiết "khi nào được xin lại" (dùng cho tin xin của bảng Xã hội): không xin lại trong `gapMs` nếu ĐÃ có dữ liệu; chưa có dữ liệu mà quá `waitMs` từ
 * lần xin cuối thì coi là "im" (hiện nút Tải lại). `now` là đồng hồ máy khách CHỈ để đo khoảng.
 */
export class AskGate {
  private askedAt: number | null = null;
  constructor(
    private readonly gapMs = 20_000,
    private readonly waitMs = 6_000,
  ) {}

  /** Có nên gửi tin xin bây giờ không (và ghi nhận lần xin nếu có). `force` = người chơi bấm "Tải lại". */
  tryAsk(now: number, hasData: boolean, force = false): boolean {
    if (!force && this.askedAt !== null && now - this.askedAt < this.gapMs && hasData) return false;
    this.askedAt = now;
    return true;
  }

  /** Chưa có dữ liệu mà đã xin quá `waitMs`: máy chủ im. */
  stale(now: number, hasData: boolean): boolean {
    return !hasData && this.askedAt !== null && now - this.askedAt >= this.waitMs;
  }

  get waitMsValue(): number {
    return this.waitMs;
  }
}
