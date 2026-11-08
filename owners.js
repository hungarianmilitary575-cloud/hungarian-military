/* A Discord-felhasználók azonosítóit a saját szerver tulajdonosainak ID-jára állítsd. */
const HM_OWNERS = [
 {id:"1396849523208229014",name:"Txnniy.™",role:"Founder",photo:"assets/founder-txnniy.png"},
 {id:"1386073046762127421",name:"ꨄ Trónfoszto ™",role:"Founder",photo:"assets/founder-tronfoszto.png"},
 {id:"1306718381826773116",name:"〔♧Smici♧〕",role:"Founder",photo:"assets/founder-smici.png"},
 {id:"1520059271046496419",name:"𝖘𝖊𝖝𝖒𝖆𝖈𝖍𝖎𝖓𝖆",role:"Fejlesztő",photo:"assets/founder-sexmachina.png"}
];
(function(){
 const overlay=document.getElementById('hm-owners-overlay'); if(!overlay)return;
 const grid=document.getElementById('hm-owner-grid');
 for(const owner of HM_OWNERS){
  const card=document.createElement('article');card.className='hm-owner-card';
  const avatar=document.createElement('div');avatar.className='hm-owner-avatar';
  const imgLocal=document.createElement('img');imgLocal.src=owner.photo;imgLocal.alt=owner.name+' profilképe';imgLocal.loading='eager';avatar.append(imgLocal);
  // A tulajdonos által megadott profilkép mindig elsőbbséget élvez.
  imgLocal.onerror=()=>{avatar.textContent=owner.name.charAt(0)};
  const name=document.createElement('strong');name.textContent=owner.name;
  const rank=document.createElement('span');rank.className='hm-owner-role';rank.textContent=(owner.role==='Founder'?'♛ 𝐅𝐨𝐮𝐧𝐝𝐞𝐫':'⌘ 𝐅𝐞𝐣𝐥𝐞𝐬𝐳𝐭ő');rank.classList.add(owner.role==='Founder'?'hm-rank-founder':'hm-rank-developer');
  const id=document.createElement('small');id.textContent=owner.id?'Discord ID: '+owner.id:'Discord ID beállításra vár';
  card.append(avatar,name,rank,id);
  if(/^\d{17,20}$/.test(owner.id)){
   const link=document.createElement('a');link.href='https://discord.com/users/'+owner.id;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Discord-profil ↗';card.append(link);
  }
  grid.append(card);
 }
 const hide=()=>{overlay.hidden=true;document.body.classList.remove('hm-owners-open')};
 document.getElementById('hm-owners-enter').addEventListener('click',()=>{
  if(document.getElementById('hm-owners-remember').checked)localStorage.setItem('hm_owners_dismissed_v2','1');hide();
 });
 if(localStorage.getItem('hm_owners_dismissed_v2')!=='1'){
  // The existing introductory animation remains intact; show the owners afterwards.
  const intro=document.querySelector('#hm-entry, .hm-entry-overlay, #entry-overlay');
  if(intro && !intro.hidden){
   const observer=new MutationObserver(()=>{if(intro.hidden || getComputedStyle(intro).display==='none'){observer.disconnect();overlay.hidden=false;document.body.classList.add('hm-owners-open')}});
   observer.observe(intro,{attributes:true,attributeFilter:['class','style','hidden']});
   setTimeout(()=>{observer.disconnect();if(overlay.hidden){overlay.hidden=false;document.body.classList.add('hm-owners-open')}},6500);
  }else{overlay.hidden=false;document.body.classList.add('hm-owners-open')}
 }
})();
// Egy kattintásos, helyi hangfájl-lejátszás. Nem használ YouTube iframe-et.
(function(){
 const play=document.getElementById('hm-music-play');
 const stop=document.getElementById('hm-music-stop');
 const host=document.getElementById('hm-music-player');
 const note=document.getElementById('hm-music-note');
 if(!play||!stop||!host)return;
 const audio=document.createElement('audio');
 audio.preload='none';
 audio.src='assets/belepozene.mp3';
 audio.style.display='none';
 host.replaceChildren(audio);
 function reset(){audio.pause();audio.currentTime=0;play.hidden=false;stop.hidden=true;play.setAttribute('aria-pressed','false')}
 play.addEventListener('click',async()=>{
  try{
   await audio.play();
   play.hidden=true;stop.hidden=false;play.setAttribute('aria-pressed','true');
   if(note)note.textContent='A belépőzene lejátszása folyamatban.';
  }catch(error){
   reset();
   if(note)note.textContent='A zene még nincs feltöltve. Helyezd a jogszerűen használható MP3 fájlt az assets/belepozene.mp3 helyre.';
  }
 });
 stop.addEventListener('click',reset);
 audio.addEventListener('ended',reset);
 audio.addEventListener('error',()=>{reset();if(note)note.textContent='Nem található vagy nem játszható le az assets/belepozene.mp3 fájl.'});
 document.getElementById('hm-owners-enter')?.addEventListener('click',reset);
})();
