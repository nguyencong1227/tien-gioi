// Nội dung Kim Đan (M6, #403) đo bằng mô hình cân bằng: an toàn theo bậc, không đường tắt, nhịp. Mục tiêu ở docs/PHAN_CONG_M6.md mục 4.
import { describe, expect, it } from "vitest";
import {
  MAIN_QUEST_START,
  MONSTER_BY_ID,
  QUEST_BY_ID,
  WILD_MONSTERS,
  stepOf,
  type MonsterKind,
} from "@tien-gioi/shared";
import { huntRate, monsterEconomy, simulate, simulateReincarnationMilestones } from "./simulate";
import { realmTierOfStep } from "./dungeon";
import {
  dangerFraction,
  kimDanPartyRows,
  kimDanReincarnation,
  rateWithPills,
  renderKimDanSau,
  withKimDan,
} from "./kim-dan-sau";

const KD = 3;
const NEW = ["suong_ho", "thach_quy", "doc_thiem"].map((id) => MONSTER_BY_ID[id]);
const BOSS = MONSTER_BY_ID.hac_giao;

describe("quái Kim Đan: ai săn được ở bậc nào (mô hình: mất <= 50% khí huyết mỗi trận)", () => {
  it("KHÔNG quái nào an toàn solo cho người Trúc Cơ hậu kỳ: không cày sớm được (cũng không bị quái mới phá nhịp Trúc Cơ)", () => {
    for (const m of [...NEW, BOSS]) expect(huntRate(m, 2, 2), m.id).toBeNull();
  });

  it("Sương Hồ và Thạch Quy an toàn từ Sơ kỳ; Độc Thiềm (đòn nặng) KHÔNG an toàn solo ở bậc nào (mục 30: máu x1,5) nhưng đội 2 người an toàn cả ba bậc", () => {
    for (let t = 0; t < 3; t++) {
      expect(huntRate(MONSTER_BY_ID.suong_ho, KD, t), `suong_ho t${t}`).not.toBeNull();
      expect(huntRate(MONSTER_BY_ID.thach_quy, KD, t), `thach_quy t${t}`).not.toBeNull();
      // Trước mục 30 (QUYET_DINH_M3, 16/11) Độc Thiềm solo được từ Trung kỳ (danger 0,47 -> 0,34); máu 2600 -> 3900 làm mất 0,97 / 0,70 / 0,51 khí huyết mỗi trận (> 0,5)
      expect(huntRate(MONSTER_BY_ID.doc_thiem, KD, t), `doc_thiem solo t${t}`).toBeNull();
      expect(huntRate(MONSTER_BY_ID.doc_thiem, KD, t, 2), `doc_thiem đội 2 t${t}`).not.toBeNull();
    }
  });

  it("Hắc Giao (mục 30: máu 75.000, tu vi 6.400): một người, đội 2 và đội 3 không an toàn ở bậc nào; đội 4 từ Trung kỳ; Sơ kỳ không đội nào hạ nổi (cần đội 5 mà PARTY_MAX = 4)", () => {
    for (let t = 0; t < 3; t++) {
      expect(huntRate(BOSS, KD, t, 1), `1 người t${t}`).toBeNull();
      expect(huntRate(BOSS, KD, t, 2), `đội 2 t${t}`).toBeNull();
      expect(huntRate(BOSS, KD, t, 3), `đội 3 t${t}`).toBeNull(); // trước mục 30: đội 3 từ Trung kỳ
    }
    expect(huntRate(BOSS, KD, 0, 4), "đội 4 Sơ kỳ").toBeNull(); // trước mục 30: đội 4 từ Sơ kỳ
    expect(huntRate(BOSS, KD, 1, 4), "đội 4 Trung kỳ").not.toBeNull();
    expect(huntRate(BOSS, KD, 2, 4), "đội 4 Hậu kỳ").not.toBeNull();
    // đội 5 (ngoài `PARTY_MAX`) sẽ hạ được từ Sơ kỳ: số đo để biết "thiếu bao nhiêu" nếu sau này nâng cỡ đội
    expect(huntRate(BOSS, KD, 0, 5), "đội 5 Sơ kỳ (ngoài cỡ đội tối đa)").not.toBeNull();
  });
});

describe("không có đường tắt: bãi nào cũng <= ~1,5x bãi Kim Đan đúng bậc (tu vi), <= 2x (Linh thạch)", () => {
  it("tu vi / giờ solo (kể cả đan rơi): Xích Mãng và mọi loài khác <= 1,5x loài MỚI tốt nhất ở cùng bậc", () => {
    for (let t = 0; t < 3; t++) {
      const designed = Math.max(...NEW.map((m) => rateWithPills(m, t) ?? 0));
      expect(designed, `t${t}`).toBeGreaterThan(0);
      for (const m of [...WILD_MONSTERS, ...NEW]) {
        const r = rateWithPills(m, t);
        if (r !== null)
          expect(
            r / designed,
            `${m.id} t${t}: ${r.toFixed(0)} / ${designed.toFixed(0)}`,
          ).toBeLessThanOrEqual(1.5);
      }
    }
  });

  it("Linh thạch / giờ solo: loài cũ <= ~2,1x loài mới tốt nhất ở cùng bậc (mục 30: máu loài mới x1,5 mà tiền rơi giữ nguyên nên Linh thạch / giờ loài mới giảm, Xích Mãng cũ lên 2,02x)", () => {
    for (let t = 0; t < 3; t++) {
      const coin = (m: MonsterKind) => monsterEconomy(m, KD, t)?.totalCoinPerHour ?? 0;
      const designed = Math.max(...NEW.map(coin));
      for (const m of WILD_MONSTERS)
        expect(
          coin(m) / designed,
          `${m.id} t${t}: ${coin(m).toFixed(0)} / ${designed.toFixed(0)}`,
        ).toBeLessThanOrEqual(2.1);
    }
  });

  it("đội 4 người hạ Hắc Giao: mỗi người nhanh hơn săn solo tốt nhất nhưng không quá ~1,55x (Trung kỳ trở đi; mục 30: đội 3 không còn hạ nổi)", () => {
    for (const t of [1, 2]) {
      const party = huntRate(BOSS, KD, t, 4)!.rate * 3600;
      const solo =
        Math.max(...[...WILD_MONSTERS, ...NEW].map((m) => huntRate(m, KD, t)?.rate ?? 0)) * 3600;
      expect(party / solo, `t${t}`).toBeGreaterThan(1);
      expect(party / solo, `t${t}`).toBeLessThanOrEqual(1.55);
    }
  });
});

describe("nhịp tu luyện (mô hình simulate, có nội dung mới)", () => {
  const minutes = (rows: ReturnType<typeof simulate>, realm: number) =>
    rows.filter((r) => r.realm === realm).reduce((a, r) => a + r.minutes, 0);

  it("quái Kim Đan KHÔNG phá nhịp Luyện Khí / Trúc Cơ; Trúc Cơ cộng dồn 2 giờ 49 phút (chuỗi nhiệm vụ Trúc Cơ mới thưởng 500 tu vi, mục tiêu ~3 giờ; #1333: `thanh_lo_tram` lên sàn 240 rút 1 phút)", () => {
    const before = simulate(2);
    const after = withKimDan(() => simulate(2));
    expect(after.map((r) => r.minutes)).toEqual(before.map((r) => r.minutes));
    expect(Math.round(after.at(-1)!.total)).toBe(169);
    // Luyện Khí: 51 phút cộng dồn (bao gồm 3 việc phụ Lạc Hà #754 thưởng exp 25/30/35 = 90, trong trần 2,5 %)
    expect(Math.round(after.filter((r) => r.realm <= 1).at(-1)!.total)).toBe(51);
  });

  it("Kim Đan ~3,8-7 giờ (mục tiêu M6 5-7 giờ, mục 30: tu vi x2 + máu x1,5 rút còn ~4,2 giờ, người dùng chủ ý thưởng nhiều tu vi hơn; mục 66.4 / #1333: sàn thưởng nhiệm vụ rút thêm ~7 % còn ~3,9 giờ): người tối ưu (cả Xích Mãng) và người chỉ săn bãi mới", () => {
    const optimal =
      minutes(
        withKimDan(() => simulate(3)),
        KD,
      ) / 60;
    expect(optimal).toBeGreaterThan(3.8);
    expect(optimal).toBeLessThan(7);
    // chỉ bãi mới + Hắc Hổ / Sói / Thỏ (không đụng Xích Mãng)
    const noMang = withKimDan(() => simulate(3), true);
    const designed = minutes(noMang, KD) / 60;
    expect(designed).toBeGreaterThanOrEqual(optimal);
    expect(designed).toBeLessThan(7);
    // hình dạng đúng: không còn "vách" như trước M6 (Sơ kỳ 4 giờ rồi hai bậc sau trôi trong ~2 giờ): mỗi bậc 1-3 giờ
    for (const r of withKimDan(() => simulate(3)).filter((x) => x.realm === KD)) {
      expect(r.minutes / 60, r.label).toBeGreaterThan(1);
      expect(r.minutes / 60, r.label).toBeLessThan(3);
    }
  });
});

describe("kim-dan-sau: kết xuất và độ nguy hiểm", () => {
  it("dangerFraction khớp tiêu chí an toàn của huntRate (<= 50% thì an toàn, > 50% thì không)", () => {
    for (const id of ["suong_ho", "thach_quy", "doc_thiem", "mang", "ho"])
      for (let t = 0; t < 3; t++) {
        const m = MONSTER_BY_ID[id];
        expect(dangerFraction(m, KD, t) <= 0.5, `${id} t${t}`).toBe(huntRate(m, KD, t) !== null);
      }
    // cả đội cùng đánh: mỗi người mất ít hơn (chia 1/n^2 theo công thức)
    expect(dangerFraction(BOSS, KD, 1, 3)).toBeLessThan(dangerFraction(BOSS, KD, 1, 1) / 5);
  });

  it("withKimDan khôi phục danh sách săn sau khi chạy (kể cả khi hàm ném lỗi)", () => {
    const before = WILD_MONSTERS.map((m) => m.id);
    withKimDan(() => expect(WILD_MONSTERS.length).toBeGreaterThan(before.length));
    expect(WILD_MONSTERS.map((m) => m.id)).toEqual(before);
    expect(() =>
      withKimDan(() => {
        throw new Error("x");
      }, true),
    ).toThrow("x");
    expect(WILD_MONSTERS.map((m) => m.id)).toEqual(before);
  });

  it("renderKimDanSau: đủ năm mục, đủ ba bậc và bốn loài, không NaN / undefined", () => {
    const md = renderKimDanSau();
    for (const h of ["### 1.", "### 2.", "### 3.", "### 4.", "### 5."]) expect(md).toContain(h);
    for (const w of [
      "Sơ kỳ",
      "Trung kỳ",
      "Hậu kỳ",
      "Xích Mãng",
      "Sương Hồ",
      "Thạch Quy",
      "Độc Thiềm",
      "48,000",
    ])
      expect(md).toContain(w);
    expect(md).not.toMatch(/NaN|undefined|Infinity/);
  });
});

describe("luân hồi khi cày tới Kim Đan (#406 mục 4): mọi cách chơi vẫn tương đương, tiến trình qua kiếp <= 2,0x", () => {
  const r = kimDanReincarnation();

  it("có bốn mốc Kim Đan; bảng mặc định (đến hết Trúc Cơ) KHÔNG đổi: vẫn bảy mốc, không có Kim Đan", () => {
    expect(r.milestones.filter((m) => m.realm === 3).map((m) => m.label)).toEqual([
      "Kim Đan sơ kỳ",
      "Kim Đan trung kỳ",
      "Kim Đan hậu kỳ",
      "Hết Kim Đan (thanh đầy)",
    ]);
    const base = simulateReincarnationMilestones();
    expect(base).toHaveLength(7);
    expect(base.some((m) => m.realm === 3)).toBe(false);
  });

  it("từ Luyện Khí tầng 5 tới hết Kim Đan, Duyên / giờ (0 trùm) chênh <= 1,3x và đỉnh Kim Đan không vượt đỉnh Trúc Cơ quá 5 % (Kim Đan không trả quá tay)", () => {
    expect(r.ratio).toBeLessThanOrEqual(1.3);
    // Trước #1333 đỉnh nằm ở Trúc Cơ (`r.hi.realm <= 2`). Sàn thưởng nhiệm vụ một lần (mục 66.4) rút nhịp Kim Đan ~7 %, nên Duyên / giờ Kim Đan hậu kỳ (28,64)
    // nhỉnh hơn Trúc Cơ trung kỳ (28,28) ~1,3 %: giữ ý "không trả quá tay" bằng cận số 5 % thay vì cận theo cảnh giới.
    const tcPeak = Math.max(
      ...r.milestones.filter((x) => x.realm === 2).map((x) => x.duyenPerHourZeroBoss),
    );
    for (const m of r.milestones.filter((x) => x.realm === 3))
      expect(m.duyenPerHourZeroBoss, m.label).toBeLessThanOrEqual(tcPeak * 1.05);
  });

  it("không điểm dừng Kim Đan nào đáng cố ý chết sớm: mọi mốc Kim Đan >= mốc thấp nhất, và hết Kim Đan không kém hết Trúc Cơ quá 10%", () => {
    const tc = r.milestones.find((m) => m.label === "Hết Trúc Cơ (thanh đầy)")!;
    const end = r.milestones.at(-1)!;
    expect(end.label).toBe("Hết Kim Đan (thanh đầy)");
    expect(end.duyenPerHourZeroBoss).toBeGreaterThanOrEqual(tc.duyenPerHourZeroBoss * 0.9);
    for (const m of r.milestones.filter((x) => x.realm === 3))
      expect(m.duyenPerHourZeroBoss, m.label).toBeGreaterThanOrEqual(r.lo.duyenPerHourZeroBoss);
  });

  it("tiến trình qua kiếp (kiếp nào cũng tới hết Kim Đan): tăng dần, không vượt 2,0x kiếp 1, đạt Dư âm tu hành tối đa", () => {
    const p = r.progression;
    expect(p[0].ratioToFirstLife).toBe(1);
    expect(p.at(-1)!.duAmLevel).toBe(10);
    for (let i = 1; i < p.length; i++)
      expect(p[i].duyenPerHour).toBeGreaterThanOrEqual(p[i - 1].duyenPerHour);
    expect(Math.max(...p.map((x) => x.ratioToFirstLife))).toBeLessThanOrEqual(2.0);
    // một kiếp Kim Đan dài hơn một kiếp Trúc Cơ nhiều lần: nhận nhiều Duyên hơn tương ứng (cùng Duyên / giờ)
    expect(p[0].minutes).toBeGreaterThan(2 * 172);
  });
});

describe("đi theo đội ở Kim Đan (#406 mục 5): số đo, không đổi quy tắc chia tu vi", () => {
  const rows = kimDanPartyRows();

  it("ba bậc x ba cỡ đội; không ô nào vượt ~1,55x (mục tiêu #74 là 1,5x; mục 30: đội 4 Trung kỳ 1,51x) hay dưới 0,65x (khoá hiện trạng), mọi số hữu hạn dương", () => {
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.cells.map((c) => c.n)).toEqual([2, 3, 4]);
      for (const c of row.cells) {
        expect(Number.isFinite(c.ratio) && c.ratio > 0, `${row.label} đội ${c.n}`).toBe(true);
        expect(c.ratio, `${row.label} đội ${c.n}`).toBeLessThanOrEqual(1.55);
        // cận dưới: khoá hiện trạng (đội 3 ở Sơ kỳ 0,69x), đi đội không được xấu thêm mà test vẫn xanh (nit của B ở #437)
        expect(c.ratio, `${row.label} đội ${c.n}`).toBeGreaterThanOrEqual(0.65);
      }
    }
  });

  it("đội 4 hạ Hắc Giao từ Trung kỳ (mục 30: Sơ kỳ không đội nào hạ nổi); đội 2 và đội 3 không đủ người hạ trùm (khớp bảng an toàn)", () => {
    const pick = (t: number, n: number) => rows[t].cells.find((c) => c.n === n)!.party;
    expect(pick(0, 4)).not.toBe("hac_giao"); // trước mục 30: đội 4 từ Sơ kỳ
    expect(pick(1, 4)).toBe("hac_giao");
    expect(pick(2, 4)).toBe("hac_giao");
    for (let t = 0; t < 3; t++) {
      expect(pick(t, 2)).not.toBe("hac_giao");
      expect(pick(t, 3)).not.toBe("hac_giao"); // trước mục 30: đội 3 từ Trung kỳ
    }
  });

  it("danh sách săn của mô hình được khôi phục (không còn Hắc Giao sau khi đo)", () => {
    expect(WILD_MONSTERS.some((m) => m.id === "hac_giao")).toBe(false);
  });
});

describe("chuỗi nhiệm vụ chính làm được MỘT MÌNH (không chặn người chơi không có đội)", () => {
  it("mọi bước kill của chuỗi chính, trừ nhiệm vụ cuối (trùm theo đội), Độc Thiềm, Độc Tước và Phong Nha Sơ kỳ (mục 30: cần đội 2), là loài an toàn solo ở bậc người chơi đang có", () => {
    const chain: string[] = [];
    for (let id: string | undefined = MAIN_QUEST_START; id; id = QUEST_BY_ID[id].next)
      chain.push(id);
    expect(chain.length).toBeGreaterThan(10);
    let cur = 0; // bậc người chơi đang có khi tới từng bước (nhiệm vụ minRealm / reachRealm đẩy bậc lên)
    for (const id of chain.slice(0, -1)) {
      const q = QUEST_BY_ID[id];
      if (q.minRealm) cur = Math.max(cur, stepOf(q.minRealm.realm, q.minRealm.tier));
      for (const st of q.steps) {
        if (st.kind === "reachRealm") cur = Math.max(cur, stepOf(st.realm, st.tier));
        if (st.kind !== "kill") continue;
        const { realm: r, tier: t } = realmTierOfStep(cur);
        // NGOẠI LỆ GHI CÓ CHỦ Ý (mục 30, QUYET_DINH_M3 16/11; người dùng giữ nguyên số ở mục 54): Độc Thiềm máu x1,5 không còn an toàn solo ở mọi bậc Kim Đan nên bước hạ Độc Thiềm
        // của `doc_thiem_nang` (và `phong_nha_cham` ở Sơ kỳ Nguyên Anh) cần ĐỘI 2 (danh sách ngoại lệ dưới đây; thêm loài khác vào đây thì test này mất ý nghĩa). Nếu sau này muốn khôi phục "chuỗi chính làm được một mình":
        // máu Độc Thiềm <= ~3.250 (x1,25) hoặc đổi mục tiêu bước (xem questions.md, A / B / C).
        // Phong Nha (mục 30) chỉ hụt ở Sơ kỳ Nguyên Anh (danger 0,52 > 0,5; Trung kỳ trở đi solo được): `phong_nha_cham` ở bậc 16 cần đội 2 nếu chưa lên Trung kỳ.
        const needsTeam = ["doc_thiem", "phong_nha", "doc_tuoc"].includes(st.monster); // Độc Tước (đòn nặng nhất): 0,97 / 0,75 / 0,58 khí huyết mỗi trận ở ba bậc Nguyên Anh
        expect(
          huntRate(MONSTER_BY_ID[st.monster], r, t, needsTeam ? 2 : 1),
          `${id}: hạ ${st.monster} ở bậc ${cur} phải làm được ${needsTeam ? "theo đội 2" : "solo"}`,
        ).not.toBeNull();
        if (st.monster === "doc_thiem")
          expect(huntRate(MONSTER_BY_ID[st.monster], r, t, 1), `${id}: Độc Thiềm solo`).toBeNull();
      }
    }
    // nhiệm vụ cuối là trùm theo đội (từ M7.5c: Thiên Hàn Vương ở Hàn Vân): solo không an toàn ở mọi bậc Nguyên Anh, đúng thiết kế
    const last = QUEST_BY_ID[chain.at(-1)!];
    expect(last.steps.some((st) => st.kind === "kill" && st.monster === "thien_han_vuong")).toBe(
      true,
    );
    for (const tier of [0, 1, 2])
      expect(huntRate(MONSTER_BY_ID.thien_han_vuong, 4, tier), `Nguyên Anh bậc ${tier}`).toBeNull();
    // Hắc Giao (trùm Kim Đan, theo đội) là việc PHỤ `giao_hoan`, không còn nằm trong chuỗi chính: chuỗi không chặn người chơi không có đội
    expect(chain).not.toContain("giao_hoan");
    expect(huntRate(BOSS, KD, 2)).toBeNull();
  });

  it("Xích Mãng không an toàn solo ở Trúc Cơ: nên mang_hoan (hạ Xích Mãng) KHÔNG được nằm trong chuỗi chính", () => {
    expect(huntRate(MONSTER_BY_ID.mang, 2, 2)).toBeNull();
    const chain: string[] = [];
    for (let id: string | undefined = MAIN_QUEST_START; id; id = QUEST_BY_ID[id].next)
      chain.push(id);
    expect(chain).not.toContain("mang_hoan");
  });
});
