# Cookie-Mapper: Plataforma Forense de Auditoría AdTech

Plataforma de inteligencia, auditoría topológica y recolección de pruebas periciales diseñada para exponer y mitigar la fuga sistemática de datos personales en el ecosistema publicitario global (AdTech), fundamentada en el análisis criptográfico del estándar TCF de la IAB y la recolección de tráfico de red.

## Resumen de Inteligencia

El ecosistema moderno de AdTech opera bajo una opacidad estructural diseñada para evadir el escrutinio regulatorio. Cuando un usuario interactúa con un aviso de cookies, sus preferencias se propagan instantáneamente hacia cientos de proveedores internacionales mediante redes de subastas en tiempo real (*Real-Time Bidding* o RTB) y sincronización oculta de identificadores (*Cookie Syncing*).

**Cookie-Mapper** no es un mero "scraper"; es una **herramienta de investigación forense**. Automatiza la navegación, extrae las cargas útiles criptográficas de consentimiento (`euconsent-v2`), intercepta el tráfico de red bruto (archivos `.har`) y lo sella mediante hashes SHA-256. Todo ello se cruza en tiempo real con la *Global Vendor List* (GVL) y el *Data Privacy Framework* (DPF) de EE.UU., generando pruebas de grado pericial sobre violaciones flagrantes del Reglamento General de Protección de Datos (RGPD), especialmente en lo relativo a transferencias internacionales ilícitas (Art. 44).

## Capacidades de Auditoría

### 1. Extracción Forense y Cadena de Custodia
* **Auditoría Automatizada:** Motor basado en Playwright capaz de auditar cientos de dominios eludiendo mitigaciones antibot e interactuando con las principales plataformas CMP (Didomi, OneTrust).
* **Firma Criptográfica:** Cada captura de tráfico HTTP/HTTPS se graba en formato `.har` y es sellada inmediatamente con un hash SHA-256 para garantizar la integridad y el no repudio de la prueba pericial ante autoridades como la AEPD.
* **Directorio de Evidencia:** Generación automática de manifiestos JSON que vinculan la carga útil TCF interceptada, la topología de red y el tráfico cifrado.

### 2. Motor Topológico (Grafo de Explotación)
* **Ingesta Masiva:** Modelado y exportación de las cadenas de consentimiento hacia una base de datos orientada a grafos (Neo4j) mediante inyecciones transaccionales de alto rendimiento.
* **Análisis de Red:** Identificación visual de nodos críticos, *Data Brokers* de 4º nivel y cárteles de compartición de datos que monopolizan la adquisición de perfiles de usuario.

### 3. Interceptación Económica (RTB & Cookie Syncing)
* **Captura de Capital (Sniffer):** Inyección de sondas en el entorno V8 del navegador para interceptar la instancia global `window.pbjs` (Prebid.js), extrayendo el valor económico (CPM), moneda y ganadores de las subastas en la sombra.
* **Detección de Reventa:** Análisis heurístico de redirecciones HTTP 302 y Referer Hijacking para exponer la sincronización silenciosa de identificadores de usuario entre corporaciones externas al dominio original.

### 4. Inteligencia Legal y DPF
* **Validación Jurisdiccional:** Cruce automático de la sede social de cada *Vendor* con la base de datos oficial del *Data Privacy Framework* (DPF) del Departamento de Comercio de EE.UU.
* **Detección de Ilegalidad:** Banderas de riesgo rojo (⛔ Ilegal) para corporaciones radicadas en jurisdicciones sin adecuación (ej. China, Rusia) operando en el EEE, lo que constituye una infracción del Art. 44 del RGPD.
* **Generación de Cartas de Cese (Art. 17 y 21):** Extracción automatizada de información cruzada para generar de forma masiva demandas legales de supresión y oposición contra el rastreo de datos masivo.

### 5. Dashboard Ejecutivo de Inteligencia
* Panel interactivo (`npm run dashboard`) enfocado a investigadores, auditores DPO y autoridades legales.
* Gráficos dinámicos, métricas KPI de volumen de negocio en RTB, matrices de riesgo legal de transferencias extracomunitarias y ranking de los mayores acaparadores de datos del ecosistema.

## Pila Tecnológica
- **Node.js**: Entorno de ejecución principal (Asincronía y Concurrencia Pura).
- **Playwright**: Motor *headless* de instrumentación y recolección de evidencias HTTP/HAR.
- **Neo4j & Cypher**: Base de datos orientada a grafos para la persistencia topológica.
- **@iabtechlabtcf/core**: Analizador criptográfico del estándar TCF v2.
- **Crypto (Node nativo)**: Hashing SHA-256 para validación forense de evidencias.
- **Chart.js**: Renderizado vectorial para el panel de inteligencia de amenazas de privacidad.

## Instalación y Ejecución

```bash
# 1. Instalar dependencias del orquestador y criptografía
npm install

# 2. Instalar el motor de instrumentación
npx playwright install chromium
```

### Comandos de Operación

```bash
# Iniciar el motor de auditoría masiva y recolección forense
npm run audit

# Levantar el generador de inteligencia (Panel HTML interactivo)
npm run dashboard

# Generar el paquete de requerimientos legales (Cartas RGPD)
npm run rgpd
```

## Referencias Regulatorias y Científicas

El diseño de esta plataforma investigativa se alinea con la jurisprudencia europea actual y el análisis crítico del capitalismo de vigilancia:

1. **Reglamento (UE) 2016/679 (RGPD):** Especial atención a los **Artículos 17, 21 y 44** (Transferencias internacionales de datos).
2. **Decisión de Ejecución (UE) 2023/1795 (DPF):** Marco de Privacidad de Datos UE-EE.UU.
3. **Agencia Española de Protección de Datos (AEPD):** Guías técnicas sobre el uso de cookies e inspección de transferencias ilícitas.
4. **Matte, C., Bielova, N., & Santos, C. (2020):** *Do Cookie Banners Respect my Choice? Measuring Legal Compliance of Banners from IAB Europe’s TCF*. IEEE (S&P).
5. **Nouwens, M. et al. (2020):** *Dark Patterns after the GDPR: Scraping Consent Pop-ups and Demonstrating their Influence*. ACM CHI.

---
*Aviso Legal: Esta plataforma es una herramienta de investigación y auditoría de privacidad ("Legal Tech"). La intercepción de subastas y la extracción de datos se realiza pasivamente sobre tráfico público expuesto en el cliente. La exactitud forense de las capturas está garantizada mediante hashing criptográfico.*
