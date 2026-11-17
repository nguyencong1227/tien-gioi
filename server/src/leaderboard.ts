// Dịch vụ BẢNG XẾP HẠNG (M9.3 #1022, docs/PHAN_CONG_M9.md mục 3). Một đối tượng dùng chung cả tiến trình (như `Hub`): làm mới bản chụp mỗi `BOARD_REFRESH_MS` NGOÀI tick bằng cách đọc kho,
// giữ trong bộ nhớ; `view` chỉ tra bản chụp (không I/O) nên tin `boardsGet` rẻ.
//
// Luật chốt:
//  - Bốn bảng `tuvi` / `linhhon` / `tongmon` / `pk` (`BOARD_IDS`); chỉ hiện ĐẠO HIỆU (không id chân linh / tài khoản). Số liệu THÔ (client định dạng bằng `shared/`).
//  - Tài khoản có `TEST_EXP_MULT` KHÔNG vào bảng `tuvi` (`mine.reason: "test"`) và bị đánh dấu `test: true` ở các bảng khác.
//  - `tuvi`: nhân vật còn sống kiếp hiện tại (đã chết thật / ở Hoàng Tuyền thì không). `linhhon`: mọi chân linh có đạo hiệu. `tongmon`: tông còn thành viên. `pk`: cần >= `BOARD_PK_MIN_GAMES` trận.
//  - Hỏng một lần đọc kho thì GIỮ bản chụp cũ (không xoá bảng); lần đọc đầu hỏng thì chưa có bảng (`view` trả bảng trống, lý do `none`).
//  - Thời gian TƯƠNG ĐỐI: `ageMs` = tuổi bản chụp.
import {
  BOARD_IDS,
  BOARD_PK_MIN_GAMES,
  BOARD_REFRESH_MS,
  BOARD_SCAN_MAX,
  BOARD_SIZE,
  rankBoard,
  sectLevelOf,
  type BoardId,
  type BoardMine,
  type BoardRow,
  type BoardsMsg,
} from "@tien-gioi/shared";
import type { AccountStore } from "./account-store";
import type { PlayerStore } from "./player-store";
import type { SectStore } from "./sect-store";
import { soulIdOf, type SoulStore } from "./soul";

export interface LeaderboardDeps {
  souls: SoulStore;
  players: PlayerStore;
  sects: SectStore;
  /** Có ở chế độ tài khoản (khoá chân linh là id tài khoản, đạo hiệu nằm ở tài khoản); bỏ trống ở chế độ cũ (khoá chân linh là đạo hiệu chuẩn hoá). */
  accounts?: AccountStore | null;
  /** `TEST_EXP_MULT` hiện hành (đạo hiệu chuẩn hoá -> hệ số): tra mỗi lần làm mới / xem, nên đổi cấu hình (khởi động lại) có hiệu lực ngay. */
  testExp: () => ReadonlyMap<string, number>;
  now?: () => number;
}

interface Snapshot {
  at: number;
  /** Bảng đã xếp hạng ĐẦY ĐỦ (không cắt top) để tra hạng của bất kỳ ai. */
  ranked: Record<BoardId, BoardRow[]>;
  /** đạo hiệu chuẩn hoá -> dòng, theo bảng. */
  byName: Record<BoardId, Map<string, BoardRow>>;
  /** đạo hiệu chuẩn hoá -> số trận PK (để tính `need` khi chưa đủ). */
  pkGames: Map<string, number>;
}

const emptyBoards = <T>(make: () => T): Record<BoardId, T> => ({
  tuvi: make(),
  linhhon: make(),
  tongmon: make(),
  pk: make(),
});

export class LeaderboardService {
  private snap: Snapshot | null = null;
  private running: Promise<void> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private readonly now: () => number;

  constructor(private readonly d: LeaderboardDeps) {
    this.now = d.now ?? Date.now;
  }

  /** Bắt đầu làm mới định kỳ (và làm mới ngay một lần). Gọi lại thì thay đồng hồ cũ. */
  start(refreshMs = BOARD_REFRESH_MS): void {
    this.stop();
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), refreshMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Đã có bản chụp đầu tiên chưa. */
  get ready(): boolean {
    return this.snap !== null;
  }

  /** Làm mới bản chụp từ kho. Gọi chồng thì dùng chung MỘT lần chạy. Lỗi chỉ ghi log và GIỮ bản chụp cũ (không ném). */
  refresh(): Promise<void> {
    this.running ??= this.build()
      .catch((e) => console.error("[xếp hạng] làm mới thất bại, giữ bản cũ", e))
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }

  private async build(): Promise<void> {
    const d = this.d;
    const [souls, profiles, sects, accounts] = await Promise.all([
      d.souls.all?.(BOARD_SCAN_MAX) ?? Promise.resolve([]),
      d.players.listProfiles?.(BOARD_SCAN_MAX) ?? Promise.resolve([]),
      d.sects.all(),
      d.accounts?.all() ?? Promise.resolve([]),
    ]);
    const testExp = d.testExp();
    const isTest = (name: string) => testExp.has(soulIdOf(name));

    // đạo hiệu <-> khoá chân linh: chế độ tài khoản khoá theo id tài khoản, chế độ cũ theo đạo hiệu chuẩn hoá
    const keyOfName = new Map<string, string>();
    const nameOfKey = new Map<string, string>();
    for (const a of accounts)
      if (a.name) {
        keyOfName.set(soulIdOf(a.name), a.id);
        nameOfKey.set(a.id, a.name);
      }
    for (const p of profiles) {
      const nk = soulIdOf(p.name);
      if (!keyOfName.has(nk)) keyOfName.set(nk, nk);
      const key = keyOfName.get(nk)!;
      if (!nameOfKey.has(key)) nameOfKey.set(key, p.name);
    }
    const soulByKey = new Map(souls.map((s) => [s.id, s]));

    const rows = emptyBoards<BoardRow[]>(() => []);
    const pkGames = new Map<string, number>();
    const mark = (r: BoardRow, name: string): BoardRow => (isTest(name) ? { ...r, test: true } : r);

    // tuvi: nhân vật còn sống kiếp hiện tại, loại tài khoản thử nghiệm
    for (const p of profiles) {
      if (p.limbo || isTest(p.name)) continue;
      const soul = soulByKey.get(keyOfName.get(soulIdOf(p.name)) ?? "");
      const row: BoardRow = { rank: 0, name: p.name, realm: p.realm, tier: p.tier, exp: p.exp };
      if (soul?.social?.title) row.titleId = soul.social.title;
      rows.tuvi.push(row);
    }
    // linhhon + pk: theo chân linh (cần đạo hiệu để hiển thị)
    for (const s of souls) {
      const name = nameOfKey.get(s.id);
      if (!name) continue;
      const base: BoardRow = { rank: 0, name };
      if (s.social?.title) base.titleId = s.social.title;
      rows.linhhon.push(mark({ ...base, step: s.best.step, kiep: s.kiep }, name));
      const won = s.social?.pk.won ?? 0;
      const lost = s.social?.pk.lost ?? 0;
      pkGames.set(soulIdOf(name), won + lost);
      if (won + lost >= BOARD_PK_MIN_GAMES) rows.pk.push(mark({ ...base, won, lost }, name));
    }
    // tongmon: tông còn thành viên
    for (const t of sects) {
      if (t.members.length === 0) continue;
      const points = t.points ?? 0;
      rows.tongmon.push({
        rank: 0,
        name: t.name,
        level: sectLevelOf(points),
        points,
        members: t.members.length,
      });
    }

    const ranked = emptyBoards<BoardRow[]>(() => []);
    const byName = emptyBoards<Map<string, BoardRow>>(() => new Map());
    for (const id of BOARD_IDS) {
      ranked[id] = rankBoard(id, rows[id], rows[id].length);
      for (const r of ranked[id]) byName[id].set(soulIdOf(r.name), r);
    }
    this.snap = { at: this.now(), ranked, byName, pkGames };
  }

  /**
   * Bảng `board` cho người xem `viewerName` (đạo hiệu; `null` = không biết): `BOARD_SIZE` dòng đầu + `mine`. Chưa có bản chụp thì bảng trống với lý do `none`.
   * `mine.rank` null kèm lý do: `test` (tài khoản thử nghiệm xem bảng `tuvi`), `min_games` (PK chưa đủ trận, `need` = số trận còn thiếu), `none` (chưa có dữ liệu).
   */
  view(board: BoardId, viewerName: string | null): BoardsMsg {
    const s = this.snap;
    if (!s) return { board, rows: [], mine: { rank: null, reason: "none" }, ageMs: 0 };
    const rows = s.ranked[board].slice(0, BOARD_SIZE);
    const key = viewerName === null ? null : soulIdOf(viewerName);
    let mine: BoardMine = { rank: null, reason: "none" };
    // `tongmon` xếp theo TÊN TÔNG nên không tra theo đạo hiệu người xem (không có hạng riêng của người, tránh trùng tên tông với đạo hiệu)
    if (key !== null && viewerName !== null && board !== "tongmon") {
      const row = s.byName[board].get(key);
      if (row) mine = { rank: row.rank, row };
      else if (board === "tuvi" && this.d.testExp().has(key)) mine = { rank: null, reason: "test" };
      else if (board === "pk") {
        const games = s.pkGames.get(key) ?? 0;
        mine =
          games > 0
            ? { rank: null, reason: "min_games", need: Math.max(1, BOARD_PK_MIN_GAMES - games) }
            : { rank: null, reason: "none" };
      }
    }
    return { board, rows, mine, ageMs: Math.max(0, this.now() - s.at) };
  }
}
