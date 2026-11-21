// Bản đồ từ tệp JSON của Tiled (docs/THIET_KE_BAN_DO_TILED.md, QUYET_DINH_M3 mục 62 giai đoạn 2, lát cắt S1).
// MỘT nguồn cho client và server: tệp `shared/maps/<id>.json` (lát cắt S2 mới thêm tệp thật). Module này chỉ ĐỌC + KIỂM tệp và dựng `MapDef`; `GameMap` (map.ts) giữ nguyên mọi phép đo.
// Cố ý KHÔNG import giá trị nào từ map.ts (chỉ kiểu) để tránh vòng import: map.ts không cần biết tệp Tiled, chỉ nhận `MapDef.tiles` đã dựng sẵn.
//
// Định dạng tối thiểu (đọc docs mục 4):
//  - `orientation: "orthogonal"`, `infinite: false`, `tilewidth == tileheight`, `width` x `height` ô (<= TILED_MAX_SIDE), dữ liệu ô là MẢNG số (không nén).
//  - thuộc tính bản đồ: `schema` (= TILED_SCHEMA), `id`, `name`, tuỳ chọn `townName`, `wildName`, `monsterCap` (chuỗi JSON `{"id_quai": số}`), `seed` (số nguyên: hạt giống TRANG TRÍ tất định của client, vd bố trí sương mù; không sinh ô), `kind` (chỉ `"world"`).
//  - lớp ô `logic`: mỗi ô là `firstgid + T` của tileset tên `logic` (8 ô, theo thứ tự enum `T` của map.ts); 0 (ô trống) và cờ lật KHÔNG hợp lệ. Các lớp hình khác bị bỏ qua ở đây (client dùng, S3).
//  - lớp đối tượng `objects`: MỘT `town`, tối đa MỘT `lair` (điểm đặt trong ô tâm, thuộc tính `r` tính bằng ô) và các `portal` (điểm đặt ở tâm cổng; `id`, `name`, `toMap`, `toPortal`, `r`, `safeR`, `spawnX`, `spawnY`
//    tính bằng px CỦA TỆP: nhân `tile / tilewidth` ra px thế giới). Đối tượng loại khác bị bỏ qua.
//  - `spawnZone` (S5): hình CHỮ NHẬT hoặc ELIP (không phải điểm / đa giác), thuộc tính `monster` (id quái) và tuỳ chọn `max`; `x, y` là góc trên trái của khung như Tiled ghi.
import type { MapDef, PortalDef, SpawnZoneDef } from "./map";

export const TILED_SCHEMA = 1;
/** Số loại ô logic (= số thành viên của enum `T` trong map.ts; test giữ khớp) */
export const LOGIC_TILE_COUNT = 8;
/** Cạnh tối đa (ô): chặn tệp lớn bất thường */
export const TILED_MAX_SIDE = 512;

export interface TiledProperty {
  name: string;
  type?: string;
  value: string | number | boolean;
}
export interface TiledObject {
  id?: number;
  name?: string;
  /** Tiled <= 1.8 ghi `type`, từ 1.9 ghi `class` */
  type?: string;
  class?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  point?: boolean;
  /** Elip (khung `x, y, width, height`) */
  ellipse?: boolean;
  properties?: TiledProperty[];
}
export interface TiledLayer {
  type: string;
  name: string;
  width?: number;
  height?: number;
  data?: number[] | string;
  objects?: TiledObject[];
  properties?: TiledProperty[];
}
export interface TiledTileset {
  firstgid: number;
  name?: string;
  source?: string;
}
export interface TiledMap {
  type?: string;
  orientation: string;
  infinite: boolean;
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
  tilesets?: TiledTileset[];
  properties?: TiledProperty[];
}

/** Kết quả đọc một tệp hợp lệ (toạ độ cổng đã đổi sang px THẾ GIỚI) */
export interface ParsedTiled {
  id: string;
  name: string;
  townName?: string;
  wildName?: string;
  /** Hạt giống trang trí tất định (client); 0 nếu tệp không khai */
  seed: number;
  w: number;
  h: number;
  /** Loại ô logic (giá trị enum `T`), đúng `w * h` */
  tiles: Uint8Array;
  town: { cx: number; cy: number; r: number };
  lair?: { cx: number; cy: number; r: number };
  portals: PortalDef[];
  monsterCap?: Record<string, number>;
  /** Vùng sinh (px THẾ GIỚI, đã nhân `tile / tilewidth`); rỗng nếu tệp không khai */
  spawnZones: SpawnZoneDef[];
}

type Rec = Record<string, unknown>;
type PropVal = string | number | boolean;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const ID_RE = /^[a-z0-9_]+$/;

function propsOf(o: unknown, at: string, errs: string[]): Map<string, PropVal> {
  const out = new Map<string, PropVal>();
  const raw = isRec(o) ? o.properties : undefined;
  if (raw === undefined) return out;
  if (!Array.isArray(raw)) {
    errs.push(`${at}: properties phải là mảng`);
    return out;
  }
  for (const p of raw) {
    if (
      !isRec(p) ||
      typeof p.name !== "string" ||
      !(typeof p.value === "string" || typeof p.value === "number" || typeof p.value === "boolean")
    ) {
      errs.push(`${at}: có thuộc tính sai dạng (cần name + value)`);
      continue;
    }
    if (out.has(p.name)) errs.push(`${at}: thuộc tính '${p.name}' bị khai hai lần`);
    out.set(p.name, p.value);
  }
  return out;
}

function needStr(m: Map<string, PropVal>, k: string, at: string, errs: string[]): string {
  const v = m.get(k);
  if (typeof v !== "string" || v === "") {
    errs.push(`${at}: thiếu thuộc tính chuỗi '${k}'`);
    return "";
  }
  return v;
}
function needNum(m: Map<string, PropVal>, k: string, at: string, errs: string[]): number {
  const v = m.get(k);
  if (!isNum(v)) {
    errs.push(`${at}: thiếu thuộc tính số '${k}' (hữu hạn)`);
    return NaN;
  }
  return v;
}

/** Tên tileset logic: nhúng (`name`) hoặc ngoài (`source` = `logic.tsx`) */
function logicFirstGid(tilesets: unknown): number | undefined {
  if (!Array.isArray(tilesets)) return undefined;
  for (const ts of tilesets) {
    if (!isRec(ts) || !isInt(ts.firstgid)) continue;
    const name =
      typeof ts.name === "string"
        ? ts.name
        : typeof ts.source === "string"
          ? (ts.source.split("/").pop() ?? "").replace(/\.[a-z]+$/i, "")
          : "";
    if (name === "logic") return ts.firstgid;
  }
  return undefined;
}

interface Analysis {
  errors: string[];
  /** Có đủ dữ liệu để dựng (kể cả khi `errors` rỗng); chỉ có giá trị khi `errors` rỗng */
  built?: {
    parsedBase: Omit<ParsedTiled, "portals" | "spawnZones"> & {
      rawZones: SpawnZoneDef[];
      rawPortals: {
        id: string;
        name: string;
        x: number;
        y: number;
        r: number;
        safeR: number;
        spawnX: number;
        spawnY: number;
        toMap: string;
        toPortal: string;
      }[];
    };
    tw: number;
  };
}

function analyze(json: unknown): Analysis {
  const errors: string[] = [];
  if (!isRec(json)) return { errors: ["tệp không phải một đối tượng JSON"] };
  const mapProps = propsOf(json, "bản đồ", errors);
  const idRaw = mapProps.get("id");
  const id = typeof idRaw === "string" && ID_RE.test(idRaw) ? idRaw : "";
  if (!id) errors.push("bản đồ: thuộc tính 'id' phải là chuỗi [a-z0-9_]+");
  const at = id ? `bản đồ ${id}` : "bản đồ";
  if (json.type !== undefined && json.type !== "map") errors.push(`${at}: type phải là 'map'`);
  if (mapProps.get("schema") !== TILED_SCHEMA)
    errors.push(`${at}: thuộc tính 'schema' phải bằng ${TILED_SCHEMA}`);
  if (json.orientation !== "orthogonal") errors.push(`${at}: orientation phải là 'orthogonal'`);
  if (json.infinite !== false) errors.push(`${at}: infinite phải là false`);
  const name = needStr(mapProps, "name", at, errors);
  const kind = mapProps.get("kind");
  if (kind !== undefined && kind !== "world")
    errors.push(`${at}: kind chỉ được là 'world' (bí cảnh / đấu trường sinh theo seed)`);
  const w = json.width;
  const h = json.height;
  if (!isInt(w) || !isInt(h) || w < 8 || h < 8 || w > TILED_MAX_SIDE || h > TILED_MAX_SIDE) {
    errors.push(`${at}: width / height phải là số nguyên trong [8, ${TILED_MAX_SIDE}]`);
    return { errors };
  }
  const tw = json.tilewidth;
  const th = json.tileheight;
  if (!isNum(tw) || !(tw > 0) || tw !== th)
    errors.push(`${at}: tilewidth phải bằng tileheight và > 0`);

  // monsterCap
  let monsterCap: Record<string, number> | undefined;
  const capRaw = mapProps.get("monsterCap");
  if (capRaw !== undefined) {
    try {
      const parsed: unknown = typeof capRaw === "string" ? JSON.parse(capRaw) : null;
      if (!isRec(parsed)) throw new Error("không phải đối tượng");
      monsterCap = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (!isInt(v) || v < 0) throw new Error(`'${k}' phải là số nguyên >= 0`);
        monsterCap[k] = v;
      }
    } catch (e) {
      errors.push(`${at}: monsterCap không hợp lệ (${(e as Error).message})`);
    }
  }

  const seedRaw = mapProps.get("seed");
  if (seedRaw !== undefined && !isInt(seedRaw))
    errors.push(`${at}: thuộc tính 'seed' phải là số nguyên`);

  const layers = Array.isArray(json.layers) ? json.layers.filter(isRec) : [];
  if (!Array.isArray(json.layers)) errors.push(`${at}: thiếu layers`);

  // lớp logic
  const gid0 = logicFirstGid(json.tilesets);
  if (gid0 === undefined) errors.push(`${at}: thiếu tileset 'logic' (firstgid)`);
  const logic = layers.find((l) => l.name === "logic" && l.type === "tilelayer");
  let tiles: Uint8Array | undefined;
  if (!logic) errors.push(`${at}: thiếu lớp ô 'logic'`);
  else {
    if (logic.width !== undefined && logic.width !== w) errors.push(`${at}: lớp logic sai width`);
    if (logic.height !== undefined && logic.height !== h)
      errors.push(`${at}: lớp logic sai height`);
    const data = logic.data;
    if (!Array.isArray(data))
      errors.push(`${at}: lớp logic.data phải là MẢNG số (không nén / base64)`);
    else if (data.length !== w * h)
      errors.push(`${at}: lớp logic có ${data.length} ô, cần ${w * h}`);
    else if (gid0 !== undefined) {
      const t = new Uint8Array(w * h);
      let bad = 0;
      for (let i = 0; i < data.length; i++) {
        const v = data[i];
        const k = isInt(v) ? v - gid0 : -1;
        if (k < 0 || k >= LOGIC_TILE_COUNT) {
          if (bad++ < 3)
            errors.push(
              `${at}: lớp logic ô ${i % w},${Math.floor(i / w)} = ${String(v)} (cần ${gid0}..${gid0 + LOGIC_TILE_COUNT - 1})`,
            );
        } else t[i] = k;
      }
      if (bad > 3) errors.push(`${at}: lớp logic còn ${bad - 3} ô sai nữa`);
      if (bad === 0) tiles = t;
    }
  }

  // đối tượng
  const objLayer = layers.find((l) => l.name === "objects" && l.type === "objectgroup");
  const towns: { cx: number; cy: number; r: number }[] = [];
  const lairs: { cx: number; cy: number; r: number }[] = [];
  const rawPortals: NonNullable<Analysis["built"]>["parsedBase"]["rawPortals"] = [];
  const rawZones: SpawnZoneDef[] = [];
  if (!objLayer) errors.push(`${at}: thiếu lớp đối tượng 'objects'`);
  else if (!Array.isArray(objLayer.objects)) errors.push(`${at}: lớp objects thiếu objects`);
  else if (isNum(tw) && tw > 0) {
    const seen = new Set<string>();
    for (const o of objLayer.objects) {
      if (!isRec(o)) {
        errors.push(`${at}: có đối tượng không phải JSON đối tượng`);
        continue;
      }
      const kindOf = typeof o.class === "string" && o.class !== "" ? o.class : o.type;
      if (kindOf !== "town" && kindOf !== "lair" && kindOf !== "portal" && kindOf !== "spawnZone")
        continue;
      const oAt = `${at}: ${String(kindOf)}${typeof o.name === "string" && o.name ? " " + o.name : ""}`;
      if (!isNum(o.x) || !isNum(o.y)) {
        errors.push(`${oAt}: thiếu x / y`);
        continue;
      }
      if (kindOf === "spawnZone") {
        // Vùng sinh là khung (chữ nhật / elip), ngược với mọi đối tượng khác (điểm): điểm, đa giác, đường gấp khúc, chữ đều không có khung nên bị từ chối.
        if (o.point === true || "polygon" in o || "polyline" in o || "text" in o) {
          errors.push(
            `${oAt}: phải là hình CHỮ NHẬT hoặc ELIP, không phải điểm / đa giác / đường / chữ`,
          );
          continue;
        }
        const zp = propsOf(o, oAt, errors);
        const monster = needStr(zp, "monster", oAt, errors);
        const maxRaw = zp.get("max");
        if (maxRaw !== undefined && (!isInt(maxRaw) || maxRaw < 1))
          errors.push(`${oAt}: max phải là số nguyên >= 1`);
        if (!isNum(o.width) || !isNum(o.height) || !(o.width > 0) || !(o.height > 0)) {
          errors.push(`${oAt}: khung phải có width / height > 0`);
          continue;
        }
        if (o.ellipse !== undefined && typeof o.ellipse !== "boolean") {
          errors.push(`${oAt}: ellipse phải là true / false`);
          continue;
        }
        // Khung nằm trong bản đồ: toạ độ tính theo px của tệp, nên so với `w * tilewidth`
        if (o.x < 0 || o.y < 0 || o.x + o.width > w * tw || o.y + o.height > h * tw)
          errors.push(`${oAt}: khung nằm ngoài bản đồ`);
        rawZones.push({
          monster,
          shape: o.ellipse === true ? "ellipse" : "rect",
          x: o.x,
          y: o.y,
          w: o.width,
          h: o.height,
          ...(isInt(maxRaw) ? { max: maxRaw } : {}),
        });
        continue;
      }
      // Tiled ghi x, y của elip / chữ nhật là GÓC TRÊN TRÁI của khung, không phải tâm: coi là tâm thì trấn / cổng lệch im lặng. Chỉ nhận đối tượng ĐIỂM.
      if (o.point !== true) {
        errors.push(`${oAt}: phải là đối tượng ĐIỂM (point), không phải elip / chữ nhật / chữ`);
        continue;
      }
      const p = propsOf(o, oAt, errors);
      if (kindOf === "portal") {
        const pid = needStr(p, "id", oAt, errors);
        if (pid && !ID_RE.test(pid)) errors.push(`${oAt}: id '${pid}' phải là [a-z0-9_]+`);
        if (pid && seen.has(pid)) errors.push(`${oAt}: id '${pid}' trùng`);
        seen.add(pid);
        const r = needNum(p, "r", oAt, errors);
        const safeR = needNum(p, "safeR", oAt, errors);
        if (!(r > 0) || !(safeR >= r)) errors.push(`${oAt}: cần 0 < r <= safeR`);
        rawPortals.push({
          id: pid,
          name: needStr(p, "name", oAt, errors),
          x: o.x,
          y: o.y,
          r,
          safeR,
          spawnX: needNum(p, "spawnX", oAt, errors),
          spawnY: needNum(p, "spawnY", oAt, errors),
          toMap: needStr(p, "toMap", oAt, errors),
          toPortal: needStr(p, "toPortal", oAt, errors),
        });
      } else {
        const r = needNum(p, "r", oAt, errors);
        const cx = Math.floor(o.x / tw);
        const cy = Math.floor(o.y / tw);
        if (!(r >= 1)) errors.push(`${oAt}: r phải >= 1 ô`);
        if (cx < 0 || cy < 0 || cx >= w || cy >= h) errors.push(`${oAt}: nằm ngoài bản đồ`);
        (kindOf === "town" ? towns : lairs).push({ cx, cy, r });
      }
    }
    if (towns.length !== 1)
      errors.push(`${at}: cần ĐÚNG một đối tượng 'town' (có ${towns.length})`);
    if (lairs.length > 1) errors.push(`${at}: tối đa một đối tượng 'lair' (có ${lairs.length})`);
  }

  if (errors.length > 0 || !tiles || !isNum(tw)) return { errors };
  return {
    errors,
    built: {
      tw,
      parsedBase: {
        id,
        name,
        townName:
          typeof mapProps.get("townName") === "string"
            ? (mapProps.get("townName") as string)
            : undefined,
        seed: isInt(seedRaw) ? seedRaw : 0,
        wildName:
          typeof mapProps.get("wildName") === "string"
            ? (mapProps.get("wildName") as string)
            : undefined,
        w,
        h,
        tiles,
        town: towns[0]!,
        lair: lairs[0],
        monsterCap,
        rawPortals,
        rawZones,
      },
    },
  };
}

/**
 * Mọi lỗi của một tệp Tiled (rỗng = hợp lệ): cấu trúc, lớp logic, đối tượng. KHÔNG kiểm chỗ đặt (cổng trên ô chặn, hang đè trấn): `GameMap`
 * kiểm khi dựng (`checkPortals`, `checkLair`...), và liên thông / cổng hai chiều giữa các bản đồ kiểm ở lát cắt S2 trên dữ liệu thật.
 */
export function tiledViolations(json: unknown): string[] {
  return analyze(json).errors;
}

/** Đọc tệp hợp lệ; sai thì ném lỗi gom MỌI vi phạm. `tile` là px thế giới của một ô (`TILE`), toạ độ cổng đổi theo `tile / tilewidth`. */
export function parseTiledMap(json: unknown, tile: number): ParsedTiled {
  const a = analyze(json);
  if (a.errors.length > 0 || !a.built) throw new Error(a.errors.join("\n"));
  if (!isNum(tile) || !(tile > 0)) throw new Error("parseTiledMap: tile phải > 0");
  const { parsedBase: b, tw } = a.built;
  const k = tile / tw;
  const { rawPortals, rawZones, ...rest } = b;
  return {
    ...rest,
    spawnZones: rawZones.map((z) => ({ ...z, x: z.x * k, y: z.y * k, w: z.w * k, h: z.h * k })),
    portals: rawPortals.map((p) => ({
      id: p.id,
      name: p.name,
      x: p.x * k,
      y: p.y * k,
      r: p.r * k,
      safeR: p.safeR * k,
      spawn: { x: p.spawnX * k, y: p.spawnY * k },
      toMap: p.toMap,
      toPortal: p.toPortal,
    })),
  };
}

/** `MapDef` dựng từ tệp (đưa thẳng cho `new GameMap`): `tiles` dựng sẵn nên `GameMap` không sinh ô theo `seed`; `seed` còn lại chỉ là hạt giống trang trí tất định của client (0 nếu tệp không khai). */
export function mapDefFromTiled(json: unknown, tile: number): MapDef {
  const p = parseTiledMap(json, tile);
  return {
    id: p.id,
    name: p.name,
    seed: p.seed,
    w: p.w,
    h: p.h,
    town: p.town,
    ...(p.townName !== undefined ? { townName: p.townName } : {}),
    ...(p.wildName !== undefined ? { wildName: p.wildName } : {}),
    ...(p.portals.length > 0 ? { portals: p.portals } : {}),
    ...(p.lair ? { lair: p.lair } : {}),
    ...(p.monsterCap ? { monsterCap: p.monsterCap } : {}),
    ...(p.spawnZones.length > 0 ? { spawnZones: p.spawnZones } : {}),
    tiles: p.tiles,
  };
}
