import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class WebsocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebsocketGateway.name);
  
  private static instance: WebsocketGateway;

  afterInit(server: Server) {
    WebsocketGateway.instance = this;
    this.logger.log('WebSocket Gateway initialized');
  }

  handleConnection(client: Socket, ...args: any[]) {
    this.logger.log(`Client connected: ${client.id}`);
    
    // Send initial connection message
    client.emit('connected', { 
      message: 'Connected to Mailer Worker', 
      clientId: client.id,
      timestamp: new Date().toISOString()
    });
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('ping')
  handlePing(client: Socket, payload: any) {
    this.logger.log(`Ping received from ${client.id}`);
    client.emit('pong', { 
      message: 'Pong!', 
      timestamp: new Date().toISOString(),
      payload 
    });
  }

  @SubscribeMessage('subscribe_logs')
  handleSubscribeLogs(client: Socket, payload: any) {
    this.logger.log(`Client ${client.id} subscribed to logs`);
    client.join('logs');
    client.emit('subscribed', { 
      channel: 'logs', 
      message: 'Successfully subscribed to logs' 
    });
  }

  @SubscribeMessage('unsubscribe_logs')
  handleUnsubscribeLogs(client: Socket, payload: any[]) {
    this.logger.log(`Client ${client.id} unsubscribed from logs`);
    client.leave('logs');
    client.emit('unsubscribed', { 
      channel: 'logs', 
      message: 'Successfully unsubscribed from logs' 
    });
  }

  // Method to broadcast logs to all connected clients
  broadcastLog(level: string, message: string, ...optionalParams: any[]) {
    // console.log('Broadcasting log', level, message, optionalParams);
    if (this.server) {
      this.server.emit('log', {
        level,
        message,
        timestamp: new Date().toISOString(),
        ...optionalParams
      });
    }
  }

  // Static method to broadcast logs from anywhere
  static broadcastLog(level: string, message: string, ...optionalParams: any[]) {
    if (WebsocketGateway.instance) {
      WebsocketGateway.instance.broadcastLog(level, message, ...optionalParams);
    }
  }
}
