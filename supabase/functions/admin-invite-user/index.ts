// Alta de usuarios del gimnasio. Requiere ser admin del gimnasio.
//   * action "create_ci" (por defecto si llega "document"): crea la cuenta con el número de CI
//     y un PIN temporal que el admin entrega en mano; al primer ingreso se obliga a cambiarlo.
//   * action "reset_pin": genera un PIN temporal nuevo para un usuario del gimnasio.
//   * action "invite" (si llega "email"): invitación por email (flujo anterior).
// La service role key vive sólo aquí (variable de entorno de Supabase), nunca en el frontend.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const ROLES = ["admin", "accountant", "treasurer", "cashier", "trainer", "student", "prospect"];

// Las cuentas por CI usan un email técnico en un dominio reservado (RFC 2606): nunca recibe correo,
// así que nadie puede pedir un enlace de recuperación hacia esa dirección. Mantener igual que src/lib/ciAuth.ts.
const CI_EMAIL_DOMAIN = "ci.example.com";

// PIN temporal: 8 caracteres en minúscula sin ambiguos (l, o, i, 0, 1), con letras y números.
const PIN_LETTERS = "abcdefghjkmnpqrstuvwxyz";
const PIN_DIGITS = "23456789";

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

function randomFrom(alphabet: string, n: number): string[] {
  const bytes = crypto.getRandomValues(new Uint32Array(n));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]);
}

function generatePin(): string {
  const chars = [...randomFrom(PIN_LETTERS, 4), ...randomFrom(PIN_DIGITS, 4)];
  // Mezcla (Fisher–Yates) para que letras y números no queden en bloques.
  const r = crypto.getRandomValues(new Uint32Array(chars.length));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = r[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/** Igual que app.normalize_document: sin espacios ni puntos, en mayúsculas. */
function normalizeDocument(doc: string): string {
  return doc.replace(/[\s.]/g, "").toUpperCase();
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

  let body: {
    action?: string;
    gym_id?: string;
    email?: string;
    document?: string;
    full_name?: string;
    role?: string;
    student_id?: string;
    user_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Cuerpo inválido" }, 400);
  }

  const gymId = body.gym_id ?? "";
  const action = body.action ?? (body.document ? "create_ci" : "invite");

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
  // La función "Usuarios" la puede apagar el super admin.
  const { data: allowed } = await asCaller.rpc("feature_allowed", { p_gym_id: gymId, p_feature: "users" });
  if (allowed !== true) return json({ error: "Esta función está deshabilitada para su perfil" }, 403);

  const audit = (act: string, entityId: string, after: Record<string, unknown>) =>
    admin.from("audit_logs").insert({
      gym_id: gymId,
      actor_id: caller.user!.id,
      action: act,
      entity: "auth.users",
      entity_id: entityId,
      after,
    });

  // -------------------------------------------------------------------
  // Nuevo PIN temporal
  // -------------------------------------------------------------------
  if (action === "reset_pin") {
    const userId = body.user_id ?? "";
    // Sólo usuarios de este gimnasio (con algún perfil o ficha de alumno vinculada).
    const [{ data: roleRow }, { data: studentRow }] = await Promise.all([
      asCaller.from("user_gym_roles").select("id").eq("gym_id", gymId).eq("user_id", userId).limit(1).maybeSingle(),
      asCaller.from("students").select("id").eq("gym_id", gymId).eq("user_id", userId).maybeSingle(),
    ]);
    if (!roleRow && !studentRow) return json({ error: "El usuario no pertenece a este gimnasio" }, 404);
    if (userId === caller.user.id) return json({ error: "Para su propia cuenta use Mi perfil → Cambiar contraseña" }, 400);
    const [{ data: targetIsSuper }, { data: callerIsSuper }] = await Promise.all([
      asCaller.rpc("is_platform_user", { p_user_id: userId }),
      asCaller.rpc("is_platform_user", { p_user_id: caller.user.id }),
    ]);
    if (targetIsSuper && !callerIsSuper) return json({ error: "La cuenta del super admin no se puede modificar" }, 403);

    const { data: target, error: getErr } = await admin.auth.admin.getUserById(userId);
    if (getErr || !target.user) return json({ error: "Usuario inexistente" }, 404);
    const pin = generatePin();
    const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
      password: pin,
      user_metadata: { ...target.user.user_metadata, must_change_password: true },
    });
    if (updErr) return json({ error: updErr.message }, 400);
    await audit("user.pin_reset", userId, {});
    return json({ user_id: userId, pin });
  }

  const fullName = (body.full_name ?? "").trim();
  const role = body.role ?? "";
  if (fullName.length < 2) return json({ error: "Nombre requerido" }, 400);
  if (!body.student_id && !ROLES.includes(role)) return json({ error: "Rol inválido" }, 400);

  let userId: string | undefined;
  let alreadyExisted = false;
  let pin: string | undefined;

  if (action === "create_ci") {
    // -----------------------------------------------------------------
    // Alta por CI con PIN temporal
    // -----------------------------------------------------------------
    const doc = normalizeDocument(body.document ?? "");
    if (!/^[0-9A-Z-]{3,20}$/.test(doc)) return json({ error: "Número de documento inválido" }, 400);
    const email = `${doc.toLowerCase()}@${CI_EMAIL_DOMAIN}`;

    pin = generatePin();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: pin,
      email_confirm: true,
      user_metadata: { full_name: fullName, document: doc, must_change_password: true },
    });
    if (created?.user) {
      userId = created.user.id;
      await audit("user.create_ci", userId, { document: doc });
    } else if (createErr && /already|registered|exists/i.test(createErr.message)) {
      if (!body.student_id) return json({ error: `Ya existe un usuario con la CI ${doc}. Use "Nuevo PIN" en su fila.` }, 409);
      // Alumno que ya tenía cuenta: se vincula sin cambiarle el acceso.
      for (let page = 1; page <= 20 && !userId; page++) {
        const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id;
        if (data.users.length < 1000) break;
      }
      alreadyExisted = !!userId;
      pin = undefined;
    }
    if (!userId) return json({ error: createErr?.message ?? "No se pudo crear el usuario" }, 400);
  } else {
    // -----------------------------------------------------------------
    // Invitación por email
    // -----------------------------------------------------------------
    const email = (body.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Email inválido" }, 400);
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo: siteUrl ? `${siteUrl}/restablecer` : undefined,
    });
    if (invited?.user) {
      userId = invited.user.id;
    } else if (inviteErr && /already|registered|exists/i.test(inviteErr.message)) {
      // La persona ya tiene cuenta: se le asigna el perfil sin reenviar invitación.
      for (let page = 1; page <= 20 && !userId; page++) {
        const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id;
        if (data.users.length < 1000) break;
      }
      alreadyExisted = !!userId;
    }
    if (!userId) return json({ error: inviteErr?.message ?? "No se pudo invitar al usuario" }, 400);
  }

  // Acceso al portal de un alumno: vincula la ficha y asigna el perfil Alumno (RPC auditada).
  if (body.student_id) {
    const { error: linkErr } = await asCaller.rpc("link_student_user", {
      p_student_id: body.student_id,
      p_user_id: userId,
    });
    if (linkErr) {
      if (pin && !alreadyExisted) await admin.auth.admin.deleteUser(userId); // no dejar cuentas a medias
      return json({ error: linkErr.message }, 400);
    }
    return json({ user_id: userId, already_existed: alreadyExisted, pin });
  }

  // Asigna el rol con la RPC auditada, en nombre del admin solicitante.
  const { error: setErr } = await asCaller.rpc("admin_set_user_role", {
    p_gym_id: gymId,
    p_user_id: userId,
    p_role: role,
    p_enabled: true,
  });
  if (setErr) {
    if (pin && !alreadyExisted) await admin.auth.admin.deleteUser(userId); // no dejar cuentas a medias
    return json({ error: setErr.message }, 400);
  }

  return json({ user_id: userId, already_existed: alreadyExisted, pin });
});
