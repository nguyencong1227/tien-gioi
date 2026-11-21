// Dữ liệu GẶP CHẶN ĐƯỜNG (QUYET_DINH_M3 mục 52, docs/THIET_KE_CHAN_DUONG.md mục 8, issue CD1 #1061): khung + luật kiểm. Nội dung do E / G nhập (CD4 #1064, CD5 #1065), số cân bằng
// do D chốt (CD6 #1066). Tệp này KHÔNG chứa nội dung thật (hai mảng rỗng) để D / E / G thêm vào mà không xung đột với hợp đồng.
//
// Nguyên tắc nội dung (AGENTS.md "Asset" nguồn 3): văn mẫu lấy NGUYÊN VĂN từ Vạn Kiếp Tu Tiên (`~/TT/van-kiep-tu-tien-clone`, `content-ClG6Ha-i.json`, KHÔNG `content-zh-*.json`),
// chỉ đoạn tình huống mở đầu; các biến của nguồn thay bằng địa danh / đối tượng của Tiên Giới; không chữ Hán; không nhân vật / tông phái / quốc gia của nguồn.
// Mỗi cảnh một dòng ở `docs/NGUON_NOI_DUNG.md` mục 3 (+ `CREDITS.md` nếu cần) và trường `source` ở đây ghi đường dẫn mục nguồn.
import { MONSTER_BY_ID } from "./game";
import { MAPS } from "./map";
import { realmOfStep } from "./realms";
import { bossDefOf } from "./bosses";
import {
  AMBUSH_FOE_COUNT_MAX,
  AMBUSH_FOE_LEVEL_CAP,
  AMBUSH_TIERS,
  isAmbushTier,
  type AmbushTier,
} from "./ambush";

/** Biến văn mẫu CHO PHÉP (server điền lúc dựng hộp thoại): `{dia_danh}` = tên vùng hoang của bản đồ, `{ke_dich}` = tên kẻ chặn đường. Biến khác là lỗi dữ liệu. */
export const AMBUSH_SCENE_VARS = ["dia_danh", "ke_dich"] as const;
export type AmbushSceneVar = (typeof AMBUSH_SCENE_VARS)[number];

/** Một cảnh chặn đường (văn mẫu). */
export interface AmbushScene {
  /** id ổn định: chữ thường, số, gạch dưới. */
  id: string;
  /** Đoạn tình huống, có thể chứa `{dia_danh}` / `{ke_dich}`. */
  text: string;
  /** Bản đồ (id trong `MAPS`) cảnh này hợp. */
  mapIds: readonly string[];
  /** Mức kẻ địch cảnh này hợp. */
  tiers: readonly AmbushTier[];
  /** Đường dẫn mục nguồn (vd `hoang_da/rung_ram.yaml#ev.hd_rung_cay_thanh_tinh`), để đối chiếu `NGUON_NOI_DUNG.md`. */
  source: string;
}

/** Một bầy kẻ chặn đường. */
export interface AmbushFoeGroup {
  id: string;
  /** Tên hiện ở hộp thoại (vd "Đạo Tặc Đầu Lĩnh"). */
  name: string;
  mapId: string;
  /** Khoảng bậc cảnh giới người chơi (thang `realms.ts`, gồm cả hai đầu) mà bầy này xuất hiện. */
  minStep: number;
  maxStep: number;
  tier: AmbushTier;
  /** Loài + số lượng; tổng số con <= `AMBUSH_FOE_COUNT_MAX`. Mức `leader`: con ĐẦU là kẻ cầm đầu (đúng 1 con, có `BossDef`). */
  foes: readonly { kind: string; count: number }[];
}

/**
 * Văn mẫu thật (CD4 #1064 — E nhập; CD5 #1065 — G nhập bản đồ còn lại). Nguồn: `~/TT/van-kiep-tu-tien-clone`
 * (`site/assets/content-ClG6Ha-i.json`, bản vi), chỉ `text` mở đầu của mục có hiệu ứng `combat`; biến nguồn thay bằng
 * `{dia_danh}` (wildName bản đồ) / nội dung Tiên Giới; không chữ Hán; mỗi cảnh một dòng ở `docs/NGUON_NOI_DUNG.md` mục 3.
 * `tiers` = mức khó cảnh này hợp (normal/elite/leader); kẻ địch thật do `AMBUSH_FOES` định (CD5).
 */
export const AMBUSH_SCENES: readonly AmbushScene[] = [
  // === LẠC HÀ (Vân Mộng Sơn): rừng, sông, núi thấp — Luyện Khí / Trúc Cơ ===
  {
    id: "lac_ha_thuy_tac_chan_song",
    text: 'Lau sậy ven sông Vân Mộng che một chiếc thuyền mui đen, mũi thuyền buộc dây thừng có móc sắt. Gã đầu lĩnh thủy tặc đứng mũi, ném túi bạc lên xuống trong tay: "Hàng để lại, người qua sông thì xuống nước."',
    mapIds: ["lac_ha"],
    tiers: ["normal"],
    source: "/content/encounters/treo_thuong/bat_cuop.yaml#ev.tt_bat_cuop_thuy_tac",
  },
  {
    id: "lac_ha_son_tac_chan_dao",
    text: 'Một sợi thừng gai chăng ngang lối đèo, chùm chuông đồng treo giữa kêu leng keng. Tên sơn tặc ngồi trên tảng đá chặn đầu, rìu gác vai: "Mãi lộ năm mươi linh thạch. Không có thì để lại thứ gì nặng tay."',
    mapIds: ["lac_ha"],
    tiers: ["normal"],
    source: "/content/encounters/ke_dich_nguoi.yaml#ev.kdn_son_tac_chan_deo",
  },
  {
    id: "lac_ha_bay_soi_phai_ai",
    text: "Cách ải nửa ngày đường, khắp sườn Vân Mộng vương xác ngựa trạm, dấu chân sói chồng lên nhau. Sói đầu ngẩng lên tru dài, hai con Hôi Lang vòng ra sau lưng ngươi.",
    mapIds: ["lac_ha"],
    tiers: ["normal"],
    source: "/content/encounters/treo_thuong/tru_yeu.yaml#ev.tt_tru_yeu_lang_bay",
  },
  {
    id: "lac_ha_yeu_chan_deo",
    text: "Lối đèo Vân Mộng rải đầy xương la ngựa, xe hàng đổ nghiêng còn nguyên bao gạo. Con yêu nằm trên mỏm đá chắn giữa đèo, đuôi quét qua quét lại, mắt sáng rọi xuống lối đi.",
    mapIds: ["lac_ha"],
    tiers: ["normal"],
    source: "/content/encounters/treo_thuong/tru_yeu.yaml#ev.tt_tru_yeu_deo_nui",
  },
  {
    id: "lac_ha_rung_thuoc_co_yeu",
    text: 'Gùi thuốc treo trên cành, dây đeo đứt một bên. Người hái thuốc nấp trên cây gọi khẽ: "Nó còn quanh đây, ta nghe tiếng nó thở." Dưới gốc, đất bị cào lên từng rãnh sâu.',
    mapIds: ["lac_ha"],
    tiers: ["normal"],
    source: "/content/encounters/treo_thuong/tru_yeu.yaml#ev.tt_tru_yeu_hai_thuoc",
  },
  {
    id: "lac_ha_huyen_quy_giu_bai",
    text: "Khu đá giữa rừng Vân Mộng hiện ra trong sương, không một ngọn cỏ. Trên bãi, một con rùa đá mai to bằng sân đình nằm chắn lối, đuôi quấn quanh tảng đá, mắt khép hờ.",
    mapIds: ["lac_ha"],
    tiers: ["elite"],
    source: "/content/encounters/than_thu.yaml#ev.than_thu_vu_huyen_quy",
  },
  {
    id: "lac_ha_xa_yeu_doi_le",
    text: "Miếu hoang giữa rừng Vân Mộng để mâm lễ còn tươi: gà luộc, rượu nếp, một đôi giày trẻ con. Dưới tượng thần, vảy yêu lấp lánh, đuôi rắn từ từ quấn lấy lối ra.",
    mapIds: ["lac_ha"],
    tiers: ["elite"],
    source: "/content/encounters/treo_thuong/tru_yeu.yaml#ev.tt_tru_yeu_xa_mieu",
  },
  {
    id: "lac_ha_ta_vat_rung_ua",
    text: "Giữa trưa mà rừng Vân Mộng lạnh như đêm đông, chim chóc bỏ đi hết. Từ bụi cỏ úa vang lên tiếng khóc, khi gần khi xa. Tà vật hiện ra khi ngươi bước thêm một bước.",
    mapIds: ["lac_ha"],
    tiers: ["elite"],
    source: "/content/encounters/treo_thuong/ta_dao.yaml#ev.tt_ta_vat",
  },
  {
    id: "lac_ha_ma_tu_luyen_vac",
    text: "Ở rìa rừng Vân Mộng, bảy cái vạc đá xếp thành vòng, nước trong vạc đỏ sẫm và vẫn còn ấm. Ma tu ngồi giữa vòng, mỗi hơi thở lại kéo một sợi máu từ vạc vào mũi.",
    mapIds: ["lac_ha"],
    tiers: ["elite"],
    source: "/content/encounters/treo_thuong/ta_dao.yaml#ev.tt_ma_tu",
  },
  // === HẮC PHONG (Hắc Phong Cốc): hẻm núi, ải băng, bãi tha ma — Trúc Cơ / Kim Đan ===
  {
    id: "hac_phong_ai_bang_thu_phi",
    text: 'Tường băng chắn ngang đèo Hắc Phong, trên tường cắm giáo thay cờ. Tên thủ ải chìa tay: "Qua ải nộp hai mươi linh thạch. Không có thì ở lại giữ tường một đêm, đêm nay bầy sói tới."',
    mapIds: ["hac_phong"],
    tiers: ["normal"],
    source: "/content/encounters/hoang_da/hoang_nguyen.yaml#ev.hd_bang_ai_bang_thu_phi",
  },
  {
    id: "hac_phong_luu_khau_chan_ai",
    text: 'Toán lưu khấu đóng trại ngoài bãi tha ma giữa Hắc Phong Cốc, đòi ba xe hàng trước khi cho qua. Gã đầu lĩnh run tay rót trà: "Nộp rồi thì cả đoàn chết đói trên đường về."',
    mapIds: ["hac_phong"],
    tiers: ["normal"],
    source: "/content/encounters/ke_dich_nguoi.yaml#ev.kdn_luu_khau_vao_lang",
  },
  {
    id: "hac_phong_bang_truy_na",
    text: "Bảng truy nã ở cổng Hắc Phong vẽ một gương mặt giống ngươi bảy phần, dưới ghi tên kẻ bị truy nã. Chưa đi hết dốc, thợ săn đã chặn trước mặt, câu liêm sắt kéo lê trên đá.",
    mapIds: ["hac_phong"],
    tiers: ["normal"],
    source: "/content/encounters/ke_dich_nguoi.yaml#ev.kdn_bang_truy_na",
  },
  {
    id: "hac_phong_trai_chu_son_trai",
    text: 'Sơn trại trên mỏm đá Hắc Phong Cốc, cổng gỗ treo một hàng sọ trâu. Trại chủ ngồi trên ghế bọc da hổ, cười khẩy khi thấy ngươi đi một mình: "Đường này qua lại phải nộp mạng, hoặc nộp tiền."',
    mapIds: ["hac_phong"],
    tiers: ["elite"],
    source: "/content/encounters/treo_thuong/truy_na.yaml#ev.tt_truy_na_trai_chu",
  },
  {
    id: "hac_phong_giao_canh_mo",
    text: "Giữa vùng nước đen dưới đáy Hắc Phong Cốc, một con giao thủ mộ trồi lên chắn đường. Nó nói tiếng người, giọng cũ như đá: dưới này là mộ, kẻ sống không được qua.",
    mapIds: ["hac_phong"],
    tiers: ["elite"],
    source: "/content/encounters/than_thu.yaml#ev.than_thu_long_giao_canh",
  },
  {
    id: "hac_phong_ma_tu_huyet_tri",
    text: 'Ma tu của một tông phái tà ác giải một xe lồng chật người phàm đi tế huyết trì. Thấy ma khí trên người ngươi, hắn cười, mở cửa lồng: "Đồng đạo cứ chọn một đứa, coi như quà gặp mặt."',
    mapIds: ["hac_phong"],
    tiers: ["elite"],
    source: "/content/encounters/ta_tu.yaml#ev.ta_tu_long_tu",
  },
  {
    id: "hac_phong_thi_tu_dao_mo",
    text: "Bãi mộ lính tuần biên ở Hắc Phong Cốc bị bới tung, bia đá đổ rạp. Thi tu rung chuông đồng, hai cái xác mặc giáp đứng dậy đi theo hắn, tay cầm binh khí rỉ sét.",
    mapIds: ["hac_phong"],
    tiers: ["elite"],
    source: "/content/encounters/treo_thuong/ta_dao.yaml#ev.tt_thi_tu_dao_mo",
  },
  {
    id: "hac_phong_yeu_thu_lang_thang",
    text: "Tiếng gầm vang lên giữa Hắc Phong Cốc. Một con yêu thú lao ra từ lau sậy, mắt đỏ ngầu, hơi thở bốc khói giữa không trung.",
    mapIds: ["hac_phong"],
    tiers: ["elite"],
    source: "/content/encounters/giao_chien.yaml#ev.yeu_thu_lang_thang",
  },
  {
    id: "hac_phong_yeu_vuong_xuan_ba",
    text: "Cả Hắc Phong Cốc không còn một con thú nhỏ: chúng đã bị ăn, hoặc đã chạy. Yêu vương nằm trên đỉnh gò, quanh nó chất túi trữ vật rách của những tu sĩ tới trước ngươi.",
    mapIds: ["hac_phong"],
    tiers: ["leader"],
    source: "/content/encounters/treo_thuong/truy_na.yaml#ev.tt_truy_na_yeu_vuong",
  },
];
/** Bảng kẻ chặn đường thật (G / D nhập; rỗng ở khung). */
export const AMBUSH_FOES: readonly AmbushFoeGroup[] = [];

const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const ID_RE = /^[a-z][a-z0-9_]{0,47}$/;
const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const MAP_IDS: ReadonlySet<string> = new Set(MAPS.map((m) => m.id));

/** Điền `{dia_danh}` / `{ke_dich}` vào văn mẫu. Biến lạ giữ nguyên chữ (`ambushViolations` bắt ở dữ liệu); thuần. */
export function ambushFillScene(
  text: string,
  vars: Readonly<Record<AmbushSceneVar, string>>,
): string {
  return text.replace(/\{([a-z_]+)\}/g, (all, name: string) =>
    (AMBUSH_SCENE_VARS as readonly string[]).includes(name) ? vars[name as AmbushSceneVar] : all,
  );
}

/**
 * Luật kiểm dữ liệu (D / E / G dùng; test của `shared/` gọi với `AMBUSH_SCENES` / `AMBUSH_FOES`). Trả danh sách lỗi (rỗng = hợp lệ).
 * Cảnh: id đúng dạng + duy nhất; `text` 20-600 ký tự, không chữ Hán, chỉ biến cho phép; `mapIds` / `tiers` không rỗng và hợp lệ; `source` không rỗng.
 * Bầy: id đúng dạng + duy nhất; tên 2-40 ký tự không chữ Hán; bản đồ thật; `minStep` <= `maxStep` đều trên thang; mức hợp lệ; số con 1..`AMBUSH_FOE_COUNT_MAX`,
 * loài có thật, `count` nguyên >= 1; mức `leader` có con đầu là đúng 1 con và có `BossDef`.
 */
export function ambushViolations(
  scenes: readonly AmbushScene[] = AMBUSH_SCENES,
  foes: readonly AmbushFoeGroup[] = AMBUSH_FOES,
): string[] {
  const bad: string[] = [];
  const sceneIds = new Set<string>();
  for (const s of scenes) {
    const at = `cảnh ${String(s.id)}`;
    if (typeof s.id !== "string" || !ID_RE.test(s.id)) bad.push(`${at}: id sai dạng`);
    else if (sceneIds.has(s.id)) bad.push(`${at}: trùng id`);
    else sceneIds.add(s.id);
    if (typeof s.text !== "string" || s.text.length < 20 || s.text.length > 600)
      bad.push(`${at}: text phải 20-600 ký tự`);
    else {
      if (CJK_RE.test(s.text)) bad.push(`${at}: text có chữ Hán / chữ lạ`);
      for (const m of s.text.matchAll(/\{([^}]*)\}/g))
        if (!(AMBUSH_SCENE_VARS as readonly string[]).includes(m[1]))
          bad.push(`${at}: biến {${m[1]}} không được phép`);
      if (/[{}]/.test(s.text.replace(/\{[a-z_]+\}/g, ""))) bad.push(`${at}: ngoặc nhọn thừa`);
    }
    if (!Array.isArray(s.mapIds) || s.mapIds.length === 0) bad.push(`${at}: mapIds rỗng`);
    else
      for (const m of s.mapIds)
        if (!MAP_IDS.has(m)) bad.push(`${at}: bản đồ ${String(m)} không có`);
    if (!Array.isArray(s.tiers) || s.tiers.length === 0) bad.push(`${at}: tiers rỗng`);
    else
      for (const t of s.tiers)
        if (!isAmbushTier(t)) bad.push(`${at}: mức ${String(t)} không hợp lệ`);
    if (typeof s.source !== "string" || s.source.trim() === "") bad.push(`${at}: thiếu source`);
  }
  const foeIds = new Set<string>();
  for (const g of foes) {
    const at = `bầy ${String(g.id)}`;
    if (typeof g.id !== "string" || !ID_RE.test(g.id)) bad.push(`${at}: id sai dạng`);
    else if (foeIds.has(g.id)) bad.push(`${at}: trùng id`);
    else foeIds.add(g.id);
    if (typeof g.name !== "string" || g.name.length < 2 || g.name.length > 40)
      bad.push(`${at}: tên phải 2-40 ký tự`);
    else if (CJK_RE.test(g.name)) bad.push(`${at}: tên có chữ Hán / chữ lạ`);
    if (!MAP_IDS.has(g.mapId)) bad.push(`${at}: bản đồ ${String(g.mapId)} không có`);
    if (realmOfStep(g.minStep) === null || realmOfStep(g.maxStep) === null || g.minStep > g.maxStep)
      bad.push(`${at}: khoảng bậc ${String(g.minStep)}..${String(g.maxStep)} không hợp lệ`);
    if (!isAmbushTier(g.tier)) bad.push(`${at}: mức ${String(g.tier)} không hợp lệ`);
    if (!Array.isArray(g.foes) || g.foes.length === 0) {
      bad.push(`${at}: không có kẻ địch`);
      continue;
    }
    let total = 0;
    // Mục 53: kẻ chặn đường KHÔNG mạnh vượt cảnh giới của người chơi (bị hạ = chết thật): cấp loài <= trần của cảnh giới tối thiểu của bầy
    const minRealm = realmOfStep(g.minStep)?.realm;
    const levelCap = minRealm === undefined ? undefined : AMBUSH_FOE_LEVEL_CAP[minRealm];
    for (const f of g.foes) {
      if (typeof f.kind !== "string" || !hasOwn(MONSTER_BY_ID, f.kind))
        bad.push(`${at}: loài ${String(f.kind)} không có`);
      else if (minRealm !== undefined) {
        if (levelCap === undefined)
          bad.push(
            `${at}: cảnh giới ${minRealm} chưa có trần cấp kẻ chặn đường (AMBUSH_FOE_LEVEL_CAP)`,
          );
        else if (MONSTER_BY_ID[f.kind]!.level > levelCap)
          bad.push(
            `${at}: ${f.kind} cấp ${MONSTER_BY_ID[f.kind]!.level} vượt trần ${levelCap} của cảnh giới ${minRealm} (không được mạnh vượt cảnh giới người chơi)`,
          );
      }
      if (!Number.isInteger(f.count) || f.count < 1)
        bad.push(`${at}: count ${String(f.count)} sai`);
      else total += f.count;
    }
    if (total > AMBUSH_FOE_COUNT_MAX)
      bad.push(`${at}: ${total} con vượt trần ${AMBUSH_FOE_COUNT_MAX}`);
    if (g.tier === "leader") {
      const head = g.foes[0];
      if (head.count !== 1) bad.push(`${at}: kẻ cầm đầu phải đúng 1 con`);
      if (bossDefOf(head.kind) === undefined)
        bad.push(`${at}: kẻ cầm đầu ${head.kind} chưa có BossDef`);
    }
  }
  return bad;
}

/**
 * Độ PHỦ (CD10 nghiệm thu, KHÔNG bắt buộc ở từng PR dữ liệu): mỗi (bản đồ, mức) cần >= 1 cảnh và >= 1 bầy, nếu không hộp thoại có nơi không dựng được.
 * Trả danh sách chỗ thiếu (rỗng = đủ).
 */
export function ambushCoverageViolations(
  scenes: readonly AmbushScene[] = AMBUSH_SCENES,
  foes: readonly AmbushFoeGroup[] = AMBUSH_FOES,
  mapIds: readonly string[] = MAPS.map((m) => m.id),
): string[] {
  const bad: string[] = [];
  for (const m of mapIds)
    for (const t of AMBUSH_TIERS) {
      if (!scenes.some((s) => s.mapIds.includes(m) && s.tiers.includes(t)))
        bad.push(`${m} / ${t}: thiếu cảnh`);
      if (!foes.some((g) => g.mapId === m && g.tier === t)) bad.push(`${m} / ${t}: thiếu bầy`);
    }
  return bad;
}
