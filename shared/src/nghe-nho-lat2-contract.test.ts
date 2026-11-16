// Hợp đồng nghề nhỏ lát 2 (#514, docs/THIET_KE_NGHE_NHO.md mục 3 "Phù" + 5): phù tăng sát thương theo hệ (`amp_<hệ>`) và phù giảm hồi chiêu
// (`cdr_phu`). Chỉ kiểm HỢP ĐỒNG (bảng trạng thái, hàm tính hệ số, kẹp); nối vào `cast` / `skills` ở máy chủ có test riêng.
import { describe, expect, it } from "vitest";
import {
  AMP_ELEMENTS,
  AMP_MAX_MS,
  AMP_MAX_RATIO,
  CDR_CAP,
  ELEMENTS,
  ELEMENT_BY_ID,
  STATUSES,
  ampElementOf,
  ampStatusIdOf,
  clampStatusEffect,
  sanitizeStatusList,
  skillCooldownMs,
  statusAmpMult,
  statusCarriesRatio,
  statusCdr,
  statusOf,
  type StatusEntry,
} from "./index";

describe("phù tăng sát thương (amp_<hệ>)", () => {
  it("mỗi hệ có tên (trừ `none`) đúng MỘT trạng thái amp, CÓ LỢI, 60 giây, ratio tối đa 0,3", () => {
    const named = ELEMENTS.map((e) => e.id).filter((id) => id !== "none");
    expect([...AMP_ELEMENTS].sort()).toEqual([...named].sort());
    const amps = STATUSES.filter((s) => s.kind === "amp");
    expect(amps).toHaveLength(AMP_ELEMENTS.length);
    for (const el of AMP_ELEMENTS) {
      const def = statusOf(`amp_${el}`);
      expect(def, el).toBeDefined();
      expect(def!.kind).toBe("amp");
      expect(def!.harmful).toBe(false);
      expect(def!.maxMs).toBe(AMP_MAX_MS);
      expect(def!.maxRatio).toBe(AMP_MAX_RATIO);
      expect(def!.name).toBe(`Phù ${ELEMENT_BY_ID[el].name}`);
      expect(ampStatusIdOf(el)).toBe(def!.id);
      expect(ampElementOf(def!.id)).toBe(el);
    }
    expect(AMP_MAX_MS).toBe(60_000);
    expect(AMP_MAX_RATIO).toBe(0.3);
  });

  it("id lạ / `none` / rác: không có phù, không ném lỗi", () => {
    for (const bad of ["none", "", "constructor", "__proto__", 3, null, undefined, {}])
      expect(ampStatusIdOf(bad), String(bad)).toBeUndefined();
    for (const bad of ["burn", "dao_ho", "cdr_phu", "amp_none", "amp_", "constructor", 3, null])
      expect(ampElementOf(bad), String(bad)).toBeUndefined();
  });

  it("statusAmpMult: 1 + ratio chỉ cho ĐÚNG hệ; hệ khác, `none`, hết hạn, ratio hỏng đều 1; ratio kẹp theo maxRatio", () => {
    const list: StatusEntry[] = [["amp_hoa", 30_000, 0.2]];
    expect(statusAmpMult(list, "hoa")).toBeCloseTo(1.2, 12);
    expect(statusAmpMult(list, "kim")).toBe(1);
    expect(statusAmpMult(list, "none")).toBe(1);
    expect(statusAmpMult(list, "constructor")).toBe(1);
    expect(statusAmpMult([], "hoa")).toBe(1);
    expect(statusAmpMult([["amp_hoa", 0, 0.2]], "hoa")).toBe(1); // hết hạn
    expect(statusAmpMult([["amp_hoa", -5, 0.2]], "hoa")).toBe(1);
    expect(statusAmpMult([["amp_hoa", 1000, 9]], "hoa")).toBeCloseTo(1 + AMP_MAX_RATIO, 12); // kẹp
    expect(statusAmpMult([["amp_hoa", 1000, -1]], "hoa")).toBe(1);
    expect(statusAmpMult([["amp_hoa", 1000, Number.NaN]], "hoa")).toBe(1);
    expect(statusAmpMult([["amp_hoa", 1000]], "hoa")).toBe(1); // thiếu ratio
    // hai phù hai hệ: mỗi hệ chỉ nhận phù của mình
    const two: StatusEntry[] = [
      ["amp_hoa", 1000, 0.1],
      ["amp_kim", 1000, 0.25],
    ];
    expect(statusAmpMult(two, "hoa")).toBeCloseTo(1.1, 12);
    expect(statusAmpMult(two, "kim")).toBeCloseTo(1.25, 12);
    // phần tử rác trong danh sách không làm hỏng
    expect(
      statusAmpMult([null, 5, "x", ["amp_hoa", 1000, 0.2]] as unknown as StatusEntry[], "hoa"),
    ).toBeCloseTo(1.2, 12);
  });
});

describe("phù giảm hồi chiêu (cdr_phu)", () => {
  it("là trạng thái CÓ LỢI loại cdr, 60 giây, ratio tối đa 0,15 (<= CDR_CAP / 2: cộng trang bị vẫn kẹp CDR_CAP)", () => {
    const def = statusOf("cdr_phu")!;
    expect(def.kind).toBe("cdr");
    expect(def.harmful).toBe(false);
    expect(def.maxMs).toBe(AMP_MAX_MS);
    expect(def.maxRatio).toBe(0.15);
    expect(def.maxRatio).toBeLessThanOrEqual(CDR_CAP / 2);
  });

  it("statusCdr: ratio còn hiệu lực (kẹp 0..0,15); không có / hết hạn / hỏng thì 0", () => {
    expect(statusCdr([])).toBe(0);
    expect(statusCdr([["cdr_phu", 5000, 0.1]])).toBeCloseTo(0.1, 12);
    expect(statusCdr([["cdr_phu", 5000, 5]])).toBe(0.15);
    expect(statusCdr([["cdr_phu", 0, 0.1]])).toBe(0);
    expect(statusCdr([["cdr_phu", 5000, -1]])).toBe(0);
    expect(statusCdr([["cdr_phu", 5000, Number.NaN]])).toBe(0);
    expect(statusCdr([["amp_hoa", 5000, 0.2]])).toBe(0); // không nhầm với phù khác
    expect(statusCdr([["dao_ho", 5000, 0.2]])).toBe(0);
  });

  it("cộng với trang bị rồi kẹp CDR_CAP ở skillCooldownMs (phù không phá trần)", () => {
    const def = { cooldown: 10_000 } as Parameters<typeof skillCooldownMs>[0];
    const equip = 0.25;
    const total = skillCooldownMs(def, 1, equip + statusCdr([["cdr_phu", 5000, 0.15]]));
    expect(total).toBe(skillCooldownMs(def, 1, CDR_CAP)); // 0,25 + 0,15 = 0,4 > 0,3: kẹp
    expect(total).toBeLessThan(skillCooldownMs(def, 1, equip));
  });
});

describe("đưa phù qua các hàm dùng chung", () => {
  it("statusCarriesRatio: amp / cdr mang ratio (client hiện +X% / -X% trên chip)", () => {
    for (const el of AMP_ELEMENTS) expect(statusCarriesRatio(`amp_${el}`)).toBe(true);
    expect(statusCarriesRatio("cdr_phu")).toBe(true);
  });

  it("sanitizeStatusList giữ ratio của phù (kẹp maxRatio), vẫn tối đa MAX_STATUSES", () => {
    const out = sanitizeStatusList([
      ["amp_loi", 59_000, 0.2],
      ["cdr_phu", 1_000_000, 9],
    ]);
    expect(out).toEqual([
      ["amp_loi", 59_000, 0.2],
      ["cdr_phu", AMP_MAX_MS, 0.15],
    ]);
  });

  it("clampStatusEffect nhận phù: ms <= 60 giây, ratio <= maxRatio; id amp lạ bị từ chối", () => {
    expect(clampStatusEffect({ id: "amp_hoa", ratio: 5, ms: 1e9 })).toEqual({
      id: "amp_hoa",
      ratio: AMP_MAX_RATIO,
      ms: AMP_MAX_MS,
    });
    expect(clampStatusEffect({ id: "cdr_phu", ratio: 0.1, ms: 30_000 })).toEqual({
      id: "cdr_phu",
      ratio: 0.1,
      ms: 30_000,
    });
    expect(clampStatusEffect({ id: "amp_none", ratio: 0.1, ms: 30_000 })).toBeNull();
  });

  it("id cũ không đổi thứ tự: phù thêm CUỐI bảng, sau dao_ho", () => {
    const ids = STATUSES.map((s) => s.id);
    const at = ids.indexOf("dao_ho");
    expect(at).toBe(9);
    expect(ids.slice(at + 1)).toEqual([...AMP_ELEMENTS.map((e) => `amp_${e}`), "cdr_phu"]);
  });
});
