# ADR 007 — Security-reviewed compiler pin

Status: Accepted for local implementation.

Why / Decision：最终采用SHA256固定的0.8.38，Cancun、viaIR、optimizer200；强制全部artifact预检。

Alternatives：沿用已安装0.8.31；凭单个编译日志推断全部artifact正确。

Trade-offs：避开已知优化器风险并可复现；需要更新所有实际部署代码和旧证据边界。

Risks：旧artifact缓存可混入升级流程，部署前必须逐个版本/设置核对。

Evidence：对应实际源码、需求追踪、回归测试和evidence日志。不是仅凭本ADR存在即验收通过。
