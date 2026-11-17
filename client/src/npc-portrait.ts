/**
 * Chân dung NPC ở khung hội thoại (ảnh AI lô 3, gói tải theo nhu cầu `art:npc`; docs/art/PHONG_CACH_MINH_HOA.md mục 4b / 5c; M7.12 / #513).
 * Ảnh dự phòng là CHỮ: thiếu chân dung / gói chưa tải xong / lỗi thì hộp thoại giữ nguyên như cũ (tên + huy hiệu), không chỗ trống, không ảnh
 * vỡ (`art-image.ts` `showArtImage`). Chân dung vẽ NGƯỜI nên mặt khuất bóng theo luật prompt lô 3 (`NPC_FACE_CLAUSE`).
 *
 * `NPC_PORTRAITS` là DANH SÁCH CHÂN DUNG ĐÃ VÀO GAME: id NPC (`NPCS` của `shared/`) -> tên tệp trong `client/public/packs/art-npc/`. RỖNG
 * cho tới khi lô 3 có ảnh. Thêm một chân dung = một dòng ở đây CÙNG PR với ảnh, tệp nguồn `docs/art/nguon/<tên>.json`, mục ở `CREDITS.md`
 * và `npm run build:packs` (`npc-portrait.test.ts` bắt dòng trỏ tới tệp không có / NPC không có / tên lệch khỏi `NPC_PORTRAIT_BATCH`).
 */
import { showArtImage } from "./art-image";
import { artPackId, type PackController } from "./gfx/packs";
import { applyMapCard, type CardImg } from "./map-card";

/** Thư mục của gói `art:npc` trong `/packs/` (khớp `NPC_PORTRAIT_BATCH.dir` ở `client/scripts/art/prompt-rules.mjs`, test kiểm). */
export const NPC_PORTRAIT_DIR = "art-npc";

/** id NPC -> tên tệp chân dung (không kèm thư mục). Rỗng cho tới khi lô 3 vào game. */
export const NPC_PORTRAITS: Readonly<Record<string, string>> = {};

/** Ghi đè khi thử trong trình duyệt thật (`?debug` / DEV, `check-npc-portrait.mjs`); bản chạy thật không bao giờ có mục. */
const overrides = new Map<string, string>();

/** Đặt (hoặc xoá nếu `file` là `null`) tên tệp chân dung của một NPC, chỉ để thử. */
export function setNpcPortraitOverride(npcId: string, file: string | null): void {
  if (file === null) overrides.delete(npcId);
  else overrides.set(npcId, file);
}

export interface NpcPortraitTarget {
  packId: string;
  /** Đường dẫn tương đối trong `/packs/`, vd `art-npc/npc_duoc_su.webp`. */
  file: string;
}

/**
 * Gói + tệp chân dung của một NPC, hoặc `null` nếu chưa có. `npcId` đến từ tin hội thoại của máy chủ nên tra bằng `hasOwnProperty`
 * (`NPC_PORTRAITS["constructor"]` không phải `undefined`) và chỉ nhận tên tệp là chuỗi không rỗng, không có dấu `/`.
 */
export function npcPortraitTarget(
  npcId: unknown,
  portraits: Readonly<Record<string, string>> = NPC_PORTRAITS,
): NpcPortraitTarget | null {
  if (typeof npcId !== "string") return null;
  let file: unknown = overrides.get(npcId);
  if (file === undefined) {
    if (!Object.prototype.hasOwnProperty.call(portraits, npcId)) return null;
    file = portraits[npcId];
  }
  if (typeof file !== "string" || file.length === 0 || file.includes("/")) return null;
  return { packId: artPackId("npc"), file: `${NPC_PORTRAIT_DIR}/${file}` };
}

/**
 * Ô chân dung của khung hội thoại. `show(npcId)` được gọi MỖI LẦN hộp thoại vẽ lại (đổi lời, đổi lựa chọn) nên cùng một NPC thì GIỮ NGUYÊN ảnh
 * (không ẩn rồi hiện lại: chớp); đổi NPC thì dọn yêu cầu cũ và ẩn ngay nếu NPC mới không có chân dung. `clear()` lúc đóng hộp thoại.
 */
export class NpcPortraitSlot {
  private shown: string | null = null;
  private cancel: (() => void) | null = null;

  constructor(
    private readonly img: CardImg,
    private readonly ctl?: PackController,
  ) {}

  show(npcId: string): void {
    if (this.shown === npcId) return;
    this.clear();
    this.shown = npcId;
    const target = npcPortraitTarget(npcId);
    if (target) this.cancel = showArtImage(this.img, { ...target, ctl: this.ctl });
  }

  clear(): void {
    this.cancel?.();
    this.cancel = null;
    this.shown = null;
    applyMapCard(this.img, null);
  }
}
