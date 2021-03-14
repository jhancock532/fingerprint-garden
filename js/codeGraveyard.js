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