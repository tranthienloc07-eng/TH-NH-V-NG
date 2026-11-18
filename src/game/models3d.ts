import * as THREE from 'three';
import { RoadConnections, TileData } from './types';

export const TILE_WORLD_SIZE = 3.2;

export interface RiverBankConnections {
  northLand: boolean;
  southLand: boolean;
  westLand: boolean;
  eastLand: boolean;
}

let sharedMicroBumpTex: THREE.CanvasTexture | null = null;
let sharedAsphaltBumpTex: THREE.CanvasTexture | null = null;
let sharedWaterNormalTex: THREE.CanvasTexture | null = null;
let sharedRedTileRoofTex: THREE.CanvasTexture | null = null;
let sharedRedTileBumpTex: THREE.CanvasTexture | null = null;
let sharedContactShadowMat: THREE.MeshBasicMaterial | null = null;
let sharedShadowDiscGeo: THREE.CircleGeometry | null = null;

const roadTexCache = new Map<string, THREE.CanvasTexture>();
const facadeTexCache = new Map<
  string,
  { map: THREE.CanvasTexture; emissiveMap: THREE.CanvasTexture }
>();
const facadeMatCache = new Map<string, THREE.MeshStandardMaterial>();
const nightWindowMaterials = new Set<THREE.MeshStandardMaterial>();
const streetlightBulbMaterials = new Set<THREE.MeshStandardMaterial>();
let currentNightFactor = 0;

export function getMicroBumpTexture(maxAnisotropy = 4): THREE.CanvasTexture {
  if (sharedMicroBumpTex) return sharedMicroBumpTex;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 2) {
    for (let x = 0; x < 128; x += 2) {
      const v = 110 + ((x * 37 + y * 19) % 36);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x, y, 2, 2);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.anisotropy = maxAnisotropy;
  sharedMicroBumpTex = tex;
  return tex;
}

/**
 * Hạt nhựa đường sần (Asphalt Micro-Grain Bump Map) cho road_urban, road_ring, road_highway
 */
export function getAsphaltBumpTexture(maxAnisotropy = 4): THREE.CanvasTexture {
  if (sharedAsphaltBumpTex) return sharedAsphaltBumpTex;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#787878';
  ctx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const hash = ((x * 73 + y * 151 + ((x ^ y) * 31)) & 255) % 64;
      const v = 96 + hash;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.anisotropy = maxAnisotropy;
  sharedAsphaltBumpTex = tex;
  return tex;
}

/**
 * Procedural Normal Map gợn sóng cho Water shader (three/examples/jsm/objects/Water.js)
 */
export function getWaterNormalTexture(maxAnisotropy = 4): THREE.CanvasTexture {
  if (sharedWaterNormalTex) return sharedWaterNormalTex;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;

  for (let y = 0; y < size; y++) {
    const ny = (y / size) * Math.PI * 2;
    for (let x = 0; x < size; x++) {
      const nx = (x / size) * Math.PI * 2;
      const dx =
        Math.cos(nx * 4 + ny * 2) * 0.45 +
        Math.sin(nx * 8 - ny * 5) * 0.3 +
        Math.cos(nx * 13 + ny * 11) * 0.15;
      const dy =
        Math.sin(ny * 4 - nx * 3) * 0.45 +
        Math.cos(ny * 7 + nx * 6) * 0.3 +
        Math.sin(ny * 12 - nx * 9) * 0.15;
      const r = Math.max(0, Math.min(255, Math.round((dx * 0.5 + 0.5) * 255)));
      const g = Math.max(0, Math.min(255, Math.round((dy * 0.5 + 0.5) * 255)));
      const idx = (y * size + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = 242;
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  sharedWaterNormalTex = tex;
  return tex;
}

/**
 * Texture mái ngói đỏ Việt Nam (Vietnamese Terracotta Roof Tiles) cho res_low, com_market, pub_school
 */
export function getVietnameseRedTileRoofTexture(
  maxAnisotropy = 4
): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  if (sharedRedTileRoofTex && sharedRedTileBumpTex) {
    return { map: sharedRedTileRoofTex, bumpMap: sharedRedTileBumpTex };
  }

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 128;
  bumpCanvas.height = 128;
  const bCtx = bumpCanvas.getContext('2d')!;

  ctx.fillStyle = '#991b1b';
  ctx.fillRect(0, 0, 128, 128);
  bCtx.fillStyle = '#707070';
  bCtx.fillRect(0, 0, 128, 128);

  const rows = 8;
  const cols = 8;
  const rowH = 128 / rows;
  const colW = 128 / cols;

  for (let r = 0; r < rows; r++) {
    const y = r * rowH;
    const xShift = (r % 2) * (colW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const x = c * colW + xShift;
      const shade = ((r * 7 + c * 13) & 3) * 6;
      ctx.fillStyle = `rgb(${185 + shade}, ${28 + Math.floor(shade / 2)}, ${28})`;
      ctx.beginPath();
      ctx.roundRect(x + 1, y + 1, colW - 2, rowH - 2, 4);
      ctx.fill();

      ctx.strokeStyle = '#7f1d1d';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      bCtx.fillStyle = '#d4d4d4';
      bCtx.fillRect(x + 2, y + 2, colW - 4, rowH - 5);
      bCtx.fillStyle = '#383838';
      bCtx.fillRect(x, y + rowH - 3, colW, 3);
    }
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2, 2);
  map.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(2, 2);
  bumpMap.anisotropy = maxAnisotropy;

  sharedRedTileRoofTex = map;
  sharedRedTileBumpTex = bumpMap;
  return { map, bumpMap };
}

/**
 * Texture mặt tiền cao ốc (res_high, com_office, com_mall):
 * Lưới cửa sổ kính phản chiếu (roughness: 0.18, metalness: 0.55) kèm emissiveMap
 * (một số ô cửa sổ sáng đèn vàng ấm để dùng cho ban đêm).
 */
export function getHighriseFacadeMaterial(
  variant: 'res_high' | 'com_office' | 'com_mall',
  maxAnisotropy = 4
): THREE.MeshStandardMaterial {
  const cachedMat = facadeMatCache.get(variant);
  if (cachedMat) return cachedMat;

  let texPair = facadeTexCache.get(variant);
  if (!texPair) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    const emCanvas = document.createElement('canvas');
    emCanvas.width = 256;
    emCanvas.height = 256;
    const emCtx = emCanvas.getContext('2d')!;

    // Nền khung nhôm kính (mullion frame)
    if (variant === 'com_office') {
      ctx.fillStyle = '#0f2942';
    } else if (variant === 'com_mall') {
      ctx.fillStyle = '#1e293b';
    } else {
      ctx.fillStyle = '#334155';
    }
    ctx.fillRect(0, 0, 256, 256);

    emCtx.fillStyle = '#000000';
    emCtx.fillRect(0, 0, 256, 256);

    const cols = variant === 'com_mall' ? 6 : 8;
    const rows = variant === 'com_mall' ? 6 : 12;
    const cellW = 256 / cols;
    const cellH = 256 / rows;
    const padX = 4;
    const padY = 3;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const wx = c * cellW + padX;
        const wy = r * cellH + padY;
        const ww = cellW - padX * 2;
        const wh = cellH - padY * 2;

        // Kính phản chiếu bầu trời ban ngày
        const grad = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh);
        if (variant === 'com_office') {
          grad.addColorStop(0, '#38bdf8');
          grad.addColorStop(0.5, '#0284c7');
          grad.addColorStop(1, '#0369a1');
        } else if (variant === 'com_mall') {
          grad.addColorStop(0, '#7dd3fc');
          grad.addColorStop(1, '#0ea5e9');
        } else {
          grad.addColorStop(0, '#bae6fd');
          grad.addColorStop(1, '#0284c7');
        }
        ctx.fillStyle = grad;
        ctx.fillRect(wx, wy, ww, wh);

        // Nhiều ô cửa sổ sáng đèn vàng ấm vào ban đêm (emissiveMap)
        const hash = (r * 31 + c * 17 + (variant === 'com_office' ? 7 : 13)) % 10;
        const isLit = hash <= 6;
        if (isLit) {
          emCtx.fillStyle =
            hash % 3 === 0
              ? '#fde047'
              : variant === 'com_mall' && hash === 5
              ? '#7dd3fc'
              : '#fbbf24';
          emCtx.fillRect(wx + 1, wy + 1, ww - 2, wh - 2);
        }
      }
    }

    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = maxAnisotropy;

    const emissiveMap = new THREE.CanvasTexture(emCanvas);
    emissiveMap.colorSpace = THREE.SRGBColorSpace;
    emissiveMap.wrapS = THREE.RepeatWrapping;
    emissiveMap.wrapT = THREE.RepeatWrapping;
    emissiveMap.anisotropy = maxAnisotropy;

    texPair = { map, emissiveMap };
    facadeTexCache.set(variant, texPair);
  }

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: texPair.map,
    roughness: 0.18,
    metalness: 0.55,
    bumpMap: getMicroBumpTexture(maxAnisotropy),
    bumpScale: 0.01,
    emissive: new THREE.Color(0xffd166),
    emissiveMap: texPair.emissiveMap,
    emissiveIntensity: 0.14 + currentNightFactor * 2.65,
  });
  mat.userData.isSharedCachedMaterial = true;
  facadeMatCache.set(variant, mat);
  nightWindowMaterials.add(mat);
  return mat;
}

let sharedWarmNightWindowMat: THREE.MeshStandardMaterial | null = null;

/**
 * Vật liệu ô cửa sổ kính phát sáng vàng ấm nổi bật vào ban đêm cho nhà ở (res_low, res_mid, res_high) & thương mại (com_*)
 */
export function getWarmNightWindowMaterial(): THREE.MeshStandardMaterial {
  if (sharedWarmNightWindowMat) return sharedWarmNightWindowMat;
  sharedWarmNightWindowMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    roughness: 0.18,
    metalness: 0.25,
    emissive: new THREE.Color(0xfbbf24),
    emissiveIntensity: 0.18 + currentNightFactor * 3.1,
  });
  sharedWarmNightWindowMat.userData.isSharedCachedMaterial = true;
  nightWindowMaterials.add(sharedWarmNightWindowMat);
  return sharedWarmNightWindowMat;
}

/**
 * Cập nhật cường độ sáng đèn cửa sổ tòa nhà & bóng đèn đường theo pha Ngày/Đêm (0 = Sáng, 1 = Đêm)
 */
export function updateCityLightsEmissiveIntensity(nightFactor: number): void {
  const clamped = Math.max(0, Math.min(1, nightFactor));
  currentNightFactor = clamped;

  const facadeIntensity = 0.14 + clamped * 2.65;
  for (const mat of nightWindowMaterials) {
    if (mat === sharedWarmNightWindowMat) {
      mat.emissiveIntensity = 0.18 + clamped * 3.1;
    } else {
      mat.emissiveIntensity = facadeIntensity;
    }
  }

  const bulbIntensity = 0.18 + clamped * 2.4;
  for (const mat of streetlightBulbMaterials) {
    mat.emissiveIntensity = bulbIntensity;
  }
}

/**
 * Tạo texture mặt đường tự động xoay & nối liền theo đúng 4 hướng (north, south, west, east)
 * Bao gồm: hạt nhựa sần (bumpMap), vạch phân làn sắc nét, bó vỉa hè lát gạch và Zebra Crosswalk tại ngã 3/ngã 4.
 */
export function getConnectedRoadTexture(
  conn: RoadConnections,
  isHighway: boolean,
  maxAnisotropy = 4
): THREE.CanvasTexture {
  const hasNS = conn.north || conn.south;
  const hasWE = conn.west || conn.east;

  const n = conn.north || (!hasNS && !hasWE);
  const s = conn.south || (!hasNS && !hasWE);
  const w = conn.west;
  const e = conn.east;

  const fullNS = (n || s) && !w && !e;
  const fullWE = (w || e) && !n && !s;

  const key = `${isHighway ? 'hw' : 'ur'}_${n ? 1 : 0}${s ? 1 : 0}${w ? 1 : 0}${e ? 1 : 0}`;
  const cached = roadTexCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // 1. Nền vỉa hè lát gạch (Urban) hoặc lề bê tông (Highway)
  ctx.fillStyle = isHighway ? '#64748b' : '#9c9284';
  ctx.fillRect(0, 0, 256, 256);

  if (!isHighway) {
    // Hoạ tiết gạch lát vỉa hè (sidewalk paving grid)
    ctx.strokeStyle = 'rgba(68, 64, 60, 0.35)';
    ctx.lineWidth = 1;
    for (let p = 0; p < 256; p += 16) {
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, 256);
      ctx.moveTo(0, p);
      ctx.lineTo(256, p);
      ctx.stroke();
    }
  }

  const margin = isHighway ? 22 : 34;
  const roadWidth = 256 - margin * 2;
  const asphaltColor = isHighway ? '#1e242b' : '#252b33';

  // Bó vỉa hè lát gạch (Curb border)
  ctx.fillStyle = isHighway ? '#cbd5e1' : '#d6d3d1';
  if (fullNS) {
    ctx.fillRect(margin - 5, 0, roadWidth + 10, 256);
    // Viền bó vỉa đỏ-trắng đô thị
    for (let y = 0; y < 256; y += 32) {
      ctx.fillStyle = (y / 32) % 2 === 0 ? '#ef4444' : '#f8fafc';
      ctx.fillRect(margin - 4, y, 4, 32);
      ctx.fillRect(256 - margin, y, 4, 32);
    }
  } else if (fullWE) {
    ctx.fillRect(0, margin - 5, 256, roadWidth + 10);
    for (let x = 0; x < 256; x += 32) {
      ctx.fillStyle = (x / 32) % 2 === 0 ? '#ef4444' : '#f8fafc';
      ctx.fillRect(x, margin - 4, 32, 4);
      ctx.fillRect(x, 256 - margin, 32, 4);
    }
  }

  ctx.fillStyle = asphaltColor;

  const connCount = (n ? 1 : 0) + (s ? 1 : 0) + (w ? 1 : 0) + (e ? 1 : 0);
  const isLCorner = connCount === 2 && (n || s) && (w || e);

  if (fullNS) {
    ctx.fillRect(margin, 0, roadWidth, 256);
    drawNorthSouthMarkings(ctx, 0, 256, isHighway);
  } else if (fullWE) {
    ctx.fillRect(0, margin, 256, roadWidth);
    drawWestEastMarkings(ctx, 0, 256, isHighway);
  } else if (isLCorner) {
    const arcCx = e ? 256 : 0;
    const arcCy = s ? 256 : 0;
    let startAngle = 0;
    let endAngle = Math.PI / 2;
    if (n && e) {
      startAngle = Math.PI / 2;
      endAngle = Math.PI;
    } else if (s && e) {
      startAngle = Math.PI;
      endAngle = Math.PI * 1.5;
    } else if (s && w) {
      startAngle = Math.PI * 1.5;
      endAngle = Math.PI * 2;
    } else {
      startAngle = 0;
      endAngle = Math.PI / 2;
    }

    ctx.save();
    ctx.lineCap = 'butt';

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = roadWidth + 8;
    ctx.beginPath();
    ctx.arc(arcCx, arcCy, 128, startAngle, endAngle);
    ctx.stroke();

    ctx.strokeStyle = asphaltColor;
    ctx.lineWidth = roadWidth;
    ctx.beginPath();
    ctx.arc(arcCx, arcCy, 128, startAngle, endAngle);
    ctx.stroke();

    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 3;
    for (const rOffset of [-2.5, 2.5]) {
      ctx.beginPath();
      ctx.arc(arcCx, arcCy, 128 + rOffset, startAngle, endAngle);
      ctx.stroke();
    }

    const laneOffset = isHighway ? 52 : 46;
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 3;
    ctx.setLineDash([16, 16]);
    for (const lOff of [-laneOffset, laneOffset]) {
      ctx.beginPath();
      ctx.arc(arcCx, arcCy, 128 + lOff, startAngle, endAngle);
      ctx.stroke();
    }
    ctx.restore();
  } else {
    // Ngã ba (T-junction) hoặc Ngã tư (Cross-intersection)
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(margin - 4, margin - 4, roadWidth + 8, roadWidth + 8);
    ctx.fillStyle = asphaltColor;
    ctx.fillRect(margin, margin, roadWidth, roadWidth);
    if (n) ctx.fillRect(margin, 0, roadWidth, margin + 4);
    if (s) ctx.fillRect(margin, 256 - margin - 4, roadWidth, margin + 4);
    if (w) ctx.fillRect(0, margin, margin + 4, roadWidth);
    if (e) ctx.fillRect(256 - margin - 4, margin, margin + 4, roadWidth);

    if (n) drawNorthSouthMarkings(ctx, 0, margin, isHighway);
    if (s) drawNorthSouthMarkings(ctx, 256 - margin, 256, isHighway);
    if (w) drawWestEastMarkings(ctx, 0, margin, isHighway);
    if (e) drawWestEastMarkings(ctx, 256 - margin, 256, isHighway);

    // Vạch kẻ trắng qua đường (Zebra Crosswalk) sắc nét tại ngã 3 / ngã 4
    if (connCount >= 3) {
      ctx.fillStyle = '#f8fafc';
      for (let pos = margin + 10; pos < 256 - margin - 10; pos += 16) {
        if (n) ctx.fillRect(pos, margin + 3, 8, 16);
        if (s) ctx.fillRect(pos, 256 - margin - 19, 8, 16);
        if (w) ctx.fillRect(margin + 3, pos, 16, 8);
        if (e) ctx.fillRect(256 - margin - 19, pos, 16, 8);
      }
    }
  }

  // Hạt nhựa đường nhẹ trên bề mặt albedo
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let i = 0; i < 180; i++) {
    const gx = (i * 53) % 256;
    const gy = (i * 97) % 256;
    ctx.fillRect(gx, gy, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  roadTexCache.set(key, tex);
  return tex;
}

function drawNorthSouthMarkings(
  ctx: CanvasRenderingContext2D,
  yStart: number,
  yEnd: number,
  isHighway: boolean
): void {
  ctx.fillStyle = '#eab308';
  ctx.fillRect(124, yStart, 3, yEnd - yStart);
  ctx.fillRect(129, yStart, 3, yEnd - yStart);

  ctx.fillStyle = '#f8fafc';
  const laneOffset = isHighway ? 52 : 46;
  for (let y = yStart + 8; y < yEnd - 12; y += 36) {
    const dashLen = Math.min(18, yEnd - y);
    ctx.fillRect(128 - laneOffset, y, 3, dashLen);
    ctx.fillRect(128 + laneOffset, y, 3, dashLen);
  }
}

function drawWestEastMarkings(
  ctx: CanvasRenderingContext2D,
  xStart: number,
  xEnd: number,
  isHighway: boolean
): void {
  ctx.fillStyle = '#eab308';
  ctx.fillRect(xStart, 124, xEnd - xStart, 3);
  ctx.fillRect(xStart, 129, xEnd - xStart, 3);

  ctx.fillStyle = '#f8fafc';
  const laneOffset = isHighway ? 52 : 46;
  for (let x = xStart + 8; x < xEnd - 12; x += 36) {
    const dashLen = Math.min(18, xEnd - x);
    ctx.fillRect(x, 128 - laneOffset, dashLen, 3);
    ctx.fillRect(x, 128 + laneOffset, dashLen, 3);
  }
}

function getContactShadowMesh(radius: number): THREE.Mesh {
  if (!sharedShadowDiscGeo) {
    sharedShadowDiscGeo = new THREE.CircleGeometry(1, 20);
    sharedShadowDiscGeo.rotateX(-Math.PI / 2);
    sharedShadowDiscGeo.userData.isSharedCachedGeometry = true;
  }
  if (!sharedContactShadowMat) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, 'rgba(8, 12, 18, 0.55)');
    grad.addColorStop(1, 'rgba(8, 12, 18, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(canvas);
    sharedContactShadowMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
  }
  const m = new THREE.Mesh(sharedShadowDiscGeo, sharedContactShadowMat);
  m.scale.set(radius, 1, radius);
  m.position.y = 0.02;
  return m;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function getMat(
  color: number,
  roughness: number,
  metalness = 0.08,
  emissive = 0x000000,
  emissiveIntensity = 0
): THREE.MeshStandardMaterial {
  const key = `${color}_${roughness}_${metalness}_${emissive}_${emissiveIntensity}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      emissive,
      emissiveIntensity,
      bumpMap: getMicroBumpTexture(),
      bumpScale: 0.015,
    });
    m.userData.isSharedCachedMaterial = true;
    matCache.set(key, m);
  }
  return m;
}

let sharedRedRoofMat: THREE.MeshStandardMaterial | null = null;
function getRedTileRoofMat(maxAnisotropy = 4): THREE.MeshStandardMaterial {
  if (sharedRedRoofMat) return sharedRedRoofMat;
  const { map, bumpMap } = getVietnameseRedTileRoofTexture(maxAnisotropy);
  sharedRedRoofMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map,
    bumpMap,
    bumpScale: 0.035,
    roughness: 0.52,
    metalness: 0.12,
  });
  sharedRedRoofMat.userData.isSharedCachedMaterial = true;
  return sharedRedRoofMat;
}

let sharedStreetlightBulbMat: THREE.MeshStandardMaterial | null = null;
function getStreetlightBulbMat(): THREE.MeshStandardMaterial {
  if (sharedStreetlightBulbMat) return sharedStreetlightBulbMat;
  sharedStreetlightBulbMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    roughness: 0.15,
    metalness: 0.2,
    emissive: new THREE.Color(0xffbe55),
    emissiveIntensity: 0.2 + currentNightFactor * 2.1,
  });
  sharedStreetlightBulbMat.userData.isSharedCachedMaterial = true;
  streetlightBulbMaterials.add(sharedStreetlightBulbMat);
  return sharedStreetlightBulbMat;
}

const roadMatCache = new Map<string, THREE.MeshStandardMaterial>();
function getRoadSurfaceMat(
  conn: RoadConnections,
  isHighway: boolean,
  maxAnisotropy: number
): THREE.MeshStandardMaterial {
  const hasNS = conn.north || conn.south;
  const hasWE = conn.west || conn.east;
  const n = conn.north || (!hasNS && !hasWE);
  const s = conn.south || (!hasNS && !hasWE);
  const key = `roadmat_${isHighway ? 'hw' : 'ur'}_${n ? 1 : 0}${s ? 1 : 0}${
    conn.west ? 1 : 0
  }${conn.east ? 1 : 0}`;
  let m = roadMatCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: getConnectedRoadTexture(conn, isHighway, maxAnisotropy),
      bumpMap: getAsphaltBumpTexture(maxAnisotropy),
      bumpScale: 0.028,
      roughness: isHighway ? 0.65 : 0.75,
      metalness: isHighway ? 0.16 : 0.1,
    });
    m.userData.isSharedCachedMaterial = true;
    roadMatCache.set(key, m);
  }
  return m;
}

/**
 * Geometry Cache theo kích thước & hàm giải phóng bộ nhớ `disposeGroupGeometries`
 * ngăn chặn rò rỉ bộ nhớ GPU khi thêm/xóa công trình, xe cộ và ghost preview.
 */
const geoCache = new Map<string, THREE.BufferGeometry>();

export function getCachedGeometry<T extends THREE.BufferGeometry>(
  key: string,
  factory: () => T
): T {
  let g = geoCache.get(key) as T | undefined;
  if (!g) {
    g = factory();
    g.userData.isSharedCachedGeometry = true;
    geoCache.set(key, g);
  }
  return g;
}

export function disposeGroupGeometries(
  group: THREE.Object3D | null | undefined
): void {
  if (!group) return;
  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      if (mesh.geometry && !mesh.geometry.userData?.isSharedCachedGeometry) {
        mesh.geometry.dispose();
      }
      if (mesh.material) {
        const mats = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        for (const m of mats) {
          if (
            m &&
            !m.userData?.isSharedCachedMaterial &&
            m !== sharedContactShadowMat
          ) {
            m.dispose();
          }
        }
      }
    }
  });
}

export const disposeGroupResources = disposeGroupGeometries;

/**
 * Thêm cột đèn đường dọc theo road_urban, road_ring, road_highway và lưu vị trí bóng đèn
 * để Streetlight PointLight Pool (tối đa 6 đèn gần camera) tự động chiếu sáng ban đêm.
 */
function addRoadStreetlightPost(
  group: THREE.Group,
  x: number,
  yBase: number,
  z: number,
  s: number,
  armDirX = -1
): void {
  const poleH = 1.45 * s;
  const poleGeo = getCachedGeometry('streetlight_pole', () =>
    new THREE.CylinderGeometry(0.035 * s, 0.05 * s, poleH, 8)
  );
  const pole = new THREE.Mesh(poleGeo, getMat(0x64748b, 0.35, 0.75));
  pole.position.set(x, yBase + poleH / 2, z);
  group.add(pole);

  const armGeo = getCachedGeometry('streetlight_arm', () =>
    new THREE.BoxGeometry(0.36 * s, 0.04 * s, 0.05 * s)
  );
  const arm = new THREE.Mesh(armGeo, getMat(0x64748b, 0.35, 0.75));
  arm.position.set(x + armDirX * 0.16 * s, yBase + poleH, z);
  group.add(arm);

  const bulbGeo = getCachedGeometry('streetlight_bulb', () =>
    new THREE.SphereGeometry(0.08 * s, 8, 8)
  );
  const bulb = new THREE.Mesh(bulbGeo, getStreetlightBulbMat());
  const bulbX = x + armDirX * 0.3 * s;
  const bulbY = yBase + poleH - 0.03 * s;
  bulb.position.set(bulbX, bulbY, z);
  group.add(bulb);

  if (!group.userData.streetlightLocalPositions) {
    group.userData.streetlightLocalPositions = [];
  }
  group.userData.streetlightLocalPositions.push({
    x: bulbX,
    y: bulbY,
    z,
  });
}

/**
 * Cây xanh tán tròn nhiều tầng (Multi-layered Rounded Canopy Tree) sử dụng shared cached geometries
 */
function addRoundedCanopyTree(
  group: THREE.Group,
  tx: number,
  tz: number,
  s: number,
  tScale: number,
  colorVariant = 0
): void {
  const trunkH = 0.62 * s * tScale;
  const trunkGeo = getCachedGeometry('tree_trunk_cyl', () =>
    new THREE.CylinderGeometry(0.08 * s, 0.13 * s, 0.62 * s, 8)
  );
  const trunk = new THREE.Mesh(trunkGeo, getMat(0x5c4033, 0.88, 0.04));
  trunk.scale.set(tScale, tScale, tScale);
  trunk.position.set(tx, trunkH / 2, tz);
  trunk.castShadow = true;
  group.add(trunk);

  const mainFoliageGeo = getCachedGeometry('tree_canopy_main', () =>
    new THREE.DodecahedronGeometry(0.56 * s, 1)
  );
  const subFoliageGeo = getCachedGeometry('tree_canopy_sub', () =>
    new THREE.DodecahedronGeometry(0.4 * s, 1)
  );
  const topFoliageGeo = getCachedGeometry('tree_canopy_top', () =>
    new THREE.DodecahedronGeometry(0.34 * s, 1)
  );

  const baseHue =
    colorVariant % 3 === 0
      ? 0x15803d
      : colorVariant % 3 === 1
      ? 0x16a34a
      : 0x166534;
  const midHue = colorVariant % 2 === 0 ? 0x22c55e : 0x16a34a;
  const topHue = 0x4ade80;

  // Tầng 1: Tán chính tròn rộng
  const lowerCanopy = new THREE.Mesh(
    mainFoliageGeo,
    getMat(baseHue, 0.78, 0.05)
  );
  lowerCanopy.scale.set(1.15 * tScale, 0.82 * tScale, 1.15 * tScale);
  lowerCanopy.position.set(tx, trunkH + 0.25 * s * tScale, tz);
  lowerCanopy.castShadow = true;
  lowerCanopy.receiveShadow = true;
  group.add(lowerCanopy);

  // Tầng 2: Tán phụ lệch trái & phải tạo độ phồng tự nhiên
  const leftCluster = new THREE.Mesh(subFoliageGeo, getMat(midHue, 0.75, 0.05));
  leftCluster.scale.set(tScale, 0.88 * tScale, tScale);
  leftCluster.position.set(
    tx - 0.24 * s * tScale,
    trunkH + 0.45 * s * tScale,
    tz + 0.14 * s * tScale
  );
  leftCluster.castShadow = true;
  group.add(leftCluster);

  const rightCluster = new THREE.Mesh(
    subFoliageGeo,
    getMat(midHue, 0.75, 0.05)
  );
  rightCluster.scale.set(0.92 * tScale, 0.85 * tScale, 0.92 * tScale);
  rightCluster.position.set(
    tx + 0.25 * s * tScale,
    trunkH + 0.42 * s * tScale,
    tz - 0.16 * s * tScale
  );
  rightCluster.castShadow = true;
  group.add(rightCluster);

  // Tầng 3: Chóp tán tròn trên cùng
  const topCanopy = new THREE.Mesh(topFoliageGeo, getMat(topHue, 0.72, 0.06));
  topCanopy.scale.set(tScale, 0.9 * tScale, tScale);
  topCanopy.position.set(tx, trunkH + 0.72 * s * tScale, tz);
  topCanopy.castShadow = true;
  group.add(topCanopy);
}

export function buildTileStructureGroup(
  tile: TileData,
  roadConn: RoadConnections,
  maxAnisotropy = 4,
  riverBanks?: RiverBankConnections
): THREE.Group {
  const group = new THREE.Group();
  const type = tile.type;
  const s = TILE_WORLD_SIZE / 4.0;

  if (type === 'res_low') {
    group.add(getContactShadowMesh(1.85 * s));
    const houseColors = [0xfef08a, 0xbae6fd, 0xfed7aa, 0xe9d5ff];
    const redRoofMat = getRedTileRoofMat(maxAnisotropy);
    const pitchedRoofGeo = getCachedGeometry('res_low_pitched_roof', () => {
      const g = new THREE.ConeGeometry(0.84 * s, 0.44 * s, 4);
      g.rotateY(Math.PI / 4);
      return g;
    });

    for (let i = 0; i < 4; i++) {
      const hx = (-1.1 + (i % 2) * 1.45) * s;
      const hz = (-0.85 + Math.floor(i / 2) * 1.65) * s;
      const hHeight = (1.45 + ((tile.x + tile.z + i) % 3) * 0.45) * s;

      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.95 * s, hHeight, 1.25 * s),
        getMat(houseColors[i], 0.78, 0.05)
      );
      body.position.set(hx, hHeight / 2, hz);
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

      // Mái ngói đỏ Việt Nam vát 4 chiều cho Nhà Ống
      const roof = new THREE.Mesh(pitchedRoofGeo, redRoofMat);
      roof.scale.set(1, 1, 1.22);
      roof.position.set(hx, hHeight + 0.22 * s, hz);
      roof.castShadow = true;
      group.add(roof);

      // Ban công + lan can và mái hiên nhỏ phía trước nhà ống
      const balcony = new THREE.Mesh(
        getCachedGeometry('res_low_balcony', () =>
          new THREE.BoxGeometry(0.76 * s, 0.08 * s, 0.28 * s)
        ),
        getMat(0xe2e8f0, 0.55, 0.25)
      );
      balcony.position.set(hx, hHeight * 0.58, hz + 0.72 * s);
      group.add(balcony);

      const awning = new THREE.Mesh(
        getCachedGeometry('res_low_awning', () =>
          new THREE.BoxGeometry(0.84 * s, 0.05 * s, 0.32 * s)
        ),
        getMat(i % 2 === 0 ? 0x0284c7 : 0x15803d, 0.45, 0.2)
      );
      awning.rotation.x = 0.22;
      awning.position.set(hx, hHeight * 0.35, hz + 0.74 * s);
      group.add(awning);

      // Cửa sổ phát sáng vàng ấm về đêm ở cả mặt trước, mặt sau và tầng trệt
      const warmWinMat = getWarmNightWindowMaterial();
      const winGeo = getCachedGeometry('res_low_win', () =>
        new THREE.BoxGeometry(0.46 * s, 0.3 * s, 0.05 * s)
      );
      const frontUpperWin = new THREE.Mesh(winGeo, warmWinMat);
      frontUpperWin.position.set(hx, hHeight * 0.74, hz + 0.63 * s);
      group.add(frontUpperWin);

      const frontLowerWin = new THREE.Mesh(winGeo, warmWinMat);
      frontLowerWin.position.set(hx, hHeight * 0.24, hz + 0.63 * s);
      group.add(frontLowerWin);

      const backUpperWin = new THREE.Mesh(winGeo, warmWinMat);
      backUpperWin.position.set(hx, hHeight * 0.7, hz - 0.63 * s);
      group.add(backUpperWin);

      const waterTank = new THREE.Mesh(
        getCachedGeometry('res_low_tank', () =>
          new THREE.CylinderGeometry(0.13 * s, 0.13 * s, 0.34 * s, 10)
        ),
        getMat(0xe2e8f0, 0.18, 0.88)
      );
      waterTank.position.set(hx + 0.22 * s, hHeight + 0.28 * s, hz - 0.25 * s);
      group.add(waterTank);
    }
  } else if (type === 'res_mid' || type === 'com_street') {
    group.add(getContactShadowMesh(1.9 * s));
    const isShop = type === 'com_street';
    const colors = isShop
      ? [0xfde047, 0xfda4af, 0x7dd3fc]
      : [0xf8fafc, 0xfef3c7, 0xe0f2fe];
    const redRoofMat = getRedTileRoofMat(maxAnisotropy);
    const warmWinMat = getWarmNightWindowMaterial();
    const midWinGeo = getCachedGeometry('res_mid_win', () =>
      new THREE.BoxGeometry(0.62 * s, 0.34 * s, 0.05 * s)
    );
    const shopFrontGeo = getCachedGeometry('res_mid_shopfront', () =>
      new THREE.BoxGeometry(0.74 * s, 0.48 * s, 0.05 * s)
    );

    for (let i = 0; i < 3; i++) {
      const hx = (-1.15 + i * 1.15) * s;
      const hHeight = (2.1 + ((i + tile.x) % 2) * 0.55) * s;

      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.98 * s, hHeight, 1.65 * s),
        getMat(colors[i], 0.72, 0.08)
      );
      body.position.set(hx, hHeight / 2, -0.2 * s);
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(0.8 * s, 0.54 * s, 4),
        redRoofMat
      );
      roof.rotation.y = Math.PI / 4;
      roof.position.set(hx, hHeight + 0.26 * s, -0.2 * s);
      roof.castShadow = true;
      group.add(roof);

      // Cửa kính tầng trệt phát sáng ấm áp về đêm
      const shopWin = new THREE.Mesh(shopFrontGeo, warmWinMat);
      shopWin.position.set(hx, 0.36 * s, 0.63 * s);
      group.add(shopWin);

      // Ban công + cửa sổ phát sáng các tầng
      for (let fl = 1; fl <= 2; fl++) {
        const bal = new THREE.Mesh(
          getCachedGeometry('res_mid_balcony', () =>
            new THREE.BoxGeometry(0.82 * s, 0.08 * s, 0.32 * s)
          ),
          getMat(0xcbd5e1, 0.5, 0.3)
        );
        bal.position.set(hx, fl * 0.72 * s + 0.4 * s, 0.72 * s);
        group.add(bal);

        const flWinFront = new THREE.Mesh(midWinGeo, warmWinMat);
        flWinFront.position.set(hx, fl * 0.72 * s + 0.62 * s, 0.63 * s);
        group.add(flWinFront);

        const flWinBack = new THREE.Mesh(midWinGeo, warmWinMat);
        flWinBack.position.set(hx, fl * 0.72 * s + 0.62 * s, -1.03 * s);
        group.add(flWinBack);
      }

      const awning = new THREE.Mesh(
        new THREE.BoxGeometry(0.96 * s, 0.08 * s, 0.45 * s),
        getMat(
          isShop ? 0xdc2626 : 0x0284c7,
          0.4,
          0.2,
          isShop ? 0xf59e0b : 0x000000,
          isShop ? 0.35 : 0
        )
      );
      awning.rotation.x = 0.18;
      awning.position.set(hx, 0.75 * s, 0.75 * s);
      group.add(awning);
    }
    if (tile.sidewalkVendors) {
      addSidewalkVendorStalls(group, s);
    }
  } else if (type === 'res_high') {
    group.add(getContactShadowMesh(2.0 * s));
    const podium = new THREE.Mesh(
      new THREE.BoxGeometry(3.3 * s, 0.85 * s, 3.1 * s),
      getMat(0xcbd5e1, 0.65, 0.2)
    );
    podium.position.set(0, 0.425 * s, 0);
    podium.castShadow = true;
    podium.receiveShadow = true;
    group.add(podium);

    const warmWinMat = getWarmNightWindowMaterial();
    const podiumGlass = new THREE.Mesh(
      getCachedGeometry('res_high_podium_glass', () =>
        new THREE.BoxGeometry(2.85 * s, 0.42 * s, 3.16 * s)
      ),
      warmWinMat
    );
    podiumGlass.position.set(0, 0.42 * s, 0);
    group.add(podiumGlass);

    const highriseGlassMat = getHighriseFacadeMaterial('res_high', maxAnisotropy);

    for (let t = 0; t < 2; t++) {
      const tx = (t === 0 ? -0.82 : 0.82) * s;
      const tz = (t === 0 ? -0.35 : 0.35) * s;
      const th = (t === 0 ? 4.4 : 3.8) * s;

      const towerCore = new THREE.Mesh(
        new THREE.BoxGeometry(1.25 * s, th, 1.45 * s),
        getMat(0xf1f5f9, 0.6, 0.15)
      );
      towerCore.position.set(tx, 0.85 * s + th / 2, tz);
      towerCore.castShadow = true;
      towerCore.receiveShadow = true;
      group.add(towerCore);

      const curtainWall = new THREE.Mesh(
        new THREE.BoxGeometry(1.32 * s, th - 0.22 * s, 1.52 * s),
        highriseGlassMat
      );
      curtainWall.position.set(tx, 0.85 * s + th / 2, tz);
      group.add(curtainWall);

      const crown = new THREE.Mesh(
        new THREE.BoxGeometry(1.36 * s, 0.22 * s, 1.54 * s),
        getMat(0xf59e0b, 0.3, 0.65)
      );
      crown.position.set(tx, 0.85 * s + th + 0.11 * s, tz);
      group.add(crown);
    }
  } else if (type === 'com_market') {
    group.add(getContactShadowMesh(2.0 * s));
    const redRoofMat = getRedTileRoofMat(maxAnisotropy);
    const warmWinMat = getWarmNightWindowMaterial();
    const hall = new THREE.Mesh(
      new THREE.BoxGeometry(3.1 * s, 1.35 * s, 2.7 * s),
      getMat(0xfde68a, 0.78, 0.05)
    );
    hall.position.set(0, 0.675 * s, 0);
    hall.castShadow = true;
    hall.receiveShadow = true;
    group.add(hall);

    // Dải cửa sổ vòm & sảnh chợ phát sáng vàng ấm về đêm
    const marketFrontBand = new THREE.Mesh(
      getCachedGeometry('com_market_win_band', () =>
        new THREE.BoxGeometry(2.65 * s, 0.48 * s, 2.76 * s)
      ),
      warmWinMat
    );
    marketFrontBand.position.set(0, 0.66 * s, 0);
    group.add(marketFrontBand);

    const mainRoof = new THREE.Mesh(
      new THREE.ConeGeometry(2.38 * s, 0.88 * s, 4),
      redRoofMat
    );
    mainRoof.rotation.y = Math.PI / 4;
    mainRoof.position.set(0, 1.76 * s, 0);
    mainRoof.castShadow = true;
    group.add(mainRoof);

    const clockTower = new THREE.Mesh(
      new THREE.BoxGeometry(0.85 * s, 1.25 * s, 0.85 * s),
      getMat(0xfef08a, 0.7, 0.08)
    );
    clockTower.position.set(0, 1.9 * s, 1.05 * s);
    group.add(clockTower);

    const clockFace = new THREE.Mesh(
      getCachedGeometry('com_market_clock_face', () =>
        new THREE.CylinderGeometry(0.24 * s, 0.24 * s, 0.9 * s, 12)
      ),
      warmWinMat
    );
    clockFace.rotation.x = Math.PI / 2;
    clockFace.position.set(0, 2.08 * s, 1.05 * s);
    group.add(clockFace);

    const towerRoof = new THREE.Mesh(
      new THREE.ConeGeometry(0.7 * s, 0.52 * s, 4),
      redRoofMat
    );
    towerRoof.rotation.y = Math.PI / 4;
    towerRoof.position.set(0, 2.76 * s, 1.05 * s);
    group.add(towerRoof);

    addSidewalkVendorStalls(group, s);
  } else if (type === 'com_mall') {
    group.add(getContactShadowMesh(2.05 * s));
    const mallGlassMat = getHighriseFacadeMaterial('com_mall', maxAnisotropy);
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(3.4 * s, 2.1 * s, 3.0 * s),
      mallGlassMat
    );
    base.position.set(0, 1.05 * s, 0);
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const atriumDome = new THREE.Mesh(
      new THREE.SphereGeometry(
        1.15 * s,
        20,
        12,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2
      ),
      getMat(0x38bdf8, 0.14, 0.75, 0x0ea5e9, 0.25)
    );
    atriumDome.position.set(0, 2.1 * s, 0);
    group.add(atriumDome);

    const neonSign = new THREE.Mesh(
      new THREE.BoxGeometry(2.4 * s, 0.32 * s, 0.12 * s),
      getMat(0xf43f5e, 0.2, 0.3, 0xf43f5e, 0.85)
    );
    neonSign.position.set(0, 1.75 * s, 1.54 * s);
    group.add(neonSign);
  } else if (type === 'com_office') {
    group.add(getContactShadowMesh(2.1 * s));
    const officeGlassMat = getHighriseFacadeMaterial('com_office', maxAnisotropy);
    const podium = new THREE.Mesh(
      new THREE.BoxGeometry(3.3 * s, 1.1 * s, 3.1 * s),
      getMat(0x1e293b, 0.3, 0.65)
    );
    podium.position.set(0, 0.55 * s, 0);
    podium.castShadow = true;
    podium.receiveShadow = true;
    group.add(podium);

    const mainTower = new THREE.Mesh(
      new THREE.BoxGeometry(1.95 * s, 5.2 * s, 1.95 * s),
      officeGlassMat
    );
    mainTower.position.set(0, 1.1 * s + 2.6 * s, 0);
    mainTower.castShadow = true;
    mainTower.receiveShadow = true;
    group.add(mainTower);

    const goldFins = new THREE.Mesh(
      new THREE.BoxGeometry(2.06 * s, 5.0 * s, 0.35 * s),
      getMat(0xf59e0b, 0.25, 0.78)
    );
    goldFins.position.set(0, 1.1 * s + 2.5 * s, 0);
    group.add(goldFins);

    const spireBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55 * s, 0.85 * s, 0.65 * s, 8),
      getMat(0xf8fafc, 0.2, 0.8)
    );
    spireBase.position.set(0, 6.62 * s, 0);
    group.add(spireBase);

    const spire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03 * s, 0.09 * s, 1.35 * s, 8),
      getMat(0xfacc15, 0.15, 0.9, 0xf59e0b, 0.8)
    );
    spire.position.set(0, 7.55 * s, 0);
    group.add(spire);
  } else if (type === 'agr_farm') {
    const paddy = new THREE.Mesh(
      new THREE.BoxGeometry(3.6 * s, 0.14 * s, 1.65 * s),
      getMat(0x4ade80, 0.85, 0.02)
    );
    paddy.position.set(0, 0.07 * s, -0.85 * s);
    paddy.receiveShadow = true;
    group.add(paddy);

    const fishPond = new THREE.Mesh(
      new THREE.BoxGeometry(3.6 * s, 0.1 * s, 1.65 * s),
      getMat(0x0284c7, 0.18, 0.65)
    );
    fishPond.position.set(0, 0.05 * s, 0.85 * s);
    group.add(fishPond);

    const hut = new THREE.Mesh(
      new THREE.BoxGeometry(0.85 * s, 0.75 * s, 0.85 * s),
      getMat(0xa16207, 0.88, 0.05)
    );
    hut.position.set(-1.1 * s, 0.45 * s, -0.85 * s);
    hut.castShadow = true;
    group.add(hut);

    const thatchRoof = new THREE.Mesh(
      new THREE.ConeGeometry(0.75 * s, 0.5 * s, 4),
      getMat(0xca8a04, 0.9, 0.02)
    );
    thatchRoof.rotation.y = Math.PI / 4;
    thatchRoof.position.set(-1.1 * s, 1.05 * s, -0.85 * s);
    group.add(thatchRoof);
  } else if (type === 'ind_factory') {
    group.add(getContactShadowMesh(2.0 * s));
    const hall = new THREE.Mesh(
      new THREE.BoxGeometry(3.1 * s, 1.5 * s, 2.35 * s),
      getMat(0x94a3b8, 0.65, 0.35)
    );
    hall.position.set(-0.15 * s, 0.75 * s, 0.1 * s);
    hall.castShadow = true;
    hall.receiveShadow = true;
    group.add(hall);

    // Mái răng cưa nhà xưởng (Sawtooth factory roof ridges)
    for (let r = 0; r < 3; r++) {
      const ridge = new THREE.Mesh(
        getCachedGeometry('factory_ridge', () =>
          new THREE.ConeGeometry(0.55 * s, 0.42 * s, 4)
        ),
        getMat(0x64748b, 0.5, 0.45)
      );
      ridge.rotation.y = Math.PI / 4;
      ridge.scale.set(1.6, 1, 0.85);
      ridge.position.set((-0.95 + r * 0.85) * s, 1.68 * s, 0.1 * s);
      group.add(ridge);
    }

    // 2 Ống khói công nghiệp cao kèm vòng cảnh báo đỏ-trắng
    for (let i = 0; i < 2; i++) {
      const sx = (-0.95 + i * 0.78) * s;
      const sz = -0.92 * s;
      const stack = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2 * s, 0.3 * s, 2.85 * s, 12),
        getMat(0x475569, 0.55, 0.45)
      );
      stack.position.set(sx, 1.42 * s, sz);
      stack.castShadow = true;
      group.add(stack);

      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22 * s, 0.24 * s, 0.26 * s, 12),
        getMat(0xef4444, 0.4, 0.2, 0xef4444, 0.3)
      );
      band.position.set(sx, 2.52 * s, sz);
      group.add(band);
    }

    // Bồn chứa hóa chất / nhiên liệu hình trụ nằm ngang + đường ống nối
    const tankCyl = new THREE.Mesh(
      getCachedGeometry('factory_horiz_tank', () => {
        const g = new THREE.CylinderGeometry(0.36 * s, 0.36 * s, 1.45 * s, 12);
        g.rotateX(Math.PI / 2);
        return g;
      }),
      getMat(0xcbd5e1, 0.28, 0.78)
    );
    tankCyl.position.set(1.22 * s, 0.52 * s, 0.15 * s);
    tankCyl.castShadow = true;
    group.add(tankCyl);

    const pipe = new THREE.Mesh(
      getCachedGeometry('factory_pipe', () =>
        new THREE.CylinderGeometry(0.06 * s, 0.06 * s, 0.9 * s, 8)
      ),
      getMat(0xf59e0b, 0.35, 0.7)
    );
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0.75 * s, 0.78 * s, 0.15 * s);
    group.add(pipe);
  } else if (type === 'ind_food') {
    group.add(getContactShadowMesh(2.0 * s));
    const foodHall = new THREE.Mesh(
      new THREE.BoxGeometry(2.55 * s, 1.45 * s, 2.45 * s),
      getMat(0xf8fafc, 0.45, 0.25)
    );
    foodHall.position.set(-0.38 * s, 0.725 * s, 0);
    foodHall.castShadow = true;
    foodHall.receiveShadow = true;
    group.add(foodHall);

    const greenRoof = new THREE.Mesh(
      new THREE.BoxGeometry(2.65 * s, 0.16 * s, 2.55 * s),
      getMat(0x16a34a, 0.4, 0.3)
    );
    greenRoof.position.set(-0.38 * s, 1.52 * s, 0);
    group.add(greenRoof);

    // Ống thông hơi inox trên mái nhà máy chế biến
    const steamStack = new THREE.Mesh(
      getCachedGeometry('ind_food_stack', () =>
        new THREE.CylinderGeometry(0.14 * s, 0.18 * s, 1.15 * s, 10)
      ),
      getMat(0xe2e8f0, 0.2, 0.85)
    );
    steamStack.position.set(-0.85 * s, 2.05 * s, -0.65 * s);
    steamStack.castShadow = true;
    group.add(steamStack);

    // 2 Bồn chứa Silo inox + cầu dẫn nguyên liệu trên cao
    for (let i = 0; i < 2; i++) {
      const sz = (-0.58 + i * 1.16) * s;
      const silo = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42 * s, 0.42 * s, 2.15 * s, 14),
        getMat(0xe2e8f0, 0.2, 0.86)
      );
      silo.position.set(1.25 * s, 1.075 * s, sz);
      silo.castShadow = true;
      group.add(silo);

      const siloDome = new THREE.Mesh(
        new THREE.SphereGeometry(
          0.42 * s,
          12,
          8,
          0,
          Math.PI * 2,
          0,
          Math.PI / 2
        ),
        getMat(0x22c55e, 0.3, 0.5)
      );
      siloDome.position.set(1.25 * s, 2.15 * s, sz);
      group.add(siloDome);
    }

    const overheadBridge = new THREE.Mesh(
      getCachedGeometry('ind_food_bridge', () =>
        new THREE.BoxGeometry(0.95 * s, 0.14 * s, 0.24 * s)
      ),
      getMat(0x94a3b8, 0.35, 0.7)
    );
    overheadBridge.position.set(0.55 * s, 1.75 * s, 0);
    group.add(overheadBridge);
  } else if (type === 'ind_fdi') {
    group.add(getContactShadowMesh(2.1 * s));
    const cleanroom = new THREE.Mesh(
      new THREE.BoxGeometry(3.4 * s, 1.65 * s, 2.8 * s),
      getMat(0xf8fafc, 0.35, 0.45)
    );
    cleanroom.position.set(0, 0.825 * s, 0);
    cleanroom.castShadow = true;
    cleanroom.receiveShadow = true;
    group.add(cleanroom);

    const glassBand = new THREE.Mesh(
      new THREE.BoxGeometry(3.46 * s, 0.55 * s, 2.86 * s),
      getMat(0x06b6d4, 0.12, 0.88, 0x0891b2, 0.35)
    );
    glassBand.position.set(0, 1.05 * s, 0);
    group.add(glassBand);

    const rdTower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75 * s, 0.85 * s, 2.9 * s, 16),
      getHighriseFacadeMaterial('com_office', maxAnisotropy)
    );
    rdTower.position.set(0.85 * s, 1.45 * s, -0.35 * s);
    rdTower.castShadow = true;
    group.add(rdTower);

    const solarArray = new THREE.Mesh(
      new THREE.BoxGeometry(1.6 * s, 0.08 * s, 2.1 * s),
      getMat(0x1e3a8a, 0.2, 0.8)
    );
    solarArray.position.set(-0.65 * s, 1.72 * s, 0);
    group.add(solarArray);
  } else if (type === 'pub_admin') {
    group.add(getContactShadowMesh(2.0 * s));
    const redRoofMat = getRedTileRoofMat(maxAnisotropy);
    const mainBlock = new THREE.Mesh(
      new THREE.BoxGeometry(3.2 * s, 1.6 * s, 2.0 * s),
      getMat(0xfef08a, 0.72, 0.08)
    );
    mainBlock.position.set(0, 0.8 * s, -0.3 * s);
    mainBlock.castShadow = true;
    mainBlock.receiveShadow = true;
    group.add(mainBlock);

    const redRoof = new THREE.Mesh(
      new THREE.ConeGeometry(2.22 * s, 0.78 * s, 4),
      redRoofMat
    );
    redRoof.rotation.y = Math.PI / 4;
    redRoof.position.set(0, 1.96 * s, -0.3 * s);
    redRoof.castShadow = true;
    group.add(redRoof);

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04 * s, 0.06 * s, 2.8 * s, 8),
      getMat(0xe2e8f0, 0.2, 0.85)
    );
    pole.position.set(0, 1.4 * s, 1.35 * s);
    group.add(pole);

    const flag = new THREE.Mesh(
      new THREE.BoxGeometry(0.65 * s, 0.42 * s, 0.04 * s),
      getMat(0xef4444, 0.4, 0.1, 0xdc2626, 0.35)
    );
    flag.position.set(0.32 * s, 2.55 * s, 1.35 * s);
    group.add(flag);
  } else if (type === 'pub_edu_med' || type === 'pub_hospital') {
    group.add(getContactShadowMesh(2.0 * s));
    const wingA = new THREE.Mesh(
      new THREE.BoxGeometry(3.1 * s, 2.2 * s, 1.3 * s),
      getMat(0xf8fafc, 0.55, 0.15)
    );
    wingA.position.set(0, 1.1 * s, -0.3 * s);
    wingA.castShadow = true;
    group.add(wingA);

    const wingB = new THREE.Mesh(
      new THREE.BoxGeometry(1.4 * s, 2.5 * s, 2.8 * s),
      getMat(0xe0f2fe, 0.45, 0.25)
    );
    wingB.position.set(0, 1.25 * s, 0);
    wingB.castShadow = true;
    group.add(wingB);

    const crossH = new THREE.Mesh(
      new THREE.BoxGeometry(0.75 * s, 0.24 * s, 0.2 * s),
      getMat(0xef4444, 0.3, 0.2, 0xef4444, 0.65)
    );
    crossH.position.set(0, 2.75 * s, 0.8 * s);
    group.add(crossH);

    const crossV = new THREE.Mesh(
      new THREE.BoxGeometry(0.24 * s, 0.75 * s, 0.2 * s),
      getMat(0xef4444, 0.3, 0.2, 0xef4444, 0.65)
    );
    crossV.position.set(0, 2.75 * s, 0.8 * s);
    group.add(crossV);
  } else if (type === 'priv_hospital') {
    group.add(getContactShadowMesh(2.1 * s));
    const podium = new THREE.Mesh(
      new THREE.BoxGeometry(3.2 * s, 1.1 * s, 2.6 * s),
      getMat(0xf1f5f9, 0.35, 0.35)
    );
    podium.position.set(0, 0.55 * s, 0);
    podium.castShadow = true;
    group.add(podium);

    const glassTower = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15 * s, 1.25 * s, 3.2 * s, 12),
      getHighriseFacadeMaterial('com_mall', maxAnisotropy)
    );
    glassTower.position.set(0, 1.95 * s, -0.15 * s);
    glassTower.castShadow = true;
    group.add(glassTower);

    const helipad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95 * s, 0.95 * s, 0.1 * s, 16),
      getMat(0x10b981, 0.4, 0.3, 0x10b981, 0.45)
    );
    helipad.position.set(0, 3.6 * s, -0.15 * s);
    group.add(helipad);

    const crossH = new THREE.Mesh(
      new THREE.BoxGeometry(0.75 * s, 0.22 * s, 0.2 * s),
      getMat(0x10b981, 0.2, 0.3, 0x10b981, 0.65)
    );
    crossH.position.set(0, 3.95 * s, 0.65 * s);
    group.add(crossH);

    const crossV = new THREE.Mesh(
      new THREE.BoxGeometry(0.22 * s, 0.75 * s, 0.2 * s),
      getMat(0x10b981, 0.2, 0.3, 0x10b981, 0.65)
    );
    crossV.position.set(0, 3.95 * s, 0.65 * s);
    group.add(crossV);
  } else if (type === 'pub_school') {
    group.add(getContactShadowMesh(2.0 * s));
    const redRoofMat = getRedTileRoofMat(maxAnisotropy);
    const mainHall = new THREE.Mesh(
      new THREE.BoxGeometry(3.2 * s, 1.55 * s, 1.2 * s),
      getMat(0xfde047, 0.7, 0.08)
    );
    mainHall.position.set(0, 0.775 * s, -0.75 * s);
    mainHall.castShadow = true;
    group.add(mainHall);

    // Mái ngói đỏ Việt Nam vát nghiêng cho trường học công lập
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(2.3 * s, 0.58 * s, 4),
      redRoofMat
    );
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1.05, 1, 0.48);
    roof.position.set(0, 1.82 * s, -0.75 * s);
    roof.castShadow = true;
    group.add(roof);

    for (const side of [-1, 1]) {
      const sideWing = new THREE.Mesh(
        new THREE.BoxGeometry(0.95 * s, 1.35 * s, 1.8 * s),
        getMat(0xfef08a, 0.7, 0.08)
      );
      sideWing.position.set(side * 1.12 * s, 0.675 * s, 0.35 * s);
      sideWing.castShadow = true;
      group.add(sideWing);

      const wingRoof = new THREE.Mesh(
        new THREE.BoxGeometry(1.04 * s, 0.18 * s, 1.88 * s),
        redRoofMat
      );
      wingRoof.position.set(side * 1.12 * s, 1.42 * s, 0.35 * s);
      group.add(wingRoof);
    }

    const flagPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04 * s, 0.05 * s, 2.2 * s, 8),
      getMat(0xe2e8f0, 0.25, 0.8)
    );
    flagPole.position.set(0, 1.1 * s, 0.55 * s);
    group.add(flagPole);
  } else if (type === 'priv_school') {
    group.add(getContactShadowMesh(2.1 * s));
    const campusBase = new THREE.Mesh(
      new THREE.BoxGeometry(3.3 * s, 1.3 * s, 2.5 * s),
      getMat(0xf8fafc, 0.35, 0.35)
    );
    campusBase.position.set(0, 0.65 * s, -0.2 * s);
    campusBase.castShadow = true;
    group.add(campusBase);

    const atrium = new THREE.Mesh(
      new THREE.BoxGeometry(2.1 * s, 2.35 * s, 1.6 * s),
      getHighriseFacadeMaterial('com_mall', maxAnisotropy)
    );
    atrium.position.set(-0.35 * s, 1.45 * s, -0.25 * s);
    atrium.castShadow = true;
    group.add(atrium);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.72 * s, 14, 12),
      getMat(0xf59e0b, 0.25, 0.65, 0xd97706, 0.35)
    );
    dome.position.set(0.85 * s, 1.65 * s, 0.35 * s);
    group.add(dome);
  } else if (type === 'pub_security') {
    group.add(getContactShadowMesh(1.9 * s));
    const station = new THREE.Mesh(
      new THREE.BoxGeometry(2.8 * s, 1.4 * s, 2.2 * s),
      getMat(0xfef3c7, 0.65, 0.15)
    );
    station.position.set(0, 0.7 * s, 0);
    station.castShadow = true;
    group.add(station);

    const watchTower = new THREE.Mesh(
      new THREE.BoxGeometry(0.85 * s, 2.8 * s, 0.85 * s),
      getMat(0xdc2626, 0.45, 0.25)
    );
    watchTower.position.set(0.85 * s, 1.4 * s, -0.45 * s);
    watchTower.castShadow = true;
    group.add(watchTower);
  } else if (type === 'util_power_water') {
    group.add(getContactShadowMesh(2.0 * s));
    const waterBasin = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05 * s, 1.05 * s, 0.55 * s, 16),
      getMat(0x0ea5e9, 0.2, 0.65)
    );
    waterBasin.position.set(-0.7 * s, 0.275 * s, -0.5 * s);
    group.add(waterBasin);

    for (let p = 0; p < 2; p++) {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(1.45 * s, 0.08 * s, 1.1 * s),
        getMat(0x1d4ed8, 0.18, 0.85)
      );
      panel.rotation.x = 0.35;
      panel.position.set(0.85 * s, 0.65 * s, (-0.6 + p * 1.35) * s);
      panel.castShadow = true;
      group.add(panel);
    }
  } else if (type === 'showbiz_stadium') {
    group.add(getContactShadowMesh(2.15 * s));
    const stadiumBowl = new THREE.Mesh(
      new THREE.CylinderGeometry(1.75 * s, 1.45 * s, 1.25 * s, 20, 1, true),
      getMat(0xe2e8f0, 0.45, 0.35)
    );
    stadiumBowl.position.set(0, 0.625 * s, 0);
    stadiumBowl.castShadow = true;
    group.add(stadiumBowl);

    const pitch = new THREE.Mesh(
      new THREE.CylinderGeometry(1.38 * s, 1.38 * s, 0.12 * s, 20),
      getMat(0x22c55e, 0.75, 0.05)
    );
    pitch.position.set(0, 0.06 * s, 0);
    group.add(pitch);

    const archRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.65 * s, 0.12 * s, 8, 24),
      getMat(0xf59e0b, 0.25, 0.75, 0xf59e0b, 0.75)
    );
    archRing.rotation.x = Math.PI / 2;
    archRing.position.set(0, 1.32 * s, 0);
    group.add(archRing);
  } else if (
    type === 'road_alley' ||
    type === 'road_urban' ||
    type === 'road_ring' ||
    type === 'road_highway'
  ) {
    if (type === 'road_alley') {
      const alleyMat = getMat(0xa88b67, 0.9, 0.02);
      const centerHub = new THREE.Mesh(
        new THREE.BoxGeometry(1.65 * s, 0.08 * s, 1.65 * s),
        alleyMat
      );
      centerHub.position.y = 0.04 * s;
      group.add(centerHub);

      const hasAny =
        roadConn.north || roadConn.south || roadConn.west || roadConn.east;
      const n = roadConn.north || !hasAny;
      const so = roadConn.south || !hasAny;

      if (n) {
        const armN = new THREE.Mesh(
          new THREE.BoxGeometry(1.65 * s, 0.08 * s, 1.45 * s),
          alleyMat
        );
        armN.position.set(0, 0.04 * s, -1.3 * s);
        group.add(armN);
      }
      if (so) {
        const armS = new THREE.Mesh(
          new THREE.BoxGeometry(1.65 * s, 0.08 * s, 1.45 * s),
          alleyMat
        );
        armS.position.set(0, 0.04 * s, 1.3 * s);
        group.add(armS);
      }
      if (roadConn.west) {
        const armW = new THREE.Mesh(
          new THREE.BoxGeometry(1.45 * s, 0.08 * s, 1.65 * s),
          alleyMat
        );
        armW.position.set(-1.3 * s, 0.04 * s, 0);
        group.add(armW);
      }
      if (roadConn.east) {
        const armE = new THREE.Mesh(
          new THREE.BoxGeometry(1.45 * s, 0.08 * s, 1.65 * s),
          alleyMat
        );
        armE.position.set(1.3 * s, 0.04 * s, 0);
        group.add(armE);
      }
    } else if (type === 'road_urban' || type === 'road_ring') {
      const isRing = type === 'road_ring';
      const roadMat = getRoadSurfaceMat(roadConn, isRing, maxAnisotropy);
      const road = new THREE.Mesh(
        new THREE.BoxGeometry(
          TILE_WORLD_SIZE,
          isRing ? 0.14 * s : 0.1 * s,
          TILE_WORLD_SIZE
        ),
        roadMat
      );
      road.position.y = isRing ? 0.07 * s : 0.05 * s;
      road.receiveShadow = true;
      group.add(road);

      // Cột đèn đường dọc theo road_urban và road_ring
      addRoadStreetlightPost(
        group,
        isRing ? 0 : 1.52 * s,
        0.1 * s,
        isRing ? 0 : -1.1 * s,
        s,
        -1
      );

      if (isRing) {
        const median = new THREE.Mesh(
          new THREE.BoxGeometry(0.28 * s, 0.18 * s, 0.28 * s),
          getMat(0x16a34a, 0.7, 0.1)
        );
        median.position.set(0, 0.16 * s, 0);
        group.add(median);
      }

      const connCount =
        (roadConn.north ? 1 : 0) +
        (roadConn.south ? 1 : 0) +
        (roadConn.west ? 1 : 0) +
        (roadConn.east ? 1 : 0);
      if (connCount >= 3) {
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05 * s, 0.06 * s, 1.5 * s, 8),
          getMat(0x475569, 0.4, 0.7)
        );
        pole.position.set(1.45 * s, 0.75 * s, 1.45 * s);
        group.add(pole);

        const lightBox = new THREE.Mesh(
          new THREE.BoxGeometry(0.22 * s, 0.42 * s, 0.22 * s),
          getMat(0x1e293b, 0.3, 0.5, 0x22c55e, 0.85)
        );
        lightBox.position.set(1.45 * s, 1.45 * s, 1.45 * s);
        group.add(lightBox);
      }
    } else if (type === 'road_highway') {
      const pier = new THREE.Mesh(
        new THREE.CylinderGeometry(0.36 * s, 0.45 * s, 0.85 * s, 12),
        getMat(0x94a3b8, 0.75, 0.15)
      );
      pier.position.set(0, 0.425 * s, 0);
      pier.castShadow = true;
      group.add(pier);

      const deckMat = getRoadSurfaceMat(roadConn, true, maxAnisotropy);
      const deck = new THREE.Mesh(
        new THREE.BoxGeometry(TILE_WORLD_SIZE, 0.2 * s, TILE_WORLD_SIZE),
        deckMat
      );
      deck.position.y = 0.9 * s;
      deck.castShadow = true;
      deck.receiveShadow = true;
      group.add(deck);

      // Cột đèn cao áp trên cầu cao tốc
      addRoadStreetlightPost(group, 1.55 * s, 0.98 * s, 0, s, -1);

      const barrierMat = getMat(0xe2e8f0, 0.6, 0.2);
      const hasNS = roadConn.north || roadConn.south;
      const hasWE = roadConn.west || roadConn.east;
      const isWEOnly = hasWE && !hasNS;
      const isNSOnly = (hasNS || (!hasNS && !hasWE)) && !hasWE;

      if (isWEOnly) {
        for (const side of [-1, 1]) {
          const rail = new THREE.Mesh(
            new THREE.BoxGeometry(TILE_WORLD_SIZE, 0.18 * s, 0.12 * s),
            barrierMat
          );
          rail.position.set(0, 1.06 * s, side * (TILE_WORLD_SIZE / 2 - 0.1));
          group.add(rail);
        }
      } else if (isNSOnly) {
        for (const side of [-1, 1]) {
          const rail = new THREE.Mesh(
            new THREE.BoxGeometry(0.12 * s, 0.18 * s, TILE_WORLD_SIZE),
            barrierMat
          );
          rail.position.set(side * (TILE_WORLD_SIZE / 2 - 0.1), 1.06 * s, 0);
          group.add(rail);
        }
      }
    }
  } else if (type === 'empty_land') {
    // Cây xanh tán tròn nhiều tầng sử dụng shared geometry
    const seed = (tile.x * 31 + tile.z * 17) % 11;
    if (seed <= 6) {
      group.add(getContactShadowMesh(1.15 * s));
      const treePositions =
        seed % 2 === 0
          ? [
              [-0.65 * s, -0.55 * s, 1.02],
              [0.72 * s, 0.48 * s, 0.82],
            ]
          : [[0.15 * s, -0.2 * s, 1.15]];

      for (let idx = 0; idx < treePositions.length; idx++) {
        const [tx, tz, tScale] = treePositions[idx];
        addRoundedCanopyTree(group, tx, tz, s, tScale, seed + idx);
      }

      if (seed % 3 === 0) {
        const rock = new THREE.Mesh(
          getCachedGeometry('empty_land_rock', () =>
            new THREE.DodecahedronGeometry(0.26 * s, 0)
          ),
          getMat(0x64748b, 0.85, 0.12)
        );
        rock.scale.set(1.2, 0.65, 0.95);
        rock.position.set(-0.75 * s, 0.14 * s, 0.68 * s);
        rock.castShadow = true;
        group.add(rock);
      }
    }
  } else if (type === 'lowland_marsh') {
    const seed = (tile.x * 19 + tile.z * 23) % 7;
    if (seed <= 4) {
      for (let i = 0; i < 3; i++) {
        const rx = (-0.65 + i * 0.65) * s;
        const rz = ((seed + i) % 2 === 0 ? -0.45 : 0.45) * s;
        const reedStem = new THREE.Mesh(
          getCachedGeometry('marsh_reed', () =>
            new THREE.CylinderGeometry(0.04 * s, 0.06 * s, 0.52 * s, 5)
          ),
          getMat(0x3f6212, 0.82, 0.05)
        );
        reedStem.position.set(rx, 0.26 * s, rz);
        group.add(reedStem);

        const bush = new THREE.Mesh(
          getCachedGeometry('marsh_bush', () =>
            new THREE.SphereGeometry(0.28 * s, 7, 6)
          ),
          getMat(0x166534, 0.8, 0.06)
        );
        bush.scale.set(1.15, 0.75, 1.15);
        bush.position.set(rx, 0.22 * s, rz);
        bush.castShadow = true;
        group.add(bush);
      }
    }
  } else if (type === 'river_water') {
    // Dải bờ kè đá xám tự nhiên (#52606d, roughness: 0.92, không emissive) dọc mép sông tiếp giáp đất liền
    if (riverBanks) {
      const bankMat = getMat(0x52606d, 0.92, 0.04, 0x000000, 0);
      const capMat = getMat(0x52606d, 0.92, 0.04, 0x000000, 0);
      const edgeOffset = TILE_WORLD_SIZE / 2 - 0.09;
      const wallH = 0.25;

      const addBankEdge = (isNS: boolean, posCoord: number) => {
        const wallGeo = getCachedGeometry(
          isNS ? 'river_bank_ns' : 'river_bank_we',
          () =>
            new THREE.BoxGeometry(
              isNS ? TILE_WORLD_SIZE : 0.18,
              wallH,
              isNS ? 0.18 : TILE_WORLD_SIZE
            )
        );
        const capGeo = getCachedGeometry(
          isNS ? 'river_cap_ns' : 'river_cap_we',
          () =>
            new THREE.BoxGeometry(
              isNS ? TILE_WORLD_SIZE : 0.22,
              0.04,
              isNS ? 0.22 : TILE_WORLD_SIZE
            )
        );
        const wall = new THREE.Mesh(wallGeo, bankMat);
        wall.position.set(
          isNS ? 0 : posCoord,
          wallH / 2,
          isNS ? posCoord : 0
        );
        wall.receiveShadow = true;
        wall.castShadow = false;
        group.add(wall);

        const cap = new THREE.Mesh(capGeo, capMat);
        cap.position.set(
          isNS ? 0 : posCoord,
          wallH + 0.02,
          isNS ? posCoord : 0
        );
        cap.receiveShadow = true;
        cap.castShadow = false;
        group.add(cap);
      };

      if (riverBanks.northLand) addBankEdge(true, -edgeOffset);
      if (riverBanks.southLand) addBankEdge(true, edgeOffset);
      if (riverBanks.westLand) addBankEdge(false, -edgeOffset);
      if (riverBanks.eastLand) addBankEdge(false, edgeOffset);
    }
  }

  // Hiệu ứng giàn giáo & cần cẩu khi công trình đang trong thời gian xây dựng
  if (tile.constructionRemainingDays > 0 && tile.constructionTotalDays > 0) {
    const progress = Math.max(
      0.35,
      1 - tile.constructionRemainingDays / (tile.constructionTotalDays + 0.5)
    );
    group.scale.y = progress;

    const scaffoldMat = getMat(0xf59e0b, 0.5, 0.4, 0xf59e0b, 0.25);
    const corners = [
      [-1.35 * s, -1.35 * s],
      [1.35 * s, -1.35 * s],
      [-1.35 * s, 1.35 * s],
      [1.35 * s, 1.35 * s],
    ];
    for (const [cx, cz] of corners) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05 * s, 0.05 * s, 1.8 * s, 6),
        scaffoldMat
      );
      post.position.set(cx, 0.9 * s, cz);
      group.add(post);
    }
  }

  if (tile.hasDrainage && type !== 'river_water') {
    const grate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24 * s, 0.24 * s, 0.08 * s, 10),
      getMat(0x06b6d4, 0.25, 0.8, 0x06b6d4, 0.35)
    );
    grate.position.set(-1.5 * s, 0.12 * s, 1.5 * s);
    group.add(grate);
  }

  if (tile.disputeTurns > 0) {
    const signPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06 * s, 0.06 * s, 1.4 * s, 8),
      getMat(0xef4444, 0.4, 0.4)
    );
    signPole.position.set(0, 0.7 * s, 0);
    group.add(signPole);

    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(1.4 * s, 0.65 * s, 0.12 * s),
      getMat(0xdc2626, 0.3, 0.2, 0xef4444, 0.5)
    );
    banner.position.set(0, 1.35 * s, 0);
    group.add(banner);
  }

  return group;
}

export function updateRoadSnapPreviewGroup(
  previewGroup: THREE.Group,
  conn: RoadConnections
): void {
  while (previewGroup.children.length > 0) {
    const child = previewGroup.children[0];
    disposeGroupGeometries(child);
    previewGroup.remove(child);
  }
  const s = TILE_WORLD_SIZE / 4.0;
  const previewMat = getMat(0xfacc15, 0.3, 0.2, 0xfacc15, 0.55);

  const hub = new THREE.Mesh(
    new THREE.BoxGeometry(1.1 * s, 0.08, 1.1 * s),
    previewMat
  );
  hub.position.y = 0.16;
  previewGroup.add(hub);

  const hasAny = conn.north || conn.south || conn.west || conn.east;
  const n = conn.north || !hasAny;
  const so = conn.south || !hasAny;

  if (n) {
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.65 * s, 0.08, 1.45 * s),
      previewMat
    );
    arm.position.set(0, 0.16, -1.2 * s);
    previewGroup.add(arm);
  }
  if (so) {
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.65 * s, 0.08, 1.45 * s),
      previewMat
    );
    arm.position.set(0, 0.16, 1.2 * s);
    previewGroup.add(arm);
  }
  if (conn.west) {
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(1.45 * s, 0.08, 0.65 * s),
      previewMat
    );
    arm.position.set(-1.2 * s, 0.16, 0);
    previewGroup.add(arm);
  }
  if (conn.east) {
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(1.45 * s, 0.08, 0.65 * s),
      previewMat
    );
    arm.position.set(1.2 * s, 0.16, 0);
    previewGroup.add(arm);
  }
}

function addSidewalkVendorStalls(group: THREE.Group, s: number): void {
  const umbrellaColors = [0xef4444, 0x3b82f6, 0xeab308];
  const stoolColors = [0xef4444, 0x2563eb];
  for (let i = 0; i < 3; i++) {
    const vx = (-1.2 + i * 1.2) * s;
    const vz = 1.42 * s;

    const parasol = new THREE.Mesh(
      new THREE.ConeGeometry(0.38 * s, 0.24 * s, 8),
      getMat(umbrellaColors[i], 0.65, 0.05)
    );
    parasol.position.set(vx, 0.62 * s, vz);
    group.add(parasol);

    for (let st = 0; st < 2; st++) {
      const stool = new THREE.Mesh(
        new THREE.BoxGeometry(0.16 * s, 0.18 * s, 0.16 * s),
        getMat(stoolColors[st % 2], 0.5, 0.1)
      );
      stool.position.set(vx + (-0.15 + st * 0.3) * s, 0.09 * s, vz + 0.15 * s);
      group.add(stool);
    }
  }
}

export function createVehicleMesh(
  kind: 'motorbike' | 'bus' | 'truck'
): THREE.Group {
  const g = new THREE.Group();
  const s = 0.85;
  g.add(getContactShadowMesh((kind === 'motorbike' ? 0.35 : 0.75) * s));

  if (kind === 'motorbike') {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.42 * s, 0.24 * s, 0.18 * s),
      getMat(0x10b981, 0.35, 0.4)
    );
    body.position.set(0, 0.2 * s, 0);
    g.add(body);

    const riderTorso = new THREE.Mesh(
      new THREE.BoxGeometry(0.2 * s, 0.28 * s, 0.16 * s),
      getMat(0x059669, 0.7, 0.05)
    );
    riderTorso.position.set(-0.04 * s, 0.42 * s, 0);
    g.add(riderTorso);

    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.11 * s, 8, 8),
      getMat(0xfacc15, 0.25, 0.3)
    );
    helmet.position.set(-0.02 * s, 0.64 * s, 0);
    g.add(helmet);

    const headlight = new THREE.Mesh(
      new THREE.SphereGeometry(0.06 * s, 8, 8),
      getMat(0xfef08a, 0.1, 0.2, 0xfef08a, 0.95)
    );
    headlight.position.set(0.22 * s, 0.28 * s, 0);
    g.add(headlight);
  } else if (kind === 'bus') {
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(1.15 * s, 0.52 * s, 0.46 * s),
      getMat(0x0284c7, 0.35, 0.45)
    );
    hull.position.set(0, 0.32 * s, 0);
    hull.castShadow = true;
    g.add(hull);

    const roofAc = new THREE.Mesh(
      new THREE.BoxGeometry(0.65 * s, 0.1 * s, 0.34 * s),
      getMat(0xf8fafc, 0.5, 0.2)
    );
    roofAc.position.set(0, 0.62 * s, 0);
    g.add(roofAc);

    const windows = new THREE.Mesh(
      new THREE.BoxGeometry(1.18 * s, 0.2 * s, 0.48 * s),
      getMat(0xbae6fd, 0.15, 0.8, 0xfef08a, 0.45)
    );
    windows.position.set(0, 0.38 * s, 0);
    g.add(windows);
  } else {
    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(0.42 * s, 0.5 * s, 0.46 * s),
      getMat(0xf59e0b, 0.4, 0.5)
    );
    cab.position.set(0.42 * s, 0.31 * s, 0);
    cab.castShadow = true;
    g.add(cab);

    const container = new THREE.Mesh(
      new THREE.BoxGeometry(0.88 * s, 0.58 * s, 0.48 * s),
      getMat(0xef4444, 0.6, 0.3)
    );
    container.position.set(-0.26 * s, 0.36 * s, 0);
    container.castShadow = true;
    g.add(container);
  }

  return g;
}

/**
 * Tạo mô hình 3D Tàu Thủy (Cargo Ship chở container & Commercial Ship chở khách)
 * di chuyển dọc theo sông Thịnh Vượng.
 */
export function createWaterShipMesh(
  kind: 'cargo' | 'commercial'
): THREE.Group {
  const g = new THREE.Group();
  const s = 0.85;

  if (kind === 'cargo') {
    // Thân tàu chở hàng container (Cargo Barge / Ship)
    const hull = new THREE.Mesh(
      getCachedGeometry('ship_cargo_hull', () =>
        new THREE.BoxGeometry(0.76 * s, 0.26 * s, 2.05 * s)
      ),
      getMat(0x1e293b, 0.55, 0.35)
    );
    hull.position.set(0, 0.12 * s, 0);
    hull.castShadow = true;
    g.add(hull);

    // Mũi tàu vát nhọn (Bow)
    const bow = new THREE.Mesh(
      getCachedGeometry('ship_cargo_bow', () => {
        const cone = new THREE.ConeGeometry(0.54 * s, 0.55 * s, 4);
        cone.rotateX(Math.PI / 2);
        cone.rotateZ(Math.PI / 4);
        return cone;
      }),
      getMat(0x991b1b, 0.5, 0.3)
    );
    bow.scale.set(1, 1, 0.55);
    bow.position.set(0, 0.14 * s, 1.25 * s);
    bow.castShadow = true;
    g.add(bow);

    // Đài chỉ huy phía đuôi tàu (Bridge cabin)
    const bridge = new THREE.Mesh(
      getCachedGeometry('ship_cargo_bridge', () =>
        new THREE.BoxGeometry(0.62 * s, 0.46 * s, 0.48 * s)
      ),
      getMat(0xf8fafc, 0.4, 0.2)
    );
    bridge.position.set(0, 0.46 * s, -0.72 * s);
    bridge.castShadow = true;
    g.add(bridge);

    // Các kiện Container nhiều màu sắc xếp trên boong tàu
    const containerColors = [0xef4444, 0x0284c7, 0xf59e0b, 0x16a34a];
    for (let i = 0; i < 3; i++) {
      const box = new THREE.Mesh(
        getCachedGeometry('ship_cargo_container', () =>
          new THREE.BoxGeometry(0.56 * s, 0.28 * s, 0.44 * s)
        ),
        getMat(containerColors[i % containerColors.length], 0.5, 0.35)
      );
      box.position.set(0, 0.38 * s, (-0.18 + i * 0.48) * s);
      box.castShadow = true;
      g.add(box);
    }

    // Đèn dẫn đường mũi tàu phát sáng ban đêm
    const navLight = new THREE.Mesh(
      getCachedGeometry('ship_nav_light', () =>
        new THREE.SphereGeometry(0.07 * s, 8, 8)
      ),
      getStreetlightBulbMat()
    );
    navLight.position.set(0, 0.74 * s, -0.68 * s);
    g.add(navLight);
  } else {
    // Tàu du lịch thương mại (Commercial Passenger River Cruise)
    const hull = new THREE.Mesh(
      getCachedGeometry('ship_comm_hull', () =>
        new THREE.BoxGeometry(0.68 * s, 0.22 * s, 1.68 * s)
      ),
      getMat(0xf8fafc, 0.35, 0.25)
    );
    hull.position.set(0, 0.11 * s, 0);
    hull.castShadow = true;
    g.add(hull);

    // Khoang kính hành khách phát sáng lung linh ban đêm
    const cabin = new THREE.Mesh(
      getCachedGeometry('ship_comm_cabin', () =>
        new THREE.BoxGeometry(0.56 * s, 0.28 * s, 1.18 * s)
      ),
      getMat(0x38bdf8, 0.15, 0.75, 0xffd166, 0.65)
    );
    cabin.position.set(0, 0.34 * s, -0.05 * s);
    cabin.castShadow = true;
    g.add(cabin);

    // Mái che boong thượng (Sun deck)
    const sunDeck = new THREE.Mesh(
      getCachedGeometry('ship_comm_roof', () =>
        new THREE.BoxGeometry(0.6 * s, 0.06 * s, 1.24 * s)
      ),
      getMat(0xf59e0b, 0.35, 0.4, 0xf59e0b, 0.35)
    );
    sunDeck.position.set(0, 0.51 * s, -0.05 * s);
    g.add(sunDeck);
  }

  return g;
}
