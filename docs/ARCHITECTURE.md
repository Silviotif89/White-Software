# Arquitectura prevista

## Alcance del prototipo actual

Los archivos `index.html`, `styles.css` y `app.js` entregan una experiencia navegable sin dependencias externas. El catálogo, el carrito y los pedidos de muestra se guardan en `localStorage`. No hay API, autenticación, persistencia compartida ni cobro real.

## Componentes del producto

1. **Tienda pública por comercio:** catálogo, carrito, dirección, método de entrega, pago y confirmación.
2. **Panel privado del negocio:** configuración, productos, pedidos, personal, zonas, tarifas e informes.
3. **Herramienta móvil del repartidor:** asignaciones, navegación, inicio y finalización de entregas, incidencias y ubicación activa.
4. **Seguimiento del pedido:** enlace con acceso únicamente al pedido correspondiente.

## Modelo multiempresa propuesto

Cada registro persistente debe incluir un `tenant_id` validado en el servidor. Los endpoints no deben aceptar que el navegador elija libremente el tenant de otro usuario. Roles iniciales: propietario, administrador, operador y repartidor. Los clientes consultan solo pedidos con una referencia privada y expirable.

Entidades iniciales:

- `tenants`: negocio, branding, zona horaria, moneda, horarios y estado.
- `users` y `memberships`: identidad y rol por negocio.
- `products`, `categories` y `inventory`: catálogo y disponibilidad.
- `customers` y `addresses`: contacto y direcciones con departamento, municipio, barrio y referencias.
- `orders` y `order_items`: pedido, importes, dirección, eventos y estado.
- `deliveries`: repartidor, inicio, fin, incidencias y ubicación reciente durante el servicio.
- `payment_intents` y `payment_events`: estado del proveedor, identificadores externos y conciliación, sin almacenar PAN ni CVV.

## Estados sugeridos

- Pedido: recibido, confirmado, preparando, listo, en reparto, entregado, cancelado o intento fallido.
- Pago: no iniciado, pendiente, aprobado, rechazado, devuelto o en disputa.
- Entrega: sin asignar, asignada, activa, completada o con incidencia.

Los cambios de estado deben guardar actor, hora, motivo y evento de origen. Los webhooks de pago deben verificarse y procesarse de forma idempotente.

## Integración de pagos

El banco emisor de la tarjeta del cliente es distinto del adquirente o proveedor que procesa el cobro del comercio. El sistema necesita un adaptador por proveedor, no una integración por cada banco emisor. Cada comercio debe tener una afiliación y credenciales aisladas cuando el proveedor lo permita. Verificar marcas, emisores, moneda, tarifas, liquidación, reembolsos, contracargos, sandbox, webhooks y modelo multiempresa antes de contratar.

Usar checkout alojado o tokenización. Guardar solo referencias seguras del proveedor y los estados de pago. Nunca almacenar el número completo de tarjeta ni código CVV.

## Ubicación del repartidor

Solicitar ubicación solo después de una acción explícita de inicio de turno o entrega. Mostrar señal visible, parar al terminar y limitar acceso al negocio correspondiente y al cliente de ese pedido. La ubicación debe caducar y no seguir recolectándose fuera del trabajo activo. Probar batería, bloqueo de pantalla, permisos y falta de red en Android e iOS. Si la web no sostiene actualizaciones en segundo plano, usar una app móvil para repartidores; la tienda y administración pueden seguir como enlaces web.

## Próximas decisiones técnicas

- Backend, base de datos, despliegue y aislamiento por tenant.
- Autenticación y recuperación de acceso.
- Proveedor de pagos y contratos de afiliación.
- Maps/geocodificación para departamentos, municipios, barrios y puntos de entrega.
- Aplicación de reparto o PWA, según pruebas reales de segundo plano.
- Retención de ubicación, políticas de privacidad y revisión legal local.

