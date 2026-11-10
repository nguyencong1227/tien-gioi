// Bộ ca kiểm thử hợp đồng store (M3 bước 3f, Issue #176, docs/THIET_KE_TAI_KHOAN.md mục 6).
// Chạy MỘT bộ hợp đồng cho cả File* (hiện tại) và Pg* (khi bước 3e hoàn thành).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { PlayerStore } from "./player-store";
import type { SoulStore } from "./soul";
import type { SavedPlayer } from "./store";

// Thư mục dữ liệu tạm cho FilePlayerStore và FileSoulStore
const testDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-store-contract-"));
process.env.DATA_DIR = testDir;

// Nạp động các store sau khi đã cấu hình DATA_DIR
const { FilePlayerStore } = await import("./player-store");
const { FileSoulStore } = await import("./soul");

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

/** Mẫu dữ liệu nhân vật hợp lệ cho test. */
export const makeSavedPlayer = (name: string, overrides?: Partial<SavedPlayer>): SavedPlayer => ({
  name,
  secretHash: "sample-secret-hash",
  realm: 1,
  tier: 0,
  exp: 0,
  coin: 100,
  mapId: "world",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

/**
 * Bộ kiểm thử hợp đồng cho PlayerStore: mọi cài đặt của PlayerStore (FilePlayerStore, PgPlayerStore)
 * phải thoả mãn toàn bộ các quy tắc trong suite này.
 */
export function describePlayerStoreContract(
  storeName: string,
  createStore: () => Promise<PlayerStore> | PlayerStore,
) {
  describe(`Hợp đồng PlayerStore (${storeName})`, () => {
    it("load nhân vật chưa lưu trả về null", async () => {
      const store = await createStore();
      const nonExistent = await store.load("Nhan Vat Chua Ton Tai");
      expect(nonExistent).toBeNull();
    });

    it("save rồi load trả về đúng dữ liệu đã lưu", async () => {
      const store = await createStore();
      const player = makeSavedPlayer("Hàn Lập", {
        realm: 2,
        tier: 3,
        exp: 1500,
        coin: 500,
      });

      await store.save(player);
      const loaded = await store.load("Hàn Lập");

      expect(loaded).not.toBeNull();
      expect(loaded?.name).toBe("Hàn Lập");
      expect(loaded?.realm).toBe(2);
      expect(loaded?.tier).toBe(3);
      expect(loaded?.exp).toBe(1500);
      expect(loaded?.coin).toBe(500);
      expect(loaded?.secretHash).toBe("sample-secret-hash");
    });

    it("đạo hiệu không phân biệt hoa thường và chuẩn hoá NFC", async () => {
      const store = await createStore();
      const player = makeSavedPlayer("Lâm Thanh Tùng", { exp: 99 });
      await store.save(player);

      // Chữ thường
      const lower = await store.load("lâm thanh tùng");
      expect(lower?.exp).toBe(99);

      // Chữ hoa
      const upper = await store.load("LÂM THANH TÙNG");
      expect(upper?.exp).toBe(99);

      // Dạng tổ hợp NFD phải khớp dạng dựng sẵn NFC
      const nfdName = "Lâm Thanh Tùng".normalize("NFD");
      const nfd = await store.load(nfdName);
      expect(nfd?.exp).toBe(99);
    });

    it("các lần save cùng một nhân vật được xếp hàng tuần tự: bản gọi sau luôn là bản cuối cùng", async () => {
      const store = await createStore();
      const name = "Xep Hang Dong Thoi";
      const count = 30;

      // Gửi 30 lệnh save đồng thời với exp tăng dần
      const jobs: Promise<void>[] = [];
      for (let i = 0; i < count; i++) {
        jobs.push(store.save(makeSavedPlayer(name, { exp: i })));
      }
      await Promise.all(jobs);

      // Bản cuối cùng phải có exp = count - 1
      const finalPlayer = await store.load(name);
      expect(finalPlayer?.exp).toBe(count - 1);
    });

    it("lỗi một lần save không làm chặn hay nghẽn các lần save tiếp theo (failure isolation)", async () => {
      const store = await createStore();
      const name = "Nhan Vat Loi Co Lap";

      // 1. Lưu bản đầu thành công
      await store.save(makeSavedPlayer(name, { exp: 10 }));
      expect((await store.load(name))?.exp).toBe(10);

      // 2. Lưu bản lỗi (BigInt gây lỗi JSON.stringify khi ghi file)
      const badPlayer = {
        ...makeSavedPlayer(name, { exp: 20 }),
        invalidData: 123456789012345678901234567890n,
      } as unknown as SavedPlayer;

      await expect(store.save(badPlayer)).rejects.toThrow();

      // 3. Lần lưu hợp lệ tiếp theo vẫn phải thành công bình thường
      await expect(store.save(makeSavedPlayer(name, { exp: 30 }))).resolves.toBeUndefined();
      const recovered = await store.load(name);
      expect(recovered?.exp).toBe(30);
    });

    it("thao tác trên nhân vật A không làm ảnh hưởng hay nghẽn nhân vật B", async () => {
      const store = await createStore();
      const playerA = makeSavedPlayer("Nhan Vat A", { exp: 111 });
      const playerB = makeSavedPlayer("Nhan Vat B", { exp: 222 });

      await Promise.all([store.save(playerA), store.save(playerB)]);

      const loadedA = await store.load("Nhan Vat A");
      const loadedB = await store.load("Nhan Vat B");

      expect(loadedA?.exp).toBe(111);
      expect(loadedB?.exp).toBe(222);
    });
  });
}

/**
 * Bộ kiểm thử hợp đồng cho SoulStore: mọi cài đặt của SoulStore (FileSoulStore, PgSoulStore)
 * phải thoả mãn toàn bộ các quy tắc trong suite này.
 */
export function describeSoulStoreContract(
  storeName: string,
  createStore: () => Promise<SoulStore> | SoulStore,
) {
  describe(`Hợp đồng SoulStore (${storeName})`, () => {
    it("get chân linh chưa có trả về null", async () => {
      const store = await createStore();
      expect(await store.get("chua_co_linh_hon")).toBeNull();
    });

    it("create tạo mới chân linh kiếp 1, duyên 0; gọi lại lần hai không ghi đè", async () => {
      const store = await createStore();
      const id = "linh_hon_tao_moi";

      // Lần đầu tạo mới
      const soul1 = await store.create(id, (s) => ({
        ...s,
        best: { step: 5, realm: 0, tier: 5 },
      }));
      expect(soul1.id).toBe(id);
      expect(soul1.kiep).toBe(1);
      expect(soul1.duyen).toBe(0);
      expect(soul1.best.step).toBe(5);

      // Cập nhật duyên lên 50
      await store.update(id, (s) => ({ ...s, duyen: 50 }));

      // Gọi create lần 2: phải trả về bản ghi hiện tại có duyen = 50, không bị đè bởi init mới
      const soul2 = await store.create(id, (s) => ({ ...s, duyen: 999 }));
      expect(soul2.duyen).toBe(50);
      expect((await store.get(id))?.duyen).toBe(50);
    });

    it("update nguyên tử: đua nhiều cập nhật đồng thời không mất lần nào (no lost updates)", async () => {
      const store = await createStore();
      const id = "linh_hon_dua_cap_nhat";
      await store.create(id);

      const count = 40;
      // Chạy 40 lần update đồng thời tăng dần duyen và duyenTotal
      await Promise.all(
        Array.from({ length: count }, () =>
          store.update(id, (s) => ({
            ...s,
            duyen: s.duyen + 1,
            duyenTotal: s.duyenTotal + 1,
          })),
        ),
      );

      const finalSoul = await store.get(id);
      expect(finalSoul?.duyen).toBe(count);
      expect(finalSoul?.duyenTotal).toBe(count);
    });

    it("update trên id chưa tồn tại thì tự động tạo mới rồi áp dụng hàm fn", async () => {
      const store = await createStore();
      const id = "linh_hon_update_chua_co";

      const soul = await store.update(id, (s) => ({
        ...s,
        duyen: 15,
        duyenTotal: 15,
      }));

      expect(soul.id).toBe(id);
      expect(soul.kiep).toBe(1);
      expect(soul.duyen).toBe(15);
      expect(soul.duyenTotal).toBe(15);

      const fetched = await store.get(id);
      expect(fetched?.duyen).toBe(15);
    });

    it("fn trong update ném lỗi thì reject, giữ nguyên trạng thái cũ và không chặn lần sau", async () => {
      const store = await createStore();
      const id = "linh_hon_update_loi";
      await store.create(id);
      await store.update(id, (s) => ({ ...s, duyen: 10 }));

      // Update ném lỗi cố ý
      await expect(
        store.update(id, () => {
          throw new Error("Lỗi cố ý trong callback");
        }),
      ).rejects.toThrow("Lỗi cố ý trong callback");

      // Trạng thái cũ vẫn giữ nguyên duyen = 10
      expect((await store.get(id))?.duyen).toBe(10);

      // Lần update tiếp theo vẫn chạy bình thường
      const nextSoul = await store.update(id, (s) => ({ ...s, duyen: s.duyen + 5 }));
      expect(nextSoul.duyen).toBe(15);
      expect((await store.get(id))?.duyen).toBe(15);
    });

    it("thao tác trên id1 không làm nghẽn hoặc ảnh hưởng id2", async () => {
      const store = await createStore();
      const id1 = "soul_alpha";
      const id2 = "soul_beta";

      await Promise.all([
        store.create(id1, (s) => ({ ...s, duyen: 100 })),
        store.create(id2, (s) => ({ ...s, duyen: 200 })),
      ]);

      expect((await store.get(id1))?.duyen).toBe(100);
      expect((await store.get(id2))?.duyen).toBe(200);
    });
  });
}

// -----------------------------------------------------------------------
// Chạy bộ test hợp đồng trên các triển khai hiện có (FilePlayerStore, FileSoulStore)
// -----------------------------------------------------------------------

describePlayerStoreContract("FilePlayerStore", () => new FilePlayerStore());

let soulStoreCounter = 0;
describeSoulStoreContract(
  "FileSoulStore",
  () =>
    new FileSoulStore(
      path.join(testDir, `soul-store-${++soulStoreCounter}`),
      () => "2026-11-10T00:00:00.000Z",
    ),
);
