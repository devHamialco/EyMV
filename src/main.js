import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const scene = new THREE.Scene();

const texturaCielo = new THREE.TextureLoader().load('./src/assets/imagenes/cielo.jpg');
scene.background = texturaCielo;

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const camaraPanoramica = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camaraPanoramica.position.set(0, 100, 10);
camaraPanoramica.lookAt(0, 0, -30);

let camaraActiva = camera;
let usandoCamaraPersonaje = true;
// Nuevo personaje cargado desde GLTF; empieza en null hasta que cargue
let personaje = null;
let chavoMixer = null;
let chavoAction = null; // acción de animación actual (si existe)
let isChavorumbaActive = false; // indica si el modelo reemplazado por 'J' está activo
let chavoAudio = null; // reproductor de audio para Chavorumba

// Modelos y animadores precargados para el personaje local
let modeloParado = null;
let modeloMovimiento = null;
let modeloBaile = null;
let mixerParado = null;
let mixerMovimiento = null;
let mixerBaile = null;

// Estado actual del personaje/modelo/sonido (configurable por acciones)
let Nombre = 'Chavo';
// Animación actual será la que corresponda según `Nombre` (ver `getIdleAnimation`)
let AnimacionActual = null;
let CancionActual = './src/assets/fondo.mp3';

// --- CONFIGURACIÓN MULTIJUGADOR ---
let socket = null;
let localPlayerId = null;
let localPlayerIP = '';
const remotePlayers = {}; // id -> { id, ip, nombre, animacionActual, isChavorumbaActive, posicion, rotacion, personaje, mixer, action, targetPosicion, targetRotacion }

// --- SHOOTER STATE ---
let localHealth = 100;
let localAmmo = 30;
let isAlive = true;
let lastShotTime = 0;
const SHOOT_COOLDOWN = 400; // ms
const SHOOT_DAMAGE = 20;
const MAX_SHOOT_DISTANCE = 100;
const CLIP_SIZE = 30;
let isReloading = false;
let reloadTimer = null;

// Genera un Sprite con textura Canvas para mostrar el Nombre e IP flotantes sobre la cabeza del personaje
function createTextSprite(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Dibujar pastilla de fondo con bordes redondeados y sombra
    ctx.fillStyle = 'rgba(23, 23, 23, 0.75)';
    ctx.beginPath();
    ctx.roundRect(16, 16, canvas.width - 32, canvas.height - 32, 20);
    ctx.fill();
    
    // Borde iluminado para una estética premium
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 4;
    ctx.stroke();
    
    // Estilo de fuente elegante
    ctx.font = 'bold 30px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 4;
    
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMaterial);
    
    return sprite;
}

// Configuración de conexión WebSocket automática al servidor de Vite
function initMultiplayer() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    socket = new WebSocket(wsUrl);
    
    socket.onopen = () => {
        console.log('[Multiplayer] Conectado al servidor WebSocket.');
    };
    
    socket.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            switch (msg.type) {
                case 'welcome':
                    localPlayerId = msg.id;
                    localPlayerIP = msg.state.ip;
                    console.log(`[Multiplayer] Identificador asignado. ID: ${localPlayerId}, IP: ${localPlayerIP}`);
                    // Volver a cargar el personaje para mostrar la etiqueta local
                    cargarChavo();
                    // Cargar los jugadores remotos que ya estaban conectados
                    msg.existingUsers.forEach(userState => {
                        spawnRemotePlayer(userState);
                    });
                    break;
                case 'user_joined':
                    console.log(`[Multiplayer] Nuevo jugador conectado: ${msg.state.ip} (ID: ${msg.state.id})`);
                    spawnRemotePlayer(msg.state);
                    break;
                case 'user_updated':
                    updateRemotePlayer(msg.id, msg.state);
                    break;
                case 'user_left':
                    console.log(`[Multiplayer] Jugador desconectado: ID ${msg.id}`);
                    removeRemotePlayer(msg.id);
                    break;
                case 'player_damage':
                    localHealth = msg.health;
                    actualizarHUD();
                    mostrarHitIndicator();
                    break;
                case 'player_hit':
                  if (msg.targetId === localPlayerId) {
                    mostrarHitIndicator();
                  }
                  break;
                case 'player_died':
                    if (msg.playerId === localPlayerId) {
                        isAlive = false;
                        document.getElementById('death-screen').style.display = 'flex';
                        let countdown = 3;
                        document.getElementById('respawn-timer').textContent = `Reapareciendo en ${countdown}...`;
                        const timer = setInterval(() => {
                            countdown--;
                            if (countdown > 0) {
                                document.getElementById('respawn-timer').textContent = `Reapareciendo en ${countdown}...`;
                            } else {
                                clearInterval(timer);
                            }
                        }, 1000);
                    }
                    break;
                case 'player_respawn':
                    if (msg.playerId === localPlayerId) {
                        isAlive = true;
                        localHealth = 100;
                        localAmmo = CLIP_SIZE;
                        document.getElementById('death-screen').style.display = 'none';
                        if (personaje) {
                            personaje.position.set(msg.position.x, msg.position.y, msg.position.z);
                        }
                        actualizarHUD();
                    }
                    break;
            }
        } catch (e) {
            console.error('[Multiplayer] Error procesando mensaje:', e);
        }
    };
    
    socket.onclose = () => {
        console.warn('[Multiplayer] Conexión perdida con el servidor. Reintentando en 3 segundos...');
        // Limpiar todos los personajes remotos al perder conexión
        Object.keys(remotePlayers).forEach(id => removeRemotePlayer(id));
        setTimeout(initMultiplayer, 3000);
    };
    
    socket.onerror = (err) => {
        console.error('[Multiplayer] Error en conexión WebSocket:', err);
    };
}

function spawnRemotePlayer(state) {
    if (remotePlayers[state.id]) return;

    remotePlayers[state.id] = {
        id: state.id,
        ip: state.ip,
        nombre: state.nombre,
        animacionActual: state.animacionActual,
        isChavorumbaActive: state.isChavorumbaActive,
        posicion: { ...state.posicion },
        rotacion: state.rotacion,
        personaje: null,
        modeloParado: null,
        modeloMovimiento: null,
        modeloBaile: null,
        mixerParado: null,
        mixerMovimiento: null,
        mixerBaile: null,
        targetPosicion: { ...state.posicion },
        targetRotacion: state.rotacion
    };

    cargarPersonajeRemoto(state.id);
}

function updateRemotePlayer(id, state) {
    const p = remotePlayers[id];
    if (!p) {
        spawnRemotePlayer(state);
        return;
    }

    p.targetPosicion = { ...state.posicion };
    p.targetRotacion = state.rotacion;

    if (p.nombre !== state.nombre) {
        p.nombre = state.nombre;
        p.animacionActual = state.animacionActual;
        p.isChavorumbaActive = state.isChavorumbaActive;
        cargarPersonajeRemoto(id);
    } else if (p.animacionActual !== state.animacionActual || p.isChavorumbaActive !== state.isChavorumbaActive) {
        p.animacionActual = state.animacionActual;
        p.isChavorumbaActive = state.isChavorumbaActive;
        actualizarVisibilidadRemoto(id);
    }
}

function actualizarVisibilidadRemoto(id) {
    const p = remotePlayers[id];
    if (!p || !p.personaje) return;

    const idlePath = getIdleAnimation(p.nombre);
    const movementPath = getMovementAnimation(p.nombre);

    if (p.modeloParado) p.modeloParado.visible = false;
    if (p.modeloMovimiento) p.modeloMovimiento.visible = false;
    if (p.modeloBaile) p.modeloBaile.visible = false;

    if (p.isChavorumbaActive) {
        if (p.modeloBaile) p.modeloBaile.visible = true;
    } else if (p.animacionActual === movementPath) {
        if (p.modeloMovimiento) p.modeloMovimiento.visible = true;
    } else {
        if (p.modeloParado) p.modeloParado.visible = true;
    }
}

function removeRemotePlayer(id) {
    const p = remotePlayers[id];
    if (!p) return;

    if (p.personaje) {
        scene.remove(p.personaje);
        p.personaje.traverse((child) => {
            if (child.isMesh && child.userData && child.userData.isPersonaje) {
                const idx = colisionadoresMeshes.indexOf(child);
                if (idx !== -1) colisionadoresMeshes.splice(idx, 1);
            }
        });
    }
    delete remotePlayers[id];
}

function cargarPersonajeRemoto(id) {
    const p = remotePlayers[id];
    if (!p) return;

    if (p.personaje) {
        scene.remove(p.personaje);
        p.personaje.traverse((child) => {
            if (child.isMesh && child.userData && child.userData.isPersonaje) {
                const idx = colisionadoresMeshes.indexOf(child);
                if (idx !== -1) colisionadoresMeshes.splice(idx, 1);
            }
        });
        p.personaje = null;
    }

    // Crear grupo contenedor para el jugador remoto
    p.personaje = new THREE.Group();
    p.personaje.position.set(p.posicion.x, p.posicion.y, p.posicion.z);
    p.personaje.rotation.y = p.rotacion;
    scene.add(p.personaje);

    p.modeloParado = null;
    p.modeloMovimiento = null;
    p.modeloBaile = null;
    p.mixerParado = null;
    p.mixerMovimiento = null;
    p.mixerBaile = null;

    const idlePath = getIdleAnimation(p.nombre);
    const movementPath = getMovementAnimation(p.nombre);
    const dancePath = getModeloBaile(p.nombre);

    // Cargar Idle Remoto
    loader.load(
        idlePath,
        (gltf) => {
            if (!remotePlayers[id]) return;
            p.modeloParado = gltf.scene;
            p.modeloParado.scale.set(escalaDeseada, escalaDeseada, escalaDeseada);
            p.modeloParado.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    child.userData.isPersonaje = true;
                    colisionadoresMeshes.push(child);
                }
            });

            if (gltf.animations && gltf.animations.length > 0) {
                p.mixerParado = new THREE.AnimationMixer(p.modeloParado);
                const action = p.mixerParado.clipAction(gltf.animations[0]);
                action.setLoop(THREE.LoopRepeat, Infinity);
                action.play();
            }

            p.personaje.add(p.modeloParado);
            actualizarVisibilidadRemoto(id);
        },
        undefined,
        (error) => console.error(`[Multiplayer] Error cargando idle remoto ID ${id}:`, error)
    );

    // Cargar Movimiento Remoto
    loader.load(
        movementPath,
        (gltf) => {
            if (!remotePlayers[id]) return;
            p.modeloMovimiento = gltf.scene;
            p.modeloMovimiento.scale.set(escalaDeseada, escalaDeseada, escalaDeseada);
            p.modeloMovimiento.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    child.userData.isPersonaje = true;
                    colisionadoresMeshes.push(child);
                }
            });

            if (gltf.animations && gltf.animations.length > 0) {
                p.mixerMovimiento = new THREE.AnimationMixer(p.modeloMovimiento);
                const action = p.mixerMovimiento.clipAction(gltf.animations[0]);
                action.setLoop(THREE.LoopRepeat, Infinity);
                action.play();
            }

            p.personaje.add(p.modeloMovimiento);
            actualizarVisibilidadRemoto(id);
        },
        undefined,
        (error) => console.error(`[Multiplayer] Error cargando movimiento remoto ID ${id}:`, error)
    );

    // Cargar Baile Remoto

    loader.load(
        dancePath,
        (gltf) => {
            if (!remotePlayers[id]) return;
            p.modeloBaile = gltf.scene;
            p.modeloBaile.scale.set(escalaDeseada, escalaDeseada, escalaDeseada);
            p.modeloBaile.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    child.userData.isPersonaje = true;
                    colisionadoresMeshes.push(child);
                }
            });

            if (gltf.animations && gltf.animations.length > 0) {
                p.mixerBaile = new THREE.AnimationMixer(p.modeloBaile);
                const action = p.mixerBaile.clipAction(gltf.animations[0]);
                action.setLoop(THREE.LoopRepeat, Infinity);
                action.play();
            }

            p.personaje.add(p.modeloBaile);
            actualizarVisibilidadRemoto(id);
        },
        undefined,
        (error) => console.error(`[Multiplayer] Error cargando baile remoto ID ${id}:`, error)
    );

    // Añadir etiqueta de texto con Nombre e IP flotantes sobre la cabeza del contenedor
    const tagText = `${p.nombre}`;
    const sprite = createTextSprite(tagText);
    sprite.position.set(0, 2, 0); // Altura en coordenadas del grupo
    sprite.scale.set(4, 1, 1);
    p.personaje.add(sprite);
}

let ultimoEstadoEnviado = {
    x: 0,
    y: 0,
    z: 0,
    rotacion: 0,
    nombre: '',
    animacionActual: '',
    isChavorumbaActive: false
};

function enviarActualizacionDeEstado() {
    if (!socket || socket.readyState !== WebSocket.OPEN || !personaje) return;

    const x = personaje.position.x;
    const y = personaje.position.y;
    const z = personaje.position.z;
    const rot = personaje.rotation.y;

    const cambioSignificativo =
        Math.abs(ultimoEstadoEnviado.x - x) > 0.001 ||
        Math.abs(ultimoEstadoEnviado.y - y) > 0.001 ||
        Math.abs(ultimoEstadoEnviado.z - z) > 0.001 ||
        Math.abs(ultimoEstadoEnviado.rotacion - rot) > 0.001 ||
        ultimoEstadoEnviado.nombre !== Nombre ||
        ultimoEstadoEnviado.animacionActual !== AnimacionActual ||
        ultimoEstadoEnviado.isChavorumbaActive !== isChavorumbaActive;

    if (cambioSignificativo) {
        ultimoEstadoEnviado = {
            x, y, z,
            rotacion: rot,
            nombre: Nombre,
            animacionActual: AnimacionActual,
            isChavorumbaActive: isChavorumbaActive
        };

        socket.send(JSON.stringify({
            type: 'update',
            state: {
                nombre: Nombre,
                animacionActual: AnimacionActual,
                isChavorumbaActive: isChavorumbaActive,
                posicion: { x, y, z },
                rotacion: rot
            }
        }));
    }
}

// Helper: devuelve la animación de parado según el nombre (editable por ti)
function getIdleAnimation(name) {
    switch (name) {
        case 'Chavo':
            return './src/assets/ChavoParado.glb';
        case 'Quico':
            return './src/assets/QuicoParado.glb';
        case 'Jaimito':
            return './src/assets/JaimitoParado.glb';
        // Añade más casos aquí cuando quieras
        default:
            return './src/assets/ChavoParado.glb';
    }
}

// Helper: devuelve la animación de movimiento según el nombre (editable por ti)
function getMovementAnimation(name) {
    switch (name) {
        case 'Chavo':
            return './src/assets/ChavoMovimiento.glb';
        case 'Quico':
            return './src/assets/QuicoMovimiento.glb';
        case 'Jaimito':
            return './src/assets/JaimitoMovimiento.glb';

        // Añade más casos aquí cuando quieras
        default:
            return './src/assets/ChavoMovimiento.glb';
    }
}

// Helper: devuelve los assets especiales (animación + canción) según el personaje
function getModeloBaile(name) {
    switch (name) {
        case 'Chavo':
            return './src/assets/Chavorumba.glb';
        case 'Quico':
            return './src/assets/Quicotwerk.glb';
        case 'Jaimito':
            return './src/assets/JaimitoDance.glb';
        // Añade más casos aquí para otros personajes
        default:
            return './src/assets/Chavorumba.glb';
    }
}
function getCancionBaile(name) {
    switch (name) {
        case 'Chavo':
            return './src/assets/Chavorumba.mp3';
        case 'Quico':
            return './src/assets/Quicotwerk.mp3' ;
        case 'Jaimito':
            return './src/assets/JaimitoDance.mp3' ;
        // Añade más casos aquí para otros personajes
        default:
            return './src/assets/Chavorumba.mp3' ;
    }
}

// Carga un 'especial' (animación + canción) basado en el nombre del personaje


const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
crearHUD();

const velocidadPersonaje = 10;
const teclas = { w: false, a: false, s: false, d: false };

let anguloCamara = 0;
let anguloRotacionMouse = 0;
const sensibilidadRaton = 0.002;
const distanciaCamara = 7;
const alturaCamara = 3;
// Offset de rotación extra para el modelo (en grados -> radianes)
const rotacionExtraPersonaje = THREE.MathUtils.degToRad(108);
// Escala reutilizable para personajes
const escalaDeseada = 2 / 47;

let velocidadVertical = 0;
let enElSuelo = true;
const gravedad = -30;
const fuerzaSalto = 12;

// Personaje se carga desde GLTF (cargarChavo), se añadirá a escena al completarse

// Reproduce la canción actual si no se está reproduciendo ya (evita reinicios innecesarios)
function playCurrentSong() {
    if (!CancionActual) return;
    try {
        const filename = CancionActual.split('/').pop();
        if (chavoAudio && chavoAudio.src && chavoAudio.src.includes(filename)) {
            // misma canción ya reproduciéndose
            return;
        }
        if (chavoAudio) {
            chavoAudio.pause();
            chavoAudio.currentTime = 0;
            chavoAudio = null;
        }
        chavoAudio = new Audio(CancionActual);
        chavoAudio.loop = true;
        chavoAudio.play().catch((err) => {
            console.warn('No se pudo reproducir', CancionActual, err);
        });
    } catch (e) {
        console.error('Error creando/reproduciendo chavoAudio:', e);
    }
}

camera.position.set(0, 3, 5);

const loader = new GLTFLoader();
// Inicia la carga del personaje Chavo (GLTF). Se añadirá a la escena cuando termine la carga
// Inicializar la animación por defecto según `Nombre` y cargar
AnimacionActual = getIdleAnimation(Nombre);
cargarModelosPersonaje();
// Reproducir la canción actual al inicio (no debe reiniciarse al cambiar animación)
playCurrentSong();
// Inicializar conexión multijugador
initMultiplayer();
const edificios = [];
const colisionadoresMeshes = [];
const raycaster = new THREE.Raycaster();
const radioPersonaje = 0.4;

cargarEdificiosMedievales();
cargarEdificiosModernos();

// Cápsula azul reemplazada por GLTF Chavo (cargado en cargarChavo)

function cargarEdificiosModernos() {
    const edificiosModernos = [
        //cuadra 1
        //LadoA 
        { modelo: 'building_A.gltf', x: -34, z: -47, escala: 5, rotacion: 0 },
        { modelo: 'building_B.gltf', x: -27, z: -47, escala: 5, rotacion: 0 },
        { modelo: 'building_C.gltf', x: -19, z: -47, escala: 5, rotacion: 0 },
        { modelo: 'building_D.gltf', x: -10, z: -47, escala: 5, rotacion: 0 },
        //LadoB
        { modelo: 'building_E.gltf', x: -10, z: -55, escala: 5, rotacion: Math.PI / 2 },
        { modelo: 'building_F.gltf', x: -10, z: -75, escala: 5, rotacion: Math.PI / 2 },
        //LadoC
        { modelo: 'building_G.gltf', x: -40, z: -55, escala: 5, rotacion: -Math.PI / 2 },
        { modelo: 'building_H.gltf', x: -40, z: -39, escala: 5, rotacion: -Math.PI / 2 },
        { modelo: 'building_A.gltf', x: -40, z: -47, escala: 5, rotacion: -Math.PI / 2 },
        //LadoD
        { modelo: 'building_B.gltf', x: -40, z: -77, escala: 5, rotacion: Math.PI },
        { modelo: 'building_C.gltf', x: -33, z: -77, escala: 5, rotacion: Math.PI },
        { modelo: 'building_E.gltf', x: -20, z: -77, escala: 5, rotacion: Math.PI },

        //cuadra 2
        //LadoA 
        { modelo: 'building_A.gltf', x: 15, z: -47, escala: 5, rotacion: 0 },
        { modelo: 'building_B.gltf', x: 23, z: -47, escala: 5, rotacion: 0 },
        { modelo: 'building_C.gltf', x: 40, z: -47, escala: 5, rotacion: 0 },
        //LadoB
        { modelo: 'building_E.gltf', x: 40, z: -55, escala: 5, rotacion: Math.PI / 2 },
        { modelo: 'building_F.gltf', x: 40, z: -75, escala: 5, rotacion: Math.PI / 2 },
        { modelo: 'building_D.gltf', x: 40, z: -65, escala: 5, rotacion: Math.PI / 2 },
        //LadoC
        { modelo: 'building_G.gltf', x: 10, z: -55, escala: 5, rotacion: -Math.PI / 2 },
        { modelo: 'building_H.gltf', x: 10, z: -39, escala: 5, rotacion: -Math.PI / 2 },
        { modelo: 'building_A.gltf', x: 10, z: -47, escala: 5, rotacion: -Math.PI / 2 },
        //LadoD
        { modelo: 'building_B.gltf', x: 15, z: -67, escala: 5, rotacion: Math.PI },
        { modelo: 'building_C.gltf', x: 23, z: -67, escala: 5, rotacion: Math.PI },
        { modelo: 'building_E.gltf', x: 31, z: -67, escala: 5, rotacion: Math.PI },

        //cuadra 3
        //LadoA 
        { modelo: 'building_A.gltf', x: -34, z: 10, escala: 5, rotacion: 0 },
        { modelo: 'building_B.gltf', x: -27, z: 10, escala: 5, rotacion: 0 },
        { modelo: 'building_C.gltf', x: -20, z: 10, escala: 5, rotacion: 0 },
        { modelo: 'building_D.gltf', x: -8, z: 10, escala: 5, rotacion: 0 },
        //LadoB
        { modelo: 'building_E.gltf', x: -8, z: 2, escala: 5, rotacion: Math.PI / 2 },
        { modelo: 'building_F.gltf', x: -8, z: -18, escala: 5, rotacion: Math.PI / 2 },
        //LadoC
        { modelo: 'building_G.gltf', x: -40, z: -16, escala: 5, rotacion: -Math.PI / 2 },
        { modelo: 'building_H.gltf', x: -40, z: 2, escala: 5, rotacion: -Math.PI / 2 },
        { modelo: 'building_A.gltf', x: -40, z: 10, escala: 5, rotacion: -Math.PI / 2 },
        //LadoD
        { modelo: 'building_B.gltf', x: -35, z: -27, escala: 5, rotacion: Math.PI },
        { modelo: 'building_C.gltf', x: -21, z: -27, escala: 5, rotacion: Math.PI },
        { modelo: 'building_E.gltf', x: -13, z: -27, escala: 5, rotacion: Math.PI },

        //cuadra 4
        //LadoA 
        { modelo: 'building_A.gltf', x: 15, z: 10, escala: 5, rotacion: 0 },
        { modelo: 'building_B.gltf', x: 23, z: 10, escala: 5, rotacion: 0 },
        { modelo: 'building_C.gltf', x: 31, z: 10, escala: 5, rotacion: 0 },
        //LadoB
        { modelo: 'building_E.gltf', x: 40, z: 2, escala: 5, rotacion: Math.PI / 2 },
        { modelo: 'building_F.gltf', x: 40, z: -18, escala: 5, rotacion: Math.PI / 2 },
        { modelo: 'building_D.gltf', x: 40, z: -8, escala: 5, rotacion: Math.PI / 2 },
        //LadoC
        { modelo: 'building_G.gltf', x: 10, z: -16, escala: 5, rotacion: -Math.PI / 2 },
        { modelo: 'building_H.gltf', x: 10, z: 2, escala: 5, rotacion: -Math.PI / 2 },
        { modelo: 'building_A.gltf', x: 10, z: 10, escala: 5, rotacion: -Math.PI / 2 },
        //LadoD
        { modelo: 'building_B.gltf', x: 15, z: -27, escala: 5, rotacion: Math.PI },
        { modelo: 'building_C.gltf', x: 23, z: -27, escala: 5, rotacion: Math.PI },
        { modelo: 'building_E.gltf', x: 38, z: -27, escala: 5, rotacion: Math.PI },
    ];
    
    edificiosModernos.forEach(edificio => {
        loader.load(
            `./src/assets/Builds/Assets/gltf/${edificio.modelo}`,
            (gltf) => {
                const modelo = gltf.scene;
                modelo.position.set(edificio.x, 0, edificio.z);
                modelo.rotation.y = edificio.rotacion;
                modelo.scale.set(edificio.escala, edificio.escala, edificio.escala);
                modelo.traverse((child) => {
                    if (child.isMesh) {
                                child.castShadow = true;
                                child.receiveShadow = true;
                                // No marcar edificios como 'isPersonaje'. Sólo agregarlos a colisionadores.
                                colisionadoresMeshes.push(child);
                    }
                });
                scene.add(modelo);
                edificios.push(modelo);
            },
            undefined,
            (error) => console.error(`Error cargando ${edificio.modelo}:`, error)
        );
    });
}

function actualizarVisibilidadModelos() {
    const isMoving = Object.values(teclas).some(v => v);
    
    if (modeloParado) modeloParado.visible = false;
    if (modeloMovimiento) modeloMovimiento.visible = false;
    if (modeloBaile) modeloBaile.visible = false;
    
    if (isChavorumbaActive) {
        if (modeloBaile) modeloBaile.visible = true;
        AnimacionActual = getModeloBaile(Nombre);
    } else if (isMoving) {
        if (modeloMovimiento) modeloMovimiento.visible = true;
        AnimacionActual = getMovementAnimation(Nombre);
    } else {
        if (modeloParado) modeloParado.visible = true;
        AnimacionActual = getIdleAnimation(Nombre);
    }
}

// Carga el personaje Chavo desde GLTF
function cargarChavo() {
    actualizarVisibilidadModelos();
}

// Carga y reemplaza el personaje por el GLB pedido ('J')
function cargarChavorumba() {
    isChavorumbaActive = true;
    AnimacionActual = getModeloBaile(Nombre);
    CancionActual = getCancionBaile(Nombre);
    
    actualizarVisibilidadModelos();
    
    // Reproducir la canción asociada si aún no se está reproduciendo
    playCurrentSong();
}

function cargarModelosPersonaje() {
    const posicionPrev = new THREE.Vector3(0, 0, 0);
    const rotacionPrev = new THREE.Euler(0, 0, 0);
    
    if (personaje) {
        posicionPrev.copy(personaje.position);
        rotacionPrev.copy(personaje.rotation);
        
        personaje.traverse((child) => {
            if (child.isMesh && child.userData && child.userData.isPersonaje) {
                const idx = colisionadoresMeshes.indexOf(child);
                if (idx !== -1) colisionadoresMeshes.splice(idx, 1);
            }
        });
        scene.remove(personaje);
    }
    
    // Crear el nuevo grupo contenedor para el personaje local
    personaje = new THREE.Group();
    personaje.position.copy(posicionPrev);
    personaje.rotation.copy(rotacionPrev);
    scene.add(personaje);
    
    modeloParado = null;
    modeloMovimiento = null;
    modeloBaile = null;
    mixerParado = null;
    mixerMovimiento = null;
    mixerBaile = null;
    
    const idlePath = getIdleAnimation(Nombre);
    const movementPath = getMovementAnimation(Nombre);
    const dancePath = getModeloBaile(Nombre);
    
    // Cargar Idle
    loader.load(idlePath, (gltf) => {
        modeloParado = gltf.scene;
        modeloParado.scale.set(escalaDeseada, escalaDeseada, escalaDeseada);
        modeloParado.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isPersonaje = true;
                colisionadoresMeshes.push(child);
            }
        });
        
        if (gltf.animations && gltf.animations.length > 0) {
            mixerParado = new THREE.AnimationMixer(modeloParado);
            const action = mixerParado.clipAction(gltf.animations[0]);
            action.setLoop(THREE.LoopRepeat, Infinity);
            action.play();
        }
        
        personaje.add(modeloParado);
        actualizarVisibilidadModelos();
    }, undefined, (error) => console.error('Error cargando Idle:', error));
    
    // Cargar Movimiento
    loader.load(movementPath, (gltf) => {
        modeloMovimiento = gltf.scene;
        modeloMovimiento.scale.set(escalaDeseada, escalaDeseada, escalaDeseada);
        modeloMovimiento.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isPersonaje = true;
                colisionadoresMeshes.push(child);
            }
        });
        
        if (gltf.animations && gltf.animations.length > 0) {
            mixerMovimiento = new THREE.AnimationMixer(modeloMovimiento);
            const action = mixerMovimiento.clipAction(gltf.animations[0]);
            action.setLoop(THREE.LoopRepeat, Infinity);
            action.play();
        }
        
        personaje.add(modeloMovimiento);
        actualizarVisibilidadModelos();
    }, undefined, (error) => console.error('Error cargando Movimiento:', error));
    
    // Cargar Baile
    loader.load(dancePath, (gltf) => {
        modeloBaile = gltf.scene;
        modeloBaile.scale.set(escalaDeseada, escalaDeseada, escalaDeseada);
        modeloBaile.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isPersonaje = true;
                colisionadoresMeshes.push(child);
            }
        });
        
        if (gltf.animations && gltf.animations.length > 0) {
            mixerBaile = new THREE.AnimationMixer(modeloBaile);
            const action = mixerBaile.clipAction(gltf.animations[0]);
            action.setLoop(THREE.LoopRepeat, Infinity);
            action.play();
        }
        
        personaje.add(modeloBaile);
        actualizarVisibilidadModelos();
    }, undefined, (error) => console.error('Error cargando Baile:', error));
}

function cargarEdificiosMedievales() {
    const edificiosMedievales = [
        { modelo: 'buildings/red/building_church_red.gltf', x: -25, z: -9, escala: 8 },
        { modelo: 'buildings/yellow/building_windmill_yellow.gltf', x: 24, z: -9, escala: 8},
    ];
    
    edificiosMedievales.forEach(edificio => {
        loader.load(
            `./src/assets/Medievalbuilds/Assets/gltf/${edificio.modelo}`,
            (gltf) => {
                const modelo = gltf.scene;
                modelo.position.set(edificio.x, 0, edificio.z);
                modelo.scale.set(edificio.escala, edificio.escala, edificio.escala);
                modelo.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        colisionadoresMeshes.push(child);
                    }
                });
                scene.add(modelo);
                edificios.push(modelo);
            },
            undefined,
            (error) => console.error(`Error cargando ${edificio.modelo}:`, error)
        );
    });
}

// --- SHOOTER & HUD FUNCTIONS ---

function crearHUD() {
    // Inject styles
    const style = document.createElement('style');
    style.textContent = `
        #hud {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 1000;
            font-family: 'Segoe UI', Arial, sans-serif;
        }
        #health-container {
            position: absolute;
            bottom: 30px;
            left: 30px;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        #health-label {
            color: #fff;
            font-size: 18px;
            font-weight: bold;
            text-shadow: 0 0 10px rgba(0,0,0,0.8);
            width: 30px;
        }
        #health-bar {
            width: 260px;
            height: 20px;
            background: rgba(0, 0, 0, 0.6);
            border-radius: 10px;
            overflow: hidden;
            border: 2px solid rgba(255, 255, 255, 0.2);
        }
        #health-fill {
            height: 100%;
            width: 100%;
            background: #4ade80;
            border-radius: 8px;
            transition: width 0.2s ease, background 0.3s ease;
        }
        #health-fill.medium {
            background: #eab308;
        }
        #health-fill.low {
            background: #ef4444;
        }
        #ammo-container {
            position: absolute;
            bottom: 30px;
            right: 30px;
        }
        #ammo-counter {
            color: #fff;
            font-size: 28px;
            font-weight: bold;
            text-shadow: 0 0 10px rgba(0,0,0,0.8), 0 0 20px rgba(0,0,0,0.5);
            font-family: 'Courier New', monospace;
        }
        #hit-indicator {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 999;
            background: radial-gradient(ellipse at center, transparent 60%, rgba(255, 0, 0, 0.6) 100%);
            opacity: 0;
            transition: opacity 0.1s ease;
        }
        #hit-indicator.active {
            opacity: 1;
        }
        #death-screen {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            display: none;
            justify-content: center;
            align-items: center;
            flex-direction: column;
            background: rgba(0, 0, 0, 0.75);
            z-index: 1001;
            pointer-events: none;
        }
        #death-text {
            color: #ef4444;
            font-size: 72px;
            font-weight: bold;
            text-shadow: 0 0 30px rgba(239, 68, 68, 0.5);
            font-family: 'Segoe UI', Arial, sans-serif;
            letter-spacing: 8px;
        }
        #respawn-timer {
            color: #fff;
            font-size: 24px;
            margin-top: 20px;
            font-family: 'Segoe UI', Arial, sans-serif;
            opacity: 0.8;
        }
        #reload-notice {
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            color: #eab308;
            font-size: 20px;
            font-weight: bold;
            text-shadow: 0 0 10px rgba(0,0,0,0.8);
            z-index: 1000;
            pointer-events: none;
            font-family: 'Courier New', monospace;
            letter-spacing: 2px;
        }
    `;
    document.head.appendChild(style);

    // Create HUD container
    const hud = document.createElement('div');
    hud.id = 'hud';
    hud.innerHTML = `
        <div id="health-container">
            <div id="health-label">HP</div>
            <div id="health-bar"><div id="health-fill"></div></div>
        </div>
        <div id="ammo-container">
            <span id="ammo-counter">30 / 30</span>
        </div>
        <div id="hit-indicator"></div>
        <div id="death-screen">
            <div id="death-text">ELIMINADO</div>
            <div id="respawn-timer">Reapareciendo en 3...</div>
        </div>
        <div id="reload-notice">RECARGANDO...</div>
    `;
    document.body.appendChild(hud);
}

function actualizarHUD() {
    const fill = document.getElementById('health-fill');
    const counter = document.getElementById('ammo-counter');
    if (fill) {
        const pct = Math.max(0, Math.min(100, localHealth));
        fill.style.width = pct + '%';
        fill.classList.remove('medium', 'low');
        if (pct <= 25) fill.classList.add('low');
        else if (pct <= 50) fill.classList.add('medium');
    }
    if (counter) {
        counter.textContent = localAmmo + ' / ' + CLIP_SIZE;
    }
}

function mostrarHitIndicator() {
    const indicator = document.getElementById('hit-indicator');
    if (!indicator) return;
    indicator.style.display = 'block';
    indicator.classList.add('active');
    setTimeout(() => {
        indicator.classList.remove('active');
        setTimeout(() => {
            indicator.style.display = 'none';
        }, 100);
    }, 200);
}

// Flecha para abajo
document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (key in teclas) {
        teclas[key] = true;
        // Si el modelo especial está activo y se presiona una tecla de movimiento,
        // detener la animación en bucle según lo solicitado.
        if (isChavorumbaActive && chavoAction && ['w','a','s','d'].includes(key)) {
            chavoAction.stop();
        }
        // Si venimos de Chavorumba, al presionar movimiento revertimos a Parado + fondo.mp3
        if (isChavorumbaActive && ['w','a','s','d'].includes(key)) {
            // Salir del estado Chavorumba: cambiar la animación y restaurar la canción de fondo.
            isChavorumbaActive = false;
            AnimacionActual = getIdleAnimation(Nombre);
            // Restaurar la canción de fondo al salir de Chavorumba
            CancionActual = './src/assets/fondo.mp3';
            playCurrentSong();
            cargarChavo();
            return; // evitar cambiar inmediatamente a animación de movimiento
        }

        // Si no es el modelo especial, y ahora hay alguna tecla de movimiento presionada,
        // cambiar la animación a movimiento y recargar el personaje si es necesario.
        if (!isChavorumbaActive) {
            const anyMovement = Object.values(teclas).some(v => v);
            const movimientoPath = getMovementAnimation(Nombre);
            if (anyMovement && AnimacionActual !== movimientoPath) {
                AnimacionActual = movimientoPath;
                cargarChavo();
            }
        }
    }
    
    // Reemplazar modelo al presionar 'j'
    if (event.key.toLowerCase() === 'j') {
        cargarChavorumba();
    }

    // Recargar arma al presionar 'r'
    if (event.key.toLowerCase() === 'r' && isAlive && !isReloading && localAmmo < CLIP_SIZE) {
        isReloading = true;
        document.getElementById('reload-notice').style.display = 'block';
        reloadTimer = setTimeout(() => {
            localAmmo = CLIP_SIZE;
            isReloading = false;
            document.getElementById('reload-notice').style.display = 'none';
            actualizarHUD();
        }, 2000);
    }


    if (event.key.toLowerCase() === '1') {
        if (Nombre !== 'Chavo') {
            Nombre = 'Chavo';
            cargarModelosPersonaje();
        }
    }

    if (event.key.toLowerCase() === '2') {
        if (Nombre !== 'Quico') {
            Nombre = 'Quico';
            cargarModelosPersonaje();
        }
    }
    if (event.key.toLowerCase() === '3') {
        if (Nombre !== 'Jaimito') {
            Nombre = 'Jaimito';
            cargarModelosPersonaje();
        }
    }


    if (event.key.toLowerCase() === 'v') {
        usandoCamaraPersonaje = !usandoCamaraPersonaje;
        camaraActiva = usandoCamaraPersonaje ? camera : camaraPanoramica;
        
        if (usandoCamaraPersonaje) {
            renderer.domElement.requestPointerLock();
        } else {
            document.exitPointerLock();
        }
    }
    
    if (event.code === 'Space' && enElSuelo) {
        velocidadVertical = fuerzaSalto;
        enElSuelo = true;
    }
});

// Flecha para arriba
document.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();
    if (key in teclas) teclas[key] = false;
    // Al soltar, si ya no quedan teclas de movimiento presionadas, restaurar la animación de parado
    if (!isChavorumbaActive) {
        const anyMovement = Object.values(teclas).some(v => v);
        const paradoPath = getIdleAnimation(Nombre);
        if (!anyMovement && AnimacionActual !== paradoPath) {
            AnimacionActual = paradoPath;
            cargarChavo();
        }
    }
});
// Movimiento del mouse para rotar la cámara

document.addEventListener('mousemove', (event) => {
    if (usandoCamaraPersonaje && document.pointerLockElement === renderer.domElement) {
        anguloRotacionMouse -= event.movementX * sensibilidadRaton;
    }
});

document.addEventListener('click', (event) => {
    // If not pointer locked and using character camera, request pointer lock
    if (usandoCamaraPersonaje && document.pointerLockElement !== renderer.domElement) {
        renderer.domElement.requestPointerLock();
        return;
    }
    
    // Left click = shoot (only when pointer is locked and using character camera)
    if (event.button === 0 && usandoCamaraPersonaje && document.pointerLockElement === renderer.domElement) {
        if (!isAlive) return;
        
        // Cancel reload on shoot
        if (isReloading) {
            isReloading = false;
            if (reloadTimer) clearTimeout(reloadTimer);
            const reloadNotice = document.getElementById('reload-notice');
            if (reloadNotice) reloadNotice.style.display = 'none';
        }
        
        const now = Date.now();
        if (now - lastShotTime < SHOOT_COOLDOWN) return;
        if (localAmmo <= 0) return;
        
        localAmmo--;
        lastShotTime = now;
        actualizarHUD();
        
        // Raycast from camera center
        const shootRaycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2(0, 0); // center of screen
        shootRaycaster.setFromCamera(mouse, camera);
        shootRaycaster.far = MAX_SHOOT_DISTANCE;
        
        // Get all remote player meshes
        const remoteTargets = [];
        for (const id in remotePlayers) {
            const p = remotePlayers[id];
            if (p.personaje) {
                p.personaje.traverse((child) => {
                    if (child.isMesh) remoteTargets.push(child);
                });
            }
        }
        
        const intersects = shootRaycaster.intersectObjects(remoteTargets, false);
        if (intersects.length > 0) {
            // Find which remote player was hit
            let hitId = null;
            for (const id in remotePlayers) {
                const p = remotePlayers[id];
                if (!p.personaje) continue;
                let found = false;
                p.personaje.traverse((child) => {
                    if (child === intersects[0].object) found = true;
                });
                if (found) { hitId = id; break; }
            }
            if (hitId && socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                    type: 'player_shot',
                    targetId: hitId,
                    damage: SHOOT_DAMAGE
                }));
            }
        }
    }
});

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

// Dirección de las luces
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 20, 10);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 100;
directionalLight.shadow.camera.left = -30;
directionalLight.shadow.camera.right = 30;
directionalLight.shadow.camera.top = 30;
directionalLight.shadow.camera.bottom = -30;
scene.add(directionalLight);

const suelo = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 200),
    new THREE.MeshStandardMaterial({ color: 0x393D42 })
);
suelo.rotation.x = -Math.PI / 2;
suelo.receiveShadow = true;
scene.add(suelo);

const limiteEscenario = 100;

function verificarColision(direccion) {
  if (!personaje) return false;
    const origen = new THREE.Vector3(
        personaje.position.x,
        personaje.position.y + 0.5,
        personaje.position.z
    );
    
    raycaster.set(origen, direccion);
    raycaster.far = radioPersonaje;
    
    const intersecciones = raycaster.intersectObjects(colisionadoresMeshes, true);

    // Ignorar colisiones contra las propias mallas del personaje
    for (let i = 0; i < intersecciones.length; i++) {
        let obj = intersecciones[i].object;
        let isOwn = false;
        while (obj) {
            if (obj === personaje) { isOwn = true; break; }
            obj = obj.parent;
        }
        if (!isOwn) return true;
    }

    return false;
}

function puedeMoverse(direccion) {
    return !verificarColision(direccion);
}

function moverPersonaje(delta) {
  if (!personaje) return;
    if (!isAlive) return;
    const velocidad = velocidadPersonaje;
    
    const direccionAdelante = new THREE.Vector3(
        Math.sin(anguloRotacionMouse),
        0,
        Math.cos(anguloRotacionMouse)
    );
    
    const direccionDerecha = new THREE.Vector3(
        Math.sin(anguloRotacionMouse + Math.PI / 2),
        0,
        Math.cos(anguloRotacionMouse + Math.PI / 2)
    );
    
    const movimiento = new THREE.Vector3();
    
    // Movimiento de teclas
    if (teclas.w) movimiento.add(direccionAdelante);
    if (teclas.s) movimiento.sub(direccionAdelante);
    if (teclas.d) movimiento.sub(direccionDerecha);
    if (teclas.a) movimiento.add(direccionDerecha);
    
    if (movimiento.length() > 0) {
        movimiento.normalize().multiplyScalar(velocidad * delta);
        
        if (puedeMoverse(movimiento.clone().normalize())) {
            personaje.position.x += movimiento.x;
            personaje.position.z += movimiento.z;
        }
        
        personaje.position.x = Math.max(-limiteEscenario, Math.min(limiteEscenario, personaje.position.x));
        personaje.position.z = Math.max(-limiteEscenario, Math.min(limiteEscenario, personaje.position.z));
    }
    
    velocidadVertical += gravedad * delta;
    personaje.position.y += velocidadVertical * delta;
    
    if (personaje.position.y <= 0) {
        personaje.position.y = 0;
        velocidadVertical = 0;
        enElSuelo = true;
    }
}

function actualizarCamara() {
  if (!personaje) return;
    anguloCamara = anguloRotacionMouse;
    
    const offsetX = Math.sin(anguloCamara) * distanciaCamara;
    const offsetZ = Math.cos(anguloCamara) * distanciaCamara;
    
    camera.position.x = personaje.position.x - offsetX;
    camera.position.z = personaje.position.z - offsetZ;
    camera.position.y = personaje.position.y + alturaCamara;
    
    camera.lookAt(
        personaje.position.x,
        personaje.position.y + 1,
        personaje.position.z
    );

    // Alinea la rotación del personaje en yaw para que dé la espalda a la cámara
    personaje.rotation.y = anguloCamara;
}

function animate() {
    requestAnimationFrame(animate);
    
    const delta = 1 / 60;
    
    if (usandoCamaraPersonaje) {
        moverPersonaje(delta);
        actualizarCamara();
        
        const isMoving = Object.values(teclas).some(v => v);
        if (isChavorumbaActive) {
            if (mixerBaile) mixerBaile.update(delta);
        } else if (isMoving) {
            if (mixerMovimiento) mixerMovimiento.update(delta);
        } else {
            if (mixerParado) mixerParado.update(delta);
        }
        
        // --- MULTIPLAYER UPDATE ---
        enviarActualizacionDeEstado();
        actualizarHUD();
        
        renderer.render(scene, camera);
    } else {
        renderer.render(scene, camaraPanoramica);
    }

    // --- REMOTE PLAYERS LERP & UPDATE ---
    for (const id in remotePlayers) {
        const p = remotePlayers[id];
        if (p.personaje) {
            // Interpolar posición suavemente para eliminar saltos en red
            if (p.targetPosicion) {
                p.personaje.position.lerp(new THREE.Vector3(p.targetPosicion.x, p.targetPosicion.y, p.targetPosicion.z), 0.25);
            }
            // Interpolar rotación suavemente (manejando envolturas angulares)
            if (p.targetRotacion !== undefined) {
                let diff = p.targetRotacion - p.personaje.rotation.y;
                diff = Math.atan2(Math.sin(diff), Math.cos(diff));
                p.personaje.rotation.y += diff * 0.25;
            }
            // Actualizar animador remoto
            const movementPath = getMovementAnimation(p.nombre);
            if (p.isChavorumbaActive) {
                if (p.mixerBaile) p.mixerBaile.update(delta);
            } else if (p.animacionActual === movementPath) {
                if (p.mixerMovimiento) p.mixerMovimiento.update(delta);
            } else {
                if (p.mixerParado) p.mixerParado.update(delta);
            }
        }
    }
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    camaraPanoramica.aspect = window.innerWidth / window.innerHeight;
    camaraPanoramica.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
