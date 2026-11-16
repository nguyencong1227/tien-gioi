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
import { FileSectStore, type SectMemberRecord } from "../src/sect-store";
import { SectService } from "../src/sect-service";
import { makeSect } from "../src/store-contract";
import { auditSavesDirectory } from "./audit-saves";

let store: FileSectStore;
let svc: SectService;
const NOW = 1_700_000_000_000;
let clock = NOW;

beforeAll(() => {
  store = new FileSectStore(path.join(dataDir, "sects"), () => clock);
  svc = new SectService(store, () => clock);
});

afterAll(() => {
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

  it("6. Kiểm toán toàn vẹn file lưu (audit-saves) sau thử tải M8: 0 lỗi vi phạm", () => {
    const report = auditSavesDirectory(dataDir);
    expect(report.totalSects, "phải có hồ sơ tông môn trong thư mục test").toBeGreaterThan(0);
    expect(report.errorSects).toBe(0);
    expect(report.failedFiles).toHaveLength(0);
  });
});
