import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wbmzkashqwhyyyrpzztq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndibXprYXNocXdoeXl5cnB6enRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzE1Mjc2ODAsImV4cCI6MjA0NzEwMzY4MH0.Bql3bppe5QrgVzd1CfcEZ8BsOxpZqIJFopnqZ1ppfSA'
export let supabase = createClient(supabaseUrl, supabaseKey);