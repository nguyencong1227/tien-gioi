import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  TEST_WEIGHTS,
  WeightedSequencer,
  normalizeRelPath,
  partitionFiles,
} from "./vitest.sequencer";

function findTestFiles(dir: string, baseDir = dir): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findTestFiles(full, baseDir));
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      files.push(path.relative(baseDir, full).replace(/\\/g, "/"));
    }
  }
  return files;
}

/**
 * Kiểm tra bất biến sống còn của phân chia shard:
 * 1. Hợp tất cả các shard phải bằng đúng tập hợp tệp ban đầu.
 * 2. Mỗi tệp phải thuộc đúng một shard duy nhất (không trùng lặp, không thiếu).
 */
export function verifyPartitionInvariants(
  allFiles: string[],
  shards: string[][],
): {
  ok: boolean;
  reason?: string;
} {
  const totalInShards = shards.reduce((s, shard) => s + shard.length, 0);
  if (totalInShards !== allFiles.length) {
    return {
      ok: false,
      reason: `Tổng số tệp trong các shard (${totalInShards}) không bằng số tệp gốc (${allFiles.length})`,
    };
  }

  const seen = new Map<string, number>();
  for (let i = 0; i < shards.length; i++) {
    for (const file of shards[i]) {
      if (seen.has(file)) {
        return {
          ok: false,
          reason: `Tệp '${file}' bị trùng lặp ở shard ${seen.get(file)} và shard ${i + 1}`,
        };
      }
      seen.set(file, i + 1);
    }
  }

  for (const file of allFiles) {
    if (!seen.has(file)) {
      return {
        ok: false,
        reason: `Tệp '${file}' bị bỏ sót không thuộc bất kỳ shard nào`,
      };
    }
  }

  return { ok: true };
}

describe("vitest.sequencer: cân bằng shard theo thời lượng (#1380)", () => {
  it("normalizeRelPath: trích xuất đúng đường dẫn tương đối chuẩn hoá", () => {
    expect(normalizeRelPath("/app/server/src/foo.test.ts", "/app")).toBe("server/src/foo.test.ts");
    expect(normalizeRelPath("/app/client/src/bar.test.ts", "/app/")).toBe("client/src/bar.test.ts");
  });

  it("bất biến sống còn trên toàn bộ tệp test THẬT của repo (hợp = đúng mọi tệp, mỗi tệp đúng 1 shard)", () => {
    const rootDir = process.cwd();
    const realFiles = findTestFiles(rootDir);
    expect(realFiles.length).toBeGreaterThanOrEqual(450);

    const items = realFiles.map((f) => ({ spec: f, relPath: f }));
    const shards = partitionFiles(items, 3);

    expect(shards.length).toBe(3);

    const check = verifyPartitionInvariants(realFiles, shards);
    expect(check.ok).toBe(true);
    expect(check.reason).toBeUndefined();

    // 3 tệp nặng nhất phải nằm ở 3 shard khác nhau
    const mang = "server/src/balance/can-bang-sync.test.ts";
    const wr = "server/src/rooms/WorldRoom.test.ts";
    const rt = "server/scripts/red-team.test.ts";

    const shardOf = (file: string) => shards.findIndex((shard) => shard.includes(file));
    const sMang = shardOf(mang);
    const sWr = shardOf(wr);
    const sRt = shardOf(rt);

    expect(sMang).toBeGreaterThanOrEqual(0);
    expect(sWr).toBeGreaterThanOrEqual(0);
    expect(sRt).toBeGreaterThanOrEqual(0);

    // Không có hai tệp nào trong top 3 chung một shard
    expect(sMang).not.toBe(sWr);
    expect(sMang).not.toBe(sRt);
    expect(sWr).not.toBe(sRt);
  });

  it("tệp MỚI chưa có trong bảng trọng số tự động rơi vào đúng một shard (không bị bỏ rơi)", () => {
    const mockFiles = [
      "server/src/rooms/WorldRoom.test.ts",
      "server/src/balance/can-bang-sync.test.ts",
      "shared/src/tep-moi-tinh-chua-tung-co.test.ts",
      "client/src/tep-moi-khac.test.ts",
    ];

    const items = mockFiles.map((f) => ({ spec: f, relPath: f }));
    const shards = partitionFiles(items, 3);

    const check = verifyPartitionInvariants(mockFiles, shards);
    expect(check.ok).toBe(true);

    // Kiểm tra tệp mới xuất hiện đúng 1 lần
    const countNew = shards.reduce(
      (s, shard) =>
        s + shard.filter((f) => f === "shared/src/tep-moi-tinh-chua-tung-co.test.ts").length,
      0,
    );
    expect(countNew).toBe(1);
  });

  it("độ cân bằng giữa 3 shard: tổng trọng số dự kiến của mỗi shard chênh lệch không quá 10 giây", () => {
    const rootDir = process.cwd();
    const realFiles = findTestFiles(rootDir);
    const items = realFiles.map((f) => ({ spec: f, relPath: f }));
    const shards = partitionFiles(items, 3);

    const weights = shards.map((shard) =>
      shard.reduce((sum, f) => sum + (TEST_WEIGHTS[f] ?? 0.6), 0),
    );

    const minWeight = Math.min(...weights);
    const maxWeight = Math.max(...weights);
    const diff = maxWeight - minWeight;

    // Chênh lệch cực nhỏ (dưới 10s dự kiến)
    expect(diff).toBeLessThanOrEqual(10);
  });

  it("đột biến chứng minh test ĐỎ: bỏ sót 1 tệp hoặc gán trùng 1 tệp", () => {
    const files = ["a.test.ts", "b.test.ts", "c.test.ts"];

    // Đột biến 1: bỏ sót 1 tệp
    const shardsMissing = [["a.test.ts"], ["b.test.ts"], []];
    const check1 = verifyPartitionInvariants(files, shardsMissing);
    expect(check1.ok).toBe(false);
    expect(check1.reason).toContain("không bằng số tệp gốc");

    // Đột biến 2: gán trùng 1 tệp khiến tổng số tệp bị lệch
    const shardsDuplicate = [["a.test.ts", "b.test.ts"], ["b.test.ts"], ["c.test.ts"]];
    const check2 = verifyPartitionInvariants(files, shardsDuplicate);
    expect(check2.ok).toBe(false);
    expect(check2.reason).toContain("không bằng số tệp gốc");

    // Đột biến 3: gán trùng 1 tệp và bỏ sót 1 tệp (tổng số vẫn = 3 nhưng có tệp trùng)
    const shardsDuplicateSameTotal = [["a.test.ts"], ["b.test.ts"], ["b.test.ts"]];
    const check3 = verifyPartitionInvariants(files, shardsDuplicateSameTotal);
    expect(check3.ok).toBe(false);
    expect(check3.reason).toContain("bị trùng lặp");
  });

  describe("WeightedSequencer class: kiểm tra shard() và đột biến index lệch", () => {
    it("trả về toàn bộ tệp khi không cấu hình shard hoặc shard.count <= 1", async () => {
      const seq = new WeightedSequencer({} as any);
      (seq as any).ctx = { config: { root: "/repo" } };

      const mockSpecs = [{ moduleId: "/repo/a.test.ts" }, { moduleId: "/repo/b.test.ts" }];

      // Không có config.shard
      const res1 = await seq.shard(mockSpecs);
      expect(res1).toEqual(mockSpecs);

      // count = 1
      (seq as any).ctx = { config: { root: "/repo", shard: { index: 1, count: 1 } } };
      const res2 = await seq.shard(mockSpecs);
      expect(res2).toEqual(mockSpecs);
    });

    it("phân chia shard chính xác theo index (1-based)", async () => {
      const seq1 = new WeightedSequencer({} as any);
      const seq2 = new WeightedSequencer({} as any);
      const seq3 = new WeightedSequencer({} as any);

      (seq1 as any).ctx = { config: { root: "/repo", shard: { index: 1, count: 3 } } };
      (seq2 as any).ctx = { config: { root: "/repo", shard: { index: 2, count: 3 } } };
      (seq3 as any).ctx = { config: { root: "/repo", shard: { index: 3, count: 3 } } };

      const mockSpecs = [
        { moduleId: "/repo/server/src/rooms/WorldRoom.test.ts" },
        { moduleId: "/repo/server/src/balance/can-bang-sync.test.ts" },
        { moduleId: "/repo/server/scripts/red-team.test.ts" },
      ];

      const shard1 = await seq1.shard(mockSpecs);
      const shard2 = await seq2.shard(mockSpecs);
      const shard3 = await seq3.shard(mockSpecs);

      // Mỗi shard phải có đúng 1 trong 3 tệp
      expect(shard1.length).toBe(1);
      expect(shard2.length).toBe(1);
      expect(shard3.length).toBe(1);

      const all = [...shard1, ...shard2, ...shard3];
      expect(all.length).toBe(3);
    });

    it("đột biến index lệch: index out of bounds trả về mảng rỗng []", async () => {
      const seq = new WeightedSequencer({} as any);

      // index = 4 trong khi count = 3
      (seq as any).ctx = { config: { root: "/repo", shard: { index: 4, count: 3 } } };
      const mockSpecs = [{ moduleId: "/repo/a.test.ts" }, { moduleId: "/repo/b.test.ts" }];

      const resHigh = await seq.shard(mockSpecs);
      expect(resHigh).toEqual([]);

      // index = 0 (Vitest shard index là 1-based)
      (seq as any).ctx = { config: { root: "/repo", shard: { index: 0, count: 3 } } };
      const resZero = await seq.shard(mockSpecs);
      expect(resZero).toEqual([]);
    });
  });
});
