// ==UserScript==
// @name        Steam愿望单增强（Steam Wishlist Enhancer）
// @namespace   https://github.com/beerleexc
// @description Steam 愿望单增强 一个仅作用于 Steam 愿望单页面的用户脚本，用来在愿望单里直接查看多地区价格、历史最低价、愿望单游戏金额总和，史低价格总和的脚本。 Regional prices, historical lows, totals, and seasonal sale countdowns for Steam wishlists
// @author      beerlee
// @license     MIT
// @version     1.5.0
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
// @connect     partner.steamgames.com
// @run-at      document-end
// ==/UserScript==
(function () {
    "use strict";
    if (document.documentElement.dataset.shcWishlistActive) return;
    document.documentElement.dataset.shcWishlistActive = "1";
    const UI_LANGUAGE = (document.documentElement.lang || navigator.language || "zh-CN").toLowerCase();
    const IS_ZH = UI_LANGUAGE.startsWith("zh");
    const T = ({
        zh: {
            switchRegion: "切换查询地区", networkError: "网络错误", requestTimeout: "请求超时",
            winter: "❄️ 冬季特卖", spring: "🌱 春季特卖", summer: "☀️ 夏季特卖", autumn: "🍂 秋季特卖",
            empty: "📊 愿望单为空", ratesMissing: "⚠ 汇率获取失败，暂无法折算人民币",
            lowTotal: "史低合计", currentTotal: "当前合计", lowest: "史低", current: "当前", regionLocked: "锁区",
            saveAtLow: value => `等史低可省 ${value}`, atLow: n => `${n} 项史低中`,
            includes: value => `含 ${value} 报价`, noLow: n => `⚠ ${n} 项无数据`,
            missing: n => `${n} 项暂无数据`,
            loaded: n => `已加载 ${n} 项`, backToTop: "返回顶部", backToTopTitle: "点击返回页面顶部",
            startsIn: "距开始", endsIn: "距结束", days: " 天 ", hours: " 时 ", minutes: " 分",
            native: value => `（${value}）`,
            saleTitle: (sale, start, end) => `${sale.label} 太平洋时间 ${formatSaleDate(start)} 开幕 — ${formatSaleDate(end)} 收摊｜北京 ${new Date(start).toLocaleString("zh-CN")} — ${new Date(end).toLocaleString("zh-CN")}`
        },
        en: {
            switchRegion: "Switch region", networkError: "Network error", requestTimeout: "Request timed out",
            winter: "❄️ Winter Sale", spring: "🌱 Spring Sale", summer: "☀️ Summer Sale", autumn: "🍂 Autumn Sale",
            empty: "📊 Wishlist is empty", ratesMissing: "⚠ Exchange rates unavailable; CNY conversion is disabled",
            lowTotal: "Historical low total", currentTotal: "Current total", lowest: "Low ", current: "Current ", regionLocked: "Region locked",
            saveAtLow: value => `Save ${value} at historical lows`, atLow: n => `${n} at historical low`,
            includes: value => `Includes ${value} prices`, noLow: n => `⚠ No data for ${n} ${n === 1 ? "item" : "items"}`,
            missing: n => `${n} items unavailable`,
            loaded: n => `${n} loaded`, backToTop: "Back to top", backToTopTitle: "Back to top",
            startsIn: "Starts in", endsIn: "Ends in", days: " d ", hours: " h ", minutes: " m",
            native: value => ` (${value})`,
            saleTitle: (sale, start, end) => `${sale.label} | PT: ${formatSaleDate(start)} — ${formatSaleDate(end)} | Local: ${new Date(start).toLocaleString("en-US")} — ${new Date(end).toLocaleString("en-US")}`
        }
    })[IS_ZH ? "zh" : "en"];
    const COUNTRIES = {
        cn: { name: IS_ZH ? "🇨🇳 中国" : "🇨🇳 China", currency: "CNY", lowSource: "augmented" },
        us: { name: IS_ZH ? "🇺🇸 美国" : "🇺🇸 United States", currency: "USD", lowSource: "augmented" },
        in: { name: IS_ZH ? "🇮🇳 印度" : "🇮🇳 India", currency: "INR", lowSource: "augmented" },
        id: { name: IS_ZH ? "🇮🇩 印尼" : "🇮🇩 Indonesia", currency: "IDR", lowSource: "augmented" },
        jp: { name: IS_ZH ? "🇯🇵 日本" : "🇯🇵 Japan", currency: "JPY", lowSource: "augmented" },
        ua: { name: IS_ZH ? "🇺🇦 乌克兰" : "🇺🇦 Ukraine", currency: "UAH", lowSource: "xiaoheihe" },
        ru: { name: IS_ZH ? "🇷🇺 俄罗斯" : "🇷🇺 Russia", currency: "RUB", lowSource: "xiaoheihe" },
        az: { name: IS_ZH ? "🇦🇿 独联体" : "🇦🇿 CIS", currency: "USD", lowSource: "xiaoheihe" },
        ar: { name: IS_ZH ? "🇦🇷 阿根廷" : "🇦🇷 Argentina", currency: "USD", lowSource: "xiaoheihe" },
        tr: { name: IS_ZH ? "🇹🇷 土耳其" : "🇹🇷 Türkiye", currency: "USD", lowSource: "xiaoheihe" }
    };
    const COUNTRY_CODES = new Set(Object.keys(COUNTRIES).map(c => c.toUpperCase()));
    const CURRENCY_TABLE = [
        [ /руб|₽/, "RUB", "₽" ], [ /^Rp/, "IDR", "Rp" ], [ /₺/, "TRY", "₺" ],
        [ /₹/, "INR", "₹" ], [ /₴/, "UAH", "₴" ], [ /\$/, "USD", "$" ]
    ];
    const CURRENCY_SYMBOLS = { CNY: "¥", JPY: "¥", ...Object.fromEntries(CURRENCY_TABLE.map(([ , code, sym ]) => [ code, sym ])) };
    const ZERO_DECIMAL = new Set([ "JPY", "IDR" ]);
    const STORE_VERSION = "v10";
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
                onerror: () => reject(new Error(T.networkError)),
                ontimeout: () => reject(new Error(T.requestTimeout))
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
    const CNY_FORMAT = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formatCNY = v => "¥" + CNY_FORMAT.format(v || 0);
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
            subs: [],
            bundles: [],
            voucher: true,
            shops: [ 61 ]
        }).then(d => d.prices || {});
    }
    const STEAM_GETITEMS = "https://api.steampowered.com/IStoreBrowseService/GetItems/v1/";
    function fetchSteamRegionPrices(chunk, country, checkLocks = true) {
        const ids = chunk.app.map(appid => ({ appid }));
        if (!ids.length) return Promise.resolve({});
        const input = {
            ids: ids,
            context: { language: "schinese", country_code: country.toUpperCase() },
            data_request: { include_basic_info: false, include_all_purchase_options: false, include_release: true }
        };
        return getJSON({
            url: STEAM_GETITEMS + "?input_json=" + encodeURIComponent(JSON.stringify(input)),
            headers: { Accept: "application/json" }
        }).then(async d => {
            const out = {};
            const pending = new Set;
            ((d.response || {}).store_items || []).forEach(it => {
                if (it.item_type !== 0) return;
                const key = `app/${it.id}`;
                const po = it.best_purchase_option;
                const noPurchase = !po || po.final_price_in_cents == null;
                if (it.is_free || noPurchase) {
                    out[key] = { noPrice: true };
                    if (noPurchase && !it.is_free && !it.is_coming_soon) pending.add(key);
                    return;
                }
                const hit = CURRENCY_TABLE.find(h => h[0].test(po.formatted_final_price || ""));
                const unit = hit ? hit[1] : COUNTRIES[country].currency;
                out[key] = {
                    price: { amount: Number(po.final_price_in_cents) / 100, currency: unit },
                    cut: Number(po.discount_pct) > 0 ? Number(po.discount_pct) : 0,
                    regularCents: Number(po.original_price_in_cents ?? po.final_price_in_cents),
                    preorder: !!it.is_coming_soon
                };
            });
            if (checkLocks && pending.size) {
                const otherChunk = { app: [ ...pending ].map(key => Number(key.split("/")[1])) };
                const others = Object.keys(COUNTRIES).filter(c => c !== country);
                const results = await Promise.all(others.map(c => fetchSteamRegionPrices(otherChunk, c, false)));
                results.forEach(otherPrices => {
                    if (!otherPrices) return;
                    pending.forEach(key => {
                        const info = otherPrices[key];
                        if (info && info.price && info.price.amount > 0) out[key] = { regionLocked: true };
                    });
                });
            }
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
            if (!merged[key] || !merged[key].current) continue;
            const current = merged[key].current;
            const prev = prices[key];
            if (prev && prev.lowest && Date.now() - (prev.lowAt || 0) < XHH_LOW_TTL) {
                merged[key].lowest = prev.lowest;
                merged[key].lowAt = prev.lowAt;
                continue;
            }
            await sleep(XHH_GAP);
            const low = await fetchXhhLowest(appid, country);
            if (gen !== generation) return;
            if (low && (country === "az" || country === "tr" || country === "ar")) {
                // 小黑盒对这些地区的价格有取整，用 Steam 原价与史低折扣按 Steam 规则重算。
                const cents = Math.floor(current.regularCents * (100 - low.cut) / 100);
                const exact = cents / 100;
                if (low.cut > 0 && cents > 0 && low.price.currency === current.price.currency
                    && Math.abs(exact - low.price.amount) <= 0.1) low.price.amount = exact;
            }
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
            delete entry.noPrice;
            if (steam[key].noPrice) {
                entry.noPrice = true;
                delete entry.current;
                delete entry.lowest;
                delete entry.regionLocked;
                return;
            }
            if (steam[key].regionLocked) {
                entry.regionLocked = true;
                delete entry.current;
                delete entry.lowest;
                return;
            }
            delete entry.regionLocked;
            entry.current = steam[key];
            const current = entry.current;
            const lowest = entry.lowest;
            if (current.preorder && (!lowest || !lowest.price || (lowest.price.currency === current.price.currency && current.price.amount < lowest.price.amount))) {
                entry.lowest = { ...current };
            }
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
        select.title = T.switchRegion;
        select.setAttribute("aria-label", T.switchRegion);
        Object.keys(COUNTRIES).forEach(code => {
            const option = document.createElement("option");
            option.value = code;
            option.textContent = COUNTRIES[code].name;
            select.appendChild(option);
        });
        wrap.append(btn, select);
        const flagOf = code => (COUNTRIES[code].name.match(/^\S+/) || [ "" ])[0];
        const labelOf = code => COUNTRIES[code].name.replace(/^\S+\s*/, "");
        const paint = () => {
            btn.innerHTML = `<i class="flag">${flagOf(currentCountry)}</i><span class="name">${labelOf(currentCountry)}</span><i class="caret">▾</i>`;
            select.value = currentCountry;
        };
        select.addEventListener("change", () => {
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
    const OWN_SELECTOR = "#shc-wishlist-summary, #shc-country-controls, #shc-wishlist-progress, .shc-price";
    const PRICE_KEY = "steamHistoryPrices";
    const PRICE_TTL = 30 * 60 * 1e3;
    const PRICE_KEEP = 24 * 60 * 60 * 1e3;
    const AUTO_QUEUE_LIMIT = 100;
    const wishlistIds = new Map;
    const pendingIds = new Map;
    const doneIds = new Set;
    const fetchedKeys = new Set;
    const failCount = new Map;
    const observedRows = new WeakSet;
    const visibleRows = new Set;
    const mobileFits = new Map;
    let fitObserver = null;
    let fitQueued = false;
    function runMobileFits() {
        if (fitQueued) return;
        fitQueued = true;
        requestAnimationFrame(() => {
            fitQueued = false;
            mobileFits.forEach((fit, row) => {
                if (!row.isConnected || !fit.el.isConnected) {
                    mobileFits.delete(row);
                    return;
                }
                if (visibleRows.has(row)) fit.apply();
            });
        });
    }
    function trackMobileFit(row, el, apply) {
        mobileFits.set(row, { el: el, apply: apply });
        if (typeof ResizeObserver === "function") {
            if (!fitObserver) fitObserver = new ResizeObserver(entries => entries.forEach(entry => {
                const rowEl = entry.target;
                const fit = mobileFits.get(rowEl);
                if (!rowEl.isConnected || !fit || !fit.el.isConnected) {
                    mobileFits.delete(rowEl);
                    fitObserver.unobserve(rowEl);
                    return;
                }
                fit.apply();
            }));
            fitObserver.observe(row);
        }
    }
    let priceBuckets = store.read(PRICE_KEY, null) || {};
    Object.keys(priceBuckets).forEach(code => {
        if (!COUNTRY_CODES.has(code)) delete priceBuckets[code];
    });
    let prices = {};
    let expectedCount = 0;
    let serverWishlistLoaded = false;
    let collecting = 0;
    let draining = false;
    let generation = 0;
    let dataVersion = 0;
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
        dataVersion++;
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
        const m = String(href || "").match(/app\/(\d+)/);
        return m ? { key: `app/${m[1]}`, id: m[1] } : null;
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
            return [ ...ids ].map(id => ({ key: `app/${id}`, id: id }));
        } catch {
            return null;
        }
    }
    // 当前页面是不是“自己的”愿望单：用户 ID 取自页面内嵌的 valve-ssr-data，归属取自地址栏或 loaderData
    function isOwnWishlist() {
        let data = null;
        try {
            const node = document.getElementById("valve-ssr-data");
            data = node ? JSON.parse(node.textContent || "{}") : null;
        } catch {
            return false;
        }
        const viewer = String(data && data.UserConfig && data.UserConfig.steamid || "");
        if (!viewer || viewer === "0") return false;
        const inUrl = decodeURIComponent(location.pathname).match(/\/wishlist\/profiles\/(\d+)/);
        if (inUrl) return inUrl[1] === viewer;
        const loader = Array.isArray(data.loaderData) ? data.loaderData : [];
        const owner = (loader[1] && loader[1].steamid) || (loader.find(item => item && item.steamid) || {}).steamid;
        return !!owner && String(owner) === viewer;
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
        let best = null, bestScore = -Infinity, bestCount = -1, bestLength = Infinity;
        const consider = node => {
            if (node.closest(OWN_SELECTOR)) return;
            const text = String(node.textContent || "").replace(/\s+/g, " ").trim();
            if (!text || text.length > 160) return;
            const count = readCountFromText(text);
            if (count == null) return;
            const identity = `${node.id || ""} ${typeof node.className === "string" ? node.className : ""}`.toLowerCase();
            if (COUNT_IDENTITY_SKIP.test(identity)) return;
            const score = (COUNT_WISHLIST_LABEL.test(`${identity} ${text}`) ? 1e3 : 0) + (COUNT_TOTAL_LABEL.test(text) ? 100 : 0) + (node.children.length === 0 ? 10 : 0) - text.length / 1e3;
            if (score > bestScore || score === bestScore && count > bestCount || score === bestScore && count === bestCount && text.length < bestLength) {
                best = node;
                bestScore = score;
                bestCount = count;
                bestLength = text.length;
            }
        };
        consider(scope);
        textOwners(scope, consider);
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
        let size = wishlistIds.size, stagnant = 0, exhausted = false;
        programmaticScroll = true;
        try {
            // 采集期间停在底部跟随新内容，结束后一次性回到原位：不再每轮“底↔顶”往返，避免整页上下闪
            while (wishlistIds.size < expectedCount && Date.now() < deadline) {
                if (Date.now() - lastUserScrollAt < 1500) break;
                scroller.scrollTop = scroller.scrollHeight;
                await sleep(loadWait);
                syncRows();
                if (wishlistIds.size === size) {
                    if (++stagnant >= maxStagnant) {
                        exhausted = true;
                        break;
                    }
                } else {
                    stagnant = 0;
                    size = wishlistIds.size;
                }
                updateCollectionProgress();
            }
            return exhausted;
        } finally {
            scroller.scrollTop = startPos;
            programmaticScroll = false;
        }
    }
    function syncRows() {
        harvest(document);
        observeRows();
        queuePrices();
    }
    function queuePrices() {
        if (wishlistIds.size > AUTO_QUEUE_LIMIT) {
            visibleRows.forEach(row => {
                const r = rowRef(row);
                if (!r || doneIds.has(r.key) || pendingIds.has(r.key)) return;
                const item = wishlistIds.get(r.key);
                if (item) pendingIds.set(r.key, item);
            });
        } else wishlistIds.forEach((item, key) => {
            if (doneIds.has(key) || pendingIds.has(key)) return;
            pendingIds.set(key, item);
        });
        drainPrices();
    }
    function takeChunk() {
        const chunk = { app: [] };
        let n = 0;
        const take = key => {
            if (n >= CHUNK_SIZE) return;
            const item = pendingIds.get(key);
            if (!item) return;
            pendingIds.delete(key);
            doneIds.add(key);
            chunk.app.push(Number(item.id));
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
                const [ augRaw, steam ] = await Promise.all([
                    useAug ? fetchPrices(chunk, country).catch(() => null) : Promise.resolve({}),
                    fetchSteamRegionPrices(chunk, country)
                ]);
                if (gen !== generation) continue;
                const ok = steam !== null;
                const aug = augRaw || {};
                mergeRegionPrices(aug, steam);
                if (source === "xiaoheihe") await attachXhhLows(chunk, country, aug, gen);
                if (gen !== generation) continue;
                const keys = chunk.app.map(id => `app/${id}`);
                if (ok) keys.forEach(key => fetchedKeys.add(key));
                else keys.forEach(key => {
                    const tries = (failCount.get(key) || 0) + 1;
                    failCount.set(key, tries);
                    if (tries >= 2) return;
                    doneIds.delete(key);
                    const item = wishlistIds.get(key);
                    if (item) pendingIds.set(key, item);
                });
                const now = Date.now();
                Object.keys(aug).forEach(key => {
                    aug[key].savedAt = now;
                });
                Object.assign(prices, aug);
                dataVersion++;
                savePriceCache();
                paintVisibleRows();
                scheduleSummary();
            }
        } finally {
            draining = false;
            updateCollectionProgress();
        }
    }
    let sumCache = null;
    function summarize() {
        const sig = `${dataVersion}|${wishlistIds.size}|${fetchedKeys.size}|${fxLive ? 1 : 0}${fxTried ? 1 : 0}`;
        if (sumCache && sumCache.sig === sig) return sumCache.value;
        let counted = 0, noLow = 0, atLow = 0, missing = 0;
        let lowSum = 0, curSum = 0, saveSum = 0;
        const currencies = new Set;
        const lowNative = {}, curNative = {};
        wishlistIds.forEach((_, key) => {
            const info = prices[key];
            if (info && info.noPrice) return;
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
        });
        const value = {
            total: wishlistIds.size,
            counted: counted,
            noLow: noLow,
            missing: missing,
            ratesMissing: !fxLive && fxTried,
            atLow: atLow,
            lowSum: lowSum,
            curSum: curSum,
            save: saveSum,
            currencies: [ ...currencies ],
            lowNative: lowNative,
            curNative: curNative
        };
        sumCache = { sig: sig, value: value };
        return value;
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
        if (!scroller) return false;
        if (box.parentElement !== scroller || scroller.firstElementChild !== box) scroller.insertBefore(box, scroller.firstChild);
        return true;
    }
    let barNode = null;
    function getSummaryBox() {
        const host = rowsHost();
        let box = barNode && barNode.isConnected ? barNode : document.getElementById("shc-wishlist-summary");
        if (box) {
            document.querySelectorAll("#shc-wishlist-summary").forEach(b => {
                if (b !== box) b.remove();
            });
            insertSummary(box, host);
        } else {
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
        }
        barNode = box;
        return box;
    }
    const scheduleSummary = debounce(renderSummary, 200);
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
    let barSurfaceRow = null;
    function syncBarSurface(box) {
        const row = document.querySelector(ROW_SELECTOR);
        if (!row || row === barSurfaceRow) return;
        barSurfaceRow = row;
        const cs = getComputedStyle(row);
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
    const SALE_URL = "https://partner.steamgames.com/doc/marketing/upcoming_events?l=schinese";
    const SALE_KEY = `steamHistorySalesV6_${IS_ZH ? "zh" : "en"}`;
    const SALE_TTL = 6 * 60 * 60 * 1e3;
    const SALE_FAIL_TTL = 60 * 60 * 1e3;
    const SEASON_LABELS = { "冬季": T.winter, "春季": T.spring, "夏日": T.summer, "夏季": T.summer, "秋季": T.autumn };
    const PT_FORMAT = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
    });
    function pacificSaleMs(year, month, day) {
        const utc = Date.UTC(year, month - 1, day, 10);
        const parts = {};
        PT_FORMAT.formatToParts(utc).forEach(part => parts[part.type] = part.value);
        const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
        return utc + utc - localAsUtc;
    }
    function salesFromSteamworks(html) {
        const out = [];
        let doc;
        try {
            doc = (new DOMParser).parseFromString(html || "", "text/html");
        } catch {
            return out;
        }
        doc.querySelectorAll(".documentation_bbcode h2.bb_subsection").forEach(heading => {
            const title = heading.querySelector("strong");
            const season = title && (title.textContent || "").match(/(冬季|春季|夏日|夏季|秋季)特卖/);
            if (!season) return;
            const m = (heading.textContent || "").replace(/\s+/g, " ").match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*[-—–]\s*(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
            if (!m) return;
            const endMs = pacificSaleMs(+m[4] || +m[1], +m[5], +m[6]);
            if (endMs <= Date.now()) return;
            out.push({
                label: SEASON_LABELS[season[1]],
                startMs: pacificSaleMs(+m[1], +m[2], +m[3]),
                endMs: endMs
            });
        });
        return out;
    }
    function cachedSales() {
        const hit = store.read(SALE_KEY, v => v && v.ok ? SALE_TTL : SALE_FAIL_TTL);
        return hit && Array.isArray(hit.sales) ? hit.sales.filter(s => s.endMs > Date.now()) : [];
    }
    function loadSales() {
        const cached = cachedSales();
        if (cached.length) return Promise.resolve(cached);
        const finish = (sales, ok) => {
            store.write(SALE_KEY, { sales: sales, ok: ok });
            return sales;
        };
        return request({ url: SALE_URL }).then(html => finish(salesFromSteamworks(html), true)).catch(() => finish([], false));
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
    const EN_SALE_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    function formatSaleDate(ms) {
        const d = new Date(ms);
        return IS_ZH ? `${d.getUTCMonth() + 1}月${d.getUTCDate()}日` : EN_SALE_DATE.format(d);
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
        add("shc-cd-date", `${formatSaleDate(sale.startMs)} — ${formatSaleDate(sale.endMs)} `);
        cdNodes = { state: add("shc-cd-state", saleIsLive(sale, now) ? T.endsIn : T.startsIn) };
        countdownEl.appendChild(document.createTextNode(" "));
        cdNodes.days = num();
        add("shc-cd-unit", T.days);
        cdNodes.hours = num();
        add("shc-cd-unit", T.hours);
        cdNodes.mins = num();
        add("shc-cd-unit", T.minutes);
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
        writeText(cdNodes.state, live ? T.endsIn : T.startsIn);
        writeText(cdNodes.days, String(Math.floor(left / 1440)));
        writeText(cdNodes.hours, String(Math.floor(left % 1440 / 60)));
        writeText(cdNodes.mins, String(left % 60));
        const title = T.saleTitle(sale, sale.startMs, sale.endMs);
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
            writeIfChanged(body, `<span class="dim">${T.empty}</span>`);
            if (!collecting) revealBar(box);
            updateCollectionProgress();
            return;
        }
        const noLowAtAll = s.counted > 0 && s.noLow === s.counted;
        const nativeText = map => {
            const keys = Object.keys(map).filter(c => c !== "CNY" && map[c] > 0);
            return keys.length === 1 ? T.native(formatPrice(map[keys[0]], keys[0])) : "";
        };
        const parts = s.ratesMissing ? [ `<span class="warn">${T.ratesMissing}</span>` ] : [ `<span class="label">${T.lowTotal}</span><span class="main">${noLowAtAll ? "—" : formatCNY(s.lowSum) + nativeText(s.lowNative)}</span>`, `<span class="dim">${T.currentTotal}</span><span class="cur">${formatCNY(s.curSum) + nativeText(s.curNative)}</span>` ];
        if (!s.ratesMissing && s.save > .005) parts.push(`<span class="save">${T.saveAtLow(formatCNY(s.save))}</span>`);
        const nonCNY = s.currencies.filter(c => c !== "CNY");
        if (nonCNY.length && s.currencies.length > 1) parts.push(`<span class="dim">${T.includes(nonCNY.join("/"))}</span>`);
        if (s.noLow) parts.push(`<span class="warn">${T.noLow(s.noLow)}</span>`);
        if (s.missing) parts.push(`<span class="warn">${T.missing(s.missing)}</span>`);
        writeIfChanged(body, (s.atLow > 0 ? `<span class="dim">${T.atLow(s.atLow)}</span>` : "") + parts.join(""));
        if (!collecting) revealBar(box);
        updateCollectionProgress();
    }
    function updateCollectionProgress() {
        let loaded = 0;
        for (const key of wishlistIds.keys()) if (hasAnyPrice(prices[key])) loaded++;
        if (!loaded) return hideProgress();
        // 有采集/请求队列时转圈，队列跑空（滑动停下、抓完）立刻恢复“返回顶部”
        const busy = !!(collecting || draining || pendingIds.size > 0);
        setProgress(busy ? T.loaded(loaded) : T.backToTop, busy);
    }
    async function startCollection() {
        const run = generation;
        collecting++;
        serverWishlistLoaded = false;
        try {
            syncRows();
            renderSummary();
            const serverRequest = fetchWishlistItems();
            const serverItems = await serverRequest;
            if (run !== generation) return;
            if (serverItems) {
                const serverKeys = new Set(serverItems.map(item => item.key));
                // 自己的愿望单：服务器列表就是权威数据，不再用 DOM 采到的 appid 做子集校验
                if (isOwnWishlist() || [ ...wishlistIds.keys() ].every(key => serverKeys.has(key))) {
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
                const exhausted = await harvestByScroll();
                if (exhausted && !serverWishlistLoaded) expectedCount = wishlistIds.size;
            }
        } finally {
            collecting = Math.max(0, collecting - 1);
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
    function textOwners(scope, fn) {
        const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
        const seen = new Set;
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (!node.nodeValue.trim()) continue;
            const el = node.parentElement;
            if (el && !seen.has(el)) {
                seen.add(el);
                fn(el);
            }
        }
    }
    function findPriceLeaf(scope, bottomSide) {
        const rect = scope.getBoundingClientRect();
        const minLeft = rect.left + rect.width * .4;
        let best = null, mark = bottomSide ? -Infinity : Infinity;
        textOwners(scope, node => {
            if (bottomSide ? node.children.length : node.closest(".shc-price")) return;
            if (!isPriceText(node.textContent)) return;
            if (!bottomSide) for (const child of node.children) if (isPriceText(child.textContent)) return;
            const r = node.getBoundingClientRect();
            if (!r.width || !r.height) return;
            if (bottomSide) {
                if (r.bottom > mark) {
                    best = node;
                    mark = r.bottom;
                }
            } else if (r.left >= minLeft && r.left < mark) {
                best = node;
                mark = r.left;
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
        return findPriceLeaf(item, true);
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
    function insertPriceLine(row, link, info, state) {
        const el = createPriceElement(info, state);
        el.dataset.sig = state === "price" ? priceSignature(info) : state;
        const anchor = titleLinkOf(row, link);
        const host = rowHost(row, anchor);
        const leaf = findPriceLeaf(row, false);
        const item = leaf && priceRowItem(row, leaf);
        if (isMobileUI()) {
            const card = cardGridOf(row, leaf || item || anchor);
            if (card) {
                const native = [ ...card.children ].find(n => /purchase/.test(getComputedStyle(n).gridArea));
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
                trackMobileFit(row, el, applyInline);
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
    function createPriceElement(info, state) {
        const div = document.createElement("div");
        const compact = isMobileUI() ? " compact" : "";
        if (state === "locked") {
            div.className = `shc-price locked${compact}`;
            div.textContent = T.regionLocked;
            return div;
        }
        const atLow = isAtHistoricalLow(info.lowest, info.current);
        div.className = `shc-price${compact}${atLow ? " at-low" : ""}`;
        const line = (cls, label, entry) => {
            if (!entry || !entry.price) return "";
            const cut = Number(entry.cut) > 0 ? `-${entry.cut}%` : "";
            return `<span class="${cls}">${label}${formatPrice(entry.price.amount, entry.price.currency)}` + `${cut ? ` <span class="shc-discount">${cut}</span>` : ""}</span>`;
        };
        div.innerHTML = line("shc-mobile-lowline", T.lowest, info.lowest) + line("shc-mobile-currentline", T.current, info.current);
        return div;
    }
    function priceSignature(info) {
        const part = entry => entry && entry.price ? `${entry.price.amount}|${entry.price.currency}|${entry.cut || 0}` : "";
        return `${part(info.lowest)}|${part(info.current)}`;
    }
    function rowState(info) {
        if (!info || info.noPrice) return "";
        if (info.regionLocked) return "locked";
        return hasAnyPrice(info) ? "price" : "";
    }
    function paintRow(row) {
        if (!row.isConnected) {
            visibleRows.delete(row);
            return;
        }
        const link = rowLink(row);
        const r = link && keyOfHref(link.href);
        if (!r) return;
        const info = prices[r.key];
        const state = rowState(info);
        const existing = row.querySelector(".shc-price");
        if (!state) {
            if (existing) existing.remove();
            return;
        }
        const sig = state === "price" ? priceSignature(info) : state;
        if (existing && existing.dataset.sig === sig) return;
        if (existing) {
            mobileFits.delete(row);
            existing.remove();
        }
        insertPriceLine(row, link, info, state);
    }
    let paintQueued = false;
    function paintVisibleRows() {
        if (paintQueued) return;
        paintQueued = true;
        requestAnimationFrame(() => {
            paintQueued = false;
            visibleRows.forEach(row => paintRow(row));
        });
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
        const label = div.querySelector(".shc-wishlist-progress-text");
        if (label && label.textContent !== text) label.textContent = text;
        div.classList.toggle("loading", loading);
        div.classList.add("show");
    }
    function hideProgress() {
        getProgressDiv(false)?.classList.remove("show");
    }
    function scrollWishlistToTop() {
        const options = { top: 0, behavior: "smooth" };
        const host = scrollHostOf(document.querySelector(ROW_SELECTOR));
        if (host) {
            if (typeof host.scrollTo === "function") host.scrollTo(options);
            else host.scrollTop = 0;
        }
        window.scrollTo(options);
    }
    function getProgressDiv(create = true) {
        const all = document.querySelectorAll("#shc-wishlist-progress");
        if (all.length) {
            all.forEach((el, i) => {
                if (i) el.remove();
            });
            return all[0];
        }
        if (!create) return null;
        const div = document.createElement("div");
        div.id = "shc-wishlist-progress";
        div.title = T.backToTopTitle;
        div.setAttribute("role", "button");
        div.tabIndex = 0;
        const icon = document.createElement("span");
        icon.className = "shc-wishlist-progress-icon";
        icon.textContent = "⏳";
        const label = document.createElement("span");
        label.className = "shc-wishlist-progress-text";
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
        failCount.clear();
        expectedCount = 0;
        serverWishlistLoaded = false;
        loadPriceCache();
        mobileFits.clear();
        document.querySelectorAll(".shc-price").forEach(e => e.remove());
        paintVisibleRows();
        startCollection();
    }
    let lastMobile = null;
    const scheduleHarvest = debounce(() => {
        syncRows();
        refreshExpected();
        paintVisibleRows();
        scheduleSummary();
    }, 250);
    function applyViewportMode() {
        const mobile = isMobileUI();
        document.documentElement.classList.toggle("shc-mobile", mobile);
        const previous = lastMobile;
        lastMobile = mobile;
        if (previous === null || mobile === previous) return;
        mobileFits.clear();
        document.querySelectorAll(".shc-price").forEach(e => e.remove());
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
    function initWishlist(retry = 0) {
        if (document.querySelectorAll(ROW_SELECTOR).length === 0) {
            if (retry < 20) setTimeout(() => initWishlist(retry + 1), 500);
            return;
        }
        if (!countryControls) {
            countryControls = document.createElement("div");
            countryControls.id = "shc-country-controls";
            countdownEl = document.createElement("span");
            countdownEl.id = "shc-sale-countdown";
            countdownEl.style.display = "none";
            countryControls.append(countdownEl, createCountryControl(resetAndReload));
            document.body.appendChild(countryControls);
        }
        loadPriceCache();
        applyViewportMode();
        window.addEventListener("resize", debounce(applyViewportMode, 250));
        ensureRates().then(scheduleSummary);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(runMobileFits);
        startCollection();
        startCountdown();
        new MutationObserver(records => {
            if (barNode && barNode.dataset.ready === "1" && !barNode.isConnected) insertSummary(barNode, rowsHost());
            if (records.some(r => r.type === "childList" && !isOwnRecord(r))) scheduleHarvest();
            if (mobileFits.size) runMobileFits();
        }).observe(document.body, { childList: true, characterData: true, subtree: true });
    }
    GM_addStyle(`
        .shc-cc { position: relative; display: inline-flex; }
        .shc-cc-btn { display: inline-flex; align-items: center; gap: 3px;
            background: rgba(163,186,211,.2); color: #fff; border-radius: 1.5px;
            padding: 1.5px 6.5px; min-height: 18px; font-size: 12px; line-height: 1.25; }
        .shc-cc:hover .shc-cc-btn { background: rgba(102,192,244,.45); }
        .shc-cc-btn .flag { font-size: .95em; line-height: 1; }
        .shc-cc-btn .caret { font-size: .68em; opacity: .6; }
        .shc-cc select { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; padding: 0;
            border: 0; opacity: 0; appearance: none; -webkit-appearance: none; cursor: pointer; }
        .shc-price { word-break: break-word; font-size: 11px; color: #ddd; margin-top: 5px; display: block; width: 100%; box-sizing: border-box; padding-left: 5px; }
        .shc-price .shc-mobile-lowline, .shc-price .shc-mobile-currentline { display: block; }
        .shc-price .shc-discount { color: #a5cb00; font-weight: bold; }
        .shc-price.at-low { color: #4a9eff; font-weight: bold; }
        .shc-price.at-low .shc-discount { color: #4a9eff; }
        .shc-price.locked { color: #e74c3c; font-weight: bold; }
        .shc-price.side { width: auto; min-width: 0; max-width: 340px; flex: 0 1 auto;
            text-align: left; margin: 0 clamp(6px, 1vw, 14px) 0 0; line-height: 1.5; }
        .shc-summary { display: flex; align-items: center; flex-wrap: wrap;
            box-sizing: border-box; width: 100%; min-width: 0; gap: clamp(6px, 1.1vw, 12px);
            margin: 6px 0 12px; padding: 10.5px clamp(8px, 1.4vw, 12px);
            background: #132434; border: 1px solid rgba(255,255,255,.08); border-radius: 4px;
            font-size: 12px; color: #acb2b8; font-family: 'Motiva Sans', Arial, sans-serif;
            -webkit-user-select: text; user-select: text; position: sticky; top: 0; z-index: 900; }
        .shc-summary .label, .shc-summary .dim,
        .shc-summary .save, .shc-summary .warn { font-size: .9em; }
        .shc-summary .label, .shc-summary .dim { color: #8b929a; }
        .shc-summary .main { color: #66c0f4; }
        .shc-summary .cur { color: #fff; }
        .shc-summary .save { color: #a5cb00; }
        .shc-summary .warn { color: #ffc53d; }
        .shc-summary-body { display: contents; }
        #shc-country-controls { display: flex; align-items: center; gap: 6px; margin-left: auto;
            flex: 0 1 auto; min-width: 0; max-width: 100%; white-space: nowrap; }
        #shc-sale-countdown { font-size: 1em; white-space: nowrap; line-height: 1.25; }
        #shc-sale-countdown .shc-cd-date { color: #66c0f4; font-size: .9em; }
        #shc-sale-countdown .shc-cd-state, #shc-sale-countdown .shc-cd-unit { color: #8b929a; font-size: .9em; }
        #shc-sale-countdown .shc-cd-num { color: #8b5cf6; font-size: 1em; }
        #shc-wishlist-progress { position: fixed; bottom: calc(env(safe-area-inset-bottom, 0px) + 52px); right: calc(env(safe-area-inset-right, 0px) + 25px);
            z-index: 9999; box-sizing: border-box; max-width: 82vw; min-height: 24px;
            background: rgba(23,29,37,.70); border: 1px solid rgba(255,255,255,.12); border-radius: 5px;
            cursor: pointer; align-items: center; justify-content: center; gap: 3px; padding: 2px 6px;
            font-size: 11px; line-height: 1.3; color: #acb2b8; display: none; box-shadow: 0 3px 10px rgba(0,0,0,.25); }
        #shc-wishlist-progress.show { display: flex; }
        #shc-wishlist-progress:hover { background: rgba(23,29,37,.88); border-color: rgba(255,255,255,.24); }
        #shc-wishlist-progress .shc-wishlist-progress-icon { display: inline-block; flex: 0 0 auto; font-size: .9em; }
        #shc-wishlist-progress .shc-wishlist-progress-text { min-width: 0; }
        #shc-wishlist-progress.loading .shc-wishlist-progress-icon { animation: shc-funnel-spin 2s linear infinite; }
        @keyframes shc-funnel-spin { to { transform: rotate(360deg); } }

        .shc-mobile .shc-summary { margin: 4px 0 10px; padding: 6px clamp(8px, 1.4vw, 12px); }
        .shc-mobile #shc-sale-countdown { min-width: 0; white-space: normal; overflow-wrap: anywhere; }
        .shc-mobile .shc-price.compact { margin-top: 2px; line-height: 1.35;
            font-size: 12px; max-width: 100%; min-width: 0;
            white-space: normal; overflow-wrap: anywhere; }
        .shc-mobile .shc-price.compact.purchase-inline { font-size: 11px; line-height: 1.2;
            white-space: nowrap; overflow: visible; display: flex; flex-direction: column;
            justify-content: center; gap: 1px; }
        .shc-mobile .shc-price.compact.purchase-inline .shc-mobile-lowline,
        .shc-mobile .shc-price.compact.purchase-inline .shc-mobile-currentline { white-space: nowrap; }
        .shc-mobile .shc-price.compact.purchase-inline.tight .shc-discount { display: none; }
    `);
    initWishlist();
})();
