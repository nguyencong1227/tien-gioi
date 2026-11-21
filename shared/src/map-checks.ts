// Kiểm bất biến GIỮA các bản đồ (docs/THIET_KE_BAN_DO_TILED.md mục 5.2): hàm thuần trên `MapDef`, dùng trong test và `npm run check:content`.
// Cổng luôn đi theo cặp: đi qua cổng A (ở bản đồ X) thì tới bản đồ `A.toMap` ở `spawn` của cổng `A.toPortal`; cổng đó phải trỏ NGƯỢC lại A. Id cổng duy nhất trong cả game.
import type { MapDef } from "./map";

/** Lỗi cổng giữa các bản đồ (rỗng = hợp lệ): id cổng trùng, `toMap` không có, `toPortal` không có ở bản đồ đích, cổng đích không trỏ ngược lại. */
export function portalLinkViolations(maps: readonly MapDef[]): string[] {
  const errs: string[] = [];
  const byId = new Map<string, MapDef>();
  for (const m of maps) byId.set(m.id, m);
  const seen = new Map<string, string>();
  for (const m of maps) {
    for (const p of m.portals ?? []) {
      const at = `bản đồ ${m.id}, cổng ${p.id}`;
      const dup = seen.get(p.id);
      if (dup !== undefined) errs.push(`${at}: id cổng trùng với cổng ở bản đồ ${dup}`);
      else seen.set(p.id, m.id);
      const to = byId.get(p.toMap);
      if (!to) {
        errs.push(`${at}: toMap '${p.toMap}' không phải bản đồ nào`);
        continue;
      }
      if (p.toMap === m.id) errs.push(`${at}: cổng trỏ về chính bản đồ này`);
      const back = (to.portals ?? []).find((q) => q.id === p.toPortal);
      if (!back) {
        errs.push(`${at}: toPortal '${p.toPortal}' không có ở bản đồ ${p.toMap}`);
        continue;
      }
      if (back.toMap !== m.id || back.toPortal !== p.id)
        errs.push(
          `${at}: cổng đích ${back.id} trỏ tới ${back.toMap}/${back.toPortal}, không trỏ ngược về ${m.id}/${p.id}`,
        );
    }
  }
  return errs;
}
