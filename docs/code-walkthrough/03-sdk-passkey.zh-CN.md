# SDK、Gas打包与WebAuthn客户端

冻结Commit `fcc439f8167b7573269f1ce5a17058071e10a0a7`。实际文件 `/home/chenhy/workspace/web3-portfolio/smart-account-platform/packages/protocol.ts`、`/home/chenhy/workspace/web3-portfolio/smart-account-platform/packages/passkey.ts`。

## A. Business Principle
SDK把用户要做的业务动作变成确定的签名对象；Passkey把认证器的真实授权证据转换成合约理解的ABI。SDK没有链上最终决定权。

## B. Architecture
protocol.ts集中管理实际ABI、v0.8 packing、hash和wire格式。passkey.ts管理浏览器凭据与DER转换。两个模块不读取服务端sponsor/deployer私钥；浏览器只保存本地测试签名者和credential ID。

## C. Source Implementation
ABI函数名必须与SmartAccount的实际入口匹配。EntryPoint的PackedUserOperation含9个字段，signature不属于userOpHash本身，paymaster签名则处于paymasterAndData内并被owner签名绑定。项目采用viem官方实现，不重写v0.8哈希算法。

## D. Line-by-Line Walkthrough
|真实源码行|语句与作用|为什么及失败边界|
|---|---|---|
|`packages/protocol.ts:94`|检查范围后将high左移128位，与low按位或|位宽错误会改变验证gas/调用gas或优先费/最高费的意义。|
|`packages/protocol.ts:99`|高位右移、低位用(2^128−1)掩码|不得通过Number中转，全部为bigint。|
|`packages/protocol.ts:103`|编码唯一executeOperation入口并保留nonce/epoch/actions|owner签的是编码后的实际payload，不是UI标签。|
|`packages/protocol.ts:125`|把packed字段变成viem v0.8结构|工厂前20字节、Paymaster前52字节都有明确边界。|
|`packages/protocol.ts:158`|固定v0.8算法与chain31337的本地域|当前应用只支持隔离本地链；公共网络参数化尚需独立验收。|
|`packages/protocol.ts:166`|让注入钱包使用真正EIP-712签名|不能改成personal_sign并假设摘要等价。|
|`packages/protocol.ts:181`|拼接20+16+16字节前缀与动态ABI数据|有效期字段是uint48秒，quotaEpoch是uint256。|
|`packages/protocol.ts:202`|JSON序列化把bigint保存为十进制字符串|JSON原生不支持bigint，不能转Number损失精度。|
|`packages/protocol.ts:207`|对服务端wire输入做hex、长度和整数检查|zod外层对象检查之后仍必须检查每个packed字段。|

|真实源码行|语句与作用|为什么及失败边界|
|---|---|---|
|`packages/passkey.ts:4`|解析ASN.1 SEQUENCE与两个INTEGER|拒绝截断、负整数、非规范前导零、零或超曲线阶标量。|
|`packages/passkey.ts:2`|固定secp256r1曲线阶，用于标量边界和low-s|不是secp256k1阶，不能从ECDSA钱包代码复制错常数。|
|`packages/passkey.ts:34`|把高s规范化为n−s|P256数学验证等价；避免浏览器输出与链上low-s要求不兼容。|
|`packages/passkey.ts:48`|使用浏览器正式create API，ES256、要求UV|没有把随机字节或软件mock当作真正WebAuthn注册。|
|`packages/passkey.ts:76`|只导出公开SPKI，再由WebCrypto解析为JWK坐标|不导出认证器私钥；接口不支持时明确失败。|
|`packages/passkey.ts:99`|把操作hash的原始32字节交给浏览器get API|不能把0x文本的UTF8字符当challenge。|
|`packages/passkey.ts:112`|记录type/challenge在真实JSON中的偏移|链上库用偏移检查片段，同时账户检查W3C规范前缀及分隔符。|
|`packages/passkey.ts:1`|把r/s、索引、认证器数据和JSON按struct ABI编码|这是动态tuple编码，不能误用简单字节拼接。|

## E. Execution Trace
点击Prepare → action编码 → API返回已签赞助的packed operation → parseOperation把十进制wire值恢复bigint → operationHash与EntryPoint结果一致 → owner的raw digest签名或注入钱包typed data → signature前置模式0/1/2 → service收到完整操作。

Passkey分支是浏览器get → DER解析 → authenticatorData/clientDataJSON打包 → mode2 → 合约严格上下文检查 → 真正P256验证。认证器拒绝、超时、用户取消都应停止签名，不生成假的成功签名。

## F. Test Explanation
protocol.test.ts检查打包边界、溢出、浮点nonce、奇数hex、不同sender/nonce/EntryPoint/callData域和DER负面情况。service.test.ts把SDK hash同真实EntryPoint比对。浏览器验收使用虚拟CTAP2完成真实注册/断言/链上验证；Foundry还检查错误origin、无UV、错误challenge、撤销和畸形ABI。

## G. Security Reasoning
所有整数保持bigint；DER必须有严格长度和标量边界；外部浏览器返回值仍不可信，合约重新验证。origin被攻破不在签名数学的保护范围内，因此生产环境还需要严谨CSP、供应链控制和真实硬件/多浏览器验收。原整段JSON模板导致真实F-02可用性缺陷，已改为W3C有限验证；详见F-02报告。后缀虽然参与P256签名，但不解析为授权。

## H. Practical Exercise
手工计算pack128(verification,call)再解包；尝试2^128并解释为何应拒绝。把challenge编码改成UTF8文本，观察链上失败。构造合法高s DER并解释低s规范化为什么不等于伪造签名。

## I. Interview Questions
为什么JSON必须保存十进制字符串？v0.8与v0.6的hash能否混用？为什么authenticatorData与clientDataJSON都要签？浏览器返回的公开坐标是否证明硬件可信？passkey注册成功与链上授权成功为什么必须分别确认？
