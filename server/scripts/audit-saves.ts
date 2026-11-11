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
  DEFAULT_MAP,
  DUNGEON_DAILY_REWARDS,
  EQUIP_SLOTS,
  INVENTORY_SLOTS,
  ITEM_BY_ID,
  PLAYER_RADIUS,
  QUEST_BY_ID,
  REALMS,
  getMap,
  isDungeonMap,
  UNLOCK_BY_ID,
  originOf,
  stepOf,
  DUYEN_CAP,
  KIEP_CAP,
  cleanName,
  validateUsername,
  SECT_COIN_CAP,
  SECT_LOG_MAX,
  SECT_MAX_MEMBERS,
  SECT_ELDERS_MAX,
  SECT_NAME_MIN,
  SECT_NAME_MAX,
  SECT_TAG_MIN,
  SECT_TAG_MAX,
  SECT_MOTD_MAX,
  SECT_RANKS,
  cleanMotd,
  cleanSectName,
  cleanSectTag,
  sectKey,
} from "@tien-gioi/shared";
import { byId } from "../src/systems/lookup.js";
import { soulIdOf } from "../src/soul.js";
import { parseHash } from "../src/auth.js";
import { nameKeyOf } from "../src/account-store.js";
import { isSectId } from "../src/sect-store.js";
import { createHash } from "node:crypto";
import { assertNotProd } from "./assert-not-prod.js";

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
  /** Thống kê chân linh (souls/) (#151) */
  totalSouls?: number;
  cleanSouls?: number;
  errorSouls?: number;
  /** Thống kê tài khoản (accounts/) (#176) */
  totalAccounts?: number;
  cleanAccounts?: number;
  errorAccounts?: number;
  /** Thống kê phiên (sessions/) (#176) */
  totalSessions?: number;
  cleanSessions?: number;
  errorSessions?: number;
  /** Thống kê tông môn (sects/) (#231) */
  totalSects?: number;
  cleanSects?: number;
  errorSects?: number;
  errorsByCode: Record<string, number>;
  failedFiles: AuditFileResult[];
}

const HEX_64_REGEX = /^[0-9a-fA-F]{64}$/;
const SAFE_ID_REGEX = /^[a-z0-9_]{1,32}$/;
const ACCOUNT_ID_REGEX = /^[A-Za-z0-9-]{8,64}$/;
const TOKEN_HASH_REGEX = /^[a-f0-9]{64}$/;
const DAY_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const isIsoString = (s: unknown): s is string =>
  typeof s === "string" && s.length <= 40 && Number.isFinite(Date.parse(s));
const isFiniteEpoch = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 && n < 1e15;
const isValidDayKey = (v: unknown): v is string => {
  if (typeof v !== "string" || !DAY_KEY_REGEX.test(v)) return false;
  const ms = Date.parse(`${v}T00:00:00.000Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === v;
};

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

  // 6. Bản đồ (mapId)
  let targetMap = DEFAULT_MAP;
  if (data.mapId !== undefined) {
    const m = getMap(data.mapId);
    if (!m) {
      errors.push({
        code: "invalid_map_id",
        message: `Mã bản đồ ${show(data.mapId)} không tồn tại trong MAPS (server sẽ đưa về lac_ha)`,
      });
    } else if (isDungeonMap(data.mapId)) {
      errors.push({
        code: "invalid_map_id",
        message: `Mã bản đồ ${show(data.mapId)} là bản đồ bí cảnh, không tồn tại trong MAPS (server sẽ đưa về lac_ha)`,
      });
    } else {
      targetMap = m;
    }
  }

  // 7. Vị trí toạ độ (x, y)
  if (data.x !== undefined || data.y !== undefined) {
    const x = data.x;
    const y = data.y;
    const isFinitePos =
      typeof x === "number" &&
      typeof y === "number" &&
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      x >= 0 &&
      x <= targetMap.worldW &&
      y >= 0 &&
      y <= targetMap.worldH;

    if (!isFinitePos) {
      errors.push({
        code: "pos_out_of_bounds",
        message: `Toạ độ (x: ${show(x)}, y: ${show(y)}) nằm ngoài kích thước bản đồ ${targetMap.def.name} (${targetMap.worldW}x${targetMap.worldH})`,
      });
    } else if (targetMap.circleBlocked(x, y, PLAYER_RADIUS)) {
      errors.push({
        code: "pos_blocked",
        message: `Toạ độ (x: ${show(x)}, y: ${show(y)}) nằm đè lên vật cản không thể di chuyển trên bản đồ ${targetMap.def.name}`,
      });
    }
  }

  // 8. Ngày tháng (createdAt, updatedAt)
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

  // 11. Luân hồi & Kiếp (#151): lifeId, life, origin, limbo
  if (data.lifeId !== undefined) {
    if (typeof data.lifeId !== "string" || !/^[\x21-\x7e]{8,64}$/.test(data.lifeId)) {
      errors.push({
        code: "invalid_life_id",
        message: "lifeId phải là chuỗi ASCII 8–64 ký tự hợp lệ",
      });
    }
  }

  if (data.life !== undefined) {
    if (typeof data.life !== "object" || data.life === null || Array.isArray(data.life)) {
      errors.push({
        code: "invalid_life_counters",
        message: "life phải là một JSON Object chứa các bộ đếm kiếp",
      });
    } else {
      const { playMs, kills, bossKills } = data.life;
      if (typeof playMs !== "number" || !Number.isFinite(playMs) || playMs < 0) {
        errors.push({
          code: "invalid_life_play_ms",
          message: `life.playMs (${show(playMs)}) phải là số hữu hạn không âm`,
        });
      }
      if (typeof kills !== "number" || !Number.isInteger(kills) || kills < 0) {
        errors.push({
          code: "invalid_life_kills",
          message: `life.kills (${show(kills)}) phải là số nguyên không âm`,
        });
      }
      if (typeof bossKills !== "number" || !Number.isInteger(bossKills) || bossKills < 0) {
        errors.push({
          code: "invalid_life_boss_kills",
          message: `life.bossKills (${show(bossKills)}) phải là số nguyên không âm`,
        });
      } else if (typeof kills === "number" && Number.isInteger(kills) && bossKills > kills) {
        errors.push({
          code: "invalid_life_boss_kills",
          message: `life.bossKills (${show(bossKills)}) không được vượt quá tổng số quái kills (${show(kills)})`,
        });
      }
    }
  }

  if (data.origin !== undefined) {
    if (typeof data.origin !== "string" || !originOf(data.origin)) {
      errors.push({
        code: "unknown_origin_id",
        message: `Xuất thân ${show(data.origin)} không tồn tại trong ORIGINS`,
      });
    }
  }

  if (data.limbo !== undefined) {
    if (typeof data.limbo !== "object" || data.limbo === null || Array.isArray(data.limbo)) {
      errors.push({
        code: "invalid_limbo",
        message: "limbo phải là một JSON Object",
      });
    } else {
      const { endedLifeId, summary, keepable, coinAtDeath, counts, credited } = data.limbo;
      if (typeof endedLifeId !== "string" || !/^[\x21-\x7e]{8,64}$/.test(endedLifeId)) {
        errors.push({
          code: "invalid_limbo_life_id",
          message: "limbo.endedLifeId phải là chuỗi ASCII 8–64 ký tự hợp lệ",
        });
      }
      if (typeof summary !== "object" || summary === null || Array.isArray(summary)) {
        errors.push({
          code: "invalid_limbo_summary",
          message: "limbo.summary phải là một JSON Object",
        });
      } else {
        if (!Number.isInteger(summary.kiep) || summary.kiep < 1) {
          errors.push({
            code: "invalid_limbo_summary_kiep",
            message: `limbo.summary.kiep (${show(summary.kiep)}) phải là số nguyên >= 1`,
          });
        }
        if (
          !Number.isInteger(summary.realm) ||
          summary.realm < 0 ||
          summary.realm >= REALMS.length
        ) {
          errors.push({
            code: "invalid_limbo_summary_realm",
            message: `limbo.summary.realm (${show(summary.realm)}) không hợp lệ`,
          });
        }
        if (
          !Number.isInteger(summary.tier) ||
          summary.tier < 0 ||
          (summary.realm >= 0 &&
            summary.realm < REALMS.length &&
            summary.tier >= REALMS[summary.realm].tiers.length)
        ) {
          errors.push({
            code: "invalid_limbo_summary_tier",
            message: `limbo.summary.tier (${show(summary.tier)}) không hợp lệ`,
          });
        }
        if (
          typeof summary.minutes !== "number" ||
          !Number.isFinite(summary.minutes) ||
          summary.minutes < 0
        ) {
          errors.push({
            code: "invalid_limbo_summary_minutes",
            message: `limbo.summary.minutes (${show(summary.minutes)}) phải là số hữu hạn không âm`,
          });
        }
        if (!Number.isInteger(summary.kills) || summary.kills < 0) {
          errors.push({
            code: "invalid_limbo_summary_kills",
            message: `limbo.summary.kills (${show(summary.kills)}) phải là số nguyên không âm`,
          });
        }
        if (
          !Number.isInteger(summary.bossKills) ||
          summary.bossKills < 0 ||
          (Number.isInteger(summary.kills) && summary.bossKills > summary.kills)
        ) {
          errors.push({
            code: "invalid_limbo_summary_boss_kills",
            message: `limbo.summary.bossKills (${show(summary.bossKills)}) không hợp lệ`,
          });
        }
        if (!Number.isInteger(summary.gain) || summary.gain < 0) {
          errors.push({
            code: "invalid_limbo_summary_gain",
            message: `limbo.summary.gain (${show(summary.gain)}) phải là số nguyên không âm`,
          });
        }
      }

      if (!Array.isArray(keepable)) {
        errors.push({
          code: "invalid_limbo_keepable",
          message: "limbo.keepable phải là mảng itemId trang bị",
        });
      } else {
        for (const itemId of keepable) {
          const itemDef = byId(ITEM_BY_ID, itemId);
          if (!itemDef || itemDef.type !== "equip") {
            errors.push({
              code: "invalid_limbo_keepable_item",
              message: `limbo.keepable chứa vật phẩm không phải trang bị: ${show(itemId)}`,
            });
          }
        }
      }

      if (coinAtDeath !== undefined) {
        if (!Number.isInteger(coinAtDeath) || coinAtDeath < 0 || coinAtDeath > COIN_CAP) {
          errors.push({
            code: "coin_out_of_range",
            message: `limbo.coinAtDeath (${show(coinAtDeath)}) phải là số nguyên [0, ${COIN_CAP}]`,
          });
        }
      }

      if (typeof counts !== "boolean") {
        errors.push({
          code: "invalid_limbo_counts",
          message: "limbo.counts phải là giá trị boolean",
        });
      }

      if (typeof credited !== "boolean") {
        errors.push({
          code: "invalid_limbo_credited",
          message: "limbo.credited phải là giá trị boolean",
        });
      }
    }
  }

  // 12. Bộ đếm thưởng bí cảnh theo ngày (#201): dungeonDaily
  if (data.dungeonDaily !== undefined) {
    if (
      typeof data.dungeonDaily !== "object" ||
      data.dungeonDaily === null ||
      Array.isArray(data.dungeonDaily)
    ) {
      errors.push({
        code: "invalid_dungeon_daily",
        message: "dungeonDaily phải là một JSON Object { day, rewards }",
      });
    } else {
      const { day, rewards } = data.dungeonDaily;
      if (!isValidDayKey(day)) {
        errors.push({
          code: "invalid_dungeon_daily_day",
          message: `dungeonDaily.day (${typeof day === "string" ? `<chuỗi ${day.length} ký tự>` : show(day)}) phải là chuỗi ngày YYYY-MM-DD hợp lệ`,
        });
      }
      if (
        typeof rewards !== "number" ||
        !Number.isInteger(rewards) ||
        rewards < 0 ||
        rewards > DUNGEON_DAILY_REWARDS
      ) {
        errors.push({
          code: "invalid_dungeon_daily_rewards",
          message: `dungeonDaily.rewards (${typeof rewards === "string" ? `<chuỗi ${rewards.length} ký tự>` : show(rewards)}) phải là số nguyên trong khoảng [0, ${DUNGEON_DAILY_REWARDS}]`,
        });
      }
    }
  }

  return errors;
}

/**
 * Kiểm tra tính hợp lệ và toàn vẹn của một file chân linh (Soul, #151).
 */
export function auditSoulSaveData(rawText: string, byteLength: number): AuditError[] {
  const errors: AuditError[] = [];

  if (byteLength > MAX_FILE_SIZE) {
    errors.push({
      code: "file_too_large",
      message: `Kích thước file (${byteLength} bytes) vượt quá giới hạn tối đa cho phép (${MAX_FILE_SIZE} bytes)`,
    });
    return errors;
  }

  if (byteLength === 0 || rawText.trim().length === 0) {
    errors.push({
      code: "file_empty",
      message: "File rỗng (0 bytes)",
    });
    return errors;
  }

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch (err: any) {
    errors.push({
      code: "invalid_json",
      message: `File không phải định dạng JSON hợp lệ: ${err?.message ?? "JSON parse error"}`,
    });
    return errors;
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    errors.push({
      code: "not_json_object",
      message: "Dữ liệu JSON gốc phải là một JSON Object (không phải mảng, chuỗi, hay số)",
    });
    return errors;
  }

  // 1. Version
  if (data.v !== 1) {
    errors.push({
      code: "invalid_soul_version",
      message: `Phiên bản chân linh v (${show(data.v)}) phải bằng 1`,
    });
  }

  // 2. id
  if (typeof data.id !== "string" || data.id.length === 0 || data.id.length > 64) {
    errors.push({
      code: "invalid_soul_id",
      message: `id chân linh (${show(data.id)}) phải là chuỗi từ 1 đến 64 ký tự`,
    });
  }

  // 3. kiep
  if (!Number.isInteger(data.kiep) || data.kiep < 1 || data.kiep > KIEP_CAP) {
    errors.push({
      code: "invalid_soul_kiep",
      message: `Số kiếp (${show(data.kiep)}) phải là số nguyên [1, ${KIEP_CAP}]`,
    });
  }

  // 4. duyen & duyenTotal
  const duyenValid = Number.isInteger(data.duyen) && data.duyen >= 0 && data.duyen <= DUYEN_CAP;
  if (!duyenValid) {
    errors.push({
      code: "invalid_soul_duyen",
      message: `Duyên (${show(data.duyen)}) phải là số nguyên [0, ${DUYEN_CAP}]`,
    });
  }

  const duyenTotalValid =
    Number.isInteger(data.duyenTotal) && data.duyenTotal >= 0 && data.duyenTotal <= DUYEN_CAP;
  if (!duyenTotalValid) {
    errors.push({
      code: "invalid_soul_duyen_total",
      message: `Tổng Duyên (${show(data.duyenTotal)}) phải là số nguyên [0, ${DUYEN_CAP}]`,
    });
  } else if (duyenValid && data.duyenTotal < data.duyen) {
    errors.push({
      code: "invalid_soul_duyen_total",
      message: `Tổng Duyên (${show(data.duyenTotal)}) không được nhỏ hơn Duyên hiện có (${show(data.duyen)})`,
    });
  }

  // 5. unlocks
  if (typeof data.unlocks !== "object" || data.unlocks === null || Array.isArray(data.unlocks)) {
    errors.push({
      code: "invalid_soul_unlocks",
      message: "unlocks phải là một JSON Object",
    });
  } else {
    for (const [key, val] of Object.entries(data.unlocks)) {
      const def = byId(UNLOCK_BY_ID, key);
      if (!def) {
        errors.push({
          code: "unknown_soul_unlock",
          message: `Mục mở khóa ${show(key)} không tồn tại trong UNLOCKS`,
        });
      } else if (
        !Number.isInteger(val) ||
        (val as number) < 1 ||
        (val as number) > def.costs.length
      ) {
        errors.push({
          code: "invalid_soul_unlock_level",
          message: `Nấc mở khóa của ${show(key)} (${show(val)}) phải là số nguyên [1, ${def.costs.length}]`,
        });
      }
    }
  }

  // 6. origins
  if (!Array.isArray(data.origins)) {
    errors.push({
      code: "invalid_soul_origins",
      message: "origins phải là một mảng chuỗi id xuất thân",
    });
  } else {
    const seen = new Set<string>();
    for (const ogId of data.origins) {
      if (typeof ogId !== "string" || !originOf(ogId)) {
        errors.push({
          code: "unknown_soul_origin",
          message: `Xuất thân ${show(ogId)} không tồn tại trong ORIGINS`,
        });
      } else if (ogId === "pham_gia") {
        errors.push({
          code: "invalid_soul_origin",
          message: "Xuất thân pham_gia luôn có sẵn, không được nằm trong origins mở khóa",
        });
      } else if (seen.has(ogId)) {
        errors.push({
          code: "duplicate_soul_origin",
          message: `Xuất thân ${show(ogId)} bị lặp lại trong origins`,
        });
      } else {
        seen.add(ogId);
      }
    }
  }

  // 7. best
  if (typeof data.best !== "object" || data.best === null || Array.isArray(data.best)) {
    errors.push({
      code: "invalid_soul_best",
      message: "best phải là một JSON Object { step, realm, tier }",
    });
  } else {
    const { step, realm, tier } = data.best;
    const realmValid = Number.isInteger(realm) && realm >= 0 && realm < REALMS.length;
    const tierValid =
      realmValid && Number.isInteger(tier) && tier >= 0 && tier < REALMS[realm].tiers.length;
    if (!realmValid || !tierValid) {
      errors.push({
        code: "invalid_soul_best",
        message: `best.realm (${show(realm)}) hoặc best.tier (${show(tier)}) không hợp lệ`,
      });
    } else {
      const expectedStep = stepOf(realm, tier);
      if (step !== expectedStep) {
        errors.push({
          code: "invalid_soul_best",
          message: `best.step (${show(step)}) không khớp với stepOf(${realm}, ${tier}) = ${expectedStep}`,
        });
      }
    }
  }

  // 8. lastCreditedLife
  if (data.lastCreditedLife !== undefined && data.lastCreditedLife !== "") {
    if (
      typeof data.lastCreditedLife !== "string" ||
      !/^[\x21-\x7e]{8,64}$/.test(data.lastCreditedLife)
    ) {
      errors.push({
        code: "invalid_soul_last_credited_life",
        message: "lastCreditedLife phải là chuỗi ASCII 8–64 ký tự hợp lệ",
      });
    }
  }

  // 9. history
  if (data.history !== undefined) {
    if (!Array.isArray(data.history)) {
      errors.push({
        code: "invalid_soul_history",
        message: "history phải là một mảng các mục SoulHistoryEntry",
      });
    } else {
      if (data.history.length > 20) {
        errors.push({
          code: "invalid_soul_history",
          message: `history có ${data.history.length} mục, vượt quá giới hạn tối đa (20)`,
        });
      }
      for (const entry of data.history) {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
          errors.push({
            code: "invalid_soul_history_entry",
            message: "Mục lịch sử chân linh phải là một JSON Object",
          });
        } else {
          if (!Number.isInteger(entry.kiep) || entry.kiep < 1) {
            errors.push({
              code: "invalid_soul_history_entry",
              message: `entry.kiep (${show(entry.kiep)}) phải là số nguyên >= 1`,
            });
          }
          if (!Number.isInteger(entry.step) || entry.step < 0) {
            errors.push({
              code: "invalid_soul_history_entry",
              message: `entry.step (${show(entry.step)}) phải là số nguyên >= 0`,
            });
          }
          if (
            typeof entry.minutes !== "number" ||
            !Number.isFinite(entry.minutes) ||
            entry.minutes < 0
          ) {
            errors.push({
              code: "invalid_soul_history_entry",
              message: `entry.minutes (${show(entry.minutes)}) phải là số hữu hạn không âm`,
            });
          }
          if (!Number.isInteger(entry.gain) || entry.gain < 0) {
            errors.push({
              code: "invalid_soul_history_entry",
              message: `entry.gain (${show(entry.gain)}) phải là số nguyên không âm`,
            });
          }
        }
      }
    }
  }

  return errors;
}

/**
 * Kiểm tra tính hợp lệ của nội dung một file tài khoản (accounts/<id>.json).
 * Tuyệt đối không trả về hay in passHash / recoveryHash trong mã lỗi hoặc thông báo.
 */
export function auditAccountSaveData(rawText: string, byteLength: number): AuditError[] {
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

  // 1. id
  if (typeof data.id !== "string" || !ACCOUNT_ID_REGEX.test(data.id)) {
    errors.push({
      code: "invalid_account_id",
      message: `id tài khoản (${show(data.id)}) không hợp lệ (cần chuỗi 8–64 ký tự chữ, số, gạch ngang)`,
    });
  }

  // 2. username
  const u = validateUsername(data.username);
  if (!u.ok || u.value !== data.username) {
    errors.push({
      code: "invalid_username",
      message: `Tên đăng nhập (${show(data.username)}) không hợp lệ (cần 3–20 ký tự chữ thường, số hoặc gạch dưới)`,
    });
  }

  // 3. passHash & recoveryHash (scrypt băm hợp lệ)
  if (typeof data.passHash !== "string" || parseHash(data.passHash) === null) {
    errors.push({
      code: "invalid_pass_hash",
      message: "passHash không phải chuỗi băm scrypt hợp lệ",
    });
  }

  if (typeof data.recoveryHash !== "string" || parseHash(data.recoveryHash) === null) {
    errors.push({
      code: "invalid_recovery_hash",
      message: "recoveryHash không phải chuỗi băm scrypt hợp lệ",
    });
  }

  // 4. createdAt & lastLoginAt
  if (!isIsoString(data.createdAt)) {
    errors.push({
      code: "invalid_created_at",
      message: `createdAt (${show(data.createdAt)}) không phải định dạng ngày ISO hợp lệ`,
    });
  }

  if (!isIsoString(data.lastLoginAt)) {
    errors.push({
      code: "invalid_last_login_at",
      message: `lastLoginAt (${show(data.lastLoginAt)}) không phải định dạng ngày ISO hợp lệ`,
    });
  }

  // 5. disabled
  if (typeof data.disabled !== "boolean") {
    errors.push({
      code: "invalid_disabled",
      message: `disabled (${show(data.disabled)}) phải là kiểu boolean`,
    });
  }

  // 6. name (đạo hiệu nếu có)
  if (data.name !== undefined) {
    if (typeof data.name !== "string" || cleanName(data.name) !== data.name) {
      errors.push({
        code: "invalid_account_name",
        message: `Đạo hiệu (${show(data.name)}) không hợp lệ theo quy tắc cleanName`,
      });
    }
  }

  return errors;
}

/**
 * Kiểm tra tính hợp lệ của nội dung một file phiên (sessions/<tokenHash>.json).
 * Tuyệt đối không để lộ tokenHash hay thông tin nhạy cảm.
 */
export function auditSessionSaveData(rawText: string, byteLength: number): AuditError[] {
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

  // 1. tokenHash: sha256 hex 64 ký tự chữ thường
  if (typeof data.tokenHash !== "string" || !TOKEN_HASH_REGEX.test(data.tokenHash)) {
    errors.push({
      code: "invalid_token_hash",
      message: "tokenHash phải là chuỗi hex sha256 64 ký tự chữ thường",
    });
  }

  // 2. accountId
  if (typeof data.accountId !== "string" || !ACCOUNT_ID_REGEX.test(data.accountId)) {
    errors.push({
      code: "invalid_account_id",
      message: `accountId (${show(data.accountId)}) không hợp lệ (cần 8–64 ký tự chữ, số, gạch ngang)`,
    });
  }

  // 3. Thời gian: createdAt, expiresAt, lastSeenAt
  if (!isFiniteEpoch(data.createdAt)) {
    errors.push({
      code: "invalid_session_time",
      message: `createdAt (${show(data.createdAt)}) phải là số epoch ms hợp lệ`,
    });
  }

  if (!isFiniteEpoch(data.expiresAt)) {
    errors.push({
      code: "invalid_session_time",
      message: `expiresAt (${show(data.expiresAt)}) phải là số epoch ms hợp lệ`,
    });
  }

  if (!isFiniteEpoch(data.lastSeenAt)) {
    errors.push({
      code: "invalid_session_time",
      message: `lastSeenAt (${show(data.lastSeenAt)}) phải là số epoch ms hợp lệ`,
    });
  }

  return errors;
}

/**
 * Kiểm tra tính toàn vẹn của một file dữ liệu tông môn (.json) (Issue #231, M3.6 6e).
 * Trả về danh sách các lỗi vi phạm (nếu có).
 */
export function auditSectSaveData(rawText: string, byteLength: number): AuditError[] {
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

  // 1. Phiên bản schema: v === 1
  if (data.v !== 1) {
    errors.push({
      code: "invalid_sect_version",
      message: `Phiên bản schema v (${show(data.v)}) không hợp lệ, yêu cầu v=1`,
    });
  }

  // 2. id: uuid/chuỗi an toàn
  if (typeof data.id !== "string" || !isSectId(data.id)) {
    errors.push({
      code: "invalid_sect_id",
      message: `id (${show(data.id)}) không hợp lệ (cần 1–64 ký tự chữ, số, gạch ngang, gạch dưới)`,
    });
  }

  // 3. name: tên tông môn (phải là chuỗi đã chuẩn hoá)
  if (
    typeof data.name !== "string" ||
    cleanSectName(data.name) === null ||
    cleanSectName(data.name) !== data.name
  ) {
    errors.push({
      code: "invalid_sect_name",
      message: `name (${show(data.name)}) không hợp lệ (${SECT_NAME_MIN}–${SECT_NAME_MAX} ký tự, đã chuẩn hoá, không chứa ký tự cấm)`,
    });
  }

  // 4. tag: biệt hiệu (phải là chuỗi đã chuẩn hoá)
  if (
    typeof data.tag !== "string" ||
    cleanSectTag(data.tag) === null ||
    cleanSectTag(data.tag) !== data.tag
  ) {
    errors.push({
      code: "invalid_sect_tag",
      message: `tag (${show(data.tag)}) không hợp lệ (${SECT_TAG_MIN}–${SECT_TAG_MAX} ký tự, chữ và số)`,
    });
  }

  // 5. leader: soulKey của Tông chủ
  if (typeof data.leader !== "string" || data.leader.length < 1 || data.leader.length > 200) {
    errors.push({
      code: "invalid_sect_leader",
      message: `leader (${show(data.leader)}) phải là chuỗi soulKey 1–200 ký tự`,
    });
  }

  // 6. motd: thông báo tông môn
  if (data.motd !== undefined) {
    if (typeof data.motd !== "string" || cleanMotd(data.motd) === null) {
      errors.push({
        code: "invalid_sect_motd",
        message: `motd (${show(data.motd)}) không hợp lệ (tối đa ${SECT_MOTD_MAX} ký tự)`,
      });
    }
  }

  // 7. members: danh sách thành viên
  if (
    !Array.isArray(data.members) ||
    data.members.length < 1 ||
    data.members.length > SECT_MAX_MEMBERS
  ) {
    errors.push({
      code: "invalid_sect_members",
      message: `members phải là mảng chứa 1–${SECT_MAX_MEMBERS} thành viên`,
    });
  } else {
    const seenSoulKeys = new Set<string>();
    let chuCount = 0;
    let elderCount = 0;
    let leaderFound = false;

    for (let i = 0; i < data.members.length; i++) {
      const m = data.members[i];
      if (m === null || typeof m !== "object" || Array.isArray(m)) {
        errors.push({
          code: "invalid_sect_member_record",
          message: `Thành viên thứ ${i} không phải là một object`,
        });
        continue;
      }

      if (typeof m.soulKey !== "string" || m.soulKey.length < 1 || m.soulKey.length > 200) {
        errors.push({
          code: "invalid_sect_member_soul_key",
          message: `Thành viên thứ ${i} có soulKey (${show(m.soulKey)}) không hợp lệ`,
        });
      } else if (seenSoulKeys.has(m.soulKey)) {
        errors.push({
          code: "duplicate_sect_member",
          message: `Thành viên có soulKey (${show(m.soulKey)}) bị trùng lặp trong cùng tông môn`,
        });
      } else {
        seenSoulKeys.add(m.soulKey);
      }

      if (typeof m.name !== "string" || cleanName(m.name) === null) {
        errors.push({
          code: "invalid_sect_member_name",
          message: `Thành viên thứ ${i} có đạo hiệu (${show(m.name)}) không hợp lệ`,
        });
      }

      if (typeof m.rank !== "string" || !SECT_RANKS.includes(m.rank as any)) {
        errors.push({
          code: "invalid_sect_member_rank",
          message: `Thành viên thứ ${i} có chức vụ (${show(m.rank)}) không hợp lệ (cần chu, truong_lao hoặc de_tu)`,
        });
      } else {
        if (m.rank === "chu") {
          chuCount++;
          if (typeof data.leader === "string" && m.soulKey === data.leader) {
            leaderFound = true;
          }
        } else if (m.rank === "truong_lao") {
          elderCount++;
        }
      }

      if (!isFiniteEpoch(m.joinedAt)) {
        errors.push({
          code: "invalid_sect_member_joined_at",
          message: `Thành viên thứ ${i} có joinedAt (${show(m.joinedAt)}) không phải số epoch ms hợp lệ`,
        });
      }
    }

    if (chuCount !== 1 || !leaderFound) {
      errors.push({
        code: "invalid_sect_leader_match",
        message: `Tông môn phải có đúng 1 Tông chủ và phải trùng với trường leader (${show(data.leader)})`,
      });
    }

    if (elderCount > SECT_ELDERS_MAX) {
      errors.push({
        code: "too_many_elders",
        message: `Số lượng Trưởng lão (${elderCount}) vượt quá giới hạn tối đa ${SECT_ELDERS_MAX}`,
      });
    }
  }

  // 8. coin: kho Linh thạch
  if (
    typeof data.coin !== "number" ||
    !Number.isSafeInteger(data.coin) ||
    data.coin < 0 ||
    data.coin > SECT_COIN_CAP
  ) {
    errors.push({
      code: "invalid_sect_coin",
      message: `coin (${show(data.coin)}) phải là số nguyên nằm trong khoảng 0..${SECT_COIN_CAP}`,
    });
  }

  // 9. log: sổ kho
  if (data.log !== undefined) {
    if (!Array.isArray(data.log) || data.log.length > SECT_LOG_MAX) {
      errors.push({
        code: "invalid_sect_log",
        message: `log phải là mảng chứa tối đa ${SECT_LOG_MAX} mục`,
      });
    } else {
      for (let i = 0; i < data.log.length; i++) {
        const entry = data.log[i];
        if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
          errors.push({
            code: "invalid_sect_log_entry",
            message: `Mục sổ kho thứ ${i} không phải là một object`,
          });
          continue;
        }
        if (!isFiniteEpoch(entry.at)) {
          errors.push({
            code: "invalid_sect_log_time",
            message: `Mục sổ kho thứ ${i} có mốc thời gian (${show(entry.at)}) không hợp lệ`,
          });
        }
        if (typeof entry.name !== "string" || cleanName(entry.name) === null) {
          errors.push({
            code: "invalid_sect_log_name",
            message: `Mục sổ kho thứ ${i} có tên (${show(entry.name)}) không hợp lệ`,
          });
        }
        if (entry.kind !== "deposit" && entry.kind !== "withdraw") {
          errors.push({
            code: "invalid_sect_log_kind",
            message: `Mục sổ kho thứ ${i} có loại giao dịch (${show(entry.kind)}) không hợp lệ (cần deposit hoặc withdraw)`,
          });
        }
        if (
          typeof entry.amount !== "number" ||
          !Number.isSafeInteger(entry.amount) ||
          entry.amount < 1 ||
          entry.amount > SECT_COIN_CAP
        ) {
          errors.push({
            code: "invalid_sect_log_amount",
            message: `Mục sổ kho thứ ${i} có số lượng (${show(entry.amount)}) không hợp lệ (cần số nguyên 1..${SECT_COIN_CAP})`,
          });
        }
      }
    }
  }

  // 10. createdAt, updatedAt
  if (!isFiniteEpoch(data.createdAt)) {
    errors.push({
      code: "invalid_sect_time",
      message: `createdAt (${show(data.createdAt)}) phải là số epoch ms hợp lệ`,
    });
  }
  if (!isFiniteEpoch(data.updatedAt)) {
    errors.push({
      code: "invalid_sect_time",
      message: `updatedAt (${show(data.updatedAt)}) phải là số epoch ms hợp lệ`,
    });
  }

  return errors;
}

/**
 * Quét toàn bộ thư mục file lưu nhân vật và lập báo cáo audit chi tiết.
 * Ném lỗi nếu thư mục không tồn tại.
 */
export function auditSavesDirectory(dirPath: string): AuditReport {
  assertNotProd(dirPath, "kiem-save");
  const resolvedDir = path.resolve(dirPath);
  assertNotProd(resolvedDir, "kiem-save");

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

  // Kiểm tra thư mục con souls/ nếu có (#151)
  const soulsDir = path.join(resolvedDir, "souls");
  const hasSoulsDir = existsSync(soulsDir) && statSync(soulsDir).isDirectory();
  let totalSouls: number | undefined;
  let cleanSouls: number | undefined;
  let errorSouls: number | undefined;

  // Map lưu thông tin chân linh để đối chiếu với limbo: sha1(id) -> { id, lastCreditedLife }
  const soulsByHash = new Map<string, { id: string; lastCreditedLife: string }>();

  if (hasSoulsDir) {
    const soulEntries = readdirSync(soulsDir);
    // Bỏ qua các file cách ly (*.hong-*) và file tạm (*.tmp)
    const soulJsonFiles = soulEntries.filter(
      (f) => f.endsWith(".json") && !f.includes(".hong-") && !f.endsWith(".tmp"),
    );

    totalSouls = soulJsonFiles.length;
    cleanSouls = 0;
    errorSouls = 0;

    for (const filename of soulJsonFiles) {
      const fullPath = path.join(soulsDir, filename);
      let rawContent = "";
      let byteLength: number;

      try {
        const fileStat = lstatSync(fullPath);
        if (!fileStat.isFile()) {
          const errList = [
            {
              code: "not_regular_file",
              message: "File chân linh không phải file thông thường",
            },
          ];
          errorSouls++;
          errorsByCode.not_regular_file = (errorsByCode.not_regular_file ?? 0) + 1;
          if (failedFiles.length < 10) {
            failedFiles.push({ file: `souls/${filename}`, errors: errList });
          }
          continue;
        }
        byteLength = fileStat.size;
        if (byteLength <= MAX_FILE_SIZE) {
          rawContent = readFileSync(fullPath, "utf8");
        }
      } catch (err: any) {
        const errList = [
          {
            code: "read_error",
            message: `Không thể đọc file chân linh: ${err?.message ?? "lỗi I/O"}`,
          },
        ];
        errorSouls++;
        errorsByCode.read_error = (errorsByCode.read_error ?? 0) + 1;
        if (failedFiles.length < 10) {
          failedFiles.push({ file: `souls/${filename}`, errors: errList });
        }
        continue;
      }

      const soulErrors = auditSoulSaveData(rawContent, byteLength);

      // Kiểm tra tên file <sha1(id)>.json có khớp với sha1(soulIdOf(data.id)) không
      if (soulErrors.length === 0) {
        try {
          const parsed = JSON.parse(rawContent);
          const expectedHash = createHash("sha1").update(soulIdOf(parsed.id)).digest("hex");
          if (filename !== `${expectedHash}.json`) {
            soulErrors.push({
              code: "mismatched_soul_filename",
              message: `Tên file chân linh (${show(filename)}) không khớp với sha1(id) (${expectedHash}.json)`,
            });
          } else {
            soulsByHash.set(expectedHash, {
              id: parsed.id,
              lastCreditedLife:
                typeof parsed.lastCreditedLife === "string" ? parsed.lastCreditedLife : "",
            });
          }
        } catch {
          // JSON đã được kiểm tra trong auditSoulSaveData
        }
      }

      if (soulErrors.length === 0) {
        cleanSouls++;
      } else {
        errorSouls++;
        for (const err of soulErrors) {
          errorsByCode[err.code] = (errorsByCode[err.code] ?? 0) + 1;
        }
        if (failedFiles.length < 10) {
          failedFiles.push({ file: `souls/${filename}`, errors: soulErrors });
        }
      }
    }
  }

  // Kiểm tra thư mục con accounts/ nếu có (#176)
  const accountsDir = path.join(resolvedDir, "accounts");
  const hasAccountsDir = existsSync(accountsDir) && statSync(accountsDir).isDirectory();
  let totalAccounts: number | undefined;
  let cleanAccounts: number | undefined;
  let errorAccounts: number | undefined;
  const accountsById = new Set<string>();
  const accountsByUsername = new Map<string, string>();
  const accountsByNameKey = new Map<string, string>();

  if (hasAccountsDir) {
    const accountEntries = readdirSync(accountsDir);
    const accountJsonFiles = accountEntries.filter(
      (f) => f.endsWith(".json") && !f.includes(".hong-") && !f.endsWith(".tmp"),
    );

    totalAccounts = accountJsonFiles.length;
    cleanAccounts = 0;
    errorAccounts = 0;

    for (const filename of accountJsonFiles) {
      const fullPath = path.join(accountsDir, filename);
      let rawContent = "";
      let byteLength: number;

      try {
        const fileStat = lstatSync(fullPath);
        if (!fileStat.isFile()) {
          const errList = [
            {
              code: "not_regular_file",
              message: "File tài khoản không phải file thông thường",
            },
          ];
          errorAccounts++;
          errorsByCode.not_regular_file = (errorsByCode.not_regular_file ?? 0) + 1;
          if (failedFiles.length < 10) {
            failedFiles.push({ file: `accounts/${filename}`, errors: errList });
          }
          continue;
        }
        byteLength = fileStat.size;
        if (byteLength <= MAX_FILE_SIZE) {
          rawContent = readFileSync(fullPath, "utf8");
        }
      } catch (err: any) {
        const errList = [
          {
            code: "read_error",
            message: `Không thể đọc file tài khoản: ${err?.message ?? "lỗi I/O"}`,
          },
        ];
        errorAccounts++;
        errorsByCode.read_error = (errorsByCode.read_error ?? 0) + 1;
        if (failedFiles.length < 10) {
          failedFiles.push({ file: `accounts/${filename}`, errors: errList });
        }
        continue;
      }

      const accountErrors = auditAccountSaveData(rawContent, byteLength);

      if (accountErrors.length === 0) {
        try {
          const parsed = JSON.parse(rawContent);
          if (filename !== `${parsed.id}.json`) {
            accountErrors.push({
              code: "mismatched_account_filename",
              message: `Tên file tài khoản (${show(filename)}) không khớp với id (${show(parsed.id)}.json)`,
            });
          }
          if (accountsByUsername.has(parsed.username)) {
            accountErrors.push({
              code: "duplicate_username",
              message: `Tên đăng nhập (${show(parsed.username)}) bị trùng lặp với file ${accountsByUsername.get(parsed.username)}`,
            });
          } else {
            accountsByUsername.set(parsed.username, filename);
          }
          if (parsed.name) {
            const nKey = nameKeyOf(parsed.name);
            if (accountsByNameKey.has(nKey)) {
              accountErrors.push({
                code: "duplicate_account_name",
                message: `Đạo hiệu (${show(parsed.name)}) bị trùng lặp với file ${accountsByNameKey.get(nKey)}`,
              });
            } else {
              accountsByNameKey.set(nKey, filename);
            }
          }
          if (accountErrors.length === 0) {
            accountsById.add(parsed.id);
          }
        } catch {
          // JSON đã được kiểm tra trong auditAccountSaveData
        }
      }

      if (accountErrors.length === 0) {
        cleanAccounts++;
      } else {
        errorAccounts++;
        for (const err of accountErrors) {
          errorsByCode[err.code] = (errorsByCode[err.code] ?? 0) + 1;
        }
        if (failedFiles.length < 10) {
          failedFiles.push({ file: `accounts/${filename}`, errors: accountErrors });
        }
      }
    }
  }

  // Kiểm tra thư mục con sessions/ nếu có (#176)
  const sessionsDir = path.join(resolvedDir, "sessions");
  const hasSessionsDir = existsSync(sessionsDir) && statSync(sessionsDir).isDirectory();
  let totalSessions: number | undefined;
  let cleanSessions: number | undefined;
  let errorSessions: number | undefined;

  if (hasSessionsDir) {
    const sessionEntries = readdirSync(sessionsDir);
    const sessionJsonFiles = sessionEntries.filter(
      (f) => f.endsWith(".json") && !f.includes(".hong-") && !f.endsWith(".tmp"),
    );

    totalSessions = sessionJsonFiles.length;
    cleanSessions = 0;
    errorSessions = 0;

    for (const filename of sessionJsonFiles) {
      const fullPath = path.join(sessionsDir, filename);
      let rawContent = "";
      let byteLength: number;

      try {
        const fileStat = lstatSync(fullPath);
        if (!fileStat.isFile()) {
          const errList = [
            {
              code: "not_regular_file",
              message: "File phiên không phải file thông thường",
            },
          ];
          errorSessions++;
          errorsByCode.not_regular_file = (errorsByCode.not_regular_file ?? 0) + 1;
          if (failedFiles.length < 10) {
            failedFiles.push({ file: `sessions/${filename}`, errors: errList });
          }
          continue;
        }
        byteLength = fileStat.size;
        if (byteLength <= MAX_FILE_SIZE) {
          rawContent = readFileSync(fullPath, "utf8");
        }
      } catch (err: any) {
        const errList = [
          {
            code: "read_error",
            message: `Không thể đọc file phiên: ${err?.message ?? "lỗi I/O"}`,
          },
        ];
        errorSessions++;
        errorsByCode.read_error = (errorsByCode.read_error ?? 0) + 1;
        if (failedFiles.length < 10) {
          failedFiles.push({ file: `sessions/${filename}`, errors: errList });
        }
        continue;
      }

      const sessionErrors = auditSessionSaveData(rawContent, byteLength);

      if (sessionErrors.length === 0) {
        try {
          const parsed = JSON.parse(rawContent);
          if (filename !== `${parsed.tokenHash}.json`) {
            sessionErrors.push({
              code: "mismatched_session_filename",
              message: `Tên file phiên (${show(filename)}) không khớp với tokenHash (${show(parsed.tokenHash)}.json)`,
            });
          }
          // Kiểm tra tính nhất quán tham chiếu tài khoản
          if (hasAccountsDir && accountsById.size > 0 && !accountsById.has(parsed.accountId)) {
            sessionErrors.push({
              code: "orphan_session",
              message: `Phiên trỏ tới accountId (${show(parsed.accountId)}) không tồn tại trong accounts/`,
            });
          }
        } catch {
          // JSON đã được kiểm tra trong auditSessionSaveData
        }
      }

      if (sessionErrors.length === 0) {
        cleanSessions++;
      } else {
        errorSessions++;
        for (const err of sessionErrors) {
          errorsByCode[err.code] = (errorsByCode[err.code] ?? 0) + 1;
        }
        if (failedFiles.length < 10) {
          failedFiles.push({ file: `sessions/${filename}`, errors: sessionErrors });
        }
      }
    }
  }

  // Kiểm tra thư mục con sects/ nếu có (#231, M3.6 6e)
  const sectsDir = path.join(resolvedDir, "sects");
  const hasSectsDir = existsSync(sectsDir) && statSync(sectsDir).isDirectory();
  let totalSects: number | undefined;
  let cleanSects: number | undefined;
  let errorSects: number | undefined;
  const sectsById = new Set<string>();
  const sectsByNameKey = new Map<string, string>();
  const sectsByTagKey = new Map<string, string>();
  const memberSectsBySoulKey = new Map<string, string>();

  if (hasSectsDir) {
    const sectEntries = readdirSync(sectsDir);
    const sectJsonFiles = sectEntries.filter(
      (f) => f.endsWith(".json") && !f.includes(".hong-") && !f.endsWith(".tmp"),
    );

    totalSects = sectJsonFiles.length;
    cleanSects = 0;
    errorSects = 0;

    for (const filename of sectJsonFiles) {
      const fullPath = path.join(sectsDir, filename);
      let rawContent = "";
      let byteLength: number;

      try {
        const fileStat = lstatSync(fullPath);
        if (!fileStat.isFile()) {
          const errList = [
            {
              code: "not_regular_file",
              message: "File tông môn không phải file thông thường",
            },
          ];
          errorSects++;
          errorsByCode.not_regular_file = (errorsByCode.not_regular_file ?? 0) + 1;
          if (failedFiles.length < 10) {
            failedFiles.push({ file: `sects/${filename}`, errors: errList });
          }
          continue;
        }
        byteLength = fileStat.size;
        if (byteLength <= MAX_FILE_SIZE) {
          rawContent = readFileSync(fullPath, "utf8");
        }
      } catch (err: any) {
        const errList = [
          {
            code: "read_error",
            message: `Không thể đọc file tông môn: ${err?.message ?? "lỗi I/O"}`,
          },
        ];
        errorSects++;
        errorsByCode.read_error = (errorsByCode.read_error ?? 0) + 1;
        if (failedFiles.length < 10) {
          failedFiles.push({ file: `sects/${filename}`, errors: errList });
        }
        continue;
      }

      const sectErrors = auditSectSaveData(rawContent, byteLength);

      if (sectErrors.length === 0) {
        try {
          const parsed = JSON.parse(rawContent);
          if (filename !== `${parsed.id}.json`) {
            sectErrors.push({
              code: "mismatched_sect_filename",
              message: `Tên file tông môn (${show(filename)}) không khớp với id (${show(parsed.id)}.json)`,
            });
          }

          const nKey = sectKey(parsed.name);
          if (sectsByNameKey.has(nKey)) {
            sectErrors.push({
              code: "duplicate_sect_name",
              message: `Tên tông môn (${show(parsed.name)}) bị trùng lặp với file ${sectsByNameKey.get(nKey)}`,
            });
          } else {
            sectsByNameKey.set(nKey, filename);
          }

          const tKey = sectKey(parsed.tag);
          if (sectsByTagKey.has(tKey)) {
            sectErrors.push({
              code: "duplicate_sect_tag",
              message: `Biệt hiệu tông môn (${show(parsed.tag)}) bị trùng lặp với file ${sectsByTagKey.get(tKey)}`,
            });
          } else {
            sectsByTagKey.set(tKey, filename);
          }

          if (Array.isArray(parsed.members)) {
            for (const m of parsed.members) {
              if (m && typeof m.soulKey === "string") {
                if (memberSectsBySoulKey.has(m.soulKey)) {
                  sectErrors.push({
                    code: "member_in_multiple_sects",
                    message: `Linh hồn (${show(m.soulKey)}) thuộc nhiều hơn 1 tông môn (đã có trong file ${memberSectsBySoulKey.get(m.soulKey)})`,
                  });
                } else {
                  memberSectsBySoulKey.set(m.soulKey, filename);
                }
              }
            }
          }

          if (sectErrors.length === 0) {
            sectsById.add(parsed.id);
          }
        } catch {
          // JSON đã được kiểm tra trong auditSectSaveData
        }
      }

      if (sectErrors.length === 0) {
        cleanSects++;
      } else {
        errorSects++;
        for (const err of sectErrors) {
          errorsByCode[err.code] = (errorsByCode[err.code] ?? 0) + 1;
        }
        if (failedFiles.length < 10) {
          failedFiles.push({ file: `sects/${filename}`, errors: sectErrors });
        }
      }
    }
  }

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

    // Kiểm tra tính nhất quán giữa limbo và chân linh (#151)
    if (errors.length === 0) {
      try {
        const pData = JSON.parse(rawContent);
        if (pData?.limbo && pData.limbo.credited === true) {
          if (!hasSoulsDir) {
            errors.push({
              code: "limbo_soul_missing",
              message: `Hồ sơ limbo đã ghi nhận (credited: true) nhưng thư mục chân linh souls/ không tồn tại`,
            });
          } else {
            const sid = soulIdOf(pData.name);
            const hash = createHash("sha1").update(sid).digest("hex");
            const soulInfo = soulsByHash.get(hash);
            if (!soulInfo) {
              errors.push({
                code: "limbo_soul_missing",
                message: `Hồ sơ limbo đã ghi nhận (credited: true) nhưng không tìm thấy file chân linh souls/${hash}.json`,
              });
            } else if (soulInfo.lastCreditedLife !== pData.limbo.endedLifeId) {
              errors.push({
                code: "limbo_soul_inconsistent",
                message: `Hồ sơ limbo ghi endedLifeId=${show(pData.limbo.endedLifeId)} nhưng chân linh ghi lastCreditedLife=${show(soulInfo.lastCreditedLife)}`,
              });
            }
          }
        }
      } catch {
        // Bỏ qua lỗi parse nếu đã được ghi nhận trước đó
      }
    }

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
    totalSouls,
    cleanSouls,
    errorSouls,
    totalAccounts,
    cleanAccounts,
    errorAccounts,
    totalSessions,
    cleanSessions,
    errorSessions,
    totalSects,
    cleanSects,
    errorSects,
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
    const ok =
      report.errorFiles === 0 &&
      (report.errorSouls ?? 0) === 0 &&
      (report.errorAccounts ?? 0) === 0 &&
      (report.errorSessions ?? 0) === 0 &&
      (report.errorSects ?? 0) === 0;
    return ok ? 0 : 1;
  }

  console.log(
    `\n=== BÁO CÁO KIỂM TRA DỮ LIỆU FILE LƯU NHÂN VẬT, CHÂN LINH, TÀI KHOẢN & TÔNG MÔN ===`,
  );
  console.log(`- Thư mục kiểm tra: ${report.dataDir}`);
  console.log(`- Tổng số file nhân vật (.json): ${report.totalFiles}`);
  console.log(`- File nhân vật sạch (hợp lệ): ${report.cleanFiles}`);
  console.log(`- File nhân vật có lỗi vi phạm: ${report.errorFiles}`);
  if (report.totalSouls !== undefined) {
    console.log(`- Tổng số file chân linh (souls/): ${report.totalSouls}`);
    console.log(`- File chân linh sạch (hợp lệ): ${report.cleanSouls}`);
    console.log(`- File chân linh có lỗi vi phạm: ${report.errorSouls}`);
  }
  if (report.totalAccounts !== undefined) {
    console.log(`- Tổng số file tài khoản (accounts/): ${report.totalAccounts}`);
    console.log(`- File tài khoản sạch (hợp lệ): ${report.cleanAccounts}`);
    console.log(`- File tài khoản có lỗi vi phạm: ${report.errorAccounts}`);
  }
  if (report.totalSessions !== undefined) {
    console.log(`- Tổng số file phiên (sessions/): ${report.totalSessions}`);
    console.log(`- File phiên sạch (hợp lệ): ${report.cleanSessions}`);
    console.log(`- File phiên có lỗi vi phạm: ${report.errorSessions}`);
  }
  if (report.totalSects !== undefined) {
    console.log(`- Tổng số file tông môn (sects/): ${report.totalSects}`);
    console.log(`- File tông môn sạch (hợp lệ): ${report.cleanSects}`);
    console.log(`- File tông môn có lỗi vi phạm: ${report.errorSects}`);
  }

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

  const totalErrors =
    report.errorFiles +
    (report.errorSouls ?? 0) +
    (report.errorAccounts ?? 0) +
    (report.errorSessions ?? 0) +
    (report.errorSects ?? 0);
  if (totalErrors === 0) {
    console.log(`\n✅ TẤT CẢ DỮ LIỆU ĐỀU HỢP LỆ VÀ AN TOÀN.\n`);
    return 0;
  } else {
    console.log(`\n⚠️ PHÁT HIỆN ${totalErrors} FILE DỮ LIỆU KHÔNG HỢP LỆ!\n`);
    return 1;
  }
}

if (process.argv[1]?.endsWith("audit-saves.ts")) {
  const exitCode = main();
  process.exit(exitCode);
}
