// Kiểu vẽ dấu nhiệm vụ trên đầu NPC và trên bản đồ (QUYET_DINH_M3 mục 66): "?" = có nhiệm vụ ĐÃ ĐỦ để trả, "!" = có nhiệm vụ mới để nhận.
// Trước đây "?" màu XANH LÁ nên người chơi không thấy nó là việc quan trọng nhất (phải về trả mới có thưởng); nay "?" là VÀNG tươi, to hơn "!" và có vòng sáng
// trên bản đồ. Tách thành hàm thuần (không Phaser) để test được; `WorldScene` và `map-render.ts` chỉ đọc bảng này.

export type NpcMarkerKind = "?" | "!";

export interface NpcMarkerStyle {
  /** Màu vòng sáng sau dấu (0xRRGGBB, cho Phaser) */
  aura: number;
  /** Màu chữ của dấu (CSS) */
  text: string;
  /** Độ đặc của nền vòng sáng (0..1) */
  auraAlpha: number;
  /** Co giãn của dấu và vòng sáng (1 = cỡ mặc định) */
  scale: number;
  /** Màu chữ nhãn trên bản đồ lớn / vòng quanh chấm NPC trên bản đồ (CSS) */
  mapColor: string;
}

export const NPC_MARKER_STYLE: Readonly<Record<NpcMarkerKind, NpcMarkerStyle>> = {
  "!": { aura: 0xffd700, text: "#ffe08a", auraAlpha: 0.25, scale: 1, mapColor: "#ff8a8a" },
  "?": { aura: 0xffd21f, text: "#ffec4d", auraAlpha: 0.45, scale: 1.3, mapColor: "#ffd21f" },
};

/** Kiểu của một dấu; chuỗi lạ (không phải "!" / "?") -> `undefined` (không vẽ). */
export function npcMarkerStyle(marker: string | null | undefined): NpcMarkerStyle | undefined {
  return marker === "?" || marker === "!" ? NPC_MARKER_STYLE[marker] : undefined;
}
