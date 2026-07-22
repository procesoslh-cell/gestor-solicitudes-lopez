# Objetivos Comerciales V6.3 - Clasificación real y objetivo de clientes vendidos

Base: `gestor-solicitudes-lopez-v6-2-venta-neta-real.zip`.

## Cambios principales

### 1. Clasificación de productos según maestro real

Se ajustó la lógica para que el módulo se acerque al tablero Power BI:

- `product_brand.name` se interpreta como **rubro/clasificación principal**.
- `product_category c1` se interpreta como familia.
- `product_category c2` se interpreta como subcategoría.
- `product_category c3` se interpreta como categoría/negocio.

#### Ciclismo

- `PRO` y `URBANO` impactan en **Bicicletas**.
- `BICIPARTES` impacta en **Bicipartes**.

#### Motociclismo

- Productos con rubro `MOTOCICLISMO` y categoría/negocio `NEUMATICOS` impactan en **Neumáticos**.
- El resto de productos con rubro `MOTOCICLISMO` impactan en **MIX**.
- Se agregaron respaldos por texto para detectar `CAMARAS`, `CUBIERTAS` y variantes de `NEUMATICOS`.

### 2. Denominadores de descuentos más cercanos a Power BI

Se ajustaron los denominadores de participación para replicar mejor:

- `Total Ventas`
- `Total Ventas PP`

La distribución de descuento comercial usa la venta total por vendedor y mes, excluyendo NC y RINTI, como en la medida DAX provista.

### 3. Clientes vendidos

Se agregó cálculo de **clientes vendidos** usando clientes distintos con venta en el período, excluyendo NC.

La lógica busca acercarse a la medida Power BI:

```DAX
Clientes por Provincia 3 = 
CALCULATE(
    COUNTROWS(
        SUMMARIZE(
            FILTER(
                'Venta de Mercaderia',
                'Venta de Mercaderia'[Nombre de la Empresa] = "LH SA"
                    && LEFT('Venta de Mercaderia'[Factura], 3) <> "NC-"
            ),
            'Venta de Mercaderia'[Nombre del Cliente]
        )
    ),
    REMOVEFILTERS('TablaIndicadores')
)
```

### 4. Objetivo de clientes vendidos

El supervisor/jefe ahora puede cargar, junto con los objetivos de dinero, un objetivo de clientes vendidos por asesor, período y unidad.

En el dashboard se muestran:

- Clientes vendidos.
- Objetivo clientes.
- % cumplimiento clientes.
- Clientes restantes.

### 5. Exportación CSV

El CSV de objetivos comerciales ahora incluye:

- Clientes vendidos.
- Objetivo clientes.
- % clientes.

## Pendientes de conciliación

Si aún hay diferencias contra Power BI, revisar en este orden:

1. Venta bruta por asesor y mes.
2. Descuento comercial distribuido.
3. Descuento pronto pago distribuido.
4. Clasificación por rubro/categoría del maestro.
5. Mostrador vs Distribuidor por lista de precios.
6. Clientes vendidos por asesor.
