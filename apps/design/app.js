/* ============================================================
   FORMA — shared behaviour
   ============================================================ */
(function(){
  "use strict";

  /* ---------- product catalog (shared by chat + sections) ---------- */
  const CATALOG = [
    {id:"aero-glide",  name:"Aero Glide",       line:"Running",  price:130, cat:"Running"},
    {id:"cloud-step",  name:"Cloud Step",       line:"Training", price:150, cat:"Training"},
    {id:"trail-vector",name:"Trail Vector GTX", line:"Outdoor",  price:185, cat:"Outdoor"},
    {id:"meridian-tee",name:"Meridian Merino Tee", line:"Lifestyle", price:60, cat:"Lifestyle"},
    {id:"pace-short",  name:"Pace 5\" Short",   line:"Running",  price:55,  cat:"Running"},
    {id:"shell-jacket",name:"Stormshell Jacket",line:"Outdoor",  price:220, cat:"Outdoor"},
    {id:"flux-tight",  name:"Flux Compression Tight", line:"Training", price:90, cat:"Training"},
    {id:"drift-hoodie",name:"Drift Cotton Hoodie", line:"Lifestyle", price:95, cat:"Lifestyle"},
    {id:"vapor-cap",   name:"Vapor Run Cap",    line:"Equipment",price:30,  cat:"Equipment"},
    {id:"core-pack",   name:"Core 12L Vest Pack", line:"Equipment", price:120, cat:"Equipment"}
  ];
  window.FORMA_CATALOG = CATALOG;

  /* shared badge map */
  const BADGES = {
    "aero-glide":  [{cls:"badge--new",  dot:true,  label:"New"}],
    "trail-vector":[{cls:"badge--low",  dot:true,  label:"Low stock"}],
    "shell-jacket":[{cls:"badge--sale", dot:false, label:"−15%"}],
    "drift-hoodie":[{cls:"badge--new",  dot:true,  label:"New"},{cls:"badge--low",dot:true,label:"Low stock"}],
    "cloud-step":  [{cls:"badge--new",  dot:true,  label:"New"}],
    "meridian-tee":[{cls:"badge--new",  dot:true,  label:"New"}],
    "pace-short":  [{cls:"badge--low",  dot:true,  label:"Low stock"}],
    "flux-tight":  [{cls:"badge--low",  dot:true,  label:"Low stock"}],
    "vapor-cap":   [{cls:"badge--new",  dot:true,  label:"New"}],
    "core-pack":   [{cls:"badge--low",  dot:true,  label:"Low stock"}]
  };
  window.FORMA_BADGES = BADGES;

  const $  = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>[...r.querySelectorAll(s)];

  /* ============================================================
     THEME (dark mode) — shared across pages
     ============================================================ */
  const THEME_KEY = "forma-theme";
  function applyTheme(t){
    document.documentElement.classList.toggle("dark", t==="dark");
  }
  try{ applyTheme(localStorage.getItem(THEME_KEY)||"light"); }catch(e){}

  function initTheme(){
    $$("[data-theme-toggle]").forEach(el=>{
      el.addEventListener("click",()=>{
        const next = document.documentElement.classList.contains("dark") ? "light":"dark";
        applyTheme(next);
        try{ localStorage.setItem(THEME_KEY,next); }catch(e){}
        syncThemeLabels();
      });
    });
    syncThemeLabels();
  }
  function syncThemeLabels(){
    const dark = document.documentElement.classList.contains("dark");
    $$("[data-theme-text]").forEach(el=> el.textContent = dark ? "Dark" : "Light");
  }

  /* ============================================================
     SEARCH / CHAT PANEL
     ============================================================ */
  function initSearch(){
    const panel  = $("#searchPanel");
    const scrim  = $("#searchScrim");
    if(!panel) return;
    const openers = $$("[data-search-open]");
    const closer  = $("#searchClose");
    const sofiaBtn = $("#sofiaBtn");
    const chat     = $("#chatInner");
    const ta       = $("#chatInput");
    const sendBtn  = $("#chatSend");
    const fileIn   = $("#chatFile");
    const thumbsEl = $("#chatThumbs");
    let attachments = []; // {url}
    let busy = false;

    function open(){
      scrim.classList.add("open");
      panel.classList.add("open");
      document.body.style.overflow="hidden";
      if(sofiaBtn) sofiaBtn.classList.add("hidden");
      setTimeout(()=>ta && ta.focus(), 420);
    }
    function close(){
      scrim.classList.remove("open");
      panel.classList.remove("open");
      document.body.style.overflow="";
      if(sofiaBtn) sofiaBtn.classList.remove("hidden");
    }
    openers.forEach(b=>b.addEventListener("click",open));
    if(sofiaBtn) sofiaBtn.addEventListener("click",open);
    closer && closer.addEventListener("click",close);
    scrim && scrim.addEventListener("click",close);
    document.addEventListener("keydown",e=>{ if(e.key==="Escape") close(); });

    /* ---- pull-down notch: tap opens, drag-down reveals the chat ---- */
    const notch=$("#headNotch");
    if(notch){
      let dragging=false, moved=false, startY=0, panelH=0, suppress=false;
      notch.addEventListener("pointerdown",e=>{
        if(e.pointerType==="mouse" && e.button!==0) return;
        dragging=true; moved=false; startY=e.clientY;
        panelH=panel.offsetHeight||window.innerHeight*0.55;
        panel.style.transition="none";
        try{ notch.setPointerCapture(e.pointerId); }catch(_){}
      });
      window.addEventListener("pointermove",e=>{
        if(!dragging) return;
        const dy=e.clientY-startY;
        if(dy>3) moved=true;
        const pct=Math.max(0,Math.min(1, dy/(panelH*0.6)));
        panel.style.transform=`translateY(${-100+pct*100}%)`;
        scrim.classList.add("open"); scrim.style.opacity=String(pct*0.92);
        if(pct>0) document.body.style.overflow="hidden";
      });
      window.addEventListener("pointerup",e=>{
        if(!dragging) return;
        dragging=false;
        panel.style.transition=""; panel.style.transform=""; scrim.style.opacity="";
        const dy=e.clientY-startY;
        if(moved){ suppress=true; (dy>50 ? open() : close()); }
      });
      notch.addEventListener("click",e=>{ if(suppress){ suppress=false; return; } open(); });
      notch.addEventListener("keydown",e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); open(); } });
    }

    /* textarea autosize */
    function autosize(){ ta.style.height="auto"; ta.style.height=Math.min(ta.scrollHeight,120)+"px"; }
    ta && ta.addEventListener("input",autosize);

    /* attachments */
    function renderThumbs(){
      thumbsEl.innerHTML="";
      thumbsEl.style.display = attachments.length ? "flex":"none";
      attachments.forEach((a,i)=>{
        const d=document.createElement("div"); d.className="composer__thumb";
        d.innerHTML=`<img src="${a.url}" alt=""><button aria-label="Quitar">&times;</button>`;
        d.querySelector("button").onclick=()=>{ attachments.splice(i,1); renderThumbs(); };
        thumbsEl.appendChild(d);
      });
    }
    function addFiles(files){
      [...files].filter(f=>f.type.startsWith("image/")).forEach(f=>{
        const r=new FileReader();
        r.onload=ev=>{ attachments.push({url:ev.target.result}); renderThumbs(); };
        r.readAsDataURL(f);
      });
    }
    fileIn && fileIn.addEventListener("change",e=>{ addFiles(e.target.files); fileIn.value=""; });
    ta && ta.addEventListener("paste",e=>{
      const items=[...(e.clipboardData||{}).items||[]].filter(it=>it.type.startsWith("image/"));
      if(items.length){ e.preventDefault(); addFiles(items.map(it=>it.getAsFile())); }
    });

    /* message rendering */
    function bubble(role){
      const m=document.createElement("div");
      m.className="msg msg--"+(role==="user"?"user":"bot");
      m.innerHTML=`<div class="msg__avatar">${role==="user"?"YOU":"F"}</div><div class="msg__body"></div>`;
      chat.appendChild(m);
      chat.parentElement.scrollTop=chat.parentElement.scrollHeight;
      return m.querySelector(".msg__body");
    }
    function productCards(items){
      if(!items.length) return "";
      const cards=items.map(p=>{
        const pb=(BADGES[p.id]||[]).map(b=>`<span class="badge ${b.cls}">${b.dot?'<span class="badge__dot"></span>':''}${b.label}</span>`).join("");
        return `
        <a class="chat-card" href="product.html?id=${p.id}">
          <div class="chat-card__img">
            <image-slot id="chat-${p.id}" placeholder="${p.name}"></image-slot>
            ${pb?`<div class="chat-card__badges">${pb}</div>`:""}
            <button class="pcard__atc" aria-label="Add ${p.name} to cart" onclick="event.preventDefault();event.stopPropagation();window.FORMA_addToCart('${p.id}',this)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 7h13l-1.2 9.5a2 2 0 01-2 1.7H9.2a2 2 0 01-2-1.7L6 4H3"/><circle cx="9" cy="21" r="1"/><circle cx="17" cy="21" r="1"/></svg>
            </button>
          </div>
          <div class="chat-card__b">
            <div><div class="chat-card__n">${p.name}</div><div class="chat-card__brand">${p.line}</div></div>
            <div class="chat-card__price">€${p.price}</div>
          </div>
        </a>`;
      }).join("");
      return `<div class="chat-cards">${cards}</div>`;
    }

    async function send(text){
      if(busy) return;
      const q=(text||ta.value).trim();
      if(!q && !attachments.length) return;

      // user bubble
      const ub=bubble("user");
      let html="";
      if(attachments.length){
        html+=`<div class="msg__imgs">${attachments.map(a=>`<img src="${a.url}" alt="">`).join("")}</div>`;
      }
      if(q) html+=`<div>${escapeHtml(q)}</div>`;
      ub.innerHTML=html;
      const hadImage=attachments.length>0;
      attachments=[]; renderThumbs();
      ta.value=""; autosize();

      // bot typing
      busy=true; sendBtn.style.opacity=".5";
      const bb=bubble("bot");
      bb.innerHTML=`<div class="typing"><span></span><span></span><span></span></div>`;

      /* test command: xN or X N  →  show N results */
      const testMatch=(q||"").match(/^x\s*(\d+)$/i);
      if(testMatch){
        const n=Math.min(parseInt(testMatch[1]),CATALOG.length);
        await new Promise(r=>setTimeout(r,400));
        bb.innerHTML=`<div>Showing ${n} result${n===1?'':'s'}:</div>`+productCards(CATALOG.slice(0,n));
        chat.parentElement.scrollTop=chat.parentElement.scrollHeight;
        busy=false; sendBtn.style.opacity="1"; return;
      }

      const hasClaude = typeof window.claude !== "undefined" && window.claude.complete;
      if(hasClaude){
        try{
          const reply = await askClaude(q,hadImage);
          const picks = CATALOG.filter(p=> reply.ids.includes(p.id)).slice(0,3);
          bb.innerHTML = `<div>${escapeHtml(reply.text)}</div>` + productCards(picks);
        }catch(err){
          const picks = localMatch(q);
          bb.innerHTML = `<div>Here are a few options that match your search:</div>` + productCards(picks);
        }
      }else{
        const picks = localMatch(q);
        bb.innerHTML = `<div>I found these products that might match what you're looking for:</div>` + productCards(picks);
      }
      chat.parentElement.scrollTop=chat.parentElement.scrollHeight;
      busy=false; sendBtn.style.opacity="1";
    }

    sendBtn && sendBtn.addEventListener("click",()=>send());
    ta && ta.addEventListener("keydown",e=>{
      if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); send(); }
    });
    $$("[data-suggest]").forEach(s=> s.addEventListener("click",()=>send(s.dataset.suggest)));

    function localMatch(q){
      const t=(q||"").toLowerCase();
      let r=CATALOG.filter(p=> (p.name+" "+p.line+" "+p.cat).toLowerCase().includes(t));
      if(!r.length) r=CATALOG.slice(0,3);
      return r.slice(0,3);
    }
  }

  async function askClaude(query,hadImage){
    const list = window.FORMA_CATALOG.map(p=>`${p.id} | ${p.name} | ${p.cat} | €${p.price}`).join("\n");
    const prompt =
`You are the shopping assistant for FORMA, a minimalist athletic store. Help the shopper find products from this catalog ONLY:

${list}

Shopper said: "${query||"(no text)"}"
${hadImage?"The shopper also attached one or more product images. Acknowledge the image briefly and suggest visually/functionally similar items from the catalog.":""}

Reply with a SINGLE valid JSON object, no markdown, in this exact shape:
{"text":"a warm, concise 1-2 sentence reply in English","ids":["catalog_id", ...]}
Pick 1 to 4 ids from the catalog that best match. If nothing matches, pick the closest. Keep "text" under 240 characters.`;

    const raw = await window.claude.complete(prompt);
    const m = raw.match(/\{[\s\S]*\}/);
    const obj = JSON.parse(m?m[0]:raw);
    const valid = new Set(window.FORMA_CATALOG.map(p=>p.id));
    obj.ids = (obj.ids||[]).filter(id=>valid.has(id));
    if(!obj.ids.length) obj.ids = window.FORMA_CATALOG.slice(0,3).map(p=>p.id);
    obj.text = obj.text || "These options match what you're looking for:";
    return obj;
  }

  function escapeHtml(s){return (s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

  /* ============================================================
     HERO SLIDER
     ============================================================ */
  function initHero(){
    const hero=$(".hero"); if(!hero) return;
    const slides=$$(".hero__slide",hero);
    const dots=$$(".hero__dot",hero);
    const titleEl=$("#heroTitle");
    const exploreEl=$("#heroExplore");
    const shopEl=$("#heroShop");
    let i=0,timer;
    function go(n){
      i=(n+slides.length)%slides.length;
      slides.forEach((s,k)=>s.classList.toggle("active",k===i));
      dots.forEach((d,k)=>d.classList.toggle("active",k===i));
      const active=slides[i];
      if(titleEl) titleEl.textContent=active.dataset.title||titleEl.textContent;
      const link=active.dataset.link||"#";
      if(exploreEl) exploreEl.href=link;
      if(shopEl) shopEl.href=link;
    }
    dots.forEach((d,k)=>d.addEventListener("click",()=>{go(k);reset();}));
    $("[data-hero-next]")&&$("[data-hero-next]").addEventListener("click",()=>{go(i+1);reset();});
    $("[data-hero-prev]")&&$("[data-hero-prev]").addEventListener("click",()=>{go(i-1);reset();});
    function reset(){clearInterval(timer);timer=setInterval(()=>go(i+1),6500);}
    go(0);reset();
  }

  /* ============================================================
     RAIL (carousel) scroll buttons
     ============================================================ */
  function initRails(){
    $$("[data-rail]").forEach(rail=>{
      const track=$(".rail__track",rail)||$(".style-track",rail);
      if(!track) return;
      const vis = parseInt(rail.dataset.railVisible) || 4;
      const amt=()=>track.clientWidth*(1/vis);
      const nav=$(`.rail__nav[data-rail-target="${rail.id}"]`);
      if(!nav) return;
      const prev=$("[data-rail-prev]",nav), next=$("[data-rail-next]",nav);
      prev&&prev.addEventListener("click",()=>track.scrollBy({left:-amt(),behavior:"smooth"}));
      next&&next.addEventListener("click",()=>track.scrollBy({left:amt(),behavior:"smooth"}));
    });
  }

  /* ============================================================
     PRODUCT PAGE — sizes + accordions
     ============================================================ */
  function initPDP(){
    $$(".size:not(.oos)").forEach(s=> s.addEventListener("click",()=>{
      $$(".size").forEach(x=>x.classList.remove("sel")); s.classList.add("sel");
    }));
    $$(".acc__head").forEach(h=> h.addEventListener("click",()=>{
      const item=h.closest(".acc__item");
      const body=$(".acc__body",item);
      const open=item.classList.toggle("open");
      body.style.maxHeight = open ? body.scrollHeight+"px" : 0;
    }));
  }

  /* ============================================================
     CART
     ============================================================ */
  const cart = [];
  function addToCart(productId, btnEl){
    const product = CATALOG.find(p=>p.id===productId);
    if(!product) return;
    cart.push(product);
    updateCartBadge();
    if(btnEl){
      const isCardBtn = btnEl.classList.contains('pcard__atc');
      btnEl.classList.add('added');
      btnEl.disabled = true;
      if(isCardBtn){
        btnEl.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 13l4 4L19 7"/></svg>`;
        setTimeout(()=>{
          btnEl.classList.remove('added');
          btnEl.disabled = false;
          btnEl.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 7h13l-1.2 9.5a2 2 0 01-2 1.7H9.2a2 2 0 01-2-1.7L6 4H3"/><circle cx="9" cy="21" r="1"/><circle cx="17" cy="21" r="1"/></svg>`;
        },1400);
      }else{
        const origText = btnEl.textContent;
        btnEl.innerHTML=`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 13l4 4L19 7"/></svg> Added`;
        setTimeout(()=>{
          btnEl.classList.remove('added');
          btnEl.disabled = false;
          btnEl.textContent = origText;
        },1400);
      }
    }
  }
  function updateCartBadge(){
    let styleEl = document.getElementById('cart-badge-style');
    if(!styleEl){
      styleEl = document.createElement('style');
      styleEl.id = 'cart-badge-style';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `.cart-dot::after{content:"${cart.length}"}`;
  }
  window.FORMA_addToCart = addToCart;
  window.FORMA_cart = cart;

  /* ============================================================
     PRODUCT GALLERY CAROUSEL
     ============================================================ */
  function initGallery(){
    const gallery=$(".gallery");
    if(!gallery) return;
    const track=gallery.querySelector(".gallery__track");
    const slides=$$("image-slot",track||gallery);
    const dots=$$(".gallery__dot",gallery);
    const prev=$("[data-gallery-prev]",gallery);
    const next=$("[data-gallery-next]",gallery);
    let i=0;
    function isMobile(){ return window.matchMedia("(max-width:680px)").matches; }
    function activateCarousel(on){
      slides.forEach((s,k)=>s.classList.toggle("active",on?k===i:true));
      dots.forEach((d,k)=>d.classList.toggle("active",on?k===i:false));
    }
    function go(n){
      i=(n+slides.length)%slides.length;
      if(!isMobile()) return;
      slides.forEach((s,k)=>s.classList.toggle("active",k===i));
      dots.forEach((d,k)=>d.classList.toggle("active",k===i));
    }
    prev&&prev.addEventListener("click",()=>go(i-1));
    next&&next.addEventListener("click",()=>go(i+1));
    dots.forEach((d,k)=>d.addEventListener("click",()=>go(k)));
    let touchX=0;
    track&&track.addEventListener("touchstart",e=>{if(!isMobile()) return;touchX=e.changedTouches[0].clientX;},{passive:true});
    track&&track.addEventListener("touchend",e=>{
      if(!isMobile()) return;
      const dx=e.changedTouches[0].clientX-touchX;
      if(dx>50) go(i-1); else if(dx<-50) go(i+1);
    },{passive:true});
    function onResize(){
      activateCarousel(isMobile());
      if(isMobile()) go(i);
    }
    onResize();
    window.addEventListener("resize",onResize);
  }

  document.addEventListener("DOMContentLoaded",()=>{
    initTheme(); initSearch(); initHero(); initRails(); initPDP(); initGallery();
  });
})();
