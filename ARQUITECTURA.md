# Eli - Bot de WhatsApp para Itaca Conversemos

## Arquitectura completa y guia de instalacion

---

## 1. QUE ES ELI

Eli es un bot de WhatsApp que actua como coordinadora de citas para Itaca Conversemos (consultorio de psicologia en Peru). Recibe mensajes por WhatsApp, responde con IA (GPT-4o), califica leads y los deriva automaticamente a las asistentes humanas.

---

## 2. DIAGRAMA DE ARQUITECTURA

```
                    USUARIO
                      |
                      | (escribe por WhatsApp)
                      v
              +---------------+
              |  WhatsApp     |
              |  (Meta)       |
              +-------+-------+
                      |
                      | (webhook)
                      v
        +-------------------------+
        |   EVOLUTION API         |    <-- Servidor propio (EasyPanel)
        |   (Puente WhatsApp)     |        Conecta WhatsApp con tu servidor
        |   Puerto: 8080          |
        +------------+------------+
                     |
                     | POST /webhook
                     v
        +-------------------------+
        |   ELI BOT (Node.js)     |    <-- Tu aplicacion (EasyPanel)
        |   Express Server        |        Puerto: 3000
        |   Puerto: 3000          |
        +--+-------+-------+-----+
           |       |       |
           v       v       v
      +------+ +------+ +--------+
      |OpenAI| |Airtable| |Evolution|
      |API   | |API     | |API     |
      +------+ +------+ +--------+
         |        |         |
         v        v         v
      GPT-4o   Base de    Envia
      Whisper  datos CRM  mensajes
```

---

## 3. SERVICIOS EXTERNOS QUE SE USAN

### 3.1 Evolution API (WhatsApp)
- **Que hace:** Conecta tu numero de WhatsApp con el bot
- **Donde corre:** En tu servidor (EasyPanel)
- **Numero del bot:** 977 668 497
- **Costo:** Gratis (self-hosted)
- **URL:** La que configuraste en EasyPanel (ej: https://tu-dominio.com)

### 3.2 OpenAI (Inteligencia Artificial)
- **Que hace:** Procesa los mensajes con GPT-4o y transcribe audios con Whisper
- **Costo:** Pago por uso (~$0.005 por mensaje de texto, mas por audio/imagenes)
- **Consola:** https://platform.openai.com

### 3.3 Airtable (Base de datos / CRM)
- **Que hace:** Guarda el historial de conversaciones (Eli_Memoria) y los leads (LEADS)
- **Tablas:**
  - `Eli_Memoria` — campos: telefono, history (JSON)
  - `LEADS` — campos: telefono, nombre_contacto, nombre_paciente, edad_paciente, para_quien, ciudad, motivo, dni_contacto, dni_paciente, psicologo_sugerido, calificacion, fecha
- **Costo:** Plan gratuito disponible (hasta 1,200 registros)
- **Consola:** https://airtable.com

### 3.4 EasyPanel (Hosting/Servidor)
- **Que hace:** Aloja tanto Evolution API como el bot Eli
- **Costo:** Depende del VPS que uses (ej: $5-10/mes en DigitalOcean, Hetzner, etc.)

### 3.5 GitHub (Codigo fuente)
- **Que hace:** Almacena el codigo del bot para desplegarlo en EasyPanel
- **Consola:** https://github.com

---

## 4. ESTRUCTURA DEL PROYECTO

```
eli-whatsapp-bot/
|-- index.js                    # Punto de entrada, valida variables de entorno
|-- package.json                # Dependencias del proyecto
|-- .env                        # Credenciales secretas (NO se sube a GitHub)
|-- .env.example                # Ejemplo de .env (SI se sube a GitHub)
|
|-- src/
    |-- app.js                  # Servidor Express (rutas y middleware)
    |
    |-- routes/
    |   |-- webhook.js          # Recibe y procesa mensajes de WhatsApp
    |
    |-- services/
    |   |-- evolution.js        # Conexion con Evolution API (enviar/recibir WhatsApp)
    |   |-- openai.js           # Conexion con GPT-4o y Whisper (IA)
    |   |-- airtable.js         # Conexion con Airtable (memoria y leads)
    |   |-- routing.js          # Deriva leads a las asistentes por WhatsApp
    |
    |-- middleware/
    |   |-- errorHandler.js     # Manejo global de errores
    |
    |-- utils/
        |-- humanDelay.js       # Simula tiempos de respuesta humanos
```

---

## 5. FLUJO COMPLETO DE UN MENSAJE

```
1. Usuario envia mensaje por WhatsApp
                |
2. Evolution API recibe el mensaje y lo envia al webhook del bot
                |
3. Bot responde HTTP 200 inmediatamente (para no hacer timeout)
   Y activa el indicador "escribiendo..." al instante
                |
4. En background:
   a. Extrae tipo de mensaje (texto/audio/imagen/sticker)
   b. Si es AUDIO: descarga y transcribe con Whisper
   c. Si es IMAGEN: descarga y prepara para Vision
   d. Si es STICKER: responde directamente sin usar IA
                |
5. Busca historial de conversacion en Airtable (Eli_Memoria)
                |
6. Envia todo a GPT-4o:
   - System prompt (instrucciones de Eli)
   - Historial previo
   - Mensaje nuevo del usuario
                |
7. GPT-4o responde con JSON:
   {
     "respuesta": "mensaje para el usuario",
     "imagenes": ["yape_qr"],
     "lead": { nombre, edad, ciudad, motivo, calificacion... }
   }
                |
8. Calcula demora humana (10-90 segundos segun largo del mensaje)
   Muestra "escribiendo..." durante ese tiempo
                |
9. Envia la respuesta dividida en parrafos (con pausas entre cada uno)
                |
10. En paralelo:
    a. Guarda/actualiza historial en Airtable
    b. Si tiene calificacion (ALTO/MEDIO/BAJO):
       - Registra o actualiza lead en tabla LEADS
       - Si es lead NUEVO: envia resumen a la asistente de la sede
    c. Si la IA pidio imagenes: las envia al usuario
```

---

## 6. CALIFICACION DE LEADS

El bot clasifica TODOS los leads que hablan:

| Calificacion | Significado | Cuando |
|---|---|---|
| ALTO | Cierre rapido probable | Usuario con urgencia, pregunta por horarios/precios, quiere pagar |
| MEDIO | Requiere seguimiento | Interesado pero con dudas, barreras de precio o tiempo |
| BAJO | Baja probabilidad | Solo curiosea, sin urgencia, rechazo continuar |

La asistente recibe el aviso con indicador visual:
- ALTO = circulo rojo
- MEDIO = circulo amarillo
- BAJO = circulo verde

---

## 7. NUMEROS CONFIGURADOS

| Rol | Numero | Para que |
|---|---|---|
| Bot (Eli) | 977 668 497 | Donde los clientes escriben |
| Asistente Piura | 983 292 173 | Recibe leads de Piura |
| Asistente Lima | 980 453 832 | Recibe leads de Lima y Virtual |

---

## 8. VARIABLES DE ENTORNO (.env)

```env
# Servidor
PORT=3000

# OpenAI (IA y transcripcion de audio)
OPENAI_API_KEY=sk-...          # platform.openai.com > API Keys

# Airtable (base de datos)
AIRTABLE_PAT=pat...            # airtable.com > Account > Developer Hub
AIRTABLE_BASE_ID=app...        # De la URL de tu base Airtable

# Evolution API (WhatsApp)
EVOLUTION_API_URL=https://...  # URL de tu instancia en EasyPanel
EVOLUTION_API_KEY=...          # Panel de Evolution > Instancia > API Key
EVOLUTION_INSTANCE=...         # Nombre de tu instancia en Evolution

# Asistentes por sede
ASISTENTE_PIURA=51983292173
ASISTENTE_LIMA=51980453832

# Imagenes opcionales (URLs publicas)
IMG_YAPE_QR=                   # QR de pago Yape
IMG_BCP_CUENTA=                # Datos de cuenta BCP
IMG_MAPA_PIURA=                # Mapa sede Piura
IMG_MAPA_LIMA=                 # Mapa sede Lima
```

---

## 9. PASOS DE INSTALACION (DESDE CERO)

### PASO 1: Servidor (VPS)
1. Contratar un VPS (DigitalOcean, Hetzner, Vultr, etc.)
2. Instalar EasyPanel en el servidor
3. Configurar dominio apuntando al servidor

### PASO 2: Evolution API (en EasyPanel)
1. En EasyPanel, crear nuevo servicio desde template de Evolution API
2. Configurar puerto (8080 por defecto)
3. Acceder al panel de Evolution API
4. Crear una nueva instancia
5. Escanear QR con el numero del bot (977 668 497)
6. Copiar: URL, API Key, nombre de instancia

### PASO 3: Airtable
1. Crear cuenta en airtable.com
2. Crear una nueva base
3. Crear tabla "Eli_Memoria" con campos: telefono (texto), history (texto largo)
4. Crear tabla "LEADS" con campos: telefono, nombre_contacto, nombre_paciente, edad_paciente, para_quien, ciudad, motivo, dni_contacto, dni_paciente, psicologo_sugerido, calificacion, fecha
5. Ir a Account > Developer Hub > crear Personal Access Token
6. Copiar: PAT y Base ID (de la URL)

### PASO 4: OpenAI
1. Crear cuenta en platform.openai.com
2. Ir a API Keys > crear nueva key
3. Cargar creditos (pago por uso)
4. Copiar: API Key

### PASO 5: Codigo del Bot (GitHub + EasyPanel)
1. Subir el codigo a un repositorio en GitHub
2. En EasyPanel, crear nuevo servicio conectado al repositorio
3. Configurar como aplicacion Node.js
4. Configurar variables de entorno (.env) en el panel de EasyPanel
5. Configurar puerto: 3000
6. Desplegar

### PASO 6: Conectar Evolution API con el Bot
1. En el panel de Evolution API, ir a la instancia
2. Configurar webhook: URL del bot + /webhook
   Ejemplo: https://tu-bot.tu-dominio.com/webhook
3. Activar eventos de mensajes entrantes
4. Probar enviando un mensaje al numero del bot

### PASO 7: Verificacion
1. Enviar un "Hola" al numero 977 668 497
2. Verificar que Eli responde
3. Verificar que el lead aparece en Airtable
4. Verificar que la asistente recibe el aviso cuando el lead se califica

---

## 10. DEPENDENCIAS DEL PROYECTO

| Paquete | Version | Para que |
|---|---|---|
| express | ^4.19.2 | Servidor web |
| axios | ^1.7.2 | Llamadas HTTP a APIs externas |
| dotenv | ^16.4.5 | Leer variables de entorno del .env |
| form-data | ^4.0.0 | Subir archivos (audio a Whisper) |
| nodemon | ^3.1.4 | Recarga automatica en desarrollo |

---

## 11. ENDPOINTS DEL BOT

| Metodo | Ruta | Funcion |
|---|---|---|
| GET | /health | Verificar que el bot esta activo |
| POST | /webhook | Recibir mensajes de Evolution API |

---

## 12. APIS EXTERNAS CONSUMIDAS

### OpenAI
| Endpoint | Metodo | Para que |
|---|---|---|
| /v1/chat/completions | POST | Procesar mensajes con GPT-4o |
| /v1/audio/transcriptions | POST | Transcribir audios con Whisper |

### Airtable
| Endpoint | Metodo | Para que |
|---|---|---|
| /v0/{baseId}/Eli_Memoria | GET | Buscar historial de conversacion |
| /v0/{baseId}/Eli_Memoria | POST | Crear nuevo historial |
| /v0/{baseId}/Eli_Memoria/{id} | PATCH | Actualizar historial existente |
| /v0/{baseId}/LEADS | GET | Buscar lead existente |
| /v0/{baseId}/LEADS | POST | Registrar nuevo lead |
| /v0/{baseId}/LEADS/{id} | PATCH | Actualizar lead existente |

### Evolution API
| Endpoint | Metodo | Para que |
|---|---|---|
| /chat/sendPresence/{instancia} | POST | Mostrar "escribiendo..." |
| /message/sendText/{instancia} | POST | Enviar mensaje de texto |
| /message/sendMedia/{instancia} | POST | Enviar imagen |
| /chat/getBase64FromMediaMessage/{instancia} | POST | Descargar audio/imagen |

---

## 13. COSTOS ESTIMADOS MENSUALES

| Servicio | Costo aproximado |
|---|---|
| VPS (EasyPanel + Evolution) | $5 - $15/mes |
| OpenAI (GPT-4o + Whisper) | $5 - $20/mes (depende del volumen) |
| Airtable | Gratis (hasta 1,200 registros) |
| Dominio | ~$10/ano |
| GitHub | Gratis |
| AgendaPro | Segun tu plan actual |
| **Total estimado** | **$10 - $35/mes** |

---

## 14. MANTENIMIENTO

### Para cambiar el prompt de Eli:
Editar `src/services/openai.js` > variable `SYSTEM_PROMPT`

### Para cambiar numeros de asistentes:
Editar `.env` > `ASISTENTE_PIURA` y `ASISTENTE_LIMA`

### Para agregar un nuevo psicólogo:
Editar el SYSTEM_PROMPT en `src/services/openai.js`, seccion "PSICOLOGOS DISPONIBLES"

### Para agregar una nueva sede:
1. Agregar variable `ASISTENTE_NUEVA_SEDE` en `.env`
2. Agregar en `src/services/routing.js` > objeto `ASISTENTES`
3. Actualizar SYSTEM_PROMPT con info de la nueva sede

### Para ver logs:
En EasyPanel, ir al servicio del bot > Logs
