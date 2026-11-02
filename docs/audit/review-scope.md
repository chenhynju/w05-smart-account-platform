# Review scope and trust assumptions

冻结源码参考 `4310b67aa4e1b1cee10dbeb82bece4910ad8ca7b`；最终部署清单的sourceCommit与实际创建交易另行核对。Self-Assessment / AI-Assisted Review，不是独立第三方审计。

In scope：4个自写合约、protocol与passkey SDK、Node本地服务、Next固定代理与UI、本地部署/验证脚本、真实测试及关键配置。Counter仅为验收目标。第三方固定源代码作为信任依赖解释与集成验证，不宣称完成了对整个上游EntryPoint/OZ的新独立审计。

Trusted roles：固定EntryPoint；达到阈值的owners；满足延迟的guardian阈值；Paymaster owner和sponsor对其预算的控制；本地OS/Anvil/RPC操作员。单个低于阈值guardian视为可能恶意。RPC节点可撒谎或不可用；本地验证不提供轻客户端或多提供商共识。

Out of current evidence：主网、公共测试网广播、生产多人托管、硬件生物识别、浏览器origin沦陷、任意可升级target的全部经济后果、跨链桥、非EVM链、生产SaaS多租户、HSM、完整ERC-7562公共mempool/聚合器/7702兼容认证。原始强制公共测试网项目仍保留在追踪矩阵，BLOCKED/NOT RUN并明确后续工作，不擅自删除。

审查方法：需求与不变量对照、逐函数手工审查、Slither、正/负/边界/回调/fuzz/stateful、SDK差分、真实API和浏览器、版本/构建/部署配置、依赖与秘密扫描。真实Finding按复现→修复→回归→复审；已确认Critical/High未修复则禁止公共部署。
