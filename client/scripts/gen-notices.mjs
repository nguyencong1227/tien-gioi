/* global console, process */
// Sinh `client/public/notices.html` (thông báo giấy phép của phần mềm bên thứ ba đi kèm bản phát hành) TỪ `node_modules`, để toàn văn giấy phép và dòng bản quyền luôn đúng
// với gói đang cài (không gõ tay). Gồm: (1) mọi gói trong BAO ĐÓNG phụ thuộc chạy của `client/package.json` (dependencies, đệ quy, trừ gói nội bộ `@tien-gioi/*`);
// (2) mã bên thứ ba NHÚNG sẵn trong mã nguồn Phaser (Earcut, Simplify.js) lấy NGUYÊN VĂN từ khối chú thích bản quyền của tệp nguồn.
// Giấy phép MIT / ISC / BSD / 0BSD đều yêu cầu giữ thông báo trong bản phân phối. `credits-ui.test.ts` kiểm trang đã sinh KHỚP bản sinh mới (đổi phụ thuộc mà quên chạy lại thì đỏ).
//   Sinh lại:  node client/scripts/gen-notices.mjs        Chỉ kiểm:  node client/scripts/gen-notices.mjs --check
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "../..");
export const NOTICES_FILE = path.join(ROOT, "client/public/notices.html");

/** Phân giải gói như Node: node_modules lồng gần nhất, rồi gốc. */
function resolvePkg(name, fromDir, root) {
  let dir = fromDir;
  for (;;) {
    const p = path.join(dir, "node_modules", name, "package.json");
    if (fs.existsSync(p)) return path.dirname(p);
    const up = path.dirname(dir);
    if (up === dir || !up.startsWith(root)) break;
    dir = up;
  }
  const top = path.join(root, "node_modules", name, "package.json");
  return fs.existsSync(top) ? path.dirname(top) : null;
}

/** Tệp giấy phép của một gói (LICENSE / license / LICENSE.md / LICENSE.txt / COPYING), hoặc null. */
function licenseFile(dir) {
  const f = fs
    .readdirSync(dir)
    .filter((n) => /^(licen[sc]e|copying)(\.(md|txt))?$/i.test(n))
    .sort()[0];
  return f ? path.join(dir, f) : null;
}

/**
 * Bao đóng phụ thuộc chạy của `client/package.json`: [{ name, version, license, dir, text }] sắp theo tên. Thiếu tệp giấy phép của một gói thì NÉM LỖI
 * (không lặng lẽ bỏ sót). Gói nội bộ (`@tien-gioi/*`) bỏ qua.
 */
export function runtimeClosure(root = ROOT) {
  const clientPkg = JSON.parse(fs.readFileSync(path.join(root, "client/package.json"), "utf8"));
  const seen = new Map();
  const walk = (name, from) => {
    if (name.startsWith("@tien-gioi/")) return;
    const dir = resolvePkg(name, from, root);
    if (!dir) throw new Error(`Không thấy gói ${name} (chạy npm ci trước)`);
    const pj = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    const key = `${pj.name}@${pj.version}`;
    if (seen.has(key)) return;
    const lf = licenseFile(dir);
    if (!lf) throw new Error(`Gói ${key} không có tệp giấy phép`);
    seen.set(key, {
      name: pj.name,
      version: pj.version,
      license: typeof pj.license === "string" ? pj.license : JSON.stringify(pj.license ?? "?"),
      dir,
      text: fs.readFileSync(lf, "utf8").trim(),
    });
    for (const dep of Object.keys(pj.dependencies ?? {})) walk(dep, dir);
  };
  for (const name of Object.keys(clientPkg.dependencies ?? {}))
    walk(name, path.join(root, "client"));
  return [...seen.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  );
}

/** Mã bên thứ ba NHÚNG trong mã nguồn Phaser: tệp, tên, giấy phép, và khối chú thích bản quyền lấy nguyên văn. */
export const PHASER_EMBEDDED = [
  {
    file: "src/geom/polygon/Earcut.js",
    name: "Earcut 2.2.4 (Mapbox)",
    license: "ISC",
    start: "ISC License",
  },
  {
    file: "src/geom/polygon/Simplify.js",
    name: "Simplify.js (Vladimir Agafonkin)",
    license: "BSD-2-Clause",
    start: "Copyright (c) 2017, Vladimir Agafonkin",
  },
];

/** Khối chú thích `/* ... *\/` chứa `start` trong tệp nguồn, bỏ ký hiệu ` * ` đầu dòng. */
export function embeddedNotice(root, spec) {
  const phaserDir = resolvePkg("phaser", path.join(root, "client"), root);
  const src = fs.readFileSync(path.join(phaserDir, spec.file), "utf8");
  const at = src.indexOf(spec.start);
  if (at < 0) throw new Error(`Không thấy "${spec.start}" trong ${spec.file}`);
  const open = src.lastIndexOf("/*", at);
  const close = src.indexOf("*/", at);
  return src
    .slice(open + 2, close)
    .split("\n")
    .map((l) => l.replace(/^\s*\*\s?/, "").trimEnd())
    .join("\n")
    .trim();
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const BAR = "--------------------------------------------------------------";

/** Nội dung trang `notices.html` (chuỗi). Tất định: cùng `node_modules` => cùng kết quả. */
export function buildNotices(root = ROOT) {
  const pkgs = runtimeClosure(root);
  const parts = [];
  let n = 0;
  for (const p of pkgs) {
    n++;
    parts.push(
      `${BAR}\n${n}. ${p.name}@${p.version} (giấy phép ${p.license})\n${BAR}\n\n${p.text}`,
    );
  }
  const phaser = pkgs.find((p) => p.name === "phaser");
  for (const spec of PHASER_EMBEDDED) {
    n++;
    parts.push(
      `${BAR}\n${n}. ${spec.name}: mã NHÚNG trong Phaser (${spec.license}), nguyên văn khối bản quyền trong ${spec.file} của phaser@${phaser?.version ?? "?"}\n${BAR}\n\n${embeddedNotice(root, spec)}`,
    );
  }
  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Thông báo giấy phép của phần mềm bên thứ ba · Tiên Giới</title>
    <style>
      body { margin: 0; padding: 16px; background: #1b1814; color: #e8dfcf; font: 15px/1.55 Georgia, "Noto Serif", serif; }
      main { max-width: 760px; margin: 0 auto; }
      h1 { font-size: 20px; color: #ffe08a; }
      pre { white-space: pre-wrap; overflow-wrap: anywhere; font: 13px/1.5 ui-monospace, Menlo, Consolas, monospace; background: #26211b; padding: 12px; border-radius: 6px; }
      a { color: #8fc4ff; }
    </style>
  </head>
  <body>
    <main>
      <h1>Thông báo giấy phép của phần mềm bên thứ ba (Third-party notices)</h1>
      <p>
        Tiên Giới (client) đóng gói các thư viện mã nguồn mở dưới đây vào gói JavaScript chạy trong trình duyệt, gồm cả các gói đi kèm (phụ thuộc bắc cầu) và mã bên thứ ba
        nhúng sẵn trong Phaser. Các giấy phép (MIT, ISC, BSD, 0BSD) yêu cầu giữ thông báo bản quyền và nội dung giấy phép trong mọi bản phân phối: trang này là nơi giữ chúng.
        Trang được SINH từ các gói đang cài (<code>node client/scripts/gen-notices.mjs</code>), danh sách kèm phiên bản ở CREDITS.md (mục 5b). Toàn văn giấy phép giữ NGUYÊN BẢN
        tiếng Anh (không dịch).
      </p>
      <pre id="notices">${esc(parts.join("\n\n"))}
</pre>
      <p><a href="./">Quay lại trò chơi</a></p>
    </main>
  </body>
</html>
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const html = buildNotices();
  if (process.argv.includes("--check")) {
    const cur = fs.existsSync(NOTICES_FILE) ? fs.readFileSync(NOTICES_FILE, "utf8") : "";
    if (cur !== html) {
      console.error(
        "client/public/notices.html KHÔNG khớp bản sinh từ node_modules: chạy `node client/scripts/gen-notices.mjs`",
      );
      process.exit(1);
    }
    console.log("notices.html khớp bản sinh từ node_modules.");
  } else {
    fs.writeFileSync(NOTICES_FILE, html);
    console.log(
      `Đã ghi ${path.relative(ROOT, NOTICES_FILE)} (${html.length} byte, ${runtimeClosure().length} gói + ${PHASER_EMBEDDED.length} mã nhúng).`,
    );
  }
}
