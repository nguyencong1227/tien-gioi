import { describe, it, expect, vi } from "vitest";
import {
  extractQueryV,
  staticCacheHeader,
  applyStaticHeaders,
  PACK_VERSION_RE,
} from "./static-headers";

describe("M7.15: static-headers (Kiểm soát Cache-Control tệp tĩnh phục vụ từ client/dist)", () => {
  it("PACK_VERSION_RE: kiểm tra định dạng mã băm 12 ký tự hex", () => {
    expect(PACK_VERSION_RE.test("0123456789ab")).toBe(true);
    expect(PACK_VERSION_RE.test("3D33741878EF")).toBe(true);
    expect(PACK_VERSION_RE.test("short")).toBe(false);
    expect(PACK_VERSION_RE.test("0123456789abcdef")).toBe(false); // 16 ký tự -> false
    expect(PACK_VERSION_RE.test("0123456789zz")).toBe(false); // ký tự ngoài hex -> false
  });

  it("extractQueryV: trích xuất tham số v từ req.query hoặc req.url", () => {
    // 1. Từ req.query.v
    expect(extractQueryV({ query: { v: "0123456789ab" } })).toBe("0123456789ab");

    // 2. Từ req.url
    expect(extractQueryV({ url: "/packs/core/ui.png?v=0123456789ab" })).toBe("0123456789ab");
    expect(extractQueryV({ url: "/packs/core/ui.png?other=1&v=abcdef123456" })).toBe(
      "abcdef123456",
    );

    // 3. Không có v
    expect(extractQueryV({ query: {} })).toBeNull();
    expect(extractQueryV({ url: "/packs/core/ui.png" })).toBeNull();
    expect(extractQueryV(null)).toBeNull();
    expect(extractQueryV({})).toBeNull();
  });

  it("staticCacheHeader: phân định chính xác immutable và no-cache cho các trường hợp", () => {
    const validV = "3d33741878ef";

    // 1. /packs/manifest.json -> luôn no-cache (kể cả khi cố tình gắn ?v=)
    expect(staticCacheHeader("packs/manifest.json")).toBe("no-cache");
    expect(staticCacheHeader("packs/manifest.json", validV)).toBe("no-cache");
    expect(staticCacheHeader("/packs/manifest.json", validV)).toBe("no-cache");

    // 2. /packs/** có ?v= hợp lệ (12 hex) -> immutable 1 năm
    expect(staticCacheHeader("packs/core/ui.png", validV)).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(staticCacheHeader("packs/audio/bgm.ogg", "0123456789ab")).toBe(
      "public, max-age=31536000, immutable",
    );

    // 3. /packs/** KHÔNG có ?v= -> no-cache (F1: tránh bị trình duyệt giữ 1 năm)
    expect(staticCacheHeader("packs/core/ui.png")).toBe("no-cache");
    expect(staticCacheHeader("packs/core/ui.png", null)).toBe("no-cache");
    expect(staticCacheHeader("packs/core/ui.png", "")).toBe("no-cache");

    // 4. /packs/** có ?v= sai độ dài hoặc ký tự lạ -> no-cache
    expect(staticCacheHeader("packs/core/ui.png", "short")).toBe("no-cache");
    expect(staticCacheHeader("packs/core/ui.png", "0123456789zz")).toBe("no-cache");
    expect(staticCacheHeader("packs/core/ui.png", "0123456789abcdef")).toBe("no-cache");

    // 5. Tệp tĩnh khác ngoài /packs/ (như /assets/atlas.png) -> null
    expect(staticCacheHeader("assets/atlas.png")).toBeNull();
    expect(staticCacheHeader("assets/atlas.png", validV)).toBeNull();
    expect(staticCacheHeader("index.html")).toBeNull();
  });

  it("applyStaticHeaders: gọi res.setHeader đúng với query từ request", () => {
    const setHeader = vi.fn();
    const res = {
      req: {
        query: { v: "3d33741878ef" },
        url: "/packs/core/ui.png?v=3d33741878ef",
      },
      setHeader,
    };

    // Áp dụng cho tệp packs có v hợp lệ
    applyStaticHeaders(res, "/app/dist/packs/core/ui.png", "/app/dist");
    expect(setHeader).toHaveBeenCalledWith("Cache-Control", "public, max-age=31536000, immutable");

    // Áp dụng cho tệp packs KHÔNG có v
    setHeader.mockClear();
    const resNoV = {
      req: { query: {}, url: "/packs/core/ui.png" },
      setHeader,
    };
    applyStaticHeaders(resNoV, "/app/dist/packs/core/ui.png", "/app/dist");
    expect(setHeader).toHaveBeenCalledWith("Cache-Control", "no-cache");

    // Áp dụng cho manifest.json
    setHeader.mockClear();
    applyStaticHeaders(res, "/app/dist/packs/manifest.json", "/app/dist");
    expect(setHeader).toHaveBeenCalledWith("Cache-Control", "no-cache");

    // Áp dụng cho assets thông thường
    setHeader.mockClear();
    applyStaticHeaders(res, "/app/dist/assets/atlas.png", "/app/dist");
    expect(setHeader).not.toHaveBeenCalled();
  });
});
