# 网络身份、发布门禁与费用预算

源码冻结Commit `fcc439f8167b7573269f1ce5a17058071e10a0a7`，根路径`/home/chenhy/workspace/web3-portfolio/smart-account-platform`。公共执行NOT RUN，材料不等于用户已经掌握。

## A. Business Principle
同一账户签名不能跨链使用；测试链资产也有公开交易和权限后果。准备计划、批准、签名、广播、确认、业务验证分别是不同状态。

## B. Architecture
网络白名单→服务manifest→SDK typed-data域→注入钱包链→EP链；所有边界必须一致。local与Sepolia runtime、构建目录、浏览器会话密钥隔离。公共service签名默认关闭；public release默认prepare。

## C. Source Implementation
network.ts定义允许链/endpoint/预算；protocol.ts把域传给viem；bundler.ts使用实际网络和持久预算；providers/page使用构建网络并检查服务配置；sepolia-release.ts从冻结artifact生成未签名计划。next-env.d.ts是Next自动生成的ambient declaration，不是手写产品代码。

## D. Line-by-Line Walkthrough
|源码行|语句效果与边界|
|---|---|
|`packages/network.ts:3`|只接受31337/11155111，返回受支持链；主网明确失败。|
|`packages/network.ts:8`|本地RPC固定、公共HTTPS，身份参数不隐式回退。|
|`packages/network.ts:27`|单位gas×wei/gas，按最大费率累加预留wei；序列化仍精确，不能用Number。|
|`packages/protocol.ts:158`|chainId作为签名域输入，使用实际服务manifest；默认值只保留本地调用兼容。|
|`packages/protocol.ts:170`|注入钱包签EIP712同一域，不能只改显示网络。|
|`services/bundler.ts:46`|公共服务在读私钥/RPC前检查授权门禁，再读取独立runtime。|
|`services/bundler.ts:136`|持久化最坏gas预留后返回固定费用上限；local不占公共预算。|
|`services/bundler.ts:387`|已经保存hash的重播复用相同raw bytes；新交易先模拟再占预算，签名前保存身份。|
|`apps/web/app/page.tsx:79`|构建期链和服务链不一致就阻止加载，不让用户在错误域签名。|
|`scripts/sepolia-release.ts:36`|只接受prepare或broadcast；拼写错误和冲突标志拒绝。|
|`scripts/sepolia-release.ts:48`|生成独立key并检查0600；比较本地公开地址拒绝密钥复用，不输出key。|
|`scripts/sepolia-release.ts:101`|源摘要完整门禁与干净源码先绑定到commit，再确定RPC/nonce。|
|`scripts/sepolia-release.ts:183`|每个合约固定constructor、gas上界；creationCode由核验artifact编码。|
|`scripts/sepolia-release.ts:219`|求和value+gas×maxFee，含0.5ETH存款；这是保守上界，不是实际费用。|
|`scripts/sepolia-release.ts:246`|写公开未签名计划后退出，绝不执行后面的signTransaction。|
|`scripts/sepolia-release.ts:262`|再次逐字段比较源码/bytecode/nonce/地址/value/data/gas/费率，变化必须重审。|
|`scripts/sepolia-release.ts:303`|只有明确授权分支才可能签名；先flush签名原文/hash，后广播。此分支公共执行NOT RUN。|
|`scripts/sepolia-release.ts:312`|每笔两确认/成功收据，否则停止并保留日志；不把RPC接受当部署成功。|

## E. Execution Trace
prepare→核对sourceHash→RPC只读chain/nonce/balance/baseFee→预测CREATE地址→编码4个constructor与deposit→计算0.5352测试ETH部署/存款上界→写unsigned plan→退出。获得对应授权、资金与RPC能力后才可broadcast：复核计划→准备交易→签名→flush raw/hash→广播→查两确认收据→运行时hash→进一步构造/权限/业务验证。日志若只有DEPLOYED_VERIFY_REQUIRED还不能PASS Engineering Gate。

服务费用另有0.5测试ETH最坏gas预留上界，含部署/存款合计保守gross1.0352；不扣回款，保守但可能较早耗尽。比如bundle10Mgas×2gwei=0.02ETH，25次恰为0.5；factory/quota会占一部分，所以实际允许bundle更少。失败预留不退，换取未知广播状态下的预算安全。

## F. Test Explanation
network.test.ts检查主网/错误RPC/明文公共RPC拒绝、同一UserOp不同链hash、25次预算序列化后到边界及第一个超支拒绝。公共profile构建只证明可编译；unauthorized guard日志只证明门禁拒绝，不证明公共广播分支成功。实际公共交易仍NOT RUN。完整本地API/浏览器需要用最终新构建重跑。

## G. Security Reasoning
不把环境变量当用户授权证据：它只是实现门禁。真实授权仍必须由用户明确给出且匹配具体计划。RPC可能伪造nonce/余额、限流或不支持trace；只读预检不是信任证明。签名原文也应保密到预定发布，避免提前传播。公开网络不可evm_increaseTime，真实恢复等待不能伪造。删除store可破坏预算边界，因此操作手册禁止删store重置。

## H. Practical Exercise
在未广播条件下比较chain31337与11155111的typed-data；把RPC chain故意改错，解释每个拒绝点；计算不同gas上界对应wei预算；把计划中的value或nonce改动，预测重审门禁。不得为练习向公共网络发交易。

## I. Interview Questions
为什么chainId显示正确仍可能签错域？为什么两份相同私钥存在不同文件仍不是身份隔离？为什么RPC timeout后不能新nonce重复部署？为什么最坏预留和实际gas费用不同？为什么“有地址”仍不等于部署/业务验收成功？为何mainnet应明确拒绝而不是默认配置回退？

## 只读公共验证器补充
`scripts/verify-sepolia.ts:31`只读公开deployment与未签名计划，不读key。`scripts/verify-sepolia.ts:65`固定4个constructor输入。每笔回读from、chain、nonce、value、data、gas与费用上界，核对两确认收据；creation calldata必须由固定artifact独立重编码。然后核对runtime hash、EP地址、Paymaster owner/sponsor与deposit。公共部署尚不存在，因此未运行该实际链上验证；编译通过不能当作验证PASS。业务E2E、浏览器源码公开验证仍另验收。

## F-03 · 时间权限必须以执行链为准
`packages/network.ts:42`先做bigint加3600、非负/uint48上界检查，再安全转number（2^48小于2^53精确整数界）。`apps/web/app/page.tsx:340`先生成待授权key，向实际网络RPC读取pending区块；validUntil来自该区块，不能来自Date.now。`apps/web/app/page.tsx:361`只在ownerAction获得真实成功事件后保存key，避免失败时显示未激活凭据。

原始公开操作证明validUntil1793653151小于执行区块1793822353；外层EP receipt成功而UserOperation执行失败。F-03是前端时间来源错误，合约正确拒绝过期策略。测试先把同一持久本地链再推进两天，再用真实浏览器创建session，捕获公开请求并检查有效期距实际区块在0到3600秒；不重置链掩盖问题。链上时间、电脑时间和HTTP challenge过期时间分别服务不同信任域。

练习：把电脑时间提前一个月，旧代码会给出怎样的实际session期限？若RPC请求慢两分钟，新代码的剩余期限为何只会缩短？如何用失败UserOperation事件区分签名验证失败、执行回滚和交易尚未确认？哪些证据能证明本地key在策略失败后没有被标为激活？用户本人完成练习仍NOT RUN。

## F-04 · latest与pending也是不同时间域
latest表示最近已挖出的块；空闲按需链不出块时它不等于下一块验证时间。真实捕获两者相差1204秒，latest+300券已过期。service.addSponsorship现在请求getBlock({blockTag:"pending"})，给将要验证的时间加300秒。集成用例用本地evm_setNextBlockTimestamp把pending推进600秒但不挖块，验证新签券的精确until并执行真实simulate；这不是通过提前挖块绕过缺陷。公共provider不支持pending语义时应BLOCKED，不返回虚假成功。

## 同长度反例与变异测试
第一轮删除prefix内容比较的mutant存活，原因是旧evil.test origin比localhost短，前置长度检查先拒绝了它。新增evilhostx:3155与localhost:3155长度完全一致的、P256签名有效的反例，同一mutant才被杀死。wrong-RP用例也重签authenticatorData，避免“只是签名被破坏”的伪反例。测试失败必须由欲证明的安全检查造成，不能由不相关格式或长度拒绝代替。
