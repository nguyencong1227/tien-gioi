// Kiểm tra tích hợp Mục 33 (bảo vệ tính mạng khi mất kết nối) trên máy chủ Colyseus thật bằng bot (Issue #810).
// Chạy trên cổng ngẫu nhiên độc lập (freePort()), tuyệt đối KHÔNG đụng cổng 2567 (prod) hay các cổng dev.
// Cách dùng:
//   npm run kiem-mat-ket-noi -w server
//   npm run kiem-mat-ket-noi -w server -- --stall=25
//   npm run kiem-mat-ket-noi -w server -- --stall=4
//   npm run kiem-mat-ket-noi -w server -- --case=1
import { mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client } from "colyseus.js";
import express from "express";
import {
  DUEL_MSG,
  NET_BEAT_MS,
  NET_MSG,
  NET_SILENCE_GHOST_MS,
  NET_SPARE_HP_PCT,
  NET_SPARE_SILENCE_MS,
  PROTOCOL_VERSION,
  ROOM_NAME,
  type DuelEndMsg,
  type DuelInvitedMsg,
  type NetShieldMsg,
} from "@tien-gioi/shared";
import { defineRooms, WorldRoom } from "../src/rooms/WorldRoom";
import { Monitor, mountMetrics, renderPrometheus, thresholdsOf } from "../src/metrics";
import { NET_SPARE_MAX, isShielded } from "../src/systems/net-guard";
import { hurtPlayer } from "../src/systems/combat";
import { safeSpot, syncPublicPos } from "../src/systems/movement";
import { addMonster } from "../src/systems/test-helpers";
import { listenWithRetry } from "../src/test-port";
import { assertNotProd } from "./assert-not-prod";
import type { World } from "../src/world";
import type { WorldState } from "../src/schema";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function waitFor<T>(
  fn: () => T | undefined | null | false,
  timeoutMs = 5000,
  stepMs = 50,
): Promise<T> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const res = fn();
    if (res) return res;
    await sleep(stepMs);
  }
  const last = fn();
  if (last) return last;
  throw new Error(`Hết hạn chờ (${timeoutMs}ms) cho điều kiện`);
}

export interface CheckResult {
  id: string;
  name: string;
  passed: boolean;
  detail: string;
  durationMs: number;
}

export interface RunOptions {
  stallSeconds?: number;
  selectedCase?: string;
}

export interface Summary {
  results: CheckResult[];
  allPassed: boolean;
}

const METRICS_TOKEN = "kiem-mat-ket-noi-token";

export async function runNetGuardChecks(opts: RunOptions = {}): Promise<Summary> {
  const stallSeconds = opts.stallSeconds ?? 25;
  const selectedCase = opts.selectedCase ?? "all";

  // Thư mục dữ liệu tạm riêng
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-net-guard-"));
  process.env.DATA_DIR = dataDir;

  const app = express();
  const monitor = new Monitor(WorldRoom.hub, {
    store: "file",
    thresholds: thresholdsOf(process.env).value,
  });
  mountMetrics(app, { env: { ...process.env, METRICS_TOKEN }, monitor });
  monitor.start();

  const httpServer = http.createServer(app);
  const server = new Server({
    transport: new WebSocketTransport({ server: httpServer }),
    gracefullyShutdown: false,
  });
  defineRooms(server);

  const PORT = await listenWithRetry(server);
  assertNotProd(PORT, "kiem-mat-ket-noi");

  const results: CheckResult[] = [];

  const getMetric = async (name: string): Promise<number> => {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/metrics`, {
        headers: { Authorization: `Bearer ${METRICS_TOKEN}` },
      });
      if (res.ok) {
        const text = await res.text();
        const re = new RegExp(`^${name}(?:\\{[^}]*\\})?\\s+(\\d+(?:\\.\\d+)?)$`, "m");
        const m = text.match(re);
        if (m) return Number(m[1]);
      }
    } catch {
      // Fallback khi endpoint chưa sẵn sàng
    }
    const text = renderPrometheus(monitor.snapshot());
    const re = new RegExp(`^${name}(?:\\{[^}]*\\})?\\s+(\\d+(?:\\.\\d+)?)$`, "m");
    const m = text.match(re);
    return m ? Number(m[1]) : 0;
  };

  const secretOf = (name: string) => `secret-${name}-0123456789abcdef`;

  let nameSeq = 0;
  const joinBot = async (opts: { name?: string; beatMs?: number | null } = {}) => {
    const name = opts.name ?? `BotNet ${++nameSeq}`;
    const client = new Client(`ws://127.0.0.1:${PORT}`);
    const joinPayload: Record<string, unknown> = {
      name,
      secret: secretOf(name),
      v: PROTOCOL_VERSION,
    };
    if (opts.beatMs !== undefined && opts.beatMs !== null) {
      joinPayload.beatMs = opts.beatMs;
    }
    const room = await client.joinOrCreate(ROOM_NAME, joinPayload);
    // Bỏ qua các tin thông thường để không làm bẩn log
    for (const t of [
      "inv",
      "quests",
      "skills",
      "wallet",
      "soul",
      "chat",
      "pong",
      "fx",
      "dmg",
      "toast",
      "dialog",
      "duelInvited",
      "duelState",
      "duelEnd",
      "sect",
      "party",
      "limbo",
      "status",
    ]) {
      room.onMessage(t, () => {});
    }
    const shields: NetShieldMsg[] = [];
    room.onMessage(NET_MSG.shield, (m: NetShieldMsg) => shields.push(m));
    const localRoom = matchMaker.getLocalRoomById(room.roomId) as WorldRoom;
    const w = (localRoom as any).world as World;
    await waitFor(() => (localRoom.state as WorldState).players.get(room.sessionId), 4000);
    const p = (localRoom.state as WorldState).players.get(room.sessionId)!;
    const c = w.ctrl.get(room.sessionId)!;
    return { client, room, localRoom, w, p, c, shields, name };
  };

  try {
    // -----------------------------------------------------------------------------------------
    // Ca 1: Đứng giữa đàn quái, socket "đứng" 25s (hoặc stallSeconds)
    // -----------------------------------------------------------------------------------------
    if (selectedCase === "all" || selectedCase === "1") {
      const t0 = Date.now();
      try {
        const bot = await joinBot({ beatMs: NET_BEAT_MS });
        const { room, w, p, c, shields } = bot;

        // Vài nhịp ping đầu
        for (let i = 0; i < 3; i++) {
          room.send("ping", { t: i });
          await sleep(100);
        }

        // Đưa nhân vật ra dã ngoại ngoài trấn
        const spot = safeSpot(w.map);
        let wildX = spot.x + 350;
        let wildY = spot.y + 350;
        while (w.map.isBlockedPx(wildX, wildY) || w.map.inSafe(wildX, wildY, 40)) {
          wildX += 32;
          wildY += 32;
        }
        p.x = wildX;
        p.y = wildY;
        syncPublicPos(p);

        // Chuẩn bị thể lực cho bot đủ sống sót qua 3 giây đầu trước khi thành hồn lìa xác
        p.maxHp = 5000;
        p.hp = 5000;

        // Đặt >= 3 quái cận chiến / tầm xa mạnh sát nhân vật
        const m1 = addMonster(w, "ho", p.x + 15, p.y);
        const m2 = addMonster(w, "lang", p.x - 15, p.y);
        const m3 = addMonster(w, "suong_ho", p.x, p.y + 20);
        for (const m of [m1, m2, m3]) {
          m.mc.homeX = m.m.x;
          m.mc.homeY = m.m.y;
          m.mc.target = room.sessionId;
          m.mc.nextAttack = 0;
        }

        try {
          // Socket "đứng" (ngừng gửi tin, socket vẫn mở)
          // Chờ 3.2s: đạt ngưỡng NET_SILENCE_GHOST_MS (3000ms)
          await sleep(3200);

          if (!w.ghosts.has(room.sessionId)) {
            throw new Error("Chưa thành hồn lìa xác sau 3.2s im lặng (w.ghosts không có sid)");
          }
          if (!c.silent) {
            throw new Error("c.silent chưa thành true sau 3.2s im lặng");
          }
          if (m1.mc.target !== null || m2.mc.target !== null || m3.mc.target !== null) {
            throw new Error("Quái chưa bỏ mục tiêu khi người chơi thành hồn lìa xác");
          }
          const hpAtGhost = p.hp;
          if (hpAtGhost <= 0 || p.dead) {
            throw new Error("Nhân vật đã chết tại/trước thời điểm thành hồn lìa xác");
          }
          if (c.limbo !== undefined) {
            throw new Error("Nhân vật đã vào Hoàng Tuyền");
          }

          // Chờ hết thời gian stall còn lại
          const remainStall = Math.max(0, stallSeconds * 1000 - 3200);
          if (remainStall > 0) await sleep(remainStall);

          if (!room.connection.isOpen) {
            throw new Error("Socket bị đóng bất thường trong khi stall");
          }
          if (p.hp !== hpAtGhost) {
            throw new Error(`Khí huyết bị giảm trong lúc ghost: trước ${hpAtGhost}, sau ${p.hp}`);
          }
          if (p.dead || c.limbo !== undefined) {
            throw new Error("Nhân vật bị chết/vào Hoàng Tuyền trong lúc stall");
          }

          // Kiểm tra Prometheus metric tiengioi_room_net_silent_total
          const silentMetric = await getMetric("tiengioi_room_net_silent_total");
          if (silentMetric < 1 && w.netStats.silent < 1) {
            throw new Error(
              `Metric tiengioi_room_net_silent_total (${silentMetric}) và w.netStats.silent (${w.netStats.silent}) không tăng`,
            );
          }

          // Client có tin lại -> ra khỏi ghost + hộ thể + nhận netShield resume
          room.send("ping", { t: 999 });
          await waitFor(() => !w.ghosts.has(room.sessionId), 3000);
          if (c.silent) throw new Error("c.silent vẫn là true sau khi gửi tin lại");
          if (!isShielded(w, room.sessionId)) {
            throw new Error("Nhân vật không nhận được hộ thể khi có tin lại");
          }
          await waitFor(() => shields.find((s) => s.reason === "resume"), 3000);
          if (m1.mc.target === room.sessionId || m2.mc.target === room.sessionId) {
            throw new Error("Quái nhắm lại người chơi trong khi đang hộ thể");
          }

          // Mutation check: trong thời gian hộ thể, hurtPlayer phải bị từ chối
          const hitInShield = hurtPlayer(w, room.sessionId, p, 50, { kind: "lang" });
          if (hitInShield) {
            throw new Error("Đòn đánh vẫn trúng khi đang hộ thể (isShielded bị bỏ qua)");
          }

          results.push({
            id: "ca_1",
            name: `1. Stall ${stallSeconds}s giữa đàn quái -> ghost, bất tử, có tin lại hộ thể`,
            passed: true,
            detail: `Ghost sau 3.2s, hp giữ ${hpAtGhost}/${p.maxHp}, socket mở ${stallSeconds}s, metric=${silentMetric}, resume shield OK`,
            durationMs: Date.now() - t0,
          });
        } finally {
          // Dọn dẹp quái và ngắt bot
          for (const m of [m1, m2, m3]) {
            if (m?.id) {
              w.state.monsters.delete(m.id);
              w.mctrl.delete(m.id);
            }
          }
          await room.leave(true).catch(() => {});
        }
      } catch (err: any) {
        results.push({
          id: "ca_1",
          name: `1. Stall ${stallSeconds}s giữa đàn quái -> ghost, bất tử, có tin lại hộ thể`,
          passed: false,
          detail: `LỖI: ${err.message ?? String(err)}`,
          durationMs: Date.now() - t0,
        });
      }
    }

    // -----------------------------------------------------------------------------------------
    // Ca 2: Bị hạ khi im lặng 2-3 s: lần 1-3 được tha, lần 4 CHẾT THẬT (hạn mức #808)
    // -----------------------------------------------------------------------------------------
    if (selectedCase === "all" || selectedCase === "2") {
      const t0 = Date.now();
      try {
        const bot = await joinBot({ beatMs: NET_BEAT_MS });
        const { room, w, p, c } = bot;
        w.reincarnate = true; // Bật luân hồi để chết thật sẽ vào Hoàng Tuyền (limbo)

        // Vô hiệu hoá quái sinh lại trong Ca 2 để không có quái dã ngoại chém trộm
        // làm kích hoạt sớm spare/shield (nguyên nhân gây chập chờn dưới tải CI, #752).
        const origCapOf = w.map.monsterCapOf.bind(w.map);
        w.map.monsterCapOf = () => 0;
        w.state.monsters.clear();
        w.mctrl.clear();

        const audits: { ev: string; fields: Record<string, unknown> }[] = [];
        const prevAudit = w.audit;
        w.audit = (ev, fields) => {
          audits.push({ ev, fields: fields as Record<string, unknown> });
          prevAudit?.(ev, fields);
        };

        const spot = safeSpot(w.map);
        let wildX = spot.x + 300;
        let wildY = spot.y + 300;
        while (w.map.isBlockedPx(wildX, wildY) || w.map.inSafe(wildX, wildY, 40)) {
          wildX += 32;
          wildY += 32;
        }

        try {
          for (let i = 1; i <= 4; i++) {
            // Dọn sạch quái dã ngoại
            w.state.monsters.clear();
            w.mctrl.clear();

            // Gỡ hộ thể và ghost nếu còn từ lần trước
            c.shieldUntil = undefined;
            w.shielded.delete(room.sessionId);
            w.ghosts.delete(room.sessionId);
            c.silent = false;
            c.silentSince = undefined;

            // Đưa nhân vật ra dã ngoại
            p.x = wildX;
            p.y = wildY;
            syncPublicPos(p);

            // Client gửi 1 ping và đợi máy chủ ghi nhận mốc lastHeardAt mới
            const prevHeard = c.lastHeardAt;
            room.send("ping", { t: Date.now() });
            await waitFor(() => c.lastHeardAt !== prevHeard, 3000);

            // Đẩy mốc im lặng xác định 2200ms trước thời điểm tick hiện tại của máy chủ.
            // Xác định 100% trong khoảng [NET_SPARE_SILENCE_MS, NET_SILENCE_GHOST_MS) = [2000, 3000),
            // loại bỏ hoàn toàn việc sleep thời gian thực có thể bị trôi dưới tải cao hoặc bị quái cắn trộm.
            c.lastHeardAt = w.now - 2200;

            const currentSilence = w.now - c.lastHeardAt;
            if (currentSilence >= NET_SILENCE_GHOST_MS) {
              throw new Error(
                `Lần ${i}: Im lặng quá ${NET_SILENCE_GHOST_MS}ms (${currentSilence}ms) trước khi kết liễu`,
              );
            }
            if (currentSilence < NET_SPARE_SILENCE_MS) {
              throw new Error(
                `Lần ${i}: Chưa đạt ngưỡng ${NET_SPARE_SILENCE_MS}ms (${currentSilence}ms)`,
              );
            }

            // Máu thấp, quái tung đòn kết liễu
            p.hp = 1;
            hurtPlayer(w, room.sessionId, p, 1e6, { kind: "lang" });

            if (i <= 3) {
              // Lần 1-3: ĐƯỢC THA CHẾT
              if (p.dead) throw new Error(`Lần ${i}: p.dead là true (bị chết thật)`);
              if (c.limbo !== undefined) throw new Error(`Lần ${i}: c.limbo tồn tại (bị mất kiếp)`);
              if (!w.map.inSafe(p.x, p.y)) {
                throw new Error(`Lần ${i}: Nhân vật không được hồi ở điểm an toàn`);
              }
              const expectedHp = Math.max(1, Math.round(p.maxHp * NET_SPARE_HP_PCT));
              if (p.hp !== expectedHp) {
                throw new Error(
                  `Lần ${i}: Máu không phải 10% maxHp (có ${p.hp}, kỳ vọng ${expectedHp})`,
                );
              }
              if (w.netStats.spared !== i) {
                throw new Error(
                  `Lần ${i}: w.netStats.spared là ${w.netStats.spared}, kỳ vọng ${i}`,
                );
              }
              const sparedAudit = audits.filter((a) => a.ev === "net.spared").at(-1);
              if (!sparedAudit || sparedAudit.fields.inWindow !== i) {
                throw new Error(`Lần ${i}: Thiếu audit net.spared với inWindow = ${i}`);
              }
            } else {
              // Lần 4: HẾT HẠN MỨC 3 LẦN / 10 PHÚT -> CHẾT THẬT (Hoàng Tuyền)
              if (c.limbo === undefined) {
                throw new Error("Lần 4: c.limbo là undefined (vẫn được tha dù đã hết hạn mức!)");
              }
              if (w.netStats.spared !== NET_SPARE_MAX) {
                throw new Error(
                  `Lần 4: w.netStats.spared là ${w.netStats.spared}, kỳ vọng giữ nguyên ${NET_SPARE_MAX}`,
                );
              }
              if (w.netStats.spareDenied !== 1) {
                throw new Error(
                  `Lần 4: w.netStats.spareDenied là ${w.netStats.spareDenied}, kỳ vọng 1`,
                );
              }
              const deniedAudit = audits.find((a) => a.ev === "net.spare_denied");
              if (!deniedAudit || deniedAudit.fields.inWindow !== NET_SPARE_MAX) {
                throw new Error(
                  `Lần 4: Thiếu audit net.spare_denied với inWindow = ${NET_SPARE_MAX}`,
                );
              }
              const metricDenied = await getMetric("tiengioi_room_net_spare_denied_total");
              if (metricDenied !== 1 && w.netStats.spareDenied !== 1) {
                throw new Error(
                  `Lần 4: Metric tiengioi_room_net_spare_denied_total là ${metricDenied}, kỳ vọng 1`,
                );
              }
            }
          }
        } finally {
          w.map.monsterCapOf = origCapOf;
          await room.leave(true).catch(() => {});
        }

        results.push({
          id: "ca_2",
          name: "2. Bị hạ khi im lặng 2-3s: lần 1-3 tha chết, lần 4 CHẾT THẬT (hạn mức #808)",
          passed: true,
          detail: `Tha 3 lần về safe spot (10% HP) + net.spared, lần 4 chết thật (limbo) + net.spare_denied + metric=1`,
          durationMs: Date.now() - t0,
        });
      } catch (err: any) {
        results.push({
          id: "ca_2",
          name: "2. Bị hạ khi im lặng 2-3s: lần 1-3 tha chết, lần 4 CHẾT THẬT (hạn mức #808)",
          passed: false,
          detail: `LỖI: ${err.message ?? String(err)}`,
          durationMs: Date.now() - t0,
        });
      }
    }

    // -----------------------------------------------------------------------------------------
    // Ca 3: Đối chứng: im lặng < 2s bị hạ -> chết thật; client CŨ không áp luật im lặng
    // -----------------------------------------------------------------------------------------
    if (selectedCase === "all" || selectedCase === "3") {
      const t0 = Date.now();
      try {
        // 3a. Client mới nhưng im lặng < 2s rồi bị hạ (ở dã ngoại)
        const bot3a = await joinBot({ beatMs: NET_BEAT_MS });
        bot3a.w.reincarnate = true;
        const audits3a: string[] = [];
        bot3a.w.audit = (ev) => audits3a.push(ev);

        const spot3a = safeSpot(bot3a.w.map);
        let wildX3a = spot3a.x + 300;
        let wildY3a = spot3a.y + 300;
        while (
          bot3a.w.map.isBlockedPx(wildX3a, wildY3a) ||
          bot3a.w.map.inSafe(wildX3a, wildY3a, 40)
        ) {
          wildX3a += 32;
          wildY3a += 32;
        }
        bot3a.p.x = wildX3a;
        bot3a.p.y = wildY3a;
        syncPublicPos(bot3a.p);

        bot3a.room.send("ping", { t: 1 });
        await waitFor(() => bot3a.c.lastHeardAt !== undefined, 3000);
        bot3a.c.lastHeardAt = bot3a.w.now - 300; // Im lặng 300ms < 2000ms

        bot3a.p.hp = 1;
        hurtPlayer(bot3a.w, bot3a.room.sessionId, bot3a.p, 1e6, { kind: "lang" });

        if (bot3a.c.limbo === undefined) {
          throw new Error("3a: Im lặng < 2s nhưng không chết thật (c.limbo là undefined)");
        }
        if (audits3a.includes("net.spared")) {
          throw new Error("3a: Sinh audit net.spared dù im lặng < 2s");
        }
        await bot3a.room.leave(true);

        // 3b. Client CŨ (không khai beatMs)
        const bot3b = await joinBot({ beatMs: null });
        bot3b.w.reincarnate = true;
        bot3b.p.x = wildX3a;
        bot3b.p.y = wildY3a;
        syncPublicPos(bot3b.p);

        if (bot3b.c.beatMs !== undefined) {
          throw new Error("3b: beatMs của client cũ không phải undefined");
        }

        // Đặt mốc 3.5s trước (> 3s NET_SILENCE_GHOST_MS) và đợi 1 nhịp tick để tickNetGuard chạy
        bot3b.c.lastHeardAt = bot3b.w.now - 3500;
        await sleep(60);

        if (bot3b.w.ghosts.has(bot3b.room.sessionId)) {
          throw new Error("3b: Client cũ bị coi là ghost sau 3.5s im lặng");
        }
        if (bot3b.c.silent) {
          throw new Error("3b: c.silent của client cũ bị đổi thành true");
        }

        bot3b.p.hp = 1;
        hurtPlayer(bot3b.w, bot3b.room.sessionId, bot3b.p, 1e6, { kind: "lang" });
        if (bot3b.c.limbo === undefined) {
          throw new Error("3b: Client cũ không chết thật khi bị quái hạ");
        }
        await bot3b.room.leave(true);

        results.push({
          id: "ca_3",
          name: "3. Đối chứng: im lặng < 2s chết thật; client CŨ không bao giờ áp luật im lặng",
          passed: true,
          detail:
            "3a: silence < 2s -> chết thật (limbo); 3b: client cũ im lặng 3.5s không ghost -> chết thật",
          durationMs: Date.now() - t0,
        });
      } catch (err: any) {
        results.push({
          id: "ca_3",
          name: "3. Đối chứng: im lặng < 2s chết thật; client CŨ không bao giờ áp luật im lặng",
          passed: false,
          detail: `LỖI: ${err.message ?? String(err)}`,
          durationMs: Date.now() - t0,
        });
      }
    }

    // -----------------------------------------------------------------------------------------
    // Ca 4: PK thách đấu + một bên đứng 4 s -> trận huỷ HOÀ (lý do disconnect)
    // -----------------------------------------------------------------------------------------
    if (selectedCase === "all" || selectedCase === "4") {
      const t0 = Date.now();
      try {
        const heroA = await joinBot({ name: "DauSiA", beatMs: NET_BEAT_MS });
        const heroB = await joinBot({ name: "DauSiB", beatMs: NET_BEAT_MS });
        const { w } = heroA;

        // Đưa cả 2 ra ngoài trấn, sát nhau
        const spot = safeSpot(w.map);
        let duelX = spot.x + 400;
        let duelY = spot.y + 400;
        while (w.map.isBlockedPx(duelX, duelY) || w.map.inSafe(duelX, duelY, 40)) {
          duelX += 32;
          duelY += 32;
        }

        heroA.p.x = duelX;
        heroA.p.y = duelY;
        syncPublicPos(heroA.p);

        heroB.p.x = duelX + 35;
        heroB.p.y = duelY;
        syncPublicPos(heroB.p);

        // Dọn dẹp quái xung quanh
        w.state.monsters.clear();
        w.mctrl.clear();
        heroA.c.lastHitAt = 0;
        heroB.c.lastHitAt = 0;

        const aEnds: DuelEndMsg[] = [];
        const bEnds: DuelEndMsg[] = [];
        heroA.room.onMessage(DUEL_MSG.end, (m: DuelEndMsg) => aEnds.push(m));
        heroB.room.onMessage(DUEL_MSG.end, (m: DuelEndMsg) => bEnds.push(m));

        const bInvited: DuelInvitedMsg[] = [];
        heroB.room.onMessage(DUEL_MSG.invited, (m: DuelInvitedMsg) => bInvited.push(m));

        // A thách đấu B
        heroA.room.send(DUEL_MSG.challenge, { name: heroB.name });
        await waitFor(() => bInvited.length > 0, 3000);

        // B chấp nhận
        heroB.room.send(DUEL_MSG.accept, { from: heroA.name });
        await waitFor(() => w.duels.of(heroA.room.sessionId), 3000);

        // Bỏ qua đếm ngược (đưa fightAt về quá khứ)
        const d = w.duels.of(heroA.room.sessionId)!;
        d.fightAt = Date.now() - 1;

        // B bắt đầu "đứng" (ngừng gửi tin). A tiếp tục gửi ping đều đặn mỗi 500ms
        const aPinger = setInterval(() => {
          if (heroA.room.connection.isOpen) {
            heroA.room.send("ping", { t: Date.now() });
          }
        }, 400);

        // Chờ 3.8s (B im lặng > 3s -> thành ghost -> tickDuels huỷ trận với lý do disconnect)
        await sleep(3800);
        clearInterval(aPinger);

        await waitFor(() => aEnds.length > 0 && bEnds.length > 0, 3000);

        const endA = aEnds[0];
        const endB = bEnds[0];
        if (endA.result !== "draw" || endA.reason !== "disconnect") {
          throw new Error(
            `A nhận kết quả duel sai: result=${endA.result}, reason=${endA.reason} (kỳ vọng draw / disconnect)`,
          );
        }
        if (endB.result !== "draw" || endB.reason !== "disconnect") {
          throw new Error(
            `B nhận kết quả duel sai: result=${endB.result}, reason=${endB.reason} (kỳ vọng draw / disconnect)`,
          );
        }
        if (w.duels.of(heroA.room.sessionId) !== undefined) {
          throw new Error("Trận duel của A chưa được giải phóng");
        }
        if (w.duels.of(heroB.room.sessionId) !== undefined) {
          throw new Error("Trận duel của B chưa được giải phóng");
        }

        await heroA.room.leave(true);
        await heroB.room.leave(true);

        results.push({
          id: "ca_4",
          name: "4. PK thách đấu + một bên đứng 4s -> trận huỷ HOÀ (lý do disconnect)",
          passed: true,
          detail:
            "A và B đều nhận duelEnd { result: 'draw', reason: 'disconnect' }, dọn sạch duel state",
          durationMs: Date.now() - t0,
        });
      } catch (err: any) {
        results.push({
          id: "ca_4",
          name: "4. PK thách đấu + một bên đứng 4s -> trận huỷ HOÀ (lý do disconnect)",
          passed: false,
          detail: `LỖI: ${err.message ?? String(err)}`,
          durationMs: Date.now() - t0,
        });
      }
    }
  } finally {
    await server.gracefullyShutdown(false);
    monitor.stop();
    rmSync(dataDir, { recursive: true, force: true });
  }

  const allPassed = results.length > 0 && results.every((r) => r.passed);
  return { results, allPassed };
}

export function printResultsTable(summary: Summary): void {
  console.log("\n================================================================================");
  console.log("       BÁO CÁO KIỂM TRA TÍCH HỢP MỤC 33 BẰNG BOT TRÊN MÁY CHỦ THẬT");
  console.log("================================================================================");
  console.log(
    `| ${"Ca kiểm tra".padEnd(42)} | ${"Kết quả".padEnd(8)} | ${"Thời gian".padEnd(9)} |`,
  );
  console.log(`|${"-".repeat(44)}|${"-".repeat(10)}|${"-".repeat(11)}|`);

  for (const r of summary.results) {
    const status = r.passed ? "  ĐẠT   " : "  ĐỎ    ";
    const dur = `${(r.durationMs / 1000).toFixed(1)}s`.padStart(8);
    console.log(`| ${r.name.slice(0, 42).padEnd(42)} | ${status} | ${dur}  |`);
    console.log(`|   -> ${r.detail.slice(0, 72).padEnd(72)} |`);
  }
  console.log("================================================================================");
  console.log(`TỔNG KẾT: ${summary.allPassed ? "TẤT CẢ ĐẠT (XANH)" : "CÓ CA THẤT BẠI (ĐỎ)"}\n`);
}

// Chạy trực tiếp từ CLI
if (
  process.argv[1]?.endsWith("kiem-mat-ket-noi.ts") ||
  process.argv[1]?.endsWith("kiem-mat-ket-noi")
) {
  const stallArg = process.argv.find((a) => a.startsWith("--stall="));
  const stallSeconds = stallArg ? Number(stallArg.split("=")[1]) : 25;

  const caseArg = process.argv.find((a) => a.startsWith("--case="));
  const selectedCase = caseArg ? caseArg.split("=")[1] : "all";

  console.log(
    `[KIỂM MẤT KẾT NỐI] Bắt đầu kiểm tra mục 33 (stallSeconds=${stallSeconds}, case=${selectedCase})...`,
  );

  runNetGuardChecks({ stallSeconds, selectedCase })
    .then((summary) => {
      printResultsTable(summary);
      process.exit(summary.allPassed ? 0 : 1);
    })
    .catch((err) => {
      console.error("[LỖI KHỞI CHẠY]", err);
      process.exit(1);
    });
}
