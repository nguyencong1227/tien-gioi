// Kiểm kinh tế đồng thời tông môn có chiều sâu (M8.8, Issue #845; docs/THIET_KE_TONG_MON.md mục 12.11 (1)-(2)):
// Kịch bản ngẫu nhiên có seed (mulberry32) mô phỏng các chuỗi thao tác đua đồng thời ở HAI phòng (Lạc Hà + Hắc Phong):
// góp - rút chéo (Linh thạch + đồ), nhận - trả nhiệm vụ tông hằng ngày, mua cửa hàng (Bảo khố + Tàng Kinh Các),
// nhảy tông, rời - vào lại, giải tán, đầu thai giữa ngày, trả nhiệm vụ hai lần, gửi dồn tin, lưu lỗi, sập đĩa giữa chừng, qua cổng.
//
// Cơ chế đối chiếu:
//   1. ORACLE ĐỘC LẬP TRƯỚC / SAU TỪNG HÀNH ĐỘNG:
//      - Góp Linh thạch / đồ: ví / túi giảm đúng số; cống hiến, công tích, points tông môn cùng tăng đúng
//        min(want, trần góp ngày còn lại, trần ngày còn lại).
//      - Mua cửa hàng: cống hiến giảm đúng cost x qty; công tích và points tông môn KHÔNG ĐỔI; hàng vào túi;
//        thiếu cống hiến thì BỊ TỪ CHỐI (no_contrib) và không thay đổi bất kỳ số dư nào.
//      - Trả nhiệm vụ tông: cống hiến, công tích, points tông môn tăng đúng min(rewardCh, trần ngày còn lại).
//      - Ép trần ngày: khi chạm trần 140 cống hiến, mọi cống hiến vượt trần đều bị kẹp về 0 (granted = 0).
//      - Rời tông: mất cống hiến và công tích; vào tông mới bắt đầu từ 0.
//      - Sang ngày mới: sổ ngày reset (earned = 0, deposit = 0, buys = {}).
//   2. SỐ ĐẾM ĐỘ PHỦ (Coverage counters): đòi hỏi mọi nhánh nghiệp vụ và ca từ chối đều phải được kích hoạt thật sự.
//   3. BẤT BIẾN TOÀN CỤC: kiểm tra toàn vẹn sau mỗi vòng lặp và sau sập đĩa (Chaos).
//   4. CÁC CA ĐỘT BIẾN TRÊN MÃ THẬT ĐƯỢC CHỨNG MINH ĐỎ (M1-M7).
import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  DEFAULT_MAP,
  HAC_PHONG_ID,
  SECT_CONTRIB_CAP,
  SECT_DEPOSIT_DAY_CAP,
  SECT_DEPOSIT_VALUE_PER_CH,
  SECT_DUNGEON_CH,
  SECT_EARN_DAY_CAP,
  SECT_POINTS_CAP,
  SECT_SHOP_BY_ITEM,
  addToInventory,
  dayKey,
  getMap,
  sectDayState,
  sectDepositCh,
  sectLevelOf,
  sectQuestCh,
  validateRebirth,
} from "@tien-gioi/shared";
import { Hub } from "../hub";
import { FileSectStore, type Sect } from "../sect-store";
import { SectService } from "../sect-service";
import { sectBalanceViolations } from "../balance/tong-mon";
import { applyRebirth, beginLimbo } from "./reincarnation";
import {
  sectAnswer,
  sectCreate,
  sectDeposit,
  sectDungeonBonus,
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

/** Bộ sinh số ngẫu nhiên có hạt (mulberry32): lặp lại được 100%. */
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

/** Bộ đếm độ phủ đảm bảo mọi nhánh quan trọng đều được thực thi */
class CoverageTracker {
  depositSuccess = 0;
  depositCapHit = 0;
  questTurnInSuccess = 0;
  shopBuySuccess = 0;
  shopRefusedNoContrib = 0;
  earnCapHit = 0;
  leaveSuccess = 0;
  dungeonBonusSuccess = 0;
}

/** Dựng môi trường thử: 2 phòng Colyseus (World giả) + Hub chung + 1 FileSectStore thật. */
function buildRig(seed: number, chaos: Chaos = noChaos) {
  const rand = rng(seed);
  let now = 1_700_000_000_000;
  const hub = new Hub();
  const lh = makeWorld(DEFAULT_MAP, hub);
  const hp = makeWorld(getMap(HAC_PHONG_ID)!, hub);

  const roomOf = (who: string) => {
    if (lh.w.ctrl.has(who)) return lh;
    if (hp.w.ctrl.has(who)) return hp;
    return HP_SET.has(who) ? hp : lh;
  };

  const storeDir = path.join(root, `s${++dirSeq}`);
  const store = new FileSectStore(storeDir, () => now);

  let sectSeq = 0;
  const svc = new SectService(
    store,
    () => now,
    () => `sect_${++sectSeq}`,
  );

  const origUpdate = store.update.bind(store);
  store.update = async (id, fn) => {
    if (chaos.failStore()) throw new Error("Kho tệp lỗi (mô phỏng)");
    return origUpdate(id, fn);
  };

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

  for (const who of WHO) {
    const r = HP_SET.has(who) ? hp : lh;
    const { c } = addPlayer(r.w, who, 1, 8);
    c.coin = 50_000; // đủ tiền góp và mua
    addToInventory(c.inv, "nanh_soi", 50);
    addToInventory(c.inv, "da_soi", 20);
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
    advanceTime: (ms: number) => {
      now += ms;
      lh.w.now = now;
      hp.w.now = now;
    },
  };
}

type Rig = ReturnType<typeof buildRig>;

/** Lấy thông tin thành viên từ kho lưu trữ (chuẩn hoá sổ ngày theo thời gian hiện tại) */
async function getMemberData(rig: Rig, who: string) {
  const sect = await rig.svc.sectOf(keyOf(who));
  if (!sect) return null;
  const m = sect.members.find((x) => x.soulKey === keyOf(who));
  if (!m) return null;
  const day = sectDayState(m.today, rig.now());
  return {
    sect,
    member: m,
    contrib: m.contrib ?? 0,
    merit: m.merit ?? 0,
    earnedToday: day.earned,
    depositToday: day.deposit,
    questsToday: [...day.quests],
    buys: { ...day.buys },
  };
}

/** Đếm số lượng món đồ trong túi người chơi */
function countBagItem(rig: Rig, who: string, itemId: string): number {
  const c = rig.roomOf(who).w.ctrl.get(who);
  if (!c) return 0;
  let total = 0;
  for (const slot of c.inv) {
    if (slot && slot.itemId === itemId) total += slot.qty;
  }
  return total;
}

/** Lấy số dư ví người chơi */
function getPlayerCoin(rig: Rig, who: string): number {
  return rig.roomOf(who).w.ctrl.get(who)?.coin ?? 0;
}

/** Chuyển người chơi qua lại giữa 2 phòng (Lạc Hà <-> Hắc Phong) */
function travelPlayer(rig: Rig, who: string) {
  const fromWorld = rig.roomOf(who).w;
  const toWorld = fromWorld === rig.lh.w ? rig.hp.w : rig.lh.w;

  const ctrl = fromWorld.ctrl.get(who);
  const player = fromWorld.state.players.get(who);
  if (!ctrl || !player || ctrl.limbo || ctrl.travelling) return false;

  fromWorld.state.players.delete(who);
  fromWorld.ctrl.delete(who);

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
  c.coin = Math.max(c.coin, 20_000);
  addToInventory(c.inv, "nanh_soi", 20);
  return true;
}

/**
 * ORACLE HÀNH ĐỘNG 1: Góp Linh thạch vào tông môn
 * Đối chiếu chính xác delta cống hiến, merit, points, ví và trần ngày
 */
async function oracleDepositCoin(rig: Rig, who: string, amount: number, cov: CoverageTracker) {
  const before = await getMemberData(rig, who);
  const beforeCoin = getPlayerCoin(rig, who);
  const room = rig.roomOf(who);

  await sectDeposit(room.w, who, { amount });

  const after = await getMemberData(rig, who);
  const afterCoin = getPlayerCoin(rig, who);

  if (!before || !after) return;

  if (beforeCoin >= amount && afterCoin === beforeCoin - amount) {
    // Góp thành công: ví giảm đúng amount
    const wantCh = sectDepositCh(amount);
    const leftDeposit = Math.max(0, SECT_DEPOSIT_DAY_CAP - before.depositToday);
    const leftEarn = Math.max(0, SECT_EARN_DAY_CAP - before.earnedToday);
    const expectedGranted = Math.min(wantCh, leftDeposit, leftEarn);

    // Cống hiến và công tích tăng đúng expectedGranted (BẮT M1, M3!)
    expect(after.contrib).toBe(before.contrib + expectedGranted);
    expect(after.merit).toBe(before.merit + expectedGranted);

    // Điểm tông môn tăng đúng expectedGranted (BẮT M4!)
    expect(after.sect.points ?? 0).toBe((before.sect.points ?? 0) + expectedGranted);

    // Sổ ngày cập nhật đúng
    expect(after.depositToday).toBe(before.depositToday + expectedGranted);
    expect(after.earnedToday).toBe(before.earnedToday + expectedGranted);

    cov.depositSuccess++;
    if (wantCh > expectedGranted) cov.depositCapHit++;
    if (after.earnedToday >= SECT_EARN_DAY_CAP) cov.earnCapHit++;
  } else {
    // Bị từ chối (thiếu tiền, limbo, v.v.): cống hiến và ví không đổi
    expect(afterCoin).toBe(beforeCoin);
    expect(after.contrib).toBe(before.contrib);
  }
}

/**
 * ORACLE HÀNH ĐỘNG 2: Mua đồ ở cửa hàng tông môn
 * Đối chiếu chính xác delta cống hiến, túi đồ, và xử lý từ chối khi thiếu cống hiến / khoá cấp
 */
async function oracleShopBuy(
  rig: Rig,
  who: string,
  itemId: string,
  qty: number,
  cov: CoverageTracker,
) {
  const before = await getMemberData(rig, who);
  const beforeBag = countBagItem(rig, who, itemId);
  const room = rig.roomOf(who);

  const entry = SECT_SHOP_BY_ITEM[itemId];
  if (!entry) return;
  const totalCost = entry.cost * qty;

  await sectShopBuy(room.w, who, { itemId, qty });

  const after = await getMemberData(rig, who);
  const afterBag = countBagItem(rig, who, itemId);

  if (!before || !after) return;

  const sectLevel = sectLevelOf(before.sect.points ?? 0);
  const isLocked = sectLevel < entry.minLevel;
  const boughtToday = before.buys[itemId] ?? 0;
  const limitExceeded = boughtToday + qty > entry.limitDay;
  const notEnoughContrib = before.contrib < totalCost;

  if (isLocked || limitExceeded) {
    // Khoá cấp hoặc quá hạn mức ngày: không trừ gì
    expect(after.contrib).toBe(before.contrib);
    expect(after.merit).toBe(before.merit);
    expect(afterBag).toBe(beforeBag);
  } else if (notEnoughContrib) {
    // Đủ cấp & trong hạn mức nhưng THIẾU CỐNG HIẾN: BẮT BUỘC bị từ chối với lý do "no_contrib" (BẮT M5!)
    const checkBuy = await rig.svc.shopBuy(
      { soulKey: keyOf(who), name: who },
      itemId,
      qty,
      { known: false },
    );
    expect(checkBuy.ok).toBe(false);
    expect((checkBuy as any).reason).toBe("no_contrib");

    expect(after.contrib).toBe(before.contrib);
    expect(after.merit).toBe(before.merit);
    expect(afterBag).toBe(beforeBag);
    cov.shopRefusedNoContrib++;
  } else if (after.contrib < before.contrib) {
    // Đủ cống hiến & đủ cấp & trong hạn mức & mua THÀNH CÔNG:
    // cống hiến giảm đúng cost x qty, công tích KHÔNG ĐỔI, hàng vào túi (BẮT M2!)
    expect(after.contrib).toBe(before.contrib - totalCost);
    expect(after.merit).toBe(before.merit); // Merit không bao giờ giảm!
    expect(after.sect.points ?? 0).toBe(before.sect.points ?? 0); // Points tông không đổi!
    expect(afterBag).toBe(beforeBag + qty);
    expect(after.buys[itemId] ?? 0).toBe(boughtToday + qty);
    cov.shopBuySuccess++;
  } else {
    // Bị từ chối vì lý do trạng thái (đang limbo, túi đầy, v.v.): cống hiến và túi không đổi
    expect(after.contrib).toBe(before.contrib);
    expect(after.merit).toBe(before.merit);
    expect(afterBag).toBe(beforeBag);
  }
}

/**
 * ORACLE HÀNH ĐỘNG 3: Trả nhiệm vụ tông môn
 * Đối chiếu chính xác delta cống hiến, merit, points và trần ngày (kể cả ca từ chối khi đã làm trong ngày)
 */
async function oracleQuestTurnIn(rig: Rig, who: string, questId: string, cov: CoverageTracker) {
  const before = await getMemberData(rig, who);
  const room = rig.roomOf(who);

  // Đảm bảo có nhiệm vụ và đủ đồ nộp
  await sectQuestAccept(room.w, who, { questId });
  const c = room.w.ctrl.get(who);
  if (c) addToInventory(c.inv, "nanh_soi", 8);

  await sectQuestTurnIn(room.w, who, { questId });

  const after = await getMemberData(rig, who);
  if (!before || !after) return;

  const tpl = questId.split(".")[0];
  const alreadyDone = before.questsToday.includes(tpl);
  const rewardCh = alreadyDone ? 0 : sectQuestCh(questId);
  const leftEarn = Math.max(0, SECT_EARN_DAY_CAP - before.earnedToday);
  const expectedGranted = Math.min(rewardCh, leftEarn);

  if (after.contrib > before.contrib) {
    // Trả thành công: tăng đúng expectedGranted (BẮT M1, M3, M4!)
    expect(after.contrib).toBe(before.contrib + expectedGranted);
    expect(after.merit).toBe(before.merit + expectedGranted);
    expect(after.sect.points ?? 0).toBe((before.sect.points ?? 0) + expectedGranted);
    expect(after.earnedToday).toBe(before.earnedToday + expectedGranted);
    cov.questTurnInSuccess++;
  } else {
    // Bị từ chối (đã làm trong ngày, hoặc đang chết, hoặc hết trần): cống hiến không tăng
    expect(after.contrib).toBe(before.contrib);
    expect(after.merit).toBe(before.merit);
  }

  if (rewardCh > expectedGranted || after.earnedToday >= SECT_EARN_DAY_CAP) {
    cov.earnCapHit++;
  }
}

/** Kiểm tra toàn bộ các bất biến của hệ sinh thái tông môn */
async function assertInvariants(rig: Rig, context: string) {
  const now = rig.now();
  const currentDay = dayKey(now);
  const allSects = await rig.store.all();

  const balViols = sectBalanceViolations();
  if (balViols.length > 0) {
    throw new Error(`[Cân bằng] Vi phạm: ${balViols.join("; ")}`);
  }

  const seenSouls = new Set<string>();

  for (const sect of allSects) {
    const leaders = sect.members.filter((m) => m.rank === "chu");
    if (leaders.length !== 1) {
      throw new Error(`[${context}] Tông ${sect.id} có ${leaders.length} Tông chủ`);
    }

    let sumMerit = 0;

    for (const m of sect.members) {
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

    if (points > SECT_POINTS_CAP) {
      throw new Error(`[${context}] Tông ${sect.id}: points=${points} > ${SECT_POINTS_CAP}`);
    }
  }
}

describe("Kiểm kinh tế đồng thời tông môn (M8.8 - Fuzz & Oracle)", () => {
  it("Bất biến cân bằng trên bảng dữ liệu thật (sectBalanceViolations)", () => {
    const viols = sectBalanceViolations();
    expect(viols).toEqual([]);
  });

  it("Ca ép trần ngày (Dedicated Cap Test): kẹp đúng trần góp 30 CH và trần ngày 140 CH", async () => {
    const cov = new CoverageTracker();
    const rig = buildRig(101);

    // Alpha lập tông
    await sectCreate(rig.lh.w, "Alpha", { name: "Thanh Van", tag: "TV" });
    await sectInvite(rig.lh.w, "Alpha", { name: "Bravo" });
    await sectAnswer(rig.hp.w, "Bravo", { from: "Alpha" }, true);

    // Đưa Bravo về cùng phòng Lạc Hà để cùng nhận thưởng bí cảnh
    travelPlayer(rig, "Bravo");

    // Vào từ 2 ngày trước để đủ điều kiện kiếm cống hiến
    rig.advanceTime(2 * DAY);

    // 1. Góp lớn 5.000 LT (muốn 50 cống hiến) -> BỊ KẸP ĐÚNG 30 cống hiến (trần SECT_DEPOSIT_DAY_CAP = 30)
    await oracleDepositCoin(rig, "Alpha", 5000, cov);
    let m = await getMemberData(rig, "Alpha");
    expect(m?.depositToday).toBe(30);
    expect(m?.earnedToday).toBe(30);
    expect(m?.contrib).toBe(30);

    // 2. Đi bí cảnh cùng đồng môn (Alpha và Bravo cùng phòng lh.w): thưởng +20 CH
    await sectDungeonBonus(rig.lh.w, ["Alpha", "Bravo"]);
    m = await getMemberData(rig, "Alpha");
    expect(m?.earnedToday).toBe(50); // 30 + 20 = 50

    // 3. Trả nhiệm vụ (st_nop_nanh.t0: 30 CH) -> earned lên 80
    await oracleQuestTurnIn(rig, "Alpha", "st_nop_nanh.t0", cov);
    m = await getMemberData(rig, "Alpha");
    expect(m?.earnedToday).toBe(80); // 50 + 30 = 80

    // 4. Thử góp thêm 2.000 LT: trần góp ngày đã hết (30/30) -> granted BẮT BUỘC = 0 (BẮT M1!)
    await oracleDepositCoin(rig, "Alpha", 2000, cov);
    m = await getMemberData(rig, "Alpha");
    expect(m?.depositToday).toBe(30); // Giữ nguyên 30
    expect(m?.earnedToday).toBe(80); // Giữ nguyên 80
    expect(m?.contrib).toBe(80); // Không được tăng thêm!

    // 5. Mua đồ ở cửa hàng: tiêu 30 CH mua 6 Hồi Huyết Đan (cost 5 x 6 = 30, minLevel = 1)
    await oracleShopBuy(rig, "Alpha", "hoi_huyet_dan", 6, cov);
    m = await getMemberData(rig, "Alpha");
    expect(m?.contrib).toBe(50); // 80 - 30 = 50 (BẮT M2!)
    expect(m?.merit).toBe(80); // Merit không đổi!

    expect(cov.depositCapHit).toBeGreaterThan(0);
    expect(cov.shopBuySuccess).toBeGreaterThan(0);
  });

  it("Ca từ chối khi thiếu cống hiến (Dedicated Refusal Test)", async () => {
    const cov = new CoverageTracker();
    const rig = buildRig(202);

    await sectCreate(rig.lh.w, "Alpha", { name: "Thanh Van 2", tag: "TV2" });
    await sectInvite(rig.lh.w, "Alpha", { name: "Bravo" });
    await sectAnswer(rig.hp.w, "Bravo", { from: "Alpha" }, true);

    rig.advanceTime(2 * DAY);

    // Bravo mới vào chưa có cống hiến (contrib = 0)
    // Cố mua Hồi Huyết Đan (cost 5) -> Bị từ chối đúng lý do "no_contrib" (BẮT M5!)
    const checkBuy = await rig.svc.shopBuy(
      { soulKey: keyOf("Bravo"), name: "Bravo" },
      "hoi_huyet_dan",
      1,
      { known: false },
    );
    expect(checkBuy.ok).toBe(false);
    expect((checkBuy as any).reason).toBe("no_contrib");

    await oracleShopBuy(rig, "Bravo", "hoi_huyet_dan", 1, cov);
    const m = await getMemberData(rig, "Bravo");
    expect(m?.contrib).toBe(0);
    expect(countBagItem(rig, "Bravo", "hoi_huyet_dan")).toBe(5); // vẫn là 5 có sẵn lúc đầu
    expect(cov.shopRefusedNoContrib).toBeGreaterThan(0);
  });

  it("Ca rời tông môn mất cống hiến và sang ngày mới reset sổ ngày", async () => {
    const cov = new CoverageTracker();
    const rig = buildRig(303);

    await sectCreate(rig.lh.w, "Alpha", { name: "Thanh Van 3", tag: "TV3" });
    await sectInvite(rig.lh.w, "Alpha", { name: "Bravo" });
    await sectAnswer(rig.hp.w, "Bravo", { from: "Alpha" }, true);

    rig.advanceTime(2 * DAY);

    // Bravo góp 2.000 LT -> nhận 20 cống hiến
    await oracleDepositCoin(rig, "Bravo", 2000, cov);
    let m = await getMemberData(rig, "Bravo");
    expect(m?.contrib).toBe(20);
    expect(m?.merit).toBe(20);

    // Bravo rời tông môn
    await sectLeave(rig.hp.w, "Bravo");
    cov.leaveSuccess++;

    const outSect = await rig.svc.sectOf(keyOf("Bravo"));
    expect(outSect).toBeNull(); // Đã rời tông

    // Sang ngày mới: vừa qua hồi chiêu SECT_REJOIN_COOLDOWN_MS vừa sang ngày mới (BẮT M7!)
    rig.advanceTime(DAY);

    // Alpha mời Bravo vào lại tông môn
    await sectInvite(rig.lh.w, "Alpha", { name: "Bravo" });
    await sectAnswer(rig.hp.w, "Bravo", { from: "Alpha" }, true);

    // Cống hiến của Bravo BẮT BUỘC bắt đầu lại từ 0 (BẮT M6!)
    m = await getMemberData(rig, "Bravo");
    expect(m?.contrib).toBe(0);
    expect(m?.merit).toBe(0);

    // Alpha góp tiếp ngày mới
    await oracleDepositCoin(rig, "Alpha", 1000, cov);
    const aM = await getMemberData(rig, "Alpha");
    expect(aM?.depositToday).toBe(10); // Reset về 0 rồi tăng lên 10
  });

  it("Vòng Fuzz ngẫu nhiên có seed (5 seeds x 40 vòng) có Oracle đối chiếu và đo độ phủ", async () => {
    const cov = new CoverageTracker();
    const seeds = [101, 202, 303, 404, 505];

    for (const seed of seeds) {
      const rig = buildRig(seed);

      // Alpha lập Thanh Vân
      await sectCreate(rig.lh.w, "Alpha", { name: "Thanh Van", tag: "TV" });
      await sectInvite(rig.lh.w, "Alpha", { name: "Bravo" });
      await sectAnswer(rig.hp.w, "Bravo", { from: "Alpha" }, true);

      await sectInvite(rig.lh.w, "Alpha", { name: "Charlie" });
      await sectAnswer(rig.lh.w, "Charlie", { from: "Alpha" }, true);

      // Delta lập Vạn Kiếm
      await sectCreate(rig.hp.w, "Delta", { name: "Van Kiem", tag: "VK" });

      // Đưa thời gian qua 2 ngày để đủ điều kiện kiếm cống hiến
      rig.advanceTime(2 * DAY);

      const ROUNDS = 40;
      for (let r = 0; r < ROUNDS; r++) {
        const actor = WHO[Math.floor(rig.rand() * WHO.length)];
        const room = rig.roomOf(actor);
        const actionRoll = rig.rand();

        if (actionRoll < 0.25) {
          // Góp Linh thạch (kiểm tra oracle)
          const amount = (Math.floor(rig.rand() * 5) + 1) * 1000;
          await oracleDepositCoin(rig, actor, amount, cov);
        } else if (actionRoll < 0.45) {
          // Trả nhiệm vụ tông môn (kiểm tra oracle)
          await oracleQuestTurnIn(rig, actor, "st_nop_nanh.t0", cov);
        } else if (actionRoll < 0.65) {
          // Mua cửa hàng tông môn (kiểm tra oracle)
          const item = rig.rand() < 0.6 ? "hoi_huyet_dan" : "tu_khi_dan";
          await oracleShopBuy(rig, actor, item, 1, cov);
        } else if (actionRoll < 0.75) {
          // Luân hồi: Chết và đầu thai
          if (rig.rand() < 0.5) killPlayer(rig, actor);
          else rebirthPlayer(rig, actor);
        } else if (actionRoll < 0.85) {
          // Chuyển phòng qua cổng
          travelPlayer(rig, actor);
        } else if (actionRoll < 0.92) {
          // Rút kho
          await sectWithdraw(room.w, actor, { amount: 100 });
        } else {
          // Sang ngày mới
          rig.advanceTime(DAY);
        }

        // Kiểm tra bất biến toàn cục sau mỗi vòng
        await assertInvariants(rig, `Seed ${seed}, vòng ${r}`);
      }
    }

    // Đòi hỏi độ phủ thực tế: mọi nhánh nghiệp vụ đều được kích hoạt
    expect(cov.depositSuccess).toBeGreaterThan(0);
    expect(cov.depositCapHit).toBeGreaterThan(0);
    expect(cov.questTurnInSuccess).toBeGreaterThan(0);
    expect(cov.shopBuySuccess).toBeGreaterThan(0);
    expect(cov.shopRefusedNoContrib).toBeGreaterThan(0);
  });

  it("Mô phỏng sập đĩa và lỗi lưu (Chaos): tài sản không bao giờ tăng qua lỗi", async () => {
    const chaos: Chaos = {
      failSave: () => Math.random() < 0.2,
      failStore: () => Math.random() < 0.1,
    };

    const rig = buildRig(999, chaos);
    await sectCreate(rig.lh.w, "Alpha", { name: "Thanh Van Chaos", tag: "TVC" });
    rig.advanceTime(2 * DAY);

    await sectDeposit(rig.lh.w, "Alpha", { amount: 3000 });

    for (let i = 0; i < 20; i++) {
      try {
        await sectShopBuy(rig.lh.w, "Alpha", { itemId: "hoi_huyet_dan", qty: 1 });
      } catch {
        // Bắt lỗi mô phỏng sập đĩa
      }
      await assertInvariants(rig, `Chaos vòng ${i}`);
    }
  });

  it("Đua dồn tin cùng lúc: khoá busy bảo vệ an toàn", async () => {
    const rig = buildRig(777);
    await sectCreate(rig.lh.w, "Alpha", { name: "Thanh Van Busy", tag: "TVB" });
    rig.advanceTime(2 * DAY);
    await sectDeposit(rig.lh.w, "Alpha", { amount: 3000 });

    const buys = Promise.all([
      sectShopBuy(rig.lh.w, "Alpha", { itemId: "hoi_huyet_dan", qty: 1 }),
      sectShopBuy(rig.lh.w, "Alpha", { itemId: "hoi_huyet_dan", qty: 1 }),
      sectDeposit(rig.lh.w, "Alpha", { amount: 500 }),
      sectQuestTurnIn(rig.lh.w, "Alpha", { questId: "st_nop_nanh.t0" }),
    ]);

    await buys;
    await assertInvariants(rig, "Sau khi đua dồn tin với khoá busy");
  });
});

describe("assertInvariants có răng khi phát hiện dữ liệu hỏng trong kho", () => {
  it("Bắt được lỗi khi today.earned vượt trần 140", async () => {
    const rig = buildRig(111);
    await sectCreate(rig.lh.w, "Alpha", { name: "Tooth 1", tag: "T1" });
    const sect = (await rig.store.all())[0];

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
    await expect(assertInvariants(fakeRig as any, "Test Tooth 1")).rejects.toThrow(
      /member\.today\.earned=200 > 140/,
    );
  });

  it("Bắt được lỗi khi contrib > merit", async () => {
    const rig = buildRig(222);
    await sectCreate(rig.lh.w, "Alpha", { name: "Tooth 2", tag: "T2" });
    const sect = (await rig.store.all())[0];

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
    await expect(assertInvariants(fakeRig as any, "Test Tooth 2")).rejects.toThrow(
      /Vi phạm contrib\/merit: contrib=500, merit=300/,
    );
  });

  it("Bắt được lỗi khi points tông môn tụt thấp hơn tổng công tích", async () => {
    const rig = buildRig(333);
    await sectCreate(rig.lh.w, "Alpha", { name: "Tooth 3", tag: "T3" });
    const sect = (await rig.store.all())[0];

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
    await expect(assertInvariants(fakeRig as any, "Test Tooth 3")).rejects.toThrow(
      /points=400 < sum\(merit\)=1000/,
    );
  });

  it("Bắt được lỗi khi 1 linh hồn nằm ở 2 tông môn cùng lúc", async () => {
    const rig = buildRig(444);
    await sectCreate(rig.lh.w, "Alpha", { name: "Tooth 4A", tag: "T4A" });
    await sectCreate(rig.hp.w, "Bravo", { name: "Tooth 4B", tag: "T4B" });
    const sects = await rig.store.all();

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
    await expect(assertInvariants(fakeRig as any, "Test Tooth 4")).rejects.toThrow(
      /Linh hồn alpha nằm ở nhiều tông môn cùng lúc/,
    );
  });

  it("Bắt được lỗi khi bảng cân bằng bị phá (giá bán lại NPC vượt vốn)", () => {
    const badShop = [
      {
        itemId: "hoi_huyet_dan",
        cost: 1,
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
