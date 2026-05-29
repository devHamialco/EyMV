import { defineConfig } from 'vite';
import { WebSocketServer } from 'ws';

export default defineConfig({
  server: {
    host: true, // Listen on all network interfaces (0.0.0.0) so other devices on local network can join
    port: 5173,
  },
  plugins: [
    {
      name: 'websocket-server',
      configureServer(server) {
        if (!server.httpServer) return;

        const wss = new WebSocketServer({ noServer: true });

        server.httpServer.on('upgrade', (request, socket, head) => {
          const url = new URL(request.url, `http://${request.headers.host}`);
          if (url.pathname === '/ws') {
            wss.handleUpgrade(request, socket, head, (ws) => {
              wss.emit('connection', ws, request);
            });
          }
        });

        const clients = new Map(); // clientId -> { ws, state }
        let nextClientId = 1;

        wss.on('connection', (ws, req) => {
          const clientId = nextClientId++;
          let ip = req.socket.remoteAddress;

          // Clean up loopback address representation
          if (ip === '::1' || ip === '::ffff:127.0.0.1') {
            ip = '127.0.0.1';
          }

          // Initial client state
          const clientState = {
            id: clientId,
            ip: ip,
            nombre: 'Chavo',
            animacionActual: './src/assets/ChavoParado.glb',
            isChavorumbaActive: false,
            posicion: { x: 0, y: 0, z: 0 },
            rotacion: 0
          };

          clients.set(clientId, { ws, state: clientState });
          console.log(`[Multiplayer] Cliente conectado: ${ip} (ID: ${clientId})`);

          // Send welcome packet with client state and other active clients
          ws.send(JSON.stringify({
            type: 'welcome',
            id: clientId,
            state: clientState,
            existingUsers: Array.from(clients.entries())
              .filter(([id]) => id !== clientId)
              .map(([id, data]) => data.state)
          }));

          // Notify everyone else that a new user joined
          const joinMsg = JSON.stringify({
            type: 'user_joined',
            state: clientState
          });
          for (const [id, data] of clients.entries()) {
            if (id !== clientId && data.ws.readyState === 1 /* OPEN */) {
              data.ws.send(joinMsg);
            }
          }

          // Relay updates to everyone else
          ws.on('message', (messageStr) => {
            try {
              const msg = JSON.parse(messageStr);
              if (msg.type === 'update') {
                Object.assign(clientState, msg.state);

                const updateMsg = JSON.stringify({
                  type: 'user_updated',
                  id: clientId,
                  state: clientState
                });

                for (const [id, data] of clients.entries()) {
                  if (id !== clientId && data.ws.readyState === 1 /* OPEN */) {
                    data.ws.send(updateMsg);
                  }
                }
              }
            } catch (err) {
              console.error(`Error procesando mensaje de ID ${clientId}:`, err);
            }
          });

          // Handle client disconnect
          ws.on('close', () => {
            console.log(`[Multiplayer] Cliente desconectado: ${ip} (ID: ${clientId})`);
            clients.delete(clientId);

            const leaveMsg = JSON.stringify({
              type: 'user_left',
              id: clientId
            });

            for (const [id, data] of clients.entries()) {
              if (data.ws.readyState === 1 /* OPEN */) {
                data.ws.send(leaveMsg);
              }
            }
          });

          ws.on('error', (err) => {
            console.error(`[Multiplayer] Error en conexión ID ${clientId}:`, err);
          });
        });
      }
    }
  ]
});
