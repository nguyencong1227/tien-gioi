// World giả và các hàm dựng tình huống cho test đơn vị của system (không cần server Colyseus).
import {
  MONSTER_BY_ID,
  TOWN_PX,
  emptyInventory,
  type FxMsg,
  type InvMsg,
  type QuestsMsg,
  type DialogMsg,
  type ToastMsg,
} from "@tien-gioi/shared";
import { WorldState, Player, Monster } from "../schema";
import { World, type PlayerCtrl } from "../world";
import { applyStats } from "./progression";

export function makeWorld() {
  const fx: FxMsg[] = [];
  const toasts: { sid: string; msg: ToastMsg }[] = [];
  const sys: string[] = [];
  const chats: { from: string; text: string }[] = [];
  const invs: { sid: string; msg: InvMsg }[] = [];
  const quests: { sid: string; msg: QuestsMsg }[] = [];
  const dialogs: { sid: string; msg: DialogMsg }[] = [];
  const w = new World(new WorldState(), {
    fx: (m) => fx.push(m),
    dmg: () => {},
    sys: (t) => sys.push(t),
    chat: (from, text) => chats.push({ from, text }),
    toast: (sid, msg) => toasts.push({ sid, msg }),
    inv: (sid, msg) => invs.push({ sid, msg }),
    quests: (sid, msg) => quests.push({ sid, msg }),
    dialog: (sid, msg) => dialogs.push({ sid, msg }),
  });
  return { w, fx, toasts, sys, chats, invs, quests, dialogs };
}

export function addPlayer(w: World, sid: string, realm = 0, tier = 0) {
  const p = new Player();
  p.name = sid;
  p.realm = realm;
  p.tier = tier;
  p.x = TOWN_PX.x + TOWN_PX.r + 400;
  p.y = TOWN_PX.y;
  applyStats(p, true);
  const c: PlayerCtrl = {
    save: { name: sid, secretHash: "", realm, tier, exp: 0, createdAt: "", updatedAt: "" },
    inputs: [],
    moveBudget: 4,
    nextSlash: 0,
    nextSword: 0,
    nextBreak: 0,
    nextChat: 0,
    lastHitAt: 0,
    deadAt: 0,
    inv: emptyInventory(),
    itemCd: new Map(),
    quests: { active: [], done: [], daily: {} },
    frac: { hp: 0, mp: 0, exp: 0, expAt: 0 },
  };
  w.state.players.set(sid, p);
  w.ctrl.set(sid, c);
  return { p, c };
}

export function addMonster(w: World, kind: string, x: number, y: number) {
  const def = MONSTER_BY_ID[kind];
  const id = `m${++w.monsterSeq}`;
  const m = new Monster();
  m.kind = kind;
  m.x = x;
  m.y = y;
  m.hp = def.hp;
  m.maxHp = def.hp;
  w.state.monsters.set(id, m);
  w.mctrl.set(id, {
    def,
    homeX: x,
    homeY: y,
    target: null,
    nextAttack: 0,
    wanderX: x,
    wanderY: y,
    nextWander: 0,
    damageBy: new Map(),
    hpFrac: 0,
  });
  return { id, m, mc: w.mctrl.get(id)! };
}
