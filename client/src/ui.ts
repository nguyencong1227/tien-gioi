// Lớp giao diện DOM (HUD, chat, nút kỹ năng). Tách khỏi Phaser để dễ làm responsive.
import { realmLabel, isLastTier, isPeak, type ChatOut, type ToastMsg } from "@tien-gioi/shared";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export interface HudPlayer {
  name: string; realm: number; tier: number;
  hp: number; maxHp: number; mp: number; maxMp: number; exp: number; expMax: number;
  meditating: boolean; dead: boolean;
}

const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}k` : `${Math.floor(n)}`);

export const ui = {
  show() { $("ui").hidden = false; $("login").hidden = true; },

  hud(p: HudPlayer, online: number) {
    $("hud-name").textContent = p.name;
    $("hud-realm").textContent = realmLabel(p.realm, p.tier);
    const set = (k: string, v: number, max: number, label: string) => {
      $(`${k}-fill`).style.width = `${Math.max(0, Math.min(1, v / max)) * 100}%`;
      $(`${k}-text`).textContent = `${label} ${fmt(v)} / ${fmt(max)}`;
    };
    set("hp", p.hp, p.maxHp, "Khí huyết");
    set("mp", p.mp, p.maxMp, "Linh lực");
    set("exp", p.exp, p.expMax, "Tu vi");
    $("hud-online").textContent = `Đạo hữu trực tuyến: ${online}`;
    $("sk-med").classList.toggle("on", p.meditating);
    const canBreak = isLastTier(p.realm, p.tier) && p.exp >= p.expMax && !isPeak(p.realm, p.tier);
    $("sk-break").classList.toggle("ready", canBreak);
  },

  cooldown(id: "sk-slash" | "sk-sword", frac: number) {
    ($(id).querySelector(".cd") as HTMLElement).style.transform = `scaleY(${Math.max(0, Math.min(1, frac))})`;
  },

  chat(m: ChatOut) {
    const log = $("chat-log");
    const p = document.createElement("p");
    if (m.sys) { p.className = "sys"; p.textContent = m.text; }
    else { const b = document.createElement("b"); b.textContent = `${m.from}: `; p.append(b, document.createTextNode(m.text)); }
    const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 8;
    log.append(p);
    while (log.children.length > 60) log.firstChild!.remove();
    if (atBottom) log.scrollTop = log.scrollHeight;
  },

  toast(m: ToastMsg) {
    const p = document.createElement("p");
    p.className = m.tone ?? "info";
    p.textContent = m.text;
    $("toast").append(p);
    setTimeout(() => p.remove(), 3000);
  },

  death(secondsLeft: number | null) {
    $("death").hidden = secondsLeft === null;
    if (secondsLeft !== null) $("death-t").textContent = `Hồi sinh tại Lạc Hà Trấn sau ${secondsLeft}s`;
  },
};
