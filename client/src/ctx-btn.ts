// Chữ của ba nút ngữ cảnh Nhặt / Nói chuyện / Qua cổng (nút tròn 58 px ở điện thoại). Nhãn nằm ở hàng dưới của nút tròn nên bề ngang dùng
// được chỉ ~43 px (dây cung của vòng tròn, không phải 54 px của hộp chữ): "Qua cổng" (53 px) vẫn bị vòng viền cắt hai đầu chữ. Trước đây nhãn là
// `<tên cổng> (F)` / `Nói chuyện · <NPC> (F)` / `Nhặt <món đồ>` (60-118 px) nên luôn bị cắt thành "Vọng Trạ…" / "Nói ch…" / "Nhặt Hồi…" ở MỌI khung nhìn.
// Nay nhãn trong nút cố định và ngắn (như "Chém", "Đả tọa"); tên cổng / NPC / món đồ đi vào `title` và `aria-label` (tên vẫn hiện trong thế giới:
// nhãn trên đầu NPC, trên món đồ rơi, cạnh xoáy truyền tống; phím F có ở dòng hướng dẫn phím của máy tính).

/** Nhãn trong nút: cố định, đủ ngắn để vừa dây cung nút tròn (đã đo ~22-28 px ở cỡ 10 px). */
export const PORTAL_BTN_LABEL = "Cổng";
export const TALK_BTN_LABEL = "Nói";
export const PICKUP_BTN_LABEL = "Nhặt";

export interface CtxBtnText {
  label: string;
  title: string;
  aria: string;
}

/** Tên sạch: chuỗi không rỗng (cắt khoảng trắng đầu / cuối) hoặc `undefined` (rỗng / sai kiểu: không in "undefined"). */
const cleanName = (n: unknown): string | undefined =>
  typeof n === "string" && n.trim() ? n.trim() : undefined;

const make = (
  label: string,
  verb: string,
  name: string | undefined,
  generic: string,
): CtxBtnText => {
  const what = name ? `${verb} ${name}` : generic;
  return { label, title: `${what} (F)`, aria: `${what} (Phím F)` };
};

/** Chữ cho nút "Qua cổng" khi đứng gần cổng `gateName` (tên rỗng / sai kiểu: chữ chung). */
export function portalBtnText(gateName: unknown): CtxBtnText {
  return make(PORTAL_BTN_LABEL, "Đi qua", cleanName(gateName), "Đi qua cổng truyền tống");
}

/** Chữ cho nút "Nói chuyện" khi đứng gần NPC `npcName` (tên rỗng / sai kiểu: chữ chung). */
export function talkBtnText(npcName: unknown): CtxBtnText {
  return make(TALK_BTN_LABEL, "Nói chuyện với", cleanName(npcName), "Nói chuyện");
}

/** Chữ cho nút "Nhặt" khi đứng gần món đồ `itemName` (tên rỗng / sai kiểu: chữ chung). */
export function pickupBtnText(itemName: unknown): CtxBtnText {
  return make(PICKUP_BTN_LABEL, "Nhặt", cleanName(itemName), "Nhặt vật phẩm rơi");
}
