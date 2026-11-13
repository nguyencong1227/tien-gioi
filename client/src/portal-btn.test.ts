import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAPS } from "@tien-gioi/shared";
import { PORTAL_BTN_LABEL, portalBtnText } from "./portal-btn";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf-8");

describe("portalBtnText (nhãn nút Qua cổng)", () => {
  it("nhãn trong nút CỐ ĐỊNH và ngắn (vừa dây cung nút tròn 58 px: tối đa 6 ký tự ở cỡ 10 px), không chứa tên cổng", () => {
    expect(PORTAL_BTN_LABEL.length).toBeLessThanOrEqual(6);
    for (const def of MAPS) {
      for (const portal of def.portals ?? []) {
        const t = portalBtnText(portal.name);
        expect(t.label, `${def.id}/${portal.id}`).toBe(PORTAL_BTN_LABEL);
        expect(t.label).not.toContain(portal.name);
      }
    }
  });

  it("dữ liệu thật: tên MỌI cổng của MỌI bản đồ nằm ở title và aria-label, kèm phím F", () => {
    let n = 0;
    for (const def of MAPS) {
      for (const portal of def.portals ?? []) {
        const t = portalBtnText(portal.name);
        expect(t.title, portal.id).toBe(`Đi qua ${portal.name} (F)`);
        expect(t.aria, portal.id).toBe(`Đi qua ${portal.name} (Phím F)`);
        n++;
      }
    }
    expect(n).toBeGreaterThanOrEqual(4); // Lạc Hà, Hắc Phong (hai cổng), Âm Sương
  });

  it("tên rỗng / toàn khoảng trắng / sai kiểu: chữ chung, không in 'undefined' / 'null' / '[object'", () => {
    for (const bad of [undefined, null, "", "   ", 5, {}, []]) {
      const t = portalBtnText(bad);
      for (const s of [t.label, t.title, t.aria])
        expect(s, String(bad)).not.toMatch(/undefined|null|\[object|NaN/);
      expect(t.title).toBe("Đi qua cổng truyền tống (F)");
    }
    expect(portalBtnText("  Bắc Môn Quan  ").title).toBe("Đi qua Bắc Môn Quan (F)");
  });
});

describe("nút Qua cổng nối với ui.ts / index.html / style.css", () => {
  it("ui.ts đặt nhãn, title và aria-label bằng portalBtnText, không còn ghi `${tên} (F)` vào nhãn", () => {
    const ui = read("./ui.ts");
    expect(ui).toContain("portalBtnText(label)");
    expect(ui).toContain('$("portal-label").textContent = t.label;');
    expect(ui).not.toMatch(/portal-label"\)\.textContent = `\$\{label\}/);
  });

  it("nhãn mặc định trong index.html khớp nhãn cố định (trạng thái chưa gọi portalPrompt cũng không bị cắt)", () => {
    expect(read("../index.html")).toContain(`<small id="portal-label">${PORTAL_BTN_LABEL}</small>`);
  });

  it("điện thoại dọc thấp: nút cổng dời sang cột thứ hai ngang hàng nút nói chuyện (khỏi bị thanh Nhiệm vụ đè)", () => {
    const css = read("./style.css");
    const m = css.match(
      /@media \(orientation: portrait\) and \(max-height: (\d+)px\) \{\s*#btn-portal \{([^}]*)\}/,
    );
    expect(m, "thiếu khối @media dời #btn-portal").not.toBeNull();
    // Đỉnh nút cổng ở ô thứ ba cách đáy 14 + 194 + 58 = 266 px; thanh Nhiệm vụ kết thúc ~418 px: chồng khi chiều cao < 684 px
    expect(Number(m![1])).toBeGreaterThanOrEqual(684);
    expect(m![2]).toContain("168px + 58px + 8px"); // cột thứ hai: bên trái cột một (rộng 58 px) cách 8 px
    expect(m![2]).toContain("+ 128px"); // cùng hàng với nút nói chuyện
  });
});
