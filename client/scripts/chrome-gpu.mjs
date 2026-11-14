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
