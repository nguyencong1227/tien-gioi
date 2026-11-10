// Chọn backend lưu trữ (M3 bước 3e-2, docs/THIET_KE_TAI_KHOAN.md mục 6): `STORE=file` (mặc định, dev / test / bot / bench, không
// cần dịch vụ ngoài) hoặc `STORE=pg` (PostgreSQL qua `DATABASE_URL`, backend cho môi trường thật). Một nơi duy nhất dựng cả
// năm kho (nhân vật, chân linh, tông môn, tài khoản, phiên) để cùng một backend cho mọi thứ: không có chuyện nhân vật ở Postgres mà
// phiên ở tệp.
import {
  defaultAccountStore,
  defaultSessionStore,
  type AccountStore,
  type SessionStore,
} from "./account-store";
import { PgAccountStore, PgSessionStore } from "./pg/account-store";
import { createPool, type Db } from "./pg/db";
import { PgPlayerStore, PgSoulStore } from "./pg/game-store";
import { migrate } from "./pg/migrate";
import { PgSectStore } from "./pg/sect-store";
import { defaultPlayerStore, type PlayerStore } from "./player-store";
import { defaultSectStore, type SectStore } from "./sect-store";
import { defaultSoulStore, type SoulStore } from "./soul";

export type StoreKind = "file" | "pg";

/** `STORE=pg` bật PostgreSQL; mọi giá trị khác (kể cả không đặt) là `file`. */
export function storeKindOf(env: NodeJS.ProcessEnv): StoreKind {
  return env.STORE === "pg" ? "pg" : "file";
}

export interface Stores {
  kind: StoreKind;
  players: PlayerStore;
  souls: SoulStore;
  /** Tông môn (M3.6, 6b) */
  sects: SectStore;
  accounts: AccountStore;
  sessions: SessionStore;
  /** Đóng kết nối (pool Postgres); bản file không làm gì. */
  close(): Promise<void>;
}

/**
 * Dựng năm kho theo `STORE`. `pg`: cần `DATABASE_URL` (thiếu thì ném lỗi rõ ràng, KHÔNG in URL vì có mật khẩu), tạo pool, chạy
 * migration chưa áp dụng rồi trả các `Pg*Store`. `opts.db` để test tiêm một DB (pg-mem) thay cho pool thật.
 */
export async function createStores(
  env: NodeJS.ProcessEnv,
  opts: { db?: Db & { end?(): Promise<void> } } = {},
): Promise<Stores> {
  if (storeKindOf(env) === "file") {
    return {
      kind: "file",
      players: defaultPlayerStore(),
      souls: defaultSoulStore(),
      sects: defaultSectStore(),
      accounts: defaultAccountStore(),
      sessions: defaultSessionStore(),
      close: async () => {},
    };
  }
  const db = opts.db ?? (await openPool(env));
  try {
    const { applied } = await migrate(db);
    if (applied.length > 0) console.log(`[pg] đã áp dụng migration: ${applied.join(", ")}`);
  } catch (e) {
    await db.end?.().catch(() => {});
    // Cố ý KHÔNG gắn `cause`: lỗi gốc của driver có thể chứa chuỗi kết nối (mật khẩu) và ai đó sẽ in cả đối tượng lỗi
    // eslint-disable-next-line preserve-caught-error
    throw new Error(`Không chạy được migration PostgreSQL: ${errorName(e)}`);
  }
  return {
    kind: "pg",
    players: new PgPlayerStore(db),
    souls: new PgSoulStore(db),
    sects: new PgSectStore(db),
    accounts: new PgAccountStore(db),
    sessions: new PgSessionStore(db),
    close: async () => {
      await db.end?.();
    },
  };
}

async function openPool(env: NodeJS.ProcessEnv): Promise<Db & { end(): Promise<void> }> {
  const url = env.DATABASE_URL?.trim();
  if (!url)
    throw new Error(
      "STORE=pg cần biến môi trường DATABASE_URL (vd postgres://người_dùng:mật_khẩu@máy:5432/tiengioi).",
    );
  return createPool(url);
}

/** Tên lỗi + mã (không kèm thông báo: thông báo của driver có thể chứa chuỗi kết nối / địa chỉ máy chủ). */
function errorName(e: unknown): string {
  const err = e as { name?: string; code?: string } | null;
  return `${err?.name ?? "Error"}${err?.code ? ` (${err.code})` : ""}`;
}
