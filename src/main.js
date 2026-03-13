import * as THREE from "three";
import * as CANNON from "cannon-es";

//Mundo de caramelo
const mundo = new CANNON.World();
mundo.gravity.set(0, -9.82, 0);

// Escena y Cámara
const scene = new THREE.Scene();

let fov = 75;
const aspect = window.innerWidth / window.innerHeight;
const near = 0.1;
const far = 1000;
const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);

// Crear el renderizador
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// Crear el cielo
//Esfera cielo
const skyGeometry = new THREE.SphereGeometry(50, 32, 32);
const skyMaterial = new THREE.MeshBasicMaterial({
  map: new THREE.TextureLoader().load('/assets/imagenes/cielo.jpg'),
  side: THREE.BackSide, // renderizar solo el interior de la esfera
});

const sky = new THREE.Mesh(skyGeometry, skyMaterial);
scene.add(sky);

// Clonador de cajitas
function crearCaja(tamaño, posicion, texturaPath, mass = 1, restitution = 0.3) {
    const geometry = new THREE.BoxGeometry(tamaño.x, tamaño.y, tamaño.z);
    const loader = new THREE.TextureLoader();

    let material;

    // Usamos .includes para detectar si es una skin de cabeza
    if (texturaPath.includes('steve.png') || texturaPath.includes('creeper.png')) {
        
        // Configuración para un atlas de "Solo Cabeza" 
        const u = 1/4; 
        const v = 1/2; 

        const cargarCaraCabeza = (x, y) => {
            const tex = loader.load(texturaPath);
            tex.magFilter = THREE.NearestFilter;
            tex.repeat.set(u, v); 
            tex.offset.set(x * u, y * v); 
            return new THREE.MeshStandardMaterial({ map: tex });
        };

        // Mapeo estándar para el despliegue de una cabeza de Minecraft
        material = [
            cargarCaraCabeza(2, 0), 
            cargarCaraCabeza(0, 0), 
            cargarCaraCabeza(1, 1), 
            cargarCaraCabeza(2, 1), 
            cargarCaraCabeza(1, 0), 
            cargarCaraCabeza(3, 0)  
        ];
    } 

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(posicion);
    scene.add(mesh);
   
    // Configuración física con Cannon.js
    const shape = new CANNON.Box(new CANNON.Vec3(tamaño.x/2, tamaño.y/2, tamaño.z/2));
    const body = new CANNON.Body({ mass, shape });
    body.position.copy(posicion);
    body.material = new CANNON.Material({ restitution });
    mundo.addBody(body);
   
    return { mesh, body };
}

function crearSuelo(tamaño, posicion, color) {
    const geometry = new THREE.PlaneGeometry(tamaño.x, tamaño.z);
    const planeMaterial = new THREE.MeshBasicMaterial({  });
    const planeTexture = new THREE.TextureLoader().load('/assets/imagenes/pasto.jpg');
    planeTexture.wrapS = THREE.RepeatWrapping;
    planeTexture.wrapT = THREE.RepeatWrapping;
    planeTexture.repeat.set(10, 10);
    planeMaterial.map = planeTexture;
    const mesh = new THREE.Mesh(geometry, planeMaterial);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(posicion);
    scene.add(mesh);
   
    const shape = new CANNON.Plane();
    const body = new CANNON.Body({ mass: 0, shape: shape });
    body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    body.position.copy(posicion);
    mundo.addBody(body);
   
    return { mesh, body };
}

const suelo = crearSuelo(
    { x: 10, z: 10 },        
    { x: 0, y: 0, z: 0 },    
    0x808080                  
);

// Steve 
const cajaRoja = crearCaja(
    { x: 1, y: 1, z: 1 },    
    { x: 0, y: 0.5, z: 0 },  
    '/assets/imagenes/steve.png',
    2,                        
    1                      
);

// Creeper 
const cubo = crearCaja(
    { x: 1, y: 1, z: 1 },    
    { x: 999, y: 999, z: 999 }, 
    '/assets/imagenes/creeper.png', 
    1, 
    1
);

cubo.body.sleep(); 


//Luz direccional
const directionalLight = new THREE.DirectionalLight(0xffffff, 4);
const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
directionalLight.position.set(10, 10, 10);
scene.add(directionalLight);
scene.add(ambientLight);

let anguloOrbita = 0;
const radioOrbita = 6;
const alturaOrbita = 3.5;
let disparado = false;

window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {

        //resetear el cubo
        cubo.body.sleep();
        cubo.body.position.set(999, 999, 999);
        cubo.body.velocity.set(0, 0, 0);
        cubo.body.angularVelocity.set(0, 0, 0);
        cubo.mesh.position.set(999, 999, 999);

        // Posición de la cámara
        const posCamara = camera.position.clone();
        cubo.body.wakeUp();
        cubo.body.position.set(posCamara.x, posCamara.y, posCamara.z);
        cubo.mesh.position.copy(cubo.body.position);

        // Dirección hacia el cubo rojo
        const objetivo = new THREE.Vector3(
            cajaRoja.body.position.x,
            cajaRoja.body.position.y,
            cajaRoja.body.position.z
        );
        const direccion = objetivo.sub(posCamara).normalize();
        const velocidad = 16;

        cubo.body.velocity.set(
            direccion.x * velocidad,
            direccion.y * velocidad,
            direccion.z * velocidad
        );
 
    }
});

function animar() {
    requestAnimationFrame(animar);
    mundo.step(1 / 60);
    sky.rotation.y += 0.002;

    anguloOrbita += 0.015;
    const targetX = cajaRoja.mesh.position.x;
    const targetZ = cajaRoja.mesh.position.z;
    camera.position.x = targetX + Math.sin(anguloOrbita) * radioOrbita;
    camera.position.z = targetZ + Math.cos(anguloOrbita) * radioOrbita;
    camera.position.y = alturaOrbita;
    camera.lookAt(cajaRoja.mesh.position);

    cubo.mesh.position.copy(cubo.body.position);
    cubo.mesh.quaternion.copy(cubo.body.quaternion);

    cajaRoja.mesh.position.copy(cajaRoja.body.position);
    cajaRoja.mesh.quaternion.copy(cajaRoja.body.quaternion);

    renderer.render(scene, camera);
}

animar();