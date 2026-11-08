// Phòng thế giới: vào / ra phòng, lưu nhân vật, nối tin nhắn với các system.
// Logic game nằm trong ../systems/*, trạng thái dùng chung trong ../world.ts.
import { Room, Client, ServerError } from "colyseus";
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
import { queueInput, applyInputs, safeSpot } from "../systems/movement";
import { slash, swordQi, tickRespawn } from "../systems/combat";
import { spawnInitial, topUpMonsters, tickMonsters, forgetTarget } from "../systems/monsters";
import { applyStats, breakthrough, setMeditating, tickRecovery } from "../systems/progression";
import { chat } from "../systems/chat";
import { sanitizeInventory, sendInv, useItem } from "../systems/inventory";
import { dropItem, pickup, releaseLootOwner, tickLoot } from "../systems/loot";
import { sanitizeQuests, sendQuests } from "../systems/quests";
import { abandonQuest, acceptQuest, talk, trade, turnInQuest } from "../systems/npc";

const SAVE_EVERY_MS = 30_000;

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

    const w = this.world;
    this.onMessage("input", (c, m: InputMsg) => queueInput(w, c.sessionId, m));
    this.onMessage("attack", (c, m: AttackMsg) => slash(w, c.sessionId, m?.angle));
    this.onMessage("skill", (c, m: SkillMsg) => {
      if (m?.id === "sword") swordQi(w, c.sessionId, m.angle);
    });
    this.onMessage("meditate", (c, m: MeditateMsg) => setMeditating(w, c.sessionId, !!m?.on));
    this.onMessage("breakthrough", (c) => breakthrough(w, c.sessionId));
    this.onMessage("chat", (c, m: ChatMsg) => chat(w, c.sessionId, m?.text));
    this.onMessage("useItem", (c, m: UseItemMsg) => useItem(w, c.sessionId, m?.slot));
    this.onMessage("pickup", (c, m: PickupMsg) => pickup(w, c.sessionId, m?.lootId));
    this.onMessage("dropItem", (c, m: DropItemMsg) => dropItem(w, c.sessionId, m?.slot, m?.qty));
    this.onMessage("talk", (c, m: TalkMsg) => talk(w, c.sessionId, m?.npcId));
    this.onMessage("questAccept", (c, m: QuestAcceptMsg) =>
      acceptQuest(w, c.sessionId, m?.questId),
    );
    this.onMessage("questTurnIn", (c, m: QuestTurnInMsg) =>
      turnInQuest(w, c.sessionId, m?.questId),
    );
    this.onMessage("questAbandon", (c, m: QuestAbandonMsg) =>
      abandonQuest(w, c.sessionId, m?.questId),
    );
    this.onMessage("trade", (c, m: TradeMsg) => trade(w, c.sessionId, m?.tradeId));
  }

  // ---------------- Vào / ra ----------------

  async onAuth(_client: Client, options: JoinOptions) {
    const name = cleanName(options?.name);
    if (!name) throw new ServerError(400, "Tên cần 2–16 ký tự, chỉ gồm chữ, số và khoảng trắng.");
    const secret = typeof options?.secret === "string" ? options.secret : "";
    if (secret.length < 16) throw new ServerError(400, "Thiếu mã nhân vật.");
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
    });
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
    const w = this.world;
    w.now = Date.now();
    const dt = dtMs / 1000;

    this.state.players.forEach((p, sid) => {
      const c = w.ctrl.get(sid);
      if (!c) return;
      if (p.dead) return tickRespawn(w, p, c);
      applyInputs(p, c);
      tickRecovery(w, sid, p, c, dt);
    });

    tickMonsters(w, dt);
    tickLoot(w);
  }
}
