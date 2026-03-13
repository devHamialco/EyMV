import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0.5, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const velocidadCamara = 5;
const teclas = { w: false, a: false, s: false, d: false };

document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (key in teclas) teclas[key] = true;
    if (event.code === 'Space') {
        lanzarProyectil();
    }
});

document.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();
    if (key in teclas) teclas[key] = false;
});

const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
directionalLight.position.set(5, 10, 5);
scene.add(directionalLight);

const suelo = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardMaterial({ color: 0x4CAF50 })
);
suelo.rotation.x = -Math.PI / 2;
scene.add(suelo);

const loader = new GLTFLoader();
let modelo = null;
let modeloDireccion = 1;
const modeloVelocidad = 2;

loader.load(
    './src/assets/scene.gltf',
    (gltf) => {
        modelo = gltf.scene;
        modelo.position.set(3, 0, 0);
        modelo.scale.set(0.5, 0.5, 0.5);
        scene.add(modelo);
    },
    undefined,
    (error) => {
        console.error('Error:', error);
    }
);

const proyectiles = [];
const proyectilVelocidad = 15;

function lanzarProyectil() {
    const geometria = new THREE.SphereGeometry(0.15, 16, 16);
    const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const proyectil = new THREE.Mesh(geometria, material);
    
    proyectil.position.copy(camera.position);
    
    const direccion = new THREE.Vector3();
    camera.getWorldDirection(direccion);
    
    proyectil.userData = {
        velocidad: direccion.multiplyScalar(proyectilVelocidad),
        activo: true
    };
    
    scene.add(proyectil);
    proyectiles.push(proyectil);
}

function animar() {
    requestAnimationFrame(animar);
    
    const direccion = new THREE.Vector3();
    camera.getWorldDirection(direccion);
    direccion.y = 0;
    direccion.normalize();
    
    const derecha = new THREE.Vector3();
    derecha.crossVectors(new THREE.Vector3(0, 1, 0), direccion).normalize();
    
    if (teclas.w) camera.position.addScaledVector(direccion, velocidadCamara * 0.016);
    if (teclas.s) camera.position.addScaledVector(direccion, -velocidadCamara * 0.016);
    if (teclas.a) camera.position.addScaledVector(derecha, velocidadCamara * 0.016);
    if (teclas.d) camera.position.addScaledVector(derecha, -velocidadCamara * 0.016);
    
    const modeloBox = new THREE.Box3();
    
    if (modelo) {
        modelo.position.x += modeloDireccion * modeloVelocidad * 0.016;
        modeloBox.setFromObject(modelo);
        
        if (modelo.position.x > 5) {
            modeloDireccion = -1;
        } else if (modelo.position.x < -5) {
            modeloDireccion = 1;
        }
    }
    
    for (let i = proyectiles.length - 1; i >= 0; i--) {
        const p = proyectiles[i];
        if (!p.userData.activo) continue;
        
        p.position.add(p.userData.velocidad.clone().multiplyScalar(0.016));
        
        if (p.position.y < -1 || p.position.distanceTo(new THREE.Vector3(0, 0, 0)) > 50) {
            scene.remove(p);
            proyectiles.splice(i, 1);
            continue;
        }
        
        if (modelo && modeloBox.containsPoint(p.position)) {
            modelo.rotation.y += Math.PI / 2;
            scene.remove(p);
            proyectiles.splice(i, 1);
        }
    }
    
    renderer.render(scene, camera);
}

animar();
