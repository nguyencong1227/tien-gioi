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

  describe("WeightedSequencer.shard (nối với config.shard)", () => {
    it("ba shard i/3 qua shard() thật: hợp = mọi tệp, mỗi tệp đúng một shard, không shard nào rỗng", async () => {
      const root = process.cwd();
      const all = findTestFiles(root);
      const specs = all.map((f) => ({ moduleId: path.join(root, f) }));
      const seen = new Map<string, number>();
      for (const index of [1, 2, 3]) {
        const ctx = { config: { root, shard: { index, count: 3 } } };
        const seq = new WeightedSequencer(ctx as never);
        const mine = (await seq.shard(specs as never)) as { moduleId: string }[];
        expect(mine.length).toBeGreaterThan(0);
        for (const s of mine) {
          const rel = path.relative(root, s.moduleId).replace(/\\/g, "/");
          expect(seen.has(rel), `${rel} trùng`).toBe(false);
          seen.set(rel, index);
        }
      }
      expect([...seen.keys()].sort()).toEqual([...all].sort());
    });

    it("không có config.shard thì trả nguyên danh sách; count = 1 cũng vậy", async () => {
      const root = process.cwd();
      const specs = [
        { moduleId: path.join(root, "a.test.ts") },
        { moduleId: path.join(root, "b.test.ts") },
      ];
      const none = new WeightedSequencer({ config: { root } } as never);
      expect(await none.shard(specs as never)).toHaveLength(2);
      const one = new WeightedSequencer({
        config: { root, shard: { index: 1, count: 1 } },
      } as never);
      expect(await one.shard(specs as never)).toHaveLength(2);
    });

    it("đột biến index lệch: index out of bounds trả về mảng rỗng []", async () => {
      const root = process.cwd();
      const seq = new WeightedSequencer({
        config: { root, shard: { index: 4, count: 3 } },
      } as never);
      const mockSpecs = [{ moduleId: path.join(root, "a.test.ts") }];
      expect(await seq.shard(mockSpecs as never)).toEqual([]);

      const seqZero = new WeightedSequencer({
        config: { root, shard: { index: 0, count: 3 } },
      } as never);
      expect(await seqZero.shard(mockSpecs as never)).toEqual([]);
    });
  });
});
