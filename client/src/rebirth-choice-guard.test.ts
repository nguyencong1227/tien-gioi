import { describe, expect, it, vi } from "vitest";

// Chốt chặn cuối của `safeRebirthChoice`: nếu hàm kiểm của máy chủ (shared `validateRebirth`) đổi luật mà client chưa kịp theo (hoặc dữ liệu lạ lọt qua mọi lớp kẹp),
// client LÙI về lựa chọn tối thiểu (Phàm gia, không giữ gì, giữ nguyên chiêu khắc), tuyệt đối không gửi thứ đã biết là bị từ chối. Mô phỏng bằng cách ép validator trả null.
vi.mock("@tien-gioi/shared", async (orig) => {
  const real = await orig<typeof import("@tien-gioi/shared")>();
  return { ...real, validateRebirth: () => null };
});

import { DEFAULT_ORIGIN } from "@tien-gioi/shared";
import { safeRebirthChoice } from "./rebirth-choice";

describe("safeRebirthChoice: chốt chặn validateRebirth", () => {
  it("validator của máy chủ vẫn từ chối: lùi về lựa chọn tối thiểu, báo", () => {
    const r = safeRebirthChoice(
      { unlocks: { ky_vat: 2, khac: 1 }, origins: ["kiem_khach"] },
      { keepable: ["lang_nha_kiem"], engravable: ["ung_trao"] },
      { origin: "kiem_khach", keep: ["lang_nha_kiem"], engrave: ["ung_trao"] },
    );
    expect(r.choice).toEqual({ origin: DEFAULT_ORIGIN, keep: [] });
    expect("engrave" in r.choice).toBe(false);
    expect(r.dropped.join(" ")).toMatch(/mặc định/);
  });
});
