// Quản lý nạp asset thật (tileset.png + atlas.png/atlas.json) và đăng ký hoạt ảnh 4 hướng.
// Giữ cơ chế fallback vẽ tạm bằng code cho các quái/vật phẩm mới thêm trong shared/ mà chưa kịp đóng gói vào atlas.
import Phaser from "phaser";
import { TILE, T, MONSTERS, ITEMS, NPCS } from "@tien-gioi/shared";

export const TILESET_KEY = "tileset";
export const ATLAS_KEY = "atlas";
export type Dir4 = "down" | "up" | "left" | "right";
const DIRS: Dir4[] = ["down", "up", "left", "right"];

/** Chuyển góc radian sang 1 trong 4 hướng nhìn. */
export function dirFromAngle(angle: number): Dir4 {
  const deg = Phaser.Math.RadToDeg(Phaser.Math.Angle.Wrap(angle));
  if (deg >= -45 && deg <= 45) return "right";
  if (deg > 45 && deg < 135) return "down";
  if (deg >= 135 || deg <= -135) return "left";
  return "up";
}

/** Nạp tileset và texture atlas thật trong preload() của WorldScene. */
export function preloadAssets(scene: Phaser.Scene) {
  scene.load.image(TILESET_KEY, "/assets/tileset.png");
  scene.load.atlas(ATLAS_KEY, "/assets/atlas.png", "/assets/atlas.json");
}

function registerAnimations(scene: Phaser.Scene) {
  if (!scene.textures.exists(ATLAS_KEY)) return;
  const atlasTex = scene.textures.get(ATLAS_KEY);
  const srcImg = atlasTex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;

  // Sao chép các frame gốc từ atlas thành texture key độc lập ("me", "other", "mon-<id>", "swordbeam", "dot", "item-<id>")
  // để mọi lệnh this.add.image(..., key) hoặc this.add.sprite(..., key) giữ nguyên key cũ vẫn chạy.
  const copyFrameToTexture = (frameName: string) => {
    if (scene.textures.exists(frameName) || !atlasTex.has(frameName)) return;
    const f = atlasTex.get(frameName);
    const canvasTex = scene.textures.createCanvas(frameName, f.cutWidth, f.cutHeight);
    if (!canvasTex) return;
    const ctx = canvasTex.getContext();
    ctx.drawImage(srcImg, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, f.cutWidth, f.cutHeight);
    canvasTex.refresh();
  };

  const robeKeys = ["robe-tho_nhung_bao", "robe-hac_ho_bao", "robe-xich_lan_bao"];
  for (const key of ["me", "other", "swordbeam", "dot", ...robeKeys]) copyFrameToTexture(key);
  for (const m of MONSTERS) copyFrameToTexture(`mon-${m.id}`);
  for (const it of ITEMS) copyFrameToTexture(`item-${it.id}`);
  for (const n of NPCS) copyFrameToTexture(`npc-${n.id}`);

  // Hoạt ảnh 4 hướng cho người chơi ("me", "other" và các bộ pháp bào)
  for (const who of ["me", "other", ...robeKeys]) {
    for (const d of DIRS) {
      const idleKey = `${who}-idle-${d}`;
      if (!scene.anims.exists(idleKey) && atlasTex.has(idleKey)) {
        scene.anims.create({
          key: idleKey,
          frames: [{ key: ATLAS_KEY, frame: idleKey }],
          frameRate: 1,
          repeat: -1,
        });
      }
      const walkKey = `${who}-walk-${d}`;
      if (!scene.anims.exists(walkKey) && atlasTex.has(`${walkKey}-0`)) {
        scene.anims.create({
          key: walkKey,
          frames: [0, 1, 2, 3].map((i) => ({
            key: ATLAS_KEY,
            frame: `${walkKey}-i`.replace("-i", `-${i}`),
          })),
          frameRate: 8,
          repeat: -1,
        });
      }
      const slashKey = `${who}-slash-${d}`;
      if (!scene.anims.exists(slashKey) && atlasTex.has(`${slashKey}-0`)) {
        scene.anims.create({
          key: slashKey,
          frames: [0, 1, 2].map((i) => ({ key: ATLAS_KEY, frame: `${slashKey}-${i}` })),
          frameRate: 14,
          repeat: 0,
        });
      }
    }
  }

  // Hoạt ảnh cho yêu thú
  for (const m of MONSTERS) {
    const animKey = `mon-${m.id}-move`;
    if (!scene.anims.exists(animKey) && atlasTex.has(`mon-${m.id}-0`)) {
      scene.anims.create({
        key: animKey,
        frames: [
          { key: ATLAS_KEY, frame: `mon-${m.id}-0` },
          { key: ATLAS_KEY, frame: `mon-${m.id}-1` },
        ],
        frameRate: 4,
        repeat: -1,
      });
    }
  }
}

// ---------------- Dự phòng (Fallback) cho quái/vật phẩm mới chưa có trong atlas ----------------

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

export function makeTileset(scene: Phaser.Scene) {
  if (scene.textures.exists(TILESET_KEY)) return;
  const types = Object.keys(TILE_COLORS).map(Number) as T[];
  const tex = scene.textures.createCanvas(TILESET_KEY, TILE * types.length, TILE)!;
  const ctx = tex.getContext();
  for (const t of types) {
    const ox = t * TILE;
    const [base] = TILE_COLORS[t];
    ctx.fillStyle = base;
    ctx.fillRect(ox, 0, TILE, TILE);
  }
  tex.refresh();
}

function drawMonsterFallback(scene: Phaser.Scene, id: string, color: number, r: number) {
  const key = `mon-${id}`;
  if (scene.textures.exists(key)) return;
  const size = Math.ceil(r * 2 + 12);
  const c = size / 2;
  const g = scene.make.graphics({}, false);
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(c, c + r * 0.8, r * 2, r * 0.6);
  g.fillStyle(color, 1);
  g.fillEllipse(c, c + 2, r * 2, r * 1.6);
  g.generateTexture(key, size, size);
  g.destroy();
}

function drawItemFallback(scene: Phaser.Scene, id: string, color: number) {
  const key = `item-${id}`;
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({}, false);
  g.fillStyle(0x000000, 0.25);
  g.fillEllipse(12, 20, 14, 5);
  g.fillStyle(color, 1);
  g.fillCircle(12, 12, 7);
  g.lineStyle(1.5, 0xffffff, 0.65);
  g.strokeCircle(12, 12, 7);
  g.generateTexture(key, 24, 24);
  g.destroy();
}

function drawNpcFallback(scene: Phaser.Scene, id: string, color: number) {
  const key = `npc-${id}`;
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({}, false);
  g.fillStyle(0x000000, 0.25);
  g.fillEllipse(18, 38, 22, 7);
  g.fillStyle(color, 1);
  g.fillTriangle(18, 12, 6, 36, 30, 36);
  g.fillStyle(0xf2d7b6, 1);
  g.fillCircle(18, 12, 6.5);
  g.lineStyle(1.5, 0xc9a24a, 0.9);
  g.strokeRect(11, 22, 14, 3);
  g.generateTexture(key, 36, 42);
  g.destroy();
}

export function makeTextures(scene: Phaser.Scene) {
  registerAnimations(scene);
  makeTileset(scene);
  for (const m of MONSTERS) drawMonsterFallback(scene, m.id, m.color, m.radius);
  for (const it of ITEMS) drawItemFallback(scene, it.id, it.color);
  for (const n of NPCS) drawNpcFallback(scene, n.id, n.color);

  if (!scene.textures.exists("dot")) {
    const g = scene.make.graphics({}, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 8);
    g.generateTexture("dot", 16, 16);
    g.destroy();
  }
  if (!scene.textures.exists("swordbeam")) {
    const g = scene.make.graphics({}, false);
    g.fillStyle(0xbfe8ff, 1);
    g.fillTriangle(0, 6, 48, 0, 48, 12);
    g.generateTexture("swordbeam", 48, 12);
    g.destroy();
  }
  if (!scene.textures.exists("portal")) {
    const g = scene.make.graphics({}, false);
    // Vòng xoáy hào quang tiên hiệp xanh lam - tím ngọc
    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(24, 44, 34, 10); // bóng đổ
    g.fillStyle(0x3a1c71, 0.7);
    g.fillCircle(24, 24, 20);
    g.fillStyle(0x4a90e2, 0.85);
    g.fillCircle(24, 24, 15);
    g.fillStyle(0xa8ff78, 0.9);
    g.fillCircle(24, 24, 8);
    g.lineStyle(2, 0xffffff, 0.95);
    g.strokeCircle(24, 24, 20);
    g.generateTexture("portal", 48, 48);
    g.destroy();
  }
}
