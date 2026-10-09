import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { bodies } from './engine';
import { bodyLayerGeometry, bodySurfaceGeometries, fixedAnchorPoints } from './body-geometry';
import { fitShadowCamera, renderPixelRatio } from './render-quality';
import { adhesiveTexture } from './surface-materials';
import { glassRimGeometry } from './glass-geometry';
import { SurfaceSSAOPass } from './surface-ao';
import { cameraHalfHeight, demonStatus, followFocus, motionSettled } from './view-state';
import { exteriorPlainGeometry } from './terrain-geometry';
import type { Cell, Level, State, Temperature } from './types';

const palette = { wall: '#69747e', neutral: '#89949e', hot: '#d94e28', cold: '#298fcd', demon: '#8998a3', floor: '#b8b8ad', ink: '#263e39' };
const thermalColor = (t: Temperature) => t === 1 ? palette.hot : t === -1 ? palette.cold : t === 2 ? '#55a779' : palette.neutral;

interface DemonVisual {
  group: THREE.Group; target: THREE.Vector3; material: THREE.MeshStandardMaterial; temperature: Temperature;
  face: THREE.Group; eyes: THREE.Group; faintEyes: THREE.Group;
}

function labelTexture(text: string, dark = false): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!; ctx.font = '600 45px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = dark ? '#f0ebdc' : '#294842'; ctx.fillText(text, 64, 66);
  return new THREE.CanvasTexture(canvas);
}

export class GameScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-8, 8, 8, -8, 0.1, 250);
  readonly controls: OrbitControls;
  private readonly composer: EffectComposer;
  private readonly ao: SurfaceSSAOPass;
  private readonly sun = new THREE.DirectionalLight('#fff6e8', 2.5);
  private board = new THREE.Group();
  private pieces = new Map<number, THREE.Group>();
  private demons: DemonVisual[] = [];
  private readonly adhesiveMaterial = new THREE.MeshPhysicalMaterial({ map: adhesiveTexture(), vertexColors: true, roughness: 0.38, metalness: 0.12, clearcoat: 0.4, transparent: true, opacity: 1, alphaTest: 0.12, alphaToCoverage: true, depthWrite: false });
  private parts = new THREE.Group();
  private bodySignature = '';
  private labels = new Map<string, string>();
  private shownState?: State;
  private activity: 'idle' | 'walking' | 'pushing' | 'resolving' = 'idle';
  private pistonRods: { rod: THREE.Mesh; target: number; direction: number }[] = [];
  private level?: Level;
  private previousTime = performance.now();
  private targets = new Map<number, THREE.Vector3>();
  private lastStep = 0;
  private rings: THREE.Mesh[] = [];
  private goalLights: THREE.PointLight[] = [];
  private gridMeshes: THREE.Object3D[] = [];
  private raycaster = new THREE.Raycaster();
  private noteMarkers: THREE.Object3D[] = [];
  private pointer = new THREE.Vector2();
  private size = new THREE.Vector2();
  private tilt = 32;
  private azimuth = -9;
  private running = true;
  private freeView = false;
  private thinking = false;
  private motionWaiters: ((settled: boolean) => void)[] = [];
  private exteriorMaterial?: THREE.MeshPhysicalMaterial;
  private exteriorCellKey?: number;
  onHover?: (cellKey: number | null) => void;
  onPortalClick?: (target: string) => void;
  onNoteClick?: (text: string) => void;
  onStatus?: (temperature: Temperature, status: string) => void;
  private status = '';

  setThinking(thinking: boolean): void { this.thinking = thinking; }

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(renderPixelRatio(devicePixelRatio, true));
    this.adhesiveMaterial.map!.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor('#162523', 0);
    this.renderer.domElement.setAttribute('aria-label', '三维关卡棋盘，使用方向键或 WASD 移动');
    this.host.append(this.renderer.domElement);
    const pmrem = new THREE.PMREMGenerator(this.renderer), environment = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(environment, 0.04).texture; environment.dispose(); pmrem.dispose();
    this.scene.environmentIntensity = 0.65;
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.08;
    this.controls.enablePan = this.controls.enableRotate = false; this.controls.minZoom = 0.3; this.controls.maxZoom = 5;
    this.controls.minPolarAngle = 0.02; this.controls.maxPolarAngle = Math.PI * 0.44;
    this.controls.mouseButtons = { LEFT: null as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.touches.ONE = THREE.TOUCH.ROTATE;

    this.scene.add(new THREE.HemisphereLight('#ecf1de', '#597d78', 1.1));
    const sun = this.sun; sun.position.set(-9, 16, 7); sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.normalBias = 0.035; sun.shadow.bias = -0.00015; sun.shadow.radius = 3; this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#a4d4e3', 0.8); fill.position.set(7, 10, -10); this.scene.add(fill);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.23 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.58; ground.receiveShadow = true; this.scene.add(ground);
    const renderTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, renderTarget);
    this.composer.setPixelRatio(1);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = new SurfaceSSAOPass(this.scene, this.camera, 1, 1, 16); this.ao.kernelRadius = 0.16; this.ao.minDistance = 0.001; this.ao.maxDistance = 0.1;
    this.ao.ssaoMaterial.defines.PERSPECTIVE_CAMERA = 0;
    this.ao.depthRenderMaterial.defines.PERSPECTIVE_CAMERA = 0;
    this.composer.addPass(this.ao);
    this.composer.addPass(new SMAAPass());
    this.composer.addPass(new OutputPass());
    this.scene.add(this.board);
    new ResizeObserver(() => this.resize()).observe(host);
    this.renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
    this.renderer.domElement.addEventListener('pointermove', e => this.hover(e));
    this.renderer.domElement.addEventListener('pointerleave', () => this.onHover?.(null));
    this.renderer.domElement.addEventListener('click', e => {
      const hit = this.hit(e); if (hit?.userData.portal) this.onPortalClick?.(hit.userData.portal as string);
      if (hit?.userData.note) this.onNoteClick?.(hit.userData.note as string);
    });
    document.addEventListener('visibilitychange', () => { this.running = !document.hidden; });
    this.resize(); this.renderer.setAnimationLoop(() => this.animate());
  }

  private physical(color: string, wall = false): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({ color, roughness: wall ? 0.72 : 0.38, metalness: wall ? 0.08 : 0.12,
      clearcoat: wall ? 0.08 : 0.4, clearcoatRoughness: 0.2 });
  }

  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Mesh {
    const object = new THREE.Mesh(geometry, material); object.position.set(x, y, z); object.castShadow = true; object.receiveShadow = true;
    parent.add(object); return object;
  }

  private makeDemon(): DemonVisual {
    const group = new THREE.Group(), face = new THREE.Group(), eyes = new THREE.Group(), faintEyes = new THREE.Group();
    const matte = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, envMapIntensity: 0 });
    const material = matte(palette.demon), ink = new THREE.MeshBasicMaterial({ color: '#263039' });
    face.position.y = 0.56; group.add(face); face.add(eyes, faintEyes);
    this.mesh(new THREE.SphereGeometry(0.48, 40, 32), material, group, 0, 0.56, 0);
    const stroke = (points: number[][], parent: THREE.Group, radius = 0.014) => {
      const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p as [number, number, number])), false, 'centripetal');
      const line = this.mesh(new THREE.TubeGeometry(curve, points.length * 12, radius, 8, false), ink, parent); line.castShadow = false; return line;
    };
    const facial = (points: number[][], parent: THREE.Group) => stroke(points.map(([x, y]) => [x, y, Math.sqrt(0.48 ** 2 - x ** 2 - y ** 2) + 0.008]), parent);
    for (const side of [-1, 1]) {
      facial([[side * 0.095, 0.08], [side * 0.095, 0.23]], eyes);
      for (const slope of [-1, 1]) facial([[side * 0.12 - 0.06, 0.15 - slope * 0.06], [side * 0.12 + 0.06, 0.15 + slope * 0.06]], faintEyes);
      const horn = new THREE.CurvePath<THREE.Vector3>();
      const points = [[side * 0.21, 0.42, 0], [side * 0.4, 0.58, 0], [side * 0.35, 0.32, 0]].map(p => new THREE.Vector3(...p as [number, number, number]));
      for (let i = 0; i < points.length; i++) horn.add(new THREE.LineCurve3(points[i], points[(i + 1) % points.length]));
      const outline = this.mesh(new THREE.TubeGeometry(horn, 18, 0.013, 8, true), ink, face); outline.castShadow = false;
      stroke([[side * 0.43, 0.14, 0], [side * 0.63, 0.2, 0], [side * 0.65, 0.02, 0], [side * 0.63, -0.14, 0], [side * 0.43, -0.04, 0]], face);
    }
    stroke([[-0.26, -0.4, 0], [-0.4, -0.47, 0], [-0.48, -0.43, 0], [-0.55, -0.49, 0], [-0.64, -0.45, 0]], face, 0.013);
    faintEyes.visible = false;
    return { group, target: new THREE.Vector3(), material, temperature: 0, face, eyes, faintEyes };
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
    const height = 0.96;
    const uniform = cells.every(c => c.storesHeat === root.storesHeat && c.temperature === root.temperature);
    const materials = (uniform ? [root] : cells).map(cell => {
      const material = this.physical(thermalColor(cell.temperature), fixed); this.paint(material, cell, fixed);
      if (!cell.storesHeat) {
        material.map = material.normalMap = material.roughnessMap = null;
        material.transmission = 0.96; material.thickness = 0.45; material.ior = 1.33;
        material.roughness = 0.035; material.metalness = 0; material.clearcoat = 0.6;
        material.attenuationDistance = 12; material.attenuationColor.set('#ffffff'); material.envMapIntensity = 1.1;
      }
      return material;
    });
    const surfaces = bodySurfaceGeometries(cells, height);
    for (const [kind, geometry] of Object.entries(surfaces)) {
      const core = new THREE.Mesh(geometry, materials); core.castShadow = kind === 'solid'; core.receiveShadow = true;
      core.userData.transmissiveOnly = kind === 'glass'; g.add(core);
    }
    g.userData.key = root.key; g.userData.cellKeys = cells.map(c => c.key); g.userData.materials = materials; g.userData.uniform = uniform;
    const glass = cells.filter(c => !c.storesHeat);
    if (glass.length) {
      const rimMaterial = new THREE.MeshPhysicalMaterial({ color: '#5e707c', roughness: 0.24, metalness: 0.2, transparent: true, opacity: 0.72, depthWrite: false });
      const rim = new THREE.Mesh(glassRimGeometry(cells, height), rimMaterial);
      rim.userData.transmissiveOnly = true; g.add(rim);
      g.userData.glassRim = { material: rimMaterial, cellKey: glass[0].key };
    }
    const delta = [[-1, 0], [0, 1], [1, 0], [0, -1]];
    const exterior = fixed && cells.some(c => c.x === 0 || c.y === 0 || c.x === this.level!.width - 1 || c.y === this.level!.height - 1);
    const layer = bodyLayerGeometry(cells, height, exterior ? this.level : undefined);
    if (layer.getAttribute('position').count) {
      layer.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(layer.getAttribute('position').count * 3), 3));
      g.userData.surfaceLayer = layer;
      const insulation = this.physical('#f2edda'); insulation.roughness = 0.9;
      this.mesh(layer, [insulation, this.adhesiveMaterial], g);
    } else layer.dispose();
    for (const cell of cells) {
      const x = cell.x - root.x, z = cell.y - root.y;
      if (cell.portal) {
        const mark = this.mesh(new THREE.PlaneGeometry(0.58, 0.58), new THREE.MeshBasicMaterial({ map: labelTexture(this.labels.get(cell.portal.target)?.replace('1-', '') ?? '↗', fixed), transparent: true, depthWrite: false }), g, x, height + 0.09, z);
        mark.rotation.x = -Math.PI / 2; mark.castShadow = false; mark.userData.key = cell.key; mark.userData.portal = cell.portal.target;
      }
      const piston = state.pistons?.find(p => p.baseKey === cell.key);
      if (piston) {
        const metal = new THREE.MeshPhysicalMaterial({ color: '#5f737f', metalness: 0.85, roughness: 0.26 });
        for (const a of [-1, 1]) for (const b of [-1, 1]) this.mesh(new RoundedBoxGeometry(0.09, 1.04, 0.09, 3, 0.018), metal, g, x + a * 0.46, 0.575, z + b * 0.46);
        for (const side of [-1, 1]) {
          this.mesh(new RoundedBoxGeometry(0.98, 0.075, 0.085, 3, 0.018), metal, g, x, 1.075, z + side * 0.46);
          this.mesh(new RoundedBoxGeometry(0.085, 0.075, 0.98, 3, 0.018), metal, g, x + side * 0.46, 1.075, z);
        }
        const mark = this.mesh(new THREE.PlaneGeometry(0.54, 0.54), new THREE.MeshBasicMaterial({ map: labelTexture(['←', '↓', '→', '↑'][piston.direction]), transparent: true, depthWrite: false }), g, x, 1.125, z);
        mark.rotation.x = -Math.PI / 2;
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
      for (const p of fixedAnchorPoints(cells)) {
        this.mesh(new THREE.CylinderGeometry(0.054, 0.054, 0.025, 6), steel, g, p.x - root.x, height + 0.071, p.y - root.y);
        this.mesh(new THREE.BoxGeometry(0.065, 0.003, 0.009), slot, g, p.x - root.x, height + 0.085, p.y - root.y);
      }
    }
    return g;
  }

  private syncBodies(state: State, snap: boolean): void {
    const groups = bodies(state.cells).map(cells => cells.sort((a, b) => a.key - b.key));
    const signature = JSON.stringify(groups.map(g => [g.map(c => [c.key, c.edges, c.storesHeat]), g.every(c => c.temperature === g[0].temperature && c.storesHeat === g[0].storesHeat)]));
    if (signature !== this.bodySignature) {
      const positions = new Map([...this.pieces].map(([key, g]) => [key, g.position.clone()]));
      this.board.remove(this.parts); this.disposeGroup(this.parts); this.parts = new THREE.Group(); this.board.add(this.parts);
      this.pieces.clear(); this.targets.clear(); this.pistonRods = []; this.bodySignature = signature;
      for (const cells of groups) {
        const group = this.makeBody(cells, state), root = cells[0];
        const target = new THREE.Vector3(root.x - (this.level!.width - 1) / 2, 0, root.y - (this.level!.height - 1) / 2);
        group.position.copy(!snap && positions.has(root.key) ? positions.get(root.key)! : target);
        this.parts.add(group); this.pieces.set(root.key, group);
      }
    }
    for (const cells of groups) {
      const root = cells[0], group = this.pieces.get(root.key)!;
      const target = new THREE.Vector3(root.x - (this.level!.width - 1) / 2, 0, root.y - (this.level!.height - 1) / 2);
      this.targets.set(root.key, target); if (snap) group.position.copy(target);
      const materials = group.userData.materials as THREE.MeshPhysicalMaterial[];
      materials.forEach((m, i) => this.paint(m, group.userData.uniform ? root : cells[i], cells.some(c => c.fixed)));
      const layer = group.userData.surfaceLayer as THREE.BufferGeometry | undefined;
      if (layer) {
        const positions = layer.getAttribute('position'), colors = layer.getAttribute('color'), color = new THREE.Color();
        for (let i = 0; i < positions.count; i += 3) {
          const x = (positions.getX(i) + positions.getX(i + 1) + positions.getX(i + 2)) / 3 + root.x;
          const y = (positions.getZ(i) + positions.getZ(i + 1) + positions.getZ(i + 2)) / 3 + root.y;
          const owner = cells.reduce((a, b) => Math.hypot(b.x - x, b.y - y) < Math.hypot(a.x - x, a.y - y) ? b : a);
          color.set(thermalColor(owner.temperature));
          for (let j = 0; j < 3; j++) colors.setXYZ(i + j, color.r, color.g, color.b);
        }
        colors.needsUpdate = true;
      }
      const rim = group.userData.glassRim as { material: THREE.MeshPhysicalMaterial; cellKey: number } | undefined;
      if (rim) {
        const cell = cells.find(c => c.key === rim.cellKey)!;
        rim.material.color.set(cell.temperature === 0 ? '#5e707c' : thermalColor(cell.temperature));
      }
    }
  }

  load(level: Level, state: State, labels: Map<string, string>, preserveCamera = false): void {
    this.cancelMotionWaits();
    this.scene.remove(this.board); this.disposeBoard();
    this.board = new THREE.Group(); this.scene.add(this.board); this.level = level;
    this.pieces.clear(); this.targets.clear(); this.rings = []; this.goalLights = []; this.gridMeshes = []; this.noteMarkers = [];
    this.parts = new THREE.Group(); this.board.add(this.parts); this.bodySignature = ''; this.labels = labels; this.shownState = state;
    const w = level.width, h = level.height;
    this.exteriorMaterial = undefined;
    const exterior = bodies(state.cells).find(cells => cells.some(c => c.fixed) && cells.some(c => c.x === 0 || c.y === 0 || c.x === w - 1 || c.y === h - 1));
    this.exteriorCellKey = exterior?.[0].key;
    if (exterior) {
      this.exteriorMaterial = this.physical(palette.wall, true);
      const terrain = this.mesh(exteriorPlainGeometry(w, h), this.exteriorMaterial, this.board);
      terrain.castShadow = false;
    }
    const lightDirection = new THREE.Vector3(-9, 16, 7).normalize();
    this.sun.position.copy(lightDirection.multiplyScalar(Math.hypot(w, h) + 20));
    this.sun.updateMatrixWorld(true);
    this.sun.shadow.updateMatrices(this.sun);
    fitShadowCamera(this.sun.shadow.camera, new THREE.Box3(
      new THREE.Vector3(-w / 2 - 1.2, -0.6, -h / 2 - 1.2),
      new THREE.Vector3(w / 2 + 1.2, 1.8, h / 2 + 1.2),
    ));
    const platform = this.mesh(new RoundedBoxGeometry(w + 0.55, 0.45, h + 0.55, 4, 0.16), this.physical('#e4ded0'), this.board, 0, -0.205, 0);
    platform.receiveShadow = true;
    this.mesh(new RoundedBoxGeometry(w + 0.65, 0.12, h + 0.65, 3, 0.12), this.physical('#253e37'), this.board, 0, -0.425, 0);
    const floorMaterial = this.physical(palette.floor); floorMaterial.roughness = 0.82; floorMaterial.clearcoat = 0.06;
    const tiles = new THREE.InstancedMesh(new RoundedBoxGeometry(0.985, 0.05, 0.985, 2, 0.025), floorMaterial, w * h);
    const matrix = new THREE.Matrix4();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { matrix.makeTranslation(x - (w - 1) / 2, 0.025, y - (h - 1) / 2); tiles.setMatrixAt(y * w + x, matrix); }
    tiles.receiveShadow = true; this.board.add(tiles);
    const floorGrid = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#8a948e', depthWrite: false }), w + h + 2);
    for (let x = 0; x <= w; x++) { matrix.makeScale(0.016, 1, h); matrix.setPosition(x - w / 2, 0.053, 0); floorGrid.setMatrixAt(x, matrix); }
    for (let y = 0; y <= h; y++) { matrix.makeScale(w, 1, 0.016); matrix.setPosition(0, 0.053, y - h / 2); floorGrid.setMatrixAt(w + 1 + y, matrix); }
    floorGrid.userData.transmissiveOnly = true;
    this.board.add(floorGrid);
    for (const goal of level.goals) {
      if (goal.x < 0 || goal.y < 0 || goal.x >= w || goal.y >= h) continue;
      const g = new THREE.Group(); g.position.set(goal.x - (w - 1) / 2, 0, goal.y - (h - 1) / 2); this.board.add(g);
      const plate = this.mesh(new RoundedBoxGeometry(0.83, 0.028, 0.83, 3, 0.065), new THREE.MeshStandardMaterial({ color: '#71a993', metalness: 0.55, roughness: 0.28 }), g, 0, 0.063, 0); plate.castShadow = false;
      const ring = this.mesh(new THREE.TorusGeometry(0.25, 0.018, 10, 40), new THREE.MeshStandardMaterial({ color: '#d5efb5', emissive: '#a4e393', emissiveIntensity: 1.3, roughness: 0.3 }), g, 0, 0.089, 0);
      ring.rotation.x = -Math.PI / 2; ring.castShadow = false; this.rings.push(ring);
      const center = this.mesh(new THREE.CircleGeometry(0.055, 20), new THREE.MeshBasicMaterial({ color: '#c0efab' }), g, 0, 0.09, 0); center.rotation.x = -Math.PI / 2;
      const light = new THREE.PointLight('#b5edab', 0.45, 2, 2); light.position.y = 0.3; g.add(light); this.goalLights.push(light);
    }
    const grid = new THREE.GridHelper(Math.max(w, h), Math.max(w, h), '#748b7c', '#acb4a5'); grid.position.y = 0.054; grid.visible = false; this.board.add(grid); this.gridMeshes.push(grid);
    for (const note of level.notes ?? []) {
      const marker = this.mesh(new THREE.PlaneGeometry(0.55, 0.55), new THREE.MeshBasicMaterial({ map: labelTexture('i'), transparent: true, depthWrite: false }), this.board, note.x - (w - 1) / 2, 0.082, note.y - (h - 1) / 2);
      marker.rotation.x = -Math.PI / 2; marker.castShadow = false; marker.userData.note = note.text; this.noteMarkers.push(marker);
    }
    this.demons = [];
    this.update(state, true);
    if (!preserveCamera) this.resetCamera();
    this.resize();
  }

  update(state: State, snap = false, activity: 'idle' | 'walking' | 'pushing' | 'resolving' = 'idle'): void {
    if (!this.level) return;
    this.cancelMotionWaits();
    const { width: w, height: h } = this.level;
    this.shownState = state; this.activity = activity; this.syncBodies(state, snap);
    const exteriorCell = state.cells.find(c => c.key === this.exteriorCellKey);
    if (this.exteriorMaterial && exteriorCell) this.paint(this.exteriorMaterial, exteriorCell, true);
    while (this.demons.length > state.players.length) {
      const model = this.demons.pop()!; this.board.remove(model.group); this.disposeGroup(model.group);
    }
    while (this.demons.length < state.players.length) {
      const model = this.makeDemon(); this.demons.push(model); this.board.add(model.group);
    }
    state.players.forEach((player, i) => {
      const model = this.demons[i];
      model.target.set(player.x - (w - 1) / 2, 0.055, player.y - (h - 1) / 2);
      if (snap) { model.group.rotation.set(0, 0, 0); model.group.position.copy(model.target); }
      model.temperature = player.temperature; model.material.color.set(player.temperature === 0 ? palette.demon : thermalColor(player.temperature));
    });
    this.pistonRods.forEach(p => {
      const group = p.rod.parent!, piston = state.pistons?.find(a => group.userData.cellKeys.includes(a.baseKey));
      p.target = piston?.expanded ? 1 : 0.02; if (snap) p.rod.scale.y = p.target;
    });
    this.lastStep = performance.now();
  }

  whenSettled(): Promise<boolean> { return new Promise(resolve => { this.motionWaiters.push(resolve); }); }
  cancelMotionWaits(): void { this.motionWaiters.splice(0).forEach(resolve => resolve(false)); }

  setFreeView(enabled: boolean): void {
    if (this.freeView === enabled) return;
    this.stopCameraInertia(); this.freeView = enabled;
    this.controls.enablePan = this.controls.enableRotate = enabled;
    if (!enabled) {
      const focus = this.characterFocus();
      const offset = this.camera.position.clone().sub(this.controls.target);
      this.controls.target.copy(focus); this.camera.position.copy(focus).add(offset);
    }
  }

  setTilt(degrees: number): void { if (this.tilt === degrees) return; this.tilt = degrees; this.resetCamera(); }
  setGrid(visible: boolean): void { this.gridMeshes.forEach(m => { m.visible = visible; }); }
  setQuality(high: boolean): void {
    this.ao.enabled = high;
    const ratio = renderPixelRatio(devicePixelRatio, high);
    this.renderer.setPixelRatio(ratio); this.resize();
  }
  setExposure(exposure: number): void { this.renderer.toneMappingExposure = exposure; }
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
    this.controls.target.copy(this.characterFocus());
    this.camera.position.set(25 * Math.sin(angle) * Math.sin(yaw), 25 * Math.cos(angle), 25 * Math.sin(angle) * Math.cos(yaw)).add(this.controls.target);
    this.camera.zoom = 1; this.camera.lookAt(this.controls.target); this.controls.update(); this.resize();
  }

  private resize(): void {
    const width = this.host.clientWidth, height = this.host.clientHeight; if (!width || !height) return;
    this.renderer.setSize(width, height);
    const aspect = width / height, w = this.level?.width ?? 9, h = this.level?.height ?? 8;
    const yaw = THREE.MathUtils.degToRad(this.azimuth), tilt = THREE.MathUtils.degToRad(this.tilt);
    const vertical = cameraHalfHeight(w, h, aspect, tilt, yaw);
    this.camera.left = -vertical * aspect; this.camera.right = vertical * aspect; this.camera.top = vertical; this.camera.bottom = -vertical;
    this.camera.updateProjectionMatrix();
    this.renderer.getDrawingBufferSize(this.size);
    this.composer.setSize(this.size.x, this.size.y);
  }

  private hit(event: MouseEvent): THREE.Object3D | undefined {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects([...this.pieces.values(), ...this.noteMarkers], true)[0];
    if (!hit) return;
    if (!hit.object.userData.note) {
      const x = Math.round(hit.point.x + (this.level!.width - 1) / 2), y = Math.round(hit.point.z + (this.level!.height - 1) / 2);
      const cell = this.shownState?.cells.find(c => c.x === x && c.y === y);
      hit.object.userData.key = cell?.key; hit.object.userData.portal = cell?.portal?.target;
    }
    return hit.object;
  }
  private hover(event: PointerEvent): void { const hit = this.hit(event); this.onHover?.(hit?.userData.key ?? hit?.parent?.userData.key ?? null); }
  private animate(): void {
    const now = performance.now(), dt = Math.min((now - this.previousTime) / 1000, 0.1); this.previousTime = now;
    if (!this.running) return;
    const factor = 1 - Math.exp(-22 * dt);
    this.pieces.forEach((g, key) => { const target = this.targets.get(key); if (target) g.position.lerp(target, factor); });
    const moving = this.activity !== 'idle' && now - this.lastStep < 170;
    const active = this.demons.filter(d => d.temperature !== 1), temperature = active[0]?.temperature ?? this.demons[0]?.temperature ?? 0;
    const text = demonStatus(active.length, this.demons.length, this.activity, moving, this.thinking, this.shownState?.phase === 'cycling');
    const statusKey = `${temperature}:${text}`;
    if (statusKey !== this.status) { this.status = statusKey; this.onStatus?.(temperature, text); }
    for (const model of this.demons) {
      const hot = model.temperature === 1, inThought = !hot && this.thinking;
      model.group.position.lerp(model.target, factor);
      model.group.rotation.y = Math.atan2(this.camera.position.x - model.group.position.x, this.camera.position.z - model.group.position.z);
      model.eyes.visible = !hot; model.faintEyes.visible = hot;
      model.group.position.y = 0.055 + (!hot && moving ? Math.sin((now - this.lastStep) / 170 * Math.PI) * 0.06 : 0);
      model.group.rotation.x = THREE.MathUtils.lerp(model.group.rotation.x, this.activity === 'pushing' && moving && !hot ? 0.22 : 0, factor);
      model.group.rotation.z = THREE.MathUtils.lerp(model.group.rotation.z, inThought ? Math.sin(now * 0.0015) * 0.06 : 0, factor);
      model.face.lookAt(this.camera.position);
    }
    this.pistonRods.forEach(p => {
      p.rod.scale.y = THREE.MathUtils.lerp(p.rod.scale.y, p.target, factor);
      p.rod.position.copy(p.rod.userData.base); const d = [[-1, 0], [0, 1], [1, 0], [0, -1]][p.direction];
      p.rod.position.x += d[0] * (0.35 + p.rod.scale.y * 0.4); p.rod.position.z += d[1] * (0.35 + p.rod.scale.y * 0.4);
    });
    this.rings.forEach(r => { const m = r.material as THREE.MeshStandardMaterial; m.emissiveIntensity = 0.95 + Math.sin(now * 0.002) * 0.22; });
    if (!this.freeView) {
      const focus = this.characterFocus();
      this.camera.position.add(focus.clone().sub(this.controls.target)); this.controls.target.copy(focus);
    }
    this.controls.update();
    this.composer.render();
    if (this.motionWaiters.length) {
      const distances = [...this.pieces].map(([key, group]) => group.position.distanceTo(this.targets.get(key)!));
      distances.push(...this.demons.map(d => Math.hypot(d.group.position.x - d.target.x, d.group.position.z - d.target.z)));
      distances.push(...this.pistonRods.map(p => Math.abs(p.rod.scale.y - p.target)));
      if (motionSettled(now - this.lastStep, distances)) this.motionWaiters.splice(0).forEach(resolve => resolve(true));
    }
  }
  private disposeBoard(): void {
    this.disposeGroup(this.board);
  }
  private disposeGroup(group: THREE.Group): void {
    const materials = new Set<THREE.Material>(), geometries = new Set<THREE.BufferGeometry>();
    group.traverse(o => {
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) { geometries.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); }
    });
    geometries.forEach(g => g.dispose()); materials.forEach(m => {
      if (m === this.adhesiveMaterial) return;
      const map = (m as THREE.MeshStandardMaterial).map; map?.dispose(); m.dispose();
    });
  }
}
