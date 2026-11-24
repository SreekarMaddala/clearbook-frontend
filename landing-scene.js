import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

export function mountScene(container){
 let renderer;
 try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});}catch{return ()=>{};}
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(33,1,.1,70);
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));
 renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.4;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 renderer.domElement.setAttribute('aria-hidden','true');container.append(renderer.domElement);
 camera.position.set(7,5.7,10);camera.lookAt(0,.3,0);
 scene.add(new THREE.HemisphereLight(0xe5ffce,0x162f26,3));
 const key=new THREE.DirectionalLight(0xfff7df,5);key.position.set(-3,8,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-6;key.shadow.camera.right=6;key.shadow.camera.top=6;key.shadow.camera.bottom=-6;key.shadow.bias=-.001;scene.add(key);
 const rim=new THREE.DirectionalLight(0xc5fca5,5);rim.position.set(5,3,-4);scene.add(rim);
 const fill=new THREE.PointLight(0xe9fbcf,45,20);fill.position.set(-4,1,4);scene.add(fill);
 const sculpture=new THREE.Group();sculpture.rotation.y=-.15;sculpture.rotation.z=-.13;scene.add(sculpture);
 const mint=new THREE.MeshPhysicalMaterial({color:0xc9eda8,roughness:.28,metalness:.2,clearcoat:.8,clearcoatRoughness:.18});
 const forest=new THREE.MeshPhysicalMaterial({color:0x254d35,roughness:.3,metalness:.35,clearcoat:1});
 const dark=new THREE.MeshStandardMaterial({color:0x153c2d,roughness:.35,metalness:.3});
 const cream=new THREE.MeshPhysicalMaterial({color:0xf1f3d6,roughness:.2,metalness:.35,clearcoat:.8});
 const silver=new THREE.MeshStandardMaterial({color:0xc0cca0,roughness:.23,metalness:.82});
 const glass=new THREE.MeshPhysicalMaterial({color:0x9dd487,roughness:.08,metalness:.1,transparent:true,opacity:.72,clearcoat:1,side:THREE.DoubleSide});
 function box(w,h,d,material,x,y,z,r=.13){const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,3,r),material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;sculpture.add(mesh);return mesh;}
 // Sculpted ledger stack, with separate metallic page edges.
 box(3.5,.44,2.7,forest,0,-.82,0);
 box(3.25,.1,2.53,silver,.02,-.53,0,.04);
 box(3.45,.38,2.66,mint,0,-.28,0);
 box(3.2,.08,2.45,cream,.03,-.045,0,.03);
 const top=box(3.5,.31,2.7,forest,0,.17,0);
 const ledgerLayers=sculpture.children.map(mesh=>({mesh,y:mesh.position.y}));
 for(let i=0;i<6;i++)box(2.6,.012,.015,new THREE.MeshStandardMaterial({color:0x72935e,roughness:.6}),0,-.5+i*.047,1.278,.005);
 // A small account label is a local procedural texture, with no remote imagery.
 const label=document.createElement('canvas');label.width=1024;label.height=640;
 const ctx=label.getContext('2d');ctx.fillStyle='#224a32';ctx.fillRect(0,0,1024,640);
 ctx.fillStyle='#c6ecac';ctx.font='bold 64px Arial';ctx.fillText('clearbook.',68,108);
 ctx.fillStyle='#97b783';ctx.font='22px Arial';ctx.fillText('A CLEARER PERSPECTIVE',70,155);
 ctx.strokeStyle='#69885a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(70,200);ctx.lineTo(950,200);ctx.stroke();
 ctx.fillStyle='#a9c994';ctx.font='20px Arial';ctx.fillText('EVERY PAYMENT. ONE PICTURE.',70,580);
 const labelTexture=new THREE.CanvasTexture(label);labelTexture.colorSpace=THREE.SRGBColorSpace;
 const labelPlane=new THREE.Mesh(new THREE.PlaneGeometry(3.18,2.38),new THREE.MeshStandardMaterial({map:labelTexture,roughness:.65}));labelPlane.rotation.x=-Math.PI/2;labelPlane.position.set(0,.332,0);sculpture.add(labelPlane);
 // Physical columns rise out of the ledger and catch the soft rim light.
 const bars=[];
 [0.65,1.07,1.55,2.02].forEach((h,i)=>{const m=box(.43,h,.48,i===3?mint:i===2?glass:cream,-1.12+i*.64,.36+h/2,-.25);bars.push({mesh:m,height:h});});
 // Brushed coins, rim detail and an embossed rupee symbol.
 const coinTexture=document.createElement('canvas');coinTexture.width=256;coinTexture.height=256;const coinCtx=coinTexture.getContext('2d');coinCtx.clearRect(0,0,256,256);coinCtx.fillStyle='#6c7e45';coinCtx.font='bold 160px Arial';coinCtx.textAlign='center';coinCtx.textBaseline='middle';coinCtx.fillText('₹',128,137);
 const texture=new THREE.CanvasTexture(coinTexture);texture.colorSpace=THREE.SRGBColorSpace;
 function coin(x,y,z,scale,rotation){const g=new THREE.Group();const body=new THREE.Mesh(new THREE.CylinderGeometry(.7,.7,.17,72),silver);body.rotation.x=Math.PI/2;body.castShadow=true;g.add(body);const edge=new THREE.Mesh(new THREE.TorusGeometry(.62,.035,12,70),cream);edge.position.z=.095;g.add(edge);const face=new THREE.Mesh(new THREE.PlaneGeometry(.83,.83),new THREE.MeshStandardMaterial({map:texture,transparent:true,roughness:.5}));face.position.z=.1;g.add(face);g.position.set(x,y,z);g.rotation.set(rotation[0],rotation[1],rotation[2]);g.scale.setScalar(scale);sculpture.add(g);return g;}
 const coinA=coin(2.1,.55,1.4,1.03,[-.22,-.35,-.35]);
 const coinB=coin(-1.9,2,-.8,.7,[.05,.7,.3]);
 const ring=new THREE.Mesh(new THREE.TorusGeometry(.85,.23,30,90),mint);ring.position.set(1.55,2.35,-.7);ring.rotation.set(.6,.6,.25);ring.castShadow=true;sculpture.add(ring);
 const small=new THREE.Mesh(new THREE.SphereGeometry(.14,24,24),cream);small.position.set(-1.8,.7,2.1);sculpture.add(small);
 const path=new THREE.CatmullRomCurve3([new THREE.Vector3(-2.4,-.7,1.6),new THREE.Vector3(-3,.3,.4),new THREE.Vector3(-1.4,2.8,-1.4),new THREE.Vector3(1.5,3.1,-1.1),new THREE.Vector3(2.6,1.5,.6)]);
 const wire=new THREE.Mesh(new THREE.TubeGeometry(path,90,.018,8,false),new THREE.MeshStandardMaterial({color:0xb1d591,metalness:.6,roughness:.4}));sculpture.add(wire);
 const pulse=new THREE.Mesh(new THREE.SphereGeometry(.075,16,16),cream);sculpture.add(pulse);
 // The same sculpture continues into the second frame, with a reflected image.
 const reflection=sculpture.clone(true),reflectionMaterials=[];
 reflection.traverse(object=>{object.castShadow=false;object.receiveShadow=false;if(object.material){object.material=object.material.clone();object.material.transparent=true;object.material.opacity=0;object.material.depthWrite=false;object.material.side=THREE.DoubleSide;reflectionMaterials.push(object.material);}});
 reflection.matrixAutoUpdate=false;reflection.visible=false;scene.add(reflection);
 const mirrorMatrix=new THREE.Matrix4().makeTranslation(0,-2.4,0).multiply(new THREE.Matrix4().makeScale(1,-1,1));
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.2}));floor.rotation.x=-Math.PI/2;floor.position.y=-1.2;floor.receiveShadow=true;scene.add(floor);
 let pointer={x:0,y:0},frame=0,visible=true,destroyed=false,scrollProgress=0,scrollEase=0;const motion=matchMedia('(prefers-reduced-motion: reduce)');
 const hero=container.closest('.lp-journey')||container.closest('.lp-hero');
 function scroll(){if(!hero||motion.matches){scrollProgress=0;return;}const rect=hero.getBoundingClientRect();const distance=hero.classList.contains('lp-journey')?hero.offsetHeight-innerHeight:rect.height;scrollProgress=Math.max(0,Math.min(1,-rect.top/Math.max(1,distance)));}
 function resize(){const {width,height}=container.getBoundingClientRect();if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.position.set(7,5.7,10);if(camera.aspect<.85)camera.position.multiplyScalar(1.08);camera.updateProjectionMatrix();draw(0);}
 function move(e){const r=container.getBoundingClientRect();pointer={x:(e.clientX-r.left)/r.width-.5,y:(e.clientY-r.top)/r.height-.5};}
 function draw(time){if(destroyed)return;const t=time*.001;if(!motion.matches){scrollEase+=(scrollProgress-scrollEase)*.065;sculpture.rotation.y+=(-.15+pointer.x*.22+scrollEase*.75-sculpture.rotation.y)*.035;sculpture.rotation.x+=(pointer.y*.1+scrollEase*.18-sculpture.rotation.x)*.035;sculpture.rotation.z=-.13+scrollEase*.17;sculpture.position.y=Math.sin(t*.65)*.075-scrollEase*.25;for(const [i,layer] of ledgerLayers.entries())layer.mesh.position.y=layer.y+scrollEase*i*.15;labelPlane.position.y=.332+scrollEase*.6;for(const bar of bars)bar.mesh.position.y=.36+bar.height/2+scrollEase*.6;coinA.position.y=.55+Math.sin(t*.9)*.15+scrollEase*.4;coinA.rotation.y=-.35+scrollEase*.85;coinB.position.y=2+Math.cos(t*.8)*.14;ring.rotation.z=.25+Math.sin(t*.7)*.15+scrollEase*.7;ring.position.y=2.35+scrollEase*.3;pulse.position.copy(path.getPointAt((t*.11)%1));}if(motion.matches){
   scrollEase=0;sculpture.rotation.set(0,-.15,-.13);sculpture.position.y=0;
   for(const layer of ledgerLayers)layer.mesh.position.y=layer.y;
   labelPlane.position.y=.332;for(const bar of bars)bar.mesh.position.y=.36+bar.height/2;
   coinA.position.y=.55;coinA.rotation.y=-.35;coinB.position.y=2;ring.rotation.z=.25;ring.position.y=2.35;
  }
  const arrival=THREE.MathUtils.smoothstep(scrollEase,.34,.8);
  camera.lookAt(0,.3-arrival*.65,0);
  reflection.visible=arrival>.01;
  if(reflection.visible){
   for(let i=0;i<sculpture.children.length;i++){const original=sculpture.children[i],copy=reflection.children[i];copy.position.copy(original.position);copy.rotation.copy(original.rotation);copy.scale.copy(original.scale);}
   sculpture.updateMatrix();reflection.matrix.copy(mirrorMatrix).multiply(sculpture.matrix);reflection.matrixWorldNeedsUpdate=true;
   for(const material of reflectionMaterials)material.opacity=arrival*.14;
  }
  renderer.render(scene,camera);}
 function animate(t){frame=0;if(destroyed||!visible||document.hidden||motion.matches)return;draw(t);frame=requestAnimationFrame(animate);}
 function resume(){cancelAnimationFrame(frame);frame=0;if(!document.hidden&&visible){draw(performance.now());if(!motion.matches)frame=requestAnimationFrame(animate);}}
 const observer=new ResizeObserver(resize);observer.observe(container);
 const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;resume();});intersection.observe(container);
 container.parentElement.addEventListener('pointermove',move);document.addEventListener('visibilitychange',resume);motion.addEventListener('change',resume);if(hero)window.addEventListener('scroll',scroll,{passive:true});
 scroll();resize();resume();
 return ()=>{destroyed=true;cancelAnimationFrame(frame);observer.disconnect();intersection.disconnect();container.parentElement?.removeEventListener('pointermove',move);document.removeEventListener('visibilitychange',resume);motion.removeEventListener('change',resume);window.removeEventListener('scroll',scroll);scene.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();});labelTexture.dispose();texture.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();};
}
