// Công cụ CHỈ-ĐỌC thống kê tiến độ người chơi (M6.12 - Issue #488).
// Phục vụ theo dõi cân bằng Kim Đan và bãi Xích Mãng sau phát hành v0.2.0 (theo #406 và CAN_BANG mục 10).
// Tuyệt đối CHỈ ĐỌC: không sửa đổi dữ liệu, không kết nối DB bản chạy thật, không in tên hay dữ liệu nhạy cảm.
import { existsSync, lstatSync, readdirSync, readFileSync, createReadStream } from "node:fs";
import zlib from "node:zlib";
import readline from "node:readline";
import path from "node:path";
import { REALMS, realmLabel, stepOf } from "@tien-gioi/shared";
import { simulate } from "../src/balance/simulate";

export const KD_REALM_INDEX = REALMS.findIndex((r) => r.name.toLowerCase().includes("kim đan"));
export const KD_REALM = KD_REALM_INDEX >= 0 ? KD_REALM_INDEX : 3;
export const KD_HAU_KY_TIER = REALMS[KD_REALM]?.tiers.length
  ? REALMS[KD_REALM].tiers.length - 1
  : 2;

export interface PlayerProgressRecord {
  realm: number;
  tier: number;
  playMs: number;
  kills: number;
  bossKills: number;
  mapId: string;
  skillsCount?: number;
  skillsTotalLevels?: number;
  equippedSkillsCount?: number;
}

export function calcStats(numbers: number[]): {
  min: number;
  max: number;
  median: number;
  mean: number;
} {
  if (numbers.length === 0) {
    return { min: 0, max: 0, median: 0, mean: 0 };
  }
  const sorted = [...numbers].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const mean = sum / sorted.length;
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  const median = n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return { min, max, median, mean };
}

/**
 * Giải mã ký tự thoát trong định dạng PostgreSQL COPY (text format).
 * pg_dump nhân đôi dấu \ (\\\\), thoát nháy kép (\\"), tab (\\t), xuống dòng (\\n), v.v.
 */
export function unescapePgCopy(text: string): string {
  if (text === "\\N") return "";
  let out = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\" && i + 1 < text.length) {
      i++;
      const c = text[i];
      switch (c) {
        case "b":
          out += "\b";
          break;
        case "f":
          out += "\f";
          break;
        case "n":
          out += "\n";
          break;
        case "r":
          out += "\r";
          break;
        case "t":
          out += "\t";
          break;
        case "v":
          out += "\v";
          break;
        case "\\":
          out += "\\";
          break;
        default:
          out += c;
          break;
      }
    } else {
      out += text[i];
    }
  }
  return out;
}

/** Làm sạch và trích xuất dữ liệu tiến độ từ record JSON thô. Không lấy tên hoặc trường nhạy cảm. */
export function sanitizeRecord(raw: any): PlayerProgressRecord | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const realm =
    typeof raw.realm === "number" && Number.isFinite(raw.realm)
      ? Math.max(0, Math.floor(raw.realm))
      : 0;
  const tier =
    typeof raw.tier === "number" && Number.isFinite(raw.tier)
      ? Math.max(0, Math.floor(raw.tier))
      : 0;

  // Giới hạn realm và tier trong phạm vi hợp lệ của game
  const clampedRealm = Math.min(realm, REALMS.length - 1);
  const maxTier = REALMS[clampedRealm]?.tiers.length ? REALMS[clampedRealm].tiers.length - 1 : 0;
  const clampedTier = Math.min(tier, maxTier);

  const life = raw.life && typeof raw.life === "object" ? raw.life : {};
  const playMs =
    typeof life.playMs === "number" && Number.isFinite(life.playMs) ? Math.max(0, life.playMs) : 0;
  const kills =
    typeof life.kills === "number" && Number.isFinite(life.kills)
      ? Math.max(0, Math.floor(life.kills))
      : 0;
  const bossKills =
    typeof life.bossKills === "number" && Number.isFinite(life.bossKills)
      ? Math.max(0, Math.floor(life.bossKills))
      : 0;
  const mapId =
    typeof raw.mapId === "string" && raw.mapId.trim().length > 0 ? raw.mapId.trim() : "lac_ha";

  // Thống kê chiêu thức / công pháp đã học (M7.10 #511):
  // Tuyệt đối không lưu / in tên chiêu cụ thể, chỉ đếm số lượng, tổng tầng và số ô đã gắn.
  let skillsCount = 0;
  let skillsTotalLevels = 0;
  let equippedSkillsCount = 0;
  if (raw.skills && typeof raw.skills === "object" && !Array.isArray(raw.skills)) {
    if (
      raw.skills.learned &&
      typeof raw.skills.learned === "object" &&
      !Array.isArray(raw.skills.learned)
    ) {
      for (const lvl of Object.values(raw.skills.learned)) {
        if (typeof lvl === "number" && Number.isFinite(lvl) && lvl > 0) {
          skillsCount++;
          skillsTotalLevels += Math.min(3, Math.max(1, Math.floor(lvl)));
        }
      }
    }
    if (Array.isArray(raw.skills.slots)) {
      for (const s of raw.skills.slots) {
        if (typeof s === "string" && s.trim().length > 0) {
          equippedSkillsCount++;
        }
      }
    }
  }

  return {
    realm: clampedRealm,
    tier: clampedTier,
    playMs,
    kills,
    bossKills,
    mapId,
    skillsCount,
    skillsTotalLevels,
    equippedSkillsCount,
  };
}

/** Đọc tiến độ từ thư mục chứa các file JSON nhân vật */
export async function readDirProgress(dirPath: string): Promise<{
  records: PlayerProgressRecord[];
  corruptedCount: number;
  totalFiles: number;
}> {
  if (!existsSync(dirPath)) {
    throw new Error(`Thư mục không tồn tại: ${dirPath}`);
  }

  const entries = readdirSync(dirPath);
  const jsonFiles = entries.filter((e) => e.endsWith(".json"));
  const records: PlayerProgressRecord[] = [];
  let corruptedCount = 0;

  for (const file of jsonFiles) {
    const fullPath = path.join(dirPath, file);
    try {
      const stat = lstatSync(fullPath);
      if (!stat.isFile()) continue;
      const content = readFileSync(fullPath, "utf8");
      const parsed = JSON.parse(content);
      const rec = sanitizeRecord(parsed);
      if (rec) {
        records.push(rec);
      } else {
        corruptedCount++;
      }
    } catch {
      corruptedCount++;
    }
  }

  return { records, corruptedCount, totalFiles: jsonFiles.length };
}

/** Đọc tiến độ từ tệp backup postgres (.sql hoặc .sql.gz) từ khối COPY public.characters */
export async function readBackupProgress(backupPath: string): Promise<{
  records: PlayerProgressRecord[];
  corruptedCount: number;
  totalRows: number;
}> {
  if (!existsSync(backupPath)) {
    throw new Error(`Tệp sao lưu không tồn tại: ${backupPath}`);
  }

  const fileStream = createReadStream(backupPath);
  const stream = backupPath.endsWith(".gz") ? fileStream.pipe(zlib.createGunzip()) : fileStream;
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let inCopyBlock = false;
  let dataColumnIndex = 2; // Mặc định COPY characters (name_key, name, data, updated_at) -> cột 2
  const records: PlayerProgressRecord[] = [];
  let corruptedCount = 0;
  let totalRows = 0;

  for await (const line of rl) {
    if (!inCopyBlock) {
      if (line.startsWith("COPY public.characters") || line.startsWith("COPY characters")) {
        inCopyBlock = true;
        // Phân tích header COPY để xác định cột data
        const match = line.match(/\(([^)]+)\)/);
        if (match) {
          const cols = match[1].split(",").map((c) => c.trim());
          const idx = cols.indexOf("data");
          if (idx !== -1) dataColumnIndex = idx;
        }
      }
      continue;
    }

    // Kết thúc khối COPY
    if (line === "\\." || line.startsWith("\\.")) {
      break;
    }

    if (!line.trim()) continue;

    totalRows++;
    const parts = line.split("\t");
    if (parts.length <= dataColumnIndex) {
      corruptedCount++;
      continue;
    }

    try {
      const rawJson = unescapePgCopy(parts[dataColumnIndex]);
      const parsed = JSON.parse(rawJson);
      const rec = sanitizeRecord(parsed);
      if (rec) {
        records.push(rec);
      } else {
        corruptedCount++;
      }
    } catch {
      corruptedCount++;
    }
  }

  return { records, corruptedCount, totalRows };
}

export interface OptimalModelMap {
  reachHours: Map<number, number>; // stepOf(realm, tier) -> optimal hours to reach
  finishHours: Map<number, number>; // stepOf(realm, tier) -> optimal hours to finish
  preKdFinishHours: number; // optimal hours to finish realm before Kim Đan (Trúc Cơ)
  kdHauKyReachHours: number; // optimal hours to reach Kim Đan Hậu kỳ
  kdFinishHours: number; // optimal hours to finish all Kim Đan
  kdHauKyThresholdHours: number; // preKdFinishHours + 0.7 * (kdHauKyReachHours - preKdFinishHours)
  postKdThresholdHours: number; // preKdFinishHours + 4.0 (ngưỡng 4 giờ trong Kim Đan theo #406)
}

export function getOptimalModel(): OptimalModelMap {
  const rows = simulate(KD_REALM);
  const reachHours = new Map<number, number>();
  const finishHours = new Map<number, number>();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const s = stepOf(r.realm, r.tier);
    const reachMins = i === 0 ? 0 : rows[i - 1].total;
    reachHours.set(s, reachMins / 60);
    finishHours.set(s, r.total / 60);
  }

  // Cảnh giới trước Kim Đan (Trúc Cơ)
  const preKdRow = rows.filter((r) => r.realm === KD_REALM - 1).at(-1);
  const preKdFinishHours = (preKdRow?.total ?? 171.67) / 60;

  const kdHauKyStep = stepOf(KD_REALM, KD_HAU_KY_TIER);
  const kdHauKyReachHours = reachHours.get(kdHauKyStep) ?? 6.03;
  const kdFinishHours = (rows.at(-1)?.total ?? 498) / 60;

  // Ngưỡng theo #406 và CAN_BANG mục 10:
  // - Hết Kim Đan: preKdFinishHours + 4.0h (~6.86h tích luỹ)
  // - Tới Kim Đan Hậu kỳ: preKdFinishHours + 0.7 * (kdHauKyReachHours - preKdFinishHours) (~5.08h tích luỹ)
  const postKdThresholdHours = preKdFinishHours + 4.0;
  const kdHauKyThresholdHours = preKdFinishHours + 0.7 * (kdHauKyReachHours - preKdFinishHours);

  return {
    reachHours,
    finishHours,
    preKdFinishHours,
    kdHauKyReachHours,
    kdFinishHours,
    kdHauKyThresholdHours,
    postKdThresholdHours,
  };
}

export interface GroupStat {
  realm: number;
  tier: number;
  label: string;
  step: number;
  count: number;
  minHours: number;
  medianHours: number;
  maxHours: number;
  optimalReachHours: number | null;
  ratioToModel: number | null;
  avgKills: number;
  avgBossKills: number;
  avgSkills: number;
  avgEquippedSkills: number;
  mapCounts: Record<string, number>;
}

export interface SkillsOverviewStat {
  playersWithSkillsCount: number;
  percentWithSkills: number;
  skillsPerPlayer: {
    min: number;
    max: number;
    median: number;
    mean: number;
  };
  distribution: {
    zero: number;
    one: number;
    two: number;
    threeOrFour: number;
    fivePlus: number;
  };
  equippedDistribution: {
    zero: number;
    one: number;
    two: number;
    three: number;
    four: number;
  };
}

export interface ProgressReport {
  groups: GroupStat[];
  totalPlayers: number;
  corruptedCount: number;
  kdHauKyCount: number;
  kdHauKyMedianHours: number | null;
  kdHauKyOptReachHours: number;
  kdHauKyThresholdHours: number;
  kdHauKyRatio: number | null;
  postKdCount: number;
  postKdMedianHours: number | null;
  postKdOptHours: number;
  postKdThresholdHours: number;
  postKdRatio: number | null;
  skillsOverview: SkillsOverviewStat;
  verdict: string;
}

export function buildProgressReport(
  records: PlayerProgressRecord[],
  corruptedCount: number,
): ProgressReport {
  const model = getOptimalModel();
  const groupsMap = new Map<
    number,
    { records: PlayerProgressRecord[]; realm: number; tier: number }
  >();

  for (const r of records) {
    const s = stepOf(r.realm, r.tier);
    let g = groupsMap.get(s);
    if (!g) {
      g = { records: [], realm: r.realm, tier: r.tier };
      groupsMap.set(s, g);
    }
    g.records.push(r);
  }

  // Sắp xếp các nhóm theo step tăng dần
  const sortedSteps = Array.from(groupsMap.keys()).sort((a, b) => a - b);
  const groups: GroupStat[] = [];

  for (const s of sortedSteps) {
    const g = groupsMap.get(s)!;
    const count = g.records.length;
    const hours = g.records.map((r) => r.playMs / 3600000);
    const stats = calcStats(hours);

    const totalKills = g.records.reduce((acc, r) => acc + r.kills, 0);
    const totalBossKills = g.records.reduce((acc, r) => acc + r.bossKills, 0);
    const totalSkills = g.records.reduce((acc, r) => acc + (r.skillsCount || 0), 0);
    const totalEquippedSkills = g.records.reduce((acc, r) => acc + (r.equippedSkillsCount || 0), 0);

    const mapCounts: Record<string, number> = {};
    for (const r of g.records) {
      mapCounts[r.mapId] = (mapCounts[r.mapId] ?? 0) + 1;
    }

    const label = realmLabel(g.realm, g.tier);
    const optimalReachHours =
      g.realm > KD_REALM ? model.kdFinishHours : (model.reachHours.get(s) ?? null);

    const ratioToModel =
      optimalReachHours !== null && optimalReachHours > 0 ? stats.median / optimalReachHours : null;

    groups.push({
      realm: g.realm,
      tier: g.tier,
      step: s,
      label,
      count,
      minHours: stats.min,
      medianHours: stats.median,
      maxHours: stats.max,
      optimalReachHours,
      ratioToModel,
      avgKills: totalKills / count,
      avgBossKills: totalBossKills / count,
      avgSkills: totalSkills / count,
      avgEquippedSkills: totalEquippedSkills / count,
      mapCounts,
    });
  }

  // Kim Đan Hậu kỳ
  const kdHauKyRecords = records.filter((r) => r.realm === KD_REALM && r.tier === KD_HAU_KY_TIER);
  const kdHauKyCount = kdHauKyRecords.length;
  let kdHauKyMedianHours: number | null = null;
  let kdHauKyRatio: number | null = null;
  if (kdHauKyCount > 0) {
    const hours = kdHauKyRecords.map((r) => r.playMs / 3600000);
    kdHauKyMedianHours = calcStats(hours).median;
    if (model.kdHauKyReachHours > 0) {
      kdHauKyRatio = kdHauKyMedianHours / model.kdHauKyReachHours;
    }
  }

  // Sau Kim Đan: realm > KD_REALM
  const postKdRecords = records.filter((r) => r.realm > KD_REALM);
  const postKdCount = postKdRecords.length;
  let postKdMedianHours: number | null = null;
  let postKdRatio: number | null = null;
  if (postKdCount > 0) {
    const hours = postKdRecords.map((r) => r.playMs / 3600000);
    postKdMedianHours = calcStats(hours).median;
    if (model.kdFinishHours > 0) {
      postKdRatio = postKdMedianHours / model.kdFinishHours;
    }
  }

  // Đánh giá theo tiêu chí cân bằng (#406, CAN_BANG mục 10)
  // - Nhóm vượt qua Kim Đan: cảnh báo khi tích luỹ < postKdThresholdHours (~6.86h, tương ứng < 4.0h trong Kim Đan)
  // - Nhóm Kim Đan Hậu kỳ: cảnh báo khi tích luỹ < kdHauKyThresholdHours (~5.08h)
  let verdict: string;
  if (postKdCount >= 5 && postKdMedianHours !== null) {
    if (postKdMedianHours < model.postKdThresholdHours) {
      const inKdEst = (postKdMedianHours - model.preKdFinishHours).toFixed(1);
      verdict = `🚨 CẢNH BÁO (QUÁ NHANH): Nhóm vượt qua Kim Đan có trung vị giờ chơi tích luỹ = ${postKdMedianHours.toFixed(1)}h (ước tính ~${inKdEst}h trong Kim Đan, dưới ngưỡng 4.0h theo #406 / mốc tích luỹ ${model.postKdThresholdHours.toFixed(1)}h). Người chơi vượt qua Kim Đan nhanh hơn thiết kế, có dấu hiệu đường tắt cày Xích Mãng. Đề xuất điều chỉnh mật độ / thời gian hồi sinh Xích Mãng ở bản vá kế tiếp.`;
    } else {
      verdict = `Chưa thấy dấu hiệu quá nhanh (cận trên): Nhóm vượt qua Kim Đan có trung vị giờ chơi tích luỹ = ${postKdMedianHours.toFixed(1)}h (cận trên thời gian tới bậc, mốc cảnh báo < ${model.postKdThresholdHours.toFixed(1)}h). Chưa có dấu hiệu bất thường.`;
    }
  } else if (kdHauKyCount >= 5 && kdHauKyMedianHours !== null) {
    if (kdHauKyMedianHours < model.kdHauKyThresholdHours) {
      const inKdEst = (kdHauKyMedianHours - model.preKdFinishHours).toFixed(1);
      verdict = `🚨 CẢNH BÁO (QUÁ NHANH): Trung vị giờ chơi tích luỹ tới Kim Đan Hậu kỳ = ${kdHauKyMedianHours.toFixed(1)}h (ước tính ~${inKdEst}h trong Kim Đan, dưới ngưỡng mốc tích luỹ ${model.kdHauKyThresholdHours.toFixed(1)}h). Người chơi tiến cấp nhanh hơn thiết kế, có dấu hiệu đường tắt cày Xích Mãng theo #406. Đề xuất điều chỉnh mật độ / thời gian hồi sinh Xích Mãng ở bản vá kế tiếp.`;
    } else {
      verdict = `Chưa thấy dấu hiệu quá nhanh (cận trên): Trung vị giờ chơi tích luỹ tới Kim Đan Hậu kỳ = ${kdHauKyMedianHours.toFixed(1)}h (cận trên thời gian tới bậc, mốc cảnh báo < ${model.kdHauKyThresholdHours.toFixed(1)}h). Chưa có dấu hiệu bất thường.`;
    }
  } else if (kdHauKyCount > 0 || postKdCount > 0) {
    const kdPart =
      kdHauKyCount > 0
        ? `${kdHauKyCount} Kim Đan Hậu kỳ (trung vị ${kdHauKyMedianHours!.toFixed(1)}h / mốc cảnh báo < ${model.kdHauKyThresholdHours.toFixed(1)}h)`
        : `0 Kim Đan Hậu kỳ`;
    const postPart =
      postKdCount > 0
        ? `${postKdCount} vượt Kim Đan (trung vị ${postKdMedianHours!.toFixed(1)}h / mốc cảnh báo < ${model.postKdThresholdHours.toFixed(1)}h)`
        : `0 vượt Kim Đan`;
    verdict = `⚠️ THAM KHẢO (chưa đủ mẫu): Ghi nhận ${kdPart}, ${postPart}. Cần ít nhất 5 mẫu cùng nhóm để kết luận tin cậy.`;
  } else {
    verdict = `ℹ️ CHƯA CÓ DỮ LIỆU: Chưa ghi nhận người chơi nào đạt Kim Đan Hậu kỳ hoặc vượt qua Kim Đan trên tập dữ liệu này. Tiếp tục theo dõi các bản sao lưu tiếp theo.`;
  }

  // Thống kê chiêu thức / công pháp đã học (M7.10 #511)
  const allSkillsCounts = records.map((r) => r.skillsCount || 0);
  const skillsStats = calcStats(allSkillsCounts);
  const playersWithSkillsCount = records.filter((r) => (r.skillsCount || 0) > 0).length;
  const percentWithSkills =
    records.length > 0 ? (playersWithSkillsCount / records.length) * 100 : 0;

  const distribution = { zero: 0, one: 0, two: 0, threeOrFour: 0, fivePlus: 0 };
  const equippedDistribution = { zero: 0, one: 0, two: 0, three: 0, four: 0 };

  for (const r of records) {
    const sc = r.skillsCount || 0;
    if (sc === 0) distribution.zero++;
    else if (sc === 1) distribution.one++;
    else if (sc === 2) distribution.two++;
    else if (sc === 3 || sc === 4) distribution.threeOrFour++;
    else distribution.fivePlus++;

    const eq = r.equippedSkillsCount || 0;
    if (eq === 0) equippedDistribution.zero++;
    else if (eq === 1) equippedDistribution.one++;
    else if (eq === 2) equippedDistribution.two++;
    else if (eq === 3) equippedDistribution.three++;
    else equippedDistribution.four++;
  }

  const skillsOverview: SkillsOverviewStat = {
    playersWithSkillsCount,
    percentWithSkills,
    skillsPerPlayer: skillsStats,
    distribution,
    equippedDistribution,
  };

  return {
    groups,
    totalPlayers: records.length,
    corruptedCount,
    kdHauKyCount,
    kdHauKyMedianHours,
    kdHauKyOptReachHours: model.kdHauKyReachHours,
    kdHauKyThresholdHours: model.kdHauKyThresholdHours,
    kdHauKyRatio,
    postKdCount,
    postKdMedianHours,
    postKdOptHours: model.kdFinishHours,
    postKdThresholdHours: model.postKdThresholdHours,
    postKdRatio,
    skillsOverview,
    verdict,
  };
}

export function formatMarkdownReport(report: ProgressReport, sourceDesc: string): string {
  const lines: string[] = [];
  lines.push(`# Báo cáo thống kê tiến độ người chơi (Issue #488)`);
  lines.push(``);
  lines.push(`- **Nguồn dữ liệu:** \`${sourceDesc}\``);
  lines.push(`- **Tổng số nhân vật hợp lệ:** ${report.totalPlayers}`);
  if (report.corruptedCount > 0) {
    lines.push(`- **Số tệp / bản ghi hỏng (bị bỏ qua):** ${report.corruptedCount}`);
  }
  lines.push(`- **Thời gian phân tích:** ${new Date().toISOString()}`);
  lines.push(``);

  lines.push(`## 1. Bảng phân bố tiến độ theo Cảnh giới - Bậc`);
  lines.push(``);
  lines.push(
    `| Cảnh giới - Bậc | Số người | Giờ chơi tích luỹ (Min / Med / Max) | Mô hình tới bậc | Trung vị / Mô hình | Quái hạ TB | Trùm hạ TB | Chiêu / Ô TB | Bản đồ |`,
  );
  lines.push(`|---|---:|---:|---:|---:|---:|---:|---:|---|`);

  if (report.groups.length === 0) {
    lines.push(`| *(Không có dữ liệu)* | 0 | - | - | - | - | - | - | - |`);
  } else {
    for (const g of report.groups) {
      const minStr = g.minHours.toFixed(1);
      const medStr = g.medianHours.toFixed(1);
      const maxStr = g.maxHours.toFixed(1);
      const hoursRange =
        g.count === 1 ? `**${medStr}** h` : `${minStr} / **${medStr}** / ${maxStr} h`;
      const optStr = g.optimalReachHours !== null ? `${g.optimalReachHours.toFixed(1)} h` : "-";
      const ratioStr = g.ratioToModel !== null ? `${g.ratioToModel.toFixed(2)}x` : "-";
      const mapsStr = Object.entries(g.mapCounts)
        .map(([m, c]) => `${m}: ${c}`)
        .join(", ");
      lines.push(
        `| ${g.label} | ${g.count} | ${hoursRange} | ${optStr} | ${ratioStr} | ${g.avgKills.toFixed(0)} | ${g.avgBossKills.toFixed(1)} | ${g.avgSkills.toFixed(1)} / ${g.avgEquippedSkills.toFixed(1)} | ${mapsStr} |`,
      );
    }
  }

  lines.push(``);
  lines.push(`## 2. Theo dõi cân bằng Kim Đan (#406)`);
  lines.push(``);
  if (report.kdHauKyCount > 0 && report.kdHauKyMedianHours !== null) {
    const ratioText = report.kdHauKyRatio !== null ? `${report.kdHauKyRatio.toFixed(2)}x` : "-";
    lines.push(
      `- **Kim Đan Hậu kỳ:** ${report.kdHauKyCount} nhân vật | Trung vị tích luỹ: **${report.kdHauKyMedianHours.toFixed(1)} giờ** (mô hình tối ưu: ~${report.kdHauKyOptReachHours.toFixed(1)} giờ, tỉ số: ${ratioText}, mốc cảnh báo < ${report.kdHauKyThresholdHours.toFixed(1)} giờ)`,
    );
  } else {
    lines.push(
      `- **Kim Đan Hậu kỳ:** 0 nhân vật (mô hình tối ưu tới bậc: ~${report.kdHauKyOptReachHours.toFixed(1)} giờ, mốc cảnh báo < ${report.kdHauKyThresholdHours.toFixed(1)} giờ)`,
    );
  }

  if (report.postKdCount > 0 && report.postKdMedianHours !== null) {
    const ratioText = report.postKdRatio !== null ? `${report.postKdRatio.toFixed(2)}x` : "-";
    lines.push(
      `- **Vượt qua Kim Đan (Nguyên Anh trở lên):** ${report.postKdCount} nhân vật | Trung vị tích luỹ: **${report.postKdMedianHours.toFixed(1)} giờ** (mô hình tối ưu hết KĐ: ~${report.postKdOptHours.toFixed(1)} giờ, tỉ số: ${ratioText}, mốc cảnh báo < ${report.postKdThresholdHours.toFixed(1)} giờ)`,
    );
  }

  lines.push(``);
  lines.push(`## 3. Thống kê chiêu thức / công pháp đã học (M7.10 #511)`);
  lines.push(``);
  const so = report.skillsOverview;
  lines.push(
    `- **Số nhân vật đã học ít nhất 1 chiêu:** ${so.playersWithSkillsCount} / ${report.totalPlayers} (${so.percentWithSkills.toFixed(1)}%)`,
  );
  lines.push(
    `- **Số chiêu đã học mỗi nhân vật (Min / Med / Max / TB):** ${so.skillsPerPlayer.min} / **${so.skillsPerPlayer.median}** / ${so.skillsPerPlayer.max} / ${so.skillsPerPlayer.mean.toFixed(1)} chiêu`,
  );
  lines.push(`- **Phân bố số lượng chiêu đã học:**`);
  lines.push(`  - 0 chiêu: ${so.distribution.zero} nhân vật`);
  lines.push(`  - 1 chiêu: ${so.distribution.one} nhân vật`);
  lines.push(`  - 2 chiêu: ${so.distribution.two} nhân vật`);
  lines.push(`  - 3–4 chiêu: ${so.distribution.threeOrFour} nhân vật`);
  lines.push(`  - 5+ chiêu: ${so.distribution.fivePlus} nhân vật`);
  lines.push(`- **Phân bố số chiêu đang gắn vào ô (ô 2–5):**`);
  lines.push(
    `  - 0 ô: ${so.equippedDistribution.zero} | 1 ô: ${so.equippedDistribution.one} | 2 ô: ${so.equippedDistribution.two} | 3 ô: ${so.equippedDistribution.three} | 4 ô: ${so.equippedDistribution.four}`,
  );
  lines.push(``);
  lines.push(`### Kết luận cân bằng:`);
  lines.push(`> ${report.verdict}`);
  lines.push(``);
  lines.push(
    `*Tiêu chí theo dõi (#406, CAN_BANG mục 10): So sánh giờ chơi tích luỹ với mô hình tối ưu simulate(3). Cảnh báo QUÁ NHANH khi vượt Kim Đan trong dưới 4 giờ riêng (mốc tích luỹ < ${report.postKdThresholdHours.toFixed(1)}h) hoặc tới Kim Đan Hậu kỳ < ${report.kdHauKyThresholdHours.toFixed(1)}h tích luỹ với >= 5 mẫu.*`,
  );
  lines.push(
    `*Lưu ý về kiếp và luân hồi: Thời gian chơi \`life.playMs\` được tính tích luỹ từ đầu kiếp hiện tại (đặt về 0 khi luân hồi). Người chơi ở kiếp >= 2 tu luyện nhanh hơn đáng kể nhờ Dư âm tu hành (không đối chiếu trực tiếp với mô hình tối ưu kiếp 1).*`,
  );
  lines.push(
    `*Ghi chú bảo vệ quyền riêng tư: Công cụ tuyệt đối không in tên nhân vật, đạo hiệu, token hay thông tin định danh nào.*`,
  );

  return lines.join("\n");
}

export async function main(args: string[]): Promise<number> {
  let dirPath: string | null = null;
  let backupPath: string | null = null;
  let isJson = false;

  for (const arg of args) {
    if (arg.startsWith("--dir=")) {
      dirPath = arg.slice(6).trim();
    } else if (arg.startsWith("--backup=")) {
      backupPath = arg.slice(9).trim();
    } else if (arg === "--json") {
      isJson = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Cách dùng:`);
      console.log(`  npx tsx server/scripts/thong-ke-tien-do.ts --dir=<thư mục JSON nhân vật>`);
      console.log(`  npx tsx server/scripts/thong-ke-tien-do.ts --backup=<tệp tiengioi-*.sql.gz>`);
      console.log(`  Tùy chọn: --json (xuất dữ liệu dạng JSON)`);
      return 0;
    }
  }

  if (!dirPath && !backupPath) {
    console.error(`Lỗi: Cần cung cấp --dir=<thư mục> hoặc --backup=<tệp sao lưu .sql.gz>`);
    console.error(`Xem trợ giúp: npx tsx server/scripts/thong-ke-tien-do.ts --help`);
    return 1;
  }

  let records: PlayerProgressRecord[] = [];
  let corruptedCount = 0;
  let sourceDesc = "";

  if (dirPath) {
    sourceDesc = `Thư mục ${dirPath}`;
    const res = await readDirProgress(dirPath);
    records = res.records;
    corruptedCount = res.corruptedCount;
  } else if (backupPath) {
    sourceDesc = `Tệp sao lưu ${path.basename(backupPath)}`;
    const res = await readBackupProgress(backupPath);
    records = res.records;
    corruptedCount = res.corruptedCount;
  }

  const report = buildProgressReport(records, corruptedCount);

  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatMarkdownReport(report, sourceDesc));
  }

  return 0;
}

if (process.argv[1]?.endsWith("thong-ke-tien-do.ts")) {
  main(process.argv.slice(2)).catch((err) => {
    console.error("Lỗi khi thống kê tiến độ:", err);
    process.exit(1);
  });
}
