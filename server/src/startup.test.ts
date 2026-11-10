import { describe, expect, it } from "vitest";
import { startupWarnings } from "./startup";

describe("startupWarnings", () => {
  it("production, tài khoản và TRUST_PROXY đã đặt: không cảnh báo", () => {
    expect(
      startupWarnings({
        NODE_ENV: "production",
        AUTH_MODE: "account",
        TRUST_PROXY: "1",
        STORE: "pg",
        DATABASE_URL: "postgres://x",
      }),
    ).toEqual([]);
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

  it("STORE: production + file khuyến nghị pg; DATABASE_URL đặt mà STORE chưa pg thì báo PostgreSQL KHÔNG được dùng; STORE lạ báo; không bao giờ in URL", () => {
    const prod = { NODE_ENV: "production", AUTH_MODE: "account", TRUST_PROXY: "1" };
    expect(startupWarnings(prod).join("|")).toContain("STORE=file");
    const w = startupWarnings({
      ...prod,
      DATABASE_URL: "postgres://nguoi:bi-mat-123@may-chu/tiengioi",
    }).join("|");
    expect(w).toContain("DATABASE_URL đã đặt nhưng STORE chưa phải 'pg'");
    expect(w).not.toContain("bi-mat-123");
    expect(startupWarnings({ ...prod, STORE: "postgres", DATABASE_URL: "x" }).join("|")).toContain(
      "STORE='postgres' không hợp lệ",
    );
    expect(startupWarnings({ ...prod, STORE: "pg", DATABASE_URL: "postgres://x" })).toEqual([]);
  });
  it("dev (không production): STORE=file không thêm tiếng ồn ngoài cảnh báo /give", () => {
    expect(startupWarnings({ STORE: "file" })).toHaveLength(1);
  });
});
