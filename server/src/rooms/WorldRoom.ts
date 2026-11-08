import { Room, Client, ServerError } from "colyseus";
import {
  TICK_MS, PLAYER_RADIUS, MAX_PLAYERS_PER_ROOM, SKILLS, MEDITATE, RESPAWN_MS,
  DEATH_EXP_LOSS, BREAK_FAIL_EXP_LOSS, MONSTERS, MONSTER_BY_ID, MONSTER_CAP, MONSTER_RESPAWN_MS,
  TOWN_PX, WORLD_W, WORLD_H, moveWithCollision, circleBlocked, inTown, dangerAt,
  statsFor, expToNext, isLastTier, isPeak, breakthroughChance, realmLabel, REALMS,
  type InputMsg, type AttackMsg, type SkillMsg, type MeditateMsg, type ChatMsg,
  type FxMsg, type DmgMsg, type ChatOut, type ToastMsg, type JoinOptions, type MonsterKind,
} from "@tien-gioi/shared";
import { WorldState, Player, Monster } from "../schema";
import { loadPlayer, savePlayer, hashSecret, cleanName, type SavedPlayer } from "../store";

/** Dữ liệu riêng của server cho mỗi người chơi (không gửi xuống client). */
interface Ctrl {
  save: SavedPlayer;
  inputs: InputMsg[];
  moveBudget: number; // token bucket chống gửi input quá nhanh
  nextSlash: number;
  nextSword: number;
  nextBreak: number;
  nextChat: number;
  lastHitAt: number;
  deadAt: number;
}

/** Dữ liệu riêng của server cho mỗi con quái. */
interface MCtrl {
  def: MonsterKind;
  homeX: number;
  homeY: number;
  target: string | null;
  nextAttack: number;
  wanderX: number;
  wanderY: number;
  nextWander: number;
  damageBy: Map<string, number>;
}

const SAVE_EVERY_MS = 30_000;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const angleDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

export class WorldRoom extends Room<WorldState> {
  maxClients = MAX_PLAYERS_PER_ROOM;
  autoDispose = false; // thế giới luôn sống, kể cả khi không có ai
  state = new WorldState();

  private ctrl = new Map<string, Ctrl>();
  private mctrl = new Map<string, MCtrl>();
  private monsterSeq = 0;
  private now = Date.now();

  onCreate() {
    this.setPatchRate(TICK_MS);
    this.setSimulationInterval((dt) => this.update(dt), TICK_MS);
    for (const def of MONSTERS) for (let i = 0; i < MONSTER_CAP[def.id]; i++) this.spawnMonster(def);
    this.clock.setInterval(() => this.topUpMonsters(), MONSTER_RESPAWN_MS);
    this.clock.setInterval(() => this.saveAll(), SAVE_EVERY_MS);

    this.onMessage("input", (c, m: InputMsg) => this.onInput(c, m));
    this.onMessage("attack", (c, m: AttackMsg) => this.onAttack(c, m));
    this.onMessage("skill", (c, m: SkillMsg) => this.onSkill(c, m));
    this.onMessage("meditate", (c, m: MeditateMsg) => this.onMeditate(c, m));
    this.onMessage("breakthrough", (c) => this.onBreakthrough(c));
    this.onMessage("chat", (c, m: ChatMsg) => this.onChat(c, m));
  }

  // ---------------- Vào / ra ----------------

  async onAuth(_client: Client, options: JoinOptions) {
    const name = cleanName(options?.name);
    if (!name) throw new ServerError(400, "Tên cần 2–16 ký tự, chỉ gồm chữ, số và khoảng trắng.");
    const secret = typeof options?.secret === "string" ? options.secret : "";
    if (secret.length < 16) throw new ServerError(400, "Thiếu mã nhân vật.");
    for (const p of this.state.players.values()) {
      if (p.name.toLowerCase() === name.toLowerCase()) throw new ServerError(409, "Nhân vật này đang ở trong game.");
    }
    const existing = await loadPlayer(name);
    if (existing) {
      if (existing.secretHash !== hashSecret(secret)) throw new ServerError(403, "Tên này đã có người dùng.");
      return existing;
    }
    const now = new Date().toISOString();
    const fresh: SavedPlayer = { name, secretHash: hashSecret(secret), realm: 0, tier: 0, exp: 0, createdAt: now, updatedAt: now };
    await savePlayer(fresh);
    return fresh;
  }

  onJoin(client: Client, _options: JoinOptions, save: SavedPlayer) {
    const p = new Player();
    p.name = save.name;
    p.realm = Math.min(save.realm, REALMS.length - 1);
    p.tier = Math.min(save.tier, REALMS[p.realm].tiers.length - 1);
    p.exp = save.exp;
    const spot = this.safeSpot(save.x, save.y);
    p.x = spot.x; p.y = spot.y;
    this.applyStats(p, true);
    this.state.players.set(client.sessionId, p);
    this.ctrl.set(client.sessionId, {
      save, inputs: [], moveBudget: 4, nextSlash: 0, nextSword: 0, nextBreak: 0, nextChat: 0, lastHitAt: 0, deadAt: 0,
    });
    this.sys(`${p.name} (${realmLabel(p.realm, p.tier)}) đã nhập thế.`);
  }

  async onLeave(client: Client) {
    const p = this.state.players.get(client.sessionId);
    const c = this.ctrl.get(client.sessionId);
    if (p && c) {
      await this.persist(p, c).catch((e) => console.error("save failed", e));
      this.sys(`${p.name} đã rời đi.`);
    }
    this.state.players.delete(client.sessionId);
    this.ctrl.delete(client.sessionId);
    for (const m of this.mctrl.values()) if (m.target === client.sessionId) m.target = null;
  }

  async onDispose() {
    await this.saveAll();
  }

  private async persist(p: Player, c: Ctrl) {
    const pos = p.dead || inTown(p.x, p.y) ? {} : { x: Math.round(p.x), y: Math.round(p.y) };
    c.save = { ...c.save, realm: p.realm, tier: p.tier, exp: Math.floor(p.exp), x: undefined, y: undefined, ...pos };
    await savePlayer(c.save);
  }

  private async saveAll() {
    const jobs: Promise<void>[] = [];
    this.state.players.forEach((p, id) => {
      const c = this.ctrl.get(id);
      if (c) jobs.push(this.persist(p, c).catch((e) => console.error("save failed", e)));
    });
    await Promise.all(jobs);
  }

  private safeSpot(x?: number, y?: number) {
    if (typeof x === "number" && typeof y === "number" && !circleBlocked(x, y, PLAYER_RADIUS)) return { x, y };
    for (let i = 0; i < 50; i++) {
      const a = rand(0, Math.PI * 2), r = rand(0, TOWN_PX.r * 0.6);
      const sx = TOWN_PX.x + Math.cos(a) * r, sy = TOWN_PX.y + Math.sin(a) * r;
      if (!circleBlocked(sx, sy, PLAYER_RADIUS)) return { x: sx, y: sy };
    }
    return { x: TOWN_PX.x, y: TOWN_PX.y };
  }

  private applyStats(p: Player, heal: boolean) {
    const s = statsFor(p.realm, p.tier);
    p.maxHp = s.maxHp; p.maxMp = s.maxMp;
    p.expMax = expToNext(p.realm, p.tier);
    if (heal) { p.hp = p.maxHp; p.mp = p.maxMp; }
    p.hp = Math.min(p.hp, p.maxHp); p.mp = Math.min(p.mp, p.maxMp);
  }

  // ---------------- Tin nhắn từ client ----------------

  private onInput(client: Client, m: InputMsg) {
    const c = this.ctrl.get(client.sessionId);
    if (!c || typeof m?.seq !== "number" || !Number.isFinite(m.dx) || !Number.isFinite(m.dy)) return;
    if (c.inputs.length < 20) c.inputs.push({ seq: m.seq >>> 0, dx: m.dx, dy: m.dy });
  }

  private ready(client: Client) {
    const p = this.state.players.get(client.sessionId);
    const c = this.ctrl.get(client.sessionId);
    if (!p || !c || p.dead) return null;
    return { p, c };
  }

  private onAttack(client: Client, m: AttackMsg) {
    const r = this.ready(client);
    if (!r || !Number.isFinite(m?.angle) || this.now < r.c.nextSlash) return;
    const { p, c } = r;
    c.nextSlash = this.now + SKILLS.slash.cooldown;
    p.meditating = false;
    p.angle = m.angle;
    this.fx({ kind: "slash", by: client.sessionId, x: p.x, y: p.y, angle: m.angle });
    const s = SKILLS.slash;
    this.state.monsters.forEach((mon, id) => {
      const d = Math.hypot(mon.x - p.x, mon.y - p.y);
      const def = MONSTER_BY_ID[mon.kind];
      if (d > s.range + def.radius) return;
      if (d > def.radius && angleDiff(Math.atan2(mon.y - p.y, mon.x - p.x), m.angle) > s.arc / 2) return;
      this.hitMonster(id, mon, client.sessionId, p, s.mult);
    });
  }

  private onSkill(client: Client, m: SkillMsg) {
    const r = this.ready(client);
    if (!r || m?.id !== "sword" || !Number.isFinite(m.angle)) return;
    const { p, c } = r;
    const s = SKILLS.sword;
    if (this.now < c.nextSword) return;
    if (p.mp < s.mp) return this.toast(client, { text: "Linh lực không đủ.", tone: "bad" });
    c.nextSword = this.now + s.cooldown;
    p.mp -= s.mp;
    p.meditating = false;
    p.angle = m.angle;
    this.fx({ kind: "sword", by: client.sessionId, x: p.x, y: p.y, angle: m.angle, range: s.range });
    const ux = Math.cos(m.angle), uy = Math.sin(m.angle);
    this.state.monsters.forEach((mon, id) => {
      const def = MONSTER_BY_ID[mon.kind];
      const rx = mon.x - p.x, ry = mon.y - p.y;
      const along = rx * ux + ry * uy;
      const perp = Math.abs(rx * uy - ry * ux);
      if (along < -def.radius || along > s.range + def.radius || perp > s.width / 2 + def.radius) return;
      this.hitMonster(id, mon, client.sessionId, p, s.mult);
    });
  }

  private onMeditate(client: Client, m: MeditateMsg) {
    const r = this.ready(client);
    if (!r) return;
    r.p.meditating = !!m?.on;
    if (r.p.meditating) r.c.inputs.length = 0;
  }

  private onBreakthrough(client: Client) {
    const r = this.ready(client);
    if (!r) return;
    const { p, c } = r;
    if (this.now < c.nextBreak) return;
    if (isPeak(p.realm, p.tier)) return this.toast(client, { text: "Đã tới đỉnh tiên đồ.", tone: "info" });
    if (!isLastTier(p.realm, p.tier) || p.exp < p.expMax) {
      return this.toast(client, { text: `Chưa đủ hỏa hầu. Cần đạt đỉnh ${REALMS[p.realm].name} với đầy tu vi.`, tone: "info" });
    }
    c.nextBreak = this.now + 3000;
    p.meditating = false;
    if (Math.random() < breakthroughChance(p.realm)) {
      p.realm += 1; p.tier = 0; p.exp = 0;
      this.applyStats(p, true);
      this.fx({ kind: "levelup", by: client.sessionId, x: p.x, y: p.y, major: true });
      this.sys(`⚡ ${p.name} đột phá thành công, bước vào ${REALMS[p.realm].name}!`);
    } else {
      p.exp = Math.floor(p.exp * (1 - BREAK_FAIL_EXP_LOSS));
      p.hp = Math.max(1, Math.floor(p.hp * 0.5));
      this.fx({ kind: "breakfail", by: client.sessionId, x: p.x, y: p.y });
      this.toast(client, { text: "Đột phá thất bại, chân khí nghịch loạn, tổn hao tu vi.", tone: "bad" });
    }
  }

  private onChat(client: Client, m: ChatMsg) {
    const p = this.state.players.get(client.sessionId);
    const c = this.ctrl.get(client.sessionId);
    if (!p || !c || typeof m?.text !== "string") return;
    const text = m.text.normalize("NFC").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 120);
    if (!text || this.now < c.nextChat) return;
    c.nextChat = this.now + 800;
    this.broadcast("chat", { from: p.name, text } satisfies ChatOut);
  }

  // ---------------- Chiến đấu ----------------

  private hitMonster(id: string, mon: Monster, by: string, p: Player, mult: number) {
    const atk = statsFor(p.realm, p.tier).atk;
    const crit = Math.random() < 0.1;
    const dmg = Math.max(1, Math.round(atk * mult * rand(0.9, 1.1) * (crit ? 1.8 : 1)));
    mon.hp = Math.max(0, mon.hp - dmg);
    const mc = this.mctrl.get(id)!;
    mc.damageBy.set(by, (mc.damageBy.get(by) ?? 0) + dmg);
    mc.target = by;
    this.broadcast("dmg", { target: id, amount: dmg, x: mon.x, y: mon.y - 18, crit } satisfies DmgMsg);
    if (mon.hp <= 0) this.killMonster(id, mon, mc);
  }

  private killMonster(id: string, mon: Monster, mc: MCtrl) {
    const total = [...mc.damageBy.values()].reduce((a, b) => a + b, 0) || 1;
    for (const [sid, dmg] of mc.damageBy) {
      const p = this.state.players.get(sid);
      if (!p || p.dead) continue;
      // Quái càng mạnh, tu vi càng tăng theo cấp số nhân
      const share = Math.max(1, Math.round(mc.def.exp * (dmg / total) * Math.pow(1.35, Math.max(0, MONSTERS.indexOf(mc.def) * 3))));
      this.gainExp(sid, p, share);
    }
    if (mc.def.boss) this.sys(`🐉 ${mc.def.name} đã bị hạ!`);
    this.state.monsters.delete(id);
    this.mctrl.delete(id);
  }

  private gainExp(sid: string, p: Player, amount: number) {
    if (isPeak(p.realm, p.tier)) { p.exp = Math.min(p.expMax, p.exp + amount); return; }
    p.exp += amount;
    while (p.exp >= p.expMax) {
      if (isLastTier(p.realm, p.tier)) { p.exp = p.expMax; break; } // cần Đột phá
      p.exp -= p.expMax;
      p.tier += 1;
      this.applyStats(p, true);
      this.fx({ kind: "levelup", by: sid, x: p.x, y: p.y, major: false });
    }
  }

  private hurtPlayer(sid: string, p: Player, dmg: number, from: Monster) {
    const c = this.ctrl.get(sid);
    if (!c || p.dead) return;
    p.hp = Math.max(0, p.hp - dmg);
    p.meditating = false;
    c.lastHitAt = this.now;
    this.broadcast("dmg", { target: sid, amount: dmg, x: p.x, y: p.y - 20, toPlayer: true } satisfies DmgMsg);
    if (p.hp <= 0) {
      p.dead = true;
      c.deadAt = this.now;
      c.inputs.length = 0;
      p.exp = Math.floor(p.exp * (1 - DEATH_EXP_LOSS));
      const client = this.clients.find((x) => x.sessionId === sid);
      if (client) this.toast(client, { text: `Bị ${MONSTER_BY_ID[from.kind].name} đánh trọng thương, tổn hao tu vi.`, tone: "bad" });
      for (const m of this.mctrl.values()) if (m.target === sid) m.target = null;
    }
  }

  // ---------------- Quái ----------------

  private spawnMonster(def: MonsterKind) {
    for (let i = 0; i < 40; i++) {
      const x = rand(64, WORLD_W - 64), y = rand(64, WORLD_H - 64);
      const d = dangerAt(x, y);
      if (d < def.minDanger || (def.id === "tho" && d > 0.45)) continue;
      if (inTown(x, y, 160) || circleBlocked(x, y, def.radius)) continue;
      const id = `m${++this.monsterSeq}`;
      const m = new Monster();
      m.kind = def.id; m.x = x; m.y = y; m.hp = def.hp; m.maxHp = def.hp;
      this.state.monsters.set(id, m);
      this.mctrl.set(id, { def, homeX: x, homeY: y, target: null, nextAttack: 0, wanderX: x, wanderY: y, nextWander: 0, damageBy: new Map() });
      return;
    }
  }

  private topUpMonsters() {
    const count: Record<string, number> = {};
    for (const m of this.state.monsters.values()) count[m.kind] = (count[m.kind] ?? 0) + 1;
    for (const def of MONSTERS) {
      const missing = MONSTER_CAP[def.id] - (count[def.id] ?? 0);
      for (let i = 0; i < Math.min(missing, 3); i++) this.spawnMonster(def);
    }
  }

  private updateMonster(id: string, m: Monster, mc: MCtrl, dt: number) {
    const def = mc.def;
    let tx = mc.wanderX, ty = mc.wanderY, speed = def.speed * 0.35;

    // Bỏ mục tiêu nếu đã chết, vào trấn, hoặc kéo quá xa
    let target = mc.target ? this.state.players.get(mc.target) : undefined;
    if (target && (target.dead || inTown(target.x, target.y, 20) || Math.hypot(m.x - mc.homeX, m.y - mc.homeY) > 520)) {
      mc.target = null; target = undefined; mc.damageBy.clear();
    }
    if (!target && def.aggro > 0) {
      let best = def.aggro;
      this.state.players.forEach((p, sid) => {
        if (p.dead || inTown(p.x, p.y, 20)) return;
        const d = Math.hypot(p.x - m.x, p.y - m.y);
        if (d < best) { best = d; mc.target = sid; target = p; }
      });
    }

    if (target) {
      const d = Math.hypot(target.x - m.x, target.y - m.y);
      tx = target.x; ty = target.y; speed = def.speed;
      if (d <= def.attackRange + PLAYER_RADIUS) {
        speed = 0;
        m.angle = Math.atan2(target.y - m.y, target.x - m.x);
        if (this.now >= mc.nextAttack) {
          mc.nextAttack = this.now + def.attackCd;
          this.fx({ kind: "mslash", by: id, x: m.x, y: m.y, angle: m.angle });
          this.hurtPlayer(mc.target!, target, Math.round(def.atk * rand(0.85, 1.15)), m);
        }
      }
    } else {
      // Đang đi về nhà hoặc lang thang
      if (Math.hypot(m.x - mc.homeX, m.y - mc.homeY) > 200) { tx = mc.homeX; ty = mc.homeY; speed = def.speed * 0.8; }
      else if (this.now >= mc.nextWander) {
        mc.nextWander = this.now + rand(2000, 6000);
        mc.wanderX = mc.homeX + rand(-90, 90); mc.wanderY = mc.homeY + rand(-90, 90);
      }
      // Hồi máu khi không giao chiến
      m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.05 * dt);
    }

    const dx = tx - m.x, dy = ty - m.y, dist = Math.hypot(dx, dy);
    if (speed > 0 && dist > 4) {
      const step = Math.min(dist, speed * dt);
      const next = moveWithCollision(m.x, m.y, (dx / dist) * step, (dy / dist) * step, def.radius * 0.8);
      if (!inTown(next.x, next.y, def.radius + 8)) { m.x = next.x; m.y = next.y; }
      m.angle = Math.atan2(dy, dx);
    }
  }

  // ---------------- Vòng lặp chính ----------------

  private update(dtMs: number) {
    this.now = Date.now();
    const dt = dtMs / 1000;
    const step = TICK_MS / 1000;

    this.state.players.forEach((p, sid) => {
      const c = this.ctrl.get(sid);
      if (!c) return;

      if (p.dead) {
        if (this.now - c.deadAt >= RESPAWN_MS) {
          const s = this.safeSpot();
          p.x = s.x; p.y = s.y; p.dead = false; p.meditating = false;
          this.applyStats(p, true);
        }
        return;
      }

      // Di chuyển: mỗi input = đúng một bước TICK_MS (client đoán trước y hệt)
      c.moveBudget = Math.min(4, c.moveBudget + 1);
      const speed = statsFor(p.realm, p.tier).speed;
      while (c.inputs.length && c.moveBudget >= 1) {
        const inp = c.inputs.shift()!;
        c.moveBudget -= 1;
        let { dx, dy } = inp;
        const len = Math.hypot(dx, dy);
        if (len > 1) { dx /= len; dy /= len; }
        if (len > 0.05) {
          p.meditating = false;
          const next = moveWithCollision(p.x, p.y, dx * speed * step, dy * speed * step, PLAYER_RADIUS);
          p.x = next.x; p.y = next.y;
          p.angle = Math.atan2(dy, dx);
        }
        p.lastSeq = inp.seq;
      }

      // Hồi phục
      if (p.meditating) {
        p.hp = Math.min(p.maxHp, p.hp + p.maxHp * MEDITATE.hpRegenPct * dt);
        p.mp = Math.min(p.maxMp, p.mp + p.maxMp * MEDITATE.mpRegenPct * dt);
        this.gainExp(sid, p, p.expMax * MEDITATE.expPctPerSec * dt);
      } else {
        p.mp = Math.min(p.maxMp, p.mp + p.maxMp * 0.01 * dt);
        if (this.now - c.lastHitAt > 5000) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * (inTown(p.x, p.y) ? 0.08 : 0.01) * dt);
      }
    });

    this.state.monsters.forEach((m, id) => {
      const mc = this.mctrl.get(id);
      if (mc) this.updateMonster(id, m, mc, dt);
    });
  }

  // ---------------- Tiện ích gửi tin ----------------

  private fx(msg: FxMsg) { this.broadcast("fx", msg); }
  private sys(text: string) { this.broadcast("chat", { from: "Thiên Đạo", text, sys: true } satisfies ChatOut); }
  private toast(client: Client, msg: ToastMsg) { client.send("toast", msg); }
}
