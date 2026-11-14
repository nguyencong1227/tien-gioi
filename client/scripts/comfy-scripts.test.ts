import { describe, expect, it } from "vitest";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectGpu, getChromeGpuFlags } from "./chrome-gpu.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const comfyUpScript = path.join(repoRoot, "scripts/art/comfy-up.sh");
const comfyDownScript = path.join(repoRoot, "scripts/art/comfy-down.sh");
const comfyIdleScript = path.join(repoRoot, "scripts/art/comfy-idle-watch.sh");

describe("Dây chuyền đồ họa nháp ComfyUI + SDXL (Mục 16.2 & 17.3 QUYET_DINH_M3, G1 #486)", () => {
  const tmpTestDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-comfy-test-"));
  const tmpLockPath = path.join(tmpTestDir, "tg-comfy.lock");

  it("các script quản lý vòng đời ComfyUI tồn tại và có quyền thực thi", () => {
    expect(fs.existsSync(comfyUpScript)).toBe(true);
    expect(fs.existsSync(comfyDownScript)).toBe(true);
    expect(fs.existsSync(comfyIdleScript)).toBe(true);

    const modeUp = fs.statSync(comfyUpScript).mode;
    const modeDown = fs.statSync(comfyDownScript).mode;
    const modeIdle = fs.statSync(comfyIdleScript).mode;

    // Kiểm tra quyền thực thi (user executable)
    expect(modeUp & 0o111).toBeTruthy();
    expect(modeDown & 0o111).toBeTruthy();
    expect(modeIdle & 0o111).toBeTruthy();
  });

  it("comfy-up.sh: chạy kiểm tra điều kiện thành công với cờ --dry-run", () => {
    const stdout = execFileSync(comfyUpScript, ["--dry-run"], {
      encoding: "utf-8",
      cwd: repoRoot,
      env: {
        ...process.env,
        COMFY_DIR: tmpTestDir,
        COMFY_LOCK_FILE: tmpLockPath,
      },
    });
    expect(stdout).toContain("Kiểm tra điều kiện khởi động ComfyUI thành công (chế độ --dry-run)");
  });

  it("comfy-up.sh: từ chối khởi động khi đĩa trống dưới ngưỡng tối thiểu (10 GB)", () => {
    let failed = false;
    let errorOutput = "";
    try {
      execFileSync(comfyUpScript, ["--dry-run"], {
        encoding: "utf-8",
        cwd: repoRoot,
        env: {
          ...process.env,
          COMFY_DIR: tmpTestDir,
          COMFY_LOCK_FILE: tmpLockPath,
          TEST_MIN_FREE_KB: "999999999999", // Giả lập ngưỡng yêu cầu 1000 TB
        },
      });
    } catch (err: any) {
      failed = true;
      errorOutput = (err.stderr || "") + (err.stdout || "");
    }
    expect(failed).toBe(true);
    expect(errorOutput).toMatch(/LỖI: Ổ gốc \(\/\) còn ít hơn 10 GB trống/);
  });

  it("comfy-up.sh: từ chối khởi động khi Chrome đang chạy test sử dụng GPU", () => {
    let failed = false;
    let errorOutput = "";
    try {
      execFileSync(comfyUpScript, ["--dry-run"], {
        encoding: "utf-8",
        cwd: repoRoot,
        env: {
          ...process.env,
          COMFY_DIR: tmpTestDir,
          COMFY_LOCK_FILE: tmpLockPath,
          TEST_GPU_BUSY: "1",
        },
      });
    } catch (err: any) {
      failed = true;
      errorOutput = (err.stderr || "") + (err.stdout || "");
    }
    expect(failed).toBe(true);
    expect(errorOutput).toMatch(/Phát hiện bài test Chrome đang sử dụng GPU/);
  });

  it("comfy-down.sh: dọn dẹp file lock và thoát an toàn", () => {
    fs.writeFileSync(tmpLockPath, "test-lock\n");
    expect(fs.existsSync(tmpLockPath)).toBe(true);

    const stdout = execFileSync(comfyDownScript, [], {
      encoding: "utf-8",
      cwd: repoRoot,
      env: {
        ...process.env,
        COMFY_DIR: tmpTestDir,
        COMFY_LOCK_FILE: tmpLockPath,
      },
    });
    expect(stdout).toContain("Đã tắt dây chuyền ComfyUI và giải phóng tài nguyên");
    expect(fs.existsSync(tmpLockPath)).toBe(false);
  });

  it("comfy-down.sh: KHÔNG giết các tiến trình khác chứa chuỗi ComfyUI/main.py trên dòng lệnh", () => {
    // Khởi động một tiến trình giả lập có chuỗi "ComfyUI/main.py" trên dòng lệnh (Review PR #499)
    const dummy = spawn("bash", ["-c", 'exec -a "test ComfyUI/main.py" sleep 60'], {
      stdio: "ignore",
    });
    const dummyPid = dummy.pid!;
    expect(dummyPid).toBeGreaterThan(0);

    try {
      execFileSync(comfyDownScript, [], {
        encoding: "utf-8",
        cwd: repoRoot,
        env: {
          ...process.env,
          COMFY_DIR: tmpTestDir,
          COMFY_LOCK_FILE: tmpLockPath,
        },
      });

      // Tiến trình giả lập vẫn phải còn sống (không bị pkill -f giết nhầm)
      let isAlive = false;
      try {
        process.kill(dummyPid, 0);
        isAlive = true;
      } catch {
        isAlive = false;
      }
      expect(isAlive).toBe(true);
    } finally {
      try {
        dummy.kill();
      } catch {
        // bỏ qua
      }
    }
  });

  it("comfy-up.sh: trap tự động dọn sạch tệp khóa khi xảy ra lỗi khởi động giữa chừng", () => {
    const errorLockPath = path.join(tmpTestDir, "tg-comfy-error.lock");
    const nonExistentDir = path.join(tmpTestDir, "missing-dir");
    let failed = false;
    try {
      execFileSync(comfyUpScript, [], {
        encoding: "utf-8",
        cwd: repoRoot,
        env: {
          ...process.env,
          COMFY_DIR: nonExistentDir,
          COMFY_LOCK_FILE: errorLockPath,
          TEST_MIN_FREE_KB: "100",
        },
        stdio: "pipe",
      });
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    // Tệp khóa phải được trap dọn dẹp sạch sẽ, không để lại khóa mồ côi
    expect(fs.existsSync(errorLockPath)).toBe(false);
  });

  it("tích hợp chrome-gpu: detectGpu tự động nhường GPU khi có khóa và tg-comfy active", () => {
    const tmpLock = "/tmp/tg-comfy.lock";
    const hadLock = fs.existsSync(tmpLock);
    const origEnv = { ...process.env };

    const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-stub-comfy-"));
    const stubBin = path.join(stubDir, "systemctl");
    fs.writeFileSync(
      stubBin,
      `#!/bin/sh
if [ "$1" = "--user" ] && [ "$2" = "is-active" ] && [ "$3" = "tg-comfy" ]; then
  echo "active"
  exit 0
fi
exit 3
`,
      { mode: 0o755 },
    );

    try {
      delete process.env.DISABLE_GPU;
      delete process.env.CI;
      process.env.FORCE_GPU = "1";
      process.env.PATH = `${stubDir}:${process.env.PATH}`;

      fs.writeFileSync(tmpLock, "2026-11-14T18:30:00Z\n");
      const gpu = detectGpu();
      expect(gpu.hasGpu).toBe(false);
      expect(gpu.reason).toBe("comfy_running");
      expect(getChromeGpuFlags()).toEqual(["--disable-gpu"]);
    } finally {
      process.env = origEnv;
      if (!hadLock && fs.existsSync(tmpLock)) {
        try {
          fs.unlinkSync(tmpLock);
        } catch {
          // bỏ qua
        }
      }
      fs.rmSync(stubDir, { recursive: true, force: true });
    }
  });
});
