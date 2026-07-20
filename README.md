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

### Fase 2: Motor de Grafos (En Desarrollo)
* Escalado del motor de rastreo para ejecutar auditorías masivas sobre conjuntos de dominios de alto tráfico (ej. Top 100 de dominios en España).
* Modelado y exportación de las cadenas de consentimiento hacia una base de datos orientada a grafos (Neo4j).
* Análisis de centralidad: Identificación de nodos críticos (proveedores) que monopolizan la adquisición de datos dentro del ecosistema.

### Fase 3: Escudo de Mitigación (Próximamente)
* Desarrollo de una extensión web que implemente la inteligencia de red adquirida en la Fase 2 para interceptar peticiones HTTP.
* Inyección proactiva de cargas útiles de "Consentimiento Nulo" (una cadena `euconsent-v2` criptográficamente válida, pero vacía) para bloquear el rastreo publicitario en su origen, eludiendo los patrones oscuros (Dark Patterns) presentes en las interfaces estándar.

### Fase 4: Automatización de Cumplimiento RGPD (Próximamente)
* Mapeo automatizado de los identificadores de proveedores rastreados con la información de contacto pública de sus Delegados de Protección de Datos (DPO) contenida en la GVL.
* Generación masiva de plantillas legales para ejercer el Derecho de Supresión (Artículo 17 del RGPD) de forma simultánea contra múltiples entidades de rastreo.

## Pila Tecnológica (Fase 1)
- **Node.js**: Entorno de ejecución.
- **Playwright**: Automatización de navegadores *headless* e interacción con el árbol DOM.
- **@iabtechlabtcf/core**: Analizador criptográfico y validador de los requisitos del estándar TCF v2.

## Instalación y Uso

```bash
# 1. Instalar dependencias de rastreo y criptografía
npm install

# 2. Instalar el motor del navegador Chromium para automatización
npx playwright install chromium

# 3. Ejecutar el auditor contra una URL objetivo
node poc-tcf-decoder/auditor.js https://www.marca.com
```

---
*Aviso legal: Este proyecto se desarrolla exclusivamente con fines educativos, analíticos y de protección de la privacidad.*
