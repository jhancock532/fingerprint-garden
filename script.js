import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import FingerprintJS from '@fingerprintjs/fingerprintjs';
import * as dat from 'dat.gui';
import Stats from 'stats.js';
import * as Participant from './js/Participant.js';

let fingerprintHash;
let fingerprintHashLoaded = false;
let loading = true;

const TIME_BETWEEN_GHOST_UPDATES = 30000;

//#region Stats and GUI
/* Stats.js */
var stats = new Stats();
stats.showPanel( 0 );
document.body.appendChild( stats.dom );

/* dat.GUI */
//let params = {

//};

const gui = new dat.GUI();
dat.GUI.toggleHide();

//lightingFolder.add(params, "movementSpeed", 0, 100).name("Speed");

class ColorGUIHelper {

	constructor( object, prop ) {

		this.object = object;
		this.prop = prop;

	}
	get value() {

		return `#${this.object[ this.prop ].getHexString()}`;

	}
	set value( hexString ) {

		this.object[ this.prop ].set( hexString );

	}

}

class BackgroundGUIHelper {

	constructor( background ) {

		this.background = background;

	}

	get value() {

		return `#${this.background.getHexString()}`;

	}

	set value( hexString ) {

		this.background.set( hexString );

	}

}

/* Fingerprint.js */
( async () => {

	const fp = await FingerprintJS.load();
	const result = await fp.get();
	fingerprintHash = result.visitorId;
	fingerprintHashLoaded = true;

} )();

/* Three.js */
//const canvasContainer = document.getElementById( 'canvas-container' );

const scene = new THREE.Scene();
scene.background = new THREE.Color( 0xcce0ff );
gui.addColor( new BackgroundGUIHelper( scene.background, ), 'value' ).name( 'Background' );

//scene.fog = new THREE.Fog( 0xcce0ff, 500, 10000 );

const participantManager = new Participant.Manager( scene );
participantManager.loadAllModels();
//participantManager.loadGhostsFromDatabase();

setInterval( function manageGhostParticipants() {

	if ( loading == false ) {

		participantManager.updateGhosts();

	}

}, TIME_BETWEEN_GHOST_UPDATES );

//#region THREE.js

const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
camera.position.z = 8;
camera.position.y = 5;

const canvas = document.getElementById( 'canvas' );
const renderer = new THREE.WebGLRenderer( { canvas } );

renderer.shadowMap.enabled = true;
//renderer.setSize( window.innerWidth, window.innerHeight );

const clock = new THREE.Clock();

const controls = new OrbitControls( camera, renderer.domElement );
controls.maxPolarAngle = Math.PI * 0.45;
controls.minDistance = 5;
controls.maxDistance = 20;

const color = 0xFFFFFF;
const intensity = 0.7;
const light = new THREE.AmbientLight( color, intensity );
scene.add( light );

gui.addColor( new ColorGUIHelper( light, 'color' ), 'value' ).name( 'Ambient Light' );
gui.add( light, 'intensity', 0, 2, 0.01 ).name( "Ambient Intensity" );

const sunColor = 0xFFFFFF;
const sunIntensity = 1.35;
const sunLight = new THREE.DirectionalLight( sunColor, sunIntensity );
sunLight.position.set( 0, 20, 40 );
sunLight.target.position.set( 0, 0, 0 );


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
sunLight.shadow.bias = - 0.01; //Important! Used to prevent moire effects
//sunLight.shadow.normalBias = 0.00001;

gui.addColor( new ColorGUIHelper( sunLight, 'color' ), 'value' ).name( 'Directional Light' );
gui.add( sunLight, 'intensity', 0, 2, 0.01 ).name( "Directional Intensity" );

scene.add( sunLight );
scene.add( sunLight.target );

/*
const helper = new THREE.DirectionalLightHelper( sunLight, 5 );
scene.add( helper );
const shadowHelper = new THREE.CameraHelper( sunLight.shadow.camera );
scene.add( shadowHelper );
*/

const platformGeometry = new THREE.CylinderBufferGeometry( 6, 6, 1, 32 );
const platformMaterial = new THREE.MeshStandardMaterial( { color: 0x005500, roughness: 0.8, metalness: 0.1 } );
const platform = new THREE.Mesh( platformGeometry, platformMaterial );

platform.name = "GROUND";
platform.receiveShadow = true;
platform.translateY( - 0.5 );
platform.scale.set( 1.1, 1, 1.5 );

scene.add( platform );


/* Resize the Window */
window.addEventListener( 'resize', onWindowResize );

function onWindowResize() {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );

}

function resizeRendererToDisplaySize( renderer ) {

	// Resizing code taken from
	// https://threejsfundamentals.org/threejs/lessons/threejs-responsive.html

	const canvas = renderer.domElement;
	const width = canvas.clientWidth;
	const height = canvas.clientHeight;

	const needResize = canvas.width !== width || canvas.height !== height;

	if ( needResize ) {

		renderer.setSize( width, height, false );

	}

	return needResize;

}

/* Double click to walk */
const raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();

function onDoubleClick( event ) {

	event.preventDefault();

	mouse.x = ( event.clientX / renderer.domElement.clientWidth ) * 2 - 1;
	mouse.y = - ( event.clientY / renderer.domElement.clientHeight ) * 2 + 1;

	raycaster.setFromCamera( mouse, camera );

	//raycaster.setFromCamera( { x: 0, y: 0 }, camera );

	let intersects = raycaster.intersectObjects( scene.children, true );

	for ( let i = 0; i < intersects.length; i ++ ) {

		if ( intersects[ i ].object.name == "GROUND" ) {

			let destination = intersects[ i ].point;
			participantManager.moveVisitorParticipant( destination );
			break;

		}

		if ( intersects[ i ].object.name.substring( 0, 4 ) == "SEAT" ) {

			const seatId = parseInt( intersects[ i ].object.name.substring( 5, 6 ) );
			participantManager.sitVisitorParticipant( seatId );
			break;

		}

	}

}

renderer.domElement.addEventListener( 'dblclick', onDoubleClick, false );

//#endregion

/* Animation */
const animate = function () {

	stats.begin();

	if ( fingerprintHashLoaded && participantManager.loadedModels && participantManager.loadedGhosts && loading ) {

		loading = false;

		participantManager.initialiseVisitorParticipant( fingerprintHash );
		participantManager.initialiseGhosts();
		participantManager.initialiseSocketMessages();

	}

	let delta = clock.getDelta();

	if ( loading == false ) {

		participantManager.updateMixers( delta );
		participantManager.updateParticipantsTimeToLive( delta );

	}

	if ( resizeRendererToDisplaySize( renderer ) ) {

		const canvas = renderer.domElement;
		camera.aspect = canvas.clientWidth / canvas.clientHeight;
		camera.updateProjectionMatrix();

	}

	renderer.render( scene, camera );

	stats.end();

	requestAnimationFrame( animate );

};

animate();


