'use client';
import { useEffect, useRef } from 'react';

export default function NetworkGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas: HTMLCanvasElement | null = canvasRef.current;
    const wrap: HTMLDivElement | null = wrapRef.current;
    if (!canvas || !wrap) return;
    const cv: HTMLCanvasElement = canvas;
    const wr: HTMLDivElement = wrap;
    const ctx = cv.getContext('2d')!;

    const PAL: Record<string, { fill: string; text: string; glow: string }> = {
      center:  { fill: '#ffffff', text: '#000000', glow: 'rgba(255,255,255,0.18)' },
      unc:     { fill: '#4B9CD3', text: '#ffffff', glow: 'rgba(75,156,211,0.28)' },
      source:  { fill: '#1B72E8', text: '#ffffff', glow: 'rgba(27,114,232,0.25)' },
      company: { fill: '#34A98F', text: '#ffffff', glow: 'rgba(52,169,143,0.22)' },
    };

    const nodes = [
      { id:'map', label:'MAP',       sub:'Research intelligence',  type:'center',  r:18 },
      { id:'unc', label:'UNC',       sub:'Chapel Hill · Research', type:'unc',     r:14 },
      { id:'s1',  label:'SEC',       sub:'Filings · financials',   type:'source',  r:12 },
      { id:'s2',  label:'PubMed',    sub:'Co-authored papers',     type:'source',  r:12 },
      { id:'s3',  label:'NIH',       sub:'Grants · PI names',      type:'source',  r:12 },
      { id:'s4',  label:'Trials',    sub:'ClinicalTrials.gov',     type:'source',  r:12 },
      { id:'s5',  label:'OpenAlex',  sub:'Private co. context',    type:'source',  r:12 },
      { id:'c1',  label:'Merck',     sub:'94 pts · Active',        type:'company', r:11 },
      { id:'c2',  label:'Pfizer',    sub:'88 pts · Active',        type:'company', r:11 },
      { id:'c3',  label:'BMS',       sub:'81 pts · Active',        type:'company', r:10 },
      { id:'c4',  label:'Gilead',    sub:'76 pts · Active',        type:'company', r:10 },
      { id:'c5',  label:'AZ',        sub:'71 pts · Exploratory',   type:'company', r:10 },
      { id:'c6',  label:'Amgen',     sub:'65 pts · Exploratory',   type:'company', r:9  },
      { id:'c7',  label:'Roche',     sub:'58 pts · Exploratory',   type:'company', r:9  },
      { id:'c8',  label:'Lilly',     sub:'31 pts · Monitoring',    type:'company', r:8  },
    ] as Array<{id:string;label:string;sub:string;type:string;r:number;base:{x:number;y:number;z:number};offset:{x:number;y:number;z:number};phase:number;speed:number;pos:{x:number;y:number;z:number}}>;

    const edges = [
      ['map','unc'],
      ['map','s1'],['map','s2'],['map','s3'],['map','s4'],['map','s5'],
      ['unc','s2'],['unc','s3'],['unc','s4'],
      ['s1','c1'],['s1','c2'],['s1','c3'],['s1','c5'],
      ['s2','c1'],['s2','c2'],['s2','c3'],['s2','c4'],['s2','c5'],['s2','c6'],['s2','c7'],
      ['s3','c1'],['s3','c2'],['s3','c3'],['s3','c4'],['s3','c6'],
      ['s4','c1'],['s4','c2'],['s4','c4'],
      ['s5','c7'],['s5','c8'],
    ];

    function sph(theta: number, phi: number, r: number) {
      return { x: r*Math.sin(phi)*Math.cos(theta), y: r*Math.cos(phi), z: r*Math.sin(phi)*Math.sin(theta) };
    }

    nodes[0].base = {x:0,y:0,z:0};
    nodes[1].base = sph(1.9, 1.1, 85);
    const srcA = [0.3,1.55,2.8,4.1,5.35];
    for(let i=0;i<5;i++) nodes[2+i].base = sph(srcA[i], Math.PI/2+(i%2===0?0.2:-0.2), 110);
    const cmpA = [0,0.79,1.57,2.36,3.14,3.93,4.71,5.50];
    for(let i=0;i<8;i++) nodes[7+i].base = sph(cmpA[i], Math.PI*0.42+(i%3)*0.15, 190);

    nodes.forEach(n => {
      n.offset = {x:(Math.random()-0.5)*8, y:(Math.random()-0.5)*8, z:(Math.random()-0.5)*8};
      n.phase = Math.random()*Math.PI*2;
      n.speed = 0.4+Math.random()*0.5;
      n.pos = {...n.base};
    });

    type Pulse = {a:typeof nodes[0];b:typeof nodes[0];t:number;speed:number;color:string};
    const pulses: Pulse[] = [];
    function spawnPulse() {
      const e = edges[Math.floor(Math.random()*edges.length)];
      const a = nodes.find(n=>n.id===e[0]);
      const b = nodes.find(n=>n.id===e[1]);
      if(!a||!b) return;
      const col = (a.type==='unc'||b.type==='unc') ? '#4B9CD3' :
                  (a.type==='source'||b.type==='source') ? '#5B9CF6' : '#34A98F';
      pulses.push({a,b,t:0,speed:0.007+Math.random()*0.007,color:col});
    }
    for(let i=0;i<14;i++) spawnPulse();

    let rotX=0.22, rotY=0.1, dragging=false, lastX=0, lastY=0, zoom=1.55, autoRot=true, t=0;
    let dpr = window.devicePixelRatio||1;
    let animId: number;

    function project(p: {x:number;y:number;z:number}) {
      const cx=Math.cos(rotX),sx=Math.sin(rotX);
      const cy=Math.cos(rotY),sy=Math.sin(rotY);
      let y=p.y*cx-p.z*sx, z=p.y*sx+p.z*cx;
      let x=p.x*cy+z*sy; z=-p.x*sy+z*cy;
      const fov=580, sc=fov/(fov+z+280);
      const W=cv.width/dpr, H=cv.height/dpr;
      return {sx:W/2+x*sc*zoom, sy:H/2+y*sc*zoom, sc, z};
    }

    function draw() {
      dpr=window.devicePixelRatio||1;
      const W=wr.clientWidth, H=wr.clientHeight;
      cv.width=W*dpr; cv.height=H*dpr;
      cv.style.width=W+'px'; cv.style.height=H+'px';
      ctx.scale(dpr,dpr);
      ctx.clearRect(0,0,W,H);
      t+=0.007;
      if(autoRot) rotY+=0.003;

      nodes.forEach(n=>{
        const s=Math.sin(t*n.speed+n.phase)*0.5+0.5;
        n.pos={x:n.base.x+n.offset.x*s, y:n.base.y+n.offset.y*s, z:n.base.z+n.offset.z*s};
      });

      const proj=nodes.map(n=>({...n,p:project(n.pos)}));
      proj.sort((a,b)=>a.p.z-b.p.z);

      edges.forEach(([aid,bid])=>{
        const a=proj.find(n=>n.id===aid), b=proj.find(n=>n.id===bid);
        if(!a||!b) return;
        const depth=Math.max(0,(a.p.z+b.p.z)*0.5+300)/600;
        ctx.beginPath(); ctx.moveTo(a.p.sx,a.p.sy); ctx.lineTo(b.p.sx,b.p.sy);
        ctx.strokeStyle=`rgba(255,255,255,${(0.04+depth*0.1).toFixed(3)})`;
        ctx.lineWidth=0.5; ctx.stroke();
      });

      pulses.forEach((pu,i)=>{
        pu.t+=pu.speed;
        if(pu.t>1){pulses.splice(i,1);spawnPulse();return;}
        const pa=project(pu.a.pos), pb=project(pu.b.pos);
        const x=pa.sx+(pb.sx-pa.sx)*pu.t, y=pa.sy+(pb.sy-pa.sy)*pu.t;
        const sc=(pa.sc+pb.sc)/2;
        const alpha=Math.max(0,0.9*(1-Math.abs(pu.t-0.5)*2));
        ctx.beginPath(); ctx.arc(x,y,2.2*sc*zoom,0,Math.PI*2);
        ctx.fillStyle=pu.color; ctx.globalAlpha=alpha; ctx.fill(); ctx.globalAlpha=1;
      });

      proj.forEach(n=>{
        const {sx,sy,sc}=n.p, r=n.r*sc*zoom;
        const pal=PAL[n.type], pulse=Math.sin(t*n.speed*1.4+n.phase)*0.5+0.5;
        ctx.beginPath(); ctx.arc(sx,sy,r*2.2,0,Math.PI*2);
        ctx.fillStyle=pal.glow; ctx.globalAlpha=0.35+pulse*0.15; ctx.fill(); ctx.globalAlpha=1;
        ctx.beginPath(); ctx.arc(sx,sy,r*1.35,0,Math.PI*2);
        ctx.fillStyle=pal.glow; ctx.globalAlpha=0.2+pulse*0.08; ctx.fill(); ctx.globalAlpha=1;
        ctx.beginPath(); ctx.arc(sx,sy,r,0,Math.PI*2); ctx.fillStyle=pal.fill; ctx.fill();
        const fs=Math.max(10,Math.min(14,Math.round(r*0.68)));
        ctx.font=`500 ${fs}px -apple-system,system-ui,sans-serif`;
        ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle=pal.text;
        ctx.globalAlpha=Math.min(1,(r-6)/8); ctx.fillText(n.label,sx,sy); ctx.globalAlpha=1;
      });
    }

    const onMouseDown = (e: MouseEvent) => { dragging=true; autoRot=false; lastX=e.clientX; lastY=e.clientY; };
    const onMouseUp = () => { dragging=false; };
    const onMouseMove = (e: MouseEvent) => {
      if(!dragging) return;
      rotY+=(e.clientX-lastX)*0.007; rotX+=(e.clientY-lastY)*0.007;
      lastX=e.clientX; lastY=e.clientY;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom*=e.deltaY>0?0.94:1.06;
      zoom=Math.max(0.5,Math.min(3.5,zoom));
    };

    wr.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    wr.addEventListener('wheel', onWheel, {passive:false});

    function loop() { animId=requestAnimationFrame(loop); draw(); }
    loop();

    return () => {
      cancelAnimationFrame(animId);
      wr.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      wr.removeEventListener('wheel', onWheel);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      style={{ width:'100%', height:'440px', borderRadius:'16px', overflow:'hidden',
               position:'relative', background:'#050508', cursor:'grab' }}
    >
      <canvas ref={canvasRef} style={{ width:'100%', height:'100%', display:'block' }} />
      <div style={{ position:'absolute', top:18, left:22, pointerEvents:'none' }}>
        <div style={{ fontSize:10, letterSpacing:'0.12em', color:'rgba(255,255,255,0.35)',
                      marginBottom:4, textTransform:'uppercase' }}>
          Market and Accounts Platform
        </div>
        <div style={{ fontSize:20, fontWeight:600, color:'#fff', letterSpacing:'-0.025em', lineHeight:1.1 }}>
          Partnership intelligence
        </div>
        <div style={{ fontSize:12, color:'rgba(255,255,255,0.38)', marginTop:4 }}>
          UNC Chapel Hill · Live from public sources
        </div>
      </div>
      <div style={{ position:'absolute', bottom:12, left:0, right:0, display:'flex',
                    justifyContent:'center', gap:16, fontSize:10,
                    color:'rgba(255,255,255,0.22)', pointerEvents:'none' }}>
        <span>Drag to rotate</span><span>·</span><span>Scroll to zoom</span><span>·</span><span>Click to explore</span>
      </div>
    </div>
  );
}
