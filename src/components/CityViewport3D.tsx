import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mountIsometricCanvasFallback } from '../game/canvas2dFallback';
import {
  buildTileStructureGroup,
  createVehicleMesh,
  disposeGroupGeometries,
  disposeGroupResources,
  getMicroBumpTexture,
  TILE_WORLD_SIZE,
  updateRoadSnapPreviewGroup,
} from '../game/models3d';
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

export interface HoverTileInfo {
  x: number;
  z: number;
  clientX: number;
  clientY: number;
}

interface CityViewport3DProps {
  gameState: CityGameState;
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

const PARTICLE_POOL_SIZE = 80;
const _scratchVec3 = new THREE.Vector3();
const _scratchRightVec3 = new THREE.Vector3();
const _scratchMat4 = new THREE.Matrix4();
const _scratchQuat = new THREE.Quaternion();
const _scratchScale = new THREE.Vector3();
const _scratchColor = new THREE.Color();
const _scratchGhostBox = new THREE.Box3();
const _scratchStructBox = new THREE.Box3();

export const CityViewport3D: React.FC<CityViewport3DProps> = ({
  gameState,
  onTileClick,
  onTileRightClick,
  onTileHover,
  cameraPresetTrigger,
  pulseEventCount,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<CityGameState>(gameState);
  const onTileClickRef = useRef(onTileClick);
  const onTileRightClickRef = useRef(onTileRightClick);
  const onTileHoverRef = useRef(onTileHover);

  stateRef.current = gameState;
  onTileClickRef.current = onTileClick;
  onTileRightClickRef.current = onTileRightClick;
  onTileHoverRef.current = onTileHover;

  const sceneRebuildRef = useRef<((grid: TileData[][], season: string) => void) | null>(null);
  const triggerJuiceRef = useRef<((worldX: number, worldZ: number, colorHex: number) => void) | null>(null);
  const resetCameraRef = useRef<(() => void) | null>(null);
  const syncToolGhostRef = useRef<((tool: ToolId) => void) | null>(null);

  useEffect(() => {
    if (sceneRebuildRef.current) {
      sceneRebuildRef.current(gameState.grid, gameState.season);
    }
  }, [
    gameState.grid,
    gameState.season,
    gameState.policies.transitLevel,
    gameState.policies.banTrucksInResidential,
  ]);

  useEffect(() => {
    if (syncToolGhostRef.current) {
      syncToolGhostRef.current(gameState.selectedTool);
    }
  }, [gameState.selectedTool, gameState.mode]);

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
          : gameState.selectedTool === 'sub_drainage'
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

    // Tuyệt đối KHÔNG gọi WEBGL_lose_context.loseContext() trên canvas phụ vì trình duyệt sẽ chặn WebGL của trang.
    // Khởi tạo Three.js WebGLRenderer với cơ chế thử lại trên các thẻ <canvas> độc lập (tránh lỗi dính thuộc tính context cũ).
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

    if (!createdRenderer) {
      container.dataset.rendererMode = 'canvas-3d-fallback';
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
    const renderer = createdRenderer;

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const initialRect = container.getBoundingClientRect();
    const initW = initialRect.width || window.innerWidth;
    const initH = initialRect.height || window.innerHeight;
    renderer.setSize(initW, initH);
    renderer.domElement.dataset.testid = 'city-3d-canvas';
    renderer.domElement.style.touchAction = 'none';

    // Bảo vệ setPointerCapture / releasePointerCapture cho các sự kiện PointerEvent tổng hợp
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
    scene.fog = new THREE.FogExp2(0x132232, 0.0082);

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
    // Thích nghi cảm ứng Mobile: 1 ngón lia bản đồ (PAN), 2 ngón thu phóng & xoay góc nhìn (DOLLY_ROTATE)
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

    const hemiLight = new THREE.HemisphereLight(0xbae6fd, 0x1e293b, 0.85);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1d0, 1.85);
    keyLight.position.set(28, 46, 24);
    keyLight.castShadow = !isSoftwareGl;
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

    const treeCount = 76;
    const treeCrownGeo = new THREE.ConeGeometry(0.85, 2.2, 7);
    const treeCrownMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      roughness: 0.8,
      metalness: 0.05,
    });
    const instancedTrees = new THREE.InstancedMesh(
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
      _scratchVec3.set(tx, 1.1 * scale, tz);
      _scratchQuat.setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        (i * 1.7) % Math.PI
      );
      _scratchScale.set(scale, scale, scale);
      _scratchMat4.compose(_scratchVec3, _scratchQuat, _scratchScale);
      instancedTrees.setMatrixAt(i, _scratchMat4);
      _scratchColor.setHSL(0.36 + (i % 3) * 0.02, 0.62, 0.34 + (i % 4) * 0.04);
      instancedTrees.setColorAt(i, _scratchColor);
    }
    instancedTrees.instanceMatrix.needsUpdate = true;
    if (instancedTrees.instanceColor) {
      instancedTrees.instanceColor.needsUpdate = true;
    }
    instancedTrees.computeBoundingSphere();
    scene.add(instancedTrees);

    // 18x18 Interactive Grid Tiles
    const tileProxies: THREE.Mesh[] = [];
    const tileBaseMeshes: THREE.Mesh[][] = [];
    const floodWaterMeshes: THREE.Mesh[][] = [];
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

    const boardGroup = new THREE.Group();
    scene.add(boardGroup);

    const structuresGroup = new THREE.Group();
    scene.add(structuresGroup);

    const vehicleGroup = new THREE.Group();
    scene.add(vehicleGroup);
    let vehicles: ActiveRoadVehicle[] = [];
    const nodeOccupancyMap: NodeOccupancyMap = new Map<string, string>();

    for (let z = 0; z < GRID_SIZE; z++) {
      tileBaseMeshes[z] = [];
      floodWaterMeshes[z] = [];
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
      }
    }

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

    /**
     * Hệ thống 3D Ghost Preview Mesh (`previewMesh`) & Kiểm Tra Va Chạm (Collision Detection):
     * - Khởi tạo Mesh mờ: Khi click chọn loại công trình, tạo bản sao 3D tạm thời của mô hình công trình đó.
     * - Kiểm tra va chạm (Collision Detection): Kiểm tra cả ô lưới (`detectGhostCollision`) lẫn hộp giới hạn 3D (`THREE.Box3.intersectsBox`) với các công trình hiện có trong `structuresGroup`.
     * - Khi mô hình mờ đè lên công trình khác (`isColliding === true`): Đổi màu vật liệu sang ĐỎ RỰC RỠ (`0xff1744`, `emissive: 0xff0033`, `emissiveIntensity: 0.92`, `opacity: 0.68`) để cảnh báo người chơi không thể đặt tại vị trí đó.
     * - Khi ô đất trống và đủ điều kiện (`isValid === true`): Màu xanh (`0x22c55e`, `opacity = 0.5`).
     * - Cập nhật tọa độ theo Raycaster: `previewMesh.position.copy(gridIntersectionPoint)` để bám sát theo di chuyển của chuột/chạm.
     * - Hủy bỏ Ghost: Khi click chuột trái đặt công trình hoặc nhấn ESC / Shift / Chuột phải để hủy chọn, ẩn `previewMesh.visible = false` và giải phóng vật liệu khỏi bộ nhớ.
     */
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

    /**
     * Kiểm tra va chạm 3D (AABB `THREE.Box3.intersectsBox` + Grid Occupancy) giữa `previewMesh` và các công trình đã xây
     */
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
      // Thu hẹp nhẹ biên AABB (-0.12) để không báo va chạm giả với công trình ở ô liền kề hợp lệ
      _scratchGhostBox.expandByScalar(-0.12);

      for (let i = 0; i < structuresGroup.children.length; i++) {
        const existingStruct = structuresGroup.children[i];
        const uData = existingStruct.userData;
        // Chỉ kiểm tra va chạm với các công trình đã xây thực sự (bỏ qua cây cối / đá tự nhiên trên đất hoang)
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
            // Đổi màu vật liệu sang ĐỎ RỰC RỠ khi mô hình mờ đè lên một công trình khác
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
          // Nâng nhẹ vị trí Y thêm +0.06 khi đè lên công trình khác để màu đỏ rực rỡ nổi bật, không bị Z-fighting
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
      if (
        stateRef.current.mode !== 'playing' ||
        tool === 'inspect' ||
        tool === 'act_clearance' ||
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

    // Pooled Particle Ring Buffer
    const particleGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    const particleMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const particleMesh = new THREE.InstancedMesh(
      particleGeo,
      particleMat,
      PARTICLE_POOL_SIZE
    );
    particleMesh.frustumCulled = false;
    scene.add(particleMesh);

    const particleData = Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
      active: false,
      x: 0,
      y: -100,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      maxLife: 0.5,
    }));
    let particleHead = 0;

    let hitstopTimer = 0;
    let cameraTrauma = 0;

    triggerJuiceRef.current = (worldX: number, worldZ: number, colorHex: number) => {
      hitstopTimer = 0.04;
      cameraTrauma = Math.min(1.0, cameraTrauma + 0.38);
      _scratchColor.setHex(colorHex);

      for (let i = 0; i < 16; i++) {
        const p = particleData[particleHead];
        particleHead = (particleHead + 1) % PARTICLE_POOL_SIZE;
        p.active = true;
        p.x = worldX + (Math.random() - 0.5) * 1.2;
        p.y = 0.4 + Math.random() * 0.7;
        p.z = worldZ + (Math.random() - 0.5) * 1.2;
        const angle = Math.random() * Math.PI * 2;
        const spd = 2.2 + Math.random() * 4.0;
        p.vx = Math.cos(angle) * spd;
        p.vy = 3.2 + Math.random() * 4.0;
        p.vz = Math.sin(angle) * spd;
        p.life = 0;
        p.maxLife = 0.4 + Math.random() * 0.3;
        particleMesh.setColorAt(
          (particleHead - 1 + PARTICLE_POOL_SIZE) % PARTICLE_POOL_SIZE,
          _scratchColor
        );
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

    /**
     * Tự động sinh phương tiện bám theo quỹ đạo cong (Bezier / CatmullRom Spline)
     * của từng làn đường — Chỉ gọi khi cấu trúc mạng lưới đường (`road_*`) hoặc chính sách giao thông thay đổi,
     * tuyệt đối KHÔNG gọi lại mỗi ngày để tránh xe bị reset nhảy cóc.
     */
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
          // Đặt khoảng cách khởi tạo lệch pha (0 và 0.36 * totalLength) để 2 xe trên cùng tuyến
          // không bao giờ khởi tạo đè lên điểm đích (0.5 * totalLength) của nhau
          let initialDist =
            vIdx === 0 ? 0 : route.totalLength * 0.36;
          const agentRoute = {
            ...route,
            id: `${route.id}_veh_${vIdx}`,
          };

          // Nếu ô khởi tạo đang có xe ở tuyến giao cắt chiếm chỗ, dịch nhẹ dọc theo tuyến sang ô trống kế tiếp
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

    // Bản đồ lưu trữ nhóm 3D và chữ ký trạng thái (dirty-tile diffing) cho từng ô (x, z)
    const tileStructGroupMap = new Map<string, THREE.Group>();
    const tileStateSignatureMap = new Map<string, string>();

    const rebuildSceneTiles = (grid: TileData[][], season: string) => {
      if (season === 'high_tide' || season === 'monsoon') {
        keyLight.intensity = 1.35;
        hemiLight.color.setHex(0x93c5fd);
      } else {
        keyLight.intensity = 1.85;
        hemiLight.color.setHex(0xbae6fd);
      }

      let dirtyTileCount = 0;

      for (let z = 0; z < GRID_SIZE; z++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          const tile = grid[z][x];
          const roadConn = getRoadConnections(grid, x, z);
          const tileKey = `${x},${z}`;
          const tileSig = `${tile.type}|${tile.elevation}|${
            tile.isFlooded ? 1 : 0
          }|${tile.hasDrainage ? 1 : 0}|${tile.constructionRemainingDays}|${
            tile.constructionTotalDays
          }|${tile.sidewalkVendors ? 1 : 0}|${
            tile.disputeTurns > 0 ? 1 : 0
          }|${roadConn.north ? 1 : 0}${roadConn.south ? 1 : 0}${
            roadConn.west ? 1 : 0
          }${roadConn.east ? 1 : 0}`;

          if (tileStateSignatureMap.get(tileKey) === tileSig) {
            continue;
          }

          tileStateSignatureMap.set(tileKey, tileSig);
          dirtyTileCount += 1;

          const wx = x * TILE_WORLD_SIZE - halfBoard + TILE_WORLD_SIZE / 2;
          const wz = z * TILE_WORLD_SIZE - halfBoard + TILE_WORLD_SIZE / 2;

          const baseMesh = tileBaseMeshes[z][x];
          const baseMat = baseMesh.material as THREE.MeshStandardMaterial;

          if (tile.type === 'river_water') {
            baseMat.color.setHex(0x0369a1);
            baseMat.roughness = 0.15;
            baseMat.metalness = 0.72;
            baseMesh.position.y = -0.32;
          } else if (tile.type === 'lowland_marsh') {
            baseMat.color.setHex(0x274e37);
            baseMat.roughness = 0.88;
            baseMat.metalness = 0.05;
            baseMesh.position.y = -0.24;
          } else {
            baseMat.color.setHex(tile.elevation === 2 ? 0x3b593f : 0x2f4f38);
            baseMat.roughness = 0.85;
            baseMat.metalness = 0.05;
            baseMesh.position.y = tile.elevation === 2 ? -0.1 : -0.175;
          }

          floodWaterMeshes[z][x].visible = tile.isFlooded;

          const prevStruct = tileStructGroupMap.get(tileKey);
          if (prevStruct) {
            disposeGroupResources(prevStruct);
            structuresGroup.remove(prevStruct);
            tileStructGroupMap.delete(tileKey);
          }

          const structGroup = buildTileStructureGroup(
            tile,
            roadConn,
            maxAnisotropy
          );
          if (structGroup.children.length > 0) {
            structGroup.position.set(wx, baseMesh.position.y + 0.175, wz);
            structGroup.userData = { gridX: x, gridZ: z, tileType: tile.type };
            structuresGroup.add(structGroup);
            tileStructGroupMap.set(tileKey, structGroup);
          }
        }
      }

      if (dirtyTileCount > 0) {
        boardGroup.updateMatrixWorld(true);
        structuresGroup.updateMatrixWorld(true);
      }
      container.dataset.lastDirtyTileCount = String(dirtyTileCount);

      // Chỉ tái tạo mạng lưới xe cộ khi người chơi xây mới hoặc giải tỏa ô đường (road_*) hoặc đổi chính sách giao thông
      const nextRoadSig = computeRoadNetworkSignature(grid);
      if (nextRoadSig !== lastRoadNetworkSignature) {
        lastRoadNetworkSignature = nextRoadSig;
        rebuildVehiclesFromRoads(grid);
      }
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
      // Hủy bỏ Ghost (previewMesh.visible = false & giải phóng bộ nhớ) khi nhấn ESC hoặc Shift
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

      // Hỗ trợ Mobile: Nhấn giữ (Long-Press ~420ms) trên ô đất/công trình để mở bảng Nhân Sự & Thuế CIT (thay cho Chuột phải)
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

      // Khi người chơi đang giữ chuột kéo lia camera, ẩn khung preview để không dính vào chuột lia
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

        // Khi ở chế độ tự do lia map (Shift / inspect), chỉ hiện khung chọn khi lia vào công trình đã xây
        hoverReticle.position.set(wx, 0.14, wz);
        hoverReticle.visible = isFreePanMode ? hasBuilding : true;

        // Cập nhật 3D Ghost Preview Mesh & Kiểm tra va chạm (collision detection)
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
        // Hủy bỏ Ghost khi click chuột phải
        disposeGhostPreview();
        onTileRightClickRef.current(hit.x, hit.z, e.clientX, e.clientY);
      } else if (e.button === 0 || e.pointerType === 'touch') {
        // Hủy bỏ / Ẩn Ghost (previewMesh.visible = false & giải phóng bộ nhớ) ngay khi click/chạm đặt công trình xuống đất
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

    function tick() {
      if (isDisposed) return;
      const rawDt = clock.getDelta();
      const dt = Math.min(rawDt, 0.05);
      const currentState = stateRef.current;

      // Đồng bộ trạng thái 3D Ghost Preview & Va chạm trong hàm animate/tick()
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

        // Cập nhật âm thanh nền (Ambience) theo vị trí Camera, loại công trình và mật độ dân số
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

          // Nghiêng nhẹ thân xe (banking roll) khi ôm cua trên đoạn đường cong
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
      }

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
        p.vy -= 12 * dt;
        const s = Math.max(0.05, 1 - p.life / p.maxLife);
        _scratchVec3.set(p.x, Math.max(0.05, p.y), p.z);
        _scratchScale.set(s, s, s);
        _scratchMat4.compose(_scratchVec3, _scratchQuat, _scratchScale);
        particleMesh.setMatrixAt(i, _scratchMat4);
      }
      if (anyParticleUpdated) {
        particleMesh.instanceMatrix.needsUpdate = true;
      }

      renderer.render(scene, camera);

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
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      data-testid="city-viewport-container"
      className="fixed inset-0 w-full h-full overflow-hidden touch-none bg-[#0c141d]"
    />
  );
};
