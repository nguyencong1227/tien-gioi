// Hợp đồng gói tài nguyên riêng (QUYET_DINH_M3 mục 63): luật đường dẫn, luật manifest, dựng URL, khớp `?v=`. Thuần: không đĩa, không mạng.
import { describe, expect, it } from "vitest";
import {
  PRIVATE_PACK_EXTENSIONS,
  PRIVATE_PACK_FILE_MAX_BYTES,
  PRIVATE_PACK_MANIFEST_URL,
  PRIVATE_PACK_MANIFEST_VERSION,
  PRIVATE_PACK_MAX_FILES,
  PRIVATE_PACK_MAX_PACKS,
  PRIVATE_PACK_MIME,
  PRIVATE_PACK_PATH_MAX_LEN,
  PRIVATE_PACK_URL_PREFIX,
  isSafePrivatePackPath,
  privatePackExtension,
  privatePackKey,
  privatePackUrl,
  privatePackVersionMatches,
  privatePackViolations,
  type PrivatePackManifest,
} from "./private-pack";

const SHA = "0123456789abcdef".repeat(4);
const file = (path = "atlas.png", over: Record<string, unknown> = {}) => ({
  path,
  bytes: 1234,
  sha256: SHA,
  ...over,
});
const pack = (over: Record<string, unknown> = {}) => ({
  id: "cainos_basic",
  title: "Cainos Top Down Basic",
  files: [file()],
  ...over,
});
const manifest = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  version: PRIVATE_PACK_MANIFEST_VERSION,
  packs: [pack()],
  ...over,
});

describe("hằng số", () => {
  it("đường dẫn gói nằm dưới /assets-private/, manifest ở /assets-private/manifest.json", () => {
    expect(PRIVATE_PACK_URL_PREFIX).toBe("/assets-private/");
    expect(PRIVATE_PACK_MANIFEST_URL).toBe("/assets-private/manifest.json");
    expect(PRIVATE_PACK_MANIFEST_VERSION).toBe(1);
  });
  it("danh sách trắng phần mở rộng KHÔNG có đuôi chạy mã / script (html, js, svg, mjs, xml)", () => {
    for (const ext of ["html", "htm", "js", "mjs", "svg", "xml", "php", "exe", "sh"])
      expect((PRIVATE_PACK_EXTENSIONS as readonly string[]).includes(ext), ext).toBe(false);
  });
  it("mỗi phần mở rộng được nhận có kiểu nội dung riêng, cố định", () => {
    for (const ext of PRIVATE_PACK_EXTENSIONS) expect(PRIVATE_PACK_MIME[ext], ext).toMatch(/\//);
    expect(PRIVATE_PACK_MIME.png).toBe("image/png");
    expect(PRIVATE_PACK_MIME.json).toBe("application/json");
  });
});

describe("privatePackExtension / isSafePrivatePackPath", () => {
  it("phần mở rộng: nhận danh sách trắng (không phân biệt hoa thường), không nhận phần còn lại", () => {
    expect(privatePackExtension("a.png")).toBe("png");
    expect(privatePackExtension("a.PNG")).toBe("png");
    expect(privatePackExtension("dir/b.WebP")).toBe("webp");
    for (const bad of ["a.gif", "a.html", "a", "a.", ".png", "png"])
      expect(privatePackExtension(bad), bad).toBeUndefined();
  });

  it("đường dẫn an toàn: tệp ở gốc hoặc thư mục con, chữ / số / . _ -", () => {
    for (const ok of [
      "atlas.png",
      "tiles/ground.webp",
      "a/b/c/d.json",
      "Tiles_01-x.JPG",
      "v1.2.3.png",
    ])
      expect(isSafePrivatePackPath(ok), ok).toBe(true);
  });

  it("đường dẫn NGUY HIỂM bị loại: .. tuyệt đối \\ NUL %-mã hoá đoạn ẩn rỗng ký tự lạ", () => {
    for (const bad of [
      "../x.png",
      "a/../x.png",
      "..",
      "../../etc/passwd",
      "/etc/passwd.png",
      "/atlas.png",
      "a\\b.png",
      "a/b\\..\\c.png",
      "a\0.png",
      "atlas.png\0",
      ".hidden.png",
      "a/.hidden/b.png",
      "a//b.png",
      "a/./b.png",
      "a/b/",
      "",
      " atlas.png",
      "atlas .png",
      "a b.png",
      "tệp.png",
      "a:b.png",
      "a*b.png",
      "a?b.png",
      "a#b.png",
      "%2e%2e/x.png",
      "a%2fb.png",
      "~root.png",
      "x.png/",
    ])
      expect(isSafePrivatePackPath(bad), JSON.stringify(bad)).toBe(false);
  });

  it("kiểu rác / quá dài bị loại; đúng ngưỡng dài còn nhận", () => {
    for (const bad of [null, undefined, 3, {}, [], true])
      expect(isSafePrivatePackPath(bad), String(bad)).toBe(false);
    const ext = ".png";
    const atMax = "a".repeat(PRIVATE_PACK_PATH_MAX_LEN - ext.length) + ext;
    expect(isSafePrivatePackPath(atMax)).toBe(true);
    expect(isSafePrivatePackPath(`a${atMax}`)).toBe(false);
  });

  it("phần mở rộng ngoài danh sách trắng bị loại dù tên đẹp", () => {
    for (const bad of ["a.html", "a.js", "a.svg", "a.png.exe", "a.png.html", "readme"])
      expect(isSafePrivatePackPath(bad), bad).toBe(false);
  });
});

describe("privatePackViolations", () => {
  it("manifest hợp lệ (một gói một tệp, nhiều gói nhiều tệp, gói rỗng) -> không vi phạm", () => {
    expect(privatePackViolations(manifest())).toEqual([]);
    const m: PrivatePackManifest = {
      version: 1,
      packs: [
        {
          id: "tiny-swords",
          title: "Tiny Swords",
          files: [
            { path: "atlas.png", bytes: 10, sha256: SHA },
            { path: "ui/frame.webp", bytes: PRIVATE_PACK_FILE_MAX_BYTES, sha256: SHA },
          ],
        },
        { id: "rong", title: "Gói rỗng", files: [] },
      ],
    };
    expect(privatePackViolations(m)).toEqual([]);
    expect(privatePackViolations({ version: 1, packs: [] })).toEqual([]);
  });

  it("không phải đối tượng / sai version / packs không phải mảng", () => {
    for (const bad of [null, undefined, 3, "x", [], true])
      expect(privatePackViolations(bad).join("\n"), String(bad)).toMatch(/không phải đối tượng/);
    expect(privatePackViolations(manifest({ version: 2 })).join("\n")).toMatch(/version/);
    expect(privatePackViolations(manifest({ version: "1" })).join("\n")).toMatch(/version/);
    expect(privatePackViolations({ packs: [] }).join("\n")).toMatch(/version/);
    expect(privatePackViolations({ version: 1 }).join("\n")).toMatch(/packs phải là mảng/);
    expect(privatePackViolations({ version: 1, packs: {} }).join("\n")).toMatch(
      /packs phải là mảng/,
    );
  });

  it("trường LẠ ở bất kỳ tầng nào là vi phạm (không nhét đường dẫn qua trường khác)", () => {
    expect(privatePackViolations(manifest({ root: "/etc" })).join("\n")).toMatch(/trường lạ/);
    expect(privatePackViolations(manifest({ packs: [pack({ dir: "/x" })] })).join("\n")).toMatch(
      /trường lạ/,
    );
    expect(
      privatePackViolations(
        manifest({ packs: [pack({ files: [file("a.png", { abs: "/x" })] })] }),
      ).join("\n"),
    ).toMatch(/trường lạ/);
  });

  it("id gói: sai dạng, trùng", () => {
    for (const id of ["", "Cainos", "a b", "../x", "x/y", "-x", "a".repeat(41), 5, null])
      expect(
        privatePackViolations(manifest({ packs: [pack({ id })] })).join("\n"),
        String(id),
      ).toMatch(/id sai dạng/);
    const dup = privatePackViolations(manifest({ packs: [pack(), pack()] })).join("\n");
    expect(dup).toMatch(/trùng id cainos_basic/);
    expect(privatePackViolations(manifest({ packs: [pack({ id: "a".repeat(40) })] }))).toEqual([]);
  });

  it("title: 2-80 ký tự, không điều khiển / xuống dòng, không khoảng trắng đầu cuối", () => {
    for (const title of [
      "",
      "a",
      "x".repeat(81),
      "Hai\ndòng",
      "tab\there",
      " đầu",
      "cuối ",
      7,
      null,
    ])
      expect(
        privatePackViolations(manifest({ packs: [pack({ title })] })).join("\n"),
        JSON.stringify(title),
      ).toMatch(/title/);
    expect(privatePackViolations(manifest({ packs: [pack({ title: "ab" })] }))).toEqual([]);
    expect(privatePackViolations(manifest({ packs: [pack({ title: "x".repeat(80) })] }))).toEqual(
      [],
    );
  });

  it("tệp: path không an toàn, trùng (kể cả khác hoa thường), bytes ngoài khoảng / không nguyên, sha256 sai", () => {
    const one = (f: unknown) =>
      privatePackViolations(manifest({ packs: [pack({ files: [f] })] })).join("\n");
    expect(one(file("../x.png"))).toMatch(/path không an toàn/);
    expect(one(file("a.html"))).toMatch(/path không an toàn/);
    expect(one(file("a.png", { bytes: 0 }))).toMatch(/bytes/);
    expect(one(file("a.png", { bytes: -5 }))).toMatch(/bytes/);
    expect(one(file("a.png", { bytes: 1.5 }))).toMatch(/bytes/);
    expect(one(file("a.png", { bytes: PRIVATE_PACK_FILE_MAX_BYTES + 1 }))).toMatch(/bytes/);
    expect(one(file("a.png", { bytes: "12" }))).toMatch(/bytes/);
    expect(one(file("a.png", { bytes: Number.NaN }))).toMatch(/bytes/);
    for (const sha256 of [
      "",
      "abc",
      SHA.toUpperCase(),
      `${SHA}0`,
      SHA.slice(1),
      "g".repeat(64),
      5,
      null,
    ])
      expect(one(file("a.png", { sha256 })), String(sha256)).toMatch(/sha256/);
    expect(one(null)).toMatch(/không phải đối tượng/);
    const dup = privatePackViolations(
      manifest({ packs: [pack({ files: [file("A.png"), file("a.PNG")] })] }),
    ).join("\n");
    expect(dup).toMatch(/trùng path/);
    // cùng đường dẫn ở HAI gói khác nhau là hợp lệ (khoá tra bảng có tiền tố gói)
    expect(
      privatePackViolations(manifest({ packs: [pack({ id: "g1" }), pack({ id: "g2" })] })),
    ).toEqual([]);
  });

  it("trần: số gói, tổng số tệp", () => {
    const manyPacks = Array.from({ length: PRIVATE_PACK_MAX_PACKS + 1 }, (_, i) =>
      pack({ id: `g${i}` }),
    );
    expect(privatePackViolations(manifest({ packs: manyPacks })).join("\n")).toMatch(/quá \d+ gói/);
    expect(
      privatePackViolations(manifest({ packs: manyPacks.slice(0, PRIVATE_PACK_MAX_PACKS) })),
    ).toEqual([]);
    const files = (n: number) => Array.from({ length: n }, (_, i) => file(`f${i}.png`));
    const atMax = manifest({ packs: [pack({ files: files(PRIVATE_PACK_MAX_FILES) })] });
    expect(privatePackViolations(atMax)).toEqual([]);
    const over = manifest({ packs: [pack({ files: files(PRIVATE_PACK_MAX_FILES + 1) })] });
    expect(privatePackViolations(over).join("\n")).toMatch(/quá \d+ tệp/);
  });

  it("gói / tệp không phải đối tượng, files không phải mảng", () => {
    expect(privatePackViolations(manifest({ packs: [null] })).join("\n")).toMatch(/gói #0/);
    expect(privatePackViolations(manifest({ packs: ["x"] })).join("\n")).toMatch(
      /không phải đối tượng/,
    );
    expect(privatePackViolations(manifest({ packs: [pack({ files: "x" })] })).join("\n")).toMatch(
      /files phải là mảng/,
    );
  });

  it("không ném lỗi với đầu vào độc (nguyên mẫu, kiểu lạ), và mỗi lỗi nêu đúng chỗ", () => {
    const evil = JSON.parse(
      '{"version":1,"packs":[{"id":"x","title":"ab","files":[{"__proto__":{"a":1},"path":"a.png","bytes":1,"sha256":"' +
        SHA +
        '"}]}]}',
    );
    expect(() => privatePackViolations(evil)).not.toThrow();
    expect(() =>
      privatePackViolations({ version: 1, packs: [{ files: [{ path: Symbol.iterator }] }] }),
    ).not.toThrow();
  });
});

describe("privatePackKey / privatePackUrl / privatePackVersionMatches", () => {
  it("khoá tra bảng = gói/đường dẫn", () => {
    expect(privatePackKey("cainos_basic", "tiles/a.png")).toBe("cainos_basic/tiles/a.png");
  });

  it("URL: tiền tố + gói + đường dẫn; có ?v= (8 hex đầu) khi có hash hợp lệ", () => {
    expect(privatePackUrl("cainos_basic", "atlas.png")).toBe(
      "/assets-private/cainos_basic/atlas.png",
    );
    expect(privatePackUrl("cainos_basic", "tiles/a.webp", SHA)).toBe(
      `/assets-private/cainos_basic/tiles/a.webp?v=${SHA.slice(0, 8)}`,
    );
    // hash rác thì KHÔNG gắn ?v= (không có cache dài trên giá trị bịa)
    for (const bad of ["abc", "g".repeat(64), SHA.toUpperCase(), ""])
      expect(privatePackUrl("g", "a.png", bad), bad).toBe("/assets-private/g/a.png");
  });

  it("URL: gói / đường dẫn không an toàn thì NÉM lỗi (lập trình sai, không trả URL nguy hiểm)", () => {
    expect(() => privatePackUrl("../x", "a.png")).toThrow();
    expect(() => privatePackUrl("Bad", "a.png")).toThrow();
    expect(() => privatePackUrl("g", "../a.png")).toThrow();
    expect(() => privatePackUrl("g", "/a.png")).toThrow();
    expect(() => privatePackUrl("g", "a.html")).toThrow();
  });

  it("?v= khớp: đúng 8 hex đầu của sha256 hợp lệ; sai / thiếu / rác / sha rác thì không", () => {
    expect(privatePackVersionMatches(SHA.slice(0, 8), SHA)).toBe(true);
    expect(privatePackVersionMatches("deadbeef", SHA)).toBe(false);
    expect(privatePackVersionMatches(SHA.slice(0, 7), SHA)).toBe(false);
    expect(privatePackVersionMatches(SHA.slice(0, 9), SHA)).toBe(false);
    // 8 hex đầu của SHA toàn chữ số nên viết hoa không đổi: dùng hash bắt đầu bằng chữ để kiểm "hoa thường"
    const SHA_LETTERS = `abcdef12${"0".repeat(56)}`;
    expect(privatePackVersionMatches("abcdef12", SHA_LETTERS)).toBe(true);
    expect(privatePackVersionMatches("ABCDEF12", SHA_LETTERS)).toBe(false);
    for (const bad of [undefined, null, 5, {}, ["01234567"], ""])
      expect(privatePackVersionMatches(bad, SHA), String(bad)).toBe(false);
    // sha256 của bảng không hợp lệ thì không bao giờ khớp (dù tiền tố trùng)
    expect(privatePackVersionMatches("abcdef12", "abcdef12")).toBe(false);
  });
});
