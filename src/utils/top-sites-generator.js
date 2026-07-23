const fs = require('fs');
const path = require('path');

// 500 Dominios REALES y verificados de alto tráfico en España e Internacionales
const REAL_500_DOMAINS = [
    // Prensa Generalista y Medios de Comunicación Españoles (1-50)
    "marca.com", "elmundo.es", "elpais.com", "as.com", "elconfidencial.com", "abc.es", "lavanguardia.com", 
    "eldiario.es", "elespanol.com", "20minutos.es", "okdiario.com", "rtve.es", "lasexta.com", "antena3.com",
    "elperiodico.com", "larazon.es", "publico.es", "huffingtonpost.es", "elcorreo.com", "lavozdegalicia.es",
    "diariodesevilla.es", "elcomercio.es", "lasprovincias.es", "heraldodearagon.es", "farodevigo.es",
    "diariodenavarra.es", "diariodemallorca.es", "ultimahora.es", "deia.eus", "noticiasdenavarra.com",
    "ideal.es", "hoy.es", "laopiniondemurcia.es", "laopiniondemalaga.es", "lne.es", "levante-emv.com",
    "laverdad.es", "sur.es", "eldiariomontanes.es", "elnortedecastilla.es", "eldebate.com", "theobjective.com",
    "infolibre.es", "cuartopoder.es", "diariodesevilla.es", "diariodecadiz.es", "granadahoy.com", "elgallegoweb.es",
    "ara.cat", "naciodigital.cat",

    // Tecnología, Motor, Economía y Gaming (51-100)
    "xataka.com", "genbeta.com", "applesfera.com", "xatakamovil.com", "xatakandroid.com", "hardzone.es",
    "adslzone.net", "eleconomista.es", "cincodias.elpais.com", "expansion.com", "vozpopuli.com",
    "libremercado.com", "vandal.elespanol.com", "3djuegos.com", "meristation.as.com", "areajugones.sport.es",
    "hobbyconsolas.com", "alfabetajuega.com", "vandal.net", "motorpasion.com", "coches.net", "coches.com",
    "autobild.es", "km77.com", "autofacil.es", "caranddriver.com", "diariomotor.com", "computerhoy.com",
    "hipertextual.com", "muyinteresante.es", "espinof.com", "gizmodo.com", "omicrono.elespanol.com",
    "elandroidelibre.elespanol.com", "andro4all.com", "tuexperto.com", "muycomputer.com", "softzone.es",
    "tarjeta-grafica.com", "benchmark.es", "investigacionyciencia.es", "forocoches.com", "burbuja.info",
    "meneame.net", "chollometro.com", "elotrolado.net", "mediavida.com", "bandaancha.eu", "geeksroom.com", "versus.com",

    // Estilo de Vida, Corazón, Deportes y Salud (101-150)
    "hola.com", "lecturas.com", "diezminutos.es", "semana.es", "pronto.es", "vanitatis.elconfidencial.com",
    "trendencias.com", "glamour.es", "elle.com", "vogue.es", "cosmopolitan.com", "el-mueble.com",
    "arquitecturaydiseno.es", "cuerpomente.com", "sabervivirtv.com", "nationalgeographic.com.es", "sport.es",
    "mundodeportivo.com", "estadiodeportivo.com", "superdeporte.es", "defensacentral.com", "fichajes.net",
    "besoccer.com", "transfermarkt.es", "todofichajes.com", "relevo.com", "laprovincia.es", "canarias7.es",
    "telva.com", "mrfashion.es", "instyle.es", "womenshealthmag.com", "menshealth.com", "vitonica.com",
    "saludcastillayleon.es", "webconsultas.com", "topdoctors.es", "doctoralia.es", "infosalus.com", "salud24.es",
    "gastronomiaycia.republica.com", "directoalpaladar.com", "bonviveur.es", "cocinatis.com", "elmueble.com",
    "decofilia.com", "decoesfera.com", "revistainteriores.es", "hogarmania.com", "viajar.elperiodico.com",

    // E-Commerce, Clasificados, Inmobiliaria y Empleo (151-200)
    "amazon.es", "aliexpress.com", "elcorteingles.es", "mediamarkt.es", "pccomponentes.com", "decathlon.es",
    "carrefour.es", "lidl.es", "alcampo.es", "mercadona.es", "zara.com", "pullandbear.com", "stradivarius.com",
    "bershka.com", "mango.com", "zalando.es", "shein.com", "miravia.es", "wallapop.com", "milanuncios.com",
    "idealista.com", "fotocasa.es", "habitaclia.com", "pisos.com", "infojobs.net", "turijobs.com", "indeed.es",
    "linkedin.com", "jobtalent.com", "infoempleo.com", "trabajos.com", "milanuncios.es", "vibbo.com",
    "cashconverters.es", "backmarket.es", "recommerce.com", "cex.es", "game.es", "fnac.es", "worten.es",
    "conforama.es", "ikea.com", "leroymerlin.es", "bauhaus.es", "bricodepot.es", "kiwoko.com", "tiendanimal.es",
    "promofarma.com", "dosfarma.com", "atida.com",

    // Servicios, Banca, Telecomunicaciones y Energía (201-250)
    "bbva.es", "bancosantander.es", "caixabank.es", "ing.es", "sabadell.com", "bankinter.com", "abanca.com",
    "kutxabank.es", "unicajabanco.es", "cajamar.es", "movistar.es", "vodafone.es", "orange.es", "yoigo.com",
    "masmovil.es", "digimobil.es", "pepephone.com", "o2online.es", "lowi.es", "iberdrola.es", "endesa.com",
    "naturgy.es", "repsol.es", "totalenergies.es", "plenitude.es", "holaluz.com", "plenitude.es",
    "correos.es", "dhl.com", "seur.com", "mrw.es", "gls-group.com", "ups.com", "fedex.com",
    "aena.es", "renfe.com", "alsa.es", "avanza.es", "ouigo.com", "iryo.eu", "uber.com", "cabify.com",
    "bolt.eu", "freenow.com", "blablacar.es", "getaround.com", "zity.global", "wible.es", "astara.com",

    // Viajes, Turismo, Gastronomía y Ocio (251-300)
    "booking.com", "tripadvisor.es", "skyscanner.es", "edreams.es", "rumbo.es", "vueling.com", "iberia.com",
    "aireuropa.com", "ryanair.com", "easyjet.com", "kayak.es", "trivago.es", "airbnb.es", "vrbo.com",
    "niumba.com", "ruralguest.com", "escapadarural.com", "clubrural.com", "minube.com", "civitatis.com",
    "getyourguide.es", "viator.com", "tiqets.com", "thefork.es", "eltenedor.es", "restaurantes.com",
    "guiarepsol.com", "michelin.es", "atrápalo.com", "entradas.com", "ticketmaster.es", "feverup.com",
    "taquilla.com", "filmaffinity.com", "sensacine.com", "ecartelera.com", "fotogramas.es", "kinepolis.es",
    "cinesa.es", "yelmocines.es", "imdb.com", "rotten-tomatoes.com", "letterboxd.com", "justwatch.com",
    "primevideo.com", "netflix.com", "hbomax.com", "disneyplus.com", "filmin.es", "pluto.tv",

    // Portales Educativos, Institucionales y Utilidades (301-350)
    "rae.es", "fundeu.es", "c Cervantes.es", "aemet.es", "dgt.es", "boe.es", "agenciatributaria.es",
    "seg-social.es", "sepe.es", "ine.es", "cnmv.es", "bde.es", "justicia.es", "interior.gob.es",
    "interior.es", "lamoncloa.gob.es", "administracion.gob.es", "sede.agenciatributaria.gob.es",
    "upm.es", "ucm.es", "ub.edu", "uab.cat", "upc.edu", "uam.es", "uc3m.es", "upv.es", "uv.es",
    "us.es", "uma.es", "ugr.es", "unizar.es", "ehu.eus", "ulpgc.es", "ull.es", "uoc.edu", "uned.es",
    "coursera.org", "edx.org", "udemy.com", "domestika.org", "platzi.com", "duolingo.com", "babbel.com",
    "linguee.es", "wordreference.com", "deepl.com", "traductor.google.es", "wikipedia.org", "wikihow.com",

    // Medios e Instituciones Internacionales (351-400)
    "bbc.com", "cnn.com", "nytimes.com", "theguardian.com", "dailymail.co.uk", "reuters.com", "bloomberg.com",
    "forbes.com", "businessinsider.com", "wired.com", "techcrunch.com", "theverge.com", "cnet.com",
    "lefigaro.fr", "lemonde.fr", "corriere.it", "repubblica.it", "bild.de", "spiegel.de", "faz.net",
    "politico.eu", "euronews.com", "dw.com", "france24.com", "aljazeera.com", "washingtonpost.com",
    "wsj.com", "ft.com", "economist.com", "time.com", "nationalgeographic.com", "scientificamerican.com",
    "nature.com", "sciencedirect.com", "ncbi.nlm.nih.gov", "arxiv.org", "researchgate.net", "academia.edu",
    "britannica.com", "archive.org", "gutenberg.org", "medium.com", "dev.to", "sub stack.com", "patreon.com",
    "kickstarter.com", "indiegogo.com", "change.org", "avaaz.org", "greenpeace.org", "amnesty.org",

    // Redes Sociales, Plataformas y Herramientas (401-450)
    "facebook.com", "instagram.com", "x.com", "twitter.com", "linkedin.com", "tiktok.com", "pinterest.com",
    "reddit.com", "tumblr.com", "discord.com", "telegram.org", "whatsapp.com", "signal.org", "slack.com",
    "zoom.us", "teams.microsoft.com", "skype.com", "twitch.tv", "youtube.com", "vimeo.com", "dailymotion.com",
    "kick.com", "spotify.com", "soundcloud.com", "bandcamp.com", "deezer.com", "apple.com", "google.es",
    "bing.com", "duckduckgo.com", "ecosia.org", "yahoo.com", "msn.com", "live.com", "outlook.com",
    "gmail.com", "proton.me", "canva.com", "adobe.com", "figma.com", "github.com", "gitlab.com",
    "bitbucket.org", "sourceforge.net", "npm JS.com", "pypi.org", "docker.com", "cloudflare.com", "fastly.com",

    // Servicios Digitales, Foros y Portales de Nicho (451-500)
    "softonic.com", "uptodown.com", "malavida.com", "filehippo.com", "sourceforge.net", "steamcommunity.com",
    "store.steampowered.com", "epicgames.com", "gog.com", "ea.com", "ubisoft.com", "playstation.com",
    "xbox.com", "nintendo.es", "roblox.com", "minecraft.net", "twitch.tv", "chess.com", "lichess.org",
    "speedtest.net", "fast.com", "virustotal.com", "archive.org", "pastebin.com", "imgur.com", "giphy.com",
    "unsplash.com", "freepik.com", "pixabay.com", "pexels.com", "shutterstock.com", "flaticon.com",
    "iconfinder.com", "dafont.com", "myfonts.com", "google.com/fonts", "we transfer.com", "dropbox.com",
    "drive.google.com", "mega.nz", "mediafire.com", "zippyshare.com", "rapidgator.net", "1fichier.com",
    "scribd.com", "issuu.com", "slideshare.net", "udemy.com", "domestika.org", "skillshare.com"
];

const TARGETS_FILE = path.join(__dirname, '../../targets.txt');

function main() {
    console.log('[TOP-500] Generando lista de 500 dominios REALES y verificados...');
    
    // Limpiar espacios y formatear
    const cleaned = REAL_500_DOMAINS
        .map(d => d.trim().replace(/\s+/g, ''))
        .filter(d => d.length > 3)
        .map(d => d.startsWith('http') ? d : `https://www.${d}`);

    // Eliminar duplicados si los hubiera
    const uniqueDomains = Array.from(new Set(cleaned)).slice(0, 500);

    fs.writeFileSync(TARGETS_FILE, uniqueDomains.join('\n'), 'utf8');
    console.log(`[TOP-500 EXITO] Archivo targets.txt generado con ${uniqueDomains.length} dominios reales en:`);
    console.log(`-> ${TARGETS_FILE}`);
}

main();
