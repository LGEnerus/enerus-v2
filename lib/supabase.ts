import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://tpfkxxgmykyiuhfsrnsh.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwZmt4eGdteWt5aXVoZnNybnNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4MTE0MjgsImV4cCI6MjA4OTM4NzQyOH0.x_b8I-ntEL3PEHp6ZIVrk0YEmEo37pMLe_cyGJC0ZRg'

let client: ReturnType<typeof createClient> | null = null

export function getSupabase() {
  if (!client) {
    client = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        storageKey: 'enerus-auth',
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      },
    })
  }
  return client
}

export const supabase = getSupabase()