import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { mountIsometricCanvasFallback } from '../game/canvas2dFallback';
import {
  buildTileStructureGroup,
  createVehicleMesh,
  createWaterShipMesh,
  disposeGroupGeometries,
  disposeGroupResources,
  getMicroBumpTexture,
  getWaterNormalTexture,
  RiverBankConnections,
  TILE_WORLD_SIZE,
  updateCityLightsEmissiveIntensity,
  updateRoadSnapPreviewGroup,
} from '../game/models3d';
import {
  createWaterShipAgent,
  generateWaterShipRoutesFromGrid,
  stepWaterShipAgent,
  WaterShipAgent,
} from '../game/navigation/waterPaths';
import {
  canPlaceToolAtTile,
  detectGhostCollision,
  detectRoadProximitySnap,
  getRoadConnections,
  GRID_SIZE,
  isBuiltStructure,
  isRoadTile,
} from '../game/rules';
import {
  createVehicleNavAgent,
  generateVehicleRoutesFromGrid,
  NodeOccupancyMap,
  sampleRouteAtDistance,
  stepVehicleNavigationAgent,
  VehicleNavAgentState,
} from '../game/roadVehiclePaths';
import { soundEngine } from '../game/audio';
import {
  CityGameState,
  RoadConnections,
  TileData,
  TileType,
  ToolId,
} from '../game/types';

export type GraphicQuality = 'high' | 'medium';
export type HeatmapMode = 'none' | 'land_value';

export interface HoverTileInfo {
  x: number;
  z: number;
  clientX: number;
  clientY: number;
}

interface CityViewport3DProps {
  gameState: CityGameState;
  graphicQuality: GraphicQuality;
  heatmapMode?: HeatmapMode;
  onDetectSoftwareGl?: (isSoftwareGl: boolean) => void;
  onTileClick: (x: number, z: number) => void;
  onTileRightClick: (x: number, z: number, clientX: number, clientY: number) => void;
  onTileHover: (info: HoverTileInfo | null) => void;
  cameraPresetTrigger: number;
  pulseEventCount: number;
}

interface ActiveRoadVehicle {
  mesh: THREE.Group;
  navAgent: VehicleNavAgentState;
}

interface ActiveWaterShip {
  mesh: THREE.Group;
  agent: WaterShipAgent;
}

interface StreetlightWorldAnchor {
  x: number;
  y: number;
  z: number;
  distSq: number;
}

const PARTICLE_POOL_SIZE = 140;
const STREETLIGHT_POOL_SIZE = 6;
const DAY_NIGHT_CYCLE_SECONDS = 60;

const _scratchVec3 = new THREE.Vector3();
const _scratchRightVec3 = new THREE.Vector3();
const _scratchMat4 = new THREE.Matrix4();
const _scratchQuat = new THREE.Quaternion();
const _scratchScale = new THREE.Vector3();
const _scratchColor = new THREE.Color();
const _scratchColorB = new THREE.Color();
const _scratchGhostBox = new THREE.Box3();
const _scratchStructBox = new THREE.Box3();

const _colDaySky = new THREE.Color(0x162b40);
const _colSunsetSky = new THREE.Color(0x3b1f3b);
const _colNightSky = new THREE.Color(0x060b16);
const _colDawnSky = new THREE.Color(0x1f1b33);

const _colDaySun = new THREE.Color(0xfff1d0);
const _colSunsetSun = new THREE.Color(0xff7b42);
const _colNightMoon = new THREE.Color(0x475569);
const _colDawnSun = new THREE.Color(0xffb07c);

const _colDayHemiSky = new THREE.Color(0xbae6fd);
const _colSunsetHemiSky = new THREE.Color(0xfdba74);
const _colNightHemiSky = new THREE.Color(0x0f172a);
const _colDayHemiGround = new THREE.Color(0x1e293b);
const _colNightHemiGround = new THREE.Color(0x050811);

export const CityViewport3D: React.FC<CityViewport3DProps> = ({
  gameState,
  graphicQuality,
  heatmapMode = 'none',
  onDetectSoftwareGl,
  onTileClick,
  onTileRightClick,
  onTileHover,
  cameraPresetTrigger,
  pulseEventCount,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<CityGameState>(gameState);
  const graphicQualityRef = useRef<GraphicQuality>(graphicQuality);
  const heatmapModeRef = useRef<HeatmapMode>(heatmapMode);
  const onDetectSoftwareGlRef = useRef(onDetectSoftwareGl);
  const onTileClickRef = useRef(onTileClick);
  const onTileRightClickRef = useRef(onTileRightClick);
  const onTileHoverRef = useRef(onTileHover);

  stateRef.current = gameState;
  graphicQualityRef.current = graphicQuality;
  heatmapModeRef.current = heatmapMode;
  onDetectSoftwareGlRef.current = onDetectSoftwareGl;
  onTileClickRef.current = onTileClick;
  onTileRightClickRef.current = onTileRightClick;
  onTileHoverRef.current = onTileHover;

  const sceneRebuildRef = useRef<((grid: TileData[][], season: string) => void) | null>(null);
  const triggerJuiceRef = useRef<((worldX: number, worldZ: number, colorHex: number) => void) | null>(null);
  const resetCameraRef = useRef<(() => void) | null>(null);
  const syncToolGhostRef = useRef<((tool: ToolId) => void) | null>(null);
  const syncQualityRef = useRef<((q: GraphicQuality) => void) | null>(null);

  useEffect(() => {
    if (sceneRebuildRef.current) {
      sceneRebuildRef.current(gameState.grid, gameState.season);
    }
  }, [
    gameState.grid,
    gameState.season,
    gameState.policies.transitLevel,
    gameState.policies.banTrucksInResidential,
    heatmapMode,
  ]);

  useEffect(() => {
    if (syncToolGhostRef.current) {
      syncToolGhostRef.current(gameState.selectedTool);
    }
  }, [gameState.selectedTool, gameState.mode]);

  useEffect(() => {
    if (syncQualityRef.current) {
      syncQualityRef.current(graphicQuality);
    }
  }, [graphicQuality]);

  useEffect(() => {
    if (pulseEventCount > 0 && triggerJuiceRef.current && gameState.selectedTile) {
      const half = (GRID_SIZE * TILE_WORLD_SIZE) / 2;
      const wx =
        gameState.selectedTile.x * TILE_WORLD_SIZE - half + TILE_WORLD_SIZE / 2;
      const wz =
        gameState.selectedTile.z * TILE_WORLD_SIZE - half + TILE_WORLD_SIZE / 2;
      const color =
        gameState.selectedTool === 'act_clearance'
          ? 0xf97316
          : gameState.selectedTool === 'sub_drainage' ||
            gameState.selectedTool === 'act_reserve_land'
          ? 0x06b6d4
          : 0xfacc15;
      triggerJuiceRef.current(wx, wz, color);
    }
  }, [pulseEventCount]);

  useEffect(() => {
    if (cameraPresetTrigger > 0 && resetCameraRef.current) {
      resetCameraRef.current();
    }
  }, [cameraPresetTrigger]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let createdRenderer: THREE.WebGLRenderer | null = null;
    let isSoftwareGl = false;

    const rendererAttempts: THREE.WebGLRendererParameters[] = [
      {
        alpha: false,
        antialias: true,
        powerPreference: 'high-performance',
      },
      {
        alpha: false,
        antialias: false,
        powerPreference: 'default',
      },
      {
        antialias: false,
        failIfMajorPerformanceCaveat: false,
      },
    ];

    for (const params of rendererAttempts) {
      if (createdRenderer) break;
      try {
        const candidateCanvas = document.createElement('canvas');
        createdRenderer = new THREE.WebGLRenderer({
          ...params,
          canvas: candidateCanvas,
        });
      } catch {
        createdRenderer = null;
      }
    }

    if (createdRenderer) {
      try {
        const gl = createdRenderer.getContext();
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param) ?? '');
        isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(
          gpu
        );
      } catch {
        isSoftwareGl = false;
      }
    }

    if (onDetectSoftwareGlRef.current) {
      onDetectSoftwareGlRef.current(isSoftwareGl);
    }

    if (!createdRenderer) {
      container.dataset.rendererMode = 'canvas-3d-fallback';
      container.dataset.graphicQuality = graphicQualityRef.current;
      return mountIsometricCanvasFallback({
        container,
        getState: () => stateRef.current,
        onTileClick: (x, z) => onTileClickRef.current(x, z),
        onTileRightClick: (x, z, cx, cy) =>
          onTileRightClickRef.current(x, z, cx, cy),
        onTileHover: (info) => onTileHoverRef.current(info),
        setSceneRebuild: (fn) => {
          sceneRebuildRef.current = fn;
        },
        setTriggerJuice: (fn) => {
          triggerJuiceRef.current = fn;
        },
        setResetCamera: (fn) => {
          resetCameraRef.current = fn;
        },
        setSyncToolGhost: (fn) => {
          syncToolGhostRef.current = fn;
        },
      });
    }

    container.dataset.rendererMode = 'webgl-3d';
    container.dataset.graphicQuality = graphicQualityRef.current;
    container.dataset.isSoftwareGl = isSoftwareGl ? 'true' : 'false';
    const renderer = createdRenderer;

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    renderer.shadowMap.enabled =
      !isSoftwareGl && graphicQualityRef.current === 'high';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const initialRect = container.getBoundingClientRect();
    const initW = initialRect.width || window.innerWidth;
    const initH = initialRect.height || window.innerHeight;
    renderer.setSize(initW, initH);
    renderer.domElement.dataset.testid = 'city-3d-canvas';
    renderer.domElement.style.touchAction = 'none';

    const origSetPointerCapture = renderer.domElement.setPointerCapture?.bind(
      renderer.domElement
    );
    if (origSetPointerCapture) {
      renderer.domElement.setPointerCapture = (pointerId: number) => {
        try {
          origSetPointerCapture(pointerId);
        } catch {
          // Ignore synthetic pointerId capture error
        }
      };
    }
    const origReleasePointerCapture =
      renderer.domElement.releasePointerCapture?.bind(renderer.domElement);
    if (origReleasePointerCapture) {
      renderer.domElement.releasePointerCapture = (pointerId: number) => {
        try {
          origReleasePointerCapture(pointerId);
        } catch {
          // Ignore synthetic pointerId release error
        }
      };
    }

    container.appendChild(renderer.domElement);

    const onWebglContextLost = (e: Event) => {
      e.preventDefault();
    };
    renderer.domElement.addEventListener(
      'webglcontextlost',
      onWebglContextLost,
      false
    );

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

    const scene = new THREE.Scene();
    const horizonColor = new THREE.Color(0x132232);
    scene.background = horizonColor;
    const sceneFog = new THREE.FogExp2(0x132232, 0.0082);
    scene.fog = sceneFog;

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(42, initW / initH, 0.5, 280);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2.15;
    controls.minPolarAngle = 0.25;
    controls.minDistance = 10;
    controls.maxDistance = 135;
    controls.target.set(0, 0, 2);
    controls.touches = {
      ONE: THREE.TOUCH.PAN,
      TWO: THREE.TOUCH.DOLLY_ROTATE,
    };

    const getDefaultCameraDistanceScale = (w: number, h: number) => {
      const aspect = w / Math.max(1, h);
      return aspect < 1
        ? Math.min(1.62, Math.max(1.05, 1.08 / Math.max(0.45, aspect)))
        : 1.0;
    };

    const initCamScale = getDefaultCameraDistanceScale(initW, initH);
    camera.position.set(0, 36 * initCamScale, 44 * initCamScale);

    // Post-Processing nhẹ (EffectComposer + RenderPass + UnrealBloomPass, chỉ bật khi graphicQuality === 'high' && !isSoftwareGl)
    let composer: EffectComposer | null = null;
    let bloomPass: UnrealBloomPass | null = null;
    if (!isSoftwareGl) {
      composer = new EffectComposer(renderer);
      const renderPass = new RenderPass(scene, camera);
      composer.addPass(renderPass);
      bloomPass = new UnrealBloomPass(
        new THREE.Vector2(initW, initH),
        0.35, // strength
        0.4, // radius
        0.78 // threshold
      );
      composer.addPass(bloomPass);
    }

    const hemiLight = new THREE.HemisphereLight(0xbae6fd, 0x1e293b, 0.85);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1d0, 1.85);
    keyLight.position.set(28, 46, 24);
    keyLight.castShadow = !isSoftwareGl && graphicQualityRef.current === 'high';
    const d = 36;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.camera.near = 5;
    keyLight.shadow.camera.far = 110;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.55);
    rimLight.position.set(-30, 25, -28);
    scene.add(rimLight);

    // Streetlight PointLight Pool (tối đa 6 THREE.PointLight tự động gán vào 6 cột đèn đường gần tâm nhìn camera nhất)
    const streetlightPool: THREE.PointLight[] = [];
    for (let i = 0; i < STREETLIGHT_POOL_SIZE; i++) {
      const pl = new THREE.PointLight(0xffbe55, 0, 9.5, 1.8);
      pl.castShadow = false;
      pl.visible = false;
      scene.add(pl);
      streetlightPool.push(pl);
    }
    let streetlightAnchors: StreetlightWorldAnchor[] = [];

    const bumpTex = getMicroBumpTexture(maxAnisotropy);
    const outerTerrain = new THREE.Mesh(
      new THREE.CylinderGeometry(120, 125, 1.2, 32),
      new THREE.MeshStandardMaterial({
        color: 0x1b3326,
        roughness: 0.92,
        metalness: 0.02,
        bumpMap: bumpTex,
        bumpScale: 0.04,
      })
    );
    outerTerrain.position.set(0, -0.75, 0);
    outerTerrain.receiveShadow = true;
    scene.add(outerTerrain);

    const hillGeo = new THREE.ConeGeometry(7, 11, 7);
    const hillMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a2f,
      roughness: 0.88,
      metalness: 0.05,
    });
    const hillPositions = [
      [-46, -42, 1.2],
      [-34, -48, 0.9],
      [42, -45, 1.3],
      [52, -32, 0.85],
      [-50, 28, 1.1],
    ];
    hillPositions.forEach(([hx, hz, hs]) => {
      const hill = new THREE.Mesh(hillGeo, hillMat);
      hill.scale.set(hs, hs * 0.9, hs);
      hill.position.set(hx, 4.2, hz);
      scene.add(hill);
    });

    // Cây xanh tán tròn nhiều tầng ngoại vi sử dụng InstancedMesh shared geometry
    const treeCount = 76;
    const treeTrunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 0.85, 7);
    const treeTrunkMat = new THREE.MeshStandardMaterial({
      color: 0x5c4033,
      roughness: 0.88,
      metalness: 0.04,
    });
    const instancedTrunks = new THREE.InstancedMesh(
      treeTrunkGeo,
      treeTrunkMat,
      treeCount
    );

    const treeCrownGeo = new THREE.DodecahedronGeometry(0.95, 1);
    const treeCrownMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      roughness: 0.78,
      metalness: 0.05,
    });
    const instancedTrees = new THREE.InstancedMesh(
      treeCrownGeo,
      treeCrownMat,
      treeCount
    );
    const instancedUpperCrowns = new THREE.InstancedMesh(
      treeCrownGeo,
      treeCrownMat,
      treeCount
    );

    const halfBoard = (GRID_SIZE * TILE_WORLD_SIZE) / 2;
    for (let i = 0; i < treeCount; i++) {
      const angle = (i / treeCount) * Math.PI * 2;
      const radius = halfBoard + 4.5 + (i % 5) * 2.4;
      const tx = Math.cos(angle) * radius;
      const tz = Math.sin(angle) * radius;
      const scale = 0.85 + (i % 4) * 0.12;

      _scratchQuat.setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        (i * 1.7) % Math.PI
      );

      // Thân cây
      _scratchVec3.set(tx, 0.42 * scale, tz);
      _scratchScale.set(scale, scale, scale);
      _scratchMat4.compose(_scratchVec3, _scratchQuat, _scratchScale);
      instancedTrunks.setMatrixAt(i, _scratchMat4);

      // Tán tròn tầng dưới
      _scratchVec3.set(tx, 1.05 * scale, tz);
      _scratchScale.set(scale * 1.15, scale * 0.82, scale * 1.15);
      _scratchMat4.compose(_scratchVec3, _scratchQuat, _scratchScale);
      instancedTrees.setMatrixAt(i, _scratchMat4);

      // Tán tròn tầng trên
      _scratchVec3.set(tx, 1.62 * scale, tz);
      _scratchScale.set(scale * 0.78, scale * 0.72, scale * 0.78);
      _scratchMat4.compose(_scratchVec3, _scratchQuat, _scratchScale);
      instancedUpperCrowns.setMatrixAt(i, _scratchMat4);

      _scratchColor.setHSL(0.36 + (i % 3) * 0.02, 0.62, 0.34 + (i % 4) * 0.04);
      instancedTrees.setColorAt(i, _scratchColor);
      _scratchColor.setHSL(0.35 + (i % 3) * 0.02, 0.68, 0.4 + (i % 3) * 0.04);
      instancedUpperCrowns.setColorAt(i, _scratchColor);
    }
    instancedTrunks.instanceMatrix.needsUpdate = true;
    instancedTrees.instanceMatrix.needsUpdate = true;
    instancedUpperCrowns.instanceMatrix.needsUpdate = true;
    if (instancedTrees.instanceColor) instancedTrees.instanceColor.needsUpdate = true;
    if (instancedUpperCrowns.instanceColor) {
      instancedUpperCrowns.instanceColor.needsUpdate = true;
    }
    instancedTrunks.computeBoundingSphere();
    instancedTrees.computeBoundingSphere();
    instancedUpperCrowns.computeBoundingSphere();
    scene.add(instancedTrunks);
    scene.add(instancedTrees);
    scene.add(instancedUpperCrowns);

    // Đường lưới Grid 18x18 (làm mờ opacity ~0.1 khi đang ở chế độ inspect)
    const gridVertices: number[] = [];
    for (let i = 0; i <= GRID_SIZE; i++) {
      const coord = i * TILE_WORLD_SIZE - halfBoard;
      gridVertices.push(-halfBoard, 0.025, coord, halfBoard, 0.025, coord);
      gridVertices.push(coord, 0.025, -halfBoard, coord, 0.025, halfBoard);
    }
    const gridLinesGeo = new THREE.BufferGeometry();
    gridLinesGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(gridVertices, 3)
    );
    const gridLinesMat = new THREE.LineBasicMaterial({
      color: 0x94a3b8,
      transparent: true,
      opacity: stateRef.current.selectedTool === 'inspect' ? 0.1 : 0.28,
      depthWrite: false,
    });
    const gridLinesMesh = new THREE.LineSegments(gridLinesGeo, gridLinesMat);
    scene.add(gridLinesMesh);

    // Hàm dựng BufferGeometry mặt nước khớp CHÍNH XÁC trên các ô có tile.type === 'river_water'
    // (Không bao giờ dùng mặt phẳng lớn phủ tràn qua các ô đất ven sông)
    const buildRiverWaterBufferGeometry = (
      grid: TileData[][]
    ): THREE.BufferGeometry => {
      const positions: number[] = [];
      const normals: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];
      let vertOffset = 0;
      const halfTile = TILE_WORLD_SIZE / 2;

      for (let z = 0; z < GRID_SIZE; z++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          if (grid[z]?.[x]?.type !== 'river_water') continue;
          const wx = x * TILE_WORLD_SIZE - halfBoard + halfTile;
          const wz = z * TILE_WORLD_SIZE - halfBoard + halfTile;
          // Do reflectiveWater xoay rotation.x = -Math.PI / 2, trục Y cục bộ tương ứng với -Z thế giới
          const x0 = wx - halfTile;
          const x1 = wx + halfTile;
          const y0 = -wz - halfTile;
          const y1 = -wz + halfTile;

          positions.push(
            x0,
            y0,
            0,
            x1,
            y0,
            0,
            x1,
            y1,
            0,
            x0,
            y1,
            0
          );
          normals.push(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1);
          uvs.push(x, z, x + 1, z, x + 1, z + 1, x, z + 1);
          indices.push(
            vertOffset,
            vertOffset + 1,
            vertOffset + 2,
            vertOffset,
            vertOffset + 2,
            vertOffset + 3
          );
          vertOffset += 4;
        }
      }

      if (positions.length === 0) {
        positions.push(0, 0, 0, 0.01, 0, 0, 0.01, 0.01, 0);
        normals.push(0, 0, 1, 0, 0, 1, 0, 0, 1);
        uvs.push(0, 0, 1, 0, 1, 1);
        indices.push(0, 1, 2);
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(positions, 3)
      );
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeBoundingSphere();
      return geo;
    };

    // Mặt nước Sông Phản chiếu (Water shader từ three/examples/jsm/objects/Water.js)
    // Giữ cao độ mặt nước bình thường ở y = -0.26 (thấp hơn mặt trên lowland_marsh y = -0.06 đúng 0.20 đơn vị >= 0.15)
    // và chỉ dâng lên khi season === 'high_tide'
    const waterNormalTex = getWaterNormalTexture(maxAnisotropy);
    const initialWaterGeo = buildRiverWaterBufferGeometry(stateRef.current.grid);
    const reflectiveWater = new Water(initialWaterGeo, {
      textureWidth: isSoftwareGl ? 256 : 512,
      textureHeight: isSoftwareGl ? 256 : 512,
      waterNormals: waterNormalTex,
      sunDirection: keyLight.position.clone().normalize(),
      sunColor: 0xfff1d0,
      waterColor: 0x0369a1,
      distortionScale: 1.4,
      fog: true,
    });
    reflectiveWater.rotation.x = -Math.PI / 2;
    reflectiveWater.position.y =
      stateRef.current.season === 'high_tide' ? -0.1 : -0.26;
    reflectiveWater.receiveShadow = true;
    reflectiveWater.visible = graphicQualityRef.current === 'high';
    scene.add(reflectiveWater);

    // 18x18 Interactive Grid Tiles
    const tileProxies: THREE.Mesh[] = [];
    const tileBaseMeshes: THREE.Mesh[][] = [];
    const floodWaterMeshes: THREE.Mesh[][] = [];
    const reservedMarkerGroups: THREE.Group[][] = [];
    const tileGeo = new THREE.BoxGeometry(
      TILE_WORLD_SIZE - 0.06,
      0.35,
      TILE_WORLD_SIZE - 0.06
    );
    const floodGeo = new THREE.PlaneGeometry(
      TILE_WORLD_SIZE - 0.04,
      TILE_WORLD_SIZE - 0.04
    );
    floodGeo.rotateX(-Math.PI / 2);
    const floodMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.12,
      metalness: 0.75,
      transparent: true,
      opacity: 0.68,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    // Khung viền & cọc mốc màu xanh ngọc (0x06b6d4) cho các ô đã khoanh Quỹ Đất Công
    const reservedBorderGeo = new THREE.RingGeometry(
      TILE_WORLD_SIZE * 0.42,
      TILE_WORLD_SIZE * 0.48,
      4
    );
    reservedBorderGeo.rotateX(-Math.PI / 2);
    reservedBorderGeo.rotateY(Math.PI / 4);
    const reservedPostGeo = new THREE.BoxGeometry(0.11, 0.34, 0.11);
    const reservedCyanMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      roughness: 0.45,
      metalness: 0.15,
      transparent: true,
      opacity: 0.86,
      side: THREE.DoubleSide,
    });

    const boardGroup = new THREE.Group();
    scene.add(boardGroup);

    const structuresGroup = new THREE.Group();
    scene.add(structuresGroup);

    const vehicleGroup = new THREE.Group();
    scene.add(vehicleGroup);
    let vehicles: ActiveRoadVehicle[] = [];
    const nodeOccupancyMap: NodeOccupancyMap = new Map<string, string>();

    const waterShipGroup = new THREE.Group();
    scene.add(waterShipGroup);
    let waterShips: ActiveWaterShip[] = [];
    let floodedWorldPositions: { x: number; z: number }[] = [];

    for (let z = 0; z < GRID_SIZE; z++) {
      tileBaseMeshes[z] = [];
      floodWaterMeshes[z] = [];
      reservedMarkerGroups[z] = [];
      for (let x = 0; x < GRID_SIZE; x++) {
        const wx = x * TILE_WORLD_SIZE - halfBoard + TILE_WORLD_SIZE / 2;
        const wz = z * TILE_WORLD_SIZE - halfBoard + TILE_WORLD_SIZE / 2;

        const baseMat = new THREE.MeshStandardMaterial({
          color: 0x2d4a36,
          roughness: 0.85,
          metalness: 0.05,
          bumpMap: bumpTex,
          bumpScale: 0.02,
        });
        const baseMesh = new THREE.Mesh(tileGeo, baseMat);
        baseMesh.position.set(wx, -0.175, wz);
        baseMesh.receiveShadow = true;
        baseMesh.userData = { gridX: x, gridZ: z };
        boardGroup.add(baseMesh);
        tileProxies.push(baseMesh);
        tileBaseMeshes[z][x] = baseMesh;

        const floodMesh = new THREE.Mesh(floodGeo, floodMat);
        floodMesh.position.set(wx, 0.16, wz);
        floodMesh.visible = false;
        boardGroup.add(floodMesh);
        floodWaterMeshes[z][x] = floodMesh;

        const markerGroup = new THREE.Group();
        const borderMesh = new THREE.Mesh(reservedBorderGeo, reservedCyanMat);
        borderMesh.position.y = 0.02;
        markerGroup.add(borderMesh);
        const cornerOffset = TILE_WORLD_SIZE * 0.42;
        const corners = [
          [-cornerOffset, -cornerOffset],
          [cornerOffset, -cornerOffset],
          [-cornerOffset, cornerOffset],
          [cornerOffset, cornerOffset],
        ];
        for (const [cx, cz] of corners) {
          const post = new THREE.Mesh(reservedPostGeo, reservedCyanMat);
          post.position.set(cx, 0.17, cz);
          markerGroup.add(post);
        }
        markerGroup.position.set(wx, 0, wz);
        markerGroup.visible = false;
        boardGroup.add(markerGroup);
        reservedMarkerGroups[z][x] = markerGroup;
      }
    }

    syncQualityRef.current = (q: GraphicQuality) => {
      container.dataset.graphicQuality = q;
      const isHigh = q === 'high';
      reflectiveWater.visible = isHigh;
      renderer.shadowMap.enabled = !isSoftwareGl && isHigh;
      keyLight.castShadow = !isSoftwareGl && isHigh;
    };

    const reticleGeo = new THREE.RingGeometry(
      TILE_WORLD_SIZE * 0.44,
      TILE_WORLD_SIZE * 0.5,
      4
    );
    reticleGeo.rotateX(-Math.PI / 2);
    reticleGeo.rotateY(Math.PI / 4);

    const hoverReticle = new THREE.Mesh(
      reticleGeo,
      new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    hoverReticle.position.y = 0.05;
    hoverReticle.visible = false;
    scene.add(hoverReticle);

    const selectedReticle = new THREE.Mesh(
      reticleGeo,
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    selectedReticle.position.y = 0.06;
    scene.add(selectedReticle);

    const roadSnapPreviewGroup = new THREE.Group();
    roadSnapPreviewGroup.visible = false;
    scene.add(roadSnapPreviewGroup);

    let previewMesh: THREE.Group | null = null;
    let previewToolId: TileType | ToolId | null = null;
    let previewIsValid = false;
    let previewIsColliding = false;
    const gridIntersectionPoint = new THREE.Vector3();
    let lastHoveredGridTile: { x: number; z: number } | null = null;

    const syncGhostDataset = () => {
      const isVis = Boolean(previewMesh && previewMesh.visible);
      container.dataset.ghostVisible = isVis ? 'true' : 'false';
      container.dataset.ghostTool = isVis && previewToolId ? previewToolId : 'none';
      container.dataset.ghostValid = isVis && previewIsValid ? 'true' : 'false';
      container.dataset.ghostColliding =
        isVis && previewIsColliding ? 'true' : 'false';
      container.dataset.ghostColor = !isVis
        ? 'none'
        : previewIsColliding
        ? 'vibrant-red'
        : previewIsValid
        ? 'green'
        : 'red';
      container.dataset.ghostOpacity = isVis
        ? previewIsColliding
          ? '0.68'
          : '0.5'
        : '0';
    };

    const disposeGhostPreview = () => {
      if (previewMesh) {
        previewMesh.visible = false;
        scene.remove(previewMesh);
        disposeGroupResources(previewMesh);
        previewMesh = null;
      }
      previewToolId = null;
      previewIsValid = false;
      previewIsColliding = false;
      (hoverReticle.material as THREE.MeshBasicMaterial).color.setHex(0xfacc15);
      syncGhostDataset();
    };

    const checkGhostMesh3DCollision = (
      ghostGroup: THREE.Group,
      hitX: number,
      hitZ: number,
      tool: ToolId
    ): boolean => {
      const logicalCollision = detectGhostCollision(
        stateRef.current.grid,
        hitX,
        hitZ,
        tool
      );
      if (logicalCollision.isColliding) {
        return true;
      }

      ghostGroup.updateMatrixWorld(true);
      _scratchGhostBox.setFromObject(ghostGroup);
      if (_scratchGhostBox.isEmpty()) return false;
      _scratchGhostBox.expandByScalar(-0.12);

      for (let i = 0; i < structuresGroup.children.length; i++) {
        const existingStruct = structuresGroup.children[i];
        const uData = existingStruct.userData;
        if (!uData || !isBuiltStructure(uData.tileType)) {
          continue;
        }
        if (uData.gridX === hitX && uData.gridZ === hitZ) {
          return true;
        }
        _scratchStructBox.setFromObject(existingStruct);
        if (
          !_scratchStructBox.isEmpty() &&
          _scratchGhostBox.intersectsBox(_scratchStructBox)
        ) {
          return true;
        }
      }
      return false;
    };

    const tintGhostPreview = (
      group: THREE.Group,
      isValid: boolean,
      isColliding: boolean
    ) => {
      const reticleMat = hoverReticle.material as THREE.MeshBasicMaterial;
      if (isColliding) {
        reticleMat.color.setHex(0xff1744);
      } else if (isValid) {
        reticleMat.color.setHex(0x22c55e);
      } else {
        reticleMat.color.setHex(0xfacc15);
      }

      group.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh || !mesh.material) return;
        const mats = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        for (const rawMat of mats) {
          const mat = rawMat as THREE.MeshStandardMaterial;
          mat.transparent = true;
          mat.depthWrite = false;

          if (isColliding) {
            mat.opacity = 0.68;
            if (mat.color) {
              mat.color.setHex(0xff1744);
            }
            if ('emissive' in mat && mat.emissive) {
              mat.emissive.setHex(0xff0033);
              mat.emissiveIntensity = 0.92;
            }
          } else {
            const tintColor = isValid ? 0x22c55e : 0xef4444;
            const emissiveHex = isValid ? 0x16a34a : 0xdc2626;
            mat.opacity = 0.5;
            if (mat.color) {
              const baseHex =
                typeof mat.userData?.baseColor === 'number'
                  ? mat.userData.baseColor
                  : mat.color.getHex();
              mat.color
                .setHex(baseHex)
                .lerp(_scratchColor.setHex(tintColor), 0.62);
            }
            if ('emissive' in mat && mat.emissive) {
              mat.emissive.setHex(emissiveHex);
              mat.emissiveIntensity = 0.45;
            }
          }
        }
      });
    };

    const ensureGhostPreviewMesh = (
      toolId: TileType,
      roadConn: RoadConnections,
      isValid: boolean,
      isColliding: boolean
    ): THREE.Group => {
      if (previewMesh && previewToolId === toolId) {
        previewIsValid = isValid;
        previewIsColliding = isColliding;
        tintGhostPreview(previewMesh, isValid, isColliding);
        return previewMesh;
      }

      disposeGhostPreview();

      const ghostTile: TileData = {
        x: 0,
        z: 0,
        type: toolId,
        elevation: 1,
        landValue: 1,
        hasDrainage: true,
        drainageRemainingDays: 0,
        isFlooded: false,
        sidewalkVendors: false,
        disputeTurns: 0,
        supplyRatio: 1,
        level: 1,
        constructionTotalDays: 1,
        constructionRemainingDays: 0,
        maxCapacity: 0,
        currentOccupants: 0,
        occupantsByTier: { unskilled: 0, skilled: 0, educated: 0 },
        minimumWealthLevel: 'low',
        requiredWorkers: { unskilled: 0, skilled: 0, educated: 0 },
        assignedWorkers: { unskilled: 0, skilled: 0, educated: 0 },
      };

      const builtClone = buildTileStructureGroup(
        ghostTile,
        roadConn,
        maxAnisotropy
      );

      builtClone.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh || !mesh.material) return;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((m) => {
            const cloned = m.clone() as THREE.MeshStandardMaterial;
            if (cloned.color) {
              cloned.userData = {
                ...cloned.userData,
                baseColor: cloned.color.getHex(),
              };
            }
            cloned.transparent = true;
            cloned.opacity = 0.5;
            cloned.depthWrite = false;
            return cloned;
          });
        } else {
          const cloned = mesh.material.clone() as THREE.MeshStandardMaterial;
          if (cloned.color) {
            cloned.userData = {
              ...cloned.userData,
              baseColor: cloned.color.getHex(),
            };
          }
          cloned.transparent = true;
          cloned.opacity = 0.5;
          cloned.depthWrite = false;
          mesh.material = cloned;
        }
      });

      previewMesh = builtClone;
      previewToolId = toolId;
      previewIsValid = isValid;
      previewIsColliding = isColliding;
      tintGhostPreview(previewMesh, isValid, isColliding);
      scene.add(previewMesh);
      return previewMesh;
    };

    const updateGhostAtGridTile = (hit: { x: number; z: number }, tool: ToolId) => {
      const wx = hit.x * TILE_WORLD_SIZE - halfBoard + TILE_WORLD_SIZE / 2;
      const wz = hit.z * TILE_WORLD_SIZE - halfBoard + TILE_WORLD_SIZE / 2;
      const baseMesh = tileBaseMeshes[hit.z]?.[hit.x];
      const baseY = baseMesh ? baseMesh.position.y + 0.175 : 0;
      gridIntersectionPoint.set(wx, baseY, wz);

      const ghostCheck = canPlaceToolAtTile(
        stateRef.current,
        hit.x,
        hit.z,
        tool,
        false
      );
      if (ghostCheck.isGhostBuilding) {
        const roadConn = getRoadConnections(
          stateRef.current.grid,
          hit.x,
          hit.z,
          tool as TileType
        );
        const ghost = ensureGhostPreviewMesh(
          tool as TileType,
          roadConn,
          ghostCheck.allowed,
          ghostCheck.isColliding
        );
        ghost.position.copy(gridIntersectionPoint);
        const has3DCollision =
          ghostCheck.isColliding ||
          checkGhostMesh3DCollision(ghost, hit.x, hit.z, tool);
        if (has3DCollision) {
          ghost.position.y = gridIntersectionPoint.y + 0.06;
        }
        previewIsColliding = has3DCollision;
        previewIsValid = ghostCheck.allowed && !has3DCollision;
        tintGhostPreview(ghost, previewIsValid, previewIsColliding);
        ghost.visible = true;
        syncGhostDataset();
      } else {
        disposeGhostPreview();
      }
    };

    syncToolGhostRef.current = (tool: ToolId) => {
      // Làm mờ đường lưới Grid (opacity ~0.1) khi đang ở chế độ inspect
      gridLinesMat.opacity = tool === 'inspect' ? 0.1 : 0.28;
      container.dataset.gridOpacity = String(gridLinesMat.opacity);

      if (
        stateRef.current.mode !== 'playing' ||
        tool === 'inspect' ||
        tool === 'act_clearance' ||
        tool === 'act_reserve_land' ||
        tool === 'sub_drainage'
      ) {
        disposeGhostPreview();
        return;
      }
      if (lastHoveredGridTile) {
        updateGhostAtGridTile(lastHoveredGridTile, tool);
      }
    };

    syncGhostDataset();
    container.dataset.gridOpacity = String(gridLinesMat.opacity);

    // Pooled Particle Ring Buffer (Dùng chung cho hiệu ứng Xây dựng & Hạt bọt nước trắng phía sau đuôi tàu / mùa Triều Cường)
    const particleGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    const particleMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const particleMesh = new THREE.InstancedMesh(
      particleGeo,
      particleMat,
      PARTICLE_POOL_SIZE
    );
    particleMesh.frustumCulled = false;
    scene.add(particleMesh);

    // =========================================================================
    // 3D SEASONAL WEATHER SYSTEMS (Monsoon Rain · Dry Heat Shimmer · High Tide Ripples)
    // =========================================================================
    // 1. Mùa Mưa Bão (monsoon): 180 vệt mưa xiên nhẹ (THREE.LineSegments)
    const RAIN_DROP_COUNT = 180;
    const rainPositions = new Float32Array(RAIN_DROP_COUNT * 6);
    const rainMeta = Array.from({ length: RAIN_DROP_COUNT }, (_, i) => {
      const rx = ((i * 37) % 100) / 100 * (halfBoard * 2.2) - halfBoard * 1.1;
      const ry = ((i * 53) % 100) / 100 * 24 + 1;
      const rz = ((i * 71) % 100) / 100 * (halfBoard * 2.2) - halfBoard * 1.1;
      const speed = 21 + (i % 5) * 2.2;
      return { x: rx, y: ry, z: rz, speed };
    });
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(rainPositions, 3)
    );
    const rainMat = new THREE.LineBasicMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    const monsoonRainLines = new THREE.LineSegments(rainGeo, rainMat);
    monsoonRainLines.frustumCulled = false;
    monsoonRainLines.visible = stateRef.current.season === 'monsoon';
    scene.add(monsoonRainLines);

    // 2. Mùa Khô (dry): 84 hạt bụi nắng & sóng nhiệt (Heat Haze Shimmer Motes)
    const HEAT_MOTE_COUNT = 84;
    const heatPositions = new Float32Array(HEAT_MOTE_COUNT * 3);
    const heatMeta = Array.from({ length: HEAT_MOTE_COUNT }, (_, i) => ({
      baseX: ((i * 41) % 100) / 100 * (halfBoard * 2.0) - halfBoard,
      y: ((i * 67) % 100) / 100 * 12 + 0.5,
      baseZ: ((i * 83) % 100) / 100 * (halfBoard * 2.0) - halfBoard,
      phase: i * 0.45,
      speed: 0.45 + (i % 4) * 0.15,
    }));
    const heatGeo = new THREE.BufferGeometry();
    heatGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(heatPositions, 3)
    );
    const heatMat = new THREE.PointsMaterial({
      color: 0xfde68a,
      size: 0.24,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
    });
    const dryHeatPoints = new THREE.Points(heatGeo, heatMat);
    dryHeatPoints.frustumCulled = false;
    dryHeatPoints.visible = stateRef.current.season === 'dry';
    scene.add(dryHeatPoints);

    // 3. Đỉnh Triều Cường (high_tide): 16 vòng gợn sóng nước lan tỏa (Water Ripple Rings)
    const RIPPLE_RING_COUNT = 16;
    const rippleRingGeo = new THREE.RingGeometry(0.2, 0.28, 24);
    rippleRingGeo.rotateX(-Math.PI / 2);
    const highTideRippleGroup = new THREE.Group();
    const rippleRings: {
      mesh: THREE.Mesh;
      mat: THREE.MeshBasicMaterial;
      phase: number;
      anchorIdx: number;
    }[] = [];
    for (let i = 0; i < RIPPLE_RING_COUNT; i++) {
      const rMat = new THREE.MeshBasicMaterial({
        color: 0x7dd3fc,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const rMesh = new THREE.Mesh(rippleRingGeo, rMat);
      rMesh.position.set(0, -0.08, 0);
      highTideRippleGroup.add(rMesh);
      rippleRings.push({
        mesh: rMesh,
        mat: rMat,
        phase: (i / RIPPLE_RING_COUNT) % 1,
        anchorIdx: i,
      });
    }
    highTideRippleGroup.visible = stateRef.current.season === 'high_tide';
    scene.add(highTideRippleGroup);
    let weatherAnimClock = 0;

    const particleData = Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
      active: false,
      x: 0,
      y: -100,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      gravity: 12,
      baseScale: 1,
      life: 0,
      maxLife: 0.5,
    }));
    let particleHead = 0;

    const spawnWaterFoamParticle = (
      wx: number,
      wz: number,
      vx: number,
      vz: number,
      scale = 0.65,
      surfaceY = -0.26
    ) => {
      const idx = particleHead;
      particleHead = (particleHead + 1) % PARTICLE_POOL_SIZE;
      const p = particleData[idx];
      p.active = true;
      p.x = wx + (Math.random() - 0.5) * 0.28;
      p.y = surfaceY + 0.02 + Math.random() * 0.03;
      p.z = wz + (Math.random() - 0.5) * 0.28;
      p.vx = vx + (Math.random() - 0.5) * 0.35;
      p.vy = 0.16 + Math.random() * 0.18;
      p.vz = vz + (Math.random() - 0.5) * 0.35;
      p.gravity = 0.85;
      p.baseScale = scale;
      p.life = 0;
      p.maxLife = 0.55 + Math.random() * 0.35;
      _scratchColor.setHex(Math.random() > 0.35 ? 0xf8fafc : 0xe0f2fe);
      particleMesh.setColorAt(idx, _scratchColor);
      if (particleMesh.instanceColor) {
        particleMesh.instanceColor.needsUpdate = true;
      }
    };

    let hitstopTimer = 0;
    let cameraTrauma = 0;

    triggerJuiceRef.current = (worldX: number, worldZ: number, colorHex: number) => {
      hitstopTimer = 0.04;
      cameraTrauma = Math.min(1.0, cameraTrauma + 0.38);
      _scratchColor.setHex(colorHex);

      for (let i = 0; i < 16; i++) {
        const idx = particleHead;
        particleHead = (particleHead + 1) % PARTICLE_POOL_SIZE;
        const p = particleData[idx];
        p.active = true;
        p.x = worldX + (Math.random() - 0.5) * 1.2;
        p.y = 0.4 + Math.random() * 0.7;
        p.z = worldZ + (Math.random() - 0.5) * 1.2;
        const angle = Math.random() * Math.PI * 2;
        const spd = 2.2 + Math.random() * 4.0;
        p.vx = Math.cos(angle) * spd;
        p.vy = 3.2 + Math.random() * 4.0;
        p.vz = Math.sin(angle) * spd;
        p.gravity = 12;
        p.baseScale = 1.0;
        p.life = 0;
        p.maxLife = 0.4 + Math.random() * 0.3;
        particleMesh.setColorAt(idx, _scratchColor);
      }
      if (particleMesh.instanceColor) {
        particleMesh.instanceColor.needsUpdate = true;
      }
    };

    resetCameraRef.current = () => {
      const rect = container.getBoundingClientRect();
      const scale = getDefaultCameraDistanceScale(
        rect.width || window.innerWidth,
        rect.height || window.innerHeight
      );
      controls.target.set(0, 0, 2);
      camera.position.set(0, 36 * scale, 44 * scale);
      controls.update();
    };

    let lastRoadNetworkSignature = '';
    const computeRoadNetworkSignature = (grid: TileData[][]): string => {
      const pol = stateRef.current.policies;
      const parts: string[] = [
        `tr:${pol.transitLevel ?? 0}|bt:${pol.banTrucksInResidential ? 1 : 0}`,
      ];
      for (let z = 0; z < GRID_SIZE; z++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          const t = grid[z][x];
          if (
            isRoadTile(t.type) ||
            t.type === 'gateway_port' ||
            t.type === 'gateway_station'
          ) {
            parts.push(`${x},${z}:${t.type}`);
          }
        }
      }
      return parts.join(';');
    };

    const rebuildVehiclesFromRoads = (grid: TileData[][]) => {
      while (vehicleGroup.children.length > 0) {
        const child = vehicleGroup.children[0];
        disposeGroupResources(child);
        vehicleGroup.remove(child);
      }
      vehicles = [];
      nodeOccupancyMap.clear();

      const pol = stateRef.current.policies;
      const routes = generateVehicleRoutesFromGrid(grid, {
        banTrucksInResidential: pol.banTrucksInResidential,
        transitLevel: pol.transitLevel,
      });
      for (const route of routes) {
        const vehicleCountOnRoute = route.totalLength >= 28 ? 2 : 1;
        for (let vIdx = 0; vIdx < vehicleCountOnRoute; vIdx++) {
          let initialDist = vIdx === 0 ? 0 : route.totalLength * 0.36;
          const agentRoute = {
            ...route,
            id: `${route.id}_veh_${vIdx}`,
          };

          for (let attempt = 0; attempt < 4; attempt++) {
            const candidateSample = sampleRouteAtDistance(agentRoute, initialDist);
            const tx = Math.floor((candidateSample.x + halfBoard) / TILE_WORLD_SIZE);
            const tz = Math.floor((candidateSample.z + halfBoard) / TILE_WORLD_SIZE);
            if (!nodeOccupancyMap.has(`${tx},${tz}`)) {
              break;
            }
            initialDist = (initialDist + TILE_WORLD_SIZE * 1.15) % route.totalLength;
          }

          const navAgent = createVehicleNavAgent(
            agentRoute,
            initialDist,
            nodeOccupancyMap
          );
          const initialSample = sampleRouteAtDistance(agentRoute, initialDist);
          const mesh = createVehicleMesh(agentRoute.kind);
          mesh.position.set(initialSample.x, initialSample.y, initialSample.z);
          mesh.rotation.y = initialSample.yaw;
          vehicleGroup.add(mesh);

          vehicles.push({
            mesh,
            navAgent,
          });
        }
      }
      container.dataset.activeVehicleCount = String(vehicles.length);
    };

    let lastWaterSignature = '';
    const rebuildWaterShipsFromGrid = (grid: TileData[][]) => {
      const riverKeys: string[] = [];
      for (let z = 0; z < GRID_SIZE; z++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          if (grid[z][x].type === 'river_water') {
            riverKeys.push(`${x},${z}`);
          }
        }
      }
      const nextWaterSig = riverKeys.join(';');
      if (nextWaterSig === lastWaterSignature && waterShips.length > 0) {
        return;
      }
      lastWaterSignature = nextWaterSig;

      // Cập nhật lại BufferGeometry của reflectiveWater để khớp chính xác các ô river_water
      const nextWaterGeo = buildRiverWaterBufferGeometry(grid);
      reflectiveWater.geometry.dispose();
      reflectiveWater.geometry = nextWaterGeo;

      while (waterShipGroup.children.length > 0) {
        const child = waterShipGroup.children[0];
        disposeGroupResources(child);
        waterShipGroup.remove(child);
      }
      waterShips = [];

      const shipRoutes = generateWaterShipRoutesFromGrid(grid, 3);
      for (let i = 0; i < shipRoutes.length; i++) {
        const route = shipRoutes[i];
        const agent = createWaterShipAgent(route, i * 0.33);
        const mesh = createWaterShipMesh(route.kind);
        mesh.position.set(agent.currentX, agent.currentY, agent.currentZ);
        mesh.rotation.y = agent.currentYaw;
        waterShipGroup.add(mesh);
        waterShips.push({ mesh, agent });
      }
      container.dataset.activeWaterShipCount = String(waterShips.length);
    };

    const tileStructGroupMap = new Map<string, THREE.Group>();
    const tileStateSignatureMap = new Map<string, string>();

    const rebuildSceneTiles = (grid: TileData[][], season: string) => {
      let dirtyTileCount = 0;
      const nextFloodedPositions: { x: number; z: number }[] = [];

      // Chỉ dâng mực nước sông khi season === 'high_tide'; bình thường giữ ở y = -0.26
      // (thấp hơn mặt đất lowland_marsh y = -0.06 đúng 0.20 đơn vị >= 0.15)
      const targetWaterY = season === 'high_tide' ? -0.1 : -0.26;
      reflectiveWater.position.y = targetWaterY;
      container.dataset.waterSurfaceY = targetWaterY.toFixed(2);

      for (let z = 0; z < GRID_SIZE; z++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          const tile = grid[z][x];
          const wx = x * TILE_WORLD_SIZE - halfBoard + TILE_WORLD_SIZE / 2;
          const wz = z * TILE_WORLD_SIZE - halfBoard + TILE_WORLD_SIZE / 2;

          if (tile.isFlooded && tile.type !== 'river_water') {
            nextFloodedPositions.push({ x: wx, z: wz });
          }

          const roadConn = getRoadConnections(grid, x, z);
          const riverBanks: RiverBankConnections | undefined =
            tile.type === 'river_water'
              ? {
                  northLand:
                    z > 0 && grid[z - 1][x].type !== 'river_water',
                  southLand:
                    z < GRID_SIZE - 1 && grid[z + 1][x].type !== 'river_water',
                  westLand:
                    x > 0 && grid[z][x - 1].type !== 'river_water',
                  eastLand:
                    x < GRID_SIZE - 1 && grid[z][x + 1].type !== 'river_water',
                }
              : undefined;

          const activeHeatmap = heatmapModeRef.current;
          const tileKey = `${x},${z}`;
          const tileSig = `${season}|${activeHeatmap}|${tile.type}|${tile.elevation}|${
            tile.isFlooded ? 1 : 0
          }|${tile.hasDrainage ? 1 : 0}|${tile.isReservedPublicLand ? 1 : 0}|${
            activeHeatmap === 'land_value' ? tile.landValue.toFixed(1) : ''
          }|${tile.constructionRemainingDays}|${
            tile.constructionTotalDays
          }|${tile.sidewalkVendors ? 1 : 0}|${
            tile.disputeTurns > 0 ? 1 : 0
          }|${roadConn.north ? 1 : 0}${roadConn.south ? 1 : 0}${
            roadConn.west ? 1 : 0
          }${roadConn.east ? 1 : 0}|${
            riverBanks
              ? `${riverBanks.northLand ? 1 : 0}${riverBanks.southLand ? 1 : 0}${
                  riverBanks.westLand ? 1 : 0
                }${riverBanks.eastLand ? 1 : 0}`
              : ''
          }`;

          if (tileStateSignatureMap.get(tileKey) === tileSig) {
            continue;
          }

          tileStateSignatureMap.set(tileKey, tileSig);
          dirtyTileCount += 1;

          const baseMesh = tileBaseMeshes[z][x];
          const baseMat = baseMesh.material as THREE.MeshStandardMaterial;

          if (tile.type === 'river_water') {
            baseMat.color.setHex(0x0369a1);
            baseMat.roughness = 0.22;
            baseMat.metalness = 0.55;
            // Đáy/khối nước ở y = -0.435 (mặt trên = -0.26, khớp cao độ mặt nước bình thường)
            baseMesh.position.y = season === 'high_tide' ? -0.275 : -0.435;
          } else {
            if (tile.type === 'lowland_marsh') {
              baseMesh.position.y = -0.235;
            } else {
              baseMesh.position.y = tile.elevation === 2 ? -0.1 : -0.175;
            }

            if (activeHeatmap === 'land_value') {
              // Bản đồ Nhiệt Giá Đất: <1 Tỷ Xám · 1–5 Tỷ Xanh · 5–15 Tỷ Vàng · >15 Tỷ Đỏ cam
              const lv = tile.landValue;
              const heatmapHex =
                lv > 15
                  ? 0xea580c
                  : lv >= 5
                  ? 0xf59e0b
                  : lv >= 1
                  ? 0x10b981
                  : 0x64748b;
              baseMat.color.setHex(heatmapHex);
              baseMat.roughness = 0.72;
              baseMat.metalness = 0.08;
            } else if (tile.type === 'lowland_marsh') {
              baseMat.color.setHex(0x274e37);
              baseMat.roughness = 0.88;
              baseMat.metalness = 0.05;
            } else {
              baseMat.color.setHex(tile.elevation === 2 ? 0x3b593f : 0x2f4f38);
              baseMat.roughness = 0.85;
              baseMat.metalness = 0.05;
            }
          }

          // Chỉ hiện lớp nước ngập khi tile.isFlooded === true trên các ô đất liền
          const isTileFlooded =
            Boolean(tile.isFlooded) && tile.type !== 'river_water';
          floodWaterMeshes[z][x].position.y = baseMesh.position.y + 0.185;
          floodWaterMeshes[z][x].visible = isTileFlooded;

          // Khung viền & cọc mốc Quỹ Đất Công (cyan 0x06b6d4)
          const markerGroup = reservedMarkerGroups[z][x];
          markerGroup.position.y = baseMesh.position.y + 0.178;
          markerGroup.visible =
            Boolean(tile.isReservedPublicLand) && tile.type !== 'river_water';

          const prevStruct = tileStructGroupMap.get(tileKey);
          if (prevStruct) {
            disposeGroupResources(prevStruct);
            structuresGroup.remove(prevStruct);
            tileStructGroupMap.delete(tileKey);
          }

          const structGroup = buildTileStructureGroup(
            tile,
            roadConn,
            maxAnisotropy,
            riverBanks
          );
          if (structGroup.children.length > 0) {
            const structBaseY =
              tile.type === 'river_water' ? -0.26 : baseMesh.position.y + 0.175;
            structGroup.position.set(wx, structBaseY, wz);
            structGroup.userData = {
              ...structGroup.userData,
              gridX: x,
              gridZ: z,
              tileType: tile.type,
            };
            structuresGroup.add(structGroup);
            tileStructGroupMap.set(tileKey, structGroup);
          }
        }
      }

      floodedWorldPositions = nextFloodedPositions;

      if (dirtyTileCount > 0) {
        boardGroup.updateMatrixWorld(true);
        structuresGroup.updateMatrixWorld(true);

        // Thu thập tọa độ thế giới của toàn bộ cột đèn đường (road_urban, road_ring, road_highway)
        const nextStreetlights: StreetlightWorldAnchor[] = [];
        for (const group of tileStructGroupMap.values()) {
          const localLights = group.userData?.streetlightLocalPositions as
            | { x: number; y: number; z: number }[]
            | undefined;
          if (localLights && localLights.length > 0) {
            for (const loc of localLights) {
              nextStreetlights.push({
                x: group.position.x + loc.x,
                y: group.position.y + loc.y,
                z: group.position.z + loc.z,
                distSq: 0,
              });
            }
          }
        }
        streetlightAnchors = nextStreetlights;
      }
      container.dataset.lastDirtyTileCount = String(dirtyTileCount);

      const nextRoadSig = computeRoadNetworkSignature(grid);
      if (nextRoadSig !== lastRoadNetworkSignature) {
        lastRoadNetworkSignature = nextRoadSig;
        rebuildVehiclesFromRoads(grid);
      }

      rebuildWaterShipsFromGrid(grid);
    };

    sceneRebuildRef.current = rebuildSceneTiles;
    rebuildSceneTiles(stateRef.current.grid, stateRef.current.season);
    controls.update();
    camera.updateMatrixWorld();

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const keysPressed = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        ['INPUT', 'SELECT', 'TEXTAREA'].includes(
          document.activeElement.tagName
        )
      ) {
        return;
      }
      if (
        e.code === 'Escape' ||
        e.key === 'Shift' ||
        e.code === 'ShiftLeft' ||
        e.code === 'ShiftRight'
      ) {
        hoverReticle.visible = false;
        roadSnapPreviewGroup.visible = false;
        lastHoveredGridTile = null;
        disposeGhostPreview();
      }
      keysPressed.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysPressed.delete(e.code);
    };
    const clearKeys = () => {
      keysPressed.clear();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearKeys);

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0, button: 0 };
    let touchLongPressTimer: number | null = null;
    let touchLongPressTriggered = false;

    const clearTouchLongPress = () => {
      if (touchLongPressTimer !== null) {
        window.clearTimeout(touchLongPressTimer);
        touchLongPressTimer = null;
      }
    };

    const getTileAtClientCoords = (
      clientX: number,
      clientY: number
    ): { x: number; z: number } | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      camera.updateMatrixWorld();
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(tileProxies, false);
      if (hits.length > 0) {
        const { gridX, gridZ } = hits[0].object.userData;
        return { x: gridX, z: gridZ };
      }
      return null;
    };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY, button: e.button };
      touchLongPressTriggered = false;
      clearTouchLongPress();

      if (e.pointerType === 'touch' && stateRef.current.mode === 'playing') {
        const downX = e.clientX;
        const downY = e.clientY;
        touchLongPressTimer = window.setTimeout(() => {
          touchLongPressTimer = null;
          const hit = getTileAtClientCoords(downX, downY);
          if (hit) {
            touchLongPressTriggered = true;
            disposeGhostPreview();
            onTileRightClickRef.current(hit.x, hit.z, downX, downY);
          }
        }, 420);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (stateRef.current.mode !== 'playing') return;

      if (touchLongPressTimer !== null) {
        const moveDist = Math.hypot(
          e.clientX - pointerDownPos.x,
          e.clientY - pointerDownPos.y
        );
        if (moveDist > 8) {
          clearTouchLongPress();
        }
      }

      if (e.buttons !== 0 && e.pointerType !== 'touch') {
        hoverReticle.visible = false;
        roadSnapPreviewGroup.visible = false;
        if (previewMesh) {
          previewMesh.visible = false;
          syncGhostDataset();
        }
        onTileHoverRef.current(null);
        return;
      }

      const hit = getTileAtClientCoords(e.clientX, e.clientY);
      if (hit) {
        lastHoveredGridTile = hit;
        const wx = hit.x * TILE_WORLD_SIZE - halfBoard + TILE_WORLD_SIZE / 2;
        const wz = hit.z * TILE_WORLD_SIZE - halfBoard + TILE_WORLD_SIZE / 2;
        const tool = stateRef.current.selectedTool;
        const targetTile = stateRef.current.grid[hit.z]?.[hit.x];

        const isFreePanMode = tool === 'inspect';
        const hasBuilding = Boolean(
          targetTile && isBuiltStructure(targetTile.type)
        );

        hoverReticle.position.set(wx, 0.14, wz);
        hoverReticle.visible = isFreePanMode ? hasBuilding : true;

        updateGhostAtGridTile(hit, tool);

        if (
          !isFreePanMode &&
          targetTile &&
          !isBuiltStructure(targetTile.type) &&
          isRoadTile(tool as TileType)
        ) {
          const snapInfo = detectRoadProximitySnap(
            stateRef.current.grid,
            hit.x,
            hit.z,
            tool as TileType
          );
          updateRoadSnapPreviewGroup(
            roadSnapPreviewGroup,
            snapInfo.previewConnections
          );
          roadSnapPreviewGroup.position.set(wx, 0.04, wz);
          roadSnapPreviewGroup.visible = true;
        } else {
          roadSnapPreviewGroup.visible = false;
        }

        if (isFreePanMode && !hasBuilding) {
          onTileHoverRef.current(null);
        } else {
          onTileHoverRef.current({
            x: hit.x,
            z: hit.z,
            clientX: e.clientX,
            clientY: e.clientY,
          });
        }
      } else {
        lastHoveredGridTile = null;
        hoverReticle.visible = false;
        roadSnapPreviewGroup.visible = false;
        if (previewMesh) {
          previewMesh.visible = false;
          syncGhostDataset();
        }
        onTileHoverRef.current(null);
      }
    };

    let lastRightClickAt = 0;

    const onPointerUp = (e: PointerEvent) => {
      clearTouchLongPress();
      if (touchLongPressTriggered) {
        touchLongPressTriggered = false;
        return;
      }
      if (stateRef.current.mode !== 'playing') return;
      const dist = Math.hypot(
        e.clientX - pointerDownPos.x,
        e.clientY - pointerDownPos.y
      );
      if (dist > 10) return;
      const hit = getTileAtClientCoords(e.clientX, e.clientY);
      if (!hit) return;

      if (e.button === 2 || pointerDownPos.button === 2) {
        lastRightClickAt = performance.now();
        disposeGhostPreview();
        onTileRightClickRef.current(hit.x, hit.z, e.clientX, e.clientY);
      } else if (e.button === 0 || e.pointerType === 'touch') {
        disposeGhostPreview();
        onTileClickRef.current(hit.x, hit.z);
      }
    };

    const onPointerCancel = () => {
      clearTouchLongPress();
      touchLongPressTriggered = false;
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (stateRef.current.mode !== 'playing') return;
      const now = performance.now();
      if (now - lastRightClickAt < 80) return;
      const dist = Math.hypot(
        e.clientX - pointerDownPos.x,
        e.clientY - pointerDownPos.y
      );
      if (pointerDownPos.x !== 0 && dist > 10) return;
      const hit = getTileAtClientCoords(e.clientX, e.clientY);
      if (hit) {
        lastRightClickAt = now;
        disposeGhostPreview();
        onTileRightClickRef.current(hit.x, hit.z, e.clientX, e.clientY);
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerCancel);
    renderer.domElement.addEventListener('contextmenu', onContextMenu);

    let lastWasPortrait = initW < initH;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height);
          if (composer) {
            composer.setSize(width, height);
          }
          if (bloomPass) {
            bloomPass.resolution.set(width, height);
          }
          const isPortrait = width < height;
          if (isPortrait !== lastWasPortrait) {
            lastWasPortrait = isPortrait;
            const scale = getDefaultCameraDistanceScale(width, height);
            camera.position.set(0, 36 * scale, 44 * scale);
            controls.update();
          }
        }
      }
    });
    resizeObserver.observe(container);

    let frameId = 0;
    let isDisposed = false;
    const clock = new THREE.Clock();
    let titleOrbitAngle = 0.55;
    let ambienceUpdateAccumulator = 0;
    let dayPhase = 0.12; // Khởi đầu ở buổi sáng nắng đẹp
    let forcedDayPhase: number | null = null;
    (
      window as unknown as {
        __setCityDayPhase?: (phase: number | null) => void;
      }
    ).__setCityDayPhase = (phase: number | null) => {
      forcedDayPhase = phase;
    };
    let shipWakeAccumulator = 0;
    let highTideFoamAccumulator = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync
        ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
        : null;
      gl.flush();
      const poll = () => {
        if (isDisposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (sync && state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function updateDayNightCycleAndStreetlights(dt: number, season: string) {
      if (forcedDayPhase !== null) {
        dayPhase = ((forcedDayPhase % 1) + 1) % 1;
      } else {
        dayPhase = (dayPhase + dt / DAY_NIGHT_CYCLE_SECONDS) % 1.0;
      }

      let nightFactor = 0;
      let sunAngle = Math.PI * 0.35;
      let keyIntensity = 1.85;
      let hemiIntensity = 0.85;
      let rimIntensity = 0.55;
      let envIntensity = 0.85;
      let exposure = 1.08;

      if (dayPhase < 0.45) {
        // Sáng (0.0–0.45): Nắng vàng trắng, HemisphereLight xanh trời
        const t = dayPhase / 0.45;
        horizonColor.copy(_colDaySky);
        keyLight.color.copy(_colDaySun);
        hemiLight.color.copy(_colDayHemiSky);
        hemiLight.groundColor.copy(_colDayHemiGround);
        sunAngle = THREE.MathUtils.lerp(0.55, 2.35, t);
        keyIntensity = 1.85;
        hemiIntensity = 0.85;
        rimIntensity = 0.55;
        envIntensity = 0.85;
        exposure = 1.08;
        nightFactor = 0;
      } else if (dayPhase < 0.6) {
        // Hoàng hôn (0.45–0.60): Góc DirectionalLight hạ thấp đổ bóng dài, ánh sáng cam ấm, chuyển dần sang đêm (#060b16)
        const t = (dayPhase - 0.45) / 0.15;
        if (t < 0.5) {
          horizonColor.lerpColors(_colDaySky, _colSunsetSky, t * 2);
          keyLight.color.lerpColors(_colDaySun, _colSunsetSun, t * 2);
          hemiLight.color.lerpColors(_colDayHemiSky, _colSunsetHemiSky, t * 2);
        } else {
          horizonColor.lerpColors(_colSunsetSky, _colNightSky, (t - 0.5) * 2);
          keyLight.color.lerpColors(_colSunsetSun, _colNightMoon, (t - 0.5) * 2);
          hemiLight.color.lerpColors(
            _colSunsetHemiSky,
            _colNightHemiSky,
            (t - 0.5) * 2
          );
        }
        hemiLight.groundColor.lerpColors(
          _colDayHemiGround,
          _colNightHemiGround,
          t
        );
        sunAngle = THREE.MathUtils.lerp(2.35, 2.92, t);
        keyIntensity = THREE.MathUtils.lerp(1.75, 0.14, t);
        hemiIntensity = THREE.MathUtils.lerp(0.8, 0.12, t);
        rimIntensity = THREE.MathUtils.lerp(0.5, 0.1, t);
        envIntensity = THREE.MathUtils.lerp(0.85, 0.08, t);
        exposure = THREE.MathUtils.lerp(1.08, 0.85, t);
        nightFactor = t;
      } else if (dayPhase < 0.9) {
        // Đêm (0.60–0.90):
        // - scene.environmentIntensity = 0.08 (tránh IBL chiếu sáng cả bàn cờ 18x18 như ban ngày)
        // - hemiLight.intensity = 0.12
        // - các đèn phụ (rimLight, keyLight mặt trăng) <= 0.15
        // - FogExp2 & background đồng bộ màu nền đêm (#060b16)
        // - renderer.toneMappingExposure = 0.85 để mặt đất, cây xanh và vỏ nhà tối xuống rõ rệt
        horizonColor.copy(_colNightSky);
        keyLight.color.copy(_colNightMoon);
        hemiLight.color.copy(_colNightHemiSky);
        hemiLight.groundColor.copy(_colNightHemiGround);
        sunAngle = 1.15;
        keyIntensity = 0.14;
        hemiIntensity = 0.12;
        rimIntensity = 0.1;
        envIntensity = 0.08;
        exposure = 0.85;
        nightFactor = 1.0;
      } else {
        // Bình minh (0.90–1.0): Chuyển dần về sáng
        const t = (dayPhase - 0.9) / 0.1;
        if (t < 0.5) {
          horizonColor.lerpColors(_colNightSky, _colDawnSky, t * 2);
          keyLight.color.lerpColors(_colNightMoon, _colDawnSun, t * 2);
        } else {
          horizonColor.lerpColors(_colDawnSky, _colDaySky, (t - 0.5) * 2);
          keyLight.color.lerpColors(_colDawnSun, _colDaySun, (t - 0.5) * 2);
        }
        hemiLight.color.lerpColors(_colNightHemiSky, _colDayHemiSky, t);
        hemiLight.groundColor.lerpColors(
          _colNightHemiGround,
          _colDayHemiGround,
          t
        );
        sunAngle = THREE.MathUtils.lerp(0.28, 0.55, t);
        keyIntensity = THREE.MathUtils.lerp(0.14, 1.85, t);
        hemiIntensity = THREE.MathUtils.lerp(0.12, 0.85, t);
        rimIntensity = THREE.MathUtils.lerp(0.1, 0.55, t);
        envIntensity = THREE.MathUtils.lerp(0.08, 0.85, t);
        exposure = THREE.MathUtils.lerp(0.85, 1.08, t);
        nightFactor = 1 - t;
      }

      if (season === 'high_tide' || season === 'monsoon') {
        keyIntensity *= 0.78;
      }

      const sunRadius = 52;
      keyLight.position.set(
        Math.cos(sunAngle) * sunRadius,
        Math.max(11, Math.sin(sunAngle) * sunRadius),
        24
      );
      keyLight.intensity = keyIntensity;
      hemiLight.intensity = hemiIntensity;
      rimLight.intensity = rimIntensity;
      scene.environmentIntensity = envIntensity;
      renderer.toneMappingExposure = exposure;
      sceneFog.color.copy(horizonColor);

      // Đồng bộ mặt nước phản chiếu (Water shader) với hướng nắng & màu nắng
      if (reflectiveWater.visible && reflectiveWater.material.uniforms) {
        const uniforms = reflectiveWater.material.uniforms;
        if (uniforms['time']) {
          uniforms['time'].value += dt * 0.65;
        }
        if (uniforms['sunDirection']) {
          uniforms['sunDirection'].value.copy(keyLight.position).normalize();
        }
        if (uniforms['sunColor']) {
          _scratchColorB
            .copy(keyLight.color)
            .multiplyScalar( THREE.MathUtils.lerp(1.0, 0.18, nightFactor) );
          uniforms['sunColor'].value.copy(_scratchColorB);
        }
        if (uniforms['waterColor']) {
          _scratchColorB
            .setHex(0x0369a1)
            .lerp(_colNightSky, nightFactor * 0.78);
          uniforms['waterColor'].value.copy(_scratchColorB);
        }
      }

      // Cập nhật mượt emissiveIntensity của cửa sổ tòa nhà và bóng đèn đường
      updateCityLightsEmissiveIntensity(nightFactor);

      // Streetlight PointLight Pool (tối đa 6 đèn gần tâm nhìn camera nhất)
      let activePoolLights = 0;
      if (nightFactor > 0.12 && streetlightAnchors.length > 0) {
        const cx = controls.target.x;
        const cz = controls.target.z;
        for (let i = 0; i < streetlightAnchors.length; i++) {
          const a = streetlightAnchors[i];
          const dx = a.x - cx;
          const dz = a.z - cz;
          a.distSq = dx * dx + dz * dz;
        }
        streetlightAnchors.sort((a, b) => a.distSq - b.distSq);

        const count = Math.min(STREETLIGHT_POOL_SIZE, streetlightAnchors.length);
        for (let i = 0; i < STREETLIGHT_POOL_SIZE; i++) {
          const pl = streetlightPool[i];
          if (i < count) {
            const anchor = streetlightAnchors[i];
            pl.position.set(anchor.x, anchor.y - 0.08, anchor.z);
            pl.intensity = nightFactor * 1.65;
            pl.visible = true;
            activePoolLights++;
          } else {
            pl.intensity = 0;
            pl.visible = false;
          }
        }
      } else {
        for (let i = 0; i < STREETLIGHT_POOL_SIZE; i++) {
          streetlightPool[i].intensity = 0;
          streetlightPool[i].visible = false;
        }
      }

      if (container) {
        container.dataset.dayPhase = dayPhase.toFixed(2);
        container.dataset.activeStreetlightPool = String(activePoolLights);
        container.dataset.environmentIntensity = envIntensity.toFixed(2);
        container.dataset.hemiIntensity = hemiIntensity.toFixed(2);
        container.dataset.rimIntensity = rimIntensity.toFixed(2);
        container.dataset.toneMappingExposure = exposure.toFixed(2);
      }
    }

    function tick() {
      if (isDisposed) return;
      const rawDt = clock.getDelta();
      const dt = Math.min(rawDt, 0.05);
      const currentState = stateRef.current;

      // 1. Chu kỳ Ngày / Đêm mượt mà (60s/vòng, độc lập với tick ngày) + Streetlight PointLight Pool
      updateDayNightCycleAndStreetlights(dt, currentState.season);

      // 2. Đồng bộ trạng thái 3D Ghost Preview & Va chạm
      if (
        previewMesh &&
        (currentState.mode !== 'playing' ||
          currentState.selectedTool === 'inspect' ||
          currentState.selectedTool === 'act_clearance' ||
          currentState.selectedTool === 'sub_drainage')
      ) {
        disposeGhostPreview();
      } else if (
        currentState.mode === 'playing' &&
        lastHoveredGridTile &&
        previewMesh &&
        previewMesh.visible
      ) {
        const check = canPlaceToolAtTile(
          currentState,
          lastHoveredGridTile.x,
          lastHoveredGridTile.z,
          currentState.selectedTool,
          false
        );
        if (!check.isGhostBuilding) {
          disposeGhostPreview();
        } else if (
          previewToolId !== currentState.selectedTool ||
          previewIsValid !== (check.allowed && !check.isColliding) ||
          previewIsColliding !== check.isColliding
        ) {
          updateGhostAtGridTile(lastHoveredGridTile, currentState.selectedTool);
        }
      }

      if (currentState.selectedTile && currentState.mode === 'playing') {
        const sx =
          currentState.selectedTile.x * TILE_WORLD_SIZE -
          halfBoard +
          TILE_WORLD_SIZE / 2;
        const sz =
          currentState.selectedTile.z * TILE_WORLD_SIZE -
          halfBoard +
          TILE_WORLD_SIZE / 2;
        selectedReticle.position.set(sx, 0.15, sz);
        selectedReticle.visible = true;
      } else {
        selectedReticle.visible = false;
      }

      if (currentState.mode === 'title') {
        controls.enabled = false;
        titleOrbitAngle += dt * 0.16;
        const targetCamX = Math.sin(titleOrbitAngle) * 38;
        const targetCamZ = Math.cos(titleOrbitAngle) * 38;
        const dampAlpha = 1 - Math.exp(-4 * dt);
        camera.position.x = THREE.MathUtils.lerp(
          camera.position.x,
          targetCamX,
          dampAlpha
        );
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, 26, dampAlpha);
        camera.position.z = THREE.MathUtils.lerp(
          camera.position.z,
          targetCamZ,
          dampAlpha
        );
        camera.lookAt(0, 1.5, 0);
      } else if (currentState.mode === 'playing') {
        controls.enabled = true;

        const panSpeed = 22 * dt;
        const forward = _scratchVec3
          .set(0, 0, -1)
          .applyQuaternion(camera.quaternion);
        forward.y = 0;
        forward.normalize();
        const right = _scratchRightVec3
          .set(-forward.z, 0, forward.x)
          .normalize();

        if (keysPressed.has('KeyW') || keysPressed.has('ArrowUp')) {
          camera.position.addScaledVector(forward, panSpeed);
          controls.target.addScaledVector(forward, panSpeed);
        }
        if (keysPressed.has('KeyS') || keysPressed.has('ArrowDown')) {
          camera.position.addScaledVector(forward, -panSpeed);
          controls.target.addScaledVector(forward, -panSpeed);
        }
        if (keysPressed.has('KeyA') || keysPressed.has('ArrowLeft')) {
          camera.position.addScaledVector(right, -panSpeed);
          controls.target.addScaledVector(right, -panSpeed);
        }
        if (keysPressed.has('KeyD') || keysPressed.has('ArrowRight')) {
          camera.position.addScaledVector(right, panSpeed);
          controls.target.addScaledVector(right, panSpeed);
        }

        if (cameraTrauma > 0.001) {
          const shake = cameraTrauma * cameraTrauma * 0.35;
          camera.position.x += (Math.random() - 0.5) * shake;
          camera.position.y += (Math.random() - 0.5) * shake;
          cameraTrauma = Math.max(0, cameraTrauma - dt * 2.8);
        }

        controls.update();

        ambienceUpdateAccumulator += dt;
        if (ambienceUpdateAccumulator >= 0.22) {
          ambienceUpdateAccumulator = 0;
          const focusX = lastHoveredGridTile
            ? lastHoveredGridTile.x
            : Math.floor((controls.target.x + halfBoard) / TILE_WORLD_SIZE);
          const focusZ = lastHoveredGridTile
            ? lastHoveredGridTile.z
            : Math.floor((controls.target.z + halfBoard) / TILE_WORLD_SIZE);
          const camDist = camera.position.distanceTo(controls.target);
          const profile = soundEngine.updateAmbienceFromCamera(
            currentState.grid,
            focusX,
            focusZ,
            currentState.metrics.population,
            camDist
          );
          if (container) {
            container.dataset.ambienceZone = profile.dominantZone;
            container.dataset.ambienceLabel = profile.zoneLabel;
          }
        }
      }

      const simDt = hitstopTimer > 0 ? 0 : dt;
      if (hitstopTimer > 0) {
        hitstopTimer = Math.max(0, hitstopTimer - dt);
      }

      if (currentState.mode === 'title' || currentState.mode === 'playing') {
        const speedFactor =
          (currentState.metrics.trafficSpeedIndex / 100) * 0.85 + 0.2;

        // Cập nhật phương tiện đường bộ
        for (let i = vehicles.length - 1; i >= 0; i--) {
          const v = vehicles[i];
          const prevYaw = v.navAgent.currentYaw;
          const sample = stepVehicleNavigationAgent(
            v.navAgent,
            simDt,
            speedFactor,
            currentState.grid,
            nodeOccupancyMap
          );

          if (v.navAgent.despawnedSafely) {
            disposeGroupGeometries(v.mesh);
            vehicleGroup.remove(v.mesh);
            vehicles.splice(i, 1);
            if (container) {
              container.dataset.activeVehicleCount = String(vehicles.length);
            }
            continue;
          }

          const stepDeltaSq =
            (sample.x - v.mesh.position.x) * (sample.x - v.mesh.position.x) +
            (sample.z - v.mesh.position.z) * (sample.z - v.mesh.position.z);

          if (stepDeltaSq > TILE_WORLD_SIZE * TILE_WORLD_SIZE) {
            v.mesh.position.set(sample.x, sample.y, sample.z);
          } else {
            const posAlpha = Math.min(1, simDt * 18);
            v.mesh.position.x = THREE.MathUtils.lerp(
              v.mesh.position.x,
              sample.x,
              posAlpha
            );
            v.mesh.position.y = THREE.MathUtils.lerp(
              v.mesh.position.y,
              sample.y,
              posAlpha
            );
            v.mesh.position.z = THREE.MathUtils.lerp(
              v.mesh.position.z,
              sample.z,
              posAlpha
            );
          }
          v.mesh.rotation.y = sample.yaw;

          let yawDelta = sample.yaw - prevYaw;
          while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
          while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
          const targetRoll = sample.isCurve
            ? Math.max(-0.14, Math.min(0.14, -yawDelta * 1.8))
            : 0;
          v.mesh.rotation.z = THREE.MathUtils.lerp(
            v.mesh.rotation.z,
            targetRoll,
            Math.min(1, simDt * 10)
          );
        }

        // Cập nhật Tàu thủy di chuyển trên sông + Hạt bọt nước trắng phía sau đuôi tàu
        shipWakeAccumulator += simDt;
        const shouldEmitWake = shipWakeAccumulator >= 0.085;
        if (shouldEmitWake) {
          shipWakeAccumulator = 0;
        }

        const currentWaterSurfaceY =
          currentState.season === 'high_tide' ? -0.1 : -0.26;
        const tideOffsetY =
          currentState.season === 'high_tide' ? 0.16 : 0;

        for (let i = 0; i < waterShips.length; i++) {
          const ship = waterShips[i];
          const sample = stepWaterShipAgent(ship.agent, simDt);
          ship.mesh.position.set(
            sample.x,
            sample.y + tideOffsetY,
            sample.z
          );
          ship.mesh.rotation.y = sample.yaw;
          ship.mesh.rotation.z = sample.roll;
          ship.mesh.rotation.x = sample.pitch;

          if (shouldEmitWake) {
            const wakeVx = -Math.sin(sample.yaw) * 0.45;
            const wakeVz = -Math.cos(sample.yaw) * 0.45;
            spawnWaterFoamParticle(
              sample.sternX,
              sample.sternZ,
              wakeVx,
              wakeVz,
              ship.agent.route.kind === 'cargo' ? 0.72 : 0.55,
              currentWaterSurfaceY
            );
          }
        }

        // Sinh hạt bọt nước tại khu vực nước dâng khi vào mùa Triều Cường (high_tide)
        if (
          currentState.season === 'high_tide' &&
          floodedWorldPositions.length > 0
        ) {
          highTideFoamAccumulator += simDt;
          if (highTideFoamAccumulator >= 0.14) {
            highTideFoamAccumulator = 0;
            const pick =
              floodedWorldPositions[
                Math.floor(Math.random() * floodedWorldPositions.length)
              ];
            if (pick) {
              spawnWaterFoamParticle(
                pick.x + (Math.random() - 0.5) * 1.6,
                pick.z + (Math.random() - 0.5) * 1.6,
                (Math.random() - 0.5) * 0.3,
                (Math.random() - 0.5) * 0.3,
                0.58,
                -0.04
              );
            }
          }
        }
      }

      // Cập nhật hiệu ứng thời tiết 3D theo mùa (Monsoon Rain · Dry Heat Haze · High Tide Water Ripples)
      weatherAnimClock += dt;
      const activeSeason = currentState.season;
      monsoonRainLines.visible = activeSeason === 'monsoon';
      dryHeatPoints.visible = activeSeason === 'dry';
      highTideRippleGroup.visible = activeSeason === 'high_tide';
      if (container) {
        container.dataset.weatherSeason = activeSeason;
        container.dataset.weatherEffect =
          activeSeason === 'monsoon'
            ? 'monsoon-rain'
            : activeSeason === 'high_tide'
            ? 'high-tide-ripples'
            : 'dry-heat-haze';
      }

      if (activeSeason === 'monsoon') {
        const posAttr = rainGeo.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < RAIN_DROP_COUNT; i++) {
          const rm = rainMeta[i];
          rm.y -= rm.speed * dt;
          rm.x -= 2.8 * dt;
          rm.z += 1.4 * dt;
          if (rm.y < 0.1) {
            rm.y = 23 + (i % 4) * 1.2;
            rm.x = ((i * 37 + Math.floor(weatherAnimClock * 11)) % 100) / 100 * (halfBoard * 2.2) - halfBoard * 1.1;
            rm.z = ((i * 71 + Math.floor(weatherAnimClock * 7)) % 100) / 100 * (halfBoard * 2.2) - halfBoard * 1.1;
          }
          const idx = i * 6;
          rainPositions[idx] = rm.x;
          rainPositions[idx + 1] = rm.y;
          rainPositions[idx + 2] = rm.z;
          rainPositions[idx + 3] = rm.x + 0.18;
          rainPositions[idx + 4] = rm.y + 1.25;
          rainPositions[idx + 5] = rm.z - 0.09;
        }
        posAttr.needsUpdate = true;
      } else if (activeSeason === 'dry') {
        const posAttr = heatGeo.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < HEAT_MOTE_COUNT; i++) {
          const hm = heatMeta[i];
          hm.y += hm.speed * dt;
          if (hm.y > 12.5) hm.y = 0.35;
          const idx = i * 3;
          heatPositions[idx] =
            hm.baseX + Math.sin(weatherAnimClock * 1.5 + hm.phase) * 0.55;
          heatPositions[idx + 1] = hm.y;
          heatPositions[idx + 2] =
            hm.baseZ + Math.cos(weatherAnimClock * 1.2 + hm.phase) * 0.55;
        }
        posAttr.needsUpdate = true;
      } else if (activeSeason === 'high_tide') {
        for (let i = 0; i < RIPPLE_RING_COUNT; i++) {
          const rr = rippleRings[i];
          rr.phase = (rr.phase + dt * 0.45) % 1;
          const scale = 0.4 + rr.phase * 2.4;
          rr.mesh.scale.set(scale, 1, scale);
          rr.mat.opacity = (1 - rr.phase) * 0.52;
          if (floodedWorldPositions.length > 0 && i % 2 === 0) {
            const fp =
              floodedWorldPositions[i % floodedWorldPositions.length];
            rr.mesh.position.set(fp.x, 0.02, fp.z);
          } else {
            const rx = ((i * 5) % GRID_SIZE) * TILE_WORLD_SIZE - halfBoard + TILE_WORLD_SIZE / 2;
            const rz = (8 + (i % 2)) * TILE_WORLD_SIZE - halfBoard + TILE_WORLD_SIZE / 2;
            rr.mesh.position.set(rx, -0.08, rz);
          }
        }
      }

      const minParticleY =
        currentState.season === 'high_tide' ? -0.09 : -0.25;
      let anyParticleUpdated = false;
      for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
        const p = particleData[i];
        if (!p.active) {
          _scratchVec3.set(0, -100, 0);
          _scratchScale.set(0.001, 0.001, 0.001);
          _scratchMat4.compose(_scratchVec3, _scratchQuat, _scratchScale);
          particleMesh.setMatrixAt(i, _scratchMat4);
          continue;
        }
        anyParticleUpdated = true;
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vy -= p.gravity * dt;
        const s = Math.max(0.04, (1 - p.life / p.maxLife) * p.baseScale);
        _scratchVec3.set(p.x, Math.max(minParticleY, p.y), p.z);
        _scratchScale.set(s, s * 0.65, s);
        _scratchMat4.compose(_scratchVec3, _scratchQuat, _scratchScale);
        particleMesh.setMatrixAt(i, _scratchMat4);
      }
      if (anyParticleUpdated) {
        particleMesh.instanceMatrix.needsUpdate = true;
      }

      if (graphicQualityRef.current === 'high' && !isSoftwareGl && composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    return () => {
      isDisposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      clearTouchLongPress();
      disposeGhostPreview();
      rainGeo.dispose();
      rainMat.dispose();
      heatGeo.dispose();
      heatMat.dispose();
      rippleRingGeo.dispose();
      for (const rr of rippleRings) {
        rr.mat.dispose();
      }
      resizeObserver.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearKeys);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerCancel);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
      renderer.domElement.removeEventListener(
        'webglcontextlost',
        onWebglContextLost
      );
      if (composer) {
        composer.dispose();
      }
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <>
      <div
        ref={mountRef}
        data-testid="city-viewport-container"
        className="fixed inset-0 w-full h-full overflow-hidden touch-none bg-[#0c141d]"
      />
      {/* Lớp phủ hiệu ứng thời tiết động trên khung nhìn 3D (Dynamic Visual Weather Effect Layer) */}
      <div
        data-testid="weather-effect-layer"
        data-season={gameState.season}
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none z-[5] overflow-hidden"
      >
        {gameState.season === 'monsoon' && (
          <div
            data-testid="weather-monsoon-rain"
            className="absolute inset-0 weather-monsoon-rain-layer"
          />
        )}
        {gameState.season === 'dry' && (
          <div
            data-testid="weather-dry-heathaze"
            className="absolute inset-0 weather-dry-heathaze-layer"
          />
        )}
        {gameState.season === 'high_tide' && (
          <div
            data-testid="weather-hightide-ripples"
            className="absolute inset-0"
          >
            <svg
              viewBox="0 0 1280 720"
              preserveAspectRatio="none"
              className="w-full h-full opacity-55"
            >
              <g stroke="rgba(125, 211, 252, 0.38)" fill="none" strokeWidth="1.5">
                <ellipse
                  cx="360"
                  cy="410"
                  rx="76"
                  ry="28"
                  className="weather-hightide-ripple-ring"
                />
                <ellipse
                  cx="640"
                  cy="435"
                  rx="92"
                  ry="34"
                  className="weather-hightide-ripple-ring"
                  style={{ animationDelay: '1.1s' }}
                />
                <ellipse
                  cx="910"
                  cy="395"
                  rx="80"
                  ry="30"
                  className="weather-hightide-ripple-ring"
                  style={{ animationDelay: '2.2s' }}
                />
              </g>
            </svg>
          </div>
        )}
      </div>
    </>
  );
};
