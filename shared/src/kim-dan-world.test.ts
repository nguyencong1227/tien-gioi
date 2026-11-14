// Thế giới Kim Đan (M6, #404): ba bản đồ nối nhau, quái chỉ sinh ở Âm Sương Trạch, nhiệm vụ làm được từ đầu tới cuối.
import { describe, expect, it } from "vitest";
import {
  AM_SUONG_ID,
  BLOCKING,
  DEFAULT_MAP_ID,
  DROP_TABLES,
  HAC_PHONG_ID,
  MAPS,
  MONSTER_BY_ID,
  NPC_BY_ID,
  PLAYER_RADIUS,
  PROTOCOL_VERSION,
  MIN_PROTOCOL_VERSION,
  QUESTS,
  QUEST_BY_ID,
  RECIPES,
  SHOP_BY_NPC,
  TILE,
  getMap,
  npcsOfMap,
  expToNext,
  stepOf,
} from "./index";

const KD_MONSTERS = ["suong_ho", "thach_quy", "doc_thiem", "hac_giao"];

describe("Âm Sương Trạch: bản đồ thứ ba", () => {
  const m = getMap(AM_SUONG_ID)!;

  it("nối Hắc Phong Cốc bằng cặp cổng hac_phong_bac <-> am_suong_nam; chuỗi Lạc Hà -> Hắc Phong -> Âm Sương đi được và quay lại được", () => {
    const hp = getMap(HAC_PHONG_ID)!;
    const north = hp.portals.find((p) => p.id === "hac_phong_bac")!;
    const south = m.portals.find((p) => p.id === "am_suong_nam")!;
    expect([north.toMap, north.toPortal]).toEqual([AM_SUONG_ID, "am_suong_nam"]);
    expect([south.toMap, south.toPortal]).toEqual([HAC_PHONG_ID, "hac_phong_bac"]);
    // tên cổng khác nhau để dấu cổng / bản đồ nhỏ không nhập nhằng
    const names = MAPS.flatMap((x) => (x.portals ?? []).map((p) => p.name));
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(
      expect.arrayContaining(["Bắc Môn Quan", "Nam Môn Quan", "Vọng Trạch Quan", "Hồi Phong Quan"]),
    );
    // đi từ Lạc Hà qua hai cổng tới Âm Sương rồi về
    let cur = DEFAULT_MAP_ID;
    for (const hop of ["lac_ha_bac", "hac_phong_bac"]) {
      const p = getMap(cur)!.portals.find((x) => x.id === hop)!;
      cur = p.toMap;
    }
    expect(cur).toBe(AM_SUONG_ID);
    const back = [south.id, "hac_phong_nam"].reduce(
      (c, id) => getMap(c)!.portals.find((x) => x.id === id)!.toMap,
      AM_SUONG_ID,
    );
    expect(back).toBe(DEFAULT_MAP_ID);
  });

  it("tên bản đồ / trạm, trạm an toàn ở phía nam, không có loại ô mới (chỉ ô đã có)", () => {
    expect(m.def.name).toBe("Âm Sương Trạch");
    expect(m.townName).toBe("Vọng Sương Trạm");
    expect(m.townPx.y).toBeGreaterThan(m.worldH / 2);
    for (const t of m.tiles) expect(t).toBeLessThanOrEqual(7);
  });

  it("quái Kim Đan CHỈ sinh ở Âm Sương Trạch; tổng quái <= 70 (tick < 10 ms); không Linh Thố", () => {
    for (const id of KD_MONSTERS) {
      expect(m.monsterCapOf(id), id).toBeGreaterThan(0);
      for (const other of MAPS)
        if (other.id !== AM_SUONG_ID)
          expect(getMap(other.id)!.monsterCapOf(id), `${id} @ ${other.id}`).toBe(0);
    }
    expect(m.monsterCapOf("tho")).toBe(0);
    expect(Object.values(m.monsterCap).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(70);
    expect(m.monsterCapOf("hac_giao")).toBe(2);
  });

  it("đủ chỗ sinh cho từng loài: ô đi lại được, nối với trạm, ngoài khu an toàn, nguy hiểm >= minDanger, >= 100 ô mỗi quái", () => {
    const seen = new Set<number>([m.def.town.cy * m.def.w + m.def.town.cx]);
    const stack = [[m.def.town.cx, m.def.town.cy]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= m.def.w || ny >= m.def.h) continue;
        const i = ny * m.def.w + nx;
        if (BLOCKING.has(m.tileAt(nx, ny)) || seen.has(i)) continue;
        seen.add(i);
        stack.push([nx, ny]);
      }
    }
    for (const id of KD_MONSTERS) {
      let n = 0;
      for (const i of seen) {
        const x = (i % m.def.w) * TILE + TILE / 2;
        const y = Math.floor(i / m.def.w) * TILE + TILE / 2;
        if (m.dangerAt(x, y) >= MONSTER_BY_ID[id].minDanger && !m.inSafe(x, y)) n++;
      }
      expect(n, id).toBeGreaterThanOrEqual(100 * m.monsterCapOf(id));
    }
  });

  it("ba NPC Vọng Sương đứng trong trạm, trên ô đi lại được; có thợ rèn và lái buôn dùng được", () => {
    expect(npcsOfMap(AM_SUONG_ID).map((n) => n.id)).toEqual([
      "tram_truong",
      "lai_buon_suong",
      "tho_ren_suong",
    ]);
    for (const n of npcsOfMap(AM_SUONG_ID)) {
      expect(m.inTown(n.x, n.y), n.id).toBe(true);
      expect(m.circleBlocked(n.x, n.y, PLAYER_RADIUS), n.id).toBe(false);
    }
    expect(SHOP_BY_NPC.lai_buon_suong.itemIds).toEqual(
      expect.arrayContaining(["dai_hoi_huyet_dan", "dai_hoi_linh_dan"]),
    );
    expect(SHOP_BY_NPC.lai_buon_suong.itemIds).not.toContain("tu_khi_dan");
    const forge = RECIPES.filter((r) => r.npcId === "tho_ren_suong");
    expect(forge).toHaveLength(9);
    expect(RECIPES.filter((r) => r.npcId === "tho_ren").every((r) => r.coin === undefined)).toBe(
      true,
    ); // Lạc Hà: công thức cũ, miễn phí
  });
});

describe("giao thức", () => {
  it("PROTOCOL_VERSION = 3 (M7.1: chiêu thức / hành vi quái / kinh quyển); MIN_PROTOCOL_VERSION KHÔNG đổi (người vận hành quyết lúc phát hành)", () => {
    expect(PROTOCOL_VERSION).toBe(3);
    expect(MIN_PROTOCOL_VERSION).toBe(0);
  });
});

describe("nhiệm vụ Trúc Cơ / Kim Đan làm được từ đầu tới cuối", () => {
  /** Quái nào sinh ra ở ÍT NHẤT một bản đồ. */
  const spawns = (id: string) => MAPS.some((x) => getMap(x.id)!.monsterCapOf(id) > 0);
  /** Vật phẩm nào rơi từ ÍT NHẤT một quái sinh ra được (hoặc là phần thưởng của nhiệm vụ). */
  const obtainable = (itemId: string) =>
    Object.entries(DROP_TABLES).some(
      ([mon, drops]) => spawns(mon) && drops.some((d) => d.itemId === itemId),
    );

  it("mọi bước kill / collect / talk trong MỌI nhiệm vụ trỏ tới thứ có thật và kiếm được (quái sinh ra, đồ rơi được, NPC đứng trên bản đồ)", () => {
    for (const q of QUESTS)
      for (const s of q.steps) {
        if (s.kind === "kill") expect(spawns(s.monster), `${q.id}: ${s.monster}`).toBe(true);
        if (s.kind === "collect") expect(obtainable(s.itemId), `${q.id}: ${s.itemId}`).toBe(true);
        if (s.kind === "talk") expect(NPC_BY_ID[s.npcId], `${q.id}: ${s.npcId}`).toBeDefined();
      }
  });

  it("chuỗi Trúc Cơ do Trưởng trấn giao; chuỗi Kim Đan do Trạm trưởng Vọng Sương giao; vong_suong nối sau thanh_lo_tram", () => {
    for (const id of ["truc_co_nhap_mon", "mang_hoan", "thanh_lo_tram"])
      expect(QUEST_BY_ID[id].giver, id).toBe("truong_tran");
    for (const id of [
      "vong_suong",
      "suong_ho_hoan",
      "thach_quy_giap",
      "doc_thiem_nang",
      "kim_dan_hau_ky",
      "giao_hoan",
    ])
      expect(QUEST_BY_ID[id].giver, id).toBe("tram_truong");
    expect(QUEST_BY_ID.thanh_lo_tram.next).toBe("vong_suong");
    expect(QUEST_BY_ID.thanh_lo_tram.steps).toEqual([{ kind: "talk", npcId: "lai_buon" }]);
  });

  it("điều kiện nhận khớp độ khó: quái nào cũng nhận được từ bậc người chơi ĐÃ săn được loài đó (không bắt kill thứ chưa an toàn)", () => {
    const minStep = (id: string) =>
      QUEST_BY_ID[id].minRealm
        ? stepOf(QUEST_BY_ID[id].minRealm!.realm, QUEST_BY_ID[id].minRealm!.tier)
        : 0;
    expect(minStep("suong_ho_hoan")).toBeGreaterThanOrEqual(stepOf(3, 0)); // Sương Hồ: an toàn từ Sơ kỳ
    expect(minStep("thach_quy_giap")).toBeGreaterThanOrEqual(stepOf(3, 0));
    expect(minStep("doc_thiem_nang")).toBeGreaterThanOrEqual(stepOf(3, 0));
    // Độc Thiềm chỉ an toàn từ Trung kỳ: nhiệm vụ đòi đạt Trung kỳ TRƯỚC khi hạ
    expect(QUEST_BY_ID.doc_thiem_nang.steps[0]).toEqual({ kind: "reachRealm", realm: 3, tier: 1 });
    expect(minStep("giao_hoan")).toBeGreaterThanOrEqual(stepOf(3, 1)); // Hắc Giao: đội 3 từ Trung kỳ
  });

  it("thưởng tu vi chuỗi chính mỗi cảnh giới Trúc Cơ / Kim Đan <= 5% tổng thanh (không biến nhiệm vụ thành đường tắt)", () => {
    const sums = new Map<number, number>();
    for (const q of QUESTS) {
      if (q.daily || !q.rewards.exp) continue;
      const reach = [...q.steps].reverse().find((s) => s.kind === "reachRealm");
      const realm = reach?.kind === "reachRealm" ? reach.realm : (q.minRealm?.realm ?? 1);
      sums.set(realm, (sums.get(realm) ?? 0) + q.rewards.exp);
    }
    for (const realm of [2, 3]) {
      const bars = [0, 1, 2].reduce((a, t) => a + expToNext(realm, t), 0);
      expect(sums.get(realm)!, `cảnh giới ${realm}`).toBeGreaterThan(0);
      expect(sums.get(realm)! / bars, `cảnh giới ${realm}`).toBeLessThanOrEqual(0.05);
    }
  });
});
