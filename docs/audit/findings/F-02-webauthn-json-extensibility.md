# F-02 · 严格JSON模板错误拒绝合法Passkey断言

Severity: Medium (authentication availability). Status: FIXED in d77f215a2147509918196a7043c2ba9a1d24c199; full-stack release verification pending. Self-Assessment / AI-Assisted Review.

## Impact / Preconditions / Root cause
已注册用户通过真实Chromium认证器生成的合法P256断言可能间歇返回EntryPoint AA24。原代码把整个clientDataJSON与固定模板做keccak等值比较，忽略WebAuthn允许新增签名字段；浏览器随机添加兼容性提示字段时触发。不是私钥、DER、nonce或低s错误。拥有其他owner路径的用户仍可操作；依赖Passkey登录的体验受到阻塞。

## Evidence / executable local PoC
冻结旧代码9724ea5，新增testPasskeyCapturedChromiumExtension后实际FAIL，evidence/passkey-prefix-before.txt。公开失败断言位于evidence/passkey-diagnostics/1793646419126/assertion-1.json：Node原生P256验证true，chainValid=false，RP/UV/challenge/hash均匹配；JSON包含other_keys_can_be_added_here。同目录assertion-0为相同浏览器凭证的有效基本断言。无认证器私钥导出，无公共网络交易。

## Fix / standards / security review
采用[W3C WebAuthn 3 §5.8.1.2 Limited Verification Algorithm](https://www.w3.org/TR/2026/REC-webauthn-3-20260825/#sctn-clientdatajson-verification)：topOrigin未定义，仅接受固定顺序、准确type/challenge/origin/crossOrigin:false前缀，紧接逗号或对象结束符。前缀缺字节、错误字段、falsehood伪布尔、错误分隔符拒绝。RP ID hash、UP/UV、epoch、threshold和完整clientDataJSON的P256签名验证不变。

该有限算法刻意不解析后缀：后缀只是认证器签过名的不透明数据，不用于任何授权、origin覆盖或JSON.parse二次解释。它不是通用JSON合法性验证器；非规范尾部或重复成员若出现在已验证前缀之后，不改变前缀政策。本项目不得在其他模块重新解析后缀来决定授权；如以后需要扩展授权字段，必须重新设计验证。不同字段顺序/转义/跨源iframe不受支持，符合所采用的受限验证规则。配置origin须为实际浏览器序列化的origin；配置由现有owner认证操作完成。

## Regression / fix review / residual risk
testPasskeyCapturedChromiumExtension复用原始真实签名、坐标和hash，修复后PASS；testPasskeyExtensionAndPrefixBoundaries使用有效签名覆盖嵌套扩展、缺分隔符、错误token边界、非规范空格、challenge错误以及evil origin后跟重复合法origin；既有wrong origin/no UV/wrong challenge/revocation仍PASS。日志evidence/passkey-prefix-after.txt。仍需新部署完整浏览器连续断言；旧不可变账户保留失败行为作为历史证据。虚拟CTAP2不能证明所有物理认证器兼容性；不宣称独立第三方审计。
