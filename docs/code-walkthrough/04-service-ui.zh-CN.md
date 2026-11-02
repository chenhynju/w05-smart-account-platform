# 基础设施服务与真实客户端

Commit `fcc439f8167b7573269f1ce5a17058071e10a0a7`。实际文件 `/home/chenhy/workspace/web3-portfolio/smart-account-platform/services/bundler.ts`、`/home/chenhy/workspace/web3-portfolio/smart-account-platform/apps/web/app/page.tsx`；Next代理为apps/web/app/api/[...path]/route.ts。

## A. Business Principle
服务承担Gas与操作转发，但不能代替owner同意交易。UI把链上实际结果解释给用户，不能让“已提交”看起来像“已执行”。

## B. Architecture
allowlisted本地服务 → 完整handleOps模拟 → 单发送者队列 → 签名交易write-ahead状态 → 广播 → 事件对账。Next只转发固定路径到固定loopback服务，并限制Origin和流式body。不是通用RPC代理、生产API网关或公网SaaS认证系统。

## C. Source Implementation
|真实源码行|语句与作用|为什么及失败边界|
|---|---|---|
|`services/bundler.ts:57`|只读取本地部署公开清单，验证chain/RPC约束|不能由请求参数任意指定RPC或EntryPoint。|
|`services/bundler.ts:83`|启动时核对已部署依赖的runtime codehash|防止把UI接到其他同链地址或被替换的本地合约。|
|`services/bundler.ts:93`|服务状态按EntryPoint地址隔离|新版本本地栈不会混用旧EntryPoint的nonce和幂等记录。|
|`services/bundler.ts:118`|写临时文件、fsync内容、rename、fsync目录|在广播前先持久保存签好的外层交易及确定hash；仍不是复制数据库或独立灾备。|
|`services/bundler.ts:153`|把交易发送者相关工作串行化|防同一bundler EOA nonce并发碰撞，失败不会永久毒化队列。|
|`services/bundler.ts:185`|流式读取并限制131072字节，再解析JSON|先限制大小再做schema校验，避免无界内存消耗。|
|`services/bundler.ts:193`|仅处理本服务登记的账户|链上签名仍是交易授权，登记不是owner权限替代。|
|`services/bundler.ts:197`|从真实EntryPoint获取nonce，从账户获取epoch|不使用客户端任意声明的当前nonce/策略。|
|`services/bundler.ts:219`|链上读quotaEpoch和区块时间，签版本化赞助摘要|sponsor私钥只在服务端0600文件中，不通过API发给浏览器。|
|`services/bundler.ts:249`|完整eth_call、gas估算及debug_traceCall|handleOps外层不revert并不代表内部操作成功。|
|`services/bundler.ts:295`|遍历trace中对应userOpHash的UserOperationEvent|缺少事件就失败关闭，不能把没有证据解释成成功。|
|`services/bundler.ts:331`|查真实receipt或按hash查EntryPoint事件|服务文件是索引，链上nonce/事件才是事实来源。|
|`services/bundler.ts:387`|先模拟，再序列化交易，保存原始签名交易和hash，最后广播|超时后只能重发完全相同raw bytes，不重新签一个不明nonce的交易。|
|`services/bundler.ts:424`|本地bundler签外层交易|它与用户账户签名是不同的签名、nonce与付费主体。|
|`services/bundler.ts:446`|验证ERC-4337 JSON-RPC hex quantity并转packed结构|拒绝不支持EntryPoint和错误字段；不宣称处理所有替换/聚合/7702规则。|
|`services/bundler.ts:505`|按userOp事件返回标准子集receipt格式|把实际gas、nonce、success和外层receipt交给viem客户端。|
|`services/bundler.ts:924`|区分provider传输失败503与请求/验证失败400|超时不是签名无效；不能让客户端误判为确定拒绝。|
|`services/bundler.ts:947`|仅监听127.0.0.1，成功监听后才写PID|启动失败的重复进程不覆盖实际运行服务PID。|

## D. UI与重要执行语句
|真实源码行|语句与作用|为什么及失败边界|
|---|---|---|
|`apps/web/app/page.tsx:107`|本地测试key和account写sessionStorage|仅当前tab的测试保管，不适合真实资产或独立多方托管。|
|`apps/web/app/page.tsx:150`|先签服务挑战，才请求部署owner绑定的账户|一次性challenge、chain和factory一起绑定，不能重放开户证明。|
|`apps/web/app/page.tsx:185`|获取真实nonce/epoch/赞助后保留供检查的Draft|签名之前展示完整payload与操作hash。|
|`apps/web/app/page.tsx:199`|分别走EOA、注入钱包、session或WebAuthn授权|多签按恢复地址排序；不能按点击次数计算票数。|
|`apps/web/app/page.tsx:255`|提交后区分succeeded、execution_failed与仍待确认|HTTP200和外层交易success都不是业务成功。|
|`apps/web/app/page.tsx:277`|只有实际成功receipt才把策略操作当完成|未知/失败状态不能激活credential元数据。|
|`apps/web/app/page.tsx:292`|支持Counter调用、原子批量和自定义动作JSON|自定义JSON仍经过服务schema、合约权限与真实模拟。|
|`apps/web/app/page.tsx:340`|先保留新测试key，再签限制target/selector/time/native value的链上策略|先保存key避免已上链却丢失签名者；是否激活仍看链上结果。|
|`apps/web/app/page.tsx:363`|生成第二个不同签名者并设置2-of-2策略|同一个tab管理两把测试key，不代表两位独立人类托管。|
|`apps/web/app/page.tsx:379`|注册认证器后，由现有owner正式登记公开key|注册成功与账户配置成功分别验收。|
|`apps/web/app/page.tsx:391`|guardian以自己的EOA发起受延迟的恢复提案|当前UI展示最新提案；并行提案的ID方法在SDK/API可用，不能把最新指针当唯一权威。|
|`apps/web/app/page.tsx:433`|导航按钮有稳定可访问名称|装饰图标不能污染读屏或浏览器测试的按钮名字。|

服务save的fsync必须在广播之前完成；交易hash取已签序列化字节的keccak，不依赖RPC成功返回。重试可以广播同一raw transaction，但不能为了“重试成功”自动用一个新nonce签新操作。

## E. Execution Trace
断开HTTP响应的集成测试提交一个+4操作，客户端中断后按userOpHash查询记录，再次提交相同操作，只增加一次Counter。这个证据覆盖客户端响应丢失与幂等；不等于所有RPC节点崩溃、磁盘损坏或链重组都已验证。服务重启与链状态恢复另有实际运行证据才可标PASS。

## F. Test Explanation
API测试检查挑战重放、签名篡改、预算、真实成功/失败、标准JSON-RPC客户端、CSRF和管理RPC拒绝。浏览器测试覆盖owner、session、撤销、passkey、guardian取消、缺少多签票和双签成功；不是只打开页面截图。

## G. Security Reasoning
loopback绑定、Origin允许列表、body上限、有限开户/总赞助预算、输入schema与链上签名共同防护。Origin能被同机恶意程序伪造，不能当作互联网身份认证。可信RPC可以审查/延迟/撒谎，当前本地节点属于测试信任边界。生产多租户、远程认证、HSM、公共RPC高可用与完整mempool规则均需额外工程与验收，不能把本服务称为已上线公共bundler。

## H. Practical Exercise
在操作提交后关闭浏览器，再根据hash确认链上结果。停止服务验证UI显示失败，再启动并恢复。解释“write-ahead记录不存在”和“有已签交易但尚未查到receipt”为什么应该采用不同恢复策略。用自定义calls配置3个guardian与2票阈值，说明界面最新指针与ID方法的不同用途。

## I. Interview Questions
为什么模拟不修改正式状态却能预测批量revert？哪一个nonce属于bundler，哪一个属于SmartAccount？为什么hash必须在广播前确定？服务数据库丢失后，链上nonce为何仍阻止重复执行？React状态更新不等于链上确认，有哪些UI状态必须分开？
