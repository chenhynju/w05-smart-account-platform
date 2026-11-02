# ADR 001 — Immutable account and EntryPoint

Status: Accepted for local implementation.

Why / Decision：采用非代理账户与固定EntryPoint。

Alternatives：可升级代理、模块化任意delegatecall账户。

Trade-offs：减少管理员/存储布局/升级攻击面，但漏洞修复需迁移而非原地升级。

Risks：固定EntryPoint必须由部署清单和codehash确认；迁移不能悄悄丢失旧账户/存款。

Evidence：对应实际源码、需求追踪、回归测试和evidence日志。不是仅凭本ADR存在即验收通过。
