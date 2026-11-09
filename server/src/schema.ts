import { Schema, MapSchema, Encoder, type } from "@colyseus/schema";

// Bộ đệm mã hóa state mặc định 8 KB. Gửi toàn bộ state cho người mới vào khi phòng gần đầy
// (100 người + quái + đồ rơi ≈ 12 KB) sẽ tràn: schema tự nới rồi mã hóa lại, in cảnh báo mỗi lần.
// Phải đặt trước khi tạo phòng (Colyseus cấp bộ đệm lúc khởi tạo serializer).
Encoder.BUFFER_SIZE = 32 * 1024;

export class Player extends Schema {
  @type("string") name = "";
  @type("float32") x = 0;
  @type("float32") y = 0;
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
  @type("uint32") lastSeq = 0; // input cuối server đã xử lý (để client đối chiếu)
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

export class WorldState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Monster }) monsters = new MapSchema<Monster>();
  @type({ map: Loot }) loot = new MapSchema<Loot>();
}
