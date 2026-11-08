// Ảnh tạm vẽ bằng code (placeholder). Khi có asset thật (CC0), chỉ cần
// nạp ảnh với cùng key trong preload() là thay được, không phải sửa scene.
import Phaser from "phaser";
import { TILE, T, MONSTERS } from "@tien-gioi/shared";

const TILE_COLORS: Record<T, [string, string]> = {
  [T.Grass]: ["#9fae7a", "#8d9d69"],
  [T.TallGrass]: ["#8a9a62", "#6f8150"],
  [T.Dirt]: ["#c9b48a", "#b49f76"],
  [T.Water]: ["#7fa3a8", "#6b9095"],
  [T.Tree]: ["#9fae7a", "#4c5f3c"],
  [T.Rock]: ["#8f8b84", "#6e6a64"],
  [T.Stone]: ["#d8ccb2", "#c2b597"],
  [T.Sand]: ["#ddcfa6", "#cbbd92"],
};

function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

export const TILESET_KEY = "tileset";

export function makeTileset(scene: Phaser.Scene) {
  const types = Object.keys(TILE_COLORS).map(Number) as T[];
  const tex = scene.textures.createCanvas(TILESET_KEY, TILE * types.length, TILE)!;
  const ctx = tex.getContext();
  for (const t of types) {
    const ox = t * TILE;
    const [base, dark] = TILE_COLORS[t];
    const r = rng(1000 + t * 77);
    ctx.fillStyle = base;
    ctx.fillRect(ox, 0, TILE, TILE);
    // Chấm hạt cho mặt đất bớt phẳng
    ctx.fillStyle = dark;
    for (let i = 0; i < 18; i++) ctx.fillRect(ox + Math.floor(r() * TILE), Math.floor(r() * TILE), 2, 2);
    if (t === T.TallGrass) {
      ctx.strokeStyle = dark;
      for (let i = 0; i < 7; i++) {
        const x = ox + 3 + r() * 26, y = 8 + r() * 22;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2, y - 7); ctx.moveTo(x, y); ctx.lineTo(x + 3, y - 6); ctx.stroke();
      }
    }
    if (t === T.Water) {
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      for (let i = 0; i < 3; i++) {
        const y = 6 + i * 10 + r() * 3;
        ctx.beginPath(); ctx.moveTo(ox + 4 + r() * 6, y); ctx.quadraticCurveTo(ox + 16, y - 3, ox + 26, y); ctx.stroke();
      }
    }
    if (t === T.Tree) {
      ctx.fillStyle = "#5b4a36"; ctx.fillRect(ox + 14, 20, 4, 10);
      ctx.fillStyle = "#3f5233"; ctx.beginPath(); ctx.arc(ox + 16, 14, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#56703f"; ctx.beginPath(); ctx.arc(ox + 12, 11, 6, 0, Math.PI * 2); ctx.fill();
    }
    if (t === T.Rock) {
      ctx.fillStyle = "#5d5953"; ctx.beginPath();
      ctx.moveTo(ox + 3, 30); ctx.lineTo(ox + 10, 6); ctx.lineTo(ox + 20, 3); ctx.lineTo(ox + 29, 30); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#a29d94"; ctx.beginPath();
      ctx.moveTo(ox + 10, 6); ctx.lineTo(ox + 20, 3); ctx.lineTo(ox + 16, 18); ctx.closePath(); ctx.fill();
    }
    if (t === T.Stone) {
      ctx.strokeStyle = "rgba(90,70,50,0.25)";
      ctx.strokeRect(ox + 0.5, 0.5, 15, 15); ctx.strokeRect(ox + 16.5, 0.5, 15, 15);
      ctx.strokeRect(ox + 8.5, 16.5, 15, 15);
    }
  }
  tex.refresh();
}

function drawCultivator(scene: Phaser.Scene, key: string, robe: number, trim: number) {
  const g = scene.make.graphics({}, false);
  // bóng
  g.fillStyle(0x000000, 0.18); g.fillEllipse(16, 37, 22, 7);
  // áo bào
  g.fillStyle(robe, 1); g.fillTriangle(16, 12, 4, 36, 28, 36);
  g.fillStyle(trim, 1); g.fillRect(14, 16, 4, 20);
  // tay áo
  g.fillStyle(robe, 1); g.fillEllipse(7, 22, 8, 12); g.fillEllipse(25, 22, 8, 12);
  // đầu + tóc búi
  g.fillStyle(0xf1d9b8, 1); g.fillCircle(16, 10, 7);
  g.fillStyle(0x1f1a17, 1); g.fillCircle(16, 4, 4); g.fillRect(9, 4, 14, 4);
  // kiếm sau lưng
  g.lineStyle(2, 0x9aa7b0, 1); g.lineBetween(24, 6, 30, 30);
  g.generateTexture(key, 32, 40);
  g.destroy();
}

function drawMonster(scene: Phaser.Scene, id: string, color: number, r: number) {
  const size = Math.ceil(r * 2 + 12);
  const c = size / 2;
  const g = scene.make.graphics({}, false);
  g.fillStyle(0x000000, 0.2); g.fillEllipse(c, c + r * 0.8, r * 2, r * 0.6);
  if (id === "mang") {
    // thân rắn cuộn
    g.fillStyle(color, 1);
    g.fillCircle(c - r * 0.4, c + r * 0.3, r * 0.6);
    g.fillCircle(c + r * 0.3, c + r * 0.2, r * 0.55);
    g.fillCircle(c + r * 0.1, c - r * 0.4, r * 0.5);
    g.fillStyle(0xe8c25a, 1); g.fillCircle(c - r * 0.4, c + r * 0.3, r * 0.22);
  } else {
    g.fillStyle(color, 1); g.fillEllipse(c, c + 2, r * 2, r * 1.6);
    // tai
    if (id === "tho") { g.fillEllipse(c - 4, c - r, 5, 12); g.fillEllipse(c + 4, c - r, 5, 12); }
    else { g.fillTriangle(c - r * 0.7, c - r * 0.3, c - r * 0.3, c - r * 1.1, c - r * 0.1, c - r * 0.4); g.fillTriangle(c + r * 0.7, c - r * 0.3, c + r * 0.3, c - r * 1.1, c + r * 0.1, c - r * 0.4); }
    if (id === "ho") { g.lineStyle(2, 0xd0a040, 1); for (let i = -1; i <= 1; i++) g.lineBetween(c + i * 6, c - r * 0.5, c + i * 6 + 2, c + r * 0.4); }
  }
  // mắt
  g.fillStyle(id === "tho" ? 0xd04050 : 0xffd060, 1);
  g.fillCircle(c - r * 0.3, c - r * 0.15, Math.max(1.5, r * 0.12));
  g.fillCircle(c + r * 0.3, c - r * 0.15, Math.max(1.5, r * 0.12));
  g.generateTexture(`mon-${id}`, size, size);
  g.destroy();
}

export function makeTextures(scene: Phaser.Scene) {
  makeTileset(scene);
  drawCultivator(scene, "me", 0xf3f0e6, 0x2f6f8f);
  drawCultivator(scene, "other", 0x5a6f86, 0xc9a24a);
  for (const m of MONSTERS) drawMonster(scene, m.id, m.color, m.radius);

  const g = scene.make.graphics({}, false);
  g.fillStyle(0xffffff, 1); g.fillCircle(8, 8, 8);
  g.generateTexture("dot", 16, 16);
  g.clear();
  // luồng kiếm khí
  g.fillStyle(0xbfe8ff, 1); g.fillTriangle(0, 6, 48, 0, 48, 12);
  g.fillStyle(0xffffff, 1); g.fillTriangle(16, 6, 48, 3, 48, 9);
  g.generateTexture("swordbeam", 48, 12);
  g.destroy();
}
