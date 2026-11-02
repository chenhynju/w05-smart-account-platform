# 项目面试答辩与动手验收

## 业务与协议
1. 用一次浏览器操作解释owner、account、bundler、EntryPoint、Paymaster和target六种角色，各自付什么费用、拥有什么权限。
2. 为什么Account Abstraction不等于Passkey登录？用户登录成功能否跳过链上验证？
3. 解释v0.8的packed gas字段、EIP-712域和keyed nonce。给出真实SDK与EntryPoint差分测试。
4. 哪些本地API支持ERC-4337 JSON-RPC？为什么有viem互操作仍不能宣称完整bundler认证？

## 合约与安全
5. 画出全部验证、然后依次执行的流程，复现同bundle撤销session的攻击条件与防护。
6. owner签名、session签名、passkey断言如何编码，哪一层最终决定权限？
7. 多签为什么按地址严格排序？给出重复同一个owner的真实失败测试。
8. 为什么批量目标状态回滚而nonce、Gas和赞助quota可能保留？指明真实UserOperationEvent。
9. session允许ERC20.approve时native ETH限额能否限制最终Token损失？如何重新设计资产级限制？
10. 解释曾真实发现的guardian提案槽DoS。为什么按ID并行提案比仅允许覆盖最新提案更可靠？
11. 通过函数与callback测试说明_reentrancy-eth告警为什么不能直接当作已确认漏洞，也不能直接忽略。
12. 改owner/guardian/passkey/session时，全局epoch有什么安全收益和可用性代价？

## 密码学与基础设施
13. 解释P256签名的消息构造、RP ID hash、origin、UP/UV、DER整数与low-s。哪些步骤OZ有意省略？
14. 设备attestation=none意味着什么？虚拟CTAP2浏览器测试证明了什么、没有证明什么？
15. sponsor签名怎样避免循环依赖？为何要绑定paymaster gas上限？
16. 一个失败操作如何耗尽错误设计的Paymaster？项目为什么在validation保留最坏成本？
17. HTTP超时后，重新签一个不同bundler交易有什么风险？为什么要先保存raw bytes与hash再广播？
18. 本地文件fsync与复制数据库/链重组恢复有什么区别？RPC失联与确定签名失败应怎样区分？

## 工程证据
19. 解释固定源码Commit、编译器checksum、artifact SHA、创建交易input和runtime codehash之间的关系。
20. 为什么官方已知编译器缺陷使0.8.31日志不能继续充当最终验收？为什么还检测到了陈旧EntryPoint artifact？
21. invariant如何避免所有调用都revert也“通过”？给出正面成功计数与独立状态模型。
22. 哪三个测试突变被杀死？为什么它们不属于真实审计Finding？
23. GitHub workflow存在，能否说CI已通过？本地Anvil交易能否说测试网已部署？

## 学习者实际验收
以下初始状态全部NOT RUN，必须由学习者实际回答/编码后才能更新，不得由代理自行宣称掌握。

|任务|验收方式|状态|
|---|---|---|
|讲解完整交易生命周期|不用文档画图并说明每个nonce与失败状态|NOT RUN|
|独立复现同bundle撤销测试|改写一个失败断言并定位源行|NOT RUN|
|增加独立session子策略版本|先写负面测试，再实现并检查恢复失效|NOT RUN|
|用SDK配置三guardian两票恢复|创建竞争提案并按ID完成合法提案|NOT RUN|
|解释P256断言并复现错误RP/origin|从浏览器真实断言追到合约失败|NOT RUN|
|独立恢复本地状态和服务|核对nonce/receipt，证明没有重复业务执行|NOT RUN|
|审查一次合约变更|写出威胁、测试、残余风险与部署门禁|NOT RUN|
