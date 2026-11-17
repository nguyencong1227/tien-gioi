import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

/** Canh nối mã của gặp chặn đường (mục 52, CD7): những chỗ KHÔNG có cách nào kiểm bằng đơn vị mà quên là hỏng trải nghiệm. */
describe("canh nối mã: gặp chặn đường ở main.ts", () => {
  it("nhận `travelTo` thì đóng hộp thoại chặn đường TRƯỚC màn chuyển cảnh (máy chủ không gửi `ambushEnd` lúc bắt đầu trận)", () => {
    const main = read("client/src/main.ts");
    const start = main.indexOf('room.onMessage("travelTo"');
    expect(start).toBeGreaterThan(0);
    const body = main.slice(start, start + 2500);
    const hide = body.indexOf("ui.hideAmbush()");
    const transition = body.indexOf("ui.showTransition(");
    expect(hide, "thiếu ui.hideAmbush() trong bộ xử lý travelTo").toBeGreaterThan(0);
    expect(hide, "hideAmbush phải đứng TRƯỚC showTransition").toBeLessThan(transition);
  });
});

describe("canh nối mã: gặp chặn đường ở WorldScene.ts", () => {
  const scene = read("client/src/scenes/WorldScene.ts");
  it("nhận đủ bốn tin của máy chủ (offer, end, state) qua `reg` (đăng ký lại ở Room mới sau nối lại)", () => {
    for (const k of ["offer", "end", "state"])
      expect(scene, `thiếu reg(AMBUSH_MSG.${k})`).toMatch(
        new RegExp(`reg\\(AMBUSH_MSG\\.${k},\\s*\\(m: unknown\\)\\s*=>\\s*ui\\.onAmbush`),
      );
  });
  it("ba lệnh gửi (seen, choose, flee) đi qua `sendAmbush` (trả true CHỈ khi tin thật sự đi; đang nối lại thì không gửi)", () => {
    for (const k of ["seen", "choose", "flee"])
      expect(scene, `thiếu callback cho AMBUSH_MSG.${k}`).toMatch(
        new RegExp(`this\\.sendAmbush\\(AMBUSH_MSG\\.${k},`),
      );
    expect(scene).toMatch(
      /private sendAmbush\([^)]*\): boolean \{\s*if \(this\.isReconnecting\) return false;/,
    );
  });
});
