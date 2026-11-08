import Phaser from "phaser";
import type { Room } from "colyseus.js";
import {
  TILE, MAP_W, MAP_H, MAP_TILES, WORLD_W, WORLD_H, TOWN_PX, TICK_MS, PLAYER_RADIUS, SKILLS,
  MONSTER_BY_ID, moveWithCollision, statsFor, realmLabel,
  type InputMsg, type FxMsg, type DmgMsg, type ChatOut, type ToastMsg,
} from "@tien-gioi/shared";
import { makeTextures, TILESET_KEY } from "../textures";
import { ui } from "../ui";
import { joystick, setupJoystick } from "../joystick";

interface Entity {
  root: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  bar: Phaser.GameObjects.Graphics;
  label?: Phaser.GameObjects.Text;
  aura?: Phaser.GameObjects.Ellipse;
  tx: number; // vị trí đích (từ server) để nội suy
  ty: number;
  lastLabel?: string;
}

const LERP_RATE = 14; // nội suy vị trí người khác / quái

export class WorldScene extends Phaser.Scene {
  private players = new Map<string, Entity>();
  private monsters = new Map<string, Entity>();
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  // Đoán trước di chuyển của chính mình
  private seq = 0;
  private pending: InputMsg[] = [];
  private predX = 0;
  private predY = 0;
  private hasMe = false;
  private acc = 0;
  private facing = 0;

  private nextSlash = 0;
  private nextSword = 0;

  constructor(private room: Room) {
    super("world");
  }

  private get state(): any { return this.room.state; }
  private get sid() { return this.room.sessionId; }

  create() {
    makeTextures(this);

    // Bản đồ (sinh từ seed chung, giống hệt server)
    const data: number[][] = [];
    for (let y = 0; y < MAP_H; y++) data.push(Array.from(MAP_TILES.subarray(y * MAP_W, (y + 1) * MAP_W)));
    const map = this.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    const ts = map.addTilesetImage("tiles", TILESET_KEY, TILE, TILE, 0, 0)!;
    map.createLayer(0, ts, 0, 0)!.setDepth(-10);

    this.add.text(TOWN_PX.x, TOWN_PX.y - 40, "落霞鎮", { fontFamily: "serif", fontSize: "56px", color: "#7a3b2e" })
      .setOrigin(0.5).setAlpha(0.35).setDepth(-5);
    this.add.text(TOWN_PX.x, TOWN_PX.y + 14, "Lạc Hà Trấn · Khu an toàn", { fontFamily: "serif", fontSize: "16px", color: "#5a4030" })
      .setOrigin(0.5).setAlpha(0.6).setDepth(-5);
    this.add.circle(TOWN_PX.x, TOWN_PX.y, TOWN_PX.r, 0, 0).setStrokeStyle(2, 0xa31d1d, 0.25).setDepth(-5);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    const fitZoom = () => cam.setZoom(Phaser.Math.Clamp(Math.min(this.scale.width, this.scale.height) / 640, 0.75, 1.3));
    fitZoom();
    this.scale.on("resize", fitZoom);

    this.setupInput();
    setupJoystick();
    this.setupNetwork();
  }

  // ---------------- Input ----------------

  private setupInput() {
    // enableCapture = false: để còn gõ được chữ vào ô chat
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,J,K,L,B,SPACE,ENTER", false) as any;
    const typing = () => document.activeElement instanceof HTMLInputElement;
    const kb = this.input.keyboard!;
    kb.on("keydown-J", () => !typing() && this.slash());
    kb.on("keydown-SPACE", () => !typing() && this.slash());
    kb.on("keydown-K", () => !typing() && this.sword());
    kb.on("keydown-L", () => !typing() && this.toggleMeditate());
    kb.on("keydown-B", () => !typing() && this.room.send("breakthrough"));
    kb.on("keydown-ENTER", () => { if (!typing()) setTimeout(() => (document.getElementById("chat-input") as HTMLInputElement).focus(), 0); });

    // Chuột: bấm vào bản đồ để chém về phía con trỏ
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.wasTouch || !p.leftButtonDown()) return;
      this.slash(Math.atan2(p.worldY - this.predY, p.worldX - this.predX));
    });

    const bind = (id: string, fn: () => void) =>
      document.getElementById(id)!.addEventListener("pointerdown", (e) => { e.preventDefault(); fn(); });
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
    if (joystick.active) { dx = joystick.x; dy = joystick.y; }
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    return { dx, dy };
  }

  /** Tự ngắm con quái gần nhất trong tầm, không có thì đánh theo hướng đang nhìn. */
  private aim(range: number) {
    let best = range, angle = this.facing;
    this.monsters.forEach((m) => {
      const d = Math.hypot(m.tx - this.predX, m.ty - this.predY);
      if (d < best) { best = d; angle = Math.atan2(m.ty - this.predY, m.tx - this.predX); }
    });
    return angle;
  }

  private me() { return this.state?.players?.get(this.sid); }

  private slash(angle?: number) {
    const me = this.me();
    if (!me || me.dead || this.time.now < this.nextSlash) return;
    this.nextSlash = this.time.now + SKILLS.slash.cooldown;
    const a = angle ?? this.aim(SKILLS.slash.range + 60);
    this.facing = a;
    this.room.send("attack", { angle: a });
    this.fxSlash(this.predX, this.predY, a, 0xffffff);
  }

  private sword() {
    const me = this.me();
    if (!me || me.dead || this.time.now < this.nextSword) return;
    if (me.mp < SKILLS.sword.mp) return ui.toast({ text: "Linh lực không đủ.", tone: "bad" });
    this.nextSword = this.time.now + SKILLS.sword.cooldown;
    const a = this.aim(SKILLS.sword.range);
    this.facing = a;
    this.room.send("skill", { id: "sword", angle: a });
    this.fxSword(this.predX, this.predY, a, SKILLS.sword.range);
  }

  private toggleMeditate() {
    const me = this.me();
    if (!me || me.dead) return;
    this.room.send("meditate", { on: !me.meditating });
  }

  // ---------------- Mạng ----------------

  private setupNetwork() {
    this.room.onStateChange(() => this.reconcile());
    this.room.onMessage("fx", (m: FxMsg) => this.onFx(m));
    this.room.onMessage("dmg", (m: DmgMsg) => this.floatText(m));
    this.room.onMessage("chat", (m: ChatOut) => ui.chat(m));
    this.room.onMessage("toast", (m: ToastMsg) => ui.toast(m));
    ui.chat({ from: "", text: "Chào mừng đạo hữu tới Tiên Giới. Ra khỏi trấn để săn yêu thú, hoặc đả tọa để tích tu vi.", sys: true });
  }

  /** Lấy vị trí server làm gốc rồi chạy lại các input server chưa xử lý. */
  private reconcile() {
    const me = this.me();
    if (!me) return;
    if (!this.hasMe) { this.hasMe = true; this.predX = me.x; this.predY = me.y; }
    if (me.dead) { this.pending.length = 0; this.predX = me.x; this.predY = me.y; return; }
    this.pending = this.pending.filter((i) => i.seq > me.lastSeq);
    const speed = statsFor(me.realm, me.tier).speed * (TICK_MS / 1000);
    let x = me.x, y = me.y;
    for (const i of this.pending) ({ x, y } = moveWithCollision(x, y, i.dx * speed, i.dy * speed, PLAYER_RADIUS));
    this.predX = x; this.predY = y;
  }

  private fixedStep() {
    const me = this.me();
    if (!me || me.dead) return;
    const { dx, dy } = this.moveDir();
    if (Math.hypot(dx, dy) < 0.05) return;
    const msg: InputMsg = { seq: ++this.seq, dx, dy };
    this.room.send("input", msg);
    this.pending.push(msg);
    const speed = statsFor(me.realm, me.tier).speed * (TICK_MS / 1000);
    ({ x: this.predX, y: this.predY } = moveWithCollision(this.predX, this.predY, dx * speed, dy * speed, PLAYER_RADIUS));
    this.facing = Math.atan2(dy, dx);
  }

  // ---------------- Vòng lặp vẽ ----------------

  update(_t: number, deltaMs: number) {
    if (!this.state?.players) return;
    this.acc = Math.min(this.acc + deltaMs, 250);
    while (this.acc >= TICK_MS) { this.acc -= TICK_MS; this.fixedStep(); }

    const k = 1 - Math.exp(-LERP_RATE * (deltaMs / 1000));
    this.syncPlayers(k, deltaMs);
    this.syncMonsters(k);

    const me = this.me();
    if (me) {
      ui.hud(me, this.state.players.size);
      const now = this.time.now;
      ui.cooldown("sk-slash", (this.nextSlash - now) / SKILLS.slash.cooldown);
      ui.cooldown("sk-sword", (this.nextSword - now) / SKILLS.sword.cooldown);
    }
  }

  private syncPlayers(k: number, deltaMs: number) {
    const seen = new Set<string>();
    this.state.players.forEach((p: any, id: string) => {
      seen.add(id);
      const isMe = id === this.sid;
      let e = this.players.get(id);
      if (!e) {
        e = this.makeEntity(isMe ? "me" : "other", p.x, p.y, true);
        if (isMe) this.cameras.main.startFollow(e.root, true, 0.2, 0.2);
        this.players.set(id, e);
      }
      if (isMe) {
        // Bám sát vị trí đoán trước; làm mượt các lần chỉnh nhỏ từ server
        const kk = 1 - Math.exp(-30 * (deltaMs / 1000));
        e.root.x += (this.predX - e.root.x) * kk;
        e.root.y += (this.predY - e.root.y) * kk;
        e.sprite.setFlipX(Math.cos(this.facing) < 0);
        ui.death(p.dead ? Math.max(0, Math.ceil(5 - (this.time.now - (e as any).deadSince) / 1000)) : null);
        if (p.dead && !(e as any).deadSince) (e as any).deadSince = this.time.now;
        if (!p.dead) (e as any).deadSince = 0;
      } else {
        e.tx = p.x; e.ty = p.y;
        e.root.x += (e.tx - e.root.x) * k;
        e.root.y += (e.ty - e.root.y) * k;
        e.sprite.setFlipX(Math.cos(p.angle) < 0);
      }
      e.root.setDepth(e.root.y);
      e.root.setAlpha(p.dead ? 0.35 : 1);
      e.aura!.setVisible(p.meditating);
      const label = `${p.name}\n${realmLabel(p.realm, p.tier)}`;
      if (label !== e.lastLabel) { e.label!.setText(label); e.lastLabel = label; }
      this.drawBar(e.bar, p.hp / p.maxHp, isMe ? 0x6ad06a : 0xd0a040, -30, 28, !isMe || p.hp < p.maxHp);
    });
    for (const [id, e] of this.players) if (!seen.has(id)) { e.root.destroy(); this.players.delete(id); }
  }

  private syncMonsters(k: number) {
    const seen = new Set<string>();
    this.state.monsters.forEach((m: any, id: string) => {
      seen.add(id);
      let e = this.monsters.get(id);
      const def = MONSTER_BY_ID[m.kind];
      if (!e) {
        e = this.makeEntity(`mon-${m.kind}`, m.x, m.y, false);
        if (def.boss) {
          e.label = this.add.text(0, -def.radius - 22, def.name, { fontFamily: "serif", fontSize: "13px", color: "#ffb0a0", stroke: "#000", strokeThickness: 3 }).setOrigin(0.5);
          e.root.add(e.label);
        }
        this.monsters.set(id, e);
      }
      e.tx = m.x; e.ty = m.y;
      e.root.x += (e.tx - e.root.x) * k;
      e.root.y += (e.ty - e.root.y) * k;
      e.root.setDepth(e.root.y);
      e.sprite.setFlipX(Math.cos(m.angle) < 0);
      this.drawBar(e.bar, m.hp / m.maxHp, 0xc0392b, -def.radius - 10, Math.max(24, def.radius * 2), m.hp < m.maxHp);
    });
    for (const [id, e] of this.monsters) {
      if (seen.has(id)) continue;
      this.tweens.add({ targets: e.root, alpha: 0, scale: 0.6, duration: 300, onComplete: () => e.root.destroy() });
      this.monsters.delete(id);
    }
  }

  private makeEntity(texture: string, x: number, y: number, isPlayer: boolean): Entity {
    const root = this.add.container(x, y);
    const sprite = this.add.image(0, isPlayer ? -12 : 0, texture);
    const bar = this.add.graphics();
    const e: Entity = { root, sprite, bar, tx: x, ty: y };
    if (isPlayer) {
      e.aura = this.add.ellipse(0, 6, 54, 22, 0xffe08a, 0.25).setStrokeStyle(2, 0xffe08a, 0.7).setVisible(false);
      this.tweens.add({ targets: e.aura, scaleX: 1.25, scaleY: 1.25, alpha: 0.5, yoyo: true, repeat: -1, duration: 900 });
      e.label = this.add.text(0, -54, "", { fontFamily: "serif", fontSize: "12px", color: "#fff6dc", align: "center", stroke: "#1d1a16", strokeThickness: 3, lineSpacing: -2 }).setOrigin(0.5, 1);
      root.add([e.aura, sprite, bar, e.label]);
    } else {
      root.add([sprite, bar]);
    }
    return e;
  }

  private drawBar(g: Phaser.GameObjects.Graphics, frac: number, color: number, y: number, w: number, visible: boolean) {
    g.clear();
    if (!visible) return;
    g.fillStyle(0x000000, 0.55).fillRect(-w / 2, y, w, 4);
    g.fillStyle(color, 1).fillRect(-w / 2, y, w * Phaser.Math.Clamp(frac, 0, 1), 4);
  }

  // ---------------- Hiệu ứng ----------------

  private onFx(m: FxMsg) {
    if ((m.kind === "slash" || m.kind === "sword") && m.by === this.sid) return; // đã vẽ ngay khi bấm
    switch (m.kind) {
      case "slash": return this.fxSlash(m.x, m.y, m.angle, 0xdfe8f0);
      case "sword": return this.fxSword(m.x, m.y, m.angle, m.range);
      case "mslash": return this.fxSlash(m.x, m.y, m.angle, 0xff6050, 0.6);
      case "levelup": return this.fxLevelUp(m.x, m.y, m.major, m.by === this.sid);
      case "breakfail": return this.fxBreakFail(m.x, m.y);
    }
  }

  private fxSlash(x: number, y: number, angle: number, color: number, scale = 1) {
    const g = this.add.graphics({ x, y: y - 8 }).setDepth(y + 1);
    const r = SKILLS.slash.range * scale, half = SKILLS.slash.arc / 2;
    g.lineStyle(6 * scale, color, 0.9);
    g.beginPath(); g.arc(0, 0, r * 0.8, angle - half, angle + half); g.strokePath();
    g.lineStyle(2, color, 0.5);
    g.beginPath(); g.arc(0, 0, r, angle - half * 0.8, angle + half * 0.8); g.strokePath();
    this.tweens.add({ targets: g, alpha: 0, scale: 1.15, duration: 180, onComplete: () => g.destroy() });
  }

  private fxSword(x: number, y: number, angle: number, range: number) {
    const s = this.add.image(x, y - 10, "swordbeam").setRotation(angle).setDepth(WORLD_H).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: s, x: x + Math.cos(angle) * range, y: y - 10 + Math.sin(angle) * range, duration: 220,
      onComplete: () => this.tweens.add({ targets: s, alpha: 0, duration: 120, onComplete: () => s.destroy() }),
    });
  }

  private fxLevelUp(x: number, y: number, major: boolean, mine: boolean) {
    const color = major ? 0xffd34d : 0xbfe8ff;
    for (let i = 0; i < (major ? 3 : 1); i++) {
      const ring = this.add.circle(x, y, 16, color, 0).setStrokeStyle(3, color, 0.9).setDepth(WORLD_H);
      this.tweens.add({ targets: ring, scale: major ? 7 : 4, alpha: 0, delay: i * 180, duration: 700, onComplete: () => ring.destroy() });
    }
    if (mine) {
      const me = this.me();
      ui.toast({ text: major ? `Đột phá thành công! ${me ? realmLabel(me.realm, me.tier) : ""}` : `Tu vi tinh tiến: ${me ? realmLabel(me.realm, me.tier) : ""}`, tone: "good" });
    }
  }

  private fxBreakFail(x: number, y: number) {
    const puff = this.add.circle(x, y - 10, 20, 0x4a2a5a, 0.6).setDepth(WORLD_H);
    this.tweens.add({ targets: puff, scale: 3, alpha: 0, duration: 800, onComplete: () => puff.destroy() });
  }

  private floatText(m: DmgMsg) {
    const color = m.toPlayer ? "#ff6b5e" : m.crit ? "#ffd34d" : "#ffffff";
    const t = this.add.text(m.x + Phaser.Math.Between(-8, 8), m.y, `${m.crit ? "Bạo! " : ""}${m.amount}`, {
      fontFamily: "serif", fontSize: m.crit ? "20px" : "15px", color, stroke: "#1d1a16", strokeThickness: 3, fontStyle: "bold",
    }).setOrigin(0.5).setDepth(WORLD_H + 1);
    this.tweens.add({ targets: t, y: m.y - 36, alpha: 0, duration: 800, ease: "Cubic.easeOut", onComplete: () => t.destroy() });
  }
}
