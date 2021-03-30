import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SkeletonUtils } from 'three/examples/jsm/utils/SkeletonUtils.js';
import TWEEN from '@tweenjs/tween.js';
import Backendless from 'backendless'; //requires --polyfill-node to run with SnowPack, see package.json

const API_HOST = 'https://eu-api.backendless.com';
const APP_ID = '45B6BB81-7AE1-BDD6-FF2B-68D2D53BF500';
const API_KEY = 'C754572D-9FFC-4A9F-9E2B-01D66026EDC1';

const TIME_TO_LIVE = 1000; //1000 milliseconds = 1 second
const SPAWN_DIAMETER = 10;
const GHOST_FADE_IN = 4000;
const GHOST_FADE_OUT = 2000;
const DEBUG_MODE = true;

const LENGTH_OF_RANDOM_PARTICIPANT_ID = 16;

let hashPosition = 1; //global for recursive mesh traverse


class Participant {

	constructor( id, hash, mesh, timeToLive, modelAnimations ) {

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
		this.position = new THREE.Vector3(
			( Math.random() - 0.5 ) * SPAWN_DIAMETER, 0,
			( Math.random() - 0.5 ) * SPAWN_DIAMETER );

		this.model.rotateY( this.rotation );
		this.model.position.set( this.position.x, this.position.y, this.position.z );

	}

	toJSON() {

		return JSON.stringify( {

			id: this.id,
			hash: this.hash,
			timeToLive: this.timeToLive,

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

		//This is janky but good enough for turing about
		const originalYRotation = this.model.rotation.y;
		this.model.lookAt( position );
		const newYRotation = this.model.rotation.y;
		this.model.rotation.y = originalYRotation;

		const distanceToTravel = position.distanceTo( this.position );
		const timeToTravel = distanceToTravel * 1000 * 0.5; //2m per second

		if ( this.moving === false ) {

			this.moving = true;

			new TWEEN.Tween( this.model.rotation )
				.to( { y: newYRotation }, 1000 )
				.easing( TWEEN.Easing.Quadratic.InOut )
				.onComplete( () => {

					//this.model.lookAt( position );

					this.fadeToAnimationClip( this.modelAnimations[ 0 ][ 5 ], 0.5 ); //Walking

					new TWEEN.Tween( this.model.position )
						.to( { x: position.x, y: position.y, z: position.z }, timeToTravel )
						.easing( TWEEN.Easing.Linear.None ) //other easings don't make sense on longer walks
						.onComplete( () => {

							this.fadeToAnimationClip( this.modelAnimations[ 0 ][ 0 ], 0.5 ); //Idle
							this.moving = false; //could have another 0.5 wait here for the fade
							this.position = position;

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

export class Manager {

	constructor( scene ) {

		this.visitorParticipant;

		this.participants = [];
		this.ghosts = [];
		this.loadedModels = false;
		this.loadedGhosts = false;
		this.ghostParticipantList = [];
		this.scene = scene;

		// Models from http://quaternius.com/
		this.modelURLs = [ 'models/Male_Suit.glb', 'models/Female_Casual.glb' ];
		this.modelPositions = [
			{ x: - 2, z: 0 }, { x: 2, z: 0 },
			{ x: 0, z: - 2 }, { x: 0, z: 2 } ];

		this.modelMeshes = [];
		this.modelAnimations = [];
		this.loader = new GLTFLoader();

		Backendless.serverURL = API_HOST;
		Backendless.initApp( APP_ID, API_KEY );

		this.BackendlessGhostDatabase = Backendless.Data.of( 'ghostParticipants' );

	}

	async loadAllModels() {

		//This can be improved with promise.all somehow...
		for ( let i = 0; i < this.modelURLs.length; i ++ ) {

			let model = await this.loadModel( this.modelURLs[ i ] );
			this.modelMeshes.push( model.scene );
			this.modelAnimations.push( model.animations );

		}

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

	initialiseSocketMessages() {

		const channel = Backendless.Messaging.subscribe( 'default' );
		channel.addMessageListener( ( messageData ) => {

			let participantObject = JSON.parse( messageData.message );

			if ( messageData.subtopic == "NEW PARTICIPANT" ) {

				if ( this.visitorParticipant.id != participantObject.id ) {

					this.generateNewParticipant( participantObject.id, participantObject.hash, false );

				}

			}

			if ( messageData.subtopic == "PRESENT" ) {

				if ( this.participantIsPresent( participantObject.id ) ) {

					this.resetParticipantTimeToLive( participantObject.id );

				} else {

					this.generateNewParticipant( participantObject.id, participantObject.hash, false );

				}

			}

		} );

		setInterval( () => {

			//console.log(JSON.stringify(this.visitorParticipant));
			Backendless.Messaging.publish( 'default', this.visitorParticipant.toJSON(), { subtopic: "PRESENT" } );

		}, 800 );

	}

	loadGhostsFromDatabase() {

		this.BackendlessGhostDatabase.find( Backendless.DataQueryBuilder.create().setPageSize( 100 ).setSortBy( 'created' ) )
			.then( result => {

				this.ghostParticipantList = result;
				this.loadedGhosts = true;

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

		this.generateNewParticipant(
			this.ghostParticipantList[ ghostNumber ].objectID,
			this.ghostParticipantList[ ghostNumber ].hash,
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

		this.visitorParticipant = this.generateNewParticipant( null, hash, false );
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

	generateNewParticipant( id, hash, isGhost ) {

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

			let participant = new Participant( id, hash, mesh, TIME_TO_LIVE, this.modelAnimations );
			this.participants.push( participant );

			return participant; //solely used for returning the site visitor's participant

		}

	}

}


