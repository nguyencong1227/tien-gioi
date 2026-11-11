import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Bộ kiểm tra tĩnh cho workflow dựng gói APK Android (.github/workflows/android.yml, M4.2c - Issue #302).
 * Do môi trường máy chủ cục bộ không có JDK/Android SDK, APK được xây dựng trên máy chạy GitHub Actions.
 * Kiểm tra tĩnh đảm bảo mọi chính sách bảo mật, quyền tối thiểu, không in bí mật, điều kiện ký và các cổng
 * an toàn được thực thi nghiêm ngặt trước khi đẩy lên remote.
 */

export interface AndroidWorkflowValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateAndroidWorkflow(content: string): AndroidWorkflowValidationResult {
  const errors: string[] = [];

  // 1. Kiểm tra kích hoạt: chỉ chạy khi gắn thẻ tag v* hoặc chạy tay có tham số (workflow_dispatch)
  if (!content.includes("push:") || !content.includes("tags:")) {
    errors.push("Workflow phải được kích hoạt bởi sự kiện push thẻ tag (push.tags)");
  }
  if (!content.includes("workflow_dispatch:")) {
    errors.push("Workflow phải hỗ trợ workflow_dispatch để có thể dựng lại APK khi cần");
  }

  // Không cho phép kích hoạt theo push nhánh (kể cả main - tránh cạn hạn mức phút Actions)
  const pushMatch = content.match(/push:\s*\n((?:[ ]{4,}.*\n)+)/);
  if (pushMatch) {
    const pushBody = pushMatch[1];
    if (/branches\s*:/i.test(pushBody)) {
      errors.push("Workflow không được phép kích hoạt tự động theo nhánh (push.branches)");
    }
  }
  if (/pull_request\s*:/i.test(content) || /pull_request_target\s*:/i.test(content)) {
    errors.push("Workflow APK không được kích hoạt bởi pull_request hoặc pull_request_target");
  }
  if (/schedule\s*:/i.test(content)) {
    errors.push("Workflow APK không được có lịch chạy định kỳ (schedule)");
  }

  // 2. Quyền hạn (Permissions): duy nhất contents: write (không cần packages: write vì không push container)
  const permMatch = content.match(/^permissions:\s*\n((?:^ {2}[a-z_-]+:\s*[a-z_-]+\r?\n)+)/m);
  if (!permMatch) {
    errors.push("Workflow thiếu khai báo permissions rõ ràng");
  } else {
    const permLines = permMatch[1]
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const permMap = Object.fromEntries(
      permLines.map((l) => {
        const [k, v] = l.split(":").map((s) => s.trim());
        return [k, v];
      }),
    );

    if (permMap["contents"] !== "write") {
      errors.push("Quyền 'contents' phải là 'write' để đính kèm APK vào GitHub Release");
    }
    const allowedKeys = new Set(["contents"]);
    for (const key of Object.keys(permMap)) {
      if (!allowedKeys.has(key)) {
        errors.push(
          `Quyền thừa không được phép: '${key}'. Tuân thủ nguyên tắc đặc quyền tối thiểu (least privilege).`,
        );
      }
    }
  }

  // 3. Bảo mật bí mật (Secrets): chỉ cho phép danh sách 4 secrets ký Android và GITHUB_TOKEN
  const allowedSecrets = new Set([
    "secrets.GITHUB_TOKEN",
    "secrets.ANDROID_KEYSTORE_B64",
    "secrets.ANDROID_KEYSTORE_PASSWORD",
    "secrets.ANDROID_KEY_ALIAS",
    "secrets.ANDROID_KEY_PASSWORD",
  ]);

  const secretMatches = content.match(/secrets\.[A-Za-z0-9_]+/g) ?? [];
  for (const s of secretMatches) {
    if (!allowedSecrets.has(s)) {
      errors.push(
        `Phát hiện bí mật không được phép: '${s}'. Chỉ được dùng danh sách bí mật ký Android đã phê duyệt và GITHUB_TOKEN.`,
      );
    }
  }

  // 4. Tuyệt đối không in bí mật ra log (echo)
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Kiểm tra dòng lệnh echo có chứa bí mật
    if (/^\s*(?:-\s+)?run:\s*.*echo\b/i.test(line) || /^\s*echo\b/i.test(line)) {
      const isAddMask = /echo\s+["']::add-mask::/i.test(line);
      if (!isAddMask) {
        if (/secrets\.[A-Za-z0-9_]+/i.test(line)) {
          errors.push(`Phát hiện lệnh in bí mật ra log console: dòng ${i + 1}: ${line.trim()}`);
        }
        if (/\$(?:KEYSTORE_PASS|KEY_PASS|KEYSTORE_B64)\b/i.test(line)) {
          errors.push(
            `Phát hiện lệnh echo in biến môi trường nhạy cảm: dòng ${i + 1}: ${line.trim()}`,
          );
        }
      } else {
        // Dù là add-mask thì cũng không được nội suy secrets.* trực tiếp vào dòng echo
        if (/\$\{\{\s*secrets\./i.test(line)) {
          errors.push(
            `add-mask phải dùng biến môi trường, không nội suy secrets trực tiếp vào lệnh shell: dòng ${i + 1}: ${line.trim()}`,
          );
        }
      }
    }
  }

  // 5. Điều kiện `if:` của bước ký APK Release
  // Bước ký phải có điều kiện `if:` kiểm tra đầy đủ 4 bí mật ký
  const releaseSigningStep = content.match(/name:\s*Dựng và ký APK Release\s*\n\s*if:\s*([^\n]+)/);
  if (!releaseSigningStep) {
    errors.push("Bước 'Dựng và ký APK Release' phải có điều kiện 'if:' kiểm tra bí mật ký Android");
  } else {
    const ifCondition = releaseSigningStep[1];
    const requiredInIf = [
      "ANDROID_KEYSTORE_B64",
      "ANDROID_KEYSTORE_PASSWORD",
      "ANDROID_KEY_ALIAS",
      "ANDROID_KEY_PASSWORD",
    ];
    for (const req of requiredInIf) {
      if (!ifCondition.includes(req)) {
        errors.push(`Điều kiện 'if:' của bước ký Release thiếu kiểm tra bí mật '${req}'`);
      }
    }
  }

  // 6. Kiểm tra an toàn cho tệp keystore tạm
  if (!content.includes("chmod 600")) {
    errors.push("Tệp keystore giải mã tạm thời phải được cấp quyền 600 (chmod 600)");
  }
  if (!content.includes("trap") || !content.includes("rm -f")) {
    errors.push("Phải có lệnh trap dọn dẹp xoá tệp keystore tạm khi kết thúc bước ký");
  }

  // 7. Bảo vệ apksigner không lộ mật khẩu trên tham số dòng lệnh
  if (content.includes("apksigner")) {
    if (!content.includes("env:KEYSTORE_PASS") || !content.includes("env:KEY_PASS")) {
      errors.push("apksigner phải nhận mật khẩu qua 'env:VAR' để tránh lộ qua process list");
    }
  }

  // 8. Cổng chất lượng và công cụ bắt buộc
  const codeLines = lines.filter((l) => !l.trim().startsWith("#"));
  const code = codeLines.join("\n");

  if (!/actions\/setup-java@v4/.test(code)) {
    errors.push("Thiếu bước thiết lập Java (actions/setup-java@v4)");
  }
  if (!/java-version:\s*["']?17["']?/.test(code)) {
    errors.push("Java phải được cấu hình phiên bản 17 cho Android Gradle Plugin");
  }
  if (!/gradle\/actions\/setup-gradle@v4/.test(code)) {
    errors.push("Thiếu bước thiết lập bộ đệm Gradle (gradle/actions/setup-gradle@v4)");
  }
  if (!/actions\/setup-node@v4/.test(code)) {
    errors.push("Thiếu bước thiết lập Node.js");
  }
  if (!/npm run build:native -w client/.test(code)) {
    errors.push("Thiếu bước build bundle client cho native ('npm run build:native -w client')");
  }
  if (!/npx cap sync android/.test(code)) {
    errors.push("Thiếu bước đồng bộ tài nguyên sang Android ('npx cap sync android')");
  }
  if (!/\.\/gradlew assembleDebug/.test(code)) {
    errors.push("Thiếu bước dựng bản Debug APK ('./gradlew assembleDebug')");
  }
  if (!/actions\/upload-artifact@v4/.test(code)) {
    errors.push("Thiếu bước tải lên GitHub Actions Artifact (actions/upload-artifact@v4)");
  }
  if (!/gh release upload/.test(code)) {
    errors.push("Thiếu bước đính kèm APK vào GitHub Release ('gh release upload')");
  }

  // 9. Thẻ phiên bản và chống chèn lệnh
  if (!/ref:\s*refs\/tags\//.test(code)) {
    errors.push("Bước checkout phải lấy đúng thẻ (`ref: refs/tags/...`)");
  }
  if (!/\^v\[0-9\]\+/.test(code)) {
    errors.push("Thiếu bước kiểm tra thẻ đúng định dạng vX.Y.Z trước khi dựng");
  }
  if (!/merge-base --is-ancestor/.test(code) || !/origin\/main/.test(code)) {
    errors.push("Thiếu bước kiểm tra commit của thẻ nằm trên main");
  }

  // Chống chèn lệnh qua nội suy trực tiếp vào lệnh shell
  let runIndent = -1;
  for (const line of codeLines) {
    const indent = line.length - line.trimStart().length;
    const runStart = /^\s*(?:-\s+)?run:\s*(.*)$/.exec(line);
    if (runStart) {
      runIndent = indent;
      if (/\$\{\{\s*(inputs\.|github\.(ref_name|head_ref|event\.))/.test(runStart[1])) {
        errors.push(`Nội suy trực tiếp vào lệnh shell (nguy cơ chèn lệnh): ${line.trim()}`);
      }
      continue;
    }
    if (runIndent >= 0 && line.trim() !== "" && indent > runIndent) {
      if (/\$\{\{\s*(inputs\.|github\.(ref_name|head_ref|event\.))/.test(line)) {
        errors.push(`Nội suy trực tiếp vào lệnh shell (nguy cơ chèn lệnh): ${line.trim()}`);
      }
    } else if (line.trim() !== "") {
      runIndent = -1;
    }
  }

  // 10. Giới hạn thời gian (timeout-minutes) <= 25
  const timeoutMatch = content.match(/timeout-minutes:\s*([0-9]+)/);
  if (!timeoutMatch) {
    errors.push("Workflow phải có khai báo timeout-minutes");
  } else if (parseInt(timeoutMatch[1], 10) > 25) {
    errors.push("timeout-minutes không được vượt quá 25 phút để bảo tồn hạn mức Actions");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

describe("Kiểm tra tĩnh Workflow Dựng APK Android (.github/workflows/android.yml) (Issue #302)", () => {
  const workflowPath = resolve(__dirname, "../../.github/workflows/android.yml");
  const workflowContent = readFileSync(workflowPath, "utf-8");

  it("file workflow android.yml tồn tại và vượt qua toàn bộ chính sách bảo mật / kiểm tra", () => {
    const result = validateAndroidWorkflow(workflowContent);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  describe("Kiểm thử các đột biến kiểm chứng (Mutation Tests)", () => {
    it("Đột biến 1: Kích hoạt theo nhánh push.branches [main] -> BỊ CHẶN", () => {
      const mutated = workflowContent.replace(
        /tags:\s*\n\s*-\s*["'][^"']+["']/,
        "branches:\n      - main",
      );
      const res = validateAndroidWorkflow(mutated);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("push.branches") || e.includes("push.tags"))).toBe(
        true,
      );
    });

    it("Đột biến 2: Bỏ điều kiện if: của bước ký APK Release -> BỊ CHẶN", () => {
      const mutated = workflowContent.replace(
        /if:\s*\$\{\{\s*secrets\.ANDROID_KEYSTORE_B64[^}]+\}\}/,
        "",
      );
      const res = validateAndroidWorkflow(mutated);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("điều kiện 'if:'"))).toBe(true);
    });

    it("Đột biến 3: In ${{ secrets.ANDROID_KEYSTORE_PASSWORD }} ra echo -> BỊ CHẶN", () => {
      const mutated = workflowContent.replace(
        'echo "::add-mask::$KEYSTORE_PASS"',
        'echo "Mật khẩu là: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}"',
      );
      const res = validateAndroidWorkflow(mutated);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("in bí mật ra log"))).toBe(true);
    });

    it("Đột biến 4: In biến môi trường nhạy cảm $KEYSTORE_PASS ra echo -> BỊ CHẶN", () => {
      const mutated = workflowContent.replace(
        'echo "::add-mask::$KEYSTORE_PASS"',
        'echo "Debug pass: $KEYSTORE_PASS"',
      );
      const res = validateAndroidWorkflow(mutated);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("in biến môi trường nhạy cảm"))).toBe(true);
    });

    it("Đột biến 5: Sử dụng bí mật ngoại lai không cho phép (secrets.MY_CUSTOM_SECRET) -> BỊ CHẶN", () => {
      const mutated = workflowContent.replace(
        "${{ secrets.GITHUB_TOKEN }}",
        "${{ secrets.MY_CUSTOM_SECRET }}",
      );
      const res = validateAndroidWorkflow(mutated);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("secrets.MY_CUSTOM_SECRET"))).toBe(true);
    });

    it("Đột biến 6: Thừa quyền permissions (ví dụ packages: write) -> BỊ CHẶN", () => {
      const mutated = workflowContent.replace(
        "permissions:\n  contents: write",
        "permissions:\n  contents: write\n  packages: write",
      );
      const res = validateAndroidWorkflow(mutated);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("Quyền thừa không được phép"))).toBe(true);
    });

    it("Đột biến 7: Bỏ bước kiểm tra thẻ nằm trên main -> BỊ CHẶN", () => {
      const mutated = workflowContent.replace(
        "merge-base --is-ancestor",
        "merge-base --is-descendant",
      );
      const res = validateAndroidWorkflow(mutated);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("nằm trên main"))).toBe(true);
    });

    it("Đột biến 8: Nội suy đầu vào trực tiếp vào câu lệnh shell run: -> BỊ CHẶN", () => {
      const mutated = workflowContent.replace(
        'if gh release view "$TAG_NAME"',
        'if gh release view "${{ inputs.tag }}"',
      );
      const res = validateAndroidWorkflow(mutated);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("chèn lệnh"))).toBe(true);
    });

    it("Đột biến 9: Checkout không lấy đúng thẻ -> BỊ CHẶN", () => {
      const mutated = workflowContent.replace(
        /ref: refs\/tags\/\$\{\{ steps\.tag\.outputs\.tag \}\}\n\s*/,
        "",
      );
      const res = validateAndroidWorkflow(mutated);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("refs/tags"))).toBe(true);
    });

    it("Đột biến 10: Bỏ bước kiểm tra thẻ đúng định dạng vX.Y.Z -> BỊ CHẶN", () => {
      const mutated = workflowContent.replace("^v[0-9]+", "^[a-z0-9]+");
      const res = validateAndroidWorkflow(mutated);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("vX.Y.Z"))).toBe(true);
    });
  });
});
