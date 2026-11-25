import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const username = process.argv[2] || process.env.GITHUB_USER;
  const token = process.argv[3] || process.env.GITHUB_TOKEN;

  if (!username || !token) {
    console.error('Usage: node publish_release.js <username> <github_token>');
    process.exit(1);
  }

  const repoName = 'EdgeDrop-Mod';
  const headers = {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${token}`,
    'User-Agent': 'EdgeDrop-Mod-Publisher',
    'X-GitHub-Api-Version': '2022-11-28'
  };

  console.log(`[1/5] Checking / Creating GitHub repository '${username}/${repoName}'...`);
  let repoRes = await fetch(`https://api.github.com/repos/${username}/${repoName}`, { headers });
  
  if (repoRes.status === 404) {
    console.log(`Creating new public repository '${repoName}' on GitHub...`);
    const createRes = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: repoName,
        private: false,
        description: 'Enhanced community mod of the EdgeDrop clipboard sidebar for Windows',
        has_issues: true,
        has_projects: false,
        has_wiki: false
      })
    });
    if (!createRes.ok) {
      const err = await createRes.text();
      throw new Error(`Failed to create repository: ${createRes.status} ${err}`);
    }
    console.log(`✔ Repository created successfully!`);
  } else if (repoRes.ok) {
    console.log(`✔ Repository '${username}/${repoName}' already exists.`);
  } else {
    const err = await repoRes.text();
    throw new Error(`Failed to check repository: ${repoRes.status} ${err}`);
  }

  console.log('[2/5] Initializing commit and pushing source code...');
  const run = (cmd) => execSync(cmd, { cwd: __dirname, stdio: 'inherit' });

  try { run(`git config user.name "${username}"`); } catch {}
  try { run(`git config user.email "${username}@users.noreply.github.com"`); } catch {}
  run('git add .');
  try {
    run('git commit -m "feat: initial release of EdgeDrop Mod (v0.4.0)"');
  } catch {
    console.log('(Commit already up to date or empty)');
  }

  run('git branch -M main');
  try { run('git remote remove origin'); } catch {}
  run(`git remote add origin https://${username}:${token}@github.com/${username}/${repoName}.git`);
  run('git push -u origin main --force');
  
  // Sanitize remote so token is never stored in local .git/config
  run(`git remote set-url origin https://github.com/${username}/${repoName}.git`);
  console.log('✔ Pushed codebase to GitHub main branch cleanly!');

  console.log('[3/5] Creating GitHub Release v0.4.0...');
  const releaseBody = `## EdgeDrop Mod v0.4.0 🚀

Community enhancement release for the EdgeDrop clipboard sidebar for Windows.

### ✨ What's New & Fixed
- **📋 Multi-Paste Persistence:** Keeps sidebar open during sequential pastes without auto-dismissal.
- **🎯 Cursor-Presence Lock:** Keeps sidebar open while cursor remains inside bounds.
- **⏳ Anti-Flicker Debounce:** 300ms exit grace period prevents accidental dismissal.
- **🔕 Silent Auto-Start on Login:** Native Windows registry integration (\`--hidden\`).
- **🛡️ Clean Toggles:** Immediate dismissal via \`Esc\` or second \`Alt + V\`.

### 📦 Downloads
- **\`EdgeDrop-Mod-Setup.msi\`**: Native Windows Installer with Start Menu shortcut.
- **\`EdgeDrop-Mod-v0.4.0-win-x64.zip\`**: Portable archive (extract & run).`;

  const relRes = await fetch(`https://api.github.com/repos/${username}/${repoName}/releases`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tag_name: 'v0.4.0',
      target_commitish: 'main',
      name: 'EdgeDrop Mod v0.4.0 - Community Release',
      body: releaseBody,
      draft: false,
      prerelease: false
    })
  });

  let releaseData;
  if (relRes.status === 422) {
    // Release might already exist, fetch existing
    console.log('Release tag v0.4.0 already exists, retrieving existing release...');
    const getRel = await fetch(`https://api.github.com/repos/${username}/${repoName}/releases/tags/v0.4.0`, { headers });
    releaseData = await getRel.json();
  } else if (!relRes.ok) {
    const err = await relRes.text();
    throw new Error(`Failed to create release: ${relRes.status} ${err}`);
  } else {
    releaseData = await relRes.json();
  }

  const uploadUrlTemplate = releaseData.upload_url;
  const baseUrl = uploadUrlTemplate.split('{')[0];
  console.log(`✔ Release created: ${releaseData.html_url}`);

  const assets = [
    { name: 'EdgeDrop-Mod-Setup.msi', path: path.join(__dirname, 'dist', 'EdgeDrop-Mod-Setup.msi'), type: 'application/x-msi' },
    { name: 'EdgeDrop-Mod-v0.4.0-win-x64.zip', path: path.join(__dirname, 'dist', 'EdgeDrop-Mod-v0.4.0-win-x64.zip'), type: 'application/zip' }
  ];

  for (const asset of assets) {
    if (!fs.existsSync(asset.path)) {
      console.warn(`Warning: File ${asset.path} not found. Skipping.`);
      continue;
    }
    const fileSize = fs.statSync(asset.path).size;
    console.log(`[4/5] Uploading ${asset.name} (${(fileSize / (1024 * 1024)).toFixed(2)} MB)...`);

    // Delete asset if it already exists in the release
    if (releaseData.assets) {
      const existing = releaseData.assets.find(a => a.name === asset.name);
      if (existing) {
        console.log(`Deleting existing asset ${asset.name}...`);
        await fetch(existing.url, { method: 'DELETE', headers });
      }
    }

    const fileStream = fs.readFileSync(asset.path);
    const uploadRes = await fetch(`${baseUrl}?name=${asset.name}`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': asset.type,
        'Content-Length': String(fileSize)
      },
      body: fileStream
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      console.error(`Failed to upload ${asset.name}: ${uploadRes.status} ${err}`);
    } else {
      console.log(`✔ Successfully uploaded ${asset.name}`);
    }
  }

  console.log('\n======================================================');
  console.log('🎉 PUBLICATION COMPLETE!');
  console.log(`Repository: https://github.com/${username}/${repoName}`);
  console.log(`Releases:   ${releaseData.html_url}`);
  console.log('======================================================\n');
}

main().catch(err => {
  console.error('Error during publishing:', err);
  process.exit(1);
});
