// Chụp số đo Kim Đan "trước M6" vào `kim-dan-truoc.json` (issue #402). Chỉ chạy lại khi mô hình (`simulate.ts`, `dungeon.ts`) đổi
// có chủ ý và cần làm mới mốc so sánh: `npm run can-bang:kim-dan-truoc -w server`. Sau M6 mốc này KHÔNG đổi theo nội dung mới.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BASELINE_IDS, measureKimDan } from "./kim-dan";

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "kim-dan-truoc.json");
const report = measureKimDan(BASELINE_IDS, 20);
writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
console.log(`Đã ghi ${out}`);
