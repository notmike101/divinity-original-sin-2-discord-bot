import { REST, Routes } from 'discord.js';
import { command } from '../src/commands.js';
import { loadEnv, config } from '../src/config.js';

loadEnv();
const cfg = config();

if (!cfg.token || !/^\d{17,20}$/.test(cfg.applicationId)) {
    throw new Error('Set local DISCORD_TOKEN and DISCORD_APPLICATION_ID before registration.');
}

try {
    const rest = new REST({ version: '10' }).setToken(cfg.token);

    await rest.post(Routes.applicationCommands(cfg.applicationId), { body: command });
    console.info('Global /dos2 upserted; unrelated commands preserved.');
} catch {
    console.error('Registration failed. Check application credentials and User Install configuration.'); process.exitCode = 1;
}
