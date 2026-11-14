import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectGpu, getChromeGpuFlags } from "./chrome-gpu.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const comfyUpScript = path.join(repoRoot, "scripts/art/comfy-up.sh");
const comfyDownScript = path.join(repoRoot, "scripts/art/comfy-down.sh");
const comfyIdleScript = path.join(repoRoot, "scripts/art/comfy-idle-watch.sh");

describe("Dây chuyền đồ họa nháp ComfyUI + SDXL (Mục 16.2 & 17.3 QUYET_DINH_M3, G1 #486)", () => {
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
    const tmpLock = "/tmp/tg-comfy.lock";
    fs.writeFileSync(tmpLock, "test-lock\n");
    expect(fs.existsSync(tmpLock)).toBe(true);

    const stdout = execFileSync(comfyDownScript, [], {
      encoding: "utf-8",
      cwd: repoRoot,
    });
    expect(stdout).toContain("Đã tắt dây chuyền ComfyUI và giải phóng tài nguyên");
    expect(fs.existsSync(tmpLock)).toBe(false);
  });

  it("tích hợp chrome-gpu: detectGpu tự động nhường GPU khi có khóa tg-comfy.lock", () => {
    const tmpLock = "/tmp/tg-comfy.lock";
    const hadLock = fs.existsSync(tmpLock);
    const origEnv = { ...process.env };
    try {
      delete process.env.DISABLE_GPU;
      delete process.env.CI;
      process.env.FORCE_GPU = "1";

      fs.writeFileSync(tmpLock, "pid=8888\n");
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
    }
  });
});
