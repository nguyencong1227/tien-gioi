import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Phông tự lưu (M5.1, #331): không còn gọi Google Fonts, mọi tệp phông được khai báo và có thật.
const root = path.resolve(__dirname, "../..");
const html = fs.readFileSync(path.join(root, "client/index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "client/src/fonts.css"), "utf8");
const fontsDir = path.join(root, "client/public/fonts");

const faces = css.match(/@font-face\s*{[^}]*}/g) ?? [];
const urlsOf = (text: string) =>
  [...text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((m) => m[1]);

describe("phông Noto Serif tự lưu (#331)", () => {
  it("index.html không gọi tên miền ngoài cho phông / CSS / script (hết lộ IP cho Google, chạy được ngoại tuyến)", () => {
    expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic/i);
    // mọi <link href> / <script src> phải là đường dẫn cùng nguồn (không http://, https://, //)
    const refs = [...html.matchAll(/<(?:link|script)\b[^>]*?\b(?:href|src)="([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(refs.length).toBeGreaterThan(5);
    expect(refs.filter((r) => /^(?:[a-z]+:)?\/\//i.test(r))).toEqual([]);
  });

  it("fonts.css: bốn mặt chữ (đứng / nghiêng x vietnamese / latin), họ 'Noto Serif', font-display: swap, đã khai khoảng ký tự", () => {
    expect(faces).toHaveLength(4);
    for (const f of faces) {
      expect(f).toMatch(/font-family:\s*"Noto Serif"/);
      expect(f).toMatch(/font-display:\s*swap/);
      expect(f).toMatch(/unicode-range:/);
      expect(f).toMatch(/font-weight:\s*400 700/);
    }
    const styles = faces.map((f) => /font-style:\s*(\w+)/.exec(f)?.[1]).sort();
    expect(styles).toEqual(["italic", "italic", "normal", "normal"]);
    // tập con tiếng Việt phải phủ Đ đ Ơ ơ Ư ư và dải Latin mở rộng bổ sung (ạ ả ấ ... ỹ)
    const vi = faces.filter((f) => /vietnamese/.test(f)).join("\n");
    for (const range of ["U+0110-0111", "U+01A0-01A1", "U+01AF-01B0", "U+1EA0-1EF9"]) {
      expect(vi).toContain(range);
    }
  });

  it("mọi url() trong fonts.css trỏ tới tệp có thật trong client/public/fonts, và tệp phông nào cũng được dùng", () => {
    const urls = urlsOf(css);
    expect(urls).toHaveLength(4);
    for (const u of urls) {
      expect(u.startsWith("/fonts/")).toBe(true);
      expect(fs.existsSync(path.join(root, "client/public", u))).toBe(true);
    }
    const used = new Set(urls.map((u) => path.basename(u)));
    const onDisk = fs.readdirSync(fontsDir).filter((n) => n.endsWith(".woff2"));
    expect(onDisk.sort()).toEqual([...used].sort());
    // OFL yêu cầu giấy phép đi kèm bản phân phối
    expect(fs.existsSync(path.join(fontsDir, "OFL.txt"))).toBe(true);
  });

  it("index.html nạp fonts.css và tải trước hai tệp thân đứng (crossorigin, đúng kiểu), tệp tải trước có thật", () => {
    expect(html).toContain('href="/src/fonts.css"');
    const preloads = [...html.matchAll(/<link\b[^>]*rel="preload"[^>]*>/g)].map((m) => m[0]);
    const fonts = preloads.filter((p) => /as="font"/.test(p));
    expect(fonts).toHaveLength(2);
    for (const p of fonts) {
      expect(p).toMatch(/type="font\/woff2"/);
      expect(p).toMatch(/\bcrossorigin\b/);
      const href = /href="([^"]+)"/.exec(p)![1];
      expect(fs.existsSync(path.join(root, "client/public", href))).toBe(true);
      expect(href).toMatch(/wght-normal\.woff2$/);
    }
  });

  it("tệp phông nhỏ gọn: mỗi tệp < 64 KB, cả bộ < 160 KB (không kéo thêm latin-ext ~187 KB)", () => {
    const sizes = fs
      .readdirSync(fontsDir)
      .filter((n) => n.endsWith(".woff2"))
      .map((n) => fs.statSync(path.join(fontsDir, n)).size);
    for (const s of sizes) expect(s).toBeLessThan(64 * 1024);
    expect(sizes.reduce((a, b) => a + b, 0)).toBeLessThan(160 * 1024);
  });
});
