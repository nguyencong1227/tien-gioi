// Bộ đếm xã hội của nghề và tông môn (M9.5 / M9.9, `docs/PHAN_CONG_M9.md` mục 5): `craft:<trạm>` cộng MỘT lần mỗi lần chế thành công (rèn / luyện đan / bàn phù), `sect_level`
// ghi cấp tông CAO NHẤT từng ở (chế độ max) mỗi khi áp buff tông (vào phòng, lên cấp). Hai khoá này có trong từ vựng (`social-soul.ts`) từ M9.1 nhưng chưa có nơi nào cộng, nên
// thành tựu nhóm "Nghề" / "Tông môn" không thể đạt: các ca dưới giữ cho đường cộng không bị gỡ.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  NPC_BY_ID,
  RECIPES,
  craftStationOf,
  newSocial,
  socialCounterOf,
  type SoulSocial,
} from "@tien-gioi/shared";
import { Hub } from "../hub";
import { FileSectStore } from "../sect-store";
import { SectService } from "../sect-service";
import { makeSect } from "../store-contract";
import { giveItem } from "./inventory";
import { craft } from "./npc";
import { sectOnJoin } from "./sect";
import { addPlayer, makeWorld } from "./test-helpers";

/** Gắn hook `onSocial` giả: ghi lại mọi lần ghi và áp lên một sổ xã hội trong bộ nhớ (như `WorldRoom.socialUpdate`). */
function captureSocial(w: ReturnType<typeof makeWorld>["w"]) {
  const book = new Map<string, SoulSocial>();
  const calls: string[] = [];
  w.onSocial = (key, fn) => {
    calls.push(key);
    book.set(key, fn(book.get(key)) ?? newSocial());
  };
  return { book, calls };
}

describe("craft:<trạm>: cộng mỗi lần chế THÀNH CÔNG, theo trạm của NPC công thức", () => {
  for (const station of ["forge", "alchemy", "talisman"] as const) {
    const rc = RECIPES.find((r) => craftStationOf(NPC_BY_ID[r.npcId]) === station);
    it(`trạm ${station}: chế được thì craft:${station} = 1, chế thêm lần nữa = 2`, () => {
      expect(rc, `có công thức của trạm ${station}`).toBeDefined();
      const t = makeWorld();
      const { p, c } = addPlayer(t.w, "a", 4, 0);
      const npc = NPC_BY_ID[rc!.npcId];
      p.x = npc.x + 10;
      p.y = npc.y;
      c.coin = 100_000;
      const cap = captureSocial(t.w);
      for (const need of rc!.inputs) giveItem(t.w, "a", need.itemId, need.qty * 2);
      craft(t.w, "a", rc!.id);
      expect(socialCounterOf(cap.book.get(c.identity.soulKey), `craft:${station}`)).toBe(1);
      craft(t.w, "a", rc!.id);
      expect(socialCounterOf(cap.book.get(c.identity.soulKey), `craft:${station}`)).toBe(2);
    });
  }

  it("chế THẤT BẠI (thiếu nguyên liệu) không cộng gì", () => {
    const rc = RECIPES[0];
    const t = makeWorld();
    const { p, c } = addPlayer(t.w, "a", 4, 0);
    const npc = NPC_BY_ID[rc.npcId];
    p.x = npc.x + 10;
    p.y = npc.y;
    c.coin = 100_000;
    const cap = captureSocial(t.w);
    craft(t.w, "a", rc.id); // túi trống
    expect(cap.calls).toEqual([]);
  });
});

describe("sect_level: cấp tông cao nhất từng ở, ghi lúc vào phòng", () => {
  const root = mkdtempSync(path.join(tmpdir(), "tien-gioi-social-feeds-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  let n = 0;
  let now = 1_700_000_000_000;
  const A = "Alpha";
  const keyOf = (s: string) => s.toLowerCase();
  beforeEach(() => {
    now = 1_700_000_000_000;
  });

  async function joinWith(points: number | null) {
    const t = makeWorld(undefined, new Hub());
    const store = new FileSectStore(path.join(root, `s${++n}`), () => now);
    const svc = new SectService(store, () => now);
    t.w.now = now;
    t.w.sectService = svc;
    t.w.onSaveNow = async () => true;
    addPlayer(t.w, A, 1, 8);
    if (points !== null)
      await store.create(
        makeSect("t1", {
          name: "Thanh Van",
          tag: "TV",
          leader: keyOf(A),
          points,
          members: [
            { soulKey: keyOf(A), name: A, rank: "chu" as const, joinedAt: now - 86_400_000 },
          ],
        }),
      );
    const cap = captureSocial(t.w);
    await sectOnJoin(t.w, A);
    return { ...cap, key: t.w.ctrl.get(A)!.identity.soulKey };
  }

  it("điểm tông ứng với cấp 1 / 2 / 5: sect_level = cấp (kể cả cấp 1, để thành tựu 'vào tông' có)", async () => {
    for (const [points, level] of [
      [0, 1],
      [1000, 2],
      [30_000, 5],
    ] as const) {
      const r = await joinWith(points);
      expect(socialCounterOf(r.book.get(r.key), "sect_level"), `điểm ${points}`).toBe(level);
    }
  });

  it("không thuộc tông môn nào: không ghi gì", async () => {
    const r = await joinWith(null);
    expect(r.calls).toEqual([]);
  });
});
