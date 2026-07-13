# Traspaso de Eli — Guía para Gabriela

**Documento de entrega · Ítaca Conversemos**
Preparado por Mirai · Fecha objetivo de salida: **agosto 2026 (en ~2 meses)**

---

## Para qué sirve este documento

Eli es el bot de WhatsApp que coordina las citas de Ítaca Conversemos. Hoy lo construí y lo mantengo yo. Como me retiro en unos dos meses, este documento existe para que **Eli siga funcionando sin mí** y para que tú, Gabriela, sepas exactamente:

1. Qué es Eli y qué hace (en palabras simples).
2. De qué "servicios" depende para estar viva, y quién los paga.
3. **Qué cuentas hay que pasar a nombre de la empresa** (esto es lo más urgente).
4. Cómo saber si está funcionando bien.
5. **Qué hacer cuando algo se rompe** y a quién llamar.
6. Un cronograma de las próximas 8 semanas para hacer el traspaso ordenado.

> **Lo más importante en una frase:** Eli no es un programa que vive en una computadora de la oficina. Vive en internet, sobre **varias cuentas de terceros** (unas mías, otras de la empresa). Si esas cuentas se cierran o no se pagan, Eli deja de responder. El traspaso consiste, sobre todo, en **poner esas cuentas a nombre de la empresa** y en que haya **alguien técnico** disponible para los arreglos.

---

## 1. Qué es Eli (sin tecnicismos)

Eli es una **asistente virtual** que atiende el WhatsApp del consultorio las 24 horas. Cuando una persona escribe al número del bot:

- Eli **conversa** como una coordinadora real: saluda, pregunta el motivo, la ciudad, para quién es la consulta, la edad, etc.
- **Califica** cada contacto (lead) en tres niveles:
  - 🔴 **ALTO** — muy probable que agende pronto.
  - 🟡 **MEDIO** — interesado pero con dudas.
  - 🟢 **BAJO** — solo está curioseando.
- **Avisa a la asistente humana** de la sede correspondiente (con todos los datos) para que cierre la cita y cobre.
- Si la persona deja de responder, Eli le manda **recordatorios automáticos** durante unos 15 días para intentar recuperarla.

**Lo que Eli SÍ hace:** atender, conversar, ordenar la información, calificar y derivar.
**Lo que Eli NO hace:** cobrar, agendar el horario final ni reemplazar a la asistente. El cierre (mandar horarios y cobrar la consulta de **S/ 50**) lo hace siempre una persona: **Yazmin** en Piura, **Ayvi** en Lima.

```
   Cliente escribe por WhatsApp
              │
              ▼
        🐘 Eli (el bot)  ──── responde con IA, califica, ordena datos
              │
              ▼
   Avisa a la asistente de la sede  ──► Yazmin (Piura) / Ayvi (Lima)
              │
              ▼
   La asistente cierra la cita y cobra (S/ 50)
```

---

## 2. Las "piezas" de las que depende Eli

Piensa en Eli como un negocio que alquila varios servicios. Cada uno cumple una función y **si uno falla, Eli falla**. No hace falta que entiendas cómo funcionan por dentro — solo saber que existen, para qué sirven y quién los paga.

| Pieza | Para qué sirve (en simple) | Si falla, pasa que… |
|---|---|---|
| **Evolution API** | Es el "cable" que conecta el WhatsApp del bot con el programa. Vive en el servidor. | Eli deja de recibir y enviar mensajes. **Síntoma típico: el bot "se cae".** |
| **OpenAI** | Es el "cerebro": la inteligencia artificial (GPT‑4o) que entiende y redacta las respuestas. **Se paga por uso.** | Eli recibe mensajes pero no sabe qué responder, o responde con error. |
| **Supabase** | La "memoria": guarda las conversaciones y los datos de cada lead. | Eli pierde el hilo de las conversaciones; los leads no se guardan. |
| **Google Sheets** | Hojas de cálculo donde quedan registrados los leads por sede (Piura / Lima). | Los leads dejan de aparecer en la hoja, aunque el chat siga. |
| **EasyPanel (servidor / VPS)** | El "local alquilado" en internet donde corren Evolution y el programa de Eli. **Se paga mensual.** | Si no se paga o se apaga, **todo Eli se apaga**. |
| **GitHub** | El "archivador" donde está guardado el código del programa. | No afecta el día a día, pero sin él un técnico no puede hacer mejoras. |

> **Nota:** en versiones anteriores también se usó **Airtable** como base de datos. Hoy la base principal es Supabase, pero puede quedar algún registro o configuración en Airtable. El técnico que reciba el proyecto debe confirmarlo (ver Sección 9).

---

## 3. ⭐ Inventario de cuentas y accesos (LO MÁS URGENTE)

Como las cuentas hoy son **una mezcla** (algunas mías, otras de la empresa), el primer paso real del traspaso es **auditar de quién es cada una** y pasar las que estén a mi nombre a un correo de la empresa.

**Acción:** llenar esta tabla juntos, una fila a la vez. La columna "Dueño hoy" la completamos revisando con qué correo está registrada cada cuenta.

| Servicio | ¿Quién paga? | Dueño hoy (correo) | ¿Hay que transferir? | Cómo se transfiere |
|---|---|---|---|---|
| **OpenAI** (platform.openai.com) | Tarjeta — pago por uso | _[completar]_ | _[Sí/No]_ | Crear cuenta con correo de la empresa + tarjeta de la empresa, generar **nueva llave** y reemplazar la vieja. |
| **EasyPanel / VPS** (servidor) | Mensual | _[completar]_ | _[Sí/No]_ | Transferir el VPS al correo/tarjeta de la empresa, o migrar a un VPS nuevo de la empresa. |
| **Supabase** | Gratis o plan | _[completar]_ | _[Sí/No]_ | Invitar al correo de la empresa como dueño del proyecto, o transferir la organización. |
| **Google Sheets / Apps Script** | Gratis | _[completar]_ | _[Sí/No]_ | Pasar la propiedad de las hojas a una cuenta Google de la empresa. |
| **GitHub** (código) | Gratis | _[completar]_ | _[Sí/No]_ | Transferir el repositorio a una cuenta GitHub de la empresa. |
| **Número de WhatsApp del bot** (977 668 497) | — | _[completar]_ | _[Sí/No]_ | Confirmar que el chip/línea es de la empresa. **Crítico:** sin este número no hay bot. |
| **Dominio** (si hay, ej. itacaconversemos.com) | Anual | _[completar]_ | _[Sí/No]_ | Pasar el registro del dominio a la empresa. |

### Cómo entregar las contraseñas de forma segura
- **No** mandes contraseñas ni llaves por WhatsApp ni por correo suelto.
- Lo recomendable: un **gestor de contraseñas** compartido (por ejemplo Bitwarden, gratis) donde queden guardadas todas las cuentas de Eli, accesible para la empresa.
- Las "llaves" técnicas (OpenAI, Supabase, Evolution) están hoy en un archivo de configuración llamado `.env`. **Por seguridad, esas llaves se deben cambiar por unas nuevas después de mi salida** (es lo normal cuando se va quien las tenía). Eso lo hace el técnico en 10 minutos.

---

## 4. Costos mensuales (qué hay que seguir pagando)

| Servicio | Costo aproximado | Cómo se paga |
|---|---|---|
| Servidor (EasyPanel + Evolution) | US$ 5 – 15 / mes | Tarjeta, mensual automático |
| OpenAI (el "cerebro") | US$ 5 – 20 / mes | Tarjeta, **pago por uso** (más mensajes = más costo) |
| Supabase | Gratis (o plan si crece) | — |
| Google Sheets / GitHub | Gratis | — |
| Dominio (si aplica) | ~US$ 10 / año | Tarjeta, anual |
| **Total estimado** | **US$ 10 – 35 / mes** | |

> ⚠️ **El riesgo #1 a futuro:** que una tarjeta personal mía siga pagando OpenAI o el servidor. El día que esa tarjeta se venza o yo la quite, **Eli se apaga sin aviso**. Por eso, en el traspaso hay que poner una **tarjeta de la empresa** en OpenAI y en el servidor.

---

## 5. El día a día: cómo operar Eli

La buena noticia: en condiciones normales, **Eli no necesita que nadie la toque**. Trabaja sola. Esto es lo que sí conviene que sepas:

### a) Cómo saber que Eli está viva
La prueba más simple: **escríbele "Hola" al número del bot (977 668 497)** desde otro teléfono. Si responde en menos de un par de minutos, está funcionando. Hazlo una vez al día durante los primeros tiempos.

### b) Los recordatorios automáticos (que no te asusten)
Cuando un lead deja de responder, Eli le manda mensajes de recordatorio **automáticamente**: a la 1ª hora, a las 3 horas, al día siguiente, y así durante unos **15 días** (8 mensajes en total). Esto es **a propósito** — sirve para recuperar gente que se enfría. No es un error ni que Eli esté "loca".

Además, si un lead llegó hasta la oferta de la consulta y no responde en 3 horas, Eli le avisa a la asistente con un mensaje **"LEAD NO CERRADO"** para que le escriba a mano. Un toque humano cierra ventas que el bot solo no cierra.

### c) El panel para iniciar contacto manual
Hay una página web (un "panel") para cuando un lead **dejó su número en redes sociales pero nunca escribió al bot**. Ahí la asistente pone el celular y el nombre, y Eli le manda el primer mensaje para romper el hielo.
- Se entra con una dirección web + una clave (token). **El técnico te dará el link exacto.**
- Es opcional; el bot funciona igual sin usarlo.

### d) Qué hacen Yazmin y Ayvi
Son las que **reciben los avisos de Eli y cierran**. Eli les manda un WhatsApp con la ficha del lead (nombre, motivo, edad, calificación). Ellas mandan horarios y cobran los S/ 50. Conviene confirmar con ellas que **siguen recibiendo bien los avisos** después del traspaso.

| Rol | Número | Sede |
|---|---|---|
| Bot (Eli) | 977 668 497 | Donde escriben los clientes |
| Yazmin (asistente) | 983 292 173 | Piura |
| Ayvi (asistente) | 980 453 832 | Lima y Virtual |

---

## 6. 🚨 Qué hacer cuando algo falla

Esta es la sección para tener a la mano. Tú no vas a arreglar el código — pero sí puedes **diagnosticar el síntoma** y saber a quién llamar.

| Síntoma | Causa más probable | Qué hacer |
|---|---|---|
| **Eli no responde a nada** (mandas "Hola" y silencio) | El servidor se cayó, o se desconectó el WhatsApp, o no se pagó. | 1) Revisar que el servidor (EasyPanel) esté pagado y encendido. 2) Llamar al técnico para que reconecte el WhatsApp (a veces se desconecta y hay que **escanear de nuevo el código QR**). |
| **Eli recibe pero responde "error" o cosas raras** | Se acabó el saldo de OpenAI, o cambió/venció la llave. | Avisar al técnico: revisar saldo y llave de OpenAI. Recargar tarjeta si hace falta. |
| **El WhatsApp del bot aparece desconectado** | Cerraron sesión, cambiaron de teléfono o pasaron muchos días apagado. | El técnico vuelve a vincular el número escaneando el QR desde Evolution. **No borres la app de WhatsApp del teléfono del bot.** |
| **Las asistentes no reciben los avisos** | Cambió el número de una asistente, o su WhatsApp tiene problema. | Confirmar que los números de Yazmin/Ayvi son los correctos; el técnico los actualiza en la configuración. |
| **Los leads no aparecen en la hoja de cálculo** | Se rompió la conexión con Google Sheets. | Avisar al técnico. El chat puede seguir funcionando aunque la hoja falle. |
| **Eli dice precios o información desactualizada** | El "guion" de Eli quedó viejo. | Pedir al técnico que actualice el texto de instrucciones de Eli (ver Sección 7). |

> **Regla de oro:** si dudas, lo primero que se revisa siempre es **(1) que el servidor esté pagado y encendido** y **(2) que el WhatsApp del bot siga conectado**. El 80 % de las caídas son una de esas dos.

---

## 7. Tareas comunes (todas necesitan un técnico)

Estas son las cosas que con el tiempo vas a querer cambiar. **Ninguna la haces tú directamente** — todas las hace alguien técnico, pero aquí están para que sepas que **son posibles, rápidas y baratas**, y para que sepas pedirlas con claridad.

| Quiero… | Qué se cambia | Dificultad para el técnico |
|---|---|---|
| Cambiar el precio de la consulta (ej. ya no S/ 50) | El "guion" de Eli | 5 min |
| Cambiar el número de una asistente | La configuración (`.env`) | 2 min |
| Cambiar el tono / la forma de hablar de Eli | El "guion" de Eli (`SYSTEM_PROMPT`) | 10–30 min |
| Agregar un psicólogo nuevo | El "guion" de Eli | 15 min |
| Agregar una sede nueva | Configuración + guion | 30–60 min |
| Cambiar los mensajes de recordatorio | El archivo de seguimientos | 15 min |

> El "guion" de Eli (su personalidad y todo lo que sabe decir) vive en un solo archivo: `src/services/openai.js`. Cuando quieras un cambio de cómo habla o qué ofrece, eso es lo que toca el técnico.

---

## 8. ⭐ Lo que NO puede faltar: una persona técnica

Como tú no vas a tocar el código, **la empresa necesita tener identificada a una persona técnica** para los arreglos y mejoras. Hay dos caminos:

**Opción A — Retenerme/contratarme por horas.** Quedar disponible para emergencias y cambios puntuales (lo más simple a corto plazo).

**Opción B — Contratar/asignar otro desarrollador.** Para que sea sostenible. El perfil que necesitas:
- **Desarrollador backend Node.js** (es el lenguaje en que está hecho Eli).
- Que sepa de **APIs, servidores (EasyPanel/Docker) y bases de datos**.
- No necesita ser senior ni caro: el proyecto es chico y está **documentado**.

**Lo que ese técnico recibe el día 1** (todo está en la carpeta del proyecto):
- `ARQUITECTURA.md` — explicación técnica completa de cómo está armado todo.
- `GUIA_MIGRACION_NUMERO_v2.md` (y su PDF) — cómo cambiar el número de WhatsApp del bot.
- El código fuente completo + el archivo de configuración `.env`.
- Los accesos a todas las cuentas (Sección 3).
- Este documento.

> 💡 **Recomendación:** aunque elijas la Opción A conmigo, haz **al menos una sesión** donde yo le entregue todo a ese segundo técnico, para que la empresa nunca dependa de una sola persona otra vez.

---

## 9. Cronograma sugerido — las próximas 8 semanas

| Semana | Qué hacer | Quién |
|---|---|---|
| **1** | Llenar juntos el **inventario de cuentas** (Sección 3): de quién es cada una. | Gabriela + Mirai |
| **2** | Crear los correos de la empresa y el **gestor de contraseñas** compartido. | Gabriela |
| **3–4** | Pasar a la empresa las cuentas que estén a mi nombre: **OpenAI, servidor, Supabase, Google, GitHub**. Poner **tarjeta de la empresa** en OpenAI y servidor. | Mirai + técnico |
| **5** | Verificar que todo sigue funcionando tras el cambio (mandar "Hola", revisar avisos a Yazmin/Ayvi, ver leads en la hoja). | Todos |
| **6** | Definir el plan técnico: ¿me quedo por horas (A) o entra otro dev (B)? Si es B, **sesión de entrega** con él. | Gabriela |
| **7** | **Rotar las llaves** (OpenAI, Supabase, Evolution) por nuevas, ahora que las cuentas son de la empresa. | Técnico |
| **8** | Repaso final con Gabriela: leer juntos las Secciones 5 y 6, dejar contactos de emergencia anotados. | Gabriela + Mirai |

---

## 10. Glosario rápido

- **Lead:** una persona interesada que escribió o dejó su número.
- **Bot:** programa automático que conversa (Eli).
- **IA / GPT‑4o:** la inteligencia artificial que redacta las respuestas (servicio de OpenAI).
- **API / llave (key):** una "contraseña larga" que permite que un programa use un servicio. Si se filtra, hay que cambiarla.
- **Servidor / VPS:** la computadora en internet (alquilada) donde vive Eli.
- **Deploy:** publicar una versión nueva del programa (lo hace el técnico al guardar cambios).
- **`.env`:** el archivo con todas las llaves y configuraciones secretas.
- **Webhook:** la "puerta" por la que WhatsApp le entrega los mensajes a Eli.

---

## 11. Contactos de emergencia _(completar)_

| Rol | Nombre | Contacto |
|---|---|---|
| Desarrollador / soporte técnico | _[completar]_ | _[completar]_ |
| Responsable en la empresa | Gabriela | _[completar]_ |
| Asistente Piura | Yazmin | 983 292 173 |
| Asistente Lima | Ayvi | 980 453 832 |
| Proveedor del servidor (VPS) | _[completar]_ | _[completar]_ |

---

*Cualquier duda sobre este documento, escríbeme antes de mi salida. La idea es que cuando me vaya, tú tengas todo lo necesario para que Eli no pare un solo día. — Mirai*
