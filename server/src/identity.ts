// Danh tính của người chơi sau `onAuth` (M3 bước 3b, docs/THIET_KE_TAI_KHOAN.md mục 5): mọi chỗ sau đó chỉ thấy
// `Identity`, không biết đăng nhập kiểu nào. Chế độ cũ (tên + mã bí mật): khoá linh hồn là tên. Chế độ tài khoản (3c):
// `accountId` và khoá linh hồn là `accountId`.
import { soulIdOf } from "./soul";

export interface Identity {
  /** Đạo hiệu đã chuẩn hoá (`cleanName`) */
  name: string;
  /** Khoá chân linh trong `SoulStore` */
  soulKey: string;
  /** Có khi đăng nhập bằng tài khoản (bước 3c) */
  accountId?: string;
}

/** Đăng nhập kiểu cũ (tên + mã bí mật): chân linh khoá theo tên. */
export function legacyIdentity(name: string): Identity {
  return { name, soulKey: soulIdOf(name) };
}
