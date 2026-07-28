import { scryptSync, randomBytes } from "node:crypto";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const pin = process.env.BOOTSTRAP_ADMIN_PIN ?? "2468";
const salt = randomBytes(16).toString("hex");
const pinHash = `scrypt:${salt}:${scryptSync(pin, salt, 64).toString("hex")}`;
const pool = new pg.Pool({ connectionString: databaseUrl, options: "-c search_path=hyfit_ops,public" });
try {
  const event = await pool.query(
    `INSERT INTO events(name,venue,status,is_active) VALUES('HYFIT Games Bengaluru','Manpho Convention Centre','ready',true)
     ON CONFLICT DO NOTHING RETURNING id`,
  );
  const active = event.rows[0] ?? (await pool.query("SELECT id FROM events WHERE is_active=true LIMIT 1")).rows[0];
  await pool.query(
    `INSERT INTO users(staff_id,name,pin_hash,role,event_id,must_change_pin)
     VALUES('ADMIN','HYFIT Event Admin',$1,'super_admin',$2,false)
     ON CONFLICT(staff_id) DO UPDATE SET event_id=EXCLUDED.event_id`,
    [pinHash, active.id],
  );
  for (const participant of [
    ["25645","Riya Sharma","Female Open","Wave 12 · 09:40"],
    ["25646","Rishabh Shah","Male Open","Wave 12 · 09:40"],
    ["30821","Arjun Menon","Male Pro","Wave 14 · 10:20"],
    ["17204","Meera & Tara","Female Doubles","Wave 08 · 08:20"],
    ["10483","Aarav Rao","NextGen Boys","Wave 03 · 16:30"],
  ]) {
    await pool.query(
      `INSERT INTO participants(event_id,bib,name,category,wave,last_source_sync_at)
       VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT(event_id,bib) DO UPDATE SET name=EXCLUDED.name,category=EXCLUDED.category,wave=EXCLUDED.wave`,
      [active.id,...participant],
    );
  }
  for (const [staffId,name,role] of [["CHECKIN1","Main Gate Volunteer","checkin"],["JUDGE1","Floor Judge 1","judge"]]) {
    await pool.query(
      `INSERT INTO users(staff_id,name,pin_hash,role,event_id,must_change_pin)
       VALUES($1,$2,$3,$4,$5,false) ON CONFLICT(staff_id) DO UPDATE SET event_id=EXCLUDED.event_id`,
      [staffId,name,pinHash,role,active.id],
    );
  }
  const admin = (await pool.query("SELECT id FROM users WHERE staff_id='ADMIN'")).rows[0];
  const volunteer = (await pool.query("SELECT id FROM users WHERE staff_id='CHECKIN1'")).rows[0];
  const station = await pool.query(
    `INSERT INTO checkin_stations(event_id,code,name,created_by)
     VALUES($1,'C01','Main Gate',$2)
     ON CONFLICT DO NOTHING RETURNING id`,
    [active.id, admin.id],
  );
  const stationId = station.rows[0]?.id ?? (await pool.query(
    "SELECT id FROM checkin_stations WHERE event_id=$1 AND lower(code)='c01'",
    [active.id],
  )).rows[0].id;
  await pool.query(
    `INSERT INTO checkin_station_assignments(event_id,station_id,volunteer_id,assigned_by)
     SELECT $1,$2,$3,$4 WHERE NOT EXISTS(
       SELECT 1 FROM checkin_station_assignments
       WHERE event_id=$1 AND volunteer_id=$3 AND released_at IS NULL
     )`,
    [active.id, stationId, volunteer.id, admin.id],
  );
  process.stdout.write(`Bootstrap login: ADMIN / ${pin}\n`);
  process.stdout.write(`Demo logins: CHECKIN1 / ${pin}, JUDGE1 / ${pin}\n`);
} finally {
  await pool.end();
}
