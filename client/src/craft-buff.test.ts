import { describe, expect, it } from "vitest";
import { STATUSES, type StatusEntry } from "@tien-gioi/shared";
import {
  USE_TOAST_WINDOW_MS,
  craftBuffNames,
  isCraftKind,
  travelConfirmText,
  useSuccessText,
} from "./craft-buff";

describe("isCraftKind: loại trạng thái đến từ chế phẩm", () => {
  it("hộ đạo / tăng cường chiêu / giảm hồi chiêu là chế phẩm; buff chiêu và trạng thái có hại thì không", () => {
    for (const k of ["breakAid", "amp", "cdr"]) expect(isCraftKind(k), k).toBe(true);
    for (const k of ["haste", "shield", "regen", "dot", "slow", "vuln", "stun", "", "lạ"])
      expect(isCraftKind(k), k).toBe(false);
  });
  it("trong bảng STATUSES hiện có: chỉ đan hộ đạo là chế phẩm (không buff chiêu nào bị tính nhầm)", () => {
    expect(STATUSES.filter((s) => isCraftKind(s.kind)).map((s) => s.id)).toEqual(["dao_ho"]);
  });
});

describe("craftBuffNames + travelConfirmText: hộp xác nhận qua cổng", () => {
  it("có chip hộ đạo: hỏi, nêu tên", () => {
    const names = craftBuffNames([["dao_ho", 600_000, 0.15]]);
    expect(names).toEqual(["Hộ đạo"]);
    expect(travelConfirmText(names)).toBe("Qua cổng sẽ mất Hộ đạo. Vẫn đi?");
  });
  it("KHÔNG hỏi vì buff của chiêu (haste / shield / regen) hay trạng thái có hại", () => {
    expect(
      craftBuffNames([
        ["haste", 5000, 0.3],
        ["shield", 4000, 0.2],
        ["regen", 3000],
        ["burn", 2000],
      ]),
    ).toEqual([]);
    expect(travelConfirmText([])).toBeNull();
  });
  it("lẫn buff chiêu và chế phẩm: chỉ nêu chế phẩm; không trùng tên", () => {
    expect(
      craftBuffNames([
        ["haste", 5000, 0.3],
        ["dao_ho", 600_000, 0.15],
        ["dao_ho", 500_000, 0.1],
      ]),
    ).toEqual(["Hộ đạo"]);
  });
  it("nhiều tên nối bằng dấu phẩy", () => {
    expect(travelConfirmText(["Hộ đạo", "Cuồng lực"])).toBe(
      "Qua cổng sẽ mất Hộ đạo, Cuồng lực. Vẫn đi?",
    );
  });
  it("mục hết hạn / id lạ / số hỏng bị bỏ, không ném lỗi", () => {
    expect(
      craftBuffNames([
        ["dao_ho", 0, 0.15],
        ["dao_ho", -5, 0.15],
        ["dao_ho", Number.NaN, 0.15],
        ["khong_co", 9000],
      ] as StatusEntry[]),
    ).toEqual([]);
  });
});

describe("useSuccessText: toast khi dùng đan thành công", () => {
  const none = new Set<string>();
  const dao: StatusEntry[] = [["dao_ho", 900_000, 0.15]];

  it("chip chế phẩm MỚI hiện ngay sau một lần bấm Dùng: báo tác dụng + thời gian", () => {
    expect(useSuccessText(none, dao, 1000, 1500)).toBe(
      "Hộ đạo: cộng 15% xác suất đột phá lần kế trong 15 phút",
    );
  });
  it("thời gian không chẵn phút nói cả giây", () => {
    expect(useSuccessText(none, [["dao_ho", 90_000, 0.1]], 0, 100)).toBe(
      "Hộ đạo: cộng 10% xác suất đột phá lần kế trong 1 phút 30 giây",
    );
  });
  it("chưa bấm Dùng (null) hoặc bấm đã lâu: im (danh sách status đến vì lý do khác)", () => {
    expect(useSuccessText(none, dao, null, 1000)).toBeNull();
    expect(useSuccessText(none, dao, 0, USE_TOAST_WINDOW_MS)).not.toBeNull();
    expect(useSuccessText(none, dao, 0, USE_TOAST_WINDOW_MS + 1)).toBeNull();
  });
  it("đồng hồ lùi (now < useAt) coi như không phải do lần bấm đó", () => {
    expect(useSuccessText(none, dao, 5000, 1000)).toBeNull();
  });
  it("hiệu lực ĐÃ có từ trước (làm mới, gửi lại danh sách): im", () => {
    expect(useSuccessText(new Set(["dao_ho"]), dao, 0, 100)).toBeNull();
  });
  it("chỉ buff của chiêu hiện ra sau khi bấm (không phải chế phẩm): im", () => {
    expect(useSuccessText(none, [["haste", 5000, 0.3]], 0, 100)).toBeNull();
  });
  it("mục hết hạn / hỏng không báo", () => {
    expect(useSuccessText(none, [["dao_ho", 0, 0.15]], 0, 100)).toBeNull();
    expect(useSuccessText(none, [["khong_co", 9000]] as StatusEntry[], 0, 100)).toBeNull();
  });
});
