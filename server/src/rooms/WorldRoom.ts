// Phòng thế giới: vào / ra phòng, lưu nhân vật, nối tin nhắn với các system.
// Logic game nằm trong ../systems/*, trạng thái dùng chung trong ../world.ts.
import { Room, Client, ServerError, type RoomException } from "colyseus";
import {
  TICK_MS,
  MAX_PLAYERS_PER_ROOM,
  MONSTER_RESPAWN_MS,
  REALMS,
  inTown,
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
} from "@tien-gioi/shared";
import { WorldState, Player } from "../schema";
import { loadPlayer, savePlayer, hashSecret, cleanName, type SavedPlayer } from "../store";
import { World, type PlayerCtrl } from "../world";
import { queueInput, safeSpot } from "../systems/movement";
import { slash, swordQi } from "../systems/combat";
import { spawnInitial, topUpMonsters, forgetTarget } from "../systems/monsters";
import { applyStats, breakthrough, setMeditating } from "../systems/progression";
import { chat } from "../systems/chat";
import { sanitizeInventory, sendInv, useItem } from "../systems/inventory";
import { dropItem, pickup, releaseLootOwner } from "../systems/loot";
import { sanitizeQuests, sendQuests } from "../systems/quests";
import { abandonQuest, acceptQuest, talk, trade, turnInQuest } from "../systems/npc";
import { tickWorld } from "../systems/tick";
import { RateLimiter } from "../rate-limit";

const SAVE_EVERY_MS = 30_000;
/** Mã đóng kết nối khi spam tin nhắn (client hiện "mất kết nối") */
export const CLOSE_SPAM = 4429;
/** Mã nhân vật dài hơn mức này thì từ chối luôn (client tạo mã 32 ký tự) */
const MAX_SECRET_LEN = 256;

export class WorldRoom extends Room<WorldState> {
  maxClients = MAX_PLAYERS_PER_ROOM;
  autoDispose = false; // thế giới luôn sống, kể cả khi không có ai
  state = new WorldState();

  private world = new World(this.state, {
    fx: (msg) => this.broadcast("fx", msg),
    dmg: (msg) => this.broadcast("dmg", msg),
    sys: (text) => this.broadcast("chat", { from: "Thiên Đạo", text, sys: true } satisfies ChatOut),
    chat: (from, text) => this.broadcast("chat", { from, text } satisfies ChatOut),
    toast: (sid, msg) => this.sendTo(sid, "toast", msg),
    inv: (sid, msg) => this.sendTo(sid, "inv", msg),
    quests: (sid, msg) => this.sendTo(sid, "quests", msg),
    dialog: (sid, msg) => this.sendTo(sid, "dialog", msg),
  });

  /** Giới hạn tần suất tin nhắn, theo sessionId */
  private limiters = new Map<string, RateLimiter>();

  /** Gửi tin nhắn riêng cho một người chơi */
  private sendTo(sid: string, type: string, msg: unknown) {
    this.clients.find((c) => c.sessionId === sid)?.send(type, msg);
  }

  onCreate() {
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
    for (const p of this.state.players.values()) {
      if (p.name.toLowerCase() === name.toLowerCase())
        throw new ServerError(409, "Nhân vật này đang ở trong game.");
    }
    const existing = await loadPlayer(name);
    if (existing) {
      if (existing.secretHash !== hashSecret(secret))
        throw new ServerError(403, "Tên này đã có người dùng.");
      return existing;
    }
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
    return fresh;
  }

  onJoin(client: Client, _options: JoinOptions, save: SavedPlayer) {
    const p = new Player();
    p.name = save.name;
    p.realm = Math.min(save.realm, REALMS.length - 1);
    p.tier = Math.min(save.tier, REALMS[p.realm].tiers.length - 1);
    p.exp = save.exp;
    const spot = safeSpot(save.x, save.y);
    p.x = spot.x;
    p.y = spot.y;
    applyStats(p, true);
    this.state.players.set(client.sessionId, p);
    this.world.ctrl.set(client.sessionId, {
      save,
      inputs: [],
      moveBudget: 4,
      nextSlash: 0,
      nextSword: 0,
      nextBreak: 0,
      nextChat: 0,
      lastHitAt: 0,
      deadAt: 0,
      inv: sanitizeInventory(save.inventory),
      itemCd: new Map(),
      quests: sanitizeQuests(save.quests),
      frac: { hp: 0, mp: 0, exp: 0, expAt: 0 },
    });
    this.limiters.set(client.sessionId, new RateLimiter(Date.now()));
    sendInv(this.world, client.sessionId);
    sendQuests(this.world, client.sessionId);
    this.world.events.sys(`${p.name} (${realmLabel(p.realm, p.tier)}) đã nhập thế.`);
  }

  async onLeave(client: Client) {
    const sid = client.sessionId;
    const p = this.state.players.get(sid);
    const c = this.world.ctrl.get(sid);
    if (p && c) {
      await this.persist(p, c).catch((e) => console.error("save failed", e));
      this.world.events.sys(`${p.name} đã rời đi.`);
    }
    this.state.players.delete(sid);
    this.world.ctrl.delete(sid);
    this.limiters.delete(sid);
    forgetTarget(this.world, sid);
    releaseLootOwner(this.world, sid);
  }

  async onDispose() {
    await this.saveAll();
  }

  // ---------------- Lưu nhân vật ----------------

  private async persist(p: Player, c: PlayerCtrl) {
    // Không lưu vị trí trong trấn hoặc lúc trọng thương: lần sau vào thì xuất hiện ở trấn
    const pos = p.dead || inTown(p.x, p.y) ? {} : { x: Math.round(p.x), y: Math.round(p.y) };
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
