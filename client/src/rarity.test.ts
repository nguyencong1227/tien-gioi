import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ITEMS, RARITY_COLORS, RARITY_NAMES } from "@tien-gioi/shared";
import { contrast, parseHex } from "./contrast";
import {
  RARITY_MARKS,
  applyRarityBadge,
  applyRarityText,
  clearRarityBadge,
  clearRarityText,
  rarityStyle,
  rarityTier,
  type RarityCard,
  type RarityEl,
} from "./rarity";

const ROOT = path.resolve(__dirname, "../..");
const fakeEl = (title = ""): RarityEl => ({ style: { color: "" }, dataset: {}, title });

describe("rarity: rarityStyle (màu + tên + dấu phụ của năm bậc)", () => {
  it("năm bậc có màu, tên và dấu phụ KHÁC NHAU; màu và tên lấy từ shared", () => {
    const all = [0, 1, 2, 3, 4].map((r) => rarityStyle(r));
    expect(new Set(all.map((s) => s.color)).size).toBe(5);
    expect(new Set(all.map((s) => s.name)).size).toBe(5);
    expect(new Set(all.map((s) => s.mark)).size).toBe(5);
    all.forEach((s, i) => {
      expect(s.name).toBe(RARITY_NAMES[i]);
      expect(parseHex(s.color)).toEqual([
        (RARITY_COLORS[i] >> 16) & 255,
        (RARITY_COLORS[i] >> 8) & 255,
        RARITY_COLORS[i] & 255,
      ]);
      expect(s.mark).toBe(RARITY_MARKS[i]);
    });
  });

  it("bậc thường không dấu; dấu tăng dần theo bậc (số ◆ tăng, bậc cao nhất là ★)", () => {
    expect(RARITY_MARKS[0]).toBe("");
    expect(RARITY_MARKS[1]).toBe("◆");
    expect(RARITY_MARKS[2]).toBe("◆◆");
    expect(RARITY_MARKS[3]).toBe("◆◆◆");
    expect(RARITY_MARKS[4]).toBe("★");
  });

  it("chữ >= 4,5:1 trên nền bảng và nền ô túi (cả hai nền thật của CSS) ở mọi bậc", () => {
    for (const bg of [
      [27, 24, 20],
      [40, 34, 28],
    ] as const)
      for (let r = 0; r < 5; r++)
        expect(contrast(parseHex(rarityStyle(r).color), bg), `bậc ${r}`).toBeGreaterThanOrEqual(
          4.5,
        );
  });

  it("giá trị lạ / rác về bậc 0, không ném lỗi, không hiện 'undefined'", () => {
    for (const bad of [-1, 5, 9, 1.5, NaN, Infinity, "3", null, undefined, {}, [], true]) {
      const s = rarityStyle(bad);
      expect(s.tier, String(bad)).toBe(0);
      expect(s.name).toBe(RARITY_NAMES[0]);
      expect(s.mark).toBe("");
      expect(s.color).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(rarityTier(4)).toBe(4);
    expect(rarityTier(0)).toBe(0);
  });

  it("mọi vật phẩm của trò chơi có bậc hợp lệ (thêm bậc 5 mà quên dấu phụ thì đỏ)", () => {
    for (const it of ITEMS) expect(rarityTier(it.rarity), it.id).toBe(it.rarity);
    expect(RARITY_MARKS.length).toBe(RARITY_NAMES.length);
    expect(RARITY_COLORS.length).toBe(RARITY_NAMES.length);
  });
});

describe("rarity: applyRarityText / clearRarityText", () => {
  it("bậc có dấu: đặt màu, data-mark, data-rarity và title = tên bậc", () => {
    const el = fakeEl();
    applyRarityText(el, 3);
    expect(el.style.color).toBe(rarityStyle(3).color);
    expect(el.dataset.mark).toBe("◆◆◆");
    expect(el.dataset.rarity).toBe(RARITY_NAMES[3]);
    expect(el.title).toBe(RARITY_NAMES[3]);
  });

  it("bậc thường: màu mặc định của bậc, KHÔNG dấu, KHÔNG title", () => {
    const el = fakeEl();
    applyRarityText(el, 0);
    expect(el.dataset.mark).toBeUndefined();
    expect(el.title).toBe("");
    expect(el.dataset.rarity).toBe(RARITY_NAMES[0]);
  });

  it("không đè chú thích riêng đã có; tái dùng phần tử (bậc cao -> thường -> khác) gỡ sạch dấu và title do hàm đặt", () => {
    const own = fakeEl("Chú thích riêng");
    applyRarityText(own, 4);
    expect(own.title).toBe("Chú thích riêng");
    expect(own.dataset.mark).toBe("★");
    const el = fakeEl();
    applyRarityText(el, 2);
    expect(el.title).toBe(RARITY_NAMES[2]);
    applyRarityText(el, 4);
    expect(el.title).toBe(RARITY_NAMES[4]); // title do hàm đặt thì được đổi theo
    applyRarityText(el, 0);
    expect(el.dataset.mark).toBeUndefined();
    expect(el.title).toBe("");
    // sau khi gỡ, chú thích riêng đặt SAU đó được giữ
    el.title = "Nhãn khác";
    applyRarityText(el, 3);
    expect(el.title).toBe("Nhãn khác");
  });

  it("clearRarityText: về mặc định (ô trống), giữ chú thích riêng", () => {
    const el = fakeEl();
    applyRarityText(el, 4);
    clearRarityText(el);
    expect(el.style.color).toBe("");
    expect(el.dataset).toEqual({});
    expect(el.title).toBe("");
    const own = fakeEl("Riêng");
    applyRarityText(own, 4);
    clearRarityText(own);
    expect(own.title).toBe("Riêng");
    expect(own.dataset.mark).toBeUndefined();
  });
});

describe("rarity: huy hiệu góc cho ô nhỏ (applyRarityBadge / clearRarityBadge)", () => {
  const fakeCard = (): RarityCard & { vars: Record<string, string> } => {
    const vars: Record<string, string> = {};
    return {
      vars,
      dataset: {},
      style: {
        setProperty: (k: string, v: string) => void (vars[k] = v),
        removeProperty: (k: string) => delete vars[k],
      },
    };
  };

  it("bậc có dấu: đặt data-rbadge và biến --rar = màu bậc; bậc thường: không huy hiệu nhưng vẫn có màu", () => {
    const c = fakeCard();
    applyRarityBadge(c, 2);
    expect(c.dataset.rbadge).toBe("◆◆");
    expect(c.vars["--rar"]).toBe(rarityStyle(2).color);
    applyRarityBadge(c, 0);
    expect(c.dataset.rbadge).toBeUndefined();
    expect(c.vars["--rar"]).toBe(rarityStyle(0).color);
  });

  it("đổi đồ ghi đè; ô trống gỡ sạch (không dính huy hiệu cũ); giá trị rác về bậc thường", () => {
    const c = fakeCard();
    applyRarityBadge(c, 4);
    expect(c.dataset.rbadge).toBe("★");
    applyRarityBadge(c, 1);
    expect(c.dataset.rbadge).toBe("◆");
    clearRarityBadge(c);
    expect(c.dataset).toEqual({});
    expect(c.vars).toEqual({});
    applyRarityBadge(c, NaN);
    expect(c.dataset.rbadge).toBeUndefined();
  });
});

describe("rarity: mọi chỗ hiển thị đi qua một hàm (không còn màu / tên độ hiếm tự tra ở nơi khác)", () => {
  const ui = fs.readFileSync(path.join(ROOT, "client/src/ui.ts"), "utf8");
  const css = fs.readFileSync(path.join(ROOT, "client/src/style.css"), "utf8");

  it("ui.ts không tự tra RARITY_COLORS / RARITY_NAMES (đi qua rarity.ts)", () => {
    expect(ui).not.toMatch(/RARITY_COLORS\s*\[/);
    expect(ui).not.toMatch(/RARITY_NAMES\s*\[/);
    expect(ui).not.toMatch(/import[^;]*\bRARITY_(COLORS|NAMES)\b/s);
    // hàng chữ (chi tiết, nhặt đồ, danh sách túi, lò rèn, hai hàng cửa hàng, nhật ký): dấu TRƯỚC tên; ô nhỏ (túi, thẻ trang bị): huy hiệu GÓC
    expect((ui.match(/applyRarityText\(/g) ?? []).length).toBeGreaterThanOrEqual(7);
    expect((ui.match(/applyRarityBadge\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(ui).toMatch(/clearRarityText\(/);
    expect(ui).toMatch(/clearRarityBadge\(/);
  });

  it("CSS vẽ huy hiệu góc ở ô túi và thẻ trang bị (có position, màu từ --rar, không chặn chuột)", () => {
    expect(css).toMatch(/\.inv-slot\[data-rbadge\]::before/);
    expect(css).toMatch(/\.equip-slot-card\[data-rbadge\]::before/);
    expect(css).toMatch(/content:\s*attr\(data-rbadge\)/);
    expect(css).toMatch(/color:\s*var\(--rar/);
    expect(css).toMatch(/pointer-events:\s*none/);
    expect(css).toMatch(/\.equip-slot-card\s*\{\s*position:\s*relative/);
  });

  it("CSS vẽ dấu phụ TRƯỚC tên (không bị cắt) và ẩn khỏi trình đọc màn hình khi trình duyệt hỗ trợ", () => {
    expect(css).toMatch(/\[data-mark\]::before\s*\{[^}]*content:\s*attr\(data-mark\)/);
    expect(css).toMatch(/@supports\s*\(content:\s*"a"\s*\/\s*""\)/);
    expect(css).toMatch(/content:\s*attr\(data-mark\)\s*" "\s*\/\s*""/);
  });
});
