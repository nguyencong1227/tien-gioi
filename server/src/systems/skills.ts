// Sổ chiêu của người chơi (M7.2a, docs/PHAN_CONG_M7.md mục 5.1): học chiêu từ kinh quyển, gắn chiêu vào ô L U I O, gửi sổ cho chủ.
// Luật (đủ cảnh giới, tầng tối đa, ô đã mở, đã học) nằm ở `shared/src/skills.ts` (`learnSkill`, `assignSlot`) để client hiển thị đúng điều
// server quyết định; file này chỉ nối luật với túi đồ, dữ liệu riêng của người chơi và tin nhắn. Dùng chiêu (cast) làm ở M7.2b.
import {
  LEARNABLE_SLOTS,
  SKILL_BY_ID,
  emptySkillBook,
  assignSlot,
  learnSkill,
  parseSkillSlot,
  realmLabel,
  type ItemDef,
  type SkillBook,
  type SkillsMsg,
} from "@tien-gioi/shared";
import type { World, PlayerCtrl } from "../world";
import { byId } from "./lookup";

/** Hồi chiêu còn lại (ms, >= 0, số nguyên) của bốn ô chiêu tại thời điểm `now`. */
export function cooldownsLeft(c: PlayerCtrl, now: number): SkillsMsg["cd"] {
  return c.skillCd.map((t) => Math.max(0, Math.ceil(t - now))) as SkillsMsg["cd"];
}

/** Gửi sổ chiêu + hồi chiêu còn lại cho chủ. Khi đổi sổ và lúc vào phòng; không gọi mỗi tick. */
export function sendSkills(w: World, sid: string) {
  const c = w.ctrl.get(sid);
  if (!c) return;
  const msg: SkillsMsg = {
    learned: { ...c.skills.learned },
    slots: [...c.skills.slots] as SkillsMsg["slots"],
    cd: cooldownsLeft(c, w.now),
  };
  w.events.skills(sid, msg);
}

/** Sổ chiêu của kiếp mới: trống, trừ các chiêu đã khắc vào chân linh (giữ ở tầng 1, ô trống: người chơi tự gắn lại). */
export function rebirthSkills(engraved: readonly string[]): SkillBook {
  const book = emptySkillBook();
  for (const id of engraved) if (byId(SKILL_BY_ID, id)) book.learned[id] = 1;
  return book;
}

/**
 * Đọc kinh quyển `def` (gọi từ `useItem` khi vật phẩm là `book`): học chiêu (hoặc +1 tầng nếu đã học). Trả về `true` nếu đã học: KHI ĐÓ
 * người gọi mới trừ quyển khỏi túi và gửi túi (`useItem`; hai bước liền nhau trong một lần xử lý, không `await`), còn lỗi (chưa đủ cảnh giới,
 * đã tối đa, quyển hỏng) thì quyển còn nguyên. Học lần đầu và còn ô đã mở trống thì tự gắn vào ô trống đầu tiên.
 */
export function learnFromBook(w: World, sid: string, def: ItemDef): boolean {
  const r = w.ready(sid);
  if (!r) return false;
  const { p, c } = r;
  const skill = byId(SKILL_BY_ID, def.teaches);
  if (!skill) {
    w.events.toast(sid, { text: "Kinh quyển này đã mờ hết chữ, không đọc được.", tone: "bad" });
    return false;
  }
  const res = learnSkill(c.skills, skill.id, p.realm, p.tier);
  if (!res.ok) {
    const text =
      res.reason === "realm"
        ? `Cần đạt ${realmLabel(skill.reqRealm, skill.reqTier)} mới học được ${skill.name}.`
        : res.reason === "maxed"
          ? `${skill.name} đã đạt tầng cao nhất.`
          : "Kinh quyển này đã mờ hết chữ, không đọc được.";
    w.events.toast(sid, { text, tone: res.reason === "maxed" ? "info" : "bad" });
    return false;
  }
  const first = res.level === 1;
  let book = res.book;
  let slotted = 0;
  if (first) {
    // Ô đã mở luôn đứng trước ô chưa mở (`SLOT_UNLOCK_REALM` tăng dần), nên ô trống đầu tiên là ô đã mở còn trống; nếu nó chưa mở
    // thì `assignSlot` từ chối và chiêu chỉ vào sổ (người chơi gắn tay khi mở ô).
    const idx = book.slots.indexOf("");
    if (idx >= 0) {
      const a = assignSlot(book, LEARNABLE_SLOTS[idx], skill.id, p.realm);
      if (a.ok) {
        book = a.book;
        slotted = LEARNABLE_SLOTS[idx];
      }
    }
  }
  c.skills = book;
  sendSkills(w, sid);
  w.events.toast(sid, {
    text: first
      ? `Đã học ${skill.name}${slotted ? ` (ô ${slotted})` : ""}.`
      : `${skill.name} lên tầng ${res.level}.`,
    tone: "good",
  });
  w.audit?.("skill.learn", { name: p.name, skill: skill.id, level: res.level, book: def.id });
  return true;
}

/** Tin `skillSlot`: gắn chiêu vào ô (`skillId` rỗng = gỡ). Kiểm kiểu, ô đã mở, chiêu đã học (`assignSlot`); client không tin được. */
export function skillSlot(w: World, sid: string, raw: unknown) {
  const r = w.ready(sid);
  if (!r) return;
  const m = parseSkillSlot(raw);
  if (!m) return;
  const { p, c } = r;
  const res = assignSlot(c.skills, m.slot, m.skillId, p.realm);
  if (!res.ok) {
    const text =
      res.reason === "locked"
        ? "Ô chiêu thức này chưa mở."
        : res.reason === "notLearned"
          ? "Ngươi chưa học chiêu này."
          : "Không gắn được chiêu vào ô này.";
    w.events.toast(sid, { text, tone: "bad" });
    sendSkills(w, sid); // đồng bộ lại để client bỏ lựa chọn sai
    return;
  }
  c.skills = res.book;
  sendSkills(w, sid);
}
