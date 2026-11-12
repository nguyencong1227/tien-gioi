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
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateUsername } from "@tien-gioi/shared";
import {
  nameKeyOf,
  type AccountRecord,
  type AccountStore,
  type SessionStore,
} from "../src/account-store.js";
import { hashSecretScrypt, newRecoveryCode, normalizeRecoveryCode } from "../src/auth.js";
import { type PlayerStore } from "../src/player-store.js";
import { soulIdOf, type SoulStore } from "../src/soul.js";
import { type SectStore } from "../src/sect-store.js";
import { audit, startAudit } from "../src/audit.js";
import { createStores } from "../src/stores.js";
import { assertNotProd } from "./assert-not-prod.js";

export interface ToolDeps {
  accounts: AccountStore;
  sessions: SessionStore;
  players?: PlayerStore;
  souls?: SoulStore;
  sects?: SectStore;
  /** Server đang chạy (trả lời ở `/health`)? */
  isServerUp: () => Promise<boolean>;
  /**
   * Lệnh ghi có bắt buộc TẮT server không (mặc định có). Bản file: có (chỉ mục trong bộ nhớ server). PostgreSQL: không,
   * mọi thay đổi đi qua DB nên server đang chạy vẫn thấy ngay.
   */
  serverMustBeOff?: boolean;
  /** Băm mật khẩu / mã khôi phục (mặc định scrypt thật); test truyền bản rẻ */
  hash?: (secret: string) => Promise<string>;
  /** Kiểm tra tài khoản hoặc nhân vật có đang trực tuyến không */
  isOnline?: (account: AccountRecord) => Promise<boolean> | boolean;
  /** Hàm ghi kiểm toán (mặc định audit từ audit.ts) */
  auditFn?: (ev: string, fields?: Record<string, unknown>) => void;
}

export interface ToolResult {
  code: number;
  lines: string[];
}

export const USAGE = [
  "Cách dùng: npm run tai-khoan -w server -- <lệnh> [tên đăng nhập] [--thu] [--yes] [--force]",
  "  list                          liệt kê tài khoản (không có băm / token)",
  "  show <tên>                    chi tiết một tài khoản",
  "  reset-password <tên>          đặt mật khẩu tạm ngẫu nhiên + mã khôi phục MỚI, đăng xuất mọi thiết bị",
  "  reset-recovery <tên>          đặt mã khôi phục MỚI (mật khẩu và phiên giữ nguyên)",
  "  disable <tên>                 khoá tài khoản và đăng xuất mọi thiết bị",
  "  enable <tên>                  mở khoá",
  "  logout-all <tên>              đăng xuất mọi thiết bị",
  "  xoa <tên> [--thu] [--yes]     xoá vĩnh viễn tài khoản (mặc định chạy thử; --yes để xoá thật)",
  "Với STORE=file phải TẮT server trước lệnh ghi (--force để bỏ qua, chỉ khi chắc chắn); STORE=pg không cần.",
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
  const isConfirmed = argv.includes("--yes");
  const args = argv.filter((a) => !["--force", "--thu", "--yes"].includes(a));
  const [command, rawName, ...extra] = args;
  const needsName = [
    "show",
    "reset-password",
    "reset-recovery",
    "disable",
    "enable",
    "logout-all",
    "xoa",
  ];
  if (!command || (command !== "list" && !needsName.includes(command)))
    return fail(1, command ? `Lệnh lạ: ${command}` : "Thiếu lệnh.", ...USAGE);
  if (
    extra.length > 0 ||
    (command === "list" && rawName !== undefined) ||
    (command !== "list" && !rawName)
  )
    return fail(1, "Sai số tham số.", ...USAGE);

  // Chỉ lệnh GHI cần server tắt; list / show và xoa ở chế độ chạy thử chỉ đọc nên vẫn chạy được.
  // Riêng lệnh xoa thật (--yes): BẮT BUỘC server phải tắt ở cả hai kho (file và pg) để tránh nhân vật trong RAM sống lại.
  const writes = !["list", "show"].includes(command) && (command !== "xoa" || isConfirmed);
  const mustBeOff = command === "xoa" && isConfirmed ? true : (deps.serverMustBeOff ?? true);
  if (writes && !force && mustBeOff && (await deps.isServerUp()))
    return fail(
      2,
      "Server đang chạy (trả lời ở /health): hãy TẮT server rồi chạy lại.",
      command === "xoa"
        ? "Xoá khi server đang chạy có thể làm dữ liệu nhân vật trong bộ nhớ sống lại ở lần lưu kế tiếp."
        : "Bản file giữ chỉ mục tài khoản trong bộ nhớ của server; sửa tệp lúc đó sẽ bị server ghi đè.",
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
    case "xoa": {
      // 1. Kiểm tra trực tuyến
      if (deps.isOnline && (await deps.isOnline(account))) {
        return fail(1, `Tài khoản "${name}" đang trực tuyến: không xoá lúc có phiên vào phòng.`);
      }

      // 2. Kiểm tra tông môn
      let sect = deps.sects ? await deps.sects.findBySoul(account.id) : null;
      let soulKeyInSect = account.id;
      if (!sect && deps.sects && account.name) {
        sect = await deps.sects.findBySoul(nameKeyOf(account.name));
        if (sect) soulKeyInSect = nameKeyOf(account.name);
      }

      let sectAction: "none" | "remove_member" | "disband" = "none";
      if (sect) {
        const isLeader =
          sect.leader === soulKeyInSect ||
          sect.members.some((m) => m.soulKey === soulKeyInSect && m.rank === "chu");

        if (isLeader) {
          if (sect.members.length > 1) {
            return fail(
              1,
              `Tài khoản "${name}" là Tông chủ của tông môn "${sect.name}" còn ${sect.members.length - 1} thành viên khác: phải chuyển quyền hoặc giải tán tông môn trước.`,
            );
          }
          if (sect.coin > 0) {
            return fail(
              1,
              `Tông môn "${sect.name}" còn ${sect.coin} Linh thạch trong kho: hãy rút hết Linh thạch trước khi xoá để tránh mất quỹ mồ côi.`,
            );
          }
          sectAction = "disband";
        } else {
          sectAction = "remove_member";
        }
      }

      // 3. Kiểm tra các dữ liệu sẽ xoá
      const hasPlayer =
        deps.players && account.name ? (await deps.players.load(account.name)) !== null : false;
      const hasSoul = deps.souls ? (await deps.souls.get(account.id)) !== null : false;

      // Nếu không có --yes: Chạy thử (Dry-run)
      if (!isConfirmed) {
        const lines = [
          `[CHẠY THỬ] Kế hoạch xoá dữ liệu người chơi cho tài khoản "${name}":`,
          `  - Tài khoản:        ID ${account.id} (tạo ${iso(account.createdAt)})`,
          `  - Đạo hiệu:         ${account.name ? `"${account.name}"` : "(chưa có)"}`,
          `  - Hồ sơ nhân vật:   ${hasPlayer ? `có (đạo hiệu "${account.name}")` : "(không có hoặc đã dọn)"}`,
          `  - Chân linh:        ${hasSoul ? `có (ID ${account.id})` : "(không có hoặc đã dọn)"}`,
          `  - Phiên đăng nhập:  thu hồi toàn bộ phiên hoạt động`,
        ];
        if (sectAction === "disband") {
          lines.push(
            `  - Tông môn:         giải tán tông môn "${sect!.name}" (Tông chủ một mình, kho 0 Linh thạch)`,
          );
        } else if (sectAction === "remove_member") {
          lines.push(`  - Tông môn:         gỡ khỏi danh sách thành viên tông môn "${sect!.name}"`);
        } else {
          lines.push(`  - Tông môn:         không tham gia tông môn nào`);
        }
        lines.push(
          "",
          "Chưa thay đổi gì trên hệ thống.",
          "Để xoá THẬT (thao tác không thể hoàn tác), hãy chạy lại với cờ --yes:",
          `  npm run tai-khoan -w server -- xoa ${name} --yes`,
        );
        return { code: 0, lines };
      }

      // 4. Xoá THẬT khi có --yes
      // 4.1 Xoá phiên
      const deletedSessions = await deps.sessions.deleteAllOf(account.id);

      // 4.2 Xử lý tông môn
      let sectMsg = "  - Tông môn: không tham gia";
      if (deps.sects && sect) {
        if (sectAction === "disband") {
          const ok = await deps.sects.delete(sect.id, (s) => s.coin === 0);
          sectMsg = ok
            ? `  - Tông môn: đã giải tán tông môn "${sect.name}"`
            : `  - Tông môn: không thể giải tán "${sect.name}" (kho đã thay đổi)`;
        } else if (sectAction === "remove_member") {
          await deps.sects.update(sect.id, (s) => ({
            ...s,
            members: s.members.filter((m) => m.soulKey !== soulKeyInSect),
          }));
          sectMsg = `  - Tông môn: đã gỡ khỏi tông môn "${sect.name}"`;
        }
      }

      // 4.3 Xoá nhân vật
      let charMsg = "  - Hồ sơ nhân vật: không có";
      if (deps.players && account.name) {
        const ok = await deps.players.delete(account.name);
        charMsg = `  - Hồ sơ nhân vật: ${ok ? "đã xoá" : "không tìm thấy tệp"}`;
      }

      // 4.4 Xoá chân linh
      let soulMsg = "  - Chân linh: không có";
      if (deps.souls) {
        const ok1 = await deps.souls.delete(account.id);
        let ok2 = false;
        if (account.name && soulIdOf(account.name) !== account.id) {
          ok2 = await deps.souls.delete(soulIdOf(account.name));
        }
        soulMsg = `  - Chân linh: ${ok1 || ok2 ? "đã xoá" : "không tìm thấy tệp"}`;
      }

      // 4.5 Xoá tài khoản
      const accDeleted = await deps.accounts.delete(account.id);

      // 4.6 Ghi kiểm toán
      const userDigest = createHash("sha256").update(name).digest("hex").slice(0, 16);
      const auditFn = deps.auditFn ?? audit;
      auditFn("account.deleted", {
        id: account.id,
        userDigest,
        character: account.name ?? null,
        sessions: deletedSessions,
      });

      return {
        code: 0,
        lines: [
          `Đã xoá vĩnh viễn tài khoản "${name}":`,
          `  - Tài khoản: ID ${account.id} (${accDeleted ? "đã xoá" : "không tìm thấy"})`,
          `  - Phiên: đã thu hồi ${deletedSessions} phiên`,
          charMsg,
          soulMsg,
          sectMsg,
          `  - Nhật ký kiểm toán: đã ghi nhận sự kiện "account.deleted" (userDigest: ${userDigest})`,
        ],
      };
    }
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
  // Cùng cách server nạp cấu hình dev: .env.local ở gốc repo (PORT, STORE, DATABASE_URL...)
  const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env.local");
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  // Hàng rào bảo vệ (Issue #299, #321): Bỏ qua KHI VÀ CHỈ KHI TIEN_GIOI_PROD === "1"
  if (process.env.TIEN_GIOI_PROD !== "1") {
    try {
      assertNotProd(process.env.DATA_DIR, "tai-khoan");
      assertNotProd(process.env.DATABASE_URL, "tai-khoan");
      const port = Number(process.env.PORT ?? 2587);
      assertNotProd(port, "tai-khoan");
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  }

  const port = Number(process.env.PORT ?? (process.env.TIEN_GIOI_PROD === "1" ? 2567 : 2587));
  startAudit(process.env);
  let code = 1;
  let stores: Awaited<ReturnType<typeof createStores>> | undefined;
  try {
    stores = await createStores(process.env);
    const res = await runTool(process.argv.slice(2), {
      accounts: stores.accounts,
      sessions: stores.sessions,
      players: stores.players,
      souls: stores.souls,
      sects: stores.sects,
      isServerUp: () => serverIsUp(port),
      serverMustBeOff: stores.kind === "file",
    });
    for (const line of res.lines) (res.code === 0 ? console.log : console.error)(line);
    code = res.code;
  } catch (e) {
    // Chỉ tên lỗi cấu hình / kết nối (thông báo của driver có thể chứa chuỗi kết nối)
    console.error(`Không chạy được: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await stores?.close().catch(() => {});
  }
  process.exit(code);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main();
}
