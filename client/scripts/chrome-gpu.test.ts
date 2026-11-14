import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { detectGpu, getChromeGpuFlags, WEBGL_RENDERER_EXPR } from "./chrome-gpu.mjs";
import { freePort } from "./free-port.mjs";

describe("chrome-gpu: phát hiện và cấu hình tăng tốc phần cứng GPU NVIDIA RTX (Mục 16 QUYET_DINH_M3)", () => {
  it("detectGpu: tôn trọng các biến môi trường ép tắt GPU", () => {
    const origEnv = { ...process.env };
    try {
      process.env.DISABLE_GPU = "1";
      delete process.env.CI;
      delete process.env.FORCE_GPU;
      expect(detectGpu().hasGpu).toBe(false);
      expect(detectGpu().reason).toBe("disabled_by_env");

      delete process.env.DISABLE_GPU;
      process.env.FORCE_SWIFTSHADER = "1";
      expect(detectGpu().hasGpu).toBe(false);
      expect(detectGpu().reason).toBe("disabled_by_env");

      delete process.env.FORCE_SWIFTSHADER;
      process.env.CI = "true";
      expect(detectGpu().hasGpu).toBe(false);
      expect(detectGpu().reason).toBe("ci_environment");

      // Nếu có FORCE_GPU=1 trên CI thì vẫn ưu tiên thử nhận diện phần cứng
      process.env.FORCE_GPU = "1";
      const gpuOnCi = detectGpu();
      expect(typeof gpuOnCi.hasGpu).toBe("boolean");
    } finally {
      process.env = origEnv;
    }
  });

  it("detectGpu: khóa mồ côi (stale lock khi tg-comfy inactive) KHÔNG chặn GPU của Chrome", () => {
    const lockPath = "/tmp/tg-comfy.lock";
    const hadLockBefore = fs.existsSync(lockPath);
    const origEnv = { ...process.env };
    try {
      delete process.env.DISABLE_GPU;
      delete process.env.FORCE_SWIFTSHADER;
      delete process.env.CI;
      process.env.FORCE_GPU = "1";

      // Tạo tệp khóa giả mồ côi khi dịch vụ tg-comfy không chạy (inactive)
      fs.writeFileSync(lockPath, "2026-11-14T18:00:00Z\n");
      const res = detectGpu();

      if (fs.existsSync("/dev/nvidia0")) {
        // Trên máy chủ có phần cứng NVIDIA: khóa mồ côi không được phép làm Chrome lùi về phần mềm
        expect(res.hasGpu).toBe(true);
        expect(res.reason).toBe("nvidia_rtx_available");
      }
    } finally {
      process.env = origEnv;
      if (!hadLockBefore && fs.existsSync(lockPath)) {
        try {
          fs.unlinkSync(lockPath);
        } catch {
          // bỏ qua
        }
      }
    }
  });

  it("detectGpu: tự động nhường GPU và lùi về phần mềm khi ComfyUI thực sự đang chạy (khóa + tg-comfy active)", () => {
    const lockPath = "/tmp/tg-comfy.lock";
    const hadLockBefore = fs.existsSync(lockPath);
    const origEnv = { ...process.env };

    // Tạo thư mục stub chứa lệnh systemctl giả lập trả về "active"
    const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-stub-systemctl-"));
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
      delete process.env.FORCE_SWIFTSHADER;
      delete process.env.CI;
      process.env.FORCE_GPU = "1";
      process.env.PATH = `${stubDir}:${process.env.PATH}`;

      fs.writeFileSync(lockPath, "2026-11-14T18:30:00Z\n");
      const res = detectGpu();
      expect(res.hasGpu).toBe(false);
      expect(res.reason).toBe("comfy_running");
      expect(getChromeGpuFlags()).toEqual(["--disable-gpu"]);
    } finally {
      process.env = origEnv;
      if (!hadLockBefore && fs.existsSync(lockPath)) {
        try {
          fs.unlinkSync(lockPath);
        } catch {
          // bỏ qua
        }
      }
      fs.rmSync(stubDir, { recursive: true, force: true });
    }
  });

  it("detectGpu: khóa cũ hơn 31 phút tự động bị bỏ qua ngay cả khi có stub active", () => {
    const lockPath = "/tmp/tg-comfy.lock";
    const hadLockBefore = fs.existsSync(lockPath);
    const origEnv = { ...process.env };

    try {
      delete process.env.DISABLE_GPU;
      delete process.env.FORCE_SWIFTSHADER;
      delete process.env.CI;
      process.env.FORCE_GPU = "1";

      fs.writeFileSync(lockPath, "old-lock\n");
      // Đặt thời gian sửa đổi (mtime) lùi về 40 phút trước (> 31 phút)
      const pastTime = (Date.now() - 40 * 60 * 1000) / 1000;
      fs.utimesSync(lockPath, pastTime, pastTime);

      const res = detectGpu();
      if (fs.existsSync("/dev/nvidia0")) {
        expect(res.hasGpu).toBe(true);
        expect(res.reason).toBe("nvidia_rtx_available");
      }
    } finally {
      process.env = origEnv;
      if (!hadLockBefore && fs.existsSync(lockPath)) {
        try {
          fs.unlinkSync(lockPath);
        } catch {
          // bỏ qua
        }
      }
    }
  });

  it("getChromeGpuFlags: sinh cờ phù hợp cho GPU hoặc fallback phần mềm", () => {
    const origEnv = { ...process.env };
    try {
      // Giả lập tắt GPU
      process.env.DISABLE_GPU = "1";
      const swFlags = getChromeGpuFlags();
      expect(swFlags).toEqual(["--disable-gpu"]);

      // Xoá biến môi trường
      delete process.env.DISABLE_GPU;
      delete process.env.CI;
      delete process.env.FORCE_SWIFTSHADER;
      const flags = getChromeGpuFlags();
      if (fs.existsSync("/dev/nvidia0")) {
        expect(flags).toContain("--enable-gpu");
        expect(flags).toContain("--use-gl=angle");
        expect(flags).toContain("--use-angle=vulkan");
        expect(flags).not.toContain("--disable-gpu");
      } else {
        expect(flags).toEqual(["--disable-gpu"]);
      }
    } finally {
      process.env = origEnv;
    }
  });

  it("Khởi động Chrome headless thật: kiểm chứng chuỗi WEBGL renderer", async () => {
    // Trên GitHub Actions CI: vitest chỉ kiểm tra logic cờ và fallback, tránh khởi động Chrome thật trong luồng song song
    if (process.env.CI) {
      return;
    }

    const gpuInfo = detectGpu();
    const flags = getChromeGpuFlags();
    const cdpPort = await freePort();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-chrome-gpu-test-"));

    const chrome = spawn(
      "google-chrome",
      [
        "--headless=new",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${tmpDir}`,
        ...flags,
        "about:blank",
      ],
      { stdio: "ignore" },
    );

    try {
      // Chờ Chrome CDP sẵn sàng
      let wsUrl: string | null = null;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 100));
        try {
          const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
          if (res.ok) {
            const list = (await res.json()) as Array<{ webSocketDebuggerUrl?: string }>;
            if (list[0]?.webSocketDebuggerUrl) {
              wsUrl = list[0].webSocketDebuggerUrl;
              break;
            }
          }
        } catch {
          // tiếp tục thử
        }
      }

      expect(wsUrl).not.toBeNull();
      if (!wsUrl) return;

      const ws = new WebSocket(wsUrl);
      await new Promise<void>((resolve, reject) => {
        ws.once("open", resolve);
        ws.once("error", reject);
      });

      let reqId = 1;
      const evaluate = (expression: string) =>
        new Promise<any>((resolve, reject) => {
          const id = reqId++;
          const handler = (data: WebSocket.RawData) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
              ws.off("message", handler);
              if (msg.error) reject(new Error(msg.error.message));
              else resolve(msg.result?.result?.value);
            }
          };
          ws.on("message", handler);
          ws.send(
            JSON.stringify({
              id,
              method: "Runtime.evaluate",
              params: { expression, returnByValue: true },
            }),
          );
        });

      const webgl = await evaluate(WEBGL_RENDERER_EXPR);
      expect(webgl.ok).toBe(true);

      if (gpuInfo.hasGpu) {
        // Trên máy chủ có NVIDIA RTX 5060: BẮT BUỘC phải nhận diện NVIDIA GPU
        expect(webgl.unmaskedRenderer).toMatch(/NVIDIA|GeForce/i);
        expect(webgl.unmaskedRenderer).not.toMatch(/SwiftShader/i);
        expect(webgl.unmaskedRenderer).not.toMatch(/llvmpipe/i);
      } else {
        // Trên CI hoặc khi không có GPU: tự động lùi về phần mềm an toàn
        expect(webgl.unmaskedRenderer).toMatch(/SwiftShader|llvmpipe|software/i);
      }

      ws.close();
    } finally {
      chrome.kill();
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // bỏ qua
      }
    }
  }, 15000);
});
