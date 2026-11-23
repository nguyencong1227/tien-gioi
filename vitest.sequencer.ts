// Sequencer tuỳ biến của Vitest: phân chia shard theo thời lượng (Bin-packing LPT)
// để cân bằng các shard CI mà vẫn bảo đảm bất biến: mỗi tệp test đúng một shard,
// không thiếu, không trùng, tệp mới tự động rơi vào đúng một shard (Issue #1380).
import crypto from "node:crypto";
import path from "node:path";
import { BaseSequencer } from "vitest/node";

/**
 * Trọng số thời lượng đo được (giây) của các tệp test nặng nhất.
 * Tệp không có trong danh sách được gán trọng số mặc định 0.6 giây và sắp xếp bằng SHA-1.
 */
export const TEST_WEIGHTS: Record<string, number> = {
  "server/src/rooms/WorldRoom.test.ts": 94,
  "server/src/balance/can-bang-sync.test.ts": 87,
  "server/scripts/red-team.test.ts": 54,
  "server/src/rooms/WorldRoom.arena.test.ts": 37,
  "server/scripts/dungeon-stress.test.ts": 27,
  "server/src/rooms/WorldRoom.dungeon.test.ts": 20,
  "server/src/balance/search-check.test.ts": 17,
  "server/src/rooms/WorldRoom.ambush.test.ts": 15,
  "server/scripts/portal-stress.test.ts": 10,
  "server/scripts/duel-stress.test.ts": 9,
  "server/src/balance/trum-the-gioi.test.ts": 9,
  "server/src/balance/chan-duong.test.ts": 9,
  "server/src/rooms/WorldRoom.ambush-rush.test.ts": 9,
  "server/src/rooms/WorldRoom.achievements.test.ts": 9,
  "server/scripts/kiem-mat-ket-noi.test.ts": 9,
  "server/src/balance/trum.test.ts": 8,
  "server/src/rooms/WorldRoom.movement.test.ts": 8,
  "server/src/rooms/WorldRoom.boss.test.ts": 8,
  "server/src/systems/perf.test.ts": 7,
  "server/src/rooms/WorldRoom.duel.test.ts": 5,
};

export function normalizeRelPath(moduleId: string, rootDir: string): string {
  const normModule = moduleId.replace(/\\/g, "/");
  const normRoot = rootDir.replace(/\\/g, "/").replace(/\/+$/, "");
  if (normModule.startsWith(normRoot)) {
    return normModule.slice(normRoot.length).replace(/^\/+/, "");
  }
  return path.relative(rootDir, moduleId).replace(/\\/g, "/");
}

/**
 * Phân chia danh sách tệp vào `count` shard theo thuật toán Longest Processing Time first (LPT).
 * @param items Danh sách tệp cần phân chia
 * @param count Số lượng shard (ví dụ 3)
 * @param weights Bảng trọng số thời lượng
 */
export function partitionFiles<T>(
  items: { spec: T; relPath: string }[],
  count: number,
  weights: Record<string, number> = TEST_WEIGHTS,
): T[][] {
  if (count <= 1) return [items.map((i) => i.spec)];

  // Sắp xếp:
  // 1. Tệp nặng xếp trước theo trọng số giảm dần
  // 2. Tệp bằng trọng số (hoặc tệp mặc định 0.6s) sắp xếp theo SHA-1 của đường dẫn để đảm bảo ổn định 100%
  const decorated = items
    .map((item) => {
      const w = weights[item.relPath] ?? 0.6;
      const h = crypto.createHash("sha1").update(item.relPath).digest("hex");
      return { ...item, weight: w, hash: h };
    })
    .sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight;
      return a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0;
    });

  const buckets: { files: T[]; totalWeight: number }[] = Array.from({ length: count }, () => ({
    files: [],
    totalWeight: 0,
  }));

  for (const item of decorated) {
    // Đưa vào bucket có tổng trọng số nhỏ nhất hiện tại
    let minIdx = 0;
    for (let i = 1; i < count; i++) {
      if (buckets[i].totalWeight < buckets[minIdx].totalWeight) {
        minIdx = i;
      }
    }
    buckets[minIdx].files.push(item.spec);
    buckets[minIdx].totalWeight += item.weight;
  }

  return buckets.map((b) => b.files);
}

export class WeightedSequencer extends BaseSequencer {
  override async shard(files: any[]): Promise<any[]> {
    const { config } = this.ctx;
    if (!config.shard) return files;

    const { index, count } = config.shard;
    if (count <= 1) return files;

    const items = files.map((spec) => ({
      spec,
      relPath: normalizeRelPath(spec.moduleId, config.root),
    }));

    const partitioned = partitionFiles(items, count);
    return partitioned[index - 1] ?? [];
  }
}

export default WeightedSequencer;
