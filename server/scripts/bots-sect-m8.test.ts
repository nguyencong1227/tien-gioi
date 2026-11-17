// Kiểm thử quyết định hành vi bot thử tải tông môn M8 (Issue #846, M8.9): decideSectM8Action
import { describe, expect, it } from "vitest";
import type { SectHallView } from "@tien-gioi/shared";
import { decideSectM8Action } from "./bots";

function mockHallView(overrides?: Partial<SectHallView>): SectHallView {
  return {
    now: 1_700_000_000_000,
    resetAt: 1_700_000_000_000 + 86_400_000,
    level: 2,
    points: 1500,
    pointsFrom: 1000,
    pointsNext: 4000,
    buff: { exp: 1.02, drop: 1.02, regen: 1.05 },
    caps: { members: 30, elders: 2, vaultSlots: 10 },
    me: {
      contrib: 20,
      merit: 50,
      earnedToday: 10,
      earnCap: 140,
      depositLeft: 20,
      earnFromAt: 0,
    },
    quests: [
      {
        questId: "st_tru_lang_t0",
        title: "Trừ sói quanh trấn",
        desc: "Hạ Hôi Lang quanh trấn.",
        difficulty: 1,
        ch: 20,
        state: "offer",
      },
      {
        questId: "st_nop_nanh_t0",
        title: "Thu nanh sói",
        desc: "Góp nanh sói.",
        difficulty: 2,
        ch: 30,
        state: "done",
      },
    ],
    shop: [
      {
        itemId: "hoi_huyet_dan",
        cost: 5,
        minLevel: 1,
        limitDay: 10,
        hall: "baoKho",
        left: 8,
        locked: null,
      },
      {
        itemId: "tu_khi_dan",
        cost: 30,
        minLevel: 3,
        limitDay: 2,
        hall: "baoKho",
        left: 2,
        locked: "level",
      },
    ],
    ...overrides,
  };
}

describe("bot thử tải tông môn M8: decideSectM8Action (Issue #846, M8.9)", () => {
  it("trả về null nếu bot chưa gia nhập tông môn (không có sectTag)", () => {
    const res = decideSectM8Action({
      sectTag: undefined,
      sectHall: null,
      sectContrib: 0,
    });
    expect(res).toBeNull();
  });

  it("trả về hallGet nếu bot đã có sectTag nhưng chưa nhận được ảnh chụp Nội Vụ (sectHall = null)", () => {
    const res = decideSectM8Action({
      sectTag: "P01",
      sectHall: null,
      sectContrib: 0,
    });
    expect(res).toEqual({ type: "hallGet" });
  });

  it("ưu tiên nhận nhiệm vụ có sẵn (state = offer) khi chưa đạt trần ngày", () => {
    const hall = mockHallView();
    const res = decideSectM8Action({
      sectTag: "P01",
      sectHall: hall,
      sectContrib: 20,
    });
    expect(res).toEqual({ type: "questAccept", questId: "st_tru_lang_t0" });
  });

  it("không nhận nhiệm vụ nếu hôm nay đã đạt trần cống hiến (earnedToday >= earnCap)", () => {
    const hall = mockHallView({
      me: {
        contrib: 50,
        merit: 140,
        earnedToday: 140,
        earnCap: 140,
        depositLeft: 0,
        earnFromAt: 0,
      },
    });
    // Không nhận quest nữa mà chuyển sang đổi đồ cửa hàng
    const res = decideSectM8Action({
      sectTag: "P01",
      sectHall: hall,
      sectContrib: 50,
    });
    expect(res).toEqual({ type: "shopBuy", itemId: "hoi_huyet_dan", qty: 1 });
  });

  it("trả nhiệm vụ đang làm (state = active) khi không còn nhiệm vụ mới nhận được và chưa đủ cống hiến đổi đồ", () => {
    const hall = mockHallView({
      quests: [
        {
          questId: "st_tru_lang_t0",
          title: "Trừ sói quanh trấn",
          desc: "Hạ Hôi Lang quanh trấn.",
          difficulty: 1,
          ch: 20,
          state: "active",
        },
      ],
    });
    const res = decideSectM8Action({
      sectTag: "P01",
      sectHall: hall,
      sectContrib: 0,
    });
    expect(res).toEqual({ type: "questTurnIn", questId: "st_tru_lang_t0" });
  });

  it("mua đồ cửa hàng nếu đủ cống hiến và món hàng không bị khoá còn lượt", () => {
    const hall = mockHallView({
      quests: [
        {
          questId: "st_tru_lang_t0",
          title: "Trừ sói",
          desc: "Hạ sói.",
          difficulty: 1,
          ch: 20,
          state: "done",
        },
      ],
    });
    const res = decideSectM8Action({
      sectTag: "P01",
      sectHall: hall,
      sectContrib: 15,
    });
    expect(res).toEqual({ type: "shopBuy", itemId: "hoi_huyet_dan", qty: 1 });
  });

  it("không mua đồ nếu không đủ cống hiến tối thiểu (< 5)", () => {
    const hall = mockHallView({
      quests: [],
    });
    const res = decideSectM8Action({
      sectTag: "P01",
      sectHall: hall,
      sectContrib: 2,
    });
    expect(res).toBeNull();
  });

  it("không mua món bị khoá cấp hoặc hết hạn mức ngày (left = 0)", () => {
    const hall = mockHallView({
      quests: [],
      shop: [
        {
          itemId: "hoi_huyet_dan",
          cost: 5,
          minLevel: 1,
          limitDay: 10,
          hall: "baoKho",
          left: 0,
          locked: "limit",
        },
        {
          itemId: "tu_khi_dan",
          cost: 30,
          minLevel: 3,
          limitDay: 2,
          hall: "baoKho",
          left: 2,
          locked: "level",
        },
      ],
    });
    const res = decideSectM8Action({
      sectTag: "P01",
      sectHall: hall,
      sectContrib: 100,
    });
    expect(res).toBeNull();
  });
});
