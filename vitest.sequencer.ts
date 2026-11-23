// Sequencer tuỳ biến của Vitest: phân chia shard theo thời lượng (Bin-packing LPT)
// để cân bằng các shard CI mà vẫn bảo đảm bất biến: mỗi tệp test đúng một shard,
// không thiếu, không trùng, tệp mới tự động rơi vào đúng một shard (Issue #1380).
//
// ============================================================================
// HƯỚNG DẪN LÀM TƯƠI TEST_WEIGHTS KHI CÓ TEST MỚI NẶNG:
// 1. Khi nào cần làm tươi:
//    - Khi thêm tệp test mới có thời gian chạy nặng (> 5-10 giây, ví dụ test stress,
//      test cân bằng mô phỏng, WorldRoom integration...).
//    - Hoặc khi thấy thời lượng các shard CI bị lệch (1 shard chạy lâu hơn các shard khác > 20s).
// 2. Cách đo thời lượng tệp test:
//    - Đọc từ log CI GitHub Actions: mỗi shard in ra thời gian chạy của từng tệp test.
//    - Hoặc chạy cục bộ:
//      `npx vitest run --reporter=verbose` hoặc `npx vitest run --reporter=json`
//      để lấy thời lượng thực tế (tính theo giây).
// 3. Cách cập nhật bảng TEST_WEIGHTS:
//    - Thêm/cập nhật đường dẫn tương đối (chuẩn hoá dấu gạch `/`, tính từ gốc repo)
//      và thời lượng ước tính (giây, làm tròn) vào đối tượng TEST_WEIGHTS bên dưới.
//    - Các tệp test nhỏ (< 5s) KHÔNG CẦN thêm vào danh sách; hệ thống tự động gán
//      trọng số mặc định 0.6s và phân bổ đều bằng SHA-1 hash.
// 4. Kiểm tra sau khi cập nhật:
//    - Chạy `npm test vitest.sequencer.test.ts` để xác nhận:
//      + Mọi bất biến phân chia (hợp đủ, không trùng, không sót) được giữ vững.
//      + Độ chênh lệch giữa các shard dự kiến <= 10s.
// ============================================================================
import crypto from "node:crypto";
import path from "node:path";
import { BaseSequencer } from "vitest/node";

/**
 * Trọng số thời lượng đo được (giây) của các tệp test nặng nhất.
 * Tệp không có trong danh sách được gán trọng số mặc định 0.6 giây và sắp xếp bằng SHA-1.
 */
export const TEST_WEIGHTS: Record<string, number> = {
  "server/src/balance/can-bang-sync.test.ts": 124,
  "server/src/rooms/WorldRoom.test.ts": 94,
  "server/scripts/red-team.test.ts": 55,
  "server/src/rooms/WorldRoom.arena.test.ts": 37,
  "server/scripts/dungeon-stress.test.ts": 27,
  "server/src/rooms/WorldRoom.dungeon.test.ts": 20,
  "server/src/balance/chan-duong.test.ts": 18,
  "server/src/balance/search-check.test.ts": 17,
  "server/src/balance/trum-the-gioi.test.ts": 15,
  "server/src/rooms/WorldRoom.ambush.test.ts": 15,
  "server/scripts/portal-stress.test.ts": 10,
  "server/scripts/duel-stress.test.ts": 9,
  "server/src/rooms/WorldRoom.ambush-rush.test.ts": 9,
  "server/src/rooms/WorldRoom.achievements.test.ts": 9,
  "server/scripts/kiem-mat-ket-noi.test.ts": 9,
  "server/src/balance/trum.test.ts": 8,
  "server/src/rooms/WorldRoom.movement.test.ts": 8,
  "server/src/rooms/WorldRoom.boss.test.ts": 8,
  "server/src/systems/perf.test.ts": 7,
  "server/src/systems/economy-fuzz.test.ts": 7,
  "server/src/systems/boss-fuzz.test.ts": 7,
  "server/src/store-fuzz.test.ts": 6,
  "server/src/systems/movement-fuzz.test.ts": 6,
  "server/src/systems/boss-escape-zone.test.ts": 6,
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

  override async sort(files: any[]): Promise<any[]> {
    const root = this.ctx.config.root;
    const w = (s: any) => TEST_WEIGHTS[normalizeRelPath(s.moduleId, root)] ?? 0.6;
    return [...files].sort(
      (a, b) => w(b) - w(a) || (a.moduleId < b.moduleId ? -1 : a.moduleId > b.moduleId ? 1 : 0),
    );
  }
}

export default WeightedSequencer;
