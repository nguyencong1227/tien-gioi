// Chân linh (linh hồn) tách khỏi nhân vật của kiếp (M3 bước 2, docs/THIET_KE_LUAN_HOI.md mục 3).
// `SoulStore` là giao diện lưu trữ để bước 3 thay bằng PostgreSQL mà không đụng hệ thống game; hôm nay là file JSON.
// Dữ liệu chân linh là dữ liệu riêng của server: không vào state chung, chỉ gửi cho chủ khi có sự kiện.
import { promises as fs } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { newSoul, sanitizeSoul, type Soul } from "@tien-gioi/shared";

/** Khoá chân linh: đạo hiệu chuẩn hoá (cùng cách `store.ts` đặt tên file nhân vật). Bước 3 đổi thành id tài khoản. */
export function soulIdOf(name: string): string {
  return name.normalize("NFC").toLowerCase();
}

export interface SoulStore {
  /** Đọc chân linh; `null` nếu chưa có (hoặc file hỏng đã được cách ly, xem `FileSoulStore`). */
  get(id: string): Promise<Soul | null>;
  /** Có rồi thì trả về, chưa có thì tạo (qua `init` nếu muốn đặt giá trị đầu) và lưu. */
  create(id: string, init?: (s: Soul) => Soul): Promise<Soul>;
  /**
   * Đọc - sửa - ghi **nguyên tử** theo từng chân linh (hàng đợi riêng cho mỗi id): các lần cập nhật cùng lúc chạy lần lượt,
   * không mất lần nào. `fn` phải thuần (không I/O). Chưa có chân linh thì tạo mới trước khi áp `fn`. `fn` ném lỗi thì
   * không ghi gì và các lần sau vẫn chạy.
   */
  update(id: string, fn: (s: Soul) => Soul): Promise<Soul>;
  /** Xoá chân linh theo id; trả về true nếu có và đã xoá, false nếu không tìm thấy. */
  delete(id: string): Promise<boolean>;
}

/**
 * Lưu mỗi chân linh một file `<sha1(id)>.json` (ghi tệp tạm rồi `rename`, như `store.ts`). Mặc định nằm trong thư mục
 * con `souls/` của `DATA_DIR`: cùng volume Docker và cùng bản sao lưu với hồ sơ nhân vật, còn `kiem-save` (chỉ đọc
 * `*.json` ở cấp trên cùng) không nhầm với hồ sơ nhân vật.
 */
export class FileSoulStore implements SoulStore {
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly dir: string,
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  private fileOf(id: string) {
    return path.join(this.dir, `${createHash("sha1").update(id).digest("hex")}.json`);
  }

  /**
   * Đọc và làm sạch. File hỏng (không phải JSON / không phải object) KHÔNG bị bỏ đi hay ghi đè: đổi tên thành
   * `*.hong-<giờ>` để người vận hành khôi phục, rồi coi như chưa có (tạo mới). Mất Duyên vì một lỗi đĩa còn hơn mất dấu.
   */
  private async read(id: string): Promise<Soul | null> {
    const file = this.fileOf(id);
    let text: string;
    try {
      text = await fs.readFile(file, "utf8");
    } catch (e: any) {
      if (e?.code === "ENOENT") return null;
      throw e;
    }
    let soul: Soul | null;
    try {
      soul = sanitizeSoul(JSON.parse(text), this.clock());
    } catch {
      soul = null;
    }
    if (soul) return { ...soul, id };
    // Hậu tố có phần ngẫu nhiên: hai lần cách ly trong cùng một mili giây không được ghi đè lên nhau
    const moved = `${file}.hong-${Date.now()}-${randomBytes(3).toString("hex")}`;
    console.error(`[soul] file chân linh hỏng, đã cách ly: ${moved}`);
    await fs.rename(file, moved).catch(() => {});
    return null;
  }

  private async write(soul: Soul) {
    await fs.mkdir(this.dir, { recursive: true });
    const file = this.fileOf(soul.id);
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(soul, null, 1));
    await fs.rename(tmp, file);
  }

  /** Xếp hàng theo id: một lần lỗi không chặn các lần sau, lỗi chỉ trả về cho người gọi. */
  private enqueue<T>(id: string, run: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(id) ?? Promise.resolve();
    const next = prev.then(run, run);
    this.queues.set(id, next);
    const done = () => {
      if (this.queues.get(id) === next) this.queues.delete(id);
    };
    next.then(done, done);
    return next;
  }

  get(id: string) {
    return this.enqueue(id, () => this.read(id));
  }

  create(id: string, init?: (s: Soul) => Soul) {
    return this.enqueue(id, async () => {
      const cur = await this.read(id);
      if (cur) return cur;
      let soul = newSoul(id, this.clock());
      if (init) soul = { ...init(soul), id };
      await this.write(soul);
      return soul;
    });
  }

  update(id: string, fn: (s: Soul) => Soul) {
    return this.enqueue(id, async () => {
      const cur = (await this.read(id)) ?? newSoul(id, this.clock());
      const next: Soul = { ...fn(cur), id, updatedAt: this.clock() };
      await this.write(next);
      return next;
    });
  }

  delete(id: string) {
    return this.enqueue(id, async () => {
      const file = this.fileOf(id);
      try {
        await fs.unlink(file);
        return true;
      } catch (e: any) {
        if (e?.code === "ENOENT") return false;
        throw e;
      }
    });
  }
}

/** Thư mục chân linh: `SOULS_DIR`, không có thì `<DATA_DIR>/souls`. */
export function soulsDir(): string {
  if (process.env.SOULS_DIR) return path.resolve(process.env.SOULS_DIR);
  return path.join(path.resolve(process.env.DATA_DIR ?? "data/players"), "souls");
}

let shared: SoulStore | undefined;
/** Kho chân linh dùng chung của tiến trình (dựng lười để `DATA_DIR` do test đặt trước khi nạp module có hiệu lực). */
export function defaultSoulStore(): SoulStore {
  return (shared ??= new FileSoulStore(soulsDir()));
}
