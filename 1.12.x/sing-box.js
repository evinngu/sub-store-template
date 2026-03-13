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

// 1. Distribute proxies into outbounds and endpoints
proxies.forEach(p => {
  if (p.type === 'wireguard') {
    if (!config.endpoints) config.endpoints = [];
    p.tag = p.tag + "-ep"; // Rename endpoint to avoid collision with phantom outbound
    // (2) wireguard 类型的节点，删除 detour
    if (p.detour) delete p.detour;
    config.endpoints.push(p);
  } else {
    // (3) 非 wireguard 类型的落地节点，更新为 relay-common
    if (/落地/i.test(p.tag)) {
        p.detour = 'relay-common';
    } else if (p.detour && p.detour.includes('前置')) {
        // Strip out wrong detours from dialer-proxy imported as outbounds
        delete p.detour;
    }
    config.outbounds.push(p);
  }
})

// 2. Process natively parsed wireguard endpoints to inject phantom routing outbounds
if (config.endpoints) {
  let phantomOutbounds = []
  config.endpoints.forEach(ep => {
    if (ep.type === 'wireguard') {
      if (!ep.name) {
        ep.name = "wg-" + Math.random().toString(36).substring(2, 6);
      }
      ep.system = true;

      let phantomOutbound = {
        tag: ep.tag.replace(/-ep$/, ""),
        type: "direct",
        bind_interface: ep.name
      };
      // (1) phantom direct 出站不应该有 detour
      phantomOutbounds.push(phantomOutbound);
    }
  })
  config.outbounds.push(...phantomOutbounds)
}

// Remove buggy fallback wireguard outbounds natively injected by Sub-Store (if any left)
config.outbounds = config.outbounds.filter(ob => ob.type !== 'wireguard')

config.outbounds.map(i => {
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
  if (i.tag === 'exit-common') {
    const commonProxies = config.outbounds.filter(p => p.type !== 'direct' && /落地/i.test(p.tag))
    i.outbounds.push(...getTags(commonProxies))
  }
  if (i.tag === 'exit-warp') {
    const warpProxies = config.outbounds.filter(p => p.type === 'direct' && /落地/i.test(p.tag))
    i.outbounds.push(...getTags(warpProxies))
  }
})

// Cleanup internal markers
config.outbounds.forEach(p => { if (p._detour) delete p._detour });

config.outbounds.forEach(outbound => {
  if (Array.isArray(outbound.outbounds) && outbound.outbounds.length === 0) {
    if (!compatible) {
      config.outbounds.push(compatible_outbound)
      compatible = true
    }
    outbound.outbounds.push(compatible_outbound.tag);
  }
});

$content = JSON.stringify(config, null, 2)

function getTags(proxies, regex, excludeLanding = false) {
  let filtered = regex ? proxies.filter(p => regex.test(p.tag)) : proxies;
  if (excludeLanding) {
    filtered = filtered.filter(p => !/落地/i.test(p.tag));
  }
  return filtered.map(p => p.tag);
}
