// Màn Ghi công của GÓI TÀI NGUYÊN RIÊNG (mục 63): `packs().privateCredits()` chỉ nêu gói ĐANG DÙNG; `renderPrivateCredits` vẽ bằng `textContent`, liên kết chỉ khi URL an toàn;
// khối ẩn khi không có gói (CI, máy dev); lỡ gỡ khỏi Cài đặt / lỡ không gọi lúc mở Cài đặt thì đỏ.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PRIVATE_PACK_MANIFEST_URL } from "@tien-gioi/shared";
import { createPacks, type PacksEnv, type PrivateCredit } from "./gfx/packs";
import {
  privateCreditLines,
  renderPrivateCredits,
  type CreditDoc,
  type CreditNode,
} from "./private-credits";

const ROOT = path.resolve(__dirname, "../..");
const html = fs.readFileSync(path.join(ROOT, "client/index.html"), "utf-8");
const uiSrc = fs.readFileSync(path.join(ROOT, "client/src/ui.ts"), "utf-8");
const modSrc = fs.readFileSync(path.join(ROOT, "client/src/private-credits.ts"), "utf-8");

const SHA = "b".repeat(64);
const MANIFEST = {
  packs: [
    {
      id: "cainos",
      title: "Cainos Basic",
      url: "https://example.com/cainos",
      license: "Miễn phí, cấm phân phối lại",
      files: [{ path: "atlas.png", bytes: 100, sha256: SHA }],
    },
    { id: "swords", title: "Tiny Swords", files: [{ path: "a.png", bytes: 10, sha256: SHA }] },
  ],
};

function envFor(failPack?: string): PacksEnv {
  return {
    async fetchText(url) {
      return url === PRIVATE_PACK_MANIFEST_URL ? JSON.stringify(MANIFEST) : null;
    },
    async fetchBytes(url) {
      if (failPack !== undefined && url.includes(`/${failPack}/`)) throw new Error("tải lỗi");
      return url.includes("/cainos/") ? 100 : 10;
    },
    native: () => false,
    saveData: () => false,
    connection: () => "4g",
    hdAllowed: () => true,
    idle: (cb) => cb(),
    warn: () => undefined,
  };
}

// --- tài liệu giả: ghi lại cách vẽ (không có innerHTML nên lỡ dùng innerHTML sẽ ném lỗi) ---
class FakeNode implements CreditNode {
  textContent: string | null = null;
  hidden = false;
  attrs: Record<string, string> = {};
  children: FakeNode[] = [];
  constructor(readonly tag: string) {}
  setAttribute(n: string, v: string): void {
    this.attrs[n] = v;
  }
  append(...c: unknown[]): void {
    this.children.push(...(c as FakeNode[]));
  }
  replaceChildren(...c: unknown[]): void {
    this.children = c as FakeNode[];
  }
}
const fakeDoc: CreditDoc = { createElement: (tag) => new FakeNode(tag) };

describe("packs().privateCredits: chỉ gói đang DÙNG", () => {
  it("chưa nạp manifest riêng: rỗng; gói chưa ready không hiện", async () => {
    const p = createPacks(envFor(), {});
    expect(p.privateCredits()).toEqual([]);
    const pending = p.ensure("private:cainos");
    expect(p.privateCredits()).toEqual([]); // đang tải (manifest chưa về): chưa dùng
    await pending;
  });

  it("gói ready hiện đúng tên / url / giấy phép; url + license vắng thì không có khoá; đúng thứ tự manifest", async () => {
    const p = createPacks(envFor(), {});
    await p.ensure("private:swords");
    expect(p.privateCredits()).toEqual([{ title: "Tiny Swords" }]);
    await p.ensure("private:cainos");
    expect(p.privateCredits()).toEqual([
      {
        title: "Cainos Basic",
        url: "https://example.com/cainos",
        license: "Miễn phí, cấm phân phối lại",
      },
      { title: "Tiny Swords" },
    ]);
    expect(Object.keys(p.privateCredits()[1])).toEqual(["title"]);
  });

  it("gói tải lỗi (failed) hoặc đã giải phóng thì KHÔNG hiện: hình không còn trên màn", async () => {
    const p = createPacks(envFor("cainos"), {});
    expect(await p.ensure("private:cainos")).toBe("failed");
    await p.ensure("private:swords");
    expect(p.privateCredits().map((c) => c.title)).toEqual(["Tiny Swords"]);
    p.release("private:swords");
    expect(p.privateCredits()).toEqual([]);
    p.releaseKind("private");
    expect(p.privateCredits()).toEqual([]);
  });

  it("gói công khai (bản đồ, icon...) không bao giờ vào màn Ghi công riêng", async () => {
    const env = envFor();
    const p = createPacks(
      {
        ...env,
        async fetchText(url) {
          return url === PRIVATE_PACK_MANIFEST_URL
            ? null
            : JSON.stringify({
                packs: [
                  {
                    id: "map:lac_ha",
                    kind: "map",
                    mapId: "lac_ha",
                    files: [{ path: "m/a.webp", bytes: 7, sha256: SHA }],
                  },
                ],
              });
        },
      },
      {},
    );
    await p.ensure("map:lac_ha");
    expect(p.privateCredits()).toEqual([]);
  });
});

describe("privateCreditLines", () => {
  it("chữ: tên, kèm ' · giấy phép: ...' khi có; liên kết chỉ khi URL an toàn", () => {
    expect(
      privateCreditLines([
        { title: "A", url: "https://a.example.com/x", license: "CC0" },
        { title: "B" },
        { title: "C", license: "Cấm phân phối lại" },
      ]),
    ).toEqual([
      { text: "A · giấy phép: CC0", href: "https://a.example.com/x" },
      { text: "B", href: null },
      { text: "C · giấy phép: Cấm phân phối lại", href: null },
    ]);
  });

  it("URL không an toàn (javascript:, data:, http:, có khoảng trắng, không tên miền) KHÔNG thành liên kết, chữ vẫn hiện", () => {
    const bad = [
      "javascript:alert(1)",
      "data:text/html,<script>1</script>",
      "http://a.example.com/x",
      "https://a.example.com/x y",
      "https://localhost/x",
      "https://u:p@a.example.com/x",
      "//a.example.com/x",
    ];
    for (const url of bad) {
      const [l] = privateCreditLines([{ title: "Gói thử", url }]);
      expect(l, url).toEqual({ text: "Gói thử", href: null });
    }
  });

  it("gộp dòng trùng hệt nhau (hai gói cùng nguồn); khác giấy phép thì giữ cả hai", () => {
    const a: PrivateCredit = { title: "Cainos", url: "https://a.example.com/x", license: "L1" };
    expect(privateCreditLines([a, { ...a }, { ...a, license: "L2" }])).toHaveLength(2);
    expect(privateCreditLines([])).toEqual([]);
  });
});

describe("renderPrivateCredits", () => {
  const mk = () => ({ box: new FakeNode("div"), list: new FakeNode("ul") });

  it("không có gói: khối ẨN, danh sách rỗng, trả 0", () => {
    const { box, list } = mk();
    box.hidden = false;
    expect(renderPrivateCredits(box, list, [], fakeDoc)).toBe(0);
    expect(box.hidden).toBe(true);
    expect(list.children).toEqual([]);
  });

  it("có gói: khối HIỆN; liên kết có target _blank + rel noopener noreferrer; không liên kết thì li mang chữ", () => {
    const { box, list } = mk();
    box.hidden = true;
    const n = renderPrivateCredits(
      box,
      list,
      [
        { title: "Cainos Basic", url: "https://example.com/cainos", license: "CC0" },
        { title: "Tiny Swords" },
      ],
      fakeDoc,
    );
    expect(n).toBe(2);
    expect(box.hidden).toBe(false);
    const [li1, li2] = list.children;
    expect(li1.tag).toBe("li");
    expect(li1.textContent).toBeNull();
    const a = li1.children[0];
    expect(a.tag).toBe("a");
    expect(a.textContent).toBe("Cainos Basic · giấy phép: CC0");
    expect(a.attrs).toEqual({
      href: "https://example.com/cainos",
      target: "_blank",
      rel: "noopener noreferrer",
    });
    expect(li2.textContent).toBe("Tiny Swords");
    expect(li2.children).toEqual([]);
  });

  it("chuỗi từ manifest chỉ vào textContent (không HTML): thẻ trong tên giữ nguyên là CHỮ", () => {
    const { box, list } = mk();
    renderPrivateCredits(box, list, [{ title: "<img src=x onerror=alert(1)>" }], fakeDoc);
    expect(list.children[0].textContent).toBe("<img src=x onerror=alert(1)>");
    expect(modSrc).not.toMatch(/innerHTML|insertAdjacentHTML|outerHTML/);
  });

  it("vẽ lại THAY danh sách cũ (mở Cài đặt nhiều lần không dồn dòng); hết gói thì ẩn lại", () => {
    const { box, list } = mk();
    renderPrivateCredits(box, list, [{ title: "Một" }, { title: "Hai" }], fakeDoc);
    renderPrivateCredits(box, list, [{ title: "Ba" }], fakeDoc);
    expect(list.children.map((c) => c.textContent)).toEqual(["Ba"]);
    renderPrivateCredits(box, list, [], fakeDoc);
    expect(box.hidden).toBe(true);
    expect(list.children).toEqual([]);
  });
});

describe("nối vào giao diện", () => {
  it("HTML: khối #set-credit-private (ẩn mặc định, có #set-credit-private-list) nằm TRONG #set-about", () => {
    const i = html.indexOf('id="set-about"');
    const start = html.lastIndexOf("<section", i);
    const section = html.slice(start, html.indexOf("</section>", i));
    expect(section).toMatch(/<div id="set-credit-private" hidden>/);
    expect(section).toMatch(/<ul id="set-credit-private-list"><\/ul>/);
  });

  it("ui.ts: toggleSettingsModal vẽ lúc MỞ Cài đặt bằng packs().privateCredits()", () => {
    const i = uiSrc.indexOf("toggleSettingsModal(force?: boolean)");
    expect(i).toBeGreaterThan(0);
    const body = uiSrc.slice(i, uiSrc.indexOf("isSettingsModalOpen()", i));
    expect(body).toContain("renderPrivateCredits(");
    expect(body).toContain('$("set-credit-private")');
    expect(body).toContain('$("set-credit-private-list")');
    expect(body).toContain("packs().privateCredits()");
    // chỉ vẽ khi mở (không phải khi đóng)
    expect(body.indexOf("renderPrivateCredits(")).toBeLessThan(body.indexOf("} else {"));
  });
});
