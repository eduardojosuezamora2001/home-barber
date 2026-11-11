// Motor de la presentación: pasos por lámina, notas, reloj, encuestas, temporizador y ganchos por lámina
(()=>{
const stage=document.getElementById('stage');
const slides=[...document.querySelectorAll('.slide')];
const BLOCKS=(document.body.dataset.blocks||'').split('|');
let idx=0, step=0, t0=Date.now();
const fit=()=>{const s=Math.min(innerWidth/1600,innerHeight/900);stage.style.transform=`translate(-50%,-50%) scale(${s})`;};
addEventListener('resize',fit);fit();

const maxStep=s=>Math.max(0,...[...s.querySelectorAll('[data-s]')].map(e=>+e.dataset.s));
const fmt=(v,d=0)=>{const t=Math.abs(v).toFixed(d).split('.');return (v<0?'−':'')+t[0].replace(/\B(?=(\d{3})+(?!\d))/g,'.')+(d?','+t[1]:'');};
window.fmt=fmt;
function countUp(el){
  el.querySelectorAll('.count').forEach(c=>{
    const to=+c.dataset.to,from=+(c.dataset.from||0),d=+(c.dataset.dec||0),pre=c.dataset.pre||'',suf=c.dataset.suf||'',st=performance.now(),dur=+(c.dataset.dur||900);
    const tick=n=>{const k=Math.min(1,(n-st)/dur),e=1-Math.pow(1-k,3);c.textContent=pre+fmt(from+(to-from)*e,d)+suf;if(k<1)requestAnimationFrame(tick)};
    requestAnimationFrame(tick);
  });
}
const HOOKS=window.HOOKS||(window.HOOKS={});
function render(){
  slides.forEach((s,i)=>s.classList.toggle('active',i===idx));
  const s=slides[idx];
  s.querySelectorAll('[data-s]').forEach(el=>{
    const n=+el.dataset.s,on=step>=n,gone=el.dataset.until&&step>+el.dataset.until;
    if(on&&!el.classList.contains('on')){el.classList.add('on');countUp(el);}
    else if(!on) el.classList.remove('on');
    el.classList.toggle('gone',!!gone);
  });
  (s.dataset.hook||'').split(' ').filter(Boolean).forEach(h=>HOOKS[h]&&HOOKS[h](s,step));
  document.getElementById('pos').textContent=`${idx+1}/${slides.length}`;
  const b=+s.dataset.block;document.getElementById('blkName').textContent=BLOCKS[b]||'';
  [...document.querySelectorAll('#blocks .blk i')].forEach((el,i)=>{const inB=slides.filter(x=>+x.dataset.block===i);const done=inB.filter(x=>slides.indexOf(x)<=idx).length;el.style.width=(inB.length?done/inB.length*100:0)+'%';});
  document.getElementById('notes').innerHTML=(s.querySelector('.notes')?.innerHTML||'')+`<br><br><span style="opacity:.6">Minuto planeado: ${s.dataset.min} · paso ${step}/${maxStep(s)}</span>`;
  try{sessionStorage.setItem('pos-'+document.title,JSON.stringify([idx,step]))}catch(e){}
}
window.__render=render;
function next(){if(step<maxStep(slides[idx]))step++;else if(idx<slides.length-1){idx++;step=0;}render();}
function prev(){if(step>0)step--;else if(idx>0){idx--;step=maxStep(slides[idx]);}render();}
window.__goto=(n,st)=>{idx=Math.max(0,Math.min(n-1,slides.length-1));step=st==null?maxStep(slides[idx]):st;render();};

const bw=document.getElementById('blocks');BLOCKS.forEach(()=>{const d=document.createElement('div');d.className='blk';d.innerHTML='<i></i>';bw.appendChild(d)});
setInterval(()=>{const m=(Date.now()-t0)/60000,c=document.getElementById('clock');const plan=+slides[idx].dataset.min;
  c.textContent=`${String(Math.floor(m)).padStart(2,'0')}:${String(Math.floor((m%1)*60)).padStart(2,'0')} · plan ${plan}′`;c.classList.toggle('late',m>plan+4);},1000);

// encuestas: clic suma un voto, Shift+clic resta; teclas 1-4 suman, Shift+número resta, 0 borra
const votes={};
function drawPoll(p){const id=p.dataset.poll,opts=[...p.querySelectorAll('.opt')],v=votes[id]||(votes[id]=opts.map(()=>0)),tot=v.reduce((a,b)=>a+b,0);
  opts.forEach((o,i)=>{const pct=tot?Math.round(v[i]/tot*100):0;o.querySelector('.fill').style.width=pct+'%';o.querySelector('.pc').textContent=pct+'%';o.title=v[i]+' votos';});}
document.querySelectorAll('.poll').forEach(p=>{p.querySelectorAll('.opt').forEach((o,i)=>o.addEventListener('click',e=>{e.stopPropagation();const v=votes[p.dataset.poll]||(votes[p.dataset.poll]=[...p.querySelectorAll('.opt')].map(()=>0));v[i]=Math.max(0,v[i]+(e.shiftKey?-1:1));drawPoll(p);}));drawPoll(p);});
function pollKey(n,neg){const p=slides[idx].querySelector('.poll');if(!p)return;const len=p.querySelectorAll('.opt').length,v=votes[p.dataset.poll]||(votes[p.dataset.poll]=Array(len).fill(0));
  if(n===0)v.fill(0);else if(n<=len)v[n-1]=Math.max(0,v[n-1]+(neg?-1:1));drawPoll(p);}

// temporizador
let tmr=null;
HOOKS.timer=(s,st)=>{const t=s.querySelector('.timer');if(!t)return;const on=t.classList.contains('on');
  if(on&&!tmr){const tot=+t.dataset.timer,start=Date.now(),ring=t.querySelector('.ring'),lab=t.querySelector('.t');
    tmr=setInterval(()=>{const left=Math.max(0,tot-(Date.now()-start)/1000);lab.textContent=`${Math.floor(left/60)}:${String(Math.floor(left%60)).padStart(2,'0')}`;ring.style.strokeDashoffset=402*(1-left/tot);if(left<=0){clearInterval(tmr);}},250);}
  if(!on){if(tmr){clearInterval(tmr);tmr=null;}const tot=+t.dataset.timer,ring=t.querySelector('.ring'),lab=t.querySelector('.t');if(lab)lab.textContent=`${Math.floor(tot/60)}:${String(tot%60).padStart(2,'0')}`;if(ring)ring.style.strokeDashoffset=0;}};

addEventListener('keydown',e=>{
  const k=e.key;
  if(['ArrowRight','PageDown',' ','Enter'].includes(k)){e.preventDefault();next();}
  else if(['ArrowLeft','PageUp','Backspace'].includes(k)){e.preventDefault();prev();}
  else if(k==='n'||k==='N'){const n=document.getElementById('notes');n.hidden=!n.hidden;}
  else if(k==='h'||k==='H'){document.getElementById('hud').classList.toggle('hide');}
  else if(k==='?'){const h=document.getElementById('help');h.hidden=!h.hidden;}
  else if(k==='t'||k==='T'){t0=Date.now();}
  else if(k==='f'||k==='F'){(document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()).catch(()=>{});}
  else if(e.code&&/^Digit[0-4]$/.test(e.code)){pollKey(+e.code.slice(-1),e.shiftKey);}
});
document.getElementById('bNext').onclick=next;document.getElementById('bPrev').onclick=prev;
document.getElementById('bNotes').onclick=()=>{const n=document.getElementById('notes');n.hidden=!n.hidden;};
document.getElementById('bHelp').onclick=()=>{const h=document.getElementById('help');h.hidden=!h.hidden;};
// ocultar todo cuando no se mueve el mouse un rato
document.body.classList.add('idle');let idle;addEventListener('mousemove',()=>{document.body.classList.remove('idle');clearTimeout(idle);idle=setTimeout(()=>document.body.classList.add('idle'),2500);});

Object.values(HOOKS).forEach(h=>h.init&&h.init());
try{const sp=JSON.parse(sessionStorage.getItem('pos-'+document.title)||'null');if(sp){idx=Math.min(sp[0],slides.length-1);step=sp[1];}}catch(e){}
const hm=/^#s(\d+)$/.exec(location.hash);if(hm){idx=Math.min(+hm[1]-1,slides.length-1);step=maxStep(slides[idx]);}
render();
})();
