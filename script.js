/* DoodWebTV-like Replica — script.js
   NOTE: API key placed client-side per user request. This is insecure in production.
*/

// CONFIG
const LIX_KEY = "8B2sbrwFE/h/9gpdBMFhFGFMLVtrAF0YqSF1T7gxrjY=";
const API_BASE = "https://api.luxsioab.com";
const PAGE_SIZE = 28;
let pageNum = 1;
let currentFiles = [];
let currentQuery = "";
let heroIndex = 0;
let favorites = JSON.parse(localStorage.getItem("dw_favs_replica") || "[]");

// DOM
const topCatsEl = document.getElementById("topCats");
const sideCatsEl = document.getElementById("sideCats");
const heroSlider = document.getElementById("heroSlider");
const prevHero = document.getElementById("prevHero");
const nextHero = document.getElementById("nextHero");
const gridEl = document.getElementById("grid");
const loadMoreBtn = document.getElementById("loadMoreBtn");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const resultCountEl = document.getElementById("resultCount");
const playerPanel = document.getElementById("playerPanel");
const playerContainer = document.getElementById("playerContainer");
const closePlayer = document.getElementById("closePlayer");
const videoEl = document.getElementById("videoEl");
const playerTitle = document.getElementById("playerTitle");
const playerMeta = document.getElementById("playerMeta");
const playerDesc = document.getElementById("playerDesc");
const favBtn = document.getElementById("favBtn");
const downloadBtn = document.getElementById("downloadBtn");
const openShareBtn = document.getElementById("openShareBtn");
const btnFavorites = document.getElementById("btnFavorites");
const yearEl = document.getElementById("year");
yearEl.textContent = new Date().getFullYear();

// Helpers
async function postJSON(path, body){
  const url = API_BASE + path;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: LIX_KEY, ...body })
    });
    if(!resp.ok) throw new Error('HTTP ' + resp.status);
    return await resp.json();
  } catch(e){
    console.error('API error', e);
    throw e;
  }
}

function escapeHtml(s){ return (s||"").toString().replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;' }[c])); }
function fmtDur(sec){ if(!sec) return ""; const s=parseInt(sec,10); const h=Math.floor(s/3600); const m=Math.floor((s%3600)/60); const ss=s%60; return h>0? `${h}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}` : `${m}:${String(ss).padStart(2,'0')}`; }

// UI populate categories (sample)
const sampleCats = ['Semua','Film','TV','Musik','Olahraga','Anak','Berita','Game'];
sampleCats.forEach(c=>{
  const btn = document.createElement('button'); btn.className='top-cat'; btn.textContent=c; btn.onclick=()=>{ loadFiles(true); };
  topCatsEl.appendChild(btn);
});

// Hero: seed with placeholders; will be replaced by featured items when available
function renderHero(slides){
  heroSlider.innerHTML = '';
  slides.forEach((s,i)=>{
    const div = document.createElement('div');
    div.className = 'hero-slide';
    div.style.backgroundImage = `url('${s.thumb}')`;
    div.innerHTML = `<div class="hero-overlay"><h2>${escapeHtml(s.title)}</h2><p class="muted">${escapeHtml(s.subtitle||'')}</p></div>`;
    heroSlider.appendChild(div);
  });
  // simple slider control
  heroIndex = 0; updateHero();
}
function updateHero(){
  const slides = heroSlider.querySelectorAll('.hero-slide');
  slides.forEach((sl,i)=> sl.style.transform = `translateX(${(i - heroIndex)*100}%)`);
}
prevHero.addEventListener('click', ()=> { const count = heroSlider.children.length; heroIndex = (heroIndex-1+count)%count; updateHero(); });
nextHero.addEventListener('click', ()=> { const count = heroSlider.children.length; heroIndex = (heroIndex+1)%count; updateHero(); });

// Render grid
function renderGrid(files){
  gridEl.innerHTML = '';
  if(!files || files.length===0){ gridEl.innerHTML = '<div class="muted">Tidak ada hasil.</div>'; resultCountEl.textContent='0 hasil'; return; }
  resultCountEl.textContent = `${files.length} hasil • halaman ${pageNum-1}`;
  files.forEach(f=>{
    const id = f.id || f.code || f.name;
    const thumb = f.thumbnail || (f.screenshots && f.screenshots[0]) || `https://picsum.photos/seed/${encodeURIComponent(id)}/600/360`;
    const title = f.display_name || f.title || f.name || id;
    const dur = f.duration ? fmtDur(f.duration) : '';
    const card = document.createElement('div'); card.className='card';
    card.innerHTML = `
      <div class="overlay">
        <button class="action-btn play" data-id="${id}">▶ Play</button>
        <button class="action-btn dl" data-id="${id}">⬇</button>
        <button class="action-btn fav" data-id="${id}">${favorites.includes(id)?'★':'☆'}</button>
      </div>
      <img class="thumb" src="${thumb}" alt="${escapeHtml(title)}" loading="lazy"/>
      <div class="card-body">
        <div class="title">${escapeHtml(title)}</div>
        <div class="meta"><div class="muted">${escapeHtml(f.channel||'Channel Demo')}</div><div class="muted">${dur||'-'}</div></div>
      </div>
    `;
    gridEl.appendChild(card);
  });
  // attach events
  document.querySelectorAll('.action-btn.play').forEach(b=> b.addEventListener('click', e=> openPlayerById(e.currentTarget.dataset.id)));
  document.querySelectorAll('.action-btn.dl').forEach(b=> b.addEventListener('click', e=> openShare(e.currentTarget.dataset.id)));
  document.querySelectorAll('.action-btn.fav').forEach(b=> b.addEventListener('click', e=> { toggleFav(e.currentTarget.dataset.id); renderGrid(currentFiles); }));
}

// load files paginated
async function loadFiles(reset=false){
  if(reset){ pageNum=1; currentFiles=[]; }
  try{
    resultCountEl.textContent = 'Memuat...';
    const resp = await postJSON('/pub/api/file/page', { page_num: pageNum, page_size: PAGE_SIZE });
    if(resp && resp.code===200 && resp.data && Array.isArray(resp.data.files)){
      const files = resp.data.files.map(f=>({
        id: f.id || f.code || f.name,
        name: f.name,
        display_name: f.display_name || f.title,
        thumbnail: f.thumbnail,
        duration: f.duration,
        embed_link: f.embed_link,
        share_link: f.share_link,
        file_share_link: f.file_share_link,
        screenshots: f.screenshots||[],
        channel: (f.owner_display_name || 'Channel Demo')
      }));
      currentFiles = reset ? files : currentFiles.concat(files);
      renderGrid(currentFiles);
      // Set hero slides from first 4 items if hero empty
      if(heroSlider.children.length===0){
        const slides = (currentFiles.slice(0,6)).map(it=>({ thumb: it.thumbnail || `https://picsum.photos/1200/540?seed=${encodeURIComponent(it.id)}`, title: it.display_name || it.name, subtitle: `${fmtDur(it.duration) || '—'}` }));
        renderHero(slides);
      }
      pageNum++;
    } else {
      console.warn('Unexpected', resp);
      resultCountEl.textContent = 'Gagal memuat';
    }
  } catch(e){
    resultCountEl.textContent = 'Error: CORS atau koneksi';
  }
}

// search
let searchTimer=null;
function doSearch(q){
  if(searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(async ()=>{
    if(!q){ loadFiles(true); return; }
    try{
      resultCountEl.textContent = 'Mencari...';
      const res = await postJSON('/pub/api/search/resource', { content: q, page_size: 60 });
      if(res && res.code===200 && Array.isArray(res.data)){
        const items = res.data.map(it=>({
          id: it.id || it.code || it.name,
          display_name: it.display_name || it.title || it.name,
          thumbnail: it.thumbnail || (it.screenshots && it.screenshots[0]),
          duration: it.duration,
          embed_link: it.embed_link,
          share_link: it.share_link
        }));
        currentFiles = items;
        renderGrid(currentFiles);
      } else {
        resultCountEl.textContent = 'Tidak ditemukan';
      }
    } catch(e){ resultCountEl.textContent = 'Error pencarian'; }
  }, 350);
}

// open player by id
async function openPlayerById(id){
  let file = currentFiles.find(f=>f.id===id || f.name===id);
  if(!file){
    try{
      const resp = await postJSON('/pub/api/file/page', { page_num:1, page_size:100 });
      if(resp && resp.code===200 && Array.isArray(resp.data.files)){
        const f = resp.data.files.find(x => (x.id===id || x.code===id || x.name===id));
        if(f) file = { id: f.id||f.code||f.name, display_name: f.display_name||f.title||f.name, thumbnail: f.thumbnail, duration: f.duration, embed_link: f.embed_link, share_link: f.share_link, file_share_link: f.file_share_link };
      }
    } catch(e){ console.error(e); }
  }
  if(!file){ alert('File tidak ditemukan'); return; }
  showPlayer(file);
}

// show player
function showPlayer(file){
  playerPanel.classList.remove('hidden'); playerPanel.setAttribute('aria-hidden','false');
  playerTitle.textContent = file.display_name || file.name || file.id;
  playerMeta.textContent = `Durasi: ${file.duration ? fmtDur(file.duration) : '-'}`;
  playerDesc.textContent = '';
  favBtn.textContent = favorites.includes(file.id)? '★ Favorited' : '❤ Favorit';
  favBtn.onclick = ()=>{ toggleFav(file.id); favBtn.textContent = favorites.includes(file.id)? '★ Favorited' : '❤ Favorit'; };

  // download/open links
  if(file.file_share_link) { downloadBtn.href = file.file_share_link; downloadBtn.style.display='inline-block'; openShareBtn.href = file.file_share_link; openShareBtn.style.display='inline-block'; }
  else if(file.share_link) { downloadBtn.href = file.share_link; downloadBtn.style.display='inline-block'; openShareBtn.href = file.share_link; openShareBtn.style.display='inline-block'; }
  else { downloadBtn.style.display='none'; openShareBtn.style.display='none'; }

  // player logic
  playerContainer.innerHTML = '';
  // if embed_link -> iframe
  if(file.embed_link){
    const ifr = document.createElement('iframe'); ifr.src = file.embed_link; ifr.width='100%'; ifr.height='100%'; ifr.style.border=0; playerContainer.appendChild(ifr); return;
  }
  const possible = [file.share_link, file.file_share_link].filter(Boolean);
  const m3u8 = possible.find(u=>u && u.includes('.m3u8'));
  const mp4 = possible.find(u=>u && (u.endsWith('.mp4') || u.includes('.mp4?')));
  if(m3u8){
    const v = document.createElement('video'); v.controls=true; v.style.width='100%'; v.style.height='100%'; playerContainer.appendChild(v);
    if(Hls.isSupported()){
      const hls = new Hls(); hls.loadSource(m3u8); hls.attachMedia(v); hls.on(Hls.Events.MANIFEST_PARSED, ()=> v.play().catch(()=>{}));
    } else if(v.canPlayType('application/vnd.apple.mpegurl')){ v.src = m3u8; v.play().catch(()=>{}); }
    else playerContainer.innerHTML = '<div class="muted">Browser tidak mendukung HLS — gunakan tombol Open</div>';
    return;
  } else if(mp4){
    const v = document.createElement('video'); v.controls=true; v.src = mp4; v.style.width='100%'; v.style.height='100%'; playerContainer.appendChild(v); v.play().catch(()=>{}); return;
  }
  if(possible.length>0){
    const ifr = document.createElement('iframe'); ifr.src = possible[0]; ifr.width='100%'; ifr.height='100%'; ifr.style.border=0; playerContainer.appendChild(ifr); return;
  }
  playerContainer.innerHTML = '<div class="muted">Tidak ada sumber pemutaran tersedia.</div>';
}

function closePlayer(){
  const v = playerContainer.querySelector('video'); if(v){ try{ v.pause(); v.src=''; } catch(e){} }
  playerPanel.classList.add('hidden'); playerPanel.setAttribute('aria-hidden','true');
}

// favorites
function toggleFav(id){
  if(!id) return;
  if(favorites.includes(id)) favorites = favorites.filter(x=>x!==id); else favorites.push(id);
  localStorage.setItem('dw_favs_replica', JSON.stringify(favorites));
}

// open share (fallback)
function openShare(id){
  const f = currentFiles.find(x=>x.id===id) || {};
  const url = f.file_share_link || f.share_link || f.embed_link;
  if(url) window.open(url, '_blank');
  else alert('Tidak ada link share untuk file ini');
}

// events
loadMoreBtn.addEventListener('click', ()=> loadFiles(false));
searchBtn.addEventListener('click', ()=> { currentQuery = searchInput.value.trim(); doSearch(currentQuery); });
searchInput.addEventListener('keyup', e=> { if(e.key==='Enter'){ currentQuery = searchInput.value.trim(); doSearch(currentQuery); } else { currentQuery = searchInput.value.trim(); doSearch(currentQuery); }});
closePlayer.addEventListener('click', closePlayer);
btnFavorites && btnFavorites.addEventListener('click', ()=>{ if(favorites.length===0) alert('Belum ada favorit'); else { currentFiles = favorites.map(id=>({ id, display_name:id, thumbnail:`https://picsum.photos/seed/${encodeURIComponent(id)}/600/360` })); renderGrid(currentFiles); }});

// init
loadFiles(true);
