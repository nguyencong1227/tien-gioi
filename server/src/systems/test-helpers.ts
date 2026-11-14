// World giả và các hàm dựng tình huống cho test đơn vị của system (không cần server Colyseus).
import { legacyIdentity } from "../identity";
import {
  MONSTER_BY_ID,
  DEFAULT_MAP,
  emptyInventory,
  newSoul,
  type FxMsg,
  type DmgMsg,
  type GameMap,
  type InvMsg,
  type QuestsMsg,
  type WalletMsg,
  type DialogMsg,
  type ToastMsg,
  type ChatOut,
  type PartyMsg,
  type PartyInvitedMsg,
  type LimboMsg,
  type SoulMsg,
  type RebornMsg,
  type DungeonInviteMsg,
  type DungeonEndMsg,
  type DungeonFallenMsg,
  type DungeonStateMsg,
  type SectInvitedMsg,
  type SectMsg,
  type SectPresenceMsg,
  type DuelInvitedMsg,
  type DuelStateMsg,
  type DuelEndMsg,
  type SkillsMsg,
  emptySkillBook,
  originMult,
} from "@tien-gioi/shared";
import { WorldState, Player, Monster } from "../schema";
import { World, type PlayerCtrl } from "../world";
import type { Hub } from "../hub";
import { applyStats } from "./progression";
import { syncPublicPos } from "./movement";

export function makeWorld(map: GameMap = DEFAULT_MAP, hub?: Hub) {
  const fx: FxMsg[] = [];
  const toasts: { sid: string; msg: ToastMsg }[] = [];
  const sys: string[] = [];
  const chats: { from: string; text: string }[] = [];
  const invs: { sid: string; msg: InvMsg }[] = [];
  const quests: { sid: string; msg: QuestsMsg }[] = [];
  const skillMsgs: { sid: string; msg: SkillsMsg }[] = [];
  const wallets: { sid: string; msg: WalletMsg }[] = [];
  const dialogs: { sid: string; msg: DialogMsg }[] = [];
  const parties: { sid: string; msg: PartyMsg }[] = [];
  const invited: { sid: string; msg: PartyInvitedMsg }[] = [];
  const chatsTo: { sid: string; msg: ChatOut }[] = [];
  const limbos: { sid: string; msg: LimboMsg }[] = [];
  const souls: { sid: string; msg: SoulMsg }[] = [];
  const reborns: { sid: string; msg: RebornMsg }[] = [];
  const dungeonInvites: { sid: string; msg: DungeonInviteMsg }[] = [];
  const dungeonEnds: { sid: string; msg: DungeonEndMsg }[] = [];
  const dungeonStates: { sid: string; msg: DungeonStateMsg }[] = [];
  const dungeonFallens: { sid: string; msg: DungeonFallenMsg }[] = [];
  const duelInvites: { sid: string; msg: DuelInvitedMsg }[] = [];
  const duelStates: { sid: string; msg: DuelStateMsg }[] = [];
  const duelEnds: { sid: string; msg: DuelEndMsg }[] = [];
  const sects: { sid: string; msg: SectMsg }[] = [];
  const sectPresences: { sid: string; msg: SectPresenceMsg }[] = [];
  const sectInviteds: { sid: string; msg: SectInvitedMsg }[] = [];
  const dmgs: DmgMsg[] = [];
  const w = new World(
    new WorldState(),
    {
      fx: (m) => fx.push(m),
      dmg: (m) => dmgs.push(m),
      sys: (t) => sys.push(t),
      chat: (from, text) => chats.push({ from, text }),
      toast: (sid, msg) => toasts.push({ sid, msg }),
      inv: (sid, msg) => invs.push({ sid, msg }),
      quests: (sid, msg) => quests.push({ sid, msg }),
      skills: (sid, msg) => skillMsgs.push({ sid, msg }),
      wallet: (sid, msg) => wallets.push({ sid, msg }),
      dialog: (sid, msg) => dialogs.push({ sid, msg }),
      party: (sid, msg) => parties.push({ sid, msg }),
      partyInvited: (sid, msg) => invited.push({ sid, msg }),
      chatTo: (sid, msg) => chatsTo.push({ sid, msg }),
      limbo: (sid, msg) => limbos.push({ sid, msg }),
      soul: (sid, msg) => souls.push({ sid, msg }),
      reborn: (sid, msg) => reborns.push({ sid, msg }),
      dungeonInvite: (sid, msg) => dungeonInvites.push({ sid, msg }),
      dungeonEnd: (sid, msg) => dungeonEnds.push({ sid, msg }),
      dungeonState: (sid, msg) => dungeonStates.push({ sid, msg }),
      dungeonFallen: (sid, msg) => dungeonFallens.push({ sid, msg }),
      duelInvited: (sid, msg) => duelInvites.push({ sid, msg }),
      duelState: (sid, msg) => duelStates.push({ sid, msg }),
      duelEnd: (sid, msg) => duelEnds.push({ sid, msg }),
      sect: (sid, msg) => sects.push({ sid, msg }),
      sectPresence: (sid, msg) => sectPresences.push({ sid, msg }),
      sectInvited: (sid, msg) => sectInviteds.push({ sid, msg }),
    },
    map,
    hub,
  );
  return {
    w,
    fx,
    toasts,
    sys,
    chats,
    invs,
    quests,
    skillMsgs,
    wallets,
    dialogs,
    parties,
    invited,
    chatsTo,
    limbos,
    souls,
    reborns,
    dungeonInvites,
    dungeonEnds,
    dungeonStates,
    dungeonFallens,
    duelInvites,
    duelStates,
    duelEnds,
    sects,
    sectPresences,
    sectInviteds,
    dmgs,
  };
}

export function addPlayer(w: World, sid: string, realm = 0, tier = 0) {
  const p = new Player();
  p.name = sid;
  p.realm = realm;
  p.tier = tier;
  p.x = w.map.townPx.x + w.map.townPx.r + 400;
  p.y = w.map.townPx.y;
  applyStats(p, true);
  syncPublicPos(p);
  const c: PlayerCtrl = {
    save: { name: sid, secretHash: "", realm, tier, exp: 0, createdAt: "", updatedAt: "" },
    identity: legacyIdentity(sid),
    inputs: [],
    moveBudget: 4,
    posPhase: 0,
    nextSlash: 0,
    nextSword: 0,
    nextBreak: 0,
    nextChat: 0,
    lastHitAt: 0,
    deadAt: 0,
    inv: emptyInventory(),
    itemCd: new Map(),
    quests: { active: [], done: [], daily: {} },
    skills: emptySkillBook(),
    skillCd: [0, 0, 0, 0],
    origin: "pham_gia",
    mult: originMult("pham_gia"),
    lifeId: `life-${sid}`,
    life: { playMs: 0, kills: 0, bossKills: 0 },
    soul: newSoul(sid.toLowerCase(), "t"),
    coin: 0,
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
    strideLeft: 0,
  });
  return { id, m, mc: w.mctrl.get(id)! };
}
