// Bộ đếm thành tựu của kiếp (M3 bước 2): thời gian chơi thật, quái và trùm đã hạ.
import { describe, expect, it } from "vitest";
import { killMonster, hitMonster } from "./combat";
import { tickWorld } from "./tick";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";

describe("thời gian chơi (playMs)", () => {
  it("cộng mỗi tick cho người đang chơi; người chết và hồn lìa xác không được cộng", () => {
    const { w } = makeWorld();
    const a = addPlayer(w, "a");
    const dead = addPlayer(w, "dead");
    const ghost = addPlayer(w, "ghost");
    dead.p.dead = true;
    dead.c.deadAt = w.now + 1e9; // chưa hồi sinh
    w.ghosts.add("ghost");
    for (let i = 0; i < 40; i++) tickWorld(w, 50);
    expect(a.c.life.playMs).toBe(2000);
    expect(dead.c.life.playMs).toBe(0);
    expect(ghost.c.life.playMs).toBe(0);
    w.ghosts.delete("ghost");
    tickWorld(w, 50);
    expect(ghost.c.life.playMs).toBe(50);
  });
});

describe("quái và trùm đã hạ (kills, bossKills)", () => {
  it("mọi người góp sát thương được tính một con; trùm tính thêm bossKills; người ngoài cuộc không được tính", () => {
    const { w } = makeWorld();
    const a = addPlayer(w, "a");
    const b = addPlayer(w, "b");
    const out = addPlayer(w, "out");
    const { id, mc } = addMonster(w, "lang", a.p.x + 20, a.p.y);
    mc.damageBy.set("a", 50);
    mc.damageBy.set("b", 30);
    killMonster(w, id, mc);
    expect([a.c.life.kills, b.c.life.kills, out.c.life.kills]).toEqual([1, 1, 0]);
    expect([a.c.life.bossKills, b.c.life.bossKills]).toEqual([0, 0]);
    const boss = addMonster(w, "mang", a.p.x + 20, a.p.y);
    boss.mc.damageBy.set("a", 4000);
    killMonster(w, boss.id, boss.mc);
    expect([a.c.life.kills, a.c.life.bossKills]).toEqual([2, 1]);
    expect([b.c.life.kills, b.c.life.bossKills]).toEqual([1, 0]);
  });

  it("hạ quái bằng đòn đánh thật (hitMonster) cũng được đếm đúng một lần", () => {
    const { w } = makeWorld();
    const a = addPlayer(w, "a", 1, 5);
    const { id, m } = addMonster(w, "tho", a.p.x + 10, a.p.y);
    m.hp = 1;
    hitMonster(w, id, m, "a", a.p, 1);
    expect(w.state.monsters.has(id)).toBe(false);
    expect(a.c.life.kills).toBe(1);
  });
});
