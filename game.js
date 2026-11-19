'use strict';
// Небольшая мобильная игра без библиотек. Работает в Safari на iPhone и Chrome на Android.
(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const ui = {hud:$('hud'),controls:$('controls'),speedBox:$('speedometer'),menu:$('menu'),over:$('gameover'),shop:$('shop'),score:$('score'),best:$('best'),wallet:$('wallet'),speed:$('speed'),meter:$('meter-fill'),toast:$('toast'),wheelieGauge:$('wheelie-gauge'),wheelieFill:$('wheelie-fill'),wheelieValue:$('wheelie-value')};
  const skins = [
    {id:'classic',name:'Классика',price:0,shirt:'#e9e9e9',helmet:'#df443b',bike:'#e13d32',bag:'#26364b'},
    {id:'neon',name:'Неон',price:20,shirt:'#c4ff42',helmet:'#ff54d5',bike:'#22d8e8',bag:'#5d328c'},
    {id:'camo',name:'Камуфляж',price:40,shirt:'#75864c',helmet:'#b8a56c',bike:'#596c3b',bag:'#35452c'},
    {id:'fire',name:'Огонь',price:60,shirt:'#ff7929',helmet:'#ffd34b',bike:'#c92d25',bag:'#542018'},
    {id:'space',name:'Космос',price:100,shirt:'#7764d6',helmet:'#69dcff',bike:'#303b91',bag:'#24204f'}
  ];
  const save = (k,v) => { try { localStorage.setItem('urod_'+k, JSON.stringify(v)); } catch (_) {} };
  const load = (k,d) => { try { const v=localStorage.getItem('urod_'+k); return v===null?d:JSON.parse(v); } catch (_) { return d; } };
  let best=load('best',0), wallet=load('wallet',0), owned=load('owned',['classic']), selected=load('selected','classic'), soundOn=load('sound',false);
  let w=innerWidth,h=innerHeight,dpr=1, state='menu', last=0, raf=0, audio=null;
  let keys={gas:false,brake:false,wheelie:false}, world, toastTimer=0;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const rand=(a,b)=>a+Math.random()*(b-a);
  const pick=a=>a[(Math.random()*a.length)|0];
  const skin=()=>skins.find(s=>s.id===selected)||skins[0];
  function resize(){
    w=Math.max(280,innerWidth); h=Math.max(320,innerHeight); dpr=Math.min(2,window.devicePixelRatio||1);
    canvas.width=Math.round(w*dpr); canvas.height=Math.round(h*dpr);
    canvas.style.width=w+'px'; canvas.style.height=h+'px'; ctx.setTransform(dpr,0,0,dpr,0,0);
    if(world){world.roadY=h*.76;world.playerX=w*.22;}
  }
  addEventListener('resize',resize,{passive:true});
  function audioInit(){if(!soundOn)return;try{const AC=window.AudioContext||window.webkitAudioContext;if(AC){audio=audio||new AC();if(audio.state==='suspended')audio.resume();}}catch(_){}}
  function beep(freq=600,dur=.09){if(!soundOn)return;audioInit();if(!audio)return;try{const o=audio.createOscillator(),g=audio.createGain();o.frequency.value=freq;g.gain.setValueAtTime(.045,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+dur);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+dur);}catch(_){}}
  function toast(t){ui.toast.textContent=t;ui.toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>ui.toast.classList.remove('show'),1100);}
  function show(which){ui.menu.classList.toggle('hidden',which!=='menu');ui.over.classList.toggle('hidden',which!=='over');ui.shop.classList.toggle('hidden',which!=='shop');const playing=which==='playing';ui.hud.classList.toggle('hidden',!playing);ui.controls.classList.toggle('hidden',!playing);ui.speedBox.classList.toggle('hidden',!playing);ui.wheelieGauge.classList.toggle('hidden',!playing);}
  function updateStats(){ui.best.textContent=best;ui.wallet.textContent=wallet;$('menu-best').textContent=best;$('menu-wallet').textContent=wallet;}
  function newGame(){
    const roadY=h*.76, start=rand(550,760), cars=[], bottles=[], scenery=[];let x=start;
    // Автомобили с заведомо большим интервалом для реакции и прыжка.
    for(let i=0;i<55;i++){cars.push({x,y:roadY-13,color:pick(['#eee9dd','#cbb99b','#456b4a','#7d2d43','#6f9db8','#858b91']),passed:false});x+=rand(690,940);}
    x=rand(250,420);for(let i=0;i<115;i++){const pattern=(Math.random()*3)|0,n=pattern===0?1:pattern===1?3:4;for(let j=0;j<n;j++)bottles.push({x:x+j*(pattern===1?46:58),y:roadY-18-(pattern===2?Math.sin(j/(n-1)*Math.PI)*78:rand(0,8)),got:false,phase:rand(0,6)});x+=rand(260,440);}
    x=0;for(let i=0;i<150;i++){scenery.push({x,kind:pick(['house','house','tree','birch','shop','lamp','shed','pole','junk','sign']),wall:pick(['#b99c78','#c7c2ae','#8faaa1','#c9b6a0','#a6aaa0']),roof:pick(['#59463e','#48505a','#75463c','#343b43']),fence:pick(['#557b59','#806246','#687887','#3f624c']),seed:Math.random()});x+=rand(135,230);}
    world={camera:0,playerX:w*.22,roadY,cars,bottles,scenery,speed:0,y:roadY-28,vy:0,air:false,wheelie:0,angle:0,distance:0,score:0,time:0,particles:[],crash:0,crashType:'',shake:0,roadOffset:0};
    keys={gas:false,brake:false,wheelie:false};ui.wheelieFill.style.width='0%';ui.wheelieValue.textContent='0°';ui.wheelieGauge.dataset.level='safe';state='playing';show('playing');updateStats();last=0;
  }
  function finish(){if(state!=='playing')return;state='over';keys={gas:false,brake:false,wheelie:false};save('wallet',wallet);best=Math.max(best,Math.floor(world.score));save('best',best);$('final-score').textContent=Math.floor(world.score);$('final-best').textContent=best;updateStats();show('over');}
  // Фон рисуется простыми слоями, но с множеством маленьких деталей деревни.
  function drawSky(){
    const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#72b6d8');g.addColorStop(.55,'#c5d9d5');g.addColorStop(1,'#e8c99e');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#fff0c2';ctx.beginPath();ctx.arc(w*.83,h*.14,Math.min(w,h)*.043,0,7);ctx.fill();
    for(let i=0;i<5;i++){const x=((i*230-world.camera*.10)%(w+280)+w+280)%(w+280)-120,y=h*(.09+(i%3)*.06);ctx.fillStyle='#ffffff75';ctx.beginPath();ctx.ellipse(x,y,35,9,0,0,7);ctx.ellipse(x+22,y-5,26,12,0,0,7);ctx.fill();}
    // дальняя лесополоса и редкие панельки
    ctx.fillStyle='#718f78';ctx.beginPath();ctx.moveTo(0,h*.49);for(let x=0;x<=w+20;x+=28)ctx.lineTo(x,h*.44+Math.sin((x+world.camera*.045)*.009)*h*.022);ctx.lineTo(w,h*.72);ctx.lineTo(0,h*.72);ctx.fill();
    for(let i=0;i<6;i++){const x=((i*180-world.camera*.16)%(w+200)+w+200)%(w+200)-80,y=h*.34+(i%2)*h*.035;ctx.fillStyle=i%2?'#87969a':'#9baba9';ctx.fillRect(x,y,62,h*.25);ctx.fillStyle='#e8d9b7';for(let yy=y+9;yy<y+h*.22;yy+=15)for(let xx=x+7;xx<x+58;xx+=14)ctx.fillRect(xx,yy,6,8);}
  }
  function drawHouse(s,x){
    const y=h*.425,sc=Math.max(.72,Math.min(1.08,w/420));ctx.save();ctx.translate(x,y);ctx.scale(sc,sc);
    // тень, фундамент, штукатурка/сайдинг
    ctx.fillStyle='#27352c55';ctx.fillRect(-4,119,148,9);ctx.fillStyle='#6d6253';ctx.fillRect(8,108,126,12);
    ctx.fillStyle=s.wall;ctx.fillRect(12,48,116,65);ctx.fillStyle='#ffffff20';for(let yy=54;yy<106;yy+=7)ctx.fillRect(14,yy,112,1);
    ctx.fillStyle=s.roof;ctx.beginPath();ctx.moveTo(0,51);ctx.lineTo(68,5);ctx.lineTo(140,51);ctx.closePath();ctx.fill();ctx.fillStyle='#ffffff24';ctx.beginPath();ctx.moveTo(68,5);ctx.lineTo(140,51);ctx.lineTo(128,51);ctx.lineTo(68,14);ctx.closePath();ctx.fill();
    // труба и дымок
    ctx.fillStyle='#655b51';ctx.fillRect(103,13,10,30);ctx.fillStyle='#8a918d';ctx.fillRect(101,11,14,4);
    const puff=(world.time*12+s.seed*50)%25;ctx.globalAlpha=.22;ctx.fillStyle='#eef0eb';ctx.beginPath();ctx.arc(110-puff*.25,5-puff,4+puff*.13,0,7);ctx.fill();ctx.globalAlpha=1;
    // окна с рамами и бликами
    for(const wx of [23,83]){ctx.fillStyle='#314650';ctx.fillRect(wx-2,63,30,32);ctx.fillStyle='#8eb9c5';ctx.fillRect(wx,65,26,28);ctx.fillStyle='#d9e8df';ctx.fillRect(wx+3,67,7,23);ctx.strokeStyle='#e8e0cf';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(wx+13,65);ctx.lineTo(wx+13,93);ctx.moveTo(wx,79);ctx.lineTo(wx+26,79);ctx.stroke();}
    ctx.fillStyle='#694b37';ctx.fillRect(55,78,19,35);ctx.fillStyle='#c4a36d';ctx.beginPath();ctx.arc(69,96,1.7,0,7);ctx.fill();
    // спутниковая тарелка, кондиционер
    ctx.strokeStyle='#777';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(119,61);ctx.lineTo(128,48);ctx.stroke();ctx.fillStyle='#d8d8d1';ctx.beginPath();ctx.ellipse(128,47,8,4,-.4,0,7);ctx.fill();ctx.fillStyle='#e4e2d9';ctx.fillRect(5,78,12,12);ctx.fillStyle='#78858a';ctx.fillRect(7,80,8,8);
    // забор с разными досками/листами профнастила
    ctx.fillStyle=s.fence;for(let xx=-8;xx<153;xx+=11){ctx.fillRect(xx,115,7,27);ctx.fillStyle='#ffffff18';ctx.fillRect(xx+1,116,1,24);ctx.fillStyle=s.fence;}ctx.fillRect(-8,118,162,4);ctx.fillRect(-8,136,162,4);ctx.fillStyle='#4a4b42';ctx.fillRect(42,114,4,29);ctx.fillRect(83,114,4,29);
    // дрова и пара покрышек во дворе
    ctx.fillStyle='#806047';for(let i=0;i<4;i++){ctx.fillRect(134+i*3,102-i*3,18,4);}ctx.strokeStyle='#242b2c';ctx.lineWidth=4;ctx.beginPath();ctx.arc(4,111,7,0,7);ctx.stroke();
    ctx.restore();
  }
  function drawTree(x,birch){const y=h*.59,sc=Math.max(.7,Math.min(1,w/420));ctx.save();ctx.translate(x,y);ctx.scale(sc,sc);const sway=Math.sin(world.time*1.4+x*.02)*2;ctx.rotate(sway*.006);ctx.fillStyle='#5a4937';ctx.fillRect(-5,-67,10,70);ctx.fillStyle=birch?'#e7e4d7':'#315f3e';ctx.beginPath();ctx.arc(0,-80,34,0,7);ctx.arc(-22,-61,25,0,7);ctx.arc(23,-58,25,0,7);ctx.fill();ctx.fillStyle=birch?'#f1eee4':'#477b4c';ctx.beginPath();ctx.arc(-8,-91,19,0,7);ctx.arc(19,-77,16,0,7);ctx.fill();if(birch){ctx.strokeStyle='#47453d';ctx.lineWidth=2;for(let yy=-49;yy<-8;yy+=13){ctx.beginPath();ctx.moveTo(-5,yy);ctx.lineTo(5,yy+2);ctx.stroke();}}ctx.restore();}
  function drawBackground(){
    drawSky();
    for(const s of world.scenery){const x=s.x-world.camera*.43;if(x<-190||x>w+190)continue;
      if(s.kind==='house'||s.kind==='shop')drawHouse(s,x);
      else if(s.kind==='tree'||s.kind==='birch')drawTree(x,s.kind==='birch');
      else if(s.kind==='shed'){ctx.fillStyle='#655344';ctx.fillRect(x,h*.49,76,54);ctx.fillStyle='#3f3b37';ctx.beginPath();ctx.moveTo(x-7,h*.49);ctx.lineTo(x+35,h*.455);ctx.lineTo(x+82,h*.49);ctx.fill();ctx.fillStyle='#9c8a70';ctx.fillRect(x+8,h*.515,25,39);ctx.fillStyle='#3c3732';ctx.fillRect(x+39,h*.52,28,29);}
      else if(s.kind==='pole'){ctx.fillStyle='#514d43';ctx.fillRect(x,h*.32,5,h*.37);ctx.fillRect(x-17,h*.34,40,4);ctx.strokeStyle='#3b4241';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x-80,h*.37);ctx.quadraticCurveTo(x,h*.42,x+95,h*.36);ctx.stroke();}
      else if(s.kind==='junk'){ctx.fillStyle='#756b58';ctx.fillRect(x,h*.61,34,13);ctx.fillStyle='#292d2d';ctx.beginPath();ctx.arc(x+8,h*.64,8,0,7);ctx.arc(x+28,h*.64,8,0,7);ctx.fill();ctx.fillStyle='#a34d36';ctx.fillRect(x+12,h*.58,19,9);}
      else if(s.kind==='sign'){ctx.fillStyle='#4c4a42';ctx.fillRect(x,h*.48,4,h*.17);ctx.fillStyle='#e8dfc8';ctx.fillRect(x-22,h*.46-20,54,23);ctx.strokeStyle='#8e3d31';ctx.lineWidth=2;ctx.strokeRect(x-22,h*.46-20,54,23);ctx.fillStyle='#3d3a33';ctx.font='bold 8px sans-serif';ctx.fillText(['ШИНОМОНТАЖ','МАГАЗИН','СВЕЖИЙ ХЛЕБ'][Math.floor(s.seed*3)],x-19,h*.46-6);}
      else {ctx.fillStyle='#655d4e';ctx.fillRect(x,h*.46,4,h*.21);ctx.fillStyle='#f2ead5';ctx.fillRect(x-19,h*.46-25,43,23);ctx.strokeStyle='#a33';ctx.lineWidth=3;ctx.strokeRect(x-19,h*.46-25,43,23);ctx.fillStyle='#252b2c';ctx.font='bold 13px sans-serif';ctx.fillText('50',x-10,h*.46-9);}
    }
    // палисадники, трава, мусор и грязная обочина
    ctx.fillStyle='#71884d';ctx.fillRect(0,h*.64,w,h*.105);
    for(let i=0;i<Math.ceil(w/15)+2;i++){const x=((i*29-world.camera*.95)%(w+29)+w+29)%(w+29);ctx.strokeStyle=i%2?'#456c3d':'#a0aa5d';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x,h*.735);ctx.lineTo(x-3,h*.695-(i%4)*3);ctx.stroke();}
    ctx.fillStyle='#9b8767';ctx.fillRect(0,h*.745,w,h*.025);ctx.fillStyle='#6e6250';for(let i=0;i<Math.ceil(w/70)+1;i++){const x=((i*83-world.camera*1.15)%(w+83)+w+83)%(w+83);ctx.fillRect(x,h*.75,rand(8,24),3);}
    ctx.fillStyle='#353b3e';ctx.fillRect(0,h*.77,w,h*.23);ctx.fillStyle='#d4c7aa';ctx.fillRect(0,h*.768,w,3);
    // асфальтовые заплатки и трещины прокручиваются быстрее при скорости
    const off=world.roadOffset%180;for(let x=-off;x<w+180;x+=180){ctx.fillStyle='#45494a';ctx.beginPath();ctx.ellipse(x+45,h*.82,22,5,.08,0,7);ctx.fill();ctx.fillStyle='#242a2d';ctx.fillRect(x+105,h*.91,35,2);ctx.strokeStyle='#252a2b';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x+15,h*.95);ctx.lineTo(x+24,h*.93);ctx.lineTo(x+20,h*.91);ctx.stroke();}
    ctx.fillStyle='#e6dfce';for(let x=-(world.roadOffset%112);x<w+112;x+=112)ctx.fillRect(x,h*.865,54,4);
    // боковой поток травы и пыли — визуально подчёркивает 50 км/ч
    if(world.speed>5){ctx.strokeStyle='#d9d1b7';ctx.globalAlpha=.24;for(let i=0;i<13;i++){const x=((i*67-world.roadOffset*2.3)%(w+67)+w+67)%(w+67);const yy=h*.77+(i%5)*h*.043;ctx.beginPath();ctx.moveTo(x,yy);ctx.lineTo(x-18-world.speed*1.5,yy+1);ctx.stroke();}ctx.globalAlpha=1;}
  }
  function drawCar(car){
    const x=car.x-world.camera,y=world.roadY-12,s=Math.max(.72,Math.min(1.08,w/420));ctx.save();ctx.translate(x,y);ctx.scale(s,s);
    // ВАЗ-2106: характерный трёхобъёмный угловатый кузов, капот и багажник
    ctx.fillStyle='#0005';ctx.beginPath();ctx.ellipse(0,28,62,8,0,0,7);ctx.fill();
    ctx.fillStyle=car.color;ctx.beginPath();ctx.moveTo(-59,7);ctx.lineTo(-55,-7);ctx.lineTo(-39,-10);ctx.lineTo(-25,-29);ctx.lineTo(22,-29);ctx.lineTo(39,-10);ctx.lineTo(55,-7);ctx.lineTo(60,8);ctx.lineTo(58,18);ctx.lineTo(-58,18);ctx.closePath();ctx.fill();
    ctx.fillStyle='#ffffff20';ctx.fillRect(-52,-5,104,3);ctx.fillStyle='#252a2d';ctx.fillRect(-22,-32,47,4);
    // окна с центральной стойкой
    ctx.fillStyle='#9ab9c0';ctx.beginPath();ctx.moveTo(-22,-26);ctx.lineTo(19,-26);ctx.lineTo(33,-10);ctx.lineTo(-34,-10);ctx.closePath();ctx.fill();ctx.strokeStyle='#d9d5c9';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#53656b';ctx.fillRect(-3,-26,3,16);
    // хромированные молдинги и решётка
    ctx.fillStyle='#b9b9ad';ctx.fillRect(43,-2,12,11);ctx.fillRect(-58,-1,9,10);ctx.fillStyle='#d6d2c5';ctx.fillRect(51,-1,5,7);ctx.fillStyle='#b8b8ad';ctx.fillRect(31,-3,14,12);ctx.fillStyle='#333a3b';ctx.fillRect(34,-1,9,8);ctx.strokeStyle='#c6c4b9';ctx.lineWidth=1;for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(35+i*2.3,-1);ctx.lineTo(35+i*2.3,7);ctx.stroke();}
    // четыре круглые фары, задние фонари, бамперы и номер
    ctx.fillStyle='#e9e1c9';for(const xx of [46,53]){ctx.beginPath();ctx.arc(xx,1,3.5,0,7);ctx.fill();}ctx.fillStyle='#a83a31';ctx.fillRect(-57,1,6,8);ctx.fillStyle='#c9c7bd';ctx.fillRect(-60,13,120,4);ctx.fillStyle='#e5e2d7';ctx.fillRect(-8,8,18,6);ctx.fillStyle='#333';ctx.font='bold 4px sans-serif';ctx.textAlign='center';ctx.fillText('2106',1,12);
    // зеркала и ручки
    ctx.fillStyle='#bdb9ad';ctx.fillRect(-27,-14,7,3);ctx.fillRect(31,-14,7,3);ctx.fillStyle='#424747';ctx.fillRect(-16,-7,5,2);ctx.fillRect(12,-7,5,2);
    for(const xx of [-36,37]){ctx.fillStyle='#202529';ctx.beginPath();ctx.arc(xx,16,12,0,7);ctx.fill();ctx.fillStyle='#9ca2a1';ctx.beginPath();ctx.arc(xx,16,6,0,7);ctx.fill();ctx.fillStyle='#d5d2c7';ctx.beginPath();ctx.arc(xx,16,2,0,7);ctx.fill();}
    ctx.restore();
  }
  function drawBottle(b){const x=b.x-world.camera,y=b.y+Math.sin(world.time*4+b.phase)*3;if(x<-30||x>w+30)return;ctx.save();ctx.translate(x,y);ctx.rotate(-.18);ctx.fillStyle='#184f39';ctx.fillRect(-7,-16,14,31);ctx.fillStyle='#d5d8d3';ctx.fillRect(-4,-20,8,5);ctx.fillStyle='#cf2934';ctx.fillRect(-7,-5,14,11);ctx.fillStyle='white';ctx.font='italic bold 5px sans-serif';ctx.textAlign='center';ctx.fillText('ГАЗЯВА',0,2);ctx.restore();}
  function drawBike(){const s=skin(),x=world.playerX,y=world.y,scale=Math.max(.72,Math.min(1.05,w/420));ctx.save();ctx.translate(x,y+Math.sin(world.time*world.speed*.8)*Math.min(2,world.speed*.09));ctx.scale(scale,scale);ctx.rotate(-world.wheelie*.42);const spin=world.distance*.85;ctx.fillStyle='#0003';ctx.beginPath();ctx.ellipse(0,29,56,6,0,0,7);ctx.fill();
    // Колёса и рама
    for(const wx of [-32,34]){ctx.fillStyle='#20262b';ctx.beginPath();ctx.arc(wx,12,17,0,7);ctx.fill();ctx.strokeStyle='#69747b';ctx.lineWidth=3;ctx.beginPath();ctx.arc(wx,12,10,0,7);ctx.stroke();ctx.save();ctx.translate(wx,12);ctx.rotate(spin);ctx.strokeStyle='#c5cbd0';ctx.lineWidth=1.6;for(let i=0;i<8;i++){ctx.rotate(Math.PI/4);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-9);ctx.stroke();}ctx.restore();}
    ctx.strokeStyle='#b9c5ca';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-32,12);ctx.lineTo(-8,-5);ctx.lineTo(34,12);ctx.moveTo(-8,-5);ctx.lineTo(4,13);ctx.stroke();ctx.strokeStyle=s.bike;ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(-12,-7);ctx.lineTo(14,-7);ctx.lineTo(28,8);ctx.stroke();ctx.fillStyle=s.bike;ctx.beginPath();ctx.moveTo(-18,-13);ctx.lineTo(10,-16);ctx.lineTo(22,-5);ctx.lineTo(-8,-3);ctx.closePath();ctx.fill();ctx.fillStyle='#222';ctx.fillRect(-13,-23,29,6);ctx.strokeStyle='#ddd';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(26,-6);ctx.lineTo(36,-24);ctx.lineTo(43,-24);ctx.stroke();ctx.fillStyle='#ddd';ctx.fillRect(-2,-1,24,3);
    // Байкер
    ctx.fillStyle=s.bag;ctx.fillRect(-16,-48,15,23);ctx.strokeStyle='#20252c';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-9,-41);ctx.lineTo(4,-23);ctx.lineTo(18,-18);ctx.stroke();ctx.fillStyle=s.shirt;ctx.beginPath();ctx.moveTo(-7,-48);ctx.lineTo(12,-48);ctx.lineTo(18,-28);ctx.lineTo(-2,-25);ctx.closePath();ctx.fill();ctx.strokeStyle='#dca77d';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(9,-43);ctx.lineTo(23,-27);ctx.lineTo(34,-24);ctx.stroke();ctx.fillStyle='#303b4a';ctx.fillRect(-5,-26,10,15);ctx.fillRect(5,-25,13,5);ctx.fillStyle='#dca77d';ctx.beginPath();ctx.arc(0,-59,12,0,7);ctx.fill();ctx.fillStyle=s.helmet;ctx.beginPath();ctx.arc(0,-62,13,Math.PI,Math.PI*2);ctx.lineTo(13,-59);ctx.lineTo(-11,-55);ctx.closePath();ctx.fill();ctx.fillStyle='#bde6ef';ctx.fillRect(2,-62,10,4);ctx.restore();}
  function addParticles(x,y,color,n=8){for(let i=0;i<n;i++)world.particles.push({x,y,vx:rand(-100,100),vy:rand(-150,20),life:rand(.25,.55),color});}
  function drawParticles(dt){for(let i=world.particles.length-1;i>=0;i--){const p=world.particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=300*dt;p.life-=dt;ctx.globalAlpha=clamp(p.life*2,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x-world.camera,p.y,3,0,7);ctx.fill();ctx.globalAlpha=1;if(p.life<=0)world.particles.splice(i,1);}}
  function update(dt){
    if(state!=='playing')return;const p=world,scale=Math.max(.72,Math.min(1.05,w/420));p.time+=dt;
    // Реальный лимит 50 км/ч (13.89 м/с), разгон ощутимый, а скорость мира — в пикселях/метр.
    p.speed+=((keys.gas?7.2:0)-(keys.brake?12:0)-1.05)*dt;p.speed=clamp(p.speed,0,13.89);
    const pxPerMeter=14.5,scroll=p.speed*pxPerMeter;p.distance+=p.speed*dt;p.camera+=scroll*dt;p.roadOffset+=scroll*dt;
    if(keys.wheelie&&!p.air&&!p.crash){p.wheelie=clamp(p.wheelie+dt*.88,0,1.5);p.angle=p.wheelie*55;if(p.angle>=80){p.crash=0.001;p.crashType='wheelie';}}else{p.wheelie=Math.max(0,p.wheelie-dt*1.7);p.angle=p.wheelie*55;}
    if(p.air){p.vy+=1450*scale*dt;p.y+=p.vy*dt;if(p.y>=p.roadY-28){p.y=p.roadY-28;p.vy=0;p.air=false;}}
    // Строгая проверка пересечения краёв габаритов байка и кузова Жигулей.
    const bike={left:p.playerX-54*scale,right:p.playerX+54*scale,top:p.y-76*scale,bottom:p.y+29*scale};
    for(const c of p.cars){const cx=c.x-p.camera;if(cx<-130||cx>w+130||p.crash)continue;const car={left:cx-60*scale,right:cx+60*scale,top:p.roadY-42*scale,bottom:p.roadY+17*scale};const overlap=bike.left<=car.right&&bike.right>=car.left&&bike.top<=car.bottom&&bike.bottom>=car.top;if(overlap){p.crash=.001;p.crashType='car';p.shake=.35;addParticles(p.playerX,p.y,'#d7d0c2',16);beep(110,.22);}}
    for(const b of p.bottles){if(b.got)continue;const bx=b.x-p.camera;if(Math.abs(bx-px)<24*scale&&Math.abs(b.y-(p.y-10))<35*scale){b.got=true;p.score+=10;wallet++;save('wallet',wallet);ui.wallet.textContent=wallet;addParticles(px,p.y-10,'#ffd34d',9);beep(760,.07);}}
    p.score+=p.speed*dt*.8;if(p.wheelie>.2&&!p.air)p.score+=p.speed*dt*.65;
    if(p.crash){p.crash+=dt;if(p.crash>1.05)finish();}
    if(p.shake>0)p.shake=Math.max(0,p.shake-dt);
    ui.score.textContent=Math.floor(p.score);ui.speed.textContent=Math.round(p.speed*3.6);ui.meter.style.width=(p.speed/13.89*100)+'%';
    const angle=clamp(p.angle,0,80);ui.wheelieFill.style.width=(angle/80*100)+'%';ui.wheelieValue.textContent=Math.round(angle)+'°';ui.wheelieGauge.dataset.level=angle>=65?'danger':angle>=45?'warn':'safe';
  }
  function render(dt){ctx.setTransform(dpr,0,0,dpr,0,0);if(world&&world.shake>0){ctx.translate(rand(-4,4)*world.shake*3,rand(-3,3)*world.shake*3);}if(!world){ctx.fillStyle='#8ccce9';ctx.fillRect(0,0,w,h);return;}drawBackground();for(const c of world.cars)drawCar(c);for(const b of world.bottles)if(!b.got)drawBottle(b);drawBike();drawParticles(dt);if(world.crash){ctx.fillStyle='#ffdf9a';ctx.globalAlpha=clamp(world.crash*.7,0,.55);ctx.fillRect(0,0,w,h);ctx.globalAlpha=1;}}
  function loop(t){raf=requestAnimationFrame(loop);if(!last)last=t;let dt=Math.min(.033,(t-last)/1000);last=t;update(dt);render(dt);}
  function startLoop(){if(!raf)raf=requestAnimationFrame(loop);}startLoop();
  function jump(){if(state==='playing'&&!world.air&&!world.crash){world.air=true;world.vy=-520*Math.max(.75,Math.min(1.05,w/420));beep(280,.05);}}
  // Pointer Events работают и на Android, и на iOS; pointer capture не даёт залипать кнопкам.
  document.querySelectorAll('[data-hold]').forEach(btn=>{const key=btn.dataset.hold;const down=e=>{e.preventDefault();audioInit();keys[key]=true;btn.classList.add('active');try{btn.setPointerCapture(e.pointerId);}catch(_){}};const up=e=>{e.preventDefault();keys[key]=false;btn.classList.remove('active');};btn.addEventListener('pointerdown',down);['pointerup','pointercancel','lostpointercapture','pointerleave'].forEach(ev=>btn.addEventListener(ev,up));});
  document.querySelector('[data-tap="jump"]').addEventListener('pointerdown',e=>{e.preventDefault();audioInit();jump();});
  addEventListener('keydown',e=>{if(['ArrowRight','ArrowLeft','ArrowUp',' ','KeyW'].includes(e.key)||e.code==='Space')e.preventDefault();if(e.repeat)return;if(e.code==='ArrowRight')keys.gas=true;if(e.code==='ArrowLeft')keys.brake=true;if(e.code==='ArrowUp'||e.code==='KeyW')keys.wheelie=true;if(e.code==='Space')jump();});
  addEventListener('keyup',e=>{if(e.code==='ArrowRight')keys.gas=false;if(e.code==='ArrowLeft')keys.brake=false;if(e.code==='ArrowUp'||e.code==='KeyW')keys.wheelie=false;});
  function renderShop(){ $('shop-wallet').textContent=wallet;const list=$('skin-list');list.textContent='';for(const s of skins){const row=document.createElement('div'),sw=document.createElement('div'),info=document.createElement('div'),name=document.createElement('div'),price=document.createElement('div'),btn=document.createElement('button');row.className='skin-row';sw.className='skin-swatch';sw.style.background=`linear-gradient(135deg,${s.shirt},${s.bike})`;name.className='skin-name';name.textContent=s.name;price.className='skin-price';price.textContent=s.price?'🥤 '+s.price+' бутылок':'Бесплатно';info.append(name,price);const has=owned.includes(s.id),active=selected===s.id;btn.textContent=active?'Выбрано':has?'Выбрать':'Купить';btn.disabled=active||(!has&&wallet<s.price);btn.addEventListener('click',()=>{if(!owned.includes(s.id)){if(wallet<s.price)return;wallet-=s.price;owned.push(s.id);save('wallet',wallet);save('owned',owned);}selected=s.id;save('selected',selected);renderShop();updateStats();toast('Скин выбран!');});row.append(sw,info,btn);list.append(row);}}
  $('play').addEventListener('click',()=>{audioInit();newGame();});$('restart').addEventListener('click',newGame);$('open-shop').addEventListener('click',()=>{renderShop();show('shop');});$('gameover-shop').addEventListener('click',()=>{renderShop();show('shop');});$('close-shop').addEventListener('click',()=>show(state==='over'?'over':'menu'));
  $('sound').classList.toggle('off',!soundOn);$('sound').addEventListener('click',()=>{soundOn=!soundOn;save('sound',soundOn);$('sound').classList.toggle('off',!soundOn);audioInit();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){keys={gas:false,brake:false,wheelie:false};last=0;}});
  resize();updateStats();show('menu');
})();
