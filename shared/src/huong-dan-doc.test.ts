// Test đơn giản cho tài liệu hướng dẫn người chơi docs/HUONG_DAN_NGUOI_CHOI.md (issue #886, G2).
// Không có công cụ kiểm liên kết markdown sẵn trong repo, nên tự kiểm: tệp tồn tại, không rỗng,
// đủ độ dài, các liên kết nội bộ tới docs/ khác trỏ tới tệp thật, và KHÔNG có chữ Hán (quy tắc hiển thị).
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const DOC_PATH = resolve(here, "../../docs/HUONG_DAN_NGUOI_CHOI.md");

function readDoc(): string {
  return readFileSync(DOC_PATH, "utf8");
}

// Dải chữ Hán (CJK Unified + các dải liên quan: dấu CJK, toàn giác bán giác...) — không được xuất hiện trong tài liệu tiếng Việt cho người chơi.
const CJK = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3000-\u303F\uFF00-\uFFEF]/;

describe("docs/HUONG_DAN_NGUOI_CHOI.md", () => {
  it("tồn tại và không rỗng", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
    const text = readDoc();
    expect(text.trim().length).toBeGreaterThan(200);
  });

  it("đủ độ dài để coi là hướng dẫn đầy đủ (>= 1500 ký tự)", () => {
    expect(readDoc().length).toBeGreaterThanOrEqual(1500);
  });

  it("không chứa chữ Hán / ký tự CJK", () => {
    expect(CJK.test(readDoc())).toBe(false);
  });

  it("các liên kết nội bộ tới docs/ trỏ tới tệp thật", () => {
    const text = readDoc();
    // Bắt [mô tả](đường-dẫn) — chỉ xét liên kết không phải ảnh (![...]) và không phải liên kết neo thuần (#...)
    const links = [...text.matchAll(/\]\((?!#)([^)\s]+)\)/g)].map((m) => m[1]);
    for (const raw of links) {
      // bỏ neo nếu có (#anchor)
      const path = raw.split("#")[0];
      // chỉ kiểm liên kết tương đối tới docs/ hoặc tệp trong repo; bỏ qua http(s) và mailto
      if (!path || /^https?:/.test(path) || /^mailto:/.test(path)) continue;
      // Liên kết markdown tương đối so với THƯ MỤC của chính tài liệu (docs/), không phải gốc repo
      const target = resolve(dirname(DOC_PATH), path);
      expect(existsSync(target)).toBe(true);
    }
  });
});
