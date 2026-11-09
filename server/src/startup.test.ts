import { describe, expect, it } from "vitest";
import { startupWarnings } from "./startup";

describe("startupWarnings", () => {
  it("production: không cảnh báo", () => {
    expect(startupWarnings({ NODE_ENV: "production" })).toEqual([]);
  });

  it("không đặt NODE_ENV hoặc đặt khác chữ production: cảnh báo lệnh /give", () => {
    for (const env of [
      {},
      { NODE_ENV: "development" },
      { NODE_ENV: "Production" },
      { NODE_ENV: "" },
    ]) {
      const w = startupWarnings(env);
      expect(w).toHaveLength(1);
      expect(w[0]).toContain("/give");
    }
  });
});
