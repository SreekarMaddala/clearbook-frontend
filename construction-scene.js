import * as THREE from 'three';
import {coinMotionAtProgress} from './construction-motion.mjs';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

// One fixed camera and one fixed set. Scroll controls the workers and one fragment.
export function mountConstructionScene(container,options={}){
 let renderer;
 try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});}catch{return ()=>{};}
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,1,.1,60);
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));renderer.setClearColor(0x000000,0);
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 renderer.domElement.setAttribute('aria-hidden','true');container.append(renderer.domElement);
 camera.position.set(6.5,5.1,10.8);camera.lookAt(0,1.05,0);
 scene.add(new THREE.HemisphereLight(0xe9f6d4,0x1b3029,3.2));
 const key=new THREE.DirectionalLight(0xfff3d4,4.5);key.position.set(-4,8,6);key.castShadow=true;key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-6,right:6,top:6,bottom:-6});key.shadow.bias=-.001;scene.add(key);
 const rim=new THREE.DirectionalLight(0xbde5b2,3.5);rim.position.set(4,5,-5);scene.add(rim);
 const materials=[];
 const mat=(color,roughness=.65,metalness=0)=>{const m=new THREE.MeshStandardMaterial({color,roughness,metalness});materials.push(m);return m;};
 const forest=mat(0x315544,.52),navy=mat(0x203d38,.75),boot=mat(0x162b27,.85),mint=mat(0xc2df9a,.45),skin=mat(0xc38d63,.8),glove=mat(0xe0c18b,.8),ochre=mat(0xe0ac4e,.4),steel=mat(0x687d77,.35,.65),stone=mat(0xa8afa0,.95),edge=mat(0x244638,.7),pale=mat(0xb6c5a6,.9);
 const world=new THREE.Group();scene.add(world);
 function mesh(geometry,material,parent=world){const m=new THREE.Mesh(geometry,material);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
 function box(w,h,d,material,x=0,y=0,z=0,parent=world,r=.07){const m=mesh(new RoundedBoxGeometry(w,h,d,3,r),material,parent);m.position.set(x,y,z);return m;}
 function sphere(radius,material,x,y,z,parent=world){const m=mesh(new THREE.SphereGeometry(radius,24,16),material,parent);m.position.set(x,y,z);return m;}
 function rod(radius,material,parent=world){return mesh(new THREE.CylinderGeometry(radius,radius,1,14),material,parent);}
 const up=new THREE.Vector3(0,1,0),delta=new THREE.Vector3();
 function between(m,a,b){delta.subVectors(b,a);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(up,delta.clone().normalize());m.scale.y=delta.length();}
 const stage=mesh(new THREE.CylinderGeometry(3.45,3.62,.28,80),edge);stage.position.y=-.27;
 const surface=mesh(new THREE.CylinderGeometry(3.4,3.4,.06,80),pale);surface.position.y=-.1;
 const stageRing=mesh(new THREE.TorusGeometry(3.42,.025,8,100),mint);stageRing.rotation.x=Math.PI/2;stageRing.position.y=-.1;
 // Ground details make the miniature read as a construction site.
 for(let i=0;i<3;i++)box(.65,.11,.5,stone,2.15+(i%2)*.62,.02+Math.floor(i/2)*.13,-1.35);
 const coneBase=box(.43,.07,.43,boot,-2.5,-.035,1.15);
 const cone=mesh(new THREE.ConeGeometry(.17,.53,24),ochre);cone.position.set(-2.5,.25,1.15);
 const coneBand=mesh(new THREE.CylinderGeometry(.115,.14,.1,24),mint);coneBand.position.set(-2.5,.19,1.15);
 const rockGeometry=new THREE.IcosahedronGeometry(.98,1);
 const rockPositions=rockGeometry.attributes.position;
 for(let i=0;i<rockPositions.count;i++){
  const x=rockPositions.getX(i),y=rockPositions.getY(i),z=rockPositions.getZ(i),f=.9+.1*Math.sin(x*14+z*9+y*6);
  rockPositions.setXYZ(i,x*f,Math.max(-.58,y*.77*f),z*f);
 }
 rockGeometry.computeVertexNormals();const rockMaterial=mat(0x9b9f92,.96);rockMaterial.flatShading=true;
 const rock=mesh(rockGeometry,rockMaterial);rock.position.set(.05,.49,0);rock.rotation.y=.35;
 const crackMaterial=new THREE.LineBasicMaterial({color:0x5c685b,transparent:true,opacity:0});materials.push(crackMaterial);
 const crack=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.58,1.05,.4),new THREE.Vector3(-.35,.8,.75),new THREE.Vector3(-.47,.55,.85),new THREE.Vector3(-.12,.29,.95)]),crackMaterial);world.add(crack);

 function worker(x,z,shirt,helmet,faceTurn){
  const g=new THREE.Group();g.position.set(x,0,z);world.add(g);
  box(.6,.29,.38,navy,0,.85,0,g);
  for(const side of [-1,1]){
   const leg=mesh(new THREE.CapsuleGeometry(.13,.45,5,12),navy,g);leg.position.set(side*.19,.45,side*.035);
   box(.31,.2,.45,boot,side*.2,.04,.09,g);
  }
  box(.68,.74,.44,shirt,0,1.28,0,g,.12);
  // Two reflective vest strips and a broad waist band.
  for(const side of [-1,1])box(.065,.58,.015,mint,side*.2,1.3,.232,g,.006);
  box(.67,.065,.015,mint,0,1.04,.234,g,.006);
  const neck=mesh(new THREE.CylinderGeometry(.11,.12,.2,16),skin,g);neck.position.y=1.76;
  const head=new THREE.Group();head.position.set(0,2,0);head.rotation.y=faceTurn;g.add(head);
  const face=mesh(new THREE.CapsuleGeometry(.23,.13,6,24),skin,head);
  sphere(.052,skin,0,-.025,.225,head);
  for(const side of [-1,1])sphere(.017,boot,side*.085,.025,.211,head);
  const hardHat=mesh(new THREE.SphereGeometry(.285,32,16,0,Math.PI*2,0,Math.PI/2),helmet,head);hardHat.position.y=.16;
  const brim=mesh(new THREE.CylinderGeometry(.33,.33,.045,40),helmet,head);brim.position.y=.16;
  box(.055,.21,.54,helmet,0,.275,0,head,.025);
  const upper=[rod(.105,shirt),rod(.105,shirt)],lower=[rod(.082,skin),rod(.082,skin)],hands=[sphere(.105,glove,0,0,0),sphere(.105,glove,0,0,0)];
  const shoulders=[new THREE.Vector3(x-.37,1.57,z),new THREE.Vector3(x+.37,1.57,z)];
  function pose(targets){for(let i=0;i<2;i++){const elbow=shoulders[i].clone().lerp(targets[i],.52);elbow.z+=.23;elbow.y-=.16;between(upper[i],shoulders[i],elbow);between(lower[i],elbow,targets[i]);hands[i].position.copy(targets[i]);}}
  return {g,head,pose};
 }
 const left=worker(-1.85,.23,forest,ochre,.32);
 const right=worker(1.75,-.03,ochre,mint,-.45);
 const hammer=new THREE.Group();hammer.position.set(-1.17,1.65,.38);world.add(hammer);
 const handle=mesh(new THREE.CylinderGeometry(.045,.055,1.65,16),forest,hammer);
 box(.66,.25,.31,steel,0,.85,0,hammer,.04);
 box(.21,.29,.33,edge,-.29,.85,0,hammer,.035);
 const chisel=rod(.038,steel);const chiselTop=new THREE.Vector3(.94,1.34,.16),chiselBottom=new THREE.Vector3(.62,.76,.12);between(chisel,chiselBottom,chiselTop);
 const smallHammer=new THREE.Group();world.add(smallHammer);const smallHandle=mesh(new THREE.CylinderGeometry(.028,.035,.55,12),forest,smallHammer);box(.34,.15,.17,steel,0,.31,0,smallHammer,.025);

 // Matched vertices: rough stone fragment to a genuinely round coin, not a swap.
 const fragmentGeometry=new THREE.CylinderGeometry(.61,.61,.145,64,1).toNonIndexed();fragmentGeometry.rotateX(Math.PI/2);
 const target=Float32Array.from(fragmentGeometry.attributes.position.array),source=new Float32Array(target.length);
 for(let i=0;i<target.length;i+=3){const x=target[i]/.61,y=target[i+1]/.61,z=target[i+2]/.0725,rough=.92+.08*Math.sin(Math.atan2(y,x)*5);source[i]=x*.32*rough;source[i+1]=y*.29*rough;source[i+2]=z*.22;}
 const fragmentMaterial=new THREE.MeshStandardMaterial({color:0x9b9f92,roughness:.95,metalness:0,flatShading:true});materials.push(fragmentMaterial);
 const fragmentGroup=new THREE.Group();world.add(fragmentGroup);
 const fragment=mesh(fragmentGeometry,fragmentMaterial,fragmentGroup);
 const coinCanvas=document.createElement('canvas');coinCanvas.width=256;coinCanvas.height=256;const ctx=coinCanvas.getContext('2d');ctx.clearRect(0,0,256,256);ctx.fillStyle='#5d4825';ctx.font='bold 172px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('\u20b9',128,138);
 const coinTexture=new THREE.CanvasTexture(coinCanvas);coinTexture.colorSpace=THREE.SRGBColorSpace;
 const symbolMaterial=new THREE.MeshStandardMaterial({map:coinTexture,transparent:true,opacity:0,roughness:.4,depthWrite:false});materials.push(symbolMaterial);
 const symbol=mesh(new THREE.PlaneGeometry(.84,.84),symbolMaterial,fragmentGroup);symbol.position.z=.078;symbol.castShadow=false;
 const backSymbol=mesh(symbol.geometry,symbolMaterial,fragmentGroup);backSymbol.position.z=-.078;backSymbol.rotation.y=Math.PI;backSymbol.castShadow=false;
 const rimMaterial=mat(0xd5dda7,.28,.8);rimMaterial.transparent=true;rimMaterial.opacity=0;
 const coinRim=mesh(new THREE.TorusGeometry(.55,.018,8,80),rimMaterial,fragmentGroup);coinRim.position.z=.08;
 const backRim=mesh(coinRim.geometry,rimMaterial,fragmentGroup);backRim.position.z=-.08;
 const stoneColor=new THREE.Color(0x9b9f92),coinColor=new THREE.Color(0xe8c976);
 // A light trail follows the falling coin; two expanding rings mark its landing.
 const trailMaterial=new THREE.MeshBasicMaterial({color:0xf4d88b,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});materials.push(trailMaterial);
 const trail=Array.from({length:9},(_,i)=>{const m=mesh(new THREE.SphereGeometry(.028+i*.004,10,8),trailMaterial);m.castShadow=false;m.receiveShadow=false;return m;});
 const landing=new THREE.Vector3(.5,.57,2.05);
 const impactRings=Array.from({length:2},()=>{const m=mat(0xf4d58a,.4,.25);m.transparent=true;m.opacity=0;m.depthWrite=false;const ring=mesh(new THREE.TorusGeometry(.48,.014,8,64),m);ring.rotation.x=-Math.PI/2;ring.position.set(landing.x,-.052,landing.z);ring.castShadow=false;ring.receiveShadow=false;return ring;});
 const sparkMaterial=new THREE.MeshBasicMaterial({color:0xffe7a8,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});materials.push(sparkMaterial);
 const sparks=Array.from({length:18},()=>{const m=mesh(new THREE.OctahedronGeometry(.025),sparkMaterial);m.castShadow=false;return m;});
 const glintMaterial=new THREE.MeshBasicMaterial({color:0xfff7d4,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});materials.push(glintMaterial);
 const glint=new THREE.Group();fragmentGroup.add(glint);glint.position.set(.28,.26,.088);
 const glintA=mesh(new THREE.PlaneGeometry(.025,.25),glintMaterial,glint),glintB=mesh(new THREE.PlaneGeometry(.18,.025),glintMaterial,glint);glintA.castShadow=glintB.castShadow=false;

 const dustMaterial=new THREE.MeshStandardMaterial({color:0xc5cab6,transparent:true,opacity:0,roughness:1,depthWrite:false});materials.push(dustMaterial);
 const dust=Array.from({length:16},(_,i)=>{const m=mesh(new THREE.IcosahedronGeometry(.025+(i%3)*.012,0),dustMaterial);m.castShadow=false;return m;});
 const floor=mesh(new THREE.PlaneGeometry(100,100),new THREE.ShadowMaterial({opacity:.2}));floor.rotation.x=-Math.PI/2;floor.position.y=-.44;floor.castShadow=false;
 const chapter=container.closest('.lp-construction-chapter'),motion=matchMedia('(prefers-reduced-motion: reduce)');
 const clamp=n=>THREE.MathUtils.clamp(n,0,1),smooth=(a,b,p)=>THREE.MathUtils.smoothstep(p,a,b);
 let wanted=0,current=0,frame=0,visible=true,disposed=false;
 const hit=new THREE.Vector3(-.58,1.03,.41);
 function coinPosition(p,out){const pose=coinMotionAtProgress(p);return out.set(pose.x,pose.y,pose.z);}
 const trailPosition=new THREE.Vector3();
 function scroll(){if(options.pose!==undefined){wanted=options.pose;renderPose(wanted);return;}if(!chapter){wanted=0;return;}const r=chapter.getBoundingClientRect();wanted=clamp(-r.top/Math.max(1,chapter.offsetHeight-innerHeight));if(motion.matches)renderPose(1);else request();}
 function renderPose(p){
  const strike=smooth(.14,.31,p),recovery=smooth(.44,.6,p),angle=THREE.MathUtils.lerp(-.48,-2.35,strike)+recovery*.42;
  hammer.rotation.z=angle;hammer.updateMatrixWorld(true);
  left.pose([hammer.localToWorld(new THREE.Vector3(0,-.42,.04)),hammer.localToWorld(new THREE.Vector3(0,.08,.04))]);
  const tap=p<.4?Math.sin(p*Math.PI*8)*.07:0;
  smallHammer.position.set(1.25,1.4,.24);smallHammer.rotation.z=-1.25+tap;
  right.pose([new THREE.Vector3(.96,1.2,.18),new THREE.Vector3(1.23,1.47,.28)]);
  left.head.rotation.z=-strike*.045;right.head.rotation.z=.05;
  crackMaterial.opacity=smooth(.29,.33,p)*.75;
  const pose=coinMotionAtProgress(p),morph=pose.morph,drop=pose.spin;
  fragmentGroup.visible=p>.315||motion.matches;
  coinPosition(p,fragmentGroup.position);
  fragmentGroup.rotation.set(.15*(1-morph),THREE.MathUtils.lerp(-1.2,.54,morph)+Math.sin(morph*Math.PI)*2.1+drop*Math.PI*2,.3*(1-morph)+Math.sin(drop*Math.PI)*.22);
  const positions=fragmentGeometry.attributes.position;
  for(let i=0;i<target.length;i++)positions.array[i]=THREE.MathUtils.lerp(source[i],target[i],morph);
  positions.needsUpdate=true;fragmentGeometry.computeVertexNormals();
  fragmentMaterial.color.copy(stoneColor).lerp(coinColor,morph);fragmentMaterial.metalness=morph*.82;fragmentMaterial.roughness=THREE.MathUtils.lerp(.95,.29,morph);
  symbolMaterial.opacity=smooth(.58,.66,p);rimMaterial.opacity=smooth(.56,.65,p);
  trailMaterial.opacity=motion.matches?0:Math.sin(clamp((p-.67)/.21)*Math.PI)*.5;
  trail.forEach((m,i)=>{coinPosition(Math.max(.67,p-(i+1)*.007),trailPosition);m.position.copy(trailPosition);m.scale.setScalar(1-i*.07);});
  const impact=clamp((p-.875)/.125);
  impactRings.forEach((ring,i)=>{const t=clamp((impact-i*.18)/(1-i*.18));ring.scale.setScalar(.6+t*(1.4+i*.4));ring.material.opacity=motion.matches?0:Math.sin(t*Math.PI)*.65;});
  sparkMaterial.opacity=motion.matches?0:Math.sin(impact*Math.PI)*.9;
  sparks.forEach((m,i)=>{const a=i*2.399,r=impact*(.6+(i%4)*.13);m.position.set(landing.x+Math.cos(a)*r,landing.y-.45+Math.sin(impact*Math.PI)*(.25+(i%3)*.15),landing.z+Math.sin(a)*r);m.scale.setScalar(1-impact*.75);});
  glintMaterial.opacity=motion.matches?0:Math.max(Math.sin(clamp((p-.62)/.07)*Math.PI),Math.sin(impact*Math.PI))*.8;
  glint.rotation.z=p*2;
  const burst=clamp((p-.31)/.18);dustMaterial.opacity=p>.31&&p<.49?Math.sin(burst*Math.PI)*.6:0;
  dust.forEach((m,i)=>{const a=i*2.399;m.position.set(hit.x+Math.cos(a)*burst*(.35+i*.018),hit.y+burst*(.75-(i%4)*.13)-burst*burst*.65,hit.z+Math.sin(a)*burst*.6);m.scale.setScalar(1-burst*.6);});
  renderer.render(scene,camera);
 }
 function animate(){frame=0;if(disposed||!visible||document.hidden)return;current+=(wanted-current)*.15;if(Math.abs(wanted-current)<.0002)current=wanted;renderPose(current);if(Math.abs(wanted-current)>.0002)frame=requestAnimationFrame(animate);}
 function request(){if(options.pose!==undefined){renderPose(options.pose);return;}if(!frame&&visible&&!document.hidden&&!disposed){if(motion.matches){renderPose(1);return;}frame=requestAnimationFrame(animate);}}
 function resize(){const r=container.getBoundingClientRect();if(!r.width||!r.height)return;renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();renderPose(options.pose??(motion.matches?1:current));}
 function preference(){scroll();resize();}
 const sizeObserver=new ResizeObserver(resize);sizeObserver.observe(container);
 const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;request();});intersection.observe(container);
 window.addEventListener('scroll',scroll,{passive:true});document.addEventListener('visibilitychange',request);motion.addEventListener('change',preference);
 scroll();resize();
 return ()=>{disposed=true;cancelAnimationFrame(frame);sizeObserver.disconnect();intersection.disconnect();window.removeEventListener('scroll',scroll);document.removeEventListener('visibilitychange',request);motion.removeEventListener('change',preference);scene.traverse(o=>o.geometry?.dispose());for(const m of new Set(materials))m.dispose();floor.material.dispose();coinTexture.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();};
}
