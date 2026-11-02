# W05 本地验证交付 · 公共阶段仍受阻

更新时间 2026-11-03T04:55:32.847744+08:00。**Engineering Gate：本地范围PASS，完整Master目标BLOCKED；Learning Gate：材料已交付，用户本人掌握NOT RUN。**没有公共网络签名、广播、费用支出、主网操作或远程公开发布。

## 源码与运行
Ubuntu-24.04 `/home/chenhy/workspace/web3-portfolio/smart-account-platform`，产品冻结 `fcc439f8167b7573269f1ce5a17058071e10a0a7`，最终完整源码摘要 `fc1008dad72f7f426e0279b191cf03f7228eae392d88a9bd396c951262e66dec`。链上合约部署源b1a60953ac71c22259910bfffb290eb903e5e579，与当前contracts目录逐字节一致；UI/SDK/service为最终新构建。交付归档Commit另见W05-artifacts.json。

本地应用 http://localhost:3155 ，service4355，Anvil18555/chain31337；零默认账户，随机一次性key只保存在受保护runtime。链已因测试推进多天，不要重置来掩盖时钟缺陷。EP `0xa7d3c70c11d2a10c5a96c11e125825506b481bd2`；Factory `0xe7dc4974a544eecd4df4e1393c6587b4fb4a7e5d`；Paymaster `0xac2010fd167fa390c7562c5931d4a3aff8c16da5`；Counter `0x6120628f987b66469e913b0443a2e22e4ce02f64`。所有旧栈、存款、manifest、store和runtime保留。

## 功能与真实证据
|验收|结果|证据与边界|
|---|---|---|
|所有MVP/高级功能本地实现|PASS|确定性/反事实部署、ERC1271、单笔/原子批量、赞助、Passkey、session exact target/selector/native限额、恢复、多签、quota与恶意调用模拟；不宣称原生限额自动覆盖Token allowance|
|格式/严格类型/TS8/Foundry35/强制编译/生产构建|PASS|check-delivery-final.txt，3×1000 fuzz；3条stateful性质合并1组，256轮/16384调用，seed0x4337|
|真实API11|PASS|service-integration-release.txt；包括SDK/EP哈希、真实BundlerClient、pending时钟、失败原子性、断连幂等、CSRF和管理RPC拒绝|
|真实浏览器16项|PASS|browser-release；主动推进链两天验证一小时session，原子批量成功/回滚，撤销，多签，guardian延迟/完成/旧owner失权，390px与无pageerror|
|连续13次Passkey上链|PASS|虚拟CTAP2、真实浏览器WebAuthn/P256，不重试失败；额外12次观察到3个Chrome扩展。不是物理认证器或多人真人托管|
|独立干净依赖副本|PASS|重新npm ci后同步最终源码完整重跑，摘要与主仓一致；同机/npm缓存/核验compiler复用，不是全新OS或远端CI|
|重启/故障/冷恢复|PASS|当前栈service重启身份/nonce/quota不变；RPC暂停返回503并恢复；独立18556冷加载最新dump，代码/余额/nonce/历史receipt一致，未停主链|
|覆盖率测量|PASS|同一合约源码35测试通过；SmartAccount行93.55%/分支87.80%/函数100%；其他自写合约行100%。此后增强反例未重新计百分比，不把测试handler的总覆盖率冒充产品覆盖率|
|安全自评|PASS within scope|Slither success=true/26条告警全部分类复核；Counter locked-ether为明确接受的mock测试目标行为，公共默认value0；不是独立审计认证|
|变异测试|PASS within scope|既有3个隔离mutant被杀死；新上下文mutant最初存活，增强等长origin/有效签名错误RP测试后被同一mutant验证杀死，前后日志均保留|
|依赖/秘密|PASS bounded evidence|锁文件与已完成npm audit0版本一致；精确命名空间误报放行及最终Gitleaks扫描见日志，不输出/归档runtime私钥|
|Sepolia构建与只读准备|PASS / BLOCKED|构建PASS；RPC chain11155111/nonce/balance/pending读取PASS；必需debug_traceCall不可用，部署门禁拒绝广播；资金0，授权未取得|

## 真实Finding闭环
F-01 Medium：guardian全局槽DoS，改按ID并行提案并回归。F-02 Medium：整段JSON模板误拒绝合法WebAuthn扩展，捕获原始真实断言后采用W3C有限验证前缀/分隔符；RP/origin/challenge/UP/UV/P256/epoch不削弱。F-03 Low：电脑时间计算session期限，改为实际pending区块时间并在成功事件后激活本地key。F-04 Low：latest陈旧导致新赞助立即AA32，改pending并对齐模拟时间，十分钟差稳定回归PASS。所有失败、补丁、测试顺序修正和变异存活证据均保留，不用旧PASS覆盖新失败。

## 仍未完成，不能降级或删除
- 公共测试网实际部署、链上只读验证器实际执行、公开源码验证及公共完整业务E2E：BLOCKED/NOT RUN。当前免费PublicNode不支持debug_traceCall(callTracer, withLog)，必须配置兼容RPC，不能跳过内层执行验证。
- 部署者 `0x185B3B03933856E8A6FAaC22f8d405bD6EF58e02` 测试ETH余额0。只部署4合约+0.5ETH赞助存款，5笔最大0.5352测试ETH；服务另有持久0.5ETH最坏gas预留，上述合计保守gross1.0352（不扣报销）。Guardian自己的公共交易需要独立资金/对应授权。没有购买测试币或使用主网资金。
- 原Master Prompt §10.5要求公共签名/广播/费用/公开发布单独授权；本次定时执行不构成授权。先阅读W05-Sepolia-release-plan.md，配置兼容RPC并确认具体范围/预算，才可继续。不要在聊天中粘贴key。
- 物理认证器、多浏览器兼容、多人真人密钥托管、远端CI、独立审计均NOT RUN；不是已获认证的生产钱包。

## Learning Gate
6份A–I源码导读、实际行号/Commit/SHA source-map、19维规格/追踪矩阵、设计/资产流/权限/威胁/不变量、10个ADR、密码学与Gas机制、测试解释、4个真实Finding与修复教学、运维/复现、知识矩阵/习题/面试材料已提供。用户本人回答、改写和独立操作没有执行，掌握程度NOT RUN；不自行宣称已理解所有源码。

## 交付与接续
源码/历史归档只含Git跟踪文件，不含.runtime、私钥、依赖或本机编译器。W05-artifacts.json列出实际SHA256和交付Commit；本报告与交接为当前权威入口，旧WIP归档保留。已安排07:59续作；若仍无兼容RPC/资金/授权，应保存阻塞并保持安静，不重复初始化、建任务或执行公共操作。
