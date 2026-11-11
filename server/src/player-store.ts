// Kho lưu nhân vật (M3 bước 3b, docs/THIET_KE_TAI_KHOAN.md mục 6): giao diện để thay backend (file JSON hôm nay,
// PostgreSQL ở bước 3e) mà `WorldRoom` không biết. Cùng kiểu với `SoulStore` (`soul.ts`).
import { deletePlayer, loadPlayer, savePlayer, type SavedPlayer } from "./store";

export interface PlayerStore {
  /** Nhân vật theo đạo hiệu (không phân biệt hoa thường, NFC); chưa có thì `null`. */
  load(name: string): Promise<SavedPlayer | null>;
  /**
   * Ghi nhân vật. Các lần ghi cùng một nhân vật được xếp hàng: lần gọi sau luôn là bản cuối cùng; một lần lỗi không
   * chặn các lần sau (lỗi trả về cho chính lần gọi đó).
   */
  save(p: SavedPlayer): Promise<void>;
  /** Xoá nhân vật theo đạo hiệu; trả về true nếu có và đã xoá, false nếu không tìm thấy. */
  delete(name: string): Promise<boolean>;
}

/** Bản file JSON: `server/data/players/<sha1(tên)>.json`, đúng hành vi của `loadPlayer` / `savePlayer` ở `store.ts`. */
export class FilePlayerStore implements PlayerStore {
  load(name: string) {
    return loadPlayer(name);
  }
  save(p: SavedPlayer) {
    return savePlayer(p);
  }
  delete(name: string) {
    return deletePlayer(name);
  }
}

let shared: PlayerStore | undefined;
/** Kho nhân vật dùng chung của tiến trình (dựng lười như `defaultSoulStore`). */
export function defaultPlayerStore(): PlayerStore {
  return (shared ??= new FilePlayerStore());
}
