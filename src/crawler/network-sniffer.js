/**
 * @fileoverview Interceptor forense de red.
 * Analiza el tráfico HTTP en busca de Cookie Syncing e inyecta sondas
 * en el contexto del navegador para extraer subastas de Prebid.js.
 */

class NetworkSniffer {
    /**
     * @param {import('playwright').Page} page - Instancia de la página de Playwright.
     * @param {string} targetUrl - URL principal que se está auditando.
     */
    constructor(page, targetUrl) {
        this.page = page;
        this.targetUrl = targetUrl;
        this.bids = [];
        this.syncRequests = 0;
        this.syncGraph = []; // Almacenará las relaciones de reventa: { source, target }
        
        try {
            this.mainDomain = new URL(targetUrl).hostname.replace('www.', '');
        } catch (e) {
            this.mainDomain = targetUrl;
        }

        this._setupListeners();
    }

    /**
     * Configura los listeners asíncronos para interceptar tráfico de red en tiempo real.
     * Busca heurísticas de sincronización cruzada de identificadores (User Matching).
     */
    _setupListeners() {
        const getRootDomain = (hostname) => {
            const parts = hostname.split('.');
            return parts.length > 2 ? parts.slice(-2).join('.') : hostname;
        };
        const mainRootDomain = getRootDomain(this.mainDomain);

        // 1. Intercepción por Referer Hijacking (Chivato)
        this.page.on('request', request => {
            const url = request.url().toLowerCase();
            if (url.includes('sync') || url.includes('match') || url.includes('uid=') || url.includes('usersync')) {
                this.syncRequests++;
            }

            // Análisis del Referer para descubrir quién originó esta petición (Data Broker -> Data Broker)
            const headers = request.headers();
            if (headers.referer) {
                try {
                    const sourceUrl = new URL(headers.referer);
                    const targetUrl = new URL(request.url());
                    
                    const sourceDomain = getRootDomain(sourceUrl.hostname);
                    const targetDomain = getRootDomain(targetUrl.hostname);

                    // Filtramos: 
                    // a) Que no sean la misma corporación
                    // b) Que el origen NO sea la web que visitamos (buscamos reventas de 3º a 4º party)
                    if (sourceDomain !== targetDomain && 
                        sourceDomain !== mainRootDomain && 
                        targetDomain !== mainRootDomain && 
                        sourceUrl.protocol === 'https:') {
                        
                        this.syncGraph.push({ source: sourceDomain, target: targetDomain });
                    }
                } catch (e) {}
            }
        });

        // 2. Interceptación de reventas (Cookie Syncing) mediante redirecciones 302
        this.page.on('response', response => {
            const status = response.status();
            // Los códigos 301, 302, 307 son redirecciones forzadas por el servidor
            if (status >= 300 && status <= 308) {
                const headers = response.headers();
                if (headers.location) {
                    try {
                        const sourceUrl = new URL(response.url());
                        const targetUrl = new URL(headers.location, sourceUrl.origin);

                        const sourceDomain = getRootDomain(sourceUrl.hostname);
                        const targetDomain = getRootDomain(targetUrl.hostname);

                        // Si la redirección cruza fronteras corporativas, es una reventa de datos clara
                        if (sourceDomain !== targetDomain && 
                            sourceDomain !== mainRootDomain && 
                            targetDomain !== mainRootDomain && 
                            sourceUrl.protocol === 'https:') {
                            this.syncGraph.push({ source: sourceDomain, target: targetDomain });
                        }
                    } catch (e) {
                        // Ignoramos rutas relativas o URLs malformadas en los headers
                    }
                }
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
            // AUMENTAMOS EL TIEMPO A 10 SEGUNDOS para atrapar la cascada completa de rastreadores
            await this.page.waitForTimeout(10000);
            
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
            syncRequestsDetected: this.syncRequests,
            syncGraph: this.syncGraph
        };
    }
}

module.exports = NetworkSniffer;
