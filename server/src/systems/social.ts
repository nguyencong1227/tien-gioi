// Sự kiện XÃ HỘI của người chơi (M9, docs/PHAN_CONG_M9.md): ghi thống kê PK vào chân linh. Phần thành tựu / danh hiệu (`trackSocial`) làm ở M9.5 cùng chỗ này.
// Mọi thay đổi `Soul.social` đi qua `World.onSocial` (phòng chạy `SoulStore.update` ngoài tick); system KHÔNG chạm kho.
import { dayKey, newSocial, socialPkRecord, socialTrack } from "@tien-gioi/shared";
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

/**
 * Ghi MỘT HOẶC NHIỀU bộ đếm xã hội cho người chơi `sid` (`[khoá, giá trị]`, chế độ `add` / `max` theo khoá, `socialTrack`): MỘT lần ghi chân linh cho cả nhóm (vào phòng ghi bản đồ + kiếp +
 * cảnh giới cùng lúc). Thành tựu đến hạn được cấp ở `WorldRoom.socialUpdate` cùng lần ghi (nguyên tử). Không có hook (`World.onSocial`, test / bench) hoặc người chơi không còn thì bỏ qua.
 * Khoá lạ / giá trị xấu bị `socialTrack` bỏ qua im lặng.
 */
export function trackSocial(w: World, sid: string, ...entries: Array<[string, number]>): void {
  const c = w.ctrl.get(sid);
  if (!c || !w.onSocial || entries.length === 0) return;
  w.onSocial(c.identity.soulKey, (s) => {
    let social = s;
    for (const [key, value] of entries) social = socialTrack(social, key, value).social;
    return social ?? newSocial(); // chưa có phần xã hội mà không có gì đổi: bản trống (người gọi so sánh tham chiếu để bỏ qua ghi thừa)
  });
}
