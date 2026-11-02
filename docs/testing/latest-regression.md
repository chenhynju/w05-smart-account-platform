# 最新未解决回归 — Passkey间歇性AA24

时间2026-11-03T01:24:54.336078+08:00，当前源码 `93a0e219cbbe3053a7727479809927b96aaa668f`。**最新完整浏览器重跑FAIL，不能用之前10检查点PASS覆盖此失败，也不能宣称本地完整Engineering Gate已通过。**

先前同一隔离栈/虚拟CTAP2流程曾完整PASS（evidence/browser/acceptance.json），之后增加了仅显示链上owner的UI修复并通过主仓及干净副本完整基础gate。最新生产服务重启后，新浏览器测试通过开户、owner链路、session、撤销拒绝、Passkey注册，但在Passkey实际提交（nonce5）返回真实EntryPoint `AA24 signature error`，等待成功超时。截图/JSON/日志为latest-failure与failure-passkey-AA24.png。

根因未知，不能推断是显示修复造成，也不能忽略为偶发。失败交易未广播，不能把签名失败当成功。必须优先保存下一次失败完整的**公开**packed UserOperation/WebAuthn断言（浏览器catch可读pre.textContent），不导出sessionStorage私钥或认证器私钥。当前脚本只保存截图，context关闭后本次完整签名未保留；链上失败账户和Passkey公开坐标仍在主链，nonce未消费。

下一轮先做最小重复验证：DER r/s范围与P256阶/low-s、真实clientDataJSON/RP/origin/flags、正确operationHash/epoch/nonce、认证器凭据、公钥解析、软件P256fallback及gas边界。Foundry固定key42正负测试通过不等于随机浏览器凭据全部通过。捕获反例→定位→修复→随机P256/浏览器回归，再重新验收；不要改断言或重试到通过就隐藏问题。

当前基础format/type/unit/fuzz/invariant/build与干净副本源摘要均PASS：5669532638217610054f73514a01eea20f71cdc1494008be295477935410a96e。33合约测试、API10、coverage/Slither/三mutant/服务重启/RPC恢复/冷加载为既有真实证据；它们不能替代最新Passkey全栈失败。公共网络一律保持未授权/未执行。
