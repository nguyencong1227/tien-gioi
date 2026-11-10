// Truyền âm (chat toàn server): lọc ký tự điều khiển, giới hạn độ dài và tần suất.
import type { World } from "../world";
import { giveCommand } from "./inventory";
import { partyChat } from "./party";
import { sectChat } from "./sect";

const MAX_LEN = 120;
const COOLDOWN_MS = 800;

export function chat(w: World, sid: string, raw: unknown) {
  const p = w.state.players.get(sid);
  const c = w.ctrl.get(sid);
  if (!p || !c || typeof raw !== "string") return;
  const text = raw
    .normalize("NFC")
    .replace(/[\u0000-\u001f]/g, "")
    .trim()
    .slice(0, MAX_LEN);
  if (!text) return;
  // Lệnh thử nghiệm (không gửi ra kênh chat)
  if (text.startsWith("/give")) return giveCommand(w, sid, text.split(/\s+/).slice(1));
  if (w.now < c.nextChat) return;
  // Chat đội: `/p <nội dung>` (cùng hồi chiêu với chat chung)
  const party = /^\/p(?:\s+(.*))?$/i.exec(text);
  if (party) {
    const msg = party[1]?.trim();
    if (!msg) return;
    c.nextChat = w.now + COOLDOWN_MS;
    return partyChat(w, sid, msg);
  }
  // Chat tông môn: `/s <nội dung>` (cùng hồi chiêu)
  const sect = /^\/s(?:\s+(.*))?$/i.exec(text);
  if (sect) {
    const msg = sect[1]?.trim();
    if (!msg) return;
    c.nextChat = w.now + COOLDOWN_MS;
    return sectChat(w, sid, msg);
  }
  c.nextChat = w.now + COOLDOWN_MS;
  w.events.chat(p.name, text);
}
