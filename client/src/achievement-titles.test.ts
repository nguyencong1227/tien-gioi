import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, TITLES, sampleAchievements, type AchievementsMsg } from "@tien-gioi/shared";
import { achievementsView, splitTitles } from "./achievement-view";

const empty = (): AchievementsMsg => ({ ach: {}, counters: {}, title: null });

describe("splitTitles: danh hiệu đã mở hiện thẳng, chưa mở gập lại", () => {
  it("sổ rỗng: không cái nào mở, tất cả gập; nhãn đếm đúng", () => {
    const s = splitTitles(achievementsView(empty()).titles);
    expect(s.open).toEqual(["dot-bien-shard-2"]);
    expect(s.locked.length).toBe(TITLES.length);
    expect(s.lockedLabel).toBe(`Còn ${TITLES.length} danh hiệu chưa mở`);
  });

  it("sổ mẫu (đã đạt Luân Hồi Lần Đầu): đúng một danh hiệu mở, phần còn lại gập; hai phần không trùng và đủ cả danh mục", () => {
    const v = achievementsView(sampleAchievements());
    const s = splitTitles(v.titles);
    expect(s.open.map((t) => t.id)).toEqual(["lh2"]);
    expect(s.open.every((t) => t.unlocked && t.hint === "")).toBe(true);
    expect(s.locked.every((t) => !t.unlocked && /^Mở bằng thành tựu: /.test(t.hint))).toBe(true);
    expect(s.open.length + s.locked.length).toBe(TITLES.length);
    expect(new Set([...s.open, ...s.locked].map((t) => t.id)).size).toBe(TITLES.length);
  });

  it("mở hết: không còn mục gập, nhãn rỗng", () => {
    const ach: Record<string, string> = {};
    for (const a of ACHIEVEMENTS) ach[a.id] = "2026-11-17T08:00:00.000Z";
    const s = splitTitles(achievementsView({ ach, counters: {}, title: null }).titles);
    expect(s.locked).toEqual([]);
    expect(s.lockedLabel).toBe("");
    expect(s.open.length).toBe(TITLES.length);
  });

  it("giữ thứ tự dữ liệu trong từng phần và không đổi mảng đầu vào", () => {
    const titles = achievementsView(sampleAchievements()).titles;
    const copy = titles.map((t) => ({ ...t }));
    const s = splitTitles(titles);
    expect(titles).toEqual(copy);
    const order = TITLES.map((t) => t.id);
    const idx = (arr: { id: string }[]) => arr.map((t) => order.indexOf(t.id));
    for (const part of [s.open, s.locked]) {
      const i = idx(part);
      expect([...i].sort((a, b) => a - b)).toEqual(i);
    }
  });

  it("danh sách rỗng: không sập", () => {
    expect(splitTitles([])).toEqual({ open: [], locked: [], lockedLabel: "" });
  });
});
