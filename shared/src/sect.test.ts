// Hợp đồng tông môn (M3 bước 6, PR 6a): hằng số, tên tin nhắn, bộ đọc tin từ client, bảng quyền, lý do từ chối.
import { describe, expect, it } from "vitest";
import { COIN_CAP } from "./currency";
import { DUEL_MSG } from "./duel";
import { DUNGEON_MSG } from "./dungeon";
import {
  NO_SECT,
  SECT_ASSIGNABLE_RANKS,
  SECT_COIN_CAP,
  SECT_CREATE_COOLDOWN_MS,
  SECT_CREATE_COST,
  SECT_ELDERS_MAX,
  SECT_FAILS,
  SECT_INVITES_MAX,
  SECT_INVITE_TTL_MS,
  SECT_LOG_MAX,
  SECT_MAX_MEMBERS,
  SECT_MOTD_MAX,
  SECT_MSG,
  SECT_NAME_MAX,
  SECT_NAME_MIN,
  SECT_PERMS,
  SECT_PRESENCE_MS,
  SECT_RANKS,
  SECT_RANK_LABEL,
  SECT_REJOIN_COOLDOWN_MS,
  SECT_TAG_MAX,
  SECT_TAG_MIN,
  canSect,
  cleanMotd,
  cleanSectName,
  cleanSectTag,
  compareSectMembers,
  parseSectAmount,
  parseSectAnswer,
  parseSectCreate,
  parseSectInvite,
  parseSectKick,
  parseSectMotd,
  parseSectRank,
  parseSectTransfer,
  sectFailMessage,
  sectKey,
  sectRankOrder,
  type SectAction,
  type SectMember,
  type SectRank,
} from "./sect";

describe("hằng số và tên tin nhắn", () => {
  it("hằng số dương, hữu hạn, quan hệ hợp lý", () => {
    for (const v of [
      SECT_NAME_MIN,
      SECT_NAME_MAX,
      SECT_TAG_MIN,
      SECT_TAG_MAX,
      SECT_MOTD_MAX,
      SECT_MAX_MEMBERS,
      SECT_ELDERS_MAX,
      SECT_INVITE_TTL_MS,
      SECT_INVITES_MAX,
      SECT_REJOIN_COOLDOWN_MS,
      SECT_CREATE_COOLDOWN_MS,
      SECT_CREATE_COST,
      SECT_COIN_CAP,
      SECT_LOG_MAX,
      SECT_PRESENCE_MS,
    ]) {
      expect(Number.isSafeInteger(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
    expect(SECT_NAME_MIN).toBeLessThanOrEqual(SECT_NAME_MAX);
    expect(SECT_TAG_MIN).toBeLessThanOrEqual(SECT_TAG_MAX);
    expect(SECT_TAG_MAX).toBeLessThan(SECT_NAME_MAX); // biệt hiệu ngắn hơn tên
    expect(SECT_ELDERS_MAX).toBeLessThan(SECT_MAX_MEMBERS);
    // một lần góp đầy ví luôn vào được kho trống; lập tông môn không vượt ví
    expect(SECT_COIN_CAP).toBeGreaterThanOrEqual(COIN_CAP);
    expect(SECT_CREATE_COST).toBeLessThanOrEqual(COIN_CAP);
    expect(Number.isSafeInteger(SECT_COIN_CAP * 2)).toBe(true); // cộng dồn trong kiểm tra không tràn số nguyên an toàn
    expect(SECT_INVITE_TTL_MS).toBeLessThan(SECT_REJOIN_COOLDOWN_MS);
  });

  it("tên tin nhắn không trùng nhau, đều bắt đầu bằng `sect`, không trùng tin của đội / thách đấu / bí cảnh", () => {
    const names = Object.values(SECT_MSG);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/^sect(?:[A-Z]|$)/);
    expect(SECT_MSG.accept).toBe("sectAccept");
    expect(SECT_MSG.decline).toBe("sectDecline");
    expect(SECT_MSG.snapshot).toBe("sect");
    const others: string[] = [
      ...Object.values(DUEL_MSG),
      ...Object.values(DUNGEON_MSG),
      "partyInvite",
      "partyAccept",
      "partyDecline",
      "party",
      "chat",
    ];
    for (const n of names) expect(others).not.toContain(n);
  });

  it("`NO_SECT` là ảnh chụp rỗng (xoá bảng)", () => {
    expect(NO_SECT).toEqual({ sect: null });
  });
});

describe("tên và biệt hiệu", () => {
  it("cleanSectName: chuẩn hoá NFC, gộp khoảng trắng, cắt hai đầu", () => {
    expect(cleanSectName("Thanh Vân Môn")).toBe("Thanh Vân Môn");
    expect(cleanSectName("  Thanh   Vân\tMôn \n")).toBe("Thanh Vân Môn");
    expect(cleanSectName("Thanh Vân".normalize("NFD"))).toBe("Thanh Vân".normalize("NFC"));
    expect(cleanSectName("Nhất Đạo 7")).toBe("Nhất Đạo 7");
  });

  it("cleanSectName: biên độ dài 2..16 theo ký tự Unicode", () => {
    expect(cleanSectName("a")).toBeNull();
    expect(cleanSectName("ab")).toBe("ab");
    expect(cleanSectName("a".repeat(SECT_NAME_MAX))).toBe("a".repeat(SECT_NAME_MAX));
    expect(cleanSectName("a".repeat(SECT_NAME_MAX + 1))).toBeNull();
    expect(cleanSectName(" a ")).toBeNull(); // cắt xong còn 1 ký tự
    // chữ ngoài mặt phẳng cơ bản tính là MỘT ký tự (16 ký tự = 32 đơn vị UTF-16)
    expect(cleanSectName("\u{20000}".repeat(SECT_NAME_MAX))).toBe(
      "\u{20000}".repeat(SECT_NAME_MAX),
    );
    expect(cleanSectName("\u{20000}".repeat(SECT_NAME_MAX + 1))).toBeNull();
  });

  it("cleanSectName: từ chối ký tự lạ, ký tự điều khiển / vô hình / dấu rời, kiểu sai", () => {
    for (const bad of [
      "Môn<b>",
      "Môn‮Phái", // đảo chiều chữ
      "Môn​Phái", // độ rộng bằng 0
      "Môn\u0000Phái",
      "Môn-Phái",
      "Môn😀",
      "éé".normalize("NFD").slice(0, 1), // một ký tự (quá ngắn)
      "",
      "   ",
    ]) {
      expect(cleanSectName(bad), JSON.stringify(bad)).toBeNull();
    }
    for (const bad of [null, undefined, 42, {}, [], ["Thanh Vân"], true]) {
      expect(cleanSectName(bad as unknown)).toBeNull();
    }
  });

  it("cleanSectTag: chỉ chữ và số, 2..4 ký tự, không dấu cách, không tự cắt", () => {
    expect(cleanSectTag("TV")).toBe("TV");
    expect(cleanSectTag("  Vân7 ")).toBe("Vân7");
    expect(cleanSectTag("Vân".normalize("NFD"))).toBe("Vân".normalize("NFC"));
    expect(cleanSectTag("T")).toBeNull();
    expect(cleanSectTag("a".repeat(SECT_TAG_MAX))).toBe("a".repeat(SECT_TAG_MAX));
    expect(cleanSectTag("a".repeat(SECT_TAG_MAX + 1))).toBeNull();
    expect(cleanSectTag("T V")).toBeNull();
    for (const bad of ["T]", "[TV", "T​V", "T\nV", "T-V", "", null, 7, {}, ["TV"]]) {
      expect(cleanSectTag(bad as unknown), JSON.stringify(bad)).toBeNull();
    }
  });

  it("sectKey: không phân biệt hoa thường, vẫn phân biệt dấu", () => {
    expect(sectKey("Thanh Vân")).toBe(sectKey("THANH VÂN"));
    expect(sectKey("Thanh Vân".normalize("NFD"))).toBe(sectKey("thanh vân"));
    expect(sectKey("Đạo")).toBe(sectKey("đạo"));
    expect(sectKey("Van")).not.toBe(sectKey("Vân"));
  });
});

describe("cleanMotd", () => {
  it("một dòng: khoảng trắng thành dấu cách đơn, cắt hai đầu", () => {
    expect(cleanMotd("  Hôm nay   săn\nboss\t7 giờ  ")).toBe("Hôm nay săn boss 7 giờ");
    expect(cleanMotd("")).toBe(""); // rỗng = xoá thông báo
    expect(cleanMotd("   \n ")).toBe("");
  });

  it("bỏ ký tự điều khiển và ký tự định dạng vô hình (đảo chiều, độ rộng bằng 0)", () => {
    expect(cleanMotd("a\u0000b\u0007c")).toBe("abc");
    expect(cleanMotd("an‮dz")).toBe("andz");
    expect(cleanMotd("an​‍⁦dz")).toBe("andz");
    expect(cleanMotd("a\u0085b")).toBe("ab");
  });

  it("cắt còn SECT_MOTD_MAX ký tự Unicode (không chặt đôi cặp thay thế), không từ chối", () => {
    expect(cleanMotd("a".repeat(SECT_MOTD_MAX))).toBe("a".repeat(SECT_MOTD_MAX));
    expect(cleanMotd("a".repeat(SECT_MOTD_MAX + 50))).toBe("a".repeat(SECT_MOTD_MAX));
    expect(cleanMotd("\u{20000}".repeat(SECT_MOTD_MAX + 5))).toBe(
      "\u{20000}".repeat(SECT_MOTD_MAX),
    );
    // cắt xong không còn dấu cách thừa ở đuôi
    expect(cleanMotd("a".repeat(SECT_MOTD_MAX - 1) + " bbb")).toBe("a".repeat(SECT_MOTD_MAX - 1));
  });

  it("không phải chuỗi thì null", () => {
    for (const bad of [null, undefined, 1, {}, [], ["x"], true]) {
      expect(cleanMotd(bad as unknown)).toBeNull();
    }
  });
});

describe("bộ đọc tin từ client (không tin client)", () => {
  it("parseSectCreate: cần cả tên và biệt hiệu hợp lệ; không mang trường lạ", () => {
    expect(parseSectCreate({ name: " Thanh  Vân ", tag: "TV" })).toEqual({
      name: "Thanh Vân",
      tag: "TV",
    });
    expect(
      parseSectCreate({ name: "Thanh Vân", tag: "TV", extra: 1, __proto__: { x: 1 } }),
    ).toEqual({
      name: "Thanh Vân",
      tag: "TV",
    });
    expect(parseSectCreate({ name: "Thanh Vân" })).toBeNull();
    expect(parseSectCreate({ tag: "TV" })).toBeNull();
    expect(parseSectCreate({ name: "x", tag: "TV" })).toBeNull();
    expect(parseSectCreate({ name: "Thanh Vân", tag: "T" })).toBeNull();
    expect(parseSectCreate({ name: "Thanh Vân", tag: "T V" })).toBeNull();
    for (const bad of [null, undefined, 3, "Thanh Vân", [], [["Thanh Vân", "TV"]], true]) {
      expect(parseSectCreate(bad as unknown)).toBeNull();
    }
  });

  describe.each([
    ["parseSectInvite", parseSectInvite, "name", "from"],
    ["parseSectKick", parseSectKick, "name", "from"],
    ["parseSectTransfer", parseSectTransfer, "name", "from"],
    ["parseSectAnswer", parseSectAnswer, "from", "name"],
  ] as const)("%s", (_label, parse, field, other) => {
    const ok = (name: unknown) => parse({ [field]: name } as never);

    it("nhận đạo hiệu hợp lệ và chuẩn hoá (NFC, gộp khoảng trắng, cắt hai đầu)", () => {
      expect(ok("Dao Truong")).toEqual({ [field]: "Dao Truong" });
      expect(ok("  Dao    Truong  ")).toEqual({ [field]: "Dao Truong" });
      expect(ok("Đạo Trưởng 7")).toEqual({ [field]: "Đạo Trưởng 7" });
      expect(ok("TụSi".normalize("NFD"))).toEqual({ [field]: "TụSi".normalize("NFC") });
    });

    it("từ chối đạo hiệu sai luật và kiểu sai; chỉ đọc đúng trường của mình", () => {
      for (const bad of ["", "a", "a".repeat(17), "Dao<b>", "Dao‮Truong", null, 7, {}, ["Dao"]]) {
        expect(ok(bad), JSON.stringify(bad)).toBeNull();
      }
      for (const bad of [null, undefined, "Dao Truong", 5, [], [{ [field]: "Dao Truong" }]]) {
        expect(parse(bad as never)).toBeNull();
      }
      expect(parse({ [other]: "Dao Truong" } as never)).toBeNull();
      expect(parse({ [field]: "Dao Truong", [other]: "Khac", x: 1 } as never)).toEqual({
        [field]: "Dao Truong",
      });
    });
  });

  it("parseSectRank: chỉ `truong_lao` / `de_tu`; KHÔNG nhận `chu` hay tên trùng thuộc tính của Object", () => {
    expect(parseSectRank({ name: "Dao Truong", rank: "truong_lao" })).toEqual({
      name: "Dao Truong",
      rank: "truong_lao",
    });
    expect(parseSectRank({ name: "Dao Truong", rank: "de_tu", extra: 1 })).toEqual({
      name: "Dao Truong",
      rank: "de_tu",
    });
    for (const rank of [
      "chu",
      "",
      "Truong_lao",
      "constructor",
      "toString",
      "__proto__",
      null,
      0,
      {},
      ["de_tu"],
    ]) {
      expect(parseSectRank({ name: "Dao Truong", rank } as never), JSON.stringify(rank)).toBeNull();
    }
    expect(parseSectRank({ rank: "de_tu" })).toBeNull();
    expect(parseSectRank({ name: "x", rank: "de_tu" })).toBeNull();
    expect(parseSectRank(null)).toBeNull();
    expect(parseSectRank("de_tu")).toBeNull();
  });

  it("parseSectMotd: làm sạch + cắt, rỗng hợp lệ, kiểu sai bị từ chối", () => {
    expect(parseSectMotd({ motd: "  Săn   boss  " })).toEqual({ motd: "Săn boss" });
    expect(parseSectMotd({ motd: "" })).toEqual({ motd: "" });
    expect(parseSectMotd({ motd: "a".repeat(500) })).toEqual({ motd: "a".repeat(SECT_MOTD_MAX) });
    expect(parseSectMotd({ motd: "a\u0000b", extra: 1 })).toEqual({ motd: "ab" });
    for (const bad of [{}, { motd: 1 }, { motd: null }, { motd: ["x"] }, null, "x", [], 3]) {
      expect(parseSectMotd(bad as unknown)).toBeNull();
    }
  });

  it("parseSectAmount: số nguyên an toàn trong 1..COIN_CAP, không làm tròn hộ client", () => {
    expect(parseSectAmount({ amount: 1 })).toEqual({ amount: 1 });
    expect(parseSectAmount({ amount: 500, extra: 9 })).toEqual({ amount: 500 });
    expect(parseSectAmount({ amount: COIN_CAP })).toEqual({ amount: COIN_CAP });
    for (const bad of [
      0,
      -1,
      -0,
      1.5,
      0.1,
      COIN_CAP + 1,
      Number.MAX_SAFE_INTEGER,
      Infinity,
      -Infinity,
      NaN,
      "100",
      null,
      undefined,
      {},
      [100],
      true,
    ]) {
      expect(parseSectAmount({ amount: bad } as never), String(bad)).toBeNull();
    }
    expect(parseSectAmount({})).toBeNull();
    expect(parseSectAmount(null)).toBeNull();
    expect(parseSectAmount(100)).toBeNull();
    expect(parseSectAmount([])).toBeNull();
  });
});

describe("chức vụ và thứ tự thành viên", () => {
  it("SECT_RANKS từ cao xuống thấp, có nhãn tiếng Việt, hạng giao được không có Tông chủ", () => {
    expect([...SECT_RANKS]).toEqual(["chu", "truong_lao", "de_tu"]);
    expect([...SECT_ASSIGNABLE_RANKS]).toEqual(["truong_lao", "de_tu"]);
    expect(SECT_RANK_LABEL.chu).toBe("Tông chủ");
    expect(SECT_RANK_LABEL.truong_lao).toBe("Trưởng lão");
    expect(SECT_RANK_LABEL.de_tu).toBe("Đệ tử");
    expect(sectRankOrder("chu")).toBeLessThan(sectRankOrder("truong_lao"));
    expect(sectRankOrder("truong_lao")).toBeLessThan(sectRankOrder("de_tu"));
  });

  it("compareSectMembers: chức vụ cao trước, rồi vào sớm trước, rồi theo tên", () => {
    const m = (name: string, rank: SectRank, joinedAt: number): SectMember => ({
      name,
      rank,
      joinedAt,
    });
    const list = [
      m("Dd", "de_tu", 5),
      m("Aa", "de_tu", 9),
      m("Bb", "truong_lao", 50),
      m("Cc", "chu", 100),
      m("Ab", "de_tu", 5),
    ];
    expect(list.sort(compareSectMembers).map((x) => x.name)).toEqual([
      "Cc",
      "Bb",
      "Ab",
      "Dd",
      "Aa",
    ]);
    expect(compareSectMembers(m("Aa", "de_tu", 1), m("Aa", "de_tu", 1))).toBe(0);
  });
});

describe("canSect (bảng quyền theo chức vụ)", () => {
  const ACTIONS = Object.keys(SECT_PERMS) as SectAction[];

  it("khớp bảng ở docs/THIET_KE_TONG_MON.md mục 4.3", () => {
    const can = (a: SectAction, r: SectRank, t?: SectRank) => canSect(a, r, t);
    // mọi người
    for (const r of SECT_RANKS) {
      expect(can("chat", r)).toBe(true);
      expect(can("deposit", r)).toBe(true);
    }
    // mời vào, sửa thông báo: Tông chủ + Trưởng lão
    for (const a of ["invite", "motd"] as const) {
      expect(can(a, "chu")).toBe(true);
      expect(can(a, "truong_lao")).toBe(true);
      expect(can(a, "de_tu")).toBe(false);
    }
    // chỉ Tông chủ: rút kho, đổi chức vụ, chuyển quyền, giải tán
    expect(can("withdraw", "chu")).toBe(true);
    expect(can("withdraw", "truong_lao")).toBe(false);
    expect(can("withdraw", "de_tu")).toBe(false);
    expect(can("disband", "chu")).toBe(true);
    expect(can("disband", "truong_lao")).toBe(false);
    expect(can("disband", "de_tu")).toBe(false);
    for (const t of ["truong_lao", "de_tu"] as const) {
      expect(can("setRank", "chu", t)).toBe(true);
      expect(can("setRank", "truong_lao", t)).toBe(false);
      expect(can("setRank", "de_tu", t)).toBe(false);
      expect(can("transfer", "chu", t)).toBe(true);
      expect(can("transfer", "truong_lao", t)).toBe(false);
      expect(can("transfer", "de_tu", t)).toBe(false);
    }
    // mời ra: Tông chủ mọi người khác; Trưởng lão chỉ Đệ tử; Đệ tử không
    expect(can("kick", "chu", "truong_lao")).toBe(true);
    expect(can("kick", "chu", "de_tu")).toBe(true);
    expect(can("kick", "truong_lao", "de_tu")).toBe(true);
    expect(can("kick", "truong_lao", "truong_lao")).toBe(false);
    expect(can("kick", "de_tu", "de_tu")).toBe(false);
    // rời: Tông chủ phải chuyển quyền trước
    expect(can("leave", "chu")).toBe(false);
    expect(can("leave", "truong_lao")).toBe(true);
    expect(can("leave", "de_tu")).toBe(true);
  });

  it("không bao giờ nhắm vào Tông chủ (mời ra / đổi chức vụ / chuyển quyền); thiếu đối tượng thì từ chối", () => {
    for (const r of SECT_RANKS) {
      expect(canSect("kick", r, "chu")).toBe(false);
      expect(canSect("setRank", r, "chu")).toBe(false);
      expect(canSect("transfer", r, "chu")).toBe(false);
      for (const a of ["kick", "setRank", "transfer"] as const) {
        expect(canSect(a, r)).toBe(false);
        expect(canSect(a, r, "constructor" as never)).toBe(false);
      }
    }
  });

  it("không ở tông môn (null) hoặc chức vụ lạ thì không làm được gì", () => {
    for (const a of ACTIONS) {
      expect(canSect(a, null, "de_tu")).toBe(false);
      expect(canSect(a, "constructor" as never, "de_tu")).toBe(false);
      expect(canSect(a, "__proto__" as never, "de_tu")).toBe(false);
    }
  });

  it("bảng quyền đủ mọi chức vụ cho mọi thao tác; Tông chủ làm được nhiều nhất", () => {
    for (const a of ACTIONS) {
      expect(Object.keys(SECT_PERMS[a]).sort()).toEqual([...SECT_RANKS].sort());
    }
    const count = (r: SectRank) => ACTIONS.filter((a) => SECT_PERMS[a][r]).length;
    // (`leave` của Tông chủ tắt: còn lại Tông chủ có nhiều quyền hơn Trưởng lão, Trưởng lão hơn Đệ tử)
    expect(count("chu")).toBeGreaterThan(count("truong_lao"));
    expect(count("truong_lao")).toBeGreaterThan(count("de_tu"));
  });
});

describe("lý do từ chối", () => {
  it("mọi lý do có câu tiếng Việt khác rỗng, kết thúc bằng dấu chấm, không lộ id / mã nội bộ", () => {
    expect(new Set(SECT_FAILS).size).toBe(SECT_FAILS.length);
    const seen = new Set<string>();
    for (const r of SECT_FAILS) {
      const m = sectFailMessage(r);
      expect(typeof m).toBe("string");
      expect(m.length).toBeGreaterThan(8);
      expect(m.endsWith(".")).toBe(true);
      expect(m).not.toMatch(/[a-z]+_[a-z_]+/); // không để lọt tên lý do dạng snake_case
      expect(m).not.toMatch(/undefined|null|NaN|\[object/);
      seen.add(m);
    }
    expect(seen.size).toBe(SECT_FAILS.length); // mỗi lý do một câu riêng
  });

  it("câu báo nhắc đúng giới hạn trong hằng số (không để lệch số khi đổi hằng số)", () => {
    expect(sectFailMessage("name_invalid")).toContain(`${SECT_NAME_MIN}-${SECT_NAME_MAX}`);
    expect(sectFailMessage("tag_invalid")).toContain(`${SECT_TAG_MIN}-${SECT_TAG_MAX}`);
  });
});
