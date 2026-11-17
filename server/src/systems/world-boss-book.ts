// Sổ TRÙM THẾ GIỚI của cả tiến trình (M9.4, docs/PHAN_CONG_M9.md mục 4): lịch, sự kiện đang diễn ra, bảng đóng góp theo LINH HỒN và tin gửi client.
// Phần THUẦN (không đụng `World`): `systems/world-boss.ts` làm phần có tác dụng phụ (sinh trùm, thưởng, gửi tin). Một đồng hồ duy nhất cho mọi phòng (`Hub.worldBoss`).
// Sập máy giữa sự kiện = HUỶ (sổ nằm trong bộ nhớ, `advance` lần đầu chỉ ghi mốc nên sự kiện đã bắt đầu trước lúc khởi động không bao giờ sinh lại, không thưởng bù).
import {
  WORLD_BOSS_SCHEDULE,
  WORLD_BOSS_TOP_N,
  WORLD_BOSS_TOP_SHOWN,
  worldBossEligible,
  worldBossNoneMsg,
  worldBossOccurrence,
  worldBossDayStart,
  worldBossPoints,
  type WorldBossMine,
  type WorldBossMsg,
  type WorldBossOccurrence,
  type WorldBossSlot,
  type WorldBossTopRow,
} from "@tien-gioi/shared";

/** Mỗi chừng này ms (tối thiểu) bộ lập lịch mới xét lại: mọi phòng đều gọi mỗi tick nhưng chỉ lần gọi đầu của mỗi nhịp làm việc. */
export const WORLD_BOSS_TICK_MS = 250;

/** Điểm đóng góp của một LINH HỒN trong một sự kiện. */
export interface WbRow {
  name: string;
  titleId?: string;
  /** Sát thương thật sự đã trừ vào máu trùm (không tính phần thừa lúc chết). */
  damage: number;
  /** Hỗ trợ quy ra sát thương tương đương (hồi / khiên cho người khác); `worldBossPoints` giới hạn phần này. */
  support: number;
  /** Thứ tự lần đầu đóng góp: người tới trước xếp trên khi bằng điểm (ổn định, không phụ thuộc thứ tự Map). */
  first: number;
}

/** Một dòng đã xếp hạng: chỉ người ĐỦ ngưỡng. */
export interface WbRanked {
  key: string;
  row: WbRow;
  pts: number;
  /** Phần trăm trong tổng điểm của mọi người đủ ngưỡng (0-100). */
  pct: number;
}

/** Sự kiện đang diễn ra (pha `live`; pha `soon` chỉ là thông báo, không có trạng thái). */
export interface WbEvent {
  slot: WorldBossSlot;
  startMs: number;
  endMs: number;
  /** Tên trùm hiển thị. */
  bossName: string;
  /** Phòng đang giữ trùm và id quái; `null` khi chưa sinh (phòng đích chưa có). */
  spawn: { world: object; id: string } | null;
  /** Máu tối đa của trùm (0 khi chưa sinh). */
  maxHp: number;
  /** Máu hiện tại theo %, cập nhật mỗi lần gửi bảng (không dùng để quyết định gì). */
  hpPct: number;
  /** Bảng đóng góp theo khoá linh hồn (`Identity.soulKey`). */
  rows: Map<string, WbRow>;
  /** Linh hồn đã nhận thưởng (mỗi sự kiện CHỈ MỘT lần, dù đổi phòng / đổi nhân vật). Ghi TRƯỚC khi trao (sập máy chỉ MẤT, không nhân đôi). */
  claimed: Set<string>;
  /** Đã chốt kết cục (đánh bại / bỏ chạy / huỷ): chống chốt hai lần cùng tick. */
  settled: boolean;
  /** Lần gửi bảng kế (ms của đồng hồ sổ). */
  nextBoardAt: number;
  seq: number;
}

export class WorldBossBook {
  /** Lịch đang dùng (rỗng = tính năng không chạy). */
  slots: readonly WorldBossSlot[];
  /** `WORLD_BOSS=off` đặt `false`. */
  enabled = true;
  /** Sự kiện đang `live`, hoặc `null`. */
  current: WbEvent | null = null;
  private lastTickMs: number | null = null;
  private seq = 0;

  constructor(slots: readonly WorldBossSlot[] = WORLD_BOSS_SCHEDULE) {
    this.slots = slots;
  }

  /** Có lịch và chưa bị tắt: nếu không thì mọi hàm của `world-boss.ts` thoát ngay (không tốn gì mỗi tick). */
  get active(): boolean {
    return this.enabled && this.slots.length > 0;
  }

  /**
   * Đẩy đồng hồ sổ tới `nowMs`. Trả mốc TRƯỚC (để tính các mốc báo trước / giờ bắt đầu vừa lọt qua), hoặc `null` nếu chưa tới lượt làm việc: lần gọi đầu tiên chỉ ghi mốc (khởi động
   * giữa sự kiện thì sự kiện đó bị coi là huỷ, không sinh lại); các lần sau cách lần trước chưa tới `WORLD_BOSS_TICK_MS`, hoặc đồng hồ đi lùi, đều `null`.
   */
  advance(nowMs: number): number | null {
    if (!Number.isFinite(nowMs)) return null;
    if (this.lastTickMs === null) {
      this.lastTickMs = nowMs;
      return null;
    }
    if (nowMs - this.lastTickMs < WORLD_BOSS_TICK_MS) return null;
    const prev = this.lastTickMs;
    this.lastTickMs = nowMs;
    return prev;
  }

  /** Các lần xảy ra (hôm nay) của mọi khung giờ, để bộ lập lịch xét báo trước / bắt đầu. */
  todaysOccurrences(nowMs: number): WorldBossOccurrence[] {
    const day = worldBossDayStart(nowMs);
    return this.slots.map((s) => worldBossOccurrence(s, day));
  }

  /** Lần xảy ra SẮP TỚI sớm nhất (bắt đầu SAU `nowMs`; bỏ qua lần đã bắt đầu mà không có sự kiện: đã huỷ do sập máy), xét hôm nay và ngày mai; `null` nếu lịch rỗng. */
  upcoming(nowMs: number): WorldBossOccurrence | null {
    if (!this.active || !Number.isFinite(nowMs)) return null;
    const day = worldBossDayStart(nowMs);
    let best: WorldBossOccurrence | null = null;
    for (const d of [day, day + 86_400_000])
      for (const s of this.slots) {
        const o = worldBossOccurrence(s, d);
        if (o.startMs > nowMs && (best === null || o.startMs < best.startMs)) best = o;
      }
    return best;
  }

  /** Mở sự kiện mới. `bossName` hiển thị. Sự kiện cũ (nếu còn) bị thay: người gọi phải chốt nó TRƯỚC. */
  begin(o: WorldBossOccurrence, bossName: string): WbEvent {
    const ev: WbEvent = {
      slot: o.slot,
      startMs: o.startMs,
      endMs: o.endMs,
      bossName,
      spawn: null,
      maxHp: 0,
      hpPct: 100,
      rows: new Map(),
      claimed: new Set(),
      settled: false,
      nextBoardAt: 0,
      seq: ++this.seq,
    };
    this.current = ev;
    return ev;
  }

  /** Kết thúc sự kiện hiện tại (sổ về rỗng). */
  clear(): void {
    this.current = null;
  }

  /**
   * Cộng đóng góp cho một linh hồn. `amount` không hữu hạn / không dương thì bỏ qua. Trả `true` nếu có ghi. Sát thương phải là phần THẬT SỰ trừ vào máu
   * (người gọi cắt phần thừa lúc trùm chết) để không ai được điểm hơn máu trùm có.
   */
  credit(
    ev: WbEvent,
    soulKey: string,
    who: { name: string; titleId?: string },
    kind: "damage" | "support",
    amount: number,
  ): boolean {
    if (ev.settled || !Number.isFinite(amount) || amount <= 0) return false;
    let r = ev.rows.get(soulKey);
    if (!r) {
      r = { name: who.name, damage: 0, support: 0, first: ev.rows.size };
      ev.rows.set(soulKey, r);
    }
    r.name = who.name; // tên / danh hiệu mới nhất (đổi nhân vật cùng linh hồn)
    if (who.titleId !== undefined) r.titleId = who.titleId;
    else delete r.titleId;
    r[kind] += amount;
    return true;
  }

  /** Điểm (đã giới hạn phần hỗ trợ) của một dòng. */
  pointsOf(r: WbRow): number {
    return worldBossPoints(r.damage, r.support);
  }

  /** Xếp hạng người ĐỦ ngưỡng (điểm >= `WORLD_BOSS_MIN_SHARE_PCT` % máu tối đa): giảm dần theo điểm, hoà thì ai đóng góp trước đứng trên. Cần `maxHp` > 0. */
  ranking(ev: WbEvent): WbRanked[] {
    if (!(ev.maxHp > 0)) return [];
    const out: WbRanked[] = [];
    let total = 0;
    for (const [key, row] of ev.rows) {
      const pts = this.pointsOf(row);
      if (!worldBossEligible(pts, ev.maxHp)) continue;
      out.push({ key, row, pts, pct: 0 });
      total += pts;
    }
    out.sort((a, b) => b.pts - a.pts || a.row.first - b.row.first);
    if (total > 0) for (const r of out) r.pct = (r.pts / total) * 100;
    return out;
  }

  /** `top` gửi client: tối đa `WORLD_BOSS_TOP_SHOWN` dòng của người đủ ngưỡng. */
  topRows(ranked: readonly WbRanked[]): WorldBossTopRow[] {
    return ranked.slice(0, WORLD_BOSS_TOP_SHOWN).map((r) => ({
      name: r.row.name,
      ...(r.row.titleId !== undefined ? { titleId: r.row.titleId } : {}),
      pts: Math.round(r.pts),
      pct: Math.round(r.pct * 10) / 10,
    }));
  }

  /** `mine` của một linh hồn (không có dòng nào thì 0 điểm, chưa đủ ngưỡng). */
  mineOf(ev: WbEvent, ranked: readonly WbRanked[], soulKey: string | null): WorldBossMine {
    const row = soulKey === null ? undefined : ev.rows.get(soulKey);
    if (!row) return { pts: 0, pct: 0, eligible: false };
    const hit = ranked.find((r) => r.key === soulKey);
    return {
      pts: Math.round(this.pointsOf(row)),
      pct: hit ? Math.round(hit.pct * 10) / 10 : 0,
      eligible: hit !== undefined,
    };
  }

  /** Tin `live` (kèm bảng khi `board`, chỉ cho người Ở PHÒNG ĐÍCH): thời gian TƯƠNG ĐỐI so với `nowMs`. */
  liveMsg(
    ev: WbEvent,
    nowMs: number,
    board?: { ranked: readonly WbRanked[]; soulKey: string | null },
  ): WorldBossMsg {
    const msg: WorldBossMsg = {
      phase: "live",
      id: ev.slot.id,
      name: ev.bossName,
      mapId: ev.slot.mapId,
      endsInMs: Math.max(0, Math.round(ev.endMs - nowMs)),
      hpPct: ev.hpPct,
    };
    if (board) {
      msg.top = this.topRows(board.ranked);
      msg.mine = this.mineOf(ev, board.ranked, board.soulKey);
    }
    return msg;
  }

  /** Tin `soon` cho lần xảy ra `o` (thời gian tương đối). */
  soonMsg(o: WorldBossOccurrence, bossName: string, nowMs: number): WorldBossMsg {
    return {
      phase: "soon",
      id: o.slot.id,
      name: bossName,
      mapId: o.slot.mapId,
      startsInMs: Math.max(0, Math.round(o.startMs - nowMs)),
    };
  }

  /** Số người đủ ngưỡng được vào top thưởng vật phẩm (`WORLD_BOSS_TOP_N`), để test / tài liệu cùng nguồn. */
  get topN(): number {
    return WORLD_BOSS_TOP_N;
  }

  /** Tin "không có sự kiện" (lịch rỗng / tắt). */
  none(): WorldBossMsg {
    return worldBossNoneMsg();
  }
}
