import { Schema, MapSchema, Encoder, type, view } from "@colyseus/schema";

// Bộ đệm mã hóa state mặc định 8 KB. Có hai chỗ cần lớn hơn nhiều:
// - Gửi toàn bộ state cho người mới vào khi phòng gần đầy (100 người + quái + đồ rơi ≈ 12 KB).
// - Mỗi tick, patch của MỌI client (theo StateView, #62) được ghi nối tiếp vào cùng một bộ đệm:
//   100 người cùng tụ trong trấn thì mỗi người nhận patch của ~100 người khác, tổng vài trăm KB.
// Tràn thì schema tự nới rồi mã hóa lại, in cảnh báo: chậm đúng lúc đông người nhất.
// 256 KB không đủ khi người chơi vào DỒN DẬP (khởi động lại server rồi mọi người nối lại, hoặc thử tải dài `npm run soak`: 100 bot vào
// trong vài giây): đo được một tick cần 272-304 KB, schema in `buffer overflow` nhiều lần rồi cấp lại bộ đệm (docs/LOAD_TEST.md mục 20).
// 512 KB có biên ~1,7 lần so với số đo đó; giá: thêm 256 KB x 2 bộ đệm mỗi phòng (kể cả phòng bí cảnh tạm).
// Phải đặt trước khi tạo phòng (Colyseus cấp bộ đệm lúc khởi tạo serializer; mỗi phòng 2 bộ đệm).
Encoder.BUFFER_SIZE = 512 * 1024;

/**
 * Thẻ `@view` cho trường chỉ chủ nhân vật cần (xem systems/interest.ts: view.add(p, TAG_OWNER)).
 * Người khác không nhận trường này nên không tốn băng thông mỗi lần nhân vật di chuyển.
 */
export const TAG_OWNER = 1;

export class Player extends Schema {
  @type("string") name = "";
  /**
   * Vị trí THẬT (float, mô phỏng và đối chiếu dự đoán của client): chỉ gửi cho chủ nhân vật (#80).
   * Người khác nhận px, py bên dưới: làm tròn và thưa hơn nên tốn ít băng thông hơn nhiều khi đông người.
   */
  @view(TAG_OWNER) @type("float32") x = 0;
  @view(TAG_OWNER) @type("float32") y = 0;
  /** Vị trí công khai cho người khác: số nguyên px (thế giới 3072 px), cập nhật mỗi POS_SYNC_EVERY_TICKS tick */
  @type("int16") px = 0;
  @type("int16") py = 0;
  @type("float32") angle = 0;
  @type("number") hp = 100;
  @type("number") maxHp = 100;
  @type("number") mp = 50;
  @type("number") maxMp = 50;
  @type("uint8") realm = 0;
  @type("uint8") tier = 0;
  @type("number") exp = 0;
  @type("number") expMax = 40;
  @type("boolean") meditating = false;
  @type("boolean") dead = false;
  /** Đang trong trận thách đấu (công khai: người ngoài vẽ dấu ⚔; đổi chỉ lúc bắt đầu / kết thúc, docs/THIET_KE_PK.md) */
  @type("boolean") duel = false;
  /** Biệt hiệu tông môn (2-4 ký tự, "" = không có): người ngoài vẽ `[xxxx]` cạnh tên; đổi chỉ lúc vào / rời / lập / giải tán / bị mời ra. */
  @type("string") sect = "";
  // input cuối server đã xử lý (để client đối chiếu); chỉ chủ nhân vật nhận
  @view(TAG_OWNER) @type("uint32") lastSeq = 0;
  // Đồ đang mặc (itemId, "" = trống). Công khai để mọi người thấy ngoại hình; kiểu Equipment trong shared/src/items.ts.
  // Player có đủ 3 trường này nên truyền thẳng vào statsFor(realm, tier, p).
  @type("string") weapon = "";
  @type("string") robe = "";
  @type("string") talisman = "";
}

export class Monster extends Schema {
  @type("string") kind = "";
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") angle = 0;
  @type("number") hp = 0;
  @type("number") maxHp = 0;
}

/** Đồ rơi trên đất. Kiểu dùng chung cho client: LootView trong shared/src/items.ts */
export class Loot extends Schema {
  @type("string") itemId = "";
  @type("uint16") qty = 0;
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("string") owner = ""; // sessionId được nhặt trước; "" = ai cũng nhặt được
}

/**
 * Ba bảng thực thể đều `@view()`: mỗi client chỉ nhận phần tử đã thêm vào StateView của mình
 * (những gì ở gần, xem systems/interest.ts). Thực thể ra khỏi vùng nhìn thì client nhận onRemove,
 * nên `players.size` ở client chỉ là số người ở gần: dùng `online` cho tổng số người trong phòng.
 */
export class WorldState extends Schema {
  @view() @type({ map: Player }) players = new MapSchema<Player>();
  @view() @type({ map: Monster }) monsters = new MapSchema<Monster>();
  @view() @type({ map: Loot }) loot = new MapSchema<Loot>();
  /** Tổng số người chơi trong phòng (luôn gửi cho mọi client, không theo vùng nhìn) */
  @type("uint16") online = 0;
}
