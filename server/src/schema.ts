import { Schema, MapSchema, type } from "@colyseus/schema";

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
}

export class Monster extends Schema {
  @type("string") kind = "";
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") angle = 0;
  @type("number") hp = 0;
  @type("number") maxHp = 0;
}

export class WorldState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Monster }) monsters = new MapSchema<Monster>();
}
