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

let rawProxies = []
let debugError = ""
try {
  rawProxies = await produceArtifact({
    name,
    type: /^1$|col/i.test(type) ? 'collection' : 'subscription',
    platform: 'source',
    produceType: 'internal',
  })
} catch (e) {
  debugError = String(e)
  try {
    rawProxies = await produceArtifact({
      name,
      type: /^1$|col/i.test(type) ? 'collection' : 'subscription',
      platform: 'ClashMeta',
      produceType: 'internal',
    })
  } catch (e2) {
      debugError += " | " + String(e2)
  }
}

if (!config.endpoints) {
  config.endpoints = []
}

let regularProxies = []
let endpointProxies = []

proxies.forEach(p => {
  // Access rawProxies for unaltered properties lost during Sub-Store's produceArtifact
  let rawProxy = rawProxies.find(r => r.name === p.tag) 
  let src = rawProxy || p;

  if (p.type === 'wireguard') {
    let ifaceName = "wg-" + Math.random().toString(36).substring(2, 6);
    let endpoint = {
      tag: p.tag,
      type: "wireguard",
      system: true,
      name: ifaceName
    };
    
    // MTU
    if (src.mtu || p.mtu) {
        endpoint.mtu = parseInt(src.mtu || p.mtu);
    } else {
        endpoint.mtu = 1280;
    }

    // Address
    endpoint.address = []
    if (src.ip) endpoint.address.push(src.ip)
    if (src.ipv6) endpoint.address.push(src.ipv6)
    if (src.local_address && Array.isArray(src.local_address)) {
        endpoint.address.push(...src.local_address)
    }

    // Private Key
    if (src['private-key'] || p.private_key || src.private_key) {
        endpoint.private_key = src['private-key'] || p.private_key || src.private_key
    }
    
    // Peers
    let peersConfig = []
    let sourcePeers = src.peers || p.peers;
    if (sourcePeers && Array.isArray(sourcePeers) && sourcePeers[0] && (sourcePeers[0].server || sourcePeers[0].address || sourcePeers[0].public_key || sourcePeers[0]['public-key'])) {
        sourcePeers.forEach(peer => {
            let peerCfg = {
                address: peer.server || peer.address || src.server || p.server,
                port: parseInt(peer.port || peer.server_port || src.port || src.server_port || p.port || p.server_port),
                public_key: peer['public-key'] || peer.public_key || src.peer_public_key || p.peer_public_key,
            };
            let psk = peer['pre-shared-key'] || peer.pre_shared_key || src.pre_shared_key || p.pre_shared_key;
            if (psk) peerCfg.pre_shared_key = psk;
            
            peerCfg.allowed_ips = peer['allowed-ips'] || peer.allowed_ips || src.allowed_ips || p.allowed_ips || ["0.0.0.0/0", "::/0"];
            
            if (peer.reserved || src.reserved || p.reserved) {
                peerCfg.reserved = peer.reserved || src.reserved || p.reserved;
            }
            peersConfig.push(peerCfg);
        })
    } else if (p.server || src.server) {
        let peerCfg = {
            address: src.server || p.server,
            port: parseInt(src.server_port || src.port || p.server_port || p.port),
            public_key: src.peer_public_key || src['peer-public-key'] || p.peer_public_key || p['peer-public-key'],
        };
        let psk = src.pre_shared_key || src['pre-shared-key'] || p.pre_shared_key || p['pre-shared-key'];
        if (psk) peerCfg.pre_shared_key = psk;

        peerCfg.allowed_ips = src.allowed_ips || src['allowed-ips'] || p.allowed_ips || p['allowed-ips'] || ["0.0.0.0/0", "::/0"];
        
        if (src.reserved || p.reserved) {
            peerCfg.reserved = src.reserved || p.reserved;
        }
        peersConfig.push(peerCfg);
    }
    endpoint.peers = peersConfig

    endpointProxies.push(endpoint);

    // 2. Create Phantom Direct Outbound
    let phantomOutbound = {
      tag: p.tag,
      type: "direct",
      bind_interface: ifaceName
    };
    
    if (/落地/i.test(p.tag)) {
        phantomOutbound.detour = 'relay-warp';
    }
    regularProxies.push(phantomOutbound);
  } else {
    // Other node types (e.g. socks5)
    if (/落地/i.test(p.tag)) {
        p.detour = 'relay-common'
    } else if (p.detour && p.detour.includes('前置')) {
        // Strip out wrong detours from dialer-proxy
        delete p.detour
    }
    regularProxies.push(p)
  }
})

// Filter out buggy natively-converted wireguard outbounds and endpoints injected by Sub-Store
config.outbounds = config.outbounds.filter(ob => ob.type !== 'wireguard')
if (config.endpoints) {
  config.endpoints = config.endpoints.filter(ep => ep.type !== 'wireguard')
} else {
  config.endpoints = []
}

config.outbounds.push(...regularProxies)
config.endpoints.push(...endpointProxies)

config.outbounds.map(i => {
  if (['all', 'all-auto'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies))
  }
  if (['hk', 'hk-auto'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, /港|hk|hongkong|hong kong|🇭🇰/i))
  }
  if (['tw', 'tw-auto'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, /台|tw|taiwan|🇹🇼/i))
  }
  if (['jp', 'jp-auto'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, /日本|jp|japan|🇯🇵/i))
  }
  if (['sg', 'sg-auto'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, /^(?!.*(?:us)).*(新|sg|singapore|🇸🇬)/i))
  }
  if (['us', 'us-auto'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, /美|us|unitedstates|united states|🇺🇸/i))
  }
  if (i.tag === 'exit-common') {
    const commonProxies = regularProxies.filter(p => /落地/i.test(p.tag) && p.detour === 'relay-common')
    i.outbounds.push(...getTags(commonProxies))
  }
  if (i.tag === 'exit-warp') {
    const warpProxies = regularProxies.filter(p => /落地/i.test(p.tag) && p.detour === 'relay-warp')
    i.outbounds.push(...getTags(warpProxies))
  }
})

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

function getTags(proxies, regex) {
  return (regex ? proxies.filter(p => regex.test(p.tag)) : proxies).map(p => p.tag)
}
