import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { handleAuthenticatedJsonRequest } from '../_shared/authenticated-request.ts';

const ALLOWED_ORIGINS = new Set([
  'https://mamingsuper.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

async function handle(req: Request): Promise<Response> {
  const supabaseUrl = env('SUPABASE_URL').replace(/\/$/, '');
  const publishableKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY')?.trim() || env('SUPABASE_ANON_KEY');
  return handleAuthenticatedJsonRequest(req, {
    allowedOrigins: ALLOWED_ORIGINS,
    async authenticate(token) {
      const userClient = createClient(supabaseUrl, publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data, error } = await userClient.auth.getUser(token);
      if (error) return null;
      return data.user ? { id: data.user.id } : null;
    },
    async persist(values) {
      const secretKey = Deno.env.get('SUPABASE_SECRET_KEY')?.trim() || env('SUPABASE_SERVICE_ROLE_KEY');
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/save_analysis_session`, {
        method: 'POST',
        headers: {
          apikey: secretKey,
          ...(!secretKey.startsWith('sb_') ? { Authorization: `Bearer ${secretKey}` } : {}),
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(values),
      });
      if (!response.ok) throw new Error('save_failed');
      const sessionId = await response.json();
      if (typeof sessionId !== 'string') throw new Error('save_failed');
      return sessionId;
    },
  });
}

Deno.serve(handle);
