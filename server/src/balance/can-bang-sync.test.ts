// `docs/CAN_BANG.md` là tệp SINH TỰ ĐỘNG (`npm run can-bang -w server`). Test này buộc nó khớp bản sinh hiện tại: sửa số liệu ở
// `shared/` hoặc mô hình mà quên chạy lại lệnh thì CI đỏ ngay (trước đây mỗi PR phải kiểm tay "sinh lại y hệt", nit của B ở #440).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, "../..");
const doc = path.resolve(here, "../../../docs/CAN_BANG.md");

describe("docs/CAN_BANG.md khớp bản sinh", () => {
  it("chạy can-bang.ts --out <tạm> sinh ra ĐÚNG nội dung tệp tài liệu (nếu đỏ: chạy `npm run can-bang -w server` rồi commit tài liệu)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tien-gioi-can-bang-"));
    try {
      const out = path.join(dir, "CAN_BANG.md");
      execFileSync(process.execPath, ["--import", "tsx", "src/balance/can-bang.ts", "--out", out], {
        cwd: serverDir,
        stdio: "pipe",
        timeout: 120_000,
      });
      const generated = readFileSync(out, "utf8");
      const committed = readFileSync(doc, "utf8");
      expect(generated.length).toBeGreaterThan(10_000);
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
  }, 150_000);
});
