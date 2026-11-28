// Lời thoại NPC phong phú (#725): mỗi NPC có dòng giới thiệu + biến thể ngẫu nhiên (server #726),
// đủ độ dài, không trùng dòng trên toàn tập, không xưng "bạn" (quy ước giọng tu tiên).
import { describe, expect, it } from "vitest";
import { NPCS } from "./index";

const MIN_LEN = 25;
const MAX_LEN = 170;

/**
 * Lời tự giới thiệu GỐC của mỗi NPC (dòng đầu tiên trong `dialog` trước #725). Mở rộng lời thoại KHÔNG được đổi dòng
 * đầu: người chơi quen mặt NPCs cũ, dòng chào mở đầu giữ nguyên nghĩa. Danh sách cố định này là chốt chặn đó.
 */
const ORIG_INTROS: Record<string, string> = {
  truong_tran: "Lạc Hà Trấn nằm dưới chân Vân Mộng Sơn, linh khí tuy mỏng nhưng đủ cho kẻ có lòng.",
  duoc_su: "Đan dược cứu mạng, nhưng nguyên liệu phải do chính tay ngươi mang về.",
  tho_ren: "Lò đã đỏ lửa. Mang nanh, da, vảy yêu thú tới đây, ta rèn cho ngươi món ra hồn.",
  cao_thi: "Giấy dán chi chít, nhưng hôm nay chẳng còn việc nào chưa có người nhận.",
  lai_buon:
    "Thanh Lộ Trạm dựng sát cổng cho kẻ vượt Hắc Phong Cốc dừng chân. Gió ngoài kia rát, thú cũng dữ hơn dưới Lạc Hà.",
  tram_truong:
    "Vọng Sương Trạm dựng giữa đầm, đèn đêm nào cũng thắp để kẻ lạc đường tìm về. Ra khỏi vòng đèn là sương nuốt tiếng bước chân.",
  lai_buon_suong:
    "Thu được gì từ đầm cứ bán cho ta, đỡ phải gánh ngược qua Hắc Phong Cốc. Đại hồi đan ta cũng có sẵn.",
  tho_ren_suong:
    "Mai rùa, lông sương, vảy giao: nguyên liệu trong đầm này rèn ra đồ ra hồn nhất. Mang tới đây, thêm chút Linh thạch tiền than.",
  tram_truong_han:
    "Hàn Vân Trạm dựng trên sườn băng, lò than nào cũng nhóm suốt đêm. Ra khỏi vòng lửa là gió tuyết cắt da.",
  lai_buon_han:
    "Thu được gì trên băng cứ bán cho ta, đỡ phải gánh ngược xuống Âm Sương. Thượng hồi đan ta có sẵn.",
  tho_ren_han:
    "Lông Hàn Lang, xương voi, vũ Phong Nha, châu Thiên Hàn: băng nguyên này cho nguyên liệu rèn ra đồ ra hồn nhất. Mang tới đây, thêm chút Linh thạch tiền than.",
  thu_mon: "Linh Hư Bí Cảnh mở cho đội tu sĩ đồng tâm. Một mình vào đó chỉ là nạp mạng.",
  // Lò đan (nghề nhỏ lát 1, #763): chốt chặn giữ dòng giới thiệu của NPC mới không đổi khi mở rộng lời thoại
  lao_dan:
    "Lò ta nhóm lửa luyện đan, nhất là đan hộ đạo trợ giúp đạo hữu vượt ải đột phá cảnh giới.",
  // Trạm úy Thanh Lộ (D7 #755): NPC mới giao việc hằng ngày Hắc Phong, chốt chặn giữ dòng giới thiệu
  tran_uy:
    "Thanh Lộ Trạm là cửa ngõ duy nhất xuyên Hắc Phong Cốc, ta giữ con đường này bao năm bằng máu và nanh thú.",
  // Thợ rèn Tuyết Đao (D1 #1466 lát A2): NPC mới bộ V Hóa Thần, chốt chặn giữ dòng giới thiệu khi mở rộng lời thoại
  tho_ren_tuyet_dao:
    "Lò Tuyết Đao Quan nhóm lửa giữa gió thảo nguyên. Da Lang Hoang, nanh trăng, cốt Lang Vương: mang tới đây, thêm chút Linh thạch tiền than, ta rèn đồ Hóa Thần.",
  // Ba NPC giao việc phụ Tuyết Đao Quan (#1465 giai đoạn 2 lát 1): chốt chặn giữ dòng giới thiệu khi mở rộng lời thoại
  quan_uy_tuyet_dao:
    "Tuyết Đao Quan giữ cửa bắc Lang Hoang, sau lưng là đất thú. Ai qua ải cũng phải ghi tên, kể cả tu sĩ Hóa Thần.",
  lai_buon_tuyet_dao:
    "Ta buôn qua lại Hàn Vân và Kinh Đô nhiều năm rồi, năm nào phí qua ải cũng tăng.",
  do_thap_tam_nuong:
    "Đỗ Thập Tam Nương. Con thứ mười ba nhà thợ săn. Ngươi có rượu không? Không có thì ta mời.",
  // Hai cao nhân chuỗi chính chương 5 (#1465 giai đoạn 2 lát 2): chốt chặn giữ dòng giới thiệu (lời gặp nguyên văn của nguồn)
  doan_moc_thu:
    "Ngươi đi nước này, ta cược ngươi thua. Đừng nhìn vỏ hạt dưa dưới chân, nhìn bãi cờ ngoài ải kia kìa.",
  lac_thanh_son:
    "Đường dài, gánh nặng. Đi cùng một quãng chứ? Ngươi gánh thử một đoạn, gánh rồi mới biết đường xa thế nào.",
  // Bàn phù (nghề nhỏ lát 2, #817): chốt chặn giữ dòng giới thiệu của NPC mới không đổi khi mở rộng lời thoại
  lao_phu:
    "Bàn phù ta nhóm hương trầm cả ngày, vẽ phù trấn yêu cho kẻ qua lại. Mang nguyên liệu yêu thú tới, ta chế phù cho đạo hữu.",
};

/** Phạm vi chữ Hán (CJK) — lời thoại Tiên Giới tiếng Việt, KHÔNG được có. */
const CJK = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;

describe("lời thoại NPC (#725)", () => {
  it("mọi NPC có từ 4 đến 5 dòng lời thoại (dòng giới thiệu + biến thể)", () => {
    for (const n of NPCS) {
      expect(n.dialog.length, n.id).toBeGreaterThanOrEqual(4);
      expect(n.dialog.length, n.id).toBeLessThanOrEqual(5);
    }
  });

  it("mỗi dòng lời thoại dài từ 25 đến 170 ký tự", () => {
    for (const n of NPCS)
      for (const line of n.dialog) {
        expect(line.length, `${n.id}: "${line}"`).toBeGreaterThanOrEqual(MIN_LEN);
        expect(line.length, `${n.id}: "${line}"`).toBeLessThanOrEqual(MAX_LEN);
      }
  });

  it("không có dòng nào xưng 'bạn' (quy ước gọi người chơi là 'đạo hữu'/'ngươi')", () => {
    for (const n of NPCS)
      for (const line of n.dialog)
        expect(line.toLowerCase().includes("bạn"), `${n.id}: "${line}"`).toBe(false);
  });

  it("không có dòng lời thoại nào trùng nhau trên toàn bộ tập NPC (kể cả dòng cũ)", () => {
    const all = NPCS.flatMap((n) => n.dialog);
    expect(new Set(all).size, `có ${all.length - new Set(all).size} dòng trùng nhau`).toBe(
      all.length,
    );
  });

  it("dòng đầu là dòng giới thiệu luôn hiển thị; các dòng sau là biến thể khác dòng đầu", () => {
    for (const n of NPCS) {
      expect(n.dialog[0].length, n.id).toBeGreaterThan(0);
      for (let i = 1; i < n.dialog.length; i++)
        expect(n.dialog[i], `${n.id}: biến thể trùng dòng giới thiệu`).not.toBe(n.dialog[0]);
    }
  });

  it("dòng đầu GIỮ NGUYÊN lời tự giới thiệu so với bản cũ (so với danh sách cố định ORIG_INTROS)", () => {
    for (const n of NPCS)
      expect(n.dialog[0], `${n.id}: dòng giới thiệu bị đổi`).toBe(ORIG_INTROS[n.id]);
  });

  it("không có dòng lời thoại nào chứa chữ Hán (CJK)", () => {
    for (const n of NPCS)
      for (const line of n.dialog)
        expect(CJK.test(line), `${n.id}: "${line}" có chữ Hán`).toBe(false);
  });
});
