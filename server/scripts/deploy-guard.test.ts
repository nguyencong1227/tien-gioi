import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  const gameBlock =
    content.match(/\n {2}game:\s*\n([\s\S]*?)(?=\n {2}[a-z0-9_-]+:|\s*$)/i)?.[1] ?? "";
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
  const dbBlock = content.match(/\n {2}db:\s*\n([\s\S]*?)(?=\n {2}[a-z0-9_-]+:|\s*$)/i)?.[1] ?? "";
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
  const requiredCmds = [
    "init",
    "up",
    "status",
    "logs",
    "backup",
    "restore",
    "rollback",
    "smoke",
    "xoa-tai-khoan",
  ];
  for (const cmd of requiredCmds) {
    const fnName = `cmd_${cmd.replace(/-/g, "_")}`;
    if (!content.includes(fnName) || !content.includes(`${cmd})`)) {
      errors.push(`prod.sh thiếu lệnh '${cmd}' (cần cả ${fnName} và ${cmd}))`);
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

  // 6. Kiểm tra an toàn của xoa-tai-khoan (tự backup, stop game, run tai-khoan, up game, regex tên)
  const xoaBlock = content.match(/cmd_xoa_tai_khoan\(\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  if (!xoaBlock) {
    errors.push("prod.sh thiếu định nghĩa hàm cmd_xoa_tai_khoan");
  } else {
    if (!xoaBlock.includes("cmd_backup")) {
      errors.push("cmd_xoa_tai_khoan phải tự động gọi cmd_backup trước khi xoá");
    }
    if (!xoaBlock.includes("compose_cmd stop game")) {
      errors.push("cmd_xoa_tai_khoan phải tạm dừng game bằng compose_cmd stop game");
    }
    if (!xoaBlock.includes("compose_cmd up -d game")) {
      errors.push("cmd_xoa_tai_khoan phải đảm bảo bật lại game bằng compose_cmd up -d game");
    }
    if (!xoaBlock.includes("^[a-z0-9_]{3,20}$")) {
      errors.push(
        "cmd_xoa_tai_khoan phải kiểm tra định dạng tên đăng nhập bằng regex ^[a-z0-9_]{3,20}$",
      );
    }
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

  it("tệp restore-test.sh đạt chuẩn kiểm tra khôi phục sao lưu", () => {
    const content = readFileSync(restoreTestShPath, "utf-8");
    expect(content).toContain("pg_isready");
    expect(content).toContain("LAST_RESTORE_OK");
    expect(content).toContain("restore-test.log");
    expect(content).toContain("SELECT count(*) FROM");
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
        'docker_cmd stop -t 30 "$GAME_CONTAINER" >/dev/null',
        "# bỏ qua docker stop",
      );
      expect(mutated).not.toBe(prodShContent);
      const res = validateProdSh(mutated);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("docker stop < 25s"))).toBe(true);
    });

    it("Đột biến 9: prod.sh thiếu lệnh xoa-tai-khoan -> KHÔNG ĐẠT", () => {
      const mutated = prodShContent.replace("xoa-tai-khoan)", "disabled-xoa)");
      expect(mutated).not.toBe(prodShContent);
      const res = validateProdSh(mutated);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("xoa-tai-khoan"))).toBe(true);
    });

    it("Đột biến 10: prod.sh xoa-tai-khoan bỏ tự động sao lưu trước khi xoá -> KHÔNG ĐẠT", () => {
      const mutated = prodShContent.replace(/cmd_xoa_tai_khoan\(\)\s*\{[\s\S]*?\n\}/, (block) =>
        block.replace("cmd_backup", "# bỏ backup"),
      );
      expect(mutated).not.toBe(prodShContent);
      const res = validateProdSh(mutated);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("cmd_backup"))).toBe(true);
    });

    it("Đột biến 11: prod.sh xoa-tai-khoan bỏ bật lại game sau khi xoá -> KHÔNG ĐẠT", () => {
      const mutated = prodShContent.replace(/cmd_xoa_tai_khoan\(\)\s*\{[\s\S]*?\n\}/, (block) =>
        block.replace("compose_cmd up -d game >/dev/null", "# bỏ compose_cmd up"),
      );
      expect(mutated).not.toBe(prodShContent);
      const res = validateProdSh(mutated);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("compose_cmd up -d game"))).toBe(true);
    });

    it("Đột biến 12: prod.sh xoa-tai-khoan bỏ kiểm tra regex tên đăng nhập -> KHÔNG ĐẠT", () => {
      const mutated = prodShContent.replace(/cmd_xoa_tai_khoan\(\)\s*\{[\s\S]*?\n\}/, (block) =>
        block.replaceAll("^[a-z0-9_]{3,20}$", ".*"),
      );
      expect(mutated).not.toBe(prodShContent);
      const res = validateProdSh(mutated);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("^[a-z0-9_]{3,20}$"))).toBe(true);
    });
  });
});

/**
 * Chạy `deploy/prod.sh` THẬT (bash) với `docker` và `curl` giả đặt trước trong PATH: máy CI / dev
 * không cần Docker, nhưng mọi lệnh Docker script gọi đều được ghi lại để kiểm. Các lỗi ở đây
 * từng lọt qua kiểm tĩnh (`includes("chmod 600")`...) vì chưa ai chạy script (review #311):
 * thiếu `--env-file` làm `up` chết ngay, `pg_dump` không `--clean` làm `restore` không ghi đè,
 * bài kiểm khôi phục đếm bảng không tồn tại mà vẫn xanh.
 */
describe("Hành vi thật của deploy/*.sh (docker giả, #299)", () => {
  let dir: string; // PROD_DIR giả (tên KHÔNG chứa "tien-gioi-prod")
  let binDir: string;
  let logFile: string;
  let psqlIn: string;

  const DOCKER_STUB = `#!/usr/bin/env bash
echo "docker $* [TIEN_GIOI_TAG=\${TIEN_GIOI_TAG:-}]" >> "$STUB_LOG"
case "$1" in
  ps) exit 0 ;;
  compose)
    if [[ " $* " == *" pull "* && "\${STUB_PULL_FAIL:-}" == 1 ]]; then echo "pull loi" >&2; exit 1; fi
    if [[ " $* " == *" run "* && -n "\${STUB_RUN_RC:-}" ]]; then exit "\$STUB_RUN_RC"; fi
    exit 0 ;;
  exec)
    if [[ " $* " == *" pg_dump "* ]]; then
      if [[ "\${STUB_DUMP_FAIL:-}" == 1 ]]; then echo "-- dump cut"; exit 1; fi
      printf -- '-- dump\\nSELECT 1;\\n'; exit 0
    fi
    if [[ " $* " == *" psql "* ]]; then cat > "$STUB_PSQL_IN"; exit "\${STUB_PSQL_RC:-0}"; fi
    exit 0 ;;
  inspect) echo "\${STUB_EXIT_CODE:-0}"; exit 0 ;;
esac
exit 0
`;
  const CURL_STUB = `#!/usr/bin/env bash
args="$*"
if [[ "$args" == *"%{http_code}"* ]]; then
  if [[ "$args" == *"Authorization"* ]]; then printf 200; else printf 401; fi
else
  echo '{"ok":true,"authMode":"account"}'
fi
`;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "a-deploy-"));
    binDir = path.join(dir, "bin");
    logFile = path.join(dir, "docker.log");
    psqlIn = path.join(dir, "psql.in");
    mkdirp(binDir);
    writeFileSync(path.join(binDir, "docker"), DOCKER_STUB);
    writeFileSync(path.join(binDir, "curl"), CURL_STUB);
    chmodSync(path.join(binDir, "docker"), 0o755);
    chmodSync(path.join(binDir, "curl"), 0o755);
    writeFileSync(logFile, "");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function mkdirp(p: string): void {
    spawnSync("mkdir", ["-p", p]);
  }
  const prodDir = (): string => path.join(dir, "prod");
  function sh(script: string, args: string[], env: Record<string, string> = {}) {
    const r = spawnSync("bash", [script, ...args], {
      encoding: "utf-8",
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH}`,
        PROD_DIR: prodDir(),
        STUB_LOG: logFile,
        STUB_PSQL_IN: psqlIn,
        ...env,
      },
    });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  }
  const prod = (args: string[], env: Record<string, string> = {}) => sh(prodShPath, args, env);
  const dockerLog = (): string[] =>
    readFileSync(logFile, "utf-8")
      .split("\n")
      .filter((l) => l.length > 0);
  const envFile = (): string => path.join(prodDir(), ".env.production");
  const readTag = (f: string): string => readFileSync(path.join(prodDir(), f), "utf-8").trim();

  it("init: .env.production quyền 600, không in bí mật, chép compose + prod.sh + restore-test.sh", () => {
    const r = prod(["init"]);
    expect(r.code).toBe(0);
    expect(statSync(envFile()).mode & 0o777).toBe(0o600);
    const env = readFileSync(envFile(), "utf-8");
    const secrets = [...env.matchAll(/^(?:POSTGRES_PASSWORD|METRICS_TOKEN)=(.+)$/gm)].map(
      (m) => m[1],
    );
    expect(secrets).toHaveLength(2);
    for (const secret of secrets) {
      expect(secret).toMatch(/^[0-9a-f]{48}$/);
      expect(r.out).not.toContain(secret);
    }
    // App Android (nguồn https://localhost) cần CORS để đăng nhập với server thật; mặc định server TẮT CORS
    expect(env).toMatch(/^CORS_ORIGINS=https:\/\/localhost$/m);
    expect(existsSync(path.join(prodDir(), "docker-compose.yml"))).toBe(true);
    // Bộ hẹn giờ systemd gọi các tệp này TRONG thư mục chạy thật
    for (const f of ["prod.sh", "restore-test.sh"]) {
      expect(statSync(path.join(prodDir(), f)).mode & 0o111).not.toBe(0);
    }
    // init lần hai giữ nguyên bí mật cũ
    prod(["init"]);
    expect(readFileSync(envFile(), "utf-8")).toBe(env);
  });

  it("up nhận cả v0.1.0 lẫn 0.1.0; MỌI lệnh compose đều có --env-file; kéo ảnh bằng thẻ mới", () => {
    prod(["init"]);
    expect(prod(["up", "v0.1.0"]).code).toBe(0);
    expect(readTag(".current-tag")).toBe("0.1.0");
    expect(readFileSync(envFile(), "utf-8")).toMatch(/^TIEN_GIOI_TAG=0\.1\.0$/m);

    expect(prod(["up", "0.2.0"]).code).toBe(0);
    expect(readTag(".current-tag")).toBe("0.2.0");
    expect(readTag(".last-tag")).toBe("0.1.0");

    const composeCalls = dockerLog().filter(
      (l) => l.startsWith("docker compose") && !l.startsWith("docker compose version"),
    );
    expect(composeCalls.length).toBeGreaterThanOrEqual(4);
    for (const call of composeCalls) {
      // Thiếu --env-file thì compose báo "required variable POSTGRES_PASSWORD is missing"
      expect(call).toContain(`--env-file ${envFile()}`);
    }
    const pulls = composeCalls.filter((l) => / pull game/.test(l));
    expect(pulls[0]).toContain("TIEN_GIOI_TAG=0.1.0");
    expect(pulls[1]).toContain("TIEN_GIOI_TAG=0.2.0");

    const rollback = prod(["rollback"]);
    expect(rollback.code).toBe(0);
    expect(readTag(".current-tag")).toBe("0.1.0");
  });

  it("up: thẻ sai định dạng bị từ chối trước khi đụng tới Docker hay tệp", () => {
    prod(["init"]);
    for (const bad of ["latest", "v0.1", "0.1.0; rm -rf /", "../0.1.0", ""]) {
      const r = prod(bad === "" ? ["up"] : ["up", bad]);
      expect(r.code).not.toBe(0);
    }
    expect(dockerLog().filter((l) => / pull /.test(l))).toEqual([]);
    expect(existsSync(path.join(prodDir(), ".current-tag"))).toBe(false);
  });

  it("up: kéo ảnh hỏng thì KHÔNG đổi .env.production / .current-tag / .last-tag", () => {
    prod(["init"]);
    expect(prod(["up", "0.1.0"]).code).toBe(0);
    const envBefore = readFileSync(envFile(), "utf-8");
    const r = prod(["up", "0.2.0"], { STUB_PULL_FAIL: "1" });
    expect(r.code).not.toBe(0);
    expect(readFileSync(envFile(), "utf-8")).toBe(envBefore);
    expect(readTag(".current-tag")).toBe("0.1.0");
    expect(existsSync(path.join(prodDir(), ".last-tag"))).toBe(false);
    expect(dockerLog().some((l) => / up -d/.test(l) && /TIEN_GIOI_TAG=0\.2\.0/.test(l))).toBe(
      false,
    );
  });

  it("backup: pg_dump có --clean --if-exists, không cấp TTY, tệp gzip hợp lệ; lỗi thì không để lại bản dở", () => {
    prod(["init"]);
    const ok = prod(["backup"]);
    expect(ok.code).toBe(0);
    const backups = (): string[] => readdirSync(path.join(prodDir(), "backups"));
    const files = backups().filter((f) => /^tiengioi-.*\.sql\.gz$/.test(f));
    expect(files).toHaveLength(1);
    expect(
      gunzipSync(readFileSync(path.join(prodDir(), "backups", files[0]))).toString(),
    ).toContain("SELECT 1;");
    const dump = dockerLog().find((l) => l.includes(" pg_dump "));
    expect(dump).toBeDefined();
    expect(dump).toContain("--clean --if-exists");
    expect(dump).not.toMatch(/exec (-\w*t\w* |-i -t )/); // không `-t` / `-it`

    rmSync(path.join(prodDir(), "backups", files[0]));
    const bad = prod(["backup"], { STUB_DUMP_FAIL: "1" });
    expect(bad.code).not.toBe(0);
    expect(backups().filter((f) => f.startsWith("tiengioi-"))).toEqual([]); // cả .partial
  });

  it("restore: dừng game -> psql ON_ERROR_STOP + single-transaction -> bật lại game; lỗi vẫn bật lại và trả mã lỗi", () => {
    prod(["init"]);
    const sql = "DROP TABLE IF EXISTS t;\nCREATE TABLE t(id int);\n";
    const file = path.join(dir, "ban-sao-luu.sql.gz");
    writeFileSync(file, gzipSync(sql));

    const ok = prod(["restore", file, "--yes"]);
    expect(ok.code).toBe(0);
    expect(readFileSync(psqlIn, "utf-8")).toBe(sql);
    const calls = dockerLog();
    const iStop = calls.findIndex((l) => / stop game/.test(l));
    const iPsql = calls.findIndex((l) => l.includes(" psql "));
    const iUp = calls.findIndex((l) => / up -d game/.test(l));
    expect(iStop).toBeGreaterThanOrEqual(0);
    expect(iPsql).toBeGreaterThan(iStop);
    expect(iUp).toBeGreaterThan(iPsql);
    expect(calls[iPsql]).toContain("ON_ERROR_STOP=1");
    expect(calls[iPsql]).toContain("--single-transaction");

    writeFileSync(logFile, "");
    const fail = prod(["restore", file, "--yes"], { STUB_PSQL_RC: "3" });
    expect(fail.code).toBe(3);
    const after = dockerLog();
    expect(after.findIndex((l) => / up -d game/.test(l))).toBeGreaterThan(
      after.findIndex((l) => l.includes(" psql ")),
    );

    // Tệp không phải gzip: từ chối, không động tới game hay cơ sở dữ liệu
    writeFileSync(logFile, "");
    const notGz = path.join(dir, "hong.sql.gz");
    writeFileSync(notGz, "khong phai gzip");
    expect(prod(["restore", notGz, "--yes"]).code).not.toBe(0);
    expect(dockerLog().some((l) => l.includes(" psql ") || / stop game/.test(l))).toBe(false);
  });

  it("smoke: đạt khi tắt êm (mã 0); mã thoát 143 thì ĐỎ nhưng game vẫn được bật lại", () => {
    prod(["init"]);
    const ok = prod(["smoke"]);
    expect(ok.code).toBe(0);

    writeFileSync(logFile, "");
    const killed = prod(["smoke"], { STUB_EXIT_CODE: "143" });
    expect(killed.code).not.toBe(0);
    expect(killed.out).toContain("143");
    const calls = dockerLog();
    const iStop = calls.findIndex((l) => l.startsWith("docker stop"));
    const iUp = calls.findIndex((l) => / up -d game/.test(l));
    expect(iStop).toBeGreaterThanOrEqual(0);
    expect(iUp).toBeGreaterThan(iStop); // bản chạy thật không bị bỏ nằm tắt
  });

  it("xoa-tai-khoan: tên sai regex bị từ chối trước Docker; chạy thử không backup/stop/up; chạy thật có backup -> stop -> run -> up", () => {
    prod(["init"]);

    // 1. Tên sai regex bị từ chối trước khi gọi bất kỳ lệnh Docker nào
    for (const bad of ["", "ab", "user;rm -rf", "user name", "user@email", "a".repeat(21)]) {
      writeFileSync(logFile, "");
      const r = prod(bad === "" ? ["xoa-tai-khoan"] : ["xoa-tai-khoan", bad]);
      expect(r.code, bad).toBe(1);
      expect(dockerLog().some((l) => l.includes(" run "))).toBe(false);
    }

    // 2. Chạy thử (không có --yes): gọi compose run, KHÔNG gọi backup, KHÔNG stop game, KHÔNG up game
    writeFileSync(logFile, "");
    const dry = prod(["xoa-tai-khoan", "nguoi_dung_1"]);
    expect(dry.code).toBe(0);
    const dryCalls = dockerLog();
    expect(dryCalls.some((l) => l.includes(" run ") && l.includes("nguoi_dung_1"))).toBe(true);
    expect(dryCalls.some((l) => l.includes(" pg_dump "))).toBe(false);
    expect(dryCalls.some((l) => l.includes(" stop game"))).toBe(false);
    expect(dryCalls.some((l) => l.includes(" up -d game"))).toBe(false);

    // 3. Chạy thật (có --yes): backup -> stop game -> run ... --yes -> up -d game
    writeFileSync(logFile, "");
    const real = prod(["xoa-tai-khoan", "nguoi_dung_1", "--yes"]);
    expect(real.code).toBe(0);
    const realCalls = dockerLog();
    const iBackup = realCalls.findIndex((l) => l.includes(" pg_dump "));
    const iStop = realCalls.findIndex((l) => l.includes(" stop game"));
    const iRun = realCalls.findIndex((l) => l.includes(" run ") && l.includes("--yes"));
    const iUp = realCalls.findIndex((l) => l.includes(" up -d game"));
    expect(iBackup).toBeGreaterThanOrEqual(0);
    expect(iStop).toBeGreaterThan(iBackup);
    expect(iRun).toBeGreaterThan(iStop);
    expect(iUp).toBeGreaterThan(iRun);

    // 4. Chạy thật có lỗi (STUB_RUN_RC: "2"): trả mã lỗi 2, nhưng game VẪN ĐƯỢC BẬT LẠI sau đó
    writeFileSync(logFile, "");
    const fail = prod(["xoa-tai-khoan", "nguoi_dung_1", "--yes"], { STUB_RUN_RC: "2" });
    expect(fail.code).toBe(2);
    const failCalls = dockerLog();
    const failRun = failCalls.findIndex((l) => l.includes(" run "));
    const failUp = failCalls.findIndex((l) => l.includes(" up -d game"));
    expect(failRun).toBeGreaterThanOrEqual(0);
    expect(failUp).toBeGreaterThan(failRun);
  });

  it("restore-test.sh: danh sách bảng khớp migration, không nuốt lỗi, nạp bằng ON_ERROR_STOP", () => {
    const script = readFileSync(restoreTestShPath, "utf-8");
    const listed = (script.match(/^REQUIRED_TABLES=\(([^)]*)\)/m)?.[1] ?? "")
      .split(/\s+/)
      .filter(Boolean);
    // Bảng thật: các tệp migration + bảng ghi sổ phiên bản của migrate.ts
    const migrationsDir = path.resolve(repoRoot, "server/migrations");
    const real = new Set<string>(["schema_migrations"]);
    for (const f of readdirSync(migrationsDir).filter((n) => n.endsWith(".sql"))) {
      for (const m of readFileSync(path.join(migrationsDir, f), "utf-8").matchAll(
        /CREATE TABLE (?:IF NOT EXISTS )?(\w+)/gi,
      )) {
        real.add(m[1]);
      }
    }
    // Bản trước đếm bảng `players` không tồn tại và `|| echo "0"` nuốt lỗi nên không bao giờ đỏ
    expect([...listed].sort()).toEqual([...real].sort());
    expect(script).not.toMatch(/\|\|\s*echo\s+["']?0["']?/);
    expect(script).toContain("ON_ERROR_STOP=1");
    expect(script).toContain("--single-transaction");
    expect(script).toMatch(/gzip -t/);
  });

  it("tệp systemd: ExecStart trỏ tới tệp mà init chép vào thư mục chạy thật; Persistent chỉ trong [Timer]", () => {
    const installed = new Set(["prod.sh", "restore-test.sh"]);
    for (const f of readdirSync(deployDir).filter((n) =>
      /^tien-gioi-.*\.(service|timer)$/.test(n),
    )) {
      const content = readFileSync(path.join(deployDir, f), "utf-8");
      for (const m of content.matchAll(/^ExecStart=(\S+)/gm)) {
        expect(m[1].startsWith("%h/TT/tien-gioi-prod/")).toBe(true);
        expect(installed.has(path.basename(m[1]))).toBe(true);
      }
      const unitSection = content.split(/^\[(?!Unit\])/m)[0];
      expect(unitSection).not.toMatch(/^Persistent=/m);
      if (f.endsWith(".timer")) expect(content).toMatch(/^\[Timer\][\s\S]*^OnCalendar=/m);
    }
    expect(readdirSync(deployDir)).toEqual(
      expect.arrayContaining([
        "tien-gioi-backup.timer",
        "tien-gioi-restore-test.service",
        "tien-gioi-restore-test.timer",
      ]),
    );
  });
});
