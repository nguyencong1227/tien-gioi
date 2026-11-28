// `docs/SO_TAY_QUAI_VA_ROI.md` là tệp SINH TỰ ĐỘNG (`npm run so-tay-quai -w server`). Test này buộc nó khớp bản sinh hiện tại: sửa quái / bảng rơi
// mà quên chạy lại lệnh thì CI đỏ ngay (đọc dữ liệu thật ở `shared/`).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, "../..");
const doc = path.resolve(here, "../../../docs/SO_TAY_QUAI_VA_ROI.md");

describe("docs/SO_TAY_QUAI_VA_ROI.md khớp bản sinh", () => {
  it("chạy so-tay-quai.ts --out <tạm> sinh ra ĐÚNG nội dung tệp tài liệu (nếu đỏ: chạy `npm run so-tay-quai -w server` rồi commit tài liệu)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tien-gioi-so-tay-quai-"));
    try {
      const out = path.join(dir, "SO_TAY_QUAI_VA_ROI.md");
      execFileSync(
        process.execPath,
        ["--import", "tsx", "src/balance/so-tay-quai.ts", "--out", out],
        {
          cwd: serverDir,
          stdio: "pipe",
          timeout: 60_000,
        },
      );
      const generated = readFileSync(out, "utf8");
      const committed = readFileSync(doc, "utf8");
      expect(generated.length).toBeGreaterThan(5_000);
      // so từng dòng để thông báo lỗi chỉ ra dòng đầu tiên lệch thay vì in cả tệp
      const g = generated.split("\n");
      const c = committed.split("\n");
      const first = g.findIndex((line, i) => line !== c[i]);
      expect(
        first === -1 && g.length === c.length
          ? "khớp"
          : `lệch ở dòng ${(first === -1 ? Math.min(g.length, c.length) : first) + 1}`,
      ).toBe("khớp");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 90_000);
});
