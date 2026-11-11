import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Đường dẫn gốc của repo (từ client/src đi lên 2 cấp)
const REPO_ROOT = resolve(__dirname, "../..");

/**
 * Các hàm validator kiểm tra tĩnh (thuần khiết), cho phép chạy kiểm tra file thật
 * cũng như kiểm tra các kịch bản đột biến (mutation) để đảm bảo test luôn bắt được lỗi.
 */
export function validateRootPackageJson(content: string): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const pkg = JSON.parse(content);
  const workspaces = Array.isArray(pkg.workspaces) ? pkg.workspaces : [];
  if (workspaces.some((w: string) => w === "app" || w.startsWith("app/"))) {
    errors.push("workspaces không được chứa app/ để npm ci của CI/Docker không kéo Capacitor");
  }
  return { ok: errors.length === 0, errors };
}

export function validateCapacitorConfig(content: string): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!/appId:\s*["']site\.hethongtm\.tiengioi["']/.test(content)) {
    errors.push("appId phải là 'site.hethongtm.tiengioi'");
  }
  if (!/appName:\s*["']Tiên Giới["']/.test(content)) {
    errors.push("appName phải là 'Tiên Giới'");
  }
  if (!/webDir:\s*["']\.\.\/client\/dist["']/.test(content)) {
    errors.push("webDir phải là '../client/dist'");
  }
  if (!/androidScheme:\s*["']https["']/.test(content)) {
    errors.push("androidScheme phải là 'https'");
  }
  if (/\burl\s*:/i.test(content) || /server\.url/i.test(content)) {
    errors.push("Bản phát hành không được chứa server.url");
  }
  if (/cleartext:\s*true/i.test(content)) {
    errors.push("Bản phát hành không được bật cleartext: true");
  }
  return { ok: errors.length === 0, errors };
}

export function validateAndroidManifest(content: string): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!/android:allowBackup\s*=\s*["']false["']/.test(content)) {
    errors.push("android:allowBackup phải là 'false'");
  }
  if (!/android:usesCleartextTraffic\s*=\s*["']false["']/.test(content)) {
    errors.push("android:usesCleartextTraffic phải là 'false'");
  }
  if (!/android:windowSoftInputMode\s*=\s*["']adjustResize["']/.test(content)) {
    errors.push("android:windowSoftInputMode phải là 'adjustResize'");
  }
  if (!/android:screenOrientation\s*=\s*["']sensorLandscape["']/.test(content)) {
    errors.push("android:screenOrientation phải là 'sensorLandscape'");
  }
  return { ok: errors.length === 0, errors };
}

export function validateEnvNative(content: string): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!/^VITE_SERVER_URL=wss:\/\/tiengioi\.hethongtm\.site\s*$/m.test(content)) {
    errors.push("VITE_SERVER_URL phải là 'wss://tiengioi.hethongtm.site'");
  }
  if (!/^VITE_NATIVE=1\s*$/m.test(content)) {
    errors.push("VITE_NATIVE phải là '1'");
  }
  return { ok: errors.length === 0, errors };
}

export function validateAppPackageJson(content: string): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const pkg = JSON.parse(content);
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const required = ["@capacitor/core", "@capacitor/cli", "@capacitor/android", "@capacitor/app"];
  for (const dep of required) {
    if (!deps[dep]) {
      errors.push(`Thiếu gói bắt buộc: ${dep}`);
    } else if (/^[\^~]/.test(deps[dep])) {
      errors.push(`Gói ${dep} phải ghim phiên bản chính xác, không dùng ^ hoặc ~`);
    }
  }
  return { ok: errors.length === 0, errors };
}

describe("Kiểm tra tĩnh cấu hình Android Capacitor (Issue #300)", () => {
  it("gốc package.json không chứa app trong workspaces", () => {
    const raw = readFileSync(resolve(REPO_ROOT, "package.json"), "utf-8");
    const res = validateRootPackageJson(raw);
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it("app/package.json có đầy đủ 4 gói Capacitor và ghim chính xác phiên bản", () => {
    const raw = readFileSync(resolve(REPO_ROOT, "app/package.json"), "utf-8");
    const res = validateAppPackageJson(raw);
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it("app/capacitor.config.ts có đúng appId, appName, androidScheme và không có cleartext/url", () => {
    const raw = readFileSync(resolve(REPO_ROOT, "app/capacitor.config.ts"), "utf-8");
    const res = validateCapacitorConfig(raw);
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it("app/android/app/src/main/AndroidManifest.xml cấu hình bảo mật và hiển thị chuẩn", () => {
    const path = resolve(REPO_ROOT, "app/android/app/src/main/AndroidManifest.xml");
    expect(existsSync(path)).toBe(true);
    const raw = readFileSync(path, "utf-8");
    const res = validateAndroidManifest(raw);
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it("app/android/app/build.gradle chứa applicationId 'site.hethongtm.tiengioi'", () => {
    const path = resolve(REPO_ROOT, "app/android/app/build.gradle");
    expect(existsSync(path)).toBe(true);
    const raw = readFileSync(path, "utf-8");
    expect(raw).toContain('applicationId "site.hethongtm.tiengioi"');
  });

  it("app/android/app/src/main/res/values/strings.xml có app_name là 'Tiên Giới'", () => {
    const path = resolve(REPO_ROOT, "app/android/app/src/main/res/values/strings.xml");
    expect(existsSync(path)).toBe(true);
    const raw = readFileSync(path, "utf-8");
    expect(raw).toContain('<string name="app_name">Tiên Giới</string>');
    expect(raw).toContain('<string name="package_name">site.hethongtm.tiengioi</string>');
  });

  it("client/.env.native cấu hình server production và cờ VITE_NATIVE", () => {
    const path = resolve(REPO_ROOT, "client/.env.native");
    expect(existsSync(path)).toBe(true);
    const raw = readFileSync(path, "utf-8");
    const res = validateEnvNative(raw);
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
  });
});

describe("Đột biến đỏ (Mutation Tests) - bắt buộc đỏ khi cấu hình sai phạm", () => {
  it("đột biến 1: workspaces chứa app -> validator báo lỗi", () => {
    const mutated = JSON.stringify({ workspaces: ["shared", "server", "client", "app"] });
    const res = validateRootPackageJson(mutated);
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toContain("workspaces không được chứa app/");
  });

  it("đột biến 2: đổi appId trong capacitor.config.ts -> validator báo lỗi", () => {
    const mutated = `
      import type { CapacitorConfig } from "@capacitor/cli";
      export default {
        appId: "com.example.game",
        appName: "Tiên Giới",
        webDir: "../client/dist",
        server: { androidScheme: "https" }
      };
    `;
    const res = validateCapacitorConfig(mutated);
    expect(res.ok).toBe(false);
    expect(res.errors).toContain("appId phải là 'site.hethongtm.tiengioi'");
  });

  it("đột biến 3: thêm server.url trong capacitor.config.ts -> validator báo lỗi", () => {
    const mutated = `
      export default {
        appId: "site.hethongtm.tiengioi",
        appName: "Tiên Giới",
        webDir: "../client/dist",
        server: {
          androidScheme: "https",
          url: "http://192.168.1.100:5173"
        }
      };
    `;
    const res = validateCapacitorConfig(mutated);
    expect(res.ok).toBe(false);
    expect(res.errors).toContain("Bản phát hành không được chứa server.url");
  });

  it("đột biến 4: bật cleartext trong capacitor.config.ts -> validator báo lỗi", () => {
    const mutated = `
      export default {
        appId: "site.hethongtm.tiengioi",
        appName: "Tiên Giới",
        webDir: "../client/dist",
        server: {
          androidScheme: "https",
          cleartext: true
        }
      };
    `;
    const res = validateCapacitorConfig(mutated);
    expect(res.ok).toBe(false);
    expect(res.errors).toContain("Bản phát hành không được bật cleartext: true");
  });

  it("đột biến 5: bật allowBackup trong AndroidManifest.xml -> validator báo lỗi", () => {
    const mutated = `<application android:allowBackup="true" android:usesCleartextTraffic="false" android:windowSoftInputMode="adjustResize" android:screenOrientation="sensorLandscape"/>`;
    const res = validateAndroidManifest(mutated);
    expect(res.ok).toBe(false);
    expect(res.errors).toContain("android:allowBackup phải là 'false'");
  });

  it("đột biến 6: bật usesCleartextTraffic trong AndroidManifest.xml -> validator báo lỗi", () => {
    const mutated = `<application android:allowBackup="false" android:usesCleartextTraffic="true" android:windowSoftInputMode="adjustResize" android:screenOrientation="sensorLandscape"/>`;
    const res = validateAndroidManifest(mutated);
    expect(res.ok).toBe(false);
    expect(res.errors).toContain("android:usesCleartextTraffic phải là 'false'");
  });

  it("đột biến 7: thiếu cờ VITE_NATIVE trong .env.native -> validator báo lỗi", () => {
    const mutated = "VITE_SERVER_URL=wss://tiengioi.hethongtm.site\n";
    const res = validateEnvNative(mutated);
    expect(res.ok).toBe(false);
    expect(res.errors).toContain("VITE_NATIVE phải là '1'");
  });

  it("đột biến 8: gói Capacitor dùng ^ (không ghim) -> validator báo lỗi", () => {
    const mutated = JSON.stringify({
      dependencies: {
        "@capacitor/core": "^8.6.0",
        "@capacitor/cli": "8.6.0",
        "@capacitor/android": "8.6.0",
        "@capacitor/app": "8.1.2",
      },
    });
    const res = validateAppPackageJson(mutated);
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toContain("phải ghim phiên bản chính xác");
  });
});
