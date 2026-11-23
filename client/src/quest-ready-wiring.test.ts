// Canh MÃ NGUỒN cho ba chỗ NỐI của mục 66 (nhiệm vụ xong "không thấy thưởng"): phần logic thuần đã có test ở `quest-log.test.ts` / `npc-marker.test.ts`; test này giữ để
// ai sửa `ui.ts` / `WorldScene.ts` / `map-render.ts` sau này không vô tình gỡ dây (không có trình duyệt ở CI; ảnh chụp thật nằm ở docs/screenshots).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const ui = read("./ui.ts");
const scene = read("./scenes/WorldScene.ts");
const mapRender = read("./map-render.ts");

/** Thân của một phương thức / hàm trong `src` bắt đầu ở `head` (tới dòng đóng đầu tiên cùng mức thụt). */
function bodyOf(src: string, head: string): string {
  const start = src.indexOf(head);
  expect(start, `không thấy ${head}`).toBeGreaterThan(0);
  const indent = /^\s*/.exec(src.slice(src.lastIndexOf("\n", start) + 1))![0];
  const end = src.indexOf(`\n${indent}}`, start);
  return src.slice(start, end);
}

describe("báo MỘT lần khi nhiệm vụ vừa đủ: dây nối ở ui.ts", () => {
  it("cả tin túi lẫn tin sổ nhiệm vụ đều báo cho người theo dõi rồi kiểm tra", () => {
    const inv = bodyOf(ui, "onInv(m: InvMsg) {");
    expect(inv).toContain("questReadyWatcher.noteInv()");
    expect(inv).toContain("notifyQuestsReady()");
    const quests = bodyOf(ui, "onQuests(m: QuestsMsg) {");
    expect(quests).toContain("questReadyWatcher.noteQuests()");
    expect(quests).toContain("notifyQuestsReady()");
  });

  it("dòng báo đi qua showToastLine (KHÔNG qua ui.toast: toast của máy chủ mở khoá nút đang chờ kho / Nội vụ / đầu thai)", () => {
    const body = bodyOf(ui, "function notifyQuestsReady() {");
    expect(body).toContain("showToastLine(");
    expect(body).not.toContain("ui.toast(");
    expect(body).toContain("questReadyToast(");
  });
});

describe("xem trước thưởng: dây nối ở hộp thoại NPC", () => {
  it("renderDialogOptions vẽ dòng xem trước dưới lựa chọn nhận / trả (dialogRewardOf)", () => {
    const body = bodyOf(ui, "function renderDialogOptions() {");
    expect(body).toContain("dialogRewardOf(opt.action)");
    expect(body).toContain("dlg-opt-reward");
    // dòng xem trước KHÔNG là nút: phím 1-9 chọn theo `button.dlg-opt-btn`
    expect(ui).toContain('querySelectorAll<HTMLButtonElement>("button.dlg-opt-btn")');
  });
});

describe("dấu '?' vàng: dây nối ở thế giới và bản đồ", () => {
  it("WorldScene.syncNpcs lấy kiểu từ npc-marker.ts, không còn màu xanh lá cũ", () => {
    const body = bodyOf(scene, "private syncNpcs() {");
    expect(body).toContain("npcMarkerStyle(marker)");
    expect(body).not.toMatch(/6ad06a/i);
  });

  it("map-render.ts: nhãn bản đồ lớn và vòng quanh NPC '?' lấy màu từ npc-marker.ts, không còn xanh lá cũ", () => {
    expect(mapRender).toContain("npcMarkerStyle(");
    expect(mapRender).not.toMatch(/9ae59a/i);
    // vòng vàng vẽ cả ở bản đồ NHỎ (không nằm trong nhánh `big`)
    const ring = mapRender.indexOf("npcR * 1.9");
    expect(ring).toBeGreaterThan(0);
    const before = mapRender.slice(mapRender.lastIndexOf("for (const n of ov.npcs)", ring), ring);
    expect(before).not.toMatch(/if \(big\b/);
  });
});
