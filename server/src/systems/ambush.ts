// GẶP CHẶN ĐƯỜNG khi di chuyển (QUYET_DINH_M3 mục 52, docs/THIET_KE_CHAN_DUONG.md mục 4 + 6.1 + 6.2, issue CD2 #1062): KÍCH HOẠT + HỘP THOẠI phía server.
// Đấu trường solo (khi người chơi chọn Chiến), thưởng, về chỗ cũ là CD3 (#1063): ở đây `fight` gọi móc `AmbushRuntime.startFight`, chưa có móc thì huỷ lặng lẽ (không phạt).
//
// Luật (server quyết định; client chỉ gửi `ambushSeen` / `ambushChoose`):
//  - QUÃNG ĐI THẬT: cộng từ dịch chuyển THẬT sau `moveWithCollision` (`trackAmbushWalk` gọi sau `applyInputs`), chỉ ở vùng hoang (ngoài `inSafe`), không tính dịch chuyển tức thời
//    (vào phòng, hồi sinh, qua cổng: bước nhảy > `AMBUSH_TELEPORT_PX`). Cứ `AMBUSH_STRIDE_PX` thì tung MỘT lần với xác suất `ambushRollP(danger)`; lần tung không đạt điều kiện
//    thì BỎ (không để dành).
//  - `ambushBlocked`: MỘT hàm, từng nhánh có tên (mục 4.2) + hồi + trần ngày. Chạy CHỈ lúc tung trúng (hiếm) nên được phép đắt hơn đường nóng.
//  - HỘP THOẠI: giá CHỐT lúc dựng (`AmbushOfferCtrl.price`), `ambushChoose` trừ ĐÚNG số đó (client không gửi số nào). Trong lúc chờ nhân vật đứng yên (input vẫn được tiêu thụ),
//    quái bỏ mục tiêu, bất khả xâm phạm (`w.shielded`). Hồn lìa xác thì ĐÓNG BĂNG đồng hồ (hộp thoại và hạn `ambushSeen`).
//  - Hết giờ = Chiến; không `ambushSeen` trong `AMBUSH_SEEN_MS` = HUỶ lặng lẽ (không phạt, vẫn vào hồi); lựa chọn đến sớm hơn `AMBUSH_ARM_MS` bị bỏ qua.
//  - BỎ CHẠY: trừ (ví hoặc tu vi) -> LƯU hồ sơ -> mới đóng; lưu hỏng thì giữ hộp thoại, lần thử lại chỉ LƯU (không trừ hai lần). Chỉ được MẤT, không bao giờ tăng.
//  - Tung xúc xắc dùng `AmbushRuntime.random` tiêm vào: KHÔNG `Math.random` trong luồng tick (bench có hạt giống không đổi khi tính năng tắt: `World.ambush === null`).
import {
  AMBUSH_CALM_MS,
  AMBUSH_COOLDOWN_MS,
  AMBUSH_DAY_CAP,
  AMBUSH_LOGIN_COOLDOWN_MS,
  AMBUSH_MIN_HP_PCT,
  AMBUSH_MIN_PROTOCOL,
  AMBUSH_ARM_MS,
  AMBUSH_OFFER_MS,
  AMBUSH_RETURN_GRACE_MS,
  AMBUSH_SEEN_MS,
  AMBUSH_STRIDE_PX,
  AMBUSH_TIERS,
  AMBUSH_TIER_WEIGHTS,
  AMBUSH_FLEE_MIN_COIN,
  AMBUSH_FOE_LEVEL_CAP,
  AMBUSH_FOES,
  AMBUSH_SCENES,
  TRAVEL_COOLDOWN_MS,
  ambushFillScene,
  ambushPrice,
  ambushRollP,
  MONSTER_BY_ID,
  dayKey,
  parseAmbushChoose,
  parseAmbushSeen,
  realmOfStep,
  stepOf,
  type AmbushChoice,
  type AmbushEndMsg,
  type AmbushFoeGroup,
  type AmbushOfferMsg,
  type AmbushPrice,
  type AmbushPriceStage,
  type AmbushScene,
  type AmbushTier,
} from "@tien-gioi/shared";
import { randomBytes } from "node:crypto";
import type { Player } from "../schema";
import type { PlayerCtrl, World } from "../world";
import type { AmbushDaily } from "../store";
import { MONSTER_WAKE_DIST, forgetTarget } from "./monsters";
import { trySpendCoin } from "./wallet";

/** Bước nhảy vị trí (px, một tick) lớn hơn mức này coi là DỊCH CHUYỂN (vào phòng, hồi sinh, qua cổng), không tính vào quãng đi. Bước đi thật tối đa 10 bước x tốc độ x 50 ms ~ 150 px. */
export const AMBUSH_TELEPORT_PX = 300;
/** Đồng đội trong chừng này (px) đang giao chiến thì người này cũng không bị chặn (mục 4.2). */
export const AMBUSH_PARTY_NEAR_PX = 700;

/** Lý do KHÔNG kích hoạt (mỗi nhánh của mục 4.2 một tên; test phủ từng nhánh). */
export type AmbushBlock =
  | "off" // tính năng tắt (World.ambush === null) hoặc người chơi không còn trong phòng
  | "protocol" // client cũ (v < AMBUSH_MIN_PROTOCOL): không có hộp thoại
  | "bot" // tài khoản bot bị bỏ qua (trừ AMBUSH_BOTS=on, CD9 #1069)
  | "run" // phòng bí cảnh / đấu trường
  | "safe" // trong trấn / khu an toàn / tầm cổng
  | "dead" // đã chết / đang nằm
  | "limbo" // Hoàng Tuyền
  | "ghost" // hồn lìa xác / chưa nối lại xong
  | "travel" // đang chuyển phòng / còn hồi qua cổng
  | "duel" // đang thách đấu PK
  | "hp" // khí huyết dưới ngưỡng
  | "combat" // đang giao chiến
  | "party_combat" // đồng đội gần đó đang giao chiến
  | "boss" // trùm đang nhắm / ở gần
  | "event" // sự kiện đặc biệt (trùm thế giới) đang diễn ra
  | "offer" // đang có hộp thoại
  | "cooldown" // còn hồi
  | "day_cap"; // hết trần ngày

/** Lời đề nghị đang chờ của một người (dữ liệu RIÊNG của server). Giá đã CHỐT. */
export interface AmbushOfferCtrl {
  id: string;
  /** Bầy được chọn (CD3 dựng đấu trường từ đây). */
  group: AmbushFoeGroup;
  tier: AmbushTier;
  /** Văn mẫu ĐÃ điền. */
  scene: string;
  /** Giá đã chốt lúc dựng (hiện trên nút = bị trừ). */
  price: AmbushPrice;
  /** `w.now` lúc dựng (cho `AMBUSH_ARM_MS`). */
  builtAt: number;
  /** Hết giờ (`w.now`) = `fight`; dời tiến khi hồn lìa xác (đóng băng). */
  endsAt: number;
  /** Hạn phải có `ambushSeen`; dời tiến cùng `endsAt` khi đóng băng. */
  seenBy: number;
  seen: boolean;
  /** `PlayerCtrl.shieldUntil` có sẵn trước khi hộp thoại khoá người chơi (hộ thể mạng); mở khoá thì trả lại nếu còn hạn. */
  prevShield?: number;
  /** Đang bỏ chạy: đã trừ `paid` (một lần), đang chờ LƯU xong rồi mới đóng. */
  settling?: { choice: Exclude<AmbushChoice, "fight">; paid: { exp?: number; coin?: number } };
}

/** Dữ liệu chặn đường RIÊNG của một người chơi (`PlayerCtrl.ambush`); dựng lười ở lần đi đầu tiên. */
export interface AmbushCtrl {
  /** Quãng đã đi thật chưa đủ một `AMBUSH_STRIDE_PX` (px). */
  walked: number;
  /** Vị trí cuối ở lần theo dõi trước (để biết quãng THẬT). `NaN` = chưa có mốc. */
  lastX: number;
  lastY: number;
  /** Chưa được chặn trước mốc này (`w.now`): hồi sau lần trước, hoặc vừa vào phòng. */
  cooldownUntil: number;
  offer?: AmbushOfferCtrl;
}

/**
 * Cấu hình chạy của phòng (`World.ambush`); `null` = TẮT (mặc định: mọi hàm ở đây thoát ngay, không tốn gì). `WorldRoom` đặt từ `AMBUSH` (`server/src/systems/ambush-config.ts`).
 */
export interface AmbushRuntime {
  /** Nguồn ngẫu nhiên [0, 1) (tiêm vào để test tất định; phòng thật đưa `Math.random`). */
  random: () => number;
  /** Văn mẫu và bảng bầy (mặc định là dữ liệu của `shared/`; test tiêm bảng nhỏ). */
  scenes: readonly AmbushScene[];
  foes: readonly AmbushFoeGroup[];
  /** Những người đang có hộp thoại mở (để `tickAmbush` chỉ duyệt đúng họ: thường là tập rỗng). */
  readonly open: Set<string>;
  /** Có sự kiện đặc biệt đang diễn ra trong bản đồ (trùm thế giới, M9.4)? Có thì không chặn. */
  eventBusy?: (w: World) => boolean;
  /**
   * Miễn trừ bot theo tên (tiền tố 'Bot ')? CHỈ bật ở môi trường dev / test (!isProduction).
   * Ở production mặc định false để tránh người chơi đặt tên 'Bot ' để trốn chặn đường (CD9 #1069).
   */
  exemptBots?: boolean;
  /** Cho phép tài khoản bot gặp chặn đường? Mặc định false (mục 52, CD9 #1069). */
  ambushBots?: boolean;
  /**
   * CD3 gắn vào: dựng đấu trường solo cho lựa chọn `fight`. Trả `true` nếu ĐÃ nhận việc (từ đây CD3 lo kết cục + `ambushEnd`); `false` (đầy phòng, lỗi) thì huỷ lặng lẽ không phạt.
   * Không có móc: huỷ lặng lẽ.
   */
  startFight?: (w: World, sid: string, offer: AmbushOfferCtrl) => boolean;
}

/** Nhận dạng tài khoản bot của kịch bản thử tải (`bots.ts`): tiền tố `Bot ` hoặc `bot_`. */
export function isBotPlayer(name: string): boolean {
  return /^bot[\s_]/i.test(name.trim());
}

/** Dựng cấu hình chạy với mặc định (dữ liệu thật của `shared/`, không bot, chưa có đấu trường). `random` bắt buộc: không có `Math.random` ngầm trong luồng tick. */
export function createAmbushRuntime(
  opts: Pick<AmbushRuntime, "random"> & Partial<Omit<AmbushRuntime, "random" | "open">>,
): AmbushRuntime {
  return {
    scenes: AMBUSH_SCENES,
    foes: AMBUSH_FOES,
    exemptBots: opts.exemptBots ?? false,
    ...opts,
    open: new Set(),
  };
}

/** Phiên bản giao thức client khai lúc vào phòng (`JoinOptions.v`): số nguyên 0..999, không thì `undefined` (không tin client; coi như client cũ). */
export function protoOf(v: unknown): number | undefined {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1000 ? v : undefined;
}

// ---------- Hồ sơ: bộ đếm ngày và hồi ----------

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Bộ đếm lần bị chặn theo ngày từ file lưu: đúng dạng `{ day: "YYYY-MM-DD" thật, n: nguyên 0..AMBUSH_DAY_CAP }` thì giữ, còn lại bỏ (`undefined` = chưa bị lần nào hôm nay).
 * Khớp luật của `kiem-save` (`audit-saves.ts`). Đặt ở đây (không ở store.ts): store.ts đọc `DATA_DIR` lúc nạp module, system không được kéo nó vào.
 */
export function sanitizeAmbushDaily(raw: unknown): AmbushDaily | undefined {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const { day, n } = raw as Record<string, unknown>;
  if (typeof day !== "string" || !DAY_KEY_RE.test(day)) return undefined;
  const ms = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== day) return undefined;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > AMBUSH_DAY_CAP)
    return undefined;
  return { day, n };
}

/** Số lần còn bị chặn hôm nay (0..`AMBUSH_DAY_CAP`); sang ngày mới thì đủ lại. */
export function ambushLeftToday(c: PlayerCtrl, now: number): number {
  const d = sanitizeAmbushDaily(c.save.ambushDaily);
  const used = d && d.day === dayKey(now) ? d.n : 0;
  return Math.max(0, AMBUSH_DAY_CAP - used);
}

/** Mốc hết hồi đã lưu: số hữu hạn, không quá `now + AMBUSH_COOLDOWN_MS` (file hỏng không treo hồi vô hạn), không âm. */
export function sanitizeAmbushUntil(raw: unknown, now: number): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  return Math.max(0, Math.min(raw, now + AMBUSH_COOLDOWN_MS));
}

/** Vừa được đưa về từ đấu trường thì chừng này (ms) kể từ lúc đưa về vẫn được hưởng bảo hộ khi vào phòng (đủ cho client chuyển phòng, không cho "để dành" bảo hộ). */
export const AMBUSH_RETURN_WINDOW_MS = 30_000;

/**
 * Vào phòng sau khi được đưa về từ đấu trường (`ambushReturnAt` trong hồ sơ, `WorldRoom.exitArenaRoom` ghi): bảo hộ `AMBUSH_RETURN_GRACE_MS` kể từ BÂY GIỜ (quái quanh chỗ cũ không nhắm,
 * không đánh được), rồi xoá trường để lần vào sau không còn. Trường quá cũ / sai kiểu / ở tương lai chỉ bị xoá, không bảo hộ (file hỏng không cho bảo hộ vô hạn).
 */
export function applyReturnGrace(w: World, sid: string, c: PlayerCtrl): boolean {
  const at = c.save.ambushReturnAt;
  if (at === undefined) return false;
  c.save = { ...c.save, ambushReturnAt: undefined };
  if (
    typeof at !== "number" ||
    !Number.isFinite(at) ||
    at > w.now + 1000 ||
    w.now - at >= AMBUSH_RETURN_WINDOW_MS
  )
    return false;
  c.shieldUntil = Math.max(c.shieldUntil ?? 0, w.now + AMBUSH_RETURN_GRACE_MS);
  w.shielded.add(sid);
  forgetTarget(w, sid);
  return true;
}

/** Dữ liệu chặn đường của người này; dựng lười (hồi: không sớm hơn mốc đã lưu, và ít nhất `AMBUSH_LOGIN_COOLDOWN_MS` kể từ lúc vào phòng này). */
export function ambushOf(w: World, c: PlayerCtrl): AmbushCtrl {
  if (c.ambush) return c.ambush;
  const saved = sanitizeAmbushUntil(c.save.ambushUntil, w.now) ?? 0;
  c.ambush = {
    walked: 0,
    lastX: NaN,
    lastY: NaN,
    cooldownUntil: Math.max(saved, w.now + AMBUSH_LOGIN_COOLDOWN_MS),
  };
  return c.ambush;
}

/** Vừa đầu thai: chưa bị chặn trong `ms` (gọi từ `applyRebirth`). Không rút ngắn hồi đang có. */
export function ambushPause(w: World, c: PlayerCtrl, ms: number): void {
  const a = ambushOf(w, c);
  a.cooldownUntil = Math.max(a.cooldownUntil, w.now + ms);
}

// ---------- Giá ----------

/** Cả hai giá của người này ở thời điểm `stage`, đọc từ nhân vật THẬT (không bao giờ từ client). */
export function ambushPriceOf(p: Player, c: PlayerCtrl, stage: AmbushPriceStage): AmbushPrice {
  return ambushPrice({ expInBar: p.exp, step: stepOf(p.realm, p.tier), wallet: c.coin }, stage);
}

// ---------- Điều kiện ----------

/** Người này hoặc đồng đội gần đó vừa giao chiến (bị đánh / đánh / đang bị quái nhắm) trong `AMBUSH_CALM_MS`? */
function fighting(w: World, sid: string, c: PlayerCtrl): boolean {
  if (w.now - c.lastHitAt < AMBUSH_CALM_MS) return true;
  if (c.lastDealtAt !== undefined && w.now - c.lastDealtAt < AMBUSH_CALM_MS) return true;
  for (const mc of w.mctrl.values()) if (mc.target === sid) return true;
  return false;
}

/** Thành viên cùng đội trong `AMBUSH_PARTY_NEAR_PX` đang giao chiến? (chỉ gọi lúc tung trúng, nên duyệt người chơi được.) */
function partyFighting(w: World, sid: string, p: Player): boolean {
  const me = p.name.toLowerCase();
  if (w.parties.partyIdOf(me) === undefined) return false;
  for (const [osid, op] of w.state.players) {
    if (osid === sid || !w.parties.sameParty(me, op.name.toLowerCase())) continue;
    if (Math.hypot(op.x - p.x, op.y - p.y) > AMBUSH_PARTY_NEAR_PX) continue;
    const oc = w.ctrl.get(osid);
    if (oc && fighting(w, osid, oc)) return true;
  }
  return false;
}

/** Có trùm còn sống trong tầm đánh thức (`MONSTER_WAKE_DIST`)? (Trùm đang NHẮM người này đã bị nhánh `combat` chặn trước.) */
function bossNear(w: World, p: Player): boolean {
  for (const [id, mc] of w.mctrl) {
    if (mc.boss === undefined && mc.def.boss !== true) continue;
    const m = w.state.monsters.get(id);
    if (m && m.hp > 0 && Math.hypot(m.x - p.x, m.y - p.y) <= MONSTER_WAKE_DIST) return true;
  }
  return false;
}

/**
 * Người này có BỊ CHẶN (không được gây chặn đường) lúc này không? Trả TÊN nhánh đầu tiên chặn, `null` = được. Thứ tự: rẻ trước đắt sau. Mọi nhánh của mục 4.2 cộng hồi và trần ngày.
 * Không kiểm xác suất / quãng đi (việc của `trackAmbushWalk`).
 */
export function ambushBlocked(w: World, sid: string): AmbushBlock | null {
  const rt = w.ambush;
  const p = w.state.players.get(sid);
  const c = w.ctrl.get(sid);
  if (!rt || !p || !c) return "off";
  if ((c.proto ?? 0) < AMBUSH_MIN_PROTOCOL) return "protocol";
  if (rt.exemptBots && isBotPlayer(p.name) && !rt.ambushBots) return "bot";
  if (w.runId !== null || w.arena !== null) return "run";
  if (p.dead) return "dead";
  if (c.limbo) return "limbo";
  if (w.ghosts.has(sid) || c.silent === true) return "ghost";
  if (c.travelling === true || w.now - (c.save.travelAt ?? 0) < TRAVEL_COOLDOWN_MS) return "travel";
  if (w.duels.has(sid)) return "duel";
  if (c.ambush?.offer) return "offer";
  if (w.map.inSafe(p.x, p.y)) return "safe";
  if (p.maxHp > 0 && (p.hp / p.maxHp) * 100 < AMBUSH_MIN_HP_PCT) return "hp";
  if (fighting(w, sid, c)) return "combat";
  if (partyFighting(w, sid, p)) return "party_combat";
  if (bossNear(w, p)) return "boss";
  if (rt.eventBusy?.(w)) return "event";
  if (w.now < ambushOf(w, c).cooldownUntil) return "cooldown";
  if (ambushLeftToday(c, w.now) <= 0) return "day_cap";
  return null;
}

// ---------- Chọn cảnh + bầy ----------

/** Chọn bầy + cảnh hợp (bản đồ, bậc người chơi, mức có cả cảnh lẫn bầy) theo trọng số mức; `null` nếu bảng không có gì hợp (khi đó lần tung bị bỏ). */
/**
 * Mục 53 (bị hạ = chết thật): KHÔNG BAO GIỜ chọn bầy có loài mạnh vượt cảnh giới người chơi: cấp loài (`MonsterKind.level`) <= `AMBUSH_FOE_LEVEL_CAP` của cảnh giới ở bậc `step`. Dữ liệu hợp lệ
 * (`ambushViolations`) luôn qua; đây là dây an toàn thứ hai khi dữ liệu chưa qua luật kiểm (bản chạy thật không nên có, test tiêm bầy tay). Cảnh giới chưa khai trần: không chọn gì.
 */
export function foesWithinRealm(g: AmbushFoeGroup, step: number): boolean {
  const realm = realmOfStep(step)?.realm;
  const cap = realm === undefined ? undefined : AMBUSH_FOE_LEVEL_CAP[realm];
  if (cap === undefined) return false;
  return g.foes.every((f) => (MONSTER_BY_ID[f.kind]?.level ?? Infinity) <= cap);
}

export function pickAmbush(
  rt: Pick<AmbushRuntime, "random" | "scenes" | "foes">,
  mapId: string,
  step: number,
): { group: AmbushFoeGroup; scene: AmbushScene } | null {
  const byTier = new Map<AmbushTier, { groups: AmbushFoeGroup[]; scenes: AmbushScene[] }>();
  for (const t of AMBUSH_TIERS) {
    const groups = rt.foes.filter(
      (g) =>
        g.mapId === mapId &&
        g.tier === t &&
        step >= g.minStep &&
        step <= g.maxStep &&
        foesWithinRealm(g, step),
    );
    const scenes = rt.scenes.filter((s) => s.mapIds.includes(mapId) && s.tiers.includes(t));
    if (groups.length > 0 && scenes.length > 0) byTier.set(t, { groups, scenes });
  }
  if (byTier.size === 0) return null;
  let total = 0;
  for (const t of byTier.keys()) total += AMBUSH_TIER_WEIGHTS[t];
  let roll = rt.random() * total;
  let chosen: AmbushTier = [...byTier.keys()][0]!;
  for (const t of byTier.keys()) {
    roll -= AMBUSH_TIER_WEIGHTS[t];
    if (roll < 0) {
      chosen = t;
      break;
    }
  }
  const pool = byTier.get(chosen)!;
  const at = (n: number) => Math.min(n - 1, Math.floor(rt.random() * n));
  return {
    group: pool.groups[at(pool.groups.length)]!,
    scene: pool.scenes[at(pool.scenes.length)]!,
  };
}

/** Tổng số con của một bầy (hiện ở hộp thoại). */
const foeCount = (g: AmbushFoeGroup): number => g.foes.reduce((s, f) => s + f.count, 0);

// ---------- Mở / đóng hộp thoại ----------

/** Tin `ambushOffer` hiện tại của một lời đề nghị: `ms` là thời gian còn THẬT (đóng băng thì giữ nguyên chừng còn lại lúc đóng băng). */
export function offerMsgOf(w: World, o: AmbushOfferCtrl): AmbushOfferMsg {
  return {
    id: o.id,
    scene: o.scene,
    foe: { name: o.group.name, tier: o.tier, count: foeCount(o.group) },
    price: o.price,
    ms: Math.max(0, Math.round(o.endsAt - w.now)),
  };
}

/** Khoá người chơi khi có hộp thoại: quái bỏ mục tiêu, bất khả xâm phạm tới `until`, hàng đợi input bỏ (nhân vật đứng yên). Gọi lại được (đặt lại hộ thể nếu hộ thể mạng vừa ghi đè). */
function lock(w: World, sid: string, c: PlayerCtrl, until: number): void {
  c.inputs.length = 0;
  c.shieldUntil = Math.max(c.shieldUntil ?? 0, until);
  w.shielded.add(sid);
  forgetTarget(w, sid);
}

/** Mở khoá: trả `shieldUntil` về như trước hộp thoại (hộ thể mạng còn hạn thì giữ, hết thì gỡ khỏi `w.shielded`). */
function unlock(w: World, sid: string, c: PlayerCtrl, o: AmbushOfferCtrl): void {
  if (o.prevShield !== undefined && o.prevShield > w.now) {
    c.shieldUntil = o.prevShield;
    return;
  }
  c.shieldUntil = undefined;
  w.shielded.delete(sid);
}

/** Ghi một lần bị chặn vào sổ ngày (hồ sơ, lưu ở lần lưu tới). */
function countToday(w: World, c: PlayerCtrl): void {
  const today = dayKey(w.now);
  const d = sanitizeAmbushDaily(c.save.ambushDaily);
  const n = d && d.day === today ? d.n : 0;
  c.save = { ...c.save, ambushDaily: { day: today, n: Math.min(AMBUSH_DAY_CAP, n + 1) } };
}

/** Đặt hồi sau khi chặn đường kết thúc (đủ `AMBUSH_COOLDOWN_MS` kể từ bây giờ), ghi vào hồ sơ để đăng nhập lại không xoá. */
function startCooldown(w: World, c: PlayerCtrl): void {
  const a = ambushOf(w, c);
  a.cooldownUntil = Math.max(a.cooldownUntil, w.now + AMBUSH_COOLDOWN_MS);
  c.save = { ...c.save, ambushUntil: a.cooldownUntil };
}

/** Dựng hộp thoại cho người này (đã qua `ambushBlocked`, đã chọn cảnh + bầy). Trả lời đề nghị đã dựng. */
function openOffer(
  w: World,
  sid: string,
  p: Player,
  c: PlayerCtrl,
  pick: { group: AmbushFoeGroup; scene: AmbushScene },
): AmbushOfferCtrl {
  const a = ambushOf(w, c);
  const o: AmbushOfferCtrl = {
    id: randomBytes(8).toString("hex"),
    group: pick.group,
    tier: pick.group.tier,
    scene: ambushFillScene(pick.scene.text, {
      dia_danh: w.map.wildName,
      ke_dich: pick.group.name,
    }),
    price: ambushPriceOf(p, c, "offer"),
    builtAt: w.now,
    endsAt: w.now + AMBUSH_OFFER_MS,
    seenBy: w.now + AMBUSH_SEEN_MS,
    seen: false,
  };
  o.prevShield = c.shieldUntil;
  a.offer = o;
  a.walked = 0;
  w.ambush!.open.add(sid);
  countToday(w, c);
  lock(w, sid, c, o.endsAt + 5_000);
  w.events.ambushOffer(sid, offerMsgOf(w, o));
  w.audit?.("ambush.offer", {
    name: p.name,
    map: w.map.def.id,
    tier: o.tier,
    group: o.group.id,
  });
  return o;
}

/** Đóng hộp thoại: gỡ khoá, đặt hồi, báo `ambushEnd`. */
function closeOffer(
  w: World,
  sid: string,
  c: PlayerCtrl,
  o: AmbushOfferCtrl,
  end: AmbushEndMsg,
): void {
  const a = ambushOf(w, c);
  a.offer = undefined;
  a.walked = 0;
  a.lastX = NaN;
  w.ambush?.open.delete(sid);
  unlock(w, sid, c, o);
  startCooldown(w, c);
  w.events.ambushEnd(sid, end);
}

// ---------- Theo dõi quãng đi + tung xúc xắc ----------

/**
 * Gọi MỘT lần mỗi tick cho mỗi người đang chơi sau `applyInputs` (đường nóng: không cấp phát, thoát sớm khi tính năng tắt). Cộng quãng đi THẬT; đủ một chặng thì tung xúc xắc.
 */
export function trackAmbushWalk(w: World, sid: string, p: Player, c: PlayerCtrl): void {
  const rt = w.ambush;
  if (rt === null) return;
  const a = ambushOf(w, c);
  const lx = a.lastX;
  const ly = a.lastY;
  a.lastX = p.x;
  a.lastY = p.y;
  if (a.offer !== undefined || lx !== lx) return; // đang hộp thoại, hoặc chưa có mốc (lần đầu / sau dịch chuyển)
  const d = Math.hypot(p.x - lx, p.y - ly);
  if (d === 0 || d > AMBUSH_TELEPORT_PX) return;
  if (w.map.inSafe(p.x, p.y)) return; // trong trấn / khu an toàn: không tính quãng đi
  a.walked += d;
  if (a.walked < AMBUSH_STRIDE_PX) return;
  a.walked -= AMBUSH_STRIDE_PX;
  if (a.walked > AMBUSH_STRIDE_PX) a.walked = 0; // không để dành hai lần liền
  rollAmbush(w, sid, p, c);
}

/** Tung MỘT lần: trúng xác suất theo độ nguy hiểm, đủ điều kiện, có cảnh + bầy hợp thì mở hộp thoại. Trả `true` nếu đã mở. Đưa vào hàm riêng để test tung trực tiếp. */
export function rollAmbush(w: World, sid: string, p: Player, c: PlayerCtrl): boolean {
  const rt = w.ambush;
  if (rt === null) return false;
  if (rt.random() >= ambushRollP(w.map.dangerAt(p.x, p.y))) return false;
  if (ambushBlocked(w, sid) !== null) return false;
  const pick = pickAmbush(rt, w.map.def.id, stepOf(p.realm, p.tier));
  if (pick === null) return false;
  openOffer(w, sid, p, c, pick);
  return true;
}

// ---------- Nhịp: hết giờ, huỷ ----------

/** Cho `fight` (hết giờ hoặc người chơi chọn): CD3 dựng đấu trường; không có móc / móc từ chối thì huỷ lặng lẽ. */
function fight(w: World, sid: string, c: PlayerCtrl, o: AmbushOfferCtrl): void {
  const started = w.ambush?.startFight?.(w, sid, o) === true;
  if (started) {
    // Đấu trường đã nhận vé: hộp thoại đóng, người chơi sắp được chuyển phòng (kết cục `ambushEnd` đến từ phòng đấu trường). Đặt hồi NGAY (vào hồ sơ trước lần lưu lúc chuyển phòng:
    // sập máy giữa trận không cho bị chặn lại liền).
    startCooldown(w, c);
    const a = ambushOf(w, c);
    a.offer = undefined;
    a.walked = 0;
    w.ambush?.open.delete(sid);
    unlock(w, sid, c, o);
    return;
  }
  closeOffer(w, sid, c, o, { result: "canceled" });
}

/** Mỗi tick (chỉ khi `w.ambush` bật; chỉ duyệt người đang có hộp thoại): hết giờ = Chiến; không `ambushSeen` kịp = huỷ; hồn lìa xác thì ĐÓNG BĂNG đồng hồ. `dtMs` là bước tick. */
export function tickAmbush(w: World, dtMs: number): void {
  const rt = w.ambush;
  if (rt === null || rt.open.size === 0) return;
  for (const sid of [...rt.open]) {
    const c = w.ctrl.get(sid);
    const o = c?.ambush?.offer;
    if (!c || o === undefined) {
      rt.open.delete(sid); // người đó đã rời phòng (không qua `ambushDropOffer`): dọn
      continue;
    }
    if (o.settling !== undefined) continue; // đang chờ lưu: không hết giờ, không huỷ
    if (w.ghosts.size > 0 && w.ghosts.has(sid)) {
      // ĐÓNG BĂNG: dời hạn tiến đúng bước tick (rớt mạng: mục 33, chờ nối lại; trong lúc đó bất khả xâm phạm vì hồn lìa xác)
      o.endsAt += dtMs;
      o.seenBy += dtMs;
      continue;
    }
    lock(w, sid, c, o.endsAt + 5_000); // hộ thể mạng (nối lại / có tin lại) có thể vừa ghi đè `shieldUntil`: đặt lại
    if (!o.seen && w.now >= o.seenBy) closeOffer(w, sid, c, o, { result: "canceled" });
    else if (w.now >= o.endsAt) fight(w, sid, c, o);
  }
}

// ---------- Tin của client ----------

/** `ambushSeen { id }`: hộp thoại ĐÃ hiện. Sai id / không có hộp thoại thì bỏ qua lặng lẽ. */
export function onAmbushSeen(w: World, sid: string, raw: unknown): void {
  const m = parseAmbushSeen(raw);
  const o = w.ctrl.get(sid)?.ambush?.offer;
  if (m === null || o === undefined || o.id !== m.id) return;
  o.seen = true;
}

/**
 * Trừ ĐÚNG giá đã chốt (một lần): `flee_coin` trừ ví, `flee_exp` trừ tu vi trong thanh (không rớt cảnh giới). `false` nếu không đủ (không trừ gì).
 * `flee_exp` với `exp` = 0 (thanh trống) bị từ chối: chỉ cho trả Linh thạch (luật của `ambushPrice`, chống bỏ chạy miễn phí mãi).
 */
export function chargeFlee(
  w: World,
  sid: string,
  p: Player,
  chot: AmbushPrice,
  choice: Exclude<AmbushChoice, "fight">,
): { exp?: number; coin?: number } | null {
  if (choice === "flee_coin") {
    const price = Math.max(AMBUSH_FLEE_MIN_COIN, chot.coin.price);
    return trySpendCoin(w, sid, price) ? { coin: price } : null;
  }
  const price = chot.exp;
  if (price <= 0 || p.exp < price) return null; // thanh trống / tu vi đã đổi thấp hơn giá chốt: không trừ
  p.exp -= price;
  return { exp: price };
}

/**
 * `ambushChoose { id, choice }`. Chỉ nhận khi `id` đúng lời đang chờ và đã quá `AMBUSH_ARM_MS` kể từ lúc dựng (đến sớm hơn: bỏ qua, ngón tay còn đang bấm). `fight` -> `startFight`;
 * `flee_*` -> trừ giá chốt, LƯU, đóng (`fled`). Trả `Promise` xong khi việc đóng / lưu xong (WorldRoom không cần chờ; test chờ).
 */
export async function onAmbushChoose(w: World, sid: string, raw: unknown): Promise<void> {
  if (w.ambush === null) return;
  const m = parseAmbushChoose(raw);
  const p = w.state.players.get(sid);
  const c = w.ctrl.get(sid);
  const o = c?.ambush?.offer;
  if (m === null || !p || !c || p.dead || o === undefined || o.id !== m.id) return;
  if (w.now - o.builtAt < AMBUSH_ARM_MS) return; // chưa "mở khoá": bỏ qua, không đổi trạng thái
  if (w.ghosts.has(sid)) return; // đóng băng: chờ nối lại rồi mới chọn được
  o.seen = true; // chọn được nghĩa là đã thấy
  if (m.choice === "fight") {
    if (o.settling === undefined) fight(w, sid, c, o);
    return;
  }
  await settleFlee(w, sid, p, c, o, m.choice);
}

/** Bỏ chạy: trừ (một lần) -> LƯU -> đóng. Gọi lại khi đang chờ lưu: chỉ lưu lại (không trừ hai lần). */
async function settleFlee(
  w: World,
  sid: string,
  p: Player,
  c: PlayerCtrl,
  o: AmbushOfferCtrl,
  choice: Exclude<AmbushChoice, "fight">,
): Promise<void> {
  if (o.settling === undefined) {
    const paid = chargeFlee(w, sid, p, o.price, choice);
    if (paid === null) {
      w.events.toast(sid, { text: "Không đủ để trả giá bỏ chạy", tone: "bad" });
      return;
    }
    o.settling = { choice, paid };
    startCooldown(w, c); // đặt hồi TRƯỚC khi lưu: một lần lưu giữ cả số dư mới lẫn mốc hồi (sập máy sau đó không mất hồi)
  } else if (o.settling.choice !== choice) {
    return; // đang chờ lưu một cách trả khác: không đổi giữa chừng
  }
  const ok = (await w.onSaveNow?.(sid)) ?? true;
  // Trong lúc chờ lưu người chơi có thể đã rời phòng (ctrl mất) hoặc hộp thoại đã bị đóng bởi nhánh khác
  if (w.ctrl.get(sid)?.ambush?.offer !== o) return;
  if (!ok) {
    // Giữ hộp thoại + `settling`: lần bấm sau (client mở lại nút sau vài giây) chỉ lưu lại, không trừ thêm. Báo cho người chơi (review B ở #1083): không im lặng.
    w.events.toast(sid, { text: "Chưa lưu được, hãy bấm lại sau giây lát", tone: "bad" });
    ambushResend(w, sid);
    return;
  }
  w.audit?.("ambush.flee", { name: p.name, choice, paid: o.settling.paid, stage: "offer" });
  closeOffer(w, sid, c, o, { result: "fled", paid: o.settling.paid });
}

/**
 * Người chơi thoát chủ động / rớt mạng QUÁ hạn chờ nối lại lúc hộp thoại đang mở = bỏ chạy bằng tu vi giá hộp thoại (chống né giá bằng cách thoát). Không đủ tu vi thì thôi
 * (trần 0: không có gì để trừ). Gọi bởi `WorldRoom.onLeave` TRƯỚC khi lưu cuối; hồ sơ được lưu ngay sau đó nên không cần LƯU ở đây. Trả số tu vi đã trừ.
 */
export function ambushDropOffer(w: World, sid: string): number {
  const p = w.state.players.get(sid);
  const c = w.ctrl.get(sid);
  const o = c?.ambush?.offer;
  if (!p || !c || o === undefined) return 0;
  // Đã trừ rồi (đang chờ lưu): giữ nguyên số đó, không trừ lần hai
  let paid = o.settling?.paid.exp ?? 0;
  if (o.settling === undefined) {
    paid = Math.min(Math.max(0, o.price.exp), Math.max(0, Math.floor(p.exp)));
    p.exp -= paid;
  }
  c.save = {
    ...c.save,
    ambushUntil: Math.max(c.ambush?.cooldownUntil ?? 0, w.now + AMBUSH_COOLDOWN_MS),
  };
  c.ambush!.offer = undefined;
  w.ambush?.open.delete(sid);
  unlock(w, sid, c, o);
  w.audit?.("ambush.drop", { name: p.name, paid, stage: "offer" });
  return paid;
}

/** Nối lại mạng giữa hộp thoại: gửi LẠI `ambushOffer` (cùng id, `ms` còn lại THẬT). Không có hộp thoại thì không làm gì. */
export function ambushResend(w: World, sid: string): void {
  const o = w.ctrl.get(sid)?.ambush?.offer;
  if (o !== undefined) w.events.ambushOffer(sid, offerMsgOf(w, o));
}
