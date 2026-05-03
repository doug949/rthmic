"use client";

import Link from "next/link";
import { useRef, useState, useCallback, useEffect, memo } from "react";
import { useAudio } from "@/app/contexts/AudioContext";
import { tracks } from "@/app/data/tracks";

// ─── Field ────────────────────────────────────────────────────────────────────
const FW = 900;
const FH = 1100;
const MIN_S = 0.22;
const MAX_S = 2.6;

// ─── Category hubs ────────────────────────────────────────────────────────────
const HUBS = {
  morning: { label: "Morning",     color: "#f0b43c", x: 215, y: 190 },
  start:   { label: "Starting Up", color: "#4ed694", x: 692, y: 208 },
  focus:   { label: "Focus",       color: "#7b6fff", x: 778, y: 558 },
  shows:   { label: "Shows",       color: "#d45fd0", x: 572, y: 888 },
  other:   { label: "Other",       color: "#46b4dc", x: 192, y: 872 },
} as const;

type HubId = keyof typeof HUBS;
type CatFilter = "all" | HubId;

const CENTER = { x: 450, y: 530 };

const HUB_EDGES: [HubId, HubId][] = [
  ["morning","start"],["start","focus"],["focus","shows"],
  ["shows","other"],["other","morning"],["morning","focus"],["start","shows"],
];

// ─── Categorise ───────────────────────────────────────────────────────────────
function getCat(title: string): HubId {
  const t = title.toLowerCase();
  if (t.includes("morning menu")||t.includes("menues before bed")||t.includes("afternoon menu")||t.includes("hold the night")) return "morning";
  if (t.includes("early motion")||t.includes("get set")||t.includes("cage drop")||t.includes("danger chords")) return "start";
  if (t.includes("don't think about")||t.includes("the minimum")||t.includes("the vacuum")||
      t.includes("i understand")||t.includes("you already know")||t.includes("outcome candidates")) return "focus";
  if (t.includes("introducing rthmic")||t.includes("you're don't know it yet")) return "shows";
  return "other";
}

function sr(n: number) { const x = Math.sin(n+1)*10000; return x - Math.floor(x); }

// ─── Bubble data ──────────────────────────────────────────────────────────────
interface Bubble { id:string; title:string; audioKey:string; cat:HubId; rx:number; ry:number; size:number; delay:number; }

function buildBubbles(): Bubble[] {
  const groups: Record<HubId, typeof tracks> = {morning:[],start:[],focus:[],shows:[],other:[]};
  for (const t of tracks) groups[getCat(t.title)].push(t);
  const all: Bubble[] = [];
  for (const [catId, ct] of Object.entries(groups) as [HubId, typeof tracks][]) {
    const h = HUBS[catId];
    ct.forEach((track, i) => {
      const n = ct.length;
      const angle = (i/n)*Math.PI*2 - Math.PI/2 + (sr(i*7+catId.charCodeAt(0))-0.5)*0.75;
      const r = 98 + sr(i*11+catId.charCodeAt(0))*82;
      all.push({
        id: track.id, title: track.title, audioKey: track.audioKey, cat: catId,
        rx: Math.max(24, Math.min(FW-24, h.x + Math.cos(angle)*r)),
        ry: Math.max(24, Math.min(FH-24, h.y + Math.sin(angle)*r)),
        size: [42,50,58][i%3], delay: sr(i*13)*5,
      });
    });
  }
  return all;
}

const BUBBLES = buildBubbles();

// ─── Physics ──────────────────────────────────────────────────────────────────
interface Phys { x:number; y:number; vx:number; vy:number; rx:number; ry:number; }
const mkP = (rx:number, ry:number): Phys => ({x:rx,y:ry,vx:0,vy:0,rx,ry});

function stepPhys(p: Phys, k: number, damp: number) {
  p.vx = (p.vx + (p.rx-p.x)*k) * damp;
  p.vy = (p.vy + (p.ry-p.y)*k) * damp;
  p.x += p.vx; p.y += p.vy;
}

// ─── SVG Lines (memoised — never re-renders, rAF owns all attributes) ─────────
interface LineHandles {
  cth: Record<string, SVGLineElement|null>;
  hth: (SVGLineElement|null)[];
  htb: (SVGLineElement|null)[];
  dots: Record<string, SVGCircleElement|null>;
}

const Lines = memo(function Lines({ handles }: { handles: LineHandles }) {
  return (
    <svg className="absolute inset-0 pointer-events-none" width={FW} height={FH} style={{overflow:"visible"}}>
      <defs>
        <filter id="lg" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.8" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      {/* center → hub */}
      {(Object.keys(HUBS) as HubId[]).map(id => (
        <line key={`c-${id}`} ref={el=>{handles.cth[id]=el;}}
          x1={CENTER.x} y1={CENTER.y} x2={HUBS[id].x} y2={HUBS[id].y}
          stroke={HUBS[id].color} strokeWidth="1" strokeOpacity="0.22"
          strokeDasharray="3 7" filter="url(#lg)" />
      ))}
      {/* hub → hub */}
      {HUB_EDGES.map(([a,b],i) => (
        <line key={`hh-${i}`} ref={el=>{handles.hth[i]=el;}}
          x1={HUBS[a].x} y1={HUBS[a].y} x2={HUBS[b].x} y2={HUBS[b].y}
          stroke="rgba(255,255,255,0.07)" strokeWidth="0.8" />
      ))}
      {/* hub → bubble */}
      {BUBBLES.map((b,i) => (
        <line key={`hb-${b.id}`} ref={el=>{handles.htb[i]=el;}}
          x1={HUBS[b.cat].x} y1={HUBS[b.cat].y} x2={b.rx} y2={b.ry}
          stroke={HUBS[b.cat].color} strokeWidth="0.6" strokeOpacity="0.13" />
      ))}
      {/* hub dots */}
      {(Object.keys(HUBS) as HubId[]).map(id => (
        <circle key={`d-${id}`} ref={el=>{handles.dots[id]=el;}}
          cx={HUBS[id].x} cy={HUBS[id].y} r="2.5"
          fill={HUBS[id].color} opacity="0.5" />
      ))}
    </svg>
  );
}, () => true); // never re-render — rAF owns all DOM updates

// ─── Component ────────────────────────────────────────────────────────────────
export default function ExplorePage() {
  const { currentTrackId, isPlaying, loadingId, handlePlay } = useAudio();
  const [filter, setFilter] = useState<CatFilter>("all");

  // DOM refs (positions owned by rAF, not React)
  const viewportRef  = useRef<HTMLDivElement>(null);
  const fieldRef     = useRef<HTMLDivElement>(null);
  const bubbleEls    = useRef<(HTMLButtonElement|null)[]>(new Array(BUBBLES.length).fill(null));
  const labelEls     = useRef<(HTMLParagraphElement|null)[]>(new Array(BUBBLES.length).fill(null));
  const hubEls       = useRef<Partial<Record<HubId,HTMLButtonElement|null>>>({});
  const centerEl     = useRef<HTMLDivElement>(null);
  const lineHandles  = useRef<LineHandles>({cth:{},hth:new Array(HUB_EDGES.length).fill(null),htb:new Array(BUBBLES.length).fill(null),dots:{}});

  // Physics
  const BP  = useRef<Phys[]>(BUBBLES.map(b => mkP(b.rx, b.ry)));
  const HP  = useRef<Record<HubId,Phys>>(Object.fromEntries(Object.entries(HUBS).map(([id,h])=>[id,mkP(h.x,h.y)])) as Record<HubId,Phys>);
  const CP  = useRef<Phys>(mkP(CENTER.x, CENTER.y));

  // Viewport transform (direct DOM, avoids React re-renders)
  const tfRef    = useRef({scale:0.36, x:0, y:0});
  const tfTarget = useRef<{scale:number;x:number;y:number}|null>(null);
  const filterRef = useRef<CatFilter>("all");

  const applyTF = useCallback((t:{scale:number;x:number;y:number}) => {
    tfRef.current = t;
    if (fieldRef.current) fieldRef.current.style.transform = `translate(${t.x}px,${t.y}px) scale(${t.scale})`;
  }, []);

  // Clamp tf to field bounds
  function clamp(s:number,x:number,y:number,vpW:number,vpH:number){
    const pad=80;
    return {scale:s, x:Math.max(vpW-FW*s-pad,Math.min(pad,x)), y:Math.max(vpH-FH*s-pad,Math.min(pad,y))};
  }

  // Init viewport transform on mount
  useEffect(() => {
    const vp = viewportRef.current; if (!vp) return;
    const s = Math.min(vp.clientWidth/FW, vp.clientHeight/FH)*0.88;
    applyTF({scale:s, x:(vp.clientWidth-FW*s)/2, y:(vp.clientHeight-FH*s)/2});
  }, [applyTF]);

  // Filter change → opacity + zoom target
  useEffect(() => {
    filterRef.current = filter;
    const vp = viewportRef.current;

    // Bubble opacity
    BUBBLES.forEach((b,i) => {
      const dim = filter!=="all" && filter!==b.cat;
      const el = bubbleEls.current[i];
      if (el) { el.style.opacity = dim?"0.05":"1"; el.style.pointerEvents = dim?"none":"auto"; }
      // Small scatter impulse for non-selected nodes
      if (filter!=="all" && dim) {
        BP.current[i].vx += (Math.random()-0.5)*2.5;
        BP.current[i].vy += (Math.random()-0.5)*2.5;
      }
    });
    // Hub opacity + line opacity
    (Object.keys(HUBS) as HubId[]).forEach(id => {
      const dim = filter!=="all" && filter!==id;
      const el = hubEls.current[id];
      if (el) el.style.opacity = dim?"0.12":"1";
      const l = lineHandles.current.cth[id];
      if (l) l.style.opacity = dim?"0.03":"1";
      const d = lineHandles.current.dots[id];
      if (d) d.style.opacity = dim?"0.04":"1";
      // Small hub scatter
      if (filter!=="all" && dim) {
        HP.current[id].vx += (Math.random()-0.5)*1.5;
        HP.current[id].vy += (Math.random()-0.5)*1.5;
      }
    });
    HUB_EDGES.forEach(([a,b],i) => {
      const dim = filter!=="all" && filter!==a && filter!==b;
      const l = lineHandles.current.hth[i];
      if (l) l.style.opacity = dim?"0.01":"1";
    });
    BUBBLES.forEach((b,i) => {
      const dim = filter!=="all" && filter!==b.cat;
      const l = lineHandles.current.htb[i];
      if (l) l.style.opacity = dim?"0.01":"1";
    });

    // Compute zoom target
    if (!vp) return;
    if (filter==="all") {
      const s = Math.min(vp.clientWidth/FW, vp.clientHeight/FH)*0.88;
      tfTarget.current = {scale:s, x:(vp.clientWidth-FW*s)/2, y:(vp.clientHeight-FH*s)/2};
    } else {
      const hub = HUBS[filter];
      const catBubs = BUBBLES.filter(b => b.cat===filter);
      const pad = 85;
      const xs = [hub.x, CENTER.x, ...catBubs.map(b=>b.rx)];
      const ys = [hub.y, CENTER.y, ...catBubs.map(b=>b.ry)];
      const x1=Math.min(...xs)-pad, x2=Math.max(...xs)+pad;
      const y1=Math.min(...ys)-pad, y2=Math.max(...ys)+pad;
      const s = Math.min(vp.clientWidth/(x2-x1), vp.clientHeight/(y2-y1), MAX_S);
      const cx=(x1+x2)/2, cy=(y1+y2)/2;
      tfTarget.current = {scale:s, x:vp.clientWidth/2-cx*s, y:vp.clientHeight/2-cy*s};
    }
  }, [filter]);

  // Main rAF physics + render loop
  useEffect(() => {
    let fId: number;
    let drift = 0;

    function tick() {
      const settling = tfTarget.current !== null;
      const damp    = settling ? 0.91 : 0.855;
      const hubDamp = settling ? 0.93 : 0.875;

      // Bubble physics
      BP.current.forEach((p,i) => {
        stepPhys(p, 0.055, damp);
        const el = bubbleEls.current[i];
        const b = BUBBLES[i];
        if (el) { el.style.left=`${p.x - b.size/2}px`; el.style.top=`${p.y - b.size/2}px`; }
      });

      // Hub physics
      (Object.keys(HUBS) as HubId[]).forEach(id => {
        const p = HP.current[id];
        stepPhys(p, 0.038, hubDamp);
        const el = hubEls.current[id];
        if (el) { el.style.left=`${p.x - 39}px`; el.style.top=`${p.y - 39}px`; }
      });

      // Center physics (very gentle)
      stepPhys(CP.current, 0.022, 0.92);
      const ce = centerEl.current;
      if (ce) { ce.style.left=`${CP.current.x-30}px`; ce.style.top=`${CP.current.y-30}px`; }

      // Update SVG line endpoints
      (Object.keys(HUBS) as HubId[]).forEach(id => {
        const hp = HP.current[id], cp = CP.current;
        const l = lineHandles.current.cth[id];
        if (l) { l.setAttribute("x1",`${cp.x}`); l.setAttribute("y1",`${cp.y}`); l.setAttribute("x2",`${hp.x}`); l.setAttribute("y2",`${hp.y}`); }
        const d = lineHandles.current.dots[id];
        if (d) { d.setAttribute("cx",`${hp.x}`); d.setAttribute("cy",`${hp.y}`); }
      });
      HUB_EDGES.forEach(([a,b],i) => {
        const ha=HP.current[a], hb=HP.current[b];
        const l = lineHandles.current.hth[i];
        if (l) { l.setAttribute("x1",`${ha.x}`); l.setAttribute("y1",`${ha.y}`); l.setAttribute("x2",`${hb.x}`); l.setAttribute("y2",`${hb.y}`); }
      });
      BUBBLES.forEach((b,i) => {
        const hp=HP.current[b.cat], bp=BP.current[i];
        const l = lineHandles.current.htb[i];
        if (l) { l.setAttribute("x1",`${hp.x}`); l.setAttribute("y1",`${hp.y}`); l.setAttribute("x2",`${bp.x}`); l.setAttribute("y2",`${bp.y}`); }
      });

      // Random drift impulse every ~4 s
      drift++;
      if (drift > 240) {
        drift = 0;
        BP.current.forEach(p => { if (Math.random()<0.25) { p.vx+=(Math.random()-0.5)*1.4; p.vy+=(Math.random()-0.5)*1.4; } });
        (Object.keys(HUBS) as HubId[]).forEach(id => { const p=HP.current[id]; p.vx+=(Math.random()-0.5)*0.6; p.vy+=(Math.random()-0.5)*0.6; });
      }

      // Label visibility
      const show = tfRef.current.scale > 0.5;
      labelEls.current.forEach((el,i) => {
        if (!el) return;
        const dim = filterRef.current!=="all" && filterRef.current!==BUBBLES[i].cat;
        el.style.opacity = (show && !dim) ? "1" : "0";
      });

      // Smooth zoom animation
      const tgt = tfTarget.current;
      if (tgt) {
        const cur = tfRef.current, a = 0.075;
        const next = {scale:cur.scale+(tgt.scale-cur.scale)*a, x:cur.x+(tgt.x-cur.x)*a, y:cur.y+(tgt.y-cur.y)*a};
        if (Math.abs(next.scale-tgt.scale)<0.001 && Math.abs(next.x-tgt.x)<0.4) { tfTarget.current=null; applyTF(tgt); }
        else applyTF(next);
      }

      fId = requestAnimationFrame(tick);
    }

    fId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(fId);
  }, [applyTF]);

  // ── Gesture handling ──────────────────────────────────────────────────────
  const G = useRef({ mode:"idle" as "idle"|"pinch"|"pan", startDist:1, startScale:1, startCX:0, startCY:0, startOX:0, startOY:0, startTX:0, startTY:0, prevTX:0, prevTY:0, velX:0, velY:0, totalMove:0 });
  const isTap = () => G.current.totalMove < 10;

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const cur = tfRef.current;
    if (e.touches.length===2) {
      e.preventDefault();
      const [t0,t1]=[e.touches[0],e.touches[1]];
      Object.assign(G.current,{mode:"pinch",startDist:Math.hypot(t1.clientX-t0.clientX,t1.clientY-t0.clientY),startScale:cur.scale,startCX:(t0.clientX+t1.clientX)/2,startCY:(t0.clientY+t1.clientY)/2,startOX:cur.x,startOY:cur.y,totalMove:0});
    } else if (e.touches.length===1 && G.current.mode==="idle") {
      Object.assign(G.current,{mode:"pan",startTX:e.touches[0].clientX,startTY:e.touches[0].clientY,prevTX:e.touches[0].clientX,prevTY:e.touches[0].clientY,startOX:cur.x,startOY:cur.y,velX:0,velY:0,totalMove:0});
    }
  },[]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const vp = viewportRef.current; if (!vp) return;
    const vpW=vp.clientWidth, vpH=vp.clientHeight;
    if (e.touches.length===2 && G.current.mode==="pinch") {
      e.preventDefault();
      const [t0,t1]=[e.touches[0],e.touches[1]];
      const dist = Math.hypot(t1.clientX-t0.clientX,t1.clientY-t0.clientY);
      const s = Math.max(MIN_S,Math.min(MAX_S, G.current.startScale*(dist/G.current.startDist)));
      const r = s/G.current.startScale;
      applyTF(clamp(s, G.current.startCX-r*(G.current.startCX-G.current.startOX), G.current.startCY-r*(G.current.startCY-G.current.startOY), vpW, vpH));
      G.current.totalMove+=1;
    } else if (e.touches.length===1 && G.current.mode==="pan") {
      const tx=e.touches[0].clientX, ty=e.touches[0].clientY;
      G.current.velX=tx-G.current.prevTX; G.current.velY=ty-G.current.prevTY;
      G.current.prevTX=tx; G.current.prevTY=ty;
      const dx=tx-G.current.startTX, dy=ty-G.current.startTY;
      G.current.totalMove=Math.hypot(dx,dy);
      applyTF(clamp(tfRef.current.scale, G.current.startOX+dx, G.current.startOY+dy, vpW, vpH));
    }
  },[applyTF]);

  const onTouchEnd = useCallback(() => {
    // Swipe impulse — push nodes near touch path
    if (G.current.mode==="pan" && G.current.totalMove>12) {
      const {velX,velY,prevTX,prevTY} = G.current;
      const speed = Math.hypot(velX,velY);
      if (speed>1.5) {
        const tf = tfRef.current;
        const fx=(prevTX-tf.x)/tf.scale, fy=(prevTY-tf.y)/tf.scale;
        const fvx=(velX/tf.scale)*0.45, fvy=(velY/tf.scale)*0.45;
        BP.current.forEach((p,i) => {
          const d=Math.hypot(fx-BUBBLES[i].rx, fy-BUBBLES[i].ry);
          if (d<260) { const str=(1-d/260)*2.2; p.vx+=fvx*str; p.vy+=fvy*str; }
        });
        (Object.keys(HUBS) as HubId[]).forEach(id => {
          const h=HUBS[id], d=Math.hypot(fx-h.x,fy-h.y);
          if (d<320) { const str=(1-d/320)*1.3; HP.current[id].vx+=fvx*str; HP.current[id].vy+=fvy*str; }
        });
      }
    }
    G.current.mode="idle";
  },[]);

  // ── Render ────────────────────────────────────────────────────────────────
  const countCat = (id:HubId) => BUBBLES.filter(b=>b.cat===id).length;

  return (
    <main className="flex flex-col pt-safe" style={{height:"100dvh",background:"#060810"}}>
      {/* Header */}
      <header className="flex items-center px-6 pt-10 pb-3 flex-shrink-0">
        <Link href="/" className="text-white/30 text-sm tracking-widest uppercase hover:text-white/60 transition-colors">← Back</Link>
        <span className="flex-1 text-center text-[11px] tracking-[0.35em] uppercase font-semibold" style={{color:"rgba(240,180,60,0.6)"}}>RTHMIC</span>
        <span className="text-white/15 text-[11px]">{tracks.length}</span>
      </header>

      {/* Category chips */}
      <div className="flex-shrink-0 px-4 pb-3 flex gap-2 overflow-x-auto" style={{WebkitOverflowScrolling:"touch",scrollbarWidth:"none"}}>
        <Chip label="All" color="#aaa" active={filter==="all"} onClick={()=>setFilter("all")} />
        {(Object.entries(HUBS) as [HubId,typeof HUBS[HubId]][]).map(([id,h])=>(
          <Chip key={id} label={h.label} color={h.color} active={filter===id} onClick={()=>setFilter(f=>f===id?"all":id)} />
        ))}
      </div>

      <p className="px-6 pb-2 flex-shrink-0 text-[10px] tracking-wide" style={{color:"rgba(255,255,255,0.17)"}}>
        Pinch · Drag · Swipe to scatter · Tap to play
      </p>

      {/* Viewport */}
      <div ref={viewportRef} className="flex-1 overflow-hidden relative"
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        style={{touchAction:"none"}}>

        {/* Ambient category glow */}
        {filter!=="all" && (
          <div className="absolute inset-0 pointer-events-none transition-all duration-700"
            style={{background:`radial-gradient(ellipse at 50% 45%, ${HUBS[filter].color}10 0%, transparent 60%)`}} />
        )}

        {/* Field — transform controlled by rAF */}
        <div ref={fieldRef} style={{position:"absolute",top:0,left:0,width:FW,height:FH,transformOrigin:"0 0",willChange:"transform"}}>

          {/* SVG connector lines (memoised, rAF owns DOM) */}
          <Lines handles={lineHandles.current} />

          {/* Center RTHMIC node */}
          <div ref={centerEl} style={{position:"absolute",width:60,height:60,left:CENTER.x-30,top:CENTER.y-30}}>
            <div className="w-full h-full rounded-full flex items-center justify-center"
              style={{background:"radial-gradient(circle,rgba(240,180,60,0.13) 0%,rgba(6,8,15,0.95) 70%)",border:"1px solid rgba(240,180,60,0.32)",boxShadow:"0 0 28px rgba(240,180,60,0.2),0 0 72px rgba(240,180,60,0.06)"}}>
              <span style={{fontSize:7,letterSpacing:"0.2em",color:"rgba(240,180,60,0.72)",fontWeight:600,textTransform:"uppercase"}}>RTHMIC</span>
            </div>
          </div>

          {/* Hub nodes */}
          {(Object.entries(HUBS) as [HubId,typeof HUBS[HubId]][]).map(([id,h])=>{
            const sel = filter===id;
            return (
              <button key={id}
                ref={el=>{hubEls.current[id]=el; if(el){el.style.left=`${h.x-39}px`;el.style.top=`${h.y-39}px`;}}}
                onTouchEnd={()=>{if(isTap())setFilter(f=>f===id?"all":id);}}
                style={{position:"absolute",width:78,height:78,touchAction:"none",zIndex:15,background:"none",border:"none",padding:0,cursor:"pointer"}}>
                <div className="w-full h-full rounded-full flex flex-col items-center justify-center gap-0.5 transition-all duration-300"
                  style={{
                    background:sel?`radial-gradient(circle,${h.color}25 0%,rgba(6,8,15,0.96) 72%)`:"rgba(10,13,24,0.9)",
                    border:`1px solid ${h.color}${sel?"55":"2a"}`,
                    boxShadow:sel?`0 0 36px ${h.color}42,0 0 90px ${h.color}12,inset 0 0 24px ${h.color}0a`:`0 0 16px ${h.color}20`,
                  }}>
                  <CatIcon id={id} color={h.color} size={18}/>
                  <span style={{fontSize:7.5,color:"rgba(255,255,255,0.68)",fontWeight:500,lineHeight:1,marginTop:2}}>{h.label}</span>
                  <span style={{fontSize:6.5,color:"rgba(255,255,255,0.28)",lineHeight:1}}>{countCat(id)}</span>
                </div>
              </button>
            );
          })}

          {/* Track bubbles */}
          {BUBBLES.map((b,i)=>{
            const h = HUBS[b.cat];
            const active = currentTrackId===b.id;
            const playing = active && isPlaying;
            const loading = loadingId===b.id;
            return (
              <button key={b.id}
                ref={el=>{bubbleEls.current[i]=el; if(el){el.style.left=`${b.rx-b.size/2}px`;el.style.top=`${b.ry-b.size/2}px`;}}}
                onTouchEnd={()=>{if(isTap())handlePlay(b.id,b.audioKey);}}
                style={{position:"absolute",width:b.size,height:b.size,touchAction:"none",zIndex:active?12:2,background:"none",border:"none",padding:0,cursor:"pointer"}}>
                <div className="w-full h-full rounded-full flex items-center justify-center transition-all duration-300"
                  style={{
                    background:active?`radial-gradient(circle,${h.color}2c 0%,rgba(8,10,20,0.94) 75%)`:"rgba(10,13,24,0.82)",
                    border:`1px solid ${h.color}${active?"52":"1e"}`,
                    boxShadow:active?`0 0 24px ${h.color}4e,0 0 58px ${h.color}18`:`0 0 8px ${h.color}18`,
                    transform:active?"scale(1.2)":"scale(1)",
                  }}>
                  {loading&&<SpinIcon size={13}/>}
                  {playing&&!loading&&<WaveIcon/>}
                </div>
                <p ref={el=>{labelEls.current[i]=el;}}
                  style={{position:"absolute",top:"100%",marginTop:3,left:"50%",transform:"translateX(-50%)",fontSize:8,lineHeight:1.2,textAlign:"center",width:b.size+18,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:active?"rgba(255,255,255,0.82)":"rgba(255,255,255,0.28)",pointerEvents:"none",opacity:0,transition:"opacity 0.2s"}}>
                  {b.title}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
function Chip({label,color,active,onClick}:{label:string;color:string;active:boolean;onClick:()=>void}) {
  return (
    <button onClick={onClick} className="flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-medium tracking-wide border transition-all duration-200 touch-manipulation"
      style={{background:active?`${color}1a`:"rgba(255,255,255,0.03)",borderColor:active?`${color}50`:"rgba(255,255,255,0.1)",color:active?color:"rgba(255,255,255,0.38)",boxShadow:active?`0 0 14px ${color}22`:"none"}}>
      {label}
    </button>
  );
}

function CatIcon({id,color,size}:{id:HubId;color:string;size:number}) {
  const p={width:size,height:size,viewBox:"0 0 20 20",fill:"none" as const};
  if (id==="morning") return (
    <svg {...p}><circle cx="10" cy="10" r="3.8" fill={color} opacity="0.9"/>{[0,45,90,135,180,225,270,315].map((deg,i)=>{const r=deg*Math.PI/180;return<line key={i} x1={10+6*Math.cos(r)} y1={10+6*Math.sin(r)} x2={10+8.4*Math.cos(r)} y2={10+8.4*Math.sin(r)} stroke={color} strokeWidth="1.4" strokeLinecap="round"/>;})}</svg>
  );
  if (id==="start") return (<svg {...p}><path d="M11.5 2L5 11.5h6L9 18l10-12h-7z" fill={color} opacity="0.9"/></svg>);
  if (id==="focus") return (<svg {...p}><circle cx="10" cy="10" r="7" stroke={color} strokeWidth="1.4"/><circle cx="10" cy="10" r="3.2" stroke={color} strokeWidth="1.4"/><circle cx="10" cy="10" r="1" fill={color}/></svg>);
  if (id==="shows") return (<svg {...p}><path d="M10 2l2.5 5.2h5.5l-4.4 3.2 1.7 5.3L10 12.5l-5.3 3.2 1.7-5.3L2 7.2h5.5z" fill={color} opacity="0.9"/></svg>);
  return (<svg {...p}><path d="M1.5 10 Q4 4.5 7 10 Q10 15.5 13 10 Q16 4.5 18.5 10" stroke={color} strokeWidth="1.8" strokeLinecap="round" fill="none"/></svg>);
}

function WaveIcon() {
  return <div className="flex items-end gap-[2px] h-3">{[1,2,3].map(i=><span key={i} className="w-[2px] bg-white/70 rounded-full animate-wave" style={{animationDelay:`${i*0.15}s`}}/>)}</div>;
}
function SpinIcon({size}:{size:number}) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="text-white/50 animate-spin"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="20 18"/></svg>;
}
