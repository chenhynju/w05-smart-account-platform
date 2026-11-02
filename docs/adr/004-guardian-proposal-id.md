# ADR 004 — Independent guardian proposals

Status: Accepted for local implementation.

Why / Decision：恢复提案按ID独立存储与投票，最新指针只为UI便利。

Alternatives：全局唯一提案槽；让任意guardian覆盖并抹掉其他人的票。

Trade-offs：保留合法阈值的恢复可用性；需客户端事件索引/ID交互。

Risks：达到阈值的guardian本来就能延迟换owner，owner需监控和取消可疑提案。

Evidence：对应实际源码、需求追踪、回归测试和evidence日志。不是仅凭本ADR存在即验收通过。
