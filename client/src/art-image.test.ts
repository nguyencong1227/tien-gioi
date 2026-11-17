// Ảnh minh hoạ AI tải theo nhu cầu (art-image.ts + gói `art:*` của gfx/packs.ts). Môi trường mạng giả: không trình duyệt, không đồng hồ thật.
import { describe, expect, it } from "vitest";
import { ART_WAIT_MS, showArtImage } from "./art-image";
import type { CardImg } from "./map-card";
import {
  artPackId,
  createPacks,
  packFileUrl,
  sanitizeManifest,
  type PackFile,
  type PacksEnv,
} from "./gfx/packs";

const SHA = "b".repeat(64);
const f = (path: string, bytes: number): PackFile => ({ path, bytes, sha256: SHA });
const XICH = f("art-trum/the_xich_mang.webp", 28_000);
const GIAO = f("art-trum/the_hac_giao.webp", 30_000);
const ART = { id: "art:trum", kind: "art", files: [XICH, GIAO] };
const OTHER = { id: "art:npc", kind: "art", files: [f("art-npc/ha_lao.webp", 18_000)] };
const tick = async (n = 6) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};

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

interface Opts {
  manifest?: string;
  native?: boolean;
  failFirst?: boolean;
  hold?: boolean;
}
function setup(o: Opts = {}) {
  const gate = { hold: o.hold ?? false, release: [] as (() => void)[] };
  const fetched: string[] = [];
  let calls = 0;
  const env: PacksEnv = {
    async fetchText() {
      return o.manifest ?? JSON.stringify({ packs: [ART, OTHER] });
    },
    async fetchBytes(url) {
      fetched.push(url);
      calls++;
      if (gate.hold) await new Promise<void>((r) => gate.release.push(r));
      if (o.failFirst && calls === 1) throw new Error("mạng lỗi");
      const p = /\/packs\/(.+)\?/.exec(url)?.[1];
      return [XICH, GIAO, ...OTHER.files].find((x) => x.path === p)?.bytes ?? 0;
    },
    native: () => o.native ?? false,
    saveData: () => false,
    connection: () => "4g",
    hdAllowed: () => false,
    idle: (cb) => cb(),
    warn: () => undefined,
  };
  return { ctl: createPacks(env), gate, fetched };
}
const show = (
  img: CardImg,
  ctl: ReturnType<typeof setup>["ctl"],
  file = XICH.path,
  timeoutMs?: number,
) => showArtImage(img, { packId: artPackId("trum"), file, ctl, timeoutMs });

describe("showArtImage", () => {
  it("web: tải gói rồi đặt ĐÚNG URL có băm của tệp; thẻ ẩn cho tới khi ảnh giải mã xong", async () => {
    const { ctl, fetched } = setup();
    const img = fakeImg();
    show(img, ctl);
    expect(img.hidden).toBe(true); // ẩn NGAY, trước khi có gì tải
    await tick();
    expect(img.srcNow).toBe(packFileUrl(XICH));
    expect(img.srcNow).toBe("/packs/art-trum/the_xich_mang.webp?v=bbbbbbbbbbbb");
    expect(img.hidden).toBe(true); // chưa onload
    img.onload?.(new Event("load"));
    expect(img.hidden).toBe(false);
    expect(fetched).toHaveLength(2); // cả gói (hai tệp) tải MỘT lần
    // thẻ thứ hai cùng gói: không tải lại
    const img2 = fakeImg();
    show(img2, ctl, GIAO.path);
    await tick();
    expect(img2.srcNow).toBe(packFileUrl(GIAO));
    expect(fetched).toHaveLength(2);
  });

  it("chưa có gói nào (manifest rỗng) hoặc không có gói này: thẻ ẩn, không src, không ném lỗi", async () => {
    const empty = setup({ manifest: JSON.stringify({ packs: [] }) });
    const a = fakeImg();
    show(a, empty.ctl);
    await tick();
    expect(a.hidden).toBe(true);
    expect(a.srcNow).toBe("");
    expect(empty.fetched).toEqual([]);
    const noArt = setup({ manifest: JSON.stringify({ packs: [OTHER] }) });
    const b = fakeImg();
    show(b, noArt.ctl); // `art:trum` không có trong manifest
    await tick();
    expect(b.hidden).toBe(true);
    expect(b.srcNow).toBe("");
  });

  it("tệp KHÔNG có trong gói: thẻ vẫn ẩn (không đoán URL)", async () => {
    const { ctl } = setup();
    const img = fakeImg();
    show(img, ctl, "art-trum/khong-co.webp");
    await tick();
    expect(img.hidden).toBe(true);
    expect(img.srcNow).toBe("");
  });

  it("tải lỗi: thẻ ẩn; gọi lại thì thử lại và hiện", async () => {
    const { ctl } = setup({ failFirst: true });
    const img = fakeImg();
    show(img, ctl);
    await tick();
    expect(img.srcNow).toBe("");
    expect(img.hidden).toBe(true);
    show(img, ctl);
    await tick();
    expect(img.srcNow).toBe(packFileUrl(XICH));
  });

  it("hết giờ chờ nhưng gói về MUỘN: áp dụng ngay nếu yêu cầu còn hiệu lực", async () => {
    const { ctl, gate } = setup({ hold: true });
    const img = fakeImg();
    show(img, ctl, XICH.path, 5);
    await new Promise((r) => setTimeout(r, 30));
    expect(img.srcNow).toBe(""); // quá giờ: ẩn
    gate.hold = false;
    gate.release.splice(0).forEach((r) => r());
    await tick(10);
    expect(img.srcNow).toBe(packFileUrl(XICH));
  });

  it("huỷ (đóng bảng): gói về muộn KHÔNG áp dụng; yêu cầu CŨ của cùng <img> cũng bị bỏ khi gọi lại", async () => {
    const a = setup({ hold: true });
    const img = fakeImg();
    const cancel = show(img, a.ctl, XICH.path, 5);
    await new Promise((r) => setTimeout(r, 30));
    cancel();
    a.gate.hold = false;
    a.gate.release.splice(0).forEach((r) => r());
    await tick(10);
    expect(img.srcNow).toBe("");

    const b = setup({ hold: true });
    const img2 = fakeImg();
    show(img2, b.ctl, XICH.path, 5);
    await new Promise((r) => setTimeout(r, 30));
    show(img2, b.ctl, GIAO.path, 5); // đổi sang trùm khác: yêu cầu cũ phải bị bỏ
    await new Promise((r) => setTimeout(r, 30));
    b.gate.hold = false;
    b.gate.release.splice(0).forEach((r) => r());
    await tick(10);
    expect(img2.srcNow).toBe(packFileUrl(GIAO)); // KHÔNG phải ảnh trùm trước
  });

  it("gói KHÁC về xong thì không đổi gì ở thẻ đang chờ gói này; gói của nó về thì hiện", async () => {
    const { ctl, gate } = setup({ hold: true });
    const img = fakeImg();
    show(img, ctl, XICH.path, 5);
    await new Promise((r) => setTimeout(r, 30)); // quá giờ; việc tải gói trum vẫn treo
    gate.hold = false; // từ giờ các lần tải MỚI không treo (gói npc), lần tải trum đang treo vẫn treo
    await ctl.ensure("art:npc");
    await tick(10);
    expect(ctl.state("art:npc")).toBe("ready");
    expect(ctl.state("art:trum")).toBe("loading");
    expect(img.srcNow).toBe(""); // gói npc xong KHÔNG làm thẻ trum hiện
    gate.release.splice(0).forEach((r) => r());
    await tick(10);
    expect(img.srcNow).toBe(packFileUrl(XICH));
  });

  it("native (APK): không tải gì, dùng URL không băm của tệp đóng sẵn trong dist/packs", async () => {
    const { ctl, fetched } = setup({ native: true });
    const img = fakeImg();
    show(img, ctl);
    await tick();
    expect(fetched).toEqual([]);
    expect(img.srcNow).toBe("/packs/art-trum/the_xich_mang.webp");
    // đường dẫn xấu không bao giờ thành URL
    const bad = fakeImg();
    show(bad, ctl, "../x.webp");
    await tick();
    expect(bad.srcNow).toBe("");
  });

  it("mặc định chờ ART_WAIT_MS = 3 giây", () => {
    expect(ART_WAIT_MS).toBe(3000);
  });
});

describe("gói art trong manifest", () => {
  it("sanitizeManifest giữ gói kind=art và vẫn bỏ kind lạ", () => {
    const m = sanitizeManifest({
      packs: [
        { ...ART, files: ART.files },
        { id: "x", kind: "lạ", files: [] },
      ],
    });
    expect(m.packs.map((p) => p.id)).toEqual(["art:trum"]);
    expect(m.packs[0]!.kind).toBe("art");
    expect(m.packs[0]!.bytes).toBe(58_000);
  });

  it("artPackId", () => {
    expect(artPackId("npc")).toBe("art:npc");
  });
});
