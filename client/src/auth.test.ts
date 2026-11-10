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
