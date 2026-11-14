/** Cổng server lúc dev, lấy từ PORT trong .env.local ở gốc repo (vite.config.ts). */
declare const __SERVER_PORT__: string;
/** Số phiên bản của bản dựng (package.json gốc), vite `define`; hiện ở Cài đặt */
declare const __APP_VERSION__: string;

interface Window {
  /** Chế độ giả lập Hoàng Tuyền (`?debug`, `window.__debugLimbo`): các lựa chọn đầu thai đã gửi, để script kiểm đọc (`engrave` vắng = giữ nguyên chiêu đã khắc) */
  __rebirthChoices?: import("@tien-gioi/shared").RebirthChoice[];
}

declare module "*check-credits.mjs" {
  export const CONTENT_SOURCE_FILE: string;
  export const CJK_REGEX: RegExp;
  export const VALID_CONTENT_TYPES: Set<string>;
  export const VALID_IMAGE_CJK_APPROVALS: Set<string>;

  export interface ContentSourceEntry {
    type: string;
    source: string;
    inRepo: string;
    date: string;
    pr: string;
    cjkChecked: string;
    notes: string;
    lineNum: number;
  }

  export function scanFiles(dir: string, baseDir?: string): string[];
  export function matchExactToken(content: string, token: string): boolean;
  export function isAssetCredited(filePath: string, creditsContent: string): boolean;
  export function isUnderVktt(filePath: string): boolean;
  export function normalizePublicPath(p: string): string;

  export function auditAssets(
    creditsPath?: string,
    targetDirs?: string[],
  ): { scanned: string[]; missing: string[] };

  export function sha256File(file: string): string;

  export function auditHashes(
    creditsPath?: string,
    hashDirs?: string[],
  ): { hashed: string[]; wrongHash: string[] };

  export function parseContentSourceTable(contentSourcePath?: string): ContentSourceEntry[];

  export function checkImageFileCjk(fullPath: string): { hasCjk: boolean; match?: string };

  // Ảnh do AI sinh (M7.12 #513, docs/KE_HOACH_DO_HOA_AI.md mục 9.4)
  export const AI_ASSET_DIR: string;
  export const AI_SOURCE_DIR: string;
  export const AI_ALLOWED_EXT: Set<string>;
  export const AI_CREDITS_HEADING_RE: RegExp;
  export const SDXL_BASE_SHA256: Set<string>;
  export const PNG_FORBIDDEN_CHUNKS: Set<string>;
  export const WEBP_FORBIDDEN_CHUNKS: Set<string>;
  export function pngChunks(buf: Uint8Array): string[];
  export function webpChunks(buf: Uint8Array): string[];
  export function auditImageMetadata(
    buf: Uint8Array,
    ext: string,
  ): { chunks: string[]; forbidden: string[]; error: string | null };
  export function validateAiSource(j: unknown): string[];
  export interface AiAuditError {
    kind: string;
    file: string;
    detail: string;
  }
  export function auditAiImages(opts?: {
    aiDir?: string;
    sourceDir?: string;
    creditsPath?: string;
    rootDir?: string;
  }): { files: string[]; sources: string[]; errors: AiAuditError[] };

  export function auditContentSources(
    contentSourcePath?: string,
    creditsPath?: string,
    rootDir?: string,
  ): {
    entries: ContentSourceEntry[];
    missingInCredits: string[];
    missingFiles: string[];
    notInVkttDir: string[];
    missingCjkCheck: string[];
    cjkDetectedInFile: Array<{ file: string; char?: string }>;
    unrecordedVkttFiles: string[];
    unrecordedCreditsVktt: string[];
  };
}
