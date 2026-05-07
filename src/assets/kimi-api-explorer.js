// 在 Kimi 页面的浏览器控制台中运行此脚本
// 使用方法：把下面的 TOKEN 替换成你的实际 token（从 curl 的 Authorization: Bearer 后面复制）

const TOKEN = 'eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ1c2VyLWNlbnRlciIsImV4cCI6MTc3OTQyMTY3MCwiaWF0IjoxNzc2ODI5NjcwLCJqdGkiOiJkN2s0OXBrY2htdGw5YWtsNjJkMCIsInR5cCI6ImFjY2VzcyIsImFwcF9pZCI6ImtpbWkiLCJzdWIiOiJjbmsyczd1Y3A3ZjZoa3RrcnI0MCIsInNwYWNlX2lkIjoiY25rMnM3dWNwN2Y2aGt0a3JyM2ciLCJhYnN0cmFjdF91c2VyX2lkIjoiY25rMnM3dWNwN2Y2aGt0a3JyMzAiLCJzc2lkIjoiMTczMDEyNzcyNTgwODkwNTgxNiIsImRldmljZV9pZCI6Ijc1MjQ1NzIyNzQ5NjQ0NzQxMTgiLCJyZWdpb24iOiJjbiIsIm1lbWJlcnNoaXAiOnsibGV2ZWwiOjEwfX0.UV7ExvoQ0E1Bew9zAJJrtzVriznTWydWTjV472lJBZ9PBBSekAnDA-omx8hpibd18DiG5vTlh6IJxyUGLBi_xg';

(async function exploreKimiAPI() {
  if (TOKEN === 'PASTE_YOUR_TOKEN_HERE') {
    console.error('❌ 请先替换 TOKEN 为你的实际 token');
    console.log('� token 在你之前给我的 curl 里，Authorization: Bearer 后面那一长串');
    return;
  }

  let payload;
  try {
    payload = JSON.parse(atob(TOKEN.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    console.log('✅ JWT 解码成功, sub:', payload.sub);
  } catch (e) {
    console.error('❌ JWT 解码失败:', e.message);
    return;
  }

  const headers = {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
    'Accept': '*/*',
    'x-msh-device-id': payload.device_id || '',
    'x-msh-platform': 'web',
    'x-msh-session-id': payload.ssid || '',
    'x-msh-version': '1.0.0',
    'x-traffic-id': payload.sub || '',
    'x-language': 'zh-CN',
    'r-timezone': 'Asia/Shanghai',
    'Origin': 'https://www.kimi.com',
    'Referer': 'https://www.kimi.com/',
  };

  // 1. 获取对话列表
  console.log('\n--- ListChats ---');
  const listRes = await fetch('https://www.kimi.com/apiv2/kimi.chat.v1.ChatService/ListChats', {
    method: 'POST', headers,
    body: JSON.stringify({ project_id: '', page_size: 3, query: '' }),
  });
  const listData = await listRes.json();
  console.log('对话数量:', listData.chats?.length);
  if (!listData.chats?.length) { console.error('❌ 无对话'); return; }

  const chatId = listData.chats[0].id;
  console.log('测试对话:', listData.chats[0].name, chatId);

  // 2. 获取消息列表
  console.log('\n--- ListMessages ---');
  const msgsRes = await fetch('https://www.kimi.com/apiv2/kimi.gateway.chat.v1.ChatService/ListMessages', {
    method: 'POST', headers,
    body: JSON.stringify({ chat_id: chatId, page_size: 10 }),
  });
  const msgsData = await msgsRes.json();
  console.log('消息数量:', msgsData.messages?.length);

  if (!Array.isArray(msgsData.messages)) {
    console.error('❌ 无消息数组');
    return;
  }

  // 3. 打印每条消息概要
  for (const msg of msgsData.messages) {
    const blockTypes = (msg.blocks || []).map(b => {
      if (b.text) return 'text';
      if (b.think) return 'think';
      if (b.multiStage) return 'multiStage';
      if (b.stage) return 'stage';
      return 'other';
    });
    console.log(`  [${msg.role}] status=${msg.status} blocks=[${blockTypes.join(', ')}]`);
  }

  // 4. 打印 user 消息完整结构（这是我们最需要的）
  const userMsgs = msgsData.messages.filter(m => m.role === 'user');
  if (userMsgs.length > 0) {
    console.log('\n=== USER 消息完整结构 ===');
    console.log(JSON.stringify(userMsgs[0], null, 2));
  } else {
    console.log('\n⚠️ 没有找到 user 消息！');
    console.log('所有消息 role:', msgsData.messages.map(m => m.role));
  }

  // 5. 打印 assistant 消息的 blocks 结构（截断）
  const asstMsgs = msgsData.messages.filter(m => m.role === 'assistant');
  if (asstMsgs.length > 0) {
    console.log('\n=== ASSISTANT 消息 blocks 结构（截断） ===');
    const sample = JSON.parse(JSON.stringify(asstMsgs[0]));
    for (const block of (sample.blocks || [])) {
      if (block.text?.content) block.text.content = block.text.content.substring(0, 80) + '...';
      if (block.think?.content) block.think.content = block.think.content.substring(0, 80) + '...';
    }
    console.log(JSON.stringify(sample, null, 2));
  }

  // 6. 检查分页相关字段
  console.log('\n=== 分页相关字段 ===');
  const topKeys = Object.keys(msgsData);
  console.log('ListMessages 响应顶层 keys:', topKeys);
  for (const key of topKeys) {
    if (key !== 'messages') {
      console.log(`  ${key}:`, JSON.stringify(msgsData[key])?.substring(0, 100));
    }
  }

  console.log('\n✅ 探索完成！');
})();
