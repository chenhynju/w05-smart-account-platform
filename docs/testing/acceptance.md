> **最新状态覆盖：浏览器重跑出现未解决的Passkey AA24签名失败，完整本地Gate未通过。以下PASS属于先前已记录子范围，不能代替最新失败。见 latest-regression.md（位于docs/testing）。**

# Evidence-bounded acceptance — local stage

日期：2026-11-03 Asia/Shanghai。源码参考 `4310b67aa4e1b1cee10dbeb82bece4910ad8ca7b`。完整Master Prompt任务 **未完成**。

|Gate|结果|真实证据与边界|
|---|---|---|
|需求/设计/威胁/ADR|PASS（本地阶段）|source-requirements、19维规格、追踪矩阵、HLD/LLD/图/权限/不变量/7个ADR|
|编译/format/strict TS/生产构建|PASS|evidence/check-final.txt与checkpoint.json，摘要 394781e134a3ad176d0c6234175b376fe5ac6010a9084eed4e200de63e4103b9|
|Foundry unit/negative/fuzz/stateful|PASS|33测试；3×1000 fuzz；256轮/16384调用，seed0x4337|
|Coverage|PASS|coverage-final038.txt与final-lcov.info；SmartAccount93.40%行/100%函数，覆盖率不替代审计|
|SDK单元/差分|PASS|TypeScript4测试；实际EntryPoint.getUserOpHash一致|
|API/真实本地链|PASS|service-integration-final.txt，10测试；包括标准viem客户端和断连幂等|
|代表性浏览器业务|PASS|evidence/browser/acceptance.json，10检查点，真实虚拟CTAP2/P256/链上状态|
|完整浏览器批量失败与延迟恢复完成|NOT RUN|当前批量原子性已在合约/API验证；浏览器已做guardian提案取消，但延迟后完成/旧owner失权整条GUI仍需补齐|
|服务与RPC恢复|PASS|service-restart/rpc-failure-recovery.json，实际停止服务及暂停/恢复隔离Anvil|
|冷状态加载|PASS（本地）|cold-restore.json，独立第二进程/18556，主链保留，含历史receipt；不是生产灾备|
|本地部署/字节码/创建参数|PASS|deployments/local.json及deployment-verification.json；源 297be8d4c862ffcf99543f2a7e0f4edf6a8c5f58|
|静态/人工审查/真实PoC修复|PASS（自评范围）|Slither25告警已复审；F-01真实恢复DoS已修；无独立审计认证|
|变异/依赖/秘密检查|PASS（所列范围）|3个指定mutant均杀死；npm audit0；Gitleaks未发现秘密|
|同机干净副本复现|PASS|clean-reproduction.json；fresh node_modules，复用缓存/compiler，非新OS|
|GitHub CI执行|NOT RUN|workflow已写且本地等效命令已跑；无远端CI完成记录|
|公共测试网全栈/上链/验证|BLOCKED / NOT RUN|目前local-only参数化仍待工程适配；网络/费用/广播/资金需对应授权|
|主网/公开发布|NOT RUN|没有对应授权，也没有宣称已发布|
|Learning材料|PASS（阶段材料）|5份A–I导读、协议机制、源码行/SHA、练习/知识矩阵/面试；新增代码须同步|
|用户本人掌握|NOT RUN|没有实际答题/改码验收，不能自行宣称已理解|

Engineering Gate：本地已验证子范围PASS；完整原始范围仍未通过。Learning Gate：材料与用户掌握分开。公开测试网和未验证GUI用例继续追踪，不以本地通过替代。
