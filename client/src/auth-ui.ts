import { cleanName, validatePassword, validateUsername } from "@tien-gioi/shared";
import {
  authClient,
  authErrorMessage,
  clearToken,
  formatRecoveryCode,
  getToken,
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

let activeView: AuthView = "login";
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
  const el = document.getElementById(elId);
  if (el) el.textContent = msg;
}

function clearAllErrors() {
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

export function initAuthUi(callbacks: AuthUiCallbacks) {
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

  // 3. Form Đăng Nhập
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

      const me = await authClient.me(res.token);
      if (me.hasCharacter && me.name) {
        await callbacks.onTokenAuth(res.token, me.name);
      } else {
        switchAuthView("character");
      }
    } catch (err: any) {
      setErr("auth-login-err", authErrorMessage(err));
    } finally {
      loginBtn.disabled = false;
    }
  });

  // 4. Form Đăng Ký
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

  // 5. Màn hình Lưu Mã Khôi Phục
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
  continueBtn.onclick = () => {
    switchAuthView("character");
  };

  // 6. Form Khởi Tạo Đạo Hiệu
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
      await callbacks.onTokenAuth(token, name);
    } catch (err: any) {
      setErr("auth-char-err", authErrorMessage(err));
    } finally {
      charBtn.disabled = false;
    }
  });

  // 7. Form Nhận Nhân Vật Cũ
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
      await callbacks.onTokenAuth(token, name);
    } catch (err: any) {
      setErr("auth-claim-err", authErrorMessage(err));
    } finally {
      claimBtn.disabled = false;
    }
  });

  // 8. Form Quên Mật Khẩu
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

  // 9. Nút Đăng Xuất (trong cài đặt)
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

  // 10. Khởi động kiểm tra token phiên đã có
  const existingToken = getToken();
  if (existingToken) {
    authClient
      .me(existingToken)
      .then(async (me) => {
        updateAccountDisplay(me.username);
        if (me.hasCharacter && me.name) {
          await callbacks.onTokenAuth(existingToken, me.name);
        } else {
          switchAuthView("character");
        }
      })
      .catch(() => {
        clearToken();
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get("legacy") === "1") {
          switchAuthView("legacy");
        } else {
          switchAuthView("login");
        }
      });
  } else {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("legacy") === "1") {
      switchAuthView("legacy");
    } else {
      switchAuthView("login");
    }
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
    };
  }
}
