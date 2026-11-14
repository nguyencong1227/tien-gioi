// Dùng chung cho `shot-layout.ts` (chụp ảnh) và `e2e-giao-dien.ts` (kiểm bố cục): các cỡ màn hình cần kiểm, cách đổi cỡ như thiết bị thật và cách dựng
// một màn chơi "đông" (tổ đội 3 người, hai nhiệm vụ, chat nhiều dòng) như người dùng gặp (QUYET_DINH_M3 mục 15).
import { Tab, sleep } from "./e2e-kit";

export interface Viewport {
  w: number;
  h: number;
  /** Giả lập thiết bị cảm ứng (điện thoại) */
  touch: boolean;
  note: string;
}

export const VIEWPORTS: readonly Viewport[] = [
  { w: 360, h: 640, touch: true, note: "điện thoại dọc nhỏ" },
  { w: 412, h: 915, touch: true, note: "điện thoại dọc lớn" },
  { w: 915, h: 412, touch: true, note: "điện thoại ngang" },
  { w: 550, h: 900, touch: false, note: "cửa sổ hẹp (ảnh người dùng gửi)" },
  { w: 1366, h: 768, touch: false, note: "máy tính xách tay" },
  { w: 1920, h: 1080, touch: false, note: "máy tính để bàn" },
];

/** Các bảng nổi cần đo diện tích (id phần tử). */
export const PANELS = [
  "hud",
  "party-panel",
  "quest-tracker",
  "chat",
  "minimap-wrap",
  "hud-menu",
  "hud-col-left",
  "hud-col-right",
] as const;

/** Đổi khung nhìn như thiết bị thật (điện thoại: `mobile` + cảm ứng + `data-input="touch"`), đợi lõi hiển thị phân loại lại. */
export async function applyViewport(t: Tab, v: Viewport): Promise<void> {
  await t.send("Emulation.setDeviceMetricsOverride", {
    width: v.w,
    height: v.h,
    deviceScaleFactor: 1,
    mobile: v.touch,
  });
  await t.send("Emulation.setTouchEmulationEnabled", { enabled: v.touch });
  await sleep(900); // Scale Manager + lõi hiển thị (data-form / data-orient) phân loại lại
  await t.ev(
    `document.documentElement.setAttribute('data-input', ${JSON.stringify(v.touch ? "touch" : "mouse")}); 1`,
  );
  await sleep(300);
}

/** Dựng màn chơi "đông" bằng API `window.__ui` (chỉ có khi mở với `?debug`). */
export async function crowdHud(t: Tab, selfName: string): Promise<void> {
  await t.ev(`(() => {
    const ui = window.__ui;
    ui.onParty({ leader: ${JSON.stringify(selfName)}, members: [
      { name: ${JSON.stringify(selfName)}, realm: 1, tier: 3, hp: 92, maxHp: 100, x: 0, y: 0, mapId: 'lac_ha' },
      { name: 'Thanh Van Tu', realm: 1, tier: 2, hp: 64, maxHp: 100, x: 0, y: 0, mapId: 'lac_ha' },
      { name: 'Bach Ha Quan', realm: 2, tier: 1, hp: 100, maxHp: 140, x: 0, y: 0, mapId: 'lac_ha' },
    ] });
    ui.onQuests({ active: [{ id: 'nhap_the', step: 0, count: 0 }, { id: 'tru_tho', step: 0, count: 3 }], done: [], dailyDone: [] });
    const lines = [
      ['', 'Cu Ky Anh Anh (Phàm Nhân) đã nhập thế.', true], ['Thanh Van Tu', 'Có ai đi săn Hôi Lang không?'],
      ['Bach Ha Quan', 'Mình đi, chờ ở cổng bắc nhé.'], ['', 'Dong Dao Phu đã vào đội.', true],
      ['Thanh Van Tu', 'Thỏ ở bãi cỏ đông nhiều lắm.'], ['Cu Ky Anh Anh', 'Ok, ra cổng liền.'],
      ['Bach Ha Quan', 'Nhớ mang đan hồi huyết.'], ['Thanh Van Tu', 'Xong việc ghé Thiết Ngưu rèn kiếm.'],
    ];
    for (const [from, text, sys] of lines) ui.chat({ from, text, sys: !!sys });
    return 1; })()`);
  await sleep(300);
}
