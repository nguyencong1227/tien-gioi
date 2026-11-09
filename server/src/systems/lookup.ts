// Tra bảng *_BY_ID (ITEM_BY_ID, QUEST_BY_ID, NPC_BY_ID, ...) bằng id không tin được (tin nhắn client, file lưu).
// Các bảng là object thường, nên TABLE["constructor"] / TABLE["__proto__"] trả về hàm / Object.prototype
// thay vì undefined. Luôn đi qua hàm này khi id đến từ bên ngoài.
export function byId<T>(table: Readonly<Record<string, T>>, id: unknown): T | undefined {
  return typeof id === "string" && Object.hasOwn(table, id) ? table[id] : undefined;
}
