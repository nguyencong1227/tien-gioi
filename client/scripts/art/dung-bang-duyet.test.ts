// Bảng duyệt đồ hoạ từng phần (`dung-bang-duyet.py`, QUYET_DINH_M3 mục 67.2 / 69, issue #1330). Điều QUAN TRỌNG nhất là ranh giới GIẤY PHÉP: tờ ảnh CÔNG KHAI (vào repo) KHÔNG được chứa
// hình của gói cấm phân phối lại (Wuxia RTS, Sunnyside, Cainos). Phần đọc mã chạy ở mọi máy; phần dựng thật cần Pillow + các gói ở /mnt/data (máy chủ chung có, CI không): thiếu thì bỏ qua.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ITEMS, LEARNABLE_SKILLS, MONSTERS, NPCS, RARITY_NAMES } from "../../../shared/src/index";

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
  // hai gói HOANTDZ (nhóm 14 ô C icon, nhóm 17 nền): đúng hai tệp chỉ mục mà `Loaders` mở (`HICON` / `BB` ở dung-bang-duyet.py); thiếu thì dựng thật phải BỎ QUA, không đỏ giả
  "/mnt/data/assets-private/work/hoantdz-icons/Wuxia_Pixel_Icons_Mega_FREE_Sample_v1.0.0/_Index/sample_icons.csv",
  "/mnt/data/assets-private/work/hoantdz-battlebacks/Wuxia_Xianxia_Pixel_Battlebacks_100_v1.0.0/_Index/all_battlebacks.csv",
];
const can = hasPillow && SOURCES.every((p) => fs.existsSync(p));

describe("dung-bang-duyet.py: ranh giới giấy phép (đọc mã, chạy mọi máy)", () => {
  /** Dòng của bảng SRC cho một nguồn. */
  const srcRow = (key: string) => {
    const m = new RegExp(`"${key}": \\(([^\\n]*)\\),\\n`).exec(code);
    expect(m, `thiếu nguồn ${key}`).toBeTruthy();
    return m![1];
  };

  it("bốn gói cấm phân phối lại (Wuxia, Sunnyside, HOANTDZ icon, HOANTDZ nền) được đánh dấu RIÊNG (True); hiện tại + Ninja + Xianxia là công khai (False)", () => {
    for (const k of ["wuxia", "sunny", "hicon", "bb"]) expect(srcRow(k), k).toMatch(/, True, /);
    for (const k of ["cur", "ninja", "xian"]) expect(srcRow(k), k).toMatch(/, False, /);
  });

  it("gói CC0 ghi đúng giấy phép CC0; gói riêng ghi 'cấm'", () => {
    expect(srcRow("ninja")).toContain('"CC0"');
    expect(srcRow("xian")).toContain('"CC0"');
    for (const k of ["wuxia", "sunny", "hicon", "bb"]) expect(srcRow(k), k).toContain("cấm");
  });

  it("tờ công khai thay MỌI ô của gói riêng bằng khung trống (điều kiện `public and private`)", () => {
    expect(code).toMatch(/if not c\.frames or \(public and private\):/);
  });

  it("tờ đầy đủ chỉ ghi vào thư mục riêng, mặc định ngoài repo", () => {
    expect(code).toContain('default="/mnt/data/assets-private/preview"');
    expect(code).toContain('f"{code_group}-day-du.png"');
  });
});

describe("dung-bang-duyet.py: nhóm 14 (vật phẩm), phần đọc tài liệu (chạy mọi máy)", () => {
  const repo = path.join(here, "..", "..", "..");

  it("DUYET_TUNG_PHAN.md có khối nhóm 14 với ĐỦ mã VP-001..VP-<số vật phẩm> liên tục, mỗi mã đúng một hàng, và các tờ công khai có thật", () => {
    const doc = fs.readFileSync(path.join(repo, "docs/art/huong-moi/DUYET_TUNG_PHAN.md"), "utf8");
    const blk = /<!-- NHOM 14 -->([\s\S]*?)<!-- \/NHOM 14 -->/.exec(doc);
    expect(blk, "thiếu khối NHOM 14").toBeTruthy();
    const codes = [...blk![1].matchAll(/^\| (VP-\d{3}) \|/gm)].map((m) => m[1]);
    // Mã VP lấy từ bảng ỔN ĐỊNH (ma-co-dinh.json) chứ KHÔNG còn là VP-001.. theo thứ tự ITEMS: tờ có thể THIẾU vật phẩm mới thêm sau lần dựng lại cuối (PR nội dung không dựng
    // lại tờ), nhưng mỗi mã đúng MỘT hàng, các mã liên tục 001..K, và K không vượt số vật phẩm.
    expect(new Set(codes).size, "mã VP lặp").toBe(codes.length);
    expect(codes.length).toBeGreaterThanOrEqual(128);
    expect(codes.length).toBeLessThanOrEqual(ITEMS.length);
    expect([...codes].sort()).toEqual(codes.map((_, i) => `VP-${String(i + 1).padStart(3, "0")}`));
    const sheets = [...blk![1].matchAll(/`(14-vat-pham-[a-z-]+\d?)\.png`/g)].map((m) => m[1]);
    expect(new Set(sheets).size).toBeGreaterThanOrEqual(4);
    for (const f of new Set(sheets))
      expect(fs.statSync(path.join(repo, `docs/art/huong-moi/${f}.png`)).size, f).toBeGreaterThan(
        5_000,
      );
  });

  it("nhóm 14: phương án A / B CHỈ nguồn công khai (xian / ninja); gói riêng chỉ xuất hiện ở ô C (hicon), không wuxia / sunny / bb", () => {
    const body = code.slice(code.indexOf("def vp_row("), code.indexOf("def group_vp("));
    expect(body.length).toBeGreaterThan(500);
    expect(body).not.toMatch(/"wuxia"|"sunny"|"bb"/);
    const ab = [...body.matchAll(/cell\(L, "([AB])", "(\w+)"/g)];
    expect(ab.length).toBeGreaterThan(10);
    for (const m of ab) expect(["xian", "ninja"], `ô ${m[1]} dùng nguồn ${m[2]}`).toContain(m[2]);
    // mọi chỗ nhắc "hicon" đều là ô C (che ở tờ công khai)
    const all = body.match(/"hicon"/g)?.length ?? 0;
    const inC = body.match(/Cell\("C", "hicon"/g)?.length ?? 0;
    expect(all).toBeGreaterThan(2);
    expect(inC).toBe(all);
  });
});

// Mã ỔN ĐỊNH (A chốt 25/11): mã VP / HU của tờ người dùng đã nhận ngày 23/11 13:00 +0700 (commit dd32ff1b: VP-001..128, HU-01..59) KHÔNG BAO GIỜ đổi; vật phẩm / chiêu thêm sau nhận số ở CUỐI.
// Mô-đun `ma-co-dinh.py` thuần (không Pillow) nên chạy ở mọi máy có python3, kể cả CI.
const hasPython = spawnSync("python3", ["-I", "-c", "pass"], { encoding: "utf8" }).status === 0;
const MA_FILE = path.join(here, "ma-co-dinh.py");
const MA_JSON = path.join(here, "..", "..", "..", "docs/art/huong-moi/ma-co-dinh.json");
const DONG_BANG = { vp: 128, hu: 59 };
/** sha256 của các dòng `vp:<id>=<số>` rồi `hu:<id>=<số>` (số tăng dần) của phần ĐÃ ĐÓNG BĂNG; sửa một mã đã giao người dùng là đỏ. */
const DONG_BANG_SHA256 = "ac64cbf5272abeeb19a3e75e2a0fd9620a3a2d91a860047b518044b86421a83c";

type MaTable = {
  dong_bang: { commit: string; vp_toi_da: number; hu_toi_da: number };
  mo_coi: Record<string, string>;
  vp: Record<string, number>;
  hu: Record<string, number>;
};
const maTable = (): MaTable => JSON.parse(fs.readFileSync(MA_JSON, "utf8")) as MaTable;
/** Chạy một đoạn python với mô-đun mã nạp sẵn là `MA`; nhận / trả JSON. */
function ma(code: string, input: unknown = null) {
  const r = spawnSync(
    "python3",
    [
      "-I",
      "-c",
      `import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("ma", ${JSON.stringify(MA_FILE)})
MA = importlib.util.module_from_spec(spec); spec.loader.exec_module(MA)
inp = json.load(sys.stdin)
${code}`,
    ],
    { input: JSON.stringify(input), encoding: "utf8" },
  );
  return { status: r.status, out: String(r.stdout), err: String(r.stderr) };
}

describe("dung-bang-duyet.py: mã ỔN ĐỊNH của tờ duyệt (ma-co-dinh.json)", () => {
  const repo = path.join(here, "..", "..", "..");

  it("phần ĐÃ ĐÓNG BĂNG (tờ 23/11 dd32ff1b: VP-001..128, HU-01..59) giữ nguyên từng id -> số", () => {
    const t = maTable();
    expect(t.dong_bang).toMatchObject({
      commit: "dd32ff1b",
      vp_toi_da: DONG_BANG.vp,
      hu_toi_da: DONG_BANG.hu,
    });
    const frozen = (kind: "vp" | "hu", max: number) =>
      Object.entries(t[kind])
        .filter(([, n]) => n <= max)
        .sort((a, b) => a[1] - b[1])
        .map(([id, n]) => `${kind}:${id}=${n}`);
    const lines = [...frozen("vp", DONG_BANG.vp), ...frozen("hu", DONG_BANG.hu)];
    expect(lines).toHaveLength(DONG_BANG.vp + DONG_BANG.hu);
    expect(createHash("sha256").update(lines.join("\n")).digest("hex")).toBe(DONG_BANG_SHA256);
  });

  it("bảng hợp lệ: số liên tục 1..K, không trùng số / id; mọi id còn khớp vật phẩm / chiêu (id không còn khớp phải khai trong mo_coi)", () => {
    const t = maTable();
    const itemIds = new Set(ITEMS.map((i) => i.id));
    const skillIds = new Set(LEARNABLE_SKILLS.map((k) => k.id));
    for (const [kind, known] of [
      ["vp", itemIds],
      ["hu", skillIds],
    ] as const) {
      const nums = Object.values(t[kind]).sort((a, b) => a - b);
      expect(nums, `${kind}: số liên tục từ 1`).toEqual(nums.map((_, i) => i + 1));
      const orphan = Object.keys(t[kind]).filter((id) => !known.has(id));
      for (const id of orphan)
        expect(
          t.mo_coi[`${kind}:${id}`],
          `${kind}:${id} không còn khớp: khai trong mo_coi (số không dùng lại)`,
        ).toBeTruthy();
    }
  });

  it("mã VP / HU trong DUYET_TUNG_PHAN.md khớp bảng (cùng số = cùng vật phẩm / chiêu), nên tờ không bao giờ đổi nghĩa mã", () => {
    const t = maTable();
    const doc = fs.readFileSync(path.join(repo, "docs/art/huong-moi/DUYET_TUNG_PHAN.md"), "utf8");
    const byNum = (kind: "vp" | "hu") =>
      new Map(Object.entries(t[kind]).map(([id, n]) => [n, id] as const));
    const vpId = byNum("vp");
    const huId = byNum("hu");
    const items = new Map(ITEMS.map((i) => [i.id, i.name] as const));
    const skills = new Map(LEARNABLE_SKILLS.map((k) => [k.id, k.name] as const));
    let vpRows = 0;
    let huRows = 0;
    for (const m of doc.matchAll(/^\| (VP|HU)-(\d+) \| ([^|]*?) \|/gm)) {
      const n = Number(m[2]);
      const shown = m[3].replace(/ · MỚI \(sau 23\/11\)$/, "");
      if (m[1] === "VP") {
        vpRows++;
        expect(shown, `VP-${m[2]}`).toBe(items.get(vpId.get(n) ?? ""));
      } else {
        huRows++;
        expect(shown.startsWith(`${skills.get(huId.get(n) ?? "")} (`), `HU-${m[2]}: ${shown}`).toBe(
          true,
        );
      }
    }
    expect(vpRows).toBeGreaterThanOrEqual(DONG_BANG.vp);
    expect(huRows).toBeGreaterThanOrEqual(DONG_BANG.hu);
  });

  it.skipIf(!hasPython)(
    "assign_codes: id cũ giữ số, id mới nhận số Ở CUỐI dù chèn GIỮA danh sách",
    () => {
      const r = ma(`print(json.dumps(MA.assign_codes(inp["t"], inp["ids"])))`, {
        t: { a: 1, b: 2 },
        ids: ["x", "a", "y", "b", "z"],
      });
      expect(r.status, r.err).toBe(0);
      expect(JSON.parse(r.out)).toEqual({ x: 3, a: 1, y: 4, b: 2, z: 5 });
    },
  );

  it.skipIf(!hasPython)(
    "assign_codes: số của id MỒ CÔI (đã xoá / đổi id) không bao giờ cấp lại; id lặp là lỗi",
    () => {
      const orphan = ma(
        `print(json.dumps(MA.assign_codes(inp["t"], inp["ids"])))`,
        { t: { a: 1, b: 2, c: 3 }, ids: ["a", "b", "z"] }, // c bị xoá
      );
      expect(orphan.status, orphan.err).toBe(0);
      expect(JSON.parse(orphan.out)).toEqual({ a: 1, b: 2, z: 4 });
      const dup = ma(`MA.assign_codes(inp["t"], inp["ids"])`, { t: { a: 1 }, ids: ["a", "a"] });
      expect(dup.status).not.toBe(0);
    },
  );

  it.skipIf(!hasPython)(
    "is_new / label / extended: mốc đóng băng, định dạng mã, không đổi bảng gốc",
    () => {
      const tbl = { dong_bang: { vp_toi_da: 128, hu_toi_da: 59 }, vp: { a: 1 }, hu: { b: 1 } };
      const r = ma(
        `t = inp
e = MA.extended(t, "vp", {"n": 129})
print(json.dumps([MA.is_new(t, "vp", 128), MA.is_new(t, "vp", 129), MA.is_new(t, "hu", 59), MA.is_new(t, "hu", 60), MA.label("vp", 7), MA.label("hu", 7), e["vp"], t["vp"]]))`,
        tbl,
      );
      expect(r.status, r.err).toBe(0);
      expect(JSON.parse(r.out)).toEqual([
        false,
        true,
        false,
        true,
        "VP-007",
        "HU-07",
        { a: 1, n: 129 },
        { a: 1 },
      ]);
    },
  );

  it.skipIf(!hasPython)(
    "load: bảng trùng số, số không hợp lệ hay thiếu khoá là lỗi (không nuốt lặng)",
    () => {
      const base = { dong_bang: {}, vp: {}, hu: {} };
      const bad: unknown[] = [
        { ...base, vp: { a: 1, b: 1 } },
        { ...base, hu: { a: 0 } },
        { ...base, hu: { a: "1" } },
        { dong_bang: {}, vp: {} },
      ];
      for (const b of bad) {
        const r = ma(
          `import tempfile, os
f = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf8"); json.dump(inp, f); f.close()
try:
    MA.load(f.name)
finally:
    os.unlink(f.name)`,
          b,
        );
        expect(r.status, JSON.stringify(b)).not.toBe(0);
      }
    },
  );

  it("generator CHỈ đọc bảng: group_vp / group_hu cấp mã bằng MA.assign_codes, không còn bộ đếm tuần tự", () => {
    const body = (from: string, to: string) => code.slice(code.indexOf(from), code.indexOf(to));
    const vp = body("def group_vp(", "# Nền / màn tải / Hoàng Tuyền (nhóm 17");
    const hu = body("def group_hu(", "def group_ui(");
    expect(vp.length).toBeGreaterThan(500);
    expect(hu.length).toBeGreaterThan(500);
    expect(vp).toMatch(/MA\.assign_codes\(t\["vp"\]/);
    expect(hu).toMatch(/MA\.assign_codes\(t\["hu"\]/);
    for (const b of [vp, hu]) expect(b).not.toMatch(/\bn \+= 1\b/);
    expect(hu).not.toMatch(/enumerate\(/); // group_hu không có lý do dùng chỉ số thứ tự (group_vp có: đánh số tờ chia nhỏ)
    expect(code).not.toMatch(/f"VP-\{n:03d\}"/);
    expect(code).not.toMatch(/f"HU-\{n:02d\}"/);
  });
});

describe("dung-bang-duyet.py: nhóm 17 (nền / màn tải / Hoàng Tuyền), phần đọc mã / tài liệu (chạy mọi máy)", () => {
  const repo = path.join(here, "..", "..", "..");

  it("DUYET_TUNG_PHAN.md có khối nhóm 17 với NEN-01.. liên tục (đủ ít nhất 10 mã, có Hoàng Tuyền) và tờ công khai có thật", () => {
    const doc = fs.readFileSync(path.join(repo, "docs/art/huong-moi/DUYET_TUNG_PHAN.md"), "utf8");
    const blk = /<!-- NHOM 17 -->([\s\S]*?)<!-- \/NHOM 17 -->/.exec(doc);
    expect(blk, "thiếu khối NHOM 17").toBeTruthy();
    const codes = [...blk![1].matchAll(/^\| (NEN-\d{2}) \|/gm)].map((m) => m[1]);
    expect(codes.length).toBeGreaterThanOrEqual(10);
    expect(codes).toEqual(codes.map((_, i) => `NEN-${String(i + 1).padStart(2, "0")}`));
    expect(blk![1]).toMatch(/HOÀNG TUYỀN/);
    expect(fs.statSync(path.join(repo, "docs/art/huong-moi/17-nen.png")).size).toBeGreaterThan(
      10_000,
    );
  });

  it("nhóm 17: MỌI phương án A / B / C là cảnh của gói riêng `bb` (che ở tờ công khai); hình hiện tại là ảnh trong repo / ảnh chụp", () => {
    const body = code.slice(code.indexOf("def group_nen("), code.indexOf("def md_for("));
    expect(body.length).toBeGreaterThan(500);
    expect(body).toContain('cell(L, letter, "bb"');
    expect(body).not.toMatch(/"wuxia"|"sunny"|"hicon"|"xian"|"ninja"/);
    // mọi mã cảnh BBnn-mm trong bảng NEN_ROWS tồn tại trong định dạng của gói
    const rows = code.slice(code.indexOf("NEN_ROWS = ["), code.indexOf("def to_height("));
    const ids = [...rows.matchAll(/"(BB\d{2}-\d{2})"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(30);
    for (const id of ids) expect(id).toMatch(/^BB(0[1-9]|10)-(0[1-9]|10)$/);
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

describe.skipIf(!can)("dung-bang-duyet.py: dựng thật (nhóm 10-17)", () => {
  let dir = "";
  let pub = "";
  let priv = "";
  let namesFile = "";
  let run: ReturnType<typeof spawnSync>;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-bang-duyet-"));
    pub = path.join(dir, "pub");
    priv = path.join(dir, "priv");
    const names = path.join(dir, "names.json");
    namesFile = names;
    fs.writeFileSync(
      names,
      JSON.stringify({
        npcs: NPCS.map((n) => ({ id: n.id, name: n.name, title: n.title })),
        mons: MONSTERS.map((m) => ({ id: m.id, name: m.name, boss: Boolean(m.boss) })),
        items: ITEMS.map((i) => ({
          id: i.id,
          name: i.name,
          type: i.type,
          rarity: i.rarity,
          rarityName: RARITY_NAMES[i.rarity],
        })),
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
        "10,11,12,13,14,15,16,17",
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

  it("mã VP / HU của tờ VỪA DỰNG khớp bảng ma-co-dinh.json (đổi ITEMS / chiêu không làm nhích mã; mã mới ở CUỐI, ghi MỚI)", () => {
    const repo = path.join(here, "..", "..", "..");
    const md = path.join(dir, "ma.md");
    fs.copyFileSync(path.join(repo, "docs/art/huong-moi/DUYET_TUNG_PHAN.md"), md);
    const r = spawnSync(
      "python3",
      [
        "-I",
        SCRIPT,
        "--groups",
        "14,15",
        "--public",
        pub,
        "--private",
        priv,
        "--names",
        namesFile,
        "--md",
        md,
      ],
      { encoding: "utf8" },
    );
    expect(r.status, String(r.stderr)).toBe(0);
    const t = maTable();
    const items = new Map(ITEMS.map((i) => [i.id, i.name] as const));
    const skills = new Map(LEARNABLE_SKILLS.map((k) => [k.id, k.name] as const));
    const vpId = new Map(Object.entries(t.vp).map(([id, n]) => [n, id] as const));
    const huId = new Map(Object.entries(t.hu).map(([id, n]) => [n, id] as const));
    const text = fs.readFileSync(md, "utf8");
    let vp = 0;
    let hu = 0;
    for (const m of text.matchAll(/^\| (VP|HU)-(\d+) \| ([^|]*?) \|/gm)) {
      const n = Number(m[2]);
      const mới = / · MỚI \(sau 23\/11\)$/.test(m[3]);
      const shown = m[3].replace(/ · MỚI \(sau 23\/11\)$/, "");
      if (m[1] === "VP") {
        vp++;
        expect(shown, `VP-${m[2]}`).toBe(items.get(vpId.get(n) ?? ""));
        expect(mới, `VP-${m[2]} MỚI`).toBe(n > DONG_BANG.vp);
      } else {
        hu++;
        expect(shown.startsWith(`${skills.get(huId.get(n) ?? "")} (`), `HU-${m[2]}: ${shown}`).toBe(
          true,
        );
        expect(mới, `HU-${m[2]} MỚI`).toBe(n > DONG_BANG.hu);
      }
    }
    expect(vp).toBe(ITEMS.length);
    expect(hu).toBe(LEARNABLE_SKILLS.length);
  }, 120_000);

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

  // CHỈ chạy khi DUYET_KIEM=1 (A, 25/11): tờ trong repo CỐ Ý đóng băng trong lúc người dùng duyệt (PR nội dung KHÔNG dựng lại tờ; B dựng lại MỘT LẦN lúc duyệt), nên so khớp
  // mặc định sẽ đỏ ở mọi PR thêm vật phẩm / chiêu. Chạy trước khi duyệt / sau khi đổi bố cục công cụ: `DUYET_KIEM=1 npx vitest run client/scripts/art/dung-bang-duyet.test.ts`.
  it.skipIf(process.env.DUYET_KIEM !== "1")(
    "MỌI tờ công khai trong repo (docs/art/huong-moi) == bản dựng lại từ mã (đổi bố cục công cụ mà quên dựng lại tờ cũ thì đỏ; chỉ chạy khi DUYET_KIEM=1)",
    () => {
      const repoDir = path.join(here, "..", "..", "..", "docs/art/huong-moi");
      const sheets = fs.readdirSync(pub).filter((f) => f.endsWith(".png"));
      expect(sheets.length).toBeGreaterThanOrEqual(22); // 4 (nhóm 10-13) + 6 (nhóm 14) + 10 (nhóm 15) + 1 (nhóm 16) + 1 (nhóm 17)
      for (const f of sheets) {
        const inRepo = fs.readFileSync(path.join(repoDir, f));
        expect(
          inRepo.equals(fs.readFileSync(path.join(pub, f))),
          `${f}: tờ trong repo LỆCH bản dựng lại: chạy lại dung-bang-duyet.py --groups 10,11,12,13,14,15,16,17 --md docs/art/huong-moi/DUYET_TUNG_PHAN.md`,
        ).toBe(true);
      }
    },
  );

  it("nhóm 14 (vật phẩm): từ sáu tờ trở lên, mỗi tờ <= 30 hàng, tổng đúng số vật phẩm; ô C (icon HOANTDZ, gói riêng) có ở mọi tờ có món hợp, tờ công khai KHÁC tờ đầy đủ đúng khi có ô riêng", () => {
    const out = String(run.stdout);
    const lines = out.split("\n").filter((l) => l.startsWith("ĐÃ DỰNG 14-vat-pham-"));
    expect(lines.length).toBeGreaterThanOrEqual(6); // số tờ tăng khi một nhóm vượt bội của 30 hàng (kinh quyển 59 -> 61 thành 3 tờ)
    let total = 0;
    let privTotal = 0;
    for (const l of lines) {
      const m = /ĐÃ DỰNG (14-vat-pham-[a-z-]+\d?) (\d+) mã \(ô gói riêng: (\d+)\)/.exec(l);
      expect(m, l).toBeTruthy();
      const rows = Number(m![2]);
      const priv_ = Number(m![3]);
      total += rows;
      privTotal += priv_;
      expect(rows, l).toBeLessThanOrEqual(30); // tờ không quá cao
      // mọi vật phẩm trừ NGUYÊN LIỆU quái có ô C (gói icon có đủ đan, phù, sách, trang bị 5 bậc); nguyên liệu chỉ nanh / xương / ngọc
      if (!m![1].includes("nguyen-lieu")) expect(priv_, l).toBe(rows);
      else expect(priv_, l).toBeGreaterThan(0);
      const a = fs.readFileSync(path.join(pub, `${m![1]}.png`));
      const b = fs.readFileSync(path.join(priv, `${m![1]}-day-du.png`));
      expect(
        a.equals(b),
        `${m![1]}: ô riêng ${priv_} nên tờ công khai ${priv_ ? "phải KHÁC" : "phải == "} tờ đầy đủ`,
      ).toBe(priv_ === 0);
    }
    expect(total).toBe(ITEMS.length);
    expect(privTotal).toBeGreaterThan(100);
  });

  it("nhóm 17 (nền): 13 mã, 39 ô gói riêng (3 phương án x 13), tờ công khai KHÁC tờ đầy đủ", () => {
    const out = String(run.stdout);
    const m = /ĐÃ DỰNG 17-nen (\d+) mã \(ô gói riêng: (\d+)\)/.exec(out);
    expect(m, "thiếu dòng nhóm 17").toBeTruthy();
    expect(Number(m![1])).toBeGreaterThanOrEqual(10);
    expect(Number(m![2])).toBe(Number(m![1]) * 3);
    const a = fs.readFileSync(path.join(pub, "17-nen.png"));
    const b = fs.readFileSync(path.join(priv, "17-nen-day-du.png"));
    expect(a.length).toBeGreaterThan(10_000);
    expect(a.equals(b), "gói riêng lọt ra tờ công khai").toBe(false);
  });

  it("RÒ RỈ: tờ công khai KHÔNG phụ thuộc điểm ảnh của gói riêng (thay MỌI ảnh dưới /mnt/data/assets-private bằng màu đặc, dựng lại: tờ công khai giữ nguyên từng byte)", () => {
    const pub2 = path.join(dir, "pub-magenta");
    const priv2 = path.join(dir, "priv-magenta");
    const prog = [
      "import importlib.util, sys",
      "sys.dont_write_bytecode = True",
      `spec = importlib.util.spec_from_file_location("m", ${JSON.stringify(SCRIPT)})`,
      "m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)",
      "from PIL import Image",
      "orig = m.load",
      "def fake(p):",
      "    im = orig(p)",
      "    return Image.new('RGBA', im.size, (255, 0, 255, 255)) if str(p).startswith('/mnt/data/assets-private/') else im",
      "m.load = fake",
      `sys.argv = ['x', '--groups', '10,11,12,13,14,15,16,17', '--public', ${JSON.stringify(pub2)}, '--private', ${JSON.stringify(priv2)}, '--names', ${JSON.stringify(namesFile)}]`,
      "m.main()",
    ].join("\n");
    const r = spawnSync("python3", ["-I", "-c", prog], { encoding: "utf8" });
    expect(r.status, String(r.stderr)).toBe(0);
    const sheets = fs.readdirSync(pub).filter((f) => f.endsWith(".png"));
    expect(sheets.length).toBeGreaterThanOrEqual(22);
    for (const f of sheets) {
      expect(
        fs.readFileSync(path.join(pub, f)).equals(fs.readFileSync(path.join(pub2, f))),
        `${f}: tờ công khai THAY ĐỔI khi ảnh gói riêng đổi = điểm ảnh gói riêng đã lọt ra tờ công khai`,
      ).toBe(true);
    }
    // đối chứng: tờ ĐẦY ĐỦ thì CÓ phụ thuộc (phép thử có nghĩa), ít nhất ở một tờ có ô gói riêng
    const fullDiffers = fs
      .readdirSync(priv)
      .filter((f) => f.endsWith("-day-du.png"))
      .some(
        (f) => !fs.readFileSync(path.join(priv, f)).equals(fs.readFileSync(path.join(priv2, f))),
      );
    expect(fullDiffers, "đối chứng: tờ đầy đủ phải đổi khi ảnh gói riêng đổi").toBe(true);
  }, 120_000);
});
