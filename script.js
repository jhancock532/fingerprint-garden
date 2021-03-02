import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import FingerprintJS from '@fingerprintjs/fingerprintjs';
import * as dat from 'dat.gui';
import Stats from 'stats.js';
 
/* Stats.js */
var stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

/* dat.GUI */
let params = {
  movementSpeed: 1,
}
const gui = new dat.GUI();
dat.GUI.toggleHide();

//lightingFolder.add(params, "movementSpeed", 0, 100).name("Speed");

class ColorGUIHelper {
  constructor(object, prop) {
    this.object = object;
    this.prop = prop;
  }
  get value() {
    return `#${this.object[this.prop].getHexString()}`;
  }
  set value(hexString) {
    this.object[this.prop].set(hexString);
  }
}

/* Fingerprint.js */
(async () => {
  const fp = await FingerprintJS.load();
  const result = await fp.get();
  const visitorId = result.visitorId;
  //console.log(visitorId);
})();


const canvasContainer = document.getElementById( 'canvas-container' );

/* Three.js */
const scene = new THREE.Scene();
scene.background = new THREE.Color( 0xcce0ff );
//scene.fog = new THREE.Fog( 0xcce0ff, 500, 10000 );

const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
camera.position.z = 5;
camera.position.y = 3;

const renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
canvasContainer.appendChild( renderer.domElement );

const controls = new OrbitControls( camera, renderer.domElement );
controls.maxPolarAngle = Math.PI * 0.45;
controls.minDistance = 5;
controls.maxDistance = 20;

let mixer;
const clock = new THREE.Clock();

/* Model Loading */
const loader = new GLTFLoader();

loader.load( 'models/camping-scene/scene.gltf',

  //"camping buscraft ambience" (https://skfb.ly/6V9Ru) by Edgar_koh 
  //is licensed under Creative Commons Attribution (http://creativecommons.org/licenses/by/4.0/).

	function ( gltf ) {
		scene.add( gltf.scene );

    gltf.scene.traverse( function ( child ) {

      //And awkward update of encoding is required to load the Image Based Lighting correctly.
      if ( child.isMesh ) {
        const encoding = THREE.LinearEncoding;

        if (child.material != undefined){
          if (child.material.map) child.material.map.encoding = encoding;
          if (child.material.emissiveMap) child.material.emissiveMap.encoding = encoding;
          if (child.material.map || child.material.emissiveMap) child.material.needsUpdate = true;

          //Issues with non-transparent parts of the model clipping in front of other parts.
          //The solution would be to specify render order perhaps?
          //I've considered this not worthwhile to worry about. Shame, the transparent trees looked nicer.
          
          //child.material.depthTest = true;
          child.material.depthWrite = true;
          child.material.transparent = false;

          //if (child.material.name = "lambert6"){
          //  child.material.renderOrder = 1;
          //}
        }

      }
    });

    mixer = new THREE.AnimationMixer( gltf.scene );
		var action = mixer.clipAction( gltf.animations[ 0 ] );
		action.play();
    
	},
	function ( xhr ) {
    //Loading progress event.
    if (xhr != Infinity){
      console.log( ( xhr.loaded / xhr.total * 100 ) + '% loaded' );
    }
	},
	function ( error ) {
		console.log( 'An error happened' );
	}
);


/* Resize the Window */
window.addEventListener('resize', onWindowResize);

function onWindowResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );
}

/* Click to Find Object */
const raycaster = new THREE.Raycaster();

function onClick( event ) {
  event.preventDefault();
  
  raycaster.setFromCamera( {x:0, y:0}, camera );
  
  let intersects = raycaster.intersectObjects( scene.children, true );
  
  if ( intersects.length > 0 ) {
    console.log(intersects[0].object);
  }
}

renderer.domElement.addEventListener('click', onClick, false);

/* Animation */
const animate = function () {
  stats.begin();

  var delta = clock.getDelta();

	if ( mixer ) mixer.update( delta );

  renderer.render( scene, camera );
  
  stats.end();

  requestAnimationFrame( animate );
};

animate();


