// Cờ bản đồ sửa tay (S6): `isHandEditedTiled`, và hiện CHƯA bản đồ thật nào sửa tay (nên `map:bake --check` và test "giống seed" vẫn chạy cho cả bốn).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PROCEDURAL_MAPS, type TiledMap } from "@tien-gioi/shared";
import { HAND_EDITED_PROPERTY, isHandEditedTiled } from "./map-hand-edited";

const mapsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../shared/maps");
const withProps = (properties: unknown) => ({ type: "map", properties });

describe("isHandEditedTiled", () => {
  it("chỉ thuộc tính `handEdited` bằng boolean true mới tính", () => {
    expect(isHandEditedTiled(withProps([{ name: HAND_EDITED_PROPERTY, value: true }]))).toBe(true);
    expect(
      isHandEditedTiled(
        withProps([
          { name: "id", value: "x" },
          { name: "handEdited", value: true },
        ]),
      ),
    ).toBe(true);
  });

  it("false, thiếu, sai kiểu (chuỗi 'true', số 1), tên khác, dữ liệu lạ: KHÔNG tính và không ném", () => {
    for (const bad of [
      withProps([{ name: "handEdited", value: false }]),
      withProps([{ name: "handEdited", value: "true" }]),
      withProps([{ name: "handEdited", value: 1 }]),
      withProps([{ name: "handedited", value: true }]),
      withProps([{ name: "other", value: true }]),
      withProps([]),
      withProps(undefined),
      withProps("handEdited"),
      withProps([null, 3, "x"]),
      { type: "map" },
      null,
      undefined,
      5,
      "handEdited",
      [],
    ])
      expect(isHandEditedTiled(bad), JSON.stringify(bad)).toBe(false);
  });

  it("tên thuộc tính là `handEdited` (shared/src/tiled-maps.test.ts đọc cùng tên)", () => {
    expect(HAND_EDITED_PROPERTY).toBe("handEdited");
  });
});

describe("bản đồ thật", () => {
  it("cờ NHẤT QUÁN giữa tệp soạn và bản chạy logic của từng bản đồ (đặt cờ ở tệp soạn mà quên `map:build` thì bản chạy thiếu cờ: `map:bake` sẽ ghi đè bản sửa tay)", () => {
    for (const { id } of PROCEDURAL_MAPS) {
      const full = isHandEditedTiled(
        JSON.parse(readFileSync(path.join(mapsDir, `${id}.json`), "utf8")),
      );
      const logic = isHandEditedTiled(
        JSON.parse(readFileSync(path.join(mapsDir, `${id}.logic.json`), "utf8")),
      );
      expect(
        logic,
        `${id}: ${id}.logic.json phải khớp cờ của ${id}.json (chạy npm run map:build -w server -- ${id})`,
      ).toBe(full);
    }
  });

  it("cờ đi từ tệp soạn sang bản chạy logic: `buildLogicRuntimeMap` giữ thuộc tính bản đồ", async () => {
    const { buildLogicRuntimeMap } = await import("./map-builder");
    const src = JSON.parse(readFileSync(path.join(mapsDir, "lac_ha.json"), "utf8")) as TiledMap;
    const marked: TiledMap = {
      ...src,
      properties: [...(src.properties ?? []), { name: HAND_EDITED_PROPERTY, value: true }],
    };
    expect(isHandEditedTiled(marked)).toBe(true);
    expect(isHandEditedTiled(buildLogicRuntimeMap(marked))).toBe(true);
  });
});
