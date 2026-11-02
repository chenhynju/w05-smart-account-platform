# Structured Project Specification — W05

需求来源为source-requirements.txt的PROJECT_TOPIC_BEGIN/END全部内容，以及Master Prompt的工程/教学强制要求。原始SHA256保留在requirements-analysis.md。下表不是额外创造的产品范围。

|维度|解析后的要求|
|---|---|
|1 Project Positioning|smart-account-platform，可编程智能钱包与ERC-4337账户抽象作品集|
|2 Business Value|原主题评级：商业价值极高、基础价值高、技术壁垒高；这是输入定位，不是独立市场验证|
|3 Target Competency|Wallet/AA/Web3 Full-stack Engineer能力；未指定统一L级认证，N/A|
|4 Business Scenarios|Passkey授权、企业多签审批、受限游戏session、SaaS Gas代付、批量调用|
|5 Functional Requirements|确定性/反事实部署，ERC-1271，单笔/原子批量，赞助；Passkey、Session Key、白名单/native限额、社交恢复、多签、Paymaster配额、恶意调用模拟|
|6 Non-functional Requirements|严格类型、复现构建、显式信任边界、失败恢复、可观测性、输入校验、响应式/可访问UI、秘密保护|
|7 Protocol Specifications|ERC-4337固定0.8实现，ERC-1271，EIP-712，WebAuthn/P256；ERC-7562作为公共mempool独立门禁|
|8 Core Knowledge|验证/执行分离、nonce/domain、签名/密码学、原子性/费用、Paymaster经济边界、授权撤销与恢复|
|9 Smart Contract Scope|Account/Factory/Paymaster及验收Target；正式功能不以伪EntryPoint代替上游协议|
|10 Frontend Scope|Next.js、wagmi/viem；开户、签署、模拟、提交、receipt状态、权限、Passkey、阈值审批、恢复；成功失败路径|
|11 Backend Scope|Node本地allowlisted服务、签名开户挑战、配额赞助、队列、持久幂等记录与对账；不是新增SaaS租户/订阅业务|
|12 Infrastructure Scope|Anvil、固定EntryPoint、Bundler/Paymaster集成、日志与恢复；公共网络配置和公共mempool需独立完成和验证|
|13 Security Requirements|重放、nonce、撤销、跨链/跨账户域、原子性、恶意Gas消耗，以及适用的回调、前端欺骗、RPC信任、DoS|
|14 Testing Requirements|Foundry unit/negative/fuzz/stateful/coverage/gas，SDK差分，API/浏览器E2E，失联/重启，对抗审查/回归/突变|
|15 Deliverables|完整源码、设计、教学、测试证据、安全报告、CI、部署/验证脚本、英文README、运维/面试材料|
|16 Acceptance Criteria|逐需求链路证据；Engineering/Learning分别验收；学习者实际掌握单列NOT RUN|
|17 Known Pitfalls|签名重放、Nonce、撤销、签名域、批量失败原子性、Paymaster失败Gas消耗；必须有真实负面测试与根因|
|18 Constraints|Windows/VS Code/WSL2 Ubuntu24.04，Linux文件系统构建；保留已有环境/秘密；公共广播/费用/发布须对应授权；主网单独批准|
|19 Explicitly Excluded / N/A|未要求Solana/跨链/Oracle/Token发行/生产SaaS计费/Indexer；主网仅可选且未授权。公共测试网不是删除项，当前BLOCKED/NOT RUN并保留后续任务|

## Work Packages and staged acceptance
P0规格/标准/需求追踪 → P1架构/威胁/权限/不变量 → P2核心Account/Factory → P3高级授权/恢复/Paymaster → P4测试 → P5审计/PoC/修复/复审 → P6SDK/服务/浏览器 → P7本地部署/公共测试网门禁 → P8源码教学/复现/交付。

当前实际技术栈由锁文件和compiler bootstrap固定。数据库/Redis不因其他项目惯例强行加入：账户权限、额度和nonce的权威在链上；本地文件保存签名事务索引，不能冒充生产复制数据库。

完整公共测试网端到端仍需明确网络/费用授权和工程适配。当前硬编码local-only约束是防止未经授权广播的实现边界，不是已经完成测试网上链的证据。该未完成项必须随交接继续推进。
