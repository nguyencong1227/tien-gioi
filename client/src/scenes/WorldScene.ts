import Phaser from "phaser";
import type { Room } from "colyseus.js";
import {
  TILE,
  MAP_W,
  MAP_H,
  MAP_TILES,
  WORLD_W,
  WORLD_H,
  TOWN_PX,
  TICK_MS,
  PLAYER_RADIUS,
  SKILLS,
  MONSTERS,
  MONSTER_BY_ID,
  ITEM_BY_ID,
  DROP_TABLES,
  RARITY_COLORS,
  PICKUP_RANGE,
  NPCS,
  NPC_BY_ID,
  NPC_RANGE,
  QUEST_BY_ID,
  npcMarker,
  questReady,
  moveWithCollision,
  statsFor,
  realmLabel,
  type InputMsg,
  type FxMsg,
  type DmgMsg,
  type ChatOut,
  type ToastMsg,
  type InvMsg,
  type LootView,
  type QuestsMsg,
  type DialogMsg,
} from "@tien-gioi/shared";
import { preloadAssets, makeTextures, dirFromAngle, TILESET_KEY, ATLAS_KEY } from "../textures";
import { ui } from "../ui";
import { sound } from "../audio";
import { joystick, setupJoystick } from "../joystick";

interface Entity {
  root: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  bar: Phaser.GameObjects.Graphics;
  label?: Phaser.GameObjects.Text;
  aura?: Phaser.GameObjects.Ellipse;
  talismanRing?: Phaser.GameObjects.Arc;
  weaponVisual?: Phaser.GameObjects.Graphics;
  animPrefix?: string;
  lastEquipKey?: string;
  tx: number; // vị trí đích (từ server) để nội suy
  ty: number;
  lastLabel?: string;
  slashUntil?: number;
}

interface LootEntity {
  root: Phaser.GameObjects.Container;
  ring: Phaser.GameObjects.Arc;
  icon: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  itemId: string;
  qty: number;
}

interface NpcEntity {
  id: string;
  root: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  nameLabel: Phaser.GameObjects.Text;
  titleLabel: Phaser.GameObjects.Text;
  markerText: Phaser.GameObjects.Text;
  markerAura: Phaser.GameObjects.Arc;
  x: number;
  y: number;
}

const LERP_RATE = 14; // nội suy vị trí người khác / quái

export class WorldScene extends Phaser.Scene {
  private players = new Map<string, Entity>();
  private monsters = new Map<string, Entity>();
  private loots = new Map<string, LootEntity>();
  private npcs = new Map<string, NpcEntity>();
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  // Đoán trước di chuyển của chính mình
  private seq = 0;
  private pending: InputMsg[] = [];
  private predX = 0;
  private predY = 0;
  private hasMe = false;
  private acc = 0;
  private facing = Math.PI / 2;
  private moving = false;

  private nextSlash = 0;
  private nextSword = 0;
  private nearestLootId: string | null = null;
  private closestNpcId: string | null = null;

  // Mũi tên chỉ đường nhiệm vụ
  private navArrow!: Phaser.GameObjects.Container;
  private lastMapDraw = 0;

  constructor(private room: Room) {
    super("world");
  }

  private get state(): any {
    return this.room.state;
  }
  private get sid() {
    return this.room.sessionId;
  }

  preload() {
    preloadAssets(this);
  }

  create() {
    makeTextures(this);

    // Bản đồ (sinh từ seed chung, giống hệt server)
    const data: number[][] = [];
    for (let y = 0; y < MAP_H; y++)
      data.push(Array.from(MAP_TILES.subarray(y * MAP_W, (y + 1) * MAP_W)));
    const map = this.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    const ts = map.addTilesetImage("tiles", TILESET_KEY, TILE, TILE, 0, 0)!;
    map.createLayer(0, ts, 0, 0)!.setDepth(-10);

    this.add
      .text(TOWN_PX.x, TOWN_PX.y - 40, "落霞鎮", {
        fontFamily: '"Noto Serif", Georgia, serif',
        fontSize: "56px",
        color: "#7a3b2e",
      })
      .setOrigin(0.5)
      .setAlpha(0.35)
      .setDepth(-5);
    this.add
      .text(TOWN_PX.x, TOWN_PX.y + 14, "Lạc Hà Trấn · Khu an toàn", {
        fontFamily: '"Noto Serif", Georgia, serif',
        fontSize: "16px",
        color: "#5a4030",
      })
      .setOrigin(0.5)
      .setAlpha(0.6)
      .setDepth(-5);
    this.add
      .circle(TOWN_PX.x, TOWN_PX.y, TOWN_PX.r, 0, 0)
      .setStrokeStyle(2, 0xa31d1d, 0.25)
      .setDepth(-5);

    // Tạo các NPC trong Lạc Hà Trấn
    this.spawnNpcs();

    // Mũi tên chỉ hướng nhiệm vụ xoay quanh người chơi
    this.createNavArrow();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    const fitZoom = () => {
      const w = this.scale.width;
      const h = this.scale.height;
      // Chặn zoom thấp nhất để vùng nhìn (w / zoom <= 1900, h / zoom <= 1100) nằm gọn trong bán kính StateView (1100 px)
      const minZoom = Math.max(0.75, w / 1900, h / 1100);
      const baseZoom = Phaser.Math.Clamp(Math.min(w, h) / 640, 0.75, 1.3);
      cam.setZoom(Math.max(baseZoom, minZoom));
    };
    fitZoom();
    this.scale.on("resize", fitZoom);

    ui.init({
      onUse: (slot) => this.room.send("useItem", { slot }),
      onEquip: (slot) => this.room.send("equip", { slot }),
      onUnequip: (slot) => this.room.send("unequip", { slot }),
      onCraft: (recipeId) => this.room.send("craft", { recipeId }),
      onDrop: (slot, qty) =>
        this.room.send("dropItem", qty !== undefined ? { slot, qty } : { slot }),
      onPickup: () => this.pickupNearest(),
      onTalk: () => this.talkClosestNpc(),
      onDialogAction: (action) => {
        if (action.kind === "accept") this.room.send("questAccept", { questId: action.questId });
        else if (action.kind === "turnIn")
          this.room.send("questTurnIn", { questId: action.questId });
        else if (action.kind === "trade") this.room.send("trade", { tradeId: action.tradeId });
      },
      onTrackQuest: () => {
        // Tracker được cập nhật tự động trong update()
      },
    });

    this.setupInput();
    setupJoystick();
    this.setupNetwork();
  }

  private spawnNpcs() {
    for (const npc of NPCS) {
      const root = this.add.container(npc.x, npc.y).setDepth(npc.y);
      const texKey = `npc-${npc.id}`;
      const hasTex = this.textures.exists(texKey);
      const sprite = hasTex
        ? this.add.sprite(0, -12, texKey)
        : this.add.sprite(0, -12, "dot").setTint(npc.color);

      const nameLabel = this.add
        .text(0, -42, npc.name, {
          fontFamily: '"Noto Serif", Georgia, serif',
          fontSize: "12px",
          fontStyle: "bold",
          color: "#ffe08a",
          stroke: "#1d1a16",
          strokeThickness: 3,
        })
        .setOrigin(0.5);

      const titleLabel = this.add
        .text(0, -30, npc.title, {
          fontFamily: '"Noto Serif", Georgia, serif',
          fontSize: "10px",
          color: "#f3ecda",
          stroke: "#1d1a16",
          strokeThickness: 2,
        })
        .setOrigin(0.5);

      const markerAura = this.add
        .circle(0, -56, 12, 0xffd700, 0.25)
        .setStrokeStyle(1.6, 0xffd700, 0.9)
        .setVisible(false);

      const markerText = this.add
        .text(0, -56, "!", {
          fontFamily: '"Noto Serif", Georgia, serif',
          fontSize: "17px",
          fontStyle: "bold",
          color: "#ffe08a",
          stroke: "#1d1a16",
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setVisible(false);

      root.add([sprite, nameLabel, titleLabel, markerAura, markerText]);

      this.tweens.add({
        targets: [markerAura, markerText],
        y: "-=6",
        yoyo: true,
        repeat: -1,
        duration: 700,
        ease: "Sine.easeInOut",
      });

      this.npcs.set(npc.id, {
        id: npc.id,
        root,
        sprite,
        nameLabel,
        titleLabel,
        markerText,
        markerAura,
        x: npc.x,
        y: npc.y,
      });
    }
  }

  private createNavArrow() {
    this.navArrow = this.add
      .container(0, 0)
      .setDepth(WORLD_H + 5)
      .setVisible(false);
    const arrowG = this.add.graphics();
    arrowG.fillStyle(0xffd74a, 0.9);
    arrowG.fillTriangle(14, 0, -8, -7, -8, 7);
    arrowG.lineStyle(1.5, 0x1d1a16, 0.9);
    arrowG.strokeTriangle(14, 0, -8, -7, -8, 7);

    const aura = this.add.circle(0, 0, 16, 0xffd74a, 0.25);
    this.tweens.add({
      targets: aura,
      scale: 1.35,
      alpha: 0.1,
      yoyo: true,
      repeat: -1,
      duration: 650,
    });

    this.navArrow.add([aura, arrowG]);
  }

  // ---------------- Input ----------------

  private setupInput() {
    // enableCapture = false: để còn gõ được chữ vào ô chat
    this.keys = this.input.keyboard!.addKeys(
      "W,A,S,D,UP,DOWN,LEFT,RIGHT,J,K,L,B,C,I,Q,M,N,O,F,ONE,TWO,ESC,SPACE,ENTER",
      false,
    ) as any;
    const typing = () => document.activeElement instanceof HTMLInputElement;
    const kb = this.input.keyboard!;

    kb.on("keydown-J", () => !typing() && this.slash());
    kb.on("keydown-SPACE", () => !typing() && this.slash());
    kb.on("keydown-K", () => !typing() && this.sword());
    kb.on("keydown-L", () => !typing() && this.toggleMeditate());
    kb.on("keydown-B", () => !typing() && this.room.send("breakthrough"));
    kb.on("keydown-C", () => !typing() && ui.toggleCharModal());
    kb.on("keydown-I", () => !typing() && ui.toggleInventory());
    kb.on("keydown-Q", () => !typing() && ui.toggleQuestModal());
    kb.on("keydown-M", () => !typing() && ui.toggleMapModal());
    kb.on("keydown-N", () => !typing() && sound.toggleMute());
    kb.on("keydown-O", () => !typing() && ui.toggleSettingsModal());
    kb.on("keydown-ESC", () => !typing() && ui.closeAllModals());
    kb.on("keydown-F", () => !typing() && this.interactOrPickup());
    kb.on("keydown-ONE", () => !typing() && ui.useQuick(1));
    kb.on("keydown-TWO", () => !typing() && ui.useQuick(2));
    kb.on("keydown-ENTER", () => {
      if (!typing())
        setTimeout(() => (document.getElementById("chat-input") as HTMLInputElement).focus(), 0);
    });

    // Chuột: bấm vào bản đồ để chém về phía con trỏ
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (
        p.wasTouch ||
        !p.leftButtonDown() ||
        ui.isCharModalOpen() ||
        ui.isForgeModalOpen() ||
        ui.isInventoryOpen() ||
        ui.isQuestModalOpen() ||
        ui.isMapModalOpen() ||
        ui.isSettingsModalOpen() ||
        ui.isDialogOpen()
      )
        return;
      this.slash(Math.atan2(p.worldY - this.predY, p.worldX - this.predX));
    });

    const bind = (id: string, fn: () => void) =>
      document.getElementById(id)!.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        fn();
      });
    bind("sk-slash", () => this.slash());
    bind("sk-sword", () => this.sword());
    bind("sk-med", () => this.toggleMeditate());
    bind("sk-break", () => this.room.send("breakthrough"));

    const chatForm = document.getElementById("chat-form") as HTMLFormElement;
    const chatInput = document.getElementById("chat-input") as HTMLInputElement;
    chatForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (text) this.room.send("chat", { text });
      chatInput.value = "";
      chatInput.blur();
    });
  }

  private moveDir() {
    if (document.activeElement instanceof HTMLInputElement) return { dx: 0, dy: 0 };
    const k = this.keys;
    let dx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let dy = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    if (joystick.active) {
      dx = joystick.x;
      dy = joystick.y;
    }
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    return { dx, dy };
  }

  /** Tự ngắm con quái gần nhất trong tầm, không có thì đánh theo hướng đang nhìn. */
  private aim(range: number) {
    let best = range,
      angle = this.facing;
    this.monsters.forEach((m) => {
      const d = Math.hypot(m.tx - this.predX, m.ty - this.predY);
      if (d < best) {
        best = d;
        angle = Math.atan2(m.ty - this.predY, m.tx - this.predX);
      }
    });
    return angle;
  }

  private me() {
    return this.state?.players?.get(this.sid);
  }

  private weaponColorFor(p: any, fallback: number): number {
    const wId = p?.weapon ?? "";
    if (!wId) return fallback;
    return ITEM_BY_ID[wId]?.color ?? fallback;
  }

  private slash(angle?: number) {
    const me = this.me();
    if (!me || me.dead || this.time.now < this.nextSlash) return;
    this.nextSlash = this.time.now + SKILLS.slash.cooldown;
    const a = angle ?? this.aim(SKILLS.slash.range + 60);
    this.facing = a;
    const myEntity = this.players.get(this.sid);
    if (myEntity) myEntity.slashUntil = this.time.now + 220;
    this.room.send("attack", { angle: a });
    sound.slash();
    this.fxSlash(this.predX, this.predY, a, this.weaponColorFor(me, 0xffffff));
  }

  private sword() {
    const me = this.me();
    if (!me || me.dead || this.time.now < this.nextSword) return;
    if (me.mp < SKILLS.sword.mp) return ui.toast({ text: "Linh lực không đủ.", tone: "bad" });
    this.nextSword = this.time.now + SKILLS.sword.cooldown;
    const a = this.aim(SKILLS.sword.range);
    this.facing = a;
    const myEntity = this.players.get(this.sid);
    if (myEntity) myEntity.slashUntil = this.time.now + 220;
    this.room.send("skill", { id: "sword", angle: a });
    sound.sword();
    this.fxSword(this.predX, this.predY, a, SKILLS.sword.range, this.weaponColorFor(me, 0xffffff));
  }

  private toggleMeditate() {
    const me = this.me();
    if (!me || me.dead) return;
    this.room.send("meditate", { on: !me.meditating });
  }

  private pickupNearest() {
    const me = this.me();
    if (!me || me.dead || !this.nearestLootId) return;
    this.room.send("pickup", { lootId: this.nearestLootId });
  }

  private talkClosestNpc() {
    const me = this.me();
    if (!me || me.dead || !this.closestNpcId) return;
    this.room.send("talk", { npcId: this.closestNpcId });
  }

  private interactOrPickup() {
    if (this.closestNpcId) {
      this.talkClosestNpc();
    } else if (this.nearestLootId) {
      this.pickupNearest();
    }
  }

  // ---------------- Mạng ----------------

  private setupNetwork() {
    this.room.onStateChange(() => this.reconcile());
    this.room.onMessage("fx", (m: FxMsg) => this.onFx(m));
    this.room.onMessage("dmg", (m: DmgMsg) => {
      this.floatText(m);
      sound.hit(m.crit);
    });
    this.room.onMessage("chat", (m: ChatOut) => ui.chat(m));
    this.room.onMessage("toast", (m: ToastMsg) => ui.toast(m));
    this.room.onMessage("inv", (m: InvMsg) => ui.onInv(m));
    this.room.onMessage("quests", (m: QuestsMsg) => ui.onQuests(m));
    this.room.onMessage("dialog", (m: DialogMsg) => ui.onDialog(m));
    ui.chat({
      from: "",
      text: "Chào mừng đạo hữu tới Tiên Giới. Nhận nhiệm vụ ở Trưởng trấn (F), mở sổ nhiệm vụ (Q) và xem bản đồ (M).",
      sys: true,
    });
  }

  /** Lấy vị trí server làm gốc rồi chạy lại các input server chưa xử lý. */
  private reconcile() {
    const me = this.me();
    if (!me) return;
    if (!this.hasMe) {
      this.hasMe = true;
      this.predX = me.x;
      this.predY = me.y;
    }
    if (me.dead) {
      this.pending.length = 0;
      this.predX = me.x;
      this.predY = me.y;
      return;
    }
    this.pending = this.pending.filter((i) => i.seq > me.lastSeq);
    const speed = statsFor(me.realm, me.tier, me).speed * (TICK_MS / 1000);
    let x = me.x,
      y = me.y;
    for (const i of this.pending)
      ({ x, y } = moveWithCollision(x, y, i.dx * speed, i.dy * speed, PLAYER_RADIUS));
    this.predX = x;
    this.predY = y;
  }

  private fixedStep() {
    const me = this.me();
    if (!me || me.dead) {
      this.moving = false;
      return;
    }
    const { dx, dy } = this.moveDir();
    if (Math.hypot(dx, dy) < 0.05) {
      this.moving = false;
      return;
    }
    this.moving = true;
    const msg: InputMsg = { seq: ++this.seq, dx, dy };
    this.room.send("input", msg);
    this.pending.push(msg);
    const speed = statsFor(me.realm, me.tier, me).speed * (TICK_MS / 1000);
    ({ x: this.predX, y: this.predY } = moveWithCollision(
      this.predX,
      this.predY,
      dx * speed,
      dy * speed,
      PLAYER_RADIUS,
    ));
    this.facing = Math.atan2(dy, dx);
  }

  // ---------------- Vòng lặp vẽ ----------------

  update(_t: number, deltaMs: number) {
    if (!this.state?.players) return;
    this.acc = Math.min(this.acc + deltaMs, 250);
    while (this.acc >= TICK_MS) {
      this.acc -= TICK_MS;
      this.fixedStep();
    }

    const k = 1 - Math.exp(-LERP_RATE * (deltaMs / 1000));
    this.syncPlayers(k, deltaMs);
    this.syncMonsters(k);
    this.syncLoot();
    this.syncNpcs();
    this.syncAudioZone();
    this.syncQuestNav();
    this.syncMaps();

    const me = this.me();
    if (me) {
      ui.hud(me, this.state.online ?? this.state.players.size);
      const now = this.time.now;
      ui.cooldown("sk-slash", (this.nextSlash - now) / SKILLS.slash.cooldown);
      ui.cooldown("sk-sword", (this.nextSword - now) / SKILLS.sword.cooldown);
      ui.tickItemCooldowns();
    }
  }

  private syncAudioZone() {
    const distToTown = Math.hypot(this.predX - TOWN_PX.x, this.predY - TOWN_PX.y);
    const inTown = distToTown <= TOWN_PX.r;
    sound.setZone(inTown ? "town" : "wild");
    ui.setZoneName(inTown ? "Lạc Hà Trấn" : "Vân Mộng Sơn");
  }

  private syncNpcs() {
    const qLog = ui.getQuestLog();
    const qCtx = ui.getQuestContext();

    let bestNpc: NpcEntity | null = null;
    let bestDist = NPC_RANGE;

    for (const [id, ne] of this.npcs) {
      const marker = npcMarker(id, qLog, qCtx);
      if (marker === "!" || marker === "?") {
        ne.markerText.setText(marker).setVisible(true);
        ne.markerAura.setVisible(true);
        const col = marker === "?" ? 0x6ad06a : 0xffd700;
        ne.markerAura.setFillStyle(col, 0.25).setStrokeStyle(1.6, col, 0.9);
        ne.markerText.setColor(marker === "?" ? "#6ad06a" : "#ffe08a");
      } else {
        ne.markerText.setVisible(false);
        ne.markerAura.setVisible(false);
      }

      const d = Math.hypot(ne.x - this.predX, ne.y - this.predY);
      if (d <= bestDist) {
        bestDist = d;
        bestNpc = ne;
      }
    }

    this.closestNpcId = bestNpc ? bestNpc.id : null;
    if (bestNpc) {
      const npcDef = NPC_BY_ID[bestNpc.id];
      ui.talkPrompt(npcDef ? `Nói chuyện · ${npcDef.name} (F)` : "Nói chuyện (F)");
    } else {
      ui.talkPrompt(null);
      if (ui.isForgeModalOpen()) ui.toggleForgeModal(false);
    }
  }

  /** Bán kính tính từ tâm trấn ứng với ngưỡng dangerAt(x, y) = minDanger */
  private dangerRadiusPx(minDanger: number): number {
    return TOWN_PX.r + minDanger * (WORLD_W * 0.5 - TOWN_PX.r);
  }

  /** Tìm con quái gần nhất cùng loại trong state.monsters; nếu chưa có thì chỉ ra vòng minDanger theo hướng đang đứng. */
  private monsterTargetPos(monsterKind: string): { x: number; y: number } | null {
    let bestPos: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    this.state.monsters?.forEach((m: any) => {
      if (m.kind !== monsterKind || m.hp <= 0) return;
      const d = Math.hypot(m.x - this.predX, m.y - this.predY);
      if (d < bestDist) {
        bestDist = d;
        bestPos = { x: m.x, y: m.y };
      }
    });
    if (bestPos) return bestPos;

    const def = MONSTER_BY_ID[monsterKind];
    if (!def) return null;
    const ringR = Math.max(TOWN_PX.r + 48, this.dangerRadiusPx(def.minDanger) + 32);
    const fromTownDist = Math.hypot(this.predX - TOWN_PX.x, this.predY - TOWN_PX.y);
    const dirAngle =
      fromTownDist > 16 ? Math.atan2(this.predY - TOWN_PX.y, this.predX - TOWN_PX.x) : this.facing;
    const pad = TILE * 2;
    return {
      x: Phaser.Math.Clamp(TOWN_PX.x + Math.cos(dirAngle) * ringR, pad, WORLD_W - pad),
      y: Phaser.Math.Clamp(TOWN_PX.y + Math.sin(dirAngle) * ringR, pad, WORLD_H - pad),
    };
  }

  private resolveQuestTarget(questId: string): { x: number; y: number } | null {
    const def = QUEST_BY_ID[questId];
    if (!def) return null;
    const qLog = ui.getQuestLog();
    const prog = qLog.active.find((a) => a.id === questId);
    if (!prog) return null;
    const ctx = ui.getQuestContext();

    // Nếu đã hoàn thành hoặc sẵn sàng trả thì chỉ tới NPC giao
    if (questReady(def, prog, ctx)) {
      const giver = NPC_BY_ID[def.giver];
      return giver ? { x: giver.x, y: giver.y } : null;
    }

    const step = def.steps[prog.step];
    if (!step) return null;

    if (step.kind === "talk") {
      const npc = NPC_BY_ID[step.npcId];
      return npc ? { x: npc.x, y: npc.y } : null;
    }

    if (step.kind === "kill") {
      return this.monsterTargetPos(step.monster);
    }

    if (step.kind === "collect") {
      // Ưu tiên chỉ tới vật phẩm rơi trên mặt đất nếu có
      let nearestLoot: { x: number; y: number } | null = null;
      let nearestLootDist = Infinity;
      this.state.loot?.forEach((l: LootView) => {
        if (l.itemId !== step.itemId || (l.owner && l.owner !== this.sid)) return;
        const d = Math.hypot(l.x - this.predX, l.y - this.predY);
        if (d < nearestLootDist) {
          nearestLootDist = d;
          nearestLoot = { x: l.x, y: l.y };
        }
      });
      if (nearestLoot) return nearestLoot;

      // Tra từ DROP_TABLES xem loại quái nào rơi nguyên liệu này
      let bestMon: string | null = null;
      let bestChance = 0;
      for (const [monId, entries] of Object.entries(DROP_TABLES)) {
        for (const e of entries) {
          if (e.itemId === step.itemId && e.chance > bestChance) {
            bestChance = e.chance;
            bestMon = monId;
          }
        }
      }
      if (bestMon) return this.monsterTargetPos(bestMon);
    }

    // Đột phá cảnh giới: chỉ về trung tâm trấn để an toàn
    if (step.kind === "reachRealm") {
      return { x: TOWN_PX.x, y: TOWN_PX.y };
    }

    return null;
  }

  private syncQuestNav() {
    const trackId = ui.getTrackingQuestId();
    if (!trackId) {
      this.navArrow.setVisible(false);
      return;
    }
    const target = this.resolveQuestTarget(trackId);
    if (!target) {
      this.navArrow.setVisible(false);
      return;
    }

    const dx = target.x - this.predX;
    const dy = target.y - this.predY;
    const dist = Math.hypot(dx, dy);

    // Khi ở quá gần mục tiêu (dưới 95 px) thì ẩn mũi tên để không rối mắt
    if (dist <= 95) {
      this.navArrow.setVisible(false);
      return;
    }

    const angle = Math.atan2(dy, dx);
    this.navArrow.setPosition(
      this.predX + Math.cos(angle) * 44,
      this.predY - 8 + Math.sin(angle) * 44,
    );
    this.navArrow.setRotation(angle);
    this.navArrow.setVisible(true);
  }

  // ---------------- Bản đồ nhỏ & Bản đồ lớn ----------------

  private syncMaps() {
    const now = performance.now();
    if (now - this.lastMapDraw < 120) return;
    this.lastMapDraw = now;

    // 1. Vẽ Minimap (120x120)
    const mmCanvas = document.getElementById("minimap") as HTMLCanvasElement | null;
    if (mmCanvas) {
      const ctx = mmCanvas.getContext("2d");
      if (ctx) {
        const w = mmCanvas.width;
        const h = mmCanvas.height;
        ctx.clearRect(0, 0, w, h);

        const scale = w / WORLD_W;

        // Nền hoang dã
        ctx.fillStyle = "#273322";
        ctx.fillRect(0, 0, w, h);

        // Vòng Lạc Hà Trấn
        const tx = TOWN_PX.x * scale;
        const ty = TOWN_PX.y * scale;
        const tr = TOWN_PX.r * scale;
        ctx.fillStyle = "rgba(163, 29, 29, 0.18)";
        ctx.beginPath();
        ctx.arc(tx, ty, tr, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(163, 29, 29, 0.65)";
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Quái vật (chấm đỏ nhỏ)
        ctx.fillStyle = "#e57373";
        this.monsters.forEach((m) => {
          ctx.fillRect(m.tx * scale - 1, m.ty * scale - 1, 2, 2);
        });

        // Người chơi khác (chấm lam)
        ctx.fillStyle = "#9fd0ea";
        this.players.forEach((p, id) => {
          if (id === this.sid) return;
          ctx.beginPath();
          ctx.arc(p.tx * scale, p.ty * scale, 2.2, 0, Math.PI * 2);
          ctx.fill();
        });

        // NPC (chấm hoàng kim)
        ctx.fillStyle = "#ffd74a";
        for (const npc of NPCS) {
          ctx.beginPath();
          ctx.arc(npc.x * scale, npc.y * scale, 2.8, 0, Math.PI * 2);
          ctx.fill();
        }

        // Chính mình (chấm lục bảo sáng + vạch hướng nhìn)
        const mx = this.predX * scale;
        const my = this.predY * scale;
        ctx.fillStyle = "#6ad06a";
        ctx.beginPath();
        ctx.arc(mx, my, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.strokeStyle = "#6ad06a";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(mx + Math.cos(this.facing) * 7, my + Math.sin(this.facing) * 7);
        ctx.stroke();
      }
    }

    // 2. Vẽ Bản đồ lớn (384x384) khi mở modal
    if (ui.isMapModalOpen()) {
      const wmCanvas = document.getElementById("worldmap") as HTMLCanvasElement | null;
      if (wmCanvas) {
        const ctx = wmCanvas.getContext("2d");
        if (ctx) {
          const w = wmCanvas.width;
          const h = wmCanvas.height;
          ctx.clearRect(0, 0, w, h);
          const s = w / WORLD_W;

          // Nền sơn thủy
          ctx.fillStyle = "#1e291b";
          ctx.fillRect(0, 0, w, h);

          // Khu an toàn Lạc Hà Trấn
          const tx = TOWN_PX.x * s;
          const ty = TOWN_PX.y * s;
          const tr = TOWN_PX.r * s;
          ctx.fillStyle = "rgba(163, 29, 29, 0.22)";
          ctx.beginPath();
          ctx.arc(tx, ty, tr, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#a31d1d";
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.fillStyle = "#f3ecda";
          ctx.font = "bold 12px serif";
          ctx.textAlign = "center";
          ctx.fillText("Lạc Hà Trấn", tx, ty - tr - 6);

          // Vòng nguy hiểm (minDanger) tính ngược từ dangerAt(x, y)
          for (const m of MONSTERS) {
            const rPx = m.minDanger > 0 ? this.dangerRadiusPx(m.minDanger) : TOWN_PX.r + 40;
            const rCanvas = Math.min(w * 0.49, rPx * s);
            const col = `#${m.color.toString(16).padStart(6, "0")}`;
            ctx.strokeStyle = col;
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(tx, ty, rCanvas, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = col;
            ctx.font = "10px serif";
            const labelY = Math.max(11, ty - rCanvas - 3);
            ctx.fillText(
              m.minDanger > 0
                ? `${m.name} (≥${Math.round(m.minDanger * 100)}%)`
                : `${m.name} (ngoài trấn)`,
              tx,
              labelY,
            );
          }

          // Quái hiện hành
          ctx.fillStyle = "#e57373";
          this.monsters.forEach((m) => {
            ctx.fillRect(m.tx * s - 1.5, m.ty * s - 1.5, 3, 3);
          });

          // Người chơi khác
          ctx.fillStyle = "#9fd0ea";
          this.players.forEach((p, id) => {
            if (id === this.sid) return;
            ctx.beginPath();
            ctx.arc(p.tx * s, p.ty * s, 3.5, 0, Math.PI * 2);
            ctx.fill();
          });

          // NPC trong trấn
          const qLog = ui.getQuestLog();
          const qCtx = ui.getQuestContext();
          for (const npc of NPCS) {
            const nx = npc.x * s;
            const ny = npc.y * s;
            ctx.fillStyle = "#ffd74a";
            ctx.beginPath();
            ctx.arc(nx, ny, 4.5, 0, Math.PI * 2);
            ctx.fill();
            const marker = npcMarker(npc.id, qLog, qCtx);
            if (marker) {
              ctx.fillStyle = marker === "?" ? "#6ad06a" : "#ff4d4d";
              ctx.font = "bold 11px serif";
              ctx.fillText(marker, nx, ny - 6);
            }
          }

          // Mục tiêu nhiệm vụ
          const trackId = ui.getTrackingQuestId();
          if (trackId) {
            const t = this.resolveQuestTarget(trackId);
            if (t) {
              ctx.strokeStyle = "#ffd74a";
              ctx.lineWidth = 1.5;
              ctx.setLineDash([3, 3]);
              ctx.beginPath();
              ctx.moveTo(this.predX * s, this.predY * s);
              ctx.lineTo(t.x * s, t.y * s);
              ctx.stroke();
              ctx.setLineDash([]);
            }
          }

          // Chính mình
          const px = this.predX * s;
          const py = this.predY * s;
          ctx.fillStyle = "#6ad06a";
          ctx.beginPath();
          ctx.arc(px, py, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }
  }

  private updatePlayerAnim(e: Entity, who: "me" | "other", angle: number, isMoving: boolean) {
    const dir = dirFromAngle(angle);
    const slashing = (e.slashUntil ?? 0) > this.time.now;
    const mode = slashing ? "slash" : isMoving ? "walk" : "idle";
    const prefix = e.animPrefix ?? who;
    const animKey = `${prefix}-${mode}-${dir}`;
    if (this.anims.exists(animKey)) {
      if (e.sprite.anims.currentAnim?.key !== animKey) e.sprite.play(animKey, true);
      e.sprite.setFlipX(false);
    } else {
      e.sprite.setFlipX(Math.cos(angle) < 0);
    }
  }

  /**
   * Cập nhật ngoại hình nhân vật theo trang bị (weapon / robe / talisman).
   * Chỉ chạy khi khóa trang bị đổi để tránh vẽ lại mỗi frame.
   */
  private applyPlayerEquip(e: Entity, p: any, isMe: boolean) {
    const who = isMe ? "me" : "other";
    const weapon = p.weapon ?? "";
    const robe = p.robe ?? "";
    const talisman = p.talisman ?? "";
    const equipKey = `${weapon}|${robe}|${talisman}`;
    if (e.lastEquipKey === equipKey) return;
    e.lastEquipKey = equipKey;

    // 1. Pháp bào: ưu tiên bộ frame vẽ sẵn trong atlas (robe-<id>), không có thì nhuộm màu
    const robePrefix = robe ? `robe-${robe}` : "";
    if (robePrefix && this.anims.exists(`${robePrefix}-idle-down`)) {
      e.animPrefix = robePrefix;
      e.sprite.clearTint();
    } else {
      e.animPrefix = who;
      const robeDef = robe ? ITEM_BY_ID[robe] : undefined;
      if (robeDef) e.sprite.setTint(robeDef.color);
      else e.sprite.clearTint();
    }

    // 2. Vũ khí: vẽ thanh kiếm đeo sau lưng theo màu kiếm đang trang bị
    if (e.weaponVisual) {
      e.weaponVisual.clear();
      const wDef = weapon ? ITEM_BY_ID[weapon] : undefined;
      if (wDef) {
        const bladeCol = wDef.color;
        const hiltCol = RARITY_COLORS[wDef.rarity] ?? 0xd8b868;
        e.weaponVisual.lineStyle(3, 0x1d1a16, 0.95);
        e.weaponVisual.strokeLineShape(new Phaser.Geom.Line(-11, -26, 9, -2));
        e.weaponVisual.lineStyle(2, bladeCol, 1);
        e.weaponVisual.strokeLineShape(new Phaser.Geom.Line(-10, -25, 8, -3));
        e.weaponVisual.lineStyle(2, hiltCol, 1);
        e.weaponVisual.strokeLineShape(new Phaser.Geom.Line(-13, -21, -6, -27));
        e.weaponVisual.fillStyle(hiltCol, 1);
        e.weaponVisual.fillCircle(-12, -27, 2);
        e.weaponVisual.setVisible(true);
      } else {
        e.weaponVisual.setVisible(false);
      }
    }

    // 3. Hộ phù: vòng hào quang nhỏ mang màu của hộ phù
    if (e.talismanRing) {
      const tDef = talisman ? ITEM_BY_ID[talisman] : undefined;
      if (tDef) {
        e.talismanRing
          .setFillStyle(tDef.color, 0.14)
          .setStrokeStyle(1.6, tDef.color, 0.8)
          .setVisible(!ui.isLowFx());
      } else {
        e.talismanRing.setVisible(false);
      }
    }
  }

  private syncPlayers(k: number, deltaMs: number) {
    const seen = new Set<string>();
    this.state.players.forEach((p: any, id: string) => {
      seen.add(id);
      const isMe = id === this.sid;
      const who = isMe ? "me" : "other";
      let e = this.players.get(id);
      if (!e) {
        e = this.makeEntity(who, p.x, p.y, true);
        if (isMe) this.cameras.main.startFollow(e.root, true, 0.2, 0.2);
        this.players.set(id, e);
      }
      this.applyPlayerEquip(e, p, isMe);
      if (isMe) {
        // Bám sát vị trí đoán trước; làm mượt các lần chỉnh nhỏ từ server
        const kk = 1 - Math.exp(-30 * (deltaMs / 1000));
        e.root.x += (this.predX - e.root.x) * kk;
        e.root.y += (this.predY - e.root.y) * kk;
        this.updatePlayerAnim(e, who, this.facing, this.moving && !p.dead && !p.meditating);
        ui.death(
          p.dead ? Math.max(0, Math.ceil(5 - (this.time.now - (e as any).deadSince) / 1000)) : null,
        );
        if (p.dead && !(e as any).deadSince) (e as any).deadSince = this.time.now;
        if (!p.dead) (e as any).deadSince = 0;
      } else {
        const dist = Math.hypot(p.x - e.root.x, p.y - e.root.y);
        e.tx = p.x;
        e.ty = p.y;
        e.root.x += (e.tx - e.root.x) * k;
        e.root.y += (e.ty - e.root.y) * k;
        this.updatePlayerAnim(e, who, p.angle, dist > 1.5 && !p.dead && !p.meditating);
      }
      e.root.setDepth(e.root.y);
      e.root.setAlpha(p.dead ? 0.35 : 1);
      e.aura!.setVisible(p.meditating && !ui.isLowFx());
      if (e.talismanRing) {
        const hasTalisman = Boolean(p.talisman && ITEM_BY_ID[p.talisman]);
        e.talismanRing.setVisible(hasTalisman && !ui.isLowFx());
      }
      const label = `${p.name}\n${realmLabel(p.realm, p.tier)}`;
      if (label !== e.lastLabel) {
        e.label!.setText(label);
        e.lastLabel = label;
      }
      e.label!.setVisible(isMe || !ui.isHideNames());
      this.drawBar(
        e.bar,
        p.hp / p.maxHp,
        isMe ? 0x6ad06a : 0xd0a040,
        -30,
        28,
        !isMe || p.hp < p.maxHp,
      );
    });
    for (const [id, e] of this.players)
      if (!seen.has(id)) {
        e.root.destroy();
        this.players.delete(id);
      }
  }

  private syncMonsters(k: number) {
    const seen = new Set<string>();
    this.state.monsters.forEach((m: any, id: string) => {
      seen.add(id);
      let e = this.monsters.get(id);
      const def = MONSTER_BY_ID[m.kind];
      if (!e) {
        e = this.makeEntity(`mon-${m.kind}`, m.x, m.y, false);
        const animKey = `mon-${m.kind}-move`;
        if (this.anims.exists(animKey)) e.sprite.play(animKey);
        if (def.boss) {
          e.label = this.add
            .text(0, -def.radius - 22, def.name, {
              fontFamily: '"Noto Serif", Georgia, serif',
              fontSize: "13px",
              color: "#ffb0a0",
              stroke: "#000",
              strokeThickness: 3,
            })
            .setOrigin(0.5);
          e.root.add(e.label);
        }
        this.monsters.set(id, e);
      }
      e.tx = m.x;
      e.ty = m.y;
      e.root.x += (e.tx - e.root.x) * k;
      e.root.y += (e.ty - e.root.y) * k;
      e.root.setDepth(e.root.y);
      e.sprite.setFlipX(Math.cos(m.angle) < 0);
      this.drawBar(
        e.bar,
        m.hp / m.maxHp,
        0xc0392b,
        -def.radius - 10,
        Math.max(24, def.radius * 2),
        m.hp < m.maxHp,
      );
    });
    for (const [id, e] of this.monsters) {
      if (seen.has(id)) continue;
      this.tweens.add({
        targets: e.root,
        alpha: 0,
        scale: 0.6,
        duration: 300,
        onComplete: () => e.root.destroy(),
      });
      this.monsters.delete(id);
    }
  }

  private syncLoot() {
    if (!this.state.loot) {
      ui.pickupPrompt(null);
      return;
    }
    const seen = new Set<string>();
    let bestId: string | null = null;
    let bestDist = PICKUP_RANGE;
    let bestLabel: string | null = null;
    const me = this.me();

    this.state.loot.forEach((l: LootView, id: string) => {
      seen.add(id);
      const def = ITEM_BY_ID[l.itemId];
      const rarityColor = def ? RARITY_COLORS[def.rarity] : 0xc9c4b8;
      let le = this.loots.get(id);
      if (!le) {
        const root = this.add.container(l.x, l.y).setDepth(l.y - 2);
        const ring = this.add
          .circle(0, 2, 11, rarityColor, 0.18)
          .setStrokeStyle(1.8, rarityColor, 0.9);
        const texKey = this.textures.exists(`item-${l.itemId}`) ? `item-${l.itemId}` : "dot";
        const icon = this.add.image(0, -3, texKey);
        if (texKey === "dot" && def) icon.setTint(def.color);
        const hex = `#${rarityColor.toString(16).padStart(6, "0")}`;
        const label = this.add
          .text(0, -18, "", {
            fontFamily: '"Noto Serif", Georgia, serif',
            fontSize: "11px",
            color: hex,
            stroke: "#1d1a16",
            strokeThickness: 3,
          })
          .setOrigin(0.5);
        root.add([ring, icon, label]);
        // Hiệu ứng nhấp nháy theo độ hiếm
        this.tweens.add({
          targets: ring,
          scaleX: 1.3,
          scaleY: 1.3,
          alpha: 0.35,
          yoyo: true,
          repeat: -1,
          duration: 650,
        });
        this.tweens.add({
          targets: icon,
          y: -6,
          yoyo: true,
          repeat: -1,
          duration: 650,
          ease: "Sine.easeInOut",
        });
        le = { root, ring, icon, label, itemId: l.itemId, qty: 0 };
        this.loots.set(id, le);
      }

      le.root.setPosition(l.x, l.y);
      le.root.setDepth(l.y - 2);
      le.ring.setVisible(!ui.isLowFx());
      if (le.qty !== l.qty) {
        le.qty = l.qty;
        const name = def?.name ?? l.itemId;
        le.label.setText(l.qty > 1 ? `${name} ×${l.qty}` : name);
      }
      // Đồ của người khác (trong 30 giây đầu) hiện mờ đi
      const mineOrPublic = !l.owner || l.owner === this.sid;
      le.root.setAlpha(mineOrPublic ? 1 : 0.35);

      if (me && !me.dead && mineOrPublic) {
        const d = Math.hypot(l.x - this.predX, l.y - this.predY);
        if (d <= bestDist) {
          bestDist = d;
          bestId = id;
          bestLabel = def ? `Nhặt ${def.name}` : "Nhặt (F)";
        }
      }
    });

    for (const [id, le] of this.loots) {
      if (seen.has(id)) continue;
      le.root.destroy();
      this.loots.delete(id);
    }

    this.nearestLootId = bestId;
    ui.pickupPrompt(bestLabel);
  }

  private makeEntity(texture: string, x: number, y: number, isPlayer: boolean): Entity {
    const root = this.add.container(x, y);
    const hasAtlas = this.textures.exists(ATLAS_KEY) && this.textures.get(ATLAS_KEY).has(texture);
    const sprite = hasAtlas
      ? this.add.sprite(0, isPlayer ? -12 : 0, ATLAS_KEY, texture)
      : this.add.sprite(0, isPlayer ? -12 : 0, texture);
    const bar = this.add.graphics();
    const e: Entity = { root, sprite, bar, tx: x, ty: y };
    if (isPlayer) {
      e.aura = this.add
        .ellipse(0, 6, 54, 22, 0xffe08a, 0.25)
        .setStrokeStyle(2, 0xffe08a, 0.7)
        .setVisible(false);
      this.tweens.add({
        targets: e.aura,
        scaleX: 1.25,
        scaleY: 1.25,
        alpha: 0.5,
        yoyo: true,
        repeat: -1,
        duration: 900,
      });
      e.talismanRing = this.add
        .circle(0, 4, 18, 0xffe08a, 0.14)
        .setStrokeStyle(1.6, 0xffe08a, 0.8)
        .setVisible(false);
      this.tweens.add({
        targets: e.talismanRing,
        scaleX: 1.15,
        scaleY: 1.15,
        alpha: 0.45,
        yoyo: true,
        repeat: -1,
        duration: 1100,
      });
      e.weaponVisual = this.add.graphics().setVisible(false);
      e.label = this.add
        .text(0, -54, "", {
          fontFamily: '"Noto Serif", Georgia, serif',
          fontSize: "12px",
          color: "#fff6dc",
          align: "center",
          stroke: "#1d1a16",
          strokeThickness: 3,
          lineSpacing: -2,
        })
        .setOrigin(0.5, 1);
      root.add([e.aura, e.talismanRing, e.weaponVisual, sprite, bar, e.label]);
    } else {
      root.add([sprite, bar]);
    }
    return e;
  }

  private drawBar(
    g: Phaser.GameObjects.Graphics,
    frac: number,
    color: number,
    y: number,
    w: number,
    visible: boolean,
  ) {
    g.clear();
    if (!visible) return;
    g.fillStyle(0x000000, 0.55).fillRect(-w / 2, y, w, 4);
    g.fillStyle(color, 1).fillRect(-w / 2, y, w * Phaser.Math.Clamp(frac, 0, 1), 4);
  }

  // ---------------- Hiệu ứng ----------------

  private onFx(m: FxMsg) {
    if ((m.kind === "slash" || m.kind === "sword") && m.by === this.sid) return; // đã vẽ ngay khi bấm
    switch (m.kind) {
      case "slash": {
        const other = this.players.get(m.by);
        if (other) other.slashUntil = this.time.now + 220;
        const attacker = this.state?.players?.get(m.by);
        return this.fxSlash(m.x, m.y, m.angle, this.weaponColorFor(attacker, 0xdfe8f0));
      }
      case "sword": {
        const other = this.players.get(m.by);
        if (other) other.slashUntil = this.time.now + 220;
        const attacker = this.state?.players?.get(m.by);
        return this.fxSword(m.x, m.y, m.angle, m.range, this.weaponColorFor(attacker, 0xffffff));
      }
      case "mslash":
        return this.fxSlash(m.x, m.y, m.angle, 0xff6050, 0.6);
      case "levelup":
        return this.fxLevelUp(m.x, m.y, m.major, m.by === this.sid);
      case "breakfail":
        return this.fxBreakFail(m.x, m.y);
    }
  }

  private fxSlash(x: number, y: number, angle: number, color: number, scale = 1) {
    const g = this.add.graphics({ x, y: y - 8 }).setDepth(y + 1);
    const r = SKILLS.slash.range * scale,
      half = SKILLS.slash.arc / 2;
    g.lineStyle(6 * scale, color, 0.9);
    g.beginPath();
    g.arc(0, 0, r * 0.8, angle - half, angle + half);
    g.strokePath();
    g.lineStyle(2, color, 0.5);
    g.beginPath();
    g.arc(0, 0, r, angle - half * 0.8, angle + half * 0.8);
    g.strokePath();
    this.tweens.add({
      targets: g,
      alpha: 0,
      scale: 1.15,
      duration: 180,
      onComplete: () => g.destroy(),
    });
  }

  private fxSword(x: number, y: number, angle: number, range: number, tint = 0xffffff) {
    const s = this.add
      .image(x, y - 10, "swordbeam")
      .setRotation(angle)
      .setDepth(WORLD_H)
      .setBlendMode(Phaser.BlendModes.ADD);
    if (tint !== 0xffffff) s.setTint(tint);
    this.tweens.add({
      targets: s,
      x: x + Math.cos(angle) * range,
      y: y - 10 + Math.sin(angle) * range,
      duration: 220,
      onComplete: () =>
        this.tweens.add({ targets: s, alpha: 0, duration: 120, onComplete: () => s.destroy() }),
    });
  }

  private fxLevelUp(x: number, y: number, major: boolean, mine: boolean) {
    const color = major ? 0xffd34d : 0xbfe8ff;
    if (mine) sound.levelup(major);
    const rings = ui.isLowFx() ? 1 : major ? 3 : 1;
    for (let i = 0; i < rings; i++) {
      const ring = this.add
        .circle(x, y, 16, color, 0)
        .setStrokeStyle(3, color, 0.9)
        .setDepth(WORLD_H);
      this.tweens.add({
        targets: ring,
        scale: major ? 7 : 4,
        alpha: 0,
        delay: i * 180,
        duration: 700,
        onComplete: () => ring.destroy(),
      });
    }
    if (mine) {
      const me = this.me();
      ui.toast({
        text: major
          ? `Đột phá thành công! ${me ? realmLabel(me.realm, me.tier) : ""}`
          : `Tu vi tinh tiến: ${me ? realmLabel(me.realm, me.tier) : ""}`,
        tone: "good",
      });
    }
  }

  private fxBreakFail(x: number, y: number) {
    sound.breakfail();
    const puff = this.add.circle(x, y - 10, 20, 0x4a2a5a, 0.6).setDepth(WORLD_H);
    this.tweens.add({
      targets: puff,
      scale: 3,
      alpha: 0,
      duration: 800,
      onComplete: () => puff.destroy(),
    });
  }

  private floatText(m: DmgMsg) {
    const color = m.toPlayer ? "#ff6b5e" : m.crit ? "#ffd34d" : "#ffffff";
    const t = this.add
      .text(m.x + Phaser.Math.Between(-8, 8), m.y, `${m.crit ? "Bạo! " : ""}${m.amount}`, {
        fontFamily: '"Noto Serif", Georgia, serif',
        fontSize: m.crit ? "20px" : "15px",
        color,
        stroke: "#1d1a16",
        strokeThickness: 3,
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(WORLD_H + 1);
    this.tweens.add({
      targets: t,
      y: m.y - 36,
      alpha: 0,
      duration: 800,
      ease: "Cubic.easeOut",
      onComplete: () => t.destroy(),
    });
  }
}
