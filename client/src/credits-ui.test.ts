// Dòng ghi công trong game (M7.16, #517, QUYET_DINH_M3 mục 19-20): người phát triển Vạn Kiếp Tu Tiên đã cho phép dùng nội dung, hình ảnh, âm thanh với
// điều kiện ghi công. Dòng này nằm ở Cài đặt (Giới thiệu và ghi công), và PHẢI giống y câu đã chốt ở `docs/NGUON_NOI_DUNG.md` mục 1: sửa một nơi mà
// quên nơi kia thì đỏ; lỡ xoá khỏi giao diện thì đỏ.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PHASER_EMBEDDED,
  buildNotices,
  embeddedNotice,
  runtimeClosure,
} from "../scripts/gen-notices.mjs";

const ROOT = path.resolve(__dirname, "../..");
const html = fs.readFileSync(path.join(ROOT, "client/index.html"), "utf-8");
const doc = fs.readFileSync(path.join(ROOT, "docs/NGUON_NOI_DUNG.md"), "utf-8");
const uiSrc = fs.readFileSync(path.join(ROOT, "client/src/ui.ts"), "utf-8");
const viteCfg = fs.readFileSync(path.join(ROOT, "client/vite.config.ts"), "utf-8");

/** Gỡ thẻ HTML và gộp khoảng trắng: so câu chữ, không so xuống dòng / thụt lề. */
const text = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Câu ghi công đã chốt: đoạn trong ngoặc kép sau "**Lời ghi công trong game**" ở NGUON_NOI_DUNG.md mục 1. */
function creditSentence(): string {
  const m = doc.match(/\*\*Lời ghi công trong game\*\*[^"]*"([^"]+)"/);
  if (!m) throw new Error("Không tìm thấy 'Lời ghi công trong game' trong docs/NGUON_NOI_DUNG.md");
  return m[1].trim();
}

function aboutSection(): string {
  const i = html.indexOf('id="set-about"');
  expect(i, "thiếu khối #set-about").toBeGreaterThan(0);
  const start = html.lastIndexOf("<section", i);
  const end = html.indexOf("</section>", i);
  return html.slice(start, end + "</section>".length);
}

describe("Ghi công trong game (Giới thiệu và ghi công ở Cài đặt)", () => {
  it("khối nằm TRONG hộp Cài đặt (không lẻ ra ngoài)", () => {
    const settingsStart = html.indexOf('id="settings-modal"');
    const settingsEnd = html.indexOf("</section>", html.indexOf('id="btn-logout"'));
    const aboutAt = html.indexOf('id="set-about"');
    expect(settingsStart).toBeGreaterThan(0);
    expect(aboutAt).toBeGreaterThan(settingsStart);
    expect(aboutAt).toBeLessThan(settingsEnd);
  });

  it("câu ghi công trong giao diện GIỐNG Y câu đã chốt ở docs/NGUON_NOI_DUNG.md", () => {
    const sentence = creditSentence();
    expect(sentence.length).toBeGreaterThan(40);
    expect(text(aboutSection())).toContain(sentence);
  });

  it("nêu đủ nội dung, hình ảnh, âm thanh, tên trò chơi, tác giả và sự cho phép", () => {
    const t = text(aboutSection());
    for (const must of [
      "nội dung",
      "hình ảnh",
      "âm thanh",
      "Vạn Kiếp Tu Tiên",
      "Hải Quân · Bắc Team",
      "sự cho phép của tác giả",
    ])
      expect(t, `thiếu "${must}"`).toContain(must);
  });

  it("không có chữ Hán / CJK trong khối (quyết định mục 19-20: tiếng Việt, không chữ Hán)", () => {
    expect(aboutSection()).not.toMatch(
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}]/u,
    );
  });

  it("số phiên bản lấy từ package.json gốc qua vite define, và được ghi vào #set-version", () => {
    expect(html).toContain('id="set-version"');
    expect(viteCfg).toMatch(/__APP_VERSION__:\s*JSON\.stringify\(appVersion\)/);
    expect(viteCfg).toContain("../package.json");
    expect(uiSrc).toMatch(/\$\("set-version"\)\.textContent\s*=/);
    expect(uiSrc).toContain("__APP_VERSION__");
  });
});

describe("Thông báo giấy phép MIT của thư viện bên thứ ba (Phaser, colyseus.js, @colyseus/schema)", () => {
  const notices = fs.readFileSync(path.join(ROOT, "client/public/notices.html"), "utf-8");
  const credits = fs.readFileSync(path.join(ROOT, "CREDITS.md"), "utf-8");
  const clientPkg = JSON.parse(fs.readFileSync(path.join(ROOT, "client/package.json"), "utf-8"));
  /** Dòng "Copyright (c) ..." trong tệp giấy phép CỦA GÓI ĐANG CÀI (đổi gói / đổi năm thì notices.html phải theo). */
  const copyrightOf = (pkg: string, file: string) => {
    const t = fs.readFileSync(path.join(ROOT, "node_modules", pkg, file), "utf-8");
    const m = t.match(/^Copyright \(c\).*$/m);
    if (!m) throw new Error(`không thấy dòng Copyright ở ${pkg}/${file}`);
    return m[0].trim();
  };

  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  it("notices.html KHỚP bản sinh từ node_modules (đổi phụ thuộc / phiên bản mà quên chạy `node client/scripts/gen-notices.mjs` thì đỏ)", () => {
    expect(notices).toBe(buildNotices(ROOT));
  });

  it("notices.html giữ NGUYÊN dòng bản quyền và toàn văn giấy phép của TỪNG gói trong bao đóng phụ thuộc chạy (đọc lại từ tệp giấy phép thật)", () => {
    const pkgs = runtimeClosure(ROOT);
    // bao đóng phải có đủ gói trực tiếp VÀ bắc cầu đã biết (nit của A ở #579: thiếu eventemitter3, @colyseus/httpie, @colyseus/msgpackr, tslib, @capacitor/*)
    const names = pkgs.map((p) => p.name);
    for (const must of [
      "phaser",
      "colyseus.js",
      "@colyseus/schema",
      "@colyseus/httpie",
      "@colyseus/msgpackr",
      "eventemitter3",
      "tslib",
      "@capacitor/core",
      "@capacitor/app",
    ])
      expect(names, must).toContain(must);
    for (const p of pkgs) {
      expect(notices, `${p.name}@${p.version}`).toContain(`${p.name}@${p.version}`);
      expect(notices, `toàn văn giấy phép của ${p.name}`).toContain(esc(p.text));
      expect(p.text, `${p.name} có dòng bản quyền`).toMatch(/Copyright|\(c\)|©/i);
    }
    for (const [pkg, file] of [
      ["phaser", "LICENSE.md"],
      ["colyseus.js", "LICENSE"],
      ["@colyseus/schema", "LICENSE"],
    ] as const)
      expect(notices, pkg).toContain(copyrightOf(pkg, file));
  });

  it("MỌI gói trong dependencies của client (trừ gói nội bộ) có mục trong notices.html", () => {
    for (const [name, ver] of Object.entries(clientPkg.dependencies as Record<string, string>)) {
      if (name.startsWith("@tien-gioi/")) continue;
      expect(notices, name).toContain(`${name}@`);
      if (/^\d/.test(ver)) expect(notices, `${name}@${ver}`).toContain(`${name}@${ver}`);
    }
  });

  describe("bộ sinh `runtimeClosure` trên cây node_modules giả (nhánh lỗi không xảy ra với cây thật)", () => {
    /** Dựng gốc giả: `client/package.json` + các gói `{ name: { deps, license } }` (license = null thì KHÔNG tạo tệp giấy phép). */
    function fakeRoot(pkgs: Record<string, { deps?: string[]; license: string | null }>) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "tg-notices-"));
      const write = (file: string, body: string) => {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, body);
      };
      const names = Object.keys(pkgs);
      write(
        path.join(root, "client/package.json"),
        JSON.stringify({ dependencies: { [names[0]]: "1.0.0", "@tien-gioi/shared": "*" } }),
      );
      for (const [name, def] of Object.entries(pkgs)) {
        const dir = path.join(root, "node_modules", name);
        write(
          path.join(dir, "package.json"),
          JSON.stringify({
            name,
            version: "1.0.0",
            license: "MIT",
            dependencies: Object.fromEntries((def.deps ?? []).map((d) => [d, "1.0.0"])),
          }),
        );
        if (def.license !== null) write(path.join(dir, "LICENSE"), def.license);
      }
      return root;
    }
    const clean = (root: string) => fs.rmSync(root, { recursive: true, force: true });

    it("đi theo phụ thuộc bắc cầu, bỏ gói nội bộ @tien-gioi/*, sắp theo tên", () => {
      const root = fakeRoot({
        zeta: { deps: ["alpha", "mid"], license: "Z" },
        mid: { deps: ["alpha"], license: "M" },
        alpha: { license: "A" },
      });
      try {
        expect(runtimeClosure(root).map((p: { name: string }) => p.name)).toEqual([
          "alpha",
          "mid",
          "zeta",
        ]);
      } finally {
        clean(root);
      }
    });

    it("gói KHÔNG có tệp giấy phép thì NÉM LỖI (không lặng lẽ bỏ sót), kể cả gói bắc cầu", () => {
      const root = fakeRoot({ top: { deps: ["deep"], license: "T" }, deep: { license: null } });
      try {
        expect(() => runtimeClosure(root)).toThrow(/deep@1\.0\.0.*giấy phép/);
      } finally {
        clean(root);
      }
    });

    it("phụ thuộc không có trong node_modules thì NÉM LỖI (nhắc chạy npm ci)", () => {
      const root = fakeRoot({ top: { deps: ["vang-mat"], license: "T" } });
      try {
        expect(() => runtimeClosure(root)).toThrow(/vang-mat.*npm ci/);
      } finally {
        clean(root);
      }
    });
  });

  it("mã bên thứ ba NHÚNG trong Phaser (Earcut ISC, Simplify.js BSD) có thông báo nguyên văn lấy từ chính tệp nguồn của Phaser", () => {
    for (const spec of PHASER_EMBEDDED) {
      const text = embeddedNotice(ROOT, spec);
      expect(text.length, spec.file).toBeGreaterThan(300);
      expect(notices, spec.file).toContain(esc(text));
    }
    expect(notices).toContain("Copyright (c) 2016, Mapbox");
    expect(notices).toContain("Copyright (c) 2017, Vladimir Agafonkin");
    expect(notices).toContain("ISC License");
    expect(notices).toContain("Redistributions in binary form must reproduce");
  });

  it("Cài đặt nêu Phaser, colyseus.js, MIT và liên kết tới notices.html (mở được trong tab mới, không lộ window.opener)", () => {
    const section = aboutSection();
    const t = text(section);
    for (const must of ["Phaser 3", "Richard Davey", "colyseus.js", "Endel Dreyer", "MIT"])
      expect(t, must).toContain(must);
    const flat = section.replace(/\s+/g, " "); // prettier có thể xuống dòng giữa các thuộc tính
    expect(flat).toMatch(/<a href="notices\.html" target="_blank" rel="noopener" ?>/);
    expect(section).toContain('id="set-credit-libs"');
  });

  it("CREDITS.md mục 5b liệt kê ba gói với giấy phép MIT và khớp phiên bản ở client/package.json", () => {
    expect(credits).toContain("### 5b. Thư viện chạy trong trình duyệt");
    const sec = credits.slice(credits.indexOf("### 5b."));
    const row = (pkg: string) => sec.split("\n").find((l) => l.startsWith(`| \`${pkg}\``)) ?? "";
    expect(row("phaser")).toContain(clientPkg.dependencies.phaser);
    expect(row("phaser")).toContain("**MIT**");
    expect(row("colyseus.js")).toContain(clientPkg.dependencies["colyseus.js"]);
    expect(row("colyseus.js")).toContain("**MIT**");
    expect(row("@colyseus/schema")).toContain("**MIT**");
    expect(sec).toContain("client/public/notices.html");
  });

  it("không chữ Hán / CJK trong notices.html", () => {
    expect(notices).not.toMatch(
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}]/u,
    );
  });
});
