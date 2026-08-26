# Idea Radar / Research Frontier Radar

> 用真实会议论文语料，对社会科学研究想法进行 Hybrid RAG 检索、相关论文排序与 evidence-grounded research analysis。

**Public demo:** https://mamingsuper.github.io/newresearch/

Idea Radar（Research Frontier Radar）面向社会科学研究者。用户输入一个研究问题、研究设计或早期 research idea 后，系统会在当前已索引的 APSA 2026 与 ICA 2026 会议论文语料中执行语义向量检索与 PostgreSQL 全文检索，通过 Reciprocal Rank Fusion（RRF）合并排序，返回最相关的 Top 20 论文及完整摘要，并进一步生成基于检索证据的研究建议。

本项目不会声称某个研究问题“全球首次”“从未有人研究”或已经被证明具有全局 novelty。所有结论严格限定在**当前已索引 corpus** 内。

---

## 当前线上状态

当前生产数据库已经完成真实语料导入和向量化：

| Corpus | Papers | Abstracts | Embeddings |
| --- | ---: | ---: | ---: |
| APSA 2026 | 5,493 | 5,493 | 5,493 |
| ICA 2026 | 3,413 | 3,413 | 3,413 |
| **Total** | **8,906** | **8,906** | **8,906** |

当前数据库状态：

- `ready = true`
- 8,906 / 8,906 papers have abstracts
- 8,906 / 8,906 papers have production embeddings
- pending embedding jobs: `0`
- failed embedding jobs: `0`

APSA 原始抓取中有 19 条记录因为缺少 abstract 被明确记录为 rejection，因此不会进入可检索 corpus。

ICA 2026 原始 `papers.json` 不包含 paper-level `url/directUrl/source_url`。为避免伪造论文 URL，系统使用仓库保存的 ICA 2026 原始会议 PDF snapshot 作为 provenance source。

---

## 核心功能

### 1. Research idea workbench

首页以大型研究问题输入框为核心。用户可以输入：

- research question；
- population；
- theory / mechanism；
- independent / dependent variables；
- proposed method；
- 已知的不确定性或研究缺口。

系统支持英文和中文 research idea 输入。

### 2. 可视化搜索进度

搜索过程中显示 1–100% 的阶段化进度，并明确告诉用户当前检索的数据库：

- APSA 2026；
- ICA 2026；
- 8,906 conference abstracts。

典型阶段包括：

1. 理解研究问题；
2. 读取 corpus scope；
3. 生成 query embedding；
4. 执行 semantic vector + PostgreSQL full-text retrieval；
5. Hybrid RRF 排序；
6. 生成 evidence-grounded analysis；
7. canonical citation grounding；
8. report ready。

前端进度会平滑推进，但只有服务器真实成功返回后才会到 100%。

### 3. Hybrid RAG 检索

检索不是单纯向量相似度搜索，而是组合：

- OpenAI semantic embedding；
- PostgreSQL Full-Text Search；
- pgvector vector similarity；
- Reciprocal Rank Fusion（RRF）。

数据库 RPC `hybrid_search_papers` 将 semantic ranking 与 lexical/full-text ranking 合并，当前分析接口返回数据库排序最高的 **Top 20** 论文。

### 4. Top 20 相关论文

每次真实分析最多直接展示 20 篇数据库检索结果，并按 Hybrid RRF ranking 排序。

每篇论文显示：

- rank；
- retrieval score；
- Author-Year citation；
- paper title；
- complete author list；
- conference；
- division / keywords（如有）；
- **完整 abstract**；
- provenance / original conference source link。

Retrieval score 是排序信号，不应解释为“相关概率”。

### 5. Evidence-grounded research analysis

在 Top 20 retrieved papers 的基础上，分析模型生成：

- research idea profile；
- corpus coverage notice；
- closest-work interpretation；
- overlap dimensions；
- evidence-linked innovation directions；
- recommended next steps；
- limitations。

研究建议不再向用户显示内部 UUID。Grounding citation 使用可读形式，例如：

```text
Balogh et al. 2026 — The Power of Conversation: An Experiment on AI Information and Political Behaviour
```

### 6. Corpus status

公开 `corpus-status` Edge Function 返回数据库派生的 corpus readiness，包括：

- paper count；
- abstract count；
- embedding count；
- pending jobs；
- failed jobs；
- conferences；
- `ready` status。

前端不会依赖手工维护的 corpus 数字来判断生产 readiness。

### 7. Private research workspace

用户登录后可以跨设备保存论文、保存带语料快照的分析会话，并导出完整账户数据。所有私有表均启用 RLS；服务端从已验证 JWT 推导用户身份，不接受客户端指定 owner ID。账户删除要求近期登录和明确确认，随后清理私有数据与待处理上传。

### 8. Moderated conference program imports

研究者可以提交官方会议 program URL，或上传 PDF、CSV、JSON、ZIP。提交不会直接进入公开语料：管理员先审核来源，再运行有尺寸、重定向、DNS 与格式边界的安全预览，最终确认后才原子写入论文、provenance 与 embedding queue。公开会议目录只展示已经确认发布的覆盖范围。

---

## 当前使用的 AI 模型

这是当前**生产环境**实际使用的模型配置。

| 用途 | 模型 | 维度 / 配置 | 说明 |
| --- | --- | --- | --- |
| Corpus embeddings | `text-embedding-3-small` | `512` dimensions | 8,906 篇生产论文当前全部处于该向量空间 |
| Query embeddings | `text-embedding-3-small` | `512` dimensions | 与 corpus 使用完全相同的 vector space |
| Research analysis | `gpt-5-mini` | Responses API, `reasoning.effort=minimal` | 生成结构化 evidence-grounded analysis |
| Analysis output | `gpt-5-mini` | strict JSON Schema | 限制输出结构，降低自由生成 metadata 的风险 |

### 为什么 corpus 和 query 必须使用同一 embedding 模型？

向量相似度只能在同一个 embedding vector space 中进行有意义的比较。因此生产数据库中的 document embeddings 和每一次用户 query embedding 都必须使用相同模型与维度。

当前生产空间是：

```text
text-embedding-3-small / 512 dimensions
```

### Nomic 的状态

仓库中仍保留：

```text
nomic-ai/nomic-embed-text-v1.5
```

以及 `@huggingface/transformers` 依赖，用于实验性 / offline embedding 研究。

**Nomic 当前不是 production corpus vector space。**

除非重新对完整 corpus 做一次独立、完整且一致的 re-embedding migration，否则不能将 Nomic query vectors 与当前 OpenAI document vectors 混合比较。

---

## 技术栈

### Frontend

- React 19 + TypeScript
- Vite 8
- Tailwind CSS 4
- GitHub Pages static SPA

`frontend/` 是线上 UI 的单一事实来源。`npm run pages:build` 先构建该 Vite/React SPA，再由 `scripts/build-pages.mjs` 将 `frontend/dist/` 组装为 `pages-dist/`，通过 GitHub Pages 发布。浏览器通过 HTTPS 调用 Supabase Edge API。

根目录 `public/` 是已废弃的 vanilla HTML/CSS/JavaScript 前端，仅为现有本地 Node.js 流程、遗留测试和历史保留。不要在 `public/` 中继续开发产品 UI；要查看或修改线上界面，请使用 `frontend/`。其中 `public/config.template.js` 暂时仍由 Pages 构建读取，用于生成公开运行时配置，不代表旧 UI 仍是生产前端。

### Backend / Edge API

- Supabase Edge Functions
- Deno runtime
- TypeScript
- REST-style JSON API

主要 Edge Functions：

- `analyze-idea`
- `corpus-status`
- `save-analysis`
- `submit-program`
- `review-program`
- `preview-program-import`
- `confirm-program-import`
- `process-embedding-jobs`
- `export-account`
- `delete-account`

### Database & Search

- Supabase
- PostgreSQL 17
- pgvector
- PostgreSQL Full-Text Search (`tsvector`)
- GIN index
- HNSW vector index
- Reciprocal Rank Fusion（RRF）
- PostgreSQL trigger-based search document maintenance

PostgreSQL 17 中 `array_to_string()` 是 `STABLE` 而不是 `IMMUTABLE`，因此项目没有继续使用依赖该函数的 generated `tsvector`。生产 schema 使用普通 `search_document tsvector` + `BEFORE INSERT/UPDATE` trigger。

### Data / ingestion pipeline

- Node.js `>=22.9.0`
- ES Modules
- canonical NDJSON
- SHA-256 validation
- idempotent Supabase ingestion
- recoverable embedding jobs
- provenance-aware source normalization

### AI / retrieval

- OpenAI Embeddings API
- OpenAI Responses API
- `text-embedding-3-small`
- `gpt-5-mini`
- 512-dimensional vectors
- Hybrid semantic + lexical retrieval
- strict JSON Schema structured output

### Optional research tooling

- `@huggingface/transformers`
- Nomic embedding experimentation
- Tavily Search / bounded Crawl for discovery workflows

### CI / deployment

- GitHub Actions
- Node built-in test runner
- project validation scripts
- GitHub Pages deployment
- Supabase Edge Functions

A push to `main` runs the Pages pipeline including:

```text
npm install
    ↓
npm test
    ↓
npm run check
    ↓
npm run build
    ↓
npm run pages:build
npm run pages:budget
    ↓
GitHub Pages deploy
```

---

## 系统架构

```text
                         ┌──────────────────────────┐
                         │        GitHub Pages      │
                         │    Vite / React SPA      │
                         └────────────┬─────────────┘
                                      │ research idea
                                      ▼
                         ┌──────────────────────────┐
                         │ Supabase Edge Function   │
                         │      analyze-idea        │
                         └────────────┬─────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
             Rate limiting      Corpus status     Query embedding
            HMAC-SHA256 + DB      readiness      text-embedding-3-small
                    │                                   │
                    └─────────────────┬─────────────────┘
                                      ▼
                         ┌──────────────────────────┐
                         │   Supabase PostgreSQL    │
                         │ pgvector + FTS + RRF     │
                         │      Top 20 papers       │
                         └────────────┬─────────────┘
                                      │
                                      ▼
                         ┌──────────────────────────┐
                         │       gpt-5-mini         │
                         │  evidence-grounded JSON  │
                         └────────────┬─────────────┘
                                      │
                                      ▼
                         ┌──────────────────────────┐
                         │   Canonical grounding    │
                         │ title / author / abstract│
                         │ source URL from database │
                         └────────────┬─────────────┘
                                      │
                                      ▼
                              Browser report
```

Supabase 是论文 metadata、abstract、authors、source provenance 与 retrieval ranking 的 canonical source of truth。

模型生成的论文标题、作者、conference label 或 source URL 不被直接信任。

---

## 安全、隐私与防护机制

### 1. API secrets 只存在于服务端

以下信息不能暴露到浏览器代码：

- `OPENAI_API_KEY`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RATE_LIMIT_HMAC_KEY`

GitHub Pages 只包含公开的 Edge API base URL。

### 2. CORS allowlist

公开分析 API 仅允许明确配置的 origins，例如：

- `https://mamingsuper.github.io`
- local development origins。

### 3. HMAC-SHA256 rate-limit identity

Edge API 不直接把原始 client network identifier 存入 rate-limit key。

服务器使用：

```text
HMAC-SHA256(client network identifier, RATE_LIMIT_HMAC_KEY)
```

生成不可直接反推原始地址的 client hash，然后由 PostgreSQL RPC `consume_beta_rate_limit` 执行服务端限流。

### 4. Request boundary

当前公开分析接口限制：

- maximum request body: `32 KB`
- idea length: `20–5000` characters

### 5. 不主动持久化 research idea

应用不会故意把用户提交的原始 research idea 写入 corpus database。

原始 idea 也不应出现在服务器 error logs 中。

### 6. OpenAI Responses `store: false`

生产 analysis request 使用：

```text
store: false
```

以避免应用主动请求 OpenAI 保存 Responses API 输出用于后续检索。

用户仍应理解：live-mode research idea 会发送给配置的外部模型 provider，并受对应 provider 的服务条款与数据政策约束。

### 7. Strict JSON Schema

`gpt-5-mini` 不是自由输出任意 API response。分析使用 strict JSON Schema，限制：

- 字段结构；
- item 数量；
- string 长度；
- evidence paper reference 格式。

### 8. Canonical evidence grounding

LLM 可以选择 retrieved paper ID 作为推理证据，但服务器会验证：

```text
所有 evidence paper IDs 必须来自本次真实 retrieval result set
```

未知 paper ID 会被拒绝。

最终展示的以下字段由数据库 canonical records 注入，而不是直接相信模型：

- title；
- authors；
- conference；
- abstract；
- source URL；
- Author-Year citation。

### 9. Prompt injection boundary

用户 research idea 与会议论文 abstract 都被视为**不可信数据**，不是 system / developer instructions。

分析模型被明确要求不得执行嵌入在 research idea 或论文证据中的指令。

### 10. PostgreSQL / Supabase protection

数据库层使用：

- Row-Level Security；
- backend-only grants；
- server-side RPC；
- foreign-key indexes；
- service-role / secret-key protected writes。

浏览器不会直接获得生产写权限。

---

## Evidence 与 novelty 边界

本项目不是全球文献综述系统，也不是 novelty certification service。

系统能够支持的结论是：

```text
在当前索引的 APSA 2026 + ICA 2026 corpus 中，检索到哪些相关研究，以及这些研究与用户 idea 存在哪些重叠或可区分方向。
```

系统**不能**可靠证明：

- “从来没有人研究过这个问题”；
- “这是全球第一次”；
- “该 idea 一定具有学术创新性”；
- “没有相关 journal / working paper / preprint”。

Conference abstracts 也应被视为 conference-stage scholarly records，而不是自动视为 peer-reviewed journal findings。

---

## Provenance 与数据原则

生产 corpus 强调可追溯性：

```text
raw source
   ↓
normalizer
   ↓
validation report + SHA-256
   ↓
canonical NDJSON
   ↓
Supabase ingestion
   ↓
embedding job
   ↓
searchable paper
```

核心原则：

- 不伪造 paper URL；
- 不把缺失 abstract 的记录假装成完整论文；
- 数据 rejection 明确记录原因；
- ingestion 可重跑并保持 idempotent；
- metadata / abstract 更新与 embedding input hash 绑定；
- provenance 与 source snapshot 保留。

---

## 本地开发

### Requirements

- Node.js `>=22.9.0`
- npm

### 生产前端（推荐）

查看或修改 GitHub Pages 使用的界面：

```bash
npm --prefix frontend run dev
```

Vite 默认监听 `http://localhost:8443`。所有产品 UI 改动都应提交到 `frontend/`。

### 遗留 Node.js mock mode

无需任何 API key：

```bash
cp .env.example .env
npm start
```

打开：

```text
http://localhost:3000
```

默认 `APP_MODE=mock`。此命令由 `src/server.mjs` 提供 API，并服务已废弃的 `public/` vanilla 前端；它用于保留现有本地流程，不会改变 GitHub Pages 上的 React UI。

### Verification

```bash
npm test
npm run check
npm run build
npm --prefix frontend run build
npm run pages:build
```

其中根级 `npm run build` 打包的是 Node.js 应用及遗留 `public/` 前端；线上 Pages 前端的直接构建命令是 `npm --prefix frontend run build`，完整 Pages 产物使用 `npm run pages:build`。

---

## Live environment

典型 server-side configuration：

```dotenv
APP_MODE=live

OPENAI_API_KEY=...
OPENAI_ANALYSIS_MODEL=gpt-5-mini
OPENAI_MAX_OUTPUT_TOKENS=1800
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SECRET_KEY=...
# Legacy fallback only:
SUPABASE_SERVICE_ROLE_KEY=...

EMBEDDING_BATCH_SIZE=64
EMBEDDING_MAX_ATTEMPTS=5
EMBEDDING_LEASE_SECONDS=300
EMBEDDING_BASE_BACKOFF_SECONDS=30

# Edge Function custom secret
RATE_LIMIT_HMAC_KEY=...
```

GitHub Pages 仅需要 repository Actions variable `SUPABASE_PUBLISHABLE_KEY`。这是浏览器可公开使用的 Supabase publishable key；数据库访问边界仍由 RLS、撤权和 Edge Function 鉴权控制。

**Never commit real secrets to Git.**

Production secrets should be stored in the deployment environment / Supabase Custom Secrets / GitHub Actions Secrets as appropriate。

---

## Corpus ingestion commands

### Validate

```bash
npm run corpus:validate -- \
  --source apsa \
  --input data/raw/apsa-2026.json \
  --output work/apsa-2026.ndjson \
  --report work/apsa-2026.validation.json \
  --max-rejections 0
```

### Load

```bash
npm run corpus:load -- \
  --input work/apsa-2026.ndjson \
  --report work/apsa-2026.validation.json \
  --source-label "APSA 2026 reviewed snapshot"
```

### Generate production embeddings

```bash
npm run corpus:embed -- --until-empty
```

### Inspect database readiness

```bash
npm run corpus:stats -- --json
```

### Full refresh

```bash
npm run corpus:refresh -- \
  --source apsa \
  --input data/raw/apsa-2026.json \
  --work-dir work/apsa-2026 \
  --source-label "APSA 2026 reviewed snapshot"
```

---

## Repository layout

```text
frontend/                   production Vite/React frontend (single source of truth)
public/                     deprecated vanilla frontend retained for local Node/tests
src/                        Node.js application / local server / integrations
scripts/                    corpus, build and validation commands
supabase/
  functions/                Supabase Edge Functions
  migrations/               PostgreSQL schema and migrations
tests/                      regression / contract / deployment tests
docs/superpowers/           design specifications and implementation plans
docs/operations/            production runbooks
docs/qa/                    verified acceptance evidence
data/                       reviewed/raw corpus inputs and snapshots
```

---

## Copyright & Usage Restrictions / 版权与使用限制

**Copyright © 2026 repository owner. All rights reserved.**

本仓库是公开可查看的 source-available project，**不代表本项目采用允许自由复制或商业使用的开源许可证**。

除非事先获得仓库所有者明确的书面授权，否则禁止以下行为：

1. **禁止抄袭（No plagiarism）**  
   不得复制本项目的代码、UI、页面设计、文档、研究流程、prompt architecture、数据库结构设计或其他原创实现后，删除来源信息并将其作为自己原创成果提交、发表、展示或交付。

2. **禁止未经授权复制或改编（No unauthorized copying or derivative use）**  
   不得大规模复制、重新发布、重新包装、镜像、分发、许可、转授权或创建用于公开发布的衍生版本，除非取得书面许可。

3. **禁止商业使用（No commercial use）**  
   未经书面授权，不得将本项目或其实质性衍生实现用于任何直接或间接商业目的，包括但不限于：
   - 付费 SaaS / website / application；
   - 商业 API；
   - 收费咨询或研究服务交付；
   - 企业内部商业产品；
   - 转售、白标或重新包装；
   - 广告、订阅、付费会员或其他变现产品；
   - 将本项目代码作为商业软件的重要组成部分。

4. **不得虚假声明作者身份（No false authorship claims）**  
   不得删除、篡改或隐藏已有 attribution，并不得暗示自己是本项目原始作者。

5. **学术与教育引用必须注明来源（Attribution required）**  
   对项目架构、方法、代码思路或界面设计进行非商业研究、教学讨论或学术引用时，应明确注明本仓库来源，并遵守适用的学术诚信规范。

### Third-party scholarly content

本项目数据库中的会议论文标题、作者信息、摘要和其他 scholarly metadata 可能属于论文作者、会议组织者或其他第三方权利人。

本节的项目版权声明**不主张取得这些第三方论文内容的版权**。第三方内容的使用仍受其原始来源、权利人条款以及适用法律约束。

### No implied license

除 GitHub 平台条款为浏览公开仓库所必要提供的权利外，本仓库的公开可访问性不应被解释为自动授予复制、衍生、再分发或商业使用许可。

如需获得商业授权、合作授权或其他额外许可，应事先联系 repository owner 并取得明确书面许可。

> 如果项目需要更严格、正式且可复用的法律许可文本，建议在仓库中另外加入专门的 `LICENSE` 文件。README 中的本节是项目使用声明，不构成针对所有司法辖区的法律意见。

---

## Disclaimer

本项目是 research-support software，不构成：

- 法律意见；
- research ethics approval；
- plagiarism detection certification；
- global novelty certification；
- peer-review decision；
- publication guarantee。

研究者仍需自行完成 journal、working paper、preprint、dataset 与其他 scholarly source 的完整文献检索和研究伦理审查。
