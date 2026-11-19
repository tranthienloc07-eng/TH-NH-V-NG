import {
  BuildingFinancialPreview,
  CityLevel,
  CityLevelSpec,
  DifficultyLevel,
  LaborTierCounts,
  MacroPolicies,
  OnboardingQuestSpec,
  RoadJunctionType,
  TileData,
  TileType,
  ToolId,
  ToolMetadata,
  WealthLevel,
} from './types';

// Bản đồ chi tiết 18x18 ô cho mỗi thành phố, nằm trong Đại Vùng Đô Thị 9x9 thành phố
export const GRID_SIZE = 18;
export const REGION_GRID_SIZE = 9;

// Scale Ngân sách & Nhân khẩu học thực tế theo GDD mới:
// - Ngân sách khởi điểm: 50 Tỷ VNĐ (tương đương vốn doanh nghiệp tầm trung bắt đầu dự án)
// - Giá đền bù giải tỏa đất hoang (BaseEmptyLandPrice): 500.000 VNĐ - 1 Triệu VNĐ / ô (0.0005 - 0.001 Tỷ VNĐ)
// - Mở rộng vùng 9x9: Đạt dân số >= 1.200 người (tương đương 2-3 khu chung cư lấp đầy) & Ngân sách dương >= 10 Tỷ VNĐ
export const STARTING_TREASURY = 50;
export const BASE_EMPTY_LAND_PRICE = 0.0008; // 800.000 VNĐ / ô đất hoang
export const BASE_MARSH_LAND_PRICE = 0.0005; // 500.000 VNĐ / ô đất trũng nông nghiệp
export const EXPANSION_POP_TARGET = 1200;
export const EXPANSION_TREASURY_TARGET = 10;

export interface DifficultySpecification {
  id: DifficultyLevel;
  label: string;
  shortLabel: string;
  startingTreasury: number;
  upkeepMultiplier: number;
  clearanceCostMultiplier: number;
  initialCrisisTimer: number;
  description: string;
}

export const DIFFICULTY_SPECS: Record<DifficultyLevel, DifficultySpecification> = {
  easy: {
    id: 'easy',
    label: 'Dễ (80 Tỷ · -20% Upkeep)',
    shortLabel: 'Dễ',
    startingTreasury: 80,
    upkeepMultiplier: 0.8,
    clearanceCostMultiplier: 1.0,
    initialCrisisTimer: 3,
    description: 'Ngân sách khởi điểm 80 Tỷ VNĐ, giảm 20% phí duy trì hàng tháng cho mọi công trình và hạ tầng.',
  },
  hard: {
    id: 'hard',
    label: 'Chuẩn (50 Tỷ · Cân Bằng)',
    shortLabel: 'Chuẩn',
    startingTreasury: 50,
    upkeepMultiplier: 1.0,
    clearanceCostMultiplier: 1.0,
    initialCrisisTimer: 3,
    description: 'Ngân sách khởi điểm chuẩn 50 Tỷ VNĐ, chi phí duy trì và đền bù giải tỏa ở mức tiêu chuẩn.',
  },
  expert: {
    id: 'expert',
    label: 'Chuyên Gia (32 Tỷ · +30% Giải Tỏa · Ân Hạn 2 Tháng)',
    shortLabel: 'Chuyên Gia',
    startingTreasury: 32,
    upkeepMultiplier: 1.0,
    clearanceCostMultiplier: 1.3,
    initialCrisisTimer: 2,
    description: 'Ngân sách khởi điểm 32 Tỷ VNĐ, phí đền bù giải tỏa +30%, thời gian ân hạn khủng hoảng rút ngắn còn 2 tháng.',
  },
};

export function getDifficultySpec(difficulty: DifficultyLevel = 'hard'): DifficultySpecification {
  return DIFFICULTY_SPECS[difficulty] ?? DIFFICULTY_SPECS.hard;
}

// Chu kỳ thời gian thực tế: Kéo giãn từ 1s/ngày lên 5-8 giây/ngày (Mặc định 6000ms = 6 giây/ngày)
export const MIN_DAY_TICK_MS = 5000;
export const DEFAULT_DAY_TICK_MS = 6000;
export const MAX_DAY_TICK_MS = 8000;
export const ALLOWED_DAY_TICK_MS = [5000, 6000, 8000] as const;

export interface BuildingSpecification {
  costBillion: number;            // Chi phí xây dựng (Tỷ VNĐ)
  constructionDays: number;       // Số ngày hoàn thiện xây dựng (1-2 ngày cho đường/thủy lợi/nhỏ, 3-5 ngày cho cao tầng)
  maxCapacity: number;            // Sức chứa cư dân tối đa (MaxCapacity, khởi tạo CurrentOccupants = 0)
  minimumWealthLevel: WealthLevel;// Phân tầng BĐS ('high' cấm lao động phổ thông)
  requiredWorkers: LaborTierCounts;// Nhu cầu nhân sự (Job Slots: 20-50 người cho Bệnh viện/Trường học...)
  baseGrossOutputBillion: number; // Doanh thu cơ sở mỗi tháng khi đủ 100% nhân sự (Tỷ VNĐ)
  maintenanceBillion: number;     // Chi phí vận hành mỗi tháng (Tỷ VNĐ)
}

export const BUILDING_SPECS: Record<TileType, BuildingSpecification> = {
  empty_land: {
    costBillion: 0,
    constructionDays: 0,
    maxCapacity: 0,
    minimumWealthLevel: 'low',
    requiredWorkers: { unskilled: 0, skilled: 0, educated: 0 },
    baseGrossOutputBillion: 0,
    maintenanceBillion: 0,
  },
  lowland_marsh: {
    costBillion: 0,
    constructionDays: 0,
    maxCapacity: 0,
    minimumWealthLevel: 'low',
    requiredWorkers: { unskilled: 0, skilled: 0, educated: 0 },
    baseGrossOutputBillion: 0,
    maintenanceBillion: 0,
  },
  river_water: {
    costBillion: 0,
    constructionDays: 0,
    maxCapacity: 0,
    minimumWealthLevel: 'low',
    requiredWorkers: { unskilled: 0, skilled: 0, educated: 0 },
    baseGrossOutputBillion: 0,
    maintenanceBillion: 0,
  },
  // Đường đất / Hẻm nhỏ: 8 Triệu VNĐ / ô (nằm trong khoảng 5 - 10 Triệu VNĐ / ô), hoàn thiện trong 1 ngày
  road_alley: {
    costBillion: 0.008,
    constructionDays: 1,
    maxCapacity: 0,
    minimumWealthLevel: 'low',
    requiredWorkers: { unskilled: 0, skilled: 0, educated: 0 },
    baseGrossOutputBillion: 0,
    maintenanceBillion: 0.001,
  },
  // Đường nhựa nhỏ / đô thị: 65 Triệu VNĐ / ô (nằm trong khoảng 50 - 80 Triệu VNĐ / ô), hoàn thiện trong 1 ngày
  road_urban: {
    costBillion: 0.065,
    constructionDays: 1,
    maxCapacity: 0,
    minimumWealthLevel: 'low',
    requiredWorkers: { unskilled: 0, skilled: 0, educated: 0 },
    baseGrossOutputBillion: 0,
    maintenanceBillion: 0.005,
  },
  // Đường Vành Đai: 220 Triệu VNĐ / ô (0.22 Tỷ), Upkeep 0.01 Tỷ / ô / tháng, không nối trực tiếp road_alley
  road_ring: {
    costBillion: 0.22,
    constructionDays: 1,
    maxCapacity: 0,
    minimumWealthLevel: 'low',
    requiredWorkers: { unskilled: 0, skilled: 0, educated: 0 },
    baseGrossOutputBillion: 0,
    maintenanceBillion: 0.01,
  },
  // Cao tốc / Quốc lộ: 450 Triệu VNĐ / ô, hoàn thiện trong 2 ngày
  road_highway: {
    costBillion: 0.45,
    constructionDays: 2,
    maxCapacity: 0,
    minimumWealthLevel: 'low',
    requiredWorkers: { unskilled: 0, skilled: 0, educated: 0 },
    baseGrossOutputBillion: 0,
    maintenanceBillion: 0.02,
  },
  // Nhà phố / Nhà ống hẻm nhỏ: Sức chứa 8 người (4 - 8 người), khởi tạo 0/8, hoàn thiện nhanh trong 1 ngày
  res_low: {
    costBillion: 0.8,
    constructionDays: 1,
    maxCapacity: 8,
    minimumWealthLevel: 'low',
    requiredWorkers: { unskilled: 0, skilled: 0, educated: 0 },
    baseGrossOutputBillion: 0,
    maintenanceBillion: 0,
  },
  // Chung cư mini / thấp tầng: Sức chứa 120 người (30-50 hộ ~ 100-150 người), khởi tạo 0/120, hoàn thiện 3 ngày
  res_mid: {
    costBillion: 8.5,
    constructionDays: 3,
    maxCapacity: 120,
    minimumWealthLevel: 'mid',
    requiredWorkers: { unskilled: 0, skilled: 0, educated: 0 },
    baseGrossOutputBillion: 0,
    maintenanceBillion: 0,
  },
  // Chung cư tầm trung / cao cấp: Giá 32 Tỷ VNĐ (mốc 30-35 Tỷ VNĐ), Sức chứa 600 người (200-1000 người),
  // MinimumWealthLevel = 'high' (Cấm lao động phổ thông, chỉ nhận Lao động trung cấp & Có bằng cấp!)
  res_high: {
    costBillion: 32,
    constructionDays: 5,
    maxCapacity: 600,
    minimumWealthLevel: 'high',
    requiredWorkers: { unskilled: 0, skilled: 0, educated: 0 },
    baseGrossOutputBillion: 0,
    maintenanceBillion: 0,
  },
  com_street: {
    costBillion: 1.5,
    constructionDays: 2,
    maxCapacity: 0,
    minimumWealthLevel: 'low',
    requiredWorkers: { unskilled: 12, skilled: 6, educated: 2 }, // 20 nhân sự
    baseGrossOutputBillion: 3.2,
    maintenanceBillion: 0.05,
  },
  // Chợ truyền thống: Cần 30 nhân sự (chủ yếu lao động phổ thông), hoàn thiện 2 ngày
  com_market: {
    costBillion: 2.4,
    constructionDays: 2,
    maxCapacity: 0,
    minimumWealthLevel: 'low',
    requiredWorkers: { unskilled: 22, skilled: 6, educated: 2 }, // 30 nhân sự
    baseGrossOutputBillion: 6.5,
    maintenanceBillion: 0.08,
  },
  // Trung tâm thương mại & Siêu thị: Cần 45 nhân sự, hoàn thiện 4 ngày
  com_mall: {
    costBillion: 14,
    constructionDays: 4,
    maxCapacity: 0,
    minimumWealthLevel: 'mid',
    requiredWorkers: { unskilled: 10, skilled: 25, educated: 10 }, // 45 nhân sự
    baseGrossOutputBillion: 18,
    maintenanceBillion: 0.25,
  },
  // Văn phòng Tài chính: Giá 18 Tỷ, Upkeep 0.3 Tỷ, cần lao động educated cao, sinh CIT/PIT lớn khi PCI >= 65
  com_office: {
    costBillion: 18,
    constructionDays: 4,
    maxCapacity: 0,
    minimumWealthLevel: 'high',
    requiredWorkers: { unskilled: 2, skilled: 13, educated: 25 }, // 40 nhân sự (25 chuyên gia tài chính)
    baseGrossOutputBillion: 24,
    maintenanceBillion: 0.3,
  },
  // Nông lâm thủy sản: Công trình nhỏ hoàn thiện 1 ngày, cần 20 nhân sự, nuôi tối đa 180 dân
  agr_farm: {
    costBillion: 0.65,
    constructionDays: 1,
    maxCapacity: 0,
    minimumWealthLevel: 'low',
    requiredWorkers: { unskilled: 15, skilled: 4, educated: 1 }, // 20 nhân sự
    baseGrossOutputBillion: 4.2,
    maintenanceBillion: 0.03,
  },
  // Xưởng Chế biến Thực phẩm: Giá 4.5 Tỷ, Upkeep 0.1 Tỷ, nhận bonus từ agr_farm
  ind_food: {
    costBillion: 4.5,
    constructionDays: 2,
    maxCapacity: 0,
    minimumWealthLevel: 'low',
    requiredWorkers: { unskilled: 18, skilled: 9, educated: 3 }, // 30 nhân sự
    baseGrossOutputBillion: 9.2,
    maintenanceBillion: 0.1,
  },
  // Nhà máy sản xuất: Cần 40 nhân sự, hoàn thiện 3 ngày (Gây ô nhiễm bán kính 2 ô giảm -4 Hạnh phúc mỗi ô dân cư)
  ind_factory: {
    costBillion: 9.5,
    constructionDays: 3,
    maxCapacity: 0,
    minimumWealthLevel: 'mid',
    requiredWorkers: { unskilled: 22, skilled: 13, educated: 5 }, // 40 nhân sự
    baseGrossOutputBillion: 14,
    maintenanceBillion: 0.2,
  },
  // Tổ hợp công nghệ cao FDI: Cần 50 nhân sự (35 kỹ sư có bằng cấp, 15 kỹ thuật viên), hoàn thiện 5 ngày
  ind_fdi: {
    costBillion: 28,
    constructionDays: 5,
    maxCapacity: 0,
    minimumWealthLevel: 'high',
    requiredWorkers: { unskilled: 0, skilled: 15, educated: 35 }, // 50 nhân sự
    baseGrossOutputBillion: 36,
    maintenanceBillion: 0.4,
  },
  // UBND & Hành chính công: Cần 25 nhân sự, hoàn thiện 2 ngày
  pub_admin: {
    costBillion: 4.2,
    constructionDays: 2,
    maxCapacity: 0,
    minimumWealthLevel: 'mid',
    requiredWorkers: { unskilled: 3, skilled: 12, educated: 10 }, // 25 nhân sự
    baseGrossOutputBillion: 0,
    maintenanceBillion: 0.35,
  },
  // Tổ hợp Y tế & Giáo dục (tương thích ngược):
  pub_edu_med: {
    costBillion: 12.5,
    constructionDays: 4,
    maxCapacity: 0,
    minimumWealthLevel: 'high',
    requiredWorkers: { unskilled: 5, skilled: 10, educated: 20 },
    baseGrossOutputBillion: 0,
    maintenanceBillion: 0.5,
  },
  // 1A. NHÓM Y TẾ - BỆNH VIỆN CÔNG (Public Hospital):
  // Ngân sách nhà nước bù lỗ (Chi phí duy trì âm hàng tháng - Upkeep), không thu CIT, tối đa hóa An sinh & Hạnh phúc cho mọi tầng lớp
  pub_hospital: {
    costBillion: 11.5,
    constructionDays: 4,
    maxCapacity: 0,
    minimumWealthLevel: 'low',
    requiredWorkers: { unskilled: 5, skilled: 10, educated: 20 }, // 35 nhân sự (20 Bác sĩ công lập)
    baseGrossOutputBillion: 0,
    maintenanceBillion: 0.42,
  },
  // 1B. NHÓM Y TẾ - BỆNH VIỆN TƯ NHÂN (Private Hospital):
  // Hoạt động như doanh nghiệp thương mại tự chủ tài chính (Upkeep ngân sách = 0), thu viện phí và đóng Thuế TNDN (CIT) trực tiếp vào ngân sách, đòi hỏi dân cư có thu nhập tương xứng
  priv_hospital: {
    costBillion: 16.0,
    constructionDays: 4,
    maxCapacity: 0,
    minimumWealthLevel: 'mid',
    requiredWorkers: { unskilled: 4, skilled: 12, educated: 22 }, // 38 nhân sự (22 Bác sĩ chuyên khoa)
    baseGrossOutputBillion: 7.5,
    maintenanceBillion: 0,
  },
  // 2A. NHÓM GIÁO DỤC - TRƯỜNG HỌC CÔNG (Public School):
  // Tiêu tốn ngân sách vận hành nhà nước (Upkeep âm hàng tháng), không thu CIT, tăng mạnh chỉ số Hạnh phúc & An sinh xã hội
  pub_school: {
    costBillion: 8.5,
    constructionDays: 3,
    maxCapacity: 0,
    minimumWealthLevel: 'low',
    requiredWorkers: { unskilled: 4, skilled: 8, educated: 18 }, // 30 nhân sự (18 Giáo viên biên chế)
    baseGrossOutputBillion: 0,
    maintenanceBillion: 0.28,
  },
  // 2B. NHÓM GIÁO DỤC - TRƯỜNG QUỐC TẾ / TƯ THỤC (Private / International School):
  // Học phí cao, tự chủ tài chính (Upkeep ngân sách = 0), đóng Thuế TNDN (CIT) trực tiếp vào ngân sách thành phố, đòi hỏi dân cư thu nhập cao
  priv_school: {
    costBillion: 14.0,
    constructionDays: 4,
    maxCapacity: 0,
    minimumWealthLevel: 'high',
    requiredWorkers: { unskilled: 3, skilled: 10, educated: 22 }, // 35 nhân sự (22 Giảng viên quốc tế)
    baseGrossOutputBillion: 6.2,
    maintenanceBillion: 0,
  },
  // Công an & PCCC: Cần 25 nhân sự, hoàn thiện 2 ngày
  pub_security: {
    costBillion: 3.2,
    constructionDays: 2,
    maxCapacity: 0,
    minimumWealthLevel: 'mid',
    requiredWorkers: { unskilled: 5, skilled: 15, educated: 5 }, // 25 nhân sự
    baseGrossOutputBillion: 0,
    maintenanceBillion: 0.3,
  },
  // Công trình Thủy lợi, Điện & Xử lý rác: Chỉ mất 2 ngày hoàn thiện, cần 25 nhân sự
  util_power_water: {
    costBillion: 4.8,
    constructionDays: 2,
    maxCapacity: 0,
    minimumWealthLevel: 'mid',
    requiredWorkers: { unskilled: 8, skilled: 10, educated: 7 }, // 25 nhân sự
    baseGrossOutputBillion: 0,
    maintenanceBillion: 0.35,
  },
  // Tổ hợp Sân vận động & Showbiz (Phím tắt [J]): Cần 40 nhân sự, hoàn thiện 5 ngày
  showbiz_stadium: {
    costBillion: 24,
    constructionDays: 5,
    maxCapacity: 0,
    minimumWealthLevel: 'high',
    requiredWorkers: { unskilled: 8, skilled: 14, educated: 18 }, // 40 nhân sự
    baseGrossOutputBillion: 22,
    maintenanceBillion: 0.45,
  },
  gateway_port: {
    costBillion: 0,
    constructionDays: 0,
    maxCapacity: 0,
    minimumWealthLevel: 'low',
    requiredWorkers: { unskilled: 0, skilled: 0, educated: 0 },
    baseGrossOutputBillion: 0,
    maintenanceBillion: 0,
  },
  gateway_station: {
    costBillion: 0,
    constructionDays: 0,
    maxCapacity: 0,
    minimumWealthLevel: 'low',
    requiredWorkers: { unskilled: 0, skilled: 0, educated: 0 },
    baseGrossOutputBillion: 0,
    maintenanceBillion: 0,
  },
};

/**
 * Định dạng tiền tệ Việt Nam thông minh (Hỗ trợ từ 500.000 VNĐ, 8 Triệu VNĐ đến 50 Tỷ VNĐ)
 */
export function formatVnd(billionAmount: number, includeVnd = false): string {
  const abs = Math.abs(billionAmount);
  const sign = billionAmount < 0 ? '-' : '';
  const suffix = includeVnd ? ' VNĐ' : '';

  if (abs === 0) return `0 Tỷ${suffix}`;
  if (abs < 0.001) {
    const dong = Math.round(abs * 1_000_000_000);
    return `${sign}${dong.toLocaleString('vi-VN')} đ`;
  }
  if (abs < 1) {
    const million = Number((abs * 1000).toFixed(1));
    return `${sign}${million.toLocaleString('vi-VN')} Triệu${suffix}`;
  }
  const formattedBillion =
    abs >= 100
      ? Math.round(abs).toLocaleString('vi-VN')
      : Number(abs.toFixed(2)).toLocaleString('vi-VN');
  return `${sign}${formattedBillion} Tỷ${suffix}`;
}

export const TOOLS: ToolMetadata[] = [
  {
    id: 'road_alley',
    name: 'Đường Đất / Hẻm Nhỏ (8 Triệu/ô · 1 Ngày)',
    shortName: 'Đường Hẻm',
    category: 'road',
    cost: BUILDING_SPECS.road_alley.costBillion,
    constructionDays: BUILDING_SPECS.road_alley.constructionDays,
    keyHint: '1',
    roleClue: 'Tự nối ngã 3/ngã 4 · Thi công 1 ngày',
    prerequisiteLabel: 'Đặt tự do trên đất trống',
    description:
      'Chi phí san lấp cơ bản chỉ 8 Triệu VNĐ/ô, hoàn thiện trong 1 ngày. Tự động bắt dính (Snap) tạo ngã ba chữ T hoặc ngã tư khi đặt cạnh đường khác.',
  },
  {
    id: 'road_urban',
    name: 'Đường Nhựa Đô Thị (65 Triệu/ô · 1 Ngày)',
    shortName: 'Đường Nhựa',
    category: 'road',
    cost: BUILDING_SPECS.road_urban.costBillion,
    constructionDays: BUILDING_SPECS.road_urban.constructionDays,
    keyHint: '2',
    roleClue: '4 làn + Vỉa hè · Tự nối T-Junction · 1 ngày',
    prerequisiteLabel: 'Đặt tự do trên đất hoặc bắc cầu qua sông',
    description:
      'Đường nhựa đô thị giá 65 Triệu VNĐ/ô, hoàn thiện trong 1 ngày. Tự động nhận diện đường lân cận để tạo ngã ba chữ T (T-junction) hoặc ngã tư (Cross-intersection).',
  },
  {
    id: 'road_ring',
    name: 'Đường Vành Đai Đô Thị (220 Triệu/ô · 1 Ngày)',
    shortName: 'Đường Vành Đai',
    category: 'road',
    cost: BUILDING_SPECS.road_ring.costBillion,
    constructionDays: BUILDING_SPECS.road_ring.constructionDays,
    keyHint: '3',
    roleClue: 'Đại lộ Vành Đai · Chỉ nối Đường Nhựa/Cao Tốc · +Chuỗi cung ứng',
    prerequisiteLabel: 'Đặt tự do hoặc bắc cầu · Không nối trực tiếp Đường Hẻm [F1 · 1]',
    description:
      'Trục đại lộ vành đai phân luồng xe tải và tăng chỉ số cung ứng cục bộ (Local Supply). Chỉ kết nối với Đường Vành Đai, Đường Nhựa Đô Thị và Cao Tốc — tuyệt đối không đấu nối trực tiếp với Đường Hẻm nhỏ.',
  },
  {
    id: 'road_highway',
    name: 'Cao Tốc Trên Cao (450 Triệu/ô · 2 Ngày)',
    shortName: 'Cao Tốc',
    category: 'road',
    cost: BUILDING_SPECS.road_highway.costBillion,
    constructionDays: BUILDING_SPECS.road_highway.constructionDays,
    keyHint: '4',
    roleClue: '6 làn Logistics · Bắc cầu qua sông · 2 ngày',
    prerequisiteLabel: 'Đặt tự do trên đất hoặc bắc cầu qua sông',
    description:
      'Quốc lộ / Cao tốc trên cao dành cho xe tải nặng & Container, hoàn thiện trong 2 ngày.',
  },
  {
    id: 'res_low',
    name: 'Nhà Phố / Nhà Ống Hẻm (0 / 8 Người · 1 Ngày)',
    shortName: 'Nhà Ống (8 dân)',
    category: 'zoning',
    cost: BUILDING_SPECS.res_low.costBillion,
    constructionDays: BUILDING_SPECS.res_low.constructionDays,
    keyHint: '1',
    roleClue: 'Sức chứa 0/8 người · Cần sát Đường [F1 · 1-4]',
    prerequisiteLabel: 'Yêu cầu đặt sát cạnh Đường [F1 · 1-4]',
    description:
      'Khu nhà ống hẻm nhỏ (MaxCapacity: 8 người, khởi tạo 0/8). Yêu cầu đặt sát cạnh đường giao thông. Sau 1 ngày xây xong, người lao động phổ thông sẽ di cư tự nhiên vào ở.',
  },
  {
    id: 'res_mid',
    name: 'Chung Cư Mini / Thấp Tầng (0 / 120 Người · 3 Ngày)',
    shortName: 'CC Mini (120 dân)',
    category: 'zoning',
    cost: BUILDING_SPECS.res_mid.costBillion,
    constructionDays: BUILDING_SPECS.res_mid.constructionDays,
    keyHint: '2',
    roleClue: '0/120 người · Cần sát Đường [F1 · 1-4]',
    prerequisiteLabel: 'Yêu cầu đặt sát cạnh Đường [F1 · 1-4]',
    description:
      'Chung cư mini tầm thấp (30-50 hộ ~ 120 người, khởi tạo 0/120). Yêu cầu đặt sát đường giao thông để thu hút nhân viên dịch vụ & kỹ thuật viên trung cấp.',
  },
  {
    id: 'res_high',
    name: 'Chung Cư Cao Cấp (0 / 600 Người · 32 Tỷ · 5 Ngày)',
    shortName: 'CC Cao Cấp (600)',
    category: 'zoning',
    cost: BUILDING_SPECS.res_high.costBillion,
    constructionDays: BUILDING_SPECS.res_high.constructionDays,
    keyHint: '3',
    roleClue: '0/600 người · Cần Đường Nhựa / Vành Đai / Cao Tốc',
    prerequisiteLabel: 'Yêu cầu sát Đường Nhựa [F1 · 2], Vành Đai [F1 · 3] hoặc Cao Tốc [F1 · 4]',
    description:
      'Chung cư cao tầng (32 Tỷ VNĐ, MaxCapacity: 600 người). Yêu cầu đặt sát Đường Nhựa/Vành Đai/Cao Tốc (không thể xây trong hẻm nhỏ) và chỉ cho phép Lao động trung cấp & Có bằng cấp sinh sống.',
  },
  {
    id: 'com_market',
    name: 'Chợ Truyền Thống (Cần 30 Nhân Sự · 2 Ngày)',
    shortName: 'Chợ Truyền Thống',
    category: 'zoning',
    cost: BUILDING_SPECS.com_market.costBillion,
    constructionDays: BUILDING_SPECS.com_market.constructionDays,
    keyHint: '4',
    roleClue: 'Job Slots: 30 người · Cần sát Đường [F1 · 1-4]',
    prerequisiteLabel: 'Yêu cầu đặt sát cạnh Đường [F1 · 1-4]',
    description:
      'Tạo 30 việc làm cho tiểu thương và lao động phổ thông. Bắt buộc phải quy hoạch sát cạnh đường giao thông.',
  },
  {
    id: 'com_mall',
    name: 'Trung Tâm Thương Mại (Cần 45 Nhân Sự · 4 Ngày)',
    shortName: 'TT Thương Mại',
    category: 'zoning',
    cost: BUILDING_SPECS.com_mall.costBillion,
    constructionDays: BUILDING_SPECS.com_mall.constructionDays,
    keyHint: '5',
    roleClue: 'Job Slots: 45 người · Cần Đường Nhựa + Điện [F3 · 7]',
    prerequisiteLabel: 'Yêu cầu sát Đường Nhựa/Vành Đai/Cao Tốc + Thủy Lợi & Điện [F3 · 7]',
    description:
      'Trung tâm thương mại hiện đại cần 45 nhân sự. Yêu cầu đặt sát Đường Nhựa/Vành Đai/Cao Tốc và thành phố đã xây dựng Thủy Lợi & Điện [F3 · 7].',
  },
  {
    id: 'com_office',
    name: 'Văn Phòng Tài Chính (18 Tỷ · Cần 40 Nhân Sự · 4 Ngày)',
    shortName: 'Văn Phòng TC',
    category: 'zoning',
    cost: BUILDING_SPECS.com_office.costBillion,
    constructionDays: BUILDING_SPECS.com_office.constructionDays,
    keyHint: '6',
    roleClue: '25 Trí thức · Thuế CIT/PIT đột biến khi PCI ≥ 65',
    prerequisiteLabel: 'Yêu cầu sát Đường Nhựa/Vành Đai/Cao Tốc + Điện [F3 · 7]',
    description:
      'Cao ốc Văn phòng Tài chính & Ngân hàng cần 40 nhân sự chất lượng cao (25 lao động có bằng cấp). Mang lại nguồn thu CIT và PIT đột biến khi chỉ số PCI đạt từ 65 điểm trở lên.',
  },
  {
    id: 'agr_farm',
    name: 'Nông Lâm & Thủy Hải Sản (Nuôi 180 Dân · 20 Nhân Sự · 1 Ngày)',
    shortName: 'Nông Thủy Sản',
    category: 'zoning',
    cost: BUILDING_SPECS.agr_farm.costBillion,
    constructionDays: BUILDING_SPECS.agr_farm.constructionDays,
    keyHint: '7',
    roleClue: 'Nuôi 180 dân · Cấp nguyên liệu Xưởng Thực Phẩm · 1 ngày',
    prerequisiteLabel: 'Đặt tự do trên đất trống / đất trũng',
    description:
      'Mỗi vùng canh tác nông thủy sản hoạt động đảm bảo nguồn cung lương thực cho 180 người dân và cung cấp nguyên liệu cho Xưởng Chế biến Thực phẩm.',
  },
  {
    id: 'ind_food',
    name: 'Xưởng Chế Biến Thực Phẩm (4,5 Tỷ · 30 Nhân Sự · 2 Ngày)',
    shortName: 'Xưởng Thực Phẩm',
    category: 'zoning',
    cost: BUILDING_SPECS.ind_food.costBillion,
    constructionDays: BUILDING_SPECS.ind_food.constructionDays,
    keyHint: '8',
    roleClue: 'Job Slots: 30 người · +Bonus sản lượng gần Nông Trại [F2 · 7]',
    prerequisiteLabel: 'Yêu cầu đặt sát cạnh Đường [F1 · 1-4]',
    description:
      'Xưởng chế biến nông thủy sản sạch (không gây ô nhiễm nặng như Nhà máy SX), nhận thưởng sản lượng lớn khi đặt trong bán kính cung ứng của Nông Trại [F2 · 7].',
  },
  {
    id: 'ind_factory',
    name: 'Nhà Máy Sản Xuất (Cần 40 Nhân Sự · 3 Ngày)',
    shortName: 'Nhà Máy SX',
    category: 'zoning',
    cost: BUILDING_SPECS.ind_factory.costBillion,
    constructionDays: BUILDING_SPECS.ind_factory.constructionDays,
    keyHint: '9',
    roleClue: 'Job Slots: 40 người · Ô nhiễm -4 Hạnh phúc bán kính 2 ô',
    prerequisiteLabel: 'Yêu cầu đặt sát cạnh Đường [F1 · 1-4]',
    description:
      'Nhà máy công nghiệp nặng cần 40 công nhân & kỹ thuật viên. Lưu ý: Khói bụi làm giảm -4 điểm Hạnh phúc đối với mỗi ô Khu Dân Cư nằm trong bán kính 2 ô.',
  },
  {
    id: 'ind_fdi',
    name: 'Tổ Hợp Công Nghệ Cao FDI (Cần 50 Kỹ Sư · 5 Ngày)',
    shortName: 'Tổ Hợp FDI',
    category: 'zoning',
    cost: BUILDING_SPECS.ind_fdi.costBillion,
    constructionDays: BUILDING_SPECS.ind_fdi.constructionDays,
    keyHint: '0',
    roleClue: '50 Kỹ sư · Cần Đường Nhựa + Điện [F3 · 7] + PCI ≥ 55',
    prerequisiteLabel: 'Yêu cầu sát Đường Nhựa/Vành Đai/Cao Tốc + Điện [F3 · 7] + PCI ≥ 55',
    description:
      'Nhà máy bán dẫn FDI. Yêu cầu thành phố đã có Thủy Lợi & Điện [F3 · 7], chỉ số PCI ≥ 55 và đặt sát Đường Nhựa/Vành Đai/Cao Tốc.',
  },
  {
    id: 'pub_admin',
    name: 'UBND & Hành Chính Công (Cần 25 Nhân Sự · 2 Ngày)',
    shortName: 'Hành Chính Công',
    category: 'infra',
    cost: BUILDING_SPECS.pub_admin.costBillion,
    constructionDays: BUILDING_SPECS.pub_admin.constructionDays,
    keyHint: '1',
    roleClue: '25 Nhân sự · Xóa 12% thất thoát thuế · +30% Hành chính PCI',
    prerequisiteLabel: 'Yêu cầu đặt sát cạnh Đường [F1 · 1-4]',
    description:
      'Nâng cao hiệu quả giải quyết thủ tục đầu tư (+PCI) và chống thất thoát 12% thu thuế CIT/PIT của thành phố. Cần 25 cán bộ hành chính & chuyên viên.',
  },
  {
    id: 'pub_hospital',
    name: 'Bệnh Viện Công Lập (Upkeep -420Tr/tháng · +An Sinh Tối Đa · 4 Ngày)',
    shortName: 'Bệnh Viện Công',
    category: 'infra',
    cost: BUILDING_SPECS.pub_hospital.costBillion,
    constructionDays: BUILDING_SPECS.pub_hospital.constructionDays,
    keyHint: '2',
    roleClue: 'Khối Công · Bù lỗ -0.42 Tỷ/th · Tối đa An sinh & Hạnh phúc',
    prerequisiteLabel: 'Yêu cầu đặt sát Đường Nhựa [F1 · 2], Vành Đai [F1 · 3] hoặc Cao Tốc [F1 · 4]',
    description:
      'Bệnh viện Công lập được ngân sách nhà nước bù lỗ (phí duy trì âm 420 Triệu/tháng), phục vụ mọi tầng lớp nhân dân giúp tối đa hóa chỉ số An sinh và Hạnh phúc.',
  },
  {
    id: 'priv_hospital',
    name: 'Bệnh Viện Tư Nhân Quốc Tế (Tự Chủ · Đóng Thuế CIT · 4 Ngày)',
    shortName: 'Bệnh Viện Tư',
    category: 'infra',
    cost: BUILDING_SPECS.priv_hospital.costBillion,
    constructionDays: BUILDING_SPECS.priv_hospital.constructionDays,
    keyHint: '3',
    roleClue: 'Khối Tư · Tự chủ tài chính · Đóng thuế CIT · Cần dân thu nhập khá',
    prerequisiteLabel: 'Yêu cầu đặt sát Đường Nhựa [F1 · 2], Vành Đai [F1 · 3] hoặc Cao Tốc [F1 · 4]',
    description:
      'Bệnh viện Tư nhân hoạt động như doanh nghiệp thương mại: tự thu viện phí (không tốn phí duy trì ngân sách), đóng thuế CIT trực tiếp vào ngân sách nhưng đòi hỏi cư dân có thu nhập tương xứng.',
  },
  {
    id: 'pub_school',
    name: 'Trường Học Công Lập (Upkeep -280Tr/tháng · +Hạnh Phúc · 3 Ngày)',
    shortName: 'Trường Học Công',
    category: 'infra',
    cost: BUILDING_SPECS.pub_school.costBillion,
    constructionDays: BUILDING_SPECS.pub_school.constructionDays,
    keyHint: '4',
    roleClue: 'Khối Công · Phí vận hành -0.28 Tỷ/th · Tăng mạnh Hạnh phúc',
    prerequisiteLabel: 'Yêu cầu đặt sát cạnh Đường [F1 · 1-4]',
    description:
      'Trường học Công lập sử dụng ngân sách vận hành nhà nước (-280 Triệu/tháng) để phổ cập giáo dục cho mọi gia đình, tăng mạnh chỉ số Hạnh phúc và ổn định xã hội.',
  },
  {
    id: 'priv_school',
    name: 'Trường Quốc Tế / Tư Thục (Học Phí Cao · Đóng Thuế CIT · 4 Ngày)',
    shortName: 'Trường Tư Thục',
    category: 'infra',
    cost: BUILDING_SPECS.priv_school.costBillion,
    constructionDays: BUILDING_SPECS.priv_school.constructionDays,
    keyHint: '5',
    roleClue: 'Khối Tư · Học phí cao · Đóng thuế CIT · Cần dân trí thức/trung lưu',
    prerequisiteLabel: 'Yêu cầu đặt sát Đường Nhựa [F1 · 2], Vành Đai [F1 · 3] hoặc Cao Tốc [F1 · 4]',
    description:
      'Trường Quốc tế / Tư thục thu học phí cao, tự chủ tài chính hoàn toàn và đóng thuế CIT trực tiếp vào ngân sách thành phố, đòi hỏi cư dân có thu nhập trung lưu & trí thức.',
  },
  {
    id: 'pub_security',
    name: 'Công An & PCCC (Cần 25 Nhân Sự · 2 Ngày)',
    shortName: 'Công An & PCCC',
    category: 'infra',
    cost: BUILDING_SPECS.pub_security.costBillion,
    constructionDays: BUILDING_SPECS.pub_security.constructionDays,
    keyHint: '6',
    roleClue: 'Job Slots: 25 người · Cần sát Đường [F1 · 1-4]',
    prerequisiteLabel: 'Yêu cầu đặt sát cạnh Đường [F1 · 1-4]',
    description:
      'Đảm bảo an ninh trật tự và phòng cháy chữa cháy, hoàn thiện trong 2 ngày. Yêu cầu đặt sát đường giao thông.',
  },
  {
    id: 'util_power_water',
    name: 'Thủy Lợi, Điện & Cấp Thoát Nước (250 Dân / 20 Công Trình · 2 Ngày)',
    shortName: 'Thủy Lợi & Điện',
    category: 'infra',
    cost: BUILDING_SPECS.util_power_water.costBillion,
    constructionDays: BUILDING_SPECS.util_power_water.constructionDays,
    keyHint: '7',
    roleClue: 'Cấp điện/nước 250 dân & 20 công trình · Mở khóa công trình lớn',
    prerequisiteLabel: 'Đặt tự do trên đất quy hoạch',
    description:
      'Mỗi trạm hoàn thiện và có nhân sự cấp công suất cho tối đa 250 dân và 20 công trình. Nếu quá tải (>100%), sản lượng kinh tế giảm 35% và -8 Hạnh phúc.',
  },
  {
    id: 'showbiz_stadium',
    name: 'Sân Vận Động & Showbiz ([F3 · 8] · Concert [J] · 40 Nhân Sự · 5 Ngày)',
    shortName: 'Tổ Hợp Showbiz',
    category: 'infra',
    cost: BUILDING_SPECS.showbiz_stadium.costBillion,
    constructionDays: BUILDING_SPECS.showbiz_stadium.constructionDays,
    keyHint: 'J',
    roleClue: 'Tab [F3 · 8] · Tổ chức Concert [J] · Cần Đường Nhựa + Điện + Dân ≥ 80',
    prerequisiteLabel: 'Yêu cầu sát Đường Nhựa/Vành Đai/Cao Tốc + Điện [F3 · 7] + Dân ≥ 80',
    description:
      'Tổ hợp sự kiện văn hóa giải trí (Tab [F3 · 8], phím tắt Đại Nhạc Hội [J], không trùng WASD). Khi xây xong và có tối thiểu 20/40 nhân sự làm việc mới mở khóa chức năng Tổ chức Đại Nhạc Hội!',
  },
  {
    id: 'sub_drainage',
    name: 'Ống Thoát Nước & Cống Ngầm (15 Triệu/ô · 1 Ngày)',
    shortName: 'Ống Thoát Nước',
    category: 'special',
    cost: 0.015,
    constructionDays: 1,
    keyHint: '1',
    roleClue: 'Phím nhanh [V] hoặc [F4 · 1] · Chi phí 15 Triệu/ô · 1 ngày',
    prerequisiteLabel: 'Đặt trên mọi ô đất/công trình (trừ lòng sông)',
    description:
      'Lắp đặt ống cống thoát nước ngầm chống ngập triều cường chỉ tốn 15 Triệu VNĐ/ô và mất 1 ngày thi công (Phím nhanh [V] hoặc [F4 · 1]).',
  },
  {
    id: 'act_clearance',
    name: 'Đền Bù Giải Tỏa Đất & Công Trình',
    shortName: 'Đền Bù Giải Tỏa',
    category: 'special',
    cost: 0,
    constructionDays: 1,
    keyHint: '2',
    roleClue: 'Tab [F4 · 2] · Đất hoang: 500k - 1 Triệu/ô · Công trình: Theo giá đất',
    prerequisiteLabel: 'Chọn ô đất hoặc công trình cần thu hồi mặt bằng',
    description:
      'Giải tỏa đất nông nghiệp/đất hoang giá chỉ 500.000đ - 1 Triệu VNĐ/ô; giải tỏa công trình kiên cố tính theo khung giá đất thực tế.',
  },
  {
    id: 'act_reserve_land',
    name: 'Khoanh Quỹ Đất Công (Đặt Cọc 100% Giá Đất Hiện Tại)',
    shortName: 'Khoanh Đất Công',
    category: 'special',
    cost: 0,
    constructionDays: 1,
    keyHint: '3',
    roleClue: 'Tab [F4 · 3] · Đặt cọc giữ giá đất rẻ · Giảm 70% phí GPMB cho công trình công & đường bộ',
    prerequisiteLabel: 'Đặt trên Đất Trống hoặc Đất Trũng chưa xây dựng',
    description:
      'Đặt cọc 100% giá đất hiện tại để khoanh quỹ đất công trước khi giá đất sốt tăng vọt. Khi xây đường bộ hoặc công trình công lên ô đã khoanh sẽ được giảm 70% chi phí GPMB; có thể Nhả đất hoàn 85% cọc hoặc Cầm cố vay 70% giá trị đất hiện tại.',
  },
];

export const TILE_LABELS: Record<TileType, string> = {
  empty_land: 'Đất Trống Quy Hoạch (800.000đ/ô)',
  lowland_marsh: 'Đất Trũng Nông Nghiệp (500.000đ/ô)',
  river_water: 'Sông Thịnh Vượng',
  res_low: 'Nhà Ống Hẻm Nhỏ',
  res_mid: 'Chung Cư Mini / Thấp Tầng',
  res_high: 'Chung Cư Cao Cấp (Cao Tầng)',
  com_street: 'Dãy Shophouse & Hàng Quán',
  com_market: 'Chợ Truyền Thống',
  com_mall: 'Trung Tâm Thương Mại',
  com_office: 'Cao Ốc Văn Phòng Tài Chính',
  agr_farm: 'Vùng Nông Thủy Hải Sản',
  ind_food: 'Xưởng Chế Biến Thực Phẩm',
  ind_factory: 'Nhà Máy Sản Xuất Công Nghiệp',
  ind_fdi: 'Tổ Hợp Công Nghệ Cao FDI',
  pub_admin: 'UBND & Trung Tâm Hành Chính Công',
  pub_edu_med: 'Bệnh Viện & Trường Đại Học',
  pub_hospital: 'Bệnh Viện Đa Khoa Công Lập',
  priv_hospital: 'Bệnh Viện Đa Khoa Tư Nhân Quốc Tế',
  pub_school: 'Trường Phổ Thông Công Lập',
  priv_school: 'Trường Quốc Tế / Tư Thục Liên Cấp',
  pub_security: 'Trạm Công An & PCCC',
  util_power_water: 'Công Trình Thủy Lợi & Điện Sạch',
  showbiz_stadium: 'Sân Vận Động & Nhà Hát Showbiz',
  road_alley: 'Đường Đất / Hẻm Nhỏ',
  road_urban: 'Đường Nhựa Đô Thị',
  road_ring: 'Đường Vành Đai Đô Thị',
  road_highway: 'Quốc Lộ / Cao Tốc Trên Cao',
  gateway_port: 'Cảng Biển Quốc Tế & Logistics',
  gateway_station: 'Ga Tàu Hỏa & Cửa Ngõ Liên Vùng',
};

export const DEFAULT_CUSTOM_NAME_PREFIX: Record<TileType, string> = {
  empty_land: 'Lô Đất Trống',
  lowland_marsh: 'Đất Trũng Ven Sông',
  river_water: 'Sông Thịnh Vượng',
  road_alley: 'Hẻm Dân Sinh',
  road_urban: 'Đường Nhựa Đô Thị',
  road_ring: 'Đại Lộ Vành Đai',
  road_highway: 'Cao Tốc Liên Vùng',
  res_low: 'Nhà Ống Phố Cổ',
  res_mid: 'Chung Cư Mini An Cư',
  res_high: 'Tháp Chung Cư Thịnh Vượng',
  com_street: 'Dãy Shophouse Mặt Tiền',
  com_market: 'Chợ Truyền Thống',
  com_mall: 'Trung Tâm Thương Mại',
  com_office: 'Tháp Tài Chính Thịnh Vượng',
  agr_farm: 'Nông Trại Thủy Sản',
  ind_food: 'Xưởng Chế Biến Thực Phẩm',
  ind_factory: 'Nhà Máy Chế Biến',
  ind_fdi: 'Tổ Hợp Bán Dẫn FDI',
  pub_admin: 'Trung Tâm Hành Chính UBND',
  pub_edu_med: 'Trạm Y Tế & Đại Học',
  pub_hospital: 'Bệnh Viện Công Lập',
  priv_hospital: 'Bệnh Viện Quốc Tế Tư Nhân',
  pub_school: 'Trường Học Công Lập',
  priv_school: 'Trường Quốc Tế Tư Thục',
  pub_security: 'Trạm Công An & PCCC',
  util_power_water: 'Nhà Máy Thủy Lợi & Điện',
  showbiz_stadium: 'Tổ Hợp Sân Vận Động Showbiz',
  gateway_port: 'Cảng Biển Quốc Tế',
  gateway_station: 'Ga Đường Sắt Liên Vùng',
};

export function createDefaultPolicies(): MacroPolicies {
  return {
    pitLow: 5,
    pitMid: 10,
    pitEducated: 15,
    citAgri: 8,
    citIndustry: 15,
    citMarket: 10,
    citFdi: 10,
    citShowbiz: 20,
    compensationLevel: 'fair',
    welfareLevel: 45,
    greenLightMainRatio: 58,
    allowSidewalkEconomy: true,
    banPeakHeavyTrucks: false,
    subsidizeBusTransit: true,
    transitLevel: 1,
    enableTollbooth: false,
    sidewalkPolicy: 'informal',
    banTrucksInResidential: false,
  };
}

export function isResidentialTile(type: TileType): boolean {
  return type === 'res_low' || type === 'res_mid' || type === 'res_high';
}

export function isWorkplaceTile(type: TileType): boolean {
  const req = BUILDING_SPECS[type]?.requiredWorkers;
  if (!req) return false;
  return req.unskilled + req.skilled + req.educated > 0;
}

export function isBuiltStructure(type: TileType): boolean {
  return (
    type !== 'empty_land' &&
    type !== 'lowland_marsh' &&
    type !== 'river_water' &&
    type !== 'gateway_port' &&
    type !== 'gateway_station'
  );
}

export function isRoadTile(type: TileType): boolean {
  return (
    type === 'road_alley' ||
    type === 'road_urban' ||
    type === 'road_ring' ||
    type === 'road_highway'
  );
}

export function isMainArterialRoad(type: TileType): boolean {
  return (
    type === 'road_urban' ||
    type === 'road_ring' ||
    type === 'road_highway'
  );
}

export function isConnectableRoadOrGateway(type: TileType): boolean {
  return (
    isRoadTile(type) ||
    type === 'gateway_port' ||
    type === 'gateway_station'
  );
}

/**
 * Quy tắc kết nối đường bộ:
 * `road_ring` (Đường Vành Đai) chỉ snap/kết nối với `road_ring`, `road_urban`, `road_highway` (và cửa ngõ gateway),
 * TUYỆT ĐỐI KHÔNG kết nối với `road_alley` (Đường Hẻm).
 */
export function canRoadsConnect(typeA: TileType, typeB: TileType): boolean {
  if (!isConnectableRoadOrGateway(typeA) || !isConnectableRoadOrGateway(typeB)) {
    return false;
  }
  if (
    (typeA === 'road_ring' && typeB === 'road_alley') ||
    (typeA === 'road_alley' && typeB === 'road_ring')
  ) {
    return false;
  }
  return true;
}

export function isPublicServiceModule(type: TileType): boolean {
  return (
    type === 'pub_hospital' ||
    type === 'pub_school' ||
    type === 'pub_edu_med' ||
    type === 'pub_admin' ||
    type === 'pub_security'
  );
}

export function isPrivateServiceModule(type: TileType): boolean {
  return type === 'priv_hospital' || type === 'priv_school';
}

export function isEconomicCitModule(type: TileType): boolean {
  return (
    type === 'agr_farm' ||
    type === 'ind_food' ||
    type === 'ind_factory' ||
    type === 'ind_fdi' ||
    type === 'com_street' ||
    type === 'com_market' ||
    type === 'com_mall' ||
    type === 'com_office' ||
    type === 'priv_hospital' ||
    type === 'priv_school' ||
    type === 'showbiz_stadium'
  );
}

/**
 * Minh bạch 5 chỉ số tài chính cho Build Menu & Tooltip (`getBuildingFinancialPreview`):
 * 1. Vốn đầu tư (costLabel)
 * 2. Upkeep/tháng (upkeepLabel)
 * 3. Yêu cầu nhân sự (workersLabel)
 * 4. Thuế/Sản lượng kỳ vọng (expectedTaxOrOutputLabel)
 * 5. Thời gian hoàn vốn (paybackLabel — hoặc "Chi đầu tư công")
 */
export function getBuildingFinancialPreview(
  specOrTool: BuildingSpecification | TileType | ToolId,
  policies: MacroPolicies,
  difficulty: DifficultyLevel = 'hard'
): BuildingFinancialPreview {
  const diffMult = getDifficultySpec(difficulty).upkeepMultiplier;

  if (specOrTool === 'sub_drainage') {
    const cost = 0.015;
    const upkeep = Number((0.002 * diffMult).toFixed(4));
    return {
      costBillion: cost,
      costLabel: formatVnd(cost),
      upkeepBillion: upkeep,
      upkeepLabel: `${formatVnd(upkeep)}/th`,
      requiredWorkersTotal: 0,
      workersLabel: '0 người (Tự động)',
      expectedMonthlyTaxOrOutputBillion: 0,
      expectedTaxOrOutputLabel: 'Chống ngập (-100% ngập ô)',
      paybackMonths: null,
      paybackLabel: 'Chi đầu tư công',
      isPublicInvestment: true,
    };
  }

  if (specOrTool === 'act_reserve_land') {
    return {
      costBillion: 0,
      costLabel: '100% Giá đất ô',
      upkeepBillion: 0,
      upkeepLabel: '0 Tỷ/th',
      requiredWorkersTotal: 0,
      workersLabel: '0 người',
      expectedMonthlyTaxOrOutputBillion: 0,
      expectedTaxOrOutputLabel: '-70% GPMB công / Thế chấp vay 70%',
      paybackMonths: null,
      paybackLabel: 'Chi đầu tư công',
      isPublicInvestment: true,
    };
  }

  if (specOrTool === 'act_clearance' || specOrTool === 'inspect') {
    return {
      costBillion: 0,
      costLabel: 'Theo giá đất',
      upkeepBillion: 0,
      upkeepLabel: '0 Tỷ/th',
      requiredWorkersTotal: 0,
      workersLabel: '0 người',
      expectedMonthlyTaxOrOutputBillion: 0,
      expectedTaxOrOutputLabel: 'Giải phóng mặt bằng',
      paybackMonths: null,
      paybackLabel: 'Chi đầu tư công',
      isPublicInvestment: true,
    };
  }

  let tileType: TileType | null = null;
  let spec: BuildingSpecification;
  if (typeof specOrTool === 'string') {
    tileType = specOrTool as TileType;
    spec = BUILDING_SPECS[tileType] ?? BUILDING_SPECS.empty_land;
  } else {
    spec = specOrTool;
  }

  const costBillion = spec.costBillion;
  const upkeepBillion = Number((spec.maintenanceBillion * diffMult).toFixed(4));
  const req = spec.requiredWorkers;
  const requiredWorkersTotal = req.unskilled + req.skilled + req.educated;

  let workersLabel = '0 người';
  if (spec.maxCapacity > 0) {
    workersLabel = `Cư trú tối đa ${spec.maxCapacity} dân`;
  } else if (requiredWorkersTotal > 0) {
    const parts: string[] = [];
    if (req.unskilled > 0) parts.push(`${req.unskilled} PT`);
    if (req.skilled > 0) parts.push(`${req.skilled} TC`);
    if (req.educated > 0) parts.push(`${req.educated} ĐH`);
    workersLabel = `${requiredWorkersTotal} người (${parts.join(' · ')})`;
  }

  // Xác định thuế suất CIT tương ứng
  let citRate = 0;
  if (tileType === 'agr_farm') citRate = policies.citAgri;
  else if (tileType === 'ind_factory' || tileType === 'ind_food') citRate = policies.citIndustry;
  else if (tileType === 'priv_hospital' || tileType === 'priv_school') {
    // Ưu đãi thuế Xã hội hóa Y tế & Giáo dục: bằng 50% thuế Thương mại, tối đa 10% (tối thiểu 5%)
    citRate = Math.min(10, Math.max(5, Math.round(policies.citMarket * 0.5)));
  } else if (
    tileType === 'com_street' ||
    tileType === 'com_market' ||
    tileType === 'com_mall' ||
    tileType === 'com_office'
  ) {
    citRate = policies.citMarket;
  } else if (tileType === 'ind_fdi') citRate = policies.citFdi;
  else if (tileType === 'showbiz_stadium') citRate = policies.citShowbiz;
  else if (!tileType && spec.baseGrossOutputBillion > 0) {
    citRate = policies.citMarket;
  }

  // Tính PIT kỳ vọng từ nhân sự hoặc cư dân
  const pitFromStaff =
    req.unskilled * 0.015 * (policies.pitLow / 100) +
    req.skilled * 0.032 * (policies.pitMid / 100) +
    req.educated * 0.068 * (policies.pitEducated / 100);

  if (spec.maxCapacity > 0) {
    // Khu dân cư: đóng góp PIT khi lấp đầy
    let estPit = 0;
    if (spec.minimumWealthLevel === 'high') {
      estPit =
        spec.maxCapacity * 0.55 * 0.032 * (policies.pitMid / 100) +
        spec.maxCapacity * 0.45 * 0.068 * (policies.pitEducated / 100);
    } else if (spec.minimumWealthLevel === 'mid') {
      estPit =
        spec.maxCapacity * 0.45 * 0.015 * (policies.pitLow / 100) +
        spec.maxCapacity * 0.4 * 0.032 * (policies.pitMid / 100) +
        spec.maxCapacity * 0.15 * 0.068 * (policies.pitEducated / 100);
    } else {
      estPit = spec.maxCapacity * 0.8 * 0.015 * (policies.pitLow / 100);
    }
    const netMonthly = Math.max(0.01, estPit - upkeepBillion);
    const paybackMonths = Math.max(1, Math.ceil(costBillion / netMonthly));
    return {
      costBillion,
      costLabel: formatVnd(costBillion),
      upkeepBillion,
      upkeepLabel: upkeepBillion > 0 ? `${formatVnd(upkeepBillion)}/th` : '0 Tỷ/th',
      requiredWorkersTotal: 0,
      workersLabel,
      expectedMonthlyTaxOrOutputBillion: Number(estPit.toFixed(2)),
      expectedTaxOrOutputLabel: `+${formatVnd(estPit)} PIT/th`,
      paybackMonths,
      paybackLabel: `~${paybackMonths} tháng`,
      isPublicInvestment: false,
    };
  }

  if (spec.baseGrossOutputBillion > 0) {
    const expectedCit = spec.baseGrossOutputBillion * (citRate / 100);
    const totalTaxContribution = expectedCit + pitFromStaff;
    const netMonthly = totalTaxContribution - upkeepBillion;
    const paybackMonths =
      netMonthly > 0.01 ? Math.max(1, Math.ceil(costBillion / netMonthly)) : null;

    const isEduMed = tileType === 'priv_hospital' || tileType === 'priv_school';
    return {
      costBillion,
      costLabel: formatVnd(costBillion),
      upkeepBillion,
      upkeepLabel: upkeepBillion > 0 ? `${formatVnd(upkeepBillion)}/th` : '0 Tỷ/th (Tự chủ)',
      requiredWorkersTotal,
      workersLabel,
      expectedMonthlyTaxOrOutputBillion: Number(totalTaxContribution.toFixed(2)),
      expectedTaxOrOutputLabel: isEduMed
        ? `+${formatVnd(totalTaxContribution)}/th (CIT ${citRate}% XHH)`
        : `+${formatVnd(totalTaxContribution)}/th (SL ${formatVnd(spec.baseGrossOutputBillion)})`,
      paybackMonths,
      paybackLabel: paybackMonths !== null ? `~${paybackMonths} tháng` : 'Chưa hoàn vốn',
      isPublicInvestment: false,
    };
  }

  // Công trình công ích / Đường bộ
  let serviceLabel = 'Hạ tầng giao thông';
  if (tileType === 'util_power_water') serviceLabel = 'Cấp 250 dân & 20 công trình';
  else if (tileType === 'pub_admin') serviceLabel = 'Chống thất thoát 12% thuế · +PCI';
  else if (tileType === 'pub_hospital') serviceLabel = '+An sinh & Y tế công lập';
  else if (tileType === 'pub_school') serviceLabel = '+Hạnh phúc & Giáo dục công';
  else if (tileType === 'pub_security') serviceLabel = '+An ninh & PCCC bán kính 5 ô';

  return {
    costBillion,
    costLabel: formatVnd(costBillion),
    upkeepBillion,
    upkeepLabel: `${formatVnd(upkeepBillion)}/th`,
    requiredWorkersTotal,
    workersLabel,
    expectedMonthlyTaxOrOutputBillion: Number(pitFromStaff.toFixed(2)),
    expectedTaxOrOutputLabel: serviceLabel,
    paybackMonths: null,
    paybackLabel: 'Chi đầu tư công',
    isPublicInvestment: true,
  };
}

/**
 * Tính hệ số phù hợp thu nhập cư dân (Resident Income Suitability) cho Khối Dịch Vụ Tư Nhân
 * (`priv_hospital` - Bệnh viện Tư nhân & `priv_school` - Trường Quốc tế/Tư thục)
 */
export function calculatePrivateServiceIncomeSuitability(
  type: TileType,
  unskilledPop: number,
  skilledPop: number,
  educatedPop: number
): { multiplier: number; suitabilityPercent: number } {
  if (!isPrivateServiceModule(type)) {
    return { multiplier: 1.0, suitabilityPercent: 100 };
  }
  const totalPop = unskilledPop + skilledPop + educatedPop;
  if (totalPop <= 0) {
    return { multiplier: 0.4, suitabilityPercent: 40 };
  }

  const affluentWeighted =
    type === 'priv_school'
      ? skilledPop * 0.65 + educatedPop * 1.45
      : skilledPop * 0.85 + educatedPop * 1.3;
  const affluentRatio = affluentWeighted / Math.max(20, totalPop);
  const multiplier = Math.max(
    0.42,
    Math.min(1.2, Number((0.42 + affluentRatio * 0.85).toFixed(2)))
  );
  const suitabilityPercent = Math.max(
    35,
    Math.min(100, Math.round((multiplier / 1.05) * 100))
  );
  return { multiplier, suitabilityPercent };
}

export function classifyRoadJunction(
  north: boolean,
  south: boolean,
  west: boolean,
  east: boolean
): RoadJunctionType {
  const count =
    (north ? 1 : 0) + (south ? 1 : 0) + (west ? 1 : 0) + (east ? 1 : 0);
  if (count === 4) return 'crossroad';
  if (count === 3) return 't_junction';
  if (count === 2) {
    if (north && south) return 'straight_ns';
    if (west && east) return 'straight_we';
    return 'corner';
  }
  if (count === 1) {
    return west || east ? 'straight_we' : 'straight_ns';
  }
  return 'isolated';
}

export function hasNeighborOfType(
  grid: TileData[][],
  x: number,
  z: number,
  types: TileType[]
): boolean {
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [dx, dz] of dirs) {
    const nx = x + dx;
    const nz = z + dz;
    if (nz >= 0 && nz < grid.length && nx >= 0 && nx < grid[0].length) {
      if (types.includes(grid[nz][nx].type)) {
        return true;
      }
    }
  }
  return false;
}

export function getRegionName(rx: number, rz: number): string {
  const names = [
    'Thị Tứ Khởi Nguyên',
    'Quận Cảng Đông Nam',
    'Thung Lũng Bán Dẫn Bắc',
    'Khu Đô Thị Ven Sông',
    'Đặc Khu Kinh Tế Biển',
    'Cao Nguyên Lâm Nghiệp',
    'Đồng Bằng Phù Sa',
    'Bán Đảo Du Lịch Showbiz',
    'Trung Tâm Tài Chính Mới',
  ];
  if (rx === 4 && rz === 4) return 'TP. Thịnh Vượng (Trung Tâm 5,5)';
  const idx = (rx * 7 + rz * 13) % names.length;
  return `${names[idx]} (${rx + 1},${rz + 1})`;
}

export function generateDefaultBuildingIdentity(
  targetType: TileType,
  seq: number
): { instanceId: string; customName: string } {
  const safeSeq = Math.max(1, seq);
  const instanceId = `BLD-${String(safeSeq).padStart(4, '0')}`;
  const prefix =
    DEFAULT_CUSTOM_NAME_PREFIX[targetType] ?? TILE_LABELS[targetType];
  const customName = `${prefix} #${safeSeq}`;
  return { instanceId, customName };
}

// ============================================================================
// HỆ THỐNG CẤP ĐỘ ĐÔ THỊ (CITY LEVEL 1-5), KHÓA TÍNH NĂNG & NHIỆM VỤ TÂN THỦ
// ============================================================================

export const CITY_LEVEL_SPECS: Record<CityLevel, CityLevelSpec> = {
  1: {
    level: 1,
    title: 'Phường Khởi Nghiệp',
    minPopulation: 0,
    unlockSummary:
      'Đường Hẻm, Đường Đô Thị, Nhà Ống, Chợ Truyền Thống, Nông Trại, Điện Nước, Cống Ngầm & Giải Tỏa.',
  },
  2: {
    level: 2,
    title: 'Đô Thị Loại IV',
    minPopulation: 150,
    unlockSummary:
      'Mở khóa Đường Vành Đai, Xưởng Thực Phẩm, Chung Cư Mini, Trường Công, Bệnh Viện Công, Công An PCCC & Thanh trượt Thuế TNCN (PIT).',
  },
  3: {
    level: 3,
    title: 'Đô Thị Loại III',
    minPopulation: 450,
    unlockSummary:
      'Mở khóa Nhà Máy CN, Shophouse, Trường Tư, Bệnh Viện Tư, UBND & Chính sách Đền Bù / An Sinh.',
  },
  4: {
    level: 4,
    title: 'Đô Thị Loại II',
    minPopulation: 900,
    unlockSummary:
      'Mở khóa Chung Cư Cao Cấp, Văn Phòng Tài Chính, Siêu Thị Mall, Cao Tốc, Khu Công Nghệ Cao FDI & 5 Thanh trượt Thuế CIT.',
  },
  5: {
    level: 5,
    title: 'Đô Thị Hạt Nhân',
    minPopulation: 1200,
    minTreasury: 10,
    unlockSummary:
      'Mở khóa Tổ Hợp Showbiz & Đại Nhạc Hội, cùng Bản Đồ Mở Rộng Đại Vùng 9×9 [E].',
  },
};

export const TOOL_UNLOCK_LEVEL: Record<ToolId, CityLevel> = {
  inspect: 1,
  road_alley: 1,
  road_urban: 1,
  res_low: 1,
  com_market: 1,
  agr_farm: 1,
  util_power_water: 1,
  sub_drainage: 1,
  act_clearance: 1,
  act_reserve_land: 1,

  road_ring: 2,
  ind_food: 2,
  res_mid: 2,
  pub_school: 2,
  pub_hospital: 2,
  pub_edu_med: 2,
  pub_security: 2,

  ind_factory: 3,
  com_street: 3,
  priv_school: 3,
  priv_hospital: 3,
  pub_admin: 3,

  res_high: 4,
  com_mall: 4,
  com_office: 4,
  road_highway: 4,
  ind_fdi: 4,

  showbiz_stadium: 5,
};

export type PolicyLockKey =
  | keyof MacroPolicies
  | 'pit'
  | 'cit'
  | 'bank'
  | 'compensation'
  | 'welfare'
  | 'concert'
  | 'region_9x9';

export const POLICY_UNLOCK_LEVEL: Record<PolicyLockKey, CityLevel> = {
  pit: 2,
  pitLow: 2,
  pitMid: 2,
  pitEducated: 2,
  bank: 2,

  compensation: 3,
  welfare: 3,
  compensationLevel: 3,
  welfareLevel: 3,

  cit: 4,
  citAgri: 4,
  citIndustry: 4,
  citMarket: 4,
  citFdi: 4,
  citShowbiz: 4,

  concert: 5,
  region_9x9: 5,

  greenLightMainRatio: 1,
  allowSidewalkEconomy: 1,
  banPeakHeavyTrucks: 1,
  subsidizeBusTransit: 1,
  transitLevel: 1,
  enableTollbooth: 1,
  sidewalkPolicy: 1,
  banTrucksInResidential: 1,
};

export function isToolUnlockedAtLevel(
  toolId: ToolId,
  cityLevel: CityLevel
): boolean {
  const reqLevel = TOOL_UNLOCK_LEVEL[toolId] ?? 1;
  return cityLevel >= reqLevel;
}

export function getToolUnlockRequirementLabel(toolId: ToolId): string {
  const reqLevel = TOOL_UNLOCK_LEVEL[toolId] ?? 1;
  if (reqLevel <= 1) return 'Đã mở khóa (Level 1)';
  const spec = CITY_LEVEL_SPECS[reqLevel];
  if (reqLevel === 5) {
    return `Mở khóa ở Level 5 (${spec.minPopulation.toLocaleString('vi-VN')} dân & Quỹ ≥ ${spec.minTreasury} Tỷ)`;
  }
  return `Mở khóa ở Level ${reqLevel} (${spec.minPopulation.toLocaleString('vi-VN')} dân)`;
}

export function isPolicyUnlockedAtLevel(
  policyKey: PolicyLockKey,
  cityLevel: CityLevel
): boolean {
  const reqLevel = POLICY_UNLOCK_LEVEL[policyKey] ?? 1;
  return cityLevel >= reqLevel;
}

export function getPolicyUnlockRequirementLabel(
  policyKey: PolicyLockKey
): string {
  const reqLevel = POLICY_UNLOCK_LEVEL[policyKey] ?? 1;
  if (reqLevel <= 1) return 'Đã mở khóa';
  const spec = CITY_LEVEL_SPECS[reqLevel];
  if (reqLevel === 5) {
    return `Mở khóa ở Level 5 — ${spec.title} (${spec.minPopulation.toLocaleString('vi-VN')} dân & Quỹ ≥ ${spec.minTreasury} Tỷ)`;
  }
  return `Mở khóa ở Level ${reqLevel} — ${spec.title} (${spec.minPopulation.toLocaleString('vi-VN')} dân)`;
}

export function computeCityLevel(
  population: number,
  treasury: number,
  currentLevel: CityLevel = 1
): CityLevel {
  let target: CityLevel = 1;
  if (population >= 1200 && treasury >= 10) {
    target = 5;
  } else if (population >= 900) {
    target = 4;
  } else if (population >= 450) {
    target = 3;
  } else if (population >= 150) {
    target = 2;
  }
  return Math.max(currentLevel, target) as CityLevel;
}

export const ONBOARDING_QUESTS: OnboardingQuestSpec[] = [
  {
    step: 1,
    id: 'quest_step_1_roads',
    title: 'Bước 1/5: Mở Đường Giao Thông',
    objective: 'Xây ít nhất 3 ô Đường Hẻm [F1 · 1] hoặc Đường Đô Thị [F1 · 2]',
    mechanicExplanation:
      'Mọi công trình nhà ở và kinh tế đều bắt buộc phải nằm cạnh đường giao thông để cư dân và hàng hóa lưu thông.',
    targetCount: 3,
    recommendedTool: 'road_urban',
  },
  {
    step: 2,
    id: 'quest_step_2_housing',
    title: 'Bước 2/5: Đón Cư Dân Đầu Tiên (Nhà Ống)',
    objective: 'Quy hoạch 3 ô Nhà Phố / Nhà Ống [F2 · 1] nằm sát cạnh đường vừa mở',
    mechanicExplanation:
      'Khi xây xong, công trình có 0 người ở và cư dân sẽ dọn vào ở dần qua mỗi ngày.',
    targetCount: 3,
    recommendedTool: 'res_low',
  },
  {
    step: 3,
    id: 'quest_step_3_economy',
    title: 'Bước 3/5: Tạo Dòng Tiền & Việc Làm',
    objective:
      'Xây 1 Chợ Truyền Thống [F2 · 4] (hoặc Nông Trại [F2 · 7]) cạnh đường gần khu dân cư',
    mechanicExplanation:
      'Cung cấp việc làm cho lao động phổ thông và mang lại nguồn Thuế TNDN (CIT) đầu tiên vào Ngày 30 cuối tháng.',
    targetCount: 1,
    recommendedTool: 'com_market',
  },
  {
    step: 4,
    id: 'quest_step_4_drainage',
    title: 'Bước 4/5: Chống Ngập & Chuẩn Bị Triều Cường',
    objective:
      'Lắp đặt 2 ô Cống Ngầm Thoát Nước [V] cho khu dân cư hoặc chợ',
    mechanicExplanation:
      'Ngăn chặn ngập lụt làm tê liệt kinh tế khi thời tiết chuyển sang Mùa Mưa Bão / Triều Cường.',
    targetCount: 2,
    recommendedTool: 'sub_drainage',
  },
  {
    step: 5,
    id: 'quest_step_5_level2',
    title: 'Bước 5/5: Cán Mốc Đô Thị Loại IV',
    objective:
      'Đưa tổng dân số chạm mốc 150 người để thăng cấp City Level 2',
    mechanicExplanation:
      'Mở khóa Chung cư Mini, Trường học, Bệnh viện & Bảng điều chỉnh Thuế PIT.',
    targetCount: 150,
  },
];

export function countOnboardingGridStats(grid: TileData[][]): {
  playerRoadTiles: number;
  resLowTiles: number;
  marketOrFarmTiles: number;
  drainedBuiltTiles: number;
} {
  let totalRoadCount = 0;
  let resLowTiles = 0;
  let marketOrFarmTiles = 0;
  let drainedBuiltTiles = 0;

  for (const row of grid) {
    for (const cell of row) {
      if (isRoadTile(cell.type)) {
        totalRoadCount += 1;
      }
      if (cell.type === 'res_low') {
        resLowTiles += 1;
      }
      if (cell.type === 'com_market' || cell.type === 'agr_farm') {
        marketOrFarmTiles += 1;
      }
      if (
        (cell.hasDrainage || (cell.drainageRemainingDays ?? 0) > 0) &&
        cell.type !== 'river_water'
      ) {
        drainedBuiltTiles += 1;
      }
    }
  }

  const playerRoadTiles = totalRoadCount;
  return {
    playerRoadTiles,
    resLowTiles,
    marketOrFarmTiles,
    drainedBuiltTiles,
  };
}

export function evaluateOnboardingProgress(
  grid: TileData[][],
  population: number,
  cityLevel: CityLevel,
  prevCompletedQuests: string[] = []
): {
  onboardingStep: number;
  onboardingCompleted: boolean;
  completedQuests: string[];
  newlyCompletedQuestTitle: string | null;
  currentQuestProgress: { current: number; target: number };
} {
  const stats = countOnboardingGridStats(grid);
  const nextCompleted = new Set<string>(prevCompletedQuests);
  let newlyCompletedQuestTitle: string | null = null;

  const stepChecks: { id: string; title: string; current: number; target: number; done: boolean }[] = [
    {
      id: ONBOARDING_QUESTS[0].id,
      title: ONBOARDING_QUESTS[0].title,
      current: Math.min(3, stats.playerRoadTiles),
      target: 3,
      done: stats.playerRoadTiles >= 3,
    },
    {
      id: ONBOARDING_QUESTS[1].id,
      title: ONBOARDING_QUESTS[1].title,
      current: Math.min(3, stats.resLowTiles),
      target: 3,
      done: stats.resLowTiles >= 3,
    },
    {
      id: ONBOARDING_QUESTS[2].id,
      title: ONBOARDING_QUESTS[2].title,
      current: Math.min(1, stats.marketOrFarmTiles),
      target: 1,
      done: stats.marketOrFarmTiles >= 1,
    },
    {
      id: ONBOARDING_QUESTS[3].id,
      title: ONBOARDING_QUESTS[3].title,
      current: Math.min(2, stats.drainedBuiltTiles),
      target: 2,
      done: stats.drainedBuiltTiles >= 2,
    },
    {
      id: ONBOARDING_QUESTS[4].id,
      title: ONBOARDING_QUESTS[4].title,
      current: Math.min(150, population),
      target: 150,
      done: population >= 150 || cityLevel >= 2,
    },
  ];

  for (const check of stepChecks) {
    if (check.done && !nextCompleted.has(check.id)) {
      nextCompleted.add(check.id);
      newlyCompletedQuestTitle = check.title;
    }
  }

  let activeStepIndex = stepChecks.findIndex((c) => !nextCompleted.has(c.id));
  const onboardingCompleted = activeStepIndex === -1;
  if (activeStepIndex === -1) {
    activeStepIndex = stepChecks.length - 1;
  }

  const activeCheck = stepChecks[activeStepIndex];
  return {
    onboardingStep: activeStepIndex + 1,
    onboardingCompleted,
    completedQuests: Array.from(nextCompleted),
    newlyCompletedQuestTitle,
    currentQuestProgress: {
      current: activeCheck.current,
      target: activeCheck.target,
    },
  };
}

