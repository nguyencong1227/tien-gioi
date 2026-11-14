// Luân hồi (M3 bước 2, docs/THIET_KE_LUAN_HOI.md mục 4 và 6): chết thật -> Hoàng Tuyền -> đầu thai.
// File này là phần ĐỒNG BỘ, thuần trên `World`: tính Duyên, đặt lại nhân vật, dựng kiếp mới. Việc lưu file, cộng Duyên vào
// chân linh (I/O, bất đồng bộ, idempotent) và gửi tin do WorldRoom làm (`enterLimbo`, `rebirth`).
import {
  HISTORY_MAX,
  ITEM_BY_ID,
  addToInventory,
  calcDuyen,
  coinCarryCap,
  countsAsKiep,
  emptyEquipment,
  emptyInventory,
  emptySkillBook,
  originMult,
  stepOf,
  startPackOf,
  type RebirthChoice,
  type Soul,
} from "@tien-gioi/shared";
import type { Player } from "../schema";
import type { World, PlayerCtrl } from "../world";
import { newLifeId, type LimboRecord } from "../store";
import { applyStats } from "./progression";
import { equipmentOf, setEquipment } from "./equipment";
import { safeSpot, syncPublicPos } from "./movement";
import { sendInv } from "./inventory";
import { sendQuests } from "./quests";
import { rebirthSkills, sendSkills } from "./skills";
import { sendWallet } from "./wallet";

/** Trang bị có thể giữ lại qua kiếp: đang mặc + trong túi (mỗi món một phần tử; trang bị luôn có số lượng 1). */
export function keepableOf(p: Player, c: PlayerCtrl): string[] {
  const out: string[] = [];
  for (const id of Object.values(equipmentOf(p))) if (id) out.push(id);
  for (const s of c.inv)
    if (s && ITEM_BY_ID[s.itemId]?.type === "equip")
      for (let i = 0; i < s.qty; i++) out.push(s.itemId);
  return out;
}

/**
 * Chết thật: tính Duyên, chụp những thứ cần cho màn hình Hoàng Tuyền, rồi ĐẶT LẠI nhân vật về kiếp mới (Phàm Nhân, tu vi 0,
 * túi rỗng, không trang bị, nhiệm vụ trắng, 0 Linh thạch, `lifeId` mới, bộ đếm trắng): thoát game lúc này cũng không giữ lại được
 * gì của kiếp cũ. Người chơi nằm "chết" (cờ `dead` sẵn có: người khác thấy xác) cho tới khi đầu thai; không có đồng hồ hồi sinh.
 * Gọi một lần, từ `hurtPlayer`.
 */
export function beginLimbo(w: World, sid: string, p: Player, c: PlayerCtrl) {
  if (c.limbo) return;
  const life = {
    realm: p.realm,
    tier: p.tier,
    exp: p.exp,
    playMs: c.life.playMs,
    bossKills: c.life.bossKills,
  };
  const counts = countsAsKiep(life);
  c.limbo = {
    endedLifeId: c.lifeId,
    summary: {
      kiep: c.soul.kiep,
      realm: p.realm,
      tier: p.tier,
      minutes: Math.floor(c.life.playMs / 60_000),
      kills: c.life.kills,
      bossKills: c.life.bossKills,
      gain: calcDuyen(life),
    },
    keepable: keepableOf(p, c),
    coinAtDeath: c.coin,
    counts,
    credited: false,
  };
  // Nhật ký kiểm toán (M4 2.4): chết thật là sự kiện quan trọng của kinh tế (tiền / đồ về 0), ghi LÚC còn số liệu kiếp cũ
  w.audit?.("soul.limbo", {
    name: p.name,
    kiep: c.soul.kiep,
    realm: life.realm,
    tier: life.tier,
    coin: c.coin,
    counts,
    gain: c.limbo.summary.gain,
  });
  p.dead = true;
  p.meditating = false;
  c.deadAt = w.now;
  c.inputs.length = 0;
  for (const m of w.mctrl.values()) if (m.target === sid) m.target = null;
  // Đặt lại: kiếp cũ không còn gì
  p.realm = 0;
  p.tier = 0;
  p.exp = 0;
  setEquipment(p, emptyEquipment());
  c.inv = emptyInventory();
  c.quests = { active: [], done: [], daily: {} };
  c.skills = emptySkillBook(); // chiêu của kiếp cũ mất theo kiếp; chỉ chiêu đã KHẮC vào chân linh trở lại lúc đầu thai (`applyRebirth`)
  c.skillCd = [0, 0, 0, 0];
  c.coin = 0;
  c.lifeId = newLifeId();
  c.life = { playMs: 0, kills: 0, bossKills: 0 };
  c.origin = "pham_gia";
  c.mult = originMult("pham_gia");
  c.frac = { hp: 0, mp: 0, exp: 0, expAt: 0 };
  applyStats(p, true, c.mult);
  w.events.toast(sid, { text: "Ngươi đã chết. Linh hồn về Hoàng Tuyền...", tone: "bad" });
  w.onLimbo?.(sid);
}

/**
 * Cộng Duyên của kiếp vừa qua vào chân linh (thuần). **Idempotent theo `endedLifeId`**: đã cộng rồi thì trả nguyên chân linh,
 * nên chạy lại sau sập máy không bao giờ cộng hai lần. Kiếp không tính (quá ngắn / còn Phàm Nhân) không tăng bộ đếm kiếp
 * và không vào lịch sử.
 */
export function creditSoul(soul: Soul, limbo: LimboRecord, at: string): Soul {
  if (soul.lastCreditedLife === limbo.endedLifeId) return soul;
  const s = limbo.summary;
  const step = stepOf(s.realm, s.tier);
  return {
    ...soul,
    duyen: soul.duyen + s.gain,
    duyenTotal: soul.duyenTotal + s.gain,
    kiep: limbo.counts ? soul.kiep + 1 : soul.kiep,
    best: step > soul.best.step ? { step, realm: s.realm, tier: s.tier } : soul.best,
    lastCreditedLife: limbo.endedLifeId,
    history: limbo.counts
      ? [...soul.history, { kiep: s.kiep, step, minutes: s.minutes, gain: s.gain, at }].slice(
          -HISTORY_MAX,
        )
      : soul.history,
  };
}

/**
 * Đầu thai (đã qua `validateRebirth`): dựng kiếp mới trên nhân vật đã đặt lại. Túi = quà Lễ Mạnh Bà + trang bị giữ lại;
 * Linh thạch mang theo tối đa `coinCarryCap`; xuất thân đã chọn; hồi sinh ở trấn của bản đồ phòng này (WorldRoom đưa về Lạc Hà
 * nếu phòng này là bản đồ khác). Đồng bộ hoàn toàn: tin `rebirth` thứ hai thấy `c.limbo` đã xoá và bị bỏ qua.
 */
export function applyRebirth(
  w: World,
  sid: string,
  p: Player,
  c: PlayerCtrl,
  choice: RebirthChoice,
) {
  const limbo = c.limbo;
  if (!limbo) return;
  for (const it of startPackOf(c.soul.unlocks)) addToInventory(c.inv, it.itemId, it.qty);
  for (const id of choice.keep) addToInventory(c.inv, id, 1);
  c.coin = Math.min(limbo.coinAtDeath, coinCarryCap(c.soul.unlocks));
  c.skills = rebirthSkills(c.soul.engraved); // chiêu đã khắc vào chân linh (tầng 1, ô trống: tự gắn lại)
  c.skillCd = [0, 0, 0, 0];
  w.audit?.("soul.rebirth", {
    name: p.name,
    kiep: c.soul.kiep,
    origin: choice.origin,
    coin: c.coin,
    coinAtDeath: limbo.coinAtDeath,
    kept: choice.keep.length,
  });
  c.origin = choice.origin;
  c.mult = originMult(choice.origin);
  c.limbo = undefined;
  const spot = safeSpot(w.map);
  p.x = spot.x;
  p.y = spot.y;
  syncPublicPos(p); // dịch chuyển tức thời: người khác thấy ngay
  p.dead = false;
  p.meditating = false;
  applyStats(p, true, c.mult);
  sendInv(w, sid);
  sendQuests(w, sid);
  sendSkills(w, sid);
  sendWallet(w, sid);
  w.events.reborn(sid, { kiep: c.soul.kiep });
  w.events.sys(`${p.name} luân hồi, bước vào kiếp thứ ${c.soul.kiep}.`);
}
