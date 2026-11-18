#!/usr/bin/env node
/* global fetch, console */
/**
 * Script sinh ảnh thô hàng loạt bằng ComfyUI SDXL base cho Tiên Giới (#513, #1006).
 *
 * Nhận tham số lô từ CLI hoặc biến môi trường:
 *   node scripts/art/gen-raw-batch.mjs map   # Lô 1: 5 thẻ bản đồ x 3 hạt giống = 15 ảnh thô 1216x832
 *   node scripts/art/gen-raw-batch.mjs boss  # Lô 2: 4 thẻ trùm x 4 hạt giống = 16 ảnh thô 1024x1024
 *
 * Nạp trực tiếp `MAP_CARD_BATCH`, `BOSS_CARD_BATCH` và `NEGATIVE_PROMPT` từ `client/scripts/art/prompt-rules.mjs`.
 *
 * Tuân thủ tuyệt đối quy tắc tài sản AI của Tiên Giới (Mục 18.3 QUYET_DINH_M3, docs/KE_HOACH_DO_HOA_AI.md):
 * - Chỉ dùng SDXL base (`sd_xl_base_1.0.safetensors`, sha256: `31e35c80fc4829d14f90153f4c74cd59c90b779f6afe05a74cd6120b893f7e5b`)
 * - Không dùng LoRA
 * - KSampler euler / normal / 25 bước / CFG 7.0 / denoise 1.0
 * - Ảnh thô sinh vào /mnt/data/comfyui/output/<id>_raw_<n>_00001_.png
 * - Vòng đời ComfyUI quản lý qua comfy-up.sh và comfy-down.sh (tự dọn dẹp kể cả khi có lỗi)
 */

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  BOSS_CARD_BATCH,
  MAP_CARD_BATCH,
  NEGATIVE_PROMPT,
} from "../../client/scripts/art/prompt-rules.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");

const COMFY_URL = process.env.COMFY_URL || "http://127.0.0.1:8188";
const OUTPUT_DIR = process.env.OUTPUT_DIR || "/mnt/data/comfyui/output";
const COMFY_UP = path.join(REPO_ROOT, "scripts/art/comfy-up.sh");
const COMFY_DOWN = path.join(REPO_ROOT, "scripts/art/comfy-down.sh");

export const BATCH_MAP = {
  map: MAP_CARD_BATCH,
  lo1: MAP_CARD_BATCH,
  1: MAP_CARD_BATCH,
  boss: BOSS_CARD_BATCH,
  trum: BOSS_CARD_BATCH,
  lo2: BOSS_CARD_BATCH,
  2: BOSS_CARD_BATCH,
};

export function buildWorkflow(positivePrompt, negativePrompt, seed, prefix, width, height) {
  return {
    3: {
      class_type: "KSampler",
      inputs: {
        cfg: 7,
        denoise: 1,
        latent_image: ["5", 0],
        model: ["4", 0],
        negative: ["7", 0],
        positive: ["6", 0],
        sampler_name: "euler",
        scheduler: "normal",
        seed,
        steps: 25,
      },
    },
    4: {
      class_type: "CheckpointLoaderSimple",
      inputs: {
        ckpt_name: "sd_xl_base_1.0.safetensors",
      },
    },
    5: {
      class_type: "EmptyLatentImage",
      inputs: {
        batch_size: 1,
        height,
        width,
      },
    },
    6: {
      class_type: "CLIPTextEncode",
      inputs: {
        clip: ["4", 1],
        text: positivePrompt,
      },
    },
    7: {
      class_type: "CLIPTextEncode",
      inputs: {
        clip: ["4", 1],
        text: negativePrompt,
      },
    },
    8: {
      class_type: "VAEDecode",
      inputs: {
        samples: ["3", 0],
        vae: ["4", 2],
      },
    },
    9: {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: prefix,
        images: ["8", 0],
      },
    },
  };
}

export async function queuePrompt(workflow) {
  const res = await fetch(`${COMFY_URL}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ComfyUI /prompt lỗi HTTP ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.prompt_id;
}

export async function waitForHistory(promptId, timeoutSec = 180) {
  const start = Date.now();
  let fetchFails = 0;
  while ((Date.now() - start) / 1000 < timeoutSec) {
    try {
      const res = await fetch(`${COMFY_URL}/history/${promptId}`);
      if (res.ok) {
        fetchFails = 0;
        const hist = await res.json();
        if (hist[promptId]) {
          const entry = hist[promptId];
          if (entry.status?.status_str === "error") {
            throw new Error(`ComfyUI báo lỗi khi sinh ảnh: ${JSON.stringify(entry.status)}`);
          }
          const images = entry.outputs?.["9"]?.images;
          if (images && images.length > 0) {
            return images[0];
          }
        }
      }
    } catch (e) {
      fetchFails++;
      if (fetchFails > 10) {
        throw new Error(`Không thể kết nối ComfyUI tại ${COMFY_URL} (${e.message})`, { cause: e });
      }
    }
    await sleep(1000);
  }
  throw new Error(`Quá thời gian chờ (${timeoutSec}s) cho promptId: ${promptId}`);
}

export function calculateSha256(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function runBatch(batchDef) {
  const { w, h } = batchDef.raw;
  const total = batchDef.items.reduce((acc, c) => acc + c.seeds.length, 0);
  console.log(
    `=== BẮT ĐẦU LÔ "${batchDef.class}": ${batchDef.items.length} THẺ (${total} ẢNH THÔ, ${w}x${h}) ===`,
  );

  for (let attempt = 1; ; attempt++) {
    try {
      execFileSync(COMFY_UP, { stdio: "inherit" });
      break;
    } catch (e) {
      if (attempt >= 30) throw e;
      console.log(`Chờ GPU rảnh (lần thử ${attempt}/30)...`);
      await sleep(3000);
    }
  }

  const results = [];
  let idx = 0;

  try {
    for (const item of batchDef.items) {
      for (let i = 0; i < item.seeds.length; i++) {
        idx++;
        const n = i + 1;
        const seed = item.seeds[i];
        const prefix = `${item.id}_raw_${n}`;
        console.log(`\n[${idx}/${total}] Sinh ${prefix} (id=${item.id}, seed=${seed})...`);

        const workflow = buildWorkflow(item.prompt, NEGATIVE_PROMPT, seed, prefix, w, h);
        const startTime = Date.now();
        const promptId = await queuePrompt(workflow);
        const imgInfo = await waitForHistory(promptId, 180);
        const elapsedSec = Number(((Date.now() - startTime) / 1000).toFixed(1));

        const fullPath = path.join(OUTPUT_DIR, imgInfo.subfolder || "", imgInfo.filename);
        if (!fs.existsSync(fullPath)) {
          throw new Error(`Không tìm thấy ảnh tại: ${fullPath}`);
        }
        const rawSha256 = calculateSha256(fullPath);
        const sizeKb = Number((fs.statSync(fullPath).size / 1024).toFixed(1));

        console.log(` -> ${imgInfo.filename} (${sizeKb} KB, ${elapsedSec}s) sha256=${rawSha256}`);
        results.push({
          id: item.id,
          n,
          seed,
          filename: imgInfo.filename,
          fullPath,
          sizeKb,
          elapsedSec,
          rawSha256,
        });
      }
    }

    console.table(
      results.map((r) => ({
        ID: `${r.id}_raw_${r.n}`,
        Tệp: r.filename,
        Seed: r.seed,
        "Cỡ (KB)": r.sizeKb,
        "Thời gian (s)": r.elapsedSec,
        rawSha256: r.rawSha256,
      })),
    );
    return results;
  } finally {
    console.log("\nĐang tắt ComfyUI qua comfy-down.sh...");
    try {
      execFileSync(COMFY_DOWN, { stdio: "inherit" });
    } catch (e) {
      console.error("Lỗi khi tắt ComfyUI:", e);
    }
  }
}

async function main() {
  const arg = (process.argv[2] || process.env.BATCH || "").toLowerCase();
  const batchDef = BATCH_MAP[arg];
  if (!batchDef) {
    console.error(`Sử dụng: node scripts/art/gen-raw-batch.mjs <map|boss|lo1|lo2>`);
    console.error(`  map  / lo1: Lô 1 (5 thẻ bản đồ x 3 hạt giống, 1216x832)`);
    console.error(`  boss / lo2: Lô 2 (4 thẻ trùm x 4 hạt giống, 1024x1024)`);
    process.exit(1);
  }
  await runBatch(batchDef);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("LỖI CHẠY SINH ẢNH THÔ:", err);
    process.exit(1);
  });
}
