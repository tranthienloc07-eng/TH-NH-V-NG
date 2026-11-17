import * as THREE from 'three';
import { RoadConnections, TileData } from './types';

export const TILE_WORLD_SIZE = 3.2;

let sharedMicroBumpTex: THREE.CanvasTexture | null = null;
let sharedContactShadowMat: THREE.MeshBasicMaterial | null = null;
let sharedShadowDiscGeo: THREE.CircleGeometry | null = null;
const roadTexCache = new Map<string, THREE.CanvasTexture>();

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
 * Tạo texture mặt đường tự động xoay & nối liền theo đúng 4 hướng (north, south, west, east)
 * Khắc phục triệt để lỗi vạch kẻ đường dọc trên đường ngang.
 * Quy ước UV mặt trên BoxGeometry:
 *   - Trục X của Canvas (0..256) = Tây (-X) sang Đông (+X)
 *   - Trục Y của Canvas (0..256) = Bắc (-Z) sang Nam (+Z)
 */
export function getConnectedRoadTexture(
  conn: RoadConnections,
  isHighway: boolean,
  maxAnisotropy = 4
): THREE.CanvasTexture {
  const hasNS = conn.north || conn.south;
  const hasWE = conn.west || conn.east;

  // Nếu ô đường đứng một mình chưa nối với ai, mặc định hiển thị hướng Bắc-Nam
  const n = conn.north || (!hasNS && !hasWE);
  const s = conn.south || (!hasNS && !hasWE);
  const w = conn.west;
  const e = conn.east;

  // Nếu chỉ có 1 đầu nối (đường cụt), kéo dài vạch đường xuyên suốt trục đó để liền mạch
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
  ctx.fillStyle = isHighway ? '#64748b' : '#948c80';
  ctx.fillRect(0, 0, 256, 256);

  const margin = isHighway ? 22 : 34;
  const roadWidth = 256 - margin * 2;
  const asphaltColor = isHighway ? '#1e242b' : '#262c34';

  ctx.fillStyle = asphaltColor;

  const connCount = (n ? 1 : 0) + (s ? 1 : 0) + (w ? 1 : 0) + (e ? 1 : 0);
  const isLCorner = connCount === 2 && (n || s) && (w || e);

  if (fullNS) {
    // Đường thẳng Bắc - Nam (Dọc trục Z)
    ctx.fillRect(margin, 0, roadWidth, 256);
    drawNorthSouthMarkings(ctx, 0, 256, isHighway);
  } else if (fullWE) {
    // Đường thẳng Tây - Đông (Ngang trục X) — vạch kẻ chạy ngang theo đúng chiều xe chạy!
    ctx.fillRect(0, margin, 256, roadWidth);
    drawWestEastMarkings(ctx, 0, 256, isHighway);
  } else if (isLCorner) {
    // Khúc cua 90 độ (Góc chữ L): Vẽ mặt đường cong & vạch phân làn uốn cong đồng tâm
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
      // n && w
      startAngle = 0;
      endAngle = Math.PI / 2;
    }

    ctx.save();
    ctx.lineCap = 'butt';

    // Mặt nhựa đường uốn cong
    ctx.strokeStyle = asphaltColor;
    ctx.lineWidth = roadWidth;
    ctx.beginPath();
    ctx.arc(arcCx, arcCy, 128, startAngle, endAngle);
    ctx.stroke();

    // Vạch tim đường đôi màu vàng uốn cong
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 3;
    for (const rOffset of [-2.5, 2.5]) {
      ctx.beginPath();
      ctx.arc(arcCx, arcCy, 128 + rOffset, startAngle, endAngle);
      ctx.stroke();
    }

    // Vạch đứt phân làn màu trắng uốn cong theo 2 làn xe
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
    ctx.fillRect(margin, margin, roadWidth, roadWidth);
    if (n) ctx.fillRect(margin, 0, roadWidth, margin + 4);
    if (s) ctx.fillRect(margin, 256 - margin - 4, roadWidth, margin + 4);
    if (w) ctx.fillRect(0, margin, margin + 4, roadWidth);
    if (e) ctx.fillRect(256 - margin - 4, margin, margin + 4, roadWidth);

    // Kẻ vạch từng nhánh nối vào nút giao
    if (n) drawNorthSouthMarkings(ctx, 0, margin, isHighway);
    if (s) drawNorthSouthMarkings(ctx, 256 - margin, 256, isHighway);
    if (w) drawWestEastMarkings(ctx, 0, margin, isHighway);
    if (e) drawWestEastMarkings(ctx, 256 - margin, 256, isHighway);

    // Vạch qua đường (Zebra Crosswalk) cho đường đô thị tại các nhánh giao lộ
    if (!isHighway && connCount >= 3) {
      ctx.fillStyle = '#e2e8f0';
      for (let pos = margin + 12; pos < 256 - margin - 12; pos += 18) {
        if (n) ctx.fillRect(pos, margin + 4, 8, 14);
        if (s) ctx.fillRect(pos, 256 - margin - 18, 8, 14);
        if (w) ctx.fillRect(margin + 4, pos, 14, 8);
        if (e) ctx.fillRect(256 - margin - 18, pos, 14, 8);
      }
    }
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
  // Vạch tim đường đôi màu vàng dọc theo trục Bắc - Nam
  ctx.fillStyle = '#eab308';
  ctx.fillRect(124, yStart, 3, yEnd - yStart);
  ctx.fillRect(129, yStart, 3, yEnd - yStart);

  // Vạch đứt phân làn màu trắng dọc theo trục Bắc - Nam
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
  // Vạch tim đường đôi màu vàng ngang theo trục Tây - Đông
  ctx.fillStyle = '#eab308';
  ctx.fillRect(xStart, 124, xEnd - xStart, 3);
  ctx.fillRect(xStart, 129, xEnd - xStart, 3);

  // Vạch đứt phân làn màu trắng ngang theo trục Tây - Đông
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
      roughness: isHighway ? 0.68 : 0.78,
      metalness: isHighway ? 0.15 : 0.08,
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

export function buildTileStructureGroup(
  tile: TileData,
  roadConn: RoadConnections,
  maxAnisotropy = 4
): THREE.Group {
  const group = new THREE.Group();
  const type = tile.type;
  const s = TILE_WORLD_SIZE / 4.0; // Hệ số tỷ lệ cho lưới 18x18 mịn hơn

  if (type === 'res_low') {
    group.add(getContactShadowMesh(1.85 * s));
    const houseColors = [0xfef08a, 0xbae6fd, 0xfed7aa, 0xe9d5ff];
    const roofColors = [0xb91c1c, 0x0369a1, 0x15803d, 0x9a3412];
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

      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(1.02 * s, 0.12 * s, 1.32 * s),
        getMat(roofColors[i], 0.42, 0.45)
      );
      roof.position.set(hx, hHeight + 0.06 * s, hz);
      group.add(roof);

      const waterTank = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14 * s, 0.14 * s, 0.36 * s, 10),
        getMat(0xe2e8f0, 0.18, 0.88)
      );
      waterTank.position.set(hx + 0.2 * s, hHeight + 0.26 * s, hz - 0.2 * s);
      group.add(waterTank);
    }
  } else if (type === 'res_mid' || type === 'com_street') {
    group.add(getContactShadowMesh(1.9 * s));
    const isShop = type === 'com_street';
    const colors = isShop
      ? [0xfde047, 0xfda4af, 0x7dd3fc]
      : [0xf8fafc, 0xfef3c7, 0xe0f2fe];

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
        new THREE.ConeGeometry(0.78 * s, 0.52 * s, 4),
        getMat(0xb91c1c, 0.55, 0.12)
      );
      roof.rotation.y = Math.PI / 4;
      roof.position.set(hx, hHeight + 0.26 * s, -0.2 * s);
      group.add(roof);

      const awning = new THREE.Mesh(
        new THREE.BoxGeometry(0.96 * s, 0.08 * s, 0.45 * s),
        getMat(
          isShop ? 0xdc2626 : 0x0284c7,
          0.4,
          0.2,
          isShop ? 0xf59e0b : 0x000000,
          isShop ? 0.25 : 0
        )
      );
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
        new THREE.BoxGeometry(1.29 * s, th - 0.3 * s, 1.1 * s),
        getMat(0x0ea5e9, 0.14, 0.82)
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
    const hall = new THREE.Mesh(
      new THREE.BoxGeometry(3.1 * s, 1.35 * s, 2.7 * s),
      getMat(0xfde68a, 0.78, 0.05)
    );
    hall.position.set(0, 0.675 * s, 0);
    hall.castShadow = true;
    hall.receiveShadow = true;
    group.add(hall);

    const mainRoof = new THREE.Mesh(
      new THREE.ConeGeometry(2.35 * s, 0.85 * s, 4),
      getMat(0xb91c1c, 0.58, 0.1)
    );
    mainRoof.rotation.y = Math.PI / 4;
    mainRoof.position.set(0, 1.75 * s, 0);
    group.add(mainRoof);

    const clockTower = new THREE.Mesh(
      new THREE.BoxGeometry(0.85 * s, 1.25 * s, 0.85 * s),
      getMat(0xfef08a, 0.7, 0.08)
    );
    clockTower.position.set(0, 1.9 * s, 1.05 * s);
    group.add(clockTower);

    const towerRoof = new THREE.Mesh(
      new THREE.ConeGeometry(0.68 * s, 0.5 * s, 4),
      getMat(0x991b1b, 0.5, 0.15)
    );
    towerRoof.rotation.y = Math.PI / 4;
    towerRoof.position.set(0, 2.75 * s, 1.05 * s);
    group.add(towerRoof);

    addSidewalkVendorStalls(group, s);
  } else if (type === 'com_mall') {
    group.add(getContactShadowMesh(2.05 * s));
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(3.4 * s, 2.1 * s, 3.0 * s),
      getMat(0x1e293b, 0.22, 0.75)
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
      getMat(0x38bdf8, 0.12, 0.88)
    );
    atriumDome.position.set(0, 2.1 * s, 0);
    group.add(atriumDome);

    const neonSign = new THREE.Mesh(
      new THREE.BoxGeometry(2.4 * s, 0.32 * s, 0.12 * s),
      getMat(0xf43f5e, 0.2, 0.3, 0xf43f5e, 0.65)
    );
    neonSign.position.set(0, 1.75 * s, 1.54 * s);
    group.add(neonSign);
  } else if (type === 'com_office') {
    group.add(getContactShadowMesh(2.1 * s));
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
      getMat(0x0284c7, 0.12, 0.9, 0x0ea5e9, 0.22)
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
      getMat(0xfacc15, 0.15, 0.9, 0xf59e0b, 0.5)
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
      new THREE.BoxGeometry(3.2 * s, 1.5 * s, 2.6 * s),
      getMat(0x94a3b8, 0.65, 0.35)
    );
    hall.position.set(0, 0.75 * s, 0);
    hall.castShadow = true;
    hall.receiveShadow = true;
    group.add(hall);

    for (let i = 0; i < 2; i++) {
      const stack = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22 * s, 0.3 * s, 2.7 * s, 12),
        getMat(0x475569, 0.55, 0.45)
      );
      stack.position.set((-0.9 + i * 0.75) * s, 1.35 * s, -0.8 * s);
      stack.castShadow = true;
      group.add(stack);

      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24 * s, 0.25 * s, 0.25 * s, 12),
        getMat(0xef4444, 0.4, 0.2)
      );
      band.position.set((-0.9 + i * 0.75) * s, 2.4 * s, -0.8 * s);
      group.add(band);
    }
  } else if (type === 'ind_food') {
    group.add(getContactShadowMesh(2.0 * s));
    const foodHall = new THREE.Mesh(
      new THREE.BoxGeometry(2.6 * s, 1.45 * s, 2.5 * s),
      getMat(0xf8fafc, 0.45, 0.25)
    );
    foodHall.position.set(-0.35 * s, 0.725 * s, 0);
    foodHall.castShadow = true;
    foodHall.receiveShadow = true;
    group.add(foodHall);

    const greenRoof = new THREE.Mesh(
      new THREE.BoxGeometry(2.68 * s, 0.16 * s, 2.58 * s),
      getMat(0x16a34a, 0.4, 0.3)
    );
    greenRoof.position.set(-0.35 * s, 1.52 * s, 0);
    group.add(greenRoof);

    for (let i = 0; i < 2; i++) {
      const silo = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42 * s, 0.42 * s, 2.1 * s, 14),
        getMat(0xe2e8f0, 0.22, 0.85)
      );
      silo.position.set(1.25 * s, 1.05 * s, (-0.55 + i * 1.1) * s);
      silo.castShadow = true;
      group.add(silo);

      const siloDome = new THREE.Mesh(
        new THREE.SphereGeometry(0.42 * s, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        getMat(0x22c55e, 0.3, 0.5)
      );
      siloDome.position.set(1.25 * s, 2.1 * s, (-0.55 + i * 1.1) * s);
      group.add(siloDome);
    }
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
      getMat(0x06b6d4, 0.12, 0.88, 0x0891b2, 0.25)
    );
    glassBand.position.set(0, 1.05 * s, 0);
    group.add(glassBand);

    const rdTower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75 * s, 0.85 * s, 2.9 * s, 16),
      getMat(0x0284c7, 0.15, 0.85)
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
    const mainBlock = new THREE.Mesh(
      new THREE.BoxGeometry(3.2 * s, 1.6 * s, 2.0 * s),
      getMat(0xfef08a, 0.72, 0.08)
    );
    mainBlock.position.set(0, 0.8 * s, -0.3 * s);
    mainBlock.castShadow = true;
    mainBlock.receiveShadow = true;
    group.add(mainBlock);

    const redRoof = new THREE.Mesh(
      new THREE.ConeGeometry(2.2 * s, 0.75 * s, 4),
      getMat(0xdc2626, 0.52, 0.12)
    );
    redRoof.rotation.y = Math.PI / 4;
    redRoof.position.set(0, 1.95 * s, -0.3 * s);
    group.add(redRoof);

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04 * s, 0.06 * s, 2.8 * s, 8),
      getMat(0xe2e8f0, 0.2, 0.85)
    );
    pole.position.set(0, 1.4 * s, 1.35 * s);
    group.add(pole);

    const flag = new THREE.Mesh(
      new THREE.BoxGeometry(0.65 * s, 0.42 * s, 0.04 * s),
      getMat(0xef4444, 0.4, 0.1, 0xdc2626, 0.3)
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
      getMat(0xef4444, 0.3, 0.2, 0xef4444, 0.45)
    );
    crossH.position.set(0, 2.75 * s, 0.8 * s);
    group.add(crossH);

    const crossV = new THREE.Mesh(
      new THREE.BoxGeometry(0.24 * s, 0.75 * s, 0.2 * s),
      getMat(0xef4444, 0.3, 0.2, 0xef4444, 0.45)
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
      getMat(0x06b6d4, 0.14, 0.86, 0x0891b2, 0.28)
    );
    glassTower.position.set(0, 1.95 * s, -0.15 * s);
    glassTower.castShadow = true;
    group.add(glassTower);

    const helipad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95 * s, 0.95 * s, 0.1 * s, 16),
      getMat(0x10b981, 0.4, 0.3, 0x10b981, 0.35)
    );
    helipad.position.set(0, 3.6 * s, -0.15 * s);
    group.add(helipad);

    const crossH = new THREE.Mesh(
      new THREE.BoxGeometry(0.75 * s, 0.22 * s, 0.2 * s),
      getMat(0x10b981, 0.2, 0.3, 0x10b981, 0.55)
    );
    crossH.position.set(0, 3.95 * s, 0.65 * s);
    group.add(crossH);

    const crossV = new THREE.Mesh(
      new THREE.BoxGeometry(0.22 * s, 0.75 * s, 0.2 * s),
      getMat(0x10b981, 0.2, 0.3, 0x10b981, 0.55)
    );
    crossV.position.set(0, 3.95 * s, 0.65 * s);
    group.add(crossV);
  } else if (type === 'pub_school') {
    group.add(getContactShadowMesh(2.0 * s));
    const mainHall = new THREE.Mesh(
      new THREE.BoxGeometry(3.2 * s, 1.55 * s, 1.2 * s),
      getMat(0xfde047, 0.7, 0.08)
    );
    mainHall.position.set(0, 0.775 * s, -0.75 * s);
    mainHall.castShadow = true;
    group.add(mainHall);

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(3.35 * s, 0.28 * s, 1.38 * s),
      getMat(0xdc2626, 0.55, 0.1)
    );
    roof.position.set(0, 1.68 * s, -0.75 * s);
    group.add(roof);

    for (const side of [-1, 1]) {
      const sideWing = new THREE.Mesh(
        new THREE.BoxGeometry(0.95 * s, 1.35 * s, 1.8 * s),
        getMat(0xfef08a, 0.7, 0.08)
      );
      sideWing.position.set(side * 1.12 * s, 0.675 * s, 0.35 * s);
      sideWing.castShadow = true;
      group.add(sideWing);
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
      getMat(0x38bdf8, 0.15, 0.85, 0x0284c7, 0.25)
    );
    atrium.position.set(-0.35 * s, 1.45 * s, -0.25 * s);
    atrium.castShadow = true;
    group.add(atrium);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.72 * s, 14, 12),
      getMat(0xf59e0b, 0.25, 0.65, 0xd97706, 0.3)
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
      getMat(0xf59e0b, 0.25, 0.75, 0xf59e0b, 0.45)
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
      // Đường đất / Hẻm nhỏ tự động nối liền 4 hướng (Snapping tạo T-junction & Cross-intersection liền mạch)
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

      if (isRing) {
        // Dải phân cách cây xanh và trụ đèn cao áp của Đường Vành Đai 4 làn
        const median = new THREE.Mesh(
          new THREE.BoxGeometry(0.28 * s, 0.18 * s, 0.28 * s),
          getMat(0x16a34a, 0.7, 0.1)
        );
        median.position.set(0, 0.16 * s, 0);
        group.add(median);

        const lampPost = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04 * s, 0.05 * s, 1.65 * s, 8),
          getMat(0x94a3b8, 0.3, 0.8)
        );
        lampPost.position.set(0, 0.85 * s, 0);
        group.add(lampPost);

        const lampHead = new THREE.Mesh(
          new THREE.BoxGeometry(0.45 * s, 0.08 * s, 0.16 * s),
          getMat(0xfef08a, 0.2, 0.5, 0xfacc15, 0.85)
        );
        lampHead.position.set(0, 1.68 * s, 0);
        group.add(lampHead);
      }

      // Đèn giao thông tự động xuất hiện tại Ngã Ba Chữ T (T-Junction) và Ngã Tư (Cross-Intersection)
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
          getMat(0x1e293b, 0.3, 0.5, 0x22c55e, 0.75)
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

      // Lan can thành cầu cao tốc chỉ đặt ở các cạnh KHÔNG nối tiếp với ô đường khác
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
    // Mô hình 3D cây xanh nhiệt đới, bụi cỏ & đá tự nhiên trên các ô đất quy hoạch chưa xây dựng
    const seed = (tile.x * 31 + tile.z * 17) % 11;
    if (seed <= 6) {
      group.add(getContactShadowMesh(1.15 * s));
      const treePositions =
        seed % 2 === 0
          ? [
              [-0.65 * s, -0.55 * s, 1.05],
              [0.72 * s, 0.48 * s, 0.82],
            ]
          : [[0.15 * s, -0.2 * s, 1.18]];

      for (const [tx, tz, tScale] of treePositions) {
        const trunkH = 0.55 * s * tScale;
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(
            0.09 * s * tScale,
            0.14 * s * tScale,
            trunkH,
            7
          ),
          getMat(0x5c4033, 0.88, 0.04)
        );
        trunk.position.set(tx, trunkH / 2, tz);
        trunk.castShadow = true;
        group.add(trunk);

        const lowerCrown = new THREE.Mesh(
          new THREE.ConeGeometry(0.62 * s * tScale, 0.95 * s * tScale, 7),
          getMat(seed % 3 === 0 ? 0x15803d : 0x16a34a, 0.78, 0.05)
        );
        lowerCrown.position.set(tx, trunkH + 0.32 * s * tScale, tz);
        lowerCrown.castShadow = true;
        lowerCrown.receiveShadow = true;
        group.add(lowerCrown);

        const upperCrown = new THREE.Mesh(
          new THREE.ConeGeometry(0.44 * s * tScale, 0.72 * s * tScale, 7),
          getMat(0x22c55e, 0.72, 0.06)
        );
        upperCrown.position.set(tx, trunkH + 0.78 * s * tScale, tz);
        upperCrown.castShadow = true;
        group.add(upperCrown);
      }

      if (seed % 3 === 0) {
        const rock = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.26 * s, 0),
          getMat(0x64748b, 0.85, 0.12)
        );
        rock.scale.set(1.2, 0.65, 0.95);
        rock.position.set(-0.75 * s, 0.14 * s, 0.68 * s);
        rock.castShadow = true;
        group.add(rock);
      }
    }
  } else if (type === 'lowland_marsh') {
    // Mô hình 3D cụm lau sậy, đước ven sông & đá ngập nước
    const seed = (tile.x * 19 + tile.z * 23) % 7;
    if (seed <= 4) {
      for (let i = 0; i < 3; i++) {
        const rx = (-0.65 + i * 0.65) * s;
        const rz = ((seed + i) % 2 === 0 ? -0.45 : 0.45) * s;
        const reedStem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04 * s, 0.06 * s, 0.52 * s, 5),
          getMat(0x3f6212, 0.82, 0.05)
        );
        reedStem.position.set(rx, 0.26 * s, rz);
        group.add(reedStem);

        const bush = new THREE.Mesh(
          new THREE.SphereGeometry(0.28 * s, 7, 6),
          getMat(0x166534, 0.8, 0.06)
        );
        bush.scale.set(1.15, 0.75, 1.15);
        bush.position.set(rx, 0.22 * s, rz);
        bush.castShadow = true;
        group.add(bush);
      }
    }
  } else if (type === 'river_water') {
    // Mô hình 3D thuyền ghe / sà lan thương hồ trên sông Thịnh Vượng
    const seed = (tile.x * 13 + tile.z * 29) % 11;
    if (seed === 0 || seed === 5) {
      const hull = new THREE.Mesh(
        new THREE.BoxGeometry(0.55 * s, 0.18 * s, 1.45 * s),
        getMat(seed === 0 ? 0x78350f : 0x0f172a, 0.65, 0.2)
      );
      hull.position.set(0, 0.02 * s, 0);
      hull.castShadow = true;
      group.add(hull);

      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(0.42 * s, 0.24 * s, 0.58 * s),
        getMat(seed === 0 ? 0xfef08a : 0x38bdf8, 0.45, 0.3)
      );
      cabin.position.set(0, 0.2 * s, -0.15 * s);
      cabin.castShadow = true;
      group.add(cabin);
    }
  }

  // Hiệu ứng giàn giáo & cần cẩu khi công trình đang trong thời gian xây dựng (ConstructionRemainingDays > 0)
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

/**
 * Tạo hiệu ứng 3D hiển thị trực quan (Visual Placement Preview) các nhánh đường sẽ tự động bắt dính
 * (T-Junction / Cross-Intersection) khi người chơi lia chuột chuẩn bị đặt đường.
 */
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
      getMat(0xfef08a, 0.1, 0.2, 0xfef08a, 0.8)
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
      getMat(0xbae6fd, 0.15, 0.8)
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
