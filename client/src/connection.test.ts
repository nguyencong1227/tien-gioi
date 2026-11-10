import { describe, it, expect, vi } from "vitest";
import {
  DEFAULT_MAP_ID,
  HAC_PHONG_ID,
  JOIN_WRONG_MAP,
  JOIN_BAD_MAP,
  wrongMapMessage,
} from "@tien-gioi/shared";
import {
  joinWithRedirect,
  getSavedMap,
  saveMap,
  type JoinClient,
  type JoinStorage,
} from "./connection";

class MemoryStorage implements JoinStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

describe("connection helper (joinWithRedirect)", () => {
  it("vào phòng thành công với bản đồ mặc định khi chưa có lưu trữ", async () => {
    const storage = new MemoryStorage();
    const fakeRoom = { sessionId: "s1", reconnectionToken: "t1" };
    const joinOrCreate = vi.fn().mockResolvedValue(fakeRoom);
    const client: JoinClient<typeof fakeRoom> = { joinOrCreate };

    const res = await joinWithRedirect({
      client,
      storage,
      name: "TieuPham",
      secret: "sec123",
    });

    expect(res.room).toBe(fakeRoom);
    expect(res.mapId).toBe(DEFAULT_MAP_ID);
    expect(joinOrCreate).toHaveBeenCalledTimes(1);
    expect(joinOrCreate).toHaveBeenCalledWith("world", {
      name: "TieuPham",
      secret: "sec123",
      mapId: DEFAULT_MAP_ID,
    });
    expect(getSavedMap(storage, "TieuPham")).toBe(DEFAULT_MAP_ID);
  });

  it("vào phòng với bản đồ đã lưu từ trước", async () => {
    const storage = new MemoryStorage();
    saveMap(storage, "TieuPham", HAC_PHONG_ID);

    const fakeRoom = { sessionId: "s2" };
    const joinOrCreate = vi.fn().mockResolvedValue(fakeRoom);
    const client: JoinClient<typeof fakeRoom> = { joinOrCreate };

    const res = await joinWithRedirect({
      client,
      storage,
      name: "TieuPham",
      secret: "sec123",
    });

    expect(res.mapId).toBe(HAC_PHONG_ID);
    expect(joinOrCreate).toHaveBeenCalledWith("world", {
      name: "TieuPham",
      secret: "sec123",
      mapId: HAC_PHONG_ID,
    });
  });

  it("tự động chuyển hướng khi server báo JOIN_WRONG_MAP", async () => {
    const storage = new MemoryStorage();
    const fakeRoom = { sessionId: "s3" };

    // Lần 1: báo sai map (đang ở hac_phong). Lần 2: thành công.
    const joinOrCreate = vi
      .fn()
      .mockRejectedValueOnce({
        code: JOIN_WRONG_MAP,
        message: wrongMapMessage(HAC_PHONG_ID),
      })
      .mockResolvedValueOnce(fakeRoom);

    const client: JoinClient<typeof fakeRoom> = { joinOrCreate };

    const res = await joinWithRedirect({
      client,
      storage,
      name: "TieuPham",
      secret: "sec123",
    });

    expect(res.room).toBe(fakeRoom);
    expect(res.mapId).toBe(HAC_PHONG_ID);
    expect(joinOrCreate).toHaveBeenCalledTimes(2);
    // Đã lưu lại map đúng vào storage
    expect(getSavedMap(storage, "TieuPham")).toBe(HAC_PHONG_ID);
  });

  it("chặn vòng lặp vô hạn khi server báo sai map liên tục quá maxRedirects", async () => {
    const storage = new MemoryStorage();
    const joinOrCreate = vi.fn().mockRejectedValue({
      code: JOIN_WRONG_MAP,
      message: wrongMapMessage(HAC_PHONG_ID),
    });
    const client: JoinClient<any> = { joinOrCreate };

    await expect(
      joinWithRedirect({
        client,
        storage,
        name: "TieuPham",
        secret: "sec123",
        maxRedirects: 2,
      }),
    ).rejects.toThrow("Chuyển hướng bản đồ vượt quá giới hạn");

    expect(joinOrCreate).toHaveBeenCalledTimes(3); // 1 lần đầu + 2 lần redirect
  });

  it("khôi phục khi gặp JOIN_BAD_MAP: xoá map lưu và thử lại DEFAULT_MAP_ID", async () => {
    const storage = new MemoryStorage();
    saveMap(storage, "TieuPham", "map_la_khong_ton_tai");

    const fakeRoom = { sessionId: "s4" };
    const joinOrCreate = vi
      .fn()
      .mockRejectedValueOnce({
        code: JOIN_BAD_MAP,
        message: "bad map",
      })
      .mockResolvedValueOnce(fakeRoom);

    const client: JoinClient<typeof fakeRoom> = { joinOrCreate };

    const res = await joinWithRedirect({
      client,
      storage,
      name: "TieuPham",
      secret: "sec123",
    });

    expect(res.room).toBe(fakeRoom);
    expect(res.mapId).toBe(DEFAULT_MAP_ID);
    expect(joinOrCreate).toHaveBeenCalledTimes(2);
    expect(joinOrCreate).toHaveBeenNthCalledWith(1, "world", {
      name: "TieuPham",
      secret: "sec123",
      mapId: "map_la_khong_ton_tai",
    });
    expect(joinOrCreate).toHaveBeenNthCalledWith(2, "world", {
      name: "TieuPham",
      secret: "sec123",
      mapId: DEFAULT_MAP_ID,
    });
    expect(getSavedMap(storage, "TieuPham")).toBe(DEFAULT_MAP_ID);
  });

  it("ném lỗi ra ngoài nếu gặp lỗi khác không phải sai map", async () => {
    const storage = new MemoryStorage();
    const joinOrCreate = vi.fn().mockRejectedValue({
      code: 409,
      message: "Nhân vật đang đăng nhập",
    });
    const client: JoinClient<any> = { joinOrCreate };

    await expect(
      joinWithRedirect({
        client,
        storage,
        name: "TieuPham",
        secret: "sec123",
      }),
    ).rejects.toEqual({
      code: 409,
      message: "Nhân vật đang đăng nhập",
    });

    expect(joinOrCreate).toHaveBeenCalledTimes(1);
  });
});
