// Phòng thế giới: vào / ra phòng, lưu nhân vật, nối tin nhắn với các system.
// Logic game nằm trong ../systems/*, trạng thái dùng chung trong ../world.ts.
import { performance } from "node:perf_hooks";
import { StateView } from "@colyseus/schema";
import { randomBytes } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { Room, Client, ServerError, matchMaker, type RoomException, type Server } from "colyseus";
import {
  TICK_MS,
  type SoulSocial,
  SOCIAL_MSG,
  ACHIEVEMENT_BY_ID,
  achievementsDue,
  newSocial,
  parseBoardsGet,
  parseTitleSet,
  MAX_PLAYERS_PER_ROOM,
  MONSTER_RESPAWN_MS,
  DEFAULT_MAP_ID,
  MAPS,
  JOIN_WRONG_MAP,
  JOIN_CLIENT_OUTDATED,
  MIN_PROTOCOL_VERSION,
  clientOutdatedMessage,
  isClientOutdated,
  JOIN_BAD_TOKEN,
  JOIN_NEED_CHARACTER,
  DUNGEON_MSG,
  DUEL_MSG,
  HEARTBEAT_MSG,
  AMBUSH_MSG,
  NET_MSG,
  NET_RECONNECT_GRACE_S,
  parseBeatMs,
  parsePing,
  type PongMsg,
  SECT_MSG,
  ARENA_MAPS,
  DUNGEON_MAPS,
  arenaMapIdOf,
  isArenaMap,
  JOIN_NOT_IN_RUN,
  dungeonOf,
  dungeonOfMap,
  isDungeonMap,
  getMap,
  roomNameOf,
  wrongMapMessage,
  REALMS,
  addCoin,
  realmLabel,
  type InputMsg,
  type AttackMsg,
  type SkillMsg,
  type MeditateMsg,
  type ChatMsg,
  type ChatOut,
  type JoinOptions,
  type UseItemMsg,
  type PickupMsg,
  type DropItemMsg,
  type TalkMsg,
  type QuestAcceptMsg,
  type QuestTurnInMsg,
  type QuestAbandonMsg,
  type TradeMsg,
  type EquipMsg,
  type UnequipMsg,
  type CraftMsg,
  type BuyMsg,
  type SellMsg,
  type PartyInviteMsg,
  type PartyAnswerMsg,
  type PartyKickMsg,
  type TravelMsg,
  type TravelToMsg,
  type SoulBuyMsg,
  type RebirthMsg,
  type GameMap,
  type Soul,
  stepOf,
  buyUnlock,
  originMult,
  engraveSlotsOf,
  soulView,
  cleanName,
  sanitizeSkillBook,
  SKILL_MSG,
  type FxMsg,
} from "@tien-gioi/shared";
import { adoptTiledMapFiles } from "@tien-gioi/shared/src/map-files";
import { WorldState, Player } from "../schema";
import {
  hashSecret,
  mapIdOf,
  sanitizeLife,
  sanitizeLifeId,
  sanitizeLimbo,
  sanitizeOrigin,
  type SavedPlayer,
} from "../store";
import { defaultSectStore } from "../sect-store";
import { SectService } from "../sect-service";
import { newLifeLockMsOf } from "../sect-config";
import { defaultSoulStore, type SoulStore } from "../soul";
import { defaultPlayerStore, type PlayerStore } from "../player-store";
import { legacyIdentity, type Identity } from "../identity";
import type { AuthService } from "../auth-service";

/** Mua mở khóa bị từ chối ngay trong `souls.update` (không ghi gì): mang theo lý do để báo người chơi. */
class BuyRefused extends Error {
  constructor(readonly reason: "unknown" | "max" | "poor") {
    super(reason);
  }
}
import { World, type PlayerCtrl } from "../world";
import {
  POS_SYNC_EVERY_TICKS,
  queueInput,
  safeSpot,
  savePos,
  syncPublicPos,
} from "../systems/movement";
import { warmWalkReach } from "../systems/walk-reach";
import { slash, swordQi } from "../systems/combat";
import {
  spawnDungeonMonsters,
  spawnInitial,
  topUpMonsters,
  forgetTarget,
} from "../systems/monsters";
import { applyStats, breakthrough, setMeditating } from "../systems/progression";
import { chat } from "../systems/chat";
import { sanitizeInventory, sendInv, useItem } from "../systems/inventory";
import { dropItem, pickup, releaseLootOwner } from "../systems/loot";
import { sanitizeQuests, sendQuests } from "../systems/quests";
import { cast } from "../systems/cast";
import { sendSkills, skillSlot } from "../systems/skills";
import { sendStatus } from "../systems/status";
import { sendWallet } from "../systems/wallet";
import { buy, sell } from "../systems/shop";
import { abandonQuest, acceptQuest, craft, talk, trade, turnInQuest } from "../systems/npc";
import { equip, equipmentOf, sanitizeEquipment, setEquipment, unequip } from "../systems/equipment";
import { tickWorld } from "../systems/tick";
import { heard, reconnected } from "../systems/net-guard";
import { VIEW_ENTER } from "../systems/interest";
import {
  partyAnswer,
  partyDrop,
  partyInvite,
  partyKick,
  partyLeave,
  partyResync,
} from "../systems/party";
import { planTravel } from "../systems/travel";
import { duelAnswer, duelChallenge, duelDrop, duelYield } from "../systems/duel";
import {
  sectAnswer,
  sectCreate,
  sectDeposit,
  sectDisband,
  sectDrop,
  sectInvite,
  sectKick,
  sectLeave,
  sectMotd,
  sectOnJoin,
  sectRank,
  sectTransfer,
  sectHallGet,
  sectQuestAccept,
  sectQuestTurnIn,
  sectShopBuy,
  sectVaultDeposit,
  sectVaultPolicy,
  sectVaultWithdraw,
  sectWithdraw,
} from "../systems/sect";
import {
  declineDungeon,
  enterDungeon,
  leaveDungeon,
  memberJoined,
  memberLeft,
  openDungeon,
  runFailed,
  runOfWorld,
  runReady,
  type Run,
} from "../systems/dungeon";
import { applyRebirth, creditSoul } from "../systems/reincarnation";
import { lenientRebirth } from "../systems/rebirth-choice";
import { headersAllowed, isProduction, type OriginPolicy } from "../origin-guard";
import { RateLimiter } from "../rate-limit";
import { audit, auditCoinThreshold } from "../audit";
import { bossMovesOf } from "../systems/boss-config";
import { ambushBotsOn, ambushMinPotions, ambushOn } from "../systems/ambush-config";
import {
  ambushDropOffer,
  ambushResend,
  applyReturnGrace,
  createAmbushRuntime,
  onAmbushChoose,
  onAmbushSeen,
  protoOf,
} from "../systems/ambush";
import {
  arenaDrop,
  arenaJoined,
  arenaResend,
  createArena,
  onAmbushFlee,
  openTicket,
  type AmbushTicket,
} from "../systems/arena";
import { testExpMultFor } from "../test-exp";
import type { LeaderboardService } from "../leaderboard";
import { achievementsMsgOf, grantDue, unlockedTitles, wornTitle } from "../systems/achievements";
import { trackSocial } from "../systems/social";
import { worldBossStatus } from "../systems/world-boss";
import { defaultHub, type Hub } from "../hub";

const SAVE_EVERY_MS = 30_000;
/** Mã đóng kết nối khi spam tin nhắn (client hiện "mất kết nối") */
export const CLOSE_SPAM = 4429;
/** Mã đóng kết nối sau khi đã đưa người chơi qua cổng (như thoát chủ động: client không hiện "mất kết nối") */
export const CLOSE_TRAVEL = 4000;
/** Mã nhân vật dài hơn mức này thì từ chối luôn (client tạo mã 32 ký tự) */
const MAX_SECRET_LEN = 256;
/** Giây giữ nhân vật chờ kết nối lại khi rớt mạng bất thường (#116) */
export const RECONNECT_GRACE_S = NET_RECONNECT_GRACE_S; // 90 giây (mục 33; trước đây 20 < thời gian rớt thực tế 25 giây + nối lại)

/** Người chơi vừa rớt mạng, nhân vật vẫn ở trong thế giới chờ kết nối lại */
interface Ghost {
  /** Huỷ chờ: onLeave chạy tiếp phần dọn dẹp như khi rời phòng */
  cancel: () => void;
  /** Xong khi onLeave đã dọn xong (đã lưu, đã xoá khỏi state) */
  done: Promise<void>;
}

/**
 * Tầm vươn xa của một `fx` ngoài điểm phát (px), để `sendNear` gửi cho cả người đứng ở đầu kia: kiếm khí / chiêu / đạn có `range`, vùng báo trước đòn của quái
 * (`warn`) vươn `r` (đường lao dài 280 px; vòng tròn: bán kính), còn lại chỉ ở điểm phát (0).
 */
export function fxReachOf(msg: FxMsg): number {
  if ("range" in msg) return msg.range;
  if (msg.kind === "warn") return msg.r;
  return 0;
}

export class WorldRoom extends Room<WorldState> {
  maxClients = MAX_PLAYERS_PER_ROOM;
  autoDispose = false; // thế giới luôn sống, kể cả khi không có ai
  state = new WorldState();

  /** Kho chân linh (file JSON; bước 3 thay bằng PostgreSQL). Test ghi đè để cô lập. */
  static players: PlayerStore | null = null; // null: `defaultPlayerStore()` (file JSON)
  /** Người đang ghi chân linh lúc đầu thai (khắc chiêu): chặn tin `rebirth` thứ hai chen vào giữa lúc chờ ghi */
  private readonly rebirthing = new Set<string>();
  /** Lý do `rebirth` thất bại đã ghi nhật ký cho từng người (mỗi lý do một lần: tin lặp không làm phình nhật ký) */
  private readonly rebirthFailLogged = new WeakMap<PlayerCtrl, Set<string>>();
  static souls: SoulStore | null = null; // null: `defaultSoulStore()` (dựng lười, đọc DATA_DIR lúc dùng)
  /**
   * Dịch vụ tài khoản khi chạy `AUTH_MODE=account` (đặt ở `index.ts`): vào phòng bằng `JoinOptions.token`, BỎ QUA `name` /
   * `secret`. `null`: chế độ cũ (tên + mã bí mật).
   */
  static auth: AuthService | null = null;
  /**
   * Phiên bản giao thức thấp nhất còn nhận (M4 2.5, `shared/src/protocol.ts`); `index.ts` đặt từ `MIN_PROTOCOL_VERSION` trong môi
   * trường (`server/src/protocol.ts`). Mặc định `MIN_PROTOCOL_VERSION` của `shared/` (0: nhận cả client chưa gửi `v`).
   */
  static minProtocol = MIN_PROTOCOL_VERSION;
  /** Chính sách Origin (chống dùng ké, mục 59): `index.ts` đặt; null (test, bench) = không kiểm. */
  static originPolicy: OriginPolicy | null = null;
  /**
   * Hệ số tu vi THỬ NGHIỆM theo đạo hiệu chuẩn hoá (`TEST_EXP_MULT`, QUYET_DINH_M3 mục 34, `server/src/test-exp.ts`); `index.ts` đặt từ môi trường.
   * Mặc định rỗng = tắt. Tra MỘT lần lúc vào phòng (`onJoin`), không đọc lại trong tick.
   */
  static testExpMult: ReadonlyMap<string, number> = new Map();
  /**
   * Dịch vụ tông môn (đặt ở `index.ts` theo `STORE`). `null`: dùng kho tệp mặc định (`defaultSectStore`, dựng lười). `SECTS=off`
   * (biến môi trường) gỡ tính năng: không có dịch vụ, mọi tin tông môn bị từ chối.
   */
  static sects: SectService | null = null;
  /** Dịch vụ bảng xếp hạng (M9, `leaderboard.ts`; đặt ở `index.ts`, `LEADERBOARD=off` gỡ). `null`: tin `boardsGet` trả bảng trống. */
  static leaderboards: LeaderboardService | null = null;
  /**
   * Cấp thành tựu + Duyên thưởng + danh hiệu (M9.5). MẶC ĐỊNH TẮT (test và bản chạy thật hiện tại không đổi): bộ đếm xã hội vẫn được ghi (thành tựu đến hạn sẽ cấp ngay khi bật), nhưng không cấp
   * thành tựu / không thưởng Duyên / không tin `achievementNew`. `index.ts` bật khi `ACHIEVEMENTS=on`; PR cuối của M9 đổi mặc định thành bật.
   */
  static achievements = false;
  /** "Chờ sang ngày mới kiếm được cống hiến" (M8; mặc định BẬT; `index.ts` đặt từ `SECT_EARN_WARMUP`, `off` chỉ để dev / E2E). */
  static sectEarnWarmup = true;
  private static defaultSects: SectService | undefined;
  static sectService(): SectService | null {
    if (process.env.SECTS === "off") return null;
    return (WorldRoom.sects ??= WorldRoom.defaultSects ??= new SectService(defaultSectStore()));
  }
  /** Kênh chung giữa các phòng. Test ghi đè để cô lập. */
  static hub: Hub = defaultHub;
  private get hub() {
    return WorldRoom.hub;
  }
  private removeChatSink: (() => void) | null = null;

  /** Bản đồ của phòng này (mỗi bản đồ một phòng, docs/THIET_KE_NHIEU_BAN_DO.md); đặt ở onCreate */
  mapId = DEFAULT_MAP_ID;
  private world!: World;

  /** Nối các system với kênh gửi tin của phòng. Gọi một lần ở onCreate, khi đã biết bản đồ. */
  private createWorld(map: GameMap) {
    const w = new World(
      this.state,
      {
        // Hiệu ứng và số sát thương có vị trí: chỉ gửi cho người ở trong vùng nhìn (#62), không broadcast cả phòng
        fx: (msg) => this.sendNear(msg.x, msg.y, fxReachOf(msg), "fx", msg),
        dmg: (msg) => this.sendNear(msg.x, msg.y, 0, "dmg", msg),
        dmgTo: (sid, msg) => this.sendTo(sid, "dmg", msg),
        sys: (text) =>
          this.broadcast("chat", { from: "Thiên Đạo", text, sys: true } satisfies ChatOut),
        // Chat người chơi là của CẢ SERVER (mọi bản đồ / phòng); thông báo hệ thống (`sys`) chỉ trong phòng
        chat: (from, text, titleId) =>
          this.hub.chat({ from, text, ...(titleId ? { titleId } : {}) } satisfies ChatOut),
        toast: (sid, msg) => this.sendTo(sid, "toast", msg),
        inv: (sid, msg) => this.sendTo(sid, "inv", msg),
        quests: (sid, msg) => this.sendTo(sid, "quests", msg),
        skills: (sid, msg) => this.sendTo(sid, SKILL_MSG.skills, msg),
        status: (sid, msg) => this.sendTo(sid, SKILL_MSG.status, msg),
        dialog: (sid, msg) => this.sendTo(sid, "dialog", msg),
        party: (sid, msg) => this.sendTo(sid, "party", msg),
        partyInvited: (sid, msg) => this.sendTo(sid, "partyInvited", msg),
        wallet: (sid, msg) => this.sendTo(sid, "wallet", msg),
        chatTo: (sid, msg) => this.sendTo(sid, "chat", msg),
        limbo: (sid, msg) => this.sendTo(sid, "limbo", msg),
        soul: (sid, msg) => this.sendTo(sid, "soul", msg),
        reborn: (sid, msg) => this.sendTo(sid, "reborn", msg),
        dungeonInvite: (sid, msg) => this.sendTo(sid, DUNGEON_MSG.invite, msg),
        dungeonEnd: (sid, msg) => this.sendTo(sid, DUNGEON_MSG.end, msg),
        dungeonState: (sid, msg) => this.sendTo(sid, DUNGEON_MSG.state, msg),
        dungeonFallen: (sid, msg) => this.sendTo(sid, DUNGEON_MSG.fallen, msg),
        duelInvited: (sid, msg) => this.sendTo(sid, DUEL_MSG.invited, msg),
        duelState: (sid, msg) => this.sendTo(sid, DUEL_MSG.state, msg),
        duelEnd: (sid, msg) => this.sendTo(sid, DUEL_MSG.end, msg),
        sect: (sid, msg) => this.sendTo(sid, SECT_MSG.snapshot, msg),
        sectPresence: (sid, msg) => this.sendTo(sid, SECT_MSG.presence, msg),
        sectInvited: (sid, msg) => this.sendTo(sid, SECT_MSG.invited, msg),
        sectVault: (sid, msg) => this.sendTo(sid, SECT_MSG.vault, msg),
        sectHall: (sid, msg) => this.sendTo(sid, SECT_MSG.hall, msg),
        netShield: (sid, msg) => this.sendTo(sid, NET_MSG.shield, msg),
        ambushOffer: (sid, msg) => this.sendTo(sid, AMBUSH_MSG.offer, msg),
        ambushEnd: (sid, msg) => this.sendTo(sid, AMBUSH_MSG.end, msg),
        ambushState: (sid, msg) => this.sendTo(sid, AMBUSH_MSG.state, msg),
        worldBoss: (sid, msg) => this.sendTo(sid, SOCIAL_MSG.worldBoss, msg),
      },
      map,
      this.hub,
    );
    // Chết do quái = luân hồi: lưu hồ sơ ở trạng thái Hoàng Tuyền, cộng Duyên, gửi màn hình Hoàng Tuyền
    w.reincarnate = true;
    w.bossMoves = bossMovesOf(process.env); // bộ chiêu trùm (mục 42): mặc định tắt, `BOSS_MOVES=on` để bật
    // Gặp chặn đường (mục 52): mặc định TẮT (`w.ambush` null), `AMBUSH=on` để bật; ngẫu nhiên do phòng tiêm vào (system không gọi `Math.random` trong tick)
    if (ambushOn(process.env)) {
      w.ambush = createAmbushRuntime({
        random: Math.random,
        exemptBots: !isProduction(process.env),
        ambushBots: ambushBotsOn(process.env),
        minPotions: ambushMinPotions(process.env),
      });
      // "Chiến": lập vé, mở phòng đấu trường solo rồi đưa người chơi sang (chỗ cũ luôn được lưu trước)
      w.ambush.startFight = (world, sid, offer) => {
        const ticket = openTicket(world, sid, offer);
        if (!ticket) return false;
        void this.openArenaRoom(world, sid, ticket);
        return true;
      };
    }
    w.onArenaExit = (sid) => void this.exitArenaRoom(sid);
    w.onLimbo = (sid) => void this.enterLimbo(sid);
    w.onSocial = (soulKey, fn) => void this.socialUpdate(soulKey, fn); // M9: thống kê PK / thành tựu theo linh hồn (`systems/social.ts`)
    // Tông môn (M3.6): dịch vụ dùng chung (`SECTS=off` gỡ gấp); lưu hồ sơ NGAY khi chuyển Linh thạch sang kho
    w.sectService = WorldRoom.sectService();
    w.sectEarnWarmup = WorldRoom.sectEarnWarmup;
    w.sectNewLifeLockMs = newLifeLockMsOf(process.env); // cờ kiếp mới chưa được rút (mặc định tắt)
    // Nhật ký kiểm toán (M4 2.4): chỉ ghi khi `startAudit` đã bật ở index.ts
    w.audit = audit;
    w.auditCoinMin = auditCoinThreshold(process.env);
    w.onSaveNow = async (sid) => {
      const p = this.state.players.get(sid);
      const c = w.ctrl.get(sid);
      // Đang qua cổng: `persist` bỏ qua (bản ghi của cổng đã giữ ví cũ) nên KHÔNG được coi là đã lưu
      if (!p || !c || c.travelling) return false;
      try {
        await this.persist(p, c);
        return true;
      } catch (e) {
        console.error("save failed (sect)", e);
        return false;
      }
    };
    // Bí cảnh (4b): tạo phòng cho run mới, đưa người vào phòng bí cảnh, đưa người về Lạc Hà
    w.onDungeonOpen = (run) => void this.openDungeonRoom(w, run);
    w.onDungeonEnter = (sid, run) => void this.enterDungeonRoom(sid, run);
    w.onDungeonExit = (sid) => void this.exitDungeonRoom(sid);
    return w;
  }

  /** Giới hạn tần suất tin nhắn, theo sessionId */
  private limiters = new Map<string, RateLimiter>();

  /** Thời gian chờ kết nối lại (giây). Test ghi đè để không phải đợi 20 giây. */
  static reconnectGraceS = RECONNECT_GRACE_S;

  /** Người đang chờ kết nối lại, theo sessionId (#116) */
  private ghosts = new Map<string, Ghost>();

  /**
   * Gửi tin nhắn có vị trí cho những người chơi trong vùng nhìn quanh (x, y). `reach` là đoạn hiệu ứng còn
   * vươn xa hơn điểm xuất phát (kiếm khí bay `range` px): người ở xa điểm xuất phát vẫn có thể thấy đoạn cuối.
   */
  private sendNear(x: number, y: number, reach: number, type: string, msg: unknown) {
    this.world.interest.forEachNear(this.world, x, y, VIEW_ENTER + reach, (sid) =>
      this.sendTo(sid, type, msg),
    );
  }

  /** Gửi tin nhắn riêng cho một người chơi */
  private sendTo(sid: string, type: string, msg: unknown) {
    this.clients.find((c) => c.sessionId === sid)?.send(type, msg);
  }

  /**
   * `options.mapId` do `defineRooms` đặt cho từng tên phòng (tuỳ chọn của handler ghi đè tuỳ chọn client, nên client
   * không đổi được bản đồ của phòng). Bỏ trống là bản đồ mặc định (phòng đăng ký tay không qua `defineRooms`).
   */
  onCreate(options?: { mapId?: unknown; runId?: unknown }) {
    const wanted = options?.mapId === undefined ? DEFAULT_MAP_ID : options.mapId;
    const map = getMap(wanted);
    if (!map) throw new Error(`Phòng thế giới cấu hình bản đồ không tồn tại: ${String(wanted)}`);
    this.mapId = map.def.id;
    // Phòng bí cảnh chỉ do server mở cho đúng một run còn hiệu lực (docs/THIET_KE_BI_CANH.md mục 4.2). Kiểm TRƯỚC khi dựng
    // thế giới: ném lỗi ở đây thì không rò một `World` vào `Hub.worlds`. `joinOrCreate` của client (kể cả tên phòng đúng)
    // không có `runId` hợp lệ nên bị từ chối tại đây.
    const run = isDungeonMap(this.mapId) ? this.claimRun(options?.runId) : null;
    // Phòng ĐẤU TRƯỜNG chặn đường (mục 52): cũng chỉ do server mở cho đúng một vé còn hiệu lực (`ambushId`), kiểm TRƯỚC khi dựng thế giới
    const ticket = isArenaMap(this.mapId) ? this.claimTicket((options as any)?.ambushId) : null;
    this.world = this.createWorld(map);
    this.world.roomId = this.roomId;
    this.removeChatSink = this.hub.addChatSink((msg) => this.broadcast("chat", msg));
    this.setPatchRate(TICK_MS);
    this.setSimulationInterval((dt) => this.update(dt), TICK_MS);
    if (run) spawnDungeonMonsters(this.world);
    else if (!ticket) {
      spawnInitial(this.world); // đấu trường: kẻ địch do `createArena` đặt, không sinh tự nhiên
      // Phòng thường nhận người vào với toạ độ đã lưu (`safeSpot` kiểm "tới được từ trấn"): dựng sẵn mặt nạ đi bộ ở đây, cạnh việc làm ấm lưới quái, để lần vào ĐẦU TIÊN không trễ ~15-25 ms trong `onJoin`
      warmWalkReach(this.world.map);
    }
    this.clock.setInterval(() => this.saveAll(), SAVE_EVERY_MS);
    if (run) {
      // Quái nhỏ dọn một lần (không hồi sinh); phòng trống thì huỷ (`autoDispose` bật ở lần vào đầu tiên: bật ngay bây giờ
      // thì Colyseus huỷ phòng chưa có ai sau 1 giây, trước khi thành viên kịp bấm "Vào")
      this.world.runId = run.id;
      this.maxClients = dungeonOf(run.dungeonId)?.partyMax ?? this.maxClients;
      this.clock.setInterval(() => this.watchRun(), 1000);
    } else if (ticket) {
      // Đấu trường: MỘT người, quái không sinh lại; phòng chưa ai vào mà vé hết hạn thì tự đóng (`autoDispose` bật ở lần vào đầu tiên, như bí cảnh)
      createArena(this.world, ticket);
      this.maxClients = 1;
      this.clock.setInterval(() => this.watchArena(), 1000);
    } else {
      this.clock.setInterval(() => topUpMonsters(this.world), MONSTER_RESPAWN_MS);
    }

    // Mọi tin nhắn đi qua this.on: giới hạn tần suất trước, rồi mới tới system.
    // Kiểu dữ liệu (m có thể là bất cứ thứ gì client gửi) do từng system tự kiểm tra.
    const w = this.world;
    this.on<InputMsg>("input", (sid, m) => queueInput(w, sid, m));
    this.on<AttackMsg>("attack", (sid, m) => slash(w, sid, m?.angle));
    this.on<SkillMsg>("skill", (sid, m) => {
      if (m?.id === "sword") swordQi(w, sid, m.angle);
    });
    this.on<MeditateMsg>("meditate", (sid, m) => setMeditating(w, sid, m?.on === true));
    this.on("breakthrough", (sid) => breakthrough(w, sid));
    this.on(SKILL_MSG.cast, (sid, m) => cast(w, sid, m));
    this.on(SKILL_MSG.slot, (sid, m) => skillSlot(w, sid, m));
    this.on<ChatMsg>("chat", (sid, m) => chat(w, sid, m?.text));
    this.on<UseItemMsg>("useItem", (sid, m) => useItem(w, sid, m?.slot));
    this.on<PickupMsg>("pickup", (sid, m) => pickup(w, sid, m?.lootId));
    this.on<DropItemMsg>("dropItem", (sid, m) => dropItem(w, sid, m?.slot, m?.qty));
    this.on<TalkMsg>("talk", (sid, m) => talk(w, sid, m?.npcId));
    this.on<QuestAcceptMsg>("questAccept", (sid, m) => acceptQuest(w, sid, m?.questId));
    this.on<QuestTurnInMsg>("questTurnIn", (sid, m) => turnInQuest(w, sid, m?.questId));
    this.on<QuestAbandonMsg>("questAbandon", (sid, m) => abandonQuest(w, sid, m?.questId));
    this.on<TradeMsg>("trade", (sid, m) => trade(w, sid, m?.tradeId));
    this.on<EquipMsg>("equip", (sid, m) => equip(w, sid, m?.slot));
    this.on<UnequipMsg>("unequip", (sid, m) => unequip(w, sid, m?.slot));
    this.on<CraftMsg>("craft", (sid, m) => craft(w, sid, m?.recipeId));
    this.on<BuyMsg>("buy", (sid, m) => buy(w, sid, m?.npcId, m?.itemId, m?.qty));
    this.on<SellMsg>("sell", (sid, m) => sell(w, sid, m?.npcId, m?.slot, m?.qty));
    this.on<PartyInviteMsg>("partyInvite", (sid, m) => partyInvite(w, sid, m?.name));
    this.on<PartyAnswerMsg>("partyAccept", (sid, m) => partyAnswer(w, sid, m?.from, true));
    this.on<PartyAnswerMsg>("partyDecline", (sid, m) => partyAnswer(w, sid, m?.from, false));
    this.on("partyLeave", (sid) => partyLeave(w, sid));
    // Nhịp tim ứng dụng (M4.2b, shared/src/heartbeat.ts): chỉ lặp lại số hữu hạn `t` để client phát hiện socket nửa mở
    this.on(HEARTBEAT_MSG.ping, (sid, m) => {
      const ping = parsePing(m);
      if (ping) this.sendTo(sid, HEARTBEAT_MSG.pong, { t: ping.t } satisfies PongMsg);
    });
    this.on<PartyKickMsg>("partyKick", (sid, m) => partyKick(w, sid, m?.name));
    this.on<TravelMsg>("travel", (sid, m) => void this.travel(sid, m?.portalId));
    // Bí cảnh: mở / vào / từ chối đi qua mọi phòng thường (người ở bản đồ nào cũng nhận được lời mời); rời chỉ trong bí cảnh
    this.on(DUNGEON_MSG.open, (sid, m) => void openDungeon(w, sid, m));
    this.on(DUNGEON_MSG.enter, (sid, m) => void enterDungeon(w, sid, m));
    this.on(DUNGEON_MSG.decline, (sid, m) => declineDungeon(w, sid, m));
    this.on(DUNGEON_MSG.leave, (sid) => leaveDungeon(w, sid));
    // PK thách đấu (docs/THIET_KE_PK.md): hai người cùng phòng, hai bên đồng ý
    this.on(DUEL_MSG.challenge, (sid, m) => duelChallenge(w, sid, m));
    this.on(DUEL_MSG.accept, (sid, m) => duelAnswer(w, sid, m, true));
    this.on(DUEL_MSG.decline, (sid, m) => duelAnswer(w, sid, m, false));
    this.on(DUEL_MSG.yield, (sid) => duelYield(w, sid));
    // Gặp chặn đường (mục 52, docs/THIET_KE_CHAN_DUONG.md): chỉ chọn / xác nhận đã thấy; mọi kết quả do máy chủ quyết, không tin số nào từ client
    this.on(AMBUSH_MSG.seen, (sid, m) => onAmbushSeen(w, sid, m));
    this.on(AMBUSH_MSG.choose, (sid, m) => void onAmbushChoose(w, sid, m));
    this.on(AMBUSH_MSG.flee, (sid, m) => void onAmbushFlee(w, sid, m)); // bỏ chạy giữa trận (đấu trường)
    // Tông môn (docs/THIET_KE_TONG_MON.md): gắn với linh hồn, chung mọi phòng; thao tác bất đồng bộ (kho lưu)
    this.on(SECT_MSG.create, (sid, m) => void sectCreate(w, sid, m));
    this.on(SECT_MSG.invite, (sid, m) => void sectInvite(w, sid, m));
    this.on(SECT_MSG.accept, (sid, m) => void sectAnswer(w, sid, m, true));
    this.on(SECT_MSG.decline, (sid, m) => void sectAnswer(w, sid, m, false));
    this.on(SECT_MSG.leave, (sid) => void sectLeave(w, sid));
    this.on(SECT_MSG.kick, (sid, m) => void sectKick(w, sid, m));
    this.on(SECT_MSG.rank, (sid, m) => void sectRank(w, sid, m));
    this.on(SECT_MSG.transfer, (sid, m) => void sectTransfer(w, sid, m));
    this.on(SECT_MSG.disband, (sid) => void sectDisband(w, sid));
    this.on(SECT_MSG.motd, (sid, m) => void sectMotd(w, sid, m));
    this.on(SECT_MSG.deposit, (sid, m) => void sectDeposit(w, sid, m));
    this.on(SECT_MSG.withdraw, (sid, m) => void sectWithdraw(w, sid, m));
    this.on(SECT_MSG.hallGet, (sid, m) => void sectHallGet(w, sid, m));
    this.on(SOCIAL_MSG.achievementsGet, (sid) => this.sendAchievements(sid)); // sổ thành tựu (M9.5): chỉ chủ, từ bản chân linh đang giữ
    this.on(SOCIAL_MSG.titleSet, (sid, m) => void this.titleSet(sid, m));
    // Bảng xếp hạng (M9.3): tra bản chụp trong bộ nhớ (không I/O), chỉ cho người hỏi
    this.on(SOCIAL_MSG.boardsGet, (sid, m) => {
      const board = parseBoardsGet(m);
      if (board === null) return;
      const view = WorldRoom.leaderboards?.view(
        board,
        this.state.players.get(sid)?.name ?? null,
        this.world.ctrl.get(sid)?.identity.soulKey ?? null,
      ) ?? {
        board,
        rows: [],
        mine: { rank: null, reason: "none" as const },
        ageMs: 0,
      };
      this.sendTo(sid, SOCIAL_MSG.boards, view);
    });
    // Trùm thế giới (M9.4): trả MỘT tin trạng thái (đang diễn ra / sắp tới / không có lịch) cho người ở BẤT KỲ phòng nào; không tải, chỉ đọc sổ trong bộ nhớ
    this.on(SOCIAL_MSG.worldBossGet, (sid) =>
      this.sendTo(sid, SOCIAL_MSG.worldBoss, worldBossStatus(this.world, sid)),
    );
    this.on(SECT_MSG.questAccept, (sid, m) => void sectQuestAccept(w, sid, m));
    this.on(SECT_MSG.questTurnIn, (sid, m) => void sectQuestTurnIn(w, sid, m));
    this.on(SECT_MSG.shopBuy, (sid, m) => void sectShopBuy(w, sid, m));
    this.on(SECT_MSG.vaultDeposit, (sid, m) => void sectVaultDeposit(w, sid, m));
    this.on(SECT_MSG.vaultWithdraw, (sid, m) => void sectVaultWithdraw(w, sid, m));
    this.on(SECT_MSG.vaultPolicy, (sid, m) => void sectVaultPolicy(w, sid, m));
    this.on<SoulBuyMsg>("soulBuy", (sid, m) => void this.soulBuy(sid, m?.id));
    this.on<RebirthMsg>("rebirth", (sid, m) => void this.rebirth(sid, m));
    // Loại tin nhắn không đăng ký: bỏ qua, tính là spam
    this.onMessage("*", (c) => this.reject(c));
  }

  /** Đăng ký tin nhắn có giới hạn tần suất. Lỗi trong fn được onUncaughtException bắt, phòng không sập. */
  private on<T>(type: string, fn: (sid: string, m: T | undefined) => void) {
    this.onMessage(type, (c: Client, m: unknown) => {
      const lim = this.limiters.get(c.sessionId);
      if (!lim) return;
      // Mục 33: MỌI tin hợp lệ là bằng chứng còn sống (kể cả tin bị giới hạn tần suất); đang là hồn lìa xác vì im lặng thì ra khỏi trạng thái đó (kèm hộ thể)
      const ctl = this.world.ctrl.get(c.sessionId);
      if (ctl) heard(this.world, c.sessionId, ctl);
      const v = lim.check(type, Date.now());
      if (v === "kick") return this.kick(c);
      // Tin nhắn hợp lệ luôn là object (hoặc không có, vd "breakthrough"); m có thể là bất cứ gì
      if (v === "ok") fn(c.sessionId, m !== null && typeof m === "object" ? (m as T) : undefined);
    });
  }

  private reject(c: Client) {
    if (this.limiters.get(c.sessionId)?.reject(Date.now()) === "kick") this.kick(c);
  }

  private kick(c: Client) {
    if (!this.limiters.delete(c.sessionId)) return; // đã ngắt rồi
    const name = this.state.players.get(c.sessionId)?.name ?? c.sessionId;
    console.warn(`[spam] ngắt kết nối ${name}: gửi quá nhiều tin nhắn`);
    audit("room.spam_kick", { name, map: this.mapId });
    c.leave(CLOSE_SPAM, "Gửi quá nhiều thao tác.");
  }

  /**
   * Lỗi trong tin nhắn / vòng lặp / hẹn giờ: ghi log và chạy tiếp, không để một tin nhắn lỗi làm sập cả server.
   * Có hàm này thì Colyseus tự bọc try/catch quanh mọi onMessage, setSimulationInterval, clock.
   */
  onUncaughtException(err: RoomException<this>, methodName: string) {
    if (err.cause instanceof ServerError) return; // từ chối có chủ đích (vd sai tên ở onAuth), không phải lỗi
    console.error(`[lỗi] ${methodName}:`, err.cause ?? err);
  }

  // ---------------- Vào / ra ----------------

  async onAuth(_client: Client, options: JoinOptions, context?: { headers?: IncomingHttpHeaders }) {
    // Chống dùng ké (mục 59): xin chỗ từ một trang LẠ (Origin có mặt mà không được phép) bị từ chối TRƯỚC mọi thứ khác. Không có Origin (bot, công cụ) thì qua.
    if (WorldRoom.originPolicy && !headersAllowed(WorldRoom.originPolicy, context?.headers))
      throw new ServerError(403, "origin_not_allowed");
    // Phiên bản trước mọi thứ khác (kể cả xác thực): client quá cũ nhận lời nhắn "hãy tải lại", không lộ gì về nhân vật nào
    if (isClientOutdated(options?.v, WorldRoom.minProtocol))
      throw new ServerError(JOIN_CLIENT_OUTDATED, clientOutdatedMessage(WorldRoom.minProtocol));
    const accounts = WorldRoom.auth;
    if (accounts) return this.authByToken(accounts, options);
    return this.authLegacy(options);
  }

  /** Chế độ cũ: đạo hiệu + mã bí mật (client tự sinh, giữ ở trình duyệt). */
  private async authLegacy(options: JoinOptions) {
    const name = cleanName(options?.name);
    if (!name) throw new ServerError(400, "Tên cần 2–16 ký tự, chỉ gồm chữ, số và khoảng trắng.");
    const secret = typeof options?.secret === "string" ? options.secret : "";
    if (secret.length < 16 || secret.length > MAX_SECRET_LEN)
      throw new ServerError(400, "Thiếu mã nhân vật.");
    // Chỉ chính chủ (đúng mã) được huỷ chờ của nhân vật đang rớt mạng
    const owns = (c: PlayerCtrl) => c.save.secretHash === hashSecret(secret);
    await this.takeSeat(name, owns);
    await this.takeArena(name, owns); // TRƯỚC khi nạp hồ sơ: đấu trường trả giá + lưu xong thì hồ sơ nạp mới là bản mới nhất
    const identity = legacyIdentity(name);
    const existing = await this.players.load(name);
    if (existing) {
      if (existing.secretHash !== hashSecret(secret)) {
        audit("join.denied", { reason: "bad_secret", name });
        throw new ServerError(403, "Tên này đã có người dùng.");
      }
      return this.resume(existing, identity);
    }
    return this.createFresh(name, hashSecret(secret), identity);
  }

  /**
   * Chế độ tài khoản: token phiên -> tài khoản -> nhân vật (docs/THIET_KE_TAI_KHOAN.md mục 5). Không đọc `name` /
   * `secret` của client. Chưa có đạo hiệu thì báo `JOIN_NEED_CHARACTER` để client gọi `POST /api/character`.
   */
  private async authByToken(accounts: AuthService, options: JoinOptions) {
    const account = await accounts.resolve(options?.token);
    if (!account) {
      audit("join.denied", { reason: "bad_token" });
      throw new ServerError(JOIN_BAD_TOKEN, "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
    }
    if (account.name === undefined)
      throw new ServerError(JOIN_NEED_CHARACTER, "Tài khoản chưa có đạo hiệu.");
    const name = account.name;
    // Chỉ chính tài khoản đó được huỷ chờ của nhân vật đang rớt mạng
    const owns = (c: PlayerCtrl) => c.identity.accountId === account.id;
    await this.takeSeat(name, owns);
    await this.takeArena(name, owns);
    const identity: Identity = { name, soulKey: account.id, accountId: account.id };
    const existing = await this.players.load(name);
    if (existing) return this.resume(existing, identity);
    // Hồ sơ chưa có (lần vào đầu sau khi chọn đạo hiệu): tạo ở đây. Mã bí mật ngẫu nhiên không ai biết, để không ai
    // vào hoặc nhận nhân vật này bằng đường tên + mã bí mật.
    return this.createFresh(name, hashSecret(randomBytes(32).toString("hex")), identity);
  }

  /**
   * Tên đang có người chơi trong phòng. Chỉ một trường hợp được vào tiếp: chính chủ (`owns` đúng) đăng nhập lại khi nhân
   * vật đang chờ kết nối lại sau khi rớt mạng (tải lại trang, mất token) thì huỷ chờ rồi vào, thay vì bị 409 tới hết thời
   * gian chờ. Người đang kết nối thật hoặc không đúng chủ vẫn bị từ chối.
   */
  private async takeSeat(name: string, owns: (c: PlayerCtrl) => boolean) {
    const taken: Ghost[] = [];
    let busy = false;
    this.state.players.forEach((p, sid) => {
      if (p.name.toLowerCase() !== name.toLowerCase()) return;
      const ghost = this.ghosts.get(sid);
      const c = this.world.ctrl.get(sid);
      if (ghost && c && owns(c)) taken.push(ghost);
      else busy = true;
    });
    if (busy) throw new ServerError(409, "Nhân vật này đang ở trong game.");
    for (const g of taken) g.cancel();
    for (const g of taken) await g.done; // đợi lưu xong rồi mới nạp file
  }

  /** Nhân vật đã có hồ sơ: chỉ vào đúng phòng của bản đồ nó đang ở. */
  private async resume(existing: SavedPlayer, identity: Identity) {
    // Phòng bí cảnh: file lưu để ở bản đồ vào (Lạc Hà), không bao giờ ở bí cảnh; chỉ cần có tên trong danh sách thành viên
    if (this.world.runId !== null) {
      this.checkRunSeat(identity.name);
      return { save: existing, identity, soul: await this.soulOf(existing, identity) };
    }
    // Đấu trường chặn đường: hồ sơ ghi CHỖ CŨ (bản đồ thường); chỉ cần đúng vé của người này (mục 52)
    if (this.world.arena !== null) {
      this.checkArenaSeat(identity.name);
      return { save: existing, identity, soul: await this.soulOf(existing, identity) };
    }
    // Phòng thường: người đang có vé đấu trường (đang ở đấu trường hoặc đang được đưa sang) KHÔNG được vào chỗ cũ lúc này (không hai bản của một nhân vật; không đăng nhập đè)

    // Chỉ sau khi xác thực xong mới tiết lộ nhân vật đang ở bản đồ nào. Server quyết định bản đồ; `options.mapId`
    // chỉ là gợi ý chọn phòng, sai thì báo bản đồ đúng để client vào lại (shared/src/travel.ts).
    const home = mapIdOf(existing);
    if (home !== this.mapId) throw new ServerError(JOIN_WRONG_MAP, wrongMapMessage(home));
    return { save: existing, identity, soul: await this.soulOf(existing, identity) };
  }

  /** Nhân vật mới luôn bắt đầu ở bản đồ mặc định (không tạo file ở phòng sai). */
  private async createFresh(name: string, secretHash: string, identity: Identity) {
    // Phòng bí cảnh không tạo nhân vật: người chưa có hồ sơ không thể là thành viên của run nào
    if (this.world.runId !== null || this.world.arena !== null)
      throw new ServerError(JOIN_NOT_IN_RUN, "Không có lần vào bí cảnh nào cho ngươi.");
    if (this.mapId !== DEFAULT_MAP_ID)
      throw new ServerError(JOIN_WRONG_MAP, wrongMapMessage(DEFAULT_MAP_ID));
    const now = new Date().toISOString();
    const fresh: SavedPlayer = {
      name,
      secretHash,
      realm: 0,
      tier: 0,
      exp: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.players.save(fresh);
    return { save: fresh, identity, soul: await this.soulOf(fresh, identity) };
  }

  /**
   * Chân linh của người chơi: có rồi thì nạp, chưa có thì tạo (kiếp 1, 0 Duyên, thành tựu cao nhất = bậc hiện tại).
   * Người chơi có từ trước khi có luân hồi được di chuyển lặng lẽ ở đây, vào game lần đầu.
   */
  private soulOf(save: SavedPlayer, identity: Identity): Promise<Soul> {
    const realm = Math.min(save.realm, REALMS.length - 1);
    const tier = Math.min(save.tier, REALMS[realm].tiers.length - 1);
    const store = WorldRoom.souls ?? defaultSoulStore();
    return store.create(identity.soulKey, (s) => ({
      ...s,
      best: { step: stepOf(realm, tier), realm, tier },
    }));
  }

  onJoin(
    client: Client,
    _options: JoinOptions,
    auth: { save: SavedPlayer; identity: Identity; soul: Soul },
  ) {
    const { save, identity, soul } = auth;
    const p = new Player();
    p.name = save.name;
    p.realm = Math.min(save.realm, REALMS.length - 1);
    p.tier = Math.min(save.tier, REALMS[p.realm].tiers.length - 1);
    p.exp = save.exp;
    // Phòng bí cảnh: luôn xuất hiện ở cổng vào (toạ độ trong file là của Lạc Hà, vô nghĩa ở đây)
    const inRun = this.world.runId !== null || this.world.arena !== null;
    const spot = inRun ? safeSpot(this.world.map) : safeSpot(this.world.map, save.x, save.y);
    // Vị trí đã lưu không dùng được (bản đồ đổi, hồ sơ rơi vào tường): ghi nhật ký kiểm toán (không có dữ liệu cá nhân: chỉ bản đồ, khoảng dời, về đâu)
    if (spot.moved)
      audit("map.relocate", { map: this.mapId, dist: spot.moved.dist, to: spot.moved.to });
    p.x = spot.x;
    p.y = spot.y;
    syncPublicPos(p); // người khác thấy ngay chỗ vào, không phải (0, 0)
    setEquipment(p, sanitizeEquipment(save.equipment, save.realm)); // trước applyStats: chỉ số gồm trang bị (ô chưa mở ở cảnh giới này bị bỏ)
    const origin = sanitizeOrigin(save.origin);
    const mult = originMult(origin);
    applyStats(p, true, mult);
    const limbo = sanitizeLimbo(save.limbo); // đang ở Hoàng Tuyền: nằm "chết" cho tới khi đầu thai
    if (limbo) p.dead = true;
    // Hệ số tu vi thử nghiệm (mục 34): chỉ khi đạo hiệu có trong cấu hình; CHỈ ở phía máy chủ (không vào state), ghi audit mỗi lần vào phòng
    const testMult = testExpMultFor(WorldRoom.testExpMult, p.name);
    if (testMult > 1) audit("test.exp_mult", { name: p.name, mult: testMult, map: this.mapId });
    p.title = wornTitle(soul.social); // danh hiệu đang đeo (M9.5), chỉ khi còn hợp lệ
    this.state.players.set(client.sessionId, p);
    this.world.ctrl.set(client.sessionId, {
      testExpMult: testMult > 1 ? testMult : undefined,
      save,
      identity,
      // Mục 33: client có khai nhịp gửi tin (`JoinOptions.beatMs`) thì máy chủ áp luật im lặng cho người này; client cũ thì không
      beatMs: parseBeatMs(_options?.beatMs) ?? undefined,
      proto: protoOf(_options?.v), // chặn đường chỉ kích hoạt cho client đủ mới (`AMBUSH_MIN_PROTOCOL`)
      lastHeardAt: Date.now(),
      inputs: [],
      moveBudget: 4,
      posPhase: this.world.ctrl.size % POS_SYNC_EVERY_TICKS,
      nextSlash: 0,
      nextSword: 0,
      nextBreak: 0,
      nextChat: 0,
      lastHitAt: 0,
      deadAt: 0,
      inv: sanitizeInventory(save.inventory),
      itemCd: new Map(),
      quests: sanitizeQuests(save.quests),
      skills: sanitizeSkillBook(save.skills, p.realm),
      skillCd: [0, 0, 0, 0],
      lifeId: sanitizeLifeId(save.lifeId),
      life: sanitizeLife(save.life),
      limbo,
      origin,
      mult,
      soul,
      coin: addCoin(0, save.coin ?? 0),
      frac: { hp: 0, mp: 0, exp: 0, expAt: 0 },
    });
    this.limiters.set(client.sessionId, new RateLimiter(Date.now()));
    // Vùng nhìn: phải gán client.view trong onJoin, trước khi Colyseus gửi state đầy đủ
    client.view = new StateView();
    this.world.interest.join(this.world, client.sessionId, client.view);
    this.state.online = this.state.players.size;
    sendInv(this.world, client.sessionId);
    sendQuests(this.world, client.sessionId);
    sendSkills(this.world, client.sessionId, true); // ÉP kèm `mastery` (`{}` nếu chưa có): client hiện thanh luyện 0 / N ngay, không đợi điểm đầu tiên (B, #1112)
    sendWallet(this.world, client.sessionId);
    this.world.events.soul(client.sessionId, soulView(soul)); // HUD ghi "Kiếp N" ngay từ lúc vào (không chỉ sau khi mua)
    // Thành tựu (M9.5): ghi nhận MỘT lần cho cả nhóm (bản đồ đã tới, kiếp, cảnh giới cao nhất); chân linh cũ được cấp thành tựu đến hạn ngay lần vào đầu tiên
    if (WorldRoom.achievements)
      trackSocial(
        this.world,
        client.sessionId,
        [`map:${this.mapId}`, 1],
        ["kiep", soul.kiep],
        ["realm_step", Math.max(soul.best.step, stepOf(p.realm, p.tier))],
      );
    applyReturnGrace(this.world, client.sessionId, this.world.ctrl.get(client.sessionId)!); // vừa được đưa về từ đấu trường chặn đường: bảo hộ 5 giây
    partyResync(this.world, client.sessionId); // vừa qua cổng từ bản đồ khác: vẫn ở trong đội, nhận đội hình ngay
    void sectOnJoin(this.world, client.sessionId); // tông môn theo linh hồn: nhận ảnh chụp + đặt biệt hiệu (bất đồng bộ)
    this.world.events.sys(`${p.name} (${realmLabel(p.realm, p.tier)}) đã nhập thế.`);
    this.sendWorldBoss(client.sessionId); // trùm thế giới (M9.4): vào giữa lúc báo trước / đang diễn ra thì biết ngay
    if (limbo) void this.resumeLimbo(client.sessionId); // vào lại giữa lúc ở Hoàng Tuyền: cộng Duyên nếu còn thiếu, hiện lại màn hình
    if (inRun) {
      const run = runOfWorld(this.world);
      if (run) memberJoined(this.world, run, save.name.toLowerCase());
      if (this.world.arena) arenaJoined(this.world, client.sessionId); // đồng hồ trận bắt đầu, chốt giá giữa trận
      this.autoDispose = true; // có người rồi: trống thì huỷ phòng ngay
    }
  }

  async onLeave(client: Client, consented?: boolean) {
    const sid = client.sessionId;
    const p = this.state.players.get(sid);
    const c = this.world.ctrl.get(sid);
    // Đã đưa ra khỏi phòng khi đi qua cổng (WorldRoom.travel đã lưu và dọn): không còn gì để giữ chờ hay dọn
    if (!p && !c) return void this.limiters.delete(sid);
    // Rớt mạng bất thường (không phải chủ động thoát; bị ngắt vì spam thì `limiters` đã xoá): giữ nhân vật chờ
    // kết nối lại. Dữ liệu theo sessionId nên giữ nguyên; Colyseus chuyển StateView sang kết nối mới.
    let resolveDone = () => {};
    // Phòng bí cảnh KHÔNG giữ chỗ chờ nối lại: hồ sơ luôn ghi bản đồ vào (Lạc Hà) nên người rớt mạng đăng nhập lại sẽ vào
    // PHÒNG KHÁC (Lạc Hà); một "hồn lìa xác" còn ở đây sẽ ghi đè hồ sơ mới bằng dữ liệu cũ khi hết hạn chờ. Rớt mạng = rời
    // run (lưu ngay, gỡ khỏi phòng); nhân vật không có gì để mất vì không còn ở trong bí cảnh.
    if (p && c && consented === false && this.limiters.has(sid) && this.world.runId === null) {
      const done = new Promise<void>((r) => (resolveDone = r));
      const wait = this.allowReconnection(client, WorldRoom.reconnectGraceS);
      // allowReconnection trả về Promise đã bị từ chối (không có `reject`) khi phòng đang đóng: khi đó không có gì để huỷ
      if (typeof wait.reject === "function")
        this.ghosts.set(sid, { cancel: () => wait.reject(false), done });
      c.inputs.length = 0; // không còn ai điều khiển: bỏ input đang chờ
      // Hồn lìa xác: bất tử trong lúc chờ, quái bỏ mục tiêu ngay (rớt mạng không được làm mất kiếp)
      c.silent = false; // đã im lặng từ trước (socket nay mới đóng) thì từ đây là hồn lìa xác THẬT: tickNetGuard bỏ qua, nối lại mới ra
      const droppedAt = this.world.now;
      this.world.ghosts.add(sid);
      forgetTarget(this.world, sid);
      // Nhật ký kiểm toán (mục 33, chính sách chỉ ghi nhận): rớt socket giữa trận hay lúc yên, có đang thách đấu không
      audit("net.drop", {
        name: p.name,
        map: this.mapId,
        hp: Math.round(p.hp),
        maxHp: p.maxHp,
        recentlyHit: droppedAt - c.lastHitAt < 5000,
        duel: this.world.duels.has(sid),
        silentMs: Math.max(0, Date.now() - (c.lastHeardAt ?? Date.now())),
      });
      // Lưu ngay, phòng khi server sập trong lúc chờ
      await this.persist(p, c).catch((e) => console.error("save failed", e));
      try {
        await wait;
        // Nối lại được: client nhận Room mới nên gửi lại dữ liệu riêng (tin `party` tới theo nhịp snapshot)
        this.ghosts.delete(sid);
        reconnected(this.world, sid, c, Math.max(0, Date.now() - droppedAt)); // hết hồn lìa xác, hộ thể 3 giây + quái mất mục tiêu (mục 33)
        sendInv(this.world, sid);
        sendQuests(this.world, sid);
        sendSkills(this.world, sid, true); // nối lại: phòng mới, client mới nhận lại cả điểm luyện
        sendStatus(this.world, sid); // client mất hệ số tốc độ sau rớt mạng sẽ bị kéo giật nếu không gửi lại
        sendWallet(this.world, sid);
        ambushResend(this.world, sid); // đang giữa hộp thoại chặn đường: gửi LẠI (cùng id, thời gian còn thật) cho Room mới
        arenaResend(this.world, sid); // đang giữa trận ở đấu trường: gửi LẠI trạng thái (hoặc kết cục) cho Room mới
        this.sendWorldBoss(sid); // trùm thế giới (M9.4): sự kiện bắt đầu / kết thúc lúc rớt mạng thì Room mới vẫn biết (thưởng + `ended` không bị lỡ)
        resolveDone();
        return;
      } catch {
        // hết hạn, bị huỷ (đăng nhập lại) hoặc phòng đang đóng: dọn dẹp như rời phòng
      }
    }
    try {
      if (p && c) {
        arenaDrop(this.world, sid); // thoát / rớt khỏi ĐẤU TRƯỜNG lúc đang đánh = giá giữa trận bằng tu vi, TRƯỚC lần lưu cuối
        ambushDropOffer(this.world, sid); // thoát / rớt quá hạn lúc hộp thoại chặn đường mở = bỏ chạy bằng tu vi (chống né giá), TRƯỚC khi lưu cuối
        await this.persist(p, c).catch((e) => console.error("save failed", e));
        this.world.events.sys(`${p.name} đã rời đi.`);
      }
      this.dropPlayer(sid);
    } finally {
      this.ghosts.delete(sid);
      this.world.ghosts.delete(sid);
      resolveDone();
    }
  }

  /** Gửi cho `sid` trạng thái trùm thế giới hiện tại (chỉ khi có lịch và chưa tắt): lúc vào phòng và lúc nối lại sau rớt mạng. */
  private sendWorldBoss(sid: string) {
    if (!this.world.hub.worldBoss.active) return;
    this.sendTo(sid, SOCIAL_MSG.worldBoss, worldBossStatus(this.world, sid));
  }

  /**
   * Gỡ người chơi khỏi thế giới (không lưu): dùng khi rời phòng và khi đi qua cổng.
   * `keepParty`: đi qua cổng thì vẫn ở trong đội (đội dùng chung giữa các phòng); rời hẳn thì rời đội.
   */
  private dropPlayer(sid: string, keepParty = false) {
    if (!keepParty) partyDrop(this.world, sid); // trước khi xoá khỏi state: báo cho đội, dọn lời mời
    duelDrop(this.world, sid); // huỷ trận đang đấu (hoà) và dọn lời mời / hồi chiêu; trước khi xoá khỏi state
    sectDrop(this.world, sid); // không còn trực tuyến ở phòng này (đi qua cổng cũng vậy: phòng mới sẽ báo lại); trước khi xoá ctrl
    const leaver = this.state.players.get(sid);
    const run = leaver ? runOfWorld(this.world) : undefined;
    if (leaver && run) memberLeft(this.world, run, leaver.name.toLowerCase());
    this.state.players.delete(sid);
    this.state.online = this.state.players.size;
    this.world.interest.leave(sid);
    this.world.ctrl.delete(sid);
    this.limiters.delete(sid);
    forgetTarget(this.world, sid);
    releaseLootOwner(this.world, sid);
  }

  /**
   * Đi qua cổng (shared/src/travel.ts): kiểm (`planTravel`), LƯU nhân vật với bản đồ đích + chỗ xuất hiện, đưa ra khỏi
   * phòng (không chờ nối lại), gửi `travelTo`, đóng kết nối. Lưu xong mới gửi: client vào phòng đích sẽ nạp đúng bản ghi đó.
   * Đội giữ nguyên khi qua cổng (sổ đội dùng chung giữa các phòng, khoá theo đạo hiệu).
   */
  private async travel(sid: string, portalId: unknown) {
    const plan = planTravel(this.world, sid, portalId);
    if (plan) await this.handOff(sid, plan);
  }

  /**
   * Đưa người chơi sang phòng của bản đồ khác: lưu nhân vật với bản đồ đích + chỗ xuất hiện, gỡ khỏi phòng này (không chờ
   * nối lại), gửi `travelTo`, đóng kết nối. Dùng cho `travel` (qua cổng) và `rebirth` (đầu thai luôn về Lạc Hà).
   */
  private async handOff(
    sid: string,
    plan: { mapId: string; x: number; y: number; allowDead?: boolean },
    dest?: { mapId: string; roomId?: string; valid?: () => boolean },
  ): Promise<boolean> {
    const p = this.state.players.get(sid);
    const c = this.world.ctrl.get(sid);
    if (!p || !c) return false;
    // Rời đấu trường lúc ĐANG đánh bằng đường nào khác ngoài về chỗ cũ sau kết cục (nhận lời mời bí cảnh, đầu thai...) = bỏ trận: trả giá giữa trận bằng tu vi TRƯỚC khi lưu, không né
    // được giá bằng cách chuyển phòng (review B ở #1091)
    if (this.world.arena?.phase === "fighting") arenaDrop(this.world, sid);
    c.travelling = true;
    c.inputs.length = 0;
    try {
      await this.persist(p, c, { mapId: plan.mapId, x: plan.x, y: plan.y });
    } catch (e) {
      console.error("save failed (travel)", e);
      c.travelling = false;
      this.world.events.toast(sid, { text: "Cổng chưa mở được, thử lại sau.", tone: "bad" });
      return false;
    }
    // Trong lúc lưu có thể chết, rớt mạng hoặc bị ngắt: huỷ, ghi lại bản đồ của phòng này (tự chữa)
    const client = this.clients.find((x) => x.sessionId === sid);
    const here = this.state.players.get(sid);
    // `allowDead`: chết THẬT trong đấu trường chặn đường (mục 53): người chơi đang nằm ở Hoàng Tuyền và ĐƯỢC đưa về phòng của chỗ cũ (hồ sơ đã ghi bản ghi Hoàng Tuyền); chết do dịp khác trong lúc lưu vẫn huỷ
    if (!client || !here || (here.dead && !plan.allowDead) || this.ghosts.has(sid)) {
      c.travelling = false;
      if (here) await this.persist(here, c).catch((e) => console.error("save failed", e));
      return false;
    }
    // Đích là một phòng tạm (bí cảnh): run có thể đã hết hạn / bị huỷ trong lúc lưu. Huỷ, ghi lại chỗ hiện tại (tự chữa)
    if (dest?.valid && !dest.valid()) {
      c.travelling = false;
      await this.persist(here, c).catch((e) => console.error("save failed", e));
      this.world.events.toast(sid, { text: "Lời mời đã hết hạn.", tone: "bad" });
      return false;
    }
    this.dropPlayer(sid, true);
    client.send("travelTo", {
      mapId: dest?.mapId ?? plan.mapId,
      ...(dest?.roomId ? { roomId: dest.roomId } : {}),
    } satisfies TravelToMsg);
    client.leave(CLOSE_TRAVEL);
    return true;
  }

  // ---------------- Bí cảnh (docs/THIET_KE_BI_CANH.md mục 4) ----------------

  /** `onCreate` của phòng bí cảnh: nhận run `runId` (còn `gathering`, chưa có phòng, đúng bí cảnh) hoặc ném lỗi. */
  private claimRun(runId: unknown): Run {
    const run = this.hub.runs.get(runId);
    const def = dungeonOfMap(this.mapId);
    if (
      !run ||
      !def ||
      run.dungeonId !== def.id ||
      run.roomId !== null ||
      run.phase !== "gathering"
    )
      throw new Error("Phòng bí cảnh chỉ do server mở cho một run còn hiệu lực");
    run.roomId = this.roomId;
    return run;
  }

  /** `onAuth` của phòng bí cảnh: tên phải có trong danh sách thành viên của run, run còn mở và đúng phòng này. */
  private checkRunSeat(name: string) {
    const run = runOfWorld(this.world);
    const m = run?.members.get(name.toLowerCase());
    if (
      !run ||
      !m ||
      m.status === "declined" ||
      run.roomId !== this.roomId ||
      (run.phase !== "gathering" && run.phase !== "running")
    )
      throw new ServerError(JOIN_NOT_IN_RUN, "Không có lần vào bí cảnh nào cho ngươi.");
  }

  /** Phòng bí cảnh không còn run (hết hạn mời, đã dọn) và chưa có ai: đóng, không để phòng treo. */
  private watchRun() {
    if (this.world.runId === null || this.hub.runs.get(this.world.runId)) return;
    if (this.clients.length === 0) void this.disconnect();
  }

  /** Hook `World.onDungeonOpen`: tạo phòng bí cảnh cho run (chỉ server tạo), xong thì mời thành viên. */
  private async openDungeonRoom(w: World, run: Run) {
    const def = dungeonOf(run.dungeonId);
    if (!def) return runFailed(w, run);
    try {
      const listing = await matchMaker.createRoom(roomNameOf(def.mapId), { runId: run.id });
      runReady(w, run, listing.roomId);
    } catch (e) {
      console.error("[bí cảnh] tạo phòng thất bại", e);
      runFailed(w, run);
    }
  }

  /**
   * Hook `World.onDungeonEnter`: đưa một thành viên sang phòng bí cảnh. Lưu nhân vật với chỗ vào Ở LẠC HÀ (không bao giờ lưu
   * vị trí / bản đồ bí cảnh: server sập hay rớt mạng giữa run thì lần sau đăng nhập về Lạc Hà, không kẹt), rồi gửi
   * `travelTo { mapId bí cảnh, roomId }`: client vào bằng `joinById`.
   */
  private async enterDungeonRoom(sid: string, run: Run) {
    const def = dungeonOf(run.dungeonId);
    const roomId = run.roomId;
    if (!def || !roomId) return;
    const entry = getMap(def.entryMapId) ?? getMap(DEFAULT_MAP_ID)!;
    const spot = safeSpot(entry);
    await this.handOff(
      sid,
      { mapId: entry.def.id, x: spot.x, y: spot.y },
      {
        mapId: def.mapId,
        roomId,
        valid: () =>
          this.hub.runs.get(run.id) === run &&
          (run.phase === "gathering" || run.phase === "running") &&
          this.world.now < run.inviteUntil + 5_000,
      },
    );
  }

  /** Hook `World.onDungeonExit`: đưa một người từ phòng bí cảnh về cổng vào (Lạc Hà). */
  private async exitDungeonRoom(sid: string) {
    const entryId = dungeonOfMap(this.mapId)?.entryMapId ?? DEFAULT_MAP_ID;
    const entry = getMap(entryId) ?? getMap(DEFAULT_MAP_ID)!;
    const spot = safeSpot(entry);
    await this.handOff(sid, { mapId: entry.def.id, x: spot.x, y: spot.y });
  }

  // ---------------- Đấu trường chặn đường (docs/THIET_KE_CHAN_DUONG.md mục 5, `systems/arena.ts`) ----------------

  /** `onCreate` của phòng đấu trường: nhận vé `ambushId` (chưa có phòng, đúng bản đồ, chưa kết thúc) hoặc ném lỗi. */
  private claimTicket(ambushId: unknown): AmbushTicket {
    const t = this.hub.ambushes.get(ambushId);
    if (!t || t.roomId !== null || t.ended || arenaMapIdOf(t.origin.mapId) !== this.mapId)
      throw new Error("Phòng đấu trường chỉ do server mở cho một vé còn hiệu lực");
    t.roomId = this.roomId;
    return t;
  }

  /** `onAuth` của phòng đấu trường: chỉ chủ vé (đúng tên), vé còn trong sổ, đúng phòng này và chưa hết hạn vào phòng. */
  private checkArenaSeat(name: string) {
    const t = this.world.arena?.ticket;
    if (
      !t ||
      t.key !== name.toLowerCase() ||
      t.roomId !== this.roomId ||
      this.hub.ambushes.get(t.id) !== t
    )
      throw new ServerError(JOIN_NOT_IN_RUN, "Không có đấu trường nào cho ngươi.");
  }

  /** Phòng đấu trường chưa có ai mà vé đã hết hạn / bị dọn: đóng, không để phòng treo; vé luôn được dọn khi phòng đóng (`onDispose`). */
  private watchArena() {
    const a = this.world.arena;
    const t = a?.ticket;
    // Chỉ khi CHƯA ai vào (`startedAt === null`): người đã vào mà rớt mạng thì phòng phải chờ nối lại (`allowReconnection`), không được đóng giữa trận
    if (!a || !t || a.startedAt !== null || this.clients.length > 0) return;
    if (this.hub.ambushes.get(t.id) !== t || this.world.now >= t.expiresAt) void this.disconnect();
  }

  /** Báo người chơi vé bị huỷ (không phạt, vào hồi): dọn vé, `ambushEnd { canceled }` để hộp thoại phía client không treo. */
  private abortArena(w: World, sid: string, ticket: AmbushTicket) {
    ticket.ended = true;
    this.hub.ambushes._remove(ticket);
    w.events.ambushEnd(sid, { result: "canceled" });
  }

  /**
   * Mở phòng đấu trường cho vé rồi đưa người chơi sang. Hồ sơ luôn được lưu với CHỖ CŨ (`handOff` ghi bản đồ + toạ độ của vé): sập máy / rớt mạng giữa trận thì lần sau đăng nhập ở chỗ cũ.
   * Không mở được phòng hoặc không đưa sang được thì huỷ vé lặng lẽ (không phạt).
   */
  private async openArenaRoom(w: World, sid: string, ticket: AmbushTicket) {
    const arenaId = arenaMapIdOf(ticket.origin.mapId);
    try {
      const listing = await matchMaker.createRoom(roomNameOf(arenaId), { ambushId: ticket.id });
      ticket.roomId = listing.roomId;
    } catch (e) {
      console.error("[chặn đường] tạo phòng đấu trường thất bại", e);
      return this.abortArena(w, sid, ticket);
    }
    const ok = await this.handOff(
      sid,
      { mapId: ticket.origin.mapId, x: ticket.origin.x, y: ticket.origin.y },
      {
        mapId: arenaId,
        roomId: ticket.roomId!,
        valid: () =>
          this.hub.ambushes.get(ticket.id) === ticket &&
          !ticket.ended &&
          this.world.now < ticket.expiresAt,
      },
    );
    if (!ok) this.abortArena(w, sid, ticket);
  }

  /**
   * Phòng thường: chính chủ (`owns` đúng, như `takeSeat`) đăng nhập khi nhân vật còn vé đấu trường. Đang rớt mạng (hồn lìa xác) ở đấu trường thì HUỶ chờ rồi mới nạp hồ sơ (phòng đấu trường trả giá
   * giữa trận bằng tu vi, LƯU, dọn vé: không để hồ sơ cũ ghi đè hồ sơ mới khi hết hạn chờ); đang kết nối thật hoặc vé chưa có ai thì 409.
   */
  private async takeArena(name: string, owns: (c: PlayerCtrl) => boolean) {
    if (this.world.arena !== null) return; // phòng đấu trường tự kiểm vé ở `checkArenaSeat`
    const t = this.hub.ambushes.ofKey(name.toLowerCase());
    if (!t) return;
    const room = t.roomId
      ? (matchMaker.getLocalRoomById(t.roomId) as WorldRoom | undefined)
      : undefined;
    if (!room || !(await room.evictFromArena(t, owns)))
      throw new ServerError(409, "Nhân vật này đang ở đấu trường chặn đường.");
  }

  /** Gọi từ phòng KHÁC (`takeArena`): đuổi hồn lìa xác của chủ vé khỏi đấu trường này (huỷ chờ, trả giá, lưu, dọn vé). `false` nếu người đó đang kết nối thật hoặc không phải phòng của vé. */
  async evictFromArena(t: AmbushTicket, owns: (c: PlayerCtrl) => boolean): Promise<boolean> {
    if (this.world?.arena?.ticket !== t) return false;
    let sid: string | undefined;
    this.state.players.forEach((p, k) => {
      if (p.name.toLowerCase() === t.key) sid = k;
    });
    if (sid === undefined) return false;
    const g = this.ghosts.get(sid);
    const c = this.world.ctrl.get(sid);
    if (!g || !c || !owns(c)) return false; // đang kết nối thật, hoặc không đúng chủ
    g.cancel();
    await g.done;
    this.hub.ambushes._remove(t);
    return true;
  }

  /** Hook `World.onArenaExit`: đưa người chơi từ đấu trường về CHỖ CŨ của vé; xong thì dọn vé NGAY (người chơi vào lại phòng thường không bị chặn bởi vé cũ). */
  private async exitArenaRoom(sid: string) {
    const t = this.world.arena?.ticket;
    if (!t) return;
    const c = this.world.ctrl.get(sid);
    if (c) c.save = { ...c.save, ambushReturnAt: Date.now() }; // phòng nhận người chơi bảo hộ 5 giây (`applyReturnGrace`); `persist` của `handOff` mang theo
    const ok = await this.handOff(sid, {
      mapId: t.origin.mapId,
      x: t.origin.x,
      y: t.origin.y,
      allowDead: c?.limbo !== undefined, // chết thật ở đấu trường (mục 53): về phòng gốc ở trạng thái Hoàng Tuyền
    });
    if (ok) this.hub.ambushes._remove(t);
  }

  // ---------------- Luân hồi (docs/THIET_KE_LUAN_HOI.md mục 4) ----------------

  private get players(): PlayerStore {
    return WorldRoom.players ?? defaultPlayerStore();
  }

  private get souls(): SoulStore {
    return WorldRoom.souls ?? defaultSoulStore();
  }

  /**
   * Vừa chết thật (hook của World): ghi hồ sơ ở trạng thái Hoàng Tuyền TRƯỚC (thoát game lúc này cũng không giữ lại được gì
   * của kiếp cũ), rồi cộng Duyên, rồi gửi màn hình Hoàng Tuyền. Sập giữa chừng: lần đăng nhập sau chạy tiếp (`resumeLimbo`).
   */
  private async enterLimbo(sid: string) {
    const p = this.state.players.get(sid);
    const c = this.world.ctrl.get(sid);
    if (!p || !c?.limbo) return;
    await this.persist(p, c).catch((e) => console.error("save failed (limbo)", e));
    await this.resumeLimbo(sid);
  }

  /** Cộng Duyên nếu còn thiếu rồi gửi màn hình Hoàng Tuyền; cộng lỗi thì thử lại sau vài giây (người chơi còn trong phòng). */
  private async resumeLimbo(sid: string) {
    const c = this.world.ctrl.get(sid);
    const limbo = c?.limbo;
    if (!c || !limbo) return;
    if (!limbo.credited && !(await this.creditLimbo(sid))) {
      this.clock.setTimeout(() => void this.resumeLimbo(sid), 3000);
      return;
    }
    this.world.events.limbo(sid, {
      summary: limbo.summary,
      soul: soulView(c.soul),
      keepable: limbo.keepable,
      engravable: limbo.engravable,
    });
  }

  /** Cộng Duyên của kiếp vừa qua vào chân linh (idempotent theo `endedLifeId`) và ghi "đã cộng" vào hồ sơ. */
  /**
   * M9: ghi phần xã hội của chân linh `soulKey` (nguyên tử theo chân linh, `SoulStore.update`) NGOÀI tick: áp `fn` lên `Soul.social`, rồi CẤP mọi thành tựu đến hạn + cộng Duyên thưởng
   * (`grantDue`) TRONG CÙNG lần ghi (sập máy không cấp một nửa). Sau đó cập nhật `PlayerCtrl.soul` của người đang trực tuyến cùng chân linh và báo họ (`achievementNew`, toast, `achievements`).
   * Không ghi kho khi KHÔNG đổi gì (dò trên bản chân linh đang giữ: vào phòng mà bộ đếm `max` không tăng thì khỏi tốn một lần ghi tệp). Lỗi chỉ ghi log: mất một lần thống kê còn hơn làm hỏng ván.
   */
  private async socialUpdate(soulKey: string, fn: (s: SoulSocial | undefined) => SoulSocial) {
    try {
      const online = [...this.world.ctrl.values()].find((c) => c.identity.soulKey === soulKey);
      if (online) {
        const next = fn(online.soul.social);
        if (
          next === online.soul.social &&
          (!WorldRoom.achievements || achievementsDue(next).length === 0)
        )
          return;
      }
      let granted: string[] = [];
      const at = new Date().toISOString();
      const soul = await this.souls.update(soulKey, (s) => {
        const base = { ...s, social: fn(s.social) };
        const r = WorldRoom.achievements
          ? grantDue(base, at)
          : { soul: base, granted: [] as string[] }; // gán lại mỗi lần chạy (PostgreSQL có thể thử lại)
        granted = r.granted;
        return r.soul;
      });
      for (const [sid, c] of this.world.ctrl) {
        if (c.identity.soulKey !== soulKey) continue;
        c.soul = soul;
        if (granted.length === 0) continue;
        for (const id of granted) {
          this.sendTo(sid, SOCIAL_MSG.achievementNew, { id });
          const def = ACHIEVEMENT_BY_ID[id];
          if (def)
            this.world.events.toast(sid, { text: `Đạt thành tựu: ${def.name}`, tone: "good" });
        }
        this.sendAchievements(sid);
        this.world.events.soul(sid, soulView(soul)); // Duyên thưởng hiện ngay trên HUD
      }
      if (granted.length > 0)
        audit("achievement.grant", { soul: soulKey, ids: granted.join(","), map: this.mapId });
    } catch (e) {
      console.error("[xã hội] ghi chân linh thất bại", e);
    }
  }

  /** Gửi `achievements` (đúng `Soul.social` rút gọn) cho chủ, từ bản chân linh đang giữ. */
  private sendAchievements(sid: string) {
    const c = this.world.ctrl.get(sid);
    if (c) this.sendTo(sid, SOCIAL_MSG.achievements, achievementsMsgOf(c.soul.social));
  }

  /**
   * `titleSet`: đeo danh hiệu đã mở / gỡ (`id: null`). Kiểm "đã mở" TRONG `SoulStore.update` (trên bản mới nhất, không tin cache). `Player.title` (state công khai) đổi theo kết quả.
   * Hợp đồng: LUÔN gửi lại `achievements` (có `title` hiện tại) sau mỗi tin hợp lệ, thành công hay bị từ chối. Tin sai kiểu bị bỏ không trả lời.
   */
  private async titleSet(sid: string, m: unknown) {
    const msg = parseTitleSet(m);
    const c = this.world.ctrl.get(sid);
    if (!msg || !c) return;
    // Mỗi `SoulStore.update` là MỘT lần ghi tệp (kể cả khi không đổi gì): bỏ qua khi bản đang giữ cho thấy việc này vô ích, khỏi biến tin rác hợp lệ thành tải ghi đĩa.
    // Giới hạn tần suất của tin này đã chặt (`rate-limit.ts`); phần dưới chỉ là lớp thứ hai và KHÔNG thay việc kiểm "đã mở" trong `update` (bản mới nhất là bản quyết định).
    const held = c.soul.social;
    const noop =
      (held?.title ?? null) === msg.id || // đã đeo đúng cái này (hoặc đã gỡ rồi mà gỡ tiếp)
      (msg.id !== null && !unlockedTitles(held).has(msg.id)); // rõ ràng chưa mở: chắc chắn bị từ chối
    if (noop) {
      this.sendAchievements(sid);
      return;
    }
    try {
      c.soul = await this.souls.update(c.identity.soulKey, (s) => {
        if (msg.id !== null && !unlockedTitles(s.social).has(msg.id)) return s; // chưa mở: giữ nguyên
        return { ...s, social: { ...(s.social ?? newSocial()), title: msg.id } };
      });
      const p = this.state.players.get(sid);
      if (p) p.title = wornTitle(c.soul.social);
    } catch (e) {
      console.error("[xã hội] đổi danh hiệu thất bại", e);
    }
    this.sendAchievements(sid);
  }

  private async creditLimbo(sid: string): Promise<boolean> {
    const p = this.state.players.get(sid);
    const c = this.world.ctrl.get(sid);
    const limbo = c?.limbo;
    if (!p || !c || !limbo) return false;
    try {
      c.soul = await this.souls.update(c.identity.soulKey, (s) =>
        creditSoul(s, limbo, new Date().toISOString()),
      );
    } catch (e) {
      console.error("[luân hồi] cộng Duyên thất bại, sẽ thử lại", e);
      return false;
    }
    limbo.credited = true;
    await this.persist(p, c).catch((e) => console.error("save failed (credited)", e));
    return true;
  }

  /** `soulBuy`: mở nấc kế tiếp của một mục ở Tam Sinh Thạch (chỉ ở Hoàng Tuyền, sau khi đã cộng Duyên). */
  private async soulBuy(sid: string, id: unknown) {
    const p = this.state.players.get(sid);
    const c = this.world.ctrl.get(sid);
    if (!p || !c?.limbo?.credited) return;
    try {
      // buyUnlock thuần trong update nguyên tử: trừ Duyên và tăng nấc cùng một lần ghi; hai tin cùng lúc xếp hàng
      c.soul = await this.souls.update(c.identity.soulKey, (s) => {
        const r = buyUnlock(s, id);
        if (!r.ok) throw new BuyRefused(r.reason);
        return r.soul;
      });
      this.world.events.soul(sid, soulView(c.soul));
    } catch (e) {
      if (!(e instanceof BuyRefused))
        return void console.error("[luân hồi] mua mở khóa thất bại", e);
      const text = {
        unknown: "Mục này không có.",
        max: "Mục này đã mở hết.",
        poor: "Duyên mỏng, chưa khắc nổi nét này.",
      }[e.reason];
      this.world.events.toast(sid, { text, tone: "bad" });
    }
  }

  /** Ghi nhật ký lý do một tin `rebirth` không đầu thai được (mục 58: lần trước KHÔNG có dấu vết nào nên không biết vì sao người chơi kẹt). Mỗi lý do một lần mỗi người. */
  private rebirthFail(sid: string, reason: string) {
    const p = this.state.players.get(sid);
    const c = this.world.ctrl.get(sid);
    if (!c) return;
    let seen = this.rebirthFailLogged.get(c);
    if (!seen) this.rebirthFailLogged.set(c, (seen = new Set()));
    if (seen.has(reason)) return;
    seen.add(reason);
    audit("soul.rebirth_fail", { name: p?.name ?? sid, reason, map: this.mapId });
  }

  /**
   * `rebirth`: đầu thai (chỉ ở Hoàng Tuyền): dựng kiếp mới, lưu. Phòng khác Lạc Hà thì đưa về Lạc Hà.
   * KHOAN DUNG (mục 58): lựa chọn sai / vượt ô chỉ bị BỎ phần sai (kèm toast báo), không bao giờ từ chối cả yêu cầu.
   * Mọi nhánh không đầu thai được đều trả lời người chơi (toast) và ghi `soul.rebirth_fail`.
   */
  private async rebirth(sid: string, msg: unknown) {
    const p = this.state.players.get(sid);
    const c = this.world.ctrl.get(sid);
    if (!p || !c) return;
    if (!c.limbo) {
      this.rebirthFail(sid, "no_limbo");
      this.world.events.toast(sid, { text: "Ngươi chưa ở Hoàng Tuyền.", tone: "bad" }); // tone bad: client (màn Hoàng Tuyền) coi là LỜI TỪ CHỐI và hiện lý do bền
      return;
    }
    if (this.rebirthing.has(sid)) return; // đang ghi chân linh (khắc chiêu): tin `rebirth` thứ hai bị bỏ, không đầu thai hai lần
    if (!c.limbo.credited) {
      // Duyên chưa vào sổ (lần cộng trước lỗi, `resumeLimbo` đang thử lại mỗi 3 giây; client chỉ hiện màn Hoàng Tuyền SAU khi đã cộng nên tin này là bất thường)
      this.rebirthFail(sid, "not_credited");
      this.world.events.toast(sid, {
        text: "Linh hồn chưa kịp ghi sổ, chờ một lát.",
        tone: "info",
      });
      return;
    }
    const { choice, notes } = lenientRebirth(c.soul, msg, c.limbo.keepable, c.limbo.engravable);
    if (choice.engrave !== undefined) {
      // Khắc chiêu: GHI chân linh TRƯỚC (kiếp mới dựng từ `Soul.engraved`). Sập giữa chừng thì còn ở Hoàng Tuyền với chân linh đã khắc và đầu thai lại được.
      const engrave = choice.engrave;
      this.rebirthing.add(sid);
      try {
        c.soul = await this.souls.update(c.identity.soulKey, (s) => ({
          ...s,
          engraved: engrave.slice(0, engraveSlotsOf(s.unlocks)),
        }));
      } catch (e) {
        console.error("[luân hồi] khắc chân linh thất bại", e);
        this.rebirthFail(sid, "engrave_write_failed");
        this.world.events.toast(sid, {
          text: "Chưa khắc được chân linh, thử lại sau.",
          tone: "bad",
        });
        return;
      } finally {
        this.rebirthing.delete(sid);
      }
      // người chơi có thể đã rời phòng / hồ sơ đã đổi trong lúc chờ ghi
      if (this.world.ctrl.get(sid) !== c || !c.limbo || !this.state.players.get(sid)) return;
    }
    applyRebirth(this.world, sid, p, c, choice); // đồng bộ: tin `rebirth` thứ hai thấy `c.limbo` đã xoá
    if (notes.length > 0) {
      audit("soul.rebirth_trim", { name: p.name, notes: notes.join("; "), map: this.mapId });
      this.world.events.toast(sid, { text: `Đầu thai: ${notes.join("; ")}.`, tone: "info" });
    }
    if (this.mapId !== DEFAULT_MAP_ID) {
      const spot = safeSpot(getMap(DEFAULT_MAP_ID)!);
      await this.handOff(sid, { mapId: DEFAULT_MAP_ID, x: spot.x, y: spot.y });
    } else {
      await this.persist(p, c).catch((e) => console.error("save failed (rebirth)", e));
    }
  }

  async onDispose() {
    // Phòng bí cảnh đóng: run còn sót (mọi người đã rời, sập giữa chừng) thì xoá để giải phóng thành viên và chỗ ở `MAX_DUNGEON_RUNS`
    const run = this.world ? runOfWorld(this.world) : undefined;
    if (run && run.roomId === this.roomId) this.hub.runs._remove(run);
    // Phòng đấu trường đóng: dọn vé (mọi đường đóng phòng: về chỗ cũ, thoát, hết hạn không ai vào)
    const ticket = this.world?.arena?.ticket;
    if (ticket && ticket.roomId === this.roomId) this.hub.ambushes._remove(ticket);
    this.removeChatSink?.();
    this.removeChatSink = null;
    this.world?.dispose();
    await this.saveAll();
  }

  // ---------------- Lưu nhân vật ----------------

  /**
   * Lưu nhân vật. `at` (chỉ khi đi qua cổng): ghi bản đồ đích + chỗ xuất hiện thay cho phòng và vị trí hiện tại, kèm
   * `travelAt`. Người đang đi qua cổng (`c.travelling`) không bị lưu đè bởi lưu định kỳ / lúc rớt mạng.
   */
  private async persist(p: Player, c: PlayerCtrl, at?: { mapId: string; x: number; y: number }) {
    // Đấu trường chặn đường: hồ sơ LUÔN ghi CHỖ CŨ của vé (bản đồ thường + toạ độ), không bao giờ ghi bản đồ / vị trí đấu trường (không kẹt khi sập máy / rớt mạng giữa trận)
    at ??= this.world.arena?.ticket.origin;
    if (c.travelling && !at) return;
    // Không lưu vị trí trong trấn hoặc lúc trọng thương: lần sau vào thì xuất hiện ở trấn
    // Bí cảnh (phòng tạm): không bao giờ ghi bản đồ / vị trí trong đó, chỉ bản đồ vào (Lạc Hà), không toạ độ (xuất hiện ở trấn)
    const inRun = this.world.runId !== null;
    const pos = at
      ? { x: Math.round(at.x), y: Math.round(at.y) }
      : p.dead || inRun || this.world.map.inTown(p.x, p.y)
        ? {}
        : savePos(this.world.map, p.x, p.y);
    c.save = {
      ...c.save,
      realm: p.realm,
      tier: p.tier,
      exp: Math.floor(p.exp),
      x: undefined,
      y: undefined,
      ...pos,
      inventory: c.inv,
      quests: c.quests,
      skills: c.skills,
      equipment: equipmentOf(p),
      coin: c.coin,
      lifeId: c.lifeId,
      life: { ...c.life, playMs: Math.floor(c.life.playMs) },
      limbo: c.limbo,
      origin: c.origin,
      mapId:
        at?.mapId ??
        (inRun ? (dungeonOfMap(this.mapId)?.entryMapId ?? DEFAULT_MAP_ID) : this.mapId),
      ...(at ? { travelAt: this.world.now } : {}),
    };
    // Đo hàng đợi ghi (M4 3.3): lần ghi chưa xong tính là đang chờ, lỗi tính vào `failed`
    const done = this.hub.writes.begin();
    try {
      await this.players.save(c.save);
      done(true);
    } catch (e) {
      done(false);
      throw e;
    }
  }

  private async saveAll() {
    const jobs: Promise<void>[] = [];
    this.state.players.forEach((p, id) => {
      const c = this.world.ctrl.get(id);
      if (c) jobs.push(this.persist(p, c).catch((e) => console.error("save failed", e)));
    });
    await Promise.all(jobs);
  }

  // ---------------- Vòng lặp chính ----------------

  private update(dtMs: number) {
    this.world.now = Date.now();
    const t0 = performance.now();
    tickWorld(this.world, dtMs);
    this.world.tickStats.record(performance.now() - t0); // chưa gồm mã hoá patch của Colyseus (xem docs/TRIEN_KHAI.md mục 5)
  }
}

/**
 * Tạo sẵn phòng thế giới của các bản đồ có trùm theo giờ trong lịch (M9.4). Phòng Colyseus chỉ sinh khi có người vào lần đầu; bản đồ chưa ai vào thì không có phòng để sinh
 * trùm, mà tin "xuất hiện" đã gửi cho cả máy chủ (sự kiện kết thúc "bỏ chạy" dù trùm chưa từng có). Gọi sau `defineRooms` + `listen`; chỉ tạo bản đồ CHƯA có phòng thường
 * (không phải bí cảnh / đấu trường), nên gọi lại không tạo thêm; phòng chính `autoDispose = false` nên sống tiếp. Không có lịch / `WORLD_BOSS=off` thì không làm gì.
 */
export async function ensureWorldBossRooms(): Promise<void> {
  const book = WorldRoom.hub.worldBoss;
  if (!book.active) return;
  for (const mapId of new Set(book.slots.map((s) => s.mapId))) {
    const has = [...WorldRoom.hub.worlds].some(
      (w) => w.map.def.id === mapId && w.runId === null && w.arena === null,
    );
    if (has) continue;
    try {
      await matchMaker.createRoom(roomNameOf(mapId), {});
    } catch (e) {
      console.error(
        `[trùm thế giới] không tạo được phòng ${mapId}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }
}

/**
 * Đăng ký phòng thế giới: mỗi bản đồ một phòng với tên phòng riêng (`roomNameOf`, shared/src/travel.ts).
 * Dùng chung cho `index.ts` và test tích hợp để cấu hình không lệch nhau.
 */
export function defineRooms(gameServer: Server) {
  // Bốn bản đồ thường đọc từ TỆP Tiled (shared/maps, docs/THIET_KE_BAN_DO_TILED.md): nhận TRƯỚC khi đăng ký phòng / dựng `World` đầu tiên (lát cắt S2)
  adoptTiledMapFiles();
  for (const m of MAPS) gameServer.define(roomNameOf(m.id), WorldRoom, { mapId: m.id });
  // Bí cảnh: có tên phòng nhưng client không tạo được (`onCreate` đòi `runId` hợp lệ do server cấp); vào bằng `joinById`
  for (const m of DUNGEON_MAPS) gameServer.define(roomNameOf(m.id), WorldRoom, { mapId: m.id });
  // Đấu trường chặn đường (mục 52): cũng chỉ do server mở cho một vé (`onCreate` đòi `ambushId` hợp lệ); vào bằng `joinById`
  for (const m of ARENA_MAPS) gameServer.define(roomNameOf(m.id), WorldRoom, { mapId: m.id });
}
