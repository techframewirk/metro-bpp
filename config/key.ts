import config from 'nconf';

const key = config.file(`${__dirname}/key_store.json`);

export default key;