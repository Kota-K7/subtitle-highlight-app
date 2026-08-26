const fs = require('fs');
const path = require('path');
const https = require('https');

const MODEL_NAME = 'Xenova/whisper-base';
const BASE_URL = `https://huggingface.co/${MODEL_NAME}/resolve/main/`;
const DEST_DIR = path.join(__dirname, '..', 'public', 'models', MODEL_NAME);

const files = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx'
];

function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return true;
  }
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname);
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    ensureDirectoryExistence(dest);
    const file = fs.createWriteStream(dest);
    
    const request = https.get(url, (response) => {
      // Handle HTTP redirects (301, 302, 307, 308)
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlink(dest, () => {});
        const resolvedRedirect = new URL(response.headers.location, url).toString();
        downloadFile(resolvedRedirect, dest).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlink(dest, () => {});
        reject(new Error(`Failed to download ${url}: HTTP Status ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve());
      });
    });

    request.on('error', (err) => {
      file.close();
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function start() {
  console.log(`========================================================`);
  console.log(`Downloading Whisper ONNX Model: ${MODEL_NAME}`);
  console.log(`Target Directory: ${DEST_DIR}`);
  console.log(`========================================================\n`);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fileUrl = `${BASE_URL}${file}`;
    const destPath = path.join(DEST_DIR, file);

    console.log(`[${i + 1}/${files.length}] Downloading ${file}...`);
    try {
      const startTime = Date.now();
      await downloadFile(fileUrl, destPath);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`    Success! Saved in ${elapsed}s\n`);
    } catch (err) {
      console.error(`    Error downloading ${file}: ${err.message}\n`);
      process.exit(1);
    }
  }

  console.log(`========================================================`);
  console.log(`Whisper Model Download Complete!`);
  console.log(`The application will now load the model locally/offline.`);
  console.log(`========================================================`);
}

start();
