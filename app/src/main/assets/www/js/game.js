// Ghost Runner 3D - Three.js Neon Endless Runner
// Designed for mobile & desktop with high performance and smooth controls.

(function () {
  'use strict';

  // --- Constants & Config ---
  const TEST_MODE = new URLSearchParams(window.location.search).has('test');
  const LANES = [-3.2, 0.0, 3.2];
  const INITIAL_SPEED = 26;
  const MAX_SPEED = 52;
  const SPEED_ACCEL = 0.35; // speed increase per 100 meters
  const JUMP_FORCE = 15;
  const GRAVITY = 38;
  const SLIDE_DURATION = 0.65;
  const CHUNK_LENGTH = 50;
  const VISIBLE_CHUNKS = 7;

  // --- Game State Variables ---
  let scene, camera, renderer;
  let playerGroup, playerBody, playerHead, playerLimbs = [], shieldMesh, playerLight;
  let trailParticles, starField;
  
  let currentLane = 1; // 0: Left, 1: Center, 2: Right
  let targetX = LANES[1];
  let isJumping = false;
  let isSliding = false;
  let velocityY = 0;
  let slideTimer = 0;
  
  let speed = INITIAL_SPEED;
  let distance = 0;
  let score = 0;
  let coins = 0;
  let multiplier = 1;
  let shieldActive = false;
  let shieldTimer = 0;
  let invulnerableTimer = 0;

  let gameState = 'START'; // 'START', 'PLAYING', 'PAUSED', 'GAMEOVER'
  let clock = new THREE.Clock();

  // Procedural pools
  let trackChunks = [];
  let obstacles = [];
  let collectibles = [];
  let fxParticles = [];
  let nextSpawnZ = -30;
  let highestZ = 0;

  // UI Elements
  const ui = {
    scoreVal: document.getElementById('score-val'),
    distVal: document.getElementById('distance-val'),
    coinsVal: document.getElementById('coins-val'),
    multVal: document.getElementById('multiplier-val'),
    powerupBadge: document.getElementById('powerup-badge'),
    floatNotice: document.getElementById('float-notice'),
    startOverlay: document.getElementById('start-overlay'),
    gameoverOverlay: document.getElementById('gameover-overlay'),
    pauseOverlay: document.getElementById('pause-overlay'),
    startBestScore: document.getElementById('start-best-score'),
    startBestCoins: document.getElementById('start-best-coins'),
    goScore: document.getElementById('go-score'),
    goDistance: document.getElementById('go-distance'),
    goCoins: document.getElementById('go-coins'),
    goBestScore: document.getElementById('go-best-score'),
    btnStart: document.getElementById('btn-start-game'),
    btnRestart: document.getElementById('btn-restart-game'),
    btnResume: document.getElementById('btn-resume-game'),
    btnLeft: document.getElementById('btn-left'),
    btnRight: document.getElementById('btn-right'),
    btnJump: document.getElementById('btn-jump'),
    btnSlide: document.getElementById('btn-slide'),
    btnSound: document.getElementById('btn-sound'),
    btnMusic: document.getElementById('btn-music'),
    btnPause: document.getElementById('btn-pause'),
    btnFs: document.getElementById('btn-fs'),
    canvas: document.getElementById('game-canvas'),
  };

  // Stored Records
  let highScore = parseInt(localStorage.getItem('ghostrunner_best_score') || '0', 10);
  let bestCoins = parseInt(localStorage.getItem('ghostrunner_best_coins') || '0', 10);
  ui.startBestScore.textContent = highScore.toLocaleString();
  ui.startBestCoins.textContent = bestCoins.toLocaleString();

  // --- Texture Helpers ---
  function createGridTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0a0218';
    ctx.fillRect(0, 0, 128, 128);

    // Neon grid lines
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#2d0c5a';
    ctx.strokeRect(0, 0, 128, 128);

    ctx.strokeStyle = 'rgba(0, 240, 255, 0.45)';
    ctx.beginPath();
    ctx.moveTo(0, 64);
    ctx.lineTo(128, 64);
    ctx.moveTo(64, 0);
    ctx.lineTo(64, 128);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 8);
    return texture;
  }

  // --- Init Three.js Scene ---
  function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080114);
    scene.fog = new THREE.FogExp2(0x080114, 0.016);

    camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 400);
    camera.position.set(0, 4.6, 7.5);

    renderer = new THREE.WebGLRenderer({
      canvas: ui.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Lights
    const ambientLight = new THREE.AmbientLight(0x280638, 1.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x00f0ff, 1.0);
    dirLight.position.set(5, 12, 10);
    scene.add(dirLight);

    const hemiLight = new THREE.HemisphereLight(0x00f0ff, 0xff007f, 0.6);
    scene.add(hemiLight);

    // Build Synthwave Horizon Sun & Distant Elements
    createHorizonBackdrop();

    // Build Player Model
    createPlayer();

    // Initial Track Segments
    for (let i = 0; i < VISIBLE_CHUNKS; i++) {
      spawnTrackChunk(-i * CHUNK_LENGTH);
    }

    // Distant Star Field
    createStarfield();

    // Window Resizing
    window.addEventListener('resize', onWindowResize);
  }

  // --- Horizon Sun & Backdrop ---
  function createHorizonBackdrop() {
    // Neon Horizon Sun
    const sunGeo = new THREE.CircleGeometry(45, 32);
    const sunMat = new THREE.MeshBasicMaterial({
      color: 0xff007f,
      fog: false,
      side: THREE.DoubleSide
    });
    const sun = new THREE.Mesh(sunGeo, sunMat);
    sun.position.set(0, 15, -280);
    scene.add(sun);

    // Sun horizontal stripes
    for (let i = -15; i < 15; i += 4) {
      const stripeGeo = new THREE.PlaneGeometry(80, 1.2);
      const stripeMat = new THREE.MeshBasicMaterial({ color: 0x080114, fog: false });
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.position.set(0, 15 + i, -279);
      scene.add(stripe);
    }
  }

  // --- Starfield Dust Particles ---
  function createStarfield() {
    const starCount = 350;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);

    const c1 = new THREE.Color(0x00f0ff);
    const c2 = new THREE.Color(0xff007f);
    const c3 = new THREE.Color(0xffd700);

    for (let i = 0; i < starCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 120;
      positions[i * 3 + 1] = Math.random() * 50 + 2;
      positions[i * 3 + 2] = -Math.random() * 320;

      const pick = Math.random();
      const col = pick < 0.4 ? c1 : pick < 0.7 ? c2 : c3;
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 1.8,
      vertexColors: true,
      transparent: true,
      opacity: 0.8
    });

    starField = new THREE.Points(geometry, material);
    scene.add(starField);
  }

  // --- Player Avatar Model ---
  function createPlayer() {
    playerGroup = new THREE.Group();
    playerGroup.position.set(0, 0, 0);

    // Torso / Jet chassis
    const bodyGeo = new THREE.CylinderGeometry(0.38, 0.28, 1.2, 8);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x0d0d1a,
      roughness: 0.3,
      metalness: 0.9,
      emissive: 0x110222
    });
    playerBody = new THREE.Mesh(bodyGeo, bodyMat);
    playerBody.position.y = 1.0;
    playerGroup.add(playerBody);

    // Neon Cyber Core / Armor Stripes
    const coreGeo = new THREE.SphereGeometry(0.22, 12, 12);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.set(0, 1.1, 0.25);
    playerGroup.add(core);

    // Head / Visor
    const headGeo = new THREE.SphereGeometry(0.32, 12, 12);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x181828,
      metalness: 0.8,
      roughness: 0.2
    });
    playerHead = new THREE.Mesh(headGeo, headMat);
    playerHead.position.set(0, 1.8, 0.05);
    playerGroup.add(playerHead);

    const visorGeo = new THREE.BoxGeometry(0.42, 0.14, 0.2);
    const visorMat = new THREE.MeshBasicMaterial({ color: 0xff007f });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.8, 0.26);
    playerGroup.add(visor);

    // Jet Wings / Hover Thrusters
    const wingGeo = new THREE.BoxGeometry(1.6, 0.1, 0.4);
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0x220538,
      emissive: 0x00f0ff,
      emissiveIntensity: 0.4
    });
    const wings = new THREE.Mesh(wingGeo, wingMat);
    wings.position.set(0, 1.15, -0.2);
    playerGroup.add(wings);

    // Cyber Limbs
    const limbMat = new THREE.MeshStandardMaterial({ color: 0x00f0ff, roughness: 0.5 });
    for (let i = -1; i <= 1; i += 2) {
      const legGeo = new THREE.CylinderGeometry(0.1, 0.08, 0.7, 6);
      const leg = new THREE.Mesh(legGeo, limbMat);
      leg.position.set(i * 0.25, 0.35, 0);
      playerGroup.add(leg);
      playerLimbs.push(leg);
    }

    // Dynamic Neon Light under the player
    playerLight = new THREE.PointLight(0x00f0ff, 2.5, 14);
    playerLight.position.set(0, 1.0, 0);
    playerGroup.add(playerLight);

    // Shield Bubble (hidden initially)
    const shieldGeo = new THREE.SphereGeometry(1.6, 16, 16);
    const shieldMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      wireframe: true,
      transparent: true,
      opacity: 0.45
    });
    shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    shieldMesh.position.set(0, 1.2, 0);
    shieldMesh.visible = false;
    playerGroup.add(shieldMesh);

    scene.add(playerGroup);
  }

  // --- Track Generation ---
  function spawnTrackChunk(zPos) {
    const chunk = new THREE.Group();
    chunk.position.z = zPos;

    // Runway Road Surface
    const roadWidth = 10.5;
    const roadGeo = new THREE.PlaneGeometry(roadWidth, CHUNK_LENGTH);
    const roadMat = new THREE.MeshStandardMaterial({
      map: createGridTexture(),
      roughness: 0.4,
      metalness: 0.6
    });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, -CHUNK_LENGTH / 2);
    chunk.add(road);

    // Glowing Neon Rails (Left Magenta, Right Cyan)
    const railGeo = new THREE.BoxGeometry(0.25, 0.35, CHUNK_LENGTH);
    const railMatLeft = new THREE.MeshBasicMaterial({ color: 0xff007f });
    const railMatRight = new THREE.MeshBasicMaterial({ color: 0x00f0ff });

    const leftRail = new THREE.Mesh(railGeo, railMatLeft);
    leftRail.position.set(-roadWidth / 2, 0.2, -CHUNK_LENGTH / 2);
    chunk.add(leftRail);

    const rightRail = new THREE.Mesh(railGeo, railMatRight);
    rightRail.position.set(roadWidth / 2, 0.2, -CHUNK_LENGTH / 2);
    chunk.add(rightRail);

    // Neon Light Arches along track
    for (let step = 10; step < CHUNK_LENGTH; step += 25) {
      const archGeo = new THREE.BoxGeometry(roadWidth + 0.5, 0.2, 0.2);
      const archMat = new THREE.MeshBasicMaterial({ color: step % 50 === 10 ? 0xff007f : 0x00f0ff });
      const arch = new THREE.Mesh(archGeo, archMat);
      arch.position.set(0, 4.2, -step);
      chunk.add(arch);

      // Side pillars
      const pillarGeo = new THREE.BoxGeometry(0.2, 4.2, 0.2);
      const pillarL = new THREE.Mesh(pillarGeo, archMat);
      pillarL.position.set(-(roadWidth + 0.5) / 2, 2.1, -step);
      chunk.add(pillarL);

      const pillarR = new THREE.Mesh(pillarGeo, archMat);
      pillarR.position.set((roadWidth + 0.5) / 2, 2.1, -step);
      chunk.add(pillarR);
    }

    // Side floating monoliths for depth
    const monoGeo = new THREE.BoxGeometry(1.5, 8, 1.5);
    const monoMat = new THREE.MeshStandardMaterial({
      color: 0x120224,
      emissive: 0x3d0066,
      roughness: 0.6
    });
    const monoL = new THREE.Mesh(monoGeo, monoMat);
    monoL.position.set(-10 - Math.random() * 4, 3, -CHUNK_LENGTH / 2);
    chunk.add(monoL);

    const monoR = new THREE.Mesh(monoGeo, monoMat);
    monoR.position.set(10 + Math.random() * 4, 3, -CHUNK_LENGTH / 2);
    chunk.add(monoR);

    scene.add(chunk);
    trackChunks.push(chunk);
  }

  // --- Obstacle Creation: 3D Ghosts, Lasers, Barriers ---

  // 1. 3D Neon Ghost Specter
  function createGhostMesh() {
    const ghost = new THREE.Group();

    // Floating ruffled ghost body
    const bodyGeo = new THREE.SphereGeometry(0.85, 16, 16);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xff007f,
      emissive: 0xff007f,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.78,
      roughness: 0.2
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.scale.set(1, 1.4, 0.9);
    body.position.y = 1.3;
    ghost.add(body);

    // Ghost bottom skirt flares
    const flareGeo = new THREE.ConeGeometry(0.85, 0.9, 12);
    const flare = new THREE.Mesh(flareGeo, bodyMat);
    flare.rotation.x = Math.PI;
    flare.position.y = 0.6;
    ghost.add(flare);

    // Menacing glowing eyes
    const eyeGeo = new THREE.SphereGeometry(0.16, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.32, 1.55, 0.7);
    ghost.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.32, 1.55, 0.7);
    ghost.add(rightEye);

    ghost.userData = {
      type: 'GHOST',
      radius: 0.85,
      height: 2.2,
      initY: 0,
      bobOffset: Math.random() * Math.PI * 2
    };

    return ghost;
  }

  // 2. High Neon Laser Beam (Must SLIDE under)
  function createHighLaserMesh() {
    const laserGroup = new THREE.Group();

    // Laser Beam across lane
    const beamGeo = new THREE.CylinderGeometry(0.12, 0.12, 2.8, 8);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xff0055 });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.rotation.z = Math.PI / 2;
    beam.position.y = 1.8;
    laserGroup.add(beam);

    // Pylons on sides
    const pylonGeo = new THREE.BoxGeometry(0.3, 2.4, 0.3);
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0x220233, emissive: 0xff0055 });
    const pylonL = new THREE.Mesh(pylonGeo, pylonMat);
    pylonL.position.set(-1.4, 1.2, 0);
    laserGroup.add(pylonL);

    const pylonR = new THREE.Mesh(pylonGeo, pylonMat);
    pylonR.position.set(1.4, 1.2, 0);
    laserGroup.add(pylonR);

    laserGroup.userData = {
      type: 'HIGH_LASER',
      clearBySlide: true,
      minY: 1.4,
      maxY: 2.2
    };

    return laserGroup;
  }

  // 3. Low Energy Barrier (Must JUMP over)
  function createLowBarrierMesh() {
    const barrierGroup = new THREE.Group();

    const barGeo = new THREE.BoxGeometry(2.7, 0.5, 0.4);
    const barMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 0.9,
      roughness: 0.3
    });
    const bar = new THREE.Mesh(barGeo, barMat);
    bar.position.y = 0.35;
    barrierGroup.add(bar);

    barrierGroup.userData = {
      type: 'LOW_BARRIER',
      clearByJump: true,
      height: 0.7
    };

    return barrierGroup;
  }

  // --- Collectible Creation: Gold Coins & Shield Powerup ---
  function createGoldCoinMesh() {
    const coinGroup = new THREE.Group();

    // Golden cylindrical coin with spectral shine
    const coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.12, 16);
    const coinMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      metalness: 0.9,
      roughness: 0.2,
      emissive: 0xffa500,
      emissiveIntensity: 0.5
    });
    const coin = new THREE.Mesh(coinGeo, coinMat);
    coin.rotation.x = Math.PI / 2;
    coinGroup.add(coin);

    // Inner glowing ring
    const ringGeo = new THREE.RingGeometry(0.18, 0.3, 12);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.z = 0.07;
    coinGroup.add(ring);

    coinGroup.userData = {
      type: 'COIN',
      radius: 0.65
    };
    return coinGroup;
  }

  function createShieldPowerupMesh() {
    const powerGroup = new THREE.Group();

    const orbGeo = new THREE.SphereGeometry(0.5, 12, 12);
    const orbMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const orb = new THREE.Mesh(orbGeo, orbMat);
    powerGroup.add(orb);

    const ringGeo = new THREE.TorusGeometry(0.75, 0.06, 8, 20);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff007f });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    powerGroup.add(ring);

    powerGroup.userData = {
      type: 'SHIELD',
      radius: 0.8
    };
    return powerGroup;
  }

  // --- Spawning Patterns ---
  function spawnWorldObjects() {
    // Generate ahead of player
    while (nextSpawnZ > playerGroup.position.z - 220) {
      const z = nextSpawnZ;
      const patternChoice = Math.random();

      // Lane configuration (Ensure at least 1 lane is always safely passable)
      const freeLane = Math.floor(Math.random() * 3);

      if (patternChoice < 0.45) {
        // Spawn 1 or 2 Ghosts
        for (let l = 0; l < 3; l++) {
          if (l !== freeLane && (Math.random() < 0.7 || l === (freeLane + 1) % 3)) {
            const ghost = createGhostMesh();
            ghost.position.set(LANES[l], 0, z);
            scene.add(ghost);
            obstacles.push(ghost);
          }
        }
        // Place Gold Coins in the safe lane
        for (let c = 0; c < 3; c++) {
          const coin = createGoldCoinMesh();
          coin.position.set(LANES[freeLane], 1.0, z - (c * 2.5));
          scene.add(coin);
          collectibles.push(coin);
        }
      } else if (patternChoice < 0.7) {
        // Spawn High Laser Beam in freeLane or other lane
        const laserLane = Math.floor(Math.random() * 3);
        const laser = createHighLaserMesh();
        laser.position.set(LANES[laserLane], 0, z);
        scene.add(laser);
        obstacles.push(laser);

        // Gold coins placed low under laser beam to reward sliding!
        for (let c = 0; c < 3; c++) {
          const coin = createGoldCoinMesh();
          coin.position.set(LANES[laserLane], 0.4, z - (c * 2.2));
          scene.add(coin);
          collectibles.push(coin);
        }
      } else if (patternChoice < 0.9) {
        // Spawn Low Barrier (Jumpable) with coin arc over it
        const barLane = Math.floor(Math.random() * 3);
        const barrier = createLowBarrierMesh();
        barrier.position.set(LANES[barLane], 0, z);
        scene.add(barrier);
        obstacles.push(barrier);

        // Arc of coins over the low barrier
        const coin1 = createGoldCoinMesh();
        coin1.position.set(LANES[barLane], 1.2, z + 2.5);
        const coin2 = createGoldCoinMesh();
        coin2.position.set(LANES[barLane], 2.4, z); // Peak of jump
        const coin3 = createGoldCoinMesh();
        coin3.position.set(LANES[barLane], 1.2, z - 2.5);
        scene.add(coin1); scene.add(coin2); scene.add(coin3);
        collectibles.push(coin1, coin2, coin3);
      } else {
        // Power-up spawn (Shield or Coin shower)
        const pLane = Math.floor(Math.random() * 3);
        const shieldOrb = createShieldPowerupMesh();
        shieldOrb.position.set(LANES[pLane], 1.2, z);
        scene.add(shieldOrb);
        collectibles.push(shieldOrb);
      }

      // Advance spawn position with variable distance
      nextSpawnZ -= 26 + Math.random() * 12;
    }
  }

  // --- Floating Notice Display ---
  function showFloatingNotice(text, color = '#ffd700') {
    ui.floatNotice.textContent = text;
    ui.floatNotice.style.color = color;
    ui.floatNotice.style.textShadow = `0 0 15px ${color}`;
    ui.floatNotice.classList.add('show');
    setTimeout(() => {
      ui.floatNotice.classList.remove('show');
    }, 700);
  }

  // --- Controls Handlers ---
  function moveLeft() {
    if (gameState !== 'PLAYING') return;
    if (currentLane > 0) {
      currentLane--;
      targetX = LANES[currentLane];
      ui.btnLeft.classList.add('active');
      setTimeout(() => ui.btnLeft.classList.remove('active'), 120);
    }
  }

  function moveRight() {
    if (gameState !== 'PLAYING') return;
    if (currentLane < 2) {
      currentLane++;
      targetX = LANES[currentLane];
      ui.btnRight.classList.add('active');
      setTimeout(() => ui.btnRight.classList.remove('active'), 120);
    }
  }

  function jump() {
    if (gameState !== 'PLAYING') return;
    if (!isJumping && !isSliding) {
      isJumping = true;
      velocityY = JUMP_FORCE;
      window.__debug_jump_count = (window.__debug_jump_count || 0) + 1;
      if (window.soundSystem) window.soundSystem.playJump();
      ui.btnJump.classList.add('active');
      setTimeout(() => ui.btnJump.classList.remove('active'), 150);
    }
  }

  function slide() {
    if (gameState !== 'PLAYING') return;
    if (!isSliding) {
      isSliding = true;
      slideTimer = SLIDE_DURATION;
      if (isJumping) {
        velocityY = -18; // Quick slam down
      }
      if (window.soundSystem) window.soundSystem.playSlide();
      ui.btnSlide.classList.add('active');
      setTimeout(() => ui.btnSlide.classList.remove('active'), 150);
    }
  }

  // Keyboard controls
  window.addEventListener('keydown', (e) => {
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        moveLeft();
        break;
      case 'ArrowRight':
      case 'KeyD':
        moveRight();
        break;
      case 'ArrowUp':
      case 'KeyW':
      case 'Space':
        jump();
        break;
      case 'ArrowDown':
      case 'KeyS':
        slide();
        break;
      case 'KeyP':
      case 'Escape':
        togglePause();
        break;
    }
  });

  // Touch Swipe Controls
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;

  window.addEventListener('touchstart', (e) => {
    if (e.touches.length > 0) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();
    }
  }, { passive: true });

  window.addEventListener('touchend', (e) => {
    if (gameState !== 'PLAYING' || e.changedTouches.length === 0) return;

    const diffX = e.changedTouches[0].clientX - touchStartX;
    const diffY = e.changedTouches[0].clientY - touchStartY;
    const dt = Date.now() - touchStartTime;

    // Minimum threshold for swipe gesture
    if (dt < 400 && (Math.abs(diffX) > 28 || Math.abs(diffY) > 28)) {
      if (Math.abs(diffX) > Math.abs(diffY)) {
        if (diffX > 0) moveRight();
        else moveLeft();
      } else {
        if (diffY < 0) jump();
        else slide();
      }
    }
  }, { passive: true });

  // Mobile Buttons
  ui.btnLeft.addEventListener('click', (e) => { e.stopPropagation(); moveLeft(); });
  ui.btnRight.addEventListener('click', (e) => { e.stopPropagation(); moveRight(); });
  ui.btnJump.addEventListener('click', (e) => { e.stopPropagation(); jump(); });
  ui.btnSlide.addEventListener('click', (e) => { e.stopPropagation(); slide(); });

  // Header Buttons
  ui.btnSound.addEventListener('click', (e) => {
    e.stopPropagation();
    const enabled = window.soundSystem ? window.soundSystem.toggleSound() : true;
    ui.btnSound.textContent = enabled ? '🔊' : '🔇';
  });

  ui.btnMusic.addEventListener('click', (e) => {
    e.stopPropagation();
    const enabled = window.soundSystem ? window.soundSystem.toggleMusic() : true;
    ui.btnMusic.textContent = enabled ? '🎵' : '⏹️';
  });

  ui.btnPause.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePause();
  });

  ui.btnFs.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  ui.btnStart.addEventListener('click', () => startGame());
  ui.btnRestart.addEventListener('click', () => restartGame());
  ui.btnResume.addEventListener('click', () => togglePause());

  function togglePause() {
    if (gameState === 'PLAYING') {
      gameState = 'PAUSED';
      ui.pauseOverlay.classList.remove('hidden');
    } else if (gameState === 'PAUSED') {
      gameState = 'PLAYING';
      ui.pauseOverlay.classList.add('hidden');
      clock.getDelta(); // flush delta
    }
  }

  // --- Game Flow: Start, Restart, Over ---

  function startGame() {
    if (window.soundSystem) {
      window.soundSystem.init();
      window.soundSystem.startMusic();
    }
    ui.startOverlay.classList.add('hidden');
    ui.gameoverOverlay.classList.add('hidden');
    ui.pauseOverlay.classList.add('hidden');
    gameState = 'PLAYING';
    clock.start();
  }

  function restartGame() {
    // Reset positions and values
    distance = 0;
    score = 0;
    coins = 0;
    multiplier = 1;
    speed = INITIAL_SPEED;
    currentLane = 1;
    targetX = LANES[1];
    isJumping = false;
    isSliding = false;
    velocityY = 0;
    slideTimer = 0;
    shieldActive = false;
    shieldMesh.visible = false;
    ui.powerupBadge.style.display = 'none';

    playerGroup.position.set(0, 0, 0);
    playerGroup.scale.set(1, 1, 1);
    playerGroup.rotation.set(0, 0, 0);

    // Clear dynamic objects
    obstacles.forEach(o => scene.remove(o));
    collectibles.forEach(c => scene.remove(c));
    obstacles = [];
    collectibles = [];
    nextSpawnZ = -30;

    // Reset track chunks
    trackChunks.forEach(chunk => scene.remove(chunk));
    trackChunks = [];
    for (let i = 0; i < VISIBLE_CHUNKS; i++) {
      spawnTrackChunk(-i * CHUNK_LENGTH);
    }

    updateHUD();
    startGame();
  }

  function gameOver() {
    gameState = 'GAMEOVER';
    if (window.soundSystem) {
      window.soundSystem.playGameOver();
      window.soundSystem.stopMusic();
    }

    // Shake screen effect
    document.body.classList.add('shake');
    setTimeout(() => document.body.classList.remove('shake'), 450);

    // Save records
    if (score > highScore) {
      highScore = Math.floor(score);
      localStorage.setItem('ghostrunner_best_score', highScore);
    }
    if (coins > bestCoins) {
      bestCoins = coins;
      localStorage.setItem('ghostrunner_best_coins', bestCoins);
    }

    // Populate gameover screen
    ui.goScore.textContent = Math.floor(score).toLocaleString();
    ui.goDistance.textContent = `${Math.floor(distance)} m`;
    ui.goCoins.textContent = coins.toLocaleString();
    ui.goBestScore.textContent = highScore.toLocaleString();

    ui.gameoverOverlay.classList.remove('hidden');
  }

  function updateHUD() {
    ui.scoreVal.textContent = Math.floor(score).toLocaleString();
    ui.distVal.textContent = `${Math.floor(distance)} m`;
    ui.coinsVal.textContent = coins;
    ui.multVal.textContent = `x${multiplier}`;
  }

  // --- Main Game Loop Update ---
  function update(delta) {
    if (gameState !== 'PLAYING') return;

    // Constrain delta to prevent huge jumps
    const dt = Math.min(delta, 0.08);

    // Speed increase over distance
    speed = Math.min(MAX_SPEED, INITIAL_SPEED + (distance / 100) * SPEED_ACCEL);

    // Move player forward in negative Z
    const moveZ = speed * dt;
    playerGroup.position.z -= moveZ;
    distance += moveZ;
    score += moveZ * 0.8 * multiplier;

    // Multiplier bonus as distance grows
    multiplier = Math.min(4, 1 + Math.floor(distance / 250));

    // Smooth horizontal lane transition
    playerGroup.position.x += (targetX - playerGroup.position.x) * (dt * 15);
    // Dynamic bank tilt
    playerGroup.rotation.z = (playerGroup.position.x - targetX) * 0.12;

    // Handle Jump & Gravity
    if (isJumping) {
      playerGroup.position.y += velocityY * dt;
      velocityY -= GRAVITY * dt;

      if (playerGroup.position.y <= 0) {
        playerGroup.position.y = 0;
        isJumping = false;
        velocityY = 0;
      }
    }

    // Handle Slide
    if (isSliding) {
      slideTimer -= dt;
      playerGroup.scale.y = 0.45;
      playerGroup.position.y = -0.15;
      if (slideTimer <= 0) {
        isSliding = false;
        playerGroup.scale.y = 1.0;
        playerGroup.position.y = 0;
      }
    }

    // Limbs running animation
    if (!isJumping && !isSliding) {
      const runCycle = Date.now() * 0.015;
      playerLimbs[0].rotation.x = Math.sin(runCycle) * 0.5;
      playerLimbs[1].rotation.x = -Math.sin(runCycle) * 0.5;
      playerBody.position.y = 1.0 + Math.sin(runCycle * 2) * 0.06;
    } else {
      playerLimbs[0].rotation.x = 0;
      playerLimbs[1].rotation.x = 0;
    }

    // Shield status update
    if (shieldActive) {
      shieldMesh.rotation.y += 2 * dt;
      shieldTimer -= dt;
      if (shieldTimer <= 0) {
        shieldActive = false;
        shieldMesh.visible = false;
        ui.powerupBadge.style.display = 'none';
      }
    }

    // Invulnerability cooldown
    if (invulnerableTimer > 0) {
      invulnerableTimer -= dt;
      playerGroup.visible = Math.floor(Date.now() / 80) % 2 === 0;
    } else {
      playerGroup.visible = true;
    }

    // Camera following smoothly
    camera.position.z = playerGroup.position.z + 7.8;
    camera.position.x = playerGroup.position.x * 0.4;
    camera.position.y = 4.4 + (isJumping ? playerGroup.position.y * 0.3 : 0);
    camera.lookAt(playerGroup.position.x * 0.15, 1.4, playerGroup.position.z - 12);

    // Starfield follow
    if (starField) {
      starField.position.z = playerGroup.position.z;
    }

    // Recycle Track Chunks
    const firstChunk = trackChunks[0];
    if (firstChunk && firstChunk.position.z > playerGroup.position.z + CHUNK_LENGTH + 5) {
      const lastChunk = trackChunks[trackChunks.length - 1];
      const newZ = lastChunk.position.z - CHUNK_LENGTH;
      firstChunk.position.z = newZ;
      // Reorder in array
      trackChunks.shift();
      trackChunks.push(firstChunk);
    }

    // Spawn new obstacles & collectibles
    spawnWorldObjects();

    // Update Obstacles (Bobbing & Collision Detection)
    const pX = playerGroup.position.x;
    const pY = playerGroup.position.y;
    const pZ = playerGroup.position.z;

    for (let i = obstacles.length - 1; i >= 0; i--) {
      const obs = obstacles[i];

      // Clean up past obstacles
      if (obs.position.z > pZ + 15) {
        scene.remove(obs);
        obstacles.splice(i, 1);
        continue;
      }

      // Ghost bobbing motion
      if (obs.userData.type === 'GHOST') {
        obs.position.y = 0.2 + Math.sin(Date.now() * 0.005 + obs.userData.bobOffset) * 0.3;
      }

      // Check collision
      const dz = Math.abs(obs.position.z - pZ);
      const dx = Math.abs(obs.position.x - pX);

      if (dz < 1.3 && dx < 1.25) {
        let hit = false;

        if (obs.userData.type === 'GHOST') {
          // Ghost hits unless player jumped extremely high
          if (pY < 2.3) hit = true;
        } else if (obs.userData.type === 'HIGH_LASER') {
          // Hits unless player is sliding
          if (!isSliding) hit = true;
        } else if (obs.userData.type === 'LOW_BARRIER') {
          // Hits unless player jumped over it
          if (pY < 1.1) hit = true;
        }

        if (hit && !TEST_MODE && invulnerableTimer <= 0) {
          if (shieldActive) {
            // Shield absorbs impact!
            shieldActive = false;
            shieldMesh.visible = false;
            ui.powerupBadge.style.display = 'none';
            invulnerableTimer = 1.6;
            if (window.soundSystem) window.soundSystem.playCrash();
            showFloatingNotice('SHIELD ABSORBED HIT!', '#00f0ff');
            scene.remove(obs);
            obstacles.splice(i, 1);
            continue;
          } else {
            gameOver();
            return;
          }
        }
      }
    }

    // Update Collectibles (Spin, Magnet, Collision)
    for (let i = collectibles.length - 1; i >= 0; i--) {
      const item = collectibles[i];

      // Remove past items
      if (item.position.z > pZ + 15) {
        scene.remove(item);
        collectibles.splice(i, 1);
        continue;
      }

      // Rotate item
      item.rotation.y += 3.5 * dt;

      // Distance check
      const dz = Math.abs(item.position.z - pZ);
      const dx = Math.abs(item.position.x - pX);
      const dy = Math.abs(item.position.y - (pY + 1.0));

      if (dz < 1.4 && dx < 1.3 && dy < 1.5) {
        if (item.userData.type === 'COIN') {
          coins++;
          score += 150 * multiplier;
          if (window.soundSystem) window.soundSystem.playCoin();
          showFloatingNotice(`+${150 * multiplier}`, '#ffd700');
        } else if (item.userData.type === 'SHIELD') {
          shieldActive = true;
          shieldTimer = 12.0;
          shieldMesh.visible = true;
          ui.powerupBadge.style.display = 'block';
          if (window.soundSystem) window.soundSystem.playPowerup();
          showFloatingNotice('SHIELD ACTIVE!', '#00f0ff');
        }

        scene.remove(item);
        collectibles.splice(i, 1);
      }
    }

    updateHUD();
  }

  // --- Animation Frame Loop ---
  function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    update(delta);
    renderer.render(scene, camera);
    // Debug hooks for automated testing
    if (playerGroup) {
      window.__debug_player_x = playerGroup.position.x;
      window.__debug_player_y = playerGroup.position.y;
      window.__debug_player_scale_y = playerGroup.scale.y;
      window.__debug_game_state = gameState;
    }
  }

  // --- Window Resize Handler ---
  function onWindowResize() {
    if (!renderer || !camera) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  // Start initialization
  initScene();
  animate();

})();
