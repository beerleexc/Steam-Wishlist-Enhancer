// ==UserScript==
// @name        Steam Wishlist Enhancer
// @namespace   https://github.com/beerleexc
// @description Steam愿望单页面功能增强，可在愿望单里直接查看多地区价格、历史最低价、愿望单游戏金额总和，史低价格总和的脚本。 Regional prices, historical lows, totals, and seasonal sale countdowns for Steam wishlists
// @author      beerlee
// @license     MIT
// @version     1.8.5
// @include     *://store.steampowered.com/wishlist/*
// @icon        https://raw.githubusercontent.com/beerleexc/Steam-Wishlist-Enhancer/refs/heads/main/assets/icon.svg
// @supportURL  https://github.com/beerleexc/Steam-Wishlist-Enhancer/issues
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
// @connect     steamcommunity.com
// @run-at      document-end
// ==/UserScript==
(function () {
    "use strict";
    if (document.documentElement.dataset.shcWishlistActive) return;
    document.documentElement.dataset.shcWishlistActive = "1";

    const UI_LANGUAGE = (document.documentElement.lang || navigator.language || "zh-CN").toLowerCase();
    const IS_ZH = UI_LANGUAGE.startsWith("zh");
    const T = {
        zh: {
            switchRegion: "切换查询地区", networkError: "网络错误", requestTimeout: "请求超时",
            winter: "❄️ 冬季特卖", spring: "🌱 春季特卖", summer: "☀️ 夏季特卖", autumn: "🍂 秋季特卖",
            empty: "📊 愿望单为空", ratesMissing: "⚠ 汇率获取失败",
            lowTotal: "史低合计", currentTotal: "当前合计", lowest: "史低：", current: "当前：", regionLocked: "锁区",
            saveAtLow: value => `等待史低可省 ${value}`, atLow: n => `${n} 项史低中`,
            showLow: "展开史低游戏", hideLow: "收起史低游戏",
            includes: value => `含 ${value} 报价`, noLow: n => `⚠ ${n} 项无数据`,
            missing: n => `${n} 项暂无数据`, loadingWishlist: "正在加载愿望单…",
            checked: (m, n) => `已加载 ${m}/${n}`, checkedOnly: m => `已加载 ${m}`, loaded: "加载完成",
            backToTop: "返回顶部", backToTopTitle: "点击返回页面顶部",
            bulkAdd: "全部加购", bulkPreparing: "正在准备…", bulkAdding: n => `正在加购 ${n} 项…`,
            bulkAdded: n => `已加购 ${n} 项`, bulkNone: "无可加购项目", bulkFailed: "加购失败，点击重试",
            bulkViewChanged: "视图或地区已变化，请重新点击",
            bulkScope: (low, n) => `一次加入${low ? "当前史低" : "整个愿望单"} ${n} 项；自动跳过免费、锁区、已拥有及重复项目`,
            bulkSkipped: s => `跳过：已拥有 ${s.owned}，锁区 ${s.locked}，不可购买 ${s.unavailable}，重复 ${s.duplicate}，已加购 ${s.added}`,
            startsIn: "距开始", endsIn: "距结束", days:"天", hours:"时", minutes:"分", seconds:"秒",
            discountLeft: "促销截止：", discountEndsAt: value => `折扣截止：${value}`,
            native: value => `（${value}）`,
            saleTitle: (sale, start, end) => `${sale.label} 太平洋时间 ${formatSaleDate(start)} 开幕 — ${formatSaleDate(end)} 收摊｜北京 ${new Date(start).toLocaleString("zh-CN")} — ${new Date(end).toLocaleString("zh-CN")}`
        },
        en: {
            switchRegion: "Switch region", networkError: "Network error", requestTimeout: "Request timed out",
            winter: "❄️ Winter Sale", spring: "🌱 Spring Sale", summer: "☀️ Summer Sale", autumn: "🍂 Autumn Sale",
            empty: "📊 Wishlist is empty", ratesMissing: "⚠ Exchange rates unavailable; CNY conversion is disabled",
            lowTotal: "Historical low total", currentTotal: "Current total", lowest: "Low ", current: "Current ", regionLocked: "Region locked",
            saveAtLow: value => `Save ${value} at historical lows`, atLow: n => `${n} at historical low`,
            showLow: "Show historical-low games", hideLow: "Hide historical-low drawer",
            includes: value => `Includes ${value} prices`, noLow: n => `⚠ No data for ${n} ${n === 1 ? "item" : "items"}`,
            missing: n => `${n} items unavailable`, loadingWishlist: "Loading wishlist…",
            checked: (m, n) => `Checked ${m} / ${n}`, checkedOnly: m => `Checked ${m}`, loaded: "Loading complete",
            backToTop: "Back to top", backToTopTitle: "Back to top",
            bulkAdd: "Add all to cart", bulkPreparing: "Preparing…", bulkAdding: n => `Adding ${n} items…`,
            bulkAdded: n => `Added ${n} items`, bulkNone: "Nothing to add", bulkFailed: "Failed — retry",
            bulkViewChanged: "View or region changed; click again",
            bulkScope: (low, n) => `Add ${n} ${low ? "historical-low" : "wishlist"} items in one request; skips free, locked, owned and duplicate items`,
            bulkSkipped: s => `Skipped: ${s.owned} owned, ${s.locked} locked, ${s.unavailable} unavailable, ${s.duplicate} duplicates, ${s.added} already added`,
            startsIn: "Starts in", endsIn: "Ends in", days: "d", hours: "h", minutes: "m", seconds: "s",
            discountLeft: "Ends in: ", discountEndsAt: value => `Discount ends: ${value}`,
            native: value => ` (${value})`,
            saleTitle: (sale, start, end) => `${sale.label} | PT: ${formatSaleDate(start)} — ${formatSaleDate(end)} | Local: ${new Date(start).toLocaleString("en-US")} — ${new Date(end).toLocaleString("en-US")}`
        }
    }[IS_ZH ? "zh" : "en"];
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
    const STORE_VERSION = "v11";
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
    function fetchPrices(chunk, country, subs = []) {
        return postJSON(location.protocol + "//api.augmentedsteam.com/prices/v2", {
            country: country.toUpperCase(),
            apps: chunk.app,
            subs: subs,
            bundles: [],
            voucher: true,
            shops: [ 61 ]
        }).then(d => d.prices || {});
    }
    const STEAM_GETITEMS = "https://api.steampowered.com/IStoreBrowseService/GetItems/v1/";
    function discountEndMs(option) {
        if (!(Number(option.discount_pct) > 0) || !Array.isArray(option.active_discounts)) return null;
        const ends = option.active_discounts.map(discount => Number(discount.discount_end_date))
            .filter(end => Number.isInteger(end) && end > 0 && end <= 4294967295);
        return ends.length ? Math.min(...ends) * 1000 : null;
    }
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
                    discountEndsAt: discountEndMs(po),
                    packageid: Number(po.packageid) > 0 ? Number(po.packageid) : null,
                    bundleid: Number(po.bundleid) > 0 ? Number(po.bundleid) : null,
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
                        if (!info || !info.price || !(info.price.amount > 0)) return;
                        const locked = out[key] || (out[key] = {});
                        // 候选键先被记为 noPrice，这里必须改判为锁区，否则 merge 会走 noPrice 分支丢掉锁区态
                        locked.regionLocked = true;
                        delete locked.noPrice;
                        if (locked.discountEndsAt == null && Number(info.cut) > 0 && Number.isFinite(info.discountEndsAt)) {
                            locked.cut = info.cut;
                            locked.discountEndsAt = info.discountEndsAt;
                        }
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
            if (merged[key].lowest && merged[key].lowest.price) continue;
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
    // Augmented app 无史低时，用 best_purchase_option 中保留的 packageid 合并为一次 subs 请求。
    async function attachPackageLows(chunk, country, merged, gen) {
        const appsByPackage = new Map;
        chunk.app.forEach(appid => {
            const key = `app/${appid}`;
            const entry = merged[key];
            if (!entry || !entry.current || entry.lowest && entry.lowest.price) return;
            const packageid = Number(entry.current.packageid);
            if (!(packageid > 0)) return;
            if (!appsByPackage.has(packageid)) appsByPackage.set(packageid, []);
            appsByPackage.get(packageid).push(key);
        });
        if (!appsByPackage.size) return;
        const packagePrices = await fetchPrices({ app: [] }, country, [ ...appsByPackage.keys() ]).catch(() => null);
        if (gen !== generation || !packagePrices) return;
        appsByPackage.forEach((keys, packageid) => {
            const packageEntry = packagePrices[`sub/${packageid}`];
            const lowest = packageEntry && packageEntry.lowest;
            if (!lowest || !lowest.price) return;
            keys.forEach(key => {
                merged[key].lowest = lowest;
                merged[key].lowAt = Date.now();
            });
        });
    }
    // aug 为主，steam 补齐
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
                entry.cut = steam[key].cut;
                entry.discountEndsAt = steam[key].discountEndsAt;
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
    const OWN_SELECTOR = "#shc-wishlist-summary, #shc-country-controls, #shc-wishlist-progress, #shc-bulk-cart, .shc-price, .shc-release-discount-time";
    const PRICE_KEY = "steamHistoryPrices";
    const PRICE_TTL = 30 * 60 * 1e3;
    const PRICE_KEEP = 24 * 60 * 60 * 1e3;
    const AUTO_QUEUE_LIMIT = 100;
    const wishlistIds = new Map;
    const pendingIds = new Map;
    const doneIds = new Set;
    const checkedIds = new Set;
    const fetchedKeys = new Set;
    const failCount = new Map;
    const observedRows = new WeakSet;
    const visibleRows = new Set;
    let priceLayoutVersion = 0;
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
    let lowOnly = false;
    let steamMenuTemplate = null;
    let bulkCartButton = null, bulkCartBusy = false, bulkCartStatus = null, bulkCartStatusTimer = null;
    let ownedAccountPromise = null;
    const bulkAdded = new Set;
    const STEAM_MENU_ACTIVE_CLASS = "NmzlVu-XMK4-";
    function loadPriceCache() {
        const bucket = priceBuckets[currentCountry.toUpperCase()] || {};
        const now = Date.now();
        prices = {};
        Object.keys(bucket).forEach(key => {
            const hit = bucket[key];
            if (!hit || now - hit.savedAt > PRICE_KEEP) return;
            prices[key] = hit;
            const current = hit.current;
            const end = current && Number(current.discountEndsAt);
            const discountExpired = end > 0 && end <= now;
            const missingDiscountEnd = current && Number(current.cut) > 0 && current.discountEndsAt === undefined;
            const missingPurchase = current && current.packageid == null && current.bundleid == null;
            if (now - hit.savedAt < PRICE_TTL && !discountExpired && !missingDiscountEnd && !missingPurchase) {
                doneIds.add(key);
                checkedIds.add(key);
            }
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
    const STEAM_ID_RE = /^7656119\d{10}$/;
    const withSteamAuth = (url, token) => token ? `${url}${url.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}` : url;
    function tokenFromConfig() {
        const config = document.getElementById("application_config");
        if (!config) return "";
        for (const attr of Array.from(config.attributes)) {
            if (!attr.name.startsWith("data-") || !attr.value) continue;
            try {
                const parsed = JSON.parse(attr.value);
                if (typeof parsed === "string" && parsed.startsWith("eyJ")) return parsed;
                if (parsed && typeof parsed === "object") {
                    const token = parsed.webapi_token;
                    if (typeof token === "string" && token.startsWith("eyJ")) return token;
                }
            } catch {
                if (attr.value.startsWith("eyJ")) return attr.value;
            }
        }
        return "";
    }
    let sessionWebApiToken = "";
    async function readWebApiToken() {
        const fromPage = tokenFromConfig();
        if (fromPage) {
            sessionWebApiToken = fromPage;
            return fromPage;
        }
        if (sessionWebApiToken) return sessionWebApiToken;
        try {
            const resp = await fetch("https://store.steampowered.com/pointssummary/ajaxgetasyncconfig", {
                headers: { Accept: "application/json" }, credentials: "include"
            });
            if (resp.ok) {
                const data = await resp.json();
                sessionWebApiToken = data.data && data.data.webapi_token || "";
            }
        } catch {
            sessionWebApiToken = "";
        }
        return sessionWebApiToken;
    }
    function wishlistSteamIdFromHref(href) {
        const profile = href.match(/\/(?:wishlist\/)?profiles\/(\d{17})/);
        if (profile && STEAM_ID_RE.test(profile[1])) return profile[1];
        const vanity = href.match(/\/(?:wishlist\/)?id\/([^/?#]+)/);
        return vanity ? { vanity: decodeURIComponent(vanity[1]) } : null;
    }
    function readWishlistSsrData() {
        const node = document.getElementById("valve-ssr-data");
        if (!node) return null;
        try {
            return JSON.parse(node.textContent || "{}");
        } catch {
            return null;
        }
    }
    function wishlistSteamIdFromPage() {
        const data = readWishlistSsrData();
        const loader = Array.isArray(data && data.loaderData) ? data.loaderData : [];
        const ids = loader.map(item => item && item.steamid);
        ids.push(data && data.UserConfig && data.UserConfig.steamid);
        const fromSsr = ids.find(value => value && STEAM_ID_RE.test(value));
        if (fromSsr) return fromSsr;
        const root = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
        const candidates = [ root.g_rgProfileData && root.g_rgProfileData.steamid, root.g_steamID ];
        return candidates.find(value => value && STEAM_ID_RE.test(value)) || null;
    }
    async function resolveWishlistSteamId() {
        const parsed = wishlistSteamIdFromHref(location.href);
        if (typeof parsed === "string") return parsed;
        if (parsed && parsed.vanity) {
            const xml = await request({
                url: `https://steamcommunity.com/id/${encodeURIComponent(parsed.vanity)}/?xml=1`
            });
            const match = xml.match(/<steamID64>(\d{17})<\/steamID64>/);
            if (!match || !STEAM_ID_RE.test(match[1])) throw new Error("无法解析自定义 URL");
            return match[1];
        }
        const fromPage = wishlistSteamIdFromPage();
        if (fromPage) return fromPage;
        throw new Error("当前页找不到 Steam ID");
    }
    async function fetchSteamWishlistItems() {
        const tokenPromise = readWebApiToken();
        const steamId = await resolveWishlistSteamId();
        const token = await tokenPromise;
        const data = await getJSON({
            url: withSteamAuth(`https://api.steampowered.com/IWishlistService/GetWishlist/v1/?steamid=${steamId}`, token),
            headers: { Accept: "application/json" }
        });
        const items = data.response && data.response.items;
        if (!Array.isArray(items)) throw new Error("Steam 愿望单返回格式异常");
        const ids = [ ...new Set(items.map(item => item && item.appid).filter(id => Number.isSafeInteger(id) && id > 0)) ];
        if (!ids.length) throw new Error("愿望单为空或未公开");
        return ids.map(id => ({ key: `app/${id}`, id: String(id) }));
    }
    async function fetchWishlistItems() {
        try {
            return await fetchSteamWishlistItems();
        } catch {
        }
        try {
            const resp = await fetch(location.protocol + `//store.steampowered.com/dynamicstore/userdata/?_=${Date.now()}`, {
                headers: { "Cache-Control": "no-cache", Pragma: "no-cache" }, credentials: "include"
            });
            if (!resp.ok) return null;
            const text = await resp.text();
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
    function isOwnWishlist() {
        const data = readWishlistSsrData();
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
    let nativeLowCountNode = null;
    let nativeLowCountText = "";
    let countScanAt = 0;
    function scanCountNode() {
        const now = Date.now();
        const scope = rowsHost()?.closest("section") || document.querySelector("#StoreTemplate, #wishlist_index_content, .wishlist_content, #footer_search_results") || document.querySelector("#content") || document.body;
        if (countAnchor && countAnchor.isConnected && scope.contains(countAnchor) && now - countScanAt < 3e3) return countAnchor;
        countScanAt = now;
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
        const scope = rowsHost()?.closest("section");
        if (countAnchor && countAnchor.isConnected && (!scope || scope.contains(countAnchor)) && readCountFromText(countAnchor.textContent) != null) return countAnchor;
        countAnchor = scanCountNode();
        return countAnchor;
    }
    function readExpectedCount() {
        const anchor = findCountNode();
        if (!anchor) return 0;
        const replaced = lowOnly && nativeLowCountNode && (anchor === nativeLowCountNode || anchor.contains(nativeLowCountNode));
        const text = replaced ? nativeLowCountText : anchor.textContent;
        return readCountFromText(text) || 0;
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
    function isFilteredView() {
        if (lowOnly) return true;
        for (const input of document.querySelectorAll("input:checked")) {
            if (input.name === "viewmode" || !/^(?:radio|checkbox)$/.test(input.type)) continue;
            const value = String(input.value).toLowerCase();
            // discount=any 表示“所有打折项目”，其他控件的 any 才表示不限。
            const unfiltered = input.name === "discount" ? value === "" : [ "", "all", "any" ].includes(value);
            if (!unfiltered) return true;
        }
        for (const input of document.querySelectorAll('input[type="search"], input[name="search"]')) {
            if (!/^(?:radio|checkbox)$/.test(input.type) && input.value.trim()) return true;
        }
        for (const input of document.querySelectorAll('input[type="range"][id^="priceFiltersRange"]')) {
            if (input.max && input.value !== input.max) return true;
        }
        return false;
    }
    const compareWishlistKeys = (a, b) => Number(a.split("/")[1]) - Number(b.split("/")[1]);
    function queuePrices() {
        const filtered = isFilteredView();
        if (filtered && collecting && !serverWishlistLoaded) return;
        const enqueue = key => {
            if (doneIds.has(key) || pendingIds.has(key)) return;
            const item = wishlistIds.get(key);
            if (item) pendingIds.set(key, item);
        };
        const keys = [ ...wishlistIds.keys() ];
        if (filtered) keys.sort(compareWishlistKeys);
        (filtered ? keys : keys.slice(0, AUTO_QUEUE_LIMIT)).forEach(enqueue);
        if (!filtered) visibleRows.forEach(row => {
            const r = rowRef(row);
            if (r) enqueue(r.key);
        });
        drainPrices();
    }
    function takeChunk() {
        const chunk = { app: [] };
        const take = key => {
            if (chunk.app.length >= CHUNK_SIZE) return;
            const item = pendingIds.get(key);
            if (!item) return;
            pendingIds.delete(key);
            doneIds.add(key);
            chunk.app.push(Number(item.id));
        };
        const filtered = isFilteredView();
        if (!filtered) visibleRows.forEach(row => {
            const r = rowRef(row);
            if (r) take(r.key);
        });
        const keys = filtered ? [ ...pendingIds.keys() ].sort(compareWishlistKeys) : [ ...pendingIds.keys() ];
        for (const key of keys) {
            if (chunk.app.length >= CHUNK_SIZE) break;
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
                if (useAug) await attachPackageLows(chunk, country, aug, gen);
                if (gen !== generation) continue;
                await attachXhhLows(chunk, country, aug, gen);
                if (gen !== generation) continue;
                const keys = chunk.app.map(id => `app/${id}`);
                if (ok) keys.forEach(key => {
                    fetchedKeys.add(key);
                    checkedIds.add(key);
                });
                else keys.forEach(key => {
                    const tries = (failCount.get(key) || 0) + 1;
                    failCount.set(key, tries);
                    if (tries >= 2) {
                        checkedIds.add(key);
                        return;
                    }
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
                updateCollectionProgress();
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
        let lowSum = 0, curSum = 0, saveSum = 0, atLowSum = 0;
        const currencies = new Set;
        const lowNative = {}, curNative = {}, atLowNative = {};
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
                    if (isAtHistoricalLow(info.lowest, info.current)) {
                        atLow++;
                        atLowSum += curCNY;
                        atLowNative[cp.currency] = (atLowNative[cp.currency] || 0) + cp.amount;
                    }
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
            atLowSum: atLowSum,
            atLowNative: atLowNative,
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
            box.addEventListener("click", event => {
                if (event.target.closest(".shc-low-toggle")) toggleLowOnlyDrawer();
            });
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
        const restoreLowFocus = el.contains(document.activeElement) && document.activeElement.classList.contains("shc-low-toggle");
        el.innerHTML = html;
        if (restoreLowFocus) el.querySelector(".shc-low-toggle")?.focus({ preventScroll: true });
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
    let discountTimer = null;
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
            if (countdownEl.childNodes.length) countdownEl.appendChild(document.createTextNode(" "));
            countdownEl.appendChild(span);
            return span;
        };
        const num = unit => {
            const group = add("shc-cd-part", "");
            const b = document.createElement("b");
            b.className = "shc-cd-num";
            const suffix = document.createElement("span");
            suffix.className = "shc-cd-unit";
            suffix.textContent = unit;
            group.append(b, suffix);
            return b.appendChild(document.createTextNode(""));
        };
        cdSignature = `${sale.label}|${sale.startMs}|${sale.endMs}`;
        add("shc-cd-name", sale.label);
        add("shc-cd-date", `${formatSaleDate(sale.startMs)} — ${formatSaleDate(sale.endMs)}`);
        cdNodes = { state: add("shc-cd-state", saleIsLive(sale, now) ? T.endsIn : T.startsIn).firstChild };
        cdNodes.days = num(T.days);
        cdNodes.hours = num(T.hours);
        cdNodes.mins = num(T.minutes);
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
        // 补零填满 2ch 定宽槽：单位数时右对齐会在数字左侧留出一格空白，看起来像多余的大间距
        writeText(cdNodes.days, String(Math.floor(left / 1440)).padStart(2, "0"));
        writeText(cdNodes.hours, String(Math.floor(left % 1440 / 60)).padStart(2, "0"));
        writeText(cdNodes.mins, String(left % 60).padStart(2, "0"));
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
        updateDiscountTimes();
        if (!saleTimer) saleTimer = setInterval(tickCountdown, 2e4);
        if (!discountTimer) discountTimer = setInterval(updateDiscountTimes, 1e3);
    }
    let lowFilterStyle = null;
    function syncLowOnly() {
        if (lowOnly) {
            if (!lowFilterStyle) {
                lowFilterStyle = document.createElement("style");
                document.head.appendChild(lowFilterStyle);
            }
            const matches = [];
            for (const { key, id } of wishlistIds.values()) {
                const info = prices[key];
                if (!info || !isAtHistoricalLow(info.lowest, info.current)) continue;
                matches.push(`[data-appid="${id}"]`, `:has(a[href*="/app/${id}/"], a[href$="/app/${id}"], a[href*="/app/${id}?"], a[href*="/app/${id}#"])`);
            }
            // 原生虚拟列表会在 MutationObserver 前测量新行，筛选不能依赖稍后才补上的类。
            const rule = matches.length ? `body.shc-low-only :is(${ROW_SELECTOR}):not(${matches.join(",")}) { display: none !important; }` : "";
            if (lowFilterStyle.textContent !== rule) lowFilterStyle.textContent = rule;
        }
        document.body.classList.toggle("shc-low-only", lowOnly);
        const host = rowsHost();
        if (!host) return null;
        if (!host.id) host.id = "shc-low-drawer";
        host.classList.toggle("shc-low-drawer-open", lowOnly);
        return host;
    }
    // 抽屉展开时 Steam 滚动会重建行节点，需在观察器回调里先无条件补类再尽量同步绘制，避免逐帧闪回原生列表。
    function hideNewRowsInLowOnly(records) {
        records.forEach(record => record.addedNodes.forEach(node => {
            if (node.nodeType !== 1) return;
            const rows = node.matches(ROW_SELECTOR) ? [ node ] : [ ...node.querySelectorAll(ROW_SELECTOR) ];
            rows.forEach(paintRow);
        }));
        const host = rowsHost();
        if (host && !host.classList.contains("shc-low-drawer-open")) syncLowOnly();
    }
    function restoreNativeLowCount() {
        if (nativeLowCountNode && nativeLowCountNode.isConnected) {
            if (nativeLowCountNode.textContent !== nativeLowCountText) nativeLowCountNode.textContent = nativeLowCountText;
        }
        nativeLowCountNode = null;
        nativeLowCountText = "";
    }
    function syncNativeLowCount(count) {
        if (!lowOnly) return restoreNativeLowCount();
        let node = findCountNode();
        if (node && node.children.length) {
            let leaf = null;
            textOwners(node, el => {
                if (el.children.length || readCountFromText(el.textContent) == null) return;
                if (!leaf || el.textContent.length < leaf.textContent.length) leaf = el;
            });
            node = leaf;
        }
        if (!node) return restoreNativeLowCount();
        if (nativeLowCountNode !== node) {
            restoreNativeLowCount();
            nativeLowCountNode = node;
            nativeLowCountText = node.textContent;
        }
        const text = nativeLowCountText.replace(/[\d][\d,.]*/, String(count));
        if (node.textContent !== text) node.textContent = text;
    }
    function nativeMenuButtonHTML(text, expanded, controls, title) {
        if (!steamMenuTemplate || !steamMenuTemplate.isConnected) {
            steamMenuTemplate = [...document.querySelectorAll("#StoreTemplate button[aria-expanded]")].find(button =>
                !button.closest(OWN_SELECTOR) && button.firstElementChild && button.querySelector('svg[viewBox="0 0 12 12"]')
            ) || null;
        }
        const button = steamMenuTemplate ? steamMenuTemplate.cloneNode(true) : document.createElement("button");
        button.classList.add("shc-low-toggle");
        button.classList.toggle(STEAM_MENU_ACTIVE_CLASS, expanded);
        button.setAttribute("type", "button");
        button.setAttribute("aria-expanded", String(expanded));
        button.setAttribute("aria-controls", controls);
        button.setAttribute("title", title);
        if (steamMenuTemplate) {
            const label = button.firstElementChild;
            [...label.childNodes].forEach(node => { if (node.nodeType === 3) node.remove(); });
            label.prepend(document.createTextNode(text));
        } else {
            button.innerHTML = `<span>${text}</span><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="none" role="presentation"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M5.81026 6.36084L8.50899 3.66211L9.6875 4.84062L5.81026 8.71786L1.93302 4.84062L3.11153 3.66211L5.81026 6.36084Z"></path></svg>`;
        }
        return button.outerHTML;
    }
    function toggleLowOnlyDrawer() {
        lowOnly = !lowOnly;
        renderSummary();
        if (!lowOnly) return;
        // 入场动画只在用户展开时播一次；跟着容器类走的话，滚动重建容器会把动画一起重播，表现为"闪一下"
        const host = rowsHost();
        if (host) {
            host.classList.add("shc-low-drawer-enter");
            setTimeout(() => host.classList.remove("shc-low-drawer-enter"), 260);
        }
        queuePrices();
        scrollWishlistToTop(false);
    }
    function renderSummary() {
        const box = getSummaryBox();
        if (!box) return;
        const body = summaryBody(box);
        placeControls(box);
        syncBarSurface(box);
        const drawerHost = syncLowOnly();
        const s = summarize();
        syncNativeLowCount(s.atLow);
        if (s.total === 0) {
            writeIfChanged(body, `<span class="dim">${collecting ? T.loadingWishlist : T.empty}</span>`);
            revealBar(box);
            updateCollectionProgress();
            updateBulkCartButton(s);
            return;
        }
        const noLowAtAll = s.counted > 0 && s.noLow === s.counted;
        // 主金额用地区原生货币，括号里折算人民币；只有单一非人民币币种时才需要括号。
        const totalText = (cny, map) => {
            const keys = Object.keys(map).filter(c => c !== "CNY" && map[c] > 0);
            return keys.length === 1 ? formatPrice(map[keys[0]], keys[0]) + T.native(formatCNY(cny)) : formatCNY(cny);
        };
        const seg = html => `<span class="shc-seg">${html}</span>`;
        // 史低视图只展示史低游戏，合计即该页金额，不再显示史低合计与史低可省
        const parts = s.ratesMissing ? [ `<span class="warn">${T.ratesMissing}</span>` ]
            : lowOnly ? [ seg(`<span class="dim">${T.currentTotal}</span> <span class="cur">${totalText(s.atLowSum, s.atLowNative)}</span>`) ]
            : [ seg(`<span class="label">${T.lowTotal}</span> <span class="main">${noLowAtAll ? "—" : totalText(s.lowSum, s.lowNative)}</span>`) , seg(`<span class="dim">${T.currentTotal}</span> <span class="cur">${totalText(s.curSum, s.curNative)}</span>`) ];
        if (!lowOnly && !s.ratesMissing && s.save > .005) parts.push(`<span class="save">${T.saveAtLow(`<span class="shc-money">${formatCNY(s.save)}</span>`)}</span>`);
        const nonCNY = s.currencies.filter(c => c !== "CNY");
        if (nonCNY.length && s.currencies.length > 1) parts.push(`<span class="dim">${T.includes(nonCNY.join("/"))}</span>`);
        if (s.noLow) parts.push(`<span class="warn">${T.noLow(s.noLow)}</span>`);
        if (s.missing) parts.push(`<span class="warn">${T.missing(s.missing)}</span>`);
        const lowButton = s.atLow > 0 || lowOnly ? nativeMenuButtonHTML(T.atLow(s.atLow), lowOnly, drawerHost && drawerHost.id || "shc-low-drawer", lowOnly ? T.hideLow : T.showLow) : "";
        writeIfChanged(body, [ lowButton, ...parts ].filter(Boolean).join(" "));
        revealBar(box);
        updateCollectionProgress();
        updateBulkCartButton(s);
    }
    function bulkTitleHost() {
        const title = [ ...document.querySelectorAll("h1, h2") ].find(el => /愿望单|wishlist/i.test(el.textContent));
        if (!title) return null;
        const row = title.parentElement;
        return [ row, row && row.parentElement ]
            .find(el => el && getComputedStyle(el).display === "flex") || null;
    }
    function ensureBulkCartButton() {
        const host = bulkTitleHost();
        if (!host) return null;
        host.classList.add("shc-bulk-title-row");
        if (!bulkCartButton) {
            bulkCartButton = document.createElement("button");
            bulkCartButton.id = "shc-bulk-cart";
            bulkCartButton.type = "button";
            bulkCartButton.className = "Focusable";
            bulkCartButton.setAttribute("aria-live", "polite");
            bulkCartButton.addEventListener("click", addBulkToCart);
        }
        if (bulkCartButton._shcHost && bulkCartButton._shcHost !== host) {
            bulkCartButton._shcHost.classList.remove("shc-bulk-title-row");
        }
        bulkCartButton._shcHost = host;
        if (bulkCartButton.parentElement !== host) host.appendChild(bulkCartButton);
        return bulkCartButton;
    }
    function updateBulkCartButton(summary) {
        const button = ensureBulkCartButton();
        if (!button) return;
        const count = lowOnly ? (summary || summarize()).atLow : wishlistIds.size;
        const scope = T.bulkScope(lowOnly, count);
        if (bulkCartBusy) {
            button.disabled = true;
            button.title = scope;
            return;
        }
        const status = bulkCartStatus;
        button.textContent = status ? status.text : T.bulkAdd;
        button.disabled = !wishlistIds.size || !!(status && status.disabled);
        button.title = [ status && status.title, scope ].filter(Boolean).join("\n");
    }
    function setBulkStatus(text, title, disabled, ms = 5000) {
        clearTimeout(bulkCartStatusTimer);
        bulkCartStatus = { text: text, title: title, disabled: disabled };
        updateBulkCartButton();
        bulkCartStatusTimer = setTimeout(() => {
            bulkCartStatus = null;
            updateBulkCartButton();
        }, ms);
    }
    const accountIdSet = value => new Set((Array.isArray(value) ? value : Object.keys(value || {})).map(String));
    function loadOwnedAccount() {
        if (!ownedAccountPromise) {
            ownedAccountPromise = fetch(`${location.origin}/dynamicstore/userdata/?_=${Date.now()}`, {
                headers: { Accept: "application/json", "Cache-Control": "no-cache" }, credentials: "include"
            }).then(r => r.ok ? r.json() : Promise.reject(new Error(T.networkError))).then(data => {
                if (!data || !data.rgOwnedApps && !data.rgOwnedPackages) throw new Error(T.networkError);
                return {
                    apps: accountIdSet(data.rgOwnedApps),
                    packages: accountIdSet(data.rgOwnedPackages),
                    bundles: accountIdSet(data.rgOwnedBundles)
                };
            }).catch(error => {
                ownedAccountPromise = null;
                throw error;
            });
        }
        return ownedAccountPromise;
    }
    function buildBulkBatch(keys, account) {
        const items = [], seen = new Set;
        const skipped = { owned: 0, locked: 0, unavailable: 0, duplicate: 0, added: 0 };
        keys.forEach(key => {
            const info = prices[key];
            if (lowOnly && !isAtHistoricalLow(info && info.lowest, info && info.current)) return;
            const appid = key.split("/")[1];
            if (account.apps.has(appid)) {
                skipped.owned++;
                return;
            }
            if (info && info.regionLocked) {
                skipped.locked++;
                return;
            }
            const current = info && info.current;
            if (!current || info.noPrice || !(Number(current.price && current.price.amount) > 0)) {
                skipped.unavailable++;
                return;
            }
            const type = current.packageid ? "subid" : current.bundleid ? "bundleid" : "";
            const id = type === "subid" ? String(current.packageid) : type === "bundleid" ? String(current.bundleid) : "";
            if (!type) {
                skipped.unavailable++;
                return;
            }
            if (type === "subid" && account.packages.has(id) || type === "bundleid" && account.bundles.has(id)) {
                skipped.owned++;
                return;
            }
            const token = `${type}/${id}`;
            if (bulkAdded.has(token)) {
                skipped.added++;
                return;
            }
            if (seen.has(token)) {
                skipped.duplicate++;
                return;
            }
            seen.add(token);
            items.push({ key: key, type: type, id: id });
        });
        return { items: items, skipped: skipped };
    }
    function bulkCartFields(items) {
        const fields = items.length === 1 ? [ [ items[0].type, items[0].id ] ]
            : items.map(item => [ `${item.type}[]`, item.id ]);
        fields.push([ "action", "add_to_cart" ]);
        return fields;
    }
    async function postBulkCart(items) {
        const body = new URLSearchParams;
        bulkCartFields(items).forEach(([ key, value ]) => body.append(key, value));
        const resp = await fetch(`${location.origin}/cart/addtocart`, {
            method: "POST", body: body, credentials: "include"
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.json();
    }
    function nativeAccountLink(root, section) {
        return [ ...root.querySelectorAll("a[href]") ].find(link => {
            if (!link.querySelector("svg")) return false;
            try {
                const url = new URL(link.getAttribute("href"), location.origin);
                return url.origin === location.origin && new RegExp(`^/${section}/?$`).test(url.pathname);
            } catch (_) {
                return false;
            }
        }) || null;
    }
    async function syncNativeCartLink() {
        let resp;
        try { resp = await fetch(location.href, { credentials: "include", cache: "no-store" }); }
        catch { return; }
        if (!resp.ok) return;
        const freshDocument = new DOMParser().parseFromString(await resp.text(), "text/html");
        const freshCart = nativeAccountLink(freshDocument, "cart");
        if (!freshCart) return;
        const currentCart = nativeAccountLink(document, "cart");
        if (currentCart) {
            currentCart.replaceWith(document.importNode(freshCart, true));
            return;
        }
        const freshWishlist = nativeAccountLink(freshDocument, "wishlist");
        const currentWishlist = nativeAccountLink(document, "wishlist");
        if (!freshWishlist || !currentWishlist) return;
        const freshGroup = freshWishlist.parentElement;
        const currentGroup = currentWishlist.parentElement;
        if (freshGroup && currentGroup) currentGroup.replaceWith(document.importNode(freshGroup, true));
    }
    async function waitForBulkPrices() {
        while (collecting) await sleep(200);
        wishlistIds.forEach((item, key) => {
            const current = prices[key] && prices[key].current;
            const missingPurchase = current && current.packageid == null && current.bundleid == null;
            if (!pendingIds.has(key) && (!doneIds.has(key) || missingPurchase)) {
                doneIds.delete(key);
                pendingIds.set(key, item);
            }
        });
        drainPrices();
        while (draining || pendingIds.size) await sleep(200);
    }
    async function addBulkToCart() {
        if (bulkCartBusy) return;
        const view = lowOnly, run = generation;
        clearTimeout(bulkCartStatusTimer);
        bulkCartStatus = null;
        bulkCartBusy = true;
        updateBulkCartButton();
        if (bulkCartButton) bulkCartButton.textContent = T.bulkPreparing;
        try {
            const [ , account ] = await Promise.all([ waitForBulkPrices(), loadOwnedAccount() ]);
            if (view !== lowOnly || run !== generation) throw new Error(T.bulkViewChanged);
            const batch = buildBulkBatch([ ...wishlistIds.keys() ], account);
            if (!batch.items.length) {
                setBulkStatus(T.bulkNone, T.bulkSkipped(batch.skipped), true);
                return;
            }
            if (bulkCartButton) bulkCartButton.textContent = T.bulkAdding(batch.items.length);
            const data = await postBulkCart(batch.items);
            if (!data || !data.success) {
                const detail = data && typeof data.contents === "string" ? data.contents : T.networkError;
                throw new Error(detail);
            }
            batch.items.forEach(item => bulkAdded.add(`${item.type}/${item.id}`));
            syncNativeCartLink().catch(() => {});
            setBulkStatus(T.bulkAdded(batch.items.length), T.bulkSkipped(batch.skipped), true);
        } catch (error) {
            ownedAccountPromise = null;
            setBulkStatus(T.bulkFailed, error && error.message || T.networkError, false, 8000);
        } finally {
            bulkCartBusy = false;
            updateBulkCartButton();
        }
    }
    let progressCompleted = false;
    let progressCompletionTimer = null;
    function updateCollectionProgress() {
        let checked = 0;
        for (const key of wishlistIds.keys()) if (checkedIds.has(key)) checked++;
        const busy = !!(collecting || draining || pendingIds.size > 0);
        // 分母用真实愿望单总数，不用已渲染条目数
        const total = Math.max(wishlistIds.size, expectedCount);
        if (busy || !checked || checked < total) {
            clearTimeout(progressCompletionTimer);
            progressCompletionTimer = null;
            progressCompleted = false;
            // 总数未就绪时不显示分母，避免闪一个错误的总数
            if (busy && total) return setProgress(serverWishlistLoaded ? T.checked(checked, total) : T.checkedOnly(checked), true);
            if (!checked) return hideProgress();
            return setProgress(T.backToTop, false);
        }
        if (!progressCompleted) {
            progressCompleted = true;
            setProgress(T.loaded, false);
            progressCompletionTimer = setTimeout(() => {
                progressCompletionTimer = null;
                setProgress(T.backToTop, false, true);
            }, 1600);
            return;
        }
        setProgress(progressCompletionTimer ? T.loaded : T.backToTop, false);
    }
    async function startCollection() {
        const run = generation;
        collecting++;
        serverWishlistLoaded = false;
        try {
            syncRows();
            renderSummary();
            const serverItems = await fetchWishlistItems();
            if (run !== generation) return;
            if (serverItems) {
                const serverKeys = new Set(serverItems.map(item => item.key));
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
            if (isFilteredView()) queuePrices();
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
    function cardGridOf(row, from, includeRow = false) {
        const img = row.querySelector("img");
        let node = from || row;
        while (node) {
            const isGrid = getComputedStyle(node).display === "grid" && node.getBoundingClientRect().width > 120 && (!img || node.contains(img));
            if (isGrid && (includeRow || node !== row)) return node;
            if (node === row) break;
            node = node.parentElement;
        }
        return null;
    }
    // 史低/当前价格行沿用"发行日期"行的原生文字样式；史低/锁区行保留脚本加粗与蓝/红配色。
    function applyNativePriceStyle(el, row) {
        const label = directLabelOf(row, RELEASE_LABEL_RE);
        if (!label) return;
        const labelStyle = copyDiscountTextStyle(el, label, [ "fontFamily", "fontSize", "fontStyle", "lineHeight", "letterSpacing" ]);
        if (el.classList.contains("at-low") || el.classList.contains("locked")) return;
        el.style.fontWeight = labelStyle.fontWeight;
        const value = label.nextElementSibling;
        el.style.color = value ? getComputedStyle(value).color : labelStyle.color;
        if (value) for (const part of el.querySelectorAll(".shc-price-label")) part.style.color = labelStyle.color;
    }
    function insertPriceLine(row, link, info, state) {
        const mobile = isMobilePriceLayout(row);
        const el = createPriceElement(info, state, mobile);
        applyNativePriceStyle(el, row);
        // 布局模式也进签名，模式变化时强制重插
        el.dataset.sig = `${state === "price" ? priceSignature(info) : state}${mobile ? "|m" : "|d"}`;
        el.dataset.layoutVersion = String(priceLayoutVersion);
        const anchor = titleLinkOf(row, link);
        const host = rowHost(row, anchor);
        const leaf = findPriceLeaf(row, false);
        const item = leaf && priceRowItem(row, leaf);
        if (mobile) {
            el.classList.add("mobile-info");
            const card = cardGridOf(row, leaf || item || anchor, true);
            const lower = card && [ ...card.children ].find(n => /\blower\b/.test(getComputedStyle(n).gridArea));
            if (lower) {
                // Steam 在 ≤500px 用 6 行网格、501~910px 用 4 行网格，按实际行数选对应行高模板，避免错配溢出。
                const rowCount = getComputedStyle(card).gridTemplateRows.split(" ").filter(Boolean).length;
                card.classList.toggle("shc-mobile-price-card", rowCount === 6);
                card.classList.toggle("shc-mobile-price-card-4", rowCount === 4);
                lower.appendChild(el);
            }
            else {
                el.style.gridColumn = "1 / -1";
                (card || host).appendChild(el);
            }
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
                alignToPriceLine(el, findPriceLeaf(item, true) || leaf, item.parentElement);
                return;
            }
        }
        if (host === row) fallbackIntoRow(el, row, anchor);
        // 直接挂到 grid 卡片上时，不指定跨列会被自动排到最窄的拖拽列，文字被挤成一字一行
        if (getComputedStyle(host).display.includes("grid")) el.style.gridColumn = "1 / -1";
        host.appendChild(el);
    }
    function discountTimeText(end, now = Date.now()) {
        const left = Math.ceil((end - now) / 1000);
        if (left <= 0) return "";
        const days = Math.floor(left / 86400);
        const hours = Math.floor(left % 86400 / 3600);
        const minutes = Math.floor(left % 3600 / 60);
        const seconds = left % 60;
        const parts = [];
        if (days > 0) parts.push(`${days}${T.days}`);
        if (days > 0 || hours > 0) parts.push(`${hours}${T.hours}`);
        parts.push(`${minutes}${T.minutes}`, `${seconds}${T.seconds}`);
        return `${T.discountLeft}${parts.join("")}`;
    }
    function discountPartElements(el) {
        let label = el.querySelector(".shc-discount-label");
        let value = el.querySelector(".shc-discount-value");
        if (!label || !value) {
            el.textContent = "";
            label = document.createElement("span");
            label.className = "shc-discount-label";
            value = document.createElement("span");
            value.className = "shc-discount-value";
            el.append(label, value);
        }
        return { label, value };
    }
    function paintDiscountTime(el, now = Date.now()) {
        const end = Number(el.dataset.end);
        if (!Number.isFinite(end) || end <= now) {
            removeDiscountTime(el);
            return;
        }
        const text = discountTimeText(end, now);
        const colon = text.indexOf("：") >= 0 ? text.indexOf("：") : text.indexOf(":");
        const labelText = colon >= 0 ? text.slice(0, colon + 1) : "";
        const valueText = (colon >= 0 ? text.slice(colon + 1) : text).trim();
        const parts = discountPartElements(el);
        if (parts.label.textContent !== labelText) parts.label.textContent = labelText;
        if (parts.value.textContent !== valueText) parts.value.textContent = valueText;
        const title = T.discountEndsAt(new Date(end).toLocaleString(IS_ZH ? "zh-CN" : "en-US"));
        if (el.title !== title) el.title = title;
    }
    // 按 grid-area 名称取卡片网格的直接子格
    function areaCellOf(row, name) {
        const card = cardGridOf(row, row.querySelector("img") || row, true);
        if (!card) return null;
        return [ ...card.children ].find(n => new RegExp(`\\b${name}\\b`).test(getComputedStyle(n).gridArea)) || null;
    }
    function mobileDiscountHosts(row) {
        const capsule = areaCellOf(row, "capsule");
        if (!capsule) return null;
        return { capsule, title: areaCellOf(row, "title") };
    }
    // 无"我的类别"行的卡（好友愿望单）：倒计时贴右落在 mid 格，与有类别行页面保持同一行位置。
    function styleDiscountInline(el) {
        restoreDiscountPurchase(el);
        el.style.position = "static";
        el.style.left = el.style.top = el.style.height = el.style.right = "";
        el.style.transform = "";
        el.style.display = "inline-flex";
        el.style.alignItems = "center";
        el.style.alignSelf = "center";
        el.style.margin = "0 0 0 auto";
        el.style.width = "max-content";
        el.style.maxWidth = "55%";
        el.style.overflow = "hidden";
        el.style.textOverflow = "ellipsis";
        el.style.whiteSpace = "nowrap";
        el.style.flex = "0 0 auto";
    }
    function placeDiscountInMidArea(el, row) {
        const mid = areaCellOf(row, "mid");
        if (!mid) return false;
        styleDiscountInline(el);
        el.style.gridColumn = "";
        el.style.textAlign = "right";
        if (el.parentElement !== mid) mid.appendChild(el);
        el._shcMobileAnchor = null;
        el._shcCategoryLine = null;
        return true;
    }
    function placeMobileDiscount(el, row) {
        restoreDiscountPurchase(el);
        if (placeDiscountInMidArea(el, row)) return true;
        const hosts = mobileDiscountHosts(row);
        const capsule = hosts && hosts.capsule;
        if (!capsule) return false;
        const capRect = capsule.getBoundingClientRect();
        el.style.position = "absolute";
        el.style.display = "flex";
        el.style.alignItems = "center";
        el.style.right = "0px";
        el.style.left = "auto";
        el.style.transform = "translateY(-50%)";
        el.style.width = "max-content";
        el.style.margin = "0";
        el.style.whiteSpace = "nowrap";
        el.style.maxWidth = `${Math.round(capRect.width * 0.5)}px`;
        el.style.overflow = "hidden";
        el.style.textOverflow = "ellipsis";
        el.style.zIndex = "10";
        el._shcCapsuleStyle = { host: capsule, position: capsule.style.position, overflow: capsule.style.overflow };
        if (getComputedStyle(capsule).position === "static") capsule.style.position = "relative";
        if (getComputedStyle(capsule).overflow !== "visible") capsule.style.overflow = "visible";
        if (el.parentElement !== capsule) capsule.appendChild(el);
        el._shcMobileAnchor = { capsule, title: hosts.title };
        syncMobileDiscountTop(el);
        return true;
    }
    function syncMobileDiscountTop(el) {
        const anchor = el._shcMobileAnchor;
        if (!anchor || !anchor.capsule.isConnected) return;
        const capRect = anchor.capsule.getBoundingClientRect();
        const titleRect = anchor.title && anchor.title.isConnected && anchor.title.getBoundingClientRect();
        const titleCenter = titleRect ? titleRect.top + titleRect.height / 2 : capRect.top + capRect.height / 2;
        const top = `${Math.max(0, Math.round(titleCenter - capRect.top))}px`;
        if (el.style.top !== top) el.style.top = top;
    }
    // 倒计时挂到"我的类别"行：整卡宽 flex 容器 + margin-left:auto 贴右，不做像素测量，拉伸自适应。
    function categoryLineOf(row) {
        const label = directLabelOf(row, CATEGORY_LABEL_RE);
        let line = label && label.parentElement;
        if (!line) return null;
        // Steam 会把该行包在更宽的同级 flex 容器里，向上爬到最宽一层，margin-left:auto 才能真正贴右。
        for (let i = 0; i < 3; i++) {
            const up = line.parentElement;
            if (!up || up === row) break;
            if (!getComputedStyle(up).display.includes("flex")) break;
            if (up.getBoundingClientRect().width < line.getBoundingClientRect().width * 1.2) break;
            line = up;
        }
        return { line, label };
    }
    function placeDiscountOnCategoryLine(el, row) {
        const target = categoryLineOf(row);
        if (!target) return false;
        const line = target.line;
        styleDiscountInline(el);
        el.style.zIndex = "10";
        if (el.parentElement !== line) line.appendChild(el);
        el._shcCategoryLine = line;
        el._shcMobileAnchor = null;
        return true;
    }
    function updateDiscountTimes() {
        const els = document.querySelectorAll(".shc-discount-time[data-end]");
        if (!els.length) return;
        const now = Date.now();
        els.forEach(el => {
            if (el.classList.contains("shc-release-discount-time")) {
                const line = el._shcCategoryLine;
                if (!line || !line.isConnected || el.parentElement !== line) {
                    const row = el.closest("div.Panel");
                    if (row && !placeDiscountOnCategoryLine(el, row)) {
                        if (el._shcMobileAnchor && el._shcMobileAnchor.capsule.isConnected) syncMobileDiscountTop(el);
                        else if (isMobileUI()) placeMobileDiscount(el, row);
                    }
                }
            }
            paintDiscountTime(el, now);
        });
    }

    const CATEGORY_LABEL_RE = /^(?:我的类别|我的類別|我的分类|我的分類|my categories)\s*[:：]?$/i;
    const RELEASE_LABEL_RE = /^(?:发行日期|發行日期|release date)\s*[:：]?$/i;
    const CART_LABEL_RE = /^(?:添加至购物车|添加到购物车|添加购物车|加入购物车|在购物车中|add to cart|in cart)\s*$/i;
    const PREORDER_LABEL_RE = /^(?:预购|預購|pre-?purchase)$/i;
    function directText(el) {
        return [ ...el.childNodes ].filter(node => node.nodeType === 3)
            .map(node => node.nodeValue).join("").trim();
    }
    function directLabelOf(row, pattern) {
        for (const label of row.querySelectorAll("div,span,button,a")) {
            if (pattern.test(directText(label))) return label;
        }
        return null;
    }
    function steamMobileLayout(row) {
        const panel = row && row.querySelector("div.Panel");
        const areas = panel && getComputedStyle(panel).gridTemplateAreas;
        if (!areas || areas === "none") return null;
        // 卡片网格含 dragger/remove 等桌面专有区域时一律视为桌面端，防止他人愿望单被误判成移动端。
        if (/\b(?:dragger|remove)\b/.test(areas)) return false;
        const purchaseRow = (areas.match(/"[^"]+"/g) || []).find(area => /\bpurchase\b/.test(area));
        if (!purchaseRow) return null;
        return (purchaseRow.match(/\bpurchase\b/g) || []).length > 1;
    }
    // 视口已判定为移动端时不能被行级网格否掉，否则同页会混用 compact / side 两套样式
    function isMobilePriceLayout(row) {
        return steamMobileLayout(row) === true || isMobileUI();
    }
    const DISCOUNT_PURCHASE_STYLES = [ "position", "paddingTop" ];
    function restoreDiscountPurchase(el) {
        const saved = el._shcDiscountPurchase;
        if (saved) {
            DISCOUNT_PURCHASE_STYLES.forEach(key => { saved.host.style[key] = saved.styles[key]; });
            delete el._shcDiscountPurchase;
        }
        const wrap = el._shcCartWrap;
        if (wrap) {
            wrap.host.style.flexWrap = wrap.value;
            delete el._shcCartWrap;
        }
        const capsule = el._shcCapsuleStyle;
        if (capsule) {
            capsule.host.style.position = capsule.position;
            capsule.host.style.overflow = capsule.overflow;
            delete el._shcCapsuleStyle;
        }
    }
    function removeDiscountTime(el) {
        restoreDiscountPurchase(el);
        el.remove();
    }
    function copyDiscountTextStyle(target, source, properties) {
        const style = getComputedStyle(source);
        for (const property of properties || [ "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing", "color" ]) {
            target.style[property] = style[property];
        }
        return style;
    }
    function syncRowDiscountTime(row, info) {
        let el = row.querySelector(".shc-release-discount-time");
        const current = info && (info.current || (info.regionLocked ? info : null));
        const valid = current && Number(current.cut) > 0 && Number.isFinite(current.discountEndsAt) && current.discountEndsAt > Date.now();
        if (!valid) {
            if (el) removeDiscountTime(el);
            return;
        }
        const releaseLabel = directLabelOf(row, RELEASE_LABEL_RE);
        const releaseRow = releaseLabel && releaseLabel.parentElement;
        const categoryLabel = directLabelOf(row, CATEGORY_LABEL_RE);
        const steamMobile = steamMobileLayout(row);
        // 行级检测只用于确认"确实是移动网格"，视口已是移动端时不能被它否掉，避免两种排版来回跳。
        const mobile = steamMobile === true || isMobileUI();
        const priceHost = mobile ? row.querySelector(".shc-price") : null;
        const cartLabel = mobile ? directLabelOf(row, CART_LABEL_RE) : null;
        const cartControl = cartLabel && (cartLabel.closest("a,button") || cartLabel);
        const cartHost = cartControl && cartControl.parentElement;
        if (!categoryLabel && !releaseRow && !priceHost && !cartHost) {
            if (el) removeDiscountTime(el);
            return;
        }
        if (!el) {
            el = document.createElement("span");
            el.className = "shc-discount-time shc-release-discount-time";
        }
        restoreDiscountPurchase(el);
        const parts = discountPartElements(el);
        const textSource = categoryLabel || releaseLabel || priceHost || cartHost;
        const native = copyDiscountTextStyle(el, textSource);
        copyDiscountTextStyle(parts.label, textSource);
        const nativeValue = releaseLabel && releaseLabel.nextElementSibling;
        copyDiscountTextStyle(parts.value, nativeValue || textSource);
        let textGap = Number.parseFloat(native.marginRight);
        if (!Number.isFinite(textGap)) textGap = 6;
        if (releaseLabel && nativeValue) {
            const labelRect = releaseLabel.getBoundingClientRect();
            const valueRect = nativeValue.getBoundingClientRect();
            const measured = valueRect.left - labelRect.right;
            if (measured > 0 && measured <= 32) textGap = measured;
        }
        if (textGap <= 0 && releaseRow) {
            const nativeGap = Number.parseFloat(getComputedStyle(releaseRow).columnGap);
            if (Number.isFinite(nativeGap) && nativeGap > 0) textGap = nativeGap;
        }
        if (textGap <= 0) textGap = 6;
        parts.label.style.marginRight = `${textGap}px`;
        el.style.left = el.style.top = el.style.height = el.style.right = "";
        el.style.width = el.style.maxWidth = el.style.margin = el.style.flex = el.style.gridColumn = el.style.transform = "";
        el.style.overflow = el.style.textOverflow = el.style.whiteSpace = el.style.alignItems = el.style.zIndex = "";
        el.style.position = mobile ? "static" : "";
        el.style.display = "";
        el._shcMobileAnchor = null;
        el._shcCategoryLine = null;
        if (placeDiscountOnCategoryLine(el, row)) {
            el.dataset.end = String(current.discountEndsAt);
            paintDiscountTime(el);
            return;
        }
        // 无"我的类别"行（他人愿望单）时走 mid 区右对齐，与有类别行页面的倒计时保持同一行位置。
        if (!mobile && placeDiscountInMidArea(el, row)) {
            el.dataset.end = String(current.discountEndsAt);
            paintDiscountTime(el);
            return;
        }
        if (mobile) {
            if (placeMobileDiscount(el, row)) {
                el.dataset.end = String(current.discountEndsAt);
                paintDiscountTime(el);
                return;
            }
            // 行节点正被 Steam 重建时先隐藏，下一秒 tick 重试，避免退回购买格造成上下跳动。
            el.style.display = "none";
            el.dataset.end = String(current.discountEndsAt);
            paintDiscountTime(el);
            return;
        }
        if (cartHost) {
            let purchaseHost = cartHost;
            while (purchaseHost && purchaseHost !== row && getComputedStyle(purchaseHost).gridColumn !== "purchase") {
                purchaseHost = purchaseHost.parentElement;
            }
            if (purchaseHost === row) purchaseHost = null;
            const preorderLabel = purchaseHost && [ ...purchaseHost.children ].find(child => PREORDER_LABEL_RE.test(directText(child)));
            if (purchaseHost) {
                el._shcDiscountPurchase = {
                    host: purchaseHost,
                    styles: Object.fromEntries(DISCOUNT_PURCHASE_STYLES.map(key => [ key, purchaseHost.style[key] ]))
                };
                el.style.position = "absolute";
                el.style.left = "0px";
                el.style.width = "max-content";
                el.style.margin = "0";
                if (getComputedStyle(purchaseHost).position === "static") purchaseHost.style.position = "relative";
                purchaseHost.style.paddingTop = preorderLabel ? "" : "20px";
                purchaseHost.insertBefore(el, purchaseHost.firstChild);
                const hostRect = purchaseHost.getBoundingClientRect();
                const preorderRect = preorderLabel && preorderLabel.getBoundingClientRect();
                const countdownHeight = el.getBoundingClientRect().height || 16;
                const top = preorderRect ? preorderRect.top - hostRect.top + (preorderRect.height - countdownHeight) / 2 : (18 - countdownHeight) / 2;
                el.style.top = `${top}px`;
            } else {
                if (el.parentElement !== cartHost || el.nextElementSibling !== cartControl) {
                    cartHost.insertBefore(el, cartControl);
                }
                const hostRect = cartHost.getBoundingClientRect();
                const cartRect = cartControl.getBoundingClientRect();
                const left = Math.max(0, Math.round((cartRect.left - hostRect.left) * 100) / 100);
                const width = `calc(100% - ${left}px)`;
                el.style.width = width;
                el.style.margin = `0 0 8px ${left}px`;
                const hostStyle = getComputedStyle(cartHost);
                if (hostStyle.display.includes("flex")) {
                    el.style.flex = `0 0 ${width}`;
                    if (hostStyle.flexWrap === "nowrap") {
                        el._shcCartWrap = { host: cartHost, value: cartHost.style.flexWrap };
                        cartHost.style.flexWrap = "wrap";
                    }
                }
                if (hostStyle.display.includes("grid")) el.style.gridColumn = "1 / -1";
            }
            el.dataset.end = String(current.discountEndsAt);
            paintDiscountTime(el);
            return;
        }
        if (priceHost) {
            if (el.parentElement !== priceHost || priceHost.firstElementChild !== el) {
                priceHost.insertBefore(el, priceHost.firstChild);
            }
            el.dataset.end = String(current.discountEndsAt);
            paintDiscountTime(el);
            return;
        }
        if (getComputedStyle(releaseRow).position === "static") releaseRow.style.position = "relative";
        if (el.parentElement !== releaseRow) releaseRow.appendChild(el);
        const releaseRect = releaseRow.getBoundingClientRect();
        const labelRect = releaseLabel.getBoundingClientRect();
        const categoryRow = categoryLabel && categoryLabel.parentElement;
        const gap = categoryRow ? releaseRect.top - categoryRow.getBoundingClientRect().bottom : 24;
        const height = releaseRect.height || 16;
        const top = gap >= height ? -(gap + height) / 2 : -(height + 4);
        el.style.left = `${Math.max(0, labelRect.left - releaseRect.left)}px`;
        el.style.top = `${Math.round(top * 100) / 100}px`;
        el.style.height = `${height}px`;
        el.dataset.end = String(current.discountEndsAt);
        paintDiscountTime(el);
    }
    function createPriceElement(info, state, mobile) {
        const div = document.createElement("div");
        const compact = mobile ? " compact" : "";
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
            return `<span class="${cls}"><span class="shc-price-label">${label}</span>${formatPrice(entry.price.amount, entry.price.currency)}${cut ? ` <span class="shc-discount">${cut}</span>` : ""}</span>`;
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
        // 只看史低时非史低行是 display:none，测量为 0 会走错降级路径，恢复可见后再画
        if (!row.getClientRects().length) return;
        const link = rowLink(row);
        const r = link && keyOfHref(link.href);
        if (!r) return;
        const info = prices[r.key];
        syncRowDiscountTime(row, info);
        const state = rowState(info);
        const mobile = isMobilePriceLayout(row);
        if (!state || !mobile) {
            row.querySelectorAll(".shc-mobile-price-card, .shc-mobile-price-card-4").forEach(card => card.classList.remove("shc-mobile-price-card", "shc-mobile-price-card-4"));
        }
        const existing = row.querySelector(".shc-price");
        if (!state) {
            if (existing) existing.remove();
            return;
        }
        const sig = `${state === "price" ? priceSignature(info) : state}${mobile ? "|m" : "|d"}`;
        if (existing && existing.dataset.sig === sig && existing.dataset.layoutVersion === String(priceLayoutVersion)) return;
        if (existing) existing.remove();
        insertPriceLine(row, link, info, state);
        syncRowDiscountTime(row, info);
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
    let progressTextTimer = null;
    function setProgress(text, loading = true, transition = false) {
        const div = getProgressDiv();
        const label = div.querySelector(".shc-wishlist-progress-text");
        if (label && label.dataset.text !== text) {
            label.dataset.text = text;
            clearTimeout(progressTextTimer);
            progressTextTimer = null;
            if (transition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
                label.classList.add("changing");
                progressTextTimer = setTimeout(() => {
                    label.textContent = text;
                    label.classList.remove("changing");
                    progressTextTimer = null;
                }, 150);
            } else {
                label.textContent = text;
                label.classList.remove("changing");
            }
        }
        div.classList.toggle("loading", loading);
        div.classList.add("show");
    }
    function hideProgress() {
        getProgressDiv(false)?.classList.remove("show");
    }
    function scrollWishlistToTop(smooth = true) {
        const options = { top: 0, behavior: smooth ? "smooth" : "auto" };
        const host = scrollHostOf(document.querySelector(ROW_SELECTOR));
        if (host) {
            if (typeof host.scrollTo === "function") host.scrollTo(options);
            else host.scrollTop = 0;
        }
        window.scrollTo(options);
    }
    const CAT_SPINNER = '<svg viewBox="190 208 1158 1163" aria-hidden="true" focusable="false"><path fill="currentColor" d="M535,541c-.25-7.56,1.82-42.42,9.92-44.8c7.93-2.33,44.19,28.34,50.16,33.34c3.56,2.99,7.06,6.14,9.55,10.12c2.27,3.63,3.49,8.48,6.71,11.32c4.03,3.55,10.1,5.42,14.71,8.32c9.48,5.95,17.53,13.83,24.37,22.65c11.08,14.28,17.48,30.17,26.45,45.56c9.99,17.14,27.3,30.26,44.81,38.96c59.34,29.52,108.99,16.11,170.13,26.66c36.67,6.33,78.62,23.68,108.33,46.21c69.23,52.52,110.51,145.42,112.92,231.25c.78,27.88-.03,55.18-8.35,82.05c-1.67,5.39-7.59,17.32-6.37,22.43c.11,.46,.38,1.58,.66,1.93c4.37,5.32,15.42,.62,20.16-1.58c23.42-10.86,39.26-31.74,48.53-55.3c7.7-19.56,10.83-39.43,10.67-60.39c-.31-40.73-11.21-65.32-30.61-100.19c-8.44-15.16-16.33-29.06-21.54-45.79c-5.07-16.26-6.28-32.04-6.5-48.96c-.29-21.45,5.14-42.59,17.54-60.29c13.97-19.92,27.51-27.14,52.08-26.18c14.61,.58,24.88,13.99,23.86,28.1c-.3,4.16-1.71,8.84-4.55,11.99c-9.92,10.99-22.1,8.77-27.41,26.14c-1.87,6.11-1.64,12.44-1.58,18.76c.39,37.71,22.8,65.15,37.73,97.94c9.23,20.26,16.43,41.76,20.68,63.64c5.6,28.84,3.21,57.65-2.49,86.25c-6.12,30.76-18.13,62.16-38.18,86.6c-19.51,23.79-40.73,41.13-70.22,51.02c-15.34,5.14-32.01,5.5-48.03,5.12c-6.98-.16-14.88-1.14-21.78-.34c-5.19,.61-6.65,3.58-10.36,6.46c-4.94,3.83-13.63,5.73-19.71,6.55c-13.14,1.77-27.14,.92-40.41,.92c-22.23,0-44.46,0-66.69,.05c-22.62,.05-45.24,.15-67.86,.11c-9.29-.01-21.01,1.56-29.87-.9c-6.86-1.91-11.29-8.03-12.46-14.73c-5.46,.24-13.77,1.53-18.95-.52c-15.57-6.18-14.72-29.49-1.2-37.3c2.2-1.28,4.58-1.89,7.09-2.13c9.54-.92,86.49-.91,92.06,.95c0-.66,0-1.32,0-2c-9.57-1.1-21.82-9.5-29.78-14.84c-25.01-16.76-45.48-42.76-47.92-73.74c-.6-7.55,3.04-19.16-2.05-25.27c-5.76-6.92-65.49-32.04-77.25-36.15c-10.54,20.18-17.45,43.31-25.49,64.63c-10.25,27.21-21.69,53.93-31.99,81.11c-4.58,12.09-14.14,43.46-21.28,51.37c-6.15,6.79-18.49,8.88-27.12,9.19c-7.02,.25-14.07,.1-21.09,.19c-14.26,.19-34.23,2.03-37.86-16.32c-2.4-12.11,6.32-24.91,18.02-28.37c5.53-1.63,16.1,.84,19.92-3.32c2.93-3.19,4.96-12.13,5.94-16.37c2.01-8.61,3.08-17.54,4.49-26.27c2.23-13.73,4.58-27.42,6.6-41.19c2.87-19.51,6.6-38.91,8.14-58.59c1.02-13,1.14-26.09-.28-39.06c-57.49,1.03-110.84-16.8-164.32-35.81c-15.42-5.48-42.88-17.23-58.16-18.38c-21.89-1.65-40.94,16.61-62.75,9.02c-.6-.2-1.18-.43-1.76-.69c-32.39-14.09-22.93-52.14,7.33-61.53c7.38-2.29,12.25,1.22,18.62,0c2.73-.52,4.73-2.03,7.12-3.29c3.43-1.79,7.85-2.65,11.67-3.11c8.52-1.04,17.47-.53,26.05-.3c16.15,.45,32.28,1.42,48.39,2.57c29.24,2.09,58.75,3.67,87.81,7.52c-8.44-20.73-8.81-42.56-8.29-64.65c.3-12.66,6.61-23.74-.71-36.35c-9.26-15.95-31.79-2.83-44.77-.26c-7.66,1.51-16.58,1.31-23.85-1.8c-5.03-2.15-10.39-5.88-13.4-10.49c-1.21-1.87-1.93-4.14-3.62-5.66c-1.49-1.35-3.6-2.06-5.32-3.09c-2.88-1.73-5.44-3.94-7.63-6.48c-3.4-3.93-11.91-17.93-12.21-22.85c-.1-1.62,1.22-3.07,2.15-4.26c3.76-4.82,6.55-10.77,8.23-16.64c2.58-9.01,2.16-17.66,2.47-26.88c.69-20.79,8.29-39.2,22.18-54.66c4.86-5.41,10.35-12.36,17.77-13.93c-2.49-10.86-12.41-46.59-10-56c15.48,1.62,47.03,22.77,62,31Z"/><path fill="currentColor" d="M351.49,1192.31c-4.88-4.28-9.03-9.91-13.52-14.67c-30.45-32.27-56.33-69.88-77.21-108.97c-33.02-61.78-55.41-130.74-63.1-200.47c-2.57-23.31-3.14-46.63-3.09-70.06c.04-20.07,.14-40.17,2.11-60.16c10.95-110.84,55.31-218.46,123.85-306.01C440.66,278.5,626.91,197.24,821.13,214.7c142.56,12.81,276.51,80.03,372.49,185.99c29.4,32.46,53.75,67.04,75.29,105.13c19.27,34.07,35.92,68.67,47.5,106.18c3.77,12.18,6.51,24.43,9.57,36.79c3.01,12.18,6.26,24.09,8.54,36.46c5.28,28.65,7.54,57.78,8.38,86.87c1.5,51.9-1.7,102.43-13.2,153.19c-49.14,216.79-220.14,382.81-437.09,428.68c-14.58,3.08-29.02,6.2-43.81,8.14c-24,3.14-48.23,4.12-72.41,4.28c-94.78,.63-183.04-17.13-268.37-59.38c-44.56-22.06-84.34-50.17-122.15-82.28c-12.02-10.21-22.2-22.52-34.38-32.44Zm781.74-5.54c9.52-9.52,19.78-18.09,28.96-28.05c26.58-28.85,49.95-61.67,69.35-95.72c31.6-55.47,55.19-123.31,64.39-186.5c4.01-27.55,5.24-55.33,5.26-83.14c.03-47.38-4.66-95.15-16.51-141.13C1240.86,482.22,1114.74,343.7,949.93,283.8c-12.85-4.67-25.28-9.62-38.51-13.26c-33.34-9.17-69.44-15.75-103.95-18.07c-16.44-1.1-33.11-.77-49.59-.68c-126.12,.69-245.15,51.27-339.06,134.22c-9.52,8.41-19.08,16.71-27.98,25.79c-6.49,6.61-12.1,13.74-18.18,20.67c-55.22,63-95.85,139.09-117.77,219.93c-13.07,48.23-18.95,96.4-19.02,146.32c-.03,17.9,.26,35.81,2.12,53.63c2.55,24.53,7.3,48.99,13.18,72.93c6.7,27.26,14.5,54.6,25.36,80.53c34.3,81.9,89.55,153.01,159.52,207.45c126.11,98.13,286.02,133.93,442.52,102.76c81.39-16.21,159.66-50.67,224.29-103.08c10.18-8.26,21.3-16.73,30.37-26.17Z"/></svg>';
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
        const mark = document.createElement("span");
        mark.className = "shc-mark";
        mark.innerHTML = CAT_SPINNER;
        icon.append(mark);
        const label = document.createElement("span");
        label.className = "shc-wishlist-progress-text";
        label.setAttribute("aria-live", "polite");
        label.setAttribute("aria-atomic", "true");
        div.append(icon, label);
        let pointerStart = null;
        let tapped = false;
        const cancelTap = () => { tapped = false; };
        // 短列表不一定产生 scroll，必须根据完整指针手势确认点击，而不是只监听按钮上的 touch。
        window.addEventListener("pointerdown", event => {
            tapped = event.isPrimary && event.button === 0 && div.contains(event.target);
            pointerStart = tapped ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
        }, { capture: true, passive: true });
        const checkPointer = event => {
            if (!pointerStart || event.pointerId !== pointerStart.id) return;
            if (Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 4) tapped = false;
        };
        window.addEventListener("pointermove", checkPointer, { capture: true, passive: true });
        window.addEventListener("pointerup", event => {
            checkPointer(event);
            if (pointerStart && event.pointerId === pointerStart.id) pointerStart = null;
        }, { capture: true, passive: true });
        window.addEventListener("pointercancel", () => {
            cancelTap();
            pointerStart = null;
        }, { capture: true, passive: true });
        window.addEventListener("wheel", cancelTap, { capture: true, passive: true });
        window.addEventListener("scroll", cancelTap, { capture: true, passive: true });
        div.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            const activate = event.detail === 0 || tapped;
            tapped = false;
            if (activate) scrollWishlistToTop();
        });
        div.addEventListener("keydown", event => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            scrollWishlistToTop();
        });
        document.body.appendChild(div);
        return div;
    }
    function resetAndReload() {
        lowOnly = false;
        generation++;
        wishlistIds.clear();
        pendingIds.clear();
        doneIds.clear();
        checkedIds.clear();
        fetchedKeys.clear();
        failCount.clear();
        expectedCount = 0;
        serverWishlistLoaded = false;
        loadPriceCache();
        document.querySelectorAll(".shc-price").forEach(e => e.remove());
        document.querySelectorAll(".shc-release-discount-time").forEach(removeDiscountTime);
        paintVisibleRows();
        startCollection();
    }
    let lastMobile = null;
    let lastSteamMobile = null;
    const scheduleHarvest = debounce(() => {
        syncRows();
        refreshExpected();
        paintVisibleRows();
        scheduleSummary();
    }, 250);
    function applyViewportMode() {
        const mobile = isMobileUI();
        const steamMobile = steamMobileLayout(document.querySelector(ROW_SELECTOR));
        const steamChanged = steamMobile !== null && lastSteamMobile !== null && steamMobile !== lastSteamMobile;
        const previous = lastMobile;
        lastMobile = mobile;
        lastSteamMobile = steamMobile;
        updateBulkCartButton();
        // Steam 在 resize 后延迟重排网格且只改类名，观察器不触发；落定后再强制重画一遍，避免停留过渡混合样式。
        clearTimeout(viewportSettleTimer);
        viewportSettleTimer = setTimeout(() => {
            priceLayoutVersion++;
            paintVisibleRows();
        }, 700);
        if (previous === null || mobile === previous && !steamChanged) return;
        const countdownRows = new Set();
        document.querySelectorAll(".shc-discount-time").forEach(el => {
            const row = el.closest(ROW_SELECTOR);
            if (row) countdownRows.add(row);
        });
        priceLayoutVersion++;
        countdownRows.forEach(row => paintRow(row));
        paintVisibleRows();
    }
    let viewportSettleTimer = null;
    const dismissedCartDialogs = new WeakSet;
    function dismissSteamCartDialogs() {
        document.querySelectorAll("dialog").forEach(dialog => {
            if (!dialog.querySelector(".AhNg9jT4hrc-") || dismissedCartDialogs.has(dialog) && !dialog.open) return;
            dismissedCartDialogs.add(dialog);
            const closeButton = dialog.querySelector("button");
            if (closeButton) closeButton.click();
            if (dialog.open && typeof dialog.close === "function") dialog.close();
        });
    }
    function isOwnNode(node) {
        const el = node.nodeType === 1 ? node : node.parentElement;
        return !!(el && el.closest(OWN_SELECTOR));
    }
    function isOwnRecord(r) {
        if (isOwnNode(r.target)) return true;
        if (r.type !== "childList") return false;
        const changed = [ ...r.addedNodes, ...r.removedNodes ];
        return changed.length > 0 && changed.every(isOwnNode);
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
        startCollection();
        startCountdown();
        new MutationObserver(records => {
            if (barNode && barNode.dataset.ready === "1" && !barNode.isConnected) insertSummary(barNode, rowsHost());
            if (bulkCartButton && !bulkCartButton.isConnected) updateBulkCartButton();
            const external = records.filter(r => !isOwnRecord(r));
            if (lowOnly && external.length) hideNewRowsInLowOnly(external);
            if (external.some(r => r.type === "childList")) scheduleHarvest();
        }).observe(document.body, { childList: true, characterData: true, subtree: true });
        new MutationObserver(dismissSteamCartDialogs).observe(document.body, {
            childList: true, subtree: true, attributes: true, attributeFilter: [ "open" ]
        });
        dismissSteamCartDialogs();
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
        .shc-release-discount-time { position: absolute; z-index: 1; display: flex;
            align-items: center; white-space: nowrap; pointer-events: none; }
        .shc-release-discount-time .shc-discount-label,
        .shc-release-discount-time .shc-discount-value { flex: none; }
        .shc-price.at-low { color: #4a9eff; font-weight: bold; }
        .shc-price.at-low .shc-discount { color: #4a9eff; }
        .shc-price.locked { color: #e74c3c; font-weight: bold; }
        .shc-price.side { width: auto; min-width: 0; max-width: 340px; flex: 0 1 auto;
            text-align: left; margin: 0 clamp(6px, 1vw, 14px) 0 0; line-height: 1.5; }
        .shc-summary { display: flex; align-items: center; flex-wrap: wrap;
            box-sizing: border-box; width: 100%; min-width: 0; gap: 0 clamp(6px, 1.1vw, 12px);
            line-height: 24px; margin: 6px 0 12px; padding: 10.5px clamp(8px, 1.4vw, 12px);
            background: #132434; border: 1px solid rgba(255,255,255,.08); border-radius: 4px;
            font-size: 11.5px; color: #acb2b8; font-family: 'Motiva Sans', Arial, sans-serif;
            -webkit-user-select: text; user-select: text; position: sticky; top: 0; z-index: 900; }
        .shc-summary .label, .shc-summary .dim { color: #8b929a; }
        .shc-summary .main { color: #66c0f4; font-weight: 600; }
        .shc-summary .cur { color: #fff; font-weight: 600; }
        .shc-summary .save { color: #a5cb00; }
        .shc-summary .warn { color: #ffc53d; }
        .shc-summary-body { display: block; flex: 1 1 auto; min-width: 0;
            line-height: inherit; white-space: normal; text-align: left; }
        .shc-summary .shc-summary-body > :not(:last-child) { margin-right: .5em; }
        .shc-summary .shc-seg { display: inline; }
        .shc-summary .shc-seg > .label, .shc-summary .shc-seg > .dim { white-space: nowrap; }
        .shc-summary .main, .shc-summary .cur, .shc-summary .shc-money { white-space: normal; word-break: break-all; }
        .shc-bulk-title-row { min-width: 0; flex: 1 1 auto; align-self: stretch; }
        /* 原生按钮的左内边距归零，让首行文字与续行左对齐。 */
        .shc-summary button.shc-low-toggle { display: inline-flex; vertical-align: baseline;
            margin: 0; padding-block: 0; padding-left: 0; line-height: 24px; white-space: nowrap; font-weight: 600; font-size: 12px; }
        .shc-low-toggle:not(.Focusable) { display: inline-flex; align-items: center; gap: 4px;
            padding: 2px 5px 2px 0; border: 0; background: transparent; color: #fff; font: inherit; cursor: pointer; }
        .shc-low-toggle:not(.Focusable) > svg { width: 12px; height: 12px; }
        .shc-low-toggle:not(.Focusable)[aria-expanded="true"] { color: #1a9fff; text-decoration: underline; text-underline-offset: 4px; }
        .shc-low-drawer-open { box-sizing: border-box; padding: 6px;
            border-radius: 4px; background: rgba(23,29,37,.35); }
        .shc-low-drawer-enter { animation: shc-low-drawer-in .18s ease-out; }
        @keyframes shc-low-drawer-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        #shc-bulk-cart { flex: 0 0 auto; box-sizing: border-box; min-height: 32px; margin-left: auto;
            padding: 0 14px; border: 0; border-radius: 2px; cursor: pointer;
            background: linear-gradient(90deg, #6fa720, #8fbf3f); color: #d2efa9;
            font: 600 12px 'Motiva Sans', Arial, sans-serif; white-space: nowrap; }
        #shc-bulk-cart:hover:not(:disabled) { background: linear-gradient(90deg, #82b92c, #a0ce4e); color: #fff; }
        #shc-bulk-cart:disabled { opacity: .45; cursor: default; }
        #shc-country-controls { display: block; margin-left: auto; text-align: right;
            flex: 0 1 auto; min-height: 24px; min-width: 0; max-width: 100%; line-height: 24px; white-space: normal; }
        #shc-country-controls > .shc-cc { margin-left: 6px; height: 24px; align-items: center; vertical-align: top; white-space: nowrap; }
        #shc-sale-countdown { display: inline; font-size: 12px; line-height: inherit; }
        #shc-sale-countdown > span { white-space: nowrap; }
        #shc-sale-countdown .shc-cd-date { color: #66c0f4; font-weight: 600; }
        #shc-sale-countdown .shc-cd-state, #shc-sale-countdown .shc-cd-unit { color: #8b929a; }
        #shc-sale-countdown .shc-cd-num { margin-right: 1.5px; color: #8b5cf6; font-weight: 600; }
        #shc-wishlist-progress { position: fixed; bottom: calc(env(safe-area-inset-bottom, 0px) + 52px); right: calc(env(safe-area-inset-right, 0px) + 12px);
            z-index: 9999; box-sizing: border-box; max-width: 82vw; min-height: 32px;
            background: rgba(23,29,37,.70); border: 1px solid rgba(255,255,255,.12); border-radius: 5.5px;
            cursor: pointer; align-items: center; justify-content: center; gap: 3px; padding: 2px 6.5px;
            font-size: 12px; line-height: 1.3; color: #acb2b8; display: none; box-shadow: 0 3px 10px rgba(0,0,0,.25); }
        #shc-wishlist-progress.show { display: flex; }
        #shc-wishlist-progress:hover { background: rgba(23,29,37,.88); border-color: rgba(255,255,255,.24); }
        #shc-wishlist-progress .shc-wishlist-progress-icon { display: inline-flex; align-items: center; flex: 0 0 auto; }
        #shc-wishlist-progress .shc-wishlist-progress-text { min-width: 0; transition: opacity .15s ease; }
        #shc-wishlist-progress .shc-wishlist-progress-text.changing { opacity: 0; }
        #shc-wishlist-progress .shc-mark { display: inline-flex; align-items: center; width: 15px; height: 15px; color: #e8ebee; }
        #shc-wishlist-progress .shc-mark svg { display: block; width: 100%; height: 100%; }
        #shc-wishlist-progress.loading .shc-mark svg { animation: shc-mark-spin 3.4s cubic-bezier(.42,0,.58,1) infinite; }
        @keyframes shc-mark-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }

        /* 移动端规则走媒体查询而非 .shc-mobile 标记：Steam 水合/重渲染会重写 <html> class，
           依赖标记会被抹掉，表现为移动端样式时好时坏 */
        @media (max-width: 720px), (pointer: coarse) and (max-width: 900px) {
            .shc-summary { margin: 4px 0 10px; padding: 6px clamp(8px, 1.4vw, 12px); }
            .shc-low-drawer-open { padding: 4px; }
            #shc-bulk-cart { min-height: 30px; padding: 0 10px; font-size: 11px; }
            /* 倒计时+地区按钮锁成一条不换行的右对齐 flex 行：按钮位置不随倒计时位数/汇总文字变化而跳动 */
            #shc-country-controls { display: flex; flex-wrap: nowrap; justify-content: flex-end;
                align-items: center; flex: 0 0 auto; line-height: 22px; }
            #shc-country-controls > .shc-cc { flex: 0 0 auto; margin-left: 3px; height: 22px; }
            .shc-cc-btn { padding: 1px 4px; font-size: 11px; gap: 2px; }
            #shc-sale-countdown { flex: 0 1 auto; min-width: 0; overflow: hidden;
                white-space: nowrap; text-overflow: ellipsis; font-size: 11px; word-spacing: -1.5px; }
            #shc-sale-countdown .shc-cd-date { display: none; }
            /* 数字定宽（等宽数字+2ch 槽），分/时进位时倒计时总宽不变，按钮左缘保持不动 */
            #shc-sale-countdown .shc-cd-num { display: inline-block; min-width: 2ch;
                text-align: right; font-variant-numeric: tabular-nums; }
            .shc-price.compact { margin-top: 2px; line-height: 1.35;
                font-size: 12px; max-width: 100%; min-width: 0;
                white-space: normal; overflow-wrap: anywhere; }
            .shc-release-discount-time { position: static; display: block;
                width: auto; white-space: nowrap; }
            .shc-mobile-price-card { grid-template-rows: 30px auto 28px 25px minmax(42px, auto) minmax(40px, auto); }
            /* 501~910px 的 4 行网格：只放宽 lower(第3行)/purchase(第4行) 并取消固定卡高，避免 6 行模板错配导致内容溢出 */
            .shc-mobile-price-card-4 { height: unset; grid-template-rows: 32px 26px minmax(38px, auto) minmax(42px, auto); }
            /* 史低/当前同一行右端显示：不收缩、不换行，避免窄屏把「当前 ¥xx」挤到下一行 */
            .shc-price.compact.mobile-info { flex: 0 0 auto; align-self: start; justify-self: end;
                position: relative; top: -3.5px;
                width: max-content; min-width: 0; margin: 0 0 0 8px; padding: 0;
                font-size: 10px; line-height: 1.25; text-align: right; white-space: nowrap; }
            .shc-price.compact.mobile-info .shc-mobile-lowline,
            .shc-price.compact.mobile-info .shc-mobile-currentline { display: inline; white-space: nowrap; }
            /* 生成内容的空格会被折叠掉，用外边距保证史低与当前之间约两个空格的间隔 */
            .shc-price.compact.mobile-info .shc-mobile-currentline { margin-left: 1em; }
        }
    `);
    initWishlist();
})();
