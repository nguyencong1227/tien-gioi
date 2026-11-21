// Test hợp đồng manifest.json (mục 60.1): chứng minh validateManifest CHỪNG CHỈa hợp lệ và BÁC mọi manifest
// sai kiểu / sai schema / đếm summary sai. Mỗi ca là một đột biến tiềm năng: nếu bỏ một kiểm trong
// manifest.ts, ca tương ứng chuyển đỏ (manifest sai lọt qua).
import { describe, expect, it } from "vitest";
import { MANIFEST_SCHEMA, type Manifest, validateManifest } from "./manifest";

/** Một manifest hợp lệ tối thiểu để làm nền; mỗi ca nhân bản rồi sửa một chỗ. */
function good(): Manifest {
  return {
    schema: MANIFEST_SCHEMA,
    commit: "abc1234",
    startedAt: "2026-11-21T03:00:00.000Z",
    finishedAt: "2026-11-21T03:12:00.000Z",
    server: { port: 36123, ambush: true },
    steps: [
      {
        id: "enter-game",
        scenario: "enter",
        title: "Vào game từ màn đăng nhập",
        viewport: "1366x768",
        input: "gõ tên + mã + Enter",
        shots: ["shots/enter-game-1366x768.jpg"],
        ok: true,
        metrics: { fps: { min: 52, avg: 58 }, player: [{ t: 0, x: 100, y: 200 }] },
        consoleErrors: [],
        networkErrors: [],
        findings: [],
      },
      {
        id: "move-hold",
        scenario: "move",
        title: "Giữ W 3s rồi nhả",
        viewport: "360x640",
        input: "giữ W 3000ms rồi nhả",
        shots: ["shots/move-hold-360x640.jpg"],
        ok: false,
        metrics: {
          fps: { min: 12, avg: 40 },
          player: [
            { t: 0, x: 100, y: 200 },
            { t: 3000, x: 100, y: 200 },
          ],
        },
        consoleErrors: ["CONSOLE ERROR: Cannot read x"],
        networkErrors: [],
        findings: [{ kind: "stall", detail: "giữ phím 3s nhưng player.x không đổi" }],
      },
    ],
    summary: { steps: 2, failed: 1, consoleErrors: 1, findings: 1 },
  };
}

function clone(o: Manifest): Manifest {
  return JSON.parse(JSON.stringify(o));
}

describe("validateManifest — hợp lệ", () => {
  it("chấp nhận manifest đúng và trả về đã gắn kiểu", () => {
    const m = good();
    const v = validateManifest(m);
    expect(v.schema).toBe(MANIFEST_SCHEMA);
    expect(v.steps).toHaveLength(2);
    expect(v.summary).toEqual({ steps: 2, failed: 1, consoleErrors: 1, findings: 1 });
    expect(v.steps[1].findings[0].kind).toBe("stall");
  });

  it("chấp nhận manifest không có lỗi / không có finding nào", () => {
    const m = clone(good());
    m.steps = [m.steps[0]];
    m.summary = { steps: 1, failed: 0, consoleErrors: 0, findings: 0 };
    expect(() => validateManifest(m)).not.toThrow();
  });
});

describe("validateManifest — bác manifest sai (mỗi ca = một răng của validator)", () => {
  // Trả `unknown` để các ca đột biến được tự do phá kiểu (validateManifest nhận `unknown`).
  const cases: Array<[string, (m: Manifest) => unknown]> = [
    ["không phải object", () => null],
    ["schema sai", (m) => ({ ...m, schema: "wrong/v0" })],
    [
      "schema thiếu",
      (m) => {
        const m2 = clone(m);
        delete (m2 as unknown as Record<string, unknown>).schema;
        return m2;
      },
    ],
    ["commit quá ngắn", (m) => ({ ...m, commit: "abc" })],
    ["commit không phải chuỗi", (m) => ({ ...m, commit: 123 as unknown as string })],
    ["startedAt không phải ISO", (m) => ({ ...m, startedAt: "not-a-date" })],
    [
      "finishedAt thiếu",
      (m) => {
        const m2 = clone(m);
        delete (m2 as unknown as Record<string, unknown>).finishedAt;
        return m2;
      },
    ],
    [
      "server không phải object",
      (m) => ({ ...m, server: 5 as unknown as Record<string, unknown> }),
    ],
    ["server.port không phải số", (m) => ({ ...m, server: { port: "36123", ambush: true } })],
    ["server.ambush không phải boolean", (m) => ({ ...m, server: { port: 1, ambush: "yes" } })],
    ["steps không phải mảng", (m) => ({ ...m, steps: {} as unknown as [] })],
    [
      "bước thiếu id",
      (m) => {
        const s = { ...m.steps[0] };
        delete (s as Record<string, unknown>).id;
        return { ...m, steps: [s, m.steps[1]] };
      },
    ],
    [
      "bước.ok không phải boolean",
      (m) => {
        const s = { ...m.steps[0] };
        (s as Record<string, unknown>).ok = "true";
        return { ...m, steps: [s, m.steps[1]] };
      },
    ],
    [
      "shots không phải mảng",
      (m) => {
        const s = { ...m.steps[0] };
        (s as Record<string, unknown>).shots = "x.jpg";
        return { ...m, steps: [s, m.steps[1]] };
      },
    ],
    [
      "shots phần tử không phải chuỗi",
      (m) => {
        const s = { ...m.steps[0] };
        (s as Record<string, unknown>).shots = [123];
        return { ...m, steps: [s, m.steps[1]] };
      },
    ],
    [
      "metrics thiếu",
      (m) => {
        const s = { ...m.steps[0] };
        delete (s as Record<string, unknown>).metrics;
        return { ...m, steps: [s, m.steps[1]] };
      },
    ],
    [
      "metrics.fps.avg không phải số",
      (m) => {
        const s = { ...m.steps[0] };
        (s as Record<string, unknown>).metrics = { fps: { min: 50, avg: "x" }, player: [] };
        return { ...m, steps: [s, m.steps[1]] };
      },
    ],
    [
      "player mẫu thiếu y",
      (m) => {
        const s = { ...m.steps[0] };
        (s as Record<string, unknown>).metrics = {
          fps: { min: 50, avg: 55 },
          player: [{ t: 0, x: 1 }],
        };
        return { ...m, steps: [s, m.steps[1]] };
      },
    ],
    [
      "consoleErrors phần tử không phải chuỗi",
      (m) => {
        const s = { ...m.steps[0] };
        (s as Record<string, unknown>).consoleErrors = [42];
        return { ...m, steps: [s, m.steps[1]] };
      },
    ],
    [
      "findings.kind không hợp lệ",
      (m) => {
        const s = { ...m.steps[0] };
        (s as Record<string, unknown>).findings = [{ kind: "explode", detail: "x" }];
        return { ...m, steps: [s, m.steps[1]] };
      },
    ],
    [
      "findings thiếu detail",
      (m) => {
        const s = { ...m.steps[0] };
        (s as Record<string, unknown>).findings = [{ kind: "drift" }];
        return { ...m, steps: [s, m.steps[1]] };
      },
    ],
    [
      "summary thiếu",
      (m) => {
        const m2 = clone(m);
        delete (m2 as unknown as Record<string, unknown>).summary;
        return m2;
      },
    ],
    ["summary.steps đếm sai", (m) => ({ ...m, summary: { ...m.summary, steps: 99 } })],
    ["summary.failed đếm sai", (m) => ({ ...m, summary: { ...m.summary, failed: 0 } })],
    [
      "summary.consoleErrors đếm sai",
      (m) => ({ ...m, summary: { ...m.summary, consoleErrors: 0 } }),
    ],
    ["summary.findings đếm sai", (m) => ({ ...m, summary: { ...m.summary, findings: 0 } })],
  ];

  for (const [name, mutate] of cases) {
    it(`bác manifest ${name}`, () => {
      expect(() => validateManifest(mutate(clone(good())))).toThrow();
    });
  }
});
