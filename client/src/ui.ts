// Lớp giao diện DOM (HUD, chat, kỹ năng, túi đồ, nhiệm vụ, hộp thoại NPC, minimap, âm thanh).
// Tuyệt đối không dùng innerHTML để phòng chống XSS theo chuẩn bảo mật SecureCoder.
import {
  NO_STATS_TEXT,
  deltaText,
  describeEquipStats,
  equipDiffers,
  equipmentOf,
  pctRows,
  slotLockText,
  slotViews,
  statDeltas,
  swapInfo,
  type FullEquip,
} from "./equip-panel";
import { typedLength } from "./dialog-typewriter";
import { lockIconSvg } from "./skill-icon";
import {
  INVENTORY_SLOTS,
  ITEM_BY_ID,
  EQUIP_SLOT_NAMES,
  equipBonus,
  RECIPES,
  questDefAny,
  NPC_BY_ID,
  emptyInventory,
  countItem,
  statsFor,
  canEquip,
  realmLabel,
  canAttemptBreakthrough,
  expToNext,
  type ChatOut,
  type ToastMsg,
  type InvMsg,
  type Inventory,
  type ItemDef,
  type Equipment,
  type EquipSlot,
  type QuestsMsg,
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
  type WalletMsg,
  UNLOCKS,
  ORIGINS,
  DEFAULT_ORIGIN,
  ORIGIN_BUY_PREFIX,
  levelOf,
  type SkillSlot,
  keepSlotsOf,
  engraveSlotsOf,
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
  type SectVaultMsg,
  type SectHallMsg,
  type SectVaultView,
  type SectVaultDepositMsg,
  type SectVaultWithdrawMsg,
  SECT_VAULT_SLOTS,
  canSect,
  SECT_CREATE_COST,
  cleanSectName,
  cleanSectTag,
  cleanMotd,
  BOARD_IDS,
  BOARD_LABELS,
  type BoardId,
  WORLD_BOSS_SCHEDULE,
  type WorldBossMsg,
  type AchievementsMsg,
  AMBUSH_OFFER_MS,
  type AmbushChooseMsg,
  type AmbushFleeMsg,
  type AmbushSeenMsg,
} from "@tien-gioi/shared";
import {
  arenaHudView,
  fleeArena,
  parseAmbushState,
  setFleeConfirm,
  updateArenaHud,
  type ArenaHud,
} from "./arena-hud-view";
import {
  ambushDialogView,
  ambushEndToast,
  ambushEndView,
  ambushChoiceForKey,
  ambushMarkSeen,
  ambushNeedsSeen,
  ambushRemainingMs,
  chooseAmbush,
  openAmbush,
  parseAmbushEnd,
  parseAmbushOffer,
  type AmbushDialog,
} from "./ambush-view";
import { REFRESH_NOTE, asBoardId, boardView, sanitizeBoardsMsg } from "./board-view";
import { chatSpeaker } from "./chat-view";
import {
  AskGate,
  achievementsView,
  sanitizeAchievementNewMsg,
  sanitizeAchievementsMsg,
  titleUnlockToast,
} from "./achievement-view";
import {
  SCHEDULE_TZ_NOTE,
  WB_OVERDUE_MS,
  bannerShown,
  sanitizeWorldBossMsg,
  scheduleRows,
  worldBossView,
} from "./world-boss-view";
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
  mapLabelOf,
  sectMemberMeritText,
  sectMemberStatusText,
  sectEldersCap,
  sectMembersCap,
  sectFullText,
  sectConfirmText,
  type SectConfirmKind,
} from "./sect";
import {
  clampQty,
  depositBlock,
  drawPerDayOptions,
  drawSummary,
  maxDepositQty,
  maxWithdrawQty,
  planDeposit,
  planStillValid,
  planWithdraw,
  sanitizeVaultView,
  vaultBlockText,
  vaultLogLine,
  withdrawBlock,
  type VaultPlan,
  vaultLockedNote,
} from "./sect-vault";
import {
  depositPreviewText,
  hallLeaveWarning,
  hallRefreshDelayMs,
  hallShopRows,
  sanitizeHallView,
  shopBuyPreviewText,
} from "./sect-hall";
import { renderHall, updateHallCountdown, type HallUiState } from "./sect-hall-ui";
import { canAffordFee, feeChipText, recipeFee } from "./forge-fee";
import { perfRttText } from "./net-latency";
import { questCardSubtitle, doneRows, doneSummary, questKind, rewardParts } from "./quest-log";
import { pickupBtnText, portalBtnText, talkBtnText } from "./ctx-btn";
import { sound } from "./audio";
import {
  bookTeach,
  isQuickCandidate,
  statusEffectLine,
  useBlockReason,
  useLabelOf,
} from "./item-use";
import {
  applyRarityBadge,
  applyRarityText,
  clearRarityBadge,
  clearRarityText,
  itemAria,
  rarityStyle,
} from "./rarity";
import { quickLabel } from "./quick-label";
import { initKeyLabels } from "./keybinds-dom";
import {
  DEFAULT_SOCIAL_TAB,
  SOCIAL_TABS,
  asSocialTab,
  socialEnabled,
  socialTabByKey,
  tabByKey,
  type SocialTabId,
} from "./social-tabs";
import {
  ACTION_BY_ID,
  FIXED_KEYS,
  getKeymap,
  onKeymapChange,
  primaryKeyLabel,
  rebind,
  resetKeymap,
  type ActionId,
} from "./keybinds";
import { captureOutcome, keysScreenModel } from "./keys-screen";
import { elementColor } from "./skill-bar";
import { readableOn } from "./contrast";
import {
  clampEngrave,
  effectiveEngrave,
  engraveEmptyText,
  engraveHint,
  engraveItem,
  engraveToSend,
  toggleEngrave,
  ENGRAVE_CHECKED_BG,
} from "./engrave";
import { LEAVE_BUTTONS, pickPromptButton, pickVisible, type PromptAnswer } from "./prompts";
import { dirOfArrowKey, moveFocus, ownsArrowKeys, withFocusKept } from "./panel-nav";
import { skillIconSvg } from "./skill-icon";
import {
  DEFAULT_SKILL_FILTER,
  cleanSkillFilter,
  elementCounts,
  filterSkills,
  skillFilterActive,
  skillFilterSummary,
  sortSkills,
  type SkillFilter,
  type SkillSort,
} from "./skill-filter";
import {
  nextOpenSkill,
  resolveOpenSkill,
  type SkillRow,
  type SkillsPanelModel,
} from "./skills-panel";
import type { MasteryView } from "./skill-mastery";
import { transitionMs, waitOrSkip } from "./gfx/scene-transition";
import { getDisplay, onDisplayChange } from "./gfx/display";
import { optionTag, skipHintText } from "./dialog-opt";
import {
  dropConfirmText,
  dropStillValid,
  dropWarnText,
  planDrop,
  withDropQty,
  type DropPlan,
} from "./inv-drop";
import {
  inConfirmGuard,
  rebirthPlan,
  sectCreatePlan,
  sectCreateStillValid,
  sectDepositPlan,
  sectDepositStillValid,
  sellPlan,
  sellStillValid,
  unlockPlan,
  unlockStillValid,
  type ConfirmSpec,
} from "./act-confirm";
import { PREFER_TARGET_STORAGE_KEY, parsePreferTarget } from "./aim-order";
import {
  AIM_MODE_LABEL,
  AIM_MODE_STORAGE_KEY,
  DEFAULT_AIM_MODE,
  parseAimMode,
  type AimMode,
} from "./auto-target";
import { craftButtonText, craftFeeHint, craftSubtitle, craftTitle } from "./craft-ui";
import {
  CHAT_PREF_KEY,
  MAP_LEGEND_PREF_KEY,
  MINIMAP_PREF_KEY,
  PARTY_PREF_KEY,
  TRACKER_PREF_KEY,
  minimapOpen,
  panelOpen,
  parseTrackerPref,
} from "./gfx/hud-compact";
import {
  getQuality,
  onQualityChange,
  refreshQuality,
  setBatterySaver,
  qualityUltraAvailable,
  setQualityMode,
  type QualityMode,
} from "./gfx/quality";
import {
  modalStack,
  focusModal,
  returnFocus,
  trapTabKey,
  isTypingElement,
  processEscapeKey,
  isReducedMotion,
  setReducedMotionPref,
  syncReducedMotionDom,
  shouldShowNewbieGuide,
  markNewbieGuideDismissed,
} from "./a11y";
import { $, buttonShown, fmt, hexColor, onPress, readPref, writePref } from "./ui-util";
import { applyMapCard, mapCardUrl } from "./map-card";
import { NpcPortraitSlot } from "./npc-portrait";
import { describeStep, renderQuestTrackerView } from "./ui-quest-tracker";
import { createQtyStepper, type QtyStepper } from "./qty-stepper";
import { buyQtyMax, sellQtyMax } from "./shop-qty";

// `fmt` từng được xuất từ đây (test `sect.test.ts` nhập động): giữ tên xuất cũ sau khi chuyển sang `ui-util.ts`.
export { fmt };

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
  /** Ba ô riêng (M7.4): chỉ chủ nhận; vắng / "" = trống */
  boots?: string;
  jade?: string;
  treasure?: string;
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
  /** Esc khi không còn gì để đóng: bỏ chọn mục tiêu; trả true nếu đã bỏ (#463) */
  onClearTarget?: () => boolean;
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
  onSectVaultDeposit?: (msg: SectVaultDepositMsg) => void;
  onSectVaultWithdraw?: (msg: SectVaultWithdrawMsg) => void;
  onSectVaultPolicy?: (drawPerDay: number) => void;
  /** Tab Nội vụ (M8.6): xin ảnh chụp mới (lúc mở tab, khi qua mốc đặt lại trong ngày), nhận / trả nhiệm vụ tông, mua ở cửa hàng tông */
  onSectHallGet?: () => void;
  /** Bảng Xã hội (M9.6): xin một bảng xếp hạng (máy chủ trả tin `boards`) */
  onBoardsGet?: (board: BoardId) => void;
  /** Bảng Xã hội, tab Sự kiện (M9.7): xin sự kiện trùm thế giới đang diễn ra / sắp tới (máy chủ trả tin `worldBoss`) */
  onWorldBossGet?: () => void;
  /**
   * Gặp chặn đường (mục 52, CD7): gửi `ambushSeen` (hộp thoại đã hiện, trang đang hiển thị) / `ambushChoose` (Chiến hoặc bỏ chạy). Trả `true` khi tin THẬT SỰ đã gửi
   * (đang nối lại thì `false`: giao diện chưa coi là đã gửi, sẽ gửi lại khi nối lại xong).
   */
  onAmbushSeen?: (msg: AmbushSeenMsg) => boolean;
  onAmbushChoose?: (msg: AmbushChooseMsg) => boolean;
  /** Bỏ chạy giữa trận ở đấu trường (`ambushFlee { choice }`, CD7 bước 3); `true` CHỈ khi tin thật sự đã gửi. */
  onAmbushFlee?: (msg: AmbushFleeMsg) => boolean;
  /** Bảng Xã hội, tab Thành tựu (M9.8): xin sổ thành tựu (máy chủ trả tin `achievements`) / đeo hoặc gỡ danh hiệu (`null` = gỡ; máy chủ LUÔN trả lại `achievements`) */
  onAchievementsGet?: () => void;
  onTitleSet?: (id: string | null) => void;
  onSectQuestAccept?: (questId: string) => void;
  onSectQuestTurnIn?: (questId: string) => void;
  onSectShopBuy?: (itemId: string, qty?: number) => void;
  /** Đã gục / ở Hoàng Tuyền (khoá nhận / trả / mua ở tab Nội vụ; máy chủ vẫn kiểm lại) */
  isSectDown?: () => boolean;
  /** Bảng Công pháp: gắn chiêu vào ô 2-5 (`skillId` "" = gỡ); máy chủ trả `skills` (sổ đúng) */
  onSkillSlot?: (slot: SkillSlot, skillId: string) => void;
  /** Bảng Công pháp vừa mở: cảnh dựng mô hình mới từ sổ chiêu hiện tại (`ui.setSkillsModel`) */
  onSkillsOpen?: () => void;
}

// ---------- Trạng thái Client ----------
const HIDE_NAMES_KEY = "tg_hide_names";

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
let skillsModalOpen = false;
let skillsModel: SkillsPanelModel | null = null;
let mapModalOpen = false;
let settingsModalOpen = false;
let hideOtherNames = false;
/** "Ưu tiên mục tiêu hơn chuột" (mục 29, mặc định TẮT: con trỏ chuột hợp lệ thắng mục tiêu). */
let preferTargetOverMouse = false;
/** "Chế độ nhắm" (mục 26, mặc định Tự động — gần nhất, kể cả người chơi cũ chưa từng đổi; lưu theo thiết bị). */
let aimModeSetting: AimMode = DEFAULT_AIM_MODE;
/** Bản đồ nhỏ đang hiện (false = thu gọn thành nhãn tên khu, vẫn bấm được để mở bản đồ lớn). */
let minimapVisible = true;
let questTab: "active" | "done" = "active";
let trackingQuestId: string | null = null;
let currentName = "";
let currentRealm = 0;
let currentTier = 0;
let currentEquip: FullEquip = equipmentOf(null);
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
let isDungeonFallen = false;
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
let sectTab: "overview" | "members" | "treasury" | "vault" | "hall" = "overview";
// Bảng Xã hội (M9, #1025): khung ba tab; chỉ mở được khi cờ `?social=1` bật (`socialEnabled`)
let socialModalOpen = false;
let socialTab: SocialTabId = DEFAULT_SOCIAL_TAB;

/** Đồng bộ thanh tab + thân tab Xã hội theo `socialTab` (aria-selected, tabindex lăn, ẩn / hiện thân). */
function renderSocialTabs() {
  for (const t of SOCIAL_TABS) {
    const on = t.id === socialTab;
    const btn = $(`social-tab-btn-${t.id}`);
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
    btn.tabIndex = on ? 0 : -1;
    $(`social-tab-${t.id}`).hidden = !on;
  }
}
// Tab Xếp hạng (M9.6, #1025): bốn bảng, mỗi bảng giữ bản MỚI NHẤT đã làm sạch + đồng hồ máy khách lúc nhận (chỉ để đo khoảng trôi của "tuổi bản chụp")
let socialBoard: BoardId = BOARD_IDS[0];
const socialBoards = new Map<
  BoardId,
  { msg: NonNullable<ReturnType<typeof sanitizeBoardsMsg>>; at: number }
>();
/** Bộ điều tiết xin của TỪNG bảng (`AskGate`, dùng chung với thành tựu và trùm thế giới): không xin lại trong 20 giây khi đã có bản; quá 6 giây chưa thấy trả lời thì hiện nút "Tải lại". */
const socialBoardGates = new Map<BoardId, AskGate>();
const boardGate = (board: BoardId): AskGate => {
  let g = socialBoardGates.get(board);
  if (!g) socialBoardGates.set(board, (g = new AskGate()));
  return g;
};
let socialBoardTimer: ReturnType<typeof setTimeout> | null = null;

function clearSocialBoardTimer() {
  if (socialBoardTimer !== null) {
    clearTimeout(socialBoardTimer);
    socialBoardTimer = null;
  }
}

/** Xin bảng `board` từ máy chủ (bỏ qua nếu vừa xin chưa lâu và đã có bản; `force` = bấm "Tải lại"). Có hẹn giờ để hiện nút thử lại nếu máy chủ im. */
function requestSocialBoard(board: BoardId, force = false) {
  const gate = boardGate(board);
  if (!gate.tryAsk(performance.now(), socialBoards.has(board), force)) return;
  callbacks?.onBoardsGet?.(board);
  clearSocialBoardTimer();
  if (!socialBoards.has(board)) {
    socialBoardTimer = setTimeout(() => {
      socialBoardTimer = null;
      if (socialModalOpen && socialTab === "rank") renderSocialRank();
    }, gate.waitMsValue + 50);
  }
}

/** Vẽ tab Xếp hạng: thanh tab phụ, câu "Hạng của bạn", bảng (đạo hiệu / danh hiệu / cột theo `BOARD_COLUMNS`), tuổi bản chụp, trạng thái tải / trống. Đổ chữ bằng `textContent`. */
function renderSocialRank() {
  for (const id of BOARD_IDS) {
    const on = id === socialBoard;
    const btn = $(`social-board-btn-${id}`);
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
    btn.tabIndex = on ? 0 : -1;
  }
  $("social-board-panel").setAttribute("aria-labelledby", `social-board-btn-${socialBoard}`);
  const entry = socialBoards.get(socialBoard);
  const status = $("social-board-status");
  const wrap = $("social-board-wrap");
  const retry = $("social-board-retry");
  const mine = $("social-board-mine");
  const age = $("social-board-age");
  if (!entry) {
    const stale = boardGate(socialBoard).stale(performance.now(), false);
    status.hidden = false;
    status.textContent = stale
      ? "Chưa nhận được bảng. Thử tải lại nhé."
      : `Đang tải bảng ${BOARD_LABELS[socialBoard]}…`;
    wrap.hidden = true;
    retry.hidden = !stale;
    mine.textContent = "";
    age.textContent = "";
    return;
  }
  const v = boardView(entry.msg, performance.now() - entry.at, currentSect === null);
  retry.hidden = true;
  mine.textContent = v.mineText;
  const ageLine = v.ageText ? v.ageText.charAt(0).toUpperCase() + v.ageText.slice(1) + ". " : "";
  age.textContent = v.empty ? "" : `${ageLine}${REFRESH_NOTE}`;
  status.hidden = !v.empty;
  status.textContent = v.empty ? "Chưa có ai trên bảng này." : "";
  wrap.hidden = v.empty;
  const head = $("social-board-head");
  head.textContent = "";
  const th = (t: string, cls: string) => {
    const e = document.createElement("th");
    e.scope = "col";
    e.textContent = t;
    e.className = cls;
    head.appendChild(e);
  };
  th("Hạng", "c-rank");
  th(v.board === "tongmon" ? "Tông môn" : "Đạo hiệu", "c-name");
  for (const c of v.columns) th(c, "c-num");
  $("social-board-caption").textContent = `${v.label}: ${v.rows.length} dòng đầu bảng`;
  const body = $("social-board-body");
  body.textContent = "";
  const addRow = (r: (typeof v.rows)[number], extra = "") => {
    const tr = document.createElement("tr");
    tr.className = `${r.mine ? "mine" : ""} ${extra}`.trim();
    const rank = document.createElement("td");
    rank.className = "c-rank";
    rank.textContent = String(r.rank);
    const name = document.createElement("td");
    name.className = "c-name";
    const n = document.createElement("span");
    n.className = "n";
    n.textContent = r.name;
    name.appendChild(n);
    if (r.title) {
      const t = document.createElement("span");
      t.className = "t";
      t.textContent = r.title;
      name.appendChild(t);
    }
    if (r.test) {
      const t = document.createElement("span");
      t.className = "test";
      t.textContent = "thử nghiệm";
      name.appendChild(t);
    }
    tr.append(rank, name);
    for (const c of r.cells) {
      const td = document.createElement("td");
      // ô SỐ ("40.000", "—") không xuống dòng; ô CHỮ nhiều từ (tên cảnh giới) xuống dòng ở khoảng trắng
      td.className = /\s/.test(c) ? "c-num" : "c-num nw";
      td.textContent = c;
      tr.appendChild(td);
    }
    body.appendChild(tr);
  };
  for (const r of v.rows) addRow(r);
  if (v.mineRow) {
    const gap = document.createElement("tr");
    gap.className = "gap";
    const td = document.createElement("td");
    td.colSpan = 2 + v.columns.length;
    td.textContent = "…";
    td.setAttribute("aria-hidden", "true");
    gap.appendChild(td);
    body.appendChild(gap);
    addRow(v.mineRow, "outside");
  }
}

// ---- Gặp chặn đường (mục 52, CD7 #1067): hộp thoại Chiến / Bỏ chạy, vẽ từ `ambush-view.ts` (thuần) ----
/** Hộp thoại đang mở (null = không có). Đồng hồ cục bộ chỉ để đo KHOẢNG TRÔI; máy chủ mới quyết (hết giờ = Chiến). */
let ambushDlg: AmbushDialog | null = null;
let ambushTimer: ReturnType<typeof setInterval> | null = null;
const AMBUSH_TICK_MS = 250;
const AMBUSH_BTN_ID: Readonly<Record<string, string>> = {
  fight: "ambush-fight",
  flee_coin: "ambush-flee-coin",
  flee_exp: "ambush-flee-exp",
};

function setTextIfChanged(el: Element | null, text: string): void {
  if (el && el.textContent !== text) el.textContent = text;
}

/** Vẽ lại hộp thoại theo đồng hồ hiện tại và gửi `ambushSeen` nếu đến lúc. Gọi mỗi `AMBUSH_TICK_MS`, khi nhận tin, khi trang hiện lại. */
function renderAmbush(): void {
  const d = ambushDlg;
  if (!d) return;
  const now = performance.now();
  const v = ambushDialogView(d, now);
  const reconnecting = document.body.classList.contains("reconnecting");
  setTextIfChanged(document.getElementById("ambush-foe"), v.foe);
  setTextIfChanged(document.getElementById("ambush-scene"), v.scene);
  // đang nối lại: máy chủ ĐÓNG BĂNG đồng hồ, nên không đếm tiếp trên màn hình
  setTextIfChanged(
    document.getElementById("ambush-countdown"),
    reconnecting ? "Tạm dừng" : v.waitingServer ? "Chờ…" : v.countdown,
  );
  const fill = document.getElementById("ambush-bar-fill");
  if (fill) {
    const pct = Math.round((ambushRemainingMs(d, now) / AMBUSH_OFFER_MS) * 100);
    const w = `${Math.min(100, Math.max(0, pct))}%`;
    if (fill.style.width !== w) fill.style.width = w;
  }
  for (const b of v.buttons) {
    const el = document.getElementById(AMBUSH_BTN_ID[b.choice]);
    if (!el) continue;
    setTextIfChanged(el.querySelector(".ab-label"), b.label);
    // gợi ý phím chỉ có nghĩa khi có chuột / bàn phím (điện thoại cảm ứng không có Enter)
    const keyHint = b.choice === "fight" && window.matchMedia("(pointer: fine)").matches;
    setTextIfChanged(el.querySelector(".ab-sub"), keyHint ? `${b.sub} · Enter` : b.sub);
    el.setAttribute("aria-disabled", String(!b.enabled || reconnecting));
    el.setAttribute("aria-label", b.aria);
  }
  setTextIfChanged(
    document.getElementById("ambush-note"),
    reconnecting ? "Đang nối lại… đồng hồ tạm dừng." : v.note,
  );
  if (!reconnecting && ambushNeedsSeen(d, document.visibilityState === "visible")) {
    // chỉ coi là ĐÃ GỬI khi tin thật sự đi (callback trả true); không thì lần vẽ sau thử lại
    if (callbacks?.onAmbushSeen?.({ id: d.offer.id }) === true) ambushDlg = ambushMarkSeen(d);
  }
}

/** Người chơi chọn (bấm nút / Enter / Y): `ambush-view.ts` quyết có gửi không (khoá 700 ms, đang chờ, nút mờ). */
function pickAmbush(choice: unknown): void {
  const d = ambushDlg;
  if (!d || document.body.classList.contains("reconnecting")) return;
  const r = chooseAmbush(d, choice, performance.now());
  if (r.send !== null && callbacks?.onAmbushChoose?.(r.send) === true) ambushDlg = r.dialog;
  renderAmbush();
}

function hideAmbushImpl(): void {
  hideArenaImpl();
  hideArenaResult();
  if (ambushTimer !== null) {
    clearInterval(ambushTimer);
    ambushTimer = null;
  }
  ambushDlg = null;
  const el = document.getElementById("ambush-modal");
  if (el) el.hidden = true;
  document.body.classList.remove("in-ambush");
  if (modalStack.remove("ambush-modal")) returnFocus(null);
}

/** Gắn sự kiện một lần lúc khởi tạo: bấm ba nút, phím Enter / Y = Chiến, trang hiện lại thì gửi `ambushSeen` đang nợ. */
function bindAmbushDom(): void {
  for (const id of Object.values(AMBUSH_BTN_ID)) {
    const el = document.getElementById(id);
    el?.addEventListener("click", () => pickAmbush(el.dataset.choice));
  }
  // pha BẮT: chạy trước bộ phím của thế giới. Enter trên NÚT đang có focus để nút đó nhận (click gốc); Enter / Y khi focus ở khung = Chiến. KHÔNG phím chữ nào chọn bỏ chạy.
  window.addEventListener(
    "keydown",
    (e) => {
      if (!ambushDlg || e.defaultPrevented || e.repeat || e.ctrlKey || e.altKey || e.metaKey)
        return;
      const choice = ambushChoiceForKey(e.code);
      if (choice === null) return;
      const active = document.activeElement;
      if (
        e.code !== "KeyY" &&
        active instanceof HTMLButtonElement &&
        active.closest("#ambush-modal")
      )
        return;
      e.preventDefault();
      pickAmbush(choice);
    },
    true,
  );
  document.addEventListener("visibilitychange", () => {
    if (ambushDlg) renderAmbush();
  });
}

// ---- Đấu trường gặp chặn đường (mục 52, CD7 bước 3): HUD + bảng xác nhận bỏ chạy + thẻ kết quả, vẽ từ `arena-hud-view.ts` (thuần) ----
/** HUD đang hiện (null = không ở đấu trường). Mỗi `ambushState` (mỗi giây) làm mới đồng hồ + giá; máy chủ quyết kết cục. */
let arenaHud: ArenaHud | null = null;
let arenaTimer: ReturnType<typeof setInterval> | null = null;
let arenaResultTimer: ReturnType<typeof setTimeout> | null = null;
const ARENA_RESULT_MS = 6_000;
const FLEE_BTN_ID: Readonly<Record<string, string>> = {
  flee_coin: "aflee-coin",
  flee_exp: "aflee-exp",
};

function fleeSheetOpen(): boolean {
  const el = document.getElementById("ambush-flee-modal");
  return Boolean(el && !el.hidden);
}

/** Vẽ lại HUD (và bảng xác nhận nếu đang mở) theo đồng hồ hiện tại. */
function renderArena(): void {
  const h = arenaHud;
  if (!h) return;
  const v = arenaHudView(h, performance.now());
  const reconnecting = document.body.classList.contains("reconnecting");
  const clock = document.getElementById("ahud-clock");
  setTextIfChanged(clock, reconnecting ? "Tạm dừng" : v.waitingServer ? "Chờ…" : v.countdown);
  clock?.classList.toggle("urgent", v.urgent && !reconnecting);
  const flee = document.getElementById("ahud-flee");
  flee?.setAttribute("aria-disabled", String(!v.canOpenFlee || reconnecting));
  flee?.setAttribute("aria-label", `Bỏ chạy giữa trận. ${v.announce}`);
  setTextIfChanged(
    document.getElementById("ahud-note"),
    reconnecting ? "Đang nối lại…" : v.confirming ? "" : v.note,
  );
  if (!fleeSheetOpen()) return;
  setTextIfChanged(document.getElementById("aflee-text"), v.confirmText);
  v.buttons.forEach((b) => {
    const el = document.getElementById(FLEE_BTN_ID[b.choice]);
    if (!el) return;
    setTextIfChanged(el.querySelector(".ab-label"), b.label);
    setTextIfChanged(el.querySelector(".ab-sub"), b.sub);
    el.setAttribute("aria-disabled", String(!b.enabled || reconnecting));
    el.setAttribute("aria-label", b.aria);
  });
  setTextIfChanged(
    document.getElementById("aflee-note"),
    reconnecting ? "Đang nối lại… chưa bỏ chạy được." : v.note,
  );
}

function openFleeSheet(): void {
  const h = arenaHud;
  if (!h || document.body.classList.contains("reconnecting") || fleeSheetOpen()) return;
  arenaHud = setFleeConfirm(h, true, performance.now());
  const el = document.getElementById("ambush-flee-modal");
  if (!el) return;
  el.hidden = false;
  modalStack.push("ambush-flee-modal", document.getElementById("ahud-flee"));
  // focus vào KHUNG, không vào nút giá: đang bấm phím chiến đấu thì không được chọn nhầm cách trả
  el.focus();
  renderArena();
}

/** Đóng bảng xác nhận ("Ở lại đánh" / Esc). Đang chờ phản hồi của lựa chọn đã gửi thì giữ (không rút lại giữa chừng). */
function closeFleeSheet(): void {
  const el = document.getElementById("ambush-flee-modal");
  if (!el || el.hidden) return;
  if (arenaHud) {
    const next = setFleeConfirm(arenaHud, false, performance.now());
    if (next.confirming) return;
    arenaHud = next;
  }
  el.hidden = true;
  if (modalStack.remove("ambush-flee-modal")) returnFocus(document.getElementById("ahud-flee"));
  renderArena();
}

/** Người chơi chọn cách trả ở bảng xác nhận (chỉ nút giá mới gửi; không phím tắt chữ cái). */
function pickFlee(choice: unknown): void {
  const h = arenaHud;
  if (!h || document.body.classList.contains("reconnecting")) return;
  const r = fleeArena(h, choice, performance.now());
  if (r.send !== null && callbacks?.onAmbushFlee?.(r.send) === true) arenaHud = r.hud;
  renderArena();
}

function hideArenaResult(): void {
  if (arenaResultTimer !== null) {
    clearTimeout(arenaResultTimer);
    arenaResultTimer = null;
  }
  const card = document.getElementById("ambush-result");
  if (card) card.hidden = true;
}

/** Thẻ kết quả ở đấu trường (thắng liệt kê thưởng; bỏ chạy / thua / hết giờ nói đúng cái giá). Tự ẩn sau `ARENA_RESULT_MS` hoặc khi đổi phòng. */
function showArenaResult(end: Parameters<typeof ambushEndView>[0]): void {
  const v = ambushEndView(end);
  const card = document.getElementById("ambush-result");
  const title = document.getElementById("ar-title");
  const list = document.getElementById("ar-lines");
  if (!card || !title || !list || v.silent) return;
  card.className = `ambush-result ${v.tone}`;
  title.textContent = v.title;
  list.replaceChildren(
    ...v.lines.map((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      return li;
    }),
  );
  card.hidden = false;
  if (arenaResultTimer !== null) clearTimeout(arenaResultTimer);
  arenaResultTimer = setTimeout(hideArenaResult, ARENA_RESULT_MS);
}

/** Gỡ HUD đấu trường + bảng xác nhận (hết trận / đổi phòng); KHÔNG đụng thẻ kết quả. */
function hideArenaImpl(): void {
  if (arenaTimer !== null) {
    clearInterval(arenaTimer);
    arenaTimer = null;
  }
  arenaHud = null;
  const hud = document.getElementById("ambush-hud");
  if (hud) hud.hidden = true;
  const sheet = document.getElementById("ambush-flee-modal");
  if (sheet) sheet.hidden = true;
  document.body.classList.remove("in-arena");
  modalStack.remove("ambush-flee-modal");
}

/** Gắn sự kiện một lần lúc khởi tạo: nút Bỏ chạy ở HUD (mở xác nhận), hai nút giá, "Ở lại đánh". */
function bindArenaDom(): void {
  const flee = document.getElementById("ahud-flee");
  flee?.addEventListener("click", () => {
    if (flee.getAttribute("aria-disabled") !== "true") openFleeSheet();
  });
  for (const id of Object.values(FLEE_BTN_ID)) {
    const el = document.getElementById(id);
    el?.addEventListener("click", () => pickFlee(el.dataset.choice));
  }
  document.getElementById("aflee-cancel")?.addEventListener("click", closeFleeSheet);
}

// ---- Trùm thế giới (M9.7, #1026): banner + tab Sự kiện, vẽ từ `world-boss-view.ts` ----
/** Tin `worldBoss` MỚI NHẤT (mọi phase) + đồng hồ máy khách lúc nhận (chỉ để đo KHOẢNG TRÔI của đồng hồ đếm ngược, không phải giờ tuyệt đối). */
let wbLast: { msg: WorldBossMsg; at: number } | null = null;
/** Kết quả của sự kiện vừa kết thúc, hiện thay banner một lúc (`WB_RESULT_MS`). */
let wbResult: { text: string; tone: "info" | "good" | "bad" } | null = null;
let wbResultTimer: ReturnType<typeof setTimeout> | null = null;
/** Bộ điều tiết xin sự kiện trùm thế giới (`AskGate`): không xin lại trong 20 giây khi đã có tin; quá 6 giây chưa thấy tin thì hiện nút "Tải lại". */
const wbGate = new AskGate();
let wbTabTimer: ReturnType<typeof setTimeout> | null = null;
let wbTickTimer: ReturnType<typeof setInterval> | null = null;
/** Danh sách đóng góp mở sẵn trên màn rộng; điện thoại / khung thấp thu gọn (bấm "Xem đóng góp" để mở). */
let wbExpanded =
  typeof window !== "undefined" && window.innerWidth >= 900 && window.innerHeight >= 500;
let wbTopKey = "";
let wbScheduleBuilt = false;
const WB_RESULT_MS = 10_000;
/** Tin kết thúc giống hệt đến lại trong chừng này thì không toast lần hai (gửi lại khi vào phòng / nối lại). */
const WB_DUP_MS = 60_000;

function socialFlagOn(): boolean {
  return typeof window !== "undefined" && socialEnabled(window.location.search);
}

function setWbText(id: string, t: string) {
  const e = $(id);
  if (e.textContent !== t) e.textContent = t;
}

/** Xin sự kiện trùm thế giới (bỏ qua nếu vừa xin chưa lâu và đã có tin; `force` = bấm "Tải lại" / tin đã quá hạn). */
function requestWorldBoss(force = false) {
  if (!wbGate.tryAsk(performance.now(), wbLast !== null, force)) return;
  callbacks?.onWorldBossGet?.();
  if (wbTabTimer !== null) clearTimeout(wbTabTimer);
  wbTabTimer = null;
  if (!wbLast) {
    wbTabTimer = setTimeout(() => {
      wbTabTimer = null;
      renderWbTab();
    }, wbGate.waitMsValue + 50);
  }
}

/** Banner đầu màn hình: đếm ngược / máu / phần đóng góp của mình / danh sách đóng góp, hoặc kết quả vừa kết thúc. Trả `true` nếu cần đồng hồ chạy. */
function renderWbBanner(): boolean {
  const banner = $("wb-banner");
  const hide = () => {
    if (!banner.hidden) banner.hidden = true;
    return false;
  };
  if (!socialFlagOn()) return hide();
  if (wbResult) {
    banner.hidden = false;
    banner.dataset.tone = wbResult.tone;
    for (const id of ["wb-title", "wb-hp", "wb-mine"]) setWbText(id, "");
    $("wb-timer").parentElement!.hidden = true;
    $("wb-title").parentElement!.hidden = true;
    $("wb-mine").hidden = true;
    $("wb-toggle").hidden = true;
    $("wb-top").hidden = true;
    const r = $("wb-result");
    r.hidden = false;
    setWbText("wb-result", wbResult.text);
    return false;
  }
  if (!wbLast) return hide();
  const v = worldBossView(wbLast.msg, performance.now() - wbLast.at);
  if (!bannerShown(v)) return hide();
  banner.hidden = false;
  banner.dataset.tone = "info";
  $("wb-result").hidden = true;
  $("wb-title").parentElement!.hidden = false;
  $("wb-timer").parentElement!.hidden = v.leftMs === null;
  setWbText("wb-title", v.title);
  setWbText("wb-hp", v.hp);
  setWbText("wb-timer-label", v.timerLabel);
  setWbText("wb-timer", v.timer);
  setWbText("wb-mine", v.mineText);
  $("wb-mine").hidden = v.mineText === "";
  $("wb-mine").classList.toggle("low", v.mineEligible === false);
  const hasTop = v.top.length > 0;
  const toggle = $("wb-toggle");
  toggle.hidden = !hasTop;
  toggle.setAttribute("aria-expanded", wbExpanded ? "true" : "false");
  setWbText("wb-toggle", wbExpanded ? "Ẩn đóng góp" : "Xem đóng góp");
  const list = $("wb-top");
  list.hidden = !(hasTop && wbExpanded);
  const key = v.top.map((r) => `${r.rank}|${r.name}|${r.title}|${r.pct}`).join("\n");
  if (key !== wbTopKey) {
    wbTopKey = key;
    list.textContent = "";
    for (const r of v.top) {
      const li = document.createElement("li");
      const n = document.createElement("span");
      n.className = "n";
      n.textContent = r.name;
      li.append(n);
      if (r.title) {
        const t = document.createElement("span");
        t.className = "t";
        t.textContent = r.title;
        li.append(t);
      }
      const pct = document.createElement("span");
      pct.className = "pct";
      pct.textContent = r.pct;
      li.append(pct);
      list.append(li);
    }
  }
  return v.leftMs !== null;
}

/** Tab "Sự kiện": trạng thái hiện tại (đếm ngược / đang diễn ra / kết quả / chưa có) + bảng lịch hằng ngày (dữ liệu tĩnh của shared, giờ máy chủ). Trả `true` nếu cần đồng hồ chạy. */
function renderWbTab(): boolean {
  if (!socialModalOpen || socialTab !== "event") return false;
  if (!wbScheduleBuilt) {
    wbScheduleBuilt = true;
    const rows = scheduleRows(WORLD_BOSS_SCHEDULE);
    $("wbt-empty").hidden = rows.length > 0;
    $("wbt-wrap").hidden = rows.length === 0;
    const body = $("wbt-body");
    body.textContent = "";
    for (const r of rows) {
      const tr = document.createElement("tr");
      const cells: [string, string][] = [
        [r.time, "c-time"],
        [r.boss, "c-name"],
        [r.map, ""],
        [r.duration, "c-num nw"],
      ];
      for (const [t, cls] of cells) {
        const td = document.createElement("td");
        td.textContent = t;
        if (cls) td.className = cls;
        tr.append(td);
      }
      body.append(tr);
    }
    setWbText("wbt-tz", rows.length > 0 ? SCHEDULE_TZ_NOTE : "");
  }
  const retry = $("wbt-retry");
  if (!wbLast) {
    const stale = wbGate.stale(performance.now(), false);
    setWbText(
      "wbt-status",
      stale ? "Chưa nhận được thông tin sự kiện. Thử tải lại nhé." : "Đang tải sự kiện…",
    );
    setWbText("wbt-detail", "");
    retry.hidden = !stale;
    return false;
  }
  retry.hidden = true;
  const v = worldBossView(wbLast.msg, performance.now() - wbLast.at);
  if (v.active && v.overdueMs > WB_OVERDUE_MS) {
    setWbText("wbt-status", "Đang cập nhật sự kiện…");
    setWbText("wbt-detail", "");
    return false;
  }
  let status: string;
  let detail = "";
  if (v.phase === "none" || v.phase === "ended") status = v.resultText;
  else if (v.phase === "soon")
    status = `${v.title}: ${v.timerLabel.toLowerCase()} ${v.timer}`.trim();
  else {
    status = `${v.title}: đang diễn ra${v.timer ? `, còn ${v.timer}` : ""}.`;
    detail = [v.hp, v.mineText].filter(Boolean).join(" · ");
  }
  setWbText("wbt-status", status);
  setWbText("wbt-detail", detail);
  return v.active && v.leftMs !== null;
}

/** Bật / tắt đồng hồ 1 giây theo nhu cầu (banner hoặc tab Sự kiện đang hiện đồng hồ); không có gì đếm thì KHÔNG chạy gì nền. */
function syncWbTick() {
  // vẽ CẢ HAI trước rồi mới gộp (`a || b` sẽ bỏ qua vế sau khi vế đầu đúng: tab Sự kiện không được vẽ lại khi banner đang đếm)
  const banner = renderWbBanner();
  const tab = renderWbTab();
  const need = banner || tab;
  if (need && wbTickTimer === null) {
    wbTickTimer = setInterval(() => {
      const b = renderWbBanner();
      const t = renderWbTab();
      if (!b && !t) syncWbTick();
    }, 1000);
  } else if (!need && wbTickTimer !== null) {
    clearInterval(wbTickTimer);
    wbTickTimer = null;
  }
}

// ---- Thành tựu + danh hiệu (M9.8, #1027): tab Thành tựu, vẽ từ `achievement-view.ts` ----
/** Sổ thành tựu MỚI NHẤT (đã làm sạch) của chính mình; `null` = chưa nhận. Danh hiệu đang đeo lấy từ đây, KHÔNG đoán trước khi bấm. */
let achLast: AchievementsMsg | null = null;
/** Thành tựu mới đạt mà chưa xem (đánh dấu "Mới" + chấm trên nút HUD); xoá khi rời tab Thành tựu / đóng bảng. */
const achNew = new Set<string>();
const achGate = new AskGate();
let achTimer: ReturnType<typeof setTimeout> | null = null;
/** Đang chờ máy chủ trả lời việc đổi danh hiệu (`undefined` = không chờ; `null` = đang gỡ). Hết `ACH_TITLE_WAIT_MS` mà chưa thấy thì thôi chờ. */
let achPending: string | null | undefined;
let achPendingTimer: ReturnType<typeof setTimeout> | null = null;
/** Nhóm mở / đóng do NGƯỜI CHƠI chọn (vẽ lại không làm mất lựa chọn). */
const achOpen = new Map<string, boolean>();
const ACH_TITLE_WAIT_MS = 5_000;
/** Đã hiện danh sách thành tựu cho người chơi thấy kể từ lúc vào tab (điều kiện để xoá dấu "Mới" khi rời). */
let achViewed = false;

function achEl(id: string): HTMLElement {
  return $(id);
}

/** Chấm "có thành tựu mới" trên nút HUD Xã hội (hình tròn, không chỉ màu) + nhãn đọc màn hình. */
function syncAchDot() {
  const btn = $("btn-social");
  const on = achNew.size > 0 && !(socialModalOpen && socialTab === "ach");
  btn.classList.toggle("has-new", on);
  const base = "Xã hội: xếp hạng, thành tựu, sự kiện (Phím Shift+G)";
  btn.setAttribute("aria-label", on ? `${base}. Có thành tựu mới` : base);
}

/** Rời tab Thành tựu (đổi tab / đóng bảng): nếu người chơi ĐÃ thấy danh sách thì xoá dấu "Mới" + chấm trên nút HUD; chưa từng thấy (mới đạt lúc đang ở tab khác) thì giữ. */
function leaveAch() {
  if (!achViewed) return;
  achViewed = false;
  if (achNew.size === 0) return;
  achNew.clear();
  syncAchDot();
}

function requestAch(force = false) {
  const now = performance.now();
  if (!achGate.tryAsk(now, achLast !== null, force)) return;
  callbacks?.onAchievementsGet?.();
  if (achTimer !== null) clearTimeout(achTimer);
  achTimer = null;
  if (!achLast) {
    achTimer = setTimeout(() => {
      achTimer = null;
      renderAch();
    }, achGate.waitMsValue + 50);
  }
}

/** Vẽ tab Thành tựu: tóm tắt, danh hiệu (radiogroup), thành tựu theo nhóm (details). Đổ chữ bằng `textContent`; vẽ lại giữ nhóm người chơi đã mở / đóng. */
function renderAch() {
  if (!socialModalOpen || socialTab !== "ach") return;
  const status = achEl("ach-status");
  const retry = achEl("ach-retry");
  const body = achEl("ach-body");
  if (!achLast) {
    const stale = achGate.stale(performance.now(), false);
    status.hidden = false;
    status.textContent = stale
      ? "Chưa nhận được sổ thành tựu. Thử tải lại nhé."
      : "Đang tải sổ thành tựu…";
    retry.hidden = !stale;
    body.hidden = true;
    achEl("ach-summary").textContent = "";
    return;
  }
  status.hidden = true;
  retry.hidden = true;
  body.hidden = false;
  const v = achievementsView(achLast, achNew);
  achViewed = true;
  achEl("ach-summary").textContent = v.summary;
  achEl("ach-worn").textContent = achPending !== undefined ? "Đang đổi danh hiệu…" : v.wornText;
  // danh hiệu: một nút "Không đeo" + mỗi danh hiệu một nút (khoá thì aria-disabled + nói cách mở bằng CHỮ)
  const titles = achEl("ach-titles");
  titles.textContent = "";
  const mkTitle = (
    id: string | null,
    text: string,
    checked: boolean,
    locked: boolean,
    hint: string,
  ) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ach-title" + (checked ? " on" : "") + (locked ? " locked" : "");
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", checked ? "true" : "false");
    if (locked) b.setAttribute("aria-disabled", "true");
    const t = document.createElement("span");
    t.className = "ach-title-text";
    t.textContent = text;
    b.append(t);
    if (hint) {
      const h = document.createElement("span");
      h.className = "ach-title-hint";
      h.textContent = hint;
      b.append(h);
    }
    b.addEventListener("click", () => {
      if (locked || checked || achPending !== undefined) return;
      achPending = id;
      if (achPendingTimer !== null) clearTimeout(achPendingTimer);
      achPendingTimer = setTimeout(() => {
        achPendingTimer = null;
        achPending = undefined;
        renderAch();
      }, ACH_TITLE_WAIT_MS);
      callbacks?.onTitleSet?.(id);
      renderAch();
    });
    titles.append(b);
  };
  mkTitle(null, "Không đeo", v.worn === null, false, "");
  for (const t of v.titles) mkTitle(t.id, t.text, t.worn, !t.unlocked, t.hint);
  // thành tựu theo nhóm
  const groups = achEl("ach-groups");
  groups.textContent = "";
  const few = v.total <= 12;
  v.groups.forEach((g, gi) => {
    const det = document.createElement("details");
    det.className = "ach-group";
    const hasNew = g.items.some((i) => i.isNew);
    det.open = achOpen.get(g.id) ?? (few || gi === 0 || hasNew);
    det.addEventListener("toggle", () => achOpen.set(g.id, det.open));
    const sum = document.createElement("summary");
    sum.textContent = `${g.label} (${g.done} / ${g.total})`;
    det.append(sum);
    const ul = document.createElement("ul");
    ul.className = "ach-list";
    for (const it of g.items) {
      const li = document.createElement("li");
      li.className = "ach-item" + (it.done ? " done" : "") + (it.isNew ? " new" : "");
      const head = document.createElement("div");
      head.className = "ach-head";
      const name = document.createElement("b");
      name.className = "ach-name";
      name.textContent = it.name;
      head.append(name);
      if (it.isNew) {
        const n = document.createElement("span");
        n.className = "ach-badge";
        n.textContent = "Mới";
        head.append(n);
      }
      const st = document.createElement("span");
      st.className = "ach-state";
      st.textContent = it.done ? (it.at ? `Hoàn thành · ${it.at}` : "Hoàn thành") : it.progress;
      head.append(st);
      li.append(head);
      const d = document.createElement("p");
      d.className = "ach-desc";
      d.textContent = it.desc;
      li.append(d);
      if (!it.done) {
        const bar = document.createElement("div");
        bar.className = "ach-bar";
        bar.setAttribute("role", "progressbar");
        bar.setAttribute("aria-label", `Tiến độ: ${it.name}`);
        bar.setAttribute("aria-valuemin", "0");
        bar.setAttribute("aria-valuemax", "100");
        bar.setAttribute("aria-valuenow", String(it.pct));
        bar.setAttribute("aria-valuetext", it.progress);
        const fill = document.createElement("i");
        fill.style.width = `${it.pct}%`;
        bar.append(fill);
        li.append(bar);
      }
      if (it.reward) {
        const r = document.createElement("p");
        r.className = "ach-reward";
        r.textContent = it.reward;
        li.append(r);
      }
      ul.append(li);
    }
    det.append(ul);
    groups.append(det);
  });
}

// ---- Nội vụ tông môn (M8.6, #843) ----
/** Ảnh chụp "Nội vụ" MỚI NHẤT đã làm sạch + đồng hồ máy khách lúc nhận (để đếm ngược theo giờ máy chủ); `null` = chưa có. */
let sectHall: { view: NonNullable<ReturnType<typeof sanitizeHallView>>; at: number } | null = null;
/** Thao tác đang chờ máy chủ trả lời (khoá nút): `quest:<id>` / `shop:<itemId>`; mở khoá khi có ảnh chụp mới / toast / hết `HALL_BUSY_MS`. */
const hallBusy = new Set<string>();
/** Trạng thái mở / thu của các nhóm cửa hàng tông môn do người chơi đổi (khác mặc định); xoá khi rời / hết tông môn */
const hallGroupOpen = new Map<string, boolean>();
/** Khung "mua nhiều" của cửa hàng tông (ô số lượng dùng chung): hàng đang mở và MỘT ô số lượng dùng lại cho mọi hàng (`setQty` / `setMax` mỗi lần mở) */
let hallBuyOpen: string | null = null;
let hallBuyStepper: QtyStepper | null = null;
let hallBusyTimer: ReturnType<typeof setTimeout> | null = null;
const HALL_BUSY_MS = 5000;
/** Đồng hồ đếm ngược của tab Nội vụ (mỗi giây, chỉ chạy khi tab đang xem) và mốc đặt lại đã xin ảnh chụp mới (mỗi mốc xin MỘT lần). */
let hallClock: ReturnType<typeof setInterval> | null = null;
let hallRefreshedFor = 0;
/** Hẹn giờ NỀN (một lần, kể cả khi tab Nội vụ đóng): qua mốc đặt lại thì xin ảnh chụp mới để máy chủ gỡ nhiệm vụ tông quá ngày (`hallRefreshDelayMs`). */
let hallResetTimer: ReturnType<typeof setTimeout> | null = null;
// ---- Kho đồ tông môn (mục 27, K4, #788) ----
/** Ảnh chụp kho đồ MỚI NHẤT máy chủ gửi (đã làm sạch); `null` = chưa có / không còn tông môn. */
let sectVault: SectVaultView | null = null;
/** Ô đang chọn: từ kho (rút) hoặc từ túi (góp). Chỉ bấm / chạm / bàn phím mới chọn, rê chuột KHÔNG chọn (mục 24, `inv-select.test.ts`). */
let vaultSel: { from: "vault" | "bag"; index: number } | null = null;
let vaultQty = 1;
/** Ô nhập số lượng dùng chung (qty-stepper.ts, mục 47) của kho đồ tông môn, và của hai ô Linh thạch ở tab Quỹ; gắn một lần ở `setup` */
let vaultStepper: QtyStepper | null = null;
let depositStepper: QtyStepper | null = null;
let withdrawStepper: QtyStepper | null = null;
/** Đang vẽ lại tab Kho đồ: `onChange` của ô số lượng bắn trong lúc `setMax` thì không vẽ lại lồng nhau */
let vaultRendering = false;
/** Đang chờ máy chủ trả lời một thao tác kho đồ (mỗi người một thao tác tại một thời điểm): khoá nút tới khi có ảnh chụp mới / toast / hết `VAULT_BUSY_MS`. */
let vaultBusy = false;
let vaultBusyTimer: ReturnType<typeof setTimeout> | null = null;
const VAULT_BUSY_MS = 5000;
const vaultSlotEls: HTMLButtonElement[] = [];
const vaultBagEls: HTMLButtonElement[] = [];
let currentSectInvite: SectInvitedMsg | null = null;
let sectInviteInterval: number | null = null;
let sectConfirmAction: (() => void) | null = null;
/** Hộp xác nhận qua cổng khi đang có hiệu lực đan / phù (#514, issue #769): việc làm khi người chơi chọn "Đi" */
let travelConfirmAction: (() => void) | null = null;

/** Hộp xác nhận trong game cho Nhường / Trục xuất / Rời (#246): confirm() gốc bị chặn / xấu trên điện thoại và PWA */
function askSectConfirm(kind: SectConfirmKind, name: string, onOk: () => void) {
  const box = document.getElementById("sect-action-confirm");
  if (!box) return;
  const { text, ok } = sectConfirmText(
    kind,
    name,
    kind === "leave" ? hallLeaveWarning(sectHall?.view ?? null) : "",
  );
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
      const mapSpan = document.createElement("span");
      mapSpan.className = "pmem-map";
      mapSpan.textContent = `(${mapLabelOf(m.mapId)})`;
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
      onPress(kickBtn, () => callbacks?.onPartyKick?.(m.name));
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
  } catch {
    hideOtherNames = false;
  }
  try {
    preferTargetOverMouse = parsePreferTarget(localStorage.getItem(PREFER_TARGET_STORAGE_KEY));
  } catch {
    preferTargetOverMouse = false;
  }
  try {
    aimModeSetting = parseAimMode(localStorage.getItem(AIM_MODE_STORAGE_KEY));
  } catch {
    aimModeSetting = DEFAULT_AIM_MODE;
  }
  minimapVisible = minimapOpen(parseTrackerPref(readPref(MINIMAP_PREF_KEY)));
  // Chất lượng đồ hoạ (và class body.low-fx tương thích) do gfx/quality.ts quản lý (#323): một nguồn duy nhất
}

// Hộp thoại NPC
let currentDialog: DialogMsg | null = null;
/** Ô chân dung ở khung hội thoại (dựng lười ở lần mở đầu tiên). */
let dlgPortrait: NpcPortraitSlot | null = null;
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
    if (isQuickCandidate(def) && def && !consumablesInBag.includes(def.id)) {
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

  const slotTag = document.createElement("span");
  slotTag.textContent = `[${EQUIP_SLOT_NAMES[eq.slot]}]`;
  slotTag.style.opacity = "0.8";
  box.append(slotTag);

  // "Đang mặc: cũ -> mới" cùng ô: người chơi không phải nhớ món đang mặc (pháp bảo so bằng hai câu mô tả vì không có số để trừ)
  const swap = swapInfo(currentEquip, candidate);
  if (swap) {
    const line = document.createElement("span");
    line.className = "cmp-swap";
    line.textContent = `Đang mặc: ${swap.fromName} → ${swap.toName}`;
    box.append(line);
    if (swap.fromDesc || swap.toDesc) {
      for (const [tag, desc] of [
        ["Cũ", swap.fromDesc],
        ["Mới", swap.toDesc],
      ] as const) {
        if (!desc) continue;
        const d = document.createElement("span");
        d.className = "cmp-desc";
        d.textContent = `${tag}: ${desc}`;
        box.append(d);
      }
    }
  }

  const deltas = statDeltas(nowStats, nextStats);
  // Ô còn khoá: statsFor không cộng chỉ số của ô đó nên hiệu luôn 0; KHÔNG ghi "ngang bằng" (không có món nào đang mặc ở ô đó, lý do khoá ghi ở dòng yêu cầu)
  const slotLock = slotLockText(eq.slot, currentRealm);
  for (const x of deltas) {
    const chip = document.createElement("span");
    chip.className = `cmp-chip ${x.d > 0 ? "cmp-up" : "cmp-down"}`;
    chip.textContent = `${x.d > 0 ? "▲" : "▼"} ${deltaText(x)}`;
    box.append(chip);
  }
  if (deltas.length === 0 && !slotLock) {
    const same = document.createElement("span");
    same.className = "cmp-eq";
    same.textContent = "Chỉ số ngang bằng món đang mặc";
    box.append(same);
  }

  const reqSpan = document.createElement("span");
  const reqText = realmLabel(eq.reqRealm, eq.reqTier);
  const ok = canEquip(candidate.id, currentRealm, currentTier) && !slotLock;
  reqSpan.className = ok ? "req-ok" : "req-warn";
  reqSpan.textContent = ok ? `Đủ cảnh giới (${reqText})` : (slotLock ?? `Cần ${reqText}`);
  box.append(reqSpan);
}

/** Kinh quyển (M7.4): dòng "Dạy: <chiêu> · Cần <cảnh giới>" ở khung chi tiết túi (tái dùng khung so sánh trang bị); món khác ẩn khung. */
function fillBookTeach(box: HTMLElement, def: ItemDef) {
  const info = bookTeach(def, currentRealm, currentTier);
  if (!info) {
    box.hidden = true;
    return;
  }
  box.replaceChildren();
  const line = document.createElement("span");
  line.className = info.ok ? "req-ok" : "req-warn";
  line.textContent = info.text;
  box.append(line);
  box.hidden = false;
}

/** Chọn ô `i` ở túi (chuột bấm, chạm, bàn phím): đổi ô được chọn thì hộp xác nhận vứt đang mở (của ô cũ) đóng lại. Rê chuột KHÔNG gọi hàm này. */
function selectSlot(i: number) {
  if (selectedSlot === i) return;
  closeDropConfirm(false);
  selectedSlot = i;
  renderInventory();
}

// ---------- Hộp xác nhận DÙNG CHUNG (issue #779, docs/RA_SOAT_THAO_TAC.md) ----------
let actConfirmAction: (() => void) | null = null;
let actConfirmOpener: HTMLElement | null = null;
let actConfirmOpenedAt = -Infinity;
/** Hộp đang mở do nút Bán ở cửa hàng: cửa hàng đóng (đi xa NPC, Esc...) thì hộp đóng theo, không bán vào chỗ không còn mở. */
let actConfirmFromShop = false;
/** Hộp đang mở do biểu mẫu Lập / Nộp của bảng Tông môn: bảng đóng (Esc, bị trục xuất, đổi cảnh) thì hộp đóng theo, không lập / nộp vào chỗ không còn mở. */
let actConfirmFromSect = false;
/** Lúc hộp xác nhận đóng gần nhất (ms, `performance.now`). Hộp đóng ngay ở `pointerdown`, nên `click` do trình duyệt tạo sau khi nhả ngón rơi xuống nút ở DƯỚI hộp (nút Bán): bỏ qua `click` trong cửa sổ chống click ma. */
let actConfirmClosedAt = -1e12;

/**
 * `click` "ma" (chuột / chạm: `detail > 0`) ngay sau khi hộp xác nhận vừa đóng, rơi xuống nút bên dưới hộp. Thao tác bằng BÀN PHÍM (Enter / Cách: `detail === 0`) hoặc lập trình thì không
 * phải click ma, không chặn (người dùng bàn phím xác nhận bằng Y rồi bấm Enter ngay phải được).
 */
function ghostClick(e: MouseEvent): boolean {
  return e.detail > 0 && inConfirmGuard(actConfirmClosedAt, performance.now());
}

/** Mở hộp xác nhận: nêu hậu quả bằng chữ; "Giữ lại" được focus; `onOk` chỉ chạy khi bấm xác nhận SAU cửa sổ chống click ma. */
function askActConfirm(spec: ConfirmSpec, onOk: () => void, opener: HTMLElement | null) {
  actConfirmAction = onOk;
  actConfirmOpener = opener;
  actConfirmOpenedAt = performance.now();
  $("act-confirm-text").textContent = spec.text;
  const warn = $("act-confirm-warn");
  warn.textContent = spec.warn ?? "";
  warn.hidden = spec.warn === null;
  $("act-btn-yes-label").textContent = spec.ok;
  $("act-btn-no-label").textContent = spec.cancel;
  $("act-confirm").hidden = false;
  ($("act-btn-no") as HTMLButtonElement).focus(); // mặc định "Giữ lại": Enter nhầm cũng không làm gì
}

/** Đóng hộp xác nhận dùng chung; `refocus` = trả focus về nút đã mở hộp. `false` nếu hộp không mở. */
function closeActConfirm(refocus = true): boolean {
  const box = document.getElementById("act-confirm");
  if (!box || box.hidden) return false;
  box.hidden = true;
  actConfirmAction = null;
  actConfirmFromShop = false;
  actConfirmFromSect = false;
  actConfirmClosedAt = performance.now();
  const back = actConfirmOpener;
  actConfirmOpener = null;
  if (refocus && back && !back.hidden) back.focus();
  return true;
}

/** Kế hoạch vứt đang chờ xác nhận (chụp lúc bấm "Vứt 1" / "Vứt hết"); `null` = không có hộp. */
let dropPlanPending: DropPlan | null = null;
/** Kế hoạch GỐC lúc bấm nút ("Vứt 1" / "Vứt hết"); ô số lượng đổi số thì kế hoạch đang chờ được dựng lại từ đây (`withDropQty`) */
let dropPlanInit: DropPlan | null = null;
/** Ô số lượng dùng chung trong hộp xác nhận vứt (mục 47); chỉ hiện khi ô túi có từ 2 cái */
let dropStepper: QtyStepper | null = null;
/** Nút đã mở hộp (trả focus về đó khi đóng hộp bằng Esc / "Giữ lại") */
let dropConfirmOpener: HTMLElement | null = null;
/**
 * Chống "click ma" (cảm ứng): hộp xác nhận hiện NGAY CHỖ nút Vứt vừa chạm; `click` do trình duyệt tạo sau khi nhả ngón có thể rơi vào nút "Vứt" của
 * hộp (bố cục vừa đổi) và xác nhận luôn mà người chơi chưa kịp đọc. Hai nút trong hộp bỏ qua mọi lần bấm trong chừng này ms đầu sau khi hộp mở.
 */
const DROP_CONFIRM_GUARD_MS = 450;
let dropConfirmOpenedAt = -Infinity;
/**
 * Lúc hộp xác nhận vừa ĐÓNG: hộp biến mất thì hàng nút "Vứt 1" / "Vứt hết" hiện lại, có khi đúng chỗ ngón vừa chạm "Vứt" / "Giữ lại", và `click` do trình duyệt tạo sau khi nhả ngón rơi
 * vào nút đó (`bindTap` nhớ lần chạm theo TỪNG nút nên không nhận ra) và mở hộp lần nữa ngay sau khi vừa vứt. Hai nút này bỏ qua click chuột / chạm trong cửa sổ chống click ma sau khi hộp đóng.
 */
let dropConfirmClosedAt = -Infinity;

/** Mở hộp xác nhận vứt cho ô được chọn: ghi rõ TÊN + SỐ LƯỢNG (+ dòng nhắc đồ quý). `all` = "Vứt hết", ngược lại vứt 1. */
function askDropConfirm(all: boolean, opener: HTMLElement | null) {
  const plan = planDrop(invSlots, selectedSlot, all);
  const def = plan ? ITEM_BY_ID[plan.itemId] : undefined;
  if (!plan || !def) return;
  dropPlanPending = plan;
  dropPlanInit = plan;
  dropConfirmOpener = opener;
  dropConfirmOpenedAt = performance.now();
  $("inv-drop-text").textContent = dropConfirmText(def.name, plan);
  // ô số lượng: chỉ khi có từ 2 cái (1 cái thì không có gì để chọn); "Vứt 1" mở với số 1, "Vứt hết" mở với toàn bộ, chỉnh được trước khi xác nhận
  const stepper = dropStepper;
  $("inv-drop-qty").hidden = !(plan.have >= 2 && stepper);
  if (stepper && plan.have >= 2) {
    stepper.setMax(plan.have);
    stepper.setQty(plan.qty);
  }
  const warn = dropWarnText(def.rarity, rarityStyle(def.rarity).name);
  const warnEl = $("inv-drop-warn");
  warnEl.textContent = warn ?? "";
  warnEl.hidden = warn === null;
  $("inv-detail").classList.add("dropping"); // hộp thế chỗ hàng nút hành động (không đẩy bố cục xuống dưới nút Đóng nổi của điện thoại)
  $("inv-drop-confirm").hidden = false;
  ($("inv-drop-no") as HTMLButtonElement).focus(); // mặc định "Giữ lại": Enter nhầm cũng không vứt
}

/** Đóng hộp xác nhận vứt; `refocus` = trả focus về nút đã mở hộp. `false` nếu hộp không mở. */
function closeDropConfirm(refocus = true): boolean {
  const box = document.getElementById("inv-drop-confirm");
  if (!box || box.hidden) return false;
  box.hidden = true;
  dropConfirmClosedAt = performance.now();
  $("inv-detail").classList.remove("dropping");
  dropPlanPending = null;
  dropPlanInit = null;
  const back = dropConfirmOpener;
  dropConfirmOpener = null;
  if (refocus && back && !back.hidden) back.focus();
  return true;
}

/** Ô số lượng đổi số: dựng lại kế hoạch từ kế hoạch gốc và cập nhật lời trong hộp. Ô đang trống / sai (người chơi đang gõ lại) thì giữ kế hoạch cũ. */
function onDropQtyChange(q: number | null) {
  const init = dropPlanInit;
  const def = init ? ITEM_BY_ID[init.itemId] : undefined;
  if (!init || !def || q === null) return;
  const plan = withDropQty(init, q);
  dropPlanPending = plan;
  $("inv-drop-text").textContent = dropConfirmText(def.name, plan);
}

/**
 * "Vứt" trong hộp: đọc lại số trong ô (nếu có), kiểm lại túi vẫn còn ĐÚNG món + đủ số lượng rồi mới gửi `dropItem`; đã đổi thì huỷ kèm thông báo.
 * Số trong ô trống / sai thì KHÔNG vứt và hộp vẫn mở (không gửi gì, không đoán số).
 */
function confirmDrop() {
  if (performance.now() - dropConfirmOpenedAt < DROP_CONFIRM_GUARD_MS) return; // click ma ngay sau khi hộp mở: bỏ qua
  let plan = dropPlanPending;
  const init = dropPlanInit;
  if (plan && init && !$("inv-drop-qty").hidden && dropStepper) {
    const q = dropStepper.read();
    if (q === null) {
      ui.toast({ text: "Nhập số lượng vứt từ 1 trở lên.", tone: "bad" });
      dropStepper.focus();
      return;
    }
    plan = withDropQty(init, q);
  }
  closeDropConfirm(true);
  if (!plan) return;
  if (!dropStillValid(invSlots, plan)) {
    ui.toast({ text: "Túi đồ vừa đổi, chưa vứt gì. Hãy chọn lại món.", tone: "info" });
    return;
  }
  if (plan.all) callbacks?.onDrop(plan.index);
  else callbacks?.onDrop(plan.index, plan.qty);
}

/** Dòng thông tin thêm của vật phẩm dùng được ở khung so sánh: "Hiệu lực: ..." của đan / phù gắn trạng thái (#514), "Dạy: ..." của kinh quyển (M7.4); món khác ẩn khung. */
function fillUseInfo(box: HTMLElement, def: ItemDef) {
  const eff = statusEffectLine(def);
  if (eff === null) {
    fillBookTeach(box, def);
    return;
  }
  box.replaceChildren();
  const line = document.createElement("span");
  line.className = "req-ok";
  line.textContent = eff;
  box.append(line);
  box.hidden = false;
}

/** Chữ + trạng thái của nút Dùng / Học: đan gắn trạng thái MỜ kèm lý do ngắn khi còn hiệu lực / sai bậc (máy chủ vẫn từ chối + không trừ nếu bấm được). */
function applyUseBtn(btn: HTMLButtonElement, def: ItemDef, label: string) {
  const reason = useBlockReason(def, {
    activeIds: activeStatusIds,
    realm: currentRealm,
    tier: currentTier,
    exp: currentExp,
    expMax: currentExpMax,
  });
  const text = reason ?? label;
  if (btn.textContent !== text) btn.textContent = text;
  const off = reason !== null;
  if (btn.disabled !== off) btn.disabled = off;
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
    clearRarityText(nameEl);
    rarityEl.textContent = "";
    rarityEl.style.color = "";
    descEl.textContent = "Bấm hoặc chạm vào một ô có vật phẩm để xem mô tả, dùng hoặc vứt.";
    cmpEl.hidden = true;
    actionsEl.hidden = true;
    return;
  }

  nameEl.textContent = s.qty > 1 ? `${def.name} (×${s.qty})` : def.name;
  applyRarityText(nameEl, def.rarity);
  const rColor = rarityStyle(def.rarity).color;
  rarityEl.textContent = rarityStyle(def.rarity).name;
  rarityEl.style.color = rColor;
  const cdSec = def.cooldown ? ` · Hồi chiêu ${Math.round(def.cooldown / 1000)}s` : "";
  const eqStatsText = def.equip
    ? ` · ${describeEquipStats(def.equip.stats, def.equip.treasure)}`
    : "";
  descEl.textContent = `${def.desc}${eqStatsText}${cdSec}`;

  if (def.type === "equip" && def.equip) {
    fillEquipComparison(cmpEl, def);
    equipBtn.hidden = false;
    const slotLock = slotLockText(def.equip.slot, currentRealm);
    const ok = canEquip(def.id, currentRealm, currentTier) && !slotLock;
    equipBtn.disabled = !ok;
    equipBtn.textContent = ok
      ? "Mặc"
      : (slotLock ?? `Cần ${realmLabel(def.equip.reqRealm, def.equip.reqTier)}`);
  } else {
    fillUseInfo(cmpEl, def);
    equipBtn.hidden = true;
  }

  actionsEl.hidden = false;
  const useLabel = useLabelOf(def); // đan dược "Dùng", kinh quyển "Học" (M7.4)
  useBtn.hidden = useLabel === null;
  if (useLabel !== null) applyUseBtn(useBtn, def, useLabel);
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
      btn.style.borderColor = rarityStyle(def.rarity).color;
      applyItemVisual(slotIconEls[i], def);
      slotNameEls[i].textContent = def.name;
      btn.setAttribute("aria-label", itemAria(def, s.qty)); // tên + bậc (+ số lượng): dấu ◆ ★ bị giấu khỏi trình đọc
      btn.title = s.qty > 1 ? `${def.name} ×${s.qty}` : def.name; // rê chuột chỉ hiện chú thích, KHÔNG đổi ô được chọn
      applyRarityBadge(btn, def.rarity);
      slotQtyEls[i].textContent = s.qty > 1 ? `${s.qty}` : "";
    } else {
      btn.style.borderColor = "rgba(243, 220, 160, 0.22)";
      applyItemVisual(slotIconEls[i], undefined);
      slotNameEls[i].textContent = "";
      btn.setAttribute("aria-label", "Ô trống");
      btn.removeAttribute("title");
      clearRarityBadge(btn);
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
      total > 0 && def ? rarityStyle(def.rarity).color : "rgba(201, 162, 74, 0.45)";
    applyItemVisual($(`quick-${idx}-icon`), def);
    $(`quick-${idx}-name`).textContent = def ? quickLabel(def.name) : `Đan ${idx}`;
    $(`quick-${idx}-qty`).textContent = total > 0 ? `${total}` : "0";
  }
}

function showGainFeed(itemId: string, qty: number) {
  const def = ITEM_BY_ID[itemId];
  if (!def || qty <= 0) return;
  const feed = $("gain-feed");
  const item = document.createElement("div");
  item.className = "gain-item";
  item.style.borderLeftColor = rarityStyle(def.rarity).color;
  applyRarityText(item, def.rarity);

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

/** Bảng Nhiệm vụ thu gọn / mở (gfx/hud-compact.ts): lựa chọn của người chơi (`tg_qt_open`) thắng, chưa chọn thì theo độ gọn của máy. */
interface PanelPrefHandle {
  /** Đang mở không (theo lựa chọn đã nhớ, chưa chọn thì theo độ gọn của máy) */
  isOpen(): boolean;
  /** Đặt mở / thu gọn như người chơi bấm (có nhớ) */
  setOpen(open: boolean): void;
}

/**
 * Bảng nổi thu gọn được và NHỚ lựa chọn (QUYET_DINH_M3 mục 15): chưa chọn thì mặc định theo độ gọn của máy (`isCompactHud`: điện thoại hoặc cửa sổ
 * hẹp thu gọn, máy tính rộng mở), đã chọn thì lựa chọn của người chơi thắng ở mọi máy. `apply` vẽ trạng thái; nút `toggleId` đổi trạng thái.
 * `legacyCollapsedKey`: khoá cũ (1 = thu gọn) của bản trước, chỉ đọc khi chưa có khoá mới.
 */
/** Vẽ trạng thái bản đồ nhỏ: `#minimap-wrap.collapsed` ẩn canvas (CSS), công tắc trong Cài đặt khớp. */
function applyMinimap() {
  document.getElementById("minimap-wrap")?.classList.toggle("collapsed", !minimapVisible);
  const chk = document.getElementById("set-minimap") as HTMLInputElement | null;
  if (chk) chk.checked = minimapVisible;
}

function setupPanelPref(
  opts: {
    key: string;
    toggleId: string;
    apply: (open: boolean) => void;
    legacyCollapsedKey?: string;
  },
  bindTap: (id: string, fn: () => void) => void,
): PanelPrefHandle {
  let pref = parseTrackerPref(readPref(opts.key));
  if (pref === null && opts.legacyCollapsedKey) {
    const legacy = readPref(opts.legacyCollapsedKey);
    pref = legacy === "1" ? false : legacy === "0" ? true : null;
  }
  const isOpen = () => panelOpen(pref, getDisplay());
  const apply = () => opts.apply(isOpen());
  apply();
  onDisplayChange(apply); // xoay máy / đổi cỡ cửa sổ: chưa chọn thì tự đổi theo độ gọn mới
  const setOpen = (open: boolean) => {
    pref = open;
    writePref(opts.key, open ? "1" : "0");
    apply();
  };
  bindTap(opts.toggleId, () => setOpen(!isOpen()));
  return { isOpen, setOpen };
}

let chatPanel: PanelPrefHandle | null = null;
let chatIdleTimer: number | null = null;
/** Sau chừng này không dùng khung chat thì tự mờ. */
const CHAT_IDLE_MS = 6000;

/** Khung chat vừa được dùng (tin mới, rê chuột, gõ, mở / thu): sáng lên rồi hẹn giờ mờ lại. */
function bumpChat() {
  const chat = document.getElementById("chat");
  if (!chat) return;
  chat.classList.remove("idle");
  if (chatIdleTimer !== null) window.clearTimeout(chatIdleTimer);
  chatIdleTimer = window.setTimeout(() => {
    chatIdleTimer = null;
    chat.classList.add("idle");
  }, CHAT_IDLE_MS);
}

function setupQuestTrackerToggle(bindTap: (id: string, fn: () => void) => void) {
  const tracker = $("quest-tracker");
  const btn = $("qt-toggle");
  setupPanelPref(
    {
      key: TRACKER_PREF_KEY,
      toggleId: "qt-toggle",
      apply: (open) => {
        tracker.classList.toggle("collapsed", !open);
        btn.setAttribute("aria-expanded", String(open));
      },
    },
    bindTap,
  );
}

function renderQuestTracker() {
  trackingQuestId = renderQuestTrackerView({
    active: questLog.active,
    trackingId: trackingQuestId,
    ctx: getCtx(),
    onTrack: (id) => {
      trackingQuestId = id;
      renderQuestTracker();
      callbacks?.onTrackQuest?.(id);
    },
  });
}

// ---------- Màn Phím tắt trong Cài đặt (QUYET_DINH_M3 mục 13, #463) ----------

let keysModalOpen = false;

/**
 * Tấm kết quả (bí cảnh, quyết đấu) được bật / tắt bằng thuộc tính `hidden` ở nhiều chỗ nên không đi qua `toggle...`: theo dõi thuộc tính để tấm
 * vào / ra `modalStack` (phím của thế giới không chạy phía sau, Esc đóng đúng tầng) và đưa focus vào nút của tấm (#463).
 */
function watchModalHidden(id: string) {
  const el = document.getElementById(id);
  if (!el || typeof MutationObserver === "undefined") return;
  const sync = () => {
    if (!el.hidden) {
      if (!modalStack.getEntries().some((m) => m.id === id)) {
        modalStack.push(id, null);
        focusModal(el);
      }
    } else if (modalStack.remove(id)) {
      returnFocus(null);
    }
  };
  new MutationObserver(sync).observe(el, { attributes: true, attributeFilter: ["hidden"] });
  sync(); // tấm đã hiện sẵn lúc gắn
}

/** Hành động đang chờ người chơi bấm phím mới; `null` = không chờ. */
let keyCaptureFor: ActionId | null = null;

function setKeysStatus(msg: string) {
  $("keys-status").textContent = msg;
}

function renderKeysModal() {
  withFocusKept($("keys-modal"), renderKeysModalImpl);
}

/** Vẽ danh sách phím từ bảng phím (`keysScreenModel`): mỗi hành động một dòng "tên / các phím / nút Đổi phím". */
function renderKeysModalImpl() {
  const list = $("keys-list");
  list.replaceChildren();
  for (const g of keysScreenModel(getKeymap())) {
    const sec = document.createElement("section");
    sec.className = "keys-group";
    const h = document.createElement("h3");
    h.textContent = g.title;
    sec.append(h);
    for (const r of g.rows) {
      const row = document.createElement("div");
      row.className = r.custom ? "keys-row custom" : "keys-row";
      const name = document.createElement("span");
      name.className = "keys-name";
      name.textContent = r.label;
      const caps = document.createElement("span");
      caps.className = "keys-caps";
      for (const k of r.keys) {
        const kbd = document.createElement("kbd");
        kbd.className = "key-chip";
        kbd.textContent = k;
        caps.append(kbd);
      }
      if (r.unbound) {
        // phím mặc định của hành động này đã thuộc phím người chơi tự đổi: không im lặng, báo rõ và để người chơi gán lại
        const none = document.createElement("span");
        none.className = "keys-unbound";
        none.textContent = "chưa gán phím";
        caps.append(none);
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "keys-change";
      btn.dataset.action = r.id;
      btn.dataset.nav = `key:${r.id}`;
      const waiting = keyCaptureFor === r.id;
      btn.classList.toggle("waiting", waiting);
      btn.textContent = waiting ? "Bấm phím mới..." : "Đổi phím";
      btn.setAttribute(
        "aria-label",
        waiting
          ? `${r.label}: đang chờ phím mới, bấm phím muốn gán hoặc Esc để huỷ`
          : r.unbound
            ? `Đổi phím ${r.label} (hiện chưa gán phím)`
            : `Đổi phím ${r.label} (hiện là ${r.keys.join(" hoặc ")})`,
      );
      row.append(name, caps, btn);
      sec.append(row);
    }
    list.append(sec);
  }
  const fixed = $("keys-fixed-list");
  fixed.replaceChildren();
  for (const f of FIXED_KEYS) {
    const li = document.createElement("li");
    const kbd = document.createElement("kbd");
    kbd.className = "key-chip";
    kbd.textContent = f.keys;
    li.append(kbd, ` ${f.what}`);
    fixed.append(li);
  }
}

function startKeyCapture(id: ActionId) {
  keyCaptureFor = id;
  setKeysStatus(`Đang đổi phím "${ACTION_BY_ID[id].label}": bấm phím muốn gán (Esc để huỷ).`);
  renderKeysModal();
}

/**
 * Bắt phím lúc đang chờ gán, gắn ở pha CAPTURE của `window` nên chạy TRƯỚC mọi bộ lắng nghe khác (Esc đóng bảng, phím hành động của thế giới,
 * Phaser): phím bấm để gán không được làm gì khác. Quyết định ở `captureOutcome` (thuần, có test); chỗ này chỉ áp dụng kết quả.
 */
function onKeyCaptureKeydown(e: KeyboardEvent) {
  const id = keyCaptureFor;
  if (id === null) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  const out = captureOutcome(id, e, getKeymap());
  switch (out.kind) {
    case "ignore":
      return;
    case "reject":
      setKeysStatus(out.message);
      return;
    case "cancel":
      keyCaptureFor = null;
      setKeysStatus(out.message);
      renderKeysModal();
      return;
    case "bind":
      keyCaptureFor = null; // trước rebind: rebind báo `onKeymapChange` để vẽ lại
      rebind(id, out.token);
      setKeysStatus(out.message);
      return;
  }
}

// ---------- Sổ nhiệm vụ (Quest Log Modal - Phím Q) ----------

function renderQuestModal() {
  withFocusKept($("quest-modal"), renderQuestModalImpl);
}

function renderQuestModalImpl() {
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
      const def = questDefAny(a.id);
      if (!def) continue;
      const { text, ready } = describeStep(def, a, getCtx());

      const card = document.createElement("div");
      const kind = questKind(def);
      card.className = `q-card ${kind === "daily" || kind === "sect" ? "daily" : kind === "side" ? "side-q" : "main-q"}`;

      const head = document.createElement("div");
      head.className = "q-card-head";

      const title = document.createElement("b");
      title.className = "q-card-title";
      title.textContent = def.title;

      const giver = document.createElement("small");
      giver.style.opacity = "0.75";
      giver.textContent = questCardSubtitle(def);

      head.append(title, giver);

      const desc = document.createElement("div");
      desc.className = "q-card-desc";
      desc.textContent = def.desc;

      const progEl = document.createElement("div");
      progEl.className = "q-card-progress";
      progEl.textContent = ready ? `✓ ${text}` : `▸ ${text}`;

      const rew = document.createElement("div");
      rew.className = "q-card-rewards";
      // Mỗi món thưởng là một <span> tô màu + dấu theo độ hiếm (như túi / cửa hàng); tu vi và dấu phẩy giữ màu vàng của dòng
      rew.append("Thưởng: ");
      rewardParts(def.rewards).forEach((part, k) => {
        if (k > 0) rew.append(", ");
        if (part.itemId === undefined) {
          rew.append(part.text);
          return;
        }
        const span = document.createElement("span");
        span.className = "q-reward-item";
        span.textContent = part.text;
        applyRarityText(span, part.rarity);
        rew.append(span);
      });

      card.append(head, desc, progEl, rew);
      container.append(card);
    }
  } else {
    // Tab "Đã hoàn thành": mỗi nhiệm vụ MỘT hàng gọn (bấm mới mở mô tả) để chuỗi ~20 nhiệm vụ không dài hàng chục màn hình (M6 #409)
    const rows = doneRows(questLog.done, questLog.dailyDone);
    if (!rows.length) {
      const p = document.createElement("p");
      p.style.opacity = "0.7";
      p.style.padding = "16px";
      p.style.textAlign = "center";
      p.textContent = "Chưa hoàn thành nhiệm vụ nào.";
      container.append(p);
      return;
    }
    const summary = document.createElement("p");
    summary.className = "q-done-summary";
    summary.textContent = doneSummary(rows);
    container.append(summary);
    for (const row of rows) {
      const box = document.createElement("div");
      box.className = "q-row";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "q-row-btn";
      btn.setAttribute("aria-expanded", "false");

      const title = document.createElement("span");
      title.className = "q-row-title";
      title.textContent = row.title;
      const badge = document.createElement("span");
      badge.className = "qt-badge";
      badge.textContent = row.daily ? "Xong hôm nay" : row.side ? "Việc phụ" : "Đã xong";
      const chev = document.createElement("span");
      chev.className = "q-row-chev";
      chev.setAttribute("aria-hidden", "true");
      chev.textContent = "▸";
      btn.append(title, badge, chev);

      const desc = document.createElement("div");
      desc.className = "q-row-desc";
      desc.textContent = row.desc;
      desc.hidden = true;

      btn.addEventListener("click", () => {
        const open = desc.hidden;
        desc.hidden = !open;
        box.classList.toggle("open", open);
        btn.setAttribute("aria-expanded", open ? "true" : "false");
      });

      box.append(btn, desc);
      container.append(box);
    }
  }
}

// ---------- Bảng nhân vật & Trang bị (Phím C - #31) ----------

/** Bấm ô TRỐNG: nhảy tới món hợp ô đó trong danh sách túi (cuộn + focus nút Mặc), không có thì nói rõ để khỏi mò. */
function focusBagItemFor(slot: EquipSlot) {
  const btn = $("char-bag-equips").querySelector<HTMLElement>(
    `.char-bag-item[data-slot="${slot}"] .char-equip-btn`,
  );
  if (btn) {
    btn.scrollIntoView({ block: "nearest" });
    btn.focus();
    return;
  }
  ui.toast({ text: `Trong túi chưa có đồ cho ô ${EQUIP_SLOT_NAMES[slot]}`, tone: "info" });
}

function renderCharModal() {
  withFocusKept($("char-modal"), renderCharModalImpl);
}

function renderCharModalImpl() {
  const slotsBox = $("char-equip-slots");
  slotsBox.replaceChildren();

  for (const v of slotViews(currentEquip, currentRealm)) {
    const { slot, def } = v;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `equip-slot-card${def ? " filled" : v.locked ? " locked" : " empty"}`;
    btn.setAttribute("aria-label", v.aria);
    if (def) {
      btn.style.borderColor = rarityStyle(def.rarity).color;
      applyRarityBadge(btn, def.rarity);
    }

    const slotLabel = document.createElement("span");
    slotLabel.className = "slot-label";
    slotLabel.textContent = v.label;

    const icon = document.createElement("i");
    icon.className = "slot-icon";
    if (v.locked)
      icon.innerHTML = lockIconSvg(); // SVG tĩnh của mình (không có dữ liệu người dùng)
    else applyItemVisual(icon, def);

    const itemName = document.createElement("span");
    itemName.className = "slot-item-name";
    if (def) {
      itemName.textContent = def.name;
      itemName.style.color = rarityStyle(def.rarity).color;
    } else {
      itemName.textContent = v.locked ? "Đã khoá" : "Trống";
      itemName.style.opacity = "0.5";
    }

    const hint = document.createElement("span");
    hint.className = "slot-hint";
    if (def?.equip) {
      const statsText = describeEquipStats(def.equip.stats);
      // Pháp bảo không có chỉ số: thẻ nhỏ không chứa nổi câu nội tại, đặt đầy đủ ở `title` / aria
      hint.textContent = `${def.equip.treasure && statsText === NO_STATS_TEXT ? "Có nội tại" : statsText} · Chạm tháo`;
      const full = describeEquipStats(def.equip.stats, def.equip.treasure);
      btn.title = `${def.name}: ${full}`;
      btn.setAttribute("aria-label", `${v.aria}. ${full}`);
    } else {
      hint.textContent = v.lockText ?? "Chưa trang bị";
    }

    btn.append(slotLabel, icon, itemName, hint);
    // Khoá: vẫn focus được (là <button>, không `disabled`) để người dùng bàn phím / đọc màn hình nghe lý do; `aria-disabled` báo rõ chưa dùng được
    if (v.locked) btn.setAttribute("aria-disabled", "true");
    btn.dataset.nav = `eq:${slot}`;
    onPress(btn, () => {
      if (def) {
        sound.equip();
        callbacks?.onUnequip(slot);
      } else if (v.locked) {
        ui.toast({ text: v.lockText ?? "Ô này chưa mở", tone: "info" });
      } else {
        focusBagItemFor(slot);
      }
    });
    slotsBox.append(btn);
  }

  // Bảng chỉ số tổng hợp tính từ statsFor(realm, tier, equipment)
  const statsBox = $("char-stats");
  statsBox.replaceChildren();

  const curStats = statsFor(currentRealm, currentTier, currentEquip);
  const bonus = equipBonus(currentEquip, currentRealm); // ô chưa mở không cộng (khớp statsFor)

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

  // Ba chỉ số % mới (M7.4): số lấy từ statsFor (đã kẹp), trần từ STAT_CAPS; mũi tên ▲ / ▼ kèm số, không chỉ màu
  for (const r of pctRows(curStats, previewStats, previewDef?.equip?.stats)) {
    const row = document.createElement("div");
    row.className = "stat-row pct";
    row.dataset.stat = r.key;
    row.setAttribute("aria-label", r.aria);
    const lbl = document.createElement("span");
    lbl.className = "stat-label";
    lbl.textContent = r.label;
    const valWrap = document.createElement("span");
    valWrap.className = `stat-val${r.atCap ? " at-cap" : ""}`;
    valWrap.textContent = r.valueText;
    if (r.diffText) {
      const d = document.createElement("span");
      d.className = `stat-diff ${r.maxed ? "maxed" : (r.diff ?? 0) > 0 ? "up" : "down"}`;
      d.textContent = r.diffText;
      valWrap.append(d);
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
    row.dataset.slot = eq.slot;

    const left = document.createElement("div");
    left.className = "char-bag-left";

    const icon = document.createElement("i");
    icon.className = "slot-icon";
    applyItemVisual(icon, def);

    const meta = document.createElement("div");
    meta.className = "char-bag-meta";

    const nameEl = document.createElement("b");
    nameEl.textContent = `${def.name} · ${EQUIP_SLOT_NAMES[eq.slot]}`;
    applyRarityText(nameEl, def.rarity);

    const cmpLine = document.createElement("small");
    const nextStats = statsFor(currentRealm, currentTier, {
      ...currentEquip,
      [eq.slot]: def.id,
    });
    const deltas = statDeltas(curStats, nextStats);
    const slotLock = slotLockText(eq.slot, currentRealm);
    for (const x of deltas) {
      if (cmpLine.childNodes.length > 0) cmpLine.append(document.createTextNode(" · "));
      const sp = document.createElement("span");
      sp.className = x.d > 0 ? "cmp-up" : "cmp-down";
      sp.textContent = `${x.d > 0 ? "▲" : "▼"} ${deltaText(x)}`;
      cmpLine.append(sp);
    }
    if (deltas.length === 0 && !slotLock) {
      const sp = document.createElement("span");
      sp.className = "cmp-eq";
      sp.textContent = "Ngang bằng món đang mặc";
      cmpLine.append(sp);
    }

    const ok = canEquip(def.id, currentRealm, currentTier) && !slotLock;
    const reqText = slotLock ?? `Cần ${realmLabel(eq.reqRealm, eq.reqTier)}`;
    if (!ok) {
      if (cmpLine.childNodes.length > 0) cmpLine.append(document.createTextNode(" · "));
      const reqWarn = document.createElement("span");
      reqWarn.className = "req-warn";
      reqWarn.textContent = reqText;
      cmpLine.append(reqWarn);
    }

    meta.append(nameEl, cmpLine);
    left.append(icon, meta);

    const equipBtn = document.createElement("button");
    equipBtn.type = "button";
    equipBtn.className = "char-equip-btn";
    equipBtn.disabled = !ok;
    equipBtn.textContent = ok ? "Mặc" : reqText;
    equipBtn.dataset.nav = `bag:${i}`;
    onPress(
      equipBtn,
      () => {
        if (!ok) return;
        sound.equip();
        callbacks?.onEquip(i);
      },
      true,
    );

    // Xem so sánh trang bị: bấm / chạm hàng (bấm lần nữa để tắt). KHÔNG đổi theo rê chuột (cùng lỗi túi đồ, QUYET_DINH_M3 mục 24: hover chỉ làm sáng).
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
    p.style.fontSize = "var(--fs-12)";
    p.style.margin = "6px 0";
    p.style.textAlign = "center";
    p.textContent =
      "Trong túi chưa có trang bị nào. Hãy gặp Thợ rèn Thiết Ngưu ở phía đông Lạc Hà Trấn để rèn bảo khí.";
    bagList.append(p);
  }
}

// ---------- Giao diện rèn đồ ở Thợ rèn (#32) ----------

function renderForgeModal() {
  withFocusKept($("forge-modal"), renderForgeModalImpl);
}

function renderForgeModalImpl() {
  const npc = NPC_BY_ID[forgeNpcId];
  // Tiêu đề, dòng phụ và nút theo TRẠM của NPC (#514): Lò Rèn / Lò Đan / Bàn Phù, chữ từ `CRAFT_STATIONS` (shared); NPC cũ không có `station` = Lò Rèn
  $("forge-title").textContent = craftTitle(npc);
  $("forge-sub").textContent = craftSubtitle(npc);
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
    applyRarityText(nameEl, outDef.rarity);

    const statLine = document.createElement("small");
    if (outDef.equip) {
      const slotName = EQUIP_SLOT_NAMES[outDef.equip.slot];
      const statsStr = describeEquipStats(outDef.equip.stats, outDef.equip.treasure);
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

    // Phí Linh thạch (M6): chip "Linh thạch có/cần" như nguyên liệu; thiếu tiền thì nút Rèn tắt (server cũng từ chối)
    const fee = recipeFee(rec.coin);
    if (fee > 0) {
      const enoughCoin = canAffordFee(fee, currentCoin);
      if (!enoughCoin) canCraft = false;
      const feeChip = document.createElement("span");
      feeChip.className = `forge-mat forge-fee ${enoughCoin ? "ok" : "missing"}`;
      feeChip.textContent = feeChipText(fee, currentCoin);
      feeChip.title = `Phí rèn: ${fee.toLocaleString("vi-VN")} ${CURRENCY_NAME}`;
      matsRow.append(feeChip);
    }

    const forgeBtn = document.createElement("button");
    forgeBtn.type = "button";
    forgeBtn.className = "forge-btn";
    forgeBtn.disabled = !canCraft;
    forgeBtn.textContent = craftButtonText(npc);
    if (fee > 0)
      forgeBtn.title = craftFeeHint(npc, `${fee.toLocaleString("vi-VN")} ${CURRENCY_NAME}`);
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
/** Số lượng định bán theo `ô:món` (không chỉ theo ô: ô đổi sang món khác thì không thừa kế số lượng của món cũ) */
const shopSellQuantities: Record<string, number> = {};
let currentCoin = 0;

/**
 * Ô SỐ LƯỢNG của một thẻ cửa hàng NPC (mục 47): ô gõ số dùng chung (− / +, ×10 / ×100, Tối đa, giữ nút tăng nhanh dần, Enter xác nhận).
 * Cả danh sách vẽ lại khi ví / túi đổi nên số chọn nhớ trong `store[key]` (chỉ ghi số HỢP LỆ: đang gõ dở / ô trống thì giữ số cũ); vẽ lại xong, ô dựng lại từ số đó.
 * Đổi số chỉ cập nhật nút Mua / Bán tại chỗ (`onQty`), KHÔNG vẽ lại cả danh sách: vẽ lại sẽ làm mất con trỏ đang gõ. `nav` giữ `data-nav` cho điều hướng bằng mũi tên và
 * `withFocusKept`; `onConfirm` = Enter trong ô (gọi nút Mua / Bán của chính thẻ).
 */
function createShopQty(args: {
  idKey: string;
  nav: string;
  store: Record<string, number>;
  key: string;
  max: number;
  label: string;
  preview: (q: number) => string;
  onQty: () => void;
  onConfirm: () => void;
}): QtyStepper {
  const max = Math.max(1, Math.floor(args.max));
  // `createQtyStepper` báo `onChange` ngay lúc dựng (số khởi đầu): chỉ chuyển tiếp cho nơi dùng SAU khi dựng xong (nơi dùng còn chưa có ô để đọc)
  let ready = false;
  const stepper = createQtyStepper({
    label: args.label,
    max,
    initial: Math.min(max, Math.max(1, args.store[args.key] ?? 1)),
    ids: { input: `shop-qty-${args.idKey}` },
    preview: args.preview,
    onChange: (q) => {
      if (q !== null) args.store[args.key] = q;
      if (ready) args.onQty();
    },
    onConfirm: args.onConfirm,
  });
  ready = true;
  const q0 = stepper.getQty();
  if (q0 !== null) args.store[args.key] = q0; // đã kẹp theo giới hạn hiện tại (ví / số đang có đổi)
  const btns = stepper.el.querySelectorAll("button"); // thứ tự của `qty-stepper`: − + ×10 ×100 Tối đa
  btns[0]!.dataset.nav = `${args.nav}:minus`;
  btns[1]!.dataset.nav = `${args.nav}:plus`;
  stepper.el.querySelector("input")!.dataset.nav = `${args.nav}:input`;
  return stepper;
}

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
  withFocusKept($("shop-modal"), renderShopBuyImpl);
}

function renderShopBuyImpl() {
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
    // giới hạn = trần một lần của máy chủ, kẹp theo ví (tối thiểu 1: ví không đủ cả một cái thì nút Mua báo "Thiếu N")
    const maxBuyQty = buyQtyMax(currentCoin, unitPrice);

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
    name.textContent = def.name;
    applyRarityText(name, def.rarity);

    const priceTag = document.createElement("span");
    priceTag.className = "shop-price-tag";
    priceTag.textContent = `${unitPrice} 💎 / cái`;

    nameRow.append(name, priceTag);

    const desc = document.createElement("div");
    desc.className = "shop-item-desc";
    desc.textContent = def.desc;

    info.append(nameRow, desc);
    left.append(icon, info);

    // Cột phải: ô số lượng + nút mua
    const right = document.createElement("div");
    right.className = "shop-card-right";

    const buyBtn = document.createElement("button");
    buyBtn.type = "button";
    buyBtn.className = "shop-act-btn buy";
    const buyBtnText = document.createElement("span");
    buyBtn.append(buyBtnText);

    const qtyStepper = createShopQty({
      idKey: `mua-${itemId}`,
      nav: `buy:${itemId}`,
      store: shopBuyQuantities,
      key: itemId,
      max: maxBuyQty,
      label: `Số lượng ${def.name} muốn mua`,
      preview: (q) =>
        `Tổng ${(unitPrice * q).toLocaleString("vi-VN")} 💎, ví còn ${Math.max(0, currentCoin - unitPrice * q).toLocaleString("vi-VN")}.`,
      onQty: () => refreshBuyBtn(),
      onConfirm: () => buyBtn.click(),
    });
    /** Nút Mua theo số đang chọn: ô đang trống / sai thì mờ ("Nhập số lượng"), ví không đủ thì mờ kèm "Thiếu N 💎" */
    const refreshBuyBtn = () => {
      const q = qtyStepper.getQty();
      if (q === null) {
        buyBtn.disabled = true;
        buyBtnText.textContent = "Nhập số lượng";
        return;
      }
      const total = unitPrice * q;
      const canAfford = currentCoin >= total;
      buyBtn.disabled = !canAfford;
      buyBtnText.textContent = canAfford ? `Mua (${total} 💎)` : `Thiếu ${total - currentCoin} 💎`;
    };
    refreshBuyBtn();

    buyBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      // đọc lại chữ ĐANG có trong ô (không tin số cũ); trống / sai thì không mua, đưa focus về ô
      const qty = qtyStepper.read();
      if (qty === null) {
        ui.toast({ text: "Nhập số lượng từ 1 trở lên.", tone: "bad" });
        qtyStepper.focus();
        return;
      }
      if (currentCoin < unitPrice * qty) return;
      sound.pickup();
      callbacks?.onBuy?.(shopNpcId, itemId, qty);
    });

    right.append(qtyStepper.el, buyBtn);
    card.append(left, right);
    list.append(card);
  }
}

function renderShopSell() {
  withFocusKept($("shop-modal"), renderShopSellImpl);
}

function renderShopSellImpl() {
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

    // trần một lần của máy chủ (`SHOP_MAX_QTY`): ngăn xếp lớn hơn thì bán từng đợt
    const maxQty = sellQtyMax(slot.qty);
    const sellKey = `${i}:${slot.itemId}`;

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
    name.textContent = `${def.name} ×${slot.qty}`;
    applyRarityText(name, def.rarity);

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

    // Cột phải: ô số lượng + nút bán
    const right = document.createElement("div");
    right.className = "shop-card-right";

    if (canSell) {
      const sellBtn = document.createElement("button");
      sellBtn.type = "button";
      sellBtn.className = "shop-act-btn sell";
      const sellBtnText = document.createElement("span");
      sellBtn.append(sellBtnText);

      const qtyStepper = createShopQty({
        idKey: `ban-${i}`,
        nav: `sell:${i}`,
        store: shopSellQuantities,
        key: sellKey,
        max: maxQty,
        label: `Số lượng ${def.name} muốn bán`,
        preview: (q) =>
          `Nhận ${(unitPrice * q).toLocaleString("vi-VN")} 💎, ví lên ${(currentCoin + unitPrice * q).toLocaleString("vi-VN")}.`,
        onQty: () => refreshSellBtn(),
        onConfirm: () => sellBtn.click(),
      });
      /** Nút Bán theo số đang chọn: ô đang trống / sai thì mờ ("Nhập số lượng") */
      const refreshSellBtn = () => {
        const q = qtyStepper.getQty();
        sellBtn.disabled = q === null;
        sellBtnText.textContent = q === null ? "Nhập số lượng" : `Bán (+${unitPrice * q} 💎)`;
      };
      refreshSellBtn();

      sellBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        // click "ma" sau khi vừa xác nhận / giữ lại ở hộp (cảm ứng): không mở lại hộp, không bán lần nữa
        if (ghostClick(e)) return;
        // đọc lại chữ ĐANG có trong ô (không tin số cũ); trống / sai thì không bán, đưa focus về ô
        const qty = qtyStepper.read();
        if (qty === null) {
          ui.toast({ text: "Nhập số lượng từ 1 trở lên.", tone: "bad" });
          qtyStepper.focus();
          return;
        }
        // Đồ quý / trang bị: hộp xác nhận (issue #779); đồ thường bán thẳng
        const plan = sellPlan(invSlots, i, qty, unitPrice, {
          name: def.name,
          type: def.type,
          rarity: def.rarity,
          rarityName: rarityStyle(def.rarity).name,
        });
        if (!plan) {
          sound.pickup();
          callbacks?.onSell?.(shopNpcId, i, qty);
          return;
        }
        const npc = shopNpcId;
        askActConfirm(
          plan.spec,
          () => {
            // túi có thể đổi trong lúc hộp mở (nhặt, dùng, máy chủ gửi lại): kiểm lại ĐÚNG món + số lượng, không bán món khác
            if (!sellStillValid(invSlots, plan)) {
              ui.toast({ text: "Túi vừa đổi, chưa bán gì. Hãy chọn lại món.", tone: "info" });
              renderShopSell();
              return;
            }
            sound.pickup();
            callbacks?.onSell?.(npc, plan.index, plan.qty);
          },
          sellBtn,
        );
        actConfirmFromShop = true;
      });

      right.append(qtyStepper.el, sellBtn);
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

  let idxOpt = -1;
  for (const opt of currentDialog.options) {
    idxOpt++;
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
    // nhãn số (máy tính, CSS ẩn trên cảm ứng): phím 1-9 chọn dòng này
    if (idxOpt < 9) {
      const key = document.createElement("kbd");
      key.className = "opt-key";
      key.setAttribute("aria-hidden", "true");
      key.textContent = String(idxOpt + 1);
      btn.append(key);
    }
    btn.append(labelSpan);

    const tagInfo = optionTag(
      opt.action.kind,
      opt.label,
      !!opt.disabled,
      opt.action.kind === "forge" ? opt.action.station : undefined, // Lò đan / Bàn phù (#514); thiếu = Lò rèn
    );
    if (tagInfo) {
      const tag = document.createElement("small");
      tag.textContent = tagInfo.text;
      tag.style.color = tagInfo.color;
      btn.append(tag);
    }

    // `click` chứ không `pointerdown`: danh sách lựa chọn có thể cuộn trong hộp (điện thoại ngang), ngón vuốt không được kích hoạt lựa chọn
    btn.addEventListener("click", () => {
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
// Nút "Dùng" của đan / phù gắn trạng thái (#514, issue #769): cần biết trạng thái đang có + tu vi hiện tại để làm mờ đúng lúc
let activeStatusIds: ReadonlySet<string> = new Set();
let activeStatusKey = "";
let currentExp = 0;
let currentExpMax = 1;
const cachedBarPct: Record<string, number> = {};
const cachedBarText: Record<string, string> = {};
const cachedCooldownFrac: Record<string, number> = {};

// ---------- Bảng Công pháp (M7.6, #507) ----------

function renderSkillsModal() {
  withFocusKept($("skills-modal"), renderSkillsModalImpl);
}

/** Chiêu đang mở chi tiết (mỗi lúc một hàng, `null` = gập hết). Đóng bảng thì gập lại để lần mở sau luôn là danh sách gọn. */
let skillsOpenId: string | null = null;

/** Mở chi tiết hàng `id` (gập hàng khác), `null` = gập hết. Chỉ đổi thuộc tính của các hàng đã vẽ: không dựng lại nên focus bàn phím giữ nguyên. */
function setSkillsOpen(list: HTMLElement, id: string | null, scroll: boolean) {
  skillsOpenId = id;
  for (const r of list.querySelectorAll<HTMLElement>(".sk-row")) {
    const on = r.dataset.skill === id;
    r.classList.toggle("open", on);
    r.querySelector(".sk-line")?.setAttribute("aria-expanded", String(on));
    const d = r.querySelector<HTMLElement>(".sk-detail");
    if (d) d.hidden = !on;
    if (on && scroll) {
      // đưa hàng vừa mở lên đầu vùng cuộn khi chi tiết bị cắt (hàng dài hơn phần còn thấy bên dưới)
      const lr = list.getBoundingClientRect();
      const rr = r.getBoundingClientRect();
      if (rr.bottom > lr.bottom || rr.top < lr.top) list.scrollTop += rr.top - lr.top;
    }
  }
}

/**
 * Một chiêu = MỘT hàng gọn (biểu tượng + tên + hệ + ô đang giữ, cao >= 44 px); bấm / Enter mở chi tiết ngay dưới hàng: hàng nút gắn ô / gỡ TRƯỚC (điện thoại ngang
 * chỉ còn ~180 px cho danh sách: nút phải thấy ngay, không phải cuộn qua số liệu), rồi số thật, hiệu ứng, mô tả, kinh quyển. Mũi tên + Enter đi theo hình học (`panel-nav.ts`), Delete trên bất kỳ nút nào của chiêu gỡ chiêu khỏi ô đang giữ.
 */
/**
 * Đoạn luyện chiêu của một hàng: dòng chữ + (khi còn luyện được) thanh tiến độ `role=progressbar`. Chữ trên màn hình ẩn với trình đọc màn hình (nhãn của thanh đã đọc
 * đủ điểm / điểm cần), tránh đọc hai lần; dòng chữ không có thanh (tầng cuối / tối đa) thì để nguyên cho trình đọc.
 */
function masteryEl(m: MasteryView): HTMLElement {
  const box = document.createElement("div");
  box.className = "sk-mastery";
  const text = document.createElement("small");
  text.className = "sk-mastery-text";
  text.textContent = m.text;
  box.append(text);
  if (m.kind === "bar") {
    text.setAttribute("aria-hidden", "true");
    const bar = document.createElement("div");
    bar.className = "sk-mastery-bar";
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", String(m.need));
    bar.setAttribute("aria-valuenow", String(m.points));
    bar.setAttribute("aria-label", m.aria);
    const fill = document.createElement("div");
    fill.className = "sk-mastery-fill";
    fill.style.width = `${m.percent}%`;
    bar.append(fill);
    box.append(bar);
  }
  return box;
}

function skillRowEl(row: SkillRow): HTMLElement {
  const el = document.createElement("div");
  el.className = `sk-row${row.slotNow !== null ? " equipped" : ""}`;
  el.dataset.skill = row.id;

  const detailId = `sk-detail-${row.id}`;
  const line = document.createElement("button");
  line.type = "button";
  line.className = "sk-line";
  line.dataset.nav = `skillrow:${row.id}`;
  line.setAttribute("aria-expanded", "false");
  line.setAttribute("aria-controls", detailId);
  line.setAttribute("aria-label", row.aria);
  const ico = document.createElement("span");
  ico.className = "sk-row-ico skico";
  ico.setAttribute("aria-hidden", "true");
  // vẽ từ DỮ LIỆU CỦA HÀNG (phong cách / phẩm đã suy bằng hàm của shared, hệ), không tra lại bảng chiêu: chiêu giả của chế độ mock và chiêu mới chưa vào bảng vẫn có hình
  ico.innerHTML = skillIconSvg({
    shape: undefined,
    style: row.style,
    grade: row.grade,
    element: row.elementId,
  });
  ico.style.setProperty("--si-c", elementColor(row.elementId));
  const main = document.createElement("span");
  main.className = "sk-line-main";
  const name = document.createElement("b");
  name.className = "sk-row-name";
  name.textContent = row.name;
  const gr = document.createElement("span");
  gr.className = `sk-grade g${row.grade}`;
  gr.textContent = row.gradeName;
  name.append(gr);
  const sub = document.createElement("small");
  sub.className = "sk-row-tag";
  sub.textContent = row.sub;
  if (row.need) {
    const need = document.createElement("span");
    need.className = "sk-row-need";
    need.textContent = ` · ${row.need}`;
    sub.append(need);
  }
  main.append(name, sub);
  const badge = document.createElement("span");
  badge.className = `sk-row-badge${row.slotNow === null ? " none" : ""}`;
  badge.textContent = row.slotLabel;
  const chev = document.createElement("span");
  chev.className = "sk-line-chev";
  chev.setAttribute("aria-hidden", "true");
  chev.textContent = "▾";
  line.append(ico, main, badge, chev);
  line.addEventListener("click", () => {
    const list = el.parentElement;
    if (list) setSkillsOpen(list, nextOpenSkill(skillsOpenId, row.id), true);
  });
  el.append(line);

  const detail = document.createElement("div");
  detail.className = "sk-detail";
  detail.id = detailId;
  detail.hidden = true;

  const kind = document.createElement("small");
  kind.className = "sk-row-tag sk-row-kind";
  kind.textContent = [row.element && `Hệ ${row.element}`, row.shape].filter(Boolean).join(" · ");
  const pips = document.createElement("span");
  pips.className = "sk-row-pips";
  pips.textContent = ` ${row.pips}`;
  pips.setAttribute("aria-label", `Tầng ${row.level} trên ${row.maxLevel}`);
  kind.append(pips);
  detail.append(kind);
  if (row.mastery !== null) detail.append(masteryEl(row.mastery));

  const actions = document.createElement("div");
  actions.className = "sk-row-actions";
  actions.setAttribute("role", "group");
  actions.setAttribute("aria-label", `Gắn ${row.name} vào ô chiêu thức`);
  for (const s of row.slots) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `sk-slot-btn${s.here ? " here" : ""}${s.open ? "" : " locked"}`;
    b.textContent = s.label;
    b.title = s.aria;
    b.setAttribute("aria-label", s.aria);
    b.setAttribute("aria-pressed", String(s.here));
    if (!s.open) b.setAttribute("aria-disabled", "true"); // vẫn focus được để nghe lý do; bấm chỉ báo, không gửi
    b.dataset.nav = `skillslot:${row.id}:${s.slot}`;
    b.addEventListener("click", () => {
      if (s.blocked) {
        ui.toast({ text: s.blocked, tone: "info" });
        return;
      }
      if (s.here) return;
      callbacks?.onSkillSlot?.(s.slot, row.id);
    });
    actions.append(b);
  }
  if (row.unequip !== null) {
    const slot = row.slotNow!;
    const u = document.createElement("button");
    u.type = "button";
    u.className = "sk-slot-btn unequip";
    u.textContent = "Gỡ";
    u.title = row.unequip;
    u.setAttribute("aria-label", `${row.unequip} (Phím Delete)`);
    u.dataset.nav = `skillunequip:${row.id}`;
    u.addEventListener("click", () => callbacks?.onSkillSlot?.(slot, ""));
    actions.append(u);
  }
  detail.append(actions);
  const lines = document.createElement("ul");
  lines.className = "sk-row-stats";
  for (const t of [...row.stats, ...row.effects]) {
    const li = document.createElement("li");
    li.textContent = t;
    lines.append(li);
  }
  detail.append(lines);

  const desc = document.createElement("p");
  desc.className = "sk-row-desc";
  desc.textContent = row.desc;
  const book = document.createElement("small");
  book.className = "sk-row-book";
  book.textContent = `Kinh quyển: ${row.book}`;
  detail.append(desc, book);

  el.append(detail);
  // Delete / Backspace trên hàng hoặc bất kỳ nút nào trong chi tiết: gỡ chiêu khỏi ô đang giữ (bàn phím, không cần mở chi tiết tìm nút Gỡ)
  el.addEventListener("keydown", (e) => {
    if ((e.key !== "Delete" && e.key !== "Backspace") || e.repeat || row.slotNow === null) return;
    e.preventDefault();
    callbacks?.onSkillSlot?.(row.slotNow, "");
  });
  return el;
}

/** Chỉ hiện thanh lọc / tìm khi sổ chiêu đủ dài để cần (người mới 3-7 chiêu không bị rối thêm). */
const SKILL_FILTER_MIN = 8;
/** Bộ lọc + cách xếp của sổ chiêu: sống trong lúc bảng mở, đóng bảng thì về mặc định (lần mở sau luôn thấy ĐỦ chiêu). */
let skillFilter: SkillFilter = { ...DEFAULT_SKILL_FILTER };
let skillSort: SkillSort = "slot";
/** Chữ ký các lựa chọn hệ đã dựng ("hoa:5|kim:3"): chỉ dựng lại `<select>` khi đổi (dựng lại lúc người chơi đang chọn làm đóng danh sách thả). */
let skillElSig = "";

function resetSkillFilter() {
  skillFilter = { ...DEFAULT_SKILL_FILTER };
  skillSort = "slot";
  skillElSig = "";
}

/** Đưa bộ lọc đang giữ lên các điều khiển (sau khi dựng lại lựa chọn hệ, hoặc bấm "Bỏ lọc"). */
function syncSkillFilterControls() {
  const q = $("skills-q") as HTMLInputElement | null;
  if (q && q.value !== skillFilter.q) q.value = skillFilter.q;
  const set = (id: string, v: string) => {
    const el = $(id) as HTMLSelectElement | null;
    if (el && el.value !== v) el.value = v;
  };
  set("skills-el", skillFilter.element);
  set("skills-gr", skillFilter.grade === null ? "all" : String(skillFilter.grade));
  set("skills-sl", skillFilter.slot);
  set("skills-sort", skillSort);
  const u = $("skills-usable") as HTMLInputElement | null;
  if (u) u.checked = skillFilter.usable;
}

/** Dựng lại lựa chọn hệ theo các hệ CÓ chiêu (kèm số chiêu). Hệ đang chọn mà không còn chiêu thì về "Mọi hệ". */
function buildSkillElementOptions(rows: readonly SkillRow[]) {
  const sel = $("skills-el") as HTMLSelectElement | null;
  if (!sel) return;
  const counts = elementCounts(rows);
  const names = new Map<string, string>();
  for (const r of rows) names.set(r.elementId, r.element || "Vô hệ");
  const sig = [...counts].map(([id, n]) => `${id}:${n}`).join("|");
  if (sig === skillElSig) return;
  skillElSig = sig;
  if (skillFilter.element !== "all" && !counts.has(skillFilter.element))
    skillFilter.element = "all";
  sel.replaceChildren();
  const add = (value: string, label: string) => {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = label;
    sel.append(o);
  };
  add("all", "Mọi hệ");
  for (const [id, n] of counts) add(id, `${names.get(id) ?? id} (${n})`);
  syncSkillFilterControls();
}

/** Vẽ DANH SÁCH hàng (không đụng thanh lọc, để ô tìm giữ nguyên con trỏ khi gõ). */
function renderSkillsList() {
  const list = $("skills-list");
  if (!list || !skillsModel) return;
  const all = skillsModel.rows;
  const bar = all.length >= SKILL_FILTER_MIN;
  const shown = bar ? sortSkills(filterSkills(all, skillFilter), skillSort) : all;
  const active = bar && skillFilterActive(skillFilter);
  // số chiêu ở dòng phụ của tiêu đề (aria-live): "Hiện 5 / 60 chiêu" khi đang lọc, không thì "60 chiêu đã học"
  const countEl = $("skills-count");
  if (countEl) {
    countEl.textContent = active
      ? skillFilterSummary(shown.length, all.length, true)
      : skillsModel.count;
  }
  const clear = $("skills-filter-clear");
  if (clear) clear.hidden = !active;
  const nomatch = $("skills-nomatch");
  if (nomatch) nomatch.hidden = !(bar && all.length > 0 && shown.length === 0);
  list.replaceChildren();
  for (const row of shown) list.append(skillRowEl(row));
  setSkillsOpen(list, resolveOpenSkill(skillsOpenId, shown), false);
}

function renderSkillsModalImpl() {
  const list = $("skills-list");
  const emptyEl = $("skills-empty");
  const countEl = $("skills-count");
  if (!list || !skillsModel) return;
  if (countEl) countEl.textContent = skillsModel.count;
  if (emptyEl) {
    emptyEl.hidden = skillsModel.empty === null;
    if (skillsModel.empty !== null) emptyEl.textContent = skillsModel.empty;
  }
  const filterEl = $("skills-filter");
  const showBar = skillsModel.empty === null && skillsModel.rows.length >= SKILL_FILTER_MIN;
  if (filterEl) filterEl.hidden = !showBar;
  $("skills-modal").classList.toggle("sk-has-filter", showBar);
  if (!showBar) {
    // sổ chiêu ngắn lại dưới ngưỡng (kiếp mới): bỏ lọc cũ để không ẩn mất chiêu mà không có nút nào gỡ
    resetSkillFilter();
    const nomatch = $("skills-nomatch");
    if (nomatch) nomatch.hidden = true;
  }
  list.replaceChildren();
  if (skillsModel.empty !== null) {
    const bag = document.createElement("button");
    bag.type = "button";
    bag.className = "sk-slot-btn";
    bag.textContent = "Mở Túi đồ";
    bag.dataset.nav = "skills:bag";
    bag.addEventListener("click", () => {
      ui.toggleSkillsModal(false);
      ui.toggleInventory(true);
    });
    list.append(bag);
    return;
  }
  if (showBar) buildSkillElementOptions(skillsModel.rows);
  renderSkillsList();
}

/** Nối ô tìm / lựa chọn lọc (một lần lúc dựng giao diện). Mọi giá trị đi qua `cleanSkillFilter` trước khi dùng. */
function bindSkillFilter() {
  const apply = (patch: Partial<SkillFilter>) => {
    skillFilter = cleanSkillFilter({ ...skillFilter, ...patch });
    renderSkillsList();
  };
  $("skills-q")?.addEventListener("input", (e) =>
    apply({ q: (e.target as HTMLInputElement).value }),
  );
  $("skills-q")?.addEventListener("keydown", (e) => {
    // Esc trong ô tìm: có chữ thì xoá chữ (không đóng bảng); hết chữ rồi thì bỏ focus khỏi ô để Esc đóng bảng như thường
    // (bộ xử lý Esc chung KHÔNG đóng bảng khi đang gõ trong ô nhập, nên ô rỗng mà không rời ô thì Esc vô tác dụng)
    if (e.key !== "Escape") return;
    if (skillFilter.q !== "") {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLInputElement).value = "";
      apply({ q: "" });
    } else {
      (e.target as HTMLInputElement).blur();
    }
  });
  $("skills-el")?.addEventListener("change", (e) =>
    apply({ element: (e.target as HTMLSelectElement).value }),
  );
  $("skills-gr")?.addEventListener("change", (e) => {
    const v = (e.target as HTMLSelectElement).value;
    apply({ grade: v === "all" ? null : Number(v) });
  });
  $("skills-sl")?.addEventListener("change", (e) =>
    apply({ slot: (e.target as HTMLSelectElement).value as SkillFilter["slot"] }),
  );
  $("skills-sort")?.addEventListener("change", (e) => {
    const v = (e.target as HTMLSelectElement).value;
    skillSort = v === "grade" || v === "name" ? v : "slot";
    renderSkillsList();
  });
  $("skills-usable")?.addEventListener("change", (e) =>
    apply({ usable: (e.target as HTMLInputElement).checked }),
  );
  $("skills-filter-toggle")?.addEventListener("click", () => {
    const more = $("skills-filter-more");
    const btn = $("skills-filter-toggle");
    if (!more || !btn) return;
    more.hidden = !more.hidden;
    btn.setAttribute("aria-expanded", String(!more.hidden));
  });
  $("skills-filter-clear")?.addEventListener("click", () => {
    skillFilter = { ...DEFAULT_SKILL_FILTER };
    syncSkillFilterControls();
    renderSkillsList();
    ($("skills-q") as HTMLInputElement | null)?.focus();
  });
}

// ---------- Luân hồi (M3.2) ----------
let activeLimboMsg: LimboMsg | null = null;
let activeSoulView: SoulView | null = null;
let selectedOrigin = DEFAULT_ORIGIN;
let selectedRelics: string[] = [];
/** Tập chiêu khắc chân linh người chơi đã chọn; `null` = chưa đụng tới bộ chọn (hiện chiêu đã khắc, KHÔNG gửi `engrave` khi đầu thai) */
let selectedEngrave: string[] | null = null;
/** Đã bấm "đầu thai" (đang chờ máy chủ): bỏ qua lần bấm thứ hai trong lúc chờ, máy chủ cũng bỏ tin thứ hai */
let rebirthBusy = false;
let rebirthBusyTimer: ReturnType<typeof setTimeout> | null = null;
const REBIRTH_BUSY_MS = 3000;
let limboBuyCb: ((id: string) => void) | null = null;
let limboRebirthCb: ((choice: RebirthChoice) => void) | null = null;

function renderLimboStoneList() {
  withFocusKept($("limbo-overlay"), renderLimboStoneListImpl);
}

function renderLimboStoneListImpl() {
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
    btn.dataset.nav = `stone:${def.id}`;

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
        btn.addEventListener("click", (e) => {
          // click "ma" sau khi vừa đóng hộp xác nhận (cảm ứng: hộp đóng ở pointerdown, click rơi xuống nút bên dưới): bỏ qua
          if (ghostClick(e)) return;
          const duyen = activeSoulView?.duyen ?? 0;
          const plan = unlockPlan(`${def.name} nấc ${currentLv + 1}`, cost, duyen);
          if (!plan) return;
          askActConfirm(
            plan.spec,
            () => {
              // chân linh có thể đổi trong lúc hộp mở: kiểm lại giá + Duyên, không trừ Duyên theo lời hỏi cũ
              const now = activeSoulView ? nextCost(activeSoulView, def.id) : null;
              if (!unlockStillValid(plan, now, activeSoulView?.duyen ?? 0)) {
                ui.toast({ text: "Chân linh vừa đổi, chưa mở gì. Hãy xem lại.", tone: "info" });
                renderLimboAll();
                return;
              }
              limboBuyCb?.(def.id);
            },
            btn,
          );
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
    btn.dataset.nav = `origin-buy:${o.id}`;
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
        btn.addEventListener("click", (e) => {
          if (ghostClick(e)) return; // click ma sau khi đóng hộp
          const duyen = activeSoulView?.duyen ?? 0;
          const plan = unlockPlan(`xuất thân ${o.name}`, o.cost, duyen);
          if (!plan) return;
          askActConfirm(
            plan.spec,
            () => {
              const owned = activeSoulView?.origins.includes(o.id) ?? false;
              if (!unlockStillValid(plan, owned ? null : o.cost, activeSoulView?.duyen ?? 0)) {
                ui.toast({ text: "Chân linh vừa đổi, chưa mở gì. Hãy xem lại.", tone: "info" });
                renderLimboAll();
                return;
              }
              limboBuyCb?.(`${ORIGIN_BUY_PREFIX}${o.id}`);
            },
            btn,
          );
        });
      }
    }
    item.append(btn);
    container.append(item);
  }
}

function renderLimboOrigins() {
  withFocusKept($("limbo-overlay"), renderLimboOriginsImpl);
}

function renderLimboOriginsImpl() {
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

    card.setAttribute("role", "radio");
    card.setAttribute("aria-checked", String(selectedOrigin === o.id));
    if (isAvailable) {
      // bàn phím (#463): thẻ là một ô chọn có tiêu điểm; Enter / Cách chọn, mũi tên đi giữa các thẻ (panel-nav)
      card.tabIndex = 0;
      card.dataset.nav = `origin:${o.id}`;
      card.addEventListener("click", () => {
        selectedOrigin = o.id;
        renderLimboOrigins();
      });
      card.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        if (!e.repeat) card.click();
      });
    } else {
      card.setAttribute("aria-disabled", "true");
    }

    container.append(card);
  }
}

function renderLimboRelics() {
  withFocusKept($("limbo-overlay"), renderLimboRelicsImpl);
}

function renderLimboRelicsImpl() {
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
    cb.dataset.nav = `relic:${itemId}`;
    cb.setAttribute("aria-label", itemName);
    // Cách đã bật / tắt ô tích sẵn; thêm Enter cho thống nhất với các thẻ khác (#463)
    cb.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (!e.repeat) cb.click();
    });
    item.append(cb);

    const nameSpan = document.createElement("span");
    nameSpan.textContent = itemName;
    if (itemDef?.rarity) {
      applyRarityText(nameSpan, itemDef.rarity);
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

function renderLimboEngrave() {
  withFocusKept($("limbo-overlay"), renderLimboEngraveImpl);
}

/** Bộ chọn khắc chân linh: tối đa `engraveSlotsOf` chiêu từ `LimboMsg.engravable`; mặc định hiện chiêu ĐÃ khắc (chưa đụng thì không gửi gì). */
function renderLimboEngraveImpl() {
  const container = $("limbo-engrave-list");
  const emptyEl = $("limbo-engrave-empty");
  const hintEl = $("limbo-engrave-hint");
  if (!container || !activeSoulView || !activeLimboMsg) return;

  const cap = engraveSlotsOf(activeSoulView.unlocks);
  const engravable = activeLimboMsg.engravable ?? [];
  const picked = effectiveEngrave(activeSoulView.engraved, selectedEngrave, engravable, cap);
  if (hintEl) hintEl.textContent = engraveHint(cap, picked.length);

  const emptyText = engraveEmptyText(cap, engravable.length);
  container.replaceChildren();
  if (emptyEl) {
    emptyEl.hidden = emptyText === null;
    if (emptyText !== null) emptyEl.textContent = emptyText;
  }
  if (emptyText !== null) return;

  for (const id of engravable) {
    const info = engraveItem(id);
    const isChecked = picked.includes(id);
    const canCheck = isChecked || picked.length < cap;

    const item = document.createElement("div");
    item.className = `relic-item engrave-item${isChecked ? " checked" : ""}${canCheck ? "" : " disabled"}`;

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = isChecked;
    cb.disabled = !canCheck;
    cb.dataset.nav = `engrave:${id}`;
    cb.setAttribute("aria-label", info.element ? `${info.name}, hệ ${info.element}` : info.name);
    // Cách đã bật / tắt ô tích sẵn; thêm Enter cho thống nhất với các thẻ khác (#463)
    cb.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (!e.repeat) cb.click();
    });
    item.append(cb);

    const nameSpan = document.createElement("span");
    nameSpan.className = "engrave-name";
    nameSpan.textContent = info.name;
    // màu theo hệ như biểu tượng ở thanh chiêu, sáng thêm tới khi đủ 4,5:1 trên nền mục đã chọn (Âm / Hỏa / Thủy / Thổ gốc chỉ 3,0-4,0; a11y, nit của A ở #550)
    nameSpan.style.color = readableOn(elementColor(info.def?.element), ENGRAVE_CHECKED_BG);
    item.append(nameSpan);
    if (info.element) {
      const tag = document.createElement("small");
      tag.className = "engrave-elem";
      tag.textContent = info.element;
      item.append(tag);
    }

    item.addEventListener("click", (e) => {
      e.preventDefault();
      if (!canCheck) return;
      selectedEngrave = toggleEngrave(picked, id, engravable, cap);
      renderLimboEngrave();
    });
    container.append(item);
  }
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
  renderLimboEngrave();
}

// ---------- Giao diện Tông môn (M3.6, #230) ----------

function renderSectMembersTab() {
  if (!currentSect) return;
  const list = $("sect-members-list");
  list.replaceChildren();

  const merged = mergeMemberPresence(currentSect.members, currentSectPresence);
  const summaryEl = $("sect-members-summary");
  if (summaryEl) {
    summaryEl.textContent = formatSectMembersSummary(
      merged.length,
      sectMembersCap(sectHall?.view.caps.members),
    );
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
    statusRow.textContent = sectMemberStatusText(m);

    info.append(titleRow, statusRow);
    // Công tích (M8.6): hiện cho từng thành viên có công tích (máy chủ chỉ gửi khi > 0)
    const meritText = sectMemberMeritText(m);
    if (meritText) {
      const meritRow = document.createElement("div");
      meritRow.className = "sect-member-merit";
      meritRow.textContent = meritText;
      info.append(meritRow);
    }
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
        // Giới hạn Trưởng lão theo CẤP TÔNG (3 ở cấp 1, tới 7 ở cấp 5): lấy từ ảnh chụp Nội vụ, không cứng 3 (máy chủ cho thăng tới mức này)
        const eldersCap = sectEldersCap(sectHall?.view.caps.elders);
        btnPromote.disabled = elderCount >= eldersCap;
        btnPromote.title =
          elderCount >= eldersCap ? `Đã tối đa ${eldersCap} Trưởng lão` : "Thăng làm Trưởng lão";
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
  withdrawStepper?.setMax(currentSect.coin); // ô rút quỹ kẹp theo quỹ hiện có
  depositStepper?.setMax(currentCoin);

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

// ---------- Kho đồ tông môn (mục 27, K4, #788) ----------

function fillVaultSlot(
  btn: HTMLButtonElement,
  slot: { itemId: string; qty: number } | null,
  selected: boolean,
) {
  const icon = btn.querySelector<HTMLElement>(".slot-icon");
  const nameEl = btn.querySelector<HTMLElement>(".slot-name");
  const qtyEl = btn.querySelector<HTMLElement>(".slot-qty");
  btn.classList.toggle("selected", selected);
  btn.setAttribute("aria-selected", String(selected));
  const def = slot ? ITEM_BY_ID[slot.itemId] : undefined;
  if (slot && def) {
    btn.style.borderColor = rarityStyle(def.rarity).color;
    if (icon) applyItemVisual(icon, def);
    if (nameEl) nameEl.textContent = def.name;
    btn.setAttribute("aria-label", itemAria(def, slot.qty));
    btn.title = slot.qty > 1 ? `${def.name} ×${slot.qty}` : def.name; // rê chuột chỉ hiện chú thích, KHÔNG chọn ô
    applyRarityBadge(btn, def.rarity);
    if (qtyEl) qtyEl.textContent = slot.qty > 1 ? `${slot.qty}` : "";
  } else {
    btn.style.borderColor = "rgba(243, 220, 160, 0.22)";
    if (icon) applyItemVisual(icon, undefined);
    if (nameEl) nameEl.textContent = "";
    btn.setAttribute("aria-label", "Ô trống");
    btn.removeAttribute("title");
    clearRarityBadge(btn);
    if (qtyEl) qtyEl.textContent = "";
  }
}

/** Số lượng tối đa chọn được cho ô đang chọn (0 nếu chưa chọn / ô trống). */
function vaultSelMax(): number {
  if (!vaultSel) return 0;
  const rank = currentSect?.myRank ?? null;
  if (vaultSel.from === "vault")
    return sectVault ? maxWithdrawQty(sectVault, rank, vaultSel.index) : 0;
  return maxDepositQty(invSlots, vaultSel.index);
}

/** Bỏ lựa chọn nếu ô đã chọn không còn gì (bị rút hết, đã góp hết) và kẹp số lượng vào [1, tối đa]. */
function reconcileVaultSelection() {
  if (!vaultSel) return;
  const max = vaultSelMax();
  if (max < 1) {
    vaultSel = null;
    resetVaultQty();
    return;
  }
  vaultStepper?.setMax(max); // kẹp số đang chọn theo giới hạn mới (kho / túi / hạn mức đổi)
  vaultQty = clampQty(vaultStepper?.getQty() ?? vaultQty, max) || 1;
}

/** Về số lượng 1 (đổi ô chọn, hết tông môn...): cả biến lẫn ô nhập. */
function resetVaultQty() {
  vaultQty = 1;
  vaultStepper?.setQty(1);
}

function renderSectVaultTab() {
  if (!currentSect) return;
  if (vaultRendering) return;
  vaultRendering = true;
  try {
    renderSectVaultTabImpl();
  } finally {
    vaultRendering = false;
  }
}

function renderSectVaultTabImpl() {
  if (!currentSect) return;
  const v = sectVault;
  const rank = currentSect.myRank;
  // số ô kho theo cấp tông (M8, `SectVaultView.unlocked`): lưới vẽ lại khi số ô đổi (lên cấp), chỉ vẽ ô ĐÃ MỞ + ghi chú ô còn khoá
  const wantCells = Math.max(SECT_VAULT_SLOTS, v?.slots.length ?? SECT_VAULT_SLOTS);
  if (vaultSlotEls.length !== wantCells) buildSectVaultGrids(wantCells);
  $("sect-vault-locked").textContent = v ? vaultLockedNote(v.slots.length) : "";
  reconcileVaultSelection();
  $("sect-vault-draw").textContent = v ? drawSummary(v, rank) : "Đang tải kho đồ…";
  const used = v ? v.slots.filter((x) => x !== null).length : 0;
  $("sect-vault-count").textContent = v ? `(${used} / ${v.slots.length} ô)` : "";
  for (let i = 0; i < vaultSlotEls.length; i++) {
    fillVaultSlot(
      vaultSlotEls[i],
      v?.slots[i] ?? null,
      vaultSel?.from === "vault" && vaultSel.index === i,
    );
  }
  for (let i = 0; i < vaultBagEls.length; i++) {
    fillVaultSlot(
      vaultBagEls[i],
      invSlots[i] ?? null,
      vaultSel?.from === "bag" && vaultSel.index === i,
    );
  }

  // thanh hành động: món đang chọn, số lượng, nút Góp / Rút, lý do không bấm được (bằng chữ)
  const selEl = $("sect-vault-sel");
  const qtyBox = $("sect-vault-qty-box");
  const act = $("sect-vault-act") as HTMLButtonElement;
  const why = $("sect-vault-why");
  if (!v || !vaultSel) {
    selEl.textContent = "Chưa chọn món nào.";
    qtyBox.hidden = true;
    act.textContent = "Chọn món";
    act.disabled = true;
    why.textContent = v ? vaultBlockText("no_selection") : "";
  } else {
    const isVault = vaultSel.from === "vault";
    const slot = isVault ? v.slots[vaultSel.index] : invSlots[vaultSel.index];
    const def = slot ? ITEM_BY_ID[slot.itemId] : undefined;
    const reason = isVault
      ? withdrawBlock(v, rank, vaultSel.index)
      : depositBlock(v, invSlots, vaultSel.index);
    const max = vaultSelMax();
    selEl.textContent = `${isVault ? "Trong kho" : "Trong túi"}: ${def?.name ?? "?"}${slot && slot.qty > 1 ? ` (có ${slot.qty})` : ""}`;
    qtyBox.hidden = max <= 1 || reason !== null;
    const typed = vaultStepper?.getQty() ?? null;
    act.textContent = vaultBusy ? "Đang xử lý…" : isVault ? "Rút" : "Góp";
    // ô số lượng đang trống / hỏng (và hiện ra) thì chưa bấm Góp / Rút được: nói rõ lý do bằng chữ
    const needQty = !qtyBox.hidden && typed === null;
    act.disabled = reason !== null || vaultBusy || needQty;
    why.textContent =
      reason !== null ? vaultBlockText(reason) : needQty ? "Nhập số lượng từ 1 trở lên." : "";
  }

  // chỉnh hạn mức: CHỈ Tông chủ (`canSect`); chọn sẵn giá trị hiện tại
  const policy = $("sect-vault-policy");
  const canPolicy = canSect("vaultPolicy", rank);
  policy.hidden = !canPolicy || !v;
  if (canPolicy && v) {
    const sel = $("sect-vault-policy-sel") as HTMLSelectElement;
    if (sel.options.length === 0) {
      for (const n of drawPerDayOptions()) {
        const o = document.createElement("option");
        o.value = String(n);
        o.textContent = n === 0 ? "0 (Đệ tử không rút được)" : `${n} lượt / ngày`;
        sel.append(o);
      }
    }
    if (document.activeElement !== sel) sel.value = String(v.drawPerDay);
  }

  // sổ kho đồ: mới nhất đứng đầu
  const logEl = $("sect-vault-log");
  logEl.replaceChildren();
  const log = v?.log ?? [];
  if (log.length === 0) {
    const empty = document.createElement("div");
    empty.className = "sect-empty-log";
    empty.textContent = "Chưa có ai góp hay rút đồ.";
    logEl.append(empty);
  } else {
    for (const e of log) {
      const item = document.createElement("div");
      item.className = `sect-log-item ${e.kind}`;
      item.textContent = vaultLogLine(e);
      logEl.append(item);
    }
  }
}

function endVaultBusy() {
  if (vaultBusyTimer) clearTimeout(vaultBusyTimer);
  vaultBusyTimer = null;
  if (!vaultBusy) return;
  vaultBusy = false;
  if (sectModalOpen && sectTab === "vault") renderSectVaultTab();
}

function selectVaultSlot(from: "vault" | "bag", index: number) {
  if (vaultSel?.from === from && vaultSel.index === index) return;
  vaultSel = { from, index };
  resetVaultQty();
  if (sectModalOpen && sectTab === "vault") renderSectVaultTab();
}

/** Gửi một kế hoạch góp / rút (sau hộp xác nhận nếu có). Khoá nút tới khi máy chủ trả lời (ảnh chụp kho mới hoặc toast từ chối). */
function sendVaultPlan(plan: VaultPlan) {
  vaultBusy = true;
  if (vaultBusyTimer) clearTimeout(vaultBusyTimer);
  vaultBusyTimer = setTimeout(endVaultBusy, VAULT_BUSY_MS);
  if (plan.type === "deposit")
    callbacks?.onSectVaultDeposit?.({ slot: plan.msg.slot, qty: plan.qty });
  else
    callbacks?.onSectVaultWithdraw?.({
      slot: plan.msg.slot,
      itemId: plan.itemId,
      qty: plan.qty,
    });
  renderSectVaultTab();
}

function runVaultAction() {
  if (vaultBusy || !vaultSel || !sectVault || !currentSect) return;
  const rank = currentSect.myRank;
  const plan =
    vaultSel.from === "vault"
      ? planWithdraw(sectVault, rank, vaultSel.index, vaultQty)
      : planDeposit(sectVault, invSlots, vaultSel.index, vaultQty);
  if (!plan) return;
  if (!plan.confirm) return sendVaultPlan(plan);
  askActConfirm(
    plan.confirm,
    () => {
      // ảnh chụp kho / túi có thể đổi trong lúc hộp mở: kiểm lại ĐÚNG món + số lượng, không gửi theo lời hỏi cũ
      if (!planStillValid(sectVault, invSlots, plan)) {
        ui.toast({ text: "Kho hoặc túi vừa đổi, chưa làm gì. Hãy chọn lại.", tone: "info" });
        renderSectVaultTab();
        return;
      }
      sendVaultPlan(plan);
    },
    $("sect-vault-act"),
  );
}

function buildSectVaultGrids(vaultCount: number = SECT_VAULT_SLOTS) {
  const make = (
    host: HTMLElement,
    count: number,
    from: "vault" | "bag",
    els: HTMLButtonElement[],
  ) => {
    host.replaceChildren();
    els.length = 0;
    for (let i = 0; i < count; i++) {
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
      btn.append(icon, name, qty);
      // CHỈ bấm chuột / chạm (`pointerdown`, nút chính) hoặc bàn phím (focus bằng mũi tên / Tab) mới CHỌN ô; rê chuột chỉ sáng ô bằng CSS và hiện chú thích (mục 24).
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        if (e.button !== 0) return;
        selectVaultSlot(from, i);
        // `preventDefault` ở trên chặn trình duyệt tự chuyển focus: tự chuyển, để ô được CHỌN và ô đang FOCUS (Enter chạy trên ô này) luôn là MỘT
        btn.focus({ preventScroll: true });
      });
      btn.addEventListener("focus", () => selectVaultSlot(from, i));
      btn.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        if (e.repeat) return;
        selectVaultSlot(from, i);
        runVaultAction();
      });
      els.push(btn);
      host.append(btn);
    }
  };
  make($("sect-vault-grid"), vaultCount, "vault", vaultSlotEls);
  make($("sect-vault-bag"), INVENTORY_SLOTS, "bag", vaultBagEls);
}

function endHallBusy() {
  if (hallBusyTimer) clearTimeout(hallBusyTimer);
  hallBusyTimer = null;
  if (!hallBusy.size) return;
  hallBusy.clear();
  if (sectModalOpen && sectTab === "hall") renderSectHallTab();
}

function beginHallBusy(key: string) {
  hallBusy.add(key);
  if (hallBusyTimer) clearTimeout(hallBusyTimer);
  hallBusyTimer = setTimeout(endHallBusy, HALL_BUSY_MS);
  if (sectModalOpen && sectTab === "hall") renderSectHallTab();
}

function hallUiState(): HallUiState {
  return {
    view: sectHall?.view ?? null,
    receivedAt: sectHall?.at ?? 0,
    nowClient: Date.now(),
    down: callbacks?.isSectDown?.() ?? false,
    busy: hallBusy,
    groupOpen: hallGroupOpen,
    buy:
      hallBuyOpen && hallBuyStepper ? { itemId: hallBuyOpen, stepperEl: hallBuyStepper.el } : null,
  };
}

/** Hàng cửa hàng tông đang mở khung mua nhiều (theo ảnh chụp mới nhất), hoặc `null` nếu hàng không còn / đã khoá / hết lượt. */
function hallBuyRow() {
  const v = sectHall?.view;
  if (!v || !hallBuyOpen) return null;
  const row = hallShopRows(v, { down: callbacks?.isSectDown?.() ?? false }).find(
    (r) => r.itemId === hallBuyOpen,
  );
  return row && row.maxBuy >= 1 ? row : null;
}

function closeHallBuy() {
  hallBuyOpen = null;
  if (sectModalOpen && sectTab === "hall") renderSectHallTab();
}

/** Mở / gấp khung "mua nhiều" của một hàng: một ô số lượng dùng chung, đặt lại về 1 mỗi lần mở sang hàng khác. */
function toggleHallBuy(itemId: string) {
  if (hallBuyOpen === itemId) return closeHallBuy();
  hallBuyOpen = itemId;
  const row = hallBuyRow();
  if (!row) {
    hallBuyOpen = null;
    return;
  }
  if (!hallBuyStepper) {
    hallBuyStepper = createQtyStepper({
      label: "Số lượng đổi ở cửa hàng tông môn",
      max: row.maxBuy,
      initial: 1,
      ids: { input: "sect-shop-qty" },
      preview: (q) => {
        const r = hallBuyRow();
        return r ? shopBuyPreviewText(q, r.cost, sectHall?.view?.me.contrib ?? 0) : "";
      },
      onConfirm: () => runHallBuy(),
      onCancel: () => closeHallBuy(),
    });
  }
  hallBuyStepper.setMax(row.maxBuy);
  hallBuyStepper.setQty(1);
  renderSectHallTab();
  hallBuyStepper.focus();
}

/** Xác nhận khung mua nhiều: đọc lại chữ trong ô (không tin số cũ), rồi gửi MỘT tin với số lượng đó (máy chủ vẫn kiểm lại tất cả). */
function runHallBuy() {
  const row = hallBuyRow();
  if (!row) return closeHallBuy();
  const qty = hallBuyStepper?.read() ?? null;
  if (qty === null) {
    ui.toast({ text: "Nhập số lượng từ 1 trở lên.", tone: "bad" });
    return;
  }
  beginHallBusy(`shop:${row.itemId}`);
  callbacks?.onSectShopBuy?.(row.itemId, qty);
  hallBuyOpen = null; // đóng khung ngay; ảnh chụp mới về thì vẽ lại số lượt còn
  if (sectModalOpen && sectTab === "hall") renderSectHallTab();
}

/**
 * Vẽ lại tab Nội vụ nhưng GIỮ focus và vùng chọn của ô số lượng mua nhiều: `renderHall` thay cả cây DOM nên phần tử ô bị gỡ ra rồi gắn lại, mà gỡ phần tử đang focus thì
 * mất focus (người chơi đang gõ dở sẽ bị ngắt mỗi khi ảnh chụp Nội vụ mới về).
 */
function renderSectHallTab() {
  const input = hallBuyOpen
    ? (document.getElementById("sect-shop-qty") as HTMLInputElement | null)
    : null;
  const keep = input !== null && document.activeElement === input;
  const from = keep ? input.selectionStart : null;
  const to = keep ? input.selectionEnd : null;
  renderSectHallTabImpl();
  if (keep && hallBuyOpen && input.isConnected) {
    input.focus();
    if (from !== null && to !== null) input.setSelectionRange(from, to);
  }
}

function renderSectHallTabImpl() {
  // khung mua nhiều: giới hạn theo ảnh chụp MỚI (cống hiến / lượt còn đổi); hàng khoá hoặc hết thì đóng khung
  if (hallBuyOpen) {
    const row = hallBuyRow();
    if (!row) hallBuyOpen = null;
    else hallBuyStepper?.setMax(row.maxBuy);
  }
  renderHall($("sect-tab-hall"), hallUiState(), {
    onAccept: (id) => {
      beginHallBusy(`quest:${id}`);
      callbacks?.onSectQuestAccept?.(id);
    },
    onTurnIn: (id) => {
      beginHallBusy(`quest:${id}`);
      callbacks?.onSectQuestTurnIn?.(id);
    },
    onBuy: (itemId) => {
      beginHallBusy(`shop:${itemId}`);
      callbacks?.onSectShopBuy?.(itemId);
    },
    onBuyMore: (itemId) => toggleHallBuy(itemId),
    onBuyConfirm: () => runHallBuy(),
    onBuyCancel: () => closeHallBuy(),
    onGroupToggle: (key, open, defaultOpen) => {
      // chỉ nhớ lựa chọn KHÁC mặc định (mặc định đổi theo cấp tông thì nhóm theo mặc định mới)
      if (open === defaultOpen) hallGroupOpen.delete(key);
      else hallGroupOpen.set(key, open);
    },
  });
}

/** Hẹn / bỏ hẹn giờ nền xin ảnh chụp Nội vụ mới khi qua mốc đặt lại (mỗi mốc MỘT lần, chung `hallRefreshedFor` với đồng hồ của tab nên không xin đôi). */
function scheduleHallRefresh() {
  if (hallResetTimer !== null) clearTimeout(hallResetTimer);
  hallResetTimer = null;
  if (!sectHall || !currentSect) return;
  const view = sectHall.view;
  hallResetTimer = setTimeout(
    () => {
      hallResetTimer = null;
      if (!currentSect || sectHall?.view.resetAt !== view.resetAt) return;
      if (hallRefreshedFor === view.resetAt) return;
      hallRefreshedFor = view.resetAt;
      callbacks?.onSectHallGet?.();
    },
    hallRefreshDelayMs(view, Date.now() - sectHall.at),
  );
}

/** Đồng hồ tab Nội vụ: chạy khi tab đang xem; qua mốc đặt lại thì xin ảnh chụp mới (một lần cho mỗi mốc). */
function syncHallClock() {
  const want = sectModalOpen && sectTab === "hall" && currentSect !== null;
  if (!want) {
    if (hallClock !== null) clearInterval(hallClock);
    hallClock = null;
    return;
  }
  if (hallClock !== null) return;
  hallClock = setInterval(() => {
    const view = sectHall?.view;
    if (!view) return;
    if (
      updateHallCountdown($("sect-tab-hall"), hallUiState()) &&
      hallRefreshedFor !== view.resetAt
    ) {
      hallRefreshedFor = view.resetAt;
      callbacks?.onSectHallGet?.();
    }
  }, 1000);
}

function renderSectModal() {
  withFocusKept($("sect-modal"), renderSectModalImpl);
}

function renderSectModalImpl() {
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
  $("sect-tab-btn-vault").classList.toggle("active", sectTab === "vault");
  $("sect-tab-btn-hall").classList.toggle("active", sectTab === "hall");

  $("sect-tab-overview").hidden = sectTab !== "overview";
  $("sect-tab-members").hidden = sectTab !== "members";
  $("sect-tab-treasury").hidden = sectTab !== "treasury";
  $("sect-tab-vault").hidden = sectTab !== "vault";
  $("sect-tab-hall").hidden = sectTab !== "hall";
  syncHallClock();

  if (sectTab === "overview") {
    $("sect-meta-tag").textContent = `[${currentSect.tag}]`;
    $("sect-meta-my-rank").textContent = formatSectRole(currentSect.myRank);
    // giới hạn thành viên theo cấp tông (M8): có ảnh chụp Nội vụ thì dùng, chưa có thì mức cấp 1
    $("sect-meta-member-count").textContent =
      `${currentSect.members.length} / ${sectMembersCap(sectHall?.view.caps.members)}`;
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
  } else if (sectTab === "vault") {
    renderSectVaultTab();
  } else if (sectTab === "hall") {
    renderSectHallTab();
  }
}

export interface ShowClientOutdatedOptions {
  message?: string;
  buttonLabel?: string;
}

let defaultOutdatedButtonLabel: string | null = null;

export const ui = {
  show() {
    $("ui").hidden = false;
    $("login").hidden = true;
    this.showNewbieGuide();
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
      // LỖI TÚI ĐỒ (QUYET_DINH_M3 mục 24): trước đây `pointerenter` (rê chuột) cũng đổi ô ĐƯỢC CHỌN, nên bấm món rồi rê chuột sang nút Vứt (đi ngang các ô khác)
      // thì Vứt rơi vào món cuối cùng chuột đi qua. Giờ CHỈ bấm chuột / chạm (`pointerdown`, nút chính) hoặc bàn phím (focus bằng phím mũi tên / Tab, Enter) mới
      // chọn ô; rê chuột chỉ làm sáng ô bằng CSS (`:hover`) và hiện chú thích (`title`). KHÔNG gắn `pointerenter` / `mouseover` / `pointermove` vào đây
      // (`inv-select.test.ts` canh).
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault(); // không cho chuột kéo focus vào ô: chọn ô đi qua đường này, không qua `focus`
        if (e.button !== 0) return; // chuột phải / giữa không chọn
        selectSlot(i);
      });
      // dùng / mặc vật phẩm của ô (nhấp đúp bằng chuột, Enter bằng bàn phím)
      const activate = () => {
        const s = invSlots[i];
        if (!s) return;
        const def = ITEM_BY_ID[s.itemId];
        if (useLabelOf(def) !== null) {
          callbacks?.onUse(i); // đan dược "Dùng", kinh quyển "Học" (M7.4: cùng điều kiện với nút ở chi tiết)
        } else if (def?.type === "equip" && canEquip(def.id, currentRealm, currentTier)) {
          sound.equip();
          callbacks?.onEquip(i);
        }
      };
      btn.addEventListener("dblclick", activate);
      // bàn phím (#463): focus vào ô = chọn ô (hiện chi tiết như rê chuột), Enter = dùng / mặc
      btn.addEventListener("focus", () => {
        selectSlot(i);
      });
      btn.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        if (!e.repeat) activate();
      });

      slotEls.push(btn);
      slotIconEls.push(icon);
      slotNameEls.push(name);
      slotQtyEls.push(qty);
      slotCdEls.push(cd);
      grid.append(btn);
    }

    const bindTap = (id: string, fn: () => void) => {
      const el = $(id);
      if (!el) return;
      // -Infinity (không phải 0): với 0, mọi `click` trong 300 ms đầu sau khi tải trang bị coi là trùng với một lần chạm và bỏ qua
      let lastTap = -Infinity;
      el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        lastTap = performance.now();
        fn();
      });
      el.addEventListener("click", (e) => {
        if (performance.now() - lastTap < 300) return;
        e.preventDefault();
        fn();
      });
      el.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        // PHẢI luôn preventDefault (kể cả <button> / <a> và phím lặp): Phaser bỏ qua phím đã bị chặn nên Enter không kéo focus về ô chat
        // sau khi bảng vừa mở (focusModal); đồng thời chặn click mặc định của Enter để không gọi `fn` hai lần.
        e.preventDefault();
        if (e.repeat) return; // giữ phím không kích hoạt liên tục
        fn();
      });
      // Firefox vẫn bắn click khi nhả Space dù keydown đã bị chặn: chặn ở keyup để không gọi `fn` lần hai
      el.addEventListener("keyup", (e) => {
        if (e.key === " ") e.preventDefault();
      });
    };

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
    // Vứt có HỘP XÁC NHẬN ghi tên + số lượng (QUYET_DINH_M3 mục 24); gửi `dropItem` chỉ khi bấm "Vứt" trong hộp
    // chặn click ma ngay sau khi hộp đóng (đăng ký TRƯỚC `bindTap`, pha bắt): chỉ click chuột / chạm (`detail` > 0), Enter / Space bằng bàn phím (`detail` 0) vẫn mở lại được ngay
    for (const id of ["inv-btn-drop1", "inv-btn-dropall"]) {
      $(id).addEventListener(
        "click",
        (e) => {
          if (e.detail > 0 && performance.now() - dropConfirmClosedAt < DROP_CONFIRM_GUARD_MS)
            e.stopImmediatePropagation();
        },
        true,
      );
    }
    bindTap("inv-btn-drop1", () => askDropConfirm(false, $("inv-btn-drop1")));
    bindTap("inv-btn-dropall", () => askDropConfirm(true, $("inv-btn-dropall")));
    // Ô số lượng dùng chung trong hộp vứt (mục 47): Enter = Vứt (qua cửa sổ chống click ma của `confirmDrop`), Esc = Giữ lại
    dropStepper = createQtyStepper({
      label: "Số lượng vứt",
      max: 1,
      initial: 1,
      ids: { input: "inv-drop-qty-input" },
      onChange: (q) => onDropQtyChange(q),
      onConfirm: () => confirmDrop(),
      onCancel: () => void closeDropConfirm(true),
    });
    $("inv-drop-qty").append(dropStepper.el);
    bindTap("inv-drop-yes", () => confirmDrop());
    // Hộp xác nhận dùng chung: bỏ qua bấm trong cửa sổ chống click ma; "Chưa / Giữ lại" cũng vậy (hộp không được chớp tắt dưới ngón tay)
    bindTap("act-btn-yes", () => {
      if (inConfirmGuard(actConfirmOpenedAt, performance.now())) return;
      const go = actConfirmAction;
      closeActConfirm(true);
      go?.();
    });
    bindTap("act-btn-no", () => {
      if (inConfirmGuard(actConfirmOpenedAt, performance.now())) return;
      closeActConfirm(true);
    });
    bindTap("inv-drop-no", () => {
      if (performance.now() - dropConfirmOpenedAt < DROP_CONFIRM_GUARD_MS) return;
      closeDropConfirm(true);
    });
    bindTap("quick-1", () => this.useQuick(1));
    bindTap("quick-2", () => this.useQuick(2));
    bindTap("btn-pickup", () => callbacks?.onPickup());
    bindTap("btn-talk", () => callbacks?.onTalk());
    bindTap("btn-portal", () => portalCallback?.());

    // Tổ đội (#75, #91): thu gọn được, nhớ lựa chọn (`tg_party_open`; khoá cũ `tg_party_collapsed` chỉ đọc khi chưa có), mặc định thu gọn ở màn hẹp
    const partyPanelEl = $("party-panel");
    const partyToggleBtn = $("party-btn-toggle");
    setupPanelPref(
      {
        key: PARTY_PREF_KEY,
        legacyCollapsedKey: "tg_party_collapsed",
        toggleId: "party-btn-toggle",
        apply: (open) => {
          partyPanelEl.classList.toggle("collapsed", !open);
          partyToggleBtn.textContent = open ? "▾" : "▸";
          partyToggleBtn.setAttribute("aria-expanded", String(open));
        },
      },
      bindTap,
    );
    bindTap("party-btn-leave", () => callbacks?.onPartyLeave?.());
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
    // Đóng bằng closePlayerMenu (gỡ khỏi modalStack): ẩn thẳng `hidden = true` để sót mục "player-menu" trong modalStack làm
    // `isKeyboardCaptured()` kẹt true, WASD / phím thế giới không chạy cho tới khi bấm Esc (lỗi nền của #468, gặp khi dùng chuột bấm nút menu).
    bindTap("pm-close", () => this.closePlayerMenu());
    bindAmbushDom();
    bindArenaDom();
    bindTap("pm-invite-btn", () => {
      this.closePlayerMenu();
      if (selectedPlayerName) callbacks?.onPartyInvite?.(selectedPlayerName);
    });
    bindTap("pm-duel-btn", () => {
      this.closePlayerMenu();
      if (selectedPlayerName) callbacks?.onDuelChallenge?.(selectedPlayerName);
    });
    bindTap("pm-sect-btn", () => {
      this.closePlayerMenu();
      if (selectedPlayerName) callbacks?.onSectInvite?.(selectedPlayerName);
    });

    // Tông môn (M3.6, #230)
    bindTap("btn-sect", () => this.toggleSectModal());

    // Xã hội (M9, #1025): nút HUD ẩn cho tới khi cờ `?social=1` bật
    const socialOn = typeof window !== "undefined" && socialEnabled(window.location.search);
    $("btn-social").hidden = !socialOn;
    document.body.classList.toggle("social-on", socialOn); // CSS: hàng menu 8 nút cần mốc ☰ cao hơn (xem `body.social-on` ở style.css)
    bindTap("btn-social", () => this.toggleSocialModal());
    bindTap("social-close", () => this.toggleSocialModal(false));
    for (const t of SOCIAL_TABS)
      bindTap(`social-tab-btn-${t.id}`, () => this.switchSocialTab(t.id));
    for (const id of BOARD_IDS) bindTap(`social-board-btn-${id}`, () => this.switchSocialBoard(id));
    bindTap("social-board-retry", () => requestSocialBoard(socialBoard, true));
    bindTap("ach-retry", () => {
      requestAch(true);
      renderAch();
    });
    bindTap("wbt-retry", () => {
      requestWorldBoss(true);
      renderWbTab();
    });
    bindTap("wb-toggle", () => {
      wbExpanded = !wbExpanded;
      renderWbBanner();
    });
    // banner trùm thế giới nằm TRÊN thanh trùm: đo chiều cao banner vào biến CSS `--wb-h` để thanh trùm tự xuống theo (0 khi banner ẩn)
    if (typeof ResizeObserver !== "undefined") {
      const wb = $("wb-banner");
      new ResizeObserver(() => {
        const h = wb.hidden ? 0 : Math.ceil(wb.getBoundingClientRect().height) + 6;
        document.documentElement.style.setProperty("--wb-h", `${h}px`);
      }).observe(wb);
    }
    $("social-board-tabs").addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
      const next = tabByKey(BOARD_IDS, socialBoard, e.code);
      if (next === null) return;
      e.preventDefault();
      this.switchSocialBoard(next, true);
    });
    // Mũi tên / Home / End trên thanh tab (WAI-ARIA tablist): đổi tab VÀ chuyển focus theo; `preventDefault` để bộ nghe phím ở `window`
    // (`handlePanelKey`, chuyển focus theo hình học) bỏ qua, nếu không tab có `tabindex=-1` bị nhảy qua.
    $("social-tabs").addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
      const next = socialTabByKey(socialTab, e.code);
      if (next === null) return;
      e.preventDefault();
      this.switchSocialTab(next, true);
    });
    bindTap("sect-close", () => this.toggleSectModal(false));

    bindTap("sect-tab-btn-overview", () => this.switchSectTab("overview"));
    bindTap("sect-tab-btn-members", () => this.switchSectTab("members"));
    bindTap("sect-tab-btn-treasury", () => this.switchSectTab("treasury"));
    bindTap("sect-tab-btn-vault", () => this.switchSectTab("vault"));
    bindTap("sect-tab-btn-hall", () => this.switchSectTab("hall"));
    buildSectVaultGrids();
    // Ô nhập SỐ LƯỢNG dùng chung (mục 47): gõ số, − / +, ×10 / ×100, Tối đa, giữ nút tăng nhanh dần, Enter xác nhận
    vaultStepper = createQtyStepper({
      label: "Số lượng góp hoặc rút",
      max: 1,
      ids: { input: "sect-vault-qty", minus: "sect-vault-minus", plus: "sect-vault-plus" },
      preview: (q) =>
        `${vaultSel?.from === "vault" ? "Rút" : "Góp"} ${q.toLocaleString("vi-VN")} trong tối đa ${vaultSelMax().toLocaleString("vi-VN")}.`,
      onChange: (q) => {
        if (q !== null) vaultQty = q;
        if (!vaultRendering && sectModalOpen && sectTab === "vault") renderSectVaultTab();
      },
      onConfirm: () => runVaultAction(),
    });
    $("sect-vault-qty-box").append(vaultStepper.el);
    depositStepper = createQtyStepper({
      label: "Số Linh thạch góp vào quỹ",
      placeholder: "Số Linh thạch",
      max: currentCoin,
      initial: 1,
      ids: { input: "sect-input-deposit" },
      preview: (q) => depositPreviewText(q, currentCoin, sectHall?.view?.me ?? null),
      onConfirm: () => ($("sect-form-deposit") as HTMLFormElement).requestSubmit(),
    });
    $("sect-deposit-qty").append(depositStepper.el);
    depositStepper.clear();
    withdrawStepper = createQtyStepper({
      label: "Số Linh thạch rút từ quỹ",
      placeholder: "Số Linh thạch",
      max: currentSect?.coin ?? 0,
      initial: 1,
      ids: { input: "sect-input-withdraw" },
      preview: (q) =>
        `Quỹ còn lại ${Math.max(0, (currentSect?.coin ?? 0) - q).toLocaleString("vi-VN")} Linh thạch.`,
      onConfirm: () => ($("sect-form-withdraw") as HTMLFormElement).requestSubmit(),
    });
    $("sect-withdraw-qty").append(withdrawStepper.el);
    withdrawStepper.clear();
    // Nút Góp / Rút dùng `click` (KHÔNG `bindTap`/pointerdown): hộp xác nhận đóng ở `pointerdown` của nút "Góp"/"Rút"/"Giữ lại" nằm ĐÚNG chỗ nút này, nên `click` ma sau khi nhả ngón
    // sẽ rơi xuống đây và mở lại hộp; chỉ chặn click của chuột / chạm (`detail > 0`) trong cửa sổ chống click ma, Enter / Space bằng bàn phím (`detail` = 0) vẫn bấm được ngay.
    $("sect-vault-act").addEventListener("click", (e) => {
      e.preventDefault();
      if (e.detail > 0 && inConfirmGuard(actConfirmClosedAt, performance.now())) return;
      runVaultAction();
    });
    $("sect-vault-policy").addEventListener("submit", (e) => {
      e.preventDefault();
      const sel = $("sect-vault-policy-sel") as HTMLSelectElement;
      callbacks?.onSectVaultPolicy?.(Number(sel.value));
    });

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
      // Phí lập MẤT HẲN (#779 hàng 13): hộp nêu tên + biệt hiệu + phí; ví không đủ thì gửi thẳng (chưa mất gì, máy chủ trả lý do)
      const plan = sectCreatePlan(name, tag, SECT_CREATE_COST, currentCoin);
      if (!plan) {
        callbacks?.onSectCreate?.(name, tag);
        return;
      }
      askActConfirm(
        plan.spec,
        () => {
          // đã nhận lời mời của tông môn khác / ví vừa đổi trong lúc hộp mở: huỷ, không lập theo lời hỏi đã cũ
          if (!sectCreateStillValid(plan, currentSect !== null, currentCoin)) {
            this.toast({ text: "Linh thạch hoặc tông môn vừa đổi, chưa lập gì.", tone: "info" });
            return;
          }
          callbacks?.onSectCreate?.(plan.name, plan.tag);
        },
        $("sect-btn-create"),
      );
      actConfirmFromSect = true;
    });
    // `click` ma sau khi hộp đóng (cảm ứng: hộp đóng ở `pointerdown`, `click` rơi xuống nút Lập / Nộp bên dưới) không được gửi lại biểu mẫu; Enter trong ô nhập (`detail` 0) vẫn gửi
    for (const id of ["sect-btn-create", "sect-btn-deposit"]) {
      $(id)?.addEventListener("click", (e) => {
        if (ghostClick(e)) e.preventDefault();
      });
    }

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
      const amount = depositStepper?.read() ?? null;
      if (amount === null) {
        this.toast({ text: "Số lượng Linh thạch không hợp lệ", tone: "bad" });
        return;
      }
      // Người KHÔNG rút lại được (Trưởng lão, Đệ tử) nộp là mất (#779 hàng 14): hỏi; Tông chủ rút lại được: gửi thẳng
      const spec = sectDepositPlan(
        amount,
        currentCoin,
        currentSect ? canSect("withdraw", currentSect.myRank) : true,
      );
      if (!spec) {
        callbacks?.onSectDeposit?.(amount);
        depositStepper?.clear();
        return;
      }
      askActConfirm(
        spec,
        () => {
          if (!sectDepositStillValid(amount, currentSect !== null, currentCoin)) {
            this.toast({ text: "Linh thạch hoặc tông môn vừa đổi, chưa nộp gì.", tone: "info" });
            return;
          }
          callbacks?.onSectDeposit?.(amount);
          depositStepper?.clear();
        },
        $("sect-btn-deposit"),
      );
      actConfirmFromSect = true;
    });

    // Kho tông môn: Rút
    $("sect-form-withdraw")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const amount = withdrawStepper?.read() ?? null;
      if (amount === null) {
        this.toast({ text: "Số lượng Linh thạch không hợp lệ", tone: "bad" });
        return;
      }
      callbacks?.onSectWithdraw?.(amount);
      withdrawStepper?.clear();
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

    // Xác nhận qua cổng (#769): "Đi" gửi `travel`, "Ở lại" chỉ đóng hộp. Y / X bấm đúng hai nút này (`prompts.ts`).
    bindTap("tvl-btn-yes", () => {
      const go = travelConfirmAction;
      this.closeTravelConfirm();
      go?.();
    });
    bindTap("tvl-btn-no", () => this.closeTravelConfirm());

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
    bindTap("btn-skills", () => this.toggleSkillsModal());
    bindTap("skills-close", () => this.toggleSkillsModal(false));
    bindSkillFilter();
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
    const preferTargetChk = $("set-prefer-target") as HTMLInputElement;
    const aimModeSel = $("set-aim-mode") as HTMLSelectElement;
    const minimapChk = $("set-minimap") as HTMLInputElement;
    const qualitySel = $("set-quality") as HTMLSelectElement;
    const qualityNow = $("set-quality-now");
    const batterySaverChk = $("set-battery-saver") as HTMLInputElement;
    // Số phiên bản của bản dựng (Giới thiệu và ghi công); chạy ngoài vite (test) thì ghi "dev"
    $("set-version").textContent = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
    const TIER_NAME = { low: "Thấp", mid: "Vừa", high: "Cao", ultra: "Rất cao" } as const;

    // "Rất cao" CHỈ máy tính đủ điều kiện (docs/THIET_KE_GIAO_DIEN_DO_HOA.md mục 10.3): điện thoại / máy yếu không có lựa chọn này
    // (gỡ hẳn khỏi danh sách, vì một số trình duyệt bỏ qua `hidden` trên <option>)
    if (!qualityUltraAvailable()) qualitySel.querySelector('option[value="ultra"]')?.remove();

    const syncSettingsDom = () => {
      const bPct = Math.round(sound.getBgmVolume() * 100);
      const sPct = Math.round(sound.getSfxVolume() * 100);
      bgmInput.value = `${bPct}`;
      bgmVal.textContent = `${bPct}%`;
      sfxInput.value = `${sPct}`;
      sfxVal.textContent = `${sPct}%`;
      muteChk.checked = sound.isMuted();
      hideNamesChk.checked = hideOtherNames;
      preferTargetChk.checked = preferTargetOverMouse;
      aimModeSel.value = aimModeSetting;
      minimapChk.checked = minimapVisible;
      const q = getQuality();
      qualitySel.value = q.mode;
      qualityNow.textContent = `Đang dùng: ${TIER_NAME[q.tier]}`;
      batterySaverChk.checked = q.batterySaver;
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
    aimModeSel.addEventListener("change", () => this.setAimMode(parseAimMode(aimModeSel.value)));
    preferTargetChk.addEventListener("change", () => {
      preferTargetOverMouse = preferTargetChk.checked;
      try {
        localStorage.setItem(PREFER_TARGET_STORAGE_KEY, preferTargetOverMouse ? "1" : "0");
      } catch {
        // Bỏ qua nếu trình duyệt chặn localStorage
      }
    });
    minimapChk.addEventListener("change", () => this.toggleMinimap(minimapChk.checked));
    applyMinimap();
    qualitySel.addEventListener("change", () => {
      setQualityMode(qualitySel.value as QualityMode);
    });
    batterySaverChk.addEventListener("change", () => {
      setBatterySaver(batterySaverChk.checked);
    });
    // Bộ điều tốc có thể tự đổi bậc: cập nhật dòng "Đang dùng"
    onQualityChange(syncSettingsDom);

    // Giảm chuyển động (#269, #280)
    syncReducedMotionDom();
    const reducedMotionChk = $("set-reduced-motion") as HTMLInputElement | null;
    if (reducedMotionChk) {
      const reduced = isReducedMotion();
      reducedMotionChk.checked = reduced;
      reducedMotionChk.addEventListener("change", () => {
        setReducedMotionPref(reducedMotionChk.checked);
        refreshQuality(); // hồ sơ chất lượng đọc lại giảm chuyển động (tắt rung, giảm hạt...)
      });
    }

    // Chú giải bản đồ lớn bấm mở / đóng (QUYET_DINH_M3 mục 17.2): nhớ lựa chọn; chưa chọn thì mở ở màn rộng, đóng ở màn hẹp (điện thoại ngang không phải cuộn)
    setupPanelPref(
      {
        key: MAP_LEGEND_PREF_KEY,
        toggleId: "map-legend-toggle",
        apply: (open) => {
          $("map-legend").hidden = !open;
          $("map-legend-toggle").setAttribute("aria-expanded", String(open));
        },
      },
      bindTap,
    );

    // Khung chat (QUYET_DINH_M3 mục 15): thu gọn còn 1 dòng, nhớ `tg_chat_open`, mặc định thu gọn ở màn hẹp, tự mờ khi không dùng
    const chatEl = $("chat");
    const chatToggleBtn = $("chat-toggle");
    chatPanel = setupPanelPref(
      {
        key: CHAT_PREF_KEY,
        toggleId: "chat-toggle",
        apply: (open) => {
          chatEl.classList.toggle("collapsed", !open);
          chatToggleBtn.setAttribute("aria-expanded", String(open));
          const log = $("chat-log");
          log.scrollTop = log.scrollHeight;
        },
      },
      bindTap,
    );
    // chạm vào dòng tin đang thu gọn = mở khung (đích chạm lớn, nút 💬 nhỏ)
    $("chat-log").addEventListener("click", () => {
      if (chatEl.classList.contains("collapsed") && !chatEl.classList.contains("typing"))
        chatPanel?.setOpen(true);
    });
    chatEl.addEventListener("pointerenter", bumpChat);
    chatEl.addEventListener("focusin", bumpChat);
    $("chat-input").addEventListener("focusout", () => chatEl.classList.remove("typing"));
    bumpChat();

    // Thanh menu (QUYET_DINH_M3 mục 15): màn hẹp (< 620 px, `@media (max-width: 619px)` ở style.css, #684) gộp 7 nút vào một nút ☰ mở ra một hàng nút; chọn một mục hoặc chạm ra ngoài thì đóng
    const hudMenu = $("hud-menu");
    const setMenuOpen = (open: boolean) => {
      hudMenu.classList.toggle("open", open);
      $("btn-menu").setAttribute("aria-expanded", String(open));
      $("btn-menu").setAttribute("aria-label", open ? "Đóng menu" : "Mở menu");
    };
    bindTap("btn-menu", () => setMenuOpen(!hudMenu.classList.contains("open")));
    $("hud-menu-items").addEventListener("click", () => setMenuOpen(false));
    document.addEventListener("pointerdown", (e) => {
      if (hudMenu.classList.contains("open") && !hudMenu.contains(e.target as Node))
        setMenuOpen(false);
    });

    // Bảng chỉ dẫn người mới (#269)
    bindTap("newbie-close", () => this.dismissNewbieGuide());
    bindTap("newbie-btn-dismiss", () => this.dismissNewbieGuide());
    bindTap("newbie-btn-keys", () => this.toggleKeysModal(true, $("newbie-btn-keys")));

    // Màn Phím tắt (#463): mở từ Cài đặt / chỉ dẫn; đổi phím bằng bàn phím (xem onKeyCaptureKeydown)
    bindTap("set-open-keys", () => this.toggleKeysModal(true, $("set-open-keys")));
    bindTap("keys-close", () => this.toggleKeysModal(false));
    bindTap("keys-reset", () => {
      keyCaptureFor = null;
      resetKeymap();
      setKeysStatus("Đã khôi phục phím mặc định.");
    });
    $("keys-list").addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button.keys-change");
      const id = btn?.dataset.action as ActionId | undefined;
      if (!id || !Object.prototype.hasOwnProperty.call(ACTION_BY_ID, id)) return;
      if (keyCaptureFor === id) {
        keyCaptureFor = null; // bấm lại nút đang chờ = huỷ
        setKeysStatus("Đã huỷ, giữ nguyên phím cũ.");
        renderKeysModal();
      } else startKeyCapture(id);
    });
    window.addEventListener("keydown", onKeyCaptureKeydown, true);
    onKeymapChange(() => {
      if (keysModalOpen) renderKeysModal();
    });
    bindTap("help", () => this.showNewbieGuide(true));

    // Âm thanh
    bindTap("btn-mute", () => {
      const isMuted = sound.toggleMute();
      this.updateMuteIcon(isMuted);
    });
    sound.onChange((m) => this.updateMuteIcon(m));
    this.updateMuteIcon(sound.isMuted());
    // Nhãn phím trên nút HUD (máy tính): đọc từ bảng phím nên đổi phím thì nhãn đổi theo (#463)
    initKeyLabels();

    // Hộp thoại NPC
    bindTap("dlg-close", () => this.closeDialog());
    $("dlg-body").addEventListener("pointerdown", (e) => {
      e.preventDefault();
      finishTypewriter();
    });

    renderInventory();
    renderQuestTracker();
    setupQuestTrackerToggle(bindTap);

    watchModalHidden("dungeon-end-modal");
    watchModalHidden("duel-end-modal");

    // Bảng đo hiệu năng chỉ hiện khi mở bằng ?perf=1 (#71)
    if (
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("perf") === "1"
    ) {
      $("perf-panel").hidden = false;
    }

    // Trợ năng: Lắng nghe Escape để đóng modal trên cùng, Tab để trap focus
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (this.handleEscape()) {
          e.preventDefault();
        }
      } else if (e.key === "Tab") {
        const top = modalStack.peek();
        if (top) {
          const modalEl = $(top.id);
          if (modalEl && !modalEl.hidden) {
            trapTabKey(modalEl, e);
          }
        }
      } else if (!e.defaultPrevented && this.handlePanelKey(e)) {
        e.preventDefault();
      }
    });
  },

  updatePerf(stats: {
    fps: number;
    frameAvgMs: number;
    frameP95Ms: number;
    players: number;
    monsters: number;
    loots: number;
    tweens: number;
    /** Trung vị RTT (ms) của 5 pong gần nhất; `null` = chưa đủ mẫu (bảng ghi "--") */
    rttMs?: number | null;
  }) {
    const panel = $("perf-panel");
    if (panel.hidden) return;
    $("perf-fps").textContent = `${Math.round(stats.fps)}`;
    $("perf-frame").textContent =
      `${stats.frameAvgMs.toFixed(1)} / ${stats.frameP95Ms.toFixed(1)} ms`;
    $("perf-entities").textContent = `${stats.players} / ${stats.monsters} / ${stats.loots}`;
    $("perf-tweens").textContent = `${stats.tweens}`;
    $("perf-rtt").textContent = perfRttText(stats.rttMs);
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
    $("btn-settings").setAttribute("aria-expanded", String(settingsModalOpen));
    if (settingsModalOpen) {
      modalStack.push("settings-modal", $("btn-settings"));
      focusModal($("settings-modal"));
    } else {
      modalStack.remove("settings-modal");
      returnFocus($("btn-settings"));
    }
  },

  isSettingsModalOpen() {
    return settingsModalOpen;
  },

  /** Màn Phím tắt (#463). `trigger` = nút đã mở nó, để trả focus lại đúng chỗ khi đóng. */
  toggleKeysModal(force?: boolean, trigger?: HTMLElement) {
    const open = force ?? !keysModalOpen;
    if (open === keysModalOpen) return;
    keysModalOpen = open;
    keyCaptureFor = null; // đóng / mở đều thôi chờ phím
    $("keys-modal").hidden = !open;
    if (open) {
      setKeysStatus("");
      renderKeysModal();
      modalStack.push("keys-modal", trigger ?? null);
      focusModal($("keys-modal"));
    } else {
      const top = modalStack.peek();
      const back = top?.id === "keys-modal" ? top.triggerEl : null;
      modalStack.remove("keys-modal");
      returnFocus(back);
    }
  },

  isKeysModalOpen() {
    return keysModalOpen;
  },

  /**
   * Trả lời lời mời / hộp xác nhận bằng phím (`prompt.yes` / `prompt.no`, xem `prompts.ts`): bấm nút đầu tiên đang hiện theo thứ tự ưu tiên.
   * `click()` đi qua đúng đường của chuột / chạm (`bindTap`) nên dọn đồng hồ, gửi tin và chuyển sang lời mời kế đều như cũ. `true` nếu có hộp để trả lời.
   */
  answerPrompt(answer: PromptAnswer): boolean {
    const id = pickPromptButton(answer, buttonShown);
    if (!id) return false;
    // X (giữ lại) là ý định CHỦ Ý bằng bàn phím: không bị cửa sổ chống click ma của hộp xác nhận dùng chung chặn (Y vẫn bị chặn trong cửa sổ đó)
    if (id === "act-btn-no") actConfirmOpenedAt = performance.now() - 10_000;
    $(id).click();
    return true;
  },

  /** Phím `exit.fight`: mở hộp xác nhận rời bí cảnh / đầu hàng (nút tương ứng đang hiện). Xác nhận bằng `prompt.yes`, huỷ bằng `prompt.no` / Esc. */
  askLeaveFight(): boolean {
    const id = pickVisible(LEAVE_BUTTONS, buttonShown);
    if (!id) return false;
    $(id).click();
    return true;
  },

  isHideNames() {
    return hideOtherNames;
  },

  /** "Chế độ nhắm" hiện tại (mục 26): `auto` = tự chuyển mục tiêu sang đối tượng gần nhất (mặc định), `manual` = khoá tay như cũ. */
  getAimMode(): AimMode {
    return aimModeSetting;
  },

  /** Đổi chế độ nhắm (Cài đặt hoặc phím tắt): lưu theo thiết bị, đồng bộ ô chọn trong Cài đặt, `notify` = báo bằng toast (phím tắt). */
  setAimMode(mode: AimMode, notify = false) {
    if (mode === aimModeSetting) return;
    aimModeSetting = mode;
    try {
      localStorage.setItem(AIM_MODE_STORAGE_KEY, mode);
    } catch {
      // Bỏ qua nếu trình duyệt chặn localStorage
    }
    const sel = document.getElementById("set-aim-mode") as HTMLSelectElement | null;
    if (sel) sel.value = mode;
    if (notify) this.toast({ text: `Chế độ nhắm: ${AIM_MODE_LABEL[mode]}`, tone: "info" });
  },

  /** Cài đặt "Ưu tiên mục tiêu hơn chuột" (mục 29): bật thì chiêu bay về mục tiêu kể cả khi chuột đang ở trong màn chơi. */
  isPreferTarget() {
    return preferTargetOverMouse;
  },

  /** Bậc Thấp (hiệu ứng phụ tắt). Nguồn duy nhất: gfx/quality.ts (di cư từ `tg_low_fx`). */
  isLowFx() {
    return getQuality().tier === "low";
  },

  toggleInventory(force?: boolean) {
    invOpen = force ?? !invOpen;
    $("inv-modal").hidden = !invOpen;
    $("btn-bag").classList.toggle("active", invOpen);
    $("btn-bag").setAttribute("aria-expanded", String(invOpen));
    if (invOpen) {
      modalStack.push("inv-modal", $("btn-bag"));
      focusModal($("inv-modal"));
      renderInventory();
    } else {
      closeDropConfirm(false);
      modalStack.remove("inv-modal");
      returnFocus($("btn-bag"));
    }
  },

  /**
   * Hộp xác nhận dùng chung cho thao tác khó hoàn tác (issue #779): `spec` = chữ (câu hỏi, dòng nhắc, nút), `onOk` chạy khi xác nhận. Có nền tối chặn bấm
   * xuyên; Esc / X = giữ lại, Y = xác nhận (`prompts.ts`). `opener` = nút để trả focus khi đóng.
   */
  askConfirm(spec: ConfirmSpec, onOk: () => void, opener: HTMLElement | null = null) {
    askActConfirm(spec, onOk, opener);
  },

  /** Đóng hộp xác nhận dùng chung nếu đang mở (Esc đóng hộp trước, rồi mới tới bảng); `refocus` = trả focus về nút đã mở. */
  closeActConfirm(refocus = true): boolean {
    return closeActConfirm(refocus);
  },

  isActConfirmOpen(): boolean {
    return !$("act-confirm").hidden;
  },

  /** Đóng hộp xác nhận vứt nếu đang mở (Esc đóng hộp trước, rồi mới tới túi đồ). */
  closeInvDropConfirm(): boolean {
    return closeDropConfirm(true);
  },

  isInventoryOpen() {
    return invOpen;
  },

  toggleCharModal(force?: boolean) {
    charModalOpen = force ?? !charModalOpen;
    $("char-modal").hidden = !charModalOpen;
    $("btn-char").classList.toggle("active", charModalOpen);
    $("btn-char").setAttribute("aria-expanded", String(charModalOpen));
    if (charModalOpen) {
      modalStack.push("char-modal", $("btn-char"));
      focusModal($("char-modal"));
      previewEquipItemId = null;
      renderCharModal();
    } else {
      modalStack.remove("char-modal");
      returnFocus($("btn-char"));
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
    if (forgeModalOpen) {
      modalStack.push("forge-modal");
      focusModal($("forge-modal"));
      renderForgeModal();
    } else {
      modalStack.remove("forge-modal");
      returnFocus();
    }
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
    if (shopModalOpen) {
      modalStack.push("shop-modal");
      focusModal($("shop-modal"));
      renderShopModal();
    } else {
      if (actConfirmFromShop) closeActConfirm(false);
      modalStack.remove("shop-modal");
      returnFocus();
    }
  },

  isShopModalOpen() {
    return shopModalOpen;
  },

  toggleQuestModal(force?: boolean) {
    questModalOpen = force ?? !questModalOpen;
    $("quest-modal").hidden = !questModalOpen;
    $("btn-quest").classList.toggle("active", questModalOpen);
    $("btn-quest").setAttribute("aria-expanded", String(questModalOpen));
    if (questModalOpen) {
      modalStack.push("quest-modal", $("btn-quest"));
      focusModal($("quest-modal"));
      renderQuestModal();
    } else {
      modalStack.remove("quest-modal");
      returnFocus($("btn-quest"));
    }
  },

  isQuestModalOpen() {
    return questModalOpen;
  },

  /** Bảng Công pháp (M7.6, #507): Shift+K / nút HUD; Esc đóng. Mô hình do cảnh dựng (`setSkillsModel`) vì sổ chiêu nằm ở cảnh. */
  toggleSkillsModal(force?: boolean) {
    skillsModalOpen = force ?? !skillsModalOpen;
    $("skills-modal").hidden = !skillsModalOpen;
    $("btn-skills").classList.toggle("active", skillsModalOpen);
    $("btn-skills").setAttribute("aria-expanded", String(skillsModalOpen));
    if (skillsModalOpen) {
      modalStack.push("skills-modal", $("btn-skills"));
      focusModal($("skills-modal"));
      callbacks?.onSkillsOpen?.(); // cảnh dựng mô hình mới ngay (setSkillsModel) rồi vẽ ở dưới
      renderSkillsModal();
    } else {
      skillsOpenId = null; // lần mở sau luôn là danh sách gọn
      resetSkillFilter();
      syncSkillFilterControls();
      modalStack.remove("skills-modal");
      returnFocus($("btn-skills"));
    }
  },

  isSkillsModalOpen() {
    return skillsModalOpen;
  },

  /** Cảnh đưa mô hình bảng Công pháp (sổ chiêu đổi / vừa mở): đang mở thì vẽ lại, giữ focus bàn phím. */
  setSkillsModel(m: SkillsPanelModel) {
    skillsModel = m;
    if (skillsModalOpen) renderSkillsModal();
  },

  toggleMapModal(force?: boolean) {
    mapModalOpen = force ?? !mapModalOpen;
    $("map-modal").hidden = !mapModalOpen;
    $("minimap-wrap").setAttribute("aria-expanded", String(mapModalOpen));
    if (mapModalOpen) {
      modalStack.push("map-modal", $("minimap-wrap"));
      focusModal($("map-modal"));
      // focus vào bản đồ để mũi tên / + / - / Home dùng được ngay (bản đồ tự xử lý rồi `preventDefault`, bảng bỏ qua); Esc vẫn đóng bảng
      ($("worldmap") as HTMLElement).focus({ preventScroll: true });
    } else {
      modalStack.remove("map-modal");
      returnFocus($("minimap-wrap"));
    }
  },

  isMapModalOpen() {
    return mapModalOpen;
  },

  /** Bản đồ nhỏ đang hiện (không phải thu gọn thành nhãn). */
  isMinimapOpen() {
    return minimapVisible;
  },

  /** Hiện / thu gọn bản đồ nhỏ (phím Shift+M, Cài đặt): lựa chọn được nhớ (`tg_minimap_open`); thu gọn vẫn còn nhãn tên khu để bấm mở bản đồ lớn. */
  toggleMinimap(force?: boolean) {
    minimapVisible = force ?? !minimapVisible;
    writePref(MINIMAP_PREF_KEY, minimapVisible ? "1" : "0");
    applyMinimap();
  },

  isDialogOpen() {
    return !$("dialog-modal").hidden;
  },

  closeDialog() {
    stopTypewriter();
    currentDialog = null;
    dlgPortrait?.clear();
    $("dialog-modal").hidden = true;
    $("dlg-options").replaceChildren();
    modalStack.remove("dialog-modal");
    returnFocus();
  },

  closeAllModals(): boolean {
    let closedAny = closeActConfirm(false);
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
    if (skillsModalOpen) {
      this.toggleSkillsModal(false);
      closedAny = true;
    }
    if (mapModalOpen) {
      this.toggleMapModal(false);
      closedAny = true;
    }
    if (keysModalOpen) {
      this.toggleKeysModal(false);
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
    if (socialModalOpen) {
      this.toggleSocialModal(false);
      closedAny = true;
    }
    if (this.isPlayerMenuOpen()) {
      this.closePlayerMenu();
      closedAny = true;
    }
    if (fleeSheetOpen()) {
      closeFleeSheet();
      closedAny = true;
    }
    modalStack.clear();
    // WorldScene gọi closeAllModals mỗi lần cập nhật khi đang chết: màn Hoàng Tuyền (không phải "modal" để đóng) phải còn trong modalStack
    if (this.isLimboOpen()) modalStack.push("limbo-overlay", null);
    // hộp thoại chặn đường KHÔNG phải bảng để đóng (chỉ ba nút hoặc hết giờ): vẫn thuộc về nó, bàn phím vẫn bị giữ
    if (this.isAmbushOpen()) modalStack.push("ambush-modal", null);
    return closedAny;
  },

  /** Đóng modal trên cùng của modal stack (LIFO) */
  closeTopModal(): boolean {
    const top = modalStack.peek();
    if (!top) return false;
    switch (top.id) {
      case "inv-modal":
        this.toggleInventory(false);
        return true;
      case "char-modal":
        this.toggleCharModal(false);
        return true;
      case "forge-modal":
        this.toggleForgeModal(false);
        return true;
      case "shop-modal":
        this.toggleShopModal(false);
        return true;
      case "quest-modal":
        this.toggleQuestModal(false);
        return true;
      case "skills-modal":
        this.toggleSkillsModal(false);
        return true;
      case "map-modal":
        this.toggleMapModal(false);
        return true;
      case "settings-modal":
        this.toggleSettingsModal(false);
        return true;
      case "keys-modal":
        this.toggleKeysModal(false);
        return true;
      case "sect-modal":
        this.toggleSectModal(false);
        return true;
      case "social-modal":
        this.toggleSocialModal(false);
        return true;
      case "dialog-modal":
        this.closeDialog();
        return true;
      case "player-menu":
        this.closePlayerMenu();
        return true;
      case "newbie-guide-modal":
        this.dismissNewbieGuide();
        return true;
      case "ambush-flee-modal":
        closeFleeSheet(); // Esc = "Ở lại đánh" (đang chờ phản hồi thì giữ)
        return true;
      case "ambush-modal":
        return true; // Esc KHÔNG đóng hộp thoại chặn đường (phải chọn, hoặc hết giờ = Chiến): nuốt phím, không bỏ chọn mục tiêu
      case "limbo-overlay":
        return true; // Esc KHÔNG đóng màn Hoàng Tuyền (chỉ đầu thai mới đóng); nuốt phím để không rơi xuống bước "bỏ chọn mục tiêu"
      default: {
        const el = document.getElementById(top.id);
        if (el) {
          el.hidden = true;
          modalStack.remove(top.id);
          returnFocus(top.triggerEl);
          return true;
        }
        modalStack.pop();
        return false;
      }
    }
  },

  /** Đóng hộp xác nhận giải tán tông môn nếu đang mở (Esc = Huỷ) */
  closeSectDisbandConfirm(): boolean {
    const el = $("sect-disband-confirm");
    if (el && !el.hidden) {
      el.hidden = true;
      return true;
    }
    return false;
  },

  /** Đóng hộp xác nhận rời bí cảnh nếu đang mở (Esc = Huỷ) */
  closeDhudLeaveConfirm(): boolean {
    const confirmEl = $("dhud-leave-confirm");
    if (confirmEl && !confirmEl.hidden) {
      confirmEl.hidden = true;
      const leaveBtn = $("dhud-btn-leave");
      if (leaveBtn) leaveBtn.hidden = false;
      return true;
    }
    return false;
  },

  /** Đóng hộp xác nhận nhận thua quyết đấu nếu đang mở (Esc = Huỷ) */
  closeDuelYieldConfirm(): boolean {
    const confirmBox = $("duel-yield-confirm");
    if (confirmBox && !confirmBox.hidden) {
      confirmBox.hidden = true;
      const yieldBtn = $("duel-btn-yield");
      if (yieldBtn) yieldBtn.hidden = false;
      return true;
    }
    return false;
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

  /** Đóng modal kết quả bí cảnh */
  closeDungeonEndModal(): boolean {
    const endModal = $("dungeon-end-modal");
    if (endModal && !endModal.hidden) {
      endModal.hidden = true;
      return true;
    }
    return false;
  },

  /** Đóng hộp lời mời nếu đang mở (Esc = chỉ tạm ẩn hộp trên màn hình, không gửi tin từ chối) */
  closeInviteBox(): boolean {
    const pib = $("party-invite-box");
    if (pib && !pib.hidden) {
      pib.hidden = true;
      return true;
    }
    const dib = $("dungeon-invite-box");
    if (dib && !dib.hidden) {
      dib.hidden = true;
      return true;
    }
    const duib = $("duel-invite-box");
    if (duib && !duib.hidden) {
      duib.hidden = true;
      return true;
    }
    const sib = $("sect-invite-box");
    if (sib && !sib.hidden) {
      sib.hidden = true;
      return true;
    }
    return false;
  },

  /**
   * Xử lý phím Escape tổng quát theo thứ tự ưu tiên các tầng UI:
   * 1. Blur chat nếu đang ở ô chat.
   * 2. Bỏ qua nếu đang gõ input khác.
   * 3. Đóng confirm box con (Huỷ).
   * 4. Đóng menu người chơi / đối thoại NPC.
   * 5. Đóng kết quả PK / bí cảnh.
   * 6. Đóng modal trên cùng của modal stack (LIFO).
   * 7. Từ chối lời mời đang hiển thị.
   */
  handleEscape(): boolean {
    return processEscapeKey({
      isTyping: () => isTypingElement(document.activeElement),
      blurChat: () => {
        const chatInput = $("chat-input") as HTMLInputElement | null;
        if (chatInput && document.activeElement === chatInput) {
          chatInput.blur();
          returnFocus();
          return true;
        }
        return false;
      },
      closeActConfirm: () => this.closeActConfirm(true),
      closeInvDropConfirm: () => this.closeInvDropConfirm(),
      closeSectActionConfirm: () => this.closeSectConfirm(),
      closeSectDisbandConfirm: () => this.closeSectDisbandConfirm(),
      closeDhudLeaveConfirm: () => this.closeDhudLeaveConfirm(),
      closeDuelYieldConfirm: () => this.closeDuelYieldConfirm(),
      closePlayerMenu: () => {
        if (this.isPlayerMenuOpen()) {
          this.closePlayerMenu();
          return true;
        }
        return false;
      },
      closeDialog: () => {
        if (this.isDialogOpen()) {
          this.closeDialog();
          return true;
        }
        return false;
      },
      closeDuelEndModal: () => this.closeDuelEndModal(),
      closeDungeonEndModal: () => this.closeDungeonEndModal(),
      closeTopModal: () => this.closeTopModal(),
      closeInviteBox: () => this.closeInviteBox(),
      clearTarget: () => callbacks?.onClearTarget?.() ?? false,
    });
  },

  /**
   * Phím điều hướng khi bảng / hộp thoại đang mở (QUYET_DINH_M3 mục 13, #463). Trả `true` nếu đã xử lý (để chặn mặc định):
   *  - mũi tên chuyển focus sang phần tử lân cận theo hình học (`panel-nav.ts`); ô nhập chữ / thanh trượt / select giữ mũi tên của chính nó;
   *  - hộp thoại NPC: Enter / Cách tua nhanh chữ đang gõ; phím số 1-9 (và số bên phải) chọn dòng; mũi tên đầu tiên vào dòng đầu.
   * Phím Enter / Cách trên nút do chính nút xử lý (`bindTap` hoặc `click` mặc định).
   */
  handlePanelKey(e: KeyboardEvent): boolean {
    if (e.ctrlKey || e.altKey || e.metaKey) return false;
    const top = modalStack.peek();
    const container = top ? $(top.id) : null;
    if (!top || !container || container.hidden) return false;
    const active = document.activeElement;
    if (top.id === "dialog-modal") {
      if (dlgTypeTimer !== null && (e.key === "Enter" || e.key === " ")) {
        finishTypewriter();
        return true;
      }
      const opts = Array.from(
        $("dlg-options").querySelectorAll<HTMLButtonElement>("button.dlg-opt-btn"),
      );
      const n = /^(?:Digit|Numpad)([1-9])$/.exec(e.code)?.[1];
      if (n !== undefined && !isTypingElement(active)) {
        const b = opts[Number(n) - 1];
        if (b && !b.disabled) b.click();
        return opts.length > 0;
      }
      if (dirOfArrowKey(e.key) && opts.length > 0 && !opts.some((b) => b === active)) {
        (opts.find((b) => !b.disabled) ?? opts[0]).focus();
        return true;
      }
    }
    const dir = dirOfArrowKey(e.key);
    if (dir) {
      if (ownsArrowKeys(active, dir)) return false;
      return moveFocus(container, dir);
    }
    return false;
  },

  /**
   * Có bảng / hộp thoại / menu đang mở không (#463): khi có, phím của THẾ GIỚI (đánh, kỹ năng, đan, mục tiêu, tương tác) không chạy để
   * Space / Enter / mũi tên thuộc về bảng; phím mở / đóng bảng, chat, âm thanh vẫn chạy.
   */
  isKeyboardCaptured() {
    // tự chữa mục sót: bảng đã ẩn mà còn trong ngăn xếp thì KHÔNG còn thuộc về bảng (mục 25: "liệt nút")
    if (modalStack.size() > 0)
      modalStack.pruneHidden((id) => {
        const el = document.getElementById(id);
        return !!el && (el.hidden || el.closest("[hidden]") !== null);
      });
    // hộp xác nhận dùng chung (#779) KHÔNG nằm trong modalStack (Esc / Y / X do nó tự xử lý) nhưng vẫn là tầng trên cùng: đang mở mà giữ D thì nhân vật không được
    // lặng lẽ đi tiếp (người chơi đọc hậu quả, quái đánh). keyup vẫn tới MoveKeys (pha bắt trên window) nên đóng hộp xong không kẹt phím.
    return (
      modalStack.size() > 0 ||
      this.isDialogOpen() ||
      this.isPlayerMenuOpen() ||
      this.isActConfirmOpen()
    );
  },

  showNewbieGuide(force = false) {
    if (!force && !shouldShowNewbieGuide()) return;
    const modal = $("newbie-guide-modal");
    if (modal) {
      modal.hidden = false;
      modalStack.push("newbie-guide-modal", $("help"));
      focusModal(modal);
    }
  },

  dismissNewbieGuide() {
    const modal = $("newbie-guide-modal");
    if (modal && !modal.hidden) {
      modal.hidden = true;
      markNewbieGuideDismissed();
      modalStack.remove("newbie-guide-modal");
      returnFocus($("help"));
    }
  },

  isNewbieGuideOpen(): boolean {
    const modal = $("newbie-guide-modal");
    return Boolean(modal && !modal.hidden);
  },

  isReducedMotion(): boolean {
    return isReducedMotion();
  },

  syncReducedMotion(): void {
    syncReducedMotionDom();
  },

  onInv(m: InvMsg) {
    invSlots = m.slots;
    // túi đổi trong lúc hộp xác nhận vứt đang mở và món định vứt không còn đúng (đổi món / không đủ số lượng): đóng hộp, lời trong hộp không còn đúng
    if (dropPlanPending && !dropStillValid(invSlots, dropPlanPending)) closeDropConfirm(false);
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
    if (sectModalOpen && sectTab === "vault") renderSectVaultTab(); // túi đổi (góp xong, nhặt): lưới túi trong tab Kho đồ cũng đổi
  },

  onWallet(m: WalletMsg) {
    currentCoin = m.coin;
    depositStepper?.setMax(currentCoin); // ô góp quỹ kẹp theo ví
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

    // Phí rèn so với số dư: bảng Lò Rèn đang mở thì vẽ lại chip phí và nút Rèn
    if (forgeModalOpen) renderForgeModal();

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
    $("dlg-npc-title").textContent = npc?.title ?? "";
    // Chân dung NPC (ảnh AI, gói `art:npc` tải theo nhu cầu): chưa có chân dung / chưa tải xong thì chỉ có tên như cũ; cùng NPC thì giữ ảnh (không chớp)
    const portraitImg = document.getElementById("dlg-npc-art");
    if (portraitImg instanceof HTMLImageElement) {
      dlgPortrait ??= new NpcPortraitSlot(portraitImg);
      dlgPortrait.show(m.npcId);
    }

    $("dialog-modal").hidden = false;
    $("dlg-options").replaceChildren();
    $("dlg-skip-hint").textContent = skipHintText(document.documentElement.dataset.input);
    $("dlg-skip-hint").hidden = false;
    modalStack.push("dialog-modal");
    focusModal($("dialog-modal"));
    // focus vào THÂN hộp thoại, không để ở nút đóng: Enter / Cách tua nhanh chữ chứ không đóng hộp (#463)
    $("dlg-body").focus();

    dlgFullText = m.lines.join("\n\n");
    dlgTypedLen = 0;
    const textEl = $("dlg-text");
    textEl.textContent = "";

    stopTypewriter();
    if (isReducedMotion()) {
      finishTypewriter();
      textEl.textContent = dlgFullText;
    } else {
      // Số ký tự tính từ THỜI GIAN đã trôi (dialog-typewriter.ts), không cộng cố định mỗi lần timer chạy: khung chậm thì timer chạy thưa
      const typeStart = performance.now();
      dlgTypeTimer = window.setInterval(() => {
        const n = typedLength(performance.now() - typeStart, dlgFullText.length);
        if (n >= dlgFullText.length) {
          finishTypewriter();
        } else if (n > dlgTypedLen) {
          dlgTypedLen = n;
          textEl.textContent = dlgFullText.slice(0, dlgTypedLen);
          sound.typeBlip();
        }
      }, 28);
    }
  },

  /** `npcName`: tên NPC đứng gần ("" = không rõ tên); `null` = ẩn nút. Nhãn trong nút cố định ngắn, tên đi vào title / aria-label. */
  talkPrompt(npcName: string | null) {
    const btn = $("btn-talk");
    btn.hidden = npcName === null;
    if (npcName !== null) {
      const t = talkBtnText(npcName);
      $("talk-label").textContent = t.label;
      btn.title = t.title;
      btn.setAttribute("aria-label", t.aria);
    }
  },

  portalPrompt(label: string | null, onTravel?: () => void) {
    const btn = $("btn-portal");
    btn.hidden = label === null;
    if (label !== null) {
      // Nhãn trong nút cố định ngắn (không bị cắt); tên cổng đi vào title / aria-label
      const t = portalBtnText(label);
      $("portal-label").textContent = t.label;
      btn.title = t.title;
      btn.setAttribute("aria-label", t.aria);
      if (onTravel) portalCallback = onTravel;
    } else {
      portalCallback = null;
    }
  },

  /**
   * Hộp xác nhận bấm qua cổng khi đang có hiệu lực đan / phù (máy chủ XOÁ hiệu lực khi qua cổng: #767). `text` đã dựng sẵn (`travelConfirmText`),
   * `onGo` chạy khi chọn "Đi". Không chặn điều khiển (như các lời mời); Y / X trả lời (`prompts.ts`).
   */
  askTravelConfirm(text: string, onGo: () => void) {
    travelConfirmAction = onGo;
    $("travel-confirm-text").textContent = text;
    $("travel-confirm").hidden = false;
  },

  closeTravelConfirm() {
    travelConfirmAction = null;
    $("travel-confirm").hidden = true;
  },

  isTravelConfirmOpen(): boolean {
    return !$("travel-confirm").hidden;
  },

  /** `itemName`: tên món đồ rơi gần nhất ("" = không rõ tên); `null` = ẩn nút. Nhãn trong nút cố định ngắn, tên đi vào title / aria-label. */
  pickupPrompt(itemName: string | null) {
    const btn = $("btn-pickup");
    btn.hidden = itemName === null;
    if (itemName !== null) {
      const t = pickupBtnText(itemName);
      $("pickup-label").textContent = t.label;
      btn.title = t.title;
      btn.setAttribute("aria-label", t.aria);
    }
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

  /**
   * Thẻ minh hoạ ở đầu bảng Sơn Hà Đồ cho bản đồ ĐANG XEM (không nhất thiết bản đồ mình đứng). Chưa có ảnh / ảnh lỗi / bí cảnh thì thẻ ẩn,
   * đầu bảng giữ nguyên như cũ (map-card.ts `applyMapCard`).
   */
  setMapPanelCard(mapId: string) {
    const cardEl = document.getElementById("map-card");
    if (cardEl instanceof HTMLImageElement) applyMapCard(cardEl, mapCardUrl(mapId));
  },

  showTransition(mapName: string, mapId?: string) {
    const overlay = $("transition-overlay");
    const nameEl = $("transition-map-name");
    if (nameEl) nameEl.textContent = mapName;
    // Thẻ minh hoạ của bản đồ đích (ảnh AI, map-card.ts): chưa có ảnh / ảnh lỗi thì chỉ còn tên như cũ
    const cardEl = document.getElementById("transition-card");
    if (cardEl instanceof HTMLImageElement) applyMapCard(cardEl, mapCardUrl(mapId));
    overlay.hidden = false;
    // Ép tính kiểu (reflow) để trình duyệt GHI NHẬN kiểu "trước khi đổi" (mở) rồi mới thêm `active`: phần tử vừa bỏ `hidden`
    // (display: none) mà thêm lớp ngay trong cùng khung thì chuyển động CSS không chạy, màn đổi tức thì.
    void overlay.offsetWidth;
    overlay.classList.add("active");
  },

  hideTransition() {
    const overlay = $("transition-overlay");
    overlay.classList.remove("active");
    // Chờ mống mắt mở ra / mờ xong (cùng số với CSS, gfx/scene-transition.ts) rồi mới ẩn hẳn
    setTimeout(
      () => {
        if (!overlay.classList.contains("active")) overlay.hidden = true;
      },
      transitionMs(getQuality().fadeOnly) + 50,
    );
  },

  /**
   * Chờ màn chuyển cảnh khép xong (mặc định đúng thời lượng mống mắt / mờ dần của chế độ hiện tại) trong lúc nó đang che, nhưng
   * bấm chuột / chạm / gõ phím thì xong sớm ("bỏ qua được"). Trả `true` nếu người chơi bỏ qua.
   */
  transitionHold(ms: number = transitionMs(getQuality().fadeOnly)): Promise<boolean> {
    const overlay = $("transition-overlay");
    return waitOrSkip(ms, (onSkip) => {
      const h = () => onSkip();
      overlay.addEventListener("pointerdown", h);
      window.addEventListener("keydown", h);
      return () => {
        overlay.removeEventListener("pointerdown", h);
        window.removeEventListener("keydown", h);
      };
    });
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

  /**
   * Các trạng thái CÓ HIỆU LỰC của chính mình (id; scene gọi ~16 lần/giây từ `StatusTracker.active`): đan / phù gắn trạng thái đang có chip thì nút Dùng mờ
   * "Đang còn hiệu lực" (máy chủ từ chối + không trừ, #766). Chỉ vẽ lại chi tiết túi khi TẬP id đổi (không phải mỗi giây: chip lo phần đếm ngược).
   */
  setActiveStatuses(ids: readonly string[]) {
    const key = [...ids].sort().join(",");
    if (key === activeStatusKey) return;
    activeStatusKey = key;
    activeStatusIds = new Set(ids);
    if (invOpen) renderSlotDetail();
  },

  hud(p: HudPlayer, online: number) {
    // Sáu ô (ba ô riêng chỉ chủ nhận, vắng = trống); so tại chỗ, chỉ dựng bộ mới khi đổi (hud chạy mỗi khung)
    const equipOrRealmChanged =
      p.realm !== currentRealm || p.tier !== currentTier || equipDiffers(p, currentEquip);

    currentName = p.name;
    currentRealm = p.realm;
    currentTier = p.tier;
    if (equipOrRealmChanged) currentEquip = equipmentOf(p);
    if (equipOrRealmChanged && invOpen) renderSlotDetail(); // đan hộ đạo đúng bậc chỉ dùng được ở bậc của nó

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
      const validV = Number.isFinite(v) && v >= 0 ? v : 0;
      const validMax = Number.isFinite(max) && max > 0 ? max : 0;
      const pct =
        Math.round(Math.max(0, Math.min(1, validMax > 0 ? validV / validMax : 0)) * 1000) / 10;
      if (pct !== cachedBarPct[k]) {
        cachedBarPct[k] = pct;
        $(`${k}-fill`).style.width = `${pct}%`;
      }
      const text = `${label} ${fmt(validV)} / ${fmt(validMax)}`;
      if (text !== cachedBarText[k]) {
        cachedBarText[k] = text;
        $(`${k}-text`).textContent = text;
      }
    };
    const validExpMax =
      Number.isFinite(p.expMax) && p.expMax > 0 ? p.expMax : expToNext(p.realm, p.tier);
    currentExp = p.exp;
    currentExpMax = p.expMax;
    set("hp", p.hp, p.maxHp, "Khí huyết");
    set("mp", p.mp, p.maxMp, "Linh lực");
    set("exp", p.exp, validExpMax, "Tu vi");
    if (online !== cachedHudOnline) {
      cachedHudOnline = online;
      $("hud-online-n").textContent = `${online}`;
      $("hud-online").setAttribute("aria-label", `Đạo hữu trực tuyến: ${online}`);
    }
    if (p.meditating !== cachedMeditating) {
      cachedMeditating = p.meditating;
      $("sk-med").classList.toggle("on", p.meditating);
    }
    const canBreak = canAttemptBreakthrough(p.realm, p.tier, p.exp, p.expMax);
    if (canBreak !== cachedCanBreak) {
      cachedCanBreak = canBreak;
      $("sk-break").classList.toggle("ready", canBreak);
      if (invOpen) renderSlotDetail(); // nút Dùng của đan hộ đạo mờ / sáng theo "đỉnh + đầy tu vi" (cùng điều kiện nút Đột phá)
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
    } else {
      if (m.channel === "party") p.className = "party";
      else if (m.channel === "sect") p.className = "sect";
      // nhãn người nói: kênh + danh hiệu (chỉ khi cờ ?social=1, `chat-view.ts`) + tên; mọi chữ vào DOM bằng textContent
      const sp = chatSpeaker(m, socialFlagOn());
      const b = document.createElement("b");
      b.append(document.createTextNode(sp.tag));
      if (sp.title !== "") {
        const t = document.createElement("i");
        t.className = "chat-title";
        t.textContent = sp.title;
        b.append(t, document.createTextNode(" "));
      }
      b.append(document.createTextNode(sp.name));
      p.append(b, document.createTextNode(m.text));
    }
    const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 8;
    log.append(p);
    while (log.children.length > 60) log.firstChild!.remove();
    if (atBottom) log.scrollTop = log.scrollHeight;
    bumpChat();
  },

  /**
   * Phím ẩn / hiện TOÀN BỘ giao diện (`ui.toggle`, QUYET_DINH_M3 mục 15): `body.ui-hidden` ẩn cột trái, cột phải (bản đồ nhỏ + menu), chat, nút kỹ năng,
   * thanh đan dược, nút ngữ cảnh, HUD bí cảnh / quyết đấu để có màn chơi sạch; bảng đang mở, hộp thoại, lời mời, thông báo (toast) và biểu ngữ nối lại
   * VẪN hiện. Chỉ trong phiên (không lưu): vào lại là hiện đủ. Trả `true` nếu giờ đang ẩn.
   */
  toggleHidden(): boolean {
    const hidden = document.body.classList.toggle("ui-hidden");
    const key = primaryKeyLabel("ui.toggle");
    this.toast({
      text: hidden ? `Đã ẩn giao diện. Bấm ${key} để hiện lại.` : "Đã hiện lại giao diện.",
      tone: "info",
    });
    return hidden;
  },

  /** Phím mở chat (Enter): khung đang thu gọn thì hiện ô nhập tạm (`typing`, thu lại khi rời ô) rồi đưa con trỏ vào. */
  focusChat() {
    $("chat").classList.add("typing");
    bumpChat();
    ($("chat-input") as HTMLInputElement).focus();
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
    byKeyboard = false,
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
        } else if (
          sectFullText(currentSect.members.length, sectMembersCap(sectHall?.view.caps.members))
        ) {
          // Giới hạn thành viên theo CẤP TÔNG (30 tới 50), lấy từ ảnh chụp Nội vụ: không cứng 30 (máy chủ còn cho mời tới mức cấp)
          sectBtn.disabled = true;
          sectBtn.textContent =
            sectFullText(currentSect.members.length, sectMembersCap(sectHall?.view.caps.members)) ??
            "Tông môn đã đủ";
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
    modalStack.push("player-menu");
    focusModal(menu);
    // mở bằng phím: nhảy thẳng vào nút hành động đầu tiên dùng được (mũi tên + Enter chọn), không phải nút Đóng
    if (byKeyboard) {
      menu.querySelector<HTMLButtonElement>(".pm-btn:not(:disabled):not([hidden])")?.focus();
    }
  },

  closePlayerMenu() {
    $("player-menu").hidden = true;
    modalStack.remove("player-menu");
    returnFocus();
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
    // đang chờ máy chủ trả lời thao tác kho đồ mà có toast tới: coi là lời từ chối / báo (`sectFailMessage`), mở khoá nút (ảnh chụp kho mới tới riêng)
    if (vaultBusy) endVaultBusy();
    if (hallBusy.size) endHallBusy(); // thao tác Nội vụ có toast trả lời (kết quả / từ chối): mở khoá nút
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
      $("death-t").textContent = text ?? `Hồi sinh sau ${secondsLeft}s`;
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

  /** Chip "Mạng chậm" (chờ phản hồi quá ~2,5 giây, `net-slow.ts`): hiện / ẩn, không chặn điều khiển. */
  setNetSlow(slow: boolean) {
    const chip = document.getElementById("net-slow");
    if (chip) chip.hidden = !slow;
  },

  isNetSlowShown(): boolean {
    const chip = document.getElementById("net-slow");
    return !!chip && !chip.hidden;
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
    closeActConfirm(false); // gục lúc hộp xác nhận (đột phá, bán...) còn mở: hộp nằm TRÊN màn hình Hoàng Tuyền nên phải đóng
    activeLimboMsg = msg;
    activeSoulView = msg.soul;
    selectedOrigin =
      msg.soul.origins && msg.soul.origins.length > 0 ? msg.soul.origins[0] : DEFAULT_ORIGIN;
    selectedRelics = [];
    selectedEngrave = null;
    rebirthBusy = false;
    if (rebirthBusyTimer) clearTimeout(rebirthBusyTimer);
    rebirthBusyTimer = null;
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
    // Bàn phím (#463): màn Hoàng Tuyền là hộp thoại chiếm màn hình: vào modalStack (phím thế giới không chạy, Tab xoay trong màn, mũi tên đi giữa
    // các nút). Focus vào KHUNG chứ không vào nút: người vừa gục có thể còn đang nhấn Cách / Enter, nút mua / đầu thai không được ăn phím đó;
    // phải bấm mũi tên mới vào nút đầu tiên.
    modalStack.push("limbo-overlay", null);
    if (overlay) overlay.focus();

    const rebirthBtn = $("limbo-btn-rebirth");
    if (rebirthBtn) {
      rebirthBtn.removeAttribute("aria-disabled");
      rebirthBtn.onclick = (e) => {
        if (rebirthBusy) return; // đã gửi, đang chờ máy chủ: máy chủ cũng bỏ tin `rebirth` thứ hai
        if (ghostClick(e)) return; // click ma sau khi đóng hộp xác nhận (cảm ứng)
        const soul = activeSoulView;
        const choice: RebirthChoice = { origin: selectedOrigin, keep: selectedRelics };
        // `engrave` CHỈ khi người chơi đã đổi tập chiêu khắc (vắng = giữ nguyên chiêu đã khắc); kẹp lại theo danh sách / nấc hiện hành
        if (soul && activeLimboMsg) {
          const cap = engraveSlotsOf(soul.unlocks);
          const sel =
            selectedEngrave === null
              ? null
              : clampEngrave(selectedEngrave, activeLimboMsg.engravable, cap);
          const engrave = engraveToSend(soul.engraved, sel);
          if (engrave !== undefined) choice.engrave = engrave;
        }
        // Tóm tắt trước khi đầu thai (issue #779): xuất thân, số di vật giữ, số chiêu khắc. Đường DUY NHẤT ra khỏi Hoàng Tuyền nên chỉ để bắt lỗi chọn nhầm ("Xem lại" quay về màn chọn)
        const originName = ORIGINS.find((o) => o.id === choice.origin)?.name ?? choice.origin;
        const engraveCount = (choice.engrave ?? soul?.engraved ?? []).length;
        askActConfirm(
          rebirthPlan(originName, choice.keep.length, engraveCount),
          () => {
            if (rebirthBusy) return;
            rebirthBusy = true;
            rebirthBtn.setAttribute("aria-disabled", "true");
            // máy chủ từ chối (toast, vẫn ở Hoàng Tuyền) thì cho bấm lại sau một lát
            rebirthBusyTimer = setTimeout(() => {
              rebirthBusy = false;
              rebirthBusyTimer = null;
              rebirthBtn.removeAttribute("aria-disabled");
            }, REBIRTH_BUSY_MS);
            limboRebirthCb?.(choice);
          },
          rebirthBtn,
        );
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
    closeActConfirm(false); // máy chủ đóng Hoàng Tuyền (đã đầu thai) lúc hộp xác nhận còn mở
    activeLimboMsg = null;
    activeSoulView = null;
    limboBuyCb = null;
    limboRebirthCb = null;
    selectedEngrave = null;
    rebirthBusy = false;
    if (rebirthBusyTimer) clearTimeout(rebirthBusyTimer);
    rebirthBusyTimer = null;
    const overlay = $("limbo-overlay");
    if (overlay) overlay.hidden = true;
    document.body.classList.remove("in-limbo");
    if (modalStack.remove("limbo-overlay")) returnFocus(null);
  },

  /** Tin `ambushOffer` (mục 52): làm sạch rồi mở / CẬP NHẬT hộp thoại (cùng `id` sau nối lại = cập nhật, không đóng bảng, không tính lại khoá 700 ms). */
  onAmbushOffer(raw: unknown) {
    const offer = parseAmbushOffer(raw);
    if (offer === null) return;
    const { dialog, fresh } = openAmbush(ambushDlg, offer, performance.now());
    ambushDlg = dialog;
    const el = $("ambush-modal");
    if (fresh) {
      // lời đề nghị MỚI: bỏ mọi bảng đang mở (người chơi đọc và chọn, không bị che), rồi giữ bàn phím cho hộp thoại
      this.closeAllModals();
      this.closeDuelEndModal();
      this.closeDialog();
      this.closePlayerMenu();
      el.setAttribute("aria-label", ambushDialogView(dialog, performance.now()).announce);
      el.hidden = false;
      document.body.classList.add("in-ambush");
      modalStack.push("ambush-modal", null);
      // focus vào KHUNG, không vào nút: người vừa đang bấm Enter / Cách không được chọn nhầm; nút nào cũng phải do Tab / mũi tên / bấm mới tới
      el.focus();
    }
    renderAmbush();
    if (ambushTimer === null) ambushTimer = setInterval(renderAmbush, AMBUSH_TICK_MS);
  },

  /** Tin `ambushEnd`: đóng hộp thoại (nếu mở) và báo kết cục; huỷ lặng lẽ (`canceled`) không báo gì. */
  onAmbushEnd(raw: unknown) {
    const end = parseAmbushEnd(raw);
    if (end === null) return;
    const inArena = arenaHud !== null; // kết cục của TRẬN trong đấu trường: hiện thẻ kết quả, không chỉ toast
    hideAmbushImpl();
    if (inArena) {
      showArenaResult(end);
      return;
    }
    const text = ambushEndToast(end);
    if (text !== "") this.toast({ text, tone: ambushEndView(end).tone });
  },

  /** Tin `ambushState` (mỗi giây trong đấu trường): làm sạch rồi hiện / làm mới HUD. Tin sai dạng bị bỏ. */
  onAmbushState(raw: unknown) {
    const st = parseAmbushState(raw);
    if (st === null) return;
    arenaHud = updateArenaHud(arenaHud, st, performance.now());
    const hud = $("ambush-hud");
    if (hud.hidden) {
      hud.hidden = false;
      document.body.classList.add("in-arena");
    }
    renderArena();
    if (arenaTimer === null) arenaTimer = setInterval(renderArena, AMBUSH_TICK_MS);
  },

  /** Đóng hộp thoại chặn đường không báo gì (đổi phòng / chuyển cảnh). */
  hideAmbush() {
    hideAmbushImpl();
  },

  isAmbushOpen(): boolean {
    const el = document.getElementById("ambush-modal");
    return Boolean(el && !el.hidden);
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
    if (memContainer && !isDungeonFallen) {
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
    if (isDungeonFallen || !pInfo.showLeaveBtn) {
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
    isDungeonFallen = false;
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
      sealEl.textContent = isWon ? "Thắng" : "Bại";
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
    isDungeonFallen = true;

    // Cập nhật ngay danh sách đội trong HUD bí cảnh: thông báo đã gục (#246)
    const memContainer = $("dhud-members");
    if (memContainer) {
      memContainer.replaceChildren();
      const tag = document.createElement("span");
      tag.className = "dhud-mem dead";
      tag.textContent = "✕ Đã gục, đang được đưa ra...";
      memContainer.append(tag);
    }
    const leaveBtn = $("dhud-btn-leave");
    const confirmBox = $("dhud-leave-confirm");
    if (leaveBtn) leaveBtn.hidden = true;
    if (confirmBox) confirmBox.hidden = true;
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

  isDungeonActive(): boolean {
    return typeof document !== "undefined" && document.body.classList.contains("in-dungeon");
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
      $("sect-modal").hidden = false;
      $("btn-sect")?.classList.add("active");
      $("btn-sect")?.setAttribute("aria-expanded", "true");
      modalStack.push("sect-modal", $("btn-sect"));
      focusModal($("sect-modal"));
      if (sectTab === "hall" && currentSect) callbacks?.onSectHallGet?.();
      renderSectModal();
    } else {
      closeSectConfirm();
      if (actConfirmFromSect) closeActConfirm(false);
      $("sect-modal").hidden = true;
      $("btn-sect")?.classList.remove("active");
      $("btn-sect")?.setAttribute("aria-expanded", "false");
      modalStack.remove("sect-modal");
      returnFocus($("btn-sect"));
      syncHallClock(); // đóng bảng thì dừng đồng hồ tab Nội vụ (trước đây chạy tiếp mỗi giây trên tab ẩn); qua mốc đặt lại đã có hẹn giờ nền (`scheduleHallRefresh`)
    }
  },

  isSectModalOpen(): boolean {
    return sectModalOpen;
  },

  // ---------- Xã hội (M9, #1025) ----------
  /** Mở / đóng bảng Xã hội. Cờ `?social=1` tắt thì KHÔNG mở (phím Shift+G chạy tới đây nhưng không làm gì). */
  toggleSocialModal(force?: boolean) {
    const target = force ?? !socialModalOpen;
    if (target === socialModalOpen) return;
    if (target && !socialEnabled(window.location.search)) return;
    socialModalOpen = target;
    if (socialModalOpen) {
      this.closeAllModals();
      socialModalOpen = true;
      $("social-modal").hidden = false;
      $("btn-social").classList.add("active");
      $("btn-social").setAttribute("aria-expanded", "true");
      modalStack.push("social-modal", $("btn-social"));
      renderSocialTabs();
      renderSocialRank();
      if (socialTab === "rank") requestSocialBoard(socialBoard);
      if (socialTab === "event") requestWorldBoss();
      if (socialTab === "ach") {
        requestAch();
        renderAch();
      }
      syncAchDot();
      syncWbTick();
      focusModal($("social-modal"));
    } else {
      $("social-modal").hidden = true;
      $("btn-social").classList.remove("active");
      $("btn-social").setAttribute("aria-expanded", "false");
      modalStack.remove("social-modal");
      clearSocialBoardTimer();
      if (wbTabTimer !== null) clearTimeout(wbTabTimer);
      wbTabTimer = null;
      if (achTimer !== null) clearTimeout(achTimer);
      achTimer = null;
      if (socialTab === "ach") leaveAch();
      syncWbTick();
      returnFocus($("btn-social"));
    }
  },

  isSocialModalOpen(): boolean {
    return socialModalOpen;
  },

  /** Đổi tab Xã hội; `focus` = đưa focus về nút tab (khi đổi bằng phím mũi tên). Id lạ về tab mặc định. */
  switchSocialTab(tab: string, focus = false) {
    const prevTab = socialTab;
    socialTab = asSocialTab(tab);
    if (prevTab === "ach" && socialTab !== "ach") leaveAch();
    renderSocialTabs();
    if (socialTab === "rank" && socialModalOpen) {
      renderSocialRank();
      requestSocialBoard(socialBoard);
    }
    if (socialTab === "event" && socialModalOpen) requestWorldBoss();
    if (socialModalOpen) {
      if (socialTab === "ach") {
        requestAch();
        renderAch();
      }
      syncAchDot();
    }
    syncWbTick();
    if (focus) $(`social-tab-btn-${socialTab}`).focus();
  },

  /** Đổi bảng xếp hạng (tab phụ). Id lạ bị bỏ qua. `focus` = đưa focus về nút tab (đổi bằng mũi tên). */
  switchSocialBoard(board: string, focus = false) {
    const id = asBoardId(board);
    if (id === null) return;
    socialBoard = id;
    renderSocialRank();
    if (socialModalOpen && socialTab === "rank") requestSocialBoard(id);
    if (focus) $(`social-board-btn-${id}`).focus();
  },

  getSocialBoard(): BoardId {
    return socialBoard;
  },

  /** Nhận tin `boards` từ máy chủ (M9.6): làm sạch, cất bản mới nhất, vẽ lại nếu đang xem tab Xếp hạng. Tin sai kiểu bị bỏ, không sập. */
  setBoards(raw: unknown) {
    const msg = sanitizeBoardsMsg(raw);
    if (msg === null) return;
    socialBoards.set(msg.board, { msg, at: performance.now() });
    if (msg.board === socialBoard) clearSocialBoardTimer();
    if (socialModalOpen && socialTab === "rank") renderSocialRank();
  },

  /**
   * Nhận tin `worldBoss` từ máy chủ (M9.7): làm sạch, cất bản mới nhất, vẽ banner + tab Sự kiện. Cờ `?social=1` tắt thì BỎ tin (người chơi chưa thấy gì).
   * `ended` hiện kết quả thay banner `WB_RESULT_MS` + một toast (không lặp nếu vừa nhận đúng sự kiện đó); tin sai kiểu bị bỏ, không sập.
   */
  setWorldBoss(raw: unknown) {
    if (!socialFlagOn()) return;
    const msg = sanitizeWorldBossMsg(raw);
    if (msg === null) return;
    const prev = wbLast;
    wbLast = { msg, at: performance.now() };
    if (wbTabTimer !== null) clearTimeout(wbTabTimer);
    wbTabTimer = null;
    if (wbResultTimer !== null) clearTimeout(wbResultTimer);
    wbResultTimer = null;
    wbResult = null;
    if (msg.phase === "ended") {
      const v = worldBossView(msg);
      wbResult = { text: v.resultText, tone: v.tone };
      wbResultTimer = setTimeout(() => {
        wbResultTimer = null;
        wbResult = null;
        syncWbTick();
      }, WB_RESULT_MS);
      // `id` là KHUNG GIỜ của lịch (lặp mỗi ngày), không phải mã lần xảy ra: chỉ coi là tin LẶP khi cùng khung giờ + cùng kết quả + đến trong `WB_DUP_MS`
      const dup =
        prev !== null &&
        prev.msg.phase === "ended" &&
        prev.msg.id === msg.id &&
        prev.msg.outcome === msg.outcome &&
        wbLast.at - prev.at < WB_DUP_MS;
      if (!dup) this.toast({ text: v.resultText, tone: v.tone });
    }
    syncWbTick();
  },

  /**
   * Nhận tin `achievements` (M9.8): làm sạch, cất bản mới nhất, vẽ lại nếu đang xem tab Thành tựu. Đây cũng là câu trả lời của máy chủ cho `titleSet` (thành công
   * hay bị từ chối): hết trạng thái "đang đổi". Cờ `?social=1` tắt thì BỎ tin; tin sai kiểu bị bỏ, không sập.
   */
  setAchievements(raw: unknown) {
    if (!socialFlagOn()) return;
    const msg = sanitizeAchievementsMsg(raw);
    if (msg === null) return;
    achLast = msg;
    achPending = undefined;
    if (achPendingTimer !== null) clearTimeout(achPendingTimer);
    achPendingTimer = null;
    if (achTimer !== null) clearTimeout(achTimer);
    achTimer = null;
    renderAch();
  },

  /**
   * Nhận tin `achievementNew` (M9.8): đánh dấu "Mới" + chấm trên nút HUD; máy chủ đã gửi toast "Đạt thành tựu: ..." riêng nên chỉ thêm toast khi thành tựu mở danh hiệu
   * (mời mở bảng Xã hội để đeo). Cờ tắt / tin sai kiểu thì bỏ.
   */
  onAchievementNew(raw: unknown) {
    if (!socialFlagOn()) return;
    const msg = sanitizeAchievementNewMsg(raw);
    if (msg === null) return;
    achNew.add(msg.id);
    syncAchDot();
    renderAch();
    const t = titleUnlockToast(msg.id);
    if (t) this.toast({ text: t, tone: "good" });
  },

  getSocialTab(): SocialTabId {
    return socialTab;
  },

  /** Đóng hộp xác nhận tông môn nếu đang mở (Esc đóng hộp trước, rồi mới tới bảng) */
  closeSectConfirm(): boolean {
    const box = document.getElementById("sect-action-confirm");
    if (!box || box.hidden) return false;
    closeSectConfirm();
    return true;
  },

  switchSectTab(tab: "overview" | "members" | "treasury" | "vault" | "hall") {
    sectTab = tab;
    // vào tab Nội vụ: xin ảnh chụp mới (đồng hồ trong ngày có thể đã qua mốc đặt lại kể từ lần trước)
    if (tab === "hall" && currentSect) callbacks?.onSectHallGet?.();
    renderSectModal();
  },

  /** Ảnh chụp "Nội vụ" (M8.6): làm sạch, thay bản cũ, mở khoá nút; `hall: null` = không còn tông môn. */
  onSectHall(m: SectHallMsg) {
    const view = sanitizeHallView(m?.hall);
    sectHall = view ? { view, at: Date.now() } : null;
    hallRefreshedFor = 0;
    scheduleHallRefresh();
    endHallBusy();
    if (sectModalOpen && sectTab === "hall") renderSectHallTab();
    else if (sectModalOpen && sectTab === "overview") renderSectModal();
  },

  /** Bản sao ảnh chụp "Nội vụ" hiện tại (cho script kiểm / gỡ lỗi). */
  getSectHall() {
    return sectHall?.view ?? null;
  },

  onSect(m: SectMsg) {
    currentSect = m.sect;
    if (socialModalOpen && socialTab === "rank") renderSocialRank(); // câu "Hạng của bạn" của bảng Tông môn phụ thuộc có tông môn hay không
    // Không còn tông môn (bị trục xuất / giải tán): hộp xác nhận cũ không còn ý nghĩa, kho đồ cũng không còn
    if (!m.sect) {
      closeSectConfirm();
      sectVault = null;
      vaultSel = null;
      resetVaultQty();
      endVaultBusy();
      sectHall = null;
      hallGroupOpen.clear();
      hallBuyOpen = null;
      scheduleHallRefresh(); // bỏ hẹn giờ: không còn tông môn thì không xin gì
      endHallBusy();
    }
    if (sectModalOpen) {
      renderSectModal();
    }
  },

  /** Ảnh chụp kho đồ tông môn (mục 27): thay bản cũ, mở khoá nút (máy chủ đã trả lời), vẽ lại nếu đang xem tab Kho đồ. `vault: null` = không còn tông môn. */
  onSectVault(m: SectVaultMsg) {
    sectVault = sanitizeVaultView(m?.vault);
    if (!sectVault) {
      vaultSel = null;
      resetVaultQty();
    }
    if (vaultBusyTimer) clearTimeout(vaultBusyTimer);
    vaultBusyTimer = null;
    vaultBusy = false;
    if (sectModalOpen && sectTab === "vault") renderSectVaultTab();
  },

  /** Bản sao ảnh chụp kho đồ hiện tại (cho script kiểm / gỡ lỗi). */
  getSectVault(): SectVaultView | null {
    return sectVault;
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

  showClientOutdated(minVersion: number, onReload?: () => void, opts?: ShowClientOutdatedOptions) {
    const modal = $("outdated-modal");
    if (!modal) return;
    const msg = $("outdated-msg");
    if (msg) {
      if (opts?.message) {
        msg.textContent = opts.message;
      } else {
        msg.textContent =
          minVersion > 0
            ? `Máy chủ đã nâng cấp phiên bản giao thức mới (yêu cầu tối thiểu v${minVersion}). Vui lòng tải lại trang để nạp bản cập nhật mới nhất.`
            : "Máy chủ đã nâng cấp phiên bản giao thức mới. Vui lòng tải lại trang để tiếp tục phiêu bạt Tiên Giới.";
      }
    }
    modal.hidden = false;

    // Ẩn màn hình đăng nhập nếu đang mở để modal hiển thị trực diện
    const login = $("login");
    if (login) login.hidden = true;

    const btn = $("btn-reload-outdated");
    if (btn) {
      if (defaultOutdatedButtonLabel === null) {
        defaultOutdatedButtonLabel = btn.textContent || "Tải Lại Trang";
      }
      btn.textContent = opts?.buttonLabel ?? defaultOutdatedButtonLabel;
      btn.onclick = () => {
        if (onReload) onReload();
        else window.location.reload();
      };
    }
  },

  isOutdatedModalOpen(): boolean {
    const modal = $("outdated-modal");
    return Boolean(modal && !modal.hidden);
  },
};
