// Công cụ CHỈ-ĐỌC thống kê tiến độ người chơi (M6.12 - Issue #488).
// Phục vụ theo dõi cân bằng Kim Đan và bãi Xích Mãng sau phát hành v0.2.0 (ngưỡng ~4 giờ theo #406).
// Tuyệt đối CHỈ ĐỌC: không sửa đổi dữ liệu, không kết nối DB bản chạy thật, không in tên hay dữ liệu nhạy cảm.
import { existsSync, lstatSync, readdirSync, readFileSync, createReadStream } from "node:fs";
import zlib from "node:zlib";
import readline from "node:readline";
import path from "node:path";
import { REALMS, realmLabel, stepOf } from "@tien-gioi/shared";

export interface PlayerProgressRecord {
  realm: number;
  tier: number;
  playMs: number;
  kills: number;
  bossKills: number;
  mapId: string;
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

  return {
    realm: clampedRealm,
    tier: clampedTier,
    playMs,
    kills,
    bossKills,
    mapId,
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
      inCopyBlock = false;
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
      const rawJson = parts[dataColumnIndex];
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

export interface GroupStat {
  realm: number;
  tier: number;
  label: string;
  step: number;
  count: number;
  minHours: number;
  medianHours: number;
  maxHours: number;
  avgKills: number;
  avgBossKills: number;
  mapCounts: Record<string, number>;
  estimateStatus: string;
}

export interface ProgressReport {
  groups: GroupStat[];
  totalPlayers: number;
  corruptedCount: number;
  kdHauKyCount: number;
  kdHauKyMedianHours: number | null;
  postKdCount: number;
  postKdMedianHours: number | null;
  verdict: string;
}

export function buildProgressReport(
  records: PlayerProgressRecord[],
  corruptedCount: number,
): ProgressReport {
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

    const mapCounts: Record<string, number> = {};
    for (const r of g.records) {
      mapCounts[r.mapId] = (mapCounts[r.mapId] ?? 0) + 1;
    }

    const label = realmLabel(g.realm, g.tier);
    const estimateStatus = count >= 5 ? `~${stats.median.toFixed(1)} h` : "chưa đủ mẫu (< 5)";

    groups.push({
      realm: g.realm,
      tier: g.tier,
      step: s,
      label,
      count,
      minHours: stats.min,
      medianHours: stats.median,
      maxHours: stats.max,
      avgKills: totalKills / count,
      avgBossKills: totalBossKills / count,
      mapCounts,
      estimateStatus,
    });
  }

  // Kim Đan Hậu kỳ: realm = 3, tier = 2
  const kdHauKyRecords = records.filter((r) => r.realm === 3 && r.tier === 2);
  const kdHauKyCount = kdHauKyRecords.length;
  let kdHauKyMedianHours: number | null = null;
  if (kdHauKyCount > 0) {
    const hours = kdHauKyRecords.map((r) => r.playMs / 3600000);
    kdHauKyMedianHours = calcStats(hours).median;
  }

  // Sau Kim Đan: realm > 3
  const postKdRecords = records.filter((r) => r.realm > 3);
  const postKdCount = postKdRecords.length;
  let postKdMedianHours: number | null = null;
  if (postKdCount > 0) {
    const hours = postKdRecords.map((r) => r.playMs / 3600000);
    postKdMedianHours = calcStats(hours).median;
  }

  // Đánh giá theo ngưỡng 4 giờ của #406
  let verdict = "";
  if (kdHauKyCount >= 5 && kdHauKyMedianHours !== null) {
    if (kdHauKyMedianHours < 4.0) {
      verdict = `🚨 CẢNH BÁO: Trung vị thời gian tới Kim Đan Hậu kỳ = ${kdHauKyMedianHours.toFixed(1)}h (< 4.0h). Người chơi tiến cấp nhanh hơn thiết kế, có dấu hiệu đường tắt cày Xích Mãng. Đề xuất điều chỉnh mật độ / hồi sinh Xích Mãng ở bản vá kế tiếp.`;
    } else {
      verdict = `✅ ĐẠT MỤC TIÊU: Trung vị thời gian tới Kim Đan Hậu kỳ = ${kdHauKyMedianHours.toFixed(1)}h (>= 4.0h). Tiến độ nằm trong khung thiết kế cân bằng (4 - 7 giờ).`;
    }
  } else if (kdHauKyCount > 0 && kdHauKyMedianHours !== null) {
    verdict = `⚠️ THAM KHẢO: Hiện có ${kdHauKyCount} người chơi đạt Kim Đan Hậu kỳ (< 5 mẫu). Trung vị hiện tại là ${kdHauKyMedianHours.toFixed(1)}h. Chưa đủ mẫu thống kê để kết luận (cần >= 5 mẫu).`;
  } else {
    verdict = `ℹ️ CHƯA CÓ DỮ LIỆU: Chưa ghi nhận người chơi nào đạt Kim Đan Hậu kỳ trên tập dữ liệu này. Tiếp tục theo dõi các bản sao lưu tiếp theo.`;
  }

  return {
    groups,
    totalPlayers: records.length,
    corruptedCount,
    kdHauKyCount,
    kdHauKyMedianHours,
    postKdCount,
    postKdMedianHours,
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
    `| Cảnh giới - Bậc | Số người | Giờ chơi (Min / Median / Max) | Ước lượng thời gian | Quái hạ TB | Trùm hạ TB | Bản đồ |`,
  );
  lines.push(`|---|---:|---:|---:|---:|---:|---|`);

  if (report.groups.length === 0) {
    lines.push(`| *(Không có dữ liệu)* | 0 | - | - | - | - | - |`);
  } else {
    for (const g of report.groups) {
      const minStr = g.minHours.toFixed(1);
      const medStr = g.medianHours.toFixed(1);
      const maxStr = g.maxHours.toFixed(1);
      const hoursRange = `${minStr} / **${medStr}** / ${maxStr} h`;
      const mapsStr = Object.entries(g.mapCounts)
        .map(([m, c]) => `${m}: ${c}`)
        .join(", ");
      lines.push(
        `| ${g.label} | ${g.count} | ${hoursRange} | ${g.estimateStatus} | ${g.avgKills.toFixed(0)} | ${g.avgBossKills.toFixed(1)} | ${mapsStr} |`,
      );
    }
  }

  lines.push(``);
  lines.push(`## 2. Theo dõi cân bằng Kim Đan (#406)`);
  lines.push(``);
  if (report.kdHauKyCount > 0 && report.kdHauKyMedianHours !== null) {
    lines.push(
      `- **Kim Đan Hậu kỳ:** ${report.kdHauKyCount} nhân vật | Trung vị thời gian chơi: **${report.kdHauKyMedianHours.toFixed(1)} giờ**`,
    );
  } else {
    lines.push(`- **Kim Đan Hậu kỳ:** 0 nhân vật`);
  }

  if (report.postKdCount > 0 && report.postKdMedianHours !== null) {
    lines.push(
      `- **Vượt qua Kim Đan (Nguyên Anh trở lên):** ${report.postKdCount} nhân vật | Trung vị thời gian chơi: **${report.postKdMedianHours.toFixed(1)} giờ**`,
    );
  }

  lines.push(``);
  lines.push(`### Kết luận cân bằng:`);
  lines.push(`> ${report.verdict}`);
  lines.push(``);
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
