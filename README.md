# Talk to Data

Aplicación web Flask para conversar con datos mediante un modelo LLM. Descubre esquemas y tablas, genera un perfil compacto para el modelo, convierte preguntas a SQL de solo lectura y presenta la respuesta como resumen, tabla, mapa, gráfica y consulta reutilizable.

## Puesta en marcha

```bash
python3 -m venv .venv
source .venv/bin/activate
export FLASK_SECRET_KEY="cambia-esta-clave"
python app.py
```

`app.py` detecta e instala mediante `pip` las dependencias que falten antes de importar Flask. Cuando se ejecuta localmente, abre `http://127.0.0.1:8091`. La aplicación arranca con una conexión y un modelo de demostración; para usarlos, crea un chat y selecciona ambos.

La resolución de recursos funciona tanto en la ejecución Python convencional como en el motor de aplicaciones de CML, donde `__file__` puede no estar definido. En ese caso se utiliza el directorio de trabajo del proyecto.

### Puertos locales y Cloudera CML

El servidor siempre enlaza exclusivamente con `127.0.0.1`:

- En CML usa `CDSW_APP_PORT` como primera opción.
- Si `CDSW_APP_PORT` no existe, utiliza `CDSW_READONLY_PORT` como alternativa.
- En local, cuando ninguna de esas variables existe, utiliza el puerto fijo `8091`.
- Siempre se inicia un único listener.

No es necesario definir una variable `PORT` ni utilizar un script de shell entre ambos entornos. En una aplicación de Cloudera basta con indicar `app.py` como fichero de ejecución.

## Flujo de trabajo

En el lateral izquierdo puedes crear **chats**, **conexiones** y **modelos**. La conexión se prueba antes de guardarla: eliges la base o esquema y entre 1 y 12 tablas, y la app calcula su perfil. El modelo debe responder a una petición de prueba antes de poder guardarse. Al crear un chat, seleccionas una conexión y un modelo guardados. El chat empieza con un análisis preliminar del perfil y mantiene su propio historial, sin mezclar preguntas de otros chats.

Las conexiones, modelos, credenciales y chats permanecen en memoria del proceso durante la sesión. Al reiniciar el servidor hay que configurarlos de nuevo; ningún secreto se persiste en disco ni se envía en la cookie. Los chats cuyo modelo o conexión se elimine conservan su historial para consulta, pero ya no aceptan nuevas preguntas.

## Fuentes de datos

La sección **Conexiones** ofrece tres conectores explícitos. En todos ellos, **Probar y descubrir bases** valida el acceso y completa el selector de bases/esquemas antes de descubrir las tablas.

### PostgreSQL

Solicita URL del servidor, base de datos inicial, usuario y contraseña. Admite URLs `postgresql://...` y `jdbc:postgresql://...`; puede añadirse `?sslmode=require`. La base inicial se usa para consultar las demás bases accesibles y las tablas se muestran calificadas como `esquema.tabla`.

### Cloudera: Impala y Hive

La aplicación usa el patrón de Cloudera Machine Learning:

```python
import cml.data_v1 as cmldata

conn = cmldata.get_connection("vast-data-demo", {"USERNAME": "usuario", "PASSWORD": "workload-password"})
dataframe = conn.get_pandas_dataframe("SHOW DATABASES")
conn.close()
```

En **Conexiones → Nueva conexión → Cloudera**, escribe el nombre exacto de la conexión que aparece en el widget de CML, por ejemplo `vast-data-demo`, el usuario y su **Workload Password**. La app llama a `cmldata.get_connection(nombre, {"USERNAME": usuario, "PASSWORD": workload_password})` y ejecuta `SHOW DATABASES`; no utiliza API Key ni necesita una API para enumerar conexiones.

### Trino mediante JDBC URL

También se puede configurar directamente desde la interfaz con:

```text
jdbc:trino://virtual-warehouse.environment.dwx.company.com:443/catalog/schema
```

La URL se traduce al cliente Python de Trino. Si no incluye catálogo o esquema, el asistente descubre primero los catálogos y sus esquemas. Se admite autenticación básica opcional; los valores permanecen únicamente en memoria del servidor durante la sesión.

## Apariencia

En **Preferencias → Apariencia** se puede alternar entre tema oscuro y claro. La preferencia se conserva localmente en el navegador; las credenciales siguen siendo únicamente de sesión.

El lateral derecho muestra las columnas perfiladas de cada tabla, incluidos tipo y cardinalidad de la muestra. Las tablas de resultados incluyen número de fila, las gráficas muestran ejes, escalas, etiquetas y hasta seis series, con eje secundario cuando las escalas difieren mucho; hay barras agrupadas o apiladas y líneas múltiples. Los resultados geográficos se representan sobre un mapa Leaflet con cartografía de OpenStreetMap.

## Modelo LLM

Configura un endpoint compatible con `/chat/completions`, el identificador del modelo y uno de estos métodos:

- CDP token: cabecera `Authorization: Bearer …`
- JWT token: cabecera `Authorization: Bearer …`
- API Key ID + value: cabeceras `X-API-Key-ID` y `X-API-Key`

Puedes pegar tanto la raíz del Model Endpoint de Cloudera como la URL completa terminada en `/v1/chat/completions`. Si dejas **Model ID** vacío, la aplicación consulta `/v1/models` y utiliza el identificador publicado por NIM, por ejemplo `nvidia/nemotron-3-nano`. No se utiliza el valor genérico `default`.

El prompt contiene solo los perfiles de las tablas seleccionadas en ese chat y sus seis interacciones más recientes. El SQL se valida de nuevo en el servidor y se limita a 500 filas antes de ejecutarse.

## Seguridad y comportamiento

- Solo se aceptan sentencias de lectura (`SELECT`, `WITH`, `SHOW`, `DESCRIBE`, `EXPLAIN`).
- Se bloquean sentencias múltiples y operaciones de escritura o administración.
- Las conexiones se cierran después de cada consulta.
- El perfilado usa como máximo 100 filas y 12 tablas.
- La memoria es temporal, se separa por cookie de sesión y por chat, y conserva hasta 30 respuestas por chat.
- Los secretos del modelo, PostgreSQL, Trino y Cloudera no se escriben en disco, cookies ni `localStorage`.

## Pruebas

```bash
.venv/bin/python -m unittest discover -s tests -v
```

Las pruebas cubren catálogo, perfilado, aislamiento de chats, prueba obligatoria de modelos, validación de conexiones, límite de filas y bloqueo de SQL destructivo.

## Estructura

- `app.py`: API Flask, sesión y orquestación pregunta → SQL → datos.
- `data_connector.py`: adaptadores CML, Trino directo y SQLite demo.
- `llm_client.py`: cliente OpenAI-compatible y métodos de autenticación.
- `workspace_store.py`: conexiones y modelos probados, chats aislados y análisis preliminar.
- `templates/index.html`: navegación de chats, conexiones, modelos y preferencias.
- `static/`: diseño cristal, interacción, voz y visualizaciones sin dependencias de frontend.
