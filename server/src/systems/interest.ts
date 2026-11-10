// Vùng nhìn (interest management, #62): mỗi người chơi chỉ nhận state của thực thể ở gần.
// Không thì băng thông tăng theo bình phương số người: ai cũng nhận mọi lần ai đó di chuyển.
//
// Cách làm: WorldState đánh `@view()` cho players / monsters / loot; mỗi client có một StateView.
// Mỗi VIEW_EVERY_TICKS tick, system này chia thực thể vào lưới ô, rồi với từng người chơi:
//   - thêm vào view những thực thể trong VIEW_ENTER px,
//   - bỏ khỏi view những thực thể ra ngoài VIEW_EXIT px (lớn hơn để không nhấp nháy ở mép).
// Thực thể bị xoá khỏi state (quái chết, đồ biến mất, người rời) thì schema tự gửi lệnh xoá.
// Không đụng tới Colyseus Room: WorldRoom tạo StateView, gán vào client.view rồi đưa cho join().
import { StateView, type MapSchema, type Schema } from "@colyseus/schema";
import { TAG_OWNER } from "../schema";
import type { World } from "../world";

/**
 * Bán kính thêm vào view. Màn hình lớn nhất client dựng (zoom tối thiểu 0.75..1.3) thấy khoảng
 * 1480×830 px quanh nhân vật (nửa đường chéo ~850 px); chừa thêm để thực thể xuất hiện trước khi vào màn hình.
 * Client có vùng nhìn rộng hơn mức này (màn hình rất lớn) thì phải giới hạn zoom, nếu không sẽ thấy hụt ở mép.
 */
export const VIEW_ENTER = 1100;
/** Bán kính bỏ khỏi view. Chênh với VIEW_ENTER để đứng ở mép không bị thêm / xoá liên tục. */
export const VIEW_EXIT = 1300;
/** Làm mới vùng nhìn mỗi bấy nhiêu tick (4 tick = 200 ms; đi 200 px/giây thì lệch ~40 px, nằm trong biên) */
export const VIEW_EVERY_TICKS = 4;
/** Cạnh một ô lưới (px). Nhỏ hơn VIEW_ENTER vài lần để tìm gần chỉ duyệt vài chục ô. */
const CELL = 256;

type Kind = "players" | "monsters" | "loot";
const KINDS: Kind[] = ["players", "monsters", "loot"];
type Entity = Schema & { x: number; y: number };

/** Lưới ô chứa thực thể; dựng lại mỗi lần làm mới, tái dùng mảng để không tạo rác mỗi lần. */
class Grid {
  private readonly gw: number;
  private readonly gh: number;
  private ids: string[][];
  private objs: Entity[][];
  private used: number[] = [];

  constructor(worldW: number, worldH: number) {
    this.gw = Math.ceil(worldW / CELL);
    this.gh = Math.ceil(worldH / CELL);
    this.ids = Array.from({ length: this.gw * this.gh }, () => []);
    this.objs = Array.from({ length: this.gw * this.gh }, () => []);
  }

  private cell(x: number, y: number) {
    const cx = Math.min(this.gw - 1, Math.max(0, Math.floor(x / CELL)));
    const cy = Math.min(this.gh - 1, Math.max(0, Math.floor(y / CELL)));
    return cy * this.gw + cx;
  }

  rebuild(map: MapSchema<Entity>) {
    for (const i of this.used) {
      this.ids[i].length = 0;
      this.objs[i].length = 0;
    }
    this.used.length = 0;
    map.forEach((o, id) => {
      const i = this.cell(o.x, o.y);
      if (this.ids[i].length === 0) this.used.push(i);
      this.ids[i].push(id);
      this.objs[i].push(o);
    });
  }

  /** Gọi fn cho mọi thực thể trong hình tròn bán kính r quanh (x, y). */
  near(x: number, y: number, r: number, fn: (id: string, o: Entity) => void) {
    const x0 = Math.max(0, Math.floor((x - r) / CELL));
    const x1 = Math.min(this.gw - 1, Math.floor((x + r) / CELL));
    const y0 = Math.max(0, Math.floor((y - r) / CELL));
    const y1 = Math.min(this.gh - 1, Math.floor((y + r) / CELL));
    const r2 = r * r;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const i = cy * this.gw + cx;
        const ids = this.ids[i];
        for (let k = 0; k < ids.length; k++) {
          const o = this.objs[i][k];
          const dx = o.x - x;
          const dy = o.y - y;
          if (dx * dx + dy * dy <= r2) fn(ids[k], o);
        }
      }
    }
  }
}

interface ClientView {
  view: StateView;
  /** Những id đang nằm trong view của client này, theo từng loại */
  seen: Record<Kind, Set<string>>;
}

export class Interest {
  private tick = 0;
  private readonly clients = new Map<string, ClientView>();
  private readonly grids: Record<Kind, Grid>;

  /** Kích thước bản đồ (px): lưới ô dựng theo bản đồ của phòng. */
  constructor(worldW: number, worldH: number) {
    this.grids = {
      players: new Grid(worldW, worldH),
      monsters: new Grid(worldW, worldH),
      loot: new Grid(worldW, worldH),
    };
  }

  /**
   * Đăng ký view của một người chơi (đã có trong state.players). Gọi trong onJoin, trước khi Colyseus
   * gửi state đầy đủ: người mới thấy ngay những gì ở quanh mình chứ không phải chờ lần làm mới sau.
   */
  join(w: World, sessionId: string, view: StateView) {
    const entry: ClientView = {
      view,
      seen: { players: new Set(), monsters: new Set(), loot: new Set() },
    };
    this.clients.set(sessionId, entry);
    const me = w.state.players.get(sessionId);
    if (me) {
      view.add(me); // thông tin công khai
      view.add(me, TAG_OWNER); // + trường riêng của chủ (lastSeq)
      entry.seen.players.add(sessionId);
    }
    for (const k of KINDS) this.grids[k].rebuild(w.state[k] as unknown as MapSchema<Entity>);
    this.sync(w, sessionId, entry);
  }

  leave(sessionId: string) {
    this.clients.delete(sessionId);
  }

  /**
   * Gọi fn(sessionId) cho mọi người chơi đã đăng ký đang ở trong r px quanh (x, y), theo vị trí hiện tại.
   * Dùng để gửi tin nhắn có vị trí (hiệu ứng chém, số sát thương) chỉ cho người nhìn thấy được.
   * Duyệt thẳng danh sách người chơi (tối đa ~100): rẻ hơn dựng lưới cho vài trăm tin mỗi giây.
   */
  forEachNear(w: World, x: number, y: number, r: number, fn: (sessionId: string) => void) {
    const r2 = r * r;
    for (const sid of this.clients.keys()) {
      const p = w.state.players.get(sid);
      if (!p) continue;
      const dx = p.x - x;
      const dy = p.y - y;
      if (dx * dx + dy * dy <= r2) fn(sid);
    }
  }

  /** StateView của một người chơi, nếu đã đăng ký (dùng cho test / bench). */
  viewOf(sessionId: string): StateView | undefined {
    return this.clients.get(sessionId)?.view;
  }

  /** Gọi mỗi tick; cứ VIEW_EVERY_TICKS tick mới thật sự làm mới vùng nhìn. */
  update(w: World) {
    if (this.clients.size === 0) return;
    if (++this.tick % VIEW_EVERY_TICKS !== 0) return;
    for (const k of KINDS) this.grids[k].rebuild(w.state[k] as unknown as MapSchema<Entity>);
    for (const [sid, entry] of this.clients) this.sync(w, sid, entry);
  }

  private sync(w: World, sessionId: string, e: ClientView) {
    const me = w.state.players.get(sessionId);
    if (!me) return;
    const exit2 = VIEW_EXIT * VIEW_EXIT;
    for (const k of KINDS) {
      const seen = e.seen[k];
      this.grids[k].near(me.x, me.y, VIEW_ENTER, (id, o) => {
        if (seen.has(id)) return;
        e.view.add(o);
        seen.add(id);
      });
      const map = w.state[k] as unknown as MapSchema<Entity>;
      for (const id of seen) {
        const o = map.get(id);
        if (!o) {
          seen.delete(id); // đã bị xoá khỏi state, schema tự gửi lệnh xoá cho client
        } else if (id !== sessionId) {
          const dx = o.x - me.x;
          const dy = o.y - me.y;
          if (dx * dx + dy * dy > exit2) {
            e.view.remove(o);
            seen.delete(id);
          }
        }
      }
    }
  }
}
