import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Điều khoản sử dụng + bản quyền (QUYET_DINH_M3 mục 59.1, chống sao chép / dùng ké): trang `terms.html` có đủ ý, không còn chỗ trống,
// và trò chơi dẫn tới nó ở MÀN ĐĂNG NHẬP (mọi view) lẫn Cài đặt.
const PUBLIC = resolve(__dirname, "../public");
const INDEX = resolve(__dirname, "../index.html");

/** Kiểm nội dung trang điều khoản: trả về danh sách lỗi (rỗng là đạt). Tách hàm để thử đột biến. */
export function validateTermsHtml(html: string): string[] {
  const errors: string[] = [];
  if (!/Bản quyền thuộc chủ dự án/.test(html)) errors.push("thiếu câu 'Bản quyền thuộc chủ dự án'");
  if (!/không được sao chép/i.test(html)) errors.push("thiếu 'không được sao chép'");
  if (!/phân phối/i.test(html)) errors.push("thiếu 'phân phối'");
  if (!/href="notices\.html"/.test(html)) errors.push("thiếu liên kết tới notices.html");
  if (!/href="privacy\.html"/.test(html)) errors.push("thiếu liên kết tới privacy.html");
  if (/\[[^\]]*(người dùng điền|điền)[^\]]*\]/i.test(html)) errors.push("còn chỗ trống chưa điền");
  if (/class="placeholder"/.test(html)) errors.push("còn phần tử class=placeholder");
  // Liên kết mở tab mới phải kèm rel=noopener (không để trang đích điều khiển trang này)
  for (const m of html.matchAll(/<a\s[^>]*target="_blank"[^>]*>/g)) {
    if (!/rel="[^"]*noopener/.test(m[0]))
      errors.push(`liên kết target=_blank thiếu rel=noopener: ${m[0]}`);
  }
  return errors;
}

/** Phần tử có `id` trong `index.html` (từ thẻ mở tới thẻ đóng `p` kế tiếp) phải dẫn tới `terms.html` bằng liên kết đúng cách. */
export function legalLinkErrors(index: string, id: string): string[] {
  const at = index.indexOf(`id="${id}"`);
  if (at < 0) return [`thiếu phần tử #${id}`];
  const block = index.slice(at, index.indexOf("</p>", at));
  const errors: string[] = [];
  if (!/<a\s[^>]*href="terms\.html"[^>]*>/.test(block))
    errors.push(`#${id}: thiếu liên kết terms.html`);
  for (const m of block.matchAll(/<a\s[^>]*target="_blank"[^>]*>/g)) {
    if (!/rel="[^"]*noopener/.test(m[0])) errors.push(`#${id}: target=_blank thiếu rel=noopener`);
  }
  return errors;
}

describe("client/public/terms.html", () => {
  const html = readFileSync(resolve(PUBLIC, "terms.html"), "utf-8");

  it("trang thật đủ ý, không còn chỗ trống", () => {
    expect(validateTermsHtml(html)).toEqual([]);
  });

  it("đột biến: bỏ câu bản quyền / liên kết / rel=noopener / trả chỗ trống thì validator phải đỏ", () => {
    expect(validateTermsHtml(html.replace("Bản quyền thuộc chủ dự án", "Bản quyền"))).not.toEqual(
      [],
    );
    expect(validateTermsHtml(html.replaceAll("không được sao chép", "được chia sẻ"))).not.toEqual(
      [],
    );
    expect(validateTermsHtml(html.replace('href="notices.html"', 'href="x.html"'))).not.toEqual([]);
    expect(validateTermsHtml(html.replace('href="privacy.html"', 'href="x.html"'))).not.toEqual([]);
    expect(validateTermsHtml(html.replace(/ rel="noopener noreferrer"/, ""))).not.toEqual([]);
    expect(validateTermsHtml(`${html}<p>[liên hệ do người dùng điền]</p>`)).not.toEqual([]);
  });
});

describe("index.html dẫn tới điều khoản", () => {
  const index = readFileSync(INDEX, "utf-8");

  it("màn đăng nhập (#login-legal, nằm TRONG #login, ngoài mọi view) và Cài đặt (#set-legal) đều có liên kết terms.html + privacy.html", () => {
    expect(legalLinkErrors(index, "login-legal")).toEqual([]);
    expect(legalLinkErrors(index, "set-legal")).toEqual([]);
    const login = index.indexOf('id="login-legal"');
    const section = index.lastIndexOf('<section id="login"', login);
    const close = index.indexOf("</section>", section);
    expect(section).toBeGreaterThan(-1);
    expect(login).toBeGreaterThan(section);
    expect(login).toBeLessThan(close);
    for (const id of ["login-legal", "set-legal"]) {
      const at = index.indexOf(`id="${id}"`);
      expect(index.slice(at, index.indexOf("</p>", at))).toContain('href="privacy.html"');
    }
  });

  it("đột biến: bỏ liên kết hoặc rel=noopener ở màn đăng nhập thì kiểm phải đỏ", () => {
    expect(
      legalLinkErrors(index.replace('href="terms.html"', 'href="x.html"'), "login-legal"),
    ).not.toEqual([]);
    expect(
      legalLinkErrors(index.replace('id="login-legal"', 'id="khac"'), "login-legal"),
    ).not.toEqual([]);
    const noRel = index.replace(/(<a href="terms\.html" target="_blank") rel="noopener"/, "$1");
    expect(noRel).not.toBe(index);
    expect(
      legalLinkErrors(noRel, "login-legal").length + legalLinkErrors(noRel, "set-legal").length,
    ).toBeGreaterThan(0);
  });
});
