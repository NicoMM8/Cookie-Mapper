/**
 * @fileoverview Interceptor forense de red.
 * Analiza el tráfico HTTP en busca de Cookie Syncing e inyecta sondas
 * en el contexto del navegador para extraer subastas de Prebid.js.
 */

class NetworkSniffer {
    /**
     * @param {import('playwright').Page} page - Instancia de la página de Playwright.
     */
    constructor(page) {
        this.page = page;
        this.bids = [];
        this.syncRequests = 0;
        this._setupListeners();
    }

    /**
     * Configura los listeners asíncronos para interceptar tráfico de red en tiempo real.
     * Busca heurísticas de sincronización cruzada de identificadores (User Matching).
     */
    _setupListeners() {
        this.page.on('request', request => {
            const url = request.url().toLowerCase();
            
            // Heurística básica: detecta endpoints típicos de Cookie Matching
            if (
                url.includes('sync') || 
                url.includes('match') || 
                url.includes('uid=') ||
                url.includes('usersync')
            ) {
                this.syncRequests++;
            }
        });
    }

    /**
     * Inyecta código en el motor V8 del navegador para acceder a las variables globales.
     * Busca la instancia global de Header Bidding (window.pbjs) para extraer las pujas.
     * 
     * @returns {Promise<Array>} Matriz de objetos con los datos económicos de la subasta.
     */
    async extractBids() {
        try {
            // Esperamos unos segundos para que los SSPs (Google, Criteo, etc.) tengan tiempo de pujar
            await this.page.waitForTimeout(3500);
            
            const prebidData = await this.page.evaluate(() => {
                // Comprobamos si la web utiliza la tecnología estándar Prebid.js
                if (typeof window.pbjs !== 'undefined' && typeof window.pbjs.getBidResponses === 'function') {
                    const responses = window.pbjs.getBidResponses();
                    const extractedBids = [];
                    
                    // pbjs agrupa las pujas por "AdUnit" (bloque de anuncio en la pantalla)
                    Object.keys(responses).forEach(adUnit => {
                        const bidsForUnit = responses[adUnit].bids || [];
                        bidsForUnit.forEach(bid => {
                            extractedBids.push({
                                bidder: bid.bidderCode || bid.bidder || 'Desconocido',
                                cpm: parseFloat(bid.cpm) || 0.0,
                                currency: bid.currency || 'USD',
                                timeToRespondMs: bid.timeToRespond || 0
                            });
                        });
                    });
                    
                    return extractedBids;
                }
                return null; // La web no usa Prebid o lo tiene ofuscado
            });

            if (prebidData && prebidData.length > 0) {
                this.bids = prebidData;
                console.log(`[SNIFFER] ¡Subasta interceptada! ${this.bids.length} pujas detectadas.`);
            }
            
            return this.bids;
        } catch (err) {
            console.error('[SNIFFER] Error inyectando la sonda de Prebid:', err.message);
            return [];
        }
    }

    /**
     * Devuelve el informe consolidado de la auditoría de red.
     */
    getReport() {
        return {
            rtbBids: this.bids,
            syncRequestsDetected: this.syncRequests
        };
    }
}

module.exports = NetworkSniffer;
