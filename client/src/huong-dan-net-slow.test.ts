// Câu về chip "Mạng chậm" trong docs/HUONG_DAN_NGUOI_CHOI.md khớp mã client (#1421): ngưỡng báo và hai dòng chữ hiển thị đọc từ `net-slow.ts`, không viết cứng trong test.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NET_BACK_TEXT, NET_LOST_TEXT, SLOW_AFTER_MS } from "./net-slow";

const here = dirname(fileURLToPath(import.meta.url));
const doc = readFileSync(resolve(here, "../../docs/HUONG_DAN_NGUOI_CHOI.md"), "utf8");

describe("HUONG_DAN_NGUOI_CHOI.md: chip Mạng chậm khớp client (#1421)", () => {
  it("nêu đúng ngưỡng báo, dòng chữ của dải và câu báo nối lại", () => {
    expect(doc, "ngưỡng SLOW_AFTER_MS").toContain(`quá **${SLOW_AFTER_MS / 1000} giây**`);
    expect(doc, "NET_LOST_TEXT").toContain(`"${NET_LOST_TEXT}"`);
    expect(doc, "NET_BACK_TEXT").toContain(`"${NET_BACK_TEXT}"`);
  });
});
