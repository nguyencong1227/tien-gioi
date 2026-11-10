// Kịch bản kiểm tra tính toàn vẹn của dữ liệu file lưu nhân vật (Sprint 5 - Issue #112).
// CHỈ ĐỌC: Tuyệt đối không ghi, không sửa, không xoá bất kỳ file nào.
// Cách dùng:
//   npm run kiem-save -w server
//   npm run kiem-save -w server -- --dir=data/players
//   npm run kiem-save -w server -- --json
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  COIN_CAP,
  EQUIP_SLOTS,
  INVENTORY_SLOTS,
  ITEM_BY_ID,
  PLAYER_RADIUS,
  QUEST_BY_ID,
  REALMS,
  WORLD_H,
  WORLD_W,
  circleBlocked,
} from "@tien-gioi/shared";
import { cleanName } from "../src/store.js";
import { byId } from "../src/systems/lookup.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");

/** Kích thước file tối đa cho phép đọc: 1 MB (chống DoS / tràn bộ nhớ). */
export const MAX_FILE_SIZE = 1024 * 1024;
/** Số lượng file tối đa quét trong một lần chạy. */
export const MAX_FILES_COUNT = 100_000;

export interface AuditError {
  code: string;
  message: string;
}

export interface AuditFileResult {
  file: string;
  errors: AuditError[];
}

export interface AuditReport {
  dataDir: string;
  totalFiles: number;
  cleanFiles: number;
  errorFiles: number;
  errorsByCode: Record<string, number>;
  failedFiles: AuditFileResult[];
}

const HEX_64_REGEX = /^[0-9a-fA-F]{64}$/;
const SAFE_ID_REGEX = /^[a-z0-9_]{1,32}$/;

/**
 * Hiển thị an toàn một giá trị đến từ file không tin cậy trong thông báo lỗi.
 * - Chuỗi chỉ in nguyên khi khớp /^[a-z0-9_]{1,32}$/ (id hợp lệ của game),
 *   còn lại thay thế bằng '<chuỗi N ký tự>' để chặn lộ secretHash, mã điều khiển ANSI hay chuỗi khổng lồ.
 * - Số hữu hạn in dạng chuỗi, còn lại in '<số không hợp lệ>'.
 * - Các kiểu khác in '<tên_kiểu>'.
 */
export function show(v: unknown): string {
  if (typeof v === "string") {
    if (SAFE_ID_REGEX.test(v)) {
      return `"${v}"`;
    }
    return `<chuỗi ${v.length} ký tự>`;
  }
  if (typeof v === "number") {
    if (Number.isFinite(v)) {
      return String(v);
    }
    return "<số không hợp lệ>";
  }
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (Array.isArray(v)) return `<mảng ${v.length} phần tử>`;
  if (typeof v === "object") return "<object>";
  if (typeof v === "boolean") return String(v);
  return `<${typeof v}>`;
}

/**
 * Kiểm tra tính hợp lệ của nội dung một file lưu nhân vật.
 * Tuyệt đối không trả về hay in secretHash trong mã lỗi hoặc thông báo.
 */
export function auditPlayerSaveData(rawText: string, byteLength: number): AuditError[] {
  const errors: AuditError[] = [];

  if (byteLength > MAX_FILE_SIZE) {
    errors.push({
      code: "file_too_large",
      message: `Kích thước file (${byteLength} bytes) vượt quá giới hạn an toàn 1 MB`,
    });
    return errors;
  }

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch (err: any) {
    errors.push({
      code: "invalid_json",
      message: `JSON không hợp lệ: ${err?.message ?? "lỗi cú pháp"}`,
    });
    return errors;
  }

  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    errors.push({
      code: "not_an_object",
      message: "Dữ liệu gốc phải là một JSON Object",
    });
    return errors;
  }

  // 1. Tên nhân vật
  if (typeof data.name !== "string" || cleanName(data.name) !== data.name) {
    errors.push({
      code: "invalid_name",
      message: "Tên nhân vật không hợp lệ (cần 2–16 ký tự chữ/số/khoảng trắng hợp lệ)",
    });
  }

  // 2. Secret hash (bắt buộc đúng 64 ký tự hex sha256)
  if (typeof data.secretHash !== "string" || !HEX_64_REGEX.test(data.secretHash)) {
    errors.push({
      code: "invalid_secret_hash",
      message: "secretHash phải là chuỗi hex 64 ký tự (sha256)",
    });
  }

  // 3. Cảnh giới & Tầng bậc
  const realm = data.realm;
  const isRealmValid =
    Number.isInteger(realm) && typeof realm === "number" && realm >= 0 && realm < REALMS.length;
  if (!isRealmValid) {
    errors.push({
      code: "invalid_realm",
      message: `realm (${show(realm)}) không nằm trong khoảng cảnh giới hợp lệ [0, ${REALMS.length - 1}]`,
    });
  }

  const tier = data.tier;
  if (isRealmValid) {
    const maxTiers = REALMS[realm].tiers.length;
    if (!Number.isInteger(tier) || typeof tier !== "number" || tier < 0 || tier >= maxTiers) {
      errors.push({
        code: "invalid_tier",
        message: `tier (${show(tier)}) không hợp lệ với cảnh giới ${REALMS[realm].name} [0, ${maxTiers - 1}]`,
      });
    }
  } else if (!Number.isInteger(tier) || typeof tier !== "number" || tier < 0) {
    errors.push({
      code: "invalid_tier",
      message: `tier (${show(tier)}) phải là số nguyên không âm`,
    });
  }

  // 4. Tu vi (exp)
  if (typeof data.exp !== "number" || !Number.isFinite(data.exp) || data.exp < 0) {
    errors.push({
      code: "invalid_exp",
      message: `exp (${show(data.exp)}) phải là số hữu hạn không âm`,
    });
  }

  // 5. Linh thạch (coin)
  if (data.coin !== undefined) {
    if (
      typeof data.coin !== "number" ||
      !Number.isInteger(data.coin) ||
      data.coin < 0 ||
      data.coin > COIN_CAP
    ) {
      errors.push({
        code: "coin_out_of_range",
        message: `coin (${show(data.coin)}) phải là số nguyên trong khoảng [0, ${COIN_CAP}]`,
      });
    }
  }

  // 6. Vị trí toạ độ (x, y)
  if (data.x !== undefined || data.y !== undefined) {
    const x = data.x;
    const y = data.y;
    const isFinitePos =
      typeof x === "number" &&
      typeof y === "number" &&
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      x >= 0 &&
      x <= WORLD_W &&
      y >= 0 &&
      y <= WORLD_H;

    if (!isFinitePos) {
      errors.push({
        code: "pos_out_of_bounds",
        message: `Toạ độ (x: ${show(x)}, y: ${show(y)}) nằm ngoài kích thước bản đồ (${WORLD_W}x${WORLD_H})`,
      });
    } else if (circleBlocked(x, y, PLAYER_RADIUS)) {
      errors.push({
        code: "pos_blocked",
        message: `Toạ độ (x: ${show(x)}, y: ${show(y)}) nằm đè lên vật cản không thể di chuyển`,
      });
    }
  }

  // 7. Ngày tháng (createdAt, updatedAt)
  if (data.createdAt !== undefined) {
    if (typeof data.createdAt !== "string" || isNaN(Date.parse(data.createdAt))) {
      errors.push({
        code: "invalid_date",
        message: "createdAt không phải chuỗi ngày ISO hợp lệ",
      });
    }
  }
  if (data.updatedAt !== undefined) {
    if (typeof data.updatedAt !== "string" || isNaN(Date.parse(data.updatedAt))) {
      errors.push({
        code: "invalid_date",
        message: "updatedAt không phải chuỗi ngày ISO hợp lệ",
      });
    }
  }

  // 8. Túi đồ (inventory)
  if (data.inventory !== undefined) {
    if (!Array.isArray(data.inventory)) {
      errors.push({
        code: "inv_not_array",
        message: "inventory phải là một mảng ô đồ",
      });
    } else if (data.inventory.length > INVENTORY_SLOTS) {
      errors.push({
        code: "inv_too_many_slots",
        message: `Túi đồ có ${data.inventory.length} ô, vượt quá giới hạn tối đa INVENTORY_SLOTS (${INVENTORY_SLOTS} ô)`,
      });
    } else {
      for (let i = 0; i < data.inventory.length; i++) {
        const slot = data.inventory[i];
        if (slot === null) continue;
        if (typeof slot !== "object" || Array.isArray(slot)) {
          errors.push({
            code: "inv_slot_invalid",
            message: `Ô đồ thứ ${i} không phải định dạng hợp lệ`,
          });
          continue;
        }

        const itemDef = byId(ITEM_BY_ID, slot.itemId);
        if (!itemDef) {
          errors.push({
            code: "unknown_item",
            message: `Ô đồ thứ ${i} chứa vật phẩm không tồn tại: ${show(slot.itemId)}`,
          });
          continue;
        }

        const qty = slot.qty;
        if (!Number.isInteger(qty) || typeof qty !== "number" || qty < 1 || qty > itemDef.stack) {
          errors.push({
            code: "qty_out_of_range",
            message: `Ô đồ thứ ${i} (${show(slot.itemId)}) có số lượng ${show(qty)} không nằm trong [1, ${itemDef.stack}]`,
          });
        }
      }
    }
  }

  // 9. Trang bị (equipment)
  if (data.equipment !== undefined) {
    if (
      typeof data.equipment !== "object" ||
      data.equipment === null ||
      Array.isArray(data.equipment)
    ) {
      errors.push({
        code: "equip_not_object",
        message: "equipment phải là một JSON Object",
      });
    } else {
      const allowedSlots = new Set<string>(EQUIP_SLOTS);
      for (const [slotKey, rawItemId] of Object.entries(data.equipment)) {
        if (!allowedSlots.has(slotKey)) {
          errors.push({
            code: "unknown_equip_slot",
            message: `Ô trang bị lạ không tồn tại trong game: ${show(slotKey)}`,
          });
          continue;
        }

        if (typeof rawItemId !== "string") {
          errors.push({
            code: "unknown_equip_item",
            message: `Trang bị tại ô ${show(slotKey)} phải là chuỗi itemId`,
          });
          continue;
        }

        if (rawItemId === "") continue; // Ô trống hợp lệ

        const itemDef = byId(ITEM_BY_ID, rawItemId);
        if (!itemDef) {
          errors.push({
            code: "unknown_equip_item",
            message: `Trang bị tại ô ${show(slotKey)} chứa vật phẩm không tồn tại: ${show(rawItemId)}`,
          });
          continue;
        }

        if (itemDef.type !== "equip" || !itemDef.equip || itemDef.equip.slot !== slotKey) {
          errors.push({
            code: "invalid_equip_slot",
            message: `Vật phẩm ${show(rawItemId)} không phải trang bị cho ô ${show(slotKey)}`,
          });
        }
      }
    }
  }

  // 10. Sổ nhiệm vụ (quests)
  if (data.quests !== undefined) {
    if (typeof data.quests !== "object" || data.quests === null || Array.isArray(data.quests)) {
      errors.push({
        code: "quests_not_object",
        message: "quests phải là một JSON Object",
      });
    } else {
      // 10a. done
      if (data.quests.done !== undefined) {
        if (!Array.isArray(data.quests.done)) {
          errors.push({
            code: "unknown_quest",
            message: "quests.done phải là mảng các questId",
          });
        } else {
          const seen = new Set<string>();
          for (const qId of data.quests.done) {
            if (typeof qId !== "string" || !byId(QUEST_BY_ID, qId)) {
              errors.push({
                code: "unknown_quest",
                message: `Nhiệm vụ đã hoàn thành không tồn tại: ${show(qId)}`,
              });
            } else if (seen.has(qId)) {
              errors.push({
                code: "duplicate_quest_done",
                message: `Nhiệm vụ bị trùng lặp trong quests.done: ${show(qId)}`,
              });
            } else {
              seen.add(qId);
            }
          }
        }
      }

      // 10b. active
      if (data.quests.active !== undefined) {
        if (!Array.isArray(data.quests.active)) {
          errors.push({
            code: "unknown_quest",
            message: "quests.active phải là mảng nhiệm vụ đang làm",
          });
        } else {
          for (const act of data.quests.active) {
            const qId = act?.id;
            if (typeof qId !== "string" || !byId(QUEST_BY_ID, qId)) {
              errors.push({
                code: "unknown_quest",
                message: `Nhiệm vụ đang làm không tồn tại: ${show(qId)}`,
              });
            }
          }
        }
      }

      // 10c. daily
      if (data.quests.daily !== undefined) {
        if (
          typeof data.quests.daily !== "object" ||
          data.quests.daily === null ||
          Array.isArray(data.quests.daily)
        ) {
          errors.push({
            code: "invalid_daily_key",
            message: "quests.daily phải là object",
          });
        } else {
          for (const [qId, dayVal] of Object.entries(data.quests.daily)) {
            const questDef = byId(QUEST_BY_ID, qId);
            if (!questDef || !questDef.daily) {
              errors.push({
                code: "invalid_daily_key",
                message: `Nhiệm vụ ${show(qId)} trong daily không phải là nhiệm vụ lặp hàng ngày`,
              });
            }
            if (typeof dayVal !== "string" || isNaN(Date.parse(dayVal))) {
              errors.push({
                code: "invalid_daily_key",
                message: `Giá trị ngày của nhiệm vụ lặp ${show(qId)} không hợp lệ: ${show(dayVal)}`,
              });
            }
          }
        }
      }
    }
  }

  return errors;
}

/**
 * Quét toàn bộ thư mục file lưu nhân vật và lập báo cáo audit chi tiết.
 * Ném lỗi nếu thư mục không tồn tại.
 */
export function auditSavesDirectory(dirPath: string): AuditReport {
  const resolvedDir = path.resolve(dirPath);

  if (!existsSync(resolvedDir)) {
    throw new Error(`Thư mục không tồn tại: "${resolvedDir}"`);
  }

  const stat = statSync(resolvedDir);
  if (!stat.isDirectory()) {
    throw new Error(`Đường dẫn không phải thư mục: "${resolvedDir}"`);
  }

  const allEntries = readdirSync(resolvedDir);
  const jsonFiles = allEntries.filter((f) => f.endsWith(".json"));

  if (jsonFiles.length > MAX_FILES_COUNT) {
    throw new Error(
      `Số lượng file (${jsonFiles.length}) vượt quá giới hạn tối đa cho phép (${MAX_FILES_COUNT})`,
    );
  }

  let cleanFiles = 0;
  let errorFiles = 0;
  const errorsByCode: Record<string, number> = {};
  const failedFiles: AuditFileResult[] = [];

  for (const filename of jsonFiles) {
    const fullPath = path.join(resolvedDir, filename);
    let rawContent = "";
    let byteLength: number;

    try {
      const fileStat = lstatSync(fullPath);
      if (!fileStat.isFile()) {
        const errList = [
          {
            code: "not_regular_file",
            message: "Không phải file thông thường (symlink, FIFO, socket, thư mục)",
          },
        ];
        errorFiles++;
        errorsByCode.not_regular_file = (errorsByCode.not_regular_file ?? 0) + 1;
        if (failedFiles.length < 10) {
          failedFiles.push({ file: filename, errors: errList });
        }
        continue;
      }
      byteLength = fileStat.size;
      if (byteLength <= MAX_FILE_SIZE) {
        rawContent = readFileSync(fullPath, "utf8");
      }
    } catch (err: any) {
      const errList = [
        { code: "read_error", message: `Không thể đọc file: ${err?.message ?? "lỗi I/O"}` },
      ];
      errorFiles++;
      errorsByCode.read_error = (errorsByCode.read_error ?? 0) + 1;
      if (failedFiles.length < 10) {
        failedFiles.push({ file: filename, errors: errList });
      }
      continue;
    }

    const errors = auditPlayerSaveData(rawContent, byteLength);

    if (errors.length === 0) {
      cleanFiles++;
    } else {
      errorFiles++;
      for (const err of errors) {
        errorsByCode[err.code] = (errorsByCode[err.code] ?? 0) + 1;
      }
      if (failedFiles.length < 10) {
        failedFiles.push({ file: filename, errors });
      }
    }
  }

  return {
    dataDir: resolvedDir,
    totalFiles: jsonFiles.length,
    cleanFiles,
    errorFiles,
    errorsByCode,
    failedFiles,
  };
}

interface CliArgs {
  dir?: string;
  json: boolean;
}

function parseCliArgs(argv: string[]): CliArgs {
  let dir: string | undefined;
  let json = false;

  for (const arg of argv) {
    if (arg.startsWith("--dir=")) {
      dir = arg.slice(6);
    } else if (arg === "--json") {
      json = true;
    }
  }

  return { dir, json };
}

export function main(): number {
  const args = parseCliArgs(process.argv.slice(2));
  const targetDir = args.dir
    ? path.resolve(args.dir)
    : process.env.DATA_DIR
      ? path.resolve(process.env.DATA_DIR)
      : path.resolve(repoRoot, "server/data/players");

  let report: AuditReport;
  try {
    report = auditSavesDirectory(targetDir);
  } catch (err: any) {
    if (args.json) {
      console.log(
        JSON.stringify({
          status: "error",
          error: err?.message ?? "Không thể đọc thư mục",
          dataDir: targetDir,
        }),
      );
    } else {
      console.error(`LỖI: ${err?.message ?? "Không thể đọc thư mục"}`);
    }
    return 2;
  }

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return report.errorFiles === 0 ? 0 : 1;
  }

  console.log(`\n=== BÁO CÁO KIỂM TRA DỮ LIỆU FILE LƯU NHÂN VẬT ===`);
  console.log(`- Thư mục kiểm tra: ${report.dataDir}`);
  console.log(`- Tổng số file .json: ${report.totalFiles}`);
  console.log(`- File sạch (hợp lệ): ${report.cleanFiles}`);
  console.log(`- File có lỗi vi phạm: ${report.errorFiles}`);

  if (Object.keys(report.errorsByCode).length > 0) {
    console.log(`\n--- Phân loại số lượng lỗi theo mã vi phạm ---`);
    for (const [code, count] of Object.entries(report.errorsByCode)) {
      console.log(`  * ${code}: ${count} lỗi`);
    }
  }

  if (report.failedFiles.length > 0) {
    console.log(`\n--- Danh sách các file lỗi đầu tiên (tối đa 10 file) ---`);
    for (const fail of report.failedFiles) {
      console.log(`  - File: ${fail.file}`);
      for (const err of fail.errors) {
        console.log(`      [${err.code}] ${err.message}`);
      }
    }
  }

  if (report.errorFiles === 0) {
    console.log(`\n✅ TẤT CẢ DỮ LIỆU ĐỀU HỢP LỆ VÀ AN TOÀN.\n`);
    return 0;
  } else {
    console.log(`\n⚠️ PHÁT HIỆN ${report.errorFiles} FILE DỮ LIỆU KHÔNG HỢP LỆ!\n`);
    return 1;
  }
}

if (process.argv[1]?.endsWith("audit-saves.ts")) {
  const exitCode = main();
  process.exit(exitCode);
}
