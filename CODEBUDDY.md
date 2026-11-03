# CODEBUDDY.md

本文件为 CodeBuddy 在本仓库工作时提供指引。**对应源码版本：V9.29（2026-11-03，18506 行）**

> ⚠️ 本文件在 V8.71 之后长期未更新，V9.21 已按真实源码逐条核对重写，V9.22~V9.29 同步更新。
> 若发现描述与代码不符，**以代码为准**，并顺手更新本文件。

---

## 项目定位

纯前端、零构建的单页工作量分析工具——「百灵工作量仪表盘」。
把业务系统导出的 3 份主表（工作量、非任务工时、工时利用率底表）+ 4 张异常盘点表 + Google 排班表合并分析，
产出工时利用率、标准条达标、疑似异常告警、班表矩阵等视图。
全部逻辑在浏览器本地运行，`localStorage` 持久化，**无后端、无 npm 工具链**。

---

## 运行 / 调试

```bash
# 直接双击打开即可（推荐 Chrome/Edge）。V9.4 起依赖已本地化，离线可用
open index.html          # macOS
start index.html         # Windows
```

- 无 `package.json`，**没有** build / lint 脚本。
- **依赖已全部本地化到 `vendor/`**（V9.4 起不再走 CDN，`index.html` 里 CDN 引用数为 0）：
  `vendor/tailwind.min.css`、`chart.umd.min.js`、`xlsx.full.min.js`、`jszip.min.js`。
- 静态资源用 `?v=xxx` 手动打版本号（如 `core/formulas.js?v=875`），改了 `core/`、`data/`、`styles.css` 要同步升号。

### 测试入口（共 10 套，417 条断言）

| 入口 | 位置 | 覆盖 | 条数 |
|------|------|------|------|
| `BailingFormulas.selfTest()` | 浏览器 Console | 公式换算、calcRow 分支 | 26 |
| `test-suspect-alerts.js` | 仓库上级目录 | 疑似异常告警 6 条规则 + 筛选 | 81 |
| `verify-ui.js` | 同上 | 渲染产物断言（如暂离已彻底下线） | 24 |
| `test-gsheet-sync.js` | 同上 | Google 班表同步、页签回退防御、ID 规范化、班次重建 | 57 |
| `test-dedup.js` | 同上 | 原始行去重、多文件累加 | 25 |
| `test-identity.js` | 同上（**puppeteer 真实 Chrome**） | 同名不同人：导入/告警/DIY 按英文名区分 | 39 |
| `test-diy-save.js` | 同上（**puppeteer 真实 Chrome**） | DIY 指标设置保存、类型互转、缓存作废 | 39 |
| `test-reupload.js` | 同上（**puppeteer 真实 Chrome**） | 重复上传幂等性、resetImportedData 清理范围 | 25 |
| `test-nontask-source.js` | 同上（**puppeteer + 用户真实全量 CSV**） | 非任务取数口径（明细表优先）、文件处理顺序依赖 | 49 |
| `test-gsheet-fetch.js` | 同上（**puppeteer + 真实 Google 表，需联网**） | 班表取数三通道、隐藏页签过滤、页签回退取证、行号偏移 | 52 |

> `test-nontask-source.js` 需要 `~/Desktop/灯塔数据导出/` 下的真实导出文件；
> 文件缺失时自动跳过 C~F 组，只跑源码级断言（不会误报失败）。

```bash
# jsdom 测试统一这样跑（注意 NODE_PATH）
NODE_PATH=~/.workbuddy/binaries/node/workspace/node_modules node test-suspect-alerts.js
```

> jsdom 的 `url` 必须给真实 origin（如 `https://local.test/`），
> 否则 opaque origin 下 `localStorage` 不可用，相关迁移逻辑测不到。

**语法快检**（巨型内联 script 改动后必跑）：
正则抽出内联 `<script>` → `new Function(code)`，能立刻发现括号/语法错误。

### 调试钩子

`App`（全局状态）、`bailingDiagnose()`（数据流诊断）、`window._ntUnmatched`（非任务未匹配行）、
`BailingStore`、`BailingPersistence.clear()`、
`bailingDupCheck(emp?, date?)`（**V9.23**：判定重复是源数据问题还是代码问题）。

---

## ⚠️ 两份 HTML 必须同步（最容易漏）

`index.html` 与 `bailing-dashboard.html` 是**内容完全相同的两份副本**。
改完 `index.html` 后**必须**执行：

```bash
cp index.html bailing-dashboard.html && diff -q index.html bailing-dashboard.html
```

漏做会导致用户打开另一个文件时看到旧版本。

---

## 数据流主干

```
上传 xlsx/csv ──► detectFileType()  按文件名关键词路由（@12030）
                    │  4 张异常盘点表的规则必须排在「排班/班次」之前，否则会被误判
                    ▼
            normalizeSheetRows(sheet, WORKLOAD_RULES | NONTASK_RULES)
                    │  中文表头别名 → _emp/_empEn/_uin/_dateStr/_eff/_tong/_nontong/_minutes/_origStd …
                    ▼
     App.rawRows / nontaskRows / utilRows / anomRawRows / scheduleMap
                    │
                    ▼
                 calcAll()
      · BailingStore.rebuildEmpMaps()      重建 中文/英文/UIN 三向映射
      · BailingFormulas.calcRow()          逐行求标准条构成
      · 多键候选把非任务行合并进当日工作量
      · buildDynamicGroups()               从三表数据动态扩充白名单（V9.3）
      · 白名单 + org 双重裁剪（原地 filter，不可逆）
      · precomputeUtilRateFinal()          预计算 _utilRateFinal
                    ▼
            App.dailyData（员工 × 日期 聚合行）
                    ▼
   视图层（全在 index.html 的单个内联 <script> 里）
    renderTable / renderSummary / renderTrend / checkAlerts
    renderManageBoard / renderDiyBoard / renderScheduleView
                    ▼
      BailingPersistence.save() ──► localStorage
```

---

## 架构要点

### 1. 分层约定

`core/`（5 个）+ `data/`（1 个）是可复用底座；`index.html` 的内联 `<script>`（约 15000 行）是视图层。

- **跨模块状态**统一挂 `BailingStore.App`，`window.App` 是同一对象别名。
  `calcAll()` 开头必须先 `rebuildEmpMaps()`，否则从 `localStorage` 恢复后映射表为空、合并全失败。
- **持久化**只走 `BailingPersistence`，只序列化原始行 + 用户选择，派生数据由 `calcAll()` 重算。
- **通用控件必须复用**：`BailingMultiSelect`（多选下拉，带搜索/全选/反选）、
  `BailingRangePicker`（双月日期范围）。新增筛选器不要另造轮子。
- 视图层禁止直接访问 `localStorage`、禁止就地硬编码阈值。

### 2. ⚠️ 阈值的真实位置：`BAILING_RULES`，不是 `CONSTANTS`

**这是旧文档最大的误导点。** 实测：视图层引用 `BAILING_RULES.` **73 处**，引用 `CONSTANTS.` **0 处**。

| | `BAILING_RULES`（index.html @4414） | `BailingFormulas.CONSTANTS`（formulas.js） |
|---|---|---|
| 谁在用 | **视图层全部阈值判断**（73 处） | 仅 formulas.js 内部换算（13 处） |
| 是否权威 | **是** —— 改阈值改这里 | 否 —— 部分值已是历史遗留 |
| 工作量区间 | 900 ~ 1250（V9.14） | `WORKLOAD_LOW/HIGH_DEFAULT` ≈ 989.58/1010.42（**已废弃**） |
| 利用率 | `UTIL_NORMAL_LOW: 81.25`，低于即异常**不分级**（V9.14） | `UTIL_WARN: 70` / `UTIL_OVER: 100/102/105`（**已废弃**） |
| 11h 封顶 | — | `UTIL_HOUR_CAP: 11`（V9.10 已移除封顶逻辑，**无引用遗留常量**） |

`CONSTANTS` 里真正还在生效的只有：`STD_PER_HOUR: 125`、`NONTASK_EFFECTIVE_WEIGHT: 0.8125`、
`UTIL_PASS: 81.25`、`DEFAULT_ATTEND_HOURS: 8`。

> 改阈值 → 动 `BAILING_RULES`；改换算公式 → 动 `formulas.js` 并跑 `selfTest()`。

### 3. 员工标识三向映射（踩坑重点）

原始报表里员工可能用中文名 `_emp`、英文名 `_empEn`、工号 `_uin` 中任意一种。
`App.empUinMap / uinToEmpMap / empEnMap / enToCnMap` 由 `rebuildEmpMaps` 重建，
合并时生成**多个候选 key**（直接匹配 + 映射互转）命中同一 `dayMap` 条目。
未匹配的非任务行记到 `window._ntUnmatched`。

**⚠️ 同名不同人：按英文名/工号区分，不能按中文名（V9.25）**

全链路曾按「中文名|日期」当唯一键，同一组织里有两个「王颖」时，
非任务/计时时长被叠加（实测 8h+8h=16h），触发错误的「非任务>8h」告警；
DIY 看板同源串数，且无英文名列无法肉眼区分。

规则（改任何「按人取数」的代码前先读）：

- **英文名(`_empEn`/`empEn`) 与工号(`_uin`) 是强标识**，业务上唯一，优先命中。
- **中文名只是弱标识**：仅在「当日同名唯一且与已有记录无冲突」时兜底；
  同名多人又缺身份 → **宁可不归属，也不乱叠加**（返回 null / 0）。
- 公共工具：`_makeIdentIndex/_hoursIdx`（导入层 `empDateHours`）、
  `_diyLookup`（DIY 查表）、`_diyPid`（同名人员的编辑值/导出 key，带英文名）。
- `utilRows` 的 `_emp` 实为「员工姓名」列=英文名/ID；V9.25 起显式暴露 `_empEn`。
- DIY 的人员单位是 `getDiyScope().people[]`（`{cn,en,uin,org,dup}`），
  不再是中文名字符串；`computeDiyMetric(m, who, date)` 的 `who` 可传对象或字符串（旧调用兼容）。
- 4 张非任务盘点表**只有中文名**，英文名方案覆盖不到，告警里靠组织列（`_orgMatch`）选归属人。
- 不要再写 `indexOf(emp)` 之类子串匹配兜底——会让「王颖」匹配到「王颖颖」。

**同名不同人防串号（V9.17）**：异常记录带 `orgs` 集合，
通过 `_anomMatchesOrg()` 校验归属——真实踩过「张宇(富贵蕨)」的异常串到「张宇(嘉兰X)」的坑。

### 4. 数据读取优先级

- **总标准条**：Excel 原始 `_origStd` 与公式结果差异 > 5% 时**信任 Excel**，按构成比例回填。
- **工时利用率（V9.10 起口径已反转）**：
  **直接取底表 `_utilRate` 原值**，公式重算已下线。
  取值链：`utilRateOverrides[人|日]` > `_overrideRate` > 底表原值。
  `calcUtilRateByHours()` 现在**只在 selfTest 里被调用**，不参与生产路径。
- `utilRate` 底表兼容 0~1 小数 / 0~100 百分比 / 带 `%` 字符串，解析层统一 ×100。
- **出勤时长 = 0 就是 0**（V9.16 移除了「默认按 8h」的 hack，原先会把休假日伪造成出勤）。

#### ⚠️⚠️ 非任务时长是唯一「明细表优先」的字段（V9.28）

`processUtil` 里五个时长字段，**只有非任务反着来**，不要「统一风格」：

| 字段 | 优先级 | 原因 |
|---|---|---|
| 出勤 / 通航审核 / 非通航审核 / 线下计时 | **底表优先**，为 0 才用 `empDateHours` 兜底 | 底表是权威口径 |
| **非任务时长** | **明细表优先**（`if(hoursData.nontaskMin>0)`），底表仅兜底 | 底表该列**被上游按出勤封顶** |

**封顶的实测证据**（用户真实导出，4712 行）：
「非任务时长(小时)」最大值恰好 `8.0000`，`==8` 的 **666 行**，`>8` 的 **0 行**。
于是告警规则「非任务 > 8h」在这一列上**永远为假**。

真实故障：用户手工把 3 条明细改超 8h（陈洪亮 510min=8.50h、乃比·艾海提 490min=8.17h、
陈菲菲 400min=6.67h）后重新上传，只报出陈菲菲 —— 而她命中的其实是「合计>8h」，
两条真正的「非任务>8h」因底表值被压成 8 而全部漏报。
旧写法 `if(!nontaskH_raw && ...)` 只在底表为 0 时兜底，被封顶的行值是 8（非 0），
明细表真实值进不来。

★ 不要把它「优化」回 `!nontaskH_raw` 的短路写法，那等于把 bug 原样装回去。
★ `_nontaskHBase` 保留底表原值，排查「界面数与底表不一致」时拿它对照。
口径（2026-11-02 业务确认）：非任务 = 明细表 **7 个绩效列**合计（值班/培训/考试/开会/
其他审核任务/客观原因无法审核/还休），底表仅在明细表无此人此天记录时兜底。

#### ⚠️⚠️ 文件处理顺序有依赖，必须走 `sortFilesByDependency()`（V9.28）

上传入口是 `for (const f of files)` **顺序**处理，而 `processUtil` 要读
`App.empDateHours`（由 `processNontask` / `processWorkload` 填充）。

踩坑实录：灯塔导出的文件名按字母排序后恰好是

```
data_云雀工时利用率…（util）        ← 第 5 个，先跑
data_百灵工作量统计…（workload）
data_百灵非任务工时统计…（nontask） ← 第 7 个，后跑
```

util 比 nontask **先**处理 → 读 `empDateHours` 时它还是空 Map →
上面那条「明细表优先」形同虚设。实测对照：错误顺序下「非任务>8h」命中数**归零**。

现由 `sortFilesByDependency()` @12787 + `_FILE_PROCESS_ORDER` 统一排序
（workload 10 → nontask 20 → 异常盘点 30 → **util 40** → schedule 50），
同级保持用户选择顺序以保证结果可复现。
已接入全部 3 个多文件入口：主上传 / 引导页上传 / 文件夹监听。
Excel 单工作簿内部本身就是 wl → nt → util，无需额外处理。

★ 新增任何「读 `empDateHours` 或依赖别的表已解析」的处理函数，
都要在 `_FILE_PROCESS_ORDER` 里给它排一个比数据源更大的 order。

### 5. 视图切换（五视图）

顶部导航 `data-view="dashboard|manage|diy|audit"`，`showView()` 处理 6 个分支：
`dashboard / detail / audit / schedule / manage / diy`。
通过 `.active` 类控制显隐，**不要直接 `display:block`**。

| 视图 | 节点 | 说明 |
|------|------|------|
| 主看板 | `#viewDashboard` | 指标卡 + 利用率趋势 + 疑似异常告警 + 工作量/非任务分布 + 按人员排行 |
| 管理看板 | `#viewManage` | 人 × 日 标准条矩阵，按组 tab 切换 |
| DIY 看板 | `#viewDiy` | 用户自定义指标矩阵 |
| 数据&班次详情 | `#viewAudit` | 3 个子 Tab：日维度 / 人维度 / 班表管理 |
| 详情弹窗 | `#viewDetail` | 表格行点击触发 |

> ⚠️ **「三视图两实现」陷阱**：`showView('schedule')` 实际激活的是 `#viewAudit`
> 并切到其 schedule 子 Tab；`#viewSchedule` 的内容会被 `switchAuditSubTab` **搬运**进
> `#auditSubSchedule`。排查「班表为什么在 audit 里」时注意这个重定向。

### 6. 班表与 Google 同步

`parseScheduleSheet(jsonRows, csvText)` 兼容 JSON / CSV 两种解析路径。
班次代码对应 CSS `.shift-morning/afternoon/night/rest/leave`，矩阵双向 sticky。

> ⚠️ **外部接口陷阱（V9.21 修复，必读）**
> Google gviz `/gviz/tq?sheet=<名称>` 对**不存在的页签不报错**，
> 而是静默返回该表「第一个页签」的内容，HTTP 200 + `status:"ok"`。
> 曾导致：一张「属地/组别/班次」统计表被当排班解析，**产出 434 条假班次**；
> 且 `tableName` 恒为 `null`，UI 显示「检测到 undefined」。
>
> 现有四层防御，改这块代码时**不要拆掉任何一层**：
> 1. `_gsProbeSheetNames()` @11865 —— 从 `/htmlview` 取真实页签清单
> 2. `_gsFallbackFingerprint()` @11932 —— 跨域拿不到清单时，用回退响应指纹识别
> 3. `_parseGSheetAuto` 内 `_looksLikeRoster` —— 必须有姓名表头或首列命中已知员工
>    （**不能只判断有没有日期行**，回退的统计表同样有日期行）
> 4. **每次同步无条件重建** `source==='google'` 的班次（V9.24，见下）
>
> 页签命名契约：`<prefix>-<N>月排班`。配置面板的 `prefix` 必须与页签名严格对齐。

### 6.1 ⚠️⚠️ gviz 的列类型推断会整列丢掉文本班次（V9.29，本节最重要）

**这是「班表明明有班次却抓不到」的真正根因，排查了两个版本才定位。**

gviz(JSON) 按**本次请求返回的数据范围**推断列类型。排班表底部通常跟着
「白班总和 / 小夜班总和 / 在班总人力」等数字统计区，于是**整列被判
`type:"number"`**，上半部分的「正常班 / 休 / 小夜班3 / 育儿假」等
**文本值全部被丢成 `null`**。

实测云雀-10月排班（`gid=1603835360`）：

| 取数方式 | 班次区非空格子 | 说明 |
|---|---|---|
| `/export?format=csv` | **3496** | 与页面所见一致 |
| 整页 `gviz/tq` | 2072 | **丢 35.8%** |
| 逐列看 | G~X 列 gviz 只给 43 行，CSV 有 78 行 | 唯独 O 列被判 `string` 才完整 |

→ 这正是用户截图「10-21~10-28 全空、只有 10-29 有值」的成因。

**已验证无效的几条路**（别再试一遍）：

- `gviz/tq?tqx=out:csv` —— **同样会丢**，类型推断发生在服务端，早于输出格式
- `tq=select ... format G 'x'` / `headers=0|1|2` —— 都救不回来
- `file://` 下 `fetch` / `XHR` 拉 `/export?format=csv` —— origin 为 `null`，浏览器直接拦截

**现在是三级降级，两条主通道都按 `gid` 定位**（`_fetchGSheetTable()` @12187）：

| 优先级 | 通道 | 完整度 | 限制 |
|---|---|---|---|
| ① | CSV `/export?format=csv&gid=` | 100% | 需 http(s) 环境（返回 `allow-origin:*`） |
| ② | 分块 JSONP（`range` 限定员工行） | 100% | file:// 下的主力通道 |
| ③ | 整页 JSONP | ~64% | 仅兜底，命中时 UI 弹提示 |

**分块通道（`_fetchGSheetChunked()` @12155）原理**：`range=A{a}:BC{b}` 把请求限定在
员工排班行后，该段内全是文本，gviz 就把列判成 `string`。
实测 file:// 与 http 下【员工行 × 日期列】均为 **1271/1271 = 100%，值零误差**。

★★ **改这块前必须知道的两个坑（都踩过）**：

1. **gviz 返回的行索引 ≠ 表格行号** —— 它会压缩掉某些空行，偏移还会逐段累积。
   实测 `zebinhan` 的 gviz 索引是 32、真实表格行是 35（偏移 3）。
   所以 `range` 终点要加余量 `PAD`，**回填必须按 A 列英文名对齐**（`enIndexOf`），
   不能按下标顺序硬塞 —— 按下标会让每块末尾的人（`snowxing` / `johnnyyi`）整行消失。
2. **孤立行**（块内只有 1~2 行，如休长假者）上下紧邻数字统计区，
   `range` 再怎么缩也会被判 `number` → 走 `_gsFillRowsByCells()` @12297
   按「整行 range」重取，并靠英文名比对确认命中的是目标行。

★ 不要把它"优化"回整页请求，那等于把 36% 的班次重新丢掉。
★ `range` 右边界给到 `BC`（第 55 列），给小了会截断右侧日期列。

### 6.2 ⚠️ htmlview 页签清单天然就是「隐藏过滤器」（V9.29）

`_gsProbeSheetNames()` 从 `/htmlview` 解析 `items.push({name, gid})`，
**这份清单只包含未隐藏的页签**。

实测：「云雀-12月排班」用 gviz 按名字能拉到 116 行真实数据，
但它**不在** htmlview 清单里 —— 因为它在表里被设为隐藏。

→ 所以「不抓隐藏班表」这条需求**不需要额外逻辑**，
`syncGoogleSchedule` 里 `realSheets.indexOf(sheetName) < 0` 就跳过，
同时覆盖了「页签不存在」和「页签被隐藏」两种情况。

★ 不要为了"多抓一点"去改用别的清单源（如 gid 枚举），那会把隐藏表也抓进来。
★ 清单现在返回 `[{name, gid}]`；老代码期望字符串数组的地方用
  `_gsSheetNameList()` @12118 转换。

> ⚠️ **班次必须整体重建，不能增量叠加（V9.24）**
> 排班表是「权威全量来源」。`syncGoogleSchedule` 开头**无条件**删除
> `source==='google'` 以及**无 source 字段**（更早版本写入）的条目，
> 只保留 `manual` / `import`。
>
> V9.21 曾把清空放在 `if(lastSid !== sid)` 里，漏掉三种情况：
> ① 首次运行（lastSid 为空）② 同一张表只改了 sheets 配置 ③ 表里换了一批员工。
> 真实故障：矩阵里显示的是**上一张表的员工**，新表日期段全空，
> 只有新旧表重叠的那一天有值 —— 用户感知为「明明有数据但班表不显示」。
>
> 另：多个配置行常共用同一 `prefix`（嘉兰/木柏/木云杉都配「联营」），
> 拉取时用 `_fetchedSheets` Set 保证**同一页签只拉一次**，
> `testGSheetConnection` 也按前缀去重。

> ⚠️ **Spreadsheet ID 容错（V9.22）**
> ID 约 44 位且常含 `-`，用户手动从链接截取时极易漏掉结尾
> （真实案例：`...FvBtURjNY-1Ay8Y` 填成 `...FvBtURjNY` → 404）。
> 现由 `_normalizeSpreadsheetId()` @11630 统一规范化：
> 支持直接粘贴整条链接，自动提取 `/spreadsheets/d/<id>`；
> `_warnIfSuspiciousId()` @11648 对 <40 位或含非法字符的 ID 当场拦截。
> **新增读取 ID 的入口都要走这两个函数**，不要直接 `.value.trim()`。

### 6.5 ⚠️ 原始行去重与多文件累加（V9.23）

`processWorkload` / `processNontask` **不再无条件清空** `App.rawRows` / `nontaskRows`。
原先开头就 `App.rawRows = []`，而上传入口是 `for` 循环逐个处理文件 ——
**一次选多个工作量文件时后一个会覆盖前一个**，前面文件的数据被静默丢弃。

现为「追加 + 指纹去重」：

- `_rowFingerprint(row, isNontask)` @2597 —— 取
  员工 / 日期 / **任务** / 效能 / 量级 / 时长 / 标准条 做指纹。
  ★ **必须包含 `_task`**，否则同人同天的不同任务会被当成重复误删。
- 清空动作由上传入口的「覆盖模式」统一负责，解析函数不再自行清空。
- 跳过的重复数累计到 `App._dupSkipped`，上传结束后 Toast 告知 —— **不静默改数**。

> 真实案例：某员工明细出现两组完全相同的记录，合计 12.0h / 2256 标准条
> （实际应为 6.0h / 1128）。聚合层本身没问题，重复来自导出文件。
> 用 `bailingDupCheck('姓名','日期')` 可直接区分是数据问题还是代码问题。

---

### 6.5.1 ⚠️⚠️ 覆盖模式只能走 `resetImportedData()`（V9.27）

**这是本项目代价最高的一类 bug：数据静默翻倍，界面看起来一切正常。**

`App.empDateHours` 是「人×日 → 分钟数」的**累加器**
（`processWorkload` / `processNontask` 里都是 `+=`），
但 6 个清空点（主上传 / 拖拽上传 / 粘贴导入 / 清除数据 ×3）
各自手写一串 `App.xxx=[]`，**全都漏了它**。

后果链条：

```
同一批文件传第 2 次
  → empDateHours 里 nontaskMin 从 480 累加到 960
  → processUtil 发现底表「非任务时长」列为 0，用 nontaskMin/60 回填
  → _nontaskH 从 8h 变成 16h
  → 告警规则「非任务>8h」被触发
  → 主看板冒出 44 条假告警，明细清一色「非任务 16.00h」
```

全量数据实测（用户真实导出文件）：

| | 第 1 轮上传 | 第 2 轮上传 |
|---|---|---|
| V9.26 | 2 条 / 1 人 | **90 条 / 31 人**（88 条是 16.00h） |
| V9.27 | 2 条 / 1 人 | 2 条 / 1 人 |

**规则：覆盖模式一律调 `resetImportedData(keepManual)`，不要再手写清空列表。**
★ 新增任何「跨文件累加」或「派生缓存」的 `App` 字段，必须加进这个函数，
否则下一次就会以另一种形式复现同样的 bug。

它负责清：原始行（`rawRows`/`nontaskRows`/`utilRows`/`anomRawRows`/`zanliRawRows`）、
**累加器**（`empDateHours`）、聚合结果（`dailyData`/`filteredData`）、
派生缓存（`diyMaps`/`diyCtxMap`/`anomalyMap`/`zanliMap`）、用户选择。

> 排查「数字莫名翻倍」时的最快手段：把同一份数据连传两次，
> 对比两轮的 `App.empDateHours.size` 与某个指标的总和 —— 一比就知道是不是累加器没清。

---

### 6.6 ⚠️ 隐式全局变量会让整个按钮静默失效（V9.26）

`diySaveMetric()` 里 `formula` 漏写 `var`，造成两级故障：

1. **非公式类型** 执行到 `formula: formula` 时直接 `ReferenceError`。
   onclick 里没有 try/catch，异常只进 Console ——
   用户看到的是「点保存修改毫无反应」，误判为假按钮。
   同一函数服务「保存修改」与「＋ 添加指标」，所以**新增指标也一起失效**。
2. **存过一次公式指标后**，`formula` 升格为全局变量并残留，
   后续新建的数值指标会被塞进上一条公式 —— 数据污染，比点不动更隐蔽。

改这块时同时要守住的几条：

- **公式类型不带字段**：`fieldsArr` 在 `type==='formula'` 时强制 `[]`，
  否则「数值→公式」时 `_diyEditingFields` 残留的旧字段会一起存进去。
  反向同理，`formula` 必须声明为局部变量才能在「公式→数值」时被清空。
- **多字段改回单字段** 必须清掉 `fields`，否则 `computeDiyMetric` 仍走求和分支。
- **保存后作废缓存**：`App.diyMaps = App.diyCtxMap = null` 再 `buildDiyMaps()`，
  否则表格仍按旧字段取值，用户以为没保存成功。
- **配置面板很长**，只在表单里写一行小字提示等于没提示，
  统一走 `_fsShowSyncHint()` 弹右上角浮层。

> 排查「按钮点了没反应」时，第一步永远是开 Console 看有没有红字，
> 而不是去怀疑 onclick 没绑上。本例的 onclick 绑定完全正常。

---

### 7. 白名单与分组（V9.3 已动态化）

旧版硬编码 50 人白名单已废弃。现由 `buildDynamicGroups()` 从
排班表 + 工作量表 + 利用率表的并集动态扩充。
org 过滤同样数据驱动（`_collectKnownOrgs`，V9.3.1），CSV 里出现的新组可自动接入。

> ⚠️ 时序约束：`buildDynamicGroups()` 必须在 `syncGoogleSchedule()` **之前**完成，
> 否则同步排班时白名单还是种子集，新人排班行会被跳过。

---

## 编辑 `index.html` 的注意事项

- **18506 行，只有一个内联 `<script>`（约 15000 行）**。
  **绝不整体重写或大段移动**，只做精确上下文的局部替换。
  大段替换建议用 Python 按行号切片 + 前后哨兵断言。
- 改完**务必同步 `bailing-dashboard.html`**（见上文）。
- `.bms-item` / `.multi-check-*` 的大量 `!important` 用于抵消 Tailwind 冲突，删了会破坏多选控件外观。
- Chart.js 实例存在 `App.*Chart`，重绘前必须 `destroy()`。
- 文件顶部有逐版累积的变更注释（V8.x ~ V9.29）。改某块代码前先在附近搜版本号，
  **很多看似奇怪的写法都是在修某个具体的数据源问题**，不要想当然"优化"掉。

---

## 已知遗留问题

1. **裁剪无备份**：`calcAll` 对原始行原地 `filter()`，被剔除的行无法回看审计。
2. **`calcRow` 死代码 fallback**（@3320 `calcRow` @3412 内，委托失败后的内联分支）：逻辑落后于 `formulas.js`（缺分支B 加权拆分），
   formulas.js 加载失败时会静默退回错误算法。建议删除。
3. **`selfTest` 覆盖盲区**：未覆盖 `_origStd` 分支B（`eff=0` 但 `origStd` 有值）。
4. **`CONSTANTS` 与 `BAILING_RULES` 双轨**：前者部分值已废弃但仍在文件里，容易误读（见上文 §2）。
5. **计算与渲染焊死**：`applyFilters` / `renderAll` 末尾强制整片重绘，数据量大时有性能压力。

---

## 配套文档

| 文件 | 面向 | 内容 |
|------|------|------|
| `百灵仪表盘_四看板使用手册.md` | **业务同事** | 四个看板怎么用、日/周/月清单、换 Google 班表 |
| `百灵仪表盘使用说明.md` | 业务 + 管理 | 完整 SOP、数据格式、口径速查 |
| `百灵仪表盘_代码分析报告.md` | 开发 | 模块结构、函数行号、风险点 |
| `百灵仪表盘_核心算法深度钻取.md` | 开发 | 公式链路、利用率口径演变、外部接口陷阱 |
| `百灵仪表盘_交互与耦合分析.md` | 开发 | 事件链路、渲染枢纽、耦合点 |
| `百灵仪表盘复刻提示词.md` | 开发 | 复刻/二次开发参考 |

> 改动涉及口径或功能时，**对应文档要同步更新**（行号引用尤其容易失效）。
