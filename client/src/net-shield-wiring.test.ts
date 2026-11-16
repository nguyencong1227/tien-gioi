// Canh MÃ NGUỒN cho hộ thể (mục 33): hành vi thật do `check-net-shield.mjs` (Chrome thật) kiểm; test này giữ để không ai gỡ đường đăng ký tin hay bỏ sót nối dây khi sửa WorldScene / main.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const scene = readFileSync(new URL("./scenes/WorldScene.ts", import.meta.url), "utf8");
const main = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
const conn = readFileSync(new URL("./connection.ts", import.meta.url), "utf8");

describe("mục 33: nối dây phía client", () => {
  it("WorldScene đăng ký tin NET_MSG.shield (`netShield`) và vẽ hộ thể mỗi khung", () => {
    expect(scene).toMatch(/reg\(NET_MSG\.shield,\s*\(m: unknown\)\s*=>\s*this\.onNetShield\(m\)\)/);
    expect(scene).toMatch(/this\.syncShield\(\);/);
  });

  it("nhịp tim chạy ở NET_BEAT_MS (1 giây), vào phòng khai beatMs, nối lại tối đa NET_RECONNECT_GRACE_S", () => {
    expect(main).toMatch(/intervalMs:\s*NET_BEAT_MS/);
    expect(main).toMatch(/GRACE_SECONDS\s*=\s*NET_RECONNECT_GRACE_S/);
    expect(conn).toMatch(/beatMs:\s*NET_BEAT_MS/);
  });

  it("báo 'Đã kết nối lại' ở cả hai đường: nối lại socket và tín hiệu về lại", () => {
    expect(main).toMatch(/text:\s*"Đã kết nối lại\."/);
    expect(main).toMatch(/NET_BACK_TEXT/);
  });
});
