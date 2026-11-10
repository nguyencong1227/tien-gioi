import { describe, expect, it } from "vitest";
import { MIN_PROTOCOL_VERSION, PROTOCOL_VERSION } from "@tien-gioi/shared";
import { minProtocolOf } from "./protocol";
import { startupWarnings } from "./startup";

describe("minProtocolOf (MIN_PROTOCOL_VERSION trong môi trường)", () => {
  it("không đặt / rỗng: mức của shared, không cảnh báo", () => {
    for (const v of [undefined, "", "   "])
      expect(minProtocolOf({ MIN_PROTOCOL_VERSION: v })).toEqual({
        value: MIN_PROTOCOL_VERSION,
        warnings: [],
      });
    expect(minProtocolOf({})).toEqual({ value: MIN_PROTOCOL_VERSION, warnings: [] });
  });

  it("số nguyên hợp lệ trong khoảng [mức shared, PROTOCOL_VERSION]: dùng đúng số đó", () => {
    for (let n = MIN_PROTOCOL_VERSION; n <= PROTOCOL_VERSION; n++)
      expect(minProtocolOf({ MIN_PROTOCOL_VERSION: String(n) })).toEqual({
        value: n,
        warnings: [],
      });
    expect(minProtocolOf({ MIN_PROTOCOL_VERSION: ` ${PROTOCOL_VERSION} ` }).value).toBe(
      PROTOCOL_VERSION,
    );
  });

  it("cao hơn PROTOCOL_VERSION của chính server: kẹp về PROTOCOL_VERSION (không khoá cả client mới nhất) và cảnh báo", () => {
    for (const raw of [String(PROTOCOL_VERSION + 1), "99", "123456789"]) {
      const r = minProtocolOf({ MIN_PROTOCOL_VERSION: raw });
      expect(r.value).toBe(PROTOCOL_VERSION);
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0]).toContain("kẹp về");
    }
  });

  it("không phải số nguyên không âm: bỏ qua, dùng mức shared, cảnh báo", () => {
    for (const raw of [
      "-1",
      "1.5",
      "abc",
      "1e3",
      "0x10",
      "٣",
      "1 2",
      "9999999999",
      "NaN",
      "Infinity",
    ]) {
      const r = minProtocolOf({ MIN_PROTOCOL_VERSION: raw });
      expect(r.value, raw).toBe(MIN_PROTOCOL_VERSION);
      expect(r.warnings, raw).toHaveLength(1);
    }
  });

  it("cảnh báo đi vào startupWarnings (cấu hình sai thì người vận hành thấy lúc khởi động)", () => {
    const base = {
      NODE_ENV: "production",
      AUTH_MODE: "account",
      TRUST_PROXY: "1",
      STORE: "pg",
      DATABASE_URL: "postgres://x",
    };
    expect(startupWarnings({ ...base, MIN_PROTOCOL_VERSION: String(PROTOCOL_VERSION) })).toEqual(
      [],
    );
    const w = startupWarnings({ ...base, MIN_PROTOCOL_VERSION: "abc" });
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("MIN_PROTOCOL_VERSION");
  });
});
