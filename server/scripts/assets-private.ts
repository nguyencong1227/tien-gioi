// Công cụ đóng gói / kiểm GÓI TÀI NGUYÊN RIÊNG (QUYET_DINH_M3 mục 63, docs/THIET_KE_GOI_TAI_NGUYEN_RIENG.md). Chạy trên MÁY CHỦ, không bao giờ trong CI.
//   npm run assets-private:manifest -w server -- [<dist>] [--title id=Tên] [--url id=https://...] [--license id=Giấy phép]...   sinh <dist>/manifest.json từ các thư mục gói (id = tên thư mục)
//   npm run assets-private:check    -w server -- [<dist>]                                 so manifest với đĩa (số byte + SHA-256); thoát 1 nếu lệch
// <dist> mặc định: biến ASSETS_PRIVATE_DIR, rồi /mnt/data/assets-private/dist.
import path from "node:path";
import { checkPrivatePackManifest, writePrivatePackManifest } from "../src/private-packs";

const DEFAULT_DIST = "/mnt/data/assets-private/dist";

function main(argv: string[]): number {
  const [cmd, ...rest] = argv;
  const titles: Record<string, string> = {};
  const urls: Record<string, string> = {};
  const licenses: Record<string, string> = {};
  let dist: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--title" || a === "--url" || a === "--license") {
      const kv = rest[++i] ?? "";
      const eq = kv.indexOf("=");
      if (eq <= 0) {
        console.error(`${a} cần dạng id=giá trị (nhận '${kv}')`);
        return 2;
      }
      (a === "--title" ? titles : a === "--url" ? urls : licenses)[kv.slice(0, eq)] = kv.slice(
        eq + 1,
      );
    } else if (a.startsWith("--")) {
      console.error(`tuỳ chọn lạ: ${a}`);
      return 2;
    } else dist = a;
  }
  const dir = path.resolve(dist ?? (process.env.ASSETS_PRIVATE_DIR || DEFAULT_DIST));
  if (cmd === "manifest") {
    const m = writePrivatePackManifest(dir, titles, { urls, licenses });
    const n = m.packs.reduce((s, p) => s + p.files.length, 0);
    console.log(`Đã ghi ${path.join(dir, "manifest.json")}: ${m.packs.length} gói, ${n} tệp.`);
    return 0;
  }
  if (cmd === "check") {
    const { errors, extra } = checkPrivatePackManifest(dir);
    for (const e of errors) console.error(`LỖI: ${e}`);
    for (const x of extra)
      console.warn(`THỪA (không có trong manifest, sẽ KHÔNG được phục vụ): ${x}`);
    if (errors.length > 0) return 1;
    console.log(
      `Manifest khớp đĩa (${dir})${extra.length > 0 ? `, ${extra.length} tệp thừa` : ""}.`,
    );
    return 0;
  }
  console.error(
    "Dùng: assets-private.ts manifest|check [<dist>] [--title id=Tên] [--url id=https://...] [--license id=Giấy phép]",
  );
  return 2;
}

process.exit(main(process.argv.slice(2)));
