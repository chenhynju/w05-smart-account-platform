# ADR-010 · 授权期限使用将执行验证的区块时钟
Why：F-03电脑时钟与链时间错位；F-04按需链latest长时间不前进，使latest+300立即过期。
Decision：session一小时及赞助五分钟都读取pending区块timestamp，范围保持不变；最终仍由合约/EP实施。
Alternatives：电脑时间无法代表time-travel本地链或不同步电脑；latest在不出块时陈旧；自动挖块或延长有效期会掩盖问题。
Trade-offs：依赖RPC正确支持pending语义。链停止或provider不兼容必须BLOCKED；等待过久应重新赞助并重新签操作，不能篡改已签字段。
Evidence：公开失败操作/AA32日志，unit uint48边界，浏览器主动推进两天、API不挖块推进pending十分钟的稳定回归。
