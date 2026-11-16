// Kho tông môn (M3.6 bước 6b): làm sạch bản ghi (`sanitizeSect`), kiểm bản ghi sắp ghi, và những gì RIÊNG của bản file (lưu qua
// các lần khởi động, tệp hỏng / trùng bị cách ly chứ không xoá). Bộ ca hợp đồng chung chạy ở `store-contract.test.ts` và
// `pg/pg-stores.test.ts`.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ITEMS,
  SECT_COIN_CAP,
  SECT_LOG_MAX,
  SECT_VAULT_DRAW_DEFAULT,
  SECT_VAULT_DRAW_MAX,
  SECT_VAULT_LOG_MAX,
  SECT_VAULT_SLOTS,
} from "@tien-gioi/shared";
import {
  FileSectStore,
  SectConflictError,
  assertWritableSect,
  emptySectVault,
  isSectId,
  sanitizeSect,
  sanitizeVault,
  sectsDir,
  withLogEntry,
  withVaultLogEntry,
  type Sect,
} from "./sect-store";
import { makeSect } from "./store-contract";

const root = mkdtempSync(path.join(tmpdir(), "tien-gioi-sect-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let n = 0;
const freshDir = () => path.join(root, `d${++n}`);
const NOW = 1_700_000_000_000;

describe("sanitizeSect (không tin dữ liệu lưu)", () => {
  const ok = (over: Record<string, unknown> = {}) => ({ ...makeSect("s1"), ...over });

  it("bản ghi hợp lệ đi qua nguyên vẹn (kể cả sau một vòng JSON)", () => {
    const s = makeSect("s1", {
      name: "Thanh Vân",
      tag: "TV",
      motd: "Săn boss",
      coin: 123,
      log: [{ at: 5, name: "Chu s1", kind: "deposit", amount: 10 }],
    });
    expect(sanitizeSect(JSON.parse(JSON.stringify(s)), NOW)).toEqual(s);
  });

  it("từ chối bản ghi không cứu được: kiểu sai, phiên bản lạ, id không an toàn, tên / biệt hiệu sai luật", () => {
    for (const bad of [
      null,
      undefined,
      42,
      "x",
      [],
      [ok()],
      {},
      ok({ v: 2 }),
      ok({ v: "1" }),
      ok({ id: "../thoat" }),
      ok({ id: "" }),
      ok({ id: "a".repeat(65) }),
      ok({ id: 7 }),
      ok({ name: "x" }),
      ok({ name: "Tên<b>" }),
      ok({ name: 5 }),
      ok({ tag: "T" }),
      ok({ tag: "TÊN QUÁ DÀI" }),
      ok({ tag: "T V" }),
    ]) {
      expect(sanitizeSect(bad, NOW), JSON.stringify(bad)).toBeNull();
    }
  });

  it("từ chối khi thành viên sai bất biến: rỗng, trùng, hai Tông chủ, không có Tông chủ, leader lệch, hạng / tên lạ", () => {
    const chu = { soulKey: "chu_s1", name: "Chu s1", rank: "chu", joinedAt: 1 };
    const dt = { soulKey: "dt1", name: "Dt Mot", rank: "de_tu", joinedAt: 2 };
    for (const bad of [
      ok({ members: [] }),
      ok({ members: "x" }),
      ok({ members: [chu, chu] }), // trùng soulKey
      ok({ members: [chu, { ...dt, soulKey: "chu2", rank: "chu" }] }), // hai Tông chủ
      ok({ members: [chu, { ...dt, soulKey: "chu2", rank: "chu" }], leader: "chu2" }), // hai Tông chủ, leader là người sau
      ok({ members: [{ ...chu, rank: "de_tu" }] }), // không có Tông chủ
      ok({ members: [chu, dt], leader: "dt1" }), // leader không phải người giữ chức chu
      ok({ members: [chu, dt], leader: "" }),
      ok({ members: [chu, dt], leader: 3 }),
      ok({ members: [chu, { ...dt, rank: "constructor" }] }),
      ok({ members: [chu, { ...dt, rank: "toString" }] }),
      ok({ members: [chu, { ...dt, name: "x" }] }),
      ok({ members: [chu, { ...dt, name: "Dt<>" }] }),
      ok({ members: [chu, { ...dt, soulKey: "" }] }),
      ok({ members: [chu, { ...dt, soulKey: "k".repeat(201) }] }),
      ok({ members: [chu, null] }),
      ok({ members: Array.from({ length: 501 }, (_, i) => ({ ...dt, soulKey: `k${i}` })) }),
    ]) {
      expect(sanitizeSect(bad, NOW), JSON.stringify(bad).slice(0, 120)).toBeNull();
    }
  });

  it("kẹp số: kho về 0..SECT_COIN_CAP (số lẻ cắt xuống, NaN / chuỗi về 0); mốc thời gian hỏng lấy `now`", () => {
    expect(sanitizeSect(ok({ coin: -5 }), NOW)?.coin).toBe(0);
    expect(sanitizeSect(ok({ coin: SECT_COIN_CAP + 10 }), NOW)?.coin).toBe(SECT_COIN_CAP);
    expect(sanitizeSect(ok({ coin: 12.9 }), NOW)?.coin).toBe(12);
    expect(sanitizeSect(ok({ coin: Number.NaN }), NOW)?.coin).toBe(0);
    expect(sanitizeSect(ok({ coin: "999" }), NOW)?.coin).toBe(0);
    expect(sanitizeSect(ok({ coin: Infinity }), NOW)?.coin).toBe(0);
    const t = sanitizeSect(ok({ createdAt: "hôm qua", updatedAt: -1 }), NOW)!;
    expect(t.createdAt).toBe(NOW);
    expect(t.updatedAt).toBe(0); // số âm kẹp về 0; chuỗi / thiếu mới lấy `now`
    expect(sanitizeSect(ok({ updatedAt: undefined }), NOW)?.updatedAt).toBe(NOW);
    const m = sanitizeSect(
      ok({ members: [{ ...makeSect("s1").members[0], joinedAt: "x" }] }),
      NOW,
    )!;
    expect(m.members[0].joinedAt).toBe(NOW);
  });

  it("thông báo được làm sạch; mục sổ hỏng bị bỏ riêng; sổ dài bị cắt giữ mục đầu (mới nhất)", () => {
    expect(sanitizeSect(ok({ motd: " a‮b\u0000  c " }), NOW)?.motd).toBe("ab c");
    expect(sanitizeSect(ok({ motd: 5 }), NOW)?.motd).toBe("");
    const good = { at: 7, name: "Chu s1", kind: "withdraw", amount: 3 };
    const log = [
      good,
      null,
      { ...good, kind: "steal" },
      { ...good, amount: 0 },
      { ...good, amount: 1.5 },
      { ...good, amount: -4 },
      { ...good, name: "x" },
      { ...good, kind: "constructor" },
      { ...good, amount: 9 },
    ];
    expect(sanitizeSect(ok({ log }), NOW)?.log).toEqual([good, { ...good, amount: 9 }]);
    expect(sanitizeSect(ok({ log: "x" }), NOW)?.log).toEqual([]);
    const long = Array.from({ length: SECT_LOG_MAX + 9 }, (_, i) => ({ ...good, amount: i + 1 }));
    const cut = sanitizeSect(ok({ log: long }), NOW)!.log;
    expect(cut).toHaveLength(SECT_LOG_MAX);
    expect(cut[0].amount).toBe(1);
  });

  it("không mang trường lạ ra ngoài; không phụ thuộc thuộc tính trên Object.prototype", () => {
    const out = sanitizeSect({ ...makeSect("s1"), hack: 1, __proto__: { admin: true } }, NOW)!;
    expect(Object.keys(out).sort()).toEqual(
      [
        "coin",
        "createdAt",
        "id",
        "leader",
        "log",
        "members",
        "motd",
        "name",
        "tag",
        "updatedAt",
        "v",
        "vault",
      ].sort(),
    );
    expect(Object.keys(out.members[0]).sort()).toEqual(["joinedAt", "name", "rank", "soulKey"]);
  });

  it("isSectId: chỉ chữ, số, gạch ngang / dưới, 1..64 ký tự", () => {
    expect(isSectId("0f8fad5b-d9cb-469f-a165-70867728950e")).toBe(true);
    expect(isSectId("a_B-9")).toBe(true);
    for (const bad of ["", "a b", "a/b", "..", "a.json", "é", "a".repeat(65), 5, null, undefined])
      expect(isSectId(bad)).toBe(false);
  });
});

describe("assertWritableSect (kiểm bản ghi sắp ghi: KHÔNG im lặng sửa)", () => {
  it("bản hợp lệ trả về bản làm sạch; sổ quá dài thì cắt (không phải lỗi)", () => {
    const s = makeSect("w1", { coin: 5 });
    expect(assertWritableSect(s, NOW).coin).toBe(5);
    const log = Array.from({ length: SECT_LOG_MAX + 3 }, (_, i) => ({
      at: i,
      name: "Chu w1",
      kind: "deposit" as const,
      amount: i + 1,
    }));
    expect(assertWritableSect({ ...s, log }, NOW).log).toHaveLength(SECT_LOG_MAX);
  });

  it("kho ngoài khoảng / không nguyên, tên chưa chuẩn hoá, thông báo chưa làm sạch, số thành viên đổi: ném lỗi (tiền không biến mất im lặng)", () => {
    const s = makeSect("w1");
    for (const bad of [
      { coin: -1 },
      { coin: SECT_COIN_CAP + 1 },
      { coin: 2.5 },
      { coin: Number.NaN },
      { name: " Tên  lạ " },
      { tag: " ab" },
      { motd: "a\u0000b" },
    ])
      expect(() => assertWritableSect({ ...s, ...bad }, NOW), JSON.stringify(bad)).toThrow(
        /không hợp lệ/,
      );
    expect(() => assertWritableSect({ ...s, members: [] }, NOW)).toThrow();
  });
});

describe("withLogEntry", () => {
  it("mục mới đứng đầu, cắt còn SECT_LOG_MAX, không sửa mảng cũ", () => {
    const e = (a: number) => ({ at: a, name: "Chu", kind: "deposit" as const, amount: a });
    const old = Array.from({ length: SECT_LOG_MAX }, (_, i) => e(i + 1));
    const next = withLogEntry(old, e(99));
    expect(next[0].amount).toBe(99);
    expect(next).toHaveLength(SECT_LOG_MAX);
    expect(next[SECT_LOG_MAX - 1].amount).toBe(SECT_LOG_MAX - 1); // mục cũ nhất bị đẩy ra
    expect(old[0].amount).toBe(1);
    expect(old).toHaveLength(SECT_LOG_MAX);
    expect(withLogEntry([], e(1))).toEqual([e(1)]);
  });
});

describe("FileSectStore: riêng của bản file", () => {
  let err: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    err = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => err.mockRestore());

  const clock = () => NOW;

  it("sống qua khởi động lại: dựng lại chỉ mục (tên, biệt hiệu, thành viên) từ tệp; không để lại tệp tạm", async () => {
    const dir = freshDir();
    const a = new FileSectStore(dir, clock);
    await a.create(makeSect("p1", { name: "Thanh Vân", tag: "TV" }));
    await a.update("p1", (s) => ({
      ...s,
      members: [...s.members, { soulKey: "dt1", name: "Dt Mot", rank: "de_tu", joinedAt: 5 }],
    }));
    expect(readdirSync(dir)).toEqual(["p1.json"]);

    const b = new FileSectStore(dir, clock); // "khởi động lại"
    expect((await b.get("p1"))?.members).toHaveLength(2);
    expect((await b.findBySoul("dt1"))?.id).toBe("p1");
    await expect(b.create(makeSect("p2", { name: "thanh vân", tag: "P2" }))).rejects.toBeInstanceOf(
      SectConflictError,
    );
    await expect(b.create(makeSect("p3", { name: "P Ba", tag: "tv" }))).rejects.toBeInstanceOf(
      SectConflictError,
    );
  });

  it("tệp hỏng / tên tệp lệch id bị cách ly sang *.hong-* (không xoá, không ghi đè); các tông môn khác vẫn nạp", async () => {
    const dir = freshDir();
    await new FileSectStore(dir, clock).create(makeSect("g1", { name: "Còn Sống", tag: "CS" }));
    writeFileSync(path.join(dir, "rac.json"), "{không phải json");
    writeFileSync(path.join(dir, "mang.json"), "[1,2]");
    writeFileSync(
      path.join(dir, "lech.json"),
      JSON.stringify(makeSect("khac", { name: "Lệch", tag: "LE" })),
    );
    writeFileSync(path.join(dir, "g1.json.tmp"), "{}"); // tệp tạm: bỏ qua, không phải tông môn

    const store = new FileSectStore(dir, clock);
    expect((await store.all()).map((s) => s.id)).toEqual(["g1"]);
    const files = readdirSync(dir);
    expect(files.filter((f) => f.includes(".hong-")).sort()).toHaveLength(3);
    expect(files).toContain("g1.json.tmp");
    expect(files.filter((f) => /^(rac|mang|lech)\.json$/.test(f))).toEqual([]);
    // nội dung tệp hỏng còn nguyên trong tệp cách ly
    const racMoved = files.find((f) => f.startsWith("rac.json.hong-"))!;
    expect(readFileSync(path.join(dir, racMoved), "utf8")).toBe("{không phải json");
    // tên "Lệch" không bị chiếm bởi tệp đã cách ly
    await store.create(makeSect("moi", { name: "Lệch", tag: "LE" }));
  });

  it("hai tệp trùng tên / thành viên (sửa tay): tông môn CŨ hơn (createdAt nhỏ) thắng dù tên tệp đứng sau; tông môn kia bị cách ly chứ không mất", async () => {
    const dir = freshDir();
    mkdirSync(dir, { recursive: true });
    const writeSect = (s: Sect) => writeFileSync(path.join(dir, `${s.id}.json`), JSON.stringify(s));
    // id của tông môn cũ đứng SAU theo bảng chữ cái: thứ tự nạp theo tên tệp sẽ chọn nhầm nếu không sắp theo createdAt
    writeSect(makeSect("zcu", { name: "Trùng Tên", tag: "CU", createdAt: 100 }));
    writeSect(makeSect("amoi1", { name: "TRÙNG TÊN", tag: "M1", createdAt: 200 })); // trùng tên
    writeSect(makeSect("amoi2", { name: "Khác Tag", tag: "cu", createdAt: 300 })); // trùng biệt hiệu
    const chung = { soulKey: "chung", name: "Chung", rank: "de_tu" as const, joinedAt: 1 };
    const withChung = (id: string) => [...makeSect(id).members, chung];
    writeSect(
      makeSect("zh1", { name: "Hồn A", tag: "HA", createdAt: 400, members: withChung("zh1") }),
    );
    writeSect(
      makeSect("ah2", { name: "Hồn B", tag: "HB", createdAt: 500, members: withChung("ah2") }),
    ); // trùng thành viên

    const store = new FileSectStore(dir, clock);
    expect((await store.all()).map((s) => s.id).sort()).toEqual(["zcu", "zh1"]);
    expect((await store.findBySoul("chung"))?.id).toBe("zh1");
    const moved = readdirSync(dir).filter((f) => f.includes(".hong-"));
    expect(moved.map((f) => f.split(".")[0]).sort()).toEqual(["ah2", "amoi1", "amoi2"]);
    // tệp bị cách ly còn nguyên nội dung để người vận hành khôi phục
    const keep = moved.find((f) => f.startsWith("ah2."))!;
    expect(JSON.parse(readFileSync(path.join(dir, keep), "utf8")).id).toBe("ah2");
  });

  it("tệp lưu đúng định dạng và đọc lại được bằng sanitizeSect; update ghi đè nguyên tử (không có tệp tạm)", async () => {
    const dir = freshDir();
    const store = new FileSectStore(dir, clock);
    await store.create(makeSect("f1", { coin: 9 }));
    await Promise.all(
      Array.from({ length: 10 }, () => store.update("f1", (s) => ({ ...s, coin: s.coin + 1 }))),
    );
    expect(readdirSync(dir)).toEqual(["f1.json"]);
    const onDisk = sanitizeSect(JSON.parse(readFileSync(path.join(dir, "f1.json"), "utf8")), NOW);
    expect(onDisk?.coin).toBe(19);
    expect(onDisk?.updatedAt).toBe(NOW);
  });

  it("delete xoá tệp (không để lại tệp mồ côi để lần khởi động sau sống lại)", async () => {
    const dir = freshDir();
    const store = new FileSectStore(dir, clock);
    await store.create(makeSect("d1"));
    await store.delete("d1");
    expect(readdirSync(dir)).toEqual([]);
    expect(await new FileSectStore(dir, clock).all()).toEqual([]);
  });

  it("thư mục chưa tồn tại: kho trống, tạo thư mục khi ghi lần đầu", async () => {
    const dir = path.join(freshDir(), "chua", "co");
    const store = new FileSectStore(dir, clock);
    expect(await store.all()).toEqual([]);
    await store.create(makeSect("n1"));
    expect(readdirSync(dir)).toEqual(["n1.json"]);
  });
});

describe("sectsDir", () => {
  const keep = { s: process.env.SECTS_DIR, d: process.env.DATA_DIR };
  afterEach(() => {
    if (keep.s === undefined) delete process.env.SECTS_DIR;
    else process.env.SECTS_DIR = keep.s;
    if (keep.d === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = keep.d;
  });
  it("SECTS_DIR nếu có, không thì <DATA_DIR>/sects", () => {
    process.env.DATA_DIR = "/tmp/du-lieu";
    delete process.env.SECTS_DIR;
    expect(sectsDir()).toBe(path.join("/tmp/du-lieu", "sects"));
    process.env.SECTS_DIR = "/tmp/tong-mon";
    expect(sectsDir()).toBe("/tmp/tong-mon");
  });
});

describe("kho đồ tông môn: sanitizeVault / assertWritableSect / withVaultLogEntry (mục 11)", () => {
  const big = ITEMS.reduce((a, b) => (b.stack > a.stack ? b : a));
  const real = ITEMS[0];

  it("thiếu kho (bản ghi cũ) hoặc kiểu sai: kho rỗng đủ SECT_VAULT_SLOTS ô, hạn mức mặc định", () => {
    for (const raw of [undefined, null, 5, "x", [], {}]) {
      const v = sanitizeVault(raw);
      expect(v.slots).toHaveLength(SECT_VAULT_SLOTS);
      expect(v.slots.every((x) => x === null)).toBe(true);
      expect(v.drawPerDay).toBe(SECT_VAULT_DRAW_DEFAULT);
      expect(v.log).toEqual([]);
    }
    const old = { ...makeSect("o1") } as Record<string, unknown>;
    delete old.vault;
    expect(sanitizeSect(old, NOW)?.vault).toEqual(emptySectVault());
  });

  it("làm sạch ô: món lạ / tên nguyên mẫu bị bỏ, qty ép về [1, stack], ô thừa bị cắt, ô hỏng thành trống", () => {
    const slots: unknown[] = Array.from({ length: SECT_VAULT_SLOTS + 5 }, () => null);
    slots[0] = { itemId: big.id, qty: big.stack + 500 };
    slots[1] = { itemId: "khong_co", qty: 3 };
    slots[2] = { itemId: "constructor", qty: 3 };
    slots[3] = { itemId: real.id, qty: 0 };
    slots[4] = { itemId: real.id, qty: 2.9 };
    slots[5] = "hỏng";
    slots[SECT_VAULT_SLOTS + 1] = { itemId: real.id, qty: 1 }; // ngoài số ô: bị cắt
    const v = sanitizeVault({ slots, drawPerDay: 4 });
    expect(v.slots).toHaveLength(SECT_VAULT_SLOTS);
    expect(v.slots[0]).toEqual({ itemId: big.id, qty: big.stack });
    expect(v.slots[1]).toBeNull();
    expect(v.slots[2]).toBeNull();
    expect(v.slots[3]).toBeNull();
    expect(v.slots[4]).toEqual({ itemId: real.id, qty: 2 });
    expect(v.slots[5]).toBeNull();
    expect(v.drawPerDay).toBe(4);
  });

  it("hạn mức kẹp 0..SECT_VAULT_DRAW_MAX (số lẻ cắt xuống), hỏng thì mặc định; sổ hỏng bỏ từng mục, dài thì cắt giữ mục đầu", () => {
    expect(sanitizeVault({ drawPerDay: 999 }).drawPerDay).toBe(SECT_VAULT_DRAW_MAX);
    expect(sanitizeVault({ drawPerDay: -4 }).drawPerDay).toBe(0);
    expect(sanitizeVault({ drawPerDay: 2.9 }).drawPerDay).toBe(2);
    expect(sanitizeVault({ drawPerDay: "3" }).drawPerDay).toBe(SECT_VAULT_DRAW_DEFAULT);
    expect(sanitizeVault({ drawPerDay: Number.NaN }).drawPerDay).toBe(SECT_VAULT_DRAW_DEFAULT);
    const good = (i: number) => ({
      at: i,
      name: "Chu s1",
      kind: "withdraw" as const,
      itemId: real.id,
      qty: i + 1,
    });
    const log = [
      good(1),
      { ...good(2), itemId: "khong_co" },
      { ...good(3), qty: 0 },
      { ...good(4), kind: "xoa" },
      { ...good(5), name: "" },
      ...Array.from({ length: SECT_VAULT_LOG_MAX + 4 }, (_, i) => good(10 + i)),
    ];
    const out = sanitizeVault({ log }).log;
    expect(out).toHaveLength(SECT_VAULT_LOG_MAX);
    expect(out[0]).toEqual(good(1)); // các mục hỏng bị bỏ riêng, mục đầu giữ nguyên
    expect(out.every((e) => e.qty >= 1)).toBe(true);
  });

  it("lượt rút của thành viên: ngày đúng dạng + số nguyên không âm được giữ; sai thì bỏ riêng trường đó", () => {
    const withDraw = (draw: unknown) => {
      const s = makeSect("d1");
      (s.members[0] as unknown as Record<string, unknown>).draw = draw;
      return sanitizeSect(JSON.parse(JSON.stringify(s)), NOW)!.members[0].draw;
    };
    expect(withDraw({ day: "2026-11-16", n: 2 })).toEqual({ day: "2026-11-16", n: 2 });
    expect(withDraw({ day: "2026-11-16", n: 2.7 })).toEqual({ day: "2026-11-16", n: 2 });
    expect(withDraw({ day: "2026-11-16", n: -5 })).toEqual({ day: "2026-11-16", n: 0 });
    for (const bad of [{ day: "hôm qua", n: 1 }, { n: 1 }, null, "x", 3]) {
      expect(withDraw(bad)).toBeUndefined();
    }
  });

  it("assertWritableSect: kho đồ hợp lệ qua; ô sai / món lạ / quá chồng / hạn mức ngoài khung / lượt rút sai thì NÉM LỖI (đồ không biến mất im lặng)", () => {
    const okSect = makeSect("w1");
    okSect.vault.slots[0] = { itemId: big.id, qty: big.stack };
    okSect.vault.drawPerDay = SECT_VAULT_DRAW_MAX;
    okSect.members[0].draw = { day: "2026-11-16", n: 3 };
    expect(assertWritableSect(okSect, NOW).vault.slots[0]).toEqual({
      itemId: big.id,
      qty: big.stack,
    });
    const mutate = (f: (s: Sect) => void) => {
      const s = structuredClone(okSect);
      f(s);
      return s;
    };
    for (const bad of [
      mutate((s) => s.vault.slots.pop()),
      mutate((s) => (s.vault.slots[1] = { itemId: "khong_co", qty: 1 })),
      mutate((s) => (s.vault.slots[1] = { itemId: big.id, qty: big.stack + 1 })),
      mutate((s) => (s.vault.slots[1] = { itemId: real.id, qty: 1.5 })),
      mutate((s) => (s.vault.drawPerDay = SECT_VAULT_DRAW_MAX + 1)),
      mutate((s) => (s.members[0].draw = { day: "x", n: 1 })),
      mutate((s) => (s.members[0].draw = { day: "2026-11-16", n: 1.5 })),
    ])
      expect(() => assertWritableSect(bad, NOW)).toThrow();
  });

  it("withVaultLogEntry: mục mới đứng đầu, cắt còn SECT_VAULT_LOG_MAX, không sửa mảng cũ; sổ quá dài khi ghi thì cắt (không phải lỗi)", () => {
    const e = (i: number) => ({
      at: i,
      name: "Chu",
      kind: "deposit" as const,
      itemId: real.id,
      qty: 1,
    });
    const base = Array.from({ length: SECT_VAULT_LOG_MAX }, (_, i) => e(i));
    const next = withVaultLogEntry(base, e(999));
    expect(next).toHaveLength(SECT_VAULT_LOG_MAX);
    expect(next[0].at).toBe(999);
    expect(base[0].at).toBe(0);
    const s = makeSect("w2");
    s.vault.log = [...base, e(1), e(2)];
    expect(assertWritableSect(s, NOW).vault.log).toHaveLength(SECT_VAULT_LOG_MAX);
  });
});
