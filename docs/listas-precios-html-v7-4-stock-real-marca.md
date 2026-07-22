# Listas de precios v7.4 - Marca real y stock interno

Ajustes sobre v7.3:

- La clasificación de productos sigue usando `product_brand.name` como rubro interno para separar listas:
  - PRO / URBANO -> Bicicletas
  - BICIPARTES -> Bicipartes
  - MOTOCICLISMO -> Motopartes
- La marca mostrada en filtros, tablas y HTML ahora toma `dr_product_brand.name`, evitando que el filtro de marca muestre rubros como PRO, URBANO, BICIPARTES o MOTOCICLISMO.
- En el módulo interno de la app se agregan columnas de stock numérico:
  - Stock real
  - Stock venta
- La descarga HTML para cliente mantiene únicamente Disponibilidad: `Disponible` / `Consultar` y no expone cantidades reales.
- Las tarjetas de listas ya no muestran conteos erróneos de 1 disponible al cargar el selector; muestran tipo de lista y origen.

Pendiente de validación en Odoo:

- Confirmar que `dr_product_brand.name` sea la marca comercial correcta para todos los rubros.
- Si algún rubro no carga marca real, revisar `product_template.dr_brand_id` o tabla equivalente.
