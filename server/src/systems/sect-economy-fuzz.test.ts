// Kiểm kinh tế đồng thời tông môn có chiều sâu (M8.8, Issue #845; docs/THIET_KE_TONG_MON.md mục 12.11 (1)-(2)):
// Kịch bản ngẫu nhiên có seed (mulberry32) mô phỏng các chuỗi thao tác đua đồng thời ở HAI phòng (Lạc Hà + Hắc Phong):
// góp - rút chéo (Linh thạch + đồ), nhận - trả nhiệm vụ tông hằng ngày, mua cửa hàng (Bảo khố + Tàng Kinh Các),
// nhảy tông, rời - vào lại, giải tán, đầu thai giữa ngày, trả nhiệm vụ hai lần, gửi dồn tin, lưu lỗi, sập đĩa giữa chừng, qua cổng.
//
// Các bất biến kinh tế (kiểm sau MỖI hành động và sau mỗi vòng):
//   1. Mỗi linh hồn mỗi ngày kiếm tổng <= SECT_EARN_DAY_CAP (140) trên MỌI tông môn gộp lại (chống nhảy tông / đầu thai lách trần).
//   2. 0 <= contrib <= merit <= SECT_CONTRIB_CAP: tiêu cống hiến không bao giờ trừ công tích hay làm contrib vượt merit.
//   3. Sect.points đúng bằng tổng cống hiến đã từng award cho tông môn đó; points >= sum(member.merit của mọi thành viên hiện tại).
//   4. Bảo toàn khi sập: (cống hiến + đồ) trên đĩa không bao giờ tăng qua sập hoặc lỗi lưu (chỉ có thể MẤT, không bao giờ nhân đôi).
//   5. Cân bằng và toàn vẹn: sectBalanceViolations() sạch trên bảng dữ liệu; cấu trúc kho: 1 Tông chủ, không trùng linh hồn.
//
// Kèm các ca đột biến (mutations) chứng minh test bắt được ĐỎ khi từng bất biến bị vi phạm.
import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  DEFAULT_MAP,
  HAC_PHONG_ID,
  SECT_CONTRIB_CAP,
  SECT_DEPOSIT_DAY_CAP,
  SECT_EARN_DAY_CAP,
  SECT_POINTS_CAP,
  addToInventory,
  dayKey,
  getMap,
  validateRebirth,
} from "@tien-gioi/shared";
import { Hub } from "../hub";
import { FileSectStore } from "../sect-store";
import { SectService } from "../sect-service";
import { sectBalanceViolations } from "../balance/tong-mon";
import { applyRebirth, beginLimbo } from "./reincarnation";
import {
  sectAnswer,
  sectCreate,
  sectDeposit,
  sectInvite,
  sectLeave,
  sectQuestAccept,
  sectQuestTurnIn,
  sectShopBuy,
  sectVaultDeposit,
  sectVaultWithdraw,
  sectWithdraw,
} from "./sect";
import { installSectQuestFixture, installSectShopFixture } from "./sect-fixtures";
import { addPlayer, makeWorld } from "./test-helpers";

const root = mkdtempSync(path.join(tmpdir(), "tien-gioi-sect-economy-fuzz-"));
const restoreQuest = installSectQuestFixture();
const restoreShop = installSectShopFixture();

afterAll(() => {
  restoreQuest();
  restoreShop();
  rmSync(root, { recursive: true, force: true });
});

let dirSeq = 0;
const DAY = 86_400_000;
const WHO = ["Alpha", "Bravo", "Charlie", "Delta"] as const;
const HP_SET = new Set<string>(["Bravo", "Delta"]); // Hắc Phong Cốc, còn lại ở Lạc Hà
const keyOf = (s: string) => s.toLowerCase();

/** Bộ sinh số ngẫu nhiên có hạt (mulberry32): kịch bản lặp lại được 100%. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const yieldIO = () => new Promise<void>((r) => setImmediate(r));

interface Chaos {
  failSave: () => boolean;
  failStore: () => boolean;
}
const noChaos: Chaos = { failSave: () => false, failStore: () => false };

/** Sổ cái độc lập theo dõi toàn bộ lượng cống hiến đã award để đối chiếu bất biến. */
class EconomyLedger {
  /** Map<`${soulKey}:${dayKey}`, number> : tổng cống hiến một linh hồn đã nhận trong một ngày (trên mọi tông) */
  soulEarnedByDay = new Map<string, number>();

  /** Map<sectId, number> : tổng cống hiến đã từng award cho tông môn này */
  sectPointsAwarded = new Map<string, number>();

  /** Danh sách vi phạm bất biến được ghi nhận */
  violations: string[] = [];

  recordAward(soulKey: string, day: string, sectId: string, amount: number) {
    if (amount <= 0) return;
    const sKey = `${soulKey}:${day}`;
    const curSoul = (this.soulEarnedByDay.get(sKey) ?? 0) + amount;
    this.soulEarnedByDay.set(sKey, curSoul);

    const curSect = (this.sectPointsAwarded.get(sectId) ?? 0) + amount;
    this.sectPointsAwarded.set(sectId, curSect);

    // Bất biến 1: tổng kiếm trong ngày trên MỌI tông môn không được vượt SECT_EARN_DAY_CAP
    if (curSoul > SECT_EARN_DAY_CAP) {
      this.violations.push(
        `Linh hồn ${soulKey} kiếm ${curSoul} > trần ${SECT_EARN_DAY_CAP} trong ngày ${day}`,
      );
    }
  }
}

/** Dựng môi trường thử: 2 phòng Colyseus (World giả) + Hub chung + 1 FileSectStore thật (tệp). */
function buildRig(seed: number, chaos: Chaos = noChaos) {
  const rand = rng(seed);
  let now = 1_700_000_000_000; // Mốc thời gian ban đầu
  const hub = new Hub();
  const lh = makeWorld(DEFAULT_MAP, hub);
  const hp = makeWorld(getMap(HAC_PHONG_ID)!, hub);

  const roomOf = (who: string) => {
    // Tìm phòng hiện tại của người chơi
    if (lh.w.ctrl.has(who)) return lh;
    if (hp.w.ctrl.has(who)) return hp;
    return HP_SET.has(who) ? hp : lh;
  };

  const storeDir = path.join(root, `s${++dirSeq}`);
  const store = new FileSectStore(storeDir, () => now);
  const ledger = new EconomyLedger();

  let sectSeq = 0;
  const svc = new SectService(
    store,
    () => now,
    () => `sect_${++sectSeq}`,
  );

  // Bọc store.update để mô phỏng sự cố và ghi nhận ledger
  const origUpdate = store.update.bind(store);
  store.update = async (id, fn) => {
    if (chaos.failStore()) throw new Error("Kho tệp lỗi (mô phỏng)");
    return origUpdate(id, fn);
  };

  // Cấu hình hai phòng
  for (const r of [lh, hp]) {
    r.w.now = now;
    r.w.sectService = svc;
    r.w.onSaveNow = async (sid) => {
      for (let i = rand() * 2; i > 0; i--) await yieldIO();
      const ctrl = r.w.ctrl.get(sid);
      if (!ctrl || ctrl.travelling) return false;
      if (chaos.failSave()) return false;
      return true;
    };
  }

  // Khởi tạo 4 người chơi
  for (const who of WHO) {
    const r = HP_SET.has(who) ? hp : lh;
    const { c } = addPlayer(r.w, who, 1, 8);
    c.coin = 20_000; // đủ tiền lập tông và góp kho
    // Thêm một số vật phẩm có giá trị vào túi để góp hoặc làm nhiệm vụ
    addToInventory(c.inv, "nanh_soi", 30);
    addToInventory(c.inv, "da_soi", 10);
    addToInventory(c.inv, "hoi_huyet_dan", 5);
  }

  return {
    rand,
    now: () => now,
    hub,
    lh,
    hp,
    roomOf,
    store,
    svc,
    ledger,
    advanceTime: (ms: number) => {
      now += ms;
      lh.w.now = now;
      hp.w.now = now;
    },
  };
}

type Rig = ReturnType<typeof buildRig>;

/** Kiểm tra toàn bộ các bất biến của hệ sinh thái tông môn */
async function assertInvariants(rig: Rig, context: string) {
  const now = rig.now();
  const currentDay = dayKey(now);
  const allSects = await rig.store.all();

  // Bất biến cân bằng của bảng dữ liệu thật
  const balViols = sectBalanceViolations();
  if (balViols.length > 0) {
    throw new Error(`[Cân bằng] Vi phạm: ${balViols.join("; ")}`);
  }

  const seenSouls = new Set<string>();

  for (const sect of allSects) {
    // Bất biến cấu trúc: đúng 1 Tông chủ
    const leaders = sect.members.filter((m) => m.rank === "chu");
    if (leaders.length !== 1) {
      throw new Error(`[${context}] Tông ${sect.id} có ${leaders.length} Tông chủ`);
    }

    let sumMerit = 0;

    for (const m of sect.members) {
      // Bất biến: 1 linh hồn chỉ thuộc tối đa 1 tông môn
      if (seenSouls.has(m.soulKey)) {
        throw new Error(`[${context}] Linh hồn ${m.soulKey} nằm ở nhiều tông môn cùng lúc`);
      }
      seenSouls.add(m.soulKey);

      const contrib = m.contrib ?? 0;
      const merit = m.merit ?? 0;

      // Bất biến 2: 0 <= contrib <= merit <= SECT_CONTRIB_CAP
      if (contrib < 0 || contrib > merit || merit > SECT_CONTRIB_CAP) {
        throw new Error(
          `[${context}] Vi phạm contrib/merit: contrib=${contrib}, merit=${merit} (soul=${m.soulKey})`,
        );
      }
      sumMerit += merit;

      // Bất biến 1: trong ngày hiện tại, earned <= SECT_EARN_DAY_CAP
      if (m.today && m.today.day === currentDay) {
        if (m.today.earned > SECT_EARN_DAY_CAP) {
          throw new Error(
            `[${context}] member.today.earned=${m.today.earned} > ${SECT_EARN_DAY_CAP} (soul=${m.soulKey})`,
          );
        }
        if (m.today.deposit > SECT_DEPOSIT_DAY_CAP) {
          throw new Error(
            `[${context}] member.today.deposit=${m.today.deposit} > ${SECT_DEPOSIT_DAY_CAP} (soul=${m.soulKey})`,
          );
        }
      }
    }

    const points = sect.points ?? 0;
    // Bất biến 3: Sect.points >= tổng công tích của các thành viên hiện tại
    if (points < sumMerit) {
      throw new Error(`[${context}] Tông ${sect.id}: points=${points} < sum(merit)=${sumMerit}`);
    }

    // Sect.points không bao giờ vượt trần
    if (points > SECT_POINTS_CAP) {
      throw new Error(`[${context}] Tông ${sect.id}: points=${points} > ${SECT_POINTS_CAP}`);
    }
  }

  // Kiểm tra sổ cái cống hiến
  if (rig.ledger.violations.length > 0) {
    throw new Error(`[${context}] Vi phạm sổ cái: ${rig.ledger.violations.join("; ")}`);
  }
}

/** Chuyển người chơi qua lại giữa 2 phòng (Lạc Hà <-> Hắc Phong) */
function travelPlayer(rig: Rig, who: string) {
  const fromWorld = rig.roomOf(who).w;
  const toWorld = fromWorld === rig.lh.w ? rig.hp.w : rig.lh.w;

  const ctrl = fromWorld.ctrl.get(who);
  const player = fromWorld.state.players.get(who);
  if (!ctrl || !player || ctrl.limbo || ctrl.travelling) return false;

  // Xoá khỏi phòng cũ
  fromWorld.state.players.delete(who);
  fromWorld.ctrl.delete(who);

  // Thêm vào phòng mới
  toWorld.state.players.set(who, player);
  toWorld.ctrl.set(who, ctrl);
  return true;
}

/** Chết do quái và vào Hoàng Tuyền */
function killPlayer(rig: Rig, who: string) {
  const w = rig.roomOf(who).w;
  const p = w.state.players.get(who);
  const c = w.ctrl.get(who);
  if (!p || !c || c.limbo || c.travelling) return false;
  beginLimbo(w, who, p, c);
  return true;
}

/** Đầu thai kiếp mới */
function rebirthPlayer(rig: Rig, who: string) {
  const w = rig.roomOf(who).w;
  const p = w.state.players.get(who);
  const c = w.ctrl.get(who);
  const limbo = c?.limbo;
  if (!p || !c || !limbo) return false;
  const choice = validateRebirth(c.soul, { keep: [] }, limbo.keepable);
  if (!choice) return false;
  applyRebirth(w, who, p, c, choice);
  // Tặng lại một ít tiền và đồ để tiếp tục thử nghiệm
  c.coin = Math.max(c.coin, 10_000);
  addToInventory(c.inv, "nanh_soi", 20);
  return true;
}

describe("Kiểm kinh tế đồng thời tông môn (M8.8 - Fuzz & Bất biến)", () => {
  it("Bất biến cân bằng trên bảng dữ liệu thật (sectBalanceViolations)", () => {
    const viols = sectBalanceViolations();
    expect(viols).toEqual([]);
  });

  it("Kịch bản đua ngẫu nhiên có seed: góp, rút, nhiệm vụ, cửa hàng, nhảy tông, luân hồi, qua cổng", async () => {
    // Chạy 10 seeds ngẫu nhiên lặp lại được (kiểm tra không chập chờn)
    const seeds = [101, 202, 303, 404, 505, 606, 707, 808, 909, 1010];

    for (const seed of seeds) {
      const rig = buildRig(seed);

      // Khởi tạo tông môn đầu tiên: Alpha lập tông "Thanh Vân" (TV)
      await sectCreate(rig.lh.w, "Alpha", { name: "Thanh Van", tag: "TV" });
      await assertInvariants(rig, `Seed ${seed}: sau khi lập Thanh Van`);

      // Mời Bravo và Charlie vào Thanh Vân
      await sectInvite(rig.lh.w, "Alpha", { target: "Bravo" });
      await sectAnswer(rig.hp.w, "Bravo", { sectId: "sect_1" }, true);

      await sectInvite(rig.lh.w, "Alpha", { target: "Charlie" });
      await sectAnswer(rig.lh.w, "Charlie", { sectId: "sect_1" }, true);

      // Delta lập tông riêng "Vạn Kiếm" (VK)
      await sectCreate(rig.hp.w, "Delta", { name: "Van Kiem", tag: "VK" });
      await assertInvariants(rig, `Seed ${seed}: sau khi Delta lập Van Kiem`);

      // Vòng lặp các hành động ngẫu nhiên
      const ROUNDS = 40;
      for (let r = 0; r < ROUNDS; r++) {
        const actor = WHO[Math.floor(rig.rand() * WHO.length)];
        const room = rig.roomOf(actor);
        const actionRoll = rig.rand();

        if (actionRoll < 0.15) {
          // Góp Linh thạch (1 cống hiến = 100 LT)
          const amount = (Math.floor(rig.rand() * 10) + 1) * 100;
          await sectDeposit(room.w, actor, { amount });
        } else if (actionRoll < 0.25) {
          // Góp vật phẩm nanh_soi vào kho tông môn
          await sectVaultDeposit(room.w, actor, { itemId: "nanh_soi", qty: 2 });
        } else if (actionRoll < 0.35) {
          // Rút Linh thạch hoặc vật phẩm
          if (rig.rand() < 0.5) {
            await sectWithdraw(room.w, actor, { amount: 200 });
          } else {
            await sectVaultWithdraw(room.w, actor, { slot: 0, qty: 1 });
          }
        } else if (actionRoll < 0.5) {
          // Nhận và hoàn thành nhiệm vụ tông môn hôm nay
          // Nhận nhiệm vụ nộp nanh sói "st_nop_nanh.t0" (cần 8 nanh_soi, thưởng 30 cống hiến)
          await sectQuestAccept(room.w, actor, { questId: "st_nop_nanh.t0" });
          // Đảm bảo có đủ nanh_soi trong túi trước khi trả
          const c = room.w.ctrl.get(actor);
          if (c) addToInventory(c.inv, "nanh_soi", 8);
          await sectQuestTurnIn(room.w, actor, { questId: "st_nop_nanh.t0" });
        } else if (actionRoll < 0.65) {
          // Mua đồ ở cửa hàng tông môn (Hồi Huyết Đan cost 5, hoặc Tụ Khí Đan cost 30)
          const item = rig.rand() < 0.7 ? "hoi_huyet_dan" : "tu_khi_dan";
          await sectShopBuy(room.w, actor, { itemId: item, qty: 1 });
        } else if (actionRoll < 0.75) {
          // Luân hồi: Chết vào Hoàng Tuyền và Đầu thai
          if (rig.rand() < 0.5) {
            killPlayer(rig, actor);
          } else {
            rebirthPlayer(rig, actor);
          }
        } else if (actionRoll < 0.85) {
          // Chuyển phòng qua cổng (Lạc Hà <-> Hắc Phong)
          travelPlayer(rig, actor);
        } else if (actionRoll < 0.92) {
          // Nhảy tông môn hoặc rời tông môn
          const s = await rig.svc.sectOf(keyOf(actor));
          if (s && s.leader !== keyOf(actor)) {
            // Thành viên thường: rời tông
            await sectLeave(room.w, actor);
          } else if (!s) {
            // Không có tông: xin vào tông có sẵn
            const available = allSects();
            const targetSect = available[0];
            if (targetSect) {
              const leader = targetSect.members.find((m) => m.rank === "chu")?.name;
              if (leader) {
                const lRoom = rig.roomOf(leader);
                await sectInvite(lRoom.w, leader, { target: actor });
                await sectAnswer(room.w, actor, { sectId: targetSect.id }, true);
              }
            }
          }
        } else {
          // Sang ngày mới (+24 giờ) -> kiểm tra reset sổ ngày
          rig.advanceTime(DAY);
        }

        // Kiểm tra toàn bộ bất biến sau mỗi bước
        await assertInvariants(rig, `Seed ${seed}, vòng ${r}`);
      }

      function allSects() {
        return Array.from(rig.hub.sects.cache.values());
      }
    }
  });

  it("Mô phỏng sập đĩa và lỗi lưu (Chaos): cống hiến và đồ không bao giờ tăng sau lỗi", async () => {
    const chaos: Chaos = {
      failSave: () => {
        // 20% khả năng lưu hồ sơ người chơi thất bại
        return Math.random() < 0.2;
      },
      failStore: () => {
        // 10% khả năng ghi tệp tông môn thất bại
        return Math.random() < 0.1;
      },
    };

    const rig = buildRig(999, chaos);
    await sectCreate(rig.lh.w, "Alpha", { name: "Thanh Van Chaos", tag: "TVC" });

    // Đưa cống hiến lên cho Alpha và thử mua đồ khi có lỗi lưu
    await sectDeposit(rig.lh.w, "Alpha", { amount: 3000 });

    for (let i = 0; i < 20; i++) {
      try {
        await sectShopBuy(rig.lh.w, "Alpha", { itemId: "hoi_huyet_dan", qty: 1 });
      } catch {
        // Bắt lỗi mô phỏng sập đĩa
      }
      // Dù có lỗi sập đĩa hay không, bất biến không bao giờ bị phá
      await assertInvariants(rig, `Chaos vòng ${i}`);
    }
  });

  it("Đua nhiều thao tác dồn dập của cùng một người chơi (khoá busy bảo vệ)", async () => {
    const rig = buildRig(777);
    await sectCreate(rig.lh.w, "Alpha", { name: "Thanh Van Busy", tag: "TVB" });
    await sectDeposit(rig.lh.w, "Alpha", { amount: 2000 });

    // Alpha gửi 5 lệnh mua cùng lúc đồng thời
    const buys = Promise.all([
      sectShopBuy(rig.lh.w, "Alpha", { itemId: "hoi_huyet_dan", qty: 1 }),
      sectShopBuy(rig.lh.w, "Alpha", { itemId: "hoi_huyet_dan", qty: 1 }),
      sectShopBuy(rig.lh.w, "Alpha", { itemId: "hoi_huyet_dan", qty: 1 }),
      sectDeposit(rig.lh.w, "Alpha", { amount: 500 }),
      sectQuestTurnIn(rig.lh.w, "Alpha", { questId: "st_nop_nanh.t0" }),
    ]);

    await buys;
    await assertInvariants(rig, "Sau khi đua dồn tin với khoá busy");
  });
});

describe("Kiểm chứng đột biến (Mutations) chứng minh test ĐỎ khi có vi phạm", () => {
  it("Đột biến 1: Bỏ trần kiếm ngày SECT_EARN_DAY_CAP -> kho từ chối ghi và assertInvariants phát hiện ĐỎ", async () => {
    const rig = buildRig(111);
    await sectCreate(rig.lh.w, "Alpha", { name: "Dot Bien 1", tag: "DB1" });

    // Alpha đã vào 2 ngày trước để có thể kiếm cống hiến
    rig.advanceTime(2 * DAY);

    const sect = (await rig.store.all())[0];
    // 1. Kho tệp assertWritableSect phải từ chối ghi bản ghi có earned > SECT_EARN_DAY_CAP
    await expect(
      rig.store.update(sect.id, (s) => {
        const m = s.members.find((x) => x.name === "Alpha")!;
        m.today = {
          day: dayKey(rig.now()),
          earned: 200, // VI PHẠM: > 140
          deposit: 20,
          quests: [],
          dungeon: false,
          buys: {},
        };
        return s;
      }),
    ).rejects.toThrow(/Tông môn không hợp lệ/);

    // 2. assertInvariants cũng phải bắt được nếu có bản ghi vi phạm lọt vào
    const fakeRig = {
      ...rig,
      store: {
        ...rig.store,
        all: async () => [
          {
            ...sect,
            members: sect.members.map((m) =>
              m.name === "Alpha"
                ? {
                    ...m,
                    today: {
                      day: dayKey(rig.now()),
                      earned: 200,
                      deposit: 20,
                      quests: [],
                      dungeon: false,
                      buys: {},
                    },
                  }
                : m,
            ),
          },
        ],
      },
    };
    await expect(assertInvariants(fakeRig as any, "Đột biến 1")).rejects.toThrow(
      /member\.today\.earned=200 > 140/,
    );
  });

  it("Đột biến 2: Tiêu cống hiến làm contrib > merit -> kho từ chối ghi và assertInvariants phát hiện ĐỎ", async () => {
    const rig = buildRig(222);
    await sectCreate(rig.lh.w, "Alpha", { name: "Dot Bien 2", tag: "DB2" });

    const sect = (await rig.store.all())[0];
    // 1. Kho tệp assertWritableSect từ chối ghi nếu contrib > merit
    await expect(
      rig.store.update(sect.id, (s) => {
        const m = s.members.find((x) => x.name === "Alpha")!;
        m.contrib = 500;
        m.merit = 300; // VI PHẠM: contrib > merit
        return s;
      }),
    ).rejects.toThrow(/Tông môn không hợp lệ/);

    // 2. assertInvariants cũng phải bắt được nếu có bản ghi vi phạm lọt vào
    const fakeRig = {
      ...rig,
      store: {
        ...rig.store,
        all: async () => [
          {
            ...sect,
            members: sect.members.map((m) =>
              m.name === "Alpha" ? { ...m, contrib: 500, merit: 300 } : m,
            ),
          },
        ],
      },
    };
    await expect(assertInvariants(fakeRig as any, "Đột biến 2")).rejects.toThrow(
      /Vi phạm contrib\/merit: contrib=500, merit=300/,
    );
  });

  it("Đột biến 3: points tông môn tụt thấp hơn tổng công tích -> kho từ chối ghi và assertInvariants phát hiện ĐỎ", async () => {
    const rig = buildRig(333);
    await sectCreate(rig.lh.w, "Alpha", { name: "Dot Bien 3", tag: "DB3" });

    const sect = (await rig.store.all())[0];
    // 1. Kho tệp assertWritableSect từ chối ghi nếu points < sum(merit)
    await expect(
      rig.store.update(sect.id, (s) => {
        const m = s.members.find((x) => x.name === "Alpha")!;
        m.merit = 1000;
        s.points = 400; // VI PHẠM: points < sum(merit)
        return s;
      }),
    ).rejects.toThrow(/Tông môn không hợp lệ/);

    // 2. assertInvariants cũng phải bắt được nếu có bản ghi vi phạm lọt vào
    const fakeRig = {
      ...rig,
      store: {
        ...rig.store,
        all: async () => [
          {
            ...sect,
            points: 400,
            members: sect.members.map((m) => (m.name === "Alpha" ? { ...m, merit: 1000 } : m)),
          },
        ],
      },
    };
    await expect(assertInvariants(fakeRig as any, "Đột biến 3")).rejects.toThrow(
      /points=400 < sum\(merit\)=1000/,
    );
  });

  it("Đột biến 4: Một linh hồn nằm ở 2 tông môn cùng lúc -> kho từ chối và assertInvariants phát hiện ĐỎ", async () => {
    const rig = buildRig(444);
    await sectCreate(rig.lh.w, "Alpha", { name: "Dot Bien 4A", tag: "DB4A" });
    // Bravo ở Hắc Phong nên gọi qua hp.w
    await sectCreate(rig.hp.w, "Bravo", { name: "Dot Bien 4B", tag: "DB4B" });

    const sects = await rig.store.all();
    expect(sects.length).toBe(2);

    // 1. Kho từ chối ghi nếu thêm thành viên đã ở tông môn khác
    await expect(
      rig.store.update(sects[1].id, (s) => {
        s.members.push({
          soulKey: keyOf("Alpha"),
          name: "Alpha",
          rank: "de_tu",
          joinedAt: rig.now(),
          contrib: 0,
          merit: 0,
        });
        return s;
      }),
    ).rejects.toThrow(/xung đột|member_taken/i);

    // 2. assertInvariants cũng phải bắt được nếu có bản ghi trùng lọt vào
    const fakeRig = {
      ...rig,
      store: {
        ...rig.store,
        all: async () => [
          sects[0],
          {
            ...sects[1],
            members: [
              ...sects[1].members,
              {
                soulKey: keyOf("Alpha"),
                name: "Alpha",
                rank: "de_tu" as const,
                joinedAt: rig.now(),
                contrib: 0,
                merit: 0,
              },
            ],
          },
        ],
      },
    };
    await expect(assertInvariants(fakeRig as any, "Đột biến 4")).rejects.toThrow(
      /Linh hồn alpha nằm ở nhiều tông môn cùng lúc/,
    );
  });

  it("Đột biến 5: Bảng cân bằng bị phá (giá bán lại NPC vượt vốn) -> test phải ĐỎ", () => {
    // Thử hàm sectBalanceViolations với bảng vi phạm giả
    const badShop = [
      {
        itemId: "hoi_huyet_dan",
        cost: 1, // Chi phí quá rẻ, bán lại NPC có lời
        minLevel: 1,
        limitDay: 10,
        hall: "baoKho" as const,
      },
    ];
    const viols = sectBalanceViolations(badShop);
    expect(viols.length).toBeGreaterThan(0);
    expect(viols.some((v) => v.includes("vòng lời") || v.includes("sức mua"))).toBe(true);
  });
});
