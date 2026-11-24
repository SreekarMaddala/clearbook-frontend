const assert=require('node:assert/strict');
(async()=>{
 const {coinMotionAtProgress:pose}=await import('../construction-motion.mjs');
 assert.equal(pose(.65).morph,1,'The fragment becomes a coin before it falls.');
 const peak=pose(.67),fall=pose(.8),impact=pose(.88),bounce=pose(.92),rest=pose(1);
 assert.ok(peak.y>fall.y&&fall.y>impact.y,'The formed coin visibly descends.');
 assert.ok(bounce.y>rest.y&&bounce.y<rest.y+.21,'Landing has a small bounded bounce.');
 assert.ok(Math.abs(rest.y-.57)<1e-9);assert.ok(Math.abs(rest.z-2.05)<1e-9);assert.equal(rest.spin,1);
 for(let p=.68;p<.87;p+=.01)assert.ok(pose(p+.005).y<pose(p).y,'Gravity accelerates the downward motion.');
 for(const p of [.32,.43,.63,.65,.67,.875,.88,1])for(const key of ['x','y','z'])assert.ok(Math.abs(pose(p-.00001)[key]-pose(p+.00001)[key])<.005,'The path remains continuous at '+p);
 assert.deepEqual(pose(-1),pose(0));assert.deepEqual(pose(2),pose(1));
 console.log('PASS: coin forms before descent, falls continuously, bounces gently, and rests on the worksite.');
})().catch(e=>{console.error(e);process.exitCode=1;});
