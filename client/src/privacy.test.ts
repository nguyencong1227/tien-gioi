import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Trang quyền riêng tư là bắt buộc khi đưa app lên cửa hàng: chặn phát hành lại với chỗ trống chưa điền.
const HTML_PATH = resolve(__dirname, "../public/privacy.html");

/** Kiểm nội dung trang: trả về danh sách lỗi (rỗng là đạt). Tách hàm để thử đột biến. */
export function validatePrivacyHtml(html: string): string[] {
  const errors: string[] = [];
  if (/\[[^\]]*(người dùng điền|điền)[^\]]*\]/i.test(html))
    errors.push("còn chỗ trống chưa điền, vd [liên hệ do người dùng điền]");
  if (/class="placeholder"/.test(html)) errors.push("còn phần tử class=placeholder");
  // Mục liên hệ phải có ít nhất một liên kết https (kênh nhận yêu cầu xoá dữ liệu)
  const contact = html.split(/<h2>\s*4\./)[1] ?? "";
  if (!/<a\s[^>]*href="https:\/\/[^"]+"/.test(contact))
    errors.push("mục 4 (Thông tin liên hệ) chưa có liên kết https");
  // Liên kết mở tab mới phải kèm rel=noopener (không để trang đích điều khiển trang này)
  for (const m of html.matchAll(/<a\s[^>]*target="_blank"[^>]*>/g)) {
    if (!/rel="[^"]*noopener/.test(m[0]))
      errors.push(`liên kết target=_blank thiếu rel=noopener: ${m[0]}`);
  }
  return errors;
}

describe("client/public/privacy.html (mục liên hệ)", () => {
  const html = readFileSync(HTML_PATH, "utf-8");

  it("trang thật không còn chỗ trống, có liên kết liên hệ https đúng cách", () => {
    expect(validatePrivacyHtml(html)).toEqual([]);
  });

  it("liên hệ trỏ tới trang Facebook của nhà phát triển (người dùng cung cấp 13/11/2026)", () => {
    expect(html).toContain('href="https://www.facebook.com/CongKudo.a/"');
  });

  it("đột biến: trả lại chỗ trống hoặc bỏ liên kết thì validator phải đỏ", () => {
    expect(
      validatePrivacyHtml(
        html.replace(/<a\s[^>]*facebook[\s\S]*?<\/a\s*>/, "[liên hệ do người dùng điền]"),
      ),
    ).not.toEqual([]);
    expect(validatePrivacyHtml(html.replace(/ rel="noopener noreferrer"/, ""))).not.toEqual([]);
    expect(validatePrivacyHtml(html.replace("<h2>4.", '<h2 class="placeholder">4.'))).not.toEqual(
      [],
    );
  });

  it("đột biến: phần tử class=placeholder và mục liên hệ không có liên kết đều bị bắt", () => {
    const errs = validatePrivacyHtml(
      '<h2>4. Thông tin liên hệ</h2><p class="placeholder">[liên hệ do người dùng điền]</p>',
    );
    expect(errs.length).toBeGreaterThanOrEqual(3);
  });
});
