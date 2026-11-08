// Truyền âm (chat toàn server): lọc ký tự điều khiển, giới hạn độ dài và tần suất.
import type { World } from "../world";

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
  if (!text || w.now < c.nextChat) return;
  c.nextChat = w.now + COOLDOWN_MS;
  w.events.chat(p.name, text);
}
