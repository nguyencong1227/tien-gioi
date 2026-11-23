// HỢP ĐỒNG manifest.json của bộ chơi thử AI (QUYET_DINH_M3 mục 60.1).
//
// Đây là hợp đồng MÁY ĐỌC giữa bộ chạy (Dev F dựng) và AI-image-coordinator (mục 60.2 — một lượt Claude
// Sonnet đọc manifest + ảnh để chấm). ĐỪNG ĐỔI TÊN TRƯỜNG SAU KHI MERGE: coordinator phụ thuộc chính xác
// vào các khoá này. Thêm trường thì THÊM (optional), đừng đổi tên / đổi kiểu trường cũ.
//
// Cấu trúc thư mục kết quả (--out <dir>):
//   manifest.json            <- tệp này mô tả hợp đồng
//   shots/<step>-<viewport>.jpg   ảnh chụp (JPEG q85 mặc định; --png → PNG)
import { execSync } from "node:child_process";
import { VIEWPORTS } from "../layout-kit";

/** Phiên bản hợp đồng. Khi đổi hợp đồng KHÔNG tương thích ngược, tăng số này để coordinator biết. */
export const MANIFEST_SCHEMA = "tien-gioi/ai-playtest/v1";

/** Các khung màn hình chuẩn lấy từ VIEWPORTS của layout-kit.ts (MỘT nguồn). */
export interface Viewport {
  /** Nhãn ổn định dùng trong `step.viewport` và tên tệp ảnh. */
  id: string;
  width: number;
  height: number;
  /** Giả lập thiết bị cảm ứng (điện thoại) */
  touch: boolean;
}

export const DEFAULT_VIEWPORTS: Viewport[] = VIEWPORTS.map((v) => ({
  id: `${v.w}x${v.h}`,
  width: v.w,
  height: v.h,
  touch: v.touch,
}));

export interface StepViewportSpec {
  viewports: string[];
}

/**
 * Chọn danh sách viewport cho một bước chạy:
 * - Nếu người dùng truyền filter (vd: --viewports 412x915,1366x768): lọc `allViewports` theo `vpFilterIds`.
 *   Nếu toàn bộ ID filter đều lạ (không khớp khung nào): ném lỗi rõ để tránh chạy 0 bước trong im lặng.
 * - Nếu không truyền filter (hoặc mảng filter rỗng): dùng danh sách viewports mặc định của bước (`step.viewports`).
 *   Nếu `step.viewports` không khớp bất kỳ khung nào: ném lỗi rõ để tránh cấu hình sai chạy ngầm.
 */
export function pickViewports(
  step: StepViewportSpec,
  vpFilterIds?: string[],
  allViewports: readonly Viewport[] = DEFAULT_VIEWPORTS,
): Viewport[] {
  if (vpFilterIds && vpFilterIds.length > 0) {
    const filtered = allViewports.filter((v) => vpFilterIds.includes(v.id));
    if (filtered.length === 0) {
      throw new Error(
        `Không tìm thấy khung màn hình nào khớp với --viewports: [${vpFilterIds.join(", ")}]. Khung hợp lệ: [${allViewports.map((v) => v.id).join(", ")}]`,
      );
    }
    return filtered;
  }
  const matched = step.viewports
    .map((id) => allViewports.find((v) => v.id === id))
    .filter((v): v is Viewport => v != null);
  if (matched.length === 0) {
    throw new Error(
      `Bước không khai báo khung màn hình hợp lệ trong step.viewports: [${step.viewports.join(", ")}]. Khung hợp lệ: [${allViewports.map((v) => v.id).join(", ")}]`,
    );
  }
  return matched;
}

/** Loại kết luận tự động (detection) mà bộ chạy gắn cho một bước. */
export type FindingKind = "stall" | "drift" | "stuck" | "closed-fail" | "timeout";

export interface Finding {
  kind: FindingKind;
  /** Mô tả ngắn cho người / AI đọc: số đo, ngưỡng, nhãn bước. */
  detail: string;
}

/** Một mẫu vị trí nhân vật theo thời gian (phát hiện "đứng im khi giữ phím" / "trôi sau khi nhả"). */
export interface PlayerSample {
  /** Milli giây từ lúc bắt đầu bước. */
  t: number;
  x: number;
  y: number;
}

export interface StepMetrics {
  fps: { min: number; avg: number };
  /** Chuỗi mẫu vị trí nhân vật trong bước. */
  player: PlayerSample[];
}

export interface StepResult {
  /** id ngắn ổn định của bước (vd "move-hold"). */
  id: string;
  /** Nhóm kịch bản (vd "enter" / "move" / "dialogs" / "combat" / "travel" / "boss"). */
  scenario: string;
  /** Tiêu đề tiếng Việt mô tả bước. */
  title: string;
  /** Nhãn viewport (thuộc DEFAULT_VIEWPORTS). */
  viewport: string;
  /** Mô tả đầu vào bằng chữ cho người / AI (vd "giữ W 3s rồi nhả"). */
  input: string;
  /** Đường dẫn tương đối (so với --out) tới các ảnh chụp của bước. */
  shots: string[];
  /** Bước có đạt các khẳng định của nó không. */
  ok: boolean;
  metrics: StepMetrics;
  /** Lỗi console / exception ghi trong bước (từ Tab.errors). */
  consoleErrors: string[];
  /** Lỗi mạng (failed fetch / WebSocket close bất thường) ghi trong bước. */
  networkErrors: string[];
  /** Kết luận tự động (drift / stall / ...) nếu phát hiện. */
  findings: Finding[];
}

export interface ServerInfo {
  /** Cổng server thử (không phải 2567). */
  port: number;
  /** Có bật cờ chặn đường (ambush) cho scenario gặp chặn đường không. */
  ambush: boolean;
}

export interface ManifestSummary {
  steps: number;
  failed: number;
  consoleErrors: number;
  findings: number;
}

export interface Manifest {
  schema: string;
  /** commit SHA của main mà server thử được dựng từ. */
  commit: string;
  startedAt: string;
  finishedAt: string;
  server: ServerInfo;
  steps: StepResult[];
  summary: ManifestSummary;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

function isBool(v: unknown): v is boolean {
  return typeof v === "boolean";
}

function reqStr(o: Record<string, unknown>, key: string, where: string): string {
  const v = o[key];
  if (!isStr(v)) throw new Error(`${where}: "${key}" phải là chuỗi`);
  return v;
}

function reqNum(o: Record<string, unknown>, key: string, where: string): number {
  const v = o[key];
  if (!isNum(v)) throw new Error(`${where}: "${key}" phải là số`);
  return v;
}

function reqBool(o: Record<string, unknown>, key: string, where: string): boolean {
  const v = o[key];
  if (!isBool(v)) throw new Error(`${where}: "${key}" phải là boolean`);
  return v;
}

function reqArr(v: unknown, where: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`${where}: phải là mảng`);
  return v;
}

// Kiểm GIÁ TRỊ phần tử mảng trực tiếp (reqStr/reqNum tra `o[key]`, dùng cho object; phần tử mảng là giá trị trần).
function reqStrEl(v: unknown, where: string): string {
  if (!isStr(v)) throw new Error(`${where}: phải là chuỗi`);
  return v;
}

/**
 * Kiểm một manifest đúng hợp đồng và trả về nó đã gắn kiểu. Ném `Error` với thông điệp rõ nếu sai —
 * coordinator bắt lỗi này để biết manifest hỏng (không phải manifest "không có lỗi nào").
 *
 * Kiểm cả CỘT TRÙNG: `summary.steps` === số bước thật, `summary.failed` === số bước `ok:false`,
 * `summary.consoleErrors` === tổng consoleErrors, `summary.findings` === tổng findings. Đếm sai là lỗi
 * hợp đồng (coordinator tin summary).
 */
export function validateManifest(v: unknown): Manifest {
  if (!isObj(v)) throw new Error("manifest: phải là object");

  const schema = reqStr(v, "schema", "manifest");
  if (schema !== MANIFEST_SCHEMA)
    throw new Error(`manifest.schema: kỳ vọng "${MANIFEST_SCHEMA}", nhận "${schema}"`);

  const commit = reqStr(v, "commit", "manifest");
  if (commit.length < 7) throw new Error("manifest.commit: phải là SHA >= 7 ký tự");

  const startedAt = reqStr(v, "startedAt", "manifest");
  const finishedAt = reqStr(v, "finishedAt", "manifest");
  if (Number.isNaN(Date.parse(startedAt)))
    throw new Error("manifest.startedAt: không phải ISO date");
  if (Number.isNaN(Date.parse(finishedAt)))
    throw new Error("manifest.finishedAt: không phải ISO date");

  const serverRaw = v.server;
  if (!isObj(serverRaw)) throw new Error("manifest.server: phải là object");
  const server: ServerInfo = {
    port: reqNum(serverRaw, "port", "manifest.server"),
    ambush: reqBool(serverRaw, "ambush", "manifest.server"),
  };

  const stepsRaw = reqArr(v.steps, "manifest.steps");
  const steps: StepResult[] = stepsRaw.map((s, i) => {
    if (!isObj(s)) throw new Error(`manifest.steps[${i}]: phải là object`);
    const where = `manifest.steps[${i}]`;
    const id = reqStr(s, "id", where);
    const scenario = reqStr(s, "scenario", where);
    const title = reqStr(s, "title", where);
    const viewport = reqStr(s, "viewport", where);
    const input = reqStr(s, "input", where);
    const ok = reqBool(s, "ok", where);
    const shots = reqArr(s.shots, `${where}.shots`).map((p, j) =>
      reqStrEl(p, `${where}.shots[${j}]`),
    );
    const consoleErrors = reqArr(s.consoleErrors, `${where}.consoleErrors`).map((e, j) =>
      reqStrEl(e, `${where}.consoleErrors[${j}]`),
    );
    const networkErrors = reqArr(s.networkErrors, `${where}.networkErrors`).map((e, j) =>
      reqStrEl(e, `${where}.networkErrors[${j}]`),
    );
    const findingsRaw = reqArr(s.findings, `${where}.findings`);
    const findings: Finding[] = findingsRaw.map((f, j) => {
      if (!isObj(f)) throw new Error(`${where}.findings[${j}]: phải là object`);
      const kind = reqStr(f, "kind", `${where}.findings[${j}]`);
      if (
        kind !== "stall" &&
        kind !== "drift" &&
        kind !== "stuck" &&
        kind !== "closed-fail" &&
        kind !== "timeout"
      )
        throw new Error(`${where}.findings[${j}].kind: "${kind}" không phải FindingKind hợp lệ`);
      const detail = reqStr(f, "detail", `${where}.findings[${j}]`);
      return { kind, detail };
    });
    const mRaw = s.metrics;
    if (!isObj(mRaw)) throw new Error(`${where}.metrics: phải là object`);
    const mWhere = `${where}.metrics`;
    const fpsRaw = mRaw.fps;
    if (!isObj(fpsRaw)) throw new Error(`${mWhere}.fps: phải là object`);
    const fps = { min: reqNum(fpsRaw, "min", mWhere), avg: reqNum(fpsRaw, "avg", mWhere) };
    const playerRaw = reqArr(mRaw.player, `${mWhere}.player`);
    const player: PlayerSample[] = playerRaw.map((p, j) => {
      if (!isObj(p)) throw new Error(`${mWhere}.player[${j}]: phải là object`);
      const pw = `${mWhere}.player[${j}]`;
      return {
        t: reqNum(p, "t", pw),
        x: reqNum(p, "x", pw),
        y: reqNum(p, "y", pw),
      };
    });
    return {
      id,
      scenario,
      title,
      viewport,
      input,
      shots,
      ok,
      metrics: { fps, player },
      consoleErrors,
      networkErrors,
      findings,
    };
  });

  const failed = steps.filter((s) => !s.ok).length;
  const consoleErrors = steps.reduce((n, s) => n + s.consoleErrors.length, 0);
  const findings = steps.reduce((n, s) => n + s.findings.length, 0);
  const summaryRaw = v.summary;
  if (!isObj(summaryRaw)) throw new Error("manifest.summary: phải là object");
  const summary: ManifestSummary = {
    steps: reqNum(summaryRaw, "steps", "manifest.summary"),
    failed: reqNum(summaryRaw, "failed", "manifest.summary"),
    consoleErrors: reqNum(summaryRaw, "consoleErrors", "manifest.summary"),
    findings: reqNum(summaryRaw, "findings", "manifest.summary"),
  };
  if (summary.steps !== steps.length)
    throw new Error(`manifest.summary.steps: ${summary.steps} != số bước thật ${steps.length}`);
  if (summary.failed !== failed)
    throw new Error(`manifest.summary.failed: ${summary.failed} != số bước lỗi ${failed}`);
  if (summary.consoleErrors !== consoleErrors)
    throw new Error(
      `manifest.summary.consoleErrors: ${summary.consoleErrors} != tổng consoleErrors ${consoleErrors}`,
    );
  if (summary.findings !== findings)
    throw new Error(`manifest.summary.findings: ${summary.findings} != tổng findings ${findings}`);

  return { schema, commit, startedAt, finishedAt, server, steps, summary };
}

/** SHA ngắn của main hiện tại (dùng cho `manifest.commit`). */
export function currentCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}
