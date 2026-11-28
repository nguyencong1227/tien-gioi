// Hai trùm Uy Vân Kinh, lát E của D1 (#1466, mục 75; `docs/QUAI_HOA_THAN_DE_XUAT.md` mục 4): Huyết Hải Lão Ma (trùm nhỏ, hệ âm) và Huyết Ma Hộ Pháp (trùm chương 6, hệ hỏa). Test canh số liệu theo hàng "Trùm" của KHUNG
// (221.030 / 422 / 230.400 / cấp 24), bậc / tiền / rơi, bộ chiêu qua khung chiêu trùm (`bossViolations`; cổng bot né hoàn hảo và độ nặng đòn ở `server/src/balance/trum.test.ts`),
// và đúng hai trùm sinh ở Uy Vân Kinh (<= `MAX_BOSSES_PER_MAP`).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AMBUSH_FOE_LEVEL_CAP,
  BOSS_ADDS_CAP,
  BOSS_BY_KIND,
  BOSS_MIN_TELEGRAPH_MS,
  COIN_DROPS,
  DROP_TABLES,
  ITEM_BY_ID,
  MAPS,
  MAX_BOSSES_PER_MAP,
  MONSTER_BY_ID,
  MONSTER_REALM,
  bossViolations,
  getMap,
} from "./index";

const KHUNG_TRUM = { hp: 221030, atk: 422, exp: 230400, level: 24 };

describe("hai trùm Uy Vân Kinh (D1 #1466 lát E chương 6)", () => {
  it("Huyết Ma Hộ Pháp = hàng Trùm của khung Hóa Thần (máu / công / tu vi / cấp); Huyết Hải Lão Ma là trùm nhỏ ~ 45 % cả máu lẫn tu vi, cấp thấp hơn, hệ âm", () => {
    const t = MONSTER_BY_ID.huyet_ma_ho_phap;
    const l = MONSTER_BY_ID.huyet_hai_lao_ma;
    expect(t.boss).toBe(true);
    expect(l.boss).toBe(true);
    for (const k of ["hp", "atk", "exp", "level"] as const)
      expect(t[k], `huyet_ma_ho_phap.${k}`).toBe(KHUNG_TRUM[k]);
    expect(l.hp / t.hp).toBeGreaterThan(0.4);
    expect(l.hp / t.hp).toBeLessThan(0.5);
    expect(l.exp / t.exp).toBeGreaterThan(0.4);
    expect(l.exp / t.exp).toBeLessThan(0.5);
    expect(l.level).toBeLessThan(t.level);
    expect(l.minDanger).toBeLessThan(t.minDanger);
    expect(t.element).toBe("hoa");
    expect(l.element).toBe("am");
    // trùm chặn đường Hóa Thần không dùng (cấp 24 > trần 21): ngoại lệ như KHUNG mục 5
    expect(t.level).toBeGreaterThan(AMBUSH_FOE_LEVEL_CAP[5]!);
  });

  it("bậc `MONSTER_REALM` 5; tiền rơi chắc chia cho đội, đúng thứ tự theo tu vi và ngang hai trùm Lang Hoang; bảng rơi trỏ vật phẩm thật; Hộ Pháp rơi đan CHẮC, Hải Lão Ma ít hơn", () => {
    for (const id of ["huyet_hai_lao_ma", "huyet_ma_ho_phap"]) {
      expect(MONSTER_REALM[id], id).toBe(5);
      expect(COIN_DROPS[id].chance, id).toBe(1);
      expect(DROP_TABLES[id].length, id).toBeGreaterThan(0);
      for (const d of DROP_TABLES[id])
        expect(ITEM_BY_ID[d.itemId], `${id} -> ${d.itemId}`).toBeDefined();
    }
    const avg = (id: string) => (COIN_DROPS[id].min + COIN_DROPS[id].max) / 2;
    expect(avg("huyet_ma_ho_phap")).toBeGreaterThan(avg("huyet_hai_lao_ma"));
    expect(avg("huyet_hai_lao_ma")).toBeGreaterThan(avg("huyet_sat_chan_truyen"));
    expect(avg("huyet_ma_ho_phap")).toBe(avg("thien_lang_vuong"));
    expect(avg("huyet_hai_lao_ma")).toBe(avg("lang_vuong"));
    for (const d of DROP_TABLES.huyet_ma_ho_phap) expect(d.chance).toBe(1);
    for (const d of DROP_TABLES.huyet_hai_lao_ma) expect(d.chance).toBeLessThan(1);
  });

  it("bộ chiêu: có thật, qua bossViolations, mọi đòn báo trước >= 800 ms, Hộ Pháp có 3 giai đoạn + cuồng nộ + triệu Ngạ Quỷ (tối đa 2 con), Hải Lão Ma một giai đoạn không triệu hồi", () => {
    const t = BOSS_BY_KIND.huyet_ma_ho_phap;
    const l = BOSS_BY_KIND.huyet_hai_lao_ma;
    expect(t).toBeDefined();
    expect(l).toBeDefined();
    expect(bossViolations([t, l]).join("\n")).toBe("");
    for (const d of [t, l])
      for (const a of d.abilities)
        if (a.dmgMult > 0)
          expect(a.telegraphMs, `${d.kind}/${a.id}`).toBeGreaterThanOrEqual(BOSS_MIN_TELEGRAPH_MS);
    expect(t.phases.map((p) => p.fromHp)).toEqual([1, 0.6, 0.35]);
    expect(t.enrage).toBeDefined();
    expect(t.maxAdds).toBeGreaterThan(0);
    expect(t.maxAdds).toBeLessThanOrEqual(BOSS_ADDS_CAP);
    expect(t.abilities.some((a) => a.shape.t === "summon" && a.shape.kind === "nga_quy")).toBe(
      true,
    );
    expect(l.phases).toHaveLength(1);
    expect(l.maxAdds).toBe(0);
    expect(l.abilities.every((a) => a.shape.t !== "summon")).toBe(true);
    // chiêu khống chế của nguồn ("thần thức trấn áp") chỉ choáng NGẮN
    const tt = l.abilities.find((a) => a.id === "than_thuc")!;
    expect(tt.effect?.status).toBe("stun");
    expect(tt.effect!.ms).toBeLessThanOrEqual(800);
  });

  it("sinh ĐÚNG ở Uy Vân Kinh (mỗi trùm 1 con, <= MAX_BOSSES_PER_MAP, tổng monsterCap 64) và không ở bản đồ nào khác", () => {
    const uv = getMap("uy_van")!;
    expect(uv.monsterCapOf("huyet_hai_lao_ma")).toBe(1);
    expect(uv.monsterCapOf("huyet_ma_ho_phap")).toBe(1);
    const trum = Object.keys(uv.monsterCap).filter((id) => MONSTER_BY_ID[id]?.boss);
    expect(trum.sort()).toEqual(["huyet_hai_lao_ma", "huyet_ma_ho_phap"]);
    expect(trum.reduce((n, id) => n + uv.monsterCapOf(id), 0)).toBeLessThanOrEqual(
      MAX_BOSSES_PER_MAP,
    );
    expect(Object.values(uv.monsterCap).reduce((a, b) => a + b, 0)).toBe(64);
    for (const m of MAPS) {
      if (m.id === "uy_van") continue;
      expect(getMap(m.id)!.monsterCapOf("huyet_hai_lao_ma"), m.id).toBe(0);
      expect(getMap(m.id)!.monsterCapOf("huyet_ma_ho_phap"), m.id).toBe(0);
    }
  });

  it("mỗi trùm có ĐÚNG MỘT dòng `du_lieu` ở docs/NGUON_NOI_DUNG.md mục 3 (khoá `enemy.<id>`, ghi #1466, KHONG_AP_DUNG, trỏ id trong `game.ts`)", () => {
    const doc = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../../docs/NGUON_NOI_DUNG.md"),
      "utf8",
    );
    for (const id of ["huyet_hai_lao_ma", "huyet_ma_ho_phap"]) {
      const rows = doc
        .split("\n")
        .filter((r) => r.startsWith("|") && r.includes(`\`enemy.${id}\``) && r.includes("#1466"));
      expect(rows.length, `${id}: số dòng nguồn`).toBe(1);
      const cols = rows[0].split("|").map((c) => c.trim());
      expect([cols[1], cols[5], cols[6]], id).toEqual(["du_lieu", "#1466", "KHONG_AP_DUNG"]);
      expect(rows[0].includes(`id \`${id}\``), `${id}: trỏ id`).toBe(true);
    }
  });
});
