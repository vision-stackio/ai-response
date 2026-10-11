import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { routeAgent } from './router';
import { saveHistoryRecord, printHistory } from './history';

const TARGET_FOLDER = path.join(process.cwd(), 'target-files');

function checkApiKey() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    const platform = os.platform();
    
    console.error("\n❌ [Configuration Error] GEMINI_API_KEY is missing or empty.");
    console.log("----------------------------------------------------------------");
    console.log("👉 Step 1: Get your free Google AI Studio API key here:");
    console.log("   https://aistudio.google.com/\n");
    console.log("👉 Step 2: Provide your API key using one of these methods:\n");
    
    console.log("   Method A (Recommended): Create a file named '.env' in your project root containing:");
    console.log("   GEMINI_API_KEY=your_api_key_here\n");
    
    console.log("   Method B: Set it directly in your terminal session:");
    if (platform === 'win32') {
      console.log("   • PowerShell : $env:GEMINI_API_KEY=\"your_api_key_here\"");
      console.log("   • Command Prompt (CMD) : set GEMINI_API_KEY=your_api_key_here");
    } else {
      console.log("   • Linux/macOS : export GEMINI_API_KEY=\"your_api_key_here\"");
    }
    console.log("----------------------------------------------------------------\n");
    process.exit(1);
  }
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.mp4': return 'video/mp4';
    case '.mov': return 'video/quicktime';
    case '.txt':
    case '.md':
    case '.csv': return 'text/plain';
    case '.json': return 'application/json';
    default: return 'application/octet-stream';
  }
}

async function main() {
  // Validate API key presence with smart OS recommendations
  checkApiKey();

  if (!fs.existsSync(TARGET_FOLDER)) {
    fs.mkdirSync(TARGET_FOLDER, { recursive: true });
    console.log(`📁 Created folder: ${TARGET_FOLDER}`);
    console.log("Please drop a file (image, video, or text document) inside 'target-files/' and run again.");
    return;
  }

  const files = fs.readdirSync(TARGET_FOLDER).filter(f => !f.startsWith('.'));
  if (files.length === 0) {
    console.log(`📂 The 'target-files/' directory is empty.`);
    console.log("Please add a sample file and re-run.");
    printHistory();
    return;
  }

  // Processing the first available file in the folder
  const targetFile = files[0];
  const filePath = path.join(TARGET_FOLDER, targetFile);
  const mimeType = getMimeType(filePath);

  console.log(`\n🔍 Multi-Agent Search Engine Active`);
  console.log(`📄 Scanning File: ${targetFile} | Detected MIME Type: ${mimeType}`);

  // Intelligently route file to the right agent
  const selectedAgent = routeAgent(mimeType);
  console.log(`🤖 Agent Router: Assigned to [${selectedAgent.name}]`);

  try {
    const startTime = Date.now();
    const resultOutput = await selectedAgent.process(filePath, mimeType);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n========================================`);
    console.log(`📌 TERMINAL OUTPUT RESULT (${targetFile})`);
    console.log(`========================================`);
    console.log(resultOutput);
    console.log(`========================================`);
    console.log(`⏱️ Query completed in ${duration}s using ${selectedAgent.name}`);

    // Log to query history file
    saveHistoryRecord({
      timestamp: new Date().toLocaleString(),
      fileName: targetFile,
      fileType: mimeType,
      agentUsed: selectedAgent.name,
      output: resultOutput
    });

  } catch (error: any) {
    console.error(`❌ Error executing agent process:`, error.message || error);
  }

  printHistory();
}

main();
