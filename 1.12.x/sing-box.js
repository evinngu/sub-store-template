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
try {
  rawProxies = await produceArtifact({
    name,
    type: /^1$|col/i.test(type) ? 'collection' : 'subscription',
    platform: 'clash',
    produceType: 'internal',
  })
} catch (e) {
  // Ignore
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
    let endpoint = { ...p }
    
    // 1. Rebuild endpoints schema from Clash raw data
    endpoint.system = true;
    let ifaceName = "wg-" + Math.random().toString(36).substring(2, 6);
    endpoint.name = ifaceName;
    if (endpoint.detour) delete endpoint.detour;

    // Address
    endpoint.address = []
    if (src.ip) endpoint.address.push(src.ip)
    if (src.ipv6) endpoint.address.push(src.ipv6)
    if (src.local_address && Array.isArray(src.local_address)) {
        endpoint.address.push(...src.local_address)
    }

    // Private Key
    if (src['private-key']) {
        endpoint.private_key = src['private-key']
    }
    
    // Peers
    let peersConfig = []
    let sourcePeers = src.peers || p.peers;
    if (sourcePeers && Array.isArray(sourcePeers) && sourcePeers[0] && (sourcePeers[0].server || sourcePeers[0].address || sourcePeers[0].public_key || sourcePeers[0]['public-key'])) {
        sourcePeers.forEach(peer => {
            peersConfig.push({
                address: peer.server || peer.address || src.server || p.server,
                port: peer.port || peer.server_port || src.port || src.server_port || p.port || p.server_port,
                public_key: peer['public-key'] || peer.public_key || src.peer_public_key || p.peer_public_key,
                pre_shared_key: peer['pre-shared-key'] || peer.pre_shared_key || src.pre_shared_key || p.pre_shared_key,
                allowed_ips: peer['allowed-ips'] || peer.allowed_ips || src.allowed_ips || p.allowed_ips || ["0.0.0.0/0"],
                reserved: peer.reserved || src.reserved || p.reserved
            })
        })
    } else if (p.server || src.server) {
        peersConfig.push({
            address: src.server || p.server,
            port: src.server_port || src.port || p.server_port || p.port,
            public_key: src.peer_public_key || src['peer-public-key'] || p.peer_public_key || p['peer-public-key'],
            pre_shared_key: src.pre_shared_key || src['pre-shared-key'] || p.pre_shared_key || p['pre-shared-key'],
            allowed_ips: src.allowed_ips || src['allowed-ips'] || p.allowed_ips || p['allowed-ips'] || ["0.0.0.0/0"],
            reserved: src.reserved || p.reserved
        })
    }
    endpoint.peers = peersConfig

    // Clean up Clash fields
    delete endpoint.ip
    delete endpoint.ipv6
    delete endpoint['private-key']
    delete endpoint.udp
    delete endpoint.dns
    delete endpoint['dialer-proxy']
    delete endpoint['remote-dns-resolve']
    delete endpoint.server
    delete endpoint.server_port
    delete endpoint.endpoints
    delete endpoint.peer_public_key
    delete endpoint['peer-public-key']
    delete endpoint.pre_shared_key
    delete endpoint['pre-shared-key']
    delete endpoint.reserved
    delete endpoint.allowed_ips
    delete endpoint['allowed-ips']
    delete endpoint.local_address

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
