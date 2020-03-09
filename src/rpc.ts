import { appLogger } from './logging';

const logger = appLogger.child({ module: 'rpc' });

export class JsonRpcError extends Error {
  code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = 'JsonRpcError';
    this.code = code;
  }
}

export function createRpcHandler(
  handleCallAsync: (method: string, params: object | any[]) => Promise<any>,
  send: (data: string) => void,
) {
  return function handleMessage(message: any) {
    let data: any;

    try {
      if (typeof message !== 'string') {
        throw new Error();
      }

      data = JSON.parse(message);
    } catch {
      send(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32700,
            message: 'Parse error',
          },
        }),
      );

      return;
    }

    if (
      !data ||
      typeof data !== 'object' ||
      data.jsonrpc !== '2.0' ||
      typeof data.method !== 'string' ||
      !['array', 'object', 'undefined'].includes(typeof data.params) ||
      data.params === null
    ) {
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32600,
          message: 'Invalid Request',
        },
      });

      return;
    }

    const callLogger = logger.child({ id: data.id, method: data.method });

    callLogger.info('Handling JSON-RPC call');

    handleCallAsync(data.method, data.params).then(
      (result: any) => {
        logger.info('Success.');

        if ('id' in data) {
          send(
            JSON.stringify({
              jsonrpc: '2.0',
              id: data.id,
              result: result ?? null,
            }),
          );
        }
      },
      (err: any) => {
        logger.error({ err }, 'Error.');

        if ('id' in data) {
          send(
            JSON.stringify({
              jsonrpc: '2.0',
              id: data.id,
              error:
                err instanceof JsonRpcError
                  ? {
                      code: err.code,
                      message: err.message,
                    }
                  : {
                      code: -32603,
                      message: 'Internal error',
                    },
            }),
          );
        }
      },
    );
  };
}
