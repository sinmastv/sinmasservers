'use strict';
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {spawn} = require('child_process');
const http = require('http');

const ROOT='/home/container';
const DATA=path.join(ROOT,'data');
const CFG=path.join(DATA,'config');
const MUSIC=path.join(DATA,'music');
const PLAYLISTS=path.join(DATA,'playlists');
const LOGS=path.join(DATA,'logs');
const DB=path.join(DATA,'panel.json');
const WEB_PORT=Number(process.env.SERVER_PORT||3000);
const ICECAST_PORT=Number(process.env.ICECAST_PORT||8000);
const LIVE_PORT=Number(process.env.LIVE_PORT||8005);
for(const d of [DATA,CFG,MUSIC,PLAYLISTS,LOGS]) fs.mkdirSync(d,{recursive:true});

const defaults={
 owner:null,
 station:{name:'Mi Radio',description:'Icecast AutoDJ',genre:'Variado',url:'',public:true,location:'',adminEmail:'admin@example.com'},
 icecast:{hostname:'localhost',port:ICECAST_PORT,maxClients:100,maxSources:10,sourcePassword:rand(18),relayPassword:rand(18),adminUser:'admin',adminPassword:rand(18),burstSize:65535,queueSize:524288},
 stream:{mount:'/stream',name:'Radio',description:'',genre:'Variado',bitrate:192,format:'mp3',samplerate:44100,channels:2},
 autodj:{enabled:true,playlist:'general.m3u',mode:'random',crossfade:true,crossfadeSeconds:5,replayGain:false,normalize:false},
 live:{enabled:true,port:LIVE_PORT,mount:'live',user:'source',password:rand(18),fadeIn:1.0,fadeOut:1.0},
 panel:{sessionHours:24},
 revision:1
};
function rand(n){return crypto.randomBytes(n).toString('base64url').slice(0,n)}
function load(){if(!fs.existsSync(DB)){fs.writeFileSync(DB,JSON.stringify(defaults,null,2));return structuredClone(defaults)}; const x=JSON.parse(fs.readFileSync(DB)); return deep(defaults,x)}
function deep(a,b){if(Array.isArray(a)||typeof a!=='object'||a===null)return b===undefined?a:b; const o={...a}; for(const k of Object.keys(b||{}))o[k]=deep(a[k],b[k]);return o}
let state=load();
function save(){state.revision=(state.revision||0)+1;fs.writeFileSync(DB,JSON.stringify(state,null,2))}
function hashPassword(p,salt=crypto.randomBytes(16).toString('hex')){const h=crypto.scryptSync(p,salt,64).toString('hex');return `${salt}:${h}`}
function verify(p,v){try{const [s,h]=v.split(':');return crypto.timingSafeEqual(Buffer.from(h,'hex'),crypto.scryptSync(p,s,64))}catch{return false}}
const sessions=new Map();
function auth(req,res,next){const token=(req.headers.cookie||'').match(/session=([^;]+)/)?.[1]; const s=token&&sessions.get(token);if(!s||s.exp<Date.now())return res.status(401).json({error:'unauthorized'});req.user=s;next()}
function newSession(username){const t=rand(32);sessions.set(t,{username,role:'owner',exp:Date.now()+state.panel.sessionHours*3600000});return t}

let ice=null, liquid=null;
function logProc(name,p){const stream=fs.createWriteStream(path.join(LOGS,`${name}.log`),{flags:'a'}); p.stdout?.pipe(stream);p.stderr?.pipe(stream);p.on('exit',(c,s)=>stream.write(`\n[exit code=${c} signal=${s}]\n`))}
function stopProc(p){if(p&&!p.killed){try{p.kill('SIGTERM')}catch{}}}
function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')}
function liqStr(s){return JSON.stringify(String(s??''))}
function generateIcecast(){
 const i=state.icecast, st=state.station, m=state.stream;
 const xml=`<icecast>\n <location>${esc(st.location)}</location>\n <admin>${esc(st.adminEmail)}</admin>\n <limits><clients>${i.maxClients}</clients><sources>${i.maxSources}</sources><queue-size>${i.queueSize}</queue-size><burst-size>${i.burstSize}</burst-size></limits>\n <authentication><source-password>${esc(i.sourcePassword)}</source-password><relay-password>${esc(i.relayPassword)}</relay-password><admin-user>${esc(i.adminUser)}</admin-user><admin-password>${esc(i.adminPassword)}</admin-password></authentication>\n <hostname>${esc(i.hostname)}</hostname>\n <listen-socket><port>${i.port}</port><bind-address>0.0.0.0</bind-address></listen-socket>\n <http-headers><header name="Access-Control-Allow-Origin" value="*"/></http-headers>\n <mount type="normal"><mount-name>${esc(m.mount)}</mount-name><public>${st.public?1:0}</public><stream-name>${esc(m.name||st.name)}</stream-name><stream-description>${esc(m.description||st.description)}</stream-description><genre>${esc(m.genre||st.genre)}</genre><stream-url>${esc(st.url)}</stream-url></mount>\n <fileserve>1</fileserve>\n <paths><logdir>${LOGS}</logdir><webroot>/usr/local/share/icecast/web</webroot><adminroot>/usr/local/share/icecast/admin</adminroot><alias source="/" destination="/status.xsl"/></paths>\n <logging><accesslog>access.log</accesslog><errorlog>error.log</errorlog><loglevel>3</loglevel><logsize>10000</logsize></logging>\n <security><chroot>0</chroot></security>\n</icecast>\n`;
 fs.writeFileSync(path.join(CFG,'icecast.xml'),xml);
}
function generatePlaylist(){const f=path.join(PLAYLISTS,state.autodj.playlist);if(!fs.existsSync(f)){const tracks=fs.readdirSync(MUSIC).filter(x=>/\.(mp3|ogg|opus|flac|m4a|aac|wav)$/i.test(x)).map(x=>path.join(MUSIC,x));fs.writeFileSync(f,tracks.join('\n')+(tracks.length?'\n':''))}}
function generateLiquidsoap(){
 const a=state.autodj,l=state.live,m=state.stream,i=state.icecast;
 const fmt=m.format==='ogg'?`%vorbis(quality=0.5)`:(m.format==='opus'?`%opus(bitrate=${m.bitrate})`:`%mp3(bitrate=${m.bitrate},samplerate=${m.samplerate},stereo=${m.channels===2})`);
 let s=`settings.log.file.path := ${liqStr(path.join(LOGS,'liquidsoap.log'))}\nsettings.log.stdout := true\n`;
 s+=`music = playlist(mode=${liqStr(a.mode==='sequential'?'normal':'randomize')}, reload_mode="watch", ${liqStr(path.join(PLAYLISTS,a.playlist))})\n`;
 s+=`music = mksafe(music)\n`;
 if(a.crossfade) s+=`music = crossfade(duration=${Number(a.crossfadeSeconds)||5.0}, music)\n`;
 if(l.enabled){s+=`settings.harbor.bind_addrs := ["0.0.0.0"]\nlive = input.harbor(${liqStr(l.mount)}, port=${l.port}, user=${liqStr(l.user)}, password=${liqStr(l.password)})\nradio = fallback(track_sensitive=false, [live, music])\n`;} else s+=`radio = music\n`;
 s+=`output.icecast(${fmt}, host="127.0.0.1", port=${i.port}, password=${liqStr(i.sourcePassword)}, mount=${liqStr(m.mount)}, name=${liqStr(m.name||state.station.name)}, description=${liqStr(m.description||state.station.description)}, genre=${liqStr(m.genre||state.station.genre)}, public=${state.station.public?'true':'false'}, radio)\n`;
 fs.writeFileSync(path.join(CFG,'radio.liq'),s);
}
function regenerate(){generateIcecast();generatePlaylist();generateLiquidsoap()}
function startServices(){regenerate();stopProc(liquid);stopProc(ice);ice=spawn('/usr/local/bin/icecast',['-c',path.join(CFG,'icecast.xml')],{stdio:['ignore','pipe','pipe']});logProc('icecast-process',ice);setTimeout(()=>{if(state.autodj.enabled){liquid=spawn('liquidsoap',[path.join(CFG,'radio.liq')],{stdio:['ignore','pipe','pipe']});logProc('liquidsoap-process',liquid)}},700)}
function restartLiquid(){generatePlaylist();generateLiquidsoap();stopProc(liquid);setTimeout(()=>{if(state.autodj.enabled){liquid=spawn('liquidsoap',[path.join(CFG,'radio.liq')],{stdio:['ignore','pipe','pipe']});logProc('liquidsoap-process',liquid)}},500)}
function iceStatus(){return new Promise(resolve=>{const r=http.get({host:'127.0.0.1',port:state.icecast.port,path:'/status-json.xsl',timeout:1000},x=>{let b='';x.on('data',d=>b+=d);x.on('end',()=>{try{resolve(JSON.parse(b))}catch{resolve(null)}})});r.on('error',()=>resolve(null));r.on('timeout',()=>{r.destroy();resolve(null)})})}

const upload=multer({dest:path.join(DATA,'.uploads'),limits:{fileSize:1024*1024*1024}});
const app=express();app.use(express.json({limit:'2mb'}));app.use(express.urlencoded({extended:false}));app.use(express.static(path.join(__dirname,'public')));
app.get('/api/setup',(req,res)=>res.json({needsSetup:!state.owner}));
app.post('/api/setup',(req,res)=>{if(state.owner)return res.status(409).json({error:'already_setup'});const {username,password}=req.body;if(!username||String(password).length<10)return res.status(400).json({error:'username_required_password_min_10'});state.owner={username:String(username).trim(),passwordHash:hashPassword(String(password)),createdAt:new Date().toISOString()};save();const t=newSession(state.owner.username);res.setHeader('Set-Cookie',`session=${t}; HttpOnly; SameSite=Strict; Path=/`);res.json({ok:true})});
app.post('/api/login',(req,res)=>{if(!state.owner)return res.status(428).json({error:'setup_required'});if(req.body.username!==state.owner.username||!verify(String(req.body.password||''),state.owner.passwordHash))return res.status(401).json({error:'invalid_credentials'});const t=newSession(state.owner.username);res.setHeader('Set-Cookie',`session=${t}; HttpOnly; SameSite=Strict; Path=/`);res.json({ok:true})});
app.post('/api/logout',auth,(req,res)=>{const t=(req.headers.cookie||'').match(/session=([^;]+)/)?.[1];if(t)sessions.delete(t);res.setHeader('Set-Cookie','session=; Max-Age=0; Path=/');res.json({ok:true})});
app.get('/api/config',auth,(req,res)=>{const safe=structuredClone(state);delete safe.owner.passwordHash;res.json(safe)});
app.put('/api/config',auth,(req,res)=>{const owner=state.owner;state=deep(state,req.body||{});state.owner=owner;state.icecast.port=ICECAST_PORT;state.live.port=LIVE_PORT;save();regenerate();res.json({ok:true,restartRequired:true})});
app.post('/api/restart',auth,(req,res)=>{startServices();res.json({ok:true})});
app.post('/api/restart-autodj',auth,(req,res)=>{restartLiquid();res.json({ok:true})});
app.get('/api/status',auth,async(req,res)=>res.json({icecast:!!ice&&!ice.killed,liquidsoap:!!liquid&&!liquid.killed,status:await iceStatus()}));
app.get('/api/library',auth,(req,res)=>res.json(fs.readdirSync(MUSIC).filter(x=>!x.startsWith('.')).map(x=>({name:x,size:fs.statSync(path.join(MUSIC,x)).size}))));
app.post('/api/library/upload',auth,upload.array('files',100),(req,res)=>{for(const f of req.files||[]){const safe=path.basename(f.originalname).replace(/[^\w. ()\-\[\]]+/g,'_');fs.renameSync(f.path,path.join(MUSIC,safe))}generatePlaylist();restartLiquid();res.json({ok:true,count:(req.files||[]).length})});
app.delete('/api/library/:name',auth,(req,res)=>{const p=path.join(MUSIC,path.basename(req.params.name));if(fs.existsSync(p))fs.unlinkSync(p);generatePlaylist();restartLiquid();res.json({ok:true})});
app.post('/api/playlist/rebuild',auth,(req,res)=>{const f=path.join(PLAYLISTS,state.autodj.playlist);const tracks=fs.readdirSync(MUSIC).filter(x=>/\.(mp3|ogg|opus|flac|m4a|aac|wav)$/i.test(x)).map(x=>path.join(MUSIC,x));if(state.autodj.mode==='random')tracks.sort(()=>Math.random()-.5);fs.writeFileSync(f,tracks.join('\n')+'\n');restartLiquid();res.json({ok:true,count:tracks.length})});
app.post('/api/password',(req,res,next)=>auth(req,res,next),(req,res)=>{const {current,password}=req.body;if(!verify(String(current||''),state.owner.passwordHash)||String(password||'').length<10)return res.status(400).json({error:'invalid_current_or_short_new'});state.owner.passwordHash=hashPassword(String(password));save();res.json({ok:true})});

app.listen(WEB_PORT,'0.0.0.0',()=>{console.log(`Icecast AutoDJ v2 panel ready on :${WEB_PORT}`);startServices()});
function shutdown(){stopProc(liquid);stopProc(ice);setTimeout(()=>process.exit(0),1200)}process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
