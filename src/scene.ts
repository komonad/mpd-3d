import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { bodies, edge } from './engine';
import type { Cell, Level, State, Temperature } from './types';

const palette = { wall: '#677a77', neutral: '#e0bb79', hot: '#f47c4f', cold: '#79c9dd', demon: '#334b46', floor: '#e1dfd2', ink: '#263e39' };
const thermalColor = (t: Temperature) => t === 1 ? palette.hot : t === -1 ? palette.cold : palette.neutral;

function grainTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!; const data = ctx.createImageData(256, 256);
  let seed = 813;
  for (let i = 0; i < data.data.length; i += 4) {
    seed = (seed * 16807) % 2147483647;
    const v = 220 + (seed % 30); data.data[i] = data.data[i + 1] = data.data[i + 2] = v; data.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0); const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
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
  private readonly ao: SSAOPass;
  private readonly bloom: UnrealBloomPass;
  private board = new THREE.Group();
  private pieces = new Map<number, THREE.Group>();
  private demon = new THREE.Group();
  private demonMaterial = new THREE.MeshPhysicalMaterial({ color: palette.demon, roughness: 0.4, clearcoat: 0.5 });
  private texture = grainTexture();
  private level?: Level;
  private previousTime = performance.now();
  private targets = new Map<number, THREE.Vector3>();
  private demonTarget = new THREE.Vector3();
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
  private quality = true;
  onHover?: (cellKey: number | null) => void;
  onPortalClick?: (target: string) => void;
  onNoteClick?: (text: string) => void;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor('#162523', 0);
    this.renderer.domElement.setAttribute('aria-label', '三维关卡棋盘，使用方向键或 WASD 移动');
    this.host.append(this.renderer.domElement);
    const pmrem = new THREE.PMREMGenerator(this.renderer), environment = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(environment, 0.04).texture; environment.dispose(); pmrem.dispose();
    this.scene.environmentIntensity = 0.4;
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.08;
    this.controls.enablePan = true; this.controls.minZoom = 0.6; this.controls.maxZoom = 2.2;
    this.controls.minPolarAngle = 0.02; this.controls.maxPolarAngle = Math.PI / 3;
    this.controls.mouseButtons = { LEFT: null as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.touches.ONE = THREE.TOUCH.ROTATE;

    this.scene.add(new THREE.HemisphereLight('#ecf1de', '#597d78', 1.1));
    const sun = new THREE.DirectionalLight('#fff0cc', 2.5); sun.position.set(-9, 16, 7); sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096); sun.shadow.camera.left = sun.shadow.camera.bottom = -34;
    sun.shadow.camera.right = sun.shadow.camera.top = 34; sun.shadow.camera.near = 1; sun.shadow.camera.far = 70;
    sun.shadow.normalBias = 0.035; sun.shadow.bias = -0.00015; sun.shadow.radius = 3; this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#a4d4e3', 0.8); fill.position.set(7, 10, -10); this.scene.add(fill);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#0a1812', roughness: 0.84, metalness: 0.12 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.58; ground.receiveShadow = true; this.scene.add(ground);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = new SSAOPass(this.scene, this.camera, 1, 1); this.ao.kernelRadius = 0.28; this.ao.minDistance = 0.001; this.ao.maxDistance = 0.18;
    this.ao.ssaoMaterial.defines.PERSPECTIVE_CAMERA = 0;
    this.ao.depthRenderMaterial.defines.PERSPECTIVE_CAMERA = 0;
    this.composer.addPass(this.ao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.1, 0.25, 2.8); this.composer.addPass(this.bloom);
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
    return new THREE.MeshPhysicalMaterial({ color, map: this.texture, bumpMap: this.texture, bumpScale: wall ? 0.012 : 0.004,
      roughness: wall ? 0.7 : 0.24, metalness: wall ? 0.08 : 0.05, clearcoat: wall ? 0.08 : 0.7, clearcoatRoughness: 0.25 });
  }

  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Mesh {
    const object = new THREE.Mesh(geometry, material); object.position.set(x, y, z); object.castShadow = true; object.receiveShadow = true;
    parent.add(object); return object;
  }

  private makeDemon(): THREE.Group {
    const g = new THREE.Group(), m = this.demonMaterial;
    this.mesh(new THREE.SphereGeometry(0.255, 24, 16), m, g, 0, 0.39, 0).scale.set(0.95, 1.18, 0.85);
    this.mesh(new THREE.SphereGeometry(0.28, 24, 16), m, g, 0, 0.7, 0);
    const hornMaterial = this.physical('#b9d1ac');
    for (const side of [-1, 1]) {
      const horn = this.mesh(new THREE.ConeGeometry(0.105, 0.3, 16), hornMaterial, g, side * 0.205, 0.96, -0.02); horn.rotation.z = -side * 0.35;
      this.mesh(new THREE.SphereGeometry(0.07, 16, 10), m, g, side * 0.13, 0.13, 0.025).scale.set(1, 0.65, 1.5);
      this.mesh(new THREE.SphereGeometry(0.084, 20, 12), this.physical('#f5f0e2'), g, side * 0.108, 0.72, 0.235).scale.set(1, 1.05, 0.45);
      this.mesh(new THREE.SphereGeometry(0.039, 16, 12), this.physical('#1c2e2b'), g, side * 0.105, 0.723, 0.27).scale.set(1, 1.2, 0.35);
      const arm = this.mesh(new THREE.CapsuleGeometry(0.055, 0.19, 4, 12), m, g, side * 0.28, 0.39, 0.02); arm.rotation.z = -side * 0.24;
    }
    const tail = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.3, -0.12), new THREE.Vector3(0.27, 0.25, -0.27), new THREE.Vector3(0.34, 0.47, -0.3)]);
    this.mesh(new THREE.TubeGeometry(tail, 12, 0.025, 8, false), m, g);
    const tip = this.mesh(new THREE.ConeGeometry(0.07, 0.16, 3), hornMaterial, g, 0.34, 0.49, -0.3); tip.rotation.z = -0.6;
    return g;
  }

  private makePiece(cell: Cell, fixed: boolean): THREE.Group {
    const g = new THREE.Group(); g.userData.key = cell.key; g.userData.portal = cell.portal?.target;
    const height = fixed ? 0.45 : 0.7;
    const material = this.physical(fixed && cell.temperature === 0 ? palette.wall : thermalColor(cell.temperature), fixed);
    if (cell.temperature === -1 && !fixed) { material.transmission = 0.15; material.thickness = 0.9; material.ior = 1.35; material.roughness = 0.19; }
    if (cell.temperature === 1) { material.emissive.set('#fa4d15'); material.emissiveIntensity = 0.12; }
    const core = this.mesh(new RoundedBoxGeometry(0.97, height, 0.97, 3, fixed ? 0.055 : 0.095), material, g, 0, height / 2 + 0.055, 0);
    core.userData.key = cell.key; core.userData.portal = cell.portal?.target;
    g.userData.material = material;
    if (!fixed) {
      const cap = this.mesh(new RoundedBoxGeometry(0.65, 0.022, 0.65, 2, 0.04), this.physical(thermalColor(cell.temperature)), g, 0, height + 0.067, 0);
      g.userData.capMaterial = cap.material;
      const symbol = cell.portal ? cell.portal.target : cell.temperature === 1 ? '↑' : cell.temperature === -1 ? '↓' : '·';
      const mark = this.mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshBasicMaterial({ map: labelTexture(cell.portal ? '' : symbol), transparent: true, depthWrite: false }), g, 0, height + 0.082, 0);
      mark.rotation.x = -Math.PI / 2; mark.castShadow = false; g.userData.mark = mark;
    }
    if (cell.fixed) {
      const pin = this.mesh(new THREE.CylinderGeometry(0.038, 0.045, 0.018, 12), new THREE.MeshStandardMaterial({ color: '#cad3ca', metalness: 0.8, roughness: 0.3 }), g, 0.29, height + 0.068, 0.29);
      pin.castShadow = false;
    }
    // Ivory strips denote insulation on the corresponding face of a cell.
    for (let dir = 0; dir < 4; dir++) {
      if (edge(cell, dir) !== 2) continue;
      const horizontal = dir % 2 === 1;
      this.mesh(new RoundedBoxGeometry(horizontal ? 0.89 : 0.045, 0.045, horizontal ? 0.045 : 0.89, 2, 0.014), this.physical('#f1ebd8'), g,
        dir === 0 ? -0.46 : dir === 2 ? 0.46 : 0, height + 0.073, dir === 1 ? 0.46 : dir === 3 ? -0.46 : 0);
    }
    return g;
  }

  load(level: Level, state: State, labels: Map<string, string>): void {
    this.scene.remove(this.board); this.disposeBoard();
    this.board = new THREE.Group(); this.scene.add(this.board); this.level = level;
    this.controls.maxZoom = level.category === 'world' ? 5 : 2.2;
    this.pieces.clear(); this.targets.clear(); this.rings = []; this.goalLights = []; this.gridMeshes = []; this.noteMarkers = [];
    const w = level.width, h = level.height;
    const platform = this.mesh(new RoundedBoxGeometry(w + 0.55, 0.45, h + 0.55, 4, 0.16), this.physical('#e4ded0'), this.board, 0, -0.205, 0);
    platform.receiveShadow = true;
    this.mesh(new RoundedBoxGeometry(w + 0.65, 0.12, h + 0.65, 3, 0.12), this.physical('#253e37'), this.board, 0, -0.425, 0);
    const floorMaterial = this.physical(palette.floor); floorMaterial.roughness = 0.82; floorMaterial.clearcoat = 0.06;
    const tiles = new THREE.InstancedMesh(new RoundedBoxGeometry(0.985, 0.05, 0.985, 2, 0.025), floorMaterial, w * h);
    const matrix = new THREE.Matrix4();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { matrix.makeTranslation(x - (w - 1) / 2, 0.025, y - (h - 1) / 2); tiles.setMatrixAt(y * w + x, matrix); }
    tiles.receiveShadow = true; this.board.add(tiles);
    const fixedKeys = new Set(bodies(state.cells).filter(b => b.some(c => c.fixed)).flat().map(c => c.key));
    const lookup = new Map(state.cells.map(c => [`${c.x},${c.y}`, c]));
    for (const cell of state.cells) {
      const fixed = fixedKeys.has(cell.key), group = this.makePiece(cell, fixed);
      group.position.set(cell.x - (w - 1) / 2, 0, cell.y - (h - 1) / 2);
      for (const [dir, dx, dy] of [[2, 1, 0], [1, 0, 1]]) {
        const neighbor = lookup.get(`${cell.x + dx},${cell.y + dy}`);
        if (fixed || edge(cell, dir) !== 0 || !neighbor || edge(neighbor, (dir + 2) % 4) !== 0) continue;
        this.mesh(new RoundedBoxGeometry(dx ? 0.16 : 0.88, 0.54, dy ? 0.16 : 0.88, 2, 0.02), group.userData.material, group, dx * 0.5, 0.4, dy * 0.5);
      }
      if (cell.portal) {
        const text = labels.get(cell.portal.target)?.replace('1-', '') ?? '↗';
        const mark = this.mesh(new THREE.PlaneGeometry(0.58, 0.58), new THREE.MeshBasicMaterial({ map: labelTexture(text, fixed), transparent: true, depthWrite: false }), group, 0, (fixed ? 0.45 : 0.7) + 0.09, 0);
        mark.rotation.x = -Math.PI / 2; mark.castShadow = false; mark.userData.portal = cell.portal.target;
      }
      this.board.add(group); this.pieces.set(cell.key, group); this.targets.set(cell.key, group.position.clone());
    }
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
    this.demon = this.makeDemon(); this.board.add(this.demon);
    if (state.players[0]) this.demon.position.set(state.players[0].x - (w - 1) / 2, 0.055, state.players[0].y - (h - 1) / 2);
    this.demonTarget.copy(this.demon.position);
    this.controls.target.set(0, 0, 0); this.camera.zoom = 1; this.resetCamera(); this.resize(); this.update(state, true);
  }

  update(state: State, snap = false): void {
    if (!this.level) return;
    const { width: w, height: h } = this.level;
    const fixedKeys = new Set(bodies(state.cells).filter(b => b.some(c => c.fixed)).flat().map(c => c.key));
    for (const cell of state.cells) {
      const group = this.pieces.get(cell.key); if (!group) continue;
      const target = new THREE.Vector3(cell.x - (w - 1) / 2, 0, cell.y - (h - 1) / 2); this.targets.set(cell.key, target);
      if (snap) group.position.copy(target);
      const material = group.userData.material as THREE.MeshPhysicalMaterial;
      const fixed = fixedKeys.has(cell.key);
      material.color.set(fixed && cell.temperature === 0 ? palette.wall : thermalColor(cell.temperature));
      material.emissive.set(cell.temperature === 1 ? '#fa4d15' : '#000000'); material.emissiveIntensity = cell.temperature === 1 ? 0.12 : 0;
      if (group.userData.capMaterial) (group.userData.capMaterial as THREE.MeshPhysicalMaterial).color.set(thermalColor(cell.temperature));
      if (group.userData.mark && !cell.portal) {
        const mark = group.userData.mark as THREE.Mesh; const m = mark.material as THREE.MeshBasicMaterial;
        const symbol = cell.temperature === 1 ? '↑' : cell.temperature === -1 ? '↓' : '·';
        if (mark.userData.symbol !== symbol) { m.map?.dispose(); m.map = labelTexture(symbol); m.needsUpdate = true; mark.userData.symbol = symbol; }
      }
    }
    if (state.players[0]) {
      this.demonTarget.set(state.players[0].x - (w - 1) / 2, 0.055, state.players[0].y - (h - 1) / 2);
      if (snap) this.demon.position.copy(this.demonTarget);
      this.demonMaterial.color.set(state.players[0].temperature === 1 ? '#af5542' : state.players[0].temperature === -1 ? '#408c97' : palette.demon);
    }
    this.lastStep = performance.now();
  }

  setTilt(degrees: number): void { if (this.tilt === degrees) return; this.tilt = degrees; this.resetCamera(); }
  setGrid(visible: boolean): void { this.gridMeshes.forEach(m => { m.visible = visible; }); }
  setQuality(high: boolean): void { if (this.quality === high) return; this.quality = high; this.ao.enabled = high; this.bloom.enabled = high; this.renderer.setPixelRatio(Math.min(devicePixelRatio, high ? 2 : 1)); this.resize(); }
  setExposure(exposure: number): void { this.renderer.toneMappingExposure = exposure; }
  resetCamera(): void {
    const angle = THREE.MathUtils.degToRad(this.tilt), yaw = THREE.MathUtils.degToRad(this.azimuth);
    this.camera.position.set(25 * Math.sin(angle) * Math.sin(yaw), 25 * Math.cos(angle), 25 * Math.sin(angle) * Math.cos(yaw));
    this.controls.target.set(0, 0, 0); this.camera.zoom = 1; this.camera.lookAt(this.controls.target); this.controls.update(); this.resize();
  }

  private resize(): void {
    const width = this.host.clientWidth, height = this.host.clientHeight; if (!width || !height) return;
    this.size.set(width, height); this.renderer.setSize(width, height);
    const aspect = width / height, w = this.level?.width ?? 9, h = this.level?.height ?? 8;
    const yaw = THREE.MathUtils.degToRad(this.azimuth), tilt = THREE.MathUtils.degToRad(this.tilt);
    const projectedWidth = w * Math.abs(Math.cos(yaw)) + h * Math.abs(Math.sin(yaw));
    const projectedHeight = (w * Math.abs(Math.sin(yaw)) + h * Math.abs(Math.cos(yaw))) * Math.cos(tilt);
    const vertical = Math.max(projectedHeight + 2.3, (projectedWidth + 3) / aspect) / 2;
    this.camera.left = -vertical * aspect; this.camera.right = vertical * aspect; this.camera.top = vertical; this.camera.bottom = -vertical;
    this.camera.updateProjectionMatrix();
    this.composer.setSize(width, height);
  }

  private hit(event: MouseEvent): THREE.Object3D | undefined {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects([...this.pieces.values(), ...this.noteMarkers], true)[0]?.object;
  }
  private hover(event: PointerEvent): void { const hit = this.hit(event); this.onHover?.(hit?.userData.key ?? hit?.parent?.userData.key ?? null); }
  private animate(): void {
    const now = performance.now(), dt = Math.min((now - this.previousTime) / 1000, 0.1); this.previousTime = now;
    if (!this.running) return;
    const factor = 1 - Math.exp(-22 * dt);
    this.pieces.forEach((g, key) => { const target = this.targets.get(key); if (target) g.position.lerp(target, factor); });
    this.demon.position.lerp(this.demonTarget, factor);
    const moving = now - this.lastStep < 170;
    this.demon.position.y = 0.055 + (moving ? Math.sin((now - this.lastStep) / 170 * Math.PI) * 0.075 : Math.sin(now * 0.0025) * 0.008);
    this.rings.forEach(r => { const m = r.material as THREE.MeshStandardMaterial; m.emissiveIntensity = 0.95 + Math.sin(now * 0.002) * 0.22; });
    this.controls.update();
    this.composer.render();
  }
  private disposeBoard(): void {
    const materials = new Set<THREE.Material>(), geometries = new Set<THREE.BufferGeometry>();
    this.board.traverse(o => {
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) { geometries.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); }
    });
    geometries.forEach(g => g.dispose()); materials.forEach(m => {
      if (m === this.demonMaterial) return;
      const map = (m as THREE.MeshStandardMaterial).map; if (map && map !== this.texture) map.dispose(); m.dispose();
    });
  }
}
