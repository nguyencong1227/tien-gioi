// Vẽ tab "Nội vụ" của bảng Tông môn (M8.6, #843) từ dữ liệu đã làm sạch (`sect-hall.ts`). Chỉ tạo phần tử bằng `createElement` + `textContent` (không bao giờ `innerHTML`).
// Tách khỏi `ui.ts` (tệp rất lớn): `ui.ts` giữ trạng thái và tin nhắn, ở đây chỉ dựng DOM và bắt sự kiện bấm. Vẽ lại TOÀN BỘ khi dữ liệu / trạng thái đổi; đếm ngược chỉ cập nhật một dòng
// (`updateHallCountdown`) để không mất tiêu điểm bàn phím mỗi giây.
import { SECT_TERMS, type SectHallView } from "@tien-gioi/shared";
import {
  formatHallDuration,
  hallBuffLines,
  hallEarnNote,
  hallProgress,
  hallQuestRows,
  hallResetInMs,
  hallShopGroups,
  hallShopRows,
  type HallShopRow,
} from "./sect-hall";

export interface HallUiState {
  /** Ảnh chụp đã làm sạch; `null` = chưa có (đang tải) */
  view: SectHallView | null;
  /** Đồng hồ máy khách (`Date.now()`) lúc nhận ảnh chụp, và lúc vẽ: hiệu = thời gian đã trôi kể từ `view.now` */
  receivedAt: number;
  nowClient: number;
  /** Đã gục / ở Hoàng Tuyền: khoá nhận / trả / mua */
  down: boolean;
  /** Các thao tác đang chờ máy chủ trả lời (khoá nút tương ứng): `quest:<id>` / `shop:<itemId>` */
  busy: ReadonlySet<string>;
  /**
   * Trạng thái mở / thu của các nhóm cửa hàng do NGƯỜI CHƠI đổi (khoá `HallShopSection.key`; chỉ có khoá khi khác mặc định). Vẽ lại toàn bộ tab mỗi khi dữ liệu đổi,
   * nên trạng thái phải sống ngoài DOM: không thì mua một món là các nhóm vừa mở lại gập về mặc định.
   */
  groupOpen?: ReadonlyMap<string, boolean>;
  /**
   * Hàng cửa hàng đang mở khung "mua nhiều" (ô số lượng dùng chung, mục 47) và phần tử ô số lượng của nó. Ô số lượng sống ngoài DOM của tab (`ui.ts` giữ MỘT bản): tab vẽ lại
   * toàn bộ mỗi lần dữ liệu đổi, nên nếu dựng lại ô thì số người chơi đang gõ mất; ở đây chỉ gắn lại phần tử có sẵn vào đúng hàng.
   */
  buy?: { itemId: string; stepperEl: HTMLElement } | null;
}

export interface HallUiHandlers {
  onAccept(questId: string): void;
  onTurnIn(questId: string): void;
  onBuy(itemId: string): void;
  /** Bấm "Nhiều…": mở / đóng khung mua nhiều của một hàng */
  onBuyMore?(itemId: string): void;
  /** "Đổi" trong khung mua nhiều: bên gọi đọc số lượng từ ô rồi gửi */
  onBuyConfirm?(itemId: string): void;
  /** "Huỷ" trong khung mua nhiều */
  onBuyCancel?(): void;
  /** Người chơi mở / thu một nhóm cửa hàng (`defaultOpen` để bên gọi chỉ nhớ khi khác mặc định) */
  onGroupToggle?(key: string, open: boolean, defaultOpen: boolean): void;
}

/** Giờ máy chủ ước tính từ ảnh chụp: `view.now` cộng thời gian máy khách đã trôi kể từ lúc nhận (không âm). */
export function serverNowOf(st: HallUiState): number {
  const v = st.view;
  if (!v) return 0;
  return v.now + Math.max(0, st.nowClient - st.receivedAt);
}

type Doc = Document;

function make<K extends keyof HTMLElementTagNameMap>(
  doc: Doc,
  tag: K,
  cls?: string,
  txt?: string,
): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (txt !== undefined) e.textContent = txt;
  return e;
}

function actionButton(
  doc: Doc,
  label: string,
  enabled: boolean,
  busy: boolean,
  whyId: string | null,
  onClick: () => void,
): HTMLButtonElement {
  const b = make(doc, "button", "sect-small-btn sect-hall-btn", busy ? "Đang xử lý…" : label);
  b.type = "button";
  // `disabled` thật: không focus / bấm được; lý do đọc được qua `aria-describedby` (chữ hiện ngay dưới nút)
  b.disabled = !enabled || busy;
  if (whyId) b.setAttribute("aria-describedby", whyId);
  b.addEventListener("click", () => {
    if (!b.disabled) onClick();
  });
  return b;
}

function stat(doc: Doc, label: string, value: string): HTMLElement {
  const box = make(doc, "div", "sect-hall-stat");
  box.append(make(doc, "span", undefined, label), make(doc, "b", undefined, value));
  return box;
}

/** Vẽ lại toàn bộ tab vào `root`. */
export function renderHall(root: HTMLElement, st: HallUiState, h: HallUiHandlers): void {
  const doc = root.ownerDocument;
  const v = st.view;
  if (!v) {
    root.replaceChildren(make(doc, "p", "sect-hall-empty", "Đang tải nội vụ tông môn…"));
    return;
  }
  const serverNow = serverNowOf(st);
  const kids: HTMLElement[] = [];

  // ---- Cấp tông + thanh điểm + giới hạn + buff ----
  const prog = hallProgress(v);
  const lv = make(doc, "section", "sect-hall-card");
  const lvTitle = make(doc, "h4", undefined, prog.levelLabel);
  lvTitle.id = "sect-hall-level";
  const bar = make(doc, "div", "sect-hall-bar");
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-labelledby", "sect-hall-level");
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", String(prog.max));
  bar.setAttribute("aria-valuenow", String(prog.now));
  bar.setAttribute("aria-valuetext", prog.text);
  const fill = make(doc, "span", "sect-hall-bar-fill");
  fill.style.width = `${Math.round(prog.ratio * 100)}%`;
  bar.append(fill);
  lv.append(
    lvTitle,
    bar,
    make(doc, "small", "sect-hall-points", prog.text),
    make(
      doc,
      "p",
      "sect-hall-caps",
      `Tối đa ${v.caps.members} thành viên, ${v.caps.elders} Trưởng lão, kho đồ ${v.caps.vaultSlots} ô.`,
    ),
  );
  const buffs = hallBuffLines(v.buff);
  const buffBox = make(doc, "p", "sect-hall-buffs");
  buffBox.textContent = buffs.length
    ? `Buff cho thành viên đang trực tuyến: ${buffs.join(", ")}.`
    : "Chưa có buff (lên cấp tông để mở).";
  lv.append(buffBox);
  kids.push(lv);

  // ---- Cống hiến của mình ----
  const earn = hallEarnNote(v, serverNow);
  const me = make(doc, "section", "sect-hall-card");
  const grid = make(doc, "div", "sect-hall-stats");
  grid.append(
    stat(doc, SECT_TERMS.contrib, v.me.contrib.toLocaleString("vi-VN")),
    stat(doc, SECT_TERMS.merit, v.me.merit.toLocaleString("vi-VN")),
  );
  const todayP = make(doc, "p", "sect-hall-today", earn.today);
  me.append(make(doc, "h4", undefined, "Cống hiến của ngươi"), grid, todayP);
  if (earn.note) {
    const n = make(doc, "p", earn.waiting ? "sect-hall-note warn" : "sect-hall-note", earn.note);
    n.setAttribute("role", "status");
    me.append(n);
  }
  me.append(
    make(
      doc,
      "p",
      "sect-hall-deposit",
      `Góp Linh thạch hoặc đồ vào kho cũng được ${SECT_TERMS.contrib.toLowerCase()}: hôm nay còn kiếm được tối đa ${v.me.depositLeft} bằng cách góp.`,
    ),
  );
  const reset = make(doc, "p", "sect-hall-reset");
  reset.id = "sect-hall-reset";
  me.append(reset);
  kids.push(me);

  // ---- Nhiệm vụ hôm nay ----
  const qBox = make(doc, "section", "sect-hall-card");
  qBox.append(make(doc, "h4", undefined, "Nhiệm vụ hôm nay"));
  const qRows = hallQuestRows(v, { serverNowMs: serverNow, down: st.down });
  if (!qRows.length) {
    qBox.append(make(doc, "p", "sect-hall-empty", "Hôm nay tông môn chưa có nhiệm vụ."));
  } else {
    const ul = make(doc, "ul", "sect-hall-list");
    qRows.forEach((r, i) => {
      const li = make(doc, "li", `sect-hall-row ${r.state}`);
      const head = make(doc, "div", "sect-hall-row-head");
      head.append(
        make(doc, "b", undefined, r.title),
        make(doc, "span", "sect-hall-tag", `${r.level} · ${r.reward}`),
      );
      li.append(head, make(doc, "p", "sect-hall-desc", r.desc));
      const foot = make(doc, "div", "sect-hall-row-foot");
      foot.append(make(doc, "span", `sect-hall-state ${r.state}`, r.stateLabel));
      const whyId = `sect-hall-qwhy-${i}`;
      if (r.state === "offer") {
        foot.append(
          actionButton(
            doc,
            "Nhận",
            r.canAccept,
            st.busy.has(`quest:${r.questId}`),
            r.why ? whyId : null,
            () => h.onAccept(r.questId),
          ),
        );
      } else if (r.state === "active") {
        foot.append(
          actionButton(
            doc,
            "Trả",
            r.canTurnIn,
            st.busy.has(`quest:${r.questId}`),
            r.why ? whyId : null,
            () => h.onTurnIn(r.questId),
          ),
        );
      }
      li.append(foot);
      if (r.why) {
        const why = make(doc, "p", "sect-hall-why", r.why);
        why.id = whyId;
        li.append(why);
      }
      ul.append(li);
    });
    qBox.append(ul);
  }
  kids.push(qBox);

  // ---- Cửa hàng (Bảo khố: đồ; Tàng Kinh Các: kinh quyển) ----
  const shop = make(doc, "section", "sect-hall-card");
  shop.append(make(doc, "h4", undefined, "Cửa hàng tông môn"));
  const sRows = hallShopRows(v, { down: st.down });
  if (!sRows.length) {
    shop.append(make(doc, "p", "sect-hall-empty", "Cửa hàng tông môn chưa có món nào."));
  } else {
    const shopRow = (r: HallShopRow) => {
      const li = make(doc, "li", `sect-hall-row ${r.canBuy ? "" : "locked"}`.trim());
      const head = make(doc, "div", "sect-hall-row-head");
      head.append(make(doc, "b", undefined, r.name), make(doc, "span", "sect-hall-tag", r.price));
      const foot = make(doc, "div", "sect-hall-row-foot");
      foot.append(make(doc, "span", "sect-hall-state", r.leftLabel));
      const whyId = `sect-hall-swhy-${r.itemId}`;
      foot.append(
        actionButton(
          doc,
          "Đổi",
          r.canBuy,
          st.busy.has(`shop:${r.itemId}`),
          r.why ? whyId : null,
          () => h.onBuy(r.itemId),
        ),
      );
      // "Nhiều…": chỉ khi mua được từ 2 cái trở lên một lần (ô số lượng dùng chung); "Đổi" vẫn đổi ngay MỘT cái (đường nhanh)
      if (r.maxBuy >= 2 && h.onBuyMore) {
        const open = st.buy?.itemId === r.itemId;
        const more = make(
          doc,
          "button",
          "sect-small-btn sect-hall-btn sect-hall-more",
          open ? "Gấp lại" : "Nhiều…",
        );
        more.type = "button";
        more.setAttribute("aria-expanded", String(open));
        more.addEventListener("click", () => h.onBuyMore?.(r.itemId));
        foot.append(more);
      }
      li.append(head, foot);
      if (r.why) {
        const why = make(doc, "p", "sect-hall-why", r.why);
        why.id = whyId;
        li.append(why);
      }
      if (st.buy && st.buy.itemId === r.itemId && r.maxBuy >= 1) {
        const panel = make(doc, "div", "sect-hall-buy");
        panel.append(st.buy.stepperEl);
        const acts = make(doc, "div", "sect-hall-buy-actions");
        const ok = make(
          doc,
          "button",
          "sect-small-btn sect-hall-btn sect-primary-btn",
          st.busy.has(`shop:${r.itemId}`) ? "Đang xử lý…" : "Đổi số này",
        );
        ok.type = "button";
        ok.disabled = st.busy.has(`shop:${r.itemId}`);
        ok.addEventListener("click", () => {
          if (!ok.disabled) h.onBuyConfirm?.(r.itemId);
        });
        const cancel = make(doc, "button", "sect-small-btn sect-hall-btn", "Huỷ");
        cancel.type = "button";
        cancel.addEventListener("click", () => h.onBuyCancel?.());
        acts.append(ok, cancel);
        panel.append(acts);
        li.append(panel);
      }
      return li;
    };
    // Hai gian (Bảo khố: đồ; Tàng Kinh Các: kinh quyển); trong mỗi gian: món đã mở theo cấp tông, rồi các nhóm "Mở ở cấp tông N" (chỉ cấp kế tiếp mở sẵn, `hallShopGroups`)
    for (const g of hallShopGroups(sRows, v.level)) {
      shop.append(make(doc, "h5", "sect-hall-sub", g.hallLabel));
      for (const sec of g.sections) {
        const ul = make(doc, "ul", "sect-hall-list");
        for (const r of sec.rows) ul.append(shopRow(r));
        if (sec.level === null) {
          shop.append(ul);
          continue;
        }
        const det = make(doc, "details", "sect-hall-group");
        det.open = st.groupOpen?.get(sec.key) ?? sec.defaultOpen;
        det.append(make(doc, "summary", "sect-hall-group-title", sec.title), ul);
        // `toggle` bắn cả khi ta đặt `open` lúc dựng: chỉ báo khi khác trạng thái đã vẽ (bên gọi lại so với mặc định để chỉ nhớ lựa chọn thật của người chơi)
        const drawn = det.open;
        det.addEventListener("toggle", () => {
          if (det.open !== drawn) h.onGroupToggle?.(sec.key, det.open, sec.defaultOpen);
        });
        shop.append(det);
      }
    }
  }
  kids.push(shop);

  root.replaceChildren(...kids);
  updateHallCountdown(root, st);
}

/**
 * Cập nhật dòng đếm ngược "đặt lại sau X". Trả `true` khi đã QUA mốc đặt lại (người gọi xin ảnh chụp mới, một lần cho mỗi mốc). Không đụng phần tử nào khác.
 */
export function updateHallCountdown(root: HTMLElement, st: HallUiState): boolean {
  const v = st.view;
  const el = root.querySelector<HTMLElement>("#sect-hall-reset");
  if (!v) return false;
  const left = hallResetInMs(v, Math.max(0, st.nowClient - st.receivedAt));
  if (el) {
    el.textContent =
      left > 0
        ? `Nhiệm vụ, hạn mức và trần ${SECT_TERMS.contrib.toLowerCase()} trong ngày đặt lại sau ${formatHallDuration(left)} (00:00 giờ Việt Nam).`
        : "Đang sang ngày mới…";
  }
  return left <= 0;
}
