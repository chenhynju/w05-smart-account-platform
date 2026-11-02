# F-03 · Session有效期使用电脑时间导致链上过期授权

Severity: Low (availability / intended lifetime mismatch). Status: FIXED / final browser regression PASS. Self-Assessment / AI-Assisted Review.

## Impact / prerequisites / root cause
链时间与电脑时间相差较大（实际在本地恢复测试推进两天后），enableSession用Date.now()+3600生成一小时有效期，但合约按block.timestamp校验。真实新session配置操作验证签名成功、被EP包含，但执行回滚。用户电脑时间若超前，也会使“1小时”实际期限超出预期。合约没有越权；缺陷在前端选择错误时钟。

## Executable PoC / actual evidence
冻结失败源5e5c219。完整浏览器已通过开户、owner、批量成功和回滚，随后Create session key失败。evidence/browser-session-clock-before.log、截图及JSON（原browser-release归档）。evidence/session-clock-before.json保存完整公开操作、签名与解码setSession，未保存私钥：validUntil1793653151，真实执行区块timestamp1793822353，已过期169202秒。外层receipt成功不代表UserOperation执行成功；service正确报告execution_failed，UI错误提示未确认策略而未假报成功。

## Fix
读取当前实际网络pending区块timestamp，按chainTimestamp+3600计算uint48；负数和uint48溢出明确拒绝。不使用Date.now。只在ownerAction的真实成功事件确认后持久化本地session key，防止失败后展示未授权key为已启用。

## Regression / review / residual risk
network.test.ts覆盖两天时钟差、精确1小时、uint48最大边界与越界拒绝。真正回归必须在当前已推进两天的同一链重跑完整浏览器，并核对session策略的实际链上有效期，不重置链来掩盖问题。交易延迟仍会缩短剩余可用时间；需要重试时重新读取区块生成新签名。客户端读取的RPC是信任边界，服务和合约仍实施最终权限/有效期校验。公共网络恢复等待无法时间快进。

最终回归：browser-release/evidence.json共16检查点，session-clock-after.json精确剩余期限；service-integration-release.txt共11 PASS，pending-clock-sponsorship.json实际模拟PASS。
