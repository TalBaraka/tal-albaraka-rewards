import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const name = (body?.name || "").toString().trim();
    if (!name) return Response.json({ error: "name required" }, { status: 400 });

    const base44 = createClientFromRequest(req);
    const session_id = (body?.session_id || (crypto as any).randomUUID()).toString();

    const customer = await base44.asServiceRole.entities.Customer.create({
      name,
      session_id,
      approved_count: 0
    });

    return Response.json({
      id: customer.id,
      name: customer.name,
      approved_count: 0,
      game_selected: null
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}