---
title: "Guía de Migración: Vincular el número de Gabriela al bot Eli"
subtitle: "Evolution API · WhatsApp Business · EasyPanel"
date: "Abril 2026"
version: "v2.0"
---

\
\

# Guía Completa: Migrar el Número de Eli al WhatsApp Business de Gabriela

> **Proyecto:** Itaca Conversemos — Bot Eli
> **Preparada por:** Mirai Nishimura
> **Fecha:** Abril 2026
> **Versión:** 2.0

---

\pagebreak

## ¿Qué es lo que vamos a hacer?

Esta guía explica cómo desconectar el número de teléfono actual de la instancia del bot **Eli** en Evolution API y vincularlo al número de WhatsApp Business de **Gabriela**. Este proceso se llama **reconexión de sesión**.

El bot **no se reinstala, no se reconfigura, y no se toca el código**. Solo se cambia qué teléfono está autorizado como "dispositivo vinculado" dentro de la instancia de Evolution API.

---

## Roles: quién hace qué

```
┌─────────────────────────────────────────────────────────────────┐
│                     DISTRIBUCIÓN DE ROLES                       │
├─────────────────────────┬───────────────────────────────────────┤
│        MIRAI            │            GABRIELA                   │
│   (en el servidor)      │        (en su teléfono)               │
├─────────────────────────┼───────────────────────────────────────┤
│ • Accede a EasyPanel    │ • Instala WhatsApp Business           │
│ • Entra al manager de   │ • Cierra sesiones activas de          │
│   Evolution API         │   WhatsApp Web                        │
│ • Desconecta el número  │ • Escanea el código QR                │
│   anterior              │   que Mirai le muestra                │
│ • Genera el código QR   │ • Confirma en su teléfono             │
│ • Verifica el estado    │   que quedó vinculado                 │
│ • Valida el webhook     │                                       │
│ • Hace la prueba final  │                                       │
└─────────────────────────┴───────────────────────────────────────┘
```

**Tiempo estimado total:** 10 a 20 minutos (dependiendo de la coordinación con Gabriela)

---

## Visión general del proceso

```
   ANTES                          DURANTE                        DESPUÉS
─────────────────────────────────────────────────────────────────────────

  Número anterior                                           Número de Gabriela
  vinculado a Eli            [MIGRACIÓN]                   vinculado a Eli
       │                                                          │
       ▼                                                          ▼
  ┌─────────┐    Paso 2         ┌─────────┐    Paso 3        ┌─────────┐
  │Teléfono │ ─────────────►   │Instancia│ ─────────────►   │Teléfono │
  │anterior │  Desconectar      │  sin    │  Escanear QR     │Gabriela │
  └─────────┘                  │teléfono │                   └─────────┘
                               └─────────┘
                                    │
                               (la instancia
                               sigue activa,
                               solo sin sesión)

  ╔══════════════════════════════════════════════════════════════════╗
  ║  TODO LO SIGUIENTE NO CAMBIA: código · Airtable · webhook URL   ║
  ║  variables de entorno · EasyPanel · historial de conversaciones  ║
  ╚══════════════════════════════════════════════════════════════════╝
```

---

\pagebreak

## Arquitectura del sistema (para entender el contexto)

```
                         ┌─────────────────────────────────┐
                         │         SERVIDOR (EasyPanel)    │
                         │                                 │
  Usuario envía          │   ┌──────────────┐              │
  mensaje de  ──────────►│   │  Evolution   │              │
  WhatsApp               │   │     API      │              │
                         │   └──────┬───────┘              │
                         │          │ webhook               │
                         │          ▼                       │
                         │   ┌──────────────┐              │
                         │   │  Bot Eli     │              │
                         │   │  (Node.js)   │              │
                         │   └──────┬───────┘              │
                         │          │                       │
                         └──────────┼──────────────────────┘
                                    │
                    ┌───────────────┼────────────────┐
                    ▼               ▼                ▼
              ┌──────────┐   ┌──────────┐    ┌──────────┐
              │  GPT-4o  │   │ Airtable │    │ WhatsApp │
              │ (OpenAI) │   │  (datos) │    │ (responde│
              └──────────┘   └──────────┘    │al usuario│
                                             └──────────┘

  ══════════════════════════════════════════════════════════════
  La migración SOLO afecta al vínculo entre Evolution API
  y el teléfono físico. Todo lo demás permanece igual.
  ══════════════════════════════════════════════════════════════
```

---

\pagebreak

## ANTES DE EMPEZAR — Checklist de preparación

Completar esto antes de iniciar el proceso. No avanzar si algún ítem no está listo.

### ✅ Gabriela completa esto en su teléfono (con tiempo de anticipación)

```
┌─────────────────────────────────────────────────────────────────────┐
│  CHECKLIST DE GABRIELA                                              │
├────┬────────────────────────────────────────────────────────────────┤
│ ☐  │ Tiene WhatsApp BUSINESS instalado                              │
│    │ (NO WhatsApp normal — son aplicaciones diferentes)             │
│    │ Verificar: el ícono tiene una "B" verde pequeña                │
├────┼────────────────────────────────────────────────────────────────┤
│ ☐  │ Su número ya está registrado y activo en WhatsApp Business     │
│    │ (puede recibir y enviar mensajes normalmente)                   │
├────┼────────────────────────────────────────────────────────────────┤
│ ☐  │ Batería del teléfono > 50% o conectado a cargador              │
├────┼────────────────────────────────────────────────────────────────┤
│ ☐  │ Conexión a internet estable (WiFi preferible)                  │
├────┼────────────────────────────────────────────────────────────────┤
│ ☐  │ CERRAR TODAS las sesiones de WhatsApp Web activas:             │
│    │                                                                │
│    │  1. Abrir WhatsApp Business en el teléfono                     │
│    │  2. Tocar los tres puntos ⋮ (menú superior derecho)            │
│    │  3. Ir a "Dispositivos vinculados"                              │
│    │  4. Tocar cada dispositivo → "Cerrar sesión"                   │
│    │  5. Repetir hasta que la lista quede vacía                     │
│    │                                                                │
│    │  ⚠ Si hay sesiones activas, el QR no funcionará               │
└────┴────────────────────────────────────────────────────────────────┘
```

### ✅ Mirai tiene listo esto (en el servidor)

```
┌─────────────────────────────────────────────────────────────────────┐
│  CHECKLIST DE MIRAI                                                 │
├────┬────────────────────────────────────────────────────────────────┤
│ ☐  │ Acceso a EasyPanel con el proyecto desplegado                  │
│    │ (verificar que el servicio del bot está corriendo)             │
├────┼────────────────────────────────────────────────────────────────┤
│ ☐  │ Tiene a mano el valor de EVOLUTION_API_URL del archivo .env    │
│    │ Ejemplo: https://evolution.midominio.com                       │
├────┼────────────────────────────────────────────────────────────────┤
│ ☐  │ Tiene a mano el valor de EVOLUTION_INSTANCE del archivo .env   │
│    │ Ejemplo: eli-prod                                              │
├────┼────────────────────────────────────────────────────────────────┤
│ ☐  │ Tiene a mano la API Key de Evolution API                       │
│    │ (está en el .env como EVOLUTION_API_KEY)                       │
├────┼────────────────────────────────────────────────────────────────┤
│ ☐  │ Coordinó con Gabriela: tienen una llamada activa o             │
│    │ están en el mismo lugar para escanear el QR en tiempo real     │
└────┴────────────────────────────────────────────────────────────────┘
```

> **¿Cómo ver el .env?**
> En EasyPanel → seleccionar el servicio del bot → pestaña "Environment" o "Variables".
> O si tienes acceso SSH al servidor: `cat /ruta/al/proyecto/.env`

---

\pagebreak

## PASO 1 — Acceder al Manager de Evolution API

**Quién lo hace:** Mirai (en el navegador del computador)

```
┌──────────────────────────────────────────────────────────────────────┐
│  NAVEGADOR                                                           │
│                                                                      │
│  🌐  https://[EVOLUTION_API_URL]/manager                            │
│  ────────────────────────────────────────────────────────────────   │
│                                                                      │
│  Ejemplo real:                                                       │
│  https://evolution.itaca-conversemos.com/manager                    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Instrucciones detalladas:**

**1.1** Abre tu navegador (Chrome o Firefox recomendado) y escribe la URL del manager. La URL es el valor de `EVOLUTION_API_URL` en tu `.env`, seguido de `/manager`.

**1.2** Al ingresar, aparecerá una pantalla pidiendo la **API Key**. Ingresa el valor de `EVOLUTION_API_KEY` de tu `.env`.

```
  ┌─────────────────────────────────────────────┐
  │  Evolution API Manager                      │
  │                                             │
  │  API Key: [_____________________________]   │
  │                                             │
  │             [ Entrar ]                      │
  └─────────────────────────────────────────────┘
```

**1.3** Una vez dentro, verás el panel principal con la lista de instancias:

```
  ┌─────────────────────────────────────────────────────────────────┐
  │  Evolution API Manager — Instancias                             │
  ├──────────────────────┬─────────────┬────────────────────────────┤
  │  Nombre              │  Estado     │  Acciones                  │
  ├──────────────────────┼─────────────┼────────────────────────────┤
  │  eli-prod  ◄─ esta  │  ● open     │  [Ver] [QR] [Logout] [...]  │
  │  otra-instancia      │  ● close    │  [Ver] [QR] [Logout] [...]  │
  └──────────────────────┴─────────────┴────────────────────────────┘
```

**1.4** Identifica la instancia cuyo nombre coincide con el valor de `EVOLUTION_INSTANCE` en tu `.env`. Ese es el bot Eli.

> **Estado actual esperado:** `open` o `connected` — significa que hay un teléfono vinculado y activo.

---

\pagebreak

## PASO 2 — Desconectar el número actual

**Quién lo hace:** Mirai

**Objetivo:** Desvincular el teléfono anterior de la instancia de Eli sin borrar nada.

**2.1** Haz clic en la instancia de Eli para abrirla.

**2.2** Dentro de la instancia, busca el botón de **Logout** o **Desconectar**:

```
  ┌────────────────────────────────────────────────────────────────┐
  │  Instancia: eli-prod                                           │
  │  Estado: ● open                                                │
  │                                                                │
  │  [ QR Code ]  [ Connect ]  [ Logout ]  [ Delete ]             │
  │                              ▲                                 │
  │                     Este es el que buscas                      │
  │                                                                │
  │  ⚠ No tocar "Delete" — eso borraría la instancia completa     │
  └────────────────────────────────────────────────────────────────┘
```

**2.3** Haz clic en **Logout** (o Desconectar / Disconnect). Aparecerá un diálogo de confirmación. Confirma.

**2.4** El estado de la instancia cambiará en pocos segundos:

```
  ANTES del logout:          DESPUÉS del logout:

  Estado: ● open        →    Estado: ○ close
                               o
                             Estado: ○ disconnected
```

**2.5** Verifica que el estado cambió antes de continuar.

> **¿Qué pasa en este momento?**
> - El teléfono anterior queda desvinculado de Evolution API.
> - El historial de Airtable permanece intacto.
> - La configuración de webhook permanece intacta.
> - El código del bot sigue corriendo en el servidor.
> - Solo se "cerró sesión" del dispositivo anterior, igual que cerrar una sesión de WhatsApp Web.

---

\pagebreak

## PASO 3 — Conectar el número de Gabriela

**Quién lo hace:** Mirai y Gabriela juntas (en tiempo real)

```
  ╔══════════════════════════════════════════════════════════════════╗
  ║  IMPORTANTE: Coordinar previamente por llamada o estar          ║
  ║  en el mismo lugar. El código QR vence en ~60 segundos.         ║
  ╚══════════════════════════════════════════════════════════════════╝
```

### 3A — Mirai genera el código QR

**3A.1** En la misma instancia (eli-prod, estado "close"), haz clic en **Connect** o **QR Code**.

**3A.2** Aparecerá un código QR en pantalla:

```
  ┌──────────────────────────────────────────────────────────────┐
  │  Instancia: eli-prod                                         │
  │                                                              │
  │         ┌─────────────────────────┐                         │
  │         │  █▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀█   │                         │
  │         │  █ ▄▄▄ █ ▄█▄ █ ▄▄▄ █   │                         │
  │         │  █ █▄█ █ ▀ ▀ █ █▄█ █   │                         │
  │         │  █▄▄▄▄▄█ ▄▀▄ █▄▄▄▄▄█   │  ← CÓDIGO QR            │
  │         │  ▀ ▄▄▄ ▀ ▄▄▄ █▄▄▄▄▀▀   │                         │
  │         │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀   │                         │
  │         └─────────────────────────┘                         │
  │                                                              │
  │  ⏱ Válido por: ~60 segundos                                 │
  │                                                              │
  │  [ Recargar QR ]                                             │
  └──────────────────────────────────────────────────────────────┘
```

**3A.3** Avisa a Gabriela: *"El QR está listo, escanéalo ahora."*

**3A.4** Si el QR vence antes de que Gabriela lo escanee, haz clic en **Recargar QR** y avisa de nuevo.

---

### 3B — Gabriela escanea el QR desde su teléfono

```
  ┌─────────────────────────────────────────────────────────────────┐
  │  PASOS EN EL TELÉFONO DE GABRIELA                               │
  │                                                                 │
  │  1. Abrir WhatsApp Business                                     │
  │          │                                                      │
  │          ▼                                                      │
  │  2. Tocar los tres puntos ⋮ (arriba a la derecha)              │
  │          │                                                      │
  │          ▼                                                      │
  │  3. Seleccionar "Dispositivos vinculados"                       │
  │          │                                                      │
  │          ▼                                                      │
  │  4. Tocar "Vincular un dispositivo"                             │
  │          │                                                      │
  │          ▼                                                      │
  │  5. Puede pedir huella o PIN de desbloqueo — confirmar          │
  │          │                                                      │
  │          ▼                                                      │
  │  6. Se abre la cámara del teléfono                              │
  │          │                                                      │
  │          ▼                                                      │
  │  7. Apuntar la cámara al QR en la pantalla de Mirai            │
  │          │                                                      │
  │          ▼                                                      │
  │  8. Esperar el mensaje: "Dispositivo vinculado correctamente"   │
  └─────────────────────────────────────────────────────────────────┘
```

---

### 3C — Mirai verifica el estado en el manager

**3C.1** Una vez que Gabriela confirme el vínculo en su teléfono, observa el estado de la instancia:

```
  Estado esperado después del escaneo:

  ○ close  →  ● open
              o
              ● connected
```

**3C.2** Si el estado no cambia en 30 segundos, recarga la página del manager. El estado debería actualizarse.

**3C.3** Si el estado sigue en "close" o "connecting" después de 1 minuto, ver la sección **"Si algo falla"** al final de esta guía.

---

\pagebreak

## PASO 4 — Verificar que el bot responde correctamente

**Quién lo hace:** Mirai (desde un número de prueba)

**Objetivo:** Confirmar que el bot Eli responde a mensajes enviados al número de Gabriela.

**4.1** Desde un teléfono diferente al de Gabriela (puede ser el tuyo), abre WhatsApp.

**4.2** Envía un mensaje al número de Gabriela. Puede ser cualquier saludo:

```
  Ejemplo de mensaje de prueba:
  ────────────────────────────────
  "Hola, quisiera información"
  ────────────────────────────────
```

**4.3** Espera entre **7 y 15 segundos**. El bot Eli debe responder automáticamente.

**4.4** Flujo esperado:

```
  TU TELÉFONO (prueba)              SERVIDOR                    GABRIELA
  ─────────────────────             ────────                    ────────
  Enviar: "Hola"
       │
       ▼
  WhatsApp ──────────────────►  Evolution API
                                     │
                                     ▼
                               Bot Eli (Node.js)
                                     │
                                     ├──► GPT-4o (genera respuesta)
                                     │
                                     └──► Airtable (registra contacto)
                                     │
  WhatsApp ◄──────────────────  Evolution API
       │
       ▼
  Recibes respuesta
  de Eli en ~10 seg
```

**4.5** Si el bot responde: **¡migración completada exitosamente!**

**4.6** Si el bot no responde en 20 segundos, continúa con el Paso 5.

---

\pagebreak

## PASO 5 — Verificar la configuración del Webhook

**Quién lo hace:** Mirai

**Cuándo ejecutar este paso:** Solo si el bot no respondió en el Paso 4.

El webhook es la URL a la que Evolution API le "avisa" al bot cada vez que llega un mensaje nuevo. Si el webhook no está bien configurado, el bot nunca se entera de los mensajes.

**5.1** Vuelve al manager de Evolution API y entra a la instancia de Eli.

**5.2** Busca la sección de configuración de **Webhook** (puede estar como "Webhooks", "Settings" o "Configuración"):

```
  ┌────────────────────────────────────────────────────────────────┐
  │  Instancia: eli-prod — Configuración de Webhook               │
  ├────────────────────────────────────────────────────────────────┤
  │                                                                │
  │  URL del Webhook:                                              │
  │  ┌──────────────────────────────────────────────────────────┐  │
  │  │ https://[url-del-bot]/webhook                            │  │
  │  └──────────────────────────────────────────────────────────┘  │
  │                                                                │
  │  Eventos activos:                                              │
  │  ☑ MESSAGES_UPSERT    ← debe estar marcado                    │
  │  ☐ MESSAGES_UPDATE                                            │
  │  ☐ QRCODE_UPDATED                                             │
  │  ☐ CONNECTION_UPDATE                                           │
  │                                                                │
  │                                    [ Guardar ]                 │
  └────────────────────────────────────────────────────────────────┘
```

**5.3** Verifica que:

| Configuración | Valor correcto |
|---|---|
| URL del Webhook | `https://[url-del-bot]/webhook` |
| Evento MESSAGES_UPSERT | ✅ Activado |
| Estado de la instancia | ● open / connected |

**5.4** Si algún campo estaba incorrecto o el evento no estaba marcado, corrígelo y haz clic en **Guardar**.

**5.5** Repite la prueba del Paso 4. El bot debería responder ahora.

---

\pagebreak

## RESOLUCIÓN DE PROBLEMAS

### Árbol de diagnóstico rápido

```
  ¿El bot no responde?
           │
           ▼
  ¿La instancia está en estado "open"?
       │                │
      NO               SÍ
       │                │
       ▼                ▼
  ¿Gabriela cerró    ¿El webhook está
  las sesiones de    configurado?
  WhatsApp Web?          │           │
       │               NO           SÍ
      NO                │             │
       │                ▼             ▼
       ▼          Configurar     ¿EasyPanel
  Cerrarlas y     webhook y      muestra el
  repetir Paso 3  guardar        servicio activo?
                                    │           │
                                   NO           SÍ
                                    │             │
                                    ▼             ▼
                               Reiniciar      Revisar logs
                               el servicio    del bot en
                               en EasyPanel   EasyPanel
```

---

### Tabla de síntomas y soluciones

| # | Síntoma | Causa probable | Solución |
|---|---------|----------------|----------|
| 1 | El QR vence antes de ser escaneado | Tardaron más de 60 seg en coordinar | Hacer clic en "Recargar QR" y avisar a Gabriela de inmediato |
| 2 | La instancia queda en estado "connecting" por más de 2 minutos | Gabriela tiene sesiones de WhatsApp Web activas | Gabriela debe cerrar todas las sesiones activas (Menú ⋮ → Dispositivos vinculados → cerrar cada uno) y repetir el Paso 3 |
| 3 | El bot no responde después de conectar | Webhook no configurado o con URL incorrecta | Verificar y corregir el webhook (Paso 5) |
| 4 | El QR aparece pero al escanearlo da error | El teléfono usa WhatsApp normal, no WhatsApp Business | Gabriela debe instalar la app "WhatsApp Business" (son apps diferentes) |
| 5 | Evolution API no reconoce la conexión | El número de Gabriela no está registrado en WhatsApp Business | Gabriela debe completar el registro de su número en WhatsApp Business antes de intentar vincular |
| 6 | El estado de la instancia volvió a "close" solo | La sesión de WhatsApp Business de Gabriela se interrumpió | Repetir el Paso 3 |
| 7 | El bot responde con error o no genera respuesta de Eli | El servicio del bot está caído en EasyPanel | En EasyPanel: verificar que el servicio está "Running" y revisar los logs |
| 8 | La instancia aparece como "deleted" o desapareció | Se presionó "Delete" por error | Contactar al equipo técnico — hay que recrear la instancia y reconfigurar |

---

### Cómo revisar los logs del bot en EasyPanel

Si el bot está conectado pero no responde correctamente:

```
  EasyPanel
      │
      ▼
  Seleccionar el proyecto del bot
      │
      ▼
  Seleccionar el servicio (ej: "eli-bot" o "app")
      │
      ▼
  Pestaña "Logs"
      │
      ▼
  Buscar mensajes de error (en rojo) o
  verificar que aparecen entradas cuando
  se envía un mensaje de prueba
```

Errores comunes en los logs:

| Mensaje en los logs | Qué significa |
|---|---|
| `OPENAI_API_KEY invalid` | La clave de OpenAI está mal o venció |
| `Airtable 401 Unauthorized` | La clave de Airtable está mal o venció |
| `Cannot POST /webhook` | El bot no está corriendo correctamente |
| `Connection refused` | El servicio del bot cayó — reiniciar desde EasyPanel |

---

\pagebreak

## Notas importantes para después de la migración

```
  ┌────────────────────────────────────────────────────────────────┐
  │  LO QUE GABRIELA NECESITA SABER                               │
  ├────────────────────────────────────────────────────────────────┤
  │                                                                │
  │  ✅ El bot corre en el servidor, NO en su teléfono.           │
  │     Gabriela no necesita mantener WhatsApp abierto.           │
  │                                                                │
  │  ✅ El teléfono solo necesita estar encendido con internet    │
  │     para mantener activa la sesión de WhatsApp Business,      │
  │     igual que funciona cualquier sesión de WhatsApp Web.      │
  │                                                                │
  │  ⚠ Si Gabriela reinstala WhatsApp Business o cambia de       │
  │    teléfono, habrá que repetir el Paso 3 de esta guía.       │
  │                                                                │
  │  ⚠ Si Gabriela cierra sesión en WhatsApp Business o          │
  │    desvincula el dispositivo manualmente, el bot dejará       │
  │    de funcionar hasta repetir el Paso 3.                      │
  │                                                                │
  │  ⚠ No vincular más de un dispositivo adicional a la misma    │
  │    cuenta de WhatsApp Business si el bot ya está vinculado.   │
  │    WhatsApp Business permite múltiples dispositivos, pero     │
  │    puede generar inconsistencias en algunos casos.            │
  │                                                                │
  └────────────────────────────────────────────────────────────────┘
```

---

## Checklist final de verificación

Una vez completada la migración, confirmar:

```
┌────┬──────────────────────────────────────────────────────────────┐
│ ☐  │ La instancia en Evolution API muestra estado "open"          │
├────┼──────────────────────────────────────────────────────────────┤
│ ☐  │ Gabriela confirmó en su teléfono el vínculo                  │
├────┼──────────────────────────────────────────────────────────────┤
│ ☐  │ Se envió un mensaje de prueba al número de Gabriela          │
├────┼──────────────────────────────────────────────────────────────┤
│ ☐  │ El bot respondió como Eli en menos de 15 segundos            │
├────┼──────────────────────────────────────────────────────────────┤
│ ☐  │ El webhook está configurado y apunta al bot (Paso 5)         │
├────┼──────────────────────────────────────────────────────────────┤
│ ☐  │ EasyPanel muestra el servicio del bot como "Running"         │
└────┴──────────────────────────────────────────────────────────────┘
```

---

## Referencia rápida de variables de entorno relevantes

| Variable | Dónde encontrarla | Para qué se usa en esta guía |
|---|---|---|
| `EVOLUTION_API_URL` | Archivo `.env` del bot / EasyPanel | Construir la URL del manager: `[valor]/manager` |
| `EVOLUTION_API_KEY` | Archivo `.env` del bot / EasyPanel | Ingresar al manager de Evolution API |
| `EVOLUTION_INSTANCE` | Archivo `.env` del bot / EasyPanel | Identificar qué instancia es la del bot Eli |

---

*Guía preparada para el equipo de Itaca Conversemos — Proyecto bot Eli · Abril 2026*
*Versión 2.0*
