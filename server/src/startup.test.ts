import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROD_PORT, portPolicy, startupWarnings } from "./startup";

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

describe("portPolicy: cổng 2567 chỉ của bản chạy thật", () => {
  it("cổng khác 2567: nhận, cờ bản chạy thật không ảnh hưởng", () => {
    expect(portPolicy({ PORT: "2597" })).toEqual({ ok: true, port: 2597 });
    expect(portPolicy({ PORT: " 2587 " })).toEqual({ ok: true, port: 2587 });
    expect(portPolicy({ PORT: "2597", TIEN_GIOI_PROD: "1" })).toEqual({ ok: true, port: 2597 });
    expect(portPolicy({ PORT: "1" })).toEqual({ ok: true, port: 1 });
    expect(portPolicy({ PORT: "65535" })).toEqual({ ok: true, port: 65535 });
  });

  it("2567 (kể cả khi không đặt PORT hay để trống) bị TỪ CHỐI nếu không phải bản chạy thật", () => {
    expect(PROD_PORT).toBe(2567);
    for (const env of [
      {},
      { PORT: "" },
      { PORT: "   " },
      { PORT: "2567" },
      { PORT: "02567" },
      { PORT: "2567", NODE_ENV: "production" }, // production một mình chưa đủ: phải có cờ
      { PORT: "2567", TIEN_GIOI_PROD: "0" },
      { PORT: "2567", TIEN_GIOI_PROD: "true" },
      { PORT: "2567", TIEN_GIOI_PROD: "" },
    ]) {
      const r = portPolicy(env);
      expect(r.ok, JSON.stringify(env)).toBe(false);
      if (!r.ok) expect(r.error).toContain("BẢN CHẠY THẬT");
    }
  });

  it("bản chạy thật (TIEN_GIOI_PROD=1): 2567 và mặc định đều được", () => {
    expect(portPolicy({ PORT: "2567", TIEN_GIOI_PROD: "1" })).toEqual({ ok: true, port: 2567 });
    expect(portPolicy({ TIEN_GIOI_PROD: "1" })).toEqual({ ok: true, port: 2567 });
  });

  it("PORT sai: từ chối với thông báo rõ (không phải số, âm, lẻ, quá lớn, bằng 0)", () => {
    for (const bad of ["abc", "-1", "25.5", "65536", "0", "99999", "1e3", "0x10", "2567abc"]) {
      const r = portPolicy({ PORT: bad, TIEN_GIOI_PROD: "1" });
      expect(r.ok, bad).toBe(false);
      if (!r.ok) expect(r.error).toContain("PORT");
    }
  });

  it("server thật (tsx src/index.ts) thoát mã 1 với thông báo khi PORT=2567 mà không có cờ: không bao giờ chiếm cổng 2567", () => {
    const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const env = { ...process.env, PORT: "2567" } as NodeJS.ProcessEnv;
    delete env.TIEN_GIOI_PROD;
    const r = spawnSync(process.execPath, ["--import", "tsx", "src/index.ts"], {
      cwd: serverDir,
      env,
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("BẢN CHẠY THẬT");
    expect(r.stdout).not.toContain("Tiên Giới server: http"); // chưa kịp mở cổng
  });
});
