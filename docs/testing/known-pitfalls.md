# Known pitfalls: failure, cause, defense and regression

实际完整trace见evidence/security-failure-traces-and-gas.txt，当前编译器0.8.38。以下是本工程真实输出，不是猜测的错误文字。

|风险|实际失败/观察|根因及防护|回归与证明边界|
|---|---|---|---|
|签名重放|`AA25 invalid account nonce`|同sender/key的sequence已消费；EntryPoint唯一性+完整calldata nonce绑定|testOwnerExecutionAndNonceReplay；不证明任意其他协议消费端已防重放|
|Nonce管理|key42递增而key0不变，重放仍拒绝|192位key+64位sequence；SDK用bigint避免Number损失|testIndependentNonceKeysAndReplayIsolation；没有任意队列替换规则认证|
|权限撤销|`StaleAuthorization()`|同bundle先验证后执行，前操作撤销后操作；执行必须重查epoch|testRevocationBetweenValidationAndExecution，浏览器revoked session拒绝|
|跨链/跨账户签名域|`AA24 signature error`|原签名域不再匹配chain/EntryPoint/sender；ERC-1271另包账户域|testCrossChainSignatureRejected/testERC1271DomainAndMalformed；不是跨链桥测试|
|批量原子性|`CallFailed(1, …)`及`INTENTIONAL_FAILURE`；Counter恢复|传播目标revert回滚账户调用栈；不能错误要求费用/nonce也回滚|testAtomicBatchRollbackAndGasNonceStillConsumed；API真实failure event|
|Paymaster恶意耗费|`QuotaExceeded()`；失败执行后quota仍减少|验证前预留最坏成本，失败也计额度；签名绑定gas和payload|testSponsorshipReservesQuotaOnRevertingExecution/testSponsorQuotaAndTamperRejected；本地有限预算模型|

另外真实发现的单guardian恢复槽DoS单列F-01并有修复前FAIL trace。攻击测试只在本地或隔离副本中进行；没有公共网络利用、真实资金或虚构漏洞数量。
