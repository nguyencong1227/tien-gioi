// Phát hiện GPU NVIDIA RTX và sinh cờ tăng tốc phần cứng cho Chrome headless
// Quyết định của người dùng mục 16 (QUYET_DINH_M3.md)
import fs from "node:fs";
import process from "node:process";

/**
 * Phát hiện GPU NVIDIA khả dụng trên máy chủ.
 * Tự động lùi về phần mềm nếu:
 * - Có cờ ép tắt qua biến môi trường: DISABLE_GPU=1 hoặc FORCE_SWIFTSHADER=1
 * - Chạy trên môi trường CI (CI=true) trừ khi FORCE_GPU=1
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
  const comfyLockPath = "/tmp/tg-comfy.lock";
  const userRuntimeLock = process.env.XDG_RUNTIME_DIR
    ? `${process.env.XDG_RUNTIME_DIR}/tg-comfy.lock`
    : `/run/user/${process.getuid ? process.getuid() : 1000}/tg-comfy.lock`;

  if (fs.existsSync(comfyLockPath) || fs.existsSync(userRuntimeLock)) {
    return { hasGpu: false, reason: "comfy_running" };
  }

  try {
    const hasNvidiaDevice = fs.existsSync("/dev/nvidia0");
    const hasNvidiaVulkan =
      fs.existsSync("/usr/share/vulkan/icd.d/nvidia_icd.json") ||
      fs.existsSync("/etc/vulkan/icd.d/nvidia_icd.json");

    if (hasNvidiaDevice && hasNvidiaVulkan) {
      return {
        hasGpu: true,
        vendor: "nvidia",
        backend: "vulkan",
        reason: "nvidia_rtx_available",
      };
    }
  } catch {
    // An toàn tuyệt đối khi không đọc được hệ thống file
  }

  return { hasGpu: false, reason: "no_nvidia_device" };
}

/**
 * Trả về danh sách cờ Chrome headless thích hợp cho GPU hoặc fallback phần mềm.
 */
export function getChromeGpuFlags() {
  const gpu = detectGpu();
  if (gpu.hasGpu) {
    return ["--enable-gpu", "--use-gl=angle", "--use-angle=vulkan"];
  }
  return ["--disable-gpu"];
}

/**
 * Đoạn mã JavaScript chạy trong browser context để trích xuất thông tin WebGL Renderer.
 */
export const WEBGL_RENDERER_EXPR = `(() => {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
    if (!gl) return { ok: false, error: "NO_WEBGL" };
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      ok: true,
      unmaskedVendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : null,
      unmaskedRenderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null,
      vendor: gl.getParameter(gl.VENDOR),
      renderer: gl.getParameter(gl.RENDERER)
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
})()`;
