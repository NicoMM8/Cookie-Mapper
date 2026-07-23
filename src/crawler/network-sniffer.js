class NetworkSniffer {
    constructor(page, targetUrl) {
        this.page = page;
        this.targetUrl = targetUrl;
        this.bids = [];
        this.syncRequests = 0;
        this.syncGraph = [];
        
        try {
            this.mainDomain = new URL(targetUrl).hostname.replace(/^www\./, '');
        } catch {
            this.mainDomain = targetUrl;
        }

        this._setupListeners();
    }

    _getRootDomain(hostname) {
        const parts = hostname.split('.');
        return parts.length > 2 ? parts.slice(-2).join('.') : hostname;
    }

    _processSyncEdge(sourceUrlStr, targetUrlStr) {
        try {
            const sourceUrl = new URL(sourceUrlStr);
            const targetUrl = new URL(targetUrlStr);
            
            if (sourceUrl.protocol !== 'https:') return;

            const sourceDomain = this._getRootDomain(sourceUrl.hostname);
            const targetDomain = this._getRootDomain(targetUrl.hostname);
            const mainRoot = this._getRootDomain(this.mainDomain);

            if (sourceDomain !== targetDomain && sourceDomain !== mainRoot && targetDomain !== mainRoot) {
                this.syncGraph.push({ source: sourceDomain, target: targetDomain });
            }
        } catch {
            // Ignore malformed URLs silently
        }
    }

    _setupListeners() {
        this.page.on('request', request => {
            const url = request.url().toLowerCase();
            if (/sync|match|uid=|usersync/.test(url)) {
                this.syncRequests++;
            }

            const headers = request.headers();
            if (!headers.referer) return;

            this._processSyncEdge(headers.referer, request.url());
        });

        this.page.on('response', response => {
            const status = response.status();
            if (status < 300 || status > 308) return;

            const headers = response.headers();
            if (!headers.location) return;

            try {
                const targetUrl = new URL(headers.location, response.url()).href;
                this._processSyncEdge(response.url(), targetUrl);
            } catch {
                // Invalid relative or absolute redirection
            }
        });
    }

    async extractBids() {
        try {
            await this.page.waitForTimeout(10000);
            
            const prebidData = await this.page.evaluate(() => {
                if (typeof window.pbjs === 'undefined' || typeof window.pbjs.getBidResponses !== 'function') {
                    return null;
                }

                const responses = window.pbjs.getBidResponses();
                return Object.values(responses).flatMap(adUnit => 
                    (adUnit.bids || []).map(bid => ({
                        bidder: bid.bidderCode || bid.bidder || 'Unknown',
                        cpm: parseFloat(bid.cpm) || 0.0,
                        currency: bid.currency || 'USD',
                        timeToRespondMs: bid.timeToRespond || 0
                    }))
                );
            });

            if (prebidData?.length) {
                this.bids = prebidData;
            }
            
            return this.bids;
        } catch (err) {
            console.error(`[NetworkSniffer] Prebid extraction failed: ${err.message}`);
            return [];
        }
    }

    getReport() {
        return {
            rtbBids: this.bids,
            syncRequestsDetected: this.syncRequests,
            syncGraph: this.syncGraph
        };
    }
}

module.exports = NetworkSniffer;
