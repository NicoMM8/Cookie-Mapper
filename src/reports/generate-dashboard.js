/**
 * @fileoverview Cookie-Mapper — Panel de Auditoría Forense v3.1
 *
 * Genera un informe HTML autocontenido a partir de la totalidad de entidades
 * y relaciones almacenadas en Neo4j. El resultado es un panel de análisis
 * interactivo que incluye:
 *
 *   - 7 secciones segmentadas con navegación lateral colapsable
 *   - Sistema de fichas informativas (click-to-info) en cada métrica
 *   - Ordenación dinámica en tablas, búsqueda en tiempo real y filtros
 *   - Diseño completamente responsive (mobile-first con breakpoints)
 *   - Score de riesgo compuesto por dominio (normalización min-max)
 *   - Gauge semicircular en Canvas 2D para transferencias fuera del EEE
 *
 * Dependencias externas (CDN):
 *   - Chart.js 4.x
 *   - Google Fonts (Inter 300-800)
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { getDriver, closeDriver } = require('../db/neo4j-client');

const OUTPUT_DIR = path.join(__dirname, '../../output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'dashboard.html');

// ─────────────────────────────────────────────────────────────────────────
// Traducciones oficiales de los propósitos TCF v2.2
// Fuente: IAB Europe Transparency & Consent Framework Policies v4.1
// ─────────────────────────────────────────────────────────────────────────

const PURPOSE_TRANSLATIONS = {
    "Store and/or access information on a device": "Almacenar o acceder a información en un dispositivo",
    "Use limited data to select advertising": "Usar datos limitados para seleccionar anuncios",
    "Create profiles for personalised advertising": "Crear perfiles para publicidad personalizada",
    "Use profiles to select personalised advertising": "Usar perfiles para seleccionar publicidad personalizada",
    "Create profiles to personalise content": "Crear perfiles para personalizar contenidos",
    "Use profiles to select personalised content": "Usar perfiles para seleccionar contenido personalizado",
    "Measure advertising performance": "Medir el rendimiento de los anuncios",
    "Measure content performance": "Medir el rendimiento del contenido",
    "Understand audiences through statistics or combinations of data from different sources": "Comprender al público a través de estadísticas o combinaciones de datos",
    "Develop and improve services": "Desarrollar y mejorar los servicios",
    "Use limited data to select content": "Usar datos limitados para seleccionar contenido"
};

function translatePurpose(name) {
    if (!name) return "Propósito no especificado";
    if (PURPOSE_TRANSLATIONS[name]) return PURPOSE_TRANSLATIONS[name];
    for (const [en, es] of Object.entries(PURPOSE_TRANSLATIONS)) {
        if (name.toLowerCase().includes(en.toLowerCase())) return es;
    }
    return name;
}

// ─────────────────────────────────────────────────────────────────────────
// Mapa de jurisdicciones corporativas conocidas.
// Se utiliza para clasificar las transferencias de datos en función de si
// el receptor opera dentro o fuera del EEE (Art. 44-49 RGPD).
// ─────────────────────────────────────────────────────────────────────────

const JURISDICTION_MAP = {
    "doubleclick.net":      { country: "Estados Unidos",       flag: "🇺🇸", nonEU: true, dpf: true },
    "google.com":           { country: "Estados Unidos",       flag: "🇺🇸", nonEU: true, dpf: true },
    "googlesyndication.com":{ country: "Estados Unidos",       flag: "🇺🇸", nonEU: true, dpf: true },
    "amazon-adsystem.com":  { country: "Estados Unidos",       flag: "🇺🇸", nonEU: true, dpf: true },
    "rubiconproject.com":   { country: "Estados Unidos",       flag: "🇺🇸", nonEU: true, dpf: true },
    "pubmatic.com":         { country: "Estados Unidos",       flag: "🇺🇸", nonEU: true, dpf: true },
    "3lift.com":            { country: "Estados Unidos",       flag: "🇺🇸", nonEU: true, dpf: true },
    "liveramp.com":         { country: "Estados Unidos",       flag: "🇺🇸", nonEU: true, dpf: true },
    "adnxs.com":            { country: "Estados Unidos",       flag: "🇺🇸", nonEU: true, dpf: true },
    "openx.net":            { country: "Estados Unidos",       flag: "🇺🇸", nonEU: true, dpf: true },
    "bidswitch.net":        { country: "EE.UU. / Suiza",       flag: "🇺🇸", nonEU: true, dpf: false },
    "lijit.com":            { country: "Estados Unidos",       flag: "🇺🇸", nonEU: true, dpf: true },
    "yellowblue.io":        { country: "Estados Unidos",       flag: "🇺🇸", nonEU: true, dpf: false },
    "1rx.io":               { country: "Estados Unidos",       flag: "🇺🇸", nonEU: true, dpf: true },
    "presage.io":           { country: "Estados Unidos",       flag: "🇺🇸", nonEU: true, dpf: false },
    "servenobid.com":       { country: "Estados Unidos",       flag: "🇺🇸", nonEU: true, dpf: false },
    "fwmrm.net":            { country: "Estados Unidos",       flag: "🇺🇸", nonEU: true, dpf: false },
    "id5-sync.com":         { country: "Estados Unidos",       flag: "🇺🇸", nonEU: true, dpf: false },
    "eskimi.com":           { country: "Estonia / EE.UU.",     flag: "🇺🇸", nonEU: true, dpf: false },
    "bricks-co.com":        { country: "Estados Unidos",       flag: "🇺🇸", nonEU: true, dpf: false },
    "a-mo.net":             { country: "Estados Unidos",       flag: "🇺🇸", nonEU: true, dpf: false },
    "amx1.net":             { country: "Estados Unidos",       flag: "🇺🇸", nonEU: true, dpf: false },
    "omnitagjs.com":        { country: "Estados Unidos",       flag: "🇺🇸", nonEU: true, dpf: false },
    "temu.com":             { country: "China / Caimán",       flag: "🇨🇳", nonEU: true, dpf: false },
    "inmobi.com":           { country: "India / EE.UU.",       flag: "🇮🇳", nonEU: true, dpf: false },
    "criteo.com":           { country: "Francia",              flag: "🇫🇷", nonEU: false, dpf: false },
    "criteo":               { country: "Francia",              flag: "🇫🇷", nonEU: false, dpf: false },
    "smartadserver.com":    { country: "Francia",              flag: "🇫🇷", nonEU: false, dpf: false },
    "sparteo.com":          { country: "Francia",              flag: "🇫🇷", nonEU: false, dpf: false },
    "admanmedia.com":       { country: "España",               flag: "🇪🇸", nonEU: false, dpf: false },
    "onetag-sys.com":       { country: "Reino Unido / EE.UU.", flag: "🇬🇧", nonEU: true, dpf: false },
    "opera.com":            { country: "Noruega / China",      flag: "🇳🇴", nonEU: true, dpf: false }
};

function getJurisdiction(domain) {
    if (!domain) return { country: "Desconocido", flag: "🌐", nonEU: true, dpf: false };
    const clean = domain.toLowerCase().trim();
    if (JURISDICTION_MAP[clean]) return JURISDICTION_MAP[clean];
    for (const [key, info] of Object.entries(JURISDICTION_MAP)) {
        if (clean.includes(key) || key.includes(clean)) return info;
    }
    if (clean.endsWith('.com') || clean.endsWith('.net') || clean.endsWith('.io')) {
        return { country: "Estados Unidos (Estimado)", flag: "🇺🇸", nonEU: true, dpf: false };
    }
    return { country: "Unión Europea", flag: "🇪🇺", nonEU: false, dpf: false };
}

function getLegalBadge(jur) {
    if (!jur.nonEU) return '<span class="b b-g">✓ EEE</span>';
    if (jur.country.includes('China') || jur.country.includes('India') || jur.country.includes('Rusia')) return '<span class="b b-r">⛔ Ilegal</span>';
    if (jur.dpf) return '<span class="b b-g">✓ DPF</span>';
    return '<span class="b b-y">⚠️ Sin DPF</span>';
}

// ─────────────────────────────────────────────────────────────────────────
// Extracción de datos desde Neo4j
// ─────────────────────────────────────────────────────────────────────────

async function fetchDashboardMetrics() {
    const driver = getDriver();
    const session = driver.session();

    try {
        console.log('[DASHBOARD] Extrayendo la totalidad de los datos desde Neo4j...');

        const websitesRes      = await session.run(`MATCH (w:Website) RETURN count(w) AS count`);
        const vendorsRes       = await session.run(`MATCH (v:Vendor) RETURN count(v) AS count`);
        const biddersCountRes  = await session.run(`MATCH (b:Bidder) RETURN count(b) AS count`);
        const bidsRes          = await session.run(`MATCH ()-[b:RECEIVED_BID]->() RETURN count(b) AS totalBids, coalesce(avg(b.cpm), 0) AS avgCpm, coalesce(max(b.cpm), 0) AS maxCpm`);
        const syncsRes         = await session.run(`MATCH ()-[s:SHARES_DATA_WITH]->() RETURN coalesce(sum(s.weight), 0) AS totalSyncs`);

        const avgCpmVal = parseFloat(bidsRes.records[0].get('avgCpm'));
        const stats = {
            totalWebsites:  websitesRes.records[0].get('count').toNumber(),
            totalVendors:   vendorsRes.records[0].get('count').toNumber(),
            totalBidders:   biddersCountRes.records[0].get('count').toNumber(),
            totalBids:      bidsRes.records[0].get('totalBids').toNumber(),
            avgCpm:         avgCpmVal.toFixed(3),
            maxCpm:         parseFloat(bidsRes.records[0].get('maxCpm')).toFixed(3),
            impressionCost: (avgCpmVal / 1000).toFixed(5),
            totalSyncs:     syncsRes.records[0].get('totalSyncs').toNumber()
        };

        // Reventas completas
        const brokersRes = await session.run(`
            MATCH (v1:Bidder)-[r:SHARES_DATA_WITH]->(v2:Bidder)
            RETURN v1.name AS seller, v2.name AS buyer, sum(r.weight) as count
            ORDER BY count DESC
        `);
        const allBrokers = brokersRes.records.map(r => ({
            seller: r.get('seller'),
            buyer:  r.get('buyer'),
            count:  r.get('count').toNumber(),
            jurisdiction: getJurisdiction(r.get('buyer'))
        }));

        // Pujadores RTB
        const biddersRes = await session.run(`
            MATCH (w:Website)-[r:RECEIVED_BID]->(b:Bidder)
            RETURN b.name AS bidder, count(r) AS totalBids, max(r.cpm) AS maxCpm, avg(r.cpm) AS avgCpm
            ORDER BY totalBids DESC
        `);
        const allBidders = biddersRes.records.map(r => ({
            bidder:    r.get('bidder'),
            totalBids: r.get('totalBids').toNumber(),
            maxCpm:    parseFloat(r.get('maxCpm')).toFixed(3),
            avgCpm:    parseFloat(r.get('avgCpm')).toFixed(3),
            jurisdiction: getJurisdiction(r.get('bidder'))
        }));

        // Dominios auditados
        const sitesListRes = await session.run(`
            MATCH (w:Website)
            OPTIONAL MATCH (w)-[:USES_CMP]->(c:CMP)
            OPTIONAL MATCH (w)-[:AUTHORIZES_DATA_FLOW]->(v:Vendor)
            OPTIONAL MATCH (w)-[:RECEIVED_BID]->(b:Bidder)
            RETURN w.domain AS domain,
                   coalesce(c.name, 'No detectada') AS cmp,
                   count(DISTINCT v) AS vendorCount,
                   count(DISTINCT b) AS bidCount
            ORDER BY vendorCount DESC
        `);
        const allWebsites = sitesListRes.records.map(r => ({
            domain:      r.get('domain'),
            cmp:         r.get('cmp'),
            vendorCount: r.get('vendorCount').toNumber(),
            bidCount:    r.get('bidCount').toNumber()
        }));

        // Propósitos consentidos
        const purposesRes = await session.run(`
            MATCH (w:Website)-[:CONSENTS_TO_PURPOSE]->(p:Purpose)
            RETURN p.name AS purpose, count(w) AS count
            ORDER BY count DESC
        `);
        const topPurposes = purposesRes.records.map(r => ({
            purpose: translatePurpose(r.get('purpose')),
            count:   r.get('count').toNumber()
        }));

        // Propósitos declarados por vendors
        const vendorPurposesRes = await session.run(`
            MATCH (v:Vendor)-[:DECLARES_PURPOSE]->(p:Purpose)
            RETURN p.name AS purpose, count(DISTINCT v) AS vendorCount
            ORDER BY vendorCount DESC
        `);
        const vendorPurposes = vendorPurposesRes.records.map(r => ({
            purpose:     translatePurpose(r.get('purpose')),
            vendorCount: r.get('vendorCount').toNumber()
        }));

        // Top vendors por apariciones
        const topVendorsRes = await session.run(`
            MATCH (w:Website)-[:AUTHORIZES_DATA_FLOW]->(v:Vendor)
            RETURN v.name AS vendor, count(DISTINCT w) AS appearances
            ORDER BY appearances DESC
            LIMIT 15
        `);
        const topVendors = topVendorsRes.records.map(r => ({
            vendor:      r.get('vendor'),
            appearances: r.get('appearances').toNumber()
        }));

        // Distribución de CMPs
        const cmpDistRes = await session.run(`
            MATCH (w:Website)-[:USES_CMP]->(c:CMP)
            RETURN c.name AS cmp, count(w) AS siteCount
            ORDER BY siteCount DESC
        `);
        const cmpDistribution = cmpDistRes.records.map(r => ({
            cmp:       r.get('cmp'),
            siteCount: r.get('siteCount').toNumber()
        }));

        // Transferencias internacionales
        const transfersRes = await session.run(`
            MATCH (v1:Bidder)-[r:SHARES_DATA_WITH]->(v2:Bidder)
            RETURN v2.name AS target, sum(r.weight) AS count
        `);

        let totalNonEUSyncs = 0;
        let totalEUSyncs    = 0;
        const jurisdictionBreakdown = {};

        transfersRes.records.forEach(r => {
            const target = r.get('target');
            const count  = r.get('count').toNumber();
            const jur    = getJurisdiction(target);
            if (!jurisdictionBreakdown[jur.country]) {
                jurisdictionBreakdown[jur.country] = { count: 0, flag: jur.flag, nonEU: jur.nonEU };
            }
            jurisdictionBreakdown[jur.country].count += count;
            if (jur.nonEU) totalNonEUSyncs += count;
            else           totalEUSyncs    += count;
        });

        const totalTransfers  = totalNonEUSyncs + totalEUSyncs;
        const nonEUPercentage = totalTransfers > 0 ? ((totalNonEUSyncs / totalTransfers) * 100).toFixed(1) : "0.0";
        stats.nonEUPercentage = nonEUPercentage;
        stats.totalNonEUSyncs = totalNonEUSyncs;

        const jurisdictionList = Object.entries(jurisdictionBreakdown)
            .map(([country, info]) => ({ country, flag: info.flag, count: info.count, nonEU: info.nonEU }))
            .sort((a, b) => b.count - a.count);

        // Score de riesgo por dominio
        const maxVendors = Math.max(...allWebsites.map(w => w.vendorCount), 1);
        const maxBids    = Math.max(...allWebsites.map(w => w.bidCount), 1);
        allWebsites.forEach(w => {
            const normV = w.vendorCount / maxVendors;
            const normB = w.bidCount / maxBids;
            w.riskScore = Math.min(100, Math.round((normV * 55) + (normB * 45)));
        });

        // Índice de riesgo legal global
        const pctFloat     = parseFloat(nonEUPercentage);
        const volumeFactor = totalTransfers > 0 ? Math.min(1, Math.log10(totalTransfers) / 5) : 0;
        stats.legalRiskIndex = Math.min(100, Math.round(pctFloat * 0.85 + volumeFactor * 15));

        return { stats, allBrokers, allBidders, allWebsites, topPurposes, vendorPurposes, topVendors, cmpDistribution, jurisdictionList };

    } finally {
        await session.close();
    }
}

// ─────────────────────────────────────────────────────────────────────────
// Generación del HTML
// ─────────────────────────────────────────────────────────────────────────

function buildHtmlDashboard(data) {
    const { stats, allBrokers, allBidders, allWebsites, topPurposes, vendorPurposes, topVendors, cmpDistribution, jurisdictionList } = data;

    // Serialización de datos para Chart.js
    const pLabels  = JSON.stringify(topPurposes.map(p => p.purpose));
    const pData    = JSON.stringify(topPurposes.map(p => p.count));
    const vpLabels = JSON.stringify(vendorPurposes.slice(0, 11).map(p => p.purpose));
    const vpData   = JSON.stringify(vendorPurposes.slice(0, 11).map(p => p.vendorCount));
    const tvLabels = JSON.stringify(topVendors.map(v => v.vendor.length > 24 ? v.vendor.substring(0, 22) + '...' : v.vendor));
    const tvData   = JSON.stringify(topVendors.map(v => v.appearances));
    const tbLabels = JSON.stringify(allBidders.slice(0, 10).map(b => b.bidder));
    const tbData   = JSON.stringify(allBidders.slice(0, 10).map(b => b.totalBids));
    const cmLabels = JSON.stringify(cmpDistribution.map(c => c.cmp.length > 20 ? c.cmp.substring(0, 18) + '...' : c.cmp));
    const cmData   = JSON.stringify(cmpDistribution.map(c => c.siteCount));

    const maxBrokerCount = allBrokers.length > 0 ? allBrokers[0].count : 1;
    const maxBidderBids  = allBidders.length > 0 ? allBidders[0].totalBids : 1;

    const ts = new Date().toLocaleString('es-ES', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cookie-Mapper — Panel de Auditoría</title>
<meta name="description" content="Panel de auditoría forense de consentimientos TCF v2.2, subastas RTB y transferencias internacionales de datos personales (RGPD Art. 44-49).">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
/* ===================================================================
   DESIGN SYSTEM
   Panel corporativo. Paleta contenida. Sin efectos decorativos.
   =================================================================== */
:root {
    --bg:          #0e1117;
    --bg-card:     #161b26;
    --bg-hover:    #1c2333;
    --bg-input:    #0e1117;
    --border:      #252d3a;
    --border-light:#1e2636;
    --accent:      #3b82f6;
    --accent-dim:  rgba(59, 130, 246, 0.15);
    --green:       #22c55e;
    --green-dim:   rgba(34, 197, 94, 0.12);
    --amber:       #eab308;
    --amber-dim:   rgba(234, 179, 8, 0.12);
    --red:         #ef4444;
    --red-dim:     rgba(239, 68, 68, 0.12);
    --text:        #e2e8f0;
    --text-2:      #94a3b8;
    --text-3:      #64748b;
    --sidebar-w:   240px;
    --radius:      8px;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }

body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.55;
    font-size: 14px;
    -webkit-font-smoothing: antialiased;
}

/* ── Sidebar ── */
.sidebar {
    position: fixed;
    left: 0; top: 0;
    width: var(--sidebar-w);
    height: 100vh;
    background: #0b0f18;
    border-right: 1px solid var(--border);
    z-index: 200;
    display: flex;
    flex-direction: column;
    transition: transform 0.25s ease;
}

.sidebar-head {
    padding: 20px 18px 16px;
    border-bottom: 1px solid var(--border);
}

.sidebar-head h2 {
    font-size: 15px;
    font-weight: 800;
    color: var(--text);
    letter-spacing: -0.3px;
}

.sidebar-head small {
    display: block;
    font-size: 10px;
    color: var(--text-3);
    text-transform: uppercase;
    letter-spacing: 1.5px;
    margin-top: 3px;
}

.sidebar nav { flex: 1; padding: 8px 0; overflow-y: auto; }

.nav-link {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 18px;
    color: var(--text-2);
    text-decoration: none;
    font-size: 13px;
    font-weight: 500;
    border-left: 2px solid transparent;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.nav-link:hover { background: rgba(59, 130, 246, 0.05); color: var(--text); }

.nav-link.active {
    color: var(--accent);
    background: rgba(59, 130, 246, 0.07);
    border-left-color: var(--accent);
}

.nav-link svg { width: 16px; height: 16px; flex-shrink: 0; opacity: 0.65; }
.nav-link.active svg { opacity: 1; }

.sidebar-foot {
    padding: 14px 18px;
    border-top: 1px solid var(--border);
    font-size: 11px;
    color: var(--text-3);
}

/* ── Hamburger (mobile) ── */
.hamburger {
    display: none;
    position: fixed;
    top: 12px; left: 12px;
    z-index: 300;
    width: 40px; height: 40px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
    align-items: center;
    justify-content: center;
    color: var(--text);
}

.hamburger svg { width: 20px; height: 20px; }

.overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 150;
}

.overlay.open { display: block; }

/* ── Main ── */
.main {
    margin-left: var(--sidebar-w);
    padding: 24px 28px 40px;
    max-width: 1440px;
}

/* ── Section ── */
.section {
    margin-bottom: 32px;
    opacity: 0;
    transform: translateY(16px);
    transition: opacity 0.5s ease, transform 0.5s ease;
}

.section.visible { opacity: 1; transform: none; }

.sec-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
    text-transform: uppercase;
    letter-spacing: 0.6px;
    margin-bottom: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
}

.sec-count {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-3);
    background: rgba(255,255,255,0.04);
    padding: 2px 8px;
    border-radius: 4px;
}

/* ── Header bar ── */
.header-bar {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 20px 24px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin-bottom: 28px;
    gap: 16px;
    flex-wrap: wrap;
}

.header-bar h1 {
    font-size: 20px;
    font-weight: 800;
    color: var(--text);
    letter-spacing: -0.5px;
}

.header-bar .sub {
    font-size: 13px;
    color: var(--text-2);
    margin-top: 4px;
    max-width: 700px;
    line-height: 1.5;
}

.header-meta {
    text-align: right;
    flex-shrink: 0;
}

.header-meta .ts {
    font-size: 12px;
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
}

.header-meta .live {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    font-weight: 700;
    color: var(--green);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-top: 4px;
}

.dot-live {
    width: 6px; height: 6px;
    background: var(--green);
    border-radius: 50%;
    animation: blink 2.5s ease-in-out infinite;
}

@keyframes blink {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.3; }
}

/* ── KPI cards ── */
.kpi-row {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 12px;
}

.kpi {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px 18px;
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s;
    position: relative;
}

.kpi:hover { border-color: var(--accent); background: var(--bg-hover); }
.kpi:active { transform: scale(0.98); }

.kpi-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-3);
    text-transform: uppercase;
    letter-spacing: 0.7px;
    margin-bottom: 8px;
}

.kpi-val {
    font-size: 26px;
    font-weight: 800;
    letter-spacing: -0.5px;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
}

.kpi-sub {
    font-size: 11px;
    color: var(--text-3);
    margin-top: 5px;
}

.kpi-hint {
    position: absolute;
    top: 10px;
    right: 12px;
    width: 16px; height: 16px;
    border-radius: 50%;
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    color: var(--text-3);
    font-weight: 700;
}

/* ── Info Panel (click-to-info) ── */
.info-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    z-index: 500;
    align-items: center;
    justify-content: center;
}

.info-overlay.open { display: flex; }

.info-box {
    background: #1a1f2e;
    border: 1px solid var(--border);
    border-radius: 10px;
    max-width: 520px;
    width: 92%;
    padding: 28px 28px 24px;
    position: relative;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
}

.info-box .close-btn {
    position: absolute;
    top: 12px; right: 14px;
    background: none;
    border: none;
    color: var(--text-3);
    font-size: 18px;
    cursor: pointer;
    width: 28px; height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: background 0.15s;
}

.info-box .close-btn:hover { background: rgba(255,255,255,0.06); color: var(--text); }

.info-box h3 {
    font-size: 15px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 12px;
    padding-right: 30px;
}

.info-box p {
    font-size: 13px;
    color: var(--text-2);
    line-height: 1.65;
    margin-bottom: 10px;
}

.info-box .info-tag {
    display: inline-block;
    font-size: 10px;
    font-weight: 700;
    color: var(--text-3);
    text-transform: uppercase;
    letter-spacing: 1px;
    background: rgba(255,255,255,0.04);
    padding: 3px 8px;
    border-radius: 4px;
    margin-top: 6px;
}

/* ── Panel / Card ── */
.panel {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 18px;
}

.panel-title {
    font-size: 12px;
    font-weight: 700;
    color: var(--text-3);
    text-transform: uppercase;
    letter-spacing: 0.7px;
    margin-bottom: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
}

.panel-title .i-btn {
    width: 14px; height: 14px;
    border-radius: 50%;
    border: 1px solid var(--border);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    color: var(--text-3);
    font-weight: 800;
    flex-shrink: 0;
}

/* ── Grids ── */
.g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.g3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }

/* ── Controls bar ── */
.ctrl {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin-bottom: 12px;
}

.ctrl input {
    flex: 1;
    min-width: 180px;
    padding: 8px 12px;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-size: 13px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.2s;
}

.ctrl input:focus { border-color: var(--accent); }
.ctrl input::placeholder { color: var(--text-3); }

.fbtn {
    background: rgba(255,255,255,0.02);
    border: 1px solid var(--border);
    color: var(--text-3);
    padding: 7px 12px;
    border-radius: var(--radius);
    font-size: 12px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
}

.fbtn:hover, .fbtn.on {
    background: var(--accent-dim);
    color: var(--accent);
    border-color: rgba(59, 130, 246, 0.3);
}

/* ── Tables ── */
.tbl-wrap {
    max-height: 520px;
    overflow: auto;
    border: 1px solid var(--border-light);
    border-radius: var(--radius);
}

.tbl-wrap::-webkit-scrollbar { width: 4px; height: 4px; }
.tbl-wrap::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

.tbl {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    white-space: nowrap;
}

.tbl th {
    position: sticky;
    top: 0;
    background: #111827;
    text-align: left;
    padding: 9px 12px;
    color: var(--text-3);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    font-weight: 700;
    border-bottom: 1px solid var(--border);
    z-index: 5;
    cursor: pointer;
    user-select: none;
}

.tbl th:hover { color: var(--accent); }
.tbl th .arr { margin-left: 3px; font-size: 10px; opacity: 0.35; }
.tbl th.sorted .arr { opacity: 1; color: var(--accent); }

.tbl td {
    padding: 8px 12px;
    border-bottom: 1px solid var(--border-light);
    vertical-align: middle;
}

.tbl tbody tr { transition: background 0.1s; }
.tbl tbody tr:hover td { background: var(--bg-hover); }

/* ── Inline bars ── */
.bar-i {
    display: flex;
    align-items: center;
    gap: 6px;
}

.bar-i-track {
    flex: 1;
    height: 4px;
    background: rgba(255,255,255,0.04);
    border-radius: 2px;
    overflow: hidden;
    min-width: 50px;
}

.bar-i-fill { height: 100%; border-radius: 2px; }

.bar-i-val {
    font-size: 12px;
    font-weight: 700;
    min-width: 45px;
    text-align: right;
    font-variant-numeric: tabular-nums;
}

/* ── Risk bar ── */
.risk-b {
    width: 100%;
    height: 5px;
    background: rgba(255,255,255,0.04);
    border-radius: 2px;
    overflow: hidden;
    margin-top: 3px;
}

.risk-b-fill { height: 100%; border-radius: 2px; }

/* ── Badges ── */
.b {
    display: inline-block;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 4px;
}

.b-r  { background: var(--red-dim);   color: var(--red); }
.b-g  { background: var(--green-dim); color: var(--green); }
.b-a  { background: var(--accent-dim);color: var(--accent); }
.b-y  { background: var(--amber-dim); color: var(--amber); }

.c-a  { color: var(--accent); }
.c-y  { color: var(--amber); }
.c-r  { color: var(--red); }
.c-g  { color: var(--green); }

/* ── Jurisdiction bars ── */
.jr {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 0;
    border-bottom: 1px solid var(--border-light);
}

.jr:last-child { border-bottom: none; }
.jr-f { font-size: 15px; flex-shrink: 0; width: 24px; text-align: center; }

.jr-i { flex: 1; min-width: 0; }

.jr-n {
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.jr-bar {
    height: 4px;
    background: rgba(255,255,255,0.04);
    border-radius: 2px;
    margin-top: 4px;
    overflow: hidden;
}

.jr-fill { height: 100%; border-radius: 2px; }

.jr-c {
    font-size: 12px;
    font-weight: 700;
    color: var(--text-2);
    flex-shrink: 0;
    min-width: 50px;
    text-align: right;
    font-variant-numeric: tabular-nums;
}

.jr-b {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 3px;
    flex-shrink: 0;
}

/* ── Gauge area ── */
.gauge-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px 0;
}

.gauge-big {
    font-size: 42px;
    font-weight: 800;
    letter-spacing: -1px;
    line-height: 1;
    font-variant-numeric: tabular-nums;
}

.gauge-lbl {
    font-size: 12px;
    color: var(--text-2);
    margin-top: 8px;
    text-align: center;
}

.gauge-desc {
    font-size: 12px;
    color: var(--text-3);
    text-align: center;
    margin-top: 8px;
    max-width: 280px;
    line-height: 1.5;
}

/* ── Stat counter animation ── */
.ctr { font-variant-numeric: tabular-nums; }

/* ── Footer ── */
.footer {
    text-align: center;
    color: var(--text-3);
    font-size: 11px;
    margin-top: 40px;
    padding: 16px 0 8px;
    border-top: 1px solid var(--border-light);
    line-height: 1.6;
}

/* ===================================================================
   RESPONSIVE
   =================================================================== */

@media (max-width: 1300px) {
    .kpi-row { grid-template-columns: repeat(3, 1fr); }
}

@media (max-width: 1024px) {
    .g3 { grid-template-columns: 1fr; }
    .g2 { grid-template-columns: 1fr; }
    .sidebar { width: 200px; }
    .main { margin-left: 200px; padding: 20px; }
}

@media (max-width: 768px) {
    .sidebar {
        transform: translateX(-100%);
        width: 260px;
    }
    .sidebar.open { transform: translateX(0); }
    .hamburger { display: flex; }
    .main { margin-left: 0; padding: 16px; padding-top: 60px; }
    .kpi-row { grid-template-columns: repeat(2, 1fr); }
    .header-bar { flex-direction: column; }
    .header-meta { text-align: left; }
    .tbl { font-size: 12px; }
    .tbl th, .tbl td { padding: 7px 8px; }
    .kpi-val { font-size: 22px; }
}

@media (max-width: 480px) {
    .kpi-row { grid-template-columns: 1fr; }
    .main { padding: 12px; padding-top: 56px; }
    .header-bar h1 { font-size: 17px; }
    .info-box { padding: 20px; }
}

@media print {
    .sidebar, .hamburger, .overlay, .kpi-hint, .i-btn { display: none !important; }
    .main { margin-left: 0; padding: 10px; }
    .section { opacity: 1 !important; transform: none !important; }
    .kpi:hover { border-color: var(--border); transform: none; }
}
</style>
</head>
<body>

<!-- Hamburger (mobile) -->
<button class="hamburger" id="menuBtn" aria-label="Menú" onclick="toggleSidebar()">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
</button>
<div class="overlay" id="overlay" onclick="toggleSidebar()"></div>

<!-- Info panel (modal) -->
<div class="info-overlay" id="infoOverlay" onclick="closeInfo(event)">
    <div class="info-box" onclick="event.stopPropagation()">
        <button class="close-btn" onclick="closeInfo()" aria-label="Cerrar">&times;</button>
        <h3 id="infoTitle"></h3>
        <p id="infoBody"></p>
        <span class="info-tag" id="infoTag"></span>
    </div>
</div>

<!-- Sidebar -->
<aside class="sidebar" id="sidebar">
    <div class="sidebar-head">
        <h2>Cookie-Mapper</h2>
        <small>Panel de Auditoría</small>
    </div>
    <nav>
        <a class="nav-link active" href="#s-kpis" data-s="s-kpis">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            Resumen General
        </a>
        <a class="nav-link" href="#s-risk" data-s="s-risk">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Riesgos RGPD
        </a>
        <a class="nav-link" href="#s-brokers" data-s="s-brokers">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
            Reventas de Datos
        </a>
        <a class="nav-link" href="#s-tcf" data-s="s-tcf">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            TCF v2.2
        </a>
        <a class="nav-link" href="#s-domains" data-s="s-domains">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
            Dominios
        </a>
        <a class="nav-link" href="#s-rtb" data-s="s-rtb">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
            Ecosistema RTB
        </a>
        <a class="nav-link" href="#s-vendors" data-s="s-vendors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
            Vendors y CMPs
        </a>
    </nav>
    <div class="sidebar-foot">
        v3.1 &middot; ${stats.totalWebsites} dominios
    </div>
</aside>

<!-- Main Content -->
<main class="main">

    <!-- Header -->
    <div class="header-bar">
        <div>
            <h1>Cookie-Mapper &mdash; Panel de Auditoría Forense</h1>
            <p class="sub">Resultados de la auditoría automatizada de ${stats.totalWebsites} sitios web. Se han analizado los consentimientos TCF v2.2, interceptado subastas RTB (Prebid.js) y mapeado las transferencias de identificadores entre terceros y cuartos proveedores (cookie syncing). Las transferencias fuera del EEE se clasifican conforme a los artículos 44 a 49 del RGPD.</p>
        </div>
        <div class="header-meta">
            <div class="ts">${ts}</div>
            <div class="live"><span class="dot-live"></span> Generado</div>
        </div>
    </div>

    <!-- § KPIs -->
    <section class="section" id="s-kpis">
        <div class="sec-title">Resumen General</div>
        <div class="kpi-row">
            <div class="kpi" onclick="showInfo('Dominios Auditados','N&uacute;mero de sitios web visitados por el crawler autom&aacute;tico (Playwright headless). Para cada dominio se ha navegado a la p&aacute;gina principal, aceptado el banner de cookies y decodificado la cadena TC String (euconsent-v2) para extraer los proveedores autorizados y los prop&oacute;sitos consentidos.','Fuente: targets.txt')">
                <span class="kpi-hint">i</span>
                <div class="kpi-label">Dominios Auditados</div>
                <div class="kpi-val c-a ctr" data-target="${stats.totalWebsites}">0</div>
                <div class="kpi-sub">Cobertura de la auditoría</div>
            </div>
            <div class="kpi" onclick="showInfo('Vendors Autorizados','Proveedores de datos (Data Processors) registrados en la Global Vendor List (GVL) del IAB que han sido autorizados por al menos un sitio web auditado. Un vendor es autorizado cuando su identificador num&eacute;rico aparece en el vector de bits vendorConsents del TC String decodificado.','Fuente: IAB GVL v3 &middot; TCF v2.2')">
                <span class="kpi-hint">i</span>
                <div class="kpi-label">Vendors Autorizados</div>
                <div class="kpi-val ctr" data-target="${stats.totalVendors}">0</div>
                <div class="kpi-sub">Proveedores IAB TCF registrados</div>
            </div>
            <div class="kpi" onclick="showInfo('Reventas Detectadas','Transferencias de identificadores de usuario (cookie syncing) detectadas entre dominios de terceros. Se interceptan mediante an&aacute;lisis de redirecciones HTTP 302/307 y cabeceras Referer cruzadas. Cada &ldquo;sync&rdquo; indica que un proveedor ha compartido un identificador de usuario con otro proveedor sin relaci&oacute;n directa con el sitio visitado.','M&eacute;todo: Interceptaci&oacute;n HTTP 302 + Referer cross-domain')">
                <span class="kpi-hint">i</span>
                <div class="kpi-label">Reventas Detectadas</div>
                <div class="kpi-val c-r ctr" data-target="${stats.totalSyncs}">0</div>
                <div class="kpi-sub">Cookie syncing interceptado</div>
            </div>
            <div class="kpi" onclick="showInfo('CPM Promedio','Coste Por Mil impresiones medio de todas las pujas interceptadas en subastas RTB (Real-Time Bidding) a trav&eacute;s de window.pbjs (Prebid.js). Este valor representa el precio que los anunciantes pagan por cada 1.000 impresiones publicitarias mostradas al usuario.','M&eacute;todo: Inyecci&oacute;n en window.pbjs.getBidResponses()')">
                <span class="kpi-hint">i</span>
                <div class="kpi-label">CPM Promedio</div>
                <div class="kpi-val c-y">${stats.avgCpm}<span style="font-size:13px;opacity:0.5;margin-left:3px;">&euro;</span></div>
                <div class="kpi-sub">~${stats.impressionCost} &euro; por impresi&oacute;n</div>
            </div>
            <div class="kpi" onclick="showInfo('Fugas Fuera de la UE','Porcentaje de reventas de datos cuyo destino corporativo se encuentra fuera del Espacio Econ&oacute;mico Europeo. Estas transferencias est&aacute;n sujetas a los art&iacute;culos 44 a 49 del RGPD y requieren garant&iacute;as adecuadas (cl&aacute;usulas contractuales tipo, decisiones de adecuaci&oacute;n, etc.). Un porcentaje alto sugiere una posible vulneraci&oacute;n sistem&aacute;tica del r&eacute;gimen de transferencias internacionales.','Referencia legal: RGPD Art. 44-49')">
                <span class="kpi-hint">i</span>
                <div class="kpi-label">Fugas Fuera de la UE</div>
                <div class="kpi-val c-r">${stats.nonEUPercentage}<span style="font-size:13px;opacity:0.5;margin-left:2px;">%</span></div>
                <div class="kpi-sub">${stats.totalNonEUSyncs.toLocaleString('es-ES')} transacciones Art. 44</div>
            </div>
            <div class="kpi" onclick="showInfo('Bidders &Uacute;nicos','N&uacute;mero de compradores &uacute;nicos (Demand-Side Platforms) detectados participando en subastas RTB en los sitios auditados. Cada bidder es una entidad que puja en tiempo real por espacio publicitario, y su identificaci&oacute;n permite trazar qu&eacute; corporaciones est&aacute;n comprando datos de los usuarios espa&ntilde;oles.','M&eacute;todo: Extracci&oacute;n de bidderCode en Prebid.js')">
                <span class="kpi-hint">i</span>
                <div class="kpi-label">Bidders &Uacute;nicos</div>
                <div class="kpi-val c-g ctr" data-target="${stats.totalBidders}">0</div>
                <div class="kpi-sub">Compradores en subastas RTB</div>
            </div>
        </div>
    </section>

    <!-- § Riesgos RGPD -->
    <section class="section" id="s-risk">
        <div class="sec-title">Centro de Riesgos RGPD <span class="sec-count">Art. 44-49</span></div>
        <div class="g3">
            <div class="panel" onclick="showInfo('Transferencias Fuera del EEE','Este indicador muestra el porcentaje de operaciones de cookie syncing cuyo destino corporativo se encuentra fuera del Espacio Econ&oacute;mico Europeo. Se calcula dividiendo las reventas hacia destinos no-EEE entre el total de reventas detectadas. El gauge utiliza una escala de tres zonas: verde (0-30%), &aacute;mbar (30-60%) y rojo (60-100%).','C&aacute;lculo: syncs_no_EEE / syncs_totales &times; 100')" style="cursor:pointer;">
                <div class="gauge-area">
                    <canvas id="gauge" width="200" height="120"></canvas>
                    <div class="gauge-big" style="color:${parseFloat(stats.nonEUPercentage) > 60 ? 'var(--red)' : parseFloat(stats.nonEUPercentage) > 30 ? 'var(--amber)' : 'var(--green)'};">${stats.nonEUPercentage}%</div>
                    <div class="gauge-lbl">Transferencias Fuera del EEE</div>
                </div>
            </div>
            <div class="panel" onclick="showInfo('&Iacute;ndice de Riesgo Legal','Puntuaci&oacute;n compuesta de 0 a 100 que combina dos factores: el porcentaje de transferencias fuera del EEE (peso 85%) y el logaritmo del volumen total de transferencias (peso 15%). Un &iacute;ndice superior a 70 indica riesgo cr&iacute;tico y probable vulneraci&oacute;n de los art&iacute;culos 44 a 49 del RGPD.','F&oacute;rmula: (% no-EEE &times; 0.85) + (log10(volumen)/5 &times; 15)')" style="cursor:pointer;">
                <div class="gauge-area">
                    <div class="gauge-big" style="font-size:56px;color:${stats.legalRiskIndex > 60 ? 'var(--red)' : stats.legalRiskIndex > 30 ? 'var(--amber)' : 'var(--green)'};">${stats.legalRiskIndex}</div>
                    <div class="gauge-lbl" style="font-weight:700;">Índice de Riesgo Legal</div>
                    <div class="gauge-desc">
                        ${stats.legalRiskIndex > 70 ? 'Riesgo Crítico — Probable vulneración de los Art. 44-49 RGPD.' :
                          stats.legalRiskIndex > 40 ? 'Riesgo Alto — Transferencias sin base jurídica verificable.' :
                          'Riesgo Bajo — Transferencias mayoritariamente intra-EEE.'}
                    </div>
                </div>
            </div>
            <div class="panel" onclick="showInfo('Destinos Geogr&aacute;ficos','Desglose de las transferencias de datos por pa&iacute;s de destino corporativo. Cada barra es proporcional al volumen m&aacute;ximo. Los destinos marcados como &ldquo;Art. 44&rdquo; se encuentran fuera del EEE y requieren garant&iacute;as adecuadas seg&uacute;n el RGPD. Los destinos &ldquo;EEE&rdquo; no requieren garant&iacute;as adicionales.','Fuente: Mapa de jurisdicciones corporativas')" style="cursor:pointer;overflow-y:auto;max-height:320px;">
                <div class="panel-title">Destinos Geográficos <span class="i-btn">i</span></div>
                ${jurisdictionList.map(j => {
                    const maxJ = jurisdictionList[0].count;
                    const pct  = Math.round((j.count / maxJ) * 100);
                    const col  = j.nonEU ? 'var(--red)' : 'var(--green)';
                    return `<div class="jr">
                        <span class="jr-f">${j.flag}</span>
                        <div class="jr-i">
                            <div class="jr-n">${j.country}</div>
                            <div class="jr-bar"><div class="jr-fill" style="width:${pct}%;background:${col};"></div></div>
                        </div>
                        <span class="jr-b ${j.nonEU ? 'b-r' : 'b-g'}">${j.nonEU ? 'Art. 44' : 'EEE'}</span>
                        <span class="jr-c">${j.count.toLocaleString('es-ES')}</span>
                    </div>`;
                }).join('')}
            </div>
        </div>
    </section>

    <!-- § Reventas -->
    <section class="section" id="s-brokers">
        <div class="sec-title">Reventas de Datos (Cookie Syncing) <span class="sec-count">${allBrokers.length} nodos</span></div>
        <div class="ctrl">
            <input type="text" id="brkSearch" oninput="applyFilter('tBrk',this.value)" placeholder="Buscar origen, destino o país...">
            <button class="fbtn on" onclick="setFlt('tBrk','all',this)">Todos</button>
            <button class="fbtn" onclick="setFlt('tBrk','noneu',this)">Fuera UE</button>
            <button class="fbtn" onclick="setFlt('tBrk','us',this)">EE.UU.</button>
            <button class="fbtn" onclick="setFlt('tBrk','eu',this)">UE</button>
        </div>
        <div class="panel" style="padding:0;">
            <div class="tbl-wrap">
                <table class="tbl" id="tBrk">
                    <thead><tr>
                        <th onclick="srt('tBrk',0)">Origen <span class="arr">&#8597;</span></th>
                        <th onclick="srt('tBrk',1)">Destino <span class="arr">&#8597;</span></th>
                        <th onclick="srt('tBrk',2)">Jurisdicción <span class="arr">&#8597;</span></th>
                        <th onclick="srt('tBrk',3)">Estado <span class="arr">&#8597;</span></th>
                        <th onclick="srt('tBrk',4)" style="min-width:170px;">Volumen <span class="arr">&#8597;</span></th>
                    </tr></thead>
                    <tbody>
                        ${allBrokers.map(b => {
                            const pct = Math.round((b.count / maxBrokerCount) * 100);
                            const col = b.jurisdiction.nonEU ? (b.jurisdiction.dpf ? 'var(--green)' : (b.jurisdiction.country.includes('China') || b.jurisdiction.country.includes('India') ? 'var(--red)' : 'var(--amber)')) : 'var(--green)';
                            return `<tr data-noneu="${b.jurisdiction.nonEU}" data-country="${b.jurisdiction.country}">
                            <td><strong class="c-a">${b.seller}</strong></td>
                            <td>${b.buyer}</td>
                            <td>${b.jurisdiction.flag} ${b.jurisdiction.country}</td>
                            <td>${getLegalBadge(b.jurisdiction)}</td>
                            <td><div class="bar-i"><div class="bar-i-track"><div class="bar-i-fill" style="width:${pct}%;background:${col};"></div></div><span class="bar-i-val" data-sort-value="${b.count}">${b.count.toLocaleString('es-ES')}</span></div></td>
                        </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </section>

    <!-- § TCF -->
    <section class="section" id="s-tcf">
        <div class="sec-title">Análisis de Propósitos TCF v2.2</div>
        <div class="g2">
            <div class="panel" onclick="showInfo('Prop&oacute;sitos Consentidos por Webs','Distribuci&oacute;n de los prop&oacute;sitos TCF v2.2 consentidos por los sitios web auditados. Cada prop&oacute;sito define una finalidad espec&iacute;fica del tratamiento de datos (publicidad personalizada, medici&oacute;n de rendimiento, etc.). El n&uacute;mero indica cu&aacute;ntos sitios web han otorgado consentimiento para cada finalidad.','Referencia: IAB TCF v2.2 Policies &sect; 2')" style="cursor:pointer;">
                <div class="panel-title">Propósitos Consentidos por Webs <span class="i-btn">i</span></div>
                <div style="height:280px;position:relative;"><canvas id="chPurp"></canvas></div>
            </div>
            <div class="panel" onclick="showInfo('Prop&oacute;sitos Declarados por Vendors','N&uacute;mero de vendors que declaran cada prop&oacute;sito en su registro de la Global Vendor List. Un valor alto indica que la mayor&iacute;a de proveedores solicitan acceso a esa finalidad de tratamiento, lo cual puede ser indicativo de una pr&aacute;ctica generalizada de over-consent en el ecosistema publicitario.','Fuente: IAB GVL v3 &middot; Campo &ldquo;purposes&rdquo;')" style="cursor:pointer;">
                <div class="panel-title">Propósitos Declarados por Vendors <span class="i-btn">i</span></div>
                <div style="height:280px;position:relative;"><canvas id="chVP"></canvas></div>
            </div>
        </div>
    </section>

    <!-- § Dominios -->
    <section class="section" id="s-domains">
        <div class="sec-title">Radiografía por Dominio <span class="sec-count">${allWebsites.length} sitios</span></div>
        <div class="ctrl">
            <input type="text" id="domSearch" oninput="applyFilter('tDom',this.value)" placeholder="Buscar dominio o CMP...">
        </div>
        <div class="panel" style="padding:0;">
            <div class="tbl-wrap" style="max-height:580px;">
                <table class="tbl" id="tDom">
                    <thead><tr>
                        <th onclick="srt('tDom',0)">Dominio <span class="arr">&#8597;</span></th>
                        <th onclick="srt('tDom',1)">CMP <span class="arr">&#8597;</span></th>
                        <th onclick="srt('tDom',2)">Vendors <span class="arr">&#8597;</span></th>
                        <th onclick="srt('tDom',3)">Bidders <span class="arr">&#8597;</span></th>
                        <th onclick="srt('tDom',4)" style="min-width:150px;">Riesgo <span class="arr">&#8597;</span></th>
                    </tr></thead>
                    <tbody>
                        ${allWebsites.map(w => {
                            const rc = w.riskScore > 70 ? 'var(--red)' : w.riskScore > 40 ? 'var(--amber)' : 'var(--green)';
                            return `<tr>
                            <td><strong class="c-a">${w.domain}</strong></td>
                            <td>${w.cmp}</td>
                            <td data-sort-value="${w.vendorCount}"><span class="b b-a">${w.vendorCount}</span></td>
                            <td data-sort-value="${w.bidCount}"><span class="b b-y">${w.bidCount}</span></td>
                            <td data-sort-value="${w.riskScore}">
                                <div style="display:flex;align-items:center;gap:6px;">
                                    <span style="font-weight:800;font-size:13px;color:${rc};min-width:24px;">${w.riskScore}</span>
                                    <div class="risk-b" style="flex:1;"><div class="risk-b-fill" style="width:${w.riskScore}%;background:${rc};"></div></div>
                                </div>
                            </td>
                        </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </section>

    <!-- § RTB -->
    <section class="section" id="s-rtb">
        <div class="sec-title">Ecosistema RTB <span class="sec-count">${allBidders.length} bidders</span></div>
        <div class="g2" style="margin-bottom:14px;">
            <div class="panel" onclick="showInfo('Top 10 Pujadores por Volumen','Los 10 compradores (Demand-Side Platforms) con mayor n&uacute;mero de pujas interceptadas en subastas de Real-Time Bidding. Un mayor volumen de pujas indica una presencia m&aacute;s agresiva en la compra de espacio publicitario en los sitios auditados.','M&eacute;todo: Conteo de relaciones RECEIVED_BID por bidder')" style="cursor:pointer;">
                <div class="panel-title">Top 10 Pujadores <span class="i-btn">i</span></div>
                <div style="height:280px;position:relative;"><canvas id="chBid"></canvas></div>
            </div>
            <div class="panel" onclick="showInfo('CPM M&aacute;ximo por Bidder','El Coste Por Mil m&aacute;ximo registrado para cada pujador. Valores altos indican que ese comprador est&aacute; dispuesto a pagar primas elevadas por determinados perfiles de usuario, lo cual puede sugerir la existencia de segmentos de audiencia de alto valor.','Unidad: Euros (&euro;) por cada 1.000 impresiones')" style="cursor:pointer;">
                <div class="panel-title">CPM Máximo por Bidder <span class="i-btn">i</span></div>
                <div style="display:flex;flex-direction:column;gap:4px;max-height:280px;overflow-y:auto;">
                    ${allBidders.slice(0, 15).map(b => {
                        const mx = parseFloat(b.maxCpm);
                        const gMax = Math.max(...allBidders.map(x => parseFloat(x.maxCpm)), 0.001);
                        const pct = Math.round((mx / gMax) * 100);
                        return `<div class="jr" style="border-color:var(--border-light);">
                            <div class="jr-i">
                                <div class="jr-n" style="font-size:12px;">${b.bidder}</div>
                                <div class="jr-bar"><div class="jr-fill" style="width:${pct}%;background:var(--amber);"></div></div>
                            </div>
                            <span class="jr-c c-y">${b.maxCpm} &euro;</span>
                        </div>`;
                    }).join('')}
                </div>
            </div>
        </div>
        <div class="ctrl">
            <input type="text" id="bidSearch" oninput="applyFilter('tBid',this.value)" placeholder="Buscar bidder o país...">
            <button class="fbtn on" onclick="setFlt('tBid','all',this)">Todos</button>
            <button class="fbtn" onclick="setFlt('tBid','noneu',this)">Fuera UE</button>
            <button class="fbtn" onclick="setFlt('tBid','eu',this)">UE</button>
        </div>
        <div class="panel" style="padding:0;">
            <div class="tbl-wrap">
                <table class="tbl" id="tBid">
                    <thead><tr>
                        <th onclick="srt('tBid',0)">Bidder <span class="arr">&#8597;</span></th>
                        <th onclick="srt('tBid',1)">Jurisdicción <span class="arr">&#8597;</span></th>
                        <th onclick="srt('tBid',2)">Pujas <span class="arr">&#8597;</span></th>
                        <th onclick="srt('tBid',3)">CPM Máx <span class="arr">&#8597;</span></th>
                        <th onclick="srt('tBid',4)">CPM Avg <span class="arr">&#8597;</span></th>
                        <th>Estado</th>
                    </tr></thead>
                    <tbody>
                        ${allBidders.map(b => `<tr data-noneu="${b.jurisdiction.nonEU}" data-country="${b.jurisdiction.country}">
                            <td><strong class="c-y">${b.bidder}</strong></td>
                            <td>${b.jurisdiction.flag} ${b.jurisdiction.country}</td>
                            <td data-sort-value="${b.totalBids}"><div class="bar-i"><div class="bar-i-track"><div class="bar-i-fill" style="width:${Math.round((b.totalBids / maxBidderBids) * 100)}%;background:var(--amber);"></div></div><span class="bar-i-val">${b.totalBids}</span></div></td>
                            <td><span class="b b-y">${b.maxCpm} &euro;</span></td>
                            <td>${b.avgCpm} &euro;</td>
                            <td>${getLegalBadge(b.jurisdiction)}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </section>

    <!-- § Vendors y CMPs -->
    <section class="section" id="s-vendors">
        <div class="sec-title">Vendors y Plataformas CMP</div>
        <div class="g2">
            <div class="panel" onclick="showInfo('Top 15 Vendors por Presencia','Los 15 proveedores de datos (vendors IAB TCF) que aparecen autorizados en mayor n&uacute;mero de sitios web auditados. Un vendor con alta presencia tiene acceso potencial a los datos de navegaci&oacute;n de millones de usuarios a trav&eacute;s de m&uacute;ltiples propiedades web.','Fuente: Relaciones AUTHORIZES_DATA_FLOW en grafo Neo4j')" style="cursor:pointer;">
                <div class="panel-title">Top 15 Vendors por Presencia <span class="i-btn">i</span></div>
                <div style="height:340px;position:relative;"><canvas id="chVen"></canvas></div>
            </div>
            <div class="panel" onclick="showInfo('Distribuci&oacute;n de CMPs','Plataformas de gesti&oacute;n de consentimiento (Consent Management Platforms) detectadas en los sitios auditados. La CMP es el software que muestra el banner de cookies y gestiona las preferencias del usuario. Su distribuci&oacute;n revela la concentraci&oacute;n del mercado de consentimiento en Espa&ntilde;a.','M&eacute;todo: Decodificaci&oacute;n del campo cmpId del TC String')" style="cursor:pointer;">
                <div class="panel-title">Distribución de CMPs <span class="i-btn">i</span></div>
                <div style="height:340px;position:relative;"><canvas id="chCmp"></canvas></div>
            </div>
        </div>
    </section>

    <footer class="footer">
        Cookie-Mapper &mdash; Trabajo de Fin de Grado &copy; ${new Date().getFullYear()}<br>
        Auditoría de consentimientos TCF v2.2, subastas RTB (Prebid.js) y transferencias internacionales (RGPD Art. 44-49).<br>
        <span style="color:var(--text-3);">Metodología: Crawler headless Playwright + TCF decoder (@iabtechlabtcf/core) + Neo4j graph + Network sniffer (HTTP 302 + Referer)</span>
    </footer>

</main>

<script>
/* ===================================================================
   Chart.js defaults
   =================================================================== */
Chart.defaults.color = '#64748b';
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.plugins.legend.labels.boxWidth = 10;

var palette = ['#3b82f6','#6366f1','#ef4444','#eab308','#22c55e','#f97316','#a78bfa','#f472b6','#14b8a6','#fb7185','#818cf8'];

/* ── Donut: Propósitos consentidos ── */
new Chart(document.getElementById('chPurp').getContext('2d'), {
    type: 'doughnut',
    data: { labels: ${pLabels}, datasets: [{ data: ${pData}, backgroundColor: palette, borderWidth: 0, hoverOffset: 5 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '60%',
        plugins: { legend: { position: 'bottom', labels: { padding: 6, font: { size: 10 } } } }
    }
});

/* ── Barras: Propósitos declarados por vendors ── */
new Chart(document.getElementById('chVP').getContext('2d'), {
    type: 'bar',
    data: { labels: ${vpLabels}, datasets: [{ data: ${vpData}, backgroundColor: 'rgba(99,102,241,0.4)', borderColor: 'rgba(99,102,241,0.7)', borderWidth: 1, borderRadius: 3, barThickness: 13 }] },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: { x: { grid: { color: 'rgba(255,255,255,0.03)' } }, y: { grid: { display: false }, ticks: { font: { size: 9 }, callback: function(v) { var l = this.getLabelForValue(v); return l.length > 30 ? l.substring(0, 28) + '...' : l; } } } }
    }
});

/* ── Barras: Top bidders ── */
new Chart(document.getElementById('chBid').getContext('2d'), {
    type: 'bar',
    data: { labels: ${tbLabels}, datasets: [{ data: ${tbData}, backgroundColor: 'rgba(234,179,8,0.35)', borderColor: 'rgba(234,179,8,0.7)', borderWidth: 1, borderRadius: 3, barThickness: 16 }] },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: { x: { grid: { color: 'rgba(255,255,255,0.03)' } }, y: { grid: { display: false }, ticks: { font: { size: 10 } } } }
    }
});

/* ── Barras: Top vendors ── */
new Chart(document.getElementById('chVen').getContext('2d'), {
    type: 'bar',
    data: { labels: ${tvLabels}, datasets: [{ data: ${tvData}, backgroundColor: 'rgba(59,130,246,0.35)', borderColor: 'rgba(59,130,246,0.7)', borderWidth: 1, borderRadius: 3, barThickness: 13 }] },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: { x: { grid: { color: 'rgba(255,255,255,0.03)' } }, y: { grid: { display: false }, ticks: { font: { size: 9 } } } }
    }
});

/* ── Donut: CMPs ── */
new Chart(document.getElementById('chCmp').getContext('2d'), {
    type: 'doughnut',
    data: { labels: ${cmLabels}, datasets: [{ data: ${cmData}, backgroundColor: palette.slice().reverse(), borderWidth: 0, hoverOffset: 5 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '55%',
        plugins: { legend: { position: 'bottom', labels: { padding: 6, font: { size: 10 } } } }
    }
});

/* ── Gauge (Canvas 2D) ── */
(function() {
    var c = document.getElementById('gauge');
    var ctx = c.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var w = c.width, h = c.height;
    c.width = w * dpr; c.height = h * dpr;
    c.style.width = w + 'px'; c.style.height = h + 'px';
    ctx.scale(dpr, dpr);

    var cx = w / 2, cy = h - 8, r = Math.min(cx, cy) - 12;
    var sa = Math.PI, ea = 2 * Math.PI;
    var pct = ${stats.nonEUPercentage} / 100;

    ctx.beginPath(); ctx.arc(cx, cy, r, sa, ea);
    ctx.lineWidth = 14; ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineCap = 'round'; ctx.stroke();

    var g = ctx.createLinearGradient(0, cy, w, cy);
    g.addColorStop(0, '#22c55e'); g.addColorStop(0.4, '#eab308'); g.addColorStop(0.7, '#f97316'); g.addColorStop(1, '#ef4444');
    ctx.beginPath(); ctx.arc(cx, cy, r, sa, sa + (ea - sa) * pct);
    ctx.lineWidth = 14; ctx.strokeStyle = g; ctx.lineCap = 'round'; ctx.stroke();

    var na = sa + (ea - sa) * pct;
    ctx.beginPath(); ctx.arc(cx + r * Math.cos(na), cy + r * Math.sin(na), 4, 0, 2 * Math.PI);
    ctx.fillStyle = '#fff'; ctx.fill();
})();

/* ===================================================================
   INTERACTIONS
   =================================================================== */

/* ── Scroll spy + section reveal ── */
var sections = document.querySelectorAll('.section');
var navLinks = document.querySelectorAll('.nav-link');

var obs = new IntersectionObserver(function(entries) {
    entries.forEach(function(e) {
        if (e.isIntersecting) {
            e.target.classList.add('visible');
            var id = e.target.id;
            navLinks.forEach(function(l) {
                l.classList.toggle('active', l.getAttribute('data-s') === id);
            });
        }
    });
}, { threshold: 0.12, rootMargin: '-40px 0px -35% 0px' });

sections.forEach(function(s) { obs.observe(s); });

/* ── Animated counters ── */
var cObs = new IntersectionObserver(function(entries) {
    entries.forEach(function(e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        var target = parseInt(el.getAttribute('data-target'), 10);
        if (isNaN(target)) return;
        var dur = 900, start = performance.now();
        function step(now) {
            var p = Math.min((now - start) / dur, 1);
            var v = 1 - Math.pow(1 - p, 3);
            el.textContent = Math.round(v * target).toLocaleString('es-ES');
            if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
        cObs.unobserve(el);
    });
}, { threshold: 0.5 });

document.querySelectorAll('.ctr').forEach(function(el) {
    if (el.getAttribute('data-target')) cObs.observe(el);
});

/* ── Info panel ── */
function showInfo(title, body, tag) {
    document.getElementById('infoTitle').innerHTML = title;
    document.getElementById('infoBody').innerHTML = body;
    document.getElementById('infoTag').textContent = tag || '';
    document.getElementById('infoOverlay').classList.add('open');
}

function closeInfo(ev) {
    if (ev && ev.target !== ev.currentTarget) return;
    document.getElementById('infoOverlay').classList.remove('open');
}

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeInfo();
});

/* ── Mobile sidebar ── */
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('overlay').classList.toggle('open');
}

/* Close sidebar on nav click (mobile) */
navLinks.forEach(function(l) {
    l.addEventListener('click', function() {
        if (window.innerWidth <= 768) {
            document.getElementById('sidebar').classList.remove('open');
            document.getElementById('overlay').classList.remove('open');
        }
    });
});

/* ── Table sorting ── */
var sortSt = {};

function srt(tid, ci) {
    var tbl = document.getElementById(tid);
    var tb = tbl.querySelector('tbody');
    var rows = Array.from(tb.querySelectorAll('tr'));
    var ths = tbl.querySelectorAll('th');
    var k = tid + '_' + ci;
    var dir = sortSt[k] === 'asc' ? 'desc' : 'asc';
    sortSt[k] = dir;

    ths.forEach(function(th, i) {
        th.classList.toggle('sorted', i === ci);
        var a = th.querySelector('.arr');
        if (a) a.innerHTML = i === ci ? (dir === 'asc' ? '&#8593;' : '&#8595;') : '&#8597;';
    });

    rows.sort(function(a, b) {
        var av = a.cells[ci].getAttribute('data-sort-value') || a.cells[ci].textContent.trim();
        var bv = b.cells[ci].getAttribute('data-sort-value') || b.cells[ci].textContent.trim();
        var an = parseFloat(av.replace(/[^0-9.,-]/g, '').replace(',', '.'));
        var bn = parseFloat(bv.replace(/[^0-9.,-]/g, '').replace(',', '.'));
        if (!isNaN(an) && !isNaN(bn)) return dir === 'asc' ? an - bn : bn - an;
        return dir === 'asc' ? av.localeCompare(bv, 'es') : bv.localeCompare(av, 'es');
    });

    rows.forEach(function(r) { tb.appendChild(r); });
}

/* ── Table filtering ── */
var fltSt = {};

function setFlt(tid, type, btn) {
    fltSt[tid] = type;
    var ctrl = btn.parentElement;
    ctrl.querySelectorAll('.fbtn').forEach(function(b) { b.classList.remove('on'); });
    btn.classList.add('on');
    var inp = ctrl.parentElement.querySelector('input');
    applyFilter(tid, inp ? inp.value : '');
}

function applyFilter(tid, query) {
    var tbl = document.getElementById(tid);
    if (!tbl) return;
    var rows = tbl.querySelectorAll('tbody tr');
    var flt = fltSt[tid] || 'all';
    var q = (query || '').toLowerCase().trim();

    rows.forEach(function(r) {
        var txt = r.textContent.toLowerCase();
        var ne = r.getAttribute('data-noneu') === 'true';
        var co = (r.getAttribute('data-country') || '').toLowerCase();
        var mq = !q || txt.indexOf(q) !== -1;
        var mf = true;
        if (flt === 'noneu') mf = ne;
        else if (flt === 'us') mf = co.indexOf('estados unidos') !== -1 || co.indexOf('ee.uu') !== -1;
        else if (flt === 'eu') mf = !ne;
        r.style.display = (mq && mf) ? '' : 'none';
    });
}
</script>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────
// Punto de entrada
// ─────────────────────────────────────────────────────────────────────────

async function main() {
    try {
        console.log('[DASHBOARD] Generando panel de auditoría...');

        if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        }

        const data = await fetchDashboardMetrics();
        const html = buildHtmlDashboard(data);
        fs.writeFileSync(OUTPUT_FILE, html, 'utf8');

        console.log('===================================================');
        console.log('[DASHBOARD] Panel generado correctamente:');
        console.log(`-> file:///${OUTPUT_FILE.replace(/\\\\/g, '/')}`);
        console.log('===================================================');

    } catch (err) {
        console.error('[DASHBOARD] Error:', err);
    } finally {
        await closeDriver();
    }
}

main();
