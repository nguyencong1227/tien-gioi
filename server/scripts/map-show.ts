// Công cụ hiển thị trực quan bản đồ Tiled: ASCII ra terminal + PNG xem trước (docs/THIET_KE_BAN_DO_TILED.md lát cắt S4, Issue #1207).
// Chạy:
//   npm run map:show -w server -- lac_ha
//   npm run map:show -w server -- lac_ha --area 40,40,24,16
//   npm run map:show -w server -- lac_ha --png docs/art/preview-lac_ha.png

import { Buffer } from "node:buffer";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { GameMap, TILE, mapDefFromTiled, type TiledMap } from "@tien-gioi/shared";

const here = path.dirname(fileURLToPath(import.meta.url));
const mapsDir = path.resolve(here, "../../shared/maps");

// ----------------- Bộ mã hoá PNG thuần Node (Zero external dependencies) -----------------
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
export function encodePngRgba(width: number, height: number, rgbaData: Buffer): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const rowBytes = width * 4;
  const filtered = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    filtered[y * (rowBytes + 1)] = 0; // filter type None
    rgbaData.copy(filtered, y * (rowBytes + 1) + 1, y * rowBytes, (y + 1) * rowBytes);
  }

  const idat = zlib.deflateSync(filtered, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ----------------- Bảng ký tự ASCII & Bảng màu Tu Tiên -----------------
// 0 Grass, 1 TallGrass, 2 Dirt, 3 Water, 4 Tree, 5 Rock, 6 Stone, 7 Sand
const ASCII_TILES = [".", '"', ",", "~", "T", "^", "#", ":"];

// Bảng màu RGB tu tiên (docs/HUONG_DO_HOA_MOI.md)
const TILE_COLORS: [number, number, number][] = [
  [156, 183, 126], // 0 Grass #9cb77e
  [94, 143, 88], // 1 TallGrass #5e8f58
  [191, 160, 120], // 2 Dirt #bfa078
  [139, 188, 205], // 3 Water #8bbccd
  [62, 110, 77], // 4 Tree #3e6e4d
  [122, 74, 60], // 5 Rock #7a4a3c
  [205, 187, 146], // 6 Stone (sàn trấn) #cdbb92
  [220, 202, 165], // 7 Sand #dccaa5
];

// ----------------- Xử lý tham số dòng lệnh -----------------
const argv = process.argv.slice(2);
let mapId = "";
let pngFile: string | undefined;
let area: { x: number; y: number; w: number; h: number } | undefined;

for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === "--png" && i + 1 < argv.length) {
    pngFile = argv[++i];
  } else if (arg === "--area" && i + 1 < argv.length) {
    const parts = argv[++i]!.split(",").map((s) => parseInt(s.trim(), 10));
    if (parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0)) {
      area = { x: parts[0]!, y: parts[1]!, w: parts[2]!, h: parts[3]! };
    }
  } else if (!arg.startsWith("-") && !mapId) {
    mapId = arg.replace(/\.(logic\.)?json$/, "");
  }
}

if (!mapId) {
  console.log("Cách dùng: npm run map:show -w server -- <id> [--area x,y,w,h] [--png <tệp>]");
  console.log("Ví dụ:    npm run map:show -w server -- lac_ha");
  console.log("          npm run map:show -w server -- lac_ha --area 36,36,24,24");
  console.log("          npm run map:show -w server -- lac_ha --png docs/art/preview.png");
  process.exit(1);
}

// Tìm tệp bản đồ
let jsonPath = path.join(mapsDir, `${mapId}.json`);
if (!existsSync(jsonPath)) {
  jsonPath = path.join(mapsDir, `${mapId}.logic.json`);
}
if (!existsSync(jsonPath)) {
  console.error(`✗ Không tìm thấy tệp bản đồ '${mapId}' trong ${mapsDir}`);
  process.exit(1);
}

const rawText = readFileSync(jsonPath, "utf8");
const mapObj: TiledMap = JSON.parse(rawText);
const mapDef = mapDefFromTiled(mapObj, TILE);
const gameMap = new GameMap(mapDef);

const w = mapDef.w;
const h = mapDef.h;

// Xác định vùng hiển thị
const startX = area ? Math.max(0, Math.min(w - 1, area.x)) : 0;
const startY = area ? Math.max(0, Math.min(h - 1, area.y)) : 0;
const viewW = area ? Math.min(w - startX, area.w) : w;
const viewH = area ? Math.min(h - startY, area.h) : h;

console.log(`================================================================`);
console.log(`BẢN ĐỒ: ${mapDef.name} (${mapDef.id})`);
console.log(
  `Kích thước: ${w} x ${h} ô | Khu: Trấn "${gameMap.townName}", Dã ngoại "${gameMap.wildName}"`,
);
console.log(`Trấn: tâm (${mapDef.town.cx}, ${mapDef.town.cy}), bán kính ${mapDef.town.r} ô`);
if (mapDef.lair) {
  console.log(`Hang: tâm (${mapDef.lair.cx}, ${mapDef.lair.cy}), bán kính ${mapDef.lair.r} ô`);
}
console.log(`Cổng (${gameMap.portals.length}):`);
for (const p of gameMap.portals) {
  console.log(
    `  - Cổng '${p.id}': toạ độ (${Math.round(p.x)}, ${Math.round(p.y)}) -> ${p.toMap} / ${p.toPortal}`,
  );
}
console.log(`----------------------------------------------------------------`);
console.log(
  `Vùng hiển thị: x=[${startX}..${startX + viewW - 1}], y=[${startY}..${startY + viewH - 1}]`,
);
console.log(`Ký hiệu: . Cỏ | " Cỏ cao | , Đất | ~ Nước | T Cây | ^ Đá | # Sàn trấn | : Cát`);
console.log(`         [T] Trấn | [P] Cổng | [L] Hang`);
console.log(`----------------------------------------------------------------`);

// Chuẩn bị các điểm đặc biệt để đánh dấu trên bản đồ ASCII
const marks = new Map<string, string>();
marks.set(`${mapDef.town.cx},${mapDef.town.cy}`, "T");
if (mapDef.lair) {
  marks.set(`${mapDef.lair.cx},${mapDef.lair.cy}`, "L");
}
for (const p of gameMap.portals) {
  const px = Math.floor(p.x / 32);
  const py = Math.floor(p.y / 32);
  marks.set(`${px},${py}`, "P");
}

// In ASCII
for (let y = startY; y < startY + viewH; y++) {
  let row = "";
  for (let x = startX; x < startX + viewW; x++) {
    const mark = marks.get(`${x},${y}`);
    if (mark) {
      row += mark;
    } else {
      const tileType = gameMap.tileAt(x, y);
      row += ASCII_TILES[tileType] ?? "?";
    }
  }
  const yLabel = String(y).padStart(3, " ");
  console.log(`${yLabel} | ${row}`);
}

// ----------------- Xuất ảnh PNG (nếu được yêu cầu) -----------------
if (pngFile) {
  const scale = 4; // Mỗi ô là 4x4 px
  const imgW = viewW * scale;
  const imgH = viewH * scale;
  const rgba = Buffer.alloc(imgW * imgH * 4);

  // Điểm đánh dấu cổng/trấn trên toạ độ pixel thế giới
  for (let vy = 0; vy < viewH; vy++) {
    const mapY = startY + vy;
    for (let vx = 0; vx < viewW; vx++) {
      const mapX = startX + vx;
      const tileType = gameMap.tileAt(mapX, mapY);
      const isTown = marks.get(`${mapX},${mapY}`) === "T";
      const isLair = marks.get(`${mapX},${mapY}`) === "L";
      const isPortal = marks.get(`${mapX},${mapY}`) === "P";

      let rgb = TILE_COLORS[tileType] ?? [128, 128, 128];
      if (isTown)
        rgb = [255, 50, 50]; // Đỏ tươi
      else if (isLair)
        rgb = [255, 0, 255]; // Tím
      else if (isPortal) rgb = [0, 230, 255]; // Xanh lơ

      // Điền pixel khối 4x4
      for (let py = 0; py < scale; py++) {
        for (let px = 0; px < scale; px++) {
          const outX = vx * scale + px;
          const outY = vy * scale + py;
          const idx = (outY * imgW + outX) * 4;
          rgba[idx] = rgb[0];
          rgba[idx + 1] = rgb[1];
          rgba[idx + 2] = rgb[2];
          rgba[idx + 3] = 255; // Không trong suốt
        }
      }
    }
  }

  const pngBuf = encodePngRgba(imgW, imgH, rgba);
  const outPath = path.resolve(here, "../..", pngFile);
  writeFileSync(outPath, pngBuf);
  console.log(`----------------------------------------------------------------`);
  console.log(
    `✓ Đã xuất ảnh PNG xem trước: ${pngFile} (${imgW}x${imgH} px, ${(pngBuf.length / 1024).toFixed(1)} KB)`,
  );
}
