/**
 * @fileoverview Construye e inserta las entidades TCF en la base de datos de grafos Neo4j.
 * Convierte el modelo abstracto (TCModel) en sentencias Cypher de alto rendimiento.
 */

const { getDriver } = require('../db/neo4j-client');
const { TCString } = require('@iabtechlabtcf/core');

/**
 * Persiste los resultados de la auditoría en la base de datos Neo4j.
 * Utiliza operaciones MERGE para garantizar la idempotencia estructural y
 * sentencias UNWIND para procesar lotes masivos (Bulk Inserts) de forma eficiente.
 * 
 * @param {string} targetUrl URL auditada.
 * @param {string} tcStringPayload Carga útil euconsent-v2.
 * @param {GVL} gvl Instancia de la Global Vendor List.
 */
async function persistConsentGraph(targetUrl, tcStringPayload, gvl, networkIntelligence = null) {
    const driver = getDriver();
    const session = driver.session();

    try {
        const decodedModel = TCString.decode(tcStringPayload);
        
        let domain = 'desconocido.com';
        try {
            domain = new URL(targetUrl).hostname.replace('www.', '');
        } catch (e) {
            domain = targetUrl;
        }

        // --- PREPARACIÓN DE LOTES (BATCHING) PARA OPTIMIZAR INSERCIONES ---
        const maxVendorId = decodedModel.vendorConsents.maxId || 3000;
        const vendorsData = [];
        const vendorPurposesData = [];
        const consentedPurposesData = [];
        
        // 1. Mapear Proveedores Autorizados y sus Propósitos declarados
        for (let id = 1; id <= maxVendorId; id++) {
            if (decodedModel.vendorConsents.has(id)) {
                const vendor = gvl.vendors[id];
                vendorsData.push({
                    id: id,
                    name: vendor ? vendor.name : 'Proveedor Desconocido'
                });
                
                // Si el proveedor existe, mapeamos los propósitos que requiere para funcionar
                if (vendor && vendor.purposes) {
                    vendor.purposes.forEach(pId => {
                        vendorPurposesData.push({
                            vendorId: id,
                            purposeId: pId,
                            purposeName: gvl.purposes[pId] ? gvl.purposes[pId].name : `Propósito ${pId}`
                        });
                    });
                }
            }
        }

        // 2. Mapear los Propósitos globales que el usuario ha consentido al hacer clic en "Aceptar"
        for (let pId = 1; pId <= 24; pId++) { // TCF v2 define un máximo estándar de propósitos
            if (decodedModel.purposeConsents.has(pId)) {
                consentedPurposesData.push({
                    id: pId,
                    name: gvl.purposes[pId] ? gvl.purposes[pId].name : `Propósito ${pId}`
                });
            }
        }

        // --- INYECCIÓN EN NEO4J (TRANSACCIONES CYPHER OPTIMIZADAS) ---

        // A) Dominio y Plataforma CMP
        await session.run(`
            MERGE (w:Website { domain: $domain })
            ON CREATE SET w.url = $url, w.firstScanned = timestamp(), w.lastScanned = timestamp()
            ON MATCH SET w.lastScanned = timestamp()
            
            MERGE (c:CMP { id: $cmpId })
            ON CREATE SET c.name = "CMP_ID_" + $cmpId
            
            MERGE (w)-[:USES_CMP]->(c)
        `, { domain, url: targetUrl, cmpId: decodedModel.cmpId });

        // B) Proveedores (Bulk Insert)
        if (vendorsData.length > 0) {
            await session.run(`
                MATCH (w:Website { domain: $domain })
                UNWIND $vendors AS vData
                MERGE (v:Vendor { iabId: vData.id })
                ON CREATE SET v.name = vData.name
                ON MATCH SET v.name = vData.name
                MERGE (w)-[r:AUTHORIZES_DATA_FLOW]->(v)
                ON CREATE SET r.timestamp = timestamp()
            `, { domain, vendors: vendorsData });
        }

        // C) Propósitos consentidos por el usuario (Bulk Insert)
        if (consentedPurposesData.length > 0) {
            await session.run(`
                MATCH (w:Website { domain: $domain })
                UNWIND $purposes AS pData
                MERGE (p:Purpose { id: pData.id })
                ON CREATE SET p.name = pData.name
                ON MATCH SET p.name = pData.name
                MERGE (w)-[:CONSENTS_TO_PURPOSE]->(p)
            `, { domain, purposes: consentedPurposesData });
        }

        // D) Propósitos declarados por cada proveedor (Bulk Insert cruzado)
        if (vendorPurposesData.length > 0) {
            await session.run(`
                UNWIND $vendorPurposes AS vpData
                MATCH (v:Vendor { iabId: vpData.vendorId })
                MERGE (p:Purpose { id: vpData.purposeId })
                ON CREATE SET p.name = vpData.purposeName
                ON MATCH SET p.name = vpData.purposeName
                MERGE (v)-[:DECLARES_PURPOSE]->(p)
            `, { vendorPurposes: vendorPurposesData });
        }

        // E) Pujas Económicas RTB y Flujo de Capital (Prebid.js)
        if (networkIntelligence && networkIntelligence.rtbBids && networkIntelligence.rtbBids.length > 0) {
            const bidsData = networkIntelligence.rtbBids.map(bid => ({
                bidder: bid.bidder,
                cpm: bid.cpm,
                currency: bid.currency
            }));

            await session.run(`
                MATCH (w:Website { domain: $domain })
                UNWIND $bids AS bid
                MERGE (b:Bidder { code: bid.bidder })
                ON CREATE SET b.name = bid.bidder
                MERGE (w)-[r:RECEIVED_BID]->(b)
                ON CREATE SET r.cpm = bid.cpm, r.currency = bid.currency, r.timestamp = timestamp()
                ON MATCH SET r.cpm = bid.cpm // Actualizamos el último precio de cotización
            `, { domain, bids: bidsData });
            
            console.log(`[GRAPH] Inyectadas ${bidsData.length} pujas de mercado (RTB) para ${domain}.`);
        }

        // F) Mapeo de Reventas (Cookie Syncing - 4th Party)
        if (networkIntelligence && networkIntelligence.syncGraph && networkIntelligence.syncGraph.length > 0) {
            await session.run(`
                UNWIND $syncs AS sync
                // Asegurarnos de que existen ambos actores
                MERGE (b1:Bidder { code: sync.source })
                ON CREATE SET b1.name = sync.source
                MERGE (b2:Bidder { code: sync.target })
                ON CREATE SET b2.name = sync.target
                // Crear la ruta del dato
                MERGE (b1)-[r:SHARES_DATA_WITH]->(b2)
                ON CREATE SET r.timestamp = timestamp(), r.weight = 1
                ON MATCH SET r.weight = r.weight + 1
            `, { syncs: networkIntelligence.syncGraph });
            
            console.log(`[GRAPH] Inyectadas ${networkIntelligence.syncGraph.length} reventas de datos (Cookie Syncing) identificadas en ${domain}.`);
        }

        console.log(`[GRAPH] Topología enriquecida para ${domain}: ${vendorsData.length} Proveedores y ${consentedPurposesData.length} Propósitos globales mapeados.`);
        
    } catch (err) {
        console.error(`[GRAPH] Error persistiendo topología enriquecida para ${targetUrl}:`, err.message);
    } finally {
        await session.close();
    }
}

module.exports = { persistConsentGraph };
