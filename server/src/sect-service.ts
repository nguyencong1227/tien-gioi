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
  ITEM_BY_ID,
  SECT_COIN_CAP,
  SECT_CONTRIB_CAP,
  SECT_CREATE_COOLDOWN_MS,
  SECT_PERMS,
  SECT_POINTS_CAP,
  SECT_REJOIN_COOLDOWN_MS,
  SECT_VAULT_DRAW_MAX,
  SECT_VAULT_DRAW_MODE,
  SECT_VAULT_DRAW_QTY_DE_TU,
  SECT_VAULT_SLOTS_MAX,
  addToInventory,
  canSect,
  cleanMotd,
  cleanSectName,
  cleanSectTag,
  compareSectMembers,
  sectAwardDay,
  sectCanEarn,
  sectDayState,
  sectKey,
  SECT_EARN_DAY_CAP,
  SECT_LEVELS,
  SECT_LEVEL_MAX,
  sectBuffOf,
  sectEarnFromAt,
  sectEarnLeft,
  sectLevelInfo,
  sectLevelOf,
  sectResetAt,
  sectQuestCh,
  sectQuestFor,
  sectQuestSlots,
  sectQuestTemplateOf,
  sectVaultAccepts,
  dayKey,
  SECT_QUEST_BY_ID,
  SECT_QUEST_TEMPLATE_BY_ID,
  type InvSlot,
  type SectAssignableRank,
  type SectEarnSource,
  type SectFail,
  type SectHallQuest,
  type SectHallView,
  type SectView,
  type SectVaultView,
} from "@tien-gioi/shared";
import { KeyedQueue } from "./pg/queue";
import { byId } from "./systems/lookup";
import {
  SectConflictError,
  emptySectVault,
  newSectId,
  withLogEntry,
  withVaultLogEntry,
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
/** Lượt rút kho đồ đã dùng hôm nay (`today` = `dayKey`) của thành viên; qua ngày thì đếm lại từ 0. */
const drawsUsed = (m: SectMemberRecord, today: string) => (m.draw?.day === today ? m.draw.n : 0);
const copySlots = (s: Sect) => s.vault.slots.map((x) => (x ? { ...x } : null));
/** Cấp tông (1..`SECT_LEVEL_MAX`) tính từ điểm tông: KHÔNG lưu, nên không thể lệch với điểm (mục 12.2). */
const levelOf = (s: Sect) => sectLevelOf(s.points ?? 0);
const infoOf = (s: Sect) => sectLevelInfo(levelOf(s));

/**
 * Thêm `qty` món vào CÁC Ô ĐÃ MỞ (`unlocked` ô đầu) của kho; ô khoá theo cấp tông không bao giờ bị đụng. Sửa `slots` tại chỗ (người gọi đã chép bằng `copySlots`);
 * trả số dư KHÔNG chứa được (0 = đủ chỗ).
 */
function addToVault(
  slots: (InvSlot | null)[],
  unlocked: number,
  itemId: string,
  qty: number,
): number {
  const open = slots.slice(0, unlocked);
  const left = addToInventory(open, itemId, qty);
  for (let i = 0; i < open.length; i++) slots[i] = open[i];
  return left;
}

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
        vault: emptySectVault(),
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
      if (sect.members.length >= infoOf(sect).maxMembers) throw new Refusal("sect_full");
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
        if (s.members.length >= infoOf(s).maxMembers) throw new Refusal("sect_full");
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

  /** Tông chủ đặt chức vụ `rank` (Trưởng lão / Đệ tử) cho thành viên `targetName`; Trưởng lão tối đa theo cấp tông (`sectLevelInfo(...).maxElders`, cấp 1 = `SECT_ELDERS_MAX`). */
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
        if (rank === "truong_lao" && eldersOf(s) >= infoOf(s).maxElders)
          throw new Refusal("elders_full");
        return {
          ...s,
          members: s.members.map((m) => (m.soulKey === t.soulKey ? { ...m, rank } : m)),
        };
      });
      return { ok: true, sect };
    });
  }

  /** Tông chủ chuyển quyền cho `targetName` (mình xuống Trưởng lão). Từ chối nếu việc đó làm vượt số Trưởng lão tối đa theo cấp tông. */
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
        if (elders > infoOf(s).maxElders) throw new Refusal("elders_full");
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

  // ---------- Cống hiến / điểm tông / cấp (M8, docs/THIET_KE_TONG_MON.md mục 12) ----------

  /**
   * MỘT đường duy nhất để cộng cống hiến (mọi nguồn: nhiệm vụ, góp kho, bí cảnh đều gọi hàm này): trong MỘT `update` nguyên tử tính bằng `sectAwardDay`
   * (trần theo ngày, trần từng nguồn, mỗi nhiệm vụ một lần) rồi cộng cùng `granted` vào `contrib` + `merit` của người đó và `Sect.points`. Kiểm: là thành viên;
   * `sectCanEarn` (chỉ ai vào từ TRƯỚC hôm nay; `opts.warmup = false` chỉ để dev / E2E, mục 12.3); `want` nguyên dương.
   * Từ chối `not_warm` / `earn_cap` (hết trần ngày hoặc trần nguồn) / `quest_done` (nhiệm vụ đã trả hôm nay) / `quest_unavailable` (id lạ) / `amount_invalid`.
   * Trả số thực được cộng, cấp tông sau đó và `levelUp` (lên cấp ở đúng lần này). Không đụng ví, túi, ghi nhật ký kiểm toán: người gọi (`systems/sect.ts`) lo.
   * Người đã chết / ở Hoàng Tuyền: người gọi kiểm TRƯỚC (`isDown`).
   */
  award(
    actor: SectActor,
    source: SectEarnSource,
    want: number,
    opts: { key?: string; warmup?: boolean } = {},
  ): Promise<SectResult<{ sect: Sect; granted: number; level: number; levelUp: boolean }>> {
    return this.guarded(actor.soulKey, async () => {
      if (!Number.isSafeInteger(want) || want < 1) throw new Refusal("amount_invalid");
      const now = this.clock();
      let granted = 0;
      let before = 1;
      const sect = await this.mutate(actor.soulKey, (s, me) => {
        if (!sectCanEarn(me.joinedAt, now, opts.warmup ?? true)) throw new Refusal("not_warm");
        const r = sectAwardDay(sectDayState(me.today, now), source, want, opts.key);
        if (r.refused === "quest_done") throw new Refusal("quest_done");
        if (r.granted < 1) {
          const known = sectQuestTemplateOf(opts.key) !== undefined;
          throw new Refusal(source === "quest" && !known ? "quest_unavailable" : "earn_cap");
        }
        const contrib = me.contrib ?? 0;
        const merit = me.merit ?? 0;
        const points = s.points ?? 0;
        if (
          contrib + r.granted > SECT_CONTRIB_CAP ||
          merit + r.granted > SECT_POINTS_CAP ||
          points + r.granted > SECT_POINTS_CAP
        )
          throw new Refusal("earn_cap");
        granted = r.granted;
        before = sectLevelOf(points);
        return {
          ...s,
          points: points + r.granted,
          members: s.members.map((m) =>
            m.soulKey === me.soulKey
              ? { ...m, contrib: contrib + r.granted, merit: merit + r.granted, today: r.day }
              : m,
          ),
        };
      });
      const level = levelOf(sect);
      return { ok: true, sect, granted, level, levelUp: level > before };
    });
  }

  // ---------- Kho đồ (docs/THIET_KE_TONG_MON.md mục 11) ----------
  // Dịch vụ chỉ lo LUẬT và kho lưu; túi đồ, lưu hồ sơ và thứ tự "túi <-> hồ sơ <-> kho" nằm ở `systems/sect.ts`. Mọi thay đổi là MỘT `update` nguyên tử:
  // quyền, khoá kỳ vọng theo ô, hạn mức ngày và số lượng đều kiểm TRÊN bản ghi đọc trong `update`, nên hai người cùng rút một món không bao giờ cùng thấy một số dư.

  /** Món + số lượng hợp lệ (món có thật, số nguyên dương an toàn) hoặc ném `item_invalid`. */
  private vaultItem(itemId: unknown, qty: unknown) {
    const def = byId(ITEM_BY_ID, itemId);
    if (!def || typeof qty !== "number" || !Number.isSafeInteger(qty) || qty < 1)
      throw new Refusal("item_invalid");
    return { def, qty };
  }

  /**
   * Góp `qty` món `itemId` vào kho đồ: gọi SAU khi túi đã trừ và hồ sơ đã lưu. Hết chỗ (cộng dồn rồi ô trống) thì từ chối `vault_full`, không góp dở;
   * món trong danh sách chặn thì `vault_denied`. Người gọi hoàn đồ vào túi (hoặc để rơi đất) nếu từ chối.
   */
  vaultDeposit(
    actor: SectActor,
    itemId: unknown,
    qty: unknown,
  ): Promise<SectResult<{ sect: Sect }>> {
    return this.guarded(actor.soulKey, async () => {
      const { def, qty: n } = this.vaultItem(itemId, qty);
      if (!sectVaultAccepts(def.id)) throw new Refusal("vault_denied");
      const now = this.clock();
      const sect = await this.mutate(actor.soulKey, (s, me) => {
        if (!canSect("vaultDeposit", me.rank)) throw new Refusal("forbidden");
        const slots = copySlots(s);
        if (addToVault(slots, infoOf(s).vaultSlots, def.id, n) > 0) throw new Refusal("vault_full");
        const entry = { at: now, name: me.name, kind: "deposit" as const, itemId: def.id, qty: n };
        return { ...s, vault: { ...s.vault, slots, log: withVaultLogEntry(s.vault.log, entry) } };
      });
      return { ok: true, sect };
    });
  }

  /**
   * Rút `qty` món `itemId` ở ô kho `slot` (khoá kỳ vọng theo ô: ô phải CÒN giữ đúng món với đủ số lượng, không thì `vault_changed`: không bao giờ rút nhầm món khác
   * khi giao diện cũ). Đệ tử: mỗi lượt tối đa `SECT_VAULT_DRAW_QTY_DE_TU` món và tối đa `drawPerDay` lượt mỗi ngày (`today` = `dayKey`), đếm theo linh hồn và tăng
   * NGAY trong `update` cùng lúc trừ kho (gửi dồn không vượt hạn mức). Tông chủ / Trưởng lão không hạn. Gọi TRƯỚC khi cộng túi; người gọi cộng túi rồi lưu hồ sơ
   * (mất hơn nhân đôi, mục 11.4) và, nếu túi không nhận trọn, trả phần thừa bằng `vaultReturn`.
   */
  vaultWithdraw(
    actor: SectActor,
    req: { slot: unknown; itemId: unknown; qty: unknown },
    today: string,
  ): Promise<SectResult<{ sect: Sect }>> {
    return this.guarded(actor.soulKey, async () => {
      const { def, qty } = this.vaultItem(req.itemId, req.qty);
      const slot = req.slot;
      if (
        typeof slot !== "number" ||
        !Number.isInteger(slot) ||
        slot < 0 ||
        slot >= SECT_VAULT_SLOTS_MAX
      )
        throw new Refusal("item_invalid");
      const now = this.clock();
      const sect = await this.mutate(actor.soulKey, (s, me) => {
        if (!canSect("vaultWithdraw", me.rank)) throw new Refusal("forbidden");
        if (slot >= infoOf(s).vaultSlots) throw new Refusal("vault_locked_slot"); // ô chưa mở theo cấp tông (mục 12.4)
        const cell = s.vault.slots[slot];
        if (!cell || cell.itemId !== def.id || cell.qty < qty) throw new Refusal("vault_changed");
        let members = s.members;
        if (SECT_VAULT_DRAW_MODE[me.rank] === "limited") {
          const used = drawsUsed(me, today);
          if (qty > SECT_VAULT_DRAW_QTY_DE_TU || used >= s.vault.drawPerDay)
            throw new Refusal("vault_limit");
          members = s.members.map((m) =>
            m.soulKey === me.soulKey ? { ...m, draw: { day: today, n: used + 1 } } : m,
          );
        }
        const slots = copySlots(s);
        slots[slot] = cell.qty > qty ? { itemId: cell.itemId, qty: cell.qty - qty } : null;
        const entry = { at: now, name: me.name, kind: "withdraw" as const, itemId: def.id, qty };
        return {
          ...s,
          members,
          vault: { ...s.vault, slots, log: withVaultLogEntry(s.vault.log, entry) },
        };
      });
      return { ok: true, sect };
    });
  }

  /**
   * Trả lại kho phần đồ đã rút mà túi không nhận được (túi vừa đầy, người chơi đã rời / đã gục). KHÔNG kiểm quyền hay danh sách chặn (đồ vốn của kho); `restoreDraw`
   * hoàn lại một lượt rút đã tính (khi túi không nhận được gì). Kho hết chỗ (người khác vừa góp vào đúng chỗ đó) thì từ chối `vault_full`: người gọi để đồ rơi đất.
   */
  vaultReturn(
    actor: SectActor,
    itemId: unknown,
    qty: unknown,
    restoreDraw: boolean,
    today: string,
  ): Promise<SectResult<{ sect: Sect }>> {
    return this.guarded(actor.soulKey, async () => {
      const { def, qty: n } = this.vaultItem(itemId, qty);
      const now = this.clock();
      const sect = await this.mutate(actor.soulKey, (s, me) => {
        const slots = copySlots(s);
        if (addToVault(slots, infoOf(s).vaultSlots, def.id, n) > 0) throw new Refusal("vault_full");
        const members =
          restoreDraw && me.draw?.day === today && me.draw.n > 0
            ? s.members.map((m) =>
                m.soulKey === me.soulKey ? { ...m, draw: { day: today, n: me.draw!.n - 1 } } : m,
              )
            : s.members;
        const entry = { at: now, name: me.name, kind: "deposit" as const, itemId: def.id, qty: n };
        return {
          ...s,
          members,
          vault: { ...s.vault, slots, log: withVaultLogEntry(s.vault.log, entry) },
        };
      });
      return { ok: true, sect };
    });
  }

  /** Tông chủ đặt số lượt rút / ngày của Đệ tử (0..`SECT_VAULT_DRAW_MAX`). */
  vaultPolicy(actor: SectActor, drawPerDay: unknown): Promise<SectResult<{ sect: Sect }>> {
    return this.guarded(actor.soulKey, async () => {
      if (
        typeof drawPerDay !== "number" ||
        !Number.isInteger(drawPerDay) ||
        drawPerDay < 0 ||
        drawPerDay > SECT_VAULT_DRAW_MAX
      )
        throw new Refusal("amount_invalid");
      const sect = await this.mutate(actor.soulKey, (s, me) => {
        if (!canSect("vaultPolicy", me.rank)) throw new Refusal("forbidden");
        return { ...s, vault: { ...s.vault, drawPerDay } };
      });
      return { ok: true, sect };
    });
  }
}

/**
 * Ảnh chụp "Nội vụ" (M8, `SectHallMsg.hall`) gửi thành viên `viewerKey`; `null` nếu người đó không ở tông môn. `now` là đồng hồ phòng (ms), `warmup` là cờ "chờ sang ngày"
 * (`World.sectEarnWarmup`). Nhiệm vụ và cửa hàng để RỖNG ở bước này (M8.4 / M8.5 điền): client dựng giao diện khớp kiểu thật.
 */
export function sectHallViewOf(
  sect: Sect,
  viewerKey: string,
  now: number,
  warmup: boolean,
  ctx?: SectHallCtx,
): SectHallView | null {
  const me = sect.members.find((m) => m.soulKey === viewerKey);
  if (!me) return null;
  const points = sect.points ?? 0;
  const level = sectLevelOf(points);
  const info = sectLevelInfo(level);
  const day = sectDayState(me.today, now);
  return {
    now,
    resetAt: sectResetAt(now),
    level,
    points,
    pointsFrom: info.points,
    pointsNext: level < SECT_LEVEL_MAX ? SECT_LEVELS[level]!.points : null,
    buff: sectBuffOf(level),
    caps: { members: info.maxMembers, elders: info.maxElders, vaultSlots: info.vaultSlots },
    me: {
      contrib: me.contrib ?? 0,
      merit: me.merit ?? 0,
      earnedToday: day.earned,
      earnCap: SECT_EARN_DAY_CAP,
      depositLeft: sectEarnLeft(day, "deposit"),
      earnFromAt: sectCanEarn(me.joinedAt, now, warmup) ? 0 : sectEarnFromAt(me.joinedAt, warmup),
    },
    quests: ctx ? hallQuestsOf(sect, day, now, ctx) : [],
    shop: [],
  };
}

/** Phần của người xem mà bản ghi tông môn KHÔNG có (cảnh giới, nhiệm vụ đang làm): người gọi lấy từ `World` rồi truyền vào `sectHallViewOf`. */
export interface SectHallCtx {
  /** Cảnh giới hiện tại (quyết định bản theo BẬC của nhiệm vụ) */
  realm: number;
  /** Id nhiệm vụ đang làm trong sổ nhiệm vụ của người xem (bản nào cũng được: nhận Luyện Khí rồi đột phá vẫn là cùng một mẫu) */
  active: readonly string[];
}

/**
 * Nhiệm vụ tông hôm nay của người xem (mục 12.7): `sectQuestSlots` chọn tất định theo `hash(sectId, ngày)` nên mọi thành viên cùng thấy cùng các MẪU; mỗi mẫu hiện bản theo bậc của
 * người xem (`sectQuestFor`). Trạng thái theo MẪU (không theo bản): `done` = đã trả hôm nay (sổ ngày của linh hồn nên đầu thai / đổi bậc giữa ngày không làm lại được), `active` = đang làm
 * (bản nào cũng tính), còn lại `offer`.
 */
function hallQuestsOf(
  sect: Sect,
  day: { quests: readonly string[] },
  now: number,
  ctx: SectHallCtx,
): SectHallQuest[] {
  const out: SectHallQuest[] = [];
  for (const tplId of sectQuestSlots(sect.id, dayKey(now))) {
    const id = sectQuestFor(tplId, ctx.realm);
    const def = id ? SECT_QUEST_BY_ID[id] : undefined;
    const tpl = byId(SECT_QUEST_TEMPLATE_BY_ID, tplId);
    if (!id || !def || !tpl) continue;
    const state = day.quests.includes(tplId)
      ? "done"
      : ctx.active.some((a) => sectQuestTemplateOf(a) === tplId)
        ? "active"
        : "offer";
    out.push({
      questId: id,
      title: def.title,
      desc: def.desc,
      difficulty: tpl.difficulty,
      ch: sectQuestCh(id),
      state,
    });
  }
  return out;
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
      .map((m) => ({
        name: m.name,
        rank: m.rank,
        joinedAt: m.joinedAt,
        ...(m.merit ? { merit: m.merit } : {}), // công tích (M8): thiếu = 0, nên bản ghi trước M8 giữ nguyên ảnh chụp
      }))
      .sort(compareSectMembers),
    coin: sect.coin,
    log: sect.log.map((e) => ({ ...e })),
    createdAt: sect.createdAt,
  };
}

/**
 * Ảnh chụp kho đồ gửi cho thành viên `viewerKey` (`SectVaultMsg.vault`); `null` nếu người đó không ở tông môn. `today` = `dayKey` (tính lượt rút còn lại của Đệ tử),
 * `lockMs` = còn bao lâu nữa hết khoá "kiếp mới chưa được rút" của chính người nhận (0 = không khoá).
 */
export function sectVaultViewOf(
  sect: Sect,
  viewerKey: string,
  today: string,
  lockMs: number,
): SectVaultView | null {
  const me = sect.members.find((m) => m.soulKey === viewerKey);
  if (!me) return null;
  const unlocked = infoOf(sect).vaultSlots;
  return {
    // chỉ gửi các ô ĐÃ MỞ theo cấp tông (cấp 1 = 40 ô, y hệt trước M8); ô khoá luôn trống nên không cần gửi
    slots: sect.vault.slots.slice(0, unlocked).map((x) => (x ? { ...x } : null)),
    unlocked,
    log: sect.vault.log.map((e) => ({ ...e })),
    drawPerDay: sect.vault.drawPerDay,
    myDrawsLeft:
      SECT_VAULT_DRAW_MODE[me.rank] === "limited"
        ? Math.max(0, sect.vault.drawPerDay - drawsUsed(me, today))
        : null,
    lockMs: Math.max(0, Math.floor(lockMs)),
  };
}
