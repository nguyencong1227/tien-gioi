import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * Quy tắc Asset của `AGENTS.md`: nhân vật phải là của Tiên Giới, không mượn tên nhân vật của truyện / game khác,
 * kể cả trong dữ liệu mẫu của chế độ `?dungeon=mock` / `?duel=mock` / `?sect=mock`, test và script chụp ảnh.
 * Test này giữ cho các tên đã dọn (QUYET_DINH_M3 mục 47, bước dọn dẹp sau #993) không quay lại `client/`.
 * Tên CHUNG CHUNG (Tiêu Dao Phái, Thanh Vân Môn, Mộc Thanh...) không nằm trong danh sách: chỉ cấm tên riêng của nhân vật.
 */
export const FOREIGN_NAMES = [
  "Trương Tiểu Phàm",
  "Tiểu Phàm",
  "Lục Tuyết Kỳ",
  "Lâm Kinh Vũ",
  "Diệp Phàm",
  "Tiêu Phong",
  "Hư Trúc",
  "Đoàn Dự",
  "Vương Ngữ Yên",
  "Tiêu Viêm",
  "Hàn Lập",
  "Đường Tam",
  "Lý Tiêu Dao",
  "Lệ Phi Vũ",
  "Nam Cung Uyển",
] as const;

/** Trả về các tên bị cấm xuất hiện trong `text` (hàm thuần để chạy được đột biến). */
export function foreignNamesIn(text: string): string[] {
  return FOREIGN_NAMES.filter((n) => text.includes(n));
}

const CLIENT_ROOT = resolve(__dirname, "..");
const REPO_ROOT = resolve(CLIENT_ROOT, "..");
/** Thư mục nguồn cần quét: client (cả scripts, index.html, public) và phần mã / test của server và shared (dữ liệu mẫu trong test cũng không được mượn tên truyện khác). */
const SCAN_ROOTS = [
  CLIENT_ROOT,
  join(REPO_ROOT, "server", "src"),
  join(REPO_ROOT, "server", "scripts"),
  join(REPO_ROOT, "shared", "src"),
];
const SCAN_EXT = /\.(ts|mjs|js|html|css|json)$/;
const SKIP_DIR = new Set(["node_modules", "dist", ".vite"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIR.has(entry)) walk(full, out);
    } else if (SCAN_EXT.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("client không dùng tên nhân vật của truyện khác", () => {
  it("hàm quét bắt từng tên trong danh sách (đối chứng để test không rỗng)", () => {
    for (const n of FOREIGN_NAMES) {
      expect(foreignNamesIn(`ví dụ ${n} đã góp`)).toContain(n);
    }
    expect(foreignNamesIn("Tô Vân Hạc, Hạ Thanh Linh, Tiêu Dao Phái, Thanh Vân Môn")).toEqual([]);
  });

  it("không tệp nào trong client/ (src, scripts, index.html, public), server/src, server/scripts, shared/src chứa tên bị cấm", () => {
    const self = join(CLIENT_ROOT, "src", "no-foreign-names.test.ts");
    // Các tệp CHÍNH thức liệt kê tên cấm (glossary-banned.ts của #1199 + test của nó) PHẢI nhắc đến tên ngoại lai để cấm / kiểm
    // chúng — giống lý do trừ chính test này. Mọi tệp KHÁC vẫn bị quét; tránh dương tính giả chứ KHÔNG nới lỏng kiểm.
    const bannedNameLists = [
      join(REPO_ROOT, "shared", "src", "glossary-banned.ts"),
      join(REPO_ROOT, "shared", "src", "glossary-banned.test.ts"),
    ];
    const files = SCAN_ROOTS.flatMap((r) => walk(r)).filter(
      (f) => f !== self && !bannedNameLists.includes(f),
    );
    expect(files.length).toBeGreaterThan(300); // quét thật, không quét hụt thư mục (~700 tệp: client, server, shared)
    const hits: string[] = [];
    for (const f of files) {
      for (const n of foreignNamesIn(readFileSync(f, "utf8"))) {
        hits.push(`${relative(REPO_ROOT, f)}: ${n}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
