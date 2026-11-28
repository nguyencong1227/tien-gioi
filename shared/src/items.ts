// Vật phẩm, bảng rơi đồ, túi đồ: hợp đồng giữa client và server (Sprint 1).
// Server quyết định mọi thứ (rơi gì, nhặt được không, dùng được không); client chỉ hiển thị.

import { SKILL_BOOK_ITEMS, bookIdOf } from "./books";
import { STAT_CAPS } from "./stat-caps";
import type { Element, StatusId } from "./skills";
import { OWNER_GEAR_ITEMS } from "./owner-gear";

export type ItemType = "consumable" | "material" | "equip" | "book";
/** 0 phàm phẩm, 1 linh phẩm, 2 bảo phẩm, 3 tiên phẩm, 4 thần phẩm */
export type Rarity = 0 | 1 | 2 | 3 | 4;

export const RARITY_NAMES = [
  "Phàm phẩm",
  "Linh phẩm",
  "Bảo phẩm",
  "Tiên phẩm",
  "Thần phẩm",
] as const;
/** Màu gợi ý cho viền ô / hiệu ứng nhấp nháy đồ rơi */
export const RARITY_COLORS = [0xc9c4b8, 0x6fcf73, 0x4fa3ff, 0xc277ff, 0xffb23f] as const;

/**
 * Hiệu ứng khi dùng. pct tính theo giá trị tối đa (khí huyết, linh lực, thanh tu vi của bậc hiện tại).
 * `maxExp` (chỉ đan tu vi): trần tuyệt đối số tu vi mỗi viên. Thanh tu vi lớn dần theo cảnh giới (Kim Đan 48000 so với Trúc Cơ ~5000),
 * nên "5% thanh" tăng theo mà tu vi từ quái không tăng kịp: không có trần thì Tụ Khí Đan thành đường tắt ở Kim Đan
 * (docs/CAN_BANG.md mục "Kim Đan trước M6": một thanh Xích Mãng 60 -> 24 phút). Dùng `expPillGain` để tính, không tự nhân `pct`.
 */
export type ItemEffect =
  | { kind: "healHp"; pct: number }
  | { kind: "healMp"; pct: number }
  | { kind: "exp"; pct: number; maxExp?: number }
  /**
   * Nghề nhỏ (#514): dùng vật phẩm thì GẮN trạng thái CÓ LỢI `id` lên người dùng (đan hộ đạo `dao_ho`; sau này phù / đan tăng cường), thời gian
   * `ms`, cường độ `ratio`. Máy chủ KHÔNG tin số trong dữ liệu: kẹp bằng `clampStatusEffect` theo `STATUSES` (`maxMs`, `maxRatio`).
   * `forRealm` (chỉ đan hộ đạo): cảnh giới đang đứng ở đỉnh để đột phá lên `forRealm + 1`; đan sai bậc bị từ chối, KHÔNG trừ đan.
   */
  | { kind: "status"; id: StatusId; ratio: number; ms: number; forRealm?: number };

/**
 * Những chuỗi người chơi phải thấy trong `desc` của vật phẩm có `ItemEffect` kind `status`: phần trăm làm tròn ("12%" hoặc "12 %", chấp nhận cả hai
 * kiểu viết) và thời gian ("900 giây", thêm "15 phút" khi chẵn phút). `pct` rỗng khi `ratio` làm tròn về 0 (không có số để nêu).
 */
export function statusEffectFigures(e: { ratio: number; ms: number }): {
  pct: string[];
  time: string[];
} {
  const p = Math.round(e.ratio * 100);
  const secs = Math.round(e.ms / 1000);
  const time = [`${secs} giây`];
  if (secs > 0 && secs % 60 === 0) time.push(`${secs / 60} phút`);
  return { pct: p > 0 ? [`${p}%`, `${p} %`] : [], time };
}

/**
 * `desc` có chứa `figure` như MỘT SỐ NGUYÊN VẸN không: ký tự đứng ngay trước không được là chữ số / dấu thập phân (`.`, `,`), để "12%" không khớp
 * "112%" hay "0,12%" và "15 phút" không khớp "115 phút".
 */
function hasFigure(desc: string, figure: string): boolean {
  for (let i = desc.indexOf(figure); i >= 0; i = desc.indexOf(figure, i + 1)) {
    if (i === 0 || !/[\d.,]/.test(desc[i - 1])) return true;
  }
  return false;
}

/** `desc` có nêu ĐÚNG con số của hiệu ứng trạng thái không (xem `statusEffectFigures`): D viết tay, A chỉnh số thì lệch; test hợp đồng bắt. */
export function statusDescMatches(desc: string, e: { ratio: number; ms: number }): boolean {
  const f = statusEffectFigures(e);
  return (
    (f.pct.length === 0 || f.pct.some((s) => hasFigure(desc, s))) &&
    f.time.some((s) => hasFigure(desc, s))
  );
}

/** Tu vi một viên đan tu vi cho khi thanh tu vi tối đa là `expMax`: `round(expMax * pct)`, cắt ở `maxExp` nếu có; luôn số nguyên >= 0. */
export function expPillGain(effect: { pct: number; maxExp?: number }, expMax: number): number {
  const raw = Number.isFinite(expMax) && expMax > 0 ? Math.round(expMax * effect.pct) : 0;
  const cap =
    effect.maxExp !== undefined && Number.isFinite(effect.maxExp)
      ? Math.max(0, Math.floor(effect.maxExp))
      : Infinity;
  return Math.max(0, Math.min(raw, cap));
}

// ---------- Trang bị (Sprint 3) ----------

/**
 * Sáu ô trang bị (M7.4, #505; hợp đồng ở `docs/THIET_KE_NHAN_VAT_6_O.md` mục 8). Ba ô đầu CÔNG KHAI (ai cũng thấy để vẽ ngoại hình, trường `Player.weapon / robe /
 * talisman`); ba ô sau (hài, ngọc bội, pháp bảo) là RIÊNG của chủ (`Player.boots / jade / treasure` với `@view(TAG_OWNER)`: không đổi ngoại hình, người khác không nhận byte nào).
 */
export type PublicEquipSlot = "weapon" | "robe" | "talisman";
export type OwnerEquipSlot = "boots" | "jade" | "treasure";
export type EquipSlot = PublicEquipSlot | OwnerEquipSlot;
/** Thứ tự hiển thị trong bảng nhân vật (lưới 3 x 2: ba ô công khai trên, ba ô riêng dưới) */
export const EQUIP_SLOTS: EquipSlot[] = ["weapon", "robe", "talisman", "boots", "jade", "treasure"];
/** Ô CÔNG KHAI (có trong state cho mọi người) */
export const PUBLIC_EQUIP_SLOTS: readonly PublicEquipSlot[] = ["weapon", "robe", "talisman"];
/** Ô RIÊNG của chủ (chỉ chủ nhận, qua `StateView`) */
export const OWNER_EQUIP_SLOTS: readonly OwnerEquipSlot[] = ["boots", "jade", "treasure"];
export const EQUIP_SLOT_NAMES: Record<EquipSlot, string> = {
  weapon: "Vũ khí",
  // "Áo bào" (không phải "Pháp bào"): nhãn cũ chỉ khác "Pháp bảo" (ô 6) đúng một dấu, thẻ viết hoa "PHÁP BÀO" / "PHÁP BẢO" dễ đọc nhầm (nit của A ở #646)
  robe: "Áo bào",
  talisman: "Hộ phù",
  boots: "Hài",
  jade: "Ngọc bội",
  treasure: "Pháp bảo",
};

/**
 * Cảnh giới (`realm`) tối thiểu để dùng một ô; ô vắng khỏi bảng = mở từ đầu. Pháp bảo mở từ Kim Đan (`realm` 3). MỘT bảng cho server (từ chối mặc, bỏ qua chỉ số của ô
 * chưa mở trong `equipBonus` khi truyền `realm`) và client (ghi "Mở ở Kim Đan", khoá thẻ).
 */
export const EQUIP_SLOT_UNLOCK_REALM: Readonly<Partial<Record<EquipSlot, number>>> = {
  treasure: 3,
};

/** Ô `slot` đã mở ở cảnh giới `realm`? Ô lạ / `realm` không hữu hạn: chưa mở. */
export function equipSlotOpen(slot: unknown, realm: number): boolean {
  if (typeof slot !== "string" || !(EQUIP_SLOTS as string[]).includes(slot)) return false;
  if (!Number.isFinite(realm)) return false;
  const need = EQUIP_SLOT_UNLOCK_REALM[slot as EquipSlot];
  return need === undefined || realm >= need;
}

/** Chỉ số cộng thêm (cộng thẳng vào chỉ số gốc, không nhân) */
export interface EquipStats {
  atk?: number;
  hp?: number;
  mp?: number;
  /** px/giây */
  speed?: number;
  /** Điểm bạo kích (%, M7.4): tổng từ trang bị kẹp theo `STAT_CAPS.crit` */
  crit?: number;
  /** Giảm hồi chiêu (%, M7.4): tổng từ trang bị kẹp theo `STAT_CAPS.cdr` */
  cdr?: number;
  /** Giảm sát thương nhận (%, M7.4): tổng từ trang bị kẹp theo `STAT_CAPS.guard` */
  guard?: number;
}

// Trần ba chỉ số phần trăm của trang bị: định nghĩa ở `stat-caps.ts` (tệp lá, tránh vòng import với `skills.ts`), xuất lại ở đây.
export { STAT_CAPS };

export interface EquipDef {
  slot: EquipSlot;
  stats: EquipStats;
  /** Cảnh giới tối thiểu để mặc: realm + tier (so theo stepOf) */
  reqRealm: number;
  reqTier: number;
  /** Chỉ có ở món của ô `treasure` (pháp bảo, M7.4): nội tại đặc biệt, tra bằng `treasureOf`; server thực thi (`systems/treasure.ts`) */
  treasure?: TreasureId;
}

/**
 * Đồ đang mặc: itemId theo từng ô, "" = trống. Ba ô công khai (`weapon`, `robe`, `talisman`) server đặt thẳng trên Player trong state nên client đọc từ chính player;
 * ba ô riêng (`boots`, `jade`, `treasure`) cũng nằm trên Player nhưng CHỈ CHỦ nhận (`@view(TAG_OWNER)`): client chỉ đọc được của chính mình. Trong KIỂU, ba ô riêng
 * là TUỲ CHỌN trong kiểu và trong `emptyEquipment()` (vắng hoặc `""` = trống): mã dựng `Equipment` ba khoá, file lưu cũ và test cũ vẫn nguyên; mọi hàm đọc (`equipBonus`,
 * `sanitizeEquipment`...) coi ô vắng là trống, và duyệt cả sáu ô bằng `EQUIP_SLOTS`.
 */
export type Equipment = Record<PublicEquipSlot, string> & Partial<Record<OwnerEquipSlot, string>>;

export function emptyEquipment(): Equipment {
  return { weapon: "", robe: "", talisman: "" };
}

export interface ItemDef {
  id: string;
  name: string;
  type: ItemType;
  /** Số lượng tối đa trong một ô túi */
  stack: number;
  rarity: Rarity;
  desc: string;
  /** Chỉ có ở đan dược */
  effect?: ItemEffect;
  /** Hồi chiêu sau khi dùng (ms), tính riêng cho từng loại vật phẩm */
  cooldown?: number;
  /** Chỉ có ở trang bị (type "equip", stack 1) */
  equip?: EquipDef;
  /** Chỉ có ở kinh quyển (type "book", M7): id `SkillDef` mà dùng quyển sẽ học (hoặc +1 tầng nếu đã học). Tra bằng `skillOf`. */
  teaches?: string;
  /** Màu ảnh tạm (trước khi có asset thật) */
  color: number;
}

export const ITEMS: ItemDef[] = [
  // ---------- Đan dược ----------
  {
    id: "hoi_huyet_dan",
    name: "Hồi Huyết Đan",
    type: "consumable",
    stack: 20,
    rarity: 0,
    desc: "Hồi 40% khí huyết.",
    effect: { kind: "healHp", pct: 0.4 },
    cooldown: 8_000,
    color: 0xd9433b,
  },
  {
    id: "hoi_linh_dan",
    name: "Hồi Linh Đan",
    type: "consumable",
    stack: 20,
    rarity: 0,
    desc: "Hồi 50% linh lực.",
    effect: { kind: "healMp", pct: 0.5 },
    cooldown: 8_000,
    color: 0x3b7bd9,
  },
  {
    id: "tu_khi_dan",
    name: "Tụ Khí Đan",
    type: "consumable",
    stack: 10,
    rarity: 1,
    desc: "Tăng 5% thanh tu vi của bậc hiện tại (tối đa 300 tu vi mỗi viên).",
    // Hiếm: chỉ rơi từ Hắc Hổ / Xích Mãng và thưởng nhiệm vụ (xem docs/CAN_BANG.md). Trần 300: bằng ~mức lớn nhất 5% thanh cho tới
    // hết Trúc Cơ (5819 x 5% = 291) nên KHÔNG đổi gì ở Luyện Khí / Trúc Cơ; từ Kim Đan thanh lớn hơn nhiều, trần giữ đan không thành đường tắt
    effect: { kind: "exp", pct: 0.05, maxExp: 300 },
    cooldown: 60_000,
    color: 0xe8c547,
  },
  {
    id: "dai_hoi_huyet_dan",
    name: "Đại Hồi Huyết Đan",
    type: "consumable",
    stack: 20,
    rarity: 2,
    desc: "Hồi 70% khí huyết.",
    effect: { kind: "healHp", pct: 0.7 },
    cooldown: 10_000,
    color: 0xe0554d,
  },
  {
    id: "dai_hoi_linh_dan",
    name: "Đại Hồi Linh Đan",
    type: "consumable",
    stack: 20,
    rarity: 2,
    desc: "Hồi 70% linh lực.",
    effect: { kind: "healMp", pct: 0.7 },
    cooldown: 10_000,
    color: 0x4f8fe6,
  },
  // ---------- Nguyên liệu ----------
  {
    id: "long_tho",
    name: "Lông thỏ",
    type: "material",
    stack: 99,
    rarity: 0,
    desc: "Lông mềm của Linh Thố.",
    color: 0xf4efe2,
  },
  {
    id: "nanh_soi",
    name: "Nanh sói",
    type: "material",
    stack: 99,
    rarity: 0,
    desc: "Nanh sắc của Hôi Lang.",
    color: 0xdcd6c8,
  },
  {
    id: "da_ho",
    name: "Da hổ",
    type: "material",
    stack: 99,
    rarity: 1,
    desc: "Tấm da dày của Hắc Hổ.",
    color: 0x5a4a3a,
  },
  {
    id: "vay_mang",
    name: "Vảy mãng",
    type: "material",
    stack: 99,
    rarity: 2,
    desc: "Vảy đỏ thẫm của Xích Mãng.",
    color: 0xb3262a,
  },
  // Nguyên liệu Kim Đan (M6, #403): mỗi loài một thứ, trùm Hắc Giao rơi Giao Lân
  {
    id: "suong_mao",
    name: "Sương mao",
    type: "material",
    stack: 99,
    rarity: 2,
    desc: "Lông mảnh như sương của Sương Hồ, lạnh và nhẹ.",
    color: 0xcfe3ea,
  },
  {
    id: "quy_giap",
    name: "Quy giáp",
    type: "material",
    stack: 99,
    rarity: 2,
    desc: "Mai cứng của Thạch Quy, phủ rêu xanh.",
    color: 0x6e8060,
  },
  {
    id: "doc_nang",
    name: "Độc nang",
    type: "material",
    stack: 99,
    rarity: 3,
    desc: "Túi độc của Độc Thiềm, chớ làm vỡ.",
    color: 0x7a5fa0,
  },
  {
    id: "giao_lan",
    name: "Giao lân",
    type: "material",
    stack: 99,
    rarity: 3,
    desc: "Vảy đen biếc của Hắc Giao, cứng hơn cả vảy mãng.",
    color: 0x1f3a52,
  },
  // Nguyên liệu Nguyên Anh (M7.5c, #506): mỗi loài ở Hàn Vân Lĩnh một thứ, trùm Thiên Hàn Vương rơi Châu (nguyên liệu vũ khí bộ IV)
  {
    id: "han_lang_mao",
    name: "Hàn Lang mao",
    type: "material",
    stack: 99,
    rarity: 2,
    desc: "Lông sói lạnh buốt, kết sương ngay trong lòng bàn tay.",
    color: 0xbcd8f0,
  },
  {
    id: "phong_nha_vu",
    name: "Phong Nha vũ",
    type: "material",
    stack: 99,
    rarity: 2,
    desc: "Lông chim săn nanh thép, cứng sắc như lưỡi dao mỏng.",
    color: 0xb8bcc8,
  },
  {
    id: "tuong_cot",
    name: "Tượng cốt",
    type: "material",
    stack: 99,
    rarity: 2,
    desc: "Xương voi cổ phủ tuyết, nặng và bền hơn mai rùa đá.",
    color: 0xe0d4b8,
  },
  {
    id: "doc_tuoc_nang",
    name: "Độc tước nang",
    type: "material",
    stack: 99,
    rarity: 2,
    desc: "Túi độc của Độc Tước, tím sẫm, đừng để vỡ trong túi.",
    color: 0x7ab060,
  },
  {
    id: "thien_han_chau",
    name: "Thiên Hàn châu",
    type: "material",
    stack: 99,
    rarity: 4,
    desc: "Viên châu băng kết tinh từ hàn khí của Thiên Hàn Vương, lạnh tới tận linh hồn.",
    color: 0x4a9ed8,
  },
  // Đan cấp 3 (M7.5c): cùng hiệu ứng với đan cấp 2, hồi nhiều hơn (hồi huyết 40 -> 70 -> 90 %); độ hiếm 3 (tiên phẩm, ◆◆◆) để phân biệt với đan cấp 2 (bảo phẩm, ◆◆) trong túi (nit B, M7.9)
  {
    id: "thuong_hoi_huyet_dan",
    name: "Thượng Hồi Huyết Đan",
    type: "consumable",
    stack: 20,
    rarity: 3,
    desc: "Hồi 90% khí huyết.",
    effect: { kind: "healHp", pct: 0.9 },
    cooldown: 12_000,
    color: 0xe8665e,
  },
  {
    id: "thuong_hoi_linh_dan",
    name: "Thượng Hồi Linh Đan",
    type: "consumable",
    stack: 20,
    rarity: 3,
    desc: "Hồi 90% linh lực.",
    effect: { kind: "healMp", pct: 0.9 },
    cooldown: 12_000,
    color: 0x5fa0f0,
  },
  // Đan hộ đạo (nghề nhỏ lát 1, #514/#763): gắn trạng thái `dao_ho` cộng xác suất đột phá, bị gỡ khi thử đột phá.
  // Nguồn nội dung: nhóm đan `dot_pha` (tăng % đột phá) của Vạn Kiếp Tu Tiên, viết lại tên Việt theo thế giới Tiên Giới
  // (docs/NGUON_NOI_DUNG.md mục 3 + CREDITS.md). KHÔNG vào ITEM_VALUE (sellPrice = 0): chốt chặn chống sinh Linh thạch.
  // `ratio` TĂNG theo bậc (0,08 / 0,10 / 0,12) — Dev A chốt (PR #815 comment, 16/11): chi phí một lần thất bại tăng mạnh theo
  // bậc (1,4 phút -> 14 phút -> 1,9 giờ) nên đan đắt nhất phải mạnh nhất; mỗi đan cắt ~41% số lần thất bại. EV: docs/NGHE_NHO_KINH_TE.md.
  {
    id: "dot_pha_dan",
    name: "Đột Phá Đan",
    type: "consumable",
    stack: 9,
    rarity: 2,
    desc: "Cộng 8% xác suất đột phá lần kế. Hiệu lực 15 phút; dùng khi đạt đỉnh Luyện Khí với đầy tu vi. Mất khi thoát, qua cổng hay gục.",
    effect: { kind: "status", id: "dao_ho", ratio: 0.08, ms: 900_000, forRealm: 1 },
    cooldown: 5_000,
    color: 0xd98a3a,
  },
  {
    id: "kinh_chi_dan",
    name: "Kinh Chỉ Đan",
    type: "consumable",
    stack: 9,
    rarity: 3,
    desc: "Cộng 10% xác suất đột phá lần kế. Hiệu lực 15 phút; dùng khi đạt đỉnh Trúc Cơ với đầy tu vi. Mất khi thoát, qua cổng hay gục.",
    effect: { kind: "status", id: "dao_ho", ratio: 0.1, ms: 900_000, forRealm: 2 },
    cooldown: 5_000,
    color: 0xc05a4a,
  },
  {
    id: "duong_anh_dan",
    name: "Dưỡng Anh Đan",
    type: "consumable",
    stack: 9,
    rarity: 3,
    desc: "Cộng 12% xác suất đột phá lần kế. Hiệu lực 15 phút; dùng khi đạt đỉnh Kim Đan với đầy tu vi. Mất khi thoát, qua cổng hay gục.",
    effect: { kind: "status", id: "dao_ho", ratio: 0.12, ms: 900_000, forRealm: 3 },
    cooldown: 5_000,
    color: 0x9a4a8c,
  },
  // ---------- Phù (nghề nhỏ lát 2, #514/#817): Bàn phù chế ----------
  // Dùng gắn trạng thái `amp_<hệ>` tăng sát thương chiêu cùng hệ trong 60 giây (chiêu hệ khác / đòn thường / đòn thách
  // đấu KHÔNG nhân), hoặc `cdr_phu` giảm hồi chiêu. Nguồn: bảng #764 (docs/NGHE_NHO_NGUON.md) — phù tấn công / buff sát
  // thương của Vạn Kiếp Tu Tiên dịch thành `amp_<hệ>`; `cdr_phu` không có phù nguồn nên viết GỐC (tên Tiên Giới).
  // `ratio` theo bậc trong khung (A chốt khi review): LK 0,08-0,10 / TC 0,12-0,15 / KD 0,18-0,22 / NA 0,25-0,30 / cdr <= 0,15.
  // KHÔNG vào ITEM_VALUE (sellPrice = 0): chốt chặn chống sinh Linh thạch. EV: docs/NGHE_NHO_KINH_TE.md mục Phù.
  // Luyện Khí (rarity 1):
  {
    id: "phu_hoa_dan",
    name: "Hỏa Đạn Phù",
    type: "consumable",
    stack: 9,
    rarity: 1,
    desc: "Tăng 8% sát thương chiêu hệ Hỏa trong 60 giây; không tác dụng khi thách đấu; mất khi thoát hay qua cổng.",
    effect: { kind: "status", id: "amp_hoa", ratio: 0.08, ms: 60_000 },
    cooldown: 5_000,
    color: 0xd9532a,
  },
  {
    id: "phu_hoa_cuonghuyet",
    name: "Cuồng Huyết Phù",
    type: "consumable",
    stack: 9,
    rarity: 1,
    desc: "Tăng 10% sát thương chiêu hệ Hỏa trong 60 giây; không tác dụng khi thách đấu; mất khi thoát hay qua cổng.",
    effect: { kind: "status", id: "amp_hoa", ratio: 0.1, ms: 60_000 },
    cooldown: 5_000,
    color: 0xc94030,
  },
  // Trúc Cơ (rarity 2):
  {
    id: "phu_kim_phicham",
    name: "Phi Châm Phù",
    type: "consumable",
    stack: 9,
    rarity: 2,
    desc: "Tăng 12% sát thương chiêu hệ Kim trong 60 giây; không tác dụng khi thách đấu; mất khi thoát hay qua cổng.",
    effect: { kind: "status", id: "amp_kim", ratio: 0.12, ms: 60_000 },
    cooldown: 5_000,
    color: 0xb8b8c8,
  },
  {
    id: "phu_kim_toagia",
    name: "Toái Giáp Phù",
    type: "consumable",
    stack: 9,
    rarity: 2,
    desc: "Tăng 13% sát thương chiêu hệ Kim trong 60 giây; không tác dụng khi thách đấu; mất khi thoát hay qua cổng.",
    effect: { kind: "status", id: "amp_kim", ratio: 0.13, ms: 60_000 },
    cooldown: 5_000,
    color: 0x9a9aa8,
  },
  {
    id: "phu_hoa_lieutiem",
    name: "Liệt Diễm Phù",
    type: "consumable",
    stack: 9,
    rarity: 2,
    desc: "Tăng 15% sát thương chiêu hệ Hỏa trong 60 giây; không tác dụng khi thách đấu; mất khi thoát hay qua cổng.",
    effect: { kind: "status", id: "amp_hoa", ratio: 0.15, ms: 60_000 },
    cooldown: 5_000,
    color: 0xc0392b,
  },
  // Kim Đan (rarity 3):
  {
    id: "phu_loi_loino",
    name: "Lôi Nộ Phù",
    type: "consumable",
    stack: 9,
    rarity: 3,
    desc: "Tăng 20% sát thương chiêu hệ Lôi trong 60 giây; không tác dụng khi thách đấu; mất khi thoát hay qua cổng.",
    effect: { kind: "status", id: "amp_loi", ratio: 0.2, ms: 60_000 },
    cooldown: 5_000,
    color: 0x8a6a2a,
  },
  // Nguyên Anh (rarity 3):
  {
    id: "phu_hoa_tammoi",
    name: "Tam Muội Hỏa Phù",
    type: "consumable",
    stack: 9,
    rarity: 3,
    desc: "Tăng 25% sát thương chiêu hệ Hỏa trong 60 giây; không tác dụng khi thách đấu; mất khi thoát hay qua cổng.",
    effect: { kind: "status", id: "amp_hoa", ratio: 0.25, ms: 60_000 },
    cooldown: 5_000,
    color: 0xe05a1a,
  },
  {
    id: "phu_moc_kimlan",
    name: "Kim Lân Độc Phù",
    type: "consumable",
    stack: 9,
    rarity: 3,
    desc: "Tăng 28% sát thương chiêu hệ Mộc trong 60 giây; không tác dụng khi thách đấu; mất khi thoát hay qua cổng.",
    effect: { kind: "status", id: "amp_moc", ratio: 0.28, ms: 60_000 },
    cooldown: 5_000,
    color: 0x3a8a4a,
  },
  // cdr_phu (giảm hồi chiêu): phù GỐC của Tiên Giới, giữa Trúc Cơ - Kim Đan
  {
    id: "phu_tho_tocphong",
    name: "Tốc Phong Phù",
    type: "consumable",
    stack: 9,
    rarity: 2,
    desc: "Giảm tối đa 15% hồi chiêu của các chiêu thức trong 60 giây; không tác dụng khi thách đấu; mất khi thoát hay qua cổng.",
    effect: { kind: "status", id: "cdr_phu", ratio: 0.15, ms: 60_000 },
    cooldown: 5_000,
    color: 0x5a8ab0,
  },
  // ---------- Trang bị (rèn ở Thợ rèn, xem recipes.ts) ----------
  {
    id: "lang_nha_kiem",
    name: "Lang Nha Kiếm",
    type: "equip",
    stack: 1,
    rarity: 0,
    desc: "Kiếm gỗ cứng khảm nanh sói, nhẹ tay mà sắc.",
    equip: { slot: "weapon", stats: { atk: 4 }, reqRealm: 1, reqTier: 0 },
    color: 0xb8b2a2,
  },
  {
    id: "tho_nhung_bao",
    name: "Thố Nhung Bào",
    type: "equip",
    stack: 1,
    rarity: 0,
    desc: "Áo dệt lông Linh Thố, mềm và ấm.",
    equip: { slot: "robe", stats: { hp: 40 }, reqRealm: 1, reqTier: 0 },
    color: 0xe9e1cf,
  },
  {
    id: "lang_nha_phu",
    name: "Lang Nha Phù",
    type: "equip",
    stack: 1,
    rarity: 0,
    desc: "Bùa xâu nanh sói, mang chút khí nhanh nhẹn của bầy sói.",
    equip: { slot: "talisman", stats: { mp: 20, speed: 6 }, reqRealm: 1, reqTier: 0 },
    color: 0x9c9585,
  },
  {
    id: "hac_ho_kiem",
    name: "Hắc Hổ Kiếm",
    type: "equip",
    stack: 1,
    rarity: 1,
    desc: "Chuôi bọc da Hắc Hổ, mỗi nhát chém mang theo sát khí.",
    equip: { slot: "weapon", stats: { atk: 10 }, reqRealm: 1, reqTier: 6 },
    color: 0x4a3d30,
  },
  {
    id: "hac_ho_bao",
    name: "Hắc Hổ Bào",
    type: "equip",
    stack: 1,
    rarity: 1,
    desc: "Áo da hổ dày, đỡ được móng vuốt yêu thú.",
    equip: { slot: "robe", stats: { hp: 110 }, reqRealm: 1, reqTier: 6 },
    color: 0x3e3328,
  },
  {
    id: "ho_hon_phu",
    name: "Hổ Hồn Phù",
    type: "equip",
    stack: 1,
    rarity: 1,
    desc: "Bùa phong ấn một tia hổ hồn.",
    equip: { slot: "talisman", stats: { mp: 40, speed: 10 }, reqRealm: 1, reqTier: 6 },
    color: 0x6b5a44,
  },
  {
    id: "xich_mang_kiem",
    name: "Xích Mãng Kiếm",
    type: "equip",
    stack: 1,
    rarity: 2,
    desc: "Lưỡi kiếm tôi bằng vảy Xích Mãng, đỏ như than hồng.",
    equip: { slot: "weapon", stats: { atk: 18 }, reqRealm: 2, reqTier: 0 },
    color: 0xc0392b,
  },
  {
    id: "xich_lan_bao",
    name: "Xích Lân Bào",
    type: "equip",
    stack: 1,
    rarity: 2,
    desc: "Áo kết vảy mãng, lửa thường khó xuyên.",
    equip: { slot: "robe", stats: { hp: 200 }, reqRealm: 2, reqTier: 0 },
    color: 0xa32a22,
  },
  {
    id: "mang_dam_phu",
    name: "Mãng Đảm Phù",
    type: "equip",
    stack: 1,
    rarity: 2,
    desc: "Bùa luyện từ vảy mãng, linh lực cuộn chảy không ngừng.",
    equip: { slot: "talisman", stats: { mp: 70, speed: 14 }, reqRealm: 2, reqTier: 0 },
    color: 0xd2553f,
  },
  // Ba bộ Kim Đan (M6, #403): mỗi bộ cộng ~29% chỉ số gốc ở bậc đầu mặc được (như ba bộ trước); rèn ở NPC thợ rèn Vọng Sương (#404)
  {
    id: "suong_vu_kiem",
    name: "Sương Vũ Kiếm",
    type: "equip",
    stack: 1,
    rarity: 3,
    desc: "Kiếm mỏng như làn sương, lạnh buốt nơi lưỡi.",
    equip: { slot: "weapon", stats: { atk: 32 }, reqRealm: 3, reqTier: 0 },
    color: 0xa9cfdc,
  },
  {
    id: "suong_ho_bao",
    name: "Sương Hồ Bào",
    type: "equip",
    stack: 1,
    rarity: 3,
    desc: "Áo dệt lông Sương Hồ, nhẹ như khói.",
    equip: { slot: "robe", stats: { hp: 360 }, reqRealm: 3, reqTier: 0 },
    color: 0xd9e7ec,
  },
  {
    id: "ho_tam_phu",
    name: "Hồ Tâm Phù",
    type: "equip",
    stack: 1,
    rarity: 3,
    desc: "Bùa kết từ sương, bước chân nhẹ như hồ ly.",
    equip: { slot: "talisman", stats: { mp: 110, speed: 18 }, reqRealm: 3, reqTier: 0 },
    color: 0x8fb4c4,
  },
  {
    id: "huyen_quy_kiem",
    name: "Huyền Quy Kiếm",
    type: "equip",
    stack: 1,
    rarity: 3,
    desc: "Kiếm nặng rèn từ mai rùa, chắc tay từng nhát chém.",
    equip: { slot: "weapon", stats: { atk: 38 }, reqRealm: 3, reqTier: 1 },
    color: 0x56674a,
  },
  {
    id: "quy_giap_bao",
    name: "Quy Giáp Bào",
    type: "equip",
    stack: 1,
    rarity: 3,
    desc: "Áo ghép mai Thạch Quy, đỡ đòn như vách đá.",
    equip: { slot: "robe", stats: { hp: 425 }, reqRealm: 3, reqTier: 1 },
    color: 0x49573f,
  },
  {
    id: "quy_tuc_phu",
    name: "Quy Tức Phù",
    type: "equip",
    stack: 1,
    rarity: 3,
    desc: "Bùa mang hơi thở chậm rãi của rùa già.",
    equip: { slot: "talisman", stats: { mp: 125, speed: 22 }, reqRealm: 3, reqTier: 1 },
    color: 0x6e8060,
  },
  {
    id: "hac_giao_kiem",
    name: "Hắc Giao Kiếm",
    type: "equip",
    stack: 1,
    rarity: 4,
    desc: "Kiếm rèn từ vảy Hắc Giao, khí lạnh như nước sâu.",
    equip: { slot: "weapon", stats: { atk: 44 }, reqRealm: 3, reqTier: 2 },
    color: 0x24465f,
  },
  {
    id: "giao_lan_bao",
    name: "Giao Lân Bào",
    type: "equip",
    stack: 1,
    rarity: 4,
    desc: "Áo kết vảy giao, thủy hỏa khó xâm.",
    equip: { slot: "robe", stats: { hp: 500 }, reqRealm: 3, reqTier: 2 },
    color: 0x1d3550,
  },
  {
    id: "giao_long_phu",
    name: "Giao Long Phù",
    type: "equip",
    stack: 1,
    rarity: 4,
    desc: "Bùa luyện tinh huyết giao long.",
    equip: { slot: "talisman", stats: { mp: 140, speed: 26 }, reqRealm: 3, reqTier: 2 },
    color: 0x2e5a7a,
  },
  // Bộ IV, Nguyên Anh sơ kỳ (M7.5c, #506; độ hiếm 4 = thần phẩm, bậc cao nhất, vì độ hiếm không giảm theo bậc cảnh giới): cộng ~29% chỉ số gốc ở bậc đầu mặc được (như các bộ trước: Sương Vũ Kiếm 32 / Sương Hồ Bào 360 / Hồ Tâm Phù 110 x tỉ lệ chỉ số
  // người chơi giữa hai bậc ~1,76 / 1,81 / 1,55); rèn ở thợ rèn Hàn Vân Trạm (`tho_ren_han`). Hài và ngọc bội cùng bộ ở `owner-gear.ts`. Số khởi đầu, M7.9 hiệu chỉnh.
  {
    id: "han_vu_kiem",
    name: "Hàn Vũ Kiếm",
    type: "equip",
    stack: 1,
    rarity: 4,
    desc: "Kiếm tôi bằng Thiên Hàn châu, mỗi nhát chém để lại một vệt sương.",
    equip: { slot: "weapon", stats: { atk: 56 }, reqRealm: 4, reqTier: 0 },
    color: 0x6ab4e8,
  },
  {
    id: "han_lang_bao",
    name: "Hàn Lang Bào",
    type: "equip",
    stack: 1,
    rarity: 4,
    desc: "Áo may bằng lông Hàn Lang và xương voi, gió tuyết khó xuyên.",
    equip: { slot: "robe", stats: { hp: 650 }, reqRealm: 4, reqTier: 0 },
    color: 0x7fa6cc,
  },
  {
    id: "phong_nha_phu",
    name: "Phong Nha Phù",
    type: "equip",
    stack: 1,
    rarity: 4,
    desc: "Bùa cài lông Phong Nha, bước chân nhẹ và sắc như cánh chim.",
    equip: { slot: "talisman", stats: { mp: 170, speed: 28 }, reqRealm: 4, reqTier: 0 },
    color: 0xa8aebd,
  },
  // Đồ cho ba ô riêng của chủ (M7.4): hài, ngọc bội, pháp bảo (`owner-gear.ts`)
  ...OWNER_GEAR_ITEMS,
  // Kinh quyển của 12 chiêu (M7.4): dựng từ `SKILLS_M7` (`books.ts`)
  ...SKILL_BOOK_ITEMS,
];

export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

/** Kẹp tổng một chỉ số phần trăm về [0, trần]; số không hữu hạn coi như 0. */
function capPct(sum: number, cap: number): number {
  return Number.isFinite(sum) ? Math.min(cap, Math.max(0, sum)) : 0;
}

/**
 * Tổng chỉ số cộng thêm từ đồ đang mặc. Bỏ qua id lạ hoặc món mặc sai ô. `crit` / `cdr` / `guard` trả ĐÃ KẸP theo `STAT_CAPS`. Truyền `realm` thì bỏ qua cả ô CHƯA MỞ
 * ở cảnh giới đó (`equipSlotOpen`: file lưu sửa tay đặt pháp bảo ở người chưa tới Kim Đan thì không có tác dụng); bỏ trống `realm` = không xét.
 */
export function equipBonus(
  eq: Partial<Equipment> | undefined,
  realm?: number,
): Required<EquipStats> {
  const out = { atk: 0, hp: 0, mp: 0, speed: 0, crit: 0, cdr: 0, guard: 0 };
  if (!eq) return out;
  for (const slot of EQUIP_SLOTS) {
    const e = ITEM_BY_ID[eq[slot] ?? ""]?.equip;
    if (!e || e.slot !== slot) continue;
    if (realm !== undefined && !equipSlotOpen(slot, realm)) continue;
    out.atk += e.stats.atk ?? 0;
    out.hp += e.stats.hp ?? 0;
    out.mp += e.stats.mp ?? 0;
    out.speed += e.stats.speed ?? 0;
    out.crit += e.stats.crit ?? 0;
    out.cdr += e.stats.cdr ?? 0;
    out.guard += e.stats.guard ?? 0;
  }
  out.crit = capPct(out.crit, STAT_CAPS.crit);
  out.cdr = capPct(out.cdr, STAT_CAPS.cdr);
  out.guard = capPct(out.guard, STAT_CAPS.guard);
  return out;
}

// ---------- Pháp bảo (M7.4, #505) ----------

/** Nội tại của pháp bảo (ô `treasure`, mở từ Kim Đan). Sáu loại khởi đầu; số cuối do M7.9. */
export type TreasureId =
  | "ho_than_an"
  | "hap_linh_chau"
  | "xich_diem_an"
  | "han_bang_an"
  | "dinh_tam_chung"
  | "phong_hanh_boi";

export interface TreasureDef {
  id: TreasureId;
  name: string;
  /** Câu tiếng Việt HOÀN CHỈNH nêu nội tại cùng các con số: client chỉ hiển thị, không tự diễn giải số */
  desc: string;
  /** Số liệu để server thi hành (`systems/treasure.ts`); `desc` nhắc đúng từng số ở đây (test) */
  params: Readonly<Record<string, number>>;
  /** Hệ được tăng sát thương (chỉ pháp bảo kiểu "tăng sát thương một hệ") */
  element?: Element;
}

const pct = (ratio: number) => `${Math.round(ratio * 100)}%`;

const HO_THAN = { intervalS: 10, shieldRatio: 0.15 } as const;
const HAP_LINH = { mpRatio: 0.03 } as const;
const XICH_DIEM = { dmgRatio: 0.15 } as const;
const HAN_BANG = { dmgRatio: 0.15 } as const;
const DINH_TAM = { hpRatioPerS: 0.01, stillS: 1 } as const;
const PHONG_HANH = { speedRatio: 0.1, ms: 4000 } as const;

export const TREASURES: readonly TreasureDef[] = [
  {
    id: "ho_than_an",
    name: "Hộ Thân Ấn",
    params: HO_THAN,
    desc: `Mỗi ${HO_THAN.intervalS} giây tự dựng một lớp khiên bằng ${pct(HO_THAN.shieldRatio)} khí huyết tối đa.`,
  },
  {
    id: "hap_linh_chau",
    name: "Hấp Linh Châu",
    params: HAP_LINH,
    desc: `Mỗi lần hạ một con quái, hồi ${pct(HAP_LINH.mpRatio)} linh lực tối đa.`,
  },
  {
    id: "xich_diem_an",
    name: "Xích Diễm Ấn",
    params: XICH_DIEM,
    element: "hoa",
    desc: `Chiêu hệ Hỏa gây thêm ${pct(XICH_DIEM.dmgRatio)} sát thương.`,
  },
  {
    id: "han_bang_an",
    name: "Hàn Băng Ấn",
    params: HAN_BANG,
    element: "bang",
    desc: `Chiêu hệ Băng gây thêm ${pct(HAN_BANG.dmgRatio)} sát thương.`,
  },
  {
    id: "dinh_tam_chung",
    name: "Định Tâm Chung",
    params: DINH_TAM,
    desc: `Đứng yên từ ${DINH_TAM.stillS} giây trở đi, mỗi giây hồi ${pct(DINH_TAM.hpRatioPerS)} khí huyết tối đa.`,
  },
  {
    id: "phong_hanh_boi",
    name: "Phong Hành Bội",
    params: PHONG_HANH,
    desc: `Sau khi hạ một con quái, tăng ${pct(PHONG_HANH.speedRatio)} tốc độ di chuyển trong ${PHONG_HANH.ms / 1000} giây.`,
  },
];

export const TREASURE_BY_ID: Readonly<Record<string, TreasureDef>> = Object.fromEntries(
  TREASURES.map((t) => [t.id, t]),
);

/** Tra pháp bảo theo id không tin được (tin nhắn client, file lưu): id lạ / độc (kể cả "constructor") -> `undefined`. */
export function treasureOf(id: unknown): TreasureDef | undefined {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(TREASURE_BY_ID, id)
    ? TREASURE_BY_ID[id]
    : undefined;
}

// ---------- Rơi đồ ----------

export interface DropEntry {
  itemId: string;
  /** Xác suất rơi mỗi lần quái chết (0..1), mỗi dòng tung độc lập */
  chance: number;
  min: number;
  max: number;
}

/** Bảng rơi đồ theo id quái (MONSTERS trong game.ts) */
export const DROP_TABLES: Record<string, DropEntry[]> = {
  tho: [
    { itemId: "long_tho", chance: 0.5, min: 1, max: 2 },
    { itemId: "hoi_huyet_dan", chance: 0.08, min: 1, max: 1 },
  ],
  lang: [
    { itemId: "nanh_soi", chance: 0.45, min: 1, max: 2 },
    { itemId: "hoi_huyet_dan", chance: 0.12, min: 1, max: 1 },
    { itemId: "hoi_linh_dan", chance: 0.08, min: 1, max: 1 },
  ],
  ho: [
    { itemId: "da_ho", chance: 0.5, min: 1, max: 1 },
    { itemId: "hoi_huyet_dan", chance: 0.2, min: 1, max: 2 },
    { itemId: "hoi_linh_dan", chance: 0.15, min: 1, max: 2 },
    { itemId: "tu_khi_dan", chance: 0.01, min: 1, max: 1 },
    // Kinh quyển chiêu cơ bản (M7.4): rơi rất hiếm (ngoài việc mua ở cửa hàng)
    { itemId: bookIdOf("hoa_van_kiem"), chance: 0.012, min: 1, max: 1 },
    { itemId: bookIdOf("bon_thach_quyen"), chance: 0.012, min: 1, max: 1 },
    // Kinh quyển Kim / Thổ Trúc Cơ, Huyền phẩm (CT6 lát 1, A): rơi hiếm từ quái Trúc Cơ (không từ trùm: giữ nguyên số Linh thạch / giờ của mục 30)
    { itemId: bookIdOf("thanh_van_kiem_khi"), chance: 0.01, min: 1, max: 1 },
    { itemId: bookIdOf("ban_thach_ho_the"), chance: 0.01, min: 1, max: 1 },
    { itemId: bookIdOf("doc_dang_phuc"), chance: 0.008, min: 1, max: 1 }, // bẫy Mộc (CT9 lát 1)
    // Chiêu Thủy Trúc Cơ (CT7 #1052, E; A chuyển từ trùm Nguyên Anh Thiên Hàn Vương sang quái Trúc Cơ: chiêu rr 2 không thể chỉ rơi từ trùm cao hơn cấp chiêu)
    { itemId: bookIdOf("thi_doc_am_chuong"), chance: 0.005, min: 1, max: 1 },
    // Băng + Âm Trúc Cơ, Huyền phẩm (CT8 lát 1, A): rơi hiếm từ quái Trúc Cơ
    { itemId: bookIdOf("han_bang_nhat_chuong"), chance: 0.0035, min: 1, max: 1 },
    { itemId: bookIdOf("minh_anh_phuc_chuong"), chance: 0.0035, min: 1, max: 1 },
    // Âm Trúc Cơ, Huyền phẩm (lô 1 Âm #1186, E): rơi hiếm từ quái Trúc Cơ (Hắc Hổ `ho` — cổng 15-20 phút giữ bởi `balance/dungeon.test.ts`, sách KHÔNG tính vào mẫu số)
    { itemId: bookIdOf("tich_da_phan_anh"), chance: 0.0035, min: 1, max: 1 },
  ],
  mang: [
    { itemId: "vay_mang", chance: 1, min: 2, max: 4 },
    // 0.6 x 1-2 -> 0.3 x 1 (M6, #403): đan là phần thưởng hiếm, không phải nguồn tu vi chính của người Kim Đan săn Xích Mãng
    { itemId: "tu_khi_dan", chance: 0.3, min: 1, max: 1 },
    { itemId: "hoi_huyet_dan", chance: 1, min: 2, max: 3 },
    // Trùm Trúc Cơ rơi kinh quyển chiêu cao cấp (M7.4): phần thưởng của việc hạ trùm
    { itemId: bookIdOf("thanh_tung_phi_cham"), chance: 0.25, min: 1, max: 1 },
    { itemId: bookIdOf("cuu_cung_khon_sat"), chance: 0.25, min: 1, max: 1 },
    // Kim Trúc Cơ, Huyền phẩm (CT17 lát 1, G): rơi hiếm từ Xích Mãng (trùm Trúc Cơ, giữ nguyên số Linh thạch / giờ mục 30)
    { itemId: bookIdOf("thuc_giap_phi_tan"), chance: 0.01, min: 1, max: 1 },
    // Vô sắc Trúc Cơ, Huyền phẩm (CT8 lát 3, A): rơi từ TRÙM Trúc Cơ (Xích Mãng), KHÔNG từ Hắc Hổ vì bí cảnh đòi thưởng >= 15 phút săn quái tốt nhất cùng bậc (`balance/dungeon.test.ts` đỏ ở 14,86 khi thêm 0,3 % x 2 vào Hắc Hổ)
    { itemId: bookIdOf("su_tu_hong"), chance: 0.006, min: 1, max: 1 },
    { itemId: bookIdOf("cam_long_khau"), chance: 0.006, min: 1, max: 1 },
    // Mộc Trúc Cơ, Huyền phẩm (CT17 lát 2, G): rơi hiếm từ Xích Mãng (trùm Trúc Cơ), KHÔNG từ Hắc Hổ (giữ `balance/dungeon.test.ts`)
    { itemId: bookIdOf("me_hon_huong_quyet"), chance: 0.006, min: 1, max: 1 },
    // Băng + Lôi Trúc Cơ, Huyền phẩm (CT15 đợt 3, D #1185): rơi từ TRÙM Trúc Cơ (Xích Mãng), KHÔNG từ Hắc Hổ (lý do tương tự: giữ `balance/dungeon.test.ts`). Hàn Giao Tiễn (bolt băng) + Lôi Âm (ấn gắn dấu cho cặp dấu+kích)
    { itemId: bookIdOf("giao_can_cung"), chance: 0.006, min: 1, max: 1 },
    { itemId: bookIdOf("loi_am_an"), chance: 0.006, min: 1, max: 1 },
    // Lôi Trúc Cơ, Huyền phẩm (CT15 đợt 2, D #1185): rơi từ TRÙM Trúc Cơ (Xích Mãng), KHÔNG từ Hắc Hổ — Hắc Hổ là con săn Linh thạch/phút cao nhất cùng bậc, thêm sách vào nó đẩy denominator của `balance/dungeon.test.ts` lên làm bí cảnh Linh Hư < 15 phút (đỏ ở 14,90)
    { itemId: bookIdOf("loi_hoa_pha_ta_chuong"), chance: 0.006, min: 1, max: 1 },
    // Thủy Trúc Cơ, Huyền phẩm (CT15 đợt 2 slice THỦY, D #1185): rơi từ TRÙM Trúc Cơ (Xích Mãng), KHÔNG từ Hắc Hổ (lý do tương tự Lôi ở trên)
    { itemId: bookIdOf("thai_hoa_bo_nguyen"), chance: 0.006, min: 1, max: 1 },
    // Độc Mộc Trúc Cơ, Huyền phẩm (A, #1187 / book-drop-realm): hai sách trước đây CHỈ rơi từ Độc Tước (Nguyên Anh, cao hơn cấp chiêu hai bậc); Xích Mãng là trùm Trúc Cơ, hợp chủ đề rắn / độc, và KHÔNG phải Hắc Hổ (giữ `balance/dungeon.test.ts`)
    { itemId: bookIdOf("hac_sa_doc_chuong"), chance: 0.006, min: 1, max: 1 },
    { itemId: bookIdOf("thiem_to_cong"), chance: 0.006, min: 1, max: 1 },
    // Hỏa Trúc Cơ, Huyền phẩm (lô 2 Hỏa #1186, E; A #1424: dời từ Yêu Vương — trùm bí cảnh 3-4 người, 0,5 % ≈ 200 lượt mới ra, thực tế không ai kiếm được — sang Xích Mãng trùm Trúc Cơ 0,6 % như các rr2 Trúc Cơ khác): rơi hiếm từ Xích Mãng (trùm Trúc Cơ, hợp chủ đề ma trảo máu), KHÔNG từ Hắc Hổ (giữ balance/dungeon.test.ts)
    { itemId: bookIdOf("ma_trao_phe_huyet"), chance: 0.006, min: 1, max: 1 },
  ],
  // Thanh Xà: trùm CẦM ĐƯỜNG Lạc Hà bậc Luyện Khí (CD5 #1065). Ambush-only, thưởng chính là payRewards của cảnh chặn đường; rơi phụ đan thường khi hạ
  thanh_xa: [
    { itemId: "hoi_huyet_dan", chance: 1, min: 1, max: 2 },
    { itemId: "tu_khi_dan", chance: 0.3, min: 1, max: 1 },
  ],
  // Quái Kim Đan (M6, #403; số đo ở docs/CAN_BANG.md): mỗi loài rơi nguyên liệu của mình + chút đan
  suong_ho: [
    { itemId: "suong_mao", chance: 0.5, min: 1, max: 2 },
    { itemId: "hoi_huyet_dan", chance: 0.1, min: 1, max: 1 },
    { itemId: "dai_hoi_huyet_dan", chance: 0.04, min: 1, max: 1 },
    { itemId: bookIdOf("lac_tuyet_phan_phi"), chance: 0.02, min: 1, max: 1 }, // kinh quyển hiếm (M7.4)
    { itemId: bookIdOf("thu_thuy_kiem_anh"), chance: 0.012, min: 1, max: 1 }, // Kim + Thủy (CT6 lát 1)
    { itemId: bookIdOf("phi_kiem_tam_lien"), chance: 0.008, min: 1, max: 1 }, // đạn bay Kim (CT9 lát 1)
    { itemId: bookIdOf("hoi_phong_lien_chuong"), chance: 0.005, min: 1, max: 1 }, // Phong Kim Đan (CT8 lát 1)
    // Âm Kim Đan, Huyền phẩm (lô 1 Âm #1186, E): rơi hiếm từ quái Kim Đan
    { itemId: bookIdOf("thuc_phat_am_trao"), chance: 0.005, min: 1, max: 1 },
    // Thủy Kim Đan, Huyền phẩm (CT15 đợt 2 slice THỦY, D #1185): rơi hiếm từ Sương Hồ (quái Kim Đan hệ băng, hợp thủy)
    { itemId: bookIdOf("huyet_co_bi_kinh"), chance: 0.006, min: 1, max: 1 },
    { itemId: bookIdOf("toa_long_cam_na"), chance: 0.006, min: 1, max: 1 },
    // Băng + Lôi Kim Đan, Huyền phẩm (CT15 đợt 3, D #1185): rơi hiếm từ Sương Hồ (quái Kim Đan hệ băng/thủy). Hàn Sương Phong Mạch (trap xích băng) + Tử Điện Xuyên Vân (bolt kích dấu Lôi)
    { itemId: bookIdOf("han_suong_toa"), chance: 0.006, min: 1, max: 1 },
    { itemId: bookIdOf("tu_dien_thoa"), chance: 0.006, min: 1, max: 1 },
  ],
  thach_quy: [
    { itemId: "quy_giap", chance: 0.5, min: 1, max: 2 },
    { itemId: "hoi_linh_dan", chance: 0.1, min: 1, max: 1 },
    { itemId: "dai_hoi_linh_dan", chance: 0.04, min: 1, max: 1 },
    { itemId: bookIdOf("cuu_cung_khon_sat"), chance: 0.02, min: 1, max: 1 }, // kinh quyển hiếm (M7.4)
    { itemId: bookIdOf("liet_dia_nhat_quyen"), chance: 0.012, min: 1, max: 1 }, // Thổ (CT6 lát 1)
    { itemId: bookIdOf("phan_nhac_tram"), chance: 0.012, min: 1, max: 1 },
    { itemId: bookIdOf("loi_lien_chau"), chance: 0.008, min: 1, max: 1 }, // sét lan Lôi (CT9 lát 1)
    { itemId: bookIdOf("loi_dinh_nhat_miet"), chance: 0.005, min: 1, max: 1 }, // Lôi Kim Đan (CT8 lát 1)
    // Hỏa + Phong Kim Đan, Huyền phẩm (lô 2 #1186, E): rơi hiếm từ Thạch Quy (quái Kim Đan); giữ số Linh thạch / giờ mục 30
    { itemId: bookIdOf("phat_hoa_hang_ma"), chance: 0.005, min: 1, max: 1 },
    { itemId: bookIdOf("am_phong_quyen_hon"), chance: 0.005, min: 1, max: 1 },
  ],
  doc_thiem: [
    { itemId: "doc_nang", chance: 0.45, min: 1, max: 2 },
    { itemId: "dai_hoi_huyet_dan", chance: 0.06, min: 1, max: 1 },
    { itemId: "dai_hoi_linh_dan", chance: 0.06, min: 1, max: 1 },
    { itemId: bookIdOf("me_tung_bo"), chance: 0.02, min: 1, max: 1 }, // kinh quyển hiếm (M7.4)
    { itemId: bookIdOf("thanh_tung_phi_cham"), chance: 0.02, min: 1, max: 1 },
    { itemId: bookIdOf("liet_diem_tran"), chance: 0.008, min: 1, max: 1 }, // vùng cháy Hỏa (CT9 lát 1)
    { itemId: bookIdOf("xich_tuoc_phu"), chance: 0.005, min: 1, max: 1 }, // phù Hỏa Kim Đan (CT8 lát 1)
    { itemId: bookIdOf("hoa_huyet_phe_nguyen"), chance: 0.005, min: 1, max: 1 }, // vô sắc Kim Đan (CT8 lát 3)
    // Vô sắc Kim Đan (`reqRealm` 3), Huyền phẩm (CT17 lát 3, G; nguồn rơi chuyển từ Xích Mãng sang Độc Thiềm vì Xích Mãng là trùm TRÚC CƠ, `book-drop-realm.test.ts`): rơi hiếm
    { itemId: bookIdOf("huyet_trao_pha_mach"), chance: 0.006, min: 1, max: 1 },
  ],
  // Trùm Kim Đan: bãi của đội 3-4 người; Giao Lân là nguyên liệu bộ III
  hac_giao: [
    { itemId: "giao_lan", chance: 1, min: 2, max: 4 },
    { itemId: "doc_nang", chance: 0.8, min: 1, max: 2 },
    { itemId: "dai_hoi_huyet_dan", chance: 1, min: 1, max: 2 },
    { itemId: "tu_khi_dan", chance: 0.5, min: 1, max: 1 },
  ],
  // Quái Nguyên Anh (M7.5b / M7.5c; số đo ở docs/CAN_BANG.md): mỗi loài rơi nguyên liệu của mình + chút đan cấp 3 và kinh quyển hiếm
  han_lang: [
    { itemId: "han_lang_mao", chance: 0.5, min: 1, max: 2 },
    { itemId: "dai_hoi_huyet_dan", chance: 0.08, min: 1, max: 1 },
    { itemId: "thuong_hoi_huyet_dan", chance: 0.03, min: 1, max: 1 },
    { itemId: bookIdOf("lac_tuyet_phan_phi"), chance: 0.02, min: 1, max: 1 },
    // Kinh quyển 6 chiêu Nguyên Anh đợt 2 (M7.9, #654): rơi hiếm
    { itemId: bookIdOf("han_quang_tien"), chance: 0.02, min: 1, max: 1 },
    { itemId: bookIdOf("bach_kim_trao"), chance: 0.015, min: 1, max: 1 },
    { itemId: bookIdOf("hon_phien_tuong"), chance: 0.006, min: 1, max: 1 }, // tượng Âm (CT9 lát 1)
    { itemId: bookIdOf("minh_vu_lac_hon"), chance: 0.006, min: 1, max: 1 }, // quạt Âm Nguyên Anh (CT8 lát 2)
    // Âm Nguyên Anh, Địa phẩm (lô 1 Âm #1186, E): rơi hiếm từ quái Nguyên Anh
    { itemId: bookIdOf("kho_mach_dan_luu"), chance: 0.005, min: 1, max: 1 },
    // Thủy Nguyên Anh, Địa phẩm (CT15 đợt 2 slice THỦY, D #1185): rơi hiếm từ Hàn Lang (quái Nguyên Anh hệ thủy, hợp thủy)
    { itemId: bookIdOf("huyet_ti_phuoc_than"), chance: 0.006, min: 1, max: 1 },
    { itemId: bookIdOf("no_dao_bai_khong"), chance: 0.006, min: 1, max: 1 },
    // Băng Nguyên Anh, Địa phẩm (CT15 đợt 3, D #1185): rơi hiếm từ Hàn Lang (quái Nguyên Anh hệ băng, hợp băng). Băng Phách Xuyên Tâm (bolt kim băng)
    { itemId: bookIdOf("bang_phach_than_cham"), chance: 0.006, min: 1, max: 1 },
  ],
  phong_nha: [
    { itemId: "phong_nha_vu", chance: 0.5, min: 1, max: 2 },
    { itemId: "dai_hoi_linh_dan", chance: 0.08, min: 1, max: 1 },
    { itemId: "thuong_hoi_linh_dan", chance: 0.03, min: 1, max: 1 },
    { itemId: bookIdOf("thanh_tung_phi_cham"), chance: 0.02, min: 1, max: 1 },
    { itemId: bookIdOf("bang_hoa_loan"), chance: 0.02, min: 1, max: 1 },
    { itemId: bookIdOf("han_quang_tien"), chance: 0.012, min: 1, max: 1 },
    { itemId: bookIdOf("van_kiem_quy_tong"), chance: 0.008, min: 1, max: 1 }, // Kim, Địa phẩm (CT6 lát 1)
    // Thổ Nguyên Anh, Địa phẩm (CT17 lát 1, G): rơi hiếm từ Phong Nha. Đặt ở bậc Trung/Hậu kỳ (nguồn tu vi của hai bậc này) để thu nhập
    // bán sách nâng hai bậc, giữ đường thu nhập Nguyên Anh không tụt quá 5% giữa các bậc; đặt ở Cốt Tượng (nguồn Sơ kỳ) sẽ đẩy tier[0] vượt ngưỡng.
    { itemId: bookIdOf("chuong_vu_phong_lam"), chance: 0.008, min: 1, max: 1 },
    { itemId: bookIdOf("thien_la_loi_cam"), chance: 0.006, min: 1, max: 1 }, // Lôi gắn dấu, Địa phẩm (CT8 lát 2)
    { itemId: bookIdOf("chuong_tam_loi_bao"), chance: 0.006, min: 1, max: 1 }, // Lôi kích dấu (CT8 lát 2)
    { itemId: bookIdOf("bach_thu_khieu_phong"), chance: 0.006, min: 1, max: 1 }, // Phong tăng tốc đồng đội (CT8 lát 2)
    // Mộc Nguyên Anh, Địa phẩm (CT17 lát 2, G): rơi hiếm từ Phong Nha (giữ thu nhập Nguyên Anh như CT17 lát 1)
    { itemId: bookIdOf("man_da_hoa_kinh"), chance: 0.008, min: 1, max: 1 },
    // Lôi Nguyên Anh gắn dấu (CT15 đợt 2, D #1185): rơi hiếm từ Phong Nha (quái Nguyên Anh), giữ số Linh thạch / giờ mục 30
    { itemId: bookIdOf("chan_hon_loi_phap"), chance: 0.006, min: 1, max: 1 },
    // Vô sắc Nguyên Anh, Địa phẩm (CT17 lát 3, G): rơi hiếm từ Phong Nha (quái Nguyên Anh), giữ thu nhập Nguyên Anh như các lát trước
    { itemId: bookIdOf("bach_cot_hong_nhan"), chance: 0.006, min: 1, max: 1 },
    // Hỏa Nguyên Anh, Địa phẩm (lô 2 Hỏa #1186, E): rơi hiếm từ Phong Nha (quái Nguyên Anh); giữ số Linh thạch / giờ mục 30
    { itemId: bookIdOf("huyet_mang_pha_giap"), chance: 0.005, min: 1, max: 1 },
  ],
  cot_tuong: [
    { itemId: "tuong_cot", chance: 0.5, min: 1, max: 2 },
    { itemId: "dai_hoi_linh_dan", chance: 0.1, min: 1, max: 1 },
    { itemId: "thuong_hoi_huyet_dan", chance: 0.04, min: 1, max: 1 },
    { itemId: bookIdOf("cuu_cung_khon_sat"), chance: 0.02, min: 1, max: 1 },
    { itemId: bookIdOf("van_thach_tran"), chance: 0.02, min: 1, max: 1 },
    { itemId: bookIdOf("van_hanh_bo"), chance: 0.015, min: 1, max: 1 },
    { itemId: bookIdOf("pha_son_nhat_kich"), chance: 0.006, min: 1, max: 1 }, // chiêu vận Thổ (CT9 lát 1)
    { itemId: bookIdOf("long_tuong_ho_the"), chance: 0.006, min: 1, max: 1 }, // vô sắc hộ thể Nguyên Anh (CT8 lát 3)
  ],
  doc_tuoc: [
    { itemId: "doc_tuoc_nang", chance: 0.45, min: 1, max: 2 },
    { itemId: "thuong_hoi_huyet_dan", chance: 0.05, min: 1, max: 1 },
    { itemId: "thuong_hoi_linh_dan", chance: 0.05, min: 1, max: 1 },
    { itemId: bookIdOf("me_tung_bo"), chance: 0.02, min: 1, max: 1 },
    { itemId: bookIdOf("liet_hoa_kiem"), chance: 0.018, min: 1, max: 1 },
    { itemId: bookIdOf("van_hanh_bo"), chance: 0.012, min: 1, max: 1 },
    // Kinh quyển 4 chiêu hệ Mộc cao cấp (CT7 #1052, Dev E; A hạ 2 % -> 1,2 % theo mức 0,6-1,2 % của AGENTS.md): rơi hiếm từ Độc Tước (quái Mộc)
    { itemId: bookIdOf("hac_sa_doc_chuong"), chance: 0.012, min: 1, max: 1 },
    { itemId: bookIdOf("thiem_to_cong"), chance: 0.012, min: 1, max: 1 },
    { itemId: bookIdOf("doan_truong_chi_phap"), chance: 0.012, min: 1, max: 1 },
    { itemId: bookIdOf("kho_moc_phung_xuan_quyet"), chance: 0.012, min: 1, max: 1 },
    { itemId: bookIdOf("phuong_minh_cau_hoang"), chance: 0.006, min: 1, max: 1 }, // Hỏa khống chế Nguyên Anh (CT8 lát 2)
    // Vô sắc Nguyên Anh, Địa phẩm (CT17 lát 3, G): rơi hiếm từ Độc Tước (quái Nguyên Anh), giữ thu nhập Nguyên Anh như các lát trước
    { itemId: bookIdOf("niep_hon_doat_phat"), chance: 0.006, min: 1, max: 1 },
  ],
  // Trùm Nguyên Anh: bãi của đội 3-4 người; Thiên Hàn châu là nguyên liệu vũ khí bộ IV
  thien_han_vuong: [
    { itemId: "thien_han_chau", chance: 1, min: 2, max: 4 },
    { itemId: "doc_tuoc_nang", chance: 0.8, min: 1, max: 2 },
    { itemId: "thuong_hoi_huyet_dan", chance: 1, min: 1, max: 2 },
    { itemId: "thuong_hoi_linh_dan", chance: 1, min: 1, max: 2 },
    { itemId: "tu_khi_dan", chance: 0.6, min: 1, max: 2 },
    // Trùm rơi kinh quyển chiêu cao cấp nhất (M7.9, #654): Liệt Hỏa Kiếm, hiếm nhưng là phần thưởng hạ trùm
    { itemId: bookIdOf("liet_hoa_kiem"), chance: 0.25, min: 1, max: 1 },
  ],
  // Quái Hóa Thần của Lang Hoang (D1 #1466 lát A1): CHƯA sinh ngoài hoang. Bảng TẠM chỉ dùng đan có sẵn (đủ để mọi quái có bảng rơi và có kỳ vọng đồ bán được > 0); lát A2 thay bằng
  // nguyên liệu Hóa Thần riêng (`docs/QUAI_HOA_THAN_DE_XUAT.md` mục 5.1) + bộ V, lát C thêm sách chiêu `reqRealm` 5.
  da_lang: [
    { itemId: "thuong_hoi_huyet_dan", chance: 0.06, min: 1, max: 1 },
    { itemId: "thuong_hoi_linh_dan", chance: 0.05, min: 1, max: 1 },
  ],
  hac_phong_lang: [
    { itemId: "thuong_hoi_huyet_dan", chance: 0.06, min: 1, max: 1 },
    { itemId: "thuong_hoi_linh_dan", chance: 0.06, min: 1, max: 1 },
  ],
  huyet_nguyet_lang: [
    { itemId: "thuong_hoi_huyet_dan", chance: 0.07, min: 1, max: 1 },
    { itemId: "thuong_hoi_linh_dan", chance: 0.05, min: 1, max: 1 },
  ],
  xich_diem_lang: [
    { itemId: "thuong_hoi_huyet_dan", chance: 0.08, min: 1, max: 1 },
    { itemId: "thuong_hoi_linh_dan", chance: 0.06, min: 1, max: 1 },
  ],
  thuong_nguyet_lang: [
    { itemId: "thuong_hoi_huyet_dan", chance: 0.1, min: 1, max: 1 },
    { itemId: "thuong_hoi_linh_dan", chance: 0.08, min: 1, max: 1 },
  ],
  ngan_nguyet_lang: [
    { itemId: "thuong_hoi_huyet_dan", chance: 0.1, min: 1, max: 1 },
    { itemId: "thuong_hoi_linh_dan", chance: 0.08, min: 1, max: 1 },
  ],
  // Trùm bí cảnh (docs/THIET_KE_BI_CANH.md): đồ rơi như quái thường (chủ đồ theo đội); thưởng hoàn thành riêng ở `DUNGEONS`.
  // Đã tính vào cân bằng 4c-2 (`server/src/balance/dungeon.ts`).
  yeu_vuong: [
    { itemId: "vay_mang", chance: 1, min: 3, max: 5 },
    { itemId: "tu_khi_dan", chance: 0.8, min: 2, max: 3 },
    { itemId: "hoi_huyet_dan", chance: 1, min: 3, max: 4 },
    { itemId: bookIdOf("lac_tuyet_phan_phi"), chance: 0.3, min: 1, max: 1 }, // trùm bí cảnh rơi kinh quyển cao cấp (M7.4)
  ],
};

/**
 * Tung bảng rơi đồ. rng trả về số trong [0, 1) (truyền vào để test được).
 * `chanceMult` (M8, buff tông môn, `sectBuffOf(...).drop`) nhân cơ hội rơi của MỖI món (cơ hội >= 1 thì luôn rơi): mặc định 1 = không đổi gì; giá trị không hợp lệ
 * (không phải số hữu hạn, nhỏ hơn 1) coi là 1; kẹp tối đa 2 (buff thật không bao giờ vượt `SECT_BUFF_DROP_MAX`). Với `chanceMult` = 1 kết quả và số lần gọi `rng`
 * y hệt trước M8 (bench có seed không lệch quỹ đạo).
 */
export function rollDrops(
  monsterKind: string,
  rng: () => number = Math.random,
  chanceMult = 1,
): { itemId: string; qty: number }[] {
  const out: { itemId: string; qty: number }[] = [];
  const mult = Number.isFinite(chanceMult) && chanceMult > 1 ? Math.min(chanceMult, 2) : 1;
  for (const e of DROP_TABLES[monsterKind] ?? []) {
    if (rng() >= e.chance * mult) continue; // rng < 1 nên cơ hội >= 1 luôn rơi (không cần kẹp)
    const qty = e.min + Math.floor(rng() * (e.max - e.min + 1));
    out.push({ itemId: e.itemId, qty: Math.min(qty, e.max) });
  }
  return out;
}

// ---------- Túi đồ ----------

export const INVENTORY_SLOTS = 24;
/** Khoảng cách tối đa để nhặt đồ (px) */
export const PICKUP_RANGE = 48;
/** Trong khoảng này chỉ người được chia đồ nhặt được; sau đó server đặt owner = "" (ai cũng nhặt được) */
export const LOOT_OWNER_MS = 30_000;
/** Đồ rơi nằm trên đất bao lâu thì biến mất */
export const LOOT_DESPAWN_MS = 90_000;

export interface InvSlot {
  itemId: string;
  qty: number;
}
/** Túi đồ: mảng INVENTORY_SLOTS phần tử, ô trống là null */
export type Inventory = (InvSlot | null)[];

export function emptyInventory(): Inventory {
  return Array.from({ length: INVENTORY_SLOTS }, () => null);
}

/**
 * Cho qty vật phẩm vào túi (sửa trực tiếp slots): cộng dồn vào ô cùng loại trước, rồi tới ô trống.
 * Trả về số còn thừa không cho vào được (0 = vào hết).
 */
export function addToInventory(slots: Inventory, itemId: string, qty: number): number {
  const def = ITEM_BY_ID[itemId];
  if (!def || !(qty > 0)) return Math.max(0, qty || 0);
  let left = Math.floor(qty);
  for (const s of slots) {
    if (left === 0) break;
    if (s && s.itemId === itemId && s.qty < def.stack) {
      const n = Math.min(left, def.stack - s.qty);
      s.qty += n;
      left -= n;
    }
  }
  for (let i = 0; i < slots.length && left > 0; i++) {
    if (slots[i] === null) {
      const n = Math.min(left, def.stack);
      slots[i] = { itemId, qty: n };
      left -= n;
    }
  }
  return left;
}

// ---------- Đồ rơi trong state chung ----------

/**
 * Hình dạng một món đồ rơi trong state.loot (MapSchema, key = lootId).
 * Class schema thật nằm ở server/src/schema.ts; client đọc theo kiểu này.
 */
export interface LootView {
  itemId: string;
  qty: number;
  x: number;
  y: number;
  /** sessionId của người được nhặt trước; "" = ai cũng nhặt được */
  owner: string;
}

// ---------- Tin nhắn client -> server ----------
export interface UseItemMsg {
  slot: number;
}
export interface PickupMsg {
  lootId: string;
}
/** Vứt qty món ở ô slot xuống đất (qty bỏ trống = cả ô) */
export interface DropItemMsg {
  slot: number;
  qty?: number;
}

// ---------- Tin nhắn server -> client (chỉ gửi cho chủ túi) ----------
export interface InvMsg {
  slots: Inventory;
  /** Thời gian hồi chiêu còn lại (ms) theo itemId, chỉ có món đang hồi */
  cd: Record<string, number>;
  /** Vừa nhận thêm (để hiện "+1 Nanh sói"); không có khi chỉ đồng bộ lại */
  gained?: InvSlot[];
}
