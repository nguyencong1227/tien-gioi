// Test các bộ phát hiện finding THUẦN của bộ chơi thử AI (#1194). Mỗi ca là một răng: nếu đột biến
// một hàm trong detect.ts (bỏ ngưỡng / đổi `>` thành `>=` / đảo điều kiện...), ca tương ứng chuyển
// đỏ — chứng minh harness CÓ bắt được lỗi thật (drift / stall / closed-fail / console-error), không
// phải báo xanh ảo. Đột biến chứng minh ghi ở cuối ghi chú Dev F (chạy trên mã thật đã commit).
import { describe, expect, it } from "vitest";
import {
  driftFinding,
  stuckFinding,
  stallFinding,
  closedFailFinding,
  ioErrorsBlockOk,
} from "./detect";

describe("driftFinding — pred trôi sau nhả phím", () => {
  it("phát hiện trôi khi khoảng cách > ngưỡng", () => {
    const f = driftFinding(0, 0, 5, 0, 1.5, "trong 300ms sau khi nhả phím");
    expect(f?.kind).toBe("drift");
    expect(f?.detail).toContain("trôi 5.0px");
    expect(f?.detail).toContain("trong 300ms sau khi nhả phím");
  });

  it("đường chéo: dùng khoảng cách Euclid, không chỉ một trục", () => {
    // √(3² + 4²) = 5 > 1.5 → trôi
    expect(driftFinding(0, 0, 3, 4)?.kind).toBe("drift");
  });

  it("KHÔNG báo trôi khi đứng yên (khoảng cách 0)", () => {
    expect(driftFinding(100, 200, 100, 200)).toBeNull();
  });

  it("KHÔNG báo trôi khi dưới ngưỡng", () => {
    expect(driftFinding(0, 0, 1, 0, 1.5)).toBeNull();
  });

  it("ngưỡng chặt: đúng tại ngưỡng KHÔNG tính trôi (răng: đổi `>` thành `>=` sẽ làm ca này đỏ)", () => {
    expect(driftFinding(0, 0, 1.5, 0, 1.5)).toBeNull();
  });
});

describe("stuckFinding — đứng im khi giữ phím (pred KHÔNG đổi)", () => {
  it("báo stuck khi pred gần như không đổi (khoảng cách 0)", () => {
    const f = stuckFinding(100, 200, 100, 200, 1.5, "trong 2000ms giữ W");
    expect(f?.kind).toBe("stuck");
    expect(f?.detail).toContain("chỉ đổi 0.0px");
    expect(f?.detail).toContain("trong 2000ms giữ W");
  });

  it("báo stuck khi đổi dưới ngưỡng", () => {
    expect(stuckFinding(0, 0, 1, 0, 1.5)?.kind).toBe("stuck");
  });

  it("KHÔNG báo stuck khi pred đã di chuyển (khoảng cách > ngưỡng)", () => {
    expect(stuckFinding(0, 0, 5, 0, 1.5)).toBeNull();
  });

  it("chỉ đổi theo một trục (y): Euclid = 4 > ngưỡng → KHÔNG stuck (răng: bỏ hypot dùng |Δx| sẽ báo stuck oan)", () => {
    // Δx = 0 nhưng Δy = 4 → Euclid = 4 > 1.5 = đã di chuyển; nếu chỉ xét Δx sẽ báo stuck sai.
    expect(stuckFinding(0, 0, 0, 4)).toBeNull();
  });

  it("ngưỡng chặt: đúng tại ngưỡng KHÔNG tính stuck (răng: đổi `<` thành `<=` sẽ làm ca này đỏ)", () => {
    expect(stuckFinding(0, 0, 1.5, 0, 1.5)).toBeNull();
  });
});

describe("stallFinding — khung đóng băng (FPS rAF bất thường cao)", () => {
  it("báo stall khi FPS >= ngưỡng 900", () => {
    const f = stallFinding(950);
    expect(f?.kind).toBe("stall");
    expect(f?.detail).toContain("FPS rAF = 950");
  });

  it("ngưỡng: đúng 900 cũng tính stall (răng: đổi `>=` thành `>` sẽ làm ca này đỏ)", () => {
    expect(stallFinding(900)?.kind).toBe("stall");
  });

  it("FPS bình thường (60) KHÔNG báo stall", () => {
    expect(stallFinding(60)).toBeNull();
  });

  it("FPS ngay dưới ngưỡng (899) KHÔNG báo stall", () => {
    expect(stallFinding(899)).toBeNull();
  });
});

describe("closedFailFinding — bảng không đóng sau lệnh đóng", () => {
  it("báo closed-fail khi bảng vẫn còn thấy", () => {
    const f = closedFailFinding(true);
    expect(f?.kind).toBe("closed-fail");
  });

  it("KHÔNG báo khi bảng đã đóng thật", () => {
    expect(closedFailFinding(false)).toBeNull();
  });
});

describe("ioErrorsBlockOk — lỗi console / mạng khiến bước không đạt", () => {
  it("console error → KHÔNG đạt", () => {
    expect(ioErrorsBlockOk(["EXCEPTION ..."], [])).toBe(true);
  });

  it("network error → KHÔNG đạt", () => {
    expect(ioErrorsBlockOk([], ["NET ... failed"])).toBe(true);
  });

  it("không có lỗi nào → đạt", () => {
    expect(ioErrorsBlockOk([], [])).toBe(false);
  });

  it("mảng rỗng nhưng đúng kiểu (răng: đổi `> 0` thành `> 1` sẽ bỏ sót 1 lỗi → ca console/network đỏ)", () => {
    expect(ioErrorsBlockOk(["một lỗi"], ["một lỗi"])).toBe(true);
  });
});
