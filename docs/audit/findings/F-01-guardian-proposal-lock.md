# F-01 · 单guardian可占用恢复提案槽，阻塞其余合法阈值

Severity：**Medium**。Status：**FIXED / regression verified locally**。分类：恢复可用性/权限状态机。该Finding来自实际初始实现，不是人为插入的生产缺陷。

## Impact / Preconditions
配置多个guardian且阈值大于1，owner暂不可用或丢失。一个恶意或不合作guardian先提出任意替代owner的提案。原实现只允许一个全局recoveryId，后续proposeRecovery因已有提案而拒绝。其余仍足够达到阈值的guardian无法创建自己的合法提案；只有现有owner能取消，而恢复场景恰恰可能没有owner可用。

## Root cause / affected code
初始源码Commit `799656021bedef7e3c55c025009537e9dc792e38` 的SmartAccount.proposeRecovery把 `recoveryId != 0` 作为拒绝条件。提案显示指针被错误地当成唯一协议状态。

## Local PoC and actual evidence
在初始源码增加回归用例testGuardianCannotLockRecoverySlot：设3位不同guardian、阈值2；guardian0先提恶意候选；guardian1再提合法候选。第二次调用实际报 `Unauthorized()`，测试FAIL。完整trace保留在 `evidence/recovery-poc-before.txt`。该日志基于当时0.8.31编译器；没有公共网络利用或真实资产损失。

核心复现步骤（在独立副本，绝不回退正在运行的工程）：

```solidity
// 先通过合法owner UserOperation配置3个排序guardian、阈值2。
vm.prank(list[0]); account.proposeRecovery(attackerCandidate);
vm.prank(list[1]); account.proposeRecovery(legitimateCandidate);
// 初始实现第二次调用Unauthorized；修复实现应允许并行提案。
```

复现命令的测试形态：`forge test --match-test testGuardianCannotLockRecoverySlot -vvv`。完整历史源码在Git历史；PoC是在冻结初始合约上新增测试，不宣称该新增测试本来就存在于7996560。修复后的当前同名用例还验证另一个恶意提案覆盖“最新显示指针”后，合法提案仍可按ID完成。

## Fix
引入每个ID的Recovery结构与独立投票映射；每个提案绑定当前epoch、候选owner、等待时间和active状态。propose不再占单一槽。approve/complete/cancel提供明确ID方法；无参方法仅为最新提案的客户端便利入口。setOwners/setGuardians/恢复完成后epoch失效所有旧提案。

## Regression / Fix review
修复进入 `05ca72d03373ada3c0ca40f45e6ea52f3cecec81`。最终复审源码包含于 `4310b67aa4e1b1cee10dbeb82bece4910ad8ca7b`。证据：evidence/forge-recovery-fixed.txt、forge-solc038.txt、check-final.txt。相关回归还覆盖重复票、延迟、非guardian、旧guardian策略、单提案取消、callback期间禁止完成恢复。最终编译器已升级0.8.38。

## Residual risk
guardian达到阈值即可在等待后替换owner，这是显式信任能力；owner必须监控恢复事件并及时取消可疑提案。UI主要显示最新提案，复杂场景应使用SDK的ID方法和事件索引。提案可被guardian付费重复创建，不构成任意公众无成本存储写入，但生产监控仍需处理告警噪声。
