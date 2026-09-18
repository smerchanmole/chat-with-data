# Talk to Data

Aplicación web Flask para conversar con datos mediante un modelo LLM. Descubre esquemas y tablas, genera un perfil compacto para el modelo, convierte preguntas a SQL de solo lectura y presenta la respuesta como resumen, tabla, mapa, gráfica y consulta reutilizable.

## Puesta en marcha

```bash
python3 -m venv .venv
source .venv/bin/activate
export FLASK_SECRET_KEY="cambia-esta-clave"
python app.py
```

`app.py` detecta e instala mediante `pip` las dependencias que falten antes de importar Flask. Cuando se ejecuta localmente, abre `http://127.0.0.1:8091`. La aplicación arranca con una fuente demo y no necesita un LLM para las tres preguntas sugeridas.

La resolución de recursos funciona tanto en la ejecución Python convencional como en el motor de aplicaciones de CML, donde `__file__` puede no estar definido. En ese caso se utiliza el directorio de trabajo del proyecto.

### Puertos locales y Cloudera CML

El servidor siempre enlaza exclusivamente con `127.0.0.1`:

- En CML usa `CDSW_APP_PORT` como primera opción.
- Si `CDSW_APP_PORT` no existe, utiliza `CDSW_READONLY_PORT` como alternativa.
- En local, cuando ninguna de esas variables existe, utiliza el puerto fijo `8091`.
- Siempre se inicia un único listener.

No es necesario definir una variable `PORT` ni utilizar un script de shell entre ambos entornos. En una aplicación de Cloudera basta con indicar `app.py` como fichero de ejecución.

## Conexiones CML: Impala, Hive y Trino

La aplicación usa el patrón de Cloudera Machine Learning:

```python
import cml.data_v1 as cmldata

conn = cmldata.get_connection("vast-data-demo")
dataframe = conn.get_pandas_dataframe("SHOW DATABASES")
conn.close()
```

Declara las conexiones visibles en el selector mediante una variable, usando `nombre:motor`:

```bash
export CML_DATA_CONNECTIONS="vast-data-demo:impala,go01-optimizer:hive,mi-trino:trino"
```

Esto evita almacenar credenciales: CML resuelve cada conexión registrada. La app ejecuta `SHOW DATABASES`, `SHOW TABLES` y muestras limitadas sobre las tablas elegidas.

## Trino mediante JDBC URL

También se puede configurar directamente desde la interfaz con:

```text
jdbc:trino://virtual-warehouse.environment.dwx.company.com:443/catalog/schema
```

La URL se traduce al cliente Python de Trino. Si no incluye catálogo o esquema, el asistente descubre primero los catálogos y sus esquemas. Se admite autenticación básica opcional; los valores permanecen únicamente en la sesión del navegador.

## Modelo LLM

Configura un endpoint compatible con `/chat/completions`, el identificador del modelo y uno de estos métodos:

- CDP token: cabecera `Authorization: Bearer …`
- JWT token: cabecera `Authorization: Bearer …`
- API Key ID + value: cabeceras `X-API-Key-ID` y `X-API-Key`

El prompt contiene solo los perfiles de las tablas seleccionadas y las seis interacciones más recientes. El SQL se valida de nuevo en el servidor y se limita a 500 filas antes de ejecutarse.

## Seguridad y comportamiento

- Solo se aceptan sentencias de lectura (`SELECT`, `WITH`, `SHOW`, `DESCRIBE`, `EXPLAIN`).
- Se bloquean sentencias múltiples y operaciones de escritura o administración.
- Las conexiones se cierran después de cada consulta.
- El perfilado usa como máximo 100 filas y 12 tablas.
- La memoria es temporal, se separa por cookie de sesión y conserva hasta 30 respuestas.
- Los secretos del modelo y de Trino no se escriben en disco ni en `localStorage`.

## Pruebas

```bash
.venv/bin/python -m unittest discover -s tests -v
```

Las pruebas cubren catálogo, perfilado, conversación demo, memoria y el bloqueo de SQL destructivo.

## Estructura

- `app.py`: API Flask, sesión y orquestación pregunta → SQL → datos.
- `data_connector.py`: adaptadores CML, Trino directo y SQLite demo.
- `llm_client.py`: cliente OpenAI-compatible y métodos de autenticación.
- `templates/index.html`: aplicación y asistente de configuración.
- `static/`: diseño cristal, interacción, voz y visualizaciones sin dependencias de frontend.
