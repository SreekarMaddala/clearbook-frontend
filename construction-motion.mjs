const clamp=n=>Math.max(0,Math.min(1,n));
const smooth=(a,b,p)=>{const t=clamp((p-a)/(b-a));return t*t*(3-2*t);};
const lerp=(a,b,t)=>a+(b-a)*t;

// Scene coordinates: release, rise, gravity-driven drop, and a damped landing bounce.
export function coinMotionAtProgress(progress){
 const p=clamp(progress),fly=smooth(.32,.63,p),drop=clamp((p-.67)/.21),settle=clamp((p-.88)/.12);
 let x=lerp(-.58,.1,fly),y=lerp(1.03,2.65,fly)+Math.sin(fly*Math.PI)*.58,z=lerp(.41,.7,fly);
 if(drop>0){x=lerp(.1,.5,smooth(0,1,drop));y=lerp(2.65,.57,drop*drop);z=lerp(.7,2.05,drop);}
 if(p>.88)y+=Math.sin(settle*Math.PI)*.2*(1-settle);
 return {x,y,z,morph:smooth(.43,.65,p),spin:smooth(.67,.88,p),impact:clamp((p-.875)/.125)};
}
