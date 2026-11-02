# CREATE2 Factory 与 QuotaPaymaster

Commit `297be8d4c862ffcf99543f2a7e0f4edf6a8c5f58`。实际路径 `/home/chenhy/workspace/web3-portfolio/smart-account-platform/contracts/AccountFactory.sol` 和 `/home/chenhy/workspace/web3-portfolio/smart-account-platform/contracts/QuotaPaymaster.sol`。

## A. Business Principle
Factory把owner、guardian与固定EntryPoint写入部署身份；Paymaster提供有上限的Gas代付，不取得账户交易权限。赞助不是“免费的区块链”：是另一个主体承担成本。

## B. Architecture
Factory非代理部署，避免initializer被抢先初始化。Paymaster继承上游BasePaymaster的EntryPoint身份、deposit、stake及onlyOwner提取机制；自行增加sponsor签名与每sender额度。共享策略存储需要额外ERC-7562/stake审查，当前不是公共mempool合规承诺。

## C. Source Implementation
- `contracts/AccountFactory.sol:15`：CREATE2的20字节地址由工厂、salt与完整creation-code hash决定。
- `contracts/AccountFactory.sol:23`：相同参数重复创建返回原账户，不重新初始化owner。
- `contracts/AccountFactory.sol:24`：构造参数实际进入creationCode的hash，所有权不能由抢先调用者替换。
- Counter.sol仅是本地验收目标，`increment`观察调用者和value，`fail`提供真实可复现的批量失败；不是一个完整客户业务协议。

## D. Line-by-Line Walkthrough
|真实源码行|语句与作用|为什么及失败边界|
|---|---|---|
|`contracts/QuotaPaymaster.sol:24`|管理员配置以wei计的剩余预算，并旋转quotaEpoch|旧sponsor授权失效；其他账户预算不会被清空。|
|`contracts/QuotaPaymaster.sol:42`|验证签名域前先要求固定前缀完整|52=20+16+16；不混用v0.6旧字段布局。|
|`contracts/QuotaPaymaster.sol:45`|自定义签名域标签|后续所有字段ABI编码，避免字符串拼接歧义。|
|`contracts/QuotaPaymaster.sol:51`|绑定反事实部署参数|攻击者不能把某笔Gas许可改成部署其他账户。|
|`contracts/QuotaPaymaster.sol:56`|绑定Paymaster及其gas上限，不含自身签名|消除循环签名依赖，同时防止改gas限额。|
|`contracts/QuotaPaymaster.sol:70`|解析有效时间、quotaEpoch和签名|畸形ABI应被EntryPoint归类为paymaster验证失败。|
|`contracts/QuotaPaymaster.sol:74`|检查正式ECDSA恢复结果与当前sponsor|server声称已签名不等于链上通过。|
|`contracts/QuotaPaymaster.sol:77`|比较EntryPoint给出的最大成本与该sender预算|不能只按预估成功gas扣款，否则revert耗费会逃逸。|
|`contracts/QuotaPaymaster.sol:78`|验证时预留最坏成本|包括执行失败；没有postOp退款的业务计费承诺。|
|`contracts/QuotaPaymaster.sol:81`|空context不触发额外postOp工作|减少回调DoS面；实际退款由EntryPoint存款结算，不是业务quota退款。|

## E. Execution Trace
service先设置52字节前缀、向sponsorshipDigest查询精确摘要、用私有sponsor key签名，再填完整paymasterAndData，最后客户端owner签UserOperation。EntryPoint先验证账户，再验证Paymaster并扣quota，随后执行。执行失败时Counter回滚，Reserved与额度扣除仍保留。

## F. Test Explanation
反事实部署测试真正把factory initCode交给EntryPoint；重复创建测试核对地址。赞助测试覆盖真实handleOps成功与revert、gas字段篡改、有效期、签名者旋转、超预算、非管理员和非EntryPoint调用。它们不能证明任意第三方bundler接受这个Paymaster。

## G. Security Reasoning
密码学绑定操作与上限，预算预留限制最坏损失。管理员能配置额度、提取存款，是显式信任角色。sponsor被攻破仍可烧掉剩余额度，因此需要密钥隔离、余额监控、速率限制与预算治理。validation存储写入与全局quotaEpoch使公共mempool规则必须单独审查。

## H. Practical Exercise
逐项修改nonce、chain、callData、gasFees、有效期、EntryPoint，预测哪个签名首先失败。再设计按实际费用退quota的postOp方案，列出postOp失败、重入和多操作预验证时怎样守住上限。

## I. Interview Questions
为什么不能对含sponsor签名的整个操作先签sponsor？为什么失败执行也必须扣预算？quota为何不等于deposit？为什么一个已存款的Paymaster仍可能不能进公共mempool？CREATE2前置部署为什么不能偷走账户owner？
