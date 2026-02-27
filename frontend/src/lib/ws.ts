export function connectProjectWS(projectId: number, token: string, onMessage: (data: any) => void) {
  const wsBase = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";
  const socket = new WebSocket(`${wsBase}/ws/projects/${projectId}?token=${encodeURIComponent(token)}`);

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    onMessage(data);
  };

  return socket;
}
