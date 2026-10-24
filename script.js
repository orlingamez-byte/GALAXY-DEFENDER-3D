// ==========================================
// GALAXY DEFENDER 3D - SCRIPT PRINCIPAL
// ==========================================

let scene, camera, renderer;
let player, shipMesh;
let enemies = [];
let lasers = [];
let enemyLasers = [];
let particles = [];
let stars;

// Variables de Estado del Juego
let gameState = 'MENU'; // MENU, PLAYING, PAUSED, LEVEL_CLEAR, GAME_OVER, VICTORY
let score = 0;
let currentLevel = 1;
let enemiesRemaining = 0;
let totalKills = 0;
let playerHealth = 100;

// Controles
const keys = { w: false, s: false, a: false, d: false, space: false };
const playerSpeed = 0.4;
const playerBounds = { x: 18, zMin: -5, zMax: 20 };

// Audio Web API Context
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playSound(type) {
    if (!audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        const now = audioCtx.currentTime;

        if (type === 'laser') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(100, now + 0.15);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
        } else if (type === 'explosion') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.linearRampToValueAtTime(30, now + 0.4);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.4);
            osc.start(now);
            osc.stop(now + 0.4);
        } else if (type === 'hit') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.linearRampToValueAtTime(80, now + 0.1);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        }
    } catch (e) {
        // Ignorar errores de audio si el navegador bloquea autoplay
    }
}

// Inicialización de la Aplicación 3D
function initThree() {
    const container = document.body;

    // Escena y Cámara
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050510, 0.015);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 8, 25);
    camera.lookAt(0, 0, -5);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // Luces
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x00ffff, 0.8);
    dirLight.position.set(10, 20, 15);
    scene.add(dirLight);

    const pointLight = new THREE.PointLight(0xff00ff, 1, 50);
    pointLight.position.set(0, 5, 0);
    scene.add(pointLight);

    createStarfield();
    createPlayer();

    // Eventos de Ventana y Teclado
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('keydown', (e) => handleKeyDown(e, true));
    window.addEventListener('keyup', (e) => handleKeyDown(e, false));

    setupUIEvents();
    animate();
}

// Fondo de Estrellas Procedural
function createStarfield() {
    const starCount = 2000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount * 3; i += 3) {
        positions[i] = (Math.random() - 0.5) * 300;
        positions[i + 1] = (Math.random() - 0.5) * 300;
        positions[i + 2] = (Math.random() - 0.5) * 300 - 100;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: 0xffffff, size: 0.8, transparent: true, opacity: 0.8 });
    stars = new THREE.Points(geometry, material);
    scene.add(stars);
}

// Creación de la Nave del Jugador (3D Geometrías Compuestas)
function createPlayer() {
    player = new THREE.Group();

    // Fuselaje principal
    const bodyGeo = new THREE.ConeGeometry(1, 3, 4);
    bodyGeo.rotateX(Math.PI / 2);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, roughness: 0.3, metalness: 0.8 });
    shipMesh = new THREE.Mesh(bodyGeo, bodyMat);
    player.add(shipMesh);

    // Alas
    const wingGeo = new THREE.BoxGeometry(3.5, 0.1, 1.2);
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x0088ff, roughness: 0.4, metalness: 0.6 });
    const wings = new THREE.Mesh(wingGeo, wingMat);
    wings.position.set(0, 0, 0.5);
    player.add(wings);

    // Cabina (Cockpit)
    const cockpitGeo = new THREE.SphereGeometry(0.4, 8, 8);
    const cockpitMat = new THREE.MeshStandardMaterial({ color: 0xff00ff, roughness: 0.1, emissive: 0x550055 });
    const cockpit = new THREE.Mesh(cockpitGeo, cockpitMat);
    cockpit.position.set(0, 0.3, -0.2);
    player.add(cockpit);

    player.position.set(0, 0, 15);
    scene.add(player);
}

// Generación de Enemigos según el Nivel
function spawnEnemies() {
    // Limpiar enemigos anteriores si quedan
    enemies.forEach(e => scene.remove(e.mesh));
    enemies = [];

    const count = (currentLevel === 1) ? 10 : 18;
    enemiesRemaining = count;
    updateHUD();

    const cols = 5;
    for (let i = 0; i < count; i++) {
        const row = Math.floor(i / cols);
        const col = i % cols;

        const x = (col - 2) * 4.5;
        const y = row * 3 + 4;
        const z = -25 - row * 4;

        const alienGroup = new THREE.Group();

        // Cuerpo Alienígena con geometrías futuristas
        const coreGeo = new THREE.OctahedronGeometry(1.2, 0);
        const colorVal = currentLevel === 1 ? 0xff2255 : 0xffaa00;
        const coreMat = new THREE.MeshStandardMaterial({ color: colorVal, roughness: 0.2, metalness: 0.9, emissive: 0x330011 });
        const coreMesh = new THREE.Mesh(coreGeo, coreMat);
        alienGroup.add(coreMesh);

        // Anillo rotativo
        const ringGeo = new THREE.TorusGeometry(1.6, 0.1, 8, 20);
        const ringMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x004444 });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = Math.PI / 2;
        alienGroup.add(ringMesh);

        alienGroup.position.set(x, y, z);
        scene.add(alienGroup);

        enemies.push({
            mesh: alienGroup,
            health: currentLevel === 1 ? 1 : 2,
            shootTimer: Math.random() * 60 + 30,
            speedX: (Math.random() - 0.5) * 0.1,
            initialX: x
        });
    }
}

// Control de Teclado
function handleKeyDown(e, isDown) {
    if (e.code === 'KeyW') keys.w = isDown;
    if (e.code === 'KeyS') keys.s = isDown;
    if (e.code === 'KeyA') keys.a = isDown;
    if (e.code === 'KeyD') keys.d = isDown;
    if (e.code === 'Space') {
        if (isDown && !keys.space && gameState === 'PLAYING') {
            shootLaser();
        }
        keys.space = isDown;
    }
    if (e.code === 'Escape' && isDown) {
        togglePause();
    }
}

function togglePause() {
    if (gameState === 'PLAYING') {
        gameState = 'PAUSED';
        document.getElementById('pause-screen').classList.remove('hidden');
    } else if (gameState === 'PAUSED') {
        gameState = 'PLAYING';
        document.getElementById('pause-screen').classList.add('hidden');
    }
}

// Disparo del Jugador
function shootLaser() {
    playSound('laser');
    const laserGeo = new THREE.CylinderGeometry(0.1, 0.1, 2, 8);
    laserGeo.rotateX(Math.PI / 2);
    const laserMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });

    const laserMesh = new THREE.Mesh(laserGeo, laserMat);
    laserMesh.position.copy(player.position);
    laserMesh.position.z -= 1;
    scene.add(laserMesh);

    lasers.push({ mesh: laserMesh, speed: 1.2 });
}

// Disparo de Enemigos
function enemyShoot(enemy) {
    const laserGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.8, 8);
    laserGeo.rotateX(Math.PI / 2);
    const colorVal = currentLevel === 1 ? 0xff0055 : 0xff5500;
    const laserMat = new THREE.MeshBasicMaterial({ color: colorVal });

    const laserMesh = new THREE.Mesh(laserGeo, laserMat);
    laserMesh.position.copy(enemy.mesh.position);
    scene.add(laserMesh);

    enemyLasers.push({ mesh: laserMesh, speed: 0.5 + currentLevel * 0.15 });
}

// Efectos de Explosión de Partículas
function createExplosion(pos, colorHex = 0xffaa00) {
    playSound('explosion');
    const particleCount = 20;
    const geo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    const mat = new THREE.MeshBasicMaterial({ color: colorHex });

    for (let i = 0; i < particleCount; i++) {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        scene.add(mesh);

        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.4,
            (Math.random() - 0.5) * 0.4,
            (Math.random() - 0.5) * 0.4
        );
        particles.push({ mesh, velocity, life: 30 });
    }
}

// Bucle Principal de Actualización (Game Loop)
function animate() {
    requestAnimationFrame(animate);

    if (gameState === 'PLAYING') {
        updatePlayer();
        updateEnemies();
        updateLasers();
        updateParticles();
        drawRadar();
    }

    renderer.render(scene, camera);
}

// Movimiento de la Nave
function updatePlayer() {
    if (keys.a && player.position.x > -playerBounds.x) player.position.x -= playerSpeed;
    if (keys.d && player.position.x < playerBounds.x) player.position.x += playerSpeed;
    if (keys.w && player.position.z > playerBounds.zMin) player.position.z -= playerSpeed;
    if (keys.s && player.position.z < playerBounds.zMax) player.position.z += playerSpeed;

    // Inclinación al girar
    const targetTilt = (keys.a ? 0.4 : 0) + (keys.d ? -0.4 : 0);
    shipMesh.rotation.z += (targetTilt - shipMesh.rotation.z) * 0.1;
}

// Lógica y IA de Enemigos
function updateEnemies() {
    const speedMult = currentLevel === 1 ? 1 : 1.4;

    enemies.forEach((enemy, index) => {
        // Movimiento oscilatorio lateral
        enemy.mesh.position.x = enemy.initialX + Math.sin(Date.now() * 0.003 * speedMult + index) * 3;
        
        // Avance gradual hacia el jugador
        enemy.mesh.position.z += 0.02 * speedMult;

        // Rotación visual del alien
        enemy.mesh.rotation.y += 0.03;

        // Disparos enemigos periódicos
        enemy.shootTimer--;
        if (enemy.shootTimer <= 0) {
            enemyShoot(enemy);
            enemy.shootTimer = Math.random() * 80 + (currentLevel === 1 ? 60 : 35);
        }

        // Colisión alien con jugador
        if (enemy.mesh.position.distanceTo(player.position) < 2.0) {
            playerHealth -= 25;
            updateHUD();
            createExplosion(enemy.mesh.position, 0xff0000);
            scene.remove(enemy.mesh);
            enemies.splice(index, 1);
            enemiesRemaining--;
            checkLevelProgress();
            if (playerHealth <= 0) triggerGameOver();
        }
    });

    // Actualizar disparos enemigos
    for (let i = enemyLasers.length - 1; i >= 0; i--) {
        const l = enemyLasers[i];
        l.mesh.position.z += l.speed;

        if (l.mesh.position.distanceTo(player.position) < 1.5) {
            playSound('hit');
            playerHealth -= 10;
            updateHUD();
            scene.remove(l.mesh);
            enemyLasers.splice(i, 1);
            if (playerHealth <= 0) triggerGameOver();
            continue;
        }

        if (l.mesh.position.z > 30) {
            scene.remove(l.mesh);
            enemyLasers.splice(i, 1);
        }
    }
}

// Actualizar Láseres del Jugador y Colisiones
function updateLasers() {
    for (let i = lasers.length - 1; i >= 0; i--) {
        const l = lasers[i];
        l.mesh.position.z -= l.speed;

        // Remover si sale de pantalla
        if (l.mesh.position.z < -50) {
            scene.remove(l.mesh);
            lasers.splice(i, 1);
            continue;
        }

        // Comprobar colisión con enemigos
        let laserRemoved = false;
        for (let j = enemies.length - 1; j >= 0; j--) {
            const enemy = enemies[j];
            if (l.mesh.position.distanceTo(enemy.mesh.position) < 1.8) {
                enemy.health--;
                createExplosion(enemy.mesh.position, 0x00ffff);
                
                if (enemy.health <= 0) {
                    scene.remove(enemy.mesh);
                    enemies.splice(j, 1);
                    enemiesRemaining--;
                    score += 100 * currentLevel;
                    totalKills++;
                    checkLevelProgress();
                }

                scene.remove(l.mesh);
                lasers.splice(i, 1);
                laserRemoved = true;
                updateHUD();
                break;
            }
        }
        if (laserRemoved) continue;
    }
}

// Sistema de Partículas
function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.mesh.position.add(p.velocity);
        p.life--;
        p.mesh.scale.multiplyScalar(0.95);
        if (p.life <= 0) {
            scene.remove(p.mesh);
            particles.splice(i, 1);
        }
    }
}

// Control de Progreso de Niveles
function checkLevelProgress() {
    if (enemiesRemaining <= 0) {
        if (currentLevel === 1) {
            gameState = 'LEVEL_CLEAR';
            document.getElementById('level-clear-screen').classList.remove('hidden');
        } else {
            triggerVictory();
        }
    }
}

function startLevel2() {
    currentLevel = 2;
    document.getElementById('level-clear-screen').classList.add('hidden');
    playerHealth = 100;
    player.position.set(0, 0, 15);
    spawnEnemies();
    gameState = 'PLAYING';
    updateHUD();
}

function triggerGameOver() {
    gameState = 'GAME_OVER';
    document.getElementById('game-over-screen').classList.remove('hidden');
}

function triggerVictory() {
    gameState = 'VICTORIA';
    document.getElementById('final-score').innerText = score;
    document.getElementById('final-kills').innerText = totalKills;
    document.getElementById('victory-screen').classList.remove('hidden');
}

// Radar 2D Minimap Canvas
function drawRadar() {
    const canvas = document.getElementById('radar-canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const scale = 2.5;

    // Dibujar jugador en el centro
    ctx.fillStyle = '#00ffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();

    // Dibujar enemigos en el radar
    ctx.fillStyle = '#ff2255';
    enemies.forEach(e => {
        const dx = (e.mesh.position.x - player.position.x) * scale;
        const dz = (e.mesh.position.z - player.position.z) * scale;
        ctx.beginPath();
        ctx.arc(cx + dx, cy + dz, 2.5, 0, Math.PI * 2);
        ctx.fill();
    });
}

function updateHUD() {
    document.getElementById('score-val').innerText = score;
    document.getElementById('level-val').innerText = currentLevel;
    document.getElementById('enemies-val').innerText = enemiesRemaining;
    document.getElementById('kills-val').innerText = totalKills;
    document.getElementById('health-bar-fill').style.width = Math.max(0, playerHealth) + '%';
}

// Configuración de Botones de Interfaz
function setupUIEvents() {
    document.getElementById('btn-play').addEventListener('click', () => {
        initAudio();
        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('game-hud').classList.remove('hidden');
        currentLevel = 1;
        score = 0;
        totalKills = 0;
        playerHealth = 100;
        player.position.set(0, 0, 15);
        spawnEnemies();
        gameState = 'PLAYING';
    });

    document.getElementById('btn-instructions').addEventListener('click', () => {
        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('instructions-screen').classList.remove('hidden');
    });

    document.getElementById('btn-back').addEventListener('click', () => {
        document.getElementById('instructions-screen').classList.add('hidden');
        document.getElementById('main-menu').classList.remove('hidden');
    });

    document.getElementById('btn-resume').addEventListener('click', () => togglePause());
    document.getElementById('btn-restart-pause').addEventListener('click', () => {
        document.getElementById('pause-screen').classList.add('hidden');
        currentLevel = 1;
        score = 0;
        totalKills = 0;
        playerHealth = 100;
        spawnEnemies();
        gameState = 'PLAYING';
    });

    document.getElementById('btn-quit').addEventListener('click', () => {
        document.getElementById('pause-screen').classList.add('hidden');
        document.getElementById('game-hud').classList.add('hidden');
        document.getElementById('main-menu').classList.remove('hidden');
        gameState = 'MENU';
    });

    document.getElementById('btn-next-level').addEventListener('click', () => startLevel2());

    document.getElementById('btn-restart-game').addEventListener('click', () => {
        document.getElementById('game-over-screen').classList.add('hidden');
        currentLevel = 1;
        score = 0;
        totalKills = 0;
        playerHealth = 100;
        spawnEnemies();
        gameState = 'PLAYING';
    });

    document.getElementById('btn-play-again').addEventListener('click', () => {
        document.getElementById('victory-screen').classList.add('hidden');
        document.getElementById('game-hud').classList.add('hidden');
        document.getElementById('main-menu').classList.remove('hidden');
        gameState = 'MENU';
    });
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Arrancar motor 3D al cargar la página
window.onload = initThree;