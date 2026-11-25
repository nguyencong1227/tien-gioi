/**
 * Luật cho PROMPT sinh ảnh AI (ComfyUI + SDXL base; `docs/art/PHONG_CACH_MINH_HOA.md`, `docs/KE_HOACH_DO_HOA_AI.md` mục 9.1 "Bước 0").
 *
 * Một nguồn duy nhất cho: bảng màu của "phong cách minh hoạ", danh sách từ khoá CẤM / BẮT BUỘC và lô ảnh đầu tiên (thẻ bản đồ).
 * `check-credits.mjs` (`validateAiSource`) gọi `promptViolations` cho MỌI `docs/art/nguon/*.json`, nên prompt vi phạm không vào được game;
 * `prompt-rules.test.ts` giữ bảng màu khớp `MAP_STYLES` / `style.css` thật và giữ tài liệu khớp mã (đổi một bên thì test đỏ).
 *
 * Mọi chuỗi ở đây là tiếng Anh vì SDXL đọc tiếng Anh; chú thích tiếng Việt.
 */

/**
 * Bảng màu 12 màu của phong cách minh hoạ: 5 màu của giao diện (`client/src/style.css`) + 7 màu môi trường của bảy bản đồ
 * (`MAP_STYLES[mapId].ambient.color`). `from` nói màu lấy ở đâu để test đối chiếu với nguồn thật (tránh bảng màu trôi khỏi mã).
 * @type {ReadonlyArray<{ id: string, hex: string, role: string, from: { css: string } | { map: string } }>}
 */
export const STYLE_PALETTE = [
  { id: "ink", hex: "#1d1a16", role: "nền tối, bóng đổ, nét mực", from: { css: "--ink" } },
  { id: "paper", hex: "#f3ecda", role: "vùng sáng, giấy, mây sương", from: { css: "--paper" } },
  { id: "gold", hex: "#c9a24a", role: "điểm nhấn ấm, ánh linh khí", from: { css: "--gold" } },
  { id: "red", hex: "#a31d1d", role: "điểm nhấn nguy hiểm, rất ít", from: { css: "--red" } },
  { id: "mp", hex: "#3f7fa6", role: "điểm nhấn lạnh, linh lực", from: { css: "--mp" } },
  { id: "lac_ha", hex: "#ffe2b0", role: "Lạc Hà: ấm, hoa đào", from: { map: "lac_ha" } },
  { id: "hac_phong", hex: "#8c93a6", role: "Hắc Phong: xám lam, tro", from: { map: "hac_phong" } },
  {
    id: "bi_canh_linh_hu",
    hex: "#7fe3d4",
    role: "Linh Hư: lam ngọc",
    from: { map: "bi_canh_linh_hu" },
  },
  { id: "am_suong", hex: "#7c9a76", role: "Âm Sương: xanh rêu, sương", from: { map: "am_suong" } },
  { id: "han_van", hex: "#bcd6f2", role: "Hàn Vân: băng, tuyết", from: { map: "han_van" } },
  {
    id: "lang_hoang",
    hex: "#d8c9a0",
    role: "Lang Hoang: vàng rơm, thảo nguyên khô",
    from: { map: "lang_hoang" },
  },
  { id: "uy_van", hex: "#a8444a", role: "Uy Vân: đỏ gạch, huyết trận", from: { map: "uy_van" } },
];

/**
 * Từ khoá CẤM trong prompt DƯƠNG (nhóm -> danh sách; so khớp không phân biệt hoa thường, theo từ nguyên vẹn).
 * Mục đích: không tên game / truyện / nghệ sĩ khác, không gợi chữ (SDXL hay vẽ ký tự giả), không kéo ảnh về ảnh chụp hay người thật.
 * Mệnh đề phủ định ("no text", "without people") được bỏ qua khi quét (xem `promptViolations`).
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const BANNED_PROMPT_TERMS = {
  "tên game / truyện / thương hiệu khác": [
    "genshin",
    "honkai",
    "warcraft",
    "diablo",
    "league of legends",
    "dota",
    "perfect world",
    "jade dynasty",
    "zhu xian",
    "tru tien",
    "van kiep",
    "path of exile",
    "elden ring",
    "dark souls",
    "sekiro",
    "black myth",
    "wukong",
    "final fantasy",
    "pokemon",
    "maplestory",
    "ragnarok",
    "lineage",
    "disney",
    "marvel",
    "ghibli",
    "tolkien",
    "middle earth",
    "lord of the rings",
    "game of thrones",
    "skyrim",
    "witcher",
    "zelda",
  ],
  "nghệ sĩ / phong cách của một người": [
    "greg rutkowski",
    "artgerm",
    "wlop",
    "ruan jia",
    "makoto shinkai",
    "miyazaki",
    "thomas kinkade",
    "craig mullins",
    "in the style of",
    "style of",
    "inspired by",
    "reminiscent of",
    "fan art",
    "fanart",
  ],
  "gợi chữ / ký tự (SDXL vẽ chữ giả)": [
    "text",
    "letters",
    "calligraphy",
    "inscription",
    "signboard",
    "sign board",
    "banner with",
    "scroll with",
    "writing",
    "poem",
    "seal",
    "stamp",
    "hanzi",
    "kanji",
    "glyph",
    "rune",
    "runes",
    "symbols",
  ],
  "thể loại kéo ảnh về kiểu game khác": [
    "chinese",
    "xianxia",
    "wuxia",
    "xuanhuan",
    "anime",
    "manga",
    "chibi",
    "video game",
    "game art",
    "game",
    "screenshot",
    "trending on",
    "artstation",
    "pixiv",
    "deviantart",
    "unreal engine",
    "octane",
  ],
  "ảnh chụp / người thật": [
    "photorealistic",
    "photo realistic",
    "photograph",
    "photo of",
    "real person",
    "celebrity",
    "portrait of",
  ],
};

/**
 * Từ khoá BẮT BUỘC.
 * - Dương: ít nhất MỘT neo phong cách (tranh, không phải ảnh chụp) và đúng một mệnh đề "no text".
 * - Âm: đủ các từ dưới (chặn chữ, chữ ký, logo, ký tự Hán).
 */
export const STYLE_ANCHORS = [
  "painterly",
  "painting",
  "ink wash",
  "gouache",
  "watercolor",
  "watercolour",
  "matte painting",
];
export const REQUIRED_POSITIVE_CLAUSE = "no text";
export const REQUIRED_NEGATIVE_TERMS = [
  "text",
  "letters",
  "watermark",
  "signature",
  "logo",
  "cjk",
  "chinese characters",
];

/** Prompt âm chuẩn của mọi lô (đã gồm các từ bắt buộc). */
export const NEGATIVE_PROMPT =
  "text, letters, words, calligraphy, watermark, signature, logo, cjk, chinese characters, frame, border, blurry, lowres, distorted, modern, futuristic, photorealistic, human face, western fantasy, anime, 3d render";

/** Chuẩn hoá để so khớp: chữ thường, gộp khoảng trắng. */
const norm = (s) => String(s).toLowerCase().replace(/\s+/g, " ").trim();

/** Tách thành mệnh đề (theo dấu phẩy / chấm phẩy / chấm / xuống dòng) đã chuẩn hoá, bỏ mệnh đề rỗng. */
const clauses = (s) =>
  String(s)
    .split(/[,;.\n]/)
    .map(norm)
    .filter(Boolean);

/** Mệnh đề phủ định ("no people", "without text", "avoid ..."): không quét từ cấm bên trong. */
const isNegation = (c) => /^(no|without|avoid)\b/.test(c);

/** Từ `term` có xuất hiện nguyên vẹn (không dính vào chữ cái khác) trong `clause` không. */
function hasTerm(clause, term) {
  let from = 0;
  for (;;) {
    const i = clause.indexOf(term, from);
    if (i < 0) return false;
    const before = i === 0 ? "" : clause[i - 1];
    const after = clause[i + term.length] ?? "";
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
    from = i + 1;
  }
}

/**
 * Kiểm một cặp prompt (dương, âm). Trả danh sách vấn đề tiếng Việt (rỗng = hợp lệ).
 * @param {unknown} prompt
 * @param {unknown} negativePrompt
 * @returns {string[]}
 */
export function promptViolations(prompt, negativePrompt) {
  const bad = [];
  if (typeof prompt !== "string" || prompt.trim() === "") return ["prompt trống"];
  const pos = clauses(prompt).filter((c) => !isNegation(c));
  for (const [group, terms] of Object.entries(BANNED_PROMPT_TERMS)) {
    for (const t of terms) {
      if (pos.some((c) => hasTerm(c, t))) bad.push(`prompt có từ cấm "${t}" (${group})`);
    }
  }
  if (!pos.some((c) => STYLE_ANCHORS.some((a) => hasTerm(c, a))))
    bad.push(`prompt thiếu neo phong cách tranh (một trong: ${STYLE_ANCHORS.join(", ")})`);
  if (!clauses(prompt).includes(REQUIRED_POSITIVE_CLAUSE))
    bad.push(`prompt thiếu mệnh đề "${REQUIRED_POSITIVE_CLAUSE}"`);
  const neg = clauses(typeof negativePrompt === "string" ? negativePrompt : "");
  for (const t of REQUIRED_NEGATIVE_TERMS) {
    if (!neg.some((c) => c === t || hasTerm(c, t))) bad.push(`negativePrompt thiếu "${t}"`);
  }
  return bad;
}

/** Dựng prompt dương chuẩn từ chủ đề + màu / ánh sáng (đủ neo phong cách và "no text"). */
function buildPrompt(subject, mood) {
  return `${subject}, ${mood}, painterly soft ink wash and gouache landscape, muted colors, misty depth, wide panoramic composition, eastern mountain cultivation fantasy, no people, no text`;
}

/**
 * Lô 1: THẺ BẢN ĐỒ (mỗi bản đồ một ảnh minh hoạ, tỉ lệ 3:2). Thô 1216x832 (cỡ gốc gần 3:2 nhất của SDXL, tỉ lệ 1,46: B cắt nhẹ), cuối 624x416 (đúng 3:2) WebP <= 40 KB.
 * Ngân sách: `login_bg.webp` 72 KB + 5 x 40 KB = 272 KB <= trần 300 KB (`client/perf-budget.json` `static.aiAssets.totalKb`).
 * `seeds`: ba hạt giống mỗi bản đồ để B chọn một; tên tệp thô `<id>_raw_<n>_00001_.png`.
 */
export const MAP_CARD_BATCH = {
  class: "the-ban-do",
  aspect: "3:2",
  raw: { w: 1216, h: 832 },
  final: { w: 624, h: 416, maxKb: 40 },
  items: [
    {
      id: "the_lac_ha",
      mapId: "lac_ha",
      seeds: [2026111711, 2026111712, 2026111713],
      prompt: buildPrompt(
        "small mountain town of timber houses below a sacred misty peak, a river winding past peach blossom trees, falling pink petals",
        "warm peach and amber light, soft rose and cream haze",
      ),
    },
    {
      id: "the_hac_phong",
      mapId: "hac_phong",
      seeds: [2026111721, 2026111722, 2026111723],
      prompt: buildPrompt(
        "windswept dark canyon with thorny shrubs and twisted pines, ash drifting in the wind, a ruined stone watchtower far away",
        "slate grey and cold blue shadows, pale grey haze, dim overcast light",
      ),
    },
    {
      id: "the_linh_hu",
      mapId: "bi_canh_linh_hu",
      seeds: [2026111731, 2026111732, 2026111733],
      prompt: buildPrompt(
        "hidden spirit realm cavern with glowing lotus pools and luminous mushrooms, floating motes of light, crystal rock arches",
        "jade teal and cyan glow against deep blue-black shadows",
      ),
    },
    {
      id: "the_am_suong",
      mapId: "am_suong",
      seeds: [2026111741, 2026111742, 2026111743],
      prompt: buildPrompt(
        "foggy swamp of dead trees and still black water, faint wisps of pale lantern light, rotting wooden walkway",
        "moss green and grey-green mist, dim sickly glow, heavy fog",
      ),
    },
    {
      id: "the_han_van",
      mapId: "han_van",
      seeds: [2026111751, 2026111752, 2026111753],
      prompt: buildPrompt(
        "icy highland with drifting snow, frozen lake and sheer ice cliffs under a pale dawn, thin clouds on the ridges",
        "pale ice blue and white haze, cold silver light",
      ),
    },
  ],
};

/** Dựng prompt dương chuẩn cho THẺ TRÙM (một con vật khổng lồ ở giữa khung, thấy trọn thân, không người, không mặt người). */
function buildBossPrompt(subject, mood) {
  return `${subject}, ${mood}, painterly soft ink wash and gouache creature illustration, single creature centered, full body visible, muted colors, misty depth, eastern mountain cultivation fantasy, no people, no text`;
}

/**
 * Lô 2: THẺ TRÙM (mỗi trùm một ảnh vuông, vào gói tải theo nhu cầu `art:trum`, `client/public/packs/art-trum/`; mục 4b của trang).
 * Thô 1024x1024 (cỡ gốc của SDXL), cuối 384x384 WebP <= 30 KB. Bốn hạt giống mỗi trùm (lô 1 cho thấy 4 / 15 ảnh có chữ ký giả ở góc, nên dư
 * một ảnh để còn chọn). Tên tệp thô `<id>_raw_<n>_00001_.png`. Màu và ánh sáng lấy theo bản đồ của trùm (bảng màu mục 2). `bossId` là id
 * trong `MONSTERS` của `shared/` (test bắt id sai); không mặt người: trùm là thú / khối băng để khỏi giống nhân vật của game khác.
 */
export const BOSS_CARD_BATCH = {
  class: "the-trum",
  aspect: "1:1",
  pack: "art:trum",
  dir: "client/public/packs/art-trum",
  raw: { w: 1024, h: 1024 },
  final: { w: 384, h: 384, maxKb: 30 },
  items: [
    {
      id: "the_xich_mang",
      bossId: "mang",
      seeds: [2026111801, 2026111802, 2026111803, 2026111804],
      prompt: buildBossPrompt(
        "colossal crimson python coiled around mossy boulders beneath blossoming peach branches, glossy blood-red scales",
        "warm amber evening light, soft rose and cream haze",
      ),
    },
    {
      id: "the_hac_giao",
      bossId: "hac_giao",
      seeds: [2026111811, 2026111812, 2026111813, 2026111814],
      prompt: buildBossPrompt(
        "enormous black river dragon-serpent rising from dark swamp water, wet obsidian scales with a pale green sheen, dead trees around it",
        "moss green and grey-green mist, faint wisps of pale lantern light, heavy fog",
      ),
    },
    {
      id: "the_thien_han_vuong",
      bossId: "thien_han_vuong",
      seeds: [2026111821, 2026111822, 2026111823, 2026111824],
      prompt: buildBossPrompt(
        "towering colossus of living glacier ice standing on a frozen lake, armor-like plates of blue ice, a jagged crown of icicles, no face",
        "pale ice blue and white haze, cold silver light",
      ),
    },
    {
      id: "the_yeu_vuong",
      bossId: "yeu_vuong",
      seeds: [2026111831, 2026111832, 2026111833, 2026111834],
      prompt: buildBossPrompt(
        "ancient spirit beast lord with huge branching luminous antlers and long fur drifting like mist, standing in a crystal cavern with glowing mushrooms",
        "jade teal and cyan glow with deep violet accents against blue-black shadows",
      ),
    },
  ],
};

/** Mệnh đề BẮT BUỘC trong prompt chân dung NPC: mặt khuất bóng (nón / mũ trùm / sương), KHÔNG vẽ nét mặt người (khỏi giống nhân vật game khác). */
export const NPC_FACE_CLAUSE = "face hidden in shadow";

/** Dựng prompt dương chuẩn cho CHÂN DUNG NPC (một dáng người nửa thân ở giữa khung, nhìn nghiêng / từ sau, mặt khuất bóng). */
function buildNpcPrompt(subject, mood) {
  return `${subject}, ${NPC_FACE_CLAUSE}, ${mood}, painterly soft ink wash and gouache half-length figure study, single figure centered, muted colors, misty depth, eastern mountain cultivation fantasy, no text`;
}

/**
 * Lô 3: CHÂN DUNG NPC (mười hai NPC có hội thoại, trừ `cao_thi` là bảng cáo thị; vào gói tải theo nhu cầu `art:npc`, `client/public/packs/art-npc/`).
 * Thô 1024x1024, cuối 256x256 WebP <= 20 KB. Ba hạt giống mỗi NPC; tên tệp thô `<id>_raw_<n>_00001_.png`. NPC là NGƯỜI nên: dáng nhìn nghiêng /
 * từ sau, mặt khuất bóng nón / mũ trùm (`NPC_FACE_CLAUSE`, test bắt thiếu), không người nổi tiếng, không trang phục đặc trưng của nhân vật game khác;
 * màu theo bản đồ của NPC (bảng màu mục 2). `npcId` là id trong `NPCS` của `shared/` (test bắt id sai).
 */
export const NPC_PORTRAIT_BATCH = {
  class: "chan-dung-npc",
  aspect: "1:1",
  pack: "art:npc",
  dir: "client/public/packs/art-npc",
  raw: { w: 1024, h: 1024 },
  final: { w: 256, h: 256, maxKb: 20 },
  items: [
    {
      id: "npc_truong_tran",
      npcId: "truong_tran",
      seeds: [2026111911, 2026111912, 2026111913],
      prompt: buildNpcPrompt(
        "middle-aged village headman in a long dark blue robe seen from the side, wide-brimmed straw hat, hands folded, timber houses behind him",
        "warm peach and amber light, soft rose haze",
      ),
    },
    {
      id: "npc_duoc_su",
      npcId: "duoc_su",
      seeds: [2026111921, 2026111922, 2026111923],
      prompt: buildNpcPrompt(
        "stooped old herbalist in a green robe seen from behind, cloth headwrap, carrying a basket of drying herbs",
        "warm amber and sage light, soft cream haze",
      ),
    },
    {
      id: "npc_tho_ren",
      npcId: "tho_ren",
      seeds: [2026111931, 2026111932, 2026111933],
      prompt: buildNpcPrompt(
        "broad-shouldered blacksmith in a leather apron seen in profile, holding a hammer, a glowing forge behind him, hooded",
        "warm amber with ember glow, soft rose haze",
      ),
    },
    {
      id: "npc_lai_buon",
      npcId: "lai_buon",
      seeds: [2026111941, 2026111942, 2026111943],
      prompt: buildNpcPrompt(
        "travelling merchant with a heavy pack and a long windblown coat seen from the side, hat brim pulled low",
        "slate grey and cold blue shadows, pale grey haze",
      ),
    },
    {
      id: "npc_tram_truong",
      npcId: "tram_truong",
      seeds: [2026111951, 2026111952, 2026111953],
      prompt: buildNpcPrompt(
        "station master in a long coat holding a hooded lantern, standing on a stone platform, brimmed hat",
        "moss green and grey-green mist, faint pale lantern light",
      ),
    },
    {
      id: "npc_lai_buon_suong",
      npcId: "lai_buon_suong",
      seeds: [2026111961, 2026111962, 2026111963],
      prompt: buildNpcPrompt(
        "merchant poling a small cargo boat through a foggy swamp, conical hat, sacks piled behind him",
        "moss green and grey-green mist, dim sickly glow",
      ),
    },
    {
      id: "npc_tho_ren_suong",
      npcId: "tho_ren_suong",
      seeds: [2026111971, 2026111972, 2026111973],
      prompt: buildNpcPrompt(
        "swamp blacksmith in a heavy damp apron seen in profile, hooded, a forge glowing red in the fog",
        "moss green mist with a warm ember glow",
      ),
    },
    {
      id: "npc_tram_truong_han",
      npcId: "tram_truong_han",
      seeds: [2026111981, 2026111982, 2026111983],
      prompt: buildNpcPrompt(
        "station master in a thick fur-trimmed coat and deep hood standing in drifting snow, one hand raised against the wind",
        "pale ice blue and white haze, cold silver light",
      ),
    },
    {
      id: "npc_lai_buon_han",
      npcId: "lai_buon_han",
      seeds: [2026111991, 2026111992, 2026111993],
      prompt: buildNpcPrompt(
        "merchant in a fur hood leading a loaded pack animal through deep snow, seen from the side",
        "pale ice blue and white haze, cold silver light",
      ),
    },
    {
      id: "npc_tho_ren_han",
      npcId: "tho_ren_han",
      seeds: [2026112001, 2026112002, 2026112003],
      prompt: buildNpcPrompt(
        "blacksmith at an outdoor forge in falling snow, fur-lined hood, raising a hammer, seen in profile",
        "pale ice blue haze with a warm ember glow",
      ),
    },
    {
      id: "npc_thu_mon",
      npcId: "thu_mon",
      seeds: [2026112011, 2026112012, 2026112013],
      prompt: buildNpcPrompt(
        "gatekeeper in layered robes seen from behind, holding a long staff, standing before a glowing jade cavern gate",
        "jade teal and cyan glow against deep blue-black shadows",
      ),
    },
    {
      id: "npc_lao_dan",
      npcId: "lao_dan",
      seeds: [2026112021, 2026112022, 2026112023],
      prompt: buildNpcPrompt(
        "old alchemist in a long robe bending over a clay furnace, wisps of pale smoke rising, hooded",
        "warm amber and sage light, soft cream haze",
      ),
    },
  ],
};
