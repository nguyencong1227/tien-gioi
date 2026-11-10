// Công cụ quản trị tài khoản (M3 bước 3c-5, docs/THIET_KE_TAI_KHOAN.md mục 4.4): đặt lại mật khẩu, đặt lại mã khôi phục,
// khoá / mở, đăng xuất mọi thiết bị, liệt kê. Chạy trên máy chủ, KHÔNG qua mạng; không in băm mật khẩu hay token.
//
//   npm run tai-khoan -w server -- list
//   npm run tai-khoan -w server -- show <tên đăng nhập>
//   npm run tai-khoan -w server -- reset-password <tên đăng nhập>   (in mật khẩu tạm + mã khôi phục MỚI, một lần)
//   npm run tai-khoan -w server -- reset-recovery <tên đăng nhập>   (in mã khôi phục MỚI, một lần)
//   npm run tai-khoan -w server -- disable <tên đăng nhập>          (khoá + đăng xuất mọi thiết bị)
//   npm run tai-khoan -w server -- enable <tên đăng nhập>
//   npm run tai-khoan -w server -- logout-all <tên đăng nhập>
//
// Phải TẮT server trước: bản file giữ chỉ mục tài khoản trong bộ nhớ của server, sửa tệp lúc server đang chạy sẽ bị
// server ghi đè ở lần lưu kế tiếp. Công cụ từ chối nếu thấy server trả lời ở `/health` (trừ khi có `--force`).
// Mã thoát: 0 xong; 1 sai cách dùng / không có tài khoản; 2 server đang chạy.
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateUsername } from "@tien-gioi/shared";
import {
  FileAccountStore,
  FileSessionStore,
  accountsDir,
  sessionsDir,
  type AccountRecord,
  type AccountStore,
  type SessionStore,
} from "../src/account-store.js";
import { hashSecretScrypt, newRecoveryCode, normalizeRecoveryCode } from "../src/auth.js";

export interface ToolDeps {
  accounts: AccountStore;
  sessions: SessionStore;
  /** Server đang chạy (trả lời ở `/health`)? */
  isServerUp: () => Promise<boolean>;
  /** Băm mật khẩu / mã khôi phục (mặc định scrypt thật); test truyền bản rẻ */
  hash?: (secret: string) => Promise<string>;
}

export interface ToolResult {
  code: number;
  lines: string[];
}

export const USAGE = [
  "Cách dùng: npm run tai-khoan -w server -- <lệnh> [tên đăng nhập] [--force]",
  "  list                          liệt kê tài khoản (không có băm / token)",
  "  show <tên>                    chi tiết một tài khoản",
  "  reset-password <tên>          đặt mật khẩu tạm ngẫu nhiên + mã khôi phục MỚI, đăng xuất mọi thiết bị",
  "  reset-recovery <tên>          đặt mã khôi phục MỚI (mật khẩu và phiên giữ nguyên)",
  "  disable <tên>                 khoá tài khoản và đăng xuất mọi thiết bị",
  "  enable <tên>                  mở khoá",
  "  logout-all <tên>              đăng xuất mọi thiết bị",
  "Phải TẮT server trước (--force để bỏ qua kiểm tra, chỉ khi chắc chắn).",
];

/** Bảng chữ không có ký tự dễ nhầm (0 O 1 I l): 56 ký tự. */
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** Mật khẩu tạm ngẫu nhiên 20 ký tự (~116 bit); lấy mẫu loại bỏ để không lệch (56 không chia hết 256). */
export function randomPassword(length = 20): string {
  const limit = 256 - (256 % PASSWORD_ALPHABET.length);
  let out = "";
  while (out.length < length) {
    for (const b of randomBytes(length * 2)) {
      if (b >= limit) continue;
      out += PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length];
      if (out.length === length) break;
    }
  }
  return out;
}

const fail = (code: number, ...lines: string[]): ToolResult => ({ code, lines });
const iso = (s: string) => (s.startsWith("1970-01-01") ? "(chưa có)" : s);

function describe(a: AccountRecord): string {
  const parts = [
    a.username.padEnd(20),
    (a.name ?? "(chưa có đạo hiệu)").padEnd(18),
    `tạo ${iso(a.createdAt).slice(0, 10)}`,
    `đăng nhập cuối ${iso(a.lastLoginAt).slice(0, 10)}`,
  ];
  if (a.disabled) parts.push("[ĐÃ KHOÁ]");
  return parts.join("  ");
}

export async function runTool(argv: string[], deps: ToolDeps): Promise<ToolResult> {
  const force = argv.includes("--force");
  const args = argv.filter((a) => a !== "--force");
  const [command, rawName, ...extra] = args;
  const needsName = ["show", "reset-password", "reset-recovery", "disable", "enable", "logout-all"];
  if (!command || (command !== "list" && !needsName.includes(command)))
    return fail(1, command ? `Lệnh lạ: ${command}` : "Thiếu lệnh.", ...USAGE);
  if (
    extra.length > 0 ||
    (command === "list" && rawName !== undefined) ||
    (command !== "list" && !rawName)
  )
    return fail(1, "Sai số tham số.", ...USAGE);

  // Chỉ lệnh GHI cần server tắt; list / show chỉ đọc nên vẫn chạy được (có thể cũ hơn bộ nhớ của server)
  const writes = !["list", "show"].includes(command);
  if (writes && !force && (await deps.isServerUp()))
    return fail(
      2,
      "Server đang chạy (trả lời ở /health): hãy TẮT server rồi chạy lại.",
      "Bản file giữ chỉ mục tài khoản trong bộ nhớ của server; sửa tệp lúc đó sẽ bị server ghi đè.",
      "Chỉ dùng --force khi chắc chắn không có server nào dùng thư mục dữ liệu này.",
    );

  if (command === "list") {
    const all = await deps.accounts.all();
    return { code: 0, lines: [...all.map(describe), `Tổng: ${all.length} tài khoản.`] };
  }

  const u = validateUsername(rawName);
  const account = u.ok ? await deps.accounts.byUsername(u.value) : null;
  if (!account) return fail(1, `Không có tài khoản "${rawName}".`);
  const hash = deps.hash ?? ((s: string) => hashSecretScrypt(s));
  const name = account.username;

  switch (command) {
    case "show":
      return {
        code: 0,
        lines: [
          `Tên đăng nhập: ${account.username}`,
          `Đạo hiệu: ${account.name ?? "(chưa có)"}`,
          `Mã tài khoản (chân linh): ${account.id}`,
          `Ngày tạo: ${iso(account.createdAt)}`,
          `Đăng nhập cuối: ${iso(account.lastLoginAt)}`,
          `Trạng thái: ${account.disabled ? "ĐÃ KHOÁ" : "bình thường"}`,
        ],
      };
    case "reset-password": {
      const password = randomPassword();
      const recoveryCode = newRecoveryCode();
      const [passHash, recoveryHash] = await Promise.all([
        hash(password),
        hash(normalizeRecoveryCode(recoveryCode)!),
      ]);
      await deps.accounts.update(account.id, { passHash, recoveryHash });
      const n = await deps.sessions.deleteAllOf(account.id);
      return {
        code: 0,
        lines: [
          `Đã đặt lại mật khẩu của "${name}" và đăng xuất ${n} phiên.`,
          `  Mật khẩu tạm:      ${password}`,
          `  Mã khôi phục MỚI:  ${recoveryCode}   (mã cũ đã vô hiệu)`,
          "Hai giá trị trên chỉ hiện MỘT lần. Gửi cho người chơi qua kênh an toàn và nhắc họ lưu mã khôi phục.",
        ],
      };
    }
    case "reset-recovery": {
      const recoveryCode = newRecoveryCode();
      await deps.accounts.update(account.id, {
        recoveryHash: await hash(normalizeRecoveryCode(recoveryCode)!),
      });
      return {
        code: 0,
        lines: [
          `Đã đặt mã khôi phục MỚI cho "${name}" (mã cũ đã vô hiệu; mật khẩu và phiên giữ nguyên).`,
          `  Mã khôi phục MỚI:  ${recoveryCode}   (chỉ hiện MỘT lần)`,
        ],
      };
    }
    case "disable": {
      await deps.accounts.update(account.id, { disabled: true });
      const n = await deps.sessions.deleteAllOf(account.id);
      return { code: 0, lines: [`Đã khoá "${name}" và đăng xuất ${n} phiên.`] };
    }
    case "enable":
      await deps.accounts.update(account.id, { disabled: false });
      return { code: 0, lines: [`Đã mở khoá "${name}".`] };
    default: {
      const n = await deps.sessions.deleteAllOf(account.id);
      return { code: 0, lines: [`Đã đăng xuất "${name}" khỏi ${n} thiết bị.`] };
    }
  }
}

/** Server đang chạy? Hỏi `/health` trên cổng `PORT` (mặc định 2567); không trả lời trong 800 ms thì coi là tắt. */
async function serverIsUp(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(800),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  // Cùng cách server nạp cấu hình dev: .env.local ở gốc repo (PORT, DATA_DIR...)
  const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env.local");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const port = Number(process.env.PORT ?? 2567);
  const res = await runTool(process.argv.slice(2), {
    accounts: new FileAccountStore(accountsDir()),
    sessions: new FileSessionStore(sessionsDir()),
    isServerUp: () => serverIsUp(port),
  });
  for (const line of res.lines) (res.code === 0 ? console.log : console.error)(line);
  process.exit(res.code);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main();
}
