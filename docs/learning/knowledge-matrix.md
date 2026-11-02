# Knowledge Matrix

每项关联官方规范、真实代码、测试、风险、理解题与练习。学习者掌握状态统一NOT RUN，除非经过实际答题/改码验收。

|知识点|业务/架构/执行/源码导读|实际测试入口|风险与练习|掌握|
|---|---|---|---|---|
|4337角色/验证执行分离|[A–I导读](../code-walkthrough/01-smart-account.zh-CN.md)|`testRevocationBetweenValidationAndExecution`|同导读G安全、H动手、I理解题；官方来源见protocol-mechanics与requirements-analysis|NOT RUN|
|ECDSA/阈值唯一签名|[A–I导读](../code-walkthrough/01-smart-account.zh-CN.md)|`testMultisigSortedUniqueThreshold`|同导读G安全、H动手、I理解题；官方来源见protocol-mechanics与requirements-analysis|NOT RUN|
|nonce和跨链域|[A–I导读](../code-walkthrough/03-sdk-passkey.zh-CN.md)|`testIndependentNonceKeysAndReplayIsolation`|同导读G安全、H动手、I理解题；官方来源见protocol-mechanics与requirements-analysis|NOT RUN|
|CREATE2/反事实部署|[A–I导读](../code-walkthrough/02-factory-paymaster.zh-CN.md)|`testCounterfactualFactoryDeploymentViaEntryPoint`|同导读G安全、H动手、I理解题；官方来源见protocol-mechanics与requirements-analysis|NOT RUN|
|P256/WebAuthn/RP/origin/UV|[A–I导读](../code-walkthrough/03-sdk-passkey.zh-CN.md)|`testPasskeyValidWrongOriginNoUVWrongChallengeAndRevocation`|同导读G安全、H动手、I理解题；官方来源见protocol-mechanics与requirements-analysis|NOT RUN|
|session白名单/预算/撤销|[A–I导读](../code-walkthrough/01-smart-account.zh-CN.md)|`testTwoSessionOpsCannotOverspendOneBudget`|同导读G安全、H动手、I理解题；官方来源见protocol-mechanics与requirements-analysis|NOT RUN|
|guardian阈值/延迟/DoS|[A–I导读](../code-walkthrough/01-smart-account.zh-CN.md)|`testGuardianCannotLockRecoverySlot`|同导读G安全、H动手、I理解题；官方来源见protocol-mechanics与requirements-analysis|NOT RUN|
|Paymaster预算/失败成本|[A–I导读](../code-walkthrough/02-factory-paymaster.zh-CN.md)|`testSponsorshipReservesQuotaOnRevertingExecution`|同导读G安全、H动手、I理解题；官方来源见protocol-mechanics与requirements-analysis|NOT RUN|
|RPC/队列/幂等/恢复|[A–I导读](../code-walkthrough/04-service-ui.zh-CN.md)|`tests/integration/service.test.ts`|同导读G安全、H动手、I理解题；官方来源见protocol-mechanics与requirements-analysis|NOT RUN|
|前端交易生命周期/多签审批|[A–I导读](../code-walkthrough/04-service-ui.zh-CN.md)|`tests/e2e/browser.cjs`|同导读G安全、H动手、I理解题；官方来源见protocol-mechanics与requirements-analysis|NOT RUN|
|fuzz/invariant/mutation/安全证据|[A–I导读](../code-walkthrough/05-tests-operations.zh-CN.md)|`tests/contracts/Stateful.t.sol`|同导读G安全、H动手、I理解题；官方来源见protocol-mechanics与requirements-analysis|NOT RUN|
|编译器/部署/恢复/CI|[A–I导读](../code-walkthrough/05-tests-operations.zh-CN.md)|`scripts/verify-local.ts`|同导读G安全、H动手、I理解题；官方来源见protocol-mechanics与requirements-analysis|NOT RUN|
