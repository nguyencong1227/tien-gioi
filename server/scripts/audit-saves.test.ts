import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { installSectQuestFixture } from "../src/systems/sect-fixtures";
import {
  AMBUSH_DAY_CAP,
  COIN_CAP,
  DEFAULT_MAP,
  DUNGEON_DAILY_REWARDS,
  DUNGEON_MAPS,
  HAN_VAN_ID,
  INVENTORY_SLOTS,
  ITEM_BY_ID,
  LINH_HU_MAP_ID,
  MAPS,
  REALMS,
  getMap,
  SECT_COIN_CAP,
  SECT_ELDERS_MAX,
  SECT_LOG_MAX,
  SECT_MAX_MEMBERS,
  SECT_VAULT_SLOTS,
  SECT_VAULT_SLOTS_MAX,
  SECT_VAULT_LOG_MAX,
  SECT_VAULT_DRAW_MAX,
  SECT_VAULT_QTY_MAX,
  SECT_POINTS_CAP,
  SECT_CONTRIB_CAP,
  SECT_EARN_DAY_CAP,
  SECT_DEPOSIT_DAY_CAP,
  SECT_LEVELS,
  SECT_SHOP,
  SKILLS_M7,
  sanitizeSkillBook,
} from "@tien-gioi/shared";
import {
  auditAccountSaveData,
  auditPlayerSaveData,
  auditSavesDirectory,
  auditSectSaveData,
  auditSessionSaveData,
  auditSoulSaveData,
  MAX_FILE_SIZE,
  show,
} from "./audit-saves.js";

// Bảng nhiệm vụ tông CỐ ĐỊNH: test không được cứng dữ liệu thật của E / D (M8.7)
const restoreQuestFixture = installSectQuestFixture();
afterAll(() => restoreQuestFixture());

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

      // mapId là bản đồ bí cảnh (có trong getMap nhưng không nằm trong MAPS) phải báo lỗi (#201)
      expect(getMap(LINH_HU_MAP_ID)).toBeDefined();
      for (const dMap of DUNGEON_MAPS) {
        const pDungeon = {
          ...validPlayer,
          mapId: dMap.id,
          x: dMap.town.cx * 32,
          y: dMap.town.cy * 32,
        };
        const rawDungeon = JSON.stringify(pDungeon);
        const errs = auditPlayerSaveData(rawDungeon, rawDungeon.length);
        expect(
          errs.map((e) => e.code),
          `dungeon mapId: ${dMap.id}`,
        ).toContain("invalid_map_id");
        const msg = errs.find((e) => e.code === "invalid_map_id")!.message;
        expect(msg).toContain("bản đồ bí cảnh");
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

    it("mọi bản đồ ngoài hoang (kể cả Âm Sương Trạch, M6 #405): chỗ xuất hiện của mọi cổng là toạ độ lưu hợp lệ; ngoài biên và ô chặn của chính bản đồ đó thì báo", () => {
      const codes = (o: object) => {
        const raw = JSON.stringify({ ...validPlayer, ...o });
        return auditPlayerSaveData(raw, raw.length).map((e) => e.code);
      };
      for (const def of MAPS) {
        const m = getMap(def.id)!;
        for (const portal of def.portals ?? []) {
          const got = codes({ mapId: def.id, x: portal.spawn.x, y: portal.spawn.y });
          expect(got, `${def.id}: chỗ xuất hiện của ${portal.id}`).not.toContain("invalid_map_id");
          expect(got, `${def.id}: ${portal.id}`).not.toContain("pos_out_of_bounds");
          expect(got, `${def.id}: ${portal.id}`).not.toContain("pos_blocked");
        }
        expect(
          codes({ mapId: def.id, x: m.worldW + 200, y: 1500 }),
          `${def.id}: ngoài biên`,
        ).toContain("pos_out_of_bounds");
        expect(codes({ mapId: def.id, x: 0, y: 0 }), `${def.id}: vách đá góc`).toContain(
          "pos_blocked",
        );
      }
      // Cùng một toạ độ, khác bản đồ: (1984, 3344) là chỗ xuất hiện ở Âm Sương nhưng vượt chiều cao Hắc Phong Cốc (3072 px)
      const amSuong = getMap("am_suong")!;
      const spawn = amSuong.portal("am_suong_nam")!.spawn;
      expect(spawn.y).toBeGreaterThan(getMap("hac_phong")!.worldH);
      expect(codes({ mapId: "am_suong", ...spawn })).not.toContain("pos_out_of_bounds");
      expect(codes({ mapId: "hac_phong", ...spawn })).toContain("pos_out_of_bounds");
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

    it("M8.4: quests.active chứa nhiệm vụ tông môn hợp lệ (tra cứu qua questDefAny) -> 0 lỗi; chứa id lạ -> unknown_quest", () => {
      const pSectQuest = {
        ...validPlayer,
        quests: {
          done: ["nhap_the"],
          active: [
            { id: "st_tru_lang.t0", step: 0, count: 0 },
            { id: "st_nop_nanh.t0", step: 0, count: 0 },
          ],
        },
      };
      const raw = JSON.stringify(pSectQuest);
      expect(auditPlayerSaveData(raw, raw.length)).toEqual([]);

      // Nhiệm vụ active là id lạ hoặc constructor
      for (const badId of ["quest_khong_ton_tai", "constructor"]) {
        const pBad = {
          ...validPlayer,
          quests: {
            done: ["nhap_the"],
            active: [{ id: badId, step: 0, count: 0 }],
          },
        };
        const rawBad = JSON.stringify(pBad);
        expect(auditPlayerSaveData(rawBad, rawBad.length).map((e) => e.code)).toContain(
          "unknown_quest",
        );
      }
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

  describe("auditAccountSaveData & auditSessionSaveData (Issue #176)", () => {
    const sampleHash = "scrypt$1024$8$1$c2FsdHNhbHRzYWx0$aGFzaGhhc2hoYXNoaGFzaGhhc2g";
    const validAccount = {
      id: "11111111-2222-3333-4444-555555555555",
      username: "han_lap",
      passHash: sampleHash,
      recoveryHash: sampleHash,
      createdAt: "2026-11-10T00:00:00.000Z",
      lastLoginAt: "2026-11-10T00:00:00.000Z",
      disabled: false,
      name: "Giang Tĩnh Uyên",
    };

    const validSession = {
      tokenHash: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
      accountId: "11111111-2222-3333-4444-555555555555",
      createdAt: 1000,
      expiresAt: 5000,
      lastSeenAt: 2000,
    };

    it("file tài khoản hợp lệ -> 0 lỗi", () => {
      const raw = JSON.stringify(validAccount);
      expect(auditAccountSaveData(raw, raw.length)).toEqual([]);
    });

    it("bắt các lỗi định dạng của tài khoản và không lộ băm mật khẩu", () => {
      // 1. Lỗi JSON
      expect(auditAccountSaveData("{", 1).map((e) => e.code)).toContain("invalid_json");
      expect(auditAccountSaveData("[]", 2).map((e) => e.code)).toContain("not_an_object");

      // 2. id không hợp lệ
      const badId = JSON.stringify({ ...validAccount, id: "ngan" });
      expect(auditAccountSaveData(badId, badId.length).map((e) => e.code)).toContain(
        "invalid_account_id",
      );

      // 3. username không hợp lệ (chữ hoa, ký tự lạ, quá ngắn)
      const badUser = JSON.stringify({ ...validAccount, username: "HanLap" });
      expect(auditAccountSaveData(badUser, badUser.length).map((e) => e.code)).toContain(
        "invalid_username",
      );

      // 4. passHash & recoveryHash không hợp lệ (không phải scrypt)
      const badPass = JSON.stringify({ ...validAccount, passHash: "plain_password" });
      const passErrors = auditAccountSaveData(badPass, badPass.length);
      expect(passErrors.map((e) => e.code)).toContain("invalid_pass_hash");
      expect(JSON.stringify(passErrors)).not.toContain("plain_password");

      const badRec = JSON.stringify({ ...validAccount, recoveryHash: "plain_code" });
      const recErrors = auditAccountSaveData(badRec, badRec.length);
      expect(recErrors.map((e) => e.code)).toContain("invalid_recovery_hash");
      expect(JSON.stringify(recErrors)).not.toContain("plain_code");

      // 5. createdAt / lastLoginAt không hợp lệ
      const badTime = JSON.stringify({
        ...validAccount,
        createdAt: "invalid-date",
        lastLoginAt: 12345,
      });
      const timeErrors = auditAccountSaveData(badTime, badTime.length).map((e) => e.code);
      expect(timeErrors).toContain("invalid_created_at");
      expect(timeErrors).toContain("invalid_last_login_at");

      // 6. disabled không phải boolean
      const badDisabled = JSON.stringify({ ...validAccount, disabled: "true" });
      expect(auditAccountSaveData(badDisabled, badDisabled.length).map((e) => e.code)).toContain(
        "invalid_disabled",
      );

      // 7. name không hợp lệ theo cleanName
      const badName = JSON.stringify({ ...validAccount, name: "x" });
      expect(auditAccountSaveData(badName, badName.length).map((e) => e.code)).toContain(
        "invalid_account_name",
      );
    });

    it("file phiên hợp lệ -> 0 lỗi", () => {
      const raw = JSON.stringify(validSession);
      expect(auditSessionSaveData(raw, raw.length)).toEqual([]);
    });

    it("bắt các lỗi định dạng của phiên", () => {
      // 1. tokenHash không đúng sha256 hex
      const badHash = JSON.stringify({ ...validSession, tokenHash: "not-hex-64" });
      expect(auditSessionSaveData(badHash, badHash.length).map((e) => e.code)).toContain(
        "invalid_token_hash",
      );

      // 2. accountId không hợp lệ
      const badAccId = JSON.stringify({ ...validSession, accountId: "ngan" });
      expect(auditSessionSaveData(badAccId, badAccId.length).map((e) => e.code)).toContain(
        "invalid_account_id",
      );

      // 3. Thời gian phiên không hợp lệ
      const badTime = JSON.stringify({
        ...validSession,
        createdAt: -1,
        expiresAt: NaN,
        lastSeenAt: "1000",
      });
      const timeErrors = auditSessionSaveData(badTime, badTime.length).map((e) => e.code);
      expect(timeErrors).toContain("invalid_session_time");
    });

    it("auditSavesDirectory quét thư mục accounts/ và sessions/ đầy đủ và kiểm tra toàn vẹn", () => {
      const accountsSubDir = path.join(tmpDir, "accounts");
      const sessionsSubDir = path.join(tmpDir, "sessions");
      mkdirSync(accountsSubDir, { recursive: true });
      mkdirSync(sessionsSubDir, { recursive: true });

      // Lưu file tài khoản hợp lệ: <id>.json
      const accFile = path.join(accountsSubDir, `${validAccount.id}.json`);
      writeFileSync(accFile, JSON.stringify(validAccount, null, 2));

      // Lưu file phiên hợp lệ: <tokenHash>.json
      const sessFile = path.join(sessionsSubDir, `${validSession.tokenHash}.json`);
      writeFileSync(sessFile, JSON.stringify(validSession, null, 2));

      // Thêm 1 file nhân vật sạch
      const pFile = path.join(tmpDir, "nhan_vat.json");
      writeFileSync(pFile, JSON.stringify(validPlayer, null, 2));

      const report = auditSavesDirectory(tmpDir);
      expect(report.totalFiles).toBe(1);
      expect(report.cleanFiles).toBe(1);
      expect(report.errorFiles).toBe(0);

      expect(report.totalAccounts).toBe(1);
      expect(report.cleanAccounts).toBe(1);
      expect(report.errorAccounts).toBe(0);

      expect(report.totalSessions).toBe(1);
      expect(report.cleanSessions).toBe(1);
      expect(report.errorSessions).toBe(0);

      expect(report.failedFiles).toHaveLength(0);
    });

    it("phát hiện tên file không khớp, trùng username, trùng đạo hiệu, và phiên mồ côi (orphan)", () => {
      const accountsSubDir = path.join(tmpDir, "accounts");
      const sessionsSubDir = path.join(tmpDir, "sessions");
      mkdirSync(accountsSubDir, { recursive: true });
      mkdirSync(sessionsSubDir, { recursive: true });

      // 1. Tên file tài khoản không khớp id
      const mismatchedAcc = { ...validAccount, id: "22222222-2222-2222-2222-222222222222" };
      writeFileSync(
        path.join(accountsSubDir, "sai_ten_file.json"),
        JSON.stringify(mismatchedAcc, null, 2),
      );

      // 2. Trùng username giữa 2 tài khoản
      const acc1 = {
        ...validAccount,
        id: "33333333-3333-3333-3333-333333333333",
        username: "trung_username",
        name: "Đạo Hiệu 1",
      };
      const acc2 = {
        ...validAccount,
        id: "44444444-4444-4444-4444-444444444444",
        username: "trung_username",
        name: "Đạo Hiệu 2",
      };
      writeFileSync(path.join(accountsSubDir, `${acc1.id}.json`), JSON.stringify(acc1, null, 2));
      writeFileSync(path.join(accountsSubDir, `${acc2.id}.json`), JSON.stringify(acc2, null, 2));

      // 3. Trùng đạo hiệu (không phân biệt hoa thường, NFC)
      const acc3 = {
        ...validAccount,
        id: "55555555-5555-5555-5555-555555555555",
        username: "user_a",
        name: "Bạch Tiểu Thuần",
      };
      const acc4 = {
        ...validAccount,
        id: "66666666-6666-6666-6666-666666666666",
        username: "user_b",
        name: "BẠCH TIỂU THUẦN",
      };
      writeFileSync(path.join(accountsSubDir, `${acc3.id}.json`), JSON.stringify(acc3, null, 2));
      writeFileSync(path.join(accountsSubDir, `${acc4.id}.json`), JSON.stringify(acc4, null, 2));

      // 4. Tên file phiên không khớp tokenHash (accountId trỏ tới tài khoản hợp lệ acc1)
      const mismatchedHashSess = { ...validSession, accountId: acc1.id };
      writeFileSync(
        path.join(sessionsSubDir, "sai_hash.json"),
        JSON.stringify(mismatchedHashSess, null, 2),
      );

      // 5. Phiên mồ côi: trỏ tới accountId không có trong accounts/
      const orphanSess = {
        ...validSession,
        tokenHash: "b1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
        accountId: "99999999-9999-9999-9999-999999999999",
      };
      writeFileSync(
        path.join(sessionsSubDir, `${orphanSess.tokenHash}.json`),
        JSON.stringify(orphanSess, null, 2),
      );

      // 6. Tệp tạm (*.tmp) và tệp cách ly (*.hong-*) phải được bỏ qua
      writeFileSync(path.join(accountsSubDir, "tam.tmp"), "{");
      writeFileSync(path.join(accountsSubDir, "bi_hong.hong-123"), "{");
      writeFileSync(path.join(sessionsSubDir, "tam.tmp"), "{");
      writeFileSync(path.join(sessionsSubDir, "bi_hong.hong-123"), "{");

      const report = auditSavesDirectory(tmpDir);
      expect(report.errorsByCode.mismatched_account_filename).toBe(1);
      expect(report.errorsByCode.duplicate_username).toBe(1);
      expect(report.errorsByCode.duplicate_account_name).toBe(1);
      expect(report.errorsByCode.mismatched_session_filename).toBe(1);
      expect(report.errorsByCode.orphan_session).toBe(1);
    });
  });

  describe("Bí cảnh: mapId bí cảnh & dungeonDaily (Issue #201)", () => {
    it("dungeonDaily hợp lệ (rewards từ 0 đến DUNGEON_DAILY_REWARDS, day chuẩn YYYY-MM-DD) -> 0 lỗi", () => {
      for (let rewards = 0; rewards <= DUNGEON_DAILY_REWARDS; rewards++) {
        const p = {
          ...validPlayer,
          dungeonDaily: { day: "2026-11-10", rewards },
        };
        const raw = JSON.stringify(p);
        expect(auditPlayerSaveData(raw, raw.length), `rewards=${rewards}`).toEqual([]);
      }
    });

    it("dungeonDaily sai kiểu gốc (null, mảng, chuỗi, số) -> invalid_dungeon_daily và không lộ chuỗi", () => {
      const secretStr = "secret_token_khong_duoc_lo";
      for (const badDaily of [null, [], [1, 2], secretStr, 123, true]) {
        const raw = JSON.stringify({ ...validPlayer, dungeonDaily: badDaily });
        const errs = auditPlayerSaveData(raw, raw.length);
        expect(
          errs.map((e) => e.code),
          JSON.stringify(badDaily),
        ).toContain("invalid_dungeon_daily");
        expect(JSON.stringify(errs)).not.toContain(secretStr);
      }
    });

    it("dungeonDaily.day không đúng dạng YYYY-MM-DD hoặc ngày không tồn tại -> invalid_dungeon_daily_day, không lộ nội dung", () => {
      const sensitiveDay = "mat_khau_ngan_123";
      const secretHash64 = "f".repeat(64);
      const badDays: unknown[] = [
        "",
        "2026-11-10T00:00:00.000Z",
        "10-11-2026",
        "2026/11/10",
        "2026-13-01",
        "2026-00-10",
        "2026-02-30",
        "2026-11-31",
        sensitiveDay,
        secretHash64,
        "\x1b[31m2026-11-10",
        20261110,
        null,
        undefined,
        {},
      ];
      for (const day of badDays) {
        const raw = JSON.stringify({
          ...validPlayer,
          dungeonDaily: { day, rewards: 1 },
        });
        const errs = auditPlayerSaveData(raw, raw.length);
        expect(
          errs.map((e) => e.code),
          `day=${String(day)}`,
        ).toContain("invalid_dungeon_daily_day");
        const serialized = JSON.stringify(errs);
        expect(serialized).not.toContain(sensitiveDay);
        expect(serialized).not.toContain(secretHash64);
        expect(serialized).not.toContain("\x1b");
      }
    });

    it("dungeonDaily.rewards âm, số thực, vượt DUNGEON_DAILY_REWARDS hoặc sai kiểu -> invalid_dungeon_daily_rewards, không lộ nội dung", () => {
      const sensitiveReward = "token_bi_mat_xyz";
      const badRewards: unknown[] = [
        -1,
        -999,
        DUNGEON_DAILY_REWARDS + 1,
        99,
        1.5,
        null,
        undefined,
        "2",
        sensitiveReward,
        {},
        [],
      ];
      for (const rewards of badRewards) {
        const raw = JSON.stringify({
          ...validPlayer,
          dungeonDaily: { day: "2026-11-10", rewards },
        });
        const errs = auditPlayerSaveData(raw, raw.length);
        expect(
          errs.map((e) => e.code),
          `rewards=${String(rewards)}`,
        ).toContain("invalid_dungeon_daily_rewards");
        expect(JSON.stringify(errs)).not.toContain(sensitiveReward);
      }
    });

    it("đột biến: bỏ kiểm isDungeonMap hoặc bỏ trần DUNGEON_DAILY_REWARDS sẽ để lọt dữ liệu sai", () => {
      // Đột biến 1: chỉ kiểm getMap(mapId) !== undefined mà quên isDungeonMap(mapId)
      const laxMapCheck = (mapId: unknown) => getMap(mapId) !== undefined;
      expect(laxMapCheck(LINH_HU_MAP_ID)).toBe(true); // Đột biến chấp nhận bản đồ bí cảnh trong file lưu!

      const rawDungeonMap = JSON.stringify({ ...validPlayer, mapId: LINH_HU_MAP_ID });
      expect(auditPlayerSaveData(rawDungeonMap, rawDungeonMap.length).map((e) => e.code)).toContain(
        "invalid_map_id",
      );

      // Đột biến 2: chỉ kiểm Number.isInteger(rewards) && rewards >= 0 mà quên <= DUNGEON_DAILY_REWARDS
      const laxRewardsCheck = (r: unknown) =>
        typeof r === "number" && Number.isInteger(r) && r >= 0;
      expect(laxRewardsCheck(DUNGEON_DAILY_REWARDS + 1)).toBe(true);

      const rawOverCap = JSON.stringify({
        ...validPlayer,
        dungeonDaily: { day: "2026-11-10", rewards: DUNGEON_DAILY_REWARDS + 1 },
      });
      expect(auditPlayerSaveData(rawOverCap, rawOverCap.length).map((e) => e.code)).toContain(
        "invalid_dungeon_daily_rewards",
      );
    });
  });

  describe("Gặp chặn đường: ambushDaily & ambushUntil (mục 52, CD2)", () => {
    const codesOf = (extra: Record<string, unknown>) => {
      const raw = JSON.stringify({ ...validPlayer, ...extra });
      return auditPlayerSaveData(raw, raw.length).map((e) => e.code);
    };

    it("hợp lệ (n từ 0 đến AMBUSH_DAY_CAP, day chuẩn, ambushUntil hữu hạn) -> 0 lỗi", () => {
      for (let n = 0; n <= AMBUSH_DAY_CAP; n++)
        expect(codesOf({ ambushDaily: { day: "2026-11-10", n } }), `n=${n}`).toEqual([]);
      expect(codesOf({ ambushUntil: 1_800_000_000_000 })).toEqual([]);
      expect(codesOf({ ambushUntil: 0 })).toEqual([]);
    });

    it("ambushDaily sai kiểu gốc (null, mảng, chuỗi, số) -> invalid_ambush_daily và không lộ chuỗi", () => {
      const secretStr = "secret_token_khong_duoc_lo";
      for (const bad of [null, [], [1, 2], secretStr, 123, true]) {
        const raw = JSON.stringify({ ...validPlayer, ambushDaily: bad });
        const errs = auditPlayerSaveData(raw, raw.length);
        expect(
          errs.map((e) => e.code),
          JSON.stringify(bad),
        ).toContain("invalid_ambush_daily");
        expect(JSON.stringify(errs)).not.toContain(secretStr);
      }
    });

    it("ambushDaily.day sai dạng / ngày không có -> invalid_ambush_daily_day, không lộ nội dung", () => {
      const sensitive = "mat_khau_ngan_123";
      for (const day of ["", "10-11-2026", "2026-02-30", "2026-13-01", sensitive, 20261110, null]) {
        const raw = JSON.stringify({ ...validPlayer, ambushDaily: { day, n: 1 } });
        const errs = auditPlayerSaveData(raw, raw.length);
        expect(
          errs.map((e) => e.code),
          JSON.stringify(day),
        ).toContain("invalid_ambush_daily_day");
        expect(JSON.stringify(errs)).not.toContain(sensitive);
      }
    });

    it("ambushDaily.n âm, lẻ, vượt AMBUSH_DAY_CAP hoặc sai kiểu -> invalid_ambush_daily_n", () => {
      for (const n of [-1, 1.5, AMBUSH_DAY_CAP + 1, "3", null, Number.NaN])
        expect(codesOf({ ambushDaily: { day: "2026-11-10", n } }), JSON.stringify(n)).toContain(
          "invalid_ambush_daily_n",
        );
    });

    it("ambushReturnAt hữu hạn thì hợp lệ; sai kiểu / không hữu hạn -> invalid_ambush_return_at", () => {
      expect(codesOf({ ambushReturnAt: 1_800_000_000_000 })).toEqual([]);
      for (const v of ["123", null, true, [], {}])
        expect(codesOf({ ambushReturnAt: v }), JSON.stringify(v)).toContain(
          "invalid_ambush_return_at",
        );
    });

    it("ambushUntil không phải số hữu hạn -> invalid_ambush_until", () => {
      for (const v of ["123", null, true, [], {}])
        expect(codesOf({ ambushUntil: v }), JSON.stringify(v)).toContain("invalid_ambush_until");
    });
  });

  describe("audit tông môn (sects/) (Issue #231, M3.6 6e)", () => {
    const validSect = {
      v: 1,
      id: "sect-uuid-001",
      name: "Thái Huyền Tông",
      tag: "TH",
      leader: "soul_chu_1",
      motd: "Tu tiên vấn đạo, cầu trường sinh.",
      members: [
        { soulKey: "soul_chu_1", name: "Huyền Chân Tử", rank: "chu", joinedAt: 1700000000000 },
        {
          soulKey: "soul_lao_1",
          name: "Thanh Hư Đạo",
          rank: "truong_lao",
          joinedAt: 1700000001000,
        },
        { soulKey: "soul_de_1", name: "Bạch Vân Nhi", rank: "de_tu", joinedAt: 1700000002000 },
      ],
      coin: 50000,
      log: [{ at: 1700000003000, name: "Huyền Chân Tử", kind: "deposit", amount: 50000 }],
      createdAt: 1700000000000,
      updatedAt: 1700000003000,
    };

    it("file tông môn hợp lệ: 0 lỗi", () => {
      const raw = JSON.stringify(validSect);
      const errors = auditSectSaveData(raw, raw.length);
      expect(errors).toEqual([]);
    });

    it("file vượt quá MAX_FILE_SIZE -> file_too_large", () => {
      const errors = auditSectSaveData("{}", MAX_FILE_SIZE + 1);
      expect(errors.map((e) => e.code)).toContain("file_too_large");
    });

    it("JSON hỏng hoặc không phải object -> invalid_json / not_an_object", () => {
      expect(auditSectSaveData("invalid json", 12).map((e) => e.code)).toContain("invalid_json");
      expect(auditSectSaveData("[]", 2).map((e) => e.code)).toContain("not_an_object");
      expect(auditSectSaveData("null", 4).map((e) => e.code)).toContain("not_an_object");
    });

    it("v !== 1 -> invalid_sect_version", () => {
      const raw = JSON.stringify({ ...validSect, v: 2 });
      expect(auditSectSaveData(raw, raw.length).map((e) => e.code)).toContain(
        "invalid_sect_version",
      );
    });

    it("id không hợp lệ -> invalid_sect_id", () => {
      for (const badId of ["", "id có dấu cách", "id!@#$", "a".repeat(65)]) {
        const raw = JSON.stringify({ ...validSect, id: badId });
        expect(auditSectSaveData(raw, raw.length).map((e) => e.code)).toContain("invalid_sect_id");
      }
    });

    it("name và tag sai luật -> invalid_sect_name, invalid_sect_tag", () => {
      const badNames = [
        "",
        "A",
        "Tên Tông Môn Rất Dài Quá Mười Sáu Ký Tự Này",
        "Tông\tMôn",
        "Tông<br>Môn",
      ];
      for (const name of badNames) {
        const raw = JSON.stringify({ ...validSect, name });
        expect(auditSectSaveData(raw, raw.length).map((e) => e.code)).toContain(
          "invalid_sect_name",
        );
      }
      const badTags = ["", "A", "TAGQUADAICANTREN6KYTU", "T G", "tag#1"];
      for (const tag of badTags) {
        const raw = JSON.stringify({ ...validSect, tag });
        expect(auditSectSaveData(raw, raw.length).map((e) => e.code)).toContain("invalid_sect_tag");
      }
    });

    it("danh sách thành viên rỗng hoặc vượt SECT_MAX_MEMBERS -> invalid_sect_members", () => {
      const rawEmpty = JSON.stringify({ ...validSect, members: [] });
      expect(auditSectSaveData(rawEmpty, rawEmpty.length).map((e) => e.code)).toContain(
        "invalid_sect_members",
      );

      const tooMany = Array.from({ length: SECT_MAX_MEMBERS + 1 }, (_, i) => ({
        soulKey: `soul_${i}`,
        name: `Đệ Tử ${i}`,
        rank: i === 0 ? "chu" : ("de_tu" as const),
        joinedAt: 1700000000000 + i,
      }));
      const rawTooMany = JSON.stringify({ ...validSect, leader: "soul_0", members: tooMany });
      expect(auditSectSaveData(rawTooMany, rawTooMany.length).map((e) => e.code)).toContain(
        "invalid_sect_members",
      );
    });

    it("leader lệch hoặc không có đúng 1 Tông chủ -> invalid_sect_leader_match", () => {
      // Leader không khớp với ai
      const raw1 = JSON.stringify({ ...validSect, leader: "soul_khac" });
      expect(auditSectSaveData(raw1, raw1.length).map((e) => e.code)).toContain(
        "invalid_sect_leader_match",
      );

      // Hai Tông chủ
      const raw2 = JSON.stringify({
        ...validSect,
        members: [
          { soulKey: "soul_chu_1", name: "Huyền Chân Tử", rank: "chu", joinedAt: 1700000000000 },
          { soulKey: "soul_chu_2", name: "Đạo Chủ Hai", rank: "chu", joinedAt: 1700000001000 },
        ],
      });
      expect(auditSectSaveData(raw2, raw2.length).map((e) => e.code)).toContain(
        "invalid_sect_leader_match",
      );

      // Không có Tông chủ nào
      const raw3 = JSON.stringify({
        ...validSect,
        members: [
          {
            soulKey: "soul_chu_1",
            name: "Huyền Chân Tử",
            rank: "truong_lao",
            joinedAt: 1700000000000,
          },
        ],
      });
      expect(auditSectSaveData(raw3, raw3.length).map((e) => e.code)).toContain(
        "invalid_sect_leader_match",
      );
    });

    it("quá SECT_ELDERS_MAX Trưởng lão -> too_many_elders", () => {
      const elders = Array.from({ length: SECT_ELDERS_MAX + 1 }, (_, i) => ({
        soulKey: `soul_lao_${i}`,
        name: `Trưởng Lão ${i}`,
        rank: "truong_lao",
        joinedAt: 1700000000000 + i,
      }));
      const raw = JSON.stringify({
        ...validSect,
        members: [validSect.members[0], ...elders],
      });
      expect(auditSectSaveData(raw, raw.length).map((e) => e.code)).toContain("too_many_elders");
    });

    it("thành viên trùng soulKey trong cùng tông môn -> duplicate_sect_member", () => {
      const raw = JSON.stringify({
        ...validSect,
        members: [
          validSect.members[0],
          {
            soulKey: "soul_chu_1",
            name: "Huyền Chân Tử Hai",
            rank: "de_tu",
            joinedAt: 1700000001000,
          },
        ],
      });
      expect(auditSectSaveData(raw, raw.length).map((e) => e.code)).toContain(
        "duplicate_sect_member",
      );
    });

    it("coin âm, số thực hoặc vượt SECT_COIN_CAP -> invalid_sect_coin", () => {
      for (const badCoin of [-1, 10.5, SECT_COIN_CAP + 1, Infinity, "1000"]) {
        const raw = JSON.stringify({ ...validSect, coin: badCoin });
        expect(auditSectSaveData(raw, raw.length).map((e) => e.code)).toContain(
          "invalid_sect_coin",
        );
      }
    });

    it("sổ kho vượt SECT_LOG_MAX hoặc entry hỏng -> invalid_sect_log / invalid_sect_log_entry", () => {
      const bigLog = Array.from({ length: SECT_LOG_MAX + 1 }, (_, i) => ({
        at: 1700000000000 + i,
        name: "Huyền Chân Tử",
        kind: "deposit",
        amount: 100,
      }));
      const raw1 = JSON.stringify({ ...validSect, log: bigLog });
      expect(auditSectSaveData(raw1, raw1.length).map((e) => e.code)).toContain("invalid_sect_log");

      const badLogEntry = JSON.stringify({
        ...validSect,
        log: [{ at: 1700000000000, name: "Huyền Chân Tử", kind: "bad_kind", amount: -5 }],
      });
      const errs = auditSectSaveData(badLogEntry, badLogEntry.length).map((e) => e.code);
      expect(errs).toContain("invalid_sect_log_kind");
      expect(errs).toContain("invalid_sect_log_amount");
    });

    it("kho đồ (vault) hợp lệ kèm draw của thành viên: 0 lỗi", () => {
      const validVault = {
        slots: Array.from({ length: SECT_VAULT_SLOTS }, (_, i) =>
          i === 0 ? { itemId: "hoi_huyet_dan", qty: 5 } : null,
        ),
        log: [
          {
            at: 1700000004000,
            name: "Huyền Chân Tử",
            kind: "deposit",
            itemId: "hoi_huyet_dan",
            qty: 5,
          },
        ],
        drawPerDay: 3,
      };
      const sectWithVault = {
        ...validSect,
        members: [
          validSect.members[0],
          validSect.members[1],
          {
            ...validSect.members[2],
            draw: { day: "2026-11-16", n: 2 },
          },
        ],
        vault: validVault,
      };
      const raw = JSON.stringify(sectWithVault);
      expect(auditSectSaveData(raw, raw.length)).toEqual([]);
    });

    it("vault không phải object -> invalid_sect_vault", () => {
      for (const badVault of [null, "vault", [1, 2, 3], 123]) {
        const raw = JSON.stringify({ ...validSect, vault: badVault });
        expect(auditSectSaveData(raw, raw.length).map((e) => e.code)).toContain(
          "invalid_sect_vault",
        );
      }
    });

    it("vault.slots không đúng SECT_VAULT_SLOTS hoặc chứa ô hỏng -> invalid_sect_vault_slots / invalid_sect_vault_slot", () => {
      const badLen = JSON.stringify({
        ...validSect,
        vault: { slots: [null, null], log: [], drawPerDay: 3 },
      });
      expect(auditSectSaveData(badLen, badLen.length).map((e) => e.code)).toContain(
        "invalid_sect_vault_slots",
      );

      const badSlot = JSON.stringify({
        ...validSect,
        vault: {
          slots: Array.from({ length: SECT_VAULT_SLOTS }, (_, i) => (i === 0 ? "hỏng" : null)),
          log: [],
          drawPerDay: 3,
        },
      });
      expect(auditSectSaveData(badSlot, badSlot.length).map((e) => e.code)).toContain(
        "invalid_sect_vault_slot",
      );
    });

    it("vault.slots có món lạ hoặc qty ngoài [1, stack] -> unknown_sect_vault_item / invalid_sect_vault_qty", () => {
      const badItem = JSON.stringify({
        ...validSect,
        vault: {
          slots: Array.from({ length: SECT_VAULT_SLOTS }, (_, i) =>
            i === 0 ? { itemId: "mon_la_khong_ton_tai", qty: 1 } : null,
          ),
          log: [],
          drawPerDay: 3,
        },
      });
      expect(auditSectSaveData(badItem, badItem.length).map((e) => e.code)).toContain(
        "unknown_sect_vault_item",
      );

      // hoi_huyet_dan stack tối đa là 20. Kiểm tra qty = 0, qty = 21, qty không nguyên
      for (const badQty of [0, -1, 21, 2.5, Infinity]) {
        const badQtyJson = JSON.stringify({
          ...validSect,
          vault: {
            slots: Array.from({ length: SECT_VAULT_SLOTS }, (_, i) =>
              i === 0 ? { itemId: "hoi_huyet_dan", qty: badQty } : null,
            ),
            log: [],
            drawPerDay: 3,
          },
        });
        expect(auditSectSaveData(badQtyJson, badQtyJson.length).map((e) => e.code)).toContain(
          "invalid_sect_vault_qty",
        );
      }
    });

    it("vault.log vượt SECT_VAULT_LOG_MAX hoặc entry hỏng -> invalid_sect_vault_log*", () => {
      const bigLog = Array.from({ length: SECT_VAULT_LOG_MAX + 1 }, (_, i) => ({
        at: 1700000000000 + i,
        name: "Huyền Chân Tử",
        kind: "deposit",
        itemId: "hoi_huyet_dan",
        qty: 1,
      }));
      const rawBig = JSON.stringify({
        ...validSect,
        vault: {
          slots: Array.from({ length: SECT_VAULT_SLOTS }, () => null),
          log: bigLog,
          drawPerDay: 3,
        },
      });
      expect(auditSectSaveData(rawBig, rawBig.length).map((e) => e.code)).toContain(
        "invalid_sect_vault_log",
      );

      const badEntries = JSON.stringify({
        ...validSect,
        vault: {
          slots: Array.from({ length: SECT_VAULT_SLOTS }, () => null),
          log: [
            {
              at: "hỏng",
              name: "",
              kind: "hack",
              itemId: "mon_la",
              qty: SECT_VAULT_QTY_MAX + 10,
            },
          ],
          drawPerDay: 3,
        },
      });
      const codes = auditSectSaveData(badEntries, badEntries.length).map((e) => e.code);
      expect(codes).toContain("invalid_sect_vault_log_time");
      expect(codes).toContain("invalid_sect_vault_log_name");
      expect(codes).toContain("invalid_sect_vault_log_kind");
      expect(codes).toContain("unknown_sect_vault_log_item");
      expect(codes).toContain("invalid_sect_vault_log_qty");
    });

    it("vault.drawPerDay ngoài khung [0, SECT_VAULT_DRAW_MAX] -> invalid_sect_vault_draw_policy", () => {
      for (const badPolicy of [-1, SECT_VAULT_DRAW_MAX + 1, 2.5, "3"]) {
        const raw = JSON.stringify({
          ...validSect,
          vault: {
            slots: Array.from({ length: SECT_VAULT_SLOTS }, () => null),
            log: [],
            drawPerDay: badPolicy,
          },
        });
        expect(auditSectSaveData(raw, raw.length).map((e) => e.code)).toContain(
          "invalid_sect_vault_draw_policy",
        );
      }
    });

    it("members[i].draw không hợp lệ -> invalid_sect_member_draw*", () => {
      // draw không phải object
      const raw1 = JSON.stringify({
        ...validSect,
        members: [{ ...validSect.members[0], draw: "2026-11-16" }],
      });
      expect(auditSectSaveData(raw1, raw1.length).map((e) => e.code)).toContain(
        "invalid_sect_member_draw",
      );

      // day sai format
      const raw2 = JSON.stringify({
        ...validSect,
        members: [{ ...validSect.members[0], draw: { day: "16-11-2026", n: 1 } }],
      });
      expect(auditSectSaveData(raw2, raw2.length).map((e) => e.code)).toContain(
        "invalid_sect_member_draw_day",
      );

      // n âm hoặc không phải số nguyên
      const raw3 = JSON.stringify({
        ...validSect,
        members: [{ ...validSect.members[0], draw: { day: "2026-11-16", n: -1 } }],
      });
      expect(auditSectSaveData(raw3, raw3.length).map((e) => e.code)).toContain(
        "invalid_sect_member_draw_count",
      );
    });

    it("đột biến: nới lỏng kiểm tra kho đồ (bỏ qua kiểm tra độ dài slots hoặc tra cứu itemId bằng TABLE[id] trực tiếp)", () => {
      // Đột biến 1: không kiểm tra độ dài slots (chấp nhận bất kỳ mảng nào)
      const laxSlotsCheck = (slots: any) => Array.isArray(slots);
      expect(laxSlotsCheck([null, null])).toBe(true);

      // Đột biến 2: tra cứu itemId không dùng byId
      const unsafeLookup = (TABLE: any, id: string) => TABLE[id];
      expect(typeof unsafeLookup(ITEM_BY_ID, "constructor")).toBe("function");

      // Hàm auditSectSaveData THẬT bắt buộc phát hiện cả hai:
      const badSlots = JSON.stringify({
        ...validSect,
        vault: { slots: [null, null], log: [], drawPerDay: 3 },
      });
      expect(auditSectSaveData(badSlots, badSlots.length).map((e) => e.code)).toContain(
        "invalid_sect_vault_slots",
      );

      const badCtor = JSON.stringify({
        ...validSect,
        vault: {
          slots: Array.from({ length: SECT_VAULT_SLOTS }, (_, i) =>
            i === 0 ? { itemId: "constructor", qty: 1 } : null,
          ),
          log: [],
          drawPerDay: 3,
        },
      });
      expect(auditSectSaveData(badCtor, badCtor.length).map((e) => e.code)).toContain(
        "unknown_sect_vault_item",
      );
    });

    it("M8: points sai kiểu / âm / vượt cap -> invalid_sect_points", () => {
      for (const badPoints of [-1, 1.5, Infinity, "100", SECT_POINTS_CAP + 1]) {
        const raw = JSON.stringify({ ...validSect, points: badPoints });
        expect(auditSectSaveData(raw, raw.length).map((e) => e.code)).toContain(
          "invalid_sect_points",
        );
      }
    });

    it("M8: contrib và merit của thành viên sai kiểu / âm / vượt cap", () => {
      // contrib hỏng
      for (const badContrib of [-1, 2.5, Infinity, SECT_CONTRIB_CAP + 1]) {
        const raw = JSON.stringify({
          ...validSect,
          members: [{ ...validSect.members[0], contrib: badContrib }],
        });
        expect(auditSectSaveData(raw, raw.length).map((e) => e.code)).toContain(
          "invalid_sect_member_contrib",
        );
      }

      // merit hỏng
      for (const badMerit of [-1, 3.5, Infinity, SECT_POINTS_CAP + 1]) {
        const raw = JSON.stringify({
          ...validSect,
          members: [{ ...validSect.members[0], merit: badMerit }],
        });
        expect(auditSectSaveData(raw, raw.length).map((e) => e.code)).toContain(
          "invalid_sect_member_merit",
        );
      }
    });

    it("M8: bất biến contrib <= merit -> sect_member_contrib_exceeds_merit", () => {
      const raw = JSON.stringify({
        ...validSect,
        members: [{ ...validSect.members[0], contrib: 50, merit: 30 }],
      });
      expect(auditSectSaveData(raw, raw.length).map((e) => e.code)).toContain(
        "sect_member_contrib_exceeds_merit",
      );
    });

    it("M8: bất biến points >= tổng merit thành viên hiện tại -> sect_points_less_than_members_merit", () => {
      const raw = JSON.stringify({
        ...validSect,
        points: 50,
        members: [
          { ...validSect.members[0], merit: 40 },
          { ...validSect.members[1], merit: 30 },
        ],
      });
      expect(auditSectSaveData(raw, raw.length).map((e) => e.code)).toContain(
        "sect_points_less_than_members_merit",
      );
    });

    it("M8: today của thành viên hỏng (day, earned, deposit, quests, dungeon, buys)", () => {
      // today không phải object
      const rawNotObj = JSON.stringify({
        ...validSect,
        members: [{ ...validSect.members[0], today: "hôm nay" }],
      });
      expect(auditSectSaveData(rawNotObj, rawNotObj.length).map((e) => e.code)).toContain(
        "invalid_sect_member_today",
      );

      // today.day sai định dạng
      const rawBadDay = JSON.stringify({
        ...validSect,
        members: [{ ...validSect.members[0], today: { day: "2026/11/17", earned: 50 } }],
      });
      expect(auditSectSaveData(rawBadDay, rawBadDay.length).map((e) => e.code)).toContain(
        "invalid_sect_member_today_day",
      );

      // today.earned âm hoặc vượt cap
      const rawBadEarned = JSON.stringify({
        ...validSect,
        members: [
          { ...validSect.members[0], today: { day: "2026-11-17", earned: SECT_EARN_DAY_CAP + 1 } },
        ],
      });
      expect(auditSectSaveData(rawBadEarned, rawBadEarned.length).map((e) => e.code)).toContain(
        "invalid_sect_member_today_earned",
      );

      // today.deposit vượt earned hoặc vượt cap
      const rawDepExceedsEarned = JSON.stringify({
        ...validSect,
        members: [
          { ...validSect.members[0], today: { day: "2026-11-17", earned: 10, deposit: 20 } },
        ],
      });
      expect(
        auditSectSaveData(rawDepExceedsEarned, rawDepExceedsEarned.length).map((e) => e.code),
      ).toContain("invalid_sect_member_today_deposit_exceeds_earned");

      const rawDepExceedsCap = JSON.stringify({
        ...validSect,
        members: [
          {
            ...validSect.members[0],
            today: {
              day: "2026-11-17",
              earned: SECT_DEPOSIT_DAY_CAP + 1,
              deposit: SECT_DEPOSIT_DAY_CAP + 1,
            },
          },
        ],
      });
      expect(
        auditSectSaveData(rawDepExceedsCap, rawDepExceedsCap.length).map((e) => e.code),
      ).toContain("invalid_sect_member_today_deposit");

      // today.quests chứa mẫu không hợp lệ hoặc trùng lặp
      const rawBadQuest = JSON.stringify({
        ...validSect,
        members: [
          {
            ...validSect.members[0],
            today: { day: "2026-11-17", earned: 0, quests: ["mau_khong_ton_tai"] },
          },
        ],
      });
      expect(auditSectSaveData(rawBadQuest, rawBadQuest.length).map((e) => e.code)).toContain(
        "invalid_sect_member_today_quest_template",
      );

      const rawDupQuest = JSON.stringify({
        ...validSect,
        members: [
          {
            ...validSect.members[0],
            today: {
              day: "2026-11-17",
              earned: 0,
              quests: ["st_tru_lang", "st_tru_lang"],
            },
          },
        ],
      });
      expect(auditSectSaveData(rawDupQuest, rawDupQuest.length).map((e) => e.code)).toContain(
        "duplicate_sect_member_today_quest",
      );

      // today.quests vượt quá SECT_QUEST_SLOTS (3) -> sect_member_today_quests_exceed_slots
      const rawTooManyQuests = JSON.stringify({
        ...validSect,
        members: [
          {
            ...validSect.members[0],
            today: {
              day: "2026-11-17",
              earned: 0,
              quests: ["st_tru_lang", "st_nop_nanh", "st_tru_ho", "st_tru_lang_extra"],
            },
          },
        ],
      });
      expect(
        auditSectSaveData(rawTooManyQuests, rawTooManyQuests.length).map((e) => e.code),
      ).toContain("sect_member_today_quests_exceed_slots");

      // today.dungeon không phải boolean
      const rawBadDungeon = JSON.stringify({
        ...validSect,
        members: [
          { ...validSect.members[0], today: { day: "2026-11-17", earned: 0, dungeon: "yes" } },
        ],
      });
      expect(auditSectSaveData(rawBadDungeon, rawBadDungeon.length).map((e) => e.code)).toContain(
        "invalid_sect_member_today_dungeon",
      );

      // today.buys chứa món lạ hoặc vượt số lượng giới hạn ngày
      const rawBadBuysItem = JSON.stringify({
        ...validSect,
        members: [
          {
            ...validSect.members[0],
            today: { day: "2026-11-17", earned: 0, buys: { mon_la_khong_ban: 1 } },
          },
        ],
      });
      expect(auditSectSaveData(rawBadBuysItem, rawBadBuysItem.length).map((e) => e.code)).toContain(
        "invalid_sect_member_today_buy_item",
      );

      const shopEntry = SECT_SHOP[0];
      const rawBadBuysQty = JSON.stringify({
        ...validSect,
        members: [
          {
            ...validSect.members[0],
            today: {
              day: "2026-11-17",
              earned: 0,
              buys: { [shopEntry.itemId]: shopEntry.limitDay + 1 },
            },
          },
        ],
      });
      expect(auditSectSaveData(rawBadBuysQty, rawBadBuysQty.length).map((e) => e.code)).toContain(
        "invalid_sect_member_today_buy_qty",
      );
    });

    it("M8.10: today.buys món mở ở cấp tông cao hơn cấp HIỆN TẠI -> sect_member_today_buy_level_too_high (quét MỌI món SECT_SHOP thật, đúng cấp hợp lệ, liền dưới cấp thì lỗi)", () => {
      const levelPoints = (lv: number) => SECT_LEVELS.find((l) => l.level === lv)!.points;
      const rawAt = (itemId: string, qty: number, points: number) =>
        JSON.stringify({
          ...validSect,
          points,
          members: [
            {
              ...validSect.members[0],
              today: { day: "2026-11-17", earned: 0, buys: { [itemId]: qty } },
            },
          ],
        });
      const codesOf = (raw: string) => auditSectSaveData(raw, raw.length).map((e) => e.code);
      let lowered = 0;
      for (const e of SECT_SHOP) {
        // đúng cấp mở món: hợp lệ (không lỗi nào)
        expect(codesOf(rawAt(e.itemId, 1, levelPoints(e.minLevel))), e.itemId).toEqual([]);
        // một điểm dưới ngưỡng cấp mở món: cấp tông còn thấp hơn minLevel -> lỗi (cấp 1 không có cấp dưới)
        if (e.minLevel > 1) {
          lowered++;
          expect(codesOf(rawAt(e.itemId, 1, levelPoints(e.minLevel) - 1)), e.itemId).toContain(
            "sect_member_today_buy_level_too_high",
          );
          // qty = 0 (khoá có mặt nhưng chưa mua) không phải bằng chứng mua: không lỗi cấp
          expect(codesOf(rawAt(e.itemId, 0, levelPoints(e.minLevel) - 1)), e.itemId).not.toContain(
            "sect_member_today_buy_level_too_high",
          );
        }
      }
      // bảng thật phải có món mở sau cấp 1, không thì vòng lặp trên chẳng kiểm gì
      expect(lowered).toBeGreaterThan(10);
    });

    it("M8: today.earned vượt quá tổng cống hiến các nguồn đã ghi nhận -> sect_member_today_earned_exceeds_sources (kèm các ca ranh giới nguồn)", () => {
      // 1. Không có nguồn nào: maxFromSources = 0. earned = 0 thì hợp lệ, earned = 1 thì lỗi
      const makeTodaySect = (today: Record<string, unknown>) =>
        JSON.stringify({
          ...validSect,
          members: [
            {
              ...validSect.members[0],
              today: { day: "2026-11-17", ...today },
            },
          ],
        });

      const rawZeroClean = makeTodaySect({ earned: 0, deposit: 0, quests: [], dungeon: false });
      expect(auditSectSaveData(rawZeroClean, rawZeroClean.length).map((e) => e.code)).not.toContain(
        "sect_member_today_earned_exceeds_sources",
      );

      const rawZeroExceed = makeTodaySect({ earned: 1, deposit: 0, quests: [], dungeon: false });
      expect(auditSectSaveData(rawZeroExceed, rawZeroExceed.length).map((e) => e.code)).toContain(
        "sect_member_today_earned_exceeds_sources",
      );

      // 2. Ranh giới Bí cảnh (dungeon): SECT_DUNGEON_CH = 20
      // earned = 20 -> sạch, earned = 21 -> lỗi
      const rawDungeonClean = makeTodaySect({ earned: 20, deposit: 0, quests: [], dungeon: true });
      expect(
        auditSectSaveData(rawDungeonClean, rawDungeonClean.length).map((e) => e.code),
      ).not.toContain("sect_member_today_earned_exceeds_sources");

      const rawDungeonExceed = makeTodaySect({ earned: 21, deposit: 0, quests: [], dungeon: true });
      expect(
        auditSectSaveData(rawDungeonExceed, rawDungeonExceed.length).map((e) => e.code),
      ).toContain("sect_member_today_earned_exceeds_sources");

      // 3. Ranh giới Mẫu lạ ngoài bảng fixture: mặc định bậc 3 an toàn (40 CH)
      // earned = 40 -> sạch, earned = 41 -> lỗi
      const rawUnknownClean = makeTodaySect({
        earned: 40,
        deposit: 0,
        quests: ["khong_co_trong_bang"],
        dungeon: false,
      });
      expect(
        auditSectSaveData(rawUnknownClean, rawUnknownClean.length).map((e) => e.code),
      ).not.toContain("sect_member_today_earned_exceeds_sources");

      const rawUnknownExceed = makeTodaySect({
        earned: 41,
        deposit: 0,
        quests: ["khong_co_trong_bang"],
        dungeon: false,
      });
      expect(
        auditSectSaveData(rawUnknownExceed, rawUnknownExceed.length).map((e) => e.code),
      ).toContain("sect_member_today_earned_exceeds_sources");

      // 4. Ranh giới theo từng bậc của fixture:
      // - st_tru_lang (độ khó 1, 20 CH): 20 sạch, 21 lỗi
      const rawQ1Clean = makeTodaySect({
        earned: 20,
        deposit: 0,
        quests: ["st_tru_lang"],
        dungeon: false,
      });
      expect(auditSectSaveData(rawQ1Clean, rawQ1Clean.length).map((e) => e.code)).not.toContain(
        "sect_member_today_earned_exceeds_sources",
      );

      const rawQ1Exceed = makeTodaySect({
        earned: 21,
        deposit: 0,
        quests: ["st_tru_lang"],
        dungeon: false,
      });
      expect(auditSectSaveData(rawQ1Exceed, rawQ1Exceed.length).map((e) => e.code)).toContain(
        "sect_member_today_earned_exceeds_sources",
      );

      // - st_nop_nanh (độ khó 2, 30 CH): 30 sạch, 31 lỗi
      const rawQ2Clean = makeTodaySect({
        earned: 30,
        deposit: 0,
        quests: ["st_nop_nanh"],
        dungeon: false,
      });
      expect(auditSectSaveData(rawQ2Clean, rawQ2Clean.length).map((e) => e.code)).not.toContain(
        "sect_member_today_earned_exceeds_sources",
      );

      const rawQ2Exceed = makeTodaySect({
        earned: 31,
        deposit: 0,
        quests: ["st_nop_nanh"],
        dungeon: false,
      });
      expect(auditSectSaveData(rawQ2Exceed, rawQ2Exceed.length).map((e) => e.code)).toContain(
        "sect_member_today_earned_exceeds_sources",
      );

      // - st_tru_ho (độ khó 3, 40 CH): 40 sạch, 41 lỗi
      const rawQ3Clean = makeTodaySect({
        earned: 40,
        deposit: 0,
        quests: ["st_tru_ho"],
        dungeon: false,
      });
      expect(auditSectSaveData(rawQ3Clean, rawQ3Clean.length).map((e) => e.code)).not.toContain(
        "sect_member_today_earned_exceeds_sources",
      );

      const rawQ3Exceed = makeTodaySect({
        earned: 41,
        deposit: 0,
        quests: ["st_tru_ho"],
        dungeon: false,
      });
      expect(auditSectSaveData(rawQ3Exceed, rawQ3Exceed.length).map((e) => e.code)).toContain(
        "sect_member_today_earned_exceeds_sources",
      );

      // 5. Kết hợp nhiều nguồn: góp kho 15 + bí cảnh 20 + st_tru_lang (20) + st_nop_nanh (30) = 85
      // earned = 85 -> sạch, earned = 86 -> lỗi
      const rawComboClean = makeTodaySect({
        earned: 85,
        deposit: 15,
        quests: ["st_tru_lang", "st_nop_nanh"],
        dungeon: true,
      });
      expect(
        auditSectSaveData(rawComboClean, rawComboClean.length).map((e) => e.code),
      ).not.toContain("sect_member_today_earned_exceeds_sources");

      const rawComboExceed = makeTodaySect({
        earned: 86,
        deposit: 15,
        quests: ["st_tru_lang", "st_nop_nanh"],
        dungeon: true,
      });
      expect(auditSectSaveData(rawComboExceed, rawComboExceed.length).map((e) => e.code)).toContain(
        "sect_member_today_earned_exceeds_sources",
      );
    });

    it("M8: ô kho vượt quá cấp tông môn bị khoá nhưng chứa vật phẩm -> sect_vault_locked_slot_not_empty", () => {
      // Cấp 1 (points = 0) chỉ mở 40 ô (SECT_VAULT_SLOTS). Mảng 80 ô (SECT_VAULT_SLOTS_MAX), ô thứ 40 (index 40) có đồ -> lỗi
      const slots = Array.from({ length: SECT_VAULT_SLOTS_MAX }, (_, i) =>
        i === 40 ? { itemId: "hoi_huyet_dan", qty: 5 } : null,
      );
      const raw = JSON.stringify({
        ...validSect,
        points: 0,
        vault: { slots, log: [], drawPerDay: 3 },
      });
      expect(auditSectSaveData(raw, raw.length).map((e) => e.code)).toContain(
        "sect_vault_locked_slot_not_empty",
      );
    });

    it("M8: tông môn cấp 2 hợp lệ đầy đủ các trường M8 -> 0 lỗi", () => {
      const fullM8Sect = {
        ...validSect,
        points: 1500, // Cấp 2 (ngưỡng 1000..3999, maxMembers: 35, maxElders: 4, vaultSlots: 50)
        members: [
          {
            soulKey: "soul_chu_1",
            name: "Huyền Chân Tử",
            rank: "chu",
            joinedAt: 1700000000000,
            contrib: 80,
            merit: 100,
            today: {
              day: "2026-11-17",
              earned: 80,
              deposit: 20,
              quests: ["st_tru_lang", "st_tru_ho"],
              dungeon: true,
              buys: { [SECT_SHOP[0].itemId]: 1 },
            },
          },
          {
            soulKey: "soul_lao_1",
            name: "Thanh Hư Đạo",
            rank: "truong_lao",
            joinedAt: 1700000001000,
            contrib: 50,
            merit: 70,
          },
        ],
        vault: {
          slots: Array.from({ length: SECT_VAULT_SLOTS_MAX }, (_, i) =>
            i < 50 ? { itemId: "hoi_huyet_dan", qty: 1 } : null,
          ),
          log: [],
          drawPerDay: 5,
        },
      };
      const raw = JSON.stringify(fullM8Sect);
      const errors = auditSectSaveData(raw, raw.length);
      expect(errors).toEqual([]);
    });

    it("quét thư mục sects/: phát hiện lệch tên file, trùng tên, trùng tag, và thành viên ở 2 tông môn", () => {
      const sectsDir = path.join(tmpDir, "sects");
      mkdirSync(sectsDir, { recursive: true });

      // Tông môn 1 hợp lệ
      writeFileSync(
        path.join(sectsDir, "sect-001.json"),
        JSON.stringify({ ...validSect, id: "sect-001" }),
        "utf8",
      );

      // Tông môn 2: tên file sect-other.json lệch id sect-002
      writeFileSync(
        path.join(sectsDir, "sect-other.json"),
        JSON.stringify({
          ...validSect,
          id: "sect-002",
          name: "Tông Môn Hai",
          tag: "TM2",
          leader: "soul_chu_2",
          members: [
            { soulKey: "soul_chu_2", name: "Chủ Hai", rank: "chu", joinedAt: 1700000000000 },
          ],
        }),
        "utf8",
      );

      // Tông môn 3: trùng tên (theo sectKey) với tông môn 1
      writeFileSync(
        path.join(sectsDir, "sect-003.json"),
        JSON.stringify({
          ...validSect,
          id: "sect-003",
          name: "thái huyền tông",
          tag: "TM3",
          leader: "soul_chu_3",
          members: [
            { soulKey: "soul_chu_3", name: "Chủ Ba", rank: "chu", joinedAt: 1700000000000 },
          ],
        }),
        "utf8",
      );

      // Tông môn 4: trùng biệt hiệu (theo sectKey) với tông môn 1
      writeFileSync(
        path.join(sectsDir, "sect-004.json"),
        JSON.stringify({
          ...validSect,
          id: "sect-004",
          name: "Tông Môn Bốn",
          tag: "th",
          leader: "soul_chu_4",
          members: [
            { soulKey: "soul_chu_4", name: "Chủ Bốn", rank: "chu", joinedAt: 1700000000000 },
          ],
        }),
        "utf8",
      );

      // Tông môn 5: có thành viên soul_lao_1 (đã ở tông môn 1)
      writeFileSync(
        path.join(sectsDir, "sect-005.json"),
        JSON.stringify({
          ...validSect,
          id: "sect-005",
          name: "Tông Môn Năm",
          tag: "TM5",
          leader: "soul_chu_5",
          members: [
            { soulKey: "soul_chu_5", name: "Chủ Năm", rank: "chu", joinedAt: 1700000000000 },
            {
              soulKey: "soul_lao_1",
              name: "Thanh Hư Đạo",
              rank: "truong_lao",
              joinedAt: 1700000001000,
            },
          ],
        }),
        "utf8",
      );

      // File cách ly và file tạm phải bị bỏ qua
      writeFileSync(path.join(sectsDir, "sect-006.hong-123.json"), "invalid json", "utf8");
      writeFileSync(path.join(sectsDir, "sect-007.tmp"), "tmp data", "utf8");

      const report = auditSavesDirectory(tmpDir);
      expect(report.totalSects).toBe(5);
      expect(report.cleanSects).toBe(1);
      expect(report.errorSects).toBe(4);
      expect(report.errorsByCode.mismatched_sect_filename).toBe(1);
      expect(report.errorsByCode.duplicate_sect_name).toBe(1);
      expect(report.errorsByCode.duplicate_sect_tag).toBe(1);
      expect(report.errorsByCode.member_in_multiple_sects).toBe(1);
    });
  });

  describe("M7.11 / #512: audit sổ chiêu (skills) & khắc chân linh (engraved)", () => {
    it("hồ sơ có skills hợp lệ -> 0 lỗi", () => {
      // Nhân vật Trúc Cơ (realm 2): mở ô 2 và ô 3
      const playerWithSkills = {
        ...validPlayer,
        realm: 2,
        tier: 0,
        skills: {
          learned: { ung_trao: 1, hoa_van_kiem: 2, bon_thach_quyen: 3 },
          slots: ["hoa_van_kiem", "ung_trao", "", ""],
        },
      };
      const errors = auditPlayerSaveData(JSON.stringify(playerWithSkills), 500);
      expect(errors).toEqual([]);
    });

    it("phát hiện skills không phải JSON object -> invalid_skills_book", () => {
      for (const bad of ["abc", 123, true, []]) {
        const raw = JSON.stringify({ ...validPlayer, skills: bad });
        const errors = auditPlayerSaveData(raw, raw.length);
        expect(errors.some((e) => e.code === "invalid_skills_book")).toBe(true);
      }
    });

    it("phát hiện skills.learned không phải object -> invalid_skills_learned", () => {
      const raw = JSON.stringify({ ...validPlayer, skills: { learned: ["ung_trao"] } });
      const errors = auditPlayerSaveData(raw, raw.length);
      expect(errors.some((e) => e.code === "invalid_skills_learned")).toBe(true);
    });

    it("phát hiện chiêu lạ trong skills.learned -> unknown_skill", () => {
      const raw = JSON.stringify({
        ...validPlayer,
        skills: { learned: { chieu_la_khong_ton_tai: 1 } },
      });
      const errors = auditPlayerSaveData(raw, raw.length);
      expect(errors.some((e) => e.code === "unknown_skill")).toBe(true);
    });

    it("phát hiện tầng chiêu không hợp lệ trong skills.learned -> invalid_skill_level", () => {
      for (const badLv of [0, -1, 4, 1.5, "2"]) {
        const raw = JSON.stringify({
          ...validPlayer,
          skills: { learned: { ung_trao: badLv } },
        });
        const errors = auditPlayerSaveData(raw, raw.length);
        expect(errors.some((e) => e.code === "invalid_skill_level")).toBe(true);
      }
    });

    it("phát hiện skills.slots sai định dạng (không phải mảng hoặc sai độ dài) -> invalid_skills_slots / length", () => {
      const rawNotArr = JSON.stringify({ ...validPlayer, skills: { slots: "ung_trao" } });
      expect(
        auditPlayerSaveData(rawNotArr, rawNotArr.length).some(
          (e) => e.code === "invalid_skills_slots",
        ),
      ).toBe(true);

      const rawWrongLen = JSON.stringify({ ...validPlayer, skills: { slots: ["ung_trao", ""] } });
      expect(
        auditPlayerSaveData(rawWrongLen, rawWrongLen.length).some(
          (e) => e.code === "invalid_skills_slots_length",
        ),
      ).toBe(true);
    });

    it("phát hiện ô chiêu chứa phần tử không phải chuỗi -> invalid_skills_slot_item", () => {
      const raw = JSON.stringify({
        ...validPlayer,
        skills: { slots: [123, "", "", ""] },
      });
      const errors = auditPlayerSaveData(raw, raw.length);
      expect(errors.some((e) => e.code === "invalid_skills_slot_item")).toBe(true);
    });

    it("phát hiện ô chiêu chứa chiêu lạ -> unknown_skill", () => {
      const raw = JSON.stringify({
        ...validPlayer,
        skills: { slots: ["chieu_la_999", "", "", ""] },
      });
      const errors = auditPlayerSaveData(raw, raw.length);
      expect(errors.some((e) => e.code === "unknown_skill")).toBe(true);
    });

    it("phát hiện ô chiêu chứa chiêu chưa học -> unlearned_skill_in_slot", () => {
      const raw = JSON.stringify({
        ...validPlayer,
        realm: 2,
        skills: {
          learned: { ung_trao: 1 },
          slots: ["hoa_van_kiem", "", "", ""],
        },
      });
      const errors = auditPlayerSaveData(raw, raw.length);
      expect(errors.some((e) => e.code === "unlearned_skill_in_slot")).toBe(true);
    });

    it("phát hiện chiêu bị trùng lặp ở nhiều ô -> duplicate_skill_in_slots", () => {
      const raw = JSON.stringify({
        ...validPlayer,
        realm: 2,
        skills: {
          learned: { ung_trao: 1 },
          slots: ["ung_trao", "ung_trao", "", ""],
        },
      });
      const errors = auditPlayerSaveData(raw, raw.length);
      expect(errors.some((e) => e.code === "duplicate_skill_in_slots")).toBe(true);
    });

    it("phát hiện ô chiêu chưa mở theo cảnh giới -> slot_not_open", () => {
      // Luyện Khí (realm 1) chỉ mở ô 2 (slot index 0). Gán vào ô 3 (slot index 1) hoặc ô 4, 5 phải báo lỗi.
      const raw = JSON.stringify({
        ...validPlayer,
        realm: 1,
        skills: {
          learned: { ung_trao: 1, hoa_van_kiem: 1 },
          slots: ["ung_trao", "hoa_van_kiem", "", ""],
        },
      });
      const errors = auditPlayerSaveData(raw, raw.length);
      expect(errors.some((e) => e.code === "slot_not_open")).toBe(true);
    });

    it("kiểm tra limbo.engravable: hợp lệ, không phải mảng, chiêu lạ, trùng lặp", () => {
      // Hợp lệ
      const good = JSON.stringify({
        ...validPlayer,
        limbo: {
          endedLifeId: "life-12345678",
          summary: {
            kiep: 1,
            realm: 1,
            tier: 0,
            minutes: 10,
            kills: 5,
            bossKills: 0,
            gain: 10,
          },
          keepable: [],
          engravable: ["ung_trao", "hoa_van_kiem"],
          counts: true,
          credited: true,
        },
      });
      expect(auditPlayerSaveData(good, good.length)).toEqual([]);

      // Không phải mảng
      const notArr = JSON.stringify({
        ...validPlayer,
        limbo: {
          endedLifeId: "life-12345678",
          summary: {
            kiep: 1,
            realm: 1,
            tier: 0,
            minutes: 10,
            kills: 5,
            bossKills: 0,
            gain: 10,
          },
          keepable: [],
          engravable: "ung_trao",
          counts: true,
          credited: true,
        },
      });
      expect(
        auditPlayerSaveData(notArr, notArr.length).some(
          (e) => e.code === "invalid_limbo_engravable",
        ),
      ).toBe(true);

      // Chiêu lạ
      const unknown = JSON.stringify({
        ...validPlayer,
        limbo: {
          endedLifeId: "life-12345678",
          summary: {
            kiep: 1,
            realm: 1,
            tier: 0,
            minutes: 10,
            kills: 5,
            bossKills: 0,
            gain: 10,
          },
          keepable: [],
          engravable: ["chieu_ma_quai"],
          counts: true,
          credited: true,
        },
      });
      expect(
        auditPlayerSaveData(unknown, unknown.length).some(
          (e) => e.code === "unknown_limbo_engravable_skill",
        ),
      ).toBe(true);

      // Trùng lặp
      const dup = JSON.stringify({
        ...validPlayer,
        limbo: {
          endedLifeId: "life-12345678",
          summary: {
            kiep: 1,
            realm: 1,
            tier: 0,
            minutes: 10,
            kills: 5,
            bossKills: 0,
            gain: 10,
          },
          keepable: [],
          engravable: ["ung_trao", "ung_trao"],
          counts: true,
          credited: true,
        },
      });
      expect(
        auditPlayerSaveData(dup, dup.length).some((e) => e.code === "duplicate_limbo_engravable"),
      ).toBe(true);
    });

    it("auditSoulSaveData: kiểm tra engraved hợp lệ, vượt nấc mở khóa, chiêu lạ, trùng lặp", () => {
      const baseSoul = {
        v: 1,
        id: "dao_huu",
        kiep: 2,
        duyen: 10,
        duyenTotal: 50,
        unlocks: { khac: 2 },
        origins: [],
        best: { step: 9, realm: 1, tier: 8 },
        createdAt: "2026-11-10T00:00:00.000Z",
        updatedAt: "2026-11-10T00:00:00.000Z",
      };

      // Hợp lệ: mở 2 nấc, có 2 chiêu
      const good = JSON.stringify({ ...baseSoul, engraved: ["ung_trao", "hoa_van_kiem"] });
      expect(auditSoulSaveData(good, good.length)).toEqual([]);

      // Không phải mảng
      const notArr = JSON.stringify({ ...baseSoul, engraved: "ung_trao" });
      expect(
        auditSoulSaveData(notArr, notArr.length).some((e) => e.code === "invalid_soul_engraved"),
      ).toBe(true);

      // Vượt nấc mở khóa: unlocks.khac = 1 nhưng engraved có 2 chiêu
      const exceeds = JSON.stringify({
        ...baseSoul,
        unlocks: { khac: 1 },
        engraved: ["ung_trao", "hoa_van_kiem"],
      });
      expect(
        auditSoulSaveData(exceeds, exceeds.length).some((e) => e.code === "engraved_exceeds_slots"),
      ).toBe(true);

      // Chưa mở khóa khac (unlocks không có khac) nhưng có chiêu khắc
      const unUnlocked = JSON.stringify({
        ...baseSoul,
        unlocks: {},
        engraved: ["ung_trao"],
      });
      expect(
        auditSoulSaveData(unUnlocked, unUnlocked.length).some(
          (e) => e.code === "engraved_exceeds_slots",
        ),
      ).toBe(true);

      // Chiêu lạ
      const unknown = JSON.stringify({ ...baseSoul, engraved: ["chieu_bi_truyen_la"] });
      expect(
        auditSoulSaveData(unknown, unknown.length).some(
          (e) => e.code === "unknown_soul_engraved_skill",
        ),
      ).toBe(true);

      // Trùng lặp
      const dup = JSON.stringify({ ...baseSoul, engraved: ["ung_trao", "ung_trao"] });
      expect(
        auditSoulSaveData(dup, dup.length).some((e) => e.code === "duplicate_soul_engraved"),
      ).toBe(true);
    });

    it("đột biến: nới lỏng kiểm tra slotOpen hoặc engraved_exceeds_slots thì test bắt buộc phát hiện", () => {
      // 1. Dữ liệu gán ô vượt cảnh giới: Luyện Khí (realm 1) gán vào ô 3 (slot index 1)
      const slotMutantData = JSON.stringify({
        ...validPlayer,
        realm: 1,
        skills: {
          learned: { ung_trao: 1, hoa_van_kiem: 1 },
          slots: ["ung_trao", "hoa_van_kiem", "", ""],
        },
      });
      const errorsSlot = auditPlayerSaveData(slotMutantData, slotMutantData.length);
      expect(errorsSlot.some((e) => e.code === "slot_not_open")).toBe(true);

      // Nếu đột biến nới lỏng: không kiểm tra slotOpen
      const relaxedSlotCheck = (errs: typeof errorsSlot) =>
        errs.filter((e) => e.code !== "slot_not_open");
      expect(relaxedSlotCheck(errorsSlot).some((e) => e.code === "slot_not_open")).toBe(false);

      // 2. Dữ liệu khắc vượt nấc mở khóa: unlocks.khac = 1 nhưng khắc 2 chiêu
      const engraveMutantData = JSON.stringify({
        v: 1,
        id: "dao_huu",
        kiep: 2,
        duyen: 10,
        duyenTotal: 50,
        unlocks: { khac: 1 },
        origins: [],
        best: { step: 9, realm: 1, tier: 8 },
        engraved: ["ung_trao", "hoa_van_kiem"],
        createdAt: "2026-11-10T00:00:00.000Z",
        updatedAt: "2026-11-10T00:00:00.000Z",
      });
      const errorsEngrave = auditSoulSaveData(engraveMutantData, engraveMutantData.length);
      expect(errorsEngrave.some((e) => e.code === "engraved_exceeds_slots")).toBe(true);

      // Nếu đột biến nới lỏng: không so sánh với unlocks.khac
      const relaxedEngraveCheck = (errs: typeof errorsEngrave) =>
        errs.filter((e) => e.code !== "engraved_exceeds_slots");
      expect(
        relaxedEngraveCheck(errorsEngrave).some((e) => e.code === "engraved_exceeds_slots"),
      ).toBe(false);
    });

    it("phát hiện skills.slots có chiêu khi skills.learned vắng -> unlearned_skill_in_slot", () => {
      const raw = JSON.stringify({
        ...validPlayer,
        realm: 2,
        skills: {
          slots: ["ung_trao", "", "", ""],
        },
      });
      const errors = auditPlayerSaveData(raw, raw.length);
      expect(errors.some((e) => e.code === "unlearned_skill_in_slot")).toBe(true);
    });

    it("đối chiếu loader: đầu ra sanitizeSkillBook với mọi dữ liệu rác luôn vượt qua auditPlayerSaveData", () => {
      const garbageInputs: unknown[] = [
        null,
        undefined,
        "string",
        12345,
        true,
        [],
        {},
        { learned: null, slots: null },
        { learned: "not-an-object", slots: ["ung_trao", "ung_trao"] },
        {
          learned: { unknown_skill: 1, ung_trao: 0, hoa_van_kiem: 99 },
          slots: ["unknown_skill", "ung_trao"],
        },
        {
          learned: { ung_trao: 2.5, hoa_van_kiem: -5 },
          slots: ["ung_trao", "ung_trao", "hoa_van_kiem", "ung_trao", "extra"],
        },
        {
          learned: { ung_trao: 1, hoa_van_kiem: 2 },
          slots: ["ung_trao", "hoa_van_kiem", "ung_trao", ""],
        },
      ];

      for (const realm of [0, 1, 2, 3, 4]) {
        for (const bad of garbageInputs) {
          const sanitized = sanitizeSkillBook(bad, realm);
          const raw = JSON.stringify({
            ...validPlayer,
            realm,
            skills: sanitized,
          });
          const errors = auditPlayerSaveData(raw, raw.length);
          const skillErrors = errors.filter((e) => e.code.includes("skill"));
          expect(skillErrors).toEqual([]);
        }
      }
    });
  });

  describe("M7.5d / #506: audit-saves Nguyên Anh & Hàn Vân Lĩnh", () => {
    const hvMap = getMap(HAN_VAN_ID)!;

    // Hồ sơ nhân vật Nguyên Anh chuẩn chỉ ở Hàn Vân Trạm
    const validNguyenAnhPlayer = {
      ...validPlayer,
      name: "Băng Vân",
      realm: 4,
      tier: 1, // Nguyên Anh trung kỳ
      exp: 150000,
      coin: 88888,
      mapId: HAN_VAN_ID,
      x: 2048,
      y: 3648, // Trong Hàn Vân Trạm
      inventory: [
        { itemId: "thuong_hoi_huyet_dan", qty: 20 },
        { itemId: "thuong_hoi_linh_dan", qty: 20 },
        { itemId: "han_lang_mao", qty: 15 },
        { itemId: "phong_nha_vu", qty: 12 },
        { itemId: "tuong_cot", qty: 8 },
        { itemId: "doc_tuoc_nang", qty: 6 },
        { itemId: "thien_han_chau", qty: 3 },
      ],
      equipment: {
        weapon: "han_vu_kiem",
        robe: "han_lang_bao",
        talisman: "phong_nha_phu",
        boots: "tuyet_hanh_ngoa",
        jade: "han_tinh_boi",
        treasure: "han_bang_an",
      },
      quests: {
        done: [
          "lang_han_quan",
          "han_van_len",
          "han_lang_hoan",
          "phong_nha_cham",
          "cot_tuong_cot",
          "giao_hoan", // Việc phụ hoàn thành hợp lệ
        ],
        active: [{ id: "doc_tuoc_nang_cb", progress: 0 }],
        daily: {
          han_lang_quay: "2026-11-15T00:00:00.000Z",
        },
      },
      skills: {
        learned: { ung_trao: 1, hoa_van_kiem: 2, bon_thach_quyen: 3, cuu_cung_khon_sat: 1 },
        slots: ["ung_trao", "hoa_van_kiem", "bon_thach_quyen", "cuu_cung_khon_sat"],
      },
    };

    it("hồ sơ nhân vật Nguyên Anh hợp lệ (bộ IV, đồ đan cấp 3, quest Nguyên Anh tại Hàn Vân Lĩnh) -> 0 lỗi", () => {
      const raw = JSON.stringify(validNguyenAnhPlayer);
      const errors = auditPlayerSaveData(raw, raw.length);
      expect(errors).toEqual([]);
    });

    it("toạ độ vượt biên hoặc rơi vào ô chặn / vách núi Hàn Vân Lĩnh -> pos_out_of_bounds, pos_blocked", () => {
      // Vượt biên Hàn Vân Lĩnh (kích thước thế giới worldW x worldH)
      const outBounds = JSON.stringify({
        ...validNguyenAnhPlayer,
        x: hvMap.worldW + 100,
        y: 2000,
      });
      const errsOut = auditPlayerSaveData(outBounds, outBounds.length);
      expect(errsOut.map((e) => e.code)).toContain("pos_out_of_bounds");

      // Rơi vào vách núi / góc chặn mép bản đồ (0, 0)
      const blocked = JSON.stringify({
        ...validNguyenAnhPlayer,
        x: 0,
        y: 0,
      });
      const errsBlocked = auditPlayerSaveData(blocked, blocked.length);
      expect(errsBlocked.map((e) => e.code)).toContain("pos_blocked");
      expect(errsBlocked.find((e) => e.code === "pos_blocked")!.message).toContain(hvMap.def.name);
    });

    it("chỗ xuất hiện của cổng nam Hàn Vân Lĩnh (han_van_nam) và cổng bắc Âm Sương (am_suong_bac) là toạ độ lưu hợp lệ", () => {
      const portalHv = hvMap.portals.find((p) => p.id === "han_van_nam")!;
      expect(portalHv).toBeDefined();
      const rawHv = JSON.stringify({
        ...validNguyenAnhPlayer,
        x: portalHv.spawn.x,
        y: portalHv.spawn.y,
      });
      expect(auditPlayerSaveData(rawHv, rawHv.length)).toEqual([]);

      const asMap = getMap("am_suong")!;
      const portalAs = asMap.portals.find((p) => p.id === "am_suong_bac")!;
      expect(portalAs).toBeDefined();
      const rawAs = JSON.stringify({
        ...validPlayer,
        mapId: "am_suong",
        x: portalAs.spawn.x,
        y: portalAs.spawn.y,
      });
      expect(auditPlayerSaveData(rawAs, rawAs.length)).toEqual([]);
    });

    it("phát hiện trang bị bộ IV gắn sai ô -> invalid_equip_slot, hoặc trang bị vật phẩm lạ -> unknown_equip_item", () => {
      // Gắn nhầm kiếm Hàn Vũ vào ô robe
      const badSlot = JSON.stringify({
        ...validNguyenAnhPlayer,
        equipment: {
          ...validNguyenAnhPlayer.equipment,
          robe: "han_vu_kiem",
        },
      });
      const errsSlot = auditPlayerSaveData(badSlot, badSlot.length);
      expect(errsSlot.map((e) => e.code)).toContain("invalid_equip_slot");

      // Trang bị id lạ không có thật
      const unknownItem = JSON.stringify({
        ...validNguyenAnhPlayer,
        equipment: {
          ...validNguyenAnhPlayer.equipment,
          weapon: "han_vu_kiem_fake",
        },
      });
      const errsUnknown = auditPlayerSaveData(unknownItem, unknownItem.length);
      expect(errsUnknown.map((e) => e.code)).toContain("unknown_equip_item");
    });

    it("phát hiện nhiệm vụ Nguyên Anh bị trùng trong done hoặc chứa nhiệm vụ lạ", () => {
      const dupQuest = JSON.stringify({
        ...validNguyenAnhPlayer,
        quests: {
          ...validNguyenAnhPlayer.quests,
          done: ["lang_han_quan", "han_van_len", "lang_han_quan"],
        },
      });
      const errsDup = auditPlayerSaveData(dupQuest, dupQuest.length);
      expect(errsDup.map((e) => e.code)).toContain("duplicate_quest_done");

      const fakeQuest = JSON.stringify({
        ...validNguyenAnhPlayer,
        quests: {
          ...validNguyenAnhPlayer.quests,
          done: ["lang_han_quan", "nhiem_vu_gia_han_van"],
        },
      });
      const errsFake = auditPlayerSaveData(fakeQuest, fakeQuest.length);
      expect(errsFake.map((e) => e.code)).toContain("unknown_quest");
    });

    it("tệp lưu CŨ thiếu 6 chiêu Nguyên Anh mới và tệp lưu có đủ 18 chiêu + 6 kinh quyển Nguyên Anh đợt 2 (#654/#722) đều 0 lỗi", () => {
      expect(SKILLS_M7.length).toBe(18);
      // 1. Tệp lưu cũ chỉ có các chiêu đợt 1 (12 chiêu đầu), thiếu 6 chiêu Nguyên Anh đợt 2
      const old12Learned = Object.fromEntries(SKILLS_M7.slice(0, 12).map((s) => [s.id, 2]));
      const oldSaveRaw = JSON.stringify({
        ...validNguyenAnhPlayer,
        skills: {
          learned: old12Learned,
          slots: ["hoa_van_kiem", "thanh_tung_phi_cham", "cuu_cung_khon_sat", "huyen_bang_chi"],
        },
      });
      expect(auditPlayerSaveData(oldSaveRaw, oldSaveRaw.length)).toEqual([]);

      // 2. Tệp lưu mới có đủ toàn bộ 18 chiêu (kể cả 6 chiêu Nguyên Anh đợt 2) + 6 kinh quyển Nguyên Anh trong túi đồ
      const all18Learned = Object.fromEntries(SKILLS_M7.map((s) => [s.id, 3]));
      const full18SaveRaw = JSON.stringify({
        ...validNguyenAnhPlayer,
        inventory: [
          { itemId: "kinh_han_quang_tien", qty: 1 },
          { itemId: "kinh_bach_kim_trao", qty: 1 },
          { itemId: "kinh_van_thach_tran", qty: 1 },
          { itemId: "kinh_bang_hoa_loan", qty: 1 },
          { itemId: "kinh_liet_hoa_kiem", qty: 1 },
          { itemId: "kinh_van_hanh_bo", qty: 1 },
        ],
        skills: {
          learned: all18Learned,
          slots: ["han_quang_tien", "bach_kim_trao", "van_thach_tran", "liet_hoa_kiem"],
        },
      });
      expect(auditPlayerSaveData(full18SaveRaw, full18SaveRaw.length)).toEqual([]);

      // 3. Chân linh khắc chiêu Nguyên Anh đợt 2 -> 0 lỗi
      const soulRaw = JSON.stringify({
        v: 1,
        id: "bang_van",
        kiep: 3,
        duyen: 20,
        duyenTotal: 120,
        unlocks: { khac: 2 },
        origins: [],
        best: { step: 17, realm: 4, tier: 1 },
        engraved: ["han_quang_tien", "liet_hoa_kiem"],
        createdAt: "2026-11-10T00:00:00.000Z",
        updatedAt: "2026-11-15T00:00:00.000Z",
      });
      expect(auditSoulSaveData(soulRaw, soulRaw.length)).toEqual([]);
    });
  });
});
