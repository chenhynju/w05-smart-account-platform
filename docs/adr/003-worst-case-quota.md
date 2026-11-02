# ADR 003 — Worst-case Paymaster reservation

Status: Accepted for local implementation.

Why / Decision：在validation按maxCost预留wei预算，空context避免postOp。

Alternatives：只扣成功费用；postOp按实际成本退款。

Trade-offs：最坏损失有上限且失败也计费；quota保守消耗，用户体验/预算公平性较弱。

Risks：不是实际费用账单；共享状态与epoch需独立ERC-7562/stake兼容审查。

Evidence：对应实际源码、需求追踪、回归测试和evidence日志。不是仅凭本ADR存在即验收通过。
