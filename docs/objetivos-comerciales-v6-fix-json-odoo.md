# Objetivos Comerciales V6 Fix - compatibilidad Odoo JSON/texto

## Cambio aplicado

Se corrigio la consulta del modulo Objetivos Comerciales para evitar el error:

```text
sintaxis de entrada no valida para tipo json
```

El problema se daba porque algunos campos traducibles de Odoo pueden existir como `json/jsonb` en algunas bases y como texto en otras. La version anterior usaba `COALESCE(campo, '')` en campos como `product_template.name`, `product_category.name` o `product_pricelist.name`, lo que podia forzar a PostgreSQL a interpretar una cadena vacia como JSON.

## Solucion

Se agrego casteo seguro a texto antes de aplicar `COALESCE`:

```sql
COALESCE(campo::text, '')
```

Esto se aplico en:

- Clasificacion de productos para Ciclismo y Motociclismo.
- Deteccion de lista de precio Mostrador/Distribuidor.

## Impacto

- La pantalla Mi dashboard comercial ya no deberia romperse por campos traducibles de Odoo.
- Si un campo viene como JSON, se usa su representacion de texto para clasificar por palabras clave.
- Si un campo viene como texto normal, sigue funcionando igual.

## Pendiente funcional

Despues de validar que la pantalla carga, comparar totales contra Power BI y ajustar las reglas de clasificacion de productos si alguna familia/rubro no cae en la categoria correcta.
