## Fingerprint Garden

Run this project with `npm start`.

### Device Specific Bugs!
- Doesn't load on Google Pixel 5 (two reports)
- Doesn't load on Daniels's PC (Windows computer, none of the browsers work...) (one report)
- The flowers can't be clicked when using the Brave browser? According to Sam (one report)
- Doesn't load on Sue's Mac when she uses Chrome (but on Safari it works fine) (one report)

Sorry for the limited testing capability - this is a time limited project and I have limited access to other people's devices during a pandemic.

## Code Highlights!

#### Canvas Resizing Best Practices
This is the best resizing code I've found for fullscreen Three.js canvas.

```js
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
```

Then chuck this in the animation loop:

```js
if ( resizeRendererToDisplaySize( renderer ) ) {

  const canvas = renderer.domElement;
  camera.aspect = canvas.clientWidth / canvas.clientHeight;
  camera.updateProjectionMatrix();

}
```

#### The "You should learn React" realisation

I didn't realise how much I wanted JS to interact with the DOM until it was too late to turn back.
Hence, these decelerations near the top of `script.js`:

```js
const loadingSplashElement = document.getElementById( "loading-splash" );
const aboutButtonElement = document.getElementById( "about-button" );
const aboutInformationElement = document.getElementById( "about-information" );
const informationOverlayElement = document.getElementById( "information-overlay" );
const goBackGradientElement = document.getElementById( "go-back-gradient" );

const sideWindow = document.getElementById( "side-window" );
const sideWindowTitle = document.getElementById( "side-window-title" );
const sideWindowHash = document.getElementById( "side-window-hash" );
const sideWindowStatus = document.getElementById( "side-window-status" );
const sideWindowDate = document.getElementById( "side-window-date" );
const sideWindowLastConnected = document.getElementById( "side-window-last-connected" );
const sideWindowToggleButton = document.getElementById( "side-window-toggle-button" );
```

Then, when I need to update the DOM, you see a lot of code like this...

```js
if ( connectionStatus == "LIVE" ) {

  sideWindowStatus.innerText = "LIVE CONNECTION";
  sideWindowStatus.classList.add( "live-dot" );
  sideWindowTitle.innerText = "NETWORKED PARTICIPANT";
  sideWindowDate.innerText = "";
  sideWindowLastConnected.style.display = "none";

  if ( sceneManager.visitorParticipant.hash == hash ) {

    sideWindowTitle.innerText = "YOUR FINGERPRINT";

  }

} else {

  sideWindowTitle.innerText = "PREVIOUS PARTICIPANT";
  sideWindowLastConnected.style.display = "block";

  sideWindowStatus.innerText = "OFFLINE GHOST";
  sideWindowStatus.classList.remove( "live-dot" );

  const connectionDate = new Date( connectionStatus );
  const dateOutput = getDateString( connectionDate );
  const timeOutput = getTimeString( connectionDate );

  sideWindowLastConnected.style.display = "block";
  sideWindowDate.innerHTML = dateOutput + "<br>" + timeOutput;

}
```

At least it does what I want it to! I like the atomic, squential control of elements, but it's not a great idea at scale. The paragraphs of updates start getting out of hand.

#### JavaScript Classes are great!

So much so I dedicated 1568 lines of code to them in my Fingerprint.js file, which is a mini game engine at this point.

```js
class Participant { ... }
class Ghost { ... }
class Garden { ... }
class CameraTower { ... }
class Seat { ... }
class ObserverCamera { ... }
class ItemViewCamera { ... }
class Manager { ... }
```
The Manager calls all the shots, the rest of the classes are my way of reducing this projects scale into brain sized pieces.

Not a huge fan of the class names, some idiosyncrasies are creeping in here...

#### Spooky Scary Duplicating Model Bugs

A nice little ditty for future reference.

```js
let mesh = SkeletonUtils.clone( this.modelMeshes[ meshNumber ] );
//To duplicate a mesh with bones you can't just .clone() - remember Skeleton!
//https://discourse.threejs.org/t/loading-a-gltf-model-twice-inside-the-loader-load/8373/2
```

#### Multiple Canvas Elements in Three.js aren't Performant

So take a single render snapshot instead of rendering to two canvases continuously.
Added in ItemViewCamera.

```js
	/*
	A nice little note from Mugen87 on solving multiple canvases with one renderer
	https://discourse.threejs.org/t/multiple-renderer-vs-multiple-canvas/3085/2
	*/
  
 	snapshot() {

		this.renderer.setSize( this.rtWidth, this.rtHeight, false );
		this.renderer.render( this.scene, this.camera );
		this.canvasContext.drawImage( this.renderer.domElement, 0, 0, this.rtWidth, this.rtHeight );

	}
```

#### Finally, the model animation system...

As found in Participant. I am quite proud of this because it took a fair bit of trial, error and documentation combing, but the end result was just a few lines of code.

```js
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
```

Very smooth. I love it. On the other hand, getting my characters to move about and turn around was a bit more complicated.
Tween.js to the rescue! Also, quaternions. I love the quaternions used here, also the `halt` hack to pause the sitting animation.

```js
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
```

Having `this.moving` and `this.sitting` in the same class is wild, I know.

The `movePosition( position, onFinish )` function is another great example of Tween.js, quaternions and lots of nested callbacks. Using the anonymous function `() => {}` within each callback gave me access to all the contents of the parent function, super useful!

