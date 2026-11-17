import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PREFETCH_FALLBACK_MS,
  PREFETCH_IDLE_TIMEOUT_MS,
  createGameLoader,
  schedulePrefetch,
} from "./game-modules";

const here = path.dirname(fileURLToPath(import.meta.url));

class FakeScene {}
const okImporters = () => ({
  phaser: vi.fn(async () => ({ default: { fake: "phaser" } })),
  scene: vi.fn(async () => ({ WorldScene: FakeScene as never })),
});

describe("createGameLoader: tải Phaser + cảnh MỘT lần, thử lại khi lỗi", () => {
  it("hai lần gọi dùng chung một lời hứa; mỗi chunk chỉ import một lần", async () => {
    const imp = okImporters();
    const l = createGameLoader(imp);
    const a = l.load();
    const b = l.load();
    expect(a).toBe(b);
    const m = await a;
    expect(imp.phaser).toHaveBeenCalledTimes(1);
    expect(imp.scene).toHaveBeenCalledTimes(1);
    expect(m.WorldScene).toBe(FakeScene);
    expect(m.Phaser).toEqual({ fake: "phaser" });
    await l.load();
    expect(imp.phaser).toHaveBeenCalledTimes(1);
  });

  it("Phaser trả thẳng không gian tên (không có default) cũng nhận", async () => {
    const ns = { Game: class {} };
    const l = createGameLoader({
      phaser: async () => ns,
      scene: async () => ({ WorldScene: FakeScene as never }),
    });
    expect((await l.load()).Phaser).toBe(ns);
  });

  it("tải lỗi thì lần gọi sau THỬ LẠI (không kẹt trên lỗi cũ)", async () => {
    let fail = true;
    const imp = {
      phaser: vi.fn(async () => {
        if (fail) throw new Error("mất mạng");
        return { default: { fake: 1 } };
      }),
      scene: vi.fn(async () => ({ WorldScene: FakeScene as never })),
    };
    const l = createGameLoader(imp);
    await expect(l.load()).rejects.toThrow("mất mạng");
    await Promise.resolve(); // để nhánh `.catch` dọn lời hứa hỏng chạy
    fail = false;
    const m = await l.load();
    expect(m.WorldScene).toBe(FakeScene);
    expect(imp.phaser).toHaveBeenCalledTimes(2);
  });

  it("prefetch không chờ, nuốt lỗi (không có lời hứa bị từ chối bỏ lửng), rồi vào game tải lại được", async () => {
    let fail = true;
    const imp = {
      phaser: vi.fn(async () => {
        if (fail) throw new Error("mất mạng");
        return { default: {} };
      }),
      scene: vi.fn(async () => ({ WorldScene: FakeScene as never })),
    };
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const l = createGameLoader(imp);
      expect(l.prefetch()).toBeUndefined();
      await new Promise((r) => setTimeout(r, 10));
      expect(unhandled).not.toHaveBeenCalled();
      fail = false;
      await expect(l.load()).resolves.toBeDefined();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});

describe("schedulePrefetch: hẹn tải sẵn lúc rảnh", () => {
  it("có requestIdleCallback thì dùng với hạn chờ; không hẹn setTimeout", () => {
    const ric = vi.fn();
    const st = vi.fn();
    const fn = vi.fn();
    expect(schedulePrefetch(fn, { requestIdleCallback: ric, setTimeout: st })).toBe(true);
    expect(ric).toHaveBeenCalledWith(fn, { timeout: PREFETCH_IDLE_TIMEOUT_MS });
    expect(st).not.toHaveBeenCalled();
  });
  it("không có requestIdleCallback thì hẹn setTimeout", () => {
    const st = vi.fn();
    const fn = vi.fn();
    expect(schedulePrefetch(fn, { setTimeout: st })).toBe(true);
    expect(st).toHaveBeenCalledWith(fn, PREFETCH_FALLBACK_MS);
  });
  it("Tiết kiệm dữ liệu (saveData): không hẹn gì", () => {
    const ric = vi.fn();
    const st = vi.fn();
    expect(
      schedulePrefetch(vi.fn(), { saveData: true, requestIdleCallback: ric, setTimeout: st }),
    ).toBe(false);
    expect(ric).not.toHaveBeenCalled();
    expect(st).not.toHaveBeenCalled();
  });
});

/** Các tệp CHỈ cảnh trò chơi được dùng (import Phaser lúc chạy): nằm ở chunk game, không được lọt vào gói khởi động. */
const GAME_ONLY = [
  "scenes/WorldScene.ts",
  "textures.ts",
  "gfx/fx/fx.ts",
  "gfx/fx/atlas.ts",
] as const;

/** Một dòng `import` / `export ... from` không phải chỉ-kiểu: trả đường dẫn nếu là tương đối. Tách khỏi chú thích khối để không bắt nhầm chữ trong chú thích. */
function runtimeImports(src: string): string[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const out: string[] = [];
  const re = /(?:^|\n)\s*(import|export)\s+([^;]*?)\s*from\s*["']([^"']+)["']/g;
  for (let m = re.exec(code); m; m = re.exec(code)) {
    const clause = m[2]!.trim();
    if (/^type\s/.test(clause)) continue; // `import type { X }` / `export type { X }`
    const braced = /^\{([\s\S]*)\}$/.exec(clause);
    if (
      braced &&
      braced[1]!
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .every((s) => /^type\s/.test(s))
    )
      continue; // `import { type A, type B }`: không còn gì lúc chạy
    out.push(m[3]!);
  }
  // `import "./x"` (chỉ tác dụng phụ)
  for (const m of code.matchAll(/(?:^|\n)\s*import\s*["']([^"']+)["']/g)) out.push(m[1]!);
  return out;
}

function resolveRel(from: string, spec: string): string | null {
  const base = path.resolve(path.dirname(from), spec);
  for (const c of [base + ".ts", base + ".tsx", path.join(base, "index.ts"), base])
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
}

/** Mọi tệp `.ts` với import TĨNH (lúc chạy) đi tới được từ `entry`; cũng trả về các gói ngoài (không tương đối) gặp phải. */
function staticClosure(entry: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop()!;
    if (files.has(f)) continue;
    files.add(f);
    for (const spec of runtimeImports(fs.readFileSync(f, "utf8"))) {
      if (spec.startsWith(".")) {
        const r = resolveRel(f, spec);
        if (r && r.endsWith(".ts")) stack.push(r);
      } else {
        packages.add(spec);
      }
    }
  }
  return { files, packages };
}

describe("gói khởi động KHÔNG kéo Phaser / WorldScene về (#1097)", () => {
  const main = path.join(here, "main.ts");
  const { files, packages } = staticClosure(main);
  const rel = (f: string) => path.relative(here, f).split(path.sep).join("/");

  it("`main.ts` không import tĩnh `phaser`; gói `phaser` không nằm trong bao đóng import tĩnh", () => {
    expect([...packages]).not.toContain("phaser");
  });

  it("bao đóng import tĩnh từ `main.ts` không chứa tệp chỉ-cảnh (WorldScene, textures, gfx/fx/fx, gfx/fx/atlas)", () => {
    const reached = new Set([...files].map(rel));
    for (const g of GAME_ONLY) expect(reached.has(g), `${g} bị kéo vào gói khởi động`).toBe(false);
  });

  it("bao đóng đủ lớn (bộ quét có hoạt động, không trả rỗng): chứa ui.ts và game-modules.ts", () => {
    const reached = new Set([...files].map(rel));
    expect(reached.size).toBeGreaterThan(40);
    expect(reached.has("ui.ts")).toBe(true);
    expect(reached.has("game-modules.ts")).toBe(true);
  });

  it("bộ quét BẮT được import tĩnh thật (đồ thật: WorldScene.ts có import phaser)", () => {
    const { packages: pk } = staticClosure(path.join(here, "scenes/WorldScene.ts"));
    expect([...pk]).toContain("phaser");
  });

  it("`main.ts` dùng bộ tải: gọi loadGameModules trong start() và hẹn tải sẵn sau màn đăng nhập; chỉ `import type` WorldScene", () => {
    const src = fs.readFileSync(main, "utf8");
    expect(src).toMatch(/import type \{ WorldScene \} from "\.\/scenes\/WorldScene"/);
    expect(src).toContain("loadGameModules()");
    expect(src).toMatch(/\}\);\s*\n\s*\/\/[^\n]*\n\s*prefetchGameModulesWhenIdle\(\);/);
    expect(src).toContain("room.leave?.()");
  });
});
