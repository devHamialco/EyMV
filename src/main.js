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

let velocidadVertical = 0;
let enElSuelo = true;
const gravedad = -30;
const fuerzaSalto = 12;

const personaje = crearPersonaje();
scene.add(personaje);

camera.position.set(0, 3, 5);

const loader = new GLTFLoader();
const edificios = [];
const colisionadoresMeshes = [];
const raycaster = new THREE.Raycaster();
const radioPersonaje = 0.4;

cargarEdificiosMedievales();
cargarEdificiosModernos();

function crearPersonaje() {
    const grupo = new THREE.Group();

    const loaderPersonaje = new GLTFLoader();
    loaderPersonaje.load(
        './src/assets/chavo/scene.gltf',
        (gltf) => {
            const modelo = gltf.scene;
            modelo.scale.set(0.05, 0.05, 0.05);
            // Cargar y aplicar texturas al modelo
            const texLoader = new THREE.TextureLoader();
            const texFace = texLoader.load('./src/assets/chavo/textures/face_baseColor.png');
            const texBody = texLoader.load('./src/assets/chavo/textures/body_baseColor.png');
            const texClothes = texLoader.load('./src/assets/chavo/textures/clothes_baseColor.png');

            modelo.traverse((child) => {
                if (!child.isMesh) return;
                let chosen = texBody;
                const nm = (child.name || '').toLowerCase();
                if (nm.includes('face') || nm.includes('head')) chosen = texFace;
                else if (nm.includes('cloth') || nm.includes('shirt') || nm.includes('pants') || nm.includes('torso')) chosen = texClothes;
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => { m.map = chosen; m.needsUpdate = true; });
                } else {
                    child.material.map = chosen;
                    child.material.needsUpdate = true;
                }
                child.castShadow = true;
                child.receiveShadow = true;
            });

            grupo.add(modelo);
        },
        undefined,
        (error) => console.error('Error cargando modelo del personaje:', error)
    );

    return grupo;
}

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

document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (key in teclas) teclas[key] = true;
    
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

document.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();
    if (key in teclas) teclas[key] = false;
});

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
    const origen = new THREE.Vector3(
        personaje.position.x,
        personaje.position.y + 0.5,
        personaje.position.z
    );
    
    raycaster.set(origen, direccion);
    raycaster.far = radioPersonaje;
    
    const intersecciones = raycaster.intersectObjects(colisionadoresMeshes);
    
    return intersecciones.length > 0;
}

function puedeMoverse(direccion) {
    return !verificarColision(direccion);
}

function moverPersonaje(delta) {
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
    
    if (teclas.w) movimiento.add(direccionAdelante);
    if (teclas.s) movimiento.sub(direccionAdelante);
    if (teclas.d) movimiento.add(direccionDerecha);
    if (teclas.a) movimiento.sub(direccionDerecha);
    
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
}

function animate() {
    requestAnimationFrame(animate);
    
    const delta = 1 / 60;
    
    if (usandoCamaraPersonaje) {
        moverPersonaje(delta);
        actualizarCamara();
        renderer.render(scene, camera);
    } else {
        renderer.render(scene, camaraPanoramica);
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
