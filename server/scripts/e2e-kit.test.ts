// Test cho phần dọn dẹp dùng chung của E2E (`killChrome`, `removeTmpDirs`): nguyên nhân thật của thư mục /tmp/tien-gioi-e2e-*-chrome-* bị sót
// là tiến trình CON của Chrome còn sống (chỉ giết tiến trình gốc) và ghi lại thư mục sau khi đã xoá.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { killChrome, removeTmpDirs, sleep } from "./e2e-kit";

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe("e2e-kit: dọn dẹp Chrome", () => {
  it("killChrome giết cả NHÓM tiến trình (tiến trình con cũng chết), không chỉ tiến trình gốc", async () => {
    // sh gốc (làm chủ nhóm vì detached) sinh một `sleep` con rồi in pid con ra stdout
    const parent = spawn("sh", ["-c", "sleep 60 & echo $!; wait"], {
      stdio: ["ignore", "pipe", "ignore"],
      detached: true,
    });
    const childPid = await new Promise<number>((resolve, reject) => {
      parent.stdout!.once("data", (d) => resolve(Number(String(d).trim())));
      parent.once("error", reject);
    });
    expect(Number.isInteger(childPid) && childPid > 0).toBe(true);
    expect(alive(parent.pid!)).toBe(true);
    expect(alive(childPid)).toBe(true);
    killChrome(parent);
    for (let k = 0; k < 40 && (alive(parent.pid!) || alive(childPid)); k++) await sleep(50);
    expect(alive(childPid)).toBe(false); // lỗi cũ: chỉ kill() gốc thì con còn sống
    expect(alive(parent.pid!)).toBe(false);
  });

  it("killChrome không ném lỗi khi null hoặc tiến trình đã thoát", async () => {
    expect(() => killChrome(null)).not.toThrow();
    const done = spawn("sh", ["-c", "exit 0"], { detached: true, stdio: "ignore" });
    await new Promise((r) => done.once("exit", r));
    expect(() => killChrome(done)).not.toThrow();
  });

  it("removeTmpDirs xoá cả thư mục có nội dung và không lỗi với thư mục không tồn tại", async () => {
    const a = mkdtempSync(path.join(os.tmpdir(), "tg-kit-test-"));
    mkdirSync(path.join(a, "sub"));
    writeFileSync(path.join(a, "sub", "f.txt"), "x");
    const missing = path.join(os.tmpdir(), "tg-kit-test-khong-ton-tai-" + Date.now());
    await removeTmpDirs(a, missing);
    expect(existsSync(a)).toBe(false);
  }, 10000);
});
