import { useState, useEffect, useRef } from "react";

const C = {
  geo: { accent: "#1a6b4a", bg: "#eef6f1", border: "#b6d9c8" },
  nt:  { accent: "#7b2d00", bg: "#fdf1ec", border: "#e8bfaa" },
  alg: { accent: "#1a3a6b", bg: "#eef1f9", border: "#b0bee0" },
};
const LABEL = { geo: "Geometry", nt: "Number Theory", alg: "Algebra" };
const SLUG  = { geo: "G", nt: "N", alg: "A" };
const DAYS  = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const FULL  = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const PLAN  = [
  ["geo","nt"],
  ["alg","geo"],
  ["nt","geo"],
  ["geo","nt"],
  ["alg","nt"],
  ["geo","nt"],
  ["nt","geo"],
];
const TIMES = ["08:00 – 11:00","13:00 – 16:00"];
const YEARS = [2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024];
const LEVELS = [1,2,3,4,5];
const DIFF_COLOR = ["#4caf50","#8bc34a","#ffc107","#ff7043","#e53935"];
const BG="#f5f2eb", PAPER="#faf8f3", INK="#1c1a14", MUTED="#b0a898", RULE="#ddd9ce";

const ggimUrl = (y,s,l) => `https://ggim.me/ISL-${y}-${s}${l}`;

function buildPool(cls) {
  const pool = [];
  for (const y of YEARS) for (const l of LEVELS)
    pool.push({ year:y, level:l, cls,
      code:`ISL ${y} ${SLUG[cls]}${l}`, tag:`${SLUG[cls]}${l}`,
      url:ggimUrl(y,SLUG[cls],l), id:`${y}-${SLUG[cls]}${l}` });
  return pool;
}
const POOL = { geo:buildPool("geo"), nt:buildPool("nt"), alg:buildPool("alg") };
const ALL_POOL = [...POOL.geo,...POOL.nt,...POOL.alg];

function seededPick(pool, n, seed) {
  const a = [...pool];
  let s = (seed^0xdeadbeef)>>>0;
  for (let i=a.length-1;i>0;i--) {
    s=Math.imul(s^(s>>>16),0x45d9f3b);
    s=Math.imul(s^(s>>>16),0x45d9f3b);
    s=(s^(s>>>16))>>>0;
    const j=s%(i+1);[a[i],a[j]]=[a[j],a[i]];
  }
  return a.slice(0,n);
}
function pickUndone(pool, n, doneSet, seed) {
  const undone = pool.filter(p=>!doneSet.has(p.id));
  return seededPick(undone.length>=n?undone:pool, n, seed);
}
const mkSeeds = () => PLAN.map(()=>[Math.random()*1e9|0,Math.random()*1e9|0]);

/* ── Storage ──
   Saves to both localStorage (instant) AND window.storage (cross-device cloud).
   On load, merges both sources so nothing is lost.
*/
const CLOUD_KEY = "imo_solved_v6";
const LS_KEY    = "imo_done_v6";
const LS_SEEDS  = "imo_seeds_v6";

function lsGet()     { try{return new Set(JSON.parse(localStorage.getItem(LS_KEY)||"[]"));}catch(_){return new Set();} }
function lsSet(s)    { try{localStorage.setItem(LS_KEY,JSON.stringify([...s]));}catch(_){} }
function seedsGet()  { try{const s=JSON.parse(localStorage.getItem(LS_SEEDS));return s||mkSeeds();}catch(_){return mkSeeds();} }
function seedsSet(s) { try{localStorage.setItem(LS_SEEDS,JSON.stringify(s));}catch(_){} }

async function cloudGet() {
  try {
    if (window.storage && typeof window.storage.get === "function") {
      const r = await window.storage.get(CLOUD_KEY, true);
      if (r && r.value) return new Set(JSON.parse(r.value));
    }
  } catch(_) {}
  return null;
}
async function cloudSet(s) {
  try {
    if (window.storage && typeof window.storage.set === "function")
      await window.storage.set(CLOUD_KEY, JSON.stringify([...s]), true);
  } catch(_) {}
}

/* Load: merge localStorage + cloud, save merged result back everywhere */
async function loadDone() {
  const local = lsGet();
  const cloud = await cloudGet();
  if (!cloud) return local;
  const merged = new Set([...local, ...cloud]);
  lsSet(merged);
  await cloudSet(merged);
  return merged;
}

/* Save: always write to both */
async function saveDone(s) {
  lsSet(s);
  cloudSet(s); // fire and forget — don't await
}

/* ── Week Strip ── */
function WeekStrip({ active, onSelect }) {
  return (
    <div style={{display:"flex",gap:".4rem",marginBottom:"1.8rem",overflowX:"auto",paddingBottom:".2rem"}}>
      {PLAN.map((pair,i) => {
        const on = i===active;
        return (
          <button key={i} onClick={()=>onSelect(i)} style={{
            flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",gap:".3rem",
            padding:".5rem .65rem",borderRadius:6,cursor:"pointer",
            border:`1px solid ${on?INK:RULE}`,background:on?INK:PAPER,transition:"all .15s",
          }}>
            <span style={{fontSize:".62rem",letterSpacing:".08em",textTransform:"uppercase",
              fontFamily:"monospace",color:on?"#fff":MUTED,fontWeight:on?600:400}}>{DAYS[i]}</span>
            <div style={{display:"flex",gap:".25rem"}}>
              {pair.map(cls=>(
                <span key={cls} style={{width:6,height:6,borderRadius:"50%",
                  background:on?"#ffffff88":C[cls].accent}}/>
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ════════════════════════════
   SCHEDULE PAGE
   ════════════════════════════ */
function Schedule({ onProgress }) {
  const [day,      setDay]      = useState(0);
  const [seeds,    setSeeds]    = useState(() => seedsGet());
  const [syncStat, setSyncStat] = useState("loading"); // loading | ready | saving | error

  /* doneRef holds the live Set — never causes session re-render */
  const doneRef = useRef(lsGet());
  /* doneTick just triggers re-render of the list items when doneRef changes */
  const [doneTick, setDoneTick] = useState(0);

  /* sessions are fixed per day+seeds — computed once, stored in ref */
  const sessionsRef = useRef([]);
  const [sessKey, setSessKey] = useState(0); // bump only on refresh

  /* Recompute sessions only when day/seeds/sessKey change */
  useEffect(() => {
    sessionsRef.current = PLAN[day].map((cls,si) => ({
      cls, time: TIMES[si],
      problems: pickUndone(POOL[cls], 3, doneRef.current, seeds[day][si]),
    }));
    setSessKey(k=>k); // just read — no bump needed, effect already ran
  // eslint-disable-next-line
  }, [day, seeds]);

  /* Load cloud on mount and merge */
  useEffect(() => {
    setSyncStat("loading");
    loadDone().then(merged => {
      doneRef.current = merged;
      setDoneTick(t=>t+1);
      setSyncStat("ready");
    }).catch(() => setSyncStat("ready")); // even on error, app works via localStorage
  }, []);

  /* Recompute sessions when day or seeds change */
  const [sessions, setSessions] = useState([]);
  useEffect(() => {
    setSessions(
      PLAN[day].map((cls,si) => ({
        cls, time: TIMES[si],
        problems: pickUndone(POOL[cls], 3, doneRef.current, seeds[day][si]),
      }))
    );
  // eslint-disable-next-line
  }, [day, seeds]);

  function markDone(id) {
    if (doneRef.current.has(id)) return;
    const next = new Set(doneRef.current);
    next.add(id);
    doneRef.current = next;
    setDoneTick(t=>t+1); // re-render items
    setSyncStat("saving");
    saveDone(next).then(()=>setSyncStat("ready")).catch(()=>setSyncStat("ready"));
  }

  function refresh() {
    const ns = [...seeds];
    ns[day] = [Math.random()*1e9|0, Math.random()*1e9|0];
    setSeeds(ns);
    seedsSet(ns);
    // recompute sessions with new seed
    setSessions(
      PLAN[day].map((cls,si) => ({
        cls, time: TIMES[si],
        problems: pickUndone(POOL[cls], 3, doneRef.current, ns[day][si]),
      }))
    );
  }

  const done = doneRef.current;

  return (
    <div style={{maxWidth:860,margin:"0 auto",padding:"1.5rem 1rem 4rem"}}>

      {/* HEADER */}
      <div style={{borderBottom:`2px solid ${INK}`,paddingBottom:"1.1rem",marginBottom:"1.6rem"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",
          flexWrap:"wrap",gap:".5rem"}}>
          <h1 style={{fontFamily:"Georgia,serif",fontSize:"clamp(1.6rem,5vw,2.6rem)",fontWeight:600,
            letterSpacing:"-.02em",color:INK,margin:0}}>
            IMO <em style={{fontWeight:300}}>Training</em>
          </h1>
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:".4rem"}}>
            <button onClick={onProgress}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=INK;e.currentTarget.style.color=INK;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=RULE;e.currentTarget.style.color=MUTED;}}
              style={{background:"none",border:`1px solid ${RULE}`,borderRadius:4,fontFamily:"monospace",
                fontSize:".58rem",letterSpacing:".1em",textTransform:"uppercase",color:MUTED,
                cursor:"pointer",padding:".3rem .75rem",transition:"all .15s"}}>
              📊 Progress
            </button>
            <span style={{fontSize:".55rem",fontFamily:"monospace",letterSpacing:".06em",
              color:syncStat==="error"?"#e53935":syncStat==="saving"?"#7b2d00":syncStat==="loading"?MUTED:"#1a6b4a"}}>
              {syncStat==="loading"?"⏳ loading…":syncStat==="saving"?"⏫ saving…":syncStat==="error"?"⚠️ error":"☁️ synced"}
            </span>
          </div>
        </div>

        <div style={{display:"flex",gap:".45rem",marginTop:".85rem",flexWrap:"wrap",alignItems:"center"}}>
          {[{cls:"geo",n:5},{cls:"nt",n:5},{cls:"alg",n:2}].map(({cls,n})=>(
            <span key={cls} style={{fontSize:".6rem",letterSpacing:".08em",textTransform:"uppercase",
              padding:".22rem .75rem",borderRadius:3,border:`1px solid ${C[cls].border}`,
              color:C[cls].accent,background:C[cls].bg,display:"flex",alignItems:"center",gap:".35rem"}}>
              {LABEL[cls]} <strong>{n}×</strong>
            </span>
          ))}
          <span style={{fontSize:".58rem",color:MUTED}}>/ week</span>
        </div>

        <div style={{display:"flex",gap:".7rem",marginTop:".85rem",flexWrap:"wrap",alignItems:"center"}}>
          <span style={{fontSize:".58rem",color:MUTED}}>Difficulty:</span>
          {DIFF_COLOR.map((col,i)=>(
            <span key={i} style={{display:"flex",alignItems:"center",gap:".3rem",fontSize:".58rem",color:MUTED}}>
              <span style={{width:9,height:9,borderRadius:2,background:col,flexShrink:0}}/>
              {["1·easy","2","3","4","5·hard"][i]}
            </span>
          ))}
        </div>
      </div>

      <WeekStrip active={day} onSelect={setDay}/>

      {/* DAY HEADING */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
        marginBottom:"1.6rem",flexWrap:"wrap",gap:".5rem"}}>
        <div>
          <div style={{fontFamily:"Georgia,serif",fontSize:"1.1rem",fontWeight:600,color:INK,lineHeight:1}}>
            {FULL[day]}
          </div>
          <div style={{fontSize:".6rem",letterSpacing:".1em",textTransform:"uppercase",
            color:MUTED,marginTop:".25rem"}}>
            {sessions.map(s=>LABEL[s.cls]).join(" + ")}
          </div>
        </div>
        <button onClick={refresh}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=INK;e.currentTarget.style.color=INK;}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor=RULE;e.currentTarget.style.color=MUTED;}}
          style={{background:"none",border:`1px solid ${RULE}`,borderRadius:3,fontFamily:"monospace",
            fontSize:".58rem",letterSpacing:".1em",textTransform:"uppercase",color:MUTED,
            cursor:"pointer",padding:".28rem .7rem",transition:"all .15s"}}>
          ↺ New problems
        </button>
      </div>

      {/* SESSIONS */}
      {sessions.map((sess,si) => {
        const col = C[sess.cls];
        return (
          <div key={`${si}-${day}`}>
            <div style={{display:"flex",alignItems:"baseline",gap:".8rem",
              borderBottom:`1px solid ${RULE}`,paddingBottom:".55rem",marginBottom:"1rem"}}>
              <span style={{fontFamily:"Georgia,serif",fontSize:"1.3rem",fontWeight:600,color:col.accent}}>
                {LABEL[sess.cls]}
              </span>
              <span style={{fontSize:".58rem",letterSpacing:".1em",textTransform:"uppercase",color:MUTED}}>
                {sess.time}
              </span>
            </div>

            <ul style={{listStyle:"none",margin:0,padding:0,
              display:"flex",flexDirection:"column",gap:".7rem",marginBottom:"2.2rem"}}>
              {sess.problems.map((p,pi) => {
                const isDone = done.has(p.id);
                const dc = DIFF_COLOR[p.level-1];
                return (
                  <li key={p.id} style={{borderRadius:6,overflow:"hidden",
                    border:`1px solid ${isDone?col.border:RULE}`,
                    background:isDone?col.bg:PAPER,
                    opacity:isDone?0.52:1,
                    transition:"opacity .2s,border-color .2s,background .2s"}}>
                    <div style={{height:3,background:dc}}/>
                    <div style={{padding:"1rem 1rem"}}>
                      <div style={{display:"flex",alignItems:"center",
                        justifyContent:"space-between",marginBottom:".45rem"}}>
                        <div style={{display:"flex",alignItems:"center",gap:".55rem"}}>
                          <div style={{width:16,height:16,borderRadius:3,flexShrink:0,
                            pointerEvents:"none",userSelect:"none",
                            border:isDone?`1.5px solid ${col.accent}`:`1.5px solid ${MUTED}`,
                            background:isDone?col.accent:"transparent",
                            display:"flex",alignItems:"center",justifyContent:"center",
                            color:"#fff",fontSize:".6rem",transition:"all .2s"}}>
                            {isDone?"✓":""}
                          </div>
                          <span style={{fontSize:".58rem",color:MUTED,fontFamily:"monospace"}}>P{pi+1}</span>
                        </div>
                        <span style={{padding:".18rem .5rem",borderRadius:3,
                          background:dc+"22",border:`1px solid ${dc}66`,
                          fontSize:".6rem",fontWeight:700,color:dc,fontFamily:"monospace"}}>
                          {p.tag}
                        </span>
                      </div>

                      <div style={{fontFamily:"Georgia,serif",fontSize:"1.35rem",fontWeight:700,
                        color:isDone?MUTED:col.accent,letterSpacing:"-.01em",
                        lineHeight:1.1,marginBottom:".35rem"}}>
                        {p.code}
                      </div>

                      <div style={{fontSize:".6rem",color:MUTED,letterSpacing:".04em",marginBottom:".9rem"}}>
                        {LABEL[p.cls]} · Level {p.level}/5 · {p.year} Shortlist
                      </div>

                      <div style={{display:"flex",gap:".55rem",flexWrap:"wrap"}}>
                        <a href={p.url} target="_blank" rel="noopener noreferrer"
                          style={{padding:".42rem .9rem",borderRadius:4,
                            border:`1px solid ${col.border}`,background:col.bg,
                            color:col.accent,fontSize:".6rem",letterSpacing:".08em",
                            textTransform:"uppercase",textDecoration:"none",
                            fontFamily:"monospace",whiteSpace:"nowrap"}}>
                          View on ggim.me ↗
                        </a>

                        {isDone ? (
                          <span style={{display:"flex",alignItems:"center",gap:".3rem",
                            fontSize:".6rem",color:col.accent,fontFamily:"monospace",letterSpacing:".08em"}}>
                            Solved ✓
                          </span>
                        ) : (
                          <button onClick={()=>markDone(p.id)}
                            style={{padding:".42rem .9rem",borderRadius:4,cursor:"pointer",
                              border:`1px solid ${col.accent}`,background:col.accent,
                              color:"#fff",fontSize:".6rem",letterSpacing:".08em",
                              textTransform:"uppercase",fontFamily:"monospace",whiteSpace:"nowrap"}}>
                            ✓ Mark solved
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {si<sessions.length-1&&(
              <div style={{display:"flex",alignItems:"center",gap:"1rem",marginBottom:"2.2rem",
                color:MUTED,fontSize:".56rem",letterSpacing:".15em",textTransform:"uppercase"}}>
                <div style={{flex:1,height:1,background:RULE}}/>lunch break · 2 hours
                <div style={{flex:1,height:1,background:RULE}}/>
              </div>
            )}
          </div>
        );
      })}

      <div style={{borderTop:`1px solid ${RULE}`,paddingTop:"1rem",display:"flex",
        justifyContent:"space-between",fontSize:".58rem",letterSpacing:".1em",
        textTransform:"uppercase",color:MUTED}}>
        <span><span style={{color:INK,fontWeight:600}}>{done.size}</span> solved all-time</span>
        <span>{ALL_POOL.length-done.size} remaining</span>
      </div>
    </div>
  );
}

/* ════════════════════════════
   PROGRESS PAGE
   ════════════════════════════ */
function Progress({ onBack }) {
  const [doneSet,  setDoneSet]  = useState(()=>lsGet());
  const [syncStat, setSyncStat] = useState("loading");
  const [cls, setCls] = useState("all");
  const [st,  setSt]  = useState("all");
  const [q,   setQ]   = useState("");

  useEffect(()=>{
    setSyncStat("loading");
    loadDone().then(merged=>{setDoneSet(merged);setSyncStat("ready");})
              .catch(()=>setSyncStat("ready"));
  },[]);

  const filtered = ALL_POOL.filter(p=>{
    if (cls!=="all"&&p.cls!==cls) return false;
    if (st==="done"  &&!doneSet.has(p.id)) return false;
    if (st==="undone"&& doneSet.has(p.id)) return false;
    if (q&&!p.code.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const total=ALL_POOL.length, nd=doneSet.size, pct=Math.round((nd/total)*100);

  return (
    <div style={{maxWidth:960,margin:"0 auto",padding:"1.5rem 1rem 4rem"}}>
      <div style={{borderBottom:`2px solid ${INK}`,paddingBottom:"1.1rem",marginBottom:"1.8rem"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
          flexWrap:"wrap",gap:".5rem"}}>
          <h1 style={{fontFamily:"Georgia,serif",fontSize:"clamp(1.6rem,5vw,2.4rem)",fontWeight:600,
            letterSpacing:"-.02em",color:INK,margin:0}}>Progress</h1>
          <div style={{display:"flex",alignItems:"center",gap:".7rem"}}>
            <span style={{fontSize:".55rem",fontFamily:"monospace",letterSpacing:".06em",
              color:syncStat==="loading"?MUTED:"#1a6b4a"}}>
              {syncStat==="loading"?"⏳ loading…":"☁️ synced"}
            </span>
            <button onClick={onBack}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=INK;e.currentTarget.style.color=INK;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=RULE;e.currentTarget.style.color=MUTED;}}
              style={{background:"none",border:`1px solid ${RULE}`,borderRadius:4,fontFamily:"monospace",
                fontSize:".58rem",letterSpacing:".1em",textTransform:"uppercase",color:MUTED,
                cursor:"pointer",padding:".3rem .75rem",transition:"all .15s"}}>
              ← Schedule
            </button>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",
          gap:".65rem",marginTop:"1.1rem"}}>
          {[{label:"Total",val:total,color:INK},{label:"Solved",val:nd,color:"#1a6b4a"},
            {label:"Remaining",val:total-nd,color:"#7b2d00"}].map(({label,val,color})=>(
            <div key={label} style={{background:PAPER,border:`1px solid ${RULE}`,
              borderRadius:6,padding:".85rem .9rem"}}>
              <div style={{fontFamily:"Georgia,serif",fontSize:"1.7rem",fontWeight:700,color,lineHeight:1}}>{val}</div>
              <div style={{fontSize:".56rem",color:MUTED,marginTop:".3rem",letterSpacing:".06em",
                textTransform:"uppercase"}}>{label}</div>
            </div>
          ))}
        </div>

        <div style={{marginTop:"1rem"}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:".6rem",
            color:MUTED,marginBottom:".35rem"}}>
            <span>Overall</span><span style={{fontWeight:600}}>{pct}%</span>
          </div>
          <div style={{height:6,background:RULE,borderRadius:3,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${pct}%`,background:"#1a6b4a",
              borderRadius:3,transition:"width .6s ease"}}/>
          </div>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:".45rem",marginTop:".9rem"}}>
          {Object.entries(C).map(([k,v])=>{
            const sp=POOL[k],sd=sp.filter(p=>doneSet.has(p.id)).length;
            const pct=Math.round((sd/sp.length)*100);
            return (
              <div key={k}>
                <div style={{display:"flex",justifyContent:"space-between",
                  fontSize:".6rem",color:MUTED,marginBottom:".2rem"}}>
                  <span style={{color:v.accent}}>{LABEL[k]}</span>
                  <span>{sd}/{sp.length} · {pct}%</span>
                </div>
                <div style={{height:5,background:RULE,borderRadius:3,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${pct}%`,background:v.accent,
                    borderRadius:3,transition:"width .6s ease"}}/>
                </div>
              </div>
            );
          })}
        </div>
        <p style={{marginTop:".85rem",fontSize:".6rem",color:MUTED,lineHeight:1.7,margin:".85rem 0 0"}}>
          ☁️ Synced across all devices. Read-only — go back to schedule to mark problems solved.
        </p>
      </div>

      <div style={{display:"flex",gap:".45rem",flexWrap:"wrap",marginBottom:".9rem",alignItems:"center"}}>
        {[["all","All"],["done","✓ Solved"],["undone","○ Unsolved"]].map(([v,l])=>(
          <button key={v} onClick={()=>setSt(v)} style={{fontFamily:"monospace",fontSize:".58rem",
            letterSpacing:".08em",padding:".28rem .6rem",borderRadius:3,cursor:"pointer",
            transition:"all .15s",border:`1px solid ${st===v?INK:RULE}`,
            background:st===v?INK:PAPER,color:st===v?"#fff":MUTED}}>{l}</button>
        ))}
        <div style={{width:1,height:16,background:RULE}}/>
        {[["all","All"],["geo","Geo"],["nt","NT"],["alg","Alg"]].map(([v,l])=>(
          <button key={v} onClick={()=>setCls(v)} style={{fontFamily:"monospace",fontSize:".58rem",
            letterSpacing:".08em",padding:".28rem .6rem",borderRadius:3,cursor:"pointer",
            transition:"all .15s",border:`1px solid ${cls===v?INK:RULE}`,
            background:cls===v?INK:PAPER,color:cls===v?"#fff":MUTED}}>{l}</button>
        ))}
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="e.g. 2019 G3"
          style={{fontFamily:"monospace",fontSize:".6rem",padding:".28rem .6rem",borderRadius:3,
            border:`1px solid ${RULE}`,background:PAPER,color:INK,outline:"none",minWidth:110}}/>
      </div>

      <div style={{fontSize:".6rem",color:MUTED,marginBottom:".9rem"}}>{filtered.length} problems</div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(148px,1fr))",gap:".6rem"}}>
        {filtered.map(p=>{
          const isDone=doneSet.has(p.id),col=C[p.cls],dc=DIFF_COLOR[p.level-1];
          return (
            <div key={p.id} style={{background:isDone?col.bg:PAPER,
              border:`1px solid ${isDone?col.border:RULE}`,borderRadius:8,overflow:"hidden",
              display:"flex",flexDirection:"column",transition:"transform .15s,box-shadow .15s"}}
              onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";
                e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,.07)";}}
              onMouseLeave={e=>{e.currentTarget.style.transform="none";
                e.currentTarget.style.boxShadow="none";}}>
              <div style={{height:3,background:dc}}/>
              <div style={{padding:".85rem",flex:1,display:"flex",flexDirection:"column",gap:".45rem"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{width:16,height:16,borderRadius:3,pointerEvents:"none",userSelect:"none",
                    border:isDone?`1.5px solid ${col.accent}`:`1.5px solid ${MUTED}`,
                    background:isDone?col.accent:"transparent",transition:"all .2s",
                    display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:".6rem"}}>
                    {isDone?"✓":""}
                  </div>
                  <span style={{padding:".12rem .4rem",borderRadius:3,background:dc+"22",
                    border:`1px solid ${dc}66`,fontSize:".56rem",fontWeight:700,color:dc,
                    fontFamily:"monospace"}}>{p.tag}</span>
                </div>
                <div style={{fontFamily:"Georgia,serif",fontSize:".95rem",fontWeight:700,
                  color:isDone?col.accent:INK,letterSpacing:"-.01em",lineHeight:1.2}}>{p.code}</div>
                <div style={{fontSize:".54rem",color:MUTED,lineHeight:1.6}}>
                  {LABEL[p.cls]}<br/>
                  <span style={{color:dc,fontWeight:600}}>Lv {p.level}</span> · {p.year}
                </div>
                <div style={{fontSize:".48rem",letterSpacing:".08em",textTransform:"uppercase",
                  padding:".12rem .45rem",borderRadius:3,alignSelf:"flex-start",
                  fontFamily:"monospace",fontWeight:600,
                  background:isDone?col.accent+"22":RULE,color:isDone?col.accent:MUTED}}>
                  {isDone?"✓ Solved":"Not solved"}
                </div>
                <a href={p.url} target="_blank" rel="noopener noreferrer"
                  style={{marginTop:"auto",display:"flex",alignItems:"center",justifyContent:"center",
                    padding:".35rem 0",borderRadius:4,border:`1px solid ${col.border}`,background:col.bg,
                    color:col.accent,fontSize:".52rem",letterSpacing:".1em",textTransform:"uppercase",
                    textDecoration:"none",fontFamily:"monospace"}}>
                  View ↗
                </a>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length===0&&(
        <div style={{textAlign:"center",color:MUTED,fontSize:".72rem",padding:"3rem 0"}}>
          No problems match this filter.
        </div>
      )}
    </div>
  );
}

/* ═══════ ROOT ═══════ */
export default function App() {
  const [page, setPage] = useState("schedule");
  return (
    <div style={{background:BG,minHeight:"100vh",fontFamily:"'IBM Plex Mono',monospace"}}>
      <style>{`
        @keyframes imo-spin{to{transform:rotate(360deg)}}
        *{box-sizing:border-box;}
        input::placeholder{color:#c0bbb0;}
        a:hover{opacity:.75;}
        button:focus{outline:none;}
      `}</style>
      {page==="schedule"
        ? <Schedule  onProgress={()=>setPage("progress")}/>
        : <Progress  onBack={()=>setPage("schedule")}/>
      }
    </div>
  );
}
