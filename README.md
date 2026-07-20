# Cookie-Mapper

Herramienta integral de auditoría, mapeo topológico y mitigación del rastreo publicitario masivo, fundamentada en el estándar TCF (Transparency and Consent Framework) de la IAB.

## Resumen del Proyecto

El ecosistema moderno de AdTech opera bajo una opacidad sistémica. Cuando un usuario interactúa con un aviso de cookies estándar, sus preferencias de datos se propagan hacia múltiples proveedores internacionales mediante redes de subastas en tiempo real (Real-Time Bidding). 

**Cookie-Mapper** está diseñado para aportar visibilidad a este ecosistema. Mediante la automatización de la navegación web, la extracción de las cargas útiles criptográficas de consentimiento (`euconsent-v2`) y su validación cruzada con registros oficiales, esta herramienta expone la red subyacente de rastreadores, proporcionando los medios necesarios para auditar y revocar el acceso a los datos.

## Hoja de Ruta (Roadmap)

### Fase 1: El Auditor (MVP - Completado)
* Scripts de automatización basados en Playwright para eludir sistemas de mitigación de bots e interactuar de forma integrada con las principales plataformas de gestión de consentimiento (CMP), tales como Didomi y OneTrust.
* Extracción y decodificación criptográfica de la carga útil `TCString` inyectada en la capa de almacenamiento del navegador.
* Cruce de datos en tiempo real con la *Global Vendor List* (GVL) de la IAB para generar auditorías legibles sobre procesadores de datos autorizados y sus respectivos propósitos.

### Fase 2: Motor de Grafos (MVP - Completado)
* Escalado del motor de rastreo para ejecutar auditorías masivas sobre conjuntos de dominios de alto tráfico leyendo un archivo de objetivos (`targets.txt`).
* Modelado y exportación de las cadenas de consentimiento hacia una base de datos orientada a grafos (Neo4j) mediante inyecciones masivas (Bulk Inserts vía UNWIND).
* Análisis topológico: Identificación visual de nodos críticos (Proveedores) e intenciones de uso (Propósitos) que monopolizan la adquisición de datos dentro del ecosistema.

### Fase 2.5: Análisis de Red y RTB (Completado)
* **Auditoría Dinámica Forense:** Inyección de sondas (Sniffer) en el entorno de ejecución para espiar las subastas publicitarias (Real-Time Bidding) mientras se navega.
* **Captura de Capital:** Interceptación del entorno `window.pbjs` (Prebid.js) para extraer el valor económico (CPM) y los ganadores de la subasta.
* **Ampliación del Grafo:** Inyección de una nueva capa topológica económica en Neo4j (`Bidder` y relaciones `RECEIVED_BID`) para cruzar el rastreo legal con el flujo de capital real.

### Fase 3: Escudo de Mitigación (Completado)
* **Extensión Chrome (Manifest V3):** Arquitectura aislada (Content Scripts) para interceptar la inicialización de las webs antes de la carga del DOM (`document_start`).
* **API Hijacking (Secuestro TCF):** Bloqueo e intercepción de la función global `window.__tcfapi` utilizada por las plataformas CMP (Didomi, OneTrust, etc.).
* **Inyección Proactiva (Poisoned Payload):** Despliegue de una cadena `TCString` de "Consentimiento Nulo" inmutable que devuelve 0 consentimientos y 0 intereses legítimos, forzando a los gestores de rastreo (como *Tealium* o *Prebid.js*) a abortar sus procesos por falta de base legal.

### Fase 4: Automatización de Cumplimiento Legal (Completado)
* **Motor Generador RGPD:** Creación de un script (`legal-automator.js`) que cruza la topología de la base de datos (Neo4j) con una plantilla legal base.
* **Inyección de Datos y Automatización:** Extracción automática de la IP pública del usuario mediante APIs externas e inyección de variables de entorno seguras (`.env`).
* **Generación Masiva de Cartas de Cese:** Producción instantánea de cientos de correos electrónicos legales listos para enviar exigiendo el Derecho de Supresión (Art. 17 RGPD) y el Derecho de Oposición (Art. 21 RGPD).

## Pila Tecnológica
- **Node.js**: Entorno de ejecución.
- **Playwright**: Automatización de navegadores *headless* e interacción con el árbol DOM.
- **Neo4j & Cypher**: Base de datos orientada a grafos y lenguaje de consultas.
- **@iabtechlabtcf/core**: Analizador criptográfico y validador de los requisitos del estándar TCF v2.
- **Docker**: Contenerización del entorno de base de datos.

## Instalación y Uso

```bash
# 1. Instalar dependencias de rastreo, criptografía y base de datos
npm install

# 2. Instalar el motor del navegador Chromium para automatización
npx playwright install chromium
```

### Ejecutar Fase 1 (Auditoría Individual en Consola)
```bash
node poc-tcf-decoder/auditor.js https://www.marca.com
```

### Ejecutar Fase 2 (Auditoría Masiva y Mapeo en Grafos)
```bash
# 1. Levantar la base de datos Neo4j (Requiere Docker)
docker-compose up -d

# 2. Rellenar el archivo targets.txt con los dominios deseados
# 3. Ejecutar el orquestador por lotes
node src/batch-auditor.js

# 4. Visualizar el grafo topológico
# Accede a http://localhost:7474 en tu navegador e inicia sesión.
```

---
*Aviso legal: Este proyecto se desarrolla exclusivamente con fines educativos, analíticos y de protección de la privacidad.*
