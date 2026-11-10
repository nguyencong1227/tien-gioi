// SectService (M3.6 bước 6c): lập / mời / vào / rời / mời ra / chức vụ / chuyển quyền / giải tán / thông báo / kho. Kho thật
// (`FileSectStore` trong thư mục tạm) + đồng hồ giả; kiểm cả khi các thao tác ĐUA nhau (bất biến phải giữ).
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  COIN_CAP,
  SECT_COIN_CAP,
  SECT_CREATE_COOLDOWN_MS,
  SECT_ELDERS_MAX,
  SECT_LOG_MAX,
  SECT_MAX_MEMBERS,
  SECT_MOTD_MAX,
  SECT_REJOIN_COOLDOWN_MS,
} from "@tien-gioi/shared";
import { FileSectStore, type Sect } from "./sect-store";
import { SectService, sectViewOf, type SectActor } from "./sect-service";
import { makeSect } from "./store-contract";

const root = mkdtempSync(path.join(tmpdir(), "tien-gioi-sect-svc-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let n = 0;

let now = 1_700_000_000_000;
let store: FileSectStore;
let svc: SectService;
let ids = 0;
beforeEach(() => {
  now = 1_700_000_000_000;
  ids = 0;
  store = new FileSectStore(path.join(root, `s${++n}`), () => now);
  svc = new SectService(
    store,
    () => now,
    () => `sect${++ids}`,
  );
});

const actor = (k: string): SectActor => ({ soulKey: `k_${k}`, name: `Ten ${k}` });
const A = actor("a");
const B = actor("b");
const C = actor("c");
const D = actor("d");

/** Dựng tông môn "t1" do A làm Tông chủ, kèm thành viên (soulKey `k_<x>`) với chức vụ cho trước, qua kho (không qua dịch vụ). */
async function seed(members: [string, "truong_lao" | "de_tu"][] = [], over: Partial<Sect> = {}) {
  const base = makeSect("t1", {
    name: "Thanh Van",
    tag: "TV",
    leader: A.soulKey,
    members: [
      { soulKey: A.soulKey, name: A.name, rank: "chu", joinedAt: now },
      ...members.map(([k, rank], i) => ({
        soulKey: `k_${k}`,
        name: `Ten ${k}`,
        rank,
        joinedAt: now + i + 1,
      })),
    ],
    ...over,
  });
  return store.create(base);
}
const get = async () => (await store.get("t1"))!;
const rankOf = async (k: string) => (await get()).members.find((m) => m.soulKey === `k_${k}`)?.rank;

describe("lập tông môn", () => {
  it("người lập thành Tông chủ duy nhất; tên / biệt hiệu được chuẩn hoá; kho 0, sổ rỗng", async () => {
    const r = await svc.create(A, "  Thanh   Van ", " TV ");
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) throw new Error();
    expect(r.sect).toMatchObject({
      id: "sect1",
      name: "Thanh Van",
      tag: "TV",
      leader: A.soulKey,
      motd: "",
      coin: 0,
      log: [],
      createdAt: now,
    });
    expect(r.sect.members).toEqual([
      { soulKey: A.soulKey, name: A.name, rank: "chu", joinedAt: now },
    ]);
    expect((await svc.sectOf(A.soulKey))?.id).toBe("sect1");
  });

  it("tên / biệt hiệu sai luật bị từ chối trước khi chạm kho; kiểu sai cũng vậy", async () => {
    expect(await svc.create(A, "x", "TV")).toEqual({ ok: false, reason: "name_invalid" });
    expect(await svc.create(A, "Tên<b>", "TV")).toEqual({ ok: false, reason: "name_invalid" });
    expect(await svc.create(A, 5, "TV")).toEqual({ ok: false, reason: "name_invalid" });
    expect(await svc.create(A, "Thanh Van", "T")).toEqual({ ok: false, reason: "tag_invalid" });
    expect(await svc.create(A, "Thanh Van", "T V")).toEqual({ ok: false, reason: "tag_invalid" });
    expect(await svc.create(A, "Thanh Van", null)).toEqual({ ok: false, reason: "tag_invalid" });
    expect(await store.all()).toEqual([]);
    expect(svc.createCooldownLeft(A.soulKey)).toBe(0); // lần hỏng không tính hồi chiêu
  });

  it("trùng tên / biệt hiệu (không phân biệt hoa thường) và người đã ở tông môn bị từ chối", async () => {
    await svc.create(A, "Thanh Van", "TV");
    expect(await svc.create(B, "THANH VAN", "XX")).toEqual({ ok: false, reason: "name_taken" });
    expect(await svc.create(B, "Khac Ten", "tv")).toEqual({ ok: false, reason: "tag_taken" });
    now += SECT_CREATE_COOLDOWN_MS;
    expect(await svc.create(A, "Tong Hai", "TH")).toEqual({ ok: false, reason: "already_in_sect" });
    expect((await store.all()).length).toBe(1);
  });

  it("hồi chiêu lập: lập rồi giải tán rồi lập lại trong 60 giây bị từ chối, sau đó được", async () => {
    await svc.create(A, "Thanh Van", "TV");
    expect(svc.createCooldownLeft(A.soulKey)).toBe(SECT_CREATE_COOLDOWN_MS);
    await svc.disband(A);
    expect(await svc.create(A, "Tong Moi", "TM")).toEqual({ ok: false, reason: "create_cooldown" });
    now += SECT_CREATE_COOLDOWN_MS - 1;
    expect(await svc.create(A, "Tong Moi", "TM")).toEqual({ ok: false, reason: "create_cooldown" });
    now += 1;
    expect(await svc.create(A, "Tong Moi", "TM")).toMatchObject({ ok: true });
  });

  it("hai người lập CÙNG LÚC cùng tên: đúng một tông môn ra đời", async () => {
    const [x, y] = await Promise.all([
      svc.create(A, "Dua Ten", "D1"),
      svc.create(B, "dua ten", "D2"),
    ]);
    expect([x.ok, y.ok].filter(Boolean)).toHaveLength(1);
    const lost = x.ok ? y : x;
    expect(lost).toEqual({ ok: false, reason: "name_taken" });
    expect(await store.all()).toHaveLength(1);
  });

  it("một người bấm lập hai lần cùng lúc: một tông môn, lần kia 'đã ở tông môn' hoặc hồi chiêu", async () => {
    const [x, y] = await Promise.all([
      svc.create(A, "Mot Ten", "M1"),
      svc.create(A, "Hai Ten", "M2"),
    ]);
    expect([x.ok, y.ok].filter(Boolean)).toHaveLength(1);
    expect(await store.all()).toHaveLength(1);
  });
});

describe("mời và vào", () => {
  it("checkInvite: Tông chủ và Trưởng lão mời được; Đệ tử, người ngoài không", async () => {
    await seed([
      ["b", "truong_lao"],
      ["c", "de_tu"],
    ]);
    expect(await svc.checkInvite(A.soulKey, D.soulKey)).toMatchObject({ ok: true });
    expect(await svc.checkInvite(B.soulKey, D.soulKey)).toMatchObject({ ok: true });
    expect(await svc.checkInvite(C.soulKey, D.soulKey)).toEqual({ ok: false, reason: "forbidden" });
    expect(await svc.checkInvite(D.soulKey, B.soulKey)).toEqual({
      ok: false,
      reason: "not_in_sect",
    });
  });

  it("checkInvite: không mời chính mình, người đã ở tông môn, người còn hồi chiêu vào lại; tông môn đầy", async () => {
    await seed([["b", "de_tu"]]);
    expect(await svc.checkInvite(A.soulKey, A.soulKey)).toEqual({
      ok: false,
      reason: "target_self",
    });
    expect(await svc.checkInvite(A.soulKey, B.soulKey)).toEqual({
      ok: false,
      reason: "target_in_sect",
    });
    await svc.leave(B); // B rời: hồi chiêu vào lại
    expect(await svc.checkInvite(A.soulKey, B.soulKey)).toEqual({
      ok: false,
      reason: "target_rejoin_cooldown",
    });
    now += SECT_REJOIN_COOLDOWN_MS;
    expect(await svc.checkInvite(A.soulKey, B.soulKey)).toMatchObject({ ok: true });
    // đầy
    await store.update("t1", (s) => ({
      ...s,
      members: [
        ...s.members,
        ...Array.from({ length: SECT_MAX_MEMBERS - s.members.length }, (_, i) => ({
          soulKey: `dd${i}`,
          name: `Dd ${i}`,
          rank: "de_tu" as const,
          joinedAt: 5,
        })),
      ],
    }));
    expect((await get()).members).toHaveLength(SECT_MAX_MEMBERS);
    expect(await svc.checkInvite(A.soulKey, B.soulKey)).toEqual({ ok: false, reason: "sect_full" });
  });

  it("join: vào với chức Đệ tử, ghi đúng tên và thời điểm", async () => {
    await seed();
    now += 5000;
    const r = await svc.join("t1", A.soulKey, B);
    expect(r).toMatchObject({ ok: true });
    expect((await get()).members.find((m) => m.soulKey === B.soulKey)).toEqual({
      soulKey: B.soulKey,
      name: B.name,
      rank: "de_tu",
      joinedAt: now,
    });
  });

  it("join kiểm LẠI lúc nhận: người mời đã rời / mất quyền mời / tông môn đã giải tán / đã ở tông môn khác", async () => {
    await seed([["b", "truong_lao"]]);
    // người mời mất quyền mời (bị giáng xuống Đệ tử)
    await svc.setRank(A, B.name, "de_tu");
    expect(await svc.join("t1", B.soulKey, C)).toEqual({ ok: false, reason: "invite_invalid" });
    // người mời đã rời
    await svc.leave(B);
    expect(await svc.join("t1", B.soulKey, C)).toEqual({ ok: false, reason: "invite_invalid" });
    // đã ở tông môn khác
    await store.create(
      makeSect("t2", {
        name: "Tong Hai",
        tag: "T2",
        leader: "k_x",
        members: [
          { soulKey: "k_x", name: "Ten x", rank: "chu", joinedAt: 1 },
          { soulKey: C.soulKey, name: C.name, rank: "de_tu", joinedAt: 2 },
        ],
      }),
    );
    expect(await svc.join("t1", A.soulKey, C)).toEqual({ ok: false, reason: "already_in_sect" });
    // tông môn không còn
    await svc.disband(A);
    expect(await svc.join("t1", A.soulKey, D)).toEqual({ ok: false, reason: "invite_invalid" });
    expect(await svc.join("khong_co", A.soulKey, D)).toEqual({
      ok: false,
      reason: "invite_invalid",
    });
  });

  it("join: còn hồi chiêu vào lại thì rejoin_cooldown; tông môn đầy thì sect_full; hai người tranh chỗ cuối: một người vào", async () => {
    await seed([["b", "de_tu"]]);
    await svc.leave(B);
    expect(await svc.join("t1", A.soulKey, B)).toEqual({ ok: false, reason: "rejoin_cooldown" });
    now += SECT_REJOIN_COOLDOWN_MS;
    expect(await svc.join("t1", A.soulKey, B)).toMatchObject({ ok: true });
    // còn đúng một chỗ
    await store.update("t1", (s) => ({
      ...s,
      members: [
        ...s.members,
        ...Array.from({ length: SECT_MAX_MEMBERS - 1 - s.members.length }, (_, i) => ({
          soulKey: `dd${i}`,
          name: `Dd ${i}`,
          rank: "de_tu" as const,
          joinedAt: 5,
        })),
      ],
    }));
    const [x, y] = await Promise.all([svc.join("t1", A.soulKey, C), svc.join("t1", A.soulKey, D)]);
    expect([x.ok, y.ok].filter(Boolean)).toHaveLength(1);
    expect(x.ok ? y : x).toEqual({ ok: false, reason: "sect_full" });
    expect((await get()).members).toHaveLength(SECT_MAX_MEMBERS);
  });

  it("hai tông môn cùng mời một người, người đó nhận cả hai cùng lúc: chỉ vào một", async () => {
    await seed();
    await store.create(
      makeSect("t2", {
        name: "Tong Hai",
        tag: "T2",
        leader: "k_x",
        members: [{ soulKey: "k_x", name: "Ten x", rank: "chu", joinedAt: 1 }],
      }),
    );
    const [x, y] = await Promise.all([svc.join("t1", A.soulKey, D), svc.join("t2", "k_x", D)]);
    expect([x.ok, y.ok].filter(Boolean)).toHaveLength(1);
    expect(x.ok ? y : x).toEqual({ ok: false, reason: "already_in_sect" });
    expect(
      (await store.findBySoul(D.soulKey))?.members.filter((m) => m.soulKey === D.soulKey),
    ).toHaveLength(1);
  });

  it("refreshName: đổi tên đã lưu; không ở tông môn thì sect null; không đổi thì không ghi", async () => {
    await seed([["b", "de_tu"]]);
    expect(await svc.refreshName(D)).toEqual({ ok: true, sect: null });
    const before = (await get()).updatedAt;
    now += 10;
    expect(await svc.refreshName(B)).toMatchObject({ ok: true });
    expect((await get()).updatedAt).toBe(before); // tên y hệt: không ghi
    const r = await svc.refreshName({ soulKey: B.soulKey, name: "Ten Moi" });
    expect(r.ok && r.sect?.members.find((m) => m.soulKey === B.soulKey)?.name).toBe("Ten Moi");
    expect((await get()).members.find((m) => m.soulKey === B.soulKey)?.name).toBe("Ten Moi");
  });
});

describe("rời / mời ra", () => {
  it("Đệ tử và Trưởng lão rời được, có hồi chiêu vào lại; Tông chủ phải chuyển quyền trước (kể cả khi một mình)", async () => {
    await seed([
      ["b", "truong_lao"],
      ["c", "de_tu"],
    ]);
    expect(await svc.leave(A)).toEqual({ ok: false, reason: "leader_must_transfer" });
    const r = await svc.leave(C);
    expect(r.ok && r.sect.members.map((m) => m.soulKey)).toEqual([A.soulKey, B.soulKey]);
    expect(svc.rejoinLeft(C.soulKey)).toBe(SECT_REJOIN_COOLDOWN_MS);
    expect(await svc.leave(C)).toEqual({ ok: false, reason: "not_in_sect" });
    expect(await svc.leave(B)).toMatchObject({ ok: true });
    // còn một mình: vẫn không được rời, phải giải tán
    expect(await svc.leave(A)).toEqual({ ok: false, reason: "leader_must_transfer" });
    expect(await get()).toBeTruthy();
  });

  it("mời ra: Tông chủ mời được mọi người; Trưởng lão chỉ Đệ tử; Đệ tử không; người bị mời ra có hồi chiêu", async () => {
    await seed([
      ["b", "truong_lao"],
      ["c", "truong_lao"],
      ["d", "de_tu"],
      ["e", "de_tu"],
    ]);
    const E = actor("e");
    expect(await svc.kick(B, C.name)).toEqual({ ok: false, reason: "forbidden" });
    expect(await svc.kick(B, A.name)).toEqual({ ok: false, reason: "forbidden" });
    expect(await svc.kick(D, E.name)).toEqual({ ok: false, reason: "forbidden" });
    const r = await svc.kick(B, D.name);
    expect(r).toMatchObject({ ok: true, removed: { soulKey: D.soulKey, rank: "de_tu" } });
    expect(svc.rejoinLeft(D.soulKey)).toBe(SECT_REJOIN_COOLDOWN_MS);
    expect(await svc.sectOf(D.soulKey)).toBeNull();
    const r2 = await svc.kick(A, C.name);
    expect(r2).toMatchObject({ ok: true, removed: { soulKey: C.soulKey, rank: "truong_lao" } });
    expect((await get()).members.map((m) => m.soulKey).sort()).toEqual(
      [A.soulKey, B.soulKey, E.soulKey].sort(),
    );
  });

  it("mời ra: không tìm thấy, chính mình, chưa ở tông môn; tên không phân biệt hoa thường", async () => {
    await seed([["b", "de_tu"]]);
    expect(await svc.kick(A, "Khong Co")).toEqual({ ok: false, reason: "member_not_found" });
    expect(await svc.kick(A, A.name)).toEqual({ ok: false, reason: "target_self" });
    expect(await svc.kick(D, B.name)).toEqual({ ok: false, reason: "not_in_sect" });
    expect(await svc.kick(A, B.name.toUpperCase())).toMatchObject({ ok: true });
  });
});

describe("chức vụ và chuyển quyền", () => {
  it("setRank: chỉ Tông chủ; thăng Trưởng lão, giáng Đệ tử; trùng chức vụ, chính mình, người lạ bị từ chối", async () => {
    await seed([
      ["b", "de_tu"],
      ["c", "de_tu"],
    ]);
    expect(await svc.setRank(B, C.name, "truong_lao")).toEqual({ ok: false, reason: "forbidden" });
    expect(await svc.setRank(A, B.name, "truong_lao")).toMatchObject({ ok: true });
    expect(await rankOf("b")).toBe("truong_lao");
    expect(await svc.setRank(B, C.name, "truong_lao")).toEqual({ ok: false, reason: "forbidden" }); // Trưởng lão không đổi được
    expect(await svc.setRank(A, B.name, "truong_lao")).toEqual({ ok: false, reason: "same_rank" });
    expect(await svc.setRank(A, A.name, "de_tu")).toEqual({ ok: false, reason: "target_self" });
    expect(await svc.setRank(A, "Khong Co", "de_tu")).toEqual({
      ok: false,
      reason: "member_not_found",
    });
    expect(await svc.setRank(A, B.name, "de_tu")).toMatchObject({ ok: true });
    expect(await rankOf("b")).toBe("de_tu");
    expect(await rankOf("a")).toBe("chu"); // không bao giờ làm mất Tông chủ
  });

  it("Trưởng lão tối đa SECT_ELDERS_MAX; hai lần thăng cùng lúc ở chỗ cuối: một lần thành công", async () => {
    const ks = Array.from({ length: SECT_ELDERS_MAX + 2 }, (_, i) => `m${i}`);
    await seed(
      ks.map(
        (k, i) =>
          [k, i < SECT_ELDERS_MAX - 1 ? "truong_lao" : "de_tu"] as [string, "truong_lao" | "de_tu"],
      ),
    );
    const [x, y] = await Promise.all([
      svc.setRank(A, `Ten ${ks[SECT_ELDERS_MAX - 1]}`, "truong_lao"),
      svc.setRank(A, `Ten ${ks[SECT_ELDERS_MAX]}`, "truong_lao"),
    ]);
    expect([x.ok, y.ok].filter(Boolean)).toHaveLength(1);
    expect(x.ok ? y : x).toEqual({ ok: false, reason: "elders_full" });
    expect((await get()).members.filter((m) => m.rank === "truong_lao")).toHaveLength(
      SECT_ELDERS_MAX,
    );
  });

  it("transfer: người nhận thành Tông chủ, mình xuống Trưởng lão, `leader` đổi theo; luôn đúng MỘT Tông chủ", async () => {
    await seed([
      ["b", "truong_lao"],
      ["c", "de_tu"],
    ]);
    expect(await svc.transfer(B, C.name)).toEqual({ ok: false, reason: "forbidden" });
    expect(await svc.transfer(A, A.name)).toEqual({ ok: false, reason: "target_self" });
    expect(await svc.transfer(A, "Khong Co")).toEqual({ ok: false, reason: "member_not_found" });
    expect(await svc.transfer(A, B.name)).toMatchObject({ ok: true });
    const s = await get();
    expect(s.leader).toBe(B.soulKey);
    expect(s.members.filter((m) => m.rank === "chu").map((m) => m.soulKey)).toEqual([B.soulKey]);
    expect(await rankOf("a")).toBe("truong_lao");
    // Tông chủ cũ giờ không còn quyền Tông chủ
    expect(await svc.transfer(A, C.name)).toEqual({ ok: false, reason: "forbidden" });
    expect(await svc.disband(A)).toEqual({ ok: false, reason: "forbidden" });
  });

  it("transfer bị từ chối khi làm vượt số Trưởng lão (người nhận là Đệ tử, đã đủ Trưởng lão)", async () => {
    await seed([
      ...Array.from(
        { length: SECT_ELDERS_MAX },
        (_, i) => [`e${i}`, "truong_lao"] as [string, "truong_lao"],
      ),
      ["z", "de_tu"],
    ]);
    expect(await svc.transfer(A, "Ten z")).toEqual({ ok: false, reason: "elders_full" });
    expect((await get()).leader).toBe(A.soulKey);
    // nhưng chuyển cho một Trưởng lão thì được (số Trưởng lão không đổi)
    expect(await svc.transfer(A, "Ten e0")).toMatchObject({ ok: true });
    expect((await get()).members.filter((m) => m.rank === "truong_lao")).toHaveLength(
      SECT_ELDERS_MAX,
    );
  });

  it("hai lần chuyển quyền của cùng Tông chủ cho hai người khác nhau CÙNG LÚC: chỉ một lần thành công, vẫn một Tông chủ", async () => {
    await seed([
      ["b", "de_tu"],
      ["c", "de_tu"],
    ]);
    const [x, y] = await Promise.all([svc.transfer(A, B.name), svc.transfer(A, C.name)]);
    expect([x.ok, y.ok].filter(Boolean)).toHaveLength(1);
    expect(x.ok ? y : x).toEqual({ ok: false, reason: "forbidden" });
    const s = await get();
    expect(s.members.filter((m) => m.rank === "chu")).toHaveLength(1);
    expect(s.members.find((m) => m.rank === "chu")?.soulKey).toBe(s.leader);
  });

  it("Tông chủ chuyển quyền trong lúc người nhận vừa bị mời ra: từ chối, không ai thành Tông chủ nhầm", async () => {
    await seed([
      ["b", "truong_lao"],
      ["c", "de_tu"],
    ]);
    const [kick, tr] = await Promise.all([svc.kick(A, C.name), svc.transfer(A, C.name)]);
    expect(kick).toMatchObject({ ok: true });
    expect(tr).toEqual({ ok: false, reason: "member_not_found" });
    expect((await get()).leader).toBe(A.soulKey);
  });
});

describe("giải tán và thông báo", () => {
  it("chỉ Tông chủ giải tán; mọi thành viên bị gỡ; trả tông môn trước khi xoá để báo", async () => {
    await seed([
      ["b", "truong_lao"],
      ["c", "de_tu"],
    ]);
    expect(await svc.disband(B)).toEqual({ ok: false, reason: "forbidden" });
    expect(await svc.disband(D)).toEqual({ ok: false, reason: "not_in_sect" });
    const r = await svc.disband(A);
    expect(r.ok && r.sect.members.map((m) => m.soulKey).sort()).toEqual(
      [A.soulKey, B.soulKey, C.soulKey].sort(),
    );
    expect(await store.all()).toEqual([]);
    for (const x of [A, B, C]) expect(await svc.sectOf(x.soulKey)).toBeNull();
  });

  it("kho còn Linh thạch thì không giải tán; rút hết rồi mới giải tán", async () => {
    await seed([], { coin: 40 });
    expect(await svc.disband(A)).toEqual({ ok: false, reason: "treasury_not_empty" });
    expect((await get()).coin).toBe(40);
    await svc.withdraw(A, 40);
    expect(await svc.disband(A)).toMatchObject({ ok: true });
  });

  it("góp chạy ĐUA với giải tán: Linh thạch không bao giờ biến mất (hoặc kho còn và không xoá, hoặc góp thấy 'không có' để hoàn tiền)", async () => {
    for (let i = 0; i < 8; i++) {
      await seed([["b", "de_tu"]]);
      const [dis, dep] = await Promise.all(
        i % 2 === 0
          ? [svc.disband(A), svc.deposit(B, 30)]
          : [svc.deposit(B, 30), svc.disband(A)].reverse(),
      );
      const left = await store.get("t1");
      if (left) {
        // góp thắng trước: kho có 30, giải tán bị chặn
        expect(left.coin).toBe(30);
        expect(dis).toEqual({ ok: false, reason: "treasury_not_empty" });
        expect(dep).toMatchObject({ ok: true });
        await svc.withdraw(A, 30);
        await svc.disband(A);
      } else {
        // giải tán thắng trước: kho rỗng lúc xoá, lần góp bị từ chối (người gọi hoàn tiền ví)
        expect(dis).toMatchObject({ ok: true });
        expect(dep).toEqual({ ok: false, reason: "not_in_sect" });
      }
      expect(await store.all()).toEqual([]);
    }
  });

  it("setMotd: Tông chủ và Trưởng lão; làm sạch, một dòng, cắt độ dài; Đệ tử không", async () => {
    await seed([
      ["b", "truong_lao"],
      ["c", "de_tu"],
    ]);
    expect(await svc.setMotd(C, "Chao")).toEqual({ ok: false, reason: "forbidden" });
    const r = await svc.setMotd(A, "  Hom nay\n san  boss‮ ");
    expect(r.ok && r.sect.motd).toBe("Hom nay san boss");
    const long = await svc.setMotd(B, "a".repeat(SECT_MOTD_MAX + 40));
    expect(long.ok && long.sect.motd).toBe("a".repeat(SECT_MOTD_MAX));
    expect((await svc.setMotd(A, "")).ok && (await get()).motd).toBe("");
    expect(await svc.setMotd(A, 5)).toEqual({ ok: false, reason: "error" });
    expect(await svc.setMotd(D, "x")).toEqual({ ok: false, reason: "not_in_sect" });
  });
});

describe("kho chung", () => {
  it("góp: mọi thành viên; cộng kho, ghi sổ (mới nhất đứng đầu, đúng tên và giờ)", async () => {
    await seed([["b", "de_tu"]]);
    now += 1000;
    const r1 = await svc.deposit(B, 70);
    now += 1000;
    const r2 = await svc.deposit(A, 30);
    expect(r1).toMatchObject({ ok: true });
    expect(r2.ok && r2.sect.coin).toBe(100);
    const log = (await get()).log;
    expect(log.map((e) => [e.name, e.kind, e.amount])).toEqual([
      [A.name, "deposit", 30],
      [B.name, "deposit", 70],
    ]);
    expect(log[0].at).toBeGreaterThan(log[1].at);
  });

  it("góp: số lượng không hợp lệ, vượt trần kho (không góp dở), người ngoài", async () => {
    await seed([], { coin: SECT_COIN_CAP - 10 });
    for (const bad of [0, -1, 1.5, Number.NaN, Infinity, COIN_CAP + 1, "5" as unknown as number])
      expect(await svc.deposit(A, bad), String(bad)).toEqual({
        ok: false,
        reason: "amount_invalid",
      });
    expect(await svc.deposit(A, 11)).toEqual({ ok: false, reason: "treasury_full" });
    expect((await get()).coin).toBe(SECT_COIN_CAP - 10);
    expect(await svc.deposit(A, 10)).toMatchObject({ ok: true });
    expect((await get()).coin).toBe(SECT_COIN_CAP);
    expect(await svc.deposit(D, 1)).toEqual({ ok: false, reason: "not_in_sect" });
  });

  it("rút: chỉ Tông chủ; không rút quá số dư (không rút dở); ghi sổ", async () => {
    await seed(
      [
        ["b", "truong_lao"],
        ["c", "de_tu"],
      ],
      { coin: 100 },
    );
    expect(await svc.withdraw(B, 10)).toEqual({ ok: false, reason: "forbidden" });
    expect(await svc.withdraw(C, 10)).toEqual({ ok: false, reason: "forbidden" });
    expect(await svc.withdraw(A, 101)).toEqual({ ok: false, reason: "treasury_short" });
    expect(await svc.withdraw(A, 0)).toEqual({ ok: false, reason: "amount_invalid" });
    expect((await get()).coin).toBe(100);
    const r = await svc.withdraw(A, 60);
    expect(r.ok && r.sect.coin).toBe(40);
    expect((await get()).log[0]).toMatchObject({ name: A.name, kind: "withdraw", amount: 60 });
  });

  it("40 lần góp và 10 lần rút đồng thời: số dư đúng tổng (không mất, không nhân đôi); không bao giờ âm", async () => {
    await seed([["b", "de_tu"]], { coin: 1000 });
    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i < 40; i++) jobs.push(svc.deposit(i % 2 ? A : B, 5));
    for (let i = 0; i < 10; i++) jobs.push(svc.withdraw(A, 20));
    await Promise.all(jobs);
    expect((await get()).coin).toBe(1000 + 40 * 5 - 10 * 20);
  });

  it("rút ĐUA nhau quá số dư: chỉ những lần đủ tiền thành công, kho không âm", async () => {
    await seed([], { coin: 50 });
    const rs = await Promise.all(Array.from({ length: 5 }, () => svc.withdraw(A, 20)));
    expect(rs.filter((r) => r.ok)).toHaveLength(2);
    expect(rs.filter((r) => !r.ok).every((r) => !r.ok && r.reason === "treasury_short")).toBe(true);
    expect((await get()).coin).toBe(10);
  });

  it("sổ chỉ giữ SECT_LOG_MAX mục mới nhất", async () => {
    await seed();
    for (let i = 1; i <= SECT_LOG_MAX + 5; i++) {
      now += 1;
      await svc.deposit(A, i);
    }
    const log = (await get()).log;
    expect(log).toHaveLength(SECT_LOG_MAX);
    expect(log[0].amount).toBe(SECT_LOG_MAX + 5);
    expect(log[SECT_LOG_MAX - 1].amount).toBe(6);
  });

  it("Tông chủ bị mời ra... không thể; người vừa bị mời ra góp: bị từ chối, kho không đổi", async () => {
    await seed([["b", "de_tu"]], { coin: 10 });
    await svc.kick(A, B.name);
    expect(await svc.deposit(B, 5)).toEqual({ ok: false, reason: "not_in_sect" });
    expect((await get()).coin).toBe(10);
  });
});

describe("ảnh chụp, hồi chiêu, lỗi hệ thống", () => {
  it("sectViewOf: hạng của người xem, thành viên xếp Tông chủ trước, kho, sổ; người ngoài nhận null; không lộ soulKey", async () => {
    await seed(
      [
        ["c", "de_tu"],
        ["b", "truong_lao"],
      ],
      { coin: 9, motd: "Chao" },
    );
    const s = await get();
    const v = sectViewOf(s, C.soulKey)!;
    expect(v).toMatchObject({
      name: "Thanh Van",
      tag: "TV",
      motd: "Chao",
      myRank: "de_tu",
      coin: 9,
    });
    expect(v.members.map((m) => m.name)).toEqual([A.name, B.name, C.name]);
    expect(JSON.stringify(v)).not.toContain("k_a");
    expect(sectViewOf(s, D.soulKey)).toBeNull();
    v.members.length = 0; // sửa ảnh chụp không đổi bản ghi
    expect((await get()).members).toHaveLength(3);
  });

  it("_sweep dọn hồi chiêu hết hạn; _cooldownSize về 0", async () => {
    await seed([["b", "de_tu"]]);
    await svc.create(C, "Tong Cua C", "TC");
    await svc.leave(B);
    expect(svc._cooldownSize).toBe(2);
    expect(svc._sweep()).toBe(0);
    now += SECT_REJOIN_COOLDOWN_MS;
    expect(svc._sweep()).toBe(2);
    expect(svc._cooldownSize).toBe(0);
  });

  describe("lỗi của kho", () => {
    let err: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      err = vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => err.mockRestore());

    it("kho ném lỗi lạ: kết quả { ok: false, reason: 'error' } (không reject), log chỉ có tên lỗi, thao tác sau vẫn chạy", async () => {
      await seed([["b", "de_tu"]]);
      const boom = new Error("postgres://nguoi:bi-mat-xyz@may-chu/db");
      const spy = vi.spyOn(store, "update").mockRejectedValueOnce(boom);
      expect(await svc.deposit(B, 5)).toEqual({ ok: false, reason: "error" });
      expect(JSON.stringify(err.mock.calls)).not.toContain("bi-mat-xyz");
      spy.mockRestore();
      expect(await svc.deposit(B, 5)).toMatchObject({ ok: true });
      expect((await get()).coin).toBe(5);
    });
  });
});
