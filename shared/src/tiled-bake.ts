// Xuất một `GameMap` (sinh theo `seed`) ra tệp Tiled (docs/THIET_KE_BAN_DO_TILED.md, lát cắt S2). Dùng cho công cụ `npm run map:bake -w server` và cho test "đồng hồ chuẩn":
// `GameMap` dựng lại từ tệp phải giống bản sinh theo `seed` từng ô / cổng / trấn. Chỉ xuất bản CHẠY logic (`<id>.logic.json`: lớp `logic` + `objects`, chưa có lớp hình, mục 4a).
// Toạ độ đối tượng ghi bằng px CỦA TỆP (`TILED_TILE_PX`), `parseTiledMap` nhân ngược `TILE / tilewidth` khi đọc.
import { TILE, type GameMap } from "./map";
import { TILED_SCHEMA, type TiledMap, type TiledProperty } from "./tiled";

/** px của một ô trong tệp (ảnh 16 px phóng ×2 = `TILE` 32; docs mục 4) */
export const TILED_TILE_PX = 16;

const prop = (name: string, value: string | number | boolean): TiledProperty => ({ name, value });

/** Dựng tệp Tiled (logic + objects) từ một `GameMap`. */
export function bakeTiledMap(map: GameMap): TiledMap {
  const { def } = map;
  const k = TILED_TILE_PX / TILE;
  const props: TiledProperty[] = [
    prop("schema", TILED_SCHEMA),
    prop("id", def.id),
    prop("name", def.name),
    prop("townName", map.townName),
    prop("wildName", map.wildName),
    prop("seed", def.seed),
  ];
  // Chỉ ghi khi bản đồ KHAI RIÊNG: không khai thì vẫn theo `MONSTER_CAP` mặc định của game.ts (đổi mặc định thì mọi bản đồ không khai đổi theo, như trước)
  if (def.monsterCap) props.push(prop("monsterCap", JSON.stringify(def.monsterCap)));
  return {
    type: "map",
    orientation: "orthogonal",
    infinite: false,
    width: def.w,
    height: def.h,
    tilewidth: TILED_TILE_PX,
    tileheight: TILED_TILE_PX,
    properties: props,
    tilesets: [{ firstgid: 1, name: "logic" }],
    layers: [
      {
        type: "tilelayer",
        name: "logic",
        width: def.w,
        height: def.h,
        data: Array.from(map.tiles, (t) => t + 1),
      },
      {
        type: "objectgroup",
        name: "objects",
        objects: [
          {
            id: 1,
            name: "town",
            class: "town",
            x: (def.town.cx + 0.5) * TILED_TILE_PX,
            y: (def.town.cy + 0.5) * TILED_TILE_PX,
            point: true,
            properties: [prop("r", def.town.r)],
          },
          ...(def.lair
            ? [
                {
                  id: 2,
                  name: "lair",
                  class: "lair",
                  x: (def.lair.cx + 0.5) * TILED_TILE_PX,
                  y: (def.lair.cy + 0.5) * TILED_TILE_PX,
                  point: true,
                  properties: [prop("r", def.lair.r)],
                },
              ]
            : []),
          // Vùng sinh (S5): chữ nhật / elip, `x, y` là góc trên trái của khung (như Tiled ghi); thứ tự vùng giữ nguyên
          ...map.spawnZones.map((z, i) => ({
            id: 100 + i,
            name: `${z.monster}_${i + 1}`,
            class: "spawnZone",
            x: z.x * k,
            y: z.y * k,
            width: z.w * k,
            height: z.h * k,
            ...(z.shape === "ellipse" ? { ellipse: true } : {}),
            properties: [
              prop("monster", z.monster),
              ...(z.max !== undefined ? [prop("max", z.max)] : []),
            ],
          })),
          ...map.portals.map((p, i) => ({
            id: 10 + i,
            name: p.id,
            class: "portal",
            x: p.x * k,
            y: p.y * k,
            point: true,
            properties: [
              prop("id", p.id),
              prop("name", p.name),
              prop("toMap", p.toMap),
              prop("toPortal", p.toPortal),
              prop("r", p.r * k),
              prop("safeR", p.safeR * k),
              prop("spawnX", p.spawn.x * k),
              prop("spawnY", p.spawn.y * k),
            ],
          })),
        ],
      },
    ],
  };
}

/**
 * Chuỗi JSON TẤT ĐỊNH và ĐỌC ĐƯỢC trong `git diff`: khoá giữ thứ tự dựng, thụt 1 khoảng trắng, mỗi HÀNG ô logic một dòng (không đổ cả mảng thành một cột dài). Kết thúc bằng xuống dòng.
 * Vẫn là JSON hợp lệ cho Tiled và `JSON.parse`.
 */
export function formatTiledJson(json: TiledMap): string {
  const token = "@@DATA@@";
  const rowsByToken: string[] = [];
  const copy = structuredClone(json);
  for (const layer of copy.layers) {
    if (layer.type === "tilelayer" && Array.isArray(layer.data) && layer.width) {
      const w = layer.width;
      const rows: string[] = [];
      for (let i = 0; i < layer.data.length; i += w)
        rows.push(layer.data.slice(i, i + w).join(","));
      rowsByToken.push(`[\n${rows.map((r) => `   ${r}`).join(",\n")}\n  ]`);
      (layer as { data: unknown }).data = token;
    }
  }
  let out = JSON.stringify(copy, null, 1);
  for (const r of rowsByToken) out = out.replace(`"${token}"`, () => r);
  return `${out}\n`;
}
