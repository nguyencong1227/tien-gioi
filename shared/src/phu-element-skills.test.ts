// Bất biến #1087: MỌI phù tăng sát thương `amp_<hệ>` (Bàn phù chế) phải có ít nhất MỘT chiêu HỌC ĐƯỢC cùng hệ.
// Nếu không, người chơi bỏ Linh thạch + nguyên liệu chế phù rồi phù KHÔNG tăng sát thương gì — "phù CHẾT", đúng lỗi
// `phu_loi_loino` (amp_loi) từng mắc trước khi CT8 thêm chiêu hệ Lôi vào `LEARNABLE_SKILLS`. Test ĐỎ nếu ai thêm phù
// cho một hệ chưa có chiêu học được, hoặc xoá hết chiêu của một hệ đang có phù.
import { describe, expect, it } from "vitest";
import { ITEM_BY_ID, LEARNABLE_SKILLS, ampElementOf, type ItemDef } from "./index";

/** Phù tăng sát thương `amp_<hệ>`: consumable, effect kind `status`, id bắt đầu bằng `amp_`. */
type AmpPhu = ItemDef & { effect: { kind: "status"; id: string; ratio: number; ms: number } };

function isAmpPhu(item: ItemDef): item is AmpPhu {
  return (
    item.type === "consumable" &&
    item.effect != null &&
    item.effect.kind === "status" &&
    typeof item.effect.id === "string" &&
    item.effect.id.startsWith("amp_")
  );
}

/** Mọi phù tăng sát thương `amp_<hệ>` trong bảng vật phẩm. */
const AMP_PHU = Object.values(ITEM_BY_ID).filter(isAmpPhu);

/** Mọi hệ đã có chiêu học được — bất biến yêu cầu mỗi hệ có phù `amp_<hệ>` phải nằm trong đây. */
const ELEMENTS_WITH_LEARNABLE_SKILL = new Set(LEARNABLE_SKILLS.map((s) => s.element));

describe("bất biến phù hệ (#1087): mọi amp_<hệ> có chiêu học được cùng hệ", () => {
  it("có phù amp để test có nghĩa (KHÔNG rỗng)", () => {
    expect(AMP_PHU.length, "không tìm thấy phù amp_<hệ> nào").toBeGreaterThan(0);
  });

  it("mọi phù amp_<hệ>: hệ của phù có >= 1 chiêu học được (KHÔNG có phù CHẾT)", () => {
    for (const item of AMP_PHU) {
      const el = ampElementOf(item.effect.id);
      expect(el, `${item.id}: hệ của phù "${item.effect.id}" không xác định`).toBeDefined();
      expect(
        ELEMENTS_WITH_LEARNABLE_SKILL.has(el!),
        `${item.id}: hệ "${el}" KHÔNG có chiêu học được -> phù CHẾT. Thêm chiêu hệ "${el}" vào LEARNABLE_SKILLS.`,
      ).toBe(true);
    }
  });

  it("phù Lôi (phu_loi_loino) KHÔNG còn là phù CHẾT: hệ loi đã có chiêu học được", () => {
    // Kiểm điểm riêng lỗi gốc #1087 — rõ ràng hơn là chỉ duyệt bảng.
    expect(ELEMENTS_WITH_LEARNABLE_SKILL.has("loi"), "hệ loi phải có chiêu học được").toBe(true);
    const loiPhu = AMP_PHU.find((item) => item.effect.id === "amp_loi");
    expect(loiPhu, "phu_loi_loino phải là phù amp_loi").toBeDefined();
  });
});

// ĐỘT BIẾN ĐỎ (issue #1087 "test cần có"): các luật trên KHÓA dữ liệu thật. Dã tự chạy đột biến (mutate -> ĐỎ ->
// `git checkout --` phục hồi) trước commit, dán kết quả vào PR. Ba đột biến tối thiểu (đã chạy, tất cả ĐỎ đúng dòng):
//   (a) lọc bỏ mọi chiêu hệ `loi` khỏi LEARNABLE_SKILLS -> phu_loi_loino (amp_loi) không còn chiêu -> luật 2 + luật 3 ĐỎ
//       (đúng lỗi gốc #1087: phù Lôi trở lại thành phù CHẾT).
//   (b) thêm phù `phu_bang_mutation` (amp_bang) + lọc bỏ mọi chiêu Băng -> luật 2 ĐỎ (phù mới cho hệ không có chiêu).
//   (c) đổi `phu_loi_loino` effect.id `amp_loi` -> `amp_kim` (không còn phù amp_loi) -> luật 3 ĐỎ: chốt rằng lỗi gốc
//       được sửa bằng THÊM chiêu Lôi, KHÔNG phải bằng cách xoá / làm mất phù (luật 2 chỉ quét phù còn lại).
