import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkEnvConsistency,
  scanComposeInterpolatedVars,
  scanSourceEnvVars,
  verifyDockerComposeEnvFile,
} from "./check-env";

describe("check-env (Kiểm tra nhất quán biến môi trường #276)", () => {
  it("phát hiện đầy đủ các biến môi trường chính trong server/src", () => {
    const vars = scanSourceEnvVars();
    expect(vars.has("PORT")).toBe(true);
    expect(vars.has("DATA_DIR")).toBe(true);
    expect(vars.has("STORE")).toBe(true);
    expect(vars.has("DATABASE_URL")).toBe(true);
    expect(vars.has("AUTH_MODE")).toBe(true);
    expect(vars.has("NODE_ENV")).toBe(true);
    expect(vars.has("AUDIT_LOG")).toBe(true);
    expect(vars.has("MIN_PROTOCOL_VERSION")).toBe(true);
  });

  it("phát hiện biến nội suy POSTGRES_PASSWORD từ docker-compose*.yml", () => {
    const composeVars = scanComposeInterpolatedVars();
    expect(composeVars.has("POSTGRES_PASSWORD")).toBe(true);
  });

  it("kiểm tra tĩnh docker-compose.yml có khai báo env_file .env.production và required: false", () => {
    const res = verifyDockerComposeEnvFile();
    expect(res.ok).toBe(true);
    expect(res.error).toBeUndefined();
  });

  it("toàn bộ biến môi trường trong server/src, compose và docs/TRIEN_KHAI.md phải khớp 100%", () => {
    const res = checkEnvConsistency();
    expect(res.undocumentedInCode).toEqual([]);
    expect(res.undocumentedInCompose).toEqual([]);
    expect(res.staleInDoc).toEqual([]);
    expect(res.unknownInExample).toEqual([]);
    expect(res.composeEnvFileOk).toBe(true);
    expect(res.ok).toBe(true);
  });

  describe("kiểm chứng đột biến (Mutation Testing)", () => {
    it("đỏ khi docker-compose.yml thiếu cấu hình env_file .env.production", () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), "check-compose-mut-"));
      try {
        const dummyCompose = path.join(tmpDir, "docker-compose.yml");
        // Compose ghi cứng không có env_file
        writeFileSync(dummyCompose, "services:\n  game:\n    image: tien-gioi\n");
        const res = verifyDockerComposeEnvFile(tmpDir);
        expect(res.ok).toBe(false);
        expect(res.error).toContain(".env.production");
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("đỏ khi mã nguồn xuất hiện biến môi trường chưa khai báo trong docs", () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), "check-env-mut-"));
      try {
        const dummySrc = path.join(tmpDir, "src");
        mkdirSync(dummySrc, { recursive: true });
        const dummyDoc = path.join(tmpDir, "TRIEN_KHAI.md");
        const dummyExample = path.join(tmpDir, ".env.production.example");
        const dummyCompose = path.join(tmpDir, "docker-compose.yml");

        // Source code có biến mới ZZZ_MOI
        writeFileSync(
          dummySrc + "/index.ts",
          'const x = process.env.ZZZ_MOI ?? "default";\nconst port = process.env.PORT;\n',
        );
        // Doc chỉ có PORT
        writeFileSync(dummyDoc, "## Bảng biến môi trường chính thức\n| `PORT` | 2567 | Cổng |\n");
        writeFileSync(dummyExample, "PORT=2567\n");
        writeFileSync(
          dummyCompose,
          "services:\n  game:\n    env_file:\n      - path: .env.production\n        required: false\n",
        );

        const res = checkEnvConsistency({
          srcDir: dummySrc,
          docPath: dummyDoc,
          examplePath: dummyExample,
          repoRoot: tmpDir,
        });

        expect(res.ok).toBe(false);
        expect(res.undocumentedInCode).toContain("ZZZ_MOI");
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("đỏ khi docs chứa biến không còn tồn tại trong mã nguồn lẫn compose", () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), "check-env-mut-"));
      try {
        const dummySrc = path.join(tmpDir, "src");
        mkdirSync(dummySrc, { recursive: true });
        const dummyDoc = path.join(tmpDir, "TRIEN_KHAI.md");
        const dummyExample = path.join(tmpDir, ".env.production.example");
        const dummyCompose = path.join(tmpDir, "docker-compose.yml");

        writeFileSync(dummySrc + "/index.ts", "const p = process.env.PORT;\n");
        // Doc khai báo biến cổ GIA_CO_KHONG_DUNG
        writeFileSync(
          dummyDoc,
          "## Bảng biến môi trường chính thức\n| `PORT` | 2567 | Cổng |\n| `GIA_CO_KHONG_DUNG` | off | Cũ |\n",
        );
        writeFileSync(dummyExample, "PORT=2567\n");
        writeFileSync(
          dummyCompose,
          "services:\n  game:\n    env_file:\n      - path: .env.production\n        required: false\n",
        );

        const res = checkEnvConsistency({
          srcDir: dummySrc,
          docPath: dummyDoc,
          examplePath: dummyExample,
          repoRoot: tmpDir,
        });

        expect(res.ok).toBe(false);
        expect(res.staleInDoc).toContain("GIA_CO_KHONG_DUNG");
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("đỏ khi .env.production.example chứa biến không có trong docs", () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), "check-env-mut-"));
      try {
        const dummySrc = path.join(tmpDir, "src");
        mkdirSync(dummySrc, { recursive: true });
        const dummyDoc = path.join(tmpDir, "TRIEN_KHAI.md");
        const dummyExample = path.join(tmpDir, ".env.production.example");
        const dummyCompose = path.join(tmpDir, "docker-compose.yml");

        writeFileSync(dummySrc + "/index.ts", "const p = process.env.PORT;\n");
        writeFileSync(dummyDoc, "## Bảng biến môi trường chính thức\n| `PORT` | 2567 | Cổng |\n");
        // File example chứa biến lạ UNKNOWN_SETTING
        writeFileSync(dummyExample, "PORT=2567\nUNKNOWN_SETTING=123\n");
        writeFileSync(
          dummyCompose,
          "services:\n  game:\n    env_file:\n      - path: .env.production\n        required: false\n",
        );

        const res = checkEnvConsistency({
          srcDir: dummySrc,
          docPath: dummyDoc,
          examplePath: dummyExample,
          repoRoot: tmpDir,
        });

        expect(res.ok).toBe(false);
        expect(res.unknownInExample).toContain("UNKNOWN_SETTING");
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
