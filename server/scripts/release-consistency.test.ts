import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Kiểm số phiên bản cho bản phát hành (đóng khoảng trống B nêu ở #491: trước đây không có kiểm tự động
 * nào bắt quên tăng `versionCode` / `versionName`; Google Play từ chối bản tải lên nếu `versionCode`
 * không tăng nghiêm ngặt).
 *
 * Quy ước phát hành (PR phát hành do Dev A làm, tăng đồng loạt MỘT lần mỗi bản):
 *  - mọi `package.json` / khoá (kể cả mục workspace trong `package-lock.json`) và app Android cùng một
 *    số phiên bản `X.Y.Z`;
 *  - `versionName` trong `app/android/app/build.gradle` = số đó;
 *  - mục phát hành đầu tiên của `CHANGELOG.md` là bản `X.Y.Z` đó (chỉ tính mục có số phiên bản: mục
 *    `## [Chưa phát hành]` mà PR tính năng ghi giữa hai bản KHÔNG được tính);
 *  - `versionCode` >= số bản phát hành đã có trong CHANGELOG (0.1.0 = 1, 0.1.1 = 2, ..., 0.2.0 = 5, mỗi
 *    bản phát hành tăng 1). Bản vá 0.2.1 phải thêm mục CHANGELOG VÀ tăng versionCode lên >= 6.
 *    Cố ý dùng `>=` chứ không phải `===`: Google Play đòi versionCode tăng so với MỌI lần tải lên trước,
 *    kể cả tải lại cùng một phiên bản (đổi khoá ký, sửa khai báo), lúc đó versionCode dư so với CHANGELOG.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "..", "..");

type Lock = { version?: string; packages?: Record<string, { version?: string }> };

function read(rel: string): string {
  return readFileSync(path.join(rootDir, rel), "utf8");
}

function readJson<T extends { version?: string }>(rel: string): T {
  return JSON.parse(read(rel)) as T;
}

/**
 * Các mục phát hành trong CHANGELOG theo thứ tự xuất hiện (mới nhất trước). Chỉ tính mục có số phiên bản
 * `X.Y.Z`: `## [Chưa phát hành]` (quy ước của repo) hay `## [Unreleased]` đều bị bỏ.
 */
function changelogReleases(md: string): string[] {
  const out: string[] = [];
  for (const m of md.matchAll(/^## \[([^\]]+)\]/gm)) {
    if (!/^\d+\.\d+\.\d+$/.test(m[1])) continue;
    out.push(m[1]);
  }
  return out;
}

/** Lấy versionCode / versionName từ build.gradle của app Android. */
function parseGradle(gradle: string): { code: number; name: string } {
  const code = /^\s*versionCode\s+(\d+)\s*$/m.exec(gradle);
  const name = /^\s*versionName\s+"([^"]+)"\s*$/m.exec(gradle);
  if (!code || !name) throw new Error("build.gradle thiếu versionCode / versionName");
  return { code: Number(code[1]), name: name[1] };
}

const VERSION = readJson<{ version?: string }>("package.json").version as string;
const GRADLE = parseGradle(read("app/android/app/build.gradle"));
const RELEASES = changelogReleases(read("CHANGELOG.md"));

describe("số phiên bản phát hành khớp nhau", () => {
  it("root package.json có số phiên bản X.Y.Z", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it.each([
    "client/package.json",
    "server/package.json",
    "shared/package.json",
    "app/package.json",
  ])("%s cùng số phiên bản với root", (rel) => {
    expect(readJson<{ version?: string }>(rel).version).toBe(VERSION);
  });

  it.each(["package-lock.json", "app/package-lock.json"])(
    "%s (đầu tệp và khoá gốc) cùng số phiên bản với root",
    (rel) => {
      const lock = readJson<Lock>(rel);
      expect(lock.version).toBe(VERSION);
      expect(lock.packages?.[""]?.version).toBe(VERSION);
    },
  );

  it.each(["client", "server", "shared"])(
    "package-lock.json: mục workspace %s cùng số phiên bản với root",
    (ws) => {
      expect(readJson<Lock>("package-lock.json").packages?.[ws]?.version).toBe(VERSION);
    },
  );

  it("versionName của app Android = số phiên bản", () => {
    expect(GRADLE.name).toBe(VERSION);
  });

  it("mục phát hành đầu tiên của CHANGELOG là bản hiện tại", () => {
    expect(RELEASES[0]).toBe(VERSION);
  });

  it("versionCode >= số bản phát hành trong CHANGELOG (bắt quên tăng; cho phép tăng dư)", () => {
    expect(new Set(RELEASES).size, "CHANGELOG có mục trùng số phiên bản").toBe(RELEASES.length);
    expect(GRADLE.code).toBeGreaterThanOrEqual(RELEASES.length);
  });
});

describe("hàm đọc của kiểm phiên bản", () => {
  it("changelogReleases chỉ tính mục có số phiên bản, giữ thứ tự", () => {
    const md =
      "# Nhật ký\n\n## [Unreleased]\n- x\n\n## [Chưa phát hành] — M7\n- y\n\n## [0.2.1] — a\n\n## [0.2.0] — b\n\n## [0.1.0] — c\n";
    expect(changelogReleases(md)).toEqual(["0.2.1", "0.2.0", "0.1.0"]);
  });

  it("parseGradle đọc versionCode / versionName, thiếu thì ném lỗi", () => {
    const g = '    defaultConfig {\n        versionCode 12\n        versionName "1.4.0"\n    }\n';
    expect(parseGradle(g)).toEqual({ code: 12, name: "1.4.0" });
    expect(() => parseGradle('versionName "1.0.0"')).toThrow();
    expect(() => parseGradle("versionCode 3")).toThrow();
  });
});
