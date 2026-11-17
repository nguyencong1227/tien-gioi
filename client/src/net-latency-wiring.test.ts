// Canh MÃ NGUỒN cho bù độ trễ (#873, hướng 2): phần hành vi thật do `check-boss-bar.mjs` (Chrome, RTT bơm vào) và `e2e:nhip-tim` Ca 7 (proxy trễ thật) đảm nhận.
// Test này giữ ba điều dễ vỡ khi sửa WorldScene / main.ts: (1) vùng báo VÀ thanh gồng cùng đi qua MỘT nguồn RTT (không bù lệch giữa ring và hoạt ảnh),
// (2) nguồn đó nối vào nhịp tim thật, (3) bảng ?perf=1 có dòng RTT.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const scene = readFileSync(new URL("./scenes/WorldScene.ts", import.meta.url), "utf8");
const main = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

describe("bù độ trễ vùng cảnh báo: một nguồn RTT cho cả vùng báo và thanh gồng", () => {
  it("`warn` truyền RTT vào lớp vẽ vùng báo", () => {
    expect(scene).toMatch(/this\.telegraphs\.warn\(m,\s*this\.time\.now,\s*this\.rttMs\(\)\)/);
  });

  it("`bossCast` rút ngắn `ms` bằng CÙNG hàm `warnShownMs` và CÙNG nguồn `rttMs()`", () => {
    expect(scene).toMatch(
      /this\.bossFx\.onCast\(\s*m\.by,\s*m\.ability,\s*warnShownMs\(m\.ms,\s*this\.rttMs\(\)\),\s*this\.time\.now\s*\)/,
    );
  });

  it("chỉ MỘT chỗ đọc `rttSource` (trong rttMs): không ai đọc nguồn RTT bằng đường khác", () => {
    expect([...scene.matchAll(/this\.rttSource\(\)/g)]).toHaveLength(1);
    expect(scene).toMatch(/private rttMs\(\): number \| null \{\s*return this\.rttSource\(\);/);
  });

  it("main.ts nối `rttSource` vào nhịp tim của phòng đang nối (đọc `activeHeartbeat` lúc dùng, không chụp một lần)", () => {
    expect(main).toMatch(
      /activeScene\.rttSource\s*=\s*\(\)\s*=>\s*activeHeartbeat\?\.lastRttMs\s*\?\?\s*null/,
    );
  });

  it("bảng ?perf=1 có dòng RTT (id perf-rtt) và cảnh truyền rttMs cho ui.updatePerf", () => {
    expect(html).toContain('id="perf-rtt"');
    expect(scene).toMatch(/ui\.updatePerf\(\{[\s\S]*?rttMs:\s*this\.rttMs\(\)/);
  });
});
