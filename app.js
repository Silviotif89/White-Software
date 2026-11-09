(() => {
  'use strict';

  const STORAGE_KEY = 'white-software-demo-v1';
  const ORDER_STAGES = ['Recibido', 'Confirmado', 'Preparando', 'Listo', 'En reparto', 'Entregado'];
  const CATEGORIES = ['Todo', 'Abarrotes', 'Lácteos', 'Panadería', 'Frutas y verduras'];
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const seed = {
    company: {
      name: 'Mercadito La Esquina',
      area: 'Managua, Nicaragua',
      phone: '2255 0148',
      deliveryFee: 45,
      color: '#176b5c'
    },
    products: [
      { id: 'p1', name: 'Café molido de Matagalpa', size: 'Bolsa · 500 g', price: 185, category: 'Abarrotes', icon: '☕', badge: 'Favorito', active: true, stock: 18 },
      { id: 'p2', name: 'Queso fresco artesanal', size: 'Por libra', price: 98, category: 'Lácteos', icon: '🧀', badge: '', active: true, stock: 12 },
      { id: 'p3', name: 'Pan de la casa', size: 'Bolsa · 6 unidades', price: 72, category: 'Panadería', icon: '🥖', badge: 'Hecho hoy', active: true, stock: 20 },
      { id: 'p4', name: 'Leche entera', size: 'Botella · 1 litro', price: 54, category: 'Lácteos', icon: '🥛', badge: '', active: true, stock: 16 },
      { id: 'p5', name: 'Banano maduro', size: 'Mano · 6 unidades', price: 48, category: 'Frutas y verduras', icon: '🍌', badge: 'De temporada', active: true, stock: 9 },
      { id: 'p6', name: 'Aceite vegetal', size: 'Botella · 900 ml', price: 112, category: 'Abarrotes', icon: '🫒', badge: '', active: true, stock: 11 },
      { id: 'p7', name: 'Huevos frescos', size: 'Cartón · 15 unidades', price: 116, category: 'Abarrotes', icon: '🥚', badge: '', active: true, stock: 15 },
      { id: 'p8', name: 'Naranjas dulces', size: 'Bolsa · 8 unidades', price: 65, category: 'Frutas y verduras', icon: '🍊', badge: '', active: true, stock: 13 }
    ],
    orders: [
      { id: 'WN-1048', customer: 'Daniela R.', phone: '8882 ••••', area: 'Bello Horizonte', address: 'De la rotonda 2 c. al norte', items: [{ name: 'Café molido de Matagalpa', qty: 1, price: 185 }, { name: 'Pan de la casa', qty: 2, price: 72 }], total: 374, status: 'Preparando', paymentStatus: 'Pendiente', paymentMethod: 'Efectivo al recibir', courier: 'María López', time: '10:18 a. m.' },
      { id: 'WN-1047', customer: 'Carlos M.', phone: '8774 ••••', area: 'Villa Fontana', address: 'Residencial Los Robles, casa 12', items: [{ name: 'Queso fresco artesanal', qty: 2, price: 98 }, { name: 'Leche entera', qty: 2, price: 54 }], total: 349, status: 'En reparto', paymentStatus: 'Pendiente', paymentMethod: 'Efectivo al recibir', courier: 'José Martínez', time: '10:06 a. m.' },
      { id: 'WN-1046', customer: 'Andrea P.', phone: '8851 ••••', area: 'Altamira', address: 'Semáforos de Villa Fontana, 1 c. arriba', items: [{ name: 'Huevos frescos', qty: 1, price: 116 }, { name: 'Aceite vegetal', qty: 1, price: 112 }], total: 273, status: 'Listo', paymentStatus: 'Pendiente', paymentMethod: 'Transferencia', courier: 'Sin asignar', time: '9:52 a. m.' },
      { id: 'WN-1045', customer: 'Miguel A.', phone: '8603 ••••', area: 'Las Colinas', address: 'Entrada principal, casa esquinera', items: [{ name: 'Naranjas dulces', qty: 2, price: 65 }], total: 175, status: 'Entregado', paymentStatus: 'Confirmado', paymentMethod: 'Efectivo al recibir', courier: 'María López', time: '9:31 a. m.' }
    ],
    couriers: [
      { id: 'c1', name: 'María López', initials: 'ML', zone: 'Bello Horizonte · Distrito VI', status: 'En reparto', completed: 8, rating: '4.9' },
      { id: 'c2', name: 'José Martínez', initials: 'JM', zone: 'Villa Fontana · Distrito I', status: 'En reparto', completed: 6, rating: '4.8' },
      { id: 'c3', name: 'Kevin Reyes', initials: 'KR', zone: 'Centro · Distrito II', status: 'Disponible', completed: 11, rating: '5.0' }
    ]
  };

  function readData() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && saved.company && Array.isArray(saved.products) && Array.isArray(saved.orders)) {
        return { ...structuredClone(seed), ...saved, company: { ...seed.company, ...saved.company } };
      }
    } catch (_) { /* storage can be unavailable in a restricted browser */ }
    return structuredClone(seed);
  }

  let data = readData();
  const initialView = new URLSearchParams(location.search).get('vista') || 'admin';
  const ui = {
    view: ['admin', 'tienda', 'reparto', 'seguimiento'].includes(initialView) ? initialView : 'admin',
    section: 'inicio',
    category: 'Todo',
    storeSearch: '',
    orderSearch: '',
    productSearch: '',
    cart: {},
    modal: null,
    trackingSearch: new URLSearchParams(location.search).get('pedido') || '',
    routeOrderId: null,
    geoPoint: null,
    geoMessage: 'La ubicación aún no está activa. Iniciá una entrega para compartirla desde este teléfono.'
  };
  let geoWatchId = null;

  const app = $('#app');
  if (!app) return;

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch (_) { toast('El navegador no permitió guardar los cambios en este dispositivo.'); }
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function money(value) {
    return `C$ ${Number(value || 0).toLocaleString('es-NI', { maximumFractionDigits: 0 })}`;
  }

  function initials(name) {
    return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'CN';
  }

  function safeColor(value) {
    return /^#[0-9a-f]{6}$/i.test(value || '') ? value : seed.company.color;
  }

  function applyBrand() {
    document.documentElement.style.setProperty('--brand', safeColor(data.company.color));
  }

  function setView(view) {
    if (!['admin', 'tienda', 'reparto', 'seguimiento'].includes(view)) return;
    if (view !== 'reparto') { stopLocationWatch(); ui.routeOrderId = null; }
    ui.view = view;
    ui.modal = null;
    const url = new URL(location.href);
    url.searchParams.set('vista', view);
    if (view !== 'seguimiento') url.searchParams.delete('pedido');
    history.replaceState({}, '', url);
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setSection(section) {
    ui.section = section;
    ui.orderSearch = '';
    ui.productSearch = '';
    closeSidebar();
    render();
  }

  function toast(message) {
    const region = $('#toast-region');
    if (!region) return;
    const item = document.createElement('div');
    item.className = 'toast';
    item.textContent = message;
    region.append(item);
    window.setTimeout(() => item.remove(), 3600);
  }

  function statusTone(status) {
    if (['Entregado', 'Disponible', 'Confirmado', 'Aprobado'].includes(status)) return 'status-green';
    if (['Listo', 'En reparto'].includes(status)) return 'status-blue';
    if (['Pendiente', 'Recibido', 'Preparando', 'Pendiente de confirmar'].includes(status)) return 'status-amber';
    if (['Cancelado', 'Rechazado', 'Fallido'].includes(status)) return 'status-red';
    return '';
  }

  function pill(status) {
    return `<span class="status-pill ${statusTone(status)}">${esc(status)}</span>`;
  }

  function demoStrip() {
    return `<div class="demo-strip"><span class="demo-dot"></span><span><b>Modo prototipo.</b> Los cambios quedan en este navegador. El pago con tarjeta y la sincronización entre dispositivos aún no están conectados.</span></div>`;
  }

  function navLink(section, icon, label) {
    return `<button class="nav-item ${ui.section === section ? 'active' : ''}" data-action="section" data-section="${section}"><span class="nav-icon" aria-hidden="true">${icon}</span><span>${label}</span></button>`;
  }

  function sidebar() {
    return `<aside class="sidebar" id="sidebar">
      <a class="brand-lockup" href="?vista=admin" data-action="set-view" data-view="admin" aria-label="Ir al panel de administración">
        <span class="brand-mark">W</span><span><span class="brand-name">White Software</span><span class="brand-caption">Pedidos y reparto</span></span>
      </a>
      <div class="tenant-card"><span class="tenant-logo">🛍️</span><span><span class="tenant-name">${esc(data.company.name)}</span><span class="tenant-meta">Cuenta de demostración</span></span></div>
      <div class="nav-label">Operación</div>
      <nav class="side-nav" aria-label="Navegación principal">
        ${navLink('inicio', '▦', 'Resumen')}
        ${navLink('pedidos', '▣', 'Pedidos')}
        ${navLink('productos', '◈', 'Catálogo')}
        ${navLink('repartidores', '⌁', 'Repartidores')}
      </nav>
      <div class="nav-label">Negocio</div>
      <nav class="side-nav" aria-label="Configuración del negocio">
        ${navLink('pagos', '▤', 'Pagos')}
        ${navLink('configuracion', '⚙', 'Apariencia y tienda')}
      </nav>
      <div class="sidebar-bottom">
        <div class="sidebar-help"><strong>Tu comercio, tu operación</strong>Compartí tu tienda por enlace y gestioná las entregas con tu propio equipo.</div>
        <div class="profile-row"><span class="avatar">AD</span><span><span class="profile-name">Administrador demo</span><span class="profile-role">Cuenta de muestra</span></span></div>
      </div>
    </aside>`;
  }

  function pageTitle() {
    return ({ inicio: 'Resumen', pedidos: 'Pedidos', productos: 'Catálogo', repartidores: 'Repartidores', pagos: 'Pagos', configuracion: 'Apariencia y tienda' })[ui.section] || 'Resumen';
  }

  function adminHeader() {
    return `<header class="topbar">
      <button class="mobile-menu" data-action="toggle-sidebar" aria-label="Abrir menú">☰</button>
      <div class="topbar-title"><p class="eyebrow">Panel del comercio</p><h1>${pageTitle()}</h1></div>
      <div class="topbar-actions"><span class="current-date">Managua · ${new Intl.DateTimeFormat('es-NI', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date())}</span><button class="btn btn-secondary" data-action="set-view" data-view="tienda">Abrir tienda ↗</button></div>
    </header>`;
  }

  function statCard(label, value, icon, foot) {
    return `<article class="stat-card"><div class="stat-top"><span>${label}</span><span class="stat-icon">${icon}</span></div><div class="stat-value">${value}</div><div class="stat-foot">${foot}</div></article>`;
  }

  function ordersToday() { return data.orders.length + 18; }

  function dashboard() {
    const latest = data.orders.slice(0, 4);
    return `<div class="page-heading"><div><h2>Buen día, Silvio</h2><p>Así marcha la operación de ${esc(data.company.name)}.</p></div><button class="btn btn-primary" data-action="section" data-section="pedidos">Ver pedidos <span aria-hidden="true">→</span></button></div>
      ${demoStrip()}
      <div class="stats-grid">
        ${statCard('Pedidos de hoy', ordersToday(), '▣', '<strong>+12%</strong> frente a ayer · demo')}
        ${statCard('Por confirmar', data.orders.filter(o => ['Recibido', 'Confirmado'].includes(o.status)).length + 3, '◷', 'Revisá los pedidos nuevos')}
        ${statCard('En reparto', data.orders.filter(o => o.status === 'En reparto').length + 2, '⌁', 'Tu equipo está en ruta · demo')}
        ${statCard('Ventas del día', money(18450 + data.orders.filter(o => o.status === 'Entregado').reduce((n,o)=>n+o.total,0)), '↗', 'Datos ilustrativos, no contables')}
      </div>
      <div class="dashboard-grid">
        <section class="panel"><div class="panel-header"><div><h3>Actividad de pedidos</h3><p>Últimos siete días · datos de muestra</p></div><div class="chart-legend"><span class="legend-dot"></span>Pedidos</div></div><div class="panel-body"><div class="chart" aria-label="Gráfico ilustrativo de pedidos semanales">${[42,67,53,85,61,100,74].map((height,i)=>`<div class="chart-col"><div class="chart-bar" style="height:${height}%"></div><span>${['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'][i]}</span></div>`).join('')}</div><div class="chart-caption"><span>Pedidos recibidos por día</span><span>Semana actual</span></div></div></section>
        <section class="panel"><div class="panel-header"><div><h3>Actividad reciente</h3><p>Movimientos de la cuenta demo</p></div><button class="btn btn-small btn-secondary" data-action="section" data-section="pedidos">Ver todo</button></div><div class="panel-body"><div class="activity-list">
          <div class="activity-row"><span class="activity-icon">＋</span><span><span class="activity-title">Pedido nuevo recibido</span><span class="activity-note">Daniela R. · Bello Horizonte</span></span><span class="activity-time">10:18</span></div>
          <div class="activity-row"><span class="activity-icon">⌁</span><span><span class="activity-title">Entrega en camino</span><span class="activity-note">José Martínez · Villa Fontana</span></span><span class="activity-time">10:06</span></div>
          <div class="activity-row"><span class="activity-icon">✓</span><span><span class="activity-title">Entrega completada</span><span class="activity-note">Miguel A. · Las Colinas</span></span><span class="activity-time">9:31</span></div>
          <div class="activity-row"><span class="activity-icon">▤</span><span><span class="activity-title">Pago contra entrega</span><span class="activity-note">Pendiente de conciliación</span></span><span class="activity-time">9:31</span></div>
        </div></div></section>
      </div>
      <section class="panel" style="margin-top:16px"><div class="panel-header"><div><h3>Pedidos recientes</h3><p>Atendé cada pedido y mantené informado al cliente.</p></div><button class="btn btn-small btn-quiet" data-action="section" data-section="pedidos">Abrir lista →</button></div>${orderTable(latest, true)}</section>`;
  }

  function orderTable(orders, compact = false) {
    if (!orders.length) return `<div class="empty-state"><strong>No hay pedidos que coincidan</strong>Cambiá el filtro o recibí un nuevo pedido desde la tienda demo.</div>`;
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Zona</th><th>Total</th><th>Estado</th><th>${compact ? '' : 'Pago'}</th><th></th></tr></thead><tbody>${orders.map(order=>`<tr>
      <td><span class="order-id">${esc(order.id)}</span><div class="cell-sub">${esc(order.time || 'Recién')}</div></td>
      <td><span class="customer-cell"><span class="mini-avatar">${initials(order.customer)}</span><span><span class="cell-main">${esc(order.customer)}</span><span class="cell-sub">${esc(order.phone)}</span></span></span></td>
      <td>${esc(order.area || 'Managua')}</td><td><span class="cell-main">${money(order.total)}</span></td><td>${pill(order.status)}</td>
      <td>${compact ? '' : `<span class="cell-main">${esc(order.paymentMethod || 'Tarjeta')}</span><span class="cell-sub">${esc(order.paymentStatus || 'Pendiente')}</span>`}</td>
      <td><button class="btn btn-small ${compact ? 'btn-secondary' : 'btn-quiet'}" data-action="advance-order" data-id="${esc(order.id)}">${compact ? 'Ver' : 'Siguiente →'}</button></td>
    </tr>`).join('')}</tbody></table></div>`;
  }

  function ordersPage() {
    const query = ui.orderSearch.toLowerCase().trim();
    const list = data.orders.filter(order => `${order.id} ${order.customer} ${order.area} ${order.status}`.toLowerCase().includes(query));
    return `<div class="page-heading"><div><h2>Controlá cada pedido</h2><p>Confirmá, prepará y asigná la entrega desde un solo lugar.</p></div><button class="btn btn-secondary" data-action="export-orders">Descargar CSV ↓</button></div>${demoStrip()}
      <section class="panel"><div class="panel-header"><div><h3>Todos los pedidos</h3><p>${data.orders.length} pedidos guardados en este navegador</p></div><div class="search-field"><span>⌕</span><input id="order-search" type="search" placeholder="Buscar código, cliente o zona" value="${esc(ui.orderSearch)}" autocomplete="off"></div></div>${orderTable(list, false)}</section>
      <p class="field-help" style="margin:12px 2px">Al avanzar un pedido, la demo cambia el estado localmente. En el sistema final cada cambio tendrá usuario, hora y sincronización con el comercio.</p>`;
  }

  function productsPage() {
    const query = ui.productSearch.toLowerCase().trim();
    const list = data.products.filter(p => `${p.name} ${p.category}`.toLowerCase().includes(query));
    return `<div class="page-heading"><div><h2>Tu catálogo listo para compartir</h2><p>Administrá productos y disponibilidad de tu tienda.</p></div><button class="btn btn-primary" data-action="add-product">＋ Agregar producto</button></div>${demoStrip()}
      <div class="section-toolbar"><div class="toolbar-left"><div class="search-field"><span>⌕</span><input id="product-search" type="search" placeholder="Buscar producto" value="${esc(ui.productSearch)}" autocomplete="off"></div></div><div class="toolbar-right"><span class="status-pill status-green">${data.products.filter(p=>p.active).length} disponibles</span></div></div>
      <div class="product-grid">${list.map(product=>`<article class="product-admin-card"><span class="product-thumb">${esc(product.icon)}</span><span><span class="product-name">${esc(product.name)}</span><span class="product-meta">${esc(product.category)} · ${esc(product.stock)} en inventario</span><span class="product-price">${money(product.price)}</span></span><button class="toggle ${product.active ? 'on' : ''}" role="switch" aria-checked="${product.active}" aria-label="Cambiar disponibilidad de ${esc(product.name)}" data-action="toggle-product" data-id="${esc(product.id)}"></button></article>`).join('')}</div>${list.length ? '' : `<div class="panel empty-state"><strong>No encontramos productos</strong>Probá otro nombre o categoría.</div>`}`;
  }

  function couriersPage() {
    return `<div class="page-heading"><div><h2>Tu propio equipo de reparto</h2><p>Asigná entregas y revisá quién está disponible.</p></div><button class="btn btn-secondary" data-action="set-view" data-view="reparto">Abrir vista de repartidor ↗</button></div>${demoStrip()}
      <div class="courier-grid">${data.couriers.map(c=>`<article class="courier-card"><div class="courier-card-top"><span class="courier-avatar">${esc(c.initials)}</span>${pill(c.status)}</div><div class="courier-name">${esc(c.name)}</div><div class="courier-zone">${esc(c.zone)}</div><div class="courier-stats"><div><strong>${c.completed}</strong><span>Entregas hoy · demo</span></div><div><strong>★ ${esc(c.rating)}</strong><span>Calificación de muestra</span></div></div><button class="btn btn-small btn-secondary" data-action="set-view" data-view="reparto">Ver entregas</button></article>`).join('')}</div>
      <section class="panel" style="margin-top:16px"><div class="panel-header"><div><h3>Asignaciones listas para salir</h3><p>Los pedidos listos pueden iniciar una entrega.</p></div></div>${orderTable(data.orders.filter(o=>['Listo','En reparto'].includes(o.status)), false)}</section>`;
  }

  function paymentsPage() {
    return `<div class="page-heading"><div><h2>Pagos del comercio</h2><p>La tienda está preparada para integrar un proveedor cuando definamos el contrato.</p></div></div>${demoStrip()}
      <div class="integration-card"><div class="integration-header"><div class="integration-title"><span class="integration-icon">▤</span><span><strong>Pagos con tarjeta</strong><small>Conector de proveedor · todavía no configurado</small></span></div>${pill('Pendiente')}</div>
        <ul class="check-list"><li><span>✓</span><span>El diseño no depende de BAC. El adquirente elegido debe confirmar qué marcas y tarjetas de distintos bancos puede procesar.</span></li><li><span>✓</span><span>Cada comercio debe contar con afiliación y reglas de liquidación aprobadas por el proveedor.</span></li><li><span>✓</span><span>La demo no captura tarjetas ni guarda credenciales. La integración real utilizará checkout alojado o tokenización del proveedor.</span></li><li><span>✓</span><span>Antes de elegir, comparar tarifas, liquidación, moneda, sandbox, webhooks, devoluciones, contracargos y soporte multiempresa.</span></li></ul>
        <div style="margin-top:17px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" data-action="provider-checklist">Ver requisitos para conectar</button><a class="btn btn-secondary" href="https://www.bcn.gob.ni/lista-de-proveedores-autorizados" target="_blank" rel="noreferrer">Consultar lista del BCN ↗</a></div>
      </div>
      <section class="panel" style="margin-top:15px"><div class="panel-header"><div><h3>Formas de pago de muestra</h3><p>La tienda permite pedido contra entrega o transferencia pendiente de confirmar.</p></div></div><div class="panel-body"><div class="activity-list"><div class="activity-row"><span class="activity-icon">💵</span><span><span class="activity-title">Efectivo al recibir</span><span class="activity-note">Disponible para la tienda de demostración</span></span>${pill('Activo')}</div><div class="activity-row"><span class="activity-icon">↗</span><span><span class="activity-title">Transferencia bancaria</span><span class="activity-note">Se confirma manualmente en esta demo</span></span>${pill('Activo')}</div><div class="activity-row"><span class="activity-icon">💳</span><span><span class="activity-title">Tarjeta</span><span class="activity-note">No cobra hasta conectar un proveedor real</span></span>${pill('Pendiente')}</div></div></div></section>`;
  }

  function settingsPage() {
    return `<div class="page-heading"><div><h2>Hacé que la tienda se sienta tuya</h2><p>Nombre y color principal de la tienda de ejemplo.</p></div><button class="btn btn-secondary" data-action="copy-link" data-link-view="tienda">Copiar enlace de tienda ⧉</button></div>${demoStrip()}
      <div class="settings-grid"><form class="panel settings-form" id="settings-form"><div class="form-grid">
        <div class="form-field full"><label class="field-label" for="company-name">Nombre del comercio</label><input class="input-control" id="company-name" name="companyName" value="${esc(data.company.name)}" maxlength="52" required></div>
        <div class="form-field"><label class="field-label" for="company-area">Departamento y municipio</label><input class="input-control" id="company-area" name="area" value="${esc(data.company.area)}" maxlength="60"></div>
        <div class="form-field"><label class="field-label" for="company-phone">Teléfono del negocio</label><input class="input-control" id="company-phone" name="phone" value="${esc(data.company.phone)}" maxlength="20"></div>
        <div class="form-field"><label class="field-label" for="delivery-fee">Tarifa de entrega de muestra</label><input class="input-control" id="delivery-fee" name="deliveryFee" type="number" min="0" step="5" value="${Number(data.company.deliveryFee)}"></div>
        <div class="form-field"><label class="field-label" for="company-color">Color principal</label><div class="inline-control"><input class="theme-input" id="company-color" name="color" type="color" value="${safeColor(data.company.color)}"><span class="field-help">Se aplica en el botón y encabezado de la tienda.</span></div></div>
        <div class="form-field full"><button class="btn btn-primary" type="submit">Guardar personalización</button></div>
      </div><p class="field-help" style="margin-top:14px">En producción, cada cambio se guardará en la cuenta del comercio después de iniciar sesión.</p></form>
      <div class="preview-store"><div class="preview-banner" id="brand-preview"><span>${esc(data.company.name)}</span></div><div class="preview-store-body"><span class="eyebrow">VISTA PREVIA DE LA TIENDA</span><div class="preview-product"><span>☕</span><span>Café molido de Matagalpa</span><strong style="margin-left:auto;color:var(--brand)">${money(185)}</strong></div><div class="preview-product"><span>🥖</span><span>Pan de la casa</span><strong style="margin-left:auto;color:var(--brand)">${money(72)}</strong></div><button class="btn btn-primary" style="width:100%;margin-top:13px" data-action="set-view" data-view="tienda">Abrir esta vista ↗</button></div></div></div>`;
  }

  function adminContent() {
    switch (ui.section) {
      case 'pedidos': return ordersPage();
      case 'productos': return productsPage();
      case 'repartidores': return couriersPage();
      case 'pagos': return paymentsPage();
      case 'configuracion': return settingsPage();
      default: return dashboard();
    }
  }

  function adminView() {
    return `<div class="app-layout">${sidebar()}<div class="overlay" id="overlay" data-action="close-sidebar"></div><div class="main-column">${adminHeader()}<main class="page-content">${adminContent()}</main></div></div>`;
  }

  function cartItems() {
    return Object.entries(ui.cart).map(([id, qty]) => {
      const product = data.products.find(item => item.id === id && item.active);
      return product ? { ...product, qty } : null;
    }).filter(Boolean);
  }

  function cartSubtotal() { return cartItems().reduce((sum, item) => sum + item.price * item.qty, 0); }
  function cartCount() { return cartItems().reduce((sum, item) => sum + item.qty, 0); }

  function cartPanel() {
    const items = cartItems();
    return `<aside class="cart-panel"><div class="cart-head"><strong>Tu pedido</strong><span class="cart-count">${cartCount()}</span></div><div class="cart-items">${items.length ? items.map(item=>`<div class="cart-line"><span class="cart-line-icon">${esc(item.icon)}</span><span><span class="cart-line-title">${esc(item.name)}</span><span class="cart-line-price">${money(item.price * item.qty)}</span></span><span class="quantity-controls"><button aria-label="Quitar una unidad" data-action="cart-qty" data-id="${esc(item.id)}" data-delta="-1">−</button><span>${item.qty}</span><button aria-label="Agregar una unidad" data-action="cart-qty" data-id="${esc(item.id)}" data-delta="1">+</button></span></div>`).join('') : `<div class="cart-empty"><span class="cart-empty-icon">🛍️</span>Tu carrito está vacío.<br>Agregá algo rico para empezar.</div>`}</div><div class="cart-summary"><div class="summary-row"><span>Subtotal</span><span>${money(cartSubtotal())}</span></div><div class="summary-row"><span>Envío</span><span>${items.length ? money(data.company.deliveryFee) : money(0)}</span></div><div class="summary-row total"><span>Total</span><span>${money(cartSubtotal() + (items.length ? data.company.deliveryFee : 0))}</span></div><button class="btn btn-primary cart-checkout" data-action="checkout" ${items.length ? '' : 'disabled'}>Continuar al pedido →</button><p class="cart-footnote">El costo de entrega se muestra antes de confirmar.</p></div></aside>`;
  }

  function storeView() {
    const products = data.products.filter(p => p.active && (ui.category === 'Todo' || p.category === ui.category) && `${p.name} ${p.category}`.toLowerCase().includes(ui.storeSearch.toLowerCase().trim()));
    const categories = CATEGORIES.filter(category => category === 'Todo' || data.products.some(p => p.active && p.category === category));
    return `<div class="store-page"><header class="store-topbar"><a class="store-brand" href="?vista=tienda" data-action="set-view" data-view="tienda"><span class="store-brand-mark">${esc((data.company.name || 'M').slice(0,1))}</span><span class="store-brand-name">${esc(data.company.name)}</span></a><div class="store-top-actions"><button class="btn btn-secondary" data-action="set-view" data-view="seguimiento">Seguir pedido</button><button class="btn btn-primary" data-action="set-view" data-view="admin">Panel demo ↗</button></div></header>
      <section class="store-hero"><div class="hero-content"><span class="hero-tag">✦ Comprá local, recibí en casa</span><h1>Lo que necesitás, sin salir de casa.</h1><p>Elegí tus productos y nosotros preparamos tu pedido.</p></div></section>
      <div class="store-meta-row"><div class="store-meta-left"><span class="store-meta-icon">🛍️</span><span><span class="store-meta-name">${esc(data.company.name)}</span><span class="store-meta-detail">${esc(data.company.area)} · Abierto hoy · Reparto propio</span></span></div><div class="store-perks"><span>◷ 35–55 min</span><span>⌖ Entrega desde ${money(data.company.deliveryFee)}</span><span>✓ Pedido seguro</span></div></div>
      <main class="store-body"><div class="store-products-head"><div><h2 class="store-section-title">Catálogo</h2><p class="store-section-note">Productos de muestra · precios ilustrativos</p></div><div class="search-field" style="min-width:min(235px,48vw)"><span>⌕</span><input id="store-search" type="search" placeholder="Buscar producto" value="${esc(ui.storeSearch)}" autocomplete="off"></div></div>
        <div class="store-layout"><section><div class="category-row">${categories.map(category=>`<button class="category-chip ${ui.category===category?'active':''}" data-action="category" data-category="${esc(category)}">${esc(category)}</button>`).join('')}</div><div class="store-product-grid">${products.map(product=>`<article class="store-product"><div class="store-product-visual"><span class="product-tag">${esc(product.badge || product.category)}</span><span aria-hidden="true">${esc(product.icon)}</span></div><div class="store-product-info"><div class="store-product-name">${esc(product.name)}</div><div class="store-product-size">${esc(product.size)}</div><div class="store-product-bottom"><span class="store-product-price">${money(product.price)}</span><button class="add-button" data-action="add-cart" data-id="${esc(product.id)}" aria-label="Agregar ${esc(product.name)} al carrito">+</button></div></div></article>`).join('')}</div>${products.length ? '' : `<div class="panel empty-state"><strong>No encontramos productos</strong>Probá otra búsqueda o categoría.</div>`}</section>${cartPanel()}</div>
      </main><footer class="store-topbar" style="height:auto;min-height:50px;justify-content:center;color:#85908a;font-size:9px">Tienda de demostración · Los productos y precios son ficticios</footer></div>`;
  }

  function routeOrders() { return data.orders.filter(order => ['Listo', 'En reparto'].includes(order.status)); }

  function courierView() {
    const orders = routeOrders();
    const active = orders.find(order => order.id === ui.routeOrderId);
    const locationText = ui.geoPoint ? `Ubicación local activa · ${ui.geoPoint.lat.toFixed(5)}, ${ui.geoPoint.lng.toFixed(5)} · precisión ${Math.round(ui.geoPoint.accuracy)} m` : ui.geoMessage;
    return `<div class="courier-page"><header class="courier-top"><span class="brand-lockup" style="padding:0"><span class="brand-mark">W</span><span><span class="brand-name">White Software</span><span class="brand-caption">Vista de reparto</span></span></span><button class="btn btn-secondary btn-small" data-action="set-view" data-view="admin">Salir de reparto</button></header><main class="courier-shell"><div class="courier-heading"><div><p class="eyebrow">Buen día, María</p><h1>Mis entregas</h1><p>Tu ubicación solo se solicita cuando iniciás una entrega.</p></div>${pill(ui.geoPoint ? 'GPS activo en este dispositivo' : 'Sin rastreo')}</div>
      <div class="courier-map"><span class="map-overlay-label">Ruta de muestra · Managua</span><span class="map-road-label road-one">Bello Horizonte</span><span class="map-road-label road-two">Altamira</span><span class="route-line"></span><span class="map-pin pin-start"><span>⌖</span></span><span class="map-pin pin-end"><span>⌖</span></span><span class="map-location-note" id="map-location-note">${esc(locationText)}</span></div>
      <div class="gps-indicator ${ui.geoPoint ? 'live' : ''}" id="gps-state"><span class="gps-dot"></span><span>${esc(locationText)}. La demo no envía coordenadas a un servidor.</span></div>
      <div class="delivery-list">${orders.length ? orders.map(order=>`<article class="delivery-card ${active?.id===order.id?'active':''}"><div><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><h3>${esc(order.id)} · ${esc(order.customer)}</h3>${pill(order.status)}</div><p>${esc(order.address || 'Dirección de entrega')} · ${esc(order.area || 'Managua')}</p><div class="delivery-meta"><span>▣ ${order.items.reduce((n,i)=>n+i.qty,0)} productos</span><span>◷ ${esc(order.time || 'Ahora')}</span><span>💵 ${money(order.total)}</span></div></div><button class="btn ${active?.id===order.id?'btn-quiet':'btn-primary'}" data-action="${active?.id===order.id?'finish-delivery':'start-delivery'}" data-id="${esc(order.id)}">${active?.id===order.id?'Completar entrega ✓':'Iniciar entrega →'}</button></article>`).join('') : `<div class="panel empty-state"><strong>No hay entregas pendientes</strong>Los pedidos listos aparecerán acá.</div>`}</div>
      <p class="field-help" style="margin-top:13px">Prototipo: la ubicación se conserva solo en memoria en este teléfono, no se comparte con el cliente. La versión real requiere app/API y reglas de privacidad.</p></main></div>`;
  }

  function trackingView() {
    const query = ui.trackingSearch.trim().toLowerCase();
    const order = query ? data.orders.find(o => o.id.toLowerCase() === query) : data.orders[0];
    const stageIndex = order ? Math.max(0, ORDER_STAGES.indexOf(order.status)) : -1;
    const stages = ['Pedido recibido', 'Confirmado por el negocio', 'En preparación', 'Listo para reparto', 'En camino', 'Entregado'];
    const location = ui.geoPoint && ui.routeOrderId === order?.id ? `Última ubicación en este dispositivo: ${ui.geoPoint.lat.toFixed(5)}, ${ui.geoPoint.lng.toFixed(5)}.` : 'El seguimiento compartido se habilitará al conectar la app de reparto y el servidor.';
    return `<div class="store-page"><header class="store-topbar"><a class="store-brand" href="?vista=tienda" data-action="set-view" data-view="tienda"><span class="store-brand-mark">${esc((data.company.name || 'M').slice(0,1))}</span><span class="store-brand-name">${esc(data.company.name)}</span></a><button class="btn btn-secondary" data-action="set-view" data-view="tienda">Volver a la tienda</button></header><main class="tracking-shell"><p class="eyebrow">Seguimiento del pedido</p><h1 class="store-section-title" style="font-size:25px">¿Dónde va mi pedido?</h1><p class="store-section-note" style="margin-top:6px">Ingresá el código que recibiste al confirmar la compra.</p><form class="tracking-search" id="track-form" style="margin-top:16px"><input id="tracking-code" name="code" placeholder="Ejemplo: WN-1048" value="${esc(ui.trackingSearch)}" autocomplete="off" aria-label="Código de pedido"><button class="btn btn-primary" type="submit">Buscar pedido</button></form>
      ${order ? `<section class="tracking-card"><div class="tracking-banner"><small>Pedido ${esc(order.id)}</small><h2>${esc(order.status === 'Entregado' ? '¡Tu pedido llegó!' : order.status === 'En reparto' ? 'Tu pedido va en camino' : 'Estamos preparando tu pedido')}</h2><p>${esc(order.customer)} · ${esc(order.area || 'Managua')}</p></div><div class="tracking-content"><div class="timeline">${stages.map((stage,i)=>`<div class="timeline-step ${i<=stageIndex?'done':''}">${stage}${i===stageIndex?` · ${esc(order.time || 'Actualizado ahora')}`:''}</div>`).join('')}</div><div><div class="tracking-details"><strong>Resumen del pedido</strong><p>${order.items.map(item=>`${item.qty} × ${esc(item.name)}`).join('<br>')}<br><br>Total ${money(order.total)} · ${esc(order.paymentMethod || 'Pago pendiente')}</p><span class="tracking-code">${esc(order.id)}</span></div><div class="gps-indicator ${ui.geoPoint && ui.routeOrderId===order.id?'live':''}" style="margin-top:10px"><span class="gps-dot"></span><span>${esc(location)}</span></div></div></div></section>` : `<div class="panel empty-state" style="margin-top:15px"><strong>No encontramos ese pedido</strong>Revisá el código y volvé a intentarlo.</div>`}
      <div class="warning-note" style="margin-top:14px">Vista demostrativa. La ubicación del repartidor todavía no se comparte entre teléfonos porque falta el backend.</div></main></div>`;
  }

  function modalView() {
    if (!ui.modal) return '';
    if (ui.modal.type === 'checkout') return checkoutModal();
    if (ui.modal.type === 'product') return productModal();
    if (ui.modal.type === 'provider') return providerModal();
    if (ui.modal.type === 'order') return orderModal(ui.modal.id);
    return '';
  }

  function checkoutModal() {
    return `<div class="modal-backdrop" data-action="backdrop-close"><section class="modal wide" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><span><h2 id="modal-title">Completá tu pedido</h2><p>Confirmá dónde recibirlo. Aún no se procesan pagos con tarjeta.</p></span><button class="icon-button" data-action="close-modal" aria-label="Cerrar">×</button></div><form id="checkout-form"><div class="modal-body"><div class="modal-fields"><div class="form-field"><label class="field-label" for="customer-name">Nombre</label><input class="input-control" id="customer-name" name="customer" required maxlength="70" placeholder="Tu nombre"></div><div class="form-field"><label class="field-label" for="customer-phone">Teléfono</label><input class="input-control" id="customer-phone" name="phone" required inputmode="tel" maxlength="18" placeholder="8888 8888"></div><div class="form-field"><label class="field-label" for="department">Departamento</label><select class="select-control" name="department" id="department"><option>Managua</option><option>Masaya</option><option>Granada</option><option>León</option><option>Carazo</option><option>Matagalpa</option></select></div><div class="form-field"><label class="field-label" for="municipality">Municipio</label><input class="input-control" id="municipality" name="municipality" required maxlength="60" placeholder="Managua"></div><div class="form-field full"><label class="field-label" for="address">Dirección y referencias</label><textarea class="textarea-control" id="address" name="address" required maxlength="220" placeholder="Barrio, de algún punto conocido, cuántas cuadras y color de casa"></textarea></div><div class="form-field full"><span class="field-label">Método de pago</span><div style="display:grid;gap:7px"><label class="payment-choice"><input type="radio" name="payment" value="Efectivo al recibir" checked> Efectivo al recibir</label><label class="payment-choice"><input type="radio" name="payment" value="Transferencia"> Transferencia bancaria · pendiente de confirmar</label><label class="payment-choice disabled"><input type="radio" name="payment" value="Tarjeta" disabled> Tarjeta · se habilita al conectar la pasarela</label></div></div><div class="form-field full"><div class="warning-note">Esta demo no solicita información de tarjetas y no realiza cobros.</div></div></div></div><div class="modal-footer"><button class="btn btn-secondary" type="button" data-action="close-modal">Seguir comprando</button><button class="btn btn-primary" type="submit">Crear pedido demo · ${money(cartSubtotal()+data.company.deliveryFee)}</button></div></form></section></div>`;
  }

  function productModal() {
    return `<div class="modal-backdrop" data-action="backdrop-close"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><span><h2 id="modal-title">Agregar producto</h2><p>Creá un producto de muestra para el catálogo de este navegador.</p></span><button class="icon-button" data-action="close-modal" aria-label="Cerrar">×</button></div><form id="product-form"><div class="modal-body"><div class="modal-fields"><div class="form-field full"><label class="field-label" for="product-name">Nombre del producto</label><input class="input-control" id="product-name" name="name" required maxlength="70"></div><div class="form-field"><label class="field-label" for="product-size">Presentación</label><input class="input-control" id="product-size" name="size" placeholder="Unidad, libra, paquete"></div><div class="form-field"><label class="field-label" for="product-price">Precio en córdobas</label><input class="input-control" id="product-price" name="price" type="number" min="1" step="1" required></div><div class="form-field"><label class="field-label" for="product-category">Categoría</label><select class="select-control" id="product-category" name="category">${CATEGORIES.slice(1).map(c=>`<option>${esc(c)}</option>`).join('')}</select></div><div class="form-field"><label class="field-label" for="product-stock">Existencia de muestra</label><input class="input-control" id="product-stock" name="stock" type="number" min="0" value="1"></div><div class="form-field full"><label class="field-label" for="product-icon">Ícono opcional</label><input class="input-control" id="product-icon" name="icon" maxlength="4" value="🛍️"></div></div></div><div class="modal-footer"><button class="btn btn-secondary" type="button" data-action="close-modal">Cancelar</button><button class="btn btn-primary" type="submit">Guardar producto</button></div></form></section></div>`;
  }

  function providerModal() {
    return `<div class="modal-backdrop" data-action="backdrop-close"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><span><h2 id="modal-title">Antes de conectar pagos</h2><p>No pegues claves ni datos financieros en esta pantalla.</p></span><button class="icon-button" data-action="close-modal" aria-label="Cerrar">×</button></div><div class="modal-body"><ul class="check-list"><li><span>1</span><span>Elegir proveedor disponible en Nicaragua y confirmar su registro aplicable ante el BCN.</span></li><li><span>2</span><span>Confirmar por escrito tarjetas, marcas y emisores aceptados, costos, moneda y liquidación por comercio.</span></li><li><span>3</span><span>Solicitar documentación técnica, sandbox, webhooks, reembolsos, autenticación y soporte multiempresa.</span></li><li><span>4</span><span>Guardar credenciales en el backend mediante secretos protegidos; el navegador nunca las recibirá.</span></li><li><span>5</span><span>Probar el ciclo completo con cuentas autorizadas antes de habilitar cobros a clientes.</span></li></ul><p class="field-help" style="margin-top:14px">No hace falta integrar por separado cada banco que emitió la tarjeta. El adquirente debe confirmar que admite esas tarjetas y marcas.</p></div><div class="modal-footer"><button class="btn btn-primary" data-action="close-modal">Entendido</button></div></section></div>`;
  }

  function orderModal(id) {
    const order = data.orders.find(item => item.id === id);
    if (!order) return '';
    return `<div class="modal-backdrop" data-action="backdrop-close"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><span><h2 id="modal-title">Pedido ${esc(order.id)}</h2><p>${esc(order.customer)} · ${esc(order.area || 'Managua')}</p></span><button class="icon-button" data-action="close-modal" aria-label="Cerrar">×</button></div><div class="modal-body"><p><strong>Estado:</strong> ${pill(order.status)}</p><p><strong>Dirección:</strong> ${esc(order.address || 'Managua')}</p><p><strong>Pago:</strong> ${esc(order.paymentMethod)} · ${esc(order.paymentStatus)}</p><p><strong>Detalle:</strong></p>${order.items.map(item=>`<div class="summary-row"><span>${item.qty} × ${esc(item.name)}</span><span>${money(item.qty*item.price)}</span></div>`).join('')}<div class="summary-row total"><span>Total</span><span>${money(order.total)}</span></div></div><div class="modal-footer"><button class="btn btn-secondary" data-action="close-modal">Cerrar</button><button class="btn btn-primary" data-action="advance-order" data-id="${esc(order.id)}">Siguiente estado →</button></div></section></div>`;
  }

  function render() {
    applyBrand();
    const body = ui.view === 'tienda' ? storeView() : ui.view === 'reparto' ? courierView() : ui.view === 'seguimiento' ? trackingView() : adminView();
    app.innerHTML = `${body}${modalView()}`;
    document.title = `${ui.view === 'admin' ? pageTitle() : ({tienda:'Tienda', reparto:'Reparto', seguimiento:'Seguimiento'})[ui.view]} · ${esc(data.company.name)} | White Software`;
  }

  function openModal(type, id) {
    ui.modal = { type, id };
    render();
    const first = $('.modal input, .modal textarea, .modal select');
    if (first) window.setTimeout(() => first.focus(), 30);
  }

  function closeModal() { ui.modal = null; render(); }

  function closeSidebar() {
    $('#sidebar')?.classList.remove('open');
    $('#overlay')?.classList.remove('show');
  }

  function toggleSidebar() {
    $('#sidebar')?.classList.toggle('open');
    $('#overlay')?.classList.toggle('show');
  }

  function nextOrderStatus(order) {
    const index = ORDER_STAGES.indexOf(order.status);
    return index >= 0 && index < ORDER_STAGES.length - 1 ? ORDER_STAGES[index + 1] : order.status;
  }

  function advanceOrder(id) {
    const order = data.orders.find(item => item.id === id);
    if (!order) return;
    const next = nextOrderStatus(order);
    if (next === order.status) {
      ui.modal = { type: 'order', id };
      render();
      toast('El pedido ya llegó al último estado disponible.');
      return;
    }
    order.status = next;
    if (next === 'En reparto' && (!order.courier || order.courier === 'Sin asignar')) order.courier = 'María López';
    persist();
    if (ui.modal?.type === 'order') ui.modal = { type: 'order', id };
    render();
    toast(`${id} actualizado: ${next}.`);
  }

  function addToCart(id, delta = 1) {
    const product = data.products.find(item => item.id === id && item.active);
    if (!product) return;
    const next = Math.max(0, (ui.cart[id] || 0) + delta);
    if (next) ui.cart[id] = next; else delete ui.cart[id];
    render();
    if (delta > 0) toast(`${product.name} agregado al carrito.`);
  }

  function addOrder(form) {
    const items = cartItems();
    if (!items.length) { closeModal(); toast('Agregá al menos un producto.'); return; }
    const values = new FormData(form);
    const customer = String(values.get('customer') || '').trim();
    const paymentMethod = String(values.get('payment') || 'Efectivo al recibir');
    const orderNumber = String(Date.now()).slice(-5);
    const order = {
      id: `WN-${orderNumber}`,
      customer,
      phone: String(values.get('phone') || '').trim(),
      area: `${String(values.get('municipality') || 'Managua').trim()}, ${String(values.get('department') || 'Managua')}`,
      address: String(values.get('address') || '').trim(),
      items: items.map(item => ({ name: item.name, qty: item.qty, price: item.price })),
      total: cartSubtotal() + Number(data.company.deliveryFee || 0),
      status: 'Recibido',
      paymentStatus: paymentMethod === 'Transferencia' ? 'Pendiente de confirmar' : 'Pendiente',
      paymentMethod,
      courier: 'Sin asignar',
      time: new Intl.DateTimeFormat('es-NI', { hour: 'numeric', minute: '2-digit' }).format(new Date())
    };
    data.orders.unshift(order);
    ui.cart = {};
    ui.trackingSearch = order.id;
    ui.modal = null;
    persist();
    const url = new URL(location.href);
    url.searchParams.set('vista', 'seguimiento');
    url.searchParams.set('pedido', order.id);
    history.replaceState({}, '', url);
    ui.view = 'seguimiento';
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast(`Pedido ${order.id} creado en la demo.`);
  }

  function addProduct(form) {
    const values = new FormData(form);
    const name = String(values.get('name') || '').trim();
    const price = Number(values.get('price'));
    if (!name || !Number.isFinite(price) || price <= 0) { toast('Revisá el nombre y el precio.'); return; }
    data.products.unshift({
      id: `p-${Date.now()}`,
      name,
      size: String(values.get('size') || 'Unidad').trim(),
      price,
      category: String(values.get('category') || 'Abarrotes'),
      icon: String(values.get('icon') || '🛍️').trim(),
      badge: 'Nuevo',
      active: true,
      stock: Math.max(0, Number(values.get('stock') || 0))
    });
    persist();
    ui.modal = null;
    ui.section = 'productos';
    render();
    toast('Producto agregado al catálogo de muestra.');
  }

  function saveSettings(form) {
    const values = new FormData(form);
    data.company.name = String(values.get('companyName') || seed.company.name).trim().slice(0,52);
    data.company.area = String(values.get('area') || '').trim().slice(0,60);
    data.company.phone = String(values.get('phone') || '').trim().slice(0,20);
    data.company.deliveryFee = Math.max(0, Number(values.get('deliveryFee') || 0));
    data.company.color = safeColor(String(values.get('color') || seed.company.color));
    persist(); render(); toast('Personalización guardada en este navegador.');
  }

  function orderCsv() {
    const rows = [['Pedido','Cliente','Teléfono','Zona','Dirección','Estado','Pago','Método','Total'], ...data.orders.map(o=>[o.id,o.customer,o.phone,o.area,o.address,o.status,o.paymentStatus,o.paymentMethod,o.total])];
    const csv = rows.map(row=>row.map(value=>`"${String(value ?? '').replace(/"/g,'""')}"`).join(',')).join('\r\n');
    const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = 'pedidos-demo-white-software.csv'; link.click();
    URL.revokeObjectURL(link.href);
    toast('Se descargó el CSV con los pedidos de muestra.');
  }

  async function copyLink(view) {
    const url = new URL(location.href);
    url.searchParams.set('vista', view);
    url.searchParams.delete('pedido');
    try { await navigator.clipboard.writeText(url.toString()); toast('Enlace copiado.'); }
    catch (_) { toast(`Enlace de muestra: ${url.toString()}`); }
  }

  function startDelivery(id) {
    const order = data.orders.find(item => item.id === id);
    if (!order) return;
    ui.routeOrderId = id;
    ui.geoPoint = null;
    ui.geoMessage = 'Entrega iniciada. Esperando permiso de ubicación del teléfono.';
    order.status = 'En reparto';
    if (!order.courier || order.courier === 'Sin asignar') order.courier = 'María López';
    persist();
    if (!navigator.geolocation) {
      ui.geoMessage = 'Este navegador no ofrece ubicación. Podés continuar la entrega sin rastreo.';
      render(); toast('Entrega iniciada. No hay GPS disponible en este navegador.'); return;
    }
    geoWatchId = navigator.geolocation.watchPosition(position => {
      ui.geoPoint = { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy };
      ui.geoMessage = 'Ubicación activa en este dispositivo.';
      updateLocationDisplay();
    }, error => {
      ui.geoPoint = null;
      ui.geoMessage = error.code === 1 ? 'Permiso de ubicación denegado. La entrega puede continuar sin rastreo.' : 'No se pudo obtener GPS. Revisá la señal o continuá sin rastreo.';
      updateLocationDisplay();
    }, { enableHighAccuracy: true, maximumAge: 8000, timeout: 15000 });
    render();
    toast('Entrega iniciada. El navegador puede pedir permiso para usar GPS.');
  }

  function updateLocationDisplay() {
    const text = ui.geoPoint ? `Ubicación activa en este dispositivo · ${ui.geoPoint.lat.toFixed(5)}, ${ui.geoPoint.lng.toFixed(5)} · precisión ${Math.round(ui.geoPoint.accuracy)} m. No se envía a servidor.` : `${ui.geoMessage} La demo no envía coordenadas a un servidor.`;
    const gps = $('#gps-state');
    const map = $('#map-location-note');
    if (gps) {
      gps.classList.toggle('live', Boolean(ui.geoPoint));
      gps.innerHTML = `<span class="gps-dot"></span><span>${esc(text)}</span>`;
    }
    if (map) map.textContent = text;
  }

  function stopLocationWatch() {
    if (geoWatchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(geoWatchId);
    geoWatchId = null;
    ui.geoPoint = null;
    if (ui.routeOrderId) ui.geoMessage = 'Rastreo detenido al salir de la vista de reparto.';
  }

  function finishDelivery(id) {
    const order = data.orders.find(item => item.id === id);
    if (!order) return;
    order.status = 'Entregado';
    if (order.courier === 'Sin asignar') order.courier = 'María López';
    persist();
    stopLocationWatch();
    ui.routeOrderId = null;
    ui.geoMessage = 'Entrega completada. La ubicación dejó de actualizarse.';
    render(); toast(`Entrega ${id} completada. GPS detenido.`);
  }

  function handleClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'set-view') { event.preventDefault(); setView(button.dataset.view); }
    else if (action === 'section') setSection(button.dataset.section);
    else if (action === 'toggle-sidebar') toggleSidebar();
    else if (action === 'close-sidebar') closeSidebar();
    else if (action === 'category') { ui.category = button.dataset.category; render(); }
    else if (action === 'add-cart') addToCart(button.dataset.id, 1);
    else if (action === 'cart-qty') addToCart(button.dataset.id, Number(button.dataset.delta || 0));
    else if (action === 'checkout') { if (cartCount()) openModal('checkout'); }
    else if (action === 'close-modal') closeModal();
    else if (action === 'backdrop-close' && event.target === button) closeModal();
    else if (action === 'add-product') openModal('product');
    else if (action === 'toggle-product') {
      const product = data.products.find(item => item.id === button.dataset.id);
      if (product) { product.active = !product.active; persist(); render(); toast(`${product.name}: ${product.active ? 'disponible' : 'pausado'}.`); }
    } else if (action === 'provider-checklist') openModal('provider');
    else if (action === 'advance-order') {
      if (ui.modal?.type === 'order' || ui.section === 'pedidos' || ui.section === 'repartidores') advanceOrder(button.dataset.id);
      else openModal('order', button.dataset.id);
    } else if (action === 'start-delivery') startDelivery(button.dataset.id);
    else if (action === 'finish-delivery') finishDelivery(button.dataset.id);
    else if (action === 'export-orders') orderCsv();
    else if (action === 'copy-link') copyLink(button.dataset.linkView || 'tienda');
  }

  function handleSubmit(event) {
    const form = event.target;
    if (form.id === 'checkout-form') { event.preventDefault(); addOrder(form); }
    else if (form.id === 'product-form') { event.preventDefault(); addProduct(form); }
    else if (form.id === 'settings-form') { event.preventDefault(); saveSettings(form); }
    else if (form.id === 'track-form') {
      event.preventDefault();
      ui.trackingSearch = String(new FormData(form).get('code') || '').trim();
      const url = new URL(location.href); url.searchParams.set('vista','seguimiento'); url.searchParams.set('pedido',ui.trackingSearch); history.replaceState({},'',url);
      render();
    }
  }

  function handleInput(event) {
    const input = event.target;
    const value = input.value;
    if (input.id === 'order-search') { ui.orderSearch = value; const start = input.selectionStart; render(); const next = $('#order-search'); next?.focus(); next?.setSelectionRange(start,start); }
    else if (input.id === 'product-search') { ui.productSearch = value; const start = input.selectionStart; render(); const next = $('#product-search'); next?.focus(); next?.setSelectionRange(start,start); }
    else if (input.id === 'store-search') { ui.storeSearch = value; const start = input.selectionStart; render(); const next = $('#store-search'); next?.focus(); next?.setSelectionRange(start,start); }
  }

  document.addEventListener('click', handleClick);
  document.addEventListener('submit', handleSubmit);
  document.addEventListener('input', handleInput);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && ui.modal) closeModal(); });

  window.addEventListener('beforeunload', stopLocationWatch);
  render();
})();

