// Dịch vụ Tông môn (M3.6 bước 6c, docs/THIET_KE_TONG_MON.md mục 4.2, 4.3, 5). Không đụng Colyseus `Room` (như `AuthService`):
// nhận người thực hiện là `{ soulKey, name }`, trả kết quả `{ ok: true, ... } | { ok: false, reason: SectFail }`. Việc nối với
// phòng (tin nhắn, lời mời đang chờ, ví Linh thạch, lưu hồ sơ, gửi ảnh chụp) nằm ở `systems/sect.ts`.
//
// Quyền được kiểm TRÊN BẢN GHI ĐỌC TRONG `store.update` (hoặc `guard` của `store.delete`), không dựa vào bản đọc trước đó: hai thao
// tác đua nhau (mời ra + đổi chức vụ, hai người cùng chuyển quyền...) luôn thấy kết quả của nhau, nên các bất biến (một Tông
// chủ, không thành viên trùng, kho không âm) không bao giờ bị phá. Lý do từ chối được ném từ trong `fn` bằng `Refusal`: `update`
// không ghi gì khi `fn` ném.
//
// Thao tác của MỘT người xếp hàng theo `soulKey` (không hai thao tác của cùng người chồng nhau); thao tác lên MỘT tông môn xếp
// hàng theo kho (`update`). Hồi chiêu (lập, vào lại) nằm trong bộ nhớ: mất khi khởi động lại là chấp nhận được.
import {
  COIN_CAP,
  SECT_COIN_CAP,
  SECT_CREATE_COOLDOWN_MS,
  SECT_ELDERS_MAX,
  SECT_MAX_MEMBERS,
  SECT_PERMS,
  SECT_REJOIN_COOLDOWN_MS,
  canSect,
  cleanMotd,
  cleanSectName,
  cleanSectTag,
  compareSectMembers,
  sectKey,
  type SectAssignableRank,
  type SectFail,
  type SectView,
} from "@tien-gioi/shared";
import { KeyedQueue } from "./pg/queue";
import {
  SectConflictError,
  newSectId,
  withLogEntry,
  type Sect,
  type SectMemberRecord,
  type SectStore,
} from "./sect-store";

/** Người thực hiện: khoá linh hồn (`Identity.soulKey`) và đạo hiệu hiện tại (`cleanName`). */
export interface SectActor {
  soulKey: string;
  name: string;
}

export type SectOk<T extends object = object> = { ok: true } & T;
export type SectFailure = { ok: false; reason: SectFail };
export type SectResult<T extends object = object> = SectOk<T> | SectFailure;

/** Từ chối có chủ đích, ném từ trong `fn` / `guard` của kho để không ghi gì. */
class Refusal extends Error {
  constructor(readonly reason: SectFail) {
    super(reason);
    this.name = "Refusal";
  }
}

/** `member_taken`: người thực hiện đã ở một tông môn; `id_taken`: id sinh trùng (không thể xảy ra, uuid) nên là lỗi hệ thống. */
function conflictReason(e: SectConflictError): SectFail {
  if (e.reason === "name_taken" || e.reason === "tag_taken") return e.reason;
  return e.reason === "member_taken" ? "already_in_sect" : "error";
}

const sameName = (a: string, b: string) => sectKey(a) === sectKey(b);
const findByName = (s: Sect, name: string) => s.members.find((m) => sameName(m.name, name));
const eldersOf = (s: Sect) => s.members.filter((m) => m.rank === "truong_lao").length;

export class SectService {
  private readonly queue = new KeyedQueue();
  private readonly createUntil = new Map<string, number>();
  private readonly rejoinUntil = new Map<string, number>();

  constructor(
    readonly store: SectStore,
    private readonly clock: () => number = () => Date.now(),
    private readonly newId: () => string = newSectId,
  ) {}

  /** Tông môn mà linh hồn đang ở (bản sao), hoặc `null`. */
  sectOf(soulKey: string): Promise<Sect | null> {
    return this.store.findBySoul(soulKey);
  }

  /** Còn bao nhiêu ms hồi chiêu lập tông môn (0 = sẵn sàng). */
  createCooldownLeft(soulKey: string): number {
    return Math.max(0, (this.createUntil.get(soulKey) ?? 0) - this.clock());
  }

  /** Còn bao nhiêu ms trước khi được vào tông môn khác (sau khi rời / bị mời ra). */
  rejoinLeft(soulKey: string): number {
    return Math.max(0, (this.rejoinUntil.get(soulKey) ?? 0) - this.clock());
  }

  /** Quét hồi chiêu đã hết hạn (gọi theo nhịp chung của phòng); trả số mục đã dọn. */
  _sweep(now: number = this.clock()): number {
    let n = 0;
    for (const m of [this.createUntil, this.rejoinUntil])
      for (const [k, until] of m)
        if (until <= now) {
          m.delete(k);
          n++;
        }
    return n;
  }

  /** Số hồi chiêu đang giữ trong bộ nhớ (test rò rỉ). */
  get _cooldownSize(): number {
    return this.createUntil.size + this.rejoinUntil.size;
  }

  /** Chạy một thao tác xếp hàng theo người thực hiện; mọi lỗi thành kết quả `{ ok: false }` (không bao giờ reject). */
  private guarded<T extends object>(
    soulKey: string,
    run: () => Promise<SectOk<T>>,
  ): Promise<SectResult<T>> {
    return this.queue.run(soulKey, async () => {
      try {
        return await run();
      } catch (e) {
        if (e instanceof Refusal) return { ok: false, reason: e.reason } as const;
        if (e instanceof SectConflictError)
          return { ok: false, reason: conflictReason(e) } as const;
        // Chỉ ghi tên lỗi: thông báo của driver DB có thể chứa chuỗi kết nối
        console.error(`[sect] lỗi xử lý: ${e instanceof Error ? e.name : "Error"}`);
        return { ok: false, reason: "error" } as const;
      }
    });
  }

  /** Đọc - sửa - ghi tông môn của `actor` với `fn` chạy trên bản ghi mới nhất (ném `Refusal` để từ chối). */
  private async mutate(
    actorKey: string,
    fn: (s: Sect, me: SectMemberRecord) => Sect,
  ): Promise<Sect> {
    const cur = await this.store.findBySoul(actorKey);
    if (!cur) throw new Refusal("not_in_sect");
    const next = await this.store.update(cur.id, (s) => {
      const me = s.members.find((m) => m.soulKey === actorKey);
      if (!me) throw new Refusal("not_in_sect"); // bị mời ra giữa chừng
      return fn(s, me);
    });
    if (!next) throw new Refusal("not_in_sect");
    return next;
  }

  // ---------- Lập / mời / vào ----------

  /**
   * Lập tông môn: `actor` thành Tông chủ. Tên / biệt hiệu qua `cleanSectName` / `cleanSectTag` (kiểm lại dù client đã kiểm),
   * duy nhất toàn server (kho quyết định, kể cả khi hai người lập cùng lúc). KHÔNG đụng ví: `systems/sect.ts` trừ
   * `SECT_CREATE_COST` trước và hoàn lại nếu hàm này từ chối.
   */
  create(actor: SectActor, rawName: unknown, rawTag: unknown): Promise<SectResult<{ sect: Sect }>> {
    return this.guarded(actor.soulKey, async () => {
      const name = cleanSectName(rawName);
      if (name === null) throw new Refusal("name_invalid");
      const tag = cleanSectTag(rawTag);
      if (tag === null) throw new Refusal("tag_invalid");
      const now = this.clock();
      if (this.createCooldownLeft(actor.soulKey) > 0) throw new Refusal("create_cooldown");
      const sect = await this.store.create({
        v: 1,
        id: this.newId(),
        name,
        tag,
        leader: actor.soulKey,
        motd: "",
        members: [{ soulKey: actor.soulKey, name: actor.name, rank: "chu", joinedAt: now }],
        coin: 0,
        log: [],
        createdAt: now,
        updatedAt: now,
      });
      this.createUntil.set(actor.soulKey, now + SECT_CREATE_COOLDOWN_MS);
      return { ok: true, sect };
    });
  }

  /**
   * `actor` mời được `targetKey` không? Kiểm phần thuộc về tông môn: `actor` ở tông môn và đủ quyền mời, tông môn chưa đầy, người
   * kia không phải chính mình, chưa ở tông môn nào, qua hồi chiêu vào lại. (Người kia trực tuyến, lời mời trùng / quá nhiều:
   * `systems/sect.ts`.) Không ghi gì; trả tông môn để biết tên / biệt hiệu cho hộp mời.
   */
  checkInvite(actorKey: string, targetKey: string): Promise<SectResult<{ sect: Sect }>> {
    return this.guarded(actorKey, async () => {
      const sect = await this.store.findBySoul(actorKey);
      if (!sect) throw new Refusal("not_in_sect");
      const me = sect.members.find((m) => m.soulKey === actorKey);
      if (!me) throw new Refusal("not_in_sect");
      if (!canSect("invite", me.rank)) throw new Refusal("forbidden");
      if (sect.members.length >= SECT_MAX_MEMBERS) throw new Refusal("sect_full");
      if (targetKey === actorKey) throw new Refusal("target_self");
      if (await this.store.findBySoul(targetKey)) throw new Refusal("target_in_sect");
      if (this.rejoinLeft(targetKey) > 0) throw new Refusal("target_rejoin_cooldown");
      return { ok: true, sect };
    });
  }

  /**
   * `member` nhận lời mời của `inviterKey` vào tông môn `sectId`. Kiểm LẠI lúc nhận trên bản ghi mới nhất: tông môn còn,
   * người mời vẫn còn trong tông môn và vẫn có quyền mời, chưa đầy, `member` chưa ở tông môn nào và qua hồi chiêu vào lại.
   */
  join(sectId: string, inviterKey: string, member: SectActor): Promise<SectResult<{ sect: Sect }>> {
    return this.guarded(member.soulKey, async () => {
      const now = this.clock();
      if (this.rejoinLeft(member.soulKey) > 0) throw new Refusal("rejoin_cooldown");
      const sect = await this.store.update(sectId, (s) => {
        const inviter = s.members.find((m) => m.soulKey === inviterKey);
        if (!inviter || !canSect("invite", inviter.rank)) throw new Refusal("invite_invalid");
        if (s.members.length >= SECT_MAX_MEMBERS) throw new Refusal("sect_full");
        return {
          ...s,
          members: [
            ...s.members,
            { soulKey: member.soulKey, name: member.name, rank: "de_tu", joinedAt: now },
          ],
        };
      });
      if (!sect) throw new Refusal("invite_invalid");
      return { ok: true, sect };
    });
  }

  /** Cập nhật đạo hiệu đã lưu của thành viên nếu đổi (lúc vào phòng). Không ở tông môn nào thì `sect: null`. */
  refreshName(actor: SectActor): Promise<SectResult<{ sect: Sect | null }>> {
    return this.guarded(actor.soulKey, async () => {
      const cur = await this.store.findBySoul(actor.soulKey);
      if (!cur) return { ok: true, sect: null };
      if (cur.members.find((m) => m.soulKey === actor.soulKey)?.name === actor.name)
        return { ok: true, sect: cur };
      const next = await this.store.update(cur.id, (s) => ({
        ...s,
        members: s.members.map((m) =>
          m.soulKey === actor.soulKey ? { ...m, name: actor.name } : m,
        ),
      }));
      return { ok: true, sect: next };
    });
  }

  // ---------- Rời / mời ra / chức vụ ----------

  /** Tự rời tông môn. Tông chủ phải chuyển quyền trước (kể cả khi còn một mình: giải tán). Trả tông môn SAU khi rời. */
  leave(actor: SectActor): Promise<SectResult<{ sect: Sect }>> {
    return this.guarded(actor.soulKey, async () => {
      const sect = await this.mutate(actor.soulKey, (s, me) => {
        if (!canSect("leave", me.rank)) throw new Refusal("leader_must_transfer");
        return { ...s, members: s.members.filter((m) => m.soulKey !== me.soulKey) };
      });
      this.rejoinUntil.set(actor.soulKey, this.clock() + SECT_REJOIN_COOLDOWN_MS);
      return { ok: true, sect };
    });
  }

  /** Mời thành viên `targetName` ra: Tông chủ mời được mọi người khác, Trưởng lão chỉ Đệ tử. Trả tông môn sau và người bị mời ra. */
  kick(
    actor: SectActor,
    targetName: string,
  ): Promise<SectResult<{ sect: Sect; removed: SectMemberRecord }>> {
    return this.guarded(actor.soulKey, async () => {
      let removed: SectMemberRecord | undefined;
      const sect = await this.mutate(actor.soulKey, (s, me) => {
        if (!SECT_PERMS.kick[me.rank]) throw new Refusal("forbidden");
        const t = findByName(s, targetName);
        if (!t) throw new Refusal("member_not_found");
        if (t.soulKey === me.soulKey) throw new Refusal("target_self");
        if (!canSect("kick", me.rank, t.rank)) throw new Refusal("forbidden");
        removed = t;
        return { ...s, members: s.members.filter((m) => m.soulKey !== t.soulKey) };
      });
      this.rejoinUntil.set(removed!.soulKey, this.clock() + SECT_REJOIN_COOLDOWN_MS);
      return { ok: true, sect, removed: removed! };
    });
  }

  /** Tông chủ đặt chức vụ `rank` (Trưởng lão / Đệ tử) cho thành viên `targetName`; Trưởng lão tối đa `SECT_ELDERS_MAX`. */
  setRank(
    actor: SectActor,
    targetName: string,
    rank: SectAssignableRank,
  ): Promise<SectResult<{ sect: Sect }>> {
    return this.guarded(actor.soulKey, async () => {
      const sect = await this.mutate(actor.soulKey, (s, me) => {
        if (!SECT_PERMS.setRank[me.rank]) throw new Refusal("forbidden");
        const t = findByName(s, targetName);
        if (!t) throw new Refusal("member_not_found");
        if (t.soulKey === me.soulKey) throw new Refusal("target_self");
        if (!canSect("setRank", me.rank, t.rank)) throw new Refusal("forbidden");
        if (t.rank === rank) throw new Refusal("same_rank");
        if (rank === "truong_lao" && eldersOf(s) >= SECT_ELDERS_MAX)
          throw new Refusal("elders_full");
        return {
          ...s,
          members: s.members.map((m) => (m.soulKey === t.soulKey ? { ...m, rank } : m)),
        };
      });
      return { ok: true, sect };
    });
  }

  /** Tông chủ chuyển quyền cho `targetName` (mình xuống Trưởng lão). Từ chối nếu việc đó làm vượt `SECT_ELDERS_MAX`. */
  transfer(actor: SectActor, targetName: string): Promise<SectResult<{ sect: Sect }>> {
    return this.guarded(actor.soulKey, async () => {
      const sect = await this.mutate(actor.soulKey, (s, me) => {
        if (!SECT_PERMS.transfer[me.rank]) throw new Refusal("forbidden");
        const t = findByName(s, targetName);
        if (!t) throw new Refusal("member_not_found");
        if (t.soulKey === me.soulKey) throw new Refusal("target_self");
        if (!canSect("transfer", me.rank, t.rank)) throw new Refusal("forbidden");
        // Mình thành Trưởng lão; người nhận bỏ chức Trưởng lão (nếu có) để lên Tông chủ
        const elders = eldersOf(s) - (t.rank === "truong_lao" ? 1 : 0) + 1;
        if (elders > SECT_ELDERS_MAX) throw new Refusal("elders_full");
        return {
          ...s,
          leader: t.soulKey,
          members: s.members.map((m) =>
            m.soulKey === t.soulKey
              ? { ...m, rank: "chu" as const }
              : m.soulKey === me.soulKey
                ? { ...m, rank: "truong_lao" as const }
                : m,
          ),
        };
      });
      return { ok: true, sect };
    });
  }

  /**
   * Giải tán (chỉ Tông chủ, CHỈ khi kho rỗng: kiểm nguyên tử với việc xoá bằng `guard`, nên một lần góp chen vào làm giải tán bị
   * từ chối chứ không làm mất tiền). Trả tông môn TRƯỚC khi xoá để báo các thành viên.
   */
  disband(actor: SectActor): Promise<SectResult<{ sect: Sect }>> {
    return this.guarded(actor.soulKey, async () => {
      const cur = await this.store.findBySoul(actor.soulKey);
      if (!cur) throw new Refusal("not_in_sect");
      let before: Sect | undefined;
      const done = await this.store.delete(cur.id, (s) => {
        const me = s.members.find((m) => m.soulKey === actor.soulKey);
        if (!me) throw new Refusal("not_in_sect");
        if (!canSect("disband", me.rank)) throw new Refusal("forbidden");
        if (s.coin > 0) throw new Refusal("treasury_not_empty");
        before = s;
      });
      if (!done || !before) throw new Refusal("not_in_sect");
      return { ok: true, sect: before };
    });
  }

  /** Sửa thông báo (Tông chủ / Trưởng lão). `raw` qua `cleanMotd` (một dòng, bỏ ký tự điều khiển, cắt độ dài). */
  setMotd(actor: SectActor, raw: unknown): Promise<SectResult<{ sect: Sect }>> {
    return this.guarded(actor.soulKey, async () => {
      const motd = cleanMotd(raw);
      if (motd === null) throw new Refusal("error");
      const sect = await this.mutate(actor.soulKey, (s, me) => {
        if (!canSect("motd", me.rank)) throw new Refusal("forbidden");
        return { ...s, motd };
      });
      return { ok: true, sect };
    });
  }

  // ---------- Kho chung (chỉ phần của tông môn; ví người chơi và lưu hồ sơ ở `systems/sect.ts`) ----------

  /**
   * Cộng `amount` vào kho (mọi thành viên) và ghi sổ. Số nguyên 1..`COIN_CAP`; kho không vượt `SECT_COIN_CAP` (không góp dở).
   * Gọi SAU khi đã trừ ví và lưu hồ sơ; từ chối thì người gọi phải hoàn tiền.
   */
  deposit(actor: SectActor, amount: number): Promise<SectResult<{ sect: Sect }>> {
    return this.guarded(actor.soulKey, async () => {
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > COIN_CAP)
        throw new Refusal("amount_invalid");
      const now = this.clock();
      const sect = await this.mutate(actor.soulKey, (s, me) => {
        if (!canSect("deposit", me.rank)) throw new Refusal("forbidden");
        if (s.coin + amount > SECT_COIN_CAP) throw new Refusal("treasury_full");
        return {
          ...s,
          coin: s.coin + amount,
          log: withLogEntry(s.log, { at: now, name: me.name, kind: "deposit", amount }),
        };
      });
      return { ok: true, sect };
    });
  }

  /**
   * Trừ `amount` khỏi kho (chỉ Tông chủ) và ghi sổ. Gọi TRƯỚC khi cộng ví; người gọi cộng ví rồi lưu hồ sơ (ưu tiên mất hơn nhân
   * đôi: docs/THIET_KE_TONG_MON.md mục 4.4).
   */
  withdraw(actor: SectActor, amount: number): Promise<SectResult<{ sect: Sect }>> {
    return this.guarded(actor.soulKey, async () => {
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > COIN_CAP)
        throw new Refusal("amount_invalid");
      const now = this.clock();
      const sect = await this.mutate(actor.soulKey, (s, me) => {
        if (!canSect("withdraw", me.rank)) throw new Refusal("forbidden");
        if (s.coin < amount) throw new Refusal("treasury_short");
        return {
          ...s,
          coin: s.coin - amount,
          log: withLogEntry(s.log, { at: now, name: me.name, kind: "withdraw", amount }),
        };
      });
      return { ok: true, sect };
    });
  }
}

/** Ảnh chụp gửi cho thành viên `viewerKey` (`SectMsg.sect`); `null` nếu người đó không ở tông môn. Thành viên xếp theo `compareSectMembers`. */
export function sectViewOf(sect: Sect, viewerKey: string): SectView | null {
  const me = sect.members.find((m) => m.soulKey === viewerKey);
  if (!me) return null;
  return {
    name: sect.name,
    tag: sect.tag,
    motd: sect.motd,
    myRank: me.rank,
    members: sect.members
      .map((m) => ({ name: m.name, rank: m.rank, joinedAt: m.joinedAt }))
      .sort(compareSectMembers),
    coin: sect.coin,
    log: sect.log.map((e) => ({ ...e })),
    createdAt: sect.createdAt,
  };
}
