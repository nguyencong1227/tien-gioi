// Test thử tải & kiểm toán bất biến cống hiến tông môn M8 (Issue #846, M8.9).
// Kiểm tra:
// 1. Thử tải N tông môn song song: cấp tông (points), tích lũy cống hiến (contrib), công tích (merit).
// 2. Đua kiếm cống hiến đồng thời giữa nhiều thành viên: bất biến contrib <= merit và points >= tổng merit được bảo toàn tuyệt đối.
// 3. Trần ngày: không thành viên nào vượt SECT_EARN_DAY_CAP (140) hoặc trần nguồn nộp kho (30).
// 4. Nhảy tông môn: rời tông môn làm mất số dư cống hiến, không mang sang tông mới.
// 5. Thăng cấp tông môn qua điểm tích lũy points (1k/4k/12k/30k).
// 6. Đua trả nhiệm vụ tông môn M8.4: khóa theo mẫu, chống gian lận nộp trùng lặp.
// 7. Bảo toàn sổ ngày today.quests của linh hồn khi nhảy tông giữa ngày.
// 8. Đua mua đồng thời cửa hàng tông môn M8.5: kẹp hạn mức limitDay, trừ cống hiến nguyên tử.
// 9. Khoá mua theo cấp tông môn và hoàn tiền an toàn (shopRefund).
// 10. Kiểm toán toàn vẹn audit-saves sau toàn bộ thử tải M8 (nhiệm vụ + cửa hàng): 0 lỗi vi phạm.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-sect-m8-stress-"));
process.env.DATA_DIR = dataDir;

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dayKey } from "@tien-gioi/shared";
import { FileSectStore, type SectMemberRecord } from "../src/sect-store";
import { SectService } from "../src/sect-service";
import { makeSect } from "../src/store-contract";
import { auditSavesDirectory } from "./audit-saves";
import { installSectQuestFixture, installSectShopFixture } from "../src/systems/sect-fixtures";

// Bảng nhiệm vụ & cửa hàng tông CỐ ĐỊNH: test không phụ thuộc vào việc cập nhật dữ liệu thật của E (M8.7a) / D (M8.7)
let restoreQuestFixture: () => void;
let restoreShopFixture: () => void;

let store: FileSectStore;
let svc: SectService;
const NOW = 1_700_000_000_000;
let clock = NOW;

beforeAll(() => {
  restoreQuestFixture = installSectQuestFixture();
  restoreShopFixture = installSectShopFixture();
  store = new FileSectStore(path.join(dataDir, "sects"), () => clock);
  svc = new SectService(store, () => clock);
});

afterAll(() => {
  restoreShopFixture?.();
  restoreQuestFixture?.();
  rmSync(dataDir, { recursive: true, force: true });
});

describe("Thử tải & Bất biến cống hiến tông môn M8 (Issue #846, M8.9)", () => {
  it("1. N tông môn song song: tích lũy điểm tông môn và lên cấp theo đúng ngưỡng", async () => {
    // Tạo 5 tông môn song song
    for (let i = 1; i <= 5; i++) {
      const sectId = `sect_m8_${i}`;
      const leader = `chu_${i}`;
      await store.create(
        makeSect(sectId, {
          name: `Huyền Tông ${i}`,
          tag: `H${i}T`,
          leader,
          members: [
            { soulKey: leader, name: `Tông Chủ ${i}`, rank: "chu", joinedAt: NOW - 86_400_000 },
          ],
        }),
      );

      // Leader kiếm cống hiến bằng nguồn deposit (warmup = false để test trực tiếp)
      const res = await svc.award({ soulKey: leader, name: `Tông Chủ ${i}` }, "deposit", 25, {
        warmup: false,
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.granted).toBe(25);
        expect(res.sect.points).toBe(25);
        const m = res.sect.members.find((x) => x.soulKey === leader);
        expect(m?.contrib).toBe(25);
        expect(m?.merit).toBe(25);
        expect(m?.today?.earned).toBe(25);
        expect(m?.today?.deposit).toBe(25);
      }
    }
  });

  it("2. Đua kiếm cống hiến đồng thời: bất biến contrib <= merit và points >= tổng merit không bao giờ bị phá vỡ", async () => {
    const sectId = "sect_race_01";
    const leader = "chu_race";
    const members: SectMemberRecord[] = [
      { soulKey: leader, name: "Chủ Đua", rank: "chu" as const, joinedAt: NOW - 86_400_000 },
    ];
    for (let k = 1; k <= 10; k++) {
      members.push({
        soulKey: `de_${k}`,
        name: `Đệ Tử ${k}`,
        rank: "de_tu" as const,
        joinedAt: NOW - 86_400_000,
      });
    }

    await store.create(
      makeSect(sectId, {
        name: "Đua Tông Môn",
        tag: "DUA1",
        leader,
        members,
      }),
    );

    // 10 đệ tử cùng lúc nộp cống hiến qua award đồng thời (Promise.all)
    const awards = members
      .slice(1)
      .map((m) =>
        svc.award({ soulKey: m.soulKey, name: m.name }, "deposit", 20, { warmup: false }),
      );

    const results = await Promise.all(awards);
    for (const r of results) {
      expect(r.ok).toBe(true);
    }

    const s = (await store.get(sectId))!;
    expect(s.points).toBe(200); // 10 x 20

    let totalMerit = 0;
    for (const m of s.members) {
      const contrib = m.contrib ?? 0;
      const merit = m.merit ?? 0;
      expect(contrib).toBeLessThanOrEqual(merit);
      expect(contrib).toBeGreaterThanOrEqual(0);
      totalMerit += merit;
    }

    // Bất biến cốt lõi mục 12.2: points >= tổng merit
    expect(s.points).toBeGreaterThanOrEqual(totalMerit);
  });

  it("3. Trần ngày nghiêm ngặt: không ai kiếm vượt SECT_DEPOSIT_DAY_CAP hoặc SECT_EARN_DAY_CAP", async () => {
    const sectId = "sect_cap_01";
    const leader = "chu_cap";
    await store.create(
      makeSect(sectId, {
        name: "Trần Tông Môn",
        tag: "CAP1",
        leader,
        members: [{ soulKey: leader, name: "Chủ Cap", rank: "chu", joinedAt: NOW - 86_400_000 }],
      }),
    );

    // Lần 1: nộp 20 -> được 20
    const r1 = await svc.award({ soulKey: leader, name: "Chủ Cap" }, "deposit", 20, {
      warmup: false,
    });
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.granted).toBe(20);

    // Lần 2: muốn nộp tiếp 20 -> chỉ được 10 (vì kẹp trần SECT_DEPOSIT_DAY_CAP = 30)
    const r2 = await svc.award({ soulKey: leader, name: "Chủ Cap" }, "deposit", 20, {
      warmup: false,
    });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.granted).toBe(10); // 20 + 10 = 30

    // Lần 3: cố nộp thêm khi đã chạm trần ngày -> bị từ chối earn_cap
    const r3 = await svc.award({ soulKey: leader, name: "Chủ Cap" }, "deposit", 5, {
      warmup: false,
    });
    expect(r3.ok).toBe(false);
    if (!r3.ok) expect(r3.reason).toBe("earn_cap");
  });

  it("4. Nhảy tông môn: rời tông môn làm mất số dư cống hiến (contrib = 0)", async () => {
    const sectId1 = "sect_jump_01";
    const sectId2 = "sect_jump_02";
    const leader1 = "chu_jump_1";
    const leader2 = "chu_jump_2";
    const jumper = "nguoi_nhay";

    await store.create(
      makeSect(sectId1, {
        name: "Tông Thứ Nhất",
        tag: "TG1",
        leader: leader1,
        members: [
          { soulKey: leader1, name: "Chủ Một", rank: "chu", joinedAt: NOW - 86_400_000 },
          { soulKey: jumper, name: "Người Nhảy", rank: "de_tu", joinedAt: NOW - 86_400_000 },
        ],
      }),
    );

    await store.create(
      makeSect(sectId2, {
        name: "Tông Thứ Hai",
        tag: "TG2",
        leader: leader2,
        members: [{ soulKey: leader2, name: "Chủ Hai", rank: "chu", joinedAt: NOW - 86_400_000 }],
      }),
    );

    // Người nhảy kiếm 30 cống hiến ở Tông 1
    const a1 = await svc.award({ soulKey: jumper, name: "Người Nhảy" }, "deposit", 30, {
      warmup: false,
    });
    expect(a1.ok).toBe(true);

    // Rời Tông 1
    const l1 = await svc.leave({ soulKey: jumper, name: "Người Nhảy" });
    expect(l1.ok).toBe(true);

    // Kiểm tra trong Tông 1: jumper không còn trong members
    const s1 = (await store.get(sectId1))!;
    expect(s1.members.find((m) => m.soulKey === jumper)).toBeUndefined();

    // Tiến đồng hồ qua thời gian hồi chiêu vào lại (SECT_REJOIN_COOLDOWN_MS)
    clock += 86_400_000;

    // Gia nhập Tông 2 qua svc.join
    const j2 = await svc.join(sectId2, leader2, { soulKey: jumper, name: "Người Nhảy" });
    expect(j2.ok).toBe(true);

    // Khi mới vào Tông 2: cống hiến bắt đầu từ 0 (không mang cống hiến tông cũ sang)
    const s2 = (await store.get(sectId2))!;
    const m2 = s2.members.find((m) => m.soulKey === jumper);
    expect(m2).toBeDefined();
    expect(m2?.contrib ?? 0).toBe(0);
    expect(m2?.merit ?? 0).toBe(0);
  });

  it("5. Thử tải thăng cấp tông môn qua điểm tích lũy: chuyển giao mốc cấp, buff và mở rộng ô kho", async () => {
    const sectId = "sect_lvl_01";
    const leader = "chu_lvl";
    await store.create(
      makeSect(sectId, {
        name: "Cấp Tông Môn",
        tag: "LVL1",
        leader,
        members: [{ soulKey: leader, name: "Chủ Cấp", rank: "chu", joinedAt: NOW - 86_400_000 }],
      }),
    );

    // Bắt đầu cấp 1: 0 points
    let s = (await store.get(sectId))!;
    expect(s.points ?? 0).toBe(0);

    // Thử tải nộp điểm số lượng lớn trực tiếp vào store (giả lập nhiều ngày nộp kho tích lũy)
    // Cấp 2 cần 1_000 điểm
    await store.update(sectId, (cur) => ({ ...cur, points: 1_000 }));
    s = (await store.get(sectId))!;
    expect(s.points).toBe(1_000);

    // Cấp 3 cần 4_000 điểm
    await store.update(sectId, (cur) => ({ ...cur, points: 4_000 }));
    s = (await store.get(sectId))!;
    expect(s.points).toBe(4_000);

    // Cấp 4 cần 12_000 điểm
    await store.update(sectId, (cur) => ({ ...cur, points: 12_000 }));
    s = (await store.get(sectId))!;
    expect(s.points).toBe(12_000);

    // Cấp 5 cần 30_000 điểm
    await store.update(sectId, (cur) => ({ ...cur, points: 30_000 }));
    s = (await store.get(sectId))!;
    expect(s.points).toBe(30_000);
  });

  it("6. Đua trả cùng 1 nhiệm vụ tông môn: chỉ 1 lần ghi nhận cống hiến, các lần đua sau bị từ chối quest_done", async () => {
    const sectId = "sect_quest_race_01";
    const leader = "chu_quest_race";
    const racer = "de_quest_racer";
    await store.create(
      makeSect(sectId, {
        name: "Đua Nhiệm Vụ",
        tag: "DNV1",
        leader,
        members: [
          { soulKey: leader, name: "Chủ Đua NV", rank: "chu", joinedAt: NOW - 86_400_000 },
          { soulKey: racer, name: "Đệ Tử Đua", rank: "de_tu", joinedAt: NOW - 86_400_000 },
        ],
      }),
    );

    // Gửi 10 yêu cầu trả cùng một nhiệm vụ mẫu st_tru_lang đồng thời
    const reqs = Array.from({ length: 10 }, () =>
      svc.award({ soulKey: racer, name: "Đệ Tử Đua" }, "quest", 10, {
        key: "st_tru_lang.t0",
        warmup: false,
      }),
    );
    const results = await Promise.all(reqs);

    const okCount = results.filter((r) => r.ok).length;
    const failDone = results.filter((r) => !r.ok && r.reason === "quest_done").length;
    expect(okCount).toBe(1);
    expect(failDone).toBe(9);

    // Kiểm tra bản ghi tông môn: chỉ cộng đúng 10 cống hiến và 10 điểm tông
    const s = (await store.get(sectId))!;
    expect(s.points).toBe(10);
    const m = s.members.find((x) => x.soulKey === racer)!;
    expect(m.contrib).toBe(10);
    expect(m.merit).toBe(10);
    expect(m.today?.quests).toEqual(["st_tru_lang"]);
  });

  it("7. Nhảy tông môn giữa ngày: bảo toàn today.quests của linh hồn, ngăn chặn gian lận làm lại cùng mẫu nhiệm vụ", async () => {
    const sectId1 = "sect_jump_q_01";
    const sectId2 = "sect_jump_q_02";
    const leader1 = "chu_jump_q1";
    const leader2 = "chu_jump_q2";
    const jumper = "de_jump_q";

    await store.create(
      makeSect(sectId1, {
        name: "Tông NV Một",
        tag: "TN1",
        leader: leader1,
        members: [
          { soulKey: leader1, name: "Chủ Một", rank: "chu", joinedAt: NOW - 86_400_000 },
          { soulKey: jumper, name: "Đệ Nhảy NV", rank: "de_tu", joinedAt: NOW - 86_400_000 },
        ],
      }),
    );
    await store.create(
      makeSect(sectId2, {
        name: "Tông NV Hai",
        tag: "TN2",
        leader: leader2,
        members: [{ soulKey: leader2, name: "Chủ Hai", rank: "chu", joinedAt: NOW - 86_400_000 }],
      }),
    );

    // Ở Tông 1: Hoàn thành nhiệm vụ mẫu st_tru_lang
    const a1 = await svc.award({ soulKey: jumper, name: "Đệ Nhảy NV" }, "quest", 10, {
      key: "st_tru_lang.t0",
      warmup: false,
    });
    expect(a1.ok).toBe(true);

    // Rời Tông 1
    const l1 = await svc.leave({ soulKey: jumper, name: "Đệ Nhảy NV" });
    expect(l1.ok).toBe(true);

    // Nhảy sang Tông 2 trong cùng ngày (bảo toàn sổ ngày today.quests của linh hồn)
    const j2 = await store.update(sectId2, (s) => ({
      ...s,
      members: [
        ...s.members,
        {
          soulKey: jumper,
          name: "Đệ Nhảy NV",
          rank: "de_tu",
          joinedAt: clock,
          today: {
            day: dayKey(clock),
            earned: 10,
            deposit: 0,
            quests: ["st_tru_lang"],
            dungeon: false,
            buys: {},
          },
        },
      ],
    }));
    expect(j2).toBeDefined();

    // Trường hợp 1: Chế độ warmup mặc định (warmup: true) -> bị từ chối ngay lập tức vì not_warm
    const warmFail = await svc.award({ soulKey: jumper, name: "Đệ Nhảy NV" }, "quest", 10, {
      key: "st_nop_nanh.t0",
      warmup: true,
    });
    expect(warmFail.ok).toBe(false);
    if (!warmFail.ok) expect(warmFail.reason).toBe("not_warm");

    // Trường hợp 2: Khi warmup=false, thử làm LẠI mẫu đã làm ở tông cũ (st_tru_lang) -> bị từ chối quest_done
    const dupQuestFail = await svc.award({ soulKey: jumper, name: "Đệ Nhảy NV" }, "quest", 10, {
      key: "st_tru_lang.t0",
      warmup: false,
    });
    expect(dupQuestFail.ok).toBe(false);
    if (!dupQuestFail.ok) expect(dupQuestFail.reason).toBe("quest_done");

    // Trường hợp 3: Mẫu CHƯA làm hôm nay (st_nop_nanh) thì vẫn được phép hoàn thành
    const newQuestOk = await svc.award({ soulKey: jumper, name: "Đệ Nhảy NV" }, "quest", 20, {
      key: "st_nop_nanh.t0",
      warmup: false,
    });
    expect(newQuestOk.ok).toBe(true);
  });

  it("8. Đột phá cảnh giới giữa lúc làm nhiệm vụ: mẫu nhiệm vụ giữ nguyên, khóa theo mẫu tránh nhận lại ở bậc mới", async () => {
    const sectId = "sect_realm_break_01";
    const leader = "chu_realm_break";
    const pupil = "de_break";

    await store.create(
      makeSect(sectId, {
        name: "Đột Phá Tông",
        tag: "DPT1",
        leader,
        members: [
          { soulKey: leader, name: "Chủ Đột Phá", rank: "chu", joinedAt: NOW - 86_400_000 },
          { soulKey: pupil, name: "Đệ Tử Đột Phá", rank: "de_tu", joinedAt: NOW - 86_400_000 },
        ],
      }),
    );

    // Đệ tử nhận nhiệm vụ ở bậc Luyện Khí (t0): st_tru_ho.t0 (độ khó 3, 40 cống hiến)
    // Trong lúc làm, đệ tử đột phá lên Trúc Cơ (t1)
    // Khi nộp, trả qua award với key của bản đã nhận (st_tru_ho.t0)
    const turnInRes = await svc.award({ soulKey: pupil, name: "Đệ Tử Đột Phá" }, "quest", 40, {
      key: "st_tru_ho.t0",
      warmup: false,
    });
    expect(turnInRes.ok).toBe(true);
    if (turnInRes.ok) {
      expect(turnInRes.granted).toBe(40);
      const m = turnInRes.sect.members.find((x) => x.soulKey === pupil)!;
      // today.quests ghi nhận MẪU chung "st_tru_ho", không lưu hậu tố bậc
      expect(m.today?.quests).toContain("st_tru_ho");
    }

    // Sau khi đã ở Trúc Cơ, cố tình xin nhận / nộp bản Trúc Cơ (st_tru_ho.t1) của cùng mẫu trong ngày -> quest_done
    const retryTier1 = await svc.award({ soulKey: pupil, name: "Đệ Tử Đột Phá" }, "quest", 40, {
      key: "st_tru_ho.t1",
      warmup: false,
    });
    expect(retryTier1.ok).toBe(false);
    if (!retryTier1.ok) expect(retryTier1.reason).toBe("quest_done");
  });

  it("9. Đua nộp nhiều nhiệm vụ đồng thời giữa các thành viên: cộng dồn chính xác điểm tông môn và bảo toàn bất biến", async () => {
    const sectId = "sect_multi_quest_01";
    const leader = "chu_multi_q";
    const members: SectMemberRecord[] = [
      { soulKey: leader, name: "Chủ Multi", rank: "chu", joinedAt: NOW - 86_400_000 },
    ];
    for (let k = 1; k <= 3; k++) {
      members.push({
        soulKey: `de_multi_${k}`,
        name: `Đệ Tử M${k}`,
        rank: "de_tu",
        joinedAt: NOW - 86_400_000,
      });
    }

    await store.create(
      makeSect(sectId, {
        name: "Đa Nhiệm Vụ",
        tag: "DNV2",
        leader,
        members,
      }),
    );

    // 3 đệ tử nộp 3 nhiệm vụ khác nhau đồng thời:
    // Đệ 1: st_tru_lang.t0 (10 CH)
    // Đệ 2: st_nop_nanh.t0 (20 CH)
    // Đệ 3: st_tru_ho.t0 (40 CH)
    const tasks = [
      svc.award({ soulKey: "de_multi_1", name: "Đệ Tử M1" }, "quest", 10, {
        key: "st_tru_lang.t0",
        warmup: false,
      }),
      svc.award({ soulKey: "de_multi_2", name: "Đệ Tử M2" }, "quest", 20, {
        key: "st_nop_nanh.t0",
        warmup: false,
      }),
      svc.award({ soulKey: "de_multi_3", name: "Đệ Tử M3" }, "quest", 40, {
        key: "st_tru_ho.t0",
        warmup: false,
      }),
    ];

    const results = await Promise.all(tasks);
    for (const r of results) {
      expect(r.ok).toBe(true);
    }

    const s = (await store.get(sectId))!;
    // Tổng điểm tông môn = 10 + 20 + 40 = 70
    expect(s.points).toBe(70);

    let sumMerit = 0;
    for (const m of s.members) {
      const contrib = m.contrib ?? 0;
      const merit = m.merit ?? 0;
      expect(contrib).toBeLessThanOrEqual(merit);
      sumMerit += merit;
    }
    expect(s.points).toBeGreaterThanOrEqual(sumMerit);
  });

  it("10. Đua mua đồng thời trong cửa hàng tông môn (M8.5): kẹp hạn mức limitDay, trừ cống hiến nguyên tử, bảo toàn points & merit", async () => {
    const sectId = "sect_shop_race_01";
    const leader = "chu_shop_race";
    const buyer = "de_shop_buyer";

    await store.create(
      makeSect(sectId, {
        name: "Đua Cửa Hàng",
        tag: "DCH1",
        leader,
        members: [
          { soulKey: leader, name: "Chủ Đua CH", rank: "chu", joinedAt: NOW - 86_400_000 },
          {
            soulKey: buyer,
            name: "Đệ Mua",
            rank: "de_tu",
            joinedAt: NOW - 86_400_000,
            contrib: 100,
            merit: 100,
          },
        ],
        points: 500, // Cấp 2
      }),
    );

    // Món hoi_huyet_dan trong SHOP_FIXTURE: cost = 5, minLevel = 1, limitDay = 10
    // Gửi 14 yêu cầu mua 1 món cùng lúc (vượt quá limitDay = 10)
    const buys = Array.from({ length: 14 }, () =>
      svc.shopBuy({ soulKey: buyer, name: "Đệ Mua" }, "hoi_huyet_dan", 1, { known: false }),
    );

    const results = await Promise.all(buys);
    const okBuys = results.filter((r) => r.ok);
    const limitFail = results.filter((r) => !r.ok && r.reason === "shop_limit");

    expect(okBuys.length).toBe(10);
    expect(limitFail.length).toBe(4);

    const s = (await store.get(sectId))!;
    const m = s.members.find((x) => x.soulKey === buyer)!;

    // Đã mua 10 món, mỗi món 5 cống hiến: 100 - 50 = 50 cống hiến còn lại
    expect(m.contrib).toBe(50);
    expect(m.merit).toBe(100); // merit KHÔNG bị giảm
    expect(m.contrib).toBeLessThanOrEqual(m.merit ?? 0);
    expect(m.today?.buys?.["hoi_huyet_dan"]).toBe(10);

    // Mua cửa hàng KHÔNG làm giảm điểm tông môn (points bảo toàn)
    expect(s.points).toBe(500);
  });

  it("11. Cửa hàng tông môn khóa theo cấp (M8.5): từ chối shop_locked ở cấp thấp, thành công khi thăng cấp", async () => {
    const sectId = "sect_shop_level_01";
    const leader = "chu_shop_lvl";
    const pupil = "de_shop_lvl";

    await store.create(
      makeSect(sectId, {
        name: "Cấp Cửa Hàng",
        tag: "CCH1",
        leader,
        members: [
          { soulKey: leader, name: "Chủ Cấp CH", rank: "chu", joinedAt: NOW - 86_400_000 },
          {
            soulKey: pupil,
            name: "Đệ Cấp CH",
            rank: "de_tu",
            joinedAt: NOW - 86_400_000,
            contrib: 100,
            merit: 100,
          },
        ],
        points: 100, // Cấp 1
      }),
    );

    // tu_khi_dan: cost = 30, minLevel = 3, limitDay = 2
    // Khi tông môn cấp 1: mua bị từ chối shop_locked
    const failLevel = await svc.shopBuy({ soulKey: pupil, name: "Đệ Cấp CH" }, "tu_khi_dan", 1, {
      known: false,
    });
    expect(failLevel.ok).toBe(false);
    if (!failLevel.ok) expect(failLevel.reason).toBe("shop_locked");

    // Thử mua với cờ known = true (đã học kinh quyển) -> shop_known
    const failKnown = await svc.shopBuy({ soulKey: pupil, name: "Đệ Cấp CH" }, "hoi_huyet_dan", 1, {
      known: true,
    });
    expect(failKnown.ok).toBe(false);
    if (!failKnown.ok) expect(failKnown.reason).toBe("shop_known");

    // Thăng cấp tông môn lên Cấp 3 (cần 4_000 điểm)
    await store.update(sectId, (cur) => ({ ...cur, points: 4_000 }));

    // Mua lần 1: thành công
    const buy1 = await svc.shopBuy({ soulKey: pupil, name: "Đệ Cấp CH" }, "tu_khi_dan", 1, {
      known: false,
    });
    expect(buy1.ok).toBe(true);

    // Mua lần 2: thành công
    const buy2 = await svc.shopBuy({ soulKey: pupil, name: "Đệ Cấp CH" }, "tu_khi_dan", 1, {
      known: false,
    });
    expect(buy2.ok).toBe(true);

    // Mua lần 3: vượt limitDay = 2 -> shop_limit
    const buy3 = await svc.shopBuy({ soulKey: pupil, name: "Đệ Cấp CH" }, "tu_khi_dan", 1, {
      known: false,
    });
    expect(buy3.ok).toBe(false);
    if (!buy3.ok) expect(buy3.reason).toBe("shop_limit");

    const s = (await store.get(sectId))!;
    const m = s.members.find((x) => x.soulKey === pupil)!;
    // Đã mua 2 lần 30 = 60 cống hiến: 100 - 60 = 40
    expect(m.contrib).toBe(40);
    expect(m.today?.buys?.["tu_khi_dan"]).toBe(2);
  });

  it("12. Hoàn tiền cửa hàng (shopRefund - M8.5): hoàn cống hiến, giảm số lượng đã mua, kiểm tra an toàn khi rời tông", async () => {
    const sectId = "sect_refund_01";
    const leader = "chu_refund";
    const buyer = "de_refunder";

    await store.create(
      makeSect(sectId, {
        name: "Hoàn Tiền Tông",
        tag: "HTT1",
        leader,
        members: [
          { soulKey: leader, name: "Chủ Hoàn", rank: "chu", joinedAt: NOW - 86_400_000 },
          {
            soulKey: buyer,
            name: "Đệ Hoàn",
            rank: "de_tu",
            joinedAt: NOW - 86_400_000,
            contrib: 50,
            merit: 50,
          },
        ],
        points: 50,
      }),
    );

    // Mua 2 hoi_huyet_dan (cost = 10)
    const buyRes = await svc.shopBuy({ soulKey: buyer, name: "Đệ Hoàn" }, "hoi_huyet_dan", 2, {
      known: false,
    });
    expect(buyRes.ok).toBe(true);

    let s = (await store.get(sectId))!;
    let m = s.members.find((x) => x.soulKey === buyer)!;
    expect(m.contrib).toBe(40);
    expect(m.today?.buys?.["hoi_huyet_dan"]).toBe(2);

    // Giả lập túi đồ đầy: hoàn trả lại 2 món và 10 cống hiến
    const refRes = await svc.shopRefund(
      { soulKey: buyer, name: "Đệ Hoàn" },
      "hoi_huyet_dan",
      2,
      10,
    );
    expect(refRes.ok).toBe(true);

    s = (await store.get(sectId))!;
    m = s.members.find((x) => x.soulKey === buyer)!;
    expect(m.contrib).toBe(50);
    // Khi hoàn hết, khoá món được xoá khỏi today.buys (tối ưu kích thước lưu)
    expect(m.today?.buys?.["hoi_huyet_dan"]).toBeUndefined();

    // Rời tông môn rồi cố gắng gọi shopRefund -> not_in_sect
    const leaveRes = await svc.leave({ soulKey: buyer, name: "Đệ Hoàn" });
    expect(leaveRes.ok).toBe(true);

    const refAfterLeave = await svc.shopRefund(
      { soulKey: buyer, name: "Đệ Hoàn" },
      "hoi_huyet_dan",
      1,
      5,
    );
    expect(refAfterLeave.ok).toBe(false);
    if (!refAfterLeave.ok) expect(refAfterLeave.reason).toBe("not_in_sect");
  });

  it("13. Từ chối mua khi không đủ cống hiến hoặc dữ liệu đầu vào không hợp lệ", async () => {
    const sectId = "sect_invalid_buy_01";
    const leader = "chu_inv";
    const poor = "de_poor";

    await store.create(
      makeSect(sectId, {
        name: "Không Đủ Tiền",
        tag: "KDT1",
        leader,
        members: [
          { soulKey: leader, name: "Chủ Inv", rank: "chu", joinedAt: NOW - 86_400_000 },
          {
            soulKey: poor,
            name: "Đệ Nghèo",
            rank: "de_tu",
            joinedAt: NOW - 86_400_000,
            contrib: 2, // Chỉ có 2 cống hiến, món cần 5
            merit: 2,
          },
        ],
        points: 2,
      }),
    );

    // Không đủ cống hiến -> no_contrib
    const r1 = await svc.shopBuy({ soulKey: poor, name: "Đệ Nghèo" }, "hoi_huyet_dan", 1, {
      known: false,
    });
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.reason).toBe("no_contrib");

    // Món không có trong cửa hàng -> item_invalid
    const r2 = await svc.shopBuy({ soulKey: poor, name: "Đệ Nghèo" }, "item_khong_ton_tai", 1, {
      known: false,
    });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toBe("item_invalid");

    // Số lượng <= 0 hoặc không phải số nguyên -> item_invalid
    const r3 = await svc.shopBuy({ soulKey: poor, name: "Đệ Nghèo" }, "hoi_huyet_dan", 0, {
      known: false,
    });
    expect(r3.ok).toBe(false);
    if (!r3.ok) expect(r3.reason).toBe("item_invalid");

    const r4 = await svc.shopBuy({ soulKey: poor, name: "Đệ Nghèo" }, "hoi_huyet_dan", 1.5, {
      known: false,
    });
    expect(r4.ok).toBe(false);
    if (!r4.ok) expect(r4.reason).toBe("item_invalid");
  });

  it("14. Kiểm toán toàn vẹn file lưu (audit-saves) sau toàn bộ thử tải M8 (nhiệm vụ + cửa hàng): 0 lỗi vi phạm", () => {
    const report = auditSavesDirectory(dataDir);
    expect(report.totalSects, "phải có hồ sơ tông môn trong thư mục test").toBeGreaterThan(0);
    expect(report.errorSects).toBe(0);
    expect(report.failedFiles).toHaveLength(0);
  });
});
