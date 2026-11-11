// CharacterService: chọn đạo hiệu và nhận nhân vật cũ về tài khoản. Kho file thật trong thư mục tạm, kho nhân vật giả
// trong bộ nhớ, scrypt tham số rẻ.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { newSoul, type Soul } from "@tien-gioi/shared";
import { FileAccountStore, FileSessionStore } from "./account-store";
import { hashSecretScrypt, needsRehash, verifyScrypt } from "./auth";
import { AuthService } from "./auth-service";
import {
  CHARACTER_TRIES_PER_HOUR,
  CLAIM_FAILS_PER_ACCOUNT,
  CLAIM_FAILS_PER_IP,
  CharacterService,
} from "./character-service";
import type { PlayerStore } from "./player-store";
import { FileSoulStore, soulIdOf, type SoulStore } from "./soul";
import { hashSecret, type SavedPlayer } from "./store";

const root = mkdtempSync(path.join(tmpdir(), "tien-gioi-char-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let n = 0;

const CHEAP = { N: 1 << 10, r: 8, p: 1 };
const cheapDummy = hashSecretScrypt("x", CHEAP);
const T0 = Date.parse("2026-11-10T00:00:00Z");
const SECRET = "0123456789abcdef0123456789abcdef";
const PW = "mat-khau-dai-du";

let t: number;
let accounts: FileAccountStore;
let auth: AuthService;
let svc: CharacterService;
let souls: SoulStore;
let saves: Map<string, SavedPlayer>;
let soulCreates: number;

const players: PlayerStore = {
  load: async (name) => saves.get(name.normalize("NFC").toLowerCase()) ?? null,
  save: async (p) => void saves.set(p.name.normalize("NFC").toLowerCase(), p),
  delete: async (name) => saves.delete(name.normalize("NFC").toLowerCase()),
};
const legacy = (name: string, secret = SECRET): SavedPlayer => ({
  name,
  secretHash: hashSecret(secret),
  realm: 1,
  tier: 2,
  exp: 10,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

function setup(souls2?: SoulStore) {
  const base = path.join(root, `t${++n}`);
  accounts = new FileAccountStore(path.join(base, "accounts"));
  const sessions = new FileSessionStore(path.join(base, "sessions"));
  t = T0;
  saves = new Map();
  soulCreates = 0;
  const real = new FileSoulStore(path.join(base, "souls"), () => "2026-11-10T00:00:00.000Z");
  souls = souls2 ?? {
    get: (id) => real.get(id),
    update: (id, fn) => real.update(id, fn),
    create: (id, init) => (soulCreates++, real.create(id, init)),
    delete: (id) => real.delete(id),
  };
  auth = new AuthService({
    accounts,
    sessions,
    now: () => t,
    kdf: {
      hash: (s) => hashSecretScrypt(s, CHEAP),
      verify: verifyScrypt,
      dummy: () => cheapDummy,
      needsRehash: (h) => needsRehash(h, CHEAP),
    },
  });
  svc = new CharacterService({ auth, accounts, players, souls, now: () => t });
}
beforeEach(() => setup());

let seq = 0;
async function acc() {
  const username = `nguoi_${++seq}`;
  const r = await auth.register(`9.9.${seq >> 8}.${seq & 255}`, { username, password: PW });
  if (!r.ok) throw new Error(r.error);
  return { token: r.value.token, id: (await accounts.byUsername(username))!.id };
}
const err = (r: { ok: boolean; error?: string }) => (r.ok ? "ok" : r.error);

describe("create (chọn đạo hiệu)", () => {
  it("thành công: đạo hiệu gắn với tài khoản (me báo hasCharacter + name); lần hai là has_character", async () => {
    const a = await acc();
    expect((await svc.create(a.token, { name: "  Lâm   Thanh " })).ok).toBe(true);
    expect(await auth.me(a.token)).toEqual({
      ok: true,
      value: expect.objectContaining({ hasCharacter: true, name: "Lâm Thanh" }),
    });
    expect(err(await svc.create(a.token, { name: "Ten Khac" }))).toBe("has_character");
  });

  it("token sai / thiếu: unauthorized; thân sai: invalid; tên sai luật: name_invalid (không giữ chỗ)", async () => {
    const a = await acc();
    for (const tok of [undefined, null, "", "a".repeat(43), 5])
      expect(err(await svc.create(tok, { name: "Ten Hay" }))).toBe("unauthorized");
    for (const body of [null, [], "x", 5, {}, { name: 5 }, { name: null }])
      expect(err(await svc.create(a.token, body)), JSON.stringify(body)).toBe("invalid");
    for (const name of ["a", "x".repeat(17), "a<b>", "../x", ""])
      expect(err(await svc.create(a.token, { name })), String(name)).toBe("name_invalid");
    expect((await auth.me(a.token)).ok && (await accounts.byId(a.id))?.name).toBeUndefined();
  });

  it("đạo hiệu đã có chủ (khác hoa thường / NFC) hoặc trùng nhân vật cũ chưa ai nhận: name_taken", async () => {
    const a = await acc();
    const b = await acc();
    expect((await svc.create(a.token, { name: "Lâm Thanh" })).ok).toBe(true);
    expect(err(await svc.create(b.token, { name: "LÂM THANH" }))).toBe("name_taken");
    expect(err(await svc.create(b.token, { name: "Lâm Thanh".normalize("NFD") }))).toBe(
      "name_taken",
    );
    saves.set("co nhan cu", legacy("Cố Nhân Cũ"));
    saves.set("cố nhân cũ", legacy("Cố Nhân Cũ"));
    expect(err(await svc.create(b.token, { name: "Cố Nhân Cũ" }))).toBe("name_taken");
    expect((await accounts.byId(b.id))?.name).toBeUndefined(); // không giữ chỗ khi bị từ chối
    expect((await svc.create(b.token, { name: "Ten Moi" })).ok).toBe(true);
  });

  it("hai tài khoản tranh một đạo hiệu cùng lúc: đúng một bên được", async () => {
    const [a, b, c] = [await acc(), await acc(), await acc()];
    const rs = await Promise.all([a, b, c].map((x) => svc.create(x.token, { name: "Tranh Ten" })));
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(rs.filter((r) => !r.ok).every((r) => !r.ok && r.error === "name_taken")).toBe(true);
  });

  it(`giới hạn ${CHARACTER_TRIES_PER_HOUR} lần thử / giờ / tài khoản (chặn dò tên); sang giờ mới được lại`, async () => {
    const a = await acc();
    saves.set("trung ten", legacy("Trung Ten"));
    for (let i = 0; i < CHARACTER_TRIES_PER_HOUR; i++)
      expect(err(await svc.create(a.token, { name: "Trung Ten" }))).toBe("name_taken");
    const r = await svc.create(a.token, { name: "Ten Moi" });
    expect(r).toMatchObject({ ok: false, error: "rate_limited" });
    t += 3600_000;
    expect((await svc.create(a.token, { name: "Ten Moi" })).ok).toBe(true);
  });
});

describe("claim (nhận nhân vật cũ)", () => {
  const putLegacy = async (name: string, duyen = 42) => {
    saves.set(name.toLowerCase(), legacy(name));
    await souls.create(soulIdOf(name), (s) => ({ ...newSoul(s.id, s.createdAt), duyen, kiep: 3 }));
    soulCreates = 0;
  };

  it("đúng tên + mã: nhân vật và chân linh (Duyên, Kiếp) về tài khoản; chân linh cũ vẫn còn; lần hai là has_character", async () => {
    await putLegacy("Co Nhan");
    const a = await acc();
    expect((await svc.claim("1.1.1.1", a.token, { name: "Co Nhan", secret: SECRET })).ok).toBe(
      true,
    );
    expect((await accounts.byId(a.id))?.name).toBe("Co Nhan");
    const soul = (await souls.get(a.id)) as Soul;
    expect([soul.id, soul.duyen, soul.kiep]).toEqual([a.id, 42, 3]);
    expect((await souls.get(soulIdOf("Co Nhan")))?.duyen).toBe(42);
    expect(err(await svc.claim("1.1.1.1", a.token, { name: "Co Nhan", secret: SECRET }))).toBe(
      "has_character",
    );
  });

  it("nhân vật cũ chưa có chân linh: nhận được, KHÔNG tạo chân linh (lúc vào phòng sẽ tạo)", async () => {
    saves.set("khong linh", legacy("Khong Linh"));
    const a = await acc();
    expect((await svc.claim("1.1.1.1", a.token, { name: "Khong Linh", secret: SECRET })).ok).toBe(
      true,
    );
    expect(await souls.get(a.id)).toBeNull();
    expect(soulCreates).toBe(0);
  });

  it("sai mã / không có nhân vật / tên sai luật / nhân vật đã có chủ: CÙNG một lỗi not_found; không giữ chỗ", async () => {
    await putLegacy("Co Nhan");
    const a = await acc();
    const b = await acc();
    expect((await svc.claim("1.1.1.1", b.token, { name: "Co Nhan", secret: SECRET })).ok).toBe(
      true,
    ); // b nhận trước
    const out = [
      await svc.claim("2.2.2.2", a.token, { name: "Co Nhan", secret: SECRET }), // đã có chủ, mã đúng
      await svc.claim("2.2.2.2", a.token, {
        name: "Co Nhan",
        secret: "sai-ma-0123456789abcdef-zzz",
      }),
      await svc.claim("2.2.2.2", a.token, { name: "Khong Co", secret: SECRET }),
      await svc.claim("2.2.2.2", a.token, { name: "../x", secret: SECRET }),
    ];
    expect(new Set(out.map((o) => JSON.stringify(o))).size).toBe(1);
    expect(out[0]).toEqual({ ok: false, error: "not_found", status: 404 });
    expect((await accounts.byId(a.id))?.name).toBeUndefined();
    // Sai mã trên nhân vật CHƯA ai nhận: vẫn not_found, tài khoản không giữ chỗ tên
    saves.set("chua nhan", legacy("Chua Nhan"));
    const wrong = await svc.claim("2.2.2.2", a.token, {
      name: "Chua Nhan",
      secret: "sai-ma-0123456789abcdef-zzz",
    });
    expect(wrong).toEqual({ ok: false, error: "not_found", status: 404 });
    expect((await accounts.byId(a.id))?.name).toBeUndefined();
    expect((await svc.claim("2.2.2.2", a.token, { name: "Chua Nhan", secret: SECRET })).ok).toBe(
      true,
    );
  });

  it("thân sai: invalid (kể cả mã bí mật dài quá mức); token sai: unauthorized", async () => {
    const a = await acc();
    for (const body of [
      null,
      [],
      { name: "A B" },
      { name: 5, secret: SECRET },
      { name: "Co Nhan", secret: 5 },
      { name: "x".repeat(100), secret: SECRET },
      { name: "Co Nhan", secret: "x".repeat(300) },
    ])
      expect(err(await svc.claim("1.1.1.1", a.token, body)), JSON.stringify(body)).toBe("invalid");
    expect(
      err(await svc.claim("1.1.1.1", "a".repeat(43), { name: "Co Nhan", secret: SECRET })),
    ).toBe("unauthorized");
  });

  it("hai tài khoản nhận cùng một nhân vật cùng lúc (cùng mã đúng): đúng một bên được, bên thua KHÔNG có chân linh", async () => {
    await putLegacy("Co Nhan");
    const [a, b] = [await acc(), await acc()];
    const rs = await Promise.all(
      [a, b].map((x) => svc.claim("1.1.1.1", x.token, { name: "Co Nhan", secret: SECRET })),
    );
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    const [winner, loser] = rs[0].ok ? [a, b] : [b, a];
    expect((await souls.get(winner.id))?.duyen).toBe(42);
    expect(await souls.get(loser.id)).toBeNull(); // không nhân đôi Duyên
  });

  it(`dò mã bí mật: ${CLAIM_FAILS_PER_ACCOUNT} lần sai / giờ / tài khoản, ${CLAIM_FAILS_PER_IP} lần sai / 10 phút / IP, rồi rate_limited (kể cả mã đúng)`, async () => {
    await putLegacy("Co Nhan");
    const a = await acc();
    for (let i = 0; i < CLAIM_FAILS_PER_ACCOUNT; i++)
      expect(
        err(
          await svc.claim("3.3.3.3", a.token, {
            name: "Co Nhan",
            secret: `sai-${i}-0123456789abcdef`,
          }),
        ),
      ).toBe("not_found");
    expect(err(await svc.claim("3.3.3.3", a.token, { name: "Co Nhan", secret: SECRET }))).toBe(
      "rate_limited",
    );
    t += 3600_000;
    expect((await svc.claim("3.3.3.3", a.token, { name: "Co Nhan", secret: SECRET })).ok).toBe(
      true,
    );
    // theo IP: nhiều tài khoản cùng IP
    await putLegacy("Nguoi Khac");
    let fails = 0;
    while (fails < CLAIM_FAILS_PER_IP) {
      const x = await acc();
      for (let i = 0; i < 4 && fails < CLAIM_FAILS_PER_IP; i++, fails++)
        await svc.claim("4.4.4.4", x.token, {
          name: "Nguoi Khac",
          secret: `sai-${fails}-0123456789abcdef`,
        });
    }
    const y = await acc();
    expect(err(await svc.claim("4.4.4.4", y.token, { name: "Nguoi Khac", secret: SECRET }))).toBe(
      "rate_limited",
    );
    expect(err(await svc.claim("5.5.5.5", y.token, { name: "Nguoi Khac", secret: SECRET }))).toBe(
      "ok",
    );
  });

  it("chuyển chân linh lỗi (đĩa): thử lại 3 lần rồi ném (lớp HTTP trả 500); lỗi thoáng qua thì thành công", async () => {
    let fails = 2;
    const flaky: SoulStore = {
      get: async () => ({ ...newSoul(soulIdOf("Co Nhan"), "2026-11-10T00:00:00.000Z"), duyen: 7 }),
      update: async () => {
        throw new Error("không dùng");
      },
      create: async (id, init) => {
        if (fails-- > 0) throw new Error("đĩa lỗi");
        return { ...init!(newSoul(id, "x")), id };
      },
      delete: async () => false,
    };
    setup(flaky);
    saves.set("co nhan", legacy("Co Nhan"));
    const a = await acc();
    expect((await svc.claim("1.1.1.1", a.token, { name: "Co Nhan", secret: SECRET })).ok).toBe(
      true,
    ); // 2 lần lỗi rồi được
    fails = 99;
    const b = await acc();
    saves.set("nguoi khac", legacy("Nguoi Khac"));
    await expect(
      svc.claim("1.1.1.1", b.token, { name: "Nguoi Khac", secret: SECRET }),
    ).rejects.toThrow("đĩa lỗi");
  });
});
