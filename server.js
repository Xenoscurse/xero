const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Store embeds in memory (for Vercel serverless, we'll use a simple JSON file)
const dataFile = path.join(__dirname, 'embeds.json');
let embeds = [];

if (fs.existsSync(dataFile)) {
  try {
    embeds = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  } catch(e) { embeds = []; }
}

function saveEmbeds() {
  fs.writeFileSync(dataFile, JSON.stringify(embeds, null, 2));
}

// API: Get all embeds
app.get('/api/embeds', (req, res) => {
  res.json(embeds);
});

// API: Add or update embed
app.post('/api/embeds', (req, res) => {
  const { id, title, embedCode, posterUrl } = req.body;
  if (!id) {
    const newId = Date.now().toString();
    embeds.push({ id: newId, title, embedCode, posterUrl });
  } else {
    const index = embeds.findIndex(e => e.id === id);
    if (index !== -1) {
      embeds[index] = { id, title, embedCode, posterUrl };
    }
  }
  saveEmbeds();
  res.json({ success: true, id: id || embeds[embeds.length-1].id });
});

// API: Delete embed
app.delete('/api/embeds/:id', (req, res) => {
  embeds = embeds.filter(e => e.id !== req.params.id);
  saveEmbeds();
  res.json({ success: true });
});

// The embed player page - clean, no branding
app.get('/embed/:id', (req, res) => {
  const embed = embeds.find(e => e.id === req.params.id);
  if (!embed) {
    return res.status(404).send('<h1>Embed not found</h1>');
  }
  
  // Extract src from iframe or use as-is
  let videoSrc = embed.embedCode;
  const srcMatch = embed.embedCode.match(/src=["']([^"']+)["']/);
  if (srcMatch) {
    videoSrc = srcMatch[1];
  }
  
  // Generate clean embed page - NO logos, NO branding
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${embed.title}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          background: #000; 
          overflow: hidden;
        }
        .player {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }
        iframe, video {
          width: 100%;
          height: 100%;
          border: none;
        }
      </style>
    </head>
    <body>
      <div class="player">
        <iframe src="${videoSrc}" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
      </div>
    </body>
    </html>
  `);
});

// Admin page to manage embeds
app.get('/admin', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Embed Manager</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: system-ui, -apple-system, sans-serif;
          background: #0a0a0c;
          color: #fff;
          padding: 40px;
        }
        h1 { margin-bottom: 20px; }
        .form-card {
          background: #1a1a22;
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 30px;
          border: 1px solid #2a2a30;
        }
        input, textarea {
          width: 100%;
          padding: 12px;
          margin-bottom: 16px;
          background: #0d0d12;
          border: 1px solid #2a2a30;
          border-radius: 8px;
          color: #fff;
          font-family: inherit;
        }
        button {
          background: #f47521;
          color: #fff;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
        }
        button:hover { background: #e8651a; }
        .embed-list { display: flex; flex-direction: column; gap: 12px; }
        .embed-item {
          background: #1a1a22;
          border-radius: 8px;
          padding: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border: 1px solid #2a2a30;
        }
        .embed-info { flex: 1; }
        .embed-title { font-weight: 600; margin-bottom: 4px; }
        .embed-url { font-size: 12px; color: #888; font-family: monospace; }
        .delete-btn {
          background: #e63946;
          padding: 8px 16px;
          margin-left: 12px;
        }
        .delete-btn:hover { background: #c53030; }
        .copy-btn {
          background: #2a2a30;
          margin-left: 8px;
        }
        .copy-btn:hover { background: #3a3a40; }
        .success { color: #4ade80; margin-top: 10px; }
      </style>
    </head>
    <body>
      <h1>🎬 Embed Manager</h1>
      
      <div class="form-card">
        <h2 style="margin-bottom: 16px">Add New Embed</h2>
        <input type="text" id="embedTitle" placeholder="Title (e.g., Inception)">
        <textarea id="embedCode" rows="3" placeholder="Iframe embed code or video URL"></textarea>
        <button onclick="addEmbed()">Create Embed</button>
        <div id="message"></div>
      </div>
      
      <div class="embed-list" id="embedList"></div>
      
      <script>
        async function loadEmbeds() {
          const res = await fetch('/api/embeds');
          const embeds = await res.json();
          const container = document.getElementById('embedList');
          container.innerHTML = embeds.map(e => \`
            <div class="embed-item">
              <div class="embed-info">
                <div class="embed-title">\${e.title}</div>
                <div class="embed-url">https://\${window.location.host}/embed/\${e.id}</div>
              </div>
              <div>
                <button class="copy-btn" onclick="copyUrl('\${e.id}')">Copy URL</button>
                <button class="delete-btn" onclick="deleteEmbed('\${e.id}')">Delete</button>
              </div>
            </div>
          \`).join('');
        }
        
        async function addEmbed() {
          const title = document.getElementById('embedTitle').value;
          const embedCode = document.getElementById('embedCode').value;
          
          if (!title || !embedCode) {
            alert('Please fill in both fields');
            return;
          }
          
          const res = await fetch('/api/embeds', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, embedCode })
          });
          
          if (res.ok) {
            document.getElementById('message').innerHTML = '<div class="success">✅ Embed created!</div>';
            document.getElementById('embedTitle').value = '';
            document.getElementById('embedCode').value = '';
            loadEmbeds();
            setTimeout(() => document.getElementById('message').innerHTML = '', 3000);
          }
        }
        
        async function deleteEmbed(id) {
          if (confirm('Delete this embed?')) {
            await fetch(\`/api/embeds/\${id}\`, { method: 'DELETE' });
            loadEmbeds();
          }
        }
        
        function copyUrl(id) {
          const url = \`https://\${window.location.host}/embed/\${id}\`;
          navigator.clipboard.writeText(url);
          alert('URL copied! Paste it into your Melted app');
        }
        
        loadEmbeds();
      </script>
    </body>
    </html>
  `);
});

// Redirect root to admin
app.get('/', (req, res) => {
  res.redirect('/admin');
});

app.listen(PORT, () => {
  console.log(`🎬 Embed server running on port ${PORT}`);
  console.log(`📝 Admin panel: http://localhost:${PORT}/admin`);
  console.log(`🔗 Embed URL format: http://localhost:${PORT}/embed/ID`);
});
