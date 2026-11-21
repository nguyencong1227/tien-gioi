// Các bộ phát hiện finding THUẦN (không đụng CDP / sleep / DOM) của bộ chơi thử AI (#1194).
//
// Tách khỏi play.ts (mang I/O) để có thể test đột biến: mỗi hàm chỉ quyết định "có finding không"
// từ số liệu thô (toạ độ pred, FPS, trạng thái bảng, danh sách lỗi). play.ts gọi chúng sau khi lấy
// số liệu thật. ĐỪNG đổi chữ ký các hàm này khi đã merge — detect.test.ts + play.ts phụ thuộc.

import type { Finding } from "./manifest";

/**
 * Pred còn đổi > ngưỡng sau khi nhả MỌI phím hướng = drift (trôi sau nhả phím).
 * Khoảng cách Euclid giữa hai mẫu toạ độ; dùng `>` chặt nên đúng tại ngưỡng KHÔNG tính trôi.
 */
export function driftFinding(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  threshold = 1.5,
  windowLabel = "sau khi nhả phím",
): Finding | null {
  const dist = Math.hypot(bx - ax, by - ay);
  if (dist > threshold)
    return {
      kind: "drift",
      detail: `pred trôi ${dist.toFixed(1)}px ${windowLabel} (ngưỡng ${threshold}px)`,
    };
  return null;
}

/**
 * FPS rAF bất thường cao (khung đóng băng / dt ~0 → `1000/dt` lớn) = stall. Ngưỡng mặc định 900
 * (khung nhanh hơn ~1,1 ms là bất thường). `>=` nên đúng tại ngưỡng cũng tính stall.
 */
export function stallFinding(fpsMin: number, threshold = 900): Finding | null {
  if (fpsMin >= threshold)
    return {
      kind: "stall",
      detail: `FPS rAF = ${fpsMin} (khung đóng băng, có thể stall, ngưỡng ${threshold})`,
    };
  return null;
}

/** Bảng vẫn còn thấy thật sau lệnh đóng (Esc / phím) = closed-fail. */
export function closedFailFinding(stillOpen: boolean): Finding | null {
  if (stillOpen)
    return { kind: "closed-fail", detail: "Bảng KHÔNG đóng sau lệnh đóng (Esc / phím)" };
  return null;
}

/**
 * Bước có lỗi console / exception HOẶC lỗi mạng thì KHÔNG đạt (ok=false). Lỗi I/O này là tín hiệu
 * thật (rớt tin colyseus, exception chưa bắt...), không bỏ như e2e thường lệ.
 */
export function ioErrorsBlockOk(
  consoleErrors: readonly string[],
  networkErrors: readonly string[],
): boolean {
  return consoleErrors.length > 0 || networkErrors.length > 0;
}
