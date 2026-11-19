<div align="center">
  <h1>
    <img src="assets/icon.svg" width="32" height="32" 
         />
    Steam Wishlist Enhancer
  </h1>
</div>

<div align="center">

<a href="https://github.com/beerleexc"><img src="https://img.shields.io/badge/Author-beerleexc-blue.svg"></a>
<a href="https://github.com/beerleexc/Steam-Wishlist-Enhancer/releases"><img src="https://img.shields.io/github/v/release/beerleexc/Steam-Wishlist-Enhancer?color=green"></a>
<a href="https://github.com/beerleexc/Steam-Wishlist-Enhancer/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-orange.svg"></a>
<a href="https://github.com/beerleexc/Steam-Wishlist-Enhancer/blob/main/README.EN.md"><img src="https://img.shields.io/badge/document-English-red.svg"></a>
<a href="https://github.com/beerleexc/Steam-Wishlist-Enhancer/blob/main/README.md"><img src="https://img.shields.io/badge/Windows-MacOS-navy.svg"></a>
<a href="https://github.com/beerleexc/Steam-Wishlist-Enhancer/blob/main/README.md"><img src="https://img.shields.io/badge/Android-IOS-deeppink.svg"></a>
</div>

> [!NOTE]
> 本脚本仅作用于 **[Steam 愿望单](https://store.steampowered.com/wishlist)**，脚本不会上传你的Steam账号、Cookie给第三方；所有请求均为获取公开价格、愿望单列表；账号已拥有游戏列表仅在本地浏览器读取，不会外传。脚本运行所需数据将储存在本地。。

<a id="目录导航"></a>
# 📑 [目录导航](#目录导航)
> 点击 **目录标题** 可以快速定位到相关正文<br>
> 点击正文的 **蓝色标题** 可以快速回到目录
> * [核心功能](#核心功能)
>     * [史低查询](#史低查询)
>     * [汇总与统计](#汇总与统计)
>     * [季节特卖倒计时](#季节特卖倒计时)
> * [效果展示](#效果展示)
>     * [功能概览](#功能概览)
>     * [国家切换](#国家切换)
>     * [移动端适配](#移动端适配)
>     * [客户端适配](#客户端适配)
>     * [返回顶部按钮](#返回顶部按钮)
>     * [折扣倒计时](#折扣倒计时)
>     * [只看史低](#只看史低)
>     * [一键加购](#一键加购)
> * [使用与安装](#使用与安装)
> * [数据来源](#数据来源)
> * [使用说明](#使用说明)
> * [问题反馈](#问题反馈)
> * [开源许可](#license)
> * [相关推荐](#相关推荐)
> * [支持作者](#支持一下)
---
<a id="核心功能"></a>
# ✨ [核心功能](#目录导航)
<a id="史低查询"></a>
## 🏷️ 史低查询
- 在愿望单中直接显示每个游戏的多地区当前价格与历史最低价。
- 史低价格蓝色高亮、折扣百分比、无数据警告。
- 价格缓存：30 分钟内视为新鲜，最长保留 24 小时；请求节流，减少 API 调用。
<a id="汇总与统计"></a>
## 📊 汇总与统计
- 显示愿望单“当前合计”和“史低合计”。
- 显示“等史低可省”金额。
- 按汇率折算为人民币；在适用时显示非人民币原币种合计。
<a id="季节特卖倒计时"></a>
## ⏱️ 折扣和特卖倒计时
- 显示 Steam 季节特卖倒计时：冬季、春季、夏季、秋季特卖。
- 支持“距开始 / 距结束”倒计时。
## 🛒 购物车一键加购
- 筛选史低游戏，一键全选加入购物车。
- 自动跳过 steam 的确认弹窗。
---
<a id="效果展示"></a>
# 📸 [效果展示](#目录导航)

## 功能概览
<img src="assets/CleanShot_11.47.14.png" width="100%">
自动加载愿望单游戏，显示当前价格、历史史低价；愿望单顶部汇总栏展示：史低合计、当前合计、预估节省金额。愿望单数量较多时，由于史低价格接口的限制，会优先抓取计算ID排序前100的游戏。余下游戏采取懒加载策略。
价格数据会自动存入脚本存储，普通价格缓存30分钟，最长保留24小时，汇率缓存24小时，特卖信息缓存6小时，减少重复网络请求。切换地区、页面刷新会重新拉取价格。

## 国家切换
<img src="assets/IMG_3782.jpg" width="100%">
页面顶部汇总栏有地区下拉选择器，可切换国家。切换后会重新拉取对应地区价格。
支持切换查询地区：中国🇨🇳、美国🇺🇸、印度🇮🇳、印尼🇮🇩、日本🇯🇵、乌克兰🇺🇦、俄罗斯🇷🇺、独联体🇦🇿、阿根廷🇦🇷、土耳其🇹🇷。
按地区自动选择历史最低价来源：中国/美国/印度/印尼/日本使用 [ITAD](https://isthereanydeal.com/) ；乌克兰/俄罗斯/独联体/阿根廷/土耳其使用小黑盒 API。


## 移动端适配
<img src="assets/IMG_3784.jpg" width="100%">


## 客户端适配
![客户端适配](assets/CleanShot_12.24.48.png)
脚本会根据steam页面/浏览器语言自动切换中文/英文 UI。检测非中文语言时会自动切换至英文。


## 返回顶部按钮
![pretty cat](assets/CleanShot_14.40.46.png)
按钮会显示愿望单的已加载成功的项目数量，点击可返回愿望单顶部。

## 折扣倒计时
![折扣倒计时](assets/CleanShot_00.21.14.png)
<a id="只看史低"></a>
## 只看史低
![只看史低](assets/CleanShot_11.45.20.png)
<a id="一键加购"></a>
## 一键加购
![全部加购](assets/CleanShot_12.00.26.png)
可以加购整个愿望单，开启“只看史低”时，仅把史低游戏加入购物车。开启脚本会会自动跳过 steam 的加入购物车成功提示的弹窗。

<a id="使用与安装"></a>
# 📥 [使用与安装](#目录导航)
> [!TIP]
> **推荐搭配脚本管理器使用：**
> * **PC端**：推荐使用 [Tampermonkey](http://tampermonkey.net/)
> * **iOS端**：推荐使用 [Stay](https://apps.apple.com/cn/app/stay-for-safari-%E7%94%A8%E6%88%B7%E8%84%9A%E6%9C%AC%E4%B8%8E%E5%B9%BF%E5%91%8A%E6%8B%A6%E6%88%AA%E6%8F%92%E4%BB%B6/id1591620171)
> * **Steam客户端**：推荐使用 [脚本猫](https://scriptcat.org/zh-CN)
---
## 安装地址
> * [Github](https://github.com/beerleexc/Steam-Wishlist-Enhancer/releases)
> * [GreasyFork](https://greasyfork.org/zh-CN/scripts/605431)
> * [脚本猫](）
---

<a id="数据来源"></a>
# 🔒 [数据来源](#目录导航)
脚本会请求以下域名：
- `api.augmentedsteam.com`：Augmented Steam 价格/史低数据
- `api.xiaoheihe.cn`：小黑盒史低数据
- `api.steampowered.com`：Steam 商店/地区价格数据
- `store.steampowered.com`：Steam 愿望单/商店数据
- `partner.steamgames.com`：Steam 季节特卖活动页
- `open.er-api.com`：汇率数据
---

<a id="问题反馈"></a>
# 🐛 [问题反馈](#目录导航)
如有 Bug、功能建议，欢迎提交 [**Issues**](https://github.com/beerleexc/Steam-Wishlist-Enhancer/issues)
---

<a id="使用说明"></a>
# 📝 [使用说明](#目录导航)
> [!note]
> **注意：**
> * 价格与史低数据仅供参考，最终价格以 Steam 结算页为准。第三方数据可能缺失、延迟或存在地区/货币误差。
> * 价格数据会自动存入脚本存储，普通价格缓存30分钟，最长保留24小时，汇率缓存24小时，特卖信息缓存6小时，减少重复网络请求。切换地区、页面刷新会重新拉取价格。
> * 推荐愿望单总数在100时使用效果最佳，数量越多耗时越慢。默认一次性获取ID排序前100游戏的史低价格
---

<a id="license"></a>
# 📄 [开源许可](#目录导航)
本项目基于[**MIT License**](https://github.com/beerleexc/Steam-Wishlist-Enhancer/blob/main/LICENSE)开源，欢迎学习与使用。
---

<a id="相关推荐"></a>
# 🪁 相关推荐

## beerlee：Steam-Registerkey-Enhancer
作者: [beerlee](https://github.com/beerleexc)
- [GreasyFork](https://greasyfork.org/zh-CN/scripts/605973)
- [GitHub](https://github.com/beerleexc/Steam-Registerkey-Enhancer)

## marioplus：Steam-Price-Converter
作者: [marioplus](https://github.com/marioplus)
- [GreasyFork](https://greasyfork.org/zh-CN/scripts/452504)
- [GitHub](https://github.com/marioplus/steam-price-converter)

---

<a id="支持作者"></a>
# 💗 [支持作者](#目录导航)
**喜欢的话就点个⭐Star 吧(°∀°)ﾉ**
**或者也可以考虑捐助支持一下哦(｀・ω・´)**
<p align="center">
<img src="assets/AliPay.PNG" width="48%">
<img src="assets/WeChat.JPG" width="48%">
</p>

作者：**beerlee**  
版本：**1.8.3**
