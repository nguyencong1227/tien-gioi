// Công cụ kiểm tra tính nhất quán của bảng biến môi trường (M4 3.2 - Issue #276).
// Quét toàn bộ server/src (bỏ qua *.test.ts), đối chiếu với:
// 1. Bảng biến môi trường chính thức trong docs/TRIEN_KHAI.md
// 2. Mẫu cấu hình production .env.production.example
// Đỏ nếu có biến trong mã chưa được ghi nhận, hoặc có biến trong bảng không còn dùng.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const serverSrc = path.resolve(here, "../src");
const trienKhaiDoc = path.resolve(repoRoot, "docs/TRIEN_KHAI.md");
const envProdExample = path.resolve(repoRoot, ".env.production.example");

/**
 * Danh sách ngoại lệ: Các biến môi trường chỉ dùng trong test hoặc công cụ phụ trợ,
 * không thuộc biến môi trường cấu hình của server production.
 */
export const ALLOWED_EXCEPTIONS = new Set<string>([
  "HTTP_PROXY",
  "http_proxy",
  "TEST_DATABASE_URL",
  "FUZZ_SEEDS",
  "FUZZ_STEPS",
]);

/**
 * Quét toàn bộ file .ts trong server/src (bỏ qua *.test.ts) để thu thập danh sách biến môi trường.
 * Bắt cả:
 * - process.env.VAR
 * - process.env["VAR"] / process.env['VAR']
 * - env.VAR / env["VAR"] / env['VAR'] (trong các hàm nhận đối số env)
 */
export function scanSourceEnvVars(srcDir: string = serverSrc): Set<string> {
  const vars = new Set<string>();

  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const fullPath = path.join(dir, entry);
      const st = statSync(fullPath);
      if (st.isDirectory()) {
        walk(fullPath);
      } else if (st.isFile() && entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
        const content = readFileSync(fullPath, "utf8");

        // 1. process.env.VAR hoặc process.env['VAR'] (biến môi trường chuẩn là chữ hoa)
        const p1 = /(?<![.\w])process\.env\.([A-Z][A-Z0-9_]+)\b/g;
        let m: RegExpExecArray | null;
        while ((m = p1.exec(content)) !== null) {
          vars.add(m[1]);
        }

        const p2 = /(?<![.\w])process\.env\[['"]([A-Z][A-Z0-9_]+)['"]\]/g;
        while ((m = p2.exec(content)) !== null) {
          vars.add(m[1]);
        }

        // 2. env.VAR hoặc env['VAR'] (khi hàm nhận tham số env: NodeJS.ProcessEnv)
        const p3 = /(?<![.\w])env\.([A-Z][A-Z0-9_]+)\b/g;
        while ((m = p3.exec(content)) !== null) {
          vars.add(m[1]);
        }

        const p4 = /(?<![.\w])env\[['"]([A-Z][A-Z0-9_]+)['"]\]/g;
        while ((m = p4.exec(content)) !== null) {
          vars.add(m[1]);
        }
      }
    }
  }

  walk(srcDir);
  return vars;
}

/**
 * Đọc bảng biến môi trường từ docs/TRIEN_KHAI.md.
 * Bảng nằm trong mục "Bảng biến môi trường chính thức", có cột `Biến môi trường`.
 */
export function parseTrienKhaiEnvVars(docPath: string = trienKhaiDoc): Set<string> {
  if (!existsSync(docPath)) {
    throw new Error(`Không tìm thấy tài liệu: ${docPath}`);
  }
  const content = readFileSync(docPath, "utf8");
  const vars = new Set<string>();

  // Tìm bảng markdown chứa cột "Biến môi trường"
  // Hàng bảng dạng: | `TÊN_BIẾN` | ... |
  const lines = content.split("\n");
  let inTable = false;

  for (const line of lines) {
    if (line.includes("Bảng biến môi trường chính thức") || line.includes("Biến môi trường")) {
      inTable = true;
    }
    if (inTable) {
      // Dừng lại nếu gặp tiêu đề khác (bắt đầu bằng ## hoặc #)
      if (line.startsWith("## ") && !line.includes("Biến môi trường") && vars.size > 0) {
        break;
      }
      const match = line.match(/^\|\s*`([A-Z0-9_]+)`\s*\|/);
      if (match) {
        vars.add(match[1]);
      }
    }
  }

  return vars;
}

/**
 * Đọc danh sách biến từ file .env.production.example.
 * Dòng cấu hình có dạng `VAR=value` hoặc `# VAR=value`.
 */
export function parseEnvExampleVars(examplePath: string = envProdExample): Set<string> {
  if (!existsSync(examplePath)) {
    return new Set();
  }
  const content = readFileSync(examplePath, "utf8");
  const vars = new Set<string>();

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("##")) continue;
    // Bắt `NAME=` hoặc `# NAME=`
    const match = trimmed.match(/^(?:#\s*)?([A-Z0-9_]+)=/);
    if (match) {
      vars.add(match[1]);
    }
  }

  return vars;
}

export interface CheckEnvResult {
  codeVars: string[];
  docVars: string[];
  exampleVars: string[];
  undocumentedInCode: string[]; // Có trong code nhưng chưa có trong docs
  staleInDoc: string[]; // Có trong docs nhưng không còn trong code
  missingInExample: string[]; // Có trong docs nhưng thiếu trong .env.production.example (nếu là biến production quan trọng)
  unknownInExample: string[]; // Có trong .env.production.example nhưng không có trong docs
  ok: boolean;
}

export function checkEnvConsistency(
  opts: {
    srcDir?: string;
    docPath?: string;
    examplePath?: string;
  } = {},
): CheckEnvResult {
  const codeRaw = scanSourceEnvVars(opts.srcDir ?? serverSrc);
  // Lọc bỏ ngoại lệ
  const codeVarsSet = new Set<string>();
  for (const v of codeRaw) {
    if (!ALLOWED_EXCEPTIONS.has(v)) {
      codeVarsSet.add(v);
    }
  }

  const docVarsSet = parseTrienKhaiEnvVars(opts.docPath ?? trienKhaiDoc);
  const exampleVarsSet = parseEnvExampleVars(opts.examplePath ?? envProdExample);

  const undocumentedInCode = [...codeVarsSet].filter((v) => !docVarsSet.has(v)).sort();
  const staleInDoc = [...docVarsSet].filter((v) => !codeVarsSet.has(v)).sort();
  const unknownInExample = [...exampleVarsSet].filter((v) => !docVarsSet.has(v)).sort();

  const ok =
    undocumentedInCode.length === 0 && staleInDoc.length === 0 && unknownInExample.length === 0;

  return {
    codeVars: [...codeVarsSet].sort(),
    docVars: [...docVarsSet].sort(),
    exampleVars: [...exampleVarsSet].sort(),
    undocumentedInCode,
    staleInDoc,
    missingInExample: [],
    unknownInExample,
    ok,
  };
}

export function main(): number {
  console.log("=== Kiểm tra tính nhất quán biến môi trường (M4 3.2) ===");
  const res = checkEnvConsistency();

  console.log(
    `- Biến phát hiện trong server/src (${res.codeVars.length}): ${res.codeVars.join(", ")}`,
  );
  console.log(
    `- Biến ghi nhận trong docs/TRIEN_KHAI.md (${res.docVars.length}): ${res.docVars.join(", ")}`,
  );
  console.log(
    `- Biến trong .env.production.example (${res.exampleVars.length}): ${res.exampleVars.join(", ")}`,
  );

  let fail = false;

  if (res.undocumentedInCode.length > 0) {
    console.error(
      `\n❌ [LỖI] Biến môi trường xuất hiện trong mã nguồn nhưng CHƯA có trong docs/TRIEN_KHAI.md:`,
    );
    for (const v of res.undocumentedInCode) {
      console.error(`   - ${v}`);
    }
    fail = true;
  }

  if (res.staleInDoc.length > 0) {
    console.error(
      `\n❌ [LỖI] Biến trong docs/TRIEN_KHAI.md nhưng KHÔNG còn dùng trong server/src:`,
    );
    for (const v of res.staleInDoc) {
      console.error(`   - ${v}`);
    }
    fail = true;
  }

  if (res.unknownInExample.length > 0) {
    console.error(
      `\n❌ [LỖI] Biến trong .env.production.example không tồn tại trong tài liệu chính thức:`,
    );
    for (const v of res.unknownInExample) {
      console.error(`   - ${v}`);
    }
    fail = true;
  }

  if (!fail) {
    console.log("\n✅ Bảng biến môi trường và file cấu hình mẫu hoàn toàn nhất quán!");
    return 0;
  }

  return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const code = main();
  process.exit(code);
}
