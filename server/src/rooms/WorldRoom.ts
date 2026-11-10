// Phòng thế giới: vào / ra phòng, lưu nhân vật, nối tin nhắn với các system.
// Logic game nằm trong ../systems/*, trạng thái dùng chung trong ../world.ts.
import { StateView } from "@colyseus/schema";
import { Room, Client, ServerError, type RoomException, type Server } from "colyseus";
import {
  TICK_MS,
  MAX_PLAYERS_PER_ROOM,
  MONSTER_RESPAWN_MS,
  DEFAULT_MAP_ID,
  MAPS,
  JOIN_WRONG_MAP,
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
  type GameMap,
  type Soul,
  stepOf,
} from "@tien-gioi/shared";
import { WorldState, Player } from "../schema";
import {
  loadPlayer,
  savePlayer,
  hashSecret,
  cleanName,
  mapIdOf,
  sanitizeLife,
  sanitizeLifeId,
  type SavedPlayer,
} from "../store";
import { defaultSoulStore, soulIdOf, type SoulStore } from "../soul";
import { World, type PlayerCtrl } from "../world";
import { POS_SYNC_EVERY_TICKS, queueInput, safeSpot, syncPublicPos } from "../systems/movement";
import { slash, swordQi } from "../systems/combat";
import { spawnInitial, topUpMonsters, forgetTarget } from "../systems/monsters";
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
import { partyAnswer, partyDrop, partyInvite, partyKick, partyLeave } from "../systems/party";
import { planTravel } from "../systems/travel";
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
  static souls: SoulStore | null = null; // null: `defaultSoulStore()` (dựng lười, đọc DATA_DIR lúc dùng)
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
    return new World(
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
      },
      map,
    );
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
  onCreate(options?: { mapId?: unknown }) {
    const wanted = options?.mapId === undefined ? DEFAULT_MAP_ID : options.mapId;
    const map = getMap(wanted);
    if (!map) throw new Error(`Phòng thế giới cấu hình bản đồ không tồn tại: ${String(wanted)}`);
    this.mapId = map.def.id;
    this.world = this.createWorld(map);
    this.removeChatSink = this.hub.addChatSink((msg) => this.broadcast("chat", msg));
    this.setPatchRate(TICK_MS);
    this.setSimulationInterval((dt) => this.update(dt), TICK_MS);
    spawnInitial(this.world);
    this.clock.setInterval(() => topUpMonsters(this.world), MONSTER_RESPAWN_MS);
    this.clock.setInterval(() => this.saveAll(), SAVE_EVERY_MS);

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
    const name = cleanName(options?.name);
    if (!name) throw new ServerError(400, "Tên cần 2–16 ký tự, chỉ gồm chữ, số và khoảng trắng.");
    const secret = typeof options?.secret === "string" ? options.secret : "";
    if (secret.length < 16 || secret.length > MAX_SECRET_LEN)
      throw new ServerError(400, "Thiếu mã nhân vật.");
    // Tên đang có người chơi. Chỉ một trường hợp được vào tiếp: chính chủ (đúng mã) đăng nhập lại khi nhân vật
    // đang chờ kết nối lại sau khi rớt mạng (tải lại trang, mất token) thì huỷ chờ rồi vào, thay vì bị 409 tới
    // hết thời gian chờ. Người đang kết nối thật hoặc sai mã vẫn bị từ chối.
    const taken: Ghost[] = [];
    let busy = false;
    this.state.players.forEach((p, sid) => {
      if (p.name.toLowerCase() !== name.toLowerCase()) return;
      const ghost = this.ghosts.get(sid);
      if (ghost && this.world.ctrl.get(sid)?.save.secretHash === hashSecret(secret))
        taken.push(ghost);
      else busy = true;
    });
    if (busy) throw new ServerError(409, "Nhân vật này đang ở trong game.");
    for (const g of taken) g.cancel();
    for (const g of taken) await g.done; // đợi lưu xong rồi mới nạp file
    const existing = await loadPlayer(name);
    if (existing) {
      if (existing.secretHash !== hashSecret(secret))
        throw new ServerError(403, "Tên này đã có người dùng.");
      // Chỉ sau khi đúng mã mới tiết lộ nhân vật đang ở bản đồ nào. Server quyết định bản đồ; `options.mapId`
      // chỉ là gợi ý chọn phòng, sai thì báo bản đồ đúng để client vào lại (shared/src/travel.ts).
      const home = mapIdOf(existing);
      if (home !== this.mapId) throw new ServerError(JOIN_WRONG_MAP, wrongMapMessage(home));
      return { save: existing, soul: await this.soulOf(existing) };
    }
    // Nhân vật mới luôn bắt đầu ở bản đồ mặc định (không tạo file ở phòng sai)
    if (this.mapId !== DEFAULT_MAP_ID)
      throw new ServerError(JOIN_WRONG_MAP, wrongMapMessage(DEFAULT_MAP_ID));
    const now = new Date().toISOString();
    const fresh: SavedPlayer = {
      name,
      secretHash: hashSecret(secret),
      realm: 0,
      tier: 0,
      exp: 0,
      createdAt: now,
      updatedAt: now,
    };
    await savePlayer(fresh);
    return { save: fresh, soul: await this.soulOf(fresh) };
  }

  /**
   * Chân linh của người chơi: có rồi thì nạp, chưa có thì tạo (kiếp 1, 0 Duyên, thành tựu cao nhất = bậc hiện tại).
   * Người chơi có từ trước khi có luân hồi được di chuyển lặng lẽ ở đây, vào game lần đầu.
   */
  private soulOf(save: SavedPlayer): Promise<Soul> {
    const realm = Math.min(save.realm, REALMS.length - 1);
    const tier = Math.min(save.tier, REALMS[realm].tiers.length - 1);
    const store = WorldRoom.souls ?? defaultSoulStore();
    return store.create(soulIdOf(save.name), (s) => ({
      ...s,
      best: { step: stepOf(realm, tier), realm, tier },
    }));
  }

  onJoin(client: Client, _options: JoinOptions, auth: { save: SavedPlayer; soul: Soul }) {
    const { save, soul } = auth;
    const p = new Player();
    p.name = save.name;
    p.realm = Math.min(save.realm, REALMS.length - 1);
    p.tier = Math.min(save.tier, REALMS[p.realm].tiers.length - 1);
    p.exp = save.exp;
    const spot = safeSpot(this.world.map, save.x, save.y);
    p.x = spot.x;
    p.y = spot.y;
    syncPublicPos(p); // người khác thấy ngay chỗ vào, không phải (0, 0)
    setEquipment(p, sanitizeEquipment(save.equipment)); // trước applyStats: chỉ số gồm trang bị
    applyStats(p, true);
    this.state.players.set(client.sessionId, p);
    this.world.ctrl.set(client.sessionId, {
      save,
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
    this.world.events.sys(`${p.name} (${realmLabel(p.realm, p.tier)}) đã nhập thế.`);
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
    if (p && c && consented === false && this.limiters.has(sid)) {
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

  /** Gỡ người chơi khỏi thế giới (không lưu): dùng khi rời phòng và khi đi qua cổng. */
  private dropPlayer(sid: string) {
    partyDrop(this.world, sid); // trước khi xoá khỏi state: báo cho đội, dọn lời mời
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
   * Đội tạm thời tan khi qua cổng (đội và chat dùng chung giữa các phòng là việc kế tiếp của #142).
   */
  private async travel(sid: string, portalId: unknown) {
    const plan = planTravel(this.world, sid, portalId);
    const p = this.state.players.get(sid);
    const c = this.world.ctrl.get(sid);
    if (!plan || !p || !c) return;
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
    this.dropPlayer(sid);
    client.send("travelTo", { mapId: plan.mapId } satisfies TravelToMsg);
    client.leave(CLOSE_TRAVEL);
  }

  async onDispose() {
    this.removeChatSink?.();
    this.removeChatSink = null;
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
    const pos = at
      ? { x: Math.round(at.x), y: Math.round(at.y) }
      : p.dead || this.world.map.inTown(p.x, p.y)
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
      mapId: at?.mapId ?? this.mapId,
      ...(at ? { travelAt: this.world.now } : {}),
    };
    await savePlayer(c.save);
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
}
