(function () {
  "use strict";
  var app = document.getElementById("app");
  var toastRegion = document.getElementById("toast-region");
  var params = new URLSearchParams(location.search);
  var view = params.get("vista") || document.body.dataset.view || "admin";
  var slug = params.get("comercio") || "mercadito-la-esquina";
  var section = "overview";
  var cart = {};
  var storeData = null;
  var riderUser = null;
  var geoWatch = null;
  var locationOrder = null;
  var locationLastSent = 0;
  var pendingKey = "";
  var refreshTimer = null;
  var eventStream = null;
  var eventRefreshTimer = null;
  var queueKey = "white-rider-events-v1";
  var labels = {received:"Recibido",confirmed:"Confirmado",preparing:"Preparando",ready:"Listo para recoger",in_delivery:"En reparto",delivered:"Entregado",cancelled:"Cancelado",assigned:"Asignada",accepted:"Aceptada",picked_up:"Recogida",on_route:"En ruta",incident:"Con incidencia",pending_cash:"Efectivo pendiente",pending_verification:"Transferencia por verificar",paid_manual:"Transferencia verificada",paid_cash:"Efectivo recibido",pending_integration:"Integración pendiente"};

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }
  function money(cents, currency) {
    return new Intl.NumberFormat("es-NI", {style:"currency",currency:currency || "NIO", minimumFractionDigits:2}).format((Number(cents) || 0) / 100);
  }
  function date(value) {
    if (!value) return "—";
    try { return new Intl.DateTimeFormat("es-NI", {dateStyle:"medium",timeStyle:"short"}).format(new Date(value)); } catch (_) { return value; }
  }
  function statusLabel(value) { return labels[value] || value || "—"; }
  function toast(message, type) {
    var node = document.createElement("div");
    node.className = "toast " + (type || "");
    node.textContent = message;
    toastRegion.appendChild(node);
    setTimeout(function () { node.remove(); }, 4300);
  }
  async function api(path, options) {
    var opts = options || {};
    opts.method = opts.method || "GET";
    opts.headers = Object.assign({"Accept":"application/json"}, opts.headers || {});
    if (opts.body && typeof opts.body !== "string") {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(opts.body);
    }
    opts.credentials = "same-origin";
    var response = await fetch(path, opts);
    var result = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      var error = new Error(result.error && result.error.message ? result.error.message : "No se pudo completar la solicitud.");
      error.code = result.error && result.error.code;
      error.status = response.status;
      throw error;
    }
    return result;
  }
  function shell(content, mode) {
    return '<div class="app-shell mode-' + esc(mode || "") + '">' +
      '<header class="topbar"><a class="brand" href="/admin.html"><span class="brand-mark">W</span><span><b>WHITE</b><small>SOFTWARE</small></span></a>' +
      '<nav class="global-nav" aria-label="Interfaces"><a class="' + (view==="admin"?"current":"") + '" href="/admin.html">Panel admin</a><a class="' + (view==="tienda"?"current":"") + '" href="/tienda.html?comercio=' + encodeURIComponent(slug) + '">Tienda cliente</a></nav>' +
      '<span class="environment"><i></i> DEMO LOCAL</span></header>' + content +
      '<footer class="global-foot"><span>White Software · Nicaragua</span><span>Datos de demostración · Tarjeta pendiente de integración</span></footer></div>';
  }
  function header(eyebrow, title, text, action) {
    return '<div class="page-heading"><div><div class="eyebrow">' + esc(eyebrow) + '</div><h1>' + esc(title) + '</h1><p>' + esc(text || "") + '</p></div>' + (action || "") + '</div>';
  }
  function beginPoll(fn, seconds) {
    clearInterval(refreshTimer);
    refreshTimer = setInterval(function () {
      if (!document.hidden && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName || "")) fn();
    }, (seconds || 12) * 1000);
  }
  function endPoll() { clearInterval(refreshTimer); refreshTimer = null; }
  function stopEventStream() {
    if(eventStream){eventStream.close();eventStream=null;}
    clearTimeout(eventRefreshTimer);eventRefreshTimer=null;
  }
  function connectEventStream(mode,refresh,token) {
    stopEventStream();
    if(!window.EventSource)return;
    var cursorKey="white-events-"+mode+(token||"");
    var cursor=sessionStorage.getItem(cursorKey)||"0";
    var url="/api/events?after="+encodeURIComponent(cursor);
    if(token)url+="&token="+encodeURIComponent(token);
    eventStream=new EventSource(url);
    eventStream.addEventListener("update",function(event){
      if(event.lastEventId)sessionStorage.setItem(cursorKey,event.lastEventId);
      clearTimeout(eventRefreshTimer);
      eventRefreshTimer=setTimeout(function(){
        if(document.hidden||/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement&&document.activeElement.tagName||""))return;
        refresh();
      },180);
    });
  }
  function navItem(key, text, symbol) {
    return '<button class="side-link ' + (section===key?"active":"") + '" data-section="' + key + '"><span class="nav-symbol">' + symbol + '</span>' + text + '</button>';
  }
  function loginScreen(kind) {
    var rider = kind === "rider";
    var email = rider ? "rider@demo.white" : "admin@demo.white";
    return shell('<main class="login-layout"><section class="login-visual"><div class="visual-kicker">UNA OPERACIÓN, TRES EXPERIENCIAS</div><h1>Pedidos que conectan<br>el negocio con la calle.</h1><p>Administración, tienda por enlace y reparto comparten la misma información del pedido.</p><div class="flow-line"><span>Tienda</span><b>→</b><span>Comercio</span><b>→</b><span>Reparto</span></div><div class="login-note"><b>Versión de demostración</b><span>La base local se comparte entre las tres interfaces. No se cargan pedidos de clientes reales.</span></div></section><section class="login-card"><div class="eyebrow">' + (rider?"ACCESO DE REPARTO":"ACCESO DEL COMERCIO") + '</div><h2>Iniciar sesión</h2><p>Usá la cuenta demo para explorar el flujo conectado.</p><form id="login-form" class="form-stack"><label>Correo electrónico<input name="email" type="email" value="' + email + '" required autocomplete="username"></label><label>Contraseña<input name="password" type="password" value="Demo123!" required autocomplete="current-password"></label><button class="btn btn-primary" type="submit">Entrar al ' + (rider?"reparto":"panel") + '</button></form><div class="demo-credentials"><span>Cuenta demo local</span><b>' + email + ' · Demo123!</b><small>No uses estas claves al publicar o exponer el servidor.</small></div><a class="text-link" href="?vista=' + (rider?"admin":"reparto") + '">Ir a ' + (rider?"administración":"reparto") + '</a></section></main>', rider?"rider":"admin");
  }
  async function getSession() {
    var result = await api("/api/session");
    return result.user;
  }
  async function login(email, password) {
    return api("/api/login", {method:"POST", body:{email:email,password:password}});
  }
  function renderLogin(kind) {
    app.innerHTML = loginScreen(kind);
  }
  async function startAdmin() {
    endPoll();stopEventStream();
    var user;
    try { user = await getSession(); } catch (_) { user = null; }
    if (!user) return renderLogin("admin");
    if (user.role === "courier") { location.href = "/?vista=reparto"; return; }
    await renderAdmin();
    connectEventStream("admin",renderAdmin);
    beginPoll(renderAdmin, 15);
  }
  async function renderAdmin() {
    var user, content, overview, orders, couriers, products, locations, settings, activity;
    try {
      user = await getSession();
      if (!user) return renderLogin("admin");
      if (section==="overview") overview = await api("/api/admin/overview");
      if (section==="orders") {
        var responses = await Promise.all([api("/api/admin/orders"),api("/api/admin/couriers")]);
        orders=responses[0].orders; couriers=responses[1].couriers;
      }
      if (section==="catalog") products=(await api("/api/admin/products")).products;
      if (section==="tracking") locations=(await api("/api/admin/locations")).locations;
      if (section==="settings") {
        var settingResponse=await Promise.all([api("/api/admin/settings"),api("/api/admin/audit")]);
        settings=settingResponse[0].settings;activity=settingResponse[1].activity;
      }
    } catch (err) {
      if (err.status===401) return renderLogin("admin");
      toast(err.message,"error");
      return;
    }
    var canManage=user.role==="owner"||user.role==="admin";
    var nav='<aside class="sidebar"><div class="sidebar-label">OPERACIÓN</div>' +
      navItem("overview","Resumen","◫")+navItem("orders","Pedidos","▤")+(canManage?navItem("catalog","Catálogo","▦"):"")+navItem("tracking","Reparto y ubicación","⌖")+(canManage?navItem("settings","Comercio","⚙"):"")+
      '<div class="sidebar-bottom"><div class="user-chip"><span class="avatar">' + esc((user.name||"U").slice(0,1)) + '</span><span><b>' + esc(user.name) + '</b><small>' + esc(user.role) + '</small></span></div><button class="side-link" data-action="logout"><span class="nav-symbol">↪</span>Cerrar sesión</button></div></aside>';
    var main="";
    if (section==="overview") main=renderOverview(overview);
    if (section==="orders") main=renderOrders(orders,couriers);
    if (section==="catalog") main=renderProducts(products);
    if (section==="tracking") main=renderLocations(locations);
    if (section==="settings") main=renderSettings(settings,activity);
    var storeUrl=location.origin+"/tienda.html?comercio=mercadito-la-esquina";
    content='<div class="admin-layout">' + nav + '<main class="workspace"><div class="workspace-top"><div class="crumb">COMERCIO <span>/</span> ' + esc(section.toUpperCase()) + '</div><div class="workspace-actions"><a class="btn btn-quiet btn-small" target="_blank" rel="noopener" href="/tienda.html?comercio=mercadito-la-esquina">Abrir tienda ↗</a><span class="sync-label"><i></i> Conectado en vivo</span></div></div><div class="workspace-content">' + main + '</div></main></div>';
    app.innerHTML=shell(content,"admin");
  }
  function renderOverview(data) {
    var c=data.counts||{};
    return header("CENTRO DE OPERACIONES","Tu comercio, en un solo lugar","Resumen calculado desde los pedidos guardados en esta base de datos.",
      '<a class="btn btn-primary" href="/tienda.html?comercio=mercadito-la-esquina" target="_blank" rel="noopener">Ver tienda <span>↗</span></a>')+
      '<div class="metric-grid"><article class="metric"><span>Pedidos de hoy</span><strong>'+(data.orders_today||0)+'</strong><small>Según hora UTC del servidor</small></article><article class="metric"><span>Por confirmar</span><strong>'+(c.received||0)+'</strong><small>Pedidos recién recibidos</small></article><article class="metric"><span>En reparto</span><strong>'+(c.in_delivery||0)+'</strong><small>Estado actualizado por el rider</small></article><article class="metric"><span>Ventas entregadas</span><strong>'+money(data.sales_delivered)+'</strong><small>Solo pedidos marcados entregados</small></article></div>'+
      '<div class="overview-grid"><section class="panel panel-dark"><div class="panel-kicker">OPERACIÓN CONECTADA</div><h2>Del enlace a la entrega</h2><p>El cliente arma el carrito en la tienda. El pedido llega a esta bandeja y el repartidor actualiza el avance desde su teléfono.</p><div class="mini-flow"><span>Cliente</span><b>→</b><span>Panel</span><b>→</b><span>Rider</span></div><button class="btn btn-white" data-section="orders">Abrir bandeja de pedidos</button></section><section class="panel"><div class="panel-title-row"><div><span class="eyebrow">COBROS</span><h3>Estado de pagos</h3></div><span class="badge badge-pending">'+(data.payments_pending||0)+' pendientes</span></div><div class="payment-line"><span><i class="method-dot cash"></i>Efectivo al recibir</span><b>Disponible</b></div><div class="payment-line"><span><i class="method-dot transfer"></i>Transferencia</span><b>Verificación manual</b></div><div class="payment-line"><span><i class="method-dot card"></i>Tarjeta</span><b>Pendiente de integración</b></div><p class="fine-print">No se simulan aprobaciones. El proveedor de pago y sus credenciales aún no están conectados.</p></section></div>'+
      '<div class="panel onboarding"><div><span class="eyebrow">SIGUIENTE PASO OPERATIVO</span><h3>Probá el flujo con un pedido demo</h3><p>Creá el pedido desde la tienda, confirmalo aquí, preparalo, asigná el rider Android y seguí su ubicación activa.</p></div><a class="btn btn-primary" href="/tienda.html?comercio=mercadito-la-esquina" target="_blank" rel="noopener">Crear pedido de prueba</a></div>';
  }
  function renderOrders(orders,couriers) {
    var rows=orders||[];
    var html=header("GESTIÓN COMERCIAL","Pedidos","La misma bandeja recibe pedidos de la tienda y sus cambios de estado.",'<button class="btn btn-quiet" data-action="refresh">Actualizar</button>')+
      '<div class="filter-row"><span class="badge badge-neutral">'+rows.length+' pedidos recientes</span><span class="fine-print">Los importes se calculan en el servidor con el catálogo vigente.</span></div>';
    if(!rows.length)return html+'<div class="empty-state"><span class="empty-icon">▤</span><h3>La bandeja está lista</h3><p>Cuando un cliente complete un pedido desde la tienda, aparecerá aquí y el panel recibirá la actualización en vivo.</p><a class="btn btn-primary" href="/tienda.html?comercio=mercadito-la-esquina" target="_blank" rel="noopener">Abrir tienda de prueba</a></div>';
    html+='<div class="order-list">';
    rows.forEach(function(o){
      var actions="";
      if(o.status==="received")actions+='<button class="btn btn-primary btn-small" data-action="order-status" data-id="'+esc(o.id)+'" data-status="confirmed">Confirmar pedido</button>';
      if(o.status==="confirmed")actions+='<button class="btn btn-primary btn-small" data-action="order-status" data-id="'+esc(o.id)+'" data-status="preparing">Iniciar preparación</button>';
      if(o.status==="preparing")actions+='<button class="btn btn-primary btn-small" data-action="order-status" data-id="'+esc(o.id)+'" data-status="ready">Marcar listo</button>';
      if(o.status==="ready"||o.status==="confirmed"||o.status==="preparing"){
        var select='<select class="inline-select" id="courier-'+esc(o.id)+'" aria-label="Seleccionar repartidor"><option value="">Asignar rider…</option>';
        (couriers||[]).forEach(function(r){select+='<option value="'+r.id+'" '+(Number(o.courier_id)===Number(r.id)?"selected":"")+'>'+esc(r.name)+'</option>';});
        select+='</select>';
        actions+=select+'<button class="btn btn-outline btn-small" data-action="assign" data-id="'+esc(o.id)+'">Asignar</button>';
      }
      if(o.status==="received"||o.status==="confirmed"||o.status==="preparing"||o.status==="ready")actions+='<button class="btn btn-text-danger btn-small" data-action="order-status" data-id="'+esc(o.id)+'" data-status="cancelled">Cancelar</button>';
      var items=(o.items||[]).map(function(x){return '<li>'+esc(x.quantity)+' × '+esc(x.name_snapshot)+' <span>'+money(x.unit_price*x.quantity)+'</span></li>';}).join("");
      var transfer="";
      if(o.payment_state==="pending_verification"||o.payment_state==="pending_cash")transfer='<button class="btn btn-outline btn-small" data-action="verify-transfer" data-id="'+esc(o.id)+'">'+(o.payment_method==="cash"?"Verificar efectivo":"Verificar transferencia")+'</button>';
      var history=(o.events||[]).map(function(e){return '<li><b>'+esc((e.event_type||"").replace(/_/g," "))+'</b><span>'+esc(e.message||statusLabel(e.new_value))+' · '+date(e.created_at)+'</span></li>';}).join("");
      html+='<article class="order-card"><div class="order-card-top"><div><span class="order-ref">'+esc(o.id)+'</span><span class="badge badge-'+esc(o.status)+'">'+esc(statusLabel(o.status))+'</span></div><time>'+date(o.created_at)+'</time></div><div class="order-card-body"><div class="order-customer"><h3>'+esc(o.customer_name)+'</h3><a href="tel:'+esc(o.phone)+'">'+esc(o.phone)+'</a><p>'+esc(o.address)+(o.reference?" · "+esc(o.reference):"")+'</p></div><div class="order-items"><ul>'+items+'</ul></div><div class="order-total"><span>Total</span><b>'+money(o.total)+'</b><small>'+esc(o.payment_method==="cash"?"Efectivo":o.payment_method==="transfer"?"Transferencia":"Tarjeta")+" · "+esc(statusLabel(o.payment_state))+'</small></div></div><div class="order-card-bottom"><div class="assigned-label">'+(o.courier_name?"Rider: <b>"+esc(o.courier_name)+"</b>":'Sin rider asignado')+(o.delivery_status?" · Entrega "+esc(statusLabel(o.delivery_status)):"")+'</div><div class="action-row">'+actions+transfer+'</div></div><details class="order-history"><summary>Historial de actividad</summary><ul>'+history+'</ul></details></article>';
    });
    return html+'</div>';
  }
  function renderProducts(products) {
    var html=header("CATÁLOGO","Productos","Precios y disponibilidad se comparten con la tienda del comercio.")+
      '<div class="catalog-layout"><section class="panel"><div class="panel-title-row"><div><span class="eyebrow">CATÁLOGO ACTUAL</span><h3>'+(products||[]).length+' productos</h3></div></div><div class="product-admin-list">';
    (products||[]).forEach(function(p){
      html+='<article class="product-admin"><div class="product-tile">'+esc((p.name||"P").slice(0,1))+'</div><div class="product-meta"><b>'+esc(p.name)+'</b><span>'+esc(p.category)+' · '+money(p.price)+'</span></div><span class="badge '+(p.available?"badge-live":"badge-neutral")+'">'+(p.available?"Disponible":"Oculto")+'</span><button class="btn btn-quiet btn-small" data-action="product-toggle" data-id="'+esc(p.id)+'" data-available="'+(!p.available)+'">'+(p.available?"Ocultar":"Publicar")+'</button></article>';
    });
    html+='</div></section><section class="panel"><span class="eyebrow">AGREGAR</span><h3>Nuevo producto</h3><form id="product-form" class="form-stack compact"><label>Nombre<input name="name" required maxlength="100" placeholder="Ej. Pan integral"></label><label>Categoría<input name="category" required maxlength="60" placeholder="Ej. Panadería"></label><label>Descripción<input name="description" maxlength="300" placeholder="Detalle breve"></label><label>Precio en córdobas<input name="price" type="number" min="0" step="0.01" required placeholder="0.00"></label><button class="btn btn-primary" type="submit">Guardar producto</button></form><p class="fine-print">El producto aparecerá en el catálogo de la tienda al guardarse.</p></section></div>';
    return html;
  }
  function renderLocations(locations) {
    var rows=locations||[];
    var html=header("ÚLTIMA MILLA","Reparto y ubicación","Las coordenadas solo aparecen durante una ruta activa, con permiso del rider y con datos recientes.",
      '<span class="badge badge-live">Monitoreo de entregas</span>')+
      '<div class="privacy-banner"><span class="privacy-icon">⌖</span><div><b>Control de ubicación activo por entrega</b><p>El repartidor inicia el permiso desde su teléfono; el sistema deja de aceptar nuevas coordenadas al pausar o completar la ruta. Los puntos vencen a las 6 horas.</p></div></div>';
    if(!rows.length)return html+'<div class="empty-state"><span class="empty-icon">⌖</span><h3>No hay ubicación compartida ahora</h3><p>Las coordenadas aparecen cuando el rider inicia una ruta y activa explícitamente compartir ubicación.</p></div>';
    html+='<div class="location-grid">';
    rows.forEach(function(l){
      var map="https://www.openstreetmap.org/?mlat="+encodeURIComponent(l.latitude)+"&mlon="+encodeURIComponent(l.longitude)+"#map=16/"+encodeURIComponent(l.latitude)+"/"+encodeURIComponent(l.longitude);
      html+='<article class="location-card"><div class="location-pin">⌖</div><div><span class="eyebrow">'+esc(statusLabel(l.status))+'</span><h3>'+esc(l.courier_name)+'</h3><p>Pedido '+esc(l.order_id)+' · '+esc(l.customer_name)+'</p><small>Actualizado '+date(l.recorded_at)+' · precisión aproximada '+Math.round(l.accuracy||0)+' m</small></div><a class="btn btn-outline btn-small" href="'+map+'" target="_blank" rel="noopener">Ver punto ↗</a></article>';
    });
    return html+'</div>';
  }
  function renderSettings(s,activity) {
    return header("CONFIGURACIÓN","Tu comercio","Personalizá la identidad y la tarifa que ve el cliente en el enlace.")+
      '<div class="settings-layout"><section class="panel"><span class="eyebrow">MARCA Y ENTREGA</span><h3>Preferencias de la tienda</h3><form id="settings-form" class="form-stack compact"><label>Nombre del comercio<input name="name" value="'+esc(s.name)+'" required maxlength="100"></label><label>Frase breve<input name="tagline" value="'+esc(s.tagline)+'" maxlength="160"></label><label>Color de marca<div class="color-control"><input name="color" type="color" value="'+esc(s.color)+'"><span>'+esc(s.color)+'</span></div></label><label>Tarifa de entrega en córdobas<input name="delivery_fee" type="number" min="0" step="0.01" value="'+(Number(s.delivery_fee)/100).toFixed(2)+'" required></label><label>Instrucciones de transferencia<textarea name="transfer_instructions" rows="3" maxlength="500">'+esc(s.transfer_instructions)+'</textarea></label><button class="btn btn-primary" type="submit">Guardar configuración</button></form></section><div class="settings-stack"><section class="panel"><span class="eyebrow">ENLACE PARA COMPARTIR</span><h3>Tu tienda ya tiene un enlace</h3><p class="muted">Podés enviarlo por WhatsApp, Messenger, Facebook o copiarlo en tus perfiles. El cliente compra desde el navegador.</p><div class="share-url"><code id="store-url">'+esc(location.origin+'/tienda.html?comercio='+s.slug)+'</code><button class="btn btn-outline btn-small" data-action="copy-store">Copiar enlace</button></div><div class="settings-payment"><b>Métodos de pago</b><div class="payment-line"><span>Efectivo al recibir</span><b class="text-success">Habilitado</b></div><div class="payment-line"><span>Transferencia</span><b>Confirmación manual</b></div><div class="payment-line"><span>Tarjetas</span><b>Pendiente del proveedor</b></div></div><p class="fine-print">Para pagos con tarjeta hace falta integrar y validar una pasarela/adquirente con contrato y credenciales del comercio. No se almacenan datos de tarjeta.</p></section><section class="panel"><span class="eyebrow">AUDITORÍA</span><h3>Actividad reciente</h3><ul class="audit-list">'+((activity||[]).map(function(x){return '<li><b>'+esc((x.action||"").replace(/_/g," "))+'</b><span>'+esc(x.entity_type)+" "+esc(x.entity_id)+" · "+esc(x.details)+" · "+date(x.created_at)+'</span></li>';}).join("")||'<li><span>Aún no hay cambios registrados.</span></li>')+'</ul></section></div></div>';
  }
  function storeShell(title, body, color) {
    document.documentElement.style.setProperty("--merchant", /^#[0-9a-f]{6}$/i.test(color||"")?color:"#155eef");
    return shell('<main class="storefront"><div class="store-top"><div><a class="store-brand" href="/tienda.html?comercio='+encodeURIComponent(slug)+'"><span class="store-mark">✦</span><b>'+esc(title)+'</b></a><span class="store-caption">PEDIDOS DIRECTOS · NICARAGUA</span></div><a class="store-admin-link" href="/admin.html">Acceso comercio</a></div>'+body+'</main>',"store");
  }
  async function startStore() {
    endPoll();stopEventStream();
    try {
      var data=await api("/api/storefront?slug="+encodeURIComponent(slug));
      storeData=data;
      renderStore();
      beginPoll(function(){api("/api/storefront?slug="+encodeURIComponent(slug)).then(function(x){storeData=x;renderStore();}).catch(function(){});},30);
    } catch(err) { app.innerHTML=shell('<main class="error-page"><span class="eyebrow">TIENDA</span><h1>Este enlace no está disponible</h1><p>'+esc(err.message)+'</p><a class="btn btn-primary" href="/admin.html">Volver al panel</a></main>',"store"); }
  }
  function renderStore() {
    if(!storeData)return;
    var s=storeData.store, products=storeData.products||[];
    document.title=s.name+" | White Software";
    var categories=["Todos"].concat(Array.from(new Set(products.map(function(p){return p.category;}))));
    var selected=params.get("categoria")||"Todos";
    var display=products.filter(function(p){return p.available && (selected==="Todos"||p.category===selected);});
    var categoriesHtml=categories.map(function(c){return '<button class="category-chip '+(selected===c?"selected":"")+'" data-category="'+esc(c)+'">'+esc(c)+'</button>';}).join("");
    var cards=display.map(function(p){return '<article class="store-product"><div class="store-product-image">'+esc(p.category.slice(0,1))+'</div><div class="store-product-content"><span class="product-category">'+esc(p.category)+'</span><h3>'+esc(p.name)+'</h3><p>'+esc(p.description)+'</p><div class="store-product-footer"><b>'+money(p.price,s.currency)+'</b><button class="add-button" data-action="cart-add" data-id="'+esc(p.id)+'" aria-label="Agregar '+esc(p.name)+'">+</button></div></div></article>';}).join("");
    var cartLines=Object.keys(cart).map(function(id){var p=products.find(function(x){return x.id===id;});if(!p)return "";return '<div class="cart-line"><span>'+esc(p.name)+' <small>× '+cart[id]+'</small></span><strong>'+money(p.price*cart[id],s.currency)+'</strong><div class="qty-control"><button data-action="cart-minus" data-id="'+esc(id)+'" aria-label="Quitar uno">−</button><b>'+cart[id]+'</b><button data-action="cart-add" data-id="'+esc(id)+'" aria-label="Agregar uno">+</button></div></div>';}).join("");
    var count=Object.values(cart).reduce(function(a,b){return a+b;},0);
    var subtotal=Object.keys(cart).reduce(function(sum,id){var p=products.find(function(x){return x.id===id;});return sum+(p?p.price*cart[id]:0);},0);
    var methods=s.payments||[];
    var methodOptions=(methods.includes("cash")?'<option value="cash">Efectivo al recibir</option>':"")+(methods.includes("transfer")?'<option value="transfer">Transferencia bancaria</option>':"")+'<option value="card" disabled>Tarjeta · pendiente de integración</option>';
    var body='<section class="store-hero"><div class="hero-copy"><span class="eyebrow">TIENDA EN LÍNEA</span><h1>'+esc(s.name)+'</h1><p>'+esc(s.tagline||"Elegí tus productos y pedí directo a este comercio.")+'</p><div class="hero-proof"><span>✓ Sin instalar aplicación</span><span>✓ Entrega propia del comercio</span></div></div><div class="hero-art"><div class="hero-circle"></div><div class="hero-box"><span>Tu pedido</span><b>cerca de vos</b><i>✦</i></div></div></section>'+
      '<div class="store-main"><section class="catalog-column"><div class="catalog-heading"><div><span class="eyebrow">CATÁLOGO</span><h2>Elegí lo que necesitás</h2></div><label class="search-box"><span>⌕</span><input id="product-search" placeholder="Buscar producto" aria-label="Buscar producto"></label></div><div class="category-row">'+categoriesHtml+'</div><div class="store-product-grid">'+(cards||'<div class="empty-inline">No hay productos en esta categoría.</div>')+'</div></section><aside class="cart-panel"><div class="cart-title"><div><span class="eyebrow">TU COMPRA</span><h2>Carrito <span>'+count+'</span></h2></div><span class="cart-bag">▱</span></div><div class="cart-lines">'+(cartLines||'<div class="cart-empty"><span>＋</span><p>Agregá productos para iniciar tu pedido.</p></div>')+'</div><div class="price-breakdown"><div><span>Subtotal</span><b>'+money(subtotal,s.currency)+'</b></div><div><span>Entrega</span><b>'+money(s.delivery_fee,s.currency)+'</b></div><div class="grand-total"><span>Total</span><b>'+money(subtotal+(count?s.delivery_fee:0),s.currency)+'</b></div></div><form id="checkout-form" class="form-stack checkout-form"><label>Nombre<input name="customer_name" required maxlength="100" placeholder="Tu nombre"></label><label>Teléfono<input name="phone" type="tel" required minlength="7" maxlength="40" placeholder="Ej. 8888 0000"></label><label>Dirección de entrega<textarea name="address" required minlength="5" maxlength="300" rows="2" placeholder="Barrio, calle, número"></textarea></label><label>Referencia para encontrar el lugar<input name="reference" maxlength="300" placeholder="Casa azul, frente al parque"></label><label>Forma de pago<select name="payment_method" required>'+methodOptions+'</select></label><div id="transfer-note" class="transfer-note" hidden>'+esc(s.transfer_instructions)+'</div><button class="btn btn-primary btn-wide" type="submit" '+(!count?"disabled":"")+'>Enviar pedido · '+money(subtotal+(count?s.delivery_fee:0),s.currency)+'</button><small class="checkout-privacy">El comercio recibirá tus datos para entregar este pedido. No se piden datos de tarjeta.</small></form></aside></div>'+
      '<div class="store-footer-line"><span>Horario y cobertura: confirmalos con el comercio al recibir su pedido.</span><span>Pago con tarjeta: pendiente de integración</span></div>';
    app.innerHTML=storeShell(s.name,body,s.color);
    var search=document.getElementById("product-search");
    var paymentSelect=document.querySelector('#checkout-form select[name="payment_method"]');
    if(paymentSelect)paymentSelect.addEventListener("change",function(){var note=document.getElementById("transfer-note");note.hidden=paymentSelect.value!=="transfer";});
    if(search)search.addEventListener("input",function(){
      var value=search.value.toLowerCase();
      document.querySelectorAll(".store-product").forEach(function(card){card.hidden=!card.textContent.toLowerCase().includes(value);});
    });
  }
  async function submitOrder(form) {
    if(!storeData||!Object.keys(cart).length)throw new Error("Agregá productos antes de enviar el pedido.");
    var data=new FormData(form);
    if(!pendingKey)pendingKey=(crypto.randomUUID?crypto.randomUUID():("order-"+Date.now()+"-"+Math.random().toString(36).slice(2)));
    var payload={slug:slug,customer_name:data.get("customer_name"),phone:data.get("phone"),address:data.get("address"),reference:data.get("reference"),payment_method:data.get("payment_method"),idempotency_key:pendingKey,items:Object.keys(cart).map(function(id){return {product_id:id,quantity:cart[id]};})};
    var result=await api("/api/orders",{method:"POST",body:payload});
    cart={};pendingKey="";
    location.href="/seguimiento.html?token="+encodeURIComponent(result.tracking_token);
  }
  async function startTracking() {
    endPoll();stopEventStream();
    var token=params.get("token")||"";
    async function load() {
      try {
        var data=await api("/api/tracking?token="+encodeURIComponent(token));
        renderTracking(data);
      } catch(err) { app.innerHTML=shell('<main class="error-page"><span class="eyebrow">SEGUIMIENTO</span><h1>No encontramos el pedido</h1><p>'+esc(err.message)+'</p><a class="btn btn-primary" href="/tienda.html?comercio='+encodeURIComponent(slug)+'">Ir a la tienda</a></main>'); }
    }
    await load();connectEventStream("tracking",load,token);beginPoll(load,15);
  }
  function renderTracking(data) {
    var o=data.order,d=data.delivery,loc=data.location;
    var stages=["received","confirmed","preparing","ready","in_delivery","delivered"];
    var current=stages.indexOf(o.status);
    var timeline=stages.map(function(s,i){var state=i<current?"done":i===current?"active":"";return '<div class="timeline-step '+state+'"><i>'+(i<current?"✓":i+1)+'</i><span>'+esc(statusLabel(s))+'</span></div>';}).join("");
    var locationHtml="";
    if(loc){
      var url="https://www.openstreetmap.org/?mlat="+encodeURIComponent(loc.latitude)+"&mlon="+encodeURIComponent(loc.longitude)+"#map=16/"+encodeURIComponent(loc.latitude)+"/"+encodeURIComponent(loc.longitude);
      locationHtml='<div class="live-location"><span class="live-pulse"></span><div><b>Ubicación compartida por el repartidor</b><p>Última actualización '+date(loc.recorded_at)+'</p></div><a class="btn btn-outline btn-small" href="'+url+'" target="_blank" rel="noopener">Ver mapa ↗</a></div>';
    } else if(d&&["accepted","picked_up","on_route"].includes(d.status)){
      locationHtml='<div class="location-wait"><span>⌖</span><p>El repartidor aún no comparte una ubicación reciente. El seguimiento de estado sigue activo.</p></div>';
    }
    var body='<div class="tracking-wrap"><a class="back-link" href="/tienda.html?comercio='+encodeURIComponent(slug)+'">← Volver a la tienda</a><section class="tracking-card"><div class="tracking-head"><div><span class="eyebrow">SEGUIMIENTO DEL PEDIDO</span><h1>Pedido '+esc(o.id)+'</h1><p>El comercio actualizará el avance de tu compra desde su panel.</p></div><span class="badge badge-'+esc(o.status)+'">'+esc(statusLabel(o.status))+'</span></div><div class="timeline">'+timeline+'</div><div class="tracking-details"><div><span>Forma de pago</span><b>'+esc(o.payment_method==="cash"?"Efectivo al recibir":o.payment_method==="transfer"?"Transferencia":"Tarjeta")+' · '+esc(statusLabel(o.payment_state))+'</b></div><div><span>Total del pedido</span><b>'+money(o.total)+'</b></div><div><span>Recibido</span><b>'+date(o.created_at)+'</b></div></div>'+locationHtml+'<p class="refresh-note"><span class="live-pulse"></span>Estado y ubicación se actualizan en vivo.</p></section><p class="tracking-foot">Este enlace muestra solo el estado y el seguimiento autorizado de este pedido. Guardalo para volver a consultarlo.</p></div>';
    app.innerHTML=shell('<main class="tracking-page">'+body+'</main>',"tracking");
  }
  async function startRider() {
    endPoll();stopEventStream();
    var user;
    try{user=await getSession();}catch(_){user=null;}
    if(!user)return renderLogin("rider");
    if(user.role!=="courier"){app.innerHTML=shell('<main class="error-page"><h1>Esta cuenta no tiene perfil de repartidor</h1><p>Ingresá con una cuenta courier de este comercio.</p><button class="btn btn-outline" data-action="logout">Cerrar sesión</button></main>');return;}
    riderUser=user;await renderRider();connectEventStream("rider",renderRider);beginPoll(renderRider,15);
  }
  async function renderRider() {
    var result;
    try{result=await api("/api/rider/tasks");}
    catch(err){if(err.status===401)return renderLogin("rider");toast(err.message,"error");return;}
    var tasks=result.tasks||[];
    var activeGeo=geoWatch!==null;
    var cards=tasks.map(function(t){
      var next="",hint="";
      if(t.delivery_status==="assigned")next='<button class="btn btn-primary btn-wide" data-action="rider-event" data-id="'+esc(t.id)+'" data-status="accepted">Aceptar entrega</button>';
      if(t.delivery_status==="accepted"){
        if(t.order_status==="ready")next='<button class="btn btn-primary btn-wide" data-action="rider-event" data-id="'+esc(t.id)+'" data-status="picked_up">Marcar pedido recogido</button>';
        else hint='<div class="rider-wait">Esperá a que el comercio confirme el pedido como listo para recoger.</div>';
      }
      if(t.delivery_status==="picked_up")next='<button class="btn btn-primary btn-wide" data-action="rider-event" data-id="'+esc(t.id)+'" data-status="on_route">Iniciar ruta</button>';
      if(t.delivery_status==="on_route"){
        next=(activeGeo&&locationOrder===t.id?'<button class="btn btn-outline btn-wide" data-action="gps-stop" data-id="'+esc(t.id)+'">Pausar ubicación compartida</button>':'<button class="btn btn-outline btn-wide" data-action="gps-start" data-id="'+esc(t.id)+'">Activar GPS para esta entrega</button>')+
          '<button class="btn btn-primary btn-wide" data-action="rider-event" data-id="'+esc(t.id)+'" data-status="delivered" data-payment-method="'+esc(t.payment_method)+'" data-total="'+esc(t.total)+'">Confirmar entrega</button><button class="btn btn-text-danger btn-wide" data-action="rider-incident" data-id="'+esc(t.id)+'">Reportar incidencia</button>';
      }
      var mapLink="https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(t.address);
      var itemNames=(t.items||[]).map(function(item){return '<li>'+esc(item.quantity)+' × '+esc(item.name_snapshot)+'</li>';}).join("");
      return '<article class="rider-task"><div class="task-top"><span class="badge badge-'+esc(t.order_status)+'">'+esc(statusLabel(t.order_status))+'</span><span class="task-id">'+esc(t.id)+'</span></div><h2>'+esc(t.customer_name)+'</h2><a class="rider-phone" href="tel:'+esc(t.phone)+'">☎ '+esc(t.phone)+'</a><div class="rider-address"><span>⌖</span><div><b>Dirección de entrega</b><p>'+esc(t.address)+'</p>'+(t.reference?'<small>'+esc(t.reference)+'</small>':'')+'<a target="_blank" rel="noopener" href="'+mapLink+'">Abrir indicaciones ↗</a></div></div><ul class="rider-items">'+itemNames+'</ul><div class="task-foot"><span>'+esc(t.payment_method==="cash"?"Cobrar en efectivo":t.payment_method==="transfer"?"Transferencia":"Pago tarjeta")+'</span><b>'+money(t.total)+'</b></div><div class="task-actions">'+hint+next+'</div></article>';
    }).join("");
    var empty=tasks.length?"":'<div class="empty-state rider-empty"><span class="empty-icon">✓</span><h2>No tenés entregas asignadas</h2><p>Cuando despacho te asigne un pedido, aparecerá aquí.</p></div>';
    var content='<main class="rider-page"><div class="rider-header"><div><span class="eyebrow">APLICACIÓN WEB DE REPARTO</span><h1>Hola, '+esc(riderUser.name.split(" ")[0])+'</h1><p>Consultá tu asignación y actualizá cada paso de la entrega.</p></div><button class="btn btn-quiet" data-action="logout">Salir</button></div><div class="rider-safety"><span class="privacy-icon">⌖</span><div><b>'+(activeGeo?"GPS compartido en la entrega activa":"La ubicación está apagada")+'</b><p>'+(activeGeo?"El comercio puede ver una posición reciente mientras esta ruta siga activa.":"El GPS solo se solicita tras iniciar una ruta y tocar Activar GPS. Podés pausarlo o completar la entrega.")+'</p></div><span class="gps-indicator '+(activeGeo?"on":"")+'"><i></i>'+(activeGeo?"ACTIVO":"INACTIVO")+'</span></div><div class="rider-task-list">'+cards+empty+'</div></main>';
    app.innerHTML=shell(content,"rider");
  }
  function queueRead(){try{return JSON.parse(localStorage.getItem(queueKey)||"[]");}catch(_){return [];}}
  function queueWrite(list){localStorage.setItem(queueKey,JSON.stringify(list));}
  async function flushQueue(){
    if(!navigator.onLine)return;
    var list=queueRead();
    while(list.length){
      try{await api("/api/rider/tasks/"+encodeURIComponent(list[0].order_id)+"/event",{method:"POST",body:list[0]});list.shift();queueWrite(list);}
      catch(err){if(err.status===409){list.shift();queueWrite(list);continue;}break;}
    }
    if(view==="reparto")renderRider();
  }
  async function riderEvent(button) {
    var oid=button.dataset.id, target=button.dataset.status;
    if(target==="delivered"&&!confirm("¿Confirmás que entregaste el pedido?"))return;
    var body={status:target,event_id:"evt-"+(crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random().toString(36).slice(2))};
    if(target==="delivered"&&button.dataset.paymentMethod==="cash"){
      body.payment_collected=confirm("¿Recibiste "+money(button.dataset.total)+" en efectivo? Aceptar = sí; Cancelar = queda pendiente.");
    }
    try{
      if(!navigator.onLine)throw new Error("offline");
      await api("/api/rider/tasks/"+encodeURIComponent(oid)+"/event",{method:"POST",body:body});
      if(target==="delivered"||target==="incident")stopGps(true);
      toast("Entrega actualizada: "+statusLabel(target),"success");
      await renderRider();
    }catch(err){
      if(!navigator.onLine||err.message==="offline"){
        var list=queueRead();list.push(Object.assign({order_id:oid},body));queueWrite(list);
        toast("Sin conexión: guardamos el cambio en este teléfono y se enviará al volver internet.","warning");
        await renderRider();
      }else toast(err.message,"error");
    }
  }
  function startGps(orderId) {
    if(!navigator.geolocation){toast("Este navegador no ofrece ubicación GPS.","error");return;}
    if(!navigator.onLine){toast("Conectate a internet para iniciar el seguimiento compartido.","error");return;}
    if(geoWatch!==null)stopGps(true);
    locationOrder=orderId;
    var activated=false;
    toast("Esperando el permiso de ubicación del teléfono…","info");
    geoWatch=navigator.geolocation.watchPosition(async function(position){
      if(!activated){
        try{await api("/api/rider/location/start",{method:"POST",body:{order_id:orderId}});activated=true;toast("Ubicación activa solo para esta entrega.","success");}
        catch(err){stopGps(false);toast(err.message,"error");return;}
      }
      if(Date.now()-locationLastSent<10000)return;
      locationLastSent=Date.now();
      api("/api/rider/location",{method:"POST",body:{order_id:orderId,latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy||0}}).catch(function(err){if(err.status===409)stopGps(false);});
    },function(err){
      stopGps(false);
      toast(err.code===1?"No se concedió permiso. La entrega continúa sin compartir GPS.":"No pudimos leer la ubicación. Revisá el GPS del teléfono.","error");
    },{enableHighAccuracy:true,maximumAge:5000,timeout:20000});
    renderRider();
  }
  async function stopGps(sendStop) {
    var oid=locationOrder;
    if(geoWatch!==null){navigator.geolocation.clearWatch(geoWatch);geoWatch=null;}
    locationOrder=null;locationLastSent=0;
    if(sendStop&&oid&&navigator.onLine){
      try{await api("/api/rider/location/stop",{method:"POST",body:{order_id:oid}});}catch(_){}
    }
    if(view==="reparto")renderRider();
  }
  async function handleClick(event) {
    var button=event.target.closest("[data-action],[data-section],[data-category]");
    if(!button)return;
    if(button.dataset.section){section=button.dataset.section;return renderAdmin();}
    if(button.dataset.category){params.set("categoria",button.dataset.category);history.replaceState(null,"","/tienda.html?comercio="+encodeURIComponent(slug)+"&categoria="+encodeURIComponent(button.dataset.category));return renderStore();}
    var action=button.dataset.action;
    try{
      if(action==="logout"){await stopGps(true);await api("/api/logout",{method:"POST",body:{}});location.href=view==="reparto"?"/?vista=reparto":"/admin.html";}
      if(action==="refresh")await renderAdmin();
      if(action==="cart-add"){var id=button.dataset.id;cart[id]=(cart[id]||0)+1;renderStore();}
      if(action==="cart-minus"){var cid=button.dataset.id;cart[cid]=Math.max(0,(cart[cid]||0)-1);if(!cart[cid])delete cart[cid];renderStore();}
      if(action==="order-status"){await api("/api/admin/orders/"+encodeURIComponent(button.dataset.id)+"/status",{method:"POST",body:{status:button.dataset.status}});toast("Pedido actualizado: "+statusLabel(button.dataset.status),"success");await renderAdmin();}
      if(action==="assign"){var select=document.getElementById("courier-"+button.dataset.id);if(!select||!select.value)throw new Error("Seleccioná un repartidor.");await api("/api/admin/orders/"+encodeURIComponent(button.dataset.id)+"/assign",{method:"POST",body:{courier_id:Number(select.value)}});toast("Repartidor asignado.","success");await renderAdmin();}
      if(action==="verify-transfer"){var note=prompt("Escribí una nota breve de verificación (sin datos bancarios completos):");if(note===null)return;await api("/api/admin/orders/"+encodeURIComponent(button.dataset.id)+"/payment",{method:"POST",body:{note:note}});toast("Verificación registrada por el comercio.","success");await renderAdmin();}
      if(action==="product-toggle"){await api("/api/admin/products/"+encodeURIComponent(button.dataset.id),{method:"POST",body:{available:button.dataset.available==="true"}});await renderAdmin();}
      if(action==="copy-store"){var url=document.getElementById("store-url").textContent;await navigator.clipboard.writeText(url);toast("Enlace copiado.","success");}
      if(action==="rider-event")await riderEvent(button);
      if(action==="gps-start")startGps(button.dataset.id);
      if(action==="gps-stop")await stopGps(true);
      if(action==="rider-incident"){var note=prompt("Describí brevemente el problema para que despacho pueda resolverlo:");if(note===null)return;await api("/api/rider/tasks/"+encodeURIComponent(button.dataset.id)+"/event",{method:"POST",body:{status:"incident",note:note,event_id:"evt-"+(crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random().toString(36).slice(2))}});await stopGps(true);toast("Incidencia enviada a despacho.","success");await renderRider();}
    }catch(err){toast(err.message,"error");}
  }
  app.addEventListener("click",handleClick);
  app.addEventListener("submit",async function(event){
    event.preventDefault();
    var form=event.target;
    try{
      if(form.id==="login-form"){
        var fd=new FormData(form);await login(fd.get("email"),fd.get("password"));toast("Sesión iniciada.","success");
        if(view==="reparto")await startRider();else await startAdmin();
      }
      if(form.id==="checkout-form")await submitOrder(form);
      if(form.id==="product-form"){
        var p=new FormData(form);var price=Math.round(Number(p.get("price"))*100);
        if(!Number.isFinite(price)||price<0)throw new Error("Ingresá un precio válido.");
        await api("/api/admin/products",{method:"POST",body:{name:p.get("name"),category:p.get("category"),description:p.get("description"),price:price}});
        toast("Producto guardado y publicado en la tienda.","success");await renderAdmin();
      }
      if(form.id==="settings-form"){
        var s=new FormData(form);var fee=Math.round(Number(s.get("delivery_fee"))*100);
        await api("/api/admin/settings",{method:"POST",body:{name:s.get("name"),tagline:s.get("tagline"),color:s.get("color"),delivery_fee:fee,transfer_instructions:s.get("transfer_instructions")}});
        toast("Configuración actualizada.","success");await renderAdmin();
      }
    }catch(err){toast(err.message,"error");}
  });
  window.addEventListener("online",flushQueue);
  window.addEventListener("beforeunload",function(){if(geoWatch!==null)navigator.geolocation.clearWatch(geoWatch);});
  if("serviceWorker" in navigator && location.protocol!=="file:")navigator.serviceWorker.register("/sw.js").catch(function(){});
  if(view==="tienda")startStore();
  else if(view==="seguimiento")startTracking();
  else if(view==="reparto")startRider();
  else startAdmin();
})();
