// Kênh chung giữa các phòng (mỗi bản đồ một phòng Colyseus, cùng một tiến trình): chat toàn server.
// docs/THIET_KE_NHIEU_BAN_DO.md mục 4. Chạy nhiều tiến trình thì thay bằng `presence` của Colyseus (ngoài phạm vi M3).
import type { ChatOut } from "@tien-gioi/shared";
import type { Player } from "./schema";
import type { World } from "./world";
import { Parties } from "./systems/party";

/** Nơi nhận chat toàn server của một phòng (thường là `room.broadcast("chat", msg)`). */
export type ChatSink = (msg: ChatOut) => void;

/** Một người chơi đang ở trong một phòng nào đó. */
export interface Located {
  w: World;
  sid: string;
  p: Player;
}

export class Hub {
  private readonly sinks = new Set<ChatSink>();
  /** Mọi thế giới (phòng) đang chạy cùng tiến trình: để tìm người ở phòng khác (đội, mời đội). */
  readonly worlds = new Set<World>();
  /**
   * Sổ đội dùng chung của mọi phòng, khoá theo đạo hiệu viết thường (không phải sessionId: sessionId đổi mỗi lần
   * vào phòng, còn đội phải sống qua việc đi qua cổng). Xem systems/party.ts.
   */
  readonly parties = new Parties();

  /** Tìm người chơi theo khoá đạo hiệu (viết thường) ở mọi phòng; không có thì `null`. */
  locate(key: string): Located | null {
    for (const w of this.worlds) {
      let found: Located | null = null;
      w.state.players.forEach((p, sid) => {
        if (found === null && p.name.toLowerCase() === key) found = { w, sid, p };
      });
      if (found) return found;
    }
    return null;
  }

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
