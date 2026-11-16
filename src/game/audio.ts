import { AmbienceProfile, AmbienceZoneType, TileData } from './types';

export const AMBIENCE_ZONE_LABELS: Record<AmbienceZoneType, string> = {
  nature: 'Đất Quy Hoạch & Nông Nghiệp',
  waterfront: 'Bến Sông & Vùng Trũng Sinh Thái',
  residential: 'Khu Dân Cư Đô Thị',
  commercial: 'Phố Chợ & Trung Tâm Thương Mại',
  industrial: 'Khu Công Nghiệp & Nhà Máy FDI',
  traffic: 'Trục Giao Thông Huyết Mạch',
  showbiz: 'Tổ Hợp Sự Kiện & Showbiz',
};

/**
 * Tính toán hồ sơ âm thanh nền (AmbienceProfile) dựa trên tọa độ ô lưới trung tâm mà Camera đang hướng tới
 * (focusGridX, focusGridZ), loại công trình xung quanh bán kính 2 ô và mật độ dân số thực tế.
 */
export function computeCameraAmbienceProfile(
  grid: TileData[][],
  focusGridX: number,
  focusGridZ: number,
  totalPopulation: number,
  cameraDistance = 42
): AmbienceProfile {
  const rows = grid.length;
  const cols = rows > 0 ? grid[0].length : 0;
  const cx = Math.max(0, Math.min(cols - 1, Math.round(focusGridX)));
  const cz = Math.max(0, Math.min(rows - 1, Math.round(focusGridZ)));

  let resWeight = 0;
  let comWeight = 0;
  let indWeight = 0;
  let trafficWeight = 0;
  let waterWeight = 0;
  let natureWeight = 0;
  let showbizWeight = 0;
  let localOccupants = 0;
  let localWorkers = 0;

  const radius = 2;
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const tx = cx + dx;
      const tz = cz + dz;
      if (tz < 0 || tz >= rows || tx < 0 || tx >= cols) continue;

      const tile = grid[tz][tx];
      const dist = Math.hypot(dx, dz);
      const w = 1 / (1 + dist * 0.65);

      localOccupants += (tile.currentOccupants || 0) * w;
      const assigned =
        (tile.assignedWorkers?.unskilled ?? 0) +
        (tile.assignedWorkers?.skilled ?? 0) +
        (tile.assignedWorkers?.educated ?? 0);
      localWorkers += assigned * w;

      switch (tile.type) {
        case 'res_low':
          resWeight += 1.2 * w;
          break;
        case 'res_mid':
          resWeight += 2.1 * w;
          break;
        case 'res_high':
          resWeight += 3.2 * w;
          break;
        case 'com_street':
        case 'com_market':
          comWeight += 2.4 * w;
          break;
        case 'com_mall':
        case 'priv_hospital':
        case 'priv_school':
          comWeight += 2.8 * w;
          break;
        case 'pub_admin':
        case 'pub_hospital':
        case 'pub_school':
        case 'pub_edu_med':
        case 'pub_security':
          resWeight += 1.1 * w;
          comWeight += 1.1 * w;
          break;
        case 'ind_factory':
        case 'ind_fdi':
        case 'util_power_water':
          indWeight += 3.0 * w;
          break;
        case 'showbiz_stadium':
          showbizWeight += 3.8 * w;
          comWeight += 1.5 * w;
          break;
        case 'road_alley':
          trafficWeight += 0.9 * w;
          break;
        case 'road_urban':
          trafficWeight += 1.8 * w;
          break;
        case 'road_highway':
        case 'gateway_port':
        case 'gateway_station':
          trafficWeight += 2.8 * w;
          break;
        case 'river_water':
          waterWeight += 2.6 * w;
          break;
        case 'lowland_marsh':
          waterWeight += 1.5 * w;
          natureWeight += 1.2 * w;
          break;
        case 'agr_farm':
          natureWeight += 2.2 * w;
          break;
        case 'empty_land':
        default:
          natureWeight += 1.0 * w;
          break;
      }
    }
  }

  // Hệ số thu phóng khoảng cách camera: càng zoom gần vào khu phố thì âm thanh đặc trưng càng rõ
  const zoomFactor = Math.max(
    0.4,
    Math.min(1.2, 1.22 - (cameraDistance - 16) / 115)
  );

  const cityPopFactor = Math.min(1, totalPopulation / 1200);
  const localPopFactor = Math.min(1, (localOccupants + localWorkers * 1.4) / 220);
  const resPresenceFactor = Math.min(1, resWeight / 5.5);

  const populationDensity = Number(
    Math.min(
      1,
      (localPopFactor * 0.62 + cityPopFactor * 0.23 + resPresenceFactor * 0.25) *
        zoomFactor
    ).toFixed(3)
  );

  const trafficIntensity = Number(
    Math.min(
      1,
      ((trafficWeight / 5.2) * 0.72 + populationDensity * 0.28) * zoomFactor
    ).toFixed(3)
  );

  const commercialIntensity = Number(
    Math.min(
      1,
      ((comWeight + showbizWeight * 0.9) / 5.0) * zoomFactor
    ).toFixed(3)
  );

  const industryIntensity = Number(
    Math.min(1, (indWeight / 4.5) * zoomFactor).toFixed(3)
  );

  const natureWaterIntensity = Number(
    Math.min(
      1,
      Math.max(
        0.08,
        ((waterWeight * 1.15 + natureWeight * 0.75) / 8.5) *
          (1 - Math.min(0.65, ( commercialIntensity + industryIntensity) * 0.5))
      )
    ).toFixed(3)
  );

  // Xác định vùng âm thanh chủ đạo tại vị trí camera đang quan sát
  // Ưu tiên công trình chức năng (Showbiz, Công nghiệp, Thương mại, Dân cư) hơn mặt đường giao thông phụ trợ kế bên
  let dominantZone: AmbienceZoneType = 'nature';
  const builtScores: { zone: AmbienceZoneType; score: number }[] = [
    { zone: 'showbiz', score: showbizWeight * 1.65 },
    { zone: 'industrial', score: indWeight * 1.55 },
    { zone: 'commercial', score: comWeight * 1.45 },
    {
      zone: 'residential',
      score: resWeight * 1.35 + localPopFactor * 2.6,
    },
    { zone: 'traffic', score: trafficWeight * 0.55 },
  ];
  builtScores.sort((a, b) => b.score - a.score);

  if (builtScores[0].score >= 1.15) {
    dominantZone = builtScores[0].zone;
  } else if (waterWeight >= 2.2) {
    dominantZone = 'waterfront';
  } else {
    dominantZone = 'nature';
  }

  const baseLabel = AMBIENCE_ZONE_LABELS[dominantZone];
  const densitySuffix =
    dominantZone === 'residential' || dominantZone === 'commercial'
      ? populationDensity >= 0.6
        ? ' (Mật độ cao)'
        : populationDensity >= 0.25
        ? ' (Nhộn nhịp)'
        : ' (Yên tĩnh)'
      : '';

  return {
    dominantZone,
    zoneLabel: `${baseLabel}${densitySuffix}`,
    focusGridX: cx,
    focusGridZ: cz,
    populationDensity,
    trafficIntensity,
    commercialIntensity,
    industryIntensity,
    natureWaterIntensity,
  };
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  public muted = false;
  public currentAmbienceProfile: AmbienceProfile = {
    dominantZone: 'nature',
    zoneLabel: AMBIENCE_ZONE_LABELS.nature,
    focusGridX: 9,
    focusGridZ: 9,
    populationDensity: 0,
    trafficIntensity: 0,
    commercialIntensity: 0,
    industryIntensity: 0,
    natureWaterIntensity: 0.5,
  };

  // Các node âm thanh nền (Web Audio Ambience Graph)
  private ambienceStarted = false;
  private masterAmbienceGain: GainNode | null = null;
  private natureGain: GainNode | null = null;
  private natureFilter: BiquadFilterNode | null = null;
  private crowdGain: GainNode | null = null;
  private crowdFilter: BiquadFilterNode | null = null;
  private industryTrafficOsc: OscillatorNode | null = null;
  private industryTrafficGain: GainNode | null = null;
  private industryTrafficFilter: BiquadFilterNode | null = null;
  private lastAccentAt = 0;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        try {
          this.ctx = new AudioCtx();
        } catch {
          this.ctx = null;
        }
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private ensureAmbienceGraph(ctx: AudioContext): void {
    if (this.ambienceStarted && this.masterAmbienceGain) return;
    try {
      const now = ctx.currentTime;
      const master = ctx.createGain();
      master.gain.setValueAtTime(this.muted ? 0 : 0.22, now);
      master.connect(ctx.destination);
      this.masterAmbienceGain = master;

      // Tạo bộ đệm nhiễu trắng/hồng 2 giây để tổng hợp tiếng gió sông & tiếng rì rầm đô thị
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + white * 0.029;
        b1 = 0.985 * b1 + white * 0.032;
        b2 = 0.95 * b2 + white * 0.048;
        data[i] = (b0 + b1 + b2 + white * 0.015) * 0.35;
      }

      // Layer 1: Âm thanh Gió sông & Sinh thái tự nhiên (Lowpass Noise)
      const natureSource = ctx.createBufferSource();
      natureSource.buffer = noiseBuffer;
      natureSource.loop = true;
      const natureFilter = ctx.createBiquadFilter();
      natureFilter.type = 'lowpass';
      natureFilter.frequency.setValueAtTime(320, now);
      const natureGain = ctx.createGain();
      natureGain.gain.setValueAtTime(0.03, now);
      natureSource.connect(natureFilter);
      natureFilter.connect(natureGain);
      natureGain.connect(master);
      natureSource.start(now);
      this.natureFilter = natureFilter;
      this.natureGain = natureGain;

      // Layer 2: Âm thanh Mật độ Dân cư & Phố chợ nhộn nhịp (Bandpass Formant Murmur)
      const crowdSource = ctx.createBufferSource();
      crowdSource.buffer = noiseBuffer;
      crowdSource.loop = true;
      const crowdFilter = ctx.createBiquadFilter();
      crowdFilter.type = 'bandpass';
      crowdFilter.frequency.setValueAtTime(580, now);
      crowdFilter.Q.setValueAtTime(2.2, now);
      const crowdGain = ctx.createGain();
      crowdGain.gain.setValueAtTime(0.001, now);
      crowdSource.connect(crowdFilter);
      crowdFilter.connect(crowdGain);
      crowdGain.connect(master);
      crowdSource.start(now);
      this.crowdFilter = crowdFilter;
      this.crowdGain = crowdGain;

      // Layer 3: Âm thanh Động cơ Giao thông & Nhà máy Công nghiệp (Low Drone)
      const indOsc = ctx.createOscillator();
      indOsc.type = 'triangle';
      indOsc.frequency.setValueAtTime(72, now);
      const indFilter = ctx.createBiquadFilter();
      indFilter.type = 'lowpass';
      indFilter.frequency.setValueAtTime(140, now);
      const indGain = ctx.createGain();
      indGain.gain.setValueAtTime(0.001, now);
      indOsc.connect(indFilter);
      indFilter.connect(indGain);
      indGain.connect(master);
      indOsc.start(now);
      this.industryTrafficOsc = indOsc;
      this.industryTrafficFilter = indFilter;
      this.industryTrafficGain = indGain;

      this.ambienceStarted = true;
    } catch {
      // Ignore Web Audio graph error in restricted headless environments
    }
  }

  /**
   * Cập nhật âm thanh nền (Ambience) theo vị trí Camera, loại công trình và mật độ dân số.
   */
  public updateAmbienceFromCamera(
    grid: TileData[][],
    focusGridX: number,
    focusGridZ: number,
    totalPopulation: number,
    cameraDistance = 42
  ): AmbienceProfile {
    const profile = computeCameraAmbienceProfile(
      grid,
      focusGridX,
      focusGridZ,
      totalPopulation,
      cameraDistance
    );
    this.currentAmbienceProfile = profile;

    if (this.muted) return profile;
    const ctx = this.ensureContext();
    if (!ctx) return profile;
    this.ensureAmbienceGraph(ctx);

    const now = ctx.currentTime;
    const smoothTime = 0.25;

    if (this.natureGain && this.natureFilter) {
      const targetNatureGain = 0.015 + profile.natureWaterIntensity * 0.075;
      const targetNatureFreq =
        profile.dominantZone === 'waterfront' ? 440 : 280;
      this.natureGain.gain.setTargetAtTime(targetNatureGain, now, smoothTime);
      this.natureFilter.frequency.setTargetAtTime(
        targetNatureFreq,
        now,
        smoothTime
      );
    }

    if (this.crowdGain && this.crowdFilter) {
      const bustle = Math.min(
        1,
        profile.populationDensity * 0.65 + profile.commercialIntensity * 0.55
      );
      const targetCrowdGain = 0.002 + bustle * 0.085;
      const targetCrowdFreq = 460 + bustle * 380;
      this.crowdGain.gain.setTargetAtTime(targetCrowdGain, now, smoothTime);
      this.crowdFilter.frequency.setTargetAtTime(
        targetCrowdFreq,
        now,
        smoothTime
      );
    }

    if (
      this.industryTrafficGain &&
      this.industryTrafficOsc &&
      this.industryTrafficFilter
    ) {
      const mechLevel = Math.min(
        1,
        profile.industryIntensity * 0.75 + profile.trafficIntensity * 0.45
      );
      const targetIndGain = 0.001 + mechLevel * 0.055;
      const targetOscFreq =
        profile.dominantZone === 'industrial'
          ? 64 + profile.industryIntensity * 28
          : 82 + profile.trafficIntensity * 32;
      this.industryTrafficGain.gain.setTargetAtTime(
        targetIndGain,
        now,
        smoothTime
      );
      this.industryTrafficOsc.frequency.setTargetAtTime(
        targetOscFreq,
        now,
        smoothTime
      );
      this.industryTrafficFilter.frequency.setTargetAtTime(
        120 + mechLevel * 110,
        now,
        smoothTime
      );
    }

    // Điểm xuyết âm thanh chi tiết (Acoustic Micro-Accents) khi di chuyển camera qua các vùng đặc trưng
    if (now - this.lastAccentAt > 2.4) {
      this.lastAccentAt = now;
      this.playZoneMicroAccent(ctx, profile);
    }

    return profile;
  }

  private playZoneMicroAccent(
    ctx: AudioContext,
    profile: AmbienceProfile
  ): void {
    const now = ctx.currentTime;
    if (
      profile.dominantZone === 'commercial' ||
      profile.dominantZone === 'showbiz'
    ) {
      // Tiếng chuông leng keng phố thị / chợ truyền thống
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1174.66, now + 0.06);
      gain.gain.setValueAtTime(0.018 * profile.commercialIntensity, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.23);
    } else if (
      profile.dominantZone === 'residential' &&
      profile.populationDensity > 0.25
    ) {
      // Tiếng còi xe máy / nhịp sống khu dân cư nhẹ nhàng
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(493.88, now + 0.05);
      gain.gain.setValueAtTime(0.015 * profile.populationDensity, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.17);
    } else if (
      profile.dominantZone === 'nature' ||
      profile.dominantZone === 'waterfront'
    ) {
      // Tiếng chim hót / giọt nước ven sông thanh bình
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1318.5, now);
      osc.frequency.exponentialRampToValueAtTime(1567.98, now + 0.09);
      gain.gain.setValueAtTime(0.012 * profile.natureWaterIntensity, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.19);
    }
  }

  public stopAmbience(): void {
    if (this.masterAmbienceGain && this.ctx) {
      this.masterAmbienceGain.gain.setTargetAtTime(
        0.0001,
        this.ctx.currentTime,
        0.15
      );
    }
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.masterAmbienceGain && this.ctx) {
      this.masterAmbienceGain.gain.setTargetAtTime(
        this.muted ? 0.0001 : 0.22,
        this.ctx.currentTime,
        0.12
      );
    }
    return this.muted;
  }

  public playAdvisorAlert(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [587.33, 880];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.07);
      gain.gain.setValueAtTime(0.09, now + idx * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.07);
      osc.stop(now + idx * 0.07 + 0.23);
    });
  }

  public playBuild(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const pitchVar = 0.94 + Math.random() * 0.12;

    // Tactile foundation thud
    const oscLow = ctx.createOscillator();
    const gainLow = ctx.createGain();
    oscLow.type = 'triangle';
    oscLow.frequency.setValueAtTime(145 * pitchVar, now);
    oscLow.frequency.exponentialRampToValueAtTime(52, now + 0.14);
    gainLow.gain.setValueAtTime(0.24, now);
    gainLow.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    oscLow.connect(gainLow);
    gainLow.connect(ctx.destination);
    oscLow.start(now);
    oscLow.stop(now + 0.15);

    // Vietnamese pentatonic chime (Hò - Xự - Xang)
    const oscHigh = ctx.createOscillator();
    const gainHigh = ctx.createGain();
    oscHigh.type = 'sine';
    oscHigh.frequency.setValueAtTime(523.25 * pitchVar, now + 0.03);
    oscHigh.frequency.setValueAtTime(659.25 * pitchVar, now + 0.09);
    gainHigh.gain.setValueAtTime(0.14, now + 0.03);
    gainHigh.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    oscHigh.connect(gainHigh);
    gainHigh.connect(ctx.destination);
    oscHigh.start(now + 0.03);
    oscHigh.stop(now + 0.27);
  }

  public playClearance(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Heavy compensation stamp & demolition rumble
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.22);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  public playDrainage(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(560, now + 0.18);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.21);
  }

  public playConcert(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);
      gain.gain.setValueAtTime(0.12, now + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.36);
    });
  }

  public playClick(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(740, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.045);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  public playError(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(165, now);
    osc.frequency.setValueAtTime(130, now + 0.08);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.19);
  }
}

export const soundEngine = new SoundEngine();
