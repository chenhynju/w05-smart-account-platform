# Source teaching index

冻结源代码 Commit：`fcc439f8167b7573269f1ce5a17058071e10a0a7`。完整绝对根路径：`/home/chenhy/workspace/web3-portfolio/smart-account-platform`。

1. [SmartAccount授权、执行与恢复](01-smart-account.zh-CN.md)
2. [Factory与Paymaster](02-factory-paymaster.zh-CN.md)
3. [SDK、Gas字段与WebAuthn客户端](03-sdk-passkey.zh-CN.md)
4. [服务、UI、持久化和错误处理](04-service-ui.zh-CN.md)
5. [测试、不变量、部署和CI](05-tests-operations.zh-CN.md)

6. [网络身份、发布门禁与费用预算](06-network-release.zh-CN.md)

每份导读采用A–I教学结构，行号来自实际文件。`source-map.json`含所有自行编写的重要源码/测试/脚本的SHA256、行数和冻结Commit。修改代码后必须同步导读，不能把旧行号当作新版本解释。重要语句逐一说明；简单赋值和第三方依赖不逐行复制。

第三方机制入口：BaseAccount.validateUserOp的EntryPoint调用身份/prefund；EntryPoint._validatePrepayment/nonce/执行错误隔离与UserOperationEvent；BasePaymaster的deposit/stake/onlyOwner；OZ ECDSA的low-s恢复；WebAuthn的UP/UV/challenge检查与有意省略项；P256的预编译探测/软件验证fallback；viem的v0.8 typed-data hash和交易序列化。对应版本以package-lock.json和node_modules实际源代码为准。
