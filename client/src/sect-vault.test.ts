import { describe, expect, it } from "vitest";
import {
  ITEM_BY_ID,
  SECT_VAULT_DRAW_MAX,
  SECT_VAULT_LOG_MAX,
  SECT_VAULT_SLOTS,
  SECT_VAULT_SLOTS_MAX,
  type InvSlot,
  type SectVaultView,
} from "@tien-gioi/shared";
import {
  VAULT_LARGE_QTY,
  clampQty,
  depositBlock,
  drawPerDayOptions,
  drawSummary,
  maxDepositQty,
  maxWithdrawQty,
  planDeposit,
  planStillValid,
  planWithdraw,
  sanitizeVaultView,
  vaultBlockText,
  vaultHasRoom,
  vaultLockedNote,
  vaultLogLine,
  withdrawBlock,
} from "./sect-vault";

const POTION = "hoi_huyet_dan"; // đan thường, chồng 20
const BIG = "dai_hoi_huyet_dan"; // đồ quý (bậc 2)
const SWORD = "lang_nha_kiem"; // trang bị

const emptyVault = (over: Partial<SectVaultView> = {}): SectVaultView => ({
  slots: Array.from({ length: SECT_VAULT_SLOTS }, () => null),
  log: [],
  drawPerDay: 3,
  myDrawsLeft: null,
  lockMs: 0,
  ...over,
});
const withSlots = (slots: Record<number, InvSlot>, over: Partial<SectVaultView> = {}) => {
  const v = emptyVault(over);
  for (const [i, s] of Object.entries(slots)) v.slots[Number(i)] = s;
  return v;
};
const bag = (...s: (InvSlot | null)[]): (InvSlot | null)[] => s;

describe("sanitizeVaultView: không tin ảnh chụp của máy chủ", () => {
  it("ảnh hợp lệ giữ nguyên; luôn đúng SECT_VAULT_SLOTS ô", () => {
    const v = sanitizeVaultView(withSlots({ 0: { itemId: POTION, qty: 5 } }))!;
    expect(v.slots).toHaveLength(SECT_VAULT_SLOTS);
    expect(v.slots[0]).toEqual({ itemId: POTION, qty: 5 });
    expect(v.slots[1]).toBeNull();
  });

  it("M8: `unlocked` quyết định số ô (kẹp 40..80); thiếu / hỏng thì 40; mảng dài hơn mà không có `unlocked` bị cắt về 40", () => {
    const slotsOf = (n: number) =>
      Array.from({ length: n }, (_, i) => (i === 45 ? { itemId: POTION, qty: 2 } : null));
    const mk = (raw: Record<string, unknown>) =>
      sanitizeVaultView({ log: [], drawPerDay: 3, myDrawsLeft: null, lockMs: 0, ...raw })!;
    const v50 = mk({ slots: slotsOf(50), unlocked: 50 });
    expect(v50.slots).toHaveLength(50);
    expect(v50.unlocked).toBe(50);
    expect(v50.slots[45]).toEqual({ itemId: POTION, qty: 2 });
    expect(mk({ slots: slotsOf(80), unlocked: 80 }).slots).toHaveLength(SECT_VAULT_SLOTS_MAX);
    expect(mk({ slots: slotsOf(80), unlocked: 999 }).slots).toHaveLength(SECT_VAULT_SLOTS_MAX);
    expect(mk({ slots: slotsOf(80), unlocked: 10 }).slots).toHaveLength(SECT_VAULT_SLOTS);
    expect(mk({ slots: slotsOf(80), unlocked: Number.NaN }).slots).toHaveLength(SECT_VAULT_SLOTS);
    expect(mk({ slots: slotsOf(80), unlocked: "80" }).slots).toHaveLength(SECT_VAULT_SLOTS);
    expect(mk({ slots: slotsOf(80) }).slots).toHaveLength(SECT_VAULT_SLOTS); // thiếu unlocked: máy chủ cũ
    expect(mk({ slots: slotsOf(80) }).unlocked).toBe(SECT_VAULT_SLOTS);
    // máy chủ nói 50 ô mở mà gửi thiếu mảng: bù ô trống đủ 50
    expect(mk({ slots: slotsOf(40), unlocked: 50 }).slots).toHaveLength(50);
    // ô vượt `unlocked` bị cắt (không vẽ ô khoá như ô dùng được)
    expect(mk({ slots: slotsOf(80), unlocked: 50 }).slots).toHaveLength(50);
  });

  it("vaultLockedNote: nêu số ô còn khoá và cấp tông mở thêm (lấy từ bảng cấp); mở hết thì rỗng; số hỏng coi như 40 ô", () => {
    expect(vaultLockedNote(SECT_VAULT_SLOTS_MAX)).toBe("");
    expect(vaultLockedNote(SECT_VAULT_SLOTS_MAX + 5)).toBe("");
    const n40 = vaultLockedNote(40);
    expect(n40).toContain("Còn 40 ô chưa mở");
    expect(n40).toContain("cấp tông 2");
    expect(n40).toContain("mở thêm 10 ô");
    const n50 = vaultLockedNote(50);
    expect(n50).toContain("Còn 30 ô chưa mở");
    expect(n50).toContain("cấp tông 3");
    expect(vaultLockedNote(70)).toContain("cấp tông 5");
    expect(vaultLockedNote(Number.NaN)).toBe(n40);
    expect(vaultLockedNote(-5)).toContain("Còn 80 ô chưa mở"); // âm: coi như 0 ô mở
  });

  it("thiếu ô thì bù ô trống; thừa ô thì cắt; món lạ / độc / số lượng hỏng thành ô trống, qty kẹp theo chồng", () => {
    const v = sanitizeVaultView({
      slots: [
        { itemId: "khong_co_that", qty: 3 },
        { itemId: "constructor", qty: 1 },
        { itemId: "__proto__", qty: 1 },
        { itemId: POTION, qty: -4 },
        { itemId: POTION, qty: Number.NaN },
        { itemId: POTION, qty: 10 ** 9 },
        null,
        "x",
        ...Array.from({ length: 100 }, () => ({ itemId: POTION, qty: 1 })),
      ],
      log: [],
      drawPerDay: 3,
      myDrawsLeft: null,
      lockMs: 0,
    })!;
    expect(v.slots).toHaveLength(SECT_VAULT_SLOTS);
    expect(v.slots.slice(0, 5)).toEqual([null, null, null, null, null]);
    expect(v.slots[5]).toEqual({ itemId: POTION, qty: ITEM_BY_ID[POTION].stack });
    expect(v.slots[6]).toBeNull();
    expect(v.slots[7]).toBeNull();
  });

  it("drawPerDay kẹp [0, MAX]; myDrawsLeft null hoặc số nguyên >= 0; lockMs không âm", () => {
    expect(sanitizeVaultView({ ...emptyVault(), drawPerDay: 99 })!.drawPerDay).toBe(
      SECT_VAULT_DRAW_MAX,
    );
    expect(sanitizeVaultView({ ...emptyVault(), drawPerDay: -3 })!.drawPerDay).toBe(0);
    expect(sanitizeVaultView({ ...emptyVault(), drawPerDay: "x" })!.drawPerDay).toBe(0);
    expect(sanitizeVaultView({ ...emptyVault(), myDrawsLeft: 2.9 })!.myDrawsLeft).toBe(2);
    expect(sanitizeVaultView({ ...emptyVault(), myDrawsLeft: -1 })!.myDrawsLeft).toBeNull();
    expect(sanitizeVaultView({ ...emptyVault(), myDrawsLeft: Number.NaN })!.myDrawsLeft).toBeNull();
    expect(sanitizeVaultView({ ...emptyVault(), lockMs: -5 })!.lockMs).toBe(0);
    expect(sanitizeVaultView({ ...emptyVault(), lockMs: 120_000 })!.lockMs).toBe(120_000);
  });

  it("sổ: bỏ dòng hỏng, tối đa SECT_VAULT_LOG_MAX dòng, tên bị cắt", () => {
    const good = { at: 1, name: "A", kind: "deposit", itemId: POTION, qty: 2 };
    const v = sanitizeVaultView({
      ...emptyVault(),
      log: [
        good,
        { ...good, kind: "steal" },
        { ...good, itemId: "constructor" },
        { ...good, qty: 0 },
        { ...good, name: 5 },
        ...Array.from({ length: 200 }, () => ({ ...good, name: "x".repeat(200) })),
      ],
    })!;
    expect(v.log).toHaveLength(SECT_VAULT_LOG_MAX);
    expect(v.log[0]).toEqual(good);
    expect(v.log[1].name.length).toBeLessThanOrEqual(40);
  });

  it("không phải đối tượng: null", () => {
    for (const raw of [null, undefined, 5, "x", true]) expect(sanitizeVaultView(raw)).toBeNull();
  });
});

describe("Góp: nút bấm được hay không, vì sao", () => {
  it("ô túi trống / món không có: 'empty'; kho đầy: 'vault_full'; còn chỗ: null", () => {
    const v = emptyVault();
    expect(depositBlock(v, bag(null), 0)).toBe("empty");
    expect(depositBlock(v, bag({ itemId: POTION, qty: 3 }), 5)).toBe("empty");
    expect(depositBlock(v, bag({ itemId: POTION, qty: 3 }), 0)).toBeNull();
    const full = emptyVault({
      slots: Array.from({ length: SECT_VAULT_SLOTS }, () => ({ itemId: SWORD, qty: 1 })),
    });
    expect(depositBlock(full, bag({ itemId: POTION, qty: 3 }), 0)).toBe("vault_full");
  });

  it("vaultHasRoom: ô cùng món còn chỗ trong chồng cũng được; đầy chồng thì không", () => {
    const stack = ITEM_BY_ID[POTION].stack;
    const full = emptyVault({
      slots: Array.from({ length: SECT_VAULT_SLOTS }, () => ({ itemId: POTION, qty: stack })),
    });
    expect(vaultHasRoom(full, POTION, 1)).toBe(false);
    full.slots[3] = { itemId: POTION, qty: stack - 2 };
    expect(vaultHasRoom(full, POTION, 2)).toBe(true);
    expect(vaultHasRoom(full, POTION, 3)).toBe(false);
    expect(vaultHasRoom(full, "constructor", 1)).toBe(false);
  });

  it("maxDepositQty: số có trong ô túi (0 nếu trống / chỉ số hỏng)", () => {
    expect(maxDepositQty(bag({ itemId: POTION, qty: 7 }), 0)).toBe(7);
    expect(maxDepositQty(bag(null), 0)).toBe(0);
    expect(maxDepositQty(bag({ itemId: POTION, qty: 7 }), -1)).toBe(0);
    expect(maxDepositQty(bag({ itemId: POTION, qty: 7 }), 1.5)).toBe(0);
  });
});

describe("Rút: nút bấm được hay không, vì sao", () => {
  const v = withSlots({ 0: { itemId: POTION, qty: 15 } });

  it("Tông chủ / Trưởng lão: rút tự do tới hết ô; ô trống 'empty'", () => {
    expect(withdrawBlock(v, "chu", 0)).toBeNull();
    expect(maxWithdrawQty(v, "chu", 0)).toBe(15);
    expect(maxWithdrawQty(v, "truong_lao", 0)).toBe(15);
    expect(withdrawBlock(v, "chu", 1)).toBe("empty");
    expect(maxWithdrawQty(v, "chu", 1)).toBe(0);
  });

  it("Đệ tử: tối đa 10 món / lượt; hết lượt 'no_draws'; Tông chủ đặt 0 lượt thì 'no_draws'", () => {
    const d = withSlots({ 0: { itemId: POTION, qty: 15 } }, { myDrawsLeft: 2 });
    expect(withdrawBlock(d, "de_tu", 0)).toBeNull();
    expect(maxWithdrawQty(d, "de_tu", 0)).toBe(10);
    expect(withdrawBlock({ ...d, myDrawsLeft: 0 }, "de_tu", 0)).toBe("no_draws");
    expect(withdrawBlock({ ...d, myDrawsLeft: 0, drawPerDay: 0 }, "de_tu", 0)).toBe("no_draws");
  });

  it("cờ kiếp mới (lockMs > 0): 'locked' kể cả Tông chủ; không biết chức vụ: 'no_rank'", () => {
    expect(withdrawBlock({ ...v, lockMs: 1000 }, "chu", 0)).toBe("locked");
    expect(withdrawBlock(v, null, 0)).toBe("no_rank");
  });

  it("mọi lý do đều có câu tiếng Việt, không chữ Hán", () => {
    for (const b of [
      "no_selection",
      "empty",
      "denied",
      "vault_full",
      "no_draws",
      "locked",
      "no_rank",
    ] as const) {
      const t = vaultBlockText(b);
      expect(t.length).toBeGreaterThan(5);
      expect(/[\u3400-\u9fff]/.test(t)).toBe(false); // không chữ Hán (viết bằng \u để tệp không chứa ký tự CJK)
    }
  });
});

describe("clampQty / drawSummary / drawPerDayOptions", () => {
  it("clampQty kẹp [1, max]; số hỏng -> 1; max < 1 -> 0", () => {
    expect(clampQty(5, 10)).toBe(5);
    expect(clampQty(0, 10)).toBe(1);
    expect(clampQty(99, 10)).toBe(10);
    expect(clampQty(Number.NaN, 10)).toBe(1);
    expect(clampQty("3", 10)).toBe(1);
    expect(clampQty(3.9, 10)).toBe(3);
    expect(clampQty(3, 0)).toBe(0);
    expect(clampQty(3, Number.NaN)).toBe(0);
  });

  it("drawSummary: không hạn / còn lượt / chưa cho rút / kiếp mới", () => {
    expect(drawSummary(emptyVault({ myDrawsLeft: null }), "chu")).toBe("Lượt rút: không hạn.");
    expect(drawSummary(emptyVault({ myDrawsLeft: 2, drawPerDay: 3 }), "de_tu")).toBe(
      "Lượt rút hôm nay: còn 2 / 3.",
    );
    expect(drawSummary(emptyVault({ myDrawsLeft: 0, drawPerDay: 0 }), "de_tu")).toMatch(
      /chưa cho Đệ tử rút/,
    );
    expect(drawSummary(emptyVault({ lockMs: 90_000 }), "chu")).toMatch(/còn khoảng 2 phút/);
  });

  it("drawPerDayOptions: 0..SECT_VAULT_DRAW_MAX", () => {
    const o = drawPerDayOptions();
    expect(o[0]).toBe(0);
    expect(o[o.length - 1]).toBe(SECT_VAULT_DRAW_MAX);
    expect(o).toHaveLength(SECT_VAULT_DRAW_MAX + 1);
  });
});

describe("planDeposit: kế hoạch góp + hộp xác nhận", () => {
  const v = emptyVault();
  it("đồ thường số nhỏ: gửi thẳng {slot, qty}", () => {
    const p = planDeposit(v, bag({ itemId: POTION, qty: 5 }), 0, 3)!;
    expect(p.confirm).toBeNull();
    expect(p.msg).toEqual({ slot: 0, qty: 3 });
    expect(p.type).toBe("deposit");
  });

  it("đồ quý, trang bị hoặc số lớn (>= VAULT_LARGE_QTY): có hộp nêu tên + số lượng", () => {
    const q = planDeposit(v, bag({ itemId: BIG, qty: 4 }), 0, 4)!;
    expect(q.confirm?.text).toBe("Góp Đại Hồi Huyết Đan ×4 vào kho tông môn?");
    expect(q.confirm?.warn).toMatch(/Đồ quý/);
    const e = planDeposit(v, bag({ itemId: SWORD, qty: 1 }), 0, 1)!;
    expect(e.confirm?.text).toBe("Góp Lang Nha Kiếm vào kho tông môn?");
    const n = planDeposit(v, bag({ itemId: POTION, qty: 20 }), 0, VAULT_LARGE_QTY)!;
    expect(n.confirm?.warn).toMatch(/Số lượng lớn/);
    expect(
      planDeposit(v, bag({ itemId: POTION, qty: 20 }), 0, VAULT_LARGE_QTY - 1)!.confirm,
    ).toBeNull();
  });

  it("không góp được / số hỏng: null", () => {
    expect(planDeposit(v, bag(null), 0, 1)).toBeNull();
    expect(planDeposit(v, bag({ itemId: POTION, qty: 5 }), 0, 6)).toBeNull();
    expect(planDeposit(v, bag({ itemId: POTION, qty: 5 }), 0, 0)).toBeNull();
    expect(planDeposit(v, bag({ itemId: POTION, qty: 5 }), 0, 1.5)).toBeNull();
    expect(planDeposit(v, bag({ itemId: POTION, qty: 5 }), 0, Number.NaN)).toBeNull();
  });
});

describe("planWithdraw: kế hoạch rút + khoá kỳ vọng itemId", () => {
  const v = withSlots({ 2: { itemId: POTION, qty: 15 }, 3: { itemId: BIG, qty: 2 } });

  it("Tông chủ rút đồ thường số nhỏ: gửi thẳng, KÈM itemId đang thấy", () => {
    const p = planWithdraw(v, "chu", 2, 3)!;
    expect(p.confirm).toBeNull();
    expect(p.msg).toEqual({ slot: 2, itemId: POTION, qty: 3 });
  });

  it("Đệ tử luôn có hộp (tốn lượt) nêu lượt còn lại; đồ quý / số lớn cũng có hộp", () => {
    const d = { ...v, myDrawsLeft: 2, drawPerDay: 3 };
    const p = planWithdraw(d, "de_tu", 2, 1)!;
    expect(p.confirm?.text).toBe("Rút Hồi Huyết Đan từ kho tông môn?");
    expect(p.confirm?.warn).toBe("Tốn 1 lượt rút (còn 2 / 3 hôm nay).");
    expect(planWithdraw(v, "chu", 3, 1)!.confirm?.warn).toMatch(/Đồ quý/);
    expect(planWithdraw(v, "chu", 2, VAULT_LARGE_QTY)!.confirm?.warn).toMatch(/Số lượng lớn/);
  });

  it("Đệ tử bị kẹp 10 món / lượt; hết lượt / ô trống / số hỏng: null", () => {
    const d = { ...v, myDrawsLeft: 2, drawPerDay: 3 };
    expect(planWithdraw(d, "de_tu", 2, 11)).toBeNull();
    expect(planWithdraw(d, "de_tu", 2, 10)).not.toBeNull();
    expect(planWithdraw({ ...d, myDrawsLeft: 0 }, "de_tu", 2, 1)).toBeNull();
    expect(planWithdraw(v, "chu", 9, 1)).toBeNull();
    expect(planWithdraw(v, "chu", 2, 0)).toBeNull();
    expect(planWithdraw(v, "chu", 2, 16)).toBeNull();
  });
});

describe("planStillValid: kiểm lại lúc xác nhận", () => {
  it("rút: ô vẫn đúng món + đủ số lượng thì hợp lệ; ô bị người khác lấy / đổi món thì huỷ", () => {
    const v = withSlots({ 2: { itemId: POTION, qty: 15 } });
    const p = planWithdraw(v, "chu", 2, 10)!;
    expect(planStillValid(v, [], p)).toBe(true);
    expect(planStillValid(withSlots({ 2: { itemId: POTION, qty: 9 } }), [], p)).toBe(false);
    expect(planStillValid(withSlots({ 2: { itemId: BIG, qty: 15 } }), [], p)).toBe(false);
    expect(planStillValid(emptyVault(), [], p)).toBe(false);
    expect(planStillValid(null, [], p)).toBe(false);
  });

  it("góp: ô túi vẫn đúng món + đủ số lượng; túi đổi thì huỷ", () => {
    const b = bag({ itemId: POTION, qty: 5 });
    const p = planDeposit(emptyVault(), b, 0, 5)!;
    expect(planStillValid(emptyVault(), b, p)).toBe(true);
    expect(planStillValid(emptyVault(), bag({ itemId: POTION, qty: 4 }), p)).toBe(false);
    expect(planStillValid(emptyVault(), bag({ itemId: BIG, qty: 5 }), p)).toBe(false);
    expect(planStillValid(emptyVault(), bag(null), p)).toBe(false);
  });
});

describe("vaultLogLine", () => {
  it("'hh:mm · Tên đã góp / rút Món ×N'", () => {
    const at = new Date(2026, 10, 16, 9, 5).getTime();
    expect(
      vaultLogLine({ at, name: "Phó Hồng Ngạn", kind: "deposit", itemId: POTION, qty: 5 }),
    ).toBe("09:05 · Phó Hồng Ngạn đã góp Hồi Huyết Đan ×5");
    expect(vaultLogLine({ at, name: "A", kind: "withdraw", itemId: SWORD, qty: 1 })).toBe(
      "09:05 · A đã rút Lang Nha Kiếm",
    );
  });
});
