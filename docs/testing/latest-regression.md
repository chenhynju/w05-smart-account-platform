# 当前交付结论 2026-11-03T04:55:32.847744+08:00

本地最终16浏览器/11 API/35 Foundry/8 TS/干净副本/当前故障恢复均PASS；完整公共阶段仍BLOCKED，用户掌握NOT RUN。F-02/F-03/F-04真实反例与最终回归已闭环。最新权威报告见docs/testing/delivery-current.md；以下旧阶段内容仅为历史，不覆盖当前结论。

# 当前：F-03 / F-04与上下文测试增强等待最终完整回归

F-03已改为pending区块时间计算一小时session并延迟本地key激活；F-04实际空闲链使latest落后pending1204秒，300秒赞助立即AA32，已改pending并新增十分钟差的真实集成回归。原失败均保留。额外mutation曾存活，等长错误origin/RP有效签名测试现已增强，等待同一mutant被杀死。不得用上一轮基础/浏览器PASS覆盖当前未完成的最终新源验收。

# 最新F-03：Session链时间缺陷已补丁，等待真实完整回归

最终网络profile API10通过，浏览器在第二次复用已推进两天的链时，Create session key真实execution_failed。捕获公开操作后确认wall-clock期限小于真实区块时间。已改为最新区块timestamp+3600，并且只在成功事件确认后保存session key。F-03详述和证据已保存。不能用前一套15检查点PASS冒充修复后完整回归。公共网络仍无签名/广播。

# F-02已定位并通过真实浏览器修复回归

原间歇性AA24根因为完整clientDataJSON模板比较错误拒绝浏览器扩展。捕获原始公开断言，Node P256=true但chain=false；Foundry原始断言修复前FAIL、修复后PASS。补丁d77f215采用W3C有限验证前缀与分隔符，保留完整P256签名和RP/origin/challenge/UV/epoch政策。见docs/audit/findings/F-02-webauthn-json-extensibility.md。

新不可变栈在b1a6095源码部署。最新完整浏览器a347899通过15个验收检查点：批量成功/真实回滚、撤销、连续13次Passkey真实上链（额外12次中观察到2个Chrome扩展）、多签与完整guardian延迟恢复/旧owner失权、390px及无pageerror。evidence/browser-passkey-fixed/evidence.json和.log。旧JSON模板反例、旧失败栈和原失败日志保留；不是“重试至通过”，必须继续保留稳定反例回归。

另一次扩展脚本因Next路由公告也使用role=alert而在选择器层FAIL，已保留selector-failure证据，修正为产品.message.error后整套通过。这不是链上认证再次失败。

此后新增显式Sepolia配置与公共签名门禁，当前新源码基础门禁/最终服务浏览器仍需看最新release-candidate日志，不把上述b1/a347证据冒充新服务全栈已经验收。公共签名广播未授权/NOT RUN，物理认证器NOT RUN。

## 原失败记录（历史，已保留并修复）

# 最新未解决回归 — Passkey间歇性AA24

时间2026-11-03T01:24:54.336078+08:00，当前源码 `93a0e219cbbe3053a7727479809927b96aaa668f`。**最新完整浏览器重跑FAIL，不能用之前10检查点PASS覆盖此失败，也不能宣称本地完整Engineering Gate已通过。**

先前同一隔离栈/虚拟CTAP2流程曾完整PASS（evidence/browser/acceptance.json），之后增加了仅显示链上owner的UI修复并通过主仓及干净副本完整基础gate。最新生产服务重启后，新浏览器测试通过开户、owner链路、session、撤销拒绝、Passkey注册，但在Passkey实际提交（nonce5）返回真实EntryPoint `AA24 signature error`，等待成功超时。截图/JSON/日志为latest-failure与failure-passkey-AA24.png。

根因未知，不能推断是显示修复造成，也不能忽略为偶发。失败交易未广播，不能把签名失败当成功。必须优先保存下一次失败完整的**公开**packed UserOperation/WebAuthn断言（浏览器catch可读pre.textContent），不导出sessionStorage私钥或认证器私钥。当前脚本只保存截图，context关闭后本次完整签名未保留；链上失败账户和Passkey公开坐标仍在主链，nonce未消费。

下一轮先做最小重复验证：DER r/s范围与P256阶/low-s、真实clientDataJSON/RP/origin/flags、正确operationHash/epoch/nonce、认证器凭据、公钥解析、软件P256fallback及gas边界。Foundry固定key42正负测试通过不等于随机浏览器凭据全部通过。捕获反例→定位→修复→随机P256/浏览器回归，再重新验收；不要改断言或重试到通过就隐藏问题。

当前基础format/type/unit/fuzz/invariant/build与干净副本源摘要均PASS：5669532638217610054f73514a01eea20f71cdc1494008be295477935410a96e。33合约测试、API10、coverage/Slither/三mutant/服务重启/RPC恢复/冷加载为既有真实证据；它们不能替代最新Passkey全栈失败。公共网络一律保持未授权/未执行。
