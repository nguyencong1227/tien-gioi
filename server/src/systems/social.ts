// Sự kiện XÃ HỘI của người chơi (M9, docs/PHAN_CONG_M9.md): ghi thống kê PK vào chân linh. Phần thành tựu / danh hiệu (`trackSocial`) làm ở M9.5 cùng chỗ này.
// Mọi thay đổi `Soul.social` đi qua `World.onSocial` (phòng chạy `SoulStore.update` ngoài tick); system KHÔNG chạm kho.
import { dayKey, socialPkRecord } from "@tien-gioi/shared";
import type { World } from "../world";

/**
 * Ghi kết quả một trận PK phân thắng thua bằng HẠ GỤC cho hai linh hồn: người thắng +1 thắng, người thua +1 thua, nhưng CHỈ khi còn trong CẢ HAI hạn mức của ngày (`Hub.pkPairs`: cặp không thứ tự
 * `BOARD_PK_PAIR_DAY_CAP`, mỗi người thắng `PK_DAY_WIN_CAP`); vượt hạn mức thì KHÔNG tính cho cả hai bên. Hoà / đầu hàng / bỏ chạy không gọi hàm này (`endDuel`). Trả `true` nếu có ghi.
 */
export function recordPkResult(w: World, winnerSid: string, loserSid: string): boolean {
  const wc = w.ctrl.get(winnerSid);
  const lc = w.ctrl.get(loserSid);
  if (!wc || !lc || !w.onSocial) return false;
  const wk = wc.identity.soulKey;
  const lk = lc.identity.soulKey;
  const counted = w.hub.pkPairs.tryCount(wk, lk, dayKey(w.now));
  w.audit?.("social.pk", {
    winner: w.state.players.get(winnerSid)?.name ?? null,
    loser: w.state.players.get(loserSid)?.name ?? null,
    counted,
  });
  if (!counted) return false;
  w.onSocial(wk, (s) => socialPkRecord(s, "won"));
  w.onSocial(lk, (s) => socialPkRecord(s, "lost"));
  return true;
}
