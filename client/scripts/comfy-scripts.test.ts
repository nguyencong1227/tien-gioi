import { describe, expect, it } from "vitest";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectGpu, getChromeGpuFlags } from "./chrome-gpu.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const comfyUpScript = path.join(repoRoot, "scripts/art/comfy-up.sh");
const comfyDownScript = path.join(repoRoot, "scripts/art/comfy-down.sh");
const comfyIdleScript = path.join(repoRoot, "scripts/art/comfy-idle-watch.sh");

describe("Dây chuyền đồ họa nháp ComfyUI + SDXL (Mục 16.2 & 17.3 QUYET_DINH_M3, G1 #486)", () => {
  const tmpTestDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-comfy-test-"));
  const tmpLockPath = path.join(tmpTestDir, "tg-comfy.lock");

  // Stub nvidia-smi cô lập: mặc định in rỗng để không bị ảnh hưởng khi dev khác đang chạy e2e dùng GPU
  const stubNvidiaDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-stub-nvidia-"));
  const stubNvidiaBin = path.join(stubNvidiaDir, "nvidia-smi");
  fs.writeFileSync(
    stubNvidiaBin,
    `#!/bin/sh
if [ "\${TEST_STUB_CHROME:-0}" = "1" ]; then
  echo "99999, /opt/google/chrome/chrome"
  exit 0
fi
exit 0
`,
    { mode: 0o755 },
  );
  // Stub systemctl / systemd-run cô lập: test KHÔNG BAO GIỜ được chạm đơn vị tg-comfy THẬT. Trước đây test comfy-down.sh
  // dùng PATH thật nên `systemctl --user stop tg-comfy` tắt ComfyUI đang sinh ảnh của dev khác (lô 2, 17/11 12:54).
  // Mặc định is-active trả "inactive"; TEST_STUB_COMFY_ACTIVE=1 giả lập đơn vị đang chạy. Mọi lệnh gọi ghi vào systemctlLog.
  const systemctlLog = path.join(stubNvidiaDir, "systemctl.log");
  fs.writeFileSync(
    path.join(stubNvidiaDir, "systemctl"),
    `#!/bin/sh
echo "systemctl $*" >> "${systemctlLog}"
if [ "$2" = "is-active" ]; then
  if [ "\${TEST_STUB_COMFY_ACTIVE:-0}" = "1" ]; then echo active; exit 0; fi
  echo inactive
  exit 3
fi
exit 0
`,
    { mode: 0o755 },
  );
  fs.writeFileSync(
    path.join(stubNvidiaDir, "systemd-run"),
    `#!/bin/sh
echo "systemd-run $*" >> "${systemctlLog}"
exit 1
`,
    { mode: 0o755 },
  );
  const isolatedPath = `${stubNvidiaDir}:${process.env.PATH}`;
  // Môi trường cô lập cho MỌI lần gọi comfy-up.sh / comfy-down.sh: PATH có stub, khoá và PID canh rảnh nằm trong thư mục tạm
  // (comfy-down.sh xoá khoá ở $XDG_RUNTIME_DIR và giết PID canh rảnh: không được đụng bản thật của dev đang sinh ảnh).
  const isoEnv = {
    PATH: isolatedPath,
    XDG_RUNTIME_DIR: tmpTestDir,
    COMFY_IDLE_PID_FILE: path.join(tmpTestDir, "tg-comfy-idle.pid"),
  };

  it("các script quản lý vòng đời ComfyUI tồn tại và có quyền thực thi", () => {
    expect(fs.existsSync(comfyUpScript)).toBe(true);
    expect(fs.existsSync(comfyDownScript)).toBe(true);
    expect(fs.existsSync(comfyIdleScript)).toBe(true);

    const modeUp = fs.statSync(comfyUpScript).mode;
    const modeDown = fs.statSync(comfyDownScript).mode;
    const modeIdle = fs.statSync(comfyIdleScript).mode;

    // Kiểm tra quyền thực thi (user executable)
    expect(modeUp & 0o111).toBeTruthy();
    expect(modeDown & 0o111).toBeTruthy();
    expect(modeIdle & 0o111).toBeTruthy();
  });

  it("comfy-up.sh: chạy kiểm tra điều kiện thành công với cờ --dry-run (cô lập với GPU)", () => {
    const stdout = execFileSync(comfyUpScript, ["--dry-run"], {
      encoding: "utf-8",
      cwd: repoRoot,
      env: {
        ...process.env,
        ...isoEnv,
        COMFY_DIR: tmpTestDir,
        COMFY_LOCK_FILE: tmpLockPath,
      },
    });
    expect(stdout).toContain("Kiểm tra điều kiện khởi động ComfyUI thành công (chế độ --dry-run)");
  });

  it("comfy-up.sh: từ chối khởi động khi đĩa trống dưới ngưỡng tối thiểu (10 GB)", () => {
    let failed = false;
    let errorOutput = "";
    try {
      execFileSync(comfyUpScript, ["--dry-run"], {
        encoding: "utf-8",
        cwd: repoRoot,
        env: {
          ...process.env,
          ...isoEnv,
          COMFY_DIR: tmpTestDir,
          COMFY_LOCK_FILE: tmpLockPath,
          TEST_MIN_FREE_KB: "999999999999", // Giả lập ngưỡng yêu cầu 1000 TB
        },
      });
    } catch (err: any) {
      failed = true;
      errorOutput = (err.stderr || "") + (err.stdout || "");
    }
    expect(failed).toBe(true);
    expect(errorOutput).toMatch(/LỖI: Ổ gốc \(\/\) còn ít hơn 10 GB trống/);
  });

  it("comfy-up.sh: từ chối khởi động khi Chrome đang chạy test sử dụng GPU (qua biến TEST_GPU_BUSY)", () => {
    let failed = false;
    let errorOutput = "";
    try {
      execFileSync(comfyUpScript, ["--dry-run"], {
        encoding: "utf-8",
        cwd: repoRoot,
        env: {
          ...process.env,
          ...isoEnv,
          COMFY_DIR: tmpTestDir,
          COMFY_LOCK_FILE: tmpLockPath,
          TEST_GPU_BUSY: "1",
        },
      });
    } catch (err: any) {
      failed = true;
      errorOutput = (err.stderr || "") + (err.stdout || "");
    }
    expect(failed).toBe(true);
    expect(errorOutput).toMatch(/Phát hiện bài test Chrome đang sử dụng GPU/);
  });

  it("comfy-up.sh: từ chối khởi động khi nvidia-smi phát hiện Chrome headless đang chiếm GPU (test đột biến với stub nvidia-smi)", () => {
    let failed = false;
    let errorOutput = "";
    try {
      execFileSync(comfyUpScript, ["--dry-run"], {
        encoding: "utf-8",
        cwd: repoRoot,
        env: {
          ...process.env,
          ...isoEnv,
          COMFY_DIR: tmpTestDir,
          COMFY_LOCK_FILE: tmpLockPath,
          TEST_STUB_CHROME: "1", // Stub nvidia-smi in ra tiến trình Chrome
        },
      });
    } catch (err: any) {
      failed = true;
      errorOutput = (err.stderr || "") + (err.stdout || "");
    }
    expect(failed).toBe(true);
    expect(errorOutput).toMatch(/LỖI: Chrome headless đang chiếm tài nguyên tính toán GPU/);
    expect(errorOutput).toContain("99999, /opt/google/chrome/chrome");
  });

  it("comfy-up.sh: bỏ qua kiểm tra GPU khi có cờ TEST_SKIP_GPU_PROBE=1 kể cả khi Chrome bận", () => {
    const stdout = execFileSync(comfyUpScript, ["--dry-run"], {
      encoding: "utf-8",
      cwd: repoRoot,
      env: {
        ...process.env,
        ...isoEnv,
        COMFY_DIR: tmpTestDir,
        COMFY_LOCK_FILE: tmpLockPath,
        TEST_STUB_CHROME: "1",
        TEST_SKIP_GPU_PROBE: "1", // Bỏ qua kiểm tra GPU
      },
    });
    expect(stdout).toContain("Kiểm tra điều kiện khởi động ComfyUI thành công (chế độ --dry-run)");
  });

  it("comfy-down.sh: dọn dẹp file lock và thoát an toàn", () => {
    fs.writeFileSync(tmpLockPath, "test-lock\n");
    expect(fs.existsSync(tmpLockPath)).toBe(true);

    const stdout = execFileSync(comfyDownScript, [], {
      encoding: "utf-8",
      cwd: repoRoot,
      env: {
        ...process.env,
        ...isoEnv,
        COMFY_DIR: tmpTestDir,
        COMFY_LOCK_FILE: tmpLockPath,
      },
    });
    expect(stdout).toContain("Đã tắt dây chuyền ComfyUI và giải phóng tài nguyên");
    expect(fs.existsSync(tmpLockPath)).toBe(false);
  });

  it("comfy-down.sh trong test chỉ gọi systemctl GIẢ (không tắt tg-comfy thật của dev đang sinh ảnh)", () => {
    fs.rmSync(systemctlLog, { force: true });
    execFileSync(comfyDownScript, [], {
      encoding: "utf-8",
      cwd: repoRoot,
      env: {
        ...process.env,
        ...isoEnv,
        COMFY_DIR: tmpTestDir,
        COMFY_LOCK_FILE: tmpLockPath,
        TEST_STUB_COMFY_ACTIVE: "1",
      },
    });
    // Lệnh dừng phải tới stub (đọc được trong log của stub), tức không tới systemctl thật
    expect(fs.readFileSync(systemctlLog, "utf-8")).toContain("systemctl --user stop tg-comfy");
  });

  it("comfy-down.sh: KHÔNG giết các tiến trình khác chứa chuỗi ComfyUI/main.py trên dòng lệnh", () => {
    // Khởi động một tiến trình giả lập có chuỗi "ComfyUI/main.py" trên dòng lệnh (Review PR #499)
    const dummy = spawn("bash", ["-c", 'exec -a "test ComfyUI/main.py" sleep 60'], {
      stdio: "ignore",
    });
    const dummyPid = dummy.pid!;
    expect(dummyPid).toBeGreaterThan(0);

    try {
      execFileSync(comfyDownScript, [], {
        encoding: "utf-8",
        cwd: repoRoot,
        env: {
          ...process.env,
          ...isoEnv,
          COMFY_DIR: tmpTestDir,
          COMFY_LOCK_FILE: tmpLockPath,
        },
      });

      // Tiến trình giả lập vẫn phải còn sống (không bị pkill -f giết nhầm)
      let isAlive = false;
      try {
        process.kill(dummyPid, 0);
        isAlive = true;
      } catch {
        isAlive = false;
      }
      expect(isAlive).toBe(true);
    } finally {
      try {
        dummy.kill();
      } catch {
        // bỏ qua
      }
    }
  });

  it("comfy-up.sh: trap tự động dọn sạch tệp khóa khi xảy ra lỗi khởi động giữa chừng", () => {
    const errorLockPath = path.join(tmpTestDir, "tg-comfy-error.lock");
    const nonExistentDir = path.join(tmpTestDir, "missing-dir");
    let failed = false;
    try {
      execFileSync(comfyUpScript, [], {
        encoding: "utf-8",
        cwd: repoRoot,
        env: {
          ...process.env,
          ...isoEnv,
          COMFY_DIR: nonExistentDir,
          COMFY_LOCK_FILE: errorLockPath,
          TEST_MIN_FREE_KB: "100",
        },
        stdio: "pipe",
      });
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    // Tệp khóa phải được trap dọn dẹp sạch sẽ, không để lại khóa mồ côi
    expect(fs.existsSync(errorLockPath)).toBe(false);
  });

  it("tích hợp chrome-gpu: detectGpu tự động nhường GPU khi có khóa và tg-comfy active", () => {
    const origEnv = { ...process.env };
    const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-stub-comfy-"));
    const tmpLock = path.join(stubDir, "tg-comfy.lock");
    const stubBin = path.join(stubDir, "systemctl");
    fs.writeFileSync(
      stubBin,
      `#!/bin/sh
if [ "$1" = "--user" ] && [ "$2" = "is-active" ] && [ "$3" = "tg-comfy" ]; then
  echo "active"
  exit 0
fi
exit 3
`,
      { mode: 0o755 },
    );

    try {
      delete process.env.DISABLE_GPU;
      delete process.env.CI;
      process.env.FORCE_GPU = "1";
      process.env.COMFY_LOCK_FILE = tmpLock;
      process.env.PATH = `${stubDir}:${process.env.PATH}`;

      fs.writeFileSync(tmpLock, "2026-11-14T18:30:00Z\n");
      const gpu = detectGpu();
      expect(gpu.hasGpu).toBe(false);
      expect(gpu.reason).toBe("comfy_running");
      expect(getChromeGpuFlags()).toEqual(["--disable-gpu"]);
    } finally {
      process.env = origEnv;
      fs.rmSync(stubDir, { recursive: true, force: true });
    }
  });

  it("gen-raw-lo1.mjs: đọc MAP_CARD_BATCH từ prompt-rules.mjs, cỡ 1216x832, SDXL base, không LoRA", async () => {
    const lo1Script = path.join(repoRoot, "scripts", "art", "gen-raw-lo1.mjs");
    expect(fs.existsSync(lo1Script)).toBe(true);
    const src = fs.readFileSync(lo1Script, "utf-8");
    expect(src).toContain("MAP_CARD_BATCH");
    expect(src).toContain("NEGATIVE_PROMPT");
    expect(src).toContain("../../client/scripts/art/prompt-rules.mjs");
    expect(src).toContain('"http://127.0.0.1:8188"');
    expect(src).toContain('"sd_xl_base_1.0.safetensors"');
    expect(src).not.toMatch(/LoraLoader/i);

    const mod = await import("../../scripts/art/gen-raw-lo1.mjs");
    const wf = mod.buildWorkflow("pos", "neg", 20260401, "the_lac_ha_raw_1");
    expect(wf[4].inputs.ckpt_name).toBe("sd_xl_base_1.0.safetensors");
    expect(wf[5].inputs.width).toBe(1216);
    expect(wf[5].inputs.height).toBe(832);
    expect(wf[3].inputs.sampler_name).toBe("euler");
    expect(wf[3].inputs.scheduler).toBe("normal");
    expect(wf[3].inputs.steps).toBe(25);
    expect(wf[3].inputs.cfg).toBe(7);
    expect(wf[3].inputs.denoise).toBe(1);
    expect(wf[3].inputs.seed).toBe(20260401);
    expect(wf[9].inputs.filename_prefix).toBe("the_lac_ha_raw_1");
  });

  it("gen-raw-batch.mjs: hỗ trợ cả lô 1 (MAP_CARD_BATCH 1216x832) và lô 2 (BOSS_CARD_BATCH 1024x1024), SDXL base, không LoRA", async () => {
    const batchScript = path.join(repoRoot, "scripts", "art", "gen-raw-batch.mjs");
    expect(fs.existsSync(batchScript)).toBe(true);
    const src = fs.readFileSync(batchScript, "utf-8");
    expect(src).toContain("MAP_CARD_BATCH");
    expect(src).toContain("BOSS_CARD_BATCH");
    expect(src).toContain("NEGATIVE_PROMPT");
    expect(src).toContain('"sd_xl_base_1.0.safetensors"');
    expect(src).not.toMatch(/LoraLoader/i);

    const mod = await import("../../scripts/art/gen-raw-batch.mjs");
    expect(mod.BATCH_MAP.map.raw).toEqual({ w: 1216, h: 832 });
    expect(mod.BATCH_MAP.lo1).toBe(mod.BATCH_MAP.map);
    expect(mod.BATCH_MAP.boss.raw).toEqual({ w: 1024, h: 1024 });
    expect(mod.BATCH_MAP.lo2).toBe(mod.BATCH_MAP.boss);
    expect(mod.BATCH_MAP.boss.items).toHaveLength(4);
    for (const item of mod.BATCH_MAP.boss.items) {
      expect(item.seeds).toHaveLength(4);
    }

    const wfBoss = mod.buildWorkflow(
      mod.BATCH_MAP.boss.items[0].prompt,
      "neg",
      2026111801,
      "the_xich_mang_raw_1",
      mod.BATCH_MAP.boss.raw.w,
      mod.BATCH_MAP.boss.raw.h,
    );
    expect(wfBoss[4].inputs.ckpt_name).toBe("sd_xl_base_1.0.safetensors");
    expect(wfBoss[5].inputs.width).toBe(1024);
    expect(wfBoss[5].inputs.height).toBe(1024);
    expect(wfBoss[3].inputs.sampler_name).toBe("euler");
    expect(wfBoss[3].inputs.scheduler).toBe("normal");
    expect(wfBoss[3].inputs.steps).toBe(25);
    expect(wfBoss[3].inputs.cfg).toBe(7);
    expect(wfBoss[3].inputs.denoise).toBe(1);
    expect(wfBoss[9].inputs.filename_prefix).toBe("the_xich_mang_raw_1");
  });
});
