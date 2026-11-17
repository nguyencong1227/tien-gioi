import { describe, expect, it } from "vitest";
import {
  SKILLS_M7,
  TILE,
  sampleSkills,
  skillCooldownMs,
  skillDamageMult,
  skillMpCost,
  skillOf,
  skillEffect,
  type SkillDef,
  type SkillsMsg,
} from "@tien-gioi/shared";
import { SkillTracker, type SlotMe } from "./skill-bar";
import {
  SHAPE_LABEL,
  buildSkillsPanel,
  effectText,
  fmtNum,
  lockedSlotToast,
  nextOpenSkill,
  resolveOpenSkill,
  rowAria,
  slotMessage,
  statLines,
} from "./skills-panel";

const HOA = "hoa_van_kiem"; // cone, reqRealm 1, mult 1,6, burn 40%
const BANG = "huyen_bang_chi";
const TUNG = "thanh_tung_phi_cham"; // reqRealm 2
const ME: SlotMe = { realm: 3, tier: 0, mp: 1000, maxMp: 1000 }; // Kim Đan: mở ô 2, 3, 4; ô 5 khoá

function tracker(over: Partial<SkillsMsg> = {}): SkillTracker {
  const t = new SkillTracker();
  t.set(
    {
      learned: { [HOA]: 2, [BANG]: 1 },
      slots: [HOA, "", "", ""],
      cd: [0, 0, 0, 0],
      cdMax: [3000, 0, 0, 0],
      ...over,
    },
    0,
  );
  return t;
}

describe("fmtNum: số kiểu Việt", () => {
  it("dấu phẩy, bỏ số 0 thừa, rác -> 0", () => {
    expect(fmtNum(1.84)).toBe("1,84");
    expect(fmtNum(2)).toBe("2");
    expect(fmtNum(2.5)).toBe("2,5");
    expect(fmtNum(1.2, 1)).toBe("1,2");
    expect(fmtNum(0.4 * 100, 0)).toBe("40");
    expect(fmtNum(Number.NaN)).toBe("0");
    expect(fmtNum(Infinity)).toBe("0");
    expect(fmtNum(10)).toBe("10");
    expect(fmtNum(100)).toBe("100"); // không cắt nhầm số 0 của phần nguyên
  });
});

describe("statLines: số THẬT của máy chủ", () => {
  it("sát thương nhân tầng, linh lực theo linh lực tối đa, hồi chiêu theo tầng", () => {
    const def = skillOf(HOA)!;
    const l1 = statLines(def, 1, 1000);
    const l3 = statLines(def, 3, 1000);
    expect(l1[0]).toBe(`Sát thương: ${fmtNum(def.mult * skillDamageMult(1))} lần công`);
    expect(l3[0]).toBe(`Sát thương: ${fmtNum(def.mult * skillDamageMult(3))} lần công`);
    expect(l1[0]).not.toBe(l3[0]);
    expect(l1[1]).toBe(`Linh lực: ${skillMpCost(def, 1000)} (8% tối đa)`);
    expect(statLines(def, 1, 5000)[1]).toBe(`Linh lực: ${skillMpCost(def, 5000)} (8% tối đa)`);
    expect(l1[2]).toBe(`Hồi chiêu: ${fmtNum(skillCooldownMs(def, 1, 0) / 1000, 1)} giây`);
    expect(l3[2]).not.toBe(l1[2]);
  });
  it("dòng Tầm / Vùng / Lao theo ĐƠN VỊ Ô (px / TILE), có số cụ thể (đột biến bỏ chia TILE phải đỏ)", () => {
    // Hỏa Vân Kiếm: tầm 90 px = 2,8125 ô -> "2,8"
    expect(statLines(skillOf("hoa_van_kiem")!, 1, 1000)).toContain("Tầm: 2,8 ô");
    // Lạc Tuyết Phân Phi (toả tia): tầm 200 px = 6,25 ô, 5 tia
    expect(statLines(skillOf("lac_tuyet_phan_phi")!, 1, 1000)).toContain("Tầm: 6,3 ô, 5 tia");
    // Cửu Cung Khốn Sát (vùng): bán kính 110 px = 3,4375 ô, đặt cách 140 px = 4,375 ô
    expect(statLines(skillOf("cuu_cung_khon_sat")!, 1, 1000)).toContain(
      "Vùng: bán kính 3,4 ô, đặt cách 4,4 ô",
    );
    // Phiêu Phong Bộ (bộ pháp): lao 150 px = 4,6875 ô
    expect(statLines(skillOf("phieu_phong_bo")!, 1, 1000)).toContain("Lao: 4,7 ô");
    // chiêu hộ thể / vòng nổ: không có dòng tầm nào sai kiểu
    for (const d of SKILLS_M7)
      for (const l of statLines(d, 1, 1000))
        if (/^(Tầm|Vùng|Lao):/.test(l)) expect(l).not.toMatch(/\d{3,}/); // không bao giờ in px (>= 100) như thể là ô
  });

  it("chiêu không gây sát thương, chiêu toả tia, vùng đặt đất, bộ pháp có dòng riêng", () => {
    for (const d of SKILLS_M7) {
      const lines = statLines(d, 1, 1000);
      expect(lines.length).toBeGreaterThanOrEqual(3);
      expect(lines[0]).toMatch(d.mult > 0 ? /^Sát thương: / : /^Không gây sát thương$/);
      expect(lines.join("|")).not.toMatch(/NaN|undefined|Infinity/);
    }
    expect(statLines(skillOf("lac_tuyet_phan_phi")!, 1, 1000).join("|")).toMatch(/mỗi tia/);
    expect(statLines(skillOf("cuu_cung_khon_sat")!, 1, 1000).join("|")).toMatch(/Vùng: bán kính/);
    expect(statLines(skillOf("phieu_phong_bo")!, 1, 1000).join("|")).toMatch(/Lao: /);
  });
});

/** Chiêu mới của mục 51 dựng tay với con số TÒN: kiểm từng dòng số liệu (CT11a). Nền: một chiêu mẫu cùng hình, ghi đè các trường cần. */
function mk(shape: SkillDef["shape"], over: Partial<SkillDef> = {}): SkillDef {
  const base = sampleSkills(60).find((d) => d.shape === shape)!;
  return { ...base, mult: 1, range: TILE * 5, reach: TILE * 3, ...over };
}
const joined = (d: SkillDef, level = 1) => statLines(d, level, 1000).join("|");

describe("statLines: số liệu riêng của hình mới (mục 51)", () => {
  it("chain: nảy bao nhiêu lần, tầm nhảy theo ô, mỗi lần còn bao nhiêu %, dòng sát thương nói 'ở đòn đầu'", () => {
    const d = mk("chain", { bounces: 3, chainReach: TILE * 4, falloff: 0.8 });
    const l = joined(d);
    expect(l).toContain("Tầm: 5 ô");
    expect(l).toContain("Sét lan: nảy 3 lần, tầm nhảy 4 ô, mỗi lần còn 80% sát thương");
    expect(l).toMatch(/Sát thương: [\d,]+ lần công ở đòn đầu/);
    // thiếu `falloff` thì dùng mặc định 85% của hợp đồng
    expect(joined(mk("chain", { bounces: 1, chainReach: TILE * 4, falloff: undefined }))).toContain(
      "còn 85% sát thương",
    );
    // không nảy: không nói "ở đòn đầu", không in "nảy 0 lần"
    const none = joined(mk("chain", { bounces: 0 }));
    expect(none).toContain("Sét lan: không nảy");
    expect(none).not.toContain("ở đòn đầu");
  });
  it("bolt: tầm, tốc độ theo ô / giây, số viên, xuyên, nảy; 'mỗi viên' chỉ khi nhiều viên", () => {
    const d = mk("bolt", { count: 3, speed: TILE * 15, pierce: 2, bounce: 1 });
    const l = joined(d);
    expect(l).toContain("Tầm: 5 ô, bay 15 ô/giây, 3 viên, xuyên 2 quái, nảy 1 lần");
    expect(l).toMatch(/lần công mỗi viên/);
    const one = joined(mk("bolt", { count: 1, speed: TILE * 10, pierce: 0, bounce: 0 }));
    expect(one).toContain("Tầm: 5 ô, bay 10 ô/giây");
    expect(one).not.toMatch(/viên|xuyên|nảy/);
  });
  it("zone / aura / totem: tồn tại bao lâu, mỗi nhịp bao lâu, 'mỗi nhịp' ở dòng sát thương", () => {
    expect(joined(mk("zone", { durationMs: 4000, tickMs: 1000 }))).toContain(
      "Vùng: bán kính 5 ô, đặt cách 3 ô, tồn tại 4 giây, mỗi 1 giây",
    );
    expect(joined(mk("aura", { durationMs: 6000, tickMs: 1500 }))).toContain(
      "Hào quang: bán kính 5 ô, bám theo người, tồn tại 6 giây, mỗi 1,5 giây",
    );
    expect(joined(mk("totem", { durationMs: 5000, tickMs: 1000, taunt: true }))).toContain(
      "Tượng: tầm 5 ô, đặt cách 3 ô, tồn tại 5 giây, mỗi 1 giây, thu hút quái",
    );
    expect(joined(mk("totem", { durationMs: 5000, tickMs: 1000, taunt: false }))).not.toContain(
      "thu hút",
    );
    for (const sh of ["zone", "aura", "totem"] as const)
      expect(joined(mk(sh, { durationMs: 4000, tickMs: 1000 }))).toMatch(/lần công mỗi nhịp/);
  });
  it("trap: bán kính, kích hoạt sau bao lâu, tồn tại, nổ một lần", () => {
    expect(joined(mk("trap", { armMs: 600, durationMs: 10_000 }))).toContain(
      "Bẫy: bán kính 5 ô, đặt cách 3 ô, kích hoạt sau 0,6 giây, tồn tại 10 giây, nổ một lần",
    );
  });
  it("thiếu số thì bỏ phần đó, KHÔNG in '0 giây' / NaN / undefined", () => {
    for (const sh of ["zone", "aura", "totem"] as const) {
      const l = joined(mk(sh, { durationMs: undefined, tickMs: undefined }));
      expect(l).not.toMatch(/0 giây|NaN|undefined|Infinity/);
      expect(l).not.toContain("tồn tại");
    }
  });
  it("trường chung: vận khí, kéo / đẩy, combo (kèm gỡ dấu và hiệu ứng), đồng đội", () => {
    expect(joined(mk("nova", { windupMs: 1500 }))).toContain(
      "Vận khí: 1,5 giây rồi mới đáp (lúc vận đi chậm 50%, bị choáng thì huỷ)",
    );
    expect(joined(mk("cone", { displace: { dir: "pull", px: TILE * 3 } }))).toContain(
      "Kéo mục tiêu 3 ô (trùm miễn, tinh anh nửa quãng)",
    );
    expect(joined(mk("cone", { displace: { dir: "push", px: TILE * 2 } }))).toContain(
      "Đẩy mục tiêu 2 ô",
    );
    const combo = joined(
      mk("cone", {
        combo: {
          needs: "mark_hoa",
          mult: 1.6,
          consume: true,
          apply: skillEffect("burn", 2, 0.3, 1),
        },
      }),
    );
    expect(combo).toContain(
      "Combo: đánh vào mục tiêu đang mang Dấu Hỏa thì sát thương x1,6, gỡ Dấu Hỏa, gắn Bỏng",
    );
    // thiếu `mult` dùng mặc định 1,4; không `consume` thì không nói gỡ
    const dflt = joined(mk("cone", { combo: { needs: "mark_kim" } }));
    expect(dflt).toContain("x1,4");
    expect(dflt).not.toContain("gỡ");
    expect(joined(mk("self", { ally: { range: TILE * 6 } }))).toContain(
      "Hiệu ứng có lợi cũng lên đồng đội trong 6 ô",
    );
    // chiêu không có trường chung thì không có dòng nào của chúng
    expect(joined(mk("cone"))).not.toMatch(/Vận khí|Kéo|Đẩy|Combo|đồng đội/);
  });
  it("mọi chiêu mẫu (đủ 13 hình, mọi trường): dòng số liệu sạch, đúng một dòng 'Tầm' hay tương đương", () => {
    for (const d of sampleSkills(60)) {
      const lines = statLines(d, 1, 1000);
      expect(lines.length, d.id).toBeGreaterThanOrEqual(3);
      expect(lines.join("|"), d.id).not.toMatch(/NaN|undefined|Infinity|\b0 giây/);
      for (const l of lines)
        if (/^(Tầm|Vùng|Bẫy|Hào quang|Tượng|Lao):/.test(l)) expect(l, d.id).not.toMatch(/\d{3,}/);
    }
  });
});

describe("effectText: hiệu ứng gắn kèm", () => {
  it("tên, thời gian, cường độ theo loại, xác suất; trạng thái lạ rỗng", () => {
    expect(effectText({ status: "burn", ms: 3000, ratio: 0.12, chance: 0.4 })).toBe(
      "40% khả năng: Bỏng 3 giây (12% sát thương gốc mỗi giây)",
    );
    expect(effectText({ status: "chill", ms: 3000, ratio: 0.3, chance: 1 })).toBe(
      "Tê cóng 3 giây (giảm tốc 30%)",
    );
    expect(effectText({ status: "stun", ms: 1200, ratio: 0, chance: 1 })).toBe("Choáng 1,2 giây");
    expect(effectText({ status: "shield", ms: 6000, ratio: 0.2, chance: 1 })).toBe(
      "Hộ thể 6 giây (chắn 20% khí huyết tối đa), cho bản thân",
    );
    expect(effectText({ status: "haste", ms: 4500, ratio: 0.35, chance: 1 })).toContain(
      "tăng tốc 35%",
    );
    expect(effectText({ status: "regen", ms: 3000, ratio: 0.05, chance: 1 })).toContain(
      "hồi 5% khí huyết",
    );
    expect(effectText({ status: "sunder", ms: 3000, ratio: 0.2, chance: 1 })).toContain(
      "nhận thêm 20% sát thương",
    );
    expect(effectText({ status: "constructor" as never, ms: 1, ratio: 1, chance: 1 })).toBe("");
  });
  it("mọi hiệu ứng của mọi chiêu thật đều có chữ, không NaN", () => {
    for (const d of SKILLS_M7)
      for (const e of d.effects) {
        const t = effectText(e);
        expect(t.length).toBeGreaterThan(0);
        expect(t).not.toMatch(/NaN|undefined/);
      }
  });
});

describe("effectText: trạng thái mới của mục 51", () => {
  it("cường lực (tự buff), suy yếu (có hại, trùm chịu nửa), dấu hệ (combo)", () => {
    expect(effectText(skillEffect("empower", 4, 0.3, 1))).toBe(
      "Cường Lực 6 giây (tăng 30% sát thương mọi chiêu), cho bản thân",
    );
    expect(effectText(skillEffect("weaken", 4, 0.25, 0.5))).toBe(
      "50% khả năng: Suy Yếu 6 giây (gây ít hơn 25% sát thương, trùm chỉ chịu một nửa)",
    );
    expect(effectText(skillEffect("mark_hoa", 4, 0, 1))).toBe(
      "Dấu Hỏa 6 giây (chiêu cùng hệ đánh vào sẽ ăn combo)",
    );
    expect(effectText(skillEffect("mark_loi", 2, 0, 1))).toContain("Dấu Lôi");
  });
  it("mọi trạng thái trong bảng đều có chữ (không rỗng, không NaN)", () => {
    for (const id of ["empower", "weaken", "mark_kim", "mark_am", "windup"] as const) {
      const t = effectText(skillEffect(id, 2, 0.2, 1));
      expect(t, id).not.toBe("");
      expect(t, id).not.toMatch(/NaN|undefined/);
    }
  });
});

describe("buildSkillsPanel: mô hình bảng", () => {
  it("chưa học gì: rỗng + câu hướng dẫn", () => {
    const m = buildSkillsPanel(new SkillTracker(), ME);
    expect(m.rows).toEqual([]);
    expect(m.count).toBe("0 chiêu đã học");
    expect(m.empty).toMatch(/Túi đồ/);
  });

  it("chỉ chiêu ĐÃ học, theo thứ tự bảng, kèm tầng, hệ, kiểu đánh, kinh quyển, mô tả", () => {
    const m = buildSkillsPanel(tracker(), ME);
    expect(m.rows.map((r) => r.id)).toEqual([HOA, BANG]);
    expect(m.count).toBe("2 chiêu đã học");
    expect(m.empty).toBeNull();
    const r = m.rows[0];
    expect(r).toMatchObject({
      name: "Hỏa Vân Kiếm",
      level: 2,
      pips: "●●○",
      element: "Hỏa",
      shape: SHAPE_LABEL.cone,
    });
    expect(r.book).toBe(skillOf(HOA)!.bookName);
    expect(r.desc).toBe(skillOf(HOA)!.desc);
    expect(r.effects.length).toBe(1);
    expect(r.need).toBeNull();
  });

  it("ô: mở theo cảnh giới, ô đang giữ chiêu, gắn / gỡ", () => {
    const m = buildSkillsPanel(tracker(), ME);
    const hoa = m.rows[0];
    expect(hoa.slotNow).toBe(2);
    expect(hoa.unequip).toBe("Gỡ khỏi ô 2");
    expect(hoa.slots.map((s) => [s.slot, s.open, s.here])).toEqual([
      [2, true, true],
      [3, true, false],
      [4, true, false],
      [5, false, false], // Nguyên Anh mới mở
    ]);
    expect(hoa.slots[0].aria).toBe("Hỏa Vân Kiếm đang ở ô 2");
    expect(hoa.slots[1].aria).toBe("Gắn Hỏa Vân Kiếm vào ô 3");
    expect(hoa.slots[3].aria).toBe("Ô 5 chưa mở: Mở ở Nguyên Anh");
    expect(hoa.slots[3].blocked).toBe("Ô chiêu thức 5 chưa mở: Mở ở Nguyên Anh.");
    expect(hoa.slots[1].blocked).toBeNull();
    const bang = m.rows[1];
    expect(bang.slotNow).toBeNull();
    expect(bang.unequip).toBeNull();
    // gắn vào ô đang có chiêu khác: nói rõ sẽ thay chiêu nào
    expect(bang.slots[0].occupant).toBe("Hỏa Vân Kiếm");
    expect(bang.slots[0].aria).toBe("Gắn Huyền Băng Chỉ vào ô 2, thay Hỏa Vân Kiếm");
    expect(bang.slots[1].occupant).toBe("");
  });

  it("cảnh giới thấp: ô khoá theo SLOT_UNLOCK_REALM, không ô nào mở ở Phàm Nhân", () => {
    const m = buildSkillsPanel(tracker(), { ...ME, realm: 0 });
    expect(m.rows[0].slots.every((s) => !s.open)).toBe(true);
    const m2 = buildSkillsPanel(tracker(), { ...ME, realm: 2 });
    expect(m2.rows[0].slots.map((s) => s.open)).toEqual([true, true, false, false]);
  });

  it("chiêu thiếu cảnh giới (kiếp mới giữ chiêu khắc): ghi 'Cần đạt ...'", () => {
    const t = tracker({ learned: { [TUNG]: 1 }, slots: ["", "", "", ""] });
    const row = buildSkillsPanel(t, { realm: 1, tier: 3, mp: 9, maxMp: 9 }).rows[0];
    expect(row.need).toBe("Cần đạt Trúc Cơ");
    expect(buildSkillsPanel(t, { realm: 2, tier: 0, mp: 9, maxMp: 9 }).rows[0].need).toBeNull();
  });

  it("hàng GỌN: nhãn ô ('Ô 2' / 'Chưa gắn'), dòng phụ 'hệ · tầng', aria-label đọc đủ", () => {
    const m = buildSkillsPanel(tracker(), ME);
    const [hoa, bang] = m.rows;
    expect(hoa.slotLabel).toBe("Ô 2");
    expect(hoa.sub).toBe("Hỏa · tầng 2");
    expect(hoa.aria).toBe("Hỏa Vân Kiếm, hệ Hỏa, phẩm Hoàng, tầng 2 trên 3, đang ở ô 2");
    expect(bang.slotLabel).toBe("Chưa gắn");
    expect(bang.sub).toBe("Băng · tầng 1");
    expect(bang.aria).toBe(
      `Huyền Băng Chỉ, hệ Băng, phẩm ${bang.gradeName}, tầng 1 trên 3, chưa gắn ô`,
    );
  });

  it("mỗi hàng mang id hệ, phẩm 0..3 (kèm tên) và phong cách (kèm tên) để lọc và vẽ biểu tượng", () => {
    const [hoa, bang] = buildSkillsPanel(tracker(), ME).rows;
    expect(hoa.elementId).toBe(skillOf(HOA)!.element);
    expect(bang.elementId).toBe(skillOf(BANG)!.element);
    for (const r of [hoa, bang]) {
      expect(Number.isInteger(r.grade) && r.grade >= 0 && r.grade <= 3).toBe(true);
      expect(r.gradeName).toBe(["Hoàng", "Huyền", "Địa", "Thiên"][r.grade]);
      expect(r.style).not.toBe("");
      expect(r.styleName).not.toBe("");
    }
    // thiếu `grade` thì suy theo rarity của kinh quyển: Hỏa Vân Kiếm rarity 1 -> Hoàng
    expect(hoa.grade).toBe(Math.max(0, skillOf(HOA)!.rarity - 1));
  });

  it("rowAria thêm phẩm khi có, bỏ khi thiếu (không lặp dấu phẩy)", () => {
    expect(rowAria("Chiêu A", "Lôi", 1, null, null, "Địa")).toBe(
      "Chiêu A, hệ Lôi, phẩm Địa, tầng 1 trên 3, chưa gắn ô",
    );
    expect(rowAria("Chiêu A", "", 1, null, null, "Thiên")).toBe(
      "Chiêu A, phẩm Thiên, tầng 1 trên 3, chưa gắn ô",
    );
  });

  it("hàng gọn của chiêu thiếu cảnh giới: aria nói điều kiện, nhãn ô vẫn đúng", () => {
    const t = tracker({ learned: { [TUNG]: 1 }, slots: [TUNG, "", "", ""] });
    const row = buildSkillsPanel(t, { realm: 1, tier: 3, mp: 9, maxMp: 9 }).rows[0];
    expect(row.slotLabel).toBe("Ô 2");
    expect(row.aria).toBe(
      `Thanh Tùng Phi Châm, hệ Mộc, phẩm ${row.gradeName}, tầng 1 trên 3, đang ở ô 2, cần đạt Trúc Cơ`,
    );
  });

  it("số trong bảng khớp hàm của máy chủ theo tầng của TỪNG chiêu và linh lực tối đa", () => {
    const m = buildSkillsPanel(tracker(), { ...ME, maxMp: 2000 });
    const def = skillOf(HOA)!;
    expect(m.rows[0].stats[0]).toBe(
      `Sát thương: ${fmtNum(def.mult * skillDamageMult(2))} lần công`,
    );
    expect(m.rows[0].stats[1]).toBe(`Linh lực: ${skillMpCost(def, 2000)} (8% tối đa)`);
  });

  it("rác từ tin nhắn đã bị SkillTracker làm sạch: không có hàng cho id lạ / độc", () => {
    const t = tracker({
      learned: { constructor: 3, __proto__x: 2, [HOA]: 1 },
      slots: ["constructor", "", "", ""],
    });
    expect(buildSkillsPanel(t, ME).rows.map((r) => r.id)).toEqual([HOA]);
  });
});

describe("tin gắn ô và thông báo", () => {
  it("slotMessage: gắn và gỡ ('' = gỡ)", () => {
    expect(slotMessage(3, HOA)).toEqual({ slot: 3, skillId: HOA });
    expect(slotMessage(2, "")).toEqual({ slot: 2, skillId: "" });
  });
  it("ô chưa mở: toast nêu cảnh giới, ô mở: null", () => {
    expect(lockedSlotToast(5, { realm: 3 })).toBe("Ô chiêu thức 5 chưa mở: Mở ở Nguyên Anh.");
    expect(lockedSlotToast(4, { realm: 3 })).toBeNull();
    expect(lockedSlotToast(2, { realm: 0 })).toBe("Ô chiêu thức 2 chưa mở: Mở ở Luyện Khí.");
  });
});

describe("hàng gọn: rowAria / mở một chi tiết mỗi lúc", () => {
  it("rowAria bỏ phần hệ khi thiếu, không lặp dấu phẩy, nhãn đọc được không dùng chấm tầng", () => {
    expect(rowAria("Chiêu A", "", 3, null, null)).toBe("Chiêu A, tầng 3 trên 3, chưa gắn ô");
    expect(rowAria("Chiêu A", "Lôi", 1, 4, "Cần đạt Kim Đan")).toBe(
      "Chiêu A, hệ Lôi, tầng 1 trên 3, đang ở ô 4, cần đạt Kim Đan",
    );
    expect(rowAria("Chiêu A", "Lôi", 1, 4, null)).not.toMatch(/[●○]/);
  });

  it("nextOpenSkill: bấm hàng đang mở thì gập, bấm hàng khác thì chuyển; chỉ một hàng mở", () => {
    expect(nextOpenSkill(null, HOA)).toBe(HOA);
    expect(nextOpenSkill(HOA, HOA)).toBeNull();
    expect(nextOpenSkill(HOA, BANG)).toBe(BANG);
    expect(nextOpenSkill(nextOpenSkill(null, HOA), BANG)).toBe(BANG);
  });

  it("resolveOpenSkill: hàng đang mở không còn trong danh sách (sổ chiêu đổi) thì coi như gập", () => {
    const rows = [{ id: HOA }, { id: BANG }];
    expect(resolveOpenSkill(HOA, rows)).toBe(HOA);
    expect(resolveOpenSkill("khong_co", rows)).toBeNull();
    expect(resolveOpenSkill(null, rows)).toBeNull();
    expect(resolveOpenSkill(HOA, [])).toBeNull();
  });
});
