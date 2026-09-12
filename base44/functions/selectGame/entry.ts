import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const customer_id = body?.customer_id;
    const game_key = body?.game_key;
    if (!customer_id || !game_key) {
      return Response.json({ error: "customer_id and game_key required" }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const sr = base44.asServiceRole;

    const customer = await sr.entities.Customer.get(customer_id);
    if (!customer) return Response.json({ error: "customer not found" }, { status: 404 });

    if ((customer.approved_count || 0) < 4) {
      return Response.json({ error: "لم تكمل 4 فواتير معتمدة بعد" }, { status: 403 });
    }

    const updated = await sr.entities.Customer.update(customer_id, { game_selected: game_key });

    return Response.json({
      id: updated.id,
      name: updated.name,
      approved_count: updated.approved_count,
      game_selected: updated.game_selected
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}