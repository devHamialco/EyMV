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

        function generarPosicionReaparicion() {
          return { x: (Math.random() - 0.5) * 60, y: 0, z: (Math.random() - 0.5) * 40 };
        }

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
            rotacion: 0,
            health: 100,
            alive: true,
            lastShotTime: 0,
            ammo: 30,
            kills: 0,
            deaths: 0
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
              } else if (msg.type === 'player_shot') {
                const { targetId, damage } = msg;
                // Validation
                const target = clients.get(targetId);
                if (!target || !target.state.alive || !clientState.alive) return;
                if (targetId === clientId) return; // no self-damage
                if (Date.now() - clientState.lastShotTime < 300) return; // cooldown

              // Distance check (3D)
              const dx = clientState.posicion.x - target.state.posicion.x;
              const dy = (clientState.posicion.y || 0) - (target.state.posicion.y || 0);
              const dz = clientState.posicion.z - target.state.posicion.z;
              const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                if (dist > 100) return;

                clientState.lastShotTime = Date.now();
                target.state.health = Math.max(0, target.state.health - (damage || 20));

                // Broadcast hit
                const hitMsg = JSON.stringify({
                  type: 'player_hit',
                  shooterId: clientId,
                  targetId: targetId,
                  damage: damage || 20,
                  health: target.state.health
                });
                // Send player_damage to target
                const damageMsg = JSON.stringify({
                  type: 'player_damage',
                  health: target.state.health
                });

                for (const [id, data] of clients.entries()) {
                  if (data.ws.readyState === 1) {
                    data.ws.send(hitMsg);
                    if (id === targetId) data.ws.send(damageMsg);
                  }
                }

                // Check death
                if (target.state.health <= 0) {
                  target.state.alive = false;
                  clientState.kills++;
                  target.state.deaths++;

                  const deathMsg = JSON.stringify({
                    type: 'player_died',
                    playerId: targetId,
                    killerId: clientId
                  });
                  for (const [id, data] of clients.entries()) {
                    if (data.ws.readyState === 1) {
                      data.ws.send(deathMsg);
                    }
                  }

                  // Respawn after 3 seconds
                  setTimeout(() => {
                    if (!clients.has(targetId)) return;
                    target.state.health = 100;
                    target.state.alive = true;
                    target.state.ammo = 30;
                    const respawnPos = generarPosicionReaparicion();
                    target.state.posicion = respawnPos;

                    const respawnMsg = JSON.stringify({
                      type: 'player_respawn',
                      playerId: targetId,
                      position: respawnPos
                    });
                    for (const [id, data] of clients.entries()) {
                      if (data.ws.readyState === 1) {
                        data.ws.send(respawnMsg);
                      }
                    }
                  }, 3000);
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
