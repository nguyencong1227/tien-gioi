// Giữ bất biến "mỗi nhiệm vụ chỉ nằm MỘT lần trong danh sách done" khi trả lại (đã xong). Liên quan đột biến M3 (lượt 71,
// Dev A yêu cầu chạy lại M1/M2/M3 trên e2e-tra-nhiem-vu.ts): M3 bỏ guard `!c.quests.done.includes(def.id)` — ban đầu đoán là
// lỗ hổng "done trùng", nhưng ĐÃ TÁI HIỆN (debug + unit test): sau lần trả, `active` rỗng nên `idx<0`, `turnInQuest` trả về
// sớm TRƯỚC khi tới guard → guard KHÔNG bao giờ chạy → `done` KHÔNG thể trùng → M3 KHÔNG PHẢI lỗi game (guard thừa, phòng thủ).
// Test này là chỗ dựa cho bất biến: nếu sau này ai cho `questReady` trả true với nhiệm vụ đã xong (idx>=0) mà bỏ guard, nó sẽ đỏ.
import { describe, expect, it } from "vitest";
import { NPC_BY_ID } from "@tien-gioi/shared";
import { makeWorld, addPlayer } from "./test-helpers";
import { acceptQuest, talk, turnInQuest } from "./npc";
import type { Player } from "../schema";

/** Đặt người chơi đứng ngay cạnh NPC (trong tầm nói chuyện). */
function standAt(p: Player, npcId: string) {
  p.x = NPC_BY_ID[npcId].x + 10;
  p.y = NPC_BY_ID[npcId].y;
}

/** Nhận + làm đủ + trả "Nhập thế" một lần (theo pattern finishFirst trong quests.test.ts). */
function completeFirstTime(w: ReturnType<typeof makeWorld>["w"], sid: string, p: Player) {
  standAt(p, "truong_tran");
  acceptQuest(w, sid, "nhap_the");
  standAt(p, "duoc_su");
  talk(w, sid, "duoc_su");
  standAt(p, "truong_tran");
  turnInQuest(w, sid, "nhap_the");
}

describe("trả nhiệm vụ đã xong (lần hai)", () => {
  it("KHÔNG thêm nhiệm vụ TRÙNG vào danh sách done (guard !done.includes)", () => {
    const { w } = makeWorld();
    const sid = "a";
    const { p, c } = addPlayer(w, sid);
    completeFirstTime(w, sid, p);
    expect(c.quests.done.filter((id) => id === "nhap_the")).toHaveLength(1);
    // Gửi LẠI questTurnIn khi nhiệm vụ KHÔNG còn ở active: phải KHÔNG làm gì (idx<0 trả về sớm),
    // và đặc biệt KHÔNG đẩy "nhap_the" vào done thêm lần nữa.
    turnInQuest(w, sid, "nhap_the");
    turnInQuest(w, sid, "nhap_the");
    // Bất biến: mỗi nhiệm vụ chỉ nằm MỘT lần trong danh sách đã xong.
    expect(c.quests.done.filter((id) => id === "nhap_the")).toHaveLength(1);
  });
});
