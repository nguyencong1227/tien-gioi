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
