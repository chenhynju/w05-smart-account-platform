# Static analysis triage — AI-assisted self-assessment

当前合约源码与1016f4c冻结版本一致。Slither新一轮success=true，102 detectors，原始结果共26项，见evidence/slither-release.json/.txt及紧凑summary。历史25项结果保留。扫描完成不等于“零告警”；下表为逐类别人工复审记录。没有把高风险自动告警直接说成已确认利用，也没有用覆盖率替代解释。

|Detector|数量 / 最高工具严重度|复审及证据边界|
|---|---|---|
|assembly|1 / Informational|仅在已检查data.length>=4后读取selector，标记memory-safe。没有任意slot写入或delegatecall。OZ密码学内部assembly属于固定依赖范围。|
|cache-array-length|3 / Optimization|有界管理循环的gas建议。当前上限10且无外部调用，非未修复High/Medium安全Finding。|
|calls-loop|1 / Low|批量调用是功能本身。验证限定1..16个动作；逐项检查结果并在失败时整体revert。callGasLimit限制执行gas；目标升级/经济语义仍需单独审查。|
|costly-loop|2 / Informational|owner/guardian列表最多10，管理操作循环有界；性能优化不是已确认资产漏洞。|
|locked-ether|1 / Medium|Counter是专门接收mock native value来测试预算的非生产目标，没有withdraw，属于明确接受的测试资金沉淀行为。默认GUI和公共验收value均0；不得向该目标发送有价值资产。它不使SmartAccount资金自动锁定，账户执行目标及value仍需审查。|
|low-level-calls|1 / Informational|普通call是钱包执行机制；检查bool并传播失败，禁止delegatecall。调用目标可改变自己的语义，native限额不自动限制token授权。|
|reentrancy-eth|1 / High|手工复审：executeOperation先核对固定EntryPoint与_executing，外部调用前置锁/消费Permit/扣session预算；completeRecovery同样检查执行锁。真实CallbackTarget回归不能重入执行或完成成熟恢复。此结论依赖固定EntryPoint可信，并非任意未知target经济语义安全证明。|
|reentrancy-events|1 / Low|Executed只在完整成功批量后发出；执行锁阻止递归执行，事件不是权限来源。receipt按对应EntryPoint userOp事件确认。|
|timestamp|3 / Low|session有效期及两天恢复delay有意用时间；validation返回时间范围交EntryPoint检查。时间戳不是随机数；边界按秒并允许链时间约束。|
|too-many-digits|1 / Informational|Factory嵌入creationCode用于CREATE2预测；长字面值来自完整合约字节码，不是错误手输的资产单位。|
|uninitialized-local|8 / Medium|Solidity值类型默认0；n/e/actions只在成功decode后使用，否则catch返回1；owner/passkey不使用session signer。所有分支需结合实际源码判断，不能把整个类别无条件屏蔽。|
|unused-return|3 / Medium|ECDSA.tryRecover的第三返回值是诊断errorArg；代码检查RecoverError并检查恢复地址。测试中的提案ID忽略不赋予额外权限。|

真实确认的Finding分别为F-01恢复提案槽DoS、F-02 WebAuthn JSON模板错误、F-03前端session时钟来源错误。工具建议不自动等同真实Finding；没有独立第三方审计认证。

## 当前跨层修复复核
F-02的限定前缀比较循环长度受已配置origin最多200字节和固定challenge/type所限；完整JSON仍由P256摘要覆盖，后缀不作为授权字段。新增原始浏览器扩展断言与错误分隔符/错误origin等有效签名反例，避免用格式错误签名掩盖上下文检查缺失。F-03使UI时间来源与上述timestamp策略一致，不改合约时间边界。

公共profile人工复核：拒绝主网和隐式网络回退；构建/服务/签名域一致；独立密钥、runtime与浏览器会话；未批准时在读key/RPC前拒绝公共服务与部署广播；public不走Anvil funding；服务gas按固定上界签名前持久预留，重启不退款；plan逐字段比较constructor calldata/value/nonce/gas/费用与artifact；未知广播状态保留签名原文/hash并停止，不重复签新交易。只读验证器不创建wallet、不读key、不签名。公共广播分支和公共业务仍NOT RUN，故不能以人工复核替代测试网实证。

Gitleaks原始2条新增告警为条件表达式中的sessionStorage命名常量，逐条核对非凭据；仅允许具体历史指纹，未整体排除任何代码目录。具体见gitleaks-namespace-false-positive.md。公共发布与生产CSP、物理认证器、多浏览器、多人托管仍需单独验收。

## Aderyn 独立复核（2026-11-10 重跑，aderyn 0.6.8）

第三方复核在冻结源码上重跑 Aderyn：3 High / 0 Medium / 5 Low。逐条分诊如下，未静默屏蔽任何规则。

|Finding|位置|复审结论|
|---|---|---|
|H-1 abi.encodePacked hash collision|contracts/AccountFactory.sol:17|误报。碰撞面要求两个及以上可变长参数；此处第一参数 creationCode 之后拼接的是 abi.encode(entryPoint,owner,guardian)，长度恒为 96 字节并固定在尾部，编码可唯一解码，不存在两条不同输入产生相同 digest 的路径。与 OpenZeppelin Create2.computeAddress 的惯例构造一致。保留告警不屏蔽。|
|H-2 locks Ether without withdraw|contracts/Counter.sol|与 Slither locked-ether 同一目标：Counter 是接收 mock native value 的非生产测试目标，默认执行 value 为 0，属明确接受的测试资金沉淀；SmartAccount 本身资金不受此影响。|
|H-3 reentrancy state change after external call|contracts/SmartAccount.sol executeOperation|与 Slither reentrancy-eth 同一族群：外部调用前已置 _executing 锁、消费一次性 Permit、扣减 session 预算；结论依赖固定 EntryPoint 可信，非任意 target 的经济语义证明。|

Low 项（centralization、loop 内 require、字面量、变量遮蔽等）与上表 Slither 对应类别结论一致：自托管钱包的 owners/guardians 管理权限是设计本身，循环均有界。
