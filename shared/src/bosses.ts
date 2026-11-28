// Khung trùm nhiều chiêu (QUYET_DINH_M3 mục 42, docs/THIET_KE_TRUM.md, issue T1 #870): HỢP ĐỒNG `shared/` giữa client và server.
//
// Mọi chiêu của trùm là DỮ LIỆU (bảng `BOSSES`), không viết mã riêng từng con: bộ thực thi chung ở `server/src/systems/boss.ts` (T2) chọn chiêu, báo trước, đáp đòn,
// chuyển giai đoạn, triệu hồi, cuồng nộ. File này chỉ có kiểu, hằng số, hàm thuần và kiểm dữ liệu; server vẫn quyết định mọi kết quả.
// Công bằng (vì chết = mất kiếp): mọi đòn GÂY SÁT THƯƠNG có báo trước >= `BOSS_MIN_TELEGRAPH_MS` (kể cả khi cuồng nộ), né được bằng di chuyển.
// Giai đoạn là hàm THUẦN của khí huyết (`bossPhaseOf`): client suy ra mốc trên thanh máu từ bảng này, KHÔNG thêm trường vào state.
import { MONSTER_BY_ID, PLAYER_RADIUS } from "./game";
import { STATUS_BY_ID, type Element, type SkillEffect } from "./skills";

// ---------- Hằng số ----------

/** Báo trước tối thiểu (ms) của MỌI đòn gây sát thương: người chơi phải kịp thấy và bước ra khỏi vùng. Cuồng nộ KHÔNG được rút ngắn xuống dưới mức này. */
export const BOSS_MIN_TELEGRAPH_MS = 800;
/** Trúng chỉ khi tâm người chơi cách mép vùng <= `PLAYER_RADIUS` - mức này (px): nghiêng về phía người chơi vì hình vẽ trễ ~100 ms so với máy chủ. */
export const BOSS_HIT_GRACE_PX = 8;
/** Nghỉ tối thiểu (ms) giữa hai lần vận chiêu: không bao giờ hai đòn nặng chồng báo trước, và người chơi có nhịp để uống đan / hồi. */
export const BOSS_MIN_CAST_GAP_MS = 600;
/** Lần vận chiêu đầu sau khi gây hấn phải cách >= mức này (ms). */
export const BOSS_FIRST_CAST_DELAY_MS = 1200;
/** Tiếng gầm khi chuyển giai đoạn (ms): KHÔNG sát thương, trùm đứng yên. */
export const BOSS_PHASE_ROAR_MS = 1500;
/** Trần cứng số quái con đồng thời của MỘT trùm (`BossDef.maxAdds` không vượt mức này). */
export const BOSS_ADDS_CAP = 6;
/**
 * Thời gian giáp tối đa (ms) của MỘT lần dựng (`buff.ms`): trùm không được "bất khả xâm phạm" quá lâu (chết = mất kiếp nên người chơi cần hạ được trùm), và client chỉ vẽ giáp
 * trong khung này (`client/src/boss-bar.ts` bỏ `fx` `bossArmor` có `ms` lớn hơn). `bossViolations` bắt dữ liệu vượt mức.
 */
export const BOSS_ARMOR_MAX_MS = 60_000;
/**
 * Tốc độ (px/giây) của người chơi CHẬM nhất dùng để kiểm "né được": cảnh giới 0, chưa trang bị (`statsFor`: 150 + 8 x cảnh giới + đồ). Chưa tính hiệu ứng làm chậm.
 * Đổi `statsFor` làm tốc độ cơ bản thấp hơn thì sửa cả hằng này (và chạy lại `bossViolations`).
 */
export const BOSS_ESCAPE_SPEED = 150;
/**
 * Phản xạ + độ trễ vẽ / mạng (ms) người chơi cần trước khi bắt đầu bước, tính từ lúc `warn` hiện. 400 = ~200 phản xạ + ~200 trễ: người chơi THẤY ring lúc ~RTT / 2 sau
 * khi máy chủ phát `warn` mà input cuối còn tác dụng phải tới máy chủ ~RTT / 2 trước khi đòn đáp, nên thời gian thực có chỉ còn `telegraphMs - RTT - ~10` (phân tích của B ở
 * #873: 300 chỉ đủ tới RTT ~90 ms, 400 đủ tới ~190 ms, tức 4G thường). Chết = mất kiếp nên nghiêng về người chơi. ĐỀ XUẤT của A (người dùng / D đổi được; mục 8 `THIET_KE_TRUM.md`).
 */
export const BOSS_REACT_MS = 400;

// ---------- Hình chiêu ----------

/**
 * Hình / kiểu của một chiêu. Hình có SÁT THƯƠNG (mọi hình trừ `summon`, `buff`) bắt buộc có báo trước >= `BOSS_MIN_TELEGRAPH_MS`:
 *  - `circleAt`: vòng tròn bán kính `r` rơi tại mục tiêu / người XA nhất / chỗ trùm đứng;
 *  - `ring`: vành khuyên quanh thân, trong `[r0, r]` (giữa `r0` là chỗ an toàn);
 *  - `cone`: nón trước mặt bán kính `r`, góc mở `arc` (radian);  `line`: đường thẳng dài `len` rộng `w`;
 *  - `charge`: lao thẳng dài `len` rộng `w` (đường báo trước là đường lao);
 *  - `rain`: `count` vòng tròn bán kính `r` rơi lần lượt cách nhau `gapMs`, rải trong `spreadPx` quanh mục tiêu; MỖI vòng có báo trước riêng;
 *  - `pull`: kéo người trong vòng `r` vào giữa tối đa `pullPx` rồi nổ bán kính `blastR` (báo trước cả hai vùng);
 *  - `pool`: vũng bán kính `r` để lại `ttlMs`, gây sát thương mỗi `tickMs` (vị trí vũng được báo trước);
 *  - `blink`: trùm dịch chuyển tới điểm đáp rồi nổ bán kính `landR` (báo trước ở điểm đáp);
 *  - `summon` (triệu hồi `count` quái `kind`) và `buff` (giáp: nhận `dmgTakenMult` lần sát thương trong `ms`): không sát thương.
 */
export type BossShape =
  | { t: "circleAt"; at: "target" | "farthest" | "self"; r: number }
  | { t: "ring"; r0: number; r: number }
  | { t: "cone"; r: number; arc: number }
  | { t: "line"; len: number; w: number }
  | { t: "charge"; len: number; w: number }
  | { t: "rain"; r: number; count: number; spreadPx: number; gapMs: number }
  | { t: "pull"; r: number; pullPx: number; blastR: number }
  | { t: "pool"; r: number; ttlMs: number; tickMs: number }
  | { t: "blink"; landR: number }
  | { t: "summon"; kind: string; count: number }
  | { t: "buff"; dmgTakenMult: number; ms: number };

/** Hình có gây sát thương (cần báo trước >= `BOSS_MIN_TELEGRAPH_MS`)? */
export function bossShapeDamages(shape: BossShape): boolean {
  return shape.t !== "summon" && shape.t !== "buff";
}

/** Điều kiện chọn chiêu (đều tuỳ chọn; thiếu = không hạn). */
export interface BossCond {
  /** Khoảng cách tới mục tiêu chính (px) */
  minDist?: number;
  maxDist?: number;
  /** Số người chơi (đang bị nhắm được) trong `BOSS_COND_RADIUS` quanh trùm */
  minTargets?: number;
  maxTargets?: number;
}
/** Bán kính (px) đếm số người quanh trùm cho `BossCond.minTargets` / `maxTargets`. */
export const BOSS_COND_RADIUS = 320;

export interface BossAbility {
  /** Id duy nhất trong một `BossDef` (chữ thường, số, gạch dưới) */
  id: string;
  /** Tên chiêu hiện trên thanh máu trùm (tiếng Việt) */
  name: string;
  shape: BossShape;
  /** Báo trước (ms): từ lúc hiện vùng cảnh báo tới lúc đáp đòn. Chiêu có sát thương >= `BOSS_MIN_TELEGRAPH_MS`. */
  telegraphMs: number;
  /** Thở sau khi đáp đòn (ms): trùm đứng yên, người cận chiến đánh trả */
  recoverMs: number;
  /** Chờ tối thiểu giữa hai lần dùng CHIÊU NÀY (ms), tính từ lúc bắt đầu vận; >= `telegraphMs` + `recoverMs` */
  cooldownMs: number;
  /** Trọng số khi chọn ngẫu nhiên (> 0) */
  weight: number;
  /** Sát thương = `round(atk x giai đoạn.atkMult x dmgMult)`; 0 cho chiêu không sát thương */
  dmgMult: number;
  /** Hệ của vùng cảnh báo (màu); bỏ trống = hệ của trùm */
  element?: Element;
  /** Trạng thái gắn kèm khi trúng (độc, bỏng, tê cóng...: dùng lại hệ trạng thái M7) */
  effect?: SkillEffect;
  cond?: BossCond;
}

/** Hành động chạy MỘT lần khi vào giai đoạn: gọi quái con hoặc dựng giáp (không sát thương). */
export type BossAction = Extract<BossShape, { t: "summon" } | { t: "buff" }>;

export interface BossPhase {
  /** Id giai đoạn (chữ thường, gạch dưới) */
  id: string;
  /**
   * Vào giai đoạn này khi khí huyết < `fromHp` (phân số 0..1 của khí huyết tối đa). Giai đoạn ĐẦU có `fromHp` = 1 (luôn áp dụng); các giai đoạn sau GIẢM DẦN.
   */
  fromHp: number;
  /** Hệ số tốc độ di chuyển, sát thương và hồi chiêu (< 1 = nhanh hơn) của giai đoạn */
  speedMult: number;
  atkMult: number;
  cdMult: number;
  /** Nghỉ giữa hai lần vận chiêu ở giai đoạn này (ms, >= `BOSS_MIN_CAST_GAP_MS`) */
  castGapMs: number;
  /** Id các chiêu dùng được ở giai đoạn này (lấy từ `BossDef.abilities`); chiêu mở ở giai đoạn trước vẫn nằm trong danh sách nếu muốn giữ */
  abilities: string[];
  onEnter?: BossAction[];
}

/** Cuồng nộ (CHỈ trùm bí cảnh): sau `afterMs` có người trong vùng, nhân các hệ số; KHÔNG rút ngắn báo trước dưới `BOSS_MIN_TELEGRAPH_MS`. */
export interface BossEnrage {
  afterMs: number;
  atkMult: number;
  speedMult: number;
  cdMult: number;
}

export interface BossDef {
  /** Id `MonsterKind` có thật và `boss: true` */
  kind: string;
  abilities: BossAbility[];
  phases: BossPhase[];
  enrage?: BossEnrage;
  /** Số quái con đồng thời tối đa (0..`BOSS_ADDS_CAP`) */
  maxAdds: number;
}

// ---------- Hàm thuần dùng chung server / client ----------

/**
 * Chỉ số giai đoạn ứng với phân số khí huyết `hpFrac` (0..1): giai đoạn cuối cùng có `fromHp` > `hpFrac`. Chỉ TĂNG khi khí huyết giảm (hàm đơn điệu); số không hợp lệ
 * (NaN, không phải số) coi là đầy máu = giai đoạn 0; <= 0 là giai đoạn cuối. Client vẽ mốc giai đoạn trên thanh máu từ `bossPhaseMarks`.
 */
export function bossPhaseOf(def: BossDef, hpFrac: unknown): number {
  if (typeof hpFrac !== "number" || Number.isNaN(hpFrac)) return 0;
  let p = 0;
  for (let i = 1; i < def.phases.length; i++) if (hpFrac < def.phases[i]!.fromHp) p = i;
  return p;
}

/** Các mốc phân số khí huyết (giảm dần) mà tại đó đổi giai đoạn: để vẽ vạch trên thanh máu trùm. */
export function bossPhaseMarks(def: BossDef): number[] {
  return def.phases.slice(1).map((ph) => ph.fromHp);
}

// ---------- Dữ liệu ----------

/**
 * DỮ LIỆU TRÙM (T3 #872, `docs/THIET_KE_TRUM.md` mục 6; A viết khi Ornith / GX10 ngừng): bộ chiêu THẬT của bốn trùm Tiên Giới: Xích Mãng (Trúc Cơ), Hắc Giao (Kim Đan, 8 con
 * nên giữ ba chiêu), Thiên Hàn Vương (Nguyên Anh) và Linh Hư Yêu Vương (bí cảnh). TÊN chiêu và con số là của Tiên Giới (viết mới theo ý tưởng của thiết kế, không chép chữ của game
 * nào khác nên không có dòng ở `docs/NGUON_NOI_DUNG.md`). Số là ĐỀ XUẤT: `docs/CAN_BANG.md` mục "Trùm nhiều chiêu" (`server/src/balance/trum.ts`, T5 #874) đo thời gian hạ trùm,
 * sát thương mỗi đòn / khí huyết tối đa (<= 55%) và bot né hoàn hảo; `boss-data-dodge.test.ts` bắt bất kỳ đòn nào làm bot né (phản xạ 400 ms) bị trúng.
 *
 * Quy ước số: `dmgMult` nhân với `atk` của LOÀI (đòn thường), nên trùm đội có `atk` thấp so với bậc người chơi cần `dmgMult` lớn (đòn nặng ~20-30% khí huyết người đúng bậc,
 * Linh Hư Yêu Vương `atk` 16 là "bao máu" nên `dmgMult` 3,5-4,5: đòn nhẹ ~10% khí huyết người bậc 9, trận dài; mô phỏng #874: đội 4 người đứng yên vẫn hạ được, nặng hơn thì người bậc 9 chết hết). Báo trước luôn dư so với giới hạn nhanh của `bossViolations` (r <= 0,15 T - 63; w <= 0,3 T - 126) để bot
 * phản xạ 400 ms luôn thoát. `BOSS_MOVES=on` mới bật bộ chiêu ở bản chạy thật (`World.bossMoves`); không bật thì mọi trùm chạy như cũ.
 */
export const BOSSES: readonly BossDef[] = [
  {
    // XÍCH MÃNG (Trúc Cơ): rắn lớn đỏ, cận chiến + phun độc. Nửa sau gọi hai rắn con (`ran_con`, tối đa 2) và nhanh hơn 15%.
    kind: "mang",
    maxAdds: 2,
    abilities: [
      {
        id: "quat_duoi",
        name: "Quất đuôi",
        shape: { t: "cone", r: 150, arc: (2 * Math.PI) / 3 },
        telegraphMs: 1000,
        recoverMs: 700,
        cooldownMs: 7000,
        weight: 3,
        dmgMult: 2,
        cond: { maxDist: 170 },
      },
      {
        id: "phun_doc",
        name: "Phun độc bủa vũng",
        shape: { t: "pool", r: 68, ttlMs: 5000, tickMs: 1000 },
        telegraphMs: 1000,
        recoverMs: 800,
        cooldownMs: 11000,
        weight: 2,
        dmgMult: 0.5,
        effect: { status: "poison", ms: 4000, ratio: 0.08, chance: 1 },
      },
      {
        id: "cuon_minh",
        name: "Cuộn mình lao tới",
        shape: { t: "charge", len: 320, w: 80 },
        telegraphMs: 900,
        recoverMs: 900,
        cooldownMs: 9000,
        weight: 2,
        dmgMult: 2.4,
        cond: { minDist: 120 },
      },
      {
        id: "goi_ran_con",
        name: "Gọi rắn con",
        shape: { t: "summon", kind: "ran_con", count: 2 },
        telegraphMs: 800,
        recoverMs: 600,
        cooldownMs: 20000,
        weight: 1,
        dmgMult: 0,
      },
    ],
    phases: [
      {
        id: "dau",
        fromHp: 1,
        speedMult: 1,
        atkMult: 1,
        cdMult: 1,
        castGapMs: 1500,
        abilities: ["quat_duoi", "phun_doc", "cuon_minh"],
      },
      {
        id: "nua_sau",
        fromHp: 0.5,
        speedMult: 1.15,
        atkMult: 1,
        cdMult: 0.85,
        castGapMs: 1200,
        abilities: ["quat_duoi", "phun_doc", "cuon_minh", "goi_ran_con"],
        onEnter: [{ t: "summon", kind: "ran_con", count: 2 }],
      },
    ],
  },
  {
    // HẮC GIAO (Kim Đan; tám con ở Âm Sương nên GỌN, ba chiêu): sóng nước theo đường thẳng, vực xoáy kéo vào rồi nổ, vảy giáp thấy được (giảm 40% sát thương nhận 4 giây).
    // Dưới 40% khí huyết: cuồng nộ nhẹ (hồi chiêu x0,7, công +20%).
    kind: "hac_giao",
    maxAdds: 0,
    abilities: [
      {
        id: "song_nuoc",
        name: "Sóng nước xé đường",
        shape: { t: "line", len: 440, w: 110 },
        telegraphMs: 900,
        recoverMs: 700,
        cooldownMs: 8000,
        weight: 3,
        dmgMult: 3,
        element: "thuy",
      },
      {
        id: "vuc_xoay",
        name: "Vực xoáy nuốt người",
        shape: { t: "pull", r: 200, pullPx: 30, blastR: 70 },
        telegraphMs: 1300,
        recoverMs: 900,
        cooldownMs: 14000,
        weight: 2,
        dmgMult: 4,
        element: "thuy",
      },
      {
        id: "vay_giap",
        name: "Vảy giáp hộ thân",
        shape: { t: "buff", dmgTakenMult: 0.6, ms: 4000 },
        telegraphMs: 800,
        recoverMs: 600,
        cooldownMs: 20000,
        weight: 1,
        dmgMult: 0,
      },
    ],
    phases: [
      {
        id: "dau",
        fromHp: 1,
        speedMult: 1,
        atkMult: 1,
        cdMult: 1,
        castGapMs: 1600,
        abilities: ["song_nuoc", "vuc_xoay", "vay_giap"],
      },
      {
        id: "cuong_no",
        fromHp: 0.4,
        speedMult: 1.1,
        atkMult: 1.2,
        cdMult: 0.7,
        castGapMs: 1300,
        abilities: ["song_nuoc", "vuc_xoay", "vay_giap"],
      },
    ],
  },
  {
    // THIÊN HÀN VƯƠNG (Nguyên Anh): giữ lao tới + đập đất; mưa băng (năm vòng rơi lần lượt cách nhau bằng đúng thời gian báo trước, mỗi vòng có báo trước riêng; gap < báo trước thì hai vòng chồng thời gian và cổng bot né bị trúng); vùng băng làm chậm (tê cóng, KHÔNG tường chặn đường).
    // Dưới 50%: hàn khí quanh thân gây tê cóng; dưới 25%: gọi hai Hàn Lang (`han_lang` có sẵn) và nhanh hơn.
    kind: "thien_han_vuong",
    maxAdds: 2,
    abilities: [
      {
        id: "dap_dat",
        name: "Đập đất băng giá",
        shape: { t: "circleAt", at: "self", r: 100 },
        telegraphMs: 1200,
        recoverMs: 900,
        cooldownMs: 8000,
        weight: 2,
        dmgMult: 3.4,
        element: "thuy",
        cond: { maxDist: 170 },
      },
      {
        id: "doi_lao",
        name: "Hàn long lao tới",
        shape: { t: "charge", len: 380, w: 90 },
        telegraphMs: 900,
        recoverMs: 900,
        cooldownMs: 10000,
        weight: 2,
        dmgMult: 3.6,
        element: "thuy",
        cond: { minDist: 140 },
      },
      {
        id: "mua_bang",
        name: "Mưa băng",
        shape: { t: "rain", r: 55, count: 5, spreadPx: 240, gapMs: 900 },
        telegraphMs: 900,
        recoverMs: 800,
        cooldownMs: 13000,
        weight: 3,
        dmgMult: 3,
        element: "bang",
      },
      {
        id: "vung_bang",
        name: "Vùng băng giá",
        shape: { t: "pool", r: 70, ttlMs: 6000, tickMs: 1000 },
        telegraphMs: 1000,
        recoverMs: 800,
        cooldownMs: 12000,
        weight: 2,
        dmgMult: 0.8,
        element: "bang",
        effect: { status: "chill", ms: 3000, ratio: 0.35, chance: 1 },
      },
      {
        id: "han_khi",
        name: "Hàn khí bủa thân",
        shape: { t: "ring", r0: 80, r: 230 },
        telegraphMs: 1200,
        recoverMs: 800,
        cooldownMs: 15000,
        weight: 2,
        dmgMult: 3.5,
        element: "bang",
        effect: { status: "chill", ms: 4000, ratio: 0.4, chance: 1 },
      },
      {
        id: "goi_han_lang",
        name: "Triệu Hàn Lang",
        shape: { t: "summon", kind: "han_lang", count: 2 },
        telegraphMs: 800,
        recoverMs: 600,
        cooldownMs: 25000,
        weight: 1,
        dmgMult: 0,
      },
    ],
    phases: [
      {
        id: "dau",
        fromHp: 1,
        speedMult: 1,
        atkMult: 1,
        cdMult: 1,
        castGapMs: 1500,
        abilities: ["dap_dat", "doi_lao", "mua_bang", "vung_bang"],
      },
      {
        id: "han_khi",
        fromHp: 0.5,
        speedMult: 1,
        atkMult: 1.1,
        cdMult: 0.9,
        castGapMs: 1300,
        abilities: ["dap_dat", "doi_lao", "mua_bang", "vung_bang", "han_khi"],
      },
      {
        id: "bay_soi",
        fromHp: 0.25,
        speedMult: 1.1,
        atkMult: 1.2,
        cdMult: 0.8,
        castGapMs: 1200,
        abilities: ["dap_dat", "doi_lao", "mua_bang", "vung_bang", "han_khi", "goi_han_lang"],
        onEnter: [{ t: "summon", kind: "han_lang", count: 2 }],
      },
    ],
  },
  {
    // LINH HƯ YÊU VƯƠNG (bí cảnh, đội): bao máu (`atk` 16) nên `dmgMult` lớn. Ba giai đoạn (100 - 70 - 35): vòng nổ yêu khí buộc tản ra (vành khuyên, giữa an toàn), đòn nhắm người XA nhất;
    // từ 70%: dịch chuyển chớp (báo trước ở điểm đáp); từ 35%: phân thân (`phan_than_yeu_vuong`, tối đa 3; hành vi NỔ của phân thân là việc của server T2, chưa có), công +15%.
    // Cuồng nộ sau 5 phút (công x1,5, nhanh x1,2, hồi chiêu x0,7): báo trước VẪN >= 800 ms.
    kind: "yeu_vuong",
    maxAdds: 3,
    abilities: [
      {
        id: "vong_no",
        name: "Vòng nổ yêu khí",
        shape: { t: "ring", r0: 70, r: 230 },
        telegraphMs: 1100,
        recoverMs: 800,
        cooldownMs: 9000,
        weight: 3,
        dmgMult: 3.5,
        element: "am",
      },
      {
        id: "truy_kich",
        name: "Truy kích kẻ đứng xa",
        shape: { t: "circleAt", at: "farthest", r: 70 },
        telegraphMs: 1000,
        recoverMs: 700,
        cooldownMs: 9000,
        weight: 2,
        dmgMult: 4.5,
        element: "am",
      },
      {
        id: "chop_den",
        name: "Dịch chuyển chớp",
        shape: { t: "blink", landR: 95 },
        telegraphMs: 1200,
        recoverMs: 900,
        cooldownMs: 12000,
        weight: 2,
        dmgMult: 4,
        element: "am",
      },
      {
        id: "phan_than",
        name: "Phân thân huyễn ảnh",
        shape: { t: "summon", kind: "phan_than_yeu_vuong", count: 2 },
        telegraphMs: 800,
        recoverMs: 600,
        cooldownMs: 20000,
        weight: 1,
        dmgMult: 0,
      },
    ],
    phases: [
      {
        id: "mo_man",
        fromHp: 1,
        speedMult: 1,
        atkMult: 1,
        cdMult: 1,
        castGapMs: 1800,
        abilities: ["vong_no", "truy_kich"],
      },
      {
        id: "chop_den",
        fromHp: 0.7,
        speedMult: 1,
        atkMult: 1,
        cdMult: 0.9,
        castGapMs: 1500,
        abilities: ["vong_no", "truy_kich", "chop_den"],
      },
      {
        id: "phan_than",
        fromHp: 0.35,
        speedMult: 1.05,
        atkMult: 1.15,
        cdMult: 0.8,
        castGapMs: 1300,
        abilities: ["vong_no", "truy_kich", "chop_den", "phan_than"],
        onEnter: [{ t: "summon", kind: "phan_than_yeu_vuong", count: 2 }],
      },
    ],
    enrage: { afterMs: 300_000, atkMult: 1.5, speedMult: 1.2, cdMult: 0.7 },
  },
  {
    // THANH XÀ (Lạc Hà, trùm CẦM ĐƯỜNG Luyện Khí; CD5 #1065): rắn xanh, trùm NHỎ một giai đoạn, hai chiêu báo trước đầy đủ (né được), KHÔNG triệu hồi con.
    // Số là ĐỀ XUẤT khởi đầu: đo bằng `server/src/balance/chan-duong.ts` (docs/CAN_BANG.md mục "Chặn đường") — người bậc 7 mặc đồ tốt nhất chỉ đánh thường, thắng >= 60%
    // và chết <= 5% ở giả định thận trọng (2 đan + đồ đúng bậc). Nếu lệch thì chỉnh `atk` / `dmgMult` / `cooldownMs`, KHÔNG nới khung báo trước.
    kind: "thanh_xa",
    maxAdds: 0,
    abilities: [
      {
        id: "quat_duoi",
        name: "Quật đuôi",
        shape: { t: "cone", r: 140, arc: (2 * Math.PI) / 3 },
        telegraphMs: 1000,
        recoverMs: 700,
        cooldownMs: 7000,
        weight: 3,
        dmgMult: 1.7,
        cond: { maxDist: 170 },
      },
      {
        id: "xau_xa",
        name: "Xà xung lao tới",
        shape: { t: "charge", len: 300, w: 76 },
        telegraphMs: 900,
        recoverMs: 900,
        cooldownMs: 9000,
        weight: 2,
        dmgMult: 2,
        cond: { minDist: 120 },
      },
    ],
    phases: [
      {
        id: "dau",
        fromHp: 1,
        speedMult: 1,
        atkMult: 1,
        cdMult: 1,
        castGapMs: 1500,
        abilities: ["quat_duoi", "xau_xa"],
      },
    ],
  },
  {
    // LANG VƯƠNG (Lang Hoang, trùm NHỎ, D1 #1466 lát B): thủ lĩnh Lang Lĩnh, một giai đoạn, ba chiêu báo trước đầy đủ (né được), KHÔNG triệu hồi. Bãi của đội 2-4 người; đứng trước Thiên Lang Vương.
    // Số là ĐỀ XUẤT khởi đầu: đo bằng `server/src/balance/trum.ts` (docs/CAN_BANG.md mục "Trùm nhiều chiêu"); lệch thì chỉnh `dmgMult` / `cooldownMs`, KHÔNG nới khung báo trước.
    kind: "lang_vuong",
    maxAdds: 0,
    abilities: [
      {
        id: "xe_nat",
        name: "Xé nát",
        shape: { t: "cone", r: 150, arc: (2 * Math.PI) / 3 },
        telegraphMs: 1000,
        recoverMs: 800,
        cooldownMs: 7500,
        weight: 3,
        dmgMult: 3.4,
        element: "hoa",
        cond: { maxDist: 180 },
      },
      {
        id: "lao_toi",
        name: "Lang Vương lao tới",
        shape: { t: "charge", len: 360, w: 85 },
        telegraphMs: 900,
        recoverMs: 900,
        cooldownMs: 9500,
        weight: 2,
        dmgMult: 3.6,
        element: "hoa",
        cond: { minDist: 130 },
      },
      {
        id: "tieng_hu",
        name: "Tiếng hú Lang Lĩnh",
        shape: { t: "ring", r0: 60, r: 220 },
        telegraphMs: 1200,
        recoverMs: 800,
        cooldownMs: 13000,
        weight: 2,
        dmgMult: 3,
        element: "phong",
      },
    ],
    phases: [
      {
        id: "dau",
        fromHp: 1,
        speedMult: 1,
        atkMult: 1,
        cdMult: 1,
        castGapMs: 1500,
        abilities: ["xe_nat", "lao_toi", "tieng_hu"],
      },
    ],
    enrage: { afterMs: 300_000, atkMult: 1.5, speedMult: 1.2, cdMult: 0.7 },
  },
  {
    // THIÊN LANG VƯƠNG (Lang Hoang, trùm chương 5, D1 #1466 lát B): chúa Lang Hoang lẫn Lang Lĩnh. Xé nát (nón) + Phệ nguyệt (lao, chảy máu) + Thiên Lang Khiếu (vành khuyên, choáng ngắn) + Vũng huyết nguyệt;
    // từ 60 %: Mưa vuốt trăng (năm vòng rơi lần lượt cách nhau đúng thời gian báo trước); từ 35 %: gọi hai Ngân Nguyệt Lang (quái con không rơi đồ / tu vi), nhanh và mạnh hơn. Cuồng nộ sau 5 phút. Bãi của đội 3-4 người (KHUNG mục 4.1: máu 221.030).
    // Chiêu "Yêu huyết tái sinh" (hồi máu) của nguồn CHƯA có hình trong khung chiêu trùm: để dành, không làm thay bằng chiêu khác.
    kind: "thien_lang_vuong",
    maxAdds: 2,
    abilities: [
      {
        id: "xe_nat",
        name: "Xé nát",
        shape: { t: "cone", r: 150, arc: (2 * Math.PI) / 3 },
        telegraphMs: 1000,
        recoverMs: 800,
        cooldownMs: 7000,
        weight: 3,
        dmgMult: 3.5,
        element: "phong",
        cond: { maxDist: 190 },
      },
      {
        id: "phe_nguyet",
        name: "Phệ nguyệt",
        shape: { t: "charge", len: 420, w: 90 },
        telegraphMs: 900,
        recoverMs: 900,
        cooldownMs: 9500,
        weight: 2,
        dmgMult: 3.8,
        element: "phong",
        effect: { status: "bleed", ms: 4000, ratio: 0.06, chance: 0.6 },
        cond: { minDist: 140 },
      },
      {
        id: "lang_khieu",
        name: "Thiên Lang Khiếu",
        shape: { t: "ring", r0: 70, r: 250 },
        telegraphMs: 1200,
        recoverMs: 800,
        cooldownMs: 14000,
        weight: 2,
        dmgMult: 3.2,
        element: "phong",
        effect: { status: "stun", ms: 600, ratio: 0, chance: 1 },
      },
      {
        id: "vung_huyet",
        name: "Vũng huyết nguyệt",
        shape: { t: "pool", r: 70, ttlMs: 6000, tickMs: 1000 },
        telegraphMs: 1000,
        recoverMs: 800,
        cooldownMs: 12000,
        weight: 2,
        dmgMult: 0.8,
        element: "hoa",
        effect: { status: "bleed", ms: 3000, ratio: 0.05, chance: 1 },
      },
      {
        id: "mua_vuot",
        name: "Mưa vuốt trăng",
        shape: { t: "rain", r: 55, count: 5, spreadPx: 240, gapMs: 900 },
        telegraphMs: 900,
        recoverMs: 800,
        cooldownMs: 13000,
        weight: 3,
        dmgMult: 2.8,
        element: "phong",
      },
      {
        id: "goi_ngan_nguyet",
        name: "Triệu Ngân Nguyệt Lang",
        shape: { t: "summon", kind: "ngan_nguyet_lang", count: 2 },
        telegraphMs: 800,
        recoverMs: 600,
        cooldownMs: 25000,
        weight: 1,
        dmgMult: 0,
      },
    ],
    phases: [
      {
        id: "dau",
        fromHp: 1,
        speedMult: 1,
        atkMult: 1,
        cdMult: 1,
        castGapMs: 1500,
        abilities: ["xe_nat", "phe_nguyet", "lang_khieu", "vung_huyet"],
      },
      {
        id: "mua_vuot",
        fromHp: 0.6,
        speedMult: 1,
        atkMult: 1.1,
        cdMult: 0.9,
        castGapMs: 1300,
        abilities: ["xe_nat", "phe_nguyet", "lang_khieu", "vung_huyet", "mua_vuot"],
      },
      {
        id: "bay_lang",
        fromHp: 0.35,
        speedMult: 1.1,
        atkMult: 1.2,
        cdMult: 0.8,
        castGapMs: 1200,
        abilities: [
          "xe_nat",
          "phe_nguyet",
          "lang_khieu",
          "vung_huyet",
          "mua_vuot",
          "goi_ngan_nguyet",
        ],
        onEnter: [{ t: "summon", kind: "ngan_nguyet_lang", count: 2 }],
      },
    ],
    enrage: { afterMs: 300_000, atkMult: 1.5, speedMult: 1.2, cdMult: 0.7 },
  },
  {
    // HUYẾT HẢI LÃO MA (Uy Vân Kinh, trùm NHỎ, D1 #1466 lát E chương 6): ma tu đổi ba thân xác, một giai đoạn, ba chiêu báo trước đầy đủ (né được), KHÔNG triệu hồi. Bãi của đội 2-4 người; đứng trước Huyết Ma Hộ Pháp.
    // Chiêu của nguồn: huyết ảnh đoạt mệnh (đòn nặng, báo trước) -> lao tới; thần thức trấn áp (khống chế ngắn) -> vành khuyên choáng; huyết tế -> vũng huyết gây chảy máu (chiêu HỒI của nguồn chưa có hình trong khung chiêu trùm: để dành).
    // Số là ĐỀ XUẤT khởi đầu: đo bằng `server/src/balance/trum.ts`; lệch thì chỉnh `dmgMult` / `cooldownMs`, KHÔNG nới khung báo trước.
    kind: "huyet_hai_lao_ma",
    maxAdds: 0,
    abilities: [
      {
        id: "doat_menh",
        name: "Huyết ảnh đoạt mệnh",
        shape: { t: "charge", len: 360, w: 85 },
        telegraphMs: 1000,
        recoverMs: 900,
        cooldownMs: 9000,
        weight: 3,
        dmgMult: 3.7,
        element: "am",
        cond: { minDist: 120 },
      },
      {
        id: "than_thuc",
        name: "Thần thức trấn áp",
        shape: { t: "ring", r0: 60, r: 230 },
        telegraphMs: 1200,
        recoverMs: 800,
        cooldownMs: 14000,
        weight: 2,
        dmgMult: 2.8,
        element: "am",
        effect: { status: "stun", ms: 500, ratio: 0, chance: 1 },
      },
      {
        id: "huyet_te",
        name: "Huyết tế",
        shape: { t: "pool", r: 70, ttlMs: 6000, tickMs: 1000 },
        telegraphMs: 1000,
        recoverMs: 800,
        cooldownMs: 12000,
        weight: 2,
        dmgMult: 0.8,
        element: "am",
        effect: { status: "bleed", ms: 3000, ratio: 0.05, chance: 1 },
      },
    ],
    phases: [
      {
        id: "dau",
        fromHp: 1,
        speedMult: 1,
        atkMult: 1,
        cdMult: 1,
        castGapMs: 1500,
        abilities: ["doat_menh", "than_thuc", "huyet_te"],
      },
    ],
    enrage: { afterMs: 300_000, atkMult: 1.5, speedMult: 1.2, cdMult: 0.7 },
  },
  {
    // HUYẾT MA HỘ PHÁP (Uy Vân Kinh, trùm chương 6, D1 #1466 lát E chương 6): Hóa Thần ngồi sau tông chủ, giữ điện huyết trận. Phế huyết trảo (nón, chảy máu) + Hộ Pháp lao tới + Huyết ảnh đoạt mệnh (vành khuyên nặng) + Huyết trì (vũng chảy máu);
    // từ 60 %: Huyết vũ phiêu linh (năm vòng rơi lần lượt cách nhau đúng thời gian báo trước); từ 35 %: gọi hai Ngạ Quỷ (quái con không rơi đồ / tu vi), nhanh và mạnh hơn. Cuồng nộ sau 5 phút như mọi trùm.
    // Chiêu "huyết tế" (hồi bằng thứ hút được) của nguồn CHƯA có hình trong khung chiêu trùm: để dành, không làm thay bằng chiêu khác.
    kind: "huyet_ma_ho_phap",
    maxAdds: 2,
    abilities: [
      {
        id: "phe_huyet_trao",
        name: "Phế huyết trảo",
        shape: { t: "cone", r: 150, arc: (2 * Math.PI) / 3 },
        telegraphMs: 1000,
        recoverMs: 800,
        cooldownMs: 7000,
        weight: 3,
        dmgMult: 3.5,
        element: "hoa",
        effect: { status: "bleed", ms: 3000, ratio: 0.05, chance: 0.5 },
        cond: { maxDist: 190 },
      },
      {
        id: "lao_toi",
        name: "Hộ Pháp lao tới",
        shape: { t: "charge", len: 420, w: 90 },
        telegraphMs: 900,
        recoverMs: 900,
        cooldownMs: 9500,
        weight: 2,
        dmgMult: 3.8,
        element: "hoa",
        cond: { minDist: 140 },
      },
      {
        id: "doat_menh",
        name: "Huyết ảnh đoạt mệnh",
        shape: { t: "ring", r0: 70, r: 250 },
        telegraphMs: 1200,
        recoverMs: 800,
        cooldownMs: 14000,
        weight: 2,
        dmgMult: 3.4,
        element: "hoa",
      },
      {
        id: "huyet_tri",
        name: "Huyết trì",
        shape: { t: "pool", r: 70, ttlMs: 6000, tickMs: 1000 },
        telegraphMs: 1000,
        recoverMs: 800,
        cooldownMs: 12000,
        weight: 2,
        dmgMult: 0.8,
        element: "hoa",
        effect: { status: "bleed", ms: 3000, ratio: 0.05, chance: 1 },
      },
      {
        id: "huyet_vu",
        name: "Huyết vũ phiêu linh",
        shape: { t: "rain", r: 55, count: 5, spreadPx: 240, gapMs: 900 },
        telegraphMs: 900,
        recoverMs: 800,
        cooldownMs: 13000,
        weight: 3,
        dmgMult: 2.8,
        element: "hoa",
      },
      {
        id: "goi_nga_quy",
        name: "Triệu Ngạ Quỷ",
        shape: { t: "summon", kind: "nga_quy", count: 2 },
        telegraphMs: 800,
        recoverMs: 600,
        cooldownMs: 25000,
        weight: 1,
        dmgMult: 0,
      },
    ],
    phases: [
      {
        id: "dau",
        fromHp: 1,
        speedMult: 1,
        atkMult: 1,
        cdMult: 1,
        castGapMs: 1500,
        abilities: ["phe_huyet_trao", "lao_toi", "doat_menh", "huyet_tri"],
      },
      {
        id: "huyet_vu",
        fromHp: 0.6,
        speedMult: 1,
        atkMult: 1.1,
        cdMult: 0.9,
        castGapMs: 1300,
        abilities: ["phe_huyet_trao", "lao_toi", "doat_menh", "huyet_tri", "huyet_vu"],
      },
      {
        id: "bay_quy",
        fromHp: 0.35,
        speedMult: 1.1,
        atkMult: 1.2,
        cdMult: 0.8,
        castGapMs: 1200,
        abilities: [
          "phe_huyet_trao",
          "lao_toi",
          "doat_menh",
          "huyet_tri",
          "huyet_vu",
          "goi_nga_quy",
        ],
        onEnter: [{ t: "summon", kind: "nga_quy", count: 2 }],
      },
    ],
    enrage: { afterMs: 300_000, atkMult: 1.5, speedMult: 1.2, cdMult: 0.7 },
  },
];

export const BOSS_BY_KIND: Readonly<Record<string, BossDef>> = Object.fromEntries(
  BOSSES.map((b) => [b.kind, b]),
);

/** Định nghĩa trùm của `kind` (tra bằng `hasOwnProperty`, không bằng `[]`); `undefined` nếu không có. */
export function bossDefOf(kind: unknown): BossDef | undefined {
  return typeof kind === "string" && Object.prototype.hasOwnProperty.call(BOSS_BY_KIND, kind)
    ? BOSS_BY_KIND[kind]
    : undefined;
}

// ---------- Kiểm dữ liệu (D / E / F dùng; test của `shared/` gọi với `BOSSES`) ----------

const ID_RE = /^[a-z0-9_]+$/;
const pos = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

function shapeProblems(s: BossShape): string[] {
  const bad: string[] = [];
  switch (s.t) {
    case "circleAt":
      if (!pos(s.r)) bad.push("bán kính r");
      break;
    case "ring":
      if (!pos(s.r) || !(typeof s.r0 === "number" && s.r0 >= 0 && s.r0 < s.r))
        bad.push("vành khuyên r0 < r");
      break;
    case "cone":
      if (!pos(s.r) || !pos(s.arc) || s.arc > 2 * Math.PI) bad.push("nón r / arc");
      break;
    case "line":
    case "charge":
      if (!pos(s.len) || !pos(s.w)) bad.push("len / w");
      break;
    case "rain":
      if (
        !pos(s.r) ||
        !Number.isInteger(s.count) ||
        s.count < 1 ||
        s.count > 12 ||
        !pos(s.spreadPx) ||
        !pos(s.gapMs)
      )
        bad.push("mưa r / count (1-12) / spreadPx / gapMs");
      break;
    case "pull":
      if (!pos(s.r) || !pos(s.pullPx) || !pos(s.blastR)) bad.push("kéo r / pullPx / blastR");
      break;
    case "pool":
      if (!pos(s.r) || !pos(s.ttlMs) || !pos(s.tickMs)) bad.push("vũng r / ttlMs / tickMs");
      break;
    case "blink":
      if (!pos(s.landR)) bad.push("landR");
      break;
    case "summon":
      if (
        !Number.isInteger(s.count) ||
        s.count < 1 ||
        s.count > BOSS_ADDS_CAP ||
        !Object.prototype.hasOwnProperty.call(MONSTER_BY_ID, s.kind)
      )
        bad.push(
          `triệu hồi quái ${String(s.kind)} không có thật hoặc số lượng ngoài 1-${BOSS_ADDS_CAP}`,
        );
      break;
    case "buff":
      if (
        !(typeof s.dmgTakenMult === "number" && s.dmgTakenMult > 0 && s.dmgTakenMult <= 1) ||
        !pos(s.ms) ||
        s.ms > BOSS_ARMOR_MAX_MS
      )
        bad.push("giáp dmgTakenMult (0,1] / ms (<= BOSS_ARMOR_MAX_MS)");
      break;
  }
  return bad;
}

// ---------- Né được bằng di chuyển ----------

/**
 * Quãng đường (px) XẤU NHẤT một người đứng yên phải đi để ra khỏi vùng trúng của `shape`: từ điểm "sâu nhất" trong vùng (tâm vòng tròn, giữa bề rộng vành khuyên / đường
 * lao, trục nón ở chỗ cách đều mép) tới chỗ an toàn gần nhất. `reach` là mức nới của bộ thực thi (`PLAYER_RADIUS` - `BOSS_HIT_GRACE_PX`: tâm người chơi cách mép vùng <= `reach`
 * vẫn trúng) nên người đó phải ra xa thêm chừng ấy. `null` cho hình KHÔNG sát thương (`summon`, `buff`) hoặc số liệu hình không hợp lệ.
 *  - `circleAt`, `pool`, `rain` (mỗi vòng), `blink` (`landR`): `r` + `reach`;
 *  - `ring`: nếu lỗ giữa đủ chứa thân người (`r0` - `reach` >= `PLAYER_RADIUS`) thì chui vào lỗ hoặc ra ngoài, gần hơn: nửa bề rộng vành + `reach`; lỗ nhỏ hơn coi như vòng đặc;
 *  - `cone`: bán kính đường tròn lớn nhất nằm trong hình quạt (nửa góc mở <= 90 độ: `r` sin / (1 + sin); tới 270 độ: `r` / 2; QUÁ 270 độ coi như cả vòng: `r`) + `reach`. Quá 270 độ khoảng khuyết phía sau bị mức nới `reach` bít dần nên thoát thật xa hơn `r` / 2 (đo trên `bossInZone`, r 150: 300 độ 80 px, 340 độ 85, 350 độ 93, 355 độ 110, 359 độ 153; #935);
 *  - `line`, `charge`: bước ngang ra khỏi đường: nửa bề rộng `w` + `reach`;
 *  - `pull`: phải đứng ngoài tầm nổ SAU khi bị kéo: `max(blastR, min(r, blastR + pullPx))` + `reach`.
 */
export function bossEscapePx(
  shape: BossShape,
  reach: number = PLAYER_RADIUS - BOSS_HIT_GRACE_PX,
): number | null {
  if (shapeProblems(shape).length > 0) return null;
  switch (shape.t) {
    case "circleAt":
    case "pool":
    case "rain":
      return shape.r + reach;
    case "blink":
      return shape.landR + reach;
    case "ring":
      return shape.r0 - reach >= PLAYER_RADIUS ? (shape.r - shape.r0) / 2 + reach : shape.r + reach;
    case "cone": {
      if (shape.arc > 1.5 * Math.PI) return shape.r + reach; // quá 270 độ: coi như cả vòng (cận trên an toàn, xem chú thích trên)
      const half = shape.arc / 2;
      if (half >= Math.PI / 2) return shape.r / 2 + reach;
      const s = Math.sin(half);
      return (shape.r * s) / (1 + s) + reach;
    }
    case "line":
    case "charge":
      return shape.w / 2 + reach;
    case "pull":
      return Math.max(shape.blastR, Math.min(shape.r, shape.blastR + shape.pullPx)) + reach;
    case "summon":
    case "buff":
      return null;
  }
}

/** Thời gian (ms) tối thiểu một người đi xa `px` ở tốc độ chậm nhất mà vẫn kịp ra khỏi vùng: phản xạ `BOSS_REACT_MS` + `px` / `BOSS_ESCAPE_SPEED`. */
export function bossEscapeMs(px: number): number {
  return BOSS_REACT_MS + (1000 * px) / BOSS_ESCAPE_SPEED;
}

/**
 * Kiểm bảng trùm: trả danh sách lỗi (rỗng = sạch). Luật công bằng (mục 2 `THIET_KE_TRUM.md`): mọi chiêu có sát thương báo trước >= `BOSS_MIN_TELEGRAPH_MS` VÀ đủ để người đứng yên ở chỗ xấu nhất ra khỏi vùng (`bossEscapePx`, `bossEscapeMs`); nghỉ giữa các lần vận
 * >= `BOSS_MIN_CAST_GAP_MS`; `cooldownMs` >= `telegraphMs` + `recoverMs`. Còn: `kind` có thật và là trùm; id đúng dạng và không trùng; giai đoạn đầu `fromHp` = 1, các giai đoạn sau giảm
 * nghiêm ngặt trong (0, 1); chiêu của giai đoạn có thật; trọng số > 0; hệ số > 0; tổng triệu hồi một lần <= `maxAdds` <= `BOSS_ADDS_CAP`; cuồng nộ hợp lệ.
 */
export function bossViolations(defs: readonly BossDef[] = BOSSES): string[] {
  const bad: string[] = [];
  const kinds = new Set<string>();
  for (const d of defs) {
    const k = String(d.kind);
    if (kinds.has(k)) bad.push(`${k}: trùm trùng`);
    kinds.add(k);
    const mk = Object.prototype.hasOwnProperty.call(MONSTER_BY_ID, k)
      ? MONSTER_BY_ID[k]
      : undefined;
    if (!mk) bad.push(`${k}: không có loài quái này`);
    else if (!mk.boss) bad.push(`${k}: loài quái không phải trùm (boss: true)`);
    if (!Number.isInteger(d.maxAdds) || d.maxAdds < 0 || d.maxAdds > BOSS_ADDS_CAP)
      bad.push(`${k}: maxAdds ngoài 0-${BOSS_ADDS_CAP}`);
    const ids = new Set<string>();
    for (const a of d.abilities) {
      const w = `${k}.${a.id}`;
      if (!ID_RE.test(a.id)) bad.push(`${w}: id chiêu sai dạng`);
      if (ids.has(a.id)) bad.push(`${w}: trùng id chiêu`);
      ids.add(a.id);
      if (!a.name.trim()) bad.push(`${w}: thiếu tên`);
      for (const p of shapeProblems(a.shape)) bad.push(`${w}: ${p}`);
      if (!(typeof a.telegraphMs === "number" && a.telegraphMs >= 0))
        bad.push(`${w}: telegraphMs không hợp lệ`);
      else if (bossShapeDamages(a.shape) && a.telegraphMs < BOSS_MIN_TELEGRAPH_MS)
        bad.push(
          `${w}: báo trước ${a.telegraphMs} ms < ${BOSS_MIN_TELEGRAPH_MS} ms (đòn có sát thương phải báo trước)`,
        );
      else if (bossShapeDamages(a.shape)) {
        // Né được bằng di chuyển (mục 2 `THIET_KE_TRUM.md`): người đứng yên ở chỗ xấu nhất trong vùng vẫn ra kịp trước khi đáp đòn
        const px = bossEscapePx(a.shape);
        if (px !== null && bossEscapeMs(px) > a.telegraphMs)
          bad.push(
            `${w}: không né kịp: cần ${Math.ceil(bossEscapeMs(px))} ms (phản xạ ${BOSS_REACT_MS} + đi ${Math.ceil(px)} px ở ${BOSS_ESCAPE_SPEED} px/giây) > báo trước ${a.telegraphMs} ms; giảm vùng hoặc tăng báo trước`,
          );
      }
      if (!(typeof a.recoverMs === "number" && a.recoverMs >= 0))
        bad.push(`${w}: recoverMs không hợp lệ`);
      if (!(typeof a.cooldownMs === "number") || a.cooldownMs < a.telegraphMs + a.recoverMs)
        bad.push(`${w}: cooldownMs < telegraphMs + recoverMs`);
      if (!pos(a.weight)) bad.push(`${w}: weight phải > 0`);
      if (!(typeof a.dmgMult === "number" && a.dmgMult >= 0))
        bad.push(`${w}: dmgMult không hợp lệ`);
      else if (bossShapeDamages(a.shape) && a.dmgMult <= 0)
        bad.push(`${w}: chiêu sát thương cần dmgMult > 0`);
      if (a.effect && !Object.prototype.hasOwnProperty.call(STATUS_BY_ID, a.effect.status))
        bad.push(`${w}: trạng thái ${a.effect.status} không có thật`);
    }
    if (d.phases.length < 1) bad.push(`${k}: thiếu giai đoạn`);
    let prev = 2;
    d.phases.forEach((ph, i) => {
      const w = `${k}.${ph.id}`;
      if (!ID_RE.test(ph.id)) bad.push(`${w}: id giai đoạn sai dạng`);
      if (i === 0 && ph.fromHp !== 1) bad.push(`${w}: giai đoạn đầu phải có fromHp = 1`);
      if (i > 0 && !(ph.fromHp > 0 && ph.fromHp < 1 && ph.fromHp < prev))
        bad.push(`${w}: fromHp phải giảm nghiêm ngặt trong (0, 1)`);
      prev = ph.fromHp;
      for (const x of [ph.speedMult, ph.atkMult, ph.cdMult])
        if (!pos(x)) bad.push(`${w}: hệ số tốc độ / sát thương / hồi chiêu phải > 0`);
      if (!(typeof ph.castGapMs === "number" && ph.castGapMs >= BOSS_MIN_CAST_GAP_MS))
        bad.push(`${w}: castGapMs < ${BOSS_MIN_CAST_GAP_MS}`);
      if (ph.abilities.length < 1) bad.push(`${w}: không có chiêu nào`);
      for (const id of ph.abilities)
        if (!ids.has(id)) bad.push(`${w}: chiêu ${id} không có trong bảng chiêu`);
      let adds = 0;
      for (const act of ph.onEnter ?? []) {
        for (const p of shapeProblems(act)) bad.push(`${w}.onEnter: ${p}`);
        if (act.t === "summon") adds += act.count;
      }
      if (adds > d.maxAdds) bad.push(`${w}: onEnter triệu hồi ${adds} > maxAdds ${d.maxAdds}`);
    });
    for (const a of d.abilities)
      if (a.shape.t === "summon" && a.shape.count > d.maxAdds)
        bad.push(`${k}.${a.id}: triệu hồi ${a.shape.count} > maxAdds ${d.maxAdds}`);
    if (d.enrage) {
      const e = d.enrage;
      if (!pos(e.afterMs)) bad.push(`${k}: enrage.afterMs phải > 0`);
      for (const x of [e.atkMult, e.speedMult, e.cdMult])
        if (!pos(x)) bad.push(`${k}: hệ số cuồng nộ phải > 0`);
    }
  }
  return bad;
}
