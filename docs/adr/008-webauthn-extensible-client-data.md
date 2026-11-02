# ADR-008 · WebAuthn可扩展的有限上下文验证
Status: accepted after captured-browser failure regression.
Why：完整JSON模板因浏览器合法扩展导致AA24；必须保留RP/origin/UV绑定。
Decision：W3C WebAuthn3 §5.8.1.2有限算法，固定顺序前缀后只检查分隔符，仍签完整JSON。
Alternatives：通用JSON解析器更复杂、gas与攻击面更大；仅OZ片段检查省略origin/RP；按浏览器提示字段特判无法适应未来扩展。
Trade-offs：不支持重新排序、任意空白或跨源iframe；后缀不解析不授权，不宣称完整JSON结构检查。
Risks：未来授权若依赖扩展字段必须另行设计，不能从后缀取同名字段覆盖前缀。F-02及测试给出真实反例、稳定复现、修复与浏览器证据。
