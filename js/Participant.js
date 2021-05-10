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
const DEBUG_MODE = true;

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
		this.activeAction = this.mixer.clipAction( this.modelAnimations[ 0 ][ 0 ] ); //Man_Idle
		this.mixer.clipAction( this.modelAnimations[ 0 ][ 5 ] ); //Man_Walk
		this.activeAction.play();

		//animationMixer.clipAction( this.modelAnimations[ 0 ][ 5 ] ); //Man_Walk
		this.previousAction;
		this.moving = false;

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

	movePosition( position ) {

		// "The first parameter can be either an AnimationClip object or the name of an AnimationClip."
		// https://threejs.org/docs/#api/en/animation/AnimationMixer.existingAction
		// Sadly I can't get this to work :/

		position = new THREE.Vector3( position.x, position.y, position.z );

		if ( this.moving === false ) {

			this.moving = true;

			//TODO: fix how odd this is
			const originalYRotation = this.model.rotation.y;
			this.model.lookAt( position );
			const newYRotation = this.model.rotation.y;
			this.model.rotation.y = originalYRotation;

			const distanceToTravel = position.distanceTo( this.position );
			const timeToTravel = distanceToTravel * 1000 * 0.5; //2m per second

			this.position = position;
			//do this before animation so the new position gets sent correctly in moveVisitorParticipant()

			new TWEEN.Tween( this.model.rotation )
				.to( { y: newYRotation }, 1000 )
				.easing( TWEEN.Easing.Quadratic.InOut )
				.onComplete( () => {

					this.fadeToAnimationClip( this.modelAnimations[ 0 ][ 5 ], 0.5 ); //Walking

					new TWEEN.Tween( this.model.position )
						.to( { x: position.x, y: position.y, z: position.z }, timeToTravel )
						.easing( TWEEN.Easing.Linear.None ) //other easings don't make sense on longer walks
						.onComplete( () => {

							this.fadeToAnimationClip( this.modelAnimations[ 0 ][ 0 ], 0.5 ); //Idle
							this.moving = false; //could have another 0.5 wait here for the fade

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

		this.flowerModelURL = "models/garden/pressed-flowers.glb";
		this.grassModelURL = "models/garden/GrassQuaternius.glb";
		this.benchModelURL = "models/garden/bench.glb";

		this.loader = new GLTFLoader();

		this.GRASS_LAYOUT = "FINGERPRINT"; //"LABYRINTH"

		this.modelMeshes = [];
		this.flowerModel;
		this.grassModel;
		this.grassInstanceMesh;
		this.scene = scene;

		this.flowerPositions = [];

		this.loadedModels = false;

		this.createGrassCanvasContext();

	}

	createGrassCanvasContext() {

		let imageID = ( this.GRASS_LAYOUT == "FINGERPRINT" ) ? "fingerprint-image" : "labyrinth-image";

		const grassImage = document.getElementById( imageID );
		const grassCanvas = document.createElement( 'canvas' );
		this.grassImageWidth = grassCanvas.width = grassImage.width;
		this.grassImageHeight = grassCanvas.height = grassImage.height;

		//console.log( grassCanvas.width, grassCanvas.height ); //59, 100 for tiny fingerprint, 114 121 for labyrinth print

		this.grassCanvasContext = grassCanvas.getContext( '2d' );
		this.grassCanvasContext.drawImage( grassImage, 0, 0, grassImage.width, grassImage.height );

	}

	getGrassPixelBrightness( x, y ) {

		const pixelData = this.grassCanvasContext.getImageData( x, y, 1, 1 ).data; //[r, g, b, a]

		return ( ( pixelData[ 0 ] + pixelData[ 1 ] + pixelData[ 2 ] ) / 3 ) / 255;
		//https://stackoverflow.com/questions/8751020/how-to-get-a-pixels-x-y-coordinate-color-from-an-image

	}

	addGrassInstances() {

		const matrix = new THREE.Matrix4();

		const grassInstanceMaterial = new THREE.MeshStandardMaterial( { color: 0x44ff00, roughness: 0.6, metalness: 0.1 } );
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

		console.log( grassInstanceCount );

		this.scene.add( this.grassInstanceMesh );

	}

	addBenches() {

		const scale = 3;

		let benchMesh = this.benchModel.scene.clone();

		benchMesh.position.set( 5.8, 0.1, 1 );
		benchMesh.rotation.set( 0, 1.3, 0 );

		benchMesh.scale.set( scale, scale, scale );
		benchMesh.receiveShadow = true;
		benchMesh.castShadow = true;
		this.scene.add( benchMesh );

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

	addFlowers() {

		let scale = 0;

		let flowerMesh = this.flowerModel.scene.clone();

		flowerMesh.position.set( 0, 0, 0 );

		flowerMesh.scale.set( scale, scale, scale );
		this.scene.add( flowerMesh );

	}

	async loadGardenModels() {

		this.flowerModel = await this.loadModel( this.flowerModelURL );
		this.grassModel = await this.loadModel( this.grassModelURL );
		this.benchModel = await this.loadModel( this.benchModelURL );

		this.addGrassInstances();
		this.addBenches();

		this.loadedModels = true;

	}

	loadGrassInstance( x, y ) {

		let scale = 1 + Math.random() * 3;

		let grassTuftMesh = this.grassModel.scene.clone();

		grassTuftMesh.traverse( function ( child ) {

			if ( child.isMesh ) {

				child.castShadow = true;
				child.receiveShadow = true;

				child.material = child.material.clone();

				child.material.type = "MeshStandardMaterial";

				child.material.flatShading = true;
				child.material.needsUpdate = true;

				child.material.metalness = Math.random() * 0.1;
				child.material.roughness = 0.8 + Math.random() * 0.2;
				child.material.color = {
					r: Math.random() * 0.6,
					g: 0.8 + Math.random() * 0.2,
					b: 0 };

			}

		} );

		grassTuftMesh.position.set( x, 0, y );

		grassTuftMesh.scale.set( scale, scale, scale );
		this.scene.add( grassTuftMesh );

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

export class Manager {

	constructor( scene ) {

		this.visitorParticipant;

		this.garden = new Garden( scene );

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

			if ( messageData.subtopic == "NEW PARTICIPANT" ) {

				if ( this.visitorParticipant.id != participantObject.id ) {

					this.generateNewParticipant( participantObject.id, participantObject.hash, participantObject.position, false );

				}

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
					this.moveParticipant( participantObject.id, participantObject.position );

				} else {

					this.generateNewParticipant( participantObject.id, participantObject.hash, participantObject.position, false );

				}

			}

		} );

		setInterval( () => {

			//console.log(JSON.stringify(this.visitorParticipant));
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

		this.visitorParticipant.movePosition( position );

		Backendless.Messaging.publish( 'default', this.visitorParticipant.toJSON(), { subtopic: "MOVED" } );

	}

	moveParticipant( id, position ) {

		for ( let i = 0; i < this.participants.length; i ++ ) {

			if ( this.participants[ i ].id == id && this.visitorParticipant.id != id ) {

				//Important not to move the visitor participant twice, so check with id above.
				this.participants[ i ].movePosition( position );

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




