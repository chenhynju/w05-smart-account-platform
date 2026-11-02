# F-04 · 空闲链的陈旧链头使新赞助券立即过期

Severity: Low (availability). Status: PATCHED / integration regression pending. Self-Assessment / AI-Assisted Review.

## Impact / root cause / preconditions
addSponsorship按getBlock(latest).timestamp+300生成Paymaster validUntil。Anvil按需出块，长时间空闲后latest不前进，但pending以及下一次实际验证的区块时间已经前进。结果新生成的操作在estimateGas/EntryPoint验证时已过期，AA32。仅重试不能修复此问题；不能通过重置或额外挖块来掩盖。正常每12秒出块的网络不常触发，但非出块期或provider stale-head也必须明确处理。

## Actual evidence / local PoC
evidence/service-integration-stale-head-before.txt：实际API10中5项失败，真实AA32 paymaster expired or not due。只读RPC捕获latest.timestamp=0x6aeb8e91，pending.timestamp=0x6aeb9345，相差1204秒，超过300秒券有效期。新增稳定集成用例在不挖块时将下一pending时间设为当前pending+600，检查签出的validUntil必须等于目标+300，随后真实simulate。对旧运行服务的完整失败重现evidence/pending-clock-before.txt保留。

## Fix / regression
赞助与前端session策略都读取pending区块时间，指向将实施验证的时间域。服务仍由合约与EP最终校验有效期，不放宽300秒，不使用电脑时间补偿，也不自动挖块修复。集成用例只用本地管理RPC构造条件；公共provider须支持相应只读语义，否则BLOCKED。预计API11项全通过才可闭环，不能以单元测试代替真实模拟。

## Residual risk
pending区块的具体构造是provider能力和信任边界；交易等待超过300秒仍应正常过期，需要重新请求赞助并重新签用户操作。不能对已签操作直接修改期限。客户端/服务签名、模拟、广播和receipt仍需分别确认。
