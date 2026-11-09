# White Software

Prototipo navegable para una plataforma de pedidos por enlace, administración de comercios y reparto propio en Nicaragua.

## Qué incluye esta versión

- Tienda de ejemplo con catálogo, categorías, carrito y creación local de pedidos.
- Panel administrativo con pedidos, catálogo, repartidores, apariencia y estado de pagos.
- Vista móvil para que un repartidor inicie y cierre una entrega.
- Página de seguimiento por código de pedido.
- Datos de demostración persistidos en el navegador mediante `localStorage`.
- Interfaz responsive en español y montos de muestra en córdobas.

## Ejecutar localmente

El proyecto no necesita instalar dependencias. Desde esta carpeta, ejecutá:

```powershell
python -m http.server 8000
```

Luego abrí `http://localhost:8000`.

En Windows también se puede usar el Python que ya esté disponible. El servidor local permite probar el permiso de ubicación en el navegador.

## Vistas de demostración

- Administración: `?vista=admin`
- Tienda del cliente: `?vista=tienda`
- Repartidor: `?vista=reparto`
- Seguimiento: `?vista=seguimiento`

La aplicación abre por defecto el panel administrativo. Desde el panel se puede saltar entre las vistas.

## Límites de esta demo

Esta entrega es una interfaz funcional de prototipo, no un sistema listo para cobrar en producción. No existe todavía un backend, autenticación, base de datos compartida ni separación real de comercios. Los cambios quedan guardados solo en el navegador donde se hicieron.

La opción de tarjeta está marcada como pendiente y no solicita ni almacena números de tarjeta. Para activarla hace falta contratar y configurar un adquirente o proveedor de pagos que confirme aceptación de las marcas y emisores requeridos en Nicaragua. No se asumió BAC como requisito.

La vista de reparto solicita permiso de GPS solo cuando el repartidor inicia una entrega. Esta demo muestra la ubicación en ese dispositivo y no la transmite a un servidor ni al cliente. Para compartir ubicación entre usuarios y mantener seguimiento fiable con la pantalla bloqueada se necesita backend y una solución móvil validada en Android e iOS.

## Próxima etapa para producción

1. Definir comercios piloto, rubro, zona, roles y políticas de entrega.
2. Añadir inicio de sesión, API y base de datos multiempresa con aislamiento por comercio.
3. Seleccionar un proveedor de pago, validar contratos, tarjetas aceptadas, liquidación y webhooks; custodiar claves fuera del código.
4. Desarrollar y probar el rastreo de repartidores en teléfonos reales, con controles de privacidad y retención.
5. Añadir respaldos, monitoreo, auditoría, atención de incidentes y procesos de soporte.

No cargués contraseñas, claves de pasarela ni datos reales de tarjetas en este repositorio.

