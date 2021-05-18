import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SkeletonUtils } from 'three/examples/jsm/utils/SkeletonUtils.js';
import TWEEN from '@tweenjs/tween.js';
import Backendless from 'backendless'; //requires --polyfill-node to run with SnowPack, see package.json
import { InstancedMesh } from 'three';

const API_HOST = 'https://eu-api.backendless.com';
const APP_ID = '45B6BB81-7AE1-BDD6-FF2B-68D2D53BF500';
const API_KEY = 'C754572D-9FFC-4A9F-9E2B-01D66026EDC1';

const TIME_TO_LIVE = 3000; //1000 milliseconds = 1 second
const SPAWN_DIAMETER = 10;
const GHOST_FADE_IN = 4000;
const GHOST_FADE_OUT = 2000;
const DEBUG_MODE = false;

const LENGTH_OF_RANDOM_PARTICIPANT_ID = 16;

let hashPosition = 1; //global for recursive mesh traverse

class Participant {

	constructor( id, hash, mesh, position, timeToLive, modelAnimations ) {

		this.id = id;
		this.hash = hash;
		this.model = mesh;
		this.timeToLive = timeToLive;
		this.modelAnimations = modelAnimations;

		this.mixer = new THREE.AnimationMixer( mesh );
		this.activeAction = this.mixer.clipAction( this.modelAnimations[ 0 ][ 0 ] ); //Idle
		this.mixer.clipAction( this.modelAnimations[ 0 ][ 5 ] ); //Walk
		this.mixer.clipAction( this.modelAnimations[ 0 ][ 3 ] ); //Sitting
		this.activeAction.play();

		this.previousAction;
		this.moving = false;
		this.sitting = false;
		this.seatId = null;

		this.rotation = Math.random() * Math.PI;
		this.position = position;

		this.model.rotateY( this.rotation );
		this.model.position.set( this.position.x, this.position.y, this.position.z );

	}

	toJSON() {

		return JSON.stringify( {

			id: this.id,
			hash: this.hash,
			timeToLive: this.timeToLive,
			position: this.position,
			seatId: this.seatId,

		} );

	}

	setRandomParticipantID() {

		let result = '';
		const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		const charactersLength = characters.length;
		for ( let i = 0; i < LENGTH_OF_RANDOM_PARTICIPANT_ID; i ++ ) {

			result += characters.charAt( Math.floor( Math.random() * charactersLength ) );

		}

		this.id = result;

	}

	fadeToAnimationClip( animationClip, duration ) {

		//Based on the similar function in the Three.js example,
		//https://github.com/mrdoob/three.js/blob/master/examples/webgl_animation_multiple.html

		this.previousAction = this.activeAction;
		this.activeAction = this.mixer.existingAction( animationClip );

		if ( this.previousAction !== this.activeAction ) {

			this.previousAction.fadeOut( duration );

		}

		this.activeAction
			.reset()
			.setEffectiveTimeScale( 1 )
			.setEffectiveWeight( 1 )
			.fadeIn( duration )
			.play();

	}

	sitDown( seat ) {

		this.movePosition( seat.sittingPosition, () => {

			const quaternionTime = { t: 0 };
			const startQuaternion = this.model.quaternion.clone();
			const endQuaternion = new THREE.Quaternion();
			endQuaternion.setFromAxisAngle( new THREE.Vector3( 0, 1, 0 ), seat.rotation );

			new TWEEN.Tween( quaternionTime )
				.to( { t: 1 }, 1000 )
				.onUpdate( () => {

					THREE.Quaternion.slerp( startQuaternion, endQuaternion, this.model.quaternion, quaternionTime.t );

				} )
				.easing( TWEEN.Easing.Quadratic.InOut )
				.onComplete( () => {

					this.fadeToAnimationClip( this.modelAnimations[ 0 ][ 3 ], 0.5 );

					this.activeAction.halt( 8.0 );
					//halt gradually slows animation to a stop, preventing sitting down animation looping.

					this.moving = false;
					this.sitting = true;

				} ).start();

		} );

	}

	movePosition( position, onFinish ) {

		//onFinish is a callback function that is executed when the animation has finished.
		//I'm using it in this codebase for chaining sequences of animations,
		//  To denote the end of an animation use
		//    () => this.moving = false
		//  as the callback function.
		//The lambda function makes the this.moving local scope :)

		// "The first parameter can be either an AnimationClip object or the name of an AnimationClip."
		// https://threejs.org/docs/#api/en/animation/AnimationMixer.existingAction
		// Sadly I can't get animation clip names to work :/ (TODO - raise issue?)

		if ( this.moving === false ) {

			this.moving = true;

			if ( this.sitting ) {

				this.fadeToAnimationClip( this.modelAnimations[ 0 ][ 0 ], 0.5 ); //Idle
				this.sitting = false;

				setTimeout( () => {

					this.moving = false;
					this.movePosition( position, onFinish );

				}, 500 );

				return;

			}

			position = new THREE.Vector3( position.x, position.y, position.z );

			//Thank you James, this quaternion gist is super handy
			//https://gist.github.com/jhancock532/cea8ce753617bd704fb4ac2f5390bc91
			//obama-awarding-obama-meme.jpg

			const quaternionTime = { t: 0 };
			const startQuaternion = this.model.quaternion.clone();
			this.model.lookAt( position );
			const endQuaternion = this.model.quaternion.clone();

			const distanceToTravel = position.distanceTo( this.position );
			const timeToTravel = distanceToTravel * 1000 * 0.5; //2m per second

			this.position = position;
			//do this before animation so the new position gets sent correctly in moveVisitorParticipant()

			new TWEEN.Tween( quaternionTime )
				.to( { t: 1 }, 1000 )
				.onUpdate( () => {

					THREE.Quaternion.slerp( startQuaternion, endQuaternion, this.model.quaternion, quaternionTime.t );

				} )
				.easing( TWEEN.Easing.Quadratic.InOut )
				.onComplete( () => {

					this.fadeToAnimationClip( this.modelAnimations[ 0 ][ 5 ], 0.5 ); //Walking

					new TWEEN.Tween( this.model.position )
						.to( { x: position.x, y: position.y, z: position.z }, timeToTravel )
						.easing( TWEEN.Easing.Linear.None ) //other easings don't make sense on longer walks
						.onComplete( () => {

							this.fadeToAnimationClip( this.modelAnimations[ 0 ][ 0 ], 0.5 ); //Idle
							this.moving = false; //could have another 0.5 wait here for the fade
							onFinish();

						} )
						.start();

				} )
				.start();

		}

	}

}

class Ghost {

	constructor( id, hash, mesh, modelAnimations ) {

		this.id = id;
		this.hash = hash;
		this.model = mesh;

		this.mixer = new THREE.AnimationMixer( mesh );
		this.activeAction = this.mixer.clipAction( modelAnimations[ 0 ][ 0 ] );
		this.activeAction.play();

		this.invisible = false; //Will despawn when true

		this.model.rotateY( Math.random() * Math.PI );

		this.model.position.set(
			( Math.random() - 0.5 ) * SPAWN_DIAMETER, 0,
			( Math.random() - 0.5 ) * SPAWN_DIAMETER );

	}

	vanish() {

		this.model.traverse( function ( child ) {

			if ( child.isMesh ) {

				new TWEEN.Tween( child.material )
					.to( { opacity: 0 }, GHOST_FADE_OUT )
					.easing( TWEEN.Easing.Quadratic.InOut )
					.start();

			}

		} );

		this.invisible = true;

		//Note that animation clips have to be uncached manually on removal from scene
		//https://threejs.org/docs/#api/en/animation/AnimationMixer.stopAllAction

	}

}

class Garden {

	constructor( scene ) {

		//There are more effiecent ways of loading models, this is a potential optimisation.
		//I'm not too worried about loading times though.

		this.flowerModelURL = "models/garden/pressed-flowers.glb";
		this.grassModelURL = "models/garden/GrassQuaternius.glb";
		this.benchModelURL = "models/garden/benchtall.glb";
		this.cameraModelURL = "models/garden/camera.glb";

		this.loader = new GLTFLoader();

		this.GRASS_LAYOUT = "FINGERPRINT"; //"LABYRINTH"
		//I've hidden this in the code as a nod to the Fingermaze of Hove Park.
		//If you like what I've made and want to send a tip, donate via labyrinth.tez (Tezoz Wallet URL)

		this.modelMeshes = [];
		this.flowerModel;
		this.grassModel;
		this.cameraModel;
		this.grassInstanceMesh;
		this.scene = scene;

		this.flowerPositions = [];
		this.cameraTowers = [];

		this.loadedModels = false;

		this.seats = [];
		this.createGardenSeats();

		this.createGrassCanvasContext();

	}

	createGardenSeats() {

		//Nearest right bench
		this.seats.push( new Seat( this.scene, { x: 4.9, y: 1, z: 3 }, Math.PI * 3 / 2, 0 ) );
		this.seats.push( new Seat( this.scene, { x: 4.9, y: 1, z: 1.5 }, Math.PI * 3 / 2, 1 ) );

		//Farest right bench
		this.seats.push( new Seat( this.scene, { x: 4.8, y: 1, z: - 3.7 }, Math.PI * 1.4, 2 ) );
		this.seats.push( new Seat( this.scene, { x: 5.1, y: 1, z: - 2.3 }, Math.PI * 1.4, 3 ) );

		//Nearest left bench
		this.seats.push( new Seat( this.scene, { x: - 4.8, y: 1, z: 2.9 }, Math.PI * 0.6, 4 ) );
		this.seats.push( new Seat( this.scene, { x: - 5.1, y: 1, z: 1.5 }, Math.PI * 0.5, 5 ) );

		//Farest left bench
		this.seats.push( new Seat( this.scene, { x: - 4.9, y: 1, z: - 3.5 }, Math.PI * 0.6, 6 ) );
		this.seats.push( new Seat( this.scene, { x: - 4.95, y: 1, z: - 2.15 }, Math.PI * 0.55, 7 ) );

		//Middle bench
		this.seats.push( new Seat( this.scene, { x: - 0.6, y: 1, z: 7.6 }, Math.PI * 1, 8 ) );
		this.seats.push( new Seat( this.scene, { x: 0.7, y: 1, z: 7.5 }, Math.PI * 1, 9 ) );

	}

	createGrassCanvasContext() {

		let imageID = ( this.GRASS_LAYOUT == "FINGERPRINT" ) ? "fingerprint-image" : "labyrinth-image";

		const grassImage = document.getElementById( imageID );
		const grassCanvas = document.createElement( 'canvas' );
		this.grassImageWidth = grassCanvas.width = grassImage.width;
		this.grassImageHeight = grassCanvas.height = grassImage.height;

		//Image width and height is 59 & 100 for tiny fingerprint, 114 & 121 for labyrinth print

		this.grassCanvasContext = grassCanvas.getContext( '2d' );
		this.grassCanvasContext.drawImage( grassImage, 0, 0, grassImage.width, grassImage.height );

	}

	getGrassPixelBrightness( x, y ) {

		const pixelData = this.grassCanvasContext.getImageData( x, y, 1, 1 ).data; //returns in format [r, g, b, a]

		return ( ( pixelData[ 0 ] + pixelData[ 1 ] + pixelData[ 2 ] ) / 3 ) / 255;
		//https://stackoverflow.com/questions/8751020/how-to-get-a-pixels-x-y-coordinate-color-from-an-image

	}

	addGrassInstances() {

		const matrix = new THREE.Matrix4();

		//const grassInstanceMaterial = new THREE.MeshStandardMaterial( { color: 0x44ff00, roughness: 0.6, metalness: 0.1 } );
		const grassInstanceMaterial = new THREE.MeshPhongMaterial( { color: 0x33ee00 } );
		//Not as nice, but slight performance benefits. Ideally, test and verify.
		const maxGrassInstances = ( this.GRASS_LAYOUT == "FINGERPRINT" ) ? 1867 : 1317; // 1327 uses a max of 2439 with the smaller fingerprint image.
		this.grassInstanceMesh = new InstancedMesh( this.grassModel.scene.children[ 0 ].geometry, grassInstanceMaterial, maxGrassInstances );

		let grassInstanceCount = 0;

		const iterationAddition = ( this.GRASS_LAYOUT == "FINGERPRINT" ) ? 1 : 2;
		const grassInstanceModulo = ( this.GRASS_LAYOUT == "FINGERPRINT" ) ? 18 : 13;

		for ( let x = 0; x < this.grassImageWidth; x += iterationAddition ) {

			for ( let y = 0; y < this.grassImageHeight; y += iterationAddition ) {

				const position = new THREE.Vector3();
				const rotation = new THREE.Euler();
				const quaternion = new THREE.Quaternion();
				const scale = new THREE.Vector3();

				if ( this.getGrassPixelBrightness( x, y ) < 0.3 ) {

					grassInstanceCount += 1;

					if ( grassInstanceCount > maxGrassInstances ) break;

					position.x = ( x - this.grassImageWidth / 2 ) / this.grassImageWidth * 10;
					position.y = 0;
					position.z = ( y - this.grassImageHeight / 2 ) / this.grassImageHeight * 15;

					if ( grassInstanceCount % grassInstanceModulo == 0 ) {

						this.flowerPositions.push( position.clone() );

					}

					rotation.x = 0;
					rotation.y = Math.random() * 2 * Math.PI;
					rotation.z = 0;

					quaternion.setFromEuler( rotation );

					scale.x = scale.y = scale.z = 1 + Math.random();

					matrix.compose( position, quaternion, scale );

					this.grassInstanceMesh.setMatrixAt( grassInstanceCount, matrix );

				}

			}

		}

		// console.log( grassInstanceCount ); TODO - optimize for mobile? research?

		this.scene.add( this.grassInstanceMesh );

	}

	addBenches() {

		const scale = 3;

		const benchMesh = this.benchModel.scene.clone();
		benchMesh.scale.set( scale, scale, scale );
		//benchMesh.receiveShadow = true;
		//benchMesh.castShadow = true;

		const benchMeshOne = benchMesh.clone();
		benchMeshOne.position.set( 5.6, 0.15, 2.1 );
		benchMeshOne.rotation.set( 0, 1.4, 0 );
		this.scene.add( benchMeshOne );

		const benchMeshTwo = benchMesh.clone();
		benchMeshTwo.position.set( 5.6, 0.15, - 3.1 );
		benchMeshTwo.rotation.set( 0, 1.6, 0 );
		this.scene.add( benchMeshTwo );

		const benchMeshThree = benchMesh.clone();
		benchMeshThree.position.set( - 5.6, 0.15, 2.1 );
		benchMeshThree.rotation.set( 0, - 1.6, 0 );
		this.scene.add( benchMeshThree );

		const benchMeshFour = benchMesh.clone();
		benchMeshFour.position.set( - 5.6, 0.15, - 3.1 );
		benchMeshFour.rotation.set( 0, - 1.9, 0 );
		this.scene.add( benchMeshFour );

		const benchMeshFive = benchMesh.clone();
		benchMeshFive.position.set( 0.1, 0.15, 8.2 );
		benchMeshFive.rotation.set( 0, - 0.1, 0 );
		this.scene.add( benchMeshFive );

	}

	addCameraTowers() {

		//This is an experiemental and awkward way of coding
		//Introducing the "push directly to array and pass entire context to child because I like working with classes"
		//Although this is kinda what I've done for the Seat objects anyway... hmmm

		this.cameraTowers.push( new CameraTower( new THREE.Vector3( 4.2, 0, 6.1 ), this.cameraModel.scene.clone(), this.scene ) );
		this.cameraTowers.push( new CameraTower( new THREE.Vector3( 6, 0, - 0.5 ), this.cameraModel.scene.clone(), this.scene ) );
		this.cameraTowers.push( new CameraTower( new THREE.Vector3( - 4.2, 0, 6.1 ), this.cameraModel.scene.clone(), this.scene ) );
		this.cameraTowers.push( new CameraTower( new THREE.Vector3( - 6, 0, - 0.5 ), this.cameraModel.scene.clone(), this.scene ) );

	}

	pointCameraAtParticipant( cameraID, participant ) {

		if ( cameraID == null ) return;

		const footPosition = participant.model.position;
		//Not .position! .model.position tracks the participant accurately while they are walking.
		const headPosition = new THREE.Vector3( footPosition.x, footPosition.y + 1.9, footPosition.z );

		this.cameraTowers[ 0 ].cameraMesh.lookAt( headPosition );
		this.cameraTowers[ 1 ].cameraMesh.lookAt( headPosition );
		this.cameraTowers[ 2 ].cameraMesh.lookAt( headPosition );
		this.cameraTowers[ 3 ].cameraMesh.lookAt( headPosition );

	}

	shuffleFlowerPositions() {

		//https://stackoverflow.com/questions/2450954/how-to-randomize-shuffle-a-javascript-array
		let currentIndex = this.flowerPositions.length, temporaryValue, randomIndex;

		// While there remain elements to shuffle...
		while ( 0 !== currentIndex ) {

			// Pick a remaining element...
			randomIndex = Math.floor( Math.random() * currentIndex );
			currentIndex -= 1;

			// And swap it with the current element.
			temporaryValue = this.flowerPositions[ currentIndex ];
			this.flowerPositions[ currentIndex ] = this.flowerPositions[ randomIndex ];
			this.flowerPositions[ randomIndex ] = temporaryValue;

		}

	}

	addParticipantFlowers( participantList ) {

		this.shuffleFlowerPositions();

		let scale = 0.9;

		for ( let i = 0; i < participantList.length; i ++ ) {

			let hashPosition = 1;

			function generateHashValue() {

				let value = parseInt( participantList[ i ].hash.charAt( hashPosition ), 16 );
				hashPosition = ( hashPosition + 1 ) % 32;
				return value / 16;

			}

			let flowerMesh = this.flowerModel.scene.children[ Math.floor( generateHashValue() * 12 ) ].clone();

			flowerMesh.traverse( function ( child ) {

				if ( child.isMesh ) {

					child.material = child.material.clone();
					//Materials are global, so create new materials instead of updating referenced materials.

					child.material.type = "MeshStandardMaterial";

					child.material.flatShading = true;
					child.material.needsUpdate = true;

					child.material.metalness = generateHashValue();
					child.material.roughness = generateHashValue();
					child.material.color = {
						r: generateHashValue(),
						g: generateHashValue(),
						b: generateHashValue() };

					child.material.transparent = true;
					child.material.opacity = 0.0;

					new TWEEN.Tween( child.material )
						.to( { opacity: 1.0 }, GHOST_FADE_IN )
						.easing( TWEEN.Easing.Quadratic.InOut )
						.start();

				}

			} );

			flowerMesh.position.set( this.flowerPositions[ i ].x, 0.6, this.flowerPositions[ i ].z );
			flowerMesh.scale.set( scale, scale, scale );
			this.scene.add( flowerMesh );

		}

	}

	async loadGardenModels() {

		this.flowerModel = await this.loadModel( this.flowerModelURL );
		this.grassModel = await this.loadModel( this.grassModelURL );
		this.benchModel = await this.loadModel( this.benchModelURL );
		this.cameraModel = await this.loadModel( this.cameraModelURL );

		this.addGrassInstances();
		this.addBenches();
		this.addCameraTowers();

		this.loadedModels = true;

	}

	async loadModel( modelURL ) {

		return new Promise( resolve => {

			this.loader.load( modelURL,

				function ( gltf ) {

					resolve( gltf );

				},

				function ( xhr ) {

					// if ( DEBUG_MODE ) console.log( xhr );

				},

				function ( error ) {

					console.error( 'An error happened loading a model: ', error );

				}

			);

		} );

	}

}

class CameraTower {

	constructor( position, cameraMesh, scene ) {

		this.position = position; //base of the tower
		this.cameraPosition = new THREE.Vector3( position.x, position.y + 4, position.z );
		this.cameraMesh = cameraMesh;

		this.addCameraTowerToScene( scene );

	}

	addCameraTowerToScene( scene ) {

		const BASE_RADIUS = 0.3;
		const POLE_RADIUS = 0.08;
		const TOWER_HEIGHT = 4;

		const towerBaseGeometry = new THREE.CylinderBufferGeometry( BASE_RADIUS, BASE_RADIUS, 2, 8 );
		const towerStandMaterial = new THREE.MeshStandardMaterial( { color: 0xcccccc, roughness: 0.5, metalness: 0.8 } );
		const towerBase = new THREE.Mesh( towerBaseGeometry, towerStandMaterial );
		towerBase.name = "CAMERA_TOWER_BASE";

		//Less typing? Trying to set position of a read only element without .setPosition(x, y, z)
		//https://stackoverflow.com/questions/14223249/how-can-i-set-the-position-of-a-mesh-before-i-add-it-to-the-scene-in-three-js
		Object.assign( towerBase.position, this.position );
		scene.add( towerBase );

		const towerPoleGeometry = new THREE.CylinderBufferGeometry( POLE_RADIUS, POLE_RADIUS, TOWER_HEIGHT, 4 );
		const towerPole = new THREE.Mesh( towerPoleGeometry, towerStandMaterial );

		towerPole.position.set( this.position.x, this.position.y + TOWER_HEIGHT / 2, this.position.z );
		scene.add( towerPole );

		Object.assign( this.cameraMesh.position, this.cameraPosition );
		this.cameraMesh.scale.set( 0.2, 0.2, 0.2 ); //This is comically large but that kinda works...
		scene.add( this.cameraMesh );

	}

}

class Seat {

	constructor( scene, position, rotation, id ) {

		this.scene = scene;
		this.rotation = rotation;
		this.sittingPosition = { x: position.x, y: position.y - 1, z: position.z };
		this.isOccupied = false;

		const size = 1.2;
		const geometry = new THREE.BoxGeometry( size, size, size );
		const material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );
		this.box = new THREE.Mesh( geometry, material );

		this.box.name = `SEAT-${id}`;
		this.box.position.set( position.x, position.y, position.z );
		this.box.visible = false;

		this.scene.add( this.box );

	}

}

class ObserverCamera {

	constructor( scene ) {

		this.scene = scene;

		//Following the render target tutorial at
		//https://threejsfundamentals.org/threejs/lessons/threejs-rendertargets.html

		const rtWidth = 400, rtHeight = 300;
		const rtFov = 60, rtAspect = rtWidth / rtHeight;
		const rtNear = 1, rtFar = 25;

		this.activeCameraID = null;

		this.securityCamera = new THREE.PerspectiveCamera( rtFov, rtAspect, rtNear, rtFar );
		this.securityCamera.position.set( 0, 3, 4 );
		this.securityCamera.rotateX( - 1.4 );

		this.renderTarget = new THREE.WebGLRenderTarget( rtWidth, rtHeight );

		this.addDisplayToScene();

	}

	addHeart( position, rotation, scale ) {

		//This heart shape is joinked from the the below blog
		//http://blog.cjgammon.com/threejs-geometry
		//Who stole it from the Three.js docs, I think
		const heartShape = new THREE.Shape();

		heartShape.moveTo( 5, 5 );
		heartShape.bezierCurveTo( 5, 5, 4, 0, 0, 0 );
		heartShape.bezierCurveTo( - 6, 0, - 6, 7, - 6, 7 );
		heartShape.bezierCurveTo( - 6, 11, - 5, 15.4, 5, 19 );
		heartShape.bezierCurveTo( 12, 15.4, 16, 11, 16, 7 );
		heartShape.bezierCurveTo( 16, 7, 16, 0, 10, 0 );
		heartShape.bezierCurveTo( 7, 0, 5, 5, 5, 5 );

		const heartGeometry = new THREE.ExtrudeGeometry( heartShape, {
			depth: 2,
			bevelEnabled: false,
			bevelSegments: 2,
			steps: 2,
			bevelSize: 2,
			bevelThickness: 1
		} );

		const heartMesh = new THREE.Mesh( heartGeometry, new THREE.MeshPhongMaterial( { color: 0xaa22aa } ) );

		heartMesh.scale.set( scale, - scale, scale );
		Object.assign( heartMesh.position, position );
		heartMesh.rotateZ( rotation );

		this.scene.add( heartMesh );

	}

	addDisplayDecorations() {

		const fontLoader = new THREE.FontLoader();

		fontLoader.load( 'fonts/Itim_Regular_Subset.json', ( font ) => {

			const textGeometry = new THREE.TextGeometry( 'You are being followed', {
				font: font,
				size: 0.6,
				height: 0.2,
				curveSegments: 12,
				bevelEnabled: false,
				bevelThickness: 10,
				bevelSize: 8,
				bevelOffset: 0,
				bevelSegments: 5
			} );

			const textMaterial = new THREE.MeshStandardMaterial( { color: 0xaa22aa, roughness: 0.9, metalness: 0.2 } );
			const textMesh = new THREE.Mesh( textGeometry, textMaterial );
			textMesh.position.set( - 4.0, 5, - 8.5 );

			this.scene.add( textMesh );

		} );

		this.addHeart( new THREE.Vector3( - 2.2, 4.5, - 8.4 ), - 0.5, 0.04 );
		this.addHeart( new THREE.Vector3( 2, 4.4, - 8.4 ), 0.5, 0.04 );
		this.addHeart( new THREE.Vector3( 1.8, 4.9, - 8.4 ), - 0.5, 0.025 );
		this.addHeart( new THREE.Vector3( - 2.0, 4.8, - 8.4 ), 0.5, 0.025 );

	}

	addDisplayToScene() {

		const screenContainerGeometry = new THREE.BoxBufferGeometry( 5.4, 4.1, 0.2 );
		const screenContainerMaterial = new THREE.MeshStandardMaterial( { color: 0xcccccc, roughness: 0.5, metalness: 0.8 } );
		const screenContainerMesh = new THREE.Mesh( screenContainerGeometry, screenContainerMaterial );

		screenContainerMesh.position.set( 0, 3, - 8.61 );
		this.scene.add( screenContainerMesh );

		const screenStandGeometry = new THREE.BoxBufferGeometry( 4.0, 1.5, 1.1 );
		const screenStandMesh = new THREE.Mesh( screenStandGeometry, screenContainerMaterial );

		screenStandMesh.name = "SCREEN_STAND";
		screenStandMesh.position.set( 0, - 0.25, - 8.61 );
		this.scene.add( screenStandMesh );

		const screenPoleGeometry = new THREE.CylinderBufferGeometry( 0.09, 0.09, 2, 4 );
		const screenPoleMesh = new THREE.Mesh( screenPoleGeometry, screenContainerMaterial );
		screenPoleMesh.position.set( 0, 1, - 8.6 );
		this.scene.add( screenPoleMesh );

		const securityCameraScreenGeometry = new THREE.PlaneBufferGeometry( 5, 3.75 );
		const securityCameraScreenMaterial = new THREE.MeshPhongMaterial( {

			map: this.renderTarget.texture,
			color: new THREE.Color( 0x7777aa ),
			side: THREE.DoubleSide,

		} );

		const securityCameraScreen = new THREE.Mesh( securityCameraScreenGeometry, securityCameraScreenMaterial );

		securityCameraScreen.position.set( 0, 3, - 8.5 );
		this.scene.add( securityCameraScreen );

		this.addDisplayDecorations();

	}

	lookAtParticipant( participant ) {

		const footPosition = participant.model.position;
		//Not .position! .model.position tracks the participant accurately while they are walking.
		const headPosition = new THREE.Vector3( footPosition.x, footPosition.y + 1.8, footPosition.z );
		const distanceToCamera = this.securityCamera.position.distanceTo( headPosition );
		let cameraFOV = 30 - distanceToCamera * 1.5;

		if ( cameraFOV < 8 ) cameraFOV = 8;

		this.securityCamera.fov = cameraFOV;
		this.securityCamera.updateProjectionMatrix();
		this.securityCamera.lookAt( headPosition );

	}

	render( renderer ) {

		renderer.setRenderTarget( this.renderTarget );
		renderer.render( this.scene, this.securityCamera );
		renderer.setRenderTarget( null );

	}

}

export class Manager {

	constructor( scene ) {

		this.visitorParticipant;

		this.garden = new Garden( scene );
		this.observerCamera = new ObserverCamera( scene );

		this.participants = [];
		this.ghosts = [];
		this.loadedModels = false;
		this.loadedGhosts = false;
		this.ghostParticipantList = [];
		this.scene = scene;

		// Models from http://quaternius.com/
		this.characterModelURLs = [ 'models/Male_Suit.glb', 'models/Female_Casual.glb' ];

		this.modelMeshes = [];
		this.modelAnimations = [];
		this.loader = new GLTFLoader();

		Backendless.serverURL = API_HOST;
		Backendless.initApp( APP_ID, API_KEY );

		this.BackendlessGhostDatabase = Backendless.Data.of( 'ghostParticipants' );
		this.BackendlessMessagingChannel;

	}

	async loadAllModels() {

		await this.garden.loadGardenModels();

		//This can be improved with promise.all somehow...
		for ( let i = 0; i < this.characterModelURLs.length; i ++ ) {

			let model = await this.loadModel( this.characterModelURLs[ i ] );
			this.modelMeshes.push( model.scene );
			this.modelAnimations.push( model.animations );

		}

		this.loadedModels = true;

		this.loadGhostsFromDatabase(); //moved here because flower models are added after ghosts loaded
		//so we have to await the loading of the garden models first...

	}

	async loadModel( modelURL ) {

		return new Promise( resolve => {

			this.loader.load( modelURL,

				function ( gltf ) {

					resolve( gltf );

				},

				function ( xhr ) {

					// if ( DEBUG_MODE ) console.log( xhr );

				},

				function ( error ) {

					console.error( 'An error happened loading a model: ', error );

				}

			);

		} );

	}

	initialiseSocketMessages() {

		this.BackendlessMessagingChannel = Backendless.Messaging.subscribe( 'default' );
		this.BackendlessMessagingChannel.addMessageListener( ( messageData ) => {

			let participantObject = JSON.parse( messageData.message );

			if ( participantObject.id == this.visitorParticipant.id ) return;

			if ( messageData.subtopic == "NEW PARTICIPANT" ) {

				this.generateNewParticipant( participantObject.id, participantObject.hash, participantObject.position, false );

			}

			if ( messageData.subtopic == "PRESENT" ) {

				if ( this.participantIsPresent( participantObject.id ) ) {

					this.resetParticipantTimeToLive( participantObject.id );

				} else {

					this.generateNewParticipant( participantObject.id, participantObject.hash, participantObject.position, false );

				}

			}

			if ( messageData.subtopic == "MOVED" ) {

				if ( this.participantIsPresent( participantObject.id ) ) {

					this.resetParticipantTimeToLive( participantObject.id );

					if ( participantObject.seatId != null ) {

						participantObject.sitting = false;
						this.garden.seats[ participantObject.seatId ].isOccupied = false;
						participantObject.seatId = null;

					}

					this.moveParticipant( participantObject.id, participantObject.position );

				} else {

					this.generateNewParticipant( participantObject.id, participantObject.hash, participantObject.position, false );

				}

			}

			if ( messageData.subtopic == "SITTING" ) {

				if ( this.participantIsPresent( participantObject.id ) ) {

					this.resetParticipantTimeToLive( participantObject.id );

					const seat = this.garden.seats[ participantObject.seatId ];

					if ( seat.isOccupied == false ) {

						seat.isOccupied = true;
						this.sitParticipant( participantObject.id, seat );

					}

				} else {

					this.generateNewParticipant( participantObject.id, participantObject.hash, participantObject.position, false );

					const seat = this.garden.seats[ participantObject.seatId ];

					if ( seat.isOccupied == false ) {

						seat.isOccupied = true;
						this.sitParticipant( participantObject.id, seat );

					}

				}

			}

			if ( messageData.subtopic == "SEAT LEFT" ) {

				this.garden.seats[ participantObject.seatLeft ].isOccupied = false;

			}

		} );

		setInterval( () => {

			Backendless.Messaging.publish( 'default', this.visitorParticipant.toJSON(), { subtopic: "PRESENT" } );

		}, 2000 );

	}

	loadGhostsFromDatabase() {

		this.BackendlessGhostDatabase.find( Backendless.DataQueryBuilder.create().setPageSize( 100 ).setSortBy( 'created' ) )
			.then( result => {

				this.ghostParticipantList = result;
				this.loadedGhosts = true;
				this.garden.addParticipantFlowers( this.ghostParticipantList );

				if ( DEBUG_MODE ) console.log( "GOT GHOST PARTICIPANTS: ", this.ghostParticipantList );

			} );

	}

	addParticipantToDatabase( participantHash ) {

		this.BackendlessGhostDatabase.save( { hash: participantHash } )
			.then( function ( object ) {

				if ( DEBUG_MODE ) console.log( "DATABASE SAVE SUCCESSFUL: ", object );

			} )
			.catch( function ( error ) {

				console.error( "DATABASE SAVE UNSUCCESSFUL: ", error.message );
				throw error;

			} );

	}

	initialiseGhosts() {

		this.addRandomGhost();

		if ( Math.random() > 0.7 ) {

			this.addRandomGhost();

		}

	}

	addRandomGhost() {

		let ghostNumber = Math.floor( Math.random() * this.ghostParticipantList.length );

		let ghostPosition = new THREE.Vector3(
			( Math.random() - 0.5 ) * SPAWN_DIAMETER, 0,
			( Math.random() - 0.5 ) * SPAWN_DIAMETER );

		this.generateNewParticipant(
			this.ghostParticipantList[ ghostNumber ].objectID,
			this.ghostParticipantList[ ghostNumber ].hash,
			ghostPosition,
			true );

	}

	updateGhosts() {

		for ( let i = 0; i < this.ghosts.length; i ++ ) {

			if ( this.ghosts[ i ].invisible ) {

				this.scene.remove( this.ghosts[ i ].model );
				this.ghosts.splice( i, 1 );
				continue;

			}

			if ( Math.random() > 0.7 ) {

				this.ghosts[ i ].vanish();

			}

		}

		if ( this.ghosts.length < 5 ) {

			if ( Math.random() > 0.6 ) {

				this.addRandomGhost();

			}

		}

	}

	updateSecuritySystem( renderer ) {

		if ( this.observerCamera.activeCameraID == null ) {

			const cameraTowerPosition = this.garden.cameraTowers[ 0 ].cameraPosition;

			this.observerCamera.securityCamera.position.set( cameraTowerPosition.x, cameraTowerPosition.y, cameraTowerPosition.z );
			this.observerCamera.activeCameraID = 0;

		}

		this.garden.pointCameraAtParticipant( this.observerCamera.activeCameraID, this.visitorParticipant );
		this.observerCamera.lookAtParticipant( this.visitorParticipant );
		this.observerCamera.render( renderer );

	}

	switchLiveCameraFeed() {

		if ( this.garden.loadedModels ) {

			const newCameraID = ( this.observerCamera.activeCameraID + 1 ) % 4;
			const cameraTowerPosition = this.garden.cameraTowers[ newCameraID ].cameraPosition;

			this.observerCamera.securityCamera.position.set( cameraTowerPosition.x, cameraTowerPosition.y, cameraTowerPosition.z );
			this.observerCamera.activeCameraID = newCameraID;
			this.observerCamera.lookAtParticipant( this.visitorParticipant );

		}

	}

	updateMixers( delta ) {

		TWEEN.update( performance.now() );

		for ( let i = 0; i < this.participants.length; i ++ ) {

			if ( this.participants[ i ].mixer ) this.participants[ i ].mixer.update( delta );

		}

		for ( let i = 0; i < this.ghosts.length; i ++ ) {

			if ( this.ghosts[ i ].mixer ) this.ghosts[ i ].mixer.update( delta );

		}

	}

	updateParticipantsTimeToLive( delta ) {

		for ( let i = 0; i < this.participants.length; i ++ ) {

			this.participants[ i ].timeToLive -= delta;

			if ( this.participants[ i ].timeToLive <= 0 ) {

				this.scene.remove( this.participants[ i ].model );
				this.participants.splice( i, 1 );

			}

		}

	}

	moveVisitorParticipant( position ) {

		// If the current participant is sitting down
		if ( this.visitorParticipant.seatId != null ) {

			// Free the seat so that others can take it
			Backendless.Messaging.publish( 'default', JSON.stringify( {
				id: this.visitorParticipant.id,
				seatLeft: this.visitorParticipant.seatId,
			} ), { subtopic: "SEAT LEFT" } );

			this.garden.seats[ this.visitorParticipant.seatId ].isOccupied = false;
			this.visitorParticipant.seatId = null;

		}

		// Animate the change in position
		this.visitorParticipant.movePosition( position, () => this.moving = false );

		// Broadcast the position change and whether an occupied seat is now free
		Backendless.Messaging.publish( 'default', this.visitorParticipant.toJSON(), { subtopic: "MOVED" } );

	}

	moveParticipant( id, position ) {

		for ( let i = 0; i < this.participants.length; i ++ ) {

			if ( this.participants[ i ].id == id && this.visitorParticipant.id != id ) {

				//Important not to move the visitor participant twice, so check with id above.
				//The twice moving is caused because I don't filter pub sub messages coming from source - todo?

				//When moving the participant, free the seat.
				if ( this.participants[ i ].seatId != null ) {

					this.garden.seats[ this.participants[ i ].seatId ].isOccupied = false;
					this.participants[ i ].seatId = null;

				}

				this.participants[ i ].movePosition( position, () => this.moving = false );

			}

		}

	}

	sitVisitorParticipant( seatId ) {

		if ( this.visitorParticipant.seatId == seatId ) return;
		//Do nothing if visitor already sitting in selected seat.

		const seat = this.garden.seats[ seatId ];

		if ( seat.isOccupied == false ) {

			// If the target seat isn't taken...

			if ( this.visitorParticipant.seatId != null ) {

				// If the participant is currently sitting in a seat, make it free.
				this.garden.seats[ this.visitorParticipant.seatId ].isOccupied = false;

				Backendless.Messaging.publish( 'default', JSON.stringify( {
					id: this.visitorParticipant.id,
					seatLeft: this.visitorParticipant.seatId,
				} ), { subtopic: "SEAT LEFT" } );

			}

			// Take the target seat
			this.visitorParticipant.seatId = seatId;
			this.garden.seats[ seatId ].isOccupied = true;

			// Run the sitting down animation
			this.visitorParticipant.sitDown( seat );

			// And broadcast to the group that the seat is taken
			Backendless.Messaging.publish( 'default', this.visitorParticipant.toJSON(), { subtopic: "SITTING" } );

		} else {

			console.log( "TODO: Show a SEAT ALREADY TAKEN warning message!" );

		}



	}

	sitParticipant( id, seat ) {

		for ( let i = 0; i < this.participants.length; i ++ ) {

			if ( this.participants[ i ].id == id && this.visitorParticipant.id != id ) {

				this.participants[ i ].sitDown( seat );

			}

		}

	}

	participantIsPresent( id ) {

		for ( let i = 0; i < this.participants.length; i ++ ) {

			if ( this.participants[ i ].id == id ) {

				return true;

			}

		}

		return false;

	}

	resetParticipantTimeToLive( id ) {

		for ( let i = 0; i < this.participants.length; i ++ ) {

			if ( this.participants[ i ].id == id ) {

				this.participants[ i ].timeToLive = TIME_TO_LIVE;

			}

		}

	}

	initialiseVisitorParticipant( hash ) {

		let visitorPosition = new THREE.Vector3(
			( Math.random() - 0.5 ) * SPAWN_DIAMETER, 0,
			( Math.random() - 0.5 ) * SPAWN_DIAMETER );

		this.visitorParticipant = this.generateNewParticipant( null, hash, visitorPosition, false );
		this.visitorParticipant.setRandomParticipantID();

		console.log( this.visitorParticipant.toJSON() );

		Backendless.Messaging.publish( 'default', this.visitorParticipant.toJSON(), { subtopic: "NEW PARTICIPANT" } );

		let hashInDatabase = false;

		for ( let i = 0; i < this.ghostParticipantList.length; i ++ ) {

			if ( this.ghostParticipantList[ i ].hash == hash ) {

				hashInDatabase = true;

			}

		}

		if ( hashInDatabase == false ) {

			this.addParticipantToDatabase( hash );

		}

	}

	generateNewParticipant( id, hash, position, isGhost ) {

		if ( hash == undefined ) {

			hash = "1f73a44ae0239c73a5908960cb408e1a";
			console.log( "HASH NOT DEFINED : ", isGhost );

		}

		hashPosition = 1; //reset so order of model loading doesn't effect how fingerprints display

		//First character determines model type;
		let meshNumber = parseInt( hash.charAt( 0 ), 16 ) % this.modelMeshes.length;

		let mesh = SkeletonUtils.clone( this.modelMeshes[ meshNumber ] );
		//To duplicate a mesh with bones you can't just .clone() - remember Skeleton!
		//https://discourse.threejs.org/t/loading-a-gltf-model-twice-inside-the-loader-load/8373/2

		mesh.traverse( function ( child ) {

			if ( child.isMesh ) {

				//let hashPosition = child.id % 32;
				//This assumes that each mesh has a unique id that when modded doesn't equal another mesh id
				//Not a perfect solution, as the order in which models are loaded effects model display
				//Create a custom traverse function? //Use material name! //Just use a global variable.

				function generateHashValue() {

					let value = parseInt( hash.charAt( hashPosition ), 16 );
					hashPosition = ( hashPosition + 1 ) % 32;
					return value / 16;

				}

				if ( isGhost == false ) {

					child.castShadow = true;
					child.receiveShadow = true;

				}

				child.material = child.material.clone();
				//Materials are global, so create new materials instead of updating referenced materials.

				child.material.type = "MeshStandardMaterial";

				child.material.flatShading = true;
				child.material.needsUpdate = true;

				child.material.metalness = generateHashValue();
				child.material.roughness = generateHashValue();
				child.material.color = {
					r: generateHashValue(),
					g: generateHashValue(),
					b: generateHashValue() };

				if ( isGhost ) {

					child.material.transparent = true;
					child.material.opacity = 0.0;

					new TWEEN.Tween( child.material )
						.to( { opacity: 0.5 }, GHOST_FADE_IN )
						.easing( TWEEN.Easing.Quadratic.InOut )
						.start();

				}

			}

		} );

		mesh.scale.set( 0.5, 0.5, 0.5 );
		this.scene.add( mesh );

		if ( isGhost ) {

			let ghost = new Ghost( id, hash, mesh, this.modelAnimations );
			this.ghosts.push( ghost );

		} else {

			let participant = new Participant( id, hash, mesh, position, TIME_TO_LIVE, this.modelAnimations );
			this.participants.push( participant );

			return participant; //solely used for returning the site visitor's participant

		}

	}

}
