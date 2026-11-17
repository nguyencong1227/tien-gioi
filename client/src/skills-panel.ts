// Bảng Công pháp (M7.6, #507, docs/THIET_KE_THANH_CHIEU.md mục 4): chiêu ĐÃ HỌC + số THẬT (cùng hàm với máy chủ: `skillDamageMult`, `skillMpCost`,
// `skillCooldownMs`, `skillReqMet`) + gắn / gỡ ô 2-5. Lớp THUẦN: dựng mô hình hiển thị từ `SkillTracker` + `me`, không biết DOM (ui.ts vẽ), nên test được.
// Client KHÔNG đoán trước kết quả gắn ô: gửi `skillSlot {slot, skillId}` rồi chờ `skills` của máy chủ (từ chối thì máy chủ gửi lại sổ đúng và toast).
import {
  SKILL_MAX_LEVEL,
  skillMaxLevelOf,
  TILE,
  WINDUP_SLOW,
  elementOf,
  skillCooldownMs,
  skillDamageMult,
  skillMpCost,
  skillReqMet,
  slotOpen,
  statusOf,
  type SkillDef,
  type SkillEffect,
  type SkillShape,
  type SkillSlot,
  type SkillSlotMsg,
} from "@tien-gioi/shared";
import { BAR_SLOTS, needText, unlockText, type SkillTracker, type SlotMe } from "./skill-bar";
import { pipsText } from "./skill-bar-dom";
import { masteryView, type MasteryView } from "./skill-mastery";
import { gradeName, skillGradeOf, skillStyleOf, styleName } from "./skill-meta";

/** Số thập phân kiểu Việt ("1,84"), tối đa `digits` chữ số, bỏ số 0 thừa ("2" chứ không "2,00"). */
export function fmtNum(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "0";
  const raw = n.toFixed(digits);
  // chỉ bỏ số 0 thừa của PHẦN THẬP PHÂN ("40" ở digits = 0 không có dấu chấm: giữ nguyên)
  const s = raw.includes(".") ? raw.replace(/\.?0+$/, "") : raw;
  return s.replace(".", ",");
}

/** Tên kiểu đánh, để người chơi hiểu chiêu đánh thế nào. */
export const SHAPE_LABEL: Readonly<Record<SkillShape, string>> = {
  cone: "Quạt trước mặt",
  line: "Tia thẳng",
  fan: "Toả nhiều tia",
  nova: "Vòng nổ quanh mình",
  ground: "Vùng đặt xuống đất",
  dash: "Lao tới, né đòn",
  self: "Hộ thể quanh mình",
  // hình mới (mục 51, CT1b)
  chain: "Sét lan sang mục tiêu gần",
  bolt: "Đạn bay",
  zone: "Vùng duy trì",
  trap: "Bẫy",
  aura: "Hào quang quanh thân",
  totem: "Tượng triệu hồi",
};

const seconds = (ms: number): string => fmtNum(ms / 1000, 1);
const pct = (r: number): string => fmtNum(r * 100, 0);

/** Một dòng mô tả hiệu ứng gắn kèm chiêu (tên + thời gian + cường độ theo loại + xác suất). Trạng thái lạ -> chuỗi rỗng. */
export function effectText(e: SkillEffect): string {
  const st = statusOf(e.status);
  if (!st) return "";
  const head = `${st.name} ${seconds(e.ms)} giây`;
  let body: string;
  switch (st.kind) {
    case "dot":
      body = ` (${pct(e.ratio)}% sát thương gốc mỗi giây)`;
      break;
    case "slow":
      body = ` (giảm tốc ${pct(e.ratio)}%)`;
      break;
    case "vuln":
      body = ` (nhận thêm ${pct(e.ratio)}% sát thương)`;
      break;
    case "shield":
      body = ` (chắn ${pct(e.ratio)}% khí huyết tối đa)`;
      break;
    case "haste":
      body = ` (tăng tốc ${pct(e.ratio)}%)`;
      break;
    case "regen":
      body = ` (hồi ${pct(e.ratio)}% khí huyết tối đa mỗi giây)`;
      break;
    case "breakAid":
      body = ` (cộng ${pct(e.ratio)}% xác suất đột phá lần kế)`;
      break;
    case "amp":
      body = ` (tăng ${pct(e.ratio)}% sát thương chiêu cùng hệ)`;
      break;
    case "cdr":
      body = ` (giảm ${pct(e.ratio)}% hồi chiêu)`;
      break;
    case "stun":
      body = "";
      break;
    case "empower":
      body = ` (tăng ${pct(e.ratio)}% sát thương mọi chiêu)`;
      break;
    case "weaken":
      body = ` (gây ít hơn ${pct(e.ratio)}% sát thương, trùm chỉ chịu một nửa)`;
      break;
    case "mark":
      body = " (chiêu cùng hệ đánh vào sẽ ăn combo)";
      break;
  }
  const who = st.harmful ? "" : ", cho bản thân";
  const chance = e.chance < 1 ? `${pct(e.chance)}% khả năng: ` : "";
  return `${chance}${head}${body}${who}`;
}

export interface SlotButton {
  slot: SkillSlot;
  /** Chiêu đang nằm ở ô này */
  here: boolean;
  /** Ô đã mở ở cảnh giới hiện tại */
  open: boolean;
  /** Tên chiêu khác đang chiếm ô (gắn vào sẽ thay nó), "" nếu trống / chính chiêu này */
  occupant: string;
  /** Nhãn trên nút ("Ô 2") và mô tả đầy đủ cho `aria-label` / `title` */
  label: string;
  aria: string;
  /** Thông báo khi bấm ô CHƯA MỞ (không gửi gì), null nếu ô mở */
  blocked: string | null;
}

export interface SkillRow {
  id: string;
  name: string;
  level: number;
  /** Tầng tối đa của chiêu này (`skillMaxLevelOf`: Hoàng 3 / Huyền 4 / Địa 5 / Thiên 6) */
  maxLevel: number;
  /** Chấm tầng "●●○" (số chấm = `maxLevel`) */
  pips: string;
  /** Thanh / dòng luyện chiêu (`skill-mastery.ts`); `null` khi máy chủ chưa gửi điểm luyện */
  mastery: MasteryView | null;
  element: string;
  /** id hệ ("hoa"...), để lọc theo hệ; `element` là tên hiển thị */
  elementId: string;
  /** Phẩm 0 Hoàng .. 3 Thiên (`skill-meta.ts`) và tên hiển thị */
  grade: number;
  gradeName: string;
  /** Phong cách (`SKILL_STYLES`) chọn hình biểu tượng, và tên hiển thị */
  style: string;
  styleName: string;
  shape: string;
  /** Dòng số THẬT: sát thương, linh lực, hồi chiêu, tầm */
  stats: string[];
  effects: string[];
  /** "Cần đạt ..." khi chưa đủ cảnh giới để DÙNG (kiếp mới giữ chiêu khắc), không thì null */
  need: string | null;
  desc: string;
  book: string;
  /** Ô đang gắn (2-5) hoặc null */
  slotNow: SkillSlot | null;
  /** Hàng GỌN (một hàng mỗi chiêu): nhãn ô ("Ô 3" hoặc "Chưa gắn"), dòng phụ ("Hỏa · tầng 2") và `aria-label` của nút hàng (mở chi tiết) */
  slotLabel: string;
  sub: string;
  aria: string;
  slots: SlotButton[];
  /** Nhãn nút gỡ ("Gỡ khỏi ô 3") khi đang gắn, không thì null */
  unequip: string | null;
}

export interface SkillsPanelModel {
  rows: SkillRow[];
  /** "3 chiêu đã học" */
  count: string;
  /** Câu hiện khi chưa học chiêu nào, không thì null */
  empty: string | null;
}

/** Các dòng số của một chiêu ở tầng `level` (cùng công thức máy chủ). */
export function statLines(def: SkillDef, level: number, maxMp: number): string[] {
  const out: string[] = [];
  if (def.mult > 0) {
    const m = fmtNum(def.mult * skillDamageMult(level));
    out.push(`Sát thương: ${m} lần công${damageUnit(def)}`);
  } else {
    out.push("Không gây sát thương");
  }
  out.push(`Linh lực: ${skillMpCost(def, maxMp)} (${pct(def.mpPct)}% tối đa)`);
  // Hồi chiêu GỐC theo tầng: `cdr = 0` = chưa tính giảm hồi chiêu từ trang bị (máy chủ tính `cdrOf` rồi gửi tổng `SkillsMsg.cdMax`, client không biết `cdr`);
  // vòng quét trên thanh chiêu dùng `cdMax` thật nên đúng với trang bị đang mặc, còn bảng này nêu số gốc của chiêu.
  out.push(`Hồi chiêu: ${seconds(skillCooldownMs(def, level, 0))} giây`);
  const tiles = (px: number): string => fmtNum(px / TILE, 1);
  switch (def.shape) {
    case "cone":
    case "line":
    case "nova":
      out.push(`Tầm: ${tiles(def.range)} ô`);
      break;
    case "fan":
      out.push(`Tầm: ${tiles(def.range)} ô${def.count ? `, ${def.count} tia` : ""}`);
      break;
    case "ground":
      out.push(`Vùng: bán kính ${tiles(def.range)} ô, đặt cách ${tiles(def.reach ?? 0)} ô`);
      break;
    case "dash":
      out.push(`Lao: ${tiles(def.reach ?? def.range)} ô`);
      break;
    case "self":
      break;
    // hình mới (mục 51, CT1b): số liệu riêng của từng hình (nảy, đạn, vùng / bẫy / hào quang / tượng)
    case "chain":
      out.push(`Tầm: ${tiles(def.range)} ô`);
      out.push(
        def.bounces && def.bounces > 0
          ? `Sét lan: nảy ${def.bounces} lần, tầm nhảy ${tiles(def.chainReach ?? 0)} ô, mỗi lần còn ${pct(def.falloff ?? CHAIN_FALLOFF_DEFAULT)}% sát thương`
          : "Sét lan: không nảy",
      );
      break;
    case "bolt": {
      const parts = [`Tầm: ${tiles(def.range)} ô`];
      if (def.speed) parts.push(`bay ${fmtNum(def.speed / TILE, 1)} ô/giây`);
      if (def.count && def.count > 1) parts.push(`${def.count} viên`);
      if (def.pierce) parts.push(`xuyên ${def.pierce} quái`);
      if (def.bounce) parts.push(`nảy ${def.bounce} lần`);
      out.push(parts.join(", "));
      break;
    }
    case "zone":
      out.push(
        `Vùng: bán kính ${tiles(def.range)} ô, đặt cách ${tiles(def.reach ?? 0)} ô${lasting(def)}`,
      );
      break;
    case "trap":
      out.push(
        `Bẫy: bán kính ${tiles(def.range)} ô, đặt cách ${tiles(def.reach ?? 0)} ô, kích hoạt sau ${seconds(def.armMs ?? 0)} giây, tồn tại ${seconds(def.durationMs ?? 0)} giây, nổ một lần`,
      );
      break;
    case "aura":
      out.push(`Hào quang: bán kính ${tiles(def.range)} ô, bám theo người${lasting(def)}`);
      break;
    case "totem":
      out.push(
        `Tượng: tầm ${tiles(def.range)} ô, đặt cách ${tiles(def.reach ?? 0)} ô${lasting(def)}${def.taunt ? ", thu hút quái" : ""}`,
      );
      break;
  }
  // trường chung của mục 51 (mọi hình có thể mang): chiêu vận, kéo / đẩy, combo, đồng đội
  if (def.windupMs) {
    out.push(
      `Vận khí: ${seconds(def.windupMs)} giây rồi mới đáp (lúc vận đi chậm ${pct(WINDUP_SLOW)}%, bị choáng thì huỷ)`,
    );
  }
  if (def.displace) {
    out.push(
      `${def.displace.dir === "pull" ? "Kéo" : "Đẩy"} mục tiêu ${tiles(def.displace.px)} ô (trùm miễn, tinh anh nửa quãng)`,
    );
  }
  if (def.combo) {
    const needs = statusOf(def.combo.needs)?.name ?? "";
    if (needs !== "") {
      const fx = def.combo.apply ? `, gắn ${effectText(def.combo.apply)}` : "";
      out.push(
        `Combo: đánh vào mục tiêu đang mang ${needs} thì sát thương x${fmtNum(def.combo.mult ?? COMBO_MULT_DEFAULT)}${def.combo.consume ? `, gỡ ${needs}` : ""}${fx}`,
      );
    }
  }
  if (def.ally) out.push(`Hiệu ứng có lợi cũng lên đồng đội trong ${tiles(def.ally.range)} ô`);
  return out;
}

/** Hệ số mặc định khi dữ liệu không ghi (đúng chú thích của `SkillDef`): sét lan còn 85% mỗi lần nảy, combo nhân 1,4. */
const CHAIN_FALLOFF_DEFAULT = 0.85;
const COMBO_MULT_DEFAULT = 1.4;

/** Hậu tố của dòng "Sát thương": con số `mult` áp cho MỖI đơn vị nào (tia, viên, nhịp, đòn đầu). */
function damageUnit(def: SkillDef): string {
  switch (def.shape) {
    case "fan":
      return def.count ? " mỗi tia" : "";
    case "bolt":
      return def.count && def.count > 1 ? " mỗi viên" : "";
    case "zone":
    case "aura":
    case "totem":
      return " mỗi nhịp";
    case "chain":
      return def.bounces && def.bounces > 0 ? " ở đòn đầu" : "";
    default:
      return "";
  }
}

/** ", tồn tại X giây, mỗi Y giây" của vật thể bền (thiếu số thì bỏ phần đó, không in "0 giây"). */
function lasting(def: SkillDef): string {
  const dur = def.durationMs ? `, tồn tại ${seconds(def.durationMs)} giây` : "";
  const tick = def.tickMs ? `, mỗi ${seconds(def.tickMs)} giây` : "";
  return dur + tick;
}

/** Dựng mô hình bảng từ sổ chiêu của mình. `me` = cảnh giới, bậc, linh lực tối đa hiện tại (đổi thì dựng lại). */
export function buildSkillsPanel(skills: SkillTracker, me: SlotMe): SkillsPanelModel {
  const rows: SkillRow[] = [];
  for (const { def, level } of skills.learnedList()) {
    const slotNow = BAR_SLOTS.find((s) => skills.skillAt(s) === def.id) ?? null;
    const slots: SlotButton[] = BAR_SLOTS.map((slot) => {
      const open = slotOpen(slot, me.realm);
      const here = slotNow === slot;
      const otherId = skills.skillAt(slot);
      const other =
        !here && otherId !== ""
          ? skills.learnedList().find((x) => x.def.id === otherId)?.def
          : undefined;
      const occupant = other?.name ?? "";
      const label = `Ô ${slot}`;
      let aria: string;
      if (!open) aria = `Ô ${slot} chưa mở: ${unlockText(slot)}`;
      else if (here) aria = `${def.name} đang ở ô ${slot}`;
      else aria = `Gắn ${def.name} vào ô ${slot}${occupant ? `, thay ${occupant}` : ""}`;
      return { slot, here, open, occupant, label, aria, blocked: lockedSlotToast(slot, me) };
    });
    const element = elementOf(def.element)?.name ?? "";
    const need = skillReqMet(def, me.realm, me.tier) ? null : needText(def);
    const grade = skillGradeOf(def);
    const maxLevel = skillMaxLevelOf(def);
    const style = skillStyleOf(def);
    const slotLabel = slotNow === null ? "Chưa gắn" : `Ô ${slotNow}`;
    rows.push({
      id: def.id,
      name: def.name,
      level,
      maxLevel,
      pips: pipsText(level, maxLevel),
      mastery: masteryView(def, level, skills.masteryOf(def.id), maxLevel, skills.masteryKnown),
      element,
      elementId: def.element,
      grade,
      gradeName: gradeName(grade),
      style,
      styleName: styleName(style),
      shape: SHAPE_LABEL[def.shape] ?? "",
      stats: statLines(def, level, me.maxMp),
      effects: def.effects.map(effectText).filter((t) => t !== ""),
      need,
      desc: def.desc,
      book: def.bookName,
      slotNow,
      slotLabel,
      sub: [element, `tầng ${level}`].filter((t) => t !== "").join(" · "),
      aria: rowAria(def.name, element, level, slotNow, need, gradeName(grade), maxLevel),
      slots,
      unequip: slotNow === null ? null : `Gỡ khỏi ô ${slotNow}`,
    });
  }
  return {
    rows,
    count: `${rows.length} chiêu đã học`,
    empty:
      rows.length === 0 ? "Chưa học chiêu nào. Đọc kinh quyển trong Túi đồ để học chiêu." : null,
  };
}

/** `aria-label` của nút hàng gọn: đọc đủ tên, hệ, tầng, ô đang giữ (chấm tầng "●●○" đọc không ra tiếng), và điều kiện cảnh giới nếu thiếu. */
export function rowAria(
  name: string,
  element: string,
  level: number,
  slotNow: SkillSlot | null,
  need: string | null,
  grade = "",
  maxLevel: number = SKILL_MAX_LEVEL,
): string {
  const parts = [name];
  if (element) parts.push(`hệ ${element}`);
  if (grade) parts.push(`phẩm ${grade}`);
  parts.push(`tầng ${level} trên ${maxLevel}`);
  parts.push(slotNow === null ? "chưa gắn ô" : `đang ở ô ${slotNow}`);
  if (need) parts.push(need.charAt(0).toLowerCase() + need.slice(1));
  return parts.join(", ");
}

/**
 * Bảng gọn chỉ mở MỘT chi tiết mỗi lúc (kiểu rèm gập): bấm hàng đang mở thì gập, bấm hàng khác thì chuyển sang hàng đó.
 * Hàng đang mở mà không còn trong danh sách (sổ chiêu đổi lúc đang mở) thì coi như đã gập.
 */
export function nextOpenSkill(current: string | null, clicked: string): string | null {
  return current === clicked ? null : clicked;
}
export function resolveOpenSkill(
  current: string | null,
  rows: readonly Pick<SkillRow, "id">[],
): string | null {
  return current !== null && rows.some((r) => r.id === current) ? current : null;
}

/** Tin gắn ô gửi máy chủ: `skillId` "" = gỡ. */
export function slotMessage(slot: SkillSlot, skillId: string): SkillSlotMsg {
  return { slot, skillId };
}

/** Thông báo ngay tại chỗ khi bấm ô CHƯA MỞ (không gửi gì: máy chủ chắc chắn từ chối); `null` nếu ô mở. */
export function lockedSlotToast(slot: SkillSlot, me: Pick<SlotMe, "realm">): string | null {
  return slotOpen(slot, me.realm) ? null : `Ô chiêu thức ${slot} chưa mở: ${unlockText(slot)}.`;
}
