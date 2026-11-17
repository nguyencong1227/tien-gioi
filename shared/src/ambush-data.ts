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

/** Văn mẫu thật (E / G nhập; rỗng ở khung). */
export const AMBUSH_SCENES: readonly AmbushScene[] = [];
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
