// Canh MÃ NGUỒN cho ô tìm món ở tab Mua của cửa hàng (rà giao diện 25/11): phần hành vi thật (gõ phím thật, vẽ lại, Esc, cuộn trên điện thoại) kiểm bằng Chrome thật.
// Test này giữ các mối nối (HTML <-> ui.ts <-> CSS) để ai sửa sau không vô tình làm mất ô tìm hoặc để nó trôi mất khi cuộn trên điện thoại.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const ui = readFileSync(new URL("./ui.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");

/** Thân khối của MỘT quy tắc CSS có bộ chọn đúng bằng `selector` (đứng sau `}` hoặc dấu đóng chú thích). */
function ruleBody(selector: string): string | null {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = css.match(new RegExp(`(?:^|[}/])\\s*${esc}\\s*\\{([^}]*)\\}`));
  return m ? m[1] : null;
}

/** Thân hàm `function name(` trong ui.ts (từ chữ ký tới `\n}` đầu tiên). */
function fnBody(name: string): string {
  const start = ui.indexOf(`function ${name}(`);
  expect(start, `không thấy hàm ${name}`).toBeGreaterThan(0);
  return ui.slice(start, ui.indexOf("\n}\n", start));
}

describe("HTML: thanh tìm món nằm giữa hai thẻ Mua / Bán và danh sách", () => {
  it("có đủ phần tử, thanh và 'không khớp' mặc định ẩn (ui.ts quyết định hiện)", () => {
    expect(html).toMatch(/id="shop-filter"[^>]*\shidden/);
    expect(html).toMatch(/<input[^>]*id="shop-q"[^>]*type="search"/);
    expect(html).toMatch(/id="shop-filter-clear"[^>]*\shidden/);
    expect(html).toMatch(/id="shop-count"[^>]*aria-live="polite"/);
    expect(html).toMatch(/id="shop-nomatch"[^>]*\shidden/);
  });
  it("ô tìm có giới hạn độ dài và nhãn đọc được cho trình đọc màn hình", () => {
    expect(html).toMatch(/id="shop-q"[^>]*maxlength="64"/);
    expect(html).toMatch(/id="shop-q"[^>]*aria-label="[^"]+"/);
  });
  it("thứ tự: thẻ tab -> thanh tìm -> dòng không khớp -> danh sách mua", () => {
    const at = (s: string) => html.indexOf(s);
    expect(at('id="tab-shop-buy"')).toBeLessThan(at('id="shop-filter"'));
    expect(at('id="shop-filter"')).toBeLessThan(at('id="shop-nomatch"'));
    expect(at('id="shop-nomatch"')).toBeLessThan(at('id="shop-buy-list"'));
  });
});

describe("ui.ts: nối ô tìm vào vẽ lại danh sách mua", () => {
  it("danh sách mua vẽ theo filterShopIds, chỉ khi cửa hàng đủ SHOP_FILTER_MIN món", () => {
    const body = fnBody("renderShopBuyImpl");
    expect(body).toContain("SHOP_FILTER_MIN");
    expect(body).toMatch(/filterShopIds\(\s*shop\.itemIds,\s*shopQuery/);
    expect(body).toMatch(/for \(const itemId of shownIds\)/);
    // KHÔNG còn vòng lặp thẳng trên shop.itemIds (sẽ bỏ qua bộ lọc)
    expect(body).not.toMatch(/for \(const itemId of shop\.itemIds\)/);
  });
  it("cửa hàng rỗng cũng ẩn thanh (không để thanh của cửa hàng trước)", () => {
    expect(fnBody("renderShopBuyImpl")).toMatch(/renderShopFilterBar\(false,\s*0,\s*0\)/);
  });
  it("thanh tìm: dòng đếm, nút Bỏ lọc, dòng không khớp đều cập nhật theo số món hiện", () => {
    const body = fnBody("renderShopFilterBar");
    expect(body).toContain("shopFilterSummary(shown, total, active)");
    expect(body).toMatch(/shop-filter-clear"\)\.hidden = !active/);
    expect(body).toMatch(/shop-nomatch"\)\.hidden = !\(show && total > 0 && shown === 0\)/);
  });
  it("tab Bán ẩn thanh tìm và dòng không khớp", () => {
    const body = fnBody("renderShopModal");
    expect(body).toMatch(/shop-filter"\)\.hidden = true/);
    expect(body).toMatch(/shop-nomatch"\)\.hidden = true/);
  });
  it("chuỗi gõ đi qua cleanShopQuery rồi vẽ lại; Esc xoá chữ trước khi đóng bảng", () => {
    const body = fnBody("bindShopFilter");
    expect(body).toContain("cleanShopQuery(input.value)");
    expect(body).toContain("renderShopBuy()");
    expect(body).toMatch(/e\.key !== "Escape"/);
    expect(body).toMatch(/e\.stopPropagation\(\)/);
  });
  it("mở cửa hàng nào cũng bắt đầu không lọc (chuỗi cũ không giấu món cửa hàng khác)", () => {
    const start = ui.indexOf("toggleShopModal(force?: boolean) {");
    expect(start).toBeGreaterThan(0);
    const body = ui.slice(start, ui.indexOf("\n  },", start));
    expect(body).toMatch(/shopQuery = ""/);
    expect(body).toMatch(/shop-q"\)[^;]*\n?[^;]*value = ""|q\.value = ""/);
    // đặt lại TRƯỚC khi vẽ
    expect(body.indexOf('shopQuery = ""')).toBeLessThan(body.indexOf("renderShopModal()"));
  });
  it("bindShopFilter được gọi lúc dựng giao diện", () => {
    expect(ui).toMatch(/^\s*bindShopFilter\(\);/m);
  });
});

describe("CSS: thanh tìm dính đầu tấm trên điện thoại (cả tấm cuộn)", () => {
  it("điện thoại: position sticky, top 0, nền đặc, nằm trên thẻ cuộn qua", () => {
    const body = ruleBody('html[data-form="phone"] .shop-filter');
    expect(body, 'thiếu quy tắc html[data-form="phone"] .shop-filter').not.toBeNull();
    expect(body).toMatch(/position:\s*sticky/);
    expect(body).toMatch(/top:\s*0/);
    expect(body).toMatch(/z-index:\s*[1-9]/);
    expect(body).toMatch(/background:\s*#181512/); // cùng màu nền tấm điện thoại (sheet.css)
    expect(body).toMatch(/box-shadow:\s*0 -12px 0 #181512/); // phủ dải đệm trên 12 px của tấm
  });
  it("máy tính: KHÔNG dính (danh sách tự cuộn riêng dưới thanh)", () => {
    const body = ruleBody(".shop-filter");
    expect(body).not.toBeNull();
    expect(body).not.toMatch(/sticky/);
  });
  it("ô tìm cao >= 44 px (chạm được); màn thấp đưa dòng đếm lên cùng hàng", () => {
    expect(ruleBody(".shop-q")).toMatch(/min-height:\s*44px/);
    expect(css).toMatch(/@media \(max-height: 520px\) \{\s*\.shop-count \{[^}]*order:\s*2/);
  });
});
