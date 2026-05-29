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
        mixer: null,
        action: null,
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

    if (p.nombre !== state.nombre || p.animacionActual !== state.animacionActual || p.isChavorumbaActive !== state.isChavorumbaActive) {
        p.nombre = state.nombre;
        p.animacionActual = state.animacionActual;
        p.isChavorumbaActive = state.isChavorumbaActive;
        cargarPersonajeRemoto(id);
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
        p.mixer = null;
        p.action = null;
    }

    loader.load(
        p.animacionActual,
        (gltf) => {
            if (!remotePlayers[id]) return;

            const modelo = gltf.scene;
            modelo.scale.set(escalaDeseada, escalaDeseada, escalaDeseada);
            modelo.position.set(p.posicion.x, p.posicion.y, p.posicion.z);
            modelo.rotation.y = p.rotacion;

            modelo.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    child.userData.isPersonaje = true;
                    colisionadoresMeshes.push(child);
                }
            });

            // Añadir etiqueta de texto con Nombre e IP flotantes sobre la cabeza
            const tagText = `${p.nombre}`;
            const sprite = createTextSprite(tagText);
            sprite.position.set(0, 47, 0);
            sprite.scale.set(4 / escalaDeseada, 1 / escalaDeseada, 1 / escalaDeseada);
            modelo.add(sprite);

            scene.add(modelo);
            p.personaje = modelo;

            if (gltf.animations && gltf.animations.length > 0) {
                p.mixer = new THREE.AnimationMixer(modelo);
                const action = p.mixer.clipAction(gltf.animations[0]);
                action.setLoop(THREE.LoopRepeat, Infinity);
                action.play();
                p.action = action;
            }
        },
        undefined,
        (error) => console.error(`[Multiplayer] Error cargando personaje remoto ID ${id}:`, error)
    );
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
cargarChavo();
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

// Carga el personaje Chavo desde GLTF
function cargarChavo() {
        // Si ya hay un personaje, preservar su posición/rotación y eliminar colisionadores previos
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

        loader.load(
                AnimacionActual,
        (gltf) => {
            const modelo = gltf.scene;
            modelo.scale.set(escalaDeseada, escalaDeseada, escalaDeseada);
            // Aplicar posición/rotación previa para evitar saltos al cambiar animación
            modelo.position.copy(posicionPrev);
            modelo.rotation.copy(rotacionPrev);
            modelo.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                                        // marcar como malla de personaje para facilitar reemplazos posteriores
                                        child.userData.isPersonaje = true;
                                        colisionadoresMeshes.push(child);
                }
            });

            

            scene.add(modelo);
            personaje = modelo;
                        // No cambiar `Nombre` aquí: `Nombre` controla qué animaciones/respuestas usar.
            if (gltf.animations && gltf.animations.length > 0) {
                chavoMixer = new THREE.AnimationMixer(modelo);
                                const action = chavoMixer.clipAction(gltf.animations[0]);
                                action.setLoop(THREE.LoopRepeat, Infinity);
                                action.play();
                                chavoAction = action;
            }
        },
        undefined,
        (error) => console.error('Error cargando Chavo:', error)
    );
}

// Carga y reemplaza el personaje por el GLB pedido ('J')
function cargarChavorumba() {
    // Actualizar estado deseado para este modelo/sonido
    AnimacionActual = getModeloBaile(Nombre);
    CancionActual = getCancionBaile(Nombre);
    // Guardar posición y rotación del personaje actual (si existe)
    const posicionPrev = new THREE.Vector3(0, 0, 0);
    const rotacionPrev = new THREE.Euler(0, 0, 0);
    if (personaje) {
        posicionPrev.copy(personaje.position);
        rotacionPrev.copy(personaje.rotation);
        // Eliminar colisionadores asociados al personaje anterior
        personaje.traverse((child) => {
            if (child.isMesh && child.userData && child.userData.isPersonaje) {
                const idx = colisionadoresMeshes.indexOf(child);
                if (idx !== -1) colisionadoresMeshes.splice(idx, 1);
            }
        });
        scene.remove(personaje);
    }

    // Reset de mixers/acciones previas
    chavoMixer = null;
    chavoAction = null;
    isChavorumbaActive = false;

    loader.load(
        AnimacionActual,
        (gltf) => {
            const modelo = gltf.scene;
            // Aplicar la misma posición y rotación que el personaje anterior
            modelo.position.copy(posicionPrev);
            modelo.rotation.copy(rotacionPrev);
            // Aplicar escala compartida
            modelo.scale.set(escalaDeseada, escalaDeseada, escalaDeseada);
            modelo.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    child.userData.isPersonaje = true;
                    colisionadoresMeshes.push(child);
                }
            });

            

            scene.add(modelo);
            personaje = modelo;
            isChavorumbaActive = true;

            if (gltf.animations && gltf.animations.length > 0) {
                chavoMixer = new THREE.AnimationMixer(modelo);
                const action = chavoMixer.clipAction(gltf.animations[0]);
                action.setLoop(THREE.LoopRepeat, Infinity);
                action.play();
                chavoAction = action;
            }
            // Reproducir la canción asociada si aún no se está reproduciendo
            playCurrentSong();
        },
        undefined,
        (error) => console.error('Error cargando Chavorumba:', error)
    );
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


    if (event.key.toLowerCase() === '1') {
        Nombre = 'Chavo';
    }

    if (event.key.toLowerCase() === '2') {
        Nombre = 'Quico';
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

document.addEventListener('click', () => {
    if (usandoCamaraPersonaje) {
        renderer.domElement.requestPointerLock();
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
        if (chavoMixer) chavoMixer.update(delta);
        
        // --- MULTIPLAYER UPDATE ---
        enviarActualizacionDeEstado();
        
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
            if (p.mixer) {
                p.mixer.update(delta);
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
