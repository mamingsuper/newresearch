请重新设计并实现 Idea Radar 的完整前端体验。它是一个面向社会科学研究者的 evidence-grounded research SaaS，不是普通 AI 聊天工具，也不是只有营销首页的概念产品。

请把它设计成“研究编辑部 + 现代分析工具”：可信、精确、沉静、有辨识度，同时具有足够的高级感和有意义的动效。设计需要覆盖真实登录、研究分析、论文收藏、历史会话、账户管理、会员付费和会议项目提交，而不是只绘制一个首页。

可以使用 React、TypeScript 和 Vite 构建可交互原型，但本阶段不要修改 Supabase schema、Edge API、权限策略、Stripe 配置或生产数据。所有后端调用必须放在独立 adapter 层，原型阶段使用清楚标记的 mock data，方便后续接入现有生产后端。

## 2. 产品事实与价值主张

Idea Radar 帮助社会科学研究者把早期研究想法与真实会议论文进行比较，并获得有论文证据支持的研究方向。

生产语料是：

- APSA 2026：5,493 篇论文
- ICA 2026：3,413 篇论文
- 总计：8,906 篇论文
- 摘要覆盖：8,906 / 8,906
- 向量覆盖：8,906 / 8,906
- 检索方式：语义向量 + PostgreSQL 全文检索 + RRF 混合排序
- 分析输出：基于检索证据生成，不做全球原创性断言

产品的核心承诺不是“证明你的想法前所未有”，而是：

> See where your idea meets the evidence, then find a defensible way forward.

中文对应：

> 看清你的想法与现有证据在哪里相遇，再找到可以站得住的下一步。

## 3. 用户与使用情境

主要用户：

1. 政治学、传播学及相关社会科学研究者
2. 博士生、青年教师和研究助理
3. 正在形成研究问题、寻找重叠文献或调整研究设计的人

典型场景：

- 用户输入中文或英文研究想法
- 系统检索 APSA 与 ICA 论文并生成分析
- 用户检查最相关论文、完整摘要和来源
- 用户收藏论文、保存分析、导出材料
- 用户稍后重新打开会话继续工作
- 用户提交新的会议 program，等待平台审核和纳入语料

用户首先关心可信度、来源和阅读效率，其次才是视觉惊喜。不要把产品设计成聊天机器人、加密货币面板或泛 AI 营销页。

## 4. 设计方向

### Design Read

研究型 SaaS 工作台，面向重视证据和可追溯性的专业用户。视觉语言偏现代编辑部、研究档案与精密分析工具。

### 设计参数

- `DESIGN_VARIANCE: 6`
- `MOTION_INTENSITY: 5`
- `VISUAL_DENSITY: 6`

### 应保留的品牌基因

- 钴蓝：主要操作、选中状态、关键链接
- 暖纸色：主背景，表达研究稿件和档案感
- 深墨色：标题和正文，不使用纯黑
- 绿色：仅用于真实在线、成功、语料 ready 等语义状态
- 黄色：小面积强调，不作为第二个主要 CTA 色
- 现有圆形雷达标识可以精修，但不要重新发明品牌 Logo

### 建议色彩令牌

以下为方向，不要求机械照搬：

| Token | Light | Dark | 用途 |
| --- | --- | --- | --- |
| Canvas | `#F4F0E8` | `#171A1F` | 页面背景 |
| Surface | `#FFFDF8` | `#20242B` | 主内容面板 |
| Surface Subtle | `#ECE7DD` | `#292E36` | 次级区域 |
| Ink | `#171A21` | `#F2F0EA` | 主文字 |
| Muted | `#65645F` | `#B8B7B1` | 次级文字 |
| Accent | `#2447D8` | `#6F8DFF` | 主要操作 |
| Success | `#087657` | `#4DC69E` | 真实成功状态 |
| Signal | `#E7AE27` | `#F2C65C` | 小面积提醒 |
| Danger | `#B3261E` | `#FF8A82` | 删除和错误 |

全站只能有一个主要 accent。绿色和黄色只承担语义，不与蓝色争夺主要操作层级。

### 字体与形状

- 正文与界面：Geist、Satoshi 或同等级现代无衬线字体
- 数字、排名、检索参数：Geist Mono 或 IBM Plex Mono
- 不要使用默认 Inter 风格
- 卡片半径统一为 14-16px
- 输入框半径统一为 10-12px
- 按钮可以使用 10-12px，不要大量胶囊按钮
- 阴影必须克制并带背景色，不使用纯黑外发光

## 5. 信息架构

### 桌面端

在宽度 `>= 1280px` 时使用 232-256px 的左侧垂直导航。不要再把所有英文导航塞进一条横向顶部栏。

左侧导航：

1. New analysis
2. Conference library
3. Saved papers
4. Conversations
5. Submit a program

底部区域：

- 当前语言
- Corpus status
- Account / Sign in

主内容区域顶部只保留当前页面标题、必要的上下文操作和账户入口，不重复全部导航。

### 平板与移动端

在宽度 `< 1280px` 时切换为 64-72px 顶部栏：

- 左侧 Logo + Idea Radar
- 右侧 Sign in / Account
- Menu 按钮打开全高抽屉

移动端所有多栏布局必须变成单列。不要缩小字号来维持桌面布局，也不要让按钮文字换行。

## 6. 必须设计的页面与状态

### A. New analysis

这是默认首页，也是最重要的工作页面。

首屏必须包含：

- 简短价值主张，桌面端最多两行
- 真实语料状态，例如 `8,906 papers indexed`
- 大型 Research idea 输入区，20-5,000 字符
- 一个主要 CTA：`Map my idea`
- 一个次级操作：`Try an example`
- 清楚但不抢眼的范围提示：结论仅限当前语料，不做全球原创性判断

输入区应该像严肃的研究工作台，而不是聊天气泡。允许输入研究问题、对象、机制、方法和不确定性。CTA 必须在首屏可见。

### B. Analysis in progress

提交后使用真实感明确的阶段进度：

1. Understanding the research question
2. Reading the corpus scope
3. Generating the query embedding
4. Running hybrid retrieval
5. Ranking relevant papers
6. Generating grounded analysis
7. Checking citations
8. Report ready

进度可以平滑移动到 94%，但只有接口成功后才能显示 100%。使用与最终结果结构一致的 skeleton，不使用单独旋转 spinner。

### C. Analysis results

结果页应按研究者的阅读顺序组织：

1. Research idea profile
2. Corpus coverage notice
3. Closest-work interpretation
4. Evidence-linked innovation directions
5. Recommended next steps
6. Limitations
7. Ranked related papers

顶部提供：

- Save to workspace
- Export
- Start new analysis

最多展示 20 篇按 Hybrid RRF 排名的真实论文。每篇论文必须显示：

- 排名
- Author-Year citation
- 标题
- 完整作者
- Conference
- Division / keywords（如有）
- retrieval score，并注明它是排序信号，不是概率
- 完整 abstract
- Original source
- Save paper

建议使用单列论文列表或可访问的 disclosure 结构。标题、引用和 abstract 是视觉重点，score 和 metadata 是次级信息。不能显示内部 UUID，不能截断 abstract 后强迫用户跳转。

Innovation direction 中的论文引用必须是可点击的 `Author-Year + title`，点击后定位到对应论文。

### D. Sign in / authentication

使用居中 modal 或右侧 sheet，内容包括：

- Email magic link
- Continue with Google，必须有官方 Google 彩色图标
- 清楚的隐私说明
- Loading、success、invalid email、provider unavailable 和 server error 状态

登录后应返回用户刚才触发的操作，例如保存论文、保存分析或开始分析。

### E. Saved papers

支持：

- 搜索标题、作者、摘要和关键词
- Conference 过滤
- 私人 note 和 tags
- 打开原始来源
- CSV、BibTeX 和 Markdown 导出
- 单篇或批量移除

桌面端可使用列表或轻量表格，但 abstract 仍需易读。移动端变为信息层级清楚的卡片列表。

必须设计 loading、empty、filtered empty、save failed 和 export failed 状态。

### F. Conversations

桌面端建议采用 master-detail：

- 左侧：保存的分析列表、搜索、时间、语言
- 右侧：当前 idea、grounded report、corpus snapshot 和引用论文

支持 reopen、rename、export 和 delete。删除必须二次确认。移动端先显示会话列表，进入后显示详情，不做拥挤的双栏压缩。

### G. Conference library

只显示审核后发布的会议 program：

- Conference name、acronym、year、discipline
- Coverage status
- Paper count
- Provenance note
- Original program URL
- Last verified time

不要伪造没有逐论文来源的数据。Provenance 应被设计为产品可信度的一部分。

### H. Submit a program

已登录用户可提交官方 HTTPS URL，或上传 PDF、CSV、JSON、ZIP。

表单字段：

- Conference name
- Acronym
- Year
- Discipline
- Official conference URL
- Program URL 或文件
- Notes
- Rights / provenance attestation

需要 field-level validation、upload progress、submission success、review status 和 rejection reason。提交后明确说明资料不会直接进入生产语料，必须经过审核、预览和确认。

### I. Account and membership

账户中心必须是完整产品页面或完整 modal，不是 alert。

内容包括：

- 用户 Email / identity
- 当前 plan
- 当日剩余分析次数
- Saved papers 数量
- Conversations 数量
- Manage subscription
- Download my data
- Sign out
- Delete account

账户删除使用危险操作区域、清楚后果、近期登录要求和精确确认短语。不要使用浏览器原生 alert 或 prompt 作为最终设计。

### J. Pricing and paywall

商业规则：

| Plan | Price | Analysis allowance | 其他功能 |
| --- | ---: | --- | --- |
| Free | $0 | 每个 UTC 日 1 次 | 保存论文、保存分析、导出 |
| Pro | $10 / month | 不限次数，仍受合理防滥用限制 | 同上，优先用于持续研究 |

真实分析要求登录。Free 用户用完当日额度后，保留已输入的 idea 并显示内嵌 paywall，不得清空输入或把用户抛到错误页。

Paywall 应显示：

- 今日额度已用完
- 下一次免费额度恢复时间
- Upgrade to Pro
- Not now
- 已订阅用户使用 Manage billing 打开 Stripe Customer Portal

必须设计 checkout loading、checkout unavailable、subscription active、payment past due、cancel at period end 和 portal unavailable 状态。

## 7. 关键交互流程

### 首次分析

`输入 idea -> Map my idea -> 登录 -> 返回原 idea -> 进度 -> 结果 -> 保存或导出`

任何登录跳转都不能丢失用户输入。

### Free 用户第二次分析

`提交 -> entitlement 检查 -> 当日额度为 0 -> 原位 paywall -> Stripe Checkout -> 返回产品 -> 自动刷新 plan -> 继续分析`

### 收藏论文

`Save paper -> 未登录则登录 -> 原位置恢复 -> optimistic save -> 成功状态或失败回滚`

### 保存分析

只在用户明确点击 `Save to workspace` 后保存 idea 和报告。未明确保存时，不应给用户造成后台持久化的印象。

## 8. 动效规范

动效必须表达层级、反馈或状态变化。

- 首次加载：标题、输入区、真实 corpus 状态依次进入，时长 350-550ms
- 输入框 focus：边框和轻微抬升，不做强光晕
- CTA hover：1-2px 位移或轻微 scale，active 时有按压反馈
- 页面切换：内容淡入并移动 12-20px
- 结果生成：按结构分段 reveal，不让 20 篇论文同时飞入
- 保存成功：图标和标签在原位置转换，不使用大面积 toast 庆祝
- Drawer / modal：使用 spring 或自然 ease，背景层级清楚
- `Live corpus` 可以有非常克制的状态脉冲，因为它代表真实在线状态

禁止：

- 无意义无限 marquee
- 滚动劫持
- 所有卡片同时浮动
- 鼠标跟随粒子
- AI 紫色发光背景
- 动画修改 width、height、top 或 left

所有动效必须遵守 `prefers-reduced-motion`，降级后不影响理解和操作。

## 9. 响应式与可访问性

- 断点建议：640、768、1024、1280、1536
- 正文桌面端至少 17-18px，移动端至少 16-17px
- 导航、输入、按钮至少 16px
- metadata 至少 14px
- 交互目标至少 44px
- 支持 200% zoom
- 完整键盘导航与明显 focus ring
- Modal 必须锁定焦点并能用 Escape 关闭
- 状态不能只用颜色表达
- 正文和按钮达到 WCAG AA，对长摘要尽量达到 AAA
- 中英文切换后导航不能截断、重叠或换成两行
- 所有日期、数量和价格使用适合 locale 的格式
- 支持完整 light / dark tokens，默认尊重系统主题

## 10. 完整状态矩阵

每个主要页面至少提供：

- Initial
- Loading / skeleton
- Success
- Empty
- Error with retry
- Offline / API unavailable
- Auth expired
- Permission denied

特别状态：

- Corpus ready / refreshing / unavailable
- Free 1 remaining / Free 0 remaining / Pro active
- Checkout loading / failed / returned
- Saved / saving / rollback
- Analysis progress / stopped / success
- Conference submission submitted / under review / rejected / imported

错误文案必须可行动。例如使用 `Analysis could not be completed. Try again.`，不要显示原始 Supabase、OpenAI 或 Stripe 错误体。

## 11. 技术交付要求

请交付一个可运行、可点击、可响应式预览的前端工程，并满足：

1. React + TypeScript + Vite，适合静态部署到 GitHub Pages
2. 组件、页面、tokens、mock data 和 API adapters 分离
3. 不写入任何 Supabase key、Stripe key、OpenAI key 或其他 secret
4. 不创建新的数据库 schema，不直接修改现有生产 API
5. 所有 mock 数字必须使用上文真实数据，或明确标记为 mock
6. 所有用户动作通过统一 adapter，例如：
   - `auth.signInWithEmail()`
   - `auth.signInWithGoogle()`
   - `analysis.run(idea)`
   - `papers.save(paperId)`
   - `sessions.save(report)`
   - `billing.createCheckout()`
   - `billing.openPortal()`
   - `account.export()`
   - `account.delete()`
7. 使用一个图标库，优先 Phosphor Icons
8. 不手绘 Google、支付或常用功能 SVG
9. 英文和中文文案放在统一 dictionary，不复制两套页面
10. 不使用浏览器 alert、confirm、prompt 作为最终 UI
11. 不添加 analytics、telemetry 或额外网络请求
12. 保留真实来源链接、语料范围声明和非全球原创性声明

建议目录：

```text
src/
  app/
  pages/
  components/
  features/
    auth/
    analysis/
    papers/
    conversations/
    billing/
    account/
    programs/
  adapters/
  i18n/
  tokens/
  mocks/
```

## 12. Lovable 需要返回的材料

请同时返回：

1. 可运行前端工程
2. 桌面端 1440px 截图
3. 平板端 1024px 截图
4. 移动端 390px 截图
5. Light 和 dark 模式关键页面截图
6. 组件与 token 清单
7. 使用的字体、图标和第三方依赖清单
8. 所有 mock 与真实后端调用之间的映射表
9. 尚未实现或使用 placeholder 的内容清单