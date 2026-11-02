# Requirements Traceability Matrix

保留原始所有重要要求，区分实现、测试、安全检查与验收证据。完整任务尚未完成；PASS local不是公共网络或生产接受。

|ID|原始要求|设计/实际实现|真实测试/证据|安全检查|状态|
|---|---|---|---|---|---|
|F01|确定性及反事实部署|contracts/AccountFactory.sol；SmartAccount构造|testFactoryIdempotentAndSeparated / testCounterfactualFactoryDeploymentViaEntryPoint|CREATE2参数/owner绑定|PASS local|
|F02|ERC-1271|SmartAccount.messageDigest/isValidSignature|testERC1271DomainAndMalformed|账户/链/EP/epoch域|PASS local|
|F03|交易执行|executeOperation；SDK/UI/service|owner浏览器→真实UserOp事件|固定EP/Permit/身份/回调|PASS local|
|F04|原子批量|executeOperation Action[]；UI composer|合约与API批量revert/Counter恢复|CallFailed、nonce/gas不回滚|PASS local; GUI扩展NOT RUN|
|F05|Gas赞助|QuotaPaymaster；service.addSponsorship|API/浏览器实际赞助执行|签名/最大成本/存款|PASS local|
|F06|Passkey|WebAuthn/P256；packages/passkey.ts；UI|真实虚拟CTAP2浏览器及错误origin/UV/challenge回归|RP/origin/UV/epoch/low-s|FAIL intermittent AA24; previous virtual PASS retained; physical NOT RUN|
|F07|Session Key|Session/Permit与SDK/UI|浏览器配置/执行/撤销；预算/时间fuzz|重查、作用域、累计native value|PASS local|
|F08|白名单限额|exact target/selector/native预算|wrongSelector/selfAdmin/overspend/同bundle预算|不宣称Token allowance限额|PASS specified native scope|
|F09|社交恢复|ID提案/阈值/两天延迟/epoch|竞争提案与延迟/回调回归；GUI提案取消|F-01修复、重复票拒绝|PASS contracts; full GUI NOT RUN|
|F10|多签审批|严格排序不同owner；UI双批准|单票GUI拒绝，双票GUI成功，重复签名回归|不能按点击次数计票|PASS local; human custody NOT RUN|
|F11|Paymaster配额|remaining/quotaEpoch|revert仍保留额度、超额/篡改/旋转拒绝|最坏成本有限|PASS local|
|F12|恶意调用模拟|完整handleOps/debug_traceCall|batch-simulation.json实际reverted和原因|不把外层成功当内层成功|PASS local|
|S01|重放/Nonce/跨链|EP keyed nonce与typed-data域|nonce replay/key42/crossChain/ERC1271对照|实际AA25/AA24错误|PASS local|
|S02|权限撤销|全局epoch、执行重查|同handleOps撤销与后续旧操作回归|StaleAuthorization/SessionDenied|PASS local|
|I01|完整客户端链路|Next/wagmi/viem/Node/真实EP|10浏览器检查点，10 API测试|receipt/event→UI而非HTTP200|PASS representative local; extensions pending|
|I02|基础设施可靠性|serialized tx→fsync→broadcast；对账|断连/服务重启/RPC503/冷加载实测|保留原tx身份，恢复不重复执行|PASS tested local failure modes|
|Q01|测试与自评|tests、Slither、mutation、依赖/秘密扫描|check-final/coverage-final038/static-triage/F-01|不是形式化或独立审计|PASS self-assessment scope|
|D01|部署与链上验证|local-stack/verify/checkpoint/run-local|真实本地创建input/receipt/runtime/存款|公共网络仍缺适配和授权|PASS local; public BLOCKED/NOT RUN|
|L01|源码教学与学习|code-walkthrough/learning|真实行号/Commit/hash/A–I/练习与题目|用户掌握必须亲自验证|PASS materials; mastery NOT RUN|
|R01|复现/交付/CI|锁文件/compiler SHA/CI/README/脚本|clean-reproduction完整检查通过|CI文件不等于远端执行|PASS same-host clean copy; CI NOT RUN|
