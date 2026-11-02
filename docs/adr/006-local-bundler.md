# ADR 006 — Local allowlisted integration boundary

Status: Accepted for local implementation.

Why / Decision：使用真实上游EntryPoint与本地服务模拟/提交/对账；所有端点loopback。

Alternatives：直接把SDK调用称为完整公共bundler；未经授权部署测试网。

Trade-offs：能独立验证协议/失败/资金边界，保留公共部署授权门禁。

Risks：完整公共mempool/替换/聚合/公开SaaS安全和测试网端到端仍未完成，不删除原需求。

Evidence：对应实际源码、需求追踪、回归测试和evidence日志。不是仅凭本ADR存在即验收通过。
