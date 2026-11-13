import { describe, expect, it } from "vitest";
import path from "node:path";
import { execFileSync } from "node:child_process";
// @ts-expect-error tệp .mjs không có khai báo kiểu (như credits.test.ts)
import { findCjk, isCjk, isSkippedFile, scanFiles, trackedFiles } from "../scripts/check-cjk.mjs";

// Ký tự CJK dựng bằng điểm mã: mã nguồn test cũng không được chứa chữ Hán hay chuỗi thoát (chính bài kiểm này quét nó).
const HAN = String.fromCodePoint(0x4ed9);
const HAN_B = String.fromCodePoint(0x20000);
const KANA = String.fromCodePoint(0x3042);
const HANGUL = String.fromCodePoint(0xac00);
const FULLWIDTH = String.fromCodePoint(0xff01);
const BS = String.fromCharCode(92); // dấu gạch chéo ngược
const rootDir = path.resolve(__dirname, "../..");

describe("check-cjk: nhận diện (hàm thuần)", () => {
  it("bắt chữ Hán, Hán ngoài BMP, kana, hangul, dạng toàn chiều; cho qua tiếng Việt, emoji, ký hiệu", () => {
    for (const s of [HAN, HAN_B, KANA, HANGUL, FULLWIDTH])
      expect(findCjk(`x ${s} y`).length, s).toBe(1);
    const viet = "Đả tọa, Luân Hồi, Tiên Giới: ngưỡng, ướt, ỷ, Ữ, ǒ, ·, →, ✓, 😀";
    expect(findCjk(viet)).toEqual([]);
  });

  it("báo đúng dòng và cột (đếm theo ký tự, không theo đơn vị UTF-16)", () => {
    const hits = findCjk(`dòng một\nab😀${HAN}`);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ line: 2, col: 4, cp: 0x4ed9 });
  });

  it("bắt DẠNG THOÁT của chữ Hán: \\uXXXX, \\u{...}, &#xHEX; / &#DEC; và (css / html) thoát CSS", () => {
    expect(findCjk(`"${BS}u4ed9"`)).toHaveLength(1);
    expect(findCjk(`"${BS}u{20000}"`)).toHaveLength(1);
    expect(findCjk("<div>&#x4ED9;</div>")).toHaveLength(1);
    expect(findCjk("<div>&#20185;</div>")).toHaveLength(1);
    expect(findCjk(`a::before { content: "${BS}4ed9"; }`, "x.css")).toHaveLength(1);
    expect(findCjk(`<style>i::after{content:"${BS}4ED9"}</style>`, "x.html")).toHaveLength(1);
  });

  it("không báo nhầm: thoát không phải CJK, thoát CSS ở tệp không phải css / html, số thập phân nhỏ", () => {
    expect(findCjk(`"${BS}u00e9"`)).toEqual([]); // é
    expect(findCjk(`"${BS}u{1F600}"`)).toEqual([]); // emoji
    expect(findCjk("&#233; &#x1F600;")).toEqual([]);
    expect(findCjk(`"${BS}4ed9"`, "x.ts")).toEqual([]); // ngoài css / html, \4ed9 không phải thoát
    expect(findCjk(`a::before { content: "${BS}00b7"; }`, "x.css")).toEqual([]);
  });

  it("isCjk: ranh giới các dải", () => {
    expect(isCjk(0x4dff)).toBe(false);
    expect(isCjk(0x4e00)).toBe(true);
    expect(isCjk(0x9fff)).toBe(true);
    expect(isCjk(0xa000)).toBe(false);
    expect(isCjk(0x1ea0)).toBe(false); // chữ Việt (Ạ)
  });

  it("tệp nhị phân và khóa npm được bỏ qua; tệp văn bản thì không", () => {
    for (const f of ["a/b.png", "x.woff2", "app.apk", "package-lock.json", "app/package-lock.json"])
      expect(isSkippedFile(f), f).toBe(true);
    for (const f of ["a.ts", "index.html", "icon.svg", "atlas.json", "x.md"])
      expect(isSkippedFile(f), f).toBe(false);
  });
});

describe("check-cjk: toàn repo (QUYET_DINH_M3 mục 12)", () => {
  const hasGit = (() => {
    try {
      execFileSync("git", ["rev-parse", "--git-dir"], { cwd: rootDir, stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();

  it.skipIf(!hasGit)("không có chữ Hán / CJK trong mọi tệp văn bản git theo dõi", () => {
    const { scanned, violations } = scanFiles(rootDir, trackedFiles(rootDir));
    expect(scanned).toBeGreaterThan(200); // quét thật, không rỗng
    expect(
      violations.map(
        (v: { file: string; line: number; what: string }) => `${v.file}:${v.line} ${v.what}`,
      ),
    ).toEqual([]);
  });

  it("scanFiles bắt vi phạm trong tệp thật (đột biến): ghi chữ Hán vào một tệp tạm rồi quét", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cjk-"));
    try {
      fs.writeFileSync(path.join(dir, "sach.ts"), "const a = 1;\n");
      fs.writeFileSync(path.join(dir, "ban.html"), `<div class="seal">${HAN}</div>\n`);
      fs.writeFileSync(path.join(dir, "thoat.ts"), `const t = "${BS}u4ed9";\n`);
      fs.writeFileSync(
        path.join(dir, "anh.png"),
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xe4, 0xbb, 0x99]),
      ); // nhị phân: bỏ qua
      const { scanned, violations } = scanFiles(dir, [
        "sach.ts",
        "ban.html",
        "thoat.ts",
        "anh.png",
        "khong-co.ts",
      ]);
      expect(scanned).toBe(3);
      expect(violations.map((v: { file: string }) => v.file).sort()).toEqual([
        "ban.html",
        "thoat.ts",
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
