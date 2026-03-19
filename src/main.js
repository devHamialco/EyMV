import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const scene = new THREE.Scene();

const texturaCielo = new THREE.TextureLoader().load('./src/assets/imagenes/cielo.jpg');
scene.background = texturaCielo;

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const velocidadPersonaje = 5;
const teclas = { w: false, a: false, s: false, d: false, shift: false };

let anguloCamara = 0;
let anguloRotacionMouse = 0;
const sensibilidadRaton = 0.002;
const distanciaCamara = 5;
const alturaCamara = 3;

const personaje = crearPersonaje();
scene.add(personaje);

camera.position.set(0, 3, 5);

const loader = new GLTFLoader();
const edificios = [];
const colisionadores = [];

cargarEdificiosMedievales();
cargarEdificiosModernos();

function crearPersonaje() {
    const grupo = new THREE.Group();
    
    const cuerpoGeometria = new THREE.CapsuleGeometry(0.3, 0.8, 4, 8);
    const material = new THREE.MeshStandardMaterial({ color: 0x3498db });
    const cuerpo = new THREE.Mesh(cuerpoGeometria, material);
    cuerpo.position.y = 0.7;
    cuerpo.castShadow = true;
    grupo.add(cuerpo);
    
    const cabezaGeometria = new THREE.SphereGeometry(0.25, 16, 16);
    const cabeza = new THREE.Mesh(cabezaGeometria, material);
    cabeza.position.y = 1.5;
    cabeza.castShadow = true;
    grupo.add(cabeza);
    
    return grupo;
}

function cargarEdificiosModernos() {
    const edificiosModernos = [
        //cuadra 1
        //LadoA 
        { modelo: 'building_A.gltf', x: -34, z: 10, escala: 5, rotacion: 0 },
        { modelo: 'building_B.gltf', x: -27, z: 10, escala: 5, rotacion: 0 },
        { modelo: 'building_C.gltf', x: -19, z: 10, escala: 5, rotacion: 0 },
        { modelo: 'building_D.gltf', x: -10, z: 10, escala: 5, rotacion: 0 },
        //LadoB
        { modelo: 'building_E.gltf', x: -10, z: 2, escala: 5, rotacion: Math.PI / 2 },
        { modelo: 'building_F.gltf', x: -10, z: -18, escala: 5, rotacion: Math.PI / 2 },
        { modelo: 'building_D.gltf', x: -10, z: -8, escala: 5, rotacion: Math.PI / 2 },
        //LadoC
        { modelo: 'building_G.gltf', x: -40, z: -16, escala: 5, rotacion: -Math.PI / 2 },
        { modelo: 'building_H.gltf', x: -40, z: 2, escala: 5, rotacion: -Math.PI / 2 },
        { modelo: 'building_A.gltf', x: -40, z: 10, escala: 5, rotacion: -Math.PI / 2 },
        //LadoD
        { modelo: 'building_B.gltf', x: -30, z: -27, escala: 5, rotacion: Math.PI },
        { modelo: 'building_C.gltf', x: -23, z: -27, escala: 5, rotacion: Math.PI },
        { modelo: 'building_E.gltf', x: -15, z: -27, escala: 5, rotacion: Math.PI },

        //cuadra 2
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
        { modelo: 'building_E.gltf', x: 31, z: -27, escala: 5, rotacion: Math.PI },

        //cuadra 3
        //LadoA 
        { modelo: 'building_A.gltf', x: -34, z: -47, escala: 5, rotacion: 0 },
        { modelo: 'building_B.gltf', x: -27, z: -47, escala: 5, rotacion: 0 },
        { modelo: 'building_C.gltf', x: -19, z: -47, escala: 5, rotacion: 0 },
        { modelo: 'building_D.gltf', x: -10, z: -47, escala: 5, rotacion: 0 },
        //LadoB
        { modelo: 'building_E.gltf', x: -10, z: -55, escala: 5, rotacion: Math.PI / 2 },
        { modelo: 'building_F.gltf', x: -10, z: -75, escala: 5, rotacion: Math.PI / 2 },
        { modelo: 'building_D.gltf', x: -10, z: -65, escala: 5, rotacion: Math.PI / 2 },
        //LadoC
        { modelo: 'building_G.gltf', x: -40, z: -55, escala: 5, rotacion: -Math.PI / 2 },
        { modelo: 'building_H.gltf', x: -40, z: -39, escala: 5, rotacion: -Math.PI / 2 },
        { modelo: 'building_A.gltf', x: -40, z: -47, escala: 5, rotacion: -Math.PI / 2 },
        //LadoD
        { modelo: 'building_B.gltf', x: -30, z: -67, escala: 5, rotacion: Math.PI },
        { modelo: 'building_C.gltf', x: -23, z: -67, escala: 5, rotacion: Math.PI },
        { modelo: 'building_E.gltf', x: -15, z: -67, escala: 5, rotacion: Math.PI },

        //cuadra 4
        //LadoA 
        { modelo: 'building_A.gltf', x: 15, z: -47, escala: 5, rotacion: 0 },
        { modelo: 'building_B.gltf', x: 23, z: -47, escala: 5, rotacion: 0 },
        { modelo: 'building_C.gltf', x: 31, z: -47, escala: 5, rotacion: 0 },
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
                    }
                });
                scene.add(modelo);
                edificios.push(modelo);
                
                const box = new THREE.Box3().setFromObject(modelo);
                colisionadores.push({ box, tipo: 'edificio' });
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
                    }
                });
                scene.add(modelo);
                edificios.push(modelo);
                
                const box = new THREE.Box3().setFromObject(modelo);
                colisionadores.push({ box, tipo: 'edificio' });
            },
            undefined,
            (error) => console.error(`Error cargando ${edificio.modelo}:`, error)
        );
    });
}

document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (key in teclas) teclas[key] = true;
    if (key === 'shift') teclas.shift = true;
});

document.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();
    if (key in teclas) teclas[key] = false;
    if (key === 'shift') teclas.shift = false;
});

document.addEventListener('mousemove', (event) => {
    anguloRotacionMouse -= event.movementX * sensibilidadRaton;
});

document.addEventListener('click', () => {
    renderer.domElement.requestPointerLock();
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
    new THREE.PlaneGeometry(100, 150),
    new THREE.MeshStandardMaterial({ color: 0x393D42 })
);
suelo.rotation.x = -Math.PI / 2;
suelo.receiveShadow = true;
scene.add(suelo);

const limiteEscenario = 45;

function verificarColision(nuevaPosicion) {
    const personajeBox = new THREE.Box3(
        new THREE.Vector3(nuevaPosicion.x - 0.3, 0, nuevaPosicion.z - 0.3),
        new THREE.Vector3(nuevaPosicion.x + 0.3, 1.8, nuevaPosicion.z + 0.3)
    );
    
    for (const colisionador of colisionadores) {
        if (personajeBox.intersectsBox(colisionador.box)) {
            return true;
        }
    }
    
    return false;
}

function moverPersonaje(delta) {
    const velocidad = teclas.shift ? velocidadPersonaje * 2 : velocidadPersonaje;
    
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
        
        const nuevaPosX = new THREE.Vector3(
            personaje.position.x + movimiento.x,
            personaje.position.y,
            personaje.position.z
        );
        
        const nuevaPosZ = new THREE.Vector3(
            personaje.position.x,
            personaje.position.y,
            personaje.position.z + movimiento.z
        );
        
        if (!verificarColision(nuevaPosX)) {
            personaje.position.x = nuevaPosX.x;
        }
        
        if (!verificarColision(nuevaPosZ)) {
            personaje.position.z = nuevaPosZ.z;
        }
        
        personaje.position.x = Math.max(-limiteEscenario, Math.min(limiteEscenario, personaje.position.x));
        personaje.position.z = Math.max(-limiteEscenario, Math.min(limiteEscenario, personaje.position.z));
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
    
    moverPersonaje(delta);
    actualizarCamara();
    
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
