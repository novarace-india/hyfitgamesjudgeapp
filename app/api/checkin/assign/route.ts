import { requireUser } from "../../../../lib/auth.server";
import { transaction } from "../../../../lib/db";

type AssignmentBody = { participantId?: unknown; wristbandCode?: unknown; transponderCode?: unknown; desk?: unknown; reason?: unknown };

export async function POST(request: Request) {
  const auth = await requireUser(request, ["super_admin","event_admin","checkin"]);
  if ("error" in auth) return auth.error;
  const body = await request.json() as AssignmentBody;
  const participantId = String(body.participantId ?? "");
  const wristband = String(body.wristbandCode ?? "").trim();
  const transponder = String(body.transponderCode ?? "").trim();
  if (!participantId || !wristband || !transponder || wristband === transponder) {
    return Response.json({ error: "Participant, distinct wristband, and Transponder1 codes are required" }, { status: 400 });
  }

  try {
    const result = await transaction(async (client) => {
      const participantResult = await client.query<{ bib: string }>(
        "SELECT bib FROM participants WHERE id=$1 AND event_id=$2 FOR UPDATE",
        [participantId, auth.user.eventId],
      );
      const participant = participantResult.rows[0];
      if (!participant) throw Object.assign(new Error("Participant not found"), { status: 404 });

      await client.query(
        `UPDATE asset_assignments SET active=false,released_at=now(),reason=COALESCE($3,reason)
          WHERE event_id=$1 AND participant_id=$2 AND active`,
        [auth.user.eventId, participantId, String(body.reason ?? "") || null],
      );
      await client.query(
        `INSERT INTO asset_assignments(event_id,participant_id,asset_type,asset_code,assigned_by,reason)
         VALUES($1,$2,'wristband',$3,$5,$6),($1,$2,'transponder1',$4,$5,$6)`,
        [auth.user.eventId, participantId, wristband, transponder, auth.user.id, String(body.reason ?? "") || null],
      );
      const checkin = await client.query<{ id: string }>(
        `INSERT INTO checkins(event_id,participant_id,volunteer_id,desk,state)
         VALUES($1,$2,$3,$4,'pending_sync') RETURNING id`,
        [auth.user.eventId, participantId, auth.user.id, String(body.desk ?? "")],
      );
      const config = await client.query<{ update_mapping: Record<string, string> }>(
        `SELECT update_mapping FROM event_configs WHERE event_id=$1 AND state='published' ORDER BY version DESC LIMIT 1`,
        [auth.user.eventId],
      );
      const mapping = config.rows[0]?.update_mapping ?? {};
      const values: Array<[string, string]> = [
        [mapping.checkinStatus ?? "checkinstatus", "1"],
        [mapping.wristband ?? "wristbandid", wristband],
        [mapping.transponder1 ?? "transponder1", transponder],
      ];
      for (const [field, value] of values) {
        await client.query(
          `INSERT INTO outbox_operations(operation_key,event_id,participant_id,bib,field_name,value)
           VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(operation_key) DO NOTHING`,
          [`checkin:${checkin.rows[0].id}:${field}`, auth.user.eventId, participantId, participant.bib, field, value],
        );
      }
      await client.query("UPDATE participants SET checkin_state='pending_sync',updated_at=now() WHERE id=$1", [participantId]);
      await client.query(
        `INSERT INTO audit_events(actor_id,event_id,action,entity_type,entity_id,details)
         VALUES($1,$2,'checkin.complete','participant',$3,$4::jsonb)`,
        [auth.user.id, auth.user.eventId, participantId, JSON.stringify({ wristband, transponder, desk: body.desk })],
      );
      return { checkinId: checkin.rows[0].id, bib: participant.bib };
    });
    return Response.json({ ...result, state: "pending_sync" }, { status: 201 });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") return Response.json({ error: "This wristband or transponder is already assigned" }, { status: 409 });
    const status = (error as { status?: number }).status ?? 500;
    return Response.json({ error: status === 500 ? "Check-in could not be completed" : (error as Error).message }, { status });
  }
}
