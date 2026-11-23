// In ra JSON tên đối tượng của game cho `dung-bang-duyet.py` (bảng duyệt từng phần, mục 69): NPC (id, tên, chức danh) và quái (id, tên, có phải trùm). Chạy: npx tsx client/scripts/art/xuat-doi-tuong.ts
import { MONSTERS, NPCS } from "../../../shared/src/index";

console.log(
  JSON.stringify({
    npcs: NPCS.map((n) => ({ id: n.id, name: n.name, title: n.title })),
    mons: MONSTERS.map((m) => ({ id: m.id, name: m.name, boss: Boolean(m.boss) })),
  }),
);
