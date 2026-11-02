# 从业务到账户执行：W05 协议与密码学

## 1. 账户并非一个“登录按钮”

EOA 的授权规则固定为 secp256k1 私钥签名。这里的 SmartAccount 是有代码和状态的合约：owner 集合、阈值、epoch、session、passkey、guardian 决定某个操作是否有效。前端登录状态不能替代链上授权；服务器认可一个用户，也不能绕过账户签名。

一次业务操作至少有四种不同身份：签署 UserOperation 的账户授权者；为外层交易付 ETH 的 bundler EOA；可能为内部 gas 支付的 Paymaster；被调用的业务合约。把它们都称为“钱包发交易”会掩盖真正的资金与权限边界。

## 2. ERC-4337 v0.8 的实际顺序

浏览器准备 actions → SDK 编码账户 calldata → 获取账户 keyed nonce 和 epoch → sponsor 对不含循环签名的操作摘要签名 → owner/session/passkey 签署完整 UserOperation hash → service 模拟完整 handleOps → bundler 签署并广播外层交易 → EntryPoint 验证所有操作 → 执行账户 calldata → 结算 gas 并产生事件 → UI 按 UserOperationEvent.success 更新。

**验证全部操作，然后依次执行**是本项目的重要安全约束。操作 n 在验证时合法，操作 n−1 在执行时却可能撤销其权限。只在 validateUserOp 检查 session 不够，所以执行阶段还要检查 epoch、有效期和剩余额度。回归测试真的把“撤销、旧 session 操作”放进同一个 handleOps 数组，不是两次孤立调用。

## 3. Nonce 与签名域

完整 nonce = `(uint192 key << 64) | uint64 sequence`。EntryPoint 负责每个 sender/key 的顺序与唯一性。账户 calldata 同时包含完整 nonce，账户还检查它等于 UserOperation.nonce。不同 key 可以独立排队；不能把 nonce 转成 JavaScript Number，超过 2^53 会丢精度。

v0.8 的 UserOperation hash 使用 EIP-712 域及 PackedUserOperation，不是 v0.6 的旧 ABI。签名域包括 chain ID 和 EntryPoint；sender 和 callData 也在消息中。更换链、EntryPoint、账户、nonce、gas 或动作，都会使原签名失效。SDK 的计算已经用真正部署的 EntryPoint.getUserOpHash 做差分比较。

ERC-1271 只规定接口与 magic value，不自动防止所有消费者重放。这里的 `messageDigest` 额外绑定 `W05:ERC1271:v1`、chain ID、账户地址、EntryPoint、epoch 和消费者 hash。消费者必须让用户签这个包装后的 digest；不能拿一个普通 personal_sign 签名期望它直接通过。

## 4. ECDSA 为什么有效，为什么拒绝重复 signer

椭圆曲线私钥 d 对应公钥 Q=dG。签名包含 (r,s)，验证使用 z 为消息摘要，计算 u1=z·s⁻¹ mod n、u2=r·s⁻¹ mod n，再检查 `(u1G+u2Q).x mod n == r`。secp256k1 与 P256 使用不同曲线和参数，不能互换。

ECDSA 有 (r,s) 与 (r,n−s) 的可塑性；正式实现使用 OpenZeppelin 的范围和 low-s 检查。不要为教学便利自己写生产密码学。多签阈值计算的单位是**不同且当前有效的 owner 地址**，不是签名数组长度。因此签名恢复出的地址必须严格递增；同一个 owner 的两个签名不能当作两票。外部合约 owner 的递归 ERC-1271 聚合不在这个 EOA-owner 阈值实现范围内。

## 5. WebAuthn 到 P256 的完整链条

注册时，浏览器通过 navigator.credentials.create 生成 RP 限定的 P256 凭据。客户端提取公开坐标 Qx/Qy，不提取私钥。已有 owner 通过真正的账户操作把公钥、RP ID hash、origin 写入账户。注册认证器的 attestation 这里使用 none，不能宣称认证了硬件供应商或设备安全等级。

签署时，UserOperation hash 的 32 个字节直接作为 challenge。浏览器生成 clientDataJSON，里面含 type、Base64URL challenge、origin 和 crossOrigin。authenticatorData 前 32 字节是 SHA256(rpId)，第 33 字节是 flags，后有签名计数器等。必须存在 UP 位 (0x01)，本项目也必须有 UV 位 (0x04)。签名消息是：

`SHA256(authenticatorData || SHA256(UTF8(clientDataJSON)))`

认证器返回 ASN.1 DER 编码的 r/s；客户端解析严格长度、正整数、标量范围，并把高 s 规范化到低 s。账户先检查注册 epoch、单签策略、RP hash、完整规范 clientDataJSON，再调用 OZ WebAuthn.verify/P256。OZ 默认有意省略的 origin/RP 检查在这里被补上。严格 JSON 格式是兼容性取舍：不同浏览器若输出不同但合规的附加字段，可能被拒绝，需要兼容测试与审查，不能静默放宽。

## 6. Gas 字段的单位和打包

`accountGasLimits = uint128(verificationGasLimit) || uint128(callGasLimit)`。

`gasFees = uint128(maxPriorityFeePerGas) || uint128(maxFeePerGas)`。

gas limit 单位为 gas；fee 单位为 wei/gas；两者乘积为 wei。Pack 前必须检查 uint128 范围，不能截断。paymasterAndData 的前缀是 20 字节地址 + 16 字节验证 gas + 16 字节 postOp gas，共 52 字节；后面才是 ABI 编码的 sponsorship 数据。

sponsor 不能对包含自己签名的完整 paymasterAndData 直接签名，否则会形成循环依赖。因此专用 digest 绑定 sender、nonce、initCode hash、callData hash、账户 gas、preVerificationGas、fee、52 字节 paymaster 前缀、有效期和 quota epoch，但排除 sponsor 签名自身。owner 随后对包含 sponsor 签名的完整 UserOperation hash 签名。

## 7. 原子性、失败与费用

批量执行第一个 action 成功，第二个 action revert：账户把第二个失败向上抛出，整个账户执行调用栈回滚，第一条业务状态也回滚。但 EntryPoint 捕获该执行失败，仍可能结算 gas、消费 nonce 和已保留的赞助额度。因此 HTTP 200、外层交易 success、内部业务 success 是三件不同的事。UI 必须读取对应 userOpHash 的 UserOperationEvent.success。

预付保证金由版本固定的 EntryPoint 算法决定。项目中的保守额度模型按签署 gas 上限与 maxFeePerGas 预留最大成本。Paymaster validation 阶段就扣预算，执行失败不能逃避预算。剩余预算、EntryPoint 存款、bundler EOA 余额是三个独立量。

## 8. 恢复与撤销的代价

恢复提案必须由 guardian 提出，并获得不同 guardian 的阈值票数，等待两天后按提案 ID 完成。恶意单个 guardian 不能占用唯一提案槽阻塞其他阈值，因为修复后的提案彼此独立。完成恢复只替换 owners，不可执行任意业务动作。epoch 递增使旧 owner 操作、旧 session 和旧 passkey 失效。

改变 owner、guardian、session 或 passkey 策略会保守地使其他旧策略失效。这个设计简单且撤销及时，但多 session 并行管理的体验较弱。优化成独立子策略版本，必须重新验证跨操作撤销、同批次授权、签名域与恢复后的全面失效，不能只删除 epoch 检查。

## 9. 证据没有证明什么

本地 fuzz 与 stateful invariants 是有限搜索，不是数学全称证明；Slither 告警需要人工判断；虚拟认证器不能证明 Windows Hello 生物识别或硬件抗提取；本地 JSON-RPC 互操作不等于 ERC-7562 公共 mempool 合规；源码导读存在不等于学习者已掌握；本地交易哈希不是公共测试网交易哈希。

官方资料：ERC-4337、ERC-1271、ERC-7562、W3C WebAuthn Level 2，以及锁定版本的 EntryPoint/BaseAccount/BasePaymaster、OZ ECDSA/WebAuthn/P256 源码。版本差异以仓库锁文件和实际编译源为准。
