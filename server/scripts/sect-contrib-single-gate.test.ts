// [H3] Test CẤU TRÚC (quét AST) — bất biến kinh tế M8: cống hiến / công tích / điểm tông chỉ được
// GHI qua MỘT cổng có trần ngày (`SectService.award` -> `sectAwardDay`). Một dòng `m.contrib += n` mới ở
// chỗ khác (vd thêm nguồn thưởng) sẽ lách trần ngày mà test hành vi không đỏ; test này giữ luật đó ở mức mã nguồn.
//
// PHƯƠNG PHÁP: dùng TypeScript compiler API (`ts.createSourceFile`) đọc AST, KHÔNG regex thô, để phân biệt
// đúng chỗ *ghi* với chỗ *đọc*:
//   - GHI member-access: `x.contrib = / += / -= / ++ / --` (bên TRÁI phép gán / cập nhật).
//   - GHI object-literal có phép tính: `{ ...s, points: points + n }`, `{ ...m, contrib: contrib - t }`
//     (giá trị là BinaryExpression `+` / `-` — mẫu "cộng/trừ cống hiến"). KHÔNG bắt `contrib: me.contrib ?? 0`
//     (copy giá trị đọc vào view), `points: pointsNow` (một biến), `merit: 120` (hằng), nhãn / bảng dữ liệu.
//
// DANH SÁCH TRẮNG (nơi hợp lệ ghi contrib / points / merit — mỗi chỗ kèm lý do; thêm chỗ mới phải đỏ kèm
// hướng dẫn nối vào `award` hoặc xin LGTM Dev A):
//
//   server/src/sect-service.ts
//     - `award`  : MỘT cổng cống hiến DUY NHẤT — mọi nguồn (nhiệm vụ, góp kho, bí cảnh...) đều gọi hàm này;
//                 trong một `update` nguyên tử cộng contrib + merit + Sect.points cùng `granted` đã qua `sectAwardDay` (trần ngày / trần nguồn).
//     - `shopBuy`: trừ `contrib` khi mua đồ ở cửa hàng tông (chỉ MẤT, không bao giờ tăng; KHÔNG đụng merit / points).
//   server/src/store-contract.ts
//     - Module HỢP ĐỒNG KIỂM THỬ (import `vitest`, chứa `it()` / `describe()`); mọi chỗ ghi contrib/points/merit
//       ở đây là fixtures / test-only, KHÔNG phải logic game.
//
// sect-store.ts KHÔNG cần whitelist: `sanitizeSect` chỉ kẹp qua `const x = ...` và spread `{ ...(x ? {x} : {}) }`
// (đọc / chuẩn hoá bản ghi khi nạp), KHÔNG có phép gán member-access hay object-literal có phép tính -> detector không bắt.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, "..");
const rootDir = path.resolve(serverDir, "..");
const sharedDir = path.resolve(rootDir, "shared", "src");

/** Ba con số kinh tế theo LINH HỒN / tông môn — chỉ được ghi qua cổng `award` (và trừ ở `shopBuy`). */
const GATE_PROPS = new Set(["contrib", "points", "merit"]);

interface GateViolation {
  line: number;
  text: string;
  prop: string;
  /** Tên phương thức / hàm bao quanh (rỗng nếu ở tầng module, vd trong callback test). */
  func: string;
}

/** Danh sách trắng: tệp -> { lý do, [tên hàm được phép] }. Không có `funcs` = toàn bộ tệp được phép. */
const WHITELIST: Record<string, { reason: string; funcs?: string[] }> = {
  "server/src/sect-service.ts": {
    funcs: ["award", "shopBuy"],
    reason:
      "award = MỘT cổng cống hiến duy nhất (cộng contrib+merit+points cùng granted qua sectAwardDay có trần ngày); " +
      "shopBuy = trừ contrib khi mua đồ (chỉ MẤT). Đây là nơi hợp lệ duy nhất ghi contrib/points/merit trong logic game.",
  },
  "server/src/store-contract.ts": {
    reason:
      "Module hợp đồng kiểm thử (import vitest, chứa it()/describe()); mọi chỗ ghi contrib/points/merit ở đây là fixtures/test-only.",
  },
};

function isGatePropAccess(node: ts.Node): node is ts.PropertyAccessExpression {
  return ts.isPropertyAccessExpression(node) && GATE_PROPS.has(node.name.text);
}

/**
 * TS 5.9 public `.d.ts` KHÔNG khai báo `isAssignmentExpression` (hàm có THẬT lúc chạy, đã xác nhận) — tương tự
 * `isUpdateExpression`. Bọc lại có kiểu để typecheck pass; vẫn gọi hàm thật của `ts` nên hành vi KHÔNG đổi.
 * Guard thu hẹp về `BinaryExpression` (cơ sở KHÔNG generic của AssignmentExpression) — đủ vì detector chỉ cần `.left`;
 * an toàn vì mọi phép gán đều là BinaryExpression và hàm thật chỉ trả true cho phép gán.
 */
function isAssignmentExpression(node: ts.Node): node is ts.BinaryExpression {
  return (
    ts as unknown as {
      isAssignmentExpression(n: ts.Node): boolean;
    }
  ).isAssignmentExpression(node);
}

/** object-literal property có giá trị là phép cộng/trừ (mẫu "cộng/trừ cống hiến"): `points: x + n`, `contrib: x - t`. */
function hasAddSub(node: ts.Node): boolean {
  return (
    ts.isBinaryExpression(node) &&
    (node.operatorToken.kind === ts.SyntaxKind.PlusToken ||
      node.operatorToken.kind === ts.SyntaxKind.MinusToken)
  );
}

/** Tên phương thức / hàm bao quanh nút (đi lên theo parent); rỗng nếu là hàm ẩn danh ở tầng module. */
function enclosingFuncName(node: ts.Node, sf: ts.SourceFile): string {
  let cur: ts.Node | undefined = node.parent;
  while (cur && cur !== sf) {
    if (ts.isMethodDeclaration(cur) || ts.isFunctionDeclaration(cur)) {
      const n = cur.name;
      if (n && ts.isIdentifier(n)) return n.text;
    }
    if (ts.isArrowFunction(cur) || ts.isFunctionExpression(cur)) {
      const p = cur.parent;
      if (ts.isPropertyDeclaration(p) && p.name && ts.isIdentifier(p.name)) return p.name.text;
      if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) return p.name.text;
    }
    cur = cur.parent;
  }
  return "";
}

/**
 * Nếu `node` là phép CẬP NHẬT (++ / --) ghi vào member-access contrib/points/merit, trả identifier của thuộc tính đó;
 * ngược lại `undefined`. TypeScript 5.9 KHÔNG còn `ts.isUpdateExpression` (tên này là helper nội bộ khác, KHÔNG phải type
 * guard AST) lẫn `SyntaxKind.PostfixUpdateExpression` (bị xóa từ TS 4.0) -> phải dùng hai guard riêng:
 *   - Tiền tố `++x.prop` / `--x.prop`: `isPrefixUnaryExpression` (kind 225).
 *   - Hậu tố `x.prop++` / `x.prop--`: `isPostfixUnaryExpression` (kind 226).
 * ĐIỀU QUAN TRỌNG (đã kiểm tra bằng compiler API thật): CẢ TIỀN TỐ LẪN HẬU TỐ đều để đối số ở `.operand` và dấu ở
 * `.operator` (++ = PlusPlusToken, -- = MinusMinusToken); KHÔNG có thuộc tính `.expression` (đọc sẽ ra undefined).
 */
function updateTargetProp(node: ts.Node): ts.MemberName | undefined {
  if (
    (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
    (node.operator === ts.SyntaxKind.PlusPlusToken ||
      node.operator === ts.SyntaxKind.MinusMinusToken)
  ) {
    return isGatePropAccess(node.operand) ? node.operand.name : undefined;
  }
  return undefined;
}

/**
 * Quét MỌI chỗ GHI contrib / points / merit trong một nguồn: member-access gán / cập nhật, và object-literal property
 * có phép cộng/trừ. Trả danh sách vi phạm (chưa lọc danh sách trắng). `findContribWrites` là detector THÔ — test đột biến
 * gọi thẳng, test chính lọc danh sách trắng trước khi khẳng định rỗng.
 */
export function findContribWrites(sourceText: string, fileName = "snippet.ts"): GateViolation[] {
  const sf = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const out: GateViolation[] = [];
  // `PropertyAccessExpression.name` trong types của TS là `MemberName` (= Identifier | PrivateIdentifier);
  // gate prop luôn là identifier thường (khớp theo tên trong isGatePropAccess) -> nhận MemberName là đủ.
  const record = (n: ts.Node, propName: ts.MemberName) => {
    const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
    out.push({
      line: line + 1,
      text: n.getText(sf),
      prop: propName.text,
      func: enclosingFuncName(n, sf),
    });
  };
  const walk = (node: ts.Node) => {
    if (isAssignmentExpression(node) && isGatePropAccess(node.left)) {
      record(node, node.left.name);
    } else {
      const propId = updateTargetProp(node);
      if (propId) record(node, propId);
    }
    if (ts.isObjectLiteralExpression(node)) {
      for (const p of node.properties) {
        if (
          ts.isPropertyAssignment(p) &&
          ts.isIdentifier(p.name) &&
          GATE_PROPS.has(p.name.text) &&
          hasAddSub(p.initializer)
        ) {
          record(p, p.name);
        }
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return out;
}

function isWhitelisted(rel: string, func: string): boolean {
  const entry = WHITELIST[rel];
  if (!entry) return false;
  return entry.funcs ? entry.funcs.includes(func) : true;
}

function scanTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (!statSync(full).isDirectory()) {
      if (entry.endsWith(".ts") && !entry.endsWith(".test.ts") && !entry.endsWith(".d.ts"))
        results.push(full);
      continue;
    }
    if (entry === "node_modules" || entry === "dist") continue;
    results.push(...scanTsFiles(full));
  }
  return results;
}

const WHITELIST_HEADER = [
  "DANH SÁCH TRẮNG — nơi hợp lệ ghi contrib/points/merit (#970):",
  ...Object.entries(WHITELIST).map(
    ([file, e]) => `  - ${file}${e.funcs ? ` (hàm: ${e.funcs.join(", ")})` : ""}: ${e.reason}`,
  ),
].join("\n");

describe("cống hiến / điểm tông chỉ ghi qua MỘT cổng (sectAwardDay) — quét AST (#970)", () => {
  it("KHÔNG có tệp source nào (khác danh sách trắng) ghi contrib/points/merit; mọi chỗ ghi hợp lệ đều ở award/shopBuy", () => {
    const files = [...scanTsFiles(path.join(serverDir, "src")), ...scanTsFiles(sharedDir)];
    expect(files.length).toBeGreaterThan(40); // đảm bảo quét thật nhiều tệp

    const violations: { file: string; line: number; func: string; text: string }[] = [];
    for (const file of files) {
      const rel = path.relative(rootDir, file).split(path.sep).join("/");
      for (const v of findContribWrites(readFileSync(file, "utf8"), rel)) {
        if (!isWhitelisted(rel, v.func)) violations.push({ file: rel, ...v });
      }
    }

    if (violations.length > 0) {
      // In danh sách trắng + lý do để người sửa biết nối vào award hoặc xin LGTM Dev A.
      console.error(WHITELIST_HEADER);
    }
    expect(
      violations.map((v) => `${v.file}:${v.line} [${v.func}] ghi ${v.text}`),
      "Tìm thấy chỗ ghi contrib/points/merit ngoài cổng. Nối nguồn kiếm vào `sectAwardDay` (SectService.award), " +
        "hoặc thêm vào WHITELIST KÈM lý do và LGTM của Dev A.",
    ).toEqual([]);
  });

  it("đọc contrib/points/merit (so sánh, clamp, copy vào view) KHÔNG bị coi là ghi", () => {
    const reads = [
      "const c = member.contrib; if (c > 0) {}\n",
      "return { ...m, contrib: me.contrib ?? 0, merit: me.merit ?? 0 };",
      "const pts = Math.max(0, sect.points);",
      "if (s.points ?? 0) { doSomething(); }",
      "const view = { points: pointsNow, me: { contrib, merit: 120 } };", // sampleSectHall: không phép tính -> không bắt
    ];
    for (const code of reads) {
      expect(findContribWrites(code), code.trim()).toEqual([]);
    }
  });

  describe("test đột biến: phát hiện chỗ ghi mới lách cổng (commit mã thật TRƯỚC khi chạy đột biến)", () => {
    it("đột biến 1: `member.contrib += 1` (member-access +=) ở hệ thống khác -> ĐỎ", () => {
      const found = findContribWrites("function give() { member.contrib += 1; }");
      expect(found.some((v) => v.prop === "contrib" && /contrib \+=/.test(v.text))).toBe(true);
    });

    it("đột biến 2: `sect.points++` (member-access ++) ở tệp khác -> ĐỎ", () => {
      const found = findContribWrites("function bump() { sect.points++; }");
      expect(found.some((v) => v.prop === "points" && /points\+\+/.test(v.text))).toBe(true);
    });

    it("đột biến 3: `members[0].merit = 0` (member-access =) ngoài hàm trắng -> ĐỎ", () => {
      const found = findContribWrites("function reset() { members[0].merit = 0; }");
      expect(found.some((v) => v.prop === "merit" && /merit = 0/.test(v.text))).toBe(true);
    });

    it("đột biến 4: object-literal cộng điểm `{ ...s, points: s.points + 9999 }` ngoài cổng -> ĐỎ", () => {
      const found = findContribWrites("const next = { ...s, points: s.points + 9999 };");
      expect(found.some((v) => v.prop === "points" && /\+/.test(v.text))).toBe(true);
    });

    it("đột biến 5: ghi trong hàm KHÔNG phải award/shopBuy của sect-service.ts vẫn ĐỎ (kiểm theo tên hàm)", () => {
      // Cùng tệp whitelisted, nhưng hàm khác award/shopBuy -> không được tha.
      const code = "class X { rogue(s) { s.points = (s.points ?? 0) + 1; } }";
      const found = findContribWrites(code, "server/src/sect-service.ts");
      expect(found.length).toBe(1);
      expect(isWhitelisted("server/src/sect-service.ts", found[0]!.func)).toBe(false);
    });
  });
});
