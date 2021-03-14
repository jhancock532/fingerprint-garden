import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SkeletonUtils } from 'three/examples/jsm/utils/SkeletonUtils.js';

export class Manager {
  constructor(scene) {
    this.participants = [];
    this.loadedModels = false;
    this.scene = scene;

    // Models from http://quaternius.com/?i=1
    this.modelURLs = ['models/Male_Suit.glb', 'models/Female_Casual.glb'];
    this.modelPositions = [ {x: -2, z: 0}, {x: 2, z: 0}, 
                            {x: 0, z: -2}, {x: 0, z: 2}];

    this.modelMeshes = [];
    this.modelAnimations = [];
    this.loader = new GLTFLoader();
  }

  async loadAllModels(){
    for (let i = 0; i < this.modelURLs.length; i++){
      let model = await this.loadModel(this.modelURLs[i]);
      this.modelMeshes.push(model.scene);
      this.modelAnimations.push(model.animations);
    }
    this.loadedModels = true;
  }

  async loadModel( modelURL ){
    return new Promise(resolve => {
      this.loader.load( modelURL ,
        function ( gltf ) {
          resolve( gltf );
        },
        function ( xhr ) {},
        function ( error ) {
          console.error( 'An error happened loading a model: ' , error);
        }
      );
    });
  }

  updateMixers( delta ){
    for (let i = 0; i < this.participants.length; i++){
      if ( this.participants[i].mixer ) this.participants[i].mixer.update( delta );
    }
  }

  generateNewParticipant( hash, isGhost ){
    //1f73a44ae0239c73a5908960cb408e1a
    //Example fingerprint hash

    //First character determines model type;
    let meshNumber = parseInt(hash.charAt(0), 16) % this.modelMeshes.length;

    let mesh = SkeletonUtils.clone( this.modelMeshes[meshNumber] );
    //To duplicate a mesh with bones you can't just .clone() - remember Skeleton!
    //https://discourse.threejs.org/t/loading-a-gltf-model-twice-inside-the-loader-load/8373/2

    mesh.traverse( function ( child ) {
      if ( child.isMesh ) {

        let hashPosition = child.id % 32;
        //This assumes that each mesh has a unique id that when modded doesn't equal another mesh id
        //Not a perfect solution, but it seems to work. id could be added in other stages as well

        function generateHashValue(){
          let value = parseInt(hash.charAt(hashPosition), 16);
          hashPosition = (hashPosition + 1) % 32;
          return value / 16;
        }
  
        child.castShadow = true;
        child.receiveShadow = true;

        child.material = child.material.clone();
        //Materials are global, so create new materials instead of updating referenced materials.

        child.material.type = "MeshStandardMaterial";

        child.material.flatShading = true;
        child.material.needsUpdate = true;

        child.material.metalness = generateHashValue();
        child.material.roughness = generateHashValue();
        child.material.color = {r: generateHashValue(), 
                                g: generateHashValue(), 
                                b: generateHashValue()};

        if ( isGhost ) {
          child.material.transparent = true;
          child.material.opacity = 0.2;
        }
      }

    });

    let meshPositionNumber = parseInt(hash.charAt(1), 16) % this.modelPositions.length;

    mesh.position.set(this.modelPositions[meshPositionNumber].x, 0 , this.modelPositions[meshPositionNumber].z);

    mesh.scale.set(0.5, 0.5, 0.5);

    mesh.rotateY(0.5);

    let animationMixer = new THREE.AnimationMixer( mesh );
    let action = animationMixer.clipAction( this.modelAnimations[0][5] );
    action.play();

    this.participants.push( {model: mesh, mixer: animationMixer} );

    this.scene.add(mesh);
  }
}
