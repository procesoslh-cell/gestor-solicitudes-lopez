# Objetivos Comerciales V6.2 - Venta Neta Real

Esta versión corrige la lógica de venta neta del módulo Objetivos Comerciales para aproximarla al tablero Power BI B2B.

## Cambio principal

La venta neta ya no se calcula directamente desde `price_total` o `price_subtotal` de Odoo.
Ahora se replica la lógica base de la tabla **Venta de Mercadería**:

```text
Venta Neta = $ Subtotal-Producto + Descuento Comercial + Descuento Pronto Pago
```

## Base de ventas

Se toman líneas contables de venta desde `account_move_line` con cuentas:

```text
564, 137, 1127, 1378
```

Se excluyen:

```text
partner_id 1 y 239307
ROVENT/2025/00005
FA-A 00002-00002285
FA-A 00002-00002289
RINTI/2025/00038
RINTI/2025/00040
```

## Subtotal producto

```text
RINTI  => -ABS(price_subtotal)
NC     => -price_subtotal
Resto  => price_subtotal
```

## Descuento comercial

Se calcula una bolsa mensual por vendedor usando cuentas:

```text
980, 1162, 1839, 1858
```

Luego se distribuye proporcionalmente por producto según la participación del producto sobre la venta del vendedor/mes.

Condiciones de distribución:

```text
Id Empresa = 3
Factura no NC-
Factura no RINTI
```

## Descuento pronto pago

Se calcula una bolsa mensual por vendedor usando cuentas:

```text
865, 427
```

Se distribuye solo sobre líneas cuya condición de pago sea `Descuento Pronto Pago`.

## Clasificación de rubros

Se reforzó la clasificación de productos usando:

- unidad de negocio `aml.x_studio_unidad_de_negocio`
- categoría de producto
- nombre de producto
- código interno

Las pestañas siguen trabajando con:

```text
Ciclismo: Bicicletas / Bicipartes
Motociclismo: MIX / Neumáticos
```

## Nota

Esta versión busca acercar el cálculo al Power BI. Si todavía existen diferencias, el siguiente ajuste debería enfocarse en la clasificación exacta de productos/rubros y en la lógica de A Facturar / Confirmado.
