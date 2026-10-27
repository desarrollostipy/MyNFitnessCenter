// Invita a un usuario por email y le asigna un rol. Requiere ser admin del gimnasio.
// La service role key vive sólo aquí (variable de entorno de Supabase), nunca en el frontend.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const ROLES = ["admin", "accountant", "treasurer", "trainer", "student", "prospect"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const siteUrl = Deno.env.get("SITE_URL") ?? "";

  // Cliente con el JWT del solicitante: la verificación de admin la hace la base (RLS/funciones).
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const admin = createClient(url, serviceKey);

  let body: { gym_id?: string; email?: string; full_name?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Cuerpo inválido" }, 400);
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const fullName = (body.full_name ?? "").trim();
  const gymId = body.gym_id ?? "";
  const role = body.role ?? "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Email inválido" }, 400);
  if (fullName.length < 2) return json({ error: "Nombre requerido" }, 400);
  if (!ROLES.includes(role)) return json({ error: "Rol inválido" }, 400);

  const { data: caller } = await asCaller.auth.getUser();
  if (!caller.user) return json({ error: "No autenticado" }, 401);
  const { data: adminRow } = await asCaller
    .from("user_gym_roles")
    .select("id")
    .eq("user_id", caller.user.id)
    .eq("gym_id", gymId)
    .eq("role", "admin")
    .maybeSingle();
  if (!adminRow) return json({ error: "No autorizado" }, 403);

  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: siteUrl ? `${siteUrl}/restablecer` : undefined,
  });
  if (inviteErr || !invited.user) {
    return json({ error: inviteErr?.message ?? "No se pudo invitar al usuario" }, 400);
  }

  // Asigna el rol con la RPC auditada, en nombre del admin solicitante.
  const { error: setErr } = await asCaller.rpc("admin_set_user_role", {
    p_gym_id: gymId,
    p_user_id: invited.user.id,
    p_role: role,
    p_enabled: true,
  });
  if (setErr) return json({ error: setErr.message }, 400);

  return json({ user_id: invited.user.id });
});
