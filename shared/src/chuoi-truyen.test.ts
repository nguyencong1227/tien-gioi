// Bộ kiểm HỢP ĐỒNG CHUỖI TRUYỆN (issue #1468 [75-F1], mục 75, `docs/COT_TRUYEN.md`): mạch truyện chính nối liền từ
// `nhap_the` tới nhiệm vụ cuối, mỗi chương (bản đồ) có chuỗi chính + trùm chương đánh được ở đó, các cổng nối chương kề nhau
// đi theo trục bắc / nam hai chiều. Chương 1-4 có dữ liệu thật; chương 5-6 (Lang Hoang, Uy Vân Kinh) mới có bản đồ, khai
// `chuaCoTruyen` trong `CHAPTERS` cho tới khi nội dung vào main rồi BỎ cờ đó (bắt buộc: test đỏ nếu bản đồ ĐÃ có chuỗi mà
// vẫn khai chưa có).
//
// Phần đã được test khác giữ nên KHÔNG lặp ở đây: không chu trình + giver / steps / rewards trỏ tới mục có thật
// (`data-integrity.test.ts` mục 2); cổng đi theo cặp `toMap` / `toPortal` trỏ ngược (`map.test.ts`: "cổng đi theo cặp");
// <= `MAX_BOSSES_PER_MAP` trùm sinh sẵn mỗi bản đồ (`map.test.ts`: "mọi bản đồ thật: tổng trùm sinh sẵn"). Bộ này thêm phần
// còn thiếu: chuỗi nối liền / không mồ côi, bảng chương, hướng bắc-nam của cổng nối chương.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAP_ID,
  MAIN_QUEST_START,
  MAPS,
  MONSTER_BY_ID,
  MONSTER_CAP,
  NPCS,
  QUESTS,
  QUEST_BY_ID,
  type MapDef,
  type QuestDef,
} from "./index";

/** Một chương của `docs/COT_TRUYEN.md`: bản đồ + trùm chương. Thêm dòng khi chương mới có (đặt đúng thứ tự đường đi bắc). */
interface Chapter {
  readonly mapId: string;
  /** Trùm chương (id quái): phải sinh được ở bản đồ này (`monsterCap` > 0). */
  readonly bossId: string;
  /** Bản đồ đã có nhưng chuỗi chính / trùm chương chưa vào main: miễn hai kiểm trên, nhưng khi ĐÃ có thì phải bỏ cờ. */
  readonly chuaCoTruyen?: boolean;
}

const CHAPTERS: readonly Chapter[] = [
  { mapId: "lac_ha", bossId: "ho" }, // chương 1: Nhập thế, Hắc Hổ
  { mapId: "hac_phong", bossId: "mang" }, // chương 2: Mãng hoạn, Xích Mãng
  { mapId: "am_suong", bossId: "hac_giao" }, // chương 3: Đêm triều rút, Hắc Giao
  { mapId: "han_van", bossId: "thien_han_vuong" }, // chương 4: Hàn Vân, Thiên Hàn Vương
  { mapId: "lang_hoang", bossId: "", chuaCoTruyen: true }, // chương 5 (chờ #1466 / #1465)
  { mapId: "uy_van", bossId: "", chuaCoTruyen: true }, // chương 6 (chờ #1466 / #1465)
];

const mapOf = (id: string): MapDef => {
  const m = MAPS.find((x) => x.id === id);
  if (!m) throw new Error(`không có bản đồ ${id}`);
  return m;
};

/** Số tối đa mỗi loài ở bản đồ: `monsterCap` của bản đồ nếu khai, không thì `MONSTER_CAP` (quy ước của `MapDef`). */
const capAt = (m: MapDef, monsterId: string): number =>
  (m.monsterCap ?? MONSTER_CAP)[monsterId] ?? 0;

/** Chuỗi chính: đi từ `nhap_the` theo `next`. Chu trình / `next` trỏ chỗ không có thì dừng và báo lỗi. */
function walkMainChain(
  start: string,
  quests: readonly QuestDef[],
): { chain: string[]; errors: string[] } {
  const byId = new Map(quests.map((q) => [q.id, q]));
  const chain: string[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (let id: string | undefined = start; id;) {
    if (seen.has(id)) {
      errors.push(`vòng lặp tại ${id}`);
      break;
    }
    const q = byId.get(id);
    if (!q) {
      errors.push(`next trỏ tới nhiệm vụ không có: ${id}`);
      break;
    }
    seen.add(id);
    chain.push(id);
    id = q.next;
  }
  // Không mồ côi: nhiệm vụ có `next` hoặc là đích của `next` mà KHÔNG nằm trong chuỗi từ `start` là một chuỗi rời.
  for (const q of quests) {
    if (seen.has(q.id)) continue;
    if (q.next)
      errors.push(`${q.id} có next (${q.next}) nhưng không thuộc chuỗi chính từ ${start}`);
  }
  const targets = new Set(quests.flatMap((q) => (q.next ? [q.next] : [])));
  for (const t of targets)
    if (!seen.has(t))
      errors.push(`${t} là đích của next nhưng không thuộc chuỗi chính từ ${start}`);
  return { chain, errors };
}

/** Bản đồ mà một nhiệm vụ chính "thuộc về": nơi NPC giao đứng, hoặc nơi NPC của bước `talk` đứng. */
function mapsOfQuest(q: QuestDef): Set<string> {
  const out = new Set<string>();
  const npcMap = (npcId: string): string =>
    NPCS.find((n) => n.id === npcId)?.mapId ?? DEFAULT_MAP_ID;
  out.add(npcMap(q.giver));
  for (const s of q.steps) if (s.kind === "talk") out.add(npcMap(s.npcId));
  return out;
}

describe("chuỗi truyện chính (#1468): nối liền, không mồ côi", () => {
  const { chain, errors } = walkMainChain(MAIN_QUEST_START, QUESTS);

  it("từ `nhap_the` theo `next` tới nhiệm vụ cuối: không vòng, không next trỏ chỗ trống, không chuỗi rời", () => {
    expect(errors, errors.join("\n") || "không có").toEqual([]);
    expect(chain[0]).toBe(MAIN_QUEST_START);
    // Nhiệm vụ cuối không còn `next`; mọi nhiệm vụ trước nó đều có.
    expect(QUEST_BY_ID[chain[chain.length - 1]].next).toBeUndefined();
    for (const id of chain.slice(0, -1)) expect(QUEST_BY_ID[id].next, id).toBeTruthy();
    // Chương 1-4 đã có ít nhất 20 nhiệm vụ nối (số đo thật 23); tụt mạnh nghĩa là ai đó cắt chuỗi.
    expect(chain.length).toBeGreaterThanOrEqual(20);
  });

  it("nhiệm vụ trong chuỗi chính KHÔNG phải việc lặp hằng ngày (daily tách khỏi mạch truyện)", () => {
    for (const id of chain) expect(QUEST_BY_ID[id].daily ?? false, id).toBe(false);
  });

  it("walkMainChain bắt: vòng lặp, next trỏ chỗ trống, chuỗi rời mồ côi (đột biến: bỏ một nhánh kiểm -> ca tương ứng đỏ)", () => {
    const q = (id: string, next?: string): QuestDef => ({ ...QUESTS[0], id, next });
    // chuỗi sạch
    expect(walkMainChain("a", [q("a", "b"), q("b")]).errors).toEqual([]);
    // vòng a -> b -> a
    expect(walkMainChain("a", [q("a", "b"), q("b", "a")]).errors.join()).toContain("vòng lặp");
    // next trỏ chỗ trống
    expect(walkMainChain("a", [q("a", "ma")]).errors.join()).toContain("không có");
    // chuỗi rời c -> d không nối từ a
    const roi = walkMainChain("a", [q("a"), q("c", "d"), q("d")]).errors.join();
    expect(roi).toContain("c có next");
    expect(roi).toContain("d là đích của next");
  });
});

describe("bảng chương (#1468): mỗi bản đồ có chuỗi chính + trùm chương, cổng nối chương theo trục bắc-nam", () => {
  const { chain } = walkMainChain(MAIN_QUEST_START, QUESTS);

  it("mọi bản đồ thường có đúng một dòng CHAPTERS, theo thứ tự đường đi (không thiếu, không thừa)", () => {
    expect(CHAPTERS.map((c) => c.mapId)).toEqual(MAPS.map((m) => m.id));
  });

  it("chương đã có truyện: >= 1 nhiệm vụ chính ở bản đồ đó và trùm chương sinh được ở đó", () => {
    for (const c of CHAPTERS) {
      if (c.chuaCoTruyen) continue;
      const map = mapOf(c.mapId);
      const here = chain.filter((id) => mapsOfQuest(QUEST_BY_ID[id]).has(c.mapId));
      expect(
        here.length,
        `${c.mapId}: chưa có nhiệm vụ chính nào ở bản đồ này`,
      ).toBeGreaterThanOrEqual(1);
      expect(
        MONSTER_BY_ID[c.bossId],
        `${c.mapId}: trùm chương ${c.bossId} không có trong MONSTERS`,
      ).toBeTruthy();
      expect(
        capAt(map, c.bossId),
        `${c.mapId}: trùm chương ${c.bossId} không sinh được (cap 0)`,
      ).toBeGreaterThan(0);
    }
  });

  it("chương khai `chuaCoTruyen` mà đã có nhiệm vụ chính ở bản đồ đó thì phải bỏ cờ (bảng không được cũ)", () => {
    for (const c of CHAPTERS) {
      if (!c.chuaCoTruyen) continue;
      const here = chain.filter((id) => mapsOfQuest(QUEST_BY_ID[id]).has(c.mapId));
      expect(
        here,
        `${c.mapId}: đã có chuỗi chính (${here.join(", ")}) nhưng CHAPTERS còn khai chuaCoTruyen`,
      ).toEqual([]);
    }
  });

  it("cổng nối hai chương kề nhau: `<N>_bac` -> `<N+1>_nam` và ngược lại, cổng bắc nằm phía bắc cổng nam", () => {
    for (let i = 0; i + 1 < CHAPTERS.length; i++) {
      const a = mapOf(CHAPTERS[i].mapId);
      const b = mapOf(CHAPTERS[i + 1].mapId);
      const bac = a.portals?.find((p) => p.id === `${a.id}_bac`);
      const nam = b.portals?.find((p) => p.id === `${b.id}_nam`);
      expect(bac, `${a.id}: thiếu cổng ${a.id}_bac`).toBeTruthy();
      expect(nam, `${b.id}: thiếu cổng ${b.id}_nam`).toBeTruthy();
      expect([bac!.toMap, bac!.toPortal], `${a.id}_bac`).toEqual([b.id, nam!.id]);
      expect([nam!.toMap, nam!.toPortal], `${b.id}_nam`).toEqual([a.id, bac!.id]);
    }
    // Bản đồ có cả hai cổng: cổng bắc nằm phía bắc (y nhỏ hơn) cổng nam.
    for (const m of MAPS) {
      const bac = m.portals?.find((p) => p.id === `${m.id}_bac`);
      const nam = m.portals?.find((p) => p.id === `${m.id}_nam`);
      if (bac && nam)
        expect(bac.y, `${m.id}: cổng bắc phải ở phía bắc cổng nam`).toBeLessThan(nam.y);
    }
  });
});
