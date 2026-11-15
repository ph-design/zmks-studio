import type {ImuConfig} from "./imuProtocol";
export type Point3 = [number,number,number];
export function relativeAngle(value:number,center:number) {return ((value-center+540)%360+360)%360-180;}
export function rotatePose([x,y,z]:Point3,roll:number,pitch:number):Point3 {
 const r=roll*Math.PI/180,p=pitch*Math.PI/180;
 const xx=x*Math.cos(p)+z*Math.sin(p),zz=-x*Math.sin(p)+z*Math.cos(p);
 return [xx,y*Math.cos(r)-zz*Math.sin(r),y*Math.sin(r)+zz*Math.cos(r)];
}
// Fixed camera in front of the spacebar, slightly to the right and above.
export function projectPose(point:Point3,roll:number,pitch:number):Point3 {
 const [x,y,z]=rotatePose(point,roll,pitch),yaw=12*Math.PI/180,elevation=55*Math.PI/180;
 const u=x*Math.cos(yaw)+y*Math.sin(yaw),v=-x*Math.sin(yaw)+y*Math.cos(yaw);
 return [200+u,122-v*Math.sin(elevation)-z*Math.cos(elevation),-v*Math.cos(elevation)+z*Math.sin(elevation)];
}
export function visibleFace(vertices:Point3[],roll:number,pitch:number) {
 const [a,b,c]=vertices.map(v=>projectPose(v,roll,pitch));
 // Projection reverses screen Y; a front-facing CCW world face is clockwise.
 return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]) < -0.01;
}
export class FlatCalibration {
 private samples:{raw:Point3;at:number}[]=[];
 private lastId:number|undefined;
 constructor(private mapping:Pick<ImuConfig,"swapXy"|"flipMask">){}
 reset(){this.samples=[];}
 push(raw:Point3,id:number,now:number):{progress:number;center?:[number,number]} {
  if(id===this.lastId)return {progress:0};this.lastId=id;
  const norm=Math.hypot(...raw);
  if(norm<850 || norm>1150 || Math.abs(raw[2])<850){this.samples=[];return {progress:0};}
  if(this.samples.length && now-this.samples[this.samples.length-1].at>350)this.samples=[];
  this.samples.push({raw:[...raw],at:now});
  if([0,1,2].some(i=>Math.max(...this.samples.map(s=>s.raw[i]))-Math.min(...this.samples.map(s=>s.raw[i]))>35))this.samples=[{raw:[...raw],at:now}];
  const duration=now-this.samples[0].at;
  if(duration<1000 || this.samples.length<8)return {progress:Math.min(99,Math.floor(duration/10))};
  const mean=[0,1,2].map(i=>this.samples.reduce((sum,s)=>sum+s.raw[i],0)/this.samples.length);
  const a=[mean[this.mapping.swapXy?1:0],mean[this.mapping.swapXy?0:1],mean[2]].map((v,i)=>this.mapping.flipMask&(1<<i)?-v:v);
  return {progress:100,center:[Math.round(Math.atan2(a[1],a[2])*18000/Math.PI)||0,Math.round(Math.atan2(-a[0],Math.hypot(a[1],a[2]))*18000/Math.PI)||0]};
 }
}
