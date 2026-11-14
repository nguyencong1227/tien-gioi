/** Cổng server lúc dev, lấy từ PORT trong .env.local ở gốc repo (vite.config.ts). */
declare const __SERVER_PORT__: string;

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
