// Phiên bản giao thức phía server (M4 2.5, hợp đồng ở shared/src/protocol.ts): mức tối thiểu server còn nhận, đọc từ môi trường.
import { MIN_PROTOCOL_VERSION, PROTOCOL_VERSION } from "@tien-gioi/shared";

export interface MinProtocol {
  /** Mức tối thiểu hiệu lực: `MIN_PROTOCOL_VERSION` <= giá trị <= `PROTOCOL_VERSION`. */
  value: number;
  /** Cảnh báo khi cấu hình sai (rỗng nếu ổn); in lúc khởi động (`startup.ts`). */
  warnings: string[];
}

/**
 * Mức tối thiểu server còn nhận (`MIN_PROTOCOL_VERSION` trong môi trường, mặc định lấy từ `shared/`). Người vận hành nâng số này
 * khi cố ý ngừng hỗ trợ client cũ: từ đó client / bot / công cụ không gửi `v` (coi là 0) hoặc gửi số thấp hơn bị từ chối bằng
 * `JOIN_CLIENT_OUTDATED`. Không đặt thấp hơn mức của `shared/`; đặt CAO hơn `PROTOCOL_VERSION` của chính bản server này thì kẹp
 * về `PROTOCOL_VERSION` (nếu không, mọi client, kể cả bản mới nhất, đều bị từ chối), kèm cảnh báo. Giá trị không phải số nguyên
 * không âm bị bỏ qua, kèm cảnh báo.
 */
export function minProtocolOf(env: NodeJS.ProcessEnv): MinProtocol {
  const raw = env.MIN_PROTOCOL_VERSION;
  if (raw === undefined || raw.trim() === "") return { value: MIN_PROTOCOL_VERSION, warnings: [] };
  const text = raw.trim();
  if (!/^\d{1,9}$/.test(text)) {
    return {
      value: MIN_PROTOCOL_VERSION,
      warnings: [
        `MIN_PROTOCOL_VERSION='${raw}' không phải số nguyên không âm: bỏ qua, dùng ${MIN_PROTOCOL_VERSION}.`,
      ],
    };
  }
  const n = Number(text);
  if (n > PROTOCOL_VERSION) {
    return {
      value: PROTOCOL_VERSION,
      warnings: [
        `MIN_PROTOCOL_VERSION=${n} cao hơn phiên bản giao thức của bản server này (${PROTOCOL_VERSION}): kẹp về ${PROTOCOL_VERSION} ` +
          "(đặt cao hơn sẽ từ chối cả client mới nhất).",
      ],
    };
  }
  return { value: Math.max(MIN_PROTOCOL_VERSION, n), warnings: [] };
}
