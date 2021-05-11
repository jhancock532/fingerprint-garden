/*
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

    campfireMixer = new THREE.AnimationMixer( gltf.scene );
		var action = campfireMixer.clipAction( gltf.animations[ 0 ] );
		action.play();

	},
	function ( xhr ) {
    console.log( ( xhr.loaded / xhr.total * 100 ) + '% loaded' );
	},
	function ( error ) {
		console.log( 'An error happened' );
	}
); */

/* //Before the advent of participant.js
const loader = new GLTFLoader();

let humanMixer;
loader.load( 'models/Male_Suit.glb',
  //From animated Male Characters by http://quaternius.com/?i=1

	function ( gltf ) {
    gltf.scene.position.set(3,0,3);
    gltf.scene.scale.set(0.4,0.4,0.4);
    gltf.scene.rotateY(0.5);
		scene.add( gltf.scene );

    gltf.scene.traverse( function ( child ) {
      if ( child.isMesh ) {
        child.castShadow = true;
        child.receiveShadow = true;

        child.material.type = "MeshStandardMaterial";
        child.material.metalness = Math.random();
        child.material.roughness = Math.random();

        //child.material.transparent = true;
        //child.material.opacity = 0.2;

        child.material.color = {r: Math.random(), g: Math.random(), b: Math.random()};
      }
    });

    humanMixer = new THREE.AnimationMixer( gltf.scene );
		var action = humanMixer.clipAction( gltf.animations[ 0 ] );
		action.play();

	},
	function ( xhr ) {
    //Loading progress event.
    console.log( ( xhr.loaded / xhr.total * 100 ) + '% male suit model loaded.' );
	},
	function ( error ) {
		console.log( 'An error happened' );
	}
);
*/


/* Server code wasn't fun */
/*
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

document.getElementById("removeParticipantButton").addEventListener("click", function(event){
  removeThisParticipantFromDatabase();
})


*/

//Mozilla says it is typically better to use this

/*
window.addEventListener("beforeunload", function(event) {
  window.localStorage.setItem("refreshed", "false");
  removeThisParticipantFromDatabase();
});
*/

//... over this. I don't know why though. Research?
// window.onbeforeunload = function(event) { ... };

//participantManager.generateNewParticipant("05908960cb408e1af73a44ae0239c73a", false);
//participantManager.generateNewParticipant("0eee33ee3ee3e3e33e3e3e3eee3e3e33", false);
//participantManager.generateNewParticipant("1cee3ffffffffffffffffffeee3e3e33", false);


/*
    new TWEEN.Tween(camera.position)
    .to({

    }, 1000)
    .easing(TWEEN.Easing.Quadratic.InOut)
    .onComplete(() => {
      console.log("Tweened!")

      new TWEEN.Tween(time)
      .to({t: 1}, 1000)
      .onUpdate(() => {
          THREE.Quaternion.slerp(startQuaternion, endQuaternion, camera.quaternion, time.t);
      })
      .easing(TWEEN.Easing.Quadratic.InOut).onComplete(() => {
        exhibitItemOverlay.style.opacity = "100%";
      })
      .start();
    }).start();
    */

/* Backendless API */

/*
const API_HOST = 'https://eu-api.backendless.com';
const APP_ID = '45B6BB81-7AE1-BDD6-FF2B-68D2D53BF500';
const API_KEY = 'C754572D-9FFC-4A9F-9E2B-01D66026EDC1';

Backendless.serverURL = API_HOST;
Backendless.initApp(APP_ID, API_KEY);

const channel = Backendless.Messaging.subscribe('default');

const onMessage = message => {
  //console.log(message.message);
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
}, 800),

channel.addMessageListener(onMessage);
*/

/*
function makeRandomParticipantID(length) {
  let result = '';
  const characters  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}*/

/*
	movePosition( position ) {

		//console.log( this.model );

		//		let action = animationMixer.clipAction( this.modelAnimations[ 0 ][ 0 ] );
		// action.play();

		// "The first parameter can be either an AnimationClip object or the name of an AnimationClip."
		// https://threejs.org/docs/#api/en/animation/AnimationMixer.existingAction

		//Man_Idle
		//Man_Walk
		//console.log( this.mixer );

		//this.mixer.existingAction( this.modelAnimations[ 0 ][ 0 ] ).stop();

		//this.mixer.existingAction( this.modelAnimations[ 0 ][ 5 ] ).play();


		this.fadeToAnimationClip( this.modelAnimations[ 0 ][ 5 ] ); //Walking


		//this.mixer.existingAction( this.modelAnimations[ 0 ][ 0 ] ).crossFadeTo( this.mixer.existingAction( this.modelAnimations[ 0 ][ 5 ] ), 500, true );

		//this.mixer.stopAllAction();
		//walkingAction.play();


		new TWEEN.Tween( this.model.position )
			.to( { x: position.x, y: position.y, z: position.z }, 3000 )
			.easing( TWEEN.Easing.Quadratic.InOut )
			.onComplete( () => {

				this.fadeToAnimationClip( this.modelAnimations[ 0 ][ 0 ] ); //Idle

				//this.mixer.stopAllAction();
				//this.mixer.existingAction( this.modelAnimations[ 0 ][ 5 ] ).stop();
				//this.mixer.existingAction( this.modelAnimations[ 0 ][ 0 ] ).play();
				//walkingAction.crossFadeTo( passiveAction, 500, true );

			} )
			.start();

		/*
		new TWEEN.Tween( object.position )
			.to({ x: target.position.x, y: target.position.y, z: target.position.z }, 3000 )
					.onUpdate( function () {

							positions[ index++ ] = this._valuesEnd.x;
							positions[ index++ ] = this._valuesEnd.y;
							positions[ index++ ] = this._valuesEnd.z;

							currentMesh.geometry.attributes.position.needsUpdate = true;

		}).start();
*/

/*

		//Why do complicated maths when you can just lookAt things?
		//let angleToFace = Math.atan2( this.position.z - position.z, this.position.x - position.x );
		//angleToFace += Math.PI;

*/

/*
YASS RECURSIVE ALGORITHMS YASS

	getValidGrassModelPosition() {

		const position = new THREE.Vector3();

		let size = 14;

		position.x = Math.random() * size * 59 / 100 - ( size * 59 / 100 ) / 2;
		position.y = 0;
		position.z = Math.random() * size - size / 2;

		if ( this.getFingerprintPixelBrightness( ( position.x + size / 2 ) * 59 / size, ( position.z + size / 2 ) * 100 / size ) < 0.5 ) {

			return position;

		} else {

			return this.getValidGrassModelPosition();

		}

	}

  //I stole the below code from the instance mesh example, it's a good introduction! if a bit weird with passing functions around...

  		const randomizeMatrix = function () {

			let position = new THREE.Vector3();
			const rotation = new THREE.Euler();
			const quaternion = new THREE.Quaternion();
			const scale = new THREE.Vector3();

			return ( matrix, that ) => {

				//position.x = Math.random() * 10 - 5;
			  //position.y = 0;
				//position.z = Math.random() * 10 - 5;

				position = that.getValidGrassModelPosition();
				that.grassPositions.push( position );

				rotation.x = 0;
				rotation.y = Math.random() * 2 * Math.PI;
				rotation.z = 0;

				quaternion.setFromEuler( rotation );

				scale.x = scale.y = scale.z = 1 + Math.random() * 1;

				matrix.compose( position, quaternion, scale );

			};

		}();


  addFlowers() {

		let scale = 0;

		let flowerMesh = this.flowerModel.scene.clone();

		flowerMesh.position.set( 0, 0, 0 );

		flowerMesh.scale.set( scale, scale, scale );
		this.scene.add( flowerMesh );

	}
*/
