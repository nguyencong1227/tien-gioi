// Dòng ghi công trong game (M7.16, #517, QUYET_DINH_M3 mục 19-20): người phát triển Vạn Kiếp Tu Tiên đã cho phép dùng nội dung, hình ảnh, âm thanh với
// điều kiện ghi công. Dòng này nằm ở Cài đặt (Giới thiệu và ghi công), và PHẢI giống y câu đã chốt ở `docs/NGUON_NOI_DUNG.md` mục 1: sửa một nơi mà
// quên nơi kia thì đỏ; lỡ xoá khỏi giao diện thì đỏ.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const html = fs.readFileSync(path.join(ROOT, "client/index.html"), "utf-8");
const doc = fs.readFileSync(path.join(ROOT, "docs/NGUON_NOI_DUNG.md"), "utf-8");
const uiSrc = fs.readFileSync(path.join(ROOT, "client/src/ui.ts"), "utf-8");
const viteCfg = fs.readFileSync(path.join(ROOT, "client/vite.config.ts"), "utf-8");

/** Gỡ thẻ HTML và gộp khoảng trắng: so câu chữ, không so xuống dòng / thụt lề. */
const text = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Câu ghi công đã chốt: đoạn trong ngoặc kép sau "**Lời ghi công trong game**" ở NGUON_NOI_DUNG.md mục 1. */
function creditSentence(): string {
  const m = doc.match(/\*\*Lời ghi công trong game\*\*[^"]*"([^"]+)"/);
  if (!m) throw new Error("Không tìm thấy 'Lời ghi công trong game' trong docs/NGUON_NOI_DUNG.md");
  return m[1].trim();
}

function aboutSection(): string {
  const i = html.indexOf('id="set-about"');
  expect(i, "thiếu khối #set-about").toBeGreaterThan(0);
  const start = html.lastIndexOf("<section", i);
  const end = html.indexOf("</section>", i);
  return html.slice(start, end + "</section>".length);
}

describe("Ghi công trong game (Giới thiệu và ghi công ở Cài đặt)", () => {
  it("khối nằm TRONG hộp Cài đặt (không lẻ ra ngoài)", () => {
    const settingsStart = html.indexOf('id="settings-modal"');
    const settingsEnd = html.indexOf("</section>", html.indexOf('id="btn-logout"'));
    const aboutAt = html.indexOf('id="set-about"');
    expect(settingsStart).toBeGreaterThan(0);
    expect(aboutAt).toBeGreaterThan(settingsStart);
    expect(aboutAt).toBeLessThan(settingsEnd);
  });

  it("câu ghi công trong giao diện GIỐNG Y câu đã chốt ở docs/NGUON_NOI_DUNG.md", () => {
    const sentence = creditSentence();
    expect(sentence.length).toBeGreaterThan(40);
    expect(text(aboutSection())).toContain(sentence);
  });

  it("nêu đủ nội dung, hình ảnh, âm thanh, tên trò chơi, tác giả và sự cho phép", () => {
    const t = text(aboutSection());
    for (const must of [
      "nội dung",
      "hình ảnh",
      "âm thanh",
      "Vạn Kiếp Tu Tiên",
      "Hải Quân · Bắc Team",
      "sự cho phép của tác giả",
    ])
      expect(t, `thiếu "${must}"`).toContain(must);
  });

  it("không có chữ Hán / CJK trong khối (quyết định mục 19-20: tiếng Việt, không chữ Hán)", () => {
    expect(aboutSection()).not.toMatch(
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}]/u,
    );
  });

  it("số phiên bản lấy từ package.json gốc qua vite define, và được ghi vào #set-version", () => {
    expect(html).toContain('id="set-version"');
    expect(viteCfg).toMatch(/__APP_VERSION__:\s*JSON\.stringify\(appVersion\)/);
    expect(viteCfg).toContain("../package.json");
    expect(uiSrc).toMatch(/\$\("set-version"\)\.textContent\s*=/);
    expect(uiSrc).toContain("__APP_VERSION__");
  });
});

describe("Thông báo giấy phép MIT của thư viện bên thứ ba (Phaser, colyseus.js, @colyseus/schema)", () => {
  const notices = fs.readFileSync(path.join(ROOT, "client/public/notices.html"), "utf-8");
  const credits = fs.readFileSync(path.join(ROOT, "CREDITS.md"), "utf-8");
  const clientPkg = JSON.parse(fs.readFileSync(path.join(ROOT, "client/package.json"), "utf-8"));
  /** Dòng "Copyright (c) ..." trong tệp giấy phép CỦA GÓI ĐANG CÀI (đổi gói / đổi năm thì notices.html phải theo). */
  const copyrightOf = (pkg: string, file: string) => {
    const t = fs.readFileSync(path.join(ROOT, "node_modules", pkg, file), "utf-8");
    const m = t.match(/^Copyright \(c\).*$/m);
    if (!m) throw new Error(`không thấy dòng Copyright ở ${pkg}/${file}`);
    return m[0].trim();
  };

  it("notices.html giữ NGUYÊN dòng bản quyền và đoạn cấp phép MIT của từng gói (lấy từ tệp giấy phép thật trong node_modules)", () => {
    for (const [pkg, file] of [
      ["phaser", "LICENSE.md"],
      ["colyseus.js", "LICENSE"],
      ["@colyseus/schema", "LICENSE"],
    ] as const) {
      expect(notices, pkg).toContain(copyrightOf(pkg, file));
    }
    // đoạn bắt buộc của MIT ("The above copyright notice ... shall be included") có đủ ba lần
    const must = "The above copyright notice and this permission notice shall be included";
    expect(notices.split(must).length - 1).toBe(3);
    expect(notices).toContain('THE SOFTWARE IS PROVIDED "AS IS"');
  });

  it("Cài đặt nêu Phaser, colyseus.js, MIT và liên kết tới notices.html (mở được trong tab mới, không lộ window.opener)", () => {
    const section = aboutSection();
    const t = text(section);
    for (const must of ["Phaser 3", "Richard Davey", "colyseus.js", "Endel Dreyer", "MIT"])
      expect(t, must).toContain(must);
    const flat = section.replace(/\s+/g, " "); // prettier có thể xuống dòng giữa các thuộc tính
    expect(flat).toMatch(/<a href="notices\.html" target="_blank" rel="noopener" ?>/);
    expect(section).toContain('id="set-credit-libs"');
  });

  it("CREDITS.md mục 5b liệt kê ba gói với giấy phép MIT và khớp phiên bản ở client/package.json", () => {
    expect(credits).toContain("### 5b. Thư viện chạy trong trình duyệt");
    const sec = credits.slice(credits.indexOf("### 5b."));
    const row = (pkg: string) => sec.split("\n").find((l) => l.startsWith(`| \`${pkg}\``)) ?? "";
    expect(row("phaser")).toContain(clientPkg.dependencies.phaser);
    expect(row("phaser")).toContain("**MIT**");
    expect(row("colyseus.js")).toContain(clientPkg.dependencies["colyseus.js"]);
    expect(row("colyseus.js")).toContain("**MIT**");
    expect(row("@colyseus/schema")).toContain("**MIT**");
    expect(sec).toContain("client/public/notices.html");
  });

  it("notices.html ghi đúng phiên bản của Phaser và colyseus.js trong tiêu đề mục", () => {
    expect(notices).toContain(`phaser@${clientPkg.dependencies.phaser}`);
    expect(notices).toContain(`colyseus.js@${clientPkg.dependencies["colyseus.js"]}`);
  });

  it("không chữ Hán / CJK trong notices.html", () => {
    expect(notices).not.toMatch(
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}]/u,
    );
  });
});
