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

export type StatusId =
  "burn" | "poison" | "bleed" | "chill" | "sunder" | "stun" | "shield" | "haste" | "regen";

/**
 * Loại tác dụng của trạng thái và ý nghĩa của `ratio` ở `SkillEffect`:
 *  - `dot`: sát thương mỗi giây = `ratio` x sát thương gốc của đòn gây ra nó (đốt, độc, chảy máu);
 *  - `slow`: giảm tốc độ di chuyển `ratio` (tê cóng); `vuln`: nhận thêm `ratio` sát thương (vỡ giáp);
 *  - `stun`: không làm gì được (không dùng `ratio`); `shield`: hấp thụ `ratio` x khí huyết tối đa;
 *  - `haste`: tăng tốc độ `ratio`; `regen`: hồi `ratio` x khí huyết tối đa mỗi giây.
 */
export type StatusKind = "dot" | "slow" | "vuln" | "stun" | "shield" | "haste" | "regen";

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

/** Một lượt của nguồn (trò chơi theo lượt) đổi sang thời gian thực. */
export const TURN_MS = 1500;
/** Số trạng thái tối đa trên một mục tiêu; cùng loại thì LÀM MỚI (không cộng dồn). */
export const MAX_STATUSES = 4;
/** Choáng: tối đa 1,2 giây, trùm miễn, sau khi hết thì miễn choáng 3 giây (không choáng liền nhau). */
export const STUN_MAX_MS = 1200;
export const STUN_IMMUNE_MS = 3000;

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
];

export const STATUS_BY_ID: Readonly<Record<string, StatusDef>> = Object.fromEntries(
  STATUSES.map((s) => [s.id, s]),
);

export function statusOf(id: unknown): StatusDef | undefined {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(STATUS_BY_ID, id)
    ? STATUS_BY_ID[id]
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
] as const;
export type SkillFxId = (typeof SKILL_FX_IDS)[number];

export type SkillShape = "cone" | "line" | "fan" | "nova" | "ground" | "dash" | "self";

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
}

const fx = (status: StatusId, turns: number, ratio: number, chance: number): SkillEffect => ({
  status,
  ms: Math.round(turns * TURN_MS),
  ratio,
  chance,
});

/**
 * 12 chiêu đợt 1 (kế hoạch mục 5.3), toàn bộ lấy từ công pháp CÓ chiêu của nguồn (phẩm cấp 1-3). Số là số khởi điểm.
 * Thứ tự = thứ tự hiện ở bảng Công pháp.
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
    desc: "Dồn hàn khí ra đầu ngón tay mà điểm, chỗ trúng đóng một vòng băng trắng. Tu sĩ Bắc Minh truyền ra ngoài từ lâu.",
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
    desc: "Kiếm quyết của kiếm tu Bắc Minh, một kiếm vung ra tách thành trăm mũi như tuyết rơi. Mũi nào cũng nhỏ, nhưng trúng chỗ nào là chỗ đó tê cóng.",
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
];

export const SKILL_BY_ID: Readonly<Record<string, SkillDef>> = Object.fromEntries(
  SKILLS_M7.map((s) => [s.id, s]),
);

/** Tra chiêu theo id không tin được (tin nhắn client, file lưu): id lạ / độc -> `undefined`. */
export function skillOf(id: unknown): SkillDef | undefined {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(SKILL_BY_ID, id)
    ? SKILL_BY_ID[id]
    : undefined;
}

/** Giảm hồi chiêu tối đa từ trang bị (`EquipStats.cdr`, M7.4): 30%. */
export const CDR_CAP = 0.3;

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

/** Tầng học tối đa của một chiêu (học thêm kinh quyển trùng thì +1 tầng). */
export const SKILL_MAX_LEVEL = 3;
/** Mỗi tầng trên tầng 1: +15% sát thương và -8% hồi chiêu (đề xuất, M7.9 chỉnh). */
export const SKILL_LEVEL_DAMAGE = 0.15;
export const SKILL_LEVEL_COOLDOWN = 0.08;

export function skillDamageMult(level: number): number {
  const l = Math.min(SKILL_MAX_LEVEL, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)));
  return 1 + SKILL_LEVEL_DAMAGE * (l - 1);
}

export function skillCooldownMult(level: number): number {
  const l = Math.min(SKILL_MAX_LEVEL, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)));
  return 1 - SKILL_LEVEL_COOLDOWN * (l - 1);
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
}

export function emptySkillBook(): SkillBook {
  return { learned: {}, slots: ["", "", "", ""] };
}

function levelClamp(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v)
    ? Math.min(SKILL_MAX_LEVEL, Math.max(1, Math.floor(v)))
    : 1;
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
    for (const def of SKILLS_M7) {
      if (Object.prototype.hasOwnProperty.call(src, def.id))
        out.learned[def.id] = levelClamp(src[def.id]);
    }
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

export type LearnResult =
  | { ok: true; level: number; book: SkillBook }
  | { ok: false; reason: "unknown" | "realm" | "maxed" };

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
  if (!Number.isFinite(realm) || !Number.isFinite(tier)) return { ok: false, reason: "realm" };
  if (realm < def.reqRealm || (realm === def.reqRealm && tier < def.reqTier))
    return { ok: false, reason: "realm" };
  const cur = Object.prototype.hasOwnProperty.call(book.learned, def.id) ? book.learned[def.id] : 0;
  if (cur >= SKILL_MAX_LEVEL) return { ok: false, reason: "maxed" };
  const next: SkillBook = {
    learned: { ...book.learned, [def.id]: cur + 1 },
    slots: [...book.slots] as SkillBook["slots"],
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
    return { ok: true, book: { learned: { ...book.learned }, slots } };
  }
  const def = skillOf(skillId);
  if (!def) return { ok: false, reason: "unknown" };
  if (!Object.prototype.hasOwnProperty.call(book.learned, def.id))
    return { ok: false, reason: "notLearned" };
  for (let i = 0; i < slots.length; i++) if (slots[i] === def.id) slots[i] = "";
  slots[idx] = def.id;
  return { ok: true, book: { learned: { ...book.learned }, slots } };
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
}

/** Một trạng thái đang có trên chính mình: id và thời gian còn lại (ms) lúc gửi. */
export type StatusEntry = [id: StatusId, msLeft: number];

/**
 * Server -> chủ: danh sách trạng thái của CHÍNH MÌNH (huy hiệu + thời gian còn lại, kể cả buff). Gửi khi có trạng thái thêm / mất (không mỗi tick);
 * client tự đếm lùi. Người khác / quái KHÔNG nhận tin này: quái chỉ có byte công khai `Monster.fx` (`statusMask`).
 */
export interface StatusMsg {
  list: StatusEntry[];
}

/**
 * Bit của các trạng thái CÓ HẠI trong byte công khai `Monster.fx` (M7.3; client vẽ biểu tượng lên đầu quái). Thứ tự bit là hằng của hợp đồng
 * để hai phía không tự đánh số; buff (`shield`, `haste`, `regen`) không lên quái nên không có bit (6 bit: vừa một byte).
 */
export const STATUS_BIT: Readonly<Partial<Record<StatusId, number>>> = {
  burn: 1,
  poison: 2,
  bleed: 4,
  chill: 8,
  sunder: 16,
  stun: 32,
};

/** Mặt nạ bit (số nguyên 0..63) của các trạng thái có hại trong `ids`; id lạ và buff bị bỏ. */
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
