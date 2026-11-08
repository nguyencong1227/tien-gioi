// Lớp giao diện DOM (HUD, chat, nút kỹ năng, túi đồ, thanh đan dược, nhặt đồ).
// Tách khỏi Phaser để dễ làm responsive trên điện thoại và máy tính.
import {
  INVENTORY_SLOTS,
  ITEM_BY_ID,
  RARITY_COLORS,
  RARITY_NAMES,
  emptyInventory,
  realmLabel,
  isLastTier,
  isPeak,
  type ChatOut,
  type ToastMsg,
  type InvMsg,
  type Inventory,
  type ItemDef,
} from "@tien-gioi/shared";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export interface HudPlayer {
  name: string;
  realm: number;
  tier: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  exp: number;
  expMax: number;
  meditating: boolean;
  dead: boolean;
}

export interface InventoryCallbacks {
  onUse: (slot: number) => void;
  onDrop: (slot: number, qty?: number) => void;
  onPickup: () => void;
}

const fmt = (n: number) =>
  n >= 1e6
    ? `${(n / 1e6).toFixed(1)}M`
    : n >= 1e4
      ? `${(n / 1e3).toFixed(1)}k`
      : `${Math.floor(n)}`;

const hexColor = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

// Trạng thái túi đồ phía client (chỉ để hiển thị, server quyết định mọi kết quả)
let invSlots: Inventory = emptyInventory();
const itemCdUntil = new Map<string, number>();
let selectedSlot = 0;
let invOpen = false;
let callbacks: InventoryCallbacks | null = null;
const slotEls: HTMLButtonElement[] = [];
const slotIconEls: HTMLElement[] = [];
const slotNameEls: HTMLElement[] = [];
const slotQtyEls: HTMLElement[] = [];
const slotCdEls: HTMLElement[] = [];

/** Áp biểu tượng vật phẩm (ảnh asset thật kèm màu nền dự phòng). */
function applyItemVisual(el: HTMLElement, def: ItemDef | undefined) {
  if (!def) {
    el.style.backgroundImage = "none";
    el.style.backgroundColor = "transparent";
    return;
  }
  const color = hexColor(def.color);
  el.style.backgroundColor = color;
  el.style.backgroundImage = `url("/assets/items/${def.id}.png"), radial-gradient(circle at 35% 30%, rgba(255,255,255,0.65), ${color} 70%)`;
}

/** Chọn 2 loại đan dược cho 2 ô dùng nhanh (ưu tiên Hồi Huyết Đan & Hồi Linh Đan, sau đó tới đan khác có trong túi). */
function resolveQuickItems(): [string, string] {
  const consumablesInBag: string[] = [];
  for (const s of invSlots) {
    if (!s) continue;
    const def = ITEM_BY_ID[s.itemId];
    if (def?.type === "consumable" && !consumablesInBag.includes(def.id)) {
      consumablesInBag.push(def.id);
    }
  }
  const pick = (preferred: string, exclude?: string): string => {
    if (consumablesInBag.includes(preferred) && preferred !== exclude) return preferred;
    const alt = consumablesInBag.find((id) => id !== exclude);
    return alt ?? preferred;
  };
  const q1 = pick("hoi_huyet_dan");
  const q2 = pick("hoi_linh_dan", q1);
  return [q1, q2];
}

function renderSlotDetail() {
  const s = invSlots[selectedSlot];
  const def = s ? ITEM_BY_ID[s.itemId] : undefined;
  const nameEl = $("inv-item-name");
  const rarityEl = $("inv-item-rarity");
  const descEl = $("inv-item-desc");
  const actionsEl = $("inv-actions");
  const useBtn = $("inv-btn-use") as HTMLButtonElement;
  const drop1Btn = $("inv-btn-drop1") as HTMLButtonElement;

  if (!s || !def) {
    nameEl.textContent = "Ô trống";
    nameEl.style.color = "";
    rarityEl.textContent = "";
    rarityEl.style.color = "";
    descEl.textContent = "Chạm hoặc rê chuột vào một ô có vật phẩm để xem mô tả, dùng hoặc vứt.";
    actionsEl.hidden = true;
    return;
  }

  const rColor = hexColor(RARITY_COLORS[def.rarity]);
  nameEl.textContent = `${def.name} (×${s.qty})`;
  nameEl.style.color = rColor;
  rarityEl.textContent = RARITY_NAMES[def.rarity];
  rarityEl.style.color = rColor;
  const cdSec = def.cooldown ? ` · Hồi chiêu ${Math.round(def.cooldown / 1000)}s` : "";
  descEl.textContent = `${def.desc}${cdSec}`;
  actionsEl.hidden = false;
  useBtn.hidden = !def.effect;
  drop1Btn.hidden = s.qty <= 1;
}

function renderInventory() {
  let used = 0;
  for (let i = 0; i < INVENTORY_SLOTS; i++) {
    const s = invSlots[i];
    const def = s ? ITEM_BY_ID[s.itemId] : undefined;
    const btn = slotEls[i];
    if (!btn) continue;
    btn.classList.toggle("selected", i === selectedSlot);
    if (s && def) {
      used++;
      btn.style.borderColor = hexColor(RARITY_COLORS[def.rarity]);
      applyItemVisual(slotIconEls[i], def);
      slotNameEls[i].textContent = def.name;
      slotQtyEls[i].textContent = s.qty > 1 ? `${s.qty}` : "";
    } else {
      btn.style.borderColor = "rgba(243, 220, 160, 0.22)";
      applyItemVisual(slotIconEls[i], undefined);
      slotNameEls[i].textContent = "";
      slotQtyEls[i].textContent = "";
      slotCdEls[i].style.transform = "scaleY(0)";
    }
  }
  $("inv-count").textContent = `${used} / ${INVENTORY_SLOTS} ô`;
  renderSlotDetail();
  renderQuickbar();
}

function renderQuickbar() {
  const [q1, q2] = resolveQuickItems();
  const pairs: [1 | 2, string][] = [
    [1, q1],
    [2, q2],
  ];
  for (const [idx, itemId] of pairs) {
    const def = ITEM_BY_ID[itemId];
    let total = 0;
    for (const s of invSlots) if (s?.itemId === itemId) total += s.qty;
    const btn = $(`quick-${idx}`);
    btn.dataset.itemId = itemId;
    btn.classList.toggle("empty", total === 0);
    btn.style.borderColor =
      total > 0 && def ? hexColor(RARITY_COLORS[def.rarity]) : "rgba(201, 162, 74, 0.45)";
    applyItemVisual($(`quick-${idx}-icon`), def);
    $(`quick-${idx}-name`).textContent = def ? def.name.replace(" Đan", "") : `Đan ${idx}`;
    $(`quick-${idx}-qty`).textContent = total > 0 ? `${total}` : "0";
  }
}

function showGainFeed(itemId: string, qty: number) {
  const def = ITEM_BY_ID[itemId];
  if (!def || qty <= 0) return;
  const feed = $("gain-feed");
  const item = document.createElement("div");
  item.className = "gain-item";
  const rColor = hexColor(RARITY_COLORS[def.rarity]);
  item.style.borderLeftColor = rColor;
  item.style.color = rColor;

  const icon = document.createElement("i");
  applyItemVisual(icon, def);
  const text = document.createElement("span");
  text.textContent = `+${qty} ${def.name}`;
  item.append(icon, text);
  feed.append(item);
  while (feed.children.length > 6) feed.firstChild!.remove();
  setTimeout(() => item.remove(), 2800);
}

export const ui = {
  show() {
    $("ui").hidden = false;
    $("login").hidden = true;
  },

  initInventory(cb: InventoryCallbacks) {
    callbacks = cb;
    const grid = $("inv-grid");
    grid.replaceChildren();
    slotEls.length = 0;
    slotIconEls.length = 0;
    slotNameEls.length = 0;
    slotQtyEls.length = 0;
    slotCdEls.length = 0;

    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "inv-slot";
      btn.setAttribute("role", "gridcell");

      const icon = document.createElement("i");
      icon.className = "slot-icon";
      const name = document.createElement("span");
      name.className = "slot-name";
      const qty = document.createElement("b");
      qty.className = "slot-qty";
      const cd = document.createElement("em");
      cd.className = "cd";

      btn.append(icon, name, qty, cd);
      btn.addEventListener("pointerenter", (e) => {
        if (e.pointerType === "mouse") {
          selectedSlot = i;
          renderInventory();
        }
      });
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        selectedSlot = i;
        renderInventory();
      });
      btn.addEventListener("dblclick", () => {
        const s = invSlots[i];
        if (s && ITEM_BY_ID[s.itemId]?.effect) callbacks?.onUse(i);
      });

      slotEls.push(btn);
      slotIconEls.push(icon);
      slotNameEls.push(name);
      slotQtyEls.push(qty);
      slotCdEls.push(cd);
      grid.append(btn);
    }

    const bindTap = (id: string, fn: () => void) =>
      $(id).addEventListener("pointerdown", (e) => {
        e.preventDefault();
        fn();
      });

    bindTap("btn-bag", () => this.toggleInventory());
    bindTap("inv-close", () => this.toggleInventory(false));
    bindTap("inv-btn-use", () => {
      if (invSlots[selectedSlot]) callbacks?.onUse(selectedSlot);
    });
    bindTap("inv-btn-drop1", () => {
      if (invSlots[selectedSlot]) callbacks?.onDrop(selectedSlot, 1);
    });
    bindTap("inv-btn-dropall", () => {
      if (invSlots[selectedSlot]) callbacks?.onDrop(selectedSlot);
    });
    bindTap("quick-1", () => this.useQuick(1));
    bindTap("quick-2", () => this.useQuick(2));
    bindTap("btn-pickup", () => callbacks?.onPickup());

    renderInventory();
  },

  toggleInventory(force?: boolean) {
    invOpen = force ?? !invOpen;
    $("inv-modal").hidden = !invOpen;
    $("btn-bag").classList.toggle("active", invOpen);
    if (invOpen) renderInventory();
  },

  isInventoryOpen() {
    return invOpen;
  },

  onInv(m: InvMsg) {
    invSlots = m.slots;
    const now = performance.now();
    itemCdUntil.clear();
    for (const [itemId, remMs] of Object.entries(m.cd ?? {})) {
      if (remMs > 0) itemCdUntil.set(itemId, now + remMs);
    }
    if (m.gained) {
      for (const g of m.gained) showGainFeed(g.itemId, g.qty);
    }
    // Nếu ô đang chọn bị trống và trong túi còn đồ thì giữ nguyên chỉ số, cập nhật lại chi tiết
    renderInventory();
  },

  useQuick(idx: 1 | 2) {
    const [q1, q2] = resolveQuickItems();
    const targetId = idx === 1 ? q1 : q2;
    const slot = invSlots.findIndex((s) => s?.itemId === targetId);
    if (slot < 0) {
      const def = ITEM_BY_ID[targetId];
      return this.toast({ text: `Trong túi không còn ${def?.name ?? "đan dược"}.`, tone: "info" });
    }
    callbacks?.onUse(slot);
  },

  tickItemCooldowns() {
    const now = performance.now();
    for (const idx of [1, 2] as const) {
      const btn = $(`quick-${idx}`);
      const itemId = btn.dataset.itemId ?? "";
      const def = ITEM_BY_ID[itemId];
      const until = itemCdUntil.get(itemId) ?? 0;
      const frac = def?.cooldown && until > now ? (until - now) / def.cooldown : 0;
      (btn.querySelector(".cd") as HTMLElement).style.transform =
        `scaleY(${Math.max(0, Math.min(1, frac))})`;
    }
    if (invOpen) {
      for (let i = 0; i < INVENTORY_SLOTS; i++) {
        const s = invSlots[i];
        const def = s ? ITEM_BY_ID[s.itemId] : undefined;
        const until = s ? (itemCdUntil.get(s.itemId) ?? 0) : 0;
        const frac = def?.cooldown && until > now ? (until - now) / def.cooldown : 0;
        slotCdEls[i].style.transform = `scaleY(${Math.max(0, Math.min(1, frac))})`;
      }
    }
  },

  pickupPrompt(label: string | null) {
    const btn = $("btn-pickup");
    btn.hidden = label === null;
    if (label !== null) $("pickup-label").textContent = label;
  },

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
    $("hud-online").textContent = `Đạo hữu: ${online}`;
    $("sk-med").classList.toggle("on", p.meditating);
    const canBreak = isLastTier(p.realm, p.tier) && p.exp >= p.expMax && !isPeak(p.realm, p.tier);
    $("sk-break").classList.toggle("ready", canBreak);
  },

  cooldown(id: "sk-slash" | "sk-sword", frac: number) {
    ($(id).querySelector(".cd") as HTMLElement).style.transform =
      `scaleY(${Math.max(0, Math.min(1, frac))})`;
  },

  chat(m: ChatOut) {
    const log = $("chat-log");
    const p = document.createElement("p");
    if (m.sys) {
      p.className = "sys";
      p.textContent = m.text;
    } else {
      const b = document.createElement("b");
      b.textContent = `${m.from}: `;
      p.append(b, document.createTextNode(m.text));
    }
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
    if (secondsLeft !== null)
      $("death-t").textContent = `Hồi sinh tại Lạc Hà Trấn sau ${secondsLeft}s`;
  },
};
