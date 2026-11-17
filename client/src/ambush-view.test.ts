import { describe, expect, it } from "vitest";
import {
  AMBUSH_ARM_MS,
  AMBUSH_OFFER_MS,
  AMBUSH_RESULTS,
  ITEMS,
  sampleAmbushEnd,
  sampleAmbushOffer,
  type AmbushOfferMsg,
} from "@tien-gioi/shared";
import {
  AMBUSH_DEATH_NOTE,
  AMBUSH_RETRY_MS,
  ambushChoiceForKey,
  ambushDialogView,
  ambushEndToast,
  ambushEndView,
  ambushMarkSeen,
  ambushNeedsSeen,
  ambushRemainingMs,
  chooseAmbush,
  isDangerousTier,
  openAmbush,
  parseAmbushEnd,
  parseAmbushOffer,
} from "./ambush-view";

const T0 = 10_000;
/** Hộp thoại vừa hiện ở T0 với lời đề nghị mẫu (có thể chỉnh giá). */
const open = (patch: Partial<AmbushOfferMsg> = {}) =>
  openAmbush(null, { ...sampleAmbushOffer(), ...patch }, T0).dialog;
/** Đã qua `AMBUSH_ARM_MS`. */
const ARMED = T0 + AMBUSH_ARM_MS;

describe("parseAmbushOffer (không tin tin nhắn)", () => {
  it("lời đề nghị mẫu đi qua nguyên vẹn", () => {
    const m = sampleAmbushOffer("elite");
    expect(parseAmbushOffer(m)).toEqual(m);
  });
  it("sai dạng thì bỏ: không phải object, id sai, thiếu / sai kiểu từng trường", () => {
    const ok = sampleAmbushOffer();
    const bad: unknown[] = [
      null,
      undefined,
      5,
      "x",
      [],
      { ...ok, id: "XYZ" },
      { ...ok, id: "0123456789ABCDEF" }, // chữ hoa: sai dạng
      { ...ok, id: 12 },
      { ...ok, scene: "" },
      { ...ok, scene: 5 },
      { ...ok, foe: null },
      { ...ok, foe: { ...ok.foe, name: "" } },
      { ...ok, foe: { ...ok.foe, tier: "boss" } },
      { ...ok, foe: { ...ok.foe, tier: "constructor" } },
      { ...ok, foe: { ...ok.foe, count: -1 } },
      { ...ok, foe: { ...ok.foe, count: "2" } },
      { ...ok, price: null },
      { ...ok, price: { ...ok.price, exp: -5 } },
      { ...ok, price: { ...ok.price, exp: NaN } },
      { ...ok, price: { ...ok.price, coin: null } },
      { ...ok, price: { ...ok.price, coin: { price: 5, enough: "yes" } } },
      { ...ok, price: { ...ok.price, coin: { price: Infinity, enough: true } } },
      { ...ok, ms: "5000" },
      { ...ok, ms: NaN },
    ];
    for (const b of bad) expect(parseAmbushOffer(b), JSON.stringify(b)).toBeNull();
  });
  it("kẹp: ms trong [0, AMBUSH_OFFER_MS], số lượng 1..9, giá làm tròn xuống, ký tự điều khiển bị bỏ, trường lạ không lọt", () => {
    const ok = sampleAmbushOffer();
    const p = parseAmbushOffer({
      ...ok,
      extra: "x",
      scene: "Đường\u0000 vắng\n hẳn",
      foe: { name: "Sói\u0007", tier: "normal", count: 99, evil: 1 },
      price: { exp: 12.9, coin: { price: 30.7, enough: true }, free: true },
      ms: 999_999,
    })!;
    expect(p.ms).toBe(AMBUSH_OFFER_MS);
    expect(p.foe.count).toBe(9);
    expect(p.price).toEqual({ exp: 12, coin: { price: 30, enough: true } });
    expect(p.scene).not.toMatch(/[\u0000-\u001f]/);
    expect(p.foe.name).not.toMatch(/[\u0000-\u001f]/);
    expect(Object.keys(p).sort()).toEqual(["foe", "id", "ms", "price", "scene"]);
    expect(parseAmbushOffer({ ...ok, ms: -50 })!.ms).toBe(0);
    expect(parseAmbushOffer({ ...ok, foe: { ...ok.foe, count: 0 } })!.foe.count).toBe(1);
  });
});

describe("parseAmbushEnd", () => {
  it("mọi kết cục mẫu đi qua; kết cục lạ / sai dạng bị bỏ", () => {
    for (const r of AMBUSH_RESULTS)
      expect(parseAmbushEnd(sampleAmbushEnd(r))).toEqual(sampleAmbushEnd(r));
    for (const b of [null, 5, "won", [], {}, { result: "constructor" }, { result: "WON" }])
      expect(parseAmbushEnd(b), JSON.stringify(b)).toBeNull();
  });
  it("paid / rewards: chỉ số nguyên không âm, tối đa 8 món, đồ sai bị bỏ", () => {
    const p = parseAmbushEnd({
      result: "won",
      paid: { exp: -3, coin: 12.8, x: 1 },
      rewards: {
        exp: 100.9,
        coin: "5",
        items: [
          ...Array.from({ length: 12 }, () => ({ itemId: "nanh_soi", count: 2 })),
          { itemId: 5, count: 1 },
          { itemId: "a", count: -1 },
        ],
      },
    })!;
    expect(p.paid).toEqual({ coin: 12 });
    expect(p.rewards!.exp).toBe(100);
    expect(p.rewards!.coin).toBe(0);
    expect(p.rewards!.items).toHaveLength(8);
    expect(parseAmbushEnd({ result: "fled", paid: { exp: -1 } })).toEqual({ result: "fled" });
  });
});

describe("mở hộp thoại: mới hay cập nhật (nối lại mạng)", () => {
  it("lần đầu / khác id = MỚI: tính AMBUSH_ARM_MS từ lúc hiện, chưa gửi gì", () => {
    const a = openAmbush(null, sampleAmbushOffer(), T0);
    expect(a.fresh).toBe(true);
    expect(a.dialog.shownAt).toBe(T0);
    expect(a.dialog.sent).toBeNull();
    const other = { ...sampleAmbushOffer(), id: "fedcba9876543210" };
    const b = openAmbush(a.dialog, other, T0 + 5000);
    expect(b.fresh).toBe(true);
    expect(b.dialog.shownAt).toBe(T0 + 5000);
  });
  it("cùng id = CẬP NHẬT: giữ shownAt và lựa chọn đã gửi, làm mới đồng hồ, đặt lại seenSent để gửi lại ambushSeen", () => {
    let d = open();
    d = ambushMarkSeen(d);
    d = chooseAmbush(d, "fight", ARMED).dialog;
    const upd = openAmbush(d, { ...sampleAmbushOffer(), ms: 4000 }, ARMED + 30_000);
    expect(upd.fresh).toBe(false);
    expect(upd.dialog.shownAt).toBe(T0); // KHÔNG khoá lại 700 ms
    expect(upd.dialog.sent).toEqual({ choice: "fight", at: ARMED });
    expect(upd.dialog.msAtRecv).toBe(4000);
    expect(upd.dialog.recvAt).toBe(ARMED + 30_000);
    expect(upd.dialog.seenSent).toBe(false);
  });
});

describe("đồng hồ", () => {
  it("đếm ngược theo khoảng trôi từ lúc nhận; không âm; đồng hồ lùi không làm tăng", () => {
    const d = open();
    expect(ambushRemainingMs(d, T0)).toBe(AMBUSH_OFFER_MS);
    expect(ambushRemainingMs(d, T0 + 3000)).toBe(AMBUSH_OFFER_MS - 3000);
    expect(ambushRemainingMs(d, T0 + AMBUSH_OFFER_MS + 999)).toBe(0);
    expect(ambushRemainingMs(d, T0 - 5000)).toBe(AMBUSH_OFFER_MS); // lùi: coi như chưa trôi
  });
  it("hết giờ cục bộ mà chưa chọn: 'đang chờ máy chủ', KHÔNG tự chọn (không có tin nào để gửi)", () => {
    const d = open();
    const v = ambushDialogView(d, T0 + AMBUSH_OFFER_MS + 1);
    expect(v.waitingServer).toBe(true);
    expect(v.countdown).toBe("Đang chờ máy chủ…");
    expect(v.note).toBe("Đang chờ máy chủ…");
    const v0 = ambushDialogView(d, T0 + 2000);
    expect(v0.waitingServer).toBe(false);
    expect(v0.countdown).toBe("00:08");
  });
  it("đã gửi lựa chọn rồi hết giờ thì KHÔNG phải 'chờ máy chủ vì hết giờ' (đang xử lý)", () => {
    const d = chooseAmbush(open(), "flee_coin", ARMED).dialog;
    const v = ambushDialogView(d, T0 + AMBUSH_OFFER_MS + 1);
    expect(v.waitingServer).toBe(false);
  });
});

describe("nút: giá, khoá, AMBUSH_ARM_MS", () => {
  it("giá hiện trên nút LÀ giá trong tin (tu vi / Linh thạch), không tự tính", () => {
    const d = open({ price: { exp: 12_345, coin: { price: 77, enough: true } } });
    const v = ambushDialogView(d, ARMED);
    expect(v.buttons.map((b) => b.choice)).toEqual(["fight", "flee_coin", "flee_exp"]);
    expect(v.buttons[1].sub).toBe("77 Linh thạch");
    expect(v.buttons[2].sub).toBe("12.345 tu vi");
    expect(v.buttons[1].aria).toContain("77 Linh thạch");
    expect(v.buttons[2].aria).toContain("12.345 tu vi");
  });
  it("còn khoá AMBUSH_ARM_MS: cả ba nút mờ và KHÔNG gửi gì; đủ AMBUSH_ARM_MS thì nhận", () => {
    const d = open();
    for (const c of ["fight", "flee_coin", "flee_exp"] as const) {
      expect(chooseAmbush(d, c, T0).send).toBeNull();
      expect(chooseAmbush(d, c, ARMED - 1).send).toBeNull();
      expect(chooseAmbush(d, c, ARMED).send).toEqual({ id: d.offer.id, choice: c });
    }
    expect(ambushDialogView(d, T0).arming).toBe(true);
    expect(ambushDialogView(d, T0).buttons.every((b) => !b.enabled)).toBe(true);
    expect(ambushDialogView(d, ARMED).arming).toBe(false);
    expect(ambushDialogView(d, ARMED).buttons.every((b) => b.enabled)).toBe(true);
  });
  it("không đủ Linh thạch: nút mờ nhưng VẪN hiện giá và nói rõ; bấm không gửi gì", () => {
    const d = open({ price: { exp: 420, coin: { price: 90, enough: false } } });
    const v = ambushDialogView(d, ARMED);
    expect(v.buttons[1].enabled).toBe(false);
    expect(v.buttons[1].sub).toBe("90 Linh thạch (không đủ)");
    expect(v.buttons[1].aria).toContain("Không đủ Linh thạch");
    expect(chooseAmbush(d, "flee_coin", ARMED).send).toBeNull();
    expect(v.buttons[2].enabled).toBe(true); // tu vi vẫn dùng được
  });
  it("thanh tu vi trống (giá 0): nút tu vi KHOÁ, KHÔNG hiện 'miễn phí' / '0 tu vi'; chỉ còn Linh thạch và Chiến", () => {
    const d = open({ price: { exp: 0, coin: { price: 30, enough: true } } });
    const v = ambushDialogView(d, ARMED);
    expect(v.buttons[2].enabled).toBe(false);
    expect(v.buttons[2].sub).toBe("Thanh tu vi trống");
    expect(JSON.stringify(v)).not.toMatch(/miễn phí|\b0 tu vi/i);
    expect(chooseAmbush(d, "flee_exp", ARMED).send).toBeNull();
    expect(chooseAmbush(d, "flee_coin", ARMED).send).not.toBeNull();
    expect(chooseAmbush(d, "fight", ARMED).send).not.toBeNull();
  });
  it("câu đọc màn hình chỉ nêu cách bỏ chạy DÙNG ĐƯỢC (không '0 tu vi', không mời trả Linh thạch khi không đủ)", () => {
    const both = ambushDialogView(
      open({ price: { exp: 50, coin: { price: 9, enough: true } } }),
      ARMED,
    );
    expect(both.announce).toContain("bỏ chạy trả 9 Linh thạch hay 50 tu vi");
    const noExp = ambushDialogView(
      open({ price: { exp: 0, coin: { price: 9, enough: true } } }),
      ARMED,
    );
    expect(noExp.announce).toContain("bỏ chạy trả 9 Linh thạch.");
    expect(noExp.announce).not.toContain("tu vi.");
    const noCoin = ambushDialogView(
      open({ price: { exp: 50, coin: { price: 9, enough: false } } }),
      ARMED,
    );
    expect(noCoin.announce).toContain("bỏ chạy trả 50 tu vi.");
    expect(noCoin.announce).not.toContain("Linh thạch");
    const none = ambushDialogView(
      open({ price: { exp: 0, coin: { price: 9, enough: false } } }),
      ARMED,
    );
    expect(none.announce).toContain("không đủ để trả giá");
  });
  it("văn mẫu, tên kẻ địch kèm mức và số lượng", () => {
    const v = ambushDialogView(open(), ARMED);
    expect(v.scene).toBe(sampleAmbushOffer().scene);
    expect(v.foe).toBe("Sói Hoang · Thường × 2");
    expect(ambushDialogView(open(sampleAmbushOffer("leader")), ARMED).foe).toBe(
      "Đạo Tặc Đầu Lĩnh · Cầm đầu",
    );
    expect(v.announce).toContain("hết giờ là Chiến");
  });
});

describe("gửi lựa chọn", () => {
  it("tin gửi CHỈ có id + choice (không số nào, không trường thừa)", () => {
    const { send } = chooseAmbush(open(), "flee_coin", ARMED);
    expect(Object.keys(send!).sort()).toEqual(["choice", "id"]);
  });
  it("lựa chọn lạ / độc không gửi", () => {
    for (const c of ["", "FIGHT", "constructor", "__proto__", 5, null, undefined, {}])
      expect(chooseAmbush(open(), c, ARMED).send, String(c)).toBeNull();
  });
  it("gửi rồi thì khoá (không gửi hai lần), hiện 'Đang xử lý…'", () => {
    const first = chooseAmbush(open(), "flee_exp", ARMED);
    expect(first.send).not.toBeNull();
    expect(chooseAmbush(first.dialog, "fight", ARMED + 100).send).toBeNull();
    expect(chooseAmbush(first.dialog, "flee_exp", ARMED + 100).send).toBeNull();
    const v = ambushDialogView(first.dialog, ARMED + 100);
    expect(v.busy).toBe(true);
    expect(v.note).toBe("Đang xử lý…");
    expect(v.buttons.every((b) => !b.enabled)).toBe(true);
  });
  it("quá AMBUSH_RETRY_MS chưa có kết cục (lưu hỏng ở máy chủ không báo gì): mở lại nút cho bấm lại", () => {
    const first = chooseAmbush(open(), "flee_coin", ARMED);
    const late = ARMED + AMBUSH_RETRY_MS;
    expect(chooseAmbush(first.dialog, "flee_coin", late - 1).send).toBeNull();
    const v = ambushDialogView(first.dialog, late);
    expect(v.busy).toBe(false);
    expect(v.note).toBe("Chưa có phản hồi, hãy thử lại.");
    expect(v.buttons.every((b) => b.enabled)).toBe(true);
    const again = chooseAmbush(first.dialog, "flee_coin", late);
    expect(again.send).toEqual({ id: first.dialog.offer.id, choice: "flee_coin" });
    expect(again.dialog.sent!.at).toBe(late); // thử lại tính từ lần mới
  });
});

describe("ambushSeen: gửi khi hộp thoại hiện và trang đang hiển thị, gửi lại sau nối lại", () => {
  it("trang ẩn thì chưa gửi; đã gửi thì thôi; cập nhật cùng id (nối lại) thì gửi lại", () => {
    let d = open();
    expect(ambushNeedsSeen(d, false)).toBe(false);
    expect(ambushNeedsSeen(d, true)).toBe(true);
    d = ambushMarkSeen(d);
    expect(ambushNeedsSeen(d, true)).toBe(false);
    d = openAmbush(d, sampleAmbushOffer(), T0 + 20_000).dialog;
    expect(ambushNeedsSeen(d, true)).toBe(true);
  });
});

describe("kết cục", () => {
  it("huỷ lặng lẽ: KHÔNG hiện gì (không mất gì)", () => {
    expect(ambushEndView({ result: "canceled" }).silent).toBe(true);
    expect(ambushEndToast({ result: "canceled" })).toBe("");
  });
  it("bỏ chạy: nói đúng cái giá đã trừ (Linh thạch / tu vi / cả hai / không mất gì)", () => {
    expect(ambushEndToast({ result: "fled", paid: { coin: 30 } })).toBe(
      "Bỏ chạy thành công. Mất 30 Linh thạch.",
    );
    expect(ambushEndToast({ result: "fled", paid: { exp: 1234 } })).toBe(
      "Bỏ chạy thành công. Mất 1.234 tu vi.",
    );
    expect(ambushEndToast({ result: "fled", paid: { coin: 5, exp: 7 } })).toBe(
      "Bỏ chạy thành công. Mất 5 Linh thạch và 7 tu vi.",
    );
    expect(ambushEndToast({ result: "fled" })).toBe("Bỏ chạy thành công. Không mất gì.");
    expect(ambushEndView({ result: "fled", paid: { coin: 1 } }).tone).toBe("info");
  });
  it("thắng: thưởng tu vi / Linh thạch / đồ có tên; id đồ lạ KHÔNG lộ ra", () => {
    const some = ITEMS[0];
    const v = ambushEndView({
      result: "won",
      rewards: {
        exp: 360,
        coin: 48,
        items: [
          { itemId: some.id, count: 2 },
          { itemId: "id_la_cua_ban_moi", count: 1 },
        ],
      },
    });
    expect(v.tone).toBe("good");
    expect(v.lines).toContain("+360 tu vi");
    expect(v.lines).toContain("+48 Linh thạch");
    expect(v.lines).toContain(`${some.name} × 2`);
    expect(v.lines).toContain("vật phẩm mới");
    expect(JSON.stringify(v)).not.toContain("id_la_cua_ban_moi");
    expect(ambushEndView({ result: "won" }).lines).toEqual([]); // thiếu rewards: không ném lỗi
  });
  it("thua / hết giờ / rớt mạng quá hạn: giọng xấu, nói cái giá; không có giá thì không bịa", () => {
    expect(ambushEndView({ result: "lost", paid: { exp: 840 } })).toEqual({
      silent: false,
      tone: "bad",
      title: "Bị hạ",
      lines: ["Mất 840 tu vi."],
    });
    expect(ambushEndView({ result: "timeout", paid: { exp: 1 } }).title).toBe("Hết giờ");
    expect(ambushEndView({ result: "dropped", paid: { exp: 1 } }).title).toBe(
      "Mất kết nối quá lâu",
    );
    expect(ambushEndView({ result: "lost" }).lines).toEqual([]);
    expect(ambushEndView({ result: "lost", paid: { coin: 0, exp: 0 } }).lines).toEqual([]);
  });
  it("mọi kết cục đều dựng được chữ", () => {
    for (const r of AMBUSH_RESULTS) {
      const v = ambushEndView(sampleAmbushEnd(r));
      expect(v.silent ? r : v.title, r).toBeTruthy();
    }
  });
});

describe("phím trong hộp thoại", () => {
  it("Enter / Y = Chiến; KHÔNG phím chữ cái hay số nào khác chọn gì (nhất là bỏ chạy: mất tu vi / Linh thạch)", () => {
    expect(ambushChoiceForKey("Enter")).toBe("fight");
    expect(ambushChoiceForKey("NumpadEnter")).toBe("fight");
    expect(ambushChoiceForKey("KeyY")).toBe("fight");
    const others = [
      ...Array.from({ length: 26 }, (_, i) => `Key${String.fromCharCode(65 + i)}`).filter(
        (k) => k !== "KeyY",
      ),
      ...Array.from({ length: 10 }, (_, i) => `Digit${i}`),
      "Escape",
      "Space",
      "Tab",
      "ArrowUp",
      "Backspace",
      "",
      undefined,
      5,
    ];
    for (const k of others) expect(ambushChoiceForKey(k), String(k)).toBeNull();
  });
});

describe("MỤC 53: chết thật trong đấu trường", () => {
  it("parseAmbushEnd: `died` chỉ giữ khi đúng `true` VÀ kết cục là `lost`", () => {
    expect(parseAmbushEnd({ result: "lost", died: true })).toEqual({ result: "lost", died: true });
    for (const bad of ["true", 1, "yes", null, {}, [], false]) {
      const r = parseAmbushEnd({ result: "lost", died: bad });
      expect(r, String(bad)).toEqual({ result: "lost" });
    }
    // chết thật chỉ có nghĩa với `lost`: các kết cục khác bỏ trường
    for (const res of ["won", "fled", "timeout", "dropped", "canceled"])
      expect(parseAmbushEnd({ result: res, died: true })?.died, res).toBeUndefined();
  });

  it("lost + died: 'Ngươi đã gục', KHÔNG dòng 'Mất ...', KHÔNG còn câu 'không mất kiếp'; tone xấu, không im lặng", () => {
    const v = ambushEndView({ result: "lost", died: true });
    expect(v.silent).toBe(false);
    expect(v.tone).toBe("bad");
    expect(v.title).toBe("Ngươi đã gục");
    expect(v.lines).toEqual(["Hoàng Tuyền đang chờ ngươi."]);
    const text = `${v.title} ${v.lines.join(" ")} ${ambushEndToast({ result: "lost", died: true })}`;
    expect(text).not.toMatch(/Mất /);
    expect(text).not.toMatch(/không mất kiếp/i);
    expect(ambushEndToast({ result: "lost", died: true })).toBe(
      "Ngươi đã gục. Hoàng Tuyền đang chờ ngươi.",
    );
  });

  it("lost KHÔNG died (luân hồi tắt: bản thử): vẫn 'Bị hạ' + giá đã trừ như cũ", () => {
    const v = ambushEndView({ result: "lost", paid: { exp: 500 } });
    expect(v.title).toBe("Bị hạ");
    expect(v.lines).toEqual(["Mất 500 tu vi."]);
  });

  it("died thắng paid: nếu máy chủ gửi cả hai (không nên) thì vẫn nói chết thật, không in giá", () => {
    const v = ambushEndView({ result: "lost", died: true, paid: { exp: 500 } });
    expect(v.title).toBe("Ngươi đã gục");
    expect(v.lines.join(" ")).not.toMatch(/500/);
  });
});

describe("MỤC 53: nhãn NGUY HIỂM ở hộp thoại", () => {
  it("chỉ tinh anh và cầm đầu là nguy hiểm", () => {
    expect(isDangerousTier("normal")).toBe(false);
    expect(isDangerousTier("elite")).toBe(true);
    expect(isDangerousTier("leader")).toBe(true);
  });
  it("view: danger theo mức kẻ địch; câu đọc màn hình nhắc 'Nguy hiểm' đúng ở hai mức cao", () => {
    for (const tier of ["normal", "elite", "leader"] as const) {
      const d = openAmbush(null, sampleAmbushOffer(tier), T0).dialog;
      const v = ambushDialogView(d, ARMED);
      expect(v.danger, tier).toBe(tier !== "normal");
      expect(/Nguy hiểm\./.test(v.announce), tier).toBe(tier !== "normal");
    }
  });
});

describe("MỤC 53: dòng 'Bị hạ trong trận là chết thật.' dưới nút Chiến (cả ba mức, luôn hiện)", () => {
  it("hằng số đúng câu A chốt", () => {
    expect(AMBUSH_DEATH_NOTE).toBe("Bị hạ trong trận là chết thật.");
  });
  it("view có dòng này ở MỌI mức, mọi trạng thái (đang khoá, đang xử lý, hết giờ cục bộ)", () => {
    for (const tier of ["normal", "elite", "leader"] as const) {
      const d = openAmbush(null, sampleAmbushOffer(tier), T0).dialog;
      for (const at of [T0, ARMED, ARMED + AMBUSH_OFFER_MS]) {
        const v = ambushDialogView(d, at);
        expect(v.deathNote, `${tier} @${at - T0}`).toBe(AMBUSH_DEATH_NOTE);
      }
      const sent = chooseAmbush(d, "fight", ARMED).dialog;
      expect(ambushDialogView(sent, ARMED + 10).deathNote, `${tier} đã gửi`).toBe(
        AMBUSH_DEATH_NOTE,
      );
    }
  });
  it("người dùng màn hình đọc được: nằm trong câu đọc của hộp thoại và trong aria-label của nút Chiến", () => {
    const v = ambushDialogView(open(), ARMED);
    expect(v.announce).toContain(AMBUSH_DEATH_NOTE);
    expect(v.buttons[0].aria).toContain(AMBUSH_DEATH_NOTE);
  });
  it("không làm lệch các nút khác (bỏ chạy không nhắc chết thật: bỏ chạy là cách tránh)", () => {
    const v = ambushDialogView(open(), ARMED);
    expect(v.buttons[1].aria).not.toContain("chết thật");
    expect(v.buttons[2].aria).not.toContain("chết thật");
  });
});
