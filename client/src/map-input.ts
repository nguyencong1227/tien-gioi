/**
 * Điều khiển camera của BẢN ĐỒ LỚN (QUYET_DINH_M3 mục 17.2, issue #496 bước 3): phóng to / thu nhỏ / kéo bằng chuột (lăn, kéo, nhấp đúp), cảm ứng
 * (kéo một ngón, chụm hai ngón), bàn phím (`+` / `-`, mũi tên, `Home`) và ba nút trong bảng (`+`, `-`, "Về chỗ mình").
 *
 * Tính toán camera là các hàm THUẦN ở `map-render.ts` (có test); ở đây chỉ gắn sự kiện DOM và giữ trạng thái:
 *  - `follow` = camera bám theo người chơi (tâm nhìn = vị trí mình khi đã phóng to); kéo bản đồ tay hoặc mũi tên bàn phím thì thôi bám,
 *    nút "Về chỗ mình" / phím `Home` bám lại. Mở bản đồ lớn luôn bắt đầu ở zoom 1 và bám.
 *  - Mọi thay đổi gọi `onChange` để chỗ vẽ vẽ lại NGAY (gộp theo khung hình), không đợi nhịp 250 ms của bản đồ nhỏ.
 */
import {
  MAP_ZOOM_STEP,
  centerCamera,
  clampCamera,
  fitCamera,
  panCamera,
  pinchCamera,
  zoomCamera,
  type CameraBox,
  type MapCamera,
} from "./map-render";

/** Phím một lần bấm kéo bản đồ bao nhiêu phần khung nhìn (nhỏ hơn cạnh canvas ngắn nhất). */
const KEY_PAN_FRACTION = 0.15;
/** Kéo ít hơn ngần này điểm ảnh CSS thì chưa coi là kéo (chạm tay rung nhẹ). */
const DRAG_START_CSS_PX = 4;

export class MapCameraControl {
  /** Camera hiện tại (đã kẹp theo khung nhìn lần vẽ gần nhất) */
  cam: MapCamera = { zoom: 1, cx: 0, cy: 0 };
  /** Đang bám theo người chơi */
  follow = true;
  /** Khung nhìn của lần vẽ gần nhất (điểm ảnh canvas); `null` khi chưa vẽ lần nào */
  box: CameraBox | null = null;
  /** Gọi sau mỗi thay đổi camera do người chơi */
  onChange: (() => void) | null = null;

  /** Mở bản đồ lớn: zoom 1, ở giữa, bám theo mình. */
  reset(box?: Pick<CameraBox, "worldW" | "worldH">): void {
    const b = box ?? this.box;
    this.cam = b ? fitCamera(b) : { zoom: 1, cx: 0, cy: 0 };
    this.follow = true;
  }

  /** Camera để vẽ: đang bám thì tâm nhìn là vị trí (meX, meY) (đã kẹp); luôn ghi lại `cam` và `box`. */
  effective(box: CameraBox, meX: number, meY: number): MapCamera {
    this.box = box;
    this.cam = this.follow ? centerCamera(box, this.cam, meX, meY) : clampCamera(box, this.cam);
    return this.cam;
  }

  /** Phóng / thu `factor` lần quanh điểm canvas (ax, ay); đang bám thì quanh tâm (người chơi ở giữa). */
  zoomBy(factor: number, ax?: number, ay?: number): void {
    const b = this.box;
    if (!b) return;
    const x = this.follow || ax === undefined ? b.cw / 2 : ax;
    const y = this.follow || ay === undefined ? b.ch / 2 : ay;
    this.cam = zoomCamera(b, this.cam, factor, x, y);
    this.onChange?.();
  }

  /** Kéo bản đồ (điểm ảnh canvas): thôi bám theo người chơi. */
  pan(dx: number, dy: number): void {
    const b = this.box;
    if (!b || (dx === 0 && dy === 0)) return;
    this.cam = panCamera(b, this.cam, dx, dy);
    this.onChange?.();
  }

  /** Chụm hai ngón từ (a0, b0) sang (a1, b1): thôi bám theo người chơi. */
  pinch(
    a0: { x: number; y: number },
    b0: { x: number; y: number },
    a1: { x: number; y: number },
    b1: { x: number; y: number },
  ): void {
    const b = this.box;
    if (!b) return;
    this.follow = false;
    this.cam = pinchCamera(b, this.cam, a0, b0, a1, b1);
    this.onChange?.();
  }

  /** "Về chỗ mình": bám lại, giữ mức phóng. */
  recenter(): void {
    this.follow = true;
    this.onChange?.();
  }

  /** Về mức vừa trọn bản đồ và bám lại (nhấp đúp khi đã phóng tối đa). */
  fit(): void {
    this.reset();
    this.onChange?.();
  }
}

export interface MapInputTargets {
  canvas: HTMLCanvasElement;
  zoomIn?: HTMLElement | null;
  zoomOut?: HTMLElement | null;
  recenter?: HTMLElement | null;
}

/** Hệ số phóng của một sự kiện lăn chuột: liên tục theo `deltaY` (chuột lăn nấc to, bàn di chuột nhiều nấc nhỏ), kẹp một nấc `MAP_ZOOM_STEP`. */
export function wheelZoomFactor(deltaY: number, deltaMode: number): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 1;
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  const f = Math.exp(-px * 0.0022);
  return Math.min(MAP_ZOOM_STEP, Math.max(1 / MAP_ZOOM_STEP, f));
}

/** Gắn sự kiện chuột / cảm ứng / bàn phím / nút cho bản đồ lớn. Trả hàm gỡ. */
export function attachMapInput(ctl: MapCameraControl, t: MapInputTargets): () => void {
  const { canvas } = t;
  const pointers = new Map<number, { x: number; y: number }>();
  let dragMoved = false;
  let dragStartCss = { x: 0, y: 0 };

  /** Toạ độ con trỏ -> điểm ảnh canvas (canvas có thể được CSS co giãn). */
  const toCanvas = (e: { clientX: number; clientY: number }) => {
    const r = canvas.getBoundingClientRect();
    const sx = r.width > 0 ? canvas.width / r.width : 1;
    const sy = r.height > 0 ? canvas.height / r.height : 1;
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
  };

  const onDown = (e: PointerEvent) => {
    canvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, toCanvas(e));
    if (pointers.size === 1) {
      dragMoved = false;
      dragStartCss = { x: e.clientX, y: e.clientY };
    }
  };
  const onMove = (e: PointerEvent) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const cur = toCanvas(e);
    if (pointers.size >= 2) {
      const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)?.[1];
      if (other) ctl.pinch(prev, other, cur, other);
      dragMoved = true;
    } else {
      if (
        !dragMoved &&
        Math.hypot(e.clientX - dragStartCss.x, e.clientY - dragStartCss.y) < DRAG_START_CSS_PX
      )
        return;
      dragMoved = true;
      ctl.pan(cur.x - prev.x, cur.y - prev.y);
    }
    pointers.set(e.pointerId, cur);
  };
  const onUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    canvas.releasePointerCapture?.(e.pointerId);
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = toCanvas(e);
    void p;
  };
  const onDblClick = (e: MouseEvent) => {
    const p = toCanvas(e);
    if (ctl.cam.zoom >= 7.5) ctl.fit();
    else ctl.zoomBy(MAP_ZOOM_STEP * MAP_ZOOM_STEP, p.x, p.y);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const b = ctl.box;
    const step = b ? Math.min(b.cw, b.ch) * KEY_PAN_FRACTION : 0;
    // mũi tên kéo KHUNG NHÌN: phím sang phải = nhìn sang phải = bản đồ trượt sang trái
    switch (e.code) {
      case "ArrowLeft":
        ctl.pan(step, 0);
        break;
      case "ArrowRight":
        ctl.pan(-step, 0);
        break;
      case "ArrowUp":
        ctl.pan(0, step);
        break;
      case "ArrowDown":
        ctl.pan(0, -step);
        break;
      case "Equal":
      case "NumpadAdd":
        ctl.zoomBy(MAP_ZOOM_STEP);
        break;
      case "Minus":
      case "NumpadSubtract":
        ctl.zoomBy(1 / MAP_ZOOM_STEP);
        break;
      case "Home":
        ctl.recenter();
        break;
      default:
        return; // phím khác (Esc, Tab...) không phải của bản đồ: để nguyên cho bảng
    }
    e.preventDefault();
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("dblclick", onDblClick);
  canvas.addEventListener("keydown", onKey);
  const click = (el: HTMLElement | null | undefined, fn: () => void) => {
    el?.addEventListener("click", fn);
    return () => el?.removeEventListener("click", fn);
  };
  const offs = [
    click(t.zoomIn, () => ctl.zoomBy(MAP_ZOOM_STEP)),
    click(t.zoomOut, () => ctl.zoomBy(1 / MAP_ZOOM_STEP)),
    click(t.recenter, () => ctl.recenter()),
  ];
  return () => {
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("dblclick", onDblClick);
    canvas.removeEventListener("keydown", onKey);
    for (const off of offs) off();
  };
}
