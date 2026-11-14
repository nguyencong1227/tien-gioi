// Trạng thái của CHÍNH MÌNH ở client (M7.2b, docs/PHAN_CONG_M7.md mục 5.4): giữ danh sách `StatusMsg.list` mới nhất và tự đếm lùi theo đồng hồ client
// để (1) đoán trước di chuyển đúng hệ số tăng tốc / tê cóng như server (`moveSpeedMul` DÙNG CHUNG trong shared), (2) biết khi nào bị choáng (không đoán
// trước, không gửi `input`), (3) về sau vẽ huy hiệu (#508). Lớp THUẦN: không biết Phaser, đồng hồ do người gọi truyền vào (`now`, ms) nên test được.
// Client không tin tin nhắn: mọi danh sách đi qua `sanitizeStatusList` (id lạ / trùng / rác bị bỏ, kẹp thời gian và cường độ, tối đa MAX_STATUSES).
import { moveSpeedMul, sanitizeStatusList, type StatusEntry } from "@tien-gioi/shared";

const NONE: readonly StatusEntry[] = [];

export class StatusTracker {
  private list: StatusEntry[] = [];
  /** Lúc (ms, đồng hồ của người gọi) nhận danh sách: `msLeft` của từng mục tính từ mốc này */
  private at = 0;

  /** Nhận danh sách mới từ server (thay hẳn, kể cả rỗng = xoá hết huy hiệu). */
  set(raw: unknown, now: number): void {
    this.list = sanitizeStatusList(raw);
    this.at = now;
  }

  /** Xoá hết (đổi bản đồ, nối lại, gục): server gửi lại danh sách đúng nếu còn. */
  clear(): void {
    this.list = [];
  }

  /** Còn trạng thái nào (kể cả đã hết hạn theo đồng hồ client) không: để đường nóng bỏ qua nhanh khi không ai dính gì. */
  get empty(): boolean {
    return this.list.length === 0;
  }

  /** Các mục còn hiệu lực tại `now`, `msLeft` đã trừ thời gian trôi từ lúc nhận (>= 1). Đồng hồ lùi coi như chưa trôi. */
  active(now: number): readonly StatusEntry[] {
    if (this.list.length === 0) return NONE;
    const elapsed = Math.max(0, now - this.at);
    const out: StatusEntry[] = [];
    for (const [id, ms, ratio] of this.list) {
      const left = ms - elapsed;
      if (left > 0) out.push(ratio === undefined ? [id, left] : [id, left, ratio]);
    }
    return out;
  }

  /** Hệ số tốc độ di chuyển tại `now`: ĐÚNG `moveSpeedMul` của shared (cùng hàm server nhân vào `applyInputs`). 1 khi không có gì. */
  speedMul(now: number): number {
    if (this.list.length === 0) return 1;
    return moveSpeedMul(this.active(now));
  }

  /** Đang bị choáng tại `now` (không di chuyển được, client không gửi `input`). */
  stunned(now: number): boolean {
    if (this.list.length === 0) return false;
    const elapsed = Math.max(0, now - this.at);
    for (const [id, ms] of this.list) if (id === "stun" && ms - elapsed > 0) return true;
    return false;
  }
}
