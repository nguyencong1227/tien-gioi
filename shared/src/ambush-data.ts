// Dữ liệu GẶP CHẶN ĐƯỜNG (QUYET_DINH_M3 mục 52, docs/THIET_KE_CHAN_DUONG.md mục 8, issue CD1 #1061): khung + luật kiểm. Nội dung do E / G nhập (CD4 #1064, CD5 #1065), số cân bằng
// do D chốt (CD6 #1066). Tệp này KHÔNG chứa nội dung thật (hai mảng rỗng) để D / E / G thêm vào mà không xung đột với hợp đồng.
//
// Nguyên tắc nội dung (AGENTS.md "Asset" nguồn 3): văn mẫu lấy NGUYÊN VĂN từ Vạn Kiếp Tu Tiên (`~/TT/van-kiep-tu-tien-clone`, `content-ClG6Ha-i.json`, KHÔNG `content-zh-*.json`),
// chỉ đoạn tình huống mở đầu; các biến của nguồn thay bằng địa danh / đối tượng của Tiên Giới; không chữ Hán; không nhân vật / tông phái / quốc gia của nguồn.
// Mỗi cảnh một dòng ở `docs/NGUON_NOI_DUNG.md` mục 3 (+ `CREDITS.md` nếu cần) và trường `source` ở đây ghi đường dẫn mục nguồn.
import { MONSTER_BY_ID } from "./game";
import { MAPS } from "./map";
import { realmOfStep } from "./realms";
import { bossDefOf } from "./bosses";
import {
  AMBUSH_FOE_COUNT_MAX,
  AMBUSH_FOE_LEVEL_CAP,
  AMBUSH_TIERS,
  isAmbushTier,
  type AmbushTier,
} from "./ambush";

/** Biến văn mẫu CHO PHÉP (server điền lúc dựng hộp thoại): `{dia_danh}` = tên vùng hoang của bản đồ, `{ke_dich}` = tên kẻ chặn đường. Biến khác là lỗi dữ liệu. */
export const AMBUSH_SCENE_VARS = ["dia_danh", "ke_dich"] as const;
export type AmbushSceneVar = (typeof AMBUSH_SCENE_VARS)[number];

/** Một cảnh chặn đường (văn mẫu). */
export interface AmbushScene {
  /** id ổn định: chữ thường, số, gạch dưới. */
  id: string;
  /** Đoạn tình huống, có thể chứa `{dia_danh}` / `{ke_dich}`. */
  text: string;
  /** Bản đồ (id trong `MAPS`) cảnh này hợp. */
  mapIds: readonly string[];
  /** Mức kẻ địch cảnh này hợp. */
  tiers: readonly AmbushTier[];
  /** Đường dẫn mục nguồn (vd `hoang_da/rung_ram.yaml#ev.hd_rung_cay_thanh_tinh`), để đối chiếu `NGUON_NOI_DUNG.md`. */
  source: string;
}

/** Một bầy kẻ chặn đường. */
export interface AmbushFoeGroup {
  id: string;
  /** Tên hiện ở hộp thoại (vd "Đạo Tặc Đầu Lĩnh"). */
  name: string;
  mapId: string;
  /** Khoảng bậc cảnh giới người chơi (thang `realms.ts`, gồm cả hai đầu) mà bầy này xuất hiện. */
  minStep: number;
  maxStep: number;
  tier: AmbushTier;
  /** Loài + số lượng; tổng số con <= `AMBUSH_FOE_COUNT_MAX`. Mức `leader`: con ĐẦU là kẻ cầm đầu (đúng 1 con, có `BossDef`). */
  foes: readonly { kind: string; count: number }[];
}

/**
 * Văn mẫu thật (CD4 #1064 — E nhập; CD5 #1065 — G nhập bản đồ còn lại). Nguồn: `~/TT/van-kiep-tu-tien-clone`
 * (`site/assets/content-ClG6Ha-i.json`, bản vi), chỉ `text` mở đầu của mục có hiệu ứng `combat`; biến nguồn thay bằng
 * `{dia_danh}` (wildName bản đồ) / nội dung Tiên Giới; không chữ Hán; mỗi cảnh một dòng ở `docs/NGUON_NOI_DUNG.md` mục 3.
 * `tiers` = mức khó cảnh này hợp (normal/elite/leader); kẻ địch thật do `AMBUSH_FOES` định (CD5).
 */
export const AMBUSH_SCENES: readonly AmbushScene[] = [
  // === LẠC HÀ (Vân Mộng Sơn): rừng, sông, núi thấp — Luyện Khí / Trúc Cơ ===
  {
    id: "lac_ha_thuy_tac_chan_song",
    text: 'Lau sậy ven sông Vân Mộng che một chiếc thuyền mui đen, mũi thuyền buộc dây thừng có móc sắt. Gã đầu lĩnh thủy tặc đứng mũi, ném túi bạc lên xuống trong tay: "Hàng để lại, người qua sông thì xuống nước."',
    mapIds: ["lac_ha"],
    tiers: ["normal"],
    source: "/content/encounters/treo_thuong/bat_cuop.yaml#ev.tt_bat_cuop_thuy_tac",
  },
  {
    id: "lac_ha_son_tac_chan_dao",
    text: 'Một sợi thừng gai chăng ngang lối đèo, chùm chuông đồng treo giữa kêu leng keng. Tên sơn tặc ngồi trên tảng đá chặn đầu, rìu gác vai: "Mãi lộ năm mươi linh thạch. Không có thì để lại thứ gì nặng tay."',
    mapIds: ["lac_ha"],
    tiers: ["normal"],
    source: "/content/encounters/ke_dich_nguoi.yaml#ev.kdn_son_tac_chan_deo",
  },
  {
    id: "lac_ha_bay_soi_phai_ai",
    text: "Cách ải nửa ngày đường, khắp sườn Vân Mộng vương xác ngựa trạm, dấu chân sói chồng lên nhau. Sói đầu ngẩng lên tru dài, hai con Hôi Lang vòng ra sau lưng ngươi.",
    mapIds: ["lac_ha"],
    tiers: ["normal"],
    source: "/content/encounters/treo_thuong/tru_yeu.yaml#ev.tt_tru_yeu_lang_bay",
  },
  {
    id: "lac_ha_yeu_chan_deo",
    text: "Lối đèo Vân Mộng rải đầy xương la ngựa, xe hàng đổ nghiêng còn nguyên bao gạo. Con yêu nằm trên mỏm đá chắn giữa đèo, đuôi quét qua quét lại, mắt sáng rọi xuống lối đi.",
    mapIds: ["lac_ha"],
    tiers: ["normal"],
    source: "/content/encounters/treo_thuong/tru_yeu.yaml#ev.tt_tru_yeu_deo_nui",
  },
  {
    id: "lac_ha_rung_thuoc_co_yeu",
    text: 'Gùi thuốc treo trên cành, dây đeo đứt một bên. Người hái thuốc nấp trên cây gọi khẽ: "Nó còn quanh đây, ta nghe tiếng nó thở." Dưới gốc, đất bị cào lên từng rãnh sâu.',
    mapIds: ["lac_ha"],
    tiers: ["normal"],
    source: "/content/encounters/treo_thuong/tru_yeu.yaml#ev.tt_tru_yeu_hai_thuoc",
  },
  {
    id: "lac_ha_huyen_quy_giu_bai",
    text: "Khu đá giữa rừng Vân Mộng hiện ra trong sương, không một ngọn cỏ. Trên bãi, một con rùa đá mai to bằng sân đình nằm chắn lối, đuôi quấn quanh tảng đá, mắt khép hờ.",
    mapIds: ["lac_ha"],
    tiers: ["elite"],
    source: "/content/encounters/than_thu.yaml#ev.than_thu_vu_huyen_quy",
  },
  {
    id: "lac_ha_xa_yeu_doi_le",
    text: "Miếu hoang giữa rừng Vân Mộng để mâm lễ còn tươi: gà luộc, rượu nếp, một đôi giày trẻ con. Dưới tượng thần, vảy yêu lấp lánh, đuôi rắn từ từ quấn lấy lối ra.",
    mapIds: ["lac_ha"],
    tiers: ["elite"],
    source: "/content/encounters/treo_thuong/tru_yeu.yaml#ev.tt_tru_yeu_xa_mieu",
  },
  {
    id: "lac_ha_ta_vat_rung_ua",
    text: "Giữa trưa mà rừng Vân Mộng lạnh như đêm đông, chim chóc bỏ đi hết. Từ bụi cỏ úa vang lên tiếng khóc, khi gần khi xa. Tà vật hiện ra khi ngươi bước thêm một bước.",
    mapIds: ["lac_ha"],
    tiers: ["elite"],
    source: "/content/encounters/treo_thuong/ta_dao.yaml#ev.tt_ta_vat",
  },
  {
    id: "lac_ha_ma_tu_luyen_vac",
    text: "Ở rìa rừng Vân Mộng, bảy cái vạc đá xếp thành vòng, nước trong vạc đỏ sẫm và vẫn còn ấm. Ma tu ngồi giữa vòng, mỗi hơi thở lại kéo một sợi máu từ vạc vào mũi.",
    mapIds: ["lac_ha"],
    tiers: ["elite"],
    source: "/content/encounters/treo_thuong/ta_dao.yaml#ev.tt_ma_tu",
  },
  // === HẮC PHONG (Hắc Phong Cốc): hẻm núi, ải băng, bãi tha ma — Trúc Cơ / Kim Đan ===
  {
    id: "hac_phong_ai_bang_thu_phi",
    text: 'Tường băng chắn ngang đèo Hắc Phong, trên tường cắm giáo thay cờ. Tên thủ ải chìa tay: "Qua ải nộp hai mươi linh thạch. Không có thì ở lại giữ tường một đêm, đêm nay bầy sói tới."',
    mapIds: ["hac_phong"],
    tiers: ["normal"],
    source: "/content/encounters/hoang_da/hoang_nguyen.yaml#ev.hd_bang_ai_bang_thu_phi",
  },
  {
    id: "hac_phong_luu_khau_chan_ai",
    text: 'Toán lưu khấu đóng trại ngoài bãi tha ma giữa Hắc Phong Cốc, đòi ba xe hàng trước khi cho qua. Gã đầu lĩnh run tay rót trà: "Nộp rồi thì cả đoàn chết đói trên đường về."',
    mapIds: ["hac_phong"],
    tiers: ["normal"],
    source: "/content/encounters/ke_dich_nguoi.yaml#ev.kdn_luu_khau_vao_lang",
  },
  {
    id: "hac_phong_bang_truy_na",
    text: "Bảng truy nã ở cổng Hắc Phong vẽ một gương mặt giống ngươi bảy phần, dưới ghi tên kẻ bị truy nã. Chưa đi hết dốc, thợ săn đã chặn trước mặt, câu liêm sắt kéo lê trên đá.",
    mapIds: ["hac_phong"],
    tiers: ["normal"],
    source: "/content/encounters/ke_dich_nguoi.yaml#ev.kdn_bang_truy_na",
  },
  {
    id: "hac_phong_trai_chu_son_trai",
    text: 'Sơn trại trên mỏm đá Hắc Phong Cốc, cổng gỗ treo một hàng sọ trâu. Trại chủ ngồi trên ghế bọc da hổ, cười khẩy khi thấy ngươi đi một mình: "Đường này qua lại phải nộp mạng, hoặc nộp tiền."',
    mapIds: ["hac_phong"],
    tiers: ["elite"],
    source: "/content/encounters/treo_thuong/truy_na.yaml#ev.tt_truy_na_trai_chu",
  },
  {
    id: "hac_phong_giao_canh_mo",
    text: "Giữa vùng nước đen dưới đáy Hắc Phong Cốc, một con giao thủ mộ trồi lên chắn đường. Nó nói tiếng người, giọng cũ như đá: dưới này là mộ, kẻ sống không được qua.",
    mapIds: ["hac_phong"],
    tiers: ["elite"],
    source: "/content/encounters/than_thu.yaml#ev.than_thu_long_giao_canh",
  },
  {
    id: "hac_phong_ma_tu_huyet_tri",
    text: 'Ma tu của một tông phái tà ác giải một xe lồng chật người phàm đi tế huyết trì. Thấy ma khí trên người ngươi, hắn cười, mở cửa lồng: "Đồng đạo cứ chọn một đứa, coi như quà gặp mặt."',
    mapIds: ["hac_phong"],
    tiers: ["elite"],
    source: "/content/encounters/ta_tu.yaml#ev.ta_tu_long_tu",
  },
  {
    id: "hac_phong_thi_tu_dao_mo",
    text: "Bãi mộ lính tuần biên ở Hắc Phong Cốc bị bới tung, bia đá đổ rạp. Thi tu rung chuông đồng, hai cái xác mặc giáp đứng dậy đi theo hắn, tay cầm binh khí rỉ sét.",
    mapIds: ["hac_phong"],
    tiers: ["elite"],
    source: "/content/encounters/treo_thuong/ta_dao.yaml#ev.tt_thi_tu_dao_mo",
  },
  {
    id: "hac_phong_yeu_thu_lang_thang",
    text: "Tiếng gầm vang lên giữa Hắc Phong Cốc. Một con yêu thú lao ra từ lau sậy, mắt đỏ ngầu, hơi thở bốc khói giữa không trung.",
    mapIds: ["hac_phong"],
    tiers: ["elite"],
    source: "/content/encounters/giao_chien.yaml#ev.yeu_thu_lang_thang",
  },
  {
    id: "hac_phong_yeu_vuong_xuan_ba",
    text: "Cả Hắc Phong Cốc không còn một con thú nhỏ: chúng đã bị ăn, hoặc đã chạy. Yêu vương nằm trên đỉnh gò, quanh nó chất túi trữ vật rách của những tu sĩ tới trước ngươi.",
    mapIds: ["hac_phong"],
    tiers: ["leader"],
    source: "/content/encounters/treo_thuong/truy_na.yaml#ev.tt_truy_na_yeu_vuong",
  },
  // === ÂM SƯƠNG (Âm Sương Trạch): đầm lầy, sương tanh, hồ nước lạnh, âm khí — Kim Đan / Nguyên Anh ===
  {
    id: "am_suong_xa_quat_dam_lay",
    text: "Đầm lầy Âm Sương Trạch sủi bọt, mùi tanh nồng tới nhức đầu. Dưới gốc cây đổ có một lỗ hang trơn nhẫy vảy rắn lột, sâu không thấy đáy. Con đại xà đen cuộn trong đó mở mắt, đuôi quật nước tanh vào mặt ngươi.",
    mapIds: ["am_suong"],
    tiers: ["normal"],
    source: "/content/encounters/hang.yaml#ev.hang_xa_quat",
  },
  {
    id: "am_suong_gioi_am_o_vach",
    text: "Đêm nào vách cuối Âm Sương Trạch cũng có tiếng gõ ba tiếng, đều như tay người. Sáng ra, rêu quanh khe đá đóng một lớp sương trắng, sờ vào lạnh buốt. Đêm nay, bàn tay từ trong khe đã thò ra ngoài.",
    mapIds: ["am_suong"],
    tiers: ["normal"],
    source: "/content/encounters/noi_chon.yaml#ev.dp_am_khi_vach_sau",
  },
  {
    id: "am_suong_suong_tanh_tren_ho",
    text: "Sương trên mặt hồ Âm Sương Trạch dày lên, tanh mùi bùn. Nước dưới chân ngươi rút đi một khoảng rồi dâng ngược: con thủy quái đang bò lên bờ, thẳng về phía ngươi.",
    mapIds: ["am_suong"],
    tiers: ["normal"],
    source: "/content/encounters/bien_co/be_quan.yaml#ev.bq_ho_suong_tanh",
  },
  {
    id: "am_suong_van_thi_giu_dam",
    text: "Yêu thú ở Âm Sương Trạch đã chết từ lâu mà vẫn đi lại. Hang ổ của chúng bốc mùi xác, cửa hang phủ một lớp sương xám không bay. Từng bước chân nặng nề dẫm lên xương cốt, hướng thẳng về phía linh khí đang tới.",
    mapIds: ["am_suong"],
    tiers: ["elite"],
    source: "/content/encounters/hang.yaml#ev.van_thi_quat",
  },
  {
    id: "am_suong_am_khi_phai_ac",
    text: "Trời chưa tối mà Âm Sương Trạch đã lạnh buốt. Giữa đống xương cốt người xưa, một bóng tà vật lững thững đi lại, như vẫn canh giữ chốn này. Nó quay đầu, hốc mắt tối om nhìn thẳng vào người ngươi.",
    mapIds: ["am_suong"],
    tiers: ["elite"],
    source: "/content/encounters/noi_chon.yaml#ev.phe_tich_am_khi",
  },
  {
    id: "am_suong_ban_tay_duoi_ho",
    text: "Nửa đêm có tiếng khóc rấm rứt dưới mặt hồ Âm Sương Trạch. Một bàn tay trắng bệch nắm lấy cổ chân ngươi, lạnh như đá: vong hồn bị linh khí hút tới, muốn kéo người sống xuống làm bạn.",
    mapIds: ["am_suong"],
    tiers: ["elite"],
    source: "/content/encounters/bien_co/be_quan.yaml#ev.bq_ho_thuy_quy",
  },
  {
    id: "am_suong_xac_nguoi_trong_bang",
    text: "Tảng băng sau lưng ngươi nứt một tiếng. Bên trong có người chết cóng từ thuở nào, mắt vẫn mở. Linh khí ngươi tỏa ra đã đánh thức nó: xác ướp đang cựa mình phá băng, tay với về phía ngươi.",
    mapIds: ["am_suong"],
    tiers: ["elite"],
    source: "/content/encounters/bien_co/be_quan.yaml#ev.bq_bang_xac_trong_bang",
  },
  {
    id: "am_suong_ho_giao_co_giu",
    text: "Quanh hồ Âm Sương Trạch cắm sáu lá cờ đen, nước lạnh dần từ đáy lên. Một toán thợ săn chờ giao long dưới hồ thức dậy để giết lấy gân, thiếu một người giữ mắt trận. Thấy ngươi, gã đầu lĩnh mỉm cười: vào giúp rồi đừng muốn ra.",
    mapIds: ["am_suong"],
    tiers: ["leader"],
    source: "/content/encounters/hoang_da/ho_nuoc.yaml#ev.hd_ho_giao_thuc_day",
  },
  {
    id: "am_suong_sao_huyet_yeu_vuong",
    text: "Tận cùng Âm Sương Trạch là hang ổ của yêu vương. Miệng hang đen ngòm, xương trắng rải tới tận lối xuống. Nó nằm giữa đống hài cốt, vảy sẫm ánh hàn quang, chờ kẻ dám bước vào đòi lại lãnh địa.",
    mapIds: ["am_suong"],
    tiers: ["leader"],
    source: "/content/encounters/noi_chon.yaml#ev.diet_sao_huyet",
  },
  // === HÀN VÂN (Hàn Vân Lĩnh): băng nguyên, bão tuyết, khe núi, đại yêu — Kim Đan / Nguyên Anh ===
  {
    id: "han_van_bao_tuyet_tim_hoi",
    text: "Giữa băng nguyên Hàn Vân Lĩnh, ngươi vận công nóng như đống lửa. Tuyết quanh tan thành vũng, và một con bạch hổ tuyết lần theo hơi ấm ấy tới, lông trắng lẫn vào bão tuyết, vuốt đã giương.",
    mapIds: ["han_van"],
    tiers: ["normal"],
    source: "/content/encounters/bien_co/be_quan.yaml#ev.bq_bang_tim_hoi_am",
  },
  {
    id: "han_van_hang_tru_bao_tuyet",
    text: "Bão tuyết trên Hàn Vân Lĩnh nổi, trắng xóa không thấy đường. Ngươi chui vào một hang đá thì đụng phải lớp lông ấm: một con thú ngủ đông vừa mở mắt, hơi thở lạnh phả vào mặt.",
    mapIds: ["han_van"],
    tiers: ["normal"],
    source: "/content/encounters/bien_co/duong.yaml#ev.dc_hang_tru_bao_tuyet",
  },
  {
    id: "han_van_thu_giu_bao",
    text: "Đêm qua sấm khô không mưa, sáng ra vách đá trên Hàn Vân Lĩnh nứt toác, hơi lạnh buốt tràn ra. Trong khe là một ổ thú: con quái nằm cuộn quanh món bảo vật, lông dựng như kim, sẵn sàng lao tới.",
    mapIds: ["han_van"],
    tiers: ["normal"],
    source: "/content/encounters/bien_co/di_tuong.yaml#ev.bc_dt_o_thu_giu_bao",
  },
  {
    id: "han_van_thu_pha_linh_dien",
    text: "Luống linh điền sau vách Hàn Vân Lĩnh bị cày lật, rễ cây vương khắp lối. Dưới gốc cây đang chín, một con thú dữ gặm dở, mõm dính đầy đất, ngẩng lên nhìn ngươi bằng đôi mắt đỏ.",
    mapIds: ["han_van"],
    tiers: ["normal"],
    source: "/content/encounters/noi_chon.yaml#ev.dp_thu_pha_linh_dien",
  },
  {
    id: "han_van_khe_nui_hu_goi_bay",
    text: "Tuyết trên Hàn Vân Lĩnh giẫm nát thành đường mòn, dẫn vào một khe núi. Gió thổi ra từ trong khe mang theo mùi thịt đông và tiếng hú gọi bầy. Bầy sói trắng lần lượt bước ra từ sau tảng băng.",
    mapIds: ["han_van"],
    tiers: ["elite"],
    source: "/content/encounters/hang.yaml#ev.hang_lang_oa",
  },
  {
    id: "han_van_hang_co_chu",
    text: "Cái hang ngươi ghé vào trú chân trên Hàn Vân Lĩnh khô ráo, kín gió, sâu trong có ổ xương. Chưa kịp yên chỗ, chủ của nó đã về: một con cự thú chắn kín cửa hang, gầm vang vách đá, hơi thở đóng băng không khí.",
    mapIds: ["han_van"],
    tiers: ["elite"],
    source: "/content/encounters/bien_co/be_quan.yaml#ev.bq_son_chu_hang",
  },
  {
    id: "han_van_bay_yeu_vien_dan",
    text: "Ngươi dừng chân giữa Hàn Vân Lĩnh thì quanh người đã kín mắt xanh mắt đỏ. Bầy yêu nhỏ bị linh khí kéo tới, còn con đầu đàn đứng sau cùng, chờ chúng cắn trước khi nó ra tay.",
    mapIds: ["han_van"],
    tiers: ["elite"],
    source: "/content/encounters/bien_co/be_quan.yaml#ev.bq_yv_bay_nho",
  },
  {
    id: "han_van_dai_yeu_thuc_giac",
    text: "Vách núi Hàn Vân Lĩnh thở, mỗi nhịp dài bằng mười lần ngươi hít vào. Khe đá hé ra, trong bóng tối hiện một con mắt. Đại yêu nằm sau vách bao năm không ai biết vừa thức, đang tự hỏi ngươi là gì.",
    mapIds: ["han_van"],
    tiers: ["leader"],
    source: "/content/encounters/hoang_da/son_mach.yaml#ev.hd_son_dai_yeu_thuc_giac",
  },
  {
    id: "han_van_lanh_tho_co_chu",
    text: "Quanh Hàn Vân Lĩnh không một tiếng chim, thú nhỏ cũng tuyệt tích. Dấu vết của một con rất lớn in khắp nơi, mùi tanh còn mới: nơi này có chủ. Xương thú chất thành đống trước cửa động tối om, hơi thở nặng nề phả ra từ trong đó.",
    mapIds: ["han_van"],
    tiers: ["leader"],
    source: "/content/encounters/hoang_da/chu_o.yaml#ev.chu_o_lanh_tho",
  },
];
/**
 * Bảng kẻ chặn đường thật (CD5b #1065; A nhập vì D / E / G chưa kịp, chọn từ THỰC ĐƠN do `server/src/balance/chan-duong.ts` đo: người chơi đúng bậc `minStep` mặc đồ tốt nhất chỉ đánh thường, thắng
 * >= 90% (thường) / 80% (tinh anh) / 60% (cầm đầu); thiết kế `docs/THIET_KE_CHAN_DUONG.md` mục 9). Mọi bầy đều YẾU hơn trần cấp `AMBUSH_FOE_LEVEL_CAP` (bị hạ = chết thật, mục 53) và khoảng `minStep..maxStep`
 * hẹp (`payRewards` chưa giảm tu vi theo chênh bậc). Tinh anh Kim Đan / Nguyên Anh dùng loài cấp THẤP (`lang`, `ho`) vì loài cùng cấp tinh anh không đạt 80% ở bậc nào (Thạch Quy tinh anh đạt từ bậc 16 nhưng một trận ~99 giây thật, sát hạn 120 giây: bỏ); kẻ cầm đầu là Xích Mãng (`mang`, trùm
 * duy nhất đạt 60% một mình, từ bậc 11). Lạc Hà chưa có cảnh cầm đầu nên chưa có bầy cầm đầu. CHỌN LOÀI THEO CẢNH: văn mẫu (bản đồ, mức) chọn theo `mapIds` + `tiers`, không ghép theo loài nên đôi chỗ loài
 * không khớp chữ trong cảnh (B nhắc ở review #1240): D / E tinh chỉnh ghép loài - cảnh sau, miễn qua `ambushViolations` + `chan-duong.test.ts`.
 */
export const AMBUSH_FOES: readonly AmbushFoeGroup[] = [
  // === LẠC HÀ (Vân Mộng Sơn): Phàm Nhân / Luyện Khí / đầu Trúc Cơ ===
  {
    id: "lac_ha_soi_le",
    name: "Sói Hoang Lẻ",
    mapId: "lac_ha",
    minStep: 0,
    maxStep: 2,
    tier: "normal",
    foes: [{ kind: "lang", count: 1 }],
  },
  {
    id: "lac_ha_soi_bay",
    name: "Bầy Sói Hoang",
    mapId: "lac_ha",
    minStep: 1,
    maxStep: 3,
    tier: "normal",
    foes: [{ kind: "lang", count: 2 }],
  },
  {
    id: "lac_ha_soi_dan",
    name: "Đàn Sói Đói",
    mapId: "lac_ha",
    minStep: 3,
    maxStep: 6,
    tier: "normal",
    foes: [{ kind: "lang", count: 3 }],
  },
  {
    id: "lac_ha_ho_le",
    name: "Hắc Hổ Lang Thang",
    mapId: "lac_ha",
    minStep: 5,
    maxStep: 7,
    tier: "normal",
    foes: [{ kind: "ho", count: 1 }],
  },
  {
    id: "lac_ha_ho_doi",
    name: "Đôi Hắc Hổ",
    mapId: "lac_ha",
    minStep: 8,
    maxStep: 11,
    tier: "normal",
    foes: [{ kind: "ho", count: 2 }],
  },
  {
    id: "lac_ha_soi_tinh_anh",
    name: "Sói Đầu Đàn",
    mapId: "lac_ha",
    minStep: 4,
    maxStep: 6,
    tier: "elite",
    foes: [{ kind: "lang", count: 1 }],
  },
  {
    id: "lac_ha_soi_tinh_anh_doi",
    name: "Đôi Sói Đầu Đàn",
    mapId: "lac_ha",
    minStep: 8,
    maxStep: 11,
    tier: "elite",
    foes: [{ kind: "lang", count: 2 }],
  },
  // === HẮC PHONG (Hắc Phong Cốc): Trúc Cơ / Kim Đan ===
  {
    id: "hac_phong_ho_doi",
    name: "Đôi Hắc Hổ Đói",
    mapId: "hac_phong",
    minStep: 10,
    maxStep: 12,
    tier: "normal",
    foes: [{ kind: "ho", count: 2 }],
  },
  {
    id: "hac_phong_ho_ba",
    name: "Ba Hắc Hổ Săn Mồi",
    mapId: "hac_phong",
    minStep: 11,
    maxStep: 12,
    tier: "normal",
    foes: [{ kind: "ho", count: 3 }],
  },
  {
    id: "hac_phong_quy_chan",
    name: "Thạch Quy Chắn Lối",
    mapId: "hac_phong",
    minStep: 13,
    maxStep: 15,
    tier: "normal",
    foes: [{ kind: "thach_quy", count: 1 }],
  },
  {
    id: "hac_phong_ho_tinh_anh",
    name: "Hắc Hổ Chúa",
    mapId: "hac_phong",
    minStep: 11,
    maxStep: 12,
    tier: "elite",
    foes: [{ kind: "ho", count: 1 }],
  },
  {
    id: "hac_phong_ho_tinh_anh_doi",
    name: "Đôi Hắc Hổ Chúa",
    mapId: "hac_phong",
    minStep: 14,
    maxStep: 15,
    tier: "elite",
    foes: [{ kind: "ho", count: 2 }],
  },
  {
    id: "hac_phong_yeu_vuong",
    name: "Xích Mãng Yêu Vương",
    mapId: "hac_phong",
    minStep: 11,
    maxStep: 12,
    tier: "leader",
    foes: [{ kind: "mang", count: 1 }],
  },
  // === ÂM SƯƠNG (Âm Sương Trạch): Kim Đan / Nguyên Anh ===
  {
    id: "am_suong_ho_suong",
    name: "Sương Hồ Lẻ Bầy",
    mapId: "am_suong",
    minStep: 13,
    maxStep: 15,
    tier: "normal",
    foes: [{ kind: "suong_ho", count: 1 }],
  },
  {
    id: "am_suong_quy_doi",
    name: "Đôi Thạch Quy Đầm Lầy",
    mapId: "am_suong",
    minStep: 13,
    maxStep: 15,
    tier: "normal",
    foes: [{ kind: "thach_quy", count: 2 }],
  },
  {
    id: "am_suong_thiem_doc",
    name: "Độc Thiềm Đầm Lầy",
    mapId: "am_suong",
    minStep: 15,
    maxStep: 18,
    tier: "normal",
    foes: [{ kind: "doc_thiem", count: 1 }],
  },
  {
    id: "am_suong_ho_tinh_anh",
    name: "Đôi Hắc Hổ Lạc Đàn",
    mapId: "am_suong",
    minStep: 14,
    maxStep: 17,
    tier: "elite",
    foes: [{ kind: "ho", count: 2 }],
  },
  {
    id: "am_suong_yeu_vuong",
    name: "Xích Mãng Hồ Sâu",
    mapId: "am_suong",
    minStep: 13,
    maxStep: 15,
    tier: "leader",
    foes: [{ kind: "mang", count: 1 }],
  },
  // === HÀN VÂN (Hàn Vân Lĩnh): Nguyên Anh ===
  {
    id: "han_van_lang_le",
    name: "Hàn Lang Lẻ Bầy",
    mapId: "han_van",
    minStep: 16,
    maxStep: 18,
    tier: "normal",
    foes: [{ kind: "han_lang", count: 1 }],
  },
  {
    id: "han_van_lang_doi",
    name: "Đôi Hàn Lang",
    mapId: "han_van",
    minStep: 18,
    maxStep: 18,
    tier: "normal",
    foes: [{ kind: "han_lang", count: 2 }],
  },
  {
    id: "han_van_tuong_xuong",
    name: "Cốt Tượng Băng Giá",
    mapId: "han_van",
    minStep: 17,
    maxStep: 18,
    tier: "normal",
    foes: [{ kind: "cot_tuong", count: 1 }],
  },
  {
    id: "han_van_nha_gio",
    name: "Phong Nha Bão Tuyết",
    mapId: "han_van",
    minStep: 16,
    maxStep: 18,
    tier: "normal",
    foes: [{ kind: "phong_nha", count: 1 }],
  },
  {
    id: "han_van_soi_tuyet",
    name: "Bầy Sói Trắng",
    mapId: "han_van",
    minStep: 16,
    maxStep: 18,
    tier: "elite",
    foes: [{ kind: "lang", count: 3 }],
  },
  {
    id: "han_van_yeu_vuong",
    name: "Xích Mãng Băng Nguyên",
    mapId: "han_van",
    minStep: 16,
    maxStep: 18,
    tier: "leader",
    foes: [{ kind: "mang", count: 1 }],
  },
];

const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
/**
 * Chặn đường chỉ kích hoạt khi người chơi ĐI BỘ thật (`systems/ambush.ts`; đứng yên / dịch chuyển không tính), nên văn mẫu không được viết như người chơi đang NGỒI / vừa thiền
 * ("thẳng về chỗ ngươi ngồi", "ngươi mở mắt", "quanh chỗ ngồi"): nhiều cảnh lấy từ sự kiện BẾ QUAN của nguồn nên dễ lọt (B bắt 3 cảnh ở review #1240). Chỉ bắt dạng nói về NGƯƠI / chỗ ngồi
 * của ngươi; kẻ địch "ngồi" / "mở mắt" (ngôi thứ ba) vẫn hợp lệ.
 */
const SITTING_RE = /(?:ngươi|chỗ)\s+(?:ngồi|mở mắt|nhập định|đả tọa|bế quan)|chỗ ngồi/iu;
const ID_RE = /^[a-z][a-z0-9_]{0,47}$/;
const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const MAP_IDS: ReadonlySet<string> = new Set(MAPS.map((m) => m.id));

/** Điền `{dia_danh}` / `{ke_dich}` vào văn mẫu. Biến lạ giữ nguyên chữ (`ambushViolations` bắt ở dữ liệu); thuần. */
export function ambushFillScene(
  text: string,
  vars: Readonly<Record<AmbushSceneVar, string>>,
): string {
  return text.replace(/\{([a-z_]+)\}/g, (all, name: string) =>
    (AMBUSH_SCENE_VARS as readonly string[]).includes(name) ? vars[name as AmbushSceneVar] : all,
  );
}

/**
 * Luật kiểm dữ liệu (D / E / G dùng; test của `shared/` gọi với `AMBUSH_SCENES` / `AMBUSH_FOES`). Trả danh sách lỗi (rỗng = hợp lệ).
 * Cảnh: id đúng dạng + duy nhất; `text` 20-600 ký tự, không chữ Hán, chỉ biến cho phép; `mapIds` / `tiers` không rỗng và hợp lệ; `source` không rỗng.
 * Bầy: id đúng dạng + duy nhất; tên 2-40 ký tự không chữ Hán; bản đồ thật; `minStep` <= `maxStep` đều trên thang; mức hợp lệ; số con 1..`AMBUSH_FOE_COUNT_MAX`,
 * loài có thật, `count` nguyên >= 1; mức `leader` có con đầu là đúng 1 con và có `BossDef`.
 */
export function ambushViolations(
  scenes: readonly AmbushScene[] = AMBUSH_SCENES,
  foes: readonly AmbushFoeGroup[] = AMBUSH_FOES,
): string[] {
  const bad: string[] = [];
  const sceneIds = new Set<string>();
  for (const s of scenes) {
    const at = `cảnh ${String(s.id)}`;
    if (typeof s.id !== "string" || !ID_RE.test(s.id)) bad.push(`${at}: id sai dạng`);
    else if (sceneIds.has(s.id)) bad.push(`${at}: trùng id`);
    else sceneIds.add(s.id);
    if (typeof s.text !== "string" || s.text.length < 20 || s.text.length > 600)
      bad.push(`${at}: text phải 20-600 ký tự`);
    else {
      if (CJK_RE.test(s.text)) bad.push(`${at}: text có chữ Hán / chữ lạ`);
      if (SITTING_RE.test(s.text))
        bad.push(
          `${at}: text viết như người chơi đang NGỒI / vừa thiền (chặn đường chỉ kích hoạt khi ĐI BỘ): đổi sang "đi tới / dừng chân / ghé vào"`,
        );
      for (const m of s.text.matchAll(/\{([^}]*)\}/g))
        if (!(AMBUSH_SCENE_VARS as readonly string[]).includes(m[1]))
          bad.push(`${at}: biến {${m[1]}} không được phép`);
      if (/[{}]/.test(s.text.replace(/\{[a-z_]+\}/g, ""))) bad.push(`${at}: ngoặc nhọn thừa`);
    }
    if (!Array.isArray(s.mapIds) || s.mapIds.length === 0) bad.push(`${at}: mapIds rỗng`);
    else
      for (const m of s.mapIds)
        if (!MAP_IDS.has(m)) bad.push(`${at}: bản đồ ${String(m)} không có`);
    if (!Array.isArray(s.tiers) || s.tiers.length === 0) bad.push(`${at}: tiers rỗng`);
    else
      for (const t of s.tiers)
        if (!isAmbushTier(t)) bad.push(`${at}: mức ${String(t)} không hợp lệ`);
    if (typeof s.source !== "string" || s.source.trim() === "") bad.push(`${at}: thiếu source`);
  }
  const foeIds = new Set<string>();
  for (const g of foes) {
    const at = `bầy ${String(g.id)}`;
    if (typeof g.id !== "string" || !ID_RE.test(g.id)) bad.push(`${at}: id sai dạng`);
    else if (foeIds.has(g.id)) bad.push(`${at}: trùng id`);
    else foeIds.add(g.id);
    if (typeof g.name !== "string" || g.name.length < 2 || g.name.length > 40)
      bad.push(`${at}: tên phải 2-40 ký tự`);
    else if (CJK_RE.test(g.name)) bad.push(`${at}: tên có chữ Hán / chữ lạ`);
    if (!MAP_IDS.has(g.mapId)) bad.push(`${at}: bản đồ ${String(g.mapId)} không có`);
    if (realmOfStep(g.minStep) === null || realmOfStep(g.maxStep) === null || g.minStep > g.maxStep)
      bad.push(`${at}: khoảng bậc ${String(g.minStep)}..${String(g.maxStep)} không hợp lệ`);
    if (!isAmbushTier(g.tier)) bad.push(`${at}: mức ${String(g.tier)} không hợp lệ`);
    if (!Array.isArray(g.foes) || g.foes.length === 0) {
      bad.push(`${at}: không có kẻ địch`);
      continue;
    }
    let total = 0;
    // Mục 53: kẻ chặn đường KHÔNG mạnh vượt cảnh giới của người chơi (bị hạ = chết thật): cấp loài <= trần của cảnh giới tối thiểu của bầy
    const minRealm = realmOfStep(g.minStep)?.realm;
    const levelCap = minRealm === undefined ? undefined : AMBUSH_FOE_LEVEL_CAP[minRealm];
    for (const f of g.foes) {
      if (typeof f.kind !== "string" || !hasOwn(MONSTER_BY_ID, f.kind))
        bad.push(`${at}: loài ${String(f.kind)} không có`);
      else if (minRealm !== undefined) {
        if (levelCap === undefined)
          bad.push(
            `${at}: cảnh giới ${minRealm} chưa có trần cấp kẻ chặn đường (AMBUSH_FOE_LEVEL_CAP)`,
          );
        else if (MONSTER_BY_ID[f.kind]!.level > levelCap)
          bad.push(
            `${at}: ${f.kind} cấp ${MONSTER_BY_ID[f.kind]!.level} vượt trần ${levelCap} của cảnh giới ${minRealm} (không được mạnh vượt cảnh giới người chơi)`,
          );
      }
      if (!Number.isInteger(f.count) || f.count < 1)
        bad.push(`${at}: count ${String(f.count)} sai`);
      else total += f.count;
    }
    if (total > AMBUSH_FOE_COUNT_MAX)
      bad.push(`${at}: ${total} con vượt trần ${AMBUSH_FOE_COUNT_MAX}`);
    if (g.tier === "leader") {
      const head = g.foes[0];
      if (head.count !== 1) bad.push(`${at}: kẻ cầm đầu phải đúng 1 con`);
      if (bossDefOf(head.kind) === undefined)
        bad.push(`${at}: kẻ cầm đầu ${head.kind} chưa có BossDef`);
    }
  }
  return bad;
}

/**
 * Độ PHỦ (CD10 nghiệm thu, KHÔNG bắt buộc ở từng PR dữ liệu): mỗi (bản đồ, mức) cần >= 1 cảnh và >= 1 bầy, nếu không hộp thoại có nơi không dựng được.
 * Trả danh sách chỗ thiếu (rỗng = đủ).
 */
export function ambushCoverageViolations(
  scenes: readonly AmbushScene[] = AMBUSH_SCENES,
  foes: readonly AmbushFoeGroup[] = AMBUSH_FOES,
  mapIds: readonly string[] = MAPS.map((m) => m.id),
): string[] {
  const bad: string[] = [];
  for (const m of mapIds)
    for (const t of AMBUSH_TIERS) {
      if (!scenes.some((s) => s.mapIds.includes(m) && s.tiers.includes(t)))
        bad.push(`${m} / ${t}: thiếu cảnh`);
      if (!foes.some((g) => g.mapId === m && g.tier === t)) bad.push(`${m} / ${t}: thiếu bầy`);
    }
  return bad;
}
