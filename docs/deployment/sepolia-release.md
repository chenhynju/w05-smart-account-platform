# Sepolia发布准备与单独授权门禁

状态：实现和本地检查准备中；公共网络部署/签名/广播/源代码公开验证均NOT RUN。调度执行不构成授权。仅支持Ethereum Sepolia (11155111)与隔离Anvil (31337)，拒绝主网和隐式网络回退。参见[ethereum.org网络说明](https://ethereum.org/developers/docs/networks/)及[Sepolia客户端配置](https://github.com/eth-clients/sepolia)。

## 配置与身份隔离
`packages/network.ts`为SDK/UI选择链；operationHash/operationTypedData接收明确chainId，后端使用manifest链，前端构建链和服务配置必须一致。本地sessionStorage键w05.local.keys和Sepolia键w05.sepolia.keys隔离。服务设置W05_NETWORK=sepolia时只读取.runtime/sepolia/，不读取本地keys/deployment/store，只有设置明确的操作授权门禁才能启动签名服务。该环境变量是防误操作机制，不能替代用户授权。

本地RPC固定loopback:18555；Sepolia要求HTTPS，启动时读取实际chainId并核验部署bytecode hash。配置API不暴露实际RPC endpoint。公共profile绝不调用anvil_setBalance。Guardian是浏览器独立一次性钥匙，需要单独获得测试ETH才能发恢复交易，界面不自动转账；物理认证器、多真人托管仍不在现有证据范围内。当前受信allowlisted bundler依赖debug_traceCall/状态覆盖RPC能力，公共provider不支持时必须BLOCKED，不跳过验证。

## 无签名预检
先通过完整源码检查、commit冻结，然后运行：
```
npx tsx scripts/sepolia-release.ts --prepare
```
生成两把与本地完全不同的随机key，0600仅保存在.runtime/sepolia/keys.json，不输出私钥；仅读RPC chainId/nonce/balance/baseFee。输出deployments/sepolia-unsigned-plan.json，包括公开地址、预测地址、构造数据、gas上界、compiler、artifact SHA、sourceCommit。RPC未通时nonce0预测仅为暂定，必须以成功预检重新生成计划。该文件不含签名。

拟部署4个不可升级合约：EntryPoint v0.8.0、AccountFactory(固定EP)、QuotaPaymaster(固定EP/独立sponsor)、Counter。另向Paymaster存入0.5测试ETH。5笔交易gas上界合计17,600,000，maxFeePerGas2gwei、priority1gwei，部署及存款最大支出0.5352测试ETH；不购买测试币、不花主网资产。公共服务最多分配0.5ETH总赞助额度，每账户0.25，最多两个完整额度。额度按最坏prefund预留而非实际gas退款，需在验收前核对足够余额。bundler将收到实际gas报销；最大网络损失受存款/额度约束。任何额外充值、转账、权限修改或超预算操作均需重新对应授权。

## 审批后执行（当前禁止自动运行）
需要用户明确同意上述网络、公开地址、5笔交易、预算和后续受限测试操作；需要测试ETH资金且最新预检满足baseFee+priority<=2gwei。才能执行--broadcast并设置W05_PUBLIC_BROADCAST_AUTHORIZED=sepolia-11155111。脚本逐笔比较已审核计划的源码、artifact、nonce、地址、交易数据/value/gas、手续费上限，配置变动必须重审。每笔签名原文/hash先持久保存，广播不确定时停止并按hash查链，禁止重复签新交易。已存在deployment拒绝重部署；失败收据保留并阻断后续。

发布后另执行构造参数/creation calldata/runtime immutables/权限/deposit审查、完整API和浏览器E2E、事件与nonce回读；仅拿到contractAddress不能PASS。源码在浏览器公开验证也属于远程公开发布，需要对应授权；准备standard-json/compiler settings并在批准后提交。当前尚无公共txhash、contract地址或验证链接，不可用本地hash代替。

## UI生产构建
```
NEXT_PUBLIC_W05_NETWORK=sepolia npm run build
```
产物独立放apps/web/.next-sepolia，不覆盖本地.next。服务默认仍是local；必须同时显式选择公共profile并通过授权门禁。bind仍loopback，暂不远程托管。上公网前另审CSP（当前兼容本地测试的unsafe-inline/unsafe-eval）、认证与速率策略、密钥保管、外部RPC能力及监控，不把本地开发origin策略当成公共部署准备完毕。
