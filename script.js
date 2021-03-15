import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import FingerprintJS from '@fingerprintjs/fingerprintjs';
import * as dat from 'dat.gui';
import Stats from 'stats.js';
import Backendless from 'backendless'; //requires --polyfill-node to run with SnowPack, see package.json

import * as Participant from './js/Participant.js';

let participantID = makeRandomParticipantID(16);

/* Backendless API */
const API_HOST = 'https://eu-api.backendless.com';
const APP_ID = '45B6BB81-7AE1-BDD6-FF2B-68D2D53BF500';
const API_KEY = 'C754572D-9FFC-4A9F-9E2B-01D66026EDC1';

Backendless.serverURL = API_HOST;
Backendless.initApp(APP_ID, API_KEY);

const channel = Backendless.Messaging.subscribe('default');

const onMessage = message => {
  console.log(message.message);
  let participantObject = JSON.parse(message.message);

  if (message.subtopic == "NEW PARTICIPANT"){

    if (participantID != participantObject.id) {
      participantManager.generateNewParticipant(participantObject.id, participantObject.hash, false);
    }
  }

  if (message.subtopic == "PRESENT"){
    if (participantManager.participantIsPresent(participantObject.id)){
      participantManager.resetParticipantTimeToLive(participantObject.id);
    } else {
      participantManager.generateNewParticipant(participantObject.id, participantObject.hash, false);
    }
  }
}

setInterval(function sendPresenceSignal(){
  let participantObject = {
    "id": participantID,
    "hash": participantHash
  }

  const request = Backendless.Messaging.publish('default', JSON.stringify(participantObject), {subtopic: "PRESENT"});
}, 1000),

channel.addMessageListener(onMessage);

let participantList = [];

const ghostParticipants = Backendless.Data.of('ghostParticipants');
ghostParticipants.find(Backendless.DataQueryBuilder.create().setPageSize(100).setSortBy('created'))
.then(result => { 
  participantList = result;
  console.log("GOT GHOST PARTICIPANTS: ", result); 
});


function addParticipantToDatabase(participantHash) {
  ghostParticipants.save({ hash: participantHash })
    .then(function (object) {
      console.log("SAVE SUCCESSFUL: ", object)
    })
    .catch(function (error) {
      console.error("SAVE UNSUCCESSFUL: ", error.message)
      throw error;
    });
}

function makeRandomParticipantID(length) {
  let result = '';
  const characters  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
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
    participantManager.generateNewParticipant(participantID, participantHash, false);

    let participantObject = {
      "id": participantID,
      "hash": participantHash
    }

    const request = Backendless.Messaging.publish('default', JSON.stringify(participantObject), {subtopic: "NEW PARTICIPANT"});

    //add some logic here to check if hash already in database.
    //don't bother adding the same hash to the DB
    addParticipantToDatabase(participantHash);
  }

  let delta = clock.getDelta();

  if ( loading == false ) {
    participantManager.updateMixers( delta );
    participantManager.updateParticipantsTimeToLive();
  }

  renderer.render( scene, camera );
  
  stats.end();

  requestAnimationFrame( animate );
  
};

animate();


