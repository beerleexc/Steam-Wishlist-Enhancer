// ==UserScript==
// @name        Steam愿望单增强
// @namespace   SteamwishlistEnhacne
// @description 仅适用于Steam愿望单：可切换中、印、美、乌克兰四地查询价格与史低，汇总全清单价格并显示大促倒计时；乌克兰无分区史低数据源，仅显示现价
// @author      beerlee
// @license     GPL version 3 or any later version
// @version     1.01
// @include     *://store.steampowered.com/wishlist/*
// @grant       GM_xmlhttpRequest
// @grant       GM_setValue
// @grant       GM_getValue
// @grant       GM_addStyle
// @connect     api.augmentedsteam.com
// @connect     api.steampowered.com
// @connect     open.er-api.com
// @connect     store.steampowered.com
// @connect     steamdb.info
// @run-at      document-end
// ==/UserScript==
(function() {
    "use strict";
    const COUNTRIES = {
        cn: {
            name: "🇨🇳 中国",
            currency: "CNY"
        },
        in: {
            name: "🇮🇳 印度",
            currency: "INR"
        },
        us: {
            name: "🇺🇸 美国",
            currency: "USD"
        },
        ua: {
            name: "🇺🇦 乌克兰",
            currency: "UAH"
        }
    };
    const COUNTRY_CODES = new Set(Object.keys(COUNTRIES).map(c => c.toUpperCase()));
    const CURRENCY_SYMBOLS = {
        CNY: "¥",
        INR: "₹",
        USD: "$",
        UAH: "₴"
    };
    const FALLBACK_TO_CNY = {
        INR: .0709,
        UAH: .1471,
        USD: 6.685
    };
    const STORE_VERSION = "v3";
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
            GM_setValue(key, {
                v: STORE_VERSION,
                t: Date.now(),
                value: value
            });
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
                onload: r => r.status >= 200 && r.status < 400 ? resolve(r.responseText) : reject(Object.assign(new Error(`HTTP ${r.status}`), {
                    status: r.status
                })),
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
        headers: {
            "Content-Type": "application/json",
            ...headers
        }
    });
    const FX_URL = "https://open.er-api.com/v6/latest/USD";
    const FX_KEY = "steamHistoryFxRates";
    const FX_TTL = 24 * 60 * 60 * 1e3;
    let fxLive = store.read(FX_KEY, FX_TTL);
    let fxPending = null;
    function ensureRates() {
        if (fxLive) return Promise.resolve(fxLive);
        if (!fxPending) {
            fxPending = getJSON({
                url: FX_URL,
                headers: {
                    Accept: "application/json"
                },
                timeout: 15e3
            }).then(d => {
                if (d.result !== "success" || !d.rates || !(d.rates.CNY > 0)) return null;
                fxLive = {
                    usdTo: d.rates
                };
                store.write(FX_KEY, fxLive);
                return fxLive;
            }).catch(() => null).then(v => {
                fxPending = null;
                return v;
            });
        }
        return fxPending;
    }
    function cnyPerUnit(currency) {
        if (currency === "CNY") return 1;
        if (fxLive) {
            const perUsd = currency === "USD" ? 1 : fxLive.usdTo[currency];
            return perUsd > 0 ? fxLive.usdTo.CNY / perUsd : null;
        }
        return FALLBACK_TO_CNY[currency] || null;
    }
    const formatPrice = (amount, currency) => {
        if (amount == null || isNaN(amount)) return "?";
        const sym = CURRENCY_SYMBOLS[currency] || currency;
        return sym + amount.toFixed(2);
    };
    const formatCut = cut => Number(cut) > 0 ? `-${cut}%` : "";
    const toBaseCNY = (amount, currency) => {
        if (amount == null || isNaN(amount)) return null;
        if (currency === "CNY") return amount;
        const rate = cnyPerUnit(currency);
        return rate ? amount * rate : null;
    };
    const formatCNY = v => "¥" + (v || 0).toLocaleString("zh-CN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    const hasAnyPrice = info => !!(info && (info.lowest && info.lowest.price || info.current && info.current.price));
    function isAtHistoricalLow(lowest, current) {
        const lp = lowest && lowest.price;
        const cp = current && current.price;
        if (!lp || !cp) return false;
        if (lp.currency !== cp.currency) return false;
        return cp.amount <= lp.amount + .01;
    }
    let currentCountry = GM_getValue("steamHistoryCountry", "cn");
    if (!COUNTRIES[currentCountry]) currentCountry = "cn";
    function isMobileUI() {
        const w = window.innerWidth || document.documentElement && document.documentElement.clientWidth || 0;
        const coarse = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
        return w > 0 && (w <= 720 || coarse && w <= 900);
    }
    const emptyChunk = () => ({
        app: [],
        sub: [],
        bundle: []
    });
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
        const ids = [];
        chunk.app.forEach(id => ids.push({
            appid: id
        }));
        chunk.sub.forEach(id => ids.push({
            packageid: id
        }));
        chunk.bundle.forEach(id => ids.push({
            bundleid: id
        }));
        if (!ids.length) return Promise.resolve({});
        const currency = COUNTRIES[country].currency;
        const input = {
            ids: ids,
            context: {
                language: "schinese",
                country_code: country.toUpperCase()
            },
            data_request: {
                include_basic_info: false,
                include_all_purchase_options: false
            }
        };
        return getJSON({
            url: STEAM_GETITEMS + "?input_json=" + encodeURIComponent(JSON.stringify(input)),
            headers: {
                Accept: "application/json"
            }
        }).then(d => {
            const out = {};
            ((d.response || {}).store_items || []).forEach(it => {
                const po = it.best_purchase_option;
                const type = STEAM_TYPES[it.item_type];
                if (!po || po.final_price_in_cents == null || !type) return;
                const amount = Number(po.final_price_in_cents) / 100;
                const regular = po.original_price_in_cents != null ? Number(po.original_price_in_cents) / 100 : amount;
                out[`${type}/${it.id}`] = {
                    price: {
                        amount: amount,
                        currency: currency
                    },
                    regular: {
                        amount: regular,
                        currency: currency
                    },
                    cut: Number(po.discount_pct) > 0 ? Number(po.discount_pct) : 0
                };
            });
            return out;
        }).catch(() => null);
    }
    function trustsAugmented(entry, officialPrice) {
        const aug = entry && entry.current && entry.current.price;
        if (!aug || !officialPrice) return false;
        if (aug.currency !== officialPrice.currency) return false;
        const base = Math.max(officialPrice.amount, 1);
        return Math.abs(aug.amount - officialPrice.amount) / base <= .02;
    }
    const REGION_CAP_KEY = "steamHistoryRegionCaps";
    const REGION_CAP_TTL = 7 * 24 * 60 * 60 * 1e3;
    let regionCaps = null;
    const getRegionCaps = () => regionCaps || (regionCaps = store.read(REGION_CAP_KEY, REGION_CAP_TTL) || {});
    const saveRegionCaps = () => store.write(REGION_CAP_KEY, regionCaps);
    const getRegionCap = code => {
        const c = getRegionCaps();
        return c[code] || (c[code] = {});
    };
    const setRegionCap = (code, fields) => {
        Object.assign(getRegionCap(code), fields);
        saveRegionCaps();
    };
    const augmentedHasLocalLowest = code => {
        if (code === "US") return true;
        const cap = getRegionCap(code);
        return cap.augmentedProbed ? !!cap.augmentedHasLocalLowest : null;
    };
    function pickSampleItem() {
        const sampleKey = Object.keys(prices).find(k => prices[k] && prices[k].current);
        if (sampleKey) {
            const [t, id] = sampleKey.split("/");
            return {
                key: sampleKey,
                type: t,
                id: Number(id)
            };
        }
        const first = wishlistIds.values().next().value;
        return first ? {
            key: first.key,
            type: first.type,
            id: Number(first.id)
        } : null;
    }
    async function probeAugmentedRegion(country) {
        const code = country.toUpperCase();
        if (code === "US") return;
        const cap = getRegionCap(code);
        if (cap.augmentedProbed) return;
        const sample = pickSampleItem();
        if (!sample) return;
        const chunk = {
            app: [],
            sub: [],
            bundle: []
        };
        chunk[sample.type].push(sample.id);
        const [regionRes, usRes] = await Promise.all([ fetchPrices(chunk, code).catch(() => null), fetchPrices(chunk, "US").catch(() => null) ]);
        const rLow = regionRes && regionRes[sample.key] && regionRes[sample.key].lowest && regionRes[sample.key].lowest.price;
        const uLow = usRes && usRes[sample.key] && usRes[sample.key].lowest && usRes[sample.key].lowest.price;
        if (!rLow || !uLow) return;
        const same = rLow.currency === uLow.currency && Math.abs(rLow.amount - uLow.amount) < .01;
        setRegionCap(code, {
            augmentedProbed: true,
            augmentedHasLocalLowest: !same
        });
    }
    function mergeRegionPrices(aug, steam) {
        const hasLocal = augmentedHasLocalLowest(currentCountry.toUpperCase());
        if (hasLocal === false) Object.keys(aug).forEach(key => {
            delete aug[key].lowest;
            if (!steam) delete aug[key].current;
        });
        if (!steam) return aug;
        Object.keys(aug).forEach(key => {
            if (!(key in steam)) {
                delete aug[key].current;
                delete aug[key].lowest;
            }
        });
        Object.keys(steam).forEach(key => {
            const entry = aug[key] || (aug[key] = {});
            if (hasLocal === null) {
                if (!trustsAugmented(entry, steam[key].price)) delete entry.lowest;
            }
            entry.current = steam[key];
        });
        return aug;
    }
    function createCountryControl(onChange) {
        const wrap = document.createElement("span");
        wrap.className = "shc-cc";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "shc-cc-btn";
        const list = document.createElement("span");
        list.className = "shc-cc-list";
        wrap.append(btn, list);
        const split = code => {
            const name = COUNTRIES[code].name;
            const i = name.indexOf(" ");
            return i < 0 ? [ "", name ] : [ name.slice(0, i), name.slice(i + 1) ];
        };
        const close = () => wrap.classList.remove("open");
        const paint = () => {
            const [flag, label] = split(currentCountry);
            btn.innerHTML = `<i class="flag">${flag}</i><span class="name">${label}</span><i class="caret">▾</i>`;
            btn.title = "切换查询地区";
            [ ...list.children ].forEach(item => item.classList.toggle("on", item.dataset.code === currentCountry));
        };
        btn.addEventListener("click", e => {
            e.stopPropagation();
            if (wrap.classList.contains("open")) return close();
            const r = btn.getBoundingClientRect();
            list.style.left = "0px";
            list.style.top = "0px";
            const origin = list.getBoundingClientRect();
            const w = list.offsetWidth || 160;
            const h = list.offsetHeight;
            const left = Math.max(4, Math.min(Math.round(r.right - w), window.innerWidth - w - 4));
            const top = Math.max(4, Math.round(r.top - h - 4));
            list.style.left = `${Math.round(left - origin.left)}px`;
            list.style.right = "auto";
            list.style.top = `${Math.round(top - origin.top)}px`;
            wrap.classList.add("open");
        });
        document.addEventListener("pointerdown", e => {
            if (!wrap.contains(e.target)) close();
        }, true);
        window.addEventListener("scroll", close, true);
        window.addEventListener("resize", close);
        for (const code of Object.keys(COUNTRIES)) {
            const [flag, label] = split(code);
            const item = document.createElement("button");
            item.type = "button";
            item.dataset.code = code;
            item.innerHTML = `<i class="flag">${flag}</i><span class="name">${label}</span>`;
            item.addEventListener("click", e => {
                e.stopPropagation();
                close();
                if (code === currentCountry) return;
                currentCountry = code;
                GM_setValue("steamHistoryCountry", currentCountry);
                paint();
                if (onChange) onChange(currentCountry);
            });
            list.appendChild(item);
        }
        paint();
        return wrap;
    }
    const ROW_SELECTOR = "div.Panel[data-index], .wishlist_row[data-appid]";
    const OWN_SELECTOR = "#shc-wishlist-summary, #wishlist-country-controls, #wishlist-progress, .game_lowest_price";
    const PRICE_KEY = "steamHistoryPrices";
    const PRICE_TTL = 30 * 60 * 1e3;
    const PRICE_KEEP = 24 * 60 * 60 * 1e3;
    const wishlistIds = new Map;
    const pendingIds = new Map;
    const doneIds = new Set;
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
        return m ? {
            key: `${m[1]}/${m[2]}`,
            type: m[1],
            id: m[2]
        } : null;
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
                headers: {
                    "Cache-Control": "no-cache",
                    Pragma: "no-cache"
                }
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
            return [ ...ids ].map(id => ({
                key: `app/${id}`,
                type: "app",
                id: id
            }));
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
    }, {
        passive: true
    });
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
        wishlistIds.forEach((item, key) => {
            if (!doneIds.has(key) && !pendingIds.has(key)) pendingIds.set(key, item);
        });
        drainPrices();
    }
    function takeChunk() {
        const chunk = emptyChunk();
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
            await probeAugmentedRegion(currentCountry);
            while (pendingIds.size) {
                const wait = MIN_REQUEST_GAP - (Date.now() - lastRequestAt);
                if (wait > 0) await sleep(wait);
                const chunk = takeChunk();
                const country = currentCountry;
                const gen = generation;
                lastRequestAt = Date.now();
                const noLocal = augmentedHasLocalLowest(country.toUpperCase()) === false;
                const [aug, steam] = await Promise.all([ noLocal ? Promise.resolve({}) : fetchPrices(chunk, country).catch(() => ({})), fetchSteamRegionPrices(chunk, country) ]);
                if (gen !== generation) continue;
                mergeRegionPrices(aug, steam);
                if (gen !== generation) continue;
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
        let counted = 0, noLow = 0, atLow = 0, onSale = 0;
        let lowSum = 0, curSum = 0, saveSum = 0;
        const currencies = new Set;
        wishlistIds.forEach((item, key) => {
            const info = prices[key];
            const lp = info && info.lowest && info.lowest.price;
            const cp = info && info.current && info.current.price;
            if (cp && cp.currency) currencies.add(cp.currency);
            const lowCNY = lp ? toBaseCNY(lp.amount, lp.currency) : null;
            const curCNY = cp ? toBaseCNY(cp.amount, cp.currency) : null;
            if (lowCNY == null && curCNY == null) return;
            counted++;
            if (lowCNY != null) lowSum += lowCNY; else noLow++;
            if (curCNY != null) {
                curSum += curCNY;
                if (lowCNY != null) {
                    if (curCNY <= lowCNY + .01) atLow++;
                    saveSum += Math.max(0, curCNY - lowCNY);
                }
            } else {
                curSum += lowCNY;
            }
            if (info.current && info.current.cut > 0) onSale++;
        });
        return {
            total: wishlistIds.size,
            counted: counted,
            noLow: noLow,
            atLow: atLow,
            onSale: onSale,
            lowSum: lowSum,
            curSum: curSum,
            save: saveSum,
            currencies: [ ...currencies ]
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
            if (host) {
                host.insertBefore(box, host.firstChild);
            } else {
                const anchor = findCountNode();
                if (!anchor) return null;
                const line = outermostFlexLine(anchor);
                if (!line.parentElement) return null;
                line.parentElement.insertBefore(box, line.nextSibling);
            }
        } else if (host && box.parentElement !== host) {
            host.insertBefore(box, host.firstChild);
        }
        return box;
    }
    const scheduleSummary = debounce(renderSummary, 200);
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
    function writeIfChanged(el, html) {
        if (el.innerHTML !== html) el.innerHTML = html;
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
    const FALLBACK_SALES = [ {
        name: "Winter Sale 2026",
        start: "2026-12-17",
        end: "2027-01-04"
    }, {
        name: "Spring Sale 2027",
        start: "2027-03-18",
        end: "2027-03-25"
    }, {
        name: "Summer Sale 2027",
        start: "2027-06-24",
        end: "2027-07-08"
    } ];
    const SEASON_ZH = {
        winter: "❄ 冬季特卖",
        spring: "🌱 春季特卖",
        summer: "☀ 夏季特卖",
        autumn: "🍂 秋季特卖",
        fall: "🍂 秋季特卖"
    };
    const MONTH_NUM = {
        january: 1,
        february: 2,
        march: 3,
        april: 4,
        may: 5,
        june: 6,
        july: 7,
        august: 8,
        september: 9,
        october: 10,
        november: 11,
        december: 12
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
            store.write(SALE_KEY, {
                sales: sales,
                ok: ok
            });
            return sales;
        };
        return request({
            url: SALE_URL
        }).then(html => finish(salesFromSteamDb(html), true)).catch(() => finish([], false));
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
        cdNodes = {
            state: add("shc-cd-state", saleIsLive(sale, now) ? "距结束" : "距开始")
        };
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
            updateCollectionProgress();
            return;
        }
        const noLowAtAll = s.counted > 0 && s.noLow === s.counted;
        const parts = [ `<span class="label">史低合计</span><span class="main">${noLowAtAll ? "—" : formatCNY(s.lowSum)}</span>`, `<span class="dim">当前合计</span><span class="cur">${formatCNY(s.curSum)}</span>` ];
        if (s.save > .005) parts.push(`<span class="save">等史低可省 ${formatCNY(s.save)}</span>`);
        if (s.atLow > 0) parts.push(`<span class="save">${s.atLow} 项已到史低</span>`);
        const nonCNY = s.currencies.filter(c => c !== "CNY");
        if (nonCNY.length && s.currencies.length > 1) parts.push(`<span class="dim">含 ${nonCNY.join("/")} 报价</span>`);
        if (augmentedHasLocalLowest(currentCountry.toUpperCase()) === false) {
            parts.push(`<span class="dim">${COUNTRIES[currentCountry].name.replace(/^\S+\s*/, "")}无分区史低来源，仅计现价</span>`);
        }
        if (s.noLow) parts.push(`<span class="warn">⚠ ${s.noLow} 项无史低数据</span>`);
        writeIfChanged(body, `<span class="count">折扣中 ${s.onSale} 项</span>` + parts.join(""));
        updateCollectionProgress();
    }
    function updateCollectionProgress() {
        const total = expectedCount || wishlistIds.size;
        if (!total) return hideProgress();
        if (!collecting && !draining && !pendingIds.size && wishlistIds.size >= total) return setProgress("已全部加载", false);
        let loaded = 0;
        wishlistIds.forEach((item, key) => {
            if (hasAnyPrice(prices[key])) loaded++;
        });
        setProgress(`已加载 ${loaded}/${total}`, true);
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
        if (cs.display === "flex" || cs.display === "inline-flex") {
            return cs.flexDirection === "column" || cs.flexDirection === "column-reverse";
        }
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
    function insertPriceLine(row, link, info) {
        const el = createPriceElement(info);
        const anchor = titleLinkOf(row, link);
        const host = rowHost(row, anchor);
        const leaf = priceLeaf(row);
        const item = leaf && priceRowItem(row, leaf);
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
        const atLow = isAtHistoricalLow(info.lowest, info.current);
        div.className = `game_lowest_price${isMobileUI() ? " compact" : ""}${atLow ? " at-low" : ""}`;
        const line = (cls, label, entry) => {
            if (!entry || !entry.price) return "";
            const cut = formatCut(entry.cut);
            return `<span class="${cls}">${label}：${formatPrice(entry.price.amount, entry.price.currency)}` + `${cut ? ` <span class="shc-discount">${cut}</span>` : ""}</span>`;
        };
        div.innerHTML = line("shc-mobile-lowline", "史低", info.lowest) + line("shc-mobile-currentline", "当前", info.current);
        return div;
    }
    function paintRow(row) {
        if (!row.isConnected) {
            visibleRows.delete(row);
            return;
        }
        if (row.querySelector(".game_lowest_price")) return;
        const link = rowLink(row);
        const r = link && keyOfHref(link.href);
        const info = r && prices[r.key];
        if (!hasAnyPrice(info)) return;
        insertPriceLine(row, link, info);
    }
    function paintVisibleRows() {
        visibleRows.forEach(row => paintRow(row));
    }
    const rowObserver = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                visibleRows.add(e.target);
                paintRow(e.target);
            } else visibleRows.delete(e.target);
        });
    }, {
        rootMargin: "300px 0px"
    });
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
        if (!div.classList.contains("show")) div.classList.add("show");
    }
    function hideProgress() {
        getProgressDiv().classList.remove("show");
    }
    function scrollWishlistToTop() {
        const options = {
            top: 0,
            behavior: "smooth"
        };
        let node = document.querySelector(ROW_SELECTOR);
        while (node && node !== document.body && node !== document.documentElement) {
            const style = getComputedStyle(node);
            if (/(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) {
                if (typeof node.scrollTo === "function") node.scrollTo(options); else node.scrollTop = 0;
                break;
            }
            node = node.parentElement;
        }
        const root = document.scrollingElement || document.documentElement;
        if (root && typeof root.scrollTo === "function") root.scrollTo(options);
        window.scrollTo(options);
    }
    function getProgressDiv() {
        let div = document.getElementById("wishlist-progress");
        if (div) return div;
        div = document.createElement("div");
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
            if (records.some(r => !isOwnRecord(r))) scheduleHarvest();
        }).observe(document.body, {
            childList: true,
            characterData: true,
            subtree: true
        });
    }
    GM_addStyle(`
        .shc-cc { position: relative; display: inline-flex; }
        .shc-summary .shc-cc-btn { display: inline-flex; align-items: center; gap: 4px;
            background: rgba(163,186,211,.2); color: #f7f8f8; border: 0; border-radius: 2px;
            padding: 1px 6px; min-height: 1.4em; font-size: .88em; line-height: 1.25; cursor: pointer; }
        .shc-summary .shc-cc-btn:hover { background: rgba(163,186,211,.35); }
        .shc-cc-btn .flag { font-size: .95em; line-height: 1; }
        .shc-cc-btn .caret { font-size: .68em; opacity: .6; }
        .shc-cc-list { position: fixed; display: flex; flex-direction: column; gap: 1px; z-index: 100000;
            visibility: hidden; left: 4px; top: 4px;
            background: rgba(23,29,37,.60); border: 1px solid rgba(255,255,255,.14); border-radius: 4px; padding: 3px;
            box-shadow: 0 6px 18px rgba(0,0,0,.55); }
        .shc-cc.open .shc-cc-list { visibility: visible; }
        .shc-summary .shc-cc-list button { display: flex; align-items: center; gap: 6px; background: transparent;
            color: #acb2b8; border: 0; border-radius: 2px; padding: 1px 8px; min-height: 1.5em; font-size: .88em;
            white-space: nowrap; text-align: left; cursor: pointer; }
        .shc-summary .shc-cc-list button:hover { background: rgba(163,186,211,.25); color: #f7f8f8; }
        .shc-summary .shc-cc-list button.on { color: #def3ff; }
        .shc-cc-list button .flag { font-size: .95em; line-height: 1; }
        .game_lowest_price { word-break: break-word; font-size: 12px; color: #acf; margin-top: 5px; display: block; width: 100%; box-sizing: border-box; padding-left: 5px; }
        .game_lowest_price .shc-mobile-lowline, .game_lowest_price .shc-mobile-currentline { display: block; }
        .game_lowest_price .shc-discount { color: #a5cb00; font-weight: bold; }
        .game_lowest_price.at-low { color: #e74c3c; font-weight: bold; }
        .game_lowest_price.at-low .shc-discount { color: #e74c3c; }
        .game_lowest_price.side { width: auto; min-width: 0; max-width: 340px; flex: 0 1 auto; display: block; padding-left: 5px;
            text-align: left; margin: 0 clamp(6px, 1vw, 14px) 0 0; line-height: 1.5; }
        .shc-summary {
            display: flex; align-items: center; flex-wrap: wrap;
            box-sizing: border-box; width: 100%; min-width: 0;
            gap: clamp(6px, 1.1vw, 12px);
            margin: 6px 0 12px; padding: 6px clamp(8px, 1.4vw, 12px);
            background: #132434;
            border: 1px solid rgba(255,255,255,.08); border-radius: 4px;
            font-size: clamp(11px, .95vw + 5px, 13px); color: #acb2b8; font-family: 'Motiva Sans', Arial, sans-serif;
            -webkit-user-select: text; user-select: text;
        }
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
        #shc-sale-countdown { font-size: .82em; white-space: nowrap; line-height: 1.25; }
       #shc-sale-countdown .shc-cd-date { color: #66c0f4; }
        #shc-sale-countdown .shc-cd-state, #shc-sale-countdown .shc-cd-unit { color: #8b929a; }
        #shc-sale-countdown .shc-cd-num { color: #8b5cf6; }
        #wishlist-progress {
    position: fixed;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 24px);
    right: 15px;
    z-index: 9999;
    box-sizing: border-box;
    max-width: min(440px, 42vw);
    min-height: 28px;
    background: rgba(23,29,37,.70);
    border: 1px solid rgba(255,255,255,.12);
    border-radius: 5px;
    cursor: pointer;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 4px 9px;
    font-size: 11px;
    line-height: 1.35;
    color: #acb2b8;
    display: none;
    box-shadow: 0 4px 14px rgba(0,0,0,.25);
}
#wishlist-progress.show {
    display: flex;
}
        #wishlist-progress:hover { background: rgba(23,29,37,.88); border-color: rgba(255,255,255,.24); }
        #wishlist-progress .wishlist-progress-icon { display: inline-block; flex: 0 0 auto; }
        #wishlist-progress .wishlist-progress-text { min-width: 0; }
        #wishlist-progress.loading .wishlist-progress-icon { animation: shc-funnel-spin 2s linear infinite; }
        @keyframes shc-funnel-spin { to { transform: rotate(360deg); } }

        .shc-mobile .shc-summary { margin: 4px 0 10px; }
        .shc-mobile .shc-summary button { min-height: 30px; padding: 0 12px; font-size: 14px; }
        .shc-mobile .shc-summary .shc-cc-btn { min-height: 22px; font-size: 12px; padding: 1px 7px; }
        .shc-mobile .shc-summary .shc-cc-list button { min-height: 30px; font-size: 14px; padding: 0 10px; }
        .shc-mobile #shc-sale-countdown { font-size: 10px; }
        .shc-mobile #wishlist-progress { left: auto; right: calc(env(safe-area-inset-right, 0px) + 12px);
            bottom: calc(env(safe-area-inset-bottom, 0px) + 56px); max-width: 92vw; min-height: 30px;
            padding: 5px 12px; font-size: 12px; }
        .shc-mobile .game_lowest_price.compact { margin-top: 2px; line-height: 1.4; }
        .shc-mobile .game_lowest_price.compact .shc-mobile-lowline,
        .shc-mobile .game_lowest_price.compact .shc-mobile-currentline { display: block; line-height: inherit; }
        .shc-mobile .game_lowest_price.compact .shc-mobile-lowline { white-space: nowrap; }
    `);
    initWishlist();
})();
