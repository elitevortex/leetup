import { createClient, SupabaseClient, User } from 'npm:@supabase/supabase-js@2.104.1';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
}

// Errors carry a stable `error` code for the app plus a message people can read
export function fail(status: number, error: string, message: string): Response {
  return json({ error, message }, status);
}

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
}

export async function requireUser(req: Request): Promise<User | null> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await adminClient().auth.getUser(token);
  return error ? null : data.user;
}

// Wraps a handler with CORS preflight, POST-only and a JSON body
export function serve(handler: (req: Request, body: Record<string, unknown>) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST.');
    let body: Record<string, unknown> = {};
    try {
      const text = await req.text();
      body = text ? JSON.parse(text) : {};
    } catch {
      return fail(400, 'bad_json', 'The request body must be JSON.');
    }
    try {
      return await handler(req, body);
    } catch (e) {
      console.error(e);
      return fail(500, 'server_error', 'Something went wrong on our side. Try again in a moment.');
    }
  });
}
