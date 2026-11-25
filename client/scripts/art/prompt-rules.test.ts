// Luật prompt ảnh AI + trang phong cách minh hoạ (docs/art/PHONG_CACH_MINH_HOA.md, KE_HOACH_DO_HOA_AI.md mục 9.1 Bước 0).
// Giữ ba thứ KHỚP NHAU: mã (`prompt-rules.mjs`), tài liệu, và nguồn thật của bảng màu (`style.css`, `MAP_STYLES`).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MONSTER_BY_ID, NPC_BY_ID } from "@tien-gioi/shared";
import { MAP_STYLES } from "../../src/gfx/map-style";
import { parsePackDir } from "../build-packs.mjs";
import { CJK_REGEX, validateAiSource } from "../check-credits.mjs";
import {
  BANNED_PROMPT_TERMS,
  BOSS_CARD_BATCH,
  NPC_FACE_CLAUSE,
  NPC_PORTRAIT_BATCH,
  MAP_CARD_BATCH,
  NEGATIVE_PROMPT,
  REQUIRED_NEGATIVE_TERMS,
  STYLE_PALETTE,
  promptViolations,
} from "./prompt-rules.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, "../../..");
const DOC = fs.readFileSync(path.join(REPO, "docs/art/PHONG_CACH_MINH_HOA.md"), "utf8");
const CSS = fs.readFileSync(path.join(REPO, "client/src/style.css"), "utf8");

const GOOD =
  "misty mountain pass at dawn, painterly ink wash landscape, muted palette, no people, no text";
const ok = (p: string, n = NEGATIVE_PROMPT) => promptViolations(p, n);
const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

describe("promptViolations: luật từ khoá cấm / bắt buộc", () => {
  it("prompt chuẩn hợp lệ; prompt thật của ảnh đầu tiên (login_bg) cũng hợp lệ", () => {
    expect(ok(GOOD)).toEqual([]);
    const j = JSON.parse(
      fs.readFileSync(path.join(REPO, "docs/art/nguon/login_bg.json"), "utf8"),
    ) as { prompt: string; negativePrompt: string };
    expect(promptViolations(j.prompt, j.negativePrompt)).toEqual([]);
  });

  it("MỌI từ cấm bị bắt khi đứng riêng trong một mệnh đề (đối chứng: không từ nào bị bỏ sót vì lỗi so khớp)", () => {
    let n = 0;
    for (const [group, terms] of Object.entries(BANNED_PROMPT_TERMS)) {
      for (const t of terms) {
        const v = ok(`${GOOD}, a lake with ${t} nearby`);
        expect(v.join(" | "), `${group}: ${t}`).toContain(`từ cấm "${t}"`);
        // Hoa thường / hoa: không phân biệt
        expect(ok(`${GOOD}, ${t.toUpperCase()}`).join(" | "), `HOA ${t}`).toContain(
          `từ cấm "${t}"`,
        );
        n++;
      }
    }
    expect(n).toBeGreaterThan(50);
  });

  it("so khớp theo TỪ NGUYÊN VẸN: 'context', 'gamer', 'sealed', 'runestone'... không bị coi là từ cấm", () => {
    expect(ok(`${GOOD}, a contextual haze`)).toEqual([]); // chứa "text"
    expect(ok(`${GOOD}, sealed gate`)).toEqual([]); // "seal"
    expect(ok(`${GOOD}, gamerless valley`)).toEqual([]); // "game"
    expect(ok(`${GOOD}, mushroom glow`)).toEqual([]);
  });

  it("mệnh đề phủ định (no / without / avoid) KHÔNG bị quét; từ cấm ở mệnh đề dương thì bị bắt", () => {
    expect(ok(`${GOOD}, no letters, without calligraphy, avoid anime`)).toEqual([]);
    expect(ok(`${GOOD}, letters on a banner`).join()).toContain('"letters"');
    // Chữ "no" ở GIỮA mệnh đề không che từ cấm: chỉ mệnh đề BẮT ĐẦU bằng no / without / avoid mới là phủ định
    expect(ok(`${GOOD}, a gate with no gap and text`).join()).toContain('"text"');
  });

  it("bắt buộc: thiếu 'no text' / thiếu neo phong cách / prompt trống / không phải chuỗi => lỗi", () => {
    expect(ok("misty mountain pass at dawn, painterly landscape, no people").join()).toContain(
      '"no text"',
    );
    expect(ok("misty mountain pass at dawn, no people, no text").join()).toContain(
      "neo phong cách",
    );
    expect(promptViolations("", NEGATIVE_PROMPT)).toEqual(["prompt trống"]);
    expect(promptViolations(undefined, NEGATIVE_PROMPT)).toEqual(["prompt trống"]);
    expect(promptViolations(42, NEGATIVE_PROMPT)).toEqual(["prompt trống"]);
  });

  it("prompt âm phải đủ từng từ bắt buộc; thiếu một từ là lỗi đúng từ đó", () => {
    for (const t of REQUIRED_NEGATIVE_TERMS) {
      const neg = NEGATIVE_PROMPT.split(", ")
        .filter((x) => x !== t)
        .join(", ");
      expect(promptViolations(GOOD, neg).join(" | "), t).toContain(`negativePrompt thiếu "${t}"`);
    }
    expect(promptViolations(GOOD, undefined).length).toBe(REQUIRED_NEGATIVE_TERMS.length);
    expect(promptViolations(GOOD, "").length).toBe(REQUIRED_NEGATIVE_TERMS.length);
  });

  it("validateAiSource (nguồn của `check:credits`) dùng luật này: prompt vi phạm làm tệp nguồn đỏ", () => {
    const base = (over: Record<string, unknown>) =>
      validateAiSource({
        asset: "client/public/assets/ai/x.webp",
        finalSha256: "a".repeat(64),
        rawSha256: "b".repeat(64),
        model: {
          name: "sd_xl_base_1.0.safetensors",
          sha256: "31e35c80fc4829d14f90153f4c74cd59c90b779f6afe05a74cd6120b893f7e5b",
        },
        lora: [],
        comfyui: { comfyui: "0.43.2" },
        workflow: { path: "w.json", sha256: "c".repeat(64) },
        prompt: GOOD,
        negativePrompt: NEGATIVE_PROMPT,
        seed: 1,
        postProcess: [{ script: "client/scripts/art/hau-ky-webp.py" }],
        reviewed: { by: "b", date: "2026-11-17", noText: true, noOtherGameLikeness: true },
        date: "2026-11-17",
        ...over,
      });
    expect(base({})).toEqual([]);
    expect(base({ prompt: `${GOOD}, xianxia temple` }).join()).toContain('từ cấm "xianxia"');
    expect(base({ negativePrompt: "blurry" }).join()).toContain("negativePrompt thiếu");
  });
});

describe("luật được GHIM bằng chữ (xoá nhầm một từ khỏi danh sách thì đỏ)", () => {
  it("từ bắt buộc ở prompt âm và các từ cấm chủ chốt", () => {
    expect([...REQUIRED_NEGATIVE_TERMS]).toEqual([
      "text",
      "letters",
      "watermark",
      "signature",
      "logo",
      "cjk",
      "chinese characters",
    ]);
    const all = Object.values(BANNED_PROMPT_TERMS).flat() as string[];
    for (const t of [
      "genshin",
      "tolkien",
      "skyrim",
      "witcher",
      "zelda",
      "game of thrones",
      "warcraft",
      "greg rutkowski",
      "in the style of",
      "text",
      "calligraphy",
      "hanzi",
      "chinese",
      "xianxia",
      "wuxia",
      "anime",
      "game",
      "photorealistic",
      "portrait of",
    ])
      expect(all, t).toContain(t);
    expect(Object.keys(BANNED_PROMPT_TERMS)).toHaveLength(5);
  });
});

describe("bảng màu khớp nguồn thật (style.css + MAP_STYLES)", () => {
  it("11 màu, không trùng id / màu; mỗi màu bằng ĐÚNG giá trị ở nguồn của nó", () => {
    expect(STYLE_PALETTE).toHaveLength(11);
    expect(new Set(STYLE_PALETTE.map((c) => c.id)).size).toBe(11);
    expect(new Set(STYLE_PALETTE.map((c) => c.hex)).size).toBe(11);
    for (const c of STYLE_PALETTE) {
      expect(c.hex, c.id).toMatch(/^#[0-9a-f]{6}$/);
      if ("css" in c.from) {
        const m = new RegExp(`${c.from.css}:\\s*(#[0-9a-fA-F]{6})\\b`).exec(CSS);
        expect(m, `${c.id}: không thấy ${c.from.css} trong style.css`).not.toBeNull();
        expect(m![1].toLowerCase(), c.id).toBe(c.hex);
      } else {
        const s = MAP_STYLES[c.from.map];
        expect(s, `${c.id}: bản đồ ${c.from.map} không có kiểu`).toBeDefined();
        expect(hex(s.ambient.color), c.id).toBe(c.hex);
      }
    }
  });

  it("mỗi bản đồ có kiểu riêng trong MAP_STYLES đều có màu trong bảng (thêm bản đồ mới thì phải thêm màu)", () => {
    const mapIds = new Set(STYLE_PALETTE.flatMap((c) => ("map" in c.from ? [c.from.map] : [])));
    for (const id of Object.keys(MAP_STYLES)) expect(mapIds.has(id), id).toBe(true);
  });
});

describe("lô 1 (thẻ bản đồ) và tài liệu khớp mã", () => {
  it("mỗi thẻ: bản đồ có thật, ba hạt giống riêng, prompt hợp lệ; ngân sách <= trần gói tải", () => {
    const budget = JSON.parse(
      fs.readFileSync(path.join(REPO, "client/perf-budget.json"), "utf8"),
    ) as { static: { aiAssets: { maxFileKb: number; totalKb: number } } };
    const { items, final, raw } = MAP_CARD_BATCH;
    const seeds = items.flatMap((i: { seeds: number[] }) => i.seeds);
    expect(items).toHaveLength(5);
    expect(new Set(seeds).size).toBe(15);
    expect(new Set(items.map((i: { id: string }) => i.id)).size).toBe(5);
    for (const it of items as Array<{ id: string; mapId: string; prompt: string }>) {
      expect(MAP_STYLES[it.mapId], it.id).toBeDefined();
      expect(promptViolations(it.prompt, NEGATIVE_PROMPT), it.id).toEqual([]);
    }
    // Cỡ thô là cỡ SDXL (bội số của 64), ảnh cuối đúng 3:2 và nhỏ hơn thô
    // Thô ~3:2 (1216x832 là cỡ gốc gần nhất của SDXL, tỉ lệ 1,46): B cắt nhẹ rồi đổi cỡ về ĐÚNG 3:2
    expect(Math.abs(raw.w / raw.h - 1.5)).toBeLessThan(0.05);
    expect(final.w * 2).toBe(final.h * 3);
    expect(raw.w % 64).toBe(0);
    expect(raw.h % 64).toBe(0);
    expect(final.w).toBeLessThan(raw.w);
    // login_bg thật + 5 thẻ ở trần của chúng <= tổng; mỗi thẻ <= trần mỗi ảnh
    const loginKb =
      fs.statSync(path.join(REPO, "client/public/assets/ai/login_bg.webp")).size / 1024;
    expect(final.maxKb).toBeLessThanOrEqual(budget.static.aiAssets.maxFileKb);
    expect(loginKb + items.length * final.maxKb).toBeLessThanOrEqual(
      budget.static.aiAssets.totalKb,
    );
  });

  it("tài liệu liệt kê ĐỦ: mọi màu, mọi từ cấm, mọi từ bắt buộc, prompt âm, prompt + hạt giống của từng thẻ", () => {
    for (const c of STYLE_PALETTE) expect(DOC, `màu ${c.id}`).toContain(`\`${c.hex}\``);
    for (const terms of Object.values(BANNED_PROMPT_TERMS))
      for (const t of terms as string[]) expect(DOC, `từ cấm ${t}`).toContain(`\`${t}\``);
    for (const t of REQUIRED_NEGATIVE_TERMS) expect(DOC, `bắt buộc ${t}`).toContain(`\`${t}\``);
    expect(DOC).toContain(NEGATIVE_PROMPT);
    for (const it of MAP_CARD_BATCH.items as Array<{
      id: string;
      prompt: string;
      seeds: number[];
    }>) {
      expect(DOC, `prompt ${it.id}`).toContain(it.prompt);
      for (const s of it.seeds) expect(DOC, `seed ${s}`).toContain(`\`${s}\``);
      expect(DOC, `mục ${it.id}`).toContain(`### \`${it.id}\``);
    }
    expect(DOC).toContain(`${MAP_CARD_BATCH.raw.w}x${MAP_CARD_BATCH.raw.h}`);
    expect(DOC).toContain(`${MAP_CARD_BATCH.final.w}x${MAP_CARD_BATCH.final.h}`);
  });

  it("tài liệu không chứa chữ Hán", () => {
    expect(CJK_REGEX.test(DOC)).toBe(false);
  });
});

describe("lô 2 (thẻ trùm) khớp trò chơi, luật prompt, ngân sách gói art và tài liệu", () => {
  const { items, raw, final } = BOSS_CARD_BATCH;
  const budget = JSON.parse(
    fs.readFileSync(path.join(REPO, "client/perf-budget.json"), "utf8"),
  ) as {
    packs: { art: { maxKb: number; maxFileKb: number } };
  };

  it("bốn trùm THẬT của shared (có boss: true), mỗi trùm một thẻ, bốn hạt giống không trùng với bất kỳ ảnh nào của hai lô", () => {
    expect(items.map((i: { bossId: string }) => i.bossId).sort()).toEqual(
      ["hac_giao", "mang", "thien_han_vuong", "yeu_vuong"].sort(),
    );
    for (const it of items as Array<{
      id: string;
      bossId: string;
      seeds: number[];
      prompt: string;
    }>) {
      const boss = MONSTER_BY_ID[it.bossId];
      expect(boss, `${it.id}: trùm ${it.bossId} không có trong shared`).toBeDefined();
      expect(boss!.boss, `${it.bossId} phải là trùm`).toBe(true);
      expect(it.seeds).toHaveLength(4);
      expect(promptViolations(it.prompt, NEGATIVE_PROMPT), it.id).toEqual([]);
      expect(it.id, "tên tệp = tên JSON nguồn").toMatch(/^the_[a-z_]+$/);
    }
    const all = [
      ...MAP_CARD_BATCH.items.flatMap((i: { seeds: number[] }) => i.seeds),
      ...items.flatMap((i: { seeds: number[] }) => i.seeds),
    ];
    expect(new Set(all).size).toBe(all.length);
    const ids = [...MAP_CARD_BATCH.items, ...items].map((i: { id: string }) => i.id);
    expect(new Set(ids).size).toBe(ids.length); // tên tệp không trùng giữa lô 1 và lô 2
  });

  it("thẻ vuông, cỡ thô SDXL (bội số của 64), nằm trong gói `art:trum` đúng thư mục và trong ngân sách `packs.art`", () => {
    expect(raw.w).toBe(raw.h);
    expect(final.w).toBe(final.h);
    expect(raw.w % 64).toBe(0);
    expect(final.w).toBeLessThan(raw.w);
    expect(BOSS_CARD_BATCH.pack).toBe("art:trum");
    expect(parsePackDir(path.basename(BOSS_CARD_BATCH.dir))).toEqual({
      id: "art:trum",
      kind: "art",
    });
    expect(final.maxKb).toBeLessThanOrEqual(budget.packs.art.maxFileKb);
    expect(items.length * final.maxKb).toBeLessThanOrEqual(budget.packs.art.maxKb);
  });

  it("trùm KHÔNG mặt người / người: mọi prompt có 'no people' và không có từ chỉ người", () => {
    for (const it of items as Array<{ id: string; prompt: string }>) {
      expect(it.prompt, it.id).toContain("no people");
      expect(
        /\b(man|woman|person|human|king|queen|warrior|girl|boy)\b/i.test(it.prompt),
        it.id,
      ).toBe(false);
    }
  });

  it("tài liệu (mục 5b) liệt kê ĐỦ prompt, hạt giống, cỡ và gói của lô 2", () => {
    for (const it of items as Array<{
      id: string;
      bossId: string;
      seeds: number[];
      prompt: string;
    }>) {
      expect(DOC, `prompt ${it.id}`).toContain(it.prompt);
      expect(DOC, `mục ${it.id}`).toContain(`### \`${it.id}\` (trùm \`${it.bossId}\``);
      for (const s of it.seeds) expect(DOC, `seed ${s}`).toContain(`\`${s}\``);
    }
    expect(DOC).toContain(`${raw.w}x${raw.h}`);
    expect(DOC).toContain(`${final.w}x${final.h}`);
    expect(DOC).toContain("## 5b. LÔ 2");
    expect(DOC).toContain(BOSS_CARD_BATCH.dir);
  });
});

describe("lô 3 (chân dung NPC) khớp trò chơi, luật prompt, ngân sách gói art và tài liệu", () => {
  const { items, raw, final } = NPC_PORTRAIT_BATCH;
  type Item = { id: string; npcId: string; seeds: number[]; prompt: string };
  const list = items as Item[];
  const budget = JSON.parse(
    fs.readFileSync(path.join(REPO, "client/perf-budget.json"), "utf8"),
  ) as {
    packs: { art: { maxKb: number; maxFileKb: number } };
  };

  it("mười hai NPC THẬT của shared (không có cao_thi: bảng cáo thị), mỗi NPC một chân dung, ba hạt giống không trùng với bất kỳ ảnh nào của ba lô", () => {
    expect(list.map((i) => i.npcId).sort()).toEqual(
      [
        "duoc_su",
        "lai_buon",
        "lai_buon_han",
        "lai_buon_suong",
        "lao_dan",
        "thu_mon",
        "tho_ren",
        "tho_ren_han",
        "tho_ren_suong",
        "tram_truong",
        "tram_truong_han",
        "truong_tran",
      ].sort(),
    );
    for (const it of list) {
      expect(NPC_BY_ID[it.npcId], `${it.id}: NPC ${it.npcId} không có trong shared`).toBeDefined();
      expect(it.id, "tên tệp = tên JSON nguồn").toMatch(/^npc_[a-z_]+$/);
      expect(it.id).toBe(`npc_${it.npcId}`);
      expect(it.seeds).toHaveLength(3);
      expect(promptViolations(it.prompt, NEGATIVE_PROMPT), it.id).toEqual([]);
    }
    const all = [
      ...MAP_CARD_BATCH.items.flatMap((i: { seeds: number[] }) => i.seeds),
      ...BOSS_CARD_BATCH.items.flatMap((i: { seeds: number[] }) => i.seeds),
      ...list.flatMap((i) => i.seeds),
    ];
    expect(new Set(all).size).toBe(all.length);
    const ids = [...MAP_CARD_BATCH.items, ...BOSS_CARD_BATCH.items, ...list].map(
      (i: { id: string }) => i.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("thẻ vuông, cỡ thô bội 64, nằm trong gói `art:npc` đúng thư mục và trong ngân sách `packs.art`", () => {
    expect(raw.w).toBe(raw.h);
    expect(final.w).toBe(final.h);
    expect(raw.w % 64).toBe(0);
    expect(final.w).toBeLessThan(raw.w);
    expect(NPC_PORTRAIT_BATCH.pack).toBe("art:npc");
    expect(parsePackDir(path.basename(NPC_PORTRAIT_BATCH.dir))).toEqual({
      id: "art:npc",
      kind: "art",
    });
    expect(final.maxKb).toBeLessThanOrEqual(budget.packs.art.maxFileKb);
    expect(list.length * final.maxKb).toBeLessThanOrEqual(budget.packs.art.maxKb);
  });

  it("NPC là NGƯỜI nên mặt PHẢI khuất bóng: mọi prompt có mệnh đề mặt-khuất-bóng, không 'no people', không từ tả nét mặt", () => {
    expect(NPC_FACE_CLAUSE).toBe("face hidden in shadow");
    for (const it of list) {
      expect(it.prompt.split(", "), it.id).toContain(NPC_FACE_CLAUSE);
      expect(it.prompt, it.id).not.toContain("no people");
      expect(
        /\b(smiling|smile|eyes|eyebrows|beautiful|handsome|pretty|young woman|young man|girl|boy|king|queen|celebrity)\b/i.test(
          it.prompt,
        ),
        it.id,
      ).toBe(false);
    }
  });

  it("tài liệu (mục 5c) liệt kê ĐỦ prompt, hạt giống, cỡ và gói của lô 3", () => {
    for (const it of list) {
      expect(DOC, `prompt ${it.id}`).toContain(it.prompt);
      expect(DOC, `mục ${it.id}`).toContain(`### \`${it.id}\` (NPC \`${it.npcId}\``);
      for (const s of it.seeds) expect(DOC, `seed ${s}`).toContain(`\`${s}\``);
    }
    expect(DOC).toContain("## 5c. LÔ 3");
    expect(DOC).toContain(NPC_PORTRAIT_BATCH.dir);
    expect(DOC).toContain(`${final.w}x${final.h}`);
  });
});
