// Thanh chiêu thức L U I O (ô 2-5) ở client (M7.6, #507, docs/THIET_KE_THANH_CHIEU.md). Lớp THUẦN: không biết Phaser / DOM, đồng hồ do người gọi
// truyền vào (`now`, ms) nên test được. Client KHÔNG đoán trước kết quả `cast` (không tự trừ linh lực, không tự đặt hồi chiêu): chỉ chặn gửi những ca
// CHẮC CHẮN bị server từ chối (khoá, trống, thiếu cảnh giới, choáng, hồi chiêu, thiếu linh lực) để tiết kiệm tin (giới hạn 10/s).
// Client không tin tin nhắn: `skills` đi qua `sanitizeSkillBook` + kẹp thời gian, id lạ / độc bị bỏ.
import {
  LEARNABLE_SLOTS,
  SKILL_MAX_LEVEL,
  SLOT_UNLOCK_REALM,
  REALMS,
  realmLabel,
  sanitizeSkillBook,
  skillMpCost,
  skillOf,
  skillReqMet,
  slotOpen,
  elementOf,
  type SkillBook,
  type SkillDef,
  type SkillShape,
  type SkillSlot,
  type SkillsMsg,
} from "@tien-gioi/shared";

/** Hồi chiêu còn lại tối đa mà client chịu nhận (ms): chiêu dài nhất ~ vài chục giây; số rác không làm vòng quét kẹt hàng giờ. */
const CD_CLAMP_MS = 10 * 60 * 1000;

/** Ô trong mảng `SkillsMsg` (chỉ số 0-3) của ô 2-5. */
function indexOfSlot(slot: SkillSlot): number {
  return slot - 2;
}

function msClamp(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(CD_CLAMP_MS, Math.max(0, v)) : 0;
}

/** Sổ chiêu của CHÍNH MÌNH ở client: bản `SkillsMsg` mới nhất + mốc nhận, tự đếm lùi hồi chiêu theo đồng hồ client. */
export class SkillTracker {
  private book: SkillBook = { learned: {}, slots: ["", "", "", ""] };
  private cd: [number, number, number, number] = [0, 0, 0, 0];
  private cdMax: [number, number, number, number] = [0, 0, 0, 0];
  /** Lúc (ms, đồng hồ của người gọi) nhận `skills`: `cd` của từng ô tính từ mốc này */
  private at = 0;
  /** Đã nhận `skills` ít nhất một lần chưa (chưa thì chưa biết gì: ô hiện trống, không phải "lỗi") */
  private got = false;
  /** Tăng mỗi lần nhận `skills`: người vẽ so để biết có phải dựng lại danh sách không */
  version = 0;

  /** Nhận sổ chiêu mới từ server (thay hẳn). Rác thì coi như sổ rỗng. */
  set(raw: unknown, now: number): void {
    const r = raw !== null && typeof raw === "object" ? (raw as Partial<SkillsMsg>) : {};
    // `realm` lớn: không lọc ô theo cảnh giới ở đây (server đã lọc; ô khoá do `slotView` quyết theo cảnh giới hiện tại, kể cả lúc vừa đột phá)
    this.book = sanitizeSkillBook({ learned: r.learned, slots: r.slots }, 99);
    for (let i = 0; i < 4; i++) {
      const id = this.book.slots[i];
      const cd = Array.isArray(r.cd) ? msClamp(r.cd[i]) : 0;
      const max = Array.isArray(r.cdMax) ? msClamp(r.cdMax[i]) : 0;
      this.cd[i] = id === "" ? 0 : cd;
      // cdMax không nhỏ hơn cd (vòng quét luôn trong 0..1) và 0 khi ô trống
      this.cdMax[i] = id === "" ? 0 : Math.max(max, cd);
    }
    this.at = now;
    this.got = true;
    this.version++;
  }

  /** Xoá hết (đổi bản đồ / nối lại): server gửi lại sổ đúng. */
  clear(): void {
    this.book = { learned: {}, slots: ["", "", "", ""] };
    this.cd = [0, 0, 0, 0];
    this.cdMax = [0, 0, 0, 0];
    this.got = false;
    this.version++;
  }

  get received(): boolean {
    return this.got;
  }

  /** Chiêu đang gắn ở ô ("" = trống). */
  skillAt(slot: SkillSlot): string {
    return this.book.slots[indexOfSlot(slot)];
  }

  /** Tầng đã học của chiêu (0 = chưa học). */
  levelOf(skillId: string): number {
    return Object.prototype.hasOwnProperty.call(this.book.learned, skillId)
      ? this.book.learned[skillId]
      : 0;
  }

  /** Mọi chiêu đã học theo thứ tự bảng (`SKILLS_M7`): thứ tự hiện ở bảng Công pháp. */
  learnedList(): Array<{ def: SkillDef; level: number }> {
    const out: Array<{ def: SkillDef; level: number }> = [];
    for (const id of Object.keys(this.book.learned)) {
      const def = skillOf(id);
      if (def) out.push({ def, level: this.book.learned[id] });
    }
    return out;
  }

  /** Hồi chiêu còn lại của ô tại `now` (ms, >= 0). Đồng hồ lùi coi như chưa trôi. */
  cdLeft(slot: SkillSlot, now: number): number {
    const elapsed = Math.max(0, now - this.at);
    return Math.max(0, this.cd[indexOfSlot(slot)] - elapsed);
  }

  cdTotal(slot: SkillSlot): number {
    return this.cdMax[indexOfSlot(slot)];
  }
}

/** Bảy trạng thái của một ô chiêu, theo THỨ TỰ ƯU TIÊN (đứng trước thắng): bảng ở mục 2 của docs/THIET_KE_THANH_CHIEU.md. */
export type SlotKind = "locked" | "empty" | "needRealm" | "stunned" | "cooldown" | "noMp" | "ready";

export interface SlotMe {
  realm: number;
  tier: number;
  mp: number;
  maxMp: number;
}

export interface SlotView {
  slot: SkillSlot;
  kind: SlotKind;
  /** Chiêu gắn ở ô ("" khi khoá / trống) */
  skillId: string;
  def: SkillDef | undefined;
  /** Tầng đã học (0 khi không có chiêu) */
  level: number;
  /** Hồi chiêu còn lại (ms) và phần còn lại 0..1 của vòng quét (0 khi không hồi chiêu) */
  cdLeftMs: number;
  cdFrac: number;
  /** Số giây hồi chiêu hiện trên ô (làm tròn LÊN, 0 khi không hồi chiêu) */
  cdSec: number;
  /** Linh lực mỗi lần dùng (0 khi không có chiêu) */
  mpCost: number;
  /** Có gửi `cast` được không: chỉ khi `ready` */
  canCast: boolean;
}

/**
 * Trạng thái ô `slot` tại `now`. `stunned` do người gọi lấy từ `StatusTracker.stunned(now)`. `skillReqMet` lấy từ shared (KHÔNG viết lại): kiếp mới
 * giữ chiêu khắc cần cảnh giới cao hơn lúc mới tu, server kiểm lại lúc dùng.
 */
export function slotView(
  slot: SkillSlot,
  skills: SkillTracker,
  me: SlotMe,
  stunned: boolean,
  now: number,
): SlotView {
  const skillId = skills.skillAt(slot);
  const def = skillId === "" ? undefined : skillOf(skillId);
  const base: SlotView = {
    slot,
    kind: "ready",
    skillId: def ? skillId : "",
    def,
    level: def ? skills.levelOf(def.id) : 0,
    cdLeftMs: 0,
    cdFrac: 0,
    cdSec: 0,
    mpCost: def ? skillMpCost(def, me.maxMp) : 0,
    canCast: false,
  };
  if (!slotOpen(slot, me.realm))
    return { ...base, kind: "locked", skillId: "", def: undefined, level: 0, mpCost: 0 };
  if (!def) return { ...base, kind: "empty" };
  if (!skillReqMet(def, me.realm, me.tier)) return { ...base, kind: "needRealm" };
  if (stunned) return { ...base, kind: "stunned" };
  const left = skills.cdLeft(slot, now);
  if (left > 0) {
    const total = Math.max(left, skills.cdTotal(slot));
    return {
      ...base,
      kind: "cooldown",
      cdLeftMs: left,
      cdFrac: Math.min(1, left / total),
      cdSec: Math.ceil(left / 1000),
    };
  }
  if (!(me.mp >= base.mpCost)) return { ...base, kind: "noMp" };
  return { ...base, kind: "ready", canCast: true };
}

/** Tên cảnh giới cho câu "Mở ở..." / "Cần đạt...": bậc đầu (Sơ kỳ) thì chỉ ghi tên cảnh giới ("Trúc Cơ"), bậc khác ghi đủ ("Trúc Cơ Trung kỳ"). */
function realmText(realm: number, tier: number): string {
  return tier === 0 && REALMS[realm] ? REALMS[realm].name : realmLabel(realm, tier);
}

/** Câu "Mở ở <cảnh giới>" của ô khoá. */
export function unlockText(slot: SkillSlot): string {
  return `Mở ở ${realmText(SLOT_UNLOCK_REALM[slot], 0)}`;
}

/** Câu "Cần đạt <cảnh giới>" của chiêu thiếu cảnh giới. */
export function needText(def: Pick<SkillDef, "reqRealm" | "reqTier">): string {
  return `Cần đạt ${realmText(def.reqRealm, def.reqTier)}`;
}

/** Thông báo (toast) khi bấm ô mà server chắc chắn từ chối; `null` = im lặng (đã có vòng quét / ô choáng nói thay). */
export function blockedToast(v: SlotView): string | null {
  switch (v.kind) {
    case "locked":
      return `Ô chiêu thức ${v.slot} chưa mở: ${unlockText(v.slot)}.`;
    case "empty":
      return `Ô chiêu thức ${v.slot} còn trống. Gắn chiêu ở bảng Công pháp.`;
    case "needRealm":
      return v.def ? `${needText(v.def)} để dùng ${v.def.name}.` : null;
    case "noMp":
      return "Linh lực không đủ.";
    case "stunned":
    case "cooldown":
    case "ready":
      return null;
  }
}

/** Trạng thái nói thành lời cho `aria-label` ("sẵn sàng", "hồi chiêu 3 giây", "cần đạt Trúc Cơ"...). */
export function stateText(v: SlotView): string {
  switch (v.kind) {
    case "locked":
      return unlockText(v.slot).toLowerCase();
    case "empty":
      return "còn trống";
    case "needRealm":
      return v.def ? needText(v.def).toLowerCase() : "chưa đủ cảnh giới";
    case "stunned":
      return "đang choáng";
    case "cooldown":
      return `hồi chiêu ${v.cdSec} giây`;
    case "noMp":
      return `thiếu linh lực, cần ${v.mpCost}`;
    case "ready":
      return "sẵn sàng";
  }
}

/** `aria-label` đầy đủ của ô: "Ô chiêu thức 2: Hoả Vân Kiếm, tầng 2, sẵn sàng (Phím L)". `keys` = nhãn các phím (rỗng thì bỏ phần phím). */
export function slotAriaLabel(v: SlotView, keys: readonly string[]): string {
  const head = `Ô chiêu thức ${v.slot}`;
  const key = keys.length ? ` (Phím ${keys.join(" hoặc ")})` : "";
  if (!v.def) return `${head}, ${stateText(v)}${key}`;
  return `${head}: ${v.def.name}, tầng ${v.level}, ${stateText(v)}${key}`;
}

/**
 * Tên viết tắt dưới ô (<= `max` ký tự): lấy các TỪ đầu vừa chỗ ("Hỏa Vân Kiếm" -> "Hỏa Vân"); từ đầu đã quá dài thì cắt và thêm "…". Chỉ là gợi nhớ
 * (biểu tượng + chấm tầng mới là nhận dạng chính); tên đầy đủ nằm ở `aria-label` / `title`.
 */
export function shortName(name: string, max = 7): string {
  const s = name.normalize("NFC").trim().replace(/\s+/g, " ");
  if (s.length <= max) return s;
  const words = s.split(" ");
  let out = "";
  for (const w of words) {
    const next = out === "" ? w : `${out} ${w}`;
    if (next.length > max) break;
    out = next;
  }
  if (out !== "") return out;
  return `${words[0].slice(0, max - 1)}…`;
}

/**
 * Cách chọn HƯỚNG đánh theo hình chiêu (A xác nhận ở #536): `move` = bộ pháp lao: hướng ĐANG DI CHUYỂN, không có input thì hướng nhìn, KHÔNG quay về quái
 * gần nhất (sẽ lao vào quái); `facing` = vòng nổ / hộ thể: không cần hướng (gửi hướng nhìn); `target` = đánh về phía con trỏ (máy tính có chuột trong canvas)
 * hoặc `aim` (khoá / quái gần / hướng nhìn). Chiêu `ground` chỉ lấy HƯỚNG (server đặt vùng cách mình đúng `reach`, không theo khoảng cách tới con trỏ).
 */
export type AimMode = "move" | "facing" | "target";
export function aimMode(shape: SkillShape): AimMode {
  switch (shape) {
    case "dash":
      return "move";
    case "nova":
    case "self":
      return "facing";
    case "cone":
    case "line":
    case "fan":
    case "ground":
      return "target";
  }
}

/** Màu theo hệ cho biểu tượng vẽ bằng mã (chưa có hình nguồn, M7.8 / #509); hệ lạ -> xám. */
export const ELEMENT_COLOR: Readonly<Record<string, string>> = {
  kim: "#e0c25a",
  moc: "#5fbf6a",
  thuy: "#4a90e2",
  hoa: "#e8573a",
  tho: "#b8885a",
  bang: "#8fd8f0",
  phong: "#9fe3c2",
  loi: "#c58cf2",
  am: "#8a6fb0",
  none: "#b9b3a6",
};

export function elementColor(id: unknown): string {
  const e = elementOf(id);
  return e ? (ELEMENT_COLOR[e.id] ?? ELEMENT_COLOR.none) : ELEMENT_COLOR.none;
}

/** Số chấm tầng hiện trên ô (1..3): chiêu chưa học / lạ -> 0. */
export function levelPips(level: number): number {
  return Number.isFinite(level) ? Math.min(SKILL_MAX_LEVEL, Math.max(0, Math.floor(level))) : 0;
}

/**
 * Bảng ô theo thứ tự L U I O. Chỉ để lặp `LEARNABLE_SLOTS` ở một chỗ (người gọi khỏi tự gõ [2,3,4,5]).
 */
export const BAR_SLOTS: readonly SkillSlot[] = LEARNABLE_SLOTS;

// ---------------------------------------------------------------------------------------------------------------
// Dữ liệu giả để làm giao diện trước (`?skills=mock`, chỉ DEV / ?debug)
// ---------------------------------------------------------------------------------------------------------------

/**
 * `?skills=mock`: chế độ giả lập thanh chiêu (gộp với mock room có sẵn). Chỉ bật khi ở môi trường DEV hoặc URL có `?debug` (như `?duel=mock`);
 * `?skills=mock&n=0|1|2|4` chọn số chiêu mẫu (mặc định 4).
 */
export function isMockSkillsEnabled(
  search: string = typeof location !== "undefined" ? location.search : "",
  isDev: boolean = typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV),
): boolean {
  const params = new URLSearchParams(search);
  if (params.get("skills") !== "mock") return false;
  return isDev || params.has("debug");
}

/** Số chiêu mẫu (0 / 1 / 2 / 4) từ `?n=`; giá trị khác -> 4. */
export function mockSkillCount(search: string): 0 | 1 | 2 | 4 {
  const n = new URLSearchParams(search).get("n");
  return n === "0" ? 0 : n === "1" ? 1 : n === "2" ? 2 : 4;
}

/**
 * `SkillsMsg` mẫu cho `n` chiêu đã gắn (ô 2..n+1). Lấy chiêu thật từ `SKILLS_M7` theo thứ tự bảng; ô đầu đang hồi chiêu giả (3 s) để thấy vòng quét.
 * `cdMs` ghi đè hồi chiêu ô đầu (0 = không hồi chiêu).
 */
export function mockSkillsMsg(ids: readonly string[], n: 0 | 1 | 2 | 4, cdMs = 0): SkillsMsg {
  const slots: [string, string, string, string] = ["", "", "", ""];
  const cd: [number, number, number, number] = [0, 0, 0, 0];
  const cdMax: [number, number, number, number] = [0, 0, 0, 0];
  const learned: Record<string, number> = {};
  for (let i = 0; i < ids.length; i++) learned[ids[i]] = 1 + (i % SKILL_MAX_LEVEL);
  for (let i = 0; i < n && i < ids.length; i++) {
    slots[i] = ids[i];
    const def = skillOf(ids[i]);
    cdMax[i] = def?.cooldown ?? 0;
  }
  if (n > 0) cd[0] = Math.min(cdMs, cdMax[0]);
  return { learned, slots, cd, cdMax };
}

/** Cảnh giới của người chơi giả: `?realm=N` (0..8) nếu có, không thì đủ để mở số ô cần thấy (4 chiêu -> Nguyên Anh mở cả bốn ô; 0 / 1 / 2 chiêu -> mở vừa đủ ô). */
export function mockRealm(search: string, n: 0 | 1 | 2 | 4): number {
  const raw = new URLSearchParams(search).get("realm");
  if (raw !== null && /^\d$/.test(raw)) return Number(raw);
  return n === 4 ? 4 : n === 2 ? 2 : n === 1 ? 1 : 2;
}

/**
 * Máy chủ giả: gắn hồi chiêu cho ô vừa dùng (đúng `cdMax` của ô). Trả `null` khi ô trống hoặc đang hồi (máy chủ thật cũng im lặng). `cdLeftMs` = hồi chiêu
 * còn lại của ô lúc này (người gọi tự đếm theo đồng hồ).
 */
export function mockCast(msg: SkillsMsg, slot: SkillSlot, cdLeftMs: number): SkillsMsg | null {
  const i = indexOfSlot(slot);
  if (msg.slots[i] === "" || cdLeftMs > 0) return null;
  const cd: [number, number, number, number] = [0, 0, 0, 0];
  cd[i] = msg.cdMax[i];
  return { ...msg, cd };
}
