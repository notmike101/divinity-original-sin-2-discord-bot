import { loadEnv, config } from '../src/config.js';

loadEnv();
const { applicationId } = config();

if (!/^\d{17,20}$/.test(applicationId)) {
    throw new Error('Set DISCORD_APPLICATION_ID in private .env.');
}

console.info(`https://discord.com/oauth2/authorize?client_id=${applicationId}&scope=applications.commands&integration_type=1`);
