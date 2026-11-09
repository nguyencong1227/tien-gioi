// Lớp giao diện DOM (HUD, chat, kỹ năng, túi đồ, nhiệm vụ, hộp thoại NPC, minimap, âm thanh).
// Tuyệt đối không dùng innerHTML để phòng chống XSS theo chuẩn bảo mật SecureCoder.
import {
  INVENTORY_SLOTS,
  ITEM_BY_ID,
  RARITY_COLORS,
  RARITY_NAMES,
  QUEST_BY_ID,
  NPC_BY_ID,
  MONSTER_BY_ID,
  emptyInventory,
  realmLabel,
  isLastTier,
  isPeak,
  stepProgress,
  questReady,
  type ChatOut,
  type ToastMsg,
  type InvMsg,
  type Inventory,
  type ItemDef,
  type QuestsMsg,
  type QuestProgress,
  type QuestDef,
  type QuestCtx,
  type DialogMsg,
  type DialogAction,
} from "@tien-gioi/shared";
import { sound } from "./audio";

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

export interface UiCallbacks {
  onUse: (slot: number) => void;
  onDrop: (slot: number, qty?: number) => void;
  onPickup: () => void;
  onTalk: () => void;
  onDialogAction: (action: DialogAction) => void;
  onTrackQuest?: (questId: string | null) => void;
}

const fmt = (n: number) =>
  n >= 1e6
    ? `${(n / 1e6).toFixed(1)}M`
    : n >= 1e4
      ? `${(n / 1e3).toFixed(1)}k`
      : `${Math.floor(n)}`;

const hexColor = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

// ---------- Trạng thái Client ----------
const HIDE_NAMES_KEY = "tg_hide_names";
const LOW_FX_KEY = "tg_low_fx";

let invSlots: Inventory = emptyInventory();
const itemCdUntil = new Map<string, number>();
let selectedSlot = 0;
let invOpen = false;
let questModalOpen = false;
let mapModalOpen = false;
let settingsModalOpen = false;
let hideOtherNames = false;
let lowFx = false;
let questTab: "active" | "done" = "active";
let trackingQuestId: string | null = null;
let currentRealm = 0;
let currentTier = 0;
let questLog: QuestsMsg = { active: [], done: [], dailyDone: [] };

function loadSettings() {
  try {
    hideOtherNames = localStorage.getItem(HIDE_NAMES_KEY) === "1";
    lowFx = localStorage.getItem(LOW_FX_KEY) === "1";
  } catch {
    hideOtherNames = false;
    lowFx = false;
  }
  if (typeof document !== "undefined") {
    document.body.classList.toggle("low-fx", lowFx);
  }
}

// Hộp thoại NPC
let currentDialog: DialogMsg | null = null;
let dlgTypeTimer: number | null = null;
let dlgFullText = "";
let dlgTypedLen = 0;

let callbacks: UiCallbacks | null = null;
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

function getCtx(): QuestCtx {
  return { realm: currentRealm, tier: currentTier, inv: invSlots };
}

/** Chọn 2 loại đan dược cho 2 ô dùng nhanh. */
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

// ---------- Theo dõi nhiệm vụ (HUD Quest Tracker) ----------

function describeStep(
  def: QuestDef,
  prog: QuestProgress,
): {
  text: string;
  ready: boolean;
} {
  const ctx = getCtx();
  if (questReady(def, prog, ctx)) {
    const npc = NPC_BY_ID[def.giver];
    return { text: `Hoàn thành · Gặp ${npc?.name ?? "NPC"} trả nhiệm vụ`, ready: true };
  }
  const s = def.steps[prog.step];
  if (!s) return { text: "Đã hoàn thành", ready: true };
  const p = stepProgress(s, prog.count, ctx);
  switch (s.kind) {
    case "kill": {
      const mon = MONSTER_BY_ID[s.monster]?.name ?? s.monster;
      return { text: `Hạ ${mon}: ${p.have}/${p.need}`, ready: false };
    }
    case "collect": {
      const it = ITEM_BY_ID[s.itemId]?.name ?? s.itemId;
      return { text: `Thu thập ${it}: ${p.have}/${p.need}`, ready: false };
    }
    case "talk": {
      const npc = NPC_BY_ID[s.npcId]?.name ?? s.npcId;
      return { text: `Tới nói chuyện với ${npc}`, ready: false };
    }
    case "reachRealm": {
      return { text: `Đạt ${realmLabel(s.realm, s.tier)}`, ready: false };
    }
  }
}

function renderQuestTracker() {
  const list = $("quest-tracker-list");
  list.replaceChildren();

  if (!questLog.active.length) {
    const p = document.createElement("p");
    p.style.opacity = "0.7";
    p.style.fontSize = "11px";
    p.style.margin = "2px 0";
    p.textContent = "Chưa nhận nhiệm vụ. Gặp Trưởng trấn hoặc Bảng cáo thị để nhận việc.";
    list.append(p);
    return;
  }

  // Tự động gán nhiệm vụ theo dõi mặc định nếu chưa chọn
  if (!trackingQuestId || !questLog.active.some((a) => a.id === trackingQuestId)) {
    trackingQuestId = questLog.active[0]?.id ?? null;
  }

  for (const a of questLog.active) {
    const def = QUEST_BY_ID[a.id];
    if (!def) continue;
    const { text, ready } = describeStep(def, a);

    const div = document.createElement("div");
    div.className = `qt-item${ready ? " ready" : ""}${trackingQuestId === def.id ? " tracking" : ""}`;

    const titleRow = document.createElement("div");
    titleRow.className = "qt-title";

    const nameSpan = document.createElement("span");
    nameSpan.textContent = def.title;

    const badge = document.createElement("span");
    badge.className = "qt-badge";
    badge.textContent = def.daily ? "Lặp" : "Chính";

    titleRow.append(nameSpan, badge);

    const stepEl = document.createElement("div");
    stepEl.className = "qt-step";
    stepEl.textContent = text;

    div.append(titleRow, stepEl);
    div.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      trackingQuestId = def.id;
      renderQuestTracker();
      callbacks?.onTrackQuest?.(def.id);
    });

    list.append(div);
  }
}

// ---------- Sổ nhiệm vụ (Quest Log Modal - Phím Q) ----------

function renderQuestModal() {
  $("quest-count").textContent = `${questLog.active.length} / 8 đang làm`;
  const container = $("quest-list");
  container.replaceChildren();

  if (questTab === "active") {
    if (!questLog.active.length) {
      const p = document.createElement("p");
      p.style.opacity = "0.7";
      p.style.padding = "16px";
      p.style.textAlign = "center";
      p.textContent = "Hiện không có nhiệm vụ nào đang làm.";
      container.append(p);
      return;
    }
    for (const a of questLog.active) {
      const def = QUEST_BY_ID[a.id];
      if (!def) continue;
      const { text, ready } = describeStep(def, a);

      const card = document.createElement("div");
      card.className = `q-card ${def.daily ? "daily" : "main-q"}`;

      const head = document.createElement("div");
      head.className = "q-card-head";

      const title = document.createElement("b");
      title.className = "q-card-title";
      title.textContent = def.title;

      const giver = document.createElement("small");
      giver.style.opacity = "0.75";
      const npc = NPC_BY_ID[def.giver];
      giver.textContent = `${npc?.name ?? def.giver} (${def.daily ? "Hằng ngày" : "Chính tuyến"})`;

      head.append(title, giver);

      const desc = document.createElement("div");
      desc.className = "q-card-desc";
      desc.textContent = def.desc;

      const progEl = document.createElement("div");
      progEl.className = "q-card-progress";
      progEl.textContent = ready ? `✓ ${text}` : `▸ ${text}`;

      const rew = document.createElement("div");
      rew.className = "q-card-rewards";
      const rewParts: string[] = [];
      if (def.rewards.exp) rewParts.push(`${def.rewards.exp} tu vi`);
      if (def.rewards.items) {
        for (const it of def.rewards.items) {
          const itName = ITEM_BY_ID[it.itemId]?.name ?? it.itemId;
          rewParts.push(`${itName} ×${it.qty}`);
        }
      }
      rew.textContent = `Thưởng: ${rewParts.join(", ")}`;

      card.append(head, desc, progEl, rew);
      container.append(card);
    }
  } else {
    // Tab "Đã hoàn thành"
    const finishedIds = [...questLog.done, ...questLog.dailyDone];
    if (!finishedIds.length) {
      const p = document.createElement("p");
      p.style.opacity = "0.7";
      p.style.padding = "16px";
      p.style.textAlign = "center";
      p.textContent = "Chưa hoàn thành nhiệm vụ nào.";
      container.append(p);
      return;
    }
    for (const qId of finishedIds) {
      const def = QUEST_BY_ID[qId];
      if (!def) continue;
      const card = document.createElement("div");
      card.className = "q-card";

      const head = document.createElement("div");
      head.className = "q-card-head";
      const title = document.createElement("b");
      title.className = "q-card-title";
      title.textContent = def.title;
      const badge = document.createElement("span");
      badge.className = "qt-badge";
      badge.textContent = questLog.dailyDone.includes(qId) ? "Đã xong hôm nay" : "Đã hoàn thành";
      head.append(title, badge);

      const desc = document.createElement("div");
      desc.className = "q-card-desc";
      desc.textContent = def.desc;

      card.append(head, desc);
      container.append(card);
    }
  }
}

// ---------- Hộp thoại NPC (Typewriter + Options) ----------

function stopTypewriter() {
  if (dlgTypeTimer !== null) {
    window.clearInterval(dlgTypeTimer);
    dlgTypeTimer = null;
  }
}

function finishTypewriter() {
  stopTypewriter();
  const textEl = $("dlg-text");
  textEl.textContent = dlgFullText;
  $("dlg-skip-hint").hidden = true;
  renderDialogOptions();
}

function renderDialogOptions() {
  const optBox = $("dlg-options");
  optBox.replaceChildren();
  if (!currentDialog) return;

  for (const opt of currentDialog.options) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dlg-opt-btn";
    if (opt.action.kind === "accept" || opt.action.kind === "turnIn") {
      btn.classList.add("primary");
    }
    btn.disabled = !!opt.disabled;

    const labelSpan = document.createElement("span");
    labelSpan.textContent = opt.label;
    btn.append(labelSpan);

    if (opt.action.kind === "turnIn") {
      const tag = document.createElement("small");
      tag.textContent = "Trả thưởng";
      tag.style.color = "#ffe08a";
      btn.append(tag);
    } else if (opt.action.kind === "accept") {
      const tag = document.createElement("small");
      tag.textContent = "Nhận việc";
      tag.style.color = "#ffe08a";
      btn.append(tag);
    }

    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const action = opt.action;
      ui.closeDialog();
      if (action.kind === "turnIn") sound.questDone();
      callbacks?.onDialogAction(action);
    });

    optBox.append(btn);
  }
}

export const ui = {
  show() {
    $("ui").hidden = false;
    $("login").hidden = true;
  },

  init(cb: UiCallbacks) {
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

    // Túi đồ
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
    bindTap("btn-talk", () => callbacks?.onTalk());

    // Sổ nhiệm vụ
    bindTap("btn-quest", () => this.toggleQuestModal());
    bindTap("quest-close", () => this.toggleQuestModal(false));
    bindTap("tab-q-active", () => {
      questTab = "active";
      $("tab-q-active").classList.add("active");
      $("tab-q-done").classList.remove("active");
      renderQuestModal();
    });
    bindTap("tab-q-done", () => {
      questTab = "done";
      $("tab-q-done").classList.add("active");
      $("tab-q-active").classList.remove("active");
      renderQuestModal();
    });

    // Bản đồ
    bindTap("minimap-wrap", () => this.toggleMapModal());
    bindTap("map-close", () => this.toggleMapModal(false));

    // Cài đặt (#35)
    loadSettings();
    bindTap("btn-settings", () => this.toggleSettingsModal());
    bindTap("settings-close", () => this.toggleSettingsModal(false));

    const bgmInput = $("set-bgm-vol") as HTMLInputElement;
    const bgmVal = $("set-bgm-val");
    const sfxInput = $("set-sfx-vol") as HTMLInputElement;
    const sfxVal = $("set-sfx-val");
    const muteChk = $("set-mute") as HTMLInputElement;
    const hideNamesChk = $("set-hide-names") as HTMLInputElement;
    const lowFxChk = $("set-low-fx") as HTMLInputElement;

    const syncSettingsDom = () => {
      const bPct = Math.round(sound.getBgmVolume() * 100);
      const sPct = Math.round(sound.getSfxVolume() * 100);
      bgmInput.value = `${bPct}`;
      bgmVal.textContent = `${bPct}%`;
      sfxInput.value = `${sPct}`;
      sfxVal.textContent = `${sPct}%`;
      muteChk.checked = sound.isMuted();
      hideNamesChk.checked = hideOtherNames;
      lowFxChk.checked = lowFx;
    };
    syncSettingsDom();

    bgmInput.addEventListener("input", () => {
      const v = Number(bgmInput.value);
      bgmVal.textContent = `${v}%`;
      sound.setBgmVolume(v / 100);
    });
    sfxInput.addEventListener("input", () => {
      const v = Number(sfxInput.value);
      sfxVal.textContent = `${v}%`;
      sound.setSfxVolume(v / 100);
    });
    muteChk.addEventListener("change", () => {
      sound.setMuted(muteChk.checked);
    });
    hideNamesChk.addEventListener("change", () => {
      hideOtherNames = hideNamesChk.checked;
      try {
        localStorage.setItem(HIDE_NAMES_KEY, hideOtherNames ? "1" : "0");
      } catch {
        // Bỏ qua nếu trình duyệt chặn localStorage
      }
    });
    lowFxChk.addEventListener("change", () => {
      lowFx = lowFxChk.checked;
      document.body.classList.toggle("low-fx", lowFx);
      try {
        localStorage.setItem(LOW_FX_KEY, lowFx ? "1" : "0");
      } catch {
        // Bỏ qua nếu trình duyệt chặn localStorage
      }
    });

    // Âm thanh
    bindTap("btn-mute", () => {
      const isMuted = sound.toggleMute();
      this.updateMuteIcon(isMuted);
    });
    sound.onChange((m) => this.updateMuteIcon(m));
    this.updateMuteIcon(sound.isMuted());

    // Hộp thoại NPC
    bindTap("dlg-close", () => this.closeDialog());
    $("dlg-body").addEventListener("pointerdown", (e) => {
      e.preventDefault();
      finishTypewriter();
    });

    renderInventory();
    renderQuestTracker();
  },

  updateMuteIcon(muted: boolean) {
    const icon = $("mute-icon");
    if (icon) icon.textContent = muted ? "🔇" : "🔊";
    const muteChk = document.getElementById("set-mute") as HTMLInputElement | null;
    if (muteChk) muteChk.checked = muted;
  },

  toggleSettingsModal(force?: boolean) {
    settingsModalOpen = force ?? !settingsModalOpen;
    $("settings-modal").hidden = !settingsModalOpen;
    $("btn-settings").classList.toggle("active", settingsModalOpen);
  },

  isSettingsModalOpen() {
    return settingsModalOpen;
  },

  isHideNames() {
    return hideOtherNames;
  },

  isLowFx() {
    return lowFx;
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

  toggleQuestModal(force?: boolean) {
    questModalOpen = force ?? !questModalOpen;
    $("quest-modal").hidden = !questModalOpen;
    $("btn-quest").classList.toggle("active", questModalOpen);
    if (questModalOpen) renderQuestModal();
  },

  isQuestModalOpen() {
    return questModalOpen;
  },

  toggleMapModal(force?: boolean) {
    mapModalOpen = force ?? !mapModalOpen;
    $("map-modal").hidden = !mapModalOpen;
  },

  isMapModalOpen() {
    return mapModalOpen;
  },

  isDialogOpen() {
    return !$("dialog-modal").hidden;
  },

  closeDialog() {
    stopTypewriter();
    currentDialog = null;
    $("dialog-modal").hidden = true;
    $("dlg-options").replaceChildren();
  },

  closeAllModals(): boolean {
    let closedAny = false;
    if (this.isDialogOpen()) {
      this.closeDialog();
      closedAny = true;
    }
    if (invOpen) {
      this.toggleInventory(false);
      closedAny = true;
    }
    if (questModalOpen) {
      this.toggleQuestModal(false);
      closedAny = true;
    }
    if (mapModalOpen) {
      this.toggleMapModal(false);
      closedAny = true;
    }
    if (settingsModalOpen) {
      this.toggleSettingsModal(false);
      closedAny = true;
    }
    return closedAny;
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
      sound.pickup();
    }
    renderInventory();
    renderQuestTracker();
    if (questModalOpen) renderQuestModal();
  },

  onQuests(m: QuestsMsg) {
    questLog = m;
    renderQuestTracker();
    if (questModalOpen) renderQuestModal();
  },

  getQuestLog(): QuestsMsg {
    return questLog;
  },

  getTrackingQuestId(): string | null {
    return trackingQuestId;
  },

  getQuestContext(): QuestCtx {
    return getCtx();
  },

  onDialog(m: DialogMsg) {
    currentDialog = m;
    const npc = NPC_BY_ID[m.npcId];
    $("dlg-npc-name").textContent = npc?.name ?? "Kỳ nhân";
    $("dlg-npc-title").textContent = npc?.title ?? "Lạc Hà Trấn";

    $("dialog-modal").hidden = false;
    $("dlg-options").replaceChildren();
    $("dlg-skip-hint").hidden = false;

    dlgFullText = m.lines.join("\n\n");
    dlgTypedLen = 0;
    const textEl = $("dlg-text");
    textEl.textContent = "";

    stopTypewriter();
    dlgTypeTimer = window.setInterval(() => {
      dlgTypedLen += 2;
      if (dlgTypedLen >= dlgFullText.length) {
        finishTypewriter();
      } else {
        textEl.textContent = dlgFullText.slice(0, dlgTypedLen);
        sound.typeBlip();
      }
    }, 28);
  },

  talkPrompt(label: string | null) {
    const btn = $("btn-talk");
    btn.hidden = label === null;
    if (label !== null) $("talk-label").textContent = label;
  },

  pickupPrompt(label: string | null) {
    const btn = $("btn-pickup");
    btn.hidden = label === null;
    if (label !== null) $("pickup-label").textContent = label;
  },

  setZoneName(name: string) {
    $("minimap-zone").textContent = name;
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

  hud(p: HudPlayer, online: number) {
    currentRealm = p.realm;
    currentTier = p.tier;
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
