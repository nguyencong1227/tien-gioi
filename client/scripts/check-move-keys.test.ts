import { describe, expect, it } from "vitest";
import { isSlowMachine, latencyLimit, speedBase } from "./check-move-keys.mjs";

describe("check-move-keys: chuẩn tốc độ và nhận diện máy chậm (nit của A ở #1391)", () => {
  it("chuẩn = trung vị 3 giây sau giây khởi động, không phải giây nhanh nhất", () => {
    // số A đo trên máy tải nặng (khung nhìn 2): 87 / 95 / 95 / 150; giây đầu là khởi động
    expect(speedBase([87, 95, 95, 150])).toBe(95);
    expect(speedBase([32, 40, 47, 40])).toBe(40);
    // máy nhanh: 150 / 158 / 158 / 158 -> 158
    expect(speedBase([150, 158, 158, 158])).toBe(158);
    // không đổi mảng đầu vào (script còn in các giây)
    const w = [87, 95, 95, 150];
    speedBase(w);
    expect(w).toEqual([87, 95, 95, 150]);
  });

  it("ca A: trung vị 95 < 110 nên là máy chậm (lấy max 150 thì KHÔNG chậm và ngưỡng 0,4 x 150 = 60 đòi hơn mức thật 55 px)", () => {
    expect(isSlowMachine({ base: speedBase([87, 95, 95, 150]), frameMs: 17 })).toBe(true);
    expect(isSlowMachine({ base: Math.max(95, 95, 150), frameMs: 17 })).toBe(false); // bản cũ
  });

  it("máy nhanh vẫn nhanh: chuẩn 158 và khung 17 ms không bị coi là chậm (giữ ngưỡng tỉ lệ chặt)", () => {
    expect(isSlowMachine({ base: speedBase([150, 158, 158, 158]), frameMs: 17 })).toBe(false);
  });

  it("khung hình dài (> 40 ms) là chậm dù chuẩn còn cao", () => {
    expect(isSlowMachine({ base: 158, frameMs: 41 })).toBe(true);
    expect(isSlowMachine({ base: 158, frameMs: 40 })).toBe(false);
  });

  it("đã chậm ở khung nhìn trước thì chậm ở mọi khung nhìn sau (sticky), kể cả khi khung nhìn này đo nhanh", () => {
    expect(isSlowMachine({ base: 158, frameMs: 17, sticky: true })).toBe(true);
    expect(isSlowMachine({ base: 158, frameMs: 17, sticky: false })).toBe(false);
  });

  it("giới hạn độ trễ phím: 6 khung hình, sàn 150 ms (run 45244896458 của A: trung vị 161 ms ở khung 36 ms đỏ vì giới hạn cũ 4 x khung = 150)", () => {
    expect(latencyLimit(16.7)).toBe(150); // máy nhanh giữ sàn như cũ
    expect(latencyLimit(25)).toBe(150); // A đo 101 ms: xanh
    expect(latencyLimit(36)).toBe(216);
    expect(161).toBeLessThanOrEqual(latencyLimit(36)); // số của runner
    expect(197).toBeGreaterThan(latencyLimit(25)); // một độ trễ xấu thật ở khung nhanh vẫn đỏ
    expect(Math.max(150, 4 * 36)).toBeLessThan(161); // công thức cũ KHÔNG chứa số này (ghi lại vì sao đổi)
    // không giảm theo khung hình
    let prev = 0;
    for (const f of [10, 20, 25, 30, 36, 50, 80, 150]) {
      const l = latencyLimit(f);
      expect(l).toBeGreaterThanOrEqual(prev);
      prev = l;
    }
  });
});
