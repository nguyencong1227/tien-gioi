// Rớt mạng không được làm mất kiếp: người đang "hồn lìa xác" (chờ nối lại) bất tử (docs/THIET_KE_LUAN_HOI.md mục 4).
import { describe, expect, it } from "vitest";
import { hurtPlayer } from "./combat";
import { tickMonsters } from "./monsters";
import { tickWorld } from "./tick";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";

describe("hồn lìa xác (ghost) bất tử", () => {
  it("hurtPlayer bỏ qua người đang chờ nối lại; người thường vẫn bị đánh và chết như cũ", () => {
    const { w } = makeWorld();
    const { p } = addPlayer(w, "a");
    const { m } = addMonster(w, "mang", p.x + 20, p.y);
    const mon = [...w.mctrl.values()][0];
    const killer = { kind: m.kind } as typeof m;
    w.ghosts.add("a");
    const hp = p.hp;
    for (let i = 0; i < 20; i++) hurtPlayer(w, "a", p, 1e9, killer);
    expect(p.hp).toBe(hp);
    expect(p.dead).toBe(false);
    expect(mon.def.id).toBe("mang");
    // đối chứng: hết chờ (nối lại) thì lại bị đánh
    w.ghosts.delete("a");
    hurtPlayer(w, "a", p, 1e9, killer);
    expect(p.dead).toBe(true);
  });

  it("quái đang nhắm người rớt mạng không đánh nữa và bỏ mục tiêu; không nhắm lại trong lúc chờ", () => {
    const { w } = makeWorld();
    const { p } = addPlayer(w, "a");
    const { mc } = addMonster(w, "ho", p.x + 30, p.y);
    mc.target = "a";
    w.ghosts.add("a");
    const hp = p.hp;
    for (let i = 0; i < 200; i++) tickMonsters(w, 0.05);
    expect(mc.target).toBeNull();
    expect(p.hp).toBe(hp);
    expect(p.dead).toBe(false);
  });

  it("nối lại xong thì quái nhắm và đánh bình thường (cờ được gỡ)", () => {
    const { w } = makeWorld();
    const { p } = addPlayer(w, "a");
    const { mc } = addMonster(w, "ho", p.x + 150, p.y);
    w.ghosts.add("a");
    for (let i = 0; i < 10; i++) tickMonsters(w, 0.05);
    expect(mc.target).toBeNull();
    w.ghosts.delete("a");
    tickMonsters(w, 0.05);
    expect(mc.target).toBe("a");
  });

  it("người đứng cạnh người rớt mạng vẫn bị quái đánh (chỉ ghost được miễn)", () => {
    const { w } = makeWorld();
    const a = addPlayer(w, "a");
    const b = addPlayer(w, "b");
    b.p.x = a.p.x + 40;
    const { mc } = addMonster(w, "ho", a.p.x + 150, a.p.y);
    w.ghosts.add("a");
    tickMonsters(w, 0.05);
    expect(mc.target).toBe("b");
  });

  it("ghost đứng yên: không hồi phục khí huyết / linh lực, không tu vi đả tọa", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    p.hp = 10;
    p.mp = 5;
    p.meditating = true;
    const exp = p.exp;
    c.inputs.push({ seq: 1, dx: 1, dy: 0 });
    const x = p.x;
    w.ghosts.add("a");
    for (let i = 0; i < 100; i++) tickWorld(w, 50);
    expect([p.hp, p.mp, p.exp, p.x]).toEqual([10, 5, exp, x]);
    // đối chứng: nối lại thì hồi phục bình thường
    w.ghosts.delete("a");
    for (let i = 0; i < 100; i++) tickWorld(w, 50);
    expect(p.hp).toBeGreaterThan(10);
  });

  it("ghost đã chết trước khi rớt mạng vẫn hồi sinh đúng hạn (không kẹt ở trạng thái chết)", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    p.dead = true;
    c.deadAt = w.now - 1e6;
    w.ghosts.add("a");
    tickWorld(w, 50);
    expect(p.dead).toBe(false);
  });
});
