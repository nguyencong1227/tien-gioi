// Danh hiệu của người nói trong chat (M9, `ChatOut.titleId`): MÁY CHỦ điền từ `Player.title` lúc gửi (chat chung, đội); không đeo / id hỏng thì tin giống HỆT tin cũ (không có trường).
import { describe, expect, it } from "vitest";
import { TITLES } from "@tien-gioi/shared";
import { Player } from "../schema";
import { chat } from "./chat";
import { titleField, titleOf } from "./chat-title";
import { addPlayer, makeWorld } from "./test-helpers";

const T = TITLES[0]!.id;

function setup() {
  const h = makeWorld();
  const a = addPlayer(h.w, "An");
  const b = addPlayer(h.w, "Binh");
  return { ...h, a, b };
}

describe("titleOf / titleField", () => {
  it("chỉ trả id đúng dạng; rỗng, sai dạng, không có người thì undefined / {}", () => {
    const p = new Player();
    expect(titleOf(p)).toBeUndefined();
    p.title = T;
    expect(titleOf(p)).toBe(T);
    expect(titleField(p)).toEqual({ titleId: T });
    for (const bad of ["x".repeat(40), "<b>", "a b", "\u0000"]) {
      p.title = bad;
      expect(titleOf(p), JSON.stringify(bad)).toBeUndefined();
      expect(titleField(p)).toEqual({});
    }
    expect(titleOf(undefined)).toBeUndefined();
    expect(titleField(undefined)).toEqual({});
  });
});

describe("chat chung mang danh hiệu của người nói", () => {
  it("đang đeo: tin có titleId đúng danh hiệu; không đeo: tin y hệt cũ (không có trường titleId)", () => {
    const s = setup();
    s.a.p.title = T;
    chat(s.w, "An", "chào cả nhà");
    expect(s.chats.at(-1)).toEqual({ from: "An", text: "chào cả nhà", titleId: T });
    chat(s.w, "Binh", "chào An");
    expect(s.chats.at(-1)).toEqual({ from: "Binh", text: "chào An" });
    expect(s.chats.at(-1)).not.toHaveProperty("titleId");
  });

  it("danh hiệu lấy LÚC GỬI: đổi / gỡ giữa hai câu thì câu sau đổi theo", () => {
    const s = setup();
    s.a.p.title = T;
    chat(s.w, "An", "một");
    s.a.p.title = "";
    s.w.now += 1000;
    chat(s.w, "An", "hai");
    expect(s.chats.at(-2)).toHaveProperty("titleId", T);
    expect(s.chats.at(-1)).not.toHaveProperty("titleId");
  });

  it("id hỏng trong Player.title KHÔNG lọt ra tin chat", () => {
    const s = setup();
    s.a.p.title = "<script>alert(1)</script>";
    chat(s.w, "An", "xin chào");
    expect(s.chats.at(-1)).toEqual({ from: "An", text: "xin chào" });
  });
});

describe("chat đội /p mang danh hiệu", () => {
  it("tin đội tới thành viên có titleId của người nói; người không đeo thì không có", () => {
    const s = setup();
    s.w.parties._create("an", "binh");
    s.a.p.title = T;
    chat(s.w, "An", "/p tập hợp");
    expect(s.chatsTo.map((x) => x.msg)).toEqual([
      { from: "An", text: "tập hợp", channel: "party", titleId: T },
      { from: "An", text: "tập hợp", channel: "party", titleId: T },
    ]);
    s.w.now += 1000;
    s.chatsTo.length = 0;
    chat(s.w, "Binh", "/p ok");
    expect(s.chatsTo.every((x) => !("titleId" in x.msg))).toBe(true);
    expect(s.chatsTo).toHaveLength(2);
  });
});
