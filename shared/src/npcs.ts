// NPC trong Lạc Hà Trấn và giao dịch đổi đồ: hợp đồng giữa client và server (Sprint 2).
import { TOWN_PX } from "./map";

export interface NpcDef {
  id: string;
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
];

export const NPC_BY_ID: Record<string, NpcDef> = Object.fromEntries(NPCS.map((n) => [n.id, n]));

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
  {
    id: "doi_tu_khi",
    npcId: "duoc_su",
    give: [
      { itemId: "da_ho", qty: 2 },
      { itemId: "nanh_soi", qty: 5 },
    ],
    get: { itemId: "tu_khi_dan", qty: 1 },
  },
];

export const TRADE_BY_ID: Record<string, TradeDef> = Object.fromEntries(
  TRADES.map((t) => [t.id, t]),
);
