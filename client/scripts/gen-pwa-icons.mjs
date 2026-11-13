// Script sinh bộ icon PWA (PNG 180/192/512 + maskable 512 + SVG) thuần Node.js cho Tiên Giới (CC0 1.0).
// Chạy lại bằng: node client/scripts/gen-pwa-icons.mjs
import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import zlib from "node:zlib";

const ICONS_DIR = fileURLToPath(new URL("../public/icons", import.meta.url));
fs.mkdirSync(ICONS_DIR, { recursive: true });

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

class Surface {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 4);
  }
  set(x, y, hex, a = 255) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = (y * this.w + x) * 4;
    const r = (hex >> 16) & 255;
    const g = (hex >> 8) & 255;
    const b = hex & 255;
    if (a >= 255 || this.data[i + 3] === 0) {
      this.data[i] = r;
      this.data[i + 1] = g;
      this.data[i + 2] = b;
      this.data[i + 3] = a;
    } else {
      const sa = a / 255;
      const da = this.data[i + 3] / 255;
      const oa = sa + da * (1 - sa);
      this.data[i] = Math.round((r * sa + this.data[i] * da * (1 - sa)) / oa);
      this.data[i + 1] = Math.round((g * sa + this.data[i + 1] * da * (1 - sa)) / oa);
      this.data[i + 2] = Math.round((b * sa + this.data[i + 2] * da * (1 - sa)) / oa);
      this.data[i + 3] = Math.round(oa * 255);
    }
  }
  fill(hex, a = 255) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, hex, a);
  }
  circle(cx, cy, r, hex, a = 255) {
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) this.set(x, y, hex, a);
      }
    }
  }
  ring(cx, cy, r, thickness, hex, a = 255) {
    const rIn = Math.max(0, r - thickness);
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= r && d >= rIn) this.set(x, y, hex, a);
      }
    }
  }
  line(x0, y0, x1, y1, hex, thickness = 1, a = 255) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2;
    for (let s = 0; s <= steps; s++) {
      const x = x0 + ((x1 - x0) * s) / steps;
      const y = y0 + ((y1 - y0) * s) / steps;
      if (thickness <= 1) this.set(x, y, hex, a);
      else this.circle(x, y, thickness / 2, hex, a);
    }
  }
  toPNG() {
    const raw = Buffer.alloc(this.h * (1 + this.w * 4));
    for (let y = 0; y < this.h; y++) {
      const rowStart = y * (1 + this.w * 4);
      raw[rowStart] = 0;
      Buffer.from(this.data.buffer, y * this.w * 4, this.w * 4).copy(raw, rowStart + 1);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0);
    ihdr.writeUInt32BE(this.h, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const compressed = zlib.deflateSync(raw, { level: 9 });
    return Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", ihdr),
      chunk("IDAT", compressed),
      chunk("IEND", Buffer.alloc(0)),
    ]);
  }
}

/**
 * Vẽ biểu tượng Tiên Giới: nền mực đen #1d1a16, ấn chương chu sa #a31d1d,
 * vòng bát quái/kim hoàn #c9a24a và cổ kiếm phát sáng #f3ecda.
 */
function renderIcon(size, maskable = false) {
  const s = new Surface(size, size);
  const cx = size / 2;
  const cy = size / 2;
  const scale = (maskable ? 0.78 : 0.92) * (size / 512);

  // Nền mực tối cổ phong
  s.fill(0x1d1a16, 255);

  // Hào quang nền ấm
  s.circle(cx, cy, 210 * scale, 0x2b231d, 255);
  s.circle(cx, cy, 172 * scale, 0xa31d1d, 255);
  s.circle(cx, cy, 152 * scale, 0x7d1515, 255);

  // Vòng kim hoàn kép
  s.ring(cx, cy, 198 * scale, Math.max(4, 10 * scale), 0xc9a24a, 255);
  s.ring(cx, cy, 174 * scale, Math.max(2, 5 * scale), 0xf3ecda, 220);

  // Bốn điểm linh quang ở bốn hướng
  for (const [dx, dy] of [
    [0, -186],
    [186, 0],
    [0, 186],
    [-186, 0],
  ]) {
    s.circle(cx + dx * scale, cy + dy * scale, Math.max(3, 9 * scale), 0xffe08a, 255);
  }

  // Thanh tiên kiếm đặt dọc chính giữa accompanied by kiếm khí
  const bladeTop = cy - 132 * scale;
  const bladeBot = cy + 68 * scale;
  const guardY = cy + 44 * scale;
  const hiltBot = cy + 122 * scale;

  // Hào quang kiếm khí xoay quanh
  s.ring(cx, cy - 10 * scale, 96 * scale, Math.max(2, 6 * scale), 0xffe08a, 95);

  // Thân kiếm
  s.line(cx, bladeTop, cx, bladeBot, 0xf3ecda, Math.max(4, 24 * scale), 255);
  s.line(cx, bladeTop - 10 * scale, cx, bladeBot, 0xffffff, Math.max(2, 8 * scale), 255);

  // Mũi kiếm nhọn
  for (let i = 0; i < 28 * scale; i++) {
    const ratio = i / (28 * scale);
    const halfW = ratio * 12 * scale;
    s.line(
      cx - halfW,
      bladeTop - 22 * scale + i,
      cx + halfW,
      bladeTop - 22 * scale + i,
      0xf3ecda,
      2,
    );
  }

  // Chắn kiếm (kiếm cách) bằng vàng
  s.line(cx - 56 * scale, guardY, cx + 56 * scale, guardY, 0xc9a24a, Math.max(4, 16 * scale), 255);
  s.line(
    cx - 42 * scale,
    guardY - 6 * scale,
    cx + 42 * scale,
    guardY - 6 * scale,
    0xffe08a,
    Math.max(2, 6 * scale),
    255,
  );

  // Chuôi kiếm & ngọc bội ở đốc kiếm
  s.line(cx, guardY + 8 * scale, cx, hiltBot, 0x5a3022, Math.max(3, 14 * scale), 255);
  s.circle(cx, hiltBot + 8 * scale, Math.max(4, 14 * scale), 0xc9a24a, 255);
  s.circle(cx, hiltBot + 8 * scale, Math.max(2, 7 * scale), 0x3f7fa6, 255);

  return s.toPNG();
}

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#1d1a16" />
  <circle cx="256" cy="256" r="196" fill="#2b231d" stroke="#c9a24a" stroke-width="10" />
  <circle cx="256" cy="256" r="168" fill="#a31d1d" stroke="#f3ecda" stroke-width="4" stroke-opacity="0.85" />
  <circle cx="256" cy="256" r="146" fill="#7d1515" />
  <circle cx="256" cy="70" r="9" fill="#ffe08a" />
  <circle cx="442" cy="256" r="9" fill="#ffe08a" />
  <circle cx="256" cy="442" r="9" fill="#ffe08a" />
  <circle cx="70" cy="256" r="9" fill="#ffe08a" />
  <polygon points="256,96 270,132 270,300 242,300 242,132" fill="#f3ecda" />
  <line x1="256" y1="104" x2="256" y2="296" stroke="#ffffff" stroke-width="6" stroke-linecap="round" />
  <rect x="198" y="292" width="116" height="16" rx="8" fill="#c9a24a" stroke="#1d1a16" stroke-width="3" />
  <rect x="248" y="308" width="16" height="68" rx="5" fill="#5a3022" />
  <circle cx="256" cy="384" r="14" fill="#c9a24a" />
  <circle cx="256" cy="384" r="7" fill="#3f7fa6" />
</svg>
`;

fs.writeFileSync(path.join(ICONS_DIR, "icon.svg"), svgContent);
fs.writeFileSync(path.join(ICONS_DIR, "apple-touch-icon.png"), renderIcon(180, false));
fs.writeFileSync(path.join(ICONS_DIR, "icon-192.png"), renderIcon(192, false));
fs.writeFileSync(path.join(ICONS_DIR, "icon-512.png"), renderIcon(512, false));
fs.writeFileSync(path.join(ICONS_DIR, "icon-maskable-512.png"), renderIcon(512, true));

process.stdout.write("Generated PWA icons in client/public/icons/.\n");
