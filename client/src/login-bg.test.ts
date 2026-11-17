// Nền màn đăng nhập bằng ảnh AI đầu tiên (#513): canh mã nguồn CSS. Hành vi thật (ảnh hiện, tấm đăng nhập không bị che) do ảnh chụp năm khung nhìn của `capture-viewports` kiểm.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const css = fs.readFileSync(path.join(root, "client/src/style.css"), "utf8");
const m = /body:has\(#login:not\(\[hidden\]\)\)\s*\{([^}]*)\}/.exec(css);

describe("nền màn đăng nhập (ảnh AI, #513)", () => {
  it("chỉ áp khi tấm đăng nhập đang hiện (không phủ lên màn chơi)", () => {
    expect(m).not.toBeNull();
  });

  it("trỏ tới ảnh có thật trong client/public và có JSON nguồn cùng tên", () => {
    const url = /url\("([^"]+)"\)/.exec(m![1]!)?.[1];
    expect(url).toBe("/assets/ai/login_bg.webp");
    expect(fs.existsSync(path.join(root, "client/public", url!))).toBe(true);
    expect(fs.existsSync(path.join(root, "docs/art/nguon/login_bg.json"))).toBe(true);
  });

  it("màu --ink là LỚP CUỐI (dự phòng khi ảnh chưa tải / lỗi): màn đăng nhập vẫn như cũ", () => {
    const layers = m![1]!.replace(/\s+/g, " ").trim().replace(/;$/, "");
    expect(layers.endsWith(", var(--ink)")).toBe(true);
  });

  it("ảnh phủ kín (cover), không lặp, và KHÔNG đổi tấm đăng nhập (#login vẫn có nền giấy riêng)", () => {
    expect(m![1]).toMatch(/cover/);
    expect(m![1]).toMatch(/no-repeat/);
    const login = /#login\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(login).toMatch(/background:\s*radial-gradient/);
  });

  it("không áp ảnh lên html / body ở chế độ chơi (khối `html, body` giữ nền --ink)", () => {
    const base = /html,\s*body\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(base).toMatch(/background:\s*var\(--ink\)/);
    expect(base).not.toMatch(/login_bg/);
  });
});
