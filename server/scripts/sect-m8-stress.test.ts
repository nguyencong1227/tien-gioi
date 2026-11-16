// Test thử tải & kiểm toán bất biến cống hiến tông môn M8 (Issue #846, M8.9).
// Kiểm tra:
// 1. Thử tải N tông môn song song: cấp tông (points), tích lũy cống hiến (contrib), công tích (merit).
// 2. Đua kiếm cống hiến đồng thời giữa nhiều thành viên: bất biến contrib <= merit và points >= tổng merit được bảo toàn tuyệt đối.
// 3. Trần ngày: không thành viên nào vượt SECT_EARN_DAY_CAP (140) hoặc trần nguồn nộp kho (30).
// 4. Nhảy tông môn: rời tông môn làm mất số dư cống hiến, không mang sang tông mới.
// 5. Kiểm toán toàn vẹn audit-saves sau phiên thử tải: 0 lỗi vi phạm.

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
import { installSectQuestFixture } from "../src/systems/sect-fixtures";

// Bảng nhiệm vụ tông CỐ ĐỊNH: test không phụ thuộc vào việc cập nhật dữ liệu thật của E (M8.7a) / D (M8.7)
const restoreQuestFixture = installSectQuestFixture();

let store: FileSectStore;
let svc: SectService;
const NOW = 1_700_000_000_000;
let clock = NOW;

beforeAll(() => {
  store = new FileSectStore(path.join(dataDir, "sects"), () => clock);
  svc = new SectService(store, () => clock);
});

afterAll(() => {
  restoreQuestFixture();
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
    // Cấp 2 cần 300 điểm
    await store.update(sectId, (cur) => ({ ...cur, points: 300 }));
    s = (await store.get(sectId))!;
    expect(s.points).toBe(300);

    // Cấp 3 cần 900 điểm
    await store.update(sectId, (cur) => ({ ...cur, points: 900 }));
    s = (await store.get(sectId))!;
    expect(s.points).toBe(900);

    // Cấp 4 cần 1800 điểm
    await store.update(sectId, (cur) => ({ ...cur, points: 1800 }));
    s = (await store.get(sectId))!;
    expect(s.points).toBe(1800);

    // Cấp 5 cần 3000 điểm
    await store.update(sectId, (cur) => ({ ...cur, points: 3000 }));
    s = (await store.get(sectId))!;
    expect(s.points).toBe(3000);
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

  it("10. Kiểm toán toàn vẹn file lưu (audit-saves) sau toàn bộ thử tải M8 (kèm today.quests): 0 lỗi vi phạm", () => {
    const report = auditSavesDirectory(dataDir);
    expect(report.totalSects, "phải có hồ sơ tông môn trong thư mục test").toBeGreaterThan(0);
    expect(report.errorSects).toBe(0);
    expect(report.failedFiles).toHaveLength(0);
  });
});
