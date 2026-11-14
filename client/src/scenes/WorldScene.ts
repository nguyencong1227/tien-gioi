import { getDisplay } from "../gfx/display";
import { createFxSystem, type FxSystem } from "../gfx/fx/fx";
import { planCastFx } from "../gfx/fx/cast-fx";
import { drawPips, pipsLabel, pipsOf } from "../monster-status";
import { TelegraphLayer } from "../gfx/fx/telegraph-layer";
import {
  planSlashEdges,
  planSwordBeam,
  qiPointsFor,
  slashEdgesFor,
  type FxPoint,
} from "../gfx/fx/skill-fx";
import { motePriority, nextMoteAt, planBreakFail, planLevelUp } from "../gfx/fx/cultivation-fx";
import {
  PORTAL_SWIRL_INTERVAL_MS,
  glintIntervalMs,
  lootGlints,
  nextDueAt,
  planLootDrop,
  planLootPickup,
  portalSwirlPoints,
  rarityTint,
} from "../gfx/fx/world-fx";
import {
  FloatLanes,
  healAmount,
  healNumber,
  isMonsterDeath,
  isMyHit,
  planHitFx,
  planHitNumber,
  planMonsterDeath,
  type HitInput,
  type MyAttack,
} from "../gfx/fx/combat-fx";
import { getQuality, onQualityChange } from "../gfx/quality";
import { buildDecorGrid } from "../gfx/map-decor";
import { mapPackId, mapsNearPortals, neighborMapIds, packs } from "../gfx/packs";
import { styleOf } from "../gfx/map-style";
import { decorTilesetKey, ensureDecorTileset } from "../gfx/decor-tileset";
import { ambientEnabledByUrl, planWeather, weatherEnabledByUrl } from "../gfx/map-weather";
import {
  NO_WATER,
  WATER_KEY,
  WATER_STEP_MS,
  drawShimmer,
  ensureWaterTexture,
  shimmerPhaseKey,
  waterGrid,
} from "../gfx/map-water";
import {
  FOG_KEY,
  advanceU,
  ensureFogTexture,
  fogPatchLayout,
  fogRect,
  planFog,
  type FogPatch,
} from "../gfx/map-fog";
import {
  LIGHT_WHITE_KEY,
  VIGNETTE_KEY,
  ensureLightTextures,
  lightRect,
  planLight,
} from "../gfx/map-light";
import { fitZoom, toCssPoint } from "../gfx/scale";
import Phaser from "phaser";
import type { Room } from "colyseus.js";
import {
  TILE,
  TICK_MS,
  PLAYER_RADIUS,
  SKILLS,
  MONSTER_BY_ID,
  ITEM_BY_ID,
  RARITY_COLORS,
  PICKUP_RANGE,
  NPC_BY_ID,
  NPC_RANGE,
  npcsOfMap,
  QUEST_BY_ID,
  npcMarker,
  questReady,
  statsFor,
  realmLabel,
  GameMap,
  getMap,
  DEFAULT_MAP_ID,
  type InputMsg,
  type StatusMsg,
  SKILL_MSG,
  type CastMsg,
  type SkillDef,
  skillOf,
  type SkillSlot,
  type SkillsMsg,
  type FxMsg,
  type DmgMsg,
  type ChatOut,
  type ToastMsg,
  type InvMsg,
  type LootView,
  type QuestsMsg,
  type DialogMsg,
  type PartyMsg,
  type PartyInvitedMsg,
  type WalletMsg,
  type PortalDef,
  type TravelMsg,
  type LimboMsg,
  type SoulMsg,
  type RebornMsg,
  type SoulBuyMsg,
  type RebirthMsg,
  type RebirthChoice,
  DUNGEON_MSG,
  DUNGEON_FALL_EXIT_MS,
  LINH_HU_MAP_ID,
  type DungeonFallenMsg,
  type DungeonInviteMsg,
  type DungeonStateMsg,
  type DungeonEndMsg,
  DUEL_MSG,
  DUEL_KO_MS,
  isDungeonMap,
  type DuelInvitedMsg,
  type DuelStateMsg,
  type DuelEndMsg,
  type DuelChallengeCheck,
  SECT_MSG,
  type SectMsg,
  type SectPresenceMsg,
  type SectInvitedMsg,
} from "@tien-gioi/shared";
import { preloadAssets, makeTextures, dirFromAngle, TILESET_KEY, ATLAS_KEY } from "../textures";
import { ui } from "../ui";
import { StatusTracker } from "../status-track";
import { BAR_SLOTS, SkillTracker, aimMode, blockedToast, slotView } from "../skill-bar";
import { SkillBarDom } from "../skill-bar-dom";
import { StatusBadgesDom, badgeViews } from "../status-badges";
import { buildSkillsPanel, slotMessage } from "../skills-panel";
import {
  buildMockThuMonDialog,
  dungeonFallenDeathText,
  dungeonFallenSubText,
  isMockDungeonEnabled,
  MOCK_DUNGEON_SAMPLES,
} from "../dungeon";
import { respawnDeathText } from "../death-text";
import { dropSourceIn, hopLabel, nextHop, questGoal, type NavHop } from "../quest-nav";
import { clientCanChallenge } from "../duel";
import { replayEarlyMessages } from "../early-messages";
import { sound } from "../audio";
import { joystick, setupJoystick } from "../joystick";
import { keepLock, pickNextPlayer, pickNextTarget, pickPrevTarget } from "../target-lock";
import {
  ACTION_BY_ID,
  actionOfEvent,
  getKeymap,
  getLookup,
  keyLabels,
  onKeymapChange,
  primaryKeyLabel,
  type ActionId,
} from "../keybinds";
import { getMapOverview, mapGraph, type MapOverview } from "../map-overview";
import { MapCameraControl, attachMapInput } from "../map-input";
import {
  COMPACT_CANVAS_CSS_PX,
  MAP_COLORS,
  cameraView,
  canvasPixelSize,
  drawDot,
  drawHaloText,
  drawMapBase,
  drawMarkerMe,
  fitView,
} from "../map-render";
import { moveVector } from "../move-input";
import { isTypingElement, isReducedMotion } from "../a11y";
import {
  markMonAttack,
  markMonHurt,
  monAnimKey,
  monAnimMs,
  monAnimState,
  newMonAnimClock,
  type MonAnimClock,
  type MonAnimState,
} from "../gfx/anim/mon-anim";
import {
  FAR_ANIM_DIST,
  SHADOW_ALPHA,
  SHADOW_KEY,
  animUpdateDue,
  ensureShadowTexture,
  labelVisible,
  monsterShadow,
  playerShadow,
  type ShadowDims,
} from "../gfx/anim/entity-lod";
import {
  HURT_PULSE_MS,
  NEUTRAL_TWEEN,
  WALK_BOB_PERIOD_MS,
  footPlant,
  sinceStart,
  spriteTween,
  tweenEnabled,
} from "../gfx/anim/tween";
import {
  PLAYER_DIE_FRAMES,
  animReducedMotion,
  markPlayerHurt,
  newPlayerAnimClock,
  playerAnimKey,
  playerAnimState,
  type PlayerAnimClock,
  type PlayerAnimState,
} from "../gfx/anim/player-anim";

interface Entity {
  root: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  bar: Phaser.GameObjects.Graphics;
  label?: Phaser.GameObjects.Text;
  aura?: Phaser.GameObjects.Ellipse;
  talismanRing?: Phaser.GameObjects.Arc;
  weaponVisual?: Phaser.GameObjects.Graphics;
  animPrefix?: string;
  lastEquipKey?: string;
  lastBarKey?: number;
  /** Huy hiệu trạng thái có hại trên đầu quái (M7.7 bước 3b, #508): Graphics dựng lười, mặt nạ `Monster.fx` đã vẽ và số chấm */
  statusG?: Phaser.GameObjects.Graphics;
  lastFx?: number;
  pipCount?: number;
  pipText?: string;
  /** Số lần vẽ lại hàng chấm (script kiểm: chỉ tăng khi mặt nạ đổi) */
  pipDraws?: number;
  tx: number; // vị trí đích (từ server) để nội suy
  ty: number;
  lastLabel?: string;
  slashUntil?: number;
  /** Hoạt ảnh yêu thú (M5.2 #328): loại quái, cờ thời gian đánh / bị đánh, trạng thái đang phát. */
  monKind?: string;
  monAnim?: MonAnimClock;
  monAnimState?: MonAnimState;
  /** Hoạt ảnh người chơi (M5.2 #328 phần 2): cờ bị đánh và trạng thái đang phát. */
  playerAnim?: PlayerAnimClock;
  playerAnimState?: PlayerAnimState;
  /** Mốc phát đốm sáng thiền định kế tiếp (ms, đồng hồ cảnh; M5.2 #329). */
  nextMoteAt?: number;
  /** Lần cập nhật trạng thái hoạt ảnh gần nhất (ms): thực thể ở xa chỉ cập nhật theo `farAnimHz` (M5.2 #328 2b). */
  lastAnimAt?: number;
  /** Bóng đốm dưới chân (hiện theo `blobShadows` của hồ sơ chất lượng) và trạng thái đã áp dụng. */
  shadow?: Phaser.GameObjects.Image;
  shadowOn?: boolean;
  /** Tween nhẹ (M5.2 #328 2b đợt 3): vị trí dọc gốc của sprite, lệch pha nhịp nảy riêng, đang áp tween (để trả về trung tính đúng một lần). */
  spriteBaseY?: number;
  tweenPhase?: number;
  tweenActive?: boolean;
  /** Khoảng cách tới nhân vật của mình (px) do `animDue` tính ở khung này; `stepTween` dùng lại (không tính `Math.hypot` lần nữa). */
  distMe?: number;
}

/** Thời lượng đòn đánh của người chơi (ms): `slashUntil = now + SLASH_MS` (hoạt ảnh Chém và tween co giãn dùng chung). */
const SLASH_MS = 220;

interface SlashFxItem {
  g: Phaser.GameObjects.Graphics;
  start: number;
}

interface SwordFxItem {
  img: Phaser.GameObjects.Image;
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  start: number;
}

interface LootEntity {
  root: Phaser.GameObjects.Container;
  ring: Phaser.GameObjects.Arc;
  icon: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  itemId: string;
  qty: number;
  /** Mốc lấp lánh kế tiếp (ms, đồng hồ cảnh) cho đồ từ lam trở lên (M5.2 #329). */
  nextGlintAt?: number;
}

interface NpcEntity {
  id: string;
  root: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  nameLabel: Phaser.GameObjects.Text;
  titleLabel: Phaser.GameObjects.Text;
  markerText: Phaser.GameObjects.Text;
  markerAura: Phaser.GameObjects.Arc;
  x: number;
  y: number;
}

const LERP_RATE = 14; // nội suy vị trí người khác / quái

export class WorldScene extends Phaser.Scene {
  private players = new Map<string, Entity>();
  private monsters = new Map<string, Entity>();
  private loots = new Map<string, LootEntity>();
  /** Chưa phát hiệu ứng "đồ xuất hiện" trước mốc này (vào phòng / đổi bản đồ: đồ có sẵn không nổ hạt cùng lúc). */
  private lootFxFrom = 0;
  /** Lần nhặt gần nhất của chính mình: đồ biến mất ngay sau đó thì mới nổ hiệu ứng nhặt. */
  private lastPickup: { id: string; at: number } | null = null;
  private portalFxAt = new Map<string, number>();
  private npcs = new Map<string, NpcEntity>();
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  // Đoán trước di chuyển của chính mình
  private seq = 0;
  private pending: InputMsg[] = [];
  /** Trạng thái của CHÍNH MÌNH (M7.2b): hệ số tốc độ để đoán trước di chuyển như server, và choáng (không đoán trước / không gửi input) */
  private status = new StatusTracker();
  /** Sổ chiêu + hồi chiêu của CHÍNH MÌNH (M7.6, #507): thanh chiêu L U I O vẽ từ đây; client không đoán trước kết quả `cast` */
  private skills = new SkillTracker();
  private skillBar = new SkillBarDom(document);
  /** Huy hiệu trạng thái của mình ở HUD (M7.7 bước 3a, #508) */
  private statusBadges = new StatusBadgesDom<HTMLElement>(
    document.getElementById("hud-status") as HTMLElement,
    document,
  );
  private nextSkillBarAt = 0;
  /** Khoá (cảnh giới|bậc|linh lực tối đa) của lần dựng bảng Công pháp gần nhất: đổi lúc bảng đang mở thì dựng lại */
  private skillsPanelKey = "";
  private slotKeys: Record<SkillSlot, string[]> = { 2: [], 3: [], 4: [], 5: [] };
  /** Con trỏ CHUỘT đang ở trong canvas (chạm / bút thì không): chiêu nhắm theo con trỏ khi đúng */
  private mouseIn = false;
  private predX = 0;
  private predY = 0;
  private hasMe = false;
  private acc = 0;
  private facing = Math.PI / 2;
  private moving = false;
  private isReconnecting = false;
  private duelKoUntil = 0;
  private dungeonFallUntil = 0;

  private nextSlash = 0;
  /** Khoá mục tiêu (#327): id quái đang khoá (null = tự ngắm quái gần nhất như cũ) và vòng đánh dấu. */
  private lockedTargetId: string | null = null;
  private targetRing?: Phaser.GameObjects.Arc;
  /** Nút Mục tiêu mờ đi khi không có quái trong tầm khoá (kiểm mỗi 200 ms, chỉ ghi DOM khi đổi). */
  private targetIdleAt = 0;
  private targetBtnIdle?: boolean;
  private nextSword = 0;
  private nearestLootId: string | null = null;
  private closestNpcId: string | null = null;
  public lastCombatAt = 0;
  private prevHp = 0;
  /** Đòn gần nhất của chính mình (suy "đòn trúng này của mình" cho hiệu ứng; xem gfx/fx/combat-fx.ts). */
  private lastAttack: MyAttack | null = null;
  /** Hàng chữ bay theo mục tiêu: dồn đòn không đè chữ lên nhau (gfx/fx/combat-fx.ts). */
  private floatLanes = new FloatLanes();

  /** Đánh dấu người chơi vừa tham gia giao tranh (tấn công hoặc bị tấn công) */
  public recordCombat() {
    this.lastCombatAt = Date.now();
  }

  /** Kiểm tra xem người chơi có đang trong giao tranh (8 giây gần nhất) hay không */
  public isInCombat(): boolean {
    return Date.now() - this.lastCombatAt < 8000;
  }

  // Mũi tên chỉ đường nhiệm vụ
  private navArrow!: Phaser.GameObjects.Container;
  /** Chữ cạnh mũi tên khi đang chỉ tới CỔNG (đích ở bản đồ khác), vd "Qua Vọng Trạch Quan" */
  private navLabel!: Phaser.GameObjects.Text;
  private navLabelText = "";
  private lastMapDraw = 0;
  /** Camera của bản đồ lớn (phóng / kéo, bám theo mình) và các cờ vẽ lại */
  private readonly mapCtl = new MapCameraControl();
  private mapWasOpen = false;
  private lastBigMeX = 0;
  private lastBigMeY = 0;
  /** Bản đồ đang XEM ở bản đồ lớn (`null` = bản đồ mình đang đứng); chọn ở sơ đồ nối */
  private mapViewId: string | null = null;
  private mapRedrawPending = false;

  // Tái sử dụng Set và hồ đối tượng (object pool) để giảm cấp phát mỗi frame (#71)
  private seenIds = new Set<string>();
  private auraWave = 0;
  private talismanWave = 0;
  private lootWave = 0;
  private lastAuxSync = 0;
  private slashPool: Phaser.GameObjects.Graphics[] = [];
  private activeSlashes: SlashFxItem[] = [];
  private swordPool: Phaser.GameObjects.Image[] = [];
  private activeSwords: SwordFxItem[] = [];
  /** Lõi hiệu ứng M5.2 (#325): chữ bay, hạt có ngân sách; B thêm công thức ở #329. */
  fx!: FxSystem;
  /** Báo trước đòn + đạn tầm xa của quái (M7.7, #508): Graphics từ pool, không tốn ngân sách hạt */
  telegraphs!: TelegraphLayer;

  // Bảng đo hiệu năng (?perf=1, #71)
  private perfEnabled = false;
  private perfRing = new Float64Array(360);
  private perfRingIdx = 0;
  private perfRingCount = 0;
  private perfSortBuf: number[] = [];
  private lastPerfDraw = 0;
  private perfFrameHistory: number[] = [];
  private perfUpdateHistory: number[] = [];
  private perfTweenSum = 0;
  private perfTweenMax = 0;
  private perfPlayersSum = 0;
  private perfMonstersSum = 0;
  private perfLootsSum = 0;

  public map: GameMap;
  private mapTilemap?: Phaser.Tilemaps.Tilemap;
  private mapLayer?: Phaser.Tilemaps.TilemapLayer;
  /** Lớp trang trí tất định (M5.3 #332): tilemap thứ hai, tileset vẽ bằng mã theo kiểu bản đồ. */
  private decorTilemap?: Phaser.Tilemaps.Tilemap;
  decorLayer?: Phaser.Tilemaps.TilemapLayer;
  /** Ánh sáng môi trường + vignette (M5.3 #332 bước 2b): hai ảnh phủ cố định theo màn hình, hiện theo hồ sơ chất lượng. */
  lightAmbient?: Phaser.GameObjects.Image;
  lightVignette?: Phaser.GameObjects.Image;
  private lightLayoutKey = "";
  /**
   * Thời tiết bằng hạt (M5.3 #332 bước 2c). Tắt khi `?debug` (trừ `?weather=1`) để các script đo hạt / điểm ảnh có cảnh sạch;
   * e2e bật / tắt lúc chạy bằng thuộc tính này.
   */
  weatherPaused = false;
  /** Mặt nước lấp lánh (M5.3 #332 bước 2e): MỘT lớp tilemap chỉ gồm ô nước, tileset canvas nhỏ vẽ lại ~4 lần/giây. */
  private waterTilemap?: Phaser.Tilemaps.Tilemap;
  waterLayer?: Phaser.Tilemaps.TilemapLayer;
  private waterPhaseKey = -1;
  /** Đốm nước đứng yên khi `?debug` (trừ `?water=1`): cảnh tĩnh để các script điểm ảnh có ảnh đối chứng không nhiễu. */
  waterPaused = false;
  /** Sương trôi (M5.3 #332 bước 2d): các ảnh mảng sương (cố định theo màn hình) + bố cục theo tỉ lệ khung nhìn. */
  fogImages: Phaser.GameObjects.Image[] = [];
  private fogPatches: FogPatch[] = [];
  private fogSpeed = 0;
  private fogLastNow = 0;
  /** Sương đứng yên khi `?debug` (trừ `?fog=1`): cảnh tĩnh để các script điểm ảnh có ảnh đối chứng không nhiễu. */
  fogPaused = false;
  private weatherNextAt: number | undefined;
  private townVisuals: Phaser.GameObjects.GameObject[] = [];
  private portalVisuals: Phaser.GameObjects.GameObject[] = [];
  private nearPortal: PortalDef | null = null;

  constructor(
    private room: Room,
    map?: GameMap,
  ) {
    super("world");
    this.map = map ?? getMap(DEFAULT_MAP_ID)!;
  }

  private get state(): any {
    return this.room.state;
  }
  private get sid() {
    return this.room.sessionId;
  }

  preload() {
    preloadAssets(this);
  }

  create() {
    makeTextures(this);

    this.buildMapVisuals();
    ui.setCurrentMapId(this.map.def.id);
    this.prefetchPacks();

    // Lõi hiệu ứng (#325): ngân sách theo hồ sơ chất lượng; đóng cảnh thì giải phóng sạch
    this.fx = createFxSystem(this, { getProfile: getQuality, depth: () => this.map.worldH });
    this.telegraphs = new TelegraphLayer(this, {
      emitterBudget: () => getQuality().emitterBudget,
      reduced: () => getQuality().reducedMotion,
      inView: (x, y, pad) => this.inView(x, y, pad),
    });
    ensureShadowTexture(this);
    this.weatherPaused =
      typeof window !== "undefined" && !weatherEnabledByUrl(window.location.search);
    this.waterPaused =
      typeof window !== "undefined" && !ambientEnabledByUrl(window.location.search, "water");
    this.fogPaused =
      typeof window !== "undefined" && !ambientEnabledByUrl(window.location.search, "fog");
    const offQuality = onQualityChange(() => {
      this.applyLight();
      this.applyFog();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      offQuality();
      this.fx.destroy();
      this.telegraphs.destroy();
    });

    // Mũi tên chỉ hướng nhiệm vụ xoay quanh người chơi
    this.createNavArrow();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.map.worldW, this.map.worldH);
    // Luật zoom theo ĐƠN VỊ CSS (gfx/scale.fitZoom: giữ vùng nhìn trong bán kính StateView 1100 px) nhân renderScale:
    // canvas lớn gấp renderScale lần nên camera zoom cũng nhân lên, vùng nhìn trong thế giới KHÔNG đổi (#324)
    const applyZoom = () => {
      const d = getDisplay();
      cam.setZoom(fitZoom(d.cssW, d.cssH) * d.renderScale);
    };
    applyZoom();
    this.scale.on("resize", applyZoom);

    ui.init({
      onUse: (slot) => !this.isReconnecting && this.room.send("useItem", { slot }),
      onEquip: (slot) => !this.isReconnecting && this.room.send("equip", { slot }),
      onUnequip: (slot) => !this.isReconnecting && this.room.send("unequip", { slot }),
      onCraft: (recipeId) => !this.isReconnecting && this.room.send("craft", { recipeId }),
      onDrop: (slot, qty) =>
        !this.isReconnecting &&
        this.room.send("dropItem", qty !== undefined ? { slot, qty } : { slot }),
      onPickup: () => !this.isReconnecting && this.pickupNearest(),
      // Esc khi không còn bảng nào để đóng: bỏ chọn mục tiêu (QUYET_DINH_M3 mục 13, #463)
      onClearTarget: () => {
        if (this.lockedTargetId === null) return false;
        this.setLockedTarget(null);
        return true;
      },
      onTalk: () => !this.isReconnecting && this.talkClosestNpc(),
      // Bảng Công pháp (M7.6): gắn / gỡ chiêu; KHÔNG đoán trước kết quả, máy chủ trả `skills` (sổ đúng) hoặc toast khi từ chối
      onSkillSlot: (slot, skillId) =>
        !this.isReconnecting && this.room.send(SKILL_MSG.slot, slotMessage(slot, skillId)),
      onSkillsOpen: () => this.refreshSkillsPanel(),
      onDialogAction: (action) => {
        if (this.isReconnecting) return;
        if (action.kind === "accept") this.room.send("questAccept", { questId: action.questId });
        else if (action.kind === "turnIn")
          this.room.send("questTurnIn", { questId: action.questId });
        else if (action.kind === "trade") this.room.send("trade", { tradeId: action.tradeId });
        else if (action.kind === "dungeon") {
          if (isMockDungeonEnabled()) {
            ui.onDungeonInvite(MOCK_DUNGEON_SAMPLES.invite(this.me()?.name || "Trương Tiểu Phàm"));
          } else {
            this.room.send(DUNGEON_MSG.open, { dungeonId: action.dungeonId });
          }
        }
      },
      onTrackQuest: () => {
        // Tracker được cập nhật tự động trong update()
      },
      onPartyLeave: () => !this.isReconnecting && this.room.send("partyLeave"),
      onPartyKick: (name) => !this.isReconnecting && this.room.send("partyKick", { name }),
      onPartyInvite: (name) => !this.isReconnecting && this.room.send("partyInvite", { name }),
      onPartyAccept: (from) => !this.isReconnecting && this.room.send("partyAccept", { from }),
      onPartyDecline: (from) => !this.isReconnecting && this.room.send("partyDecline", { from }),
      onBuy: (npcId, itemId, qty) =>
        !this.isReconnecting && this.room.send("buy", { npcId, itemId, qty }),
      onSell: (npcId, slot, qty) =>
        !this.isReconnecting && this.room.send("sell", { npcId, slot, qty }),
      onDungeonEnter: (runId) => {
        if (this.isReconnecting) return;
        if (isMockDungeonEnabled()) {
          const dMap = getMap(LINH_HU_MAP_ID)!;
          this.changeMap(this.room, dMap);
          this.predX = dMap.townPx.x;
          this.predY = dMap.townPx.y;
          ui.onDungeonState(MOCK_DUNGEON_SAMPLES.stateBossFight());
        } else {
          this.room.send(DUNGEON_MSG.enter, { runId });
        }
      },
      onDungeonDecline: (runId) => {
        if (this.isReconnecting) return;
        if (!isMockDungeonEnabled()) {
          this.room.send(DUNGEON_MSG.decline, { runId });
        }
      },
      onDungeonLeave: () => {
        if (this.isReconnecting) return;
        if (isMockDungeonEnabled()) {
          const wMap = getMap(DEFAULT_MAP_ID)!;
          this.changeMap(this.room, wMap);
          this.predX = wMap.townPx.x;
          this.predY = wMap.townPx.y;
        } else {
          this.room.send(DUNGEON_MSG.leave, {});
        }
      },
      onDuelChallenge: (name) =>
        !this.isReconnecting && this.room.send(DUEL_MSG.challenge, { name }),
      onDuelAccept: (from) => !this.isReconnecting && this.room.send(DUEL_MSG.accept, { from }),
      onDuelDecline: (from) => !this.isReconnecting && this.room.send(DUEL_MSG.decline, { from }),
      onDuelYield: () => !this.isReconnecting && this.room.send(DUEL_MSG.yield, {}),
      onSectCreate: (name, tag) =>
        !this.isReconnecting && this.room.send(SECT_MSG.create, { name, tag }),
      onSectInvite: (name) => !this.isReconnecting && this.room.send(SECT_MSG.invite, { name }),
      onSectAccept: (from) => !this.isReconnecting && this.room.send(SECT_MSG.accept, { from }),
      onSectDecline: (from) => !this.isReconnecting && this.room.send(SECT_MSG.decline, { from }),
      onSectLeave: () => !this.isReconnecting && this.room.send(SECT_MSG.leave, {}),
      onSectKick: (name) => !this.isReconnecting && this.room.send(SECT_MSG.kick, { name }),
      onSectRank: (name, rank) =>
        !this.isReconnecting && this.room.send(SECT_MSG.rank, { name, rank }),
      onSectTransfer: (name) => !this.isReconnecting && this.room.send(SECT_MSG.transfer, { name }),
      onSectDisband: () => !this.isReconnecting && this.room.send(SECT_MSG.disband, {}),
      onSectMotd: (motd) => !this.isReconnecting && this.room.send(SECT_MSG.motd, { motd }),
      onSectDeposit: (amount) =>
        !this.isReconnecting && this.room.send(SECT_MSG.deposit, { amount }),
      onSectWithdraw: (amount) =>
        !this.isReconnecting && this.room.send(SECT_MSG.withdraw, { amount }),
    });

    this.setupInput();
    setupJoystick();
    this.setupNetwork();
    this.setupPerfProbe();
    if (
      typeof window !== "undefined" &&
      (import.meta.env.DEV || new URLSearchParams(location.search).has("debug"))
    ) {
      (window as any).__game = this.game;
      (window as any).__scene = this;
      (window as any).__fx = this.fx;
      // Cho `leak:test` (client/scripts/leak-test.mjs) dựng lại hình ảnh của từng bản đồ ngay trong trang (#408 bước 4)
      (window as any).__getMap = getMap;
    }
  }

  /** Dựng / cập nhật hai ảnh phủ ánh sáng theo kiểu bản đồ hiện tại và hồ sơ chất lượng (gọi lại khi đổi bản đồ / chất lượng). */
  private applyLight() {
    ensureLightTextures(this);
    const depth = this.map.worldH + 200; // trên mọi thực thể và hạt, dưới HUD (DOM)
    if (!this.lightAmbient)
      this.lightAmbient = this.add
        .image(0, 0, LIGHT_WHITE_KEY)
        .setScrollFactor(0)
        .setOrigin(0.5)
        .setVisible(false);
    if (!this.lightVignette)
      this.lightVignette = this.add
        .image(0, 0, VIGNETTE_KEY)
        .setScrollFactor(0)
        .setOrigin(0.5)
        .setVisible(false);
    this.lightAmbient.setDepth(depth);
    this.lightVignette.setDepth(depth + 1);
    const plan = planLight(styleOf(this.map.def.id), getQuality());
    if (plan.ambient)
      this.lightAmbient.setTint(plan.ambient.color).setAlpha(plan.ambient.alpha).setVisible(true);
    else this.lightAmbient.setVisible(false);
    if (plan.vignette)
      this.lightVignette
        .setTint(plan.vignette.color)
        .setAlpha(plan.vignette.alpha)
        .setVisible(true);
    else this.lightVignette.setVisible(false);
    this.lightLayoutKey = ""; // đặt lại kích thước ở khung kế
  }

  /** Dựng lại các mảng sương theo kiểu bản đồ + hồ sơ chất lượng (số mảng 0 / không sương thì chỉ dọn). */
  private applyFog() {
    for (const im of this.fogImages) im.destroy();
    this.fogImages = [];
    this.fogPatches = [];
    const plan = planFog(styleOf(this.map.def.id).fog, getQuality());
    if (!plan) return;
    ensureFogTexture(this);
    this.fogPatches = fogPatchLayout(plan.count, this.map.def.seed);
    this.fogSpeed = plan.speed;
    for (let i = 0; i < plan.count; i++)
      this.fogImages.push(
        this.add
          .image(0, 0, FOG_KEY)
          .setScrollFactor(0)
          .setOrigin(0.5)
          .setDepth(this.map.worldH + 150) // trên thực thể và hạt, dưới ánh sáng + vignette (+200)
          .setTint(plan.color)
          .setAlpha(plan.alpha),
      );
    this.fogLastNow = 0;
    this.stepFog(this.time.now); // đặt chỗ NGAY: không để mảng sương nằm ở (0, 0) với cỡ gốc một khung nào
  }

  /** Mỗi khung: trôi các mảng sương (đứng yên khi giảm chuyển động) và đặt chỗ theo khung nhìn hiện tại. */
  private stepFog(now: number) {
    if (this.fogImages.length === 0) return;
    const cam = this.cameras.main;
    const dt = this.fogLastNow ? Math.min(100, now - this.fogLastNow) : 0;
    this.fogLastNow = now;
    const still = getQuality().reducedMotion || this.fogPaused;
    for (let i = 0; i < this.fogImages.length; i++) {
      const p = this.fogPatches[i];
      if (!still) p.u = advanceU(p.u, dt, this.fogSpeed, p.speed, cam.displayWidth, p.size);
      const r = fogRect(p, cam.width, cam.height, cam.displayWidth, cam.displayHeight);
      if (r) this.fogImages[i].setPosition(r.x, r.y).setDisplaySize(r.w, r.h);
    }
  }

  /** Đốm sáng mặt nước: vẽ lại mỗi `WATER_STEP_MS` (giảm chuyển động hoặc bậc Thấp: một khung tĩnh, không vẽ lại). */
  private stepWater(now: number) {
    if (!this.waterLayer) return;
    const prof = getQuality();
    const still = prof.reducedMotion || prof.tier === "low" || this.waterPaused;
    const key = shimmerPhaseKey(now, still);
    if (key === this.waterPhaseKey) return;
    this.waterPhaseKey = key;
    drawShimmer(
      ensureWaterTexture(this),
      styleOf(this.map.def.id),
      still ? 0 : key * WATER_STEP_MS,
    );
  }

  /** Thời tiết: mỗi nhịp một lần phát phủ khung nhìn (kế hoạch thuần ở gfx/map-weather.ts; hồ sơ chất lượng quyết định tốc độ). */
  private emitWeather(now: number) {
    if (this.weatherPaused) return;
    const prof = getQuality();
    const plan = planWeather(
      styleOf(this.map.def.id).weather,
      prof.weather,
      prof.reducedMotion,
      this.cameras.main.worldView,
      now,
      this.weatherNextAt,
    );
    if (!plan) return;
    this.weatherNextAt = plan.nextAt;
    this.fx.play(plan.recipe, plan.x, plan.y, { area: plan.area });
  }

  /** Giữ hai ảnh phủ che đủ khung nhìn khi camera đổi cỡ / thu phóng (so sánh vài con số mỗi khung, không cấp phát). */
  private layoutLight() {
    const cam = this.cameras.main;
    const k = `${cam.width}|${cam.height}|${cam.zoom}`;
    if (k === this.lightLayoutKey) return;
    const r = lightRect(cam.width, cam.height, cam.displayWidth, cam.displayHeight);
    if (!r) return;
    this.lightLayoutKey = k;
    this.lightAmbient?.setPosition(r.x, r.y).setDisplaySize(r.w, r.h);
    this.lightVignette?.setPosition(r.x, r.y).setDisplaySize(r.w, r.h);
  }

  private buildMapVisuals() {
    // 1. Hủy lớp ô cũ nếu có
    if (this.mapLayer) {
      this.mapLayer.destroy();
      this.mapLayer = undefined;
    }
    if (this.mapTilemap) {
      this.mapTilemap.destroy();
      this.mapTilemap = undefined;
    }
    if (this.waterLayer) {
      this.waterLayer.destroy();
      this.waterLayer = undefined;
    }
    if (this.waterTilemap) {
      this.waterTilemap.destroy();
      this.waterTilemap = undefined;
    }
    if (this.decorLayer) {
      this.decorLayer.destroy();
      this.decorLayer = undefined;
    }
    if (this.decorTilemap) {
      this.decorTilemap.destroy();
      this.decorTilemap = undefined;
    }

    // 2. Dựng tilemap mới
    const data: number[][] = [];
    const mw = this.map.def.w;
    const mh = this.map.def.h;
    for (let y = 0; y < mh; y++)
      data.push(Array.from(this.map.tiles.subarray(y * mw, (y + 1) * mw)));
    this.mapTilemap = this.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    const ts = this.mapTilemap.addTilesetImage("tiles", TILESET_KEY, TILE, TILE, 0, 0)!;
    this.mapLayer = this.mapTilemap.createLayer(0, ts, 0, 0)!;
    this.mapLayer.setDepth(-10);

    // 2b. Lớp trang trí tất định (cỏ, hoa, đá, nấm, bụi): thuần thị giác, sinh từ seed + mapId nên mọi người thấy giống nhau
    const style = styleOf(this.map.def.id);
    const decorGrid = buildDecorGrid(this.map, style);
    const decorRows: number[][] = [];
    for (let y = 0; y < mh; y++)
      decorRows.push(Array.from(decorGrid.subarray(y * mw, (y + 1) * mw)));
    this.decorTilemap = this.make.tilemap({ data: decorRows, tileWidth: TILE, tileHeight: TILE });
    const decorKey = ensureDecorTileset(this, this.map.def.id, style);
    const decorTs = this.decorTilemap.addTilesetImage(
      decorTilesetKey(this.map.def.id),
      decorKey,
      TILE,
      TILE,
      0,
      0,
    )!;
    this.decorLayer = this.decorTilemap.createLayer(0, decorTs, 0, 0)!;
    this.decorLayer.setDepth(-9);

    // 2b'. Mặt nước lấp lánh: một lớp chỉ gồm các ô nước, đốm sáng trôi (vẽ lại ở stepWater)
    const waterCells = waterGrid(this.map);
    if (waterCells.some((v) => v !== NO_WATER)) {
      const waterRows: number[][] = [];
      for (let y = 0; y < mh; y++)
        waterRows.push(Array.from(waterCells.subarray(y * mw, (y + 1) * mw)));
      this.waterTilemap = this.make.tilemap({ data: waterRows, tileWidth: TILE, tileHeight: TILE });
      const waterTex = ensureWaterTexture(this);
      drawShimmer(waterTex, style, 0);
      this.waterPhaseKey = 0;
      const waterTs = this.waterTilemap.addTilesetImage(WATER_KEY, WATER_KEY, TILE, TILE, 0, 0)!;
      this.waterLayer = this.waterTilemap.createLayer(0, waterTs, 0, 0)!;
      this.waterLayer.setDepth(-8);
    }

    // 2c. Ánh sáng môi trường + vignette theo kiểu bản đồ (hiện theo hồ sơ chất lượng)
    this.applyLight();
    this.applyFog();
    this.weatherNextAt = undefined; // đổi bản đồ: thời tiết của bản đồ mới phát ngay

    // 3. Dựng nhãn và vòng an toàn của trấn / trạm (nếu có trấn)
    for (const obj of this.townVisuals) obj.destroy();
    this.townVisuals = [];
    if (this.map.townPx.r > 0) {
      // Tên trấn bằng tiếng Việt (không chữ Hán, QUYET_DINH_M3 mục 12); Lạc Hà Trấn lấy từ `MapDef.townName` như mọi bản đồ
      const townLabel = this.map.townName;
      const t1 = this.add
        .text(this.map.townPx.x, this.map.townPx.y - 40, townLabel, {
          fontFamily: '"Noto Serif", Georgia, serif',
          fontSize: this.map.def.id === DEFAULT_MAP_ID ? "56px" : "36px",
          color: "#7a3b2e",
        })
        .setOrigin(0.5)
        .setAlpha(0.35)
        .setDepth(-5);

      const t2 = this.add
        .text(this.map.townPx.x, this.map.townPx.y + 14, `${this.map.townName} · Khu an toàn`, {
          fontFamily: '"Noto Serif", Georgia, serif',
          fontSize: "16px",
          color: "#5a4030",
        })
        .setOrigin(0.5)
        .setAlpha(0.6)
        .setDepth(-5);

      const c = this.add
        .circle(this.map.townPx.x, this.map.townPx.y, this.map.townPx.r, 0, 0)
        .setStrokeStyle(2, 0xa31d1d, 0.25)
        .setDepth(-5);

      this.townVisuals.push(t1, t2, c);
    }

    // 3b. Dựng hang trùm (nếu bản đồ có lairPx như trong bí cảnh)
    if (this.map.lairPx) {
      const lx = this.map.lairPx.x;
      const ly = this.map.lairPx.y;
      const lr = this.map.lairPx.r;
      const lairCircle = this.add
        .circle(lx, ly, lr, 0x581c87, 0.14)
        .setStrokeStyle(2, 0xa855f7, 0.45)
        .setDepth(-5);
      const lairTitle = this.add
        .text(lx, ly - 24, "Hang Yêu Vương", {
          fontFamily: '"Noto Serif", Georgia, serif',
          fontSize: "20px",
          fontStyle: "bold",
          color: "#d8b4fe",
        })
        .setOrigin(0.5)
        .setAlpha(0.65)
        .setDepth(-5);
      this.townVisuals.push(lairCircle, lairTitle);
    }

    // 4. Dựng các cổng truyền tống của bản đồ
    for (const obj of this.portalVisuals) obj.destroy();
    this.portalVisuals = [];
    for (const p of this.map.portals) {
      const safeCircle = this.add
        .circle(p.x, p.y, p.safeR, 0, 0)
        .setStrokeStyle(2, 0x4a90e2, 0.25)
        .setDepth(-5);

      const spr = this.add.sprite(p.x, p.y, "portal").setDepth(p.y);
      if (!isReducedMotion()) {
        this.tweens.add({
          targets: spr,
          angle: 360,
          duration: 6000,
          repeat: -1,
        });
      }

      const label = this.add
        .text(p.x, p.y - 32, p.name, {
          fontFamily: '"Noto Serif", Georgia, serif',
          fontSize: "13px",
          fontStyle: "bold",
          color: "#a8ff78",
          stroke: "#1d1a16",
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(p.y + 1);

      this.portalVisuals.push(safeCircle, spr, label);
    }

    // 5. Khởi tạo / cập nhật lại các NPC của bản đồ hiện tại
    this.spawnNpcs();

    // 6. Camera bounds
    if (this.cameras?.main) {
      this.cameras.main.setBounds(0, 0, this.map.worldW, this.map.worldH);
    }
  }

  private spawnNpcs() {
    for (const [, ne] of this.npcs) {
      ne.root.destroy();
    }
    this.npcs.clear();
    this.closestNpcId = null;

    const mapNpcs = npcsOfMap(this.map.def.id);
    for (const npc of mapNpcs) {
      const root = this.add.container(npc.x, npc.y).setDepth(npc.y);
      const texKey = `npc-${npc.id}`;
      const hasTex = this.textures.exists(texKey);
      const sprite = hasTex
        ? this.add.sprite(0, -12, texKey)
        : this.add.sprite(0, -12, "dot").setTint(npc.color);

      const nameLabel = this.add
        .text(0, -42, npc.name, {
          fontFamily: '"Noto Serif", Georgia, serif',
          fontSize: "12px",
          fontStyle: "bold",
          color: "#ffe08a",
          stroke: "#1d1a16",
          strokeThickness: 3,
        })
        .setOrigin(0.5);

      const titleLabel = this.add
        .text(0, -30, npc.title, {
          fontFamily: '"Noto Serif", Georgia, serif',
          fontSize: "10px",
          color: "#f3ecda",
          stroke: "#1d1a16",
          strokeThickness: 2,
        })
        .setOrigin(0.5);

      const markerAura = this.add
        .circle(0, -56, 12, 0xffd700, 0.25)
        .setStrokeStyle(1.6, 0xffd700, 0.9)
        .setVisible(false);

      const markerText = this.add
        .text(0, -56, "!", {
          fontFamily: '"Noto Serif", Georgia, serif',
          fontSize: "17px",
          fontStyle: "bold",
          color: "#ffe08a",
          stroke: "#1d1a16",
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setVisible(false);

      root.add([sprite, nameLabel, titleLabel, markerAura, markerText]);

      if (!isReducedMotion()) {
        this.tweens.add({
          targets: [markerAura, markerText],
          y: "-=6",
          yoyo: true,
          repeat: -1,
          duration: 700,
          ease: "Sine.easeInOut",
        });
      }

      this.npcs.set(npc.id, {
        id: npc.id,
        root,
        sprite,
        nameLabel,
        titleLabel,
        markerText,
        markerAura,
        x: npc.x,
        y: npc.y,
      });
    }
  }

  private createNavArrow() {
    this.navArrow = this.add
      .container(0, 0)
      .setDepth(this.map.worldH + 5)
      .setVisible(false);
    const arrowG = this.add.graphics();
    arrowG.fillStyle(0xffd74a, 0.9);
    arrowG.fillTriangle(14, 0, -8, -7, -8, 7);
    arrowG.lineStyle(1.5, 0x1d1a16, 0.9);
    arrowG.strokeTriangle(14, 0, -8, -7, -8, 7);

    const aura = this.add.circle(0, 0, 16, 0xffd74a, 0.25);
    if (!isReducedMotion()) {
      this.tweens.add({
        targets: aura,
        scale: 1.35,
        alpha: 0.1,
        yoyo: true,
        repeat: -1,
        duration: 650,
      });
    }

    this.navArrow.add([aura, arrowG]);
    this.navLabel = this.add
      .text(0, 0, "", {
        fontFamily: '"Noto Serif", Georgia, serif',
        fontSize: "13px",
        color: "#ffe08a",
        stroke: "#1d1a16",
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0)
      .setDepth(this.map.worldH + 5)
      .setVisible(false);
  }

  private hideNav() {
    this.navArrow.setVisible(false);
    this.navLabel.setVisible(false);
  }

  // ---------------- Input ----------------

  private setupInput() {
    // Chỉ phím DI CHUYỂN do Phaser giữ (isDown mỗi khung). enableCapture = false: để còn gõ được chữ vào ô chat.
    // Mọi phím HÀNH ĐỘNG đi qua bảng phím `keybinds.ts` (đổi được, HUD đọc nhãn từ đó) ở `onKeyDown`.
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT", false) as any;
    window.addEventListener("keydown", this.onKeyDown);
    // Con trỏ chuột trong canvas (chiêu nhắm theo con trỏ): chạm / bút không tính. `pointerleave` cũng bắn khi con trỏ rời sang nút HUD phủ trên canvas.
    const canvas = this.game.canvas;
    const onMove = (e: PointerEvent) => {
      this.mouseIn = e.pointerType === "mouse";
    };
    const onLeave = () => {
      this.mouseIn = false;
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    this.syncSlotKeys();
    const offKeymap = onKeymapChange(() => this.syncSlotKeys());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener("keydown", this.onKeyDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      offKeymap();
    });
    // Esc do `ui.ts` xử lý ở `window` (một chỗ duy nhất, kể cả bỏ chọn mục tiêu qua `onClearTarget`): đăng ký thêm ở đây làm MỖI lần Esc chạy hai lần

    // Chuột / chạm: bấm vào người chơi khác để mở menu tổ đội, hoặc chém về phía con trỏ
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (
        ui.isCharModalOpen() ||
        ui.isForgeModalOpen() ||
        ui.isShopModalOpen() ||
        ui.isInventoryOpen() ||
        ui.isQuestModalOpen() ||
        ui.isMapModalOpen() ||
        ui.isSettingsModalOpen() ||
        ui.isSkillsModalOpen() ||
        ui.isDialogOpen()
      )
        return;

      if (this.tryClickPlayer(p)) return;

      if (ui.isPlayerMenuOpen()) {
        ui.closePlayerMenu();
      }

      if (p.wasTouch || !p.leftButtonDown()) return;
      this.slash(Math.atan2(p.worldY - this.predY, p.worldX - this.predX));
    });

    const bind = (id: string, fn: () => void) =>
      document.getElementById(id)!.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        fn();
      });
    bind("sk-slash", () => this.slash());
    bind("btn-target", () => this.toggleLockTarget());
    bind("sk-sword", () => this.sword());
    bind("sk-med", () => this.toggleMeditate());
    bind("sk-break", () => !this.isReconnecting && this.room.send("breakthrough"));
    for (const n of [2, 3, 4, 5] as const)
      bind(`sk-slot${n}`, () => this.runAction(`skill.slot${n}`));

    // Bản đồ lớn: phóng / thu / kéo (chuột, cảm ứng, bàn phím, nút); mỗi thay đổi vẽ lại ngay (gộp theo khung hình)
    const worldmap = document.getElementById("worldmap") as HTMLCanvasElement | null;
    if (worldmap) {
      this.mapCtl.onChange = () => this.redrawBigMap();
      // "Về chỗ mình" khi đang xem bản đồ khác: quay về bản đồ mình đứng
      this.mapCtl.onRecenter = () => {
        if (this.mapViewId === null) return false;
        this.setMapView(null);
        return true;
      };
      this.buildMapGraphNav();
      attachMapInput(this.mapCtl, {
        canvas: worldmap,
        zoomIn: document.getElementById("map-zoom-in"),
        zoomOut: document.getElementById("map-zoom-out"),
        recenter: document.getElementById("map-recenter"),
      });
    }

    const chatForm = document.getElementById("chat-form") as HTMLFormElement;
    const chatInput = document.getElementById("chat-input") as HTMLInputElement;
    chatForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (text && !this.isReconnecting) this.room.send("chat", { text });
      chatInput.value = "";
      chatInput.blur();
    });
  }

  /**
   * Phím HÀNH ĐỘNG của máy tính (QUYET_DINH_M3 mục 13, #463). Phím đã bị nút / bảng xử lý (`preventDefault`) thì bỏ qua như Phaser trước đây;
   * đang gõ chữ thì bỏ qua; hành động của THẾ GIỚI (đánh, kỹ năng, đan, mục tiêu, tương tác, mở chat) không chạy khi bảng / hộp thoại
   * đang mở (phím thuộc về bảng); mở / đóng bảng và bật / tắt âm thanh vẫn chạy.
   */
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.defaultPrevented || isTypingElement(document.activeElement)) return;
    const action = actionOfEvent(e, getLookup());
    if (!action) return;
    const def = ACTION_BY_ID[action];
    if (def.world && ui.isKeyboardCaptured()) return;
    // phím đã nhận: chặn hành vi mặc định (Tab đổi focus, Space cuộn / bấm nút...) kể cả khi giữ phím lặp
    e.preventDefault();
    if (e.repeat && !def.repeat) return;
    this.runAction(action);
  };

  private runAction(action: ActionId) {
    switch (action) {
      case "attack":
        this.autoLockNearest();
        this.slash();
        break;
      case "skill.sword":
        this.autoLockNearest();
        this.sword();
        break;
      case "skill.slot2":
      case "skill.slot3":
      case "skill.slot4":
      case "skill.slot5":
        this.castSlot(Number(action.slice(-1)) as SkillSlot);
        break;
      case "skill.meditate":
        this.toggleMeditate();
        break;
      case "skill.breakthrough":
        if (!this.isReconnecting) this.room.send("breakthrough");
        break;
      case "quick.1":
        ui.useQuick(1);
        break;
      case "quick.2":
        ui.useQuick(2);
        break;
      case "interact":
        this.interactOrPickup();
        break;
      case "target.next":
        this.toggleLockTarget(1, true);
        break;
      case "target.prev":
        this.toggleLockTarget(-1, true);
        break;
      case "prompt.yes":
        ui.answerPrompt("yes");
        break;
      case "prompt.no":
        ui.answerPrompt("no");
        break;
      case "exit.fight":
        ui.askLeaveFight();
        break;
      case "player.menu":
        this.openNearestPlayerMenu();
        break;
      case "panel.inventory":
        ui.toggleInventory();
        break;
      case "panel.char":
        ui.toggleCharModal();
        break;
      case "panel.quest":
        ui.toggleQuestModal();
        break;
      case "panel.sect":
        ui.toggleSectModal();
        break;
      case "panel.skills":
        ui.toggleSkillsModal();
        break;
      case "panel.map":
        ui.toggleMapModal();
        break;
      case "panel.minimap":
        ui.toggleMinimap();
        break;
      case "panel.settings":
        ui.toggleSettingsModal();
        break;
      case "sound.mute":
        sound.toggleMute();
        break;
      case "ui.toggle":
        ui.toggleHidden();
        break;
      case "chat.open":
        // setTimeout để phím Enter vừa bấm không rơi vào ô chat vừa lấy focus
        setTimeout(() => ui.focusChat(), 0); // chat thu gọn: hiện ô nhập tạm rồi đưa con trỏ vào (ui.focusChat)
        break;
    }
  }

  /** Bấm đánh bằng bàn phím mà chưa có mục tiêu: tự khoá con quái gần nhất trong tầm (vòng đánh dấu hiện ra, kỹ năng quay về phía nó). */
  private autoLockNearest() {
    if (this.lockedTargetId !== null || this.isReconnecting || ui.isLimboOpen()) return;
    const me = this.me();
    if (!me || me.dead) return;
    const id = pickNextTarget(this.targetCandidates(true), null);
    if (id) this.setLockedTarget(id);
  }

  /**
   * Ứng viên khoá mục tiêu. `onScreenOnly` (bàn phím, góp ý của A ở #465): chỉ quái ĐANG THẤY trên màn hình (trong khung camera), không phải cả
   * tầm khoá 520 px (khung máy tính cao chỉ ~640 px nên quái ở 450 px phía trên nằm ngoài màn hình). Nút cảm ứng giữ nguyên (mọi quái trong tầm).
   */
  private targetCandidates(onScreenOnly: boolean): Array<{ id: string; dist: number }> {
    const view = this.cameras.main.worldView;
    const cands: Array<{ id: string; dist: number }> = [];
    this.monsters.forEach((m, id) => {
      if (onScreenOnly && !view.contains(m.tx, m.ty)) return;
      cands.push({ id, dist: Math.hypot(m.tx - this.predX, m.ty - this.predY) });
    });
    return cands;
  }

  private moveDir() {
    if (document.activeElement instanceof HTMLInputElement) return { dx: 0, dy: 0 };
    const k = this.keys;
    return moveVector({
      left: k.A.isDown || k.LEFT.isDown,
      right: k.D.isDown || k.RIGHT.isDown,
      up: k.W.isDown || k.UP.isDown,
      down: k.S.isDown || k.DOWN.isDown,
      // bảng / hộp thoại đang mở: mũi tên điều hướng bảng, BÀN PHÍM không đi (#463); cần điều khiển ảo giữ nguyên hành vi cảm ứng
      keyboardBlocked: ui.isKeyboardCaptured(),
      joystick,
    });
  }

  /** Tự ngắm con quái gần nhất trong tầm, không có thì đánh theo hướng đang nhìn. */
  private aim(range: number) {
    let best = range,
      angle = this.facing;
    // Đang khoá mục tiêu còn trong tầm: đánh về phía nó (nhả khoá nếu nó đã mất / quá xa)
    const locked = this.lockedTargetId ? this.monsters.get(this.lockedTargetId) : undefined;
    if (locked) {
      const d = Math.hypot(locked.tx - this.predX, locked.ty - this.predY);
      if (keepLock(d)) return Math.atan2(locked.ty - this.predY, locked.tx - this.predX);
    }
    this.monsters.forEach((m) => {
      const d = Math.hypot(m.tx - this.predX, m.ty - this.predY);
      if (d < best) {
        best = d;
        angle = Math.atan2(m.ty - this.predY, m.tx - this.predX);
      }
    });
    return angle;
  }

  /**
   * Bấm nút / phím Tab hoặc T: khoá con quái gần nhất, bấm tiếp chuyển sang con xa hơn, hết vòng hoặc chỉ còn một con thì nhả khoá.
   * `step` = -1 (Shift+Tab): đi ngược xa -> gần. `onScreenOnly`: chỉ quái đang thấy trên màn hình (phím Tab; xem `targetCandidates`).
   */
  private toggleLockTarget(step: 1 | -1 = 1, onScreenOnly = false) {
    if (this.isReconnecting || ui.isLimboOpen()) return;
    const pick = step === 1 ? pickNextTarget : pickPrevTarget;
    this.setLockedTarget(pick(this.targetCandidates(onScreenOnly), this.lockedTargetId));
  }

  private setLockedTarget(id: string | null) {
    this.lockedTargetId = id;
    const btn = document.getElementById("btn-target");
    if (btn) {
      btn.classList.toggle("locked", id !== null);
      btn.setAttribute("aria-pressed", String(id !== null));
      const kind = id ? this.monsters.get(id)?.monKind : undefined;
      const label = document.getElementById("btn-target-label");
      if (label) label.textContent = kind ? (MONSTER_BY_ID[kind]?.name ?? "Mục tiêu") : "Mục tiêu";
    }
    if (id === null) this.targetRing?.setVisible(false);
  }

  /**
   * Nút Mục tiêu mờ đi (class `idle`, `aria-disabled`) khi chưa khoá và KHÔNG có quái nào trong tầm khoá: bấm cũng không làm gì
   * (nit của A ở #344: hiện cả ở trấn). Vẫn bấm được (không `disabled`) để bố cục / chạm không đổi.
   */
  private syncTargetBtnIdle() {
    const now = this.time.now;
    if (now - this.targetIdleAt < 200) return;
    this.targetIdleAt = now;
    let any = this.lockedTargetId !== null;
    if (!any)
      for (const m of this.monsters.values())
        if (keepLock(Math.hypot(m.tx - this.predX, m.ty - this.predY))) {
          any = true;
          break;
        }
    const idle = !any;
    if (idle === this.targetBtnIdle) return;
    this.targetBtnIdle = idle;
    const btn = document.getElementById("btn-target");
    if (btn) {
      btn.classList.toggle("idle", idle);
      btn.setAttribute("aria-disabled", String(idle));
    }
  }

  /** Mỗi khung: vòng đánh dấu bám theo mục tiêu khoá; mất mục tiêu (chết / ra xa / rời vùng) thì tự nhả khoá. */
  private syncTargetLock() {
    const id = this.lockedTargetId;
    if (!id) return;
    const e = this.monsters.get(id);
    const d = e ? Math.hypot(e.tx - this.predX, e.ty - this.predY) : null;
    if (!e || !keepLock(d)) {
      this.setLockedTarget(null);
      return;
    }
    if (!this.targetRing) {
      this.targetRing = this.add
        .circle(0, 0, 26, 0xff6b5e, 0)
        .setStrokeStyle(3, 0xff6b5e, 0.95)
        .setDepth(this.map.worldH);
    }
    const r = (MONSTER_BY_ID[e.monKind ?? ""]?.radius ?? 16) + 12;
    // Nhịp thở nhẹ của vòng; giảm chuyển động thì đứng yên
    const pulse = isReducedMotion() ? 1 : 1 + 0.08 * Math.sin(this.time.now / 160);
    this.targetRing
      .setPosition(e.root.x, e.root.y)
      .setRadius(r * pulse)
      .setVisible(true);
  }

  /** Bấm/chạm trúng người chơi khác thì mở menu tương tác (mời tổ đội). */
  private tryClickPlayer(pointer: Phaser.Input.Pointer): boolean {
    // Nếu con trỏ ở gần quái vật sống thì ưu tiên đánh quái, không mở menu
    let nearMonster = false;
    this.monsters.forEach((m) => {
      if (nearMonster) return;
      if (Math.hypot(pointer.worldX - m.root.x, pointer.worldY - m.root.y) <= 48) {
        nearMonster = true;
      }
    });
    if (nearMonster) return false;

    let closestId: string | null = null;
    let closestDist = 28;
    this.players.forEach((e, id) => {
      if (id === this.sid) return;
      const d = Math.hypot(pointer.worldX - e.root.x, pointer.worldY - e.root.y);
      if (d < closestDist) {
        closestDist = d;
        closestId = id;
      }
    });
    if (closestId) return this.openPlayerMenuFor(closestId, pointer.x, pointer.y, false);
    return false;
  }

  /**
   * Mở menu tương tác của người chơi `id` tại điểm ảnh canvas (`canvasX`, `canvasY`). `byKeyboard`: focus nhảy vào nút hành động đầu tiên dùng được
   * (phím Enter chọn luôn) thay vì nút Đóng. Dùng chung cho bấm chuột / chạm (`tryClickPlayer`) và phím `player.menu`.
   */
  private openPlayerMenuFor(
    id: string,
    canvasX: number,
    canvasY: number,
    byKeyboard: boolean,
  ): boolean {
    const sp = this.state.players.get(id);
    if (!sp) return false;
    const me = this.me();
    let challengeCheck: DuelChallengeCheck | undefined;
    if (me) {
      const spX = sp.px ?? sp.x;
      const spY = sp.py ?? sp.y;
      challengeCheck = clientCanChallenge(
        { name: me.name, dead: me.dead, duel: Boolean((me as any).duel) },
        { x: me.x, y: me.y },
        { name: sp.name, dead: sp.dead, duel: Boolean((sp as any).duel) },
        { x: spX, y: spY },
        this.map,
        isDungeonMap(this.map.def.id),
      );
    }
    // Menu là phần tử DOM: toạ độ CSS px, KHÔNG phải điểm ảnh canvas (lệch gấp renderScale lần khi renderScale > 1)
    const menuAt = toCssPoint(canvasX, canvasY, this.scale.displayScale);
    ui.openPlayerMenu(
      sp.name,
      sp.realm,
      sp.tier,
      menuAt.x,
      menuAt.y,
      challengeCheck,
      (sp as any).sect,
      byKeyboard,
    );
    return true;
  }

  /** Người chơi vừa mở menu bằng phím (để bấm tiếp thì sang người kế). */
  private lastMenuPlayerId: string | null = null;

  /**
   * Phím `player.menu` (#463): mở menu của đồng đạo GẦN nhất đang thấy trên màn hình (khung camera); sau khi Esc, bấm tiếp đi sang người xa hơn rồi vòng
   * lại (`pickNextPlayer`). Không ai trong tầm nhìn thì báo bằng toast. Menu đặt cạnh người đó trên màn hình.
   */
  private openNearestPlayerMenu() {
    if (this.isReconnecting || ui.isLimboOpen() || !this.me()) return;
    const cam = this.cameras.main;
    const view = cam.worldView;
    const cands: Array<{ id: string; dist: number }> = [];
    this.players.forEach((e, id) => {
      if (id === this.sid || !view.contains(e.root.x, e.root.y)) return;
      cands.push({ id, dist: Math.hypot(e.root.x - this.predX, e.root.y - this.predY) });
    });
    const id = pickNextPlayer(cands, this.lastMenuPlayerId);
    const e = id ? this.players.get(id) : undefined;
    // `players` (hình vẽ) có thể còn giữ người vừa rời tầm nhìn (đồng đội luôn được giữ, hình đang trượt) trong khi state đã bỏ: coi như không có ai
    if (!id || !e || !this.state.players.get(id)) {
      this.lastMenuPlayerId = null;
      ui.toast({ text: "Không có đồng đạo nào trong tầm nhìn.", tone: "bad" });
      return;
    }
    this.lastMenuPlayerId = id;
    this.openPlayerMenuFor(
      id,
      (e.root.x - view.x) * cam.zoom,
      (e.root.y - view.y) * cam.zoom,
      true,
    );
  }

  public me() {
    return this.state?.players?.get(this.sid);
  }

  private weaponColorFor(p: any, fallback: number): number {
    const wId = p?.weapon ?? "";
    if (!wId) return fallback;
    return ITEM_BY_ID[wId]?.color ?? fallback;
  }

  private slash(angle?: number) {
    if (this.isReconnecting || ui.isLimboOpen()) return;
    const me = this.me();
    if (!me || me.dead || this.time.now < this.nextSlash) return;
    this.recordCombat();
    this.nextSlash = this.time.now + SKILLS.slash.cooldown;
    this.lastAttack = { at: this.time.now, range: SKILLS.slash.range };
    const a = angle ?? this.aim(SKILLS.slash.range + 60);
    this.facing = a;
    const myEntity = this.players.get(this.sid);
    if (myEntity) myEntity.slashUntil = this.time.now + SLASH_MS;
    this.room.send("attack", { angle: a });
    sound.slash();
    this.fxSlash(this.predX, this.predY, a, this.weaponColorFor(me, 0xffffff), 1, true);
  }

  private sword() {
    if (this.isReconnecting || ui.isLimboOpen()) return;
    const me = this.me();
    if (!me || me.dead || this.time.now < this.nextSword) return;
    if (me.mp < SKILLS.sword.mp) return ui.toast({ text: "Linh lực không đủ.", tone: "bad" });
    this.recordCombat();
    this.nextSword = this.time.now + SKILLS.sword.cooldown;
    this.lastAttack = { at: this.time.now, range: SKILLS.sword.range };
    const a = this.aim(SKILLS.sword.range);
    this.facing = a;
    const myEntity = this.players.get(this.sid);
    if (myEntity) myEntity.slashUntil = this.time.now + SLASH_MS;
    this.room.send("skill", { id: "sword", angle: a });
    sound.sword();
    this.fxSword(
      this.predX,
      this.predY,
      a,
      SKILLS.sword.range,
      this.weaponColorFor(me, 0xffffff),
      true,
    );
  }

  private toggleMeditate() {
    if (this.isReconnecting || ui.isLimboOpen()) return;
    const me = this.me();
    if (!me || me.dead) return;
    this.room.send("meditate", { on: !me.meditating });
  }

  private pickupNearest() {
    if (this.isReconnecting || ui.isLimboOpen()) return;
    const me = this.me();
    if (!me || me.dead || !this.nearestLootId) return;
    this.lastPickup = { id: this.nearestLootId, at: this.time.now };
    this.room.send("pickup", { lootId: this.nearestLootId });
  }

  private talkClosestNpc() {
    if (this.isReconnecting || ui.isLimboOpen()) return;
    const me = this.me();
    if (!me || me.dead || !this.closestNpcId) return;
    if (isMockDungeonEnabled() && this.closestNpcId === "thu_mon") {
      ui.onDialog(buildMockThuMonDialog({ canOpen: true }));
      return;
    }
    this.room.send("talk", { npcId: this.closestNpcId });
  }

  private interactOrPickup() {
    if (this.isReconnecting || ui.isLimboOpen()) return;
    if (this.nearPortal) {
      this.travelPortal(this.nearPortal.id);
    } else if (this.closestNpcId) {
      this.talkClosestNpc();
    } else if (this.nearestLootId) {
      this.pickupNearest();
    }
  }

  public travelPortal(portalId: string) {
    if (this.isReconnecting) return;
    // Bắt đầu tải gói bản đồ đích NGAY khi gửi `travel`: chạy song song với màn chuyển cảnh và việc vào phòng mới (main.ts `travelTo`),
    // không nối đuôi sau chúng. Cổng lạ thì không có gì để tải; server vẫn là bên quyết định có cho đi không.
    const dest = this.map.portals.find((p) => p.id === portalId);
    if (dest) packs().startMapWait(dest.toMap);
    this.room.send("travel", { portalId } satisfies TravelMsg);
  }

  /** Lúc rảnh sau khi vào một bản đồ: tải trước gói `icons` và gói các bản đồ kề (chỉ khi mạng 4g, không tiết kiệm dữ liệu; `packs.ts`). */
  private prefetchPacks() {
    const p = packs();
    p.prefetch("icons");
    p.prefetchNeighbors(neighborMapIds(this.map.portals, this.map.def.id));
  }

  // ---------------- Mạng & Tự nối lại (#117) ----------------

  public setReconnecting(reconnecting: boolean) {
    this.isReconnecting = reconnecting;
    if (reconnecting) {
      this.moving = false;
      this.duelKoUntil = 0;
      this.dungeonFallUntil = 0;
      ui.death(null);
      ui.hideDuelHud();
      ui.showReconnectNotice("Mất kết nối, đang nối lại...");
    } else {
      ui.hideReconnectNotice();
    }
  }

  public changeMap(room: Room, newMap: GameMap) {
    this.duelKoUntil = 0;
    this.dungeonFallUntil = 0;
    ui.death(null);
    ui.hideDuelHud();
    // Gói của bản đồ vừa rời không còn cần: giải phóng (nơi giữ texture của gói đó xoá theo `onRelease`); quay lại thì nạp lại từ bộ nhớ đệm
    packs().release(mapPackId(this.map.def.id));
    this.map = newMap;
    // Qua cổng KHÔNG tạo lại scene: dựng lại sơ đồ nối (nút "đang đứng", ẩn trong bí cảnh) và đưa bản đồ lớn về xem bản đồ mình đứng.
    // `mapWasOpen = false` để nếu bản đồ lớn đang mở thì khung hình sau đặt lại camera / tiêu đề theo bản đồ mới.
    this.mapViewId = null;
    this.mapWasOpen = false;
    this.buildMapGraphNav();
    this.buildMapVisuals();
    ui.setCurrentMapId(newMap.def.id);
    this.attachRoom(room);
    this.syncAudioZone();
    this.prefetchPacks();
  }

  public attachRoom(room: Room) {
    this.room = room;
    this.clearEntities();
    // hasMe = false: lấy lại vị trí từ state của Room mới ở lần reconcile đầu
    this.hasMe = false;
    this.pending.length = 0;
    // Trạng thái của Room cũ không còn đúng (qua cổng = phòng mới; nối lại = server gửi lại danh sách ngay sau đó): xoá để không đoán trước theo hệ số cũ
    this.status.clear();
    this.statusBadges.render([]);
    this.skills.clear();
    this.nextSkillBarAt = 0;
    // Giữ seq tăng liên tục, không đặt lại 0: sau khi nối lại state.lastSeq vẫn là giá trị cũ
    // cho tới khi server xử lý input đầu tiên, reconcile() lọc pending bằng seq > lastSeq
    // nên seq bắt đầu lại từ 1 sẽ bị coi là đã xác nhận và nhân vật giật lùi.
    this.moving = false;
    this.setupNetwork(false);
  }

  private clearEntities() {
    for (const [, e] of this.players) {
      e.root.destroy();
    }
    this.players.clear();

    for (const [, e] of this.monsters) {
      e.root.destroy();
    }
    this.monsters.clear();
    this.setLockedTarget(null);

    for (const [, le] of this.loots) {
      le.root.destroy();
    }
    this.loots.clear();

    for (const it of this.activeSlashes) {
      it.g.setVisible(false);
      this.slashPool.push(it.g);
    }
    this.activeSlashes.length = 0;
    this.telegraphs.clear();

    for (const it of this.activeSwords) {
      it.img.setVisible(false);
      this.swordPool.push(it.img);
    }
    this.activeSwords.length = 0;

    this.fx.clear();
    this.lootFxFrom = this.time.now + 1500;
    this.portalFxAt.clear();

    this.nearestLootId = null;
    this.closestNpcId = null;
    ui.talkPrompt(null);
    ui.pickupPrompt(null);
  }

  /** Nhận danh sách trạng thái của chính mình (server gửi khi thêm / mất / làm mới, vơi khiên, nối lại). Công khai để script kiểm giả lập (`?debug`) bơm tin. */
  public onStatus(m: StatusMsg) {
    this.status.set(m?.list, performance.now());
  }

  /** Nhận sổ chiêu + hồi chiêu của chính mình (server gửi khi đổi và định kỳ). Công khai để script kiểm giả lập (`?debug`) bơm tin. */
  public onSkills(m: SkillsMsg) {
    this.skills.set(m, performance.now());
    this.nextSkillBarAt = 0; // vẽ lại ngay khung hình sau
    this.refreshSkillsPanel();
  }

  /** Dựng lại mô hình bảng Công pháp từ sổ chiêu + cảnh giới hiện tại (khi nhận `skills`, khi mở bảng, khi cảnh giới / linh lực tối đa đổi lúc đang mở). */
  private refreshSkillsPanel() {
    const me = this.me();
    if (!me) return;
    ui.setSkillsModel(buildSkillsPanel(this.skills, me));
    this.skillsPanelKey = `${me.realm}|${me.tier}|${me.maxMp}`;
  }

  /** Vẽ bốn ô chiêu (~16 lần/giây; `SkillBarDom` chỉ ghi DOM khi dấu hiệu của ô đổi). */
  private updateSkillBar(me: { realm: number; tier: number; mp: number; maxMp: number }) {
    const now = performance.now();
    if (now < this.nextSkillBarAt) return;
    this.nextSkillBarAt = now + 60;
    if (ui.isSkillsModalOpen() && this.skillsPanelKey !== `${me.realm}|${me.tier}|${me.maxMp}`)
      this.refreshSkillsPanel();
    const stunned = this.status.stunned(now);
    // Huy hiệu trạng thái: danh sách rỗng thì `render([])` chỉ so một chuỗi rỗng (không đụng DOM)
    this.statusBadges.render(badgeViews(this.status.active(now)));
    let filled = 0;
    for (const slot of BAR_SLOTS) {
      const v = slotView(slot, this.skills, me, stunned, now);
      if (v.def) filled++;
      this.skillBar.render(v, this.slotKeys[slot]);
    }
    this.skillBar.renderGroup(filled);
  }

  /** Nhãn phím của L U I O theo bảng phím hiện tại (đổi phím thì vẽ lại ô). */
  private syncSlotKeys() {
    const map = getKeymap();
    for (const slot of BAR_SLOTS)
      this.slotKeys[slot] = keyLabels(map, `skill.slot${slot}` as ActionId);
    this.skillBar.invalidate();
    this.nextSkillBarAt = 0;
  }

  /** Góc từ nhân vật tới con trỏ chuột (rad); `null` khi không có chuột trong canvas. */
  private cursorAngle(): number | null {
    if (!this.mouseIn) return null;
    const p = this.input.activePointer;
    if (p.wasTouch) return null;
    const w = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    return Math.atan2(w.y - this.predY, w.x - this.predX);
  }

  /** Hướng đánh của chiêu theo hình (`aimMode`, A xác nhận ở #536). */
  private skillAngle(def: SkillDef): number {
    switch (aimMode(def.shape)) {
      case "move": {
        const { dx, dy } = this.moveDir();
        return dx !== 0 || dy !== 0 ? Math.atan2(dy, dx) : this.facing;
      }
      case "facing":
        return this.facing;
      case "target":
        return this.cursorAngle() ?? this.aim((def.reach ?? 0) + def.range);
    }
  }

  /** Bấm ô chiêu (phím L U I O hoặc chạm): chỉ gửi `cast` khi ô SẴN SÀNG; ca chắc chắn bị từ chối thì báo lý do tại chỗ, không gửi. */
  private castSlot(slot: SkillSlot) {
    if (this.isReconnecting || ui.isLimboOpen()) return;
    const me = this.me();
    if (!me || me.dead) return;
    const now = performance.now();
    const v = slotView(slot, this.skills, me, this.status.stunned(now), now);
    if (!v.canCast || !v.def) {
      const text = blockedToast(v);
      if (text) ui.toast({ text, tone: v.kind === "noMp" ? "bad" : "info" });
      this.shakeSlot(slot);
      return;
    }
    // bàn phím không chuột: tự khoá quái gần nhất như Kiếm khí (vòng đánh dấu hiện ra)
    if (this.cursorAngle() === null && aimMode(v.def.shape) === "target") this.autoLockNearest();
    const angle = this.skillAngle(v.def);
    this.facing = angle;
    const msg: CastMsg = { slot, angle };
    this.room.send(SKILL_MSG.cast, msg);
  }

  /** Rung nhẹ ô vừa bấm mà không dùng được (không rung khi người dùng bật giảm chuyển động). */
  private shakeSlot(slot: SkillSlot) {
    const el = document.getElementById(`sk-slot${slot}`);
    if (!el || isReducedMotion() || typeof el.animate !== "function") return;
    el.animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(-3px)" },
        { transform: "translateX(3px)" },
        { transform: "translateX(0)" },
      ],
      { duration: 160, iterations: 1 },
    );
  }

  private onLimbo(m: LimboMsg) {
    ui.setKiep(m.soul.kiep);
    ui.showLimbo(m, {
      onBuy: (id: string) => {
        const msg: SoulBuyMsg = { id };
        this.room.send("soulBuy", msg);
      },
      onRebirth: (choice: RebirthChoice) => {
        // `engrave` vắng = giữ nguyên chiêu đã khắc (client chỉ gửi khi người chơi đổi tập chiêu khắc, `engrave.ts`)
        const msg: RebirthMsg = { origin: choice.origin, keep: choice.keep };
        if (choice.engrave !== undefined) msg.engrave = choice.engrave;
        this.room.send("rebirth", msg);
      },
    });
  }

  private setupNetwork(isInitial = true) {
    this.room.onStateChange(() => this.reconcile());
    // Phòng đã vào TỪ TRƯỚC khi gắn vào cảnh (qua cổng: đợi gói bản đồ tới 8 s sau khi vào phòng, main.ts `travelTo`): lần đồng bộ state đầu đã xảy ra rồi
    // và nơi đứng yên (không patch) sẽ không có lần nào nữa, nên `predX` / `predY` kẹt ở toạ độ bản đồ CŨ (camera nhìn sai chỗ, đường đi tính sai).
    // Đối chiếu ngay một lần; chưa có state / chưa có mình thì `reconcile` tự bỏ qua.
    if (!isInitial) this.reconcile();
    // Ghi lại handler theo loại để phát lại các tin server gửi ngay lúc vào phòng (xem early-messages.ts)
    const handlers: Record<string, (msg: any) => void> = {};
    const reg = (type: string, fn: (msg: any) => void) => {
      handlers[type] = fn;
      this.room.onMessage(type, fn);
    };
    reg("fx", (m: FxMsg) => this.onFx(m));
    reg("dmg", (m: DmgMsg) => this.onDmg(m));
    reg("chat", (m: ChatOut) => ui.chat(m));
    reg("toast", (m: ToastMsg) => ui.toast(m));
    reg("inv", (m: InvMsg) => ui.onInv(m));
    reg("quests", (m: QuestsMsg) => ui.onQuests(m));
    reg("dialog", (m: DialogMsg) => ui.onDialog(m));
    reg("party", (m: PartyMsg) => ui.onParty(m));
    reg("partyInvited", (m: PartyInvitedMsg) => ui.onPartyInvited(m));
    reg("wallet", (m: WalletMsg) => ui.onWallet(m));
    reg(SKILL_MSG.status, (m: StatusMsg) => this.onStatus(m));
    reg(SKILL_MSG.skills, (m: SkillsMsg) => this.onSkills(m));
    reg("limbo", (m: LimboMsg) => this.onLimbo(m));
    reg("soul", (m: SoulMsg) => {
      ui.updateSoul(m);
      ui.setKiep(m.kiep);
    });
    reg("reborn", (m: RebornMsg) => ui.showReborn(m.kiep));
    reg(DUNGEON_MSG.invite, (m: DungeonInviteMsg) => ui.onDungeonInvite(m));
    reg(DUNGEON_MSG.state, (m: DungeonStateMsg) => ui.onDungeonState(m));
    reg(DUNGEON_MSG.end, (m: DungeonEndMsg) => ui.onDungeonEnd(m));
    reg(DUNGEON_MSG.fallen, (m: DungeonFallenMsg) => {
      const exitMs = Math.max(
        1000,
        Number.isFinite(m.exitInMs) ? m.exitInMs : DUNGEON_FALL_EXIT_MS,
      );
      this.dungeonFallUntil = this.time.now + exitMs;
      ui.onDungeonFallen(m);
    });
    reg(DUEL_MSG.invited, (m: DuelInvitedMsg) => ui.onDuelInvited(m));
    reg(DUEL_MSG.state, (m: DuelStateMsg) => ui.onDuelState(m));
    reg(DUEL_MSG.end, (m: DuelEndMsg) => {
      if (m.result === "lost" && m.reason === "ko") {
        this.duelKoUntil = this.time.now + DUEL_KO_MS + 400;
      }
      ui.onDuelEnd(m);
    });
    reg(SECT_MSG.snapshot, (m: SectMsg) => ui.onSect(m));
    reg(SECT_MSG.presence, (m: SectPresenceMsg) => ui.onSectPresence(m));
    reg(SECT_MSG.invited, (m: SectInvitedMsg) => ui.onSectInvited(m));
    replayEarlyMessages(this.room, handlers);
    if (isInitial) {
      ui.chat({
        from: "",
        text: `Chào mừng đạo hữu tới Tiên Giới. Nhận nhiệm vụ ở Trưởng trấn (${primaryKeyLabel("interact")}), mở sổ nhiệm vụ (${primaryKeyLabel("panel.quest")}) và xem bản đồ (${primaryKeyLabel("panel.map")}).`,
        sys: true,
      });
    }
  }

  /** Lấy vị trí server làm gốc rồi chạy lại các input server chưa xử lý. */
  private reconcile() {
    const me = this.me();
    if (!me) return;
    if (!this.hasMe) {
      this.hasMe = true;
      this.predX = me.x;
      this.predY = me.y;
    }
    if (me.dead) {
      this.pending.length = 0;
      this.predX = me.x;
      this.predY = me.y;
      ui.closeAllModals();
      return;
    }
    this.pending = this.pending.filter((i) => i.seq > me.lastSeq);
    const now = performance.now();
    // Hệ số tăng tốc / tê cóng nhân vào tốc độ y như server (`moveSpeedMul`); đang choáng thì server tiêu thụ input mà không di chuyển nên không chạy lại chúng
    const speed =
      statsFor(me.realm, me.tier, me).speed * this.status.speedMul(now) * (TICK_MS / 1000);
    let x = me.x,
      y = me.y;
    if (!this.status.stunned(now))
      for (const i of this.pending)
        ({ x, y } = this.map.moveWithCollision(x, y, i.dx * speed, i.dy * speed, PLAYER_RADIUS));
    this.predX = x;
    this.predY = y;
  }

  private fixedStep() {
    if (this.isReconnecting || ui.isLimboOpen()) {
      this.moving = false;
      return;
    }
    const me = this.me();
    if (!me || me.dead) {
      this.moving = false;
      return;
    }
    const now = performance.now();
    // Choáng: không đoán trước, không gửi `input` (server nếu vẫn nhận thì tiêu thụ mà không di chuyển)
    if (this.status.stunned(now)) {
      this.moving = false;
      return;
    }
    const { dx, dy } = this.moveDir();
    if (Math.hypot(dx, dy) < 0.05) {
      this.moving = false;
      return;
    }
    this.moving = true;
    const msg: InputMsg = { seq: ++this.seq, dx, dy };
    this.room.send("input", msg);
    this.pending.push(msg);
    // Hệ số tăng tốc / tê cóng: CÙNG `moveSpeedMul` với server (`applyInputs`), nên đoán trước khớp
    const speed =
      statsFor(me.realm, me.tier, me).speed * this.status.speedMul(now) * (TICK_MS / 1000);
    ({ x: this.predX, y: this.predY } = this.map.moveWithCollision(
      this.predX,
      this.predY,
      dx * speed,
      dy * speed,
      PLAYER_RADIUS,
    ));
    this.facing = Math.atan2(dy, dx);
  }

  // ---------------- Vòng lặp vẽ ----------------

  /** Kiểm tra toạ độ (x, y) có nằm trong khung nhìn camera (cộng lề pad px) không. */
  private inView(x: number, y: number, pad = 96): boolean {
    const wv = this.cameras.main.worldView;
    if (wv.width <= 0 || wv.height <= 0) return true;
    return x >= wv.x - pad && x <= wv.right + pad && y >= wv.y - pad && y <= wv.bottom + pad;
  }

  update(_t: number, deltaMs: number) {
    if (!this.state?.players) return;
    const t0 = this.perfEnabled ? performance.now() : 0;
    this.acc = Math.min(this.acc + deltaMs, 250);
    while (this.acc >= TICK_MS) {
      this.acc -= TICK_MS;
      this.fixedStep();
    }

    // Nhịp sóng dùng chung cho hào quang đả tọa, hộ phù và đồ rơi (thay cho hàng trăm tween lặp vô hạn)
    this.auraWave = 0.5 - 0.5 * Math.cos((_t * Math.PI) / 900);
    this.talismanWave = 0.5 - 0.5 * Math.cos((_t * Math.PI) / 1100);
    this.lootWave = 0.5 - 0.5 * Math.cos((_t * Math.PI) / 650);

    const k = 1 - Math.exp(-LERP_RATE * (deltaMs / 1000));
    this.syncPlayers(k, deltaMs);
    this.syncMonsters(k);
    this.syncTargetLock();
    this.syncTargetBtnIdle();
    this.syncLoot();
    this.stepTransientFx(this.time.now);
    if (this.time.now - this.lastAuxSync >= 150) {
      this.lastAuxSync = this.time.now;
      this.syncNpcs();
      this.syncPortals();
      this.syncAudioZone();
      this.syncQuestNav();
    }
    this.syncMaps();

    const me = this.me();
    if (me) {
      if (this.prevHp > 0 && me.hp < this.prevHp) {
        this.recordCombat();
      }
      const healed = healAmount(this.prevHp, me.hp, me.maxHp, me.dead, deltaMs);
      if (healed > 0) {
        // Hồi máu bằng đan dược...: chữ xanh + ánh sáng (hồi tự nhiên từng số nguyên không qua ngưỡng nên không ồn)
        const n = healNumber(healed);
        this.fx.play("heal-glow", this.predX, this.predY - 8);
        this.fx.floatNumber(
          n.text,
          this.predX,
          this.predY - 24 + this.floatLanes.offset("heal", this.time.now),
          n,
        );
      }
      this.prevHp = me.hp;
      ui.hud(me, this.state.online ?? this.state.players.size);
      const now = this.time.now;
      ui.cooldown("sk-slash", (this.nextSlash - now) / SKILLS.slash.cooldown);
      ui.cooldown("sk-sword", (this.nextSword - now) / SKILLS.sword.cooldown);
      ui.tickItemCooldowns();
      this.updateSkillBar(me);
    }

    if (this.perfEnabled) {
      this.recordPerf(deltaMs, performance.now() - t0);
    }
  }

  private setupPerfProbe() {
    if (typeof window === "undefined") return;
    this.perfEnabled = new URLSearchParams(window.location.search).get("perf") === "1";
    if (!this.perfEnabled) return;
    (window as any).__tgPerf = {
      reset: () => {
        this.perfFrameHistory.length = 0;
        this.perfUpdateHistory.length = 0;
        this.perfTweenSum = 0;
        this.perfTweenMax = 0;
        this.perfPlayersSum = 0;
        this.perfMonstersSum = 0;
        this.perfLootsSum = 0;
      },
      snapshot: () => {
        const frames = this.perfFrameHistory.length;
        if (frames === 0) return null;
        const sortedF = [...this.perfFrameHistory].sort((a, b) => a - b);
        const sortedU = [...this.perfUpdateHistory].sort((a, b) => a - b);
        const sumF = sortedF.reduce((a, b) => a + b, 0);
        const sumU = sortedU.reduce((a, b) => a + b, 0);
        const pct = (arr: number[], p: number) =>
          arr[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))];
        const avgF = sumF / frames;
        return {
          frames,
          durationSec: Number((sumF / 1000).toFixed(2)),
          fpsAvg: Number((1000 / avgF).toFixed(1)),
          frameAvgMs: Number(avgF.toFixed(2)),
          frameP50Ms: Number(pct(sortedF, 50).toFixed(2)),
          frameP95Ms: Number(pct(sortedF, 95).toFixed(2)),
          frameP99Ms: Number(pct(sortedF, 99).toFixed(2)),
          frameMaxMs: Number(sortedF[sortedF.length - 1].toFixed(2)),
          longFramesOver33Ms: sortedF.filter((x) => x > 33.3).length,
          longFramesOver50Ms: sortedF.filter((x) => x > 50).length,
          updateAvgMs: Number((sumU / frames).toFixed(3)),
          updateP95Ms: Number(pct(sortedU, 95).toFixed(3)),
          updateMaxMs: Number(sortedU[sortedU.length - 1].toFixed(3)),
          playersAvg: Number((this.perfPlayersSum / frames).toFixed(1)),
          monstersAvg: Number((this.perfMonstersSum / frames).toFixed(1)),
          lootsAvg: Number((this.perfLootsSum / frames).toFixed(1)),
          tweensAvg: Number((this.perfTweenSum / frames).toFixed(1)),
          tweensMax: this.perfTweenMax,
        };
      },
    };
  }

  private recordPerf(deltaMs: number, updateMs: number) {
    // Bỏ qua frame nhảy vọt > 500ms khi chuyển tab
    const dt = Math.min(deltaMs, 500);
    this.perfRing[this.perfRingIdx] = dt;
    this.perfRingIdx = (this.perfRingIdx + 1) % this.perfRing.length;
    if (this.perfRingCount < this.perfRing.length) this.perfRingCount++;

    const tweensCount = (this.tweens as any).tweens?.length ?? this.tweens.getTweens().length;
    this.perfFrameHistory.push(dt);
    this.perfUpdateHistory.push(updateMs);
    this.perfTweenSum += tweensCount;
    if (tweensCount > this.perfTweenMax) this.perfTweenMax = tweensCount;
    this.perfPlayersSum += this.players.size;
    this.perfMonstersSum += this.monsters.size;
    this.perfLootsSum += this.loots.size;

    const now = performance.now();
    if (now - this.lastPerfDraw < 250 || this.perfRingCount === 0) return;
    this.lastPerfDraw = now;

    this.perfSortBuf.length = this.perfRingCount;
    let sum = 0;
    for (let i = 0; i < this.perfRingCount; i++) {
      const v = this.perfRing[i];
      this.perfSortBuf[i] = v;
      sum += v;
    }
    this.perfSortBuf.sort((a, b) => a - b);
    const frameAvgMs = sum / this.perfRingCount;
    const p95Idx = Math.min(this.perfRingCount - 1, Math.floor(0.95 * this.perfRingCount));
    const frameP95Ms = this.perfSortBuf[p95Idx];

    ui.updatePerf({
      fps: frameAvgMs > 0 ? 1000 / frameAvgMs : 0,
      frameAvgMs,
      frameP95Ms,
      players: this.players.size,
      monsters: this.monsters.size,
      loots: this.loots.size,
      tweens: tweensCount,
    });
  }

  private syncAudioZone() {
    const inTown = this.map.inTown(this.predX, this.predY);
    sound.setZone(inTown ? "town" : "wild");
    ui.setZoneName(inTown ? this.map.townName : this.map.wildName);
  }

  private syncPortals() {
    this.emitPortalSwirls();
    // Lại gần một cổng (~1200 px, vài giây đi bộ): tải trước gói bản đồ bên kia để qua cổng không phải chờ (chỉ khi mạng cho phép; mỗi gói một lần)
    for (const id of mapsNearPortals(this.map.portals, this.predX, this.predY))
      packs().prefetch(mapPackId(id));
    const near = this.map.portalNear(this.predX, this.predY);
    if (near) {
      this.nearPortal = near;
      ui.portalPrompt(near.name, () => this.travelPortal(near.id));
    } else {
      if (this.nearPortal) {
        this.nearPortal = null;
        ui.portalPrompt(null);
      }
    }
  }

  /** Cổng truyền tống xoáy: đốm sáng tím trôi lên từ hai điểm quay quanh cổng (ngân sách hiệu ứng, ưu tiên 0). */
  private emitPortalSwirls() {
    if (ui.isLowFx()) return;
    const now = this.time.now;
    for (const p of this.map.portals) {
      if (!this.inView(p.x, p.y, 48)) continue;
      const due = nextDueAt(
        this.portalFxAt.get(p.id),
        now,
        PORTAL_SWIRL_INTERVAL_MS,
        120,
        Math.random(),
      );
      if (due === null) continue;
      this.portalFxAt.set(p.id, due);
      for (const pt of portalSwirlPoints(p.x, p.y, now)) this.fx.play("portal-swirl", pt.x, pt.y);
    }
  }

  private syncNpcs() {
    const qLog = ui.getQuestLog();
    const qCtx = ui.getQuestContext();

    let bestNpc: NpcEntity | null = null;
    let bestDist = NPC_RANGE;

    for (const [id, ne] of this.npcs) {
      const marker = npcMarker(id, qLog, qCtx);
      if (marker === "!" || marker === "?") {
        ne.markerText.setText(marker).setVisible(true);
        ne.markerAura.setVisible(true);
        const col = marker === "?" ? 0x6ad06a : 0xffd700;
        ne.markerAura.setFillStyle(col, 0.25).setStrokeStyle(1.6, col, 0.9);
        ne.markerText.setColor(marker === "?" ? "#6ad06a" : "#ffe08a");
      } else {
        ne.markerText.setVisible(false);
        ne.markerAura.setVisible(false);
      }

      const d = Math.hypot(ne.x - this.predX, ne.y - this.predY);
      if (d <= bestDist) {
        bestDist = d;
        bestNpc = ne;
      }
    }

    this.closestNpcId = bestNpc ? bestNpc.id : null;
    if (bestNpc) {
      const npcDef = NPC_BY_ID[bestNpc.id];
      ui.talkPrompt(npcDef?.name ?? "");
    } else {
      ui.talkPrompt(null);
      if (ui.isForgeModalOpen()) ui.toggleForgeModal(false);
      if (ui.isShopModalOpen()) ui.toggleShopModal(false);
    }
  }

  /** Bán kính tính từ tâm trấn ứng với ngưỡng dangerAt(x, y) = minDanger */
  private dangerRadiusPx(minDanger: number): number {
    return this.map.dangerRadius(minDanger);
  }

  /** Tìm con quái gần nhất cùng loại trong state.monsters; nếu chưa có thì chỉ ra vòng minDanger theo hướng đang đứng. */
  private monsterTargetPos(monsterKind: string): { x: number; y: number } | null {
    let bestPos: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    this.state.monsters?.forEach((m: any) => {
      if (m.kind !== monsterKind || m.hp <= 0) return;
      const d = Math.hypot(m.x - this.predX, m.y - this.predY);
      if (d < bestDist) {
        bestDist = d;
        bestPos = { x: m.x, y: m.y };
      }
    });
    if (bestPos) return bestPos;

    const def = MONSTER_BY_ID[monsterKind];
    if (!def) return null;
    const ringR = Math.max(this.map.townPx.r + 48, this.dangerRadiusPx(def.minDanger) + 32);
    const fromTownDist = Math.hypot(this.predX - this.map.townPx.x, this.predY - this.map.townPx.y);
    const dirAngle =
      fromTownDist > 16
        ? Math.atan2(this.predY - this.map.townPx.y, this.predX - this.map.townPx.x)
        : this.facing;
    const pad = TILE * 2;
    return {
      x: Phaser.Math.Clamp(
        this.map.townPx.x + Math.cos(dirAngle) * ringR,
        pad,
        this.map.worldW - pad,
      ),
      y: Phaser.Math.Clamp(
        this.map.townPx.y + Math.sin(dirAngle) * ringR,
        pad,
        this.map.worldH - pad,
      ),
    };
  }

  private resolveQuestTarget(questId: string): { x: number; y: number; hop?: NavHop } | null {
    const def = QUEST_BY_ID[questId];
    if (!def) return null;
    const qLog = ui.getQuestLog();
    const prog = qLog.active.find((a) => a.id === questId);
    if (!prog) return null;
    const ctx = ui.getQuestContext();

    // Đích ở BẢN ĐỒ KHÁC: toạ độ của đích vô nghĩa ở bản đồ này, chỉ tới cổng kế tiếp trên đường tới đó (quest-nav.ts)
    const goal = questGoal(def, prog, ctx);
    if (goal?.kind === "maps" && !goal.mapIds.includes(this.map.def.id)) {
      const hop = nextHop(this.map.def.id, goal.mapIds);
      return hop ? { x: hop.portal.x, y: hop.portal.y, hop } : null;
    }

    // Nếu đã hoàn thành hoặc sẵn sàng trả thì chỉ tới NPC giao
    if (questReady(def, prog, ctx)) {
      const giver = NPC_BY_ID[def.giver];
      return giver ? { x: giver.x, y: giver.y } : null;
    }

    const step = def.steps[prog.step];
    if (!step) return null;

    if (step.kind === "talk") {
      const npc = NPC_BY_ID[step.npcId];
      return npc ? { x: npc.x, y: npc.y } : null;
    }

    if (step.kind === "kill") {
      return this.monsterTargetPos(step.monster);
    }

    if (step.kind === "collect") {
      // Ưu tiên chỉ tới vật phẩm rơi trên mặt đất nếu có (của mình hoặc đồng đội)
      const party = ui.getParty();
      const partyNames = new Set(party.members.map((m) => m.name));
      let nearestLoot: { x: number; y: number } | null = null;
      let nearestLootDist = Infinity;
      this.state.loot?.forEach((l: LootView) => {
        if (l.itemId !== step.itemId) return;
        const ownerPlayer = l.owner ? this.state.players.get(l.owner) : null;
        const isPartyOwned = ownerPlayer ? partyNames.has(ownerPlayer.name) : false;
        if (l.owner && l.owner !== this.sid && !isPartyOwned) return;
        const d = Math.hypot(l.x - this.predX, l.y - this.predY);
        if (d < nearestLootDist) {
          nearestLootDist = d;
          nearestLoot = { x: l.x, y: l.y };
        }
      });
      if (nearestLoot) return nearestLoot;

      // Loài quái SINH Ở BẢN ĐỒ NÀY rơi nguyên liệu (ưu tiên quái thường hơn trùm), không phải loài rơi cao nhất toàn game
      const bestMon = dropSourceIn(step.itemId, this.map.def.id);
      if (bestMon) return this.monsterTargetPos(bestMon);
    }

    // Đột phá cảnh giới: chỉ về trung tâm trấn để an toàn
    if (step.kind === "reachRealm") {
      return { x: this.map.townPx.x, y: this.map.townPx.y };
    }

    return null;
  }

  private syncQuestNav() {
    const trackId = ui.getTrackingQuestId();
    if (!trackId) {
      this.hideNav();
      return;
    }
    const target = this.resolveQuestTarget(trackId);
    if (!target) {
      this.hideNav();
      return;
    }

    const dx = target.x - this.predX;
    const dy = target.y - this.predY;
    const dist = Math.hypot(dx, dy);

    // Khi ở quá gần mục tiêu (dưới 95 px) thì ẩn mũi tên để không rối mắt
    if (dist <= 95) {
      this.hideNav();
      return;
    }

    const angle = Math.atan2(dy, dx);
    this.navArrow.setPosition(
      this.predX + Math.cos(angle) * 44,
      this.predY - 8 + Math.sin(angle) * 44,
    );
    this.navArrow.setRotation(angle);
    this.navArrow.setVisible(true);
    if (target.hop) {
      const text = hopLabel(target.hop);
      if (text !== this.navLabelText) {
        this.navLabel.setText(text);
        this.navLabelText = text;
      }
      // Dưới mũi tên (phía trên là tên nhân vật, dễ chồng chữ)
      this.navLabel.setPosition(this.navArrow.x, this.navArrow.y + 16).setVisible(true);
    } else {
      this.navLabel.setVisible(false);
    }
  }

  // ---------------- Bản đồ nhỏ & Bản đồ lớn ----------------

  private syncMaps() {
    // đã phóng và đang bám theo mình: vẽ lại bản đồ lớn NGAY khi mình đi (không chờ nhịp 250 ms, nếu không bản đồ nhảy từng đoạn lớn)
    if (
      this.mapWasOpen &&
      this.mapCtl.follow &&
      this.mapCtl.cam.zoom > 1 &&
      (this.predX !== this.lastBigMeX || this.predY !== this.lastBigMeY)
    ) {
      this.lastBigMeX = this.predX;
      this.lastBigMeY = this.predY;
      this.redrawBigMap();
    }
    const now = performance.now();
    if (now - this.lastMapDraw < 250) return;
    this.lastMapDraw = now;

    const ov = getMapOverview(this.map.def.id);
    if (!ov) return;
    if (ui.isMinimapOpen()) this.drawMapCanvas("minimap", ov, false);
    const open = ui.isMapModalOpen();
    // mỗi lần MỞ bản đồ lớn: xem bản đồ mình đứng, zoom 1, bám theo mình
    if (open && !this.mapWasOpen) this.setMapView(null, false);
    this.mapWasOpen = open;
    if (open) {
      const bigOv = getMapOverview(this.mapViewId ?? this.map.def.id);
      if (bigOv) this.drawMapCanvas("worldmap", bigOv, true);
    }
  }

  /**
   * Chọn bản đồ XEM ở bản đồ lớn (`null` hoặc chính bản đồ mình đứng = bản đồ của mình): camera về zoom 1 (bám theo mình chỉ khi xem bản đồ
   * của mình), cập nhật tiêu đề, phụ đề, nút sơ đồ nối. Bản đồ khác chỉ có địa hình, cổng, NPC, khu quái và đồng đội đang đứng ở đó (vị trí mình / người
   * khác / quái chỉ biết ở bản đồ hiện tại).
   */
  private setMapView(id: string | null, redraw = true) {
    const viewId = id === null || id === this.map.def.id ? null : id;
    const ov = getMapOverview(viewId ?? this.map.def.id);
    if (!ov) return;
    this.mapViewId = viewId;
    this.mapCtl.reset({ worldW: ov.w * TILE, worldH: ov.h * TILE }, viewId === null);
    const title = document.getElementById("map-title");
    if (title) title.textContent = `Sơn Hà Đồ · ${ov.name}`;
    const sub = document.getElementById("map-coords");
    if (sub) {
      sub.textContent =
        viewId === null
          ? "Mũi tên xanh là đạo hữu, đầu nhọn chỉ hướng nhìn. Lăn chuột hoặc chụm hai ngón để phóng to, kéo để di chuyển"
          : `Đang xem bản đồ khác. Đạo hữu đang đứng ở ${this.map.def.name}: bấm "Về chỗ mình" để quay lại`;
    }
    this.updateMapGraphNav();
    if (redraw) this.redrawBigMap();
  }

  /** Dựng sơ đồ nối các bản đồ (nút theo toạ độ lưới của `mapGraph()`, Bắc ở trên); ẩn khi đang ở bí cảnh (không thuộc sơ đồ). */
  private buildMapGraphNav() {
    const nav = document.getElementById("map-graph");
    if (!nav) return;
    nav.replaceChildren();
    const g = mapGraph();
    if (g.nodes.length < 2 || !g.nodes.some((n) => n.mapId === this.map.def.id)) {
      nav.hidden = true;
      return;
    }
    nav.hidden = false;
    const minX = Math.min(...g.nodes.map((n) => n.gx));
    const minY = Math.min(...g.nodes.map((n) => n.gy));
    // lưới gấp đôi: nút ở ô lẻ, nhãn cổng ở ô chẵn giữa hai nút kề nhau
    const cell = (n: { gx: number; gy: number }) => ({
      col: 2 * (n.gx - minX) + 1,
      row: 2 * (n.gy - minY) + 1,
    });
    const sorted = [...g.nodes].sort((a, b) => a.gy - b.gy || a.gx - b.gx);
    for (const n of sorted) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mg-node";
      btn.dataset.mapId = n.mapId;
      const c = cell(n);
      btn.style.gridColumn = String(c.col);
      btn.style.gridRow = String(c.row);
      btn.textContent = n.name;
      if (n.mapId === this.map.def.id) {
        btn.setAttribute("aria-current", "location");
        const here = document.createElement("small");
        here.textContent = "đang đứng";
        btn.append(here);
      }
      btn.addEventListener("click", () => this.setMapView(n.mapId));
      nav.append(btn);
    }
    const seen = new Set<string>();
    for (const e of g.edges) {
      const key = [e.fromMapId, e.toMapId].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      const a = g.nodes.find((n) => n.mapId === e.fromMapId);
      const b = g.nodes.find((n) => n.mapId === e.toMapId);
      if (!a || !b) continue;
      const ca = cell(a);
      const cb = cell(b);
      if (Math.abs(ca.col - cb.col) + Math.abs(ca.row - cb.row) !== 2) continue; // chỉ nút KỀ nhau có chỗ cho nhãn
      const span = document.createElement("span");
      span.className = "mg-edge";
      span.textContent = `${e.fromPortalName} ⇄ ${e.toPortalName}`;
      span.style.gridColumn = String((ca.col + cb.col) / 2);
      span.style.gridRow = String((ca.row + cb.row) / 2);
      nav.append(span);
    }
    this.updateMapGraphNav();
  }

  /** Nút sơ đồ nối: bản đồ đang xem được đánh dấu (`aria-pressed`). */
  private updateMapGraphNav() {
    const viewed = this.mapViewId ?? this.map.def.id;
    document.querySelectorAll<HTMLElement>("#map-graph .mg-node").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.mapId === viewed));
    });
  }

  /** Vẽ lại bản đồ lớn ngay (sau phóng / kéo), gộp nhiều sự kiện trong một khung hình. */
  private redrawBigMap() {
    if (this.mapRedrawPending) return;
    this.mapRedrawPending = true;
    requestAnimationFrame(() => {
      this.mapRedrawPending = false;
      if (!ui.isMapModalOpen()) return;
      const ov = getMapOverview(this.mapViewId ?? this.map.def.id);
      if (ov) this.drawMapCanvas("worldmap", ov, true);
    });
  }

  /**
   * Vẽ một bản đồ (nhỏ `#minimap` hoặc lớn `#worldmap`): canvas được đặt ở độ phân giải thật (CSS x `devicePixelRatio`) rồi vẽ lớp nền
   * (`map-render.ts`: địa hình dựng một lần, trấn, cổng ghi tên nơi đến, NPC, khu quái) và chồng phần ĐỘNG lên: quái, người chơi khác,
   * đồng đội (cùng bản đồ), mục tiêu nhiệm vụ, và mình (mũi tên theo hướng nhìn). Canvas đang ẩn (kích thước CSS 0) thì bỏ qua.
   */
  private drawMapCanvas(id: "minimap" | "worldmap", ov: MapOverview, big: boolean) {
    const canvas = document.getElementById(id) as HTMLCanvasElement | null;
    if (!canvas || canvas.clientWidth === 0 || canvas.clientHeight === 0) return;
    // Bản đồ lớn theo TỈ LỆ bản đồ (Hắc Phong 128x96 không còn viền đen trên / dưới): chiều cao suy ra từ chiều rộng CSS (luật CSS đặt khung vuông)
    if (big) {
      const h = `${Math.round((canvas.clientWidth * ov.h) / ov.w)}px`;
      if (canvas.style.height !== h) canvas.style.height = h;
    }
    const size = canvasPixelSize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio);
    if (canvas.width !== size.w || canvas.height !== size.h) {
      canvas.width = size.w;
      canvas.height = size.h;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { u } = size;
    const pad = (big ? 6 : 2) * u;
    // bản đồ đang vẽ có thể KHÁC bản đồ mình đứng (xem qua sơ đồ nối): chỉ bản đồ của mình có mình / quái / người chơi khác / mục tiêu nhiệm vụ
    const here = ov.mapId === this.map.def.id;
    const worldW = ov.w * TILE;
    const worldH = ov.h * TILE;
    let v = fitView(worldW, worldH, size.w, size.h, pad);
    let zoomedIn = false;
    if (big) {
      // bản đồ lớn có camera: bám theo mình (đã phóng thì mình ở giữa) hoặc theo tay kéo
      const box = { worldW, worldH, cw: size.w, ch: size.h, pad };
      const cam = this.mapCtl.effective(box, this.predX, this.predY);
      v = cameraView(box, cam);
      zoomedIn = cam.zoom >= 2;
    }
    const qLog = big ? ui.getQuestLog() : null;
    const qCtx = big ? ui.getQuestContext() : null;
    const myName = this.me()?.name;
    const partyMems = ui.getParty().members.filter((m) => m.name !== myName);
    const partyNames = new Set(partyMems.map((m) => m.name));
    // Đồng đội đang đứng ở bản đồ ĐANG VẼ (toạ độ của đồng đội là trong bản đồ của họ: `PartyMember.mapId`; thiếu = bản đồ của mình)
    const sameMapParty = partyMems.filter((m) => (m.mapId ? m.mapId === ov.mapId : here));
    // Nhãn nền không được đè lên mình, đồng đội và đích nhiệm vụ (chỉ bản đồ lớn có nhãn)
    const avoid: { x: number; y: number; r: number }[] = [];
    const pins: { x: number; y: number; text: string }[] = [];
    let questTarget: { x: number; y: number } | null = null;
    if (big) {
      if (here) avoid.push({ x: this.predX, y: this.predY, r: 10 * u });
      for (const pm of sameMapParty) avoid.push({ x: pm.x, y: pm.y, r: 8 * u });
      const trackId = ui.getTrackingQuestId();
      const target = here && trackId ? this.resolveQuestTarget(trackId) : null;
      if (target) {
        questTarget = target;
        // ghim đích nhiệm vụ: ở bản đồ KHÁC thì đích là cổng kế tiếp trên đường tới đó ("Qua <cổng>")
        const name = QUEST_BY_ID[trackId ?? ""]?.title ?? "Nhiệm vụ";
        pins.push({ x: target.x, y: target.y, text: target.hop ? hopLabel(target.hop) : name });
      }
    }
    drawMapBase(ctx, ov, v, size.w, size.h, {
      u,
      big,
      avoid,
      pins,
      compact: big && canvas.clientWidth < COMPACT_CANVAS_CSS_PX && !zoomedIn,
      markerOf: qLog && qCtx ? (npcId) => npcMarker(npcId, qLog, qCtx) : undefined,
    });

    // Quái đang sống và người chơi khác trong tầm nhìn: chỉ biết ở bản đồ mình đang đứng
    if (here) {
      ctx.fillStyle = MAP_COLORS.monster;
      const mr = (big ? 1.5 : 1) * u;
      this.monsters.forEach((m) => {
        ctx.fillRect(v.ox + m.tx * v.scale - mr, v.oy + m.ty * v.scale - mr, 2 * mr, 2 * mr);
      });
      // Người chơi khác (chấm lam, trừ đồng đội)
      this.players.forEach((p, pid) => {
        if (pid === this.sid) return;
        const sp = this.state.players.get(pid);
        if (sp && partyNames.has(sp.name)) return;
        drawDot(
          ctx,
          v.ox + p.tx * v.scale,
          v.oy + p.ty * v.scale,
          (big ? 3.5 : 1.8) * u,
          MAP_COLORS.other,
        );
      });
    }

    // Đồng đội: chấm xanh lá viền trắng; bản đồ lớn ghi tên
    for (const pm of sameMapParty) {
      const x = v.ox + pm.x * v.scale;
      const y = v.oy + pm.y * v.scale;
      drawDot(ctx, x, y, (big ? 5 : 3.2) * u, MAP_COLORS.party, "#ffffff", u);
      if (big) drawHaloText(ctx, pm.name, x, y - 8 * u, MAP_COLORS.party, u);
    }

    // Mục tiêu nhiệm vụ đang theo dõi (bản đồ lớn): đường nét đứt từ mình tới đích (ghim đã vẽ cùng nhãn nền)
    if (big && here) {
      const t = questTarget;
      if (t) {
        ctx.strokeStyle = MAP_COLORS.npc;
        ctx.lineWidth = 1.5 * u;
        ctx.setLineDash([3 * u, 3 * u]);
        ctx.beginPath();
        ctx.moveTo(v.ox + this.predX * v.scale, v.oy + this.predY * v.scale);
        ctx.lineTo(v.ox + t.x * v.scale, v.oy + t.y * v.scale);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Chính mình: mũi tên theo hướng nhìn (chỉ trên bản đồ mình đứng)
    if (here)
      drawMarkerMe(
        ctx,
        v.ox + this.predX * v.scale,
        v.oy + this.predY * v.scale,
        this.facing,
        (big ? 6 : 3.5) * u,
      );
  }

  private updatePlayerAnim(
    e: Entity,
    who: "me" | "other",
    angle: number,
    isMoving: boolean,
    dead = false,
  ) {
    const dir = dirFromAngle(angle);
    // Máy trạng thái thuần (gfx/anim/player-anim.ts): gục > bị đánh > đánh > đi > đứng
    const clock = (e.playerAnim ??= newPlayerAnimClock());
    const state = playerAnimState(clock, this.time.now, {
      dead,
      slashUntil: e.slashUntil ?? 0,
      moving: isMoving,
    });
    e.playerAnimState = state;
    const prefix = e.animPrefix ?? who;
    const animKey = playerAnimKey(prefix, state, dir);
    // Giảm chuyển động: gục KHÔNG phát 4 khung đổ xuống, chỉ hiện thẳng khung xác nằm lại (nit của A ở #346)
    const deadFrame = `${prefix}-die-${PLAYER_DIE_FRAMES - 1}`;
    if (state === "die" && animReducedMotion() && this.textures.get(ATLAS_KEY).has(deadFrame)) {
      if (e.sprite.frame.name !== deadFrame) {
        e.sprite.anims.stop();
        e.sprite.setFrame(deadFrame);
      }
      e.sprite.setFlipX(false);
    } else if (this.anims.exists(animKey)) {
      if (e.sprite.anims.currentAnim?.key !== animKey) e.sprite.play(animKey, true);
      e.sprite.setFlipX(false);
    } else {
      e.sprite.setFlipX(Math.cos(angle) < 0);
    }
  }

  /**
   * Cập nhật ngoại hình nhân vật theo trang bị (weapon / robe / talisman).
   * Chỉ chạy khi khóa trang bị đổi để tránh vẽ lại mỗi frame.
   */
  private applyPlayerEquip(e: Entity, p: any, isMe: boolean) {
    const who = isMe ? "me" : "other";
    const weapon = p.weapon ?? "";
    const robe = p.robe ?? "";
    const talisman = p.talisman ?? "";
    const equipKey = `${weapon}|${robe}|${talisman}`;
    if (e.lastEquipKey === equipKey) return;
    e.lastEquipKey = equipKey;

    // 1. Pháp bào: ưu tiên bộ frame vẽ sẵn trong atlas (robe-<id>), không có thì nhuộm màu
    const robePrefix = robe ? `robe-${robe}` : "";
    if (robePrefix && this.anims.exists(`${robePrefix}-idle-down`)) {
      e.animPrefix = robePrefix;
      e.sprite.clearTint();
    } else {
      e.animPrefix = who;
      const robeDef = robe ? ITEM_BY_ID[robe] : undefined;
      if (robeDef) e.sprite.setTint(robeDef.color);
      else e.sprite.clearTint();
    }

    // 2. Vũ khí: vẽ thanh kiếm đeo sau lưng theo màu kiếm đang trang bị
    if (e.weaponVisual) {
      e.weaponVisual.clear();
      const wDef = weapon ? ITEM_BY_ID[weapon] : undefined;
      if (wDef) {
        const bladeCol = wDef.color;
        const hiltCol = RARITY_COLORS[wDef.rarity] ?? 0xd8b868;
        e.weaponVisual.lineStyle(3, 0x1d1a16, 0.95);
        e.weaponVisual.strokeLineShape(new Phaser.Geom.Line(-11, -26, 9, -2));
        e.weaponVisual.lineStyle(2, bladeCol, 1);
        e.weaponVisual.strokeLineShape(new Phaser.Geom.Line(-10, -25, 8, -3));
        e.weaponVisual.lineStyle(2, hiltCol, 1);
        e.weaponVisual.strokeLineShape(new Phaser.Geom.Line(-13, -21, -6, -27));
        e.weaponVisual.fillStyle(hiltCol, 1);
        e.weaponVisual.fillCircle(-12, -27, 2);
        e.weaponVisual.setVisible(true);
      } else {
        e.weaponVisual.setVisible(false);
      }
    }

    // 3. Hộ phù: vòng hào quang nhỏ mang màu của hộ phù
    if (e.talismanRing) {
      const tDef = talisman ? ITEM_BY_ID[talisman] : undefined;
      if (tDef) {
        e.talismanRing
          .setFillStyle(tDef.color, 0.14)
          .setStrokeStyle(1.6, tDef.color, 0.8)
          .setVisible(!ui.isLowFx());
      } else {
        e.talismanRing.setVisible(false);
      }
    }
  }

  private syncPlayers(k: number, deltaMs: number) {
    const seen = this.seenIds;
    seen.clear();
    const lowFx = ui.isLowFx();
    const hideNames = ui.isHideNames();
    this.state.players.forEach((p: any, id: string) => {
      seen.add(id);
      const isMe = id === this.sid;
      const who = isMe ? "me" : "other";
      // Vị trí để vẽ: chính mình nhận x, y thật từ server; người khác nhận px, py (làm tròn, ~10 Hz, #80).
      // Server cũ chưa có px thì rơi về x, y: client chạy được với cả hai.
      const posX: number = isMe ? p.x : (p.px ?? p.x);
      const posY: number = isMe ? p.y : (p.py ?? p.y);
      let e = this.players.get(id);
      if (!e) {
        e = this.makeEntity(who, posX, posY, true);
        if (isMe) this.cameras.main.startFollow(e.root, true, 0.2, 0.2);
        this.players.set(id, e);
      }
      if (isMe) {
        // Bám sát vị trí đoán trước; làm mượt các lần chỉnh nhỏ từ server
        const kk = 1 - Math.exp(-30 * (deltaMs / 1000));
        e.root.x += (this.predX - e.root.x) * kk;
        e.root.y += (this.predY - e.root.y) * kk;
        e.root.setVisible(true);
        if (e.sprite.anims.isPaused) e.sprite.anims.resume();
        this.applyPlayerEquip(e, p, true);
        this.updatePlayerAnim(
          e,
          who,
          this.facing,
          this.moving && !p.dead && !p.meditating,
          Boolean(p.dead),
        );
        this.stepTween(
          e,
          true,
          this.moving && !p.dead && !p.meditating,
          Boolean(p.dead),
          sinceStart(this.time.now, e.slashUntil ?? 0, SLASH_MS),
          this.playerHurtSince(e),
        );
        if (ui.isLimboOpen()) {
          ui.death(null);
        } else if (p.dead && (this.time.now < this.duelKoUntil || ui.isDuelActive())) {
          if (!this.duelKoUntil) {
            this.duelKoUntil = this.time.now + DUEL_KO_MS + 400;
          }
          const remSec = Math.max(1, Math.ceil((this.duelKoUntil - this.time.now) / 1000));
          ui.death(remSec, `Bị đánh gục, đứng dậy sau ${remSec}s`);
        } else if (
          this.time.now < this.dungeonFallUntil ||
          (p.dead && isDungeonMap(this.map.def.id))
        ) {
          if (!this.dungeonFallUntil) {
            this.dungeonFallUntil = this.time.now + DUNGEON_FALL_EXIT_MS;
          }
          const remSec = Math.max(1, Math.ceil((this.dungeonFallUntil - this.time.now) / 1000));
          ui.death(
            remSec,
            dungeonFallenDeathText(remSec, ui.getDungeonRewardsLeft()),
            dungeonFallenSubText(),
          );
        } else {
          // Chết thường: nêu trấn của bản đồ HIỆN TẠI (server hồi sinh ở đó), không chép cứng tên trấn
          const left = p.dead
            ? Math.max(0, Math.ceil(5 - (this.time.now - (e as any).deadSince) / 1000))
            : null;
          ui.death(left, left === null ? undefined : respawnDeathText(this.map.townName, left));
        }
        if (p.dead && !(e as any).deadSince) (e as any).deadSince = this.time.now;
        if (!p.dead) {
          (e as any).deadSince = 0;
          // `duelEnd` và `dungeonFallen` tới TRƯỚC patch `dead = true`: khung xen giữa không được xoá mốc KO vừa đặt (chỉ xoá khi đã hết hạn)
          if (this.time.now >= this.duelKoUntil) this.duelKoUntil = 0;
          if (this.time.now >= this.dungeonFallUntil) this.dungeonFallUntil = 0;
        }
      } else {
        const dist = Math.hypot(posX - e.root.x, posY - e.root.y);
        e.tx = posX;
        e.ty = posY;
        e.root.x += (e.tx - e.root.x) * k;
        e.root.y += (e.ty - e.root.y) * k;
        if (!this.inView(e.root.x, e.root.y, 48)) {
          if (e.root.visible) e.root.setVisible(false);
          if (e.sprite.anims.isPlaying) e.sprite.anims.pause();
          return;
        }
        if (!e.root.visible) e.root.setVisible(true);
        if (e.sprite.anims.isPaused) e.sprite.anims.resume();
        this.applyPlayerEquip(e, p, false);
        if (this.animDue(e))
          this.updatePlayerAnim(
            e,
            who,
            p.angle,
            dist > 1.5 && !p.dead && !p.meditating,
            Boolean(p.dead),
          );
        this.stepTween(
          e,
          false,
          dist > 1.5 && !p.dead && !p.meditating,
          Boolean(p.dead),
          sinceStart(this.time.now, e.slashUntil ?? 0, SLASH_MS),
          this.playerHurtSince(e),
        );

        // Xác người khác nằm ~5 giây rồi mờ dần và ẩn (#150)
        if (p.dead) {
          if (!(e as any).deadSince) (e as any).deadSince = this.time.now;
          const deadAgeMs = this.time.now - (e as any).deadSince;
          if (deadAgeMs > 5000) {
            const fadeAlpha = Math.max(0, 0.35 * (1 - (deadAgeMs - 5000) / 1500));
            e.root.setAlpha(fadeAlpha);
            if (fadeAlpha <= 0) e.root.setVisible(false);
          } else {
            e.root.setAlpha(0.35);
          }
        } else {
          (e as any).deadSince = 0;
          e.root.setAlpha(1);
        }
      }
      e.root.setDepth(e.root.y);
      if (isMe) {
        e.root.setAlpha(p.dead ? 0.35 : 1);
      }
      const showAura = Boolean(p.meditating && !lowFx);
      e.aura!.setVisible(showAura);
      if (showAura) {
        const s = 1 + 0.25 * this.auraWave;
        e.aura!.setScale(s, s).setAlpha(0.25 + 0.25 * this.auraWave);
        // Đốm sáng trôi lên theo ngân sách hiệu ứng (đông người đả tọa thì tự bị bỏ bớt, ưu tiên 0)
        const nextAt = nextMoteAt(e.nextMoteAt, this.time.now, Math.random());
        if (nextAt !== null) {
          e.nextMoteAt = nextAt;
          if (this.inView(e.root.x, e.root.y, 32))
            this.fx.play("meditate-mote", e.root.x, e.root.y - 6, { priority: motePriority(isMe) });
        }
      }
      if (e.talismanRing) {
        const showTalisman = Boolean(p.talisman && ITEM_BY_ID[p.talisman] && !lowFx);
        e.talismanRing.setVisible(showTalisman);
        if (showTalisman) {
          const s = 1 + 0.15 * this.talismanWave;
          e.talismanRing.setScale(s, s).setAlpha(0.14 + 0.31 * this.talismanWave);
        }
      }
      const distToMe = isMe ? 0 : Math.hypot(e.root.x - this.predX, e.root.y - this.predY);
      const showLabel = labelVisible(isMe, hideNames, distToMe, getQuality().nameLabelRadius);
      this.syncShadow(e);
      e.label!.setVisible(showLabel);
      if (showLabel) {
        const isDuel = Boolean((p as any).duel);
        const duelPrefix = isDuel ? "⚔ " : "";
        const sectTag = (p as any).sect ? `[${(p as any).sect}]` : "";
        const label = sectTag
          ? `${sectTag}\n${duelPrefix}${p.name}\n${realmLabel(p.realm, p.tier)}`
          : `${duelPrefix}${p.name}\n${realmLabel(p.realm, p.tier)}`;
        if (label !== e.lastLabel) {
          e.label!.setText(label);
          e.lastLabel = label;
        }
      }
      this.drawBar(e, p.hp / p.maxHp, isMe ? 0x6ad06a : 0xd0a040, -30, 28, p.hp < p.maxHp);

      // Cập nhật máu đối thủ trong HUD quyết đấu nếu đang trong trận PK (M3.5, #218)
      if (ui.isDuelActive()) {
        const oppName = ui.getDuelOpponent();
        if (oppName && p.name.toLowerCase() === oppName.toLowerCase()) {
          ui.updateDuelOpponentHp(p.hp, p.maxHp);
        }
      }
    });
    for (const [id, e] of this.players)
      if (!seen.has(id)) {
        e.root.destroy();
        this.players.delete(id);
      }
  }

  private syncMonsters(k: number) {
    const seen = this.seenIds;
    seen.clear();
    this.state.monsters.forEach((m: any, id: string) => {
      seen.add(id);
      let e = this.monsters.get(id);
      const def = MONSTER_BY_ID[m.kind];
      if (!e) {
        e = this.makeEntity(`mon-${m.kind}`, m.x, m.y, false, monsterShadow(def.radius));
        e.monKind = m.kind;
        e.monAnim = newMonAnimClock();
        if (def.boss) {
          e.label = this.add
            .text(0, -def.radius - 22, def.name, {
              fontFamily: '"Noto Serif", Georgia, serif',
              fontSize: "13px",
              color: "#ffb0a0",
              stroke: "#000",
              strokeThickness: 3,
            })
            .setOrigin(0.5);
          e.root.add(e.label);
        }
        this.monsters.set(id, e);
      }
      const monDist = Math.hypot(m.x - e.root.x, m.y - e.root.y);
      e.tx = m.x;
      e.ty = m.y;
      e.root.x += (e.tx - e.root.x) * k;
      e.root.y += (e.ty - e.root.y) * k;
      if (!this.inView(e.root.x, e.root.y, 48)) {
        if (e.root.visible) e.root.setVisible(false);
        if (e.sprite.anims.isPlaying) e.sprite.anims.pause();
        return;
      }
      if (!e.root.visible) e.root.setVisible(true);
      if (e.sprite.anims.isPaused) e.sprite.anims.resume();
      if (this.animDue(e)) this.updateMonsterAnim(e);
      this.stepTween(
        e,
        false,
        monDist > 1.5,
        false,
        e.monAnim ? sinceStart(this.time.now, e.monAnim.attackUntil, monAnimMs("attack")) : -1,
        e.monAnim ? sinceStart(this.time.now, e.monAnim.hurtUntil, monAnimMs("hurt")) : -1,
      );
      this.syncShadow(e);
      e.root.setDepth(e.root.y);
      e.sprite.setFlipX(Math.cos(m.angle) < 0);
      this.drawBar(
        e,
        m.hp / m.maxHp,
        0xc0392b,
        -def.radius - 10,
        Math.max(24, def.radius * 2),
        m.hp < m.maxHp,
      );
      this.syncMonsterStatus(e, m.fx, def.radius, !!def.boss);
    });
    for (const [id, e] of this.monsters) {
      if (seen.has(id)) continue;
      this.stepTween(e, false, false, true, -1, -1); // gục: trả sprite về tỉ lệ gốc (nhát chí mạng đang nén dở thì không kẹt tỉ lệ lệch)
      if (e.root.visible) {
        // Quái biến khỏi state khi đang hiện trong màn hình = gục: tan thành điểm sáng (ngoài camera thì root ẩn, không vào đây)
        // Chỉ khi còn gần mình: quái rời vùng nhìn của server (xa hơn 1100 px) cũng biến khỏi state nhưng KHÔNG gục
        if (isMonsterDeath(Math.hypot(e.root.x - this.predX, e.root.y - this.predY))) {
          // Trùm nổ lớn hơn, quái Kim Đan đổi màu hạt, quái cũ như trước (gfx/fx/combat-fx.ts `planMonsterDeath`)
          const death = planMonsterDeath(e.monKind);
          this.fx.play(death.recipe, e.root.x, e.root.y - 8, {
            priority: death.priority,
            tint: death.tint,
          });
        }
        const dieKey = e.monKind ? monAnimKey(e.monKind, "die") : "";
        if (dieKey && e.monAnim && !animReducedMotion() && this.anims.exists(dieKey)) {
          // Gục: 4 khung (đổ bẹp, tan thành điểm sáng) rồi mờ dần; thanh máu ẩn ngay
          e.monAnim.dying = true;
          e.monAnimState = "die";
          e.bar.setVisible(false);
          e.sprite.play(dieKey, true);
          this.tweens.add({
            targets: e.root,
            alpha: 0,
            delay: monAnimMs("die") - 60,
            duration: 220,
            onComplete: () => e.root.destroy(),
          });
        } else {
          this.tweens.add({
            targets: e.root,
            alpha: 0,
            scale: 0.6,
            duration: 300,
            onComplete: () => e.root.destroy(),
          });
        }
      } else {
        e.root.destroy();
      }
      this.monsters.delete(id);
    }
  }

  /** Phát hoạt ảnh theo máy trạng thái (gfx/anim/mon-anim.ts); chỉ đổi khi trạng thái đổi. */
  private updateMonsterAnim(e: Entity) {
    if (!e.monKind || !e.monAnim) return;
    const st = monAnimState(e.monAnim, this.time.now);
    if (e.monAnimState === st) return;
    e.monAnimState = st;
    const key = monAnimKey(e.monKind, st);
    if (this.anims.exists(key)) e.sprite.play(key, true);
  }

  private syncLoot() {
    if (!this.state.loot) {
      ui.pickupPrompt(null);
      return;
    }
    // Lần đồng bộ đầu tiên: đồ có sẵn trong vùng nhìn không nổ hạt "xuất hiện" cùng lúc
    if (this.lootFxFrom === 0) this.lootFxFrom = this.time.now + 1000;
    const seen = this.seenIds;
    seen.clear();
    let bestId: string | null = null;
    let bestDist = PICKUP_RANGE;
    let bestLabel: string | null = null;
    const me = this.me();
    const lowFx = ui.isLowFx();
    const party = ui.getParty();
    const partyNames = new Set(party.members.map((m) => m.name));

    this.state.loot.forEach((l: LootView, id: string) => {
      seen.add(id);
      const def = ITEM_BY_ID[l.itemId];
      const rarityColor = def ? RARITY_COLORS[def.rarity] : 0xc9c4b8;
      let le = this.loots.get(id);
      if (!le) {
        const root = this.add.container(l.x, l.y).setDepth(l.y - 2);
        const ring = this.add
          .circle(0, 2, 11, rarityColor, 0.18)
          .setStrokeStyle(1.8, rarityColor, 0.9);
        const texKey = this.textures.exists(`item-${l.itemId}`) ? `item-${l.itemId}` : "dot";
        const icon = this.add.image(0, -3, texKey);
        if (texKey === "dot" && def) icon.setTint(def.color);
        const hex = `#${rarityColor.toString(16).padStart(6, "0")}`;
        const label = this.add
          .text(0, -18, "", {
            fontFamily: '"Noto Serif", Georgia, serif',
            fontSize: "11px",
            color: hex,
            stroke: "#1d1a16",
            strokeThickness: 3,
          })
          .setOrigin(0.5);
        root.add([ring, icon, label]);
        le = { root, ring, icon, label, itemId: l.itemId, qty: 0 };
        this.loots.set(id, le);
        if (this.time.now >= this.lootFxFrom && this.inView(l.x, l.y, 48)) {
          // Đồ xuất hiện: hạt màu theo độ hiếm (gfx/fx/world-fx.ts)
          const plan = planLootDrop(def?.rarity);
          this.fx.play(plan.recipe, l.x, l.y - 4, { priority: plan.priority, tint: plan.tint });
        }
      }

      const ownerPlayer = l.owner ? this.state.players.get(l.owner) : null;
      const isPartyOwned = ownerPlayer ? partyNames.has(ownerPlayer.name) : false;
      const canPickup = !l.owner || l.owner === this.sid || isPartyOwned;
      if (me && !me.dead && canPickup) {
        const d = Math.hypot(l.x - this.predX, l.y - this.predY);
        if (d <= bestDist) {
          bestDist = d;
          bestId = id;
          bestLabel = def?.name ?? "";
        }
      }

      if (!this.inView(l.x, l.y, 48)) {
        if (le.root.visible) le.root.setVisible(false);
        return;
      }
      if (!le.root.visible) le.root.setVisible(true);

      le.root.setPosition(l.x, l.y);
      le.root.setDepth(l.y - 2);
      le.ring.setVisible(!lowFx);
      if (!lowFx) {
        const s = 1 + 0.3 * this.lootWave;
        le.ring.setScale(s, s).setAlpha(0.18 + 0.17 * this.lootWave);
      }
      le.icon.y = -3 - 3 * this.lootWave;
      if (!lowFx && def && lootGlints(def.rarity)) {
        const due = nextDueAt(
          le.nextGlintAt,
          this.time.now,
          glintIntervalMs(def.rarity),
          400,
          Math.random(),
        );
        if (due !== null) {
          le.nextGlintAt = due;
          this.fx.play("loot-glint", l.x + Phaser.Math.Between(-9, 9), l.y - 6, {
            tint: rarityTint(def.rarity),
          });
        }
      }
      if (le.qty !== l.qty) {
        le.qty = l.qty;
        const name = def?.name ?? l.itemId;
        le.label.setText(l.qty > 1 ? `${name} ×${l.qty}` : name);
      }
      // Đồ của người khác (trong 30 giây đầu) hiện mờ đi; đồ của mình hoặc đồng đội hiện rõ
      le.root.setAlpha(canPickup ? 1 : 0.35);
    });

    for (const [id, le] of this.loots) {
      if (seen.has(id)) continue;
      if (this.lastPickup?.id === id && this.time.now - this.lastPickup.at < 1200) {
        // Mình vừa nhặt món này: đốm màu độ hiếm bay lên
        const plan = planLootPickup(ITEM_BY_ID[le.itemId]?.rarity);
        this.fx.play(plan.recipe, le.root.x, le.root.y - 4, {
          priority: plan.priority,
          tint: plan.tint,
        });
        this.lastPickup = null;
      }
      le.root.destroy();
      this.loots.delete(id);
    }

    this.nearestLootId = bestId;
    ui.pickupPrompt(bestLabel);
  }

  /** Áp cờ `blobShadows` của hồ sơ chất lượng cho bóng của thực thể (chỉ chạm tới đối tượng khi cờ đổi). */
  private syncShadow(e: Entity) {
    const on = getQuality().blobShadows;
    if (e.shadowOn === on) return;
    e.shadowOn = on;
    e.shadow?.setVisible(on);
  }

  /**
   * Tween nhẹ mỗi khung (gfx/anim/tween.ts): nhấp nhô khi đi, co giãn khi đánh / bị đánh. Tắt khi giảm chuyển động, bậc Thấp, ở xa
   * (`tweenEnabled`); lúc tắt trả sprite về vị trí / tỉ lệ gốc đúng MỘT lần rồi không ghi gì nữa (không tốn mỗi khung).
   */
  private stepTween(
    e: Entity,
    me: boolean,
    moving: boolean,
    dead: boolean,
    strikeSince: number,
    hurtSince: number,
  ) {
    const near = me || (e.distMe ?? Number.POSITIVE_INFINITY) < FAR_ANIM_DIST;
    const t = spriteTween({
      enabled: tweenEnabled(getQuality(), near),
      nowMs: this.time.now,
      moving,
      dead,
      strikeSince,
      hurtSince,
      phaseMs: (e.tweenPhase ??= Math.random() * WALK_BOB_PERIOD_MS),
    });
    if (t === NEUTRAL_TWEEN) {
      if (!e.tweenActive) return;
      e.tweenActive = false;
    } else e.tweenActive = true;
    e.sprite.setScale(t.sx, t.sy);
    e.sprite.y = (e.spriteBaseY ?? 0) + t.dy + footPlant(e.sprite.height, t.sy);
  }

  /** Đã bao lâu kể từ lúc người chơi bắt đầu bị đánh (tween), -1 nếu không (mốc 0 = chưa từng, không tính từ đầu cảnh). */
  private playerHurtSince(e: Entity): number {
    const c = e.playerAnim;
    return c && c.hurtFrom > 0
      ? sinceStart(this.time.now, c.hurtFrom + HURT_PULSE_MS, HURT_PULSE_MS)
      : -1;
  }

  /** Thực thể ở xa (không phải mình) chỉ cập nhật trạng thái hoạt ảnh theo `farAnimHz` (gfx/anim/entity-lod.ts). */
  private animDue(e: Entity): boolean {
    const dme = Math.hypot(e.root.x - this.predX, e.root.y - this.predY);
    e.distMe = dme;
    const now = this.time.now;
    if (!animUpdateDue(now, e.lastAnimAt ?? -1e9, dme, getQuality().farAnimHz)) return false;
    e.lastAnimAt = now;
    return true;
  }

  private makeEntity(
    texture: string,
    x: number,
    y: number,
    isPlayer: boolean,
    shadowDims: ShadowDims = playerShadow(),
  ): Entity {
    const root = this.add.container(x, y);
    const hasAtlas = this.textures.exists(ATLAS_KEY) && this.textures.get(ATLAS_KEY).has(texture);
    const sprite = hasAtlas
      ? this.add.sprite(0, isPlayer ? -12 : 0, ATLAS_KEY, texture)
      : this.add.sprite(0, isPlayer ? -12 : 0, texture);
    const bar = this.add.graphics();
    const e: Entity = { root, sprite, bar, tx: x, ty: y, spriteBaseY: isPlayer ? -12 : 0 };
    // Bóng đốm dưới chân, vẽ DƯỚI mọi thứ khác của thực thể; hiện / ẩn theo hồ sơ chất lượng (syncShadow)
    e.shadow = this.add
      .image(0, shadowDims.y, SHADOW_KEY)
      .setDisplaySize(shadowDims.w, shadowDims.h)
      .setAlpha(SHADOW_ALPHA)
      .setVisible(false);
    if (isPlayer) {
      e.aura = this.add
        .ellipse(0, 6, 54, 22, 0xffe08a, 0.25)
        .setStrokeStyle(2, 0xffe08a, 0.7)
        .setVisible(false);
      e.talismanRing = this.add
        .circle(0, 4, 18, 0xffe08a, 0.14)
        .setStrokeStyle(1.6, 0xffe08a, 0.8)
        .setVisible(false);
      e.weaponVisual = this.add.graphics().setVisible(false);
      e.label = this.add
        .text(0, -54, "", {
          fontFamily: '"Noto Serif", Georgia, serif',
          fontSize: "12px",
          color: "#fff6dc",
          align: "center",
          stroke: "#1d1a16",
          strokeThickness: 3,
          lineSpacing: -2,
        })
        .setOrigin(0.5, 1);
      root.add([e.shadow, e.aura, e.talismanRing, e.weaponVisual, sprite, bar, e.label]);
    } else {
      root.add([e.shadow, sprite, bar]);
    }
    return e;
  }

  /**
   * Huy hiệu trạng thái có hại trên đầu quái từ `Monster.fx` (mặt nạ bit công khai, #559): chỉ vẽ lại khi mặt nạ ĐỔI (hiếm), Graphics dựng lười ở lần đầu cần.
   * Máy chủ cũ chưa có `fx` (undefined) hoặc giá trị rác thì coi như 0. Trùm có tên ở -radius-22 nên hàng chấm nằm cao hơn một nấc.
   */
  private syncMonsterStatus(e: Entity, fx: unknown, radius: number, boss: boolean) {
    const mask = typeof fx === "number" && Number.isInteger(fx) && fx > 0 ? fx : 0;
    if (mask === (e.lastFx ?? 0)) return;
    e.lastFx = mask;
    const pips = pipsOf(mask);
    e.pipCount = pips.length;
    e.pipText = pipsLabel(pips);
    if (pips.length === 0) {
      e.statusG?.clear().setVisible(false);
      return;
    }
    if (!e.statusG) {
      e.statusG = this.add.graphics();
      e.root.add(e.statusG);
    }
    e.statusG.setVisible(true);
    drawPips(e.statusG, pips, -radius - (boss ? 36 : 21));
    e.pipDraws = (e.pipDraws ?? 0) + 1;
  }

  /** Cho script kiểm (`?debug`): huy hiệu đang hiện trên đầu một con quái. */
  public monsterPips(
    id: string,
  ): { n: number; text: string; visible: boolean; draws: number } | null {
    const e = this.monsters.get(id);
    if (!e) return null;
    return {
      n: e.pipCount ?? 0,
      text: e.pipText ?? "",
      visible: !!e.statusG?.visible,
      draws: e.pipDraws ?? 0,
    };
  }

  private drawBar(e: Entity, frac: number, color: number, y: number, w: number, visible: boolean) {
    const fillW = visible ? Math.round(w * Phaser.Math.Clamp(frac, 0, 1)) : -1;
    const key = visible ? fillW + color * 256 : -1;
    if (e.lastBarKey === key) return;
    e.lastBarKey = key;
    const g = e.bar;
    g.clear();
    if (!visible) return;
    g.fillStyle(0x000000, 0.55).fillRect(-w / 2, y, w, 4);
    g.fillStyle(color, 1).fillRect(-w / 2, y, fillW, 4);
  }

  // ---------------- Hiệu ứng ----------------

  private stepTransientFx(now: number) {
    // 0. Báo trước đòn + đạn của quái: vẽ lại theo đồng hồ cảnh (vị trí đạn tính từ lúc bắn, không từ khung)
    this.telegraphs.update(now);

    // 1. Vệt chém (180ms)
    for (let i = this.activeSlashes.length - 1; i >= 0; i--) {
      const it = this.activeSlashes[i];
      const p = (now - it.start) / 180;
      if (p >= 1) {
        it.g.setVisible(false);
        this.slashPool.push(it.g);
        const last = this.activeSlashes.pop()!;
        if (i < this.activeSlashes.length) this.activeSlashes[i] = last;
      } else {
        it.g.setAlpha(1 - p).setScale(1 + 0.15 * p);
      }
    }

    // 2. Kiếm khí (bay 220ms + mờ dần 120ms = 340ms)
    for (let i = this.activeSwords.length - 1; i >= 0; i--) {
      const it = this.activeSwords[i];
      const elapsed = now - it.start;
      if (elapsed >= 340) {
        it.img.setVisible(false);
        this.swordPool.push(it.img);
        const last = this.activeSwords.pop()!;
        if (i < this.activeSwords.length) this.activeSwords[i] = last;
      } else if (elapsed <= 220) {
        const p = elapsed / 220;
        it.img.setPosition(it.x0 + it.dx * p, it.y0 + it.dy * p).setAlpha(1);
      } else {
        it.img.setPosition(it.x0 + it.dx, it.y0 + it.dy).setAlpha(1 - (elapsed - 220) / 120);
      }
    }

    // 3. Chữ sát thương bay lên + hạt: lõi hiệu ứng (gfx/fx; giảm chuyển động theo hồ sơ chất lượng)
    this.fx.update(now);
    this.layoutLight();
    this.emitWeather(now);
    this.stepFog(now);
    this.stepWater(now);
  }

  /** Tin `dmg`: chữ bay + âm thanh, và đánh dấu "bị đánh" cho quái / người chơi bị trúng (hoạt ảnh bị đánh, M5.2 #328). */
  private onDmg(m: DmgMsg) {
    if (m.target === this.sid) {
      this.recordCombat();
    }
    if (!this.inView(m.x, m.y, 96)) return;
    if (!animReducedMotion()) {
      if (m.toPlayer) {
        const pe = this.players.get(m.target);
        if (pe)
          markPlayerHurt(
            (pe.playerAnim ??= newPlayerAnimClock()),
            this.time.now,
            pe.slashUntil ?? 0,
          );
      } else {
        const mon = this.monsters.get(m.target);
        if (mon?.monAnim) markMonHurt(mon.monAnim, this.time.now);
      }
    }
    this.onHitFx(m);
    sound.hit(m.crit);
  }

  private onFx(m: FxMsg) {
    if ((m.kind === "slash" || m.kind === "sword") && m.by === this.sid) return; // đã vẽ ngay khi bấm
    switch (m.kind) {
      case "slash": {
        const other = this.players.get(m.by);
        if (other) other.slashUntil = this.time.now + SLASH_MS;
        if (!this.inView(m.x, m.y, 110)) return;
        const attacker = this.state?.players?.get(m.by);
        return this.fxSlash(m.x, m.y, m.angle, this.weaponColorFor(attacker, 0xdfe8f0));
      }
      case "sword": {
        const other = this.players.get(m.by);
        if (other) other.slashUntil = this.time.now + SLASH_MS;
        if (!this.inView(m.x, m.y, m.range + 96)) return;
        const attacker = this.state?.players?.get(m.by);
        return this.fxSword(m.x, m.y, m.angle, m.range, this.weaponColorFor(attacker, 0xffffff));
      }
      case "mslash": {
        const mon = this.monsters.get(m.by);
        if (mon?.monAnim && !animReducedMotion()) markMonAttack(mon.monAnim, this.time.now);
        if (!this.inView(m.x, m.y, 96)) return;
        return this.fxSlash(m.x, m.y, m.angle, 0xff6050, 0.6);
      }
      case "cast": {
        // Dùng chiêu (M7.7, #508): hạt theo hình / hệ của chiêu (`cast-fx.ts`); client chỉ vẽ, kết quả đánh do máy chủ quyết định
        const def = skillOf(m.skill);
        if (!def) return; // id lạ: bỏ qua
        const mine = m.by === this.sid;
        if (mine) {
          // đòn của mình: số sát thương trúng quái trong tầm được tô như đòn của mình (như chém / kiếm khí)
          this.lastAttack = { at: this.time.now, range: m.range };
          const me = this.players.get(this.sid);
          if (me) me.slashUntil = this.time.now + SLASH_MS;
        } else {
          const other = this.players.get(m.by);
          if (other) other.slashUntil = this.time.now + SLASH_MS;
        }
        if (!this.inView(m.x, m.y, m.range + 96)) return;
        return this.playFxPoints(
          planCastFx({
            skill: def,
            x: m.x,
            y: m.y,
            angle: m.angle,
            range: m.range,
            mine,
            emitterBudget: getQuality().emitterBudget,
          }),
        );
      }
      case "warn":
        // Báo trước đòn của quái (M7.7, #508): vùng tô đặc lớn dần tới lúc đòn đáp xuống; client chỉ vẽ, máy chủ quyết định trúng / trượt
        this.telegraphs.warn(m, this.time.now);
        return;
      case "bolt":
        // Đạn tầm xa của quái: client tự bay theo `speed` / `angle` tới hết `range` (đạn không là state)
        this.telegraphs.bolt(m, this.time.now);
        return;
      case "levelup":
        return this.fxLevelUp(m.x, m.y, m.major, m.by === this.sid);
      case "breakfail":
        if (!this.inView(m.x, m.y, 120)) return;
        return this.fxBreakFail(m.x, m.y, m.by === this.sid);
    }
  }

  private fxSlash(x: number, y: number, angle: number, color: number, scale = 1, mine = false) {
    const g = this.slashPool.pop() ?? this.add.graphics();
    g.clear();
    g.setPosition(x, y - 8)
      .setDepth(y + 1)
      .setAlpha(1)
      .setScale(1)
      .setVisible(true);
    const r = SKILLS.slash.range * scale,
      half = SKILLS.slash.arc / 2;
    g.lineStyle(6 * scale, color, 0.9);
    g.beginPath();
    g.arc(0, 0, r * 0.8, angle - half, angle + half);
    g.strokePath();
    g.lineStyle(2, color, 0.5);
    g.beginPath();
    g.arc(0, 0, r, angle - half * 0.8, angle + half * 0.8);
    g.strokePath();
    this.activeSlashes.push({ g, start: this.time.now });
    // Tia lửa ở hai đầu cung (gfx/fx/skill-fx.ts); đòn của yêu thú (scale < 1) không thêm
    if (scale >= 1)
      this.playFxPoints(
        planSlashEdges(
          x,
          y,
          angle,
          SKILLS.slash.range,
          SKILLS.slash.arc,
          mine,
          color,
          slashEdgesFor(getQuality().emitterBudget),
        ),
      );
  }

  /** Phát các điểm hạt của một kế hoạch (có trễ thì hẹn giờ theo đồng hồ cảnh; đóng cảnh thì tự huỷ). */
  private playFxPoints(points: FxPoint[]) {
    for (const p of points) {
      const play = () =>
        void this.fx.play(p.recipe, p.x, p.y, {
          priority: p.priority,
          tint: p.tint,
          angle: p.angle,
        });
      if (p.delayMs <= 0) play();
      else this.time.delayedCall(p.delayMs, play);
    }
  }

  private fxSword(
    x: number,
    y: number,
    angle: number,
    range: number,
    tint = 0xffffff,
    mine = false,
  ) {
    const s =
      this.swordPool.pop() ??
      this.add.image(x, y - 10, "swordbeam").setBlendMode(Phaser.BlendModes.ADD);
    s.setPosition(x, y - 10)
      .setRotation(angle)
      .setDepth(this.map.worldH)
      .setAlpha(1)
      .setVisible(true);
    if (tint !== 0xffffff) s.setTint(tint);
    else s.clearTint();
    this.activeSwords.push({
      img: s,
      x0: x,
      y0: y - 10,
      dx: Math.cos(angle) * range,
      dy: Math.sin(angle) * range,
      start: this.time.now,
    });
    // Tia sáng rải dọc đường bay + nổ ở mũi (gfx/fx/skill-fx.ts), trễ theo thời gian bay của ảnh kiếm khí
    this.playFxPoints(
      planSwordBeam(x, y, angle, range, mine, tint, qiPointsFor(getQuality().emitterBudget)),
    );
  }

  private fxLevelUp(x: number, y: number, major: boolean, mine: boolean) {
    if (mine) sound.levelup(major);
    if (mine || this.inView(x, y, 160)) {
      // Công thức dữ liệu (gfx/fx/recipes-cultivation.ts): vòng sóng + hạt sáng; đột phá thêm cột sáng + chớp nhẹ (chỉ của mình)
      const plan = planLevelUp(major, mine);
      for (const id of plan.recipes) this.fx.play(id, x, y - 8, { priority: plan.priority });
    }
    if (mine) {
      const me = this.me();
      ui.toast({
        text: major
          ? `Đột phá thành công! ${me ? realmLabel(me.realm, me.tier) : ""}`
          : `Tu vi tinh tiến: ${me ? realmLabel(me.realm, me.tier) : ""}`,
        tone: "good",
      });
    }
  }

  private fxBreakFail(x: number, y: number, mine: boolean) {
    sound.breakfail();
    const plan = planBreakFail(mine);
    for (const id of plan.recipes) this.fx.play(id, x, y - 10, { priority: plan.priority });
  }

  /** Trúng đòn: hạt + chữ bay theo kế hoạch thuần `gfx/fx/combat-fx.ts` (không nhánh `if` theo loại hiệu ứng ở đây). */
  private onHitFx(m: DmgMsg) {
    const input = this.hitInput(m);
    const plan = planHitFx(input);
    this.fx.play(plan.recipe, m.x, m.y - 8, { priority: plan.priority, tint: plan.tint });
    const n = planHitNumber(input);
    this.fx.floatNumber(
      n.text,
      m.x + Phaser.Math.Between(-8, 8),
      m.y + this.floatLanes.offset(m.target, this.time.now),
      n,
    );
  }

  private hitInput(m: DmgMsg): HitInput {
    const targetIsMe = m.target === this.sid;
    const target = targetIsMe
      ? this.me()
      : m.toPlayer
        ? this.state?.players?.get(m.target)
        : this.state?.monsters?.get(m.target);
    const maxHp = target?.maxHp ?? 0;
    return {
      amount: m.amount,
      crit: Boolean(m.crit),
      toPlayer: Boolean(m.toPlayer),
      targetIsMe,
      targetMaxHp: maxHp,
      // Loại quái bị đánh (từ state; `planHitFx` tự bỏ id lạ): trùm / quái Kim Đan có hiệu ứng riêng
      kind: m.toPlayer ? undefined : (target as { kind?: string } | undefined)?.kind,
      mine:
        !targetIsMe &&
        !m.toPlayer &&
        isMyHit(this.lastAttack, this.time.now, { x: this.predX, y: this.predY }, m),
    };
  }
}
