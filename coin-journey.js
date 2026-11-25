import * as THREE from 'three';
import {updateCoinScenes,clearCoinScenes} from './coin-scenes.js';

// Reparent the actual fragment mesh; the worksite and camera never follow it.
export function mountCoinJourney({coin,container,camera,world}){
 const page=container.closest('.landing-page'),chapter=container.closest('.lp-construction-chapter');
 if(!page||!chapter)return {update(){},destroy(){}};
 const motion=matchMedia('(prefers-reduced-motion: reduce)');
 let renderer,layer,scene,view,halo,shadow,stars,active=false,disposed=false,litStation=null;
 const resources=[],materials=[],origin=new THREE.Vector3(.5,.57,2.05),top=new THREE.Vector3(.5,1.18,2.05),projected=new THREE.Vector3();
 const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n)),lerp=THREE.MathUtils.lerp;
 const names=['platform','payment','people','records','team','insights','access','finish'];
 const sizes=[106,55,90,62,62,58,95,40];
 function setup(){
  layer=document.createElement('div');layer.className='lp-coin-journey';layer.setAttribute('aria-hidden','true');
  try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});}catch{return false;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
  layer.append(renderer.domElement);page.append(layer);
  scene=new THREE.Scene();view=new THREE.OrthographicCamera(-innerWidth/2,innerWidth/2,innerHeight/2,-innerHeight/2,.1,2000);view.position.z=1000;
  scene.add(new THREE.HemisphereLight(0xfff5dc,0x314a36,3.3));const light=new THREE.DirectionalLight(0xfff4d3,4.8);light.position.set(-400,600,800);scene.add(light);const rim=new THREE.DirectionalLight(0xe4efbd,2);rim.position.set(400,0,-300);scene.add(rim);
  const ringGeometry=new THREE.TorusGeometry(1,.006,6,100);resources.push(ringGeometry);
  const ringMaterial=new THREE.MeshBasicMaterial({color:0xc7a65c,transparent:true,opacity:.3,depthWrite:false});materials.push(ringMaterial);
  halo=new THREE.Mesh(ringGeometry,ringMaterial);halo.position.z=-20;scene.add(halo);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d'),gradient=ctx.createRadialGradient(64,64,0,64,64,64);gradient.addColorStop(0,'rgba(74,55,9,.3)');gradient.addColorStop(1,'rgba(74,55,9,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
  const texture=new THREE.CanvasTexture(canvas);resources.push(texture);const shadowMaterial=new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:.5,depthWrite:false});materials.push(shadowMaterial);const plane=new THREE.PlaneGeometry(1,1);resources.push(plane);shadow=new THREE.Mesh(plane,shadowMaterial);shadow.position.z=-30;scene.add(shadow);
  const starGeometry=new THREE.OctahedronGeometry(1);resources.push(starGeometry);stars=Array.from({length:9},(_,i)=>{const material=new THREE.MeshBasicMaterial({color:0xd7b76c,transparent:true,opacity:(1-i/10)*.55,depthWrite:false});materials.push(material);const star=new THREE.Mesh(starGeometry,material);scene.add(star);return star;});
  resize();return true;
 }
 function resize(){if(!renderer)return;renderer.setSize(innerWidth,innerHeight,false);view.left=-innerWidth/2;view.right=innerWidth/2;view.top=innerHeight/2;view.bottom=-innerHeight/2;view.updateProjectionMatrix();}
 function restore(){if(active){world.add(coin);coin.scale.setScalar(1);active=false;}if(layer)layer.style.opacity='0';litStation?.removeAttribute('data-coin-active');litStation=null;delete page.dataset.coinJourney;}
 function update(){
  if(disposed)return;
  const rect=chapter.getBoundingClientRect(),start=scrollY+rect.bottom-innerHeight;
  if(motion.matches||scrollY<=start+.25){restore();return;}
  if(!renderer&&!setup()){restore();return;}
  const canvas=container.getBoundingClientRect();projected.copy(origin).project(camera);const initialX=canvas.left+(projected.x+1)*canvas.width/2,initialY=canvas.top+(1-projected.y)*canvas.height/2;
  projected.copy(top).project(camera);const initialSize=Math.max(50,Math.abs(canvas.top+(1-projected.y)*canvas.height/2-initialY)*2);
  const initialQ=camera.quaternion.clone().invert().multiply(coin.quaternion);
  const maxScroll=document.documentElement.scrollHeight-innerHeight,small=innerWidth<=760;
  const points=[{name:'worksite',x:initialX,y:initialY,size:initialSize,scroll:start}];
  for(let i=0;i<names.length;i++){
   const element=page.querySelector('[data-coin-anchor="'+names[i]+'"]');if(!element)continue;
   const r=element.getBoundingClientRect(),size=small?Math.min(sizes[i]*.76,r.width*.78):sizes[i];
   const centerY=r.top+r.height*.46,centerX=r.left+r.width/2;
   let at=scrollY+centerY-innerHeight*.48;
   if(names[i]==='finish')at=maxScroll;
   else if(names[i]==='access')at=Math.min(at,maxScroll-innerHeight*.3);
   at=Math.max(points.at(-1).scroll+innerHeight*.13,at);
   points.push({name:names[i],x:centerX,y:centerY,size,scroll:at});
  }
  // Keep the last station reachable even on tall displays with a short footer.
  points.at(-1).scroll=maxScroll;
  updateCoinScenes(page,points,scrollY,innerHeight);
  let index=0;while(index<points.length-2&&scrollY>points[index+1].scroll)index++;
  const a=points[index],b=points[index+1],t=clamp((scrollY-a.scroll)/Math.max(1,b.scroll-a.scroll));
  const sweep=Math.sin(t*Math.PI),direction=index%2?1:-1;
  const cardNames=['records','team','insights'],rail=cardNames.includes(a.name)&&cardNames.includes(b.name)?70:innerWidth-45;
  // The coin tucks into its edge during flight, then presses into each scene.
  const landing=Math.sin(clamp((t-.72)/.28)*Math.PI);
  const size=lerp(a.size,b.size,t)*(small?1-sweep*.38:1)*(1-landing*.12);
  const pathX=lerp(a.x,b.x,t)+sweep*direction*(small?12:65);
  const x=clamp(small?lerp(pathX,rail,sweep*.8):pathX,size*.6,innerWidth-size*.6);
  const y=clamp(lerp(a.y,b.y,t)-sweep*(small?28:75)+landing*12,size*.6+12,innerHeight-size*.6-15);
  if(!active){scene.add(coin);active=true;}
  coin.position.set(x-innerWidth/2,innerHeight/2-y,0);coin.scale.setScalar(size/1.22);
  const turn=scrollY*.004,rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(.12+Math.sin(turn*.6)*.12,.2+Math.sin(turn)*.42+sweep*Math.PI*2,.08*Math.sin(turn*.7)));
  coin.quaternion.copy(index===0?initialQ.clone().slerp(rotation,t):rotation);
  halo.position.set(coin.position.x,coin.position.y,-20);halo.scale.setScalar(size*(.67+landing*.8));halo.rotation.set(.25,Math.sin(turn*.4)*.6,turn*.2);halo.material.opacity=.12+landing*.4;
  shadow.position.set(coin.position.x,coin.position.y-size*.66,-30);shadow.scale.set(size*1.65,size*.35,1);
  stars.forEach((star,i)=>{const d=(i+1)*6;star.position.set(coin.position.x+Math.sin(turn+i*.65)*d,coin.position.y+d+size*.25,5);star.scale.setScalar((small?1:1.6)*(1-i*.06));star.rotation.z=turn;star.material.opacity=sweep*(1-i/10)*.6;});
  const station=t<.5?a.name:b.name;
  const dock=t<.14?a.name:t>.86?b.name:null,nextLit=dock?page.querySelector('[data-coin-anchor="'+dock+'"]'):null;
  if(nextLit!==litStation){litStation?.removeAttribute('data-coin-active');nextLit?.setAttribute('data-coin-active','');litStation=nextLit;}
  layer.style.opacity='1';layer.dataset.station=station;page.dataset.coinJourney=station;
  renderer.render(scene,view);
 }
 window.addEventListener('resize',resize,{passive:true});
 return {update,destroy(){disposed=true;restore();clearCoinScenes(page);window.removeEventListener('resize',resize);renderer?.dispose();renderer?.forceContextLoss();layer?.remove();for(const resource of resources)resource.dispose();for(const material of materials)material.dispose();}};
}
