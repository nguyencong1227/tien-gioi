import { describe, expect, it } from "vitest";
import {
  WORLD_BOSS_MIN_SHARE_PCT,
  WORLD_BOSS_TOP_SHOWN,
  sampleWorldBossEvent,
  sampleWorldBossSchedule,
  type WorldBossMsg,
} from "@tien-gioi/shared";
import {
  SCHEDULE_TZ_NOTE,
  countdownText,
  fmtInt,
  fmtPct,
  mapNameOf,
  mineLine,
  resultLine,
  sanitizeWorldBossMsg,
  scheduleRows,
  worldBossView,
} from "./world-boss-view";

describe("fmtPct / fmtInt", () => {
  it("phần trăm một chữ số thập phân kiểu Việt; không hợp lệ -> —", () => {
    expect(fmtPct(4.6)).toBe("4,6%");
    expect(fmtPct(31.24)).toBe("31,2%");
    expect(fmtPct(0)).toBe("0%");
    expect(fmtPct(1.5)).toBe("1,5%");
    expect(fmtPct(-3)).toBe("0%");
    for (const bad of [NaN, Infinity, "4", null, undefined]) expect(fmtPct(bad)).toBe("—");
  });

  it("số nguyên có dấu chấm ngăn nghìn; âm về 0; không hợp lệ -> —", () => {
    expect(fmtInt(46)).toBe("46");
    expect(fmtInt(61000)).toBe("61.000");
    expect(fmtInt(12.9)).toBe("12");
    expect(fmtInt(-1)).toBe("0");
    for (const bad of [NaN, "5", null, undefined]) expect(fmtInt(bad)).toBe("—");
  });
});

describe("countdownText", () => {
  it("dưới 1 giờ: mm:ss, làm tròn LÊN theo giây", () => {
    expect(countdownText(0)).toBe("00:00");
    expect(countdownText(1)).toBe("00:01");
    expect(countdownText(400)).toBe("00:01");
    expect(countdownText(1000)).toBe("00:01");
    expect(countdownText(1001)).toBe("00:02");
    expect(countdownText(59_000)).toBe("00:59");
    expect(countdownText(60_000)).toBe("01:00");
    expect(countdownText(5 * 60_000)).toBe("05:00");
    expect(countdownText(22 * 60_000 + 30_000)).toBe("22:30");
    expect(countdownText(3599_000)).toBe("59:59");
  });

  it("từ 1 giờ: 'H giờ MM phút'", () => {
    expect(countdownText(3600_000)).toBe("1 giờ 00 phút");
    expect(countdownText(3600_000 + 5 * 60_000)).toBe("1 giờ 05 phút");
    expect(countdownText(5 * 3600_000 + 59 * 60_000)).toBe("5 giờ 59 phút");
  });

  it("âm / không hợp lệ -> 00:00", () => {
    for (const bad of [-1, -5000, NaN, Infinity, "9", null, undefined]) {
      expect(countdownText(bad)).toBe(bad === Infinity ? "00:00" : "00:00");
    }
  });
});

describe("mapNameOf", () => {
  it("mã có thật ra tên; mã lạ / khoá nguyên mẫu / không phải chuỗi -> rỗng (không lộ id)", () => {
    expect(mapNameOf("han_van")).not.toBe("");
    for (const bad of ["zzz", "", "constructor", "__proto__", "toString", null, undefined, 5])
      expect(mapNameOf(bad)).toBe("");
  });
});

describe("worldBossView theo từng phase (tin mẫu của shared)", () => {
  it("soon: banner có tên trùm + bản đồ, đồng hồ 'Xuất hiện sau', không có máu / đóng góp", () => {
    const v = worldBossView(sampleWorldBossEvent("soon"));
    expect(v.active).toBe(true);
    expect(v.title).toContain(" · ");
    expect(v.timerLabel).toBe("Xuất hiện sau");
    expect(v.timer).toBe("05:00");
    expect(v.leftMs).toBe(5 * 60_000);
    expect(v.hp).toBe("");
    expect(v.mineText).toBe("");
    expect(v.top).toEqual([]);
  });

  it("đếm ngược trừ KHOẢNG TRÔI từ lúc nhận; về 00:00 chứ không âm", () => {
    const m = sampleWorldBossEvent("soon");
    expect(worldBossView(m, 60_000).timer).toBe("04:00");
    expect(worldBossView(m, 5 * 60_000).timer).toBe("00:00");
    expect(worldBossView(m, 99 * 60_000).timer).toBe("00:00");
    expect(worldBossView(m, 99 * 60_000).leftMs).toBe(0);
    expect(worldBossView(m, -1000).timer).toBe("05:00"); // âm / lạ: bỏ qua
    expect(worldBossView(m, NaN).timer).toBe("05:00");
  });

  it("live: 'Còn lại', máu, câu đóng góp của mình, top có thứ hạng + danh hiệu + phần trăm", () => {
    const v = worldBossView(sampleWorldBossEvent("live"));
    expect(v.timerLabel).toBe("Còn lại");
    expect(v.timer).toBe("22:00");
    expect(v.hp).toBe("Máu 64%");
    expect(v.mineText).toBe("Bạn đóng góp 4,6%: đủ điều kiện nhận thưởng.");
    expect(v.mineEligible).toBe(true);
    expect(v.top.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(v.top[0].pct).toBe("31,2%");
    expect(v.top[0].title).not.toBe("");
    expect(v.top[1].title).toBe("");
  });

  it("live nhưng CHƯA đủ ngưỡng: nói rõ cần bao nhiêu để nhận thưởng", () => {
    const v = worldBossView(sampleWorldBossEvent("live", "below"));
    expect(v.mineEligible).toBe(false);
    expect(v.mineText).toContain(`cần từ ${fmtPct(WORLD_BOSS_MIN_SHARE_PCT)} để nhận thưởng`);
  });

  it("ended / none: không phải banner, có câu kết quả", () => {
    const e = worldBossView(sampleWorldBossEvent("ended"));
    expect(e.active).toBe(false);
    expect(e.resultText).toMatch(/^Đã hạ .+! Thưởng: \+46 tu vi, \+9 Linh thạch, .+ x1\.$/);
    expect(e.tone).toBe("good");
    const n = worldBossView(sampleWorldBossEvent("none"));
    expect(n.active).toBe(false);
    expect(n.title).toBe("");
    expect(n.resultText).toBe("Chưa có sự kiện.");
  });
});

describe("resultLine", () => {
  const base = (): WorldBossMsg => ({
    phase: "ended",
    id: "x",
    name: "Hắc Giao",
    mapId: "am_suong",
  });

  it("hạ được: có thưởng / chưa đủ ngưỡng; bỏ chạy; huỷ", () => {
    expect(resultLine({ ...base(), outcome: "killed", reward: { exp: 1200, coin: 30 } })).toBe(
      "Đã hạ Hắc Giao! Thưởng: +1.200 tu vi, +30 Linh thạch.",
    );
    expect(resultLine({ ...base(), outcome: "killed" })).toBe(
      "Đã hạ Hắc Giao. Bạn chưa đủ ngưỡng đóng góp (1,5%) nên không có thưởng.",
    );
    expect(resultLine({ ...base(), outcome: "fled" })).toBe("Hắc Giao đã bỏ chạy.");
    expect(resultLine({ ...base(), outcome: "cancelled" })).toBe("Sự kiện Hắc Giao đã bị huỷ.");
    expect(resultLine(base())).toBe("Sự kiện Hắc Giao đã kết thúc.");
  });

  it("vật phẩm thưởng lạ (client cũ) KHÔNG lộ id; tên trống thì dùng 'Trùm thế giới'", () => {
    const t = resultLine({
      ...base(),
      outcome: "killed",
      reward: { exp: 1, coin: 0, item: { itemId: "vat_pham_moi_khong_co", count: 2 } },
    });
    expect(t).toContain("vật phẩm hiếm x2");
    expect(t).not.toContain("vat_pham_moi");
    expect(resultLine({ ...base(), name: "", outcome: "fled" })).toBe("Trùm thế giới đã bỏ chạy.");
  });

  it("tông màu: hạ có thưởng = good, bỏ chạy = bad, còn lại = info", () => {
    const tone = (m: WorldBossMsg) => worldBossView(m).tone;
    expect(tone({ ...base(), outcome: "killed", reward: { exp: 1, coin: 1 } })).toBe("good");
    expect(tone({ ...base(), outcome: "killed" })).toBe("info");
    expect(tone({ ...base(), outcome: "fled" })).toBe("bad");
    expect(tone({ ...base(), outcome: "cancelled" })).toBe("info");
  });
});

describe("mineLine", () => {
  it("không có mine -> rỗng", () => {
    expect(mineLine(undefined)).toBe("");
  });
});

describe("worldBossView: dữ liệu lạ", () => {
  it("bản đồ lạ: tiêu đề chỉ còn tên trùm, không lộ mã; danh hiệu lạ không hiện", () => {
    const m = sampleWorldBossEvent("live");
    m.mapId = "ban_do_moi";
    m.top![0].titleId = "zzz9";
    const v = worldBossView(m);
    expect(v.title).toBe(m.name);
    expect(v.title).not.toContain("ban_do_moi");
    expect(v.top[0].title).toBe("");
  });

  it("live không có đồng hồ / máu: không hiện nhãn, không hiện NaN", () => {
    const v = worldBossView({ phase: "live", id: "a", name: "B", mapId: "han_van" });
    expect(v.timerLabel).toBe("");
    expect(v.timer).toBe("");
    expect(v.leftMs).toBeNull();
    expect(v.hp).toBe("");
  });

  it("top quá WORLD_BOSS_TOP_SHOWN dòng thì cắt", () => {
    const m = sampleWorldBossEvent("live");
    m.top = Array.from({ length: 12 }, (_, i) => ({ name: `N${i}`, pts: 1, pct: 1 }));
    expect(worldBossView(m).top).toHaveLength(WORLD_BOSS_TOP_SHOWN);
  });
});

describe("sanitizeWorldBossMsg (tin từ mạng)", () => {
  it("tin mẫu hợp lệ qua nguyên vẹn (soon / live / ended / none)", () => {
    for (const p of ["soon", "live", "ended", "none"] as const) {
      const m = sampleWorldBossEvent(p);
      expect(sanitizeWorldBossMsg(JSON.parse(JSON.stringify(m)))).toEqual(m);
    }
  });

  it("sai kiểu / phase lạ / thiếu trường bắt buộc -> null", () => {
    for (const bad of [
      null,
      undefined,
      3,
      "x",
      [],
      {},
      { phase: "zzz" },
      { phase: "constructor" },
      { phase: "live" },
      { phase: "live", id: 1, name: "a", mapId: "b" },
      { phase: "soon", id: "a", name: "b" },
    ])
      expect(sanitizeWorldBossMsg(bad)).toBeNull();
  });

  it("phase lạ bị bỏ DÙ đủ id / tên / bản đồ (máy chủ mới hơn client: không đoán)", () => {
    for (const phase of ["zzz", "constructor", "__proto__", "LIVE", "", "toString"])
      expect(sanitizeWorldBossMsg({ phase, id: "a", name: "B", mapId: "han_van" })).toBeNull();
  });

  it("none không cần id / tên", () => {
    expect(sanitizeWorldBossMsg({ phase: "none" })).toEqual({
      phase: "none",
      id: "",
      name: "",
      mapId: "",
    });
  });

  it("số kẹp: hpPct về 0..100, thời gian âm / không hữu hạn bị bỏ", () => {
    const m = sanitizeWorldBossMsg({
      phase: "live",
      id: "a",
      name: "B",
      mapId: "han_van",
      hpPct: 250,
      startsInMs: -5,
      endsInMs: NaN,
    })!;
    expect(m.hpPct).toBe(100);
    expect(m.startsInMs).toBeUndefined();
    expect(m.endsInMs).toBeUndefined();
    expect(
      sanitizeWorldBossMsg({ phase: "live", id: "a", name: "B", mapId: "c", hpPct: -4 })!.hpPct,
    ).toBe(0);
  });

  it("top: dòng hỏng bị bỏ riêng từng dòng, cắt về WORLD_BOSS_TOP_SHOWN; mine sai kiểu bị bỏ", () => {
    const m = sanitizeWorldBossMsg({
      phase: "live",
      id: "a",
      name: "B",
      mapId: "c",
      top: [
        { name: "A", pts: 5, pct: 50 },
        null,
        { name: 3, pts: 1, pct: 1 },
        { name: "B", pts: -1, pct: 1 },
        { name: "C", pts: 1, pct: NaN },
        { name: "D", pts: 2, pct: 20, titleId: "kp1" },
        ...Array.from({ length: 20 }, (_, i) => ({ name: `X${i}`, pts: 1, pct: 1 })),
      ],
      mine: { pts: 1, pct: 2, eligible: "yes" },
    })!;
    expect(m.top!.map((r) => r.name).slice(0, 2)).toEqual(["A", "D"]);
    expect(m.top!.length).toBeLessThanOrEqual(WORLD_BOSS_TOP_SHOWN);
    expect(m.mine).toBeUndefined();
  });

  it("outcome lạ bị bỏ; reward chỉ nhận khi exp / coin hợp lệ; item hỏng bị bỏ", () => {
    const ok = sanitizeWorldBossMsg({
      phase: "ended",
      id: "a",
      name: "B",
      mapId: "c",
      outcome: "killed",
      reward: { exp: 5, coin: 2, item: { itemId: "x", count: 3.9 } },
    })!;
    expect(ok.outcome).toBe("killed");
    expect(ok.reward).toEqual({ exp: 5, coin: 2, item: { itemId: "x", count: 3 } });
    const bad = sanitizeWorldBossMsg({
      phase: "ended",
      id: "a",
      name: "B",
      mapId: "c",
      outcome: "zzz",
      reward: { exp: "5", coin: 2 },
    })!;
    expect(bad.outcome).toBeUndefined();
    expect(bad.reward).toBeUndefined();
    const noItem = sanitizeWorldBossMsg({
      phase: "ended",
      id: "a",
      name: "B",
      mapId: "c",
      reward: { exp: 1, coin: 1, item: { itemId: 7, count: 1 } },
    })!;
    expect(noItem.reward).toEqual({ exp: 1, coin: 1 });
  });
});

describe("scheduleRows", () => {
  it("lịch mẫu: sắp theo giờ, giờ 2 chữ số, tên trùm + bản đồ + thời lượng", () => {
    const rows = scheduleRows([...sampleWorldBossSchedule()].reverse());
    expect(rows.map((r) => r.time)).toEqual(["12:00", "21:00"]);
    for (const r of rows) {
      expect(r.boss).not.toBe("—");
      expect(r.map).not.toBe("—");
      expect(r.duration).toBe("30 phút");
    }
  });

  it("trùm / bản đồ lạ hiện — (không lộ id); lịch rỗng -> []", () => {
    const s = { ...sampleWorldBossSchedule()[0], boss: "khong_co", mapId: "khong_co" };
    expect(scheduleRows([s])[0]).toMatchObject({ boss: "—", map: "—" });
    expect(scheduleRows([])).toEqual([]);
  });

  it("ghi chú múi giờ nói rõ là giờ MÁY CHỦ", () => {
    expect(SCHEDULE_TZ_NOTE).toContain("UTC+7");
    expect(SCHEDULE_TZ_NOTE).toContain("máy chủ");
  });
});
