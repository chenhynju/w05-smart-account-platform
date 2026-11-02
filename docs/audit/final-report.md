> **最新状态覆盖：浏览器重跑出现未解决的Passkey AA24签名失败，完整本地Gate未通过。以下PASS属于先前已记录子范围，不能代替最新失败。见 latest-regression.md（位于docs/testing）。**

# Local-stage security report

**Self-Assessment / AI-Assisted Review. Not an independent third-party audit.**

当前完整任务尚未完成。本地工程阶段已建立真实实现、对抗回归、复现与客户端证据；公共测试网配置/授权/广播/链上验证、额外浏览器用例和远程CI仍需继续。不得据本报告声称生产可用、公共网络已部署或学习者已掌握。

## Scope and versions
本阶段源代码参考 `4310b67aa4e1b1cee10dbeb82bece4910ad8ca7b`；实际本地部署源码 `297be8d4c862ffcf99543f2a7e0f4edf6a8c5f58`。两者的产品源码相同，后者之后主要增加文档、浏览器选择器/测试fixture适配；最终创建交易与artifact/runtime验证独立保留。编译器0.8.38 checksum固定、Cancun、viaIR、optimizer200；AA0.8.0、OZ5.5.0。完整信任边界见review-scope.md。

## Confirmed Finding and remediation
F-01 Medium：单guardian占用唯一恢复提案槽，可阻止其余合法阈值恢复。已真实复现Unauthorized失败，改为按ID并行提案，并通过重复票/竞争提案/延迟/取消/旧策略/回调回归。详见findings/F-01-guardian-proposal-lock.md。最终本地复审没有确认仍未修复的Critical/High；这不是不存在未知漏洞的保证。

## Automated and adversarial evidence
- Foundry：32个unit/negative/fuzz测试加1组3条stateful invariants，共33测试通过；3个fuzz各1000次，状态序列256轮/16384次调用，非空洞正反路径。
- 最终coverage：SmartAccount行93.40%、分支87.18%、函数100%；Factory/Counter/Paymaster行100%。总表包含测试handler，不能把总表94.70%冒充所有业务源码的均匀覆盖。instrumentation gas不当作优化构建gas。
- 测试突变：原子失败、重复owner、session扣预算三个隔离mutant都被指定回归杀死。它们不是人为制造的生产Finding。
- Slither：102 detectors完成，25项自动告警逐类复审，见static-triage.md；不是零告警。
- npm audit当前保存结果0通告；Gitleaks扫描历史未发现秘密。未知依赖风险仍存在。
- API：10个测试通过，含真正viem BundlerClient互操作、完整trace模拟、赞助、实际失败事件、幂等与客户端断连恢复。
- 浏览器：10个检查点通过，含真正WebAuthn/P256链上验证、session撤销、阈值不足拒绝与双签成功、guardian提案取消、390px布局，无pageerror。虚拟CTAP2，不是物理认证器或独立人类托管。
- 恢复：Node服务重启、Anvil暂停导致503并恢复、独立端口冷加载dump后nonce/余额/代码/Counter/历史receipt保持一致。未做磁盘损坏、生产灾备或公共reorg验收。
- 干净副本：同一Linux主机全新checkout/node_modules，复用npm缓存与核验过的compiler，完整check.sh通过；不是新操作系统或已运行的GitHub CI。

## Residual risk and remaining gates
固定EntryPoint/RPC/本地OS可信；达到阈值guardian能恢复账户；sponsor/Paymaster owner能影响其预算。native ETH session cap不约束Token allowance或恶意target内部经济行为。全局epoch有保守失效代价。严格WebAuthn JSON有浏览器兼容性限制。当前服务是loopback allowlisted本地实现，gas估算要求有效签名，不宣称完整ERC-7562/mempool/7702/聚合/替换兼容。公共测试网链配置和预算授权仍未准备/执行完成，继续事项保留在需求追踪与交接，不能删掉困难需求。
