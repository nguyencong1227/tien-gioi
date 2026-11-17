// Chân dung NPC ở hộp thoại (npc-portrait.ts, M7.12 / #513). Hành vi thật (ảnh hiện / ẩn, nằm gọn ở sáu khung, gói giả qua mạng thật) do
// `client/scripts/check-npc-portrait.mjs` kiểm trong Chrome thật; ở đây: hàm thuần, ô chân dung (không chớp), bất biến danh sách, canh nối mã.
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NPC_BY_ID } from "@tien-gioi/shared";
import { NPC_PORTRAIT_BATCH } from "../scripts/art/prompt-rules.mjs";
import type { PackController } from "./gfx/packs";
import type { CardImg } from "./map-card";
import {
  NPC_PORTRAIT_DIR,
  NPC_PORTRAITS,
  NpcPortraitSlot,
  npcPortraitTarget,
  setNpcPortraitOverride,
} from "./npc-portrait";

const root = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
const tick = async (n = 6) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};

afterEach(() => {
  setNpcPortraitOverride("duoc_su", null);
  setNpcPortraitOverride("tho_ren", null);
});

describe("npcPortraitTarget", () => {
  const ps = { duoc_su: "npc_duoc_su.webp", rong: "", xau: "a/b.webp" };

  it("có mục => gói art:npc + đường dẫn dưới art-npc/; không có mục => null", () => {
    expect(npcPortraitTarget("duoc_su", ps)).toEqual({
      packId: "art:npc",
      file: "art-npc/npc_duoc_su.webp",
    });
    expect(npcPortraitTarget("tho_ren", ps)).toBeNull();
  });

  it("npcId lạ từ máy chủ: không trả thuộc tính của Object.prototype; không phải chuỗi / tên tệp rỗng / có '/' thì null; bảng thừa kế không nhận", () => {
    for (const k of ["constructor", "__proto__", "toString", "hasOwnProperty"])
      expect(npcPortraitTarget(k, ps), k).toBeNull();
    for (const k of [undefined, null, 0, 7, {}, [], true])
      expect(npcPortraitTarget(k, ps)).toBeNull();
    expect(npcPortraitTarget("rong", ps)).toBeNull();
    expect(npcPortraitTarget("xau", ps)).toBeNull();
    const inherited = Object.create({ duoc_su: "evil.webp" }) as Record<string, string>;
    expect(npcPortraitTarget("duoc_su", inherited)).toBeNull();
  });

  it("ghi đè (chỉ để thử) thắng bảng; xoá thì về bảng", () => {
    setNpcPortraitOverride("duoc_su", "khac.webp");
    expect(npcPortraitTarget("duoc_su", ps)?.file).toBe("art-npc/khac.webp");
    setNpcPortraitOverride("duoc_su", null);
    expect(npcPortraitTarget("duoc_su", ps)?.file).toBe("art-npc/npc_duoc_su.webp");
  });
});

describe("NPC_PORTRAITS: mỗi chân dung đã khai là của NPC CÓ THẬT, đúng tên trong lô 3", () => {
  it("thư mục khớp lô 3; mỗi mục: NPC có thật (không phải cao_thi), tên tệp = id của lô 3, tệp + JSON nguồn + manifest có thật", () => {
    expect(NPC_PORTRAIT_DIR).toBe(path.basename(NPC_PORTRAIT_BATCH.dir));
    const byNpc = new Map(
      (NPC_PORTRAIT_BATCH.items as Array<{ id: string; npcId: string }>).map((i) => [
        i.npcId,
        i.id,
      ]),
    );
    const manifestPath = path.join(root, "client/public/packs/manifest.json");
    const manifest = fs.existsSync(manifestPath)
      ? (JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
          packs: Array<{ id: string; files: Array<{ path: string }> }>;
        })
      : { packs: [] };
    for (const [npcId, file] of Object.entries(NPC_PORTRAITS)) {
      expect(NPC_BY_ID[npcId], `${npcId} phải là NPC`).toBeDefined();
      expect(npcId).not.toBe("cao_thi");
      expect(file, npcId).toBe(`${byNpc.get(npcId)}.webp`);
      expect(
        fs.existsSync(path.join(root, "client/public/packs", NPC_PORTRAIT_DIR, file)),
        file,
      ).toBe(true);
      const stem = file.replace(/\.webp$/, "");
      expect(fs.existsSync(path.join(root, "docs/art/nguon", `${stem}.json`)), `${stem}.json`).toBe(
        true,
      );
      const pack = manifest.packs.find((p) => p.id === "art:npc");
      expect(
        pack?.files.map((f) => f.path),
        "chạy `npm run build:packs`",
      ).toContain(`${NPC_PORTRAIT_DIR}/${file}`);
    }
  });
});

describe("NpcPortraitSlot: cùng NPC không chớp, đổi NPC dọn yêu cầu cũ", () => {
  function fakeImg() {
    const log: string[] = [];
    let src = "";
    const img: CardImg & { log: string[]; readonly srcNow: string } = {
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
      get srcNow() {
        return src;
      },
    };
    return img;
  }
  const ctl = {
    ensure: async () => "cached",
    state: () => "ready",
    onReady: () => () => undefined,
    onRelease: () => () => undefined,
    release: () => undefined,
    releaseKind: () => undefined,
    prefetch: () => undefined,
    fileUrl: (_id: string, p: string) => `/packs/${p}?v=aaaaaaaaaaaa`,
    startMapWait: () => undefined,
    takeMapWait: async () => "cached",
    prefetchNeighbors: () => undefined,
  } as unknown as PackController;

  it("có chân dung: ẩn tới khi giải mã xong; gọi show lại cùng NPC KHÔNG đặt lại ảnh (ảnh đang hiện vẫn hiện)", async () => {
    setNpcPortraitOverride("duoc_su", "npc_duoc_su.webp");
    const img = fakeImg();
    const slot = new NpcPortraitSlot(img, ctl);
    slot.show("duoc_su");
    expect(img.hidden).toBe(true);
    await tick();
    expect(img.srcNow).toBe("/packs/art-npc/npc_duoc_su.webp?v=aaaaaaaaaaaa");
    img.onload?.(new Event("load"));
    expect(img.hidden).toBe(false);
    const before = [...img.log];
    slot.show("duoc_su"); // hộp thoại vẽ lại (đổi lời / lựa chọn)
    await tick();
    expect(img.log).toEqual(before); // không remove / src lại
    expect(img.hidden).toBe(false);
  });

  it("đổi sang NPC KHÔNG có chân dung: ảnh ẩn NGAY và bỏ src; đổi qua lại thì hiện lại", async () => {
    setNpcPortraitOverride("duoc_su", "npc_duoc_su.webp");
    const img = fakeImg();
    const slot = new NpcPortraitSlot(img, ctl);
    slot.show("duoc_su");
    await tick();
    img.onload?.(new Event("load"));
    slot.show("tho_ren"); // không có mục
    expect(img.hidden).toBe(true);
    expect(img.srcNow).toBe("");
    slot.show("duoc_su");
    await tick();
    expect(img.srcNow).toContain("npc_duoc_su.webp");
  });

  it("clear (đóng hộp thoại): ẩn, bỏ src; mở lại thì tải lại", async () => {
    setNpcPortraitOverride("duoc_su", "npc_duoc_su.webp");
    const img = fakeImg();
    const slot = new NpcPortraitSlot(img, ctl);
    slot.show("duoc_su");
    await tick();
    img.onload?.(new Event("load"));
    slot.clear();
    expect(img.hidden).toBe(true);
    expect(img.srcNow).toBe("");
    slot.show("duoc_su");
    await tick();
    expect(img.srcNow).toContain("npc_duoc_su.webp");
  });

  it("clear NGAY (trước khi gói kịp xong): ảnh về muộn cũng không hiện", async () => {
    setNpcPortraitOverride("duoc_su", "npc_duoc_su.webp");
    const img = fakeImg();
    const slot = new NpcPortraitSlot(img, ctl);
    slot.show("duoc_su");
    slot.clear();
    await tick(10);
    expect(img.srcNow).toBe("");
    expect(img.hidden).toBe(true);
  });
});

describe("canh nối mã: hộp thoại dùng chân dung", () => {
  it("ui.ts: onDialog gọi dlgPortrait.show(m.npcId), closeDialog gọi dlgPortrait?.clear()", () => {
    const ui = read("client/src/ui.ts");
    expect(ui).toMatch(/dlgPortrait\.show\(m\.npcId\)/);
    expect(ui).toMatch(/dlgPortrait\?\.clear\(\)/);
    // dọn TRƯỚC khi ẩn hộp thoại (cùng hàm closeDialog)
    const close = ui.slice(ui.indexOf("  closeDialog() {"), ui.indexOf("  closeAllModals()"));
    expect(close).toMatch(/dlgPortrait\?\.clear\(\)/);
  });

  it("HTML: ảnh là ảnh trang trí, ẩn sẵn, nằm TRƯỚC tên NPC; CSS: [hidden] thắng display, không bắt chuột", () => {
    const html = read("client/index.html");
    const m = /<img\s[^>]*id="dlg-npc-art"[^>]*>/.exec(html);
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/\salt=""/);
    expect(m![0]).toMatch(/aria-hidden="true"/);
    expect(m![0]).toMatch(/\shidden(\s|\/|>)/);
    expect(html.indexOf('id="dlg-npc-art"')).toBeLessThan(html.indexOf('id="dlg-npc-name"'));
    const css = read("client/src/style.css");
    expect(css).toMatch(/\.dlg-npc-art\[hidden\]\s*\{\s*display:\s*none;?\s*\}/);
    expect(/\.dlg-head\s*>\s*\.dlg-npc-art\s*\{([^}]*)\}/.exec(css)![1]).toMatch(
      /pointer-events:\s*none/,
    );
  });

  it("`__npcPortraitOverride` chỉ gắn trong khối DEV / ?debug", () => {
    const main = read("client/src/main.ts");
    const i = main.indexOf("window as any).__npcPortraitOverride");
    expect(i).toBeGreaterThan(0);
    expect(main.slice(Math.max(0, i - 1100), i)).toMatch(
      /import\.meta\.env\.DEV[^]*has\("debug"\)/,
    );
  });
});
