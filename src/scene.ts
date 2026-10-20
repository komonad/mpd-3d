import { animationTiming } from './turn-playback';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { bodies } from './engine';
import { motionBodies } from './body-motion';
import { blockHeight, bodyLayerGeometry, bodySurfaceGeometries, exteriorHalfExtent, fixedAnchorPoints } from './body-geometry';
import { fitShadowCamera, renderPixelRatio, visibleShadowBounds } from './render-quality';
import { adhesiveTexture, surfaceTextures } from './surface-materials';
import { glassRimGeometry } from './glass-geometry';
import { SurfaceSSAOPass } from './surface-ao';
import { batchSurfaceGroups, surfaceMaterialRegions } from './surface-batching';
import { prepareSurfacePicking, surfaceRaycast } from './surface-picking';
import { labelBatch } from './label-batch';
import { PerformanceMonitor } from './performance-monitor';
import { cameraHalfHeight, demonStatus, followFocus, motionSettled, orthographicDepth, spawnPoints } from './view-state';
import { depth, directions, opposite } from './topology';
import { portalPresentation, type levelLabels } from './level-labels';
import { pickBodyCell } from './cell-picking';
import type { Cell, Level, Piston, State, Temperature } from './types';

const palette = { wall: '#aab1b6', neutral: '#bec5ca', hot: '#d94e28', cold: '#298fcd', demon: '#b9c0c5', floor: '#eef0ec' };
const thermalColor = (t: Temperature) => t === 1 ? palette.hot : t === -1 ? palette.cold : t === 2 ? '#45b577' : palette.neutral;

interface DemonVisual {
  group: THREE.Group; target: THREE.Vector3; material: THREE.MeshStandardMaterial; temperature: Temperature;
  face: THREE.Group; eyes: THREE.Group; faintEyes: THREE.Group; thinkingEyes: THREE.Group; awake: boolean;
}

function labelTexture(text: string, weight = 700, ink = '#000000', locked = false): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const lines = text.split(':'), ctx = canvas.getContext('2d')!;
  ctx.font = `${weight} 112px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const size = Math.min(112, (locked ? 168 : 208) / lines.length, 112 * 222 / Math.max(1, ...lines.map(line => ctx.measureText(line).width)));
  ctx.font = `${weight} ${size}px sans-serif`; ctx.fillStyle = ink;
  ctx.strokeStyle = '#ffffffed'; ctx.lineWidth = 5; ctx.lineJoin = 'round';
  lines.forEach((line, i) => {
    const y = 130 + (i - (lines.length - 1) / 2) * size * 1.06;
    ctx.strokeText(line, 128, y); ctx.fillText(line, 128, y);
  });
  if (locked) {
    ctx.strokeStyle = ink; ctx.lineWidth = 4; ctx.setLineDash([14, 10]); ctx.strokeRect(14, 18, 228, 220);
    ctx.setLineDash([]); ctx.fillRect(116, 208, 24, 20); ctx.beginPath(); ctx.arc(128, 208, 8, Math.PI, 0); ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

function demonShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d')!, gradient = context.createRadialGradient(32, 32, 5, 32, 32, 31);
  gradient.addColorStop(0, '#00000050'); gradient.addColorStop(1, '#00000000');
  context.fillStyle = gradient; context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export class GameScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-8, 8, 8, -8, 0.1, 250);
  readonly controls: OrbitControls;
  private readonly composer: EffectComposer;
  private readonly ao: SurfaceSSAOPass;
  private readonly sun = new THREE.DirectionalLight('#fffaf3', 2.5);
  private board = new THREE.Group();
  private pieces = new Map<number, THREE.Group>();
  private demons: DemonVisual[] = [];
  private readonly adhesiveMaterial = new THREE.MeshPhysicalMaterial({ map: adhesiveTexture(), vertexColors: true, roughness: 0.38, metalness: 0.12, clearcoat: 0.4, alphaTest: 0.12, alphaToCoverage: true, depthWrite: true, polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -1 });
  private readonly textures = surfaceTextures();
  private readonly demonShadowMaterial = new THREE.MeshBasicMaterial({ map: demonShadowTexture(), transparent: true, depthWrite: false, toneMapped: false });
  private readonly sharedTextures = new Set<THREE.Texture>([this.adhesiveMaterial.map!, this.demonShadowMaterial.map!, ...Object.values(this.textures)]);
  private parts = new THREE.Group();
  private labels: ReturnType<typeof levelLabels> = new Map();
  private visited = new Set<string>();
  private shownState?: State;
  private activity: 'idle' | 'walking' | 'pushing' | 'resolving' = 'idle';
  private pistonRods: { rod: THREE.Mesh; target: number; direction: number }[] = [];
  private pistonNumbers = true;
  private level?: Level;
  private previousTime = performance.now();
  private targets = new Map<number, THREE.Vector3>();
  private lastStep = 0;
  private mergingBodies = false;
  private gridMeshes: THREE.Object3D[] = [];
  private raycaster = new THREE.Raycaster();
  private noteMarkers: THREE.Object3D[] = [];
  private pointer = new THREE.Vector2();
  private hoverEvent?: PointerEvent;
  private hoverPending = false;
  private lastHover = 0;
  private size = new THREE.Vector2();
  private tilt = 32;
  private azimuth = -9;
  private running = true;
  private freeView = false;
  private motionDuration = animationTiming.move;
  private portalMotion?: { start: number; duration: number; from: THREE.Vector3[]; to: THREE.Vector3[] };
  private motionWaiters: ((settled: boolean) => void)[] = [];
  onHover?: (cellKey: number | null, state?: State) => void;
  onPortalClick?: (target: string) => void;
  onNoteClick?: (text: string) => void;
  onStatus?: (temperature: Temperature, status: string) => void;
  private status = '';
  private dirty = true;
  private shadowDirty = true;
  private shadowBounds?: THREE.Box3;
  private labelsDirty = true;
  private labelPositionsDirty = true;
  private highQuality = true;
  private detailResumeAt = 0;
  private readonly performanceMonitor: PerformanceMonitor;
  private readonly boardCache = new Map<Level, {
    board: THREE.Group; parts: THREE.Group; pieces: Map<number, THREE.Group>;
    targets: Map<number, THREE.Vector3>; demons: DemonVisual[];
    rods: GameScene['pistonRods']; grids: THREE.Object3D[]; notes: THREE.Object3D[];
  }>();

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
    this.renderer.transmissionResolutionScale = 0.5;
    this.renderer.setPixelRatio(renderPixelRatio(devicePixelRatio, true));
    this.sharedTextures.forEach(texture => { texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy(); });
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor('#ffffff', 0);
    this.renderer.domElement.setAttribute('aria-label', '三维关卡棋盘，使用方向键或 WASD 移动');
    this.host.append(this.renderer.domElement);
    this.performanceMonitor = new PerformanceMonitor(this.renderer, this.host);
    this.performanceMonitor.setEnabled(new URLSearchParams(location.search).has('perf'));
    const pmrem = new THREE.PMREMGenerator(this.renderer), environment = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(environment, 0.04).texture; environment.dispose(); pmrem.dispose();
    this.scene.environmentIntensity = 0.65;
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false; this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false; this.controls.enableRotate = true; this.controls.minZoom = 0.3; this.controls.maxZoom = 5;
    this.controls.minPolarAngle = 0.02; this.controls.maxPolarAngle = Math.PI * 0.44;
    this.controls.mouseButtons = { LEFT: null as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.touches.ONE = THREE.TOUCH.ROTATE;
    this.controls.addEventListener('change', () => { this.dirty = true; this.detailResumeAt = performance.now() + 160; });

    this.scene.add(new THREE.HemisphereLight('#fffdf7', '#8a9299', 1.1));
    const sun = this.sun; sun.position.set(-9, 16, 7); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.normalBias = 0.035; sun.shadow.bias = -0.00015; sun.shadow.radius = 3; this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#dce8f1', 0.8); fill.position.set(7, 10, -10); this.scene.add(fill);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.23 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.58; ground.receiveShadow = true; this.scene.add(ground);
    const renderTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 2 });
    this.composer = new EffectComposer(this.renderer, renderTarget);
    this.composer.setPixelRatio(1);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = new SurfaceSSAOPass(this.scene, this.camera, 1, 1, 8); this.ao.kernelRadius = 0.16; this.ao.minDistance = 0.001; this.ao.maxDistance = 0.1;
    this.ao.ssaoMaterial.defines.PERSPECTIVE_CAMERA = 0;
    this.ao.depthRenderMaterial.defines.PERSPECTIVE_CAMERA = 0;
    this.composer.addPass(this.ao);
    this.composer.addPass(new SMAAPass());
    this.composer.addPass(new OutputPass());
    this.scene.add(this.board);
    new ResizeObserver(() => this.resize()).observe(host);
    this.renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
    this.renderer.domElement.addEventListener('pointermove', e => this.hover(e));
    this.renderer.domElement.addEventListener('pointerleave', () => { this.hoverEvent = undefined; this.onHover?.(null); });
    this.renderer.domElement.addEventListener('click', e => {
      const hit = this.hit(e); if (hit?.portal) this.onPortalClick?.(hit.portal);
      if (hit?.note) this.onNoteClick?.(hit.note);
    });
    document.addEventListener('visibilitychange', () => { this.running = !document.hidden; this.performanceMonitor.resetClock(); });
    this.resize(); this.renderer.setAnimationLoop(() => this.animate());
  }

  private physical(color: string, wall = false): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({ color, roughness: wall ? 0.72 : 0.38, metalness: wall ? 0.08 : 0.12,
      clearcoat: wall ? 0.08 : 0.4, clearcoatRoughness: 0.2 });
  }

  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Mesh {
    const object = new THREE.Mesh(geometry, material); object.position.set(x, y, z); object.castShadow = true; object.receiveShadow = true;
    object.userData.pickSurface = !!parent.userData.cellKeys;
    parent.add(object); return object;
  }

  private makeDemon(): DemonVisual {
    const group = new THREE.Group(), face = new THREE.Group(), eyes = new THREE.Group(), faintEyes = new THREE.Group(), thinkingEyes = new THREE.Group();
    const matte = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, envMapIntensity: 0 });
    const material = matte(palette.demon), ink = new THREE.MeshBasicMaterial({ color: '#263039' });
    face.position.y = 0.56; group.add(face); face.add(eyes, faintEyes, thinkingEyes);
    this.mesh(new THREE.SphereGeometry(0.48, 40, 32), material, group, 0, 0.56, 0).castShadow = false;
    const shadow = this.mesh(new THREE.PlaneGeometry(1.15, 1.15), this.demonShadowMaterial, group, 0, 0.003, 0);
    shadow.rotation.x = -Math.PI / 2; shadow.castShadow = shadow.receiveShadow = false; shadow.userData.transmissiveOnly = true;
    const stroke = (points: number[][], parent: THREE.Group, radius = 0.014) => {
      const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p as [number, number, number])), false, 'centripetal');
      const line = this.mesh(new THREE.TubeGeometry(curve, points.length * 12, radius, 8, false), ink, parent); line.castShadow = false; return line;
    };
    const facial = (points: number[][], parent: THREE.Group) => stroke(points.map(([x, y]) => [x, y, Math.sqrt(0.48 ** 2 - x ** 2 - y ** 2) + 0.008]), parent);
    for (const side of [-1, 1]) {
      facial([[side * 0.095, 0.08], [side * 0.095, 0.23]], eyes);
      facial([[side * 0.095 - 0.07, 0.15], [side * 0.095 + 0.07, 0.15]], thinkingEyes);
      for (const slope of [-1, 1]) facial([[side * 0.12 - 0.06, 0.15 - slope * 0.06], [side * 0.12 + 0.06, 0.15 + slope * 0.06]], faintEyes);
      const horn = new THREE.CurvePath<THREE.Vector3>();
      const points = [[side * 0.21, 0.42, 0], [side * 0.4, 0.58, 0], [side * 0.35, 0.32, 0]].map(p => new THREE.Vector3(...p as [number, number, number]));
      for (let i = 0; i < points.length; i++) horn.add(new THREE.LineCurve3(points[i], points[(i + 1) % points.length]));
      const outline = this.mesh(new THREE.TubeGeometry(horn, 18, 0.013, 8, true), ink, face); outline.castShadow = false;
      stroke([[side * 0.43, 0.14, 0], [side * 0.63, 0.2, 0], [side * 0.65, 0.02, 0], [side * 0.63, -0.14, 0], [side * 0.43, -0.04, 0]], face);
    }
    stroke([[-0.26, -0.4, 0], [-0.4, -0.47, 0], [-0.48, -0.43, 0], [-0.55, -0.49, 0], [-0.64, -0.45, 0]], face, 0.013);
    faintEyes.visible = false; thinkingEyes.visible = false;
    group.traverse(object => { object.updateMatrix(); object.matrixAutoUpdate = object === group || object === face; });
    return { group, target: new THREE.Vector3(), material, temperature: 0, face, eyes, faintEyes, thinkingEyes, awake: true };
  }

  private characterFocus(): THREE.Vector3 {
    return followFocus(this.demons.map(model => model.group.position));
  }

  private paint(material: THREE.MeshPhysicalMaterial, cell: Cell, fixed: boolean): void {
    material.color.set(cell.storesHeat ? fixed && cell.temperature === 0 ? palette.wall : thermalColor(cell.temperature) : cell.temperature === 0 ? '#ffffff' : thermalColor(cell.temperature));
    material.emissive.set(cell.temperature === 1 ? '#e64b18' : cell.temperature === -1 ? '#19567a' : '#000000');
    material.emissiveIntensity = cell.temperature === 1 ? 0.06 : cell.temperature === -1 ? 0.025 : 0;
  }

  private makeBody(cells: Cell[], state: State): THREE.Group {
    const root = cells[0], g = new THREE.Group(), fixed = cells.some(c => c.fixed);
    const height = blockHeight;
    const uniform = cells.every(c => c.storesHeat === root.storesHeat && c.temperature === root.temperature);
    const materials = (uniform ? [root] : cells).map(cell => {
      const material = this.physical(thermalColor(cell.temperature), fixed); this.paint(material, cell, fixed);
      if (!cell.storesHeat) {
        material.map = this.textures.glass; material.roughnessMap = this.textures.glassRoughness;
        material.transmission = 0.96; material.thickness = 0.45; material.ior = 1.33;
        material.depthWrite = false;
        material.roughness = 1; material.metalness = 0; material.clearcoat = 0.6;
        material.attenuationDistance = 12; material.attenuationColor.set('#ffffff'); material.envMapIntensity = 1.1;
      }
      return material;
    });
    const hollow = new Set((state.pistons ?? []).filter(p => p.model === 'boundary' && !p.expanded).map(p => p.baseKey));
    const solidCells = cells.filter(c => !hollow.has(c.key));
    const occupied = new Set(solidCells.map(c => `${c.x},${c.y}`)), level = this.level!;
    const exterior = fixed && solidCells.every(c => c.container === undefined) &&
      Array.from({ length: level.width }, (_, x) => occupied.has(`${x},0`) && occupied.has(`${x},${level.height - 1}`)).every(Boolean) &&
      Array.from({ length: level.height }, (_, y) => occupied.has(`0,${y}`) && occupied.has(`${level.width - 1},${y}`)).every(Boolean);
    const surfaces = solidCells.length ? bodySurfaceGeometries(solidCells, height, exterior ? level : undefined) : {};
    if (Object.values(surfaces).some(geometry => geometry?.userData.materialRegions)) g.userData.materialRegions = surfaceMaterialRegions(cells);
    for (const [kind, geometry] of Object.entries(surfaces) as [string, THREE.BufferGeometry][]) {
      geometry.translate(solidCells[0].x - root.x, 0, solidCells[0].y - root.y);
      geometry.groups.forEach(group => { group.materialIndex = uniform ? 0 : cells.indexOf(solidCells[group.materialIndex ?? 0]); });
      const core = new THREE.Mesh(geometry, materials); core.castShadow = kind === 'solid'; core.receiveShadow = true;
      core.raycast = surfaceRaycast;
      core.userData.bodySurface = true; core.userData.transmissiveOnly = kind === 'glass'; g.add(core);
    }
    g.userData.key = root.key; g.userData.cellKeys = cells.map(c => c.key); g.userData.materials = materials; g.userData.uniform = uniform;
    const glass = solidCells.filter(c => !c.storesHeat);
    if (glass.length) {
      const rimMaterial = new THREE.MeshPhysicalMaterial({ color: '#58666f', roughness: 0.42, metalness: 0.12, transparent: true, opacity: 0.82, depthWrite: false });
      const rimGeometry = glassRimGeometry(solidCells, height); rimGeometry.translate(solidCells[0].x - root.x, 0, solidCells[0].y - root.y);
      const rim = new THREE.Mesh(rimGeometry, rimMaterial);
      rim.userData.transmissiveOnly = true; g.add(rim);
      g.userData.glassRim = { material: rimMaterial, cellKey: glass[0].key };
    }
    const delta = [[-1, 0], [0, 1], [1, 0], [0, -1]];
    // Coating tops sit above the core; their vertical faces extend to meet the raised surface.
    const layer = solidCells.length ? bodyLayerGeometry(solidCells, height + 0.006, exterior ? this.level : undefined) : new THREE.BufferGeometry();
    if (solidCells.length) layer.translate(solidCells[0].x - root.x, 0, solidCells[0].y - root.y);
    if (layer.getAttribute('position')?.count) {
      layer.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(layer.getAttribute('position').count * 3), 3));
      g.userData.surfaceLayer = layer;
      const insulation = this.physical('#fcfcfa'); insulation.roughness = 0.9; insulation.metalness = insulation.clearcoat = 0;
      insulation.userData.transmissionBarrier = true;
      // A constant depth bias separates coplanar layers without pulling grazing faces through occluders.
      insulation.polygonOffset = true; insulation.polygonOffsetFactor = 0; insulation.polygonOffsetUnits = -1;
      this.mesh(layer, [insulation, this.adhesiveMaterial], g).userData.pickSurface = false;
    } else layer.dispose();
    for (const cell of cells) {
      const x = cell.x - root.x, z = cell.y - root.y;
      if (cell.portal || (cell.heatCapacity ?? 1) > 1) {
        const label = cell.portal ? portalPresentation(cell, this.labels, this.visited) : { text: String(cell.heatCapacity), weight: 700, ink: '#000000', locked: false };
        const mark = this.mesh(new THREE.PlaneGeometry(0.82, 0.72), new THREE.MeshBasicMaterial({ map: labelTexture(label.text, label.weight, label.ink, label.locked), transparent: true, depthWrite: false, toneMapped: false }), g, x, height + 0.09, z);
        mark.rotation.x = -Math.PI / 2; mark.castShadow = false; mark.userData.key = cell.key; mark.userData.labelKey = cell.key; mark.userData.portal = cell.portal?.target;
        if (cell.portal) { mark.userData.portalCell = cell; mark.userData.locked = label.locked; }
      }
      const piston = state.pistons?.find(p => p.baseKey === cell.key);
      if (piston) {
        if (piston.model === 'boundary') {
          const material = materials[uniform ? 0 : cells.indexOf(cell)];
          if (!piston.expanded) {
            for (let side = 0; side < 4; side++) {
              if (side === piston.direction) continue;
              const d = directions[side], horizontal = side % 2 === 1;
              this.mesh(new RoundedBoxGeometry(horizontal ? 0.96 : 0.075, height, horizontal ? 0.075 : 0.96, 3, 0.02), material, g, x + d.x * 0.44, 0.55, z + d.y * 0.44);
              const inner = new THREE.MeshStandardMaterial({ color: '#fcfcfa', roughness: 0.9 });
              this.mesh(new RoundedBoxGeometry(horizontal ? 0.86 : 0.012, 0.85, horizontal ? 0.012 : 0.86, 2, 0.005), inner, g, x + d.x * 0.397, 0.55, z + d.y * 0.397);
            }
            this.mesh(new RoundedBoxGeometry(0.88, 0.045, 0.88, 3, 0.015), new THREE.MeshStandardMaterial({ color: '#f5f5f5', roughness: 0.9 }), g, x, 0.09, z);
          }
          const frame = new THREE.MeshStandardMaterial({ color: '#78858d', roughness: 0.8 });
          for (const a of [-1, 1]) for (const b of [-1, 1]) this.mesh(new RoundedBoxGeometry(0.055, 0.055, 0.96, 3, 0.01), frame, g, x + a * 0.46, b > 0 ? 1.06 : 0.065, z);
          for (const side of [-1, 1]) this.mesh(new RoundedBoxGeometry(0.96, 0.055, 0.055, 3, 0.01), frame, g, x, 1.06, z + side * 0.46);
          const back = directions[opposite(piston.direction)], front = directions[piston.direction];
          const metal = new THREE.MeshStandardMaterial({ color: '#50585e', roughness: 0.75, metalness: 0.15 });
          const plateAt = piston.expanded ? 0.455 : -0.34, horizontal = piston.direction % 2 === 1;
          const plate = this.mesh(new RoundedBoxGeometry(horizontal ? 0.78 : 0.05, 0.8, horizontal ? 0.05 : 0.78, 3, 0.012), material, g, x + front.x * plateAt, 0.52, z + front.y * plateAt);
          plate.userData.pistonFace = true; plate.userData.expanded = piston.expanded;
          this.mesh(new RoundedBoxGeometry(horizontal ? 0.48 : 0.035, 0.035, horizontal ? 0.035 : 0.48, 2, 0.008), metal, g, x + front.x * (plateAt + 0.065), 0.78, z + front.y * (plateAt + 0.065));
          this.pistonArrow(piston, state, g, x + back.x * 0.28, 1.105, z + back.y * 0.28);
          const number = this.mesh(new THREE.PlaneGeometry(0.36, 0.36), new THREE.MeshBasicMaterial({ map: labelTexture(`#${piston.order + 1}`), transparent: true, depthWrite: false, toneMapped: false }), g, x - back.x * 0.28, 1.115, z - back.y * 0.28);
          number.rotation.x = -Math.PI / 2; number.visible = this.pistonNumbers; number.userData.pistonNumber = true;
          continue;
        }
        const metal = new THREE.MeshPhysicalMaterial({ color: '#5f737f', metalness: 0.85, roughness: 0.26 });
        for (const a of [-1, 1]) for (const b of [-1, 1]) this.mesh(new RoundedBoxGeometry(0.09, 1.04, 0.09, 3, 0.018), metal, g, x + a * 0.46, 0.575, z + b * 0.46);
        for (const side of [-1, 1]) {
          this.mesh(new RoundedBoxGeometry(0.98, 0.075, 0.085, 3, 0.018), metal, g, x, 1.075, z + side * 0.46);
          this.mesh(new RoundedBoxGeometry(0.085, 0.075, 0.98, 3, 0.018), metal, g, x + side * 0.46, 1.075, z);
        }
        this.pistonArrow(piston, state, g, x, 1.125, z);
        const rod = this.mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.8, 24), metal, g, x, 0.54, z);
        if (piston.direction % 2 === 0) rod.rotation.z = Math.PI / 2; else rod.rotation.x = Math.PI / 2;
        rod.userData.base = new THREE.Vector3(x, 0.54, z); this.pistonRods.push({ rod, target: piston.expanded ? 1 : 0.02, direction: piston.direction });
      }
      const head = state.pistons?.find(p => p.headKey === cell.key && p.expanded);
      if (head) {
        const d = delta[head.direction], horizontal = head.direction % 2 === 1;
        this.mesh(new RoundedBoxGeometry(horizontal ? 0.8 : 0.065, 0.8, horizontal ? 0.065 : 0.8, 3, 0.025), new THREE.MeshPhysicalMaterial({ color: '#abc2cd', metalness: 0.85, roughness: 0.23 }), g, x + d[0] * 0.46, 0.53, z + d[1] * 0.46);
      }
    }
    if (fixed) {
      const steel = new THREE.MeshPhysicalMaterial({ color: '#d3dadd', metalness: 0.85, roughness: 0.3 });
      const slot = new THREE.MeshBasicMaterial({ color: '#46515b' });
      const anchors = fixedAnchorPoints(cells, exterior ? this.level : undefined);
      const heads = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.054, 0.054, 0.025, 6), steel, anchors.length);
      const slots = new THREE.InstancedMesh(new THREE.BoxGeometry(0.065, 0.003, 0.009), slot, anchors.length), matrix = new THREE.Matrix4();
      anchors.forEach((p, i) => {
        heads.setMatrixAt(i, matrix.makeTranslation(p.x - root.x, height + 0.071, p.y - root.y));
        slots.setMatrixAt(i, matrix.makeTranslation(p.x - root.x, height + 0.085, p.y - root.y));
      });
      heads.receiveShadow = slots.receiveShadow = true; g.add(heads, slots);
    }
    if (cells.some(c => !c.storesHeat)) {
      // Thermal barriers occlude transmitted light; surface decorations stay outside the refraction buffer.
      const deferred = new Map<THREE.Material, THREE.Material>();
      g.traverse(object => {
        if (!(object instanceof THREE.Mesh) || object.userData.bodySurface) return;
        const defer = (material: THREE.Material) => {
          if (material.transparent || material.userData.transmissionBarrier || (material as THREE.MeshPhysicalMaterial).transmission > 0) return material;
          if (!deferred.has(material)) { const copy = material.clone(); copy.transparent = true; deferred.set(material, copy); }
          return deferred.get(material)!;
        };
        object.material = Array.isArray(object.material) ? object.material.map(defer) : defer(object.material);
        object.userData.transmissiveOnly = true;
      });
    }
    g.traverse(object => { object.updateMatrix(); object.matrixAutoUpdate = object === g || !!object.userData.base; });
    return g;
  }

  private pistonArrow(piston: Piston, state: State, parent: THREE.Group, x: number, y: number, z: number): void {
    const forward = directions[piston.expanded ? piston.direction : opposite(piston.direction)];
    const group = new THREE.Group(); group.position.set(x, y, z); parent.add(group);
    group.rotation.y = Math.atan2(forward.x, forward.y); group.userData.pistonArrow = true;
    const ink = new THREE.MeshBasicMaterial({ color: '#000000' });
    const points = [new THREE.Vector3(-0.085, 0, -0.09), new THREE.Vector3(0, 0, 0.09), new THREE.Vector3(0.085, 0, -0.09)];
    if (state.cells.some(c => c.container === piston.baseKey) || state.players.some(p => p.container === piston.baseKey)) {
      const triangle = new THREE.Shape(points.map(p => new THREE.Vector2(p.x, -p.z)));
      const geometry = new THREE.ShapeGeometry(triangle); geometry.rotateX(-Math.PI / 2);
      this.mesh(geometry, ink, group);
    } else for (let i = 0; i < 2; i++) {
      const path = new THREE.LineCurve3(points[i], points[i + 1]); this.mesh(new THREE.TubeGeometry(path, 1, 0.014, 8, false), ink, group);
    }
  }

  private syncBodies(state: State, snap: boolean, reuse = false): void {
    const rendered = new Map<number, { x: number; y: number }>();
    const anchors = new Map<number, THREE.Vector3>();
    const byKey = reuse ? new Map(state.cells.map(cell => [cell.key, cell])) : undefined;
    const retained = reuse ? [...this.pieces.values()].map(group => (group.userData.cellKeys as number[]).map(key => byKey!.get(key)!)) : [];
    if (reuse && retained.some(cells => {
      const data = this.pieces.get(cells[0].key)!.userData;
      return data.uniform && cells.some(cell => cell.temperature !== cells[0].temperature) ||
        data.materialRegions && surfaceMaterialRegions(cells).some((region, i) => region !== data.materialRegions[i]);
    })) reuse = false;
    if (!reuse) for (const group of this.pieces.values()) {
      const cells = group.userData.renderCells as Cell[], root = cells[0];
      for (const cell of cells) {
        rendered.set(cell.key, {
          x: group.position.x + (this.level!.width - 1) / 2 + cell.x - root.x,
          y: group.position.z + (this.level!.height - 1) / 2 + cell.y - root.y,
        });
        anchors.set(cell.key, group.position.clone().add(new THREE.Vector3((cell.x - root.x) * group.scale.x, 0, (cell.y - root.y) * group.scale.z)));
      }
    }
    const plan = reuse ? { groups: retained, merging: false } : snap ? { groups: bodies(state.cells).map(cells => cells.sort((a, b) => a.key - b.key)), merging: false } : motionBodies(state.cells, rendered);
    const groups = plan.groups; this.mergingBodies = plan.merging;
    const live = new Set(groups.map(cells => cells[0].key));
    const remove = (key: number, group: THREE.Group) => {
      this.labelsDirty = true;
      this.pistonRods = this.pistonRods.filter(p => p.rod.parent !== group);
      this.parts.remove(group); this.disposeGroup(group); this.pieces.delete(key); this.targets.delete(key);
    };
    for (const [key, group] of this.pieces) if (!live.has(key)) remove(key, group);
    for (const cells of groups) {
      if (reuse) continue;
      const root = cells[0];
      const signature = JSON.stringify(cells.map(c => {
        const p = state.pistons?.find(p => p.baseKey === c.key || p.headKey === c.key);
        return [c.key, c.x - root.x, c.y - root.y, c.edges, c.fixed, c.storesHeat, c.heatCapacity, c.container, c.portal,
          p && [p.baseKey, p.expanded, state.cells.some(child => child.container === p.baseKey) || state.players.some(child => child.container === p.baseKey)]];
      }));
      const uniform = cells.every(c => c.temperature === root.temperature && c.storesHeat === root.storesHeat);
      const existing = this.pieces.get(root.key);
      const repartition = existing?.userData.materialRegions && surfaceMaterialRegions(cells).some((region, i) => region !== existing.userData.materialRegions[i]);
      if (!existing || existing.userData.signature !== signature || existing.userData.uniform && !uniform || repartition) {
        const position = anchors.get(root.key);
        if (existing) remove(root.key, existing);
        const group = this.makeBody(cells, state);
        this.labelsDirty = true;
        group.userData.signature = signature;
        group.scale.setScalar(Math.pow(0.72, depth(root, state.cells)));
        const target = new THREE.Vector3(root.x - (this.level!.width - 1) / 2, 0, root.y - (this.level!.height - 1) / 2);
        group.position.copy(!snap && position ? position : target);
        this.parts.add(group); this.pieces.set(root.key, group);
      }
    }
    for (const cells of groups) {
      const root = cells[0], group = this.pieces.get(root.key)!;
      group.userData.renderCells = cells;
      const target = new THREE.Vector3(root.x - (this.level!.width - 1) / 2, 0, root.y - (this.level!.height - 1) / 2);
      this.targets.set(root.key, target); if (snap) group.position.copy(target);
      const thermalSignature = cells.map(c => c.temperature).join(',');
      if (group.userData.thermalSignature === thermalSignature) continue;
      group.userData.thermalSignature = thermalSignature;
      const materialIndices = surfaceMaterialRegions(cells);
      if (!group.userData.uniform) group.children.forEach(object => {
        if (object instanceof THREE.Mesh && object.userData.bodySurface) batchSurfaceGroups(object.geometry, materialIndices);
      });
      group.children.forEach(object => {
        if (object instanceof THREE.Mesh && object.userData.bodySurface) prepareSurfacePicking(object.geometry);
      });
      const materials = group.userData.materials as THREE.MeshPhysicalMaterial[], fixed = cells.some(c => c.fixed);
      materials.forEach((m, i) => this.paint(m, group.userData.uniform ? root : cells[i], fixed));
      const layer = group.userData.surfaceLayer as THREE.BufferGeometry | undefined;
      if (layer) {
        const positions = layer.getAttribute('position'), colors = layer.getAttribute('color'), ownerKeys = layer.getAttribute('ownerKey'), color = new THREE.Color();
        let owners = group.userData.layerOwners as number[] | undefined;
        if (!owners) {
          owners = [];
          const ownerIndices = new Map(cells.map((cell, index) => [cell.key, index]));
          for (let i = 0; i < positions.count; i += 3) {
            const x = (positions.getX(i) + positions.getX(i + 1) + positions.getX(i + 2)) / 3 + root.x;
            const y = (positions.getZ(i) + positions.getZ(i + 1) + positions.getZ(i + 2)) / 3 + root.y;
            const owner = ownerIndices.get(ownerKeys.getX(i)) ?? -1;
            owners.push(owner >= 0 ? owner : cells.reduce((best, c, index) => Math.hypot(c.x - x, c.y - y) < Math.hypot(cells[best].x - x, cells[best].y - y) ? index : best, 0));
          }
          group.userData.layerOwners = owners;
        }
        for (let i = 0; i < positions.count; i += 3) {
          color.set(thermalColor(cells[owners[i / 3]].temperature));
          for (let j = 0; j < 3; j++) colors.setXYZ(i + j, color.r, color.g, color.b);
        }
        colors.needsUpdate = true;
      }
      const rim = group.userData.glassRim as { material: THREE.MeshPhysicalMaterial; cellKey: number } | undefined;
      if (rim) {
        const cell = cells.find(c => c.key === rim.cellKey)!;
        rim.material.color.set(cell.temperature === 0 ? '#58666f' : thermalColor(cell.temperature));
      }
    }
  }

  load(level: Level, state: State, labels: ReturnType<typeof levelLabels>, preserveCamera = false): void {
    this.performanceMonitor.setScene(level.id);
    this.shadowBounds = undefined;
    preserveCamera ||= this.level?.id === level.id;
    this.cancelMotionWaits();
    if (preserveCamera) this.stopCameraInertia();
    this.hoverEvent = undefined; this.onHover?.(null);
    this.scene.remove(this.board);
    if (this.level) this.boardCache.set(this.level, {
      board: this.board, parts: this.parts, pieces: this.pieces, targets: this.targets,
      demons: this.demons, rods: this.pistonRods, grids: this.gridMeshes, notes: this.noteMarkers,
    });
    else this.disposeBoard();
    const cached = this.boardCache.get(level);
    this.boardCache.delete(level);
    while (this.boardCache.size > 2) {
      const oldest = this.boardCache.keys().next().value!;
      this.disposeGroup(this.boardCache.get(oldest)!.board); this.boardCache.delete(oldest);
    }
    this.board = new THREE.Group(); this.scene.add(this.board); this.level = level;
    this.pieces = new Map(); this.targets = new Map(); this.pistonRods = []; this.gridMeshes = []; this.noteMarkers = [];
    this.parts = new THREE.Group(); this.board.add(this.parts); this.labels = labels; this.shownState = state;
    const w = level.width, h = level.height;
    const lightDirection = new THREE.Vector3(-9, 16, 7).normalize();
    this.sun.position.copy(lightDirection.multiplyScalar(Math.hypot(w, h) + 20));
    this.sun.updateMatrixWorld(true);
    this.sun.shadow.updateMatrices(this.sun);
    fitShadowCamera(this.sun.shadow.camera, new THREE.Box3(
      new THREE.Vector3(-w / 2 - 1.2, -0.6, -h / 2 - 1.2),
      new THREE.Vector3(w / 2 + 1.2, 1.8, h / 2 + 1.2),
    ));
    if (cached) {
      this.scene.remove(this.board);
      this.board = cached.board; this.parts = cached.parts; this.pieces = cached.pieces; this.targets = cached.targets;
      this.demons = cached.demons; this.pistonRods = cached.rods; this.gridMeshes = cached.grids; this.noteMarkers = cached.notes;
      this.scene.add(this.board);
      this.setDiscoveredLevels(this.visited, true);
      this.parts.traverse(object => { if (object.userData.pistonNumber) object.visible = this.pistonNumbers; });
      this.update(state, true);
      if (!preserveCamera) this.resetCamera();
      this.resize(); return;
    }
    const platform = this.mesh(new RoundedBoxGeometry(w + 0.55, 0.45, h + 0.55, 4, 0.16), this.physical('#f5f3ec'), this.board, 0, -0.205, 0);
    platform.receiveShadow = true;
    this.mesh(new RoundedBoxGeometry(w + 0.65, 0.12, h + 0.65, 3, 0.12), this.physical('#928a7e'), this.board, 0, -0.425, 0);
    const floorMaterial = this.physical(palette.floor); floorMaterial.roughness = 0.9; floorMaterial.clearcoat = 0.06; floorMaterial.metalness = 0;
    const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.985, 0.05, 0.985), floorMaterial, w * h);
    const matrix = new THREE.Matrix4();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { matrix.makeTranslation(x - (w - 1) / 2, 0.025, y - (h - 1) / 2); tiles.setMatrixAt(y * w + x, matrix); }
    tiles.receiveShadow = true; this.board.add(tiles);
    const floorGrid = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#9ca2a2', depthWrite: false }), w + h + 2);
    for (let x = 0; x <= w; x++) { matrix.makeScale(0.016, 1, h); matrix.setPosition(x - w / 2, 0.053, 0); floorGrid.setMatrixAt(x, matrix); }
    for (let y = 0; y <= h; y++) { matrix.makeScale(w, 1, 0.016); matrix.setPosition(0, 0.053, y - h / 2); floorGrid.setMatrixAt(w + 1 + y, matrix); }
    floorGrid.userData.transmissiveOnly = true;
    this.board.add(floorGrid);
    for (const spawn of spawnPoints(level)) {
      const g = new THREE.Group(); g.position.set(spawn.x - (w - 1) / 2, 0.056, spawn.y - (h - 1) / 2);
      g.userData.spawnPoint = spawn; this.board.add(g);
      const ink = new THREE.MeshBasicMaterial({ color: '#515960', transparent: true, depthWrite: false });
      for (const geometry of [new THREE.RingGeometry(0.245, 0.27, 64), new THREE.CircleGeometry(0.035, 20)]) {
        geometry.rotateX(-Math.PI / 2);
        const mark = this.mesh(geometry, ink, g); mark.castShadow = mark.receiveShadow = false; mark.userData.transmissiveOnly = true;
      }
    }
    for (const goal of level.goals) {
      if (goal.x < 0 || goal.y < 0 || goal.x >= w || goal.y >= h) continue;
      const g = new THREE.Group(); g.position.set(goal.x - (w - 1) / 2, 0, goal.y - (h - 1) / 2); this.board.add(g);
      const hexagon = (radius: number) => Array.from({ length: 6 }, (_, i) => {
        const angle = i * Math.PI / 3; return new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius);
      });
      const shape = new THREE.Shape(hexagon(0.355)); shape.closePath();
      const hole = new THREE.Path(hexagon(0.316).reverse()); hole.closePath(); shape.holes.push(hole);
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.016, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2, steps: 1 });
      geometry.rotateX(-Math.PI / 2);
      const frame = this.mesh(geometry, new THREE.MeshBasicMaterial({ color: '#3478d4' }), g, 0, 0.059, 0);
      frame.castShadow = false; frame.receiveShadow = false; frame.userData.goal = true;
    }
    const grid = new THREE.GridHelper(Math.max(w, h), Math.max(w, h), '#7e898e', '#aab2b6'); grid.position.y = 0.054; grid.visible = false; this.board.add(grid); this.gridMeshes.push(grid);
    for (const note of level.notes ?? []) {
      const marker = this.mesh(new THREE.PlaneGeometry(0.55, 0.55), new THREE.MeshBasicMaterial({ map: labelTexture('i'), transparent: true, depthWrite: false }), this.board, note.x - (w - 1) / 2, 0.082, note.y - (h - 1) / 2);
      marker.rotation.x = -Math.PI / 2; marker.castShadow = false; marker.userData.note = note.text; this.noteMarkers.push(marker);
    }
    this.demons = [];
    this.update(state, true);
    if (!preserveCamera) this.resetCamera();
    this.resize();
  }

  update(state: State, snap = false, activity: 'idle' | 'walking' | 'pushing' | 'resolving' = 'idle', duration?: number): void {
    if (!this.level) return;
    this.dirty = true;
    this.cancelMotionWaits();
    const { width: w, height: h } = this.level;
    const previous = this.shownState, positions = new Map(previous?.cells.map(c => [c.key, c]) ?? []);
    const moved = !previous || state.cells.some(c => { const p = positions.get(c.key); return !p || c.x !== p.x || c.y !== p.y || c.container !== p.container; }) ||
      state.players.some((p, i) => p.x !== previous.players[i]?.x || p.y !== previous.players[i]?.y || p.container !== previous.players[i]?.container) ||
      state.pistons?.some(p => p.expanded !== previous.pistons?.find(old => old.baseKey === p.baseKey)?.expanded);
    const reuse = !snap && this.pieces.size > 0 && !this.mergingBodies && previous?.levelId === state.levelId &&
      state.cells.length === previous.cells.length && state.cells.every((cell, i) => {
        const old = previous.cells[i];
        return cell.key === old.key && cell.x === old.x && cell.y === old.y && cell.edges === old.edges && cell.fixed === old.fixed &&
          cell.storesHeat === old.storesHeat && cell.heatCapacity === old.heatCapacity && cell.container === old.container &&
          cell.portal?.target === old.portal?.target && cell.portal?.shortcut === old.portal?.shortcut;
      }) && state.players.length === previous.players.length && state.players.every((player, i) => player.container === previous.players[i].container) &&
      (state.pistons?.length ?? 0) === (previous.pistons?.length ?? 0) && (state.pistons ?? []).every((piston, i) => {
        const old = previous.pistons![i];
        return piston.baseKey === old.baseKey && piston.headKey === old.headKey && piston.expanded === old.expanded && piston.direction === old.direction && piston.model === old.model && piston.order === old.order;
      });
    this.shownState = state; this.activity = activity; this.syncBodies(state, snap, reuse);
    this.shadowDirty ||= !reuse;
    this.labelPositionsDirty ||= !reuse || snap;
    if (this.labelsDirty) this.rebuildLabels();
    while (this.demons.length > state.players.length) {
      const model = this.demons.pop()!; this.board.remove(model.group); this.disposeGroup(model.group);
    }
    while (this.demons.length < state.players.length) {
      const model = this.makeDemon(); this.demons.push(model); this.board.add(model.group);
    }
    state.players.forEach((player, i) => {
      const model = this.demons[i];
      model.group.scale.setScalar(Math.pow(0.72, depth(player, state.cells)));
      model.target.set(player.x - (w - 1) / 2, 0.055, player.y - (h - 1) / 2);
      if (snap) { model.group.rotation.set(0, 0, 0); model.group.position.copy(model.target); }
      model.temperature = player.temperature; model.awake = player.awake !== false;
      model.material.color.set(player.temperature === 0 ? palette.demon : thermalColor(player.temperature));
    });
    this.pistonRods.forEach(p => {
      const group = p.rod.parent!, piston = state.pistons?.find(a => group.userData.cellKeys.includes(a.baseKey));
      p.target = piston?.expanded ? 1 : 0.02; if (snap) p.rod.scale.y = p.target;
    });
    if (snap || moved || duration !== undefined) {
      this.motionDuration = duration ?? (state.pistons?.some(p => p.expanded !== previous?.pistons?.find(old => old.baseKey === p.baseKey)?.expanded) ? animationTiming.piston : animationTiming.move);
      this.lastStep = performance.now();
    }
    if (this.hoverEvent) this.hover(this.hoverEvent);
  }

  setDiscoveredLevels(ids: Iterable<string>, force = false): void {
    const visited = new Set(ids);
    if (!force && visited.size === this.visited.size && [...visited].every(id => this.visited.has(id))) return;
    this.dirty = true;
    this.visited = visited;
    this.parts.traverse(object => {
      const cell = object.userData.portalCell as Cell | undefined;
      if (!cell || !(object instanceof THREE.Mesh)) return;
      const label = portalPresentation(cell, this.labels, visited);
      if (label.locked === object.userData.locked) return;
      const material = object.material as THREE.MeshBasicMaterial;
      material.map?.dispose(); material.map = labelTexture(label.text, label.weight, label.ink, label.locked);
      object.userData.locked = label.locked;
      this.labelsDirty = true;
    });
  }

  private rebuildLabels(): void {
    const previous = this.board.userData.labelBatch as ReturnType<typeof labelBatch> | undefined;
    if (previous) { this.board.remove(previous.mesh); this.disposeGroup(new THREE.Group().add(previous.mesh)); }
    const labels: THREE.Mesh[] = [];
    this.parts.traverse(object => { if (object instanceof THREE.Mesh && object.userData.labelKey !== undefined) labels.push(object); });
    const batch = labels.length ? labelBatch(labels) : undefined;
    this.board.userData.labelBatch = batch;
    if (batch) this.board.add(batch.mesh);
    this.labelsDirty = false; this.labelPositionsDirty = false;
  }

  animatePortal(points: { x: number; y: number }[], emerging = false): Promise<boolean> {
    this.cancelMotionWaits();
    if (!this.level) return Promise.resolve(false);
    this.demons.forEach((model, i) => {
      const point = points[i]; if (!point) return;
      const position = new THREE.Vector3(point.x - (this.level!.width - 1) / 2, 0.055, point.y - (this.level!.height - 1) / 2);
      if (emerging) model.group.position.copy(position); else model.target.copy(position);
    });
    this.lastStep = performance.now();
    this.portalMotion = { start: this.lastStep, duration: animationTiming.portal, from: this.demons.map(model => model.group.position.clone()), to: this.demons.map(model => model.target.clone()) };
    return this.whenSettled();
  }

  whenSettled(): Promise<boolean> { return new Promise(resolve => { this.motionWaiters.push(resolve); }); }
  cancelMotionWaits(): void { this.portalMotion = undefined; this.motionWaiters.splice(0).forEach(resolve => resolve(false)); }

  setFreeView(enabled: boolean): void {
    if (this.freeView === enabled) return;
    this.stopCameraInertia(); this.freeView = enabled;
    this.controls.enableDamping = enabled;
    this.controls.enablePan = enabled;
    if (!enabled) {
      const focus = this.characterFocus();
      const offset = this.camera.position.clone().sub(this.controls.target);
      this.controls.target.copy(focus); this.camera.position.copy(focus).add(offset);
    }
  }

  togglePistonNumbers(): boolean { this.dirty = true; this.pistonNumbers = !this.pistonNumbers; this.parts.traverse(object => { if (object.userData.pistonNumber) object.visible = this.pistonNumbers; }); return this.pistonNumbers; }

  setTilt(degrees: number): void { if (this.tilt === degrees) return; this.tilt = degrees; this.resetCamera(); }
  setGrid(visible: boolean): void { this.gridMeshes.forEach(m => { if (m.visible !== visible) this.dirty = true; m.visible = visible; }); }
  setQuality(high: boolean): void {
    this.highQuality = high;
    this.ao.enabled = high;
    const ratio = renderPixelRatio(devicePixelRatio, high);
    this.renderer.setPixelRatio(ratio); this.resize();
  }
  setExposure(exposure: number): void { this.dirty = true; this.renderer.toneMappingExposure = exposure; }
  togglePerformanceMonitor(): boolean { return this.performanceMonitor.toggle(); }
  private stopCameraInertia(): void {
    const position = this.camera.position.clone(), target = this.controls.target.clone();
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false; this.controls.update();
    this.camera.position.copy(position); this.controls.target.copy(target); this.controls.update();
    this.controls.enableDamping = damping;
  }
  resetCamera(): void {
    this.stopCameraInertia();
    const angle = THREE.MathUtils.degToRad(this.tilt), yaw = THREE.MathUtils.degToRad(this.azimuth);
    const clip = orthographicDepth(this.level?.width ?? 9, this.level?.height ?? 8, exteriorHalfExtent);
    this.camera.near = clip.near; this.camera.far = clip.far;
    this.controls.target.copy(this.characterFocus());
    this.camera.position.set(clip.distance * Math.sin(angle) * Math.sin(yaw), clip.distance * Math.cos(angle), clip.distance * Math.sin(angle) * Math.cos(yaw)).add(this.controls.target);
    this.camera.zoom = 1; this.camera.lookAt(this.controls.target); this.controls.update(); this.resize();
  }

  private resize(): void {
    const width = this.host.clientWidth, height = this.host.clientHeight; if (!width || !height) return;
    this.dirty = true;
    this.renderer.setSize(width, height);
    const aspect = width / height, w = this.level?.width ?? 9, h = this.level?.height ?? 8;
    const yaw = THREE.MathUtils.degToRad(this.azimuth), tilt = THREE.MathUtils.degToRad(this.tilt);
    const vertical = cameraHalfHeight(w, h, aspect, tilt, yaw);
    this.camera.left = -vertical * aspect; this.camera.right = vertical * aspect; this.camera.top = vertical; this.camera.bottom = -vertical;
    this.camera.updateProjectionMatrix();
    this.ao.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix);
    this.ao.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(this.camera.projectionMatrixInverse);
    this.renderer.getDrawingBufferSize(this.size);
    if (this.composer.readBuffer.width !== this.size.x || this.composer.readBuffer.height !== this.size.y) this.composer.setSize(this.size.x, this.size.y);
  }

  private hit(event: MouseEvent): { key?: number; portal?: string; note?: string } | undefined {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const surfaces: THREE.Object3D[] = [...this.noteMarkers];
    this.parts.traverse(object => {
      if (object.userData.bodySurface || object.userData.pickSurface || object.userData.labelKey !== undefined) surfaces.push(object);
    });
    const hit = this.raycaster.intersectObjects(surfaces, false)[0];
    if (!hit) return;
    if (hit.object.userData.note) return { note: hit.object.userData.note };
    let group: THREE.Object3D | null = hit.object;
    while (group && !group.userData.cellKeys) group = group.parent;
    const keys = group?.userData.cellKeys as number[] | undefined;
    const root = this.shownState?.cells.find(c => c.key === group?.userData.key);
    if (!group || !keys || !root) return;
    const local = group.worldToLocal(hit.point.clone());
    const cell = pickBodyCell(this.shownState!.cells.filter(c => keys.includes(c.key)), { x: local.x + root.x, y: local.z + root.y }, hit.object.userData.labelKey);
    return cell && { key: cell.key, portal: cell.portal?.target };
  }
  private hover(event: PointerEvent): void {
    if (event.buttons) { this.hoverEvent = undefined; this.hoverPending = false; this.onHover?.(null); return; }
    this.hoverEvent = event; this.hoverPending = true;
  }
  private animate(): void {
    const now = performance.now(), dt = Math.min((now - this.previousTime) / 1000, 0.1); this.previousTime = now;
    if (!this.running) return;
    this.performanceMonitor.frame(now);
    const finished = now - this.lastStep >= this.motionDuration;
    const factor = finished ? 1 : 1 - Math.exp(-36 * dt * animationTiming.move / this.motionDuration);
    this.pieces.forEach((g, key) => {
      const target = this.targets.get(key);
      if (target) {
        const moved = !g.position.equals(target); this.shadowDirty ||= moved; this.labelPositionsDirty ||= moved;
        g.position.lerp(target, factor);
      }
    });
    if (finished && this.mergingBodies && this.shownState) this.syncBodies(this.shownState, true);
    const moving = this.activity !== 'idle' && now - this.lastStep < this.motionDuration;
    const active = this.demons.filter(d => d.temperature !== 1 && d.awake), temperature = active[0]?.temperature ?? this.demons[0]?.temperature ?? 0;
    const thinking = this.demons.some(d => !d.awake && d.temperature !== 1);
    const thinkingAnimation = thinking && this.highQuality && (this.shownState?.cells.length ?? 0) < 128;
    const text = demonStatus(active.length, this.demons.length, this.activity, moving, thinking, this.shownState?.phase === 'cycling');
    const statusKey = `${temperature}:${text}`;
    if (statusKey !== this.status) { this.status = statusKey; this.onStatus?.(temperature, text); }
    for (const [index, model] of this.demons.entries()) {
      const hot = model.temperature === 1, inThought = !hot && !model.awake;
      if (this.portalMotion) {
        const t = Math.min(1, (now - this.portalMotion.start) / this.portalMotion.duration);
        model.group.position.lerpVectors(this.portalMotion.from[index], this.portalMotion.to[index], t * t * (3 - 2 * t));
      } else model.group.position.lerp(model.target, factor);
      model.eyes.visible = !hot && !inThought; model.faintEyes.visible = hot; model.thinkingEyes.visible = inThought;
      model.group.position.y = 0.055;
      model.group.rotation.x = 0;
      model.group.rotation.z = THREE.MathUtils.lerp(model.group.rotation.z, inThought && thinkingAnimation ? Math.sin(now * 0.0015) * 0.06 : 0, factor);
    }
    this.pistonRods.forEach(p => {
      this.shadowDirty ||= p.rod.scale.y !== p.target;
      p.rod.scale.y = THREE.MathUtils.lerp(p.rod.scale.y, p.target, factor);
      p.rod.position.copy(p.rod.userData.base); const d = [[-1, 0], [0, 1], [1, 0], [0, -1]][p.direction];
      p.rod.position.x += d[0] * (0.35 + p.rod.scale.y * 0.4); p.rod.position.z += d[1] * (0.35 + p.rod.scale.y * 0.4);
    });
    if (!this.freeView) {
      const focus = this.characterFocus();
      this.camera.position.add(focus.clone().sub(this.controls.target)); this.controls.target.copy(focus);
    }
    this.controls.update();
    const cameraFacing = this.camera.getWorldQuaternion(new THREE.Quaternion());
    for (const model of this.demons) {
      model.group.updateWorldMatrix(true, false);
      model.face.quaternion.copy(model.group.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(cameraFacing));
    }
    const animating = !finished || !!this.portalMotion || thinkingAnimation || this.mergingBodies;
    if (this.labelsDirty) this.rebuildLabels();
    if (this.labelPositionsDirty) { this.board.userData.labelBatch?.update(); this.labelPositionsDirty = false; }
    const detailed = this.highQuality && !animating && now >= this.detailResumeAt;
    if (this.ao.enabled !== detailed) { this.ao.enabled = detailed; this.dirty = true; }
    if (this.dirty || animating) {
      if (this.level) {
        const { width, height } = this.level;
        const bounds = visibleShadowBounds(this.camera, new THREE.Box3(
          new THREE.Vector3(-width / 2 - 1.2, -0.6, -height / 2 - 1.2),
          new THREE.Vector3(width / 2 + 1.2, 1.8, height / 2 + 1.2),
        ), this.sun.position);
        if (!this.shadowBounds?.containsBox(bounds)) {
          const size = bounds.getSize(new THREE.Vector3());
          bounds.min.x -= Math.max(2, size.x * 0.25); bounds.max.x += Math.max(2, size.x * 0.25);
          bounds.min.z -= Math.max(2, size.z * 0.25); bounds.max.z += Math.max(2, size.z * 0.25);
          fitShadowCamera(this.sun.shadow.camera, bounds);
          this.shadowBounds = bounds; this.shadowDirty = true;
        }
      }
      this.renderer.shadowMap.needsUpdate = this.shadowDirty;
      this.performanceMonitor.beginRender();
      try { this.composer.render(); } finally { this.performanceMonitor.endRender(); }
      this.dirty = animating; this.shadowDirty = false;
    }
    if (this.portalMotion && now - this.portalMotion.start >= this.portalMotion.duration) this.portalMotion = undefined;
    if (this.motionWaiters.length && !this.portalMotion) {
      const distances = [...this.pieces].map(([key, group]) => group.position.distanceTo(this.targets.get(key)!));
      distances.push(...this.demons.map(d => Math.hypot(d.group.position.x - d.target.x, d.group.position.z - d.target.z)));
      distances.push(...this.pistonRods.map(p => Math.abs(p.rod.scale.y - p.target)));
      if (motionSettled(now - this.lastStep, distances)) this.motionWaiters.splice(0).forEach(resolve => resolve(true));
    }
    if (this.hoverPending && this.hoverEvent && !animating && now - this.lastHover >= 100) {
      this.lastHover = now; this.hoverPending = false;
      const hit = this.hit(this.hoverEvent); this.onHover?.(hit?.key ?? null, this.shownState);
    }
  }
  private disposeBoard(): void {
    this.disposeGroup(this.board);
  }
  private disposeGroup(group: THREE.Group): void {
    const materials = new Set<THREE.Material>(), geometries = new Set<THREE.BufferGeometry>();
    group.traverse(o => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) { geometries.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); }
    });
    geometries.forEach(g => g.dispose()); materials.forEach(m => {
      if (m === this.adhesiveMaterial || m === this.demonShadowMaterial) return;
      const material = m as THREE.MeshStandardMaterial;
      for (const texture of [material.map, material.normalMap, material.roughnessMap]) if (texture && !this.sharedTextures.has(texture)) texture.dispose();
      m.dispose();
    });
  }
}
