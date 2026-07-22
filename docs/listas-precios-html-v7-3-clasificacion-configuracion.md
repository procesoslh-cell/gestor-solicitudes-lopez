# Listas de precios v7.3

## Cambios principales

- Se corrigio la clasificacion de productos usando el rubro de producto (`product_brand.name`) como referencia principal.
- Bicicletas toma rubros `PRO` y `URBANO`.
- Bicipartes toma rubro `BICIPARTES`.
- Motopartes toma rubro `MOTOCICLISMO`.
- Movilidad electrica toma rubro `MOVILIDAD ELECTRICA` / `MOVILIDAD ELÉCTRICA`.
- Autopartes toma rubro o categoria `AUTOPARTES`.
- La lista HTML ya no muestra KPIs ni textos explicativos largos.
- La lista HTML muestra titulo simple por rubro: `Lista de precios Bicicletas`, `Lista de precios Bicipartes`, etc.
- Se mantiene solo la advertencia comercial: precios con IVA incluido, sujetos a disponibilidad y actualizacion comercial.
- Los filtros del HTML son cascada.
- Bicicletas mantiene filtros de marca y modelo.
- Bicipartes, Motopartes, Movilidad y Autopartes mantienen filtros categoria, subcategoria y familia.
- Las listas descargadas no muestran stock real; solo muestran `Disponible` o `Consultar`.
- La descarga respeta el filtro `Solo productos con stock` aplicado desde la app.
- Se agrego configuracion editable de descuentos desde el modulo, visible solo para usuarios admin.

## Configuracion default

- Bicipartes: Distribuidor 35%, Mostrador 28%.
- Bicicletas: Distribuidor 35%, Mostrador 30%.
- Motopartes: Distribuidor 35%, Mostrador 30%.
- Movilidad electrica: Distribuidor 35%, Mostrador 30%.
- Autopartes: Distribuidor 35%, Mostrador 30%.
- Contado 7 dias: 8%.

La configuracion se guarda en `backend/src/modules/price-lists/price-list-config.json` cuando se modifica desde el sistema.
