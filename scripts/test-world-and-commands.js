/*
  Test script: generates a world via the deployed Render API and then runs a few user commands
  Outputs concise logs to stdout. No secrets required locally; uses Render's server-side env.
*/

const fetch = global.fetch || require('node-fetch');

(async () => {
  const API_BASE = process.env.API_BASE || 'https://grue-is.onrender.com';
  const userId = `test-${Date.now().toString(36)}`;
  const name = 'Explorer';
  const theme = 'fantasy';

  function log(title, obj) {
    console.log(`\n=== ${title} ===`);
    if (typeof obj === 'string') console.log(obj);
    else console.log(JSON.stringify(obj, null, 2));
  }

  try {
    // 1) Create world
    const genResp = await fetch(`${API_BASE}/v2/api/generate-world`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, name, theme })
    });

    const genText = await genResp.text();
    let genJson;
    try { genJson = JSON.parse(genText); } catch { genJson = { raw: genText }; }

    log('World Generation HTTP', { status: genResp.status, ok: genResp.ok });
    log('World Generation Summary', {
      success: genJson.success,
      worldId: genJson.worldId,
      title: genJson.worldData?.name || genJson.data?.worldOverview?.title,
      rooms: genJson.worldData?.rooms?.length,
      startingRoom: genJson.gameState?.currentRoom
    });

    if (!genResp.ok || !genJson.success) {
      log('World Generation Error', genJson);
      process.exit(1);
    }

    const worldId = genJson.worldId;
    let gameState = genJson.gameState;
    const worldData = genJson.worldData;

    // 2) Define a series of user commands
    const commands = [
      'look around',
      'examine items',
      'talk to someone',
      'go north',
      'inventory'
    ];

    for (const command of commands) {
      const cmdResp = await fetch(`${API_BASE}/v2/api/process-command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          worldId,
          command,
          gameState,
          worldData,
          conversationHistory: []
        })
      });

      const cmdText = await cmdResp.text();
      let cmdJson;
      try { cmdJson = JSON.parse(cmdText); } catch { cmdJson = { raw: cmdText }; }

      log('Command Result', {
        command,
        http: { status: cmdResp.status, ok: cmdResp.ok },
        success: cmdJson.success,
        message: cmdJson.message?.slice(0, 400) || cmdJson.raw?.slice(0, 400)
      });

      if (cmdResp.ok && cmdJson.success) {
        gameState = cmdJson.gameState || gameState;
      } else {
        log('Command Error Detail', cmdJson);
      }
    }

    console.log('\n=== Test Complete ===');
  } catch (err) {
    log('Unexpected Error', { message: err.message, stack: err.stack });
    process.exit(1);
  }
})();
