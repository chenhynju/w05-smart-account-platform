# Toolchain and dependency review

## Compiler
初始可用版本0.8.31不是最终安全选择。官方Solidity bugs.json列出SOL-2026-7：受影响版本从0.8.19开始，修复于0.8.38，条件包括Yul optimizer；优化IR代码即使没有手工assembly也可能受影响。本项目使用via-IR，因此选择升级，而不是猜测所有编译路径都不触发它。

项目本地0.8.38的官方solc-bin SHA256已核验：65c3180a336eabb6bdc4bbd49cc405aeb233976964ae6c11fba2a6c8be8f3243。证据solc-build.json和compiler-known-bugs.json；没有修改用户全局工具链。该项是已知工具链风险的处置，不是虚构本应用的可执行资产攻击。

升级后还检测到缓存中的EntryPoint artifact仍为0.8.31，部署预检实际阻止了该候选。随后强制重建全部artifact，并对每个合约核查compiler、viaIR、Cancun、optimizer200，再进行最终本地部署。只看某个“Compiling...0.8.38”日志不足以证明所有待部署artifact版本一致。

## Dependencies
最初选择的Next16.0.1有明确安全deprecated提示；旧wagmi/连接器依赖图和zod也有npm advisory。实际升级Next16.4.4、React19.3.1、wagmi3.7.9、viem2.57.14、zod4.6.7，减少了大量未使用连接器依赖。精确版本由package-lock.json固定，npm audit结果在evidence/npm-audit-final.json，报告时间后新通告仍可能出现。

npm audit为0不等于所有依赖没有未知漏洞。锁定版本、限制网络入口、避免额外插件、签名域校验和本地隔离仍是必要边界。用户全局npm mirror返回403时，仅在任务命令显式指定官方registry，没有读取或修改包含秘密的全局npm配置。

官方来源：https://github.com/ethereum/solidity/blob/develop/docs/bugs.json 、https://github.com/ethereum/solc-bin/blob/gh-pages/linux-amd64/list.json 、https://nextjs.org/blog/CVE-2025-66478 。实际依赖advisory详情以保留的npm audit原始JSON为准。
