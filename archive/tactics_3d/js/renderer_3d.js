/* ==========================================================================
   renderer_3d.js: Three.js 3D Tactical Battlefield Rendering Engine
   ========================================================================== */
import { ROWS, COLS, HERO_TYPES } from './config.js';
import { isLocalPlayer } from './board.js';

// ==========================================================================
// 🎥 CAMERA POSITION CONFIG (カメラ位置・アングルの設定)
// ★ ここを書き換えるだけで、初期表示・対戦中・視点切り替え時すべてに確実に反映されます！
// ==========================================================================
export const CAMERA_CONFIG = {
  x: -2.3,      // カメラの横位置オフセット（負の値で盤面を左寄りに配置し、右側の情報ドックと重ならないようにする）
  y: 31,        // カメラの高さ（大きいほど遠く引き気味、小さいほど近くズーム）
  z: 9.0,       // カメラの手前位置（大きいほど斜め横、小さいほど真上寄り）
  lookY: 0.0,   // 注視点の高さ
  lookZ: 0.7,   // 注視点の奥行き（大きいほど盤面が画面上へ、小さいほど画面下へ）
  fov: 35       // 視野角
};

if (typeof window !== 'undefined') {
  window.CAMERA_CONFIG = CAMERA_CONFIG;
}

export class Renderer3D {
  constructor() {
    this.viewportEl = null;
    this.canvasContainer = null;
    this.labelsContainer = null;
    this.onTileClickCallback = null;
    this.onPieceDropCallback = null;
    this.onPieceDragStartCallback = null;
    this.onPieceDragEndCallback = null;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.dirLight = null;
    this.isFlipped = false;

    this.BOARD_SIZE = 7;
    this.TILE_STEP = 2.35;
    this.tiles = [];
    this.tileGroup = null;

    this.unitMeshes = new Map(); // id -> THREE.Group
    this.hazardGroup = null;
    this.selectRingGroup = null;
    this.blueCoreObj = null;
    this.redCoreObj = null;

    this.generatedPortraits = {};
    this.popupCountMap = new Map();
    this.tempVec = new THREE.Vector3();
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.95);
    this.dragIntersect = new THREE.Vector3();

    this.pointerDownInfo = null;
    this.dragState = null;

    this.currentSelectedPos = null;
    this.currentTurn = 'P1';
    this.currentGamePhase = 'BATTLE';
    this.currentDeployOwner = null;
    this.currentCommandMode = null;
    this.validMoveCoords = [];
    this.hazardMoveCoords = [];
    this.validAttackCoords = [];
    this.validSkillCoords = [];
    this.deployCoords = [];
    this.selectedHazardCoord = null;

    if (typeof window !== 'undefined') {
      window.renderer3D = this;
      window.__setCamera = (cfg) => {
        Object.assign(CAMERA_CONFIG, cfg);
        this.applyCameraConfig();
        console.log('🎥 Camera updated:', CAMERA_CONFIG);
      };
    }
  }

  /* ------------------------------------------------------------------------
     1. INITIALIZATION & SCENE SETUP
     ------------------------------------------------------------------------ */
  init(viewportEl, canvasContainer, labelsContainer, { onTileClick, onPieceDrop, onPieceDragStart, onPieceDragEnd }) {
    this.viewportEl = viewportEl;
    this.canvasContainer = canvasContainer;
    this.labelsContainer = labelsContainer;
    this.onTileClickCallback = onTileClick;
    this.onPieceDropCallback = onPieceDrop;
    this.onPieceDragStartCallback = onPieceDragStart;
    this.onPieceDragEndCallback = onPieceDragEnd;

    const sz = this.getViewportSize();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xdce4ee);
    this.scene.fog = new THREE.FogExp2(0xdce4ee, 0.012);

    this.camera = new THREE.PerspectiveCamera(CAMERA_CONFIG.fov, sz.w / sz.h, 0.1, 500);
    this.applyCameraConfig();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(sz.w, sz.h);
    this.renderer.setPixelRatio(Math.min(Math.max(window.devicePixelRatio || 1, 2), 3));
    if (THREE.sRGBEncoding) this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.canvasContainer.innerHTML = '';
    this.canvasContainer.appendChild(this.renderer.domElement);

    // Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xf8fafc, 0.92);
    this.scene.add(ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xffffff, 0.88);
    this.dirLight.position.set(10, 28, this.isFlipped ? -16 : 16);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 5;
    this.dirLight.shadow.camera.far = 60;
    const d = 14;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.bias = -0.0005;
    this.scene.add(this.dirLight);

    // Inorganic Studio Floor + Subtle Grid
    const floorGeo = new THREE.PlaneGeometry(120, 120);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xd5dfe9, roughness: 0.85, metalness: 0.05 });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -1.05;
    floorMesh.receiveShadow = true;
    this.scene.add(floorMesh);

    const studioGrid = new THREE.GridHelper(70, 35, 0xa8b8c8, 0xc4d0dc);
    studioGrid.position.y = -1.02;
    this.scene.add(studioGrid);

    // Monolith Tactical Board Base
    this.buildBoardChassis();
    this.buildTiles();

    // Hazard Group
    this.hazardGroup = new THREE.Group();
    this.scene.add(this.hazardGroup);

    // Selection Ring
    this.selectRingGroup = new THREE.Group();
    const selRingOuter = new THREE.Mesh(
      new THREE.RingGeometry(0.98, 1.08, 4),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24, side: THREE.DoubleSide })
    );
    selRingOuter.rotation.x = -Math.PI / 2;
    this.selectRingGroup.add(selRingOuter);
    this.selectRingGroup.position.set(0, -999, 0);
    this.scene.add(this.selectRingGroup);

    // Shared Piece Geometries
    const hexShape = this.createCyberHexShape(1.0);
    this.sharedBodyGeo = new THREE.ExtrudeGeometry(hexShape, {
      steps: 1, depth: 0.26, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 3
    });
    this.sharedBodyGeo.center();
    this.sharedBodyGeo.rotateX(-Math.PI / 2);

    const rimShape = this.createCyberRimShape();
    this.sharedRimGeo = new THREE.ExtrudeGeometry(rimShape, {
      depth: 0.045, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2
    });
    this.sharedRimGeo.center();
    this.sharedRimGeo.rotateX(-Math.PI / 2);

    const waistShape = this.createCyberHexShape(1.025);
    this.sharedWaistGeo = new THREE.ExtrudeGeometry(waistShape, { depth: 0.035, bevelEnabled: false });
    this.sharedWaistGeo.center();
    this.sharedWaistGeo.rotateX(-Math.PI / 2);

    this.sharedStickerGeo = new THREE.PlaneGeometry(1.80 * 0.915, 2.15 * 0.915);
    this.sharedStickerGeo.rotateX(-Math.PI / 2);

    // Pointer Input Handling (Click + 3D Lift & Drag-and-Drop)
    this.viewportEl.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
    this.viewportEl.addEventListener('pointermove', (e) => this.handlePointerMove(e));
    this.viewportEl.addEventListener('pointerup', (e) => this.handlePointerUp(e));
    this.viewportEl.addEventListener('pointercancel', (e) => this.handlePointerUp(e));

    // Start Animation Loop
    this.startLoop();
  }

  applyCameraConfig() {
    if (!this.camera) return;
    const zSign = this.isFlipped ? -1 : 1;
    const xSign = this.isFlipped ? -1 : 1;
    const camX = (CAMERA_CONFIG.x !== undefined ? CAMERA_CONFIG.x : -2.3);
    this.camera.position.set(camX * xSign, CAMERA_CONFIG.y, CAMERA_CONFIG.z * zSign);
    this.camera.lookAt(new THREE.Vector3(camX * xSign, CAMERA_CONFIG.lookY, CAMERA_CONFIG.lookZ * zSign));
    this.camera.updateMatrixWorld();
    if (typeof this.updateHudPositions === 'function') {
      this.updateHudPositions();
    }
  }

  setPerspective(flipped) {
    this.isFlipped = !!flipped;
    this.applyCameraConfig();
    if (this.dirLight) {
      this.dirLight.position.set(10, 28, this.isFlipped ? -16 : 16);
    }
    if (this.tiles) {
      for (let r = 0; r < this.BOARD_SIZE; r++) {
        for (let c = 0; c < this.BOARD_SIZE; c++) {
          if (this.tiles[r]?.[c]) {
            this.tiles[r][c].rotation.y = this.isFlipped ? Math.PI : 0;
          }
        }
      }
    }
  }

  getViewportSize() {
    return {
      w: 1600,
      h: 900
    };
  }

  gridToWorld(r, c) {
    const offset = (this.BOARD_SIZE - 1) * this.TILE_STEP * 0.5;
    return new THREE.Vector3(c * this.TILE_STEP - offset, 0, r * this.TILE_STEP - offset);
  }

  /* ------------------------------------------------------------------------
     2. BOARD & TILE BUILDING
     ------------------------------------------------------------------------ */
  buildBoardChassis() {
    const outerBezelGeo = new THREE.BoxGeometry(18.2, 0.62, 18.6);
    const outerBezelMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.45 });
    const outerBezel = new THREE.Mesh(outerBezelGeo, outerBezelMat);
    outerBezel.position.y = -0.58;
    outerBezel.castShadow = true;
    outerBezel.receiveShadow = true;
    this.scene.add(outerBezel);

    const chassisGeo = new THREE.BoxGeometry(17.1, 0.72, 17.1);
    const chassisMat = new THREE.MeshStandardMaterial({ color: 0x0b111e, roughness: 0.5, metalness: 0.3 });
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);
    chassis.position.y = -0.48;
    chassis.receiveShadow = true;
    this.scene.add(chassis);

    const blueRail = new THREE.Mesh(
      new THREE.BoxGeometry(16.8, 0.12, 0.18),
      new THREE.MeshBasicMaterial({ color: 0x00d2ff })
    );
    blueRail.position.set(0, -0.22, 9.15);
    this.scene.add(blueRail);

    const redRail = new THREE.Mesh(
      new THREE.BoxGeometry(16.8, 0.12, 0.18),
      new THREE.MeshBasicMaterial({ color: 0xff2e63 })
    );
    redRail.position.set(0, -0.22, -9.15);
    this.scene.add(redRail);
  }

  makeTileTexture(r, c, isAlt) {
    const cvs = document.createElement('canvas');
    cvs.width = 256;
    cvs.height = 256;
    const ctx = cvs.getContext('2d');

    ctx.fillStyle = isAlt ? '#243247' : '#192334';
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = isAlt ? '#475975' : '#33435c';
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, 244, 244);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, 216, 216);

    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(16, 16, 14, 3);
    ctx.fillRect(16, 16, 3, 14);
    ctx.fillRect(226, 237, 14, 3);
    ctx.fillRect(237, 226, 3, 14);

    ctx.fillStyle = 'rgba(148, 163, 184, 0.22)';
    ctx.fillRect(125, 125, 6, 6);

    const colChar = String.fromCharCode(65 + c);
    const rowNum = 7 - r;
    ctx.font = '800 22px Orbitron, sans-serif';
    ctx.fillStyle = 'rgba(203, 213, 225, 0.45)';
    ctx.fillText(`${colChar}${rowNum}`, 26, 46);

    const tex = new THREE.CanvasTexture(cvs);
    tex.anisotropy = 4;
    return tex;
  }

  makeReticleTexture() {
    const cvs = document.createElement('canvas');
    cvs.width = 256;
    cvs.height = 256;
    const ctx = cvs.getContext('2d');

    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.fillRect(10, 10, 236, 236);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 14;
    const L = 56;
    ctx.beginPath(); ctx.moveTo(14, 14 + L); ctx.lineTo(14, 14); ctx.lineTo(14 + L, 14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(242 - L, 14); ctx.lineTo(242, 14); ctx.lineTo(242, 14 + L); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(242, 242 - L); ctx.lineTo(242, 242); ctx.lineTo(242 - L, 242); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(14 + L, 242); ctx.lineTo(14, 242); ctx.lineTo(14, 242 - L); ctx.stroke();

    return new THREE.CanvasTexture(cvs);
  }

  buildTiles() {
    this.tiles = [];
    this.tileGroup = new THREE.Group();
    this.scene.add(this.tileGroup);
    const reticleTex = this.makeReticleTexture();

    for (let r = 0; r < this.BOARD_SIZE; r++) {
      this.tiles[r] = [];
      for (let c = 0; c < this.BOARD_SIZE; c++) {
        const isAlt = (r + c) % 2 === 1;
        const tileGeo = new THREE.BoxGeometry(this.TILE_STEP * 0.91, 0.24, this.TILE_STEP * 0.91);
        const tileMat = new THREE.MeshStandardMaterial({
          map: this.makeTileTexture(r, c, isAlt),
          roughness: 0.45,
          metalness: 0.2
        });
        const tileMesh = new THREE.Mesh(tileGeo, tileMat);
        const wPos = this.gridToWorld(r, c);
        tileMesh.position.set(wPos.x, -0.12, wPos.z);
        tileMesh.receiveShadow = true;
        tileMesh.userData = { r, c };

        const hlGeo = new THREE.PlaneGeometry(this.TILE_STEP * 0.88, this.TILE_STEP * 0.88);
        const hlMat = new THREE.MeshBasicMaterial({
          map: reticleTex,
          color: 0x00f0ff,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false
        });
        const hlMesh = new THREE.Mesh(hlGeo, hlMat);
        hlMesh.rotation.x = -Math.PI / 2;
        hlMesh.position.y = 0.135;
        tileMesh.add(hlMesh);
        tileMesh.userData.hlMesh = hlMesh;

        this.tileGroup.add(tileMesh);
        this.tiles[r][c] = tileMesh;
      }
    }
  }

  /* ------------------------------------------------------------------------
     3. PIECE GEOMETRIES & DECAL ARTWORK GENERATION
     ------------------------------------------------------------------------ */
  createCyberHexShape(scale = 1.0) {
    const shape = new THREE.Shape();
    const s = scale;
    shape.moveTo(0 * s, 1.12 * s);
    shape.lineTo(-0.80 * s, 0.54 * s);
    shape.lineTo(-0.88 * s, -0.62 * s);
    shape.lineTo(-0.62 * s, -0.98 * s);
    shape.lineTo(0.62 * s, -0.98 * s);
    shape.lineTo(0.88 * s, -0.62 * s);
    shape.lineTo(0.80 * s, 0.54 * s);
    shape.closePath();
    return shape;
  }

  createCyberRimShape() {
    const shape = this.createCyberHexShape(1.0);
    const hole = new THREE.Path();
    const s = 0.915;
    hole.moveTo(0 * s, 1.12 * s);
    hole.lineTo(0.80 * s, 0.54 * s);
    hole.lineTo(0.88 * s, -0.62 * s);
    hole.lineTo(0.62 * s, -0.98 * s);
    hole.lineTo(-0.62 * s, -0.98 * s);
    hole.lineTo(-0.88 * s, -0.62 * s);
    hole.lineTo(-0.80 * s, 0.54 * s);
    hole.closePath();
    shape.holes.push(hole);
    return shape;
  }

  traceCyberHexCanvas(ctx, inset = 0) {
    ctx.beginPath();
    ctx.moveTo(1024, 75 + inset);
    ctx.lineTo(1830 - inset * 0.8, 590 + inset * 0.6);
    ctx.lineTo(1910 - inset * 0.8, 1630 - inset * 0.7);
    ctx.lineTo(1670 - inset * 0.6, 1950 - inset);
    ctx.lineTo(378 + inset * 0.6, 1950 - inset);
    ctx.lineTo(138 + inset * 0.8, 1630 - inset * 0.7);
    ctx.lineTo(218 + inset * 0.8, 590 + inset * 0.6);
    ctx.closePath();
  }

  generateProceduralPortrait(typeKey) {
    const upperKey = (typeKey || 'KINESIS').toUpperCase();
    if (this.generatedPortraits[upperKey]) {
      return this.generatedPortraits[upperKey];
    }

    const def = HERO_TYPES[upperKey] || { name: upperKey, icon: '⚡', role: 'UNIT' };
    const cvs = document.createElement('canvas');
    cvs.width = 600;
    cvs.height = 600;
    const ctx = cvs.getContext('2d');

    // Role-based futuristic gradient
    const roleColors = {
      ASSAULT: ['#0f172a', '#1e1b4b', '#00bbf9'],
      SENTINEL: ['#0f172a', '#064e3b', '#10b981'],
      DISRUPTOR: ['#0f172a', '#3b0764', '#c084fc'],
      SUPPORT: ['#0f172a', '#0c4a6e', '#38bdf8']
    };
    const palette = roleColors[def.role] || ['#0f172a', '#1e293b', '#00bbf9'];

    const grad = ctx.createRadialGradient(300, 240, 40, 300, 300, 420);
    grad.addColorStop(0, palette[1]);
    grad.addColorStop(1, palette[0]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 600, 600);

    // Subtle Cyber Grid
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 600; i += 40) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 600); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(600, i); ctx.stroke();
    }

    // Glowing Hexagon Emblem
    ctx.strokeStyle = palette[2];
    ctx.lineWidth = 6;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const hx = 300 + 160 * Math.cos(angle);
      const hy = 230 + 160 * Math.sin(angle);
      if (i === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.stroke();

    // Hero Icon
    ctx.font = '140px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(def.icon || '⚡', 300, 225);

    // Codename
    ctx.font = '900 34px Orbitron, sans-serif';
    ctx.fillStyle = palette[2];
    ctx.fillText(upperKey, 300, 345);

    const dataUrl = cvs.toDataURL('image/jpeg', 0.9);
    this.generatedPortraits[upperKey] = dataUrl;
    return dataUrl;
  }

  getHeroImageSrc(unit) {
    const rawKey = (unit?.typeKey || unit?.id || 'kinesis').toLowerCase();
    const knownAssets = [
      'kinesis', 'phase', 'nitro', 'vector', 'vulcan', 'toxin',
      'glitch', 'cypher', 'hive', 'iris', 'nexus', 'aura',
      'barricade', 'turret'
    ];

    if (knownAssets.includes(rawKey)) {
      return `assets/${rawKey}.jpg`;
    }
    if (typeof ASSETS_BASE64 !== 'undefined' && ASSETS_BASE64[rawKey]) {
      return ASSETS_BASE64[rawKey];
    }
    return this.generateProceduralPortrait(rawKey);
  }

  createStructureDecalTexture(unit) {
    const cvs = document.createElement('canvas');
    cvs.width = 1024;
    cvs.height = 1024;
    const ctx = cvs.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const tex = new THREE.CanvasTexture(cvs);
    if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 8;

    const isBlue = unit.owner === 'P1';
    const primaryColor = isBlue ? '#00bbf9' : '#ff2e63';
    const isBarricade = (unit.typeKey === 'BARRICADE');

    const drawCard = (imgEl) => {
      ctx.clearRect(0, 0, 1024, 1024);
      ctx.save();
      ctx.scale(0.5, 0.5);

      // 1. 六角形クリッピング
      this.traceCyberHexCanvas(ctx, 0);
      ctx.clip();

      // 2. メタリックダークグラデーション背景
      const bgGrad = ctx.createRadialGradient(1024, 1024, 80, 1024, 1024, 1100);
      if (isBarricade) {
        bgGrad.addColorStop(0, isBlue ? '#0f2942' : '#2d111b');
        bgGrad.addColorStop(1, isBlue ? '#060d17' : '#14060b');
      } else {
        bgGrad.addColorStop(0, isBlue ? '#12263f' : '#330d1d');
        bgGrad.addColorStop(1, isBlue ? '#070f1a' : '#16040a');
      }
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 2048, 2048);

      // 2.5 画像が存在する場合は背景に描画
      if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
        ctx.save();
        ctx.filter = 'contrast(1.08) saturate(1.15)';
        const zoom = 1.25;
        const drawW = 2048 * zoom;
        const drawH = 2048 * zoom;
        const offsetX = (2048 - drawW) / 2;
        const offsetY = (2048 - drawH) * 0.35;
        ctx.drawImage(imgEl, offsetX, offsetY, drawW, drawH);
        ctx.restore();
        ctx.fillStyle = isBlue ? 'rgba(0, 30, 60, 0.35)' : 'rgba(50, 10, 20, 0.35)';
        ctx.fillRect(0, 0, 2048, 2048);
      } else {
        // 画像がない場合のプロシージャルグラフィック
        ctx.strokeStyle = isBlue ? 'rgba(0, 187, 249, 0.14)' : 'rgba(255, 46, 99, 0.14)';
        ctx.lineWidth = 3;
        if (isBarricade) {
          for (let x = 200; x < 1900; x += 120) {
            ctx.beginPath(); ctx.moveTo(x, 200); ctx.lineTo(x, 1850); ctx.stroke();
          }
          for (let y = 300; y < 1850; y += 120) {
            ctx.beginPath(); ctx.moveTo(200, y); ctx.lineTo(1850, y); ctx.stroke();
          }
        } else {
          for (const r of [280, 480, 680]) {
            ctx.beginPath(); ctx.arc(1024, 1000, r, 0, Math.PI * 2); ctx.stroke();
          }
          ctx.beginPath(); ctx.moveTo(1024, 300); ctx.lineTo(1024, 1700); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(350, 1000); ctx.lineTo(1700, 1000); ctx.stroke();
        }

        ctx.strokeStyle = isBlue ? 'rgba(0, 187, 249, 0.45)' : 'rgba(255, 46, 99, 0.45)';
        ctx.lineWidth = 8;
        this.traceCyberHexCanvas(ctx, 360);
        ctx.stroke();

        ctx.font = '280px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = primaryColor;
        ctx.shadowBlur = 40;
        const iconChar = isBarricade ? '🧱' : '🗼';
        ctx.fillText(iconChar, 1024, 880);
        ctx.shadowBlur = 0;
      }

      // 6. コードネーム＆タイトル
      ctx.font = '900 84px Orbitron, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.95)';
      ctx.shadowBlur = 14;
      const titleText = isBarricade ? 'BARRICADE' : 'AUTO TURRET';
      ctx.fillText(titleText, 1024, 1320);

      // 7. サブスペックテキスト
      ctx.font = '800 46px Orbitron, sans-serif';
      ctx.fillStyle = primaryColor;
      const subText = isBarricade ? 'HP 30 // DEFENSE SHIELD' : 'ATK 10 // INTERCEPT';
      ctx.fillText(subText, 1024, 1430);

      // 8. 外周ネオンフレーム
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 22;
      this.traceCyberHexCanvas(ctx, 14);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = 6;
      this.traceCyberHexCanvas(ctx, 42);
      ctx.stroke();

      ctx.restore();
      tex.needsUpdate = true;
    };

    const imgSrc = this.getHeroImageSrc(unit);
    const img = new Image();
    img.onload = () => drawCard(img);
    img.onerror = () => drawCard(null);
    img.src = imgSrc;
    if (img.complete && img.naturalWidth > 0) drawCard(img);
    else drawCard(null);

    return tex;
  }

  createHeroDecalTexture(unit) {
    const cvs = document.createElement('canvas');
    cvs.width = 1024;
    cvs.height = 1024;
    const ctx = cvs.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const tex = new THREE.CanvasTexture(cvs);
    if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 8;

    const isBlue = unit.owner === 'P1';
    const primaryColor = isBlue ? '#00bbf9' : '#ff2e63';

    const drawCard = (imgEl) => {
      ctx.clearRect(0, 0, 1024, 1024);
      ctx.save();
      ctx.scale(0.5, 0.5);

      this.traceCyberHexCanvas(ctx, 0);
      ctx.clip();

      ctx.fillStyle = isBlue ? '#ffffff' : '#080d1a';
      ctx.fillRect(0, 0, 2048, 2048);

      if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
        ctx.save();
        ctx.filter = 'contrast(1.06) saturate(1.16)';
        const zoom = 1.32;
        const drawW = 2048 * zoom;
        const drawH = 2048 * zoom;
        const offsetX = (2048 - drawW) / 2;
        const offsetY = (2048 - drawH) * 0.32;
        ctx.drawImage(imgEl, offsetX, offsetY, drawW, drawH);
        ctx.filter = 'none';
        ctx.restore();
      }

      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 18;
      this.traceCyberHexCanvas(ctx, 12);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 5;
      this.traceCyberHexCanvas(ctx, 36);
      ctx.stroke();

      ctx.restore();
      tex.needsUpdate = true;
    };

    const imgSrc = this.getHeroImageSrc(unit);
    const img = new Image();
    img.onload = () => drawCard(img);
    img.onerror = () => drawCard(null);
    img.src = imgSrc;
    if (img.complete && img.naturalWidth > 0) drawCard(img);

    return tex;
  }

  /* ------------------------------------------------------------------------
     4. SPAWNING 3D MONUMENTS & HERO PIECES
     ------------------------------------------------------------------------ */
  spawnHeroPiece(unit, r, c) {
    const isBlue = unit.owner === 'P1';
    const primaryHex = isBlue ? 0x00bbf9 : 0xff2e63;
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: isBlue ? 0xf8fafc : 0x0a0f1d,
      roughness: isBlue ? 0.16 : 0.24,
      metalness: isBlue ? 0.12 : 0.42
    });
    const bodyMesh = new THREE.Mesh(this.sharedBodyGeo, bodyMat);
    bodyMesh.position.set(0, 0.17, 0);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    if (!isBlue) bodyMesh.rotation.y = Math.PI;
    group.add(bodyMesh);

    const rimMesh = new THREE.Mesh(this.sharedRimGeo, bodyMat);
    rimMesh.position.set(0, 0.365, 0);
    rimMesh.castShadow = true;
    if (!isBlue) rimMesh.rotation.y = Math.PI;
    group.add(rimMesh);

    const waistMat = new THREE.MeshStandardMaterial({
      color: primaryHex, emissive: primaryHex, emissiveIntensity: 0.85, roughness: 0.2, metalness: 0.8
    });
    const waistMesh = new THREE.Mesh(this.sharedWaistGeo, waistMat);
    waistMesh.position.set(0, 0.17, 0);
    if (!isBlue) waistMesh.rotation.y = Math.PI;
    group.add(waistMesh);

    const stickerTex = this.createHeroDecalTexture(unit);
    const stickerMat = new THREE.MeshBasicMaterial({
      map: stickerTex, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide
    });
    const topPlate = new THREE.Mesh(this.sharedStickerGeo, stickerMat);
    topPlate.position.set(0, 0.345, 0);
    if (!isBlue) topPlate.rotation.y = Math.PI;
    group.add(topPlate);

    const wPos = this.gridToWorld(r, c);
    group.position.copy(wPos);

    const hudTag = document.createElement('div');
    hudTag.className = `piece-micro-hud ${isBlue ? 'blue' : 'red'}`;
    hudTag.innerHTML = `
      <div class="micro-hp-fill" style="width: ${(unit.hp / unit.maxHp) * 100}%"></div>
      <div class="micro-hud-content">
        <span class="micro-name">${unit.name}</span>
        <div class="micro-right-wrap">
          <span class="micro-hp-num">${unit.hp}</span>
          <span class="micro-badges"></span>
        </div>
      </div>
    `;
    if (!this.labelsContainer) this.labelsContainer = document.getElementById('piece-labels-container');
    if (this.labelsContainer) this.labelsContainer.appendChild(hudTag);

    group.userData = {
      id: unit.id,
      unit,
      r, c,
      isCore: false,
      bodyMesh,
      topPlate,
      hudTag
    };

    this.scene.add(group);
    this.unitMeshes.set(unit.id, group);
    return group;
  }

  spawnCoreMonument(unit, r, c) {
    const isBlue = unit.owner === 'P1';
    const coreColor = isBlue ? 0x0096fa : 0xff2e63;
    const group = new THREE.Group();
    group.position.copy(this.gridToWorld(r, c));

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.88, 1.04, 0.34, 6),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.5, roughness: 0.25 })
    );
    base.position.y = 0.17;
    base.castShadow = true;
    group.add(base);

    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.62, 0),
      new THREE.MeshBasicMaterial({ color: coreColor })
    );
    crystal.position.y = 1.25;
    crystal.scale.set(0.85, 1.45, 0.85);
    group.add(crystal);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.92, 0.035, 12, 32),
      new THREE.MeshBasicMaterial({ color: coreColor })
    );
    ring.position.y = 1.25;
    ring.rotation.x = Math.PI / 3;
    group.add(ring);

    const hudTag = document.createElement('div');
    hudTag.className = `piece-micro-hud core-hud ${isBlue ? 'blue' : 'red'}`;
    hudTag.innerHTML = `
      <div class="micro-hp-fill" style="width: ${(unit.hp / unit.maxHp) * 100}%"></div>
      <div class="micro-hud-content">
        <span class="micro-name">CORE</span>
        <span class="micro-hp-num">${unit.hp}</span>
      </div>
    `;
    if (!this.labelsContainer) this.labelsContainer = document.getElementById('piece-labels-container');
    if (this.labelsContainer) this.labelsContainer.appendChild(hudTag);

    group.userData = {
      id: unit.id,
      unit,
      r, c,
      isCore: true,
      crystal,
      ring,
      hudTag
    };

    this.scene.add(group);
    this.unitMeshes.set(unit.id, group);

    if (isBlue) this.blueCoreObj = group;
    else this.redCoreObj = group;

    return group;
  }

  spawnStructurePiece(unit, r, c) {
    const isBlue = unit.owner === 'P1';
    const primaryHex = isBlue ? 0x00bbf9 : 0xff2e63;
    const isBarricade = (unit.typeKey === 'BARRICADE');
    const group = new THREE.Group();

    // 1. 六角柱3Dボディ（重厚なチタンスレート質感）
    const bodyMat = new THREE.MeshStandardMaterial({
      color: isBarricade ? (isBlue ? 0xcfd8dc : 0x1a1215) : (isBlue ? 0xd0e0f0 : 0x181014),
      roughness: 0.24,
      metalness: 0.55
    });
    const bodyMesh = new THREE.Mesh(this.sharedBodyGeo, bodyMat);
    bodyMesh.position.set(0, 0.17, 0);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    if (!isBlue) bodyMesh.rotation.y = Math.PI;
    group.add(bodyMesh);

    // 2. 六角外周リム
    const rimMesh = new THREE.Mesh(this.sharedRimGeo, bodyMat);
    rimMesh.position.set(0, 0.365, 0);
    rimMesh.castShadow = true;
    if (!isBlue) rimMesh.rotation.y = Math.PI;
    group.add(rimMesh);

    // 3. サイバー発光ウエストリング
    const waistMat = new THREE.MeshStandardMaterial({
      color: primaryHex,
      emissive: primaryHex,
      emissiveIntensity: 0.9,
      roughness: 0.2,
      metalness: 0.8
    });
    const waistMesh = new THREE.Mesh(this.sharedWaistGeo, waistMat);
    waistMesh.position.set(0, 0.17, 0);
    if (!isBlue) waistMesh.rotation.y = Math.PI;
    group.add(waistMesh);

    // 4. 六角形天板デカールステッカー
    const stickerTex = this.createStructureDecalTexture(unit);
    const stickerMat = new THREE.MeshBasicMaterial({
      map: stickerTex,
      transparent: true,
      alphaTest: 0.05,
      side: THREE.DoubleSide
    });
    const topPlate = new THREE.Mesh(this.sharedStickerGeo, stickerMat);
    topPlate.position.set(0, 0.345, 0);
    if (!isBlue) topPlate.rotation.y = Math.PI;
    group.add(topPlate);

    // 5. ワールド座標設定
    const wPos = this.gridToWorld(r, c);
    group.position.copy(wPos);

    // 6. マイクロHPバー
    const hudTag = document.createElement('div');
    hudTag.className = `piece-micro-hud ${isBlue ? 'blue' : 'red'}`;
    hudTag.innerHTML = `
      <div class="micro-hp-fill" style="width: ${(unit.hp / unit.maxHp) * 100}%"></div>
      <div class="micro-hud-content">
        <span class="micro-name">${unit.name}</span>
        <div class="micro-right-wrap">
          <span class="micro-hp-num">${unit.hp}</span>
          <span class="micro-badges"></span>
        </div>
      </div>
    `;
    if (!this.labelsContainer) this.labelsContainer = document.getElementById('piece-labels-container');
    if (this.labelsContainer) this.labelsContainer.appendChild(hudTag);

    group.userData = {
      id: unit.id,
      unit,
      r, c,
      isCore: false,
      bodyMesh,
      topPlate,
      hudTag
    };

    this.scene.add(group);
    this.unitMeshes.set(unit.id, group);
    return group;
  }

  /* ------------------------------------------------------------------------
     5. SYNCHRONIZATION WITH GAME ENGINE STATE
     ------------------------------------------------------------------------ */
  syncBoard({
    board,
    turn,
    selectedPos,
    selectedHazardPos = null,
    commandMode,
    moveTargets = [],
    attackTargets = [],
    skillTargets = [],
    phantomZones = [],
    poisonZones = [],
    traps = [],
    gamePhase = 'BATTLE',
    deployOwner = null
  }) {
    this.currentSelectedHazardPos = selectedHazardPos;
    if (!this.scene) return;
    this.currentSelectedPos = selectedPos;
    this.currentTurn = turn;
    this.currentGamePhase = gamePhase;
    this.currentDeployOwner = deployOwner;
    this.currentCommandMode = commandMode;
    const activeUnitIds = new Set();

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const u = board[r]?.[c];
        if (u) activeUnitIds.add(u.id);
      }
    }

    // 1. First Remove Defeated / Replaced Units (avoids duplicate DOM IDs!)
    for (const [id, group] of Array.from(this.unitMeshes.entries())) {
      if (!activeUnitIds.has(id)) {
        this.unitMeshes.delete(id);
        if (group.userData.hudTag) group.userData.hudTag.remove();
        this.scene.remove(group);
      }
    }

    // 2. Sync / Spawn / Move Active Board Units
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const u = board[r]?.[c];
        if (!u) continue;

        let group = this.unitMeshes.get(u.id);
        if (!group) {
          if (u.typeKey === 'CORE') {
            group = this.spawnCoreMonument(u, r, c);
          } else if (u.typeKey === 'BARRICADE' || u.typeKey === 'TURRET') {
            group = this.spawnStructurePiece(u, r, c);
          } else {
            group = this.spawnHeroPiece(u, r, c);
          }
        }

        group.userData.unit = u;

        // Position sync with smooth GSAP jump if moved or returning from drag
        const targetWorld = this.gridToWorld(r, c);
        const movedGrid = (group.userData.r !== r || group.userData.c !== c);
        const isBeingDragged = (this.dragState && this.dragState.group === group);
        const displacedWorld = Math.hypot(group.position.x - targetWorld.x, group.position.z - targetWorld.z) > 0.04;

        if (movedGrid || (displacedWorld && !isBeingDragged)) {
          group.userData.r = r;
          group.userData.c = c;
          gsap.to(group.position, {
            x: targetWorld.x,
            z: targetWorld.z,
            duration: 0.26,
            ease: 'power3.out',
            overwrite: 'auto'
          });
          if (movedGrid && !group.userData.isCore) {
            this.spawnShockwave(targetWorld, u.owner === 'P1' ? 0x00bbf9 : 0xff2e63);
            gsap.fromTo(group.position, { y: 0.85 }, { y: 0.36, duration: 0.26, ease: 'bounce.out' });
          }
        }

        // Micro-HUD sync
        if (group.userData.hudTag) {
          const hpFill = group.userData.hudTag.querySelector('.micro-hp-fill');
          const hpNum = group.userData.hudTag.querySelector('.micro-hp-num');
          const badgesEl = group.userData.hudTag.querySelector('.micro-badges');

          if (hpFill) hpFill.style.width = `${Math.max(0, Math.min(100, (u.hp / u.maxHp) * 100))}%`;
          if (hpNum) hpNum.innerText = `${u.hp}`;

          if (badgesEl) {
            let bHtml = '';
            if (u.buffs && u.buffs.atk_up && u.buffs.atk_up.turns > 0) bHtml += '🔥';
            if (u.buffs && u.buffs.shield && u.buffs.shield.turns > 0) bHtml += '🛡️';
            if (u.debuffs && u.debuffs.vulnerable && u.debuffs.vulnerable.turns > 0) bHtml += '🎯';
            if (u.debuffs && u.debuffs.disarm && u.debuffs.disarm.turns > 0) bHtml += '💢';
            if (u.debuffs && u.debuffs.bind && u.debuffs.bind.turns > 0) bHtml += '⛓️';
            if (u.debuffs && u.debuffs.silence && u.debuffs.silence.turns > 0) bHtml += '🤐';
            badgesEl.innerText = bHtml;
          }

          const isSelected = selectedPos && selectedPos.r === r && selectedPos.c === c;
          group.userData.hudTag.classList.toggle('selected', !!isSelected);
        }
      }
    }

    // 3. Sync Hazards & Traps (Dimension Zones, Poison Zones, Friendly Traps)
    this.syncHazards(phantomZones, poisonZones, traps);

    // 4. Selection Ring Position & Selected Piece Elevation
    if (selectedPos && board[selectedPos.r] && board[selectedPos.r][selectedPos.c]) {
      const wPos = this.gridToWorld(selectedPos.r, selectedPos.c);
      if (!this.dragState) {
        this.selectRingGroup.position.set(wPos.x, 0.04, wPos.z);
      }

      for (const group of this.unitMeshes.values()) {
        if (this.dragState && this.dragState.group === group) continue;
        const isSelected = group.userData.r === selectedPos.r && group.userData.c === selectedPos.c;
        if (!group.userData.isCore) {
          gsap.to(group.position, { y: isSelected ? 0.36 : 0, duration: 0.2, overwrite: 'auto' });
        }
      }
    } else {
      this.selectRingGroup.position.set(0, -999, 0);
      for (const group of this.unitMeshes.values()) {
        if (this.dragState && this.dragState.group === group) continue;
        if (!group.userData.isCore) {
          gsap.to(group.position, { y: 0, duration: 0.2, overwrite: 'auto' });
        }
      }
    }

    // 5. Update Tile Highlights
    this.updateTileHighlights({
      moveTargets,
      attackTargets,
      skillTargets,
      commandMode,
      gamePhase,
      deployOwner,
      selectedHazardPos,
      phantomZones,
      poisonZones,
      traps
    });

    // 6. Immediately sync 2D floating HUD coordinates
    this.updateHudPositions();
  }

  updateHudPositions() {
    if (!this.camera) return;
    this.camera.updateMatrixWorld();
    const sz = this.getViewportSize();
    const zSign = this.isFlipped ? -1 : 1;
    for (const group of this.unitMeshes.values()) {
      if (group.userData.hudTag) {
        const isCore = group.userData.isCore;
        const isEnemyCore = isCore && (
          this.isFlipped
            ? (group.userData.unit?.owner === 'P1' || group === this.blueCoreObj)
            : (group.userData.unit?.owner === 'P2' || group === this.redCoreObj)
        );

        if (isEnemyCore) {
          // 敵のコアのみはコア上部（頭上）に配置
          this.tempVec.set(
            group.position.x,
            group.position.y + 2.45,
            group.position.z - zSign * 0.15
          );
        } else if (isCore) {
          // 自陣コアはコア下部（手前）に配置
          this.tempVec.set(
            group.position.x,
            group.position.y + 0.12,
            group.position.z + zSign * 0.70
          );
        } else {
          // 通常ユニット（ヒーロー・召喚物等）はユニット下部（足元・手前）に配置
          this.tempVec.set(
            group.position.x,
            group.position.y + 0.05,
            group.position.z + zSign * 0.58
          );
        }

        this.tempVec.project(this.camera);
        const x = (this.tempVec.x * 0.5 + 0.5) * sz.w;
        const y = (-(this.tempVec.y * 0.5) + 0.5) * sz.h;
        group.userData.hudTag.style.left = `${x}px`;
        group.userData.hudTag.style.top = `${y}px`;
        const isSelected = this.currentSelectedPos &&
          this.currentSelectedPos.r === group.userData.r &&
          this.currentSelectedPos.c === group.userData.c;
        group.userData.hudTag.style.zIndex = isSelected ? '30' : `${Math.max(1, Math.round(y))}`;
      }
    }
  }

  syncHazards(phantomZones = [], poisonZones = [], traps = []) {
    while (this.hazardGroup.children.length > 0) {
      this.hazardGroup.remove(this.hazardGroup.children[0]);
    }

    const addHazardAt = (r, c, type, colorHex) => {
      const wPos = this.gridToWorld(r, c);
      const grp = new THREE.Group();
      // Elevate above tile surface (world Y = 0.145) to ensure crisp layered rendering
      grp.position.set(wPos.x, 0.145, wPos.z);
      grp.userData = {
        type,
        r,
        c,
        colorHex,
        rotSpeed: (type === 'phantom' ? 0.75 : (type === 'poison' ? 0.55 : 0.95))
      };

      // 1. Outer Cyber Hex Ring
      const outerGeo = new THREE.RingGeometry(0.72, 0.88, 6);
      const outerMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.88,
        depthWrite: false
      });
      const outer = new THREE.Mesh(outerGeo, outerMat);
      outer.rotation.x = -Math.PI / 2;
      outer.renderOrder = 12;
      grp.add(outer);
      grp.userData.outer = outer;

      // 2. Inner Rotating Segments
      const innerSides = (type === 'poison') ? 3 : (type === 'trap' ? 4 : 6);
      const innerGeo = new THREE.RingGeometry(0.30, 0.44, innerSides);
      const innerMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.68,
        depthWrite: false
      });
      const inner = new THREE.Mesh(innerGeo, innerMat);
      inner.rotation.x = -Math.PI / 2;
      inner.renderOrder = 12;
      grp.add(inner);
      grp.userData.inner = inner;

      // 3. Central Hologram Core Glyph
      const coreGeo = new THREE.CircleGeometry(0.11, (type === 'trap' ? 4 : 6));
      const coreMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.78,
        depthWrite: false
      });
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.rotation.x = -Math.PI / 2;
      core.renderOrder = 13;
      grp.add(core);
      grp.userData.core = core;

      this.hazardGroup.add(grp);
    };

    phantomZones.forEach(z => addHazardAt(z.r, z.c, 'phantom', 0xc084fc));
    poisonZones.forEach(z => addHazardAt(z.r, z.c, 'poison', 0x10b981));
    traps.forEach(tp => {
      if (isLocalPlayer(tp.owner)) {
        addHazardAt(tp.r, tp.c, 'trap', 0xf97316);
      }
    });
  }

  updateTileHighlights({
    moveTargets,
    attackTargets,
    skillTargets,
    commandMode,
    gamePhase,
    deployOwner,
    selectedHazardPos = null,
    phantomZones = [],
    poisonZones = [],
    traps = []
  }) {
    this.validMoveCoords = [];
    this.hazardMoveCoords = [];
    this.validAttackCoords = [];
    this.validSkillCoords = [];
    this.deployCoords = [];
    this.selectedHazardCoord = selectedHazardPos || null;

    for (let r = 0; r < this.BOARD_SIZE; r++) {
      for (let c = 0; c < this.BOARD_SIZE; c++) {
        const hl = this.tiles[r][c].userData.hlMesh;
        hl.material.opacity = 0;
        this.tiles[r][c].position.y = -0.12;
      }
    }

    // A. Deploy Phase
    if (gamePhase && gamePhase.startsWith('DEPLOY') && deployOwner) {
      const deployRows = (deployOwner === 'P1') ? [5, 6] : [0, 1];
      const colorHex = (deployOwner === 'P1') ? 0x00bbf9 : 0xff2e63;
      deployRows.forEach(r => {
        for (let c = 0; c < this.BOARD_SIZE; c++) {
          this.deployCoords.push({ r, c });
          const hl = this.tiles[r][c].userData.hlMesh;
          hl.material.color.setHex(colorHex);
          hl.material.opacity = 0.48;
          this.tiles[r][c].position.y = -0.08;
        }
      });
      return;
    }

    // B. Skill Target Mode
    if (commandMode && commandMode.startsWith('SKILL_')) {
      (skillTargets || []).forEach(({ r, c }) => {
        this.validSkillCoords.push({ r, c });
        const hl = this.tiles[r][c].userData.hlMesh;
        hl.material.color.setHex(0xf59e0b);
        hl.material.opacity = 0.92;
        this.tiles[r][c].position.y = -0.04;
      });
      return;
    }

    // C. Selected Hazard Focus Highlight
    if (selectedHazardPos && this.tiles[selectedHazardPos.r]?.[selectedHazardPos.c]) {
      const hl = this.tiles[selectedHazardPos.r][selectedHazardPos.c].userData.hlMesh;
      hl.material.color.setHex(0xc084fc);
      hl.material.opacity = 0.95;
      this.tiles[selectedHazardPos.r][selectedHazardPos.c].position.y = -0.04;
    }

    // D. Normal Selected Piece (Moves & Attacks) with Hazard Conflict Resolution
    (moveTargets || []).forEach(({ r, c }) => {
      // Check if this moveable tile contains a hazard/trap
      const isPhantom = (phantomZones || []).some(z => z.r === r && z.c === c);
      const isPoison = (poisonZones || []).some(z => z.r === r && z.c === c);
      const isTrap = (traps || []).some(t => t.r === r && t.c === c && isLocalPlayer(t.owner));

      const hl = this.tiles[r][c].userData.hlMesh;
      this.tiles[r][c].position.y = -0.06;

      if (isPhantom || isPoison || isTrap) {
        // HAZARD CONFLICT RESOLUTION:
        // Use distinctive warning composite color so the player clearly perceives "Valid Move + Hazard Zone"
        this.hazardMoveCoords.push({ r, c, isPhantom, isPoison, isTrap });
        if (isPhantom) {
          hl.material.color.setHex(0xd946ef); // Neon Magenta/Purple Caution
        } else if (isPoison) {
          hl.material.color.setHex(0x06b6d4); // Cyan-Poison Emerald Caution
        } else {
          hl.material.color.setHex(0xf59e0b); // Hazard Orange/Amber
        }
        hl.material.opacity = 0.92;
      } else {
        // Standard safe move highlight
        this.validMoveCoords.push({ r, c });
        hl.material.color.setHex(0x00e5ff);
        hl.material.opacity = 0.85;
      }
    });

    (attackTargets || []).forEach(({ r, c }) => {
      this.validAttackCoords.push({ r, c });
      const hl = this.tiles[r][c].userData.hlMesh;
      hl.material.color.setHex(0xff2e63);
      hl.material.opacity = 0.92;
      this.tiles[r][c].position.y = -0.02;
    });
  }

  updateUltGauges(allyUlt, enemyUlt, isBlueAlly = true) {
    const allyFill = document.getElementById('ally-ult-fill');
    const allyVal = document.getElementById('ally-ult-val');
    const allyHud = document.getElementById('ally-ult-hud');
    const allyName = document.getElementById('ally-ult-name');

    const aVal = Math.min(100, Math.floor(allyUlt || 0));
    if (allyFill) allyFill.style.width = `${aVal}%`;
    if (allyVal) allyVal.innerText = aVal >= 100 ? 'MAX' : `${aVal}%`;
    if (allyHud) {
      allyHud.classList.toggle('ready', aVal >= 100);
      allyHud.classList.toggle('blue-team', isBlueAlly);
      allyHud.classList.toggle('red-team', !isBlueAlly);
    }
    if (allyName) allyName.innerText = isBlueAlly ? 'ALLY BLUE ULT' : 'ALLY RED ULT';

    const enemyFill = document.getElementById('enemy-ult-fill');
    const enemyVal = document.getElementById('enemy-ult-val');
    const enemyHud = document.getElementById('enemy-ult-hud');
    const enemyName = document.getElementById('enemy-ult-name');

    const eVal = Math.min(100, Math.floor(enemyUlt || 0));
    if (enemyFill) enemyFill.style.width = `${eVal}%`;
    if (enemyVal) enemyVal.innerText = eVal >= 100 ? 'MAX' : `${eVal}%`;
    if (enemyHud) {
      enemyHud.classList.toggle('warning-ready', eVal >= 100);
      enemyHud.classList.toggle('blue-team', !isBlueAlly);
      enemyHud.classList.toggle('red-team', isBlueAlly);
    }
    if (enemyName) enemyName.innerText = isBlueAlly ? 'ENEMY RED ULT' : 'ENEMY BLUE ULT';
  }

  /* ------------------------------------------------------------------------
     6. COMBAT VFX & ANIMATIONS
     ------------------------------------------------------------------------ */
  spawnDamagePopup(r, c, dmgText, colorHex = '#ffffff', isHeal = false) {
    const sz = this.getViewportSize();
    const wPos = this.gridToWorld(r, c);
    wPos.y += 1.2;
    wPos.project(this.camera);

    const x = (wPos.x * 0.5 + 0.5) * sz.w;
    const y = (-(wPos.y * 0.5) + 0.5) * sz.h;

    const key = `${r},${c}`;
    const stackIdx = this.popupCountMap.get(key) || 0;
    this.popupCountMap.set(key, stackIdx + 1);
    setTimeout(() => {
      const cur = this.popupCountMap.get(key) || 1;
      this.popupCountMap.set(key, Math.max(0, cur - 1));
    }, 450);

    const el = document.createElement('div');
    el.className = `ba-dmg-popup ${isHeal ? 'heal' : ''}`;
    el.innerHTML = `<div class="ba-dmg-num" style="font-size: 26px; text-shadow: 2px 2px 0 ${colorHex};">${dmgText}</div>`;
    el.style.left = `${x}px`;
    el.style.top = `${y - stackIdx * 28}px`;
    this.labelsContainer.appendChild(el);

    gsap.fromTo(el,
      { scale: 0.4, opacity: 0, y: 8 },
      {
        scale: 1.05, opacity: 1, y: -28, duration: 0.22, ease: 'back.out(2.2)',
        onComplete: () => {
          gsap.to(el, { opacity: 0, y: -52, duration: 0.3, delay: 0.45, onComplete: () => el.remove() });
        }
      }
    );
  }

  spawnShockwave(worldPos, colorHex = 0x0096fa) {
    const ringGeo = new THREE.RingGeometry(0.2, 0.45, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(worldPos.x, 0.22, worldPos.z);
    this.scene.add(ring);

    gsap.to(ring.scale, { x: 4.5, y: 4.5, z: 4.5, duration: 0.4, ease: 'power2.out' });
    gsap.to(ringMat, { opacity: 0, duration: 0.4, onComplete: () => this.scene.remove(ring) });
  }

  playAttackAnimation(attackerPos, targetPos, isUlt = false, onComplete) {
    const startPos = this.gridToWorld(attackerPos.r, attackerPos.c);
    const targetWorld = this.gridToWorld(targetPos.r, targetPos.c);
    const midPoint = startPos.clone().lerp(targetWorld, 0.5);
    const lungePos = startPos.clone().lerp(targetWorld, 0.65);

    this.spawnShockwave(targetWorld, isUlt ? 0xf59e0b : 0xff2e63);

    const dist = startPos.distanceTo(targetWorld);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(isUlt ? 0.34 : 0.14, isUlt ? 0.34 : 0.14, dist + 1.2, 12),
      new THREE.MeshBasicMaterial({ color: isUlt ? 0xf59e0b : 0x00bbf9 })
    );
    beam.position.copy(midPoint);
    beam.position.y = 0.45;
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), targetWorld.clone().sub(startPos).normalize());
    this.scene.add(beam);
    gsap.to(beam.scale, { x: 0.01, z: 0.01, duration: 0.3, onComplete: () => this.scene.remove(beam) });

    let attackerGroup = null;
    for (const group of this.unitMeshes.values()) {
      if (group.userData.r === attackerPos.r && group.userData.c === attackerPos.c) {
        attackerGroup = group;
        break;
      }
    }

    if (attackerGroup) {
      gsap.to(attackerGroup.position, {
        x: lungePos.x, y: 0.65, z: lungePos.z, duration: 0.14, yoyo: true, repeat: 1,
        onComplete: () => {
          attackerGroup.position.x = startPos.x;
          attackerGroup.position.z = startPos.z;
          if (onComplete) onComplete();
        }
      });
    } else if (onComplete) {
      onComplete();
    }
  }

  playCutin(unit, isUlt = true, onComplete) {
    const overlay = document.getElementById('ex-cutin-overlay');
    const slash = document.getElementById('cutin-slash');
    const charImg = document.getElementById('cutin-img');
    if (!overlay || !slash || !charImg) {
      if (onComplete) onComplete();
      return;
    }

    charImg.src = this.getHeroImageSrc(unit);
    document.getElementById('cutin-badge').innerText = isUlt ? 'ULTIMATE OVERDRIVE' : 'TACTICAL SKILL';

    const def = HERO_TYPES[unit.typeKey];
    const skillTitle = isUlt ? (def?.skills?.ULT?.name || 'アルティメット') : (def?.skills?.A?.name || 'タクティカルスキル');
    document.getElementById('cutin-title').innerText = skillTitle;

    const quotes = {
      KINESIS: '「目標捕捉――音速を超えて貫きます！」',
      VECTOR: '「防衛ライン展開完了。一歩も通しません。」',
      HIVE: '「自律ビット全機リンク！ハチの巣にしちゃえー♪」',
      IRIS: '「ナノマシン医療フィールド展開！皆さんを守ります！」',
      NITRO: '「ハハッ！まとめて吹き飛ぶ準備はいい！？」',
      PHASE: '「……影からは誰も逃れられない。」',
      GLITCH: '「空間歪曲――座標書き換え完了。」',
      CYPHER: '「ハッキング完了。すべての回路を支配する！」',
      VULCAN: '「フォートレス・モード展開！一斉掃射開始！」',
      TOXIN: '「毒素充填完了……ジワジワ溶かしてあげるわ。」',
      NEXUS: '「戦術リンク接続完了！全機出力ブースト！」',
      AURA: '「聖域フィールド展開――光の盾よ！」'
    };
    document.getElementById('cutin-voice').innerText = quotes[unit.typeKey] || '「作戦コード発動――排除を開始する！」';

    overlay.style.visibility = 'visible';
    gsap.to(overlay, { opacity: 1, duration: 0.14 });
    gsap.fromTo(slash, { scaleY: 0, rotate: -6 }, { scaleY: 1, rotate: -6, duration: 0.24, ease: 'back.out(1.6)' });
    gsap.fromTo(charImg, { x: -150, opacity: 0 }, { x: 0, opacity: 1, duration: 0.3, ease: 'power3.out' });

    setTimeout(() => {
      gsap.to(slash, { scaleY: 0, duration: 0.18 });
      gsap.to(overlay, {
        opacity: 0, duration: 0.2,
        onComplete: () => {
          overlay.style.visibility = 'hidden';
          if (onComplete) onComplete();
        }
      });
    }, 950);
  }

  /* ------------------------------------------------------------------------
     7. POINTER INTERACTION (3D LIFT DRAG-AND-DROP & CLICK RAYCASTING)
     ------------------------------------------------------------------------ */
  getGridCoordsFromEvent(e, ignoreGroup = null) {
    const rect = this.viewportEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // 1. Check unit hits first (excluding ignored/dragged group)
    const allMeshes = Array.from(this.unitMeshes.values()).filter(g => g !== ignoreGroup);
    const unitHits = this.raycaster.intersectObjects(allMeshes, true);
    if (unitHits.length > 0) {
      let obj = unitHits[0].object;
      while (obj && (!obj.userData || !this.unitMeshes.has(obj.userData.id))) {
        obj = obj.parent;
      }
      if (obj && obj.userData && obj.userData.r !== undefined) {
        return { r: obj.userData.r, c: obj.userData.c };
      }
    }

    // 2. Check tile hits
    const tileHits = this.raycaster.intersectObjects(this.tileGroup.children, true);
    if (tileHits.length > 0) {
      let tileObj = tileHits[0].object;
      while (tileObj && (!tileObj.userData || tileObj.userData.r === undefined)) {
        tileObj = tileObj.parent;
      }
      if (tileObj && tileObj.userData) {
        return { r: tileObj.userData.r, c: tileObj.userData.c };
      }
    }

    return null;
  }

  findUnitGroupAt(r, c) {
    for (const group of this.unitMeshes.values()) {
      if (group.userData.r === r && group.userData.c === c) {
        return group;
      }
    }
    return null;
  }

  canLiftGroup(group) {
    if (!group || !group.userData || !group.userData.unit) return false;
    const u = group.userData.unit;

    // During SKILL targeting mode, clicks are used to pick the skill target
    if (this.currentCommandMode && this.currentCommandMode.startsWith('SKILL_')) {
      return false;
    }

    // Deploy phase: any friendly piece (including Core) in current deploy owner's team can be dragged
    if (this.currentGamePhase === 'DEPLOY_P1' || this.currentGamePhase === 'DEPLOY_P2') {
      return u.owner === this.currentDeployOwner;
    }

    // Battle phase: friendly movable/controllable units (excluding Core, Barricade, Turret)
    if (this.currentGamePhase === 'BATTLE') {
      const isControllableUnit = (u.typeKey !== 'CORE' && u.typeKey !== 'BARRICADE' && u.typeKey !== 'TURRET');
      return isControllableUnit && u.owner === this.currentTurn;
    }

    return false;
  }

  handlePointerDown(e) {
    if (e.button !== 0) return;
    if (e.target && e.target.closest('button, .battle-log-drawer, .top-left-turn-hud')) return;

    const coords = this.getGridCoordsFromEvent(e);
    if (!coords) {
      this.pointerDownInfo = null;
      this.dragState = null;
      return;
    }

    const group = this.findUnitGroupAt(coords.r, coords.c);
    if (group && this.canLiftGroup(group)) {
      this.pointerDownInfo = null;
      this.dragState = {
        group,
        fromR: coords.r,
        fromC: coords.c,
        startX: e.clientX,
        startY: e.clientY,
        isDragging: false
      };

      if (this.viewportEl.setPointerCapture) {
        try { this.viewportEl.setPointerCapture(e.pointerId); } catch (_) {}
      }

      if (this.onPieceDragStartCallback) {
        this.onPieceDragStartCallback(coords.r, coords.c);
      }

      // Immediately lift the 3D piece up when grabbed
      this.viewportEl.style.cursor = 'grabbing';
      gsap.to(group.position, { y: 0.95, duration: 0.16, ease: 'back.out(2)', overwrite: 'auto' });
      gsap.to(group.scale, { x: 1.08, y: 1.08, z: 1.08, duration: 0.16, overwrite: 'auto' });
      return;
    }

    this.pointerDownInfo = {
      r: coords.r,
      c: coords.c,
      x: e.clientX,
      y: e.clientY
    };
  }

  handlePointerMove(e) {
    if (!this.dragState) {
      const hoverCoords = this.getGridCoordsFromEvent(e);
      if (hoverCoords) {
        const grp = this.findUnitGroupAt(hoverCoords.r, hoverCoords.c);
        this.viewportEl.style.cursor = (grp && this.canLiftGroup(grp)) ? 'grab' : 'pointer';
      } else {
        this.viewportEl.style.cursor = 'default';
      }
      return;
    }

    const { group, startX, startY } = this.dragState;
    const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
    if (dist > 4) {
      this.dragState.isDragging = true;
    }

    const rect = this.viewportEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    if (this.raycaster.ray.intersectPlane(this.dragPlane, this.dragIntersect)) {
      const clampedX = Math.max(-9.0, Math.min(9.0, this.dragIntersect.x));
      const clampedZ = Math.max(-9.0, Math.min(9.0, this.dragIntersect.z));
      group.position.x = clampedX;
      group.position.z = clampedZ;
      group.position.y = 0.95;

      if (this.selectRingGroup) {
        this.selectRingGroup.position.set(clampedX, 0.04, clampedZ);
      }
    }
  }

  handlePointerUp(e) {
    if (e.button !== 0 && e.type !== 'pointercancel') return;
    if (this.viewportEl.releasePointerCapture && e.pointerId !== undefined) {
      try { this.viewportEl.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    this.viewportEl.style.cursor = 'default';

    if (this.dragState) {
      const { group, fromR, fromC, isDragging } = this.dragState;
      this.dragState = null;

      gsap.to(group.scale, { x: 1, y: 1, z: 1, duration: 0.18, overwrite: 'auto' });

      const upCoords = this.getGridCoordsFromEvent(e, group);

      if (isDragging && upCoords && (upCoords.r !== fromR || upCoords.c !== fromC)) {
        if (this.onPieceDropCallback) {
          this.onPieceDropCallback(fromR, fromC, upCoords.r, upCoords.c);
        }
        if (this.onPieceDragEndCallback) {
          this.onPieceDragEndCallback();
        }
        return;
      }

      // Released without dragging to another tile: return to original tile & keep selected
      const homePos = this.gridToWorld(fromR, fromC);
      gsap.to(group.position, {
        x: homePos.x,
        y: group.userData.isCore ? 0 : 0.36,
        z: homePos.z,
        duration: 0.2,
        ease: 'power2.out',
        overwrite: 'auto'
      });
      if (this.selectRingGroup) {
        this.selectRingGroup.position.set(homePos.x, 0.04, homePos.z);
      }
      if (this.onPieceDragEndCallback) {
        this.onPieceDragEndCallback();
      }
      return;
    }

    if (e.target && e.target.closest('button, .battle-log-drawer, .top-left-turn-hud')) return;

    const upCoords = this.getGridCoordsFromEvent(e);
    const downInfo = this.pointerDownInfo;
    this.pointerDownInfo = null;

    if (!upCoords || !downInfo) return;

    if (this.onTileClickCallback) {
      this.onTileClickCallback(upCoords.r, upCoords.c);
    }
  }

  /* ------------------------------------------------------------------------
     8. MAIN RENDER LOOP
     ------------------------------------------------------------------------ */
  startLoop() {
    const loop = (now) => {
      requestAnimationFrame(loop);
      const t = now * 0.002;

      if (this.selectRingGroup) {
        this.selectRingGroup.rotation.y = t * 0.8;
      }

      if (this.blueCoreObj && this.blueCoreObj.userData.crystal) {
        this.blueCoreObj.userData.crystal.rotation.y = t;
        this.blueCoreObj.userData.ring.rotation.z = t * 1.2;
      }
      if (this.redCoreObj && this.redCoreObj.userData.crystal) {
        this.redCoreObj.userData.crystal.rotation.y = -t;
        this.redCoreObj.userData.ring.rotation.z = -t * 1.2;
      }

      // Holographic Hazard Field Animations (Rotation & Breathing Glow)
      if (this.hazardGroup) {
        this.hazardGroup.children.forEach(grp => {
          if (grp.userData.outer) {
            grp.userData.outer.rotation.z = t * (grp.userData.rotSpeed || 0.7);
            grp.userData.outer.material.opacity = 0.72 + Math.sin(t * 3.2) * 0.22;
          }
          if (grp.userData.inner) {
            grp.userData.inner.rotation.z = -t * (grp.userData.rotSpeed || 0.7) * 1.6;
            grp.userData.inner.material.opacity = 0.55 + Math.cos(t * 3.2) * 0.20;
          }
          if (grp.userData.core) {
            const sc = 0.85 + Math.sin(t * 4.0) * 0.25;
            grp.userData.core.scale.set(sc, sc, 1);
          }
        });
      }

      // Safe Moves (Standard cyan breathing pulse)
      const pulse = 0.68 + Math.sin(t * 3.0) * 0.22;
      this.validMoveCoords.forEach(({ r, c }) => {
        if (this.tiles[r]?.[c]) {
          this.tiles[r][c].userData.hlMesh.material.opacity = pulse * 0.85;
        }
      });

      // Hazard Move Conflict Tiles (High-tempo Warning Strobe)
      const hazardMovePulse = 0.75 + Math.sin(t * 6.5) * 0.24;
      this.hazardMoveCoords.forEach(({ r, c }) => {
        if (this.tiles[r]?.[c]) {
          this.tiles[r][c].userData.hlMesh.material.opacity = hazardMovePulse;
        }
      });

      // Selected Hazard Tile (Focus pulse)
      if (this.selectedHazardCoord && this.tiles[this.selectedHazardCoord.r]?.[this.selectedHazardCoord.c]) {
        const selPulse = 0.80 + Math.sin(t * 4.0) * 0.18;
        this.tiles[this.selectedHazardCoord.r][this.selectedHazardCoord.c].userData.hlMesh.material.opacity = selPulse;
      }

      this.validAttackCoords.forEach(({ r, c }) => {
        if (this.tiles[r]?.[c]) {
          this.tiles[r][c].userData.hlMesh.material.opacity = pulse;
        }
      });
      this.validSkillCoords.forEach(({ r, c }) => {
        if (this.tiles[r]?.[c]) {
          this.tiles[r][c].userData.hlMesh.material.opacity = pulse;
        }
      });
      this.deployCoords.forEach(({ r, c }) => {
        if (this.tiles[r]?.[c]) {
          this.tiles[r][c].userData.hlMesh.material.opacity = 0.35 + Math.sin(t * 2.0) * 0.12;
        }
      });

      this.updateHudPositions();

      this.renderer.render(this.scene, this.camera);
    };
    requestAnimationFrame(loop);
  }
}
