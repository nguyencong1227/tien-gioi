/**
 * Tinh anh (M7.3 bước 6, A #651; hợp đồng: `Monster.elite` uint8, 0 = quái thường, 1 = tinh anh, đặt MỘT lần lúc sinh; `kind` giữ nguyên loài gốc nên sprite / ảnh đúng).
 * Lớp THUẦN của phần nhìn (không Phaser): quyết định "có phải tinh anh không", chữ trên đầu, kích cỡ và nhịp của vầng sáng dưới chân, màu thanh máu / chấm bản đồ.
 *
 * Vì sao phải nổi RÕ từ xa: từ Kim Đan tinh anh có thể hạ cả người đứng yên (khí huyết x2,5, công x1,5), người chơi cần thấy trước khi tới gần: vầng sáng vàng cam dưới chân
 * (thấy từ xa, kể cả khi không đọc được chữ), tên vàng có sao + hậu tố "tinh anh", thanh máu to hơn luôn hiện (kể cả khi đầy), chấm hình thoi cam trên bản đồ nhỏ.
 */
import { monsterShadow } from "./gfx/anim/entity-lod";

/** Hậu tố của tên hiển thị (máy chủ cũng ghi cùng hậu tố ở `eliteDefOf`, nhưng bảng chỉ có 1 byte `elite` nên client tự ghép). */
export const ELITE_SUFFIX = " tinh anh";

/** Màu của phần nhìn trong cảnh (số cho Phaser, chuỗi cho chữ); màu trên bản đồ nhỏ ở `MAP_COLORS.elite` (giữ khớp chú giải `.lg.elite`). */
export const ELITE_STYLE = {
  // Cam đậm viền cam sẫm: vầng sáng vàng nhạt (bản đầu) chìm trên nền đá lát / cát nhạt của trấn, nên dùng màu bão hoà để thấy từ xa trên mọi nền
  auraFill: 0xff8a2b,
  auraLine: 0xc85a00,
  label: "#ffd76a",
  bar: 0xff8a2b,
  barEdge: 0xffe08a,
} as const;

/** `Monster.elite` có nghĩa là tinh anh không: số hữu hạn >= 1 (máy chủ cũ chưa có trường = undefined, giá trị rác = quái thường). */
export function isElite(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v) && v >= 1;
}

/** Tên hiển thị (nút Mục tiêu, thông báo): thêm hậu tố cho tinh anh, KHÔNG thêm hai lần nếu tên đã có. */
export function eliteName(name: string, elite: boolean): string {
  const n = String(name ?? "");
  if (!elite || n.endsWith(ELITE_SUFFIX)) return n;
  return `${n}${ELITE_SUFFIX}`;
}

/** Chữ trên đầu tinh anh: sao + tên + hậu tố (sao để nhận ra cả khi chữ nhỏ). */
export function eliteLabelText(name: string): string {
  return `★ ${eliteName(name, true)}`;
}

/** Bề rộng thanh máu tinh anh (px): to hơn quái thường (`max(24, 2r)`) đúng một nấc, tối thiểu 40. */
export function eliteBarWidth(radius: number): number {
  const r = Number.isFinite(radius) && radius > 0 ? radius : 8;
  return Math.max(40, Math.round(r * 2.6));
}

/** Vầng sáng dưới chân: elip rộng hơn bóng thường ~1,6 lần, cùng độ cao chân (`monsterShadow`). */
export function eliteAuraDims(radius: number): { w: number; h: number; y: number } {
  const s = monsterShadow(radius);
  return { w: Math.round(s.w * 1.6), h: Math.round(s.h * 1.7), y: s.y };
}

/**
 * Nhịp của vầng sáng theo sóng dùng chung của cảnh (`auraWave` 0..1, không tween riêng cho từng con): nở nhẹ + sáng lên. Giảm chuyển động thì đứng yên ở độ sáng vừa (vẫn thấy).
 */
export function eliteAuraPulse(wave: number, reduced: boolean): { scale: number; alpha: number } {
  if (reduced || !Number.isFinite(wave)) return { scale: 1, alpha: 0.5 };
  const w = Math.min(1, Math.max(0, wave));
  return { scale: 1 + 0.1 * w, alpha: 0.38 + 0.27 * w };
}

/**
 * Gợi ý "nên đi đội" (người dùng chốt 16/11, QUYET_DINH_M3 mục 22.2: giữ nguyên độ mạnh của tinh anh, một mình hạ được là chấp nhận, nên GỢI Ý trong game thay vì hạ số).
 * Hiện bằng một thông báo nhỏ MỘT LẦN cho mỗi loài trong một phiên chơi, ngay khi tinh anh đầu tiên của loài đó vào khung hình: không dán chữ lên đầu mọi tinh anh (nhãn đã dài: "★ Độc Tước tinh anh"),
 * không nhắc lại mỗi lần gặp (người chơi quen thì thấy phiền), không nhắc người đã đi đội (đã làm điều được gợi ý).
 */
export const ELITE_PARTY_HINT = "nên đi đội";

/** Lời thông báo khi tinh anh của loài `name` hiện ra: "★ Độc Tước tinh anh: nên đi đội." (ngắn để vừa hai dòng ở màn hình điện thoại 360 px; nhãn đã nói "tinh anh" là mạnh) */
export function eliteSightText(name: string): string {
  return `${eliteLabelText(name)}: ${ELITE_PARTY_HINT}.`;
}

/**
 * Cổng "nhắc một lần mỗi loài": `take(kind, partySize)` trả `true` đúng một lần cho mỗi loài và chỉ khi người chơi chưa vào đội (< 2 người kể cả mình).
 * Đang đi đội thì KHÔNG ghi nhớ loài đó: rời đội đi một mình gặp lại thì vẫn được nhắc (lúc đó mới cần). `kind` rỗng / không phải chuỗi bị bỏ qua.
 */
export class EliteHintGate {
  private readonly told = new Set<string>();

  take(kind: unknown, partySize: number): boolean {
    if (typeof kind !== "string" || kind === "" || this.told.has(kind)) return false;
    if (Number.isFinite(partySize) && partySize >= 2) return false;
    this.told.add(kind);
    return true;
  }
}
