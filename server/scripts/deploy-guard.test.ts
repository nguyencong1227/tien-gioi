import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertNotProd, PROD_DOMAIN, PROD_DIR_NAME } from "./assert-not-prod.js";

const repoRoot = path.resolve(__dirname, "../..");
const deployDir = path.resolve(repoRoot, "deploy");
const composeProdPath = path.resolve(deployDir, "docker-compose.prod.yml");
const prodShPath = path.resolve(deployDir, "prod.sh");
const restoreTestShPath = path.resolve(deployDir, "restore-test.sh");

/**
 * Hàm kiểm tra chính sách bảo mật cho docker-compose.prod.yml (M4 3.6, Issue #299).
 */
export function validateProdCompose(content: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 1. Tuyệt đối không có lệnh build: trong file compose production
  if (/^\s*build\s*:/m.test(content)) {
    errors.push("docker-compose.prod.yml không được chứa từ khóa 'build:' (phải kéo ảnh từ GHCR)");
  }

  // 2. Cổng dịch vụ game CHỈ được lắng nghe trên loopback 127.0.0.1:2567
  const gameBlock = content.match(/\n  game:\s*\n([\s\S]*?)(?=\n  [a-z0-9_-]+:|\s*$)/i)?.[1] ?? "";
  const portsMatch = gameBlock.match(/ports:\s*\n([\s\S]*?)(?=\n {4}[a-zA-Z0-9_-]+:|\s*$)/);
  if (!portsMatch) {
    errors.push("dịch vụ game thiếu cấu hình ports rõ ràng");
  } else {
    const portLines = portsMatch[1]
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("-"));
    const hasOnlyLoopback =
      portLines.length > 0 && portLines.every((p) => p.includes("127.0.0.1:2567:2567"));
    if (!hasOnlyLoopback) {
      errors.push("Cổng game phải ràng buộc chặt chẽ vào 127.0.0.1:2567:2567 (chống mở 0.0.0.0)");
    }
  }

  // 3. Cơ sở dữ liệu db tuyệt đối không được mở cổng (không có mục ports trong khối db)
  const dbBlock = content.match(/\n  db:\s*\n([\s\S]*?)(?=\n  [a-z0-9_-]+:|\s*$)/i)?.[1] ?? "";
  if (/^\s*ports\s*:/m.test(dbBlock)) {
    errors.push("Dịch vụ db (PostgreSQL) không được mở cổng ra ngoài host / Internet");
  }

  // 4. Các cờ môi trường bắt buộc
  if (!content.includes("TIEN_GIOI_PROD=1")) {
    errors.push("Thiếu TIEN_GIOI_PROD=1 (bắt buộc để server chấp nhận lắng nghe ở cổng 2567)");
  }
  if (!content.includes("STORE=pg")) {
    errors.push("Thiếu cấu hình STORE=pg cho bản chạy thật");
  }
  if (!content.includes("NODE_ENV=production")) {
    errors.push("Thiếu cấu hình NODE_ENV=production");
  }

  // 5. Chính sách restart
  if (!content.includes("restart: unless-stopped") && !content.includes("restart: always")) {
    errors.push("Dịch vụ phải có chính sách restart (unless-stopped hoặc always)");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Hàm kiểm tra chính sách cho prod.sh
 */
export function validateProdSh(content: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 1. Phải chuẩn hoá bỏ tiền tố 'v' từ thẻ tag (hỗ trợ cả v0.1.0 và 0.1.0)
  if (!content.includes("${raw_tag#v}") && !content.includes("${1#v}")) {
    errors.push("prod.sh up phải chuẩn hoá loại bỏ tiền tố 'v' nếu có (ảnh GHCR không có 'v')");
  }

  // 2. Sinh bí mật bằng openssl rand -hex 24
  if (!content.includes("openssl rand -hex 24")) {
    errors.push("prod.sh init phải sinh bí mật ngẫu nhiên bảo mật cao bằng 'openssl rand -hex 24'");
  }

  // 3. Phân quyền tệp .env.production là 600
  if (!content.includes("chmod 600")) {
    errors.push("prod.sh init phải gán quyền chmod 600 cho file .env.production");
  }

  // 4. Có các lệnh vận hành cốt lõi
  const requiredCmds = ["init", "up", "status", "logs", "backup", "restore", "rollback", "smoke"];
  for (const cmd of requiredCmds) {
    if (!content.includes(`cmd_${cmd}`) && !content.includes(`${cmd})`)) {
      errors.push(`prod.sh thiếu lệnh '${cmd}'`);
    }
  }

  // 5. Kiểm tra tắt êm trong smoke (docker stop < 25s, mã thoát 0)
  if (
    !content.includes("docker_cmd stop") ||
    !content.includes("-ge 25") ||
    !content.includes('"$code" != "0"')
  ) {
    errors.push(
      "prod.sh smoke phải có bước kiểm tra tắt êm container game (docker stop < 25s, mã thoát 0)",
    );
  }

  return { valid: errors.length === 0, errors };
}

describe("Hàng rào bảo vệ môi trường dev và kiểm tra triển khai (M4 3.6, Issue #299)", () => {
  it("assertNotProd từ chối đúng các mục tiêu thuộc về bản chạy thật (cổng 2567, domain, thư mục prod)", () => {
    // 1. Từ chối cổng 2567
    expect(() => assertNotProd(2567, "test")).toThrow(/2567/);
    expect(() => assertNotProd("2567", "test")).toThrow(/2567/);
    expect(() => assertNotProd("http://127.0.0.1:2567", "test")).toThrow(/2567/);
    expect(() => assertNotProd("ws://localhost:2567", "test")).toThrow(/2567/);
    expect(() => assertNotProd("http://0.0.0.0:2567/health", "test")).toThrow(/2567/);

    // 2. Từ chối tên miền production
    expect(() => assertNotProd(PROD_DOMAIN, "test")).toThrow(/tiengioi\.hethongtm\.site/);
    expect(() => assertNotProd(`https://${PROD_DOMAIN}/health`, "test")).toThrow(
      /tiengioi\.hethongtm\.site/,
    );
    expect(() => assertNotProd(`wss://${PROD_DOMAIN}`, "test")).toThrow(
      /tiengioi\.hethongtm\.site/,
    );

    // 3. Từ chối thư mục production
    expect(() => assertNotProd(`/home/nguyencong/TT/${PROD_DIR_NAME}`, "test")).toThrow(
      /tien-gioi-prod/,
    );
    expect(() => assertNotProd(`~/TT/${PROD_DIR_NAME}/data`, "test")).toThrow(/tien-gioi-prod/);
  });

  it("assertNotProd cho phép các cổng và môi trường an toàn của dev", () => {
    expect(() => assertNotProd(undefined, "test")).not.toThrow();
    expect(() => assertNotProd(null, "test")).not.toThrow();
    expect(() => assertNotProd(2587, "test")).not.toThrow(); // Dev C
    expect(() => assertNotProd(2577, "test")).not.toThrow(); // Dev B
    expect(() => assertNotProd(2597, "test")).not.toThrow(); // Dev A
    expect(() => assertNotProd(5173, "test")).not.toThrow();
    expect(() => assertNotProd("http://localhost:2587", "test")).not.toThrow();
    expect(() => assertNotProd("/home/nguyencong/TT/tien-gioi-c/data", "test")).not.toThrow();
  });

  it("quét tĩnh: không công cụ dev nào mặc định nhắm cổng 2567, tên miền thật hay thư mục prod", () => {
    const scriptsDir = path.resolve(repoRoot, "server/scripts");
    const scriptFiles = readdirSync(scriptsDir).filter((f) => f.endsWith(".ts"));

    for (const file of scriptFiles) {
      if (file === "assert-not-prod.ts" || file === "deploy-guard.test.ts") continue;
      const content = readFileSync(path.resolve(scriptsDir, file), "utf-8");

      // Không script nào được hardcode domain thật làm default kết nối
      expect(content).not.toMatch(/DEFAULT_URL\s*=\s*["'][^"']*tiengioi\.hethongtm\.site/);

      // Không script nào được mặc định cổng 2567 làm fallback (phải là 2587, 2577, 2597 hoặc biến môi trường)
      expect(content).not.toMatch(
        /DEFAULT_PORT\s*=\s*(?:Number\(process\.env\.PORT\s*\?\?\s*)?2567\b/,
      );
      expect(content).not.toMatch(/port\s*=\s*Number\(process\.env\.PORT\s*\?\?\s*2567\)/);
    }
  });

  it("tệp docker-compose.prod.yml đạt chuẩn bảo mật và độc lập", () => {
    const content = readFileSync(composeProdPath, "utf-8");
    const res = validateProdCompose(content);
    expect(res.errors).toEqual([]);
    expect(res.valid).toBe(true);
  });

  it("tệp prod.sh đạt chuẩn chất lượng và an toàn", () => {
    const content = readFileSync(prodShPath, "utf-8");
    const res = validateProdSh(content);
    expect(res.errors).toEqual([]);
    expect(res.valid).toBe(true);
  });

  describe("Kiểm thử 8 đột biến kiểm chứng (Mutation Testing)", () => {
    const composeContent = readFileSync(composeProdPath, "utf-8");
    const prodShContent = readFileSync(prodShPath, "utf-8");

    it("Đột biến 1: Mở cổng 0.0.0.0 (2567:2567) thay vì 127.0.0.1:2567:2567 -> KHÔNG ĐẠT", () => {
      const mutated = composeContent.replace("127.0.0.1:2567:2567", "2567:2567");
      expect(mutated).not.toBe(composeContent);
      const res = validateProdCompose(mutated);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("127.0.0.1"))).toBe(true);
    });

    it("Đột biến 2: Thêm build: vào compose prod -> KHÔNG ĐẠT", () => {
      const mutated = composeContent.replace("image: ghcr.io", "build: .\n    image: ghcr.io");
      expect(mutated).not.toBe(composeContent);
      const res = validateProdCompose(mutated);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("build:"))).toBe(true);
    });

    it("Đột biến 3: Mở ports cho dịch vụ db (PostgreSQL) -> KHÔNG ĐẠT", () => {
      const mutated = composeContent.replace(
        "container_name: tien-gioi-db",
        "container_name: tien-gioi-db\n    ports:\n      - '5432:5432'",
      );
      expect(mutated).not.toBe(composeContent);
      const res = validateProdCompose(mutated);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("db (PostgreSQL) không được mở cổng"))).toBe(true);
    });

    it("Đột biến 4: Bỏ cờ TIEN_GIOI_PROD=1 -> KHÔNG ĐẠT", () => {
      const mutated = composeContent.replace("TIEN_GIOI_PROD=1", "TIEN_GIOI_PROD=0");
      expect(mutated).not.toBe(composeContent);
      const res = validateProdCompose(mutated);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("TIEN_GIOI_PROD=1"))).toBe(true);
    });

    it("Đột biến 5: Bỏ restart: unless-stopped -> KHÔNG ĐẠT", () => {
      const mutated = composeContent.replace(/restart:\s*unless-stopped/g, "restart: 'no'");
      expect(mutated).not.toBe(composeContent);
      const res = validateProdCompose(mutated);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("chính sách restart"))).toBe(true);
    });

    it("Đột biến 6: prod.sh không bỏ tiền tố 'v' khi nhận thẻ -> KHÔNG ĐẠT", () => {
      const mutated = prodShContent.replace('local tag="${raw_tag#v}"', 'local tag="$raw_tag"');
      expect(mutated).not.toBe(prodShContent);
      const res = validateProdSh(mutated);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("chuẩn hoá loại bỏ tiền tố 'v'"))).toBe(true);
    });

    it("Đột biến 7: prod.sh bỏ chmod 600 cho .env.production -> KHÔNG ĐẠT", () => {
      const mutated = prodShContent.replace('chmod 600 "$ENV_FILE"', 'chmod 644 "$ENV_FILE"');
      expect(mutated).not.toBe(prodShContent);
      const res = validateProdSh(mutated);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("chmod 600"))).toBe(true);
    });

    it("Đột biến 8: prod.sh smoke bỏ kiểm tra tắt êm (docker stop < 25s, mã thoát 0) -> KHÔNG ĐẠT", () => {
      const mutated = prodShContent.replace(
        "docker_cmd stop -t 30 tien-gioi >/dev/null",
        "# bỏ qua docker stop",
      );
      expect(mutated).not.toBe(prodShContent);
      const res = validateProdSh(mutated);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("docker stop < 25s"))).toBe(true);
    });
  });
});
