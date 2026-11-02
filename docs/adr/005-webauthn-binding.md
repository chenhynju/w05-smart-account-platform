# ADR 005 — Strict WebAuthn context

Status: Accepted for local implementation.

Why / Decision：链上强制RP hash、完整预期JSON、UP/UV、当前epoch与P256。

Alternatives：只调用OZ默认verify而不补RP/origin；宽松自写JSON解析。

Trade-offs：明确绑定安全上下文，但严格JSON会拒绝部分浏览器额外字段。

Risks：虚拟CTAP2不证明真实设备/生物识别，需要物理与多浏览器验收。

Evidence：对应实际源码、需求追踪、回归测试和evidence日志。不是仅凭本ADR存在即验收通过。
