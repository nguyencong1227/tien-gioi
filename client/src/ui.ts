// Lớp giao diện DOM (HUD, chat, kỹ năng, túi đồ, nhiệm vụ, hộp thoại NPC, minimap, âm thanh).
// Tuyệt đối không dùng innerHTML để phòng chống XSS theo chuẩn bảo mật SecureCoder.
import {
  INVENTORY_SLOTS,
  ITEM_BY_ID,
  RARITY_COLORS,
  RARITY_NAMES,
  EQUIP_SLOTS,
  EQUIP_SLOT_NAMES,
  emptyEquipment,
  equipBonus,
  RECIPES,
  QUEST_BY_ID,
  NPC_BY_ID,
  MONSTER_BY_ID,
  emptyInventory,
  countItem,
  statsFor,
  canEquip,
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
  type Equipment,
  type EquipSlot,
  type EquipStats,
  type QuestsMsg,
  type QuestProgress,
  type QuestDef,
  type QuestCtx,
  type DialogMsg,
  type DialogAction,
  PARTY_MAX,
  NO_PARTY,
  type PartyMsg,
  type PartyInvitedMsg,
  CURRENCY_NAME,
  DEFAULT_MAP_ID,
  getMap,
  buyPrice,
  sellPrice,
  SHOP_BY_NPC,
  SHOP_MAX_QTY,
  type WalletMsg,
  UNLOCKS,
  ORIGINS,
  DEFAULT_ORIGIN,
  ORIGIN_BUY_PREFIX,
  levelOf,
  keepSlotsOf,
  nextCost,
  type LimboMsg,
  type RebirthChoice,
  type SoulView,
  DUNGEON_DAILY_REWARDS,
  dungeonOf,
  isDungeonMap,
  type DungeonFallenMsg,
  type DungeonInviteMsg,
  type DungeonStateMsg,
  type DungeonEndMsg,
  type DuelInvitedMsg,
  type DuelStateMsg,
  type DuelEndMsg,
  type DuelChallengeCheck,
  duelChallengeFailMessage,
  type SectView,
  type SectPresenceMsg,
  type SectInvitedMsg,
  type SectAssignableRank,
  type SectMsg,
  canSect,
  SECT_MAX_MEMBERS,
  SECT_ELDERS_MAX,
  cleanSectName,
  cleanSectTag,
  cleanMotd,
} from "@tien-gioi/shared";
import {
  dungeonEndReasonText,
  dungeonFallenToastText,
  dungeonNoRewardText,
  dungeonPhaseInfo,
  formatBossView,
  formatDungeonCountdown,
  formatDungeonRewardItems,
  formatInviteCountdown,
  isMockDungeonEnabled,
  shouldOpenEndModal,
} from "./dungeon";
import {
  duelEndReasonText,
  duelResultTitle,
  formatDuelCountdown,
  formatDuelInviteCountdown,
  isMockDuelEnabled,
} from "./duel";
import {
  formatSectInviteCountdown,
  formatSectTreasury,
  formatSectRole,
  formatSectLog,
  formatSectMembersSummary,
  mergeMemberPresence,
  sectConfirmText,
  type SectConfirmKind,
} from "./sect";
import { sound } from "./audio";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let currentMapId: string = DEFAULT_MAP_ID;
let portalCallback: (() => void) | null = null;

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
  weapon?: string;
  robe?: string;
  talisman?: string;
}

export interface UiCallbacks {
  onUse: (slot: number) => void;
  onEquip: (slot: number) => void;
  onUnequip: (slot: EquipSlot) => void;
  onCraft: (recipeId: string) => void;
  onDrop: (slot: number, qty?: number) => void;
  onPickup: () => void;
  onTalk: () => void;
  onDialogAction: (action: DialogAction) => void;
  onTrackQuest?: (questId: string | null) => void;
  onPartyLeave?: () => void;
  onPartyKick?: (name: string) => void;
  onPartyInvite?: (name: string) => void;
  onPartyAccept?: (from: string) => void;
  onPartyDecline?: (from: string) => void;
  onBuy?: (npcId: string, itemId: string, qty: number) => void;
  onSell?: (npcId: string, slot: number, qty: number) => void;
  onDungeonEnter?: (runId: string) => void;
  onDungeonDecline?: (runId: string) => void;
  onDungeonLeave?: () => void;
  onDuelChallenge?: (name: string) => void;
  onDuelAccept?: (from: string) => void;
  onDuelDecline?: (from: string) => void;
  onDuelYield?: () => void;
  onSectCreate?: (name: string, tag: string) => void;
  onSectInvite?: (name: string) => void;
  onSectAccept?: (from: string) => void;
  onSectDecline?: (from: string) => void;
  onSectLeave?: () => void;
  onSectKick?: (name: string) => void;
  onSectRank?: (name: string, rank: SectAssignableRank) => void;
  onSectTransfer?: (name: string) => void;
  onSectDisband?: () => void;
  onSectMotd?: (motd: string) => void;
  onSectDeposit?: (amount: number) => void;
  onSectWithdraw?: (amount: number) => void;
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
let charModalOpen = false;
let forgeModalOpen = false;
let forgeNpcId = "tho_ren";
let lastForgedItemId: string | null = null;
let previewEquipItemId: string | null = null;
let questModalOpen = false;
let mapModalOpen = false;
let settingsModalOpen = false;
let hideOtherNames = false;
let lowFx = false;
let questTab: "active" | "done" = "active";
let trackingQuestId: string | null = null;
let currentName = "";
let currentRealm = 0;
let currentTier = 0;
let currentEquip: Equipment = emptyEquipment();
let questLog: QuestsMsg = { active: [], done: [], dailyDone: [] };

// ---------- Tổ đội (M3, #75) ----------
let partyData: PartyMsg = NO_PARTY;
const inviteQueue: PartyInvitedMsg[] = [];
let inviteInterval: number | null = null;
let currentInviteFrom = "";
let selectedPlayerName = "";

function stopInviteTimer() {
  if (inviteInterval !== null) {
    window.clearInterval(inviteInterval);
    inviteInterval = null;
  }
}

// ---------- Bí cảnh theo đội (M3.4, #200) ----------
let currentDungeonInvite: DungeonInviteMsg | null = null;
let lastDungeonFallen: DungeonFallenMsg | null = null;
let dungeonFallenPendingToast = false;
let dungeonInviteInterval: number | null = null;
let dungeonHudInterval: number | null = null;
let dungeonDeadlineAt = 0;

function stopDungeonInviteTimer() {
  if (dungeonInviteInterval !== null) {
    window.clearInterval(dungeonInviteInterval);
    dungeonInviteInterval = null;
  }
}

function stopDungeonHudTimer() {
  if (dungeonHudInterval !== null) {
    window.clearInterval(dungeonHudInterval);
    dungeonHudInterval = null;
  }
}

// ---------- PK Thách Đấu (M3.5, #218) ----------
let currentDuelInvite: DuelInvitedMsg | null = null;
let duelInviteInterval: number | null = null;
let duelHudInterval: number | null = null;
let duelCountdownInterval: number | null = null;
let duelDeadlineAt = 0;
let currentDuelOpponent = "";

function stopDuelInviteTimer() {
  if (duelInviteInterval !== null) {
    window.clearInterval(duelInviteInterval);
    duelInviteInterval = null;
  }
}

function stopDuelHudTimer() {
  if (duelHudInterval !== null) {
    window.clearInterval(duelHudInterval);
    duelHudInterval = null;
  }
}

function stopDuelCountdownTimer() {
  if (duelCountdownInterval !== null) {
    window.clearInterval(duelCountdownInterval);
    duelCountdownInterval = null;
  }
}

// ---------- Tông môn (M3.6, #230) ----------
let currentSect: SectView | null = null;
let currentSectPresence: SectPresenceMsg | null = null;
let sectModalOpen = false;
let sectTab: "overview" | "members" | "treasury" = "overview";
let currentSectInvite: SectInvitedMsg | null = null;
let sectInviteInterval: number | null = null;
let sectConfirmAction: (() => void) | null = null;

/** Hộp xác nhận trong game cho Nhường / Trục xuất / Rời (#246): confirm() gốc bị chặn / xấu trên điện thoại và PWA */
function askSectConfirm(kind: SectConfirmKind, name: string, onOk: () => void) {
  const box = document.getElementById("sect-action-confirm");
  if (!box) return;
  const { text, ok } = sectConfirmText(kind, name);
  sectConfirmAction = onOk;
  $("sect-action-confirm-text").textContent = text;
  $("sect-action-confirm-ok").textContent = ok;
  box.hidden = false;
}

function closeSectConfirm() {
  sectConfirmAction = null;
  const box = document.getElementById("sect-action-confirm");
  if (box) box.hidden = true;
}

function stopSectInviteTimer() {
  if (sectInviteInterval !== null) {
    window.clearInterval(sectInviteInterval);
    sectInviteInterval = null;
  }
}

function processNextInvite() {
  stopInviteTimer();
  const next = inviteQueue.shift();
  if (!next) {
    currentInviteFrom = "";
    $("party-invite-box").hidden = true;
    return;
  }
  currentInviteFrom = next.from;
  const box = $("party-invite-box");
  box.hidden = false;
  sound.typeBlip();

  const msgEl = $("pib-msg");
  msgEl.replaceChildren();
  const b = document.createElement("b");
  b.textContent = next.from;
  msgEl.append(b, document.createTextNode(" mời bạn gia nhập tổ đội "));
  const timeSpan = document.createElement("span");
  timeSpan.id = "pib-time-left";
  msgEl.append(timeSpan);

  const startTime = Date.now();
  const ttl = next.ttlMs;
  const bar = $("pib-timer-bar");

  const update = () => {
    const elapsed = Date.now() - startTime;
    const rem = Math.max(0, ttl - elapsed);
    const sec = Math.ceil(rem / 1000);
    timeSpan.textContent = `(${sec}s)`;
    bar.style.width = `${(rem / ttl) * 100}%`;
    if (rem <= 0) {
      stopInviteTimer();
      processNextInvite();
    }
  };
  update();
  inviteInterval = window.setInterval(update, 200);
}

function renderPartyPanel() {
  const panel = $("party-panel");
  const membersEl = $("party-members");
  if (!partyData || !partyData.leader || partyData.members.length === 0) {
    panel.hidden = true;
    membersEl.replaceChildren();
    return;
  }
  panel.hidden = false;
  $("party-title").textContent = `Tổ đội (${partyData.members.length}/${PARTY_MAX})`;

  membersEl.replaceChildren();
  for (const m of partyData.members) {
    const row = document.createElement("div");
    row.className = "pmem-row";

    const info = document.createElement("div");
    info.className = "pmem-info";

    const nameWrap = document.createElement("div");
    nameWrap.className = "pmem-name-wrap";

    if (m.name === partyData.leader) {
      const leaderIcon = document.createElement("span");
      leaderIcon.className = "pmem-leader-icon";
      leaderIcon.textContent = "👑";
      leaderIcon.title = "Đội trưởng";
      nameWrap.append(leaderIcon);
    }

    if ((m as any).sect) {
      const sectSpan = document.createElement("span");
      sectSpan.className = "pmem-sect";
      sectSpan.textContent = `[${(m as any).sect}]`;
      nameWrap.append(sectSpan);
    }

    const nameSpan = document.createElement("span");
    nameSpan.className = `pmem-name${m.name === currentName ? " is-me" : ""}`;
    nameSpan.textContent = m.name;
    nameWrap.append(nameSpan);

    const realmSpan = document.createElement("span");
    realmSpan.className = "pmem-realm";
    realmSpan.textContent = realmLabel(m.realm, m.tier);
    nameWrap.append(realmSpan);

    if (m.mapId && m.mapId !== currentMapId) {
      const mapDef = getMap(m.mapId);
      const mapSpan = document.createElement("span");
      mapSpan.className = "pmem-map";
      mapSpan.textContent = `(${mapDef?.def.name ?? m.mapId})`;
      nameWrap.append(mapSpan);
    }

    info.append(nameWrap);

    // Đội trưởng có nút trục xuất thành viên khác
    if (partyData.leader === currentName && m.name !== currentName) {
      const kickBtn = document.createElement("button");
      kickBtn.type = "button";
      kickBtn.className = "pmem-kick-btn";
      kickBtn.textContent = "✕";
      kickBtn.title = `Mời ${m.name} ra khỏi đội`;
      kickBtn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        callbacks?.onPartyKick?.(m.name);
      });
      info.append(kickBtn);
    }

    const bar = document.createElement("div");
    bar.className = "pmem-bar";
    const hpFrac = m.maxHp > 0 ? Math.max(0, Math.min(1, m.hp / m.maxHp)) : 0;
    const hpFill = document.createElement("i");
    hpFill.style.width = `${Math.round(hpFrac * 100)}%`;
    bar.append(hpFill);

    row.append(info, bar);
    membersEl.append(row);
  }
}

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

/** Chuỗi tóm tắt chỉ số cộng thêm của một món trang bị. */
function describeEquipStats(stats: EquipStats): string {
  const parts: string[] = [];
  if (stats.atk) parts.push(`+${stats.atk} Công`);
  if (stats.hp) parts.push(`+${stats.hp} Khí huyết`);
  if (stats.mp) parts.push(`+${stats.mp} Linh lực`);
  if (stats.speed) parts.push(`+${stats.speed} Tốc độ`);
  return parts.join(" · ") || "Không cộng chỉ số";
}

/** Điền so sánh statsFor khi mặc thử món `candidate` so với trang bị hiện tại vào phần tử DOM. */
function fillEquipComparison(box: HTMLElement, candidate: ItemDef) {
  box.replaceChildren();
  const eq = candidate.equip;
  if (!eq) {
    box.hidden = true;
    return;
  }
  box.hidden = false;

  const nowStats = statsFor(currentRealm, currentTier, currentEquip);
  const nextEquip: Equipment = { ...currentEquip, [eq.slot]: candidate.id };
  const nextStats = statsFor(currentRealm, currentTier, nextEquip);

  const diffs: Array<{ label: string; d: number }> = [
    { label: "Công", d: nextStats.atk - nowStats.atk },
    { label: "Khí huyết", d: nextStats.maxHp - nowStats.maxHp },
    { label: "Linh lực", d: nextStats.maxMp - nowStats.maxMp },
    { label: "Tốc độ", d: nextStats.speed - nowStats.speed },
  ];

  const slotTag = document.createElement("span");
  slotTag.textContent = `[${EQUIP_SLOT_NAMES[eq.slot]}]`;
  slotTag.style.opacity = "0.8";
  box.append(slotTag);

  let anyDiff = false;
  for (const { label, d } of diffs) {
    if (d === 0) continue;
    anyDiff = true;
    const chip = document.createElement("span");
    chip.className = `cmp-chip ${d > 0 ? "cmp-up" : "cmp-down"}`;
    chip.textContent = `${label} ${d > 0 ? `+${d}` : `${d}`}`;
    box.append(chip);
  }
  if (!anyDiff) {
    const same = document.createElement("span");
    same.className = "cmp-eq";
    same.textContent = "Chỉ số ngang bằng món đang mặc";
    box.append(same);
  }

  const reqSpan = document.createElement("span");
  const reqText = realmLabel(eq.reqRealm, eq.reqTier);
  const ok = canEquip(candidate.id, currentRealm, currentTier);
  reqSpan.className = ok ? "req-ok" : "req-warn";
  reqSpan.textContent = ok ? `Đủ cảnh giới (${reqText})` : `Cần ${reqText}`;
  box.append(reqSpan);
}

function renderSlotDetail() {
  const s = invSlots[selectedSlot];
  const def = s ? ITEM_BY_ID[s.itemId] : undefined;
  const nameEl = $("inv-item-name");
  const rarityEl = $("inv-item-rarity");
  const descEl = $("inv-item-desc");
  const cmpEl = $("inv-equip-cmp");
  const actionsEl = $("inv-actions");
  const useBtn = $("inv-btn-use") as HTMLButtonElement;
  const equipBtn = $("inv-btn-equip") as HTMLButtonElement;
  const drop1Btn = $("inv-btn-drop1") as HTMLButtonElement;

  if (!s || !def) {
    nameEl.textContent = "Ô trống";
    nameEl.style.color = "";
    rarityEl.textContent = "";
    rarityEl.style.color = "";
    descEl.textContent = "Chạm hoặc rê chuột vào một ô có vật phẩm để xem mô tả, dùng hoặc vứt.";
    cmpEl.hidden = true;
    actionsEl.hidden = true;
    return;
  }

  const rColor = hexColor(RARITY_COLORS[def.rarity]);
  nameEl.textContent = s.qty > 1 ? `${def.name} (×${s.qty})` : def.name;
  nameEl.style.color = rColor;
  rarityEl.textContent = RARITY_NAMES[def.rarity];
  rarityEl.style.color = rColor;
  const cdSec = def.cooldown ? ` · Hồi chiêu ${Math.round(def.cooldown / 1000)}s` : "";
  const eqStatsText = def.equip ? ` · ${describeEquipStats(def.equip.stats)}` : "";
  descEl.textContent = `${def.desc}${eqStatsText}${cdSec}`;

  if (def.type === "equip" && def.equip) {
    fillEquipComparison(cmpEl, def);
    equipBtn.hidden = false;
    const ok = canEquip(def.id, currentRealm, currentTier);
    equipBtn.disabled = !ok;
    equipBtn.textContent = ok ? "Mặc" : `Cần ${realmLabel(def.equip.reqRealm, def.equip.reqTier)}`;
  } else {
    cmpEl.hidden = true;
    equipBtn.hidden = true;
  }

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
  if (charModalOpen) renderCharModal();
  if (forgeModalOpen) renderForgeModal();
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

function showCoinGainFeed(amount: number) {
  if (amount === 0) return;
  const feed = $("gain-feed");
  const item = document.createElement("div");
  item.className = "gain-item gain-coin";
  const isGain = amount > 0;
  item.style.borderLeftColor = isGain ? "#ffe08a" : "#ff7875";
  item.style.color = isGain ? "#ffe08a" : "#ff7875";

  const icon = document.createElement("i");
  icon.className = "coin-icon";
  icon.textContent = "💎";
  icon.style.fontStyle = "normal";

  const text = document.createElement("span");
  text.textContent = `${isGain ? "+" : ""}${amount} ${CURRENCY_NAME}`;
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

// ---------- Bảng nhân vật & Trang bị (Phím C - #31) ----------

function renderCharModal() {
  const slotsBox = $("char-equip-slots");
  slotsBox.replaceChildren();

  for (const slot of EQUIP_SLOTS) {
    const itemId = currentEquip[slot] || "";
    const def = itemId ? ITEM_BY_ID[itemId] : undefined;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `equip-slot-card${def ? " filled" : ""}`;
    if (def) {
      btn.style.borderColor = hexColor(RARITY_COLORS[def.rarity]);
    }

    const slotLabel = document.createElement("span");
    slotLabel.className = "slot-label";
    slotLabel.textContent = EQUIP_SLOT_NAMES[slot];

    const icon = document.createElement("i");
    icon.className = "slot-icon";
    applyItemVisual(icon, def);

    const itemName = document.createElement("span");
    itemName.className = "slot-item-name";
    if (def) {
      itemName.textContent = def.name;
      itemName.style.color = hexColor(RARITY_COLORS[def.rarity]);
    } else {
      itemName.textContent = "Trống";
      itemName.style.opacity = "0.5";
    }

    const hint = document.createElement("span");
    hint.className = "slot-hint";
    hint.textContent = def?.equip
      ? `${describeEquipStats(def.equip.stats)} · Chạm tháo`
      : "Chưa trang bị";

    btn.append(slotLabel, icon, itemName, hint);
    if (def) {
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        sound.equip();
        callbacks?.onUnequip(slot);
      });
    }
    slotsBox.append(btn);
  }

  // Bảng chỉ số tổng hợp tính từ statsFor(realm, tier, equipment)
  const statsBox = $("char-stats");
  statsBox.replaceChildren();

  const curStats = statsFor(currentRealm, currentTier, currentEquip);
  const bonus = equipBonus(currentEquip);

  const previewDef = previewEquipItemId ? ITEM_BY_ID[previewEquipItemId] : undefined;
  const previewStats = previewDef?.equip
    ? statsFor(currentRealm, currentTier, {
        ...currentEquip,
        [previewDef.equip.slot]: previewDef.id,
      })
    : null;

  const headerRow = document.createElement("div");
  headerRow.className = "stat-row full";
  const hLeft = document.createElement("b");
  hLeft.textContent = currentName || "Đạo hữu";
  hLeft.style.color = "#ffe08a";
  const hRight = document.createElement("span");
  hRight.textContent = realmLabel(currentRealm, currentTier);
  headerRow.append(hLeft, hRight);
  statsBox.append(headerRow);

  const statItems: Array<{
    label: string;
    val: number;
    add: number;
    nextVal: number | null;
    unit?: string;
  }> = [
    {
      label: "Khí huyết tối đa",
      val: curStats.maxHp,
      add: bonus.hp,
      nextVal: previewStats ? previewStats.maxHp : null,
    },
    {
      label: "Linh lực tối đa",
      val: curStats.maxMp,
      add: bonus.mp,
      nextVal: previewStats ? previewStats.maxMp : null,
    },
    {
      label: "Công kích",
      val: curStats.atk,
      add: bonus.atk,
      nextVal: previewStats ? previewStats.atk : null,
    },
    {
      label: "Tốc độ di chuyển",
      val: curStats.speed,
      add: bonus.speed,
      nextVal: previewStats ? previewStats.speed : null,
      unit: " px/s",
    },
  ];

  for (const st of statItems) {
    const row = document.createElement("div");
    row.className = "stat-row";

    const lbl = document.createElement("span");
    lbl.className = "stat-label";
    lbl.textContent = st.label;

    const valWrap = document.createElement("span");
    valWrap.className = "stat-val";
    valWrap.textContent = `${st.val}${st.unit ?? ""}`;

    if (st.add > 0) {
      const bSpan = document.createElement("small");
      bSpan.className = "stat-bonus";
      bSpan.textContent = `(+${st.add})`;
      valWrap.append(bSpan);
    }

    if (st.nextVal !== null) {
      const diff = st.nextVal - st.val;
      if (diff !== 0) {
        const dSpan = document.createElement("span");
        dSpan.className = `stat-diff ${diff > 0 ? "up" : "down"}`;
        dSpan.textContent = diff > 0 ? `▲+${diff}` : `▼${diff}`;
        valWrap.append(dSpan);
      }
    }

    row.append(lbl, valWrap);
    statsBox.append(row);
  }

  // Danh sách trang bị trong túi để so sánh & mặc một chạm
  const bagList = $("char-bag-equips");
  bagList.replaceChildren();

  let countEquips = 0;
  for (let i = 0; i < INVENTORY_SLOTS; i++) {
    const s = invSlots[i];
    if (!s) continue;
    const def = ITEM_BY_ID[s.itemId];
    if (!def || def.type !== "equip" || !def.equip) continue;
    countEquips++;

    const eq = def.equip;
    const row = document.createElement("div");
    row.className = `char-bag-item${previewEquipItemId === def.id ? " previewing" : ""}`;

    const left = document.createElement("div");
    left.className = "char-bag-left";

    const icon = document.createElement("i");
    icon.className = "slot-icon";
    applyItemVisual(icon, def);

    const meta = document.createElement("div");
    meta.className = "char-bag-meta";

    const nameEl = document.createElement("b");
    nameEl.textContent = `${def.name} · ${EQUIP_SLOT_NAMES[eq.slot]}`;
    nameEl.style.color = hexColor(RARITY_COLORS[def.rarity]);

    const cmpLine = document.createElement("small");
    const nextStats = statsFor(currentRealm, currentTier, {
      ...currentEquip,
      [eq.slot]: def.id,
    });
    const deltas: Array<{ k: string; d: number }> = [
      { k: "Công", d: nextStats.atk - curStats.atk },
      { k: "Khí huyết", d: nextStats.maxHp - curStats.maxHp },
      { k: "Linh lực", d: nextStats.maxMp - curStats.maxMp },
      { k: "Tốc độ", d: nextStats.speed - curStats.speed },
    ];
    let hasDelta = false;
    for (const { k, d } of deltas) {
      if (d === 0) continue;
      if (hasDelta) cmpLine.append(document.createTextNode(" · "));
      hasDelta = true;
      const sp = document.createElement("span");
      sp.className = d > 0 ? "cmp-up" : "cmp-down";
      sp.textContent = `${k} ${d > 0 ? `+${d}` : `${d}`}`;
      cmpLine.append(sp);
    }
    if (!hasDelta) {
      const sp = document.createElement("span");
      sp.className = "cmp-eq";
      sp.textContent = "Ngang bằng món đang mặc";
      cmpLine.append(sp);
    }

    const ok = canEquip(def.id, currentRealm, currentTier);
    const reqText = realmLabel(eq.reqRealm, eq.reqTier);
    if (!ok) {
      cmpLine.append(document.createTextNode(" · "));
      const reqWarn = document.createElement("span");
      reqWarn.className = "req-warn";
      reqWarn.textContent = `Cần ${reqText}`;
      cmpLine.append(reqWarn);
    }

    meta.append(nameEl, cmpLine);
    left.append(icon, meta);

    const equipBtn = document.createElement("button");
    equipBtn.type = "button";
    equipBtn.className = "char-equip-btn";
    equipBtn.disabled = !ok;
    equipBtn.textContent = ok ? "Mặc" : `Cần ${reqText}`;
    equipBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!ok) return;
      sound.equip();
      callbacks?.onEquip(i);
    });

    row.addEventListener("pointerenter", (e) => {
      if (e.pointerType === "mouse" && previewEquipItemId !== def.id) {
        previewEquipItemId = def.id;
        renderCharModal();
      }
    });
    row.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      previewEquipItemId = previewEquipItemId === def.id ? null : def.id;
      renderCharModal();
    });

    row.append(left, equipBtn);
    bagList.append(row);
  }

  if (countEquips === 0) {
    const p = document.createElement("p");
    p.style.opacity = "0.72";
    p.style.fontSize = "12px";
    p.style.margin = "6px 0";
    p.style.textAlign = "center";
    p.textContent =
      "Trong túi chưa có trang bị nào. Hãy gặp Thợ rèn Thiết Ngưu ở phía đông Lạc Hà Trấn để rèn bảo khí.";
    bagList.append(p);
  }
}

// ---------- Giao diện rèn đồ ở Thợ rèn (#32) ----------

function renderForgeModal() {
  const npc = NPC_BY_ID[forgeNpcId];
  $("forge-title").textContent = npc ? `Lò Rèn · ${npc.name}` : "Lò Rèn Thiết Ngưu";
  const list = $("forge-list");
  list.replaceChildren();

  const recipes = RECIPES.filter((r) => r.npcId === forgeNpcId);
  for (const rec of recipes) {
    const outDef = ITEM_BY_ID[rec.output.itemId];
    if (!outDef) continue;

    const card = document.createElement("div");
    card.className = `forge-card${lastForgedItemId === outDef.id ? " forged-flash" : ""}`;

    const top = document.createElement("div");
    top.className = "forge-top";

    const info = document.createElement("div");
    info.className = "forge-item-info";

    const icon = document.createElement("i");
    icon.className = "slot-icon";
    applyItemVisual(icon, outDef);

    const titleCol = document.createElement("div");
    titleCol.className = "forge-title-col";

    const nameEl = document.createElement("b");
    nameEl.textContent = outDef.name;
    nameEl.style.color = hexColor(RARITY_COLORS[outDef.rarity]);

    const statLine = document.createElement("small");
    if (outDef.equip) {
      const slotName = EQUIP_SLOT_NAMES[outDef.equip.slot];
      const statsStr = describeEquipStats(outDef.equip.stats);
      const reqStr = realmLabel(outDef.equip.reqRealm, outDef.equip.reqTier);
      const okRealm = canEquip(outDef.id, currentRealm, currentTier);
      statLine.textContent = `${slotName} · ${statsStr} · `;
      const reqSpan = document.createElement("span");
      reqSpan.className = okRealm ? "req-ok" : "req-warn";
      reqSpan.textContent = okRealm ? `Đủ cảnh giới (${reqStr})` : `Cần ${reqStr} mới mặc được`;
      statLine.append(reqSpan);
    } else {
      statLine.textContent = outDef.desc;
    }

    titleCol.append(nameEl, statLine);
    info.append(icon, titleCol);

    let canCraft = true;
    const matsRow = document.createElement("div");
    matsRow.className = "forge-mats";

    for (const inp of rec.inputs) {
      const matDef = ITEM_BY_ID[inp.itemId];
      const have = countItem(invSlots, inp.itemId);
      const enough = have >= inp.qty;
      if (!enough) canCraft = false;

      const chip = document.createElement("span");
      chip.className = `forge-mat ${enough ? "ok" : "missing"}`;
      chip.textContent = `${matDef?.name ?? inp.itemId} ${have}/${inp.qty}`;
      matsRow.append(chip);
    }

    const forgeBtn = document.createElement("button");
    forgeBtn.type = "button";
    forgeBtn.className = "forge-btn";
    forgeBtn.disabled = !canCraft;
    forgeBtn.textContent = "Rèn";
    forgeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!canCraft) return;
      callbacks?.onCraft(rec.id);
    });

    top.append(info, forgeBtn);
    card.append(top, matsRow);
    list.append(card);
  }
}

// ---------- Giao diện Cửa hàng Lão Dược Sư (#100) ----------

let shopModalOpen = false;
let shopNpcId = "duoc_su";
let shopTab: "buy" | "sell" = "buy";
const shopBuyQuantities: Record<string, number> = {};
const shopSellQuantities: Record<number, number> = {};
let currentCoin = 0;

function renderShopModal() {
  const npc = NPC_BY_ID[shopNpcId];
  $("shop-title").textContent = npc ? `Cửa Hàng · ${npc.name}` : "Cửa Hàng Lão Dược Sư";
  $("shop-coin").textContent = currentCoin.toLocaleString("vi-VN");

  const tabBuy = $("tab-shop-buy");
  const tabSell = $("tab-shop-sell");
  const listBuy = $("shop-buy-list");
  const listSell = $("shop-sell-list");

  if (shopTab === "buy") {
    tabBuy.classList.add("active");
    tabSell.classList.remove("active");
    listBuy.hidden = false;
    listSell.hidden = true;
    renderShopBuy();
  } else {
    tabBuy.classList.remove("active");
    tabSell.classList.add("active");
    listBuy.hidden = true;
    listSell.hidden = false;
    renderShopSell();
  }
}

function renderShopBuy() {
  const list = $("shop-buy-list");
  list.replaceChildren();

  const shop = SHOP_BY_NPC[shopNpcId];
  if (!shop || shop.itemIds.length === 0) {
    const emptyP = document.createElement("p");
    emptyP.className = "shop-empty";
    emptyP.textContent = "Cửa hàng hiện chưa có mặt hàng nào.";
    list.append(emptyP);
    return;
  }

  for (const itemId of shop.itemIds) {
    const def = ITEM_BY_ID[itemId];
    if (!def) continue;

    const unitPrice = buyPrice(itemId);
    const qty = Math.min(SHOP_MAX_QTY, Math.max(1, shopBuyQuantities[itemId] ?? 1));
    shopBuyQuantities[itemId] = qty;
    const totalPrice = unitPrice * qty;
    const canAfford = currentCoin >= totalPrice;

    const card = document.createElement("div");
    card.className = "shop-card";

    // Cột trái: Icon + Thông tin
    const left = document.createElement("div");
    left.className = "shop-card-left";

    const icon = document.createElement("i");
    icon.className = "slot-icon";
    applyItemVisual(icon, def);

    const info = document.createElement("div");
    info.className = "shop-item-info";

    const nameRow = document.createElement("div");
    nameRow.className = "shop-item-name-row";

    const name = document.createElement("b");
    name.className = "shop-item-name";
    name.style.color = hexColor(RARITY_COLORS[def.rarity]);
    name.textContent = def.name;

    const priceTag = document.createElement("span");
    priceTag.className = "shop-price-tag";
    priceTag.textContent = `${unitPrice} 💎 / cái`;

    nameRow.append(name, priceTag);

    const desc = document.createElement("div");
    desc.className = "shop-item-desc";
    desc.textContent = def.desc;

    info.append(nameRow, desc);
    left.append(icon, info);

    // Cột phải: Chọn số lượng + Nút mua
    const right = document.createElement("div");
    right.className = "shop-card-right";

    const qtyBox = document.createElement("div");
    qtyBox.className = "shop-qty-box";

    const btnMinus = document.createElement("button");
    btnMinus.type = "button";
    btnMinus.className = "shop-qty-btn";
    btnMinus.textContent = "−";
    btnMinus.title = "Giảm số lượng";
    btnMinus.disabled = qty <= 1;
    btnMinus.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (qty > 1) {
        shopBuyQuantities[itemId] = qty - 1;
        renderShopBuy();
      }
    });

    const qtyVal = document.createElement("span");
    qtyVal.className = "shop-qty-val";
    qtyVal.textContent = `${qty}`;

    const btnPlus = document.createElement("button");
    btnPlus.type = "button";
    btnPlus.className = "shop-qty-btn";
    btnPlus.textContent = "+";
    btnPlus.title = "Tăng số lượng";
    btnPlus.disabled = qty >= SHOP_MAX_QTY;
    btnPlus.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (qty < SHOP_MAX_QTY) {
        shopBuyQuantities[itemId] = qty + 1;
        renderShopBuy();
      }
    });

    qtyBox.append(btnMinus, qtyVal, btnPlus);

    const buyBtn = document.createElement("button");
    buyBtn.type = "button";
    buyBtn.className = "shop-act-btn buy";
    buyBtn.disabled = !canAfford;

    const buyBtnText = document.createElement("span");
    buyBtnText.textContent = canAfford
      ? `Mua (${totalPrice} 💎)`
      : `Thiếu ${totalPrice - currentCoin} 💎`;
    buyBtn.append(buyBtnText);

    buyBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!canAfford) return;
      sound.pickup();
      callbacks?.onBuy?.(shopNpcId, itemId, qty);
    });

    right.append(qtyBox, buyBtn);
    card.append(left, right);
    list.append(card);
  }
}

function renderShopSell() {
  const list = $("shop-sell-list");
  list.replaceChildren();

  let sellableCount = 0;

  for (let i = 0; i < invSlots.length; i++) {
    const slot = invSlots[i];
    if (!slot) continue;
    const def = ITEM_BY_ID[slot.itemId];
    if (!def) continue;

    const unitPrice = sellPrice(slot.itemId);
    const canSell = unitPrice > 0;
    if (canSell) sellableCount++;

    const maxQty = slot.qty;
    const qty = Math.min(maxQty, Math.max(1, shopSellQuantities[i] ?? 1));
    shopSellQuantities[i] = qty;
    const totalPrice = unitPrice * qty;

    const card = document.createElement("div");
    card.className = `shop-card${canSell ? "" : " unsellable"}`;

    // Cột trái: Icon + Thông tin
    const left = document.createElement("div");
    left.className = "shop-card-left";

    const icon = document.createElement("i");
    icon.className = "slot-icon";
    applyItemVisual(icon, def);

    const info = document.createElement("div");
    info.className = "shop-item-info";

    const nameRow = document.createElement("div");
    nameRow.className = "shop-item-name-row";

    const name = document.createElement("b");
    name.className = "shop-item-name";
    name.style.color = hexColor(RARITY_COLORS[def.rarity]);
    name.textContent = `${def.name} ×${slot.qty}`;

    const priceTag = document.createElement("span");
    priceTag.className = "shop-price-tag";
    priceTag.textContent = canSell ? `Thu mua: ${unitPrice} 💎 / cái` : "Không thể bán";

    nameRow.append(name, priceTag);

    const desc = document.createElement("div");
    desc.className = "shop-item-desc";
    desc.textContent = canSell
      ? def.desc
      : "Vật phẩm đặc biệt hoặc đồ nhiệm vụ không thể bán cho NPC.";

    info.append(nameRow, desc);
    left.append(icon, info);

    // Cột phải: Chọn số lượng + Nút bán
    const right = document.createElement("div");
    right.className = "shop-card-right";

    if (canSell) {
      const qtyBox = document.createElement("div");
      qtyBox.className = "shop-qty-box";

      const btnMinus = document.createElement("button");
      btnMinus.type = "button";
      btnMinus.className = "shop-qty-btn";
      btnMinus.textContent = "−";
      btnMinus.title = "Giảm số lượng";
      btnMinus.disabled = qty <= 1;
      btnMinus.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (qty > 1) {
          shopSellQuantities[i] = qty - 1;
          renderShopSell();
        }
      });

      const qtyVal = document.createElement("span");
      qtyVal.className = "shop-qty-val";
      qtyVal.textContent = `${qty}`;

      const btnPlus = document.createElement("button");
      btnPlus.type = "button";
      btnPlus.className = "shop-qty-btn";
      btnPlus.textContent = "+";
      btnPlus.title = "Tăng số lượng";
      btnPlus.disabled = qty >= maxQty;
      btnPlus.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (qty < maxQty) {
          shopSellQuantities[i] = qty + 1;
          renderShopSell();
        }
      });

      qtyBox.append(btnMinus, qtyVal, btnPlus);

      const sellBtn = document.createElement("button");
      sellBtn.type = "button";
      sellBtn.className = "shop-act-btn sell";

      const sellBtnText = document.createElement("span");
      sellBtnText.textContent = `Bán (+${totalPrice} 💎)`;
      sellBtn.append(sellBtnText);

      sellBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        sound.pickup();
        callbacks?.onSell?.(shopNpcId, i, qty);
      });

      right.append(qtyBox, sellBtn);
    } else {
      const lockLabel = document.createElement("span");
      lockLabel.className = "shop-lock-label";
      lockLabel.textContent = "Đồ khóa";
      right.append(lockLabel);
    }

    card.append(left, right);
    list.append(card);
  }

  if (sellableCount === 0) {
    const emptyP = document.createElement("p");
    emptyP.className = "shop-empty";
    emptyP.textContent = "Túi đồ hiện không có vật phẩm nào có thể bán.";
    list.prepend(emptyP);
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
    if (
      opt.action.kind === "accept" ||
      opt.action.kind === "turnIn" ||
      opt.action.kind === "forge" ||
      opt.action.kind === "shop" ||
      opt.action.kind === "dungeon"
    ) {
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
    } else if (opt.action.kind === "forge") {
      const tag = document.createElement("small");
      tag.textContent = "Lò rèn";
      tag.style.color = "#ffe08a";
      btn.append(tag);
    } else if (opt.action.kind === "shop") {
      const tag = document.createElement("small");
      tag.textContent = "Cửa hàng";
      tag.style.color = "#ffe08a";
      btn.append(tag);
    } else if (opt.action.kind === "dungeon") {
      const tag = document.createElement("small");
      tag.textContent = opt.disabled ? "Chưa đủ điều kiện" : "Bí cảnh";
      tag.style.color = opt.disabled ? "#fca5a5" : "#ffe08a";
      btn.append(tag);
    }

    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (opt.disabled) return;
      const action = opt.action;
      const npcId = currentDialog?.npcId ?? "duoc_su";
      ui.closeDialog();
      if (action.kind === "turnIn") sound.questDone();
      if (action.kind === "forge") {
        ui.openForgeModal(npcId);
        return;
      }
      if (action.kind === "shop") {
        ui.openShopModal(npcId);
        return;
      }
      callbacks?.onDialogAction(action);
    });

    optBox.append(btn);
  }
}

// Cache trạng thái HUD DOM để tránh reflow / recalculate style không cần thiết mỗi frame (#71)
let cachedHudName = "";
let cachedHudRealm = "";
let cachedHudOnline = -1;
let cachedMeditating: boolean | null = null;
let cachedCanBreak: boolean | null = null;
const cachedBarPct: Record<string, number> = {};
const cachedBarText: Record<string, string> = {};
const cachedCooldownFrac: Record<string, number> = {};

// ---------- Luân hồi (M3.2) ----------
let activeLimboMsg: LimboMsg | null = null;
let activeSoulView: SoulView | null = null;
let selectedOrigin = DEFAULT_ORIGIN;
let selectedRelics: string[] = [];
let limboBuyCb: ((id: string) => void) | null = null;
let limboRebirthCb: ((choice: RebirthChoice) => void) | null = null;

function renderLimboStoneList() {
  const container = $("limbo-stone-list");
  if (!container || !activeSoulView) return;
  container.replaceChildren();

  // 1. Duyệt các mục nâng cấp chính trong UNLOCKS
  for (const def of UNLOCKS) {
    const item = document.createElement("div");
    item.className = "stone-item";

    const info = document.createElement("div");
    info.className = "stone-item-info";

    const nameRow = document.createElement("div");
    nameRow.className = "stone-item-name";
    nameRow.textContent = def.name;

    const currentLv = levelOf(activeSoulView.unlocks, def.id);
    const maxLv = def.costs.length;

    const lvBadge = document.createElement("span");
    lvBadge.className = "stone-item-level";
    lvBadge.textContent = `Nấc ${currentLv}/${maxLv}`;
    nameRow.append(lvBadge);
    info.append(nameRow);

    const desc = document.createElement("div");
    desc.className = "stone-item-desc";
    desc.textContent = def.desc;
    info.append(desc);

    const effect = document.createElement("div");
    effect.className = "stone-item-effect";
    if (currentLv > 0) {
      effect.textContent = `Hiện tại: ${def.effects[currentLv - 1]}`;
    } else {
      effect.textContent = "Chưa mở khóa";
    }
    info.append(effect);

    item.append(info);

    // Nút mua
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "stone-buy-btn";

    const cost = nextCost(activeSoulView, def.id);
    if (cost === null) {
      btn.disabled = true;
      btn.textContent = "Đã tối đa";
    } else {
      btn.textContent = `Mở · ${cost} Duyên`;
      if (activeSoulView.duyen < cost) {
        btn.disabled = true;
        btn.title = `Thiếu ${cost - activeSoulView.duyen} Duyên`;
      } else {
        btn.disabled = false;
        btn.addEventListener("click", () => {
          limboBuyCb?.(def.id);
        });
      }
    }
    item.append(btn);
    container.append(item);
  }

  // 2. Các xuất thân mở bằng Duyên (ORIGINS khác phàm gia)
  for (const o of ORIGINS) {
    if (o.cost <= 0) continue;
    const item = document.createElement("div");
    item.className = "stone-item";

    const info = document.createElement("div");
    info.className = "stone-item-info";

    const nameRow = document.createElement("div");
    nameRow.className = "stone-item-name";
    nameRow.textContent = `Xuất thân: ${o.name}`;

    const isUnlocked = activeSoulView.origins.includes(o.id);
    const lvBadge = document.createElement("span");
    lvBadge.className = "stone-item-level";
    lvBadge.textContent = isUnlocked ? "Đã mở" : "Chưa mở";
    nameRow.append(lvBadge);
    info.append(nameRow);

    const desc = document.createElement("div");
    desc.className = "stone-item-desc";
    desc.textContent = o.desc;
    info.append(desc);

    item.append(info);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "stone-buy-btn";
    if (isUnlocked) {
      btn.disabled = true;
      btn.textContent = "Đã sở hữu";
    } else {
      btn.textContent = `Mở · ${o.cost} Duyên`;
      if (activeSoulView.duyen < o.cost) {
        btn.disabled = true;
        btn.title = `Thiếu ${o.cost - activeSoulView.duyen} Duyên`;
      } else {
        btn.disabled = false;
        btn.addEventListener("click", () => {
          limboBuyCb?.(`${ORIGIN_BUY_PREFIX}${o.id}`);
        });
      }
    }
    item.append(btn);
    container.append(item);
  }

  // 3. Khắc chân linh: ghi "(sắp có)"
  const khacItem = document.createElement("div");
  khacItem.className = "stone-item";
  const khacInfo = document.createElement("div");
  khacInfo.className = "stone-item-info";

  const khacName = document.createElement("div");
  khacName.className = "stone-item-name";
  khacName.textContent = "Khắc chân linh";
  const khacBadge = document.createElement("span");
  khacBadge.className = "stone-item-level";
  khacBadge.textContent = "Sắp có";
  khacName.append(khacBadge);
  khacInfo.append(khacName);

  const khacDesc = document.createElement("div");
  khacDesc.className = "stone-item-desc";
  khacDesc.textContent =
    "Lưu giữ một môn công pháp hoặc kỳ nghệ tâm đắc qua kiếp (chờ xuất hiện công pháp).";
  khacInfo.append(khacDesc);
  khacItem.append(khacInfo);

  const khacBtn = document.createElement("button");
  khacBtn.type = "button";
  khacBtn.className = "stone-buy-btn";
  khacBtn.disabled = true;
  khacBtn.textContent = "Chưa mở";
  khacItem.append(khacBtn);
  container.append(khacItem);
}

function renderLimboOrigins() {
  const container = $("limbo-origin-list");
  if (!container || !activeSoulView) return;
  container.replaceChildren();

  for (const o of ORIGINS) {
    const isAvailable = o.cost === 0 || activeSoulView.origins.includes(o.id);
    const card = document.createElement("div");
    card.className = `origin-card${isAvailable ? "" : " locked"}${selectedOrigin === o.id ? " selected" : ""}`;

    const nameRow = document.createElement("div");
    nameRow.className = "origin-card-name";
    nameRow.textContent = o.name;

    if (!isAvailable) {
      const lockTag = document.createElement("span");
      lockTag.className = "origin-card-cost";
      lockTag.textContent = "🔒 Khóa";
      nameRow.append(lockTag);
    }
    card.append(nameRow);

    const desc = document.createElement("div");
    desc.className = "origin-card-desc";
    desc.textContent = o.desc;
    card.append(desc);

    if (isAvailable) {
      card.addEventListener("click", () => {
        selectedOrigin = o.id;
        renderLimboOrigins();
      });
    }

    container.append(card);
  }
}

function renderLimboRelics() {
  const container = $("limbo-relic-list");
  const emptyEl = $("limbo-relic-empty");
  const hintEl = $("limbo-relic-hint");
  if (!container || !activeSoulView || !activeLimboMsg) return;

  const cap = keepSlotsOf(activeSoulView.unlocks);
  if (hintEl) hintEl.textContent = `Tối đa ${cap} món (đã chọn ${selectedRelics.length}/${cap})`;

  const keepable = activeLimboMsg.keepable || [];
  if (cap === 0 || keepable.length === 0) {
    container.replaceChildren();
    if (emptyEl) {
      emptyEl.hidden = false;
      emptyEl.textContent =
        cap === 0
          ? 'Chưa mở khóa "Ký vật" ở Tam Sinh Thạch.'
          : "Không có trang bị nào để mang theo.";
    }
    return;
  }

  if (emptyEl) emptyEl.hidden = true;
  container.replaceChildren();

  keepable.forEach((itemId) => {
    const itemDef = ITEM_BY_ID[itemId];
    const itemName = itemDef?.name || itemId;
    const isChecked = selectedRelics.includes(itemId);
    const canCheck = isChecked || selectedRelics.length < cap;

    const item = document.createElement("div");
    item.className = `relic-item${isChecked ? " checked" : ""}${canCheck ? "" : " disabled"}`;

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = isChecked;
    cb.disabled = !canCheck && !isChecked;
    item.append(cb);

    const nameSpan = document.createElement("span");
    nameSpan.textContent = itemName;
    if (itemDef?.rarity) {
      nameSpan.style.color = hexColor(RARITY_COLORS[itemDef.rarity]);
    }
    item.append(nameSpan);

    item.addEventListener("click", (e) => {
      e.preventDefault();
      const pos = selectedRelics.indexOf(itemId);
      if (pos >= 0) {
        selectedRelics.splice(pos, 1);
      } else if (selectedRelics.length < cap) {
        selectedRelics.push(itemId);
      }
      renderLimboRelics();
    });

    container.append(item);
  });
}

function renderLimboAll() {
  if (!activeLimboMsg || !activeSoulView) return;
  const summary = activeLimboMsg.summary;

  const sub = $("limbo-kiep-sub");
  if (sub) sub.textContent = `Kiếp thứ ${summary.kiep} khép lại`;

  const realmEl = $("limbo-sum-realm");
  if (realmEl) realmEl.textContent = realmLabel(summary.realm, summary.tier);

  const timeEl = $("limbo-sum-time");
  if (timeEl) {
    const hrs = Math.floor(summary.minutes / 60);
    const mins = summary.minutes % 60;
    timeEl.textContent = hrs > 0 ? `${hrs} giờ ${mins} phút` : `${mins} phút`;
  }

  const killsEl = $("limbo-sum-kills");
  if (killsEl) killsEl.textContent = `${summary.kills} quái · ${summary.bossKills} trùm`;

  const gainEl = $("limbo-duyen-gain");
  if (gainEl) gainEl.textContent = `+${summary.gain}`;

  const duyenEl = $("limbo-duyen-total");
  if (duyenEl) duyenEl.textContent = `${activeSoulView.duyen}`;

  renderLimboStoneList();
  renderLimboOrigins();
  renderLimboRelics();
}

// ---------- Giao diện Tông môn (M3.6, #230) ----------

function renderSectMembersTab() {
  if (!currentSect) return;
  const list = $("sect-members-list");
  list.replaceChildren();

  const merged = mergeMemberPresence(currentSect.members, currentSectPresence);
  const summaryEl = $("sect-members-summary");
  if (summaryEl) {
    summaryEl.textContent = formatSectMembersSummary(merged.length);
  }
  const myRank = currentSect.myRank;

  for (const m of merged) {
    const item = document.createElement("div");
    item.className = "sect-member-item";

    const info = document.createElement("div");
    info.className = "sect-member-info";

    const titleRow = document.createElement("div");
    titleRow.className = "sect-member-title-row";

    const nameSpan = document.createElement("span");
    nameSpan.className = `sect-member-name${m.name === currentName ? " is-me" : ""}`;
    nameSpan.textContent = m.name;

    const rankBadge = document.createElement("span");
    rankBadge.className = `sect-member-rank ${m.rank}`;
    rankBadge.textContent = formatSectRole(m.rank);

    titleRow.append(nameSpan, rankBadge);

    const statusRow = document.createElement("div");
    statusRow.className = `sect-member-status${m.online ? " online" : ""}`;
    if (m.online && m.realm !== undefined && m.tier !== undefined) {
      statusRow.textContent = `Online · ${realmLabel(m.realm, m.tier)} · ${m.mapId ?? ""}`;
    } else if (m.online) {
      statusRow.textContent = `Online · ${m.mapId ?? ""}`;
    } else {
      statusRow.textContent = "Offline";
    }

    info.append(titleRow, statusRow);
    item.append(info);

    if (m.name !== currentName) {
      const actions = document.createElement("div");
      actions.className = "sect-member-actions";

      // Thăng Trưởng lão: Tông chủ có thể thăng cho Đệ tử nếu chưa đạt giới hạn
      if (myRank === "chu" && m.rank === "de_tu") {
        const elderCount = currentSect.members.filter((x) => x.rank === "truong_lao").length;
        const btnPromote = document.createElement("button");
        btnPromote.type = "button";
        btnPromote.className = "sect-action-btn";
        btnPromote.textContent = "Thăng TL";
        btnPromote.disabled = elderCount >= SECT_ELDERS_MAX;
        btnPromote.title =
          elderCount >= SECT_ELDERS_MAX ? "Đã tối đa 3 Trưởng lão" : "Thăng làm Trưởng lão";
        btnPromote.addEventListener("click", () => {
          callbacks?.onSectRank?.(m.name, "truong_lao");
        });
        actions.append(btnPromote);
      }

      // Giáng Đệ tử: Tông chủ có thể giáng Trưởng lão
      if (myRank === "chu" && m.rank === "truong_lao") {
        const btnDemote = document.createElement("button");
        btnDemote.type = "button";
        btnDemote.className = "sect-action-btn danger";
        btnDemote.textContent = "Giáng";
        btnDemote.title = "Giáng làm Đệ tử";
        btnDemote.addEventListener("click", () => {
          callbacks?.onSectRank?.(m.name, "de_tu");
        });
        actions.append(btnDemote);
      }

      // Chuyển vị Tông chủ (chỉ Tông chủ có quyền)
      if (canSect("transfer", myRank, m.rank)) {
        const btnTransfer = document.createElement("button");
        btnTransfer.type = "button";
        btnTransfer.className = "sect-action-btn danger";
        btnTransfer.textContent = "Nhường";
        btnTransfer.title = "Nhường vị Tông chủ";
        btnTransfer.addEventListener("click", () => {
          askSectConfirm("transfer", m.name, () => callbacks?.onSectTransfer?.(m.name));
        });
        actions.append(btnTransfer);
      }

      // Trục xuất / Mời ra
      if (canSect("kick", myRank, m.rank)) {
        const btnKick = document.createElement("button");
        btnKick.type = "button";
        btnKick.className = "sect-action-btn danger";
        btnKick.textContent = "Trục xuất";
        btnKick.title = "Trục xuất khỏi tông môn";
        btnKick.addEventListener("click", () => {
          askSectConfirm("kick", m.name, () => callbacks?.onSectKick?.(m.name));
        });
        actions.append(btnKick);
      }

      if (actions.children.length > 0) {
        item.append(actions);
      }
    }

    list.append(item);
  }
}

function renderSectTreasuryTab() {
  if (!currentSect) return;
  const valEl = $("sect-treasury-value");
  if (valEl) valEl.textContent = formatSectTreasury(currentSect.coin);

  const canWithdraw = canSect("withdraw", currentSect.myRank);
  $("sect-form-withdraw").hidden = !canWithdraw;

  const logsList = $("sect-logs-list");
  logsList.replaceChildren();

  const logs = currentSect.log || [];
  if (logs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "sect-empty-log";
    empty.textContent = "Chưa có biến động kho.";
    logsList.append(empty);
  } else {
    for (const entry of logs) {
      const item = document.createElement("div");
      item.className = `sect-log-item ${entry.kind}`;
      item.textContent = formatSectLog(entry);
      logsList.append(item);
    }
  }
}

function renderSectModal() {
  const modal = $("sect-modal");
  if (!sectModalOpen) {
    modal.hidden = true;
    $("btn-sect")?.classList.remove("active");
    return;
  }
  modal.hidden = false;
  $("btn-sect")?.classList.add("active");

  const viewNone = $("sect-view-none");
  const viewDetail = $("sect-view-detail");

  if (!currentSect) {
    viewNone.hidden = false;
    viewDetail.hidden = true;
    $("sect-head-title").textContent = "Tông Môn";
    $("sect-head-sub").textContent = "Chưa gia nhập tông môn";
    return;
  }

  viewNone.hidden = true;
  viewDetail.hidden = false;
  $("sect-head-title").textContent = currentSect.name;
  $("sect-head-sub").textContent = `[${currentSect.tag}] · ${formatSectRole(currentSect.myRank)}`;

  $("sect-tab-btn-overview").classList.toggle("active", sectTab === "overview");
  $("sect-tab-btn-members").classList.toggle("active", sectTab === "members");
  $("sect-tab-btn-treasury").classList.toggle("active", sectTab === "treasury");

  $("sect-tab-overview").hidden = sectTab !== "overview";
  $("sect-tab-members").hidden = sectTab !== "members";
  $("sect-tab-treasury").hidden = sectTab !== "treasury";

  if (sectTab === "overview") {
    $("sect-meta-tag").textContent = `[${currentSect.tag}]`;
    $("sect-meta-my-rank").textContent = formatSectRole(currentSect.myRank);
    $("sect-meta-member-count").textContent = `${currentSect.members.length} / ${SECT_MAX_MEMBERS}`;
    $("sect-meta-treasury").textContent = formatSectTreasury(currentSect.coin);

    const motdEl = $("sect-motd-text");
    motdEl.textContent = currentSect.motd || "(Chưa có thông báo)";
    const canEditMotd = canSect("motd", currentSect.myRank);
    $("sect-btn-edit-motd").hidden = !canEditMotd;
    $("sect-form-motd").hidden = true;
    motdEl.hidden = false;

    const canLeave = canSect("leave", currentSect.myRank);
    const canDisband = canSect("disband", currentSect.myRank);
    $("sect-btn-leave").hidden = !canLeave;
    $("sect-btn-disband").hidden = !canDisband;
    const confirmEl = $("sect-disband-confirm");
    if (confirmEl) confirmEl.hidden = true;
  } else if (sectTab === "members") {
    renderSectMembersTab();
  } else if (sectTab === "treasury") {
    renderSectTreasuryTab();
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
        if (!s) return;
        const def = ITEM_BY_ID[s.itemId];
        if (def?.effect) {
          callbacks?.onUse(i);
        } else if (def?.type === "equip" && canEquip(def.id, currentRealm, currentTier)) {
          sound.equip();
          callbacks?.onEquip(i);
        }
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
    bindTap("inv-btn-equip", () => {
      const s = invSlots[selectedSlot];
      if (s && canEquip(s.itemId, currentRealm, currentTier)) {
        sound.equip();
        callbacks?.onEquip(selectedSlot);
      }
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
    bindTap("btn-portal", () => portalCallback?.());

    // Tổ đội (#75, #91)
    try {
      if (localStorage.getItem("tg_party_collapsed") === "1") {
        $("party-panel").classList.add("collapsed");
        $("party-btn-toggle").textContent = "▸";
      }
    } catch {
      /* localStorage bị chặn (chế độ riêng tư): bỏ qua */
    }
    bindTap("party-btn-leave", () => callbacks?.onPartyLeave?.());
    bindTap("party-btn-toggle", () => {
      const panel = $("party-panel");
      panel.classList.toggle("collapsed");
      const isCollapsed = panel.classList.contains("collapsed");
      const btn = $("party-btn-toggle");
      btn.textContent = isCollapsed ? "▸" : "▾";
      try {
        localStorage.setItem("tg_party_collapsed", isCollapsed ? "1" : "0");
      } catch {
        /* localStorage bị chặn (chế độ riêng tư): bỏ qua */
      }
    });
    bindTap("pib-btn-accept", () => {
      stopInviteTimer();
      $("party-invite-box").hidden = true;
      if (currentInviteFrom) callbacks?.onPartyAccept?.(currentInviteFrom);
      processNextInvite();
    });
    bindTap("pib-btn-decline", () => {
      stopInviteTimer();
      $("party-invite-box").hidden = true;
      if (currentInviteFrom) callbacks?.onPartyDecline?.(currentInviteFrom);
      processNextInvite();
    });
    bindTap("pm-close", () => {
      $("player-menu").hidden = true;
    });
    bindTap("pm-invite-btn", () => {
      $("player-menu").hidden = true;
      if (selectedPlayerName) callbacks?.onPartyInvite?.(selectedPlayerName);
    });
    bindTap("pm-duel-btn", () => {
      $("player-menu").hidden = true;
      if (selectedPlayerName) callbacks?.onDuelChallenge?.(selectedPlayerName);
    });
    bindTap("pm-sect-btn", () => {
      $("player-menu").hidden = true;
      if (selectedPlayerName) callbacks?.onSectInvite?.(selectedPlayerName);
    });

    // Tông môn (M3.6, #230)
    bindTap("btn-sect", () => this.toggleSectModal());
    bindTap("sect-close", () => this.toggleSectModal(false));

    bindTap("sect-tab-btn-overview", () => this.switchSectTab("overview"));
    bindTap("sect-tab-btn-members", () => this.switchSectTab("members"));
    bindTap("sect-tab-btn-treasury", () => this.switchSectTab("treasury"));

    // Form tạo tông môn
    $("sect-form-create")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const nameInput = $("sect-input-name") as HTMLInputElement;
      const tagInput = $("sect-input-tag") as HTMLInputElement;
      const name = cleanSectName(nameInput.value);
      const tag = cleanSectTag(tagInput.value);
      if (!name) {
        this.toast({ text: "Tên tông môn phải từ 2 đến 16 ký tự", tone: "bad" });
        return;
      }
      if (!tag) {
        this.toast({ text: "Biệt hiệu phải từ 2 đến 4 ký tự", tone: "bad" });
        return;
      }
      callbacks?.onSectCreate?.(name, tag);
    });

    // Form sửa MOTD
    bindTap("sect-btn-edit-motd", () => {
      $("sect-motd-text").hidden = true;
      $("sect-btn-edit-motd").hidden = true;
      const form = $("sect-form-motd");
      form.hidden = false;
      const input = $("sect-input-motd") as HTMLInputElement;
      input.value = currentSect?.motd || "";
      input.focus();
    });

    bindTap("sect-btn-cancel-motd", () => {
      $("sect-motd-text").hidden = false;
      $("sect-btn-edit-motd").hidden = false;
      $("sect-form-motd").hidden = true;
    });

    $("sect-form-motd")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = $("sect-input-motd") as HTMLInputElement;
      const motd = cleanMotd(input.value) ?? "";
      callbacks?.onSectMotd?.(motd);
      $("sect-motd-text").hidden = false;
      $("sect-btn-edit-motd").hidden = false;
      $("sect-form-motd").hidden = true;
    });

    // Rời tông môn: hộp xác nhận trong game
    bindTap("sect-btn-leave", () => {
      askSectConfirm("leave", "", () => callbacks?.onSectLeave?.());
    });

    // Hộp xác nhận chung (Nhường / Trục xuất / Rời): dùng "click" để cú chạm mở hộp không rơi luôn vào nút đồng ý
    $("sect-action-confirm-cancel")?.addEventListener("click", () => closeSectConfirm());
    $("sect-action-confirm-ok")?.addEventListener("click", () => {
      const action = sectConfirmAction;
      closeSectConfirm();
      action?.();
    });

    // Giải tán tông môn
    bindTap("sect-btn-disband", () => {
      $("sect-btn-disband").hidden = true;
      $("sect-disband-confirm").hidden = false;
    });

    bindTap("sect-btn-disband-cancel", () => {
      $("sect-disband-confirm").hidden = true;
      $("sect-btn-disband").hidden = false;
    });

    bindTap("sect-btn-disband-confirm", () => {
      $("sect-disband-confirm").hidden = true;
      $("sect-btn-disband").hidden = false;
      callbacks?.onSectDisband?.();
    });

    // Kho tông môn: Nộp
    $("sect-form-deposit")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = $("sect-input-deposit") as HTMLInputElement;
      const amount = parseInt(input.value, 10);
      if (isNaN(amount) || amount <= 0) {
        this.toast({ text: "Số lượng Linh thạch không hợp lệ", tone: "bad" });
        return;
      }
      callbacks?.onSectDeposit?.(amount);
      input.value = "";
    });

    // Kho tông môn: Rút
    $("sect-form-withdraw")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = $("sect-input-withdraw") as HTMLInputElement;
      const amount = parseInt(input.value, 10);
      if (isNaN(amount) || amount <= 0) {
        this.toast({ text: "Số lượng Linh thạch không hợp lệ", tone: "bad" });
        return;
      }
      callbacks?.onSectWithdraw?.(amount);
      input.value = "";
    });

    // Hộp lời mời tông môn
    bindTap("sib-btn-accept", () => {
      stopSectInviteTimer();
      const from = currentSectInvite?.from;
      currentSectInvite = null;
      $("sect-invite-box").hidden = true;
      if (from) callbacks?.onSectAccept?.(from);
    });

    bindTap("sib-btn-decline", () => {
      stopSectInviteTimer();
      const from = currentSectInvite?.from;
      currentSectInvite = null;
      $("sect-invite-box").hidden = true;
      if (from) callbacks?.onSectDecline?.(from);
    });

    // Bí cảnh (M3.4, #200)
    const mockBadge = $("dungeon-mock-badge");
    if (mockBadge) {
      mockBadge.hidden = !isMockDungeonEnabled();
    }

    // PK Thách đấu (M3.5, #218)
    const duelMockBadge = $("duel-mock-badge");
    if (duelMockBadge) {
      duelMockBadge.hidden = !isMockDuelEnabled();
    }

    bindTap("duib-btn-accept", () => {
      stopDuelInviteTimer();
      const from = currentDuelInvite?.from;
      currentDuelInvite = null;
      $("duel-invite-box").hidden = true;
      if (from) callbacks?.onDuelAccept?.(from);
    });

    bindTap("duib-btn-decline", () => {
      stopDuelInviteTimer();
      const from = currentDuelInvite?.from;
      currentDuelInvite = null;
      $("duel-invite-box").hidden = true;
      if (from) callbacks?.onDuelDecline?.(from);
    });

    bindTap("duel-btn-yield", () => {
      $("duel-btn-yield").hidden = true;
      $("duel-yield-confirm").hidden = false;
    });

    bindTap("duel-btn-yield-no", () => {
      $("duel-yield-confirm").hidden = true;
      $("duel-btn-yield").hidden = false;
    });

    bindTap("duel-btn-yield-yes", () => {
      $("duel-yield-confirm").hidden = true;
      $("duel-btn-yield").hidden = false;
      callbacks?.onDuelYield?.();
    });

    bindTap("duend-btn-close", () => {
      $("duel-end-modal").hidden = true;
    });

    bindTap("dib-btn-enter", () => {
      stopDungeonInviteTimer();
      const runId = currentDungeonInvite?.runId;
      currentDungeonInvite = null;
      $("dungeon-invite-box").hidden = true;
      if (runId) callbacks?.onDungeonEnter?.(runId);
    });

    bindTap("dib-btn-decline", () => {
      stopDungeonInviteTimer();
      const runId = currentDungeonInvite?.runId;
      currentDungeonInvite = null;
      $("dungeon-invite-box").hidden = true;
      if (runId) callbacks?.onDungeonDecline?.(runId);
    });

    bindTap("dhud-btn-leave", () => {
      $("dhud-btn-leave").hidden = true;
      $("dhud-leave-confirm").hidden = false;
    });

    bindTap("dhud-btn-leave-no", () => {
      $("dhud-leave-confirm").hidden = true;
      $("dhud-btn-leave").hidden = false;
    });

    bindTap("dhud-btn-leave-yes", () => {
      $("dhud-leave-confirm").hidden = true;
      $("dhud-btn-leave").hidden = false;
      callbacks?.onDungeonLeave?.();
    });

    bindTap("dend-btn-close", () => {
      $("dungeon-end-modal").hidden = true;
    });

    bindTap("dend-btn-leave", () => {
      $("dungeon-end-modal").hidden = true;
      callbacks?.onDungeonLeave?.();
    });

    // Bảng nhân vật & Trang bị (#31) + Lò rèn (#32) + Cửa hàng (#100)
    bindTap("btn-char", () => this.toggleCharModal());
    bindTap("char-close", () => this.toggleCharModal(false));
    bindTap("forge-close", () => this.toggleForgeModal(false));
    bindTap("shop-close", () => this.toggleShopModal(false));
    bindTap("tab-shop-buy", () => {
      shopTab = "buy";
      renderShopModal();
    });
    bindTap("tab-shop-sell", () => {
      shopTab = "sell";
      renderShopModal();
    });

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

    // Bảng đo hiệu năng chỉ hiện khi mở bằng ?perf=1 (#71)
    if (
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("perf") === "1"
    ) {
      $("perf-panel").hidden = false;
    }
  },

  updatePerf(stats: {
    fps: number;
    frameAvgMs: number;
    frameP95Ms: number;
    players: number;
    monsters: number;
    loots: number;
    tweens: number;
  }) {
    const panel = $("perf-panel");
    if (panel.hidden) return;
    $("perf-fps").textContent = `${Math.round(stats.fps)}`;
    $("perf-frame").textContent =
      `${stats.frameAvgMs.toFixed(1)} / ${stats.frameP95Ms.toFixed(1)} ms`;
    $("perf-entities").textContent = `${stats.players} / ${stats.monsters} / ${stats.loots}`;
    $("perf-tweens").textContent = `${stats.tweens}`;
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

  toggleCharModal(force?: boolean) {
    charModalOpen = force ?? !charModalOpen;
    $("char-modal").hidden = !charModalOpen;
    $("btn-char").classList.toggle("active", charModalOpen);
    if (charModalOpen) {
      previewEquipItemId = null;
      renderCharModal();
    }
  },

  isCharModalOpen() {
    return charModalOpen;
  },

  openForgeModal(npcId = "tho_ren") {
    forgeNpcId = npcId;
    this.toggleForgeModal(true);
  },

  toggleForgeModal(force?: boolean) {
    forgeModalOpen = force ?? !forgeModalOpen;
    $("forge-modal").hidden = !forgeModalOpen;
    if (forgeModalOpen) renderForgeModal();
  },

  isForgeModalOpen() {
    return forgeModalOpen;
  },

  openShopModal(npcId = "duoc_su") {
    shopNpcId = npcId;
    this.toggleShopModal(true);
  },

  toggleShopModal(force?: boolean) {
    shopModalOpen = force ?? !shopModalOpen;
    $("shop-modal").hidden = !shopModalOpen;
    if (shopModalOpen) renderShopModal();
  },

  isShopModalOpen() {
    return shopModalOpen;
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
    if (charModalOpen) {
      this.toggleCharModal(false);
      closedAny = true;
    }
    if (forgeModalOpen) {
      this.toggleForgeModal(false);
      closedAny = true;
    }
    if (shopModalOpen) {
      this.toggleShopModal(false);
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
    if (sectModalOpen) {
      this.toggleSectModal(false);
      closedAny = true;
    }
    if (this.isPlayerMenuOpen()) {
      this.closePlayerMenu();
      closedAny = true;
    }
    return closedAny;
  },

  /** Đóng modal kết quả quyết đấu riêng biệt (không gộp vào closeAllModals để người thua xem được khi bị KO) */
  closeDuelEndModal(): boolean {
    const duelEndModal = $("duel-end-modal");
    if (duelEndModal && !duelEndModal.hidden) {
      duelEndModal.hidden = true;
      return true;
    }
    return false;
  },

  isDuelEndModalOpen(): boolean {
    const duelEndModal = $("duel-end-modal");
    return Boolean(duelEndModal && !duelEndModal.hidden);
  },

  onInv(m: InvMsg) {
    invSlots = m.slots;
    const now = performance.now();
    itemCdUntil.clear();
    for (const [itemId, remMs] of Object.entries(m.cd ?? {})) {
      if (remMs > 0) itemCdUntil.set(itemId, now + remMs);
    }
    if (m.gained) {
      let forgedEquip = false;
      for (const g of m.gained) {
        showGainFeed(g.itemId, g.qty);
        const gDef = ITEM_BY_ID[g.itemId];
        if (gDef?.type === "equip" && forgeModalOpen) {
          forgedEquip = true;
          lastForgedItemId = g.itemId;
          setTimeout(() => {
            if (lastForgedItemId === g.itemId) {
              lastForgedItemId = null;
              if (forgeModalOpen) renderForgeModal();
            }
          }, 900);
        }
      }
      if (forgedEquip) sound.forge();
      else sound.pickup();
    }
    renderInventory();
    renderQuestTracker();
    if (questModalOpen) renderQuestModal();
    if (shopModalOpen && shopTab === "sell") renderShopSell();
  },

  onWallet(m: WalletMsg) {
    currentCoin = m.coin;
    const coinStr = m.coin.toLocaleString("vi-VN");
    const hudCoin = $("hud-coin");
    if (hudCoin) hudCoin.textContent = coinStr;
    const charCoin = $("char-coin");
    if (charCoin) charCoin.textContent = coinStr;
    const shopCoin = $("shop-coin");
    if (shopCoin) shopCoin.textContent = coinStr;

    if (m.gained !== undefined && m.gained !== 0) {
      showCoinGainFeed(m.gained);
    }

    if (shopModalOpen) {
      renderShopModal();
    }
  },

  getCurrentCoin(): number {
    return currentCoin;
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

  portalPrompt(label: string | null, onTravel?: () => void) {
    const btn = $("btn-portal");
    btn.hidden = label === null;
    if (label !== null) {
      $("portal-label").textContent = `${label} (F)`;
      if (onTravel) portalCallback = onTravel;
    } else {
      portalCallback = null;
    }
  },

  pickupPrompt(label: string | null) {
    const btn = $("btn-pickup");
    btn.hidden = label === null;
    if (label !== null) $("pickup-label").textContent = label;
  },

  setCurrentMapId(mapId: string) {
    currentMapId = mapId;
    const mapDef = getMap(mapId);
    const h2 = $("map-modal")?.querySelector("h2");
    if (h2 && mapDef) h2.textContent = `Sơn Hà Đồ · ${mapDef.def.name}`;
    if (isDungeonMap(mapId)) {
      document.body.classList.add("in-dungeon");
      stopDungeonInviteTimer();
      currentDungeonInvite = null;
      const invBox = $("dungeon-invite-box");
      if (invBox) invBox.hidden = true;
      const hudEl = $("dungeon-hud");
      if (hudEl) hudEl.hidden = false;
      const mapNameEl = $("dhud-map-name");
      if (mapNameEl && mapDef) mapNameEl.textContent = mapDef.def.name;
      const confirmEl = $("dhud-leave-confirm");
      if (confirmEl) confirmEl.hidden = true;
      const leaveBtn = $("dhud-btn-leave");
      if (leaveBtn) leaveBtn.hidden = false;
    } else {
      document.body.classList.remove("in-dungeon");
      this.hideDungeonHud();
      if (this.takeDungeonFallenPending()) {
        this.death(null);
        this.toast({ text: dungeonFallenToastText(this.getDungeonRewardsLeft()), tone: "bad" });
      }
    }
    renderPartyPanel();
  },

  showTransition(mapName: string) {
    const overlay = $("transition-overlay");
    const nameEl = $("transition-map-name");
    if (nameEl) nameEl.textContent = mapName;
    overlay.hidden = false;
    requestAnimationFrame(() => {
      overlay.classList.add("active");
    });
  },

  hideTransition() {
    const overlay = $("transition-overlay");
    overlay.classList.remove("active");
    setTimeout(() => {
      overlay.hidden = true;
    }, 350);
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
      const rounded = Math.round(Math.max(0, Math.min(1, frac)) * 100) / 100;
      const cdKey = `quick-${idx}`;
      if (cachedCooldownFrac[cdKey] !== rounded) {
        cachedCooldownFrac[cdKey] = rounded;
        (btn.querySelector(".cd") as HTMLElement).style.transform = `scaleY(${rounded})`;
      }
    }
    if (invOpen) {
      for (let i = 0; i < INVENTORY_SLOTS; i++) {
        const s = invSlots[i];
        const def = s ? ITEM_BY_ID[s.itemId] : undefined;
        const until = s ? (itemCdUntil.get(s.itemId) ?? 0) : 0;
        const frac = def?.cooldown && until > now ? (until - now) / def.cooldown : 0;
        const rounded = Math.round(Math.max(0, Math.min(1, frac)) * 100) / 100;
        const cdKey = `slot-${i}`;
        if (cachedCooldownFrac[cdKey] !== rounded) {
          cachedCooldownFrac[cdKey] = rounded;
          slotCdEls[i].style.transform = `scaleY(${rounded})`;
        }
      }
    }
  },

  hud(p: HudPlayer, online: number) {
    const nextW = p.weapon ?? "";
    const nextR = p.robe ?? "";
    const nextT = p.talisman ?? "";
    const equipOrRealmChanged =
      p.realm !== currentRealm ||
      p.tier !== currentTier ||
      nextW !== currentEquip.weapon ||
      nextR !== currentEquip.robe ||
      nextT !== currentEquip.talisman;

    currentName = p.name;
    currentRealm = p.realm;
    currentTier = p.tier;
    currentEquip = { weapon: nextW, robe: nextR, talisman: nextT };

    if (equipOrRealmChanged) {
      if (charModalOpen) renderCharModal();
      if (invOpen) renderSlotDetail();
      if (forgeModalOpen) renderForgeModal();
    }

    if (p.name !== cachedHudName) {
      cachedHudName = p.name;
      $("hud-name").textContent = p.name;
    }
    const rLabel = realmLabel(p.realm, p.tier);
    if (rLabel !== cachedHudRealm) {
      cachedHudRealm = rLabel;
      $("hud-realm").textContent = rLabel;
    }
    const set = (k: string, v: number, max: number, label: string) => {
      const pct = Math.round(Math.max(0, Math.min(1, max > 0 ? v / max : 0)) * 1000) / 10;
      if (pct !== cachedBarPct[k]) {
        cachedBarPct[k] = pct;
        $(`${k}-fill`).style.width = `${pct}%`;
      }
      const text = `${label} ${fmt(v)} / ${fmt(max)}`;
      if (text !== cachedBarText[k]) {
        cachedBarText[k] = text;
        $(`${k}-text`).textContent = text;
      }
    };
    set("hp", p.hp, p.maxHp, "Khí huyết");
    set("mp", p.mp, p.maxMp, "Linh lực");
    set("exp", p.exp, p.expMax, "Tu vi");
    if (online !== cachedHudOnline) {
      cachedHudOnline = online;
      $("hud-online").textContent = `Đạo hữu: ${online}`;
    }
    if (p.meditating !== cachedMeditating) {
      cachedMeditating = p.meditating;
      $("sk-med").classList.toggle("on", p.meditating);
    }
    const canBreak = isLastTier(p.realm, p.tier) && p.exp >= p.expMax && !isPeak(p.realm, p.tier);
    if (canBreak !== cachedCanBreak) {
      cachedCanBreak = canBreak;
      $("sk-break").classList.toggle("ready", canBreak);
    }
  },

  cooldown(id: "sk-slash" | "sk-sword", frac: number) {
    const clamped = Math.max(0, Math.min(1, frac));
    const rounded = Math.round(clamped * 100) / 100;
    if (cachedCooldownFrac[id] === rounded) return;
    cachedCooldownFrac[id] = rounded;
    ($(id).querySelector(".cd") as HTMLElement).style.transform = `scaleY(${rounded})`;
  },

  chat(m: ChatOut) {
    const log = $("chat-log");
    const p = document.createElement("p");
    if (m.sys) {
      p.className = "sys";
      p.textContent = m.text;
    } else if (m.channel === "party") {
      p.className = "party";
      const b = document.createElement("b");
      b.textContent = `[Đội] ${m.from}: `;
      p.append(b, document.createTextNode(m.text));
    } else if (m.channel === "sect") {
      p.className = "sect";
      const b = document.createElement("b");
      b.textContent = `[Tông môn] ${m.from}: `;
      p.append(b, document.createTextNode(m.text));
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

  onParty(m: PartyMsg) {
    partyData = m;
    renderPartyPanel();
  },

  onPartyInvited(m: PartyInvitedMsg) {
    inviteQueue.push(m);
    if (!currentInviteFrom) {
      processNextInvite();
    }
  },

  openPlayerMenu(
    name: string,
    realm: number,
    tier: number,
    x: number,
    y: number,
    challengeCheck?: DuelChallengeCheck,
    targetSect?: string,
  ) {
    if (name === currentName) return;
    selectedPlayerName = name;
    $("pm-name").textContent = name;
    $("pm-realm").textContent = realmLabel(realm, tier);

    const isFull = partyData.members.length >= PARTY_MAX;
    const btn = $("pm-invite-btn") as HTMLButtonElement;
    btn.disabled = isFull;
    btn.textContent = isFull ? "Đội đã đủ (4/4)" : "Mời vào tổ đội";

    // Nút Thách đấu (M3.5, #218)
    const duelBtn = $("pm-duel-btn") as HTMLButtonElement | null;
    const duelHint = $("pm-duel-hint");
    if (duelBtn) {
      const canDuel = challengeCheck ? challengeCheck.ok : true;
      duelBtn.disabled = !canDuel;
      duelBtn.textContent = "Thách Đấu (PK)";
      if (duelHint) {
        if (!canDuel && challengeCheck && !challengeCheck.ok) {
          duelHint.textContent = duelChallengeFailMessage(challengeCheck.reason);
          duelHint.hidden = false;
        } else {
          duelHint.textContent = "";
          duelHint.hidden = true;
        }
      }
    }

    // Nút Mời Tông Môn (M3.6, #230)
    const sectBtn = $("pm-sect-btn") as HTMLButtonElement | null;
    const sectHint = $("pm-sect-hint");
    if (sectBtn) {
      if (!currentSect) {
        sectBtn.hidden = true;
        if (sectHint) sectHint.hidden = true;
      } else {
        sectBtn.hidden = false;
        const canInvite = canSect("invite", currentSect.myRank);
        if (!canInvite) {
          sectBtn.disabled = true;
          sectBtn.textContent = "Mời vào tông môn";
          if (sectHint) {
            sectHint.textContent = "Chỉ Tông chủ và Trưởng lão được mời";
            sectHint.hidden = false;
          }
        } else if (targetSect && targetSect === currentSect.name) {
          sectBtn.disabled = true;
          sectBtn.textContent = "Đã cùng tông môn";
          if (sectHint) sectHint.hidden = true;
        } else if (currentSect.members.length >= SECT_MAX_MEMBERS) {
          sectBtn.disabled = true;
          sectBtn.textContent = `Tông môn đã đủ (${SECT_MAX_MEMBERS}/${SECT_MAX_MEMBERS})`;
          if (sectHint) sectHint.hidden = true;
        } else {
          sectBtn.disabled = false;
          sectBtn.textContent = "Mời vào tông môn";
          if (sectHint) sectHint.hidden = true;
        }
      }
    }

    const menu = $("player-menu");
    menu.hidden = false;
    const pad = 10;
    const mw = menu.offsetWidth || 200;
    const mh = menu.offsetHeight || 140;
    const clampedX = Math.max(pad, Math.min(window.innerWidth - mw - pad, x));
    const clampedY = Math.max(pad, Math.min(window.innerHeight - mh - pad, y));
    menu.style.left = `${clampedX}px`;
    menu.style.top = `${clampedY}px`;
  },

  closePlayerMenu() {
    $("player-menu").hidden = true;
  },

  isPlayerMenuOpen() {
    return !$("player-menu").hidden;
  },

  getParty(): PartyMsg {
    return partyData;
  },

  isPartyFull(): boolean {
    return partyData.members.length >= PARTY_MAX;
  },

  toast(m: ToastMsg) {
    const p = document.createElement("p");
    p.className = m.tone ?? "info";
    p.textContent = m.text;
    $("toast").append(p);
    setTimeout(() => p.remove(), 3000);
  },

  death(secondsLeft: number | null, text?: string, subText?: string) {
    const box = $("death");
    box.hidden = secondsLeft === null;
    if (secondsLeft !== null) {
      $("death-t").textContent = text ?? `Hồi sinh tại Lạc Hà Trấn sau ${secondsLeft}s`;
      const sub = $("death-sub") as HTMLElement | null;
      if (sub) {
        sub.hidden = !subText;
        sub.textContent = subText ?? "";
      }
    } else {
      const sub = $("death-sub") as HTMLElement | null;
      if (sub) {
        sub.hidden = true;
        sub.textContent = "";
      }
    }
  },

  /** Banner đỏ khi đang nối lại (chỉ một khung, không kèm toast trùng nội dung). */
  showReconnectNotice(text: string) {
    const banner = $("reconnect-banner");
    banner.hidden = false;
    banner.classList.remove("failed");
    $("reconnect-reload").hidden = true;
    $("reconnect-banner-text").textContent = text;

    document.body.classList.add("reconnecting");
    this.closeAllModals();
    this.closeDuelEndModal();
    this.closeDialog();
    this.closePlayerMenu();
  },

  /** Nối lại thất bại hẳn: giữ banner cố định kèm nút tải lại trang, vẫn chặn điều khiển. */
  showReconnectFailed(text: string) {
    this.showReconnectNotice(text);
    $("reconnect-banner").classList.add("failed");
    const reload = $("reconnect-reload") as HTMLButtonElement;
    reload.hidden = false;
    reload.onclick = () => location.reload();
  },

  hideReconnectNotice() {
    const banner = $("reconnect-banner");
    banner.hidden = true;
    banner.classList.remove("failed");
    $("reconnect-reload").hidden = true;
    document.body.classList.remove("reconnecting");
  },

  /** Cập nhật số Kiếp hiển thị ở HUD */
  setKiep(kiep: number) {
    const badge = $("hud-kiep");
    if (!badge) return;
    if (kiep >= 1) {
      badge.hidden = false;
      badge.textContent = `Kiếp ${kiep}`;
    } else {
      badge.hidden = true;
    }
  },

  /** Màn hình Hoàng Tuyền · Bến Vong Xuyên (M3.2) */
  showLimbo(
    msg: LimboMsg,
    callbacks?: {
      onBuy?: (id: string) => void;
      onRebirth?: (choice: RebirthChoice) => void;
    },
  ) {
    activeLimboMsg = msg;
    activeSoulView = msg.soul;
    selectedOrigin =
      msg.soul.origins && msg.soul.origins.length > 0 ? msg.soul.origins[0] : DEFAULT_ORIGIN;
    selectedRelics = [];
    limboBuyCb = callbacks?.onBuy ?? null;
    limboRebirthCb = callbacks?.onRebirth ?? null;

    this.closeAllModals();
    this.closeDuelEndModal();
    this.closeDialog();
    this.closePlayerMenu();
    this.death(null);

    document.body.classList.add("in-limbo");
    const overlay = $("limbo-overlay");
    if (overlay) overlay.hidden = false;

    renderLimboAll();

    const rebirthBtn = $("limbo-btn-rebirth");
    if (rebirthBtn) {
      rebirthBtn.onclick = () => {
        limboRebirthCb?.({
          origin: selectedOrigin,
          keep: selectedRelics,
        });
      };
    }
  },

  /** Server cập nhật chân linh sau khi mua */
  updateSoul(soul: SoulView) {
    activeSoulView = soul;
    if (activeLimboMsg) {
      activeLimboMsg.soul = soul;
    }
    renderLimboAll();
  },

  /** Đóng màn hình Hoàng Tuyền */
  hideLimbo() {
    activeLimboMsg = null;
    activeSoulView = null;
    limboBuyCb = null;
    limboRebirthCb = null;
    const overlay = $("limbo-overlay");
    if (overlay) overlay.hidden = true;
    document.body.classList.remove("in-limbo");
  },

  isLimboOpen(): boolean {
    const overlay = $("limbo-overlay");
    return Boolean(overlay && !overlay.hidden);
  },

  /** Chuyển cảnh Mạnh Bà và bắt đầu kiếp mới */
  showReborn(kiep: number, onComplete?: () => void) {
    this.hideLimbo();
    this.setKiep(kiep);

    const overlay = $("reborn-overlay");
    const title = $("reborn-title");
    if (title) title.textContent = `Kiếp Thứ ${kiep} Bắt Đầu`;

    if (overlay) {
      overlay.hidden = false;
      // Trigger animation
      requestAnimationFrame(() => {
        overlay.classList.add("active");
      });

      setTimeout(() => {
        overlay.classList.remove("active");
        setTimeout(() => {
          overlay.hidden = true;
          onComplete?.();
        }, 600);
      }, 2500);
    } else {
      onComplete?.();
    }
  },

  /** Nhận lời mời vào Bí cảnh (hộp nhỏ không chặn điều khiển, nhiều lời mời liên tiếp không chồng) */
  onDungeonInvite(msg: DungeonInviteMsg) {
    stopDungeonInviteTimer();
    currentDungeonInvite = msg;

    const d = dungeonOf(msg.dungeonId);
    const titleEl = $("dib-title");
    if (titleEl) titleEl.textContent = d?.name ?? "Linh Hư Bí Cảnh";

    const msgEl = $("dib-msg");
    if (msgEl) msgEl.textContent = `Đội trưởng ${msg.from} triệu tập vào bí cảnh.`;

    const rewardsEl = $("dib-rewards-left");
    if (rewardsEl) {
      rewardsEl.textContent = `Lượt nhận thưởng hoàn thành hôm nay: ${msg.rewardsLeft}/${DUNGEON_DAILY_REWARDS}`;
    }

    const totalMs = Math.max(1000, Number.isFinite(msg.expiresInMs) ? msg.expiresInMs : 60_000);
    const deadline = Date.now() + totalMs;

    const countdownEl = $("dib-countdown");
    if (countdownEl) countdownEl.textContent = formatInviteCountdown(totalMs);

    const barEl = $("dib-timer-bar");
    if (barEl) barEl.style.width = "100%";

    const box = $("dungeon-invite-box");
    if (box) box.hidden = false;

    dungeonInviteInterval = window.setInterval(() => {
      const rem = deadline - Date.now();
      if (rem <= 0) {
        stopDungeonInviteTimer();
        currentDungeonInvite = null;
        if (box) box.hidden = true;
        return;
      }
      if (countdownEl) countdownEl.textContent = formatInviteCountdown(rem);
      if (barEl) barEl.style.width = `${Math.max(0, Math.min(100, (rem / totalMs) * 100))}%`;
    }, 200);
  },

  /** Cập nhật HUD Bí cảnh (1 lần / giây từ server + tự đếm đồng hồ mượt) */
  onDungeonState(msg: DungeonStateMsg) {
    document.body.classList.add("in-dungeon");
    const hud = $("dungeon-hud");
    if (hud) hud.hidden = false;

    const pInfo = dungeonPhaseInfo(msg.phase);
    const phaseEl = $("dhud-phase");
    if (phaseEl) {
      phaseEl.textContent = pInfo.label;
      phaseEl.className = `dhud-phase ${pInfo.tone}`;
    }

    const mobsEl = $("dhud-mobs");
    if (mobsEl) {
      mobsEl.textContent = `Yêu thú hộ vệ còn lại: ${Math.max(0, Math.floor(msg.mobsLeft))}`;
    }

    const bView = formatBossView(msg.boss, currentMapId);
    const bossWrap = $("dhud-boss-wrap");
    if (bossWrap) {
      bossWrap.hidden = !bView.visible;
      if (bView.visible) {
        $("dhud-boss-name").textContent = bView.name;
        $("dhud-boss-text").textContent = bView.text;
        $("dhud-boss-fill").style.width = `${bView.pct}%`;
      }
    }

    const memContainer = $("dhud-members");
    if (memContainer) {
      memContainer.replaceChildren();
      for (const m of msg.members) {
        const tag = document.createElement("span");
        tag.className = `dhud-mem${m.alive ? "" : " dead"}`;
        tag.textContent = m.alive ? `● ${m.name}` : `✕ ${m.name} (Đã gục)`;
        memContainer.append(tag);
      }
    }

    const leaveBtn = $("dhud-btn-leave");
    const confirmBox = $("dhud-leave-confirm");
    if (!pInfo.showLeaveBtn) {
      if (leaveBtn) leaveBtn.hidden = true;
      if (confirmBox) confirmBox.hidden = true;
    } else if (confirmBox && confirmBox.hidden && leaveBtn) {
      leaveBtn.hidden = false;
    }

    const safeDeadlineMs = Number.isFinite(msg.deadlineInMs) ? Math.max(0, msg.deadlineInMs) : 0;
    dungeonDeadlineAt = Date.now() + safeDeadlineMs;
    const timerEl = $("dhud-timer");
    if (timerEl) timerEl.textContent = formatDungeonCountdown(safeDeadlineMs);

    stopDungeonHudTimer();
    dungeonHudInterval = window.setInterval(() => {
      const rem = dungeonDeadlineAt - Date.now();
      if (timerEl) timerEl.textContent = formatDungeonCountdown(rem);
      if (rem <= 0) stopDungeonHudTimer();
    }, 250);
  },

  /** Ẩn HUD và màn kết quả Bí cảnh khi rời phòng bí cảnh */
  hideDungeonHud() {
    stopDungeonHudTimer();
    const hud = $("dungeon-hud");
    if (hud) hud.hidden = true;
    const endModal = $("dungeon-end-modal");
    if (endModal) endModal.hidden = true;
    const confirmBox = $("dhud-leave-confirm");
    if (confirmBox) confirmBox.hidden = true;
  },

  /** Xử lý kết thúc Bí cảnh (thắng / thua hoặc huỷ trước khi vào) */
  onDungeonEnd(msg: DungeonEndMsg) {
    // Người đang ở Hoàng Tuyền (chết) bỏ qua màn kết quả vì đang ở màn hình đầu thai
    if (this.isLimboOpen()) return;

    if (!shouldOpenEndModal(msg.reason)) {
      stopDungeonInviteTimer();
      currentDungeonInvite = null;
      const invBox = $("dungeon-invite-box");
      if (invBox) invBox.hidden = true;
      this.toast({ text: dungeonEndReasonText(msg.reason), tone: "bad" });
      return;
    }

    const isWon = msg.result === "won";
    const sealEl = $("dend-seal");
    if (sealEl) {
      sealEl.textContent = isWon ? "勝" : "敗";
      sealEl.className = `dend-seal ${isWon ? "won" : "lost"}`;
    }

    const titleEl = $("dend-title");
    if (titleEl) {
      titleEl.textContent = isWon ? "BÍ CẢNH ĐẠI THẮNG" : "KHIÊU CHIẾN THẤT BẠI";
    }

    const reasonEl = $("dend-reason");
    if (reasonEl) {
      reasonEl.textContent = dungeonEndReasonText(msg.reason);
    }

    const rewardSection = $("dend-reward-section");
    const noRewardEl = $("dend-no-reward");

    if (isWon && msg.reward) {
      if (rewardSection) rewardSection.hidden = false;
      if (noRewardEl) noRewardEl.hidden = true;

      const coinEl = $("dend-reward-coin");
      if (coinEl) {
        coinEl.textContent = `+${msg.reward.coin} ${CURRENCY_NAME} 💎`;
      }

      const itemsEl = $("dend-reward-items");
      if (itemsEl) {
        itemsEl.replaceChildren();
        const items = formatDungeonRewardItems(msg.reward.items);
        for (const it of items) {
          const row = document.createElement("div");
          row.className = "dend-reward-item";
          const nameSpan = document.createElement("span");
          nameSpan.textContent = it.name;
          const qtyB = document.createElement("b");
          qtyB.className = "dend-reward-qty";
          qtyB.textContent = `x${it.qty}`;
          row.append(nameSpan, qtyB);
          itemsEl.append(row);
        }
      }
    } else {
      if (rewardSection) rewardSection.hidden = true;
      if (noRewardEl) {
        noRewardEl.hidden = false;
        noRewardEl.textContent = isWon
          ? dungeonNoRewardText(msg.noReward)
          : "Khiêu chiến thất bại nên không nhận được phần thưởng hoàn thành.";
      }
    }

    const leftEl = $("dend-rewards-left");
    if (leftEl) {
      leftEl.textContent = `Lượt nhận thưởng hoàn thành còn lại hôm nay: ${msg.rewardsLeft}/${DUNGEON_DAILY_REWARDS}`;
    }

    const closeBtn = $("dend-btn-close");
    if (closeBtn) {
      closeBtn.textContent = isWon ? "Thu Chiến Lợi Phẩm (60s)" : "Đóng";
    }

    const modal = $("dungeon-end-modal");
    if (modal) modal.hidden = false;
  },

  /** Người chơi gục trong bí cảnh (M3.4 luật mới, #235): lưu trạng thái để hiện toast sau khi ra Lạc Hà */
  onDungeonFallen(msg: DungeonFallenMsg) {
    lastDungeonFallen = msg;
    dungeonFallenPendingToast = true;
  },

  getDungeonRewardsLeft(): number | undefined {
    return lastDungeonFallen?.rewardsLeft;
  },

  takeDungeonFallenPending(): boolean {
    const pending = dungeonFallenPendingToast;
    dungeonFallenPendingToast = false;
    return pending;
  },

  /** Nhận lời mời thách đấu PK (M3.5, #218) */
  onDuelInvited(msg: DuelInvitedMsg) {
    this.closeDuelEndModal();
    stopDuelInviteTimer();
    currentDuelInvite = msg;

    const titleEl = $("duib-title");
    if (titleEl) titleEl.textContent = "Quyết Đấu Luận Võ";

    const msgEl = $("duib-msg");
    if (msgEl) msgEl.textContent = `${msg.from} muốn luận bàn võ nghệ cùng đạo hữu!`;

    const totalMs = Math.max(1000, Number.isFinite(msg.ttlMs) ? msg.ttlMs : 20_000);
    const deadline = Date.now() + totalMs;

    const countdownEl = $("duib-countdown");
    if (countdownEl) countdownEl.textContent = formatDuelInviteCountdown(totalMs);

    const barEl = $("duib-timer-bar");
    if (barEl) barEl.style.width = "100%";

    const box = $("duel-invite-box");
    if (box) box.hidden = false;
    sound.typeBlip?.();

    duelInviteInterval = window.setInterval(() => {
      const rem = deadline - Date.now();
      if (rem <= 0) {
        stopDuelInviteTimer();
        currentDuelInvite = null;
        if (box) box.hidden = true;
        return;
      }
      if (countdownEl) countdownEl.textContent = formatDuelInviteCountdown(rem);
      if (barEl) barEl.style.width = `${Math.max(0, Math.min(100, (rem / totalMs) * 100))}%`;
    }, 200);
  },

  /** Cập nhật trạng thái trận đấu PK: đếm ngược 3-2-1 hoặc HUD chiến đấu */
  onDuelState(msg: DuelStateMsg) {
    this.closeDuelEndModal();
    stopDuelInviteTimer();
    currentDuelInvite = null;
    const invBox = $("duel-invite-box");
    if (invBox) invBox.hidden = true;

    currentDuelOpponent = msg.opponent;

    if (msg.phase === "countdown") {
      this.hideDuelHud();
      currentDuelOpponent = msg.opponent;
      const overlay = $("duel-countdown-overlay");
      const numEl = $("dco-number");
      const vsEl = $("dco-vs");
      if (vsEl) vsEl.textContent = `VS ${msg.opponent}`;
      if (overlay && numEl) {
        overlay.hidden = false;
        stopDuelCountdownTimer();
        const safeStartsIn = Math.max(0, msg.startsInMs);
        const updateNum = (remMs: number) => {
          const sec = Math.max(1, Math.ceil(remMs / 1000));
          numEl.textContent = String(sec);
        };
        updateNum(safeStartsIn);
        const startDeadline = Date.now() + safeStartsIn;
        duelCountdownInterval = window.setInterval(() => {
          const rem = startDeadline - Date.now();
          if (rem <= 0) {
            stopDuelCountdownTimer();
            overlay.hidden = true;
            return;
          }
          updateNum(rem);
        }, 150);
      }
      return;
    }

    // Phase "fight"
    stopDuelCountdownTimer();
    const overlay = $("duel-countdown-overlay");
    if (overlay) overlay.hidden = true;

    document.body.classList.add("in-duel");
    const hud = $("duel-hud");
    if (hud) hud.hidden = false;

    const oppEl = $("duel-hud-opponent");
    if (oppEl) oppEl.textContent = msg.opponent;

    const safeEndsIn = Math.max(0, msg.endsInMs);
    duelDeadlineAt = Date.now() + safeEndsIn;
    const timerEl = $("duel-hud-timer");
    if (timerEl) timerEl.textContent = formatDuelCountdown(safeEndsIn);

    stopDuelHudTimer();
    duelHudInterval = window.setInterval(() => {
      const rem = duelDeadlineAt - Date.now();
      if (timerEl) timerEl.textContent = formatDuelCountdown(rem);
      if (rem <= 0) stopDuelHudTimer();
    }, 250);
  },

  /** Cập nhật thanh máu và số lượng máu của đối thủ trong HUD quyết đấu */
  updateDuelOpponentHp(hp: number, maxHp: number) {
    const safeMax = Math.max(1, maxHp);
    const safeHp = Math.max(0, Math.min(safeMax, hp));
    const pct = Math.round((safeHp / safeMax) * 100);
    const fill = $("duel-hud-hp-fill");
    if (fill) fill.style.width = `${pct}%`;
    const text = $("duel-hud-hp-text");
    if (text) text.textContent = `${safeHp} / ${safeMax} (${pct}%)`;
  },

  /** Ẩn HUD và dừng mọi timer quyết đấu */
  hideDuelHud() {
    stopDuelInviteTimer();
    stopDuelHudTimer();
    stopDuelCountdownTimer();
    currentDuelInvite = null;
    currentDuelOpponent = "";
    document.body.classList.remove("in-duel");

    const hud = $("duel-hud");
    if (hud) hud.hidden = true;
    const overlay = $("duel-countdown-overlay");
    if (overlay) overlay.hidden = true;
    const confirmBox = $("duel-yield-confirm");
    if (confirmBox) confirmBox.hidden = true;
    const yieldBtn = $("duel-btn-yield");
    if (yieldBtn) yieldBtn.hidden = false;
    const invBox = $("duel-invite-box");
    if (invBox) invBox.hidden = true;
  },

  /** Xử lý kết thúc trận quyết đấu (màn kết quả, không mất kiếp) */
  onDuelEnd(msg: DuelEndMsg) {
    const oppName = currentDuelOpponent;
    this.hideDuelHud();

    // Không mở nếu đang ở Hoàng Tuyền (chết do quái trước đó)
    if (this.isLimboOpen()) return;

    const modal = $("duel-end-modal");
    if (!modal) return;

    const sealEl = $("duend-seal");
    if (sealEl) {
      sealEl.className = `duend-seal ${msg.result}`;
      sealEl.textContent = "⚔";
    }

    const titleEl = $("duend-title");
    if (titleEl) {
      titleEl.textContent = duelResultTitle(msg.result);
    }

    const reasonEl = $("duend-reason");
    if (reasonEl) {
      reasonEl.textContent = duelEndReasonText(msg.reason, msg.result, oppName || "Đối thủ");
    }

    modal.hidden = false;
    if (msg.result === "won") {
      sound.questDone?.();
    } else if (msg.result === "lost") {
      sound.hit?.();
    }
  },

  isDuelActive(): boolean {
    const hud = $("duel-hud");
    return Boolean(hud && !hud.hidden);
  },

  getDuelOpponent(): string {
    return currentDuelOpponent;
  },

  // ---------- Tông môn (M3.6, #230) ----------
  toggleSectModal(force?: boolean) {
    const target = force ?? !sectModalOpen;
    if (target === sectModalOpen) return;
    sectModalOpen = target;
    if (sectModalOpen) {
      this.closeAllModals();
      sectModalOpen = true;
      renderSectModal();
    } else {
      closeSectConfirm();
      $("sect-modal").hidden = true;
      $("btn-sect")?.classList.remove("active");
    }
  },

  isSectModalOpen(): boolean {
    return sectModalOpen;
  },

  /** Đóng hộp xác nhận tông môn nếu đang mở (Esc đóng hộp trước, rồi mới tới bảng) */
  closeSectConfirm(): boolean {
    const box = document.getElementById("sect-action-confirm");
    if (!box || box.hidden) return false;
    closeSectConfirm();
    return true;
  },

  switchSectTab(tab: "overview" | "members" | "treasury") {
    sectTab = tab;
    renderSectModal();
  },

  onSect(m: SectMsg) {
    currentSect = m.sect;
    // Không còn tông môn (bị trục xuất / giải tán): hộp xác nhận cũ không còn ý nghĩa
    if (!m.sect) closeSectConfirm();
    if (sectModalOpen) {
      renderSectModal();
    }
  },

  onSectPresence(m: SectPresenceMsg) {
    currentSectPresence = m;
    if (sectModalOpen && sectTab === "members") {
      renderSectMembersTab();
    }
  },

  onSectInvited(m: SectInvitedMsg) {
    stopSectInviteTimer();
    currentSectInvite = m;
    const box = $("sect-invite-box");
    box.hidden = false;
    sound.typeBlip?.();

    $("sib-title").textContent = m.sect;
    const tagEl = $("sib-tag");
    if (tagEl) tagEl.textContent = `[${m.tag}]`;
    const msgEl = $("sib-msg");
    msgEl.replaceChildren();
    const b = document.createElement("b");
    b.textContent = m.from;
    msgEl.append(
      b,
      document.createTextNode(" mời bạn gia nhập tông môn "),
      document.createTextNode(m.sect),
    );

    const startTime = Date.now();
    const ttl = m.ttlMs || 30000;
    const bar = $("sib-timer-bar");

    const update = () => {
      const elapsed = Date.now() - startTime;
      const rem = Math.max(0, ttl - elapsed);
      $("sib-countdown").textContent = formatSectInviteCountdown(rem);
      if (bar) bar.style.width = `${(rem / ttl) * 100}%`;
      if (rem <= 0) {
        stopSectInviteTimer();
        currentSectInvite = null;
        box.hidden = true;
      }
    };
    update();
    sectInviteInterval = window.setInterval(update, 200);
  },

  closeSectInviteBox() {
    stopSectInviteTimer();
    currentSectInvite = null;
    $("sect-invite-box").hidden = true;
  },

  getCurrentSect(): SectView | null {
    return currentSect;
  },
};
