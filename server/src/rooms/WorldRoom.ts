// Phòng thế giới: vào / ra phòng, lưu nhân vật, nối tin nhắn với các system.
// Logic game nằm trong ../systems/*, trạng thái dùng chung trong ../world.ts.
import { StateView } from "@colyseus/schema";
import { randomBytes } from "node:crypto";
import { Room, Client, ServerError, matchMaker, type RoomException, type Server } from "colyseus";
import {
  TICK_MS,
  MAX_PLAYERS_PER_ROOM,
  MONSTER_RESPAWN_MS,
  DEFAULT_MAP_ID,
  MAPS,
  JOIN_WRONG_MAP,
  JOIN_BAD_TOKEN,
  JOIN_NEED_CHARACTER,
  DUNGEON_MSG,
  DUEL_MSG,
  SECT_MSG,
  DUNGEON_MAPS,
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
  soulView,
  validateRebirth,
  DEFAULT_MAP,
  cleanName,
} from "@tien-gioi/shared";
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
import { POS_SYNC_EVERY_TICKS, queueInput, safeSpot, syncPublicPos } from "../systems/movement";
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
import { sendWallet } from "../systems/wallet";
import { buy, sell } from "../systems/shop";
import { abandonQuest, acceptQuest, craft, talk, trade, turnInQuest } from "../systems/npc";
import { equip, equipmentOf, sanitizeEquipment, setEquipment, unequip } from "../systems/equipment";
import { tickWorld } from "../systems/tick";
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
import { RateLimiter } from "../rate-limit";
import { defaultHub, type Hub } from "../hub";

const SAVE_EVERY_MS = 30_000;
/** Mã đóng kết nối khi spam tin nhắn (client hiện "mất kết nối") */
export const CLOSE_SPAM = 4429;
/** Mã đóng kết nối sau khi đã đưa người chơi qua cổng (như thoát chủ động: client không hiện "mất kết nối") */
export const CLOSE_TRAVEL = 4000;
/** Mã nhân vật dài hơn mức này thì từ chối luôn (client tạo mã 32 ký tự) */
const MAX_SECRET_LEN = 256;
/** Giây giữ nhân vật chờ kết nối lại khi rớt mạng bất thường (#116) */
export const RECONNECT_GRACE_S = 20;

/** Người chơi vừa rớt mạng, nhân vật vẫn ở trong thế giới chờ kết nối lại */
interface Ghost {
  /** Huỷ chờ: onLeave chạy tiếp phần dọn dẹp như khi rời phòng */
  cancel: () => void;
  /** Xong khi onLeave đã dọn xong (đã lưu, đã xoá khỏi state) */
  done: Promise<void>;
}

export class WorldRoom extends Room<WorldState> {
  maxClients = MAX_PLAYERS_PER_ROOM;
  autoDispose = false; // thế giới luôn sống, kể cả khi không có ai
  state = new WorldState();

  /** Kho chân linh (file JSON; bước 3 thay bằng PostgreSQL). Test ghi đè để cô lập. */
  static players: PlayerStore | null = null; // null: `defaultPlayerStore()` (file JSON)
  static souls: SoulStore | null = null; // null: `defaultSoulStore()` (dựng lười, đọc DATA_DIR lúc dùng)
  /**
   * Dịch vụ tài khoản khi chạy `AUTH_MODE=account` (đặt ở `index.ts`): vào phòng bằng `JoinOptions.token`, BỎ QUA `name` /
   * `secret`. `null`: chế độ cũ (tên + mã bí mật).
   */
  static auth: AuthService | null = null;
  /**
   * Dịch vụ tông môn (đặt ở `index.ts` theo `STORE`). `null`: dùng kho tệp mặc định (`defaultSectStore`, dựng lười). `SECTS=off`
   * (biến môi trường) gỡ tính năng: không có dịch vụ, mọi tin tông môn bị từ chối.
   */
  static sects: SectService | null = null;
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
        fx: (msg) => this.sendNear(msg.x, msg.y, "range" in msg ? msg.range : 0, "fx", msg),
        dmg: (msg) => this.sendNear(msg.x, msg.y, 0, "dmg", msg),
        sys: (text) =>
          this.broadcast("chat", { from: "Thiên Đạo", text, sys: true } satisfies ChatOut),
        // Chat người chơi là của CẢ SERVER (mọi bản đồ / phòng); thông báo hệ thống (`sys`) chỉ trong phòng
        chat: (from, text) => this.hub.chat({ from, text } satisfies ChatOut),
        toast: (sid, msg) => this.sendTo(sid, "toast", msg),
        inv: (sid, msg) => this.sendTo(sid, "inv", msg),
        quests: (sid, msg) => this.sendTo(sid, "quests", msg),
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
      },
      map,
      this.hub,
    );
    // Chết do quái = luân hồi: lưu hồ sơ ở trạng thái Hoàng Tuyền, cộng Duyên, gửi màn hình Hoàng Tuyền
    w.reincarnate = true;
    w.onLimbo = (sid) => void this.enterLimbo(sid);
    // Tông môn (M3.6): dịch vụ dùng chung (`SECTS=off` gỡ gấp); lưu hồ sơ NGAY khi chuyển Linh thạch sang kho
    w.sectService = WorldRoom.sectService();
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
    this.world = this.createWorld(map);
    this.removeChatSink = this.hub.addChatSink((msg) => this.broadcast("chat", msg));
    this.setPatchRate(TICK_MS);
    this.setSimulationInterval((dt) => this.update(dt), TICK_MS);
    if (run) spawnDungeonMonsters(this.world);
    else spawnInitial(this.world);
    this.clock.setInterval(() => this.saveAll(), SAVE_EVERY_MS);
    if (run) {
      // Quái nhỏ dọn một lần (không hồi sinh); phòng trống thì huỷ (`autoDispose` bật ở lần vào đầu tiên: bật ngay bây giờ
      // thì Colyseus huỷ phòng chưa có ai sau 1 giây, trước khi thành viên kịp bấm "Vào")
      this.world.runId = run.id;
      this.maxClients = dungeonOf(run.dungeonId)?.partyMax ?? this.maxClients;
      this.clock.setInterval(() => this.watchRun(), 1000);
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

  async onAuth(_client: Client, options: JoinOptions) {
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
    await this.takeSeat(name, (c) => c.save.secretHash === hashSecret(secret));
    const identity = legacyIdentity(name);
    const existing = await this.players.load(name);
    if (existing) {
      if (existing.secretHash !== hashSecret(secret))
        throw new ServerError(403, "Tên này đã có người dùng.");
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
    if (!account)
      throw new ServerError(JOIN_BAD_TOKEN, "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
    if (account.name === undefined)
      throw new ServerError(JOIN_NEED_CHARACTER, "Tài khoản chưa có đạo hiệu.");
    const name = account.name;
    // Chỉ chính tài khoản đó được huỷ chờ của nhân vật đang rớt mạng
    await this.takeSeat(name, (c) => c.identity.accountId === account.id);
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
    // Chỉ sau khi xác thực xong mới tiết lộ nhân vật đang ở bản đồ nào. Server quyết định bản đồ; `options.mapId`
    // chỉ là gợi ý chọn phòng, sai thì báo bản đồ đúng để client vào lại (shared/src/travel.ts).
    const home = mapIdOf(existing);
    if (home !== this.mapId) throw new ServerError(JOIN_WRONG_MAP, wrongMapMessage(home));
    return { save: existing, identity, soul: await this.soulOf(existing, identity) };
  }

  /** Nhân vật mới luôn bắt đầu ở bản đồ mặc định (không tạo file ở phòng sai). */
  private async createFresh(name: string, secretHash: string, identity: Identity) {
    // Phòng bí cảnh không tạo nhân vật: người chưa có hồ sơ không thể là thành viên của run nào
    if (this.world.runId !== null)
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
    const inRun = this.world.runId !== null;
    const spot = inRun ? safeSpot(this.world.map) : safeSpot(this.world.map, save.x, save.y);
    p.x = spot.x;
    p.y = spot.y;
    syncPublicPos(p); // người khác thấy ngay chỗ vào, không phải (0, 0)
    setEquipment(p, sanitizeEquipment(save.equipment)); // trước applyStats: chỉ số gồm trang bị
    const origin = sanitizeOrigin(save.origin);
    const mult = originMult(origin);
    applyStats(p, true, mult);
    const limbo = sanitizeLimbo(save.limbo); // đang ở Hoàng Tuyền: nằm "chết" cho tới khi đầu thai
    if (limbo) p.dead = true;
    this.state.players.set(client.sessionId, p);
    this.world.ctrl.set(client.sessionId, {
      save,
      identity,
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
    sendWallet(this.world, client.sessionId);
    this.world.events.soul(client.sessionId, soulView(soul)); // HUD ghi "Kiếp N" ngay từ lúc vào (không chỉ sau khi mua)
    partyResync(this.world, client.sessionId); // vừa qua cổng từ bản đồ khác: vẫn ở trong đội, nhận đội hình ngay
    void sectOnJoin(this.world, client.sessionId); // tông môn theo linh hồn: nhận ảnh chụp + đặt biệt hiệu (bất đồng bộ)
    this.world.events.sys(`${p.name} (${realmLabel(p.realm, p.tier)}) đã nhập thế.`);
    if (limbo) void this.resumeLimbo(client.sessionId); // vào lại giữa lúc ở Hoàng Tuyền: cộng Duyên nếu còn thiếu, hiện lại màn hình
    if (inRun) {
      const run = runOfWorld(this.world);
      if (run) memberJoined(this.world, run, save.name.toLowerCase());
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
      this.world.ghosts.add(sid);
      forgetTarget(this.world, sid);
      // Lưu ngay, phòng khi server sập trong lúc chờ
      await this.persist(p, c).catch((e) => console.error("save failed", e));
      try {
        await wait;
        // Nối lại được: client nhận Room mới nên gửi lại dữ liệu riêng (tin `party` tới theo nhịp snapshot)
        this.ghosts.delete(sid);
        this.world.ghosts.delete(sid);
        sendInv(this.world, sid);
        sendQuests(this.world, sid);
        sendWallet(this.world, sid);
        resolveDone();
        return;
      } catch {
        // hết hạn, bị huỷ (đăng nhập lại) hoặc phòng đang đóng: dọn dẹp như rời phòng
      }
    }
    try {
      if (p && c) {
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
    plan: { mapId: string; x: number; y: number },
    dest?: { mapId: string; roomId?: string; valid?: () => boolean },
  ) {
    const p = this.state.players.get(sid);
    const c = this.world.ctrl.get(sid);
    if (!p || !c) return;
    c.travelling = true;
    c.inputs.length = 0;
    try {
      await this.persist(p, c, { mapId: plan.mapId, x: plan.x, y: plan.y });
    } catch (e) {
      console.error("save failed (travel)", e);
      c.travelling = false;
      this.world.events.toast(sid, { text: "Cổng chưa mở được, thử lại sau.", tone: "bad" });
      return;
    }
    // Trong lúc lưu có thể chết, rớt mạng hoặc bị ngắt: huỷ, ghi lại bản đồ của phòng này (tự chữa)
    const client = this.clients.find((x) => x.sessionId === sid);
    const here = this.state.players.get(sid);
    if (!client || !here || here.dead || this.ghosts.has(sid)) {
      c.travelling = false;
      if (here) await this.persist(here, c).catch((e) => console.error("save failed", e));
      return;
    }
    // Đích là một phòng tạm (bí cảnh): run có thể đã hết hạn / bị huỷ trong lúc lưu. Huỷ, ghi lại chỗ hiện tại (tự chữa)
    if (dest?.valid && !dest.valid()) {
      c.travelling = false;
      await this.persist(here, c).catch((e) => console.error("save failed", e));
      this.world.events.toast(sid, { text: "Lời mời đã hết hạn.", tone: "bad" });
      return;
    }
    this.dropPlayer(sid, true);
    client.send("travelTo", {
      mapId: dest?.mapId ?? plan.mapId,
      ...(dest?.roomId ? { roomId: dest.roomId } : {}),
    } satisfies TravelToMsg);
    client.leave(CLOSE_TRAVEL);
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
    const entry = getMap(def.entryMapId) ?? DEFAULT_MAP;
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
    const entry = getMap(entryId) ?? DEFAULT_MAP;
    const spot = safeSpot(entry);
    await this.handOff(sid, { mapId: entry.def.id, x: spot.x, y: spot.y });
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
    });
  }

  /** Cộng Duyên của kiếp vừa qua vào chân linh (idempotent theo `endedLifeId`) và ghi "đã cộng" vào hồ sơ. */
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

  /** `rebirth`: đầu thai (chỉ ở Hoàng Tuyền, sau khi đã cộng Duyên): kiểm lựa chọn, dựng kiếp mới, lưu. Phòng khác Lạc Hà thì đưa về Lạc Hà. */
  private async rebirth(sid: string, msg: unknown) {
    const p = this.state.players.get(sid);
    const c = this.world.ctrl.get(sid);
    if (!p || !c?.limbo) return;
    if (!c.limbo.credited) {
      this.world.events.toast(sid, {
        text: "Linh hồn chưa kịp ghi sổ, chờ một lát.",
        tone: "info",
      });
      return;
    }
    const choice = validateRebirth(c.soul, msg, c.limbo.keepable);
    if (!choice) {
      this.world.events.toast(sid, { text: "Lựa chọn đầu thai không hợp lệ.", tone: "bad" });
      return;
    }
    applyRebirth(this.world, sid, p, c, choice); // đồng bộ: tin `rebirth` thứ hai thấy `c.limbo` đã xoá
    if (this.mapId !== DEFAULT_MAP_ID) {
      const spot = safeSpot(DEFAULT_MAP);
      await this.handOff(sid, { mapId: DEFAULT_MAP_ID, x: spot.x, y: spot.y });
    } else {
      await this.persist(p, c).catch((e) => console.error("save failed (rebirth)", e));
    }
  }

  async onDispose() {
    // Phòng bí cảnh đóng: run còn sót (mọi người đã rời, sập giữa chừng) thì xoá để giải phóng thành viên và chỗ ở `MAX_DUNGEON_RUNS`
    const run = this.world ? runOfWorld(this.world) : undefined;
    if (run && run.roomId === this.roomId) this.hub.runs._remove(run);
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
    if (c.travelling && !at) return;
    // Không lưu vị trí trong trấn hoặc lúc trọng thương: lần sau vào thì xuất hiện ở trấn
    // Bí cảnh (phòng tạm): không bao giờ ghi bản đồ / vị trí trong đó, chỉ bản đồ vào (Lạc Hà), không toạ độ (xuất hiện ở trấn)
    const inRun = this.world.runId !== null;
    const pos = at
      ? { x: Math.round(at.x), y: Math.round(at.y) }
      : p.dead || inRun || this.world.map.inTown(p.x, p.y)
        ? {}
        : { x: Math.round(p.x), y: Math.round(p.y) };
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
    await this.players.save(c.save);
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
    tickWorld(this.world, dtMs);
  }
}

/**
 * Đăng ký phòng thế giới: mỗi bản đồ một phòng với tên phòng riêng (`roomNameOf`, shared/src/travel.ts).
 * Dùng chung cho `index.ts` và test tích hợp để cấu hình không lệch nhau.
 */
export function defineRooms(gameServer: Server) {
  for (const m of MAPS) gameServer.define(roomNameOf(m.id), WorldRoom, { mapId: m.id });
  // Bí cảnh: có tên phòng nhưng client không tạo được (`onCreate` đòi `runId` hợp lệ do server cấp); vào bằng `joinById`
  for (const m of DUNGEON_MAPS) gameServer.define(roomNameOf(m.id), WorldRoom, { mapId: m.id });
}
