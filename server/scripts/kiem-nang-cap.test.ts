import { describe, expect, it } from "vitest";
import { deepCompareEntities, compareDirectorySnapshots } from "./kiem-nang-cap";

describe("kiem-nang-cap: deepCompareEntities", () => {
  it("trả về rỗng khi hai đối tượng giống hệt nhau", () => {
    const a = { name: "bot_1", coin: 100, realm: 2, inv: [{ itemId: "dan", qty: 2 }] };
    const b = { name: "bot_1", coin: 100, realm: 2, inv: [{ itemId: "dan", qty: 2 }] };
    expect(deepCompareEntities(a, b)).toEqual([]);
  });

  it("bỏ qua các trường biến động tự nhiên: updatedAt và life.playMs", () => {
    const a = {
      name: "bot_1",
      coin: 100,
      updatedAt: 1000,
      life: { playMs: 500, kills: 10 },
    };
    const b = {
      name: "bot_1",
      coin: 100,
      updatedAt: 2000,
      life: { playMs: 700, kills: 10 },
    };
    expect(deepCompareEntities(a, b)).toEqual([]);
  });

  it("phát hiện sai lệch khi tiền bị đổi (kể cả tăng hay giảm)", () => {
    const a = { name: "bot_1", coin: 100 };
    const b1 = { name: "bot_1", coin: 150 };
    const diffs1 = deepCompareEntities(a, b1);
    expect(diffs1).toHaveLength(1);
    expect(diffs1[0]).toEqual({ keyPath: "coin", before: 100, after: 150 });

    const b2 = { name: "bot_1", coin: 50 };
    const diffs2 = deepCompareEntities(a, b2);
    expect(diffs2).toHaveLength(1);
    expect(diffs2[0]).toEqual({ keyPath: "coin", before: 100, after: 50 });
  });

  it("phát hiện sai lệch khi thay đổi cảnh giới hoặc tầng", () => {
    const a = { name: "bot_1", realm: 1, subRealm: 3 };
    const b = { name: "bot_1", realm: 2, subRealm: 1 };
    const diffs = deepCompareEntities(a, b);
    expect(diffs).toHaveLength(2);
  });

  it("phát hiện sai lệch sâu bên trong mảng túi đồ", () => {
    const a = { inv: [{ itemId: "dan_hoi_mau", qty: 5 }] };
    const b = { inv: [{ itemId: "dan_hoi_mau", qty: 4 }] };
    const diffs = deepCompareEntities(a, b);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].keyPath).toBe("inv");
  });

  it("phát hiện khi bị thiếu trường hoặc thêm trường lạ", () => {
    const a = { name: "bot_1", sect: "tinh_van" };
    const bMissing = { name: "bot_1" };
    const diffs1 = deepCompareEntities(a, bMissing);
    expect(diffs1).toHaveLength(1);
    expect(diffs1[0]).toEqual({ keyPath: "sect", before: "tinh_van", after: undefined });

    const bAdded = { name: "bot_1", sect: "tinh_van", extraField: 123 };
    const diffs2 = deepCompareEntities(a, bAdded);
    expect(diffs2).toHaveLength(1);
    expect(diffs2[0]).toEqual({ keyPath: "extraField", before: undefined, after: 123 });
  });
});

describe("kiem-nang-cap: compareDirectorySnapshots", () => {
  it("phát hiện tệp bị mất và tệp bị thêm", () => {
    const snapA = new Map([
      ["bot_1.json", { name: "bot_1", coin: 100 }],
      ["bot_2.json", { name: "bot_2", coin: 200 }],
    ]);
    const snapB = new Map([
      ["bot_1.json", { name: "bot_1", coin: 100 }],
      ["bot_3.json", { name: "bot_3", coin: 300 }],
    ]);

    const res = compareDirectorySnapshots(snapA, snapB);
    expect(res.missingFiles).toEqual(["bot_2.json"]);
    expect(res.addedFiles).toEqual(["bot_3.json"]);
    expect(res.mismatchedFiles).toHaveLength(0);
  });

  it("báo đúng tệp có nội dung khác biệt", () => {
    const snapA = new Map([["bot_1.json", { name: "bot_1", coin: 100 }]]);
    const snapB = new Map([["bot_1.json", { name: "bot_1", coin: 101 }]]);

    const res = compareDirectorySnapshots(snapA, snapB);
    expect(res.mismatchedFiles).toHaveLength(1);
    expect(res.mismatchedFiles[0].file).toBe("bot_1.json");
    expect(res.mismatchedFiles[0].diffs[0].keyPath).toBe("coin");
  });
});
