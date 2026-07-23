const { getDriver } = require('../db/neo4j-client');
const { TCString } = require('@iabtechlabtcf/core');

async function persistConsentGraph(targetUrl, tcStringPayload, gvl, networkIntelligence = null) {
    const driver = getDriver();
    const session = driver.session();

    try {
        const decodedModel = TCString.decode(tcStringPayload);
        
        let domain = targetUrl;
        try { domain = new URL(targetUrl).hostname.replace(/^www\./, ''); } catch {}

        const maxVendorId = decodedModel.vendorConsents.maxId || 3000;
        const vendorsData = [];
        const vendorPurposesData = [];
        const consentedPurposesData = [];
        
        for (let id = 1; id <= maxVendorId; id++) {
            if (decodedModel.vendorConsents.has(id)) {
                const vendor = gvl.vendors[id];
                vendorsData.push({ id, name: vendor?.name || 'Unknown Vendor' });
                
                vendor?.purposes?.forEach(pId => {
                    vendorPurposesData.push({
                        vendorId: id,
                        purposeId: pId,
                        purposeName: gvl.purposes[pId]?.name || `Purpose ${pId}`
                    });
                });
            }
        }

        for (let pId = 1; pId <= 24; pId++) {
            if (decodedModel.purposeConsents.has(pId)) {
                consentedPurposesData.push({ id: pId, name: gvl.purposes[pId]?.name || `Purpose ${pId}` });
            }
        }

        await session.executeWrite(async tx => {
            await tx.run(`
                MERGE (w:Website { domain: $domain })
                ON CREATE SET w.url = $url, w.firstScanned = timestamp(), w.lastScanned = timestamp()
                ON MATCH SET w.lastScanned = timestamp()
                
                MERGE (c:CMP { id: $cmpId })
                ON CREATE SET c.name = "CMP_ID_" + $cmpId
                
                MERGE (w)-[:USES_CMP]->(c)
            `, { domain, url: targetUrl, cmpId: decodedModel.cmpId });

            if (vendorsData.length) {
                await tx.run(`
                    MATCH (w:Website { domain: $domain })
                    UNWIND $vendors AS vData
                    MERGE (v:Vendor { iabId: vData.id })
                    ON CREATE SET v.name = vData.name
                    ON MATCH SET v.name = vData.name
                    MERGE (w)-[r:AUTHORIZES_DATA_FLOW]->(v)
                    ON CREATE SET r.timestamp = timestamp()
                `, { domain, vendors: vendorsData });
            }

            if (consentedPurposesData.length) {
                await tx.run(`
                    MATCH (w:Website { domain: $domain })
                    UNWIND $purposes AS pData
                    MERGE (p:Purpose { id: pData.id })
                    ON CREATE SET p.name = pData.name
                    ON MATCH SET p.name = pData.name
                    MERGE (w)-[:CONSENTS_TO_PURPOSE]->(p)
                `, { domain, purposes: consentedPurposesData });
            }

            if (vendorPurposesData.length) {
                await tx.run(`
                    UNWIND $vendorPurposes AS vpData
                    MATCH (v:Vendor { iabId: vpData.vendorId })
                    MERGE (p:Purpose { id: vpData.purposeId })
                    ON CREATE SET p.name = vpData.purposeName
                    ON MATCH SET p.name = vpData.purposeName
                    MERGE (v)-[:DECLARES_PURPOSE]->(p)
                `, { vendorPurposes: vendorPurposesData });
            }

            if (networkIntelligence?.rtbBids?.length) {
                const bidsData = networkIntelligence.rtbBids.map(bid => ({
                    bidder: bid.bidder, cpm: bid.cpm, currency: bid.currency
                }));

                await tx.run(`
                    MATCH (w:Website { domain: $domain })
                    UNWIND $bids AS bid
                    MERGE (b:Bidder { code: bid.bidder })
                    ON CREATE SET b.name = bid.bidder
                    MERGE (w)-[r:RECEIVED_BID]->(b)
                    ON CREATE SET r.cpm = bid.cpm, r.currency = bid.currency, r.timestamp = timestamp()
                    ON MATCH SET r.cpm = bid.cpm
                `, { domain, bids: bidsData });
            }

            if (networkIntelligence?.syncGraph?.length) {
                await tx.run(`
                    UNWIND $syncs AS sync
                    MERGE (b1:Bidder { code: sync.source })
                    ON CREATE SET b1.name = sync.source
                    MERGE (b2:Bidder { code: sync.target })
                    ON CREATE SET b2.name = sync.target
                    MERGE (b1)-[r:SHARES_DATA_WITH]->(b2)
                    ON CREATE SET r.timestamp = timestamp(), r.weight = 1
                    ON MATCH SET r.weight = r.weight + 1
                `, { syncs: networkIntelligence.syncGraph });
            }
        });
        
    } catch (err) {
        console.error(`[GraphBuilder] Topology persistence failed for ${targetUrl}:`, err.message);
    } finally {
        await session.close();
    }
}

module.exports = { persistConsentGraph };
