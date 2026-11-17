// Dữ liệu chiêu thức nhóm Phong / Lôi / Băng / Âm (CT8 #1053, Dev G; CT9 #1054) (mục 51, docs/PHAN_CONG_CHIEU_THUC.md mục 8). Tệp riêng theo nhóm hệ để PR của D / E / G không xung đột; `skills.ts` gom vào `LEARNABLE_SKILLS`.
// CÁCH THÊM CHIÊU (mỗi PR 5-8 chiêu): thêm `SkillDef` vào mảng dưới; tên + mô tả NGUYÊN VĂN từ `~/TT/van-kiep-tu-tien-clone` (`content-ClG6Ha-i.json`, KHÔNG `content-zh-*.json`),
// số chỉnh theo bảng chuyển nguồn (mục 8); thêm MỖI chiêu một dòng ở `docs/NGUON_NOI_DUNG.md` mục 3 (cột `inRepo` ghi "`shared/src/skills-khac.ts` id `<id>`") hoặc, nếu là chiêu GỐC, vào
// `ORIGINAL_SKILL_IDS` ở `client/src/credits.test.ts`; chạy `npm run can-bang -w server` và TOÀN BỘ `npm test`. `skillViolations` (`skill-violations.ts`) kiểm dữ liệu; kinh quyển dựng tự động từ đây.
// Dùng `skillEffect(status, SỐ_LƯỢT, ratio, chance)` từ `./skill-kit` cho hiệu ứng (không chép `TURN_MS`). Chỉ nhập KIỂU từ `./skills` (không nhập giá trị: tránh vòng import).
import type { SkillDef } from "./skills";

export const SKILLS_KHAC: readonly SkillDef[] = [];
