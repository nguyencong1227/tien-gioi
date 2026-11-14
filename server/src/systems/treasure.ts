// Pháp bảo (ô `treasure`, mở từ Kim Đan; M7.4, #505): nội tại đặc biệt `TREASURES` (shared/src/items.ts), SERVER thi hành. Sáu loại, mỗi loại một móc:
//  - `ho_than_an`: mỗi `intervalS` giây tự dựng khiên (status `shield`) bằng `shieldRatio` khí huyết tối đa           -> `tickTreasure`
//  - `dinh_tam_chung`: đứng yên từ `stillS` giây, mỗi giây hồi `hpRatioPerS` khí huyết tối đa                         -> `tickTreasure`
//  - `hap_linh_chau`: hạ một con quái hồi `mpRatio` linh lực tối đa                                                   -> `onTreasureKill`
//  - `phong_hanh_boi`: hạ một con quái tăng `speedRatio` tốc độ trong `ms` (status `haste`)                           -> `onTreasureKill`
//  - `xich_diem_an` / `han_bang_an`: chiêu thức đúng hệ gây thêm `dmgRatio` sát thương                                -> `treasureElementMult` (ở `cast`)
// Chỉ có tác dụng khi món ở ô `treasure` THẬT SỰ là pháp bảo (`equip.slot === "treasure"` + `equip.treasure` hợp lệ) và ô đã mở ở cảnh giới hiện tại (`equipSlotOpen`: file
// sửa tay đặt pháp bảo cho người chưa tới Kim Đan thì vô tác dụng). Chưa áp ở PK thách đấu (docs/THIET_KE_PK.md quyết riêng). Dữ liệu chạy (đồng hồ khiên, vị trí đứng yên)
// là của server (`PlayerCtrl.treasure`), không vào state chung.
import {
  ITEM_BY_ID,
  equipSlotOpen,
  treasureOf,
  type Element,
  type TreasureDef,
} from "@tien-gioi/shared";
import type { Player } from "../schema";
import { takeWhole, type PlayerCtrl, type World } from "../world";
import { applyPlayerStatus } from "./status";

/** Pháp bảo đang CÓ TÁC DỤNG của người chơi (món hợp lệ ở ô `treasure`, ô đã mở), hoặc `undefined`. */
export function treasureOfPlayer(p: Player): TreasureDef | undefined {
  const id = p.treasure;
  if (!id) return undefined;
  const e = Object.prototype.hasOwnProperty.call(ITEM_BY_ID, id) ? ITEM_BY_ID[id].equip : undefined;
  if (!e || e.slot !== "treasure") return undefined;
  if (!equipSlotOpen("treasure", p.realm)) return undefined;
  return treasureOf(e.treasure);
}

/** Dữ liệu chạy của pháp bảo (chỉ server): tạo lúc cần, làm lại khi đổi món. */
export interface TreasureRt {
  /** Món pháp bảo mà dữ liệu này thuộc về (đổi món thì làm lại từ đầu) */
  id: string;
  /** `ho_than_an`: lúc (ms, `w.now`) dựng khiên lần kế */
  nextShieldAt: number;
  /** `dinh_tam_chung`: vị trí lần trước và lúc bắt đầu đứng yên */
  x: number;
  y: number;
  stillSince: number;
  /** Phần hồi khí huyết chưa đủ 1 đơn vị (`takeWhole`) */
  acc: { hp: number };
}

/** Dịch chuyển nhỏ hơn mức này (px) giữa hai tick coi như đứng yên (số thực làm tròn). */
const STILL_EPS = 0.5;

function runtimeOf(c: PlayerCtrl, p: Player, now: number): TreasureRt {
  let rt = c.treasure;
  if (!rt || rt.id !== p.treasure) {
    rt = c.treasure = {
      id: p.treasure,
      nextShieldAt: 0,
      x: p.x,
      y: p.y,
      stillSince: now,
      acc: { hp: 0 },
    };
  }
  return rt;
}

/**
 * Một tick cho người chơi đang sống (gọi từ `tickWorld`, chỉ khi `p.treasure` khác rỗng: người không mặc pháp bảo không tốn gì). Khiên tự dựng và hồi khi đứng yên.
 */
export function tickTreasure(w: World, sid: string, p: Player, c: PlayerCtrl, dt: number) {
  const t = treasureOfPlayer(p);
  if (!t) {
    if (c.treasure) c.treasure = undefined; // đổi / tháo / ô khoá: bỏ dữ liệu cũ (mặc lại thì khiên dựng ngay)
    return;
  }
  const rt = runtimeOf(c, p, w.now);
  if (t.id === "ho_than_an") {
    if (w.now >= rt.nextShieldAt) {
      const { intervalS, shieldRatio } = t.params;
      rt.nextShieldAt = w.now + intervalS * 1000;
      applyPlayerStatus(
        w,
        sid,
        { status: "shield", ms: intervalS * 1000, ratio: shieldRatio, chance: 1 },
        0,
        sid,
      );
    }
  } else if (t.id === "dinh_tam_chung") {
    if (Math.hypot(p.x - rt.x, p.y - rt.y) > STILL_EPS) {
      rt.x = p.x;
      rt.y = p.y;
      rt.stillSince = w.now;
      rt.acc.hp = 0;
    } else if (w.now - rt.stillSince >= t.params.stillS * 1000 && p.hp < p.maxHp) {
      const add = takeWhole(rt.acc, "hp", t.params.hpRatioPerS * p.maxHp * dt);
      if (add) p.hp = Math.min(p.maxHp, p.hp + add);
    } else if (p.hp >= p.maxHp) {
      rt.acc.hp = 0; // đầy rồi: không để dành phần lẻ
    }
  }
}

/** Người chơi `sid` được ghi công hạ một con quái (gọi từ `killMonster` cho mỗi người còn sống được chia công): `hap_linh_chau`, `phong_hanh_boi`. */
export function onTreasureKill(w: World, sid: string, p: Player) {
  const t = treasureOfPlayer(p);
  if (!t) return;
  if (t.id === "hap_linh_chau") {
    if (p.mp < p.maxMp)
      p.mp = Math.min(p.maxMp, p.mp + Math.max(1, Math.round(t.params.mpRatio * p.maxMp)));
  } else if (t.id === "phong_hanh_boi") {
    applyPlayerStatus(
      w,
      sid,
      { status: "haste", ms: t.params.ms, ratio: t.params.speedRatio, chance: 1 },
      0,
      sid,
    );
  }
}

/** Hệ số sát thương của chiêu hệ `element` do pháp bảo của người chơi (1 = không đổi): `xich_diem_an` (Hỏa), `han_bang_an` (Băng). */
export function treasureElementMult(p: Player, element: Element | undefined): number {
  if (!p.treasure || element === undefined) return 1;
  const t = treasureOfPlayer(p);
  if (!t || t.element === undefined || t.element !== element) return 1;
  return 1 + (t.params.dmgRatio ?? 0);
}
