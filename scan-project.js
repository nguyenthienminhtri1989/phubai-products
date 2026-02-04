import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// --- CẤU HÌNH ĐƯỜNG DẪN CHO ES MODULES ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CẤU HÌNH QUÉT FILE ---
// Các thư mục và file muốn BỎ QUA
const IGNORE_LIST = [
  "node_modules",
  ".next",
  ".git",
  ".vscode",
  "public",
  "package-lock.json",
  "yarn.lock",
  "README.md",
  "scan-project.js",
  ".env",
  ".env.local",
  "dist",
  "build",
];

// Các đuôi file muốn lấy code
const ALLOW_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".css",
  ".prisma",
  ".json",
  ".md",
  ".mjs",
];

const outputFile = "FULL_SOURCE_CODE.txt";
let content = "--- PROJECT SOURCE CODE ---\n\n";

function scanDirectory(dir) {
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch (err) {
    console.error(`Không thể đọc thư mục: ${dir}`);
    return;
  }

  files.forEach((file) => {
    const fullPath = path.join(dir, file);
    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch (err) {
      return; // Bỏ qua nếu lỗi
    }

    if (IGNORE_LIST.includes(file)) return;

    if (stat.isDirectory()) {
      scanDirectory(fullPath);
    } else {
      const ext = path.extname(file);
      if (ALLOW_EXTENSIONS.includes(ext)) {
        // Chỉ lấy code quan trọng: src, prisma, và các file config gốc
        if (
          fullPath.includes("src") ||
          fullPath.includes("prisma") ||
          file === "package.json" ||
          file === "next.config.mjs" ||
          file === "next.config.js"
        ) {
          console.log(`Đang đọc: ${fullPath}`);
          try {
            const fileContent = fs.readFileSync(fullPath, "utf8");
            content += `\n\n================================================================================\n`;
            content += `FILE START: ${fullPath}\n`;
            content += `================================================================================\n`;
            content += fileContent;
            content += `\n\n--- FILE END: ${fullPath} ---\n`;
          } catch (readErr) {
            console.error(`Lỗi đọc file: ${fullPath}`);
          }
        }
      }
    }
  });
}

console.log("🚀 Đang bắt đầu quét toàn bộ dự án...");
scanDirectory(__dirname);
fs.writeFileSync(outputFile, content);
console.log(`\n✅ HOÀN TẤT! Toàn bộ code đã được lưu vào file: ${outputFile}`);
