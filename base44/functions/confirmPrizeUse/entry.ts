import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { customerState } from "../../shared/customerState.ts";

export default async function(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const customer_id = body?.customer_id;
    if (!customer_id) return Response.json({ error: "customer_id required" }, { status: 400 });

    const base44 = createClientFromRequest(req);
    const sr = base44.asServiceRole;

    const customer = await sr.entities.Customer.get(customer_id);
    if (!customer) return Response.json({ error: "customer not found" }, { status: 404 });

    const state = customerState(customer);
    if (state.prize_status === "used") {
      return Response.json({ error: "تم استخدام الجائزة من قبل" }, { status: 403 });
    }
    if (state.prize_status === "expired") {
      return Response.json({ error: "انتهت صلاحية الجائزة" }, { status: 403 });
    }
    if (state.prize_status === "none") {
      return Response.json({ error: "لا توجد جائزة متاحة" }, { status: 403 });
    }
    if (!state.game_selected) {
      return Response.json({ error: "اختر اللعبة أولاً" }, { status: 400 });
    }

    const updated = await sr.entities.Customer.update(customer_id, {
      prize_status: "used",
      prize_used_at: new Date().toISOString()
    });

    return Response.json(customerState(updated));
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}