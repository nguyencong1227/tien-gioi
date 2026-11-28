// Danh sách chiêu của bảng Công pháp trên điện thoại (87 chiêu, rà giao diện 25/11): bỏ trần 440 px để lấp chỗ còn lại, máy tính giữ trần.
// Đo thật (shot / rà soát bằng Chrome): 390x844 danh sách 440 -> 542 px, 412x915 440 -> 613 px, khoảng trống dưới danh sách về đều 80 px (chỗ nút Đóng).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./style.css", import.meta.url), "utf-8");

/** Thân khối của MỘT quy tắc có bộ chọn đúng bằng `selector` (đứng sau dấu đóng khối `}` hoặc sau dấu đóng một chú thích CSS; không nhận bộ chọn dài hơn chứa nó). */
function ruleBody(selector: string): string | null {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = css.match(new RegExp(`(?:^|[}/])\\s*${esc}\\s*\\{([^}]*)\\}`));
  return m ? m[1] : null;
}

describe("danh sách chiêu (bảng Công pháp): trần chiều cao theo thiết bị", () => {
  it("máy tính giữ trần 440 px (danh sách cuộn riêng dưới ô lọc)", () => {
    const body = ruleBody(".skills-list");
    expect(body, "thiếu quy tắc .skills-list").not.toBeNull();
    expect(body).toMatch(/max-height:\s*440px/);
    expect(body).toMatch(/overflow-y:\s*auto/);
  });

  it("điện thoại bỏ trần để danh sách lấp chỗ còn lại, nhưng VẪN cuộn riêng (ô lọc không trôi mất)", () => {
    const body = ruleBody('html[data-form="phone"] .skills-list');
    expect(body, 'thiếu quy tắc html[data-form="phone"] .skills-list').not.toBeNull();
    expect(body).toMatch(/max-height:\s*none/);
    // KHÔNG đặt overflow: visible như nhiệm vụ / cửa hàng: cuộn cả tấm làm ô tìm trôi mất giữa 87 hàng
    expect(body).not.toMatch(/overflow(-y)?:\s*visible/);
  });
});

describe("bảng Công pháp ở màn ngang thấp (844x390): đủ chỗ cho 4 nút ô của chiêu vừa mở", () => {
  it("thanh lọc bỏ khoảng cách dưới ở màn thấp (trả lại 8 px sau khi tiêu đề tấm không còn co, check-skills-panel khung mobile-l)", () => {
    const body = ruleBody("#skills-modal.sk-has-filter .sk-filter");
    expect(body, "thiếu quy tắc #skills-modal.sk-has-filter .sk-filter").not.toBeNull();
    expect(body).toMatch(/margin-bottom:\s*0/);
    // quy tắc phải nằm trong @media (max-height: 520px), không áp cho mọi màn
    const at = css.indexOf("#skills-modal.sk-has-filter .sk-filter {");
    const media = css.lastIndexOf("@media", at);
    expect(css.slice(media, at)).toMatch(/^@media \(max-height:\s*520px\)/);
  });
});
