// Quái Nguyên Anh ở Hàn Vân Lĩnh (M7.5b, #506): chỉ sinh ở bản đồ thứ tư, số liệu suy từ loài Kim Đan cùng vai, hành vi và đạn hợp lệ.
import { describe, expect, it } from "vitest";
import {
  BLOCKING,
  DROP_TABLES,
  COIN_DROPS,
  HAN_VAN_ID,
  ITEM_BY_ID,
  ITEM_VALUE,
  MAPS,
  MONSTERS,
  MONSTER_BY_ID,
  MONSTER_CAP,
  NGUYEN_ANH_RECIPES,
  NPC_BY_ID,
  PLAYER_RADIUS,
  QUESTS,
  QUEST_BY_ID,
  RECIPES,
  SHOP_BY_NPC,
  buyPrice,
  expToNext,
  getMap,
  npcsOfMap,
  phaseOf,
  sellPrice,
  stepOf,
  statsFor,
} from "./index";

const NA = ["han_lang", "phong_nha", "cot_tuong", "doc_tuoc", "thien_han_vuong"];
/** Loài Kim Đan cùng vai mà số liệu được suy ra (docs/PHAN_CONG_M7.md mục 8) */
const ANALOG: Record<string, string> = {
  han_lang: "suong_ho",
  phong_nha: "suong_ho",
  cot_tuong: "thach_quy",
  doc_tuoc: "doc_thiem",
  thien_han_vuong: "hac_giao",
};

describe("Hàn Vân Lĩnh: quái Nguyên Anh (M7.5b)", () => {
  const hv = getMap(HAN_VAN_ID)!;

  it("năm loài có thật, quái Nguyên Anh CHỈ sinh ở Hàn Vân; tổng quái <= 70; trùm đúng 2 con", () => {
    for (const id of NA) {
      expect(MONSTER_BY_ID[id], id).toBeDefined();
      expect(hv.monsterCapOf(id), id).toBeGreaterThan(0);
      expect(MONSTER_CAP[id], `${id} ở bản đồ mặc định`).toBe(0);
      for (const other of MAPS)
        if (other.id !== HAN_VAN_ID)
          expect(getMap(other.id)!.monsterCapOf(id), `${id} @ ${other.id}`).toBe(0);
    }
    // Hàn Vân KHÔNG sinh loài của bản đồ khác
    for (const m of MONSTERS) if (!NA.includes(m.id)) expect(hv.monsterCapOf(m.id), m.id).toBe(0);
    expect(Object.values(hv.monsterCap).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(70);
    expect(hv.monsterCapOf("thien_han_vuong")).toBe(2);
  });

  it("cấp 16-18 cho bốn loài thường (bậc Nguyên Anh) và 21 cho trùm; đúng một trùm; vùng sinh tăng dần theo cấp", () => {
    const lv = (id: string) => MONSTER_BY_ID[id].level;
    for (const id of ["han_lang", "phong_nha", "cot_tuong", "doc_tuoc"]) {
      expect(lv(id), id).toBeGreaterThanOrEqual(stepOf(4, 0));
      expect(lv(id), id).toBeLessThanOrEqual(stepOf(4, 2));
      expect(MONSTER_BY_ID[id].boss, id).toBeUndefined();
    }
    expect(lv("thien_han_vuong")).toBe(21);
    expect(MONSTER_BY_ID.thien_han_vuong.boss).toBe(true);
    expect(NA.filter((id) => MONSTER_BY_ID[id].boss)).toEqual(["thien_han_vuong"]);
    const zones = ["han_lang", "phong_nha", "cot_tuong", "doc_tuoc", "thien_han_vuong"].map(
      (id) => MONSTER_BY_ID[id].minDanger,
    );
    expect([...zones].sort((a, b) => a - b)).toEqual(zones);
    expect(new Set(zones).size).toBe(5);
  });

  it("số liệu suy từ loài Kim Đan cùng vai theo tỉ lệ chỉ số người chơi giữa hai bậc: máu / công trong ±12 % của tỉ lệ, tu vi ~6x (`REALM_EXP_BASE`)", () => {
    const base = (level: number) => {
      for (let r = 0; r <= 4; r++)
        for (let t = 0; t < 3; t++) if (stepOf(r, t) === level) return statsFor(r, t);
      const top = statsFor(4, 2); // ngoại suy trên đỉnh Nguyên Anh (trùm cấp 21)
      const d = level - stepOf(4, 2);
      return { maxHp: top.maxHp * Math.pow(1.18, d), atk: top.atk * Math.pow(1.17, d) };
    };
    for (const id of NA) {
      const m = MONSTER_BY_ID[id];
      const a = MONSTER_BY_ID[ANALOG[id]];
      const hpRatio = base(m.level).maxHp / base(a.level).maxHp;
      const atkRatio = base(m.level).atk / base(a.level).atk;
      // Phong Nha là loài bắn, mỏng hơn Sương Hồ (cùng vai ranged) một chút nên được giảm máu 20 %
      const hpWant = a.hp * hpRatio * (id === "phong_nha" ? 0.8 : 1);
      expect(m.hp / hpWant, `${id} máu`).toBeGreaterThan(0.88);
      expect(m.hp / hpWant, `${id} máu`).toBeLessThan(1.12);
      expect(m.atk / (a.atk * atkRatio), `${id} công`).toBeGreaterThan(0.88);
      expect(m.atk / (a.atk * atkRatio), `${id} công`).toBeLessThan(1.12);
      const expRatio = m.exp / a.exp;
      const bandRatio = expToNext(4, 0) / expToNext(3, 0); // 6
      expect(expRatio, `${id} tu vi`).toBeGreaterThanOrEqual(bandRatio * 0.95);
      expect(expRatio, `${id} tu vi`).toBeLessThanOrEqual(bandRatio * 1.3);
    }
  });

  it("hành vi theo vai: Hàn Lang và trùm lao (gồng 600-1200 ms), Phong Nha bắn đạn, Độc Tước nhổ đạn độc, Cốt Tượng cận chiến chậm nhất", () => {
    for (const id of ["han_lang", "thien_han_vuong"]) {
      expect(MONSTER_BY_ID[id].behavior, id).toBe("charger");
      expect(MONSTER_BY_ID[id].windupMs, id).toBeGreaterThanOrEqual(600);
      expect(MONSTER_BY_ID[id].windupMs, id).toBeLessThanOrEqual(1200);
    }
    expect(MONSTER_BY_ID.phong_nha.behavior).toBe("ranged");
    expect(MONSTER_BY_ID.doc_tuoc.behavior).toBe("poisoner");
    expect(MONSTER_BY_ID.doc_tuoc.boltRange).toBeDefined();
    expect(MONSTER_BY_ID.cot_tuong.behavior ?? "melee").toBe("melee");
    const slowest = NA.filter((id) => !MONSTER_BY_ID[id].boss).sort(
      (a, b) => MONSTER_BY_ID[a].speed - MONSTER_BY_ID[b].speed,
    )[0];
    expect(slowest).toBe("cot_tuong");
  });

  it("đạn của quái Nguyên Anh né được và không xuyên tường: tốc độ <= 640 px/s, bay >= 0,8 s hết tầm, tầm > 3 lần tầm đánh gần, <= 400 px; đạn độc luôn tím (`boltElement` am)", () => {
    for (const id of ["phong_nha", "doc_tuoc"]) {
      const m = MONSTER_BY_ID[id];
      expect(m.boltSpeed, id).toBeGreaterThan(0);
      expect(m.boltSpeed!, id).toBeLessThanOrEqual(640);
      expect(m.boltRange! / m.boltSpeed!, id).toBeGreaterThanOrEqual(0.8);
      expect(m.boltRange!, id).toBeGreaterThan(m.attackRange * 3);
      expect(m.boltRange!, id).toBeLessThanOrEqual(400);
    }
    // Màu đạn: Phong Nha theo `element` kim (vàng); đạn ĐỘC luôn tím (`am`) ở cả Độc Thiềm và Độc Tước dù `element` của Độc Tước là mộc ("tím = độc")
    expect(MONSTER_BY_ID.phong_nha.boltElement).toBeUndefined();
    expect(MONSTER_BY_ID.doc_tuoc.boltElement).toBe("am");
    expect(MONSTER_BY_ID.doc_thiem.boltElement).toBe("am");
    expect(MONSTER_BY_ID.doc_tuoc.element).toBe("moc"); // khắc / bị khắc vẫn theo mộc, không đổi vì màu đạn
  });

  it("mỗi loài có hệ thật (không `none`), năm loài đủ ba hệ khác nhau trở lên; bảng rơi và tiền đủ", () => {
    const els = new Set<string>();
    for (const id of NA) {
      const e = MONSTER_BY_ID[id].element;
      expect(e, id).toBeDefined();
      expect(phaseOf(e), id).not.toBe("none");
      els.add(e!);
      expect(DROP_TABLES[id]?.length, `${id} bảng rơi`).toBeGreaterThan(0);
      for (const d of DROP_TABLES[id])
        expect(ITEM_BY_ID[d.itemId], `${id}: ${d.itemId}`).toBeDefined();
      expect(COIN_DROPS[id], `${id} tiền`).toBeDefined();
    }
    expect(els.size).toBeGreaterThanOrEqual(3);
  });
});

const NA_MATERIALS = [
  "han_lang_mao",
  "phong_nha_vu",
  "tuong_cot",
  "doc_tuoc_nang",
  "thien_han_chau",
];
const NA_GEAR = ["han_vu_kiem", "han_lang_bao", "phong_nha_phu", "tuyet_hanh_ngoa", "han_tinh_boi"];
const NA_PILLS = ["thuong_hoi_huyet_dan", "thuong_hoi_linh_dan"];

describe("Nguyên Anh: vật phẩm, rèn, cửa hàng (M7.5c)", () => {
  it("mười hai vật phẩm có thật, đúng loại; nguyên liệu mỗi loài một thứ và rơi đúng loài (trùm rơi Thiên Hàn châu)", () => {
    for (const id of [...NA_MATERIALS, ...NA_GEAR, ...NA_PILLS])
      expect(ITEM_BY_ID[id], id).toBeDefined();
    for (const id of NA_MATERIALS) expect(ITEM_BY_ID[id].type, id).toBe("material");
    for (const id of NA_GEAR) expect(ITEM_BY_ID[id].type, id).toBe("equip");
    for (const id of NA_PILLS) expect(ITEM_BY_ID[id].type, id).toBe("consumable");
    const OWN: Record<string, string> = {
      han_lang: "han_lang_mao",
      phong_nha: "phong_nha_vu",
      cot_tuong: "tuong_cot",
      doc_tuoc: "doc_tuoc_nang",
      thien_han_vuong: "thien_han_chau",
    };
    for (const [monster, mat] of Object.entries(OWN)) {
      expect(
        DROP_TABLES[monster].some((d) => d.itemId === mat),
        `${monster} rơi ${mat}`,
      ).toBe(true);
      // nguyên liệu của loài này không rơi từ loài khác (trừ Độc Tước nang rơi thêm từ trùm, như Độc nang ở Hắc Giao)
      for (const [other, ot] of Object.entries(DROP_TABLES))
        if (other !== monster && NA.includes(other) && mat !== "doc_tuoc_nang")
          expect(
            ot.some((d) => d.itemId === mat),
            `${other} KHÔNG rơi ${mat}`,
          ).toBe(false);
    }
    expect(DROP_TABLES.thien_han_vuong.find((d) => d.itemId === "thien_han_chau")!.chance).toBe(1);
  });

  it("bộ IV: mặc được từ Nguyên Anh sơ kỳ, độ hiếm 4, chỉ số vừa ~29 % chỉ số gốc ở bậc đầu (không vượt 40 %) và cao hơn mọi món Kim Đan cùng ô", () => {
    const base = statsFor(4, 0);
    for (const id of NA_GEAR) {
      const it = ITEM_BY_ID[id];
      expect(it.equip!.reqRealm, id).toBe(4);
      expect(it.equip!.reqTier, id).toBe(0);
      expect(it.rarity, id).toBe(4);
    }
    expect(ITEM_BY_ID.han_vu_kiem.equip!.stats.atk! / base.atk).toBeGreaterThan(0.25);
    expect(ITEM_BY_ID.han_vu_kiem.equip!.stats.atk! / base.atk).toBeLessThan(0.4);
    expect(ITEM_BY_ID.han_lang_bao.equip!.stats.hp! / base.maxHp).toBeGreaterThan(0.25);
    expect(ITEM_BY_ID.han_lang_bao.equip!.stats.hp! / base.maxHp).toBeLessThan(0.4);
    // cao hơn đồ Kim Đan hậu kỳ cùng ô (bộ III / hài / ngọc bội giao)
    expect(ITEM_BY_ID.han_vu_kiem.equip!.stats.atk!).toBeGreaterThan(
      ITEM_BY_ID.hac_giao_kiem.equip!.stats.atk!,
    );
    expect(ITEM_BY_ID.han_lang_bao.equip!.stats.hp!).toBeGreaterThan(
      ITEM_BY_ID.giao_lan_bao.equip!.stats.hp!,
    );
    expect(ITEM_BY_ID.phong_nha_phu.equip!.stats.speed!).toBeGreaterThan(
      ITEM_BY_ID.giao_long_phu.equip!.stats.speed!,
    );
    expect(ITEM_BY_ID.tuyet_hanh_ngoa.equip!.stats.speed!).toBeGreaterThan(
      ITEM_BY_ID.giao_anh_ngoa.equip!.stats.speed!,
    );
    expect(ITEM_BY_ID.han_tinh_boi.equip!.stats.hp!).toBeGreaterThan(
      ITEM_BY_ID.giao_chau_boi.equip!.stats.hp!,
    );
  });

  it("rèn: đúng năm công thức ở thợ rèn Hàn Vân, mỗi món bộ IV một công thức, CÓ phí, cao hơn giá bán thành phẩm, nguyên liệu kiếm được ở Hàn Vân", () => {
    expect(NGUYEN_ANH_RECIPES).toHaveLength(5);
    expect(RECIPES.filter((r) => r.npcId === "tho_ren_han")).toEqual(NGUYEN_ANH_RECIPES);
    expect(NGUYEN_ANH_RECIPES.map((r) => r.output.itemId).sort()).toEqual([...NA_GEAR].sort());
    const dropped = new Set(NA.flatMap((m) => DROP_TABLES[m].map((d) => d.itemId)));
    for (const r of NGUYEN_ANH_RECIPES) {
      expect(r.coin ?? 0, r.id).toBeGreaterThan(0);
      let mats = 0;
      for (const i of r.inputs) {
        expect(
          NA_MATERIALS.includes(i.itemId),
          `${r.id}: ${i.itemId} là nguyên liệu Nguyên Anh`,
        ).toBe(true);
        expect(dropped.has(i.itemId), `${r.id}: ${i.itemId} rơi được ở Hàn Vân`).toBe(true);
        expect(i.qty, r.id).toBeLessThanOrEqual(ITEM_BY_ID[i.itemId].stack);
        mats += (ITEM_VALUE[i.itemId] ?? 0) * i.qty;
      }
      expect(sellPrice(r.output.itemId), r.id).toBeLessThan(mats + r.coin!);
    }
    // chỉ vũ khí cần Thiên Hàn châu (trùm đội 3-4 người)
    expect(
      NGUYEN_ANH_RECIPES.filter((r) => r.inputs.some((i) => i.itemId === "thien_han_chau")).map(
        (r) => r.output.itemId,
      ),
    ).toEqual(["han_vu_kiem"]);
  });

  it("cửa hàng lái buôn Hàn Vân: đan cấp 1-3 (6 hàng), KHÔNG bán Tụ Khí Đan hay trang bị; mua rồi bán lại luôn lỗ; đan cấp 3 hồi nhiều hơn cấp 2", () => {
    const shop = SHOP_BY_NPC.lai_buon_han;
    expect(shop.itemIds).toHaveLength(6);
    for (const id of shop.itemIds) {
      expect(ITEM_BY_ID[id].type, id).toBe("consumable");
      expect(buyPrice(id), id).toBeGreaterThan(sellPrice(id));
    }
    expect(shop.itemIds).not.toContain("tu_khi_dan");
    const pct = (id: string) => (ITEM_BY_ID[id].effect as { pct: number }).pct;
    expect(pct("thuong_hoi_huyet_dan")).toBeGreaterThan(pct("dai_hoi_huyet_dan"));
    expect(pct("thuong_hoi_linh_dan")).toBeGreaterThan(pct("dai_hoi_linh_dan"));
    for (const id of NA_PILLS) expect(shop.itemIds, id).toContain(id);
  });

  it("ba cấp đan hồi huyết / hồi linh: độ hiếm, mức hồi, giá trị gốc và thời gian chờ đều TĂNG theo cấp (cấp 3 là tiên phẩm ◆◆◆, phân biệt được với cấp 2 trong túi; nit B)", () => {
    for (const ladder of [
      ["hoi_huyet_dan", "dai_hoi_huyet_dan", "thuong_hoi_huyet_dan"],
      ["hoi_linh_dan", "dai_hoi_linh_dan", "thuong_hoi_linh_dan"],
    ]) {
      const it = ladder.map((id) => ITEM_BY_ID[id]);
      for (let i = 1; i < it.length; i++) {
        expect(it[i].rarity, `${ladder[i]}: độ hiếm`).toBeGreaterThan(it[i - 1].rarity);
        expect((it[i].effect as { pct: number }).pct, `${ladder[i]}: mức hồi`).toBeGreaterThan(
          (it[i - 1].effect as { pct: number }).pct,
        );
        expect(ITEM_VALUE[ladder[i]], `${ladder[i]}: giá trị`).toBeGreaterThan(
          ITEM_VALUE[ladder[i - 1]],
        );
        expect(it[i].cooldown!, `${ladder[i]}: chờ`).toBeGreaterThanOrEqual(it[i - 1].cooldown!);
      }
      expect(it[2].rarity).toBe(3);
    }
  });

  it("ba NPC Hàn Vân đứng trong trạm, trên ô đi lại được, cách nhau > 64 px, có lời thoại; thợ rèn và lái buôn dùng được", () => {
    const hv = getMap(HAN_VAN_ID)!;
    const npcs = npcsOfMap(HAN_VAN_ID);
    expect(npcs.map((n) => n.id)).toEqual(["tram_truong_han", "lai_buon_han", "tho_ren_han"]);
    for (const n of npcs) {
      expect(hv.inTown(n.x, n.y), n.id).toBe(true);
      expect(hv.circleBlocked(n.x, n.y, PLAYER_RADIUS), n.id).toBe(false);
      expect(BLOCKING.has(hv.tileAt(Math.floor(n.x / 32), Math.floor(n.y / 32))), n.id).toBe(false);
      expect(n.dialog.length, n.id).toBeGreaterThanOrEqual(2);
    }
    for (let i = 0; i < npcs.length; i++)
      for (let j = i + 1; j < npcs.length; j++)
        expect(Math.hypot(npcs[i].x - npcs[j].x, npcs[i].y - npcs[j].y)).toBeGreaterThan(64);
    expect(SHOP_BY_NPC.lai_buon_han).toBeDefined();
    expect(NPC_BY_ID.tho_ren_han && RECIPES.some((r) => r.npcId === "tho_ren_han")).toBe(true);
  });
});

describe("Nguyên Anh: chuỗi nhiệm vụ (M7.5c bước 2)", () => {
  const CHAIN = [
    "lang_han_quan",
    "han_van_len",
    "han_lang_hoan",
    "phong_nha_cham",
    "cot_tuong_cot",
    "doc_tuoc_nang_cb",
    "nguyen_anh_hau_ky",
    "thien_han_hoan",
  ];
  const DAILY = ["han_lang_quay", "cot_tuong_phien", "doc_tuoc_nop"];
  const hv = getMap(HAN_VAN_ID)!;

  it("tám nhiệm vụ chính nối nhau từ `kim_dan_hau_ky` tới trùm; ba nhiệm vụ lặp không nằm trong chuỗi; chuỗi KHÔNG đi qua Hắc Giao (đội) nên làm được một mình", () => {
    const walk: string[] = [];
    for (let id: string | undefined = "kim_dan_hau_ky"; id; id = QUEST_BY_ID[id].next)
      walk.push(id);
    expect(walk).toEqual(["kim_dan_hau_ky", ...CHAIN]);
    expect(walk).not.toContain("giao_hoan");
    for (const id of DAILY) {
      expect(QUEST_BY_ID[id].daily, id).toBe(true);
      expect(QUEST_BY_ID[id].next, id).toBeUndefined();
      expect(QUEST_BY_ID[id].giver, id).toBe("tram_truong_han");
      expect(walk, id).not.toContain(id);
    }
    // 7 nhiệm vụ chính + 3 nhiệm vụ lặp + 1 việc phụ (lap_uy_bang_nguyen, #725)
    expect(QUESTS.filter((q) => q.giver === "tram_truong_han")).toHaveLength(7 + 3 + 1);
  });

  it("mọi bước trỏ tới thứ kiếm được ở Hàn Vân: quái chỉ sinh ở Hàn Vân, vật phẩm rơi từ quái Nguyên Anh, NPC thật; nhiệm vụ nối nói chuyện với trạm trưởng Hàn Vân", () => {
    const dropped = new Set(NA.flatMap((m) => DROP_TABLES[m].map((d) => d.itemId)));
    for (const id of [...CHAIN, ...DAILY])
      for (const st of QUEST_BY_ID[id].steps) {
        if (st.kind === "kill")
          expect(hv.monsterCapOf(st.monster), `${id}: ${st.monster}`).toBeGreaterThan(0);
        if (st.kind === "collect") expect(dropped.has(st.itemId), `${id}: ${st.itemId}`).toBe(true);
        if (st.kind === "talk") expect(NPC_BY_ID[st.npcId], `${id}: ${st.npcId}`).toBeDefined();
      }
    expect(QUEST_BY_ID.lang_han_quan.steps).toEqual([{ kind: "talk", npcId: "tram_truong_han" }]);
  });

  it("độ khó khớp bậc: ba loài đầu nhận từ Sơ kỳ, Độc Tước đòi đạt Trung kỳ TRƯỚC khi hạ, trùm từ Trung kỳ (đội 3-4 người); mốc cảnh giới trong chuỗi chỉ tăng", () => {
    const min = (id: string) =>
      stepOf(QUEST_BY_ID[id].minRealm!.realm, QUEST_BY_ID[id].minRealm!.tier);
    for (const id of ["han_lang_hoan", "phong_nha_cham", "cot_tuong_cot"])
      expect(min(id), id).toBeGreaterThanOrEqual(stepOf(4, 0));
    expect(QUEST_BY_ID.doc_tuoc_nang_cb.steps[0]).toEqual({
      kind: "reachRealm",
      realm: 4,
      tier: 1,
    });
    expect(min("thien_han_hoan")).toBeGreaterThanOrEqual(stepOf(4, 1));
    expect(min("doc_tuoc_nop")).toBeGreaterThanOrEqual(stepOf(4, 1));
    let prev = -1;
    for (const id of CHAIN)
      for (const st of QUEST_BY_ID[id].steps)
        if (st.kind === "reachRealm") {
          expect(stepOf(st.realm, st.tier), id).toBeGreaterThan(prev);
          prev = stepOf(st.realm, st.tier);
        }
    expect(prev).toBe(stepOf(4, 2));
  });

  it("thưởng tu vi chuỗi chính Nguyên Anh 8-10 % tổng thanh ba bậc (sàn 5 % mỗi nhiệm vụ, #1333; không biến nhiệm vụ thành đường tắt); nhiệm vụ lặp ~1,4 % thanh mỗi ngày như Kim Đan", () => {
    const bars = [0, 1, 2].reduce((a, t) => a + expToNext(4, t), 0);
    let sum = 0;
    for (const id of CHAIN.slice(1)) sum += QUEST_BY_ID[id].rewards.exp ?? 0;
    // #1333 bước 2: sàn 5 % thanh bậc nhận cho từng việc chính nâng chuỗi từ 4,9 % lên ~9,5 %; trần chung 10 % (kim-dan-world.test.ts, QUEST_EXP_CAP_MAIN).
    expect(sum / bars).toBeGreaterThan(0.08);
    expect(sum / bars).toBeLessThanOrEqual(0.1);
    const daily = DAILY.reduce((a, id) => a + (QUEST_BY_ID[id].rewards.exp ?? 0), 0);
    expect(daily / bars).toBeLessThan(0.02);
    expect(daily / bars).toBeGreaterThan(0.01);
    // phần thưởng chỉ đồ có thật; đan cấp 3 xuất hiện trong thưởng chuỗi (phần thưởng giới thiệu đồ mới)
    const rewarded = new Set(
      CHAIN.flatMap((id) => (QUEST_BY_ID[id].rewards.items ?? []).map((i) => i.itemId)),
    );
    for (const id of rewarded) expect(ITEM_BY_ID[id], id).toBeDefined();
    expect(NA_PILLS.some((id) => rewarded.has(id))).toBe(true);
  });
});
