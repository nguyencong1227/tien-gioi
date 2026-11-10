// Kiểm thử hợp đồng store cho bản cài đặt File* (M3 bước 3f, Issue #176).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll } from "vitest";
import {
  describeAccountStoreContract,
  describePlayerStoreContract,
  describeSectStoreContract,
  describeSessionStoreContract,
  describeSoulStoreContract,
} from "./store-contract";

// Thư mục dữ liệu tạm cho FilePlayerStore, FileSoulStore, FileAccountStore, FileSessionStore
const testDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-store-contract-"));
const oldDataDir = process.env.DATA_DIR;
process.env.DATA_DIR = testDir;

// Nạp động các store sau khi đã cấu hình DATA_DIR
const { FilePlayerStore } = await import("./player-store");
const { FileSoulStore } = await import("./soul");
const { FileSectStore } = await import("./sect-store");
const { FileAccountStore, FileSessionStore } = await import("./account-store");

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
  if (oldDataDir === undefined) {
    delete process.env.DATA_DIR;
  } else {
    process.env.DATA_DIR = oldDataDir;
  }
});

// Chạy bộ test hợp đồng trên các bản cài đặt File*
describePlayerStoreContract("FilePlayerStore", () => new FilePlayerStore());

let soulStoreCounter = 0;
describeSoulStoreContract(
  "FileSoulStore",
  () =>
    new FileSoulStore(
      path.join(testDir, `soul-store-${++soulStoreCounter}`),
      () => "2026-11-10T00:00:00.000Z",
    ),
);

let sectStoreCounter = 0;
describeSectStoreContract(
  "FileSectStore",
  () => new FileSectStore(path.join(testDir, `sect-store-${++sectStoreCounter}`)),
);

let accountStoreCounter = 0;
describeAccountStoreContract(
  "FileAccountStore",
  () => new FileAccountStore(path.join(testDir, `account-store-${++accountStoreCounter}`)),
);

let sessionStoreCounter = 0;
describeSessionStoreContract(
  "FileSessionStore",
  () => new FileSessionStore(path.join(testDir, `session-store-${++sessionStoreCounter}`)),
);
