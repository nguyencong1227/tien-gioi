import {
  cleanName,
  validatePassword,
  validateUsername,
  JOIN_BAD_TOKEN,
  JOIN_NEED_CHARACTER,
} from "@tien-gioi/shared";
import {
  authClient,
  authErrorMessage,
  clearToken,
  detectAuthMode,
  formatRecoveryCode,
  getToken,
  isMockAuthEnabled,
  passwordReasonMessage,
  setToken,
  usernameReasonMessage,
} from "./auth";

export type AuthView =
  "login" | "register" | "recovery" | "character" | "claim" | "forgot" | "legacy";

export interface AuthUiCallbacks {
  onTokenAuth: (token: string, name?: string) => Promise<void>;
  onLegacyAuth: (name: string) => Promise<void>;
}

let activeView: AuthView = "legacy";
let currentRecoveryCode = "";
let currentUser = "";

export function getCurrentUser(): string {
  return currentUser;
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}

function setErr(elId: string, msg: string) {
  if (typeof document === "undefined") return;
  const el = document.getElementById(elId);
  if (el) el.textContent = msg;
}

function clearAllErrors() {
  if (typeof document === "undefined") return;
  for (const id of [
    "auth-login-err",
    "auth-reg-err",
    "auth-char-err",
    "auth-claim-err",
    "auth-forgot-err",
    "login-err",
  ]) {
    const el = document.getElementById(id);
    if (el) el.textContent = "";
  }
}

export function switchAuthView(view: AuthView) {
  activeView = view;
  if (typeof document === "undefined") return;
  clearAllErrors();

  const viewIds: Record<AuthView, string> = {
    login: "auth-view-login",
    register: "auth-view-register",
    recovery: "auth-view-recovery",
    character: "auth-view-character",
    claim: "auth-view-claim",
    forgot: "auth-view-forgot",
    legacy: "auth-view-legacy",
  };

  for (const [k, id] of Object.entries(viewIds)) {
    const el = document.getElementById(id);
    if (el) el.hidden = k !== view;
  }

  // Điền sẵn thông tin nhân vật cũ nếu vào view claim
  if (view === "claim") {
    const nameInput = document.getElementById("auth-claim-name") as HTMLInputElement | null;
    const secInput = document.getElementById("auth-claim-secret") as HTMLInputElement | null;
    if (nameInput && !nameInput.value) {
      nameInput.value = localStorage.getItem("tien-gioi:name") || "";
    }
    if (secInput && !secInput.value) {
      secInput.value = localStorage.getItem("tien-gioi:secret") || "";
    }
  }
}

export function getActiveAuthView(): AuthView {
  return activeView;
}

export function updateAccountDisplay(username: string) {
  currentUser = username;
  if (typeof document === "undefined") return;
  const badge = document.getElementById("set-account-username");
  if (badge) badge.textContent = username;
}

function setupPasswordToggle(inputEl: HTMLInputElement, toggleBtn: HTMLButtonElement) {
  toggleBtn.addEventListener("click", () => {
    const isPass = inputEl.type === "password";
    inputEl.type = isPass ? "text" : "password";
    toggleBtn.textContent = isPass ? "🙈" : "👁";
  });
}

function extractJoinErrorMessage(err: any): string {
  if (err?.message && !/^\d+$/.test(err.message)) {
    return err.message;
  }
  return "Không thể kết nối vào phòng game.";
}

export interface PostAuthDestination {
  view: "game" | "character";
  name?: string;
}

/**
 * Xác định màn hình tiếp theo sau khi đã có token phiên (đăng nhập, khôi phục mật khẩu, mở lại trang):
 * - Nếu tài khoản ĐÃ có nhân vật (`hasCharacter && name`): vào thẳng game với đạo hiệu đó.
 * - Nếu tài khoản CHƯA có nhân vật: tới màn hình Khởi Tạo Đạo Hiệu (`character`).
 */
export function decidePostAuthDestination(me: {
  hasCharacter: boolean;
  name?: string;
}): PostAuthDestination {
  if (me.hasCharacter && me.name) {
    return { view: "game", name: me.name };
  }
  return { view: "character" };
}

/**
 * Vào game hoặc điều hướng sau khi đã có token phiên (đăng nhập, khôi phục mật khẩu, mở lại tab):
 * Hỏi `client.me(token)`:
 * - Đã có nhân vật -> gọi `callbacks.onTokenAuth(token, me.name)`.
 * - Chưa có nhân vật -> chuyển sang view `character`.
 * Xử lý lỗi:
 * - `JOIN_BAD_TOKEN` hoặc `unauthorized`: xoá token, về view `login`, báo hết hạn phiên.
 * - Lỗi join khác (409 already_online, phòng đầy...): giữ token, về view `login`, hiện rõ lý do.
 * - Lỗi mạng / server không phản hồi: giữ token, về view `login`, hiện thông báo kết nối.
 */
export async function enterWithToken(
  token: string,
  callbacks: AuthUiCallbacks,
  client = authClient,
): Promise<void> {
  try {
    const me = await client.me(token);
    updateAccountDisplay(me.username);
    const dest = decidePostAuthDestination(me);
    if (dest.view === "game" && dest.name) {
      try {
        await callbacks.onTokenAuth(token, dest.name);
      } catch (joinErr: any) {
        if (joinErr?.code === JOIN_BAD_TOKEN) {
          clearToken();
          switchAuthView("login");
          setErr("auth-login-err", "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
        } else if (joinErr?.code === JOIN_NEED_CHARACTER) {
          switchAuthView("character");
        } else {
          // Lỗi join khác (already_online, phòng đầy, mạng...): GIỮ token, hiện thông báo
          switchAuthView("login");
          const msg = extractJoinErrorMessage(joinErr);
          setErr("auth-login-err", `${msg} (Vui lòng bấm Đăng Nhập để thử lại)`);
        }
      }
    } else {
      switchAuthView("character");
    }
  } catch (meErr: any) {
    if (meErr?.error === "unauthorized") {
      clearToken();
      switchAuthView("login");
      setErr("auth-login-err", "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.");
    } else {
      // Lỗi mạng hoặc server không phản hồi: GIỮ token
      switchAuthView("login");
      setErr("auth-login-err", "Không kết nối được máy chủ xác thực. Vui lòng thử lại sau.");
    }
  }
}

export async function initAuthUi(callbacks: AuthUiCallbacks): Promise<void> {
  // 1. Toggle mật khẩu
  const loginPass = $("auth-login-pass") as HTMLInputElement;
  const loginPassToggle = $("auth-login-pass-toggle") as HTMLButtonElement;
  setupPasswordToggle(loginPass, loginPassToggle);

  const regPass = $("auth-reg-pass") as HTMLInputElement;
  const regPassToggle = $("auth-reg-pass-toggle") as HTMLButtonElement;
  setupPasswordToggle(regPass, regPassToggle);

  const forgotPass = $("auth-forgot-pass") as HTMLInputElement;
  const forgotPassToggle = $("auth-forgot-pass-toggle") as HTMLButtonElement;
  setupPasswordToggle(forgotPass, forgotPassToggle);

  // 2. Chuyển đổi giữa các view
  $("link-to-register").onclick = () => switchAuthView("register");
  $("link-to-login").onclick = () => switchAuthView("login");
  $("link-to-forgot").onclick = () => switchAuthView("forgot");
  $("link-forgot-to-login").onclick = () => switchAuthView("login");
  $("link-to-legacy").onclick = () => switchAuthView("legacy");
  $("link-legacy-to-account").onclick = () => switchAuthView("login");
  $("link-to-claim").onclick = () => switchAuthView("claim");
  $("link-back-to-char").onclick = () => switchAuthView("character");

  // 3. Form Legacy (Đạo hiệu trực tiếp cũ)
  const legacyForm = document.getElementById("login-form") as HTMLFormElement | null;
  const legacyName = document.getElementById("login-name") as HTMLInputElement | null;
  const legacyBtn = document.getElementById("login-btn") as HTMLButtonElement | null;
  const legacyErr = document.getElementById("login-err");

  if (legacyForm && legacyName && legacyBtn) {
    legacyForm.onsubmit = async (e) => {
      e.preventDefault();
      const raw = legacyName.value.trim();
      if (!raw) return;
      legacyBtn.disabled = true;
      if (legacyErr) legacyErr.textContent = "";
      try {
        await callbacks.onLegacyAuth(raw);
      } catch (err: any) {
        if (legacyErr) {
          legacyErr.textContent = extractJoinErrorMessage(err);
        }
      } finally {
        legacyBtn.disabled = false;
      }
    };
  }

  // 4. Form Đăng Nhập
  const loginForm = $("auth-login-form") as HTMLFormElement;
  const loginBtn = $("auth-login-btn") as HTMLButtonElement;
  const loginUser = $("auth-login-user") as HTMLInputElement;

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    setErr("auth-login-err", "");
    const username = loginUser.value.trim();
    const password = loginPass.value;

    const uCheck = validateUsername(username);
    if (!uCheck.ok) {
      setErr("auth-login-err", usernameReasonMessage(uCheck.reason));
      return;
    }
    const pCheck = validatePassword(password, username);
    if (!pCheck.ok) {
      setErr("auth-login-err", passwordReasonMessage(pCheck.reason));
      return;
    }

    loginBtn.disabled = true;
    try {
      const res = await authClient.login({ username: uCheck.value, password });
      setToken(res.token);
      updateAccountDisplay(uCheck.value);

      await enterWithToken(res.token, callbacks);
    } catch (err: any) {
      setErr("auth-login-err", authErrorMessage(err));
    } finally {
      loginBtn.disabled = false;
    }
  });

  // 5. Form Đăng Ký
  const regForm = $("auth-reg-form") as HTMLFormElement;
  const regBtn = $("auth-reg-btn") as HTMLButtonElement;
  const regUser = $("auth-reg-user") as HTMLInputElement;

  regForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    setErr("auth-reg-err", "");
    const username = regUser.value.trim();
    const password = regPass.value;

    const uCheck = validateUsername(username);
    if (!uCheck.ok) {
      setErr("auth-reg-err", usernameReasonMessage(uCheck.reason));
      return;
    }
    const pCheck = validatePassword(password, username);
    if (!pCheck.ok) {
      setErr("auth-reg-err", passwordReasonMessage(pCheck.reason));
      return;
    }

    regBtn.disabled = true;
    try {
      const res = await authClient.register({ username: uCheck.value, password });
      setToken(res.token);
      updateAccountDisplay(uCheck.value);

      currentRecoveryCode = res.recoveryCode;
      $("auth-recovery-code-val").textContent = formatRecoveryCode(res.recoveryCode);
      const confirmCb = $("auth-recovery-confirm-cb") as HTMLInputElement;
      confirmCb.checked = false;
      const continueBtn = $("auth-recovery-continue-btn") as HTMLButtonElement;
      continueBtn.disabled = true;

      switchAuthView("recovery");
    } catch (err: any) {
      setErr("auth-reg-err", authErrorMessage(err));
    } finally {
      regBtn.disabled = false;
    }
  });

  // 6. Màn hình Lưu Mã Khôi Phục
  const copyBtn = $("auth-copy-code-btn") as HTMLButtonElement;
  copyBtn.onclick = async () => {
    if (!currentRecoveryCode) return;
    try {
      await navigator.clipboard.writeText(currentRecoveryCode);
      const oldText = copyBtn.textContent;
      copyBtn.textContent = "✓ Đã sao chép";
      setTimeout(() => {
        copyBtn.textContent = oldText;
      }, 2000);
    } catch {
      copyBtn.textContent = "Không thể copy";
    }
  };

  const confirmCb = $("auth-recovery-confirm-cb") as HTMLInputElement;
  const continueBtn = $("auth-recovery-continue-btn") as HTMLButtonElement;
  confirmCb.onchange = () => {
    continueBtn.disabled = !confirmCb.checked;
  };
  continueBtn.onclick = async () => {
    const token = getToken();
    if (!token) {
      switchAuthView("login");
      return;
    }
    continueBtn.disabled = true;
    try {
      await enterWithToken(token, callbacks);
    } finally {
      if (getActiveAuthView() === "recovery") {
        continueBtn.disabled = !confirmCb.checked;
      }
    }
  };

  // 7. Form Khởi Tạo Đạo Hiệu
  const charForm = $("auth-char-form") as HTMLFormElement;
  const charBtn = $("auth-char-btn") as HTMLButtonElement;
  const charInput = $("auth-char-name") as HTMLInputElement;

  charForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    setErr("auth-char-err", "");
    const raw = charInput.value;
    const name = cleanName(raw);
    if (!name) {
      setErr("auth-char-err", "Đạo hiệu phải từ 2–16 ký tự chữ, số hoặc khoảng trắng.");
      return;
    }

    const token = getToken();
    if (!token) {
      switchAuthView("login");
      return;
    }

    charBtn.disabled = true;
    try {
      await authClient.createCharacter(token, { name });
      localStorage.setItem("tien-gioi:name", name);
      try {
        await callbacks.onTokenAuth(token, name);
      } catch (joinErr: any) {
        setErr("auth-char-err", extractJoinErrorMessage(joinErr));
      }
    } catch (err: any) {
      setErr("auth-char-err", authErrorMessage(err));
    } finally {
      charBtn.disabled = false;
    }
  });

  // 8. Form Nhận Nhân Vật Cũ
  const claimForm = $("auth-claim-form") as HTMLFormElement;
  const claimBtn = $("auth-claim-btn") as HTMLButtonElement;
  const claimNameInput = $("auth-claim-name") as HTMLInputElement;
  const claimSecretInput = $("auth-claim-secret") as HTMLInputElement;

  claimForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    setErr("auth-claim-err", "");
    const name = cleanName(claimNameInput.value);
    const secret = claimSecretInput.value.trim();

    if (!name || !secret) {
      setErr("auth-claim-err", "Vui lòng nhập đầy đủ đạo hiệu và mã bí mật cũ.");
      return;
    }

    const token = getToken();
    if (!token) {
      switchAuthView("login");
      return;
    }

    claimBtn.disabled = true;
    try {
      await authClient.claimCharacter(token, { name, secret });
      localStorage.setItem("tien-gioi:name", name);
      localStorage.setItem("tien-gioi:secret", secret);
      try {
        await callbacks.onTokenAuth(token, name);
      } catch (joinErr: any) {
        setErr("auth-claim-err", extractJoinErrorMessage(joinErr));
      }
    } catch (err: any) {
      setErr("auth-claim-err", authErrorMessage(err));
    } finally {
      claimBtn.disabled = false;
    }
  });

  // 9. Form Quên Mật Khẩu
  const forgotForm = $("auth-forgot-form") as HTMLFormElement;
  const forgotBtn = $("auth-forgot-btn") as HTMLButtonElement;
  const forgotUser = $("auth-forgot-user") as HTMLInputElement;
  const forgotCode = $("auth-forgot-code") as HTMLInputElement;

  forgotForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    setErr("auth-forgot-err", "");
    const username = forgotUser.value.trim();
    const recoveryCode = forgotCode.value.trim();
    const newPassword = forgotPass.value;

    const uCheck = validateUsername(username);
    if (!uCheck.ok) {
      setErr("auth-forgot-err", usernameReasonMessage(uCheck.reason));
      return;
    }
    const pCheck = validatePassword(newPassword, username);
    if (!pCheck.ok) {
      setErr("auth-forgot-err", passwordReasonMessage(pCheck.reason));
      return;
    }

    forgotBtn.disabled = true;
    try {
      const res = await authClient.recover({
        username: uCheck.value,
        recoveryCode,
        newPassword,
      });
      setToken(res.token);
      updateAccountDisplay(uCheck.value);

      currentRecoveryCode = res.recoveryCode;
      $("auth-recovery-code-val").textContent = formatRecoveryCode(res.recoveryCode);
      const confirmCb = $("auth-recovery-confirm-cb") as HTMLInputElement;
      confirmCb.checked = false;
      const continueBtn = $("auth-recovery-continue-btn") as HTMLButtonElement;
      continueBtn.disabled = true;

      switchAuthView("recovery");
    } catch (err: any) {
      setErr("auth-forgot-err", authErrorMessage(err));
    } finally {
      forgotBtn.disabled = false;
    }
  });

  // 10. Nút Đăng Xuất (trong cài đặt)
  const logoutBtn = document.getElementById("btn-logout");
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      const token = getToken();
      if (token) {
        try {
          await authClient.logout(token);
        } catch {
          /* bỏ qua lỗi mạng khi đăng xuất */
        }
      }
      clearToken();
      updateAccountDisplay("");
      location.reload();
    };
  }

  // 11. Phát hiện chế độ xác thực và khởi động
  const mode = await detectAuthMode();
  const legacyLinkSub = document.getElementById("auth-links-legacy-sub");
  const legacyToAccountBtn = document.getElementById("link-legacy-to-account");
  const mockBadge = document.getElementById("auth-mock-badge");

  if (mockBadge) {
    mockBadge.hidden = !isMockAuthEnabled();
  }

  if (mode === "legacy") {
    // Chế độ legacy mặc định: hiện ô tên cũ, ẩn mọi link sang tài khoản
    if (legacyToAccountBtn) legacyToAccountBtn.hidden = true;
    if (legacyLinkSub) legacyLinkSub.hidden = true;
    switchAuthView("legacy");
    return;
  }

  // Chế độ tài khoản: ẩn link sang legacy
  if (legacyLinkSub) legacyLinkSub.hidden = true;
  if (legacyToAccountBtn) legacyToAccountBtn.hidden = true;

  const existingToken = getToken();
  if (existingToken) {
    await enterWithToken(existingToken, callbacks);
  } else {
    switchAuthView("login");
  }

  // Debug Hook
  if (
    typeof window !== "undefined" &&
    (import.meta.env.DEV || new URLSearchParams(window.location.search).has("debug"))
  ) {
    (window as any).__authUi = {
      switchView: switchAuthView,
      getView: getActiveAuthView,
      authClient,
      authErrorMessage,
      decidePostAuthDestination,
      enterWithToken,
    };
  }
}
