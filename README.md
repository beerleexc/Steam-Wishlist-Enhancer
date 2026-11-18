<div align="center">
  <h1>
    <img src="assets/icon.svg" width="32" height="32" 
         />
    Steam Wishlist Enhancer
  </h1>
</div>

> [!NOTE]
> 本脚本仅作用于 **[Steam 愿望单](https://store.steampowered.com/wishlist)**，所有数据仅供展示与参考，不会修改您的 Steam 账户数据，请放心使用。

## [使用目录](#使用目录)

> 点击 **目录标题** 可以快速定位到相关正文<br>
> 点击正文的 **蓝色标题** 可以快速回到目录

> * [核心功能](#核心功能)
>     * [史低查询](#史低查询)
>     * [汇总与统计](#汇总与统计)
>     * [季节特卖倒计时](#季节特卖倒计时)
> * [效果展示](#效果展示)
> * [使用与安装](#使用与安装)
> * [权限与数据来源](#权限与数据来源)
> * [说明](#说明)
> * [License](#license)

---

## [核心功能](#使用目录)

### [史低查询](#使用目录)
- 在愿望单中直接显示每个游戏的多地区当前价格与历史最低价。
- 支持切换查询地区：中国🇨🇳、美国🇺🇸、印度🇮🇳、印尼🇮🇩、日本🇯🇵、乌克兰🇺🇦、俄罗斯🇷🇺、独联体🇦🇿、阿根廷🇦🇷、土耳其🇹🇷。
- 按地区自动选择历史最低价来源：中国/美国/印度/印尼/日本使用 [ITAD](https://isthereanydeal.com/) ；乌克兰/俄罗斯/独联体/阿根廷/土耳其使用小黑盒 API。
- 史低价格蓝色高亮、折扣百分比、无数据警告。
- 价格缓存：30 分钟内视为新鲜，最长保留 24 小时；请求节流，减少 API 调用。

### [汇总与统计](#使用目录)
- 显示愿望单“当前合计”和“史低合计”。
- 显示“等史低可省”金额。
- 按汇率折算为人民币；在适用时显示非人民币原币种合计。

### [季节特卖倒计时](#使用目录)
- 显示 Steam 季节特卖倒计时：冬季、春季、夏季、秋季特卖。
- 支持“距开始 / 距结束”倒计时。

---

## [效果展示](#使用目录)
> **功能概览**
> [<img src="assets/CleanShot_11.47.14.png" width="100%">](assets/CleanShot_11.47.14.png)
> **国家切换**
> [<img src="assets/IMG_3782.jpg" width="100%">](assets/IMG_3782.jpg)
> **移动端与客户端适配**
> [<img src="assets/IMG_3784.jpg" width="100%">](assets/IMG_3784.jpg)
> [<img src="assets/CleanShot_12.24.48.png" width="100%">](assets/CleanShot_12.24.48.png)
> **只看史低功能**
> [<img src="assets/CleanShot_12.24.48.png" width="100%">](assets/CleanShot_12.24.48.png)
> **购物车一键全部加购**
> [<img src="assets/CleanShot_12.24.48.png" width="100%">](assets/CleanShot_12.24.48.png)

## [使用与安装](#使用目录)

> [!TIP]
> **推荐搭配脚本管理器使用：**
> * **PC端**：推荐使用 [Tampermonkey](http://tampermonkey.net/)
> * **iOS端**：推荐使用 [Stay](https://apps.apple.com/cn/app/stay-for-safari-%E7%94%A8%E6%88%B7%E8%84%9A%E6%9C%AC%E4%B8%8E%E5%B9%BF%E5%91%8A%E6%8B%A6%E6%88%AA%E6%8F%92%E4%BB%B6/id1591620171)
> * **Steam客户端**：推荐使用 [脚本猫](https://scriptcat.org/zh-CN)
> ## [安装地址](https://greasyfork.org/zh-CN/scripts/605431-steam%E6%84%BF%E6%9C%9B%E5%8D%95%E5%A2%9E%E5%BC%BA)
---

## [权限与数据来源](#使用目录)

脚本会请求以下域名：
- `api.augmentedsteam.com`：Augmented Steam 价格/史低数据
- `api.xiaoheihe.cn`：小黑盒史低数据
- `api.steampowered.com`：Steam 商店/地区价格数据
- `store.steampowered.com`：Steam 愿望单/商店数据
- `partner.steamgames.com`：Steam 季节特卖活动页
- `open.er-api.com`：汇率数据

脚本使用 `GM_setValue` / `GM_getValue` 在本地缓存地区、价格、汇率和特卖信息。

---

## [说明](#使用目录)

> [!note]
> **注意：**
> 价格与史低数据仅供参考，最终价格以 Steam 结算页为准。第三方数据可能缺失、延迟或存在地区/货币误差。小黑盒对独联体、土耳其、阿根廷等地区价格存在取整，脚本会按 Steam 规则重算，但仍可能有误差。
> 
> 根据页面/浏览器语言自动切换中文/英文 UI。

---

## [License](#使用目录)

[MIT](https://github.com/beerleexc/Steam-Wishlist-Enhancer/blob/main/LICENSE)

作者：**beerlee**  
版本：**1.8.0**
