import { describe, expect, it } from "vitest";
import { TITLES } from "@tien-gioi/shared";
import { channelTag, chatSpeaker, chatTitleText } from "./chat-view";

describe("channelTag", () => {
  it("đội, tông môn, chat chung (và kênh lạ) có nhãn đúng", () => {
    expect(channelTag("party")).toBe("[Đội] ");
    expect(channelTag("sect")).toBe("[Tông môn] ");
    expect(channelTag(undefined)).toBe("");
    expect(channelTag("constructor" as never)).toBe("");
  });
});

describe("chatTitleText: danh hiệu chỉ hiện khi cờ bật và id có thật", () => {
  it("cờ tắt thì KHÔNG hiện gì dù tin có titleId (M9 chưa phát hành)", () => {
    for (const t of TITLES) expect(chatTitleText(t.id, false)).toBe("");
  });
  it("cờ bật: mọi danh hiệu thật hiện chữ trong «», không lộ id", () => {
    for (const t of TITLES) {
      const s = chatTitleText(t.id, true);
      expect(s).toBe(`«${t.text}»`);
      expect(s).not.toContain(t.id.length >= 3 ? t.id : "\u0000");
    }
    expect(chatTitleText("lh2", true)).toBe("«Tái Sinh»");
  });
  it("id lạ / sai kiểu / độc: không hiện gì và không lộ id ra màn hình", () => {
    for (const v of ["zzz", "", "constructor", "__proto__", "toString", 5, null, undefined, {}, []])
      expect(chatTitleText(v, true), String(v)).toBe("");
    expect(chatTitleText("id_moi_cua_may_chu", true)).not.toContain("id_moi");
  });
});

describe("chatSpeaker: ba mảnh của nhãn", () => {
  it("tin cũ (không titleId) y hệt trước đây: không danh hiệu, tên kèm dấu hai chấm", () => {
    expect(chatSpeaker({ from: "Vân Hạc" }, true)).toEqual({
      tag: "",
      title: "",
      name: "Vân Hạc: ",
    });
    expect(chatSpeaker({ from: "Vân Hạc", channel: "party" }, true)).toEqual({
      tag: "[Đội] ",
      title: "",
      name: "Vân Hạc: ",
    });
  });
  it("có danh hiệu và cờ bật: kênh + danh hiệu + tên, cho cả ba kênh", () => {
    expect(chatSpeaker({ from: "A", titleId: "lh2" }, true)).toEqual({
      tag: "",
      title: "«Tái Sinh»",
      name: "A: ",
    });
    expect(chatSpeaker({ from: "A", channel: "sect", titleId: "tr1" }, true)).toEqual({
      tag: "[Tông môn] ",
      title: "«Thợ Săn Trùm»",
      name: "A: ",
    });
    expect(chatSpeaker({ from: "A", channel: "party", titleId: "pk10" }, true).title).toBe(
      "«Đấu Sĩ»",
    );
  });
  it("cờ tắt: tin có titleId vẫn hiện như tin cũ", () => {
    expect(chatSpeaker({ from: "A", channel: "party", titleId: "lh2" }, false)).toEqual({
      tag: "[Đội] ",
      title: "",
      name: "A: ",
    });
  });
});
