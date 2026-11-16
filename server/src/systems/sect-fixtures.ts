// Dữ liệu CỐ ĐỊNH cho test tông môn (M8.4 / M8.5): bảng nhiệm vụ và cửa hàng THẬT do E / D thay dần (M8.7), nên test của máy chủ không được cứng id của bảng thật. Mỗi tệp test gọi
// `installSectQuestFixture()` / `installSectShopFixture()` ở `beforeAll` và gọi hàm trả về ở `afterAll`: bảng được THAY TẠI CHỖ (cùng đối tượng / mảng mà `sectQuestSlots`,
// `sectQuestFor`, `sectShopLock`, `parseSectShopBuy`... đọc), nên mọi hàm của `shared/` thấy đúng bảng cố định. Bảng mẫu = bản khung M8.1 (3 mẫu, độ khó 1 / 2 / 3, bản bậc 0 và 1; 3 món).
import {
  SECT_QUESTS,
  SECT_QUEST_BY_ID,
  SECT_QUEST_GIVER,
  SECT_QUEST_TEMPLATE_BY_ID,
  SECT_SHOP,
  SECT_SHOP_BY_ITEM,
  sectQuestId,
  type QuestDef,
  type SectQuestTemplate,
  type SectQuestTier,
  type SectShopEntry,
} from "@tien-gioi/shared";

const QUEST_FIXTURE: readonly SectQuestTemplate[] = [
  {
    id: "st_tru_lang",
    title: "Trừ sói quanh trấn",
    desc: "Hạ Hôi Lang quanh trấn để đường núi yên ổn.",
    difficulty: 1,
    byTier: {
      0: { steps: [{ kind: "kill", monster: "lang", count: 10 }], rewards: { exp: 40 } },
      1: { steps: [{ kind: "kill", monster: "lang", count: 20 }], rewards: { exp: 80 } },
    },
    talk: {
      offer: ["Đệ tử ngoại môn được giao dọn bầy Hôi Lang quanh trấn."],
      progress: ["Hôi Lang còn quấy nhiễu, chưa đủ số."],
      complete: ["Đường núi đã yên, tông môn ghi công cho ngươi."],
    },
  },
  {
    id: "st_nop_nanh",
    title: "Nộp nanh sói cho đan phòng",
    desc: "Nộp nanh sói cho đan phòng của tông môn.",
    difficulty: 2,
    byTier: {
      0: { steps: [{ kind: "collect", itemId: "nanh_soi", count: 8 }], rewards: { exp: 60 } },
      1: { steps: [{ kind: "collect", itemId: "nanh_soi", count: 16 }], rewards: { exp: 120 } },
    },
    talk: {
      offer: ["Đan phòng cần nanh sói còn tươi."],
      progress: ["Chưa đủ nanh sói cho đan phòng."],
      complete: ["Nanh còn tươi, đan phòng nhận."],
    },
  },
  {
    id: "st_tru_ho",
    title: "Trừ hổ dữ",
    desc: "Hạ Hắc Hổ ở bìa rừng.",
    difficulty: 3,
    byTier: {
      0: {
        steps: [{ kind: "kill", monster: "ho", count: 3 }],
        rewards: { exp: 120, items: [{ itemId: "hoi_huyet_dan", qty: 2 }] },
      },
      1: {
        steps: [{ kind: "kill", monster: "ho", count: 6 }],
        rewards: { exp: 240, items: [{ itemId: "hoi_huyet_dan", qty: 3 }] },
      },
    },
    talk: {
      offer: ["Hắc Hổ lảng vảng ở bìa rừng, cần người trừ."],
      progress: ["Hắc Hổ còn đó, chưa đủ số."],
      complete: ["Hổ dữ đã trừ, tông môn hậu tạ."],
    },
  },
];

const SHOP_FIXTURE: readonly SectShopEntry[] = [
  { itemId: "hoi_huyet_dan", cost: 5, minLevel: 1, limitDay: 10, hall: "baoKho" },
  { itemId: "hoi_linh_dan", cost: 5, minLevel: 1, limitDay: 10, hall: "baoKho" },
  { itemId: "tu_khi_dan", cost: 30, minLevel: 3, limitDay: 2, hall: "baoKho" },
];

/** Xoá hết khoá của `o` rồi gán lại từ `src` (thay TẠI CHỖ: các tham chiếu đã import vẫn thấy). */
function replaceKeys<T extends object>(o: T, src: Record<string, unknown>) {
  for (const k of Object.keys(o)) delete (o as Record<string, unknown>)[k];
  Object.assign(o, src);
}

/** Dựng `QuestDef` của một nhiệm vụ tông CỤ THỂ (như `buildSectQuest` của `shared/`, không xuất ra ngoài). */
function questDef(t: SectQuestTemplate, tier: SectQuestTier): QuestDef | undefined {
  const d = t.byTier[tier];
  if (!d) return undefined;
  return {
    id: sectQuestId(t.id, tier),
    title: t.title,
    giver: SECT_QUEST_GIVER,
    desc: t.desc,
    steps: d.steps,
    rewards: d.rewards,
    minRealm: { realm: tier === 0 ? 1 : tier + 1, tier: 0 },
    daily: true,
    talk: t.talk,
  };
}

/** Thay bảng nhiệm vụ tông bằng bản cố định; trả hàm khôi phục. */
export function installSectQuestFixture(): () => void {
  const saved = {
    list: [...SECT_QUESTS],
    tpl: { ...SECT_QUEST_TEMPLATE_BY_ID },
    byId: { ...SECT_QUEST_BY_ID },
  };
  const byId: Record<string, QuestDef> = {};
  for (const t of QUEST_FIXTURE)
    for (const tier of [0, 1, 2, 3] as const) {
      const def = questDef(t, tier);
      if (def) byId[def.id] = def;
    }
  (SECT_QUESTS as SectQuestTemplate[]).splice(0, SECT_QUESTS.length, ...QUEST_FIXTURE);
  replaceKeys(SECT_QUEST_TEMPLATE_BY_ID, Object.fromEntries(QUEST_FIXTURE.map((t) => [t.id, t])));
  replaceKeys(SECT_QUEST_BY_ID, byId);
  return () => {
    (SECT_QUESTS as SectQuestTemplate[]).splice(0, SECT_QUESTS.length, ...saved.list);
    replaceKeys(SECT_QUEST_TEMPLATE_BY_ID, saved.tpl);
    replaceKeys(SECT_QUEST_BY_ID, saved.byId);
  };
}

/** Thay bảng cửa hàng tông bằng bản cố định; trả hàm khôi phục. */
export function installSectShopFixture(): () => void {
  const saved = { list: [...SECT_SHOP], byItem: { ...SECT_SHOP_BY_ITEM } };
  (SECT_SHOP as SectShopEntry[]).splice(0, SECT_SHOP.length, ...SHOP_FIXTURE);
  replaceKeys(SECT_SHOP_BY_ITEM, Object.fromEntries(SHOP_FIXTURE.map((e) => [e.itemId, e])));
  return () => {
    (SECT_SHOP as SectShopEntry[]).splice(0, SECT_SHOP.length, ...saved.list);
    replaceKeys(SECT_SHOP_BY_ITEM, saved.byItem);
  };
}
