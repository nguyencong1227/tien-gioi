// Chiêu thức học được, hệ (ngũ hành), trạng thái, sổ chiêu của nhân vật (M7.1, issue #502, docs/PHAN_CONG_M7.md mục 5).
// HỢP ĐỒNG giữa client và server: dữ liệu THUẦN + hàm kiểm dùng chung (client hiển thị đúng số server tính). Server quyết định
// mọi kết quả (học, gắn ô, hồi chiêu, linh lực, sát thương, trạng thái); client chỉ gửi ý định (`CastMsg`, `SkillSlotMsg`).
//
// NGUỒN NỘI DUNG (QUYET_DINH_M3 mục 19-20, docs/NGUON_NOI_DUNG.md): tên và mô tả công pháp / chiêu LẤY NGUYÊN VĂN từ game
// "Vạn Kiếp Tu Tiên" (tác giả Hải Quân · Bắc Team; người phát triển đã cho phép, người dùng xác nhận 14/11/2026), bản sao
// chỉ đọc `~/TT/van-kiep-tu-tien-clone/site/assets/content-ClG6Ha-i.json`. Nguồn là trò chơi THEO LƯỢT: cơ chế đã dịch sang thời gian
// thực (1 lượt = `TURN_MS`; `phi` -> `mpPct`; `hoi` -> hồi chiêu; `uy` -> `mult`; `dang` -> hình / loại), SỐ ĐỀU LÀ SỐ KHỞI ĐIỂM
// do Dev A đặt, M7.9 (#510) mô phỏng rồi chỉnh. Ánh xạ nguồn -> id (khoá trong `/content/items/cong_phap/<tệp>.yaml`):
//   hoa_van_kiem        <- he_hoa:    item.hoa_van_kiem_phap        (chiêu "Hỏa Vân Kiếm")
//   bon_thach_quyen     <- pho_thong: item.bon_thach_quyen          (chiêu "Bôn Thạch Quyền")
//   ung_trao            <- pho_thong: item.ung_trao_cong            (chiêu "Ưng Trảo")
//   trong_nhac_tram     <- he_tho:    item.trong_nhac_kiem_phap     (chiêu "Trọng Nhạc Trảm")
//   huyen_bang_chi      <- pho_thong: item.huyen_bang_chi           (chiêu "Huyền Băng Chỉ")
//   kim_chung_trao      <- chung:     item.kim_chung_trao           (chiêu "Kim Chung Tráo")
//   bich_thuy_hoi_xuan  <- chung:     item.bich_thuy_hoi_xuan       (chiêu "Hồi Xuân", công pháp "Bích Thủy Hồi Xuân Thuật")
//   phieu_phong_bo      <- pho_thong: item.phieu_phong_bo           (chiêu "Phiêu Phong Bộ")
//   thanh_tung_phi_cham <- he_moc:    item.thanh_tung_cham_quyet    (chiêu "Thanh Tùng Phi Châm")
//   lac_tuyet_phan_phi  <- he_thuy:   item.lac_tuyet_kiem_quyet     (chiêu "Lạc Tuyết Phân Phi")
//   cuu_cung_khon_sat   <- he_tho:    item.cuu_cung_tran_quyet      (chiêu "Cửu Cung Khốn Sát")
//   me_tung_bo          <- pho_thong: item.me_tung_bo               (chiêu "Mê Tung Bộ")
// `desc` là `mo_ta` của công pháp trong nguồn (sẽ là mô tả của Kinh quyển ở M7.4). `canh_gioi` n của nguồn -> `reqRealm` n + 1
// (nguồn tính Luyện Khí là 0; Tiên Giới tính Phàm Nhân là 0). Phẩm cấp của nguồn (1-8) -> `Rarity` 0-4: 1 -> 0, 2 -> 1, 3 -> 2.

// ---------------------------------------------------------------------------------------------------------------
// Hệ (ngũ hành)
// ---------------------------------------------------------------------------------------------------------------

import { STAT_CAPS } from "./stat-caps";
import {
  MASTERY_NEED,
  SKILL_TIER_MAX,
  TURN_MS,
  skillEffect,
  skillMaxLevelOf,
  type SkillGrade,
  type SkillStyle,
} from "./skill-kit";
import { SKILLS_KIM_THO } from "./skills-kim-tho";
import { SKILLS_MOC_THUY } from "./skills-moc-thuy";
import { SKILLS_HOA } from "./skills-hoa";
import { SKILLS_KHAC } from "./skills-khac";
import { SKILLS_DANG_MOI } from "./skills-dang-moi";
import { SKILLS_HOA_THAN } from "./skills-hoa-than";

/** Pha ngũ hành dùng để tính khắc: kim, mộc, thủy, hỏa, thổ; `none` = vô sắc (không khắc, không bị khắc). */
export type Phase = "kim" | "moc" | "thuy" | "hoa" | "tho" | "none";

/** Hệ ghi trên chiêu / quái (nhãn hiển thị và nguồn); mỗi hệ thuộc MỘT pha ngũ hành. */
export type Element =
  "kim" | "moc" | "thuy" | "hoa" | "tho" | "bang" | "phong" | "loi" | "am" | "none";

export interface ElementDef {
  id: Element;
  name: string;
  phase: Phase;
}

/**
 * Nguồn có mười hệ (ngũ hành + băng, phong, lôi, âm, vô sắc). Chỉ năm pha có tương khắc: băng và âm thuộc thủy, phong thuộc mộc,
 * lôi thuộc hỏa (quy ước của Tiên Giới, ghi ở `docs/NGUON_NOI_DUNG.md`).
 */
export const ELEMENTS: readonly ElementDef[] = [
  { id: "kim", name: "Kim", phase: "kim" },
  { id: "moc", name: "Mộc", phase: "moc" },
  { id: "thuy", name: "Thủy", phase: "thuy" },
  { id: "hoa", name: "Hỏa", phase: "hoa" },
  { id: "tho", name: "Thổ", phase: "tho" },
  { id: "bang", name: "Băng", phase: "thuy" },
  { id: "phong", name: "Phong", phase: "moc" },
  { id: "loi", name: "Lôi", phase: "hoa" },
  { id: "am", name: "Âm", phase: "thuy" },
  { id: "none", name: "Vô sắc", phase: "none" },
];

export const ELEMENT_BY_ID: Readonly<Record<string, ElementDef>> = Object.fromEntries(
  ELEMENTS.map((e) => [e.id, e]),
);

/** Tra hệ theo id không tin được (file lưu, dữ liệu ngoài): id lạ / độc (`constructor`, `__proto__`) -> `undefined`. */
export function elementOf(id: unknown): ElementDef | undefined {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(ELEMENT_BY_ID, id)
    ? ELEMENT_BY_ID[id]
    : undefined;
}

/** Pha ngũ hành của một hệ; id lạ -> `none`. */
export function phaseOf(id: unknown): Phase {
  return elementOf(id)?.phase ?? "none";
}

/** Tương khắc: khoá khắc giá trị (kim khắc mộc, mộc khắc thổ, thổ khắc thủy, thủy khắc hỏa, hỏa khắc kim). */
export const PHASE_BEATS: Readonly<Record<Exclude<Phase, "none">, Exclude<Phase, "none">>> = {
  kim: "moc",
  moc: "tho",
  tho: "thuy",
  thuy: "hoa",
  hoa: "kim",
};

export const ELEMENT_ADVANTAGE_MULT = 1.3;
export const ELEMENT_DISADVANTAGE_MULT = 0.8;

/**
 * Hệ số sát thương của chiêu hệ `attacker` lên quái hệ `defender`: khắc x1,3, bị khắc x0,8, còn lại x1. MỘT hàm duy nhất cho client
 * (hiện "khắc / bị khắc") và server (tính). Đòn của quái lên người chơi KHÔNG tính hệ ở M7 (kế hoạch mục 5.2).
 */
export function elementMult(attacker: unknown, defender: unknown): number {
  const a = phaseOf(attacker);
  const d = phaseOf(defender);
  if (a === "none" || d === "none") return 1;
  if (PHASE_BEATS[a] === d) return ELEMENT_ADVANTAGE_MULT;
  if (PHASE_BEATS[d] === a) return ELEMENT_DISADVANTAGE_MULT;
  return 1;
}

// ---------------------------------------------------------------------------------------------------------------
// Trạng thái
// ---------------------------------------------------------------------------------------------------------------

/** Hệ có phù tăng sát thương (`amp_<hệ>`): chín hệ có tên, KHÔNG gồm `none` (chiêu vô sắc không có phù riêng). */
export type AmpElement = Exclude<Element, "none">;
export const AMP_ELEMENTS: readonly AmpElement[] = [
  "kim",
  "moc",
  "thuy",
  "hoa",
  "tho",
  "bang",
  "phong",
  "loi",
  "am",
];

export type StatusId =
  | "burn"
  | "poison"
  | "bleed"
  | "chill"
  | "sunder"
  | "stun"
  | "shield"
  | "haste"
  | "regen"
  | "dao_ho"
  // Nghề nhỏ lát 2 (#514, phù): tăng sát thương chiêu của một hệ, giảm hồi chiêu
  | `amp_${AmpElement}`
  | "cdr_phu"
  // Đợt thêm chiêu (mục 51, CT1b): tự tăng sát thương, "suy" (quái yếu đi), DẤU hệ (combo), vận khí (chiêu vận)
  | "empower"
  | "weaken"
  | `mark_${AmpElement}`
  | "windup";

/**
 * Loại tác dụng của trạng thái và ý nghĩa của `ratio` ở `SkillEffect`:
 *  - `dot`: sát thương mỗi giây = `ratio` x sát thương gốc của đòn gây ra nó (đốt, độc, chảy máu);
 *  - `slow`: giảm tốc độ di chuyển `ratio` (tê cóng); `vuln`: nhận thêm `ratio` sát thương (vỡ giáp);
 *  - `stun`: không làm gì được (không dùng `ratio`); `shield`: hấp thụ `ratio` x khí huyết tối đa;
 *  - `haste`: tăng tốc độ `ratio`; `regen`: hồi `ratio` x khí huyết tối đa mỗi giây;
 *  - `breakAid` (#514, đan hộ đạo): cộng `ratio` vào xác suất đột phá cảnh giới của lần đột phá kế tiếp (`breakthroughChanceWith`),
 *    gỡ ngay sau lần đó dù thành công hay thất bại; hết hạn mà chưa dùng thì mất;
 *  - `amp` (#514 lát 2, phù `amp_<hệ>`): sát thương GÂY RA của chiêu cùng hệ nhân `1 + ratio` (`statusAmpMult`); không áp cho đòn thường và chiêu hệ khác;
 *  - `cdr` (#514 lát 2, `cdr_phu`): cộng `ratio` vào giảm hồi chiêu của trang bị (`statusCdr`), tổng vẫn kẹp `CDR_CAP`.
 *  - `empower` (mục 51, TỰ buff): sát thương GÂY RA của MỌI chiêu nhân `1 + ratio` (`statusEmpowerMult`), tối đa +50%, không áp cho đòn thường;
 *  - `weaken` (mục 51, "suy", có hại): mục tiêu GÂY ít sát thương hơn `ratio` (tối đa 40%; trùm chỉ chịu nửa); lên đầu quái bằng bit `STATUS_BIT.weaken`;
 *  - `mark` (mục 51, DẤU hệ `mark_<hệ>`, có hại, không sát thương, không `ratio`): chiêu có `combo.needs` = dấu đó và CÙNG hệ thì được thưởng (nhân sát thương, gỡ dấu).
 *    Máy chủ giữ nhiều dấu trong `status`; lên đầu quái chỉ MỘT dấu mới nhất qua `Monster.mark` (1-9 = hệ theo `markIndexOf`, 0 = không dấu).
 * `windup` (vận khí, mục 51) mang kind `slow` (ratio `WINDUP_SLOW`) để `moveSpeedMul` dự đoán tốc độ đúng miễn phí; KHÔNG tính vào `MAX_STATUSES` (`STATUS_UNCOUNTED`)
 * và không bao giờ bị từ chối; vật phẩm không gắn được (`STATUS_SKILL_ONLY`).
 */
export type StatusKind =
  | "dot"
  | "slow"
  | "vuln"
  | "stun"
  | "shield"
  | "haste"
  | "regen"
  | "breakAid"
  | "amp"
  | "cdr"
  | "empower"
  | "weaken"
  | "mark";

export interface StatusDef {
  id: StatusId;
  name: string;
  kind: StatusKind;
  /** Có hại cho mục tiêu (gỡ được bằng thanh tẩy, hiện màu đỏ) hay có lợi (buff) */
  harmful: boolean;
  /** Trần thời gian một lần gắn (ms), kẹp khi nạp / áp */
  maxMs: number;
  /** Trần của `ratio` (kẹp khi áp) */
  maxRatio: number;
}

/** Một lượt của nguồn (trò chơi theo lượt) đổi sang thời gian thực (định nghĩa ở `skill-kit.ts`, lá của đồ thị import; xuất lại ở đây). */
export { TURN_MS };
/** Số trạng thái tối đa trên một mục tiêu; cùng loại thì LÀM MỚI (không cộng dồn). */
export const MAX_STATUSES = 4;
/** Choáng: tối đa 1,2 giây, trùm miễn, sau khi hết thì miễn choáng 3 giây (không choáng liền nhau). */
export const STUN_MAX_MS = 1200;
export const STUN_IMMUNE_MS = 3000;

/** Phù (#514 lát 2): hiệu lực tối đa 60 giây; phù tăng sát thương tối đa +30% (ratio 0,3). `cdr_phu` tối đa 0,15 (tổng với trang bị vẫn kẹp `CDR_CAP` = 0,3). */
export const AMP_MAX_MS = 60_000;
export const AMP_MAX_RATIO = 0.3;

/** Chiêu vận (mục 51): thời gian vận tối đa (ms), và mức làm chậm di chuyển của người đang vận (trạng thái `windup`, kind `slow`). */
export const WINDUP_MAX_MS = 2500;
export const WINDUP_SLOW = 0.5;
/** `empower` tối đa +50% sát thương chiêu, 8 giây; `weaken` tối đa -40% sát thương gây ra, 8 giây; DẤU hệ 8 giây. */
export const EMPOWER_MAX_RATIO = 0.5;
export const WEAKEN_MAX_RATIO = 0.4;
export const MARK_MAX_MS = 8000;
/** Trạng thái KHÔNG tính vào `MAX_STATUSES` (luôn nhận được, không đẩy buff khác ra). */
export const STATUS_UNCOUNTED: readonly StatusId[] = ["windup"];
/** Trạng thái CHỈ chiêu gắn được; vật phẩm (`ItemEffect` kind `status`) không gắn được (`clampStatusEffect` từ chối). */
export const STATUS_SKILL_ONLY: readonly StatusId[] = ["windup"];

export const STATUSES: readonly StatusDef[] = [
  { id: "burn", name: "Bỏng", kind: "dot", harmful: true, maxMs: 8000, maxRatio: 0.5 },
  { id: "poison", name: "Độc", kind: "dot", harmful: true, maxMs: 10000, maxRatio: 0.5 },
  { id: "bleed", name: "Chảy máu", kind: "dot", harmful: true, maxMs: 8000, maxRatio: 0.5 },
  { id: "chill", name: "Tê cóng", kind: "slow", harmful: true, maxMs: 6000, maxRatio: 0.6 },
  { id: "sunder", name: "Vỡ giáp", kind: "vuln", harmful: true, maxMs: 6000, maxRatio: 0.4 },
  { id: "stun", name: "Choáng", kind: "stun", harmful: true, maxMs: STUN_MAX_MS, maxRatio: 0 },
  { id: "shield", name: "Hộ thể", kind: "shield", harmful: false, maxMs: 8000, maxRatio: 0.5 },
  { id: "haste", name: "Tăng tốc", kind: "haste", harmful: false, maxMs: 8000, maxRatio: 0.6 },
  { id: "regen", name: "Hồi phục", kind: "regen", harmful: false, maxMs: 8000, maxRatio: 0.15 },
  // Nghề nhỏ (#514): id mới luôn thêm CUỐI để thứ tự cũ không đổi
  { id: "dao_ho", name: "Hộ đạo", kind: "breakAid", harmful: false, maxMs: 900000, maxRatio: 0.2 },
  // Nghề nhỏ lát 2 (#514, phù): một id cho mỗi hệ vì mục trạng thái chỉ có [id, ms, ratio]
  ...AMP_ELEMENTS.map((el): StatusDef => ({
    id: `amp_${el}`,
    name: `Phù ${ELEMENT_BY_ID[el].name}`,
    kind: "amp",
    harmful: false,
    maxMs: AMP_MAX_MS,
    maxRatio: AMP_MAX_RATIO,
  })),
  {
    id: "cdr_phu",
    name: "Phù Tốc Chiêu",
    kind: "cdr",
    harmful: false,
    maxMs: AMP_MAX_MS,
    maxRatio: 0.15,
  },
  // Đợt thêm chiêu (mục 51, CT1b): id mới luôn thêm CUỐI để thứ tự cũ không đổi
  {
    id: "empower",
    name: "Cường Lực",
    kind: "empower",
    harmful: false,
    maxMs: 8000,
    maxRatio: EMPOWER_MAX_RATIO,
  },
  {
    id: "weaken",
    name: "Suy Yếu",
    kind: "weaken",
    harmful: true,
    maxMs: 8000,
    maxRatio: WEAKEN_MAX_RATIO,
  },
  ...AMP_ELEMENTS.map((el): StatusDef => ({
    id: `mark_${el}`,
    name: `Dấu ${ELEMENT_BY_ID[el].name}`,
    kind: "mark",
    harmful: true,
    maxMs: MARK_MAX_MS,
    maxRatio: 0,
  })),
  {
    id: "windup",
    name: "Vận Khí",
    kind: "slow",
    harmful: false,
    maxMs: WINDUP_MAX_MS,
    maxRatio: WINDUP_SLOW,
  },
];

export const STATUS_BY_ID: Readonly<Record<string, StatusDef>> = Object.fromEntries(
  STATUSES.map((s) => [s.id, s]),
);

export function statusOf(id: unknown): StatusDef | undefined {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(STATUS_BY_ID, id)
    ? STATUS_BY_ID[id]
    : undefined;
}

/** Id trạng thái phù tăng sát thương của hệ `element` (`amp_<hệ>`); `undefined` cho `none` / giá trị lạ. */
export function ampStatusIdOf(element: unknown): StatusId | undefined {
  return typeof element === "string" && (AMP_ELEMENTS as readonly string[]).includes(element)
    ? (`amp_${element}` as StatusId)
    : undefined;
}

/** Hệ của một trạng thái `amp_<hệ>`; `undefined` cho id khác. */
export function ampElementOf(id: unknown): AmpElement | undefined {
  const def = statusOf(id);
  if (!def || def.kind !== "amp") return undefined;
  return AMP_ELEMENTS.find((el) => `amp_${el}` === def.id);
}

/** Id trạng thái DẤU của hệ `element` (`mark_<hệ>`); `undefined` cho `none` / giá trị lạ. */
export function markStatusIdOf(element: unknown): StatusId | undefined {
  return typeof element === "string" && (AMP_ELEMENTS as readonly string[]).includes(element)
    ? (`mark_${element}` as StatusId)
    : undefined;
}

/**
 * Chỉ số 1..9 của hệ trong `Monster.mark` (`AMP_ELEMENTS` theo thứ tự: kim 1, moc 2, thuy 3, hoa 4, tho 5, bang 6, phong 7, loi 8, am 9; 0 = không dấu). Hằng của hợp đồng:
 * hai phía không tự đánh số. `none` / giá trị lạ -> 0.
 */
export function markIndexOf(element: unknown): number {
  const i = (AMP_ELEMENTS as readonly unknown[]).indexOf(element);
  return i < 0 ? 0 : i + 1;
}

/** Ngược lại: hệ ứng với chỉ số `index` của `Monster.mark`; ngoài 1..9 / không nguyên -> `undefined`. */
export function markElementOf(index: unknown): AmpElement | undefined {
  return typeof index === "number" &&
    Number.isInteger(index) &&
    index >= 1 &&
    index <= AMP_ELEMENTS.length
    ? AMP_ELEMENTS[index - 1]
    : undefined;
}

// ---------------------------------------------------------------------------------------------------------------
// Chiêu thức
// ---------------------------------------------------------------------------------------------------------------

/**
 * Hình của chiêu: `cone` quạt trước mặt; `line` tia thẳng; `fan` nhiều tia toả (`count`, `spread`); `nova` vòng quanh mình;
 * `ground` vùng tròn đặt cách mình `reach` px theo hướng đánh; `dash` lao theo hướng đánh (`reach` px, có thể né); `self` tác dụng lên bản thân.
 */
/**
 * Kiểu hiệu ứng client của từng chiêu (`SkillDef.fx`): danh sách ĐÓNG để client có bảng `id -> hàm vẽ` phủ kín (M7.7, #508) và test bắt
 * gõ sai. Thêm chiêu mới mà cần kiểu hiệu ứng mới thì thêm id ở đây (client bắt buộc có hàm vẽ tương ứng).
 */
export const SKILL_FX_IDS = [
  "slash_fire",
  "punch_earth",
  "claw_metal",
  "slash_earth",
  "bolt_ice",
  "aura_metal",
  "aura_water",
  "dash_wind",
  "needle_wood",
  "fan_ice",
  "ground_earth",
  "aura_wind",
  // Đợt thêm chiêu (mục 51, CT1b): id CHUNG theo hình / hành vi (màu theo hệ), KHÔNG một id mỗi chiêu
  "bolt",
  "chain",
  "zone",
  "trap",
  "aura",
  "totem",
  "pull",
  "push",
  "windup",
] as const;
export type SkillFxId = (typeof SKILL_FX_IDS)[number];

export type SkillShape =
  | "cone"
  | "line"
  | "fan"
  | "nova"
  | "ground"
  | "dash"
  | "self"
  // Đợt thêm chiêu (mục 51, CT1b, docs/PHAN_CONG_CHIEU_THUC.md mục 3): xem `SkillDef` và `SKILL_LIMITS`
  | "chain"
  | "bolt"
  | "zone"
  | "trap"
  | "aura"
  | "totem";

/** Mọi hình chiêu (cùng thứ tự với `SkillShape`): để luật kiểm dữ liệu / công cụ duyệt qua mà không chép danh sách. */
export const SKILL_SHAPES: readonly SkillShape[] = [
  "cone",
  "line",
  "fan",
  "nova",
  "ground",
  "dash",
  "self",
  "chain",
  "bolt",
  "zone",
  "trap",
  "aura",
  "totem",
];

/**
 * Trần của dữ liệu chiêu mới (mục 51; `skillViolations` kiểm). `chain`: SÉT LAN trúng mục tiêu gần nhất rồi nảy sang quái gần nhất CHƯA trúng trong `chainReach`, mỗi lần nảy sát thương
 * nhân `falloff`; `bolt`: ĐẠN BAY (`count` viên toả `arc`, `speed` px/giây, xuyên `pierce` quái, nảy `bounce` lần sang quái gần nhất trong 160 px, dừng ở ô chặn / hết `range`); `zone`: VÙNG đặt
 * như `ground` tồn tại `durationMs`, mỗi `tickMs` gây `mult` + hiệu ứng; `trap`: BẪY đặt như `ground`, sau `armMs` mới hoạt động, nổ MỘT lần khi quái bước vào, hết `durationMs` thì tan;
 * `aura`: HÀO QUANG quanh thân bám theo người trong `durationMs`, mỗi `tickMs` tác dụng quái trong `range`; `totem`: TƯỢNG triệu hồi ngắn đứng yên `durationMs`, mỗi `tickMs` đánh quái gần
 * nhất trong `range` (`taunt`: thu hút quái nhắm). Mọi vật thể bền chỉ đánh QUÁI (PK đợt 1: chỉ chiêu tức thời + đạn qua `duelHit`), có trần theo người và theo phòng ở máy chủ (CT3 / CT4).
 */
export const SKILL_LIMITS = {
  chainBouncesMax: 4,
  chainReachMax: 220,
  chainFalloffMin: 0.5,
  boltCountMax: 5,
  boltSpeedMin: 300,
  boltSpeedMax: 700,
  boltRangeMax: 560,
  boltPierceMax: 3,
  boltBounceMax: 2,
  zoneDurationMax: 8000,
  zoneTickMin: 400,
  trapArmMin: 400,
  trapDurationMax: 20_000,
  auraDurationMax: 12_000,
  auraTickMin: 500,
  totemDurationMax: 8000,
  totemTickMin: 800,
  windupMin: 300,
  /** `windupMs` tối đa = `WINDUP_MAX_MS` (đặt sau; giữ một nguồn). */
  displaceMin: 20,
  displaceMax: 200,
  comboMultMax: 2,
  allyRangeMax: 600,
  /**
   * Trần VẬT THỂ BỀN (`zone` / `trap` / `totem` / `aura`) cùng tồn tại: theo MỖI NGƯỜI và theo CẢ PHÒNG. Máy chủ giữ (CT3 / CT4: vượt thì vật thể cũ nhất của người đó / của phòng bị đẩy, `fxEnd`
   * `gone`); client dùng ĐÚNG số này để cấp bể hạt (vẽ tối đa chừng đó, gần người chơi nhất trước). TẠM: CT3 / CT4 chốt bằng đo; đổi thì đổi ở đây, hai bên đọc cùng một nguồn.
   */
  persistPerPlayerMax: 4,
  persistPerRoomMax: 60,
} as const;

export interface SkillEffect {
  status: StatusId;
  /** Thời gian (ms) */
  ms: number;
  /** Cường độ (nghĩa theo `StatusKind`) */
  ratio: number;
  /** Xác suất gắn (0..1); chiêu có lợi cho bản thân dùng 1 */
  chance: number;
}

export interface SkillDef {
  id: string;
  /** Tên chiêu (nguồn) */
  name: string;
  /** Tên công pháp / kinh quyển dạy chiêu này (nguồn) */
  bookName: string;
  /** Mô tả (nguồn: `mo_ta` của công pháp) */
  desc: string;
  element: Element;
  shape: SkillShape;
  /** Hồi chiêu (ms), trước khi trừ theo tầng và `cdr` */
  cooldown: number;
  /** Linh lực tiêu hao = `ceil(mpPct x linh lực tối đa)` (0..0,5): tính theo % để còn nghĩa ở mọi cảnh giới (linh lực tối đa tăng ~x6 tới Kim Đan) */
  mpPct: number;
  /** Tầm với của cone / line / fan / nova / dash (px); với `ground` là bán kính vùng */
  range: number;
  /** Cone: góc quạt (rad); fan: tổng góc toả (rad). Hình khác bỏ trống */
  arc?: number;
  /** Line / fan: bề rộng tia (px) */
  width?: number;
  /** Fan: số tia */
  count?: number;
  /** Ground: khoảng cách từ người dùng tới tâm vùng (px); dash: quãng lao (px) */
  reach?: number;
  /** Hệ số sát thương (nhân `atk`) cho mỗi lần trúng; 0 = chiêu không gây sát thương (hộ thể, hồi, bộ pháp) */
  mult: number;
  effects: readonly SkillEffect[];
  /** Né đòn trong lúc dùng (ms), cho bộ pháp */
  dodgeMs?: number;
  /** Cảnh giới / bậc tối thiểu để học (`stepOf`-style: so theo realm rồi tier) */
  reqRealm: number;
  reqTier: number;
  /** `Rarity` của kinh quyển dạy chiêu (0..4) */
  rarity: 0 | 1 | 2 | 3 | 4;
  /** Giá bán / mua cơ sở của kinh quyển (Linh thạch, theo nguồn; M7.4 / M7.9 chỉnh) */
  price: number;
  /** Kiểu hiệu ứng client (`FxMsg` `cast`, `SKILL_FX_IDS`); ghép với hệ để chọn màu */
  fx: SkillFxId;
  /** TUỲ CHỌN (mục 51): phong cách chiêu để client chọn hình biểu tượng (`SKILL_STYLES`, `skill-kit.ts`); thiếu thì client suy theo `shape`. */
  style?: SkillStyle;
  /** TUỲ CHỌN (mục 51): phẩm cấp Hoàng / Huyền / Địa / Thiên (`SKILL_GRADES`); thiếu thì suy theo `rarity`. */
  grade?: SkillGrade;
  // ----- Đợt thêm chiêu (mục 51, CT1b): mọi trường dưới đây TUỲ CHỌN, 18 chiêu cũ không có -----
  /** `chain`: số lần nảy thêm (0..`SKILL_LIMITS.chainBouncesMax`). */
  bounces?: number;
  /** `chain`: tầm nhảy giữa hai mục tiêu (px, <= `chainReachMax`). */
  chainReach?: number;
  /** `chain`: hệ số sát thương mỗi lần nảy (`chainFalloffMin`..1; thiếu = 0,85). */
  falloff?: number;
  /** `bolt`: tốc độ bay (px/giây). */
  speed?: number;
  /** `bolt`: xuyên thêm bao nhiêu quái (0..3). */
  pierce?: number;
  /** `bolt`: số lần nảy sang quái gần nhất (0..2). */
  bounce?: number;
  /** `zone` / `trap` / `aura` / `totem`: thời gian tồn tại (ms). */
  durationMs?: number;
  /** `zone` / `aura` / `totem`: nhịp tác dụng (ms). */
  tickMs?: number;
  /** `trap`: thời gian chờ kích hoạt sau khi đặt (ms). */
  armMs?: number;
  /** `totem`: thu hút quái nhắm vào tượng. */
  taunt?: boolean;
  /** CHIÊU VẬN: vận khí chừng này (ms, `windupMin`..`WINDUP_MAX_MS`) rồi mới đáp; tiêu hao + hồi chiêu tính lúc BẮT ĐẦU; choáng / chết / hồn lìa xác huỷ; người vận chậm `WINDUP_SLOW`. */
  windupMs?: number;
  /** KÉO / ĐẨY mục tiêu trúng `px` (qua va chạm); trùm miễn, tinh anh nửa quãng. */
  displace?: { dir: "pull" | "push"; px: number };
  /** COMBO: đánh vào mục tiêu ĐANG mang trạng thái `needs` thì nhân sát thương `mult` (1..`comboMultMax`, thiếu = 1,4), gắn thêm `apply`, và gỡ `needs` nếu `consume`. */
  combo?: { needs: StatusId; mult?: number; consume?: boolean; apply?: SkillEffect };
  /** Trạng thái CÓ LỢI của chiêu (hộ thể / tăng tốc / hồi phục) cũng lên đồng đội CÙNG ĐỘI trong `range` px. */
  ally?: { range: number };
}

const fx = skillEffect;

/**
 * 12 chiêu đợt 1 (kế hoạch mục 5.3), toàn bộ lấy từ công pháp CÓ chiêu của nguồn (phẩm cấp 1-3). Số là số khởi điểm.
 * Thứ tự = thứ tự hiện ở bảng Công pháp.
 *
 * 6 chiêu đợt 2 (M7.9, #654) là chiêu GỐC của Tiên Giới (do Dev D soạn, KHÔNG lấy từ nguồn), dành cho cảnh giới Nguyên Anh
 * (`reqRealm: 4`): Hàn Vân Lĩnh và các quái quanh đó rơi kinh quyển. Số cũng là số khởi điểm, Dev A mô phỏng rồi chỉnh.
 */
export const SKILLS_M7: readonly SkillDef[] = [
  {
    id: "hoa_van_kiem",
    name: "Hỏa Vân Kiếm",
    bookName: "Hỏa Vân Kiếm Pháp",
    desc: "Kiếm pháp nhập môn của kiếm tu hệ Hỏa. Lưỡi kiếm vung qua kéo theo một vệt mây đỏ, vết chém cháy sém mép.",
    element: "hoa",
    shape: "cone",
    cooldown: 3000,
    mpPct: 0.08,
    range: 90,
    arc: Math.PI * 0.7,
    mult: 1.6,
    effects: [fx("burn", 2, 0.12, 0.4)],
    reqRealm: 1,
    reqTier: 0,
    rarity: 1,
    price: 80,
    fx: "slash_fire",
  },
  {
    id: "bon_thach_quyen",
    name: "Bôn Thạch Quyền",
    bookName: "Bôn Thạch Quyền",
    desc: "Quyền phổ võ quán, dồn sức như đá lăn sườn núi. Ra đòn chậm, trúng thì gãy xương.",
    element: "tho",
    shape: "cone",
    cooldown: 3500,
    mpPct: 0.08,
    range: 80,
    arc: Math.PI * 0.5,
    mult: 1.9,
    effects: [],
    reqRealm: 1,
    reqTier: 0,
    rarity: 1,
    price: 60,
    fx: "punch_earth",
  },
  {
    id: "ung_trao",
    name: "Ưng Trảo",
    bookName: "Ưng Trảo Công",
    desc: "Quyền phổ võ quán dạy co ngón như vuốt chim ưng, chộp vào là xé da thịt. Luyện bằng cách cào cát nóng mỗi sáng.",
    element: "kim",
    shape: "cone",
    cooldown: 2500,
    mpPct: 0.06,
    range: 70,
    arc: Math.PI * 0.6,
    mult: 1.3,
    effects: [fx("bleed", 2, 0.15, 0.4)],
    reqRealm: 1,
    reqTier: 0,
    rarity: 1,
    price: 55,
    fx: "claw_metal",
  },
  {
    id: "trong_nhac_tram",
    name: "Trọng Nhạc Trảm",
    bookName: "Trọng Nhạc Kiếm Pháp",
    desc: "Kiếm pháp dùng kiếm nặng không mài lưỡi, chém xuống như núi đổ. Chậm mà chắc, đỡ được nhát đầu cũng tê cả cánh tay.",
    element: "tho",
    shape: "cone",
    cooldown: 3000,
    mpPct: 0.08,
    range: 95,
    arc: Math.PI * 0.6,
    mult: 1.6,
    effects: [fx("bleed", 2, 0.12, 0.3)],
    reqRealm: 1,
    reqTier: 0,
    rarity: 1,
    price: 80,
    fx: "slash_earth",
  },
  {
    id: "huyen_bang_chi",
    name: "Huyền Băng Chỉ",
    bookName: "Huyền Băng Chỉ",
    desc: "Dồn hàn khí ra đầu ngón tay mà điểm, chỗ trúng đóng một vòng băng trắng. Tu sĩ phương bắc truyền ra ngoài từ lâu.",
    element: "bang",
    shape: "line",
    cooldown: 2500,
    mpPct: 0.07,
    range: 200,
    width: 20,
    mult: 1.5,
    effects: [],
    reqRealm: 1,
    reqTier: 0,
    rarity: 1,
    price: 75,
    fx: "bolt_ice",
  },
  {
    id: "kim_chung_trao",
    name: "Kim Chung Tráo",
    bookName: "Kim Chung Tráo",
    desc: "Vận khí thành một chiếc chuông vàng úp quanh thân. Hòa thượng khất thực truyền cho người nào chịu nghe kinh.",
    element: "kim",
    shape: "self",
    cooldown: 9000,
    mpPct: 0.12,
    range: 0,
    mult: 0,
    effects: [fx("shield", 3.5, 0.2, 1)],
    reqRealm: 1,
    reqTier: 0,
    rarity: 1,
    price: 70,
    fx: "aura_metal",
  },
  {
    id: "bich_thuy_hoi_xuan",
    name: "Hồi Xuân",
    bookName: "Bích Thủy Hồi Xuân Thuật",
    desc: "Dẫn thủy khí chảy qua vết thương, thịt da liền lại. Lang trung có tu vi hay dùng.",
    element: "thuy",
    shape: "self",
    cooldown: 8000,
    mpPct: 0.18,
    range: 0,
    mult: 0,
    effects: [fx("regen", 2.7, 0.06, 1)],
    reqRealm: 1,
    reqTier: 0,
    rarity: 1,
    price: 80,
    fx: "aura_water",
  },
  {
    id: "phieu_phong_bo",
    name: "Phiêu Phong Bộ",
    bookName: "Phiêu Phong Bộ",
    desc: "Bộ pháp của gánh xiếc rong, chân lướt như lá bị gió cuốn. Né được một đòn là lời.",
    element: "phong",
    shape: "dash",
    cooldown: 3000,
    mpPct: 0.05,
    range: 0,
    reach: 150,
    mult: 0,
    effects: [],
    dodgeMs: 350,
    reqRealm: 1,
    reqTier: 0,
    rarity: 0,
    price: 12,
    fx: "dash_wind",
  },
  {
    id: "thanh_tung_phi_cham",
    name: "Thanh Tùng Phi Châm",
    bookName: "Thanh Tùng Châm Quyết",
    desc: "Người giữ rừng tùng luyện mộc khí vào lá kim, búng ra như mưa châm. Nhựa tùng xanh bám vào vết châm, ngấm dần làm tê cả mảng thịt.",
    element: "moc",
    shape: "line",
    cooldown: 3000,
    mpPct: 0.1,
    range: 240,
    width: 18,
    mult: 1.5,
    effects: [fx("poison", 2, 0.2, 0.6)],
    reqRealm: 2,
    reqTier: 0,
    rarity: 2,
    price: 300,
    fx: "needle_wood",
  },
  {
    id: "lac_tuyet_phan_phi",
    name: "Lạc Tuyết Phân Phi",
    bookName: "Lạc Tuyết Kiếm Quyết",
    desc: "Kiếm quyết của kiếm tu phương bắc, một kiếm vung ra tách thành trăm mũi như tuyết rơi. Mũi nào cũng nhỏ, nhưng trúng chỗ nào là chỗ đó tê cóng.",
    element: "bang",
    shape: "fan",
    cooldown: 3500,
    mpPct: 0.1,
    range: 200,
    width: 14,
    count: 5,
    arc: Math.PI * 0.5,
    mult: 0.7,
    effects: [fx("chill", 2, 0.3, 0.5)],
    reqRealm: 2,
    reqTier: 0,
    rarity: 2,
    price: 290,
    fx: "fan_ice",
  },
  {
    id: "cuu_cung_khon_sat",
    name: "Cửu Cung Khốn Sát",
    bookName: "Cửu Cung Trận Quyết",
    desc: "Trận sư cắm chín viên đá theo cung Lạc Thư quanh chân địch. Kẻ bị nhốt thấy đường nào cũng là vách đất, loay hoay mất một hồi.",
    element: "tho",
    shape: "ground",
    cooldown: 7000,
    mpPct: 0.14,
    range: 110,
    reach: 140,
    mult: 1.4,
    effects: [fx("stun", 0.7, 0, 0.7), fx("sunder", 2, 0.1, 0.5)],
    reqRealm: 2,
    reqTier: 0,
    rarity: 2,
    price: 300,
    fx: "ground_earth",
  },
  {
    id: "me_tung_bo",
    name: "Mê Tung Bộ",
    bookName: "Mê Tung Bộ",
    desc: "Bộ pháp đi chéo theo hình hoa mai, người đứng xem chỉ thấy bóng chồng lên bóng. Lùi một bước tránh đòn, bước sau đã đứng sau lưng địch.",
    element: "phong",
    shape: "self",
    cooldown: 8000,
    mpPct: 0.1,
    range: 0,
    mult: 0,
    effects: [fx("haste", 2, 0.35, 1)],
    dodgeMs: 600,
    reqRealm: 2,
    reqTier: 0,
    rarity: 2,
    price: 150,
    fx: "aura_wind",
  },
  // -----------------------------------------------------------------------------------------------
  // 6 chiêu đợt 2 — chiêu GỐC của Tiên Giới, cảnh giới Nguyên Anh (reqRealm 4), M7.9 (#654).
  // Không lấy từ nguồn; tên / sách / mô tả do Dev D soạn theo thế giới Tiên Giới. Số là số khởi điểm.
  // -----------------------------------------------------------------------------------------------
  {
    id: "han_quang_tien",
    name: "Hàn Quang Tiễn",
    bookName: "Hàn Quang Tiễn Quyết",
    desc: "Cung pháp của kiếm tu đóng băng, rút một mũi tiễn từ hàn khí kết tinh rồi bắn ra thành tia sáng lạnh. Mũi trúng đâu, băng kết lại đó, tê cóng cả cánh tay.",
    element: "bang",
    shape: "line",
    cooldown: 3000,
    mpPct: 0.11,
    range: 210,
    width: 18,
    mult: 2.4,
    effects: [fx("chill", 2, 0.3, 0.55)],
    reqRealm: 4,
    reqTier: 0,
    rarity: 2,
    price: 240,
    fx: "bolt_ice",
  },
  {
    id: "bach_kim_trao",
    name: "Bạch Kim Trảo",
    bookName: "Bạch Kim Trảo",
    desc: "Công pháp kim thân cương quyết, dồn kim khí vào móng tay thành năm vuốt bạch kim. Chộp mạnh vào người địch, vết trảo hở máu không bao giờ liền nhanh.",
    element: "kim",
    shape: "cone",
    cooldown: 3200,
    mpPct: 0.12,
    range: 90,
    arc: Math.PI * 0.6,
    mult: 2.2,
    effects: [fx("bleed", 3, 0.18, 0.55)],
    reqRealm: 4,
    reqTier: 0,
    rarity: 2,
    price: 280,
    fx: "claw_metal",
  },
  {
    id: "van_thach_tran",
    name: "Vân Thạch Trận",
    bookName: "Vân Thạch Trận Pháp",
    desc: "Trận pháp thổ hệ đặt đá vân thạch thành vòng quanh chân địch. Đất đóng bẫy, đá khép lại đập choáng, giáp trụ vỡ toác trước khi kẻ địch vùng lên được.",
    element: "tho",
    shape: "ground",
    cooldown: 7000,
    mpPct: 0.16,
    range: 120,
    reach: 150,
    mult: 2.0,
    effects: [fx("stun", 0.7, 0, 0.7), fx("sunder", 2, 0.12, 0.55)],
    reqRealm: 4,
    reqTier: 1,
    rarity: 3,
    price: 420,
    fx: "ground_earth",
  },
  {
    id: "bang_hoa_loan",
    name: "Băng Hoa Loạn",
    bookName: "Băng Hoa Loạn Quyết",
    desc: "Kiếm quyết phương bắc ra chiêu, một đóa băng hoa nở tung trên không rồi vỡ thành năm cánh lạnh buốt xoáy quanh mục tiêu. Cánh nào cũng mảnh, nhưng lớp lớp phủ lên nhau khiến địch không kịp thở.",
    element: "bang",
    shape: "fan",
    cooldown: 3800,
    mpPct: 0.13,
    range: 200,
    width: 14,
    count: 5,
    arc: Math.PI * 0.5,
    mult: 0.85,
    effects: [fx("chill", 2, 0.3, 0.5)],
    reqRealm: 4,
    reqTier: 1,
    rarity: 3,
    price: 400,
    fx: "fan_ice",
  },
  {
    id: "liet_hoa_kiem",
    name: "Liệt Hỏa Kiếm",
    bookName: "Liệt Hỏa Kiếm Quyết",
    desc: "Kiếm quyết hỏa hệ đốt kim khí quanh lưỡi kiếm thành một vệt lửa rực. Chém tới đâu, lửa liếm tới đó, để lại trên da kẻ địch một vết bỏng âm ỉ không tắt.",
    element: "hoa",
    shape: "cone",
    cooldown: 3500,
    mpPct: 0.14,
    range: 95,
    arc: Math.PI * 0.65,
    mult: 2.6,
    effects: [fx("burn", 3, 0.2, 0.6)],
    reqRealm: 4,
    reqTier: 2,
    rarity: 3,
    price: 460,
    fx: "slash_fire",
  },
  {
    id: "van_hanh_bo",
    name: "Vân Hành Bộ",
    bookName: "Vân Hành Bộ",
    desc: "Bộ pháp phong hệ lướt người trên lớp khí gió cuộn quanh chân, bước đi như mây trôi. Nhanh hơn gió một nhịp, lướt bước thoăn thoắt trong chốc lát.",
    element: "phong",
    shape: "self",
    cooldown: 8000,
    mpPct: 0.12,
    range: 0,
    mult: 0,
    effects: [fx("haste", 2, 0.4, 1)],
    reqRealm: 4,
    reqTier: 2,
    rarity: 2,
    price: 300,
    fx: "aura_wind",
  },
];

/**
 * MỌI chiêu HỌC ĐƯỢC của trò chơi (mục 51; tên `LEARNABLE_SKILLS` vì `SKILLS` đã là bảng hai chiêu cố định ô 1 ở `game.ts`): 18 chiêu `SKILLS_M7` + các tệp dữ liệu theo nhóm hệ để PR của D / E / G không xung đột (`skills-kim-tho.ts`, `skills-moc-thuy.ts`,
 * `skills-hoa.ts`, `skills-khac.ts` = Phong / Lôi / Băng / Âm / vô sắc). Kinh quyển, tra cứu, sổ chiêu, luật kiểm `skillViolations` đều đọc `LEARNABLE_SKILLS` (không đọc `SKILLS_M7`,
 * vẫn giữ để test ghim 18 chiêu gốc). Thứ tự = thứ tự hiện ở bảng Công pháp.
 */
export const LEARNABLE_SKILLS: readonly SkillDef[] = [
  ...SKILLS_M7,
  ...SKILLS_KIM_THO,
  ...SKILLS_MOC_THUY,
  ...SKILLS_HOA,
  ...SKILLS_KHAC,
  ...SKILLS_DANG_MOI,
  ...SKILLS_HOA_THAN,
];

export const SKILL_BY_ID: Readonly<Record<string, SkillDef>> = Object.fromEntries(
  LEARNABLE_SKILLS.map((s) => [s.id, s]),
);

/** Tra chiêu theo id không tin được (tin nhắn client, file lưu): id lạ / độc -> `undefined`. */
export function skillOf(id: unknown): SkillDef | undefined {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(SKILL_BY_ID, id)
    ? SKILL_BY_ID[id]
    : undefined;
}

/** Giảm hồi chiêu tối đa từ trang bị (`EquipStats.cdr`, M7.4) dạng PHÂN SỐ: 30% = `STAT_CAPS.cdr / 100` (MỘT nguồn ở `items.ts`). */
export const CDR_CAP = STAT_CAPS.cdr / 100;

/** Linh lực một lần dùng chiêu = `ceil(mpPct x linh lực tối đa)`, ít nhất 1. MỘT hàm: server trừ, client tô xám ô khi thiếu và in "Linh lực: N". */
export function skillMpCost(def: Pick<SkillDef, "mpPct">, maxMp: number): number {
  if (!Number.isFinite(maxMp) || maxMp <= 0) return 1;
  return Math.max(1, Math.ceil(def.mpPct * maxMp));
}

/**
 * Hồi chiêu (ms) của chiêu `def` ở tầng `level` với giảm hồi chiêu `cdr` (0..`CDR_CAP`, kẹp): `cooldown x (1 - 8% mỗi tầng trên 1) x (1 - cdr)`.
 * Server dùng để đặt `skillCd`, và gửi tổng này (`SkillsMsg.cdMax`) để client vẽ vòng hồi chiêu (client không biết `cdr`).
 */
export function skillCooldownMs(def: Pick<SkillDef, "cooldown">, level: number, cdr = 0): number {
  const c = Number.isFinite(cdr) ? Math.min(CDR_CAP, Math.max(0, cdr)) : 0;
  return Math.max(0, Math.round(def.cooldown * skillCooldownMult(level) * (1 - c)));
}

// ---------------------------------------------------------------------------------------------------------------
// Tầng, ô chiêu, sổ chiêu của nhân vật
// ---------------------------------------------------------------------------------------------------------------

/** Tầng học tối đa của chiêu KHÔNG khai phẩm (18 chiêu cũ): 3 (học thêm kinh quyển trùng thì +1 tầng). Chiêu có phẩm: `skillMaxLevelOf` (Hoàng 3 / Huyền 4 / Địa 5 / Thiên 6). */
export const SKILL_MAX_LEVEL = 3;
/** Mỗi tầng trên tầng 1 (tầng 1-3): +15% sát thương và -8% hồi chiêu (đề xuất, M7.9 chỉnh). Tầng 4-6 theo bảng dưới (tăng chậm dần). */
export const SKILL_LEVEL_DAMAGE = 0.15;
export const SKILL_LEVEL_COOLDOWN = 0.08;
/** Hệ số sát thương / hồi chiêu theo tầng 1..6 (tầng 1-3 TRÙNG công thức tuyến tính cũ: `1 + 0,15 (l - 1)`, `1 - 0,08 (l - 1)`). */
export const SKILL_LEVEL_DAMAGE_TABLE: readonly number[] = [1, 1.15, 1.3, 1.4, 1.5, 1.6];
export const SKILL_LEVEL_COOLDOWN_TABLE: readonly number[] = [1, 0.92, 0.84, 0.8, 0.76, 0.72];

/** Tầng kẹp [1, `SKILL_TIER_MAX`] (số lạ -> 1). */
function tierClamp(level: number): number {
  return Math.min(SKILL_TIER_MAX, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)));
}

export function skillDamageMult(level: number): number {
  return SKILL_LEVEL_DAMAGE_TABLE[tierClamp(level) - 1]!;
}

export function skillCooldownMult(level: number): number {
  return SKILL_LEVEL_COOLDOWN_TABLE[tierClamp(level) - 1]!;
}

/** Các ô chiêu học được: L U I O = ô 2-5 (ô 1 là Kiếm chém, Kiếm khí đứng riêng). */
export const LEARNABLE_SLOTS = [2, 3, 4, 5] as const;
export type SkillSlot = (typeof LEARNABLE_SLOTS)[number];

/** Ô mở theo cảnh giới (`realm` tối thiểu): ô 2 từ Luyện Khí, ô 3 Trúc Cơ, ô 4 Kim Đan, ô 5 Nguyên Anh. */
export const SLOT_UNLOCK_REALM: Readonly<Record<SkillSlot, number>> = { 2: 1, 3: 2, 4: 3, 5: 4 };

export function isSkillSlot(n: unknown): n is SkillSlot {
  return typeof n === "number" && (LEARNABLE_SLOTS as readonly number[]).includes(n);
}

export function slotOpen(slot: unknown, realm: number): boolean {
  return isSkillSlot(slot) && Number.isFinite(realm) && realm >= SLOT_UNLOCK_REALM[slot];
}

/** Sổ chiêu của nhân vật: id chiêu -> tầng (1..3), và bốn ô (chỉ số 0-3 = ô 2-5, "" = trống). Dữ liệu riêng của chủ. */
export interface SkillBook {
  learned: Record<string, number>;
  slots: [string, string, string, string];
  /**
   * ĐIỂM LUYỆN dở dang của từng chiêu (CT5; id chiêu -> điểm, số nguyên >= 0, `< MASTERY_NEED` của tầng hiện tại). TUỲ CHỌN: file lưu cũ không có = chưa luyện gì. Chỉ có mục cho chiêu đã học
   * còn luyện được (`masteryNeedOf` khác `null`); `sanitizeSkillBook` kẹp. Khắc chân linh KHÔNG mang (luyện lại ở kiếp mới).
   */
  mastery?: Record<string, number>;
}

export function emptySkillBook(): SkillBook {
  return { learned: {}, slots: ["", "", "", ""] };
}

function levelClamp(v: unknown, max: number = SKILL_MAX_LEVEL): number {
  return typeof v === "number" && Number.isFinite(v)
    ? Math.min(max, Math.max(1, Math.floor(v)))
    : 1;
}

/**
 * Điểm luyện cần để lên tầng kế của chiêu `def` đang ở tầng `level`; `null` = KHÔNG luyện được nữa (đã tới tầng tối đa - 1: tầng cuối chỉ bằng kinh quyển trùng; hoặc tầng không hợp lệ).
 * Chiêu cũ (tối đa tầng 3) luyện được từ tầng 1 lên 2; tầng 3 chỉ bằng quyển.
 */
export function masteryNeedOf(def: { grade?: unknown }, level: number): number | null {
  if (typeof level !== "number" || !Number.isInteger(level) || level < 1) return null;
  return level < skillMaxLevelOf(def) - 1 && level <= MASTERY_NEED.length
    ? MASTERY_NEED[level - 1]!
    : null;
}

/**
 * Cộng `points` điểm luyện cho chiêu `def` trong `book` (trả sổ MỚI, không sửa sổ cũ). Đủ `masteryNeedOf` thì lên tầng kế và chuyển phần dư sang tầng sau (lên liền nhiều tầng nếu đủ điểm),
 * dừng ở tầng tối đa - 1. Chiêu chưa học / không luyện được / `points` không dương: trả nguyên sổ. `leveledTo` = tầng mới nếu có lên tầng.
 */
export function addMastery(
  book: SkillBook,
  def: { id: string; grade?: unknown },
  points: number,
): { book: SkillBook; leveledTo?: number } {
  const has = Object.prototype.hasOwnProperty;
  if (!has.call(book.learned, def.id) || !(points > 0) || !Number.isFinite(points)) return { book };
  let level = book.learned[def.id]!;
  let have =
    (book.mastery && has.call(book.mastery, def.id) ? book.mastery[def.id]! : 0) +
    Math.floor(points);
  const start = level;
  for (;;) {
    const need = masteryNeedOf(def, level);
    if (need === null) {
      have = 0;
      break;
    }
    if (have < need) break;
    have -= need;
    level += 1;
  }
  const mastery = { ...(book.mastery ?? {}) };
  if (have > 0) mastery[def.id] = have;
  else delete mastery[def.id];
  const next: SkillBook = {
    learned: level === start ? book.learned : { ...book.learned, [def.id]: level },
    slots: book.slots,
    ...(Object.keys(mastery).length > 0 ? { mastery } : {}), // không còn điểm nào thì không có trường (như `sanitizeSkillBook`)
  };
  return level === start ? { book: next } : { book: next, leveledTo: level };
}

/**
 * Làm sạch sổ chiêu đọc từ file lưu: chiêu lạ / độc bỏ, tầng kẹp 1..3; ô chỉ giữ chiêu ĐÃ HỌC, mỗi chiêu tối đa một ô (ô đứng
 * trước thắng), ô CHƯA MỞ ở `realm` bị gỡ. Không bao giờ ném lỗi, không bao giờ trả `learned` có khoá ngoài bảng.
 */
export function sanitizeSkillBook(raw: unknown, realm: number): SkillBook {
  const out = emptySkillBook();
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;
  if (r.learned !== null && typeof r.learned === "object" && !Array.isArray(r.learned)) {
    const src = r.learned as Record<string, unknown>;
    for (const def of LEARNABLE_SKILLS) {
      if (Object.prototype.hasOwnProperty.call(src, def.id))
        out.learned[def.id] = levelClamp(src[def.id], skillMaxLevelOf(def));
    }
  }
  // Điểm luyện dở dang (CT5): chỉ cho chiêu ĐÃ HỌC còn luyện được, số nguyên 0 <= điểm < cần để lên tầng kế; không có / rác thì bỏ
  if (r.mastery !== null && typeof r.mastery === "object" && !Array.isArray(r.mastery)) {
    const src = r.mastery as Record<string, unknown>;
    const mastery: Record<string, number> = {};
    for (const def of LEARNABLE_SKILLS) {
      if (!Object.prototype.hasOwnProperty.call(src, def.id)) continue;
      const level = out.learned[def.id];
      const need = level === undefined ? null : masteryNeedOf(def, level);
      const v = src[def.id];
      if (need === null || typeof v !== "number" || !Number.isFinite(v)) continue;
      const pts = Math.min(need - 1, Math.max(0, Math.floor(v)));
      if (pts > 0) mastery[def.id] = pts;
    }
    if (Object.keys(mastery).length > 0) out.mastery = mastery;
  }
  if (Array.isArray(r.slots)) {
    const used = new Set<string>();
    for (let i = 0; i < LEARNABLE_SLOTS.length; i++) {
      const id = r.slots[i];
      if (typeof id !== "string" || id === "" || used.has(id)) continue;
      if (!Object.prototype.hasOwnProperty.call(out.learned, id)) continue;
      if (!slotOpen(LEARNABLE_SLOTS[i], realm)) continue;
      out.slots[i] = id;
      used.add(id);
    }
  }
  return out;
}

/** `{ mastery }` của sổ cũ (bản sao) nếu có, để hàm tạo sổ mới không làm rơi điểm luyện. */
function keepMastery(book: SkillBook): { mastery?: Record<string, number> } {
  return book.mastery ? { mastery: { ...book.mastery } } : {};
}

function omitKey(o: Record<string, number>, k: string): Record<string, number> {
  const { [k]: _drop, ...rest } = o;
  void _drop;
  return rest;
}

export type LearnResult =
  | { ok: true; level: number; book: SkillBook }
  | { ok: false; reason: "unknown" | "realm" | "maxed" };

/**
 * Đã đủ cảnh giới / bậc để học HOẶC DÙNG chiêu `def`? (`realm` cao hơn thì đủ bất kể bậc; cùng `reqRealm` thì cần `tier >= reqTier`). MỘT hàm cho
 * server (`learnSkill`, `cast`) và client (hiện "chưa đủ cảnh giới" ở bảng Công pháp / ô chiêu): kiếp mới có thể giữ chiêu đã khắc cần cảnh giới
 * cao hơn lúc mới tu (`rebirthSkills` không xét), nên lúc DÙNG phải kiểm lại. Cảnh giới / bậc không hữu hạn: chưa đủ.
 */
export function skillReqMet(
  def: Pick<SkillDef, "reqRealm" | "reqTier">,
  realm: number,
  tier: number,
): boolean {
  if (!Number.isFinite(realm) || !Number.isFinite(tier)) return false;
  return realm > def.reqRealm || (realm === def.reqRealm && tier >= def.reqTier);
}

/**
 * Học chiêu từ kinh quyển (hoặc lên tầng nếu đã học). Kiểm: chiêu có trong bảng, đủ cảnh giới (`reqRealm` / `reqTier`), chưa đạt tầng tối đa.
 * Trả sổ MỚI (không sửa sổ cũ). Server gọi hàm này rồi mới trừ kinh quyển khỏi túi (trọn vẹn hoặc không gì cả).
 */
export function learnSkill(
  book: SkillBook,
  skillId: unknown,
  realm: number,
  tier: number,
): LearnResult {
  const def = skillOf(skillId);
  if (!def) return { ok: false, reason: "unknown" };
  if (!skillReqMet(def, realm, tier)) return { ok: false, reason: "realm" };
  const cur = Object.prototype.hasOwnProperty.call(book.learned, def.id) ? book.learned[def.id] : 0;
  if (cur >= skillMaxLevelOf(def)) return { ok: false, reason: "maxed" };
  const next: SkillBook = {
    learned: { ...book.learned, [def.id]: cur + 1 },
    slots: [...book.slots] as SkillBook["slots"],
    // quyển trùng lên tầng thì điểm luyện dở dang của tầng cũ KHÔNG còn nghĩa: bỏ (luyện lại từ 0 ở tầng mới)
    ...(book.mastery ? { mastery: omitKey(book.mastery, def.id) } : {}),
  };
  return { ok: true, level: cur + 1, book: next };
}

export type SlotResult =
  | { ok: true; book: SkillBook }
  | { ok: false; reason: "slot" | "locked" | "unknown" | "notLearned" };

/**
 * Gắn chiêu vào ô (`skillId` "" = gỡ). Kiểm: ô thuộc 2-5, ô đã mở ở `realm`, chiêu đã học. Chiêu đang ở ô khác thì ĐỔI chỗ (ô cũ trống),
 * mỗi chiêu tối đa một ô. Trả sổ MỚI.
 */
export function assignSlot(
  book: SkillBook,
  slot: unknown,
  skillId: unknown,
  realm: number,
): SlotResult {
  if (!isSkillSlot(slot)) return { ok: false, reason: "slot" };
  if (!slotOpen(slot, realm)) return { ok: false, reason: "locked" };
  const slots = [...book.slots] as SkillBook["slots"];
  const idx = LEARNABLE_SLOTS.indexOf(slot);
  if (skillId === "") {
    slots[idx] = "";
    return { ok: true, book: { learned: { ...book.learned }, slots, ...keepMastery(book) } };
  }
  const def = skillOf(skillId);
  if (!def) return { ok: false, reason: "unknown" };
  if (!Object.prototype.hasOwnProperty.call(book.learned, def.id))
    return { ok: false, reason: "notLearned" };
  for (let i = 0; i < slots.length; i++) if (slots[i] === def.id) slots[i] = "";
  slots[idx] = def.id;
  return { ok: true, book: { learned: { ...book.learned }, slots, ...keepMastery(book) } };
}

// ---------------------------------------------------------------------------------------------------------------
// Tin nhắn
// ---------------------------------------------------------------------------------------------------------------

/** Client -> server: dùng chiêu ở ô `slot` (2..5) theo hướng `angle` (rad). Server kiểm hồi chiêu, linh lực, ô đã mở, đã gắn chiêu. */
export interface CastMsg {
  slot: SkillSlot;
  angle: number;
}

/** Client -> server: gắn chiêu `skillId` vào ô `slot` ("" = gỡ). */
export interface SkillSlotMsg {
  slot: SkillSlot;
  skillId: string;
}

/** Tên các tin nhắn của chiêu thức (MỘT nơi, như `DUEL_MSG` / `DUNGEON_MSG` / `SECT_MSG`): client và server không tự gõ chuỗi. */
export const SKILL_MSG = {
  /** client -> server: dùng chiêu (`CastMsg`) */
  cast: "cast",
  /** client -> server: gắn chiêu vào ô (`SkillSlotMsg`) */
  slot: "skillSlot",
  /** server -> chủ: sổ chiêu + hồi chiêu (`SkillsMsg`) */
  skills: "skills",
  /** server -> chủ: trạng thái của CHÍNH MÌNH (`StatusMsg`) */
  status: "status",
} as const;

/**
 * Server -> chủ (không vào state chung): sổ chiêu + hồi chiêu của bốn ô 2-5. Gửi khi đổi và định kỳ, không mỗi tick; client tự đếm lùi `cd`
 * giữa hai lần gửi.
 */
export interface SkillsMsg {
  learned: Record<string, number>;
  slots: [string, string, string, string];
  /** Hồi chiêu còn lại của ô 2-5 (ms, >= 0) */
  cd: [number, number, number, number];
  /**
   * TỔNG hồi chiêu của ô 2-5 (ms; 0 = ô trống) sau tầng chiêu và giảm hồi chiêu của trang bị (`skillCooldownMs`): client chia `cd / cdMax`
   * để vẽ vòng hồi chiêu mà không cần biết `cdr`.
   */
  cdMax: [number, number, number, number];
  /**
   * ĐIỂM LUYỆN dở dang của chiêu đã học (TUỲ CHỌN, CT5; id -> điểm, như `SkillBook.mastery`): gửi khi mở sổ chiêu, khi lên tầng, tối đa 1 lần / 30 giây; client tự cộng giữa hai lần gửi CHỈ để
   * hiện thanh tiến độ (`masteryNeedOf` cho mẫu số). Client cũ bỏ qua trường lạ.
   */
  mastery?: Record<string, number>;
}

/**
 * Một trạng thái đang có trên chính mình: id, thời gian còn lại (ms) lúc gửi, và `ratio` (KHÔNG bắt buộc) CHỈ cho tăng tốc / tê cóng (đổi tốc độ di chuyển mà client đoán trước,
 * nên client cần cường độ để nhân đúng như server, `moveSpeedMul`) và hộ đạo / phù (`breakAid` / `amp` / `cdr`, client hiện "+X %" trên chip). Loại khác bỏ trống phần tử thứ ba
 * (mã tách `[id, ms]` cũ không vỡ). Nơi nhận không tin tin nhắn: dùng `sanitizeStatusList`.
 */
export type StatusEntry = [id: StatusId, msLeft: number, ratio?: number];

/**
 * Trạng thái nào ghi `ratio` trong `StatusEntry`: những cái đổi tốc độ di chuyển của người chơi (client cần để đoán trước di chuyển)
 * và `breakAid` (client hiện "+X %" xác suất đột phá trên chip hộ đạo, #514), `amp` / `cdr` (client hiện "+X %" sát thương / "-X %" hồi chiêu trên chip phù, #514 lát 2).
 */
export function statusCarriesRatio(id: unknown): boolean {
  const def = statusOf(id);
  return (
    def !== undefined &&
    (def.kind === "haste" ||
      def.kind === "slow" ||
      def.kind === "breakAid" ||
      def.kind === "amp" ||
      def.kind === "cdr" ||
      def.kind === "empower")
  );
}

/**
 * Kẹp hiệu ứng trạng thái của vật phẩm (`ItemEffect` kind `status`) theo `STATUSES`: `id` phải là trạng thái CÓ THẬT và CÓ LỢI
 * (vật phẩm không được gắn trạng thái có hại lên người dùng); `ms` làm tròn, trong 1..`maxMs`; `ratio` trong 0..`maxRatio`.
 * Không hợp lệ (id lạ / có hại, số không hữu hạn) trả `null`: máy chủ từ chối dùng, không trừ vật phẩm.
 */
export function clampStatusEffect(e: {
  id: unknown;
  ratio: unknown;
  ms: unknown;
}): { id: StatusId; ratio: number; ms: number } | null {
  const def = statusOf(e.id);
  if (!def || def.harmful || (STATUS_SKILL_ONLY as readonly string[]).includes(def.id)) return null;
  if (typeof e.ms !== "number" || !Number.isFinite(e.ms) || e.ms < 1) return null;
  if (typeof e.ratio !== "number" || !Number.isFinite(e.ratio) || e.ratio < 0) return null;
  return {
    id: def.id,
    ms: Math.min(def.maxMs, Math.round(e.ms)),
    ratio: Math.min(def.maxRatio, e.ratio),
  };
}

/** Hệ số tốc độ di chuyển cho phép (kẹp): không bao giờ đứng yên vì tê cóng, không nhanh quá mức tránh được va chạm / xuyên tường. */
export const MOVE_SPEED_MUL_MIN = 0.4;
export const MOVE_SPEED_MUL_MAX = 1.6;

/**
 * Hệ số nhân tốc độ di chuyển của người chơi từ danh sách trạng thái của CHÍNH MÌNH: `(1 + tăng tốc) x (1 - tê cóng)`, kẹp
 * [`MOVE_SPEED_MUL_MIN`, `MOVE_SPEED_MUL_MAX`]. MỘT hàm cho cả hai phía: server (`applyInputs`) và client (`fixedStep`, `reconcile`) đều nhân
 * `statsFor(...).speed x moveSpeedMul(...)` (như `moveWithCollision` dùng chung), không phía nào tự viết công thức. Bỏ qua mục hết hạn
 * (`msLeft` <= 0 hoặc không hữu hạn), id lạ, `ratio` thiếu / không hữu hạn (coi 0); `ratio` kẹp bằng `maxRatio` của trạng thái. 1 khi không có gì.
 */
export function moveSpeedMul(list: readonly StatusEntry[]): number {
  let m = 1;
  for (const e of list) {
    if (!Array.isArray(e)) continue;
    const def = statusOf(e[0]);
    if (!def || typeof e[1] !== "number" || !(e[1] > 0)) continue;
    if (def.kind !== "haste" && def.kind !== "slow") continue;
    const r = typeof e[2] === "number" && Number.isFinite(e[2]) ? e[2] : 0;
    const ratio = Math.min(def.maxRatio, Math.max(0, r));
    m *= def.kind === "haste" ? 1 + ratio : 1 - ratio;
  }
  return Math.min(MOVE_SPEED_MUL_MAX, Math.max(MOVE_SPEED_MUL_MIN, m));
}

/** `ratio` đã kẹp của mục còn hiệu lực đầu tiên có id `id` và loại `kind` (0 nếu không có / hết hạn / `ratio` hỏng). Dùng chung cho `statusAmpMult` / `statusCdr`. */
function activeRatio(list: readonly StatusEntry[], id: StatusId): number {
  const def = statusOf(id);
  if (!def) return 0;
  let best = 0;
  for (const e of list) {
    if (!Array.isArray(e) || e[0] !== id || typeof e[1] !== "number" || !(e[1] > 0)) continue;
    const r = typeof e[2] === "number" && Number.isFinite(e[2]) ? e[2] : 0;
    best = Math.max(best, Math.min(def.maxRatio, Math.max(0, r)));
  }
  return best;
}

/**
 * Hệ số nhân sát thương GÂY RA của chiêu hệ `element` từ phù `amp_<hệ>` còn hiệu lực trong `list` (danh sách trạng thái của CHÍNH MÌNH):
 * `1 + ratio` (ratio kẹp [0, `maxRatio`]). 1 khi không có phù đó, hệ `none` / lạ, mục hết hạn. MỘT hàm cho máy chủ (tính sát thương) và mọi
 * công cụ (bot, mô hình cân bằng); máy chủ vẫn là người quyết định (client không tính sát thương).
 */
export function statusAmpMult(list: readonly StatusEntry[], element: unknown): number {
  const id = ampStatusIdOf(element);
  return id ? 1 + activeRatio(list, id) : 1;
}

/** Giảm hồi chiêu (0..`maxRatio` của `cdr_phu`, phân số) từ phù `cdr_phu` còn hiệu lực trong `list`; 0 khi không có. Cộng với của trang bị rồi kẹp `CDR_CAP` ở `skillCooldownMs`. */
export function statusCdr(list: readonly StatusEntry[]): number {
  return activeRatio(list, "cdr_phu");
}

/**
 * Hệ số nhân sát thương GÂY RA của MỌI chiêu (không phân hệ, không áp cho đòn thường) từ `empower` còn hiệu lực trong `list` (danh sách của CHÍNH MÌNH): `1 + ratio`
 * (ratio kẹp [0, `EMPOWER_MAX_RATIO`]). 1 khi không có. Nhân CÙNG `statusAmpMult` (hai hệ số nhân với nhau).
 */
export function statusEmpowerMult(list: readonly StatusEntry[]): number {
  return 1 + activeRatio(list, "empower");
}

/**
 * Làm sạch danh sách trạng thái nhận từ server (client không tin tin nhắn, như mọi tin khác): chỉ giữ mục có id trong bảng và `msLeft` hữu hạn > 0
 * (kẹp `maxMs`), `ratio` chỉ giữ cho loại mang ratio (`statusCarriesRatio`: tăng tốc / tê cóng / hộ đạo / phù; kẹp [0, `maxRatio`], thiếu thì 0); mỗi id một lần; tối đa `MAX_STATUSES` mục.
 * Không phải mảng thì rỗng.
 */
export function sanitizeStatusList(raw: unknown): StatusEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: StatusEntry[] = [];
  for (const e of raw) {
    if (!Array.isArray(e)) continue;
    const def = statusOf(e[0]);
    if (!def || out.some((x) => x[0] === def.id)) continue;
    // `windup` (vận khí) KHÔNG tính vào trần `MAX_STATUSES`: luôn nhận được, không đẩy buff khác ra
    const counted = !(STATUS_UNCOUNTED as readonly string[]).includes(def.id);
    if (
      counted &&
      out.filter((x) => !(STATUS_UNCOUNTED as readonly string[]).includes(x[0])).length >=
        MAX_STATUSES
    )
      continue;
    if (typeof e[1] !== "number" || !Number.isFinite(e[1]) || e[1] <= 0) continue;
    const ms = Math.min(def.maxMs, e[1]);
    if (statusCarriesRatio(def.id)) {
      const r = typeof e[2] === "number" && Number.isFinite(e[2]) ? e[2] : 0;
      out.push([def.id, ms, Math.min(def.maxRatio, Math.max(0, r))]);
    } else {
      out.push([def.id, ms]);
    }
  }
  return out;
}

/**
 * Server -> chủ: danh sách trạng thái của CHÍNH MÌNH (huy hiệu + thời gian còn lại, kể cả buff). Gửi (cả danh sách, không mỗi tick) khi có trạng thái
 * thêm / mất / làm mới (kể cả khi `ratio` đổi: chiêu mạnh hơn ghi đè chiêu yếu), khi khiên vơi, và khi NỐI LẠI sau rớt mạng (`Room` mới);
 * client tự đếm lùi. Người khác / quái KHÔNG nhận tin này: quái chỉ có byte công khai `Monster.fx` (`statusMask`).
 * Choáng: client KHÔNG đoán trước và không gửi `input` khi đang choáng; nếu vẫn có input đến thì server tiêu thụ và tăng `lastSeq` (chỉ không di chuyển).
 */
export interface StatusMsg {
  list: StatusEntry[];
}

/**
 * Bit của các trạng thái CÓ HẠI trong byte công khai `Monster.fx` (M7.3; client vẽ biểu tượng lên đầu quái). Thứ tự bit là hằng của hợp đồng
 * để hai phía không tự đánh số; buff (`shield`, `haste`, `regen`) không lên quái nên không có bit. Mục 51 thêm `weaken` = 64 (7 / 8 bit: còn đúng bit 128 cho `root` của đợt 2);
 * DẤU hệ (`mark_<hệ>`, 9 loại) KHÔNG có bit ở đây vì không đủ chỗ: lên đầu quái qua trường riêng `Monster.mark` (`markIndexOf`).
 */
export const STATUS_BIT: Readonly<Partial<Record<StatusId, number>>> = {
  burn: 1,
  poison: 2,
  bleed: 4,
  chill: 8,
  sunder: 16,
  stun: 32,
  weaken: 64,
};

/** Mặt nạ bit (số nguyên 0..127) của các trạng thái có hại trong `ids`; id lạ, buff và DẤU hệ (xem `markIndexOf`) bị bỏ. */
export function statusMask(ids: Iterable<unknown>): number {
  let m = 0;
  for (const id of ids) {
    if (typeof id === "string" && Object.prototype.hasOwnProperty.call(STATUS_BIT, id))
      m |= STATUS_BIT[id as StatusId]!;
  }
  return m;
}

/** Ngược lại: các trạng thái có hại được bật trong `mask` (theo thứ tự bit tăng dần; bit lạ bị bỏ). */
export function statusesOfMask(mask: unknown): StatusId[] {
  if (typeof mask !== "number" || !Number.isInteger(mask) || mask <= 0) return [];
  const out: StatusId[] = [];
  for (const [id, bit] of Object.entries(STATUS_BIT) as [StatusId, number][])
    if (mask & bit) out.push(id);
  return out;
}

const SKILL_ID_MAX = 40;

/** Kiểm tin `cast` đến từ client: đúng kiểu, ô hợp lệ, góc hữu hạn (kẹp về [-2π, 2π]). Sai trả `null`. */
export function parseCast(raw: unknown): CastMsg | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!isSkillSlot(r.slot)) return null;
  if (typeof r.angle !== "number" || !Number.isFinite(r.angle)) return null;
  const a = Math.max(-2 * Math.PI, Math.min(2 * Math.PI, r.angle));
  return { slot: r.slot, angle: a };
}

/** Kiểm tin `skillSlot` đến từ client: ô hợp lệ, `skillId` là chuỗi ngắn (rỗng = gỡ). Chưa kiểm tồn tại / đã học (server làm bằng `assignSlot`). */
export function parseSkillSlot(raw: unknown): SkillSlotMsg | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!isSkillSlot(r.slot)) return null;
  if (typeof r.skillId !== "string" || r.skillId.length > SKILL_ID_MAX) return null;
  return { slot: r.slot, skillId: r.skillId };
}

/** Khắc chân linh (Hoàng Tuyền): giá từng nấc (Duyên) = giữ 1 / 2 / 3 công pháp qua kiếp. Gắn vào `UNLOCKS` ở M7.2 (#503). */
export const ENGRAVE_COSTS: readonly number[] = [40, 100, 220];
export const ENGRAVE_MAX = ENGRAVE_COSTS.length;

/** Làm sạch danh sách chiêu đã khắc vào chân linh: chiêu có trong bảng, không trùng, tối đa `ENGRAVE_MAX`. */
export function sanitizeEngraved(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const id of raw) {
    if (out.length >= ENGRAVE_MAX) break;
    const def = skillOf(id);
    if (def && !out.includes(def.id)) out.push(def.id);
  }
  return out;
}
