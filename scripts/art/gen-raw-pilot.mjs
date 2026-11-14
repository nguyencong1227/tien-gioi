#!/usr/bin/env node
/* global fetch, console */
/**
 * Script sinh lô ảnh thô (raw images) bằng ComfyUI SDXL base phục vụ Pilot G3 (#497, #513)
 * Tuân thủ tuyệt đối:
 * - Chỉ dùng SDXL base (sd_xl_base_1.0.safetensors, sha256: 31e35c80fc4829d14f90153f4c74cd59c90b779f6afe05a74cd6120b893f7e5b)
 * - LoRA rỗng [] (không tải, không dùng bất kỳ LoRA nào)
 * - Đầu ra đặt tại /mnt/data/comfyui/output/, TUYỆT ĐỐI KHÔNG commit ảnh vào git
 * - Không chữ Hán, không chữ lạ, không phong cách game khác
 * - Tự động bật comfy-up.sh và tắt comfy-down.sh sau khi hoàn tất
 */

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");

const COMFY_URL = "http://127.0.0.1:8188";
const OUTPUT_DIR = process.env.OUTPUT_DIR || "/mnt/data/comfyui/output";
const COMFY_UP = path.join(REPO_ROOT, "scripts/art/comfy-up.sh");
const COMFY_DOWN = path.join(REPO_ROOT, "scripts/art/comfy-down.sh");

const NEGATIVE_PROMPT =
  "text, letters, words, watermark, signature, logo, cjk, chinese characters, blurry, lowres, distorted, modern, futuristic, photorealistic human face, western fantasy";

const PILOT_PROMPTS = [
  {
    id: "login_bg_raw_01",
    theme: "Môn phái tiên hiệp mờ sương bình minh (Toàn cảnh)",
    prompt:
      "masterpiece, ethereal eastern xianxia sect in mountains, ancient pavilions with curved roofs on floating peaks, cascading waterfalls, morning mist, golden dawn rays, subtle pine trees, tranquil atmosphere, soft painterly fantasy style, wide panoramic view, no people, no text",
    seed: 2026111501,
  },
  {
    id: "login_bg_raw_02",
    theme: "Cổng vòm tiên giới bồng lai (Góc nhìn từ dưới lên)",
    prompt:
      "grand oriental celestial gate archway perched atop a sacred misty mountain summit, glowing spiritual stones, stone stairs carved into cliffside, sea of clouds below, sunset warm glow, majestic taoist immortal sanctuary, painterly landscape art, no people, no text",
    seed: 2026111502,
  },
  {
    id: "login_bg_raw_03",
    theme: "Hồ linh tuyền và cổ thụ ngàn năm (Tĩnh lặng, huyền bí)",
    prompt:
      "serene spiritual spring lake in high mountain valley, giant ancient glowing wisteria and pine trees, floating lotus lanterns with soft spiritual lights, towering cliffs shrouded in blue mist, magical twilight, oriental cultivation fantasy art, no people, no text",
    seed: 2026111503,
  },
  {
    id: "login_bg_raw_04",
    theme: "Đỉnh Lạc Hà sương sớm (Phù hợp trấn Lạc Hà / bản đồ đầu tiên)",
    prompt:
      "sacred peak at dawn overlooking vast sea of clouds, traditional ancient wooden cultivation pagoda on edge of cliff, flying spirit cranes in distance, gentle sunlight illuminating morning mist, calm meditative ambience, oriental landscape painting, no people, no text",
    seed: 2026111504,
  },
];

function buildWorkflow(positivePrompt, negativePrompt, seed, prefix) {
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
        seed: seed,
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
        height: 1024,
        width: 1024,
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

async function queuePrompt(workflow) {
  const res = await fetch(`${COMFY_URL}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Lỗi gửi prompt tới ComfyUI (${res.status}): ${errText}`);
  }
  const data = await res.json();
  return data.prompt_id;
}

async function waitForHistory(promptId, timeoutSec = 180) {
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
    await sleep(1500);
  }
  throw new Error(`Quá thời gian chờ (${timeoutSec}s) cho promptId: ${promptId}`);
}

function calculateSha256(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function main() {
  console.log("=== BẮT ĐẦU CHẠY LÔ ẢNH THÔ PILOT COMFYUI SDXL BASE ===");
  console.log(`Thời gian: ${new Date().toISOString()}`);
  console.log(`Số lượng ảnh cần sinh: ${PILOT_PROMPTS.length}`);

  // 1. Khởi động ComfyUI
  console.log("Đang khởi động ComfyUI qua comfy-up.sh...");
  execFileSync(COMFY_UP, { stdio: "inherit" });

  const results = [];

  try {
    for (let i = 0; i < PILOT_PROMPTS.length; i++) {
      const item = PILOT_PROMPTS[i];
      console.log(`\n[${i + 1}/${PILOT_PROMPTS.length}] Đang sinh ảnh: ${item.id} (${item.theme})`);
      console.log(`Seed: ${item.seed}`);
      console.log(`Prompt: "${item.prompt}"`);

      const workflow = buildWorkflow(item.prompt, NEGATIVE_PROMPT, item.seed, item.id);
      const startTime = Date.now();

      const promptId = await queuePrompt(workflow);
      console.log(`Prompt queued, id: ${promptId}. Chờ KSampler hoàn thành...`);

      const imgInfo = await waitForHistory(promptId, 180);
      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`Sinh thành công sau ${elapsedSec}s. Tệp: ${imgInfo.filename}`);

      const fullPath = path.join(OUTPUT_DIR, imgInfo.subfolder || "", imgInfo.filename);
      if (!fs.existsSync(fullPath)) {
        throw new Error(`Không tìm thấy ảnh tại: ${fullPath}`);
      }

      const rawSha256 = calculateSha256(fullPath);
      const stats = fs.statSync(fullPath);
      const sizeKb = (stats.size / 1024).toFixed(1);

      console.log(`Dung lượng thô: ${sizeKb} KB`);
      console.log(`SHA-256 thô: ${rawSha256}`);

      results.push({
        ...item,
        filename: imgInfo.filename,
        fullPath,
        sizeKb: parseFloat(sizeKb),
        rawSha256,
        elapsedSec: parseFloat(elapsedSec),
      });
    }

    console.log("\n=== TỔNG HỢP KẾT QUẢ SINH ẢNH THÔ ===");
    console.table(
      results.map((r) => ({
        ID: r.id,
        Tệp: r.filename,
        Seed: r.seed,
        "Cỡ (KB)": r.sizeKb,
        "Thời gian (s)": r.elapsedSec,
        "SHA-256 (đầu)": r.rawSha256.substring(0, 16) + "...",
      })),
    );

    return results;
  } finally {
    console.log("\nĐang tắt ComfyUI qua comfy-down.sh...");
    try {
      execFileSync(COMFY_DOWN, { stdio: "inherit" });
      console.log("ComfyUI đã được tắt an toàn.");
    } catch (e) {
      console.error("Lỗi khi tắt ComfyUI:", e);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("LỖI CHẠY LÔ ẢNH THÔ:", err);
    process.exit(1);
  });
}
