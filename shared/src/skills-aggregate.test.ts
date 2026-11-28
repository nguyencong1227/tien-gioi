// Các tệp dữ liệu chiêu theo nhóm (`skills-*.ts`, D / E / G) được GOM vào `LEARNABLE_SKILLS` và mọi nơi dùng nó (tra cứu, kinh quyển, sổ chiêu): thử bằng dữ liệu GIẢ
// nhét vào bốn tệp nhóm (dữ liệu thật còn rỗng ở khung nên không thể thử bằng chiêu thật). Mô-đun giả được thay trước khi `skills.ts` nhập.
import { describe, expect, it, vi } from "vitest";

const { fake } = vi.hoisted(() => ({
  fake: (id: string, element: string, extra: Record<string, unknown> = {}) => ({
    id,
    name: `Chiêu ${id}`,
    bookName: `Kinh ${id}`,
    desc: `Chiêu giả ${id} để thử việc gom dữ liệu các tệp nhóm vào danh sách chiêu học được.`,
    element,
    shape: "cone",
    cooldown: 3000,
    mpPct: 0.08,
    range: 90,
    arc: 1,
    mult: 1.2,
    effects: [],
    reqRealm: 1,
    reqTier: 0,
    rarity: 1,
    price: 80,
    fx: "slash_fire",
    ...extra,
  }),
}));

vi.mock("./skills-kim-tho", () => ({ SKILLS_KIM_THO: [fake("gia_kim_tho", "kim")] }));
vi.mock("./skills-moc-thuy", () => ({ SKILLS_MOC_THUY: [fake("gia_moc_thuy", "moc")] }));
vi.mock("./skills-hoa", () => ({
  SKILLS_HOA: [fake("gia_hoa", "hoa", { rarity: 3, reqRealm: 4 })],
}));
vi.mock("./skills-khac", () => ({ SKILLS_KHAC: [fake("gia_khac", "loi")] }));
vi.mock("./skills-dang-moi", () => ({ SKILLS_DANG_MOI: [fake("gia_dang_moi", "am")] }));
vi.mock("./skills-hoa-than", () => ({ SKILLS_HOA_THAN: [fake("gia_hoa_than", "tho")] }));

import {
  LEARNABLE_SKILLS,
  SKILLS_M7,
  SKILL_BY_ID,
  bookIdOf,
  sanitizeSkillBook,
  skillOf,
  skillViolations,
} from "./index";
import { SHOP_BOOK_IDS, SKILL_BOOK_ITEMS, SKILL_BOOK_VALUE } from "./books";

const IDS = ["gia_kim_tho", "gia_moc_thuy", "gia_hoa", "gia_khac", "gia_dang_moi", "gia_hoa_than"];

describe("LEARNABLE_SKILLS gom các tệp nhóm (dữ liệu giả)", () => {
  it("18 chiêu gốc đứng đầu, rồi sáu nhóm theo thứ tự Kim-Thổ, Mộc-Thủy, Hỏa, khác, dạng mới, Hóa Thần", () => {
    expect(LEARNABLE_SKILLS.length).toBe(SKILLS_M7.length + IDS.length);
    expect(LEARNABLE_SKILLS.slice(0, SKILLS_M7.length)).toEqual(SKILLS_M7);
    expect(LEARNABLE_SKILLS.slice(SKILLS_M7.length).map((s) => s.id)).toEqual(IDS);
  });

  it("tra cứu `skillOf` / `SKILL_BY_ID` thấy chiêu của MỌI tệp nhóm; id lạ / độc vẫn không", () => {
    for (const id of IDS) {
      expect(skillOf(id)?.id).toBe(id);
      expect(SKILL_BY_ID[id]).toBeDefined();
    }
    expect(skillOf("constructor")).toBeUndefined();
    expect(skillOf("khong_co")).toBeUndefined();
  });

  it("kinh quyển dựng cho từng chiêu của tệp nhóm (tên, độ hiếm, giá); chiêu cơ bản vào cửa hàng, chiêu hiếm thì không", () => {
    for (const id of IDS) {
      const book = SKILL_BOOK_ITEMS.find((b) => b.id === bookIdOf(id));
      expect(book?.teaches, id).toBe(id);
      expect(book?.name).toBe(`Kinh ${id}`);
      expect(SKILL_BOOK_VALUE[bookIdOf(id)]).toBe(40);
    }
    expect(SKILL_BOOK_ITEMS.length).toBe(LEARNABLE_SKILLS.length);
    expect(SHOP_BOOK_IDS).toContain(bookIdOf("gia_kim_tho")); // rarity 1: cửa hàng
    expect(SHOP_BOOK_IDS).not.toContain(bookIdOf("gia_hoa")); // rarity 3: chỉ rơi
  });

  it("sổ chiêu: đọc file lưu giữ chiêu của tệp nhóm đã học (kẹp tầng), bỏ chiêu lạ; ô gắn chiêu nhóm được giữ nếu ô đã mở", () => {
    const book = sanitizeSkillBook(
      {
        learned: { gia_moc_thuy: 2, gia_khac: 9, khong_co: 3 },
        slots: ["gia_moc_thuy", "", "", ""],
      },
      2,
    );
    expect(book.learned).toEqual({ gia_moc_thuy: 2, gia_khac: 3 }); // tầng 9 kẹp về tối đa
    expect(book.slots[0]).toBe("gia_moc_thuy");
  });

  it("skillViolations mặc định đọc LEARNABLE_SKILLS: dữ liệu giả hợp lệ; thêm lỗi vào một tệp nhóm thì bị bắt", () => {
    expect(skillViolations()).toEqual([]);
    expect(
      skillViolations([...LEARNABLE_SKILLS, { ...LEARNABLE_SKILLS.at(-1)! }]).join("\n"),
    ).toMatch(/trùng id/);
  });
});
