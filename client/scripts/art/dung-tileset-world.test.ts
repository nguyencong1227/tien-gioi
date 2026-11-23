// Ảnh tileset thật của lớp hình bản đồ (`dung-tileset-world.py`, QUYET_DINH_M3 mục 67.1, issue #1330): script tự kiểm bất biến (đủ 47 ô Wang blob đặc ở bốn khối cát / đất / nước / đá lát, bốn ô vật thể thân cây / tán / đá / bụi, không sót
// màu gốc, bảng màu các vùng khác nhau, đùn mép đúng, tất định) và thoát khác 0 khi sai. Cần Pillow VÀ gói gốc ở /mnt/data (máy chủ chung có, CI không có): thiếu thì bỏ qua.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(here, "dung-tileset-world.py");
const SRC = process.env.NINJA_ADVENTURE_SRC ?? "/mnt/data/assets-src/ninja-adventure";
const hasPillow =
  spawnSync("python3", ["-I", "-c", "import PIL"], { encoding: "utf8" }).status === 0;
const hasSource = [
  "tileset_floor.png",
  "tileset_interior_floor.png",
  "tileset_village_abandoned.png",
].every((f) => fs.existsSync(path.join(SRC, "content/map", f)));
const can = hasPillow && hasSource;

// Mã nguồn của script (không cần Pillow / gói gốc): các điều kiện này luôn kiểm được.
const code = fs.readFileSync(SCRIPT, "utf8");

describe("dung-tileset-world.py: cam kết bố cục (đọc mã, chạy được ở mọi máy)", () => {
  it("bố cục khớp hằng số của map-builder (22 cột, ô 16 px, đùn mép margin 1 / spacing 2, khối cát (0,0) / đất (0,7) / nước (0,21))", () => {
    expect(code).toMatch(/COLS = 22\b/);
    expect(code).toMatch(/TILE = 16\b/);
    expect(code).toMatch(/MARGIN, SPACING = 1, 2\b/);
    expect(code).toMatch(/BLOCK_SAND, BLOCK_DIRT, BLOCK_WATER = \(0, 0\), \(0, 7\), \(0, 21\)/);
    const builder = fs.readFileSync(
      path.join(here, "../../../server/src/systems/map-builder.ts"),
      "utf8",
    );
    expect(builder).toMatch(/TILES_WORLD_COLUMNS = 22\b/);
    expect(builder).toMatch(/VARIANT_SAND = \{ col: 0, row: 0 \}/);
    expect(builder).toMatch(/VARIANT_DIRT = \{ col: 0, row: 7 \}/);
    expect(builder).toMatch(/VARIANT_WATER = \{ col: 0, row: 21 \}/);
    expect(builder).toMatch(/margin: 1\b/);
    expect(builder).toMatch(/spacing: 2\b/);
  });

  it("đủ bốn bản đồ của game, mỗi bản đồ đủ nhóm màu (cỏ, đất, bụi, cát, nước)", () => {
    for (const id of ["lac_ha", "hac_phong", "am_suong", "han_van"]) {
      expect(code).toContain(`"${id}": {`);
    }
    for (const key of ["grass", "dirt", "tuft", "sand", "water"]) {
      expect(code.match(new RegExp(`"${key}": \\[`, "g"))?.length).toBe(4);
    }
    // bảng đá lát (sàn trấn, bước a2): bốn màu mỗi vùng
    expect(
      code.match(
        /"stone": \{"mortar": "#\w{6}", "stone": "#\w{6}", "deep": "#\w{6}", "hi": "#\w{6}"\}/g,
      )?.length,
    ).toBe(4);
  });

  it("khối đá lát và bốn ô vật thể nằm ĐÚNG chỗ `VARIANT_STONE` / `GID_*` của map-builder (gid = firstgid + hàng x cột-số + cột)", () => {
    const builder = fs.readFileSync(
      path.join(here, "../../../server/src/systems/map-builder.ts"),
      "utf8",
    );
    const num = (name: string) =>
      Number(new RegExp(`export const ${name} = (\\d+);`).exec(builder)?.[1]);
    const pair = (name: string) => {
      const m = new RegExp(`${name} = \\((\\d+), (\\d+)\\)`).exec(code);
      expect(m, name).toBeTruthy();
      return [Number(m![1]), Number(m![2])] as const;
    };
    const first = Number(/FIRSTGID = (\d+)/.exec(code)![1]);
    const cols = Number(/COLS = (\d+)/.exec(code)![1]);
    expect(first).toBe(num("TILES_WORLD_FIRSTGID"));
    expect(cols).toBe(num("TILES_WORLD_COLUMNS"));
    expect(pair("BLOCK_STONE")).toEqual([11, 7]);
    expect(builder).toMatch(/VARIANT_STONE = \{ col: 11, row: 7 \}/);
    const slots = {
      GID_TREE_TRUNK: pair("SLOT_TRUNK"),
      GID_TREE_CANOPY: pair("SLOT_CANOPY"),
      GID_ROCK: pair("SLOT_ROCK"),
      GID_TALL_GRASS: pair("SLOT_BUSH"),
    };
    for (const [gid, [c, r]] of Object.entries(slots))
      expect(num(gid), `${gid} phải = ${first + r * cols + c}`).toBe(first + r * cols + c);
  });
});

describe.skipIf(!can)("dung-tileset-world.py: dựng thật + tự kiểm", () => {
  let dir = "";
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-tileset-world-"));
  });
  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const run = (out: string) =>
    spawnSync("python3", ["-I", SCRIPT, "--src", SRC, "--out", out], { encoding: "utf8" });

  it("dựng đủ 4 ảnh, mỗi ảnh nhỏ (< 30 KB) và đúng cỡ đùn mép 396 x 504", () => {
    const r = run(dir);
    expect(r.status, r.stderr).toBe(0);
    for (const id of ["lac_ha", "hac_phong", "am_suong", "han_van"]) {
      const f = path.join(dir, `tileset_world_${id}.png`);
      const b = fs.readFileSync(f);
      expect(b.subarray(1, 4).toString()).toBe("PNG");
      expect(b.readUInt32BE(16), `${id} rộng`).toBe(396); // 2 + 22*16 + 21*2
      expect(b.readUInt32BE(20), `${id} cao`).toBe(504); // 2 + 28*16 + 27*2
      expect(b.length, id).toBeLessThan(30_000);
    }
  });

  it("tất định: chạy hai lần ra đúng từng byte", () => {
    const d2 = fs.mkdtempSync(path.join(os.tmpdir(), "tg-tileset-world-2-"));
    try {
      expect(run(d2).status).toBe(0);
      for (const id of ["lac_ha", "hac_phong", "am_suong", "han_van"]) {
        const f = `tileset_world_${id}.png`;
        expect(fs.readFileSync(path.join(d2, f)).equals(fs.readFileSync(path.join(dir, f)))).toBe(
          true,
        );
      }
    } finally {
      fs.rmSync(d2, { recursive: true, force: true });
    }
  });

  it("map-builder KHÔNG CÒN LỆCH ảnh dựng: GID_GRASS, TILES_WORLD_COUNT, bốn GID vật thể và khối đá lát đều khớp 100%", () => {
    const r = run(dir);
    expect(r.status, r.stderr).toBe(0);
    const lines = String(r.stdout)
      .split("\n")
      .filter((l) => l.startsWith("CẦN SỬA ở server/src/systems/map-builder.ts:"));
    expect(lines).toEqual([]);
  });

  it("ảnh xem trước trong repo (05 tileset 4 vùng, 06 bốn bản đồ thật) == bản dựng lại từ mã (đổi mã mà quên dựng lại ảnh thì đỏ)", () => {
    const repo = path.join(here, "../../..", "docs/art/huong-moi");
    const p5 = path.join(dir, "05.png");
    const p6 = path.join(dir, "06.png");
    const r = spawnSync(
      "python3",
      ["-I", SCRIPT, "--src", SRC, "--preview", p5, "--map-preview", p6],
      { encoding: "utf8" },
    );
    expect(r.status, r.stderr).toBe(0);
    for (const [mine, theirs] of [
      [p5, "05-tileset-world-4-vung.png"],
      [p6, "06-ban-do-that-4-vung.png"],
    ] as const)
      expect(
        fs.readFileSync(mine).equals(fs.readFileSync(path.join(repo, theirs))),
        `${theirs} trong repo LỆCH bản dựng lại: chạy lại dung-tileset-world.py --preview ... --map-preview ...`,
      ).toBe(true);
  });

  it("gói gốc thiếu tệp: script lỗi rõ ràng (khác 0), không ghi ảnh dở", () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "tg-tileset-world-empty-"));
    const out = path.join(empty, "out");
    try {
      const r = spawnSync("python3", ["-I", SCRIPT, "--src", empty, "--out", out], {
        encoding: "utf8",
      });
      expect(r.status).not.toBe(0);
      expect(fs.existsSync(out)).toBe(false);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});
