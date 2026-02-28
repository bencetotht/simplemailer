import { LoggerService, Injectable, ConsoleLogger } from '@nestjs/common';
import { WebsocketGateway } from './websocket.gateway';

// WebSocket Logger that broadcasts logs to connected clients
class WSLogger {
  info(message: string, ...optionalParams: any[]) {
    WebsocketGateway.broadcastLog('info', message, ...optionalParams);
  }

  error(message: string, ...optionalParams: any[]) {
    WebsocketGateway.broadcastLog('error', message, ...optionalParams);
  }

  warn(message: string, ...optionalParams: any[]) {
    WebsocketGateway.broadcastLog('warn', message, ...optionalParams);
  }

  debug(message: string, ...optionalParams: any[]) {
    WebsocketGateway.broadcastLog('debug', message, ...optionalParams);
  }

  verbose(message: string, ...optionalParams: any[]) {
    WebsocketGateway.broadcastLog('verbose', message, ...optionalParams);
  }

  fatal(message: string, ...optionalParams: any[]) {
    WebsocketGateway.broadcastLog('fatal', message, ...optionalParams);
  }
}

@Injectable()
export class CustomLogger implements LoggerService {
  private nestLogger = new ConsoleLogger();
  private wsLogger = new WSLogger();

  constructor() {}

  log(message: any, ...optionalParams: any[]) {
    this.nestLogger.log(message, ...optionalParams);
    this.wsLogger.info(`[${optionalParams[0]}] ${message}`);
  }

  fatal(message: any, ...optionalParams: any[]) {
    this.nestLogger.error(message, ...optionalParams);
    this.wsLogger.fatal(`[${optionalParams[0]}] ${message}`);
  }

  error(message: any, ...optionalParams: any[]) {
    this.nestLogger.error(message, ...optionalParams);
    this.wsLogger.error(`[${optionalParams[0]}] ${message}`);
  }

  warn(message: any, ...optionalParams: any[]) {
    this.nestLogger.warn(message, ...optionalParams);
    this.wsLogger.warn(`[${optionalParams[0]}] ${message}`);
  }

  debug?(message: any, ...optionalParams: any[]) {
    this.nestLogger.debug(message, ...optionalParams);
    this.wsLogger.debug(`[${optionalParams[0]}] ${message}`);
  }

  verbose?(message: any, ...optionalParams: any[]) {
    this.nestLogger.verbose(message, ...optionalParams);
    this.wsLogger.verbose(`[${optionalParams[0]}] ${message}`);
  }
}
