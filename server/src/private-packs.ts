// Phục vụ GÓI TÀI NGUYÊN RIÊNG (QUYET_DINH_M3 mục 63, docs/THIET_KE_GOI_TAI_NGUYEN_RIENG.md): các gói hình cấm phân phối lại nằm NGOÀI repo, ở `ASSETS_PRIVATE_DIR` (trên máy chủ:
// `/mnt/data/assets-private/dist/`, gắn CHỈ ĐỌC vào container). Biến rỗng = TẮT (mặc định): không gói nào, mọi yêu cầu dưới `/assets-private/` nhận 404 sạch (KHÔNG rơi xuống trang `index.html`
// của SPA), client tự dùng hình thay thế.
//
// AN TOÀN (không có đường nào đi từ chuỗi do người dùng gửi tới hệ thống tệp):
//  - Lúc khởi động đọc `manifest.json`, kiểm bằng luật CHUNG của `shared/` (`privatePackViolations`), rồi dựng BẢNG `"<gói>/<đường dẫn>" -> tệp`: đường dẫn tuyệt đối do MÁY CHỦ tự nối từ
//    manifest đã kiểm, `realpath` phải nằm trong thư mục gốc (symlink trỏ ra ngoài bị loại), phải là tệp thường, đúng số byte đã khai.
//  - Yêu cầu chỉ được TRA BẢNG bằng khoá; không có trong bảng (kể cả tệp có trên đĩa nhưng KHÔNG nằm trong manifest, thư mục, `..`, `%2e%2e`, `\`, NUL) là 404; phương thức khác GET / HEAD là 405.
//  - Manifest hỏng / thư mục thiếu: TẮT và in cảnh báo, KHÔNG làm sập máy chủ.
// Gắn SAU `originGuardMiddleware` / `frameGuardMiddleware` (Origin lạ bị 403 như mọi đường khác), TRƯỚC `express.static`.
import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type { Express, Request, Response } from "express";
import {
  PRIVATE_PACK_FILE_MAX_BYTES,
  PRIVATE_PACK_EMPTY_MANIFEST,
  PRIVATE_PACK_MIME,
  PRIVATE_PACK_URL_PREFIX,
  isSafePrivatePackPath,
  privatePackExtension,
  privatePackKey,
  privatePackVersionMatches,
  privatePackViolations,
  type PrivatePackManifest,
} from "@tien-gioi/shared";

/** Tệp được phục vụ (đường dẫn tuyệt đối do máy chủ dựng). */
export interface PrivatePackEntry {
  abs: string;
  mime: string;
  sha256: string;
  bytes: number;
}

export interface PrivatePackTable {
  /** Khoá `"<gói>/<đường dẫn>"` -> tệp. Chỉ chứa tệp ĐÃ qua mọi kiểm tra. */
  files: Map<string, PrivatePackEntry>;
  /** Manifest ĐÃ LỌC (chỉ gói / tệp còn phục vụ được): đây là thứ client nhận. */
  manifest: PrivatePackManifest;
}

export interface LoadResult {
  /** `null` khi TẮT (biến rỗng, thiếu thư mục / manifest, manifest hỏng). */
  table: PrivatePackTable | null;
  /** Cảnh báo cho log khởi động (rỗng khi tắt vì biến rỗng). */
  warnings: string[];
}

/** Manifest lớn hơn mức này (byte) bị từ chối (chặn đọc tệp khổng lồ). 2000 tệp x ~200 byte là ~400 KB. */
const MANIFEST_MAX_BYTES = 1024 * 1024;

const isInside = (root: string, p: string): boolean => p === root || p.startsWith(root + path.sep);

/**
 * Đọc `<dir>/manifest.json` và dựng bảng phục vụ. `dir` rỗng / `undefined` = TẮT. Không bao giờ ném lỗi (mọi lỗi thành `warnings` + `table: null`, hoặc loại RIÊNG tệp lỗi).
 */
export function loadPrivatePacks(dir: string | undefined): LoadResult {
  const warnings: string[] = [];
  const raw = (dir ?? "").trim();
  if (raw === "") return { table: null, warnings };
  let root: string;
  try {
    root = realpathSync(path.resolve(raw));
    if (!statSync(root).isDirectory()) throw new Error("không phải thư mục");
  } catch {
    warnings.push(
      `ASSETS_PRIVATE_DIR='${raw}' không phải thư mục đọc được: gói tài nguyên riêng TẮT.`,
    );
    return { table: null, warnings };
  }
  const manifestPath = path.join(root, "manifest.json");
  let parsed: unknown;
  try {
    const st = lstatSync(manifestPath);
    if (!st.isFile() || st.size > MANIFEST_MAX_BYTES)
      throw new Error("không phải tệp thường hoặc quá lớn");
    parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (e) {
    warnings.push(
      `Gói tài nguyên riêng TẮT: không đọc được ${manifestPath} (${e instanceof Error ? e.message : String(e)}).`,
    );
    return { table: null, warnings };
  }
  const bad = privatePackViolations(parsed);
  if (bad.length > 0) {
    warnings.push(
      `Gói tài nguyên riêng TẮT: manifest không hợp lệ (${bad.length} lỗi, vd: ${bad.slice(0, 3).join("; ")}).`,
    );
    return { table: null, warnings };
  }
  const m = parsed as PrivatePackManifest;
  const files = new Map<string, PrivatePackEntry>();
  const packs: PrivatePackManifest["packs"] = [];
  for (const pack of m.packs) {
    const kept: (typeof pack.files)[number][] = [];
    for (const f of pack.files) {
      const key = privatePackKey(pack.id, f.path);
      const abs = path.join(root, pack.id, ...f.path.split("/"));
      try {
        // máy chủ tự nối đường dẫn từ manifest ĐÃ KIỂM; vẫn đòi realpath nằm trong gốc (symlink thoát gốc bị loại) và là tệp thường đúng số byte
        const real = realpathSync(abs);
        if (!isInside(root, real)) throw new Error("nằm ngoài thư mục gốc");
        const st = statSync(real);
        if (!st.isFile()) throw new Error("không phải tệp thường");
        if (st.size !== f.bytes)
          throw new Error(`lệch số byte (đĩa ${st.size}, manifest ${f.bytes})`);
        if (st.size > PRIVATE_PACK_FILE_MAX_BYTES) throw new Error("quá lớn");
        const ext = privatePackExtension(f.path);
        if (ext === undefined) throw new Error("đuôi không được phép");
        files.set(key, {
          abs: real,
          mime: PRIVATE_PACK_MIME[ext],
          sha256: f.sha256,
          bytes: f.bytes,
        });
        kept.push(f);
      } catch (e) {
        warnings.push(
          `Gói '${pack.id}': bỏ tệp ${f.path} (${e instanceof Error ? e.message : String(e)}).`,
        );
      }
    }
    if (kept.length > 0)
      packs.push({
        id: pack.id,
        title: pack.title,
        ...(pack.url !== undefined ? { url: pack.url } : {}),
        ...(pack.license !== undefined ? { license: pack.license } : {}),
        files: kept,
      });
  }
  return {
    table: { files, manifest: { packs } },
    warnings,
  };
}

/** Dòng log khởi động. */
export function privatePacksNotice(r: LoadResult): string {
  if (!r.table) return "Gói tài nguyên riêng: tắt";
  const n = r.table.manifest.packs.length;
  return `Gói tài nguyên riêng: BẬT, ${n} gói / ${r.table.files.size} tệp (ASSETS_PRIVATE_DIR)`;
}

/**
 * Khoá tra bảng từ phần đường dẫn SAU `/assets-private/` của yêu cầu (chuỗi THÔ, chưa giải mã). Trả `null` nếu có gì đáng ngờ: giải mã hỏng, còn `%` sau khi giải mã (mã hoá kép), `\`, NUL, điều
 * khiển, hoặc rỗng. Khoá chỉ dùng để TRA BẢNG, không bao giờ nối vào đường dẫn tệp.
 */
export function privatePackLookupKey(rawAfterPrefix: string): string | null {
  if (rawAfterPrefix === "") return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawAfterPrefix);
  } catch {
    return null;
  }
  if (decoded.includes("%") || decoded.includes("\\") || /[\u0000-\u001f\u007f]/.test(decoded))
    return null;
  return decoded;
}

const NOT_FOUND = (res: Response): void =>
  void res.status(404).type("text/plain").send("Not found");

/**
 * Gắn route `/assets-private/*`. `table` rỗng (`null`) vẫn gắn: mọi yêu cầu dưới tiền tố nhận 404 sạch (không rơi xuống `index.html` của SPA, nên client đọc manifest thấy 404 chứ không phải HTML).
 * Gọi SAU các middleware bảo vệ Origin / khung và TRƯỚC `express.static`.
 */
export function mountPrivatePacks(app: Express, table: PrivatePackTable | null): void {
  const prefixNoSlash = PRIVATE_PACK_URL_PREFIX.slice(0, -1);
  app.use(prefixNoSlash, (req: Request, res: Response) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD");
      return void res.status(405).type("text/plain").send("Method not allowed");
    }
    // `req.url` trong `app.use(prefix)` đã bỏ tiền tố: "/manifest.json?x=1", "/gói/tệp.png?v=..."
    const [rawPath = "", rawQuery = ""] = req.url.split("?", 2);
    const after = rawPath.startsWith("/") ? rawPath.slice(1) : rawPath;
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    if (after === "manifest.json") {
      // TẮT hoặc manifest hỏng: vẫn 200 `{ packs: [] }` (không 404 đỏ ở DevTools mỗi lần vào game; client coi là không có gói). Tệp riêng lẻ vẫn 404.
      res.setHeader("Cache-Control", "no-cache");
      return void res
        .type("application/json")
        .send(JSON.stringify(table ? table.manifest : PRIVATE_PACK_EMPTY_MANIFEST));
    }
    if (!table) return NOT_FOUND(res);
    const key = privatePackLookupKey(after);
    const entry = key === null ? undefined : table.files.get(key); // `Map`: không có chuỗi nào của người dùng thành thuộc tính nguyên mẫu
    if (!entry) return NOT_FOUND(res);
    const etag = `"${entry.sha256}"`;
    const v = new URLSearchParams(rawQuery).get("v");
    res.setHeader("ETag", etag);
    res.setHeader(
      "Cache-Control",
      privatePackVersionMatches(v, entry.sha256)
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    );
    if (req.headers["if-none-match"] === etag) return void res.status(304).end();
    res.setHeader("Content-Type", entry.mime);
    res.setHeader("Content-Length", String(entry.bytes));
    if (req.method === "HEAD") return void res.status(200).end();
    const stream = createReadStream(entry.abs);
    stream.on("error", () => {
      if (!res.headersSent) NOT_FOUND(res);
      else res.destroy();
    });
    stream.pipe(res);
  });
}

// ---------- Công cụ đóng gói / kiểm (CLI: server/scripts/assets-private.ts) ----------

const sha256Of = (abs: string): string =>
  createHash("sha256").update(readFileSync(abs)).digest("hex");

function walk(dir: string, rel = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith(".")) continue;
    const abs = path.join(dir, name);
    const r = rel === "" ? name : `${rel}/${name}`;
    const st = lstatSync(abs);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) out.push(...walk(abs, r));
    else if (st.isFile()) out.push(r);
  }
  return out;
}

/**
 * Sinh manifest từ thư mục `dist` (mỗi thư mục con trực tiếp = một gói, id = tên thư mục). Chỉ tệp có đuôi trong danh sách trắng và đường dẫn an toàn; bỏ qua tệp ẩn / liên kết tượng trưng.
 * `titles[id]` là tên hiển thị (mặc định = id). Kết quả TẤT ĐỊNH (sắp xếp theo tên). Ném lỗi nếu manifest sinh ra không qua `privatePackViolations` (vd tệp > 4 MiB).
 */
export function buildPrivatePackManifest(
  distDir: string,
  titles: Readonly<Record<string, string>> = {},
  extra: {
    urls?: Readonly<Record<string, string>>;
    licenses?: Readonly<Record<string, string>>;
  } = {},
): PrivatePackManifest {
  const root = path.resolve(distDir);
  const packs: PrivatePackManifest["packs"] = [];
  for (const name of readdirSync(root).sort()) {
    const abs = path.join(root, name);
    if (name.startsWith(".") || !lstatSync(abs).isDirectory()) continue;
    const files = walk(abs)
      .filter((p) => isSafePrivatePackPath(p))
      .map((p) => {
        const full = path.join(abs, ...p.split("/"));
        return { path: p, bytes: statSync(full).size, sha256: sha256Of(full) };
      });
    const url = extra.urls?.[name];
    const license = extra.licenses?.[name];
    packs.push({
      id: name,
      title: titles[name] ?? name,
      ...(url !== undefined ? { url } : {}),
      ...(license !== undefined ? { license } : {}),
      files,
    });
  }
  const m: PrivatePackManifest = { packs };
  const bad = privatePackViolations(m);
  if (bad.length > 0)
    throw new Error(`manifest sinh ra không hợp lệ: ${bad.slice(0, 5).join("; ")}`);
  return m;
}

/**
 * Tệp có đuôi hợp lệ (danh sách trắng) nhưng TÊN / đường dẫn sai luật (`isSafePrivatePackPath`: khoảng trắng, dấu, ký tự lạ, quá dài): `buildPrivatePackManifest` BỎ QUA nên máy chủ sẽ KHÔNG phục vụ
 * và client lặng lẽ lùi về hình thay thế (gói tải từ itch.io hay có tên "Blue House.png"). Đuôi ngoài danh sách trắng (`readme.txt`, `SOURCES.md`) KHÔNG tính: bỏ qua là chủ ý. Trả `<gói>/<đường dẫn>`,
 * sắp xếp tất định; cùng bộ lọc thư mục / tệp ẩn / liên kết tượng trưng với `buildPrivatePackManifest`.
 */
export function listSkippedPrivatePackFiles(distDir: string): string[] {
  const root = path.resolve(distDir);
  const out: string[] = [];
  for (const name of readdirSync(root).sort()) {
    const abs = path.join(root, name);
    if (name.startsWith(".") || !lstatSync(abs).isDirectory()) continue;
    for (const p of walk(abs))
      if (!isSafePrivatePackPath(p) && privatePackExtension(p) !== undefined)
        out.push(`${name}/${p}`);
  }
  return out;
}

/** Ghi manifest (đẹp, kết thúc bằng xuống dòng) vào `<dist>/manifest.json`. */
export function writePrivatePackManifest(
  distDir: string,
  titles?: Readonly<Record<string, string>>,
  extra?: { urls?: Readonly<Record<string, string>>; licenses?: Readonly<Record<string, string>> },
): PrivatePackManifest {
  const m = buildPrivatePackManifest(distDir, titles, extra);
  writeFileSync(
    path.join(path.resolve(distDir), "manifest.json"),
    `${JSON.stringify(m, null, 2)}\n`,
  );
  return m;
}

/**
 * Kiểm `<dist>/manifest.json` với đĩa: mỗi tệp phải có, đúng số byte và đúng SHA-256; liệt kê tệp trên đĩa KHÔNG nằm trong manifest (sẽ không được phục vụ). Trả danh sách lỗi (rỗng = khớp)
 * và danh sách cảnh báo (tệp thừa).
 */
export function checkPrivatePackManifest(distDir: string): { errors: string[]; extra: string[] } {
  const root = path.resolve(distDir);
  const errors: string[] = [];
  const extra: string[] = [];
  const mp = path.join(root, "manifest.json");
  if (!existsSync(mp)) return { errors: [`thiếu ${mp}`], extra };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(mp, "utf8"));
  } catch (e) {
    return {
      errors: [`manifest không phải JSON: ${e instanceof Error ? e.message : String(e)}`],
      extra,
    };
  }
  const bad = privatePackViolations(parsed);
  if (bad.length > 0) return { errors: bad, extra };
  const m = parsed as PrivatePackManifest;
  const listed = new Set<string>();
  for (const pack of m.packs)
    for (const f of pack.files) {
      listed.add(privatePackKey(pack.id, f.path));
      const full = path.join(root, pack.id, ...f.path.split("/"));
      if (!existsSync(full)) {
        errors.push(`${pack.id}/${f.path}: thiếu tệp`);
        continue;
      }
      const st = statSync(full);
      if (st.size !== f.bytes)
        errors.push(`${pack.id}/${f.path}: lệch số byte (đĩa ${st.size}, manifest ${f.bytes})`);
      else if (sha256Of(full) !== f.sha256) errors.push(`${pack.id}/${f.path}: lệch SHA-256`);
    }
  for (const name of readdirSync(root).sort()) {
    const abs = path.join(root, name);
    if (name.startsWith(".") || !lstatSync(abs).isDirectory()) continue;
    for (const p of walk(abs)) if (!listed.has(privatePackKey(name, p))) extra.push(`${name}/${p}`);
  }
  return { errors, extra };
}
