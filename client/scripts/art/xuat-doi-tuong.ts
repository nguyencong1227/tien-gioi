// In ra JSON tên đối tượng của game cho `dung-bang-duyet.py` (bảng duyệt từng phần, mục 69): NPC (id, tên, chức danh), quái (id, tên, có phải trùm) và chiêu học được (id, tên, hệ, hình, phong cách). Chạy: npx tsx client/scripts/art/xuat-doi-tuong.ts
import { LEARNABLE_SKILLS, MONSTERS, NPCS } from "../../../shared/src/index";

console.log(
  JSON.stringify({
    npcs: NPCS.map((n) => ({ id: n.id, name: n.name, title: n.title })),
    mons: MONSTERS.map((m) => ({ id: m.id, name: m.name, boss: Boolean(m.boss) })),
    skills: LEARNABLE_SKILLS.map((k) => ({
      id: k.id,
      name: k.name,
      element: k.element,
      shape: k.shape,
      style: k.style ?? null,
    })),
  }),
);
