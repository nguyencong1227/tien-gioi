// Test + đột biến cho bộ từ cấm (issue #1199; sửa theo mục 75 / #1462): bannedViolations bắt tên riêng của truyện /
// game KHÁC và từ hiện đại lạc văn phong trong NỘI DUNG GAME, KHÔNG báo oan chữ hợp lệ (ranh giới từ, chữ thường hợp
// lệ) và KHÔNG cấm tên của Vạn Kiếp Tu Tiên (được dùng từ mục 75). Mỗi quy tắc có ca chứng minh đỏ khi mã sai
// (đột biến): bỏ hoa thường -> "hàn lập" đỏ; bỏ ranh giới -> "book" đỏ; chèn lại "Huyền Vũ Môn" -> ca mục 75 đỏ; v.v.
import { describe, expect, it } from "vitest";
import { BANNED_TERMS, bannedViolations } from "./glossary-banned";
import { LEARNABLE_SKILLS } from "./skills";

describe("bannedViolations — từ cấm (tên riêng khác truyện + từ hiện đại)", () => {
  it("dữ liệu: mọi mục có term + reason khác rỗng, term duy nhất", () => {
    expect(BANNED_TERMS.length).toBeGreaterThan(0);
    for (const b of BANNED_TERMS) {
      expect(b.term.trim().length, `term rỗng: ${JSON.stringify(b)}`).toBeGreaterThan(0);
      expect(b.reason.trim().length, `reason rỗng: ${b.term}`).toBeGreaterThan(0);
    }
    const terms = BANNED_TERMS.map((b) => b.term.toLowerCase());
    expect(new Set(terms).size, "trùng term (không phân biệt hoa thường)").toBe(terms.length);
  });

  it("bắt tên riêng truyện khác ở mọi casing (đột biến: bỏ cờ `i` / `toLowerCase` -> 'hàn lập' / 'HÀN LẬP' đỏ)", () => {
    for (const variant of ["Hàn Lập", "hàn lập", "HÀN LẬP", "hÀN lẬP"]) {
      const v = bannedViolations(`Đồ này đến từ ${variant} ngày xưa.`);
      expect(v.length, variant).toBe(1);
      expect(v[0], variant).toContain(variant); // báo đúng chữ thấy (nguyên văn trong ngữ cảnh)
      expect(v[0]).toContain("nhân vật của tiên hiệp khác"); // lý do in ra
    }
  });

  it("mục 75 (#1462): tên Vạn Kiếp Tu Tiên KHÔNG còn bị cấm (đột biến: chèn lại 'Huyền Vũ Môn' vào BANNED_TERMS -> đỏ)", () => {
    // Cốt truyện / địa danh / nhân vật / quốc gia / tông phái của Vạn Kiếp được dùng từ 25/11/2026 (AGENTS.md Asset nguồn 3).
    for (const name of [
      "Thanh Vân Môn",
      "Thanh Vân Kiếm Tông",
      "Bắc Minh",
      "Huyền Vũ Môn",
      "Kim Đạo Tự",
      "Đan Hà Cốc",
      "Đại Ung",
      "Lương Quốc",
      "Thiên Môn",
      "Lão Đò",
    ]) {
      expect(bannedViolations(`Ta từng tu tại ${name}.`), name).toEqual([]);
      expect(bannedViolations(`ta từng tu tại ${name.toLowerCase()}.`), name).toEqual([]);
    }
    // Danh sách cấm không còn chứa dòng nào nhắc tên các tông phái ấy (kiểm cả mục, không chỉ kết quả quét).
    const terms = BANNED_TERMS.map((b) => b.term.toLowerCase());
    for (const gone of [
      "thanh vân môn",
      "thanh vân kiếm tông",
      "bắc minh",
      "huyền vũ môn",
      "kim đạo tự",
      "đan hà cốc",
    ])
      expect(terms, gone).not.toContain(gone);
    // Lý do còn lại không dựng trên "Vạn Kiếp Tu Tiên" (chỉ truyện / game KHÁC).
    for (const b of BANNED_TERMS) expect(b.reason, b.term).not.toContain("của Vạn Kiếp Tu Tiên");
  });

  it("vẫn bắt tên của truyện / game khác khi chèn vào chuỗi có tên Vạn Kiếp (không bị che)", () => {
    // Đột biến: nếu bộ cấm bị vô hiệu hoá hẳn (trả [] sau khi gỡ tên Vạn Kiếp) thì ca này đỏ.
    const v = bannedViolations("Huyền Vũ Môn và Hàn Lập cùng đến Bắc Minh.");
    expect(v.length).toBe(1);
    expect(v[0]).toContain("'Hàn Lập'");
  });

  it("từ hiện đại: bắt + gợi ý thay thế (đột biến: bỏ suggest -> dòng thiếu '-> dùng' đỏ)", () => {
    const v = bannedViolations("Ok, ta sẽ giúp ngươi reach level cao hơn, đừng sợ boss.");
    // "Ok" + "level" + "boss" = 3 vi phạm; "reach" KHÔNG cấm.
    expect(v.length).toBe(3);
    for (const line of v) expect(line).toContain("-> dùng"); // mọi từ hiện đại có gợi ý
    expect(v.some((l) => l.includes("'Ok'"))).toBe(true);
    expect(v.some((l) => l.includes("'level'"))).toBe(true);
    expect(v.some((l) => l.includes("'boss'"))).toBe(true);
  });

  it("KHÔNG báo oan chữ hợp lệ chứa chuỗi con (đột biến: bỏ ranh giới từ -> 'book' / 'lập' / 'cấp' đỏ)", () => {
    // "ok" KHÔNG bám "book" hay "OKA"; "hàn" / "lập" riêng lẻ hợp lệ KHÔNG bám "Hàn Lập"; "trùm"/"cấp" là chữ chuẩn Tiên Giới.
    for (const clean of [
      "Cuốn book này rất hay.", // book chứ không phải ok
      "Đoạn OKA phía bắc.", // OKA chứ không phải ok
      "Ngươi hãy lập công danh.", // "lập" riêng lẻ hợp lệ, KHÔNG phải "Hàn Lập"
      "Trời hàn, lập đông đã tới.", // "hàn" + "lập" cách dấu phẩy, KHÔNG phải "Hàn Lập"
      "Hàn khí lập loè.", // "Hàn" + "khí" + "lập" tách rời
      "Ngươi đã đạt cấp 3, hãy thăng tiến.", // "cấp" là chữ chuẩn
      "Đấu với trùm cuối ở bí cảnh.", // "trùm" là chữ chuẩn thay "boss"
      "Chào mừng tiên hữu đến Lạc Hà Trấn.", // không có từ cấm nào
    ]) {
      expect(bannedViolations(clean).length, clean).toBe(0);
    }
  });

  it("chuẩn NFC: đầu vào thừa kết hợp (NFD) vẫn bắt (đột biến: bỏ normalize('NFC') -> ca NFD đỏ)", () => {
    const nfd = "Hàn Lập".normalize("NFD"); // tách dấu thành ký tự kéo dài
    expect(bannedViolations(`Nguồn: ${nfd}.`).length).toBe(1);
  });

  it("bắt vi phạm đứng sau `İ` (U+0130): cũ toLowerCase()+indexOf lệch chỉ số bỏ lỡ (đột biến: quay lại cách đó -> đỏ)", () => {
    // `İ` (U+0130) thường hoá thành 2 đơn vị UTF-16 (i + dấu chấm trên combining, KHÔNG phải 1) — đúng với MỌI locale
    // (toLowerCase của JS KHÔNG phụ thuộc locale ở đây) -> `hay` (bản thường) dài hơn `src` ở cùng vị trí, `hay.indexOf`
    // trả chỉ số lệch so với `src` -> cắt sai / bỏ lỡ vi phạm đứng sau. Cách mới quét `matchAll` trên `src` nên KHÔNG lệch.
    expect(bannedViolations("İ Hàn Lập").length).toBe(1);
    expect(bannedViolations("İ ok").length).toBe(1);
    expect(bannedViolations("thường İ Hàn Lập qua.").length).toBe(1);
  });

  it("bắt tên cấm cách nhau nhiều khoảng / xuống dòng / tab / NBSP (đột biến: `\\s+` -> dấu cách đơn -> đỏ)", () => {
    // Tên cấm gồm hai chữ chỉ khớp khi chúng cách nhau BẤT KỲ khoảng trắng nào, không chỉ một dấu cách.
    // (Đột biến: đổi `\\s+` thành dấu cách đơn -> các ca dưới báo 0 thay vì 1.)
    for (const variant of ["Hàn  Lập", "Hàn\nLập", "Hàn\tLập", "Hàn\u00A0Lập"]) {
      expect(bannedViolations(`Ta tu tại ${variant}.`).length, variant).toBe(1);
    }
  });

  it("duyệt đủ mọi mục của BANNED_TERMS (đột biến: vòng lặp bỏ qua -> đỏ)", () => {
    // Chứng minh kết quả phụ thuộc vào MỌI mục BANNED_TERMS: chuỗi chứa đủ mọi term phải bắt đủ mỗi term một lần.
    // (Nếu ai đó làm hỏng vòng lặp duyệt BANNED_TERMS, ca tổng hợp này sẽ đỏ.)
    const đủMọiTerm = BANNED_TERMS.map((b) => b.term).join(". ");
    expect(bannedViolations(`${đủMọiTerm}.`).length).toBe(BANNED_TERMS.length);
  });

  it("hợp với khung: chữ cấm KHÔNG lọt vào mô tả MỌI chiêu học được (dữ liệu thật đang sạch)", () => {
    // Kiểm chéo chứng minh bộ cấm KHÔNG dương tính giả với nội dung game thật đang có — quét MỌI chiêu học được
    // (không chỉ một nhóm hệ), nên bắt rò rỉ tên riêng ở bất kỳ chiêu nào. (Nếu thêm từ cấm rộng làm bùng nổ dữ
    // liệu thật, ca này đỏ -> liệt kê chứ KHÔNG sửa dữ liệu.)
    for (const s of LEARNABLE_SKILLS) {
      for (const t of [s.name, s.bookName, s.desc]) {
        expect(bannedViolations(t).length, `${s.id}: ${t}`).toBe(0);
      }
    }
  });
});
