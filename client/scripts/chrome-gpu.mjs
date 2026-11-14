// Phát hiện GPU NVIDIA RTX và sinh cờ tăng tốc phần cứng cho Chrome headless
// Quyết định của người dùng mục 16 (QUYET_DINH_M3.md)
import childProcess from "node:child_process";
import fs from "node:fs";
import process from "node:process";

/**
 * Kiểm tra xem dịch vụ ComfyUI (tg-comfy) có thực sự đang chạy không.
 * Phòng ngừa lỗi khóa mồ côi (stale lock) làm Chrome headless chạy phần mềm vĩnh viễn (Review PR #499).
 */
export function isComfyRunning() {
  const comfyLockPath = "/tmp/tg-comfy.lock";
  const userRuntimeLock = process.env.XDG_RUNTIME_DIR
    ? `${process.env.XDG_RUNTIME_DIR}/tg-comfy.lock`
    : `/run/user/${process.getuid ? process.getuid() : 1000}/tg-comfy.lock`;

  const targetLock = fs.existsSync(userRuntimeLock)
    ? userRuntimeLock
    : fs.existsSync(comfyLockPath)
      ? comfyLockPath
      : null;

  if (!targetLock) return false;

  try {
    const stat = fs.statSync(targetLock);
    const ageMs = Date.now() - stat.mtimeMs;
    // Khóa cũ hơn 31 phút chắc chắn đã hết hạn (RuntimeMaxSec của tg-comfy là 30 phút)
    if (ageMs > 31 * 60 * 1000) {
      return false;
    }

    // Kiểm tra trạng thái đơn vị systemd tạm tg-comfy
    const res = childProcess.spawnSync("systemctl", ["--user", "is-active", "tg-comfy"], {
      encoding: "utf-8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    });

    if (res.error) {
      // Nếu không có systemctl trong môi trường (ví dụ CI runner / container), tin vào mtime
      return ageMs <= 31 * 60 * 1000;
    }

    // Đơn vị chỉ thực sự hoạt động khi status === 0 và stdout === "active"
    return res.status === 0 && res.stdout.trim() === "active";
  } catch {
    return false;
  }
}

/**
 * Phát hiện GPU NVIDIA khả dụng trên máy chủ.
 * Tự động lùi về phần mềm nếu:
 * - Có cờ ép tắt qua biến môi trường: DISABLE_GPU=1 hoặc FORCE_SWIFTSHADER=1
 * - Chạy trên môi trường CI (CI=true) trừ khi FORCE_GPU=1
 * - Dây chuyền ComfyUI + SDXL đang hoạt động (nhường GPU để tránh xung đột VRAM)
 * - Không tìm thấy thiết bị /dev/nvidia0 hoặc driver Vulkan của NVIDIA
 */
export function detectGpu() {
  if (process.env.DISABLE_GPU === "1" || process.env.FORCE_SWIFTSHADER === "1") {
    return { hasGpu: false, reason: "disabled_by_env" };
  }

  if (process.env.CI && !process.env.FORCE_GPU) {
    return { hasGpu: false, reason: "ci_environment" };
  }

  // Khóa GPU tự động khi dây chuyền ComfyUI + SDXL đang chạy (Mục 16.2 & Kế hoạch đồ họa AI G1)
  if (isComfyRunning()) {
    return { hasGpu: false, reason: "comfy_running" };
  }

  const hasNvidiaDev = fs.existsSync("/dev/nvidia0");
  const hasIcd =
    fs.existsSync("/usr/share/vulkan/icd.d/nvidia_icd.json") ||
    fs.existsSync("/etc/vulkan/icd.d/nvidia_icd.json");

  if (hasNvidiaDev && hasIcd) {
    return {
      hasGpu: true,
      reason: "nvidia_rtx",
      device: "/dev/nvidia0",
      vulkanIcd: "/usr/share/vulkan/icd.d/nvidia_icd.json",
    };
  }

  return {
    hasGpu: false,
    reason: hasNvidiaDev ? "missing_vulkan_icd" : "no_nvidia_device",
  };
}

/**
 * Sinh danh sách cờ dòng lệnh cho Google Chrome headless.
 * Bật WebGL 2 + ANGLE Vulkan nếu có GPU NVIDIA RTX, hoặc tắt GPU nếu không có.
 */
export function getChromeGpuFlags() {
  const gpu = detectGpu();
  if (gpu.hasGpu) {
    return [
      "--enable-gpu",
      "--use-gl=angle",
      "--use-angle=vulkan",
      "--enable-unsafe-webgpu",
      "--enable-features=Vulkan,UseSkiaRenderer",
      "--ignore-gpu-blocklist",
    ];
  }
  return ["--disable-gpu"];
}

/**
 * Biểu thức JS đánh giá trong ngữ cảnh Chrome qua DevTools Protocol
 * để trích xuất tên GPU và renderer WebGL không bị che giấu (unmasked renderer).
 */
export const WEBGL_RENDERER_EXPR = `
(() => {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return { ok: false, error: "no_webgl" };
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return { ok: true, vendor, unmaskedRenderer: renderer };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
})()
`;
