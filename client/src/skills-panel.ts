// Bảng Công pháp (M7.6, #507, docs/THIET_KE_THANH_CHIEU.md mục 4): chiêu ĐÃ HỌC + số THẬT (cùng hàm với máy chủ: `skillDamageMult`, `skillMpCost`,
// `skillCooldownMs`, `skillReqMet`) + gắn / gỡ ô 2-5. Lớp THUẦN: dựng mô hình hiển thị từ `SkillTracker` + `me`, không biết DOM (ui.ts vẽ), nên test được.
// Client KHÔNG đoán trước kết quả gắn ô: gửi `skillSlot {slot, skillId}` rồi chờ `skills` của máy chủ (từ chối thì máy chủ gửi lại sổ đúng và toast).
import {
  SKILL_MAX_LEVEL,
  TILE,
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
    case "stun":
      body = "";
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
  /** Chấm tầng "●●○" */
  pips: string;
  element: string;
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
    out.push(
      def.shape === "fan" && def.count
        ? `Sát thương: ${m} lần công mỗi tia`
        : `Sát thương: ${m} lần công`,
    );
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
  }
  return out;
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
    rows.push({
      id: def.id,
      name: def.name,
      level,
      pips: pipsText(Math.min(level, SKILL_MAX_LEVEL)),
      element: elementOf(def.element)?.name ?? "",
      shape: SHAPE_LABEL[def.shape] ?? "",
      stats: statLines(def, level, me.maxMp),
      effects: def.effects.map(effectText).filter((t) => t !== ""),
      need: skillReqMet(def, me.realm, me.tier) ? null : needText(def),
      desc: def.desc,
      book: def.bookName,
      slotNow,
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

/** Tin gắn ô gửi máy chủ: `skillId` "" = gỡ. */
export function slotMessage(slot: SkillSlot, skillId: string): SkillSlotMsg {
  return { slot, skillId };
}

/** Thông báo ngay tại chỗ khi bấm ô CHƯA MỞ (không gửi gì: máy chủ chắc chắn từ chối); `null` nếu ô mở. */
export function lockedSlotToast(slot: SkillSlot, me: Pick<SlotMe, "realm">): string | null {
  return slotOpen(slot, me.realm) ? null : `Ô chiêu thức ${slot} chưa mở: ${unlockText(slot)}.`;
}
