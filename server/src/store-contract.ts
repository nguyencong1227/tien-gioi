// Bộ ca kiểm thử hợp đồng store (M3 bước 3f, Issue #176, docs/THIET_KE_TAI_KHOAN.md mục 6).
// Module này chỉ chứa định nghĩa hợp đồng kiểm thử, tái sử dụng cho cả File* và Pg*.
import { describe, expect, it } from "vitest";
import type { AccountStore, NewAccount, SessionRecord, SessionStore } from "./account-store";
import { hashToken } from "./auth";
import type { PlayerStore } from "./player-store";
import type { SoulStore } from "./soul";
import type { SavedPlayer } from "./store";

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

/** Mẫu dữ liệu tài khoản hợp lệ cho test. */
export const makeNewAccount = (username: string, overrides?: Partial<NewAccount>): NewAccount => ({
  username,
  passHash: "scrypt$1024$8$1$c2FsdHNhbHRzYWx0$aGFzaGhhc2hoYXNoaGFzaGhhc2g",
  recoveryHash: "scrypt$1024$8$1$c2FsdHNhbHRzYWx0$aGFzaGhhc2hoYXNoaGFzaGhhc2g",
  createdAt: "2026-11-10T00:00:00.000Z",
  lastLoginAt: "2026-11-10T00:00:00.000Z",
  disabled: false,
  ...overrides,
});

/** Mẫu dữ liệu phiên hợp lệ cho test. */
export const makeSessionRecord = (
  token: string,
  accountId: string,
  expiresAt: number,
  overrides?: Partial<SessionRecord>,
): SessionRecord => ({
  tokenHash: hashToken(token),
  accountId,
  createdAt: 1000,
  expiresAt,
  lastSeenAt: 1000,
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

      // Chưa await bad: lần lưu hợp lệ tiếp theo xếp hàng NGAY SAU lần lỗi
      const bad = store.save(badPlayer);
      const good = store.save(makeSavedPlayer(name, { exp: 30 }));

      await expect(bad).rejects.toThrow();
      await expect(good).resolves.toBeUndefined();

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

      // Update ném lỗi cố ý; lần sau xếp hàng NGAY SAU (chưa await) và phải chạy trên trạng thái cũ (10)
      const bad = store.update(id, () => {
        throw new Error("Lỗi cố ý trong callback");
      });
      const next = store.update(id, (s) => ({ ...s, duyen: s.duyen + 5 }));

      await expect(bad).rejects.toThrow("Lỗi cố ý trong callback");
      expect((await next).duyen).toBe(15);
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

/**
 * Bộ kiểm thử hợp đồng cho AccountStore: mọi cài đặt của AccountStore (FileAccountStore, PgAccountStore)
 * phải thoả mãn toàn bộ các quy tắc trong suite này.
 */
export function describeAccountStoreContract(
  storeName: string,
  createStore: () => Promise<AccountStore> | AccountStore,
) {
  describe(`Hợp đồng AccountStore (${storeName})`, () => {
    it("create và tra cứu theo byUsername, byId; tra cứu không tồn tại trả về null", async () => {
      const store = await createStore();
      const acc = await store.create(makeNewAccount("nguyen_anh"));
      expect(acc).not.toBeNull();
      expect(acc?.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(acc?.username).toBe("nguyen_anh");
      expect(acc?.name).toBeUndefined();

      const byUser = await store.byUsername("nguyen_anh");
      expect(byUser?.id).toBe(acc?.id);

      const byId = await store.byId(acc!.id);
      expect(byId?.username).toBe("nguyen_anh");

      expect(await store.byUsername("chua_tung_co")).toBeNull();
      expect(await store.byId("00000000-0000-0000-0000-000000000000")).toBeNull();
    });

    it("create từ chối tên đăng nhập trùng (trả về null)", async () => {
      const store = await createStore();
      const first = await store.create(makeNewAccount("trung_ten"));
      expect(first).not.toBeNull();

      const second = await store.create(makeNewAccount("trung_ten"));
      expect(second).toBeNull();
    });

    it("đua tạo cùng một tên đăng nhập đồng thời: đúng một yêu cầu thành công", async () => {
      const store = await createStore();
      const count = 40;
      const results = await Promise.all(
        Array.from({ length: count }, () => store.create(makeNewAccount("dua_ten_dang_nhap"))),
      );
      const successes = results.filter((r) => r !== null);
      expect(successes).toHaveLength(1);
    });

    it("setName: đặt một lần, tra byName (không phân biệt hoa thường, NFC); tài khoản đã có đạo hiệu trả về has_character", async () => {
      const store = await createStore();
      const acc = (await store.create(makeNewAccount("user_dat_ten")))!;

      // Tra byName khi chưa có ai nhận trả về null
      expect(await store.byName("Bạch Tiểu Thuần")).toBeNull();

      const res = await store.setName(acc.id, "Bạch Tiểu Thuần");
      expect(res).toBe("ok");

      // Tra byName không phân biệt hoa thường và chuẩn hoá NFC
      const byLower = await store.byName("bạch tiểu thuần");
      expect(byLower?.id).toBe(acc.id);

      const byUpper = await store.byName("BẠCH TIỂU THUẦN");
      expect(byUpper?.id).toBe(acc.id);

      const nfdName = "Bạch Tiểu Thuần".normalize("NFD");
      const byNfd = await store.byName(nfdName);
      expect(byNfd?.id).toBe(acc.id);

      // Đã có đạo hiệu thì không đổi được
      const secondTry = await store.setName(acc.id, "Đạo Hiệu Khác");
      expect(secondTry).toBe("has_character");

      // setName trên id không tồn tại trả về not_found
      expect(await store.setName("00000000-0000-0000-0000-000000000000", "Người Vô Danh")).toBe(
        "not_found",
      );
    });

    it("tranh chấp cùng một đạo hiệu đồng thời giữa hai tài khoản: đúng một bên được ok, bên kia name_taken", async () => {
      const store = await createStore();
      const accA = (await store.create(makeNewAccount("tai_khoan_a")))!;
      const accB = (await store.create(makeNewAccount("tai_khoan_b")))!;

      const [resA, resB] = await Promise.all([
        store.setName(accA.id, "Vương Lâm"),
        store.setName(accB.id, "VƯƠNG LÂM"),
      ]);

      expect([resA, resB].sort()).toEqual(["name_taken", "ok"]);

      const winner = resA === "ok" ? accA : accB;
      const loser = resA === "ok" ? accB : accA;

      expect((await store.byName("vương lâm"))?.id).toBe(winner.id);
      expect((await store.byId(loser.id))?.name).toBeUndefined();

      // Bên thua có thể chọn một đạo hiệu khác
      expect(await store.setName(loser.id, "Tên Khác")).toBe("ok");
      expect((await store.byId(loser.id))?.name).toBe("Tên Khác");
    });

    it("update: cập nhật mật khẩu, mã khôi phục, lần đăng nhập, khoá; giữ nguyên id, username, name", async () => {
      const store = await createStore();
      const acc = (await store.create(makeNewAccount("user_cap_nhat")))!;
      await store.setName(acc.id, "Hàn Lập");

      const updated = await store.update(acc.id, {
        passHash: "pass-hash-moi",
        recoveryHash: "recovery-hash-moi",
        lastLoginAt: "2026-11-11T12:00:00.000Z",
        disabled: true,
      });

      expect(updated).not.toBeNull();
      expect(updated?.id).toBe(acc.id);
      expect(updated?.username).toBe("user_cap_nhat");
      expect(updated?.name).toBe("Hàn Lập");
      expect(updated?.passHash).toBe("pass-hash-moi");
      expect(updated?.recoveryHash).toBe("recovery-hash-moi");
      expect(updated?.lastLoginAt).toBe("2026-11-11T12:00:00.000Z");
      expect(updated?.disabled).toBe(true);

      // Update trên id không tồn tại trả về null
      expect(
        await store.update("00000000-0000-0000-0000-000000000000", { disabled: true }),
      ).toBeNull();
    });

    it("all: trả về toàn bộ tài khoản, sắp xếp theo ngày tạo (cũ trước), rồi đến tên đăng nhập", async () => {
      const store = await createStore();
      expect(await store.all()).toEqual([]);

      await store.create({ ...makeNewAccount("user_c"), createdAt: "2026-11-12T00:00:00.000Z" });
      await store.create({ ...makeNewAccount("user_b"), createdAt: "2026-11-10T00:00:00.000Z" });
      await store.create({ ...makeNewAccount("user_a"), createdAt: "2026-11-10T00:00:00.000Z" });

      const all = await store.all();
      expect(all.map((a) => a.username)).toEqual(["user_a", "user_b", "user_c"]);
    });
  });
}

/**
 * Bộ kiểm thử hợp đồng cho SessionStore: mọi cài đặt của SessionStore (FileSessionStore, PgSessionStore)
 * phải thoả mãn toàn bộ các quy tắc trong suite này.
 */
export function describeSessionStoreContract(
  storeName: string,
  createStore: () => Promise<SessionStore> | SessionStore,
) {
  describe(`Hợp đồng SessionStore (${storeName})`, () => {
    it("create và get phiên; tra token lạ trả về null", async () => {
      const store = await createStore();
      const accId = "11111111-1111-1111-1111-111111111111";
      const sess = makeSessionRecord("token-alpha", accId, 5000);

      await store.create(sess);
      const found = await store.get(sess.tokenHash);

      expect(found).not.toBeNull();
      expect(found?.tokenHash).toBe(sess.tokenHash);
      expect(found?.accountId).toBe(accId);
      expect(found?.expiresAt).toBe(5000);
      expect(found?.createdAt).toBe(1000);
      expect(found?.lastSeenAt).toBe(1000);

      expect(await store.get(hashToken("token-chua-tung-co"))).toBeNull();
    });

    it("touch cập nhật lastSeenAt và expiresAt nhưng giữ nguyên createdAt và accountId", async () => {
      const store = await createStore();
      const accId = "11111111-1111-1111-1111-111111111111";
      const sess = makeSessionRecord("token-touch", accId, 5000);
      await store.create(sess);

      await store.touch(sess.tokenHash, 2500, 10000);
      const touched = await store.get(sess.tokenHash);

      expect(touched?.lastSeenAt).toBe(2500);
      expect(touched?.expiresAt).toBe(10000);
      expect(touched?.createdAt).toBe(1000);
      expect(touched?.accountId).toBe(accId);

      // touch trên tokenHash lạ không ném lỗi
      await expect(store.touch(hashToken("la"), 1, 2)).resolves.toBeUndefined();
    });

    it("delete xoá phiên chỉ định (idempotent)", async () => {
      const store = await createStore();
      const accId = "11111111-1111-1111-1111-111111111111";
      const sess = makeSessionRecord("token-del", accId, 5000);
      await store.create(sess);

      await store.delete(sess.tokenHash);
      expect(await store.get(sess.tokenHash)).toBeNull();

      // Xoá lần hai không ném lỗi
      await expect(store.delete(sess.tokenHash)).resolves.toBeUndefined();
    });

    it("deleteAllOf chỉ xoá toàn bộ phiên của tài khoản chỉ định; trả về đúng số phiên đã xoá", async () => {
      const store = await createStore();
      const accA = "11111111-1111-1111-1111-111111111111";
      const accB = "22222222-2222-2222-2222-222222222222";

      const sessA1 = makeSessionRecord("token-a1", accA, 5000);
      const sessA2 = makeSessionRecord("token-a2", accA, 8000);
      const sessB = makeSessionRecord("token-b1", accB, 6000);

      await store.create(sessA1);
      await store.create(sessA2);
      await store.create(sessB);

      const deletedCount = await store.deleteAllOf(accA);
      expect(deletedCount).toBe(2);

      expect(await store.get(sessA1.tokenHash)).toBeNull();
      expect(await store.get(sessA2.tokenHash)).toBeNull();
      expect(await store.get(sessB.tokenHash)).not.toBeNull();

      // Gọi lại deleteAllOf trên accA thì trả về 0
      expect(await store.deleteAllOf(accA)).toBe(0);
    });

    it("deleteExpired xoá các phiên có expiresAt <= now; các phiên chưa hết hạn vẫn giữ nguyên", async () => {
      const store = await createStore();
      const accId = "11111111-1111-1111-1111-111111111111";

      const s1 = makeSessionRecord("token-exp-1", accId, 3000);
      const s2 = makeSessionRecord("token-exp-2", accId, 5000);
      const s3 = makeSessionRecord("token-exp-3", accId, 9000);

      await store.create(s1);
      await store.create(s2);
      await store.create(s3);

      // now = 5000: s1 (3000) và s2 (5000) bị xoá; s3 (9000) còn lại
      const count = await store.deleteExpired(5000);
      expect(count).toBe(2);

      expect(await store.get(s1.tokenHash)).toBeNull();
      expect(await store.get(s2.tokenHash)).toBeNull();
      expect(await store.get(s3.tokenHash)).not.toBeNull();

      // Gọi lại với now = 5000 thì không còn phiên nào bị xoá nữa
      expect(await store.deleteExpired(5000)).toBe(0);
    });
  });
}
