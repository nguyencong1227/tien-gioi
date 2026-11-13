import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ITEMS, MAPS, NPCS } from "@tien-gioi/shared";
import {
  PICKUP_BTN_LABEL,
  PORTAL_BTN_LABEL,
  TALK_BTN_LABEL,
  pickupBtnText,
  portalBtnText,
  talkBtnText,
} from "./ctx-btn";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf-8");
const BAD = [undefined, null, "", "   ", 5, {}, []];

describe("nhãn trong ba nút ngữ cảnh: cố định và ngắn (vừa dây cung nút tròn 58 px)", () => {
  it("tối đa 6 ký tự ở cỡ 10 px; ba nhãn khác nhau", () => {
    const labels = [PORTAL_BTN_LABEL, TALK_BTN_LABEL, PICKUP_BTN_LABEL];
    for (const l of labels) expect(l.length, l).toBeLessThanOrEqual(6);
    expect(new Set(labels).size).toBe(3);
  });

  it("nhãn KHÔNG chứa tên cổng / NPC / món đồ (dữ liệu thật), nên không bao giờ bị cắt vì tên dài", () => {
    for (const def of MAPS)
      for (const p of def.portals ?? [])
        expect(portalBtnText(p.name).label, p.id).toBe(PORTAL_BTN_LABEL);
    for (const n of NPCS) expect(talkBtnText(n.name).label, n.id).toBe(TALK_BTN_LABEL);
    for (const i of ITEMS) expect(pickupBtnText(i.name).label, i.id).toBe(PICKUP_BTN_LABEL);
  });
});

describe("tên đi vào title / aria-label, kèm phím F", () => {
  it("cổng: MỌI cổng của MỌI bản đồ", () => {
    let n = 0;
    for (const def of MAPS)
      for (const p of def.portals ?? []) {
        const t = portalBtnText(p.name);
        expect(t.title, p.id).toBe(`Đi qua ${p.name} (F)`);
        expect(t.aria, p.id).toBe(`Đi qua ${p.name} (Phím F)`);
        n++;
      }
    expect(n).toBeGreaterThanOrEqual(4);
  });

  it("NPC: MỌI NPC", () => {
    expect(NPCS.length).toBeGreaterThanOrEqual(9);
    for (const npc of NPCS) {
      const t = talkBtnText(npc.name);
      expect(t.title, npc.id).toBe(`Nói chuyện với ${npc.name} (F)`);
      expect(t.aria, npc.id).toBe(`Nói chuyện với ${npc.name} (Phím F)`);
    }
  });

  it("món đồ: MỌI vật phẩm", () => {
    expect(ITEMS.length).toBeGreaterThanOrEqual(31);
    for (const it of ITEMS) {
      const t = pickupBtnText(it.name);
      expect(t.title, it.id).toBe(`Nhặt ${it.name} (F)`);
      expect(t.aria, it.id).toBe(`Nhặt ${it.name} (Phím F)`);
    }
  });

  it("tên rỗng / toàn khoảng trắng / sai kiểu: chữ chung, không in 'undefined' / 'null' / '[object' / 'NaN'", () => {
    for (const bad of BAD)
      for (const t of [portalBtnText(bad), talkBtnText(bad), pickupBtnText(bad)])
        for (const s of [t.label, t.title, t.aria])
          expect(s, String(bad)).not.toMatch(/undefined|null|\[object|NaN/);
    expect(portalBtnText("").title).toBe("Đi qua cổng truyền tống (F)");
    expect(talkBtnText(null).title).toBe("Nói chuyện (F)");
    expect(pickupBtnText(undefined).title).toBe("Nhặt vật phẩm rơi (F)");
    expect(portalBtnText("  Bắc Môn Quan  ").title).toBe("Đi qua Bắc Môn Quan (F)");
  });
});

describe("ba nút nối với ui.ts / WorldScene.ts / index.html / style.css", () => {
  const ui = read("./ui.ts");
  const scene = read("./scenes/WorldScene.ts");

  it("ui.ts đặt nhãn, title và aria-label bằng hàm của ctx-btn, không ghi tên vào nhãn", () => {
    for (const [fn, idLabel, id] of [
      ["portalBtnText(label)", "portal-label", "btn-portal"],
      ["talkBtnText(npcName)", "talk-label", "btn-talk"],
      ["pickupBtnText(itemName)", "pickup-label", "btn-pickup"],
    ] as const) {
      expect(ui, fn).toContain(fn);
      expect(ui, idLabel).toContain(`$("${idLabel}").textContent = t.label;`);
      expect(ui, id).toContain(`$("${id}")`);
    }
    // không còn ghi chuỗi tự do (tên + "(F)") vào nhãn
    expect(ui).not.toMatch(/(portal|talk|pickup)-label"\)\.textContent = (label|`)/);
  });

  it("WorldScene chỉ truyền TÊN (hoặc chuỗi rỗng), không còn dựng chữ nhãn 'Nói chuyện · ... (F)' / 'Nhặt ...'", () => {
    expect(scene).toContain('ui.talkPrompt(npcDef?.name ?? "")');
    expect(scene).toContain('bestLabel = def?.name ?? "";');
    expect(scene).not.toContain("Nói chuyện · ");
    expect(scene).not.toMatch(/bestLabel = def \? `Nhặt/);
  });

  it("nhãn mặc định trong index.html khớp nhãn cố định (trạng thái chưa gọi prompt cũng không bị cắt)", () => {
    const html = read("../index.html");
    expect(html).toContain(`<small id="portal-label">${PORTAL_BTN_LABEL}</small>`);
    expect(html).toContain(`<small id="talk-label">${TALK_BTN_LABEL}</small>`);
    expect(html).toContain(`<small id="pickup-label">${PICKUP_BTN_LABEL}</small>`);
  });

  it("điện thoại dọc thấp: nút cổng dời sang cột thứ hai ngang hàng nút nói chuyện (khỏi bị thanh Nhiệm vụ đè)", () => {
    const css = read("./style.css");
    const m = css.match(
      /@media \(orientation: portrait\) and \(max-height: (\d+)px\) \{\s*#btn-portal \{([^}]*)\}/,
    );
    expect(m, "thiếu khối @media dời #btn-portal").not.toBeNull();
    // Đỉnh nút cổng ở ô thứ ba cách đáy 14 + 194 + 58 = 266 px; thanh Nhiệm vụ kết thúc ~418 px: chồng khi chiều cao < 684 px
    expect(Number(m![1])).toBeGreaterThanOrEqual(684);
    expect(m![2]).toContain("168px + 58px + 8px"); // cột thứ hai: bên trái cột một (rộng 58 px) cách 8 px
    expect(m![2]).toContain("+ 128px"); // cùng hàng với nút nói chuyện
  });
});
