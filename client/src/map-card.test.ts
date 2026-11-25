// Thẻ minh hoạ bản đồ ở màn chuyển cảnh (map-card.ts, M7.12 / #513). Hành vi thật (thẻ hiện / ẩn, 3:2, không tràn ở năm khung)
// do `client/scripts/check-map-card.mjs` kiểm trong Chrome thật; ở đây: hàm thuần, bất biến của danh sách ảnh, và canh nối mã.
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getMap } from "@tien-gioi/shared";
import { MAP_STYLES } from "./gfx/map-style";
import {
  applyMapCard,
  MAP_CARD_DIR,
  MAP_CARDS,
  mapCardUrl,
  setMapCardOverride,
  type CardImg,
} from "./map-card";

const root = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

afterEach(() => {
  setMapCardOverride("lac_ha", null);
  setMapCardOverride("hac_phong", null);
});

describe("mapCardUrl", () => {
  const cards = { lac_ha: "the_lac_ha.webp", rong: "" };

  it("có mục => đường dẫn dưới /assets/ai/; không có mục => null", () => {
    expect(mapCardUrl("lac_ha", cards)).toBe("/assets/ai/the_lac_ha.webp");
    expect(mapCardUrl("hac_phong", cards)).toBeNull();
    expect(MAP_CARD_DIR).toBe("/assets/ai/");
  });

  it("id lạ từ máy chủ: KHÔNG trả thuộc tính của Object.prototype, không phải chuỗi thì null", () => {
    for (const id of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"])
      expect(mapCardUrl(id, cards), id).toBeNull();
    for (const id of [undefined, null, 0, 1, {}, [], true])
      expect(mapCardUrl(id, cards)).toBeNull();
  });

  it("chỉ tính thuộc tính RIÊNG của bảng (bảng thừa kế qua prototype: không nhận) và chỉ nhận ĐÚNG chuỗi (đối tượng có toString cũng không)", () => {
    const inherited = Object.create({ lac_ha: "evil.webp" }) as Record<string, string>;
    expect(mapCardUrl("lac_ha", inherited)).toBeNull();
    expect(mapCardUrl(["lac_ha"], cards)).toBeNull(); // ép kiểu mảng -> "lac_ha"
    expect(mapCardUrl({ toString: () => "lac_ha" }, cards)).toBeNull();
  });

  it("tên tệp rỗng => null (không trả cả thư mục)", () => {
    expect(mapCardUrl("rong", cards)).toBeNull();
  });

  it("ghi đè (chỉ để thử) thắng bảng; xoá ghi đè thì về bảng", () => {
    setMapCardOverride("lac_ha", "/x.webp");
    expect(mapCardUrl("lac_ha", cards)).toBe("/x.webp");
    expect(mapCardUrl("hac_phong", cards)).toBeNull();
    setMapCardOverride("lac_ha", null);
    expect(mapCardUrl("lac_ha", cards)).toBe("/assets/ai/the_lac_ha.webp");
  });
});

describe("MAP_CARDS: mỗi ảnh đã khai là ảnh CÓ THẬT, có nguồn, của bản đồ CÓ THẬT", () => {
  it("mỗi mục: bản đồ có trong shared, tệp có trong client/public/assets/ai, JSON nguồn cùng tên", () => {
    for (const [mapId, file] of Object.entries(MAP_CARDS)) {
      expect(getMap(mapId), `bản đồ ${mapId}`).toBeDefined();
      expect(file, mapId).toMatch(/^the_[a-z_]+\.webp$/);
      expect(
        fs.existsSync(path.join(root, "client/public/assets/ai", file)),
        `${mapId}: ${file}`,
      ).toBe(true);
      const name = file.replace(/\.webp$/, "");
      expect(fs.existsSync(path.join(root, "docs/art/nguon", `${name}.json`)), `${name}.json`).toBe(
        true,
      );
    }
  });
});

describe("MAP_CARDS phủ MỌI bản đồ có kiểu riêng (bản đồ mới phải có thẻ, hoặc được miễn kèm lý do)", () => {
  /** Bản đồ KHÔNG có thẻ minh hoạ, kèm lý do. Năm bản đồ của lô 1 đều có thẻ; Lang Hoang / Uy Vân Kinh (#1467) được miễn kèm lý do. */
  const EXEMPT: Record<string, string> = {
    // Ảnh thẻ là ảnh AI (SDXL qua ComfyUI): quy trình chờ người dùng đồng ý (`docs/KE_HOACH_DO_HOA_AI.md`, mục 16 / G3), nên hai bản đồ mới của chương 5-6 chưa có thẻ; màn chuyển cảnh vẫn
    // dùng chữ như cũ (`mapCardUrl` -> null). Có ảnh thì thêm dòng vào `MAP_CARDS` VÀ gỡ id khỏi đây cùng PR.
    lang_hoang: "chưa có ảnh thẻ AI (chờ quy trình ComfyUI / G3 được người dùng đồng ý)",
    uy_van: "chưa có ảnh thẻ AI (chờ quy trình ComfyUI / G3 được người dùng đồng ý)",
  };

  it("mỗi mapId trong MAP_STYLES có dòng ở MAP_CARDS (trừ danh sách miễn)", () => {
    for (const id of Object.keys(MAP_STYLES)) {
      if (id in EXEMPT) {
        expect(EXEMPT[id], `${id}: miễn thì phải có lý do`).not.toBe("");
        continue;
      }
      expect(Object.keys(MAP_CARDS), `thiếu thẻ cho bản đồ ${id}`).toContain(id);
    }
  });

  it("hai bản đồ không dùng chung một ảnh; ảnh nằm trong ngân sách mỗi ảnh (perf-budget.json)", () => {
    const files = Object.values(MAP_CARDS);
    expect(new Set(files).size).toBe(files.length);
    const budget = JSON.parse(read("client/perf-budget.json")) as {
      static: { aiAssets: { maxFileKb: number; totalKb: number } };
    };
    let total = fs.statSync(path.join(root, "client/public/assets/ai/login_bg.webp")).size;
    for (const f of files) {
      const size = fs.statSync(path.join(root, "client/public/assets/ai", f)).size;
      expect(size / 1024, f).toBeLessThanOrEqual(budget.static.aiAssets.maxFileKb);
      total += size;
    }
    expect(total / 1024).toBeLessThanOrEqual(budget.static.aiAssets.totalKb);
  });
});

describe("applyMapCard", () => {
  function fakeImg() {
    const log: string[] = [];
    const img: CardImg & { log: string[] } = {
      log,
      hidden: false,
      onload: null,
      onerror: null,
      removeAttribute(name: string) {
        log.push(`remove:${name}`);
        src = "";
      },
      get src() {
        return src;
      },
      set src(v: string) {
        log.push(`src:${v}`);
        src = v;
      },
    };
    let src = "";
    return img;
  }
  const fire = (h: CardImg["onload"]) => h?.(new Event("load"));

  it("url = null: ẩn thẻ, bỏ src, không treo bộ lắng nghe", () => {
    const img = fakeImg();
    img.hidden = false;
    applyMapCard(img, null);
    expect(img.hidden).toBe(true);
    expect(img.log).toEqual(["remove:src"]);
    expect(img.onload).toBeNull();
    expect(img.onerror).toBeNull();
  });

  it("có url: ẨN cho tới khi tải xong; bỏ src TRƯỚC khi đặt src mới; tải xong thì hiện", () => {
    const img = fakeImg();
    applyMapCard(img, "/a.webp");
    expect(img.hidden).toBe(true);
    expect(img.log).toEqual(["remove:src", "src:/a.webp"]);
    fire(img.onload);
    expect(img.hidden).toBe(false);
  });

  it("ảnh lỗi: thẻ ẩn (kể cả khi đã hiện một lần)", () => {
    const img = fakeImg();
    applyMapCard(img, "/a.webp");
    fire(img.onload);
    expect(img.hidden).toBe(false);
    img.onerror?.(new Event("error"));
    expect(img.hidden).toBe(true);
  });

  it("áp lần hai: ẩn lại NGAY và bộ lắng nghe cũ bị thay (ảnh trước tải muộn không làm thẻ mới hiện)", () => {
    const img = fakeImg();
    applyMapCard(img, "/a.webp");
    const oldLoad = img.onload;
    fire(img.onload);
    expect(img.hidden).toBe(false);
    applyMapCard(img, null);
    expect(img.hidden).toBe(true);
    expect(img.onload).toBeNull();
    expect(oldLoad).not.toBeNull(); // bộ cũ còn tham chiếu nhưng không còn gắn vào thẻ
    applyMapCard(img, "/b.webp");
    expect(img.hidden).toBe(true);
    expect(img.onload).not.toBe(oldLoad);
  });
});

describe("canh nối mã: màn chuyển cảnh nhận mapId đích", () => {
  it("main.ts truyền msg.mapId cho showTransition; ui.ts tra thẻ bằng mapCardUrl rồi applyMapCard", () => {
    expect(read("client/src/main.ts")).toMatch(
      /ui\.showTransition\(targetMap\.def\.name,\s*msg\.mapId\)/,
    );
    const ui = read("client/src/ui.ts");
    expect(ui).toMatch(/showTransition\(mapName: string,\s*mapId\?: string\)/);
    expect(ui).toMatch(/applyMapCard\(cardEl,\s*mapCardUrl\(mapId\)\)/);
  });

  it("HTML: thẻ là ảnh trang trí, ẩn sẵn, nằm TRƯỚC tên; CSS: [hidden] thắng display của thẻ, 3:2", () => {
    const html = read("client/index.html");
    const m = /<img\s[^>]*id="transition-card"[^>]*>/.exec(html);
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/\salt=""/);
    expect(m![0]).toMatch(/aria-hidden="true"/);
    expect(m![0]).toMatch(/\shidden(\s|\/|>)/);
    expect(html.indexOf('id="transition-card"')).toBeLessThan(
      html.indexOf('id="transition-map-name"'),
    );
    const css = read("client/src/style.css");
    expect(css).toMatch(/\.transition-card\[hidden\]\s*\{\s*display:\s*none;?\s*\}/);
    const card = /\.transition-card\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(card).toMatch(/aspect-ratio:\s*3\s*\/\s*2/);
    expect(card).toMatch(/pointer-events:\s*none/);
  });

  it("bản chạy thật không có ghi đè: `__mapCardOverride` chỉ gắn trong khối DEV / ?debug", () => {
    const main = read("client/src/main.ts");
    const i = main.indexOf("window as any).__mapCardOverride");
    expect(i).toBeGreaterThan(0);
    const before = main.slice(Math.max(0, i - 700), i);
    expect(before).toMatch(/import\.meta\.env\.DEV[^]*has\("debug"\)/);
  });
});

describe("canh nối mã: thẻ ở đầu bảng Sơn Hà Đồ theo bản đồ ĐANG XEM", () => {
  it("setMapView gọi ui.setMapPanelCard với bản đồ đang xem (không phải bản đồ mình đứng khi đang xem bản đồ khác); ui tra bằng mapCardUrl", () => {
    const scene = read("client/src/scenes/WorldScene.ts");
    expect(scene).toMatch(/ui\.setMapPanelCard\(viewId \?\? this\.map\.def\.id\)/);
    const ui = read("client/src/ui.ts");
    expect(ui).toMatch(/setMapPanelCard\(mapId: string\)/);
    // CHỈ trong thân hàm `setMapPanelCard` (`[^}]*`: không lấn sang `showTransition` có dòng giống hệt phía sau)
    expect(ui).toMatch(
      /setMapPanelCard\(mapId: string\) \{[^}]*getElementById\("map-card"\)[^}]*applyMapCard\(cardEl,\s*mapCardUrl\(mapId\)\)/,
    );
  });

  it("HTML: thẻ nằm TRONG đầu bảng bản đồ, TRƯỚC tiêu đề, là ảnh trang trí ẩn sẵn; CSS: [hidden] thắng display, 3:2, không bắt chuột, bỏ ở màn thấp", () => {
    const html = read("client/index.html");
    const m = /<img\s[^>]*id="map-card"[^>]*>/.exec(html);
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/\salt=""/);
    expect(m![0]).toMatch(/aria-hidden="true"/);
    expect(m![0]).toMatch(/\shidden(\s|\/|>)/);
    const modal = html.indexOf('id="map-modal"');
    expect(html.indexOf('id="map-card"')).toBeGreaterThan(modal);
    expect(html.indexOf('id="map-card"')).toBeLessThan(html.indexOf('id="map-title"'));
    const css = read("client/src/style.css");
    expect(css).toMatch(/\.map-panel-card\[hidden\]\s*\{\s*display:\s*none;?\s*\}/);
    const card = /\.map-panel-card\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(card).toMatch(/aspect-ratio:\s*3\s*\/\s*2/);
    expect(card).toMatch(/pointer-events:\s*none/);
    expect(css).toMatch(
      /@media \(max-height: 480px\)\s*\{\s*\.map-panel-card\s*\{\s*display:\s*none;/,
    );
  });
});
