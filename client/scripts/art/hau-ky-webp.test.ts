// Hậu kỳ ảnh AI (`hau-ky-webp.py`, docs/KE_HOACH_DO_HOA_AI.md mục 9.2): tất định, WebP sạch, không vượt trần, từ chối đầu vào sai. Dùng Pillow qua `python3 -I`; máy không có Pillow thì bỏ qua.
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditImageMetadata } from "../check-credits.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(here, "hau-ky-webp.py");
const hasPillow =
  spawnSync("python3", ["-I", "-c", "import PIL"], { encoding: "utf8" }).status === 0;
const sha = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");

let dir = "";
let raw = "";

/** PNG thô giả của ComfyUI: có khối văn bản `prompt` / `workflow` (thứ KHÔNG được lọt vào ảnh cuối), 96x64, có kênh alpha. */
function makeRaw(file: string) {
  const py = `
import sys
from PIL import Image, PngImagePlugin
w, h = 96, 64
im = Image.new("RGBA", (w, h))
px = im.load()
for y in range(h):
    for x in range(w):
        px[x, y] = ((x * 5) % 256, (y * 7) % 256, ((x + y) * 3) % 256, 255)
info = PngImagePlugin.PngInfo()
info.add_text("prompt", '{"secret": "prompt của ComfyUI"}')
info.add_text("workflow", '{"nodes": []}')
im.save(sys.argv[1], "PNG", pnginfo=info)
`;
  const r = spawnSync("python3", ["-I", "-c", py, file], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
}

function run(args: string[]) {
  return spawnSync("python3", ["-I", SCRIPT, ...args], { encoding: "utf8" });
}

describe.skipIf(!hasPillow)("hau-ky-webp.py", () => {
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-hau-ky-"));
    raw = path.join(dir, "raw.png");
    makeRaw(raw);
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("ảnh thô giả quả có khối văn bản (điều kiện của bài kiểm: nếu không có thì các ca dưới vô nghĩa)", () => {
    expect(fs.readFileSync(raw).includes(Buffer.from("tEXt"))).toBe(true);
    expect(auditImageMetadata(fs.readFileSync(raw), ".png").forbidden).toContain("tEXt");
  });

  it("WebP cuối SẠCH: không EXIF / XMP / ICC / văn bản; qua đúng bộ kiểm siêu dữ liệu của check-credits", () => {
    const out = path.join(dir, "a.webp");
    const r = run(["--raw", raw, "--out", out]);
    expect(r.status, r.stderr).toBe(0);
    const bytes = fs.readFileSync(out);
    const meta = auditImageMetadata(bytes, ".webp");
    expect(meta.error).toBeNull();
    expect(meta.forbidden).toEqual([]);
    expect(bytes.includes(Buffer.from("prompt"))).toBe(false);
    expect(bytes.includes(Buffer.from("workflow"))).toBe(false);
    for (const tag of ["EXIF", "XMP ", "ICCP"])
      expect(bytes.includes(Buffer.from(tag))).toBe(false);
    const j = JSON.parse(r.stdout);
    expect(j.finalSha256).toBe(sha(bytes));
    expect(j.rawSha256).toBe(sha(fs.readFileSync(raw)));
    expect(j.bytes).toBe(bytes.length);
    expect(j.chunks).toEqual(["VP8 "]); // RGB, không alpha
    expect([j.width, j.height]).toEqual([96, 64]);
  });

  it("TẤT ĐỊNH: chạy hai lần cùng tham số cho CÙNG băm; đổi chất lượng thì đổi", () => {
    const a = JSON.parse(run(["--raw", raw, "--out", path.join(dir, "b1.webp")]).stdout);
    const b = JSON.parse(run(["--raw", raw, "--out", path.join(dir, "b2.webp")]).stdout);
    expect(a.finalSha256).toBe(b.finalSha256);
    const c = JSON.parse(
      run(["--raw", raw, "--out", path.join(dir, "b3.webp"), "--quality", "40"]).stdout,
    );
    expect(c.finalSha256).not.toBe(a.finalSha256);
    expect(c.bytes).toBeLessThan(a.bytes);
  });

  it("--crop rồi --size: cỡ cuối đúng và tham số được in lại để ghi vào tệp nguồn", () => {
    const r = run([
      "--raw",
      raw,
      "--out",
      path.join(dir, "c.webp"),
      "--crop",
      "8,4,64,32",
      "--size",
      "32x16",
    ]);
    expect(r.status, r.stderr).toBe(0);
    const j = JSON.parse(r.stdout);
    expect([j.width, j.height]).toEqual([32, 16]);
    expect(j.params).toMatchObject({
      crop: [8, 4, 64, 32],
      size: [32, 16],
      quality: 86,
      method: 6,
    });
  });

  it("vượt trần --max-kb: thoát mã 1 và KHÔNG ghi tệp", () => {
    const out = path.join(dir, "d.webp");
    const r = run(["--raw", raw, "--out", out, "--max-kb", "0.1"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/vượt trần/);
    expect(fs.existsSync(out)).toBe(false);
  });

  it("--crop vượt ảnh thô hoặc sai định dạng: từ chối, không ghi tệp", () => {
    const out = path.join(dir, "e.webp");
    expect(run(["--raw", raw, "--out", out, "--crop", "0,0,500,500"]).status).not.toBe(0);
    expect(run(["--raw", raw, "--out", out, "--crop", "1,2,3"]).status).not.toBe(0);
    expect(run(["--raw", raw, "--out", out, "--size", "abc"]).status).not.toBe(0);
    expect(fs.existsSync(out)).toBe(false);
  });
});
