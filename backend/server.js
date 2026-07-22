require("dotenv").config();

const http = require("http");
const app = require("./src/app");

const PORT = process.env.PORT || 3001;
const server = http.createServer(app);

server.keepAliveTimeout = Number(process.env.HTTP_KEEP_ALIVE_TIMEOUT_MS || 65000);
server.headersTimeout = Number(process.env.HTTP_HEADERS_TIMEOUT_MS || 66000);
server.requestTimeout = Number(process.env.HTTP_REQUEST_TIMEOUT_MS || 120000);

server.listen(PORT, () => {
  console.log(`Servidor backend operativo en puerto ${PORT}`);
});

function shutdown(signal) {
  console.log(`${signal} recibido. Cerrando backend...`);
  server.close(() => {
    console.log("Servidor HTTP cerrado.");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
