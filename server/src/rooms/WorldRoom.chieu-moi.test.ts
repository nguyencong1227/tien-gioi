// Chiêu thức đợt mới (mục 51: CT2-CT5) trên máy chủ Colyseus THẬT: đạn bay (`bolt`), vật thể bền (`zone`), chiêu vận (`windupMs`), luyện chiêu (`mastery`). Kiểm chứng ĐƯỜNG ĐI QUA MẠNG:
// người dùng và người đứng gần nhận đúng `fx` (`pbolt` / `zone` / `fxEnd` / `cast`), sát thương `dmg` tới đúng lúc (không ngay khi bắn), chiêu vận gửi `status` `windup` cho CHỦ,
// điểm luyện đi vào `skills` và được LƯU vào hồ sơ rồi nạp lại. Chiêu thử được thêm tạm vào `SKILL_BY_ID` (dữ liệu thật chưa có chiêu nào dùng các hình này).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import {
  DEFAULT_MAP_ID,
  LEARNABLE_SKILLS,
  PROTOCOL_VERSION,
  SKILL_BY_ID,
  roomNameOf,
  type DmgMsg,
  type FxMsg,
  type SkillDef,
  type SkillsMsg,
  type StatusMsg,
} from "@tien-gioi/shared";
import type { WorldRoom } from "./WorldRoom";
import type { WorldState } from "../schema";
import { listenWithRetry } from "../test-port";
import { addMonster } from "../systems/test-helpers";

const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-chieu-moi-"));
let PORT = 0;
let server: Server;
let loadPlayer: typeof import("../store").loadPlayer;
const rooms: Room[] = [];
const added: string[] = [];

beforeAll(async () => {
  process.env.DATA_DIR = dataDir;
  const mod = await import("./WorldRoom");
  ({ loadPlayer } = await import("../store"));
  server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
  mod.defineRooms(server);
  PORT = await listenWithRetry(server);
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const id of added.splice(0)) {
    delete (SKILL_BY_ID as Record<string, SkillDef>)[id];
    const i = (LEARNABLE_SKILLS as SkillDef[]).findIndex((d) => d.id === id);
    if (i >= 0) (LEARNABLE_SKILLS as SkillDef[]).splice(i, 1);
  }
  await Promise.all(rooms.splice(0).map((r) => r.connection.isOpen && r.leave(true)));
  await sleep(150);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
  rmSync(dataDir, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<T>(
  fn: () => T | undefined | false,
  ms = 6000,
  what = "điều kiện",
): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Hết thời gian chờ: ${what}`);
    await sleep(20);
  }
}

let seq = 0;
const secretOf = (name: string) => `secret-${name.replace(/\s/g, "")}-0123456789abcdef`;
const serverRoom = (room: Room) => matchMaker.getLocalRoomById(room.roomId) as WorldRoom;
const serverState = (room: Room) => serverRoom(room).state as WorldState;
const worldOf = (room: Room) => (serverRoom(room) as any).world;

interface Hero {
  name: string;
  room: Room;
  fx: FxMsg[];
  dmg: DmgMsg[];
  skills: SkillsMsg[];
  status: StatusMsg[];
}

function listen(room: Room, h: Hero) {
  room.onMessage("fx", (m: FxMsg) => h.fx.push(m));
  room.onMessage("dmg", (m: DmgMsg) => h.dmg.push(m));
  room.onMessage("skills", (m: SkillsMsg) => h.skills.push(m));
  room.onMessage("status", (m: StatusMsg) => h.status.push(m));
  for (const t of [
    "chat",
    "toast",
    "party",
    "partyInvited",
    "dialog",
    "inv",
    "wallet",
    "quests",
    "sect",
    "sectVault",
    "sectPresence",
  ])
    room.onMessage(t, () => {});
}

async function spawn(prefix: string, name?: string): Promise<Hero> {
  const nm = name ?? `${prefix} ${++seq}`;
  const client = new Client(`ws://localhost:${PORT}`);
  const room = await client.joinOrCreate(roomNameOf(DEFAULT_MAP_ID), {
    v: PROTOCOL_VERSION,
    name: nm,
    secret: secretOf(nm),
  });
  const h: Hero = { name: nm, room, fx: [], dmg: [], skills: [], status: [] };
  listen(room, h);
  rooms.push(room);
  await waitFor(
    () => (room.state as any)?.players?.get(room.sessionId),
    4000,
    "player state đồng bộ",
  );
  return h;
}

/** Đặt người chơi ngoài trấn, đủ cảnh giới / linh lực, dọn quái ngẫu nhiên, gỡ ô chặn khỏi đường bay; trả World + chỗ đứng. */
function prime(h: Hero) {
  const w = worldOf(h.room);
  const sid = h.room.sessionId;
  const p = serverState(h.room).players.get(sid)!;
  const c = w.ctrl.get(sid);
  p.realm = 4;
  p.x = w.map.townPx.x + w.map.townPx.r + 600;
  p.y = w.map.townPx.y;
  p.hp = p.maxHp;
  p.mp = p.maxMp;
  c.lastHitAt = w.now; // đang combat: không hồi phục làm lệch số
  for (const id of [...w.mctrl.keys()]) {
    w.state.monsters.delete(id);
    w.mctrl.delete(id);
  }
  vi.spyOn(w.map, "isBlockedPx").mockReturnValue(false);
  return { w, sid, p, c };
}

function skill(over: Partial<SkillDef> & { id: string }): SkillDef {
  const def: SkillDef = { ...SKILL_BY_ID["bon_thach_quyen"]!, effects: [], ...over } as SkillDef;
  (SKILL_BY_ID as Record<string, SkillDef>)[def.id] = def;
  (LEARNABLE_SKILLS as SkillDef[]).push(def); // sổ chiêu nạp lại từ hồ sơ chỉ giữ chiêu có trong danh sách học được
  added.push(def.id);
  return def;
}

function equip(h: Hero, def: SkillDef) {
  const c = worldOf(h.room).ctrl.get(h.room.sessionId);
  c.skills.learned[def.id] = 1;
  c.skills.slots[0] = def.id;
}

const monsterHere = (w: any, p: { x: number; y: number }, dx: number) => {
  const m = addMonster(w, "tho", p.x + dx, p.y);
  m.m.hp = m.m.maxHp = 1e12;
  return m;
};

describe("chiêu thức đợt mới qua máy chủ thật (CT2-CT5)", () => {
  it("đạn bay (bolt): chủ và người đứng gần nhận `fx pbolt` đúng điểm bắn / hướng / tốc độ ngay lúc bắn; sát thương `dmg` tới SAU, đúng quái", async () => {
    const a = await spawn("Ban Dan");
    const b = await spawn("Gan Dan");
    const { w, sid, p } = prime(a);
    const pb = serverState(b.room).players.get(b.room.sessionId)!;
    pb.x = p.x + 30;
    pb.y = p.y + 30; // đứng gần để nhận fx
    const def = skill({
      id: "dan_mang",
      shape: "bolt",
      mult: 1,
      range: 400,
      count: 1,
      speed: 400,
      pierce: 0,
      bounce: 0,
      arc: undefined,
      element: "none",
    });
    equip(a, def);
    const m = monsterHere(w, p, 200);
    a.room.send("cast", { slot: 2, angle: 0 });
    const fx = await waitFor(
      () => b.fx.find((f) => f.kind === "pbolt"),
      3000,
      "người gần nhận pbolt",
    );
    expect(fx).toMatchObject({ by: sid, skill: "dan_mang", angle: 0, speed: 400 });
    expect(Math.abs((fx as any).x - p.x)).toBeLessThanOrEqual(1);
    expect((fx as any).ms).toBeGreaterThan(300); // ~ (200 - bán kính) / 400 giây
    expect(a.fx.some((f) => f.kind === "pbolt")).toBe(true);
    // chưa có sát thương lúc vừa bắn
    expect(a.dmg.filter((d) => d.target === m.id)).toEqual([]);
    const hit = await waitFor(
      () => a.dmg.find((d) => d.target === m.id),
      4000,
      "sát thương đạn tới",
    );
    expect(hit.amount).toBeGreaterThan(0);
    expect(m.m.hp).toBeLessThan(1e12);
  }, 20_000);

  it("chiêu vận (windupMs): `fx cast` và `status` `windup` (chậm 50%) gửi ngay cho CHỦ, KHÔNG sát thương trong lúc vận; hết vận mới trúng; trạng thái vận được gỡ", async () => {
    const a = await spawn("Van Khi");
    const { w, sid, p, c } = prime(a);
    const def = skill({
      id: "van_khi_thu",
      shape: "nova",
      mult: 1,
      range: 150,
      windupMs: 900,
      element: "none",
    });
    equip(a, def);
    const m = monsterHere(w, p, 50);
    const t0 = Date.now();
    a.room.send("cast", { slot: 2, angle: 0 });
    await waitFor(
      () => a.fx.find((f) => f.kind === "cast" && (f as any).skill === "van_khi_thu"),
      3000,
      "fx cast lúc bắt đầu",
    );
    const st = await waitFor(
      () => a.status.find((s) => s.list.some((e) => e[0] === "windup")),
      3000,
      "status windup cho chủ",
    );
    expect(st.list.find((e) => e[0] === "windup")![2]).toBeCloseTo(0.5, 5);
    expect(c.windup?.skill).toBe("van_khi_thu");
    await sleep(500);
    expect(a.dmg.filter((d) => d.target === m.id)).toEqual([]); // còn đang vận
    const hit = await waitFor(
      () => a.dmg.find((d) => d.target === m.id),
      4000,
      "sát thương lúc đáp",
    );
    expect(hit.amount).toBeGreaterThan(0);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(800); // không sớm hơn ~windupMs
    await waitFor(
      () => a.status.at(-1)!.list.every((e) => e[0] !== "windup") || c.windup === undefined,
      3000,
      "gỡ trạng thái vận",
    );
    expect(c.windup).toBeUndefined();
    expect(sid).toBeTruthy();
  }, 20_000);

  it("vật thể bền (zone): người gần nhận `fx zone` (id, tâm, bán kính, ms); quái trong vùng bị đánh theo nhịp; chủ RỜI phòng thì người ở lại nhận `fxEnd gone` đúng id", async () => {
    const a = await spawn("Ve Vung");
    const b = await spawn("O Lai Vung");
    const { w, p } = prime(a);
    const pb = serverState(b.room).players.get(b.room.sessionId)!;
    pb.x = p.x + 40;
    pb.y = p.y + 40;
    const def = skill({
      id: "vung_thu",
      shape: "zone",
      mult: 1,
      range: 120,
      reach: 0,
      durationMs: 8000,
      tickMs: 500,
      element: "none",
    });
    equip(a, def);
    const m = monsterHere(w, p, 60);
    a.room.send("cast", { slot: 2, angle: 0 });
    const zone = await waitFor(
      () => b.fx.find((f) => f.kind === "zone"),
      3000,
      "người gần nhận fx zone",
    );
    expect(zone).toMatchObject({ kind: "zone", skill: "vung_thu", r: 120, ms: 8000 });
    expect(typeof (zone as any).id).toBe("number");
    await waitFor(
      () => a.dmg.filter((d) => d.target === m.id).length >= 2,
      5000,
      "vùng đánh theo nhịp (>= 2 lần)",
    );
    await a.room.leave(true);
    const end = await waitFor(
      () => b.fx.find((f) => f.kind === "fxEnd"),
      4000,
      "người ở lại nhận fxEnd",
    );
    expect(end).toMatchObject({ kind: "fxEnd", id: (zone as any).id, why: "gone" });
  }, 25_000);

  it("luyện chiêu (mastery): trúng quái được 1 điểm, tin `skills` mang `mastery`, điểm ĐƯỢC LƯU vào hồ sơ và nạp lại khi vào lại", async () => {
    const name = `Luyen Chieu ${++seq}`;
    const a = await spawn("", name);
    const { w, p } = prime(a);
    const def = skill({
      id: "luyen_thu",
      shape: "line",
      mult: 0.01,
      range: 300,
      width: 80,
      element: "none",
      grade: 3,
    });
    equip(a, def);
    monsterHere(w, p, 100);
    a.room.send("cast", { slot: 2, angle: 0 });
    const withMastery = await waitFor(
      () => a.skills.find((s) => s.mastery?.["luyen_thu"] === 1),
      4000,
      "skills mang mastery 1",
    );
    expect(withMastery.learned["luyen_thu"]).toBe(1);
    // rời phòng: hồ sơ lưu `skills` (kèm điểm luyện)
    await a.room.leave(true);
    await sleep(300);
    const rec = await loadPlayer(name);
    expect(rec?.skills?.mastery?.["luyen_thu"]).toBe(1);
    // vào lại: sổ nạp lại GIỮ điểm luyện và tầng (máy chủ đọc `skills` đã lưu qua `sanitizeSkillBook`)
    const a2 = await spawn("", name);
    const c2 = worldOf(a2.room).ctrl.get(a2.room.sessionId);
    expect(c2.skills.mastery?.["luyen_thu"]).toBe(1);
    expect(c2.skills.learned["luyen_thu"]).toBe(1);
  }, 25_000);
});
