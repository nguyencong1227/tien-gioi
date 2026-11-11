/** Cổng dành riêng cho bản chạy thật production */
export const PROD_PORT = 2567;

/** Tên miền chính thức của bản chạy thật (Cloudflare Tunnel) */
export const PROD_DOMAIN = "tiengioi.hethongtm.site";

/** Tên thư mục dành riêng cho bản chạy thật trên máy chủ */
export const PROD_DIR_NAME = "tien-gioi-prod";

/**
 * Hàng rào bảo vệ cho môi trường dev / test / bot (M4 3.6, Issue #299):
 * Ngăn chặn tuyệt đối việc các công cụ phát triển cục bộ vô tình kết nối tới cổng 2567,
 * tên miền production, hoặc ghi đè vào thư mục dữ liệu thật ~/TT/tien-gioi-prod.
 */
export function assertNotProd(
  target: string | number | null | undefined,
  context: string = "công cụ dev",
): void {
  if (target === undefined || target === null) return;

  const str = String(target).trim();

  // 1. Kiểm tra cổng 2567 (dạng số hoặc trong chuỗi URL/host)
  if (typeof target === "number" && target === PROD_PORT) {
    throw new Error(
      `[HÀNG RÀO BẢO VỆ] ${context}: Từ chối kết nối tới cổng ${PROD_PORT} (dành riêng cho bản chạy thật production). ` +
        "Hãy dùng cổng riêng của dev (2577, 2587...) trong file .env.local.",
    );
  }

  // Nếu là chuỗi số đơn thuần: "2567"
  if (/^\d+$/.test(str) && Number(str) === PROD_PORT) {
    throw new Error(
      `[HÀNG RÀO BẢO VỆ] ${context}: Từ chối kết nối tới cổng ${PROD_PORT} (dành riêng cho bản chạy thật production). ` +
        "Hãy dùng cổng riêng của dev (2577, 2587...) trong file .env.local.",
    );
  }

  // Nếu là URL hoặc host:port chứa ":2567"
  if (/(?::2567(?:\/|$|\?))/.test(str)) {
    throw new Error(
      `[HÀNG RÀO BẢO VỆ] ${context}: Từ chối URL/địa chỉ '${str}' chứa cổng ${PROD_PORT} (dành riêng cho bản chạy thật).`,
    );
  }

  // 2. Kiểm tra tên miền production
  if (str.toLowerCase().includes(PROD_DOMAIN.toLowerCase())) {
    throw new Error(
      `[HÀNG RÀO BẢO VỆ] ${context}: Từ chối kết nối tới tên miền sản xuất '${PROD_DOMAIN}'. ` +
        "Công cụ dev chỉ được kết nối tới localhost hoặc môi trường test.",
    );
  }

  // 3. Kiểm tra đường dẫn thư mục dữ liệu sản xuất
  if (str.includes(PROD_DIR_NAME)) {
    throw new Error(
      `[HÀNG RÀO BẢO VỆ] ${context}: Từ chối thao tác trên đường dẫn thư mục sản xuất '${str}'. ` +
        "Dữ liệu bản thật tại ~/TT/tien-gioi-prod/ được bảo vệ nghiêm ngặt.",
    );
  }
}
