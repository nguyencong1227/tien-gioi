import {
  AUTH_API,
  parseAuthError,
  validatePassword,
  validateUsername,
  cleanName,
  type AuthErrorBody,
  type CharacterReq,
  type ClaimReq,
  type LoginReq,
  type LoginRes,
  type MeRes,
  type RecoverReq,
  type RecoverRes,
  type RegisterReq,
  type RegisterRes,
} from "@tien-gioi/shared";

export const TOKEN_KEY = "tien-gioi:token";

let memStorage: Record<string, string> = {};

function getStorage(custom?: Storage): Storage | null {
  if (custom) return custom;
  if (typeof localStorage !== "undefined") return localStorage;
  return {
    getItem: (k: string) => memStorage[k] ?? null,
    setItem: (k: string, v: string) => {
      memStorage[k] = String(v);
    },
    removeItem: (k: string) => {
      delete memStorage[k];
    },
    clear: () => {
      memStorage = {};
    },
    key: () => null,
    length: Object.keys(memStorage).length,
  };
}

export function getToken(storage?: Storage): string | null {
  try {
    return getStorage(storage)?.getItem(TOKEN_KEY) ?? null;
  } catch {
    return null;
  }
}

export function setToken(token: string, storage?: Storage): void {
  try {
    getStorage(storage)?.setItem(TOKEN_KEY, token);
  } catch {
    /* bỏ qua lỗi quota hoặc permission */
  }
}

export function clearToken(storage?: Storage): void {
  try {
    getStorage(storage)?.removeItem(TOKEN_KEY);
  } catch {
    /* bỏ qua lỗi storage */
  }
}

/** Chuyển đổi mã lỗi API sang thông báo tiếng Việt thân thiện, an toàn */
export function authErrorMessage(
  body: AuthErrorBody | null,
  fallback = "Đã xảy ra lỗi. Vui lòng thử lại.",
): string {
  if (!body) return fallback;
  switch (body.error) {
    case "bad_credentials":
      return "Tên đăng nhập, mật khẩu hoặc mã khôi phục không chính xác.";
    case "username_taken":
      return "Tên đăng nhập này đã được sử dụng. Vui lòng chọn tên khác.";
    case "username_invalid":
      return "Tên đăng nhập chỉ gồm 3–20 ký tự (chữ thường a-z, số 0-9, gạch dưới _).";
    case "weak_password":
      return "Mật khẩu quá ngắn (tối thiểu 8 ký tự) hoặc quá dễ đoán.";
    case "rate_limited": {
      const wait = body.retryAfterS ? `${body.retryAfterS} giây` : "ít phút";
      return `Thao tác quá nhanh. Vui lòng đợi ${wait} rồi thử lại.`;
    }
    case "unauthorized":
      return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    case "already_online":
      return "Tài khoản hiện đang đăng nhập ở nơi khác.";
    case "name_taken":
      return "Đạo hiệu này đã có người sử dụng. Vui lòng chọn đạo hiệu khác.";
    case "name_invalid":
      return "Đạo hiệu không hợp lệ (cần 2–16 ký tự chữ, số hoặc khoảng trắng).";
    case "has_character":
      return "Tài khoản này đã có đạo hiệu nhân vật.";
    case "need_character":
      return "Tài khoản chưa có nhân vật. Vui lòng chọn đạo hiệu trước khi nhập thế.";
    case "not_found":
      return "Không tìm thấy nhân vật cũ hoặc mã bí mật không khớp.";
    case "invalid":
      return "Dữ liệu gửi lên không hợp lệ.";
    default:
      return fallback;
  }
}

/** Dịch lý do kiểm tra tên đăng nhập phía client */
export function usernameReasonMessage(reason: "type" | "length" | "chars"): string {
  switch (reason) {
    case "length":
      return "Tên đăng nhập phải dài từ 3 đến 20 ký tự.";
    case "chars":
      return "Tên đăng nhập chỉ gồm chữ thường a-z, số 0-9 và gạch dưới (_).";
    default:
      return "Tên đăng nhập không hợp lệ.";
  }
}

/** Dịch lý do kiểm tra mật khẩu phía client */
export function passwordReasonMessage(
  reason: "type" | "short" | "long" | "same_as_username" | "common",
): string {
  switch (reason) {
    case "short":
      return "Mật khẩu phải có ít nhất 8 ký tự.";
    case "long":
      return "Mật khẩu không được dài quá 128 ký tự.";
    case "same_as_username":
      return "Mật khẩu không được trùng với tên đăng nhập.";
    case "common":
      return "Mật khẩu này quá phổ biến, dễ đoán. Vui lòng chọn mật khẩu an toàn hơn.";
    default:
      return "Mật khẩu không hợp lệ.";
  }
}

/** Định dạng mã khôi phục thành từng nhóm 4 ký tự dễ nhìn (vd: ABCD-EFGH-JKMN-PQRT) */
export function formatRecoveryCode(code: string): string {
  const clean = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const chunks: string[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    chunks.push(clean.slice(i, i + 4));
  }
  return chunks.join("-");
}

function getHttpBaseUrl(): string {
  const env = import.meta.env?.VITE_SERVER_URL as string | undefined;
  if (env) {
    return env.replace(/^ws(s?):/, "http$1:");
  }
  if (typeof location === "undefined") {
    return "http://localhost:2567";
  }
  const proto = location.protocol === "https:" ? "https" : "http";
  const port = typeof __SERVER_PORT__ !== "undefined" ? __SERVER_PORT__ : 2567;
  return import.meta.env?.DEV
    ? `${proto}://${location.hostname}:${port}`
    : `${proto}://${location.host}`;
}

// ==========================================
// Mock Auth Provider cho DEV & Kiểm thử giao diện
// ==========================================
interface MockAccount {
  username: string;
  passwordHash: string;
  recoveryCode: string;
  name?: string;
  token: string;
}

const mockAccounts = new Map<string, MockAccount>();
let mockEnabled = false;

export function setMockAuthEnabled(enabled: boolean) {
  mockEnabled = enabled;
}

export function isMockAuthEnabled(): boolean {
  return mockEnabled;
}

function generateMockRecoveryCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let res = "";
  for (let i = 0; i < 16; i++) {
    res += chars[Math.floor(Math.random() * chars.length)];
  }
  return res;
}

async function handleMockApi<T>(path: string, options: RequestInit): Promise<T> {
  await new Promise((r) => setTimeout(r, 80)); // Giả lập độ trễ mạng nhỏ
  const body = options.body ? JSON.parse(options.body as string) : {};

  if (path === AUTH_API.register) {
    const { username, password } = body as RegisterReq;
    const uCheck = validateUsername(username);
    if (!uCheck.ok) throw { error: "username_invalid" };
    const pCheck = validatePassword(password, username);
    if (!pCheck.ok) throw { error: "weak_password" };
    if (mockAccounts.has(uCheck.value)) throw { error: "username_taken" };

    const token = `mock_token_${uCheck.value}_${Date.now()}`;
    const recoveryCode = generateMockRecoveryCode();
    mockAccounts.set(uCheck.value, {
      username: uCheck.value,
      passwordHash: password,
      recoveryCode,
      token,
    });
    return { token, recoveryCode } as T;
  }

  if (path === AUTH_API.login) {
    const { username, password } = body as LoginReq;
    const uCheck = validateUsername(username);
    if (!uCheck.ok) throw { error: "bad_credentials" };
    const acc = mockAccounts.get(uCheck.value);
    if (!acc || acc.passwordHash !== password) throw { error: "bad_credentials" };

    const token = `mock_token_${acc.username}_${Date.now()}`;
    acc.token = token;
    return { token } as T;
  }

  if (path === AUTH_API.logout) {
    return {} as T;
  }

  if (path === AUTH_API.me) {
    const authHeader = (options.headers as Record<string, string>)?.["Authorization"];
    const token = authHeader?.replace(/^Bearer\s+/, "");
    if (!token) throw { error: "unauthorized" };
    const acc = Array.from(mockAccounts.values()).find((a) => a.token === token);
    if (!acc) throw { error: "unauthorized" };
    return {
      username: acc.username,
      hasCharacter: Boolean(acc.name),
      name: acc.name,
    } as T;
  }

  if (path === AUTH_API.character) {
    const authHeader = (options.headers as Record<string, string>)?.["Authorization"];
    const token = authHeader?.replace(/^Bearer\s+/, "");
    const acc = Array.from(mockAccounts.values()).find((a) => a.token === token);
    if (!acc) throw { error: "unauthorized" };
    if (acc.name) throw { error: "has_character" };

    const name = cleanName(body.name);
    if (!name) throw { error: "name_invalid" };
    // Kiểm tra trùng đạo hiệu
    const nameUsed = Array.from(mockAccounts.values()).some((a) => a.name === name);
    if (nameUsed) throw { error: "name_taken" };

    acc.name = name;
    return {} as T;
  }

  if (path === AUTH_API.claim) {
    const authHeader = (options.headers as Record<string, string>)?.["Authorization"];
    const token = authHeader?.replace(/^Bearer\s+/, "");
    const acc = Array.from(mockAccounts.values()).find((a) => a.token === token);
    if (!acc) throw { error: "unauthorized" };
    if (acc.name) throw { error: "has_character" };

    const name = cleanName(body.name);
    if (!name || !body.secret) throw { error: "not_found" };
    acc.name = name;
    return {} as T;
  }

  if (path === AUTH_API.recover) {
    const { username, recoveryCode, newPassword } = body as RecoverReq;
    const uCheck = validateUsername(username);
    if (!uCheck.ok) throw { error: "bad_credentials" };
    const acc = mockAccounts.get(uCheck.value);
    const cleanRec = recoveryCode.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (!acc || acc.recoveryCode.toUpperCase() !== cleanRec) {
      throw { error: "bad_credentials" };
    }
    const pCheck = validatePassword(newPassword, username);
    if (!pCheck.ok) throw { error: "weak_password" };

    acc.passwordHash = newPassword;
    acc.recoveryCode = generateMockRecoveryCode();
    acc.token = `mock_token_${acc.username}_${Date.now()}`;
    return { token: acc.token, recoveryCode: acc.recoveryCode } as T;
  }

  throw { error: "invalid" };
}

// ==========================================
// Client API Service
// ==========================================
export class AuthClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? getHttpBaseUrl();
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    if (mockEnabled) {
      return handleMockApi<T>(path, options);
    }

    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    try {
      const res = await fetch(url, { ...options, headers });
      if (res.ok) {
        if (res.status === 204) return {} as T;
        return (await res.json()) as T;
      }

      // Đọc thân lỗi có cấu trúc
      let errorBody: AuthErrorBody | null = null;
      try {
        const json = await res.json();
        errorBody = parseAuthError(json);
      } catch {
        /* phản hồi không phải JSON hợp lệ */
      }

      if (errorBody) {
        throw errorBody;
      }
      throw { error: "invalid" as const };
    } catch (err: any) {
      if (err?.error) throw err;
      // Nếu server chưa có API (404/ECONNREFUSED) và đang ở DEV, tự động fallback sang Mock
      if (import.meta.env.DEV) {
        console.warn(
          `[AuthClient] API ${path} chưa khả dụng trên server, tự động kích hoạt Mock Auth.`,
        );
        mockEnabled = true;
        return handleMockApi<T>(path, options);
      }
      throw { error: "invalid" as const };
    }
  }

  async register(req: RegisterReq): Promise<RegisterRes> {
    return this.request<RegisterRes>(AUTH_API.register, {
      method: "POST",
      body: JSON.stringify(req),
    });
  }

  async login(req: LoginReq): Promise<LoginRes> {
    return this.request<LoginRes>(AUTH_API.login, {
      method: "POST",
      body: JSON.stringify(req),
    });
  }

  async logout(token: string): Promise<void> {
    return this.request<void>(AUTH_API.logout, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async me(token: string): Promise<MeRes> {
    return this.request<MeRes>(AUTH_API.me, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async createCharacter(token: string, req: CharacterReq): Promise<void> {
    return this.request<void>(AUTH_API.character, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(req),
    });
  }

  async claimCharacter(token: string, req: ClaimReq): Promise<void> {
    return this.request<void>(AUTH_API.claim, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(req),
    });
  }

  async recover(req: RecoverReq): Promise<RecoverRes> {
    return this.request<RecoverRes>(AUTH_API.recover, {
      method: "POST",
      body: JSON.stringify(req),
    });
  }
}

export const authClient = new AuthClient();
