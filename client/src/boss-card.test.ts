// Thẻ minh hoạ trùm (boss-card.ts, M7.12 / #513) + nối vào thanh máu trùm. Hành vi thật (thẻ hiện / ẩn, nằm gọn ở sáu khung, gói giả
// qua mạng thật) do `client/scripts/check-boss-card.mjs` kiểm trong Chrome thật; ở đây: hàm thuần, bất biến của danh sách, canh nối mã.
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MONSTER_BY_ID } from "@tien-gioi/shared";
import { BOSS_CARD_BATCH } from "../scripts/art/prompt-rules.mjs";
import { BOSS_CARD_DIR, BOSS_CARDS, bossCardTarget, setBossCardOverride } from "./boss-card";

const root = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

afterEach(() => setBossCardOverride("mang", null));

describe("bossCardTarget", () => {
  const cards = { mang: "the_xich_mang.webp", rong: "", xau: "a/b.webp" };

  it("có mục => gói art:trum + đường dẫn dưới art-trum/; không có mục => null", () => {
    expect(bossCardTarget("mang", cards)).toEqual({
      packId: "art:trum",
      file: "art-trum/the_xich_mang.webp",
    });
    expect(bossCardTarget("hac_giao", cards)).toBeNull();
  });

  it("kind lạ từ máy chủ: không trả thuộc tính của Object.prototype; không phải chuỗi / tên tệp rỗng / có dấu '/' thì null", () => {
    for (const k of ["constructor", "__proto__", "toString", "hasOwnProperty"])
      expect(bossCardTarget(k, cards), k).toBeNull();
    for (const k of [undefined, null, 0, 7, {}, [], true])
      expect(bossCardTarget(k, cards)).toBeNull();
    expect(bossCardTarget("rong", cards)).toBeNull();
    expect(bossCardTarget("xau", cards)).toBeNull(); // không cho lách ra khỏi thư mục gói
    const inherited = Object.create({ mang: "evil.webp" }) as Record<string, string>;
    expect(bossCardTarget("mang", inherited)).toBeNull(); // bảng thừa kế qua prototype: không nhận
  });

  it("ghi đè (chỉ để thử) thắng bảng; xoá thì về bảng", () => {
    setBossCardOverride("mang", "khac.webp");
    expect(bossCardTarget("mang", cards)?.file).toBe("art-trum/khac.webp");
    setBossCardOverride("mang", null);
    expect(bossCardTarget("mang", cards)?.file).toBe("art-trum/the_xich_mang.webp");
  });
});

describe("BOSS_CARDS: mỗi thẻ đã khai là thẻ CÓ THẬT của trùm CÓ THẬT, đúng tên trong lô 2", () => {
  it("thư mục khớp lô 2; mỗi mục: trùm có boss: true, tên tệp = id của lô 2, tệp + JSON nguồn + manifest có thật", () => {
    expect(BOSS_CARD_DIR).toBe(path.basename(BOSS_CARD_BATCH.dir));
    const byBoss = new Map(
      (BOSS_CARD_BATCH.items as Array<{ id: string; bossId: string }>).map((i) => [i.bossId, i.id]),
    );
    const manifestPath = path.join(root, "client/public/packs/manifest.json");
    const manifest = fs.existsSync(manifestPath)
      ? (JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
          packs: Array<{ id: string; files: Array<{ path: string }> }>;
        })
      : { packs: [] };
    for (const [kind, file] of Object.entries(BOSS_CARDS)) {
      expect(MONSTER_BY_ID[kind]?.boss, `${kind} phải là trùm`).toBe(true);
      expect(file, kind).toBe(`${byBoss.get(kind)}.webp`);
      expect(fs.existsSync(path.join(root, "client/public/packs", BOSS_CARD_DIR, file)), file).toBe(
        true,
      );
      const stem = file.replace(/\.webp$/, "");
      expect(fs.existsSync(path.join(root, "docs/art/nguon", `${stem}.json`)), `${stem}.json`).toBe(
        true,
      );
      const pack = manifest.packs.find((p) => p.id === "art:trum");
      expect(
        pack?.files.map((f) => f.path),
        "chạy `npm run build:packs`",
      ).toContain(`${BOSS_CARD_DIR}/${file}`);
    }
  });
});

describe("canh nối mã: thanh máu trùm dùng thẻ", () => {
  it("BossBarModel có kind; BossBarDom gọi bossCardTarget + showArtImage khi ĐỔI trùm và dọn khi không còn trùm", () => {
    expect(read("client/src/boss-bar.ts")).toMatch(/kind:\s*c\.kind,/);
    const ui = read("client/src/boss-bar-ui.ts");
    expect(ui).toMatch(/bossCardTarget\(m\.kind\)/);
    expect(ui).toMatch(/showArtImage\(this\.art,\s*target\)/);
    // dọn ở cả hai chỗ: lúc ẩn thanh và lúc đổi trùm
    expect((ui.match(/this\.clearArt\(\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("HTML: ảnh đại diện là ảnh trang trí, ẩn sẵn, nằm TRƯỚC tên trùm; CSS: [hidden] thắng display, không bắt chuột", () => {
    const html = read("client/index.html");
    const m = /<img\s[^>]*id="boss-bar-art"[^>]*>/.exec(html);
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/\salt=""/);
    expect(m![0]).toMatch(/aria-hidden="true"/);
    expect(m![0]).toMatch(/\shidden(\s|\/|>)/);
    expect(html.indexOf('id="boss-bar-art"')).toBeLessThan(html.indexOf('id="boss-bar-name"'));
    const css = read("client/src/style.css");
    expect(css).toMatch(/\.boss-bar-art\[hidden\]\s*\{\s*display:\s*none;?\s*\}/);
    expect(/\.boss-bar-art\s*\{([^}]*)\}/.exec(css)![1]).toMatch(/pointer-events:\s*none/);
  });

  it("`__bossCardOverride` chỉ gắn trong khối DEV / ?debug", () => {
    const main = read("client/src/main.ts");
    const i = main.indexOf("window as any).__bossCardOverride");
    expect(i).toBeGreaterThan(0);
    expect(main.slice(Math.max(0, i - 900), i)).toMatch(/import\.meta\.env\.DEV[^]*has\("debug"\)/);
  });
});
