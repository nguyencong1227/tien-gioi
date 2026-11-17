// Vẽ thanh máu TRÙM (T4 #873) từ `BossBarModel` (`boss-bar.ts`). Chỉ `createElement` + `textContent` (không `innerHTML`); cập nhật CÓ ĐIỀU KIỆN (chỉ ghi DOM khi giá trị đổi) vì gọi ~10 lần / giây.
// Kênh thông tin KHÔNG chỉ bằng màu (người mù màu): tên chiêu bằng CHỮ, vạch giai đoạn có số, chỉ báo cuồng nộ bằng chữ + biểu tượng, `progressbar` có `aria-valuetext`.
import { showArtImage } from "./art-image";
import { bossBarText, type BossBarModel } from "./boss-bar";
import { bossCardTarget } from "./boss-card";
import { applyMapCard, type CardImg } from "./map-card";

export class BossBarDom {
  private readonly root: HTMLElement;
  private readonly name: HTMLElement;
  private readonly phase: HTMLElement;
  private readonly enrage: HTMLElement;
  private readonly track: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly hp: HTMLElement;
  private readonly cast: HTMLElement;
  private readonly castFill: HTMLElement;
  private readonly notes: HTMLElement;
  private readonly armor: HTMLElement;
  private readonly summon: HTMLElement;
  private markKey = "";
  private shownId: string | null = null;
  /** Ảnh đại diện trùm (thẻ minh hoạ, tuỳ chọn: thiếu phần tử thì bỏ qua) và hàm huỷ yêu cầu tải ảnh đang chờ. */
  private readonly art: (HTMLImageElement & CardImg) | null;
  private cancelArt: (() => void) | null = null;

  constructor(private readonly doc: Document) {
    const get = (id: string) => {
      const e = doc.getElementById(id);
      if (!e) throw new Error(`Thiếu phần tử #${id} của thanh máu trùm`);
      return e;
    };
    this.root = get("boss-bar");
    this.name = get("boss-bar-name");
    this.phase = get("boss-bar-phase");
    this.enrage = get("boss-bar-enrage");
    this.track = get("boss-bar-track");
    this.fill = get("boss-bar-fill");
    this.hp = get("boss-bar-hp");
    this.cast = get("boss-bar-cast");
    this.castFill = get("boss-bar-castfill");
    this.notes = get("boss-bar-notes");
    this.armor = get("boss-bar-armor");
    this.summon = get("boss-bar-summon");
    const art = doc.getElementById("boss-bar-art");
    this.art = art instanceof HTMLImageElement ? art : null;
  }

  /** Bỏ yêu cầu ảnh đang chờ và ẩn ảnh đại diện (không còn trùm / đổi trùm). */
  private clearArt(): void {
    this.cancelArt?.();
    this.cancelArt = null;
    if (this.art) applyMapCard(this.art, null);
  }

  /** Cập nhật thanh theo mô hình; `null` = ẩn thanh. */
  update(m: BossBarModel | null): void {
    if (!m) {
      if (!this.root.hidden) this.root.hidden = true;
      if (this.shownId !== null) this.clearArt();
      this.shownId = null;
      return;
    }
    if (this.root.hidden) this.root.hidden = false;
    if (this.shownId !== m.id) {
      this.shownId = m.id;
      this.markKey = ""; // trùm khác: dựng lại vạch
      // thẻ minh hoạ của loại trùm này (gói `art:trum` tải theo nhu cầu); chưa có thẻ / chưa tải xong thì ảnh ẩn, thanh chỉ có tên như cũ
      this.clearArt();
      const target = bossCardTarget(m.kind);
      if (target && this.art) this.cancelArt = showArtImage(this.art, target);
    }
    setText(this.name, m.name);
    setText(this.phase, m.phaseCount > 1 ? `Giai đoạn ${m.phase + 1} / ${m.phaseCount}` : "");
    this.phase.hidden = m.phaseCount <= 1;
    setText(this.hp, `${m.hp.toLocaleString("vi-VN")} / ${m.maxHp.toLocaleString("vi-VN")}`);
    const pct = `${Math.round(m.frac * 1000) / 10}%`;
    if (this.fill.style.width !== pct) this.fill.style.width = pct;
    this.track.setAttribute("aria-valuenow", String(Math.round(m.frac * 100)));
    this.track.setAttribute("aria-valuetext", bossBarText(m));
    // vạch đổi giai đoạn: dựng lại chỉ khi bộ mốc đổi (một lần cho mỗi trùm), kèm số thứ tự giai đoạn
    const key = m.marks.join(",");
    if (key !== this.markKey) {
      this.markKey = key;
      this.track.querySelectorAll(".boss-bar-mark").forEach((e) => e.remove());
      m.marks.forEach((p, i) => {
        const tick = this.doc.createElement("i");
        tick.className = "boss-bar-mark";
        tick.style.left = `${p}%`;
        tick.title = `Mốc giai đoạn ${i + 2}`;
        tick.setAttribute("aria-hidden", "true");
        this.track.append(tick);
      });
    }
    // chiêu đang vận: TÊN bằng chữ (kênh thứ hai ngoài vùng cảnh báo trên đất) + thanh tiến độ gồng mảnh
    setText(this.cast, m.castName ? `Đang vận: ${m.castName}` : "");
    const cf = m.castName ? `${Math.round(m.castFrac * 100)}%` : "0%";
    if (this.castFill.style.width !== cf) this.castFill.style.width = cf;
    this.castFill.parentElement!.hidden = !m.castName;
    this.enrage.hidden = !m.enraged;
    // giáp + gọi quái con bằng CHỮ (không chỉ vầng màu quanh trùm): người chơi biết vì sao sát thương tụt và lúc nào giáp hết
    const armorText = m.armor
      ? `🛡 Giáp: nhận ${m.armor.pct}% sát thương (${Math.max(1, Math.ceil(m.armor.leftMs / 1000))} s)`
      : "";
    setText(this.armor, armorText);
    this.armor.hidden = !m.armor;
    setText(this.summon, m.summonN !== null ? `Gọi ${m.summonN} quái con` : "");
    this.summon.hidden = m.summonN === null;
    this.notes.hidden = !m.armor && m.summonN === null;
    toggle(this.root, "roaring", m.roaring);
    toggle(this.root, "enrage-flash", m.enrageFlash);
    toggle(this.root, "casting", m.castName !== null);
    toggle(this.root, "armored", m.armor !== null);
  }
}

function setText(e: HTMLElement, t: string): void {
  if (e.textContent !== t) e.textContent = t;
}
function toggle(e: HTMLElement, cls: string, on: boolean): void {
  if (e.classList.contains(cls) !== on) e.classList.toggle(cls, on);
}
