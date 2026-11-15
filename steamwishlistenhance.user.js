// ==UserScript==
// @name        Steam愿望单增强
// @namespace   SteamWishlistEnhacne
// @description 仅适用于Steam愿望单：可切换中、美、印、印尼、乌、俄、独联体（阿塞拜疆）、阿、土、日查询价格与史低，汇总全清单价格并显示大促倒计时；中/美/印/印尼/日史低取自 ITAD，乌/俄/独联体/阿/土取自小黑盒（仅 app）
// @author      beerlee
// @license     GPL version 3 or any later version
// @version     1.1.0
// @include     *://store.steampowered.com/wishlist/*
// @grant       GM_xmlhttpRequest
// @grant       GM_setValue
// @grant       GM_getValue
// @grant       GM_addStyle
// @connect     api.augmentedsteam.com
// @connect     api.steampowered.com
// @connect     api.xiaoheihe.cn
// @connect     open.er-api.com
// @connect     store.steampowered.com
// @connect     steamdb.info
// @run-at      document-end
// ==/UserScript==
(function () {
    "use strict";
    if (document.documentElement.dataset.shcWishlistActive) return;
    document.documentElement.dataset.shcWishlistActive = "1";
    const COUNTRIES = {
        cn: { name: "🇨🇳 中国", currency: "CNY", lowSource: "augmented" },
        us: { name: "🇺🇸 美国", currency: "USD", lowSource: "augmented" },
        in: { name: "🇮🇳 印度", currency: "INR", lowSource: "augmented" },
        id: { name: "🇮🇩 印尼", currency: "IDR", lowSource: "augmented" },
        jp: { name: "🇯🇵 日本", currency: "JPY", lowSource: "augmented" },
        ua: { name: "🇺🇦 乌克兰", currency: "UAH", lowSource: "xiaoheihe" },
        ru: { name: "🇷🇺 俄罗斯", currency: "RUB", lowSource: "xiaoheihe" },
        az: { name: "🇦🇿 独联体", currency: "USD", lowSource: "xiaoheihe" },
        ar: { name: "🇦🇷 阿根廷", currency: "USD", lowSource: "xiaoheihe" },
        tr: { name: "🇹🇷 土耳其", currency: "USD", lowSource: "xiaoheihe" }
    };
    const COUNTRY_CODES = new Set(Object.keys(COUNTRIES).map(c => c.toUpperCase()));
    const CURRENCY_SYMBOLS = { CNY: "¥", INR: "₹", USD: "$", UAH: "₴", JPY: "¥", RUB: "₽", TRY: "₺", IDR: "Rp" };
    const CURRENCY_HINTS = [ [ /руб|₽/, "RUB" ], [ /^Rp/, "IDR" ], [ /₺/, "TRY" ], [ /₹/, "INR" ], [ /₴/, "UAH" ], [ /\$/, "USD" ] ];
    const ZERO_DECIMAL = new Set([ "JPY", "IDR" ]);
    const STORE_VERSION = "v4";
    const MIN_REQUEST_GAP = 1200;
    const CHUNK_SIZE = 50;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const debounce = (fn, ms) => {
        let timer = null;
        return () => {
            clearTimeout(timer);
            timer = setTimeout(fn, ms);
        };
    };
    const store = {
        read(key, ttl) {
            const hit = GM_getValue(key, null);
            if (!hit || hit.v !== STORE_VERSION) return null;
            const life = typeof ttl === "function" ? ttl(hit.value) : ttl;
            return life == null || Date.now() - hit.t < life ? hit.value : null;
        },
        write(key, value) {
            GM_setValue(key, { v: STORE_VERSION, t: Date.now(), value: value });
        }
    };
    function request(opts) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: opts.method || "GET",
                url: opts.url,
                headers: opts.headers || {},
                data: opts.data === undefined ? undefined : JSON.stringify(opts.data),
                timeout: opts.timeout || 2e4,
                onload: r => r.status >= 200 && r.status < 400 ? resolve(r.responseText) : reject(Object.assign(new Error(`HTTP ${r.status}`), { status: r.status })),
                onerror: () => reject(new Error("网络错误")),
                ontimeout: () => reject(new Error("请求超时"))
            });
        });
    }
    const getJSON = opts => request(opts).then(text => JSON.parse(text));
    const postJSON = (url, data, headers) => getJSON({
        method: "POST",
        url: url,
        data: data,
        headers: { "Content-Type": "application/json", ...headers }
    });
    const FX_URL = "https://open.er-api.com/v6/latest/USD";
    const FX_KEY = "steamHistoryFxRates";
    const FX_TTL = 24 * 60 * 60 * 1e3;
    let fxLive = store.read(FX_KEY, FX_TTL);
    let fxPending = null;
    let fxTried = false;
    function ensureRates() {
        if (fxLive) return Promise.resolve(fxLive);
        if (!fxPending) {
            fxPending = getJSON({
                url: FX_URL,
                headers: { Accept: "application/json" },
                timeout: 15e3
            }).then(d => {
                if (d.result !== "success" || !d.rates || !(d.rates.CNY > 0)) return null;
                fxLive = { usdTo: d.rates };
                store.write(FX_KEY, fxLive);
                return fxLive;
            }).catch(() => null).then(v => {
                fxPending = null;
                fxTried = true;
                return v;
            });
        }
        return fxPending;
    }
    function cnyPerUnit(currency) {
        if (currency === "CNY") return 1;
        if (!fxLive) return null;
        const perUsd = currency === "USD" ? 1 : fxLive.usdTo[currency];
        return perUsd > 0 ? fxLive.usdTo.CNY / perUsd : null;
    }
    const formatPrice = (amount, currency) => {
        if (amount == null || isNaN(amount)) return "?";
        return (CURRENCY_SYMBOLS[currency] || currency) + amount.toFixed(ZERO_DECIMAL.has(currency) ? 0 : 2);
    };
    const toBaseCNY = (amount, currency) => {
        if (amount == null || isNaN(amount)) return null;
        if (currency === "CNY") return amount;
        const rate = cnyPerUnit(currency);
        return rate ? amount * rate : null;
    };
    const formatCNY = v => "¥" + (v || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const hasAnyPrice = info => !!(info && (info.lowest && info.lowest.price || info.current && info.current.price));
    function isAtHistoricalLow(lowest, current) {
        const lp = lowest && lowest.price;
        const cp = current && current.price;
        if (!lp || !cp || lp.currency !== cp.currency) return false;
        return cp.amount <= lp.amount + (lowest.approx ? 1 : .01);
    }
    let currentCountry = GM_getValue("steamHistoryCountry", "cn");
    if (!COUNTRIES[currentCountry]) currentCountry = "cn";
    function isMobileUI() {
        const w = window.innerWidth || document.documentElement && document.documentElement.clientWidth || 0;
        const coarse = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
        return w > 0 && (w <= 720 || coarse && w <= 900);
    }
    function fetchPrices(chunk, country) {
        return postJSON(location.protocol + "//api.augmentedsteam.com/prices/v2", {
            country: country.toUpperCase(),
            apps: chunk.app,
            subs: chunk.sub,
            bundles: chunk.bundle,
            voucher: true,
            shops: [ 61 ]
        }).then(d => d.prices || {});
    }
    const STEAM_GETITEMS = "https://api.steampowered.com/IStoreBrowseService/GetItems/v1/";
    const STEAM_TYPES = [ "app", "sub", "bundle" ];
    function fetchSteamRegionPrices(chunk, country) {
        const ids = [
            ...chunk.app.map(appid => ({ appid })),
            ...chunk.sub.map(packageid => ({ packageid })),
            ...chunk.bundle.map(bundleid => ({ bundleid }))
        ];
        if (!ids.length) return Promise.resolve({});
        const input = {
            ids: ids,
            context: { language: "schinese", country_code: country.toUpperCase() },
            data_request: { include_basic_info: false, include_all_purchase_options: false }
        };
        return getJSON({
            url: STEAM_GETITEMS + "?input_json=" + encodeURIComponent(JSON.stringify(input)),
            headers: { Accept: "application/json" }
        }).then(d => {
            const out = {};
            ((d.response || {}).store_items || []).forEach(it => {
                const po = it.best_purchase_option;
                const type = STEAM_TYPES[it.item_type];
                if (!type) return;
                if (!po || po.final_price_in_cents == null) {
                    if (it.is_free) out[`${type}/${it.id}`] = { free: true, price: { amount: 0, currency: COUNTRIES[country].currency }, cut: 0 };
                    return;
                }
                const hint = CURRENCY_HINTS.find(h => h[0].test(po.formatted_final_price || ""));
                const unit = hint ? hint[1] : COUNTRIES[country].currency;
                const amount = Number(po.final_price_in_cents) / 100;
                const regular = po.original_price_in_cents != null ? Number(po.original_price_in_cents) / 100 : amount;
                out[`${type}/${it.id}`] = {
                    price: { amount: amount, currency: unit },
                    regular: { amount: regular, currency: unit },
                    cut: Number(po.discount_pct) > 0 ? Number(po.discount_pct) : 0
                };
            });
            return out;
        }).catch(() => null);
    }
    const XHH_HISTORY = "https://api.xiaoheihe.cn/game/get_game_prices/history/v2";
    const XHH_GAP = 200;
    const XHH_LOW_TTL = 24 * 60 * 60 * 1e3;
    function fetchXhhLowest(appid, country) {
        return getJSON({
            url: `${XHH_HISTORY}?appid=${appid}&cc=${country}`,
            headers: { Accept: "application/json" }
        }).then(d => {
            const r = d && d.status === "ok" ? d.result : null;
            const li = r && r.lowest_info;
            if (!li) return null;
            const currency = (r.lowest_info_v2 && r.lowest_info_v2.currency) || (r.prices && r.prices[0] && r.prices[0].currency);
            if (!CURRENCY_SYMBOLS[currency]) return null;
            const amount = Number(li.price);
            if (!(amount > 0)) return null;
            return {
                price: { amount: amount, currency: currency },
                cut: Number(li.discount) > 0 ? Number(li.discount) : 0,
                approx: ZERO_DECIMAL.has(currency) || currency === "UAH"
            };
        }).catch(() => null);
    }
    async function attachXhhLows(chunk, country, merged, gen) {
        for (const appid of chunk.app) {
            if (gen !== generation) return;
            const key = `app/${appid}`;
            if (!merged[key]) continue;
            const prev = prices[key];
            if (prev && prev.lowest && Date.now() - (prev.lowAt || 0) < XHH_LOW_TTL) {
                merged[key].lowest = prev.lowest;
                merged[key].lowAt = prev.lowAt;
                continue;
            }
            await sleep(XHH_GAP);
            const low = await fetchXhhLowest(appid, country);
            if (gen !== generation) return;
            if (low) {
                merged[key].lowest = low;
                merged[key].lowAt = Date.now();
            }
        }
    }
    function mergeRegionPrices(aug, steam) {
        if (!steam) return aug;
        Object.keys(aug).forEach(key => {
            if (!(key in steam)) {
                delete aug[key].current;
                delete aug[key].lowest;
            }
        });
        Object.keys(steam).forEach(key => {
            const entry = aug[key] || (aug[key] = {});
            entry.current = steam[key];
        });
        return aug;
    }
    function createCountryControl(onChange) {
        const wrap = document.createElement("span");
        wrap.className = "shc-cc";
        const btn = document.createElement("span");
        btn.className = "shc-cc-btn";
        const select = document.createElement("select");
        select.className = "shc-cc-native";
        select.title = "切换查询地区";
        select.setAttribute("aria-label", "切换查询地区");
        Object.keys(COUNTRIES).forEach(code => {
            const option = document.createElement("option");
            option.value = code;
            option.textContent = COUNTRIES[code].name;
            select.appendChild(option);
        });
        wrap.append(btn, select);
        const unmark = () => wrap.classList.remove("open");
        select.addEventListener("pointerdown", () => wrap.classList.add("open"));
        select.addEventListener("blur", unmark);
        const flagOf = code => (COUNTRIES[code].name.match(/^\S+/) || [ "" ])[0];
        const labelOf = code => COUNTRIES[code].name.replace(/^\S+\s*/, "");
        const paint = () => {
            btn.innerHTML = `<i class="flag">${flagOf(currentCountry)}</i><span class="name">${labelOf(currentCountry)}</span><i class="caret">▾</i>`;
            select.value = currentCountry;
        };
        select.addEventListener("change", () => {
            wrap.classList.remove("open");
            if (select.value === currentCountry) return;
            currentCountry = select.value;
            GM_setValue("steamHistoryCountry", currentCountry);
            paint();
            if (onChange) onChange(currentCountry);
        });
        paint();
        return wrap;
    }
    const ROW_SELECTOR = "div.Panel[data-index], .wishlist_row[data-appid]";
    const OWN_SELECTOR = "#shc-wishlist-summary, #wishlist-country-controls, #wishlist-progress, .game_lowest_price";
    const PRICE_KEY = "steamHistoryPrices";
    const PRICE_TTL = 30 * 60 * 1e3;
    const PRICE_KEEP = 24 * 60 * 60 * 1e3;
    const AUTO_QUEUE_LIMIT = 100;
    const wishlistIds = new Map;
    const pendingIds = new Map;
    const doneIds = new Set;
    const fetchedKeys = new Set;
    const observedRows = new WeakSet;
    const visibleRows = new Set;
    let priceBuckets = store.read(PRICE_KEY, null) || {};
    Object.keys(priceBuckets).forEach(code => {
        if (!COUNTRY_CODES.has(code)) delete priceBuckets[code];
    });
    let prices = {};
    let expectedCount = 0;
    let serverWishlistLoaded = false;
    let collecting = false;
    let draining = false;
    let generation = 0;
    let lastRequestAt = 0;
    let countryControls = null;
    let countdownEl = null;
    function loadPriceCache() {
        const bucket = priceBuckets[currentCountry.toUpperCase()] || {};
        const now = Date.now();
        prices = {};
        Object.keys(bucket).forEach(key => {
            const hit = bucket[key];
            if (!hit || now - hit.savedAt > PRICE_KEEP) return;
            prices[key] = hit;
            if (now - hit.savedAt < PRICE_TTL) doneIds.add(key);
        });
    }
    const savePriceCache = debounce(() => {
        const bucket = {};
        Object.keys(prices).forEach(key => {
            if (hasAnyPrice(prices[key])) bucket[key] = prices[key];
        });
        priceBuckets[currentCountry.toUpperCase()] = bucket;
        store.write(PRICE_KEY, priceBuckets);
    }, 500);
    function keyOfHref(href) {
        const m = String(href || "").match(/(app|sub|bundle)\/(\d+)/);
        return m ? { key: `${m[1]}/${m[2]}`, type: m[1], id: m[2] } : null;
    }
    const rowLink = row => row.querySelector('a[href*="store.steampowered.com"]') || row.querySelector("a[href]");
    const rowRef = row => {
        const link = rowLink(row);
        return link ? keyOfHref(link.href) : null;
    };
    function harvest(root) {
        root.querySelectorAll(ROW_SELECTOR).forEach(row => {
            const r = rowRef(row);
            if (r) wishlistIds.set(r.key, r);
        });
    }
    async function fetchWishlistItems() {
        try {
            const text = await request({
                url: location.protocol + `//store.steampowered.com/dynamicstore/userdata/?_=${Date.now()}`,
                headers: { "Cache-Control": "no-cache", Pragma: "no-cache" }
            });
            const raw = (JSON.parse(text) || {}).rgWishlist;
            if (!raw || typeof raw !== "object") return null;
            let values = raw;
            if (!Array.isArray(raw)) {
                const keys = Object.keys(raw);
                values = keys.length && keys.every(key => /^\d+$/.test(key) && Number(key) > 0) ? keys : Object.values(raw);
            }
            const ids = new Set;
            values.forEach(value => {
                if (value && typeof value === "object") value = value.appid ?? value.appID ?? value.id ?? value.value;
                const id = Number(value);
                if (Number.isSafeInteger(id) && id > 0) ids.add(String(id));
            });
            return [ ...ids ].map(id => ({ key: `app/${id}`, type: "app", id: id }));
        } catch {
            return null;
        }
    }
    const COUNT_NUMBER = "([\\d][\\d,.]*)";
    const COUNT_UNIT = "(?:个项目|個項目|项目|項目|个物品|個物品|個のアイテム|アイテム|items?\\b|games?\\b|apps?\\b|products?\\b|Artikel\\b|игр[\\p{L}]*)";
    const COUNT_PATTERNS = [ new RegExp(`\\bof\\s*${COUNT_NUMBER}\\s*${COUNT_UNIT}`, "i"), new RegExp(`${COUNT_NUMBER}\\s*${COUNT_UNIT}`, "iu"), new RegExp(`${COUNT_UNIT}\\s*[（(:：]?\\s*${COUNT_NUMBER}`, "iu"), new RegExp(`(?:wishlist|愿望单|願望單|愿望清单|願望清單|希望リスト)[^\\d]{0,24}${COUNT_NUMBER}`, "iu") ];
    const COUNT_IDENTITY_SKIP = /\b(filter|sort|sidebar|facet|category)\b/;
    const COUNT_WISHLIST_LABEL = /wishlist|愿望单|願望單|愿望清单|願望清單|希望リスト/i;
    const COUNT_TOTAL_LABEL = /\b(all|total)\b|全部|总计|總計|合计|合計/i;
    function readCountFromText(text) {
        const value = String(text || "").replace(/\s+/g, " ").trim();
        for (const re of COUNT_PATTERNS) {
            const m = value.match(re);
            if (m) return parseInt(m[1].replace(/[,.]/g, ""), 10);
        }
        return null;
    }
    let countAnchor = null;
    let countScanAt = 0;
    function scanCountNode() {
        const now = Date.now();
        if (countAnchor && countAnchor.isConnected && now - countScanAt < 3e3) return countAnchor;
        countScanAt = now;
        const scope = document.querySelector("#wishlist_index_content, .wishlist_content, #footer_search_results") || document.querySelector("#content") || document.body;
        const nodes = scope.querySelectorAll("*");
        let best = null, bestScore = -Infinity, bestCount = -1, bestLength = Infinity;
        for (let i = -1; i < nodes.length; i++) {
            const node = i < 0 ? scope : nodes[i];
            const text = String(node.textContent || "").replace(/\s+/g, " ").trim();
            if (!text || text.length > 160) continue;
            const count = readCountFromText(text);
            if (count == null || node.closest(OWN_SELECTOR)) continue;
            const identity = `${node.id || ""} ${typeof node.className === "string" ? node.className : ""}`.toLowerCase();
            if (COUNT_IDENTITY_SKIP.test(identity)) continue;
            const score = (COUNT_WISHLIST_LABEL.test(`${identity} ${text}`) ? 1e3 : 0) + (COUNT_TOTAL_LABEL.test(text) ? 100 : 0) + (node.children.length === 0 ? 10 : 0) - text.length / 1e3;
            if (score > bestScore || score === bestScore && count > bestCount || score === bestScore && count === bestCount && text.length < bestLength) {
                best = node;
                bestScore = score;
                bestCount = count;
                bestLength = text.length;
            }
        }
        return best;
    }
    function findCountNode() {
        if (countAnchor && countAnchor.isConnected && readCountFromText(countAnchor.textContent) != null) return countAnchor;
        countAnchor = scanCountNode();
        return countAnchor;
    }
    function readExpectedCount() {
        const anchor = findCountNode();
        return anchor ? readCountFromText(anchor.textContent) || 0 : 0;
    }
    function refreshExpected() {
        expectedCount = serverWishlistLoaded ? Math.max(expectedCount, wishlistIds.size) : Math.max(expectedCount, readExpectedCount(), wishlistIds.size);
    }
    let programmaticScroll = false;
    let lastUserScrollAt = 0;
    window.addEventListener("scroll", () => {
        if (!programmaticScroll) lastUserScrollAt = Date.now();
    }, { passive: true });
    async function harvestByScroll() {
        const mobile = isMobileUI();
        const scroller = document.scrollingElement || document.documentElement;
        const startPos = scroller.scrollTop;
        const deadline = Date.now() + (mobile ? 15e3 : 3e4);
        const maxStagnant = mobile ? 3 : 5;
        const loadWait = mobile ? 500 : 700;
        let size = wishlistIds.size, stagnant = 0;
        programmaticScroll = true;
        try {
            while (wishlistIds.size < expectedCount && Date.now() < deadline) {
                if (Date.now() - lastUserScrollAt < 1500) break;
                scroller.scrollTop = scroller.scrollHeight;
                await sleep(loadWait);
                harvest(document);
                observeRows();
                queuePrices();
                scroller.scrollTop = startPos;
                await sleep(120);
                if (wishlistIds.size === size) {
                    if (++stagnant >= maxStagnant) break;
                } else {
                    stagnant = 0;
                    size = wishlistIds.size;
                }
                updateCollectionProgress();
            }
        } finally {
            scroller.scrollTop = startPos;
            programmaticScroll = false;
        }
    }
    function queuePrices() {
        const capped = wishlistIds.size > AUTO_QUEUE_LIMIT;
        const visibleKeys = capped ? new Set : null;
        if (capped) visibleRows.forEach(row => {
            const r = rowRef(row);
            if (r) visibleKeys.add(r.key);
        });
        wishlistIds.forEach((item, key) => {
            if (doneIds.has(key) || pendingIds.has(key)) return;
            if (visibleKeys && !visibleKeys.has(key)) return;
            pendingIds.set(key, item);
        });
        drainPrices();
    }
    function takeChunk() {
        const chunk = { app: [], sub: [], bundle: [] };
        let n = 0;
        const take = key => {
            if (n >= CHUNK_SIZE) return;
            const item = pendingIds.get(key);
            if (!item) return;
            pendingIds.delete(key);
            doneIds.add(key);
            chunk[item.type].push(Number(item.id));
            n++;
        };
        visibleRows.forEach(row => {
            const r = rowRef(row);
            if (r) take(r.key);
        });
        for (const key of pendingIds.keys()) {
            if (n >= CHUNK_SIZE) break;
            take(key);
        }
        return chunk;
    }
    async function drainPrices() {
        if (draining) return;
        draining = true;
        try {
            while (pendingIds.size) {
                const wait = MIN_REQUEST_GAP - (Date.now() - lastRequestAt);
                if (wait > 0) await sleep(wait);
                const chunk = takeChunk();
                const country = currentCountry;
                const gen = generation;
                lastRequestAt = Date.now();
                const source = COUNTRIES[country].lowSource;
                const useAug = source === "augmented";
                const [ aug, steam ] = await Promise.all([ useAug ? fetchPrices(chunk, country).catch(() => ({})) : Promise.resolve({}), fetchSteamRegionPrices(chunk, country) ]);
                if (gen !== generation) continue;
                mergeRegionPrices(aug, steam);
                if (source === "xiaoheihe") await attachXhhLows(chunk, country, aug, gen);
                if (gen !== generation) continue;
                [ "app", "sub", "bundle" ].forEach(type => chunk[type].forEach(id => fetchedKeys.add(`${type}/${id}`)));
                const now = Date.now();
                Object.keys(aug).forEach(key => {
                    aug[key].savedAt = now;
                });
                Object.assign(prices, aug);
                savePriceCache();
                paintVisibleRows();
                scheduleSummary();
            }
        } finally {
            draining = false;
            updateCollectionProgress();
        }
    }
    function summarize() {
        let counted = 0, noLow = 0, atLow = 0, onSale = 0, missing = 0;
        let lowSum = 0, curSum = 0, saveSum = 0;
        const currencies = new Set;
        const lowNative = {}, curNative = {};
        wishlistIds.forEach((item, key) => {
            const info = prices[key];
            if (info && info.current && info.current.free && !info.lowest) return;
            const lp = info && info.lowest && info.lowest.price;
            const cp = info && info.current && info.current.price;
            if (cp && cp.currency) currencies.add(cp.currency);
            const lowCNY = lp ? toBaseCNY(lp.amount, lp.currency) : null;
            const curCNY = cp ? toBaseCNY(cp.amount, cp.currency) : null;
            if (lowCNY == null && curCNY == null) {
                if (fxLive && fetchedKeys.has(key)) missing++;
                return;
            }
            counted++;
            if (lowCNY != null) {
                lowSum += lowCNY;
                lowNative[lp.currency] = (lowNative[lp.currency] || 0) + lp.amount;
            } else noLow++;
            if (curCNY != null) {
                curSum += curCNY;
                curNative[cp.currency] = (curNative[cp.currency] || 0) + cp.amount;
                if (lowCNY != null) {
                    if (isAtHistoricalLow(info.lowest, info.current)) atLow++;
                    saveSum += Math.max(0, curCNY - lowCNY);
                }
            } else {
                curSum += lowCNY;
                curNative[lp.currency] = (curNative[lp.currency] || 0) + lp.amount;
            }
            if (info.current && info.current.cut > 0) onSale++;
        });
        return {
            total: wishlistIds.size,
            counted: counted,
            noLow: noLow,
            missing: missing,
            ratesMissing: !fxLive && fxTried,
            atLow: atLow,
            onSale: onSale,
            lowSum: lowSum,
            curSum: curSum,
            save: saveSum,
            currencies: [ ...currencies ],
            lowNative: lowNative,
            curNative: curNative
        };
    }
    function rowsHost() {
        const firstRow = document.querySelector(ROW_SELECTOR);
        const host = firstRow && firstRow.parentElement;
        return host && !host.matches(ROW_SELECTOR) ? host : null;
    }
    function outermostFlexLine(anchor) {
        let node = anchor;
        for (let i = 0; i < 5; i++) {
            const parent = node.parentElement;
            if (!parent) break;
            const d = getComputedStyle(parent).display;
            if (d !== "flex" && d !== "inline-flex") break;
            node = parent;
        }
        return node;
    }
    function scrollHostOf(node) {
        let el = node;
        while (el && el !== document.body && el !== document.documentElement) {
            const s = getComputedStyle(el);
            if (/(auto|scroll|overlay)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1) return el;
            el = el.parentElement;
        }
        return null;
    }
    function insertSummary(box, host) {
        const scroller = scrollHostOf(host || document.querySelector(ROW_SELECTOR));
        if (!scroller || scroller === document.body || scroller === document.documentElement) return false;
        if (box.parentElement !== scroller || scroller.firstElementChild !== box) scroller.insertBefore(box, scroller.firstChild);
        return true;
    }
    function getSummaryBox() {
        const host = rowsHost();
        let box = document.getElementById("shc-wishlist-summary");
        if (box && !box.isConnected) box = null;
        document.querySelectorAll("#shc-wishlist-summary").forEach(b => {
            if (b !== box) b.remove();
        });
        if (!box) {
            box = document.createElement("div");
            box.id = "shc-wishlist-summary";
            box.className = "shc-summary";
            box.style.visibility = "hidden";
            if (!insertSummary(box, host)) {
                const anchor = findCountNode();
                if (!anchor) return null;
                const line = outermostFlexLine(anchor);
                if (!line.parentElement) return null;
                line.parentElement.insertBefore(box, line.nextSibling);
            }
        } else insertSummary(box, host);
        barNode = box;
        return box;
    }
    const scheduleSummary = debounce(renderSummary, 200);
    let barNode = null;
    function revealBar(box) {
        box.dataset.ready = "1";
        box.style.visibility = "";
    }
    function placeControls(box) {
        if (countryControls && countryControls.parentNode !== box) box.appendChild(countryControls);
    }
    function summaryBody(box) {
        let body = box.querySelector(":scope > .shc-summary-body");
        if (!body) {
            body = document.createElement("span");
            body.className = "shc-summary-body";
            box.insertBefore(body, box.firstChild);
        }
        return body;
    }
    let pendingWrite = null;
    function writeIfChanged(el, html) {
        if (el.innerHTML === html) return;
        const sel = document.getSelection();
        if (sel && !sel.isCollapsed && sel.rangeCount && (el.contains(sel.anchorNode) || el.contains(sel.focusNode))) {
            clearTimeout(pendingWrite);
            pendingWrite = setTimeout(() => writeIfChanged(el, html), 800);
            return;
        }
        el.innerHTML = html;
    }
    let barSurface = "";
    function syncBarSurface(box) {
        const row = document.querySelector(ROW_SELECTOR);
        const cs = row && getComputedStyle(row);
        const color = cs ? cs.backgroundColor : "";
        const image = cs && cs.backgroundImage !== "none" ? cs.backgroundImage : "";
        const solid = color && color !== "transparent" && !/^rgba\([^)]*,\s*0\s*\)$/.test(color);
        if (!solid && !image) {
            if (barSurface === "fallback") return;
            barSurface = "fallback";
            box.style.backgroundColor = "";
            box.style.backgroundImage = "";
            return;
        }
        const key = `${color}|${image}`;
        if (key === barSurface) return;
        barSurface = key;
        box.style.backgroundColor = solid ? color : "";
        box.style.backgroundImage = image;
    }
    const SALE_URL = "https://steamdb.info/sales/history/";
    const SALE_KEY = "steamHistorySales";
    const SALE_TTL = 6 * 60 * 60 * 1e3;
    const SALE_FAIL_TTL = 60 * 60 * 1e3;
    const FALLBACK_SALES = [
        { name: "Winter Sale 2026", start: "2026-12-17", end: "2027-01-04" },
        { name: "Spring Sale 2027", start: "2027-03-18", end: "2027-03-25" },
        { name: "Summer Sale 2027", start: "2027-06-24", end: "2027-07-08" }
    ];
    const SEASON_ZH = { winter: "❄ 冬季特卖", spring: "🌱 春季特卖", summer: "☀ 夏季特卖", autumn: "🍂 秋季特卖", fall: "🍂 秋季特卖" };
    const MONTH_NUM = {
        january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
        july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
    };
    const MONTH_NAMES = /(January|February|March|April|May|June|July|August|September|October|November|December)/i;
    function seasonalOf(title) {
        const m = String(title || "").match(/\b(winter|spring|summer|autumn|fall) sale\b/i);
        return m ? SEASON_ZH[m[1].toLowerCase()] : "";
    }
    function pacificSaleMs(year, month, day) {
        return Date.UTC(year, month - 1, day, month >= 3 && month <= 10 ? 17 : 18);
    }
    function isoDateMs(text) {
        const m = String(text || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
        return m ? pacificSaleMs(+m[1], +m[2], +m[3]) : 0;
    }
    function rangePairs(text) {
        const s = String(text || "").trim();
        let m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s*[—–-]\s*(\d{1,2})\s+([A-Za-z]+)/);
        if (m) return [ [ +m[1], m[2] ], [ +m[3], m[4] ] ];
        m = s.match(/^(\d{1,2})\s*[—–-]\s*(\d{1,2})\s+([A-Za-z]+)/);
        return m ? [ [ +m[1], m[3] ], [ +m[2], m[3] ] ] : null;
    }
    function rangeToMs(text, now) {
        const pairs = rangePairs(text);
        if (!pairs) return null;
        const startMonth = MONTH_NUM[pairs[0][1].toLowerCase()];
        const endMonth = MONTH_NUM[pairs[1][1].toLowerCase()];
        if (!startMonth || !endMonth) return null;
        let year = new Date(now).getUTCFullYear();
        if (pacificSaleMs(year, endMonth, pairs[1][0]) <= now) year++;
        const startYear = startMonth > endMonth ? year - 1 : year;
        return {
            start: pacificSaleMs(startYear, startMonth, pairs[0][0]),
            end: pacificSaleMs(year, endMonth, pairs[1][0])
        };
    }
    function dateRangeText(panel) {
        for (const div of panel.querySelectorAll(".panel-body div")) {
            const text = (div.textContent || "").trim();
            if (/^\d{1,2}(\s+[A-Za-z]+)?\s*[—–-]/.test(text) && MONTH_NAMES.test(text)) return text;
        }
        return "";
    }
    function salesFromSteamDb(html) {
        const now = Date.now();
        const out = [];
        let doc;
        try {
            doc = (new DOMParser).parseFromString(html || "", "text/html");
        } catch {
            return out;
        }
        doc.querySelectorAll(".panel-sale").forEach(panel => {
            const link = panel.querySelector(".panel-sale-name a");
            const label = seasonalOf(link ? link.textContent : "");
            if (!label) return;
            const rel = panel.querySelector("relative-time[datetime], .future-sale-time[datetime]");
            if (!rel && !panel.querySelector(".live-sale-badge")) return;
            const range = rangeToMs(dateRangeText(panel), now);
            if (!range || range.end <= now) return;
            const titleYear = Number(((link.textContent || "").match(/\d{4}/) || [])[0]);
            if (titleYear && new Date(range.start).getUTCFullYear() !== titleYear) return;
            const attr = rel ? (rel.getAttribute("datetime") || "").trim() : "";
            const exact = /\d{2}:\d{2}/.test(attr) ? Date.parse(attr) : NaN;
            out.push({
                label: label,
                startMs: isNaN(exact) ? range.start : exact,
                endMs: range.end
            });
        });
        return out;
    }
    function fallbackSales() {
        const now = Date.now();
        return FALLBACK_SALES.map(s => ({
            label: seasonalOf(s.name),
            startMs: isoDateMs(s.start),
            endMs: isoDateMs(s.end)
        })).filter(s => s.label && s.endMs > now);
    }
    function cachedSales() {
        const hit = store.read(SALE_KEY, v => v && v.ok ? SALE_TTL : SALE_FAIL_TTL);
        return hit && Array.isArray(hit.sales) ? hit.sales.filter(s => s.endMs > Date.now()) : [];
    }
    function loadSales() {
        const cached = cachedSales();
        if (cached.length) return Promise.resolve(cached);
        const finish = (sales, ok) => {
            if (!sales.length) {
                sales = fallbackSales();
                ok = false;
            }
            store.write(SALE_KEY, { sales: sales, ok: ok });
            return sales;
        };
        return request({ url: SALE_URL }).then(html => finish(salesFromSteamDb(html), true)).catch(() => finish([], false));
    }
    function pickSale(sales) {
        const now = Date.now();
        const live = sales.filter(s => s.startMs <= now && s.endMs > now).sort((a, b) => b.startMs - a.startMs);
        const next = sales.filter(s => s.startMs > now).sort((a, b) => a.startMs - b.startMs);
        return live[0] || next[0] || null;
    }
    let currentSale = null;
    let saleTimer = null;
    let cdNodes = null;
    let cdSignature = "";
    function cnDate(ms) {
        const d = new Date(ms);
        return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
    }
    function writeText(node, value) {
        if (node && node.nodeValue !== value) node.nodeValue = value;
    }
    const saleIsLive = (sale, now) => sale.startMs <= now && sale.endMs > now;
    function buildCountdown(sale, now) {
        countdownEl.textContent = "";
        const add = (cls, text) => {
            const span = document.createElement("span");
            span.className = cls;
            span.textContent = text;
            countdownEl.appendChild(span);
            return span.firstChild;
        };
        const num = () => {
            const b = document.createElement("b");
            b.className = "shc-cd-num";
            countdownEl.appendChild(b);
            return b.appendChild(document.createTextNode(""));
        };
        cdSignature = `${sale.label}|${sale.startMs}|${sale.endMs}`;
        add("shc-cd-name", `${sale.label} `);
        add("shc-cd-date", `${cnDate(sale.startMs)} — ${cnDate(sale.endMs)} `);
        cdNodes = { state: add("shc-cd-state", saleIsLive(sale, now) ? "距结束" : "距开始") };
        countdownEl.appendChild(document.createTextNode(" "));
        cdNodes.days = num();
        add("shc-cd-unit", " 天 ");
        cdNodes.hours = num();
        add("shc-cd-unit", " 时 ");
        cdNodes.mins = num();
        add("shc-cd-unit", " 分");
    }
    function paintCountdown() {
        if (!countdownEl) return;
        const now = Date.now();
        const sale = currentSale;
        if (!sale || sale.endMs <= now) {
            if (countdownEl.style.display !== "none") countdownEl.style.display = "none";
            return;
        }
        if (cdSignature !== `${sale.label}|${sale.startMs}|${sale.endMs}`) buildCountdown(sale, now);
        const live = saleIsLive(sale, now);
        const left = Math.floor(((live ? sale.endMs : sale.startMs) - now) / 6e4);
        writeText(cdNodes.state, live ? "距结束" : "距开始");
        writeText(cdNodes.days, String(Math.floor(left / 1440)));
        writeText(cdNodes.hours, String(Math.floor(left % 1440 / 60)));
        writeText(cdNodes.mins, String(left % 60));
        const title = `${sale.label} 太平洋时间 ${cnDate(sale.startMs)} 开幕 — ${cnDate(sale.endMs)} 收摊` + `｜北京 ${new Date(sale.startMs).toLocaleString("zh-CN")} — ${new Date(sale.endMs).toLocaleString("zh-CN")}`;
        if (countdownEl.title !== title) countdownEl.title = title;
        if (countdownEl.style.display === "none") countdownEl.style.display = "";
    }
    function refreshSale() {
        return loadSales().then(sales => {
            currentSale = pickSale(sales);
            paintCountdown();
        });
    }
    function tickCountdown() {
        if (currentSale && currentSale.endMs <= Date.now()) {
            currentSale = null;
            GM_setValue(SALE_KEY, null);
            refreshSale();
        }
        paintCountdown();
    }
    function startCountdown() {
        refreshSale();
        if (!saleTimer) saleTimer = setInterval(tickCountdown, 2e4);
    }
    function renderSummary() {
        const box = getSummaryBox();
        if (!box) return;
        const body = summaryBody(box);
        placeControls(box);
        syncBarSurface(box);
        const s = summarize();
        if (s.total === 0) {
            writeIfChanged(body, '<span class="dim">📊 愿望单为空</span>');
            if (!collecting) revealBar(box);
            updateCollectionProgress();
            return;
        }
        const noLowAtAll = s.counted > 0 && s.noLow === s.counted;
        const nativeText = map => {
            const keys = Object.keys(map).filter(c => c !== "CNY" && map[c] > 0);
            return keys.length === 1 ? `（${formatPrice(map[keys[0]], keys[0])}）` : "";
        };
        const parts = s.ratesMissing ? [ `<span class="warn">⚠ 汇率获取失败，暂无法折算人民币</span>` ] : [ `<span class="label">史低合计</span><span class="main">${noLowAtAll ? "—" : formatCNY(s.lowSum) + nativeText(s.lowNative)}</span>`, `<span class="dim">当前合计</span><span class="cur">${formatCNY(s.curSum) + nativeText(s.curNative)}</span>` ];
        if (!s.ratesMissing && s.save > .005) parts.push(`<span class="save">等史低可省 ${formatCNY(s.save)}</span>`);
        if (s.atLow > 0) parts.push(`<span class="save">${s.atLow} 项已到史低</span>`);
        const nonCNY = s.currencies.filter(c => c !== "CNY");
        if (nonCNY.length && s.currencies.length > 1) parts.push(`<span class="dim">含 ${nonCNY.join("/")} 报价</span>`);
        if (s.noLow) parts.push(`<span class="warn">⚠ ${s.noLow} 项无史低数据</span>`);
        if (s.missing) parts.push(`<span class="warn">${s.missing} 项游戏暂无数据</span>`);
        writeIfChanged(body, `<span class="count">折扣中 ${s.onSale} 项</span>` + parts.join(""));
        if (!collecting) revealBar(box);
        updateCollectionProgress();
    }
    function updateCollectionProgress() {
        let loaded = 0;
        for (const key of wishlistIds.keys()) if (hasAnyPrice(prices[key])) loaded++;
        if (!loaded) return hideProgress();
        const working = collecting || draining || pendingIds.size > 0;
        const idsComplete = serverWishlistLoaded || (expectedCount > 0 ? wishlistIds.size >= expectedCount : true);
        const allAttempted = wishlistIds.size > 0 && doneIds.size >= wishlistIds.size;
        const busy = working || !idsComplete || !allAttempted;
        setProgress(busy ? `已加载 ${loaded} 项` : "已加载完成", busy);
    }
    async function startCollection() {
        if (collecting) return;
        collecting = true;
        serverWishlistLoaded = false;
        try {
            harvest(document);
            observeRows();
            renderSummary();
            const serverRequest = fetchWishlistItems();
            queuePrices();
            const serverItems = await serverRequest;
            if (serverItems) {
                const serverKeys = new Set(serverItems.map(item => item.key));
                if ([ ...wishlistIds.keys() ].every(key => serverKeys.has(key))) {
                    serverWishlistLoaded = true;
                    expectedCount = serverItems.length;
                    serverItems.forEach(item => wishlistIds.set(item.key, item));
                }
            }
            if (!serverWishlistLoaded) refreshExpected();
            queuePrices();
            renderSummary();
            if (!serverWishlistLoaded && expectedCount && wishlistIds.size < expectedCount) {
                updateCollectionProgress();
                await harvestByScroll();
            }
        } finally {
            collecting = false;
            renderSummary();
        }
    }
    function isPriceText(text) {
        const t = (text || "").trim();
        if (t.length === 0 || t.length > 20) return false;
        if (/^-\s?\d{1,3}\s?%$/.test(t)) return true;
        if (!/[\d.,]/.test(t)) return false;
        return /\p{Sc}/u.test(t) || /(?:USD|CNY|INR|EUR|GBP|RUB|BRL|PLN|KRW|TWD|SGD|MXN|AUD|CAD|HKD|TRY|ARS)\b/.test(t);
    }
    function priceLeaf(row) {
        const rect = row.getBoundingClientRect();
        const minLeft = rect.left + rect.width * .4;
        let best = null, bestLeft = Infinity;
        row.querySelectorAll("*").forEach(node => {
            if (node.closest(".game_lowest_price")) return;
            if (!isPriceText(node.textContent)) return;
            for (const child of node.children) if (isPriceText(child.textContent)) return;
            const r = node.getBoundingClientRect();
            if (r.width === 0 || r.left < minLeft) return;
            if (r.left < bestLeft) {
                best = node;
                bestLeft = r.left;
            }
        });
        return best;
    }
    function priceRowItem(row, leaf) {
        let node = leaf;
        while (node.parentElement && node.parentElement !== row) {
            const parent = node.parentElement;
            if (parent.children.length >= 2 && ![ ...parent.children ].every(n => isPriceText(n.textContent))) return node;
            node = parent;
        }
        return node;
    }
    function isVerticalBox(node) {
        const cs = getComputedStyle(node);
        if (cs.display === "flex" || cs.display === "inline-flex") return cs.flexDirection === "column" || cs.flexDirection === "column-reverse";
        return cs.display === "block" || cs.display === "grid" || cs.display === "list-item";
    }
    function rowHost(row, link) {
        const wide = row.getBoundingClientRect().width * .3;
        let node = link;
        while (node && node !== row) {
            const parent = node.parentElement;
            if (!parent) break;
            if (isVerticalBox(parent) && parent.children.length >= 2 && parent.getBoundingClientRect().width >= wide) return parent;
            node = parent;
        }
        return row;
    }
    function fallbackIntoRow(el, row, link) {
        const cs = getComputedStyle(row);
        if (cs.display === "flex" || cs.display === "inline-flex") {
            row.style.flexWrap = "wrap";
            el.style.flex = "0 0 100%";
        }
        const indent = Math.max(0, link.getBoundingClientRect().left - row.getBoundingClientRect().left);
        el.style.paddingLeft = `${Math.round(indent + 10)}px`;
    }
    function titleLinkOf(row, link) {
        const r = keyOfHref(link.href);
        if (!r) return link;
        let best = null, bestLen = -1;
        row.querySelectorAll('a[href*="store.steampowered.com"]').forEach(a => {
            const k = keyOfHref(a.href);
            if (!k || k.key !== r.key) return;
            const len = a.textContent.trim().length;
            if (len > bestLen) {
                best = a;
                bestLen = len;
            }
        });
        return best || link;
    }
    function currentPriceLeaf(item) {
        let best = null, bestBottom = -Infinity;
        item.querySelectorAll("*").forEach(node => {
            if (node.children.length || !isPriceText(node.textContent)) return;
            const r = node.getBoundingClientRect();
            if (!r.width || !r.height) return;
            if (r.bottom > bestBottom) {
                best = node;
                bestBottom = r.bottom;
            }
        });
        return best;
    }
    let measureCtx = null;
    function alignToPriceLine(el, leaf, box) {
        measureCtx = measureCtx || document.createElement("canvas").getContext("2d");
        const lineRect = node => {
            const range = document.createRange();
            range.selectNodeContents(node);
            const rects = [ ...range.getClientRects() ].filter(r => r.width > 1 && r.height > 1);
            return rects[0] || node.getBoundingClientRect();
        };
        const baseline = node => {
            const r = lineRect(node);
            const cs = getComputedStyle(node);
            measureCtx.font = `${cs.fontStyle} ${cs.fontVariant} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
            const m = measureCtx.measureText("Mg");
            const lead = Math.max(0, (r.height - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2);
            return r.top + lead + m.fontBoundingBoxAscent;
        };
        const offset = () => Math.round(baseline(leaf) - baseline(el));
        const raw = offset();
        if (Math.abs(raw) < 3) return;
        el.style.alignSelf = "center";
        const centered = offset();
        if (Math.abs(centered) >= Math.abs(raw)) {
            el.style.alignSelf = "";
            return;
        }
        if (Math.abs(centered) < 3) return;
        const boxBefore = box.getBoundingClientRect();
        el.style.marginTop = `${centered}px`;
        const boxAfter = box.getBoundingClientRect();
        const line = lineRect(el);
        if (Math.abs(offset()) >= Math.abs(centered) || line.top - boxAfter.top < -1 || boxAfter.bottom - line.bottom < -1 || boxAfter.height > boxBefore.height + 1) {
            el.style.marginTop = "";
        }
    }
    function cardGridOf(row, from) {
        const img = row.querySelector("img");
        let node = from;
        while (node && node !== row) {
            if (getComputedStyle(node).display === "grid" && node.getBoundingClientRect().width > 120 && (!img || node.contains(img))) return node;
            node = node.parentElement;
        }
        return null;
    }
    function insertPriceLine(row, link, info) {
        const el = createPriceElement(info);
        const anchor = titleLinkOf(row, link);
        const host = rowHost(row, anchor);
        const leaf = priceLeaf(row);
        const item = leaf && priceRowItem(row, leaf);
        if (isMobileUI()) {
            const card = cardGridOf(row, leaf || item || anchor);
            if (card) {
                const native = [ ...card.children ].find(n => n !== el && /purchase/.test(getComputedStyle(n).gridArea));
                const ownRow = () => {
                    el.classList.remove("purchase-inline", "tight");
                    Object.assign(el.style, {
                        gridArea: "auto", gridColumn: "1 / -1", gridRow: "auto",
                        justifySelf: "stretch", alignSelf: "start", width: "auto",
                        maxWidth: "100%", minWidth: "0", margin: "2px 0 0",
                        paddingLeft: "0", lineHeight: "", fontSize: "", transform: ""
                    });
                    if (el.parentElement !== card || el.nextElementSibling) card.appendChild(el);
                };
                const fitInline = () => {
                    el.style.fontSize = "11px";
                    el.classList.remove("tight");
                    if (el.scrollWidth > el.clientWidth + 1) el.classList.add("tight");
                };
                const centerOnNative = () => {
                    el.style.transform = "";
                    const target = (currentPriceLeaf(native) || native).getBoundingClientRect();
                    const box = el.getBoundingClientRect();
                    const dy = Math.round(target.top + target.height / 2 - (box.top + box.height / 2));
                    el.style.transform = dy ? `translateY(${dy}px)` : "";
                };
                const nativeLeft = () => {
                    let left = Infinity;
                    native.querySelectorAll("*").forEach(n => {
                        if (n.children.length || !isPriceText(n.textContent)) return;
                        const r = n.getBoundingClientRect();
                        if (r.width > 0 && r.left < left) left = r.left;
                    });
                    return left === Infinity ? native.getBoundingClientRect().left : left;
                };
                const applyInline = () => {
                    if (!native) return ownRow();
                    el.classList.add("purchase-inline");
                    Object.assign(el.style, {
                        gridColumn: "", gridRow: "", gridArea: "purchase",
                        justifySelf: "start", alignSelf: "center", width: "auto",
                        minWidth: "0", maxWidth: "none", margin: "0",
                        paddingLeft: "0", lineHeight: "1.3"
                    });
                    if (el.nextElementSibling !== native) card.insertBefore(el, native);
                    const avail = Math.floor(nativeLeft() - el.getBoundingClientRect().left - 4);
                    if (avail < 70) return ownRow();
                    el.style.maxWidth = `${avail}px`;
                    fitInline();
                    centerOnNative();
                };
                applyInline();
                const mo = new MutationObserver(() => {
                    if (!el.isConnected) return mo.disconnect();
                    applyInline();
                });
                mo.observe(native, { childList: true, characterData: true, subtree: true });
                if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => el.isConnected && applyInline());
                if (native && typeof ResizeObserver === "function") {
                    const ro = new ResizeObserver(() => {
                        if (!el.isConnected) return ro.disconnect();
                        applyInline();
                    });
                    ro.observe(native);
                }
                return;
            }
            host.appendChild(el);
            return;
        }
        if (item && item.parentElement && host !== row) {
            const before = host.getBoundingClientRect().height;
            el.classList.add("side");
            item.parentElement.insertBefore(el, item);
            if (host.getBoundingClientRect().height > before + 1) {
                el.remove();
                el.classList.remove("side");
            } else {
                alignToPriceLine(el, currentPriceLeaf(item) || leaf, item.parentElement);
                return;
            }
        }
        if (host === row) fallbackIntoRow(el, row, anchor);
        host.appendChild(el);
    }
    function createPriceElement(info) {
        const div = document.createElement("div");
        if (info.locked) {
            div.className = `game_lowest_price locked${isMobileUI() ? " compact" : ""}`;
            div.textContent = "锁区";
            return div;
        }
        const atLow = isAtHistoricalLow(info.lowest, info.current);
        div.className = `game_lowest_price${isMobileUI() ? " compact" : ""}${atLow ? " at-low" : ""}`;
        const line = (cls, label, entry) => {
            if (!entry || !entry.price) return "";
            const cut = Number(entry.cut) > 0 ? `-${entry.cut}%` : "";
            return `<span class="${cls}">${label}${formatPrice(entry.price.amount, entry.price.currency)}` + `${cut ? ` <span class="shc-discount">${cut}</span>` : ""}</span>`;
        };
        div.innerHTML = line("shc-mobile-lowline", "史低", info.lowest) + line("shc-mobile-currentline", "当前", info.current);
        return div;
    }
    function paintRow(row) {
        if (!row.isConnected) {
            visibleRows.delete(row);
            return;
        }
        const link = rowLink(row);
        const r = link && keyOfHref(link.href);
        const info = r && prices[r.key];
        const freeOnly = info && info.current && info.current.free && !info.lowest;
        const existing = row.querySelector(".game_lowest_price");
        if (existing) {
            if (freeOnly) {
                existing.remove();
                return;
            }
            if (!existing.classList.contains("locked") || !hasAnyPrice(info)) return;
            existing.remove();
        }
        if (freeOnly) return;
        if (hasAnyPrice(info)) insertPriceLine(row, link, info);
        else if (r && fetchedKeys.has(r.key)) insertPriceLine(row, link, { locked: true });
    }
    function paintVisibleRows() {
        visibleRows.forEach(row => paintRow(row));
    }
    const rowObserver = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                visibleRows.add(e.target);
                paintRow(e.target);
                if (wishlistIds.size > AUTO_QUEUE_LIMIT) queuePrices();
            } else visibleRows.delete(e.target);
        });
    }, { rootMargin: "300px 0px" });
    function observeRows() {
        document.querySelectorAll(ROW_SELECTOR).forEach(row => {
            if (observedRows.has(row)) return;
            observedRows.add(row);
            rowObserver.observe(row);
        });
    }
    function setProgress(text, loading = true) {
        const div = getProgressDiv();
        const label = div.querySelector(".wishlist-progress-text");
        if (label && label.textContent !== text) label.textContent = text;
        div.classList.toggle("loading", loading);
        div.classList.add("show");
    }
    function hideProgress() {
        getProgressDiv().classList.remove("show");
    }
    function scrollWishlistToTop() {
        const options = { top: 0, behavior: "smooth" };
        const host = scrollHostOf(document.querySelector(ROW_SELECTOR));
        if (host) {
            if (typeof host.scrollTo === "function") host.scrollTo(options);
            else host.scrollTop = 0;
        }
        const root = document.scrollingElement || document.documentElement;
        if (root && typeof root.scrollTo === "function") root.scrollTo(options);
        window.scrollTo(options);
    }
    function getProgressDiv() {
        const all = document.querySelectorAll("#wishlist-progress");
        if (all.length) {
            all.forEach((el, i) => {
                if (i) el.remove();
            });
            return all[0];
        }
        const div = document.createElement("div");
        div.id = "wishlist-progress";
        div.title = "点击返回页面顶部";
        div.setAttribute("role", "button");
        div.tabIndex = 0;
        const icon = document.createElement("span");
        icon.className = "wishlist-progress-icon";
        icon.textContent = "⏳";
        const label = document.createElement("span");
        label.className = "wishlist-progress-text";
        div.append(icon, label);
        const toTop = event => {
            event.preventDefault();
            event.stopPropagation();
            scrollWishlistToTop();
        };
        div.addEventListener("click", toTop);
        div.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") toTop(event);
        });
        document.body.appendChild(div);
        return div;
    }
    function resetAndReload() {
        generation++;
        wishlistIds.clear();
        pendingIds.clear();
        doneIds.clear();
        fetchedKeys.clear();
        expectedCount = 0;
        serverWishlistLoaded = false;
        loadPriceCache();
        document.querySelectorAll(".game_lowest_price").forEach(e => e.remove());
        paintVisibleRows();
        startCollection();
    }
    let lastMobile = null;
    const scheduleHarvest = debounce(() => {
        harvest(document);
        observeRows();
        refreshExpected();
        queuePrices();
        paintVisibleRows();
        scheduleSummary();
    }, 250);
    function applyViewportMode() {
        const mobile = isMobileUI();
        document.documentElement.classList.toggle("shc-mobile", mobile);
        if (mobile === lastMobile) return;
        lastMobile = mobile;
        document.querySelectorAll(".game_lowest_price").forEach(e => e.remove());
        paintVisibleRows();
        renderSummary();
    }
    function isOwnNode(node) {
        const el = node.nodeType === 1 ? node : node.parentElement;
        return !!(el && el.closest(OWN_SELECTOR));
    }
    function isOwnRecord(r) {
        if (isOwnNode(r.target)) return true;
        return r.type === "childList" && r.addedNodes.length > 0 && r.removedNodes.length === 0 && [ ...r.addedNodes ].every(isOwnNode);
    }
    function initWishlist() {
        if (document.querySelectorAll(ROW_SELECTOR).length === 0) {
            setTimeout(initWishlist, 500);
            return;
        }
        if (!countryControls) {
            countryControls = document.createElement("div");
            countryControls.id = "wishlist-country-controls";
            countdownEl = document.createElement("span");
            countdownEl.id = "shc-sale-countdown";
            countdownEl.style.display = "none";
            countryControls.append(countdownEl, createCountryControl(resetAndReload));
            document.body.appendChild(countryControls);
        }
        loadPriceCache();
        harvest(document);
        observeRows();
        applyViewportMode();
        window.addEventListener("resize", debounce(applyViewportMode, 250));
        ensureRates().then(scheduleSummary);
        startCollection();
        startCountdown();
        new MutationObserver(records => {
            if (barNode && barNode.dataset.ready === "1" && !barNode.isConnected) insertSummary(barNode, rowsHost());
            if (records.some(r => !isOwnRecord(r))) scheduleHarvest();
        }).observe(document.body, { childList: true, characterData: true, subtree: true });
    }
    GM_addStyle(`
        .shc-cc { position: relative; display: inline-flex; }
        .shc-cc-btn { display: inline-flex; align-items: center; gap: 4px;
            background: rgba(163,186,211,.2); color: #fff; border-radius: 2px;
            padding: 2px 8px; min-height: 22px; font-size: 12px; line-height: 1.25; }
        .shc-cc:hover .shc-cc-btn, .shc-cc.open .shc-cc-btn { background: rgba(102,192,244,.45); }
        .shc-cc-btn .flag { font-size: .95em; line-height: 1; }
        .shc-cc-btn .caret { font-size: .68em; opacity: .6; }
        .shc-cc select { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; padding: 0;
            border: 0; opacity: 0; appearance: none; -webkit-appearance: none; cursor: pointer; }
        .game_lowest_price { word-break: break-word; font-size: 11px; color: #ddd; margin-top: 5px; display: block; width: 100%; box-sizing: border-box; padding-left: 5px; }
        .game_lowest_price .shc-mobile-lowline, .game_lowest_price .shc-mobile-currentline { display: block; }
        .game_lowest_price .shc-discount { color: #a5cb00; font-weight: bold; }
        .game_lowest_price.at-low { color: #4a9eff; font-weight: bold; }
        .game_lowest_price.at-low .shc-discount { color: #4a9eff; }
        .game_lowest_price.locked { color: #e74c3c; font-weight: bold; }
        .game_lowest_price.side { width: auto; min-width: 0; max-width: 340px; flex: 0 1 auto; display: block; padding-left: 5px;
            text-align: left; margin: 0 clamp(6px, 1vw, 14px) 0 0; line-height: 1.5; }
        .shc-summary { display: flex; align-items: center; flex-wrap: wrap;
            box-sizing: border-box; width: 100%; min-width: 0; gap: clamp(6px, 1.1vw, 12px);
            margin: 6px 0 12px; padding: 6px clamp(8px, 1.4vw, 12px);
            background: #132434; border: 1px solid rgba(255,255,255,.08); border-radius: 4px;
            font-size: 12px; color: #acb2b8; font-family: 'Motiva Sans', Arial, sans-serif;
            -webkit-user-select: text; user-select: text; position: sticky; top: 0; z-index: 900; }
        .shc-summary .count { color: #8b929a; font-size: .9em; }
        .shc-summary .label { color: #8b929a; font-size: .9em; }
        .shc-summary .main { font-size: 1.0em; color: #66c0f4; }
        .shc-summary .cur { color: #fff; font-size: 1.0em; }
        .shc-summary .dim { color: #8b929a; font-size: .9em; }
        .shc-summary .save { color: #a5cb00; font-size: .9em; }
        .shc-summary .warn { color: #ffc53d; font-size: .9em; }
        .shc-summary button { background: rgba(163,186,211,.2); color: #f7f8f8; border: 0;
            border-radius: 2px; padding: 1px 8px; min-height: 1.5em; font-size: .9em; cursor: pointer; }
        .shc-summary button:hover { background: rgba(163,186,211,.35); }
        .shc-summary-body { display: contents; min-width: 0; }
        #wishlist-country-controls { display: flex; align-items: center; gap: 6px; margin-left: auto;
            flex: 0 1 auto; min-width: 0; max-width: 100%; white-space: nowrap; }
        #shc-sale-countdown { font-size: 1em; white-space: nowrap; line-height: 1.25; }
        #shc-sale-countdown .shc-cd-date { color: #66c0f4; }
        #shc-sale-countdown .shc-cd-state, #shc-sale-countdown .shc-cd-unit { color: #8b929a; }
        #shc-sale-countdown .shc-cd-num { color: #8b5cf6; }
        #wishlist-progress { position: fixed; bottom: calc(env(safe-area-inset-bottom, 0px) + 52px); right: calc(env(safe-area-inset-right, 0px) + 10px);
            z-index: 9999; box-sizing: border-box; max-width: 82vw; min-height: 21px;
            background: rgba(23,29,37,.70); border: 1px solid rgba(255,255,255,.12); border-radius: 5px;
            cursor: pointer; align-items: center; justify-content: center; gap: 3px; padding: 2px 6px;
            font-size: 11px; line-height: 1.3; color: #acb2b8; display: none; box-shadow: 0 3px 10px rgba(0,0,0,.25); }
        #wishlist-progress.show { display: flex; }
        #wishlist-progress:hover { background: rgba(23,29,37,.88); border-color: rgba(255,255,255,.24); }
        #wishlist-progress .wishlist-progress-icon { display: inline-block; flex: 0 0 auto; font-size: .9em; }
        #wishlist-progress .wishlist-progress-text { min-width: 0; }
        #wishlist-progress.loading .wishlist-progress-icon { animation: shc-funnel-spin 2s linear infinite; }
        @keyframes shc-funnel-spin { to { transform: rotate(360deg); } }

        .shc-mobile .shc-summary { margin: 4px 0 10px; }
        .shc-mobile .shc-summary button { min-height: 30px; padding: 0 12px; font-size: 14px; }
        .shc-mobile .shc-summary .shc-cc-btn { min-height: 22px; padding: 2px 8px; font-size: 12px; }
        .shc-mobile .game_lowest_price.compact { margin-top: 2px; line-height: 1.35;
            font-size: 12px; width: 100%; max-width: 100%; min-width: 0;
            white-space: normal; overflow-wrap: anywhere; }
        .shc-mobile .game_lowest_price.compact .shc-mobile-lowline,
        .shc-mobile .game_lowest_price.compact .shc-mobile-currentline { display: block; line-height: inherit; }
        .shc-mobile .game_lowest_price.compact .shc-mobile-lowline { white-space: normal; }
        .shc-mobile .game_lowest_price.compact.purchase-inline { font-size: 11px; line-height: 1.2;
            white-space: nowrap; overflow: visible; display: flex; flex-direction: column;
            justify-content: center; gap: 1px; }
        .shc-mobile .game_lowest_price.compact.purchase-inline .shc-mobile-lowline,
        .shc-mobile .game_lowest_price.compact.purchase-inline .shc-mobile-currentline { white-space: nowrap; }
        .shc-mobile .game_lowest_price.compact.purchase-inline.tight .shc-discount { display: none; }
    `);
    initWishlist();
})();
