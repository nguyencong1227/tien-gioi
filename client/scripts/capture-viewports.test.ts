import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";
import {
  VIEWPORTS,
  SCENARIOS,
  computeImageHash,
  checkDuplicateScreenshots,
  assertOnlyModalsOpen,
  assertLayoutIntegrity,
  PRELOAD_SCRIPT,
} from "./capture-viewports.mjs";

describe("capture-viewports", () => {
  it("định nghĩa đầy đủ các viewports tiêu chuẩn cho đa thiết bị với Desktop đứng đầu", () => {
    expect(VIEWPORTS.length).toBeGreaterThanOrEqual(8);
    const ids = VIEWPORTS.map((v) => v.id);
    expect(ids).toContain("desktop-qhd");
    expect(ids).toContain("desktop-fhd");
    expect(ids).toContain("desktop-hd");
    expect(ids).toContain("tablet-l");
    expect(ids).toContain("tablet-p");
    expect(ids).toContain("mobile-l");
    expect(ids).toContain("mobile-p");
    expect(ids).toContain("mobile-sm");

    // BẮT BUỘC: Các thiết bị desktop (mobile: false) phải đứng TRƯỚC thiết bị cảm ứng
    let seenMobile = false;
    for (const vp of VIEWPORTS) {
      if (vp.mobile) {
        seenMobile = true;
      } else {
        expect(seenMobile).toBe(false);
      }
      expect(vp.width).toBeGreaterThan(0);
      expect(vp.height).toBeGreaterThan(0);
      expect(vp.dpr).toBeGreaterThanOrEqual(1);
      expect(typeof vp.mobile).toBe("boolean");
    }
  });

  it("định nghĩa đầy đủ 7 kịch bản giao diện cần chụp mốc kèm selector đích", () => {
    expect(SCENARIOS.length).toBe(7);
    const ids = SCENARIOS.map((s) => s.id);
    expect(ids).toContain("01-auth-login");
    expect(ids).toContain("02-auth-register");
    expect(ids).toContain("03-game-hud");
    expect(ids).toContain("04-game-char");
    expect(ids).toContain("05-game-inventory");
    expect(ids).toContain("06-game-settings");
    expect(ids).toContain("07-game-crowd");

    for (const sc of SCENARIOS) {
      expect(typeof sc.action).toBe("function");
      expect(["auth", "game", "crowd"]).toContain(sc.mode);
      expect(typeof sc.targetSelector).toBe("string");
      expect(sc.targetSelector.length).toBeGreaterThan(0);
    }
  });

  describe("computeImageHash", () => {
    it("tính đúng băm sha256 cho bộ đệm ảnh", () => {
      const buf1 = Buffer.from("test-image-data-alpha");
      const buf2 = Buffer.from("test-image-data-alpha");
      const buf3 = Buffer.from("test-image-data-beta");

      const hash1 = computeImageHash(buf1);
      const hash2 = computeImageHash(buf2);
      const hash3 = computeImageHash(buf3);

      expect(hash1).toHaveLength(64);
      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
    });
  });

  describe("checkDuplicateScreenshots", () => {
    it("chấp nhận danh sách ảnh khi tất cả kịch bản trong cùng viewport có băm khác nhau", () => {
      const validRecords = [
        { viewportId: "mobile-p", scenarioId: "01-auth-login", sha256: "hash-01" },
        { viewportId: "mobile-p", scenarioId: "02-auth-register", sha256: "hash-02" },
        { viewportId: "mobile-p", scenarioId: "03-game-hud", sha256: "hash-03" },
        { viewportId: "mobile-p", scenarioId: "04-game-char", sha256: "hash-04" },
        { viewportId: "desktop-hd", scenarioId: "03-game-hud", sha256: "hash-05" },
        { viewportId: "desktop-hd", scenarioId: "04-game-char", sha256: "hash-06" },
      ];

      expect(() => checkDuplicateScreenshots(validRecords)).not.toThrow();
    });

    it("cho phép cùng băm giữa hai viewport khác nhau nhưng cấm trùng trong cùng viewport", () => {
      const recordsDifferentVp = [
        { viewportId: "mobile-p", scenarioId: "01-auth-login", sha256: "shared-hash" },
        { viewportId: "desktop-hd", scenarioId: "01-auth-login", sha256: "shared-hash" },
      ];

      expect(() => checkDuplicateScreenshots(recordsDifferentVp)).not.toThrow();
    });

    it("ĐỘT BIẾN ĐỎ 1: phát hiện và ném lỗi khi 2 kịch bản trong cùng viewport có cùng băm (tái hiện lỗi ảnh 03-06 trùng nhau)", () => {
      const mutantRecords = [
        { viewportId: "mobile-p", scenarioId: "03-game-hud", sha256: "identical-blob-hash" },
        { viewportId: "mobile-p", scenarioId: "04-game-char", sha256: "identical-blob-hash" },
      ];

      expect(() => checkDuplicateScreenshots(mutantRecords)).toThrow(
        /Phát hiện ảnh trùng lặp trong viewport "mobile-p"/,
      );
      expect(() => checkDuplicateScreenshots(mutantRecords)).toThrow(/03-game-hud/);
      expect(() => checkDuplicateScreenshots(mutantRecords)).toThrow(/04-game-char/);
    });

    it("ĐỘT BIẾN ĐỎ 2: phát hiện trùng lặp bất kể vị trí của kịch bản bị trùng trong danh sách", () => {
      const mutantRecordsLong = [
        { viewportId: "tablet-l", scenarioId: "01-auth-login", sha256: "h1" },
        { viewportId: "tablet-l", scenarioId: "02-auth-register", sha256: "h2" },
        { viewportId: "tablet-l", scenarioId: "03-game-hud", sha256: "hud-and-settings-same" },
        { viewportId: "tablet-l", scenarioId: "04-game-char", sha256: "h4" },
        { viewportId: "tablet-l", scenarioId: "05-game-inventory", sha256: "h5" },
        { viewportId: "tablet-l", scenarioId: "06-game-settings", sha256: "hud-and-settings-same" },
      ];

      expect(() => checkDuplicateScreenshots(mutantRecordsLong)).toThrow(
        /Phát hiện ảnh trùng lặp trong viewport "tablet-l"/,
      );
      expect(() => checkDuplicateScreenshots(mutantRecordsLong)).toThrow(/03-game-hud/);
      expect(() => checkDuplicateScreenshots(mutantRecordsLong)).toThrow(/06-game-settings/);
    });
  });

  describe("assertOnlyModalsOpen (bảng lạ che ảnh)", () => {
    const fakeCdp = (open: unknown) => async () => ({ result: { result: { value: open } } });

    it("chấp nhận khi chỉ có bảng đích mở, hoặc không bảng nào khi chụp HUD", async () => {
      await expect(
        assertOnlyModalsOpen(fakeCdp(["char-modal"]), ["char-modal"]),
      ).resolves.toBeUndefined();
      await expect(assertOnlyModalsOpen(fakeCdp([]), [])).resolves.toBeUndefined();
      await expect(assertOnlyModalsOpen(fakeCdp([]), ["char-modal"])).resolves.toBeUndefined();
    });

    it("ĐỘT BIẾN ĐỎ 3: bảng chỉ dẫn mở đè lên bảng đích thì phải ném lỗi (tái hiện ảnh 04/06/07 bị che)", async () => {
      await expect(
        assertOnlyModalsOpen(fakeCdp(["char-modal", "newbie-guide-modal"]), ["char-modal"]),
      ).rejects.toThrow(/#newbie-guide-modal/);
      await expect(assertOnlyModalsOpen(fakeCdp(["newbie-guide-modal"]), [])).rejects.toThrow(
        /không bảng nào/,
      );
    });

    it("ném lỗi khi CDP trả kết quả không đọc được (không im lặng cho qua)", async () => {
      await expect(assertOnlyModalsOpen(fakeCdp(undefined), [])).rejects.toThrow(/không hợp lệ/);
    });
  });

  describe("assertLayoutIntegrity (khẳng định bố cục tự động)", () => {
    const fakeLayoutCdp = (res: unknown) => async () => ({ result: { result: { value: res } } });

    it("chấp nhận khi bố cục không có lỗi", async () => {
      await expect(
        assertLayoutIntegrity(fakeLayoutCdp({ ok: true, errors: [] }), false),
      ).resolves.toBeUndefined();
    });

    it("ĐỘT BIẾN ĐỎ 4: ném lỗi chi tiết khi phát hiện tràn ngang/dọc hoặc chồng chéo HUD", async () => {
      const mutantLayout = {
        ok: false,
        errors: [
          "Tràn ngang ngoài ý muốn: scrollWidth=400 > innerWidth=390",
          "Vùng HUD #hud-col-left chồng lên #chat (Giao nhau: 20x30px)",
        ],
      };
      await expect(assertLayoutIntegrity(fakeLayoutCdp(mutantLayout), false)).rejects.toThrow(
        /Tràn ngang ngoài ý muốn/,
      );
      await expect(assertLayoutIntegrity(fakeLayoutCdp(mutantLayout), false)).rejects.toThrow(
        /chồng lên #chat/,
      );
    });
  });

  it("PRELOAD_SCRIPT đặt đúng khoá đã đọc chỉ dẫn mà client dùng và chất lượng", async () => {
    const { NEWBIE_GUIDE_STORAGE_KEY } = await import("../src/a11y");
    expect(PRELOAD_SCRIPT).toContain(NEWBIE_GUIDE_STORAGE_KEY);
    expect(PRELOAD_SCRIPT).toContain("tg_quality");
  });
});
