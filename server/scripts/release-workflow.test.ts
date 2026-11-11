import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Bộ kiểm tra tĩnh cho workflow phát hành tự động (.github/workflows/release.yml, M4 3.1 - Issue #298).
 * Do GitHub Actions không chạy trực tiếp được trong môi trường phát triển cục bộ, test tĩnh đóng vai trò
 * là người gác cổng xác minh mọi chính sách bảo mật, kích hoạt và chất lượng trước khi đẩy lên remote.
 */

export interface ReleaseValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateReleaseWorkflow(content: string): ReleaseValidationResult {
  const errors: string[] = [];

  // 1. Kiểm tra kích hoạt: chỉ chạy khi gắn thẻ tag hoặc kích hoạt thủ công có tham số
  if (!content.includes("push:") || !content.includes("tags:")) {
    errors.push("Workflow phải được kích hoạt bởi sự kiện push thẻ tag (push.tags)");
  }
  if (!content.includes("workflow_dispatch:")) {
    errors.push("Workflow phải hỗ trợ workflow_dispatch để phát hành lại khi cần");
  }
  // Không cho phép kích hoạt theo push nhánh (kể cả main)
  const pushMatch = content.match(/push:\s*\n((?:[ ]{4,}.*\n)+)/);
  if (pushMatch) {
    const pushBody = pushMatch[1];
    if (/branches\s*:/i.test(pushBody)) {
      errors.push("Workflow không được phép kích hoạt tự động theo nhánh (push.branches)");
    }
  }
  if (/pull_request\s*:/i.test(content) || /pull_request_target\s*:/i.test(content)) {
    errors.push(
      "Workflow phát hành không được kích hoạt bởi pull_request hoặc pull_request_target",
    );
  }
  if (/schedule\s*:/i.test(content)) {
    errors.push("Workflow phát hành không được có lịch chạy định kỳ (schedule)");
  }

  // 2. Quyền hạn (Permissions): chỉ contents: write và packages: write
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
      errors.push("Quyền 'contents' phải là 'write' để tạo GitHub Release");
    }
    if (permMap["packages"] !== "write") {
      errors.push("Quyền 'packages' phải là 'write' để đẩy ảnh lên GHCR");
    }
    const allowedKeys = new Set(["contents", "packages"]);
    for (const key of Object.keys(permMap)) {
      if (!allowedKeys.has(key)) {
        errors.push(
          `Quyền thừa không được phép: '${key}'. Tuân thủ nguyên tắc đặc quyền tối thiểu.`,
        );
      }
    }
  }

  // 3. Bảo mật bí mật (Secrets): Duy nhất GITHUB_TOKEN, cấm mọi PAT hoặc custom secret
  const secretMatches = content.match(/secrets\.[A-Za-z0-9_]+/g) ?? [];
  for (const s of secretMatches) {
    if (s !== "secrets.GITHUB_TOKEN") {
      errors.push(
        `Phát hiện bí mật không được phép: '${s}'. Chỉ được dùng duy nhất 'secrets.GITHUB_TOKEN'.`,
      );
    }
  }

  // 4. Tên ảnh Docker: đúng ghcr.io/nguyencong1227/tien-gioi và viết thường 100%
  const targetImage = "ghcr.io/nguyencong1227/tien-gioi";
  if (!content.includes(targetImage)) {
    errors.push(`Workflow phải đẩy đúng ảnh Docker mục tiêu: '${targetImage}'`);
  }
  // Kiểm tra không viết hoa tên ảnh
  const imageRegex = /ghcr\.io\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = imageRegex.exec(content)) !== null) {
    const full = match[0];
    if (full !== full.toLowerCase()) {
      errors.push(`Tên ảnh GHCR phải viết thường 100%, tìm thấy: '${full}'`);
    }
  }

  // 5. Cổng chất lượng trước khi Build/Push: typecheck, lint, prettier, test, build
  const buildPushIndex = content.indexOf("docker/build-push-action");
  if (buildPushIndex === -1) {
    errors.push("Thiếu bước sử dụng action 'docker/build-push-action'");
  } else {
    const preBuildContent = content.slice(0, buildPushIndex);
    const requiredQualityGates = [
      { name: "npm run typecheck", pattern: /npm run typecheck/ },
      { name: "npm run lint", pattern: /npm run lint/ },
      { name: "npx prettier --check .", pattern: /prettier --check/ },
      { name: "npm test", pattern: /\bnpm test\b/ },
      { name: "npm run build", pattern: /npm run build/ },
    ];
    for (const gate of requiredQualityGates) {
      if (!gate.pattern.test(preBuildContent)) {
        errors.push(
          `Thiếu cổng chất lượng bắt buộc trước khi build/push Docker image: ${gate.name}`,
        );
      }
    }
  }

  // 6. Nền tảng kiến trúc: chỉ linux/amd64 (máy production x86_64)
  if (!/platforms:\s*linux\/amd64\b/.test(content)) {
    errors.push(
      "Phải cấu hình đúng nền tảng 'platforms: linux/amd64' cho máy chủ production x86_64",
    );
  }

  // 7. Thẻ phiên bản (A bắt được lỗi này khi review #306): chạy tay thì `github.ref_name` là TÊN NHÁNH nên `github.ref_name || inputs.tag`
  // không bao giờ dùng `inputs.tag`; phải kiểm đúng dạng vX.Y.Z, checkout ĐÚNG thẻ và chỉ phát hành mã đã nằm trên main.
  const codeLines = content.split("\n").filter((l) => !l.trim().startsWith("#"));
  const code = codeLines.join("\n");
  if (/github\.ref_name\s*\|\|\s*inputs\.tag/.test(code)) {
    errors.push(
      "Sai thứ tự: `github.ref_name || inputs.tag` luôn ra tên nhánh khi chạy tay (phải `inputs.tag || github.ref_name`)",
    );
  }
  if (!/ref:\s*refs\/tags\//.test(code)) {
    errors.push(
      "Bước checkout phải lấy đúng thẻ (`ref: refs/tags/...`), nếu không chạy tay sẽ phát hành nhánh khác",
    );
  }
  if (!/\^v\[0-9\]\+/.test(code)) {
    errors.push("Thiếu bước kiểm thẻ đúng dạng vX.Y.Z trước khi dùng");
  }
  if (!/merge-base --is-ancestor/.test(code) || !/origin\/main/.test(code)) {
    errors.push("Thiếu bước kiểm commit của thẻ nằm trên main (chỉ phát hành mã đã merge)");
  }
  // 7b. Bản thử nghiệm (thẻ có dấu '-'): phải thêm cờ --prerelease cho gh release create
  if (!/--prerelease/.test(code) || !/\*-\*/.test(code)) {
    errors.push(
      "Bản phát hành phải thêm cờ --prerelease khi tên thẻ có dấu '-' (thẻ thử nghiệm / rc)",
    );
  }
  // 8. Chống chèn lệnh: không nội suy đầu vào / tên nhánh / tên thẻ trực tiếp vào lệnh shell (`run:`); phải đi qua `env:`
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

  return {
    valid: errors.length === 0,
    errors,
  };
}

describe("Kiểm tra tĩnh Workflow Release (.github/workflows/release.yml) (#298)", () => {
  const workflowPath = resolve(__dirname, "../../.github/workflows/release.yml");
  const workflowContent = readFileSync(workflowPath, "utf-8");

  it("file workflow tồn tại và vượt qua toàn bộ chính sách bảo mật / chất lượng", () => {
    const result = validateReleaseWorkflow(workflowContent);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  describe("Kiểm thử 4 đột biến kiểm chứng (Mutation Testing)", () => {
    it("Đột biến 1: Kích hoạt theo nhánh push.branches [main] -> KHÔNG ĐẠT", () => {
      const mutated = workflowContent.replace(
        /tags:\s*\n\s*-\s*["'][^"']+["']/,
        "branches:\n      - main",
      );
      const res = validateReleaseWorkflow(mutated);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("push.tags") || e.includes("push.branches"))).toBe(
        true,
      );
    });

    it("Đột biến 2: Dùng bí mật ngoại lai (secrets.MY_PAT) -> KHÔNG ĐẠT", () => {
      const mutated = workflowContent.replace(
        "${{ secrets.GITHUB_TOKEN }}",
        "${{ secrets.MY_PAT }}",
      );
      const res = validateReleaseWorkflow(mutated);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("secrets.MY_PAT"))).toBe(true);
    });

    it("Đột biến 3: Tên ảnh GHCR bị viết hoa (ghcr.io/NguyenCong1227/tien-gioi) -> KHÔNG ĐẠT", () => {
      const mutated = workflowContent.replace(
        "ghcr.io/nguyencong1227/tien-gioi",
        "ghcr.io/NguyenCong1227/tien-gioi",
      );
      const res = validateReleaseWorkflow(mutated);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("viết thường"))).toBe(true);
    });

    it("Đột biến 4: Bỏ qua bước kiểm thử (npm test) -> KHÔNG ĐẠT", () => {
      const mutated = workflowContent.replace("run: npm test", "run: echo skipping test");
      const res = validateReleaseWorkflow(mutated);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("npm test"))).toBe(true);
    });

    // Các đột biến dưới đây do A thêm khi review #306 (bản đầu hỏng khi chạy tay và dễ bị chèn lệnh)
    it("Đột biến 5: đảo thứ tự `github.ref_name || inputs.tag` (chạy tay ra tên nhánh) -> KHÔNG ĐẠT", () => {
      const mutated = workflowContent.replace(
        "group: release-${{ inputs.tag || github.ref_name }}",
        "group: release-${{ github.ref_name || inputs.tag }}",
      );
      expect(mutated).not.toBe(workflowContent);
      const res = validateReleaseWorkflow(mutated);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("Sai thứ tự"))).toBe(true);
    });

    it("Đột biến 6: checkout không lấy đúng thẻ -> KHÔNG ĐẠT", () => {
      const mutated = workflowContent.replace(
        /ref: refs\/tags\/\$\{\{ steps\.tag\.outputs\.tag \}\}\n\s*/,
        "",
      );
      expect(mutated).not.toBe(workflowContent);
      const res = validateReleaseWorkflow(mutated);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("refs/tags"))).toBe(true);
    });

    it("Đột biến 7: bỏ kiểm thẻ nằm trên main -> KHÔNG ĐẠT", () => {
      const mutated = workflowContent.replace(
        "merge-base --is-ancestor",
        "merge-base --is-descendant",
      );
      expect(mutated).not.toBe(workflowContent);
      const res = validateReleaseWorkflow(mutated);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("nằm trên main"))).toBe(true);
    });

    it("Đột biến 8: nội suy đầu vào thẳng vào lệnh shell (chèn lệnh) -> KHÔNG ĐẠT", () => {
      const mutated = workflowContent.replace(
        'if gh release view "$TAG_NAME"',
        'if gh release view "${{ inputs.tag }}"',
      );
      expect(mutated).not.toBe(workflowContent);
      const res = validateReleaseWorkflow(mutated);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("chèn lệnh"))).toBe(true);
    });

    it("Đột biến 9: bỏ kiểm thẻ đúng dạng vX.Y.Z -> KHÔNG ĐẠT", () => {
      const mutated = workflowContent.replace("^v[0-9]+", "^[a-z0-9]+");
      expect(mutated).not.toBe(workflowContent);
      const res = validateReleaseWorkflow(mutated);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("vX.Y.Z"))).toBe(true);
    });

    it("Đột biến 10: bỏ cờ --prerelease cho thẻ rc/thử nghiệm -> KHÔNG ĐẠT", () => {
      const mutated = workflowContent.replace("--prerelease", "--draft");
      expect(mutated).not.toBe(workflowContent);
      const res = validateReleaseWorkflow(mutated);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("--prerelease"))).toBe(true);
    });
  });
});
