(function(root){
 'use strict';
 function read(k){try{return localStorage.getItem(k)}catch(_){return null}}
 function save(k,v){try{localStorage.setItem(k,v)}catch(_){}}
 let enabled=read('songen_sound')!=='off';const saved=read('songen_volume');let volume=saved!==null&&saved.trim()!==''&&Number.isFinite(+saved)&&+saved>=0&&+saved<=1?+saved:.35;
 let context=null;const active=new Set();const last=new Map();
 const cues={select:[440,.035],start:[660,.12],attack:[180,.045],guard:[300,.06],hit:[100,.06],break:[80,.12],win:[880,.22],loss:[160,.2],warning:[540,.08]};
 function release(n,stop=true){active.delete(n);if(n.osc)n.osc.onended=null;if(stop){try{n.osc?.stop()}catch(_){}}try{n.osc?.disconnect()}catch(_){}try{n.gain?.disconnect()}catch(_){}}
 function clear(){for(const n of [...active])release(n);last.clear()}
 function unlock(){if(!enabled||volume===0||document.hidden)return;try{
  if(context&&context.state==='closed'){clear();context.onstatechange=null;context=null}
  if(!context){const C=root.AudioContext||root.webkitAudioContext;if(!C)return;context=new C();const created=context;created.onstatechange=()=>{if(context===created&&created.state!=='running')clear()}}
  if(context.state==='suspended'||context.state==='interrupted'){clear();Promise.resolve(context.resume()).catch(()=>{})}
 }catch(_){}}
 function play(kind){if(!enabled||volume===0||document.hidden||!context||context.state!=='running'||active.size>=6)return;
  const now=context.currentTime;if(now-(last.get(kind)??-100)<.08)return;last.set(kind,now);
  const n={osc:null,gain:null};
  try{const [hz,duration]=cues[kind]||cues.select;n.osc=context.createOscillator();n.gain=context.createGain();const {osc,gain}=n;osc.type='sine';osc.frequency.value=hz;gain.gain.setValueAtTime(volume*.12,now);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);osc.connect(gain);gain.connect(context.destination);active.add(n);osc.onended=()=>release(n,false);osc.start(now);osc.stop(now+duration)}catch(_){release(n)}}

 function setEnabled(v){enabled=!!v;save('songen_sound',enabled?'on':'off');if(!enabled)clear();else unlock()}
 function setVolume(v){const n=Number(v);if(!Number.isFinite(n)||n<0||n>1)return;volume=n;save('songen_volume',String(n));clear();if(n>0)unlock()}
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clear()});root.addEventListener('pagehide',clear);
 root.SongenAudio={unlock,play,clear,setEnabled,setVolume,get enabled(){return enabled},get volume(){return volume}};
})(globalThis);
