// Test đơn giản cho tài liệu hướng dẫn người chơi docs/HUONG_DAN_NGUOI_CHOI.md (issue #886, G2).
// Không có công cụ kiểm liên kết markdown sẵn trong repo, nên tự kiểm: tệp tồn tại, không rỗng,
// đủ độ dài, các liên kết nội bộ tới docs/ khác trỏ tới tệp thật, và KHÔNG có chữ Hán (quy tắc hiển thị).
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const DOC_PATH = resolve(here, "../../docs/HUONG_DAN_NGUOI_CHOI.md");

function readDoc(): string {
  return readFileSync(DOC_PATH, "utf8");
}

// Dải chữ Hán (CJK Unified + các dải liên quan: dấu CJK, toàn giác bán giác...) — không được xuất hiện trong tài liệu tiếng Việt cho người chơi.
const CJK = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3000-\u303F\uFF00-\uFFEF]/;

describe("docs/HUONG_DAN_NGUOI_CHOI.md", () => {
  it("tồn tại và không rỗng", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
    const text = readDoc();
    expect(text.trim().length).toBeGreaterThan(200);
  });

  it("đủ độ dài để coi là hướng dẫn đầy đủ (>= 1500 ký tự)", () => {
    expect(readDoc().length).toBeGreaterThanOrEqual(1500);
  });

  it("không chứa chữ Hán / ký tự CJK", () => {
    expect(CJK.test(readDoc())).toBe(false);
  });

  it("các liên kết nội bộ tới docs/ trỏ tới tệp thật", () => {
    const text = readDoc();
    // Bắt [mô tả](đường-dẫn) — chỉ xét liên kết không phải ảnh (![...]) và không phải liên kết neo thuần (#...)
    const links = [...text.matchAll(/\]\((?!#)([^)\s]+)\)/g)].map((m) => m[1]);
    for (const raw of links) {
      // bỏ neo nếu có (#anchor)
      const path = raw.split("#")[0];
      // chỉ kiểm liên kết tương đối tới docs/ hoặc tệp trong repo; bỏ qua http(s) và mailto
      if (!path || /^https?:/.test(path) || /^mailto:/.test(path)) continue;
      // Liên kết markdown tương đối so với THƯ MỤC của chính tài liệu (docs/), không phải gốc repo
      const target = resolve(dirname(DOC_PATH), path);
      expect(existsSync(target)).toBe(true);
    }
  });
});

// ---------- Số liệu trong hướng dẫn khớp dữ liệu thật (issue #1421) ----------
// Mọi con số / tên dưới đây được TÍNH từ `shared/` (không viết cứng số trong test) rồi tra trong tài liệu; lệch thì test đỏ kèm câu cần sửa.
// Thời gian cày ước tính lấy từ `docs/CAN_BANG.md` (do `npm run can-bang -w server` sinh).
import {
  AMBUSH_COOLDOWN_MS,
  AMBUSH_DAY_CAP,
  AMBUSH_MIN_HP_PCT,
  AMBUSH_CALM_MS,
  AMBUSH_OFFER_MS,
  AMBUSH_TIME_MS,
  AMBUSH_FLEE_CHANNEL_MS,
  BOSS_BY_KIND,
  BOSS_MIN_TELEGRAPH_MS,
  BREAK_CHANCE_CAP,
  BREAK_FAIL_EXP_LOSS,
  COIN_CAP,
  DUEL_COUNTDOWN_MS,
  DUEL_INVITE_TTL_MS,
  DUEL_KO_HP_PCT,
  DUEL_MAX_MS,
  DUNGEONS,
  DUNGEON_DAILY_REWARDS,
  DUNGEON_FALL_HP_PCT,
  DUNGEON_LOOT_MS,
  ELEMENTS,
  ELEMENT_ADVANTAGE_MULT,
  ELEMENT_DISADVANTAGE_MULT,
  EQUIP_SLOT_NAMES,
  EQUIP_SLOT_UNLOCK_REALM,
  EQUIP_SLOTS,
  INVENTORY_SLOTS,
  ITEM_BY_ID,
  LEARNABLE_SKILLS,
  LOOT_DESPAWN_MS,
  MASTERY_NEED,
  MAX_STATUSES,
  MAPS,
  DUNGEON_MAPS,
  MONSTERS,
  MONSTER_BY_ID,
  MONSTER_REALM,
  NET_RECONNECT_GRACE_S,
  NPCS,
  PARTY_EXP_BONUS,
  PARTY_INVITE_TTL_MS,
  PARTY_MAX,
  RARITY_NAMES,
  REALMS,
  SECT_CREATE_COST,
  SECT_DEPOSIT_DAY_CAP,
  SECT_INVITE_TTL_MS,
  SECT_LEVELS,
  SECT_NAME_MAX,
  SECT_NAME_MIN,
  SECT_REJOIN_COOLDOWN_MS,
  SECT_SHOP,
  SECT_TAG_MAX,
  SECT_TAG_MIN,
  SECT_VAULT_SLOTS,
  SECT_VAULT_SLOTS_MAX,
  SKILL_GRADE_NAMES,
  SKILL_MAX_LEVEL_BY_GRADE,
  WINDUP_SLOW,
  breakthroughChance,
  expToNext,
  getMap,
  realmLabel,
  realmOfStep,
} from "./index";

/** Số nguyên có dấu chấm ngăn nghìn (4400 -> "4.400"), như tài liệu. */
const nghin = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
/** Số thập phân dấu phẩy (1.3 -> "1,3"). */
const phay = (n: number): string => String(n).replace(".", ",");
const giay = (ms: number): number => ms / 1000;
const phut = (ms: number): number => ms / 60_000;

describe("docs/HUONG_DAN_NGUOI_CHOI.md: số liệu khớp dữ liệu thật (#1421)", () => {
  const doc = readDoc();
  /** Câu / cụm cần có trong tài liệu; thiếu thì đỏ kèm lý do để biết sửa chỗ nào. */
  const co = (cum: string, lyDo: string) =>
    expect(doc.includes(cum), `hướng dẫn thiếu "${cum}" (${lyDo})`).toBe(true);

  it("hệ ngũ hành: đủ danh sách mười hệ, hệ số khắc / bị khắc, số trạng thái tối đa", () => {
    co(`**${ELEMENTS.map((e) => e.name).join(", ")}**`, "danh sách hệ (ELEMENTS)");
    co(`${ELEMENTS.length === 10 ? "mười" : String(ELEMENTS.length)} hệ`, "số hệ");
    co(`**x${phay(ELEMENT_ADVANTAGE_MULT)}**`, "ELEMENT_ADVANTAGE_MULT");
    co(`**x${phay(ELEMENT_DISADVANTAGE_MULT)}**`, "ELEMENT_DISADVANTAGE_MULT");
    co(`tối đa ${MAX_STATUSES} trạng thái`, "MAX_STATUSES");
  });

  it("thang cảnh giới: đúng thứ tự tên và số bậc nhỏ; nội dung chơi được tới đúng cảnh giới cao nhất của quái", () => {
    let last = -1;
    for (const r of REALMS) {
      const at = doc.indexOf(`| ${r.name} |`);
      expect(at, `thang cảnh giới thiếu dòng "${r.name}"`).toBeGreaterThan(-1);
      expect(at, `"${r.name}" sai thứ tự trong thang`).toBeGreaterThan(last);
      last = at;
    }
    co(`| Luyện Khí | Tầng 1 → Tầng ${REALMS[1].tiers.length} |`, "số tầng Luyện Khí");
    // Chỉ tính loài ĐÃ SINH ở một bản đồ (`monsterCap` > 0): loài khai trước nhưng chưa cho sinh (D1 #1466 lát A1, Hóa Thần của Lang Hoang) chưa phải nội dung chơi được.
    const sinh = (id: string) => MAPS.some((m) => getMap(m.id)!.monsterCapOf(id) > 0);
    const cao = Math.max(
      ...Object.entries(MONSTER_REALM)
        .filter(([id]) => sinh(id))
        .map(([, r]) => r),
    );
    co(
      `đi tới **${REALMS[cao].name}**`,
      "cảnh giới cao nhất có quái ĐÃ SINH (MONSTER_REALM x monsterCap)",
    );
  });

  it("thanh tu vi: tu vi từng bậc và thời gian cày khớp expToNext và docs/CAN_BANG.md", () => {
    const khoang = (realm: number): string => {
      const v = REALMS[realm].tiers.map((_, t) => expToNext(realm, t));
      return `${nghin(Math.min(...v))} – ${nghin(Math.max(...v))}`;
    };
    co(`| Luyện Khí (đủ 9 tầng) | ${khoang(1)} / tầng |`, "tu vi từng tầng Luyện Khí");
    co(`| Trúc Cơ | ${khoang(2)} |`, "tu vi Trúc Cơ");
    co(`| Kim Đan | ${khoang(3)} |`, "tu vi Kim Đan");
    co(`Phàm Nhân chỉ cần ${expToNext(0, 0)} tu vi`, "tu vi Phàm Nhân");
    const canBang = readFileSync(resolve(here, "../../docs/CAN_BANG.md"), "utf8");
    const lk = canBang.match(/Hết Luyện Khí \(sẵn sàng Trúc Cơ\): \*\*([^*]+)\*\*/);
    const tc = canBang.match(/Hết Trúc Cơ \(sẵn sàng Kim Đan\): \*\*([^*]+)\*\*/);
    const kd = canBang.match(/\*\*([\d.]+) giờ\*\* săn bãi mới/);
    expect(lk && tc && kd, "docs/CAN_BANG.md đổi khuôn câu tóm tắt thời gian").toBeTruthy();
    // Thời gian ước tính là kết quả MÔ PHỎNG (đổi theo từng nội dung mới): chỉ đòi tài liệu nằm trong +-10 % số của CAN_BANG.md, để chỉnh nhỏ không làm đỏ vô ích
    const raPhut = (t: string): number => {
      const h = t.match(/([\d.,]+) giờ/);
      const m = t.match(/(\d+) phút/);
      return (h ? Number(h[1].replace(",", ".")) * 60 : 0) + (m ? Number(m[1]) : 0);
    };
    const trongDoc = (re: RegExp, ten: string): number => {
      const m = doc.match(re);
      expect(m, `hướng dẫn đổi khuôn dòng thời gian ${ten}`).toBeTruthy();
      return raPhut(m![1]);
    };
    const kiem = (docPhut: number, simPhut: number, ten: string) =>
      expect(
        Math.abs(docPhut - simPhut) / simPhut,
        `${ten}: hướng dẫn ghi ~${docPhut} phút, docs/CAN_BANG.md đo ${simPhut} phút (lệch quá 10 %)`,
      ).toBeLessThanOrEqual(0.1);
    kiem(
      trongDoc(/\| Luyện Khí \(đủ 9 tầng\) \|[^|]*\| ~([^|]+?) hết Luyện Khí \|/, "Luyện Khí"),
      raPhut(lk![1]),
      "Luyện Khí",
    );
    kiem(trongDoc(/\| Trúc Cơ \|[^|]*\| ~([^|]+?) \|/, "Trúc Cơ"), raPhut(tc![1]), "Trúc Cơ");
    kiem(trongDoc(/\| Kim Đan \|[^|]*\| ~([^|]+?) \|/, "Kim Đan"), Number(kd![1]) * 60, "Kim Đan");
  });

  it("đột phá: mất tu vi khi thất bại, xác suất từng bước, trần đan hộ đạo", () => {
    co(`mất **${Math.round(BREAK_FAIL_EXP_LOSS * 100)}% tu vi**`, "BREAK_FAIL_EXP_LOSS");
    for (let r = 0; r <= 3; r++)
      co(
        `| ${REALMS[r].name} → ${REALMS[r + 1].name} | ~${Math.round(breakthroughChance(r) * 100)}% |`,
        `xác suất đột phá bước ${r}`,
      );
    co(`tối đa lên ~${Math.round(BREAK_CHANCE_CAP * 100)}%`, "BREAK_CHANCE_CAP");
  });

  it("túi đồ, đồ rơi, trang bị, phẩm, đan hồi phục", () => {
    co(`**${INVENTORY_SLOTS} ô**`, "INVENTORY_SLOTS");
    co(`**${giay(LOOT_DESPAWN_MS)} giây**`, "LOOT_DESPAWN_MS");
    co(`Trang bị (${EQUIP_SLOTS.length} ô)`, "số ô trang bị");
    for (const s of EQUIP_SLOTS) co(`| ${EQUIP_SLOT_NAMES[s]} |`, `ô ${s}`);
    co(
      `**${EQUIP_SLOT_NAMES.treasure}** chỉ mở từ cảnh giới ${REALMS[EQUIP_SLOT_UNLOCK_REALM.treasure!].name}`,
      "mở ô pháp bảo",
    );
    co(`**${RARITY_NAMES.join(", ")}**`, "RARITY_NAMES");
    const hoi = (id: string, tien: string) => {
      const it = ITEM_BY_ID[id];
      return `${it.name} (${tien}${Math.round((it.effect as { pct: number }).pct * 100)}%)`;
    };
    co(
      `${hoi("hoi_huyet_dan", "hồi ")}, ${hoi("dai_hoi_huyet_dan", "")}, ${hoi("thuong_hoi_huyet_dan", "")}`,
      "đan hồi máu",
    );
    co(
      `${hoi("hoi_linh_dan", "")}, ${hoi("dai_hoi_linh_dan", "")}, ${hoi("thuong_hoi_linh_dan", "")}`,
      "đan hồi linh lực",
    );
    co(`tối đa ~1 tỷ`, "COIN_CAP ~ 1 tỷ");
    expect(COIN_CAP, "COIN_CAP đổi khỏi ~1 tỷ: sửa câu 'tối đa ~1 tỷ'").toBe(999_999_999);
  });

  it("tổ đội, PK, bí cảnh", () => {
    co(`Đội tối đa **${PARTY_MAX} người**`, "PARTY_MAX");
    co(`**+${Math.round(PARTY_EXP_BONUS * 100)}% tổng tu vi**`, "PARTY_EXP_BONUS");
    co(`Lời mời hết hạn sau ${giay(PARTY_INVITE_TTL_MS)} giây`, "PARTY_INVITE_TTL_MS");
    co(`Lời mời hết hạn sau ${giay(DUEL_INVITE_TTL_MS)} giây`, "DUEL_INVITE_TTL_MS");
    co(`đếm ngược ${giay(DUEL_COUNTDOWN_MS)} giây`, "DUEL_COUNTDOWN_MS");
    co(`tối đa **${phut(DUEL_MAX_MS)} phút**`, "DUEL_MAX_MS");
    co(`hồi lại với ${Math.round(DUEL_KO_HP_PCT * 100)}% máu`, "DUEL_KO_HP_PCT");
    expect(DUNGEONS, "hướng dẫn nói 'chỉ có một bí cảnh'").toHaveLength(1);
    const d = DUNGEONS[0];
    co(`**${d.name}**`, "tên bí cảnh");
    co(`đội **${d.partyMin}–${d.partyMax} người**`, "cỡ đội bí cảnh");
    const lo = realmOfStep(d.minStep)!;
    expect(d.maxStep, "bí cảnh không còn trần cảnh giới: sửa câu 'từ ... đến ...'").toBeDefined();
    const hi = realmOfStep(d.maxStep!)!;
    co(
      `từ **${realmLabel(lo.realm, lo.tier)}** đến **${realmLabel(hi.realm, hi.tier)}**`,
      "cảnh giới vào bí cảnh",
    );
    co(`giới hạn **${phut(d.timeLimitMs)} phút**`, "thời hạn một lượt bí cảnh");
    co(`tối đa **${DUNGEON_DAILY_REWARDS} lượt**`, "DUNGEON_DAILY_REWARDS");
    co(`nhặt trong ${giay(DUNGEON_LOOT_MS)} giây`, "DUNGEON_LOOT_MS");
    co(`với ${Math.round(DUNGEON_FALL_HP_PCT * 100)}% máu`, "DUNGEON_FALL_HP_PCT");
  });

  it("trùm nhiều chiêu và chặn đường", () => {
    const SO_CHU = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín", "mười"]; // số trùm viết bằng chữ ("bốn con trùm"...)
    const trum = Object.keys(BOSS_BY_KIND);
    co(`${SO_CHU[trum.length] ?? String(trum.length)} con trùm`, "số trùm có bộ chiêu");
    for (const k of trum) co(`**${MONSTER_BY_ID[k].name}**`, `trùm ${k}`);
    co(`**ít nhất ${phay(giay(BOSS_MIN_TELEGRAPH_MS))} giây**`, "BOSS_MIN_TELEGRAPH_MS");
    co(`khoảng ${phut(AMBUSH_COOLDOWN_MS)} phút sau một lần`, "AMBUSH_COOLDOWN_MS");
    co(`(${AMBUSH_DAY_CAP} lần)`, "AMBUSH_DAY_CAP");
    co(`khí huyết dưới ${AMBUSH_MIN_HP_PCT}%`, "AMBUSH_MIN_HP_PCT");
    co(`(${giay(AMBUSH_CALM_MS)} giây)`, "AMBUSH_CALM_MS");
    co(`Hộp thoại (${giay(AMBUSH_OFFER_MS)} giây)`, "AMBUSH_OFFER_MS");
    co(`đồng hồ ${phut(AMBUSH_TIME_MS)} phút`, "AMBUSH_TIME_MS");
    co(`vận ${giay(AMBUSH_FLEE_CHANNEL_MS)} giây`, "AMBUSH_FLEE_CHANNEL_MS");
    co(`chờ nối lại ${NET_RECONNECT_GRACE_S} giây`, "NET_RECONNECT_GRACE_S (chặn đường)");
    co(
      `khoảng **${NET_RECONNECT_GRACE_S} giây** để nối lại`,
      "NET_RECONNECT_GRACE_S (mẹo bảo mạng)",
    );
  });

  it("phẩm chiêu, tầng, luyện chiêu, chiêu vận, số chiêu học được", () => {
    co(`**${SKILL_GRADE_NAMES.join(", ")}**`, "SKILL_GRADE_NAMES");
    co(`| Tầng tối đa | ${SKILL_MAX_LEVEL_BY_GRADE.join(" | ")} |`, "SKILL_MAX_LEVEL_BY_GRADE");
    MASTERY_NEED.forEach((n, i) =>
      co(`tầng ${i + 1} lên ${i + 2} cần **${n}**`, `MASTERY_NEED[${i}]`),
    );
    co(
      `**${LEARNABLE_SKILLS.filter((s) => s.grade === undefined).length} chiêu cũ**`,
      "số chiêu chưa khai phẩm",
    );
    co(
      `**Phá Sơn Nhất Kích**, vận ${phay(giay(LEARNABLE_SKILLS.find((s) => s.name === "Phá Sơn Nhất Kích")!.windupMs!))} giây`,
      "chiêu vận mẫu",
    );
    co("chậm một nửa", "WINDUP_SLOW");
    expect(WINDUP_SLOW, "WINDUP_SLOW đổi khỏi 0,5: sửa 'chậm một nửa'").toBe(0.5);
    co(`**${LEARNABLE_SKILLS.length} chiêu**`, "số chiêu học được (bản v0.5.5 trở đi)");
  });

  it("tông môn: chi phí, độ dài tên, lời mời, kho, cấp tông, cửa hàng", () => {
    co(`**${nghin(SECT_CREATE_COST)} Linh thạch**`, "SECT_CREATE_COST");
    co(`(${SECT_NAME_MIN}–${SECT_NAME_MAX} ký tự)`, "độ dài tên tông môn");
    co(`(${SECT_TAG_MIN}–${SECT_TAG_MAX} ký tự)`, "độ dài biệt hiệu");
    co(`lời mời hết hạn ${giay(SECT_INVITE_TTL_MS)} giây`, "SECT_INVITE_TTL_MS");
    co(`phải chờ ${phut(SECT_REJOIN_COOLDOWN_MS)} phút`, "SECT_REJOIN_COOLDOWN_MS");
    co(`từ ${SECT_VAULT_SLOTS} ô lên tới ${SECT_VAULT_SLOTS_MAX} ô`, "ô kho tông");
    co(`tối đa ${SECT_DEPOSIT_DAY_CAP} cống hiến mỗi ngày`, "SECT_DEPOSIT_DAY_CAP");
    co(`(${SECT_SHOP.length} món,`, "số món cửa hàng tông môn (SECT_SHOP)");
    co(`có ${SECT_LEVELS.length} bậc theo điểm tông`, "số cấp tông");
    for (const l of SECT_LEVELS) co(`**${l.name}** (${nghin(l.points)})`, `cấp tông ${l.level}`);
    co(
      `tu vi ${SECT_LEVELS.slice(1)
        .map((l) => `+${Math.round((l.buff.exp - 1) * 100)}%`)
        .join(" / ")} (cấp 2-${SECT_LEVELS.length})`,
      "buff tu vi theo cấp tông",
    );
  });

  it("chuỗi cổng truyền tống khớp cổng thật của từng bản đồ; bản đồ 'đang xây dựng' đúng khi chưa có quái / NPC", () => {
    const tenMap = (id: string) => MAPS.find((m) => m.id === id)?.name ?? id;
    for (const m of MAPS)
      for (const p of m.portals ?? []) {
        const dich = MAPS.find((x) => x.id === p.toMap);
        if (!dich) continue; // cổng sang bản đồ không thuộc MAPS (bí cảnh): không có trong chuỗi
        const cong = dich.portals?.find((x) => x.id === p.toPortal);
        expect(cong, `${p.id} trỏ tới cổng ${p.toPortal} không có`).toBeDefined();
        const xuoi = `**${m.name}** (${p.name}) ↔ **${tenMap(dich.id)}** (${cong!.name})`;
        const nguoc = `**${tenMap(dich.id)}** (${cong!.name}) ↔ **${m.name}** (${p.name})`;
        co(
          doc.includes(xuoi) ? xuoi : nguoc,
          `cổng ${p.id} <-> ${p.toPortal} trong chuỗi cổng truyền tống`,
        );
      }
    const xay = ["lang_hoang", "uy_van"];
    const coNoiDung =
      MONSTERS.some((q) => xay.some((id) => (getMap(id)?.monsterCapOf(q.id) ?? 0) > 0)) ||
      NPCS.some((n) => n.mapId !== undefined && xay.includes(n.mapId));
    expect(
      doc.includes("Đang xây dựng"),
      "Lang Hoang / Uy Vân Kinh đã có quái hoặc NPC thì bỏ nhãn 'Đang xây dựng' và câu 'chưa có quái vật và NPC nhiệm vụ'; còn chưa có thì giữ",
    ).toBe(!coNoiDung);
  });

  it("bản đồ và quái ở Phụ lục khớp dữ liệu", () => {
    for (const m of [...MAPS, ...DUNGEON_MAPS])
      co(`| ${m.name} | ${m.w} × ${m.h} |`, `bản đồ ${m.id}`);
    // mọi quái sinh ra ở một bản đồ nào đó đều có tên trong bảng "Quái tiêu biểu"
    const bang = doc.slice(doc.indexOf("### Quái tiêu biểu theo vùng"), doc.indexOf("### Bản đồ"));
    for (const q of MONSTERS) {
      const sinh = [...MAPS, ...DUNGEON_MAPS].some(
        (d) => (getMap(d.id)?.monsterCapOf(q.id) ?? 0) > 0,
      );
      if (!sinh) continue;
      if (q.id === "yeu_vuong") continue; // trùm bí cảnh: có ở mục Bốn trùm, không ở bảng quái tiêu biểu theo vùng
      expect(bang.includes(`| ${q.name}`), `bảng quái tiêu biểu thiếu ${q.name}`).toBe(true);
    }
  });
});
