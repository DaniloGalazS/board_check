# Definicion de logica de aplicacion

## Descipcion

Este es un mvp que sirve como una funcionalidad de varias mas para una aplicacion de forecast llamada forecast hub.
En este mvp el objetivo es tomar los material que se encuentran en stock y revisar que productos son posibles de fabricar utilizando como base 2 fuentes:
1. Las producciones historicas
2. La master data de todos los productos activos

Los materiales que se buscan utilizar son los que tienen un aging elevado (el cual debe ser indicado a modo de parametro en la aplicacion, ejemplo: >200 dias)

La aplicacion en esta fase se alimenta de 3 archivos:

1. BOINV = Materiales en stock
2. PROD-STD = Producciones historicas
3. ITEMPP = Master data de los materiales

## Descripcion de la data y relacion entre si

1. BOINV
Este archivo contiene los materiales en stock, los distingue por el tipo de material con su respectivo aging y la cantidad en kilogramos para cada uno de ellos

Article group: Identifica el tipo de material (BO-1= Cartulinas, PA-1= Papeles, CB-1=Corrugado)

Article no. = Identifica el material en si, que tipo de cartulina es y cual es su gramagge, todos los materiales que comparten este codigo comparten las mismas caracteristicas, solo las diferencian sus medidas

Article desciption = Nombre del material

Variant = Concatenacion con las dimensiones del material y algunas veces con el tipo de certificacion (si es que aplica)

Stock Age = Cantidad de dias del material en stock

Batch no. = Numero de lote, esto identifica un lote de material en especifico, eventualmente en stock podrian haber varios lotes par un mismo tipo de material

Quantity (stock unit) = Cantidad en stock

Stock Unit = unidad en la que esta el stock

Valuated amount = Valor de ese material en stock

Mill currency = moneda de la fabrica 

2. PROD-STD
Este archivo contiene las ordenes de produccion historicas producidas durante un periodo de tiempo, la particularidad es que muestra tambien el material que dicha orden utilizo durante la produccion


JobRef = Numero de la orden de produccion

Article no. = Itendifica el producto fabricado

Variant = Identifica el producto especifico fabricado, la combinacion de Article no.  + Variant hacen un producto final unico

Article description = Nombre del producto fabricado

article in = muy importante para la aplicacion, aca se indica el material consumido. La estructura es: article no. + "/" + variant

Kunde = cliente al cual pertenece el producto fabricado

Lanes = muy importante tambien, estas son las unidades (pcs) al pliego que trae cada producto. Importante para calcular cuantos productos son posibles de fabricar con el material que se encuentra en stock

Nominal good Qty = Cantidad producida

Production time [h] = tiempo empleado en produccion

3. ITEMPP

Este archivo trae informacion relevente relacionada con la master data de los materiales en stock

Article no. = Identifica el material en si, que tipo de cartulina es y cual es su gramagge, todos los materiales que comparten este codigo comparten las mismas caracteristicas, solo las diferencian sus medidas

Variant = Concatenacion con las dimensiones del material y algunas veces con el tipo de certificacion (si es que aplica)

496, Long - /Short Grain = Identifica la direccion de la fibra, este dato es importante ya que dos productos pueden utilizar el mismo codigo de cartulina con las mismas dimensiones pero si sus direcciones de fibra son distintas entonces no es posible compartir el material entre ellos

Los otros campos de momento no son relevantes

## Descripcion de la logica de la app

El objetivo es a partir de los materiales en stock, ver en que productos son posibles de fabricar (en base al historico) y "proponerlos" como alternativa. El objetivo es darle un uso a los materiales que estan inmovilizados

El stock esta en kg por lo tanto hay que llevar esa informacion a pliegos (SHT) calculando el area y multiplicandola por el gramaje del material (incluido en la descripcion del articlo seguido de una "g"), una vez que se tengan los pliegos y si se ha identificado un producto que es posible fabricar entonces se pueden dividir esos pliegos por el numero de Lanes (unidades al pliegos) de ese producto final.

Para aquellos productos donde se puede utilizar el material, hay que calcular el % de perdida y el monto de perdida (en CLP) por utilizar un material sub-optimo (tenemos un material de un tamaño. y al final lo utilizaremos para fabricar un producto de menos tamaño)

### Consideracion

* Se debe tener en cuenta el tipo de fibra, importa
* Un material puede medir 1000x900, cualquier producto que comparte el mismo article no. y que utilice una variante menor es candidato para ser utilizado, ejemplo de productos: 1000x800, 900x900, 700x850, 400x600. Todos son menores en su ancho y largo que el material en stock por lo que el material se podria utilizar en cualquiera de ellos asumiendo una perdida que debe ser calculada (los valores del material en stock se encuentran disponibles en BOINV por lo que se puede calcular su valor por SHT)
* No es necesario analizar todos los materiales en stock, solo aquello que tengas >x dias de stock age (parametro configurable en Configuracion) (ver mas adelante)

## UI y UX

Los archivos base no son estaticos y se pueden estar moviendo por lo tanto deben ser actualizados. Para este MVP es necesario una pantalla inicial que tenga por ahora 2 botones (accesos)

1. Carga de datos
2. Analisis
3. Configuracion

En Carga de datos debe ser posible hacer un drag & drop o un select en browser para seleccionar y subir cada uno de estos archivos, se debe indicar por cada archivo en la UI cuando fue la ultima carga con fecha y hora en hora de chile

Debe haber un boton para volver al menu inicial en caso de que el usuario no haga nada

En Analisis es donde el usuario debe ver el resultado del cruce
En esta screen en la parte superior deben hacer unos card para mostrar informacion general como:

Monto total del stock (todos los materiales)
Monto del obsoleto (basado en los dias aging definidos en configuracion)
% Monto obsoleto

Número de articulos para los cuales se encontró una alternativa
Cantidad de kilos posibles de utilizar mediante las alternativas encontradas
% que representan esos kilos posibles de utilizar
Monto de perdida asumido por utilizar el material suboptimo

Debe haber un filtro en la parte superior para filtrar por el article group (normalmente siempre se utilizara BO-1, ese se podria dejar por defecto asi)

Otro filtro es el del article no. del material, otro es un si/no para mostrar solo los materiales a los que se encontro un uso

Estos cards/KPI deberian estar en el primer tercio de la pantalla distribuidos de forma uniforme y armoniosa

El resto de la screen debe enlistar los materiales en stock con estas columnas:

Article no = el codigo del material
Variant = el tamaño del material
Description = La descipcion del material
Stock aging = los dias en stock
Quantity on stock = la cantidad en stock
Unit = la unidad de medida

(eso viene desde el BOINV = Stock)

Luego como columna hay que agregar
Numero de FG = Numero total de productos que son posibles de fabricar utilizando este material (esto puede ser por FGxxxxx sin considerar la variant del producto)
Cantidad de kilos utilizables = cantidad de kilos posibles de consumir
% perdida = porcentaje de perdida asumido
Monto de perdida = monto de perdida (CLP)

La parte clave el UX viene ahora. Una vez que esta la tabla es necesario que al hacer click en alguna fila (material) que tenga >1 Numero de FG utilizable, se expanda debajo de ese material mostrando y enlistado cada producto con:
- Article no =el del producto FGxxxx
- Variant = el del producto 001xxx
- Description = Nombre del producto
- Cliente = Cliente
- Kilos utilizables 
- % perdida
- monto perdida

esta funcionalidad podria ser un click en la fila o bien un simbolo + al lado de cada fila para expandir y ver los detalles.

Tambien debe haber un boton para voler atras en la parte superior quizas al lado del filtro

En configuracion debe estar el campo para configurar el numero de dias a considerar en stock age para el analisis

## Stack

Reac como front end podria funcionar bien, lo importante es tener una interfaz moderna e intuitiva con colores profesionales.
Para el deploy se podria considerar Vercel para poder montar y mostrar algo en una primera fase. El resto queda a criterio tuyo.