// scripts/upload_original_demo_to_drive.mjs
import fs from 'node:fs';
import path from 'node:path';
import { callDriveApi } from '../drive.js';
import { db } from '../db.js';

const ARTIFACTS_DIR = 'C:/Users/Administrator/.gemini/antigravity/brain/5bc32ce4-3313-4fdd-8e31-f6775c20730e';
const PROJECT_ROOT = 'E:/gemini-live-dashboard';

async function uploadToDrive() {
  console.log('🚀 Step 1: Uploading demo_original_branch_showcase.mp4 to Google Drive...');
  const mp4Path = path.join(PROJECT_ROOT, 'demo_original_branch_showcase.mp4');
  if (!fs.existsSync(mp4Path)) {
    throw new Error('Video file not found at: ' + mp4Path);
  }

  const mp4Buffer = fs.readFileSync(mp4Path);
  console.log(`📦 Video file size: ${(mp4Buffer.length / 1024 / 1024).toFixed(2)} MB`);

  const videoUploadRes = await callDriveApi({
    action: 'upload',
    name: 'فيديو_عرض_الفرع_الأصلي_1080p_منصة_تجار_ونورة.mp4',
    mime: 'video/mp4',
    category: 'التقارير والعروض',
    description: 'فيديو العرض المرئي الشامل بدقة 1080p للفرع الأصلي (main) يستعرض كافة المزايا والوظائف الأساسية لمنصة تجار ونورة',
    data: mp4Buffer.toString('base64'),
  }, { timeout: 90000, retries: 2 });

  if (!videoUploadRes?.ok || !videoUploadRes?.file?.id) {
    throw new Error('Failed to upload video to Google Drive: ' + JSON.stringify(videoUploadRes));
  }

  const videoFileId = videoUploadRes.file.id;
  const videoDriveUrl = videoUploadRes.file.url;
  const videoPreviewUrl = `https://drive.google.com/file/d/${videoFileId}/preview`;
  const videoDownloadUrl = `https://drive.google.com/uc?export=download&id=${videoFileId}`;

  console.log('✅ Video uploaded successfully!');
  console.log('   File ID:', videoFileId);
  console.log('   Drive URL:', videoDriveUrl);
  console.log('   Preview URL:', videoPreviewUrl);

  // Step 2: Update demo_original_branch_player.html to stream from Google Drive
  console.log('\n🚀 Step 2: Updating HTML player to stream directly from Google Drive...');
  const playerPath = path.join(PROJECT_ROOT, 'demo_original_branch_player.html');
  let playerHtml = fs.readFileSync(playerPath, 'utf8');

  // Replace video section with Google Drive streaming iframe and mode switcher
  const drivePlayerSnippet = `
          <!-- مشغل Google Drive السحابي الافتراضي والأساسي -->
          <iframe id="drivePlayer"
            src="https://drive.google.com/file/d/${videoFileId}/preview"
            allow="autoplay; fullscreen"
            allowfullscreen
            title="فيديو عرض الفرع الأصلي 1080p - منصة تجار ونورة"
            style="width: 100%; height: 100%; border: none; border-radius: 14px; display: block;">
          </iframe>

          <!-- مشغل الفيديو المحلي البديل -->
          <video id="demoVideo" controls preload="metadata" style="display: none; width: 100%; height: 100%;">
            <source src="demo_original_branch_showcase.mp4" type="video/mp4">
            متصفحك لا يدعم تشغيل الفيديو.
          </video>`;

  playerHtml = playerHtml.replace(/<div class="video-wrapper">[\s\S]*?<\/div>\s*<div class="video-controls-bar">/, `<div class="video-wrapper">${drivePlayerSnippet}\n        </div>\n\n        <div class="video-controls-bar">`);

  // Update download and cloud buttons
  const cloudButtonsSnippet = `
          <div class="download-btns">
            <a href="${videoDriveUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-gold">
              <span>☁️ فتح في Google Drive</span>
            </a>
            <a href="${videoDownloadUrl}" target="_blank" rel="noopener noreferrer" class="btn">
              <span>📥 تنزيل من السحابة</span>
            </a>
            <a href="demo_original_branch_showcase.mp4" download class="btn" style="background: rgba(14, 34, 56, 0.7);">
              <span>💾 تنزيل محلي (MP4)</span>
            </a>
          </div>`;

  playerHtml = playerHtml.replace(/<div class="download-btns">[\s\S]*?<\/div>/, cloudButtonsSnippet.trim());

  // Update video specs
  playerHtml = playerHtml.replace(/<span>🌿 الفرع: <b>main \(بدون أي تعديل\)<\/b><\/span>/, `<span>☁️ المصدر: <b>Google Drive Cloud Stream</b></span>\n            <span>🌿 الفرع: <b>main</b></span>`);

  // Add Cloud badge
  playerHtml = playerHtml.replace(/<div class="badge badge-branch">/, `<div class="badge" style="background: rgba(89, 196, 143, 0.12); border-color: var(--green); color: var(--green);">\n          <span>☁️ بث مباشر سحابي من Google Drive</span>\n        </div>\n        <div class="badge badge-branch">`);

  // Save updated player
  fs.writeFileSync(playerPath, playerHtml, 'utf8');
  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'demo_original_branch_player.html'), playerHtml, 'utf8');
  console.log('✅ Updated demo_original_branch_player.html saved locally and to artifacts.');

  // Step 3: Upload updated demo_original_branch_player.html to Google Drive
  console.log('\n🚀 Step 3: Uploading demo_original_branch_player.html to Google Drive...');
  const htmlBuffer = fs.readFileSync(playerPath);
  const htmlUploadRes = await callDriveApi({
    action: 'upload',
    name: 'العرض_المرئي_للفرع_الأصلي_منصة_تجار_ونورة.html',
    mime: 'text/html',
    category: 'التقارير والعروض',
    description: 'مشغل العرض المرئي التفاعلي للفرع الأصلي (main) متصل سحابياً مع Google Drive لبث الفيديو وملاحة الفصول',
    data: htmlBuffer.toString('base64'),
  }, { timeout: 60000, retries: 2 });

  if (!htmlUploadRes?.ok || !htmlUploadRes?.file?.id) {
    throw new Error('Failed to upload HTML player to Google Drive: ' + JSON.stringify(htmlUploadRes));
  }

  const htmlFileId = htmlUploadRes.file.id;
  const htmlDriveUrl = htmlUploadRes.file.url;

  console.log('✅ HTML Player uploaded successfully!');
  console.log('   File ID:', htmlFileId);
  console.log('   Drive URL:', htmlDriveUrl);

  // Step 4: Register both files in local documents table for Nora
  try {
    const docQuery = db.prepare('INSERT INTO documents (name, category, summary, drive_id, drive_url, uploaded_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\'))');
    await docQuery.run('فيديو_عرض_الفرع_الأصلي_1080p_منصة_تجار_ونورة.mp4', 'التقارير والعروض', 'فيديو العرض المرئي الشامل للفرع الأصلي بدقة 1080p', videoFileId, videoDriveUrl);
    await docQuery.run('العرض_المرئي_للفرع_الأصلي_منصة_تجار_ونورة.html', 'التقارير والعروض', 'مشغل العرض المرئي التفاعلي للفرع الأصلي (main)', htmlFileId, htmlDriveUrl);
    console.log('✅ Registered files in documents table for Nora.');
  } catch (dbErr) {
    console.warn('Note: db registration skipped:', dbErr.message);
  }

  console.log('\n🎉 ALL FILES UPLOADED TO GOOGLE DRIVE SUCCESSFULLY!');
  return {
    video: { id: videoFileId, url: videoDriveUrl, preview: videoPreviewUrl, download: videoDownloadUrl },
    html: { id: htmlFileId, url: htmlDriveUrl }
  };
}

uploadToDrive().then(res => {
  console.log('\nFinal Summary:', JSON.stringify(res, null, 2));
}).catch(err => {
  console.error('Fatal Upload Error:', err);
  process.exit(1);
});
