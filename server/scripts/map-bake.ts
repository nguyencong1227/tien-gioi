// Xuất BỐN bản đồ thường (sinh theo `seed`, `PROCEDURAL_MAPS`) ra tệp Tiled `shared/maps/<id>.logic.json` (docs/THIET_KE_BAN_DO_TILED.md lát cắt S2, mục 4a).
// `npm run map:bake -w server`        ghi lại các tệp.
// `npm run map:bake -w server -- --check`  KHÔNG ghi; thoát 1 nếu tệp trong repo khác bản vừa sinh (CI / trước khi commit): giữ tệp là sản phẩm đúng của công cụ.
// Chạy được cả khi tệp đang có hỏng / lạc hậu (chỉ cần `map.ts` nạp được các tệp, xem ghi chú ở `shared/src/map.ts`; lần đầu cần tệp tạm hợp lệ).
// Bản đồ SỬA TAY (S6): tệp có thuộc tính bản đồ `handEdited` = true (`server/src/systems/map-hand-edited.ts`) thì công cụ này BỎ QUA nó (tệp là nguồn duy nhất, dùng `map:build`).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GameMap, PROCEDURAL_MAPS, bakeTiledMap, formatTiledJson } from "@tien-gioi/shared";
import { isHandEditedTiled } from "../src/systems/map-hand-edited";

const here = path.dirname(fileURLToPath(import.meta.url));
// `MAP_BAKE_DIR` chỉ để TEST chạy công cụ trên thư mục tạm (không dùng thật)
const dir = process.env.MAP_BAKE_DIR
  ? path.resolve(process.env.MAP_BAKE_DIR)
  : path.resolve(here, "../../shared/maps");
const check = process.argv.includes("--check");

let bad = 0;
if (!check) mkdirSync(dir, { recursive: true });
for (const def of PROCEDURAL_MAPS) {
  const file = path.join(dir, `${def.id}.logic.json`);
  const rel = path.relative(path.resolve(here, "../.."), file);
  if (existsSync(file) && isHandEditedTiled(JSON.parse(readFileSync(file, "utf8")))) {
    console.log(`- ${rel}: bản đồ SỬA TAY (handEdited), bỏ qua (dùng npm run map:build -w server)`);
    continue;
  }
  const text = formatTiledJson(bakeTiledMap(new GameMap(def)));
  if (check) {
    const cur = existsSync(file) ? readFileSync(file, "utf8") : null;
    if (cur !== text) {
      console.error(`✗ ${rel}: khác bản sinh theo seed (chạy npm run map:bake -w server)`);
      bad++;
    } else console.log(`✓ ${rel}`);
  } else {
    writeFileSync(file, text);
    console.log(`đã ghi ${rel} (${(text.length / 1024).toFixed(1)} KB, ${def.w} x ${def.h} ô)`);
  }
}
if (bad > 0) process.exit(1);
