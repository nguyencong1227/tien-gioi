import { describe, expect, it, vi } from "vitest";
import { MAP_MAX_ZOOM, MAP_ZOOM_STEP, type CameraBox } from "./map-render";
import { MapCameraControl, wheelZoomFactor } from "./map-input";

const box: CameraBox = { worldW: 3072, worldH: 3072, cw: 600, ch: 600, pad: 12 };

function ready(): MapCameraControl {
  const c = new MapCameraControl();
  c.reset(box);
  c.effective(box, 1536, 1536); // một lần vẽ để có `box`
  return c;
}

describe("map-input: MapCameraControl", () => {
  it("mở: zoom 1, ở giữa, bám theo mình", () => {
    const c = new MapCameraControl();
    c.reset({ worldW: 3072, worldH: 2048 });
    expect(c.cam).toEqual({ zoom: 1, cx: 1536, cy: 1024 });
    expect(c.follow).toBe(true);
  });

  it("reset có thể KHÔNG bám (xem bản đồ khác bản đồ mình đứng)", () => {
    const c = new MapCameraControl();
    c.reset({ worldW: 100, worldH: 100 }, false);
    expect(c.follow).toBe(false);
  });

  it("chưa vẽ lần nào (không có khung nhìn): phóng / kéo / chụm không làm gì và không ném lỗi", () => {
    const c = new MapCameraControl();
    const onChange = vi.fn();
    c.onChange = onChange;
    c.zoomBy(2);
    c.pan(10, 10);
    c.pinch({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }, { x: 20, y: 0 });
    expect(c.cam.zoom).toBe(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("phóng: đang bám thì quanh TÂM (mình ở giữa) kể cả khi con trỏ ở chỗ khác; gọi onChange", () => {
    const c = ready();
    const onChange = vi.fn();
    c.onChange = onChange;
    c.zoomBy(MAP_ZOOM_STEP, 10, 10);
    expect(c.cam.zoom).toBeCloseTo(MAP_ZOOM_STEP, 9);
    expect(c.follow).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("kéo: thôi bám theo mình, tâm nhìn đổi; kéo 0 thì bỏ qua (không onChange)", () => {
    const c = ready();
    c.zoomBy(4);
    const onChange = vi.fn();
    c.onChange = onChange;
    const before = { ...c.cam };
    c.pan(0, 0);
    expect(onChange).not.toHaveBeenCalled();
    c.pan(-40, 0);
    expect(c.follow).toBe(false);
    expect(c.cam.cx).toBeGreaterThan(before.cx);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("đang bám: effective đưa tâm nhìn tới vị trí mình; đã kéo tay (không bám): giữ chỗ tay kéo", () => {
    const c = ready();
    c.zoomBy(4);
    const f = c.effective(box, 700, 700);
    expect(f.cx).toBeLessThan(1536); // theo mình về phía tây bắc (đã kẹp)
    c.pan(-30, -30);
    const held = { ...c.cam };
    const g = c.effective(box, 2400, 2400); // mình đi chỗ khác
    expect(g.cx).toBeCloseTo(held.cx, 6);
    expect(g.cy).toBeCloseTo(held.cy, 6);
  });

  it("chụm hai ngón: phóng theo khoảng cách, thôi bám", () => {
    const c = ready();
    c.pinch({ x: 260, y: 300 }, { x: 340, y: 300 }, { x: 220, y: 300 }, { x: 380, y: 300 });
    expect(c.cam.zoom).toBeCloseTo(2, 6);
    expect(c.follow).toBe(false);
  });

  it("Về chỗ mình: bám lại, giữ mức phóng; có onRecenter xử lý (đổi về bản đồ của mình) thì KHÔNG đổi bám", () => {
    const c = ready();
    c.zoomBy(4);
    c.pan(-30, -30);
    expect(c.follow).toBe(false);
    const z = c.cam.zoom;
    c.recenter();
    expect(c.follow).toBe(true);
    expect(c.cam.zoom).toBe(z);
    c.pan(-30, -30);
    c.onRecenter = () => true; // đang xem bản đồ khác: chuyển về bản đồ của mình
    c.recenter();
    expect(c.follow).toBe(false);
    c.onRecenter = () => false;
    c.recenter();
    expect(c.follow).toBe(true);
  });

  it("fit: về zoom 1 ở giữa và bám lại", () => {
    const c = ready();
    c.zoomBy(8);
    c.pan(-100, -100);
    c.fit();
    expect(c.cam.zoom).toBe(1);
    expect(c.follow).toBe(true);
  });

  it("không bao giờ vượt zoom tối đa", () => {
    const c = ready();
    for (let i = 0; i < 40; i++) c.zoomBy(MAP_ZOOM_STEP);
    expect(c.cam.zoom).toBe(MAP_MAX_ZOOM);
  });
});

describe("map-input: wheelZoomFactor", () => {
  it("lăn lên (deltaY âm) phóng, lăn xuống thu; một sự kiện không quá một nấc; không lăn / số rác = 1", () => {
    expect(wheelZoomFactor(-300, 0)).toBe(MAP_ZOOM_STEP);
    expect(wheelZoomFactor(300, 0)).toBeCloseTo(1 / MAP_ZOOM_STEP, 12);
    expect(wheelZoomFactor(-4, 0)).toBeGreaterThan(1);
    expect(wheelZoomFactor(-4, 0)).toBeLessThan(1.02);
    expect(wheelZoomFactor(0, 0)).toBe(1);
    expect(wheelZoomFactor(Number.NaN, 0)).toBe(1);
    expect(wheelZoomFactor(Infinity, 0)).toBe(1);
  });
  it("chế độ dòng / trang: cùng chiều, mạnh hơn điểm ảnh", () => {
    expect(wheelZoomFactor(-1, 1)).toBeGreaterThan(wheelZoomFactor(-1, 0));
    expect(wheelZoomFactor(-1, 2)).toBeGreaterThanOrEqual(wheelZoomFactor(-1, 1));
  });
});
