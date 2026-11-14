/**
 * Kiểu thị giác theo bản đồ (M5.3, #332, `docs/THIET_KE_GIAO_DIEN_DO_HOA.md` mục 9).
 *
 * DỮ LIỆU THUẦN, khoá theo `MapDef.id`: bảng màu, mật độ trang trí, màu môi trường / vignette / sương, thời tiết, nước.
 * Không đụng Phaser, không đọc hồ sơ chất lượng: lớp vẽ (`WorldScene`) lấy kiểu ở đây rồi tự hạ theo `getQuality()`
 * (`ambient` / `vignette` / `fogPatches` / `weather`). Thêm bản đồ mới = thêm một mục vào `MAP_STYLES` (test bắt thiếu).
 *
 * Trang trí là THUẦN THỊ GIÁC: sinh từ `seed` + `mapId` của `shared/` nên mọi người thấy giống nhau mà không đồng bộ gì
 * (xem `map-decor.ts`); không đổi `shared/src/map.ts`, không đổi giao thức.
 */

/** Loại trang trí (mục 9: cỏ cao, hoa, đá, nấm, bụi cây). Thứ tự này cũng là thứ tự khung trong tileset trang trí. */
export const DECOR_KINDS = ["tuft", "flower", "pebble", "mushroom", "bush"] as const;
export type DecorKind = (typeof DECOR_KINDS)[number];

/** Mỗi loại có 2 biến thể (khung = chỉ số loại * 2 + biến thể): tổng số khung của tileset trang trí. */
export const DECOR_VARIANTS = 2;
export const DECOR_FRAMES = DECOR_KINDS.length * DECOR_VARIANTS;

/** Thời tiết bằng hạt (chỉ khi hồ sơ chất lượng `weather != "off"`). */
export type WeatherKind = "none" | "petals" | "ash" | "spirit" | "wisp" | "snow";

export interface MapStyle {
  /** Nhãn cho log / doc. */
  readonly label: string;
  /** Màu môi trường phủ lên cảnh (một sprite gradient, chỉ khi `ambient`); `alpha` 0..1. */
  readonly ambient: { readonly color: number; readonly alpha: number };
  /** Vignette (tối dần ra mép màn hình, chỉ khi `vignette`); `strength` 0..1. */
  readonly vignette: { readonly color: number; readonly strength: number };
  /** Sương (số mảng lấy từ hồ sơ `fogPatches`); `speed` px/giây trôi ngang. */
  readonly fog: { readonly color: number; readonly alpha: number; readonly speed: number };
  /** Hạt thời tiết; `rate` hạt/giây ở bậc `full`, bậc `light` một nửa. */
  readonly weather: { readonly kind: WeatherKind; readonly rate: number };
  /** Lấp lánh mặt nước (một TileSprite cuộn). */
  readonly water: {
    readonly shimmer: number;
    readonly alpha: number;
    /** px/giây cuộn. */
    readonly speed: number;
  };
  readonly decor: {
    /** Xác suất mỗi ô phù hợp có loại này (0..1); tổng các loại <= `MAX_DECOR_DENSITY`. Loại vắng = 0. */
    readonly density: Readonly<Partial<Record<DecorKind, number>>>;
    /** Hai màu chính (biến thể 0 và 1) của mỗi loại, để vẽ tileset trang trí bằng mã. */
    readonly palette: Readonly<Record<DecorKind, readonly [number, number]>>;
  };
}

/** Trần tổng mật độ trang trí mỗi ô: quá dày thì thành nhiễu, và `buildDecorGrid` cần tổng * 2 (hệ số đám hoa lớn nhất) <= 1. */
export const MAX_DECOR_DENSITY = 0.5;
/** Trần hạt thời tiết mỗi giây: dưới trần hạt sống của bậc Cao (520) nhân tuổi thọ ngắn của hạt. */
export const MAX_WEATHER_RATE = 40;

const DEFAULT_STYLE: MapStyle = {
  label: "mặc định",
  ambient: { color: 0xfff3d6, alpha: 0.06 },
  vignette: { color: 0x1d1a16, strength: 0.35 },
  fog: { color: 0xeef0e6, alpha: 0.16, speed: 6 },
  weather: { kind: "none", rate: 0 },
  water: { shimmer: 0xe6f3f0, alpha: 0.28, speed: 10 },
  decor: {
    density: { tuft: 0.05, flower: 0.03, pebble: 0.02, mushroom: 0.01, bush: 0.015 },
    palette: {
      tuft: [0x7c9156, 0x6b7f49],
      flower: [0xf0e2a0, 0xe8b6c8],
      pebble: [0xa8a49c, 0x8a867e],
      mushroom: [0xd7b38a, 0xc47a5a],
      bush: [0x5f7a45, 0x4f6838],
    },
  },
};

/**
 * Kiểu của từng bản đồ. Hoàng Tuyền (luân hồi) chưa là bản đồ nên chưa có mục: khi có `MapDef` thì thêm kiểu tím đen
 * (mục 9) và test `mọi bản đồ có kiểu riêng` sẽ nhắc.
 */
export const MAP_STYLES: Readonly<Record<string, MapStyle>> = {
  // Lạc Hà Trấn: ấm, hoa đào rụng
  lac_ha: {
    label: "Lạc Hà (ấm, hoa đào)",
    ambient: { color: 0xffe2b0, alpha: 0.1 },
    vignette: { color: 0x2a1c14, strength: 0.32 },
    fog: { color: 0xfff1e0, alpha: 0.14, speed: 5 },
    weather: { kind: "petals", rate: 7 },
    water: { shimmer: 0xfff4de, alpha: 0.3, speed: 9 },
    decor: {
      density: { tuft: 0.06, flower: 0.055, pebble: 0.015, mushroom: 0.015, bush: 0.02 },
      palette: {
        tuft: [0x86a05a, 0x72894a],
        flower: [0xf6c5d4, 0xfff0d8], // hoa đào hồng + hoa trắng ngà
        pebble: [0xb3aca0, 0x96907f],
        mushroom: [0xe2c299, 0xcf8a66],
        bush: [0x628048, 0x516c3a],
      },
    },
  },
  // Hắc Phong Cốc: tối, gió, tro
  hac_phong: {
    label: "Hắc Phong (tối, tro)",
    ambient: { color: 0x8c93a6, alpha: 0.18 },
    vignette: { color: 0x0b0c10, strength: 0.55 },
    fog: { color: 0xb9bcc6, alpha: 0.22, speed: 14 },
    weather: { kind: "ash", rate: 12 },
    water: { shimmer: 0xcfd6e4, alpha: 0.22, speed: 16 },
    decor: {
      density: { tuft: 0.03, flower: 0.006, pebble: 0.05, mushroom: 0.012, bush: 0.035 },
      palette: {
        tuft: [0x5b6a45, 0x4a5638],
        flower: [0xc9c3d6, 0x8f7f9c], // hoa tro nhạt
        pebble: [0x7c7a78, 0x5f5d5c],
        mushroom: [0xa05a4a, 0x6e3a34],
        bush: [0x3f5238, 0x323f2c], // bụi gai sẫm
      },
    },
  },
  // Linh Hư Bí Cảnh: lam ngọc huyền ảo
  bi_canh_linh_hu: {
    label: "Linh Hư Bí Cảnh (lam ngọc)",
    ambient: { color: 0x7fe3d4, alpha: 0.16 },
    vignette: { color: 0x061a22, strength: 0.5 },
    fog: { color: 0xa8f0e6, alpha: 0.2, speed: 8 },
    weather: { kind: "spirit", rate: 9 },
    water: { shimmer: 0xbffcf2, alpha: 0.34, speed: 12 },
    decor: {
      density: { tuft: 0.025, flower: 0.045, pebble: 0.02, mushroom: 0.05, bush: 0.02 },
      palette: {
        tuft: [0x4f9c8a, 0x3e8676],
        flower: [0x8ff0ff, 0xc8b6ff], // sen ngọc + hoa tím nhạt
        pebble: [0x8fb4b8, 0x6f9498],
        mushroom: [0x7fe3c6, 0x62c4e8], // nấm phát sáng
        bush: [0x3d8f7a, 0x2f7565],
      },
    },
  },
  // Âm Sương Trạch (M6, #408): đầm lầy sương, lục xám ẩm, sương DÀY nhất ba bản đồ, ma trơi vàng lục lơ lửng.
  // Khác Lạc Hà (ấm, hoa đào), Hắc Phong (tối xám xanh, tro) và bí cảnh (lam ngọc, linh khí): bù lại bằng sương dày (không
  // vượt trần 0.4), nước đục (alpha cao, cuộn chậm) và nấm / sen đầm thay cho hoa cỏ.
  am_suong: {
    label: "Âm Sương Trạch (đầm lầy sương)",
    ambient: { color: 0x7c9a76, alpha: 0.2 },
    vignette: { color: 0x0a150e, strength: 0.52 },
    fog: { color: 0xb4c9b6, alpha: 0.34, speed: 9 },
    weather: { kind: "wisp", rate: 8 },
    water: { shimmer: 0xa9c58f, alpha: 0.36, speed: 6 },
    decor: {
      density: { tuft: 0.05, flower: 0.01, pebble: 0.02, mushroom: 0.06, bush: 0.045 },
      palette: {
        tuft: [0x4d6b3c, 0x3f5a32], // cói đầm lục sẫm
        flower: [0xe6d6f0, 0xb4e0c6], // sen đầm tím nhạt + bạc hà
        pebble: [0x6f7a72, 0x56615a], // đá phủ rêu
        mushroom: [0xc9d36a, 0x8fa84a], // nấm vàng lục ẩm
        bush: [0x35502f, 0x2a4126], // bụi lau sậy sẫm
      },
    },
  },
  // Hàn Vân Lĩnh (M7.8, #509; bản đồ thứ tư, `docs/PHAN_CONG_M7.md` mục 8): băng nguyên. Lạnh trắng xanh, sương dày vừa (dưới trần 0,4) trôi chậm, tuyết rơi nhẹ chéo,
  // băng phản chiếu chậm, trang trí thưa (tuyết phủ): cỏ khô, hoa tuyết, đá, nhũ băng thay nấm, tùng sẫm. Khác ba bản đồ ngoài bằng màu (xanh băng, không ấm / xám tro /
  // lục đầm) và bằng loại thời tiết riêng (`snow`).
  han_van: {
    label: "Hàn Vân Lĩnh (băng nguyên)",
    ambient: { color: 0xbcd6f2, alpha: 0.17 },
    vignette: { color: 0x0a1220, strength: 0.48 },
    fog: { color: 0xe4f0fb, alpha: 0.3, speed: 7 },
    weather: { kind: "snow", rate: 11 },
    water: { shimmer: 0xe8f6ff, alpha: 0.4, speed: 4 },
    decor: {
      density: { tuft: 0.03, flower: 0.02, pebble: 0.045, mushroom: 0.008, bush: 0.04 },
      palette: {
        tuft: [0xa7b6a0, 0x8b9b87], // cỏ khô phủ sương giá
        flower: [0xf4faff, 0xcfe2f1], // hoa tuyết trắng + lam nhạt
        pebble: [0xb2bac4, 0x8c95a1], // đá xám lạnh
        mushroom: [0xa8c8e6, 0x7ea3c9], // nhũ băng / nấm băng lam
        bush: [0x39574f, 0x2b4640], // tùng sẫm
      },
    },
  },
};

/** Bản đồ này có kiểu RIÊNG (không phải mặc định)? Dùng `Object.hasOwn` nên "constructor" / "__proto__" không lọt. */
export function hasOwnStyle(mapId: string): boolean {
  return Object.hasOwn(MAP_STYLES, mapId);
}

/** Kiểu theo `mapId`; id lạ (kể cả "constructor") trả kiểu mặc định chứ không ném lỗi. */
export function styleOf(mapId: string): MapStyle {
  return hasOwnStyle(mapId) ? MAP_STYLES[mapId] : DEFAULT_STYLE;
}

export const DEFAULT_MAP_STYLE: MapStyle = DEFAULT_STYLE;

/**
 * Id kiểu để vẽ: bình thường là `mapId`; riêng ở chế độ gỡ lỗi (`?debug`) có thể xem trước kiểu của bản đồ KHÁC bằng `?style=<id>` (vd `han_van` khi bản đồ thứ tư
 * chưa có phòng). Id lạ (kể cả "constructor") hoặc thiếu `?debug` thì bỏ qua, giữ `mapId`: không ai đổi được diện mạo bản đồ thật của mình trên bản phát hành.
 */
export function styleIdFor(mapId: string, search: string): string {
  const q = new URLSearchParams(search);
  const want = q.get("style");
  return q.has("debug") && want !== null && hasOwnStyle(want) ? want : mapId;
}

const isColor = (c: number) => Number.isInteger(c) && c >= 0 && c <= 0xffffff;
const inRange = (v: number, lo: number, hi: number) => Number.isFinite(v) && v >= lo && v <= hi;

/** Lỗi của một kiểu (rỗng = hợp lệ). Test chạy cho mọi kiểu; lớp vẽ không phải tự kiểm lại. */
export function validateStyle(s: MapStyle): string[] {
  const errs: string[] = [];
  const colors: Array<[string, number]> = [
    ["ambient.color", s.ambient.color],
    ["vignette.color", s.vignette.color],
    ["fog.color", s.fog.color],
    ["water.shimmer", s.water.shimmer],
  ];
  for (const [k, c] of colors) if (!isColor(c)) errs.push(`${k} không phải màu 0..0xffffff`);
  if (!inRange(s.ambient.alpha, 0, 0.4))
    errs.push("ambient.alpha ngoài 0..0.4 (phủ quá đậm che cảnh)");
  if (!inRange(s.vignette.strength, 0, 0.8)) errs.push("vignette.strength ngoài 0..0.8");
  if (!inRange(s.fog.alpha, 0, 0.4)) errs.push("fog.alpha ngoài 0..0.4");
  if (!inRange(s.fog.speed, 0, 40)) errs.push("fog.speed ngoài 0..40 px/s");
  if (!inRange(s.water.alpha, 0, 0.5)) errs.push("water.alpha ngoài 0..0.5");
  if (!inRange(s.water.speed, 0, 40)) errs.push("water.speed ngoài 0..40 px/s");
  if (!inRange(s.weather.rate, 0, MAX_WEATHER_RATE))
    errs.push(`weather.rate ngoài 0..${MAX_WEATHER_RATE}`);
  if (s.weather.kind === "none" && s.weather.rate !== 0) errs.push("weather none mà rate != 0");
  if (s.weather.kind !== "none" && s.weather.rate <= 0) errs.push("có thời tiết mà rate <= 0");
  let sum = 0;
  for (const [k, v] of Object.entries(s.decor.density)) {
    if (!(DECOR_KINDS as readonly string[]).includes(k))
      errs.push(`decor.density có loại lạ "${k}"`);
    if (!inRange(v as number, 0, 1)) errs.push(`decor.density.${k} ngoài 0..1`);
    else sum += v as number;
  }
  if (sum > MAX_DECOR_DENSITY)
    errs.push(`tổng mật độ trang trí ${sum.toFixed(3)} > ${MAX_DECOR_DENSITY}`);
  for (const k of DECOR_KINDS) {
    const p = s.decor.palette[k];
    if (!p || p.length !== DECOR_VARIANTS || !p.every(isColor))
      errs.push(`decor.palette.${k} phải đủ ${DECOR_VARIANTS} màu hợp lệ`);
  }
  return errs;
}
