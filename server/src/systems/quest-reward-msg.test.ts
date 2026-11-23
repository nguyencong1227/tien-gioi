// Tin `questReward` (QUYET_DINH_M3 mục 66, issue #1327): trả nhiệm vụ thành công thì server gửi ĐÚNG MỘT tin liệt kê thưởng THẬT đã trao
// (tu vi sau hệ số tông môn / thử nghiệm, vật phẩm vừa vào túi); túi đầy / chưa đủ điều kiện / trả lần hai thì KHÔNG có tin.
// `gainExp` trả về số tu vi thật đã cộng: nguồn duy nhất của con số này, không nhân lại hệ số ở chỗ khác.
import { describe, expect, it } from "vitest";
import {
  NPC_BY_ID,
  QUEST_BY_ID,
  REALMS,
  countItem,
  sectBuffOf,
  questRewardMsg,
} from "@tien-gioi/shared";
import { gainExp } from "./progression";
import { giveItem } from "./inventory";
import { acceptQuest, talk, turnInQuest } from "./npc";
import { addPlayer, makeWorld } from "./test-helpers";
import type { World } from "../world";
import type { Player } from "../schema";

const DEF = QUEST_BY_ID.nhap_the; // 15 tu vi + 3 Hồi Huyết Đan, bước "nói chuyện với Hà lão"

function standAt(p: Player, npcId: string) {
  p.x = NPC_BY_ID[npcId].x + 10;
  p.y = NPC_BY_ID[npcId].y;
}

/** Nhận "Nhập thế" rồi làm xong mọi bước, đứng sẵn cạnh Trưởng trấn, CHƯA trả. */
function readyToTurnIn(w: World, sid: string, p: Player) {
  standAt(p, "truong_tran");
  acceptQuest(w, sid, "nhap_the");
  standAt(p, "duoc_su");
  talk(w, sid, "duoc_su");
  standAt(p, "truong_tran");
}

describe("tin questReward khi trả nhiệm vụ", () => {
  it("trả thành công: đúng MỘT tin cho đúng chủ, tu vi + vật phẩm khớp thưởng và khớp p.exp / túi", () => {
    const { w, questRewards } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    readyToTurnIn(w, "a", p);
    expect(questRewards).toHaveLength(0); // chưa trả thì chưa có
    turnInQuest(w, "a", "nhap_the");
    expect(questRewards).toHaveLength(1);
    const { sid, msg } = questRewards[0];
    expect(sid).toBe("a");
    expect(msg).toEqual(questRewardMsg(DEF, DEF.rewards.exp ?? 0)); // đúng hợp đồng của shared
    expect(msg).toEqual({
      questId: "nhap_the",
      exp: 15,
      coin: 0,
      items: [{ itemId: "hoi_huyet_dan", qty: 3 }],
    });
    expect(p.exp).toBe(msg.exp); // số báo = số đã cộng
    expect(countItem(c.inv, "hoi_huyet_dan")).toBe(msg.items[0].qty);
  });

  it("tin SAO CHÉP vật phẩm: sửa tin không làm đổi bảng dữ liệu nhiệm vụ", () => {
    const { w, questRewards } = makeWorld();
    const { p } = addPlayer(w, "a");
    readyToTurnIn(w, "a", p);
    turnInQuest(w, "a", "nhap_the");
    questRewards[0].msg.items[0].qty = 999;
    expect(DEF.rewards.items![0].qty).toBe(3);
  });

  it("hệ số tông môn x hệ số thử nghiệm: tin báo số THẬT (sau nhân), khớp phần p.exp tăng", () => {
    const { w, questRewards } = makeWorld();
    const { p, c } = addPlayer(w, "a", 1, 0); // Luyện Khí tầng 1: còn xa đầy thanh
    readyToTurnIn(w, "a", p);
    c.sectBuff = sectBuffOf(5); // exp 1,05
    c.testExpMult = 3;
    const before = p.exp;
    turnInQuest(w, "a", "nhap_the");
    const gained = p.exp - before;
    expect(gained).toBeCloseTo(15 * 1.05 * 3, 6); // 47,25
    expect(questRewards).toHaveLength(1);
    expect(questRewards[0].msg.exp).toBe(Math.floor(gained)); // 47: số nguyên, đúng phần đã cộng, KHÔNG phải 15 gốc
    expect(questRewards[0].msg.exp).not.toBe(DEF.rewards.exp);
  });

  it("thưởng làm lên bậc nhỏ giữa chừng: tin vẫn báo đủ số đã cộng (không bị p.exp quay về đầu bậc làm lệch)", () => {
    const { w, questRewards } = makeWorld();
    const { p } = addPlayer(w, "a", 1, 0);
    readyToTurnIn(w, "a", p);
    p.exp = p.expMax - 5; // +15 sẽ vượt đầy -> lên tầng 2
    turnInQuest(w, "a", "nhap_the");
    expect(p.tier).toBe(1);
    expect(questRewards[0].msg.exp).toBe(15);
  });

  it("chạm đầy ở bậc cuối chờ Đột phá: tin chỉ báo phần THẬT SỰ cộng được (phần dư bị cắt)", () => {
    const { w, questRewards } = makeWorld();
    const { p } = addPlayer(w, "a", 0, 0); // Phàm Nhân chỉ có 1 bậc: bậc cuối, cần Đột phá
    expect(REALMS[0].tiers).toHaveLength(1);
    readyToTurnIn(w, "a", p);
    p.exp = p.expMax - 3; // còn chỗ cho 3 trong 15
    turnInQuest(w, "a", "nhap_the");
    expect(p.exp).toBe(p.expMax);
    expect(questRewards[0].msg.exp).toBe(3);
  });

  it("đã đầy sẵn ở bậc cuối: tin báo 0 tu vi (vẫn có vật phẩm), không nói dối là đã nhận 15", () => {
    const { w, questRewards } = makeWorld();
    const { p, c } = addPlayer(w, "a", 0, 0);
    readyToTurnIn(w, "a", p);
    p.exp = p.expMax;
    turnInQuest(w, "a", "nhap_the");
    expect(p.exp).toBe(p.expMax);
    expect(questRewards).toHaveLength(1);
    expect(questRewards[0].msg.exp).toBe(0);
    expect(questRewards[0].msg.items).toEqual([{ itemId: "hoi_huyet_dan", qty: 3 }]);
    expect(countItem(c.inv, "hoi_huyet_dan")).toBe(3);
  });

  it("túi không đủ chỗ: từ chối, KHÔNG có tin thưởng (không trao thì không báo đã nhận)", () => {
    const { w, questRewards } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    readyToTurnIn(w, "a", p);
    for (let i = 0; i < c.inv.length; i++) c.inv[i] = { itemId: "da_ho", qty: 99 };
    turnInQuest(w, "a", "nhap_the");
    expect(c.quests.active).toHaveLength(1);
    expect(p.exp).toBe(0);
    expect(questRewards).toHaveLength(0);
  });

  it("chưa đủ điều kiện, đứng xa, người đã gục: không tin", () => {
    const { w, questRewards } = makeWorld();
    const { p } = addPlayer(w, "a");
    standAt(p, "truong_tran");
    acceptQuest(w, "a", "nhap_the");
    turnInQuest(w, "a", "nhap_the"); // chưa gặp Hà lão
    standAt(p, "duoc_su");
    talk(w, "a", "duoc_su");
    turnInQuest(w, "a", "nhap_the"); // đứng xa Trưởng trấn
    standAt(p, "truong_tran");
    p.dead = true;
    turnInQuest(w, "a", "nhap_the");
    expect(questRewards).toHaveLength(0);
  });

  it("trả hai lần liên tiếp: chỉ MỘT tin (lần hai bị từ chối, không báo thưởng lần nữa)", () => {
    const { w, questRewards } = makeWorld();
    const { p } = addPlayer(w, "a");
    readyToTurnIn(w, "a", p);
    turnInQuest(w, "a", "nhap_the");
    turnInQuest(w, "a", "nhap_the");
    expect(questRewards).toHaveLength(1);
  });

  it("tin chỉ gửi cho chủ nhiệm vụ, không cho người chơi khác trong phòng", () => {
    const { w, questRewards } = makeWorld();
    const a = addPlayer(w, "a");
    addPlayer(w, "b");
    readyToTurnIn(w, "a", a.p);
    turnInQuest(w, "a", "nhap_the");
    expect(questRewards.map((x) => x.sid)).toEqual(["a"]);
  });

  it("nhiệm vụ nộp đồ chỉ có tu vi: tin báo 50 tu vi, không có vật phẩm; nanh nộp đã trừ khỏi túi", () => {
    const { w, questRewards } = makeWorld();
    const { p, c } = addPlayer(w, "a", 1, 0);
    standAt(p, "cao_thi");
    acceptQuest(w, "a", "nop_nanh");
    giveItem(w, "a", "nanh_soi", 5);
    turnInQuest(w, "a", "nop_nanh");
    expect(c.quests.daily.nop_nanh).toBeTruthy(); // đã trả thật
    expect(countItem(c.inv, "nanh_soi")).toBe(0);
    expect(questRewards).toHaveLength(1);
    expect(questRewards[0].msg).toEqual({ questId: "nop_nanh", exp: 50, coin: 0, items: [] });
    expect(p.exp).toBe(50);
  });
});

describe("gainExp trả số tu vi thật đã cộng", () => {
  it("không hệ số: đúng số truyền vào; hệ số nhân chồng đúng; không đổi hành vi cộng", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a", 1, 0);
    expect(gainExp(w, "a", p, 10)).toBe(10);
    expect(p.exp).toBe(10);
    expect(gainExp(w, "a", p, 10, 2)).toBe(20);
    c.testExpMult = 5;
    expect(gainExp(w, "a", p, 2)).toBe(10);
    expect(p.exp).toBe(40);
  });

  it("lên nhiều bậc một lần: vẫn trả đủ số truyền vào", () => {
    const { w } = makeWorld();
    const { p } = addPlayer(w, "a", 1, 0);
    const big = p.expMax * 2.5;
    expect(gainExp(w, "a", p, big)).toBeCloseTo(big, 6);
    expect(p.tier).toBeGreaterThanOrEqual(2);
  });

  it("đỉnh tiên đồ (cảnh giới cuối, bậc cuối): trả phần thật sự cộng, đầy rồi thì 0", () => {
    const { w } = makeWorld();
    const last = REALMS.length - 1;
    const { p } = addPlayer(w, "a", last, REALMS[last].tiers.length - 1);
    p.exp = p.expMax - 4;
    expect(gainExp(w, "a", p, 100)).toBeCloseTo(4, 6);
    expect(p.exp).toBe(p.expMax);
    expect(gainExp(w, "a", p, 100)).toBe(0);
  });

  it("bậc cuối chờ Đột phá: trả phần thật sự cộng, phần dư cắt đi không tính", () => {
    const { w } = makeWorld();
    const { p } = addPlayer(w, "a", 0, 0);
    p.exp = p.expMax - 4;
    expect(gainExp(w, "a", p, 100)).toBeCloseTo(4, 6);
    expect(p.exp).toBe(p.expMax);
    expect(gainExp(w, "a", p, 100)).toBe(0); // đã đầy: không cộng thêm
  });
});
