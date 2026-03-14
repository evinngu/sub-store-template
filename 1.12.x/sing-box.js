const { type, name } = $arguments
const compatible_outbound = {
  tag: 'COMPATIBLE',
  type: 'direct',
}

let compatible
let config = JSON.parse($files[0])
let proxies = await produceArtifact({
  name,
  type: /^1$|col/i.test(type) ? 'collection' : 'subscription',
  platform: 'sing-box',
  produceType: 'internal',
})

// 1. 分发代理节点到出站列表 (Outbounds) 与端点列表 (Endpoints)
proxies.forEach(p => {
  if (p.type === 'wireguard') {
    // 1.1 wireguard 类型的节点，更新 detour 为 relay-warp
    p.detour = 'relay-warp';
    // 1.2 确保使用内置协议栈以兼容 macOS/iOS
    delete p.system;
    // 1.3 将 WireGuard 节点移动到 endpoints 结构下
    if (!config.endpoints) config.endpoints = [];
    config.endpoints.push(p);
  } else {
    // 1.4 非 wireguard 类型的落地节点，更新为 relay-common
    if (/落地/i.test(p.tag)) {
        p.detour = 'relay-common';
    } else if (p.detour && p.detour.includes('前置')) {
        // 1.5 剔除从 dialer-proxy 导入的错误 detour 属性
        delete p.detour;
    }
    config.outbounds.push(p);
  }
})

// 2. 移除原先清空 endpoints 的逻辑 (现在我们需要在这里存放 WireGuard 节点)

// 3. 填充策略组 (Selector Groups)
config.outbounds.map(i => {
  // 3.1 中转组：标准组只包含中转节点（排除落地节点），以打破循环依赖
  if (['all', 'all-auto'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, null, true))
  }
  if (['hk', 'hk-auto'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, /港|hk|hongkong|hong kong|🇭🇰/i, true))
  }
  if (['tw', 'tw-auto'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, /台|tw|taiwan|🇹🇼/i, true))
  }
  if (['jp', 'jp-auto'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, /日本|jp|japan|🇯🇵/i, true))
  }
  if (['sg', 'sg-auto'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, /^(?!.*(?:us)).*(新|sg|singapore|🇸🇬)/i, true))
  }
  if (['us', 'us-auto'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, /美|us|unitedstates|united states|🇺🇸/i, true))
  }
  
  // 3.2 处理落地出口组 (Exit Groups)
  if (i.tag === 'exit-common') {
    // 3.2.1 从出站列表中收集非 WireGuard 的普通落地节点
    const commonProxies = config.outbounds.filter(p => 
      p.type !== 'wireguard' && 
      p.type !== 'direct' && 
      p.type !== 'selector' && 
      p.type !== 'urltest' && 
      /落地/i.test(p.tag)
    )
    i.outbounds.push(...getTags(commonProxies))
  }
  if (i.tag === 'exit-warp') {
    // 3.2.2 直接从 endpoints 列表中收集 WireGuard 落地节点的标签名进行填充
    const warpProxies = (config.endpoints || []).filter(p => 
      p.type === 'wireguard' && 
      /落地/i.test(p.tag)
    )
    i.outbounds.push(...getTags(warpProxies))
  }
})

// 4. 处理空策略组的兼容性出站
config.outbounds.forEach(outbound => {
  if (Array.isArray(outbound.outbounds) && outbound.outbounds.length === 0) {
    if (!compatible) {
      config.outbounds.push(compatible_outbound)
      compatible = true
    }
    outbound.outbounds.push(compatible_outbound.tag);
  }
});

// 5. 将最终配置转换为字符串内容
$content = JSON.stringify(config, null, 2)

function getTags(proxies, regex, excludeLanding = false) {
  let filtered = regex ? proxies.filter(p => regex.test(p.tag)) : proxies;
  if (excludeLanding) {
    filtered = filtered.filter(p => !/落地/i.test(p.tag));
  }
  return filtered.map(p => p.tag);
}
