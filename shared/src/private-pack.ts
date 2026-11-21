// Hợp đồng GÓI TÀI NGUYÊN RIÊNG (QUYET_DINH_M3 mục 63, docs/THIET_KE_GOI_TAI_NGUYEN_RIENG.md): các gói hình miễn phí nhưng CẤM phân phối lại KHÔNG vào repo; chỉ nằm trên
// máy chủ (`/mnt/data/assets-private/dist/`), gắn chỉ đọc vào container. Máy chủ phục vụ `manifest.json` + đúng các tệp liệt kê trong đó; client đọc manifest, thiếu gói thì mỗi
// khoá hình lùi về hình thay thế (CI xanh, repo công khai không chứa gói).
//
// Tệp này chỉ là HỢP ĐỒNG THUẦN (kiểu + luật kiểm + dựng URL): không đọc đĩa, không mạng. Cả máy chủ (`server/src/private-packs.ts`, lọc manifest lúc khởi động) lẫn công cụ đóng gói
// và client (kiểm manifest nhận về) dùng CHUNG một luật, nên đường dẫn nguy hiểm (`..`, tuyệt đối, ký tự lạ) bị loại ở MỌI đầu.

/** Tiền tố URL phục vụ gói riêng (cùng nguồn với trang, đi qua các lớp bảo vệ Origin / CSP sẵn có). */
export const PRIVATE_PACK_URL_PREFIX = "/assets-private/";
/** URL của danh mục gói. */
export const PRIVATE_PACK_MANIFEST_URL = `${PRIVATE_PACK_URL_PREFIX}manifest.json`;
/** Số ký tự đầu của sha256 làm `?v=` (12 hex, CÙNG ĐỘ DÀI với `/packs/` của client: Service Worker nhận cache bất biến theo đúng độ dài này). */
export const PRIVATE_PACK_VERSION_HEX = 12;
/** Độ dài tối đa của `url` (chỉ `https:`) và `license` trong một gói (hiện ở màn Ghi công). */
export const PRIVATE_PACK_URL_MAX_LEN = 200;
export const PRIVATE_PACK_LICENSE_MAX_LEN = 80;
/** Số gói tối đa trong một manifest. */
export const PRIVATE_PACK_MAX_PACKS = 32;
/** Tổng số tệp tối đa trong một manifest (cộng mọi gói). */
export const PRIVATE_PACK_MAX_FILES = 2000;
/** Dung lượng tối đa của MỘT tệp (byte): 4 MiB (atlas lớn nhất hợp lý cho client web; chặn nhét tệp khổng lồ). */
export const PRIVATE_PACK_FILE_MAX_BYTES = 4 * 1024 * 1024;
/** Độ dài tối đa của đường dẫn tệp trong gói. */
export const PRIVATE_PACK_PATH_MAX_LEN = 120;
/** Phần mở rộng được phục vụ (danh sách TRẮNG; không nhận `html`, `js`, `svg`... để khỏi thành đường chạy mã / XSS). */
export const PRIVATE_PACK_EXTENSIONS = ["png", "webp", "jpg", "jpeg", "json", "ogg"] as const;
export type PrivatePackExtension = (typeof PRIVATE_PACK_EXTENSIONS)[number];

/** Kiểu nội dung theo phần mở rộng (cố định, không đoán từ nội dung). */
export const PRIVATE_PACK_MIME: Readonly<Record<PrivatePackExtension, string>> = {
  png: "image/png",
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  json: "application/json",
  ogg: "audio/ogg",
};

/**
 * Tệp trong gói: CÙNG hình dạng với `PackFile` của client (`client/src/gfx/packs.ts`: `{ path, bytes, sha256 }`) để gói riêng đi qua đúng bộ nạp `ensurePack` sẵn có
 * (idempotent, không bao giờ ném lỗi, hết giờ vẫn tải tiếp, thử lại tối đa 3 lần) thay vì dựng bộ nạp thứ hai (B, review #1259).
 */
export interface PrivatePackFile {
  /** Đường dẫn TƯƠNG ĐỐI trong gói, vd `atlas.png` hoặc `tiles/ground.webp` (không `..`, không `/` đầu). */
  path: string;
  /** Số byte đúng của tệp (máy chủ so với `stat` lúc khởi động). */
  bytes: number;
  /** SHA-256 của tệp, 64 ký tự hex thường (công cụ `assets-private:check` so với đĩa; client dùng 12 ký tự đầu làm `?v=`). */
  sha256: string;
}

export interface PrivatePack {
  /** Mã gói: chữ thường / số / `_` / `-`, duy nhất. */
  id: string;
  /** Tên hiển thị ở màn Ghi công (2-80 ký tự, không xuống dòng / điều khiển). */
  title: string;
  /** Trang chính thức của gói (CHỈ `https:`, <= 200 ký tự, không khoảng trắng / điều khiển): màn Ghi công hiện bằng `textContent` + `rel="noopener"`. Tuỳ chọn. */
  url?: string;
  /** Giấy phép tóm tắt (<= 80 ký tự, không điều khiển, không khoảng trắng đầu / cuối), vd "Miễn phí, được dùng trong game, cấm phân phối lại". Tuỳ chọn. */
  license?: string;
  files: PrivatePackFile[];
}

/**
 * Manifest: `{ packs }`, CÙNG dạng gốc với `PackManifest` của client (không có trường `version` song song: đổi hợp đồng thì đổi `shared/` + `PROTOCOL_VERSION` như mọi hợp đồng khác;
 * client làm sạch bằng cùng luật với `sanitizeManifest` + `privatePackViolations`).
 */
export interface PrivatePackManifest {
  packs: PrivatePack[];
}

/** Manifest RỖNG: thứ máy chủ trả (200) khi gói tắt / manifest hỏng, để client không thấy 404 đỏ ở DevTools mỗi lần vào game (B, review #1259). */
export const PRIVATE_PACK_EMPTY_MANIFEST: Readonly<PrivatePackManifest> = Object.freeze({
  packs: [],
});

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const SEG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SHA_RE = /^[0-9a-f]{64}$/;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** Phần mở rộng (chữ thường) của đường dẫn hợp lệ, hoặc `undefined` nếu không thuộc danh sách trắng. */
export function privatePackExtension(path: string): PrivatePackExtension | undefined {
  const dot = path.lastIndexOf(".");
  if (dot <= 0 || dot === path.length - 1) return undefined;
  const ext = path.slice(dot + 1).toLowerCase();
  return (PRIVATE_PACK_EXTENSIONS as readonly string[]).includes(ext)
    ? (ext as PrivatePackExtension)
    : undefined;
}

/**
 * Đường dẫn tệp trong gói có an toàn không? Mỗi đoạn (cách nhau bởi `/`) bắt đầu bằng chữ / số (nên không có đoạn rỗng, `.` hay `..`, không tệp ẩn) và chỉ gồm chữ / số / `.` / `_` / `-`;
 * không `/` đầu, không `\`, không NUL, không ký tự lạ; dài <= `PRIVATE_PACK_PATH_MAX_LEN`; phần mở rộng thuộc danh sách trắng. Thuần. Đây là luật DUY NHẤT: máy chủ không nối
 * chuỗi từ yêu cầu (tra bảng dựng từ manifest), luật này chặn manifest xấu ngay từ đầu.
 */
export function isSafePrivatePackPath(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0 || path.length > PRIVATE_PACK_PATH_MAX_LEN)
    return false;
  if (!path.split("/").every((seg) => SEG_RE.test(seg))) return false;
  return privatePackExtension(path) !== undefined;
}

/** `url` của gói an toàn không? CHỈ `https:` (không `javascript:` / `data:` / `http:`), <= 200 ký tự, không khoảng trắng / điều khiển / `<` `>` `"` `\\`, có tên miền; phân tích được bằng `URL`. Thuần. */
export function isSafePrivatePackUrl(url: unknown): url is string {
  if (typeof url !== "string" || url.length < 12 || url.length > PRIVATE_PACK_URL_MAX_LEN)
    return false;
  if (!url.startsWith("https://") || /[\s<>"'\\]/.test(url) || CONTROL_RE.test(url)) return false;
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" && u.hostname.includes(".") && u.username === "" && u.password === ""
    );
  } catch {
    return false;
  }
}

/**
 * Kiểm một manifest (thường đọc từ JSON, nên nhận `unknown`): rỗng = hợp lệ. Chỉ nhận ĐÚNG các trường của hợp đồng (trường lạ là lỗi: không để nhét đường dẫn qua trường khác).
 * Mã gói duy nhất, đường dẫn duy nhất trong gói (không phân biệt hoa thường: ổ đĩa không phân biệt hoa thường sẽ nhầm), số tệp / gói / dung lượng trong trần. Thuần.
 */
export function privatePackViolations(m: unknown): string[] {
  const bad: string[] = [];
  if (!isRecord(m)) return ["manifest không phải đối tượng"];
  for (const k of Object.keys(m))
    if (k !== "packs") bad.push(`trường lạ ở manifest: ${JSON.stringify(k).slice(0, 40)}`);
  if (!Array.isArray(m.packs)) return [...bad, "packs phải là mảng"];
  if (m.packs.length > PRIVATE_PACK_MAX_PACKS)
    bad.push(`quá ${PRIVATE_PACK_MAX_PACKS} gói (${m.packs.length})`);
  const ids = new Set<string>();
  let total = 0;
  m.packs.forEach((p: unknown, i: number) => {
    const at = `gói #${i}`;
    if (!isRecord(p)) return void bad.push(`${at}: không phải đối tượng`);
    for (const k of Object.keys(p))
      if (k !== "id" && k !== "title" && k !== "url" && k !== "license" && k !== "files")
        bad.push(`${at}: trường lạ ${JSON.stringify(k).slice(0, 40)}`);
    const id = p.id;
    if (typeof id !== "string" || !ID_RE.test(id)) bad.push(`${at}: id sai dạng`);
    else if (ids.has(id)) bad.push(`${at}: trùng id ${id}`);
    else ids.add(id);
    const name = typeof id === "string" ? id : at;
    const title = p.title;
    if (
      typeof title !== "string" ||
      title.length < 2 ||
      title.length > 80 ||
      CONTROL_RE.test(title) ||
      title.trim() !== title
    )
      bad.push(`${name}: title phải 2-80 ký tự, không điều khiển, không khoảng trắng đầu / cuối`);
    if (p.url !== undefined && !isSafePrivatePackUrl(p.url))
      bad.push(
        `${name}: url phải là https:, <= ${PRIVATE_PACK_URL_MAX_LEN} ký tự, không khoảng trắng / điều khiển`,
      );
    const lic = p.license;
    if (
      lic !== undefined &&
      (typeof lic !== "string" ||
        lic.length < 1 ||
        lic.length > PRIVATE_PACK_LICENSE_MAX_LEN ||
        CONTROL_RE.test(lic) ||
        lic.trim() !== lic)
    )
      bad.push(
        `${name}: license phải 1-${PRIVATE_PACK_LICENSE_MAX_LEN} ký tự, không điều khiển, không khoảng trắng đầu / cuối`,
      );
    if (!Array.isArray(p.files)) return void bad.push(`${name}: files phải là mảng`);
    const seen = new Set<string>();
    p.files.forEach((f: unknown, j: number) => {
      total++;
      const fat = `${name} tệp #${j}`;
      if (!isRecord(f)) return void bad.push(`${fat}: không phải đối tượng`);
      for (const k of Object.keys(f))
        if (k !== "path" && k !== "bytes" && k !== "sha256")
          bad.push(`${fat}: trường lạ ${JSON.stringify(k).slice(0, 40)}`);
      if (!isSafePrivatePackPath(f.path)) bad.push(`${fat}: path không an toàn`);
      else {
        const key = f.path.toLowerCase();
        if (seen.has(key)) bad.push(`${fat}: trùng path ${f.path}`);
        seen.add(key);
      }
      if (
        typeof f.bytes !== "number" ||
        !Number.isInteger(f.bytes) ||
        f.bytes < 1 ||
        f.bytes > PRIVATE_PACK_FILE_MAX_BYTES
      )
        bad.push(`${fat}: bytes phải nguyên 1..${PRIVATE_PACK_FILE_MAX_BYTES}`);
      if (typeof f.sha256 !== "string" || !SHA_RE.test(f.sha256))
        bad.push(`${fat}: sha256 phải đúng 64 hex thường`);
    });
  });
  if (total > PRIVATE_PACK_MAX_FILES) bad.push(`quá ${PRIVATE_PACK_MAX_FILES} tệp (${total})`);
  return bad;
}

/**
 * Manifest nhận từ mạng, CÓ KIỂU: hợp lệ (`privatePackViolations` rỗng) thì trả CHÍNH đối tượng đã kiểm, còn lại `null` (tất cả hoặc không gì: máy chủ đã lọc tệp thiếu nên manifest phục vụ luôn hợp lệ;
 * thứ hỏng nghĩa là không đáng tin, coi như KHÔNG có gói). Client dùng hàm này thay vì ép kiểu `as PrivatePackManifest` (B, review #1262). Thuần.
 */
export function parsePrivatePackManifest(raw: unknown): PrivatePackManifest | null {
  return privatePackViolations(raw).length === 0 ? (raw as PrivatePackManifest) : null;
}

/** Tra tệp theo (mã gói, đường dẫn) trong manifest ĐÃ KIỂM: so sánh chuỗi bằng `find` (không tra thuộc tính đối tượng nên `constructor` / `__proto__` không thành kết quả), phân biệt hoa thường. Thuần. */
export function privatePackFile(
  m: PrivatePackManifest,
  packId: string,
  path: string,
): PrivatePackFile | undefined {
  return m.packs.find((p) => p.id === packId)?.files.find((f) => f.path === path);
}

/** Khoá tra bảng `"<gói>/<đường dẫn>"` (cùng dạng máy chủ dùng để tra tệp được phục vụ). */
export function privatePackKey(packId: string, path: string): string {
  return `${packId}/${path}`;
}

/**
 * URL của một tệp trong gói: `/assets-private/<gói>/<đường dẫn>`, kèm `?v=<12 hex đầu của sha256>` nếu có hash hợp lệ (máy chủ coi tệp có `?v=` đúng hash là bất biến / cache dài).
 * Mã gói hoặc đường dẫn không an toàn thì ném lỗi (lập trình sai, không phải dữ liệu người chơi). Thuần.
 */
export function privatePackUrl(packId: string, path: string, sha256?: string): string {
  if (!ID_RE.test(packId)) throw new Error(`mã gói không hợp lệ: ${packId}`);
  if (!isSafePrivatePackPath(path)) throw new Error(`đường dẫn gói không an toàn: ${path}`);
  const v =
    sha256 !== undefined && SHA_RE.test(sha256)
      ? `?v=${sha256.slice(0, PRIVATE_PACK_VERSION_HEX)}`
      : "";
  return `${PRIVATE_PACK_URL_PREFIX}${packId}/${path}${v}`;
}

/** `?v=` có khớp 12 hex đầu của `sha256` (hợp lệ) không (máy chủ dùng để quyết `immutable`). Giá trị rác / thiếu -> `false`. Thuần. */
export function privatePackVersionMatches(v: unknown, sha256: string): boolean {
  return (
    typeof v === "string" &&
    new RegExp(`^[0-9a-f]{${PRIVATE_PACK_VERSION_HEX}}$`).test(v) &&
    SHA_RE.test(sha256) &&
    sha256.startsWith(v)
  );
}
