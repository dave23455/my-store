import fs from 'fs';
import { pool } from '../config/db.js';

const legacy = await pool.query("SELECT 1 FROM information_schema.columns WHERE table_name='store_settings' AND column_name='data'");
if (!legacy.rowCount) {
	const table = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_name='store_settings'");
	if (table.rowCount) {
		await pool.query('ALTER TABLE store_settings RENAME TO store_settings_legacy');
	}
}

const sql = fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8').replace(/^\uFEFF/, '');
await pool.query(sql);

const oldSettings = await pool.query("SELECT * FROM information_schema.tables WHERE table_name='store_settings_legacy'");
if (oldSettings.rowCount) {
	const values = await pool.query('SELECT * FROM store_settings_legacy ORDER BY id DESC LIMIT 1');
	if (values.rowCount) {
		const row = values.rows[0];
		const settings = Object.fromEntries(Object.entries(row).filter(([key]) => !['id', 'created_at', 'updated_at'].includes(key) && row[key] !== null));
		await pool.query('INSERT INTO store_settings(id,data) VALUES(1,$1) ON CONFLICT(id) DO NOTHING', [JSON.stringify(settings)]);
	}
	await pool.query('DROP TABLE store_settings_legacy');
}

console.log('Database migrated');
await pool.end();
