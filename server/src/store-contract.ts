// Bộ ca kiểm thử hợp đồng store (M3 bước 3f, Issue #176, docs/THIET_KE_TAI_KHOAN.md mục 6).
// Module này chỉ chứa định nghĩa hợp đồng kiểm thử, tái sử dụng cho cả File* và Pg*.
import { SECT_COIN_CAP, SECT_LOG_MAX } from "@tien-gioi/shared";
import { describe, expect, it } from "vitest";
import type { AccountStore, NewAccount, SessionRecord, SessionStore } from "./account-store";
import { hashToken } from "./auth";
import type { PlayerStore } from "./player-store";
import { SectConflictError, type Sect, type SectStore } from "./sect-store";
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

    it("delete xoá nhân vật đã lưu; gọi lại trả về false", async () => {
      const store = await createStore();
      const player = makeSavedPlayer("Nhân Vật Xoá");
      await store.save(player);
      expect(await store.load("Nhân Vật Xoá")).not.toBeNull();

      const deleted = await store.delete("Nhân Vật Xoá");
      expect(deleted).toBe(true);
      expect(await store.load("Nhân Vật Xoá")).toBeNull();

      // Xoá lại lần hai trả về false
      expect(await store.delete("Nhân Vật Xoá")).toBe(false);
    });

    it("delete nhân vật chưa từng tồn tại trả về false", async () => {
      const store = await createStore();
      expect(await store.delete("Chua Tung Co")).toBe(false);
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

    it("delete xoá chân linh đã lưu; gọi lại trả về false", async () => {
      const store = await createStore();
      const id = "linh_hon_can_xoa";
      await store.create(id);
      expect(await store.get(id)).not.toBeNull();

      const deleted = await store.delete(id);
      expect(deleted).toBe(true);
      expect(await store.get(id)).toBeNull();

      // Xoá lại lần hai trả về false
      expect(await store.delete(id)).toBe(false);
    });

    it("delete chân linh chưa từng tồn tại trả về false", async () => {
      const store = await createStore();
      expect(await store.delete("chua_tung_co")).toBe(false);
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

    it("delete xoá tài khoản theo id; giải phóng username và name để đăng ký lại được", async () => {
      const store = await createStore();
      const acc = await store.create(makeNewAccount("user_can_xoa"));
      expect(acc).not.toBeNull();
      const id = acc!.id;
      await store.setName(id, "Đạo Hiệu Xoá");

      expect(await store.byId(id)).not.toBeNull();
      expect(await store.byUsername("user_can_xoa")).not.toBeNull();
      expect(await store.byName("Đạo Hiệu Xoá")).not.toBeNull();

      const deleted = await store.delete(id);
      expect(deleted).toBe(true);

      expect(await store.byId(id)).toBeNull();
      expect(await store.byUsername("user_can_xoa")).toBeNull();
      expect(await store.byName("Đạo Hiệu Xoá")).toBeNull();

      // Xoá lại trả về false
      expect(await store.delete(id)).toBe(false);

      // Có thể đăng ký lại cùng username sau khi xoá
      const reCreated = await store.create(makeNewAccount("user_can_xoa"));
      expect(reCreated).not.toBeNull();
      expect(reCreated!.id).not.toBe(id);
      expect(await store.setName(reCreated!.id, "Đạo Hiệu Xoá")).toBe("ok");
    });

    it("delete id chưa từng có trả về false", async () => {
      const store = await createStore();
      expect(await store.delete("00000000-0000-0000-0000-000000000000")).toBe(false);
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

/** Mẫu tông môn hợp lệ cho test: một Tông chủ (`soulKey` = `chu_<id>`), tuỳ chọn thêm thành viên. */
export const makeSect = (id: string, overrides?: Partial<Sect>): Sect => ({
  v: 1,
  id,
  name: `Tông ${id}`,
  tag: id.slice(0, 4).toUpperCase().padEnd(2, "X"),
  leader: `chu_${id}`,
  motd: "",
  members: [{ soulKey: `chu_${id}`, name: `Chu ${id}`, rank: "chu", joinedAt: 1000 }],
  coin: 0,
  log: [],
  createdAt: 1000,
  updatedAt: 1000,
  ...overrides,
});

/** Thêm một Đệ tử vào bản sao tông môn (dùng trong `update`). */
const withMember = (
  s: Sect,
  soulKey: string,
  name = `Dt ${soulKey.replace(/[^A-Za-z0-9]/g, "")}`,
): Sect => ({
  ...s,
  members: [...s.members, { soulKey, name, rank: "de_tu", joinedAt: 2000 }],
});

/** Kỳ vọng `p` bị từ chối bằng `SectConflictError` với đúng lý do. */
async function expectConflict(p: Promise<unknown>, reason: string, soulKey?: string) {
  const err = await p.then(
    () => null,
    (e) => e,
  );
  expect(err, "phải bị từ chối").toBeInstanceOf(SectConflictError);
  expect((err as SectConflictError).reason).toBe(reason);
  if (soulKey !== undefined) expect((err as SectConflictError).soulKey).toBe(soulKey);
}

/**
 * Bộ ca hợp đồng cho SectStore (M3.6 bước 6b): mọi cài đặt (FileSectStore, PgSectStore) phải giữ ba bất biến (tên / biệt hiệu duy
 * nhất, một linh hồn một tông môn, đúng một Tông chủ) kể cả khi các yêu cầu đua nhau, và không bao giờ ghi dở khi bị từ chối.
 */
export function describeSectStoreContract(
  storeName: string,
  createStore: () => Promise<SectStore> | SectStore,
) {
  describe(`Hợp đồng SectStore (${storeName})`, () => {
    it("kho trống: get / findBySoul trả null, all rỗng, update / delete tông môn không có trả null / false", async () => {
      const store = await createStore();
      expect(await store.get("khong_co")).toBeNull();
      expect(await store.findBySoul("khong_co")).toBeNull();
      expect(await store.all()).toEqual([]);
      expect(await store.update("khong_co", (s) => s)).toBeNull();
      expect(await store.delete("khong_co")).toBe(false);
    });

    it("create rồi get / all / findBySoul trả đúng dữ liệu; kết quả là bản sao (sửa không ảnh hưởng kho)", async () => {
      const store = await createStore();
      const made = await store.create(
        withMember(
          makeSect("s1", { name: "Thanh Vân Môn", tag: "TV", motd: "Săn boss", coin: 50 }),
          "dt_1",
        ),
      );
      expect(made.id).toBe("s1");
      expect(made.name).toBe("Thanh Vân Môn");
      expect(made.members.map((m) => m.soulKey)).toEqual(["chu_s1", "dt_1"]);

      for (const got of [
        await store.get("s1"),
        await store.findBySoul("chu_s1"),
        await store.findBySoul("dt_1"),
        (await store.all())[0],
      ]) {
        expect(got?.name).toBe("Thanh Vân Môn");
        expect(got?.tag).toBe("TV");
        expect(got?.motd).toBe("Săn boss");
        expect(got?.coin).toBe(50);
        expect(got?.leader).toBe("chu_s1");
        expect(got?.members).toHaveLength(2);
      }
      expect(await store.findBySoul("nguoi_la")).toBeNull();

      // sửa kết quả trả về không được làm đổi kho
      made.members.push({ soulKey: "lau", name: "Lau", rank: "de_tu", joinedAt: 1 });
      made.coin = 999;
      (await store.get("s1"))!.members.length = 0;
      expect((await store.get("s1"))?.members).toHaveLength(2);
      expect((await store.get("s1"))?.coin).toBe(50);
      expect(await store.findBySoul("lau")).toBeNull();
    });

    it("create trùng id / tên / biệt hiệu (không phân biệt hoa thường) / thành viên bị từ chối đúng lý do và KHÔNG ghi gì", async () => {
      const store = await createStore();
      await store.create(withMember(makeSect("a", { name: "Thanh Vân", tag: "TV" }), "dt_a"));

      await expectConflict(store.create(makeSect("a", { name: "Khác", tag: "KH" })), "id_taken");
      await expectConflict(
        store.create(makeSect("b", { name: "THANH VÂN", tag: "KB" })),
        "name_taken",
      );
      await expectConflict(store.create(makeSect("c", { name: "Khác C", tag: "tv" })), "tag_taken");
      await expectConflict(
        store.create(withMember(makeSect("d", { name: "Khác D", tag: "KD" }), "dt_a")),
        "member_taken",
        "dt_a",
      );
      await expectConflict(
        store.create(
          makeSect("e", {
            name: "Khác E",
            tag: "KE",
            leader: "chu_a",
            members: [{ soulKey: "chu_a", name: "Chu A", rank: "chu", joinedAt: 1 }],
          }),
        ),
        "member_taken",
        "chu_a",
      );

      // không ghi dở: chỉ còn tông môn đầu; các linh hồn của lần bị từ chối không bị chiếm
      expect((await store.all()).map((s) => s.id)).toEqual(["a"]);
      for (const k of ["chu_b", "chu_c", "chu_d", "chu_e"])
        expect(await store.findBySoul(k)).toBeNull();
      expect((await store.findBySoul("dt_a"))?.id).toBe("a");
      // và tên / biệt hiệu của lần bị từ chối vẫn dùng được
      await store.create(makeSect("b", { name: "Khác B", tag: "KB" }));
    });

    it("hai create ĐUA nhau cùng tên / cùng biệt hiệu / cùng linh hồn: đúng MỘT thắng, lần kia bị từ chối", async () => {
      for (const [x, y, reason] of [
        [
          makeSect("r1", { name: "Đua Tên", tag: "R1" }),
          makeSect("r2", { name: "đua tên", tag: "R2" }),
          "name_taken",
        ],
        [
          makeSect("r3", { name: "Đua Tag 3", tag: "DT" }),
          makeSect("r4", { name: "Đua Tag 4", tag: "dt" }),
          "tag_taken",
        ],
        [
          withMember(makeSect("r5", { name: "Đua Hồn 5", tag: "R5" }), "chung"),
          withMember(makeSect("r6", { name: "Đua Hồn 6", tag: "R6" }), "chung"),
          "member_taken",
        ],
      ] as const) {
        const store = await createStore();
        const res = await Promise.allSettled([store.create(x), store.create(y)]);
        expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const lost = res.find((r) => r.status === "rejected") as PromiseRejectedResult;
        expect(lost.reason).toBeInstanceOf(SectConflictError);
        expect((lost.reason as SectConflictError).reason).toBe(reason);
        expect(await store.all()).toHaveLength(1);
      }
    });

    it("create từ chối bản ghi sai bất biến (lỗi của người gọi, không phải xung đột) và không ghi gì", async () => {
      const store = await createStore();
      const base = makeSect("v1");
      const bad: Sect[] = [
        { ...base, coin: -1 },
        { ...base, coin: SECT_COIN_CAP + 1 },
        { ...base, coin: 1.5 },
        { ...base, name: "  Tên  chưa   chuẩn hoá " },
        { ...base, tag: "TÊN QUÁ DÀI" },
        { ...base, leader: "ai_do" }, // leader lệch Tông chủ
        { ...base, members: [] },
        {
          ...base,
          members: [
            ...base.members,
            { soulKey: "chu_v1", name: "Trùng", rank: "de_tu", joinedAt: 1 },
          ],
        },
        {
          ...base,
          members: [
            ...base.members,
            { soulKey: "chu_2", name: "Chu Hai", rank: "chu", joinedAt: 1 },
          ],
        }, // hai Tông chủ
        { ...base, members: [{ ...base.members[0], rank: "de_tu" }] }, // không có Tông chủ
        { ...base, id: "../thoat" },
      ];
      for (const b of bad) {
        const err = await store.create(b).then(
          () => null,
          (e) => e,
        );
        expect(err, JSON.stringify(b)).toBeInstanceOf(Error);
        expect(err).not.toBeInstanceOf(SectConflictError);
      }
      expect(await store.all()).toEqual([]);
    });

    it("update: fn nhận bản sao, kết quả được lưu; id không đổi dù fn đổi; updatedAt do kho đặt", async () => {
      const store = await createStore();
      await store.create(makeSect("u1", { name: "Cũ", tag: "CU", updatedAt: 1 }));
      let seen: Sect | undefined;
      const next = await store.update("u1", (s) => {
        seen = s;
        return { ...s, id: "doi_id", name: "Mới", motd: "Chào", coin: 7, updatedAt: 5 };
      });
      expect(next?.id).toBe("u1");
      expect(next?.name).toBe("Mới");
      expect(next?.updatedAt).toBeGreaterThan(5); // kho tự đặt theo đồng hồ, không tin fn
      expect(seen?.name).toBe("Cũ");
      expect(await store.get("doi_id")).toBeNull();
      const got = await store.get("u1");
      expect(got?.name).toBe("Mới");
      expect(got?.motd).toBe("Chào");
      expect(got?.coin).toBe(7);
      // đổi tên giải phóng tên cũ và chiếm tên mới
      await store.create(makeSect("u2", { name: "cũ", tag: "C2" }));
      await expectConflict(store.create(makeSect("u3", { name: "MỚI", tag: "C3" })), "name_taken");
    });

    it("update nguyên tử: 40 lần cộng kho đồng thời không mất lần nào; fn ném lỗi không ghi và không chặn lần sau", async () => {
      const store = await createStore();
      await store.create(makeSect("c1", { coin: 100 }));
      await Promise.all(
        Array.from({ length: 40 }, () => store.update("c1", (s) => ({ ...s, coin: s.coin + 1 }))),
      );
      expect((await store.get("c1"))?.coin).toBe(140);

      const bad = store.update("c1", () => {
        throw new Error("Lỗi cố ý trong callback");
      });
      const after = store.update("c1", (s) => ({ ...s, coin: s.coin + 10 }));
      await expect(bad).rejects.toThrow("Lỗi cố ý trong callback");
      expect((await after)?.coin).toBe(150);
      expect((await store.get("c1"))?.coin).toBe(150);

      // fn sửa BẢN SAO rồi ném lỗi: kho (và chỉ mục thành viên) không được đổi theo
      await expect(
        store.update("c1", (s) => {
          s.coin = 1;
          s.members.push({ soulKey: "ma", name: "Ma", rank: "de_tu", joinedAt: 1 });
          s.name = "Đã Bị Sửa";
          throw new Error("hỏng giữa chừng");
        }),
      ).rejects.toThrow("hỏng giữa chừng");
      const kept = await store.get("c1");
      expect(kept?.coin).toBe(150);
      expect(kept?.members).toHaveLength(1);
      expect(kept?.name).not.toBe("Đã Bị Sửa");
      expect(await store.findBySoul("ma")).toBeNull();
    });

    it("update thêm / bớt thành viên cập nhật chỉ mục linh hồn; thành viên đã ở tông môn khác bị từ chối, không ghi gì", async () => {
      const store = await createStore();
      await store.create(makeSect("m1", { name: "Một", tag: "M1" }));
      await store.create(makeSect("m2", { name: "Hai", tag: "M2" }));

      await store.update("m1", (s) => withMember(s, "nguoi_a"));
      expect((await store.findBySoul("nguoi_a"))?.id).toBe("m1");

      await expectConflict(
        store.update("m2", (s) => withMember(s, "nguoi_a")),
        "member_taken",
        "nguoi_a",
      );
      expect((await store.get("m2"))?.members).toHaveLength(1);
      expect((await store.findBySoul("nguoi_a"))?.id).toBe("m1");

      await store.update("m1", (s) => ({
        ...s,
        members: s.members.filter((m) => m.soulKey !== "nguoi_a"),
      }));
      expect(await store.findBySoul("nguoi_a")).toBeNull();
      await store.update("m2", (s) => withMember(s, "nguoi_a")); // giờ nhận được
      expect((await store.findBySoul("nguoi_a"))?.id).toBe("m2");
    });

    it("update đổi tên / biệt hiệu sang cái đã có bị từ chối, không ghi gì và chỉ mục cũ vẫn đúng", async () => {
      const store = await createStore();
      await store.create(makeSect("n1", { name: "Một", tag: "N1" }));
      await store.create(makeSect("n2", { name: "Hai", tag: "N2" }));
      await expectConflict(
        store.update("n2", (s) => ({ ...s, name: "MỘT" })),
        "name_taken",
      );
      await expectConflict(
        store.update("n2", (s) => ({ ...s, tag: "n1" })),
        "tag_taken",
      );
      expect((await store.get("n2"))?.name).toBe("Hai");
      expect((await store.get("n2"))?.tag).toBe("N2");
      // đổi hoa / thường tên của CHÍNH MÌNH không phải xung đột
      expect((await store.update("n2", (s) => ({ ...s, name: "HAI" })))?.name).toBe("HAI");
      await expectConflict(store.create(makeSect("n3", { name: "hai", tag: "N3" })), "name_taken");
    });

    it("update từ chối kết quả sai bất biến (kho âm / vượt trần / không nguyên, hai Tông chủ, leader lệch, tên chưa chuẩn hoá) và không ghi gì", async () => {
      const store = await createStore();
      await store.create(makeSect("w1", { coin: 10 }));
      const mutate: ((s: Sect) => Sect)[] = [
        (s) => ({ ...s, coin: -5 }),
        (s) => ({ ...s, coin: SECT_COIN_CAP + 1 }),
        (s) => ({ ...s, coin: 0.5 }),
        (s) => ({ ...s, coin: Number.NaN }),
        (s) => ({ ...s, name: " x" }),
        (s) => ({ ...s, leader: "nguoi_la" }),
        (s) => ({
          ...s,
          members: [...s.members, { soulKey: "tc2", name: "Tc Hai", rank: "chu", joinedAt: 1 }],
        }),
        (s) => ({ ...s, members: [] }),
      ];
      for (const fn of mutate) {
        const err = await store.update("w1", fn).then(
          () => null,
          (e) => e,
        );
        expect(err, fn.toString()).toBeInstanceOf(Error);
        expect(err).not.toBeInstanceOf(SectConflictError);
      }
      const got = await store.get("w1");
      expect(got?.coin).toBe(10);
      expect(got?.members).toHaveLength(1);
      expect(await store.findBySoul("tc2")).toBeNull();
    });

    it("chuyển quyền hợp lệ: đổi leader và hai chức vụ trong MỘT update; sổ kho giữ tối đa SECT_LOG_MAX mục", async () => {
      const store = await createStore();
      await store.create(withMember(makeSect("t1"), "dt_t"));
      const moved = await store.update("t1", (s) => ({
        ...s,
        leader: "dt_t",
        members: s.members.map((m) =>
          m.soulKey === "dt_t"
            ? { ...m, rank: "chu" as const }
            : { ...m, rank: "truong_lao" as const },
        ),
      }));
      expect(moved?.leader).toBe("dt_t");
      expect(moved?.members.find((m) => m.rank === "chu")?.soulKey).toBe("dt_t");

      const log = Array.from({ length: SECT_LOG_MAX + 8 }, (_, i) => ({
        at: i,
        name: "Chu t1",
        kind: "deposit" as const,
        amount: i + 1,
      }));
      const withLog = await store.update("t1", (s) => ({ ...s, log }));
      expect(withLog?.log).toHaveLength(SECT_LOG_MAX);
      expect(withLog?.log[0].amount).toBe(1); // giữ đầu mảng (mục mới nhất đứng đầu)
    });

    it("delete: true rồi false; giải phóng tên, biệt hiệu và mọi linh hồn; không ảnh hưởng tông môn khác", async () => {
      const store = await createStore();
      await store.create(withMember(makeSect("x1", { name: "Xoá Tôi", tag: "X1" }), "dt_x"));
      await store.create(makeSect("x2", { name: "Giữ Lại", tag: "X2" }));
      expect(await store.delete("x1")).toBe(true);
      expect(await store.delete("x1")).toBe(false);
      expect(await store.get("x1")).toBeNull();
      expect(await store.findBySoul("dt_x")).toBeNull();
      expect(await store.findBySoul("chu_x1")).toBeNull();
      expect((await store.all()).map((s) => s.id)).toEqual(["x2"]);
      // tên, biệt hiệu, linh hồn dùng lại được
      await store.create(withMember(makeSect("x3", { name: "xoá tôi", tag: "x1" }), "dt_x"));
      expect((await store.findBySoul("dt_x"))?.id).toBe("x3");
    });

    it("delete có guard: guard thấy BẢN SAO hiện tại; ném lỗi thì không xoá gì và lỗi đi tới người gọi; không có tông môn thì guard không chạy", async () => {
      const store = await createStore();
      await store.create(
        withMember(makeSect("g1", { name: "Giữ Guard", tag: "G1", coin: 5 }), "dt_g"),
      );
      let seen: Sect | undefined;
      await expect(
        store.delete("g1", (s) => {
          seen = s;
          s.coin = 0; // sửa bản sao không được làm đổi kho
          throw new Error("kho còn tiền");
        }),
      ).rejects.toThrow("kho còn tiền");
      expect(seen?.coin).toBe(0);
      const kept = await store.get("g1");
      expect(kept?.coin).toBe(5);
      expect((await store.findBySoul("dt_g"))?.id).toBe("g1");
      // lần sau vẫn chạy (hàng đợi không kẹt) và guard không ném thì xoá
      expect(await store.delete("g1", (s) => expect(s.coin).toBe(5))).toBe(true);
      expect(await store.get("g1")).toBeNull();
      let called = false;
      expect(
        await store.delete("khong_co", () => {
          called = true;
        }),
      ).toBe(false);
      expect(called).toBe(false);
    });

    it("delete có guard NGUYÊN TỬ với update: một lần góp chạy đua với giải tán thì hoặc kho còn tiền và KHÔNG xoá, hoặc xoá rồi góp nhận null (không bao giờ xoá khi kho còn tiền)", async () => {
      for (let round = 0; round < 6; round++) {
        const store = await createStore();
        await store.create(makeSect("h1", { name: "Đua Xoá", tag: "H1", coin: 0 }));
        const emptyOnly = (s: Sect) => {
          if (s.coin > 0) throw new Error("kho còn tiền");
        };
        const [del, dep] = await Promise.allSettled(
          round % 2 === 0
            ? [
                store.delete("h1", emptyOnly),
                store.update("h1", (s) => ({ ...s, coin: s.coin + 9 })),
              ]
            : [
                store.update("h1", (s) => ({ ...s, coin: s.coin + 9 })),
                store.delete("h1", emptyOnly),
              ].reverse(),
        );
        const left = await store.get("h1");
        if (left) {
          // tông môn còn: lần xoá bị guard chặn và kho giữ nguyên số vừa góp
          expect(del.status).toBe("rejected");
          expect(left.coin).toBe(9);
        } else {
          // đã xoá: lúc đó kho rỗng và lần góp thấy "không có" (null) chứ không cộng vào hư không
          expect(del.status === "fulfilled" && del.value).toBe(true);
          expect(dep.status === "fulfilled" && dep.value).toBeNull();
        }
      }
    });
  });
}
