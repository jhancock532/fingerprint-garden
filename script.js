import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import FingerprintJS from '@fingerprintjs/fingerprintjs';
import * as dat from 'dat.gui';
import Stats from 'stats.js';
import * as FingerprintGarden from './js/FingerprintGarden.js';
import 'tocca';

let fingerprintHash;
let fingerprintHashLoaded = false;
let loading = true;

const TIME_BETWEEN_GHOST_UPDATES = 30000;

let aboutInformationDisplayed = false;

const loadingSplashElement = document.getElementById( "loading-splash" );
const aboutButtonElement = document.getElementById( "about-button" );
const aboutInformationElement = document.getElementById( "about-information" );
const informationOverlayElement = document.getElementById( "information-overlay" );

aboutButtonElement.addEventListener( "click", ( e ) => {

	e.preventDefault();

	if ( aboutInformationDisplayed ) {

		aboutInformationElement.style.opacity = 0;
		aboutInformationElement.style.pointerEvents = "none";
		aboutButtonElement.innerText = "About this Website";

	} else {

		aboutInformationElement.style.opacity = 1;
		aboutInformationElement.style.pointerEvents = "initial";
		aboutButtonElement.innerText = "Go Back to the Garden";
		informationOverlayElement.style.display = "none";

	}

	aboutInformationDisplayed = ! aboutInformationDisplayed;

} );

const stats = new Stats();
stats.showPanel( 0 );
stats.dom.style.opacity = 0;
stats.dom.style.transition = "opacity 1s ease";
document.body.appendChild( stats.dom );

const gui = new dat.GUI();
dat.GUI.toggleHide();

const guiParams = {

	toggleStatsDisplay: function () {

		if ( stats.dom.style.opacity == 0 ) {

			stats.dom.style.opacity = 1;

		} else {

			stats.dom.style.opacity = 0;

		}

	}

};

gui.add( guiParams, "toggleStatsDisplay" ).name( "Show FPS Statistics" );

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
const scene = new THREE.Scene();
scene.background = new THREE.Color( 0xcce0ff );
gui.addColor( new BackgroundGUIHelper( scene.background, ), 'value' ).name( 'Background' );

scene.fog = new THREE.Fog( 0xcce0ff, 10, 100 );

const sceneManager = new FingerprintGarden.Manager( scene );
sceneManager.loadAllModels();

setInterval( function manageGhostParticipants() {

	if ( loading == false ) {

		sceneManager.updateGhosts();

	}

}, TIME_BETWEEN_GHOST_UPDATES );


const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 100 );
camera.position.z = 8;
camera.position.y = 5;

const canvas = document.getElementById( 'canvas' );
const renderer = new THREE.WebGLRenderer( { canvas } );
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

/*
//Shadows aren't great for performance, so I've cut them.

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
*/

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

const platformEdgeGeometry = new THREE.CylinderBufferGeometry( 6.1, 6.1, 1, 32 );
const platformEdgeMaterial = new THREE.MeshStandardMaterial( { color: 0x555555, roughness: 0.9, metalness: 0.1 } );
const platformEdge = new THREE.Mesh( platformEdgeGeometry, platformEdgeMaterial );

platform.name = "GROUND";
platform.translateY( - 0.5 );
platform.scale.set( 1.1, 1, 1.5 );

platformEdge.name = "PLATFORM-EDGE";
platformEdge.translateY( - 0.51 );
platformEdge.scale.set( 1.1, 1, 1.5 );

scene.add( platform );
scene.add( platformEdge );

window.addEventListener( 'resize', onWindowResize );

function onWindowResize() {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );

}

function resizeRendererToDisplaySize( renderer ) {

	// Resizing code taken from
	// https://threejsfundamentals.org/threejs/lessons/threejs-responsive.html
	// the best solution I've found

	const canvas = renderer.domElement;
	const width = canvas.clientWidth;
	const height = canvas.clientHeight;

	const needResize = canvas.width !== width || canvas.height !== height;

	if ( needResize ) {

		renderer.setSize( width, height, false );

	}

	return needResize;

}

const raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();

function onDoubleClick( event ) {

	informationOverlayElement.style.opacity = 0;

	event.preventDefault();

	if ( event.x == null ) event.x = event.clientX;
	if ( event.y == null ) event.y = event.clientY;

	//using .x and .y here instead of .clientX and .clientY because tocca gives .x and .y

	mouse.x = ( event.x / renderer.domElement.clientWidth ) * 2 - 1;
	mouse.y = - ( event.y / renderer.domElement.clientHeight ) * 2 + 1;

	raycaster.setFromCamera( mouse, camera );

	let intersects = raycaster.intersectObjects( scene.children, true );

	for ( let i = 0; i < intersects.length; i ++ ) {

		if ( intersects[ i ].object.name == "PLATFORM-EDGE" ) break;
		if ( intersects[ i ].object.name == "CAMERA_TOWER_BASE" ) break;
		if ( intersects[ i ].object.name == "SCREEN_STAND" ) break;

		if ( intersects[ i ].object.name == "GROUND" ) {

			let destination = intersects[ i ].point;
			sceneManager.moveVisitorParticipant( destination );
			break;

		}

		if ( intersects[ i ].object.name.substring( 0, 4 ) == "SEAT" ) {

			const seatId = parseInt( intersects[ i ].object.name.substring( 5, 6 ) );
			sceneManager.sitVisitorParticipant( seatId );
			break;

		}

	}

}

//renderer.domElement.addEventListener( 'dblclick', onDoubleClick, false );
// This event is not necessary with below listener

renderer.domElement.addEventListener( 'dbltap', onDoubleClick, false );
// dbltap is provided by Tocca.js

const animate = function () {

	stats.begin();

	if ( fingerprintHashLoaded && sceneManager.loadedModels && sceneManager.loadedGhosts && loading ) {

		loading = false;

		sceneManager.initialiseVisitorParticipant( fingerprintHash );
		sceneManager.initialiseGhosts();
		sceneManager.initialiseSocketMessages();

		loadingSplashElement.style.opacity = 0;
		aboutButtonElement.style.opacity = "100%";
		informationOverlayElement.style.opacity = "100%";

		setInterval( () => {

			sceneManager.switchLiveCameraFeed();

		}, 10000 );

	}

	let delta = clock.getDelta();

	if ( loading == false ) {

		sceneManager.updateMixers( delta );
		sceneManager.updateParticipantsTimeToLive( delta );
		sceneManager.updateSecuritySystem( renderer );

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


