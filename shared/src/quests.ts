// Nhiệm vụ dữ liệu hóa: hợp đồng giữa client và server (Sprint 2).
// Server cập nhật tiến độ và trao thưởng; client dùng các hàm dưới đây để hiển thị ("!", "?", "Hôi Lang 3/10")
// nên hai bên luôn tính giống nhau.
import { stepOf } from "./realms";
import type { Inventory } from "./items";

/** Các loại bước. Bước làm lần lượt theo thứ tự trong `steps`. */
export type QuestStep =
  /** Hạ `count` con quái loại `monster` (id trong MONSTERS) */
  | { kind: "kill"; monster: string; count: number }
  /** Có đủ `count` vật phẩm trong túi; bị trừ khỏi túi lúc trả nhiệm vụ */
  | { kind: "collect"; itemId: string; count: number }
  /** Tới nói chuyện với NPC */
  | { kind: "talk"; npcId: string }
  /** Đạt tới cảnh giới / bậc (hoặc cao hơn) */
  | { kind: "reachRealm"; realm: number; tier: number };

export interface QuestReward {
  exp?: number;
  items?: { itemId: string; qty: number }[];
}

export interface QuestDef {
  id: string;
  title: string;
  /** NPC giao nhiệm vụ, cũng là người nhận trả */
  giver: string;
  /** Tóm tắt một dòng cho sổ nhiệm vụ */
  desc: string;
  steps: QuestStep[];
  rewards: QuestReward;
  /** Nhiệm vụ tiếp theo trong chuỗi; nhiệm vụ đó chỉ mở khi nhiệm vụ này xong */
  next?: string;
  /** Cảnh giới tối thiểu để nhận */
  minRealm?: { realm: number; tier: number };
  /** Nhiệm vụ lặp: mỗi ngày làm được một lần (ngày tính theo giờ Việt Nam) */
  daily?: boolean;
  /** Lời thoại theo trạng thái */
  talk: {
    offer: string[];
    progress: string[];
    complete: string[];
  };
}

/** Nhiệm vụ đầu tiên của chuỗi chính (người chơi mới nhận ở Trưởng trấn) */
export const MAIN_QUEST_START = "nhap_the";

/**
 * Chuỗi nhiệm vụ chính: Phàm Nhân → Luyện Khí tầng 9 (dạy từng thứ), rồi Trúc Cơ (2 nhiệm vụ nối sang Hắc Phong Cốc, cộng 1 việc phụ hạ Xích Mãng theo đội: chuỗi chính KHÔNG bắt đội, trừ nhiệm vụ cuối) và Kim Đan (6 nhiệm vụ ở
 * Vọng Sương Trạm, M6 #404). Chặng đầu: mỗi nhiệm vụ dạy thêm một thứ
 * (đánh quái, nhặt đồ, đột phá, đả tọa, đổi đồ, đan dược). Sau đó là nhiệm vụ lặp ở Bảng cáo thị.
 * Thế giới: Lạc Hà Trấn dưới chân Vân Mộng Sơn; yêu thú càng xa trấn càng mạnh.
 */
export const QUESTS: QuestDef[] = [
  // ---------- Chuỗi chính ----------
  {
    id: "nhap_the",
    title: "Nhập thế",
    giver: "truong_tran",
    desc: "Tới chào Hà lão ở tiệm thuốc phía tây trấn.",
    steps: [{ kind: "talk", npcId: "duoc_su" }],
    rewards: { exp: 15, items: [{ itemId: "hoi_huyet_dan", qty: 3 }] },
    next: "tru_tho",
    talk: {
      offer: [
        "Người lạ mặt, ngươi mới tới Lạc Hà Trấn sao?",
        "Muốn bước lên con đường tu tiên thì trước hết phải biết giữ mạng. Đi gặp Hà lão, ông ấy sẽ chỉ cho ngươi.",
      ],
      progress: ["Tiệm thuốc của Hà lão ở phía tây trấn."],
      complete: ["Hà lão đã gặp ngươi rồi à? Tốt. Cầm lấy mấy viên đan này phòng thân."],
    },
  },
  {
    id: "tru_tho",
    title: "Thỏ phá ruộng",
    giver: "truong_tran",
    desc: "Hạ 5 Linh Thố ngoài trấn và mang về 3 túm lông thỏ.",
    steps: [
      { kind: "kill", monster: "tho", count: 5 },
      { kind: "collect", itemId: "long_tho", count: 3 },
    ],
    rewards: { exp: 25, items: [{ itemId: "hoi_huyet_dan", qty: 2 }] },
    next: "buoc_vao_tien_do",
    talk: {
      offer: [
        "Đám Linh Thố ăn sạch rau ngoài ruộng. Chúng không hung dữ, rất hợp để ngươi luyện tay.",
        "Hạ năm con, nhặt ít lông mang về làm bằng chứng. Đồ rơi trên đất, đứng gần mà nhặt.",
      ],
      progress: ["Linh Thố quanh quẩn ngay ngoài cổng trấn. Chém trúng là được, đừng sợ."],
      complete: [
        "Khá lắm. Kiếm pháp tuy vụng nhưng có khí thế.",
        "Ta thấy linh khí trong người ngươi đã đầy, sắp chạm tới ngưỡng rồi.",
      ],
    },
  },
  {
    id: "buoc_vao_tien_do",
    title: "Bước vào tiên đồ",
    giver: "truong_tran",
    desc: "Đột phá từ Phàm Nhân lên Luyện Khí.",
    steps: [{ kind: "reachRealm", realm: 1, tier: 0 }],
    rewards: { exp: 40, items: [{ itemId: "hoi_linh_dan", qty: 2 }] },
    next: "tinh_toa",
    talk: {
      offer: [
        "Phàm nhân tu luyện đến lúc linh khí tràn đầy thì phải phá vỡ xiềng xích của thân xác.",
        "Khi thanh tu vi đầy, hãy Đột phá. Có thể thất bại, chân khí nghịch loạn sẽ tổn hao tu vi, nhưng đừng nản.",
      ],
      progress: ["Thanh tu vi chưa đầy thì chưa đột phá được. Ra ngoài luyện thêm đi."],
      complete: [
        "Ta cảm nhận được linh lực đang lưu chuyển trong kinh mạch ngươi. Chúc mừng, Luyện Khí tầng một!",
        "Hà lão có chuyện muốn nói với người mới bước vào tiên đồ. Ghé qua đó một chuyến.",
      ],
    },
  },
  {
    id: "tinh_toa",
    title: "Tĩnh tọa dưỡng khí",
    giver: "duoc_su",
    desc: "Đạt Luyện Khí tầng 3. Đả tọa để hồi phục và tăng tu vi.",
    steps: [{ kind: "reachRealm", realm: 1, tier: 2 }],
    rewards: { exp: 60, items: [{ itemId: "tu_khi_dan", qty: 1 }] },
    next: "nanh_soi_ren_kiem",
    talk: {
      offer: [
        "Đánh giết chỉ là một nửa con đường. Nửa còn lại là ngồi yên.",
        "Khi mỏi mệt, hãy Đả tọa: khí huyết, linh lực hồi rất nhanh, tu vi cũng tự tăng. Nhưng động thân là khí tán, phải ngồi lại từ đầu.",
        "Khi nào tới Luyện Khí tầng ba thì quay lại gặp lão.",
      ],
      progress: ["Chưa tới tầng ba à? Ngồi xuống, thở chậm lại."],
      complete: [
        "Hơi thở đã đều hơn nhiều. Viên Tụ Khí Đan này giúp ngươi tích tu vi nhanh hơn một chút.",
        "Thiết Ngưu ở lò rèn phía đông đang cần người giúp, ngươi qua xem.",
      ],
    },
  },
  {
    id: "nanh_soi_ren_kiem",
    title: "Nanh sói cho lò rèn",
    giver: "tho_ren",
    desc: "Hạ 8 Hôi Lang ở vùng cỏ cao và mang về 5 nanh sói.",
    steps: [
      { kind: "kill", monster: "lang", count: 8 },
      { kind: "collect", itemId: "nanh_soi", count: 5 },
    ],
    rewards: { exp: 80, items: [{ itemId: "hoi_linh_dan", qty: 2 }] },
    next: "thuoc_cho_tran",
    talk: {
      offer: [
        "Ngươi là tu sĩ mà Hà lão nhắc tới hả? Ta là Thiết Ngưu.",
        "Chuôi kiếm tốt phải bọc bằng nanh sói mài nhẵn. Hôi Lang ở vùng cỏ cao ngoài kia, chúng đi theo bầy, cẩn thận.",
      ],
      progress: ["Hôi Lang thấy người là lao tới. Lùi lại, dùng Kiếm khí đánh từ xa."],
      complete: [
        "Nanh tốt! Khi lò rèn đủ lửa, ta sẽ rèn cho ngươi một thanh kiếm ra hồn.",
        "Hà lão vừa nhắn qua, hình như tiệm thuốc thiếu nguyên liệu.",
      ],
    },
  },
  {
    id: "thuoc_cho_tran",
    title: "Thuốc cho người trong trấn",
    giver: "duoc_su",
    desc: "Mang tới cho Hà lão 8 túm lông thỏ và 4 nanh sói.",
    steps: [
      { kind: "collect", itemId: "long_tho", count: 8 },
      { kind: "collect", itemId: "nanh_soi", count: 4 },
    ],
    rewards: {
      exp: 80,
      items: [
        { itemId: "hoi_huyet_dan", qty: 4 },
        { itemId: "hoi_linh_dan", qty: 2 },
      ],
    },
    next: "hac_ho",
    talk: {
      offer: [
        "Mấy hôm nay thợ săn trong trấn bị sói cắn liên tục, thuốc trong tiệm sắp cạn.",
        "Mang cho lão ít lông thỏ và nanh sói. Sau này dư nguyên liệu, cứ đem tới đổi lấy đan.",
      ],
      progress: [
        "Lông thỏ để làm bông băng, nanh sói tán bột cầm máu. Thiếu thứ nào cũng không được.",
      ],
      complete: [
        "Đủ cả rồi. Mấy viên này lão luyện sẵn, ngươi cầm đi.",
        "Trưởng trấn đang lo chuyện lớn hơn, nghe nói Hắc Hổ đã xuống núi.",
      ],
    },
  },
  {
    id: "hac_ho",
    title: "Hắc Hổ xuống núi",
    giver: "truong_tran",
    desc: "Đạt Luyện Khí tầng 7, rồi hạ 2 Hắc Hổ và mang về 1 tấm da hổ.",
    steps: [
      { kind: "reachRealm", realm: 1, tier: 6 },
      { kind: "kill", monster: "ho", count: 2 },
      { kind: "collect", itemId: "da_ho", count: 1 },
    ],
    rewards: { exp: 120, items: [{ itemId: "tu_khi_dan", qty: 1 }] },
    next: "dinh_luyen_khi",
    talk: {
      offer: [
        "Hắc Hổ vốn sống sâu trong rừng phía xa. Nay chúng xuống tới bìa rừng, cắn chết ba con trâu của trấn.",
        "Chưa tới Luyện Khí tầng bảy thì đừng đi, một cú vồ của nó đủ khiến ngươi trọng thương. Mang đủ đan dược theo người.",
      ],
      progress: [
        "Hắc Hổ ở xa trấn hơn Hôi Lang nhiều. Đánh vài đòn rồi lùi, đừng đứng yên chịu đòn.",
      ],
      complete: [
        "Da Hắc Hổ! Từ nay thợ săn trong trấn có thể ngủ yên rồi.",
        "Ngươi tiến bộ nhanh hơn ta tưởng. Lạc Hà Trấn đã không còn đủ chỗ cho ngươi.",
      ],
    },
  },
  {
    id: "dinh_luyen_khi",
    title: "Đỉnh Luyện Khí",
    giver: "truong_tran",
    desc: "Đạt Luyện Khí tầng 9.",
    steps: [{ kind: "reachRealm", realm: 1, tier: 8 }],
    next: "truc_co_nhap_mon",
    rewards: {
      exp: 150,
      items: [
        { itemId: "tu_khi_dan", qty: 2 },
        { itemId: "hoi_huyet_dan", qty: 5 },
      ],
    },
    talk: {
      offer: [
        "Luyện Khí có chín tầng. Đứng ở tầng chín mới có tư cách nhìn lên Trúc Cơ.",
        "Đi đi, đánh, ngồi, rồi lại đánh. Khi nào tới tầng chín thì quay về đây.",
      ],
      progress: ["Chưa tới tầng chín. Bảng cáo thị ngày nào cũng có việc, làm thêm cho quen tay."],
      complete: [
        "Luyện Khí tầng chín… Năm xưa ta cũng dừng chân ở đây suốt mười năm.",
        "Muốn Trúc Cơ phải có cơ duyên. Người ta đồn trong hang sâu nhất của Vân Mộng Sơn có Xích Mãng canh giữ linh mạch. Khi nào đủ sức, ngươi hãy tự mình đi xem.",
      ],
    },
  },

  // ---------- Chuỗi Trúc Cơ (M6, #404): nối Lạc Hà -> Hắc Phong Cốc ----------
  {
    id: "truc_co_nhap_mon",
    title: "Trúc Cơ nhập môn",
    giver: "truong_tran",
    desc: "Đột phá lên Trúc Cơ.",
    steps: [{ kind: "reachRealm", realm: 2, tier: 0 }],
    rewards: { exp: 100, items: [{ itemId: "hoi_linh_dan", qty: 3 }] },
    minRealm: { realm: 1, tier: 8 },
    next: "thanh_lo_tram",
    talk: {
      offer: [
        "Tầng chín viên mãn rồi thì chỉ còn một cửa: Đột phá. Bấm B khi thanh tu vi đầy; hỏng thì mất ba phần tu vi, đừng nản.",
        "Trúc Cơ xong hãy quay lại, trấn này còn việc cho ngươi.",
      ],
      progress: ["Chưa Trúc Cơ. Đả tọa cho thanh tu vi đầy rồi bấm Đột phá."],
      complete: [
        "Trúc Cơ! Nền đã vững, giờ mới thật sự là tu sĩ.",
        "Phía bắc có Bắc Môn Quan sang Hắc Phong Cốc, ghé Thanh Lộ Trạm trước. Còn Xích Mãng trong hang sâu thì chưa ai hạ nổi một mình: muốn thử cùng đồng đội, cứ tới nói với ta.",
      ],
    },
  },
  {
    id: "mang_hoan",
    title: "Mãng hoạn",
    giver: "truong_tran",
    desc: "Việc phụ (không bắt buộc): hạ 1 Xích Mãng (nên đi theo đội) và mang về 2 vảy mãng.",
    steps: [
      { kind: "kill", monster: "mang", count: 1 },
      { kind: "collect", itemId: "vay_mang", count: 2 },
    ],
    rewards: {
      exp: 300,
      items: [
        { itemId: "tu_khi_dan", qty: 1 },
        { itemId: "hoi_huyet_dan", qty: 5 },
      ],
    },
    minRealm: { realm: 2, tier: 0 },
    talk: {
      offer: [
        "Xích Mãng canh linh mạch đã quá lâu, đêm đêm nó ra bìa núi phun độc. Một mình thì đừng liều: rủ đồng đội, lập đội rồi hẵng đi.",
        "Mang về hai chiếc vảy để ta biết nó đã ngã xuống.",
      ],
      progress: ["Xích Mãng đòn rất nặng. Đi đội, mang đủ Hồi Huyết Đan."],
      complete: [
        "Vảy đỏ thẫm, đúng là Xích Mãng. Linh mạch yên rồi.",
        "Cả trấn chưa ai dám làm việc này. Ngươi và đồng đội xứng đáng được nhớ tên.",
      ],
    },
  },
  {
    id: "thanh_lo_tram",
    title: "Thanh Lộ Trạm",
    giver: "truong_tran",
    desc: "Qua Bắc Môn Quan, tới Thanh Lộ Trạm (Hắc Phong Cốc) và nói chuyện với lái buôn Mạc Thông.",
    steps: [{ kind: "talk", npcId: "lai_buon" }],
    rewards: { exp: 100, items: [{ itemId: "hoi_huyet_dan", qty: 5 }] },
    minRealm: { realm: 2, tier: 0 },
    next: "vong_suong",
    talk: {
      offer: [
        "Phía bắc Lạc Hà có Bắc Môn Quan, qua đó là Hắc Phong Cốc, gió rát và thú dữ hơn Vân Mộng Sơn nhiều.",
        "Dừng chân ở Thanh Lộ Trạm sát cổng, nói chuyện với lái buôn Mạc Thông. Ông ấy biết đường đi tiếp.",
      ],
      progress: ["Chưa gặp Mạc Thông ở Thanh Lộ Trạm. Cổng nằm sát rìa phía bắc Lạc Hà."],
      complete: [
        "Mạc Thông gửi lời hỏi thăm ngươi. Ông ấy nói tận cùng phía bắc Hắc Phong Cốc có Vọng Trạch Quan, qua đó là đầm Âm Sương.",
        "Đầm ấy dành cho Kim Đan. Tới trạm Vọng Sương rồi gặp trạm trưởng Tống Vân Hạc.",
      ],
    },
  },

  // ---------- Chuỗi Kim Đan ở Vọng Sương Trạm (M6, #404) ----------
  {
    id: "vong_suong",
    title: "Vọng Sương",
    giver: "tram_truong",
    desc: "Đột phá lên Kim Đan.",
    steps: [{ kind: "reachRealm", realm: 3, tier: 0 }],
    rewards: { exp: 600, items: [{ itemId: "dai_hoi_huyet_dan", qty: 3 }] },
    minRealm: { realm: 2, tier: 2 },
    next: "suong_ho_hoan",
    talk: {
      offer: [
        "Ngươi từ Hắc Phong Cốc qua à? Vọng Sương Trạm mở cửa cho mọi người, nhưng đầm ngoài kia thì chỉ Kim Đan mới sống nổi.",
        "Trúc Cơ hậu kỳ đã đủ tư cách thử Đột phá. Lên Kim Đan rồi quay lại tìm ta, đừng ra khỏi vòng đèn trước đó.",
      ],
      progress: ["Chưa Kim Đan. Ở trong vòng đèn đả tọa, chờ thanh tu vi đầy rồi Đột phá."],
      complete: [
        "Kim Đan thành, khí đan chuyển động quanh người ngươi rõ như đèn. Giờ đầm là của ngươi.",
        "Việc đầu tiên: bầy sương hồ ở ngoài rìa, chúng quấy nhiễu khách đi đường.",
      ],
    },
  },
  {
    id: "suong_ho_hoan",
    title: "Sương Hồ hoạn",
    giver: "tram_truong",
    desc: "Hạ 25 Sương Hồ và mang về 12 sương mao.",
    steps: [
      { kind: "kill", monster: "suong_ho", count: 25 },
      { kind: "collect", itemId: "suong_mao", count: 12 },
    ],
    rewards: {
      exp: 1200,
      items: [
        { itemId: "hoi_huyet_dan", qty: 5 },
        { itemId: "dai_hoi_huyet_dan", qty: 2 },
      ],
    },
    minRealm: { realm: 3, tier: 0 },
    next: "thach_quy_giap",
    talk: {
      offer: [
        "Sương hồ nhanh và đi thành đàn. Chúng mất mạng nhưng để lại sương mao rất nhẹ, thợ rèn Hồ Thiết cần để làm bộ đầu tiên.",
        "Hạ hai mươi lăm con, gom mười hai nhúm sương mao.",
      ],
      progress: [
        "Sương hồ ở rìa ngoài đầm, gần trạm nhất. Đánh một con rồi lùi, đừng để cả đàn vây.",
      ],
      complete: [
        "Sương mao nhẹ thật. Hồ Thiết sẽ mừng. Cầm lấy ít đan.",
        "Tiếp theo là thạch quy: chậm, dày, nhưng mai của chúng làm bộ giáp tốt nhất vùng này.",
      ],
    },
  },
  {
    id: "thach_quy_giap",
    title: "Mai rùa",
    giver: "tram_truong",
    desc: "Hạ 15 Thạch Quy và mang về 10 quy giáp.",
    steps: [
      { kind: "kill", monster: "thach_quy", count: 15 },
      { kind: "collect", itemId: "quy_giap", count: 10 },
    ],
    rewards: { exp: 1200, items: [{ itemId: "dai_hoi_linh_dan", qty: 3 }] },
    minRealm: { realm: 3, tier: 0 },
    next: "doc_thiem_nang",
    talk: {
      offer: [
        "Thạch quy đánh không đau nhưng máu dày như núi, hạ một con mất khá lâu. Kiên nhẫn là việc chính.",
        "Mười lăm con, gom mười tấm quy giáp.",
      ],
      progress: [
        "Thạch quy lười chạy, cứ đánh đều tay. Đừng đứng giữa bãi lâu quá, sương dày lên sẽ khó thấy.",
      ],
      complete: ["Quy giáp dày thật. Hồ Thiết sẽ rèn được cả bộ cho ngươi."],
    },
  },
  {
    id: "doc_thiem_nang",
    title: "Độc nang",
    giver: "tram_truong",
    desc: "Đạt Kim Đan trung kỳ, hạ 12 Độc Thiềm và mang về 8 độc nang.",
    steps: [
      { kind: "reachRealm", realm: 3, tier: 1 },
      { kind: "kill", monster: "doc_thiem", count: 12 },
      { kind: "collect", itemId: "doc_nang", count: 8 },
    ],
    rewards: {
      exp: 1500,
      items: [
        { itemId: "dai_hoi_huyet_dan", qty: 4 },
        { itemId: "tu_khi_dan", qty: 1 },
      ],
    },
    minRealm: { realm: 3, tier: 0 },
    next: "kim_dan_hau_ky",
    talk: {
      offer: [
        "Độc thiềm nằm sâu hơn, đòn nặng nhưng máu mỏng: trúng hai ba cú là ngã, ngươi phải đánh nhanh và biết lùi. Sơ kỳ thì đừng thử.",
        "Đạt Kim Đan trung kỳ rồi hạ mười hai con, lấy tám túi độc.",
      ],
      progress: [
        "Độc thiềm đòn cực nặng. Mang đủ Đại Hồi Huyết Đan, uống trước khi khí huyết xuống nửa.",
      ],
      complete: [
        "Độc nang còn nguyên, không vỡ. Ngươi làm việc cẩn thận.",
        "Cóc độc đã xong, còn lại là cửa ải cuối: Hắc Giao trong hang sâu nhất.",
      ],
    },
  },
  {
    id: "kim_dan_hau_ky",
    title: "Kim Đan hậu kỳ",
    giver: "tram_truong",
    desc: "Đạt Kim Đan hậu kỳ.",
    steps: [{ kind: "reachRealm", realm: 3, tier: 2 }],
    rewards: { exp: 800, items: [{ itemId: "dai_hoi_linh_dan", qty: 4 }] },
    minRealm: { realm: 3, tier: 1 },
    next: "giao_hoan",
    talk: {
      offer: [
        "Hắc Giao không phải thứ một người, thậm chí hai người, đối phó nổi. Ít nhất là ba, và phải là Kim Đan trung kỳ trở lên.",
        "Ngươi lên Kim Đan hậu kỳ cho vững rồi hẵng lập đội.",
      ],
      progress: ["Chưa tới hậu kỳ. Đừng vội: Hắc Giao không chạy mất."],
      complete: ["Hậu kỳ rồi. Hắc Giao còn đó, vẫn đợi."],
    },
  },
  {
    id: "giao_hoan",
    title: "Giao hoạn",
    giver: "tram_truong",
    desc: "Hạ Hắc Giao (đội 3-4 người) và mang về 3 giao lân.",
    steps: [
      { kind: "kill", monster: "hac_giao", count: 1 },
      { kind: "collect", itemId: "giao_lan", count: 3 },
    ],
    rewards: {
      exp: 2500,
      items: [
        { itemId: "tu_khi_dan", qty: 1 },
        { itemId: "dai_hoi_huyet_dan", qty: 5 },
      ],
    },
    minRealm: { realm: 3, tier: 1 },
    talk: {
      offer: [
        "Hắc Giao ở hang sâu nhất phía bắc đầm, nơi sương đặc nhất. Hạ nó phải đội ba bốn người đồng tâm, ai cũng mang đủ đan.",
        "Giao lân là nguyên liệu của bộ cuối. Mang về ba chiếc làm bằng chứng.",
      ],
      progress: ["Hắc Giao đánh chậm mà rất đau. Chia nhau chịu đòn, đừng để một người đứng mũi."],
      complete: [
        "Hắc Giao đã ngã. Cả Vọng Sương Trạm sẽ nhớ tên đội ngươi.",
        "Ra khỏi đầm này còn là Nguyên Anh: đường còn dài. Nhưng đó là chuyện của ngày khác.",
      ],
    },
  },

  // ---------- Nhiệm vụ lặp ở Bảng cáo thị ----------
  {
    id: "lang_hai",
    title: "Lang hại",
    giver: "cao_thi",
    desc: "Hạ 10 Hôi Lang.",
    steps: [{ kind: "kill", monster: "lang", count: 10 }],
    rewards: { exp: 60, items: [{ itemId: "hoi_linh_dan", qty: 2 }] },
    minRealm: { realm: 1, tier: 0 },
    daily: true,
    talk: {
      offer: ["Cáo thị: bầy Hôi Lang quấy nhiễu đường núi. Ai hạ được mười con, trấn sẽ hậu tạ."],
      progress: ["Hôi Lang sống ở vùng cỏ cao, xa trấn hơn đám thỏ."],
      complete: ["Ngươi xé tờ cáo thị đem tới, phần thưởng đã được để sẵn."],
    },
  },
  {
    id: "nop_nanh",
    title: "Nanh sói làm thuốc",
    giver: "cao_thi",
    desc: "Nộp 5 nanh sói.",
    steps: [{ kind: "collect", itemId: "nanh_soi", count: 5 }],
    rewards: { exp: 50 },
    minRealm: { realm: 1, tier: 0 },
    daily: true,
    talk: {
      offer: ["Cáo thị: tiệm thuốc cần nanh sói, mỗi ngày thu năm chiếc."],
      progress: ["Chưa đủ năm chiếc nanh sói."],
      complete: ["Nanh còn tươi, tốt lắm."],
    },
  },
  {
    id: "ho_hoan",
    title: "Hổ hoạn",
    giver: "cao_thi",
    desc: "Hạ 3 Hắc Hổ.",
    steps: [{ kind: "kill", monster: "ho", count: 3 }],
    rewards: { exp: 300, items: [{ itemId: "tu_khi_dan", qty: 1 }] },
    minRealm: { realm: 1, tier: 6 },
    daily: true,
    talk: {
      offer: [
        "Cáo thị: Hắc Hổ lảng vảng ở bìa rừng. Cần tu sĩ từ Luyện Khí tầng bảy trở lên, hạ ba con.",
      ],
      progress: ["Hắc Hổ đánh rất đau. Mang theo Hồi Huyết Đan."],
      complete: ["Ba con Hắc Hổ trong một ngày. Người trong trấn sẽ còn nhắc tên ngươi."],
    },
  },
  // ---------- Nhiệm vụ lặp ở Vọng Sương Trạm (M6, #404) ----------
  {
    id: "suong_ho_quay",
    title: "Sương Hồ quấy nhiễu",
    giver: "tram_truong",
    desc: "Hạ 20 Sương Hồ.",
    steps: [{ kind: "kill", monster: "suong_ho", count: 20 }],
    rewards: { exp: 700, items: [{ itemId: "hoi_huyet_dan", qty: 3 }] },
    minRealm: { realm: 3, tier: 0 },
    daily: true,
    talk: {
      offer: ["Trạm cần thêm sương mao dự trữ. Hạ hai mươi sương hồ ở rìa đầm, trạm hậu tạ."],
      progress: ["Sương hồ ở rìa ngoài đầm."],
      complete: ["Hai mươi con trong ngày. Trạm ghi công ngươi."],
    },
  },
  {
    id: "thach_quy_phien",
    title: "Thạch Quy chắn đường",
    giver: "tram_truong",
    desc: "Hạ 10 Thạch Quy.",
    steps: [{ kind: "kill", monster: "thach_quy", count: 10 }],
    rewards: { exp: 800, items: [{ itemId: "hoi_linh_dan", qty: 3 }] },
    minRealm: { realm: 3, tier: 0 },
    daily: true,
    talk: {
      offer: ["Bầy thạch quy chắn lối vận chuyển hàng. Dọn đường giúp trạm, mười con là đủ."],
      progress: ["Thạch quy ở vùng giữa đầm, máu dày."],
      complete: ["Đường thông rồi. Lái buôn Phó Quang cảm ơn ngươi."],
    },
  },
  {
    id: "doc_nang_nop",
    title: "Độc nang cho dược sư",
    giver: "tram_truong",
    desc: "Nộp 6 độc nang.",
    steps: [{ kind: "collect", itemId: "doc_nang", count: 6 }],
    rewards: { exp: 900 },
    minRealm: { realm: 3, tier: 1 },
    daily: true,
    talk: {
      offer: ["Dược sư các trạm thu độc nang mỗi ngày, sáu túi một lần."],
      progress: ["Chưa đủ sáu túi độc nang."],
      complete: ["Độc nang còn tươi, tốt lắm."],
    },
  },
];

export const QUEST_BY_ID: Record<string, QuestDef> = Object.fromEntries(
  QUESTS.map((q) => [q.id, q]),
);

/** Nhiệm vụ đứng trước (chuỗi `next`): phải xong nhiệm vụ trước mới nhận được nhiệm vụ sau */
export const QUEST_PREV: Record<string, string> = Object.fromEntries(
  QUESTS.filter((q) => q.next).map((q) => [q.next!, q.id]),
);

/** Số nhiệm vụ tối đa nhận cùng lúc */
export const MAX_ACTIVE_QUESTS = 8;

// ---------- Tiến độ ----------

export interface QuestProgress {
  id: string;
  /** Đang ở bước thứ mấy (0-based). Bằng steps.length nghĩa là đã làm hết các bước */
  step: number;
  /** Tiến độ của bước hiện tại: số quái đã hạ (kill), 1 nếu đã nói chuyện (talk); collect / reachRealm không dùng */
  count: number;
}

/** Ngữ cảnh của người chơi để tính trạng thái nhiệm vụ */
export interface QuestCtx {
  realm: number;
  tier: number;
  inv: Inventory;
}

/** Ngày theo giờ Việt Nam (UTC+7), dạng "2026-11-08": mốc làm mới nhiệm vụ lặp */
export function dayKey(ms: number): string {
  return new Date(ms + 7 * 3600_000).toISOString().slice(0, 10);
}

export function countItem(inv: Inventory, itemId: string): number {
  let n = 0;
  for (const s of inv) if (s?.itemId === itemId) n += s.qty;
  return n;
}

/** Bước đã đạt chưa. `count` là tiến độ đã lưu của bước đó. */
export function stepSatisfied(step: QuestStep, count: number, ctx: QuestCtx): boolean {
  switch (step.kind) {
    case "kill":
      return count >= step.count;
    case "talk":
      return count >= 1;
    case "collect":
      return countItem(ctx.inv, step.itemId) >= step.count;
    case "reachRealm":
      return stepOf(ctx.realm, ctx.tier) >= stepOf(step.realm, step.tier);
  }
}

/** Tiến độ để hiển thị, vd { have: 3, need: 10 } */
export function stepProgress(
  step: QuestStep,
  count: number,
  ctx: QuestCtx,
): { have: number; need: number } {
  switch (step.kind) {
    case "kill":
      return { have: Math.min(count, step.count), need: step.count };
    case "talk":
      return { have: Math.min(count, 1), need: 1 };
    case "collect":
      return { have: Math.min(countItem(ctx.inv, step.itemId), step.count), need: step.count };
    case "reachRealm":
      return { have: stepSatisfied(step, count, ctx) ? 1 : 0, need: 1 };
  }
}

/**
 * Trả được nhiệm vụ chưa: đã qua hết các bước, và các bước collect vẫn còn đủ đồ trong túi
 * (lỡ vứt bớt đồ sau khi qua bước đó thì chưa trả được).
 */
export function questReady(def: QuestDef, prog: QuestProgress, ctx: QuestCtx): boolean {
  if (prog.step < def.steps.length) return false;
  return def.steps.every((s) => s.kind !== "collect" || stepSatisfied(s, 0, ctx));
}

/** Trạng thái sổ nhiệm vụ gửi cho client (tin nhắn `quests`) */
export interface QuestsMsg {
  active: QuestProgress[];
  /** Nhiệm vụ không lặp đã xong */
  done: string[];
  /** Nhiệm vụ lặp đã xong trong hôm nay */
  dailyDone: string[];
}

/** Nhận được nhiệm vụ này không */
export function canAccept(def: QuestDef, log: QuestsMsg, ctx: QuestCtx): boolean {
  if (log.active.some((a) => a.id === def.id)) return false;
  if (log.active.length >= MAX_ACTIVE_QUESTS) return false;
  if (def.daily ? log.dailyDone.includes(def.id) : log.done.includes(def.id)) return false;
  const prev = QUEST_PREV[def.id];
  if (prev && !log.done.includes(prev)) return false;
  if (def.minRealm && stepOf(ctx.realm, ctx.tier) < stepOf(def.minRealm.realm, def.minRealm.tier))
    return false;
  return true;
}

/** Ký hiệu trên đầu NPC: "?" có nhiệm vụ để trả, "!" có nhiệm vụ mới, "" không có gì */
export function npcMarker(npcId: string, log: QuestsMsg, ctx: QuestCtx): "?" | "!" | "" {
  for (const a of log.active) {
    const def = QUEST_BY_ID[a.id];
    if (def?.giver === npcId && questReady(def, a, ctx)) return "?";
  }
  return QUESTS.some((q) => q.giver === npcId && canAccept(q, log, ctx)) ? "!" : "";
}

// ---------- Tin nhắn client -> server ----------
export interface TalkMsg {
  npcId: string;
}
export interface QuestAcceptMsg {
  questId: string;
}
export interface QuestTurnInMsg {
  questId: string;
}
export interface QuestAbandonMsg {
  questId: string;
}
export interface TradeMsg {
  tradeId: string;
}

// ---------- Tin nhắn server -> client (chỉ gửi cho người đó) ----------
/**
 * Bấm lựa chọn thì client gửi tin nhắn tương ứng (questAccept / questTurnIn / trade) hoặc đóng hộp thoại.
 * "forge": client đóng hộp thoại và mở bảng rèn đồ của npcId (danh sách RECIPES có npcId đó).
 */
export type DialogAction =
  | { kind: "accept"; questId: string }
  | { kind: "turnIn"; questId: string }
  | { kind: "trade"; tradeId: string }
  | { kind: "forge" }
  /** Mở bảng cửa hàng của NPC này (`SHOP_BY_NPC` trong currency.ts); mua / bán đi qua tin `buy` / `sell` */
  | { kind: "shop" }
  /** Mở bí cảnh `dungeonId` cho đội (chỉ đội trưởng): bấm thì client gửi tin `dungeonOpen { dungeonId }` (dungeon.ts); server kiểm mọi điều kiện, docs/THIET_KE_BI_CANH.md */
  | { kind: "dungeon"; dungeonId: string }
  | { kind: "close" };

export interface DialogOption {
  label: string;
  action: DialogAction;
  /** Hiện nhưng không bấm được (vd thiếu nguyên liệu để đổi) */
  disabled?: boolean;
}

export interface DialogMsg {
  npcId: string;
  lines: string[];
  options: DialogOption[];
}
