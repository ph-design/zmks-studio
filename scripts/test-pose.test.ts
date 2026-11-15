import {test,expect} from "bun:test";
import {FlatCalibration,projectPose,visibleFace,relativeAngle,type Point3} from "../src/motion/poseMath";
const flat:Point3=[0,0,-1000];
test("front elevated camera exposes key tops and spacebar-facing edge",()=>{
 const top:Point3[]=[[-140,-48,8],[140,-48,8],[140,48,8],[-140,48,8]];
 const front:Point3[]=[[-140,-48,-8],[140,-48,-8],[140,-48,8],[-140,-48,8]];
 expect(visibleFace(top,0,0)).toBe(true);expect(visibleFace(front,0,0)).toBe(true);
 expect(projectPose([0,-48,8],0,0)[1]).toBeGreaterThan(projectPose([0,48,8],0,0)[1]);
 expect(visibleFace(top,180,0)).toBe(false);
 expect(relativeAngle(-179,179)).toBe(2);expect(relativeAngle(15,15)).toBe(0);
});
test("one-second flat calibration averages samples and honors negative Z and axis mapping",()=>{
 const cal=new FlatCalibration({swapXy:false,flipMask:4});
 for(let i=0;i<10;i++)expect(cal.push(flat,i,i*100).center).toBeUndefined();
 expect(cal.push(flat,10,1000)).toEqual({progress:100,center:[0,0]});
 const tilt=new FlatCalibration({swapXy:true,flipMask:4});let result;
 for(let i=0;i<11;i++)result=tilt.push([173,0,-985],i,i*100);
 expect(result?.center?.[0]).toBeCloseTo(996,0);expect(result?.center?.[1]).toBe(0);
});
test("moving, non-flat, duplicate or interrupted samples cannot complete calibration",()=>{
 let cal=new FlatCalibration({swapXy:false,flipMask:4});
 for(let i=0;i<10;i++)cal.push(flat,i,i*100);
 expect(cal.push([100,0,-995],10,1000).center).toBeUndefined();
 expect(cal.push([1000,0,0],11,1100).center).toBeUndefined();
 cal=new FlatCalibration({swapXy:false,flipMask:4});cal.push(flat,1,0);
 for(let i=1;i<20;i++)expect(cal.push(flat,1,i*100).center).toBeUndefined();
 cal=new FlatCalibration({swapXy:false,flipMask:4});
 for(let i=0;i<7;i++)cal.push(flat,i,i*100);
 expect(cal.push(flat,7,2000).center).toBeUndefined();
 for(let i=8;i<13;i++)expect(cal.push(flat,i,2000+(i-7)*100).center).toBeUndefined();
 cal.reset();expect(cal.push(flat,13,3000).progress).toBe(0);
});
