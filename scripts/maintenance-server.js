// Server siêu nhẹ chạy tạm trên port 3001 trong khi đang deploy.
// Cloudflare Tunnel vẫn route tới port 3001 nên user luôn nhận được trang maintenance,
// không thấy lỗi 502/523 từ Cloudflare nữa.
//
// Chỉ dùng module built-in của Node (http, fs, path) — không cần npm install.

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3001);
const HTML_PATH = path.join(process.cwd(), "public", "maintenance.html");

let HTML;
try {
  HTML = fs.readFileSync(HTML_PATH, "utf-8");
} catch (e) {
  HTML =
    "<!doctype html><html><head><meta charset='utf-8'><title>Đang cập nhật</title></head>" +
    "<body style='font-family:sans-serif;text-align:center;padding:60px'>" +
    "<h1>Đang cập nhật...</h1><p>Vui lòng quay lại sau giây lát.</p>" +
    "<script>setTimeout(()=>location.reload(),10000)</script>" +
    "</body></html>";
}

const server = http.createServer((req, res) => {
  const url = req.url || "/";

  // Để client polling của trang maintenance vẫn hoạt động: trả về { active: true }
  if (url.startsWith("/api/maintenance")) {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    });
    res.end(JSON.stringify({ active: true }));
    return;
  }

  // Mọi request khác → trả trang maintenance (200 để Cloudflare không can thiệp)
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
  });
  res.end(HTML);
});

server.listen(PORT, () => {
  console.log(`[maintenance-server] listening on port ${PORT}`);
});

// Cho phép graceful shutdown khi deploy.yml gửi tín hiệu kill
process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
