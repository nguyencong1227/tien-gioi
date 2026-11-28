// NPC trong Lạc Hà Trấn và giao dịch đổi đồ: hợp đồng giữa client và server (Sprint 2).
import {
  AM_SUONG_ID,
  DEFAULT_MAP_ID,
  HAC_PHONG_ID,
  HAN_VAN_ID,
  LANG_HOANG_ID,
  TOWN_PX,
} from "./map";
import type { CraftStation } from "./craft-station";

export interface NpcDef {
  id: string;
  /** Bản đồ NPC đứng; bỏ trống là `DEFAULT_MAP_ID`. Toạ độ `x`, `y` tính trong bản đồ đó. */
  mapId?: string;
  name: string;
  /** Danh xưng hiện dưới tên, vd "Trưởng trấn" */
  title: string;
  /**
   * Loại trạm chế tác của NPC này (nghề nhỏ, #514): `forge` (Lò rèn), `alchemy` (Lò đan), `talisman` (Bàn phù). Thiếu = `forge`, nên
   * mọi NPC cũ không đổi. Chữ hiển thị lấy từ `CRAFT_STATIONS[station]` (`craft-station.ts`); dùng `craftStationOf(npc)`, đừng đọc trực tiếp.
   */
  station?: CraftStation;
  /** Vị trí (px), đứng yên */
  x: number;
  y: number;
  /** Lời chào khi không có nhiệm vụ nào để nhận / trả */
  dialog: string[];
  /** Màu ảnh tạm (trước khi có sprite `npc-<id>`) */
  color: number;
}

export const NPCS: NpcDef[] = [
  {
    id: "truong_tran",
    name: "Lâm Thanh Tùng",
    title: "Trưởng trấn",
    x: TOWN_PX.x,
    y: TOWN_PX.y - 120,
    dialog: [
      "Lạc Hà Trấn nằm dưới chân Vân Mộng Sơn, linh khí tuy mỏng nhưng đủ cho kẻ có lòng.",
      "Ngoài kia yêu thú mỗi ngày một nhiều. Có việc gì cứ tới tìm ta.",
      "Tu sĩ trẻ vào trấn đông hơn xưa, ta mừng mà cũng lo, ít ai trụ nổi qua mùa đông đầu.",
      // Móc truyện chương 1 (#1464): lời sấm chính sử, phàm nhân đem đặt tên con (lore.thien_mon_loi_sam)
      'Phàm nhân trong trấn đem lời sấm "Ba nghìn năm phong thiên, cửa trời tự hiện" đặt tên cho con. Năm nay là kỳ hạn, nên người lạ đổ về.',
      "Hà lão bên tiệm đan giỏi chữa thương, Thiết Ngưu bên lò rèn giỏi tạo tác, cứ đến mà nhờ.",
    ],
    color: 0x7a5c3e,
  },
  {
    id: "duoc_su",
    name: "Hà lão",
    title: "Lão dược sư",
    x: TOWN_PX.x - 130,
    y: TOWN_PX.y + 30,
    dialog: [
      "Đan dược cứu mạng, nhưng nguyên liệu phải do chính tay ngươi mang về.",
      "Mang da lông yêu thú tới, lão phu luyện cho ngươi vài viên.",
      "Vào sâu mà không dự phòng đan dược thì đừng trách số mình hẩm hiu.",
      "Mai rùa từ đầm Âm Sương cho dược liệu bổ huyết tốt nhất, hiếm mà quý.",
      // Móc truyện chương 1 (#1464): bia không chữ đếm năm (lore.thien_mon_bia_dem_nam)
      "Lão từng áp tay lên một tấm bia không chữ, cỏ chẳng mọc quanh chân. Bia thì thầm đếm năm, mà chưa tới số cuối.",
    ],
    color: 0x4f8a5b,
  },
  {
    id: "tho_ren",
    name: "Thiết Ngưu",
    title: "Thợ rèn",
    x: TOWN_PX.x + 130,
    y: TOWN_PX.y + 30,
    dialog: [
      "Lò đã đỏ lửa. Mang nanh, da, vảy yêu thú tới đây, ta rèn cho ngươi món ra hồn.",
      "Đồ tốt kén người: cảnh giới chưa tới thì mặc vào cũng chẳng chịu nổi.",
      "Nanh sói, da thú dưới trấn ta rèn được đồ sơ khởi, đủ cho kẻ mới vào đạo.",
      "Lửa lò ta cháy ngày đêm, than có thừa, thiếu có mỗi nguyên liệu do ngươi mang về.",
      "Muốn đao kiếm sắc bén thì phải nể lửa, đồ tốt bao giờ cũng đắt công rèn.",
    ],
    color: 0x8c3b2a,
  },
  {
    id: "cao_thi",
    name: "Bảng cáo thị",
    title: "Việc trong ngày",
    x: TOWN_PX.x,
    y: TOWN_PX.y + 110,
    dialog: [
      "Giấy dán chi chít, nhưng hôm nay chẳng còn việc nào chưa có người nhận.",
      "Việc hạ yêu thú nơi hoang dã trả hậu hĩnh, đạo hữu dám nhận thì tới bóc giấy.",
      "Trưởng trấn Lâm Thanh Tùng thường dán lệnh mới lên đây mỗi khi thú dữ quấy phá.",
      "Ai rảnh tay mà thiếu Linh thạch thì đọc kỹ, phần thưởng luôn xứng với nguy hiểm.",
      "Chớ bóc giấy rồi bỏ dở, nhận việc là phải làm trọn, kẻo hỏng danh tiếng của trấn.",
    ],
    color: 0xc9a66b,
  },
  {
    id: "lai_buon",
    mapId: HAC_PHONG_ID,
    name: "Mạc Thông",
    title: "Lái buôn Thanh Lộ",
    // Trạm Thanh Lộ (Hắc Phong Cốc): tâm trấn (2048, 2688), lùi lên phía bắc 70 px; chỗ đi lại được (test giữ)
    x: 2048,
    y: 2618,
    dialog: [
      "Thanh Lộ Trạm dựng sát cổng cho kẻ vượt Hắc Phong Cốc dừng chân. Gió ngoài kia rát, thú cũng dữ hơn dưới Lạc Hà.",
      "Thu được gì cứ bán cho ta, đỡ phải gánh về trấn dưới. Đan dược ta cũng có sẵn.",
      "Hắc Phong Cốc là con đường duy nhất lên Âm Sương, mà cũng là nơi chôn biết bao kẻ tham lam.",
      // Móc truyện chương 2 (#1464): mũi kiếm gãy Đoạn Thiên (lore.doan_thien_kiem_vu)
      "Dân săn kể từng mổ bụng Xích Mãng, thấy một mũi kiếm gãy cổ xưa. Kiếm ngày Đoạn Thiên thanh nào cũng gãy ở mũi, như đâm vào thứ cứng hơn trời.",
      "Ta đi buôn qua bao trạm, nhưng thú dữ như dưới Cốc này thì ít nơi nào sánh bằng.",
    ],
    color: 0x6b4f8a,
  },
  {
    // Trạm trưởng canh cổng (D7 #755): đội trưởng thợ săn giữ Thanh Lộ Trạm, giao việc hằng ngày săn quái Hắc Phong.
    // Đứng đối xứng lái buôn qua tâm trấn (2048, 2688): lai_buon phía bắc (2048, 2618), tran_uy phía đông-nam (2143, 2713); cách 134 px > 64, trong trấn, chỗ đi lại được (test giữ)
    id: "tran_uy",
    mapId: HAC_PHONG_ID,
    name: "Lôi Báo",
    title: "Trạm úy Thanh Lộ",
    x: 2143,
    y: 2713,
    dialog: [
      "Thanh Lộ Trạm là cửa ngõ duy nhất xuyên Hắc Phong Cốc, ta giữ con đường này bao năm bằng máu và nanh thú.",
      "Gió đen thổi suốt ngày đêm, bầy Hôi Lang và Hắc Hổ càng nhiều, đạo hữu vào sâu phải cẩn trọng.",
      "Yêu thú quấy phá đường vận chuyển, hạ chúng mang da răng về trạm, ta trả công bằng đan dược và tu vi.",
      "Lái buôn Mạc Thông bên kia trạm thu mua đồ, ngươi có gì cứ mang sang bán, hắn trả giá không tệ.",
      // Móc truyện chương 2 (#1464): Mộ Dung Triệt thách tỉ thí bằng lời (npc.mo_dung_triet)
      "Có thiếu niên áo trắng đeo kiếm dài ghé trạm, xưng Mộ Dung Triệt, thách ai dám tỉ thí. Hắn bảo mong kẻ nhận lời đừng hữu danh vô thực.",
    ],
    color: 0x4a6b3a,
  },
  // Vọng Sương Trạm (Âm Sương Trạch, M6 #404): tâm trấn (2048, 3136); ba NPC quanh tâm, cách nhau > 64 px, đứng trên nền đá của trạm
  {
    id: "tram_truong",
    mapId: AM_SUONG_ID,
    name: "Tống Vân Hạc",
    title: "Trạm trưởng Vọng Sương",
    x: 2048,
    y: 3051,
    dialog: [
      "Vọng Sương Trạm dựng giữa đầm, đèn đêm nào cũng thắp để kẻ lạc đường tìm về. Ra khỏi vòng đèn là sương nuốt tiếng bước chân.",
      "Kim Đan mới dám đi sâu. Đầm này nuôi sương hồ, rùa đá, cóc độc, và ở nơi sâu nhất là Hắc Giao. Có việc thì nói với ta.",
      // Móc truyện chương 3 (#1464): đêm triều rút (lore.trung_chau_trieu_khu)
      "Dân chài ven biển kể cứ vài chục năm có một đêm nước rút xa mất bóng, lộ mái điện dưới đáy. Đêm ấy họ không thả lưới.",
      "Hắc Giao là trùm của đầm, to bằng cả cái chòi, một mình mà đụng phải thì chỉ có chuồn.",
      // Móc truyện chương 3 (#1464): Ninh Tam Sinh dưới gốc hòe (npc.ninh_tam_sinh)
      "Hôm kia có nữ tu đứng dưới gốc hòe ngoài trạm như đã đợi ai từ rất lâu. Nàng cười, tự xưng Ninh Tam Sinh, rồi hỏi ta đã gặp ngươi chưa.",
    ],
    color: 0x4a6b78,
  },
  {
    id: "lai_buon_suong",
    mapId: AM_SUONG_ID,
    name: "Phó Quang",
    title: "Lái buôn Vọng Sương",
    x: 1953,
    y: 3161,
    dialog: [
      "Thu được gì từ đầm cứ bán cho ta, đỡ phải gánh ngược qua Hắc Phong Cốc. Đại hồi đan ta cũng có sẵn.",
      "Đan hồi phục quý hơn vàng khi ngươi đứng trước cóc độc. Mua đủ rồi hẵng vào sâu.",
      "Sương hồ cho lông quý, rùa đá cho mai bổ, bán hết cho ta, ta trả giá công bằng.",
      // Móc truyện chương 3 (#1464): Ôn Như Ngọc hái thuốc, không bội khế ước (npc.on_nhu_ngoc)
      "Có nữ tu áo xanh nhạt ghé đầm hái thuốc, xưng Ôn Như Ngọc, Đan Hà Cốc: giá cả dễ nói, nhưng đã nói thì phải giữ lời.",
      "Lên Hàn Vân thì tìm Kỳ Thiên Lộc, hắn ta mua bán trên băng giỏi không kém ta dưới đầm.",
    ],
    color: 0x7a5f8c,
  },
  {
    id: "tho_ren_suong",
    mapId: AM_SUONG_ID,
    name: "Hồ Thiết",
    title: "Thợ rèn Vọng Sương",
    x: 2143,
    y: 3161,
    dialog: [
      "Mai rùa, lông sương, vảy giao: nguyên liệu trong đầm này rèn ra đồ ra hồn nhất. Mang tới đây, thêm chút Linh thạch tiền than.",
      "Đồ tốt kén người: chưa tới Kim Đan thì mặc vào cũng chẳng chịu nổi.",
      "Vảy giao long cho ta rèn được giáp chịu đòn, nhưng đòi đội đủ ba bốn người mới hạ nổi con.",
      // Móc truyện chương 3 (#1464): Minh Độ và chiếc vảy rắn (npc.minh_do)
      "Một tiểu tăng đi ngang xin chén nước, tay áo lấp ló vật óng ánh như vảy rắn. Sư chắp tay: bần tăng Minh Độ, Kim Cương Tự.",
      "Rùa đá già cho mai dày nhất, ngươi vào sâu thì nhớ tìm những con tuổi thọ cao.",
    ],
    color: 0x9a4a30,
  },
  // Hàn Vân Trạm (Hàn Vân Lĩnh, M7.5c #506): tâm trấn (2048, 3648); ba NPC quanh tâm như Vọng Sương Trạm, cách nhau > 64 px, đứng trên nền đá của trạm
  {
    id: "tram_truong_han",
    mapId: HAN_VAN_ID,
    name: "Thôi Tuyết Phong",
    title: "Trạm trưởng Hàn Vân",
    x: 2048,
    y: 3563,
    dialog: [
      "Hàn Vân Trạm dựng trên sườn băng, lò than nào cũng nhóm suốt đêm. Ra khỏi vòng lửa là gió tuyết cắt da.",
      "Nguyên Anh mới dám lên đây. Bầy sói băng, chim nanh thép, voi xương, sẻ độc, và ở nơi cao nhất là Thiên Hàn Vương. Có việc thì nói với ta.",
      // Móc truyện chương 4 (#1464): Thác Bạt Sương chắn giữa đường tuyết (npc.thac_bat_suong)
      "Có thiếu nữ áo lông đen đứng chắn giữa đường tuyết, nhìn ta rất lâu rồi chỉ nói: Thác Bạt Sương, Huyền Vũ Môn. Nói xong là thôi.",
      "Thiên Hàn Vương là chúa tể băng nguyên, một con đã đủ quét sạch cả một đội tu sĩ.",
      // Móc truyện chương 4 (#1464): bằng già chờ người nhà quay lại (lore.doan_thien_bang_ky)
      "Trên mỏm đá phía bắc có con bằng già đứng quay mặt về bắc suốt bao năm. Người Tuyết Bằng bảo nó chờ một người nhà sẽ quay lại.",
    ],
    color: 0x4a7aa8,
  },
  {
    id: "lai_buon_han",
    mapId: HAN_VAN_ID,
    name: "Kỳ Thiên Lộc",
    title: "Lái buôn Hàn Vân",
    x: 1953,
    y: 3673,
    dialog: [
      "Thu được gì trên băng cứ bán cho ta, đỡ phải gánh ngược xuống Âm Sương. Thượng hồi đan ta có sẵn.",
      "Đứng trước độc tước mà hết đan thì hối cũng không kịp. Mua đủ rồi hẵng lên cao.",
      "Hàn Lang cho lông bền, voi xương cho ngà quý, bán hết cho ta, ta trả giá xứng đáng.",
      // Móc truyện chương 4 (#1464): lần đầu nghe tên Tầm Thiên Hội (lore.thien_mon_tam_thien)
      "Nghe nói có hội không sơn môn, chỉ có người, gọi là Tầm Thiên Hội, tin cửa trời mở thì hồn được lên trên. Ta chỉ lo buôn, không dính vào.",
      "Xuống Âm Sương thì tìm Phó Quang, hắn mua bán dưới đầm giỏi không kém ta trên này.",
    ],
    color: 0x6a8cb8,
  },
  {
    id: "tho_ren_han",
    mapId: HAN_VAN_ID,
    name: "Lô Băng Thiết",
    title: "Thợ rèn Hàn Vân",
    x: 2143,
    y: 3673,
    dialog: [
      "Lông Hàn Lang, xương voi, vũ Phong Nha, châu Thiên Hàn: băng nguyên này cho nguyên liệu rèn ra đồ ra hồn nhất. Mang tới đây, thêm chút Linh thạch tiền than.",
      "Đồ tốt kén người: chưa tới Nguyên Anh thì mặc vào cũng chẳng chịu nổi.",
      "Châu Thiên Hàn là nguyên liệu quý nhất ta từng rèn qua, nhưng đòi cả đội mới lấy được.",
      // Móc truyện chương 4 (#1464): Bằng Thất sà xuống từ vách núi (npc.bang_that)
      "Một bóng trắng sà xuống từ vách núi, hóa thiếu niên tóc bạc mắt vàng. Hắn xưng Bằng Thất, bảo ta đứng trên đất tộc hắn mà không biết sợ.",
      // Móc truyện chương 4 (#1464): Yến Bắc Quy ghé lò xem kiếm (npc.yen_bac_quy)
      "Một thanh niên tuấn tú phe phẩy quạt ghé lò xem kiếm, xưng Yến Bắc Quy, bảo kẻ có mắt tốt sớm muộn cũng cần một tri kỷ như hắn.",
    ],
    color: 0x5a3a6a,
  },
  // Tuyết Đao Quan (Lang Hoang, D1 #1466 lát A2): thợ rèn bộ V. Tâm trạm (2048, 3136), r 160 px; đứng bên phải tâm (+130, +30) như thợ rèn Lạc Hà (ô đi lại được, trong trạm: `data-integrity.test.ts` giữ).
  // Nhân vật GỐC Tiên Giới (`docs/KICH_BAN_CHUONG_5_6.md` mục 3.1); ảnh TẠM tái dùng ảnh thợ rèn Hàn Vân (B vẽ riêng sau).
  {
    id: "tho_ren_tuyet_dao",
    mapId: LANG_HOANG_ID,
    name: "Đồng Lão Thiết",
    title: "Thợ rèn Tuyết Đao",
    x: 2178,
    y: 3166,
    dialog: [
      "Lò Tuyết Đao Quan nhóm lửa giữa gió thảo nguyên. Da Lang Hoang, nanh trăng, cốt Lang Vương: mang tới đây, thêm chút Linh thạch tiền than, ta rèn đồ Hóa Thần.",
      "Đồ tốt kén người: chưa tới Hóa Thần thì mặc vào cũng chẳng chịu nổi.",
      "Hồn tinh Thiên Lang chỉ có ở sói già nhất bãi. Hạ được con ấy là có thứ ta cần nhất để rèn một thanh kiếm ra hồn.",
      "Lửa lò ta phải nhóm gấp đôi dưới Hàn Vân mới chịu được gió bắc thảo nguyên này.",
      "Sói ở đây không như sói dưới Hàn Vân: đòn nặng, chạy nhanh, hú một tiếng là cả bầy kéo tới. Mặc đủ đồ rồi hẵng đi sâu.",
    ],
    color: 0x6a4a3a,
  },
  // Tuyết Đao Quan (Lang Hoang, #1465 giai đoạn 2 lát 1; `docs/KICH_BAN_CHUONG_5_6.md` mục 3.1): ba NPC giao việc phụ. Tâm trạm (2048, 3136), r 160 px;
  // nhân vật GỐC Tiên Giới (Ngô Cự, Chu Bách Lượng) và Đỗ Thập Tam Nương (nhân vật nguồn, dòng giới thiệu là lời gặp nguyên văn). Ảnh TẠM (B vẽ riêng sau).
  {
    id: "quan_uy_tuyet_dao",
    mapId: LANG_HOANG_ID,
    name: "Ngô Cự",
    title: "Quan úy Tuyết Đao",
    x: 2048,
    y: 3016,
    dialog: [
      "Tuyết Đao Quan giữ cửa bắc Lang Hoang, sau lưng là đất thú. Ai qua ải cũng phải ghi tên, kể cả tu sĩ Hóa Thần.",
      "Ba đêm nay lang mẹ kéo tới chân ải, đứng nhìn về phía nam rồi đào đất. Binh của ta không dám bắn.",
      "Sử chép thú triều tràn khỏi Lang Lĩnh. Ta giữ ải mười năm, chưa thấy con lang nào đánh vào.",
      "Cổng nam xuống Hàn Vân Lĩnh, cổng bắc lên Uy Vân Kinh. Qua cổng nào cũng mang đủ đan, ải này không phát đan.",
      "Lính ải thiếu người mà thiếu cả lương. Ai hạ giúp ta mấy con sói đen quấy quanh ải thì ta nhớ ơn.",
    ],
    color: 0x4a5a7a,
  },
  {
    id: "lai_buon_tuyet_dao",
    mapId: LANG_HOANG_ID,
    name: "Chu Bách Lượng",
    title: "Lái buôn qua ải",
    x: 1928,
    y: 3156,
    dialog: [
      "Ta buôn qua lại Hàn Vân và Kinh Đô nhiều năm rồi, năm nào phí qua ải cũng tăng.",
      "Phí qua ải tính theo tu vi: người càng mạnh, ải càng thu nhiều. Thế đạo bây giờ vậy.",
      "Da sói, nanh trăng ngoài bãi, thợ rèn Tuyết Đao nhận hết. Ta chỉ thiếu tiền nộp cho đủ phí ải.",
      "Xe lương chở thịt khô lên bắc năm nay nhiều hơn mọi năm. Chở cho ai thì không ai dám hỏi.",
      "Đừng tin thương nhân nào nói đường bắc yên ổn. Kể cả ta.",
    ],
    color: 0x8a6a3a,
  },
  {
    id: "do_thap_tam_nuong",
    mapId: LANG_HOANG_ID,
    name: "Đỗ Thập Tam Nương",
    title: "Tán tu",
    x: 1948,
    y: 3066,
    dialog: [
      "Đỗ Thập Tam Nương. Con thứ mười ba nhà thợ săn. Ngươi có rượu không? Không có thì ta mời.",
      "Cây cung này cao hơn ta, ba năm rồi vẫn chưa kéo đủ. Cứ nhìn đi, rồi sẽ có ngày nó nghe lời.",
      "Tán tu như ta không có tông môn che lưng. Qua ải phải tự lo, hàng lậu cũng phải tự mang.",
      "Thiên hạ cười tán tu chỉ đáng làm bia cho người ta. Ta muốn cho họ thấy tán tu cũng lên được.",
      "Sói Lang Hoang không giống sói ở quê ta. Có con đứng yên nhìn ta giương cung, rồi quay đi như đã biết hết.",
    ],
    color: 0x6a8a5a,
  },
  {
    // Cổng vào bí cảnh (docs/THIET_KE_BI_CANH.md): chỉ đội trưởng mở được, nút do server dựng theo điều kiện của đội
    id: "thu_mon",
    name: "Huyền Cơ",
    title: "Thủ môn bí cảnh",
    x: TOWN_PX.x + 150,
    y: TOWN_PX.y - 100,
    dialog: [
      "Linh Hư Bí Cảnh mở cho đội tu sĩ đồng tâm. Một mình vào đó chỉ là nạp mạng.",
      "Đội trưởng nói một tiếng, ta mở cổng; ai không kịp bước vào trong thời hạn thì lỡ chuyến.",
      "Bí cảnh chỉ mở cho đội đồng tâm, kẻ đơn thương độc mã vào đó chỉ tổ bỏ mạng.",
      "Trong đó quái mạnh hơn ngoài kia nhiều, đạo hữu phải cùng đồng đội mà tiến.",
      "Muốn vào thì tìm đội đủ người, ta đây chỉ mở cổng, chứ không dắt ai vào sinh ra tử.",
    ],
    color: 0x3a6f8f,
  },
  {
    // Lò đan (nghề nhỏ lát 1, #514/#763): trạm alchemy ở Lạc Hà Trấn. Đứng đối xứng thợ rèn qua tâm trấn
    // (toạ độ đã kiểm: ô không chặn, trong trấn, cách NPC gần nhất 130 px > 64). Đan hộ đạo giúp tăng xác suất đột phá.
    id: "lao_dan",
    name: "Mộc Diên",
    title: "Lão đan sư",
    station: "alchemy",
    x: TOWN_PX.x - 130,
    y: TOWN_PX.y - 120,
    dialog: [
      "Lò ta nhóm lửa luyện đan, nhất là đan hộ đạo trợ giúp đạo hữu vượt ải đột phá cảnh giới.",
      "Đột phá rủi ro lắm, thất bại là mất tu vi cùng nửa khí huyết; đan hộ đạo cộng chút xác suất cho an toàn hơn.",
      "Muốn luyện đan hộ đạo thì mang nguyên liệu yêu thú tới, ta sẽ nấu cho ngươi viên hộ đạo đúng cảnh giới của mình.",
      "Đan hộ đạo chỉ dùng được khi ngươi đã đạt đỉnh bậc với đầy tu vi, đúng cảnh giới của viên đan mới có tác dụng.",
      "Hiệu lực đan hộ đạo có hạn, dùng xong trước khi đột phá là vừa; qua cổng, thoát game hay gục là mất, chớ luyện sớm.",
    ],
    color: 0xb07a3a,
  },
  {
    // Bàn phù (nghề nhỏ lát 2, #514/#817): trạm talisman ở Lạc Hà Trấn. Đứng lệch phải trên của tâm trấn, cách mọi NPC
    // khác > 64 px (test giữ); phù tăng sát thương chiêu cùng hệ trong 60 giây hoặc giảm hồi chiêu, chế từ đồ quái rơi.
    id: "lao_phu",
    name: "Tô Linh Ấn",
    title: "Lão phù sư",
    station: "talisman",
    x: TOWN_PX.x + 40,
    y: TOWN_PX.y - 40,
    dialog: [
      "Bàn phù ta nhóm hương trầm cả ngày, vẽ phù trấn yêu cho kẻ qua lại. Mang nguyên liệu yêu thú tới, ta chế phù cho đạo hữu.",
      "Phù tăng sát thương hệ nào thì chỉ mạnh với chiêu cùng hệ, dùng đúng lúc mới đáng đồng tiền bát gạo.",
      "Chế phù tốn Linh thạch và nguyên liệu quý, nhưng vào trận một lá phù đúng hệ, quái to cũng nhanh xuống ngựa.",
      "Phù chỉ có hạn sáu mươi giây, qua cổng hay thoát là mất; dùng sát khi vào đánh mới khỏi phí.",
      "Đừng vọng tưởng phù thay được công phu tu luyện, nó chỉ là chút trợ lực nhất thời cho kẻ đang gấp.",
    ],
    color: 0x7a5aa0,
  },
];

export const NPC_BY_ID: Record<string, NpcDef> = Object.fromEntries(NPCS.map((n) => [n.id, n]));

/** NPC đứng ở bản đồ `mapId`. Server dựng NPC của phòng từ đây (không dùng thẳng `NPCS`). */
export function npcsOfMap(mapId: string): NpcDef[] {
  return NPCS.filter((n) => (n.mapId ?? DEFAULT_MAP_ID) === mapId);
}

/** Khoảng cách tối đa để nói chuyện / giao dịch với NPC (px) */
export const NPC_RANGE = 80;

// ---------- Đổi đồ (tạm thời, trước khi có tiền tệ ở M3) ----------

export interface TradeDef {
  id: string;
  npcId: string;
  /** Nguyên liệu phải nộp */
  give: { itemId: string; qty: number }[];
  /** Vật phẩm nhận được */
  get: { itemId: string; qty: number };
}

export const TRADES: TradeDef[] = [
  {
    id: "doi_hoi_huyet",
    npcId: "duoc_su",
    give: [{ itemId: "long_tho", qty: 5 }],
    get: { itemId: "hoi_huyet_dan", qty: 1 },
  },
  {
    id: "doi_hoi_linh",
    npcId: "duoc_su",
    give: [{ itemId: "nanh_soi", qty: 3 }],
    get: { itemId: "hoi_linh_dan", qty: 1 },
  },
];

export const TRADE_BY_ID: Record<string, TradeDef> = Object.fromEntries(
  TRADES.map((t) => [t.id, t]),
);
