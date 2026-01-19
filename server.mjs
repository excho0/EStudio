import { createServer } from "http";
import next from "next";
import { Server } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT || 3000);
const app = next({ dev, hostname: "0.0.0.0", port });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    const httpServer = createServer((req, res) => {
      handle(req, res);
    });

    const io = new Server(httpServer, {
      path: "/api/socket",
      addTrailingSlash: false,
    });

    globalThis.io = io;

    io.on("connection", (socket) => {
      socket.emit("content:update", { type: "connected" });
    });

    httpServer.listen(port, () => {
      console.log(`> Ready on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start server", error);
    process.exit(1);
  });
