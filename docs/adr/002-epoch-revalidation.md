# ADR 002 — Calldata Permit and global epoch

Status: Accepted for local implementation.

Why / Decision：验证结果按完整calldata保存，执行时重查epoch/session。

Alternatives：仅验证一次；保存单个lastSigner；独立子策略版本。

Trade-offs：简单保守、同bundle撤销安全；代价是改一种策略也可能使其他session/passkey失效。

Risks：未来优化独立版本必须重新证明恢复全面失效和批次预算约束。

Evidence：对应实际源码、需求追踪、回归测试和evidence日志。不是仅凭本ADR存在即验收通过。
