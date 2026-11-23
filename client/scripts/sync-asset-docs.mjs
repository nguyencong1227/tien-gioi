/* global process */
/**
 * Script đồng bộ số đếm tài sản và danh sách icon vào CREDITS.md và docs/RA_SOAT_TAI_SAN.md
 * giữa các cặp dấu đánh dấu (markers), theo Issue #1368.
 *
 * Chạy độc lập: node client/scripts/sync-asset-docs.mjs
 * Hoặc tự động chạy sau: npm run assets -w client
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const CREDITS_FILE = path.resolve(ROOT_DIR, "CREDITS.md");
const RA_SOAT_FILE = path.resolve(ROOT_DIR, "docs/RA_SOAT_TAI_SAN.md");
const ASSETS_DIR = path.resolve(ROOT_DIR, "client/public/assets");
const ITEMS_DIR = path.resolve(ASSETS_DIR, "items");
const AI_DIR = path.resolve(ASSETS_DIR, "ai");
const ICONS_DIR = path.resolve(ROOT_DIR, "client/public/icons");
const FONTS_DIR = path.resolve(ROOT_DIR, "client/public/fonts");
const ATLAS_JSON = path.resolve(ASSETS_DIR, "atlas.json");

/**
 * Quét đệ quy các tệp
 */
export function scanFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...scanFiles(full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Thay thế nội dung giữa marker: <!-- NAME:START -->...<!-- NAME:END -->
 */
export function replaceMarker(content, markerName, newInner) {
  const startTag = `<!-- ${markerName}:START -->`;
  const endTag = `<!-- ${markerName}:END -->`;
  const s = content.indexOf(startTag);
  const e = content.indexOf(endTag);
  if (s === -1 || e === -1) {
    throw new Error(`Không tìm thấy cặp marker ${startTag} và ${endTag}`);
  }
  return content.slice(0, s + startTag.length) + newInner + content.slice(e);
}

/**
 * Trích xuất nội dung giữa marker
 */
export function extractMarker(content, markerName) {
  const startTag = `<!-- ${markerName}:START -->`;
  const endTag = `<!-- ${markerName}:END -->`;
  const s = content.indexOf(startTag);
  const e = content.indexOf(endTag);
  if (s === -1 || e === -1) return null;
  return content.slice(s + startTag.length, e);
}

/**
 * Thu thập số liệu tài sản hiện tại từ đĩa
 */
export function collectAssetStats() {
  const itemFilesOnDisk = fs
    .readdirSync(ITEMS_DIR)
    .filter((f) => f.endsWith(".png"))
    .sort();

  // Đọc thứ tự xuất hiện hiện tại trong CREDITS.md nếu có để giữ thứ tự ổn định
  let orderedItems = [...itemFilesOnDisk];
  if (fs.existsSync(CREDITS_FILE)) {
    const creditsContent = fs.readFileSync(CREDITS_FILE, "utf8");
    const m = creditsContent.match(/`([a-z0-9_]+\.png)`/g);
    if (m) {
      const existing = m.map((s) => s.replace(/`/g, "")).filter((s) => s.endsWith(".png"));
      const seen = new Set();
      const preserved = [];
      for (const f of existing) {
        if (itemFilesOnDisk.includes(f) && !seen.has(f)) {
          seen.add(f);
          preserved.push(f);
        }
      }
      for (const f of itemFilesOnDisk) {
        if (!seen.has(f)) {
          seen.add(f);
          preserved.push(f);
        }
      }
      orderedItems = preserved;
    }
  }

  const aiFiles = scanFiles(AI_DIR);
  const assetsFiles = scanFiles(ASSETS_DIR);
  const iconsFiles = scanFiles(ICONS_DIR);
  const fontsFiles = scanFiles(FONTS_DIR);
  const totalScanned = assetsFiles.length + iconsFiles.length + fontsFiles.length;

  let totalAtlasFrames = 0;
  let itemAtlasFrames = 0;
  if (fs.existsSync(ATLAS_JSON)) {
    const atlas = JSON.parse(fs.readFileSync(ATLAS_JSON, "utf8"));
    const frameKeys = Object.keys(atlas.frames || {});
    totalAtlasFrames = frameKeys.length;
    itemAtlasFrames = frameKeys.filter((k) => k.startsWith("item-")).length;
  }

  return {
    itemFiles: orderedItems,
    itemCount: orderedItems.length,
    aiCount: aiFiles.length,
    assetsCount: assetsFiles.length,
    iconsCount: iconsFiles.length,
    fontsCount: fontsFiles.length,
    totalScanned,
    totalAtlasFrames,
    itemAtlasFrames,
  };
}

/**
 * Tạo danh sách các hàng markdown cho bảng mục 2 trong docs/RA_SOAT_TAI_SAN.md
 * từ STT 28 trở đi (sau phông chữ ở STT 27).
 */
export function generateRaSoatItemRows(orderedItems, currentRaSoatContent) {
  // 16 item đầu tiên thuộc M4 (STT 4-19 trong bảng tĩnh)
  const initial16 = new Set([
    "hoi_huyet_dan.png",
    "hoi_linh_dan.png",
    "tu_khi_dan.png",
    "long_tho.png",
    "nanh_soi.png",
    "da_ho.png",
    "vay_mang.png",
    "lang_nha_kiem.png",
    "tho_nhung_bao.png",
    "lang_nha_phu.png",
    "hac_ho_kiem.png",
    "hac_ho_bao.png",
    "ho_hon_phu.png",
    "xich_mang_kiem.png",
    "xich_lan_bao.png",
    "mang_dam_phu.png",
  ]);

  // Đọc mô tả hiện có từ RA_SOAT_TAI_SAN.md
  const descMap = new Map();
  const lines = currentRaSoatContent.split("\n");
  for (const line of lines) {
    if (!line.includes("client/public/assets/items/")) continue;
    const match = line.match(
      /^\|\s*\d+\s*\|\s*`client\/public\/assets\/items\/([^`]+)`\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|/,
    );
    if (match) {
      descMap.set(match[1], {
        desc: match[2].trim(),
        author: match[3].trim(),
        license: match[4].trim(),
        status: match[5].trim(),
      });
    }
  }

  const additionalItems = orderedItems.filter((f) => !initial16.has(f));
  const rows = [];
  let stt = 28;

  for (const file of additionalItems) {
    const existing = descMap.get(file);
    let desc = existing?.desc;
    let author = existing?.author || "Do nhóm Tiên Giới sinh bằng `client/scripts/gen-assets.mjs`";
    let license = existing?.license || "**CC0 1.0**";
    let status = existing?.status || "✓ Hợp lệ";

    if (!desc) {
      const id = file.replace(/\.png$/, "");
      if (id.startsWith("kinh_")) {
        desc = `Icon kinh quyển \`${id}\``;
      } else {
        desc = `Icon vật phẩm \`${id}\``;
      }
    }

    rows.push(
      `| ${stt} | \`client/public/assets/items/${file}\` | ${desc} | ${author} | ${license} | ${status} |`,
    );
    stt++;
  }

  return rows.join("\n");
}

/**
 * Đồng bộ nội dung vào CREDITS.md và docs/RA_SOAT_TAI_SAN.md
 * @param {{ checkOnly?: boolean }} options
 * @returns {{ changed: boolean, errors: string[] }}
 */
export function syncAssetDocs(options = {}) {
  const stats = collectAssetStats();
  const errors = [];
  let anyChanged = false;

  // 1. Cập nhật CREDITS.md
  let credits = fs.readFileSync(CREDITS_FILE, "utf8");
  const origCredits = credits;

  const itemFilesList = stats.itemFiles.map((f) => `\`${f}\``).join(", ");

  credits = replaceMarker(credits, "AUTO-CREDITS-ITEM-COUNT", `${stats.itemCount} tệp`);
  credits = replaceMarker(credits, "AUTO-CREDITS-ITEMS", itemFilesList);
  credits = replaceMarker(
    credits,
    "AUTO-CREDITS-TOTAL-STATIC-HEADING",
    `- **Tổng số tệp tài nguyên tĩnh quét qua script tự động (\`npm run check:credits\`):** ${stats.totalScanned} tệp`,
  );
  credits = replaceMarker(
    credits,
    "AUTO-CREDITS-ASSETS-DIR",
    `  - \`client/public/assets/\`: ${stats.assetsCount} tệp (1 tileset, 2 atlas, ${stats.itemCount} biểu tượng vật phẩm, ${stats.aiCount} ảnh AI ở \`assets/ai/\`: \`login_bg.webp\` và 5 thẻ bản đồ, mục 7).`,
  );

  if (credits !== origCredits) {
    anyChanged = true;
    if (!options.checkOnly) {
      fs.writeFileSync(CREDITS_FILE, credits, "utf8");
    } else {
      errors.push("CREDITS.md chưa khớp bản sinh tài sản tự động.");
    }
  }

  // 2. Cập nhật docs/RA_SOAT_TAI_SAN.md
  let raSoat = fs.readFileSync(RA_SOAT_FILE, "utf8");
  const origRaSoat = raSoat;

  const itemRows = generateRaSoatItemRows(stats.itemFiles, raSoat);

  raSoat = replaceMarker(raSoat, "AUTO-RA-SOAT-ITEM-ROWS", "\n" + itemRows + "\n");
  raSoat = replaceMarker(
    raSoat,
    "AUTO-RA-SOAT-HEADER",
    `## 2. Bảng thống kê chi tiết tài sản (${stats.totalScanned} tệp tĩnh = 6 ảnh AI (\`login_bg.webp\` và 5 thẻ bản đồ, #513) + 24 của M4 + 5 phông (#331) + 15 icon Kim Đan (M6) + 14 icon ba ô riêng + 12 icon kinh quyển (M7.4 #505) + 12 icon Hàn Vân Lĩnh (M7.5 #506) + 6 icon kinh quyển đợt 2 (#654) + 3 icon đan hộ đạo (#763) + 9 icon phù (#817) + 6 icon kinh quyển Kim / Thổ (CT6 lát 1, #1051) + 6 icon chiêu dạng mới (CT9 lát 1, #1054) + 7 icon kinh quyển hệ Mộc/Thủy (CT7 #1052) + 6 icon kinh quyển Hỏa / Băng / Âm / Lôi / Phong (CT8 lát 1) + 5 icon kinh quyển Nguyên Anh (CT8 lát 2) + 5 icon kinh quyển vô sắc (CT8 lát 3) + 4 icon kinh quyển Kim / Thổ (CT17 lát 1, G) + 2 icon kinh quyển Mộc (CT17 lát 2, G) + 2 icon kinh quyển Lôi (CT15 đợt 2, #1185, D); các mô-đun vẽ bằng mã ở mục 2c)`,
  );
  raSoat = replaceMarker(
    raSoat,
    "AUTO-RA-SOAT-ATLAS-HEADER",
    `### 2b. Khung atlas (tệp 2-3) sau NPC \`tran_uy\` (D7 #755, E): ${stats.totalAtlasFrames} khung (492 sau 2 kinh quyển Lôi CT15 đợt 2, D; 490 sau 2 kinh quyển Mộc CT17 lát 2, G; 488 sau 4 kinh quyển Kim / Thổ CT17 lát 1, G; 484 sau 5 kinh quyển vô sắc CT8 lát 3; 478 sau 5 kinh quyển Nguyên Anh CT8 lát 2; 473 sau 6 kinh quyển Hỏa / Băng / Âm / Lôi / Phong CT8 lát 1; 467 sau 7 kinh quyển hệ Mộc/Thủy CT7 #1052; 460 sau 6 chiêu dạng mới CT9 lát 1 #1054; 454 sau 6 kinh quyển Kim / Thổ CT6 #1051; 448 sau chín phù #817 = 337 sau M6 + 14 icon ba ô riêng + 12 icon kinh quyển + 50 khung năm quái Hàn Vân Lĩnh + 12 icon + 3 NPC Hàn Vân Trạm + 6 icon kinh quyển đợt 2 + 1 NPC Lò đan + 3 icon đan hộ đạo + 1 NPC Bàn phù + 9 icon phù, rồi + 6 icon kinh quyển Kim / Thổ, rồi + 6 icon chiêu dạng mới, rồi + 7 icon kinh quyển Mộc/Thủy, rồi + 6 icon kinh quyển Hỏa / Băng / Âm / Lôi / Phong, rồi + 5 kinh quyển Nguyên Anh CT8 lát 2, rồi + 5 kinh quyển vô sắc CT8 lát 3, rồi + 4 kinh quyển Kim / Thổ CT17 lát 1, rồi + 2 kinh quyển Mộc CT17 lát 2, rồi + 2 kinh quyển Lôi CT15 đợt 2), toàn bộ sinh bằng \`gen-assets.mjs\``,
  );
  raSoat = replaceMarker(
    raSoat,
    "AUTO-RA-SOAT-ATLAS-ITEM-ROW",
    `| \`item-*\` | ${stats.itemAtlasFrames} | Biểu tượng vật phẩm trong thế giới (rơi trên đất), một khung cho mỗi icon ở bảng trên |`,
  );
  raSoat = replaceMarker(
    raSoat,
    "AUTO-RA-SOAT-SUMMARY-ROW",
    `| Tệp tĩnh quét (\`client/public/assets\`, \`icons\`, \`fonts\`) | **${stats.totalScanned} tệp** (3 trong \`assets/\` + ${stats.aiCount} ảnh AI \`assets/ai/\` (\`login_bg.webp\` + 5 thẻ bản đồ) + ${stats.itemCount} icon + ${stats.iconsCount} icon PWA + ${stats.fontsCount} phông), **0 tệp thiếu nguồn / tác giả / giấy phép** |`,
  );

  if (raSoat !== origRaSoat) {
    anyChanged = true;
    if (!options.checkOnly) {
      fs.writeFileSync(RA_SOAT_FILE, raSoat, "utf8");
    } else {
      errors.push("docs/RA_SOAT_TAI_SAN.md chưa khớp bản sinh tài sản tự động.");
    }
  }

  return { changed: anyChanged, errors, stats };
}

// Chạy trực tiếp qua dòng lệnh
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const checkOnly = process.argv.includes("--check");
  try {
    const { errors, stats } = syncAssetDocs({ checkOnly });
    if (checkOnly) {
      if (errors.length > 0) {
        process.stderr.write(errors.join("\n") + "\n");
        process.exit(1);
      }
      process.stdout.write("✓ Tài liệu CREDITS.md và RA_SOAT_TAI_SAN.md đã đồng bộ.\n");
    } else {
      process.stdout.write(
        `✓ Đã đồng bộ tài liệu tài sản: ${stats.itemCount} icon items, ${stats.totalScanned} tệp tĩnh, ${stats.totalAtlasFrames} khung atlas.\n`,
      );
    }
  } catch (err) {
    process.stderr.write(`Lỗi đồng bộ tài sản: ${err.message}\n`);
    process.exit(1);
  }
}
