/**
 * Bảng xếp hạng (M9.6, #1025): biến tin `boards` của máy chủ (`shared/src/social.ts`: số liệu THÔ) thành chữ để hiện.
 * THUẦN (không DOM, không đồng hồ): `ui.ts` chỉ việc đổ kết quả vào bảng; test không cần trình duyệt.
 *
 * Nguyên tắc: không tin tin nhắn (máy chủ mới / cũ lệch phiên bản vẫn không làm sập giao diện), mọi chữ đi vào DOM bằng
 * `textContent` ở `ui.ts` (đạo hiệu do người chơi đặt nên KHÔNG bao giờ chèn HTML), thiếu số liệu hiện "—" chứ không "NaN" / "undefined".
 */
import {
  BOARD_COLUMNS,
  BOARD_IDS,
  BOARD_LABELS,
  BOARD_REFRESH_MS,
  BOARD_SIZE,
  REALMS,
  TITLE_BY_ID,
  realmLabel,
  stepOf,
  type BoardId,
  type BoardMine,
  type BoardRow,
  type BoardsMsg,
} from "@tien-gioi/shared";

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const DASH = "—";

/** Chuỗi bất kỳ -> `BoardId` hợp lệ hoặc `null` (không tra bảng bằng khoá lạ). */
export function asBoardId(v: unknown): BoardId | null {
  return typeof v === "string" && (BOARD_IDS as readonly string[]).includes(v)
    ? (v as BoardId)
    : null;
}

/** Số nguyên không âm có định dạng vi-VN ("12.345"); không phải số hữu hạn -> "—". */
export function fmtCount(n: unknown): string {
  return typeof n === "number" && Number.isFinite(n)
    ? Math.max(0, Math.floor(n)).toLocaleString("vi-VN")
    : DASH;
}

/**
 * Tên cảnh giới của một BẬC (`stepOf`): bảng Linh hồn gửi `step` chứ không gửi `realm` / `tier`, mà `shared/` chưa có hàm ngược nên đảo bằng cách
 * duyệt `REALMS` một lần (bảng nhỏ, ~70 bậc). Bậc ngoài thang -> "—".
 */
const STEP_LABELS: string[] = (() => {
  const out: string[] = [];
  REALMS.forEach((r, ri) => r.tiers.forEach((_, ti) => (out[stepOf(ri, ti)] = realmLabel(ri, ti))));
  return out;
})();

export function stepLabel(step: unknown): string {
  return typeof step === "number" &&
    Number.isInteger(step) &&
    step >= 0 &&
    step < STEP_LABELS.length
    ? (STEP_LABELS[step] ?? DASH)
    : DASH;
}

/** Chữ danh hiệu từ id ngắn (`Player.title` / `BoardRow.titleId`); id lạ (máy chủ mới hơn client) -> "" (không hiện gì). */
export function titleText(id: unknown): string {
  return typeof id === "string" && hasOwn(TITLE_BY_ID, id) ? TITLE_BY_ID[id].text : "";
}

/** Tuổi bản chụp -> chữ ("vừa cập nhật" / "cập nhật 3 phút trước" / "cập nhật 2 giờ trước"); không hợp lệ -> "". */
export function ageText(ageMs: unknown): string {
  if (typeof ageMs !== "number" || !Number.isFinite(ageMs) || ageMs < 0) return "";
  const min = Math.floor(ageMs / 60_000);
  if (min < 1) return "vừa cập nhật";
  if (min < 60) return `cập nhật ${min} phút trước`;
  return `cập nhật ${Math.floor(min / 60)} giờ trước`;
}

/** Ghi chú làm mới ("bảng làm mới mỗi 5 phút"), lấy từ hằng của `shared/` để không lệch khi đổi chu kỳ. */
export const REFRESH_NOTE = `Bảng làm mới mỗi ${Math.round(BOARD_REFRESH_MS / 60_000)} phút.`;

export interface BoardRowView {
  rank: number;
  name: string;
  /** Chữ danh hiệu cạnh đạo hiệu ("" nếu không có / id lạ). */
  title: string;
  /** Tài khoản thử nghiệm (đánh dấu ở các bảng KHÔNG phải tu vi). */
  test: boolean;
  /** Chữ từng cột, theo `BOARD_COLUMNS[board]`. */
  cells: string[];
  /** Đây là dòng của chính người xem. */
  mine: boolean;
}

export interface BoardView {
  board: BoardId;
  label: string;
  /** Tiêu đề cột (sau cột hạng và đạo hiệu). */
  columns: string[];
  rows: BoardRowView[];
  /** Câu "Hạng của bạn": số hạng, hoặc LÝ DO không có hạng (không để ô trống). */
  mineText: string;
  mineRank: number | null;
  /** Dòng của mình khi NGOÀI top (để vẫn thấy số liệu của mình); `null` nếu đã nằm trong `rows` hoặc không có. */
  mineRow: BoardRowView | null;
  /** "cập nhật 3 phút trước" (đã cộng thời gian trôi từ lúc nhận nếu có `sinceMs`). */
  ageText: string;
  /** Không ai trên bảng. */
  empty: boolean;
}

function cellOf(key: string, row: BoardRow): string {
  switch (key) {
    case "realm": {
      const t = realmLabel(typeof row.realm === "number" ? row.realm : -1, row.tier ?? 0);
      return t === "?" ? DASH : t;
    }
    case "step":
      return stepLabel(row.step);
    default:
      return fmtCount((row as unknown as Record<string, unknown>)[key]);
  }
}

function rowView(board: BoardId, row: BoardRow, mineRank: number | null): BoardRowView {
  return {
    rank: row.rank,
    name: typeof row.name === "string" ? row.name : "",
    title: titleText(row.titleId),
    test: row.test === true,
    cells: BOARD_COLUMNS[board].map((c) => cellOf(c.key, row)),
    mine: mineRank !== null && row.rank === mineRank,
  };
}

/** Câu cho ô "Hạng của bạn". `rank` null -> lý do (`BoardMine.reason`), thiếu lý do thì "Chưa có hạng." */
export function mineLine(mine: BoardMine | undefined): string {
  if (mine && typeof mine.rank === "number" && Number.isInteger(mine.rank) && mine.rank >= 1)
    return `Hạng của bạn: ${mine.rank}`;
  switch (mine?.reason) {
    case "test":
      return "Tài khoản thử nghiệm không vào bảng này.";
    case "min_games": {
      const need = mine.need;
      return typeof need === "number" && Number.isFinite(need) && need >= 1
        ? `Cần thêm ${Math.ceil(need)} trận để lên bảng.`
        : "Chưa đủ số trận để lên bảng.";
    }
    default:
      return "Chưa có hạng.";
  }
}

/**
 * Tin `boards` -> dữ liệu hiện. `sinceMs` = thời gian đã trôi từ lúc nhận tin (đồng hồ máy người chơi chỉ dùng để ĐO KHOẢNG TRÔI, không phải
 * giờ tuyệt đối, đúng nguyên tắc "thời gian tương đối" của hợp đồng M9).
 */
export function boardView(msg: BoardsMsg, sinceMs = 0): BoardView {
  const board = msg.board;
  const rank =
    msg.mine && Number.isInteger(msg.mine.rank) && (msg.mine.rank as number) >= 1
      ? msg.mine.rank
      : null;
  const rows = (Array.isArray(msg.rows) ? msg.rows : [])
    .slice(0, BOARD_SIZE)
    .map((r) => rowView(board, r, rank));
  const inTop = rank !== null && rows.some((r) => r.rank === rank);
  const mineRow =
    rank !== null && !inTop && msg.mine?.row
      ? rowView(board, { ...msg.mine.row, rank }, rank)
      : null;
  const age = typeof msg.ageMs === "number" && Number.isFinite(msg.ageMs) ? msg.ageMs : NaN;
  return {
    board,
    label: BOARD_LABELS[board],
    columns: BOARD_COLUMNS[board].map((c) => c.label),
    rows,
    mineText: mineLine(msg.mine),
    mineRank: rank,
    mineRow,
    ageText: ageText(age + (Number.isFinite(sinceMs) && sinceMs > 0 ? sinceMs : 0)),
    empty: rows.length === 0,
  };
}

/**
 * Làm sạch tin `boards` đến từ mạng: đúng kiểu thì trả `BoardsMsg` (đã cắt `rows` về `BOARD_SIZE`), sai thì `null` (bỏ tin, không sập).
 * Không kiểm số liệu từng cột (`cellOf` tự về "—").
 */
export function sanitizeBoardsMsg(raw: unknown): BoardsMsg | null {
  if (raw === null || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const board = asBoardId(m.board);
  if (board === null || !Array.isArray(m.rows)) return null;
  const rows: BoardRow[] = [];
  for (const r of m.rows.slice(0, BOARD_SIZE)) {
    if (r === null || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.name !== "string" || typeof o.rank !== "number" || !Number.isInteger(o.rank))
      continue;
    rows.push(o as unknown as BoardRow);
  }
  const mm =
    m.mine !== null && typeof m.mine === "object" ? (m.mine as Record<string, unknown>) : {};
  const mine: BoardMine = {
    rank: typeof mm.rank === "number" && Number.isInteger(mm.rank) && mm.rank >= 1 ? mm.rank : null,
  };
  if (mm.reason === "test" || mm.reason === "min_games" || mm.reason === "none")
    mine.reason = mm.reason;
  if (typeof mm.need === "number" && Number.isFinite(mm.need)) mine.need = mm.need;
  if (mm.row !== null && typeof mm.row === "object") mine.row = mm.row as BoardRow;
  return {
    board,
    rows,
    mine,
    ageMs: typeof m.ageMs === "number" && Number.isFinite(m.ageMs) && m.ageMs >= 0 ? m.ageMs : 0,
  };
}
