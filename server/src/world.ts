// Trạng thái thế giới dùng chung cho các system. Không phụ thuộc Colyseus Room,
// nên các system có thể test riêng bằng một World giả.
import type {
  GameMap,
  InputMsg,
  FxMsg,
  DmgMsg,
  ToastMsg,
  MonsterKind,
  Inventory,
  InvMsg,
  QuestsMsg,
  WalletMsg,
  DialogMsg,
  ChatOut,
  PartyMsg,
  PartyInvitedMsg,
  DungeonInviteMsg,
  DungeonEndMsg,
  DungeonFallenMsg,
  DungeonStateMsg,
  DuelInvitedMsg,
  DuelStateMsg,
  DuelEndMsg,
  SectInvitedMsg,
  SectMsg,
  SectPresenceMsg,
} from "@tien-gioi/shared";
import type { WorldState, Player } from "./schema";
import type { SavedPlayer, QuestSave, LifeCounters, LimboRecord } from "./store";
import type {
  LimboMsg,
  RebornMsg,
  SkillBook,
  SkillsMsg,
  Soul,
  SoulMsg,
  StatMult,
  StatusMsg,
} from "@tien-gioi/shared";
import { Interest } from "./systems/interest";
import type { SectService } from "./sect-service";
import type { AuditFn } from "./audit";
import { Hub } from "./hub";
import type { Identity } from "./identity";
import type { Run } from "./systems/dungeon";
import type { StatusBox } from "./systems/status-rules";
import { Duels } from "./systems/duel";
import { TickStats } from "./metrics";

/** Dữ liệu riêng của server cho mỗi người chơi (không gửi xuống client). */
export interface PlayerCtrl {
  save: SavedPlayer;
  /** Danh tính sau đăng nhập: khoá chân linh (`soulKey`), tài khoản nếu có (docs/THIET_KE_TAI_KHOAN.md mục 5) */
  identity: Identity;
  inputs: InputMsg[];
  moveBudget: number; // token bucket chống gửi input quá nhanh
  nextSlash: number;
  nextSword: number;
  nextBreak: number;
  nextChat: number;
  /** Lệch pha ghi px, py giữa các người chơi (0..POS_SYNC_EVERY_TICKS-1) để không cùng ghi một tick */
  posPhase: number;
  lastHitAt: number;
  /**
   * Đang gục sau khi thua thách đấu (`p.dead` nhưng KHÔNG phải chết thật): lúc đứng dậy TẠI CHỖ (ms). `tickRespawn` thấy cờ này
   * thì đứng dậy tại chỗ thay vì hồi sinh ở trấn.
   */
  reviveAt?: number;
  /** Tỉ lệ `maxHp` khi đứng dậy (`reviveInPlace`); bỏ trống là `DUEL_KO_HP_PCT`. Bí cảnh đặt `DUNGEON_FALL_HP_PCT`. */
  reviveHpPct?: number;
  /**
   * Gục trong bí cảnh (không mất kiếp, `dungeonFall`): lúc đưa người này về cổng vào (ms). Sau khi `reviveAt` tới và đã đứng dậy,
   * `tickFallen` gọi `onDungeonExit`; thử lại mỗi 2 giây nếu việc đưa đi lỗi. Tự mất cùng `ctrl` khi người chơi rời phòng.
   */
  fallExitAt?: number;
  deadAt: number;
  /**
   * Đang đi qua cổng: bản ghi ở bản đồ đích đã / đang được ghi, nên `persist` thường (lưu định kỳ, lúc rớt mạng)
   * không được ghi đè bằng bản đồ cũ, và không nhận thêm `travel`. Gỡ nếu việc đi qua cổng bị huỷ.
   */
  travelling?: boolean;
  /** Túi đồ: chỉ chủ túi nhận được qua tin nhắn `inv`, không nằm trong state chung */
  inv: Inventory;
  /** Thời điểm hết hồi chiêu theo itemId */
  itemCd: Map<string, number>;
  /** Sổ nhiệm vụ: chỉ gửi cho chủ qua tin nhắn `quests` */
  quests: QuestSave;
  /** Sổ chiêu (M7.2): chiêu đã học + gắn ô L U I O; chỉ gửi cho chủ qua tin nhắn `skills`, không vào state chung */
  skills: SkillBook;
  /** Thời điểm (ms, `w.now`) mỗi ô chiêu 2-5 dùng lại được */
  skillCd: [number, number, number, number];
  /** Trạng thái đang có (M7.2b, `systems/status.ts`): tạo khi gắn lần đầu; chỉ gửi cho chủ qua tin `status`, không vào state chung */
  st?: StatusBox;
  /** Định danh kiếp hiện tại và bộ đếm thành tựu của kiếp (lưu cùng nhân vật; không vào state chung) */
  lifeId: string;
  life: LifeCounters;
  /** Đang ở Hoàng Tuyền (đã chết thật, chờ đầu thai): mọi hành động gameplay bị bỏ qua. Xem systems/reincarnation.ts. */
  limbo?: LimboRecord;
  /** Xuất thân của kiếp này và hệ số chỉ số tương ứng (`originMult`) */
  origin: string;
  mult: StatMult;
  /** Ảnh chụp chân linh lúc vào game (nấc mở khóa dùng ở đường nóng: `expMultOf`...); cập nhật khi mua ở Hoàng Tuyền */
  soul: Soul;
  /** Linh thạch: số nguyên 0..COIN_CAP, chỉ gửi cho chủ qua tin nhắn `wallet`; chỉ đổi bằng systems/wallet.ts */
  coin: number;
  /**
   * Phần hồi khí huyết / linh lực chưa đủ 1 đơn vị (xem takeWhole), và tu vi đả tọa
   * đang để dành, ghi vào state mỗi EXP_FLUSH_MS (expAt = lần ghi kế tiếp).
   */
  frac: { hp: number; mp: number; exp: number; expAt: number };
}

/** Dữ liệu riêng của server cho mỗi món đồ rơi. */
export interface LootCtrl {
  /** Lúc hết quyền nhặt trước của owner */
  ownerUntil: number;
  expiresAt: number;
}

/** Dữ liệu riêng của server cho mỗi con quái. */
export interface MonsterCtrl {
  def: MonsterKind;
  homeX: number;
  homeY: number;
  target: string | null;
  nextAttack: number;
  wanderX: number;
  wanderY: number;
  nextWander: number;
  damageBy: Map<string, number>;
  /** Phần lẻ của hồi khí huyết chưa đủ 1 đơn vị */
  hpFrac: number;
  /**
   * Số tick còn phải chờ tới lần áp bước di chuyển kế tiếp khi không có mục tiêu (lang thang, về nhà, ngủ):
   * quái chỉ dịch chuyển mỗi WANDER_STRIDE tick, xem systems/monsters.ts. Có mục tiêu thì luôn 0.
   */
  strideLeft: number;
  /** Trạng thái đang có (M7.2b, `systems/status.ts`): tạo khi gắn lần đầu, quái không dính trạng thái nào thì không tốn bộ nhớ */
  st?: StatusBox;
}

/** Cách các system gửi tin ra ngoài. WorldRoom nối vào broadcast / client.send. */
export interface WorldEvents {
  fx(msg: FxMsg): void;
  dmg(msg: DmgMsg): void;
  /** Thông báo hệ thống cho toàn server (kênh chat). */
  sys(text: string): void;
  chat(from: string, text: string): void;
  toast(sessionId: string, msg: ToastMsg): void;
  /** Gửi túi đồ cho đúng chủ túi. */
  inv(sessionId: string, msg: InvMsg): void;
  /** Gửi sổ nhiệm vụ cho đúng người. */
  quests(sessionId: string, msg: QuestsMsg): void;
  /** Gửi sổ chiêu + hồi chiêu còn lại cho đúng chủ (không vào state chung; khi đổi và định kỳ, không mỗi tick). */
  skills(sessionId: string, msg: SkillsMsg): void;
  /** Gửi danh sách trạng thái của CHÍNH chủ (kể cả buff) khi có cái thêm / mất / vơi khiên; không mỗi tick. */
  status(sessionId: string, msg: StatusMsg): void;
  /** Gửi số Linh thạch cho đúng chủ (không vào state chung). */
  wallet(sessionId: string, msg: WalletMsg): void;
  /** Mở hộp thoại NPC cho đúng người. */
  dialog(sessionId: string, msg: DialogMsg): void;
  /** Đội hình hiện tại, gửi riêng cho từng thành viên (không broadcast, không vào state chung). */
  party(sessionId: string, msg: PartyMsg): void;
  /** Có người mời vào đội, gửi riêng cho người được mời. */
  partyInvited(sessionId: string, msg: PartyInvitedMsg): void;
  /** Chat gửi cho một người (chat đội). */
  chatTo(sessionId: string, msg: ChatOut): void;
  /** Vừa chết thật / đăng nhập lại khi đang ở Hoàng Tuyền: hiện màn hình Hoàng Tuyền cho chủ. */
  limbo(sessionId: string, msg: LimboMsg): void;
  /** Chân linh của chủ vừa đổi (sau khi mua ở Tam Sinh Thạch). */
  soul(sessionId: string, msg: SoulMsg): void;
  /** Đã đầu thai xong. */
  reborn(sessionId: string, msg: RebornMsg): void;
  /** Lời mời vào bí cảnh, gửi riêng cho từng thành viên (ở bất cứ phòng nào). */
  dungeonInvite(sessionId: string, msg: DungeonInviteMsg): void;
  /** Bí cảnh kết thúc (hoặc bị huỷ trước khi có người vào: chỉ đội trưởng nhận). */
  dungeonEnd(sessionId: string, msg: DungeonEndMsg): void;
  /** Trạng thái bí cảnh cho HUD (trong phòng bí cảnh): mỗi `DUNGEON_STATE_MS` và khi đổi pha. */
  dungeonState(sessionId: string, msg: DungeonStateMsg): void;
  /** Vừa gục trong bí cảnh (không mất kiếp): chỉ người đó nhận. */
  dungeonFallen(sessionId: string, msg: DungeonFallenMsg): void;
  /** Có người thách đấu (chỉ người được mời nhận). */
  duelInvited(sessionId: string, msg: DuelInvitedMsg): void;
  /** Trạng thái trận thách đấu cho HUD (hai người trong trận). */
  duelState(sessionId: string, msg: DuelStateMsg): void;
  /** Trận thách đấu kết thúc (cả hai nhận). */
  duelEnd(sessionId: string, msg: DuelEndMsg): void;
  /** Ảnh chụp tông môn của chính người nhận (`sect: null` = không còn ở tông môn nào). */
  sect(sessionId: string, msg: SectMsg): void;
  /** Ai trong tông môn đang trực tuyến (cảnh giới, bản đồ). */
  sectPresence(sessionId: string, msg: SectPresenceMsg): void;
  /** Có người mời vào tông môn (chỉ người được mời nhận). */
  sectInvited(sessionId: string, msg: SectInvitedMsg): void;
}

export class World {
  /** Thời điểm tick hiện tại (ms), cập nhật đầu mỗi tick. */
  now = Date.now();
  readonly ctrl = new Map<string, PlayerCtrl>();
  readonly mctrl = new Map<string, MonsterCtrl>();
  readonly lctrl = new Map<string, LootCtrl>();
  /** Vùng nhìn của từng client: ai nhận state của thực thể nào (#62) */
  readonly interest: Interest;
  /** Đội hình: ai ở đội nào, lời mời đang chờ (#74). Dùng chung với mọi phòng qua `hub`, khoá theo đạo hiệu viết thường. */
  get parties() {
    return this.hub.parties;
  }
  /**
   * Người chơi đang "hồn lìa xác": rớt mạng bất thường, nhân vật ở lại chờ nối lại (`RECONNECT_GRACE_S`, #116).
   * **Bất tử** trong lúc chờ (không bị đánh, quái không nhắm, không hồi phục / tu luyện): rớt mạng không được phép
   * làm mất kiếp (docs/THIET_KE_LUAN_HOI.md mục 4). Là tập riêng thay vì cờ trong `PlayerCtrl` để vòng lặp quái × người
   * chơi chỉ phải tra tập này khi nó khác rỗng (hầu hết thời gian là rỗng).
   */
  readonly ghosts = new Set<string>();
  /**
   * Mục tiêu đang có trạng thái (M7.2b): id quái / sessionId người chơi. `tickStatuses` chỉ duyệt hai tập này (thường rỗng) nên không tốn gì khi
   * không ai dính trạng thái; tự gỡ khi hết trạng thái hoặc mục tiêu biến mất.
   */
  readonly statusM = new Set<string>();
  readonly statusP = new Set<string>();
  /** Trận thách đấu và lời mời của phòng này (hai người phải cùng phòng): systems/duel.ts, docs/THIET_KE_PK.md. */
  readonly duels = new Duels();
  monsterSeq = 0;
  lootSeq = 0;
  /** Số tick đã chạy (dùng chia nhịp ghi px, py) */
  tick = 0;
  /**
   * Chết do quái = luân hồi (vào Hoàng Tuyền) thay vì hồi sinh sau `RESPAWN_MS`. WorldRoom bật; mặc định tắt để các
   * system / bench chạy riêng không cần phòng. Nhánh hồi sinh còn dùng cho chết không mất kiếp (PK thách đấu, bước 5).
   */
  reincarnate = false;
  /** Phòng đăng ký: được gọi (một lần) khi một người vừa vào Hoàng Tuyền, để lưu file, cộng Duyên và gửi `limbo`. */
  onLimbo: ((sid: string) => void) | null = null;
  /**
   * Phòng đăng ký (bí cảnh, 4b): được gọi khi một run vừa được lập, để TẠO phòng bí cảnh (`matchMaker.createRoom`, bất
   * đồng bộ) rồi gọi `runReady(w, run, roomId)` (hoặc `runFailed`). Không có hook (test đơn vị): coi như phòng sẵn sàng ngay.
   */
  onDungeonOpen: ((run: Run) => void) | null = null;
  /**
   * Phòng đăng ký (bí cảnh, 4b): một thành viên đã bấm "Vào" và qua mọi kiểm tra; phòng lưu nhân vật với chỗ vào ở Lạc Hà
   * rồi gửi `travelTo { mapId, roomId }` và ngắt kết nối. Không có hook thì `enterDungeon` không làm gì.
   */
  onDungeonEnter: ((sid: string, run: Run) => void) | null = null;
  /** Phòng bí cảnh đăng ký: đưa một người từ phòng này về cổng vào (Lạc Hà): `dungeonLeave`, hết giờ nhặt đồ, run kết thúc. */
  onDungeonExit: ((sid: string) => void) | null = null;
  /** Phòng bí cảnh: id của run mà phòng này phục vụ (`Hub.runs`); `null` ở mọi phòng thường. */
  runId: string | null = null;
  /** Id phòng Colyseus của thế giới này (nhãn cho `/metrics`); rỗng ở test / bench. */
  roomId = "";
  /** Thời gian xử lý mỗi tick của phòng này (M4 3.3); `WorldRoom.update` ghi, `/metrics` đọc. Bench / test không ghi. */
  readonly tickStats = new TickStats();
  /**
   * Dịch vụ tông môn (docs/THIET_KE_TONG_MON.md): WorldRoom đặt khi tạo phòng. `null` (test đơn vị không đặt, hoặc `SECTS=off`):
   * mọi tin tông môn bị từ chối `disabled`, vào phòng không tra tông môn.
   */
  sectService: SectService | null = null;
  /**
   * Phòng đăng ký: lưu hồ sơ của một người NGAY và chờ ghi xong (trước khi chuyển Linh thạch sang kho tông môn).
   * Trả `true` CHỈ khi hồ sơ đã nằm trên đĩa / DB; `false` khi lưu lỗi hoặc không lưu được lúc này (đang qua cổng: bản ghi
   * của cổng đã giữ ví cũ). Người gọi gặp `false` phải HUỶ chuyển tiền vào kho (không thì sập là nhân đôi Linh thạch).
   * Không có hook: coi như đã lưu (bench, test đơn vị không có đĩa).
   */
  onSaveNow: ((sid: string) => Promise<boolean>) | null = null;
  /** Nhật ký kiểm toán (`server/src/audit.ts`): `WorldRoom` đặt; null (test, bench) = không ghi. Chỉ gọi khi có sự kiện nhạy cảm, không trong tick nóng. */
  audit: AuditFn | null = null;
  /** Đổi ví từ ngần này trở lên (cộng hoặc trừ) thì ghi `wallet.big`. Infinity = không ghi. */
  auditCoinMin = Infinity;

  constructor(
    readonly state: WorldState,
    readonly events: WorldEvents,
    /** Bản đồ của phòng này: ô, va chạm, trấn. Mọi system đọc từ đây, không đọc hằng toàn cục (#123). */
    readonly map: GameMap,
    /** Kênh chung giữa các phòng (đội, tìm người ở phòng khác). Bỏ trống: một hub riêng, thế giới đứng một mình. */
    readonly hub: Hub = new Hub(),
  ) {
    this.interest = new Interest(map.worldW, map.worldH);
    hub.worlds.add(this);
  }

  /** Thế giới ngừng chạy (phòng đóng): người ở phòng khác không còn tìm thấy người ở đây. */
  dispose() {
    this.hub.worlds.delete(this);
  }

  /** Người chơi còn sống và đang trong phòng; null nếu không. */
  ready(sessionId: string): { p: Player; c: PlayerCtrl } | null {
    const p = this.state.players.get(sessionId);
    const c = this.ctrl.get(sessionId);
    if (!p || !c || p.dead) return null;
    return { p, c };
  }
}

/**
 * Cộng dồn `amount` vào acc[key], trả về phần nguyên để ghi vào state, giữ lại phần lẻ.
 * Hồi máu / tu vi mỗi tick chỉ là số lẻ nhỏ: ghi thẳng vào state thì trường đó đổi 20 lần/giây
 * và mỗi lần gửi một số thực 8 byte cho mọi client. Ghi phần nguyên thì chỉ đổi khi đủ 1 đơn vị.
 */
export function takeWhole<K extends string>(
  acc: Record<K, number>,
  key: K,
  amount: number,
): number {
  const v = acc[key] + amount;
  const n = Math.floor(v);
  acc[key] = v - n;
  return n;
}

/**
 * Bước lượng tử hóa góc nhìn ghi vào state (π/16 = 11,25°, 32 hướng). Chọn bước chia hết π/4 để các ranh giới
 * hướng của client (±45°, ±135° trong dirFromAngle, ±90° khi lật sprite) trùng mép ô: hướng hiển thị không đổi.
 */
export const ANGLE_STEP = Math.PI / 16;

/**
 * Góc nhìn để ghi vào state (`angle` của người / quái): làm tròn về giữa ô ANGLE_STEP.
 * Góc này chỉ để client vẽ hướng; server tính trúng đòn bằng góc chính xác (tin nhắn / vị trí), không đọc lại.
 * Vì sao: nhắm liên tục (bot, cần joystick) đổi góc gần như mỗi tick, mỗi lần gửi 5 byte cho mọi client đang thấy.
 * Cắt về 32 hướng thì chỉ đổi khi sang ô khác, schema bỏ qua việc gán lại giá trị y hệt.
 */
export const quantAngle = (a: number) => (Math.floor(a / ANGLE_STEP) + 0.5) * ANGLE_STEP;

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const angleDiff = (a: number, b: number) =>
  Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
