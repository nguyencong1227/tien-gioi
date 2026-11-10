/** Cổng server lúc dev, lấy từ PORT trong .env.local ở gốc repo (vite.config.ts). */
declare const __SERVER_PORT__: string;

declare module "*check-credits.mjs" {
  export function scanFiles(dir: string): string[];
  export function matchExactToken(content: string, token: string): boolean;
  export function isAssetCredited(filePath: string, creditsContent: string): boolean;
  export function auditAssets(
    creditsPath?: string,
    targetDirs?: string[],
  ): { scanned: string[]; missing: string[] };
}
