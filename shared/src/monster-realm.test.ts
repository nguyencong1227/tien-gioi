// Bảng bậc quái `MONSTER_REALM` (chuyển từ book-drop-realm.test.ts sang shared, #1420): hàm tra không tin tên lạ, mọi bậc nằm trong thang `REALMS`.
import { describe, expect, it } from "vitest";
import { MONSTER_BY_ID, MONSTER_REALM, REALMS, monsterRealmOf } from "./index";

describe("monster-realm: bậc quái khai tường minh", () => {
  it("monsterRealmOf trả đúng bậc đã khai, và undefined cho id lạ kể cả tên thuộc tính của Object", () => {
    expect(monsterRealmOf("ho")).toBe(2);
    expect(monsterRealmOf("han_lang")).toBe(4);
    for (const id of ["constructor", "toString", "__proto__", "hasOwnProperty", "khong_co", ""])
      expect(monsterRealmOf(id), id).toBeUndefined();
  });

  it("mọi bậc là số nguyên trong thang REALMS và thuộc quái có thật", () => {
    expect(Object.keys(MONSTER_REALM).length).toBeGreaterThan(0);
    for (const [id, realm] of Object.entries(MONSTER_REALM)) {
      expect(MONSTER_BY_ID[id], `${id} không phải quái có thật`).toBeDefined();
      expect(Number.isInteger(realm), id).toBe(true);
      expect(realm, id).toBeGreaterThanOrEqual(0);
      expect(realm, id).toBeLessThan(REALMS.length);
    }
  });
});
