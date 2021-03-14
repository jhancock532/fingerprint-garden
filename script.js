import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import FingerprintJS from '@fingerprintjs/fingerprintjs';
import * as dat from 'dat.gui';
import Stats from 'stats.js';
import Backendless from 'backendless'; //requires --polyfill-node to run with SnowPack, see package.json

import * as Participant from './js/Participant.js';

/* Backendless API */
const API_HOST = 'https://eu-api.backendless.com';
const APP_ID = '45B6BB81-7AE1-BDD6-FF2B-68D2D53BF500';
const API_KEY = 'C754572D-9FFC-4A9F-9E2B-01D66026EDC1';

Backendless.serverURL = API_HOST;
Backendless.initApp(APP_ID, API_KEY);

let participantList = [];
let thisParticipant;

const activeParticipantsTable = Backendless.Data.of('activeParticipants');
activeParticipantsTable.find(Backendless.DataQueryBuilder.create().setPageSize(100).setSortBy('created'))
.then(result => { 
  participantList = result;
  console.log("GOT PARTICIPANTS: ", result); 
  //Use for loop to get rid of participants older than 24 hours, for when beforeunload doesn't work.
});

console.log("ADDING PARTICIPANT:");
addParticipantToDatabase();

function addParticipantToDatabase() {
  activeParticipantsTable.save({ hash: '1f73a44ae0239c73a5908960cb408e1a', position: '{ "x": 0, "y": 0 }' })
    .then(function (object) {
      console.log("SAVE SUCCESSFUL: ", object)
      thisParticipant = object;
      enableRealTime();
    })
    .catch(function (error) {
      console.error("SAVE UNSUCCESSFUL: ", error.message)
      throw error;
    });
}

function removeThisParticipantFromDatabase() {
  activeParticipantsTable.remove( { objectId: thisParticipant.objectId } )
 .then( function( timestamp ) {
  console.log("DELETE SUCCESSFUL: ", timestamp);
  })
 .catch( function( error ) {
  console.error("DELETE UNSUCCESSFUL: ", error.message);
  throw error;
  });
}

document.getElementById("removeParticipantButton").addEventListener("click", function(event){

  removeThisParticipantFromDatabase();
})

window.addEventListener("beforeunload", function(event) { 
  removeThisParticipantFromDatabase();
});

window.onbeforeunload = function(event) { removeThisParticipantFromDatabase(); };




function enableRealTime() {
  const rtHandlers = activeParticipantsTable.rt();
  
  rtHandlers.addCreateListener(participant => {
    participantList = [...participantList, participant];
  
    console.log("CREATE EVENT: ", participantList);
  });
  
  rtHandlers.addUpdateListener(participant => {
    participantList = participantList.map(m => m.objectId === participant.objectId ? participant : m);
  
    console.log("UPDATE EVENT: ", participantList);
  });
  
  rtHandlers.addDeleteListener(participant => {
    participantList = participantList.filter(m => m.objectId !== participant.objectId);
  
    console.log("DELETE EVENT: ", participantList);
  });
}



 
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

let loadedFingerprint = false, participantHash;

/* Fingerprint.js */
(async () => {
  const fp = await FingerprintJS.load();
  const result = await fp.get();
  participantHash = result.visitorId;
  loadedFingerprint = true;
  //console.log(visitorId);
})();

const canvasContainer = document.getElementById( 'canvas-container' );

/* Three.js */
const scene = new THREE.Scene();
scene.background = new THREE.Color( 0xcce0ff );
//scene.fog = new THREE.Fog( 0xcce0ff, 500, 10000 );

const participantManager = new Participant.Manager(scene);
participantManager.loadAllModels();

const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
camera.position.z = 8;
camera.position.y = 5;

const renderer = new THREE.WebGLRenderer();
renderer.shadowMap.enabled = true;
renderer.setSize( window.innerWidth, window.innerHeight );
canvasContainer.appendChild( renderer.domElement );

const clock = new THREE.Clock();

const controls = new OrbitControls( camera, renderer.domElement );
controls.maxPolarAngle = Math.PI * 0.45;
controls.minDistance = 5;
controls.maxDistance = 20;



const color = 0xFFFFFF;
const intensity = 0.2;
const light = new THREE.AmbientLight(color, intensity);
scene.add(light);

gui.addColor(new ColorGUIHelper(light, 'color'), 'value').name('Ambient Light');
gui.add(light, 'intensity', 0, 2, 0.01).name("Ambient Intensity");

const sunColor = 0xFF8833;
const sunIntensity = 1.9;
const sunLight = new THREE.DirectionalLight(sunColor, sunIntensity);
sunLight.position.set(0, 20, 40);
sunLight.target.position.set(0, 0, 0);

sunLight.castShadow = true; 
sunLight.shadow.mapSize.width = 512; 
sunLight.shadow.mapSize.height = 512; 
//Adjust for larger scene sizes, use the helpers.
//sunLight.shadow.camera.left = 0;
//sunLight.shadow.camera.bottom = 0;
//sunLight.shadow.camera.right = 0;
//sunLight.shadow.camera.top = 0;
sunLight.shadow.camera.near = 40;
sunLight.shadow.camera.far = 50;
sunLight.shadow.bias = -0.01; //Important! Used to prevent moire effects
//sunLight.shadow.normalBias = 0.00001;

gui.addColor(new ColorGUIHelper(sunLight, 'color'), 'value').name('Directional Light');
gui.add(sunLight, 'intensity', 0, 2, 0.01).name("Directional Intensity");

scene.add(sunLight);
scene.add(sunLight.target);

/*
const helper = new THREE.DirectionalLightHelper( sunLight, 5 );
scene.add( helper );
const shadowHelper = new THREE.CameraHelper( sunLight.shadow.camera );
scene.add( shadowHelper );
*/

const platformGeometry = new THREE.CylinderGeometry( 5, 5, 1, 32 );
const platformMaterial = new THREE.MeshStandardMaterial( { color: 0xffffff, roughness: 0.6, metalness: 0.8 } );
const platform = new THREE.Mesh( platformGeometry, platformMaterial );

platform.receiveShadow = true;
platform.translateY(-0.5);

scene.add( platform );


/* Resize the Window */
window.addEventListener('resize', onWindowResize);

function onWindowResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );
}

/*
//Called every frame to check whether resize necessary
//TODO - Update resizing according to this example

//https://threejsfundamentals.org/threejs/lessons/threejs-responsive.html

function resizeRendererToDisplaySize(renderer) {
  const canvas = renderer.domElement;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const needResize = canvas.width !== width || canvas.height !== height;
  if (needResize) {
    renderer.setSize(width, height, false);
  }
  return needResize;

  
if (resizeRendererToDisplaySize(renderer)) {
  const canvas = renderer.domElement;
  camera.aspect = canvas.clientWidth / canvas.clientHeight;
  camera.updateProjectionMatrix();
}

}
*/


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

let loading = true;

/* Animation */
const animate = function () {

  stats.begin();

  if (loadedFingerprint && participantManager.loadedModels && loading) {
    loading = false;
    participantManager.generateNewParticipant(participantHash, false);
    participantManager.generateNewParticipant("05908960cb408e1af73a44ae0239c73a", false);
    participantManager.generateNewParticipant("0eee33ee3ee3e3e33e3e3e3eee3e3e33", false);
    participantManager.generateNewParticipant("1cee3ffffffffffffffffffeee3e3e33", false);
  }

  let delta = clock.getDelta();

  if ( loading == false ) participantManager.updateMixers( delta );

  renderer.render( scene, camera );
  
  stats.end();

  requestAnimationFrame( animate );
  
};

animate();


