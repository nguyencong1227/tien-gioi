import { describe, expect, it } from "vitest";
import {
  JOIN_BAD_TOKEN,
  JOIN_CLIENT_OUTDATED,
  JOIN_NEED_CHARACTER,
  JOIN_NOT_IN_RUN,
  JOIN_WRONG_MAP,
  MIN_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  clientOutdatedMessage,
  isClientOutdated,
  parseClientOutdated,
  parseWrongMap,
  protocolOf,
  wrongMapMessage,
} from "./index";

describe("phiên bản giao thức (M4 2.5)", () => {
  it("hằng số hợp lệ: số nguyên không âm, bản hiện tại không thấp hơn mức tối thiểu", () => {
    expect(Number.isSafeInteger(PROTOCOL_VERSION) && PROTOCOL_VERSION >= 1).toBe(true);
    expect(Number.isSafeInteger(MIN_PROTOCOL_VERSION) && MIN_PROTOCOL_VERSION >= 0).toBe(true);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(MIN_PROTOCOL_VERSION);
  });

  it("mã lỗi 426 không đụng mã vào phòng đã dùng", () => {
    const used = [
      400,
      403,
      409,
      JOIN_BAD_TOKEN,
      JOIN_WRONG_MAP,
      JOIN_NOT_IN_RUN,
      JOIN_NEED_CHARACTER,
    ];
    expect(used).not.toContain(JOIN_CLIENT_OUTDATED);
    expect(JOIN_CLIENT_OUTDATED).toBe(426);
  });

  it("protocolOf: số nguyên không âm giữ nguyên; thiếu / sai kiểu / âm / lẻ / NaN / vô hạn / quá lớn thành 0", () => {
    for (const ok of [0, 1, 2, 17, Number.MAX_SAFE_INTEGER]) expect(protocolOf(ok)).toBe(ok);
    for (const bad of [
      undefined,
      null,
      NaN,
      Infinity,
      -Infinity,
      -1,
      -0.5,
      1.5,
      2 ** 53,
      "1",
      "",
      {},
      [],
      [1],
      true,
      () => 1,
      "constructor",
    ])
      expect(protocolOf(bad), String(bad)).toBe(0);
  });

  it("isClientOutdated: thấp hơn mức tối thiểu thì quá cũ; bằng hoặc cao hơn (kể cả client MỚI HƠN server) thì nhận", () => {
    // mặc định MIN = 0: chưa ai bị từ chối (bot / bản cũ không gửi `v` vẫn vào được)
    for (const v of [undefined, 0, 1, PROTOCOL_VERSION, PROTOCOL_VERSION + 5, "x", NaN])
      expect(isClientOutdated(v, 0), String(v)).toBe(false);
    // khi vận hành nâng mức tối thiểu lên 2
    expect(isClientOutdated(undefined, 2)).toBe(true); // không gửi `v` = client cũ
    expect(isClientOutdated(0, 2)).toBe(true);
    expect(isClientOutdated(1, 2)).toBe(true);
    expect(isClientOutdated("2", 2)).toBe(true); // sai kiểu không qua mặt được
    expect(isClientOutdated(NaN, 2)).toBe(true);
    expect(isClientOutdated(2, 2)).toBe(false);
    expect(isClientOutdated(3, 2)).toBe(false);
    expect(isClientOutdated(1000, 2)).toBe(false); // client mới hơn server: nhận
    expect(isClientOutdated(undefined)).toBe(isClientOutdated(undefined, MIN_PROTOCOL_VERSION));
  });

  it("thông điệp lỗi: đi vòng được; mã khác không bị nhận nhầm; thông điệp hỏng vẫn là 'client quá cũ'", () => {
    for (const min of [0, 1, 2, 40]) {
      expect(parseClientOutdated(JOIN_CLIENT_OUTDATED, clientOutdatedMessage(min))).toBe(min);
    }
    expect(clientOutdatedMessage()).toBe(`client_outdated:${MIN_PROTOCOL_VERSION}`);
    for (const code of [400, 403, 409, 421, 422, 423, 401, undefined, "426", null])
      expect(parseClientOutdated(code, "client_outdated:2"), String(code)).toBeUndefined();
    for (const msg of [
      undefined,
      null,
      5,
      "",
      "wrong_map:lac_ha",
      "client_outdated:abc",
      "client_outdated:-3",
    ])
      expect(parseClientOutdated(JOIN_CLIENT_OUTDATED, msg), String(msg)).toBe(0);
    // không lẫn với lỗi `wrong_map` (client xử lý hai lỗi bằng hai nhánh)
    expect(parseWrongMap(JOIN_CLIENT_OUTDATED, clientOutdatedMessage(2))).toBeUndefined();
    expect(parseClientOutdated(JOIN_WRONG_MAP, wrongMapMessage("lac_ha"))).toBeUndefined();
  });
});
