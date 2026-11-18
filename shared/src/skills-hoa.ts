// Dữ liệu chiêu thức nhóm Hỏa + vô sắc (CT8 #1053, Dev G) (mục 51, docs/PHAN_CONG_CHIEU_THUC.md mục 8). Tệp riêng theo nhóm hệ để PR của D / E / G không xung đột; `skills.ts` gom vào `LEARNABLE_SKILLS`.
// CÁCH THÊM CHIÊU (mỗi PR 5-8 chiêu): thêm `SkillDef` vào mảng dưới; tên + mô tả NGUYÊN VĂN từ `~/TT/van-kiep-tu-tien-clone` (`content-ClG6Ha-i.json`, KHÔNG `content-zh-*.json`),
// số chỉnh theo bảng chuyển nguồn (mục 8); thêm MỖI chiêu một dòng ở `docs/NGUON_NOI_DUNG.md` mục 3 (cột `inRepo` ghi "`shared/src/skills-hoa.ts` id `<id>`") hoặc, nếu là chiêu GỐC, vào
// `ORIGINAL_SKILL_IDS` ở `client/src/credits.test.ts`; chạy `npm run can-bang -w server` và TOÀN BỘ `npm test`. `skillViolations` (`skill-violations.ts`) kiểm dữ liệu; kinh quyển dựng tự động từ đây.
// Dùng `skillEffect(status, SỐ_LƯỢT, ratio, chance)` từ `./skill-kit` cho hiệu ứng (không chép `TURN_MS`). Chỉ nhập KIỂU từ `./skills` (không nhập giá trị: tránh vòng import).
import type { SkillDef } from "./skills";

import { skillEffect } from "./skill-kit";

// CT8 lát 1 (A tự làm vì D / G chưa có PR; Hỏa, 2 chiêu: Luyện Khí Hoàng phẩm + Kim Đan Huyền phẩm). Số theo bảng chuyển nguồn (mục 8): `uy x 2 -> mult`, `hoi -> cooldown 3000 + 2000 x hoi`, `phi -> mpPct`,
// `pham_cap 2 -> grade 0 (Hoàng), 3-4 -> grade 1 (Huyền)`, hiệu ứng nguồn `turns x 1500 ms`. Tên chiêu = `chieu.ten`, tên quyển = `item.ten`; mô tả NGUYÊN VĂN (không có tên riêng của Vạn Kiếp). Số là số KHỞI ĐIỂM, chốt bằng `skillViolations` + `skills-dps.test.ts`.
export const SKILLS_HOA: readonly SkillDef[] = [
  {
    id: "liet_diem_chuong",
    name: "Liệt Diễm Chưởng",
    bookName: "Liệt Diễm Chưởng",
    desc: "Dồn linh khí vào lòng bàn tay mà đánh ra, chưởng phong nóng rát. Luyện càng sâu, chưởng càng nặng.",
    element: "hoa",
    shape: "cone",
    cooldown: 3000,
    mpPct: 0.06,
    range: 85,
    arc: Math.PI * 0.5,
    mult: 1.9,
    effects: [],
    reqRealm: 1,
    reqTier: 0,
    rarity: 0,
    price: 70,
    fx: "slash_fire",
    style: "chuong",
    grade: 0,
  },
  {
    id: "xich_tuoc_phu",
    name: "Xích Tước Phù",
    bookName: "Xích Tước Phù Lục",
    desc: "Phù sư vẽ phù bằng đầu ngón tay ngay giữa không trung, nét chu sa vừa khép thì hóa chim lửa lao vào địch. Lửa bén sang cả kẻ đứng cạnh.",
    element: "hoa",
    shape: "cone",
    cooldown: 5000,
    mpPct: 0.1,
    range: 120,
    arc: Math.PI * 0.9,
    mult: 1.2,
    effects: [skillEffect("burn", 3, 0.25, 0.7)],
    reqRealm: 3,
    reqTier: 0,
    rarity: 2,
    price: 400,
    fx: "slash_fire",
    style: "phu",
    grade: 1,
  },
];
