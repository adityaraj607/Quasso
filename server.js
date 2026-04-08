const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = 3000;
const OLLAMA_HOST = 'http://localhost:11434';

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Proxy: POST /api/translate
  if (req.method === 'POST' && req.url === '/api/translate') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      let prompt;
      try { prompt = JSON.parse(body).prompt; } catch { prompt = body; }

      const payload = JSON.stringify({ model: 'quasso', prompt, stream: false });
      const ollamaUrl = new URL('/api/generate', OLLAMA_HOST);

      const proxyReq = http.request({
        hostname: ollamaUrl.hostname,
        port: ollamaUrl.port || 11434,
        path: ollamaUrl.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      }, (proxyRes) => {
        let data = '';
        proxyRes.on('data', chunk => data += chunk);
        proxyRes.on('end', () => {
          res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
          res.end(data);
        });
      });

      proxyReq.on('error', (err) => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Cannot reach Ollama. Is it running? ' + err.message }));
      });

      proxyReq.write(payload);
      proxyReq.end();
    });
    return;
  }

  // Word meaning: POST /api/word-meaning 
  if (req.method === 'POST' && req.url === '/api/word-meaning') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      let word;
      try { word = JSON.parse(body).word; } catch { word = body; }

      const meaningPrompt = `You are a French language tutor. For the French word "${word}", provide a concise JSON response with exactly these fields:
{
  "word": "${word}",
  "partOfSpeech": "(noun/verb/adjective/adverb/etc)",
  "meaning": "short English definition",
  "example": "a short French example sentence using this word",
  "exampleTranslation": "English translation of the example"
}
Respond with ONLY the JSON object, no extra text.`;

      const payload = JSON.stringify({ model: 'quasso', prompt: meaningPrompt, stream: false });
      const ollamaUrl = new URL('/api/generate', OLLAMA_HOST);

      const proxyReq = http.request({
        hostname: ollamaUrl.hostname,
        port: ollamaUrl.port || 11434,
        path: ollamaUrl.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      }, (proxyRes) => {
        let data = '';
        proxyRes.on('data', chunk => data += chunk);
        proxyRes.on('end', () => {
          try {
            const ollamaData = JSON.parse(data);
            const rawResponse = (ollamaData.response || '').trim();
            // Try to extract JSON from the response
            const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const wordData = JSON.parse(jsonMatch[0]);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, data: wordData }));
            } else {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, data: { word, meaning: rawResponse, partOfSpeech: '', example: '', exampleTranslation: '' } }));
            }
          } catch (e) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Could not parse response' }));
          }
        });
      });

      proxyReq.on('error', (err) => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Cannot reach Ollama. Is it running? ' + err.message }));
      });

      proxyReq.write(payload);
      proxyReq.end();
    });
    return;
  }

  // French Culture Chatbot: POST /api/culture-chat
  if (req.method === 'POST' && req.url === '/api/culture-chat') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      let userMessage;
      try { userMessage = JSON.parse(body).message; } catch { userMessage = body; }

      const culturePrompt = `You are an expert on French culture, history, traditions, cuisine, and lifestyle. Provide informative and engaging answers about all aspects of French culture. Keep responses concise (3-4 sentences) but informative. Be friendly and encouraging.

User question: ${userMessage}

Provide a helpful answer about French culture:`;

      const payload = JSON.stringify({ model: 'quasso', prompt: culturePrompt, stream: false });
      const ollamaUrl = new URL('/api/generate', OLLAMA_HOST);

      const proxyReq = http.request({
        hostname: ollamaUrl.hostname,
        port: ollamaUrl.port || 11434,
        path: ollamaUrl.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      }, (proxyRes) => {
        let data = '';
        proxyRes.on('data', chunk => data += chunk);
        proxyRes.on('end', () => {
          try {
            const ollamaData = JSON.parse(data);
            const response = (ollamaData.response || '').trim().replace(/\n/g, ' ').replace(/\s+/g, ' ');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ response: response || 'No response generated' }));
          } catch (e) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ response: 'Could not process response' }));
          }
        });
      });

      proxyReq.on('error', (err) => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Cannot reach model. Is it running? ' + err.message }));
      });

      proxyReq.write(payload);
      proxyReq.end();
    });
    return;
  }

  // Static file serving 
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, filePath.split('?')[0]);

  const extMap = { '.html':'text/html', '.css':'text/css', '.js':'application/javascript', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml' };
  const ext = path.extname(filePath);
  const contentType = extMap[ext] || 'text/plain';

  fs.readFile(filePath, (err, content) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`\n✅  Quasso is live → http://localhost:${PORT}\n`);
});
