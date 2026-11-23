// Test + đột biến cho bộ từ cấm (issue #1199): bannedViolations bắt tên riêng của truyện / game khác và từ hiện đại
// lạc văn phong trong NỘI DUNG GAME, KHÔNG báo oan chữ hợp lệ (ranh giới từ, chữ thường hợp lệ). Mỗi quy tắc có ca
// chứng minh đỏ khi mã sai (đột biến): bỏ hoa thường -> "thanh vân môn" đỏ; bỏ ranh giới -> "book" đỏ; v.v.
import { describe, expect, it } from "vitest";
import { BANNED_TERMS, bannedViolations } from "./glossary-banned";
import { SKILLS_KIM_THO } from "./skills-kim-tho";

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

  it("bắt tên riêng Vạn Kiếp ở mọi casing (đột biến: bỏ toLowerCase -> 'thanh vân môn' / 'THANH VÂN MÔN' đỏ)", () => {
    for (const variant of ["Thanh Vân Môn", "thanh vân môn", "THANH VÂN MÔN", "Thanh vÂN môn"]) {
      const v = bannedViolations(`Đồ này đến từ ${variant} ngày xưa.`);
      expect(v.length, variant).toBe(1);
      expect(v[0], variant).toContain(variant); // báo đúng chữ thấy (nguyên văn trong ngữ cảnh)
      expect(v[0]).toContain("tông phái của Vạn Kiếp Tu Tiên"); // lý do in ra
    }
  });

  it("bắt mọi tông phái / môn phái / tự viện / cốc đã liệt kê", () => {
    for (const name of [
      "Bắc Minh",
      "Huyền Vũ Môn",
      "Kim Đạo Tự",
      "Đan Hà Cốc",
      "Thanh Vân Kiếm Tông",
    ]) {
      expect(bannedViolations(`Ta từng tu tại ${name}.`).length, name).toBe(1);
    }
  });

  it("bắt nhân vật của truyện khác (Hàn Lập)", () => {
    expect(bannedViolations("Hàn Lập từng qua đây.").length).toBe(1);
    expect(bannedViolations("hàn lập đi ngang.").length).toBe(1); // không phân biệt hoa thường
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

  it("KHÔNG báo oan chữ hợp lệ chứa chuỗi con (đột biến: bỏ ranh giới từ -> 'book' / 'minh' / 'cấp' đỏ)", () => {
    // "ok" KHÔNG bám "book" hay "OKA"; "minh" hợp lệ KHÔNG bám "Bắc Minh"; "trùm"/"cấp" là chữ chuẩn Tiên Giới.
    for (const clean of [
      "Cuốn book này rất hay.", // book chứ không phải ok
      "Đoạn OKA phía bắc.", // OKA chứ không phải ok
      "Sự minh triết của bậc tiên ông.", // "minh" riêng lẻ hợp lệ, KHÔNG phải "Bắc Minh"
      "Bắc trời quang đãng, minh mẫn.", // "Bắc" + "minh" tách rời, KHÔNG phải "Bắc Minh"
      "Ngươi đã đạt cấp 3, hãy thăng tiến.", // "cấp" là chữ chuẩn
      "Đấu với trùm cuối ở bí cảnh.", // "trùm" là chữ chuẩn thay "boss"
      "Chào mừng tiên hữu đến Lạc Hà Trấn.", // không có từ cấm nào
    ]) {
      expect(bannedViolations(clean).length, clean).toBe(0);
    }
  });

  it("chuẩn NFC: đầu vào thừa kết hợp (NFD) vẫn bắt (đột biến: bỏ normalize('NFC') -> ca NFD đỏ)", () => {
    const nfd = "Bắc Minh".normalize("NFD"); // tách dấu thành ký tự kéo dài
    expect(bannedViolations(`Nguồn: ${nfd}.`).length).toBe(1);
  });

  it("danh sách rỗng / không có từ cấm -> KHÔNG bắt gì (đột biến: vòng lặp bỏ qua -> đỏ)", () => {
    // Chứng minh kết quả phụ thuộc vào BANNED_TERMS: cắt tạm danh sách về rỗng thì không còn vi phạm.
    expect(bannedViolations("Thanh Vân Môn boss level ok").length).toBe(4);
    // (Nếu ai đó làm hỏng vòng lặp duyệt BANNED_TERMS, ca tổng hợp này sẽ đỏ.)
  });

  it("hợp với khung: chữ cấm KHÔNG lọt vào mô tả chiêu nhóm Kim+Thổ hiện có (dữ liệu thật đang sạch)", () => {
    // Kiểm chéo chứng minh bộ cấm KHÔNG dương tính giả với nội dung game thật đang có.
    // (Nếu thêm từ cấm rộng làm bùng nổ dữ liệu thật, ca này đỏ -> liệt kê chứ KHÔNG sửa dữ liệu.)
    for (const s of SKILLS_KIM_THO) {
      for (const t of [s.name, s.bookName, s.desc]) {
        expect(bannedViolations(t).length, `${s.id}: ${t}`).toBe(0);
      }
    }
  });
});
