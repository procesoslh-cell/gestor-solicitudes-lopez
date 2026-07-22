# Listas de precios HTML v7.2

## Objetivo
Mejorar el módulo de listas de precios para que los asesores puedan generar listas HTML responsive, modernas y aptas para compartir con clientes desde celular, sin depender de Excel ni segmentadores.

## Cambios principales

- Se agregaron tipos de lista por negocio:
  - Distribuidor
  - Mostrador
- Se corrigió la clasificación de productos para evitar cruces entre Ciclismo/Bicipartes/Motociclismo.
- Se agregó configuración comercial base dentro del módulo:
  - Distribuidor: 35% sobre precio base
  - Mostrador: 28% sobre precio base
  - Contado 7 días: 8% adicional
- El HTML descargado no muestra stock real. Solo muestra:
  - Disponible
  - Consultar
- El filtro “Solo productos con stock” sigue afectando qué productos se descargan.
- Bicicletas queda filtrado por marca/modelo y agrupado por marca/modelo.
- Bicipartes, Motopartes, Movilidad y Autopartes quedan agrupados por categoría/subcategoría/familia.
- Motopartes utiliza branding oscuro tipo Forte y banner embebido en el HTML.
- Bicicletas y Bicipartes mantienen branding azul y banner comercial.

## Listas disponibles

- Bicicletas PRO / URBANO Distribuidor
- Bicicletas PRO / URBANO Mostrador
- Bicipartes Distribuidor
- Bicipartes Mostrador
- Motopartes Distribuidor
- Motopartes Mostrador
- Movilidad Eléctrica Distribuidor
- Movilidad Eléctrica Mostrador
- Autopartes / Neumáticos Distribuidor
- Autopartes / Neumáticos Mostrador

## Fórmulas

```text
Precio lista comercial = precio base * (1 - descuento de tipo de lista)
Precio contado 7 días = precio lista comercial * (1 - 0,08)
```

## Stock

Dentro del módulo se puede filtrar por productos con stock. Para la descarga HTML, el stock siempre se muestra en forma comercial:

```text
Disponible / Consultar
```

No se expone stock real en el archivo enviado al cliente.

## Próximas mejoras sugeridas

- Hacer persistente la configuración comercial por negocio/tipo de lista.
- Ajustar IDs de listas de precio de Odoo si Mostrador tiene lista base específica.
- Agregar historial de listas generadas.
- Agregar permisos para que solo supervisor/gerencia modifique reglas comerciales.
