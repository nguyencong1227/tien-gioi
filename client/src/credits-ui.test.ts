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
