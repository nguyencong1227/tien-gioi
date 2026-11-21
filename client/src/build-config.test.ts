import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { UserConfig, UserConfigFnObject } from "vite";
import config from "../vite.config";

// Chống sao chép (QUYET_DINH_M3 mục 59.1): bản production KHÔNG được lộ source map (ai cũng tải về dựng lại mã nguồn đọc được từ `.map`).
// Vite mặc định không sinh; test này khoá để không ai bật `build.sourcemap` (kể cả `"hidden"`: vẫn sinh tệp `.map`) mà không nhận ra.
/** Cấu hình dựng của chế độ `mode` (vite.config là hàm theo chế độ). */
function resolved(mode: string): UserConfig {
  return (config as UserConfigFnObject)({
    mode,
    command: "build",
    isSsrBuild: false,
    isPreview: false,
  });
}

/** `build.sourcemap` có làm sinh tệp `.map` / chú thích `sourceMappingURL` không (`undefined` / `false` = không). */
export function emitsSourcemap(cfg: UserConfig): boolean {
  const sm = cfg.build?.sourcemap;
  return sm !== undefined && sm !== false;
}

describe("vite.config: production không lộ source map", () => {
  it("build.sourcemap tắt ở chế độ production", () => {
    expect(emitsSourcemap(resolved("production"))).toBe(false);
  });

  it("đột biến: bật sourcemap (true / 'hidden' / 'inline') thì kiểm phải đỏ", () => {
    for (const v of [true, "hidden", "inline"] as const)
      expect(emitsSourcemap({ build: { sourcemap: v } })).toBe(true);
    expect(emitsSourcemap({ build: { sourcemap: false } })).toBe(false);
    expect(emitsSourcemap({})).toBe(false);
  });

  it("nếu đã có client/dist (máy dev): không có tệp .map và không có chú thích sourceMappingURL trong JS / CSS", () => {
    const assets = resolve(__dirname, "../dist/assets");
    if (!existsSync(assets)) return; // chưa build: bỏ qua (CI build rồi mới chạy script kiểm dist)
    const files = readdirSync(assets);
    expect(files.filter((f) => f.endsWith(".map"))).toEqual([]);
    for (const f of files.filter((n) => /\.(js|css)$/.test(n))) {
      expect(readFileSync(resolve(assets, f), "utf-8").includes("sourceMappingURL")).toBe(false);
    }
  });
});
