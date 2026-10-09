import packageInfo from '../../package.json';

/** Identity of this build. */
export const APP_NAME = 'Modelador de Sistemas';
/** Read from package.json, the single source of the app version. */
export const APP_VERSION: string = packageInfo.version;
