// Bảng duyệt đồ hoạ từng phần (`dung-bang-duyet.py`, QUYET_DINH_M3 mục 67.2 / 69, issue #1330). Điều QUAN TRỌNG nhất là ranh giới GIẤY PHÉP: tờ ảnh CÔNG KHAI (vào repo) KHÔNG được chứa
// hình của gói cấm phân phối lại (Wuxia RTS, Sunnyside, Cainos). Phần đọc mã chạy ở mọi máy; phần dựng thật cần Pillow + các gói ở /mnt/data (máy chủ chung có, CI không): thiếu thì bỏ qua.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ITEMS, MONSTERS, NPCS, RARITY_NAMES } from "../../../shared/src/index";

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

describe.skipIf(!can)("dung-bang-duyet.py: dựng thật (nhóm 10-13)", () => {
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
      }),
    );
    run = spawnSync(
      "python3",
      [
        "-I",
        SCRIPT,
        "--groups",
        "10,11,12,13",
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
});

describe.skipIf(!can)("dung-bang-duyet.py: dựng thật (nhóm 14 - vật phẩm)", () => {
  let dir = "";
  let run: ReturnType<typeof spawnSync>;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-bang-duyet-vp-"));
    const pub = path.join(dir, "pub");
    const priv = path.join(dir, "priv");
    const names = path.join(dir, "names.json");
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
      }),
    );
    run = spawnSync(
      "python3",
      ["-I", SCRIPT, "--groups", "14", "--public", pub, "--private", priv, "--names", names],
      { encoding: "utf8" },
    );
  }, 120_000);
  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("dựng nhóm 14: đủ 126 vật phẩm, tờ công khai + tờ đầy đủ đều > 10 KB", () => {
    expect(run.status, String(run.stderr)).toBe(0);
    expect(String(run.stdout)).toContain(`14-vat-pham ${ITEMS.length} mã`);
    expect(fs.statSync(path.join(dir, "pub", "14-vat-pham.png")).size).toBeGreaterThan(10_000);
    expect(fs.statSync(path.join(dir, "priv", "14-vat-pham-day-du.png")).size).toBeGreaterThan(
      10_000,
    );
  });

  it("nhóm 14 CHỈ dùng nguồn công khai (cur/ninja/xian): tờ công khai = tờ đầy đủ từng byte (KHÔNG có ô gói riêng lọt ra)", () => {
    const a = fs.readFileSync(path.join(dir, "pub", "14-vat-pham.png"));
    const b = fs.readFileSync(path.join(dir, "priv", "14-vat-pham-day-du.png"));
    expect(a.equals(b)).toBe(true);
  });
});
