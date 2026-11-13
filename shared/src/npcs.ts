// NPC trong Lạc Hà Trấn và giao dịch đổi đồ: hợp đồng giữa client và server (Sprint 2).
import { AM_SUONG_ID, DEFAULT_MAP_ID, HAC_PHONG_ID, TOWN_PX } from "./map";

export interface NpcDef {
  id: string;
  /** Bản đồ NPC đứng; bỏ trống là `DEFAULT_MAP_ID`. Toạ độ `x`, `y` tính trong bản đồ đó. */
  mapId?: string;
  name: string;
  /** Danh xưng hiện dưới tên, vd "Trưởng trấn" */
  title: string;
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
    ],
    color: 0x8c3b2a,
  },
  {
    id: "cao_thi",
    name: "Bảng cáo thị",
    title: "Việc trong ngày",
    x: TOWN_PX.x,
    y: TOWN_PX.y + 110,
    dialog: ["Giấy dán chi chít, nhưng hôm nay chẳng còn việc nào chưa có người nhận."],
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
    ],
    color: 0x6b4f8a,
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
    ],
    color: 0x9a4a30,
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
    ],
    color: 0x3a6f8f,
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
