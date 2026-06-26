// momo-adapter.js
// 专门用于 luci-app-momo (OpenWrt 平台) 的后处理脚本
// 请在 Sub-Store 的脚本栏位中，将其配置在 sing-box.js 的下方（即作为第二个脚本执行）

let config = JSON.parse($files[0]);

// 1. 完全重写 Inbounds 以适配 Momo 的要求与监听端口
config.inbounds = [
  {
    "tag": "dns-in",
    "type": "direct",
    "listen": "::",
    "listen_port": 1053
  },
  {
    "tag": "redirect-in",
    "type": "redirect",
    "listen": "::",
    "listen_port": 7890
  },
  {
    "tag": "tproxy-in",
    "type": "tproxy",
    "listen": "::",
    "listen_port": 7891
  },
  {
    "tag": "tun-in",
    "type": "tun",
    "interface_name": "momo",
    "stack": "mixed",
    "mtu": 1500,
    "address": [
      "172.31.0.1/30",
      "fdfe:dcba:9876::1/126"
    ],
    "auto_route": true,
    "strict_route": true,
    "auto_redirect": true
  }
];

// 2. 修正 DNS Tag 及路由引用
// Momo 强制要求 Fake-IP 劫持的 DNS server 必须被命名为 `fake-ip-dns-server`
let oldFakeIpTag = null;

if (config.dns && Array.isArray(config.dns.servers)) {
  config.dns.servers.forEach(s => {
    // 识别出用于 fakeip 的服务器（现在 tag 为 'remote'）
    if (s.type === 'fakeip' || s.tag === 'remote') {
      oldFakeIpTag = s.tag;
      s.tag = 'fake-ip-dns-server';
    }
  });
}

// 对应将所有涉及防泄漏、全局模式的请求服务器指引过去
if (oldFakeIpTag && config.dns && Array.isArray(config.dns.rules)) {
  config.dns.rules.forEach(r => {
    if (r.server === oldFakeIpTag) {
      r.server = 'fake-ip-dns-server';
    }
  });
}

// 3. 将最终修改过的配置生成 JSON
$content = JSON.stringify(config, null, 2);
