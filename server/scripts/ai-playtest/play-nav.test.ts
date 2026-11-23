// Test hàm ĐI BỘ thuần `walkKeysToward` của bộ chơi thử AI (M66.5, #1339): quyết định giữ phím WASD nào
// để đi về phía lệch `(dx, dy)`. Thuần nên test được KHÔNG cần Chrome; mỗi ca là một răng — nếu ai lật dấu
// (dx>0 -> giữ A thay vì D) hay đổi deadzone, ca tương ứng chuyển đỏ. `walkToNpc` (I/O) gọi hàm này.
import { describe, expect, it } from "vitest";
import { walkKeysToward } from "./play";

const codes = (keys: readonly unknown[]) => keys.map((k) => (k as { code: string }).code).sort();

describe("walkKeysToward — phím giữ để đi về phía lệch (dx>0 phải, dy>0 xuống)", () => {
  it("lệch phải: giữ D (KeyD), KHÔNG giữ phím khác", () => {
    expect(codes(walkKeysToward(40, 0))).toEqual(["KeyD"]);
  });
  it("lệch trái: giữ A (KeyA)", () => {
    expect(codes(walkKeysToward(-40, 0))).toEqual(["KeyA"]);
  });
  it("lệch xuống: giữ S (KeyS)", () => {
    expect(codes(walkKeysToward(0, 40))).toEqual(["KeyS"]);
  });
  it("lệch lên: giữ W (KeyW)", () => {
    expect(codes(walkKeysToward(0, -40))).toEqual(["KeyW"]);
  });

  it("lệch chéo phải-thượng: giữ ĐỒNG THỜI D + W (hai phím, KHÔNG triệt tiêu)", () => {
    expect(codes(walkKeysToward(30, -30))).toEqual(["KeyD", "KeyW"]);
  });
  it("lệch chéo trái-hạ: giữ A + S", () => {
    expect(codes(walkKeysToward(-30, 30))).toEqual(["KeyA", "KeyS"]);
  });

  it("đủ gần (lệch trong deadzone mọi trục): KHÔNG giữ phím nào (đứng im)", () => {
    expect(walkKeysToward(4, -4)).toEqual([]);
    expect(walkKeysToward(0, 0)).toEqual([]);
  });
  it("một trục đủ gần, trục kia xa: chỉ giữ phím của trục xa", () => {
    expect(codes(walkKeysToward(4, 40))).toEqual(["KeyS"]); // x đủ gần, y xa -> chỉ S
    expect(codes(walkKeysToward(40, 4))).toEqual(["KeyD"]); // y đủ gần, x xa -> chỉ D
  });

  it("ranh giới deadzone chặt: lệch đúng bằng deadzone KHÔNG giữ (dùng `<` / `>` chặt)", () => {
    expect(walkKeysToward(6, 6)).toEqual([]); // == deadzone 6 -> không giữ
    expect(codes(walkKeysToward(7, 7))).toEqual(["KeyD", "KeyS"]); // vượt -> giữ
  });

  it("deadzone tùy chỉnh: ngưỡng lớn hơn -> cần lệch lớn hơn mới giữ", () => {
    expect(walkKeysToward(20, 0, 25)).toEqual([]); // 20 < 25 -> đứng im
    expect(codes(walkKeysToward(30, 0, 25))).toEqual(["KeyD"]); // 30 > 25 -> giữ D
  });

  it("giá trị không phải số: không giữ phím nào (an toàn, không ném)", () => {
    expect(walkKeysToward(Number.NaN, Number.NaN)).toEqual([]);
  });

  it("ổn định: cùng đầu vào -> cùng phím (không cấp phát ngẫu nhiên)", () => {
    expect(codes(walkKeysToward(30, -30))).toEqual(codes(walkKeysToward(30, -30)));
  });
});
