import { beforeEach, describe, expect, it } from "vitest";
import {
  AuthClient,
  authErrorMessage,
  clearToken,
  formatRecoveryCode,
  getToken,
  passwordReasonMessage,
  setMockAuthEnabled,
  setToken,
  usernameReasonMessage,
} from "./auth";

describe("client/src/auth - Tiện ích và Ánh xạ lỗi", () => {
  it("formatRecoveryCode định dạng mã mỗi 4 ký tự viết hoa", () => {
    expect(formatRecoveryCode("abcdefghijklmnop")).toBe("ABCD-EFGH-IJKL-MNOP");
    expect(formatRecoveryCode("1234567890abcdef")).toBe("1234-5678-90AB-CDEF");
    expect(formatRecoveryCode("a-b_c d e f g h i j k l m n o p")).toBe("ABCD-EFGH-IJKL-MNOP");
  });

  it("authErrorMessage dịch chính xác tất cả các mã lỗi sang câu tiếng Việt", () => {
    expect(authErrorMessage({ error: "bad_credentials" })).toContain("không chính xác");
    expect(authErrorMessage({ error: "username_taken" })).toContain("đã được sử dụng");
    expect(authErrorMessage({ error: "weak_password" })).toContain("quá ngắn");
    expect(authErrorMessage({ error: "rate_limited", retryAfterS: 15 })).toContain("15 giây");
    expect(authErrorMessage({ error: "unauthorized" })).toContain("hết hạn");
    expect(authErrorMessage({ error: "already_online" })).toContain("nơi khác");
    expect(authErrorMessage({ error: "name_taken" })).toContain("Đạo hiệu này đã có người sử dụng");
    expect(authErrorMessage({ error: "name_invalid" })).toContain("Đạo hiệu không hợp lệ");
    expect(authErrorMessage({ error: "not_found" })).toContain("Không tìm thấy nhân vật cũ");
    expect(authErrorMessage(null, "Lỗi mặc định")).toBe("Lỗi mặc định");
  });

  it("usernameReasonMessage và passwordReasonMessage trả đúng câu hướng dẫn", () => {
    expect(usernameReasonMessage("length")).toContain("từ 3 đến 20");
    expect(usernameReasonMessage("chars")).toContain("chữ thường a-z");

    expect(passwordReasonMessage("short")).toContain("ít nhất 8 ký tự");
    expect(passwordReasonMessage("same_as_username")).toContain("không được trùng");
    expect(passwordReasonMessage("common")).toContain("quá phổ biến");
  });

  it("getToken, setToken, clearToken quản lý localStorage an toàn", () => {
    clearToken();
    expect(getToken()).toBeNull();
    setToken("test_token_123");
    expect(getToken()).toBe("test_token_123");
    clearToken();
    expect(getToken()).toBeNull();
  });
});

describe("client/src/auth - Luồng xác thực Mock Auth", () => {
  let auth: AuthClient;

  beforeEach(() => {
    setMockAuthEnabled(true);
    auth = new AuthClient();
  });

  it("đăng ký tài khoản mới thành công -> trả token và recoveryCode", async () => {
    const res = await auth.register({
      username: "kiem_khach_01",
      password: "MatKhauBaoMat123",
    });
    expect(res.token).toContain("mock_token_kiem_khach_01");
    expect(res.recoveryCode).toHaveLength(16);
  });

  it("từ chối đăng ký tên trùng", async () => {
    await auth.register({
      username: "kiem_khach_02",
      password: "MatKhauBaoMat123",
    });

    await expect(
      auth.register({
        username: "kiem_khach_02",
        password: "MatKhauBaoMat123",
      }),
    ).rejects.toMatchObject({ error: "username_taken" });
  });

  it("đăng nhập thành công với mật khẩu đúng, từ chối khi sai mật khẩu", async () => {
    await auth.register({
      username: "phap_su_01",
      password: "MatKhauChuan123",
    });

    // Sai mật khẩu
    await expect(
      auth.login({
        username: "phap_su_01",
        password: "SaiMatKhau123",
      }),
    ).rejects.toMatchObject({ error: "bad_credentials" });

    // Đúng mật khẩu
    const loginRes = await auth.login({
      username: "phap_su_01",
      password: "MatKhauChuan123",
    });
    expect(loginRes.token).toBeDefined();

    // Lấy thông tin me
    const me = await auth.me(loginRes.token);
    expect(me.username).toBe("phap_su_01");
    expect(me.hasCharacter).toBe(false);
  });

  it("tạo đạo hiệu nhân vật thành công -> cập nhật thông tin me", async () => {
    const { token } = await auth.register({
      username: "dao_si_01",
      password: "MatKhauDaoSi123",
    });

    await auth.createCharacter(token, { name: "Thanh Phong" });

    const me = await auth.me(token);
    expect(me.hasCharacter).toBe(true);
    expect(me.name).toBe("Thanh Phong");

    // Không được tạo đạo hiệu lần 2
    await expect(auth.createCharacter(token, { name: "Phong Ba" })).rejects.toMatchObject({
      error: "has_character",
    });
  });

  it("nhận nhân vật cũ qua claim thành công", async () => {
    const { token } = await auth.register({
      username: "cu_nhan_01",
      password: "MatKhauCuNhan123",
    });

    await auth.claimCharacter(token, {
      name: "Cổ Tiên Sinh",
      secret: "sec_secret_cu_12345",
    });

    const me = await auth.me(token);
    expect(me.hasCharacter).toBe(true);
    expect(me.name).toBe("Cổ Tiên Sinh");
  });

  it("khôi phục mật khẩu bằng recovery code thành công", async () => {
    const { recoveryCode } = await auth.register({
      username: "quen_mat_khau_01",
      password: "MatKhauBanDau123",
    });

    // Khôi phục mật khẩu
    const recoverRes = await auth.recover({
      username: "quen_mat_khau_01",
      recoveryCode,
      newPassword: "MatKhauMoiToanh123",
    });

    expect(recoverRes.token).toBeDefined();
    expect(recoverRes.recoveryCode).not.toBe(recoveryCode); // Đã cấp mã mới

    // Đăng nhập bằng mật khẩu mới
    const loginRes = await auth.login({
      username: "quen_mat_khau_01",
      password: "MatKhauMoiToanh123",
    });
    expect(loginRes.token).toBeDefined();
  });
});

describe("client/src/auth - Đường gọi THẬT qua fetch (AuthClient)", () => {
  let auth: AuthClient;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    setMockAuthEnabled(false);
    auth = new AuthClient("");
    originalFetch = globalThis.fetch;
  });

  it("401/409/429 JSON -> ném đúng AuthErrorBody (kể cả retryAfterS)", async () => {
    // 401
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "bad_credentials" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    await expect(auth.login({ username: "user_a", password: "password123" })).rejects.toEqual({
      error: "bad_credentials",
    });

    // 409
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "username_taken" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    await expect(auth.register({ username: "user_a", password: "password123" })).rejects.toEqual({
      error: "username_taken",
    });

    // 429 kèm retryAfterS
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "rate_limited", retryAfterS: 45 }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    await expect(auth.login({ username: "user_a", password: "password123" })).rejects.toEqual({
      error: "rate_limited",
      retryAfterS: 45,
    });
  });

  it("thân không JSON / mã lạ / constructor -> ném { error: 'invalid' }", async () => {
    // Phản hồi HTML / Text không JSON
    globalThis.fetch = async () =>
      new Response("<html>502 Bad Gateway</html>", {
        status: 502,
        headers: { "Content-Type": "text/html" },
      });
    await expect(auth.login({ username: "user_a", password: "password123" })).rejects.toEqual({
      error: "invalid",
    });

    // Mã lỗi lạ không có trong bảng
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "hack_attack" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    await expect(auth.login({ username: "user_a", password: "password123" })).rejects.toEqual({
      error: "invalid",
    });

    // Thuộc tính nguyên mẫu constructor
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "constructor" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    await expect(auth.login({ username: "user_a", password: "password123" })).rejects.toEqual({
      error: "invalid",
    });
  });

  it("gửi đúng header Content-Type và Authorization Bearer", async () => {
    let capturedHeaders: HeadersInit | undefined;
    globalThis.fetch = async (_url, init) => {
      capturedHeaders = init?.headers;
      return new Response(JSON.stringify({ username: "kiem_tu", hasCharacter: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    await auth.me("token_secret_123");
    const h = capturedHeaders as Record<string, string>;
    expect(h["Content-Type"]).toBe("application/json");
    expect(h["Authorization"]).toBe("Bearer token_secret_123");
  });

  it("xử lý 204 No Content và 200 OK thân JSON", async () => {
    // 204 No Content (logout / character)
    globalThis.fetch = async () => new Response(null, { status: 204 });
    const logoutRes = await auth.logout("token_xyz");
    expect(logoutRes).toEqual({});

    // 200 OK JSON
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ username: "kiem_tu", hasCharacter: true, name: "Thanh Phong Tử" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    const meRes = await auth.me("token_xyz");
    expect(meRes.username).toBe("kiem_tu");
    expect(meRes.name).toBe("Thanh Phong Tử");
  });

  it("lỗi mạng -> ném { error: 'invalid' }, tuyệt đối không tự bật mock", async () => {
    globalThis.fetch = async () => {
      throw new TypeError("Failed to fetch");
    };

    await expect(auth.login({ username: "user_a", password: "password123" })).rejects.toEqual({
      error: "invalid",
    });

    // Mock vẫn phải là false
    const { isMockAuthEnabled } = await import("./auth");
    expect(isMockAuthEnabled()).toBe(false);

    // Khôi phục fetch gốc
    globalThis.fetch = originalFetch;
  });
});

describe("client/src/auth - detectAuthMode", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  it("phát hiện authMode: account khi /health trả account", async () => {
    const { detectAuthMode } = await import("./auth");
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ ok: true, authMode: "account" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    expect(await detectAuthMode()).toBe("account");
  });

  it("phát hiện authMode: legacy khi /health trả legacy", async () => {
    const { detectAuthMode } = await import("./auth");
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ ok: true, authMode: "legacy" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    expect(await detectAuthMode()).toBe("legacy");
  });

  it("phát hiện authMode: legacy khi /health thiếu trường authMode (server cũ)", async () => {
    const { detectAuthMode } = await import("./auth");
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    expect(await detectAuthMode()).toBe("legacy");
  });

  it("phát hiện authMode: legacy khi /health gặp lỗi mạng hoặc 500", async () => {
    const { detectAuthMode } = await import("./auth");
    globalThis.fetch = async () => {
      throw new Error("Network error");
    };
    expect(await detectAuthMode()).toBe("legacy");
    globalThis.fetch = originalFetch;
  });
});

describe("client/src/auth-ui - Quyết định điều hướng sau khi có token (decidePostAuthDestination & enterWithToken, Refs #186)", () => {
  it("tài khoản ĐÃ có nhân vật -> vào thẳng game với đạo hiệu", async () => {
    const { decidePostAuthDestination } = await import("./auth-ui");
    const dest = decidePostAuthDestination({
      hasCharacter: true,
      name: "Tiêu Dao Tử",
    });
    expect(dest.view).toBe("game");
    expect(dest.name).toBe("Tiêu Dao Tử");
  });

  it("tài khoản CHƯA có nhân vật (đăng ký mới hoặc khôi phục trước khi tạo nv) -> tới màn hình khởi tạo đạo hiệu", async () => {
    const { decidePostAuthDestination } = await import("./auth-ui");
    const dest1 = decidePostAuthDestination({
      hasCharacter: false,
    });
    expect(dest1.view).toBe("character");
    expect(dest1.name).toBeUndefined();

    const dest2 = decidePostAuthDestination({
      hasCharacter: false,
      name: undefined,
    });
    expect(dest2.view).toBe("character");
  });

  it("tài khoản có cờ hasCharacter nhưng thiếu tên -> an toàn tới màn hình khởi tạo đạo hiệu", async () => {
    const { decidePostAuthDestination } = await import("./auth-ui");
    const dest1 = decidePostAuthDestination({
      hasCharacter: true,
      name: "",
    });
    expect(dest1.view).toBe("character");

    const dest2 = decidePostAuthDestination({
      hasCharacter: true,
      name: undefined,
    });
    expect(dest2.view).toBe("character");
  });

  it("enterWithToken gọi onTokenAuth khi tài khoản đã có nhân vật", async () => {
    const { enterWithToken } = await import("./auth-ui");
    let joinedToken = "";
    let joinedName = "";
    const fakeClient = {
      me: async () => ({
        username: "user1",
        hasCharacter: true,
        name: "Lý Tiêu Dao",
      }),
    } as any;

    await enterWithToken(
      "test_token_abc",
      {
        onTokenAuth: async (token, name) => {
          joinedToken = token;
          joinedName = name ?? "";
        },
        onLegacyAuth: async () => {},
      },
      fakeClient,
    );

    expect(joinedToken).toBe("test_token_abc");
    expect(joinedName).toBe("Lý Tiêu Dao");
  });

  it("enterWithToken không gọi onTokenAuth khi tài khoản chưa có nhân vật", async () => {
    const { enterWithToken } = await import("./auth-ui");
    let called = false;
    const fakeClient = {
      me: async () => ({
        username: "user_moi",
        hasCharacter: false,
      }),
    } as any;

    await enterWithToken(
      "token_tan_thu",
      {
        onTokenAuth: async () => {
          called = true;
        },
        onLegacyAuth: async () => {},
      },
      fakeClient,
    );

    expect(called).toBe(false);
  });

  it("enterWithToken xóa token và về login khi onTokenAuth trả JOIN_BAD_TOKEN (401)", async () => {
    const { enterWithToken, getActiveAuthView } = await import("./auth-ui");
    const { setToken, getToken } = await import("./auth");
    setToken("bad_token_123");
    const fakeClient = {
      me: async () => ({
        username: "user_bad",
        hasCharacter: true,
        name: "Lý Tiêu Dao",
      }),
    } as any;

    await enterWithToken(
      "bad_token_123",
      {
        onTokenAuth: async () => {
          const err: any = new Error("Phiên hết hạn");
          err.code = 401; // JOIN_BAD_TOKEN
          throw err;
        },
        onLegacyAuth: async () => {},
      },
      fakeClient,
    );

    expect(getToken()).toBeNull();
    expect(getActiveAuthView()).toBe("login");
  });

  it("enterWithToken xóa token và về login khi me trả lỗi unauthorized", async () => {
    const { enterWithToken, getActiveAuthView } = await import("./auth-ui");
    const { setToken, getToken } = await import("./auth");
    setToken("expired_token_456");
    const fakeClient = {
      me: async () => {
        throw { error: "unauthorized" };
      },
    } as any;

    await enterWithToken(
      "expired_token_456",
      {
        onTokenAuth: async () => {},
        onLegacyAuth: async () => {},
      },
      fakeClient,
    );

    expect(getToken()).toBeNull();
    expect(getActiveAuthView()).toBe("login");
  });

  it("enterWithToken chuyển sang view character khi onTokenAuth trả JOIN_NEED_CHARACTER (423)", async () => {
    const { enterWithToken, getActiveAuthView } = await import("./auth-ui");
    const fakeClient = {
      me: async () => ({
        username: "user_need_char",
        hasCharacter: true,
        name: "Lý Tiêu Dao",
      }),
    } as any;

    await enterWithToken(
      "token_no_char",
      {
        onTokenAuth: async () => {
          const err: any = new Error("Tài khoản chưa có đạo hiệu.");
          err.code = 423; // JOIN_NEED_CHARACTER
          throw err;
        },
        onLegacyAuth: async () => {},
      },
      fakeClient,
    );

    expect(getActiveAuthView()).toBe("character");
  });
});
