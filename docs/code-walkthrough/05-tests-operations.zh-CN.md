# 测试、状态模型、部署与CI

Commit `4310b67aa4e1b1cee10dbeb82bece4910ad8ca7b`。工程根路径 `/home/chenhy/workspace/web3-portfolio/smart-account-platform`。

## A. Business Principle
测试从需求与不变量推出，既要证明有效用户可执行，也要证明非法状态被拒绝。部署验证证明选定源码产生了实际代码；源码存在和HTTP200不等于功能完成。

## B. Architecture
合约unit/negative/fuzz → 有独立计数模型的stateful handler → SDK单元/差分 → 真实服务/链API → 浏览器WebAuthn/阈值/撤销 → 精确创建calldata与runtime哈希验证。各层证明边界分开。

## C. Source Implementation
|实际测试声明|证明的性质|
|---|---|
|`tests/contracts/Account.t.sol:129` `testFactoryIdempotentAndSeparated`|重复参数返回同地址，不同salt分离。|
|`tests/contracts/Account.t.sol:134` `testOwnerExecutionAndNonceReplay`|成功业务路径后相同操作再次执行被EntryPoint拒绝。|
|`tests/contracts/Account.t.sol:144` `testWrongSignerAndMalformedSignature`|错误key和长度不合法签名失败。|
|`tests/contracts/Account.t.sol:154` `testDirectAndInheritedBypassDenied`|直接EOA调用与继承的无作用域入口都不能绕过正式流程。|
|`tests/contracts/Account.t.sol:163` `testAtomicBatchRollbackAndGasNonceStillConsumed`|目标状态原子回滚，但完整nonce递增；不要断言所有外层状态都回滚。|
|`tests/contracts/Account.t.sol:172` `testCrossChainSignatureRejected`|更改chain ID后原UserOperation签名无效。|
|`tests/contracts/Account.t.sol:180` `testERC1271DomainAndMalformed`|同消息在另一账户/另一链不可复用，畸形签名返回失败magic。|
|`tests/contracts/Account.t.sol:191` `testSessionBudgetExpiryAndRevocation`|累计预算、过期和撤销分别拒绝越界操作。|
|`tests/contracts/Account.t.sol:209` `testSessionCannotAdminOrWrongSelector`|session不能self-admin或调用另一个selector。|
|`tests/contracts/Account.t.sol:223` `testRevocationBetweenValidationAndExecution`|同一个handleOps内撤销后的预验证操作在执行时必须被拒绝。|
|`tests/contracts/Account.t.sol:243` `testMultisigSortedUniqueThreshold`|重复同一owner不能当两票，两个不同排序签名可以执行。|
|`tests/contracts/Account.t.sol:260` `testRecoveryDelayDuplicateVoteCancelAndEpoch`|重复guardian票无效、不能提前恢复、owner能取消、成功后旧owner失权。|
|`tests/contracts/Account.t.sol:284` `testSponsorshipReservesQuotaOnRevertingExecution`|revert也消耗预算，Paymaster不能被“只扣成功操作”的规则耗尽。|
|`tests/contracts/Account.t.sol:291` `testSponsorQuotaAndTamperRejected`|篡改gas参数导致赞助签名失败，低quota不能上链。|
|`tests/contracts/Account.t.sol:318` `testPasskeyValidWrongOriginNoUVWrongChallengeAndRevocation`|真实P256签名的正面路径与origin/UV/challenge/撤销负面路径。|
|`tests/contracts/Account.t.sol:343` `testFuzz_OwnerAmount`|随机正面输入确实能执行，避免所有路径都拒绝的空洞安全。|
|`tests/contracts/Account.t.sol:352` `testFuzz_AtomicRollback`|随机数值的先成功后失败批量都应恢复Counter。|
|`tests/contracts/Account.t.sol:360` `testGuardianCannotLockRecoverySlot`|一个guardian不能阻塞另两个达到阈值的guardian；合法ID在指针改变后仍可完成。|
|`tests/contracts/Account.t.sol:387` `testSessionReconfigurationInvalidatesQueuedOperation`|重配同一个key也不能保留旧签名语义。|
|`tests/contracts/Account.t.sol:397` `testTwoSessionOpsCannotOverspendOneBudget`|两笔分别满足预算的预验证操作仍不能合计超支。|
|`tests/contracts/Account.t.sol:416` `testInvalidSelectorsNonceAndEmptyBatch`|畸形selector、nonce不匹配、空批量失败。|
|`tests/contracts/Account.t.sol:436` `testInvalidOwnerGuardianListsAndUnauthorizedAdmin`|重复/零地址/非法阈值和普通调用者不能改变策略。|
|`tests/contracts/Account.t.sol:452` `testExpiredRotatedSponsorAndUnauthorizedPaymaster`|过期赞助、旧sponsor、非owner改quota、非EntryPoint验证被拒绝。|
|`tests/contracts/Account.t.sol:469` `testRecoveryWrongGuardianAndStalePolicy`|非guardian与旧策略下提案无效。|
|`tests/contracts/Account.t.sol:483` `testFuzzSessionBudget`|随机预算全部消费后额外1 wei必须失败。|
|`tests/contracts/Account.t.sol:495` `testCallbackCannotReenterExecutionOrFinalizeRecovery`|真实恶意目标回调被身份/锁拒绝，成熟恢复也不能在账户执行中完成。|
|`tests/contracts/Account.t.sol:529` `testListsReceiveAndDisabledBatch`|公开列表和接收ETH路径可用，disabled batch依然拒绝。|
|`tests/contracts/Account.t.sol:540` `testCancelSpecificProposalDoesNotCancelIndependentThreshold`|取消一个ID不应取消另一个独立合法提案。|
|`tests/contracts/Account.t.sol:553` `testMalformedPasskeyAndUnknownSignatureMode`|未知签名模式、错误ABI、非法key配置必须失败。|
|`tests/contracts/Account.t.sol:584` `testPaymasterConstructorAndZeroSponsorGuards`|零sponsor不能配置，避免无意义授权域。|
|`tests/contracts/Account.t.sol:591` `testCounterfactualFactoryDeploymentViaEntryPoint`|真正通过initCode由EntryPoint创建账户并执行，不是提前手动new账户。|
|`tests/contracts/Account.t.sol:614` `testIndependentNonceKeysAndReplayIsolation`|key42顺序独立于key0，完整nonce重放仍失败。|

## D. Stateful与运维语句解释
- `tests/contracts/Stateful.t.sol:31`：随机选择owner、受限session、错误签名或原子失败路径；正面路径不能随意revert，负面路径不能被接受。
- `tests/contracts/Stateful.t.sol:55`：只把预期成功的业务效果加到独立模型中，和合约状态逐步比较。
- `tests/contracts/Stateful.t.sol:108`：已用session native value与remaining之和恒等于初始预算；不仅断言余额非负。
- `tests/contracts/Stateful.t.sol:114`：随机业务和非法调用不能改变owner集合/阈值。handler未包含所有策略更换；对应专门回归测试另行覆盖。
- scripts/mutation-check.py：在独立`.runtime/mutations/`副本中分别忽略批量失败、允许重复owner、删除session扣款。原工程不被改坏；测试必须杀死这些突变，不能把测试突变报告成真实审计漏洞。
- scripts/bootstrap-compiler.py：按官方SHA256安装到项目`.toolchain/`，不动用户全局版本。
- scripts/check.sh/write-checkpoint.py：检查前后源文件摘要必须一致；只在format/type/unit/fuzz/invariant/强制构建/Next构建全成功后写PASS checkpoint。
- scripts/local-stack.ts：先检查Git源状态、checkpoint、全部合约编译器/优化/EVM配置，再进行第一笔部署。旧栈保留。
- scripts/verify-local.ts：核对原始artifact SHA256、真实创建交易input/constructor args、receipt地址与状态、runtime codehash、固定EntryPoint和Paymaster存款。
- scripts/run-local.sh：拒绝占用的端口；只管理自己的子进程；保留Anvil状态、服务状态和密钥。退出不是清库。
- .github/workflows/ci.yml：actions固定commit，Node/Foundry固定版本，CI只用隔离本地链。文件存在不等于GitHub已执行；实际CI状态必须另报。

## E. Execution Trace
关注`evidence/check-final.txt`的真实命令结果与checkpoint.sourceHash；再核对deployments/local.json的sourceCommit和创建交易，最后用verify-local.ts重新读取链上状态。出现旧编译器artifact时预检必须阻止部署，不能因为某个测试日志写0.8.38就推断所有依赖artifact已更新。

## F. Test Explanation
fuzz记录种子0x4337和实际runs；invariant记录有效step与unauthorized调用次数，避免空洞通过。coverage使用IR minimum instrumentation，其gas不能作正常优化构建的gas基线。mutation只证明三个指定回归能发现三种指定退化，不是完整mutation score。

## G. Security Reasoning
不提交`.runtime`、真实私钥、运行服务状态或默认测试钱包。源码打包使用Git已审查内容。CI不运行公共部署、生产迁移或发布。独立第三方审计、形式化全称证明、公共测试网验收和物理Passkey均不能通过本地测试名义替代。

## H. Practical Exercise
让某个正确owner操作错误地revert，确认状态模型会失败而不是把它吞掉。分别重放旧epoch、旧nonce、旧sponsor和另一个EntryPoint域。试着在check.sh运行中改源文件，应看到源漂移门禁失败，而不是得到陈旧PASS。

## I. Interview Questions
coverage为什么不能证明安全？为什么把错误路径全部catch也可能让invariant空洞通过？哪部分gas来自instrumentation？部署时为什么要检查全部artifact，而不是只检查SmartAccount？代码SHA、artifact SHA、runtime codehash和交易hash各自绑定什么？
