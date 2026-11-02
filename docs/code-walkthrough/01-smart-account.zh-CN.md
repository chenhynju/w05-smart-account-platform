# SmartAccount：从授权到恢复

源码冻结 Commit：`4310b67aa4e1b1cee10dbeb82bece4910ad8ca7b`。实际路径：`/home/chenhy/workspace/web3-portfolio/smart-account-platform/contracts/SmartAccount.sol`。代码变更后必须重新生成行号与source-map。

## A. Business Principle
账户持有资产，授权规则可编程。owner阈值拥有完整权限；session拥有小范围权限；guardian只能延迟换owner；Paymaster不拥有账户资金。

## B. Architecture
继承上游BaseAccount复用固定EntryPoint校验、nonce协作与prefund流程。自行实现签名、执行作用域和策略。没有代理、升级管理员或delegatecall。状态分成当前策略、每key session、每calldata Permit、每ID恢复提案。

## C. Source Implementation
|函数声明所在行|职责、执行效果与边界|
|---|---|
|`contracts/SmartAccount.sol:99` `entryPoint`|返回构造时固定的信任入口；没有管理员可以升级该地址。|
|`contracts/SmartAccount.sol:103` `ownerList`|返回当前 EOA owner 地址列表，供 UI 与审计核对；不是权限校验替代品。|
|`contracts/SmartAccount.sol:107` `guardianList`|返回守护者列表，阈值以链上 guardianThreshold 为准。|
|`contracts/SmartAccount.sol:113` `executeOperation`|只接受固定 EntryPoint，消费与完整 calldata 绑定的 Permit；重查 epoch/session；用 call 执行全部动作并传播失败。|
|`contracts/SmartAccount.sol:130` `execute`|明确禁用继承的无作用域入口，防止其他客户端误用旁路。|
|`contracts/SmartAccount.sol:134` `executeBatch`|同样禁用 BaseAccount 的直接批量接口，唯一正式入口是 executeOperation。|
|`contracts/SmartAccount.sol:138` `decodeOperation`|对 selector 和 ABI 类型做边界解析，供验证函数通过 try/catch 把畸形 payload 转成失败。|
|`contracts/SmartAccount.sol:149` `_validateSignature`|绑定 nonce/epoch、非空且最多16个动作，按签名模式验证并保存 calldata Permit；session 时间范围交给 EntryPoint。|
|`contracts/SmartAccount.sol:190` `_thresholdValid`|长度必须正好65×threshold，逐个恢复 low-s ECDSA signer，严格递增且属于当前 owners。|
|`contracts/SmartAccount.sol:202` `messageDigest`|为 ERC-1271 消费者 hash 加账户/链/EntryPoint/epoch 域隔离。|
|`contracts/SmartAccount.sol:206` `isValidSignature`|只读调用阈值校验，成功返回0x1626ba7e，其余返回0xffffffff。|
|`contracts/SmartAccount.sol:210` `_sessionAllowed`|逐动作检查 exact target、禁止 self/EntryPoint、至少4字节selector、累计native value预算。|
|`contracts/SmartAccount.sol:227` `_spendSession`|执行时再次检查当前策略和截止时间，先扣累计预算再外部调用；回滚会恢复预算。|
|`contracts/SmartAccount.sol:237` `setSession`|只能由账户自己的已授权调用配置，目标必须有代码，epoch递增使旧授权失效。|
|`contracts/SmartAccount.sol:250` `revokeSession`|删除指定 key 并递增epoch，已经验证但尚未执行的旧操作也不能通过执行重查。|
|`contracts/SmartAccount.sol:256` `setOwners`|检查非零严格排序列表和阈值，再替换集合；清除最新恢复指针并使旧提案epoch失效。|
|`contracts/SmartAccount.sol:272` `setGuardians`|同样替换当前 guardian 集合和阈值；旧 guardian 的提案不会在新策略下继续有效。|
|`contracts/SmartAccount.sol:288` `_validateList`|required位于1..length，length最多10，地址严格递增避免零地址和重复。|
|`contracts/SmartAccount.sol:297` `setPasskey`|仅单签策略可配置；绑定公开P256坐标、RP哈希、origin与新epoch，不能上传私钥。|
|`contracts/SmartAccount.sol:310` `revokePasskey`|递增epoch使已登记passkey失效，保留公钥数据不代表仍有授权。|
|`contracts/SmartAccount.sol:317` `verifyPasskey`|验证真实WebAuthn断言；严格JSON和RP绑定补足第三方库省略的上下文检查。|
|`contracts/SmartAccount.sol:332` `_bumpEpoch`|策略全局版本单调递增；Solidity checked arithmetic禁止回绕到0。|
|`contracts/SmartAccount.sol:338` `proposeRecovery`|每次提案得到独立ID与两天截止时间，并自动记录提议guardian的第一票；不占全局唯一锁。|
|`contracts/SmartAccount.sol:352` `approveRecovery`|无参版本操作最新指针，有参版本针对确定ID；真正权限与唯一票检查在内部函数。|
|`contracts/SmartAccount.sol:356` `approveRecovery`|无参版本操作最新指针，有参版本针对确定ID；真正权限与唯一票检查在内部函数。|
|`contracts/SmartAccount.sol:360` `_approveRecovery`|检查当前guardian、提案active/epoch和未投票，计一票并发事件。|
|`contracts/SmartAccount.sol:372` `cancelRecovery`|无参版使全部旧提案随epoch失效；有参版只禁用该ID，不破坏独立合法提案。|
|`contracts/SmartAccount.sol:377` `cancelRecovery`|无参版使全部旧提案随epoch失效；有参版只禁用该ID，不破坏独立合法提案。|
|`contracts/SmartAccount.sol:382` `completeRecovery`|无参版针对最新指针，有参版可完成被其他提案覆盖显示的合法ID。|
|`contracts/SmartAccount.sol:386` `completeRecovery`|无参版针对最新指针，有参版可完成被其他提案覆盖显示的合法ID。|
|`contracts/SmartAccount.sol:390` `_completeRecovery`|禁止执行期间回调完成恢复，检查阈值/延迟/epoch，替换owner并全面撤销旧授权。|
|`contracts/SmartAccount.sol:410` `_clearRecovery`|只清空最新提案的UI便利字段；不把它当作所有提案的权威存储。|

## D. Line-by-Line Walkthrough
这里解释安全相关的重要语句，而不为明显赋值制造逐行废话。

|真实源码行|语句与作用|为什么及失败边界|
|---|---|---|
|`contracts/SmartAccount.sol:114`|入口身份与执行锁同时校验|EOA owner 也不能直接绕过 UserOperation；回调不能重入。|
|`contracts/SmartAccount.sol:115`|对真正执行的全部calldata取hash|Permit不能拿去执行另一个nonce、epoch或动作。|
|`contracts/SmartAccount.sol:117`|比较验证时Permit版本和当前策略|处理同bundle中前一操作先撤销后续权限的情况。|
|`contracts/SmartAccount.sol:118`|在外部调用前消费Permit|失败整体回滚时状态恢复，但EntryPoint nonce仍防同操作再次上链。|
|`contracts/SmartAccount.sol:120`|执行时重新核验session并扣预算|验证时两个操作各自低于预算，不代表两者合计低于预算。|
|`contracts/SmartAccount.sol:122`|普通call保持账户作为msg.sender|没有delegatecall；目标自己的内部行为仍属于信任边界。|
|`contracts/SmartAccount.sol:123`|向上抛出失败索引和原始返回数据|保证账户调用栈内的批量业务状态回滚。|
|`contracts/SmartAccount.sol:153`|外部self-call允许捕获ABI解析异常|返回签名失败而不是让畸形输入触发未解释的解析panic。|
|`contracts/SmartAccount.sol:160`|完整nonce必须与EntryPoint操作一致|不能只比较低64位，也不能让calldata携带另一个nonce。|
|`contracts/SmartAccount.sol:163`|第一字节选择owner/session/passkey|未知模式失败；不是由服务端声明一个角色就信任它。|
|`contracts/SmartAccount.sol:176`|把有效期放进ERC-4337 validationData|验证阶段不读取timestamp，EntryPoint检查time range；执行阶段还会重查。|
|`contracts/SmartAccount.sol:186`|验证结果绑定calldata保存|不能用单个lastSigner全局变量，多个预验证操作会互相覆盖。|
|`contracts/SmartAccount.sol:195`|严格地址顺序与owner集合检查|消除重复票；无效签名先看ECDSA错误码。|
|`contracts/SmartAccount.sol:221`|在累加前检查剩余预算|上轮已保证total≤remaining，减法不会先下溢；金额单位wei。|
|`contracts/SmartAccount.sol:234`|effects-before-interactions扣预算|后续目标回调不能再次使用未扣预算；失败回滚恢复它。|
|`contracts/SmartAccount.sol:318`|passkey只能使用当前单签策略|不能以旧P256凭据绕过新2-of-2策略。|
|`contracts/SmartAccount.sol:320`|核对认证器签署的RP ID hash|仅检查clientData中的origin而不检查RP不够。|
|`contracts/SmartAccount.sol:328`|严格比较完整预期浏览器JSON|拒绝错误origin、challenge、crossOrigin和重复字段歧义。|
|`contracts/SmartAccount.sol:329`|调用固定版本的正式密码学库并要求UV|不要用mock签名替换真实P256验证；虚拟认证器仍做真实签名。|
|`contracts/SmartAccount.sol:342`|创建按ID隔离的提案状态|一个恶意guardian提案不会阻塞其他人的有效阈值。|
|`contracts/SmartAccount.sol:365`|记录该提案内这个guardian已经投票|重复调用不是重复票；策略epoch变化会使旧提案失效。|
|`contracts/SmartAccount.sol:393`|完成恢复同时检查当前阈值与等待期|票数不能从旧guardian策略或另一个提案挪用。|

## E. Execution Trace
`testRevocationBetweenValidationAndExecution`中：先授权session；构造nonce n的owner撤销操作与n+1的session操作；EntryPoint先验证二者；n执行递增epoch；n+1执行发现Permit epoch陈旧而回滚；Counter不增加。注意nonce和费用可以被EntryPoint消费。查真实命令及日志目录evidence，而不是把本段文字当运行证据。

## F. Test Explanation
Account.t.sol中的回放/跨链/阈值/恢复/原子性/会话测试通过真正的EntryPoint.handleOps。少量fixture使用prank设置调用身份，不能替代这些集成路径。Stateful.t.sol用独立模型检查随机序列，涵盖成功路径与错误授权，而不是只允许所有调用revert的空洞不变量。

## G. Security Reasoning
信任固定EntryPoint代码是前提。Permit epoch不为0且每个payload唯一，session还重新检查余额与时间。普通call意味着目标可以回调，但入口身份、执行锁、onlySelf和恢复锁形成多层约束。允许的目标若是可升级router或token approve，仍能产生超出native ETH预算的经济后果，因此必须审查目标语义。

## H. Practical Exercise
1. 写出两个session操作各花0.7 ETH、总预算1 ETH时，验证阶段和执行阶段的不同结果。
2. 给session增加独立版本，保持恢复后所有旧session失效；先写失败测试再改代码。
3. 构造两个并行guardian提案，让合法提案在最新指针被恶意提案覆盖后仍按ID完成。
4. 用key=42的nonce执行一次操作，并解释为何key=0不递增。

## I. Interview Questions
为什么不能只保存lastSigner？为什么owner也不直接调用execute？validateUserOp为什么不能只检查一次session预算？为什么失败批量操作仍可能消耗nonce？取消单个恢复提案与取消全部提案的失效范围有何区别？每个回答必须指向上述实际源码及一个测试。
