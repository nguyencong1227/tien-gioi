import { describe, it, expect, vi } from "vitest";
import {
  DEFAULT_MAP_ID,
  HAC_PHONG_ID,
  JOIN_CLIENT_OUTDATED,
  JOIN_NOT_IN_RUN,
  JOIN_WRONG_MAP,
  LINH_HU_MAP_ID,
  PROTOCOL_VERSION,
  clientOutdatedMessage,
  roomNameOf,
  wrongMapMessage,
} from "@tien-gioi/shared";
import {
  joinWithRedirect,
  getSavedMap,
  saveMap,
  ClientOutdatedError,
  isClientOutdatedError,
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
  it("vào phòng thành công với bản đồ mặc định khi chưa có lưu trữ (luôn gửi v: PROTOCOL_VERSION)", async () => {
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
    expect(joinOrCreate).toHaveBeenCalledWith(roomNameOf(DEFAULT_MAP_ID), {
      name: "TieuPham",
      secret: "sec123",
      v: PROTOCOL_VERSION,
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
    expect(joinOrCreate).toHaveBeenCalledWith(roomNameOf(HAC_PHONG_ID), {
      name: "TieuPham",
      secret: "sec123",
      v: PROTOCOL_VERSION,
    });
  });

  it("tự động chuyển hướng khi server báo JOIN_WRONG_MAP", async () => {
    const storage = new MemoryStorage();
    const fakeRoom = { sessionId: "s3" };

    // Lần 1: phòng mặc định báo sai map (đang ở hac_phong). Lần 2: vào world_hac_phong thành công.
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
    expect(joinOrCreate).toHaveBeenNthCalledWith(1, roomNameOf(DEFAULT_MAP_ID), {
      name: "TieuPham",
      secret: "sec123",
      v: PROTOCOL_VERSION,
    });
    expect(joinOrCreate).toHaveBeenNthCalledWith(2, roomNameOf(HAC_PHONG_ID), {
      name: "TieuPham",
      secret: "sec123",
      v: PROTOCOL_VERSION,
    });
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

  it("bảo vệ trước map lạ: tự động xoá map lưu không có trong GameMap và vào DEFAULT_MAP_ID", async () => {
    const storage = new MemoryStorage();
    saveMap(storage, "TieuPham", "map_la_khong_ton_tai");

    const fakeRoom = { sessionId: "s4" };
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
    expect(joinOrCreate).toHaveBeenCalledWith(roomNameOf(DEFAULT_MAP_ID), {
      name: "TieuPham",
      secret: "sec123",
      v: PROTOCOL_VERSION,
    });
    expect(getSavedMap(storage, "TieuPham")).toBe(DEFAULT_MAP_ID);
  });

  it("getSavedMap: trả về DEFAULT_MAP_ID và xoá lưu trữ khi mapId không hợp lệ", () => {
    const storage = new MemoryStorage();
    saveMap(storage, "TieuPham", "map_la_khong_ton_tai");
    expect(getSavedMap(storage, "TieuPham")).toBe(DEFAULT_MAP_ID);
    expect(storage.getItem("tien-gioi:map:TieuPham")).toBeNull();
  });

  it("lớp phòng thủ thứ hai: khôi phục về DEFAULT_MAP_ID khi server báo phòng chưa định nghĩa (code 4210)", async () => {
    const storage = new MemoryStorage();
    // Giả sử storage có map hợp lệ nhưng vì lý do nào đó server chưa đăng ký phòng này
    saveMap(storage, "TieuPham", HAC_PHONG_ID);

    const fakeRoom = { sessionId: "s5" };
    const joinOrCreate = vi
      .fn()
      .mockRejectedValueOnce({
        code: 4210,
        message: 'provided room name "world_hac_phong" not defined',
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
    expect(joinOrCreate).toHaveBeenNthCalledWith(1, roomNameOf(HAC_PHONG_ID), {
      name: "TieuPham",
      secret: "sec123",
      v: PROTOCOL_VERSION,
    });
    expect(joinOrCreate).toHaveBeenNthCalledWith(2, roomNameOf(DEFAULT_MAP_ID), {
      name: "TieuPham",
      secret: "sec123",
      v: PROTOCOL_VERSION,
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

  it("vào phòng bằng token phiên ở chế độ tài khoản (JOIN_OPTIONS.token)", async () => {
    const storage = new MemoryStorage();
    const fakeRoom = { sessionId: "s_token" };
    const joinOrCreate = vi.fn().mockResolvedValue(fakeRoom);
    const client: JoinClient<typeof fakeRoom> = { joinOrCreate };

    const result = await joinWithRedirect({
      client,
      storage,
      token: "tok_session_12345",
    });

    expect(result.room).toBe(fakeRoom);
    expect(result.mapId).toBe(DEFAULT_MAP_ID);
    expect(joinOrCreate).toHaveBeenCalledWith(roomNameOf(DEFAULT_MAP_ID), {
      token: "tok_session_12345",
      v: PROTOCOL_VERSION,
    });
  });

  it("vào phòng bí cảnh cụ thể bằng joinById khi có roomId hợp lệ và không ghi saveMap bí cảnh", async () => {
    const storage = new MemoryStorage();
    saveMap(storage, "TieuPham", DEFAULT_MAP_ID);

    const fakeDungeonRoom = { sessionId: "s_dungeon" };
    const joinOrCreate = vi.fn();
    const joinById = vi.fn().mockResolvedValue(fakeDungeonRoom);
    const client: JoinClient<typeof fakeDungeonRoom> = { joinOrCreate, joinById };

    const res = await joinWithRedirect({
      client,
      storage,
      name: "TieuPham",
      secret: "sec123",
      suggestedMapId: LINH_HU_MAP_ID,
      roomId: "room_bi_canh_01",
    });

    expect(res.room).toBe(fakeDungeonRoom);
    expect(res.mapId).toBe(LINH_HU_MAP_ID);
    expect(res.expiredDungeonFallback).toBeUndefined();
    expect(joinById).toHaveBeenCalledTimes(1);
    expect(joinById).toHaveBeenCalledWith("room_bi_canh_01", {
      name: "TieuPham",
      secret: "sec123",
      v: PROTOCOL_VERSION,
    });
    expect(joinOrCreate).not.toHaveBeenCalled();
    // Không lưu map bí cảnh vào storage (vẫn giữ DEFAULT_MAP_ID)
    expect(getSavedMap(storage, "TieuPham")).toBe(DEFAULT_MAP_ID);
  });

  it("khôi phục về DEFAULT_MAP_ID kèm expiredDungeonFallback khi joinById báo JOIN_NOT_IN_RUN (422)", async () => {
    const storage = new MemoryStorage();
    const fakeWorldRoom = { sessionId: "s_world" };
    const joinById = vi.fn().mockRejectedValueOnce({
      code: JOIN_NOT_IN_RUN,
      message: "not_in_run",
    });
    const joinOrCreate = vi.fn().mockResolvedValueOnce(fakeWorldRoom);
    const client: JoinClient<typeof fakeWorldRoom> = { joinOrCreate, joinById };

    const res = await joinWithRedirect({
      client,
      storage,
      token: "tok_abc",
      suggestedMapId: LINH_HU_MAP_ID,
      roomId: "room_expired_99",
    });

    expect(res.room).toBe(fakeWorldRoom);
    expect(res.mapId).toBe(DEFAULT_MAP_ID);
    expect(res.expiredDungeonFallback).toBe(true);
    expect(joinById).toHaveBeenCalledTimes(1);
    expect(joinOrCreate).toHaveBeenCalledTimes(1);
    expect(joinOrCreate).toHaveBeenCalledWith(roomNameOf(DEFAULT_MAP_ID), {
      token: "tok_abc",
      v: PROTOCOL_VERSION,
    });
  });

  it("từ chối roomId sai định dạng (không khớp ROOM_ID_RE) và đưa về DEFAULT_MAP_ID", async () => {
    const storage = new MemoryStorage();
    const fakeWorldRoom = { sessionId: "s_safe" };
    const joinById = vi.fn();
    const joinOrCreate = vi.fn().mockResolvedValueOnce(fakeWorldRoom);
    const client: JoinClient<typeof fakeWorldRoom> = { joinOrCreate, joinById };

    const res = await joinWithRedirect({
      client,
      storage,
      name: "TieuPham",
      secret: "sec123",
      suggestedMapId: LINH_HU_MAP_ID,
      roomId: "../../bad room id!",
    });

    expect(res.room).toBe(fakeWorldRoom);
    expect(res.mapId).toBe(DEFAULT_MAP_ID);
    expect(res.expiredDungeonFallback).toBe(true);
    expect(joinById).not.toHaveBeenCalled();
    expect(joinOrCreate).toHaveBeenCalledWith(roomNameOf(DEFAULT_MAP_ID), {
      name: "TieuPham",
      secret: "sec123",
      v: PROTOCOL_VERSION,
    });
  });

  it("getSavedMap: tự động dọn nếu trong storage có mapId là bí cảnh", () => {
    const storage = new MemoryStorage();
    storage.setItem("tien-gioi:map:TieuPham", LINH_HU_MAP_ID);
    expect(getSavedMap(storage, "TieuPham")).toBe(DEFAULT_MAP_ID);
    expect(storage.getItem("tien-gioi:map:TieuPham")).toBeNull();
  });

  // ---------- M4 2.5: PROTOCOL_VERSION & Client Outdated Tests ----------

  it("từ chối và ném ClientOutdatedError dứt khoát khi server báo JOIN_CLIENT_OUTDATED (426) - không thử lại", async () => {
    const storage = new MemoryStorage();
    const joinOrCreate = vi.fn().mockRejectedValue({
      code: JOIN_CLIENT_OUTDATED,
      message: clientOutdatedMessage(2),
    });
    const client: JoinClient<any> = { joinOrCreate };

    let caughtErr: any;
    try {
      await joinWithRedirect({
        client,
        storage,
        name: "TieuPham",
        secret: "sec123",
      });
    } catch (err) {
      caughtErr = err;
    }

    expect(caughtErr).toBeInstanceOf(ClientOutdatedError);
    expect(isClientOutdatedError(caughtErr)).toBe(true);
    expect(caughtErr.minVersion).toBe(2);
    expect(caughtErr.code).toBe(426);
    // KHÔNG thử lại: chỉ gọi joinOrCreate ĐÚNG 1 LẦN
    expect(joinOrCreate).toHaveBeenCalledTimes(1);
    expect(joinOrCreate).toHaveBeenCalledWith(roomNameOf(DEFAULT_MAP_ID), {
      name: "TieuPham",
      secret: "sec123",
      v: PROTOCOL_VERSION,
    });
  });

  it("vẫn ném ClientOutdatedError dứt khoát khi message bị hỏng hoặc thiếu (minVersion = 0)", async () => {
    const storage = new MemoryStorage();
    const joinOrCreate = vi.fn().mockRejectedValue({
      code: JOIN_CLIENT_OUTDATED,
      message: "corrupted_message_123",
    });
    const client: JoinClient<any> = { joinOrCreate };

    let caughtErr: any;
    try {
      await joinWithRedirect({
        client,
        storage,
        token: "tok_session",
      });
    } catch (err) {
      caughtErr = err;
    }

    expect(isClientOutdatedError(caughtErr)).toBe(true);
    expect(caughtErr.minVersion).toBe(0);
    expect(joinOrCreate).toHaveBeenCalledTimes(1);
  });

  it("JOIN_CLIENT_OUTDATED không bị lẫn với JOIN_WRONG_MAP và không chạy vòng chuyển hướng", async () => {
    const storage = new MemoryStorage();
    saveMap(storage, "TieuPham", HAC_PHONG_ID);

    const joinOrCreate = vi.fn().mockRejectedValue({
      code: JOIN_CLIENT_OUTDATED,
      message: clientOutdatedMessage(3),
    });
    const client: JoinClient<any> = { joinOrCreate };

    await expect(
      joinWithRedirect({
        client,
        storage,
        name: "TieuPham",
        secret: "sec123",
        maxRedirects: 5,
      }),
    ).rejects.toThrow("client_outdated:3");

    // Tuyệt đối không thử lại dù maxRedirects = 5
    expect(joinOrCreate).toHaveBeenCalledTimes(1);
    // Không làm hỏng map đã lưu trong storage
    expect(storage.getItem("tien-gioi:map:TieuPham")).toBe(HAC_PHONG_ID);
  });
});
