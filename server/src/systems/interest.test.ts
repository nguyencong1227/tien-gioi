// Vùng nhìn (#62): ai nhận state của thực thể nào. Dùng StateView thật, không cần server Colyseus.
import { describe, expect, it } from "vitest";
import { StateView } from "@colyseus/schema";
import { Loot } from "../schema";
import type { World } from "../world";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";
import { VIEW_ENTER, VIEW_EVERY_TICKS, VIEW_EXIT } from "./interest";

/** Một người chơi "a" ở (1000, 1000), đã đăng ký vùng nhìn như WorldRoom.onJoin */
function setup() {
  const { w } = makeWorld();
  const a = addPlayer(w, "a");
  a.p.x = 1000;
  a.p.y = 1000;
  const view = new StateView();
  w.interest.join(w, "a", view);
  return { w, a, view };
}

/** Chạy n tick (chỉ phần làm mới vùng nhìn) */
function ticks(w: World, n: number) {
  for (let i = 0; i < n; i++) w.interest.update(w);
}

describe("vùng nhìn", () => {
  it("lúc vào: thấy mình, thấy quái trong VIEW_ENTER, không thấy quái ngoài", () => {
    const { w, a, view } = setup();
    const near = addMonster(w, "lang", 1000 + VIEW_ENTER - 50, 1000);
    const far = addMonster(w, "lang", 1000 + VIEW_ENTER + 50, 1000);
    // addMonster chạy sau join, nên chờ lần làm mới đầu tiên
    expect(view.has(a.p)).toBe(true);
    ticks(w, VIEW_EVERY_TICKS);
    expect(view.has(near.m)).toBe(true);
    expect(view.has(far.m)).toBe(false);
  });

  it("chỉ làm mới mỗi VIEW_EVERY_TICKS tick", () => {
    const { w, view } = setup();
    const m = addMonster(w, "lang", 1000 + VIEW_ENTER - 50, 1000);
    ticks(w, VIEW_EVERY_TICKS - 1);
    expect(view.has(m.m)).toBe(false);
    ticks(w, 1);
    expect(view.has(m.m)).toBe(true);
  });

  it("có độ trễ ở mép: đã thấy thì giữ tới VIEW_EXIT, chưa thấy thì chưa thêm", () => {
    const { w, a, view } = setup();
    const m = addMonster(w, "lang", 1000 + VIEW_ENTER - 50, 1000);
    ticks(w, VIEW_EVERY_TICKS);
    expect(view.has(m.m)).toBe(true);
    // Lùi ra giữa VIEW_ENTER và VIEW_EXIT: vẫn thấy (không nhấp nháy)
    m.m.x = 1000 + (VIEW_ENTER + VIEW_EXIT) / 2;
    ticks(w, VIEW_EVERY_TICKS);
    expect(view.has(m.m)).toBe(true);
    // Ra ngoài VIEW_EXIT: bỏ khỏi view
    m.m.x = 1000 + VIEW_EXIT + 10;
    ticks(w, VIEW_EVERY_TICKS);
    expect(view.has(m.m)).toBe(false);
    // Quay lại giữa hai mức: chưa thấy thì chưa thêm (phải vào hẳn VIEW_ENTER)
    m.m.x = 1000 + (VIEW_ENTER + VIEW_EXIT) / 2;
    ticks(w, VIEW_EVERY_TICKS);
    expect(view.has(m.m)).toBe(false);
    m.m.x = 1000 + VIEW_ENTER - 10;
    ticks(w, VIEW_EVERY_TICKS);
    expect(view.has(m.m)).toBe(true);
    expect(view.has(a.p)).toBe(true);
  });

  it("người chơi tự thấy mình dù ở đâu; thấy người khác khi lại gần, mất khi đi xa", () => {
    const { w, a, view } = setup();
    const b = addPlayer(w, "b");
    b.p.x = 1000 + 3 * VIEW_EXIT;
    b.p.y = 1000;
    const viewB = new StateView();
    w.interest.join(w, "b", viewB);
    ticks(w, VIEW_EVERY_TICKS);
    expect(view.has(a.p)).toBe(true);
    expect(view.has(b.p)).toBe(false);
    expect(viewB.has(b.p)).toBe(true);
    expect(viewB.has(a.p)).toBe(false);
    b.p.x = 1000 + 300;
    ticks(w, VIEW_EVERY_TICKS);
    expect(view.has(b.p)).toBe(true);
    expect(viewB.has(a.p)).toBe(true);
  });

  it("đồ rơi cũng theo vùng nhìn", () => {
    const { w, view } = setup();
    const near = new Loot();
    near.itemId = "hoi_huyet_dan";
    near.qty = 1;
    near.x = 1100;
    near.y = 1000;
    const far = new Loot();
    far.itemId = "hoi_huyet_dan";
    far.qty = 1;
    far.x = 1000 + VIEW_EXIT + 200;
    far.y = 1000;
    w.state.loot.set("l1", near);
    w.state.loot.set("l2", far);
    ticks(w, VIEW_EVERY_TICKS);
    expect(view.has(near)).toBe(true);
    expect(view.has(far)).toBe(false);
  });

  it("thực thể bị xoá khỏi state: không lỗi, id không bị giữ lại; id mới thấy bình thường", () => {
    const { w, view } = setup();
    const m = addMonster(w, "lang", 1100, 1000);
    ticks(w, VIEW_EVERY_TICKS);
    expect(view.has(m.m)).toBe(true);
    w.state.monsters.delete("m1");
    expect(() => ticks(w, VIEW_EVERY_TICKS * 2)).not.toThrow();
    const m2 = addMonster(w, "lang", 1100, 1000);
    ticks(w, VIEW_EVERY_TICKS);
    expect(view.has(m2.m)).toBe(true);
  });

  it("rời phòng rồi thì không cập nhật nữa; không có ai thì update không làm gì", () => {
    const { w, view } = setup();
    w.interest.leave("a");
    const m = addMonster(w, "lang", 1100, 1000);
    expect(() => ticks(w, VIEW_EVERY_TICKS * 3)).not.toThrow();
    expect(view.has(m.m)).toBe(false);
    expect(w.interest.viewOf("a")).toBeUndefined();
  });
});
