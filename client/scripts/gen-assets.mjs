// Script sinh bộ asset pixel-art PNG + Phaser 3 JSON Atlas cho Tiên Giới (CC0 1.0).
// Chạy lại bằng: npm run assets -w client (hoặc node client/scripts/gen-assets.mjs)
import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import zlib from "node:zlib";

const OUT_DIR = fileURLToPath(new URL("../public/assets", import.meta.url));
const ITEMS_DIR = path.join(OUT_DIR, "items");
fs.mkdirSync(ITEMS_DIR, { recursive: true });

// ---------------- Bộ mã hóa PNG thuần Node (không cần thư viện ngoài) ----------------

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
  idx(x, y) {
    return (y * this.w + x) * 4;
  }
  set(x, y, hex, a = 255) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = this.idx(x, y);
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
  rect(x, y, w, h, hex, a = 255) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, hex, a);
  }
  ellipse(cx, cy, rx, ry, hex, a = 255) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, hex, a);
      }
    }
  }
  circle(cx, cy, r, hex, a = 255) {
    this.ellipse(cx, cy, r, r, hex, a);
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
  tri(x0, y0, x1, y1, x2, y2, hex, a = 255) {
    const minX = Math.floor(Math.min(x0, x1, x2));
    const maxX = Math.ceil(Math.max(x0, x1, x2));
    const minY = Math.floor(Math.min(y0, y1, y2));
    const maxY = Math.ceil(Math.max(y0, y1, y2));
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (area === 0) return;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const w0 = ((x1 - x) * (y2 - y) - (x2 - x) * (y1 - y)) / area;
        const w1 = ((x2 - x) * (y0 - y) - (x0 - x) * (y2 - y)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 >= -0.01 && w1 >= -0.01 && w2 >= -0.01) this.set(x, y, hex, a);
      }
    }
  }
  blit(src, dx, dy) {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const si = src.idx(x, y);
        const a = src.data[si + 3];
        if (!a) continue;
        const hex = (src.data[si] << 16) | (src.data[si + 1] << 8) | src.data[si + 2];
        this.set(dx + x, dy + y, hex, a);
      }
    }
  }
  /**
   * Biến đổi sang tư thế khác bằng lấy mẫu láng giềng gần nhất (giữ nét pixel-art, tất định, không tệp ngoài):
   * co / giãn (sx, sy) quanh điểm neo (ax, ay) rồi dịch (dx, dy). Neo ở chân để thân co lại mà bóng vẫn đứng yên.
   */
  warp({ sx = 1, sy = 1, dx = 0, dy = 0, ax = this.w / 2, ay = this.h * 0.84 }) {
    const out = new Surface(this.w, this.h);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const sxp = Math.floor((x - dx - ax) / sx + ax + 0.5);
        const syp = Math.floor((y - dy - ay) / sy + ay + 0.5);
        if (sxp < 0 || syp < 0 || sxp >= this.w || syp >= this.h) continue;
        const si = this.idx(sxp, syp);
        const oi = out.idx(x, y);
        out.data[oi] = this.data[si];
        out.data[oi + 1] = this.data[si + 1];
        out.data[oi + 2] = this.data[si + 2];
        out.data[oi + 3] = this.data[si + 3];
      }
    }
    return out;
  }
  /**
   * Đổi màu thân (không đụng bóng đổ: điểm đen trong suốt một phần): pha trắng `white` (chớp bị đánh),
   * giảm bão hoà `gray`, làm tối `dark`, nhân độ trong suốt `alpha`.
   */
  recolor({ white = 0, gray = 0, dark = 0, alpha = 1 }) {
    for (let i = 0; i < this.data.length; i += 4) {
      const a = this.data[i + 3];
      if (!a) continue;
      const r = this.data[i];
      const g = this.data[i + 1];
      const b = this.data[i + 2];
      const isShadow = r === 0 && g === 0 && b === 0 && a < 255;
      if (isShadow) {
        this.data[i + 3] = Math.round(a * alpha);
        continue;
      }
      const lum = 0.3 * r + 0.59 * g + 0.11 * b;
      const mix = (c) => {
        let v = c + (lum - c) * gray;
        v *= 1 - dark;
        v += (255 - v) * white;
        return Math.max(0, Math.min(255, Math.round(v)));
      };
      this.data[i] = mix(r);
      this.data[i + 1] = mix(g);
      this.data[i + 2] = mix(b);
      this.data[i + 3] = Math.round(a * alpha);
    }
    return this;
  }
  toPNG() {
    const raw = Buffer.alloc((this.w * 4 + 1) * this.h);
    for (let y = 0; y < this.h; y++) {
      const rowStart = y * (this.w * 4 + 1);
      raw[rowStart] = 0; // filter None
      Buffer.from(this.data.buffer, y * this.w * 4, this.w * 4).copy(raw, rowStart + 1);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0);
    ihdr.writeUInt32BE(this.h, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // RGBA
    const idat = zlib.deflateSync(raw, { level: 9 });
    return Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", ihdr),
      chunk("IDAT", idat),
      chunk("IEND", Buffer.alloc(0)),
    ]);
  }
}

function rng(seed) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

// ---------------- 1. Sinh tileset.png (256x32, 8 ô 32x32) ----------------

function buildTileset() {
  const TILE = 32;
  const s = new Surface(TILE * 8, TILE);
  const palettes = [
    [0x93a86c, 0x7f9458, 0xa5ba7e], // 0 Grass
    [0x7d9254, 0x64793e, 0x97ad6d], // 1 TallGrass
    [0xc5ae82, 0xae9669, 0xd4bf96], // 2 Dirt
    [0x5d8d99, 0x4b7985, 0x7eb0bc], // 3 Water
    [0x889e63, 0x6f854b, 0x9cb276], // 4 Tree
    [0x85817a, 0x6d6962, 0x99958d], // 5 Rock
    [0xd2c5aa, 0xb8aa8e, 0xe2d7bf], // 6 Stone
    [0xdccf9f, 0xc7b988, 0xebe0b5], // 7 Sand
  ];

  for (let t = 0; t < 8; t++) {
    const ox = t * TILE;
    const [base, dark, light] = palettes[t];
    const r = rng(2026 + t * 97);
    s.rect(ox, 0, TILE, TILE, base);

    // Hạt bề mặt pixel-art
    for (let i = 0; i < 36; i++) {
      const px = ox + Math.floor(r() * TILE);
      const py = Math.floor(r() * TILE);
      s.rect(px, py, 2, 2, i % 3 === 0 ? light : dark);
    }

    if (t === 0) {
      // Grass: cụm cỏ nhỏ
      for (let i = 0; i < 5; i++) {
        const gx = ox + 4 + Math.floor(r() * 24);
        const gy = 5 + Math.floor(r() * 23);
        s.set(gx, gy, dark);
        s.set(gx - 1, gy - 1, dark);
        s.set(gx + 1, gy - 1, light);
      }
    } else if (t === 1) {
      // TallGrass: bụi cỏ linh thảo cao
      for (let i = 0; i < 9; i++) {
        const gx = ox + 3 + Math.floor(r() * 26);
        const gy = 8 + Math.floor(r() * 21);
        s.line(gx, gy, gx - 2, gy - 6, dark);
        s.line(gx, gy, gx + 2, gy - 5, 0x4f642f);
        s.set(gx, gy - 6, light);
      }
    } else if (t === 2) {
      // Dirt: sỏi nhỏ trên đường đất
      for (let i = 0; i < 8; i++) {
        const gx = ox + 3 + Math.floor(r() * 26);
        const gy = 3 + Math.floor(r() * 26);
        s.rect(gx, gy, 3, 2, 0x947d54);
        s.set(gx, gy, light);
      }
    } else if (t === 3) {
      // Water: gợn sóng
      for (let row = 0; row < 4; row++) {
        const wy = 5 + row * 7;
        const wx = ox + 3 + (row % 2) * 5;
        s.line(wx, wy, wx + 8, wy - 1, 0xbfe6ee);
        s.line(wx + 8, wy - 1, wx + 16, wy, 0x9acbd6);
      }
    } else if (t === 4) {
      // Tree: cổ thụ xanh thẫm có bóng đổ
      s.ellipse(ox + 16, 27, 10, 4, 0x000000, 75);
      s.rect(ox + 13, 18, 6, 10, 0x5c432c);
      s.rect(ox + 15, 19, 2, 8, 0x75573b);
      s.circle(ox + 16, 13, 11, 0x334927);
      s.circle(ox + 14, 11, 9, 0x456135);
      s.circle(ox + 12, 9, 5, 0x5d7f47);
      s.circle(ox + 19, 12, 5, 0x51703d);
    } else if (t === 5) {
      // Rock: tảng đá núi có cạnh sáng tối
      s.ellipse(ox + 16, 28, 12, 4, 0x000000, 75);
      s.tri(ox + 3, 28, ox + 11, 5, ox + 28, 28, 0x55514b);
      s.tri(ox + 9, 28, ox + 19, 4, ox + 29, 28, 0x6b665e);
      s.tri(ox + 11, 5, ox + 19, 4, ox + 16, 20, 0x9c968c);
      s.line(ox + 11, 6, ox + 15, 18, 0xbab4a9);
    } else if (t === 6) {
      // Stone: gạch đá lát Lạc Hà Trấn
      for (let gy = 0; gy < 32; gy += 16) {
        const shift = gy === 16 ? 8 : 0;
        s.line(ox, gy, ox + 31, gy, 0x8f826a);
        for (let gx = shift; gx < 32; gx += 16) {
          s.line(ox + gx, gy, ox + gx, gy + 15, 0x8f826a);
          s.line(ox + gx + 1, gy + 1, ox + Math.min(31, gx + 14), gy + 1, 0xe5dac3);
        }
      }
    } else if (t === 7) {
      // Sand: vân cát
      for (let i = 0; i < 4; i++) {
        const sy = 6 + i * 7;
        s.line(ox + 4, sy, ox + 26, sy - 1, 0xc3b37e);
      }
    }
  }
  fs.writeFileSync(path.join(OUT_DIR, "tileset.png"), s.toPNG());
}

// ---------------- 2. Vẽ nhân vật tu sĩ 4 hướng (idle, walk 4 frame, slash 3 frame) ----------------

function drawCultivatorFrame(robe, trim, hair, dir, mode, step) {
  const s = new Surface(32, 40);
  const bob = mode === "walk" ? (step % 2 === 1 ? -1 : 0) : 0;
  const footSwing = mode === "walk" ? (step === 0 ? -2 : step === 2 ? 2 : 0) : 0;

  // Bóng dưới chân
  s.ellipse(16, 36, 10, 3.5, 0x000000, 65);

  // Kiếm đeo lưng (nếu nhìn lên hoặc đứng/đi bình thường)
  if (mode !== "slash") {
    s.line(22, 6 + bob, 28, 29 + bob, 0x8c9da8, 2);
    s.rect(20, 4 + bob, 4, 3, 0xd4af37);
  }

  // Giày vải
  s.rect(11 + footSwing, 33, 4, 3, 0x2b2623);
  s.rect(17 - footSwing, 33, 4, 3, 0x2b2623);

  // Thân đạo bào
  s.tri(16, 12 + bob, 5, 34 + bob, 27, 34 + bob, robe);
  s.tri(16, 14 + bob, 8, 34 + bob, 24, 34 + bob, robe);
  // Viền vạt áo và đai lưng
  if (dir === "up") {
    s.rect(14, 15 + bob, 4, 18, trim);
    s.rect(10, 22 + bob, 12, 3, trim);
  } else if (dir === "down") {
    s.line(12, 15 + bob, 16, 23 + bob, trim, 2);
    s.line(20, 15 + bob, 16, 23 + bob, trim, 2);
    s.rect(14, 22 + bob, 4, 12, trim);
    s.rect(10, 21 + bob, 12, 3, 0xc9a24a);
  } else {
    const sideShift = dir === "left" ? -2 : 2;
    s.rect(14 + sideShift, 15 + bob, 4, 18, trim);
    s.rect(10, 21 + bob, 12, 3, 0xc9a24a);
  }

  // Tay áo
  const armOffset = mode === "walk" ? -footSwing : 0;
  s.ellipse(8, 22 + bob + armOffset * 0.5, 4, 6, robe);
  s.ellipse(24, 22 + bob - armOffset * 0.5, 4, 6, robe);
  s.ellipse(8, 26 + bob + armOffset * 0.5, 3, 2, trim);
  s.ellipse(24, 26 + bob - armOffset * 0.5, 3, 2, trim);

  // Đầu & khuôn mặt
  s.circle(16, 11 + bob, 6.5, 0xf2d7b6);
  // Tóc & búi tóc đạo sĩ + trâm ngọc
  s.ellipse(16, 7 + bob, 7, 3.5, hair);
  s.circle(16, 3.5 + bob, 3.2, hair);
  s.rect(13, 3 + bob, 6, 2, 0xc9a24a);

  if (dir === "down") {
    s.rect(13, 11 + bob, 2, 2, 0x241c18);
    s.rect(17, 11 + bob, 2, 2, 0x241c18);
  } else if (dir === "left") {
    s.rect(11, 11 + bob, 2, 2, 0x241c18);
  } else if (dir === "right") {
    s.rect(19, 11 + bob, 2, 2, 0x241c18);
  } else {
    // Nhìn lên: tóc che sau gáy
    s.ellipse(16, 10 + bob, 6.5, 5, hair);
  }

  // Động tác vung kiếm (slash 0..2)
  if (mode === "slash") {
    const angles = [-0.65, 0.0, 0.65];
    const baseAngle =
      dir === "right" ? 0 : dir === "down" ? Math.PI / 2 : dir === "left" ? Math.PI : -Math.PI / 2;
    const a = baseAngle + angles[step % 3];
    const hx = 16 + Math.cos(a) * 6;
    const hy = 20 + bob + Math.sin(a) * 6;
    const tx = 16 + Math.cos(a) * 15;
    const ty = 20 + bob + Math.sin(a) * 15;
    s.line(hx, hy, tx, ty, 0xe8f6ff, 2.5);
    s.line(hx, hy, tx, ty, 0x7ec8e3, 1);
    s.circle(hx, hy, 2, 0xd4af37);
  }

  return s;
}

/**
 * Tư thế bị đánh / gục của tu sĩ (M5.2 #328 phần 2), suy từ khung ĐỨNG bằng biến đổi + màu (như yêu thú, atlas không phình):
 *   hurt-<hướng>: giật lùi ngược hướng nhìn + chớp trắng (1 khung mỗi hướng);
 *   die-0..3 (không hướng, từ khung nhìn xuống): ngã lùi chớp trắng -> khuỵu -> nằm -> nằm xám tối. Xác người chơi
 *   nằm ~5 giây rồi mờ (client), hồi sinh thì quay về đứng, nên không tan thành điểm sáng như quái.
 */
function drawCultivatorPose(robe, trim, hair, dir, pose) {
  const base = drawCultivatorFrame(
    robe,
    trim,
    hair,
    pose.startsWith("die") ? "down" : dir,
    "idle",
    0,
  );
  const recoil = dir === "right" ? -2 : dir === "left" ? 2 : 0;
  switch (pose) {
    case "hurt":
      return base.warp({ sx: 0.94, sy: 1.04, dx: recoil }).recolor({ white: 0.55 });
    case "die-0":
      return base.warp({ sx: 0.96, sy: 1.02, dx: -2 }).recolor({ white: 0.55 });
    case "die-1":
      return base.warp({ sx: 1.12, sy: 0.72, dx: -3 }).recolor({ gray: 0.25 });
    case "die-2":
      return base.warp({ sx: 1.28, sy: 0.42, dx: -3 }).recolor({ gray: 0.35, dark: 0.15 });
    case "die-3":
      return base.warp({ sx: 1.34, sy: 0.3, dx: -3 }).recolor({ gray: 0.45, dark: 0.25 });
    default:
      throw new Error(`Tư thế tu sĩ lạ: ${pose}`);
  }
}

// ---------------- 3. Vẽ 4 loại yêu thú (2 frame hoạt ảnh mỗi loại) ----------------

function drawMonsterFrame(id, step) {
  const shift = step % 2 === 1 ? -1 : 1;
  if (id === "tho") {
    // Linh Thố (32x32)
    const s = new Surface(32, 32);
    s.ellipse(16, 26, 9, 3, 0x000000, 60);
    // Đuôi bông
    s.circle(8, 20 + shift, 3.5, 0xffffff);
    // Thân thỏ trắng ngà
    s.ellipse(16, 20 + shift, 8, 6.5, 0xf5f0e4);
    s.ellipse(17, 21 + shift, 6, 4.5, 0xffffff);
    // Đầu & đôi tai dài
    s.circle(21, 15 + shift, 5, 0xf5f0e4);
    s.ellipse(18, 7 + shift, 2.2, 6, 0xf5f0e4);
    s.ellipse(18, 7 + shift, 1.1, 4, 0xebb3b8);
    s.ellipse(22, 7 + shift, 2.2, 6, 0xf5f0e4);
    s.ellipse(22, 7 + shift, 1.1, 4, 0xebb3b8);
    // Mắt đỏ ngọc
    s.rect(23, 14 + shift, 2, 2, 0xd93848);
    return s;
  }
  if (id === "lang") {
    // Hôi Lang (40x40)
    const s = new Surface(40, 40);
    s.ellipse(20, 33, 13, 4, 0x000000, 65);
    // Đuôi sói
    s.tri(4, 18 - shift, 11, 21, 9, 26, 0x686e78);
    // Chân
    s.rect(12 + shift, 27, 3, 6, 0x595e66);
    s.rect(17 - shift, 27, 3, 6, 0x686e78);
    s.rect(24 + shift, 27, 3, 6, 0x595e66);
    s.rect(28 - shift, 27, 3, 6, 0x686e78);
    // Thân & bờm
    s.ellipse(20, 22, 11, 7, 0x848994);
    s.ellipse(24, 19, 7, 6, 0x9aa0ab);
    // Đầu + mõm + tai nhọn
    s.ellipse(29, 15 + shift * 0.5, 6, 5, 0x848994);
    s.tri(31, 13, 38, 16, 31, 18, 0x686e78);
    s.tri(25, 11, 27, 5, 30, 11, 0x595e66);
    s.tri(29, 11, 32, 5, 34, 11, 0x595e66);
    // Mắt vàng dữ tợn + nanh trắng
    s.rect(31, 13, 2, 2, 0xffd24c);
    s.set(35, 18, 0xffffff);
    return s;
  }
  if (id === "ho") {
    // Hắc Hổ (48x48)
    const s = new Surface(48, 48);
    s.ellipse(24, 40, 16, 5, 0x000000, 75);
    // Đuôi hổ uốn cong
    s.line(6, 18 + shift, 13, 27, 0x242026, 3);
    // Chân khỏe
    s.rect(14 + shift, 31, 4, 8, 0x1f1b21);
    s.rect(20 - shift, 31, 4, 8, 0x2e2930);
    s.rect(29 + shift, 31, 4, 8, 0x1f1b21);
    s.rect(34 - shift, 31, 4, 8, 0x2e2930);
    // Thân hổ đen vằn vàng kim
    s.ellipse(24, 26, 14, 9, 0x2e2930);
    for (let i = -2; i <= 2; i++) {
      s.line(22 + i * 4, 18, 23 + i * 4, 30, 0xd8a63a, 1.8);
    }
    // Đầu hổ + tai + mắt hoàng kim
    s.circle(35, 19 + shift * 0.5, 7.5, 0x2e2930);
    s.circle(31, 12, 3, 0x1f1b21);
    s.circle(38, 12, 3, 0x1f1b21);
    s.rect(37, 17, 3, 2, 0xffd74a);
    s.tri(39, 23, 41, 27, 38, 24, 0xffffff);
    return s;
  }
  if (id === "suong_ho") {
    // Sương Hồ (40x40): hồ ly sương xanh nhạt, hai đuôi bông, mắt lục lam
    const s = new Surface(40, 40);
    s.ellipse(20, 34, 13, 4, 0x000000, 60);
    // Hai đuôi bông sau lưng, đầu đuôi phát sáng
    s.ellipse(8, 22 - shift, 7, 3.6, 0xcfe3ea);
    s.ellipse(9, 27 + shift * 0.5, 6, 3, 0xb4cfd9);
    s.circle(3, 19 - shift, 3, 0xeaf6fa);
    s.circle(4, 26 + shift * 0.5, 2.4, 0xeaf6fa);
    s.circle(3, 19 - shift, 4.5, 0xbfeaf2, 70);
    // Chân thanh
    s.rect(13 + shift, 28, 3, 6, 0x8fa8b4);
    s.rect(18 - shift, 28, 3, 6, 0xa6bfca);
    s.rect(24 + shift, 28, 3, 6, 0x8fa8b4);
    s.rect(28 - shift, 28, 3, 6, 0xa6bfca);
    // Thân và bụng sáng
    s.ellipse(20, 24, 10, 6, 0xbfd7e0);
    s.ellipse(21, 26, 7, 3, 0xe6f1f5);
    // Đầu, mõm nhọn, hai tai
    s.ellipse(29, 18 + shift * 0.5, 6, 5, 0xbfd7e0);
    s.tri(33, 17, 39, 20, 33, 22, 0xcfe3ea);
    s.tri(25, 14, 27, 5, 31, 13, 0x8fa8b4);
    s.tri(29, 13, 33, 5, 35, 14, 0x8fa8b4);
    s.tri(27, 12, 28, 8, 30, 12, 0xeab3c0);
    // Mắt lục lam, mũi
    s.rect(32, 17, 2, 2, 0x4fe0c0);
    s.set(38, 20, 0x20303a);
    // Làn sương quanh chân
    s.circle(14, 33, 2.2, 0xffffff, 80);
    s.circle(26, 34, 2.6, 0xffffff, 70);
    return s;
  }
  if (id === "thach_quy") {
    // Thạch Quy (48x48): rùa đá mai phủ rêu, chậm và dày
    const s = new Surface(48, 48);
    s.ellipse(24, 41, 18, 5, 0x000000, 70);
    // Chân ngắn to
    s.rect(11 + shift, 34, 6, 7, 0x7d8c6c);
    s.rect(19 - shift, 35, 6, 6, 0x6f7f5e);
    s.rect(28 + shift, 34, 6, 7, 0x7d8c6c);
    // Đuôi ngắn
    s.tri(6, 30, 11, 28, 11, 33, 0x6f7f5e);
    // Mai đá vòm + các mảng mai
    s.ellipse(22, 27, 16, 13, 0x5c6b4e);
    s.ellipse(22, 25, 14, 11, 0x6f7f5e);
    s.line(14, 22, 30, 22, 0x4b5840, 1.4);
    s.line(22, 14, 22, 33, 0x4b5840, 1.4);
    s.line(15, 30, 29, 18, 0x4b5840, 1);
    s.line(15, 18, 29, 30, 0x4b5840, 1);
    // Rêu xanh trên mai
    s.ellipse(17, 19, 4, 2.2, 0x7fa24f);
    s.ellipse(28, 21, 3, 2, 0x8fb85a);
    s.circle(21, 30, 2, 0x7fa24f);
    // Đầu thò ra phía phải, mắt vàng đục
    s.ellipse(38, 30 + shift * 0.5, 6, 4.5, 0x8a9a78);
    s.rect(40, 28 + shift * 0.5, 2, 2, 0xe8d36a);
    s.line(37, 33 + shift * 0.5, 43, 33 + shift * 0.5, 0x4b5840, 1);
    return s;
  }
  if (id === "doc_thiem") {
    // Độc Thiềm (40x40): cóc độc tím, mắt lồi, mụn độc
    const s = new Surface(40, 40);
    s.ellipse(20, 34, 14, 4, 0x000000, 65);
    // Chân sau gập
    s.ellipse(10, 31, 5, 4, 0x56467a);
    s.rect(7 + shift, 33, 7, 2, 0x56467a);
    s.ellipse(26, 32, 4, 3, 0x6b5a90);
    s.rect(24 - shift, 34, 6, 2, 0x56467a);
    // Thân phình
    s.ellipse(19, 26, 13, 9, 0x6b5a90);
    s.ellipse(20, 30, 9, 4, 0xb9d98a);
    // Mụn độc
    for (const [x, y] of [
      [13, 22],
      [19, 20],
      [25, 23],
      [16, 27],
      [23, 27],
    ])
      s.circle(x, y, 1.6, 0x8fe35a);
    // Đầu rộng + miệng + hai mắt lồi vàng
    s.ellipse(30, 22 + shift * 0.5, 7, 5.5, 0x6b5a90);
    s.line(26, 25 + shift * 0.5, 36, 25 + shift * 0.5, 0x2a1f40, 1.2);
    s.circle(28, 17 + shift * 0.5, 3, 0xffd24c);
    s.circle(34, 17 + shift * 0.5, 3, 0xffd24c);
    s.rect(28, 16 + shift * 0.5, 1, 3, 0x20182e);
    s.rect(34, 16 + shift * 0.5, 1, 3, 0x20182e);
    // Giọt độc nhỏ
    s.circle(36, 28 + shift, 1.3, 0x8fe35a, 220);
    return s;
  }
  if (id === "hac_giao") {
    // Hắc Giao (Boss 80x72): giao long đen biếc cuộn, sừng, râu, vây lưng
    const s = new Surface(80, 72);
    s.ellipse(40, 64, 30, 8, 0x000000, 80);
    // Thân cuộn ba tầng
    s.ellipse(36, 54, 26, 9, 0x16222f);
    s.ellipse(40, 43 + shift, 21, 8, 0x1d3550);
    s.ellipse(37, 32 - shift, 15, 7, 0x24465f);
    // Vảy ánh lam
    for (let x = 18; x <= 56; x += 6) {
      s.circle(x, 54, 2, 0x2e5a7a);
      s.circle(x + 2, 43 + shift, 1.8, 0x3e7a9a);
    }
    s.circle(30, 32 - shift, 1.6, 0x4a90b0);
    s.circle(40, 33 - shift, 1.6, 0x4a90b0);
    // Vây lưng răng cưa
    for (let x = 12; x <= 52; x += 8)
      s.tri(x, 46 + shift, x + 4, 38 + shift, x + 8, 46 + shift, 0x3e7a9a);
    // Cổ và đầu giao: hàm, hai sừng, râu dài
    s.ellipse(48, 20 + shift, 13, 8, 0x1d3550);
    s.ellipse(54, 17 + shift, 9, 6.5, 0x24465f);
    s.tri(58, 17 + shift, 70, 20 + shift, 58, 24 + shift, 0x1d3550);
    s.tri(46, 12 + shift, 42, 2 + shift, 51, 11 + shift, 0xd9e3ea);
    s.tri(53, 11 + shift, 52, 1 + shift, 58, 10 + shift, 0xd9e3ea);
    s.line(66, 22 + shift, 76, 28 + shift, 0x6fc3e6, 1.4);
    s.line(66, 19 + shift, 76, 12 + shift, 0x6fc3e6, 1.4);
    // Mắt lam phát sáng + răng nanh
    s.circle(57, 15 + shift, 4, 0x6fc3e6, 80);
    s.rect(56, 14 + shift, 3, 2, 0xcff4ff);
    s.tri(62, 22 + shift, 64, 27 + shift, 60, 23 + shift, 0xffffff);
    return s;
  }
  if (id === "yeu_vuong") {
    // Linh Hư Yêu Vương (Boss bí cảnh 72x72): yêu thú tím sừng gai, mắt hoàng kim, quầng ma khí
    const s = new Surface(72, 72);
    s.ellipse(36, 64, 28, 7, 0x000000, 80);
    s.circle(36, 34, 30, 0x7a3fb0, 40);
    // Thân to, chân vuốt
    s.rect(18 + shift, 50, 7, 12, 0x3d1b5c);
    s.rect(46 - shift, 50, 7, 12, 0x3d1b5c);
    s.ellipse(36, 42, 22, 15, 0x5b2a8c);
    s.ellipse(37, 46, 15, 8, 0x7a3fb0);
    // Gai lưng
    for (let x = 18; x <= 52; x += 8) s.tri(x, 32, x + 4, 22 + shift, x + 8, 32, 0x3d1b5c);
    // Đầu + hai sừng cong + mắt hoàng kim + răng
    s.ellipse(50, 24 + shift, 12, 10, 0x5b2a8c);
    s.tri(42, 18 + shift, 36, 4 + shift, 48, 16 + shift, 0xe8d9f5);
    s.tri(54, 15 + shift, 56, 3 + shift, 61, 16 + shift, 0xe8d9f5);
    s.rect(52, 21 + shift, 4, 3, 0xffd24c);
    s.rect(45, 22 + shift, 3, 2, 0xffd24c);
    s.line(46, 30 + shift, 58, 30 + shift, 0x20102e, 1.6);
    s.tri(48, 30 + shift, 50, 35 + shift, 52, 30 + shift, 0xffffff);
    s.tri(54, 30 + shift, 56, 35 + shift, 58, 30 + shift, 0xffffff);
    return s;
  }
  // ---- Quái Nguyên Anh của Hàn Vân Lĩnh (M7.5b #506): tranh vẽ TRƯỚC khi loài vào `shared/` (id chưa có trong MONSTERS thì vô hại) ----
  if (id === "han_lang") {
    // Hàn Lang (48x44): sói băng to hơn Hôi Lang, lông xanh nhạt, bờm và gai lưng bằng tinh thể băng, mắt lam phát sáng
    const s = new Surface(48, 44);
    s.ellipse(24, 38, 16, 4, 0x000000, 65);
    // Đuôi
    s.tri(4, 20 - shift, 13, 24, 10, 31, 0x7ea3bd);
    s.tri(4, 20 - shift, 8, 14 - shift, 9, 22, 0xe6f6ff);
    // Chân
    s.rect(13 + shift, 30, 4, 8, 0x6f93ad);
    s.rect(19 - shift, 30, 4, 8, 0x86aac4);
    s.rect(28 + shift, 30, 4, 8, 0x6f93ad);
    s.rect(33 - shift, 30, 4, 8, 0x86aac4);
    // Thân, bụng sáng, bờm băng
    s.ellipse(23, 25, 13, 8, 0x9fc4dc);
    s.ellipse(24, 28, 9, 4, 0xd6ecf7);
    s.ellipse(29, 21, 8, 7, 0xbfd9ec);
    for (let x = 12; x <= 30; x += 6)
      s.tri(x, 19 + shift * 0.5, x + 3, 10 + shift, x + 6, 19, 0xe6f6ff);
    // Đầu, mõm, tai
    s.ellipse(35, 17 + shift * 0.5, 7, 6, 0x9fc4dc);
    s.tri(37, 15, 46, 19, 37, 21, 0x86aac4);
    s.tri(30, 12, 32, 4, 36, 12, 0x6f93ad);
    s.tri(35, 11, 38, 3, 40, 12, 0x6f93ad);
    // Mắt lam phát sáng + nanh băng
    s.circle(38, 15, 3, 0x7fe8ff, 70);
    s.rect(37, 14, 3, 2, 0xdff9ff);
    s.tri(41, 21, 43, 26, 39, 22, 0xffffff);
    // Sương lạnh quanh chân
    s.circle(14, 38, 2.2, 0xffffff, 80);
    s.circle(30, 39, 2.6, 0xffffff, 70);
    return s;
  }
  if (id === "phong_nha") {
    // Phong Nha (44x44): chim săn nanh thép, lông bạc xám, cánh dựng như lưỡi dao, mỏ và vuốt vàng kim (hệ kim, bắn đạn)
    const s = new Surface(44, 44);
    s.ellipse(22, 38, 14, 4, 0x000000, 65);
    // Chân vuốt vàng
    s.rect(18 + shift, 31, 2, 7, 0xe8c25a);
    s.rect(24 - shift, 31, 2, 7, 0xe8c25a);
    s.tri(15, 38, 21, 38, 18, 35, 0xe8c25a);
    s.tri(22, 38, 28, 38, 25, 35, 0xe8c25a);
    // Đuôi lưỡi
    s.tri(6, 31 - shift, 15, 26, 14, 34, 0x7b808c);
    s.tri(9, 36, 16, 30, 17, 35, 0x9aa0ab);
    // Thân và ngực sáng
    s.ellipse(22, 25, 11, 9, 0xc9ccd6);
    s.ellipse(25, 28, 7, 6, 0xeef0f4);
    // Cánh dựng (hai lớp lưỡi thép)
    s.tri(10, 24, 7, 6 - shift, 21, 19, 0x9aa0ab);
    s.tri(15, 22, 14, 3 - shift, 25, 18, 0xb4b9c4);
    s.tri(20, 20, 22, 4 - shift, 29, 18, 0xc9ccd6);
    s.line(10, 22, 8, 8 - shift, 0xeef0f4, 1);
    s.line(15, 20, 14, 5 - shift, 0xeef0f4, 1);
    // Đầu, mỏ quặp vàng, mắt
    s.circle(31, 17 + shift * 0.5, 6, 0xc9ccd6);
    s.tri(34, 14, 43, 19, 34, 21, 0xe8c25a);
    s.tri(39, 19, 42, 25, 37, 21, 0xb08a2a);
    s.circle(31, 14, 2.6, 0xffe066, 80);
    s.rect(30, 14, 2, 2, 0x20202a);
    s.tri(27, 12, 28, 6, 31, 11, 0x7b808c);
    return s;
  }
  if (id === "cot_tuong") {
    // Cốt Tượng (56x52): voi xương khổng lồ, chậm và đồ sộ; thân ngà xương, hốc mắt than hồng, hai ngà cong, đất khô bám chân (hệ thổ, đập đất)
    const s = new Surface(56, 52);
    s.ellipse(28, 47, 22, 5, 0x000000, 70);
    // Bốn chân to như cột
    s.rect(11 + shift, 36, 8, 11, 0x9a8a6a);
    s.rect(21 - shift, 37, 8, 10, 0xb8aa88);
    s.rect(32 + shift, 36, 8, 11, 0x9a8a6a);
    s.rect(41 - shift, 37, 7, 10, 0xb8aa88);
    s.rect(10, 45, 10, 2, 0x8a6a42);
    s.rect(31, 45, 10, 2, 0x8a6a42);
    // Thân xương: khung sườn + cột sống
    s.ellipse(26, 28, 19, 12, 0xe8dfc8);
    s.ellipse(26, 31, 14, 7, 0xcdbfa0);
    for (let x = 14; x <= 38; x += 6) s.line(x, 21, x + 1, 36, 0x5a4630, 1.5);
    s.line(10, 19 + shift * 0.5, 40, 19 + shift * 0.5, 0x8a6a42, 2);
    for (let x = 12; x <= 38; x += 6) s.tri(x, 19, x + 3, 13 + shift, x + 6, 19, 0xf4ecd8);
    // Đuôi xương
    s.line(7, 26, 3, 36 + shift, 0xcdbfa0, 2);
    s.circle(3, 37 + shift, 2, 0xe8dfc8);
    // Đầu sọ voi, vòi xương, hai ngà
    s.ellipse(42, 22 + shift * 0.5, 10, 9, 0xe8dfc8);
    s.ellipse(46, 25, 4, 7, 0xcdbfa0);
    s.line(50, 28, 52, 38, 0xcdbfa0, 3);
    s.tri(40, 28, 54, 33 + shift * 0.5, 41, 31, 0xfff4d8);
    s.tri(43, 29, 55, 40, 45, 32, 0xfff4d8);
    s.ellipse(41, 16 + shift, 5, 4, 0xcdbfa0);
    // Hốc mắt than hồng
    s.circle(44, 20 + shift * 0.5, 3.2, 0x3a2a1c);
    s.rect(43, 19 + shift * 0.5, 2, 2, 0xff5a3a);
    // Đất khô bám + tuyết phủ lưng và đầu (Hàn Vân Lĩnh: "xương voi phủ tuyết")
    s.circle(16, 44, 2, 0x8a6a42);
    s.circle(36, 45, 2.4, 0x8a6a42);
    s.ellipse(22, 17 + shift * 0.5, 9, 2.2, 0xffffff, 235);
    s.ellipse(33, 16 + shift * 0.5, 4, 1.8, 0xf2f9ff, 235);
    s.ellipse(41, 12 + shift, 4, 1.8, 0xffffff, 235);
    s.circle(14, 30, 1.6, 0xffffff, 200);
    s.circle(29, 33, 1.4, 0xffffff, 200);
    return s;
  }
  if (id === "doc_tuoc") {
    // Độc Tước (36x36): sẻ độc nhỏ, lông lục thẫm, bụng vàng nhạt, túi độc tím phát sáng ở cổ họng, mỏ cam (hệ mộc, bắn đạn độc)
    const s = new Surface(36, 36);
    s.ellipse(18, 31, 11, 3, 0x000000, 60);
    // Chân mảnh
    s.rect(15 + shift, 26, 1, 5, 0xe8a33a);
    s.rect(20 - shift, 26, 1, 5, 0xe8a33a);
    // Đuôi
    s.tri(4, 24 - shift, 12, 19, 12, 27, 0x3f6e34);
    s.tri(6, 27, 12, 22, 13, 28, 0x5f9a4a);
    // Thân và bụng
    s.ellipse(18, 20, 10, 8, 0x5f9a4a);
    s.ellipse(20, 23, 7, 5, 0xd7e89a);
    // Cánh
    s.tri(9, 20, 6, 10 - shift, 20, 16, 0x3f6e34);
    s.tri(13, 18, 13, 8 - shift, 22, 15, 0x4f8640);
    // Đầu, mỏ cam, mắt đỏ
    s.circle(26, 14 + shift * 0.5, 5, 0x5f9a4a);
    s.tri(29, 12, 36, 15, 29, 18, 0xe8a33a);
    s.circle(26, 12, 2, 0xff4d5a, 70);
    s.rect(25, 12, 2, 2, 0x20182e);
    // Túi độc tím ở cổ họng + giọt độc
    s.circle(27, 20, 2.6, 0x9a5fc8);
    s.circle(27, 20, 4.2, 0xbf8aff, 60);
    s.circle(33, 21 + shift, 1.1, 0x8fe35a, 220);
    return s;
  }
  if (id === "thien_han_vuong") {
    // Thiên Hàn Vương (Boss 88x80): sư tử băng khổng lồ, bờm tinh thể, mão băng, mắt lam phát sáng, quầng hàn khí (hệ thủy, trùm đội 3-4 người)
    const s = new Surface(88, 80);
    s.ellipse(44, 72, 34, 8, 0x000000, 85);
    s.circle(44, 38, 36, 0x6fc3e6, 38);
    // Đuôi có túm băng
    s.line(8, 40, 3, 56 + shift, 0x4a86b8, 3);
    s.tri(2, 52 + shift, 9, 52 + shift, 5, 64 + shift, 0xcfeeff);
    // Bốn chân vuốt
    s.rect(18 + shift, 56, 9, 14, 0x24507a);
    s.rect(32 - shift, 57, 9, 13, 0x2d5f8c);
    s.rect(50 + shift, 56, 9, 14, 0x24507a);
    s.rect(63 - shift, 57, 8, 13, 0x2d5f8c);
    s.tri(17, 70, 28, 70, 22, 66, 0xe6f6ff);
    s.tri(62, 70, 73, 70, 67, 66, 0xe6f6ff);
    // Thân đồ sộ + bụng sáng
    s.ellipse(40, 46, 29, 17, 0x2d5f8c);
    s.ellipse(42, 52, 20, 9, 0x4a86b8);
    // Bờm tinh thể: hai hàng gai băng quanh cổ và lưng
    for (let x = 14; x <= 52; x += 7)
      s.tri(x, 33 + shift * 0.5, x + 4, 20 + shift, x + 8, 33, 0x8fd0ee);
    for (let x = 18; x <= 56; x += 7) s.tri(x, 30, x + 3, 22 - shift, x + 6, 30, 0xcfeeff);
    s.ellipse(58, 30 + shift * 0.5, 17, 15, 0x8fd0ee);
    for (let a = 0; a < 9; a++) {
      const ang = -Math.PI * 0.95 + (a * Math.PI * 1.05) / 8;
      const bx = 58 + Math.cos(ang) * 15;
      const by = 30 + Math.sin(ang) * 14;
      s.tri(
        bx - 3,
        by,
        bx + 3,
        by,
        bx + Math.cos(ang) * 9,
        by + Math.sin(ang) * 9 + shift * 0.5,
        0xcfeeff,
      );
    }
    // Mặt: mõm, mão băng ba mũi, mắt lam, răng nanh
    s.ellipse(63, 33 + shift * 0.5, 10, 8, 0x4a86b8);
    s.ellipse(70, 37 + shift * 0.5, 7, 5, 0x6aa0cc);
    s.tri(54, 18 + shift, 57, 4 + shift, 60, 17 + shift, 0xffffff);
    s.tri(60, 17 + shift, 64, 1 + shift, 68, 17 + shift, 0xe6f6ff);
    s.tri(68, 18 + shift, 72, 5 + shift, 74, 19 + shift, 0xffffff);
    s.circle(64, 28 + shift * 0.5, 5, 0x9ff0ff, 80);
    s.rect(63, 27 + shift * 0.5, 4, 3, 0xeaffff);
    s.circle(73, 34 + shift * 0.5, 1.4, 0x20303a);
    s.line(64, 41 + shift * 0.5, 76, 41 + shift * 0.5, 0x10203a, 1.5);
    s.tri(66, 41 + shift * 0.5, 68, 47 + shift * 0.5, 70, 41 + shift * 0.5, 0xffffff);
    s.tri(72, 41 + shift * 0.5, 74, 47 + shift * 0.5, 76, 41 + shift * 0.5, 0xffffff);
    // Hàn khí quanh chân
    s.circle(24, 70, 3, 0xffffff, 80);
    s.circle(52, 72, 3.4, 0xffffff, 70);
    return s;
  }
  if (id !== "mang") throw new Error(`Chưa có tranh quái: ${id}`);
  // Xích Mãng (Boss 64x64)
  const s = new Surface(64, 64);
  s.ellipse(32, 54, 24, 7, 0x000000, 80);
  // Thân mãng xà cuộn 3 tầng đỏ thẫm + vảy vàng
  s.ellipse(30, 46, 20, 8, 0x8f1d21);
  s.ellipse(32, 37 + shift, 16, 7, 0xb3262a);
  s.ellipse(30, 27 - shift, 12, 6, 0xc93236);
  for (let x = 18; x <= 44; x += 6) {
    s.circle(x, 46, 2, 0xe8c25a);
    s.circle(x + 2, 37 + shift, 1.8, 0xe8c25a);
  }
  // Cổ & đầu rắn hổ mang bành + sừng linh thú
  s.ellipse(35, 16 + shift, 11, 8, 0x8f1d21);
  s.circle(37, 14 + shift, 7, 0xb3262a);
  s.tri(33, 8 + shift, 30, 2 + shift, 36, 8 + shift, 0xe8c25a);
  s.tri(39, 8 + shift, 38, 2 + shift, 42, 8 + shift, 0xe8c25a);
  // Mắt hoàng kim + lưỡi chẻ
  s.rect(40, 12 + shift, 3, 2, 0xffe066);
  s.line(44, 16 + shift, 52, 15 + shift, 0xff4d6d, 1.5);
  s.line(52, 15 + shift, 55, 13 + shift, 0xff4d6d, 1);
  s.line(52, 15 + shift, 55, 17 + shift, 0xff4d6d, 1);
  return s;
}

/**
 * Tư thế chiến đấu của yêu thú, suy từ khung `move` (biến thể bằng biến đổi + màu, KHÔNG vẽ lại từng khung để atlas không phình;
 * thiết kế M5 mục 8). Quái vẽ quay sang PHẢI (client lật khi nhìn trái).
 *   atk-0 dồn lực (co lại, lùi), atk-1 vồ (giãn ra, lao tới, vệt vuốt);
 *   hurt chớp trắng + giật lùi (1 khung);
 *   die-0..3: giật lùi chớp trắng -> đổ bẹp xám -> nằm tối -> tan thành điểm sáng.
 */
function drawMonsterPose(id, pose) {
  const base = drawMonsterFrame(id, 0);
  const w = base.w;
  const h = base.h;
  switch (pose) {
    case "atk-0":
      return base.warp({ sx: 0.92, sy: 1.08, dx: -1 });
    case "atk-1": {
      const s = base.warp({ sx: 1.18, sy: 0.92, dx: Math.round(w * 0.06) });
      // Vệt vuốt phía trước
      const x0 = w - 9;
      const y0 = Math.round(h * 0.28);
      for (let i = 0; i < 3; i++)
        s.line(x0 + i * 2, y0 + i * 3, x0 + 5 + i * 2, y0 + 9 + i * 3, 0xffffff, 1.2, 210);
      return s;
    }
    case "hurt":
      return base.warp({ sx: 0.94, sy: 1.04, dx: -2 }).recolor({ white: 0.6 });
    case "die-0":
      return base.warp({ sx: 0.94, sy: 1.04, dx: -3 }).recolor({ white: 0.6 });
    case "die-1":
      return base.warp({ sx: 1.1, sy: 0.7, dx: -3 }).recolor({ gray: 0.5 });
    case "die-2":
      return base
        .warp({ sx: 1.2, sy: 0.35, dx: -3 })
        .recolor({ gray: 0.6, dark: 0.45, alpha: 0.8 });
    case "die-3": {
      // Tan thành điểm sáng: thân mờ gần hết + vài đốm hồn bay lên (vị trí tất định theo id)
      const s = base
        .warp({ sx: 1.2, sy: 0.2, dx: -3 })
        .recolor({ gray: 0.7, dark: 0.5, alpha: 0.25 });
      const r = rng(id.length * 7919 + id.charCodeAt(0));
      for (let i = 0; i < 6; i++) {
        const px = w * 0.2 + r() * w * 0.6;
        const py = h * 0.78 - r() * h * 0.4;
        s.circle(px, py, 1 + r() * 1.2, i % 2 ? 0xffffff : 0xbfe8ff, 220 - i * 20);
      }
      return s;
    }
    default:
      throw new Error(`Tư thế yêu thú lạ: ${pose}`);
  }
}
const MONSTER_POSES = ["atk-0", "atk-1", "hurt", "die-0", "die-1", "die-2", "die-3"];

// ---------------- 4. Vẽ vật phẩm (24x24) & Hiệu ứng ----------------

/** Bảng màu trang bị: kiếm [thân, lưỡi, chuôi, độ dày], pháp bào [vải, viền], hộ phù [thân, linh văn]. */
const SWORDS = {
  lang_nha_kiem: [0xdce6ef, 0xffffff, 0x7a6548, 3.2],
  hac_ho_kiem: [0x564b40, 0xe8a838, 0x2b221b, 3.2],
  xich_mang_kiem: [0xe04838, 0xffd34d, 0x781818, 3.2],
  suong_vu_kiem: [0x5d8fa5, 0xeaf6fa, 0x2c4a5a, 2.4], // mỏng như sương; thân đậm hơn màu nền ô túi (def.color 0xa9cfdc) để không chìm
  huyen_quy_kiem: [0x56674a, 0xc9d36a, 0x2f3a28, 4.4], // dày nặng
  hac_giao_kiem: [0x24465f, 0x6fc3e6, 0x16222f, 3.4],
  han_vu_kiem: [0x6fa9cf, 0xf2fbff, 0x2c4a6a, 2.6], // Nguyên Anh (M7.5c): lưỡi băng mảnh, mép trắng
};
const ROBES = {
  tho_nhung_bao: [0xe9e1cf, 0x4ba368],
  hac_ho_bao: [0x3a3028, 0xe8a838],
  xich_lan_bao: [0xa32a22, 0xffd34d],
  suong_ho_bao: [0x7fa6b8, 0x2f5f78], // vải đậm hơn màu nền ô túi (def.color 0xd9e7ec)
  quy_giap_bao: [0x49573f, 0xc9d36a],
  giao_lan_bao: [0x1d3550, 0x6fc3e6],
  han_lang_bao: [0x7fa6c8, 0x1f4f8f], // Nguyên Anh (M7.5c): vải xanh băng đậm hơn nền ô túi
};
const TALISMANS = {
  lang_nha_phu: [0x9c9585, 0x9fd0ea],
  ho_hon_phu: [0x6b5a44, 0xffd34d],
  mang_dam_phu: [0xc0392b, 0xffb23f],
  ho_tam_phu: [0x8fb4c4, 0xeaf6fa],
  quy_tuc_phu: [0x6e8060, 0xc9d36a],
  giao_long_phu: [0x2e5a7a, 0x6fc3e6],
  phong_nha_phu: [0x9aa0ab, 0xe8c25a], // Nguyên Anh (M7.5c): phù thép, linh văn vàng kim
};

// Đồ ba ô RIÊNG của chủ (M7.4, shared/src/owner-gear.ts): hài, ngọc bội, pháp bảo: [màu chính, màu phụ]. Hình tạm vẽ bằng code, đổi màu theo bậc.
const BOOTS = {
  ho_bo_ngoa: [0xc99636, 0x6e5a2a],
  mang_hanh_ngoa: [0x4f7a3c, 0x2f4a24],
  suong_van_ngoa: [0xa9c6d8, 0xeaf6fa],
  giao_anh_ngoa: [0x2e5a7a, 0x6fc3e6],
  tuyet_hanh_ngoa: [0xa4c4d8, 0x2f5f9a], // Nguyên Anh (M7.5c): hài tuyết, miệng và đế xanh sẫm
};
const JADES = {
  tho_nguyet_boi: [0xe6e0cc, 0xb8b09a],
  mang_tinh_boi: [0x6fa05a, 0x3c5e2c],
  suong_linh_boi: [0xa4c4d8, 0xe6f1f5],
  giao_chau_boi: [0x3a6e92, 0x7fd0f0],
  han_tinh_boi: [0xbfe4f6, 0x3a86b8], // Nguyên Anh (M7.5c): sao băng sáu cánh
};
const TREASURE_ICONS = {
  ho_than_an: [0x6a8caf, 0xd8e6f2],
  hap_linh_chau: [0x7a6ac8, 0xd6ccff],
  xich_diem_an: [0xc8503a, 0xffb08a],
  han_bang_an: [0x7ab8e0, 0xe6f6ff],
  dinh_tam_chung: [0xc9a24a, 0xfff0b0],
  phong_hanh_boi: [0x9ad0b8, 0xe6fff4],
};

// Kinh quyển của 12 chiêu (M7.4, shared/src/books.ts: id `kinh_<chiêu>`): [màu bìa theo hệ, màu phụ]. Hình tạm vẽ bằng code.
const BOOKS = {
  kinh_hoa_van_kiem: [0xd9433b, 0xffd0a0],
  kinh_bon_thach_quyen: [0xa8803a, 0xf0d9a0],
  kinh_ung_trao: [0xc8ccd4, 0x8a93a0],
  kinh_trong_nhac_tram: [0x8f6a2e, 0xe6c98a],
  kinh_huyen_bang_chi: [0x9fd0ea, 0xe6f6ff],
  kinh_kim_chung_trao: [0xb8bcc8, 0xf2e6a0],
  kinh_bich_thuy_hoi_xuan: [0x3b7bd9, 0xbfe0ff],
  kinh_phieu_phong_bo: [0x9ad0b8, 0xe6fff4],
  kinh_thanh_tung_phi_cham: [0x5e9a4a, 0xd0f0b8],
  kinh_lac_tuyet_phan_phi: [0x7ab8e0, 0xffffff],
  kinh_cuu_cung_khon_sat: [0x8a6a2a, 0xffd34d],
  kinh_me_tung_bo: [0x6fbfa0, 0xe6fff4],
  // Đợt 2 (Nguyên Anh, #654): màu bìa theo hệ như đợt 1, nhưng MỖI quyển có dấu riêng giữa bìa (phần tử thứ ba) để không trùng pixel với quyển cùng hệ.
  // Hình có TRƯỚC vật phẩm trong `shared/` (id chưa có trong ITEMS thì vô hại; Dev D thêm chiêu + quyển sau, atlas.test.ts đòi icon cho mọi vật phẩm).
  kinh_han_quang_tien: [0x9fd0ea, 0xe6f6ff, "tien"],
  kinh_bach_kim_trao: [0xc8ccd4, 0x5a626e, "trao"],
  kinh_van_thach_tran: [0xa8803a, 0xf0d9a0, "tran"],
  kinh_bang_hoa_loan: [0xa8dcf0, 0xffffff, "hoa"],
  kinh_liet_hoa_kiem: [0xd9433b, 0xffd0a0, "kiem"],
  kinh_van_hanh_bo: [0x9ad0b8, 0xe6fff4, "bo"],
};

/**
 * Tô theo hàm khoảng cách có dấu `sd(x, y)` (< 0 là bên trong) tại tâm từng điểm ảnh: viền `edge` rộng ~1 px rồi lõi `fill`. Dùng cho ngọc bội và pháp bảo (M7.4),
 * nơi mỗi món một HÌNH RIÊNG (trước đây ngọc bội đều là đĩa tròn có lỗ đen giữa trông như con mắt, sáu pháp bảo cùng một ấn vuông chỉ khác màu).
 */
function sdfShape(s, sd, fill, edge) {
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const d = sd(x + 0.5, y + 0.5);
      if (d <= 0) s.set(x, y, d <= -1.1 ? fill : edge);
    }
  }
}
const sdCircle = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;
const sdBox =
  (cx, cy, hw, hh, rad = 0) =>
  (x, y) => {
    const qx = Math.abs(x - cx) - (hw - rad);
    const qy = Math.abs(y - cy) - (hh - rad);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;
  };
const sdDiamond = (cx, cy, hw, hh) => (x, y) => {
  // gần đúng khoảng cách tới hình thoi (đủ cho 24 x 24)
  const k = (Math.abs(x - cx) / hw + Math.abs(y - cy) / hh - 1) * Math.min(hw, hh) * 0.8;
  return k;
};
/** Nét cong: cung tròn tâm (cx, cy) bán kính r từ góc a0 tới a1 (rad, y hướng xuống), vẽ bằng các đoạn thẳng ngắn. */
function arcStroke(s, cx, cy, r, a0, a1, hex, thickness = 1, a = 255) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 0.25));
  let px = cx + Math.cos(a0) * r;
  let py = cy + Math.sin(a0) * r;
  for (let i = 1; i <= n; i++) {
    const t = a0 + ((a1 - a0) * i) / n;
    const x = cx + Math.cos(t) * r;
    const y = cy + Math.sin(t) * r;
    s.line(px, py, x, y, hex, thickness, a);
    px = x;
    py = y;
  }
}
const sdUnion = (a, b) => (x, y) => Math.min(a(x, y), b(x, y));
const sdMinus = (a, b) => (x, y) => Math.max(a(x, y), -b(x, y));

/**
 * Viền tối 1 px quanh hình (điểm trong suốt hoặc bóng mờ kề điểm đặc): ô túi tô nền theo `def.color` (thường nhạt) nên icon nhạt cùng tông (lông băng, lông thép, xương, sao băng)
 * chìm vào nền (đã chụp trong game, M7.5c); viền giữ hình đọc ra trên mọi nền. Chỉ gọi cho icon cần (`OUTLINED_ICONS`).
 */
function outlineSurface(s, hex, alpha = 235) {
  const solid = (x, y) => x >= 0 && y >= 0 && x < s.w && y < s.h && s.data[s.idx(x, y) + 3] >= 200;
  const marks = [];
  for (let y = 0; y < s.h; y++)
    for (let x = 0; x < s.w; x++)
      if (
        !solid(x, y) &&
        (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))
      )
        marks.push(s.idx(x, y));
  for (const i of marks) {
    s.data[i] = (hex >> 16) & 255;
    s.data[i + 1] = (hex >> 8) & 255;
    s.data[i + 2] = hex & 255;
    s.data[i + 3] = alpha;
  }
}
/** Icon Hàn Vân Lĩnh (M7.5c) có viền tối: nguyên liệu nhạt và đồ tông băng / thép trên ô túi nhạt. */
const OUTLINED_ICONS = new Set([
  "han_lang_mao",
  "phong_nha_vu",
  "tuong_cot",
  "doc_tuoc_nang",
  "han_vu_kiem",
  "han_lang_bao",
  "phong_nha_phu",
  "tuyet_hanh_ngoa",
  "han_tinh_boi",
]);

function drawItemIcon(id) {
  const s = new Surface(24, 24);
  s.ellipse(12, 21, 7, 2, 0x000000, 65);
  if (
    id === "hoi_huyet_dan" ||
    id === "hoi_linh_dan" ||
    id === "tu_khi_dan" ||
    id === "dai_hoi_huyet_dan" ||
    id === "dai_hoi_linh_dan" ||
    id === "thuong_hoi_huyet_dan" ||
    id === "thuong_hoi_linh_dan"
  ) {
    const red = id.endsWith("hoi_huyet_dan");
    const blue = id.endsWith("hoi_linh_dan");
    const main = red ? 0xd9433b : blue ? 0x3b7bd9 : 0xe8c547;
    const dark = red ? 0x8f221d : blue ? 0x1f4b8f : 0xa68319;
    const glow = red ? 0xffb3ad : blue ? 0xb3d9ff : 0xfff3b0;
    // Viên linh đan có vân đan đạo và điểm sáng
    s.circle(12, 12, 8.5, dark);
    s.circle(12, 12, 7.2, main);
    s.ring(12, 12, 5.5, 1.2, glow, 160);
    s.circle(9, 9, 2.2, 0xffffff, 220);
    // Đan cấp 2 (M6): viền vàng kim và hai tia sáng, to hơn đan thường một chút
    if (id.startsWith("dai_")) {
      s.ring(12, 12, 9.4, 1.4, 0xe8c25a);
      s.set(12, 1, 0xfff3b0);
      s.set(12, 22, 0xfff3b0);
      s.set(1, 12, 0xfff3b0);
      s.set(22, 12, 0xfff3b0);
    }
    // Đan cấp 3 (M7.5c, Nguyên Anh): viền vàng kim + quầng trắng ngoài, bốn tia chéo và đốm sáng thứ hai (khác đan cấp 2 ở quầng và tia chéo)
    if (id.startsWith("thuong_")) {
      s.ring(12, 12, 9.4, 1.4, 0xe8c25a);
      s.ring(12, 12, 11, 0.9, 0xffffff, 150);
      for (const [x, y] of [
        [12, 1],
        [12, 22],
        [1, 12],
        [22, 12],
        [4, 4],
        [20, 4],
        [4, 20],
        [20, 20],
      ])
        s.set(x, y, 0xfff3b0);
      s.circle(15, 15, 1.2, 0xffffff, 200);
    }
  } else if (id === "dot_pha_dan" || id === "kinh_chi_dan" || id === "duong_anh_dan") {
    // Đan hộ đạo (nghề nhỏ lát 1, #763): viên đan có ngọn lửa luyện trên đỉnh; số mũi tên lên vàng = bậc cảnh giới (1 Luyện Khí, 2 Trúc Cơ, 3 Kim Đan).
    // Khác đan hồi (viên tròn lớn + vòng sáng + chấm trắng) cả về hình lẫn màu; bậc đọc được bằng số mũi tên, không chỉ bằng màu.
    const tier = id === "dot_pha_dan" ? 1 : id === "kinh_chi_dan" ? 2 : 3;
    const main = [0xe0953f, 0xc8503f, 0xa655a0][tier - 1];
    const dark = [0x9a5a1c, 0x7e2a20, 0x5e2a5a][tier - 1];
    // Ngọn lửa luyện đan hình giọt nước (vẽ trước, thân đan che chân lửa): màu ấm cố định cho cả ba để không giống cuống quả cầu
    s.ellipse(12, 6.4, 3.4, 3.6, 0xffa23a);
    s.tri(9.2, 5.6, 14, 4.6, 13.2, 0, 0xffa23a);
    s.ellipse(12, 7, 2.1, 2.5, 0xffe27a);
    s.tri(10.6, 6.4, 13, 5.6, 12.6, 2.6, 0xffe27a);
    // Thân đan
    s.circle(12, 14.5, 7.8, dark);
    s.circle(12, 14.5, 6.6, main);
    s.circle(8.6, 11.8, 1.1, 0xffffff, 200);
    // Mũi tên lên vàng xếp dọc giữa thân (đột phá = đi lên), số mũi tên = bậc
    const top = 14.8 - (tier - 1) * 1.7;
    for (let k = 0; k < tier; k++) {
      const y = top + k * 3.4;
      s.line(9.6, y + 1.2, 12, y - 1.2, 0xfff3b0, 1.4);
      s.line(14.4, y + 1.2, 12, y - 1.2, 0xfff3b0, 1.4);
    }
  } else if (id === "long_tho") {
    // Chùm lông thỏ trắng mềm
    s.ellipse(11, 13, 6, 4, 0xe0d8c8);
    s.ellipse(13, 11, 6, 4, 0xf7f3e8);
    s.ellipse(10, 10, 4, 3, 0xffffff);
  } else if (id === "nanh_soi") {
    // Nanh sói cong sắc nhọn
    s.tri(7, 18, 11, 4, 17, 15, 0xc7bfb0);
    s.tri(8, 17, 11, 5, 15, 14, 0xf5f0e6);
    s.rect(12, 14, 5, 4, 0x6e553e);
  } else if (id === "da_ho") {
    // Tấm da hổ vằn đen vàng
    s.rect(5, 5, 14, 14, 0xc99636);
    s.rect(4, 7, 16, 10, 0xd8a63a);
    for (let y = 7; y <= 15; y += 4) s.line(6, y, 17, y + 1, 0x241e20, 2);
  } else if (id === "suong_mao") {
    // Sương mao: nhúm lông mảnh xanh nhạt, đầu lông phát sáng (Kim Đan, M6)
    s.line(6, 18, 9, 7, 0xb4cfd9, 2);
    s.line(10, 19, 12, 5, 0xcfe3ea, 2.4);
    s.line(14, 18, 15, 6, 0xb4cfd9, 2);
    s.line(18, 17, 17, 8, 0xe6f1f5, 1.8);
    s.circle(9, 6, 1.6, 0xeaf6fa);
    s.circle(12, 4.5, 1.8, 0xffffff);
    s.circle(15, 5.5, 1.6, 0xeaf6fa);
    s.circle(12, 5, 3.4, 0xbfeaf2, 70);
  } else if (id === "quy_giap") {
    // Quy giáp: mảnh mai rùa lục giác phủ rêu
    s.tri(12, 3, 4, 8, 4, 16, 0x4b5840);
    s.tri(12, 3, 20, 8, 20, 16, 0x4b5840);
    s.tri(12, 21, 4, 16, 20, 16, 0x4b5840);
    s.ellipse(12, 12, 7, 7.5, 0x6f7f5e);
    s.line(12, 6, 12, 18, 0x4b5840, 1.2);
    s.line(7, 9, 17, 15, 0x4b5840, 1);
    s.ellipse(9, 8, 2.6, 1.6, 0x8fb85a);
    s.circle(16, 16, 1.6, 0x7fa24f);
  } else if (id === "doc_nang") {
    // Độc nang: túi độc tím căng phồng, giọt độc lục
    s.ellipse(12, 14, 7, 6.5, 0x56467a);
    s.ellipse(11, 13, 5, 4.5, 0x7a5fa0);
    s.rect(10, 5, 4, 4, 0x3a2d55);
    s.rect(9, 7, 6, 2, 0xc9a24a);
    s.circle(9, 12, 1.6, 0xd9c6f0, 200);
    s.tri(18, 15, 20, 20, 16, 19, 0x8fe35a);
    s.circle(18, 20, 1.5, 0x8fe35a);
  } else if (id === "han_lang_mao") {
    // Hàn Lang Mao (M7.5c): nhúm lông sói băng cứng, đầu lông kết tinh, sao tuyết nhỏ
    s.line(6, 19, 8, 8, 0x86aac4, 2);
    s.line(10, 20, 11, 6, 0xbfd9ec, 2.4);
    s.line(14, 19, 15, 7, 0x86aac4, 2);
    s.line(18, 18, 18, 9, 0xd6ecf7, 1.8);
    s.tri(8, 4, 6, 9, 10, 9, 0xe6f6ff);
    s.tri(11, 2, 9, 8, 13, 8, 0xffffff);
    s.tri(15, 3, 13, 9, 17, 9, 0xe6f6ff);
    s.tri(18, 5, 16, 10, 20, 10, 0xe6f6ff);
    s.circle(12, 4, 4, 0x9fe8ff, 60);
  } else if (id === "phong_nha_vu") {
    // Phong Nha Vũ (M7.5c): lông chim thép: phiến lông bầu dục nghiêng 45 độ, sống lông bạc, gai lông, đầu mút vàng kim
    const feather = (x, y) => {
      // toạ độ trong hệ lông: u dọc theo sống (lên phải), v vuông góc
      const dx = x - 12;
      const dy = y - 12;
      const u = (dx - dy) * 0.7071;
      const v = (dx + dy) * 0.7071;
      return Math.hypot(u / 10, v / 3.6) - 1;
    };
    sdfShape(s, (x, y) => feather(x, y) * 3.2, 0x9aa0ab, 0x5f6672);
    s.line(4.5, 19.5, 19.5, 4.5, 0xeef0f4, 1.2);
    for (const t of [-4, -1, 2, 5]) {
      const cx = 12 + t * 0.7071;
      const cy = 12 - t * 0.7071;
      s.line(cx, cy, cx - 2.2, cy - 2.2, 0xc9ccd6, 1);
      s.line(cx, cy, cx + 2.2, cy + 2.2, 0x7b808c, 1);
    }
    s.circle(19.5, 4.5, 1.8, 0xe8c25a);
  } else if (id === "tuong_cot") {
    // Tượng Cốt (M7.5c): khúc xương voi to, hai đầu khớp tròn, vân nâu, vệt tuyết trắng
    s.line(7, 17, 17, 7, 0x8a7a5a, 5);
    s.line(7, 17, 17, 7, 0xe8dfc8, 3.6);
    s.circle(6, 18, 3.4, 0xe8dfc8);
    s.circle(4.5, 16.5, 2.4, 0xcdbfa0);
    s.circle(18, 6, 3.4, 0xe8dfc8);
    s.circle(19.5, 7.5, 2.4, 0xcdbfa0);
    s.line(11, 14, 14, 11, 0x5a4630, 1);
    s.circle(9, 14, 1.6, 0xffffff, 230);
    s.circle(15, 9, 1.4, 0xffffff, 230);
  } else if (id === "doc_tuoc_nang") {
    // Độc Tước Nang (M7.5c): túi độc sẻ nhỏ, bầu tím lục, cuống buộc dây, giọt độc
    s.rect(10, 4, 4, 3, 0x3f6e34);
    s.rect(9, 6, 6, 2, 0xc9a24a);
    s.ellipse(12, 14, 6.5, 6, 0x5f9a4a);
    s.ellipse(12, 15, 4.6, 4, 0x9a5fc8);
    s.circle(10, 12, 1.6, 0xe6c8ff, 210);
    s.tri(18, 16, 20, 21, 16, 20, 0x8fe35a);
    s.circle(18, 21, 1.4, 0x8fe35a);
  } else if (id === "thien_han_chau") {
    // Thiên Hàn Châu (M7.5c, trùm, độ hiếm 4): viên châu băng sáng, vòng hàn khí, tia sao bốn hướng
    s.circle(12, 12, 10, 0x6fc3e6, 50);
    s.ring(12, 12, 9.5, 1, 0xcfeeff, 170);
    s.circle(12, 12, 6.8, 0x2d5f8c);
    s.circle(12, 12, 5.8, 0x4a86b8);
    s.circle(12, 12, 3.4, 0x9fe8ff);
    s.circle(9.4, 9.4, 2, 0xffffff, 235);
    for (const [x, y, x2, y2] of [
      [12, 0.5, 12, 3.5],
      [12, 20.5, 12, 23.5],
      [0.5, 12, 3.5, 12],
      [20.5, 12, 23.5, 12],
    ])
      s.line(x, y, x2, y2, 0xe6f6ff, 1.2);
  } else if (id === "giao_lan") {
    // Giao lân: vảy giao đen biếc hình thoi, ánh lam
    s.tri(12, 2, 3, 12, 21, 12, 0x2e5a7a);
    s.tri(12, 22, 3, 12, 21, 12, 0x1d3550);
    s.tri(12, 5, 6, 12, 18, 12, 0x3e7a9a);
    s.tri(12, 19, 6, 12, 18, 12, 0x24465f);
    s.line(12, 5, 12, 19, 0x6fc3e6, 1);
    s.circle(12, 12, 2.2, 0xcff4ff);
  } else if (id === "vay_mang") {
    // Vảy Xích Mãng hình khiên đỏ viền kim
    s.tri(12, 3, 4, 11, 20, 11, 0xe8c25a);
    s.tri(12, 20, 4, 11, 20, 11, 0xe8c25a);
    s.tri(12, 5, 6, 11, 18, 11, 0xb3262a);
    s.tri(12, 18, 6, 11, 18, 11, 0x8f1d21);
    s.circle(12, 11, 2, 0xffd966);
  } else if (SWORDS[id]) {
    // Vũ khí: Bảo kiếm (3 bậc Luyện Khí / Trúc Cơ + 3 bậc Kim Đan, M6)
    const [blade, edge, hilt, width] = SWORDS[id];
    // Lưỡi kiếm chéo từ góc dưới-trái lên trên-phải
    s.line(7, 17, 19, 5, blade, width);
    s.line(8, 16, 19, 5, edge, 1.3);
    // Chắn kiếm (kiếm cách)
    s.line(6, 12, 12, 18, edge, 2.2);
    // Chuôi kiếm + quả cầu đầu chuôi
    s.line(4, 20, 8, 16, hilt, 2.4);
    s.circle(4, 20, 1.8, edge);
    // Hàn Vũ Kiếm (M7.5c): băng tuyết kết dọc lưỡi (hai nhũ băng nhỏ phía dưới)
    if (id === "han_vu_kiem") {
      s.tri(11, 13, 13, 13, 12, 17, 0xcfeeff);
      s.tri(14, 10, 16, 10, 15, 14, 0xcfeeff);
    }
  } else if (ROBES[id]) {
    // Pháp bào (3 bậc Luyện Khí / Trúc Cơ + 3 bậc Kim Đan, M6)
    const [robe, trim] = ROBES[id];
    // Tay áo xòe
    s.tri(12, 5, 3, 14, 9, 17, robe);
    s.tri(12, 5, 21, 14, 15, 17, robe);
    // Thân áo
    s.tri(12, 4, 6, 20, 18, 20, robe);
    // Cổ áo chữ Y + đai lưng
    s.line(9, 5, 12, 12, trim, 1.8);
    s.line(15, 5, 12, 12, trim, 1.8);
    s.rect(8, 12, 8, 2, trim);
    s.rect(11, 13, 2, 7, trim);
    // Hoa văn riêng của bộ Kim Đan: mai rùa (II), vảy giao (III), gợn sương (I)
    if (id === "quy_giap_bao")
      for (const [x, y] of [
        [9, 16],
        [15, 16],
        [12, 18],
      ])
        s.ring(x, y, 1.6, 1, 0x4b5840);
    if (id === "giao_lan_bao")
      for (const [x, y] of [
        [8, 17],
        [16, 17],
        [10, 19],
        [14, 19],
      ])
        s.circle(x, y, 1.2, 0x4a90b0);
    if (id === "suong_ho_bao")
      for (const [x, y] of [
        [8, 18],
        [16, 18],
      ])
        s.circle(x, y, 1.8, 0xffffff, 160);
    if (id === "han_lang_bao")
      for (const [x, y] of [
        [8, 17],
        [16, 17],
        [12, 19],
      ]) {
        s.line(x - 1.4, y, x + 1.4, y, 0xe6f6ff, 1);
        s.line(x, y - 1.4, x, y + 1.4, 0xe6f6ff, 1);
      }
  } else if (TALISMANS[id]) {
    // Hộ phù / Linh phù (3 bậc Luyện Khí / Trúc Cơ + 3 bậc Kim Đan, M6)
    const [body, rune] = TALISMANS[id];
    // Dây treo đỏ
    s.line(12, 2, 12, 6, 0xa31d1d, 1.5);
    // Thân ngọc phù bát giác / chữ nhật
    s.rect(7, 5, 10, 13, rune);
    s.rect(8, 6, 8, 11, body);
    // Linh văn ở giữa
    s.line(12, 8, 12, 15, rune, 1.5);
    s.circle(12, 11, 2, rune);
    // Tua rua bên dưới
    s.line(10, 18, 9, 21, 0xa31d1d, 1.2);
    s.line(14, 18, 15, 21, 0xa31d1d, 1.2);
  } else if (BOOTS[id]) {
    // Hài (M7.4): ống hài + mũi hài nhìn nghiêng, đế và miệng hài màu phụ
    const [main, accent] = BOOTS[id];
    s.rect(8, 5, 6, 11, main);
    s.rect(8, 4, 6, 2, accent);
    s.rect(8, 15, 12, 4, main);
    s.ellipse(19, 17, 3, 2.5, main);
    s.rect(7, 18, 14, 2, accent);
    s.line(9, 8, 13, 8, accent, 1);
  } else if (JADES[id]) {
    // Ngọc bội (M7.4): MẶT DÂY NGỌC treo dây đỏ qua lỗ nhỏ trên đỉnh, mỗi món một hình (trăng khuyết, bài ngọc, hoa tuyết, giọt châu).
    // Không còn đĩa tròn có lỗ đen giữa + chấm sáng (trông như con mắt, nit của B ở review #590).
    const [main, accent] = JADES[id];
    const cord = 0xa31d1d;
    const hole = (x, y) => {
      s.circle(x, y, 1.1, 0x1c1814);
      s.line(x, 0, x, y - 0.5, cord, 1.5); // dây đỏ buông từ trên xuống lỗ
    };
    if (id === "tho_nguyet_boi") {
      // Thố Nguyệt: trăng khuyết, dây xỏ ở sừng trên
      const moon = sdMinus(sdCircle(12, 13.5, 8), sdCircle(15.5, 11.5, 6.4));
      sdfShape(s, moon, main, accent);
      s.set(7, 10, 0xffffff, 230);
      s.set(7, 11, 0xffffff, 150);
      hole(9.6, 7.4);
    } else if (id === "mang_tinh_boi") {
      // Mãng Tinh: bài ngọc đứng bo góc, một con rắn uốn chữ S khắc trên mặt
      sdfShape(s, sdBox(12, 13.5, 5.5, 8, 2), main, accent);
      s.line(9.5, 10, 14.5, 12, accent, 1.5);
      s.line(14.5, 12, 9.5, 15, accent, 1.5);
      s.line(9.5, 15, 14.5, 18, accent, 1.5);
      s.circle(14.5, 18, 1.1, 0xffffff, 220);
      hole(12, 6.6);
    } else if (id === "suong_linh_boi") {
      // Sương Linh: hình thoi, mặt khắc hoa tuyết (chữ thập + hai nét chéo)
      sdfShape(s, sdDiamond(12, 13.5, 6.5, 8.5), main, accent);
      s.line(12, 8.5, 12, 18.5, 0xffffff, 1.2, 230);
      s.line(8, 13.5, 16, 13.5, 0xffffff, 1.2, 230);
      s.line(9.4, 10.9, 14.6, 16.1, 0xffffff, 1, 160);
      s.line(14.6, 10.9, 9.4, 16.1, 0xffffff, 1, 160);
      hole(12, 6.4);
    } else if (id === "han_tinh_boi") {
      // Hàn Tinh: sao băng sáu cánh (hai tam giác chồng nhau), tâm sáng, dây xỏ ở cánh trên
      const star = sdUnion(
        (x, y) => {
          // tam giác đều hướng lên tâm (12, 13.5), cạnh ~ 17
          const dx = x - 12;
          const dy = y - 13.5;
          return Math.max(
            dy - 4.4,
            -0.866 * dx - 0.5 * dy - 4.4 + 0.0,
            0.866 * dx - 0.5 * dy - 4.4,
          );
        },
        (x, y) => {
          const dx = x - 12;
          const dy = y - 13.5;
          return Math.max(-dy - 4.4, -0.866 * dx + 0.5 * dy - 4.4, 0.866 * dx + 0.5 * dy - 4.4);
        },
      );
      sdfShape(s, star, main, accent);
      // hoa tuyết nhỏ ở giữa (không vòng tròn + chấm tối: giống con mắt)
      s.line(12, 10.5, 12, 16.5, 0xffffff, 1);
      s.line(9.4, 12, 14.6, 15, 0xffffff, 1);
      s.line(14.6, 12, 9.4, 15, 0xffffff, 1);
      hole(12, 7.6);
    } else {
      // Giao Châu: giọt châu (tròn dưới, nhọn trên) có vòng vảy rồng và vệt sáng
      const drop = sdUnion(
        sdCircle(12, 15, 6.6),
        sdMinus(sdDiamond(12, 10, 4.4, 5.5), sdBox(12, 17, 20, 6)),
      );
      sdfShape(s, drop, main, accent);
      // ba vảy rồng nhỏ (không vòng tròn đồng tâm: tránh giống con mắt) + vệt sáng
      s.circle(10, 16.5, 1, accent, 220);
      s.circle(14, 16.5, 1, accent, 220);
      s.circle(12, 19, 1, accent, 220);
      s.circle(9.6, 12.8, 1.5, 0xffffff, 210);
      hole(12, 6.2);
    }
  } else if (TREASURE_ICONS[id]) {
    // Pháp bảo (M7.4): vòng linh khí quanh + MỖI MÓN MỘT HÌNH theo công dụng (khiên, châu, ấn lửa, ấn băng, chuông, xoáy gió), không còn cùng một ấn vuông chỉ khác màu
    const [main, accent] = TREASURE_ICONS[id];
    s.ring(12, 12, 10, 1, accent, 90);
    if (id === "ho_than_an") {
      // Hộ Thân Ấn: tấm khiên (vai vuông, đáy nhọn), gờ giữa
      const shield = sdUnion(
        sdBox(12, 10.5, 6.5, 5, 1.2),
        sdMinus(sdDiamond(12, 13.5, 6.5, 8.5), sdBox(12, 5, 20, 5)),
      );
      sdfShape(s, shield, main, accent);
      s.line(12, 7, 12, 18, accent, 1.4);
      s.line(8, 11, 16, 11, accent, 1.4);
    } else if (id === "hap_linh_chau") {
      // Hấp Linh Châu: viên châu tròn có xoáy hút linh khí và đế nhỏ
      s.rect(9, 18, 6, 2, accent);
      sdfShape(s, sdCircle(12, 11.5, 7), main, accent);
      // xoáy hút linh khí: đường xoắn ốc từ ngoài vào tâm (không vòng đồng tâm + chấm giữa: giống con mắt)
      let sx = 0;
      let sy = 0;
      for (let k = 0; k <= 22; k++) {
        const t = k * 0.34;
        const r = 5 - k * 0.2;
        const nx = 12 + Math.cos(t + 3.4) * r;
        const ny = 11.5 + Math.sin(t + 3.4) * r;
        if (k > 0) s.line(sx, sy, nx, ny, accent, 1.2, 235);
        sx = nx;
        sy = ny;
      }
      s.circle(9, 8.2, 1.3, 0xffffff, 220);
    } else if (id === "xich_diem_an") {
      // Xích Diễm Ấn: ấn vuông, mặt khắc ngọn lửa
      s.rect(9, 5, 6, 3, accent);
      sdfShape(s, sdBox(12, 13.5, 7, 6.5, 1), main, accent);
      // ngọn lửa: thân giọt nước lệch, đầu nhọn cong, lõi vàng
      s.circle(12, 15.4, 3.2, accent);
      s.tri(8.8, 14.6, 15.2, 14.6, 12.9, 8.2, accent);
      s.circle(12, 16, 1.7, 0xfff0d0);
      s.tri(10.6, 15.5, 13.4, 15.5, 12.2, 11.8, 0xfff0d0);
    } else if (id === "han_bang_an") {
      // Hàn Băng Ấn: ấn vuông, mặt khắc hoa tuyết sáu cánh
      s.rect(9, 5, 6, 3, accent);
      sdfShape(s, sdBox(12, 13.5, 7, 6.5, 1), main, accent);
      s.line(12, 9, 12, 18, 0xffffff, 1);
      s.line(7.8, 13.5, 16.2, 13.5, 0xffffff, 1);
      s.line(9.2, 10.7, 14.8, 16.3, 0xffffff, 1);
      s.line(14.8, 10.7, 9.2, 16.3, 0xffffff, 1);
      s.circle(12, 13.5, 1.3, 0xffffff);
    } else if (id === "dinh_tam_chung") {
      // Định Tâm Chung: quả chuông (vòm trên, miệng loe), núm treo và quả lắc
      s.line(12, 3.5, 12, 6, accent, 1.4);
      const bell = sdUnion(sdBox(12, 12.5, 4.5, 5.5, 2), sdBox(12, 16.5, 7, 2.2, 0.8));
      sdfShape(s, bell, main, accent);
      s.circle(12, 19.4, 1.6, accent);
      s.line(9.5, 9, 9.5, 14, 0xffffff, 1, 150);
    } else {
      // Phong Hành Bội: mặt dây tròn khắc hai vệt gió, đầu mỗi vệt cuộn lại thành xoáy
      sdfShape(s, sdCircle(12, 12, 8), main, accent);
      s.line(6.4, 9.6, 12, 9.6, 0x2f6a54, 1.3);
      arcStroke(s, 12, 7.8, 1.8, Math.PI / 2, -Math.PI, 0x2f6a54, 1.3);
      s.line(8.4, 12.4, 17, 12.4, 0x2f6a54, 1.2);
      s.line(6.4, 15, 13.6, 15, 0x2f6a54, 1.3);
      arcStroke(s, 13.6, 16.8, 1.8, -Math.PI / 2, Math.PI, 0x2f6a54, 1.3);
    }
  } else if (BOOKS[id]) {
    // Kinh quyển (M7.4): sách khép, gáy tối, mép giấy sáng, dấu hệ trên bìa
    const [cover, accent, mark] = BOOKS[id];
    s.rect(5, 4, 14, 17, cover);
    s.rect(5, 4, 3, 17, 0x2a2018, 110);
    s.rect(19, 5, 1, 15, 0xf4ecd0);
    s.rect(8, 7, 9, 1, accent);
    // Vẽ dấu từ bản đồ điểm ảnh: 9 cột (x = 8..16, giữa hai dải ngang của bìa), hàng đầu ở y0; ký tự không có trong `pal` là nền bìa.
    const paintMark = (rows, y0, pal) =>
      rows.forEach((row, j) =>
        [...row].forEach((c, i) => {
          if (pal[c] !== undefined) s.rect(8 + i, y0 + j, 1, 1, pal[c]);
        }),
      );
    const shade = (hex) => {
      const k = (sh) => Math.round(((hex >> sh) & 255) * 0.62);
      return (k(16) << 16) | (k(8) << 8) | k(0);
    };
    if (mark === undefined) {
      // 12 quyển đợt 1: dấu tròn
      s.circle(12, 13, 3, accent);
      s.circle(12, 13, 1.4, cover);
    } else if (mark === "tien") {
      // Hàn Quang Tiễn: mũi tên xiên, đuôi có hai cánh lông
      s.line(9.6, 16.2, 15, 10.8, accent, 1.2);
      s.tri(16.4, 9.4, 12.4, 10.4, 15.4, 13.4, accent);
      s.line(9.6, 16.2, 9.6, 13.6, accent, 1);
      s.line(9.6, 16.2, 12.2, 16.2, accent, 1);
    } else if (mark === "trao") {
      // Bạch Kim Trảo: ba vệt vuốt cào XIÊN 45 độ, đầu dày đuôi thon, đầu và độ dài khác nhau (vệt phải dài nhất, vệt trái vừa, vệt dưới lệch xuống ngắn nhất); ba vệt cách nhau >= 1 điểm ảnh (kể cả chéo).
      // Ba nét gần thẳng đứng song song đọc ra chữ Hán «xuyên» (sông), nên mỗi vệt lệch ngang bằng chiều cao (dx = dy >= dy / 2). Vẽ từng điểm ảnh.
      paintMark(
        [
          "...##..##", //  y 9
          "..##..##.", // y 10
          ".##..##..", // y 11
          ".#..##...", // y 12
          "#..##..##", // y 13
          "...#..##.", // y 14
          "..#...#..", // y 15
          ".....#...", // y 16
        ],
        9,
        { "#": accent },
      );
    } else if (mark === "tran") {
      // Vạn Thạch Trận: đống đá ba tảng KHÁC CỠ, mép tròn, so le (nhỏ ở trên lệch trái, vừa bên trái, to bên phải), mỗi tảng cách nhau một điểm nền
      // và có bóng ở đáy. Bốn ô vuông đều thành lưới 2 x 2 đọc ra chữ Hán «điền» (ruộng) (và các tầng đá ngang đọc ra nét ngang), nên không dùng lưới.
      paintMark(
        [
          "...##....", //  y 9
          "..###s...", // y 10
          "...ss....", // y 11
          ".....###.", // y 12
          ".###.####", // y 13
          ".####.###", // y 14
          ".###s.##s", // y 15
          "..ss.sss.", // y 16
        ],
        9,
        { "#": accent, s: shade(cover) },
      );
    } else if (mark === "hoa") {
      // Băng Hoa Loạn: bông tuyết SÁU nhánh (một nhánh dọc có chạc ở hai đầu, bốn nhánh xiên thoải), không có nhánh ngang: tám nan đều
      // (dọc + ngang + hai chéo) đọc ra chữ Hán «mễ» (gạo). Vẽ từng điểm ảnh.
      paintMark(
        [
          "....#....", // y 10
          "#..###..#", // y 11
          ".##.#.##.", // y 12
          "...###...", // y 13
          ".##.#.##.", // y 14
          "#..###..#", // y 15
          "....#....", // y 16
        ],
        10,
        { "#": accent },
      );
    } else if (mark === "kiem") {
      // Liệt Hỏa Kiếm: thanh kiếm CHÉO (mũi trên trái, chuôi dưới phải: ngược hướng mũi tên của Hàn Quang Tiễn), vẽ từng điểm ảnh cho sắc nét ở 24 px
      // (đường khử răng cưa lem thành hình chim): lưỡi dày 2 điểm ảnh, chắn tay vuông góc với lưỡi, chuôi và núm. Không dựng đứng: kiếm dọc có chắn
      // tay ngang kẹp giữa hai dải ngang của bìa đọc ra chữ Hán «vương» (quy tắc: không chữ Hán trên ảnh); mũi cách dải trên 1 điểm ảnh.
      const blade = [
        [10, 9],
        [10, 10],
        [11, 10],
        [11, 11],
        [12, 11],
        [12, 12],
        [13, 12],
        [13, 13],
        [14, 13],
      ];
      const guard = [
        [16, 11],
        [15, 12],
        [14, 14],
        [13, 14],
        [12, 15],
      ];
      const hilt = [
        [15, 14],
        [16, 15],
        [17, 16],
      ];
      for (const [x, y] of [...blade, ...guard, ...hilt]) s.rect(x, y, 1, 1, accent);
    } else if (mark === "bo") {
      // Vân Hành Bộ: đám mây (ba cụm tròn trên đáy phẳng) có vệt gió bên dưới
      s.circle(10.6, 12.8, 2, accent);
      s.circle(13.2, 11.6, 2.6, accent);
      s.circle(15.4, 13.2, 1.8, accent);
      s.rect(10.6, 13, 5.6, 2, accent);
      s.line(9.6, 16.4, 15.4, 16.4, accent, 0.9);
    }
    s.rect(8, 18, 9, 1, accent);
  }
  if (OUTLINED_ICONS.has(id)) outlineSurface(s, 0x2a3340);
  return s;
}

function drawSwordBeam() {
  const s = new Surface(48, 16);
  s.tri(2, 8, 46, 1, 46, 15, 0x6ec6ff, 190);
  s.tri(12, 8, 46, 3, 46, 13, 0xbfe8ff, 235);
  s.tri(22, 8, 46, 5, 46, 11, 0xffffff, 255);
  return s;
}

function drawDot() {
  const s = new Surface(16, 16);
  s.circle(8, 8, 7, 0xffffff, 90);
  s.circle(8, 8, 5, 0xffffff, 180);
  s.circle(8, 8, 3, 0xffffff, 255);
  return s;
}

// ---------------- 4b. Vẽ 4 NPC trong Lạc Hà Trấn (36x42) ----------------

function drawNpcSprite(id) {
  const s = new Surface(36, 42);
  s.ellipse(18, 38, 11, 4, 0x000000, 75);

  if (id === "cao_thi") {
    // Bảng cáo thị bằng gỗ lim + mái ngói + giấy niêm yết có ấn đỏ
    s.rect(9, 14, 3, 24, 0x5c3d24);
    s.rect(24, 14, 3, 24, 0x5c3d24);
    s.rect(6, 12, 24, 18, 0x7a5232);
    s.rect(8, 14, 20, 14, 0x9c6d44);
    // Mái bảng
    s.tri(18, 4, 3, 13, 33, 13, 0x3d2e28);
    s.line(4, 13, 32, 13, 0xc9a24a, 2);
    // Tờ giấy cáo thị
    s.rect(10, 16, 7, 9, 0xf3ecda);
    s.rect(19, 16, 7, 8, 0xf3ecda);
    s.rect(14, 22, 2, 2, 0xa31d1d);
    s.rect(23, 21, 2, 2, 0xa31d1d);
    return s;
  }

  const cfg = {
    truong_tran: { robe: 0x7a5c3e, trim: 0xe6c365, hair: 0xd8d2c5, beard: true, prop: "staff" },
    duoc_su: { robe: 0x3f7850, trim: 0xb8e0a0, hair: 0xd8d2c5, beard: true, prop: "gourd" },
    tho_ren: { robe: 0x8c3b2a, trim: 0x473933, hair: 0x241c18, beard: false, prop: "hammer" },
    // Lò đan Lạc Hà Trấn (nghề nhỏ lát 1, #763): lão đan sư áo vàng đất, tóc bạc, ôm lò đan nhỏ đang cháy
    lao_dan: { robe: 0xb07a3a, trim: 0xf2e0b0, hair: 0xe8e4da, beard: true, prop: "cauldron" },
    // Hắc Phong Cốc và bí cảnh (trước M6 dùng ảnh dự phòng)
    lai_buon: { robe: 0x6b4f8a, trim: 0xe6c365, hair: 0x241c18, beard: false, prop: "pack" },
    // Trạm úy Thanh Lộ (D7 #755): đội trưởng thợ săn trấn thủ cửa ải, áo xanh ô-liu, tay cầm giáo dài
    tran_uy: { robe: 0x4a6b3a, trim: 0xc9d36a, hair: 0x241c18, beard: true, prop: "spear" },
    thu_mon: { robe: 0x3a6f8f, trim: 0xb8e0f0, hair: 0xd8d2c5, beard: true, prop: "lantern" },
    // Vọng Sương Trạm (Âm Sương Trạch, M6)
    tram_truong: { robe: 0x4a6b78, trim: 0xd9e7ec, hair: 0xd8d2c5, beard: true, prop: "lantern" },
    lai_buon_suong: { robe: 0x7a5f8c, trim: 0xe8c25a, hair: 0x8a8f99, beard: true, prop: "pack" },
    tho_ren_suong: { robe: 0x9a4a30, trim: 0xc9d36a, hair: 0x4a3f38, beard: true, prop: "hammer" },
    // Hàn Vân Trạm (Hàn Vân Lĩnh, M7.5c #506): tông xanh băng; tranh có TRƯỚC NPC trong `shared/`
    tram_truong_han: {
      robe: 0x3f5f8a,
      trim: 0xe6f6ff,
      hair: 0xe6ecf2,
      beard: true,
      prop: "lantern",
    },
    lai_buon_han: { robe: 0x5d6f9a, trim: 0xf0d27a, hair: 0x4a4f5c, beard: false, prop: "pack" },
    tho_ren_han: { robe: 0x6a3f4a, trim: 0x9fd0ea, hair: 0x2c3a4a, beard: true, prop: "hammer" },
  }[id];
  if (!cfg) throw new Error(`Chưa có tranh NPC: ${id}`);

  // Giày
  s.rect(13, 35, 4, 3, 0x2b2623);
  s.rect(19, 35, 4, 3, 0x2b2623);

  // Thân áo
  s.tri(18, 13, 6, 36, 30, 36, cfg.robe);
  s.line(14, 15, 18, 24, cfg.trim, 2);
  s.line(22, 15, 18, 24, cfg.trim, 2);
  s.rect(16, 23, 4, 13, cfg.trim);
  s.rect(11, 22, 14, 3, 0xc9a24a);

  // Tay áo
  s.ellipse(9, 23, 4, 6, cfg.robe);
  s.ellipse(27, 23, 4, 6, cfg.robe);
  s.ellipse(9, 27, 3, 2, cfg.trim);
  s.ellipse(27, 27, 3, 2, cfg.trim);

  // Đầu & tóc
  s.circle(18, 12, 6.5, 0xf2d7b6);
  s.ellipse(18, 7.5, 7, 3.5, cfg.hair);
  s.circle(18, 4, 3.2, cfg.hair);
  s.rect(15, 3.5, 6, 2, 0xc9a24a);
  s.rect(15, 12, 2, 2, 0x241c18);
  s.rect(19, 12, 2, 2, 0x241c18);

  if (cfg.beard) {
    s.tri(15, 16, 21, 16, 18, 24, cfg.hair);
  }

  // Pháp khí / đạo cụ đặc trưng từng NPC
  if (cfg.prop === "staff") {
    // Trưởng trấn cầm trượng gỗ đầu ngọc
    s.line(29, 8, 29, 36, 0x5c3d24, 2);
    s.circle(29, 7, 3, 0xffe08a);
  } else if (cfg.prop === "gourd") {
    // Dược sư đeo hồ lô đan dược
    s.circle(28, 24, 3.2, 0xd8a63a);
    s.circle(28, 29, 4.2, 0xc9922c);
    s.rect(27, 20, 2, 2, 0xa31d1d);
  } else if (cfg.prop === "lantern") {
    // Đèn lồng treo đầu gậy (đèn trạm / cổng)
    s.line(29, 12, 29, 36, 0x5c3d24, 2);
    s.rect(26, 8, 6, 7, 0xe8a838);
    s.rect(27, 9, 4, 5, 0xffe9a0);
    s.rect(27, 7, 4, 1, 0x3d2e28);
    s.circle(29, 11, 5, 0xffe9a0, 60);
  } else if (cfg.prop === "pack") {
    // Gùi hàng sau lưng + dây đeo (lái buôn)
    s.rect(4, 18, 7, 14, 0x7a5232);
    s.rect(5, 19, 5, 12, 0x9c6d44);
    s.line(9, 16, 14, 22, 0x5c3d24, 1.4);
    s.rect(4, 17, 7, 2, 0xe8c25a);
  } else if (cfg.prop === "cauldron") {
    // Đan sư ôm lò đan nhỏ ba chân: thân sắt, nắp có núm, hai quai, ngọn lửa liếm lên từ miệng lò
    s.tri(25.6, 22, 30.4, 22, 28, 16, 0xffb04a, 235);
    s.tri(26.8, 22, 29.2, 22, 28, 18.6, 0xfff0c0, 235);
    s.ellipse(28, 28, 4.8, 4, 0x4a423c);
    s.ellipse(28, 27.2, 3.6, 2.6, 0x6e655c);
    s.rect(23, 26, 2, 2, 0x4a423c);
    s.rect(31, 26, 2, 2, 0x4a423c);
    s.rect(24, 24, 8, 2, 0x2f2a26);
    s.rect(27, 22.5, 2, 2, 0xc9a24a);
    s.rect(24, 31, 2, 3, 0x2f2a26);
    s.rect(30, 31, 2, 3, 0x2f2a26);
  } else if (cfg.prop === "hammer") {
    // Thợ rèn cầm búa sắt
    s.line(28, 15, 28, 32, 0x5c3d24, 2);
    s.rect(24, 12, 8, 5, 0x6e737b);
    s.rect(25, 13, 6, 2, 0x9aa0a8);
  } else if (cfg.prop === "spear") {
    // Trạm úy cầm giáo dài: cán gỗ, đầu giáo kim loại nhọn — vũ khí trấn thủ cửa ải
    s.line(30, 3, 30, 36, 0x6e5a3a, 2);
    s.tri(30, 1, 27, 9, 33, 9, 0xc8d4dc);
    s.set(30, 2, 0xf0f6fa);
  }

  return s;
}

// ---------------- 5. Đóng gói toàn bộ vào atlas.png + atlas.json ----------------

function buildAtlas() {
  const entries = [];
  const push = (name, surf) => entries.push({ name, surf });

  const personas = [
    { key: "me", robe: 0xf0ece1, trim: 0x2b6e8f, hair: 0x1f1a17 },
    { key: "other", robe: 0x566c85, trim: 0xc9a24a, hair: 0x1f1a17 },
    { key: "robe-tho_nhung_bao", robe: 0xf4efe2, trim: 0x4ba368, hair: 0x1f1a17 },
    { key: "robe-hac_ho_bao", robe: 0x352c24, trim: 0xe8a838, hair: 0x1f1a17 },
    { key: "robe-xich_lan_bao", robe: 0x9e2420, trim: 0xffd34d, hair: 0x1f1a17 },
  ];
  const dirs = ["down", "up", "left", "right"];

  for (const p of personas) {
    const baseIdle = drawCultivatorFrame(p.robe, p.trim, p.hair, "down", "idle", 0);
    push(p.key, baseIdle);
    for (let f = 0; f < 4; f++)
      push(`${p.key}-die-${f}`, drawCultivatorPose(p.robe, p.trim, p.hair, "down", `die-${f}`));
    for (const d of dirs) {
      push(`${p.key}-hurt-${d}`, drawCultivatorPose(p.robe, p.trim, p.hair, d, "hurt"));
      push(`${p.key}-idle-${d}`, drawCultivatorFrame(p.robe, p.trim, p.hair, d, "idle", 0));
      for (let f = 0; f < 4; f++) {
        push(`${p.key}-walk-${d}-${f}`, drawCultivatorFrame(p.robe, p.trim, p.hair, d, "walk", f));
      }
      for (let f = 0; f < 3; f++) {
        push(
          `${p.key}-slash-${d}-${f}`,
          drawCultivatorFrame(p.robe, p.trim, p.hair, d, "slash", f),
        );
      }
    }
  }

  // Quái Kim Đan (M6 #407): suong_ho, thach_quy, doc_thiem, hac_giao; yeu_vuong (trùm bí cảnh) trước đây dùng ảnh dự phòng
  for (const mId of [
    "tho",
    "lang",
    "ho",
    "mang",
    "suong_ho",
    "thach_quy",
    "doc_thiem",
    "hac_giao",
    "yeu_vuong",
    // Quái Nguyên Anh của Hàn Vân Lĩnh (M7.5b #506): tranh có TRƯỚC loài trong `shared/` (A thêm loài + monsterCap sau; atlas.test.ts đòi mỗi loài có khung)
    "han_lang",
    "phong_nha",
    "cot_tuong",
    "doc_tuoc",
    "thien_han_vuong",
  ]) {
    const f0 = drawMonsterFrame(mId, 0);
    const f1 = drawMonsterFrame(mId, 1);
    push(`mon-${mId}`, f0);
    push(`mon-${mId}-0`, f0);
    push(`mon-${mId}-1`, f1);
    for (const pose of MONSTER_POSES) push(`mon-${mId}-${pose}`, drawMonsterPose(mId, pose));
  }

  for (const npcId of [
    "truong_tran",
    "duoc_su",
    "tho_ren",
    "cao_thi",
    "lai_buon",
    "thu_mon",
    "tram_truong",
    "lai_buon_suong",
    "tho_ren_suong",
    "tram_truong_han",
    "lai_buon_han",
    "tho_ren_han",
    "lao_dan",
    "tran_uy",
  ]) {
    push(`npc-${npcId}`, drawNpcSprite(npcId));
  }

  const itemIds = [
    "hoi_huyet_dan",
    "hoi_linh_dan",
    "tu_khi_dan",
    "long_tho",
    "nanh_soi",
    "da_ho",
    "vay_mang",
    "lang_nha_kiem",
    "tho_nhung_bao",
    "lang_nha_phu",
    "hac_ho_kiem",
    "hac_ho_bao",
    "ho_hon_phu",
    "xich_mang_kiem",
    "xich_lan_bao",
    "mang_dam_phu",
    // Kim Đan (M6, #407): nguyên liệu, đan cấp 2, ba bộ trang bị
    "suong_mao",
    "quy_giap",
    "doc_nang",
    "giao_lan",
    "dai_hoi_huyet_dan",
    "dai_hoi_linh_dan",
    "suong_vu_kiem",
    "suong_ho_bao",
    "ho_tam_phu",
    "huyen_quy_kiem",
    "quy_giap_bao",
    "quy_tuc_phu",
    "hac_giao_kiem",
    "giao_lan_bao",
    "giao_long_phu",
    // Đồ ba ô riêng của chủ (M7.4): hài, ngọc bội, pháp bảo
    ...Object.keys(BOOTS),
    ...Object.keys(JADES),
    ...Object.keys(TREASURE_ICONS),
    // Kinh quyển 12 chiêu (M7.4)
    ...Object.keys(BOOKS),
    // Hàn Vân Lĩnh (M7.5b / M7.5c, #506): 5 nguyên liệu, 3 món bộ IV vẽ theo bảng SWORDS / ROBES / TALISMANS, 2 đan cấp 3; hài và ngọc bội đã vào BOOTS / JADES ở trên.
    // Hình có TRƯỚC vật phẩm trong `shared/` (id chưa có trong ITEMS thì vô hại; A thêm dữ liệu sau)
    "han_lang_mao",
    "phong_nha_vu",
    "tuong_cot",
    "doc_tuoc_nang",
    "thien_han_chau",
    "han_vu_kiem",
    "han_lang_bao",
    "phong_nha_phu",
    "thuong_hoi_huyet_dan",
    "thuong_hoi_linh_dan",
    // Nghề nhỏ lát 1 (#763): ba đan hộ đạo theo bậc cảnh giới
    "dot_pha_dan",
    "kinh_chi_dan",
    "duong_anh_dan",
  ];
  for (const id of itemIds) {
    const icon = drawItemIcon(id);
    push(`item-${id}`, icon);
    fs.writeFileSync(path.join(ITEMS_DIR, `${id}.png`), icon.toPNG());
  }

  push("swordbeam", drawSwordBeam());
  push("dot", drawDot());

  // Sắp xếp shelf packing vào atlas rộng 640, cao vừa đủ (làm tròn 16, trần 2048 theo ngân sách M5 mục 8)
  const W = 640;
  const MAX_H = 2048;
  const pad = 2;
  const frames = {};
  const placed = [];
  let cx = 2;
  let cy = 2;
  let rowH = 0;
  for (const { name, surf } of entries) {
    if (cx + surf.w + pad > W) {
      cx = 2;
      cy += rowH + pad;
      rowH = 0;
    }
    placed.push({ surf, x: cx, y: cy });
    frames[name] = {
      frame: { x: cx, y: cy, w: surf.w, h: surf.h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: surf.w, h: surf.h },
      sourceSize: { w: surf.w, h: surf.h },
    };
    cx += surf.w + pad;
    rowH = Math.max(rowH, surf.h);
  }
  const H = Math.ceil((cy + rowH + pad) / 16) * 16;
  if (H > MAX_H) throw new Error(`Atlas cao ${H}px vượt trần ${MAX_H}px`);
  const atlas = new Surface(W, H);
  for (const p of placed) atlas.blit(p.surf, p.x, p.y);

  fs.writeFileSync(path.join(OUT_DIR, "atlas.png"), atlas.toPNG());
  fs.writeFileSync(
    path.join(OUT_DIR, "atlas.json"),
    JSON.stringify(
      {
        frames,
        meta: {
          app: "client/scripts/gen-assets.mjs",
          version: "1.0",
          image: "atlas.png",
          format: "RGBA8888",
          size: { w: W, h: H },
          scale: "1",
        },
      },
      null,
      2,
    ) + "\n",
  );
}

buildTileset();
buildAtlas();
process.stdout.write("Generated tileset.png, atlas.png, atlas.json, and item icons.\n");
