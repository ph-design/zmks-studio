import {useEffect,useRef,useState} from "react";
import {projectPose,visibleFace,relativeAngle,type Point3} from "./poseMath";
export function KeyboardPose({roll,pitch,label,frontLabel,guide}:{roll:number;pitch:number;label:string;frontLabel:string;guide?:"flat"|"left"|"rear"}) {
 const target=useRef([roll,pitch]);target.current=[roll,pitch];
 const current=useRef([roll,pitch]),[display,setDisplay]=useState(current.current);
 useEffect(()=>{let frame=0,previous=performance.now();
  const draw=(now:number)=>{const alpha=Math.min(1,(now-previous)/50);previous=now;
   const next=current.current.map((angle,i)=>angle+relativeAngle(target.current[i],angle)*alpha);
   if(next.some((v,i)=>Math.abs(v-current.current[i])>.01)){current.current=next;setDisplay(next);}
   frame=requestAnimationFrame(draw);};frame=requestAnimationFrame(draw);return()=>cancelAnimationFrame(frame);
 },[]);
 const project=(v:Point3)=>projectPose(v,display[0],display[1]);
 const points:Point3[]=[[-140,-48,-8],[140,-48,-8],[140,48,-8],[-140,48,-8],[-140,-48,8],[140,-48,8],[140,48,8],[-140,48,8]];
 const faces=[[3,2,1,0],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7],[4,5,6,7]].map((ids,i)=>({ids,i,depth:ids.reduce((sum,id)=>sum+project(points[id])[2],0)/4})).filter(f=>visibleFace(f.ids.map(id=>points[id]),display[0],display[1])).sort((a,b)=>a.depth-b.depth);
 const polygon=(vertices:Point3[])=>vertices.map(v=>project(v).slice(0,2).join(',')).join(' ');
 const key=(x:number,y:number,w:number,h=12):Point3[]=>[[x-w/2,y-h/2,10],[x+w/2,y-h/2,10],[x+w/2,y+h/2,10],[x-w/2,y+h/2,10]];
 const keys:Point3[][]=[];
 for(let row=0;row<4;row++)for(let col=0;col<14;col++)keys.push(key(-124+col*19,33-row*18,16));
 for(const [x,w] of [[-122,20],[-97,20],[-72,20],[0,114],[78,20],[103,20],[126,16]])keys.push(key(x,-38,w));
 const edge:Point3[]=guide==='left'?[[-142,-48,14],[-142,48,14]]:guide==='rear'?[[-140,50,14],[140,50,14]]:[[-140,-48,14],[140,-48,14],[140,48,14],[-140,48,14],[-140,-48,14]];
 const front=project([0,-65,0]);
 return <svg viewBox="0 0 400 250" role="img" aria-label={label} className="w-full">
  <ellipse cx="200" cy="182" rx="145" ry="18" fill="currentColor" opacity=".06" />
  {faces.map(({ids,i})=><g key={i}><polygon points={polygon(ids.map(id=>points[id]))} fill={i===5?'#a8bbd0':i===1?'#ec995c':'#71869c'} stroke="#354b62" strokeWidth="1.4"/>
   {i===5 && keys.map((vertices,id)=><polygon key={id} points={polygon(vertices)} fill={id===59?'#f4bc86':'#edf3f8'} stroke="#647c92" strokeWidth=".7" />)}
  </g>)}
  {guide && <polyline points={polygon(edge)} fill="none" stroke="#1683ff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />}
  <text x={front[0]} y={front[1]+18} textAnchor="middle" fill="currentColor" fontSize="12">{frontLabel}</text>
  <text x="200" y="239" textAnchor="middle" fill="currentColor" fontSize="11">{label}</text>
 </svg>;
}
