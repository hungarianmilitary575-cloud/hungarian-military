require('dotenv').config();
const express=require('express');
const session=require('express-session');
const crypto=require('crypto');
const path=require('path');
const app=express();
const PORT=Number(process.env.PORT||3000);
const BASE_URL=(process.env.BASE_URL||`http://localhost:${PORT}`).replace(/\/$/,'');
const CLIENT_ID=process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET=process.env.DISCORD_CLIENT_SECRET;
const GUILD_ID=process.env.DISCORD_GUILD_ID;
const COOKIE_SECRET=process.env.SESSION_SECRET;
if(!COOKIE_SECRET||COOKIE_SECRET==='CSERELD_LE_EGY_HOSSZU_VELETLEN_TITOKRA')console.warn('FIGYELEM: Állíts be biztonságos SESSION_SECRET értéket a .env fájlban!');
if(!CLIENT_ID||!CLIENT_SECRET)console.warn('Discord OAuth nincs konfigurálva: töltsd ki a .env fájlt.');
app.disable('x-powered-by');
if(BASE_URL.startsWith('https://')) app.set('trust proxy',1);
app.use(express.json({limit:'16kb'}));
app.use(session({name:'hm.sid',secret:COOKIE_SECRET&&COOKIE_SECRET!=='CSERELD_LE_EGY_HOSSZU_VELETLEN_TITOKRA'?COOKIE_SECRET:crypto.randomBytes(32).toString('hex'),resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'lax',secure:BASE_URL.startsWith('https:'),maxAge:1000*60*60*12}}));
app.get('/auth/discord',(req,res)=>{
 if(!CLIENT_ID||!CLIENT_SECRET)return res.status(503).send('A Discord belépés még nincs konfigurálva. Állítsd be a DISCORD_CLIENT_ID és DISCORD_CLIENT_SECRET értékeket a tárhely környezeti változóinál, majd indítsd újra a szervert.');
 const state=crypto.randomBytes(24).toString('hex');req.session.oauthState=state;
 const q=new URLSearchParams({client_id:CLIENT_ID,redirect_uri:BASE_URL+'/auth/callback',response_type:'code',scope:'identify',state,prompt:'consent'});
 res.redirect('https://discord.com/oauth2/authorize?'+q);
});
app.get('/auth/callback',async(req,res)=>{
 const {code,state}=req.query;
 if(req.query.error)return res.status(400).send('A Discord engedélyezés megszakadt vagy elutasításra került. Visszaléphetsz és újra próbálhatod.');
 if(!code||typeof code!=='string'||!state||state!==req.session.oauthState)return res.status(403).send('Érvénytelen vagy lejárt Discord bejelentkezés.');
 delete req.session.oauthState;
 try{
  const body=new URLSearchParams({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,grant_type:'authorization_code',code,redirect_uri:BASE_URL+'/auth/callback'});
  const tokenResp=await fetch('https://discord.com/api/v10/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  if(!tokenResp.ok){console.error('Discord token endpoint status:',tokenResp.status);throw Error('Token request failed');}
  const token=await tokenResp.json();
  const userResp=await fetch('https://discord.com/api/v10/users/@me',{headers:{Authorization:'Bearer '+token.access_token}});
  if(!userResp.ok)throw Error('User request failed');
  const user=await userResp.json();
  req.session.regenerate(err=>{
   if(err)return res.status(500).send('Munkamenet hiba');
   req.session.user={id:user.id,username:user.username,global_name:user.global_name,avatar:user.avatar};
   req.session.save(error=>error?res.status(500).send('Munkamenet hiba'):res.redirect('/fiokom.html'));
  });
 }catch(e){console.error('OAuth:',e.message);res.status(502).send('Nem sikerült a Discord belépés. Ellenőrizd a .env és Redirect URL beállításokat.');}
});
app.get('/health',(req,res)=>res.status(200).json({ok:true}));
app.get('/api/auth/config',(req,res)=>res.set('Cache-Control','no-store').json({discordConfigured:!!(CLIENT_ID&&CLIENT_SECRET),rolesConfigured:!!(GUILD_ID&&process.env.DISCORD_BOT_TOKEN),redirectUri:BASE_URL+'/auth/callback'}));
app.post('/auth/logout',(req,res)=>req.session.destroy(()=>{res.clearCookie('hm.sid');res.json({ok:true})}));
app.get('/api/me',async(req,res)=>{
 const user=req.session.user;if(!user)return res.json({authenticated:false});
 const avatar_url=user.avatar?`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`:null;
 let roles=[],guild_status='';
 if(GUILD_ID&&process.env.DISCORD_BOT_TOKEN){
  try{
   const headers={Authorization:'Bot '+process.env.DISCORD_BOT_TOKEN};
   const [memberResp,rolesResp]=await Promise.all([
    fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${user.id}`,{headers}),
    fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/roles`,{headers})]);
   if(memberResp.status===404)guild_status='Nem vagy a Discord szerveren';
   else if(!memberResp.ok||!rolesResp.ok)guild_status='A rangok nem elérhetők';
   else{
    const member=await memberResp.json(),guildRoles=await rolesResp.json();
    const ids=new Set(member.roles||[]);let labels={};try{labels=JSON.parse(process.env.ROLE_LABELS||'{}')}catch{}
    roles=guildRoles.filter(r=>ids.has(r.id)&&r.name!=='@everyone').sort((a,b)=>b.position-a.position).map(r=>({name:labels[r.id]||r.name,color:r.color?'#'+r.color.toString(16).padStart(6,'0'):null}));
    guild_status='Discord szervertag';
   }
  }catch(e){guild_status='A rangok átmenetileg nem elérhetők'}
 }else guild_status='A szerverrangokhoz bot token és szerverazonosító szükséges';
 res.set('Cache-Control','no-store').json({authenticated:true,user:{id:user.id,username:user.username,global_name:user.global_name,avatar_url},roles,guild_status});
});

// FiveM: opcionális nyilvános szerveradatok, rövid idejű cache és mintaelőzmények.
// A teljes látogatószámot nem lehet egyetlen aktuális lekérésből megállapítani.
const FIVEM_ID=(process.env.FIVEM_SERVER_ID||'').trim();
const FIVEM_JOIN=(process.env.FIVEM_JOIN_URL||'').trim();
let fivemCache=null,fivemLast=0;const fivemHistory=[];
app.get('/api/fivem/status',async(req,res)=>{
 res.set('Cache-Control','no-store');
 if(!FIVEM_ID)return res.json({configured:false,online:false,players:null,maxPlayers:null,history:[]});
 if(Date.now()-fivemLast<60000&&fivemCache)return res.json({...fivemCache,history:fivemHistory});
 fivemLast=Date.now();
 try{
  const r=await fetch('https://servers-frontend.fivem.net/api/servers/single/'+encodeURIComponent(FIVEM_ID),{headers:{'User-Agent':'HungarianMilitaryPortal/1.0'},signal:AbortSignal.timeout(6500)});
  if(!r.ok)throw Error('FiveM server status unavailable');
  const payload=await r.json(),data=payload.Data;if(!data)throw Error('Missing FiveM data');
  const players=Number(data.clients),maxPlayers=Number(data.sv_maxclients);
  if(!Number.isFinite(players)||!Number.isFinite(maxPlayers))throw Error('Invalid player data');
  fivemHistory.push({at:new Date().toISOString(),players});if(fivemHistory.length>120)fivemHistory.shift();
  fivemCache={configured:true,online:true,players,maxPlayers,checkedAt:new Date().toISOString(),joinUrl:FIVEM_JOIN};
 }catch(e){fivemCache={configured:true,online:false,players:null,maxPlayers:null,checkedAt:new Date().toISOString(),joinUrl:FIVEM_JOIN}}
 res.json({...fivemCache,history:fivemHistory});
});


// Banki átutalásos igénylések: a szerver menti őket, nem a böngésző.
// NEM automatikus fizetés: jóváhagyás csak tényleges banki ellenőrzés után!
const fs=require('fs');
const DATA_DIR=path.join(__dirname,'data');fs.mkdirSync(DATA_DIR,{recursive:true});
const ORDERS_FILE=path.join(DATA_DIR,'orders.json');
const catalog={premium:{name:'Premium FK',amount:2000},basic:{name:'Sima frakció',amount:0},custom:{name:'Egyedi FK',amount:4000},weapon:{name:'Egyedi fegyver',amount:2500},clothing:{name:'Egyedi ruha',amount:2000},pp:{name:'PP vásárlás',amount:null},donation:{name:'Szerver támogatása',amount:null}};
// Kizárólag a nyitóképen szereplő három Founder, Discord OAuth alapján.
const ownerIds=['1396849523208229014','1386073046762127421','1306718381826773116'];
function readOrders(){try{const a=JSON.parse(fs.readFileSync(ORDERS_FILE,'utf8'));return Array.isArray(a)?a:[]}catch{return []}}
function saveOrders(a){const temp=ORDERS_FILE+'.tmp';fs.writeFileSync(temp,JSON.stringify(a,null,2),{mode:0o600});fs.renameSync(temp,ORDERS_FILE)}
function requireLogin(req,res,next){if(!req.session.user)return res.status(401).json({error:'Előbb lépj be Discorddal!'});next()}
function requireAdmin(req,res,next){if(!req.session.user||!ownerIds.includes(req.session.user.id))return res.status(403).json({error:'Nincs admin jogosultságod.'});next()}
app.get('/api/shop/config',(req,res)=>res.json({bankConfigured:!!(process.env.BANK_ACCOUNT||'').trim(),bankName:process.env.BANK_RECIPIENT||'',bankAccount:process.env.BANK_ACCOUNT||'',bankNotice:'Az átutalás csak manuális ellenőrzés után számít teljesítettnek.'}));
app.post('/api/orders',requireLogin,(req,res)=>{
 const {productId,kind,recipient,details,amount}=req.body||{};
 if(!Object.hasOwn(catalog,productId))return res.status(400).json({error:'Érvénytelen termék.'});
 if(!['self','gift','donation'].includes(kind)|| (kind==='donation')!==(productId==='donation'))return res.status(400).json({error:'Érvénytelen rendeléstípus.'});
 if(typeof details!=='string'||details.trim().length<5||details.length>1500)return res.status(400).json({error:'Írj legalább 5 karakteres leírást (max. 1500).'});
 if(kind==='gift'&&(!/^\d{17,20}$/.test(String(recipient||''))))return res.status(400).json({error:'Ajándékozáshoz a címzett Discord felhasználói azonosítója kell (17–20 számjegy).'});
 const product=catalog[productId];let total=product.amount;
 if(productId==='donation'){total=Number(amount);if(!Number.isInteger(total)||total<500||total>100000)return res.status(400).json({error:'Támogatás: 500 és 100 000 Ft közötti összeg.'})}
 if(productId==='pp')total=null;
 const id='HM-'+crypto.randomBytes(5).toString('hex').toUpperCase();
 const order={id,productId,product:product.name,amount:total,kind,recipient:kind==='gift'?String(recipient):null,details:details.trim(),buyerId:req.session.user.id,buyerName:req.session.user.global_name||req.session.user.username,status:total===0?'Elbírálás alatt':'Átutalásra vár',createdAt:new Date().toISOString()};
 const orders=readOrders();orders.unshift(order);saveOrders(orders);
 res.status(201).json({order,bankConfigured:!!process.env.BANK_ACCOUNT,bankAccount:process.env.BANK_ACCOUNT||'',bankName:process.env.BANK_RECIPIENT||''});
});
app.get('/api/orders',requireLogin,(req,res)=>res.json({orders:readOrders().filter(o=>o.buyerId===req.session.user.id)}));
app.get('/api/admin/orders',requireAdmin,(req,res)=>res.json({orders:readOrders()}));
app.patch('/api/admin/orders/:id',requireAdmin,(req,res)=>{
 const allowed=['Átutalásra vár','Egyeztetésre vár','Elbírálás alatt','Fizetés ellenőrizve','Teljesítve','Elutasítva'];
 if(!allowed.includes(req.body?.status))return res.status(400).json({error:'Érvénytelen állapot.'});
 const orders=readOrders(),o=orders.find(o=>o.id===req.params.id);if(!o)return res.status(404).json({error:'Nincs ilyen rendelés.'});
 o.status=req.body.status;o.updatedAt=new Date().toISOString();o.updatedBy=req.session.user.id;saveOrders(orders);res.json({ok:true,order:o});
});
app.get('/api/site/restart',(req,res)=>{const v=process.env.LAST_RESTART_AT||'';const d=new Date(v);res.json({lastRestart:Number.isFinite(d.getTime())?d.toISOString():null})});
app.get('/api/admin/me',(req,res)=>res.json({admin:!!(req.session.user&&ownerIds.includes(req.session.user.id))}));


// Spotify OAuth: a Discord-sessionhöz kapcsolt Spotify-fiók.
const SPOTIFY_ID=process.env.SPOTIFY_CLIENT_ID,SPOTIFY_SECRET=process.env.SPOTIFY_CLIENT_SECRET;
app.get('/auth/spotify',requireLogin,(req,res)=>{
 if(!SPOTIFY_ID||!SPOTIFY_SECRET)return res.status(503).send('Spotify nincs konfigurálva.');
 const state=crypto.randomBytes(24).toString('hex');req.session.spotifyState=state;
 const q=new URLSearchParams({client_id:SPOTIFY_ID,response_type:'code',redirect_uri:BASE_URL+'/auth/spotify/callback',state,scope:'user-read-private user-library-read'});
 res.redirect('https://accounts.spotify.com/authorize?'+q);
});
app.get('/auth/spotify/callback',requireLogin,async(req,res)=>{
 if(!req.query.code||typeof req.query.code!=='string'||!req.query.state||req.query.state!==req.session.spotifyState)return res.status(403).send('Érvénytelen Spotify állapot.');
 delete req.session.spotifyState;
 try{
 const tokenResp=await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Authorization:'Basic '+Buffer.from(SPOTIFY_ID+':'+SPOTIFY_SECRET).toString('base64')},body:new URLSearchParams({grant_type:'authorization_code',code:req.query.code,redirect_uri:BASE_URL+'/auth/spotify/callback'})});
 if(!tokenResp.ok)throw Error('Spotify token hiba');const token=await tokenResp.json();req.session.spotify={access:token.access_token,refresh:token.refresh_token,expires:Date.now()+token.expires_in*1000};req.session.save(()=>res.redirect('/spotify.html'));
 }catch(e){res.status(502).send('Spotify kapcsolódási hiba: '+e.message)}
});
app.post('/auth/spotify/disconnect',(req,res)=>{delete req.session.spotify;res.json({ok:true})});
async function spotifyToken(req){const t=req.session.spotify;if(!t)return null;if(Date.now()<t.expires-60000)return t.access;
 const r=await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Authorization:'Basic '+Buffer.from(SPOTIFY_ID+':'+SPOTIFY_SECRET).toString('base64')},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:t.refresh})});if(!r.ok)throw Error('Spotify token lejárt');const d=await r.json();t.access=d.access_token;t.refresh=d.refresh_token||t.refresh;t.expires=Date.now()+d.expires_in*1000;return t.access}
app.get('/api/spotify/me',async(req,res)=>{try{const token=await spotifyToken(req);if(!token)return res.json({connected:false,albums:[]});const headers={Authorization:'Bearer '+token};const [p,a]=await Promise.all([fetch('https://api.spotify.com/v1/me',{headers}),fetch('https://api.spotify.com/v1/me/albums?limit=12',{headers})]);if(!p.ok||!a.ok)throw Error('Spotify API nem elérhető');const profile=await p.json(),albums=await a.json();res.json({connected:true,name:profile.display_name||profile.id,albums:(albums.items||[]).map(x=>({title:x.album.name,artist:x.album.artists.map(y=>y.name).join(', '),image:x.album.images?.[0]?.url,url:x.album.external_urls?.spotify}))})}catch(e){res.status(502).json({error:e.message})}});
// Saját albumok: fájlok és metaadatok a szerver helyi tárhelyén. Tartós lemez nélkül elveszhetnek.
const multer=require('multer');const ALBUM_DIR=path.join(DATA_DIR,'albums');fs.mkdirSync(ALBUM_DIR,{recursive:true});const ALBUM_FILE=path.join(DATA_DIR,'albums.json');
const albumUpload=multer({storage:multer.diskStorage({destination:(req,file,cb)=>cb(null,ALBUM_DIR),filename:(req,file,cb)=>cb(null,crypto.randomBytes(18).toString('hex')+(file.fieldname==='cover'?({ 'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'}[file.mimetype]||'.img'):'.mp3'))}),limits:{fileSize:20*1024*1024,files:2},fileFilter:(req,file,cb)=>{const ok=file.fieldname==='cover'?['image/jpeg','image/png','image/webp'].includes(file.mimetype):file.fieldname==='audio'&&file.mimetype==='audio/mpeg';cb(ok?null:Error('Nem támogatott fájltípus'),ok)}}).fields([{name:'cover',maxCount:1},{name:'audio',maxCount:1}]);
function getAlbums(){try{const d=JSON.parse(fs.readFileSync(ALBUM_FILE,'utf8'));return Array.isArray(d)?d:[]}catch{return []}}
app.get('/api/albums',(req,res)=>res.json({albums:getAlbums().map(({title,artist,cover,audio,createdAt})=>({title,artist,cover,audio,createdAt}))}));
app.post('/api/albums',requireLogin,(req,res)=>albumUpload(req,res,err=>{if(err)return res.status(400).json({error:err.message});const title=String(req.body.title||'').trim(),artist=String(req.body.artist||'').trim();if(!title||title.length>100||!artist||artist.length>80){Object.values(req.files||{}).flat().forEach(f=>fs.unlink(f.path,()=>{}));return res.status(400).json({error:'Érvénytelen cím vagy előadó.'})}const files=req.files||{};const album={title,artist,cover:files.cover?.[0]?'/media/'+files.cover[0].filename:null,audio:files.audio?.[0]?'/media/'+files.audio[0].filename:null,createdAt:new Date().toISOString(),owner:req.session.user.id};const albums=getAlbums();albums.unshift(album);fs.writeFileSync(ALBUM_FILE,JSON.stringify(albums.slice(0,300),null,2),{mode:0o600});res.status(201).json({ok:true})}));
app.use('/media',express.static(ALBUM_DIR,{dotfiles:'deny',index:false}));

// Founder profilképek: csak a három nyilvánosan megjelenített Discord ID kérhető le.
const FOUNDER_IDS=new Set(['1396849523208229014','1386073046762127421','1306718381826773116']);
const founderCache=new Map();
app.get('/api/founders/:id/avatar',async(req,res)=>{
 const id=req.params.id;
 if(!FOUNDER_IDS.has(id))return res.sendStatus(404);
 const cached=founderCache.get(id);
 if(cached&&cached.until>Date.now())return res.json({avatar:cached.avatar});
 if(!process.env.DISCORD_BOT_TOKEN)return res.json({avatar:null,reason:'bot_not_configured'});
 try{
  const r=await fetch('https://discord.com/api/v10/users/'+id,{headers:{Authorization:'Bot '+process.env.DISCORD_BOT_TOKEN},signal:AbortSignal.timeout(6000)});
  if(!r.ok)return res.json({avatar:null,reason:'discord_unavailable'});
  const u=await r.json();
  const avatar=u.avatar?`https://cdn.discordapp.com/avatars/${id}/${u.avatar}.${u.avatar.startsWith('a_')?'gif':'png'}?size=256`:null;
  founderCache.set(id,{avatar,until:Date.now()+3600000});
  res.set('Cache-Control','public, max-age=300').json({avatar});
 }catch{res.json({avatar:null,reason:'discord_unavailable'})}
});
app.use('/assets', express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname), { index: false }));
app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'index.html')));
// Az admin HTML-t is a szerver védi, nem csak a gombokat/API-kat.
app.get('/admin.html',(req,res)=>{
 if(!req.session.user)return res.redirect('/auth/discord');
 if(!ownerIds.includes(req.session.user.id))return res.status(403).type('text/plain; charset=utf-8').send('Hozzáférés megtagadva: csak Founder fiókoknak.');
 res.set('Cache-Control','no-store').sendFile(path.join(__dirname,'admin.html'));
});
app.get(/^\/[a-z-]+\.html$/,(req,res,next)=>{const file=path.basename(req.path);if(!fs.existsSync(path.join(__dirname,file)))return next();res.sendFile(path.join(__dirname,file))});

app.get('/api/discord/news', async (req, res) => {
  const token = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.DISCORD_NEWS_CHANNEL_ID;

  if (!token || !channelId) {
    return res.status(503).json({
      error: 'Discord hírek nincsenek konfigurálva'
    });
  }

  try {
    const response = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages?limit=10`,
      {
        headers: { Authorization: `Bot ${token}` },
        signal: AbortSignal.timeout(8000)
      }
    );

    if (!response.ok) {
      return res.status(502).json({
        error: 'Nem sikerült lekérni a Discord-híreket'
      });
    }

    const messages = await response.json();

    res.set('Cache-Control', 'public, max-age=60');

    res.json({
      messages: messages
        .filter(m => m.content || m.attachments?.length)
        .map(m => ({
          id: m.id,
          author: m.author?.global_name || m.author?.username || 'Ismeretlen',
          content: m.content,
          timestamp: m.timestamp,
          images: (m.attachments || [])
            .filter(a => a.content_type?.startsWith('image/'))
            .map(a => a.url)
        }))
    });
  } catch (error) {
    console.error('Discord news:', error.message);
    res.status(502).json({
      error: 'A Discord-hírek átmenetileg nem elérhetők'
    });
  }
});

app.listen(PORT,()=>console.log(`Hungarian Military: ${BASE_URL}`));
