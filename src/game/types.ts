export type GameStateMode = 'title' | 'playing' | 'paused' | 'gameover';

export type SeasonType = 'dry' | 'monsoon' | 'high_tide';

export type WealthLevel = 'low' | 'mid' | 'high';

export type RoadJunctionType =
  | 'isolated'
  | 'straight_ns'
  | 'straight_we'
  | 'corner'
  | 't_junction'
  | 'crossroad';

export type TileCategory =
  | 'terrain'
  | 'residential'
  | 'commercial'
  | 'industrial'
  | 'public'
  | 'road'
  | 'gateway';

export type TileType =
  | 'empty_land'
  | 'lowland_marsh'
  | 'river_water'
  | 'res_low'          // Nhà phố / Nhà ống hẻm nhỏ (Sức chứa 4 - 8 người)
  | 'res_mid'          // Chung cư mini / thấp tầng (Sức chứa 100 - 150 người)
  | 'res_high'         // Chung cư cao cấp cao tầng (Sức chứa 200 - 1000 người, chỉ Trung cấp & Có bằng cấp)
  | 'com_street'       // Hàng quán nhỏ lẻ & Shophouse mặt tiền
  | 'com_market'       // Chợ truyền thống
  | 'com_mall'         // Siêu thị & Trung tâm thương mại lớn
  | 'com_office'       // Văn phòng Tài chính (18 Tỷ, Upkeep 0.3 Tỷ, cần lao động educated cao, sinh CIT/PIT lớn khi PCI >= 65)
  | 'agr_farm'         // Nông lâm nghiệp & Thủy hải sản (Nuôi 180 dân/nông trại)
  | 'ind_food'         // Xưởng Chế biến Thực phẩm (4.5 Tỷ, Upkeep 0.1 Tỷ, nhận bonus từ agr_farm)
  | 'ind_factory'      // Nhà máy sản xuất công nghiệp (Gây ô nhiễm bán kính 2 ô giảm -4 Hạnh phúc mỗi ô dân cư)
  | 'ind_fdi'          // Khu công nghệ cao FDI
  | 'pub_admin'        // UBND & Trung tâm hành chính công
  | 'pub_hospital'     // Bệnh viện Công lập (Ngân sách nhà nước bù lỗ, đảm bảo an sinh tối đa)
  | 'priv_hospital'    // Bệnh viện Tư nhân (Doanh nghiệp tự chủ, thu viện phí & đóng thuế CIT)
  | 'pub_school'       // Trường học Công lập (Nhà nước cấp phí vận hành, tăng hạnh phúc & an sinh)
  | 'priv_school'      // Trường Quốc tế / Tư thục (Thu học phí cao, đóng thuế CIT, cần thu nhập dân cư tương xứng)
  | 'pub_edu_med'      // Tổ hợp Y tế & Giáo dục (tương thích ngược)
  | 'pub_security'     // Trạm Công an & Cứu hỏa PCCC
  | 'util_power_water' // Công trình Thủy lợi, Điện sạch & Xử lý rác
  | 'showbiz_stadium'  // Tổ hợp Sân vận động & Nhà hát Showbiz
  | 'road_alley'       // Đường đất / Đường hẻm nhỏ (5 - 10 Triệu VNĐ / ô)
  | 'road_urban'       // Đường nhựa nhỏ / đô thị (50 - 80 Triệu VNĐ / ô)
  | 'road_ring'        // Đường Vành Đai (0.22 Tỷ / ô, Upkeep 0.01 Tỷ / ô / tháng, không nối trực tiếp road_alley)
  | 'road_highway'     // Quốc lộ / Cao tốc trên cao
  | 'gateway_port'     // Cảng biển quốc tế & Trung tâm Logistics
  | 'gateway_station'; // Ga tàu hỏa & Sân bay liên vùng

export type ToolId =
  | 'inspect'
  | 'res_low'
  | 'res_mid'
  | 'res_high'
  | 'com_street'
  | 'com_market'
  | 'com_mall'
  | 'com_office'
  | 'agr_farm'
  | 'ind_food'
  | 'ind_factory'
  | 'ind_fdi'
  | 'pub_admin'
  | 'pub_hospital'
  | 'priv_hospital'
  | 'pub_school'
  | 'priv_school'
  | 'pub_edu_med'
  | 'pub_security'
  | 'util_power_water'
  | 'showbiz_stadium'
  | 'road_alley'
  | 'road_urban'
  | 'road_ring'
  | 'road_highway'
  | 'sub_drainage'     // Hệ thống cống ngầm thoát nước chống ngập (1 - 2 ngày)
  | 'act_clearance'    // Đền bù giải tỏa mặt bằng (Land Clearance)
  | 'act_reserve_land';// Khoanh Quỹ Đất Công (Land Banking)

export type CompensationLevel = 'low' | 'fair' | 'generous';

export type DifficultyLevel = 'easy' | 'hard' | 'expert';

export type TransitLevel = 0 | 1 | 2;

export type SidewalkPolicy = 'ban' | 'informal' | 'licensed';

export interface RoadConnections {
  north: boolean;
  south: boolean;
  west: boolean;
  east: boolean;
  junctionType?: RoadJunctionType;
}

export interface LaborTierCounts {
  unskilled: number; // Lao động phổ thông
  skilled: number;   // Lao động trung cấp
  educated: number;  // Lao động có bằng cấp (Bác sĩ, Kỹ sư, Giảng viên)
}

export interface MonthlyCitEntry {
  monthLabel: string;         // Nhãn tháng (ví dụ: "T1/2026" hoặc "T2 (Mùa Khô)")
  seasonLabel: string;        // Mùa vụ ("Mùa Khô" | "Mùa Mưa Bão" | "Triều Cường")
  grossOutputBillion: number; // Sản lượng gộp trong tháng (Tỷ VNĐ)
  citRate: number;            // Thuế suất TNDN áp dụng (%)
  citRevenueBillion: number;  // Doanh thu Thuế TNDN (CIT) thu được (Tỷ VNĐ)
  efficiencyPercent: number;  // Hiệu suất kinh tế của phân khu (0 - 100%)
  isHistorical: boolean;      // true = Dữ liệu lịch sử đã chốt cuối tháng, false = Dự báo theo tháng
}

export interface EntityLedgerRecord {
  instanceId: string;
  customName: string;
  tileType: TileType;
  x: number;
  z: number;
  occupantsOrWorkers: string;
  revenue: number;
  taxCIT: number;
  taxPIT: number;
  maintenanceCost: number;
  netIncome: number;
}

export interface LedgerEntry {
  id: string;
  day: number;
  month: number;
  year: number;
  season: SeasonType;
  entryType: 'daily_build' | 'monthly_settlement';
  summary: string;
  totalRevenue: number;
  totalTaxCIT: number;
  totalTaxPIT: number;
  totalMaintenanceCost: number;
  buildingMaintenanceCost: number; // Tổng phí duy trì của các công trình kiến trúc, dịch vụ, kinh tế
  infraMaintenanceCost: number;    // Tổng phí duy trì của đường bộ road_* và cống ngầm sub_drainage
  welfareAndFloodCost: number;
  fdiBonus: number;
  monthlyPropertyTax?: number;     // Thuế BĐS định kỳ từ res_high và com_* (Tỷ VNĐ)
  monthlyLandUseRevenue?: number;  // Thu tiền sử dụng đất 1 lần khi xây res_high, com_mall, com_office (Tỷ VNĐ)
  monthlyBankNet?: number;         // Dòng tiền ròng từ Ngân hàng Đô thị (Vay/Trả nợ/Gửi tiết kiệm, Tỷ VNĐ)
  netIncome: number;
  treasuryAfter: number;
  roadAndDrainageTileCount: number;
  activeEntityCount: number;
  entityBreakdown: EntityLedgerRecord[];
}

export interface BankLoan {
  id: string;
  principal: number;
  remainingPrincipal: number;
  monthlyRatePercent: number;
  totalMonths: number;
  remainingMonths: number;
  collateralTile?: { x: number; z: number };
}

export interface BankDeposit {
  id: string;
  amount: number;
  monthlyRatePercent: number;
  totalMonths: number;
  remainingMonths: number;
  accruedInterest: number;
}

export interface TileData {
  x: number;
  z: number;
  type: TileType;
  elevation: number;        // 0 = vùng trũng ven sông, 1 = đất bằng, 2 = gò cao
  landValue: number;        // Khung giá đất (Tỷ VNĐ, đất hoang khởi điểm 0.0005 - 0.001 Tỷ = 500k - 1 Triệu VNĐ)
  isReservedPublicLand?: boolean; // Đã khoanh quỹ đất công (giảm 70% phí GPMB cho công trình công/đường bộ)
  reservedCostPaid?: number;      // Số tiền đặt cọc đã chi khi khoanh quỹ đất công (Tỷ VNĐ)
  hasDrainage: boolean;     // Đã hoàn thiện cống ngầm thoát nước chưa
  drainageRemainingDays?: number; // Thời gian thi công lắp ống thoát nước (1 ngày)
  isFlooded: boolean;       // Đang bị ngập do mưa bão / triều cường
  sidewalkVendors: boolean; // Có hàng quán vỉa hè tự phát hay không
  disputeTurns: number;     // Số tháng chậm tiến độ do khiếu kiện đền bù thấp
  supplyRatio: number;      // Tỷ lệ nhận đủ hàng từ chuỗi cung ứng (0.0 - 1.0)
  level: number;

  // --- Định danh Thực thể & Thuộc tính Tài chính (Entity Identity & Accounting) ---
  instanceId?: string;      // InstanceID duy nhất (ví dụ: "BLD-001")
  customName?: string;      // CustomName mặc định hệ thống tự sinh (ví dụ: "Chợ Truyền Thống Bến Thành #1")
  revenue?: number;         // Doanh thu / Sản lượng gộp tháng (Tỷ VNĐ)
  taxPIT?: number;          // Thuế TNCN trích từ cư dân / nhân sự tại công trình (Tỷ VNĐ)
  taxCIT?: number;          // Thuế TNDN trích từ sản lượng doanh nghiệp / chợ (Tỷ VNĐ)
  maintenanceCost?: number; // Phí duy trì / bảo dưỡng hạ tầng của công trình (Tỷ VNĐ)
  netIncome?: number;       // Thu nhập ngân sách ròng (taxPIT + taxCIT - maintenanceCost, Tỷ VNĐ)

  // --- Tách biệt Vỏ & Lõi (BuildingData & Construction) ---
  constructionTotalDays: number;     // Tổng số ngày cần để xây dựng hoàn thiện
  constructionRemainingDays: number; // Số ngày xây dựng còn lại (0 = đã hoàn thiện)
  maxCapacity: number;               // Sức chứa cư dân tối đa (Nhà ống: 8, Chung cư mini: 120, Chung cư cao cấp: 600)
  currentOccupants: number;          // Số người đang ở thực tế (khởi tạo = 0 khi vừa xây xong)
  occupantsByTier: LaborTierCounts;  // Phân tầng cư dân đang cư trú thực tế trong tòa nhà
  minimumWealthLevel: WealthLevel;   // Phân tầng BĐS ('high' cấm lao động phổ thông vào ở)

  // --- Liên kết Dân cư với Nơi làm việc (Job Pathfinding) ---
  requiredWorkers: LaborTierCounts;  // Nhu cầu nhân sự tối đa (Job Slots: 20 - 50 người cho Bệnh viện/Trường học...)
  assignedWorkers: LaborTierCounts;  // Nhân sự thực tế đã tìm được việc tại công trình này
  junctionType?: RoadJunctionType;   // Loại nút giao đường bộ tự động bắt dính (Snapping)
  citHistory?: MonthlyCitEntry[];    // Lịch sử doanh thu Thuế TNDN (CIT) theo từng tháng của công trình
  lowEfficiencyMonths?: number;      // Số tháng liên tiếp công trình kinh tế chạy < 50% công suất
  localSupplyIndex?: number;         // Chỉ số chuỗi cung ứng cục bộ bán kính 5 ô (0 - 100%, không cộng dồn khi đặt cạnh nhau)
}

export interface TileDetailedReport {
  instanceId: string;
  customName: string;
  title: string;
  categoryLabel: string;
  connectedToRoad: boolean;
  isUnderConstruction: boolean;
  constructionRemainingDays: number;
  constructionTotalDays: number;
  maxCapacity: number;
  currentOccupants: number;
  minimumWealthLevel: WealthLevel;
  requiredWorkersTotal: number;
  assignedWorkersTotal: number;
  requiredWorkers: LaborTierCounts;
  assignedWorkers: LaborTierCounts;
  staffingRatio: number;
  missingWorkersWarning: string | null;
  totalStaffOrPop: number;
  unskilledCount: number;
  skilledCount: number;
  educatedCount: number;
  dominantLaborLabel: string;
  corporateTaxKey: keyof MacroPolicies | null;
  corporateTaxLabel: string;
  corporateTaxRate: number;
  revenue: number;
  grossOutputBillion: number;
  taxCIT: number;
  corporateTaxRevenue: number;
  potentialMaxCitRevenue: number;
  economicEfficiencyPercent: number;
  taxPIT: number;
  pitTaxRevenue: number;
  maintenanceCost: number;
  netIncome: number;
  netEconomicContribution: number;
  monthlyCitBreakdown: MonthlyCitEntry[];
  junctionType?: RoadJunctionType;
  sectorOwnership?: 'public' | 'private'; // Phân hóa dòng tài chính: Công lập (bù lỗ ngân sách) vs Tư nhân (đóng thuế CIT)
  residentIncomeSuitabilityPercent?: number; // Mức độ tương xứng thu nhập dân cư đối với dịch vụ Y tế/Giáo dục tư nhân (0-100%)
  isPublicUtilityOrService?: boolean;     // true với công trình Công (util_power_water, pub_admin, pub_hospital, pub_school, pub_security, pub_edu_med)
  publicServiceBadgeLabel?: string;       // Nhãn công suất góc phải cột 2 (thay cho "Hiệu suất 0%")
  publicServiceSummaryLabel?: string;     // Nhãn công suất phục vụ chính (ví dụ: "Phục vụ: X/Y công trình · Tải Z%" hoặc "Hiệu lực thu thuế: 100% (Chống thất thoát)")
  publicServiceDetailLabel?: string;      // Mô tả hiệu ứng công ích của công trình công
  localSupplyIndex?: number;              // Chỉ số cung ứng cục bộ bán kính 5 ô (0 - 100%)
}

export interface MacroPolicies {
  // Thuế Thu nhập Cá nhân lũy tiến (PIT: 0% - 35%)
  pitLow: number;       // Lao động phổ thông
  pitMid: number;       // Lao động trung cấp
  pitEducated: number;  // Lao động có bằng cấp (>25% gây Chảy máu chất xám)

  // Thuế Thu nhập Doanh nghiệp (CIT: 5% - 30%)
  citAgri: number;      // Nông lâm thủy sản
  citIndustry: number;  // Công nghiệp sản xuất
  citMarket: number;    // Chợ truyền thống, thương mại & dịch vụ tư nhân (Y tế/Giáo dục tư)
  citFdi: number;       // FDI Công nghệ cao (ảnh hưởng trực tiếp đến chỉ số PCI)
  citShowbiz: number;   // Ngành giải trí & sự kiện Showbiz

  // Chính sách Đền bù Giải tỏa & An sinh Xã hội
  compensationLevel: CompensationLevel;
  welfareLevel: number; // Ngân sách trợ cấp người có công, giảm nghèo, thất nghiệp (0 - 100)

  // Điều tiết Giao thông Vi mô & Đặc thù bản địa (tương thích ngược + nâng cấp Tab [G])
  greenLightMainRatio: number;   // (Tương thích ngược) Chu kỳ đèn xanh trục chính
  allowSidewalkEconomy: boolean; // (Tương thích ngược) Cho phép hàng quán vỉa hè
  banPeakHeavyTrucks: boolean;   // (Tương thích ngược) Cấm xe tải nặng giờ cao điểm
  subsidizeBusTransit: boolean;  // (Tương thích ngược) Trợ giá tuyến xe Bus

  transitLevel?: TransitLevel;       // 0: Tự phát | 1: Bus Trợ giá (-0.15 Tỷ/th) | 2: BRT Nhanh (-0.4 Tỷ/th)
  enableTollbooth?: boolean;         // Thu phí trạm BOT 30.000 VNĐ/lượt ô tô/tải trên đường chính để bù đắp upkeep đường
  sidewalkPolicy?: SidewalkPolicy;   // 'ban' (Cấm vỉa hè) | 'informal' (Tự phát) | 'licensed' (Cấp phép thu phí vỉa hè, giữ PCCC 100%)
  banTrucksInResidential?: boolean;  // Cấm xe tải đi vào đường hẻm & đường sát khu dân cư
}

export interface LaborBreakdown {
  unskilled: number; // Tiểu thương, bán hàng rong, công nhân thời vụ
  skilled: number;   // Nhân viên dịch vụ, kỹ thuật viên, hành chính
  educated: number;  // Kỹ sư FDI, chuyên gia công nghệ cao, y bác sĩ, Showbiz
  employedUnskilled: number;
  employedSkilled: number;
  employedEducated: number;
  totalJobSlots: number;
  totalEmployed: number;
  housingCapacity: number;
  brainDrainActive: boolean;
}

export interface MacroMetrics {
  population: number;
  housingCapacity: number;
  labor: LaborBreakdown;
  pci: number;                    // Chỉ số Năng lực Cạnh tranh cấp tỉnh (0 - 100)
  pciInfraScore: number;          // Điểm Hạ tầng (trọng số 40%)
  pciAdminScore: number;          // Điểm Hiệu quả Hành chính (trọng số 30%)
  pciTaxScore: number;            // Điểm Ưu đãi Thuế FDI (trọng số 30%)
  trafficSpeedIndex: number;      // Chỉ số tốc độ lưu thông (0 - 100%)
  supplyChainIndex: number;       // Hiệu suất chuỗi cung ứng Logistics (0 - 100%)
  floodedTileCount: number;       // Số phân khu đang ngập lụt
  drainageCoverage: number;       // Tỷ lệ bao phủ cống ngầm thoát nước (%)
  socialStability: number;        // Chỉ số An sinh & Trật tự xã hội (0 - 100%)
  happiness: number;              // Độ hài lòng người dân (0 - 100%)
  monthlyRevenue: number;         // Thu ngân sách tháng (Tỷ VNĐ)
  monthlyExpense: number;         // Chi ngân sách tháng (Tỷ VNĐ)
  netBalance: number;             // Cân đối ngân sách tháng (Tỷ VNĐ)
  crimeRisk: number;              // Nguy cơ tội phạm & khiếu kiện (0 - 100%)
  emergencyAccessCoverage: number;// Khả năng tiếp cận cứu hỏa/cứu thương (%)
  underConstructionCount: number; // Số công trình đang thi công
  staffShortageBuildings: number; // Số công trình đang thiếu nhân sự (ví dụ Bệnh viện thiếu bác sĩ)
  canTriggerConcert: boolean;     // Đủ điều kiện tổ chức Đại nhạc hội Showbiz hay chưa
  concertBlockReason: string | null; // Lý do khóa nút Đại nhạc hội (chống hack tiền đầu game)
  canExpandRegion: boolean;       // Đạt điều kiện dân số & ngân sách mở rộng vùng 9x9
  emigrationRatePercent: number;  // Tỷ lệ di cư rời thành phố trong khủng hoảng (% mỗi tháng)
  utilityActiveStations?: number;       // Số trạm Điện/Nước hoàn thiện và có nhân sự
  utilityCapacityPop?: number;          // Công suất cấp điện/nước tối đa cho dân cư (250 dân / trạm)
  utilityCapacityBuildings?: number;    // Công suất cấp điện/nước tối đa cho công trình (20 công trình / trạm)
  utilityDemandBuildings?: number;      // Số công trình đang tiêu thụ điện/nước
  utilityLoadPercent?: number;          // Tỷ lệ tải hệ thống Điện/Nước (%)
  isUtilityOverloaded?: boolean;        // Đang quá tải Điện/Nước (utilityLoadPercent > 100%)
  hasActivePublicAdmin?: boolean;       // Thành phố có UBND hoạt động đủ nhân sự hay không
  taxCollectionEfficiencyPercent?: number; // Hiệu lực thu thuế (100% khi có UBND đủ nhân sự, 88% khi thất thoát 12%)
  foodSupplyPercent?: number;           // Tỷ lệ tự chủ lương thực từ agr_farm (180 dân / nông trại)
  foodCapacityPop?: number;             // Sức nuôi tối đa của các agr_farm đang hoạt động
  tollboothRevenue?: number;            // Doanh thu trạm thu phí BOT bù đắp phí bảo trì đường (Tỷ/tháng)
  transitUpkeep?: number;               // Chi phí trợ giá Bus / BRT (Tỷ/tháng)
  sidewalkLicenseRevenue?: number;      // Phí cấp phép kinh doanh vỉa hè có trật tự (Tỷ/tháng)
  pollutionPenaltyHappiness?: number;   // Điểm trừ Hạnh phúc do ô nhiễm từ ind_factory gần khu dân cư
  totalRegionalPopulation?: number;     // Tổng dân số gộp trên toàn bộ các vùng đã mở khóa
  totalRegionalJobs?: number;           // Tổng việc làm gộp trên toàn bộ các vùng đã mở khóa
  monthlyPropertyTax?: number;          // Thuế BĐS định kỳ từ res_high và com_* (Tỷ/tháng)
  monthlyLandUseRevenue?: number;       // Tiền sử dụng đất 1 lần thu trong tháng (Tỷ/tháng)
  monthlyBankNet?: number;              // Dòng tiền ngân hàng dự kiến trong tháng (Tỷ/tháng)
  highLandValueResLowWithoutTransit?: number; // Số ô res_low tại vùng giá đất > 8 Tỷ nhưng chưa bật Bus/BRT
}

export interface BuildingFinancialPreview {
  costBillion: number;
  costLabel: string;
  upkeepBillion: number;
  upkeepLabel: string;
  requiredWorkersTotal: number;
  workersLabel: string;
  expectedMonthlyTaxOrOutputBillion: number;
  expectedTaxOrOutputLabel: string;
  paybackMonths: number | null;
  paybackLabel: string;
  isPublicInvestment: boolean;
}

export interface PlacementRiskEvaluation {
  hasRisk: boolean;
  missingWorkersTotal: number;
  missingByTier: LaborTierCounts;
  expectedMonthlyUpkeep: number;
  expectedMonthlyRevenueContribution: number;
  expectedMonthlyNetDeficit: number;
  upkeepToRevenuePercent: number;
  isWorkerShortageRisk: boolean;
  isUpkeepOverThresholdRisk: boolean;
  reasons: string[];
  warningTitle: string;
  warningMessage: string;
}

export interface ToolMetadata {
  id: ToolId;
  name: string;
  shortName: string;
  category: 'zoning' | 'infra' | 'road' | 'special';
  cost: number;           // Chi phí đầu tư xây dựng cơ bản (Tỷ VNĐ, ví dụ 0.008 = 8 Triệu VNĐ)
  constructionDays: number; // Thời gian xây dựng hoàn thiện (Ngày)
  keyHint: string;
  roleClue: string;
  prerequisiteLabel: string; // Điều kiện bắt buộc để xây dựng công trình này
  description: string;
}

export interface RunSnapshot {
  outcome: 'victory' | 'defeat';
  reason: string;
  month: number;
  year: number;
  treasury: number;
  population: number;
  pci: number;
  socialStability: number;
}

export interface RegionSector {
  rx: number; // 0..8 trên lưới 9x9
  rz: number; // 0..8 trên lưới 9x9
  name: string;
  unlocked: boolean;
  population: number;
  grid: TileData[][];
}

export type CityLevel = 1 | 2 | 3 | 4 | 5;

export interface CityLevelSpec {
  level: CityLevel;
  title: string;
  minPopulation: number;
  minTreasury?: number;
  unlockSummary: string;
}

export interface OnboardingQuestSpec {
  step: number;
  id: string;
  title: string;
  objective: string;
  mechanicExplanation: string;
  targetCount: number;
  recommendedTool?: ToolId;
}

export interface CityGameState {
  mode: GameStateMode;
  difficulty: DifficultyLevel; // Độ khó: 'easy' (80 Tỷ, -20% Upkeep) | 'hard' (50 Tỷ Chuẩn) | 'expert' (32 Tỷ, +30% giải tỏa, crisisTimer=2)
  endlessMode?: boolean;       // Đã chọn "Tiếp tục chơi Endless" sau khi đạt Chiến thắng
  day: number;      // Ngày trong tháng (1..30), mỗi chu kỳ 5-8 giây thực tế tăng 1 ngày
  month: number;
  year: number;
  treasury: number; // Ngân sách thành phố (Tỷ VNĐ, khởi điểm 50 Tỷ VNĐ)
  bestPci: number;
  season: SeasonType;
  activeConcertMonths: number;
  selectedTool: ToolId;
  selectedTile: { x: number; z: number } | null;
  activeRegion: { rx: number; rz: number }; // Tọa độ trên bản đồ vùng 9x9
  unlockedRegions: string[];                // Danh sách khóa "rx,rz" đã mở
  regionGrids: Record<string, TileData[][]>;
  grid: TileData[][];
  policies: MacroPolicies;
  metrics: MacroMetrics;
  lastEventBanner: string;
  snapshot: RunSnapshot | null;

  // --- Hệ thống Cảnh báo Khủng hoảng Cuối Tháng (End-of-Month Crisis & Grace Period) ---
  isCrisis: boolean;                        // Đang trong trạng thái Khủng hoảng (IsCrisis)
  crisisTimer: number;                      // Bộ đếm ngược số tháng Khủng hoảng (CrisisTimer: 3 -> 0)
  crisisMonthsElapsed: number;              // Số tháng khủng hoảng đã trôi qua (mỗi tháng PCI -5, Emigration +10%)
  consecutiveNegativeBudgetMonths: number;  // Số tháng liên tiếp Ngân sách < 0 (đạt 2 tháng sẽ kích hoạt Crisis)
  lastEmigratedCount: number;               // Số người dân di cư rời bỏ thành phố trong kỳ khủng hoảng gần nhất

  // --- Hệ thống Sổ cái (GlobalLedger), Chu kỳ Thời gian (Time Tick) & Thông báo Quyết toán ---
  nextInstanceSeq: number;                  // Bộ đếm sinh InstanceID tự động cho từng công trình
  globalLedger: LedgerEntry[];              // Mảng dữ liệu toàn cục lưu lịch sử dòng tiền ngày/tháng
  latestSettlementReport: LedgerEntry | null; // Báo cáo Quyết toán Cuối tháng mới nhất
  hasUnreadSettlement: boolean;             // Có dữ liệu quyết toán mới chưa đọc (hiển thị Chấm than đỏ trên Icon HUD)
  dayTickIntervalMs: number;                // Thời gian trôi 1 ngày trong game (5000ms - 8000ms thực tế, mặc định 6000ms = 6 giây/ngày)

  // --- Hệ thống Cấp Độ Thành Phố (City Level 1-5), Mở Khóa Tính Năng & Nhiệm Vụ Tân Thủ (Onboarding Quests) ---
  cityLevel: CityLevel;                     // Cấp độ đô thị hiện tại (1..5), khởi tạo = 1
  onboardingStep: number;                   // Bước nhiệm vụ tân thủ hiện tại (1..5)
  onboardingCompleted: boolean;             // Đã hoàn thành toàn bộ chuỗi nhiệm vụ khởi nghiệp chưa
  completedQuests: string[];                // Danh sách ID các nhiệm vụ đã hoàn thành
  loans: BankLoan[];                        // Danh sách khoản vay Ngân hàng Đô thị đang hoạt động
  deposits: BankDeposit[];                  // Danh sách sổ tiết kiệm Ngân hàng Đô thị đang gửi
  lastSavedAt?: string | null;              // Thời điểm Auto-Save gần nhất
}

export type AmbienceZoneType =
  | 'nature'
  | 'waterfront'
  | 'residential'
  | 'commercial'
  | 'industrial'
  | 'traffic'
  | 'showbiz';

export interface AmbienceProfile {
  dominantZone: AmbienceZoneType;
  zoneLabel: string;
  focusGridX: number;
  focusGridZ: number;
  populationDensity: number;    // 0.0 - 1.0
  trafficIntensity: number;     // 0.0 - 1.0
  commercialIntensity: number;  // 0.0 - 1.0
  industryIntensity: number;    // 0.0 - 1.0
  natureWaterIntensity: number; // 0.0 - 1.0
}

export interface AdvisorRecommendation {
  id: string;
  priority: 'urgent' | 'high' | 'opportunity';
  title: string;
  analysis: string;
  actionLabel: string;
  actionType: 'select_tool' | 'adjust_policy' | 'open_drawer';
  toolId?: ToolId;
  policyKey?: keyof MacroPolicies;
  policyValue?: number | boolean | CompensationLevel | TransitLevel | SidewalkPolicy;
  drawerTab?: 'economy' | 'traffic';
}

export interface AdvisorBriefing {
  month: number;
  year: number;
  seasonLabel: string;
  healthGrade: 'A' | 'B' | 'C' | 'D' | 'Crisis';
  headline: string;
  financialSummary: string;
  topTaxContributor: string | null;
  heaviestUpkeepEntity: string | null;
  diagnostics: string[];
  recommendations: AdvisorRecommendation[];
}

