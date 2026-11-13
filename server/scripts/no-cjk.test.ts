// Không chữ Hán / chữ Trung Quốc (và kana, hangul) trong mã nguồn: mọi chữ người chơi nhìn thấy phải là tiếng Việt
// hoặc biểu tượng vẽ (QUYET_DINH_M3 mục 12). Quét `client/`, `shared/`, `server/`, `app/` để lỗi này không tái diễn.
// Cần thử ký tự CJK trong test thì viết bằng mã thoát (vd "\u843d" hay "\u{20000}"), đừng dán thẳng ký tự vào tệp.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "../..");

/** Thư mục gốc được quét. */
const SCAN_DIRS = ["client", "shared", "server", "app"];
/** Tên thư mục không quét ở BẤT KỲ cấp nào: chỉ những tên chắc chắn là sản phẩm sinh ra / phụ thuộc, không bao giờ là mã nguồn. */
const SKIP_DIRS = new Set(["node_modules", "dist", ".gradle", ".vite"]);
/**
 * Đường dẫn cụ thể (từ gốc repo) không quét. Ghim đúng đường dẫn thay vì tên chung (`data`, `build`) để thư mục mã nguồn sau này
 * trùng tên (vd `shared/src/data/`) không bị bỏ qua âm thầm:
 *  - `server/data`: hồ sơ người chơi lúc chạy (đạo hiệu do người dùng đặt, không phải mã nguồn);
 *  - `app/android/app/build`: sản phẩm dựng của Gradle;
 *  - `app/android/app/src/main/assets/public`: bản sao `client/dist` do `cap sync` chép vào dự án Android (git bỏ qua, sinh lại mỗi lần dựng).
 */
const SKIP_PATHS = [
  "server/data",
  "app/android/app/build",
  "app/android/app/src/main/assets/public",
];
/** Chỉ quét tệp văn bản (ảnh, phông, jar... bỏ qua vì byte ngẫu nhiên có thể giống CJK). */
const TEXT_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".html",
  ".css",
  ".svg",
  ".md",
  ".webmanifest",
  ".txt",
  ".yml",
  ".yaml",
  ".gradle",
  ".xml",
  ".properties",
  ".sh",
]);

/** Chữ Hán, kana, hangul, bopomofo, dấu câu CJK (U+3000-303F) và dạng toàn chiều (U+FF00-FFEF). */
const CJK =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}\u3000-\u303f\uff00-\uffef]/u;

export interface CjkHit {
  line: number;
  col: number;
  char: string;
}

/** Mọi ký tự CJK trong `text` (dòng / cột tính từ 1). Hàm thuần để test. */
export function findCjk(text: string): CjkHit[] {
  const hits: CjkHit[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    let col = 0;
    for (const ch of lines[i]) {
      col++;
      if (CJK.test(ch)) hits.push({ line: i + 1, col, char: ch });
    }
  }
  return hits;
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      const rel = path.relative(rootDir, full).split(path.sep).join("/");
      if (!SKIP_DIRS.has(entry) && !SKIP_PATHS.includes(rel)) out.push(...listFiles(full));
    } else if (TEXT_EXT.has(path.extname(entry).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

const files = SCAN_DIRS.map((d) => path.join(rootDir, d)).flatMap(listFiles);

describe("findCjk", () => {
  it("bắt chữ Hán, kana, hangul, dấu câu CJK và ký tự toàn chiều", () => {
    // Viết bằng mã thoát để tệp này không tự chứa ký tự CJK
    expect(findCjk("a\u8eabb").map((h) => h.char)).toEqual(["\u8eab"]);
    expect(findCjk("\u3042").length).toBe(1); // hiragana
    expect(findCjk("\u30a2").length).toBe(1); // katakana
    expect(findCjk("\uac00").length).toBe(1); // hangul
    expect(findCjk("\u3002").length).toBe(1); // dấu chấm CJK
    expect(findCjk("\uff01").length).toBe(1); // dấu chấm than toàn chiều
    expect(findCjk("\u{20000}").length).toBe(1); // chữ Hán mặt phẳng phụ (ngoài BMP)
  });

  it("báo đúng dòng và cột (tính từ 1)", () => {
    expect(findCjk("abc\nxy\u8eab")).toEqual([{ line: 2, col: 3, char: "\u8eab" }]);
  });

  it("không báo tiếng Việt có dấu, emoji, ký hiệu hay mũi tên", () => {
    const ok = "Đột phá Kiếm khí Lạc Hà Trấn Ưu ước ẩn ỷ Ằ ⚙ ▾ ✓ ✗ → · … — 🔊 😀 ⚠ ═";
    expect(findCjk(ok)).toEqual([]);
  });
});

describe("không chữ Hán / chữ Trung Quốc trong mã nguồn", () => {
  it("quét đủ tệp (không lọt vì sai đường dẫn): có index.html, ui.ts, gen-pwa-icons.mjs", () => {
    const rel = new Set(files.map((f) => path.relative(rootDir, f).split(path.sep).join("/")));
    expect(files.length).toBeGreaterThan(200);
    for (const must of [
      "client/index.html",
      "client/src/ui.ts",
      "client/scripts/gen-pwa-icons.mjs",
      "client/public/icons/icon.svg",
      "shared/src/game.ts",
      "server/src/rooms/WorldRoom.ts",
    ]) {
      expect(rel.has(must), must).toBe(true);
    }
  });

  it("chỉ ghim đường dẫn cụ thể, không bỏ qua thư mục theo tên chung ('data', 'build') ở mọi cấp", () => {
    expect(SKIP_DIRS.has("data")).toBe(false);
    expect(SKIP_DIRS.has("build")).toBe(false);
    for (const p of SKIP_PATHS) expect(p.includes("/"), p).toBe(true);
    // Không tệp nào được quét nằm dưới đường dẫn bị ghim
    const rel = files.map((f) => path.relative(rootDir, f).split(path.sep).join("/"));
    for (const skip of SKIP_PATHS)
      expect(
        rel.some((r) => r.startsWith(skip + "/")),
        skip,
      ).toBe(false);
  });

  it("client / shared / server / app không chứa ký tự CJK", () => {
    const found: string[] = [];
    for (const f of files) {
      for (const h of findCjk(readFileSync(f, "utf-8"))) {
        const code = h.char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0");
        found.push(`${path.relative(rootDir, f)}:${h.line}:${h.col} U+${code}`);
      }
    }
    // Danh sách rỗng = đạt. Lỗi in ra từng vị trí để sửa ngay (đổi sang chữ Việt hoặc biểu tượng SVG)
    expect(found).toEqual([]);
  });
});
