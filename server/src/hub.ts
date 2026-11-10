// Kênh chung giữa các phòng (mỗi bản đồ một phòng Colyseus, cùng một tiến trình): chat toàn server.
// docs/THIET_KE_NHIEU_BAN_DO.md mục 4. Chạy nhiều tiến trình thì thay bằng `presence` của Colyseus (ngoài phạm vi M3).
import type { ChatOut } from "@tien-gioi/shared";

/** Nơi nhận chat toàn server của một phòng (thường là `room.broadcast("chat", msg)`). */
export type ChatSink = (msg: ChatOut) => void;

export class Hub {
  private readonly sinks = new Set<ChatSink>();

  /** Đăng ký một phòng nhận chat toàn server; trả về hàm huỷ đăng ký (gọi khi phòng đóng). */
  addChatSink(sink: ChatSink): () => void {
    this.sinks.add(sink);
    return () => void this.sinks.delete(sink);
  }

  /** Gửi một dòng chat tới MỌI phòng. Lỗi ở một phòng (đang đóng...) không làm các phòng khác mất tin. */
  chat(msg: ChatOut) {
    for (const sink of this.sinks) {
      try {
        sink(msg);
      } catch (e) {
        console.error("[hub] gửi chat thất bại", e);
      }
    }
  }

  /** Số phòng đang nghe (số đo / test). */
  get chatSinkCount() {
    return this.sinks.size;
  }
}

/** Hub dùng chung của tiến trình. Test dựng `Hub` riêng khi cần cô lập. */
export const defaultHub = new Hub();
