// Bảng duyệt đồ hoạ từng phần (`dung-bang-duyet.py`, QUYET_DINH_M3 mục 67.2 / 69, issue #1330). Điều QUAN TRỌNG nhất là ranh giới GIẤY PHÉP: tờ ảnh CÔNG KHAI (vào repo) KHÔNG được chứa
// hình của gói cấm phân phối lại (Wuxia RTS, Sunnyside, Cainos). Phần đọc mã chạy ở mọi máy; phần dựng thật cần Pillow + các gói ở /mnt/data (máy chủ chung có, CI không): thiếu thì bỏ qua.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LEARNABLE_SKILLS, MONSTERS, NPCS } from "../../../shared/src/index";

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(here, "dung-bang-duyet.py");
const code = fs.readFileSync(SCRIPT, "utf8");
const hasPillow =
  spawnSync("python3", ["-I", "-c", "import PIL"], { encoding: "utf8" }).status === 0;
const SOURCES = [
  "/mnt/data/assets-src/ninja-adventure/content/character",
  "/mnt/data/assets-work/b-duyet/xianxia/Xianxia_Pixel_Pack/characters",
  "/mnt/data/assets-private/work/wuxia-rts/Wuxia_RTS_Pixel_Lite_v1.0/01_Characters",
  "/mnt/data/assets-private/work/sunnyside/Sunnyside_World_ASSET_PACK_V2.1/Sunnyside_World_Assets/Characters",
];
const can = hasPillow && SOURCES.every((p) => fs.existsSync(p));

describe("dung-bang-duyet.py: ranh giới giấy phép (đọc mã, chạy mọi máy)", () => {
  /** Dòng của bảng SRC cho một nguồn. */
  const srcRow = (key: string) => {
    const m = new RegExp(`"${key}": \\(([^\\n]*)\\),\\n`).exec(code);
    expect(m, `thiếu nguồn ${key}`).toBeTruthy();
    return m![1];
  };

  it("hai gói cấm phân phối lại (Wuxia, Sunnyside) được đánh dấu RIÊNG (True); hiện tại + Ninja + Xianxia là công khai (False)", () => {
    expect(srcRow("wuxia")).toMatch(/, True, /);
    expect(srcRow("sunny")).toMatch(/, True, /);
    for (const k of ["cur", "ninja", "xian"]) expect(srcRow(k), k).toMatch(/, False, /);
  });

  it("gói CC0 ghi đúng giấy phép CC0; gói riêng ghi 'cấm'", () => {
    expect(srcRow("ninja")).toContain('"CC0"');
    expect(srcRow("xian")).toContain('"CC0"');
    expect(srcRow("wuxia")).toContain("cấm");
    expect(srcRow("sunny")).toContain("cấm");
  });

  it("tờ công khai thay MỌI ô của gói riêng bằng khung trống (điều kiện `public and private`)", () => {
    expect(code).toMatch(/if not c\.frames or \(public and private\):/);
  });

  it("tờ đầy đủ chỉ ghi vào thư mục riêng, mặc định ngoài repo", () => {
    expect(code).toContain('default="/mnt/data/assets-private/preview"');
    expect(code).toContain('f"{code_group}-day-du.png"');
  });
});

describe("dung-bang-duyet.py: nhóm 16 (giao diện), phần đọc mã / tài liệu (chạy mọi máy)", () => {
  const repo = path.join(here, "..", "..", "..");

  it("mọi ảnh chụp dùng làm hình HIỆN TẠI của giao diện có thật trong docs/screenshots (đổi tên / xoá ảnh chụp thì bảng duyệt vỡ)", () => {
    const m = /HUD, CHAR, SET, TT = ([^\n]+)\n/.exec(code);
    expect(m, "thiếu khai báo ảnh chụp giao diện").toBeTruthy();
    const names = [...m![1].matchAll(/"([^"]+\.png)"/g)].map((x) => x[1]);
    expect(names.length).toBe(4);
    for (const n of names)
      expect(fs.existsSync(path.join(repo, "docs/screenshots", n)), n).toBe(true);
  });

  it("DUYET_TUNG_PHAN.md có khối nhóm 16 với đủ UI-01..UI-09 và tờ ảnh công khai có thật", () => {
    const doc = fs.readFileSync(path.join(repo, "docs/art/huong-moi/DUYET_TUNG_PHAN.md"), "utf8");
    const blk = /<!-- NHOM 16 -->([\s\S]*?)<!-- \/NHOM 16 -->/.exec(doc);
    expect(blk, "thiếu khối NHOM 16").toBeTruthy();
    for (let i = 1; i <= 9; i++) expect(blk![1], `UI-0${i}`).toContain(`| UI-0${i} |`);
    expect(blk![1]).not.toMatch(/UI-10/);
    expect(
      fs.statSync(path.join(repo, "docs/art/huong-moi/16-giao-dien.png")).size,
    ).toBeGreaterThan(10_000);
  });

  it('ô giao diện của gói riêng (Sunnyside) KHÔNG bị gắn nhầm sang nguồn công khai: mọi lời gọi `opt("C", ...)` dùng nguồn sunny', () => {
    const calls = [...code.matchAll(/opt\("C", "(\w+)"/g)].map((x) => x[1]);
    expect(calls.length).toBeGreaterThanOrEqual(6);
    for (const src of calls) expect(src).toBe("sunny");
  });
});

describe.skipIf(!hasPillow)("dung-bang-duyet.py: hàm nine() (9-slice) dựng đúng hình học", () => {
  it("góc giữ nguyên điểm ảnh, giữa kéo giãn, đúng kích thước đích; phóng nguyên số khi scale > 1", () => {
    const prog = [
      "import sys; sys.dont_write_bytecode = True  # không để lại __pycache__ cạnh tập lệnh",
      "import importlib.util",
      `spec = importlib.util.spec_from_file_location("m", ${JSON.stringify(SCRIPT)})`,
      "m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)",
      "from PIL import Image",
      "src = Image.new('RGBA', (9, 9), (0, 0, 255, 255))",
      "src.putpixel((0, 0), (255, 0, 0, 255)); src.putpixel((8, 8), (0, 255, 0, 255)); src.putpixel((4, 0), (255, 255, 0, 255))",
      "o = m.nine(src, (3, 3, 3, 3), (40, 30))",
      "assert o.size == (40, 30), o.size",
      "assert o.getpixel((0, 0)) == (255, 0, 0, 255), 'góc trên trái'",
      "assert o.getpixel((39, 29)) == (0, 255, 0, 255), 'góc dưới phải'",
      "assert o.getpixel((20, 15)) == (0, 0, 255, 255), 'giữa'",
      "assert o.getpixel((20, 0)) == (255, 255, 0, 255), 'cạnh trên: phần giữa của cạnh nguồn được kéo giãn'",
      "src2 = Image.new('RGBA', (12, 12), (0, 0, 255, 255))",
      "src2.putpixel((7, 0), (255, 128, 0, 255)); src2.putpixel((11, 11), (0, 255, 0, 255)); src2.putpixel((1, 0), (255, 0, 255, 255))",
      "o3 = m.nine(src2, (2, 3, 5, 1), (40, 30))  # biên bất đối xứng: trái 2, trên 3, phải 5, dưới 1",
      "assert o3.getpixel((35, 0)) == (255, 128, 0, 255), 'biên PHẢI = 5: cột đầu của dải phải nằm ở x = 40 - 5'",
      "assert o3.getpixel((34, 0)) == (0, 0, 255, 255), 'trước dải phải là phần giữa (xanh)'",
      "assert o3.getpixel((1, 0)) == (255, 0, 255, 255), 'biên TRÁI = 2: cột 1 của nguồn giữ nguyên'",
      "assert o3.getpixel((39, 29)) == (0, 255, 0, 255) and o3.getpixel((39, 28)) == (0, 0, 255, 255), 'biên DƯỚI = 1: chỉ một hàng cuối là dải dưới'",
      "o2 = m.nine(src, (3, 3, 3, 3), (60, 60), scale=2)",
      "assert o2.getpixel((0, 0)) == o2.getpixel((1, 1)) == (255, 0, 0, 255), 'phóng nguyên số: 1 điểm ảnh gốc = 2x2'",
      "src3 = Image.new('RGBA', (6, 6), (0, 0, 255, 255)); src3.putpixel((0, 0), (255, 0, 0, 255)); src3.putpixel((2, 0), (255, 255, 0, 255))",
      "o4 = m.nine(src3, (1, 1, 1, 1), (60, 60), scale=3)  # biên 1 nhân 3 = 3 điểm ảnh; điểm ảnh gốc (2, 0) nằm ngoài biên",
      "assert o4.getpixel((2, 0)) == (255, 0, 0, 255), 'biên nhân theo scale: 3 điểm đầu vẫn là góc đỏ'",
      "assert o4.getpixel((3, 0)) != (255, 0, 0, 255), 'điểm thứ 4 đã là phần giữa'",
      "assert o2.getpixel((59, 59)) == (0, 255, 0, 255)",
      "s = m.stack([Image.new('RGBA', (10, 4)), Image.new('RGBA', (6, 5))], gap=3)",
      "assert s.size == (10, 12), s.size",
      "print('OK')",
    ].join("\n");
    const r = spawnSync("python3", ["-I", "-c", prog], { encoding: "utf8" });
    expect(r.status, String(r.stderr)).toBe(0);
    expect(String(r.stdout).trim()).toBe("OK");
  });
});

describe.skipIf(!can)("dung-bang-duyet.py: dựng thật (nhóm 10-13, 15 và 16)", () => {
  let dir = "";
  let pub = "";
  let priv = "";
  let run: ReturnType<typeof spawnSync>;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-bang-duyet-"));
    pub = path.join(dir, "pub");
    priv = path.join(dir, "priv");
    const names = path.join(dir, "names.json");
    fs.writeFileSync(
      names,
      JSON.stringify({
        npcs: NPCS.map((n) => ({ id: n.id, name: n.name, title: n.title })),
        mons: MONSTERS.map((m) => ({ id: m.id, name: m.name, boss: Boolean(m.boss) })),
        skills: LEARNABLE_SKILLS.map((k) => ({
          id: k.id,
          name: k.name,
          element: k.element,
          shape: k.shape,
          style: k.style ?? null,
        })),
      }),
    );
    run = spawnSync(
      "python3",
      [
        "-I",
        SCRIPT,
        "--groups",
        "10,11,12,13,15,16",
        "--public",
        pub,
        "--private",
        priv,
        "--names",
        names,
      ],
      { encoding: "utf8" },
    );
  }, 120_000);
  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("dựng đủ 4 nhóm: mỗi nhóm một tờ công khai + một tờ đầy đủ, đúng số mã", () => {
    expect(run.status, String(run.stderr)).toBe(0);
    const out = String(run.stdout);
    expect(out).toContain(`10-nguoi-choi 4 mã`);
    expect(out).toContain(`11-npc ${NPCS.length} mã`);
    expect(out).toContain(`12-quai ${MONSTERS.filter((m) => !m.boss).length} mã`);
    expect(out).toContain(`13-trum ${MONSTERS.filter((m) => m.boss).length} mã`);
    for (const g of ["10-nguoi-choi", "11-npc", "12-quai", "13-trum"]) {
      expect(fs.statSync(path.join(pub, `${g}.png`)).size, g).toBeGreaterThan(10_000);
      expect(fs.statSync(path.join(priv, `${g}-day-du.png`)).size, g).toBeGreaterThan(10_000);
    }
  });

  it("nhóm CÓ ô gói riêng (10, 11, 12): tờ công khai KHÁC tờ đầy đủ (ô gói riêng đã bị che)", () => {
    for (const g of ["10-nguoi-choi", "11-npc", "12-quai"]) {
      const a = fs.readFileSync(path.join(pub, `${g}.png`));
      const b = fs.readFileSync(path.join(priv, `${g}-day-du.png`));
      expect(a.equals(b), `${g}: tờ công khai trùng tờ đầy đủ = gói riêng lọt ra`).toBe(false);
    }
  });

  it("nhóm 13 KHÔNG dùng gói riêng: tờ công khai = tờ đầy đủ từng byte (không che nhầm)", () => {
    const a = fs.readFileSync(path.join(pub, "13-trum.png"));
    const b = fs.readFileSync(path.join(priv, "13-trum-day-du.png"));
    expect(a.equals(b)).toBe(true);
  });

  it("nhóm 15 (hiệu ứng chiêu): một tờ MỖI HỆ, tổng đúng số chiêu học được, mỗi hệ có chiêu đều có tờ", () => {
    const out = String(run.stdout);
    const slash = new Set(["cone", "line", "bolt", "dash"]);
    const byEl = new Map<string, number>();
    const privByEl = new Map<string, number>(); // ô C (vệt chém Wuxia, gói riêng) chỉ có ở chiêu chém / tia / lao
    for (const k of LEARNABLE_SKILLS) {
      byEl.set(k.element, (byEl.get(k.element) ?? 0) + 1);
      if (slash.has(k.shape)) privByEl.set(k.element, (privByEl.get(k.element) ?? 0) + 1);
    }
    let total = 0;
    for (const [el, n] of byEl) {
      expect(out, el).toContain(
        `15-hieu-ung-chieu-${el} ${n} mã (ô gói riêng: ${privByEl.get(el) ?? 0})`,
      );
      total += n;
      expect(fs.statSync(path.join(pub, `15-hieu-ung-chieu-${el}.png`)).size, el).toBeGreaterThan(
        5_000,
      );
    }
    expect(total).toBe(LEARNABLE_SKILLS.length);
  });

  it("nhóm 15: tờ có chiêu chém / tia / lao (ô C là Wuxia, gói riêng) thì tờ công khai KHÁC tờ đầy đủ; tờ không có thì GIỐNG", () => {
    const slash = new Set(["cone", "line", "bolt", "dash"]);
    const hasSlash = new Map<string, boolean>();
    for (const k of LEARNABLE_SKILLS)
      hasSlash.set(k.element, hasSlash.get(k.element) || slash.has(k.shape));
    for (const [el, yes] of hasSlash) {
      const a = fs.readFileSync(path.join(pub, `15-hieu-ung-chieu-${el}.png`));
      const b = fs.readFileSync(path.join(priv, `15-hieu-ung-chieu-${el}-day-du.png`));
      expect(a.equals(b), `${el}: ${yes ? "gói riêng lọt ra tờ công khai" : "che nhầm"}`).toBe(
        !yes,
      );
    }
  });

  it("nhóm 16 (giao diện): 9 mã, đúng 7 ô gói riêng (UI-01..05, 07, 08 ô C Sunnyside), tờ công khai KHÁC tờ đầy đủ", () => {
    const out = String(run.stdout);
    expect(out).toContain("16-giao-dien 9 mã (ô gói riêng: 7)");
    const a = fs.readFileSync(path.join(pub, "16-giao-dien.png"));
    const b = fs.readFileSync(path.join(priv, "16-giao-dien-day-du.png"));
    expect(a.length).toBeGreaterThan(10_000);
    expect(a.equals(b), "gói riêng lọt ra tờ công khai").toBe(false);
  });
});
