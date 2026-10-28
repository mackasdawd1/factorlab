# Financial rules and acceptance fixtures

2026-09-18 · 设计规范；不是已上线引擎。下文所有示例数值均为人为设计的教学 fixture，不能解释为市场观测、用户实验或策略业绩。

## 1. 时间、数据与边界

每轮一个等长模拟月。展示“第 n 轮”，不用真实日历暗示市场预测。r[t] 是区间 t−1 到 t 的简单总收益；w[t−1] 是锁定于区间开始前的持仓权重。持仓包含五个主题篮子与 Cash。

计划数据包分成 12 月 warm-up + 36 月已冻结的合成回测历史 + 6 月游戏。当前 Week 2 只有六轮线框 fixture 与独立手算案例，**完整 54 月数据包尚未制作**。历史回测面板不能用六轮未来收益填充。

每条信号带 observedAt / availableAt；使用条件为 availableAt ≤ decisionTime。所有因子只看当时可得的数据。财务基本面以发布日期为准；不用财报期末替代可得日期。设计参考 [QuantConnect Research Guide](https://www.quantconnect.com/docs/v2/writing-algorithms/key-concepts/research-guide)。

本地静态包并非防作弊系统；未来数据可能在资源文件中存在，但正常 UI 与 Coach context 必须严格按 reveal 时点筛选。MVP 无多人竞赛，无需为反作弊引入服务器。

Cash 收益假设 rf = 0.1%/模拟月，固定用于教学，不代表现实存款利率。交易成本、滑点、税均为 0，回测与游戏都披露。r > −100%；场景载入必须检查有限值、时间单调、完整性与贡献相加约束，异常直接拒绝，不能 clamp 后伪装对账成功。

## 2. 多因子评分

MSCI 对动量、价值、质量及低波动的描述提供方向参考；这里是简化教学代理，并非复刻或授权的 MSCI 指数。[MSCI 因子介绍](https://www.msci.com/research-and-insights/blog-post/what-is-factor-investing)、[Quality 指数说明](https://www.msci.com/indexes/factor-indexes/msci-factor-indexes)。

| 因子 | 教学原始量，只用可得数据 | 高分含义 | 必须说明的限制 |
|---|---|---|---|
| Momentum | 过去 6 月累计简单收益 | 过去较强 | 趋势可能反转；不等于未来收益 |
| Value | 虚拟篮子 E/P | 相对盈利更便宜 | 低价可能对应经营风险；不用股价低代替价值 |
| Quality | 虚拟篮子 ROE | 盈利质量代理较高 | 单一 ROE 不覆盖债务/盈余稳定性；不等同完整质量模型 |
| Low Volatility | 过去 6 月收益样本标准差的负值 | 过去波动较低 | 不是无风险；不等于最小方差优化 |

每月在 5 个风险板块内按原始量升序取平均秩 q∈[1,5]，s = 100(q−1)/4；同值使用平均秩。Cash 不参与排序。有效数据缺失不补成 0；默认场景必须完整。

教学暴露 x = 2s/100 − 1，范围 [−1,1]。它是简化相对暴露，不是实证估计的 beta。玩家因子偏好 a[k]≥0，Σa=1，默认各 25%；综合信号 S[i]=Σa[k]s[i,k]。调整 a 只改变信号展示和排序，不自动设置持仓，不改变模拟市场收益。

显示三个不同对象：s/S 是信号分数，E[k]=Σ风险板块 w[i]x[i,k] 是组合暴露，C[k] 是已实现收益贡献。不可把分数百分比当作预期收益百分比。

## 3. 组合、现金、再平衡

0≤w≤1，Σw=1；正式版输入采用整数 basis points（10000 = 100%）。风险板块之和小于 100% 时剩余进入 Cash，始终显示；超配/负数/非有限值拒绝。不能自动缩放玩家权重。

单轮净收益：R[t] = Σ(i=1..6) w[i,t−1]r[i,t]。

净值：`V[t]=V[t−1](1+R[t])`；V[0]=100000。累计收益 V[t]/V[0]−1。内部不逐轮四舍五入，展示金额保留两位、百分比保留两位。

结算后漂移权重：`w⁺[i,t]=w[i,t−1](1+r[i,t])/(1+R[t])`。下一轮若不调整则使用 w⁺；若调整则在确认后应用新权重。没有入金/提款。

## 4. Benchmark 与风险

基准固定为“教学主题等权基准”：五风险板块每轮开始各 20%，Cash=0。与玩家同数据、同时间、同成本、同初始资金；不是沪深 300、S&P 500 或全市场指数。R_b[t]=Σ风险板块 0.2r[i,t]。

显示累计超额表现为“玩家累计收益 − 基准累计收益”，单位 pp；不称为 alpha。相对财富 V/V_b−1 如未来使用必须独立命名，不能与 pp 混用。基准政策不得随玩家结果变更。

| 指标 | 精确定义 | UI/边界 |
|---|---|---|
| Portfolio Return | ∏(1+R[t])−1 | 包含负收益，不能相加代替复利 |
| Volatility | stdev(R[1:n], ddof=1) | 每模拟月；n<2 时 N/A |
| Sharpe Ratio | mean(R−rf)/stdev(R−rf, ddof=1) | 每模拟月，未年化；n<2 或分母≤1e−12 时 N/A |
| Maximum Drawdown | max(1−V[t]/max(V[0:t])) | 非负损失幅度；包含 V0；仅观测月末，不代表月内最深回撤 |
| Diversification | 风险权重归一化 p[i]=w[i]/(1−w_cash)，N_eff=1/Σp[i]² | 1 至 5；全 Cash 时 N/A；并列显示 Cash 与最大风险板块权重 |

Sharpe 的风险自由基准是 Cash rf，Dashboard 的主题基准是另一对象；不可把 R−R_b 的比值标为本项目 Sharpe。其原理与时间依赖见 [Sharpe (1994), The Sharpe Ratio](https://web.stanford.edu/~wfsharpe/art/sr/sr.htm)。不对六轮默认乘 √12；即使未来提供年化，也必须注明等周期及相关性假设。

净值 [100,120,90,99] 的 Maximum Drawdown = 25%，不是最后一期相对起点的 1%。绩效评价/基准区别参考 [CFA Institute 2026 curriculum overview](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/portfolio-performance-evaluation)。

N_eff 只衡量板块权重集中程度，不估计相关性或系统性风险；持有五个科技主题也可能同时亏损。分散与再平衡概念参考 [Investor.gov](https://www.investor.gov/introduction-investing/getting-started/asset-allocation)。

## 5. 回测与因子有效性

MVP 最小回测是：玩家当前候选权重在**游戏开始前固定的 36 月合成历史**上逐月恢复相同权重，使用同一个结算器；并列同政策的五板块等权基准。不把这种 constant-mix 回测称为 buy-and-hold。每次调整权重可重算，但披露重复试验会产生选择偏差；不以样本内最优标注最佳策略。

回测结果与本局六轮分开：不同标签、日期范围、样本数；不追加游戏未来数据。参数、数据版本、scenarioId 和成本设置都应可追溯。真实历史回测为后续可选扩展，需要单独数据来源/许可、发布日期/复权与成分变动审核。

有效性：IC[k,t] = Spearman(s[k,t−1], r[:,t])，Cash 排除，样本是当月 5 板块。历史面板显示各月 IC、有效月数、平均 IC，不报告小样本显著性。有效配对不足 3 或任一向量恒定时 N/A，并计入缺失月数。

Top–Bottom spread：按事前分数前 2 板块等权的次期收益，减后 2 板块等权的次期收益。排序边界同分使用固定 sectorId 作可复现 tie-break，并标明同分；IC 的 ties 仍用平均秩。

参考 [Alphalens overview](https://alphalens.ml4trading.io/notebooks/overview.html)。其页面将 IC 范围写成 0–1 不应照搬；Spearman 实际范围为 −1 到 +1，常量输入无定义，见 [SciPy 官方定义](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.spearmanr.html)。合成数据的 IC 只是展示方法，不能证明现实因子有效。

## 6. 因子贡献：可对账的教学模型

仅五风险板块使用：r[i,t] = m[t] + Σ_k x[i,k,t−1]f[k,t] + e[i,t] + u[i,t]。

m 为共同市场分量，f 为该月教学因子收益系数，e 为独立列示的事件冲击，u 为残差。所有分量按同一生成方程设计；事件在 e 中只计一次。x 在锁仓前可见；m/f/e/u 的本轮实现值只在结算后出现。f 不是因子排名回测的 Top–Bottom spread，两者不混用。无需对 5 个观察、4 因子和截距做不可识别回归。

单轮 C[k,t]=(Σ_i w[i,t−1]x[i,k,t−1])f[k,t]。

其余分量为 C_market=(1−w_cash)m，C_event=Σw e，C_residual=Σw u，C_cash=w_cash rf。它们与四因子贡献之和**严格等于 R[t]**（数值容差 1e−10）。各项显示 pp；不能强行将四因子缩放成总收益的 100%。

跨轮不用 ΣC[t] 冒充累计回报。总贡献采用财富加权：A[j]=Σ_t (V[t−1]/V[0])C[j,t]，于是 Σ_j A[j]=V[T]/V[0]−1。标为“对初始资本的累计收益贡献”。市场/事件/残差/Cash 始终保留。

本法是本项目的可解释生成模型归因。对照 [MSCI attribution 介绍](https://www.msci.com/data-and-analytics/portfolio-management/performance-attribution) 了解暴露与收益分解概念；不声称实现其专有模型或真实市场因果归因。

## 7. 手算验收案例

### 单轮持仓、结算、漂移

| 板块 | w | r（教学） | w×r（pp） |
|---|---:|---:|---:|
| 半导体 | 30% | 4% | 1.20 |
| 机器人与工业自动化 | 20% | 3% | 0.60 |
| 先进材料 | 10% | −2% | −0.20 |
| 清洁能源装备 | 10% | 1% | 0.10 |
| AI 与数字基础设施 | 20% | 2% | 0.40 |
| Cash | 10% | 0.1% | 0.01 |

合计 R=2.11%，V=102110；基准收益 (4+3−2+1+2)/5=1.60%，超额 0.51 pp。半导体漂移到 31200/102110≈30.5553%；Cash=10010/102110≈9.8032%。N_eff（锁仓时）=0.9²/(0.3²+0.2²+0.1²+0.1²+0.2²)=4.2631579。

对应 x（Momentum, Value, Quality, LowVol）：半导体 [0.5,0,0.5,−0.5]；机器人 [0,0.5,1,0]；材料 [−0.5,1,0,0.5]；能源 [−1,−0.5,−0.5,1]；AI [1,−1,−1,−1]。

取 m=1%；f=[1%,−0.5%,0.5%,−0.2%]；e=[2%,1.5%,−2%,1%,1%]；u=[0.15%,0.25%,0.1%,0.2%,−1.2%]，还原上表板块收益。

组合贡献分别为：Market 0.900 pp、Momentum 0.200 pp、Value 0.025 pp、Quality 0.050 pp、LowVol 0.040 pp、Event 1.000 pp、Residual −0.115 pp、Cash 0.010 pp，总计 2.110 pp。

### 指标已知答案

- R=[10%,−10%]，rf=0：累计 −1%；每期波动约 14.1421%；Sharpe=0；MDD=10%。
- 全 Cash 六期：累计 (1.001)^6−1；波动 0；Sharpe N/A（超额收益方差为 0）；MDD=0；风险板块 N_eff=N/A。
- 分数 [1,2,3,4,5] 对次期收益 [5,4,3,2,1]：Rank IC=−1；不能被截断为 0。
- 两期 R=[10%,−10%]，若两期某单一分量均等于全收益，财富加权贡献 0.10+1.10×(−0.10)=−0.01；不能报 0。

### 完整教学链（原型演示，不是用户结论）

玩家阅读“高 Momentum 可能反转” → 设 [30,20,10,10,20,10]% → 在仅用于手算的三个月历史中观察风险 → 比较五板块等权基准 → 玩家自行决定保留这份含 10% Cash 的草稿 → 确认开局 → 观察第 1 轮结果与 0.51 pp 差值。正式回测改为已定义的 36 月历史；线框三个月数据不得标成真实或 36 月测试。
