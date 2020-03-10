import { promises as fs } from 'fs';
import { appLogger } from './logging';

const logger = appLogger.child({ module: 'dbLoader' });

export const currentDbVer = 3;

export async function loadDb(): Promise<DbSchema> {
  try {
    const data = (await fs.readFile('db.json', {
      encoding: 'UTF-8',
    })) as string;

    const value = JSON.parse(data);

    if (value && typeof value === 'object' && value.version === currentDbVer) {
      return value;
    }
  } catch (err) {
    logger.warn({ err }, 'Error loading store.');
  }

  return {
    rooms: {},
    userDataMap: {},
  };
}
