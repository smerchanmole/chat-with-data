# Talk to Data

**Pregunta a tus datos en lenguaje natural y conserva siempre la consulta que produjo la respuesta.** Aplicación Flask para Cloudera Machine Learning y ejecución local: conecta una fuente SQL, selecciona tablas, prueba un modelo y empieza a conversar.

![Pantalla inicial de Talk to Data en modo oscuro](docs/screenshots/inicio.png)

La interfaz combina historial de chats, perfiles de columnas y cinco módulos de respuesta: **resumen, tabla, gráfica, mapa y SQL copiable**. Incluye dictado por micrófono, modo claro/oscuro y ocho idiomas. Las capturas de esta guía usan solo la fuente y el modelo de demostración: no contienen credenciales ni datos privados.

> **Importante:** la IA puede equivocarse. Comprueba el SQL y los resultados antes de utilizarlos para decisiones operativas.

## Contenido

1. [Inicio rápido](#inicio-rápido)
2. [Cómo funciona](#cómo-funciona)
3. [Fuentes de datos](#fuentes-de-datos)
4. [Modelo LLM](#modelo-llm)
5. [Chats, respuestas e idiomas](#chats-respuestas-e-idiomas)
6. [Diagnóstico de errores](#diagnóstico-de-errores)
7. [Seguridad y persistencia](#seguridad-y-persistencia)
8. [Pruebas y estructura](#pruebas-y-estructura)

## Inicio rápido

El único fichero que hay que indicar como entrada de una aplicación CML es **`app.py`**. El propio Python detecta e instala mediante `pip` las dependencias ausentes antes de importar Flask; no hay que ejecutar ningún `.sh`.

En local:

```bash
git clone https://github.com/smerchanmole/chat-with-data.git
cd chat-with-data
python3 -m venv .venv
source .venv/bin/activate
export FLASK_SECRET_KEY="una-clave-larga-y-aleatoria"
python app.py
```

Abre **http://127.0.0.1:8091/** y pulsa **Nuevo chat**. La conexión `Demo · Retail analytics` y el modelo local de demostración ya están disponibles para explorar la interfaz sin servicios externos.

![Diálogo para elegir la conexión y el modelo de un chat](docs/screenshots/nuevo-chat.png)

### Dirección y puerto

La aplicación abre **un solo listener** en `127.0.0.1`:

| Entorno | Puerto elegido |
| --- | --- |
| Cloudera CML | `CDSW_APP_PORT`; si no existe, `CDSW_READONLY_PORT` |
| Local, sin variables `CDSW_*` | `8091` |

En CML puede ejecutarse desde su motor de aplicaciones o un notebook: la resolución del directorio de recursos no depende de que exista `__file__`.

## Cómo funciona

![Infografía: chat, perfil, LLM, validación, motor y respuesta](docs/arquitectura.svg)

1. **Prueba la conexión:** descubre bases, elige una y selecciona entre 1 y 12 tablas.
2. **Perfila los datos:** toma hasta 100 filas por tabla para describir columnas, tipos, valores de ejemplo y cardinalidad de la muestra.
3. **Prueba el modelo:** una petición real comprueba endpoint, credenciales y Model ID antes de guardarlo.
4. **Crea un chat:** queda ligado al identificador de esa conexión y ese modelo y empieza con un análisis preliminar.
5. **Pregunta:** el modelo recibe perfil, instrucciones y hasta seis interacciones recientes. Propone SQL de solo lectura; el servidor lo valida y limita antes de enviarlo al motor.
6. **Explora:** cambia entre tabla, gráfica, mapa (si hay coordenadas) y SQL resaltado y copiable.

![Infografía del ciclo de vida y la vinculación de cada chat](docs/ciclo-chat.svg)

## Fuentes de datos

Abre **Conexiones → Nueva conexión**. **Probar y descubrir bases** valida el acceso; después eliges base/esquema, tablas y **Guardar y analizar tablas**. Una conexión nueva no cambia los chats ya vinculados a otra.

![Formulario de conexión Cloudera en el tema claro y en catalán](docs/screenshots/conexiones.png)

### Cloudera: Impala o Hive

Indica el **nombre registrado en CML** (el mismo del widget de conexiones) y el motor **Impala** o **Hive**. Después elige la autenticación de **esa conexión**; no hace falta una API Key ni enumerar automáticamente las conexiones del usuario:

| Opción de la app | Cuándo usarla | Llamada a `cml.data_v1` |
| --- | --- | --- |
| **Credenciales del runtime (Kerberos / on-premise)** | La conexión CML usa el ticket Kerberos de la identidad que ejecuta la aplicación; por ejemplo `default-impala` en un Workbench on-premise | `get_connection(nombre)` |
| **Usuario y Workload Password (Cloud / LDAP)** | La conexión registrada acepta usuario y contraseña explícitos | `get_connection(nombre, {"USERNAME": usuario, "PASSWORD": clave})` |

El modo del runtime **no solicita ni almacena** usuario o contraseña para esa conexión. El siguiente ejemplo reproduce el snippet de Cloudera on-premise:

```python
import cml.data_v1 as cmldata

conn = cmldata.get_connection("default-impala")
try:
    databases = conn.get_pandas_dataframe("SHOW DATABASES")
finally:
    conn.close()
```

Selecciona el modo según la autenticación real de la conexión registrada, no solo según si el despliegue es Cloud u on-premise: un Virtual Warehouse on-premise también puede usar LDAP. Si el modo Kerberos devuelve «No Kerberos credentials available», comprueba que la **identidad que ejecuta la app** dispone de ticket; el indicador verde de tu cuenta personal no cubre una app que se ejecute como cuenta de servicio. [Autenticación de Cloudera AI 1.5.5](https://docs.cloudera.com/machine-learning/1.5.5/site-administration/topics/ml-kerberos.html), [cuentas de servicio](https://docs.cloudera.com/machine-learning/1.5.5/site-administration/topics/ml-service-accounts-auth-hadoop.html).

La conexión se abre para cada consulta y se cierra al terminar. Las conexiones ya guardadas mantienen su método original; para usar otro método, prueba y guarda una nueva conexión y crea un chat asociado a ella. El motor seleccionado determina si el prompt pide **Impala SQL** o **HiveQL**. A `SHOW`, `DESCRIBE` y `EXPLAIN` no se les añade un `LIMIT` sintácticamente inválido: las filas se limitan en la respuesta.

### PostgreSQL

Rellena URL, base inicial, usuario y contraseña. Se aceptan `postgresql://…` y `jdbc:postgresql://…`, por ejemplo `postgresql://servidor:5432?sslmode=require`. Se descubren las bases accesibles y las tablas aparecen como `esquema.tabla`.

### Cloudera 2 · Impala directo

En **Conexiones → Tipo de conexión → Cloudera 2**, configura el **hostname** del coordinador (sin `https://` ni rutas), el **usuario** y su **contraseña**. El puerto inicial es **443** y la ruta HTTP inicial es **cliservice**; ambos son editables. Pulsa **Probar y descubrir bases**, elige la base y las tablas, y guarda la conexión para obtener su perfil. Después crea un chat con esa conexión y un modelo probado.

Esta opción usa `impala.dbapi.connect` del paquete **impyla** directamente. No llama a `cml.data_v1.get_connection` ni utiliza el ticket Kerberos del runtime. El mecanismo se fija a `PLAIN` con transporte HTTP sobre TLS, reproduciendo el mecanismo del snippet del cliente. Los campos del formulario se pasan como parámetros, no se insertan en el código fuente:

```python
from impala.dbapi import connect

conn = connect(
    host=config["host"],
    port=config.get("port", 443),
    auth_mechanism="PLAIN",
    use_http_transport=True,
    http_path=config.get("http_path", "cliservice"),
    use_ssl=True,
    verify_cert=True,
    timeout=60,
    user=config["username"],
    password=config["password"],
)
```

La app verifica el certificado TLS del servidor. Si usa una CA interna que no está en el almacén de confianza del runtime, introduce en **Certificado CA** la ruta de su fichero PEM disponible dentro del runtime; la app lo pasa como `ca_cert`. [Referencia oficial de Impyla](https://github.com/cloudera/impyla).

Cada operación abre su propia conexión y cierra cursor y conexión al terminar, incluso si falla. Los errores de cierre no sustituyen el fallo original. Las consultas del chat usan la base seleccionada y el dialecto **Impala SQL**; los resultados `Decimal` se normalizan igual que en el resto de conectores. La conexión y sus credenciales se guardan cifradas y el chat mantiene su asociación después de reiniciar. `impyla` se instala automáticamente al principio de `app.py`, sin lanzador `.sh`. Puede ejecutarse tanto en Cloudera como en local si el runtime tiene acceso al endpoint.

**Cloudera** sigue siendo la opción para conexiones registradas y autenticación del runtime. **Cloudera 2** es la alternativa directa con usuario y contraseña. PostgreSQL y Trino siguen disponibles.

### Trino

Pega la URL JDBC de tu virtual warehouse:

```text
jdbc:trino://virtual-warehouse.environment.dwx.company.com:443/catalog/schema
```

La app la traduce al cliente Python de Trino. Si faltan catálogo o esquema, descubre primero los catálogos y sus esquemas. Admite usuario y autenticación básica opcional.

## Modelo LLM

En **Modelos → Nuevo modelo**, pon un nombre, el endpoint y las credenciales; pulsa **Probar modelo** y, solo si responde, **Guardar modelo probado**.

| Autenticación | Cabecera enviada |
| --- | --- |
| CDP token | `Authorization: Bearer …` |
| JWT token | `Authorization: Bearer …` |
| API Key ID + Value | `X-API-Key-ID` y `X-API-Key` |

Puedes pegar la raíz del endpoint de Cloudera o la URL completa terminada en `/v1/chat/completions`. El **Model ID** es el nombre publicado por el servidor, no necesariamente el nombre del endpoint; por ejemplo `nvidia/nemotron-3-nano`. Si queda vacío, la app intenta obtenerlo de `/v1/models`. Una llamada válida tiene esta forma:

```text
POST https://…/namespaces/serving-default/endpoints/mi-endpoint/v1/chat/completions
Authorization: Bearer <CDP_TOKEN>
Content-Type: application/json

{"model":"nvidia/nemotron-3-nano","messages":[{"role":"user","content":"Hola"}]}
```

Si aparece un `404`, revisa tanto la URL como el **Model ID** anunciado por el endpoint.

## Chats, respuestas e idiomas

La lista izquierda permite cambiar de chat y consultar de nuevo **preguntas, respuestas, resultados, gráficas y SQL**. Cada conversación conserva su conexión, su modelo y sus instrucciones. Si se elimina una conexión o modelo, el historial sigue legible, pero ese chat deja de aceptar preguntas nuevas.

![Conversación demo con gráfica de dos ejes](docs/screenshots/conversacion.png)

En **Preferencias** eliges los módulos: resumen, tabla, gráfica, mapa y SQL. Las tablas incluyen número de fila. Las gráficas usan todas las filas devueltas (hasta el límite de consulta), agrupan categoría/serie, admiten barras agrupadas o apiladas, líneas, varias series y eje secundario cuando las escalas difieren. Sus controles permiten ampliar o reducir independientemente los ejes X e Y; puedes desplazar horizontalmente la gráfica para recorrer todos los puntos, fijar los valores mínimo y máximo de Y y restablecer la vista automática. Cuando hay un eje secundario, el selector de eje permite ajustar cada rango por separado. Las guías verticales suaves facilitan relacionar cada posición X con los valores Y. El mapa usa Leaflet y OpenStreetMap si hay latitud y longitud; la cartografía requiere acceso a esos recursos externos.

El panel derecho muestra columnas perfiladas e instrucciones exclusivas del chat, por ejemplo «responde con puntos» o «trata `sale_date` como fecha». El micrófono utiliza el reconocimiento de voz disponible en el navegador; si no lo está, se puede escribir normalmente.

### Idiomas y apariencia

En la **esquina superior derecha** están el selector de idioma y, justo a su lado, el botón ☀/☾ para alternar al instante entre los temas **claro** y **oscuro**. Están disponibles **Español, Català, Euskara, Galego, English, Français, Italiano y Deutsch**. En **Preferencias** también puedes elegir por separado idioma de interfaz y respuestas, apariencia y módulos. Las elecciones se recuerdan en el navegador; el dictado usa el idioma de la interfaz.

![La misma conversación en tema claro e interfaz catalana](docs/screenshots/conversacion-clara-ca.png)

Los mensajes y análisis **ya generados** permanecen como se guardaron: cambiar el selector no reescribe el historial ni traduce datos, columnas, SQL o errores originales de la base. Los nuevos análisis y respuestas se solicitan en el idioma elegido.

## Diagnóstico de errores

Si una pregunta falla, la pregunta y su diagnóstico quedan en el historial del chat. La tarjeta distingue estas etapas:

| Etapa | Qué significa | Qué comprobar |
| --- | --- | --- |
| **Preparación del chat** | No se pudo recuperar su conexión o modelo | Recursos asociados al chat |
| **Generación de SQL** | Falló el modelo o su respuesta JSON | Endpoint, Model ID, token, disponibilidad |
| **Validación de SQL** | La propuesta incumple reglas de solo lectura o sintaxis admitida | Pregunta, instrucciones, SQL propuesto |
| **Ejecución de SQL** | La base rechazó o no completó la consulta | Dialecto, tablas, columnas, permisos, tipos |
| **Preparación de resultados** | La consulta terminó, pero falló la preparación de la respuesta | Tipo de dato devuelto, resumen y visualización |

El diagnóstico incluye **Respuesta del modelo** (su texto original, antes de interpretar el JSON, o el cuerpo HTTP si el endpoint rechazó la petición), **SQL enviada al motor** (la consulta preparada, incluido el límite de filas) y **Error** (tipo de excepción, descripción y causas encadenadas). Si la validación impidió ejecutar la consulta, se muestra como **SQL generada (no enviada)**. Si el modelo no respondió o no se llegó a consultar la base, la tarjeta lo indica explícitamente. La SQL está resaltada y es copiable; el texto del modelo se muestra literalmente, sin ejecutar HTML.

Cada fallo tiene una **Referencia** (`trace_id`), también guardada en el historial. En el log de la aplicación de Cloudera busca `Talk to Data query failure` o esa referencia: encontrarás el motor, conexión, etapa, respuesta del modelo, SQL generada/enviada, causa y traceback de Python. Se emite por el logger de Flask a la salida de errores estándar, sin necesitar un fichero de log adicional. Las contraseñas y claves conocidas se ocultan tanto en pantalla como en el historial y en el log. El diagnóstico no vuelve a consultar la base al informar de un fallo.

Si aparece `Object of type Decimal is not JSON serializable` en **Preparación de resultados**, la consulta ya terminó: el problema está en convertir los datos, no en la SQL generada. Los conectores de PostgreSQL, Cloudera (Impala/Hive) y Trino normalizan ahora los resultados antes de mostrar, graficar y guardar: `Decimal` se convierte a número, fechas a texto ISO y valores ausentes/no finitos a `null`. Los números se representan con la precisión de punto flotante usada por las gráficas del navegador. La ocultación de credenciales cortas respeta palabras, números SQL e identificadores de traza; los valores de uno o dos caracteres solo se ocultan cuando aparecen en un contexto de credenciales, como `Bearer` o `password=`.

Si Impala falla más que PostgreSQL, comprueba el motor seleccionado, la base y la tabla, y si las funciones SQL generadas existen en ese dialecto. La causa y la sentencia ayudan a separar sintaxis de permisos o conectividad.

## Seguridad y persistencia

- Se aceptan consultas de lectura (`SELECT`, `WITH`, `SHOW`, `DESCRIBE`, `EXPLAIN`); se rechazan comentarios, sentencias múltiples y operaciones de escritura o administración.
- `SELECT`/`WITH` tienen un máximo de **500 filas** en el SQL enviado al motor. Las consultas de metadatos se recortan en la respuesta para no insertarles un `LIMIT` incompatible.
- El perfilado se limita a **100 filas por tabla** y **12 tablas por conexión**.
- Chats, conexiones, modelos, perfiles, credenciales, resultados y errores se guardan cifrados en `runtime/workspace.db` con `runtime/workspace.key`.
- La cookie firmada usa `FLASK_SECRET_KEY` o una clave local persistida en `runtime/session.key`. No guarda credenciales; identifica el espacio de trabajo de ese navegador y caduca tras un año.
- **Conserva y protege `runtime/`** al actualizar o mover la app. Está excluido de Git. Sin su clave no podrán descifrarse los datos. Borrar cookies o cambiar de navegador no transfiere el historial: todavía no hay cuentas ni sincronización entre dispositivos.
- Los tokens externos pueden caducar. Para producción, establece `FLASK_SECRET_KEY` y controla acceso al proceso, archivos y red.

## Pruebas y estructura

```bash
.venv/bin/python -m unittest discover -s tests -v
node --test tests/test_charts.js tests/test_locales.js
```

Las pruebas cubren conexiones, perfilado, aislamiento de chats, cifrado, prueba de modelos, SQL de solo lectura, límites, errores con causa y SQL, gráficas e integridad de traducciones.

| Ruta | Responsabilidad |
| --- | --- |
| `app.py` | Arranque autocontenido, API Flask, sesiones y flujo pregunta → SQL → respuesta |
| `data_connector.py` | Cloudera, PostgreSQL, Trino y demo |
| `llm_client.py` | Endpoint compatible con chat/completions y autenticación |
| `workspace_store.py` | Historial cifrado y asociación fija de chat, conexión y modelo |
| `templates/index.html` | Estructura de la interfaz |
| `static/app.js`, `static/i18n.js`, `static/style.css` | Interacción, ocho idiomas, visualizaciones y estilo cristal |
| `scripts/capture_screenshots.mjs` | Capturas reproducibles de la demo (Chrome local en macOS) |

Para regenerar las capturas, inicia `python app.py` y ejecuta `node scripts/capture_screenshots.mjs` en macOS con Google Chrome instalado. El script abre un perfil temporal y usa solo la demo.
