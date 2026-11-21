/**
 * Màn Ghi công cho GÓI TÀI NGUYÊN RIÊNG (QUYET_DINH_M3 mục 63, `docs/THIET_KE_GOI_TAI_NGUYEN_RIENG.md` mục 6): mỗi gói riêng đang dùng hiện tên + trang chính thức + giấy phép
 * (chuỗi do G cung cấp, đã qua `parsePrivatePackManifest` ở `packs.ts`). Gói riêng có thể CẤM phân phối lại nên không có trong `CREDITS.md` kèm hash; lời ghi công hiện ở đây, trong game.
 *
 * Chuỗi từ manifest là dữ liệu NGOÀI: chỉ gán bằng `textContent`, liên kết chỉ khi `isSafePrivatePackUrl` (`https:`, không `javascript:` / `data:`), luôn `rel="noopener noreferrer"`.
 * Tách `privateCreditLines` (thuần) khỏi `renderPrivateCredits` (DOM) để test ở môi trường node bằng tài liệu giả.
 */
import { isSafePrivatePackUrl } from "@tien-gioi/shared";
import type { PrivateCredit } from "./gfx/packs";

export interface PrivateCreditLine {
  /** Chữ hiện ra: `Tên · giấy phép: ...` (không có phần giấy phép nếu gói không khai). */
  text: string;
  /** Liên kết trang chính thức; `null` khi gói không khai hoặc URL không an toàn (khi đó chỉ hiện chữ). */
  href: string | null;
}

/** Dòng ghi công của danh sách gói (cùng tên gói thì gộp một dòng: hai gói của cùng một nguồn không cần ghi hai lần). Thuần. */
export function privateCreditLines(credits: readonly PrivateCredit[]): PrivateCreditLine[] {
  const seen = new Set<string>();
  const out: PrivateCreditLine[] = [];
  for (const c of credits) {
    const key = `${c.title}\u0000${c.url ?? ""}\u0000${c.license ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      text: c.license ? `${c.title} · giấy phép: ${c.license}` : c.title,
      href: isSafePrivatePackUrl(c.url) ? c.url : null,
    });
  }
  return out;
}

/** Phần DOM tối thiểu `renderPrivateCredits` cần (để test bằng đối tượng giả; trình duyệt thật truyền `document`). */
export interface CreditNode {
  textContent: string | null;
  hidden?: boolean;
  setAttribute(name: string, value: string): void;
  append(...children: unknown[]): void;
  replaceChildren(...children: unknown[]): void;
}
export interface CreditDoc {
  createElement(tag: "li" | "a"): CreditNode;
}

/**
 * Vẽ danh sách vào `list` (một `<ul>`), ẩn `box` (khối bọc, gồm câu dẫn) khi không có gói nào. Gọi lúc MỞ Cài đặt: danh sách phản ánh gói đang dùng vào lúc đó.
 * Trả số dòng đã vẽ.
 */
export function renderPrivateCredits(
  box: CreditNode,
  list: CreditNode,
  credits: readonly PrivateCredit[],
  doc: CreditDoc,
): number {
  const lines = privateCreditLines(credits);
  const items = lines.map((l) => {
    const li = doc.createElement("li");
    if (l.href === null) {
      li.textContent = l.text;
    } else {
      const a = doc.createElement("a");
      a.textContent = l.text;
      a.setAttribute("href", l.href);
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
      li.append(a);
    }
    return li;
  });
  list.replaceChildren(...items);
  box.hidden = items.length === 0;
  return items.length;
}
