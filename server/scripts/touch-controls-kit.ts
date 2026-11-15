// Kiểm TỔNG QUÁT điều khiển cảm ứng (issue #727): ở điện thoại NGANG không điều khiển cảm ứng nào được chồng lên điều khiển khác, chạm vào GIỮA mỗi điều khiển phải
// trúng đúng nó (không phải nút phủ bên trên), và không điều khiển nào bị đẩy ra ngoài màn. Lỗi gốc: nút Mục tiêu neo cách đáy 180 px, cột phải (bản đồ nhỏ + thanh menu) cao
// ~179 px, nên chồng nhau khi chiều cao < ~417 px (chạm giữa nút Mục tiêu ở 812 x 375 mở nhầm Cài đặt) mà e2e chỉ đo 915 x 412 nên không thấy. Thay vì chỉ thêm nút đó,
// test đo MỌI điều khiển đang hiện (liệt kê tự động bằng bộ chọn, không theo danh sách tay: nút mới thêm vào HUD tự bị kiểm).
//
// `TOUCH_CONTROLS_SCRIPT` chạy TRONG trang (`Runtime.evaluate`), `findTouchConflicts` là hàm thuần (có test đơn vị ở `touch-controls-kit.test.ts`).

/** Các khung điện thoại NGANG cần kiểm (>= 568 x 320): iPhone SE đời đầu, SE / 8, 7 Plus, X, Android phổ biến, 14, 11 Pro Max. */
export const LANDSCAPE_PHONES: ReadonlyArray<{ w: number; h: number; note: string }> = [
  { w: 915, h: 412, note: "Android phổ biến (mốc cũ của e2e)" },
  { w: 896, h: 414, note: "iPhone 11 / XR ngang" },
  { w: 844, h: 390, note: "iPhone 12 - 14 ngang" },
  { w: 812, h: 375, note: "iPhone X / 11 Pro ngang" },
  { w: 740, h: 360, note: "Android 18:9 ngang" },
  { w: 667, h: 375, note: "iPhone SE / 8 ngang" },
  { w: 568, h: 320, note: "iPhone 5 / SE đời đầu ngang (nhỏ nhất còn hỗ trợ)" },
];

/** Một điều khiển cảm ứng đo được trong trang. */
export interface TouchControl {
  /** id phần tử (hoặc `tag.class#thứ-tự` nếu không có id) */
  key: string;
  l: number;
  t: number;
  r: number;
  b: number;
  /** key của phần tử trúng cú chạm ở GIỮA điều khiển (null nếu không có phần tử nào) */
  hit: string | null;
  /** phần tử trúng chạm có nằm TRONG điều khiển (hoặc chính nó) không */
  hitInside: boolean;
  /** key của các điều khiển khác nằm trong điều khiển này (quan hệ chứa nhau) */
  contains: string[];
  /** tâm điều khiển bị khung cuộn của tổ tiên cắt (người chơi vuốt cuộn tới được: không tính chồng lấn / chạm trượt / tràn khung) */
  clipped?: boolean;
}

/**
 * Liệt kê điều khiển cảm ứng đang hiện: phần tử tương tác (nút, ô nhập, liên kết, ô chọn, `tabindex`), mục nhiệm vụ chạm để chỉ đường, bản đồ nhỏ (bấm mở bản đồ lớn) và nút hướng cố định (D-pad),
 * thấy được (có hộp: không `display: none`, kể cả do tổ tiên; `visibility` hiện), bắt được chạm (`pointer-events` khác `none`). Trả `JSON` chuỗi.
 */
export const TOUCH_CONTROLS_SCRIPT = `(() => {
  const SEL = 'button, input, select, textarea, a[href], [role="button"], [tabindex]:not([tabindex="-1"]), .qt-item, #minimap-wrap, #dpad';
  const seen = new Set();
  const els = [];
  for (const el of document.querySelectorAll(SEL)) {
    if (seen.has(el)) continue;
    seen.add(el);
    if (el.getClientRects().length === 0) continue; // display: none (kể cả do tổ tiên / thuộc tính hidden) thì không có hộp
    const cs = getComputedStyle(el);
    if (cs.visibility !== 'visible' || cs.pointerEvents === 'none' || cs.display === 'none') continue;
    const b = el.getBoundingClientRect();
    if (b.width < 1 || b.height < 1) continue;
    els.push(el);
  }
  const count = new Map();
  const keyOf = (el) => {
    if (el.id) return el.id;
    const base = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : '');
    const n = (count.get(base) || 0) + 1;
    count.set(base, n);
    return base + '#' + n;
  };
  const keys = new Map(els.map((el) => [el, keyOf(el)]));
  // tâm điều khiển nằm NGOÀI hộp của một tổ tiên cuộn / cắt (overflow khác visible): vuốt cuộn mới tới được
  const clippedByScroller = (el, cx, cy) => {
    for (let a = el.parentElement; a && a !== document.documentElement && a !== document.body; a = a.parentElement) {
      const o = getComputedStyle(a);
      if (o.overflowX === 'visible' && o.overflowY === 'visible') continue;
      const r = a.getBoundingClientRect();
      if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return true;
    }
    return false;
  };
  return JSON.stringify(els.map((el) => {
    const b = el.getBoundingClientRect();
    const hitEl = document.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2);
    let hit = null;
    if (hitEl) {
      let cur = hitEl;
      while (cur && !keys.has(cur)) cur = cur.parentElement;
      hit = cur ? keys.get(cur) : (hitEl.id || hitEl.tagName.toLowerCase());
    }
    return {
      key: keys.get(el),
      l: b.left, t: b.top, r: b.right, b: b.bottom,
      hit,
      hitInside: !!hitEl && el.contains(hitEl),
      contains: els.filter((o) => o !== el && el.contains(o)).map((o) => keys.get(o)),
      clipped: clippedByScroller(el, (b.left + b.right) / 2, (b.top + b.bottom) / 2),
    };
  }));
})()`;

/** Chồng nhau CÓ CHỦ Ý (khác quan hệ chứa nhau, vốn luôn được bỏ qua): `[keyA, keyB, lý do]`, không phân biệt thứ tự. */
export type OverlapException = readonly [string, string, string];

export interface TouchConflicts {
  /** cặp điều khiển chồng nhau (diện tích giao > 1 px theo cả hai chiều) */
  overlaps: Array<{ a: string; b: string; w: number; h: number }>;
  /** điều khiển mà chạm vào giữa nó trúng phần tử khác */
  tapMisses: Array<{ key: string; hit: string | null }>;
  /** điều khiển nằm (một phần) ngoài khung nhìn */
  offscreen: Array<{ key: string; l: number; t: number; r: number; b: number }>;
}

const TOL = 0.5;

/** Tìm chồng lấn, chạm trượt, tràn khung giữa các điều khiển đo được ở khung nhìn `W x H`. Cặp có quan hệ chứa nhau và cặp trong `exceptions` được bỏ qua. */
export function findTouchConflicts(
  controls: readonly TouchControl[],
  W: number,
  H: number,
  exceptions: readonly OverlapException[] = [],
): TouchConflicts {
  const allowed = new Set(exceptions.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));
  const out: TouchConflicts = { overlaps: [], tapMisses: [], offscreen: [] };
  // điều khiển bị khung cuộn cắt (tới được bằng vuốt cuộn) không thuộc phép đo
  const list = controls.filter((c) => !c.clipped);
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    // chạm trượt mà phần tử trúng là điều khiển đã khai báo chồng có chủ ý với điều khiển này thì không tính
    if (!c.hitInside && !(c.hit !== null && allowed.has(`${c.key}|${c.hit}`)))
      out.tapMisses.push({ key: c.key, hit: c.hit });
    if (c.l < -TOL || c.t < -TOL || c.r > W + TOL || c.b > H + TOL)
      out.offscreen.push({ key: c.key, l: c.l, t: c.t, r: c.r, b: c.b });
    for (let j = i + 1; j < list.length; j++) {
      const d = list[j];
      if (c.contains.includes(d.key) || d.contains.includes(c.key)) continue;
      if (allowed.has(`${c.key}|${d.key}`)) continue;
      const w = Math.min(c.r, d.r) - Math.max(c.l, d.l);
      const h = Math.min(c.b, d.b) - Math.max(c.t, d.t);
      if (w > 1 && h > 1)
        out.overlaps.push({ a: c.key, b: d.key, w: Math.round(w), h: Math.round(h) });
    }
  }
  return out;
}

/** Trạng thái điều khiển cần kiểm: các nút ngữ cảnh (do vòng lặp cảnh bật / tắt MỖI khung) hiện cùng bốn ô chiêu đã gắn (mặc định trên cảm ứng chỉ ô đã gắn mới hiện). */
export interface TouchState {
  id: string;
  /** id các nút ngữ cảnh được ép hiện */
  show: readonly string[];
  /** chiều cao khung nhìn nhỏ nhất mà trạng thái này được bảo đảm (trạng thái hiếm, vd. hai nút ngữ cảnh cùng lúc) */
  minHeight: number;
}

export const TOUCH_STATES: readonly TouchState[] = [
  { id: "nền (bốn ô chiêu, không nút ngữ cảnh)", show: [], minHeight: 0 },
  { id: "đứng cạnh cổng (nút Cổng)", show: ["btn-portal"], minHeight: 0 },
  { id: "đứng cạnh NPC (nút Nói)", show: ["btn-talk"], minHeight: 0 },
  { id: "đứng cạnh đồ rơi (nút Nhặt)", show: ["btn-pickup"], minHeight: 0 },
  { id: "NPC + đồ rơi (Nói + Nhặt)", show: ["btn-talk", "btn-pickup"], minHeight: 375 },
];

/**
 * Kịch bản đo ở trạng thái `state`, chạy trong MỘT lần `Runtime.evaluate`: ép hiện nút ngữ cảnh + bốn ô chiêu, đo, rồi trả lại nguyên trạng ngay trong cùng tác vụ,
 * nên vòng lặp cảnh (gọi `talkPrompt(null)`... mỗi khung) không kịp bật / tắt lại giữa chừng.
 */
export function measureInState(state: TouchState): string {
  return `(() => {
    const touched = [];
    for (const id of ${JSON.stringify(state.show)}) { const e = document.getElementById(id); touched.push([e, e.hidden]); e.hidden = false; }
    const slots = [...document.querySelectorAll('#skill-slots .sk.slot')].map((s) => [s, s.className]);
    for (const [s] of slots) { s.classList.remove('k-empty', 'k-locked'); s.classList.add('k-ready'); }
    try { return ${TOUCH_CONTROLS_SCRIPT}; }
    finally {
      for (const [e, h] of touched) e.hidden = h;
      for (const [s, c] of slots) s.className = c;
    }
  })()`;
}
