// Gói tài nguyên riêng (QUYET_DINH_M3 mục 63): nạp manifest, bảng phục vụ, route `/assets-private/*` (traversal, không liệt kê, tệp ngoài manifest, 404 sạch khi tắt), công cụ manifest / check,
// và chốt chặn "không gói nào trong git". Mọi yêu cầu HTTP dùng `http.request` THÔ: `fetch` / URL tự chuẩn hoá `..` nên không thử được đường dẫn nguy hiểm.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import http from "node:http";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { PRIVATE_PACK_FILE_MAX_BYTES, type PrivatePackManifest } from "@tien-gioi/shared";
import { main } from "../scripts/assets-private";
import { originGuardMiddleware, originPolicyOf } from "./origin-guard";
import {
  buildPrivatePackManifest,
  checkPrivatePackManifest,
  listSkippedPrivatePackFiles,
  loadPrivatePacks,
  mountPrivatePacks,
  privatePackLookupKey,
  privatePacksNotice,
  writePrivatePackManifest,
} from "./private-packs";

const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const PNG = Buffer.from("\x89PNG-atlas-cainos".padEnd(300, "x"), "latin1");
const WEBP = Buffer.from("RIFF-webp-tile".padEnd(120, "y"), "latin1");
const JSON_UI = Buffer.from('{"frame":[0,0,16,16]}');
const SECRET = Buffer.from("tệp có trên đĩa nhưng KHÔNG nằm trong manifest");

const tmp = mkdtempSync(path.join(tmpdir(), "tien-gioi-private-packs-"));
const outside = path.join(tmp, "outside");
const dist = path.join(tmp, "dist");
const put = (rel: string, data: Buffer | string) => {
  const abs = path.join(dist, ...rel.split("/"));
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, data);
};

function manifestOf(): PrivatePackManifest {
  return {
    packs: [
      {
        id: "cainos",
        title: "Cainos Top Down Basic",
        url: "https://cainos.itch.io/pixel-art-top-down-basic",
        license: "Miễn phí, dùng trong game, cấm phân phối lại",
        files: [
          { path: "atlas.png", bytes: PNG.length, sha256: sha(PNG) },
          { path: "tiles/a.webp", bytes: WEBP.length, sha256: sha(WEBP) },
        ],
      },
      {
        id: "tiny",
        title: "Tiny Swords",
        files: [{ path: "ui.json", bytes: JSON_UI.length, sha256: sha(JSON_UI) }],
      },
    ],
  };
}

beforeAll(() => {
  mkdirSync(outside, { recursive: true });
  put("cainos/atlas.png", PNG);
  put("cainos/tiles/a.webp", WEBP);
  put("cainos/secret.png", SECRET);
  put("tiny/ui.json", JSON_UI);
  writeFileSync(path.join(dist, "manifest.json"), JSON.stringify(manifestOf()));
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

/** Dựng một thư mục dist RIÊNG cho từng ca (sửa manifest / tệp mà không động tới bản chung). */
function freshDist(
  name: string,
  manifest: unknown,
  files: Record<string, Buffer | string> = {},
): string {
  const dir = path.join(tmp, name);
  mkdirSync(dir, { recursive: true });
  for (const [rel, data] of Object.entries(files)) {
    const abs = path.join(dir, ...rel.split("/"));
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, data);
  }
  writeFileSync(
    path.join(dir, "manifest.json"),
    typeof manifest === "string" ? manifest : JSON.stringify(manifest),
  );
  return dir;
}

describe("loadPrivatePacks", () => {
  it("biến rỗng / thiếu = TẮT, không cảnh báo", () => {
    for (const v of [undefined, "", "   "]) {
      const r = loadPrivatePacks(v);
      expect(r.table, String(v)).toBeNull();
      expect(r.warnings).toEqual([]);
    }
    expect(privatePacksNotice(loadPrivatePacks(undefined))).toBe("Gói tài nguyên riêng: tắt");
  });

  it("thư mục không tồn tại / là tệp / thiếu manifest / manifest không phải JSON / manifest sai luật: TẮT + cảnh báo, KHÔNG ném lỗi", () => {
    expect(loadPrivatePacks(path.join(tmp, "khong-co")).warnings.join("\n")).toMatch(
      /không phải thư mục/,
    );
    expect(loadPrivatePacks(path.join(dist, "manifest.json")).warnings.join("\n")).toMatch(
      /không phải thư mục/,
    );
    expect(loadPrivatePacks(path.join(tmp, "khong-co")).table).toBeNull();
    const empty = path.join(tmp, "rong");
    mkdirSync(empty);
    const noManifest = loadPrivatePacks(empty);
    expect(noManifest.table).toBeNull();
    expect(noManifest.warnings.join("\n")).toMatch(/không đọc được/);
    const notJson = loadPrivatePacks(freshDist("t-json", "{không phải json"));
    expect(notJson.table).toBeNull();
    expect(notJson.warnings.join("\n")).toMatch(/không đọc được/);
    const badRule = loadPrivatePacks(
      freshDist("t-luat", {
        packs: [
          {
            id: "x",
            title: "Gói X",
            files: [{ path: "../etc/passwd.png", bytes: 1, sha256: sha("a") }],
          },
        ],
      }),
    );
    expect(badRule.table).toBeNull();
    expect(badRule.warnings.join("\n")).toMatch(/manifest không hợp lệ/);
    expect(loadPrivatePacks(freshDist("t-hoa", { packs: [], extra: 1 })).table).toBeNull();
  });

  it("manifest quá lớn bị từ chối", () => {
    const big = `{"packs":[],"pad":"${"x".repeat(1024 * 1024 + 10)}"}`;
    const r = loadPrivatePacks(freshDist("t-lon", big));
    expect(r.table).toBeNull();
    expect(r.warnings.join("\n")).toMatch(/quá lớn/);
  });

  it("hợp lệ: bảng chứa đúng tệp của manifest (kiểu nội dung theo đuôi, sha, bytes); manifest lọc giữ nguyên; log nêu số gói / tệp", () => {
    const r = loadPrivatePacks(dist);
    expect(r.warnings).toEqual([]);
    const t = r.table!;
    expect([...t.files.keys()].sort()).toEqual([
      "cainos/atlas.png",
      "cainos/tiles/a.webp",
      "tiny/ui.json",
    ]);
    expect(t.files.get("cainos/atlas.png")).toMatchObject({
      mime: "image/png",
      sha256: sha(PNG),
      bytes: PNG.length,
    });
    expect(t.files.get("cainos/tiles/a.webp")!.mime).toBe("image/webp");
    expect(t.files.get("tiny/ui.json")!.mime).toBe("application/json");
    expect(t.manifest).toEqual(manifestOf());
    // tệp có trên đĩa nhưng KHÔNG trong manifest thì không vào bảng
    expect(t.files.has("cainos/secret.png")).toBe(false);
    expect(privatePacksNotice(r)).toMatch(/BẬT, 2 gói \/ 3 tệp/);
  });

  it("url / license của gói đi qua vào manifest lọc; manifest có url xấu (javascript:) thì TẮT", () => {
    const t = loadPrivatePacks(dist).table!;
    expect(t.manifest.packs[0]).toMatchObject({
      url: "https://cainos.itch.io/pixel-art-top-down-basic",
      license: "Miễn phí, dùng trong game, cấm phân phối lại",
    });
    expect(t.manifest.packs[1]).not.toHaveProperty("url"); // gói tiny không khai
    const bad = manifestOf();
    bad.packs[0]!.url = "javascript:alert(1)";
    const r = loadPrivatePacks(
      freshDist("t-url", bad, {
        "cainos/atlas.png": PNG,
        "cainos/tiles/a.webp": WEBP,
        "tiny/ui.json": JSON_UI,
      }),
    );
    expect(r.table).toBeNull();
    expect(r.warnings.join("\n")).toMatch(/manifest không hợp lệ/);
  });

  it("tệp thiếu / lệch byte / là thư mục / symlink thoát gốc bị LOẠI riêng (cảnh báo nêu tên), tệp tốt còn; gói hết tệp thì biến mất khỏi manifest lọc", () => {
    const good = Buffer.from("tốt".padEnd(50, "g"));
    const dir = freshDist(
      "t-loc",
      {
        packs: [
          {
            id: "g1",
            title: "Gói một",
            files: [
              { path: "ok.png", bytes: good.length, sha256: sha(good) },
              { path: "thieu.png", bytes: 5, sha256: sha("a") },
              { path: "lech.png", bytes: 999, sha256: sha("a") },
              { path: "thumuc.png", bytes: 5, sha256: sha("a") },
              { path: "link.png", bytes: 7, sha256: sha("a") },
            ],
          },
          { id: "g2", title: "Gói hai", files: [{ path: "chet.png", bytes: 5, sha256: sha("a") }] },
        ],
      },
      { "g1/ok.png": good, "g1/lech.png": "abc" },
    );
    mkdirSync(path.join(dir, "g1", "thumuc.png"));
    // khai số byte ĐÚNG BẰNG kích thước mục thư mục để chỉ nhánh "phải là tệp thường" mới loại được nó
    const m0 = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
    m0.packs[0].files.find((f: { path: string }) => f.path === "thumuc.png").bytes = statSync(
      path.join(dir, "g1", "thumuc.png"),
    ).size;
    writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(m0));
    writeFileSync(path.join(outside, "leak.png"), "BÍ MẬT NGOÀI GỐC");
    symlinkSync(path.join(outside, "leak.png"), path.join(dir, "g1", "link.png"));
    const r = loadPrivatePacks(dir);
    const t = r.table!;
    expect([...t.files.keys()]).toEqual(["g1/ok.png"]);
    expect(t.manifest.packs.map((p) => p.id)).toEqual(["g1"]);
    expect(t.manifest.packs[0]!.files.map((f) => f.path)).toEqual(["ok.png"]);
    const w = r.warnings.join("\n");
    for (const name of ["thieu.png", "lech.png", "thumuc.png", "link.png", "chet.png"])
      expect(w, name).toContain(name);
    expect(w).toMatch(/lệch số byte/);
    expect(w).toMatch(/không phải tệp thường/);
    expect(w).toMatch(/ngoài thư mục gốc/);
  });
});

describe("privatePackLookupKey", () => {
  it("giải mã %-escape hợp lệ thành khoá; đáng ngờ thì null", () => {
    expect(privatePackLookupKey("cainos/atlas.png")).toBe("cainos/atlas.png");
    expect(privatePackLookupKey("cainos/%61tlas.png")).toBe("cainos/atlas.png");
    for (const bad of [
      "",
      "%",
      "%zz",
      "a%2fb%",
      "%252e%252e/x.png",
      "a\\b.png",
      "a%5cb.png",
      "a%00.png",
      "a\0b",
      "a%0ab.png",
      "%7f",
    ])
      expect(privatePackLookupKey(bad), JSON.stringify(bad)).toBeNull();
  });
});

type Res = { status: number; headers: http.IncomingHttpHeaders; body: Buffer };

describe("route /assets-private/* (máy chủ express thật, yêu cầu thô)", () => {
  let server: http.Server;
  let offServer: http.Server;
  let port = 0;
  let offPort = 0;

  const listen = (s: http.Server) =>
    new Promise<number>((resolve) =>
      s.listen(0, "127.0.0.1", () => resolve((s.address() as { port: number }).port)),
    );

  function app(table: ReturnType<typeof loadPrivatePacks>["table"]) {
    const a = express();
    a.use(originGuardMiddleware(originPolicyOf({ NODE_ENV: "production" } as NodeJS.ProcessEnv)));
    mountPrivatePacks(a, table);
    // như index.ts: trang tĩnh / SPA nằm SAU; nếu route rò thì thứ rơi xuống là "SPA"
    a.get("*", (_req, res) => void res.type("text/html").send("SPA"));
    return a;
  }

  beforeAll(async () => {
    server = http.createServer(app(loadPrivatePacks(dist).table));
    offServer = http.createServer(app(null));
    port = await listen(server);
    offPort = await listen(offServer);
  });
  afterAll(async () => {
    await Promise.all([server, offServer].map((s) => new Promise((r) => s.close(r))));
  });

  const req = (
    p: number,
    rawPath: string,
    method = "GET",
    headers: Record<string, string> = {},
  ): Promise<Res> =>
    new Promise((resolve, reject) => {
      const r = http.request(
        { host: "127.0.0.1", port: p, method, path: rawPath, headers },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () =>
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              body: Buffer.concat(chunks),
            }),
          );
        },
      );
      r.on("error", reject);
      r.end();
    });

  it("manifest: bản ĐÃ LỌC, JSON, nosniff, CORP cùng nguồn, no-cache", async () => {
    const r = await req(port, "/assets-private/manifest.json");
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body.toString())).toEqual(manifestOf());
    expect(r.headers["content-type"]).toMatch(/application\/json/);
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["cross-origin-resource-policy"]).toBe("same-origin");
    expect(r.headers["cache-control"]).toBe("no-cache");
  });

  it("tệp trong manifest: đúng nội dung, kiểu, ETag = sha256; ?v= đúng hash thì immutable, sai / thiếu thì no-cache", async () => {
    const plain = await req(port, "/assets-private/cainos/atlas.png");
    expect(plain.status).toBe(200);
    expect(plain.body.equals(PNG)).toBe(true);
    expect(plain.headers["content-type"]).toBe("image/png");
    expect(plain.headers["etag"]).toBe(`"${sha(PNG)}"`);
    expect(plain.headers["content-length"]).toBe(String(PNG.length));
    expect(plain.headers["x-content-type-options"]).toBe("nosniff");
    expect(plain.headers["cache-control"]).toBe("no-cache");
    const good = await req(port, `/assets-private/cainos/atlas.png?v=${sha(PNG).slice(0, 12)}`);
    expect(good.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    for (const q of [
      "?v=deadbeef",
      "?v=",
      "?v=zzzzzzzz",
      `?v=${sha(PNG).slice(0, 8)}`, // 8 hex: độ dài CŨ, không còn được nhận
      `?v=${sha(PNG).slice(0, 11)}`,
      `?x=${sha(PNG).slice(0, 12)}`,
    ]) {
      const r = await req(port, `/assets-private/cainos/atlas.png${q}`);
      expect(r.status, q).toBe(200);
      expect(r.headers["cache-control"], q).toBe("no-cache");
    }
    const nested = await req(port, "/assets-private/cainos/tiles/a.webp");
    expect(nested.status).toBe(200);
    expect(nested.body.equals(WEBP)).toBe(true);
    expect(nested.headers["content-type"]).toBe("image/webp");
  });

  it("If-None-Match khớp ETag -> 304 không thân; HEAD -> 200 không thân, đủ Content-Length", async () => {
    const r = await req(port, "/assets-private/tiny/ui.json", "GET", {
      "If-None-Match": `"${sha(JSON_UI)}"`,
    });
    expect(r.status).toBe(304);
    expect(r.body.length).toBe(0);
    const h = await req(port, "/assets-private/tiny/ui.json", "HEAD");
    expect(h.status).toBe(200);
    expect(h.body.length).toBe(0);
    expect(h.headers["content-length"]).toBe(String(JSON_UI.length));
    expect(h.headers["content-type"]).toBe("application/json");
  });

  it("tệp có trên đĩa nhưng KHÔNG trong manifest -> 404 (không rơi xuống SPA)", async () => {
    const r = await req(port, "/assets-private/cainos/secret.png");
    expect(r.status).toBe(404);
    expect(r.body.toString()).not.toContain("SPA");
    expect(r.body.toString()).not.toContain("KHÔNG nằm trong manifest");
    const m = await req(port, "/assets-private/cainos/manifest.json");
    expect(m.status).toBe(404);
  });

  it("KHÔNG liệt kê thư mục, tiền tố trần, gói / tệp lạ: 404 sạch", async () => {
    for (const p of [
      "/assets-private",
      "/assets-private/",
      "/assets-private/cainos",
      "/assets-private/cainos/",
      "/assets-private/cainos/tiles",
      "/assets-private/cainos/tiles/",
      "/assets-private/khong-co/atlas.png",
      "/assets-private/cainos/khong-co.png",
      "/assets-private/constructor",
      "/assets-private/__proto__",
      "/assets-private/cainos/__proto__",
      "/assets-private/toString",
    ]) {
      const r = await req(port, p);
      expect(r.status, p).toBe(404);
      expect(r.body.toString(), p).not.toContain("SPA");
    }
  });

  it("TRAVERSAL và đường dẫn nguy hiểm đều 404 (yêu cầu thô, không chuẩn hoá): .., %2e%2e, mã hoá kép, \\, NUL, %2f ngoài gốc", async () => {
    for (const p of [
      "/assets-private/../manifest.json",
      "/assets-private/cainos/../../etc/passwd",
      "/assets-private/cainos/../tiny/ui.json",
      "/assets-private/%2e%2e/%2e%2e/etc/passwd",
      "/assets-private/cainos/%2e%2e/tiny/ui.json",
      "/assets-private/cainos%2f..%2ftiny%2fui.json",
      "/assets-private/%252e%252e/%252e%252e/etc/passwd",
      "/assets-private/cainos%5catlas.png",
      "/assets-private/cainos\\atlas.png",
      "/assets-private/cainos/atlas.png%00",
      "/assets-private/cainos/atlas.png%00.html",
      "/assets-private//etc/passwd",
      "/assets-private/cainos//atlas.png",
      "/assets-private/cainos/./atlas.png",
      "/assets-private/cainos/atlas.PNG",
      "/assets-private/CAINOS/atlas.png",
      "/assets-private/cainos/atlas.png/",
      "/assets-private/cainos/atlas.png/extra",
    ]) {
      const r = await req(port, p);
      expect(r.status, p).toBe(404);
      expect(r.body.toString(), p).not.toContain("SPA");
      expect(r.body.equals(PNG) || r.body.equals(JSON_UI), p).toBe(false);
    }
  });

  it("phương thức khác GET / HEAD -> 405 kèm Allow (kể cả tệp có thật và đường dẫn lạ)", async () => {
    for (const method of ["POST", "PUT", "DELETE", "PATCH"])
      for (const p of [
        "/assets-private/cainos/atlas.png",
        "/assets-private/manifest.json",
        "/assets-private/khong-co.png",
      ]) {
        const r = await req(port, p, method);
        expect(r.status, `${method} ${p}`).toBe(405);
        expect(r.headers["allow"]).toBe("GET, HEAD");
      }
  });

  it("Origin LẠ bị 403 như mọi đường khác (gắn SAU originGuardMiddleware); không Origin hoặc Origin hợp lệ thì qua", async () => {
    const evil = await req(port, "/assets-private/cainos/atlas.png", "GET", {
      Origin: "https://evil.example",
    });
    expect(evil.status).toBe(403);
    expect(evil.body.equals(PNG)).toBe(false);
    const evilManifest = await req(port, "/assets-private/manifest.json", "GET", {
      Origin: "https://evil.example",
    });
    expect(evilManifest.status).toBe(403);
    expect((await req(port, "/assets-private/cainos/atlas.png")).status).toBe(200);
  });

  it("TẮT (bảng rỗng): manifest vẫn 200 { packs: [] } (không 404 đỏ ở DevTools, không phải HTML SPA); MỌI thứ khác dưới /assets-private/ là 404 sạch, không rơi xuống SPA; phương thức lạ vẫn 405", async () => {
    const m = await req(offPort, "/assets-private/manifest.json");
    expect(m.status).toBe(200);
    expect(JSON.parse(m.body.toString())).toEqual({ packs: [] });
    expect(m.headers["content-type"]).toMatch(/application\/json/);
    expect(m.headers["cache-control"]).toBe("no-cache");
    expect(m.headers["x-content-type-options"]).toBe("nosniff");
    for (const p of [
      "/assets-private/cainos/atlas.png",
      "/assets-private/",
      "/assets-private",
      "/assets-private/cainos/",
    ]) {
      const r = await req(offPort, p);
      expect(r.status, p).toBe(404);
      expect(r.body.toString(), p).not.toContain("SPA");
    }
    expect((await req(offPort, "/assets-private/manifest.json", "POST")).status).toBe(405);
    // ngoài tiền tố vẫn là SPA bình thường
    expect((await req(offPort, "/bat-ky")).body.toString()).toBe("SPA");
    expect((await req(port, "/assets-privateX")).body.toString()).toBe("SPA");
  });
});

describe("công cụ manifest / check", () => {
  const mk = (name: string) => {
    const dir = path.join(tmp, name);
    mkdirSync(path.join(dir, "g1", "sub"), { recursive: true });
    mkdirSync(path.join(dir, "g2"), { recursive: true });
    writeFileSync(path.join(dir, "g1", "b.png"), "BBB");
    writeFileSync(path.join(dir, "g1", "a.png"), "AAAA");
    writeFileSync(path.join(dir, "g1", "sub", "c.webp"), "CC");
    writeFileSync(path.join(dir, "g2", "x.json"), "{}");
    return dir;
  };

  it("sinh manifest TẤT ĐỊNH (sắp xếp), đúng bytes / sha256, tên hiển thị theo `titles` (mặc định id); bỏ tệp ẩn, đuôi ngoài danh sách trắng, liên kết tượng trưng", () => {
    const dir = mk("tool-1");
    writeFileSync(path.join(dir, "g1", ".an.png"), "H");
    writeFileSync(path.join(dir, "g1", "readme.txt"), "T");
    writeFileSync(path.join(dir, "g1", "trang.html"), "<script>");
    symlinkSync(path.join(outside, "leak.png"), path.join(dir, "g1", "lk.png"));
    mkdirSync(path.join(dir, ".git"));
    writeFileSync(path.join(dir, ".git", "x.png"), "G");
    const m = buildPrivatePackManifest(dir, { g1: "Gói Một" });
    expect(m).toEqual({
      packs: [
        {
          id: "g1",
          title: "Gói Một",
          files: [
            { path: "a.png", bytes: 4, sha256: sha("AAAA") },
            { path: "b.png", bytes: 3, sha256: sha("BBB") },
            { path: "sub/c.webp", bytes: 2, sha256: sha("CC") },
          ],
        },
        { id: "g2", title: "g2", files: [{ path: "x.json", bytes: 2, sha256: sha("{}") }] },
      ],
    });
    expect(JSON.stringify(buildPrivatePackManifest(dir, { g1: "Gói Một" }))).toBe(
      JSON.stringify(m),
    );
  });

  it("ghi manifest ra tệp rồi `check` khớp (không lỗi, không tệp thừa); tệp thừa được liệt kê nhưng KHÔNG là lỗi", () => {
    const dir = mk("tool-2");
    writePrivatePackManifest(dir);
    expect(Object.keys(JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")))).toEqual([
      "packs",
    ]);
    expect(checkPrivatePackManifest(dir)).toEqual({ errors: [], extra: [] });
    writeFileSync(path.join(dir, "g1", "moi.png"), "N");
    expect(checkPrivatePackManifest(dir)).toEqual({ errors: [], extra: ["g1/moi.png"] });
  });

  it("tên hiển thị / url / giấy phép đi vào manifest (CLI: --title --url --license); url không phải https hoặc giấy phép sai thì sinh manifest NÉM lỗi", () => {
    const dir = mk("tool-5");
    const m = buildPrivatePackManifest(
      dir,
      { g1: "Gói Một" },
      { urls: { g1: "https://itch.io/g1" }, licenses: { g1: "CC0" } },
    );
    expect(m.packs[0]).toMatchObject({
      id: "g1",
      title: "Gói Một",
      url: "https://itch.io/g1",
      license: "CC0",
    });
    expect(m.packs[1]).not.toHaveProperty("url"); // gói không khai thì KHÔNG có khoá (không phải undefined)
    expect(m.packs[1]).not.toHaveProperty("license");
    expect(() =>
      buildPrivatePackManifest(dir, {}, { urls: { g1: "javascript:alert(1)" } }),
    ).toThrow(/không hợp lệ/);
    expect(() =>
      buildPrivatePackManifest(dir, {}, { licenses: { g1: " có khoảng trắng đầu" } }),
    ).toThrow(/không hợp lệ/);
  });

  it("`check` bắt: thiếu tệp, lệch byte, lệch SHA-256 (cùng độ dài), thiếu / hỏng manifest, manifest sai luật", () => {
    const dir = mk("tool-3");
    writePrivatePackManifest(dir);
    writeFileSync(path.join(dir, "g1", "a.png"), "AAAB"); // cùng 4 byte, khác nội dung
    writeFileSync(path.join(dir, "g1", "b.png"), "BBBB"); // lệch byte
    rmSync(path.join(dir, "g2", "x.json"));
    const e = checkPrivatePackManifest(dir).errors.join("\n");
    expect(e).toMatch(/g1\/a\.png: lệch SHA-256/);
    expect(e).toMatch(/g1\/b\.png: lệch số byte/);
    expect(e).toMatch(/g2\/x\.json: thiếu tệp/);
    expect(checkPrivatePackManifest(path.join(tmp, "khong-co-gi")).errors.join("\n")).toMatch(
      /thiếu/,
    );
    writeFileSync(path.join(dir, "manifest.json"), "{ không");
    expect(checkPrivatePackManifest(dir).errors.join("\n")).toMatch(/không phải JSON/);
    writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ version: 9, packs: [] }));
    expect(checkPrivatePackManifest(dir).errors.join("\n")).toMatch(/trường lạ/);
  });

  it("sinh manifest ném lỗi khi có tệp vượt trần dung lượng (không âm thầm tạo manifest sai luật)", () => {
    const dir = path.join(tmp, "tool-4");
    mkdirSync(path.join(dir, "g1"), { recursive: true });
    writeFileSync(path.join(dir, "g1", "lon.png"), Buffer.alloc(PRIVATE_PACK_FILE_MAX_BYTES + 1));
    expect(() => buildPrivatePackManifest(dir)).toThrow(/không hợp lệ/);
  });

  describe("tệp bị BỎ QUA vì tên sai luật (gói tải từ itch.io hay có khoảng trắng)", () => {
    const mkSkip = (name: string) => {
      const dir = mk(name);
      writeFileSync(path.join(dir, "g1", "Blue House.png"), "K"); // khoảng trắng
      writeFileSync(path.join(dir, "g1", "dấu.webp"), "D"); // chữ có dấu
      mkdirSync(path.join(dir, "g2", "sub dir"));
      writeFileSync(path.join(dir, "g2", "sub dir", "x.json"), "{}"); // thư mục có khoảng trắng
      mkdirSync(path.join(dir, "g1", "d".repeat(60), "e".repeat(60)), { recursive: true });
      writeFileSync(path.join(dir, "g1", "d".repeat(60), "e".repeat(60), "x.png"), "L"); // đường dẫn 127 ký tự > 120
      // KHÔNG tính: đuôi ngoài danh sách trắng (bỏ qua là chủ ý), tệp ẩn, liên kết tượng trưng
      writeFileSync(path.join(dir, "g1", "Doc Me.txt"), "T");
      writeFileSync(path.join(dir, "g1", ".an ten.png"), "H");
      mkdirSync(path.join(dir, ".git")); // thư mục ẩn và tệp lẻ ở gốc `dist` không phải gói: không tính
      writeFileSync(path.join(dir, ".git", "Khong Phai Goi.png"), "G");
      writeFileSync(path.join(dir, "Tep Le.png"), "R");
      symlinkSync(path.join(outside, "leak.png"), path.join(dir, "g1", "lk ngoai.png"));
      return dir;
    };

    it("`listSkippedPrivatePackFiles` liệt kê đúng các tệp đuôi hợp lệ mà tên sai luật (sắp xếp, tất định); thư mục sạch thì rỗng", () => {
      const dir = mkSkip("skip-1");
      expect(listSkippedPrivatePackFiles(dir)).toEqual([
        "g1/Blue House.png",
        `g1/${"d".repeat(60)}/${"e".repeat(60)}/x.png`,
        "g1/dấu.webp",
        "g2/sub dir/x.json",
      ]);
      expect(listSkippedPrivatePackFiles(mk("skip-2"))).toEqual([]);
      // khớp với manifest: những tệp được liệt kê KHÔNG nằm trong manifest, mọi tệp còn lại thì có
      const listed = new Set(
        buildPrivatePackManifest(dir).packs.flatMap((p) => p.files.map((f) => `${p.id}/${f.path}`)),
      );
      for (const sk of listSkippedPrivatePackFiles(dir)) expect(listed.has(sk)).toBe(false);
      expect([...listed].sort()).toEqual(["g1/a.png", "g1/b.png", "g1/sub/c.webp", "g2/x.json"]);
    });

    it("CLI `manifest`: in BỎ QUA từng tệp và vẫn ghi manifest (không có tệp xấu); thư mục sạch thì không in gì", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
      try {
        const dir = mkSkip("skip-3");
        expect(main(["manifest", dir])).toBe(0);
        const out = warn.mock.calls.map((c) => String(c[0]));
        expect(out.filter((l) => l.startsWith("BỎ QUA"))).toHaveLength(4);
        expect(out.some((l) => l.includes("g1/Blue House.png"))).toBe(true);
        expect(out.some((l) => l.includes("g2/sub dir/x.json"))).toBe(true);
        expect(out.some((l) => /^4 tệp ảnh/.test(l))).toBe(true);
        const m = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
        expect(JSON.stringify(m)).not.toContain("Blue House");
        warn.mockClear();
        expect(main(["manifest", mk("skip-4")])).toBe(0);
        expect(warn).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
        log.mockRestore();
      }
    });

    it("CLI `manifest --strict`: có tệp bị bỏ qua thì thoát 1 và KHÔNG ghi manifest; thư mục sạch vẫn thoát 0 và ghi", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
      try {
        const dir = mkSkip("skip-5");
        expect(main(["manifest", dir, "--strict"])).toBe(1);
        expect(existsSync(path.join(dir, "manifest.json"))).toBe(false);
        expect(err.mock.calls.some((c) => String(c[0]).includes("--strict"))).toBe(true);
        const clean = mk("skip-6");
        expect(main(["--strict-khong-co", "manifest"])).toBe(2); // tuỳ chọn lạ vẫn bị từ chối
        expect(main(["manifest", clean, "--strict"])).toBe(0);
        expect(existsSync(path.join(clean, "manifest.json"))).toBe(true);
      } finally {
        warn.mockRestore();
        err.mockRestore();
        log.mockRestore();
      }
    });
  });
});

describe("nối vào index.ts", () => {
  const src = readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "index.ts"),
    "utf8",
  );

  it("`mountPrivatePacks` gọi SAU originGuardMiddleware + frameGuardMiddleware và TRƯỚC express.static / SPA (Origin lạ bị 403, 404 không rơi xuống index.html); đọc ASSETS_PRIVATE_DIR", () => {
    const at = (needle: string) => {
      const i = src.indexOf(needle);
      expect(i, needle).toBeGreaterThan(-1);
      return i;
    };
    const mount = at("mountPrivatePacks(app, privatePacks.table)");
    expect(at("app.use(frameGuardMiddleware)")).toBeLessThan(mount);
    expect(at("app.use(originGuardMiddleware(")).toBeLessThan(mount);
    expect(mount).toBeLessThan(at("express.static("));
    expect(mount).toBeLessThan(at('app.get("*"'));
    expect(at("loadPrivatePacks(process.env.ASSETS_PRIVATE_DIR)")).toBeLessThan(mount);
  });
});

describe("chốt chặn: KHÔNG gói tài nguyên riêng nào trong git (mục 63)", () => {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

  it(".gitignore chặn mọi thư mục assets-private/", () => {
    const ignore = readFileSync(path.join(repo, ".gitignore"), "utf8")
      .split("\n")
      .map((l) => l.trim());
    expect(ignore).toContain("assets-private/");
    expect(ignore).toContain("**/assets-private/");
  });

  it("`git ls-files` không có đường dẫn nào chứa 'assets-private' ngoài mã / tài liệu (đuôi ảnh / âm thanh bị cấm hẳn)", () => {
    let files: string[];
    try {
      files = execFileSync("git", ["ls-files"], { cwd: repo, encoding: "utf8" })
        .split("\n")
        .filter(Boolean);
    } catch {
      return; // không phải kho git (vd gói nguồn): bỏ qua, chốt chặn nằm ở CI
    }
    const hits = files.filter((f) => f.includes("assets-private"));
    const bad = hits.filter(
      (f) =>
        /\.(png|webp|jpe?g|gif|ogg|mp3|wav|zip|psd|aseprite)$/i.test(f) ||
        /(^|\/)assets-private\//.test(f),
    );
    expect(bad).toEqual([]);
  });
});
