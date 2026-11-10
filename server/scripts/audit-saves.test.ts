import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  COIN_CAP,
  DEFAULT_MAP,
  INVENTORY_SLOTS,
  ITEM_BY_ID,
  REALMS,
  getMap,
} from "@tien-gioi/shared";
import {
  auditPlayerSaveData,
  auditSavesDirectory,
  auditSoulSaveData,
  MAX_FILE_SIZE,
  show,
} from "./audit-saves.js";

function hashFileSha256(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

describe("audit-saves (Issue #112)", () => {
  let tmpDir: string;

  const validPlayer = {
    name: "Tiểu Đạo Sĩ",
    secretHash: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
    realm: 0,
    tier: 0,
    exp: 150,
    coin: 200,
    x: 1536,
    y: 1536,
    createdAt: "2026-11-10T00:00:00.000Z",
    updatedAt: "2026-11-10T00:00:00.000Z",
    inventory: [
      { itemId: "hoi_huyet_dan", qty: 3 },
      { itemId: "long_tho", qty: 2 },
    ],
    equipment: {
      weapon: "lang_nha_kiem",
      robe: "tho_nhung_bao",
      talisman: "",
    },
    quests: {
      active: [{ id: "tru_tho", step: 0, progress: 0 }],
      done: ["nhap_the"],
      daily: {
        lang_hai: "2026-11-10T00:00:00.000Z",
      },
    },
  };

  beforeEach(() => {
    tmpDir = path.join(
      os.tmpdir(),
      `tien-gioi-audit-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("thư mục sạch -> báo cáo sạch (cleanFiles = totalFiles, errorFiles = 0)", () => {
    const file1 = path.join(tmpDir, "p1.json");
    const file2 = path.join(tmpDir, "p2.json");
    writeFileSync(file1, JSON.stringify(validPlayer, null, 2));
    writeFileSync(
      file2,
      JSON.stringify(
        {
          ...validPlayer,
          name: "Lão Tiên Sinh",
          coin: 1000,
          inventory: [],
        },
        null,
        2,
      ),
    );

    const report = auditSavesDirectory(tmpDir);
    expect(report.totalFiles).toBe(2);
    expect(report.cleanFiles).toBe(2);
    expect(report.errorFiles).toBe(0);
    expect(Object.keys(report.errorsByCode).length).toBe(0);
    expect(report.failedFiles.length).toBe(0);
  });

  it("không sửa đổi file (chỉ đọc) và kết quả không để lộ secretHash", () => {
    const file = path.join(tmpDir, "secret-test.json");
    const originalJson = JSON.stringify(validPlayer, null, 2);
    writeFileSync(file, originalJson);

    const beforeHash = hashFileSha256(file);
    const report = auditSavesDirectory(tmpDir);
    const afterHash = hashFileSha256(file);

    expect(afterHash).toBe(beforeHash);
    const reportStr = JSON.stringify(report);
    expect(reportStr).not.toContain(validPlayer.secretHash);
  });

  it("thư mục không tồn tại -> ném lỗi để CLI trả mã 2", () => {
    const nonExistentDir = path.join(tmpDir, "does-not-exist");
    expect(() => auditSavesDirectory(nonExistentDir)).toThrow(/không tồn tại/);
  });

  it("symlink trỏ tới file hợp lệ -> báo lỗi not_regular_file, không đọc/treo", () => {
    const realFile = path.join(tmpDir, "real.json");
    writeFileSync(realFile, JSON.stringify(validPlayer));
    const symlinkFile = path.join(tmpDir, "link.json");
    symlinkSync(realFile, symlinkFile);

    const report = auditSavesDirectory(tmpDir);
    expect(report.totalFiles).toBe(2);
    expect(report.cleanFiles).toBe(1);
    expect(report.errorFiles).toBe(1);
    expect(report.errorsByCode.not_regular_file).toBe(1);
    const linkFail = report.failedFiles.find((f) => f.file === "link.json");
    expect(linkFail?.errors.map((e) => e.code)).toContain("not_regular_file");
  });

  describe("kiểm tra từng loại lỗi vi phạm dữ liệu", () => {
    it("file > 1 MB -> file_too_large", () => {
      const errors = auditPlayerSaveData("{}", MAX_FILE_SIZE + 100);
      expect(errors.map((e) => e.code)).toContain("file_too_large");
    });

    it("JSON hỏng cú pháp -> invalid_json", () => {
      const raw = "{ name: 'loi cú phap' ";
      const errors = auditPlayerSaveData(raw, raw.length);
      expect(errors.map((e) => e.code)).toContain("invalid_json");
    });

    it("JSON không phải object -> not_an_object", () => {
      const errors = auditPlayerSaveData("null", 4);
      expect(errors.map((e) => e.code)).toContain("not_an_object");

      const errorsArr = auditPlayerSaveData("[]", 2);
      expect(errorsArr.map((e) => e.code)).toContain("not_an_object");
    });

    it("tên không hợp lệ -> invalid_name", () => {
      const p = { ...validPlayer, name: "A" }; // Quá ngắn (< 2)
      const raw = JSON.stringify(p);
      const errors = auditPlayerSaveData(raw, raw.length);
      expect(errors.map((e) => e.code)).toContain("invalid_name");
    });

    it("secretHash ngắn hoặc không đúng hex 64 -> invalid_secret_hash", () => {
      const p1 = { ...validPlayer, secretHash: "abc123" };
      const raw1 = JSON.stringify(p1);
      expect(auditPlayerSaveData(raw1, raw1.length).map((e) => e.code)).toContain(
        "invalid_secret_hash",
      );

      const p2 = { ...validPlayer, secretHash: "z".repeat(64) }; // z không phải ký tự hex
      const raw2 = JSON.stringify(p2);
      expect(auditPlayerSaveData(raw2, raw2.length).map((e) => e.code)).toContain(
        "invalid_secret_hash",
      );
    });

    it("realm hoặc tier vượt ngoài khoảng -> invalid_realm, invalid_tier", () => {
      const pRealm = { ...validPlayer, realm: REALMS.length + 5 };
      const rawR = JSON.stringify(pRealm);
      expect(auditPlayerSaveData(rawR, rawR.length).map((e) => e.code)).toContain("invalid_realm");

      const pTier = { ...validPlayer, tier: 999 };
      const rawT = JSON.stringify(pTier);
      expect(auditPlayerSaveData(rawT, rawT.length).map((e) => e.code)).toContain("invalid_tier");
    });

    it("exp âm hoặc không hữu hạn -> invalid_exp", () => {
      const pNegative = { ...validPlayer, exp: -10 };
      const rawNeg = JSON.stringify(pNegative);
      expect(auditPlayerSaveData(rawNeg, rawNeg.length).map((e) => e.code)).toContain(
        "invalid_exp",
      );

      const rawNan = JSON.stringify({ ...validPlayer, exp: null });
      expect(auditPlayerSaveData(rawNan, rawNan.length).map((e) => e.code)).toContain(
        "invalid_exp",
      );
    });

    it("coin âm, số lẻ hoặc vượt trần COIN_CAP -> coin_out_of_range", () => {
      const pNegative = { ...validPlayer, coin: -1 };
      const rawNeg = JSON.stringify(pNegative);
      expect(auditPlayerSaveData(rawNeg, rawNeg.length).map((e) => e.code)).toContain(
        "coin_out_of_range",
      );

      const pFloat = { ...validPlayer, coin: 10.5 };
      const rawFloat = JSON.stringify(pFloat);
      expect(auditPlayerSaveData(rawFloat, rawFloat.length).map((e) => e.code)).toContain(
        "coin_out_of_range",
      );

      const pCap = { ...validPlayer, coin: COIN_CAP + 1 };
      const rawCap = JSON.stringify(pCap);
      expect(auditPlayerSaveData(rawCap, rawCap.length).map((e) => e.code)).toContain(
        "coin_out_of_range",
      );
    });

    it("vị trí x, y ngoài bản đồ hoặc nằm trong ô chặn -> pos_out_of_bounds, pos_blocked", () => {
      const pOutOfBounds = { ...validPlayer, x: DEFAULT_MAP.worldW + 500, y: 1536 };
      const rawOut = JSON.stringify(pOutOfBounds);
      expect(auditPlayerSaveData(rawOut, rawOut.length).map((e) => e.code)).toContain(
        "pos_out_of_bounds",
      );

      // Toạ độ mép nước hoặc góc bị chặn (0, 0 là ô chặn mép bản đồ)
      const pBlocked = { ...validPlayer, x: 0, y: 0 };
      const rawBlocked = JSON.stringify(pBlocked);
      expect(auditPlayerSaveData(rawBlocked, rawBlocked.length).map((e) => e.code)).toContain(
        "pos_blocked",
      );
    });

    it("mapId lạ hoặc không hợp lệ -> invalid_map_id (#123 Bước 0d, #141)", () => {
      // mapId chuẩn: lac_ha -> hợp lệ, không có lỗi invalid_map_id
      const pValid = { ...validPlayer, mapId: "lac_ha" };
      const rawValid = JSON.stringify(pValid);
      expect(auditPlayerSaveData(rawValid, rawValid.length).map((e) => e.code)).not.toContain(
        "invalid_map_id",
      );

      // mapId bản đồ thứ hai: hac_phong -> hợp lệ (#141)
      const pHacPhong = {
        ...validPlayer,
        mapId: "hac_phong",
        x: 2048,
        y: 2944, // Trạm Thanh Lộ Trạm an toàn
      };
      const rawHacPhong = JSON.stringify(pHacPhong);
      const errorsHp = auditPlayerSaveData(rawHacPhong, rawHacPhong.length);
      expect(errorsHp.map((e) => e.code)).not.toContain("invalid_map_id");
      expect(errorsHp.map((e) => e.code)).not.toContain("pos_out_of_bounds");
      expect(errorsHp.map((e) => e.code)).not.toContain("pos_blocked");

      // mapId lạ không nằm trong MAPS
      for (const badMap of ["bi_canh_la", "khong_ton_tai", "__proto__", "constructor", 123]) {
        const pBad = { ...validPlayer, mapId: badMap };
        const rawBad = JSON.stringify(pBad);
        const errs = auditPlayerSaveData(rawBad, rawBad.length);
        expect(
          errs.map((e) => e.code),
          `mapId: ${badMap}`,
        ).toContain("invalid_map_id");
        const msg = errs.find((e) => e.code === "invalid_map_id")!.message;
        expect(msg).toContain("server sẽ đưa về lac_ha");
      }
    });

    it("toạ độ trên bản đồ thứ hai hac_phong tuân thủ đúng ranh giới và ô chặn (#141)", () => {
      const hacPhong = getMap("hac_phong")!;
      expect(hacPhong).toBeDefined();

      // Vượt quá kích thước Hắc Phong Cốc (128x96 ô = 4096x3072 px)
      const pOutOfBoundsHp = {
        ...validPlayer,
        mapId: "hac_phong",
        x: hacPhong.worldW + 200,
        y: 1500,
      };
      const rawOut = JSON.stringify(pOutOfBoundsHp);
      const errsOut = auditPlayerSaveData(rawOut, rawOut.length);
      expect(errsOut.map((e) => e.code)).toContain("pos_out_of_bounds");
      expect(errsOut.find((e) => e.code === "pos_out_of_bounds")!.message).toContain(
        `${hacPhong.worldW}x${hacPhong.worldH}`,
      );

      // Toạ độ góc vách đá mép bản đồ (0, 0) trên Hắc Phong Cốc
      const pBlockedHp = { ...validPlayer, mapId: "hac_phong", x: 0, y: 0 };
      const rawBlocked = JSON.stringify(pBlockedHp);
      const errsBlocked = auditPlayerSaveData(rawBlocked, rawBlocked.length);
      expect(errsBlocked.map((e) => e.code)).toContain("pos_blocked");
      expect(errsBlocked.find((e) => e.code === "pos_blocked")!.message).toContain(
        hacPhong.def.name,
      );
    });

    it("ngày tháng createdAt/updatedAt hỏng -> invalid_date", () => {
      const p = { ...validPlayer, createdAt: "khong-phai-ngay" };
      const raw = JSON.stringify(p);
      expect(auditPlayerSaveData(raw, raw.length).map((e) => e.code)).toContain("invalid_date");
    });

    it("túi đồ vượt quá INVENTORY_SLOTS ô -> inv_too_many_slots, không phải mảng -> inv_not_array", () => {
      const pNotArr = { ...validPlayer, inventory: "khong-phai-mang" };
      const rawNotArr = JSON.stringify(pNotArr);
      expect(auditPlayerSaveData(rawNotArr, rawNotArr.length).map((e) => e.code)).toContain(
        "inv_not_array",
      );

      const p = {
        ...validPlayer,
        inventory: Array(INVENTORY_SLOTS + 5).fill({ itemId: "hoi_huyet_dan", qty: 1 }),
      };
      const raw = JSON.stringify(p);
      expect(auditPlayerSaveData(raw, raw.length).map((e) => e.code)).toContain(
        "inv_too_many_slots",
      );
    });

    it("itemId lạ hoặc 'constructor' trong túi -> unknown_item", () => {
      const pUnknown = {
        ...validPlayer,
        inventory: [{ itemId: "item_khong_ton_tai_123", qty: 1 }],
      };
      const rawU = JSON.stringify(pUnknown);
      expect(auditPlayerSaveData(rawU, rawU.length).map((e) => e.code)).toContain("unknown_item");

      const pCtor = {
        ...validPlayer,
        inventory: [{ itemId: "constructor", qty: 1 }],
      };
      const rawCtor = JSON.stringify(pCtor);
      expect(auditPlayerSaveData(rawCtor, rawCtor.length).map((e) => e.code)).toContain(
        "unknown_item",
      );
    });

    it("qty ô đồ = 0, lẻ, hoặc vượt stack -> qty_out_of_range", () => {
      const pZero = {
        ...validPlayer,
        inventory: [{ itemId: "hoi_huyet_dan", qty: 0 }],
      };
      const rawZero = JSON.stringify(pZero);
      expect(auditPlayerSaveData(rawZero, rawZero.length).map((e) => e.code)).toContain(
        "qty_out_of_range",
      );

      const pFloat = {
        ...validPlayer,
        inventory: [{ itemId: "hoi_huyet_dan", qty: 2.5 }],
      };
      const rawFloat = JSON.stringify(pFloat);
      expect(auditPlayerSaveData(rawFloat, rawFloat.length).map((e) => e.code)).toContain(
        "qty_out_of_range",
      );

      const maxStack = ITEM_BY_ID["hoi_huyet_dan"].stack;
      const pExceed = {
        ...validPlayer,
        inventory: [{ itemId: "hoi_huyet_dan", qty: maxStack + 10 }],
      };
      const rawExceed = JSON.stringify(pExceed);
      expect(auditPlayerSaveData(rawExceed, rawExceed.length).map((e) => e.code)).toContain(
        "qty_out_of_range",
      );
    });

    it("trang bị sai ô, slot lạ hoặc itemId lạ -> unknown_equip_slot, unknown_equip_item, invalid_equip_slot", () => {
      // Slot lạ
      const pSlot = {
        ...validPlayer,
        equipment: { ...validPlayer.equipment, slot_la: "lang_nha_kiem" },
      };
      const rawSlot = JSON.stringify(pSlot);
      expect(auditPlayerSaveData(rawSlot, rawSlot.length).map((e) => e.code)).toContain(
        "unknown_equip_slot",
      );

      // Item lạ
      const pItem = {
        ...validPlayer,
        equipment: { ...validPlayer.equipment, weapon: "kiem_khong_ton_tai" },
      };
      const rawItem = JSON.stringify(pItem);
      expect(auditPlayerSaveData(rawItem, rawItem.length).map((e) => e.code)).toContain(
        "unknown_equip_item",
      );

      // Gắn nhầm áo vào ô vũ khí
      const pWrongSlot = {
        ...validPlayer,
        equipment: { ...validPlayer.equipment, weapon: "tho_nhung_bao" },
      };
      const rawWrong = JSON.stringify(pWrongSlot);
      expect(auditPlayerSaveData(rawWrong, rawWrong.length).map((e) => e.code)).toContain(
        "invalid_equip_slot",
      );
    });

    it("nhiệm vụ lạ, trùng lặp trong done hoặc daily không hợp lệ", () => {
      // QuestId lạ
      const pQuest = {
        ...validPlayer,
        quests: { ...validPlayer.quests, done: ["nhap_the", "quest_ma"] },
      };
      const rawQ = JSON.stringify(pQuest);
      expect(auditPlayerSaveData(rawQ, rawQ.length).map((e) => e.code)).toContain("unknown_quest");

      // Trùng quest trong done
      const pDup = {
        ...validPlayer,
        quests: { ...validPlayer.quests, done: ["nhap_the", "nhap_the"] },
      };
      const rawDup = JSON.stringify(pDup);
      expect(auditPlayerSaveData(rawDup, rawDup.length).map((e) => e.code)).toContain(
        "duplicate_quest_done",
      );

      // Daily trỏ quest không phải daily
      const pDaily = {
        ...validPlayer,
        quests: { ...validPlayer.quests, daily: { nhap_the: "2026-11-10T00:00:00.000Z" } },
      };
      const rawDaily = JSON.stringify(pDaily);
      expect(auditPlayerSaveData(rawDaily, rawDaily.length).map((e) => e.code)).toContain(
        "invalid_daily_key",
      );
    });

    it("file có itemId = secretHash và quests.done chứa secretHash -> kết quả report và console không chứa hash", () => {
      const sensitiveHash = "9999999999999999999999999999999999999999999999999999999999999999";
      const pMalicious = {
        ...validPlayer,
        inventory: [{ itemId: sensitiveHash, qty: 1 }],
        quests: {
          ...validPlayer.quests,
          done: [sensitiveHash],
        },
      };
      const raw = JSON.stringify(pMalicious);
      const errors = auditPlayerSaveData(raw, raw.length);
      expect(errors.map((e) => e.code)).toContain("unknown_item");
      expect(errors.map((e) => e.code)).toContain("unknown_quest");

      const serialized = JSON.stringify(errors);
      expect(serialized).not.toContain(sensitiveHash);
      expect(serialized).toContain("<chuỗi 64 ký tự>");
    });

    it("itemId chứa mã ANSI \\x1b hoặc chuỗi 3000 ký tự -> không chứa ký tự điều khiển, mỗi thông báo < 200 ký tự", () => {
      const ansiItemId = "\x1b[2J\x1b[Hrm_rf";
      const hugeItemId = "a".repeat(3000);
      const pAnsi = {
        ...validPlayer,
        inventory: [
          { itemId: ansiItemId, qty: 1 },
          { itemId: hugeItemId, qty: 1 },
        ],
      };
      const raw = JSON.stringify(pAnsi);
      const errors = auditPlayerSaveData(raw, raw.length);

      for (const err of errors) {
        expect(err.message).not.toContain("\x1b");
        expect(err.message.length).toBeLessThan(200);
      }
      const serialized = JSON.stringify(errors);
      expect(serialized).toContain("<chuỗi 3000 ký tự>");
    });
  });

  describe("đột biến kiểm tra (mutation check: nới lỏng điều kiện kiểm tra -> test bắt buộc đỏ)", () => {
    it("đột biến 1: nới lỏng kiểm tra coin (bỏ qua số âm hoặc float) -> vi phạm quy tắc ví", () => {
      // Giả sử có mutation nới lỏng chỉ kiểm tra typeof coin === 'number'
      const laxCoinCheck = (coin: any) => typeof coin === "number";
      expect(laxCoinCheck(-500)).toBe(true); // Đột biến chấp nhận coin âm!
      expect(laxCoinCheck(10.5)).toBe(true); // Đột biến chấp nhận coin lẻ!

      // Hàm auditPlayerSaveData THẬT không bao giờ bỏ sót:
      const pNeg = JSON.stringify({ ...validPlayer, coin: -500 });
      const pFloat = JSON.stringify({ ...validPlayer, coin: 10.5 });
      expect(auditPlayerSaveData(pNeg, pNeg.length).map((e) => e.code)).toContain(
        "coin_out_of_range",
      );
      expect(auditPlayerSaveData(pFloat, pFloat.length).map((e) => e.code)).toContain(
        "coin_out_of_range",
      );
    });

    it("đột biến 2: tra cứu itemId bằng TABLE[id] trực tiếp thay vì byId -> lọt prototype pollution ('constructor')", () => {
      // Đột biến dùng TABLE[id] trực tiếp:
      const unsafeLookup = (TABLE: any, id: string) => TABLE[id];
      // Object.prototype có sẵn thuộc tính 'constructor', nên tra cứu không an toàn trả về Function!
      expect(typeof unsafeLookup(ITEM_BY_ID, "constructor")).toBe("function");

      // Hàm auditPlayerSaveData THẬT dùng byId() nên chặn đứng prototype key:
      const pCtor = JSON.stringify({
        ...validPlayer,
        inventory: [{ itemId: "constructor", qty: 1 }],
      });
      const errors = auditPlayerSaveData(pCtor, pCtor.length);
      expect(errors.map((e) => e.code)).toContain("unknown_item");
    });

    it("đột biến 3: bỏ qua kiểm tra khớp slot của trang bị (itemDef.equip.slot === slotKey)", () => {
      // Giả sử mutation chỉ kiểm tra itemDef.type === 'equip' mà không so slot:
      const laxEquipCheck = (itemDef: any, _slot: string) => itemDef?.type === "equip";
      const langNhaKiem = ITEM_BY_ID["lang_nha_kiem"];
      expect(laxEquipCheck(langNhaKiem, "robe")).toBe(true); // Đột biến cho phép đeo kiếm vào ô áo!

      // Hàm auditPlayerSaveData THẬT bắt buộc kiểm tra đúng slot:
      const pWrongSlot = JSON.stringify({
        ...validPlayer,
        equipment: { ...validPlayer.equipment, robe: "lang_nha_kiem" },
      });
      const errors = auditPlayerSaveData(pWrongSlot, pWrongSlot.length);
      expect(errors.map((e) => e.code)).toContain("invalid_equip_slot");
    });

    it("đột biến 4: bỏ qua kiểm tra toạ độ rơi vào ô chặn circleBlocked()", () => {
      // Giả sử mutation chỉ kiểm tra x, y trong khoảng [0, DEFAULT_MAP.worldW] / [0, DEFAULT_MAP.worldH]
      const laxPosCheck = (x: number, y: number) =>
        x >= 0 && x <= DEFAULT_MAP.worldW && y >= 0 && y <= DEFAULT_MAP.worldH;
      expect(laxPosCheck(0, 0)).toBe(true); // (0, 0) là ô nước/vách cản trở mép bản đồ

      // Hàm auditPlayerSaveData THẬT bắt buộc phát hiện vị trí bị chặn:
      const pBlocked = JSON.stringify({ ...validPlayer, x: 0, y: 0 });
      const errors = auditPlayerSaveData(pBlocked, pBlocked.length);
      expect(errors.map((e) => e.code)).toContain("pos_blocked");
    });

    it("đột biến 5: bỏ hàm show() -> in nguyên văn itemId chứa secretHash hoặc mã ANSI ra thông báo", () => {
      // Giả sử có hàm định dạng lỗi thiếu cẩn trọng, in thẳng id không qua show():
      const unsafeFormat = (id: string) => `Vật phẩm lạ: "${id}"`;
      const secretHash = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
      const unsafeMsg = unsafeFormat(secretHash);
      expect(unsafeMsg).toContain(secretHash); // Đột biến làm rò rỉ nguyên vẹn secretHash!

      // Hàm show() an toàn THẬT ngăn chặn hoàn toàn việc rò rỉ:
      const safeMsg = `Vật phẩm lạ: ${show(secretHash)}`;
      expect(safeMsg).not.toContain(secretHash);
      expect(safeMsg).toContain("<chuỗi 64 ký tự>");
    });
  });

  describe("auditSoulSaveData & chân linh (#151)", () => {
    const validSoul = {
      v: 1,
      id: "tiểu đạo sĩ",
      kiep: 2,
      duyen: 35,
      duyenTotal: 50,
      unlocks: {
        du_am: 2,
      },
      origins: ["kiem_khach"],
      best: { step: 2, realm: 1, tier: 1 },
      lastCreditedLife: "life-abc-123456",
      history: [
        {
          kiep: 1,
          step: 2,
          minutes: 15,
          gain: 35,
          at: "2026-11-10T00:00:00.000Z",
        },
      ],
      createdAt: "2026-11-10T00:00:00.000Z",
      updatedAt: "2026-11-10T00:00:00.000Z",
    };

    it("chân linh hợp lệ -> không có lỗi", () => {
      const raw = JSON.stringify(validSoul);
      const errors = auditSoulSaveData(raw, raw.length);
      expect(errors).toEqual([]);
    });

    it("phát hiện phiên bản không hợp lệ (v !== 1)", () => {
      const raw = JSON.stringify({ ...validSoul, v: 2 });
      const errors = auditSoulSaveData(raw, raw.length);
      expect(errors.map((e) => e.code)).toContain("invalid_soul_version");
    });

    it("phát hiện kiếp không hợp lệ (kiep < 1 hoặc float)", () => {
      const raw = JSON.stringify({ ...validSoul, kiep: 0 });
      const errors = auditSoulSaveData(raw, raw.length);
      expect(errors.map((e) => e.code)).toContain("invalid_soul_kiep");
    });

    it("phát hiện Duyên âm hoặc duyenTotal < duyen", () => {
      const rawNeg = JSON.stringify({ ...validSoul, duyen: -10 });
      expect(auditSoulSaveData(rawNeg, rawNeg.length).map((e) => e.code)).toContain(
        "invalid_soul_duyen",
      );

      const rawLess = JSON.stringify({ ...validSoul, duyen: 50, duyenTotal: 30 });
      expect(auditSoulSaveData(rawLess, rawLess.length).map((e) => e.code)).toContain(
        "invalid_soul_duyen_total",
      );
    });

    it("phát hiện mục mở khóa lạ hoặc nấc vượt quá giới hạn", () => {
      const rawUnknown = JSON.stringify({
        ...validSoul,
        unlocks: { unknown_perk: 1 },
      });
      expect(auditSoulSaveData(rawUnknown, rawUnknown.length).map((e) => e.code)).toContain(
        "unknown_soul_unlock",
      );

      const rawOver = JSON.stringify({
        ...validSoul,
        unlocks: { du_am: 99 },
      });
      expect(auditSoulSaveData(rawOver, rawOver.length).map((e) => e.code)).toContain(
        "invalid_soul_unlock_level",
      );
    });

    it("phát hiện xuất thân lạ, pham_gia trong origins, hoặc trùng lặp", () => {
      const rawUnknown = JSON.stringify({ ...validSoul, origins: ["than_tien"] });
      expect(auditSoulSaveData(rawUnknown, rawUnknown.length).map((e) => e.code)).toContain(
        "unknown_soul_origin",
      );

      const rawPhamGia = JSON.stringify({ ...validSoul, origins: ["pham_gia"] });
      expect(auditSoulSaveData(rawPhamGia, rawPhamGia.length).map((e) => e.code)).toContain(
        "invalid_soul_origin",
      );

      const rawDup = JSON.stringify({ ...validSoul, origins: ["kiem_khach", "kiem_khach"] });
      expect(auditSoulSaveData(rawDup, rawDup.length).map((e) => e.code)).toContain(
        "duplicate_soul_origin",
      );
    });

    it("phát hiện best không khớp với stepOf", () => {
      const rawBadBest = JSON.stringify({
        ...validSoul,
        best: { step: 999, realm: 1, tier: 1 },
      });
      expect(auditSoulSaveData(rawBadBest, rawBadBest.length).map((e) => e.code)).toContain(
        "invalid_soul_best",
      );
    });

    it("auditSavesDirectory kiểm tra thư mục souls/ và đối chiếu limbo", () => {
      const soulsSubDir = path.join(tmpDir, "souls");
      mkdirSync(soulsSubDir, { recursive: true });

      const sid = "tiểu đạo sĩ";
      const expectedHash = createHash("sha1")
        .update(sid.normalize("NFC").toLowerCase())
        .digest("hex");
      const soulFilePath = path.join(soulsSubDir, `${expectedHash}.json`);
      writeFileSync(soulFilePath, JSON.stringify(validSoul, null, 2));

      // File nhân vật có limbo khớp với chân linh
      const playerWithLimbo = {
        ...validPlayer,
        lifeId: "life-new-789012",
        life: { playMs: 60000, kills: 10, bossKills: 1 },
        limbo: {
          endedLifeId: "life-abc-123456",
          summary: {
            kiep: 1,
            realm: 1,
            tier: 1,
            minutes: 15,
            kills: 50,
            bossKills: 2,
            gain: 35,
          },
          keepable: ["lang_nha_kiem"],
          coinAtDeath: 100,
          counts: true,
          credited: true,
        },
      };
      const playerFile = path.join(tmpDir, "tieu_dao_si.json");
      writeFileSync(playerFile, JSON.stringify(playerWithLimbo, null, 2));

      const report = auditSavesDirectory(tmpDir);
      expect(report.totalFiles).toBe(1);
      expect(report.cleanFiles).toBe(1);
      expect(report.errorFiles).toBe(0);
      expect(report.totalSouls).toBe(1);
      expect(report.cleanSouls).toBe(1);
      expect(report.errorSouls).toBe(0);

      // Trường hợp limbo.credited: true nhưng chân linh khác endedLifeId
      const badSoul = { ...validSoul, lastCreditedLife: "different-life-id" };
      writeFileSync(soulFilePath, JSON.stringify(badSoul, null, 2));

      const reportInconsistent = auditSavesDirectory(tmpDir);
      expect(reportInconsistent.errorFiles).toBe(1);
      expect(reportInconsistent.errorsByCode.limbo_soul_inconsistent).toBe(1);
    });
  });
});
