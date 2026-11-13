// Chữ của nút "Qua cổng" (nút tròn 58 px ở điện thoại). Trước đây nhãn là `<tên cổng> (F)` ("Vọng Trạch Quan (F)" ~118 px) nên luôn bị
// cắt thành "Vọng Trạ…" ở MỌI khung nhìn, mất cả ý "qua cổng". Nhãn nằm ở hàng dưới của nút tròn nên bề ngang dùng được chỉ ~43 px (dây cung
// của vòng tròn, không phải 54 px của hộp chữ): "Qua cổng" (53 px) vẫn bị vòng viền cắt hai đầu chữ. Nay nhãn trong nút cố định và ngắn
// (như "Chém", "Đả tọa"), tên cổng đi vào `title` / `aria-label` (tên cổng vẫn hiện trong thế giới, cạnh xoáy truyền tống).

/** Nhãn trong nút: cố định, đủ ngắn để vừa dây cung của nút tròn (đã đo ~26 px ở cỡ 10 px). */
export const PORTAL_BTN_LABEL = "Cổng";

export interface PortalBtnText {
  label: string;
  title: string;
  aria: string;
}

/** Chữ cho nút "Qua cổng" khi đứng gần cổng `gateName` (tên rỗng / sai kiểu: dùng chữ chung, không in "undefined"). */
export function portalBtnText(gateName: unknown): PortalBtnText {
  const name =
    typeof gateName === "string" && gateName.trim() ? gateName.trim() : "cổng truyền tống";
  return { label: PORTAL_BTN_LABEL, title: `Đi qua ${name} (F)`, aria: `Đi qua ${name} (Phím F)` };
}
